const db = require('../config/db');
const logger = require('../utils/logger');
const { istDateStr, istDateTimeStr, istHour, istMinute } = require('../utils/dateUtils');
const { employeeTaskColor, internTaskColor, projectColor } = require('../utils/statusColor');
const { computeEodStatus } = require('../utils/eodStatus');

// Mirrors middleware/auth.js's requireAdmin role list.
const ADMIN_ROLES = ['admin', 'superadmin', 'super admin', 'batch admin', 'domain admin', 'reviewer', 'task-manager'];
const isAdminRole = (role) => ADMIN_ROLES.includes((role || '').toLowerCase());

// mysql2 returns DATE/DATETIME columns as JS Date objects by default (no
// dateStrings option set on the pool) — normalize everything to 'YYYY-MM-DD'
// strings before comparing or returning, so date-range filtering never
// silently coerces a Date against a string.
const toDateStr = (v) => {
    if (!v) return null;
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    return String(v).slice(0, 10);
};

const addDays = (dateStr, days) => {
    const d = new Date(dateStr + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
};

// ─────────────────────────────────────────────
// Assignee resolution for `projects` (fixes the pre-existing gap where
// assigned_to_type = 'Employee' resolved to a NULL assignee name)
// ─────────────────────────────────────────────
const PROJECT_ASSIGNEE_CASE = `
    CASE p.assigned_to_type
        WHEN 'Admin' THEN (SELECT name FROM admins WHERE admin_id = p.assigned_to_id)
        WHEN 'Individual' THEN (SELECT name FROM interns WHERE intern_id = p.assigned_to_id)
        WHEN 'Employee' THEN (SELECT name FROM interns WHERE intern_id = p.assigned_to_id)
    END AS assignee_name
`;

async function fetchProjects(scope) {
    if (scope.type === 'admin') {
        const [rows] = await db.execute(
            `SELECT p.*, ${PROJECT_ASSIGNEE_CASE} FROM projects p ORDER BY p.created_at DESC`
        );
        return rows;
    }
    if (scope.type === 'employee') {
        const [rows] = await db.execute(
            `SELECT p.*, ${PROJECT_ASSIGNEE_CASE} FROM projects p
             WHERE (p.assigned_to_type IN ('Employee','Individual') AND p.assigned_to_id = ?)
                OR p.id IN (SELECT DISTINCT project_id FROM employee_tasks WHERE assigned_to = ? AND project_id IS NOT NULL)
             ORDER BY p.created_at DESC`,
            [scope.userId, scope.userId]
        );
        return rows;
    }
    // intern
    const [rows] = await db.execute(
        `SELECT p.*, ${PROJECT_ASSIGNEE_CASE} FROM projects p
         WHERE (p.assigned_to_type = 'Individual' AND p.assigned_to_id = ?)
            OR p.id IN (SELECT DISTINCT project_id FROM tasks WHERE project_id IS NOT NULL
                        AND task_id IN (
                            SELECT ta.task_id FROM task_assignments ta WHERE ta.intern_id = ?
                        ))
         ORDER BY p.created_at DESC`,
        [scope.userId, scope.userId]
    );
    return rows;
}

// ─────────────────────────────────────────────
// employee_tasks → Gantt bars
// ─────────────────────────────────────────────
async function fetchEmployeeTaskBars(scope, filters) {
    if (scope.type === 'intern') return [];

    const where = ['1=1'];
    const params = [];
    if (scope.type === 'employee') {
        where.push('t.assigned_to = ?');
        params.push(scope.userId);
    }
    if (filters.assigneeId) { where.push('t.assigned_to = ?'); params.push(filters.assigneeId); }
    if (filters.status) { where.push('t.status = ?'); params.push(filters.status); }
    if (filters.priority) { where.push('t.priority = ?'); params.push(filters.priority); }
    if (filters.projectId) { where.push('t.project_id = ?'); params.push(filters.projectId); }

    const [rows] = await db.execute(
        `SELECT t.id, t.title, t.description, t.assigned_to, t.assigned_by, t.priority, t.status,
                t.start_date, t.deadline, t.progress_percent, t.project_id, t.created_at,
                i.name AS assignee_name
         FROM employee_tasks t
         LEFT JOIN interns i ON i.intern_id = t.assigned_to
         WHERE ${where.join(' AND ')}
         ORDER BY t.created_at DESC`,
        params
    );

    return rows.map(t => {
        const start = toDateStr(t.start_date) || toDateStr(t.created_at);
        return {
        id: `et-${t.id}`,
        sourceType: 'employee_task',
        sourceId: t.id,
        projectId: t.project_id,
        title: t.title,
        description: t.description,
        assignee: { id: t.assigned_to, name: t.assignee_name, role: 'employee' },
        start,
        end: toDateStr(t.deadline) || start,
        rawStatus: t.status,
        colorStatus: employeeTaskColor(t.status),
        progressPercent: t.progress_percent || 0,
        priority: t.priority,
        isSyntheticAssignee: false,
        };
    });
}

// ─────────────────────────────────────────────
// intern `tasks` → Gantt bars (self scope: exact visibility rules from
// task.controller.js's getTasksByDomain; admin scope: bounded fan-out —
// one bar per real submission, plus a single placeholder bar for
// batch/group-wide tasks nobody has touched yet, to avoid exploding into
// one row per intern in the batch)
// ─────────────────────────────────────────────
async function fetchInternTaskBars(scope, filters) {
    if (scope.type === 'employee') return [];

    if (scope.type === 'intern') {
        const [internRows] = await db.execute(
            'SELECT name, domain_id, batch, intern_type FROM interns WHERE intern_id = ?',
            [scope.userId]
        );
        if (!internRows.length) return [];
        const intern = internRows[0];
        let batchId = parseInt(intern.batch);
        if (isNaN(batchId)) {
            const [activeBatch] = await db.execute('SELECT id FROM batch WHERE is_active = 1 LIMIT 1');
            if (!activeBatch.length) return [];
            batchId = activeBatch[0].id;
        }

        const where = ['t.domain_id = ?', 't.batch = ?', `(
                t.assignment_range = 'all'
                OR (t.assignment_range = 'group' AND t.target_group = ?)
                OR (t.assignment_range = 'individual' AND EXISTS (SELECT 1 FROM task_assignments ta WHERE ta.task_id = t.task_id AND ta.intern_id = ?))
            )`];
        const params = [scope.userId, intern.domain_id, batchId, intern.intern_type, scope.userId];
        if (filters.projectId) { where.push('t.project_id = ?'); params.push(filters.projectId); }

        const [rows] = await db.execute(
            `SELECT t.task_id, t.title, t.description, t.deadline, t.start_date, t.project_id,
                    t.domain_id, d.name AS domain_name, t.created_at,
                    its.status AS sub_status, its.progress AS sub_progress, its.approved_progress
             FROM tasks t
             LEFT JOIN domains d ON d.domain_id = t.domain_id
             LEFT JOIN intern_task_submissions its ON its.task_id = t.task_id AND its.intern_id = ?
             WHERE ${where.join(' AND ')}
             ORDER BY t.created_at DESC`,
            params
        );

        return rows.map(t => buildInternTaskBar(t, { id: scope.userId, name: intern.name }));
    }

    // admin scope
    const where = ['1=1'];
    const params = [];
    if (filters.projectId) { where.push('t.project_id = ?'); params.push(filters.projectId); }

    const [tasks] = await db.execute(
        `SELECT t.task_id, t.title, t.description, t.deadline, t.start_date, t.project_id,
                t.domain_id, d.name AS domain_name, t.assignment_range, t.target_group, t.created_at
         FROM tasks t
         LEFT JOIN domains d ON d.domain_id = t.domain_id
         WHERE ${where.join(' AND ')}
         ORDER BY t.created_at DESC`,
        params
    );
    if (!tasks.length) return [];

    const taskIds = tasks.map(t => t.task_id);
    const placeholders = taskIds.map(() => '?').join(',');

    const [submissions] = await db.execute(
        `SELECT its.task_id, its.intern_id, its.status, its.progress, its.approved_progress, i.name
         FROM intern_task_submissions its
         JOIN interns i ON i.intern_id = its.intern_id
         WHERE its.task_id IN (${placeholders})`,
        taskIds
    );
    const submissionsByTask = new Map();
    for (const s of submissions) {
        if (!submissionsByTask.has(s.task_id)) submissionsByTask.set(s.task_id, []);
        submissionsByTask.get(s.task_id).push(s);
    }

    const bars = [];
    for (const t of tasks) {
        const subs = submissionsByTask.get(t.task_id) || [];
        if (subs.length) {
            for (const s of subs) {
                bars.push(buildInternTaskBar(t, { id: s.intern_id, name: s.name }, s));
            }
        } else {
            const label = t.assignment_range === 'group' ? `Group: ${t.target_group}` : 'All Interns';
            bars.push(buildInternTaskBar(t, { id: null, name: label }, null, true));
        }
    }
    return bars;
}

function buildInternTaskBar(t, assignee, sub, isPlaceholder = false) {
    const subStatus = sub ? sub.status : (t.sub_status !== undefined ? t.sub_status : null);
    const subProgress = sub ? sub.progress : t.sub_progress;
    const approvedProgress = sub ? sub.approved_progress : t.approved_progress;
    const progress = subStatus === 'approved' ? (approvedProgress ?? 100) : (subProgress || 0);
    const startDate = toDateStr(t.start_date) || toDateStr(t.created_at);
    return {
        id: `t-${t.task_id}-${assignee.id ?? 'group'}`,
        sourceType: 'intern_task',
        sourceId: t.task_id,
        projectId: t.project_id,
        domainId: t.domain_id,
        domainName: t.domain_name,
        title: t.title,
        description: t.description,
        assignee: { id: assignee.id, name: assignee.name, role: 'intern' },
        start: startDate,
        end: toDateStr(t.deadline) || startDate,
        rawStatus: subStatus,
        colorStatus: internTaskColor(subStatus),
        progressPercent: progress,
        priority: null,
        isSyntheticAssignee: isPlaceholder,
    };
}

// ─────────────────────────────────────────────
// Assemble groups[] — real projects + synthetic "Unassigned" buckets
// ─────────────────────────────────────────────
function assembleGroups(projects, employeeBars, internBars, filters) {
    const groupsByProjectId = new Map();
    for (const p of projects) {
        groupsByProjectId.set(p.id, {
            id: p.id,
            title: p.title,
            rawStatus: p.status,
            colorStatus: projectColor(p.status),
            deadline: p.deadline,
            assigneeName: p.assignee_name,
            isSynthetic: false,
            tasks: [],
        });
    }
    const unassignedEmployee = { id: null, title: 'Unassigned (Employee Tasks)', isSynthetic: true, tasks: [] };
    const domainBuckets = new Map();

    const passesFilters = (bar) => {
        if (filters.status && bar.rawStatus !== filters.status) return false;
        if (filters.assigneeId && String(bar.assignee.id) !== String(filters.assigneeId)) return false;
        if (filters.startDate && bar.end < filters.startDate) return false;
        if (filters.endDate && bar.start > filters.endDate) return false;
        return true;
    };

    const place = (bar) => {
        if (!passesFilters(bar)) return;
        if (bar.projectId && groupsByProjectId.has(bar.projectId)) {
            groupsByProjectId.get(bar.projectId).tasks.push(bar);
        } else if (bar.sourceType === 'employee_task') {
            unassignedEmployee.tasks.push(bar);
        } else {
            const key = bar.domainId ?? 'none';
            if (!domainBuckets.has(key)) {
                domainBuckets.set(key, { id: null, title: `Unassigned (${bar.domainName || 'General'})`, isSynthetic: true, tasks: [] });
            }
            domainBuckets.get(key).tasks.push(bar);
        }
    };

    if (!filters.taskType || filters.taskType === 'all' || filters.taskType === 'employee_task') {
        employeeBars.forEach(place);
    }
    if (!filters.taskType || filters.taskType === 'all' || filters.taskType === 'intern_task') {
        internBars.forEach(place);
    }

    const groups = [...groupsByProjectId.values()];
    for (const g of groups) {
        g.completionPercent = g.tasks.length
            ? Math.round(g.tasks.reduce((sum, t) => sum + (t.progressPercent || 0), 0) / g.tasks.length)
            : 0;
    }
    if (unassignedEmployee.tasks.length) groups.push(unassignedEmployee);
    for (const bucket of domainBuckets.values()) {
        if (bucket.tasks.length) groups.push(bucket);
    }
    return groups;
}

async function buildGanttResponse(scope, filters) {
    const [projects, employeeBars, internBars] = await Promise.all([
        fetchProjects(scope),
        fetchEmployeeTaskBars(scope, filters),
        fetchInternTaskBars(scope, filters),
    ]);
    const groups = assembleGroups(projects, employeeBars, internBars, filters);
    return { range: { start: filters.startDate, end: filters.endDate }, groups };
}

function parseFilters(query) {
    const today = istDateStr();
    return {
        startDate: query.startDate || addDays(today, -30),
        endDate: query.endDate || addDays(today, 60),
        projectId: query.projectId ? parseInt(query.projectId) : null,
        status: query.status || null,
        priority: query.priority || null,
        assigneeId: query.assigneeId || null,
        taskType: query.taskType || 'all',
    };
}

// ─────────────────────────────────────────────
// GET /api/gantt/admin/overview
// ─────────────────────────────────────────────
exports.getAdminOverview = async (req, res) => {
    try {
        const data = await buildGanttResponse({ type: 'admin' }, parseFilters(req.query));
        res.json({ status: 'success', data });
    } catch (err) {
        logger.error('getAdminOverview failed', { error: err.message });
        res.status(500).json({ status: 'error', message: 'Server error' });
    }
};

// ─────────────────────────────────────────────
// GET /api/gantt/employee/mine
// ─────────────────────────────────────────────
exports.getEmployeeMine = async (req, res) => {
    try {
        const data = await buildGanttResponse({ type: 'employee', userId: req.user.id }, parseFilters(req.query));
        res.json({ status: 'success', data });
    } catch (err) {
        logger.error('getEmployeeMine failed', { intern_id: req.user.id, error: err.message });
        res.status(500).json({ status: 'error', message: 'Server error' });
    }
};

// ─────────────────────────────────────────────
// GET /api/gantt/intern/mine
// ─────────────────────────────────────────────
exports.getInternMine = async (req, res) => {
    try {
        const data = await buildGanttResponse({ type: 'intern', userId: req.user.id }, parseFilters(req.query));
        res.json({ status: 'success', data });
    } catch (err) {
        logger.error('getInternMine failed', { intern_id: req.user.id, error: err.message });
        res.status(500).json({ status: 'error', message: 'Server error' });
    }
};

// ─────────────────────────────────────────────
// GET /api/gantt/task/:sourceType/:sourceId  — detail modal
// ─────────────────────────────────────────────
exports.getTaskDetail = async (req, res) => {
    const { sourceType, sourceId } = req.params;
    try {
        if (sourceType === 'employee_task') {
            const [rows] = await db.execute(
                `SELECT t.*, a.name AS assigned_by_name, i.name AS assigned_to_name
                 FROM employee_tasks t
                 LEFT JOIN admins a ON a.admin_id = t.assigned_by
                 LEFT JOIN interns i ON i.intern_id = t.assigned_to
                 WHERE t.id = ?`,
                [sourceId]
            );
            if (!rows.length) return res.status(404).json({ status: 'error', message: 'Task not found' });
            const task = rows[0];
            const isOwner = req.user.role === 'employee' && task.assigned_to === req.user.id;
            if (!isOwner && !isAdminRole(req.user.role)) return res.status(403).json({ status: 'error', message: 'Access denied' });

            const [comments] = await db.execute(
                'SELECT * FROM employee_task_comments WHERE task_id = ? ORDER BY created_at ASC', [sourceId]
            );
            const [logs] = await db.execute(
                `SELECT * FROM task_progress_logs WHERE task_type = 'employee_task' AND task_id = ? ORDER BY log_date DESC`,
                [sourceId]
            );
            return res.json({
                status: 'success',
                data: {
                    ...task,
                    colorStatus: employeeTaskColor(task.status),
                    comments,
                    progressLogs: logs,
                },
            });
        }

        if (sourceType === 'intern_task') {
            const [taskRows] = await db.execute(
                `SELECT t.*, d.name AS domain_name, a.name AS created_by_name
                 FROM tasks t
                 LEFT JOIN domains d ON d.domain_id = t.domain_id
                 LEFT JOIN admins a ON a.admin_id = t.created_by
                 WHERE t.task_id = ?`,
                [sourceId]
            );
            if (!taskRows.length) return res.status(404).json({ status: 'error', message: 'Task not found' });
            const task = taskRows[0];
            const callerIsAdmin = isAdminRole(req.user.role);

            const submissionFilter = callerIsAdmin ? '' : 'AND its.intern_id = ?';
            const submissionParams = callerIsAdmin ? [sourceId] : [sourceId, req.user.id];
            const [submissions] = await db.execute(
                `SELECT its.*, i.name AS intern_name
                 FROM intern_task_submissions its
                 JOIN interns i ON i.intern_id = its.intern_id
                 WHERE its.task_id = ? ${submissionFilter}
                 ORDER BY its.submitted_at DESC`,
                submissionParams
            );

            const logFilter = callerIsAdmin ? '' : 'AND intern_id = ?';
            const logParams = callerIsAdmin ? [sourceId] : [sourceId, req.user.id];
            const [logs] = await db.execute(
                `SELECT * FROM task_progress_logs WHERE task_type = 'intern_task' AND task_id = ? ${logFilter} ORDER BY log_date DESC`,
                logParams
            );

            return res.json({ status: 'success', data: { ...task, submissions, progressLogs: logs } });
        }

        return res.status(400).json({ status: 'error', message: 'Invalid sourceType' });
    } catch (err) {
        logger.error('getTaskDetail failed', { error: err.message });
        res.status(500).json({ status: 'error', message: 'Server error' });
    }
};

// ─────────────────────────────────────────────
// POST /api/gantt/progress — daily "Update Today's Progress"
// ─────────────────────────────────────────────
exports.submitProgress = async (req, res) => {
    const { taskType, taskId, logDate, completionPercent, workCompleted, workRemaining, blockers, notes } = req.body;
    if (!['employee_task', 'intern_task'].includes(taskType) || !taskId) {
        return res.status(400).json({ status: 'error', message: 'taskType and taskId are required' });
    }
    const pct = Math.min(100, Math.max(0, parseInt(completionPercent) || 0));
    const date = logDate || istDateStr();
    const attachmentPath = req.file ? `/uploads/${req.file.filename}` : null;

    try {
        let taskTitle = null;
        let notifyAdminId = null;

        if (taskType === 'employee_task') {
            const [rows] = await db.execute(
                'SELECT id, title, status, assigned_by FROM employee_tasks WHERE id = ? AND assigned_to = ?',
                [taskId, req.user.id]
            );
            if (!rows.length) return res.status(404).json({ status: 'error', message: 'Task not found' });
            taskTitle = rows[0].title;
            notifyAdminId = rows[0].assigned_by;

            const statusUpdate = rows[0].status === 'Pending' && pct > 0 ? `, status = 'In Progress'` : '';
            await db.execute(
                `UPDATE employee_tasks SET progress_percent = ?, updated_at = NOW()${statusUpdate} WHERE id = ?`,
                [pct, taskId]
            );
        } else {
            const [rows] = await db.execute(
                `SELECT t.task_id, t.title, t.created_by
                 FROM tasks t
                 WHERE t.task_id = ?
                   AND (
                       t.assignment_range = 'all'
                       OR (t.assignment_range = 'group' AND t.target_group = (SELECT intern_type FROM interns WHERE intern_id = ?))
                       OR (t.assignment_range = 'individual' AND EXISTS (SELECT 1 FROM task_assignments ta WHERE ta.task_id = t.task_id AND ta.intern_id = ?))
                   )`,
                [taskId, req.user.id, req.user.id]
            );
            if (!rows.length) return res.status(404).json({ status: 'error', message: 'Task not found or not assigned to you' });
            taskTitle = rows[0].title;
            notifyAdminId = rows[0].created_by;
        }

        const nowIST = istDateTimeStr();
        await db.execute(
            `INSERT INTO task_progress_logs
                (task_type, task_id, intern_id, log_date, completion_percent, work_completed, work_remaining, blockers, notes, attachment_path, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                completion_percent = VALUES(completion_percent),
                work_completed = VALUES(work_completed),
                work_remaining = VALUES(work_remaining),
                blockers = VALUES(blockers),
                notes = VALUES(notes),
                attachment_path = COALESCE(VALUES(attachment_path), attachment_path),
                updated_at = VALUES(updated_at)`,
            [taskType, taskId, req.user.id, date, pct, workCompleted || null, workRemaining || null, blockers || null, notes || null, attachmentPath, nowIST, nowIST]
        );

        if (notifyAdminId && (pct >= 100 || (blockers && String(blockers).trim()))) {
            const title = pct >= 100 ? 'Task completed' : 'Progress update reported a blocker';
            db.execute(
                `INSERT INTO notifications (intern_id, admin_id, sender_id, sender_name, title, message, type)
                 VALUES (NULL, ?, ?, ?, ?, ?, 'info')`,
                [notifyAdminId, req.user.id, req.user.name || 'User', title, `${req.user.name || 'A user'} — "${taskTitle}": ${pct}% complete`]
            ).catch(e => logger.error('progress notification failed', { error: e.message }));
        }

        res.status(201).json({ status: 'success', data: { logDate: date, completionPercent: pct } });
    } catch (err) {
        logger.error('submitProgress failed', { intern_id: req.user.id, error: err.message });
        res.status(500).json({ status: 'error', message: 'Server error' });
    }
};

// ─────────────────────────────────────────────
// GET /api/gantt/progress/:sourceType/:sourceId — history
// ─────────────────────────────────────────────
exports.getProgressHistory = async (req, res) => {
    const { sourceType, sourceId } = req.params;
    const callerIsAdmin = isAdminRole(req.user.role);
    try {
        const filter = callerIsAdmin ? '' : 'AND intern_id = ?';
        const params = callerIsAdmin ? [sourceType, sourceId] : [sourceType, sourceId, req.user.id];
        const [rows] = await db.execute(
            `SELECT * FROM task_progress_logs WHERE task_type = ? AND task_id = ? ${filter} ORDER BY log_date DESC`,
            params
        );
        res.json({ status: 'success', data: rows });
    } catch (err) {
        logger.error('getProgressHistory failed', { error: err.message });
        res.status(500).json({ status: 'error', message: 'Server error' });
    }
};

// ─────────────────────────────────────────────
// EOD deadline config
// ─────────────────────────────────────────────
exports.getEodConfig = async (req, res) => {
    try {
        const [rows] = await db.execute('SELECT deadline_time, grace_minutes FROM eod_config LIMIT 1');
        res.json({ status: 'success', data: rows[0] || { deadline_time: '19:00:00', grace_minutes: 0 } });
    } catch (err) {
        logger.error('getEodConfig failed', { error: err.message });
        res.status(500).json({ status: 'error', message: 'Server error' });
    }
};

exports.setEodConfig = async (req, res) => {
    const { deadlineTime, graceMinutes } = req.body;
    if (!deadlineTime || !/^\d{2}:\d{2}(:\d{2})?$/.test(deadlineTime)) {
        return res.status(400).json({ status: 'error', message: 'deadlineTime must be HH:MM or HH:MM:SS' });
    }
    try {
        const [existing] = await db.execute('SELECT id FROM eod_config LIMIT 1');
        if (!existing.length) {
            await db.execute(
                'INSERT INTO eod_config (deadline_time, grace_minutes, updated_by) VALUES (?, ?, ?)',
                [deadlineTime, parseInt(graceMinutes) || 0, req.user.id]
            );
        } else {
            await db.execute(
                'UPDATE eod_config SET deadline_time = ?, grace_minutes = ?, updated_by = ?, updated_at = NOW() WHERE id = ?',
                [deadlineTime, parseInt(graceMinutes) || 0, req.user.id, existing[0].id]
            );
        }
        res.json({ status: 'success', message: 'EOD deadline updated' });
    } catch (err) {
        logger.error('setEodConfig failed', { error: err.message });
        res.status(500).json({ status: 'error', message: 'Server error' });
    }
};

// ─────────────────────────────────────────────
// GET /api/gantt/eod-status
// ─────────────────────────────────────────────
async function loadEodConfig() {
    const [rows] = await db.execute('SELECT deadline_time, grace_minutes FROM eod_config LIMIT 1');
    return rows[0] || { deadline_time: '19:00:00', grace_minutes: 0 };
}

async function computeEodStatusList({ date, internIds }) {
    const config = await loadEodConfig();
    const todayStr = istDateStr();
    const nowTimeStr = `${String(istHour()).padStart(2, '0')}:${String(istMinute()).padStart(2, '0')}:00`;

    const where = ["i.role = 'employee'", 'i.is_active = 1'];
    const params = [date];
    if (internIds && internIds.length) {
        where.push(`i.intern_id IN (${internIds.map(() => '?').join(',')})`);
    }
    const [rows] = await db.execute(
        `SELECT i.intern_id, i.name,
                e.id AS eod_id, DATE_FORMAT(e.created_at, '%H:%i:%s') AS created_time
         FROM interns i
         LEFT JOIN employee_eod_updates e ON e.intern_id = i.intern_id AND e.date = ?
         WHERE ${where.join(' AND ')}
         ORDER BY i.name ASC`,
        internIds && internIds.length ? [...params, ...internIds] : params
    );

    return rows.map(r => ({
        internId: r.intern_id,
        name: r.name,
        date,
        eodStatus: computeEodStatus({
            hasEod: !!r.eod_id,
            createdTimeStr: r.created_time,
            config,
            dateStr: date,
            todayStr,
            nowTimeStr,
        }),
        submittedAt: r.eod_id ? r.created_time : null,
    }));
}

exports.getEodStatus = async (req, res) => {
    try {
        const date = req.query.date || istDateStr();
        const internIds = isAdminRole(req.user.role)
            ? (req.query.internId ? [req.query.internId] : null)
            : [req.user.id];
        const data = await computeEodStatusList({ date, internIds });
        res.json({ status: 'success', data });
    } catch (err) {
        logger.error('getEodStatus failed', { error: err.message });
        res.status(500).json({ status: 'error', message: 'Server error' });
    }
};

// ─────────────────────────────────────────────
// GET /api/gantt/roster — person × date matrix
// ─────────────────────────────────────────────
exports.getRoster = async (req, res) => {
    try {
        const date = req.query.date || istDateStr();
        const internIds = isAdminRole(req.user.role)
            ? (req.query.personId ? [req.query.personId] : null)
            : [req.user.id];

        const eodList = await computeEodStatusList({ date, internIds });

        const where = ["i.role = 'employee'", 'i.is_active = 1'];
        const params = [];
        if (internIds && internIds.length) {
            where.push(`i.intern_id IN (${internIds.map(() => '?').join(',')})`);
            params.push(...internIds);
        }
        const [counts] = await db.execute(
            `SELECT i.intern_id,
                    SUM(t.status = 'Pending') AS assigned_count,
                    SUM(t.status = 'In Progress') AS in_progress_count,
                    SUM(t.status = 'Completed') AS completed_count
             FROM interns i
             LEFT JOIN employee_tasks t ON t.assigned_to = i.intern_id
             WHERE ${where.join(' AND ')}
             GROUP BY i.intern_id`,
            params
        );
        const countsById = new Map(counts.map(c => [c.intern_id, c]));

        const data = eodList.map(e => {
            const c = countsById.get(e.internId) || {};
            return {
                personId: e.internId,
                name: e.name,
                role: 'employee',
                date,
                assignedCount: c.assigned_count || 0,
                inProgressCount: c.in_progress_count || 0,
                completedCount: c.completed_count || 0,
                eodStatus: e.eodStatus,
            };
        });
        res.json({ status: 'success', data });
    } catch (err) {
        logger.error('getRoster failed', { error: err.message });
        res.status(500).json({ status: 'error', message: 'Server error' });
    }
};

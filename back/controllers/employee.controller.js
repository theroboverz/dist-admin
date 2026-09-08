const db = require('../config/db');
const logger = require('../utils/logger');
const { istDateStr, istDateTimeStr, istHour, istMinute, isValidDate, isValidYearMonth } = require('../utils/dateUtils');
const v = require('../utils/validate');
const emailService = require('../services/emailService');

// ─────────────────────────────────────────────
// GET /api/employee/profile
// ─────────────────────────────────────────────
exports.getProfile = async (req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT i.intern_id, i.name, i.email, i.mobile, i.designation, i.profile_pic,
                    i.university, i.organization, i.dob, i.employee_id, i.role,
                    i.joined_at AS joining_date, i.bank_ifsc, i.bank_name,
                    d.name AS domain_name
             FROM interns i
             LEFT JOIN domains d ON i.domain_id = d.domain_id
             WHERE i.intern_id = ? AND i.is_active = 1`,
            [req.user.id]
        );
        if (!rows.length) {
            logger.warn('getProfile: employee not found', { intern_id: req.user.id });
            return res.status(404).json({ status: 'error', message: 'Employee not found' });
        }
        logger.info('getProfile OK', { intern_id: req.user.id });
        res.json({ status: 'success', data: rows[0] });
    } catch (err) {
        logger.error('getProfile failed', { intern_id: req.user.id, error: err.message });
        res.status(500).json({ status: 'error', message: 'Server error' });
    }
};

// ─────────────────────────────────────────────
// POST /api/employee/attendance/checkin
// ─────────────────────────────────────────────
exports.checkIn = async (req, res) => {
    try {
        const today = istDateStr();          // IST date
        const nowIST = istDateTimeStr();     // IST datetime for MySQL DATETIME

        const [existing] = await db.execute(
            `SELECT id, check_in FROM employee_attendance WHERE intern_id = ? AND date = ?`,
            [req.user.id, today]
        );

        if (existing.length && existing[0].check_in) {
            logger.warn('checkIn: already checked in', { intern_id: req.user.id, date: today });
            return res.status(400).json({ status: 'error', message: 'Already checked in today' });
        }

        // Late if after 09:30 IST
        const h = istHour();
        const m = istMinute();
        const isLate = h > 9 || (h === 9 && m > 30);
        const status = isLate ? 'late' : 'present';

        if (existing.length) {
            await db.execute(
                `UPDATE employee_attendance SET check_in = ?, status = ?, updated_at = ? WHERE id = ?`,
                [nowIST, status, nowIST, existing[0].id]
            );
        } else {
            await db.execute(
                `INSERT INTO employee_attendance (intern_id, date, check_in, status, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [req.user.id, today, nowIST, status, nowIST, nowIST]
            );
        }

        logger.info('checkIn OK', { intern_id: req.user.id, date: today, time: nowIST, status });
        res.json({ status: 'success', message: 'Checked in successfully', data: { check_in: nowIST, status, date: today } });
    } catch (err) {
        logger.error('checkIn failed', { intern_id: req.user.id, error: err.message });
        res.status(500).json({ status: 'error', message: 'Server error' });
    }
};

// ─────────────────────────────────────────────
// POST /api/employee/attendance/checkout
// ─────────────────────────────────────────────
exports.checkOut = async (req, res) => {
    try {
        const today = istDateStr();
        const nowIST = istDateTimeStr();

        const [existing] = await db.execute(
            `SELECT id, check_in, check_out, status FROM employee_attendance WHERE intern_id = ? AND date = ?`,
            [req.user.id, today]
        );

        if (!existing.length || !existing[0].check_in) {
            logger.warn('checkOut: no check-in found', { intern_id: req.user.id, date: today });
            return res.status(400).json({ status: 'error', message: 'You have not checked in today' });
        }
        if (existing[0].check_out) {
            logger.warn('checkOut: already checked out', { intern_id: req.user.id, date: today });
            return res.status(400).json({ status: 'error', message: 'Already checked out today' });
        }

        // Both IST strings treated as naive UTC for diff — the offset cancels out
        const checkInMs = new Date(existing[0].check_in).getTime();
        const nowMs = new Date(nowIST).getTime();
        const diffHours = (nowMs - checkInMs) / 3_600_000;

        // Downgrade to half_day if < 4 hours; preserve 'late' otherwise
        let newStatus = existing[0].status;
        if (diffHours < 4) newStatus = 'half_day';

        await db.execute(
            `UPDATE employee_attendance SET check_out = ?, status = ?, updated_at = ? WHERE id = ?`,
            [nowIST, newStatus, nowIST, existing[0].id]
        );

        logger.info('checkOut OK', { intern_id: req.user.id, date: today, time: nowIST, status: newStatus, hours: diffHours.toFixed(2) });
        res.json({ status: 'success', message: 'Checked out successfully', data: { check_out: nowIST, status: newStatus, hours_worked: +diffHours.toFixed(2) } });
    } catch (err) {
        logger.error('checkOut failed', { intern_id: req.user.id, error: err.message });
        res.status(500).json({ status: 'error', message: 'Server error' });
    }
};

// ─────────────────────────────────────────────
// GET /api/employee/attendance/today
// ─────────────────────────────────────────────
exports.getTodayAttendance = async (req, res) => {
    try {
        const today = istDateStr();
        const [rows] = await db.execute(
            `SELECT * FROM employee_attendance WHERE intern_id = ? AND date = ?`,
            [req.user.id, today]
        );
        res.json({ status: 'success', data: rows[0] || null });
    } catch (err) {
        logger.error('getTodayAttendance failed', { intern_id: req.user.id, error: err.message });
        res.status(500).json({ status: 'error', message: 'Server error' });
    }
};

// ─────────────────────────────────────────────
// GET /api/employee/attendance?month=YYYY-MM
// ─────────────────────────────────────────────
exports.getAttendanceHistory = async (req, res) => {
    try {
        const { month } = req.query;

        const monthErr = v.month(month);
        if (monthErr) return res.status(400).json({ status: 'error', message: monthErr });

        let sql = `SELECT * FROM employee_attendance WHERE intern_id = ?`;
        const params = [req.user.id];

        if (month) {
            sql += ` AND DATE_FORMAT(date, '%Y-%m') = ?`;
            params.push(month);
        }
        sql += ` ORDER BY date DESC`;

        const [rows] = await db.execute(sql, params);
        logger.info('getAttendanceHistory OK', { intern_id: req.user.id, month: month || 'all', count: rows.length });
        res.json({ status: 'success', data: rows });
    } catch (err) {
        logger.error('getAttendanceHistory failed', { intern_id: req.user.id, error: err.message });
        res.status(500).json({ status: 'error', message: 'Server error' });
    }
};

// ─────────────────────────────────────────────
// POST /api/employee/eod
// ─────────────────────────────────────────────
exports.submitEOD = async (req, res) => {
    try {
        const { title, description, progress, date } = req.body;
        const nowIST = istDateTimeStr();

        // Validation
        const errs = v.collect({
            title: v.requiredString(title, 'title', 255),
            progress: v.progress(progress),
            date: v.date(date),
        });
        if (errs) return res.status(400).json({ status: 'error', message: 'Validation failed', errors: errs });

        // Sanitise
        const eodDate = date || istDateStr();
        const progressVal = Math.min(100, Math.max(0, parseInt(progress) || 0));
        const resourcePath = req.file ? `/uploads/${req.file.filename}` : null;
        const descClean = description ? String(description).slice(0, 5000) : null;

        const [result] = await db.execute(
            `INSERT INTO employee_eod_updates
             (intern_id, date, title, description, progress, resource_file_path, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [req.user.id, eodDate, String(title).trim(), descClean, progressVal, resourcePath, nowIST, nowIST]
        );

        logger.info('submitEOD OK', { intern_id: req.user.id, eod_id: result.insertId, date: eodDate, progress: progressVal });

        // Notify domain admin by email (fire-and-forget)
        db.execute(
            `SELECT i.name, i.email as emp_email,
                    a.name as admin_name, a.email as admin_email
             FROM interns i
             LEFT JOIN domains d  ON i.domain_id = d.domain_id
             LEFT JOIN admins  a  ON d.admin_id   = a.admin_id
             WHERE i.intern_id = ?`,
            [req.user.id]
        ).then(([rows]) => {
            const r = rows[0];
            if (r?.admin_email) {
                emailService.sendEODNotificationEmail(
                    r.admin_email, r.admin_name || 'Admin',
                    r.name, String(title).trim(), eodDate, progressVal
                ).catch(e => logger.error('EOD email failed', { error: e.message }));
            }
        }).catch(e => logger.error('EOD email lookup failed', { error: e.message }));

        res.status(201).json({ status: 'success', message: 'EOD update submitted', data: { id: result.insertId } });
    } catch (err) {
        logger.error('submitEOD failed', { intern_id: req.user.id, error: err.message });
        res.status(500).json({ status: 'error', message: 'Server error' });
    }
};

// ─────────────────────────────────────────────
// GET /api/employee/eod/mine
// ─────────────────────────────────────────────
exports.getMyEOD = async (req, res) => {
    try {
        const page  = Math.max(1, parseInt(req.query.page)  || 1);
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));
        const offset = (page - 1) * limit;

        const [rows] = await db.execute(
            `SELECT e.*,
                    (SELECT COUNT(*) FROM eod_comments c WHERE c.eod_id = e.id) AS comment_count
             FROM employee_eod_updates e
             WHERE e.intern_id = ?
             ORDER BY e.date DESC, e.created_at DESC
             LIMIT ? OFFSET ?`,
            [req.user.id, limit, offset]
        );
        res.json({ status: 'success', data: rows, meta: { page, limit } });
    } catch (err) {
        logger.error('getMyEOD failed', { intern_id: req.user.id, error: err.message });
        res.status(500).json({ status: 'error', message: 'Server error' });
    }
};

// ─────────────────────────────────────────────
// GET /api/employee/eod  — team feed
// ─────────────────────────────────────────────
exports.getTeamEOD = async (req, res) => {
    try {
        const page  = Math.max(1, parseInt(req.query.page)  || 1);
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
        const offset = (page - 1) * limit;

        const [rows] = await db.execute(
            `SELECT e.*, i.name AS employee_name, i.profile_pic AS employee_photo, i.employee_id,
                    (SELECT COUNT(*) FROM eod_comments c WHERE c.eod_id = e.id) AS comment_count
             FROM employee_eod_updates e
             JOIN interns i ON e.intern_id = i.intern_id
             WHERE i.role = 'employee'
             ORDER BY e.date DESC, e.created_at DESC
             LIMIT ? OFFSET ?`,
            [limit, offset]
        );

        // Fetch comments for each update
        for (const eod of rows) {
            const [comments] = await db.execute(
                `SELECT id, commenter_name, commenter_type, comment, created_at
                 FROM eod_comments WHERE eod_id = ? ORDER BY created_at ASC`,
                [eod.id]
            );
            eod.comments = comments;
        }

        res.json({ status: 'success', data: rows, meta: { page, limit } });
    } catch (err) {
        logger.error('getTeamEOD failed', { intern_id: req.user.id, error: err.message });
        res.status(500).json({ status: 'error', message: 'Server error' });
    }
};

// ─────────────────────────────────────────────
// POST /api/employee/eod/:id/comment
// ─────────────────────────────────────────────
exports.addEODComment = async (req, res) => {
    try {
        const eodId = parseInt(req.params.id);
        if (!eodId || eodId < 1) return res.status(400).json({ status: 'error', message: 'Invalid EOD ID' });

        const { comment } = req.body;
        if (!comment || !String(comment).trim()) {
            return res.status(400).json({ status: 'error', message: 'Comment text is required' });
        }
        const commentClean = String(comment).trim().slice(0, 2000);

        const [eod] = await db.execute(`SELECT id FROM employee_eod_updates WHERE id = ?`, [eodId]);
        if (!eod.length) return res.status(404).json({ status: 'error', message: 'EOD update not found' });

        const nowIST = istDateTimeStr();
        await db.execute(
            `INSERT INTO eod_comments (eod_id, commenter_id, commenter_type, commenter_name, comment, created_at)
             VALUES (?, ?, 'employee', ?, ?, ?)`,
            [eodId, req.user.id, req.user.name, commentClean, nowIST]
        );

        logger.info('addEODComment OK', { intern_id: req.user.id, eod_id: eodId });
        res.status(201).json({ status: 'success', message: 'Comment added' });
    } catch (err) {
        logger.error('addEODComment failed', { intern_id: req.user.id, error: err.message });
        res.status(500).json({ status: 'error', message: 'Server error' });
    }
};

// ─────────────────────────────────────────────
// GET /api/employee/projects
// ─────────────────────────────────────────────
exports.getMyProjects = async (req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT p.*, a.name as creator_name
             FROM projects p
             LEFT JOIN admins a ON p.assigned_by = a.admin_id
             WHERE (p.assigned_to_type = 'Employee' AND p.assigned_to_id = ?)
                OR (p.assigned_to_type = 'Individual' AND p.assigned_to_id = ?)
             ORDER BY p.created_at DESC`,
            [req.user.id, req.user.id]
        );
        logger.info('getMyProjects OK', { intern_id: req.user.id, count: rows.length });
        res.json({ status: 'success', data: rows });
    } catch (err) {
        logger.error('getMyProjects failed', { intern_id: req.user.id, error: err.message });
        res.status(500).json({ status: 'error', message: 'Server error' });
    }
};

// ─────────────────────────────────────────────
// POST /api/employee/projects/:id/update
// ─────────────────────────────────────────────
exports.addProjectUpdate = async (req, res) => {
    try {
        const projectId = parseInt(req.params.id);
        if (!projectId || projectId < 1) {
            return res.status(400).json({ status: 'error', message: 'Invalid project ID' });
        }

        const { updateText } = req.body;
        if (!updateText || !String(updateText).trim()) {
            return res.status(400).json({ status: 'error', message: 'Update text is required' });
        }

        // Verify this project is assigned to the requesting employee
        const [projects] = await db.execute(
            `SELECT p.id, p.title, p.assigned_by, p.status,
                    a.name as creator_name, a.email as creator_email
             FROM projects p
             LEFT JOIN admins a ON p.assigned_by = a.admin_id
             WHERE p.id = ?
               AND ((p.assigned_to_type = 'Employee' AND p.assigned_to_id = ?)
                 OR (p.assigned_to_type = 'Individual' AND p.assigned_to_id = ?))`,
            [projectId, req.user.id, req.user.id]
        );

        if (!projects.length) {
            return res.status(403).json({ status: 'error', message: 'Project not found or not assigned to you' });
        }

        const project = projects[0];
        const files = req.files || [];
        const filePaths = files.map(f => `/uploads/${f.filename}`);
        const fileNames = files.map(f => f.originalname);
        const nowIST = istDateTimeStr();

        await db.execute(
            `INSERT INTO project_updates (project_id, update_text, files, file_names, created_at)
             VALUES (?, ?, ?, ?, ?)`,
            [projectId, String(updateText).trim(), JSON.stringify(filePaths), JSON.stringify(fileNames), nowIST]
        );

        // Move project status to In Progress if still Pending
        if (project.status === 'Pending') {
            await db.execute(`UPDATE projects SET status = 'In Progress' WHERE id = ?`, [projectId]);
        }

        logger.info('addProjectUpdate OK', { intern_id: req.user.id, project_id: projectId });

        // Notify the assigned_by admin (fire-and-forget)
        if (project.assigned_by) {
            db.execute(
                `INSERT INTO notifications (intern_id, admin_id, sender_id, sender_name, title, message, type)
                 VALUES (NULL, ?, ?, ?, ?, ?, 'info')`,
                [project.assigned_by, req.user.id, req.user.name,
                    'New Project Update', `${req.user.name} posted an update on: ${project.title}`]
            ).catch(e => logger.error('Project update notification failed', { error: e.message }));

            if (project.creator_email) {
                emailService.sendProjectUpdateEmail(
                    project.creator_email,
                    project.creator_name || 'Admin',
                    req.user.name,
                    project.title,
                    String(updateText).trim().slice(0, 300)
                ).catch(e => logger.error('Project update email failed', { error: e.message }));
            }
        }

        res.status(201).json({ status: 'success', message: 'Project update posted' });
    } catch (err) {
        logger.error('addProjectUpdate failed', { intern_id: req.user.id, error: err.message });
        res.status(500).json({ status: 'error', message: 'Server error' });
    }
};

// ─────────────────────────────────────────────
// GET /api/employee/tasks  — my assigned tasks
// ─────────────────────────────────────────────
exports.getMyTasks = async (req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT t.*, a.name AS assigned_by_name
             FROM employee_tasks t
             LEFT JOIN admins a ON a.admin_id = t.assigned_by
             WHERE t.assigned_to = ?
             ORDER BY t.created_at DESC`,
            [req.user.id]
        );
        res.json({ status: 'success', data: rows });
    } catch (err) {
        logger.error('getMyTasks failed', { intern_id: req.user.id, error: err.message });
        res.status(500).json({ status: 'error', message: 'Server error' });
    }
};

// ─────────────────────────────────────────────
// PUT /api/employee/tasks/:id/status
// ─────────────────────────────────────────────
exports.updateMyTaskStatus = async (req, res) => {
    const { status, completion_notes, completion_proof_url } = req.body;
    const proofFilePath = req.file ? `/uploads/${req.file.filename}` : null;
    const allowed = ['Pending', 'In Progress', 'Completed', 'On Hold'];
    if (!allowed.includes(status)) {
        return res.status(400).json({ status: 'error', message: 'Invalid status' });
    }
    try {
        const [check] = await db.execute(
            'SELECT id FROM employee_tasks WHERE id = ? AND assigned_to = ?',
            [req.params.id, req.user.id]
        );
        if (!check.length) return res.status(404).json({ status: 'error', message: 'Task not found' });
        if (status === 'Completed') {
            await db.execute(
                `UPDATE employee_tasks
                 SET status = ?, completion_notes = ?, completion_proof_url = ?,
                     completion_file_path = COALESCE(?, completion_file_path), updated_at = NOW()
                 WHERE id = ?`,
                [status, completion_notes || null, completion_proof_url || null, proofFilePath, req.params.id]
            );
        } else {
            await db.execute(
                'UPDATE employee_tasks SET status = ?, updated_at = NOW() WHERE id = ?',
                [status, req.params.id]
            );
        }
        res.json({ status: 'success', message: 'Status updated' });
    } catch (err) {
        logger.error('updateMyTaskStatus failed', { intern_id: req.user.id, error: err.message });
        res.status(500).json({ status: 'error', message: 'Server error' });
    }
};

// ─────────────────────────────────────────────
// POST /api/employee/attendance/correction
// ─────────────────────────────────────────────
exports.submitCorrectionRequest = async (req, res) => {
    const { date, requested_status, reason } = req.body;
    const validStatuses = ['present', 'absent', 'half_day', 'late'];
    if (!date || !requested_status || !reason) {
        return res.status(400).json({ status: 'error', message: 'date, requested_status, and reason are required' });
    }
    if (!validStatuses.includes(requested_status)) {
        return res.status(400).json({ status: 'error', message: 'Invalid requested_status' });
    }
    if (!isValidDate(date)) {
        return res.status(400).json({ status: 'error', message: 'Invalid date format (use YYYY-MM-DD)' });
    }
    try {
        const [result] = await db.execute(
            `INSERT INTO attendance_correction_requests (intern_id, date, requested_status, reason) VALUES (?, ?, ?, ?)`,
            [req.user.id, date, requested_status, String(reason).trim().slice(0, 1000)]
        );
        logger.info('submitCorrectionRequest OK', { intern_id: req.user.id, date, requested_status });
        res.status(201).json({ status: 'success', message: 'Correction request submitted', data: { id: result.insertId } });
    } catch (err) {
        logger.error('submitCorrectionRequest failed', { intern_id: req.user.id, error: err.message });
        res.status(500).json({ status: 'error', message: 'Server error' });
    }
};

// ─────────────────────────────────────────────
// GET /api/employee/tasks/:id/comments
// ─────────────────────────────────────────────
exports.getMyTaskComments = async (req, res) => {
    try {
        const [check] = await db.execute(
            'SELECT id FROM employee_tasks WHERE id = ? AND assigned_to = ?',
            [req.params.id, req.user.id]
        );
        if (!check.length) return res.status(404).json({ status: 'error', message: 'Task not found' });
        const [rows] = await db.execute(
            'SELECT * FROM employee_task_comments WHERE task_id = ? ORDER BY created_at ASC',
            [req.params.id]
        );
        res.json({ status: 'success', data: rows });
    } catch (err) {
        logger.error('getMyTaskComments failed', { intern_id: req.user.id, error: err.message });
        res.status(500).json({ status: 'error', message: 'Server error' });
    }
};

// ─────────────────────────────────────────────
// POST /api/employee/tasks/:id/comments
// ─────────────────────────────────────────────
exports.addMyTaskComment = async (req, res) => {
    const { content, comment_type, parent_id } = req.body;
    if (!content) return res.status(400).json({ status: 'error', message: 'content required' });
    try {
        const [check] = await db.execute(
            'SELECT id FROM employee_tasks WHERE id = ? AND assigned_to = ?',
            [req.params.id, req.user.id]
        );
        if (!check.length) return res.status(404).json({ status: 'error', message: 'Task not found' });
        const authorName = req.user.name || req.user.email || 'Employee';
        const [result] = await db.execute(
            `INSERT INTO employee_task_comments (task_id, author_id, author_type, author_name, comment_type, content, parent_id)
             VALUES (?, ?, 'employee', ?, ?, ?, ?)`,
            [req.params.id, req.user.id, authorName, comment_type || 'doubt', content, parent_id || null]
        );
        const [rows] = await db.execute('SELECT * FROM employee_task_comments WHERE id = ?', [result.insertId]);
        res.json({ status: 'success', data: rows[0] });
    } catch (err) {
        logger.error('addMyTaskComment failed', { intern_id: req.user.id, error: err.message });
        res.status(500).json({ status: 'error', message: 'Server error' });
    }
};

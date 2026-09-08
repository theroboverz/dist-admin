const db = require('../config/db');

// GET /api/admin/employee-tasks/employees
// Returns all employees with task stats
const getEmployeesWithStats = async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT
                i.intern_id, i.name, i.email, i.employee_id, i.designation, i.profile_pic,
                COUNT(t.id) AS total_tasks,
                SUM(t.status = 'Completed') AS completed_tasks,
                SUM(t.status = 'In Progress') AS in_progress_tasks,
                SUM(t.status = 'Pending') AS pending_tasks
            FROM interns i
            LEFT JOIN employee_tasks t ON t.assigned_to = i.intern_id
            WHERE i.role = 'employee' AND i.is_active = 1
            GROUP BY i.intern_id
            ORDER BY i.name ASC
        `);
        res.json({ status: 'success', data: rows });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};

// GET /api/admin/employee-tasks/:employeeId/tasks
const getTasksByEmployee = async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT t.*,
                a.name AS assigned_by_name,
                i.name AS assigned_to_name
            FROM employee_tasks t
            LEFT JOIN admins a ON a.admin_id = t.assigned_by
            LEFT JOIN interns i ON i.intern_id = t.assigned_to
            WHERE t.assigned_to = ?
            ORDER BY t.created_at DESC
        `, [req.params.employeeId]);
        res.json({ status: 'success', data: rows });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};

// POST /api/admin/employee-tasks
const createTask = async (req, res) => {
    const { title, description, assigned_to, priority, deadline, resources, progress_percent, start_date, project_id } = req.body;
    if (!title || !assigned_to) return res.status(400).json({ status: 'error', message: 'title and assigned_to required' });
    const validPriorities = ['Low', 'Medium', 'High', 'Urgent'];
    if (priority && !validPriorities.includes(priority)) return res.status(400).json({ status: 'error', message: 'Invalid priority' });
    const resourceFilePath = req.file ? `/uploads/${req.file.filename}` : null;
    const progress = Math.min(100, Math.max(0, parseInt(progress_percent) || 0));
    try {
        const [empCheck] = await db.execute(
            `SELECT intern_id, name FROM interns WHERE intern_id = ? AND role = 'employee' AND is_active = 1`,
            [assigned_to]
        );
        if (!empCheck.length) return res.status(400).json({ status: 'error', message: 'Assigned user is not an active employee' });

        const [result] = await db.execute(
            `INSERT INTO employee_tasks (title, description, assigned_to, assigned_by, priority, deadline, resources, resource_file_path, progress_percent, start_date, project_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [title, description || null, assigned_to, req.user.id, priority || 'Medium', deadline || null, resources || null, resourceFilePath, progress, start_date || null, project_id || null]
        );
        const [rows] = await db.execute(
            `SELECT t.*, a.name AS assigned_by_name, i.name AS assigned_to_name
             FROM employee_tasks t
             LEFT JOIN admins a ON a.admin_id = t.assigned_by
             LEFT JOIN interns i ON i.intern_id = t.assigned_to
             WHERE t.id = ?`, [result.insertId]
        );
        db.execute(
            `INSERT INTO notifications (admin_id, intern_id, sender_id, sender_name, title, message, type)
             VALUES (NULL, ?, ?, ?, ?, ?, 'info')`,
            [assigned_to, req.user.id, req.user.name || 'Admin',
             'New Task Assigned', `You have been assigned a new task: "${title}"`]
        ).catch(() => {});

        res.json({ status: 'success', data: rows[0] });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};

// PUT /api/admin/employee-tasks/:taskId
const updateTask = async (req, res) => {
    const { title, description, priority, status, deadline, resources, progress_percent, start_date, project_id } = req.body;
    const validStatuses = ['Pending', 'In Progress', 'Completed', 'On Hold'];
    if (status && !validStatuses.includes(status)) return res.status(400).json({ status: 'error', message: 'Invalid status' });
    const resourceFilePath = req.file ? `/uploads/${req.file.filename}` : undefined;
    const progress = progress_percent !== undefined ? Math.min(100, Math.max(0, parseInt(progress_percent) || 0)) : undefined;
    try {
        // Build update dynamically so we only overwrite resource_file_path if a new file was uploaded
        const fields = ['title=?','description=?','priority=?','status=?','deadline=?','resources=?','updated_at=NOW()'];
        const params = [title, description, priority, status, deadline || null, resources || null];
        if (progress !== undefined) { fields.push('progress_percent=?'); params.push(progress); }
        if (resourceFilePath) { fields.push('resource_file_path=?'); params.push(resourceFilePath); }
        if (start_date !== undefined) { fields.push('start_date=?'); params.push(start_date || null); }
        if (project_id !== undefined) { fields.push('project_id=?'); params.push(project_id || null); }
        params.push(req.params.taskId);
        await db.execute(`UPDATE employee_tasks SET ${fields.join(',')} WHERE id=?`, params);
        const [rows] = await db.execute(
            `SELECT t.*, a.name AS assigned_by_name, i.name AS assigned_to_name
             FROM employee_tasks t
             LEFT JOIN admins a ON a.admin_id = t.assigned_by
             LEFT JOIN interns i ON i.intern_id = t.assigned_to
             WHERE t.id = ?`, [req.params.taskId]
        );
        res.json({ status: 'success', data: rows[0] });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};

// DELETE /api/admin/employee-tasks/:taskId
const deleteTask = async (req, res) => {
    try {
        await db.execute('DELETE FROM employee_tasks WHERE id = ?', [req.params.taskId]);
        res.json({ status: 'success', message: 'Task deleted' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};

// GET /api/admin/employee-tasks/:taskId/comments
const getComments = async (req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT * FROM employee_task_comments WHERE task_id = ? ORDER BY created_at ASC`,
            [req.params.taskId]
        );
        res.json({ status: 'success', data: rows });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};

// POST /api/admin/employee-tasks/:taskId/comments
const addComment = async (req, res) => {
    const { content, comment_type, parent_id } = req.body;
    if (!content) return res.status(400).json({ status: 'error', message: 'content required' });
    try {
        const authorName = req.user.name || req.user.email || 'Admin';
        const [result] = await db.execute(
            `INSERT INTO employee_task_comments (task_id, author_id, author_type, author_name, comment_type, content, parent_id)
             VALUES (?, ?, 'admin', ?, ?, ?, ?)`,
            [req.params.taskId, req.user.id, authorName, comment_type || 'comment', content, parent_id || null]
        );
        const [rows] = await db.execute('SELECT * FROM employee_task_comments WHERE id = ?', [result.insertId]);
        res.json({ status: 'success', data: rows[0] });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};

// DELETE /api/admin/employee-tasks/comments/:commentId
const deleteComment = async (req, res) => {
    try {
        await db.execute('DELETE FROM employee_task_comments WHERE id = ?', [req.params.commentId]);
        res.json({ status: 'success' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};

module.exports = { getEmployeesWithStats, getTasksByEmployee, createTask, updateTask, deleteTask, getComments, addComment, deleteComment };

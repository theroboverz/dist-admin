const db = require('../config/db');
const { encrypt, decrypt } = require('../utils/encryption');
const logger = require('../utils/logger');
const { istDateStr, istDateTimeStr, isValidDate, isValidYearMonth } = require('../utils/dateUtils');
const v = require('../utils/validate');

const SENSITIVE_FIELDS = ['aadhar_number', 'pan_number', 'bank_account_number'];

const isSuperAdmin = (user) => {
    if (!user?.role) return false;
    const r = user.role.toLowerCase().trim();
    return r === 'superadmin' || r === 'super admin';
};

const processSensitiveFields = (row, callerIsSuperAdmin) => {
    if (!callerIsSuperAdmin) {
        SENSITIVE_FIELDS.forEach(f => { row[f] = null; });
        return row;
    }
    SENSITIVE_FIELDS.forEach(f => {
        if (row[f]) row[f] = decrypt(row[f]);
    });
    return row;
};

// ─────────────────────────────────────────────
// POST /api/admin/employees/promote
// ─────────────────────────────────────────────
exports.promoteIntern = async (req, res) => {
    try {
        const { intern_id, employee_id, aadhar_number, pan_number,
            bank_account_number, bank_ifsc, bank_name } = req.body;

        // Validation
        const errs = v.collect({
            intern_id: v.positiveInt(intern_id, 'intern_id'),
            employee_id: v.employeeId(employee_id),
            aadhar_number: v.aadhar(aadhar_number),
            pan_number: v.pan(pan_number),
            bank_ifsc: v.ifsc(bank_ifsc),
        });
        if (errs) return res.status(400).json({ status: 'error', message: 'Validation failed', errors: errs });

        // Check intern exists
        const [intern] = await db.execute(
            `SELECT intern_id, name, email, role FROM interns WHERE intern_id = ? AND is_active = 1`,
            [intern_id]
        );
        if (!intern.length) return res.status(404).json({ status: 'error', message: 'Intern not found' });
        if (intern[0].role === 'employee') {
            return res.status(400).json({ status: 'error', message: 'Already an employee' });
        }

        // Check employee_id uniqueness
        const [dup] = await db.execute(
            `SELECT intern_id FROM interns WHERE employee_id = ? AND intern_id != ?`,
            [employee_id.trim(), intern_id]
        );
        if (dup.length) {
            return res.status(409).json({ status: 'error', message: 'Employee ID is already in use by another person' });
        }

        // Encrypt sensitive fields
        const encAadhar = aadhar_number ? encrypt(aadhar_number.replace(/\s/g, '')) : null;
        const encPan    = pan_number ? encrypt(pan_number.trim().toUpperCase()) : null;
        const encBank   = bank_account_number ? encrypt(bank_account_number.trim()) : null;
        const nowIST    = istDateTimeStr();

        await db.execute(
            `UPDATE interns
             SET role = 'employee', employee_id = ?,
                 joined_at            = COALESCE(joined_at, NOW()),
                 aadhar_number        = COALESCE(?, aadhar_number),
                 pan_number           = COALESCE(?, pan_number),
                 bank_account_number  = COALESCE(?, bank_account_number),
                 bank_ifsc            = COALESCE(?, bank_ifsc),
                 bank_name            = COALESCE(?, bank_name)
             WHERE intern_id = ?`,
            [employee_id.trim(), encAadhar, encPan, encBank, bank_ifsc || null, bank_name || null, intern_id]
        );

        logger.audit('PROMOTE_INTERN', {
            action: 'intern promoted to employee',
            admin_id: req.user.id,
            admin_role: req.user.role,
            intern_id,
            employee_id: employee_id.trim(),
            intern_name: intern[0].name,
            intern_email: intern[0].email,
            timestamp: nowIST,
        });

        res.json({ status: 'success', message: `${intern[0].name} promoted to employee with ID ${employee_id.trim()}` });
    } catch (err) {
        logger.error('promoteIntern failed', { admin_id: req.user?.id, error: err.message, stack: err.stack?.split('\n')[1] });
        res.status(500).json({ status: 'error', message: err.message || 'Server error' });
    }
};

// ─────────────────────────────────────────────
// GET /api/admin/employees
// ─────────────────────────────────────────────
exports.listEmployees = async (req, res) => {
    try {
        const superAdmin = isSuperAdmin(req.user);
        const [rows] = await db.execute(
            `SELECT i.intern_id, i.name, i.email, i.mobile, i.designation, i.profile_pic,
                    i.employee_id, i.role, i.is_active, i.joined_at AS joining_date,
                    i.aadhar_number, i.pan_number, i.bank_account_number, i.bank_ifsc, i.bank_name,
                    d.name AS domain_name
             FROM interns i
             LEFT JOIN domains d ON i.domain_id = d.domain_id
             WHERE i.role = 'employee'
             ORDER BY i.name ASC`
        );

        const employees = rows.map(row => processSensitiveFields({ ...row }, superAdmin));

        if (superAdmin) {
            logger.audit('VIEW_ALL_EMPLOYEES', {
                admin_id: req.user.id,
                count: employees.length,
                sensitive_visible: true,
                timestamp: istDateTimeStr(),
            });
        }

        logger.info('listEmployees OK', { admin_id: req.user.id, count: employees.length });
        res.json({ status: 'success', data: employees });
    } catch (err) {
        logger.error('listEmployees failed', { admin_id: req.user.id, error: err.message });
        res.status(500).json({ status: 'error', message: 'Server error' });
    }
};

// ─────────────────────────────────────────────
// GET /api/admin/employees/:id
// ─────────────────────────────────────────────
exports.getEmployee = async (req, res) => {
    try {
        const empId = parseInt(req.params.id);
        if (!empId || empId < 1) return res.status(400).json({ status: 'error', message: 'Invalid employee ID' });

        const superAdmin = isSuperAdmin(req.user);
        const [rows] = await db.execute(
            `SELECT i.intern_id, i.name, i.email, i.mobile, i.designation, i.profile_pic,
                    i.employee_id, i.role, i.is_active, i.joined_at AS joining_date,
                    i.aadhar_number, i.pan_number, i.bank_account_number, i.bank_ifsc, i.bank_name,
                    d.name AS domain_name
             FROM interns i
             LEFT JOIN domains d ON i.domain_id = d.domain_id
             WHERE i.intern_id = ? AND i.role = 'employee'`,
            [empId]
        );
        if (!rows.length) return res.status(404).json({ status: 'error', message: 'Employee not found' });

        if (superAdmin) {
            logger.audit('VIEW_EMPLOYEE_SENSITIVE', {
                admin_id: req.user.id,
                employee_intern_id: empId,
                employee_name: rows[0].name,
                timestamp: istDateTimeStr(),
            });
        }

        logger.info('getEmployee OK', { admin_id: req.user.id, employee_id: empId });
        res.json({ status: 'success', data: processSensitiveFields({ ...rows[0] }, superAdmin) });
    } catch (err) {
        logger.error('getEmployee failed', { admin_id: req.user.id, error: err.message });
        res.status(500).json({ status: 'error', message: 'Server error' });
    }
};

// ─────────────────────────────────────────────
// PUT /api/admin/employees/:id
// ─────────────────────────────────────────────
exports.updateEmployee = async (req, res) => {
    try {
        const empId = parseInt(req.params.id);
        if (!empId || empId < 1) return res.status(400).json({ status: 'error', message: 'Invalid employee ID' });

        const { name, mobile, designation, employee_id, bank_ifsc, bank_name,
            aadhar_number, pan_number, bank_account_number } = req.body;

        // Validate only provided fields
        const errs = v.collect({
            aadhar_number: v.aadhar(aadhar_number),
            pan_number: v.pan(pan_number),
            bank_ifsc: v.ifsc(bank_ifsc),
            employee_id: employee_id !== undefined ? v.employeeId(employee_id) : null,
        });
        if (errs) return res.status(400).json({ status: 'error', message: 'Validation failed', errors: errs });

        // Check employee_id uniqueness if being changed
        if (employee_id) {
            const [dup] = await db.execute(
                `SELECT intern_id FROM interns WHERE employee_id = ? AND intern_id != ?`,
                [employee_id.trim(), empId]
            );
            if (dup.length) return res.status(409).json({ status: 'error', message: 'Employee ID already in use' });
        }

        const nowIST = istDateTimeStr();
        const fields = [];
        const params = [];
        const changed = {};

        if (name !== undefined) { fields.push('name = ?'); params.push(String(name).trim()); changed.name = true; }
        if (mobile !== undefined) { fields.push('mobile = ?'); params.push(String(mobile).trim()); changed.mobile = true; }
        if (designation !== undefined) { fields.push('designation = ?'); params.push(String(designation).trim()); changed.designation = true; }
        if (employee_id !== undefined) { fields.push('employee_id = ?'); params.push(employee_id.trim()); changed.employee_id = true; }
        if (bank_ifsc !== undefined) { fields.push('bank_ifsc = ?'); params.push(bank_ifsc.trim().toUpperCase()); changed.bank_ifsc = true; }
        if (bank_name !== undefined) { fields.push('bank_name = ?'); params.push(String(bank_name).trim()); changed.bank_name = true; }
        if (aadhar_number) { fields.push('aadhar_number = ?'); params.push(encrypt(aadhar_number.replace(/\s/g, ''))); changed.aadhar_number = 'encrypted'; }
        if (pan_number) { fields.push('pan_number = ?'); params.push(encrypt(pan_number.trim().toUpperCase())); changed.pan_number = 'encrypted'; }
        if (bank_account_number) { fields.push('bank_account_number = ?'); params.push(encrypt(bank_account_number.trim())); changed.bank_account_number = 'encrypted'; }

        if (!fields.length) return res.status(400).json({ status: 'error', message: 'No fields to update' });

        params.push(empId);
        await db.execute(
            `UPDATE interns SET ${fields.join(', ')} WHERE intern_id = ? AND role = 'employee'`,
            params
        );

        logger.audit('UPDATE_EMPLOYEE', {
            admin_id: req.user.id,
            employee_intern_id: empId,
            changed_fields: Object.keys(changed),
            timestamp: nowIST,
        });

        res.json({ status: 'success', message: 'Employee updated', updated_at: nowIST });
    } catch (err) {
        logger.error('updateEmployee failed', { admin_id: req.user.id, error: err.message });
        res.status(500).json({ status: 'error', message: 'Server error' });
    }
};

// ─────────────────────────────────────────────
// PUT /api/admin/attendance/override
// ─────────────────────────────────────────────
exports.overrideAttendance = async (req, res) => {
    try {
        const { intern_id, date, status, admin_notes, check_in, check_out } = req.body;

        const errs = v.collect({
            intern_id: v.positiveInt(intern_id, 'intern_id'),
            date: v.date(date),
            status: v.attendanceStatus(status),
        });
        if (errs) return res.status(400).json({ status: 'error', message: 'Validation failed', errors: errs });

        // Validate datetime strings if provided
        if (check_in && isNaN(Date.parse(check_in))) {
            return res.status(400).json({ status: 'error', message: 'check_in must be a valid datetime' });
        }
        if (check_out && isNaN(Date.parse(check_out))) {
            return res.status(400).json({ status: 'error', message: 'check_out must be a valid datetime' });
        }

        const nowIST = istDateTimeStr();
        const [existing] = await db.execute(
            `SELECT id FROM employee_attendance WHERE intern_id = ? AND date = ?`,
            [intern_id, date]
        );

        if (existing.length) {
            await db.execute(
                `UPDATE employee_attendance
                 SET status = ?, admin_override = 1, admin_notes = ?, override_by = ?,
                     check_in  = COALESCE(?, check_in),
                     check_out = COALESCE(?, check_out),
                     updated_at = ?
                 WHERE intern_id = ? AND date = ?`,
                [status, admin_notes || null, req.user.id, check_in || null, check_out || null, nowIST, intern_id, date]
            );
        } else {
            await db.execute(
                `INSERT INTO employee_attendance
                 (intern_id, date, status, admin_override, admin_notes, override_by, check_in, check_out, created_at, updated_at)
                 VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?)`,
                [intern_id, date, status, admin_notes || null, req.user.id, check_in || null, check_out || null, nowIST, nowIST]
            );
        }

        logger.audit('ATTENDANCE_OVERRIDE', {
            admin_id: req.user.id,
            employee_intern_id: intern_id,
            date,
            new_status: status,
            admin_notes: admin_notes || null,
            timestamp: nowIST,
        });

        res.json({ status: 'success', message: 'Attendance overridden', updated_at: nowIST });
    } catch (err) {
        logger.error('overrideAttendance failed', { admin_id: req.user.id, error: err.message });
        res.status(500).json({ status: 'error', message: 'Server error' });
    }
};

// ─────────────────────────────────────────────
// GET /api/admin/employees/:id/attendance
// ─────────────────────────────────────────────
exports.getEmployeeAttendance = async (req, res) => {
    try {
        const empId = parseInt(req.params.id);
        if (!empId || empId < 1) return res.status(400).json({ status: 'error', message: 'Invalid employee ID' });

        const { month } = req.query;
        const monthErr = v.month(month);
        if (monthErr) return res.status(400).json({ status: 'error', message: monthErr });

        let sql = `SELECT * FROM employee_attendance WHERE intern_id = ?`;
        const params = [empId];
        if (month) {
            sql += ` AND DATE_FORMAT(date, '%Y-%m') = ?`;
            params.push(month);
        }
        sql += ` ORDER BY date DESC`;

        const [rows] = await db.execute(sql, params);
        logger.info('getEmployeeAttendance OK', { admin_id: req.user.id, employee_id: empId, month: month || 'all', count: rows.length });
        res.json({ status: 'success', data: rows });
    } catch (err) {
        logger.error('getEmployeeAttendance failed', { admin_id: req.user.id, error: err.message });
        res.status(500).json({ status: 'error', message: 'Server error' });
    }
};

// ─────────────────────────────────────────────
// GET /api/admin/employee-eod
// ─────────────────────────────────────────────
exports.getTeamEOD = async (req, res) => {
    try {
        const page  = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(50, parseInt(req.query.limit) || 20);
        const offset = (page - 1) * limit;
        const employeeId = req.query.employee_id ? parseInt(req.query.employee_id) : null;

        let sql = `
            SELECT e.*, i.name AS employee_name, i.profile_pic AS employee_photo,
                   i.employee_id AS emp_id,
                   (SELECT COUNT(*) FROM eod_comments c WHERE c.eod_id = e.id) AS comment_count
            FROM employee_eod_updates e
            JOIN interns i ON e.intern_id = i.intern_id
            WHERE i.role = 'employee'`;
        const params = [];
        if (employeeId) { sql += ` AND e.intern_id = ?`; params.push(employeeId); }
        sql += ` ORDER BY e.date DESC, e.created_at DESC LIMIT ? OFFSET ?`;
        params.push(limit, offset);

        const [rows] = await db.execute(sql, params);
        for (const eod of rows) {
            const [comments] = await db.execute(
                `SELECT id, commenter_name, commenter_type, comment, created_at FROM eod_comments WHERE eod_id = ? ORDER BY created_at ASC`,
                [eod.id]
            );
            eod.comments = comments;
        }
        res.json({ status: 'success', data: rows });
    } catch (err) {
        logger.error('admin getTeamEOD failed', { admin_id: req.user.id, error: err.message });
        res.status(500).json({ status: 'error', message: 'Server error' });
    }
};

// ─────────────────────────────────────────────
// POST /api/admin/employee-eod/:id/comment
// ─────────────────────────────────────────────
exports.addEODComment = async (req, res) => {
    const { comment } = req.body;
    if (!comment?.trim()) return res.status(400).json({ status: 'error', message: 'comment required' });
    try {
        const [check] = await db.execute('SELECT id FROM employee_eod_updates WHERE id = ?', [req.params.id]);
        if (!check.length) return res.status(404).json({ status: 'error', message: 'EOD not found' });
        const adminName = req.user.name || req.user.email || 'Admin';
        const [result] = await db.execute(
            `INSERT INTO eod_comments (eod_id, commenter_name, commenter_type, comment) VALUES (?, ?, 'admin', ?)`,
            [req.params.id, adminName, comment.trim()]
        );
        const [rows] = await db.execute('SELECT * FROM eod_comments WHERE id = ?', [result.insertId]);
        res.json({ status: 'success', data: rows[0] });
    } catch (err) {
        logger.error('addEODComment failed', { admin_id: req.user.id, error: err.message });
        res.status(500).json({ status: 'error', message: 'Server error' });
    }
};

// ─────────────────────────────────────────────
// GET /api/admin/attendance/corrections
// ─────────────────────────────────────────────
exports.listCorrectionRequests = async (req, res) => {
    try {
        const statusFilter = req.query.status || 'pending';
        const [rows] = await db.execute(
            `SELECT r.*, i.name AS employee_name, i.employee_id
             FROM attendance_correction_requests r
             JOIN interns i ON r.intern_id = i.intern_id
             WHERE r.status = ?
             ORDER BY r.created_at DESC`,
            [statusFilter]
        );
        res.json({ status: 'success', data: rows });
    } catch (err) {
        logger.error('listCorrectionRequests failed', { admin_id: req.user.id, error: err.message });
        res.status(500).json({ status: 'error', message: 'Server error' });
    }
};

// ─────────────────────────────────────────────
// PUT /api/admin/attendance/corrections/:id
// ─────────────────────────────────────────────
exports.handleCorrectionRequest = async (req, res) => {
    const { action, admin_note } = req.body; // action: 'approved' | 'denied'
    if (!['approved', 'denied'].includes(action)) return res.status(400).json({ status: 'error', message: 'action must be approved or denied' });
    try {
        const [rows] = await db.execute('SELECT * FROM attendance_correction_requests WHERE id = ?', [req.params.id]);
        if (!rows.length) return res.status(404).json({ status: 'error', message: 'Request not found' });
        const req_ = rows[0];
        if (req_.status !== 'pending') return res.status(400).json({ status: 'error', message: 'Already handled' });

        await db.execute(
            `UPDATE attendance_correction_requests SET status=?, admin_note=?, reviewed_by=? WHERE id=?`,
            [action, admin_note || null, req.user.id, req.params.id]
        );

        // If approved, apply the attendance change
        if (action === 'approved') {
            const [existing] = await db.execute(
                `SELECT id FROM employee_attendance WHERE intern_id=? AND date=?`,
                [req_.intern_id, req_.date]
            );
            const nowIST = istDateTimeStr();
            if (existing.length) {
                await db.execute(
                    `UPDATE employee_attendance SET status=?, admin_override=1, admin_notes=?, override_by=?, updated_at=? WHERE intern_id=? AND date=?`,
                    [req_.requested_status, `Correction approved: ${admin_note || ''}`, req.user.id, nowIST, req_.intern_id, req_.date]
                );
            } else {
                await db.execute(
                    `INSERT INTO employee_attendance (intern_id, date, status, admin_override, admin_notes, override_by, created_at, updated_at) VALUES (?,?,?,1,?,?,?,?)`,
                    [req_.intern_id, req_.date, req_.requested_status, `Correction approved: ${admin_note || ''}`, req.user.id, nowIST, nowIST]
                );
            }
            // Notify employee
            db.execute(
                `INSERT INTO notifications (admin_id, intern_id, sender_id, sender_name, title, message, type) VALUES (NULL,?,?,?,?,?,'info')`,
                [req_.intern_id, req.user.id, req.user.name || 'Admin',
                 'Attendance Correction Approved', `Your attendance correction for ${req_.date} has been approved.`]
            ).catch(() => {});
        } else {
            db.execute(
                `INSERT INTO notifications (admin_id, intern_id, sender_id, sender_name, title, message, type) VALUES (NULL,?,?,?,?,?,'info')`,
                [req_.intern_id, req.user.id, req.user.name || 'Admin',
                 'Attendance Correction Denied', `Your attendance correction for ${req_.date} was not approved. ${admin_note || ''}`]
            ).catch(() => {});
        }

        res.json({ status: 'success', message: `Request ${action}` });
    } catch (err) {
        logger.error('handleCorrectionRequest failed', { admin_id: req.user.id, error: err.message });
        res.status(500).json({ status: 'error', message: 'Server error' });
    }
};

// ─────────────────────────────────────────────
// GET /api/admin/employees/with-attendance
// Returns employee list with today's attendance status
// ─────────────────────────────────────────────
exports.listEmployeesWithAttendance = async (req, res) => {
    try {
        const today = istDateStr();
        const [rows] = await db.execute(
            `SELECT i.intern_id, i.name, i.email, i.mobile, i.designation, i.profile_pic,
                    i.employee_id, i.role, i.is_active, i.joined_at AS joining_date,
                    d.name AS domain_name,
                    a.status AS today_status, a.check_in AS today_check_in, a.check_out AS today_check_out,
                    (SELECT COUNT(*) FROM employee_tasks t WHERE t.assigned_to = i.intern_id AND t.status IN ('Pending','In Progress')) AS active_tasks
             FROM interns i
             LEFT JOIN domains d ON i.domain_id = d.domain_id
             LEFT JOIN employee_attendance a ON a.intern_id = i.intern_id AND a.date = ?
             WHERE i.role = 'employee' AND i.is_active = 1
             ORDER BY i.name ASC`,
            [today]
        );
        res.json({ status: 'success', data: rows });
    } catch (err) {
        logger.error('listEmployeesWithAttendance failed', { admin_id: req.user?.id, error: err.message });
        res.status(500).json({ status: 'error', message: 'Server error' });
    }
};

// ─────────────────────────────────────────────
// GET /api/admin/employees/:id/overview
// ─────────────────────────────────────────────
exports.getEmployeeOverview = async (req, res) => {
    try {
        const empId = parseInt(req.params.id);
        if (!empId || empId < 1) return res.status(400).json({ status: 'error', message: 'Invalid employee ID' });

        const today = istDateStr();
        const currentMonth = today.slice(0, 7); // YYYY-MM

        // Profile
        const [profile] = await db.execute(
            `SELECT i.intern_id, i.name, i.email, i.mobile, i.designation, i.profile_pic,
                    i.employee_id, i.role, i.is_active, i.joined_at AS joining_date,
                    d.name AS domain_name
             FROM interns i
             LEFT JOIN domains d ON i.domain_id = d.domain_id
             WHERE i.intern_id = ? AND i.role = 'employee'`,
            [empId]
        );
        if (!profile.length) return res.status(404).json({ status: 'error', message: 'Employee not found' });

        // Today attendance
        const [todayAtt] = await db.execute(
            `SELECT status, check_in, check_out FROM employee_attendance WHERE intern_id = ? AND date = ?`,
            [empId, today]
        );

        // Month attendance summary
        const [monthAtt] = await db.execute(
            `SELECT
                SUM(status = 'present') AS present,
                SUM(status = 'absent') AS absent,
                SUM(status = 'half_day') AS half_day,
                SUM(status = 'late') AS late,
                COUNT(*) AS total_records
             FROM employee_attendance
             WHERE intern_id = ? AND DATE_FORMAT(date, '%Y-%m') = ?`,
            [empId, currentMonth]
        );

        // Task stats
        const [taskStats] = await db.execute(
            `SELECT
                COUNT(*) AS total,
                SUM(status = 'Pending') AS pending,
                SUM(status = 'In Progress') AS in_progress,
                SUM(status = 'Completed') AS completed,
                SUM(status != 'Completed' AND deadline < ? AND deadline IS NOT NULL) AS overdue
             FROM employee_tasks WHERE assigned_to = ?`,
            [today, empId]
        );

        // EOD streak (consecutive days with at least one EOD update)
        const [eodDays] = await db.execute(
            `SELECT DISTINCT date FROM employee_eod_updates WHERE intern_id = ? ORDER BY date DESC LIMIT 30`,
            [empId]
        );
        let streak = 0;
        const todayDate = new Date(today);
        for (let i = 0; i < eodDays.length; i++) {
            const d = new Date(eodDays[i].date);
            const diff = Math.round((todayDate - d) / 86400000);
            if (diff === i || diff === i + 1) streak++;
            else break;
        }

        // Last activity (most recent across attendance, tasks, eod)
        const [lastActivity] = await db.execute(
            `SELECT MAX(ts) AS last_seen FROM (
                SELECT updated_at AS ts FROM employee_attendance WHERE intern_id = ?
                UNION ALL
                SELECT updated_at AS ts FROM employee_tasks WHERE assigned_to = ?
                UNION ALL
                SELECT created_at AS ts FROM employee_eod_updates WHERE intern_id = ?
            ) sub`,
            [empId, empId, empId]
        );

        res.json({
            status: 'success',
            data: {
                profile: profile[0],
                today_attendance: todayAtt[0] || null,
                month_attendance: monthAtt[0],
                task_stats: taskStats[0],
                eod_streak: streak,
                last_active: lastActivity[0]?.last_seen || null,
            }
        });
    } catch (err) {
        logger.error('getEmployeeOverview failed', { admin_id: req.user?.id, error: err.message });
        res.status(500).json({ status: 'error', message: 'Server error' });
    }
};

// ─────────────────────────────────────────────
// GET /api/admin/employees/:id/activity
// Returns unified activity log (attendance + tasks + eod + comments)
// ─────────────────────────────────────────────
exports.getEmployeeActivity = async (req, res) => {
    try {
        const empId = parseInt(req.params.id);
        if (!empId || empId < 1) return res.status(400).json({ status: 'error', message: 'Invalid employee ID' });

        const limit = Math.min(100, parseInt(req.query.limit) || 50);

        const [rows] = await db.execute(
            `SELECT ts, type, detail FROM (
                SELECT updated_at AS ts, 'attendance' AS type,
                    CONCAT('Attendance: ', status, IF(admin_override=1, ' (admin override)', '')) AS detail
                FROM employee_attendance WHERE intern_id = ?

                UNION ALL

                SELECT updated_at AS ts, 'task' AS type,
                    CONCAT('Task: ', title, ' [', status, ']') AS detail
                FROM employee_tasks WHERE assigned_to = ?

                UNION ALL

                SELECT created_at AS ts, 'eod' AS type,
                    CONCAT('EOD: ', title, ' (', progress, '%)') AS detail
                FROM employee_eod_updates WHERE intern_id = ?

                UNION ALL

                SELECT c.created_at AS ts, 'comment' AS type,
                    CONCAT('Comment on task #', c.task_id, ': ', LEFT(c.content, 80)) AS detail
                FROM employee_task_comments c WHERE c.author_id = ? AND c.author_type = 'employee'
            ) activity
            ORDER BY ts DESC
            LIMIT ?`,
            [empId, empId, empId, empId, limit]
        );

        res.json({ status: 'success', data: rows });
    } catch (err) {
        logger.error('getEmployeeActivity failed', { admin_id: req.user?.id, error: err.message });
        res.status(500).json({ status: 'error', message: 'Server error' });
    }
};

// ─────────────────────────────────────────────
// GET /api/admin/employees/:id/report
// Downloads XLSX report: Attendance + Tasks + EOD sheets
// ─────────────────────────────────────────────
exports.downloadEmployeeReport = async (req, res) => {
    try {
        const empId = parseInt(req.params.id);
        if (!empId || empId < 1) return res.status(400).json({ status: 'error', message: 'Invalid employee ID' });

        const { month } = req.query; // optional YYYY-MM filter

        // Fetch employee name
        const [emp] = await db.execute(
            `SELECT name, employee_id FROM interns WHERE intern_id = ? AND role = 'employee'`,
            [empId]
        );
        if (!emp.length) return res.status(404).json({ status: 'error', message: 'Employee not found' });

        // Attendance data
        let attSql = `SELECT date, status, check_in, check_out, admin_override, admin_notes FROM employee_attendance WHERE intern_id = ?`;
        const attParams = [empId];
        if (month) { attSql += ` AND DATE_FORMAT(date, '%Y-%m') = ?`; attParams.push(month); }
        attSql += ` ORDER BY date ASC`;
        const [attRows] = await db.execute(attSql, attParams);

        // Task data
        let taskSql = `SELECT title, status, priority, deadline, progress_percent, created_at, updated_at FROM employee_tasks WHERE assigned_to = ?`;
        const taskParams = [empId];
        if (month) { taskSql += ` AND DATE_FORMAT(created_at, '%Y-%m') = ?`; taskParams.push(month); }
        taskSql += ` ORDER BY created_at DESC`;
        const [taskRows] = await db.execute(taskSql, taskParams);

        // EOD data
        let eodSql = `SELECT date, title, description, progress FROM employee_eod_updates WHERE intern_id = ?`;
        const eodParams = [empId];
        if (month) { eodSql += ` AND DATE_FORMAT(date, '%Y-%m') = ?`; eodParams.push(month); }
        eodSql += ` ORDER BY date DESC`;
        const [eodRows] = await db.execute(eodSql, eodParams);

        const XLSX = require('xlsx');
        const wb = XLSX.utils.book_new();

        // Attendance sheet
        const attSheet = XLSX.utils.json_to_sheet(attRows.map(r => ({
            Date: r.date,
            Status: r.status,
            'Check In': r.check_in || '',
            'Check Out': r.check_out || '',
            'Admin Override': r.admin_override ? 'Yes' : 'No',
            'Admin Notes': r.admin_notes || '',
        })));
        XLSX.utils.book_append_sheet(wb, attSheet, 'Attendance');

        // Tasks sheet
        const taskSheet = XLSX.utils.json_to_sheet(taskRows.map(r => ({
            Title: r.title,
            Status: r.status,
            Priority: r.priority,
            Deadline: r.deadline || '',
            'Progress %': r.progress_percent,
            'Created': r.created_at,
            'Updated': r.updated_at,
        })));
        XLSX.utils.book_append_sheet(wb, taskSheet, 'Tasks');

        // EOD sheet
        const eodSheet = XLSX.utils.json_to_sheet(eodRows.map(r => ({
            Date: r.date,
            Title: r.title,
            Description: r.description || '',
            'Progress %': r.progress,
        })));
        XLSX.utils.book_append_sheet(wb, eodSheet, 'EOD Updates');

        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        const fileName = `${emp[0].name.replace(/\s+/g, '_')}_${month || 'all'}_report.xlsx`;

        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buf);

        logger.audit('DOWNLOAD_EMPLOYEE_REPORT', {
            admin_id: req.user?.id,
            employee_intern_id: empId,
            employee_name: emp[0].name,
            month: month || 'all',
            timestamp: istDateTimeStr(),
        });
    } catch (err) {
        logger.error('downloadEmployeeReport failed', { admin_id: req.user?.id, error: err.message });
        res.status(500).json({ status: 'error', message: 'Server error' });
    }
};

const db = require('../config/db');
const logger = require('../utils/logger');
const { istDateStr } = require('../utils/dateUtils');
const emailService = require('../services/emailService');
const notificationController = require('./notification.controller');

// ─── Saturday alternating logic ───────────────────────────────────────────────
// Reference: 2026-01-03 is the 1st Saturday of 2026 → OFF day
// Pattern: OFF, WORKING, OFF, WORKING...  (every other Saturday)
const REF_OFF_SAT_MS = new Date('2026-01-03T00:00:00Z').getTime();

function isDefaultWorkingSaturday(dateStr) {
    const ms = new Date(dateStr + 'T00:00:00Z').getTime();
    const weeksDiff = Math.round((ms - REF_OFF_SAT_MS) / (7 * 86400000));
    return weeksDiff % 2 !== 0; // alternates: 0=off,1=working,2=off...
}

/**
 * Compute the default type for a given YYYY-MM-DD date string.
 * Returns 'leave' | 'working'
 */
function defaultDayType(dateStr) {
    const d = new Date(dateStr + 'T00:00:00Z');
    const dow = d.getUTCDay(); // 0=Sun, 6=Sat
    if (dow === 0) return 'leave';                            // Sunday always off
    if (dow === 6) return isDefaultWorkingSaturday(dateStr) ? 'working' : 'leave';
    return 'working';                                          // Mon–Fri always working
}

// ─── GET /api/calendar?month=YYYY-MM ─────────────────────────────────────────
const getCalendar = async (req, res) => {
    try {
        const month = req.query.month || istDateStr().slice(0, 7);
        if (!/^\d{4}-\d{2}$/.test(month)) {
            return res.status(400).json({ status: 'error', message: 'month must be YYYY-MM' });
        }

        const [year, mon] = month.split('-').map(Number);
        const daysInMonth = new Date(year, mon, 0).getDate();

        // Fetch all overrides for this month from DB
        const [overrides] = await db.execute(
            `SELECT o.date, o.type, o.reason, a.name as admin_name
             FROM working_calendar_overrides o
             LEFT JOIN admins a ON o.created_by = a.admin_id
             WHERE o.date BETWEEN ? AND ?`,
            [`${month}-01`, `${month}-${String(daysInMonth).padStart(2, '0')}`]
        );

        const toDateKey = (d) => {
            if (typeof d === 'string') return d.slice(0, 10);
            if (d instanceof Date) return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            return String(d).slice(0, 10);
        };
        const overrideMap = {};
        overrides.forEach(r => { overrideMap[toDateKey(r.date)] = r; });

        // Build day-by-day calendar
        const calendar = {};
        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${year}-${String(mon).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const ov = overrideMap[dateStr];
            if (ov) {
                calendar[dateStr] = {
                    type: ov.type,
                    override: true,
                    reason: ov.reason,
                    admin_name: ov.admin_name,
                };
            } else {
                calendar[dateStr] = {
                    type: defaultDayType(dateStr),
                    override: false,
                    reason: defaultDayType(dateStr) === 'leave'
                        ? (new Date(dateStr + 'T00:00:00Z').getUTCDay() === 0 ? 'Sunday' : 'Off Saturday')
                        : null,
                };
            }
        }

        res.json({ status: 'success', data: { month, calendar } });
    } catch (err) {
        logger.error('getCalendar error', { error: err.message });
        res.status(500).json({ status: 'error', message: 'Failed to fetch calendar' });
    }
};

// ─── POST /api/admin/calendar/override ───────────────────────────────────────
const setOverride = async (req, res) => {
    try {
        const adminId = req.user.id;
        const { date, type, reason } = req.body;

        if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date))
            return res.status(400).json({ status: 'error', message: 'date must be YYYY-MM-DD' });
        if (!['working', 'leave'].includes(type))
            return res.status(400).json({ status: 'error', message: 'type must be working or leave' });
        if (!reason || !reason.trim() || reason.trim().length < 3)
            return res.status(400).json({ status: 'error', message: 'reason is required (min 3 chars)' });

        await db.execute(
            `INSERT INTO working_calendar_overrides (date, type, reason, created_by)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE type = VALUES(type), reason = VALUES(reason), created_by = VALUES(created_by), updated_at = CURRENT_TIMESTAMP`,
            [date, type, reason.trim(), adminId]
        );

        logger.audit('CALENDAR_OVERRIDE', { admin_id: adminId, date, type, reason });

        // Notify all active employees + offline interns (fire-and-forget)
        _notifyCalendarChange(adminId, date, type, reason.trim()).catch(e =>
            logger.error('calendar notify error', { error: e.message })
        );

        res.json({ status: 'success', message: `${date} marked as ${type}` });
    } catch (err) {
        logger.error('setOverride error', { error: err.message });
        res.status(500).json({ status: 'error', message: 'Failed to set override' });
    }
};

// ─── DELETE /api/admin/calendar/override/:date ────────────────────────────────
const removeOverride = async (req, res) => {
    try {
        const { date } = req.params;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
            return res.status(400).json({ status: 'error', message: 'date must be YYYY-MM-DD' });

        const [result] = await db.execute(
            `DELETE FROM working_calendar_overrides WHERE date = ?`, [date]
        );

        if (result.affectedRows === 0)
            return res.status(404).json({ status: 'error', message: 'No override found for this date' });

        logger.audit('CALENDAR_OVERRIDE_REMOVED', { admin_id: req.user.id, date });
        res.json({ status: 'success', message: `Override for ${date} removed` });
    } catch (err) {
        logger.error('removeOverride error', { error: err.message });
        res.status(500).json({ status: 'error', message: 'Failed to remove override' });
    }
};

// ─── GET /api/admin/calendar/overrides?month=YYYY-MM ──────────────────────────
const listOverrides = async (req, res) => {
    try {
        const month = req.query.month || istDateStr().slice(0, 7);
        if (!/^\d{4}-\d{2}$/.test(month))
            return res.status(400).json({ status: 'error', message: 'month must be YYYY-MM' });

        const [mon] = [month.split('-')[1]];
        const year  = month.split('-')[0];
        const last  = new Date(Number(year), Number(mon), 0).getDate();

        const [rows] = await db.execute(
            `SELECT o.id, o.date, o.type, o.reason, a.name as admin_name, o.created_at, o.updated_at
             FROM working_calendar_overrides o
             LEFT JOIN admins a ON o.created_by = a.admin_id
             WHERE o.date BETWEEN ? AND ?
             ORDER BY o.date ASC`,
            [`${month}-01`, `${month}-${String(last).padStart(2, '0')}`]
        );

        res.json({ status: 'success', data: rows });
    } catch (err) {
        logger.error('listOverrides error', { error: err.message });
        res.status(500).json({ status: 'error', message: 'Failed to fetch overrides' });
    }
};

// ─── Internal: send notifications on calendar change ─────────────────────────
async function _notifyCalendarChange(adminId, date, type, reason) {
    // Get all active employees + offline interns with their email
    const [recipients] = await db.execute(
        `SELECT intern_id, name, email FROM interns
         WHERE is_active = 1 AND (role = 'employee' OR is_offline = 1) AND email IS NOT NULL`
    );
    if (recipients.length === 0) return;

    const [adminRows] = await db.execute(
        `SELECT name FROM admins WHERE admin_id = ?`, [adminId]
    );
    const adminName = adminRows[0]?.name || 'Admin';
    const label = type === 'leave' ? 'Leave Day' : 'Working Day';
    const formattedDate = new Date(date + 'T00:00:00').toLocaleDateString('en-IN', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    // In-app bulk notifications
    if (recipients.length > 0) {
        const notifValues = recipients.map(r =>
            [r.intern_id, adminId, adminName, `Calendar Update: ${formattedDate}`, `${formattedDate} is now a ${label}. Reason: ${reason}`, 'info']
        );
        const placeholders = notifValues.map(() => '(?,?,?,?,?,?)').join(',');
        await db.execute(
            `INSERT INTO notifications (intern_id, sender_id, sender_name, title, message, type) VALUES ${placeholders}`,
            notifValues.flat()
        );
    }

    // Emails (fire each, don't block)
    for (const r of recipients) {
        emailService.sendCalendarUpdateEmail(r.email, r.name, formattedDate, type, reason, adminName)
            .catch(e => logger.error('calendar email failed', { to: r.email, error: e.message }));
    }
}

module.exports = { getCalendar, setOverride, removeOverride, listOverrides };

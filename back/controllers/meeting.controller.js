const db = require("../config/db");

// ---------------------------
// Get ALL Meetings - Active batch only (+ general meetings)
// ---------------------------
const getAllMeetings = async (req, res) => {
    try {
        const { type, batchId, domainId, mode } = req.query; // type: online | offline, mode: online | offline

        let query = `
            SELECT 
                m.meeting_id AS id,
                m.title,
                m.description,
                m.meeting_link AS meetLink,
                m.scheduled_at AS scheduledAt,
                m.meeting_type AS type,
                m.target_mode AS targetMode,
                d.name AS domain,
                d.domain_id AS domainId,
                COALESCE(a.name, i.name, 'Admin') AS createdBy,
                a.admin_id AS createdById,
                m.intern_id AS internId
            FROM meetings m
            LEFT JOIN domains d ON m.domain_id = d.domain_id
            LEFT JOIN admins a ON m.created_by = a.admin_id
            LEFT JOIN interns i ON m.intern_id = i.intern_id
            WHERE 1=1
        `;

        const queryParams = [];

        // Filtering by Batch
        if (batchId) {
            query += " AND (m.batch = ? OR m.batch IS NULL)";
            queryParams.push(batchId);
        } else {
            // Default to active batches if no specific batchId is provided
            const [activeBatches] = await db.execute("SELECT id FROM batch WHERE is_active = 1");
            const activeBatchIds = activeBatches.map(b => b.id);
            if (activeBatchIds.length > 0) {
                query += ` AND (m.batch IS NULL OR m.batch IN (${activeBatchIds.map(() => '?').join(',')}))`;
                queryParams.push(...activeBatchIds);
            } else {
                query += " AND m.batch IS NULL";
            }
        }

        // Filtering by Mode
        const activeMode = type || mode;
        if (activeMode) {
            query += " AND (m.target_mode = 'all' OR m.target_mode = ?)";
            queryParams.push(activeMode);
        }

        // Filtering by Domain
        if (domainId) {
            const domainIds = domainId.toString().split(',');
            query += ` AND (m.domain_id IN (${domainIds.map(() => '?').join(',')}) OR m.domain_id IS NULL)`;
            queryParams.push(...domainIds);
        }

        query += " ORDER BY m.scheduled_at ASC";

        const [rows] = await db.execute(query, queryParams);

        const meetings = rows.map(meeting => ({
            ...meeting,
            date: meeting.scheduledAt ? new Date(meeting.scheduledAt) : null,
            startHour: meeting.scheduledAt ? new Date(meeting.scheduledAt).getHours() : 0,
            startMin: meeting.scheduledAt ? new Date(meeting.scheduledAt).getMinutes() : 0,
        }));

        res.status(200).json({ status: "success", data: { meetings } });
    } catch (error) {
        console.error("Error fetching meetings:", error);
        res.status(500).json({ status: "error", message: "Failed to fetch meetings" });
    }
};

// ---------------------------
// Get Upcoming Meetings - Filtered by context
// ---------------------------
const getUpcomingMeetings = async (req, res) => {
    try {
        const { limit = 10, batchId, domainId, mode } = req.query;

        let query = `
            SELECT 
                m.meeting_id AS id,
                m.title,
                m.description,
                m.meeting_link AS meetLink,
                m.scheduled_at AS scheduledAt,
                m.meeting_type AS type,
                m.target_mode AS targetMode,
                d.name AS domain,
                d.domain_id AS domainId,
                COALESCE(a.name, i.name, 'Admin') AS createdBy,
                a.admin_id AS createdById,
                m.intern_id AS internId
            FROM meetings m
            LEFT JOIN domains d ON m.domain_id = d.domain_id
            LEFT JOIN admins a ON m.created_by = a.admin_id
            LEFT JOIN interns i ON m.intern_id = i.intern_id
            WHERE m.scheduled_at >= NOW()
        `;

        const queryParams = [];

        if (batchId) {
            query += " AND (m.batch = ? OR m.batch IS NULL)";
            queryParams.push(batchId);
        }

        if (mode) {
            query += " AND (m.target_mode = 'all' OR m.target_mode = ?)";
            queryParams.push(mode);
        }

        if (domainId) {
            query += " AND (m.domain_id = ? OR m.domain_id IS NULL)";
            queryParams.push(domainId);
        }

        query += " ORDER BY m.scheduled_at ASC LIMIT ?";
        queryParams.push(parseInt(limit));

        const [rows] = await db.execute(query, queryParams);

        const meetings = rows.map(meeting => ({
            ...meeting,
            date: meeting.scheduledAt ? new Date(meeting.scheduledAt) : null,
            startHour: meeting.scheduledAt ? new Date(meeting.scheduledAt).getHours() : 0,
            startMin: meeting.scheduledAt ? new Date(meeting.scheduledAt).getMinutes() : 0,
        }));

        res.status(200).json({ status: "success", data: { meetings } });
    } catch (error) {
        console.error("Error fetching upcoming meetings:", error);
        res.status(500).json({ status: "error", message: "Failed to fetch upcoming meetings" });
    }
};

// ---------------------------
// Get Meetings by Date Range - Filtered by context
// ---------------------------
const getMeetingsByDateRange = async (req, res) => {
    try {
        const { startDate, endDate, batchId, domainId, mode } = req.query;

        if (!startDate || !endDate) {
            return res.status(400).json({
                status: "error",
                message: "startDate and endDate are required"
            });
        }

        let query = `
            SELECT 
                m.meeting_id AS id,
                m.title,
                m.description,
                m.meeting_link AS meetLink,
                m.scheduled_at AS scheduledAt,
                m.meeting_type AS type,
                m.target_mode AS targetMode,
                d.name AS domain,
                d.domain_id AS domainId,
                COALESCE(a.name, i.name, 'Admin') AS createdBy,
                a.admin_id AS createdById,
                m.intern_id AS internId
            FROM meetings m
            LEFT JOIN domains d ON m.domain_id = d.domain_id
            LEFT JOIN admins a ON m.created_by = a.admin_id
            LEFT JOIN interns i ON m.intern_id = i.intern_id
            WHERE DATE(m.scheduled_at) BETWEEN ? AND ?
        `;

        const queryParams = [startDate, endDate];

        if (batchId) {
            query += " AND (m.batch = ? OR m.batch IS NULL)";
            queryParams.push(batchId);
        }

        if (mode) {
            query += " AND (m.target_mode = 'all' OR m.target_mode = ?)";
            queryParams.push(mode);
        }

        if (domainId) {
            query += " AND (m.domain_id = ? OR m.domain_id IS NULL)";
            queryParams.push(domainId);
        }

        query += " ORDER BY m.scheduled_at ASC";

        const [rows] = await db.execute(query, queryParams);

        const meetings = rows.map(meeting => ({
            ...meeting,
            date: meeting.scheduledAt ? new Date(meeting.scheduledAt) : null,
            startHour: meeting.scheduledAt ? new Date(meeting.scheduledAt).getHours() : 0,
            startMin: meeting.scheduledAt ? new Date(meeting.scheduledAt).getMinutes() : 0,
        }));

        res.status(200).json({ status: "success", data: { meetings } });
    } catch (error) {
        console.error("Error fetching meetings by date range:", error);
        res.status(500).json({ status: "error", message: "Failed to fetch meetings" });
    }
};

// ---------------------------
// Get Meetings by Domain - Context Aware
// ---------------------------
const getMeetingsByDomain = async (req, res) => {
    try {
        const { domain } = req.params;
        const { batchId, mode } = req.query;

        // Get domain_id first
        const [domainRows] = await db.execute(
            "SELECT domain_id FROM domains WHERE UPPER(name) = ?",
            [domain.toUpperCase()]
        );

        if (domainRows.length === 0) {
            return res.status(200).json({ status: "success", data: { meetings: [] } });
        }

        const domainId = domainRows[0].domain_id;

        let query = `
            SELECT 
                m.meeting_id AS id,
                m.title,
                m.description,
                m.meeting_link AS meetLink,
                m.scheduled_at AS scheduledAt,
                m.meeting_type AS type,
                m.target_mode AS targetMode,
                d.name AS domain,
                d.domain_id AS domainId,
                COALESCE(a.name, i.name, 'Admin') AS createdBy
            FROM meetings m
            LEFT JOIN domains d ON m.domain_id = d.domain_id
            LEFT JOIN admins a ON m.created_by = a.admin_id
            LEFT JOIN interns i ON m.intern_id = i.intern_id
            WHERE (m.domain_id = ? OR m.domain_id IS NULL)
        `;

        const queryParams = [domainId];

        if (batchId) {
            query += " AND (m.batch IS NULL OR m.batch = ?)";
            queryParams.push(batchId);
        } else {
            // If no specific batch, show global + active batches
            const [activeBatches] = await db.execute("SELECT id FROM batch WHERE is_active = 1");
            const activeBatchIds = activeBatches.map(b => b.id);
            if (activeBatchIds.length > 0) {
                query += ` AND (m.batch IS NULL OR m.batch IN (${activeBatchIds.map(() => '?').join(',')}))`;
                queryParams.push(...activeBatchIds);
            }
        }

        if (mode) {
            query += " AND (m.target_mode = 'all' OR m.target_mode = ?)";
            queryParams.push(mode);
        }

        query += " ORDER BY m.scheduled_at ASC";

        const [rows] = await db.execute(query, queryParams);

        const meetings = rows.map(meeting => ({
            ...meeting,
            date: meeting.scheduledAt ? new Date(meeting.scheduledAt) : null,
            startHour: meeting.scheduledAt ? new Date(meeting.scheduledAt).getHours() : 0,
            startMin: meeting.scheduledAt ? new Date(meeting.scheduledAt).getMinutes() : 0,
        }));

        res.status(200).json({ status: "success", data: { meetings } });
    } catch (error) {
        console.error("Error fetching meetings by domain:", error);
        res.status(500).json({ status: "error", message: "Failed to fetch meetings" });
    }
};

// ---------------------------
// Helper: Convert ISO to MySQL DATETIME
// ---------------------------
function toMySQLDate(isoString) {
    const date = new Date(isoString);
    const pad = (n) => String(n).padStart(2, "0");

    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
        `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

// ---------------------------
// CREATE Meeting
// ---------------------------
const createMeeting = async (req, res) => {
    try {
        const {
            title,
            description,
            domainName,
            meetingLink,
            scheduledAt,
            createdBy,
            internId,
            meetingType,
            targetMode,
            batchId
        } = req.body;

        if (!title || !domainName || !scheduledAt) {
            return res.status(400).json({
                status: "error",
                message: "Title, domain, and scheduled time are required"
            });
        }

        // Get domain_id
        const [domainRows] = await db.execute(
            `SELECT domain_id FROM domains WHERE UPPER(name) = ?`,
            [domainName.toUpperCase()]
        );

        if (domainRows.length === 0) {
            return res.status(404).json({
                status: "error",
                message: `Domain '${domainName}' not found`
            });
        }

        const domainId = domainRows[0].domain_id;

        // Final batch ID selection
        let finalBatchId = batchId || null;
        if (!finalBatchId) {
            // Auto-assign to active batch or NULL if none
            const [activeBatch] = await db.execute("SELECT id FROM batch WHERE is_active = 1 LIMIT 1");
            finalBatchId = activeBatch.length > 0 ? activeBatch[0].id : null;
        }

        // Insert meeting
        const [result] = await db.execute(
            `INSERT INTO meetings (title, description, domain_id, meeting_link, scheduled_at, created_by, intern_id, batch, meeting_type, target_mode)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                title,
                description || null,
                domainId,
                meetingLink || null,
                toMySQLDate(scheduledAt),
                createdBy || (internId ? null : 1),
                internId || null,
                finalBatchId,
                meetingType || 'meeting',
                targetMode || 'all'
            ]
        );

        // Fetch the created meeting
        const [createdMeeting] = await db.execute(
            `SELECT 
                m.meeting_id as id,
                m.title,
                m.description,
                m.meeting_link as meetLink,
                m.scheduled_at as scheduledAt,
                m.meeting_type as type,
                m.target_mode as targetMode,
                d.name as domain,
                d.domain_id as domainId,
                COALESCE(a.name, i.name, 'Admin') as createdBy,
                a.admin_id as createdById,
                m.intern_id as internId
            FROM meetings m
            LEFT JOIN domains d ON m.domain_id = d.domain_id
            LEFT JOIN admins a ON m.created_by = a.admin_id
            LEFT JOIN interns i ON m.intern_id = i.intern_id
            WHERE m.meeting_id = ?`,
            [result.insertId]
        );

        const meeting = {
            ...createdMeeting[0],
            date: createdMeeting[0].scheduledAt ? new Date(createdMeeting[0].scheduledAt) : null,
            startHour: createdMeeting[0].scheduledAt ? new Date(createdMeeting[0].scheduledAt).getHours() : 0,
            startMin: createdMeeting[0].scheduledAt ? new Date(createdMeeting[0].scheduledAt).getMinutes() : 0,
        };

        return res.status(201).json({
            status: "success",
            data: { meeting }
        });

    } catch (error) {
        console.error("Error creating meeting:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to create meeting",
            error: error.message
        });
    }
};

// ---------------------------
// UPDATE Meeting
// ---------------------------
const updateMeeting = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, description, domainName, meetingLink, scheduledAt, meetingType, targetMode, batchId } = req.body;

        const [existing] = await db.execute(
            `SELECT meeting_id FROM meetings WHERE meeting_id = ?`,
            [id]
        );

        if (existing.length === 0) {
            return res.status(404).json({ status: "error", message: "Meeting not found" });
        }

        let domainId = null;
        if (domainName) {
            const [domainRows] = await db.execute(
                `SELECT domain_id FROM domains WHERE UPPER(name) = ?`,
                [domainName.toUpperCase()]
            );

            if (domainRows.length === 0) {
                return res.status(404).json({
                    status: "error",
                    message: `Domain '${domainName}' not found`
                });
            }

            domainId = domainRows[0].domain_id;
        }

        const updates = [];
        const values = [];

        if (title !== undefined) { updates.push("title = ?"); values.push(title); }
        if (description !== undefined) { updates.push("description = ?"); values.push(description); }
        if (domainId !== null) { updates.push("domain_id = ?"); values.push(domainId); }
        if (meetingLink !== undefined) { updates.push("meeting_link = ?"); values.push(meetingLink); }
        if (meetingType !== undefined) { updates.push("meeting_type = ?"); values.push(meetingType); }
        if (targetMode !== undefined) { updates.push("target_mode = ?"); values.push(targetMode); }
        if (batchId !== undefined) { updates.push("batch = ?"); values.push(batchId); }
        if (scheduledAt !== undefined) {
            updates.push("scheduled_at = ?");
            values.push(toMySQLDate(scheduledAt));
        }

        if (updates.length === 0) {
            return res.status(400).json({ status: "error", message: "No fields to update" });
        }

        values.push(id);

        await db.execute(
            `UPDATE meetings SET ${updates.join(", ")} WHERE meeting_id = ?`,
            values
        );

        const [updatedMeeting] = await db.execute(`
            SELECT 
                m.meeting_id AS id,
                m.title,
                m.description,
                m.meeting_link AS meetLink,
                m.scheduled_at AS scheduledAt,
                m.meeting_type AS type,
                m.target_mode AS targetMode,
                d.name AS domain,
                d.domain_id AS domainId,
                a.name AS createdBy,
                a.admin_id AS createdById
            FROM meetings m
            LEFT JOIN domains d ON m.domain_id = d.domain_id
            LEFT JOIN admins a ON m.created_by = a.admin_id
            WHERE m.meeting_id = ?
        `, [id]);

        const meeting = {
            ...updatedMeeting[0],
            date: updatedMeeting[0].scheduledAt ? new Date(updatedMeeting[0].scheduledAt) : null,
            startHour: updatedMeeting[0].scheduledAt ? new Date(updatedMeeting[0].scheduledAt).getHours() : 0,
            startMin: updatedMeeting[0].scheduledAt ? new Date(updatedMeeting[0].scheduledAt).getMinutes() : 0,
        };

        res.status(200).json({ status: "success", data: { meeting } });
    } catch (error) {
        console.error("Error updating meeting:", error);
        res.status(500).json({ status: "error", message: "Failed to update meeting" });
    }
};

// ---------------------------
// DELETE Meeting
// ---------------------------
const deleteMeeting = async (req, res) => {
    try {
        const { id } = req.params;

        const [existing] = await db.execute(
            `SELECT meeting_id FROM meetings WHERE meeting_id = ?`,
            [id]
        );

        if (existing.length === 0) {
            return res.status(404).json({ status: "error", message: "Meeting not found" });
        }

        await db.execute(`DELETE FROM meetings WHERE meeting_id = ?`, [id]);

        res.status(200).json({ status: "success", message: "Meeting deleted successfully" });
    } catch (error) {
        console.error("Error deleting meeting:", error);
        res.status(500).json({ status: "error", message: "Failed to delete meeting" });
    }
};

// ---------------------------
// Meeting Stats
// ---------------------------
const getMeetingStats = async (req, res) => {
    try {
        const [totalRows] = await db.execute(`SELECT COUNT(*) AS total FROM meetings`);
        const [upcomingRows] = await db.execute(`SELECT COUNT(*) AS upcoming FROM meetings WHERE scheduled_at >= NOW()`);
        const [pastRows] = await db.execute(`SELECT COUNT(*) AS past FROM meetings WHERE scheduled_at < NOW()`);

        const [domainRows] = await db.execute(`
            SELECT 
                d.name AS domain,
                COUNT(m.meeting_id) AS count
            FROM domains d
            LEFT JOIN meetings m ON d.domain_id = m.domain_id
            GROUP BY d.domain_id, d.name
            ORDER BY count DESC
        `);

        res.status(200).json({
            status: "success",
            data: {
                totalMeetings: totalRows[0].total,
                upcomingMeetings: upcomingRows[0].upcoming,
                pastMeetings: pastRows[0].past,
                meetingsByDomain: domainRows
            }
        });
    } catch (error) {
        console.error("Error fetching meeting stats:", error);
        res.status(500).json({ status: "error", message: "Failed to fetch meeting statistics" });
    }
};

// EXPORT
module.exports = {
    getAllMeetings,
    getMeetingsByDomain,
    getUpcomingMeetings,
    getMeetingsByDateRange,
    createMeeting,
    updateMeeting,
    deleteMeeting,
    getMeetingStats
};
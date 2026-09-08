const db = require("../config/db");

// Reusable streak calculation
const calculateCurrentStreak = async (internId) => {
    try {
        const [rows] = await db.execute(
            `SELECT date, status FROM intern_streaks WHERE intern_id = ? ORDER BY date DESC`,
            [internId]
        );

        if (rows.length === 0) return 0;

        let streak = 0;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        for (let i = 0; i < rows.length; i++) {
            const rowDate = new Date(rows[i].date);
            rowDate.setHours(0, 0, 0, 0);

            const expectedDate = new Date(today);
            expectedDate.setDate(expectedDate.getDate() - i);

            if (rowDate.getTime() === expectedDate.getTime() && rows[i].status === "present") {
                streak++;
            } else break;
        }

        return streak;
    } catch (err) {
        console.error("Streak calc error:", err);
        return 0;
    }
};

// 🟢 NEW: Get all domains from database with counts based on mode
const getAllDomains = async (req, res) => {
    try {
        const { mode } = req.query;
        let batchCondition = "";
        let queryParams = [];
        let activeBatchId = null;

        if (mode) {
            const [batchRows] = await db.execute(
                "SELECT id FROM batch WHERE is_active = 1 AND type = ? LIMIT 1",
                [mode]
            );
            if (batchRows.length > 0) {
                activeBatchId = batchRows[0].id;
            }
        }

        // If no specific mode or no active batch for mode found, try getting any active batch as fallback
        if (!activeBatchId) {
            const [fallbackBatch] = await db.execute("SELECT id FROM batch WHERE is_active = 1 LIMIT 1");
            if (fallbackBatch.length > 0) {
                activeBatchId = fallbackBatch[0].id;
            }
        }

        const [rows] = await db.execute(`
            SELECT 
                d.domain_id,
                d.name,
                d.description,
                (SELECT COUNT(*) FROM interns i WHERE i.domain_id = d.domain_id AND i.is_active = 1 AND i.batch = ?) as intern_count,
                (SELECT COUNT(*) FROM tasks t WHERE t.domain_id = d.domain_id AND t.batch = ?) as total_tasks
            FROM domains d
            ORDER BY d.name ASC
        `, [activeBatchId, activeBatchId]);

        res.status(200).json({
            status: "success",
            domains: rows
        });

    } catch (error) {
        console.error("Get all domains error:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to fetch domains"
        });
    }
};

// 🟢 Get Interns for ANY domain (respecting mode/batch)
const getDomainInterns = async (req, res) => {
    try {
        const domainId = req.params.domain;
        const { mode } = req.query;
        let activeBatchId = null;

        if (mode) {
            const [batchRows] = await db.execute(
                "SELECT id FROM batch WHERE is_active = 1 AND type = ? LIMIT 1",
                [mode]
            );
            if (batchRows.length > 0) activeBatchId = batchRows[0].id;
        }

        if (!activeBatchId) {
            const [fallbackBatch] = await db.execute("SELECT id FROM batch WHERE is_active = 1 LIMIT 1");
            if (fallbackBatch.length > 0) activeBatchId = fallbackBatch[0].id;
        }

        if (!activeBatchId) {
            return res.status(200).json({ status: "success", data: { interns: [] } });
        }

        const [rows] = await db.execute(`
            SELECT
                i.intern_id AS id,
                i.name,
                i.email AS mail,
                i.mobile,
                i.organization,
                i.designation,
                i.university,
                i.profile_pic AS avatar,
                (SELECT COUNT(*) FROM intern_task_submissions its2 WHERE its2.intern_id = i.intern_id AND its2.status = 'approved') AS tasksCompleted,
                COALESCE((SELECT SUM(ip.points) FROM intern_points ip WHERE ip.intern_id = i.intern_id), 0) AS points
            FROM interns i
            WHERE i.is_active = 1 AND i.domain_id = ? AND i.batch = ?
            ORDER BY points DESC
        `, [domainId, activeBatchId]);

        const finished = await Promise.all(
            rows.map(async intern => ({
                ...intern,
                streak: await calculateCurrentStreak(intern.id),
                country: intern.university || 'N/A',
                state: intern.organization || 'N/A'
            }))
        );

        res.status(200).json({ status: "success", data: { interns: finished } });

    } catch (error) {
        console.error("Domain interns error:", error);
        res.status(500).json({ status: "error", message: "Failed to fetch domain interns" });
    }
};

// 🟢 Get Statistics for ANY domain
const getDomainStats = async (req, res) => {
    try {
        const domainId = req.params.domain;
        const { mode } = req.query;
        let activeBatchId = null;

        if (mode) {
            const [batchRows] = await db.execute(
                "SELECT id FROM batch WHERE is_active = 1 AND type = ? LIMIT 1",
                [mode]
            );
            if (batchRows.length > 0) activeBatchId = batchRows[0].id;
        }

        if (!activeBatchId) {
            const [fallbackBatch] = await db.execute("SELECT id FROM batch WHERE is_active = 1 LIMIT 1");
            if (fallbackBatch.length > 0) activeBatchId = fallbackBatch[0].id;
        }

        if (!activeBatchId) {
            return res.status(200).json({
                status: "success",
                data: { totalInterns: 0, averageStreak: 0, totalTasksCompleted: 0 }
            });
        }

        const [total] = await db.execute(`
            SELECT COUNT(*) AS total
            FROM interns i
            WHERE i.domain_id = ? AND i.is_active = 1 AND i.batch = ?
        `, [domainId, activeBatchId]);

        const [interns] = await db.execute(`
            SELECT intern_id FROM interns i
            WHERE i.domain_id = ? AND i.is_active = 1 AND i.batch = ?
        `, [domainId, activeBatchId]);

        let streakTotal = 0;
        for (const intern of interns) {
            streakTotal += await calculateCurrentStreak(intern.intern_id);
        }
        const avgStreak = interns.length > 0 ? Math.round(streakTotal / interns.length) : 0;

        const [tasks] = await db.execute(`
            SELECT COUNT(*) AS total_tasks
            FROM intern_task_submissions its
            JOIN interns i ON its.intern_id = i.intern_id
            WHERE its.status='approved' AND i.domain_id = ? AND i.batch = ?
        `, [domainId, activeBatchId]);

        const [totalTasksPossible] = await db.execute(`
            SELECT COUNT(*) AS total FROM tasks WHERE domain_id = ? AND batch = ?
        `, [domainId, activeBatchId]);

        res.status(200).json({
            status: "success",
            data: {
                totalInterns: total[0].total,
                averageStreak: avgStreak,
                totalTasksCompleted: tasks[0].total_tasks,
                totalTasks: totalTasksPossible[0].total
            }
        });

    } catch (error) {
        console.error("Domain stats error:", error);
        res.status(500).json({ status: "error", message: "Failed to fetch domain stats" });
    }
};

// 🟢 Get Pending Reviews Count for ANY domain
const getDomainPendingReviews = async (req, res) => {
    try {
        const domainId = req.params.domain;
        const { mode } = req.query;
        let activeBatchId = null;

        if (mode) {
            const [batchRows] = await db.execute(
                "SELECT id FROM batch WHERE is_active = 1 AND type = ? LIMIT 1",
                [mode]
            );
            if (batchRows.length > 0) activeBatchId = batchRows[0].id;
        }

        if (!activeBatchId) {
            const [fallbackBatch] = await db.execute("SELECT id FROM batch WHERE is_active = 1 LIMIT 1");
            if (fallbackBatch.length > 0) activeBatchId = fallbackBatch[0].id;
        }

        const [rows] = await db.execute(`
            SELECT COUNT(*) AS count
            FROM intern_task_submissions its
            JOIN interns i ON its.intern_id = i.intern_id
            WHERE its.status = 'pending' AND i.domain_id = ? AND i.batch = ?
        `, [domainId, activeBatchId || 0]);

        res.status(200).json({
            status: "success",
            data: { count: rows[0].count }
        });

    } catch (error) {
        console.error("Domain pending reviews error:", error);
        res.status(500).json({ status: "error", message: "Failed to fetch domain pending reviews" });
    }
};

// 🟢 NEW: Get Tasks for specific domain
const getDomainTasks = async (req, res) => {
    try {
        const domainId = req.params.domain;
        const { mode } = req.query;
        let activeBatchId = null;

        if (mode) {
            const [batchRows] = await db.execute(
                "SELECT id FROM batch WHERE is_active = 1 AND type = ? LIMIT 1",
                [mode]
            );
            if (batchRows.length > 0) activeBatchId = batchRows[0].id;
        }

        const [rows] = await db.execute(`
            SELECT 
                t.*,
                (SELECT COUNT(*) FROM intern_task_submissions its WHERE its.task_id = t.task_id AND its.status = 'approved') as completed_count,
                (SELECT COUNT(*) FROM intern_task_submissions its WHERE its.task_id = t.task_id AND its.status = 'pending') as pending_count
            FROM tasks t
            WHERE t.domain_id = ? AND (t.batch = ? OR ? IS NULL)
        `, [domainId, activeBatchId, activeBatchId]);

        res.status(200).json({
            status: "success",
            tasks: rows
        });
    } catch (error) {
        console.error("Get domain tasks error:", error);
        res.status(500).json({ status: "error", message: "Failed to fetch domain tasks" });
    }
};

module.exports = {
    getAllDomains,
    getDomainInterns,
    getDomainStats,
    getDomainPendingReviews,
    getDomainTasks
};

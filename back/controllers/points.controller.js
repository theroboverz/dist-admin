const db = require("../config/db");

// ---------------------------
// Get All Points Records
// ---------------------------
const getAllPoints = async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT 
                ip.point_id as id,
                ip.intern_id as internId,
                i.name as internName,
                d.name as domain,
                ip.points,
                ip.reason,
                ip.reference_id as referenceId,
                ip.created_at as createdAt
            FROM intern_points ip
            JOIN interns i ON ip.intern_id = i.intern_id
            LEFT JOIN domains d ON i.domain_id = d.domain_id
            ORDER BY ip.created_at DESC
        `);

        res.status(200).json({
            status: "success",
            data: { points: rows }
        });
    } catch (error) {
        console.error("Error fetching points:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to fetch points"
        });
    }
};

// ---------------------------
// Get Points by Intern ID
// ---------------------------
const getPointsByIntern = async (req, res) => {
    try {
        const { internId } = req.params;

        // Get points history
        const [points] = await db.execute(`
            SELECT 
                ip.point_id as id,
                ip.points,
                ip.reason,
                ip.reference_id as referenceId,
                ip.total_points_after as totalPointsAfter,
                ip.created_at as createdAt
            FROM intern_points ip
            WHERE ip.intern_id = ?
            ORDER BY ip.created_at DESC
        `, [internId]);

        // Get total points
        const [totalResult] = await db.execute(`
            SELECT COALESCE(SUM(points), 0) as total
            FROM intern_points
            WHERE intern_id = ?
        `, [internId]);

        res.status(200).json({
            status: "success",
            data: {
                internId: parseInt(internId),
                totalPoints: totalResult[0].total,
                pointsHistory: points
            }
        });
    } catch (error) {
        console.error("Error fetching intern points:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to fetch intern points"
        });
    }
};

// ---------------------------
// Get Points by Domain
// ---------------------------
const getPointsByDomain = async (req, res) => {
    try {
        const domainName = req.params.domain.toUpperCase();

        const [rows] = await db.execute(`
            SELECT 
                ip.point_id as id,
                ip.intern_id as internId,
                i.name as internName,
                ip.points,
                ip.reason,
                ip.reference_id as referenceId,
                ip.created_at as createdAt
            FROM intern_points ip
            JOIN interns i ON ip.intern_id = i.intern_id
            JOIN domains d ON i.domain_id = d.domain_id
            WHERE UPPER(d.name) = ?
            ORDER BY ip.created_at DESC
        `, [domainName]);

        res.status(200).json({
            status: "success",
            data: { points: rows }
        });
    } catch (error) {
        console.error("Error fetching domain points:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to fetch domain points"
        });
    }
};

// ---------------------------
// Get Leaderboard (All Domains) - Active batch only
// ---------------------------
const getLeaderboard = async (req, res) => {
    try {
        const { type } = req.query; // optional: online | offline

        let query = "SELECT id FROM batch WHERE is_active = 1";
        const params = [];

        if (type) {
            query += " AND type = ?";
            params.push(type);
        }

        const [activeBatches] = await db.execute(query, params);

        if (activeBatches.length === 0) {
            return res.status(200).json({
                status: "success",
                data: { leaderboard: [] }
            });
        }

        const activeBatchIds = activeBatches.map(b => b.id);

        const [rows] = await db.execute(`
            SELECT
                i.intern_id as internId,
                i.name as internName,
                i.email,
                COALESCE(d.name, 'No Domain') as domain,
                COALESCE(SUM(ip.points), 0) as totalPoints,
                COUNT(ip.point_id) as transactionCount,
                MAX(ip.created_at) as lastPointsDate,
                i.batch
            FROM interns i
            LEFT JOIN intern_points ip ON i.intern_id = ip.intern_id
            LEFT JOIN domains d ON i.domain_id = d.domain_id
            WHERE i.is_active = 1 AND i.batch IN (${activeBatchIds.map(() => '?').join(',')})
            GROUP BY i.intern_id, i.name, i.email, i.domain_id, i.batch
            ORDER BY totalPoints DESC
        `, activeBatchIds);

        const leaderboard = rows.map((row, index) => ({
            ...row,
            rank: index + 1
        }));

        res.status(200).json({
            status: "success",
            data: { leaderboard }
        });
    } catch (error) {
        console.error("Error fetching leaderboard:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to fetch leaderboard"
        });
    }
};

// ---------------------------
// Get Leaderboard by Domain - Active batch only
// ---------------------------
const getLeaderboardByDomain = async (req, res) => {
    try {
        const domainName = req.params.domain.toUpperCase();
        const { type } = req.query; // optional: online | offline

        let query = "SELECT id FROM batch WHERE is_active = 1";
        const params = [];

        if (type) {
            query += " AND type = ?";
            params.push(type);
        }

        const [activeBatches] = await db.execute(query, params);

        if (activeBatches.length === 0) {
            return res.status(200).json({
                status: "success",
                data: { leaderboard: [] }
            });
        }

        const activeBatchIds = activeBatches.map(b => b.id);

        const [rows] = await db.execute(`
            SELECT
                i.intern_id as internId,
                i.name as internName,
                i.email,
                COALESCE(d.name, 'No Domain') as domain,
                COALESCE(SUM(ip.points), 0) as totalPoints,
                COUNT(ip.point_id) as transactionCount,
                MAX(ip.created_at) as lastPointsDate,
                i.batch
            FROM interns i
            LEFT JOIN intern_points ip ON i.intern_id = ip.intern_id
            LEFT JOIN domains d ON i.domain_id = d.domain_id
            WHERE i.is_active = 1 AND UPPER(d.name) = ? AND i.batch IN (${activeBatchIds.map(() => '?').join(',')})
            GROUP BY i.intern_id, i.name, i.email, i.domain_id, i.batch
            ORDER BY totalPoints DESC
        `, [domainName, ...activeBatchIds]);

        const leaderboard = rows.map((row, index) => ({
            ...row,
            rank: index + 1
        }));

        res.status(200).json({
            status: "success",
            data: { leaderboard }
        });
    } catch (error) {
        console.error("Error fetching domain leaderboard:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to fetch domain leaderboard",
            details: error.message
        });
    }
};

// ---------------------------
// Award Points
// ---------------------------
const awardPoints = async (req, res) => {
    try {
        const { internId, points, reason, referenceId } = req.body;

        // Validate input
        if (!internId || points === undefined || !reason) {
            return res.status(400).json({
                status: "error",
                message: "Intern ID, points, and reason are required"
            });
        }

        if (typeof points !== 'number' || points === 0) {
            return res.status(400).json({
                status: "error",
                message: "Points must be a non-zero number"
            });
        }

        // Check if intern exists
        const [internCheck] = await db.execute(
            `SELECT intern_id, name FROM interns WHERE intern_id = ?`,
            [internId]
        );

        if (internCheck.length === 0) {
            return res.status(404).json({
                status: "error",
                message: "Intern not found"
            });
        }

        // Get current total before new entry
        const [currentTotal] = await db.execute(
            `SELECT COALESCE(SUM(points), 0) as total FROM intern_points WHERE intern_id = ?`,
            [internId]
        );
        const totalPointsAfter = currentTotal[0].total + points;

        // Insert points record
        const [result] = await db.execute(
            `INSERT INTO intern_points (intern_id, points, reason, reference_id, total_points_after, created_at)
             VALUES (?, ?, ?, ?, ?, NOW())`,
            [internId, points, reason, referenceId || null, totalPointsAfter]
        );

        // Get the created record
        const [createdRecord] = await db.execute(`
            SELECT 
                ip.point_id as id,
                ip.intern_id as internId,
                i.name as internName,
                d.name as domain,
                ip.points,
                ip.reason,
                ip.reference_id as referenceId,
                ip.created_at as createdAt
            FROM intern_points ip
            JOIN interns i ON ip.intern_id = i.intern_id
            LEFT JOIN domains d ON i.domain_id = d.domain_id
            WHERE ip.point_id = ?
        `, [result.insertId]);

        // Get updated total
        const [totalResult] = await db.execute(`
            SELECT COALESCE(SUM(points), 0) as total
            FROM intern_points
            WHERE intern_id = ?
        `, [internId]);

        res.status(201).json({
            status: "success",
            data: {
                pointRecord: createdRecord[0],
                newTotal: totalResult[0].total
            }
        });
    } catch (error) {
        console.error("Error awarding points:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to award points",
            error: error.message
        });
    }
};

// ---------------------------
// Deduct Points
// ---------------------------
const deductPoints = async (req, res) => {
    try {
        const { internId, points, reason, referenceId } = req.body;

        // Validate input
        if (!internId || !points || !reason) {
            return res.status(400).json({
                status: "error",
                message: "Intern ID, points, and reason are required"
            });
        }

        if (points <= 0) {
            return res.status(400).json({
                status: "error",
                message: "Points must be a positive number"
            });
        }

        // Check if intern exists
        const [internCheck] = await db.execute(
            `SELECT intern_id, name FROM interns WHERE intern_id = ?`,
            [internId]
        );

        if (internCheck.length === 0) {
            return res.status(404).json({
                status: "error",
                message: "Intern not found"
            });
        }

        // Get current total before new entry
        const [currentTotal] = await db.execute(
            `SELECT COALESCE(SUM(points), 0) as total FROM intern_points WHERE intern_id = ?`,
            [internId]
        );
        const totalPointsAfter = currentTotal[0].total + negativePoints;

        // Insert negative points record
        const [result] = await db.execute(
            `INSERT INTO intern_points (intern_id, points, reason, reference_id, total_points_after, created_at)
             VALUES (?, ?, ?, ?, ?, NOW())`,
            [internId, negativePoints, reason, referenceId || null, totalPointsAfter]
        );

        // Get the created record
        const [createdRecord] = await db.execute(`
            SELECT 
                ip.point_id as id,
                ip.intern_id as internId,
                i.name as internName,
                d.name as domain,
                ip.points,
                ip.reason,
                ip.reference_id as referenceId,
                ip.created_at as createdAt
            FROM intern_points ip
            JOIN interns i ON ip.intern_id = i.intern_id
            LEFT JOIN domains d ON i.domain_id = d.domain_id
            WHERE ip.point_id = ?
        `, [result.insertId]);

        // Get updated total
        const [totalResult] = await db.execute(`
            SELECT COALESCE(SUM(points), 0) as total
            FROM intern_points
            WHERE intern_id = ?
        `, [internId]);

        res.status(201).json({
            status: "success",
            data: {
                pointRecord: createdRecord[0],
                newTotal: totalResult[0].total
            }
        });
    } catch (error) {
        console.error("Error deducting points:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to deduct points",
            error: error.message
        });
    }
};

// ---------------------------
// Update Points Record
// ---------------------------
const updatePointsRecord = async (req, res) => {
    try {
        const { id } = req.params;
        const { points, reason, referenceId } = req.body;

        // Check if record exists
        const [existing] = await db.execute(
            `SELECT point_id FROM intern_points WHERE point_id = ?`,
            [id]
        );

        if (existing.length === 0) {
            return res.status(404).json({
                status: "error",
                message: "Points record not found"
            });
        }

        const updates = [];
        const values = [];

        if (points !== undefined) {
            updates.push("points = ?");
            values.push(points);
        }

        if (reason !== undefined) {
            updates.push("reason = ?");
            values.push(reason);
        }

        if (referenceId !== undefined) {
            updates.push("reference_id = ?");
            values.push(referenceId);
        }

        if (updates.length === 0) {
            return res.status(400).json({
                status: "error",
                message: "No fields to update"
            });
        }

        values.push(id);

        await db.execute(
            `UPDATE intern_points SET ${updates.join(", ")} WHERE point_id = ?`,
            values
        );

        // Get updated record
        const [updated] = await db.execute(`
            SELECT 
                ip.point_id as id,
                ip.intern_id as internId,
                i.name as internName,
                d.name as domain,
                ip.points,
                ip.reason,
                ip.reference_id as referenceId,
                ip.created_at as createdAt
            FROM intern_points ip
            JOIN interns i ON ip.intern_id = i.intern_id
            LEFT JOIN domains d ON i.domain_id = d.domain_id
            WHERE ip.point_id = ?
        `, [id]);

        res.status(200).json({
            status: "success",
            data: { pointRecord: updated[0] }
        });
    } catch (error) {
        console.error("Error updating points record:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to update points record"
        });
    }
};

// ---------------------------
// Delete Points Record
// ---------------------------
const deletePointsRecord = async (req, res) => {
    try {
        const { id } = req.params;

        // Check if record exists
        const [existing] = await db.execute(
            `SELECT point_id FROM intern_points WHERE point_id = ?`,
            [id]
        );

        if (existing.length === 0) {
            return res.status(404).json({
                status: "error",
                message: "Points record not found"
            });
        }

        await db.execute(
            `DELETE FROM intern_points WHERE point_id = ?`,
            [id]
        );

        res.status(200).json({
            status: "success",
            message: "Points record deleted successfully"
        });
    } catch (error) {
        console.error("Error deleting points record:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to delete points record"
        });
    }
};

// ---------------------------
// Get Points Statistics
// ---------------------------
const getPointsStats = async (req, res) => {
    try {
        // Total points awarded
        const [totalPoints] = await db.execute(`
            SELECT COALESCE(SUM(points), 0) as total
            FROM intern_points
            WHERE points > 0
        `);

        // Total points deducted
        const [totalDeductions] = await db.execute(`
            SELECT COALESCE(ABS(SUM(points)), 0) as total
            FROM intern_points
            WHERE points < 0
        `);

        // Total transactions
        const [totalTransactions] = await db.execute(`
            SELECT COUNT(*) as total
            FROM intern_points
        `);

        // Average points per intern
        const [avgPoints] = await db.execute(`
            SELECT AVG(total_points) as average
            FROM (
                SELECT COALESCE(SUM(points), 0) as total_points
                FROM intern_points
                GROUP BY intern_id
            ) as intern_totals
        `);

        // Top reason for points
        const [topReasons] = await db.execute(`
            SELECT 
                reason,
                COUNT(*) as count,
                SUM(points) as totalPoints
            FROM intern_points
            GROUP BY reason
            ORDER BY count DESC
            LIMIT 5
        `);

        // Points by domain
        const [pointsByDomain] = await db.execute(`
            SELECT 
                d.name as domain,
                COALESCE(SUM(ip.points), 0) as totalPoints,
                COUNT(ip.point_id) as transactionCount
            FROM domains d
            LEFT JOIN interns i ON d.domain_id = i.domain_id
            LEFT JOIN intern_points ip ON i.intern_id = ip.intern_id
            GROUP BY d.domain_id, d.name
            ORDER BY totalPoints DESC
        `);

        // Recent activity (last 7 days)
        const [recentActivity] = await db.execute(`
            SELECT 
                DATE(created_at) as date,
                COUNT(*) as transactions,
                SUM(points) as pointsAwarded
            FROM intern_points
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
            GROUP BY DATE(created_at)
            ORDER BY date DESC
        `);

        res.status(200).json({
            status: "success",
            data: {
                totalPointsAwarded: totalPoints[0].total,
                totalPointsDeducted: totalDeductions[0].total,
                totalTransactions: totalTransactions[0].total,
                averagePointsPerIntern: Math.round(avgPoints[0].average || 0),
                topReasons: topReasons,
                pointsByDomain: pointsByDomain,
                recentActivity: recentActivity
            }
        });
    } catch (error) {
        console.error("Error fetching points stats:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to fetch points statistics"
        });
    }
};

// ---------------------------
// Bulk Award Points
// ---------------------------
const bulkAwardPoints = async (req, res) => {
    try {
        const { internIds, points, reason, referenceId } = req.body;

        if (!internIds || !Array.isArray(internIds) || internIds.length === 0) {
            return res.status(400).json({
                status: "error",
                message: "Valid array of intern IDs is required"
            });
        }

        if (!points || !reason) {
            return res.status(400).json({
                status: "error",
                message: "Points and reason are required"
            });
        }

        const results = [];
        const errors = [];

        for (const internId of internIds) {
            try {
                await db.execute(
                    `INSERT INTO intern_points (intern_id, points, reason, reference_id, created_at)
                     VALUES (?, ?, ?, ?, NOW())`,
                    [internId, points, reason, referenceId || null]
                );
                results.push({ internId, success: true });
            } catch (err) {
                errors.push({ internId, error: err.message });
            }
        }

        res.status(201).json({
            status: "success",
            data: {
                successful: results.length,
                failed: errors.length,
                results: results,
                errors: errors
            }
        });
    } catch (error) {
        console.error("Error bulk awarding points:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to bulk award points"
        });
    }
};

// EXPORT
module.exports = {
    getAllPoints,
    getPointsByIntern,
    getPointsByDomain,
    getLeaderboard,
    getLeaderboardByDomain,
    awardPoints,
    deductPoints,
    updatePointsRecord,
    deletePointsRecord,
    getPointsStats,
    bulkAwardPoints
};
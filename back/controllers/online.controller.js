const db = require("../config/db");

/**
 * Send heartbeat to update last_active timestamp
 * Called by frontend every 30 seconds
 */
const sendHeartbeat = async (req, res) => {
    try {
        const { userType, userId, email } = req.body;

        if (!userType || (!userId && !email)) {
            return res.status(400).json({
                status: "error",
                message: "userType and userId/email are required"
            });
        }

        const now = new Date();

        if (userType === 'admin') {
            // Update admin last_active
            if (email) {
                await db.execute(
                    `UPDATE admins SET last_active = ? WHERE email = ?`,
                    [now, email]
                );
            } else {
                await db.execute(
                    `UPDATE admins SET last_active = ? WHERE admin_id = ?`,
                    [now, userId]
                );
            }
        } else if (userType === 'intern') {
            // Update intern last_active
            if (email) {
                await db.execute(
                    `UPDATE interns SET last_active = ? WHERE email = ?`,
                    [now, email]
                );
            } else {
                await db.execute(
                    `UPDATE interns SET last_active = ? WHERE intern_id = ?`,
                    [now, userId]
                );
            }
        }

        res.status(200).json({
            status: "success",
            message: "Heartbeat received"
        });
    } catch (error) {
        console.error("Error sending heartbeat:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to update heartbeat"
        });
    }
};

/**
 * Get all online admins
 * Returns admins active within the last 60 seconds
 */
const getOnlineAdmins = async (req, res) => {
    try {
        const [admins] = await db.execute(`
            SELECT admin_id, name, email, designation, role, domain_assigned, last_active
            FROM admins
            WHERE is_active = 1 
            AND last_active IS NOT NULL 
            AND last_active >= DATE_SUB(NOW(), INTERVAL 60 SECOND)
            ORDER BY last_active DESC
        `);

        res.status(200).json({
            status: "success",
            data: {
                admins,
                count: admins.length
            }
        });
    } catch (error) {
        console.error("Error fetching online admins:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to fetch online admins"
        });
    }
};

/**
 * Get all online interns
 * Returns interns active within the last 60 seconds
 */
const getOnlineInterns = async (req, res) => {
    try {
        const [interns] = await db.execute(`
            SELECT i.intern_id, i.name, i.email, i.profile_pic, d.name as domain, i.last_active
            FROM interns i
            LEFT JOIN domains d ON i.domain_id = d.domain_id
            WHERE i.is_active = 1 
            AND i.last_active IS NOT NULL 
            AND i.last_active >= DATE_SUB(NOW(), INTERVAL 60 SECOND)
            ORDER BY i.last_active DESC
        `);

        res.status(200).json({
            status: "success",
            data: {
                interns,
                count: interns.length
            }
        });
    } catch (error) {
        console.error("Error fetching online interns:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to fetch online interns"
        });
    }
};

/**
 * Get all online users (both admins and interns)
 */
const getOnlineUsers = async (req, res) => {
    try {
        const [admins] = await db.execute(`
            SELECT admin_id as id, name, email, designation, role, NULL as profile_pic, 'admin' as userType, last_active
            FROM admins
            WHERE is_active = 1 
            AND last_active IS NOT NULL 
            AND last_active >= DATE_SUB(NOW(), INTERVAL 60 SECOND)
            ORDER BY last_active DESC
        `);

        const [interns] = await db.execute(`
            SELECT i.intern_id as id, i.name, i.email, i.profile_pic, d.name as domain, 'intern' as userType, i.last_active
            FROM interns i
            LEFT JOIN domains d ON i.domain_id = d.domain_id
            WHERE i.is_active = 1 
            AND i.last_active IS NOT NULL 
            AND i.last_active >= DATE_SUB(NOW(), INTERVAL 60 SECOND)
            ORDER BY i.last_active DESC
        `);

        res.status(200).json({
            status: "success",
            data: {
                admins,
                interns,
                adminCount: admins.length,
                internCount: interns.length,
                totalCount: admins.length + interns.length
            }
        });
    } catch (error) {
        console.error("Error fetching online users:", error); // Log the specific error
        res.status(500).json({
            status: "error",
            message: "Failed to fetch online users"
        });
    }
};

/**
 * Get full profile of a specific online user (for popup)
 */
const getOnlineUserProfile = async (req, res) => {
    try {
        const { userType, id } = req.params;

        if (userType === 'intern') {
            const [interns] = await db.execute(`
                SELECT
                    i.*,
                    d.name as domain,
                    b.batch_id as batch_name,
                    a.name as mentor_name,
                    COALESCE(SUM(ip.points), 0) as total_points,
                    (SELECT COUNT(*) FROM intern_task_submissions its WHERE its.intern_id = i.intern_id AND its.status = 'approved') as tasks_completed
                FROM interns i
                LEFT JOIN domains d ON i.domain_id = d.domain_id
                LEFT JOIN batch b ON i.batch = b.id
                LEFT JOIN admins a ON d.admin_id = a.admin_id
                LEFT JOIN intern_points ip ON i.intern_id = ip.intern_id
                WHERE i.intern_id = ?
                GROUP BY i.intern_id
            `, [id]);

            if (interns.length === 0) {
                return res.status(404).json({ status: "error", message: "Intern not found" });
            }

            const intern = interns[0];

            // Calculate streak
            const [streakRows] = await db.execute(`
                SELECT DISTINCT DATE(submitted_at) as sub_date
                FROM intern_task_submissions
                WHERE intern_id = ? AND submitted_at IS NOT NULL
                ORDER BY sub_date DESC
            `, [id]);

            let currentStreak = 0;
            if (streakRows.length > 0) {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                let checkDate = new Date(today);

                for (const row of streakRows) {
                    const subDate = new Date(row.sub_date);
                    subDate.setHours(0, 0, 0, 0);
                    const diffDays = Math.round((checkDate - subDate) / (1000 * 60 * 60 * 24));
                    if (diffDays <= 1) {
                        currentStreak++;
                        checkDate = subDate;
                    } else {
                        break;
                    }
                }
            }

            intern.current_streak = currentStreak;

            // Get task journey
            const [internDomain] = await db.execute(
                `SELECT domain_id FROM interns WHERE intern_id = ?`, [id]
            );
            let tasksJourney = [];
            if (internDomain.length > 0 && internDomain[0].domain_id) {
                const [allTasks] = await db.execute(`
                    SELECT t.task_id, t.title, t.description, t.created_at, t.deadline, t.points,
                        (SELECT COUNT(*) + 1 FROM tasks t2 WHERE t2.domain_id = t.domain_id AND t2.task_id < t.task_id) as task_number
                    FROM tasks t WHERE t.domain_id = ? ORDER BY t.task_id ASC
                `, [internDomain[0].domain_id]);

                const [submissions] = await db.execute(`
                    SELECT its.*, a.name as reviewer_name
                    FROM intern_task_submissions its
                    LEFT JOIN admins a ON its.reviewed_by = a.admin_id
                    WHERE its.intern_id = ?
                `, [id]);

                tasksJourney = allTasks.map(task => {
                    const sub = submissions.find(s => s.task_id === task.task_id);
                    const events = [{ type: 'task_created', date: task.created_at, description: 'Task assigned' }];
                    if (sub) {
                        if (sub.first_submitted_at || sub.submitted_at) {
                            events.push({ type: 'submitted', date: sub.first_submitted_at || sub.submitted_at, description: 'Submitted for review' });
                        }
                        if (sub.rejection_date) {
                            events.push({ type: 'rejected', date: sub.rejection_date, feedback: sub.rejection_feedback, reviewerName: sub.reviewer_name, description: 'Task was rejected' });
                        }
                        if (sub.reviewed_at && sub.status === 'approved') {
                            events.push({ type: 'approved', date: sub.reviewed_at, feedback: sub.admin_feedback, reviewerName: sub.reviewer_name, description: 'Task approved' });
                        }
                    }
                    return {
                        taskId: task.task_id, taskNumber: task.task_number, title: task.title,
                        status: sub ? sub.status : 'not_started',
                        events: events.sort((a, b) => new Date(a.date) - new Date(b.date))
                    };
                });
            }

            res.status(200).json({
                status: "success",
                data: { ...intern, tasksJourney }
            });
        } else if (userType === 'admin') {
            const [admins] = await db.execute(`
                SELECT admin_id, name, email, designation, role, domain_assigned, NULL as profile_pic, last_active
                FROM admins WHERE admin_id = ?
            `, [id]);

            if (admins.length === 0) {
                return res.status(404).json({ status: "error", message: "Admin not found" });
            }

            res.status(200).json({ status: "success", data: admins[0] });
        } else {
            res.status(400).json({ status: "error", message: "Invalid userType" });
        }
    } catch (error) {
        console.error("Error fetching online user profile:", error);
        res.status(500).json({ status: "error", message: "Failed to fetch user profile" });
    }
};

module.exports = {
    sendHeartbeat,
    getOnlineAdmins,
    getOnlineInterns,
    getOnlineUsers,
    getOnlineUserProfile
};

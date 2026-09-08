const db = require("../config/db");

// Helper function to calculate current streak
const calculateCurrentStreak = async (intern_id) => {
    try {
        // Get distinct dates of activity for this intern
        const [activityDates] = await db.execute(`
            SELECT DISTINCT DATE(timestamp) as date
            FROM activity_log 
            WHERE student_id = ?
            ORDER BY date DESC
        `, [intern_id]);

        if (activityDates.length === 0) return 0;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        let streak = 0;
        let lastDate = new Date(activityDates[0].date);
        lastDate.setHours(0, 0, 0, 0);

        // If the last activity was not today OR yesterday, streak is broken
        if (lastDate.getTime() !== today.getTime() && lastDate.getTime() !== yesterday.getTime()) {
            return 0;
        }

        let expectedDate = new Date(lastDate);
        for (let i = 0; i < activityDates.length; i++) {
            const currentDate = new Date(activityDates[i].date);
            currentDate.setHours(0, 0, 0, 0);

            if (currentDate.getTime() === expectedDate.getTime()) {
                streak++;
                expectedDate.setDate(expectedDate.getDate() - 1);
            } else {
                break;
            }
        }

        return streak;
    } catch (error) {
        console.error("Error calculating streak:", error);
        return 0;
    }
};

// Helper function to calculate longest streak
const calculateLongestStreak = async (intern_id) => {
    try {
        const [activityDates] = await db.execute(`
            SELECT DISTINCT DATE(timestamp) as date
            FROM activity_log 
            WHERE student_id = ?
            ORDER BY date ASC
        `, [intern_id]);

        if (activityDates.length === 0) return 0;

        let longestStreak = 0;
        let currentStreak = 0;
        let prevDate = null;

        for (const row of activityDates) {
            const currentDate = new Date(row.date);
            currentDate.setHours(0, 0, 0, 0);

            if (!prevDate) {
                currentStreak = 1;
            } else {
                const diffTime = Math.abs(currentDate - prevDate);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                if (diffDays === 1) {
                    currentStreak++;
                } else if (diffDays > 1) {
                    longestStreak = Math.max(longestStreak, currentStreak);
                    currentStreak = 1;
                }
            }
            prevDate = currentDate;
        }

        longestStreak = Math.max(longestStreak, currentStreak);
        return longestStreak;
    } catch (error) {
        console.error("Error calculating longest streak:", error);
        return 0;
    }
};

// Mark attendance for today
const markAttendance = async (req, res) => {
    try {
        const { intern_id } = req.body;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Check if already marked for today
        const [existing] = await db.execute(
            `SELECT * FROM intern_streaks WHERE intern_id = ? AND DATE(date) = DATE(?)`,
            [intern_id, today]
        );

        if (existing.length > 0) {
            return res.status(200).json({
                status: "success",
                message: "Attendance already marked for today"
            });
        }

        // Calculate current and longest streaks
        const currentStreak = await calculateCurrentStreak(intern_id) + 1; // +1 for today
        const longestStreak = await calculateLongestStreak(intern_id);
        const newLongestStreak = Math.max(longestStreak, currentStreak);

        // Insert attendance WITH streak values
        await db.execute(
            `INSERT INTO intern_streaks (intern_id, date, status, current_streak, longest_streak) 
             VALUES (?, ?, 'present', ?, ?)`,
            [intern_id, today, currentStreak, newLongestStreak]
        );

        res.status(200).json({
            status: "success",
            message: "Attendance marked successfully",
            data: {
                currentStreak,
                longestStreak: newLongestStreak
            }
        });
    } catch (error) {
        console.error("Error marking attendance:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to mark attendance"
        });
    }
};

// Get current streak for an intern
const getCurrentStreak = async (req, res) => {
    try {
        const { intern_id } = req.params;

        // First try to get from latest record
        const [latestRecord] = await db.execute(`
            SELECT current_streak, longest_streak, date
            FROM intern_streaks 
            WHERE intern_id = ?
            ORDER BY date DESC
            LIMIT 1
        `, [intern_id]);

        if (latestRecord.length > 0) {
            return res.status(200).json({
                status: "success",
                data: {
                    currentStreak: latestRecord[0].current_streak,
                    longestStreak: latestRecord[0].longest_streak,
                    lastUpdated: latestRecord[0].date
                }
            });
        }

        // If no records, calculate
        const currentStreak = await calculateCurrentStreak(intern_id);

        res.status(200).json({
            status: "success",
            data: {
                currentStreak,
                longestStreak: 0,
                lastUpdated: null
            }
        });
    } catch (error) {
        console.error("Error getting current streak:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to get current streak"
        });
    }
};

// Get streak history for an intern
const getStreakHistory = async (req, res) => {
    try {
        const { intern_id } = req.params;
        const { days = 30 } = req.query;

        const [rows] = await db.execute(`
            SELECT date, status, current_streak, longest_streak
            FROM intern_streaks 
            WHERE intern_id = ? 
            AND date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
            ORDER BY date DESC
        `, [intern_id, days]);

        res.status(200).json({
            status: "success",
            data: { history: rows }
        });
    } catch (error) {
        console.error("Error fetching streak history:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to fetch streak history"
        });
    }
};

// NEW: Recalculate and update streaks for all interns
const updateAllStreaks = async (req, res) => {
    try {
        // Get all active interns
        const [interns] = await db.execute(
            'SELECT intern_id FROM interns WHERE is_active = 1'
        );

        let updated = 0;
        let errors = 0;

        for (const intern of interns) {
            try {
                const currentStreak = await calculateCurrentStreak(intern.intern_id);
                const longestStreak = await calculateLongestStreak(intern.intern_id);

                // Update the latest record for this intern
                await db.execute(`
                    UPDATE intern_streaks 
                    SET current_streak = ?, longest_streak = ?
                    WHERE intern_id = ? AND date = (
                        SELECT MAX(date) FROM (
                            SELECT date FROM intern_streaks WHERE intern_id = ?
                        ) as temp
                    )
                `, [currentStreak, longestStreak, intern.intern_id, intern.intern_id]);

                updated++;
            } catch (err) {
                console.error(`Error updating streak for intern ${intern.intern_id}:`, err);
                errors++;
            }
        }

        res.status(200).json({
            status: "success",
            message: "Streaks updated successfully",
            data: {
                updated,
                errors,
                total: interns.length
            }
        });
    } catch (error) {
        console.error("Error updating all streaks:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to update streaks"
        });
    }
};

// NEW: Recalculate streak for specific intern
const recalculateStreak = async (req, res) => {
    try {
        const { intern_id } = req.params;

        const currentStreak = await calculateCurrentStreak(intern_id);
        const longestStreak = await calculateLongestStreak(intern_id);

        // Update the latest record
        const [result] = await db.execute(`
            UPDATE intern_streaks 
            SET current_streak = ?, longest_streak = ?
            WHERE intern_id = ? AND date = (
                SELECT MAX(date) FROM (
                    SELECT date FROM intern_streaks WHERE intern_id = ?
                ) as temp
            )
        `, [currentStreak, longestStreak, intern_id, intern_id]);

        res.status(200).json({
            status: "success",
            message: "Streak recalculated successfully",
            data: {
                currentStreak,
                longestStreak,
                rowsUpdated: result.affectedRows
            }
        });
    } catch (error) {
        console.error("Error recalculating streak:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to recalculate streak"
        });
    }
};

// Get attendance summary for an intern
const getAttendanceSummary = async (req, res) => {
    try {
        const { intern_id } = req.params;

        // Get intern info including batch end_date
        const [internInfo] = await db.execute(
            `SELECT i.joined_at, b.end_date as batch_end_date
             FROM interns i
             LEFT JOIN batch b ON i.batch = b.id
             WHERE i.intern_id = ?`,
            [intern_id]
        );

        if (internInfo.length === 0) {
            return res.status(404).json({
                status: "error",
                message: "Intern not found"
            });
        }

        const joinDate = new Date(internInfo[0].joined_at);
        const today = new Date();
        const batchEndDate = internInfo[0].batch_end_date ? new Date(internInfo[0].batch_end_date) : null;
        // Use batch end date if available, otherwise use today
        const endDate = batchEndDate && batchEndDate > today ? batchEndDate : today;
        const totalDaysElapsed = Math.max(1, Math.floor((today - joinDate) / (1000 * 60 * 60 * 24)) + 1);

        // Get count of 'present' days
        const [[{ count: daysPresent }]] = await db.execute(
            'SELECT COUNT(*) as count FROM intern_streaks WHERE intern_id = ? AND status = "present"',
            [intern_id]
        );

        // Get ALL present dates for the GitHub-style contribution grid
        const [presentRecords] = await db.execute(
            'SELECT DATE(date) as attendance_date FROM intern_streaks WHERE intern_id = ? AND status = "present" ORDER BY date ASC',
            [intern_id]
        );
        const presentDates = presentRecords.map(r => {
            const d = new Date(r.attendance_date);
            return d.toISOString().split('T')[0];
        });

        // Get latest records for the 7-day view (Calendar days)
        const history = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            d.setHours(0, 0, 0, 0);

            const [record] = await db.execute(
                'SELECT status FROM intern_streaks WHERE intern_id = ? AND DATE(date) = DATE(?)',
                [intern_id, d]
            );

            history.push({
                date: d.toISOString(),
                status: record.length > 0 ? record[0].status : 'absent'
            });
        }

        res.status(200).json({
            status: "success",
            data: {
                totalDays: totalDaysElapsed,
                daysPresent: daysPresent,
                attendancePercentage: Math.round((daysPresent / totalDaysElapsed) * 100),
                recentHistory: history.reverse(),
                joinDate: joinDate.toISOString().split('T')[0],
                endDate: endDate.toISOString().split('T')[0],
                presentDates: presentDates
            }
        });
    } catch (error) {
        console.error("Error getting attendance summary:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to get attendance summary"
        });
    }
};

module.exports = {
    markAttendance,
    getCurrentStreak,
    getStreakHistory,
    updateAllStreaks,
    recalculateStreak,
    getAttendanceSummary
};
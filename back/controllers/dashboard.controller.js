const db = require("../config/db");

// Get Dashboard Stats (High-level KPIs + Panel Data)
const getDashboardStats = async (req, res) => {
    try {
        const { mode, domains } = req.query;
        let batchCondition = "";
        let domainCondition = "";
        let queryParams = [];
        let activeBatchId = null;

        // Domain filtering setup
        let domainList = [];
        if (domains) {
            domainList = domains.split(',').map(d => d.trim());
        }

        // If mode provided, finding active batch for that mode
        if (mode) {
            console.log(`[getDashboardStats] Fetching stats for mode: ${mode}`);
            const [batchRows] = await db.execute(
                "SELECT id FROM batch WHERE is_active = 1 AND type = ? LIMIT 1",
                [mode]
            );

            if (batchRows.length > 0) {
                activeBatchId = batchRows[0].id;
                batchCondition = " AND interns.batch = ?";
                queryParams.push(activeBatchId);
            } else {
                return res.status(200).json({
                    status: "success",
                    data: {
                        total_interns: 0,
                        pending_reviews: 0,
                        completed_reviews: 0,
                        active_tasks: 0,
                        avg_score: 0,
                        domains: 0,
                        top_interns: [],
                        pending_reviews_list: [],
                        upcoming_meetings: [],
                        domain_distribution: []
                    }
                });
            }
        }

        // Domain join and condition if needed
        let domainJoin = "";
        if (domainList.length > 0) {
            domainJoin = " JOIN domains d ON interns.domain_id = d.domain_id ";
            domainCondition = ` AND d.name IN (${domainList.map(() => '?').join(',')})`;
            queryParams.push(...domainList);
        }

        // 1. Basic KPIs
        const [totalInternsRows] = await db.execute(
            `SELECT COUNT(*) as count FROM interns ${domainJoin} WHERE interns.is_active = 1${batchCondition}${domainCondition}`,
            queryParams
        );
        const totalInterns = totalInternsRows[0]?.count || 0;

        let pendingReviewsCount = 0;
        let completedReviewsCount = 0;
        let activeTasksCount = 0;
        let avgScoreVal = 0;
        let domainCountVal = 0;

        if (activeBatchId) {
            const baseParams = [activeBatchId];
            let domainInSubParam = "";
            if (domainList.length > 0) {
                domainInSubParam = ` AND d.name IN (${domainList.map(() => '?').join(',')})`;
                baseParams.push(...domainList);
            }

            if (mode === 'offline') {
                // OFFLINE MODE: Count milestones
                const [pendingRows] = await db.execute(`
                    SELECT COUNT(*) as count FROM intern_task_milestones m
                    JOIN tasks t ON m.task_id = t.task_id
                    JOIN interns i ON m.intern_id = i.intern_id
                    JOIN domains d ON i.domain_id = d.domain_id
                    WHERE (m.status = 'Submitted' OR m.status = 'Under Review') AND i.batch = ? ${domainInSubParam}
                `, baseParams);
                pendingReviewsCount = pendingRows[0]?.count || 0;

                const [completedRows] = await db.execute(`
                    SELECT COUNT(*) as count FROM intern_task_milestones m
                    JOIN tasks t ON m.task_id = t.task_id
                    JOIN interns i ON m.intern_id = i.intern_id
                    JOIN domains d ON i.domain_id = d.domain_id
                    WHERE m.status = 'Approved' AND i.batch = ? ${domainInSubParam}
                `, baseParams);
                completedReviewsCount = completedRows[0]?.count || 0;

                const [taskRows] = await db.execute(
                    `SELECT COUNT(*) as count FROM tasks t
                     JOIN domains d ON t.domain_id = d.domain_id
                     WHERE t.batch = ? ${domainInSubParam}`,
                    baseParams
                );
                activeTasksCount = taskRows[0]?.count || 0;
            } else {
                // ONLINE MODE: Count submissions
                const [pendingRows] = await db.execute(`
                    SELECT COUNT(*) as count FROM intern_task_submissions its
                    JOIN interns i ON its.intern_id = i.intern_id
                    JOIN domains d ON i.domain_id = d.domain_id
                    WHERE its.status = 'pending' AND i.batch = ? ${domainInSubParam}
                `, baseParams);
                pendingReviewsCount = pendingRows[0]?.count || 0;

                const [completedRows] = await db.execute(`
                    SELECT COUNT(*) as count FROM intern_task_submissions its
                    JOIN interns i ON its.intern_id = i.intern_id
                    JOIN domains d ON i.domain_id = d.domain_id
                    WHERE its.status = 'approved' AND i.batch = ? ${domainInSubParam}
                `, baseParams);
                completedReviewsCount = completedRows[0]?.count || 0;

                const [taskRows] = await db.execute(
                    `SELECT COUNT(*) as count FROM tasks t
                     JOIN domains d ON t.domain_id = d.domain_id
                     WHERE t.batch = ? ${domainInSubParam}`,
                    baseParams
                );
                activeTasksCount = taskRows[0]?.count || 0;
            }

            const [scoreRows] = await db.execute(`
                SELECT AVG(ip.points) as avg_points FROM intern_points ip
                JOIN interns i ON ip.intern_id = i.intern_id
                JOIN domains d ON i.domain_id = d.domain_id
                WHERE i.batch = ? ${domainInSubParam}
            `, baseParams);
            avgScoreVal = Math.round(scoreRows[0]?.avg_points || 0);

            const [domainRows] = await db.execute(`
                SELECT COUNT(DISTINCT i.domain_id) as count FROM interns i
                JOIN domains d ON i.domain_id = d.domain_id
                WHERE i.batch = ? AND i.domain_id IS NOT NULL ${domainInSubParam}
            `, baseParams);
            domainCountVal = domainRows[0]?.count || 0;
        }

        // 2. Panel Data: Top Interns
        let topInterns = [];
        if (activeBatchId) {
            const topParams = [activeBatchId];
            let domainFilter = "";
            if (domainList.length > 0) {
                domainFilter = ` AND d.name IN (${domainList.map(() => '?').join(',')})`;
                topParams.push(...domainList);
            }

            const [topRows] = await db.execute(`
                SELECT i.intern_id, i.name, d.name as domain, SUM(ip.points) as score, i.profile_pic
                FROM interns i
                JOIN domains d ON i.domain_id = d.domain_id
                LEFT JOIN intern_points ip ON i.intern_id = ip.intern_id
                WHERE i.batch = ? AND i.is_active = 1 ${domainFilter}
                GROUP BY i.intern_id, i.name, d.name, i.profile_pic
                ORDER BY score DESC LIMIT 5
            `, topParams);
            topInterns = topRows.map(r => ({
                ...r,
                avatar: r.name.split(' ').map(n => n[0]).join('').toUpperCase()
            }));
        }

        // 3. Panel Data: Pending Reviews List
        let pendingReviewsList = [];
        if (activeBatchId) {
            const listParams = [activeBatchId];
            let domainFilter = "";
            if (domainList.length > 0) {
                domainFilter = ` AND d.name IN (${domainList.map(() => '?').join(',')})`;
                listParams.push(...domainList);
            }

            if (mode === 'offline') {
                const [pendingListRows] = await db.execute(`
                    SELECT i.intern_id, i.name as intern, i.profile_pic, 
                           CONCAT(ot.title, ' (Milestone ', m.milestone_number, ')') as type, 
                           m.submitted_at as due, 'high' as priority
                    FROM intern_task_milestones m
                    JOIN tasks ot ON m.task_id = ot.task_id
                    JOIN interns i ON m.intern_id = i.intern_id
                    JOIN domains d ON i.domain_id = d.domain_id
                    WHERE (m.status = 'Submitted' OR m.status = 'Under Review') AND i.batch = ? ${domainFilter}
                    ORDER BY m.submitted_at DESC LIMIT 3
                `, listParams);
                pendingReviewsList = pendingListRows;
            } else {
                const [pendingListRows] = await db.execute(`
                    SELECT i.intern_id, i.name as intern, i.profile_pic, t.title as type, its.submitted_at as due, 'high' as priority
                    FROM intern_task_submissions its
                    JOIN interns i ON its.intern_id = i.intern_id
                    JOIN tasks t ON its.task_id = t.task_id
                    JOIN domains d ON i.domain_id = d.domain_id
                    WHERE its.status = 'pending' AND i.batch = ? ${domainFilter}
                    ORDER BY its.submitted_at DESC LIMIT 3
                `, listParams);
                pendingReviewsList = pendingListRows;
            }
        }

        // 4. Panel Data: Upcoming Meetings
        let upcomingMeetings = [];
        const meetingModeParam = mode || 'all';
        const meetingBatchParam = activeBatchId || null;

        const meetingParams = [meetingBatchParam, meetingModeParam];
        let meetingDomainFilter = "";
        if (domainList.length > 0) {
            meetingDomainFilter = ` AND (d.name IN (${domainList.map(() => '?').join(',')}) OR m.domain_id IS NULL)`;
            meetingParams.push(...domainList);
        }

        const [meetingRows] = await db.execute(`
            SELECT 
                m.meeting_id,
                m.title,
                m.scheduled_at,
                m.target_mode as type,
                m.description,
                m.meeting_link,
                d.name as domain,
                COALESCE(a.name, 'Admin') as createdBy
            FROM meetings m
            LEFT JOIN domains d ON m.domain_id = d.domain_id
            LEFT JOIN admins a ON m.created_by = a.admin_id
            WHERE (m.batch = ? OR m.batch IS NULL)
            AND (m.target_mode = ? OR m.target_mode = 'all')
            AND DATE(m.scheduled_at) >= CURDATE()
            ${meetingDomainFilter}
            ORDER BY m.scheduled_at ASC LIMIT 3
        `, meetingParams);

        upcomingMeetings = meetingRows.map(m => ({
            ...m,
            scheduledAt: m.scheduled_at,
            date: new Date(m.scheduled_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
            time: new Date(m.scheduled_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            meetLink: m.meeting_link,
            targetMode: m.type
        }));

        // 5. Panel Data: Domain Distribution
        let domainDistribution = [];
        if (activeBatchId) {
            const distParams = [activeBatchId];
            let domainFilter = "";
            if (domainList.length > 0) {
                domainFilter = ` AND d.name IN (${domainList.map(() => '?').join(',')})`;
                distParams.push(...domainList);
            }

            const [distRows] = await db.execute(`
                SELECT d.name, COUNT(i.intern_id) as count
                FROM domains d
                JOIN interns i ON d.domain_id = i.domain_id
                WHERE i.batch = ? AND i.is_active = 1 ${domainFilter}
                GROUP BY d.domain_id, d.name
                ORDER BY count DESC
            `, distParams);

            const total = distRows.reduce((acc, r) => acc + r.count, 0);
            domainDistribution = distRows.map(r => ({
                name: r.name,
                value: r.count,
                percentage: total > 0 ? Math.round((r.count / total) * 100) : 0
            }));
        }

        res.status(200).json({
            status: "success",
            data: {
                total_interns: totalInterns,
                pending_reviews: pendingReviewsCount,
                completed_reviews: completedReviewsCount,
                active_tasks: activeTasksCount,
                avg_score: avgScoreVal,
                domains: domainCountVal,
                top_interns: topInterns,
                pending_reviews_list: pendingReviewsList,
                upcoming_meetings: upcomingMeetings,
                domain_distribution: domainDistribution
            }
        });

    } catch (error) {
        console.error("Error fetching dashboard stats:", error);
        res.status(500).json({ status: "error", message: "Failed to fetch dashboard stats" });
    }
};

// Get Detailed Analytics data (Task completion, Performance trend)
const getAnalyticsData = async (req, res) => {
    try {
        const { mode, domains } = req.query;
        let activeBatchId = null;

        let domainList = [];
        if (domains) {
            domainList = domains.split(',').map(d => d.trim());
        }

        if (mode) {
            const [batchRows] = await db.execute(
                "SELECT id FROM batch WHERE is_active = 1 AND type = ? LIMIT 1",
                [mode]
            );
            if (batchRows.length > 0) activeBatchId = batchRows[0].id;
        }

        if (!activeBatchId) {
            const [globalBatch] = await db.execute("SELECT id FROM batch WHERE is_active = 1 LIMIT 1");
            if (globalBatch.length > 0) activeBatchId = globalBatch[0].id;
        }

        // 1. Task Completion Trend (Last 7 Days)
        let taskCompletion = [];
        if (activeBatchId) {
            const completionParams = [activeBatchId];
            let domainFilter = "";
            if (domainList.length > 0) {
                domainFilter = ` AND d.name IN (${domainList.map(() => '?').join(',')})`;
                completionParams.push(...domainList);
            }

            const [completionRows] = await db.execute(`
                SELECT 
                    DATE_FORMAT(days.date, '%a') as name,
                    COUNT(CASE WHEN its.status = 'approved' THEN 1 END) as completed,
                    COUNT(CASE WHEN its.status = 'pending' THEN 1 END) as pending
                FROM (
                    SELECT CURDATE() - INTERVAL (a.a + (10 * b.a)) DAY as date
                    FROM (SELECT 0 as a UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) as a
                    CROSS JOIN (SELECT 0 as a UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3) as b
                ) days
                LEFT JOIN intern_task_submissions its ON DATE(its.submitted_at) = days.date
                LEFT JOIN interns i ON its.intern_id = i.intern_id
                LEFT JOIN domains d ON i.domain_id = d.domain_id
                WHERE days.date BETWEEN DATE_SUB(NOW(), INTERVAL 7 DAY) AND CURDATE()
                AND (i.batch = ? OR i.batch IS NULL)
                ${domainFilter}
                GROUP BY days.date
                ORDER BY days.date ASC
            `, completionParams);
            taskCompletion = completionRows;
        }

        // 2. Performance Trend (Average Points per week)
        let performanceTrend = [];
        if (activeBatchId) {
            const trendParams = [activeBatchId];
            let domainFilter = "";
            if (domainList.length > 0) {
                domainFilter = ` AND d.name IN (${domainList.map(() => '?').join(',')})`;
                trendParams.push(...domainList);
            }

            const [trendRows] = await db.execute(`
                SELECT 
                    CONCAT('W', WEEK(ip.created_at) - WEEK(DATE_SUB(ip.created_at, INTERVAL DAYOFMONTH(ip.created_at)-1 DAY)) + 1) as week,
                    AVG(ip.points) as score
                FROM intern_points ip
                JOIN interns i ON ip.intern_id = i.intern_id
                JOIN domains d ON i.domain_id = d.domain_id
                WHERE i.batch = ? ${domainFilter}
                GROUP BY week, WEEK(ip.created_at)
                ORDER BY WEEK(ip.created_at) ASC
                LIMIT 7
            `, trendParams);
            performanceTrend = trendRows.map(r => ({ week: r.week, score: Math.round(r.score) }));
        }

        res.status(200).json({
            status: "success",
            data: {
                task_completion: taskCompletion,
                performance_trend: performanceTrend
            }
        });
    } catch (error) {
        console.error("Error fetching analytics:", error);
        res.status(500).json({ status: "error", message: "Failed to fetch analytics" });
    }
};

module.exports = {
    getDashboardStats,
    getAnalyticsData
};

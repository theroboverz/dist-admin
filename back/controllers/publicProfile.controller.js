const verificationService = require('../services/verificationService');
const performanceService = require('../services/performanceService');
const db = require('../config/db');

class PublicProfileController {
    async getPublicProfile(req, res) {
        try {
            const { slug } = req.params;
            const profile = await verificationService.getBySlug(slug);

            if (!profile) {
                return res.status(404).json({
                    status: 'error',
                    message: 'Public profile not found or private'
                });
            }

            const filteredProfile = {
                name: profile.name,
                domain: profile.domain,
                university: profile.university,
                organization: profile.organization,
                designation: profile.designation,
                profile_pic: profile.profile_pic,
                joined_at: profile.joined_at,
                performance_index: profile.performance_index,
                industry_readiness_score: profile.industry_readiness_score,
                batch: profile.batch,
            };

            // Fetch validated skills
            const [skills] = await db.query('SELECT skill_name, skill_level, validated_on, source FROM student_skills WHERE student_id = ?', [profile.intern_id]);

            // Fetch public endorsements
            const [endorsements] = await db.query(`
                SELECT e.message, e.type, e.created_at, i.name as endorser_name
                FROM endorsements e
                LEFT JOIN interns i ON e.given_by = i.intern_id
                WHERE e.student_id = ? AND e.visibility = 'public'
            `, [profile.intern_id]);

            // Fetch task stats
            const [taskStats] = await db.query(`
                SELECT
                    COUNT(*) as total_tasks,
                    SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as completed_tasks
                FROM intern_task_submissions
                WHERE intern_id = ?
            `, [profile.intern_id]);

            // Fetch total points
            const [pointsData] = await db.query(`
                SELECT SUM(t.points) as total_points
                FROM intern_task_submissions s
                JOIN tasks t ON s.task_id = t.task_id
                WHERE s.intern_id = ? AND s.status = 'approved'
            `, [profile.intern_id]);

            // Fetch streak info
            let streakInfo = { current_streak: 0, longest_streak: 0 };
            try {
                const [streakData] = await db.query(`
                    SELECT current_streak, longest_streak
                    FROM intern_streaks
                    WHERE intern_id = ?
                    ORDER BY date DESC LIMIT 1
                `, [profile.intern_id]);
                if (streakData.length > 0) {
                    streakInfo = streakData[0];
                }
            } catch { /* table may not exist */ }

            // Fetch recent timeline (approved tasks)
            const [timeline] = await db.query(`
                SELECT t.title, s.submitted_at as date, 'task' as type
                FROM intern_task_submissions s
                JOIN tasks t ON s.task_id = t.task_id
                WHERE s.intern_id = ? AND s.status = 'approved'
                ORDER BY s.submitted_at DESC
                LIMIT 10
            `, [profile.intern_id]);

            // Track view
            await db.query('UPDATE interns SET profile_views = profile_views + 1 WHERE intern_id = ?', [profile.intern_id]);
            try {
                await db.query('INSERT INTO profile_views_log (student_id, viewer_ip, viewer_user_agent) VALUES (?, ?, ?)', [
                    profile.intern_id,
                    req.ip,
                    req.headers['user-agent']
                ]);
            } catch { /* log table may not exist */ }

            res.status(200).json({
                status: 'success',
                data: {
                    profile: filteredProfile,
                    skills,
                    endorsements,
                    stats: {
                        total_tasks: taskStats[0].total_tasks || 0,
                        completed_tasks: taskStats[0].completed_tasks || 0,
                        total_points: pointsData[0].total_points || 0,
                        current_streak: streakInfo.current_streak || 0,
                        longest_streak: streakInfo.longest_streak || 0,
                    },
                    timeline
                }
            });
        } catch (error) {
            console.error('Error fetching public profile:', error);
            res.status(500).json({ status: 'error', message: 'Internal server error' });
        }
    }

    async generateShareLink(req, res) {
        try {
            const intern_id = req.user.id; // JWT stores intern ID as 'id'
            const result = await verificationService.generateVerification(intern_id);
            await performanceService.calculatePerformanceIndex(intern_id);
            await performanceService.calculateReadinessScore(intern_id);

            res.status(200).json({
                status: 'success',
                message: 'Verified profile generated successfully',
                data: result
            });
        } catch (error) {
            console.error('Error generating share link:', error);
            res.status(500).json({ status: 'error', message: 'Internal server error' });
        }
    }

    async logShare(req, res) {
        try {
            const { intern_id, platform } = req.body;
            await db.query('INSERT INTO share_logs (student_id, platform) VALUES (?, ?)', [intern_id, platform]);
            res.status(200).json({ status: 'success' });
        } catch (error) {
            console.error('Error logging share:', error);
            res.status(500).json({ status: 'error', message: 'Internal server error' });
        }
    }

    async getSkills(req, res) {
        try {
            const studentId = req.params.id || req.user.id;
            const [skills] = await db.query(
                'SELECT skill_name, skill_level, validated_on, source FROM student_skills WHERE student_id = ? ORDER BY validated_on DESC',
                [studentId]
            );
            res.json({ status: 'success', data: skills });
        } catch (error) {
            res.status(500).json({ status: 'error', message: 'Failed to fetch skills' });
        }
    }

    async getPerformanceMetrics(req, res) {
        try {
            const internId = req.user.id;

            // Ensure metrics are up to date
            const performanceService = require('../services/performanceService');
            await performanceService.updateInternMetrics(internId);

            const [intern] = await db.query(
                'SELECT performance_index, industry_readiness_score, profile_views FROM interns WHERE intern_id = ?',
                [internId]
            );

            res.json({ status: 'success', data: intern[0] });
        } catch (error) {
            res.status(500).json({ status: 'error', message: 'Failed to fetch performance metrics' });
        }
    }
}

module.exports = new PublicProfileController();

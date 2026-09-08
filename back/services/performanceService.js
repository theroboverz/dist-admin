const db = require('../config/db');

class PerformanceService {
    /**
     * Calculate Work Impact Score (Performance Index)
     * Weights: Task Completion (30%), On-time (20%), Complexity/Points (20%), Mentor Rating (20%), Consistency (10%)
     */
    async calculatePerformanceIndex(internId) {
        // 1. Task Completion Rate (30%)
        const [taskStats] = await db.query(`
            SELECT 
                COUNT(*) as total_assigned,
                SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved_count
            FROM intern_task_submissions
            WHERE intern_id = ?
        `, [internId]);

        const completionRate = taskStats[0].total_assigned > 0
            ? (taskStats[0].approved_count / taskStats[0].total_assigned)
            : 0;

        // 2. On-time Submissions (20%)
        // We compare submitted_at with task deadline
        const [onTimeStats] = await db.query(`
            SELECT 
                COUNT(*) as total_submissions,
                SUM(CASE WHEN s.submitted_at <= t.deadline THEN 1 ELSE 0 END) as on_time_count
            FROM intern_task_submissions s
            JOIN tasks t ON s.task_id = t.task_id
            WHERE s.intern_id = ?
        `, [internId]);

        const onTimeRate = onTimeStats[0].total_submissions > 0
            ? (onTimeStats[0].on_time_count / onTimeStats[0].total_submissions)
            : 0;

        // 3. Complexity/Points (20%) - Using points as proxy
        const [pointsStats] = await db.query(`
            SELECT SUM(t.points) as total_points FROM intern_task_submissions s
            JOIN tasks t ON s.task_id = t.task_id
            WHERE s.intern_id = ? AND s.status = 'approved'
        `, [internId]);

        // Assume 1000 points is the max "perfect" score for 20% weight
        const pointsScore = Math.min((pointsStats[0].total_points || 0) / 1000, 1);

        // 4. Mentor Rating (20%)
        let mentorScore = 0.5; // Default to mid-range if no ratings or table missing
        try {
            const [mentorStats] = await db.query(`
                SELECT AVG(rating) as avg_rating FROM mentor_ratings WHERE student_id = ?
            `, [internId]);
            if (mentorStats[0].avg_rating) {
                mentorScore = mentorStats[0].avg_rating / 10;
            }
        } catch {
            // mentor_ratings table may not exist yet
        }

        // 5. Consistency (10%) - Using streak
        const [streakStats] = await db.query(`
            SELECT current_streak FROM intern_streaks WHERE intern_id = ? ORDER BY date DESC LIMIT 1
        `, [internId]);

        const streakScore = streakStats.length > 0 ? Math.min(streakStats[0].current_streak / 30, 1) : 0;

        // Final weighted score
        const performanceIndex = (
            (completionRate * 30) +
            (onTimeRate * 20) +
            (pointsScore * 20) +
            (mentorScore * 20) +
            (streakScore * 10)
        ).toFixed(2);

        // Update DB
        await db.query('UPDATE interns SET performance_index = ? WHERE intern_id = ?', [performanceIndex, internId]);

        return performanceIndex;
    }

    /**
     * Industry Readiness Meter
     * Based on skill completion, mentor endorsements, and project submissions.
     */
    async calculateReadinessScore(internId) {
        // Simple logic: % of approved tasks vs a target (e.g., 20 tasks) + valid skill count
        const [stats] = await db.query(`
            SELECT 
                (SELECT COUNT(*) FROM intern_task_submissions WHERE intern_id = ? AND status = 'approved') as approved_tasks,
                (SELECT COUNT(*) FROM student_skills WHERE student_id = ?) as skill_count
        `, [internId, internId]);

        const taskFactor = Math.min((stats[0].approved_tasks / 20) * 70, 70); // Max 70% from tasks
        const skillFactor = Math.min((stats[0].skill_count / 5) * 30, 30); // Max 30% from skills

        const readinessScore = Math.round(taskFactor + skillFactor);

        await db.query('UPDATE interns SET industry_readiness_score = ? WHERE intern_id = ?', [readinessScore, internId]);

        return readinessScore;
    }

    async updateInternMetrics(internId) {
        await this.calculatePerformanceIndex(internId);
        await this.calculateReadinessScore(internId);
    }
}

module.exports = new PerformanceService();

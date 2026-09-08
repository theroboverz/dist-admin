const db = require("../config/db");
const emailService = require("../services/emailService");

// Helper to format submission data
const formatSubmission = (submission) => {
    if (!submission) return null;
    return {
        id: submission.submission_id,
        internId: submission.intern_id,
        internName: submission.intern_name,
        taskId: submission.task_id,
        taskName: submission.task_name,
        domainName: submission.domain_name,
        linkedinUrl: submission.linkedin_url,
        postUrl: submission.post_url,
        fileUrl: submission.file_url,
        submittedAt: submission.submitted_at,
        status: submission.status,
        reviewedBy: submission.reviewed_by,
        reviewedAt: submission.reviewed_at,
        adminFeedback: submission.admin_feedback,
        progress: submission.progress || 0,
        pointsAwarded: submission.points_awarded || 0,
        referenceLink: submission.reference_link || null,
        taskPoints: submission.task_points || 0,
        taskDescription: submission.task_description || ""
    };
};

// Get all pending reviews (submissions with status 'pending') - Active batch only
const getPendingReviews = async (req, res) => {
    try {
        const { type } = req.query; // optional: online | offline

        // Get active batch IDs
        let batchQuery = "SELECT id FROM batch WHERE is_active = 1";
        const batchParams = [];

        if (type) {
            batchQuery += " AND type = ?";
            batchParams.push(type);
        }

        const [activeBatches] = await db.execute(batchQuery, batchParams);

        if (activeBatches.length === 0) {
            return res.status(200).json({
                status: "success",
                count: 0,
                data: []
            });
        }

        const activeBatchIds = activeBatches.map(b => b.id);
        const batchPlaceholders = activeBatchIds.map(() => '?').join(',');

        let query, params;

        if (type === 'offline') {
            query = `
                SELECT 
                    m.id as submission_id,
                    t.student_id as intern_id,
                    i.name as intern_name,
                    m.task_id,
                    CONCAT(t.title, ' - Milestone ', m.milestone_number) as task_name,
                    d.name as domain_name,
                    NULL as linkedin_url,
                    NULL as post_url,
                    (SELECT file_path FROM offline_task_files WHERE milestone_id = m.id LIMIT 1) as file_url,
                    m.submitted_at,
                    m.status,
                    NULL as reviewed_by,
                    NULL as reviewed_at,
                    m.admin_comments as admin_feedback,
                    CASE WHEN m.status = 'Approved' THEN 100 ELSE m.student_progress END as progress
                FROM offline_task_milestones m
                JOIN offline_tasks t ON m.task_id = t.id
                JOIN interns i ON t.student_id = i.intern_id
                LEFT JOIN domains d ON i.domain_id = d.domain_id
                WHERE (m.status = 'Submitted' OR m.status = 'Under Review')
                AND i.batch IN (${batchPlaceholders})
                ORDER BY m.submitted_at DESC
            `;
            params = [...activeBatchIds];

        } else {
            // ONLINE TASKS
            query = `
                SELECT 
                    its.submission_id,
                    its.intern_id,
                    i.name as intern_name,
                    its.task_id,
                    t.title as task_name,
                    d.name as domain_name,
                    its.linkedin_url,
                    its.post_url,
                    its.file_url,
                    its.submitted_at,
                    its.status,
                    its.reviewed_by,
                    its.reviewed_at,
                    its.admin_feedback,
                    its.progress,
                    its.points_awarded,
                    its.reference_link
                FROM intern_task_submissions its
                INNER JOIN interns i ON its.intern_id = i.intern_id
                INNER JOIN tasks t ON its.task_id = t.task_id
                LEFT JOIN domains d ON t.domain_id = d.domain_id
                WHERE its.status = 'pending' AND i.batch IN (${batchPlaceholders})
                ORDER BY its.submitted_at DESC
            `;
            params = [...activeBatchIds];
        }

        const [submissions] = await db.query(query, params);

        // Normalize status
        const normalizedSubmissions = submissions.map(sub => ({
            ...formatSubmission(sub),
            status: 'pending', // Force pending for this endpoint
            type: type === 'offline' ? 'offline' : 'online'
        }));

        res.status(200).json({
            status: "success",
            count: normalizedSubmissions.length,
            data: normalizedSubmissions
        });
    } catch (error) {
        console.error("Error fetching pending reviews:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to fetch pending reviews",
            error: error.message
        });
    }
};

// Get all reviews with optional status filter - Active batch only
const getAllReviews = async (req, res) => {
    try {
        const { status, type } = req.query;

        // Get active batch IDs
        let batchQuery = "SELECT id FROM batch WHERE is_active = 1";
        const batchParams = [];

        if (type) {
            batchQuery += " AND type = ?";
            batchParams.push(type);
        }

        const [activeBatches] = await db.execute(batchQuery, batchParams);

        // If no active batch, return empty array
        if (activeBatches.length === 0) {
            return res.status(200).json({
                status: "success",
                count: 0,
                data: []
            });
        }

        const activeBatchIds = activeBatches.map(b => b.id);
        const batchPlaceholders = activeBatchIds.map(() => '?').join(',');

        let query, params;

        if (type === 'offline') {
            query = `
                SELECT 
                    m.id as submission_id,
                    t.student_id as intern_id,
                    i.name as intern_name,
                    m.task_id,
                    CONCAT(t.title, ' - Milestone ', m.milestone_number) as task_name,
                    d.name as domain_name,
                    NULL as linkedin_url,
                    NULL as post_url,
                    (SELECT file_path FROM offline_task_files WHERE milestone_id = m.id LIMIT 1) as file_url,
                    m.submitted_at,
                    m.status,
                    NULL as reviewed_by, -- offline table doesn't track reviewer ID yet in milestones, or add column
                    NULL as reviewed_at,
                    m.admin_comments as admin_feedback,
                    NULL as reviewer_name,
                    CASE WHEN m.status = 'Approved' THEN 100 ELSE m.student_progress END as progress
                FROM offline_task_milestones m
                JOIN offline_tasks t ON m.task_id = t.id
                JOIN interns i ON t.student_id = i.intern_id
                LEFT JOIN domains d ON i.domain_id = d.domain_id
                WHERE i.batch IN (${batchPlaceholders}) AND m.status != 'Not Started'
            `;

            params = [...activeBatchIds];

            if (status) {
                // Map frontend status to offline status if needed
                // Offline statuses: Submitted, Under Review, Approved, Rejected
                // Frontend might send 'pending'
                if (status === 'pending') {
                    query += " AND (m.status = 'Submitted' OR m.status = 'Under Review')";
                } else if (status === 'approved') {
                    query += " AND m.status = 'Approved'";
                } else if (status === 'rejected') {
                    query += " AND m.status = 'Rejected'";
                } else {
                    query += " AND m.status = ?";
                    params.push(status);
                }
            }
            query += ' ORDER BY m.submitted_at DESC';

        } else {
            // ONLINE TASKS (Existing Logic)
            query = `
                SELECT 
                    its.submission_id,
                    its.intern_id,
                    i.name as intern_name,
                    its.task_id,
                    t.title as task_name,
                    d.name as domain_name,
                    its.linkedin_url,
                    its.post_url,
                    its.file_url,
                    its.submitted_at,
                    its.status,
                    its.reviewed_by,
                    its.reviewed_at,
                    its.admin_feedback,
                    a.name as reviewer_name,
                    its.progress,
                    its.points_awarded,
                    its.reference_link,
                    its.progress
                FROM intern_task_submissions its
                INNER JOIN interns i ON its.intern_id = i.intern_id
                INNER JOIN tasks t ON its.task_id = t.task_id
                LEFT JOIN domains d ON t.domain_id = d.domain_id
                LEFT JOIN admins a ON its.reviewed_by = a.admin_id
                WHERE i.batch IN (${batchPlaceholders})
            `;

            params = [...activeBatchIds];

            if (status) {
                query += ' AND its.status = ?';
                params.push(status);
            }

            query += ' ORDER BY its.submitted_at DESC';
        }

        const [submissions] = await db.query(query, params);

        // Normalize status for frontend
        const normalizedSubmissions = submissions.map(sub => {
            let normalizedStatus = sub.status.toLowerCase();
            if (normalizedStatus === 'submitted' || normalizedStatus === 'under review') normalizedStatus = 'pending';

            return {
                ...formatSubmission(sub),
                status: normalizedStatus, // Override status for UI consistency
                reviewerName: sub.reviewer_name,
                type: type === 'offline' ? 'offline' : 'online'
            };
        });

        res.status(200).json({
            status: "success",
            count: normalizedSubmissions.length,
            data: normalizedSubmissions
        });
    } catch (error) {
        console.error("Error fetching reviews:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to fetch reviews",
            error: error.message
        });
    }
};

// Update review status
const updateReviewStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, adminId, pointsAwarded, referenceLink, feedback } = req.body;

        // Validate status
        const validStatuses = ['pending', 'approved', 'rejected'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                status: "error",
                message: "Invalid status. Must be one of: pending, approved, rejected"
            });
        }

        // Check if submission exists
        const [existing] = await db.query(
            "SELECT submission_id, intern_id, task_id, status as oldStatus FROM intern_task_submissions WHERE submission_id = ?",
            [id]
        );

        if (existing.length === 0) {
            // Check if it's an offline milestone
            const [offlineExisting] = await db.query(
                `SELECT m.id, m.task_id, m.status, i.email, i.name, t.title as taskTitle
                 FROM offline_task_milestones m
                 JOIN offline_tasks t ON m.task_id = t.id
                 JOIN interns i ON t.student_id = i.intern_id
                 WHERE m.id = ?`,
                [id]
            );

            if (offlineExisting.length === 0) {
                return res.status(404).json({
                    status: "error",
                    message: "Submission not found"
                });
            }

            // Update OFFLINE MILESTONE
            const offlineStatusMap = {
                'approved': 'Approved',
                'rejected': 'Rejected',
                'pending': 'Under Review'
            };
            const mappedStatus = offlineStatusMap[status] || 'Under Review';

            await db.query(
                `UPDATE offline_task_milestones 
                 SET status = ?, 
                     admin_comments = ?, 
                     admin_review = ?
                 WHERE id = ?`,
                [mappedStatus, feedback || null, feedback || null, id]
            );

            // If approved, check if all milestones for this task are approved
            if (mappedStatus === 'Approved') {
                const [allMilestones] = await db.query(
                    "SELECT status FROM offline_task_milestones WHERE task_id = ?",
                    [offlineExisting[0].task_id]
                );

                const allApproved = allMilestones.every(m => m.status === 'Approved');
                if (allApproved) {
                    await db.query(
                        "UPDATE offline_tasks SET status = 'Completed' WHERE id = ?",
                        [offlineExisting[0].task_id]
                    );
                } else {
                    await db.query(
                        "UPDATE offline_tasks SET status = 'In Progress' WHERE id = ?",
                        [offlineExisting[0].task_id]
                    );
                }
            }

            // Notify intern
            emailService.sendTaskReviewEmail(
                offlineExisting[0].email,
                offlineExisting[0].name,
                { id, taskName: offlineExisting[0].taskTitle, status, feedback }
            ).catch(err => console.error("Failed to notify intern:", err));

            return res.status(200).json({
                status: "success",
                message: "Offline review updated successfully"
            });
        }

        const internId = existing[0].intern_id;
        const taskId = existing[0].task_id;
        const oldStatus = existing[0].oldStatus;

        // Update the submission
        const updates = [
            "status = ?",
            "reviewed_by = ?",
            "reviewed_at = NOW()"
        ];
        const values = [status, adminId || null];

        if (pointsAwarded !== undefined) {
            updates.push("points_awarded = ?");
            values.push(pointsAwarded);
        }
        if (referenceLink !== undefined) {
            updates.push("reference_link = ?");
            values.push(referenceLink);
        }
        if (feedback !== undefined) {
            updates.push("admin_feedback = ?");
            values.push(feedback);
        }

        // If approving, update approved_progress to current progress
        if (status === 'approved') {
            updates.push("approved_progress = progress");
        }

        values.push(id);
        const updateQuery = `
            UPDATE intern_task_submissions 
            SET ${updates.join(", ")}
            WHERE submission_id = ?
        `;

        await db.query(updateQuery, values);

        // Handle points in intern_points table
        if (status === 'approved') {
            const pointsToAward = pointsAwarded || 0;
            // Check if record exists
            const [pointRecord] = await db.query(
                "SELECT point_id FROM intern_points WHERE reference_id = ? AND reason LIKE 'Task Verification%'",
                [id]
            );

            if (pointRecord.length > 0) {
                // Update existing
                await db.query(
                    "UPDATE intern_points SET points = ?, reason = ? WHERE point_id = ?",
                    [pointsToAward, `Task Verification - Submission #${id}`, pointRecord[0].point_id]
                );
            } else {
                // Insert new
                await db.query(
                    "INSERT INTO intern_points (intern_id, points, reason, reference_id, created_at) VALUES (?, ?, ?, ?, NOW())",
                    [internId, pointsToAward, `Task Verification - Submission #${id}`, id]
                );
            }
        } else if (oldStatus === 'approved' && status !== 'approved') {
            // Remove points if revoked
            await db.query(
                "DELETE FROM intern_points WHERE reference_id = ? AND reason LIKE 'Task Verification%'",
                [id]
            );
        }

        // Add to history
        await db.query(`
            INSERT INTO task_submission_history (
                submission_id, type, admin_id, feedback, reference_link, status, progress
            ) VALUES (?, 'admin', ?, ?, ?, ?, (SELECT progress FROM intern_task_submissions WHERE submission_id = ?))
        `, [id, adminId || null, feedback || null, referenceLink || null, status, id]);

        // Fetch updated submission with all fields
        const [updated] = await db.query(`
            SELECT 
                its.*,
                i.name as intern_name,
                t.title as task_name,
                d.name as domain_name
            FROM intern_task_submissions its
            INNER JOIN interns i ON its.intern_id = i.intern_id
            INNER JOIN tasks t ON its.task_id = t.task_id
            LEFT JOIN domains d ON t.domain_id = d.domain_id
            WHERE its.submission_id = ?
        `, [id]);

        res.status(200).json({
            status: "success",
            message: "Review updated successfully",
            data: formatSubmission(updated[0])
        });

        // Notify intern (Online task)
        emailService.sendTaskReviewEmail(
            updated[0].intern_email || (await db.query("SELECT email FROM interns WHERE intern_id = ?", [internId]))[0][0]?.email,
            updated[0].intern_name,
            { id, taskName: updated[0].task_name, status, feedback }
        ).catch(err => console.error("Failed to notify intern:", err));

    } catch (error) {
        console.error("Error updating review status:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to update review status",
            error: error.message
        });
    }
};

// Add admin feedback
const addAdminFeedback = async (req, res) => {
    try {
        const { id } = req.params;
        const { feedback, adminId } = req.body;

        if (!feedback || feedback.trim() === "") {
            return res.status(400).json({
                status: "error",
                message: "Feedback is required"
            });
        }

        // Check if submission exists
        const [existing] = await db.query(
            "SELECT submission_id FROM intern_task_submissions WHERE submission_id = ?",
            [id]
        );

        if (existing.length === 0) {
            // Check offline
            const [offlineExisting] = await db.query(
                "SELECT id FROM offline_task_milestones WHERE id = ?",
                [id]
            );

            if (offlineExisting.length === 0) {
                return res.status(404).json({
                    status: "error",
                    message: "Submission not found"
                });
            }

            // Update offline feedback
            await db.query(
                "UPDATE offline_task_milestones SET admin_comments = ? WHERE id = ?",
                [feedback, id]
            );

            return res.status(200).json({
                status: "success",
                message: "Offline feedback added successfully"
            });
        }

        // Update feedback
        const updateQuery = `
            UPDATE intern_task_submissions 
            SET admin_feedback = ?,
                reviewed_by = ?,
                reviewed_at = NOW()
            WHERE submission_id = ?
        `;

        await db.query(updateQuery, [feedback, adminId || null, id]);

        // Fetch updated submission
        const [updated] = await db.query(`
            SELECT 
                its.submission_id,
                its.intern_id,
                i.name as intern_name,
                its.task_id,
                t.title as task_name,
                d.name as domain_name,
                its.linkedin_url,
                its.post_url,
                its.file_url,
                its.submitted_at,
                its.status,
                its.reviewed_by,
                its.reviewed_at,
                its.admin_feedback,
                its.progress
            FROM intern_task_submissions its
            INNER JOIN interns i ON its.intern_id = i.intern_id
            INNER JOIN tasks t ON its.task_id = t.task_id
            LEFT JOIN domains d ON t.domain_id = d.domain_id
            WHERE its.submission_id = ?
        `, [id]);

        res.status(200).json({
            status: "success",
            message: "Feedback added successfully",
            data: formatSubmission(updated[0])
        });
    } catch (error) {
        console.error("Error adding feedback:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to add feedback",
            error: error.message
        });
    }
};

// Get submission by ID
const getSubmissionById = async (req, res) => {
    try {
        const { id } = req.params;

        const query = `
            SELECT 
                its.submission_id,
                its.intern_id,
                i.name as intern_name,
                i.email as intern_email,
                its.task_id,
                t.title as task_name,
                t.description as task_description,
                t.points as task_points,
                d.name as domain_name,
                its.linkedin_url,
                its.post_url,
                its.file_url,
                its.submitted_at,
                its.status,
                its.reviewed_by,
                its.reviewed_at,
                its.admin_feedback,
                its.progress,
                its.points_awarded,
                its.reference_link,
                t.description as task_description,
                t.points as task_points,
                a.name as reviewer_name
            FROM intern_task_submissions its
            INNER JOIN interns i ON its.intern_id = i.intern_id
            INNER JOIN tasks t ON its.task_id = t.task_id
            LEFT JOIN domains d ON t.domain_id = d.domain_id
            LEFT JOIN admins a ON its.reviewed_by = a.admin_id
            WHERE its.submission_id = ?
        `;

        let [submissions] = await db.query(query, [id]);

        if (submissions.length === 0) {
            // Check offline table if not found in online
            const offlineQuery = `
                SELECT 
                    m.id as submission_id,
                    t.student_id as intern_id,
                    i.name as intern_name,
                    i.email as intern_email,
                    m.task_id,
                    CONCAT(t.title, ' - Milestone ', m.milestone_number) as task_name,
                    t.description as task_description,
                    NULL as task_points, -- milestones don't have separate points yet, or use 0
                    d.name as domain_name,
                    NULL as linkedin_url,
                    NULL as post_url,
                    (SELECT file_path FROM offline_task_files WHERE milestone_id = m.id LIMIT 1) as file_url,
                    m.submitted_at,
                    m.status,
                    NULL as reviewed_by,
                    NULL as reviewed_at,
                    m.admin_comments as admin_feedback,
                    CASE WHEN m.status = 'Approved' THEN 100 ELSE m.student_progress END as progress,
                    NULL as points_awarded,
                    NULL as reference_link,
                    NULL as reviewer_name
                FROM offline_task_milestones m
                JOIN offline_tasks t ON m.task_id = t.id
                JOIN interns i ON t.student_id = i.intern_id
                LEFT JOIN domains d ON i.domain_id = d.domain_id
                WHERE m.id = ?
            `;
            [submissions] = await db.query(offlineQuery, [id]);
        }

        if (submissions.length === 0) {
            return res.status(404).json({
                status: "error",
                message: "Submission not found"
            });
        }

        res.status(200).json({
            status: "success",
            data: {
                ...formatSubmission(submissions[0]),
                internEmail: submissions[0].intern_email,
                taskDescription: submissions[0].task_description,
                taskPoints: submissions[0].task_points,
                reviewerName: submissions[0].reviewer_name
            }
        });
    } catch (error) {
        console.error("Error fetching submission:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to fetch submission",
            error: error.message
        });
    }
};

// Get pending reviews count by domain - FIXED!
const getPendingReviewsByDomain = async (req, res) => {
    try {
        const { domainName } = req.params;

        const query = `
            SELECT COUNT(*) as pendingCount
            FROM intern_task_submissions its
            INNER JOIN tasks t ON its.task_id = t.task_id
            INNER JOIN domains d ON t.domain_id = d.domain_id
            WHERE its.status = 'pending' AND d.name = ?
        `;

        const [result] = await db.query(query, [domainName]);

        res.status(200).json({
            status: "success",
            data: {
                domain: domainName,
                pendingCount: result[0]?.pendingCount || 0  // ✅ FIXED: Changed from pendingReviews to pendingCount
            }
        });
    } catch (error) {
        console.error("Error fetching pending reviews by domain:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to fetch pending reviews count",
            error: error.message
        });
    }
};

// Get detailed pending reviews list by domain - Active batch only
const getPendingReviewsListByDomain = async (req, res) => {
    try {
        const { domainName } = req.params;

        // Get active batch ID
        const [activeBatch] = await db.execute(
            "SELECT id FROM batch WHERE is_active = 1 LIMIT 1"
        );

        // If no active batch, return empty array
        if (activeBatch.length === 0) {
            return res.status(200).json({
                status: "success",
                data: {
                    domain: domainName,
                    reviews: [],
                    count: 0
                }
            });
        }

        const activeBatchId = activeBatch[0].id;

        const query = `
            SELECT 
                its.submission_id,
                i.intern_id,
                i.name as internName,
                i.email as internEmail,
                t.title as taskTitle,
                its.submitted_at as submittedAt,
                its.status
            FROM intern_task_submissions its
            INNER JOIN tasks t ON its.task_id = t.task_id
            INNER JOIN domains d ON t.domain_id = d.domain_id
            INNER JOIN interns i ON its.intern_id = i.intern_id
            WHERE its.status = 'pending' AND d.name = ? AND i.batch = ?
            ORDER BY its.submitted_at DESC
        `;

        const [reviews] = await db.query(query, [domainName, activeBatchId]);

        res.status(200).json({
            status: "success",
            data: {
                domain: domainName,
                reviews: reviews,
                count: reviews.length
            }
        });
    } catch (error) {
        console.error("Error fetching pending reviews list by domain:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to fetch pending reviews list",
            error: error.message
        });
    }
};

const getSubmissionHistory = async (req, res) => {
    try {
        const { id } = req.params;

        const query = `
            SELECT 
                tsh.*,
                a.name as reviewer_name
            FROM task_submission_history tsh
            LEFT JOIN admins a ON tsh.admin_id = a.admin_id
            WHERE tsh.submission_id = ?
            ORDER BY tsh.submitted_at ASC
        `;

        const [history] = await db.query(query, [id]);

        const formattedHistory = history.map(item => ({
            id: item.history_id || item.id,
            type: item.type,
            progress: item.progress,
            fileUrl: item.file_url,
            studentComment: item.student_comment,
            feedback: item.feedback,
            referenceLink: item.reference_link,
            status: item.status,
            createdAt: item.submitted_at,
            reviewerName: item.reviewer_name
        }));

        res.status(200).json({
            status: "success",
            data: formattedHistory
        });
    } catch (error) {
        console.error("Error fetching submission history:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to fetch submission history",
            error: error.message
        });
    }
};

module.exports = {
    getPendingReviews,
    getAllReviews,
    updateReviewStatus,
    addAdminFeedback,
    getSubmissionById,
    getPendingReviewsByDomain,
    getPendingReviewsByDomain,
    getPendingReviewsListByDomain,
    getSubmissionHistory
};
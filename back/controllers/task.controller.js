const db = require("../config/db");
const emailService = require("../services/emailService");

// Get all tasks with domain information - Active batch only
const getAllTasks = async (req, res) => {
    try {
        // Get active batch ID
        const [activeBatch] = await db.execute(
            "SELECT id FROM batch WHERE is_active = 1 LIMIT 1"
        );

        // If no active batch, return empty array
        if (activeBatch.length === 0) {
            return res.status(200).json([]);
        }

        const activeBatchId = activeBatch[0].id;

        const query = `
            SELECT 
                t.task_id as id,
                t.title,
                t.description,
                t.resource_link as resourceLink,
                t.points,
                t.deadline,
                t.assignment_range as assignmentRange,
                t.target_group as targetGroup,
                t.created_at as createdAt,
                d.name as category,
                d.domain_id as domainId,
                a.name as createdBy
            FROM tasks t
            LEFT JOIN domains d ON t.domain_id = d.domain_id
            LEFT JOIN admins a ON t.created_by = a.admin_id
            WHERE t.batch = ?
            ORDER BY t.created_at DESC
        `;

        const [tasks] = await db.query(query, [activeBatchId]);

        // Transform to match frontend format
        const formattedTasks = tasks.map(task => ({
            id: task.id,
            title: task.title,
            description: task.description,
            priority: 'medium', // Default priority, can be added to DB if needed
            dueDate: task.deadline || new Date(task.createdAt).toISOString().split('T')[0],
            deadline: task.deadline,
            status: 'pending', // Default status
            category: task.category,
            domainId: task.domainId,
            resourceLink: task.resourceLink,
            points: task.points,
            milestoneEnabled: !!task.milestone_enabled,
            milestoneCount: task.milestone_count || 0,
            assignmentRange: task.assignmentRange,
            targetGroup: task.targetGroup,
            createdBy: task.createdBy,
            createdAt: task.createdAt,
            pendingReviews: task.pendingReviews || 0
        }));

        res.status(200).json(formattedTasks);
    } catch (error) {
        console.error("Error fetching tasks:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to fetch tasks",
            error: error.message
        });
    }
};

// Get tasks by domain - Active batch only
const getTasksByDomain = async (req, res) => {
    try {
        let { domainId } = req.params;
        const { internId, mode } = req.query; // Get internId and mode from query params

        let activeBatchId = null;

        // If mode provided, finding active batch for that mode
        if (mode) {
            const [batchRows] = await db.execute(
                "SELECT id FROM batch WHERE is_active = 1 AND type = ? LIMIT 1",
                [mode]
            );
            if (batchRows.length > 0) {
                activeBatchId = batchRows[0].id;
            }
        }

        // If no mode or batch found for mode, fallback to default active batch
        if (!activeBatchId) {
            const [activeBatch] = await db.execute(
                "SELECT id FROM batch WHERE is_active = 1 LIMIT 1"
            );
            if (activeBatch.length > 0) {
                activeBatchId = activeBatch[0].id;
            }
        }

        // If still no active batch, return empty array
        if (!activeBatchId) {
            return res.status(200).json([]);
        }

        // If domainId is not a number, try to find the domain ID by name
        if (isNaN(domainId)) {
            const [domains] = await db.query("SELECT domain_id FROM domains WHERE name = ?", [domainId]);
            if (domains.length > 0) {
                domainId = domains[0].domain_id;
            } else {
                return res.status(200).json([]);
            }
        }

        // If internId is provided, get the specific intern's batch and mode
        let internBatchId = activeBatchId;
        let internType = null;
        if (internId) {
            const [internRows] = await db.query(
                "SELECT batch, intern_type FROM interns WHERE intern_id = ?",
                [internId]
            );
            if (internRows.length > 0) {
                // If intern has a batch assigned, use it. Try to parse as int since tasks.batch is int.
                const bId = parseInt(internRows[0].batch);
                if (!isNaN(bId)) {
                    internBatchId = bId;
                }
                internType = internRows[0].intern_type;
            }
        }

        let query = `
            SELECT 
                t.task_id as id,
                t.title,
                t.description,
                t.resource_link as resourceLink,
                t.points,
                t.deadline,
                t.milestone_enabled as milestoneEnabled,
                t.milestone_count as milestoneCount,
                t.assignment_range as assignmentRange,
                t.target_group as targetGroup,
                t.created_at as createdAt,
                d.name as category,
                d.domain_id as domainId,
                a.name as createdBy
        `;

        const params = [];

        if (internId) {
            query += `, 
                its.submission_id as submissionId,
                its.status as submissionStatus, 
                its.submitted_at as submittedAt,
                its.linkedin_url as submissionUrl,
                its.file_url as submissionFile,
                its.reviewed_at as reviewedAt,
                its.admin_feedback as adminFeedback,
                its.rejection_date as rejectionDate,
                its.rejection_feedback as rejectionFeedback,
                its.rejection_feedback as rejectionFeedback,
                its.first_submitted_at as firstSubmittedAt,
                its.progress as progress,
                reviewer.name as reviewedBy,
                (SELECT COUNT(*) FROM intern_task_milestones itm WHERE itm.task_id = t.task_id AND itm.intern_id = ? AND itm.status = 'Approved') as approvedMilestones
            FROM tasks t
            LEFT JOIN domains d ON t.domain_id = d.domain_id
            LEFT JOIN admins a ON t.created_by = a.admin_id
            LEFT JOIN intern_task_submissions its ON t.task_id = its.task_id AND its.intern_id = ?
            LEFT JOIN admins reviewer ON its.reviewed_by = reviewer.admin_id
            WHERE t.domain_id = ? AND t.batch = ?
            AND (
                t.assignment_range = 'all' 
                OR (t.assignment_range = 'group' AND t.target_group = ?)
                OR (t.assignment_range = 'individual' AND EXISTS (SELECT 1 FROM task_assignments ta WHERE ta.task_id = t.task_id AND ta.intern_id = ?))
            )`;
            params.push(internId, internId, domainId, internBatchId, internType, internId);
        } else {
            query += `
                FROM tasks t
                LEFT JOIN domains d ON t.domain_id = d.domain_id
                LEFT JOIN admins a ON t.created_by = a.admin_id
                WHERE t.domain_id = ? AND t.batch = ?`;
            params.push(domainId, activeBatchId);
        }

        query += ` ORDER BY t.created_at DESC`;

        const [tasks] = await db.query(query, params);

        const formattedTasks = tasks.map(task => ({
            id: task.id,
            title: task.title,
            description: task.description,
            priority: 'medium',
            dueDate: task.deadline || new Date(task.createdAt).toISOString().split('T')[0],
            deadline: task.deadline,
            status: task.submissionStatus === 'approved' ? 'completed' :
                task.submissionStatus === 'rejected' ? 'rejected' :
                    (task.submissionStatus === 'pending' ? 'in-review' : 'pending'), // Map backend status to frontend logic
            category: task.category,
            domainId: task.domainId,
            resourceLink: task.resourceLink,
            points: task.points,
            milestoneEnabled: !!task.milestoneEnabled,
            milestoneCount: task.milestoneCount,
            assignmentRange: task.assignmentRange,
            targetGroup: task.targetGroup,
            createdBy: task.createdBy,
            createdAt: task.createdAt,
            // Submission Details
            submissionStatus: task.submissionStatus || null,
            submissionUrl: task.submissionUrl || null,
            submissionFile: task.submissionFile || null,
            submittedAt: task.submittedAt || null,
            reviewedBy: task.reviewedBy || null,
            reviewedAt: task.reviewedAt || null,
            adminFeedback: task.adminFeedback || null,
            rejectionDate: task.rejectionDate || null,
            rejectionFeedback: task.rejectionFeedback || null,
            firstSubmittedAt: task.firstSubmittedAt || null,
            approvedMilestones: task.approvedMilestones || 0,
            submissionId: task.submissionId || null,
            progress: task.progress || 0,
            approvedProgress: task.approvedProgress || 0
        }));

        res.status(200).json(formattedTasks);
    } catch (error) {
        console.error("Error fetching tasks by domain:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to fetch tasks",
            error: error.message
        });
    }
};

// Get single task by ID
const getTaskById = async (req, res) => {
    try {
        const { id } = req.params;
        const { internId } = req.query;

        const query = `
            SELECT 
                t.task_id as id,
                t.title,
                t.description,
                t.resource_link as resourceLink,
                t.points,
                t.deadline,
                t.milestone_enabled,
                t.milestone_count,
                t.assignment_range as assignmentRange,
                t.target_group as targetGroup,
                t.created_at as createdAt,
                d.name as category,
                d.domain_id as domainId,
                a.name as createdBy
            FROM tasks t
            LEFT JOIN domains d ON t.domain_id = d.domain_id
            LEFT JOIN admins a ON t.created_by = a.admin_id
            WHERE t.task_id = ?
        `;

        const [tasks] = await db.query(query, [id]);

        if (tasks.length === 0) {
            return res.status(404).json({
                status: "error",
                message: "Task not found"
            });
        }

        const task = tasks[0];
        let milestones = [];
        let submissionDetails = null;
        let selectedInternIds = [];

        // Fetch individual assignments if applicable
        if (task.assignmentRange === 'individual') {
            const [assignmentRows] = await db.query(
                "SELECT intern_id FROM task_assignments WHERE task_id = ?",
                [id]
            );
            selectedInternIds = assignmentRows.map(row => row.intern_id);
        }

        if (internId) {
            // Fetch milestones for this intern
            if (task.milestone_enabled) {
                const [milestoneRows] = await db.query(
                    `SELECT 
                         milestone_number,
                         student_progress,
                         status,
                         files,
                         file_names,
                         admin_review,
                         admin_comments,
                         id
                      FROM intern_task_milestones 
                      WHERE task_id = ? AND intern_id = ?
                      ORDER BY milestone_number ASC`,
                    [id, internId]
                );
                milestones = milestoneRows;
            }

            // Fetch submission details (for non-milestone tasks or general status)
            const [subRows] = await db.query(
                `SELECT * FROM intern_task_submissions WHERE task_id = ? AND intern_id = ?`,
                [id, internId]
            );
            if (subRows.length > 0) {
                submissionDetails = {
                    submission_id: subRows[0].submission_id,
                    status: subRows[0].status,
                    submissionUrl: subRows[0].linkedin_url,
                    submissionFile: subRows[0].file_url,
                    // Add other fields if needed
                };
            }
        }

        const formattedTask = {
            id: task.id,
            title: task.title,
            description: task.description,
            priority: 'medium',
            dueDate: task.deadline || new Date(task.createdAt).toISOString().split('T')[0],
            deadline: task.deadline,
            status: submissionDetails ? submissionDetails.status : 'pending',
            category: task.category,
            domainId: task.domainId,
            resourceLink: task.resourceLink,
            points: task.points,
            milestoneEnabled: !!task.milestone_enabled,
            milestoneCount: task.milestone_count || 0,
            assignmentRange: task.assignmentRange,
            targetGroup: task.targetGroup,
            selectedInternIds: selectedInternIds,
            createdBy: task.createdBy,
            createdAt: task.createdAt,
            milestones: milestones,
            submissionDetails: submissionDetails,
            submissionId: submissionDetails ? submissionDetails.submission_id : null
        };

        res.status(200).json(formattedTask);
    } catch (error) {
        console.error("Error fetching task:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to fetch task",
            error: error.message
        });
    }
};

// Create new task - Auto-assigns to active batch
const createTask = async (req, res) => {
    try {
        const {
            title,
            description,
            category,
            points,
            createdBy,
            deadline,
            assignmentRange = 'all',
            targetGroup = null,
            selectedInternIds: selectedInternIdsRaw = [],
            milestoneCount = 0
        } = req.body;

        // Parse selectedInternIds if it's a string (from FormData)
        let selectedInternIds = selectedInternIdsRaw;
        if (typeof selectedInternIds === 'string') {
            try {
                selectedInternIds = JSON.parse(selectedInternIds);
            } catch (e) {
                selectedInternIds = selectedInternIds.split(',').filter(Boolean);
            }
        }
        const { mode } = req.query;

        // Validation
        if (!title || !description || !category || !deadline) {
            return res.status(400).json({
                status: "error",
                message: "Title, description, category, and deadline are required"
            });
        }

        let activeBatchId = null;

        // If mode provided, finding active batch for that mode
        if (mode) {
            const [batchRows] = await db.execute(
                "SELECT id FROM batch WHERE is_active = 1 AND type = ? LIMIT 1",
                [mode]
            );
            if (batchRows.length > 0) {
                activeBatchId = batchRows[0].id;
            }
        }

        // If no mode or batch found for mode, fallback to default active batch
        if (!activeBatchId) {
            const [activeBatch] = await db.execute(
                "SELECT id FROM batch WHERE is_active = 1 LIMIT 1"
            );
            if (activeBatch.length > 0) {
                activeBatchId = activeBatch[0].id;
            }
        }

        if (!activeBatchId) {
            return res.status(400).json({
                status: "error",
                message: "No active batch found. Please set an active batch before creating tasks."
            });
        }

        // Get domain_id from domain name
        const [domains] = await db.query(
            "SELECT domain_id FROM domains WHERE name = ?",
            [category]
        );

        if (domains.length === 0) {
            return res.status(400).json({
                status: "error",
                message: "Invalid domain/category"
            });
        }

        const domainId = domains[0].domain_id;

        // Determine if milestones should be enabled based on active batch type
        let milestoneEnabled = false;
        let finalMilestoneCount = 0;

        if (activeBatchId) {
            const [batchInfo] = await db.query("SELECT type FROM batch WHERE id = ?", [activeBatchId]);
            if (batchInfo.length > 0 && batchInfo[0].type === 'offline') {
                milestoneEnabled = true;
                finalMilestoneCount = parseInt(milestoneCount) || 0;
            }
        }

        // Insert task with batch and targeted assignment fields
        const insertQuery = `
            INSERT INTO tasks (
                domain_id, 
                title, 
                description, 
                resource_link, 
                points, 
                created_by,
                batch,
                deadline,
                assignment_range,
                target_group,
                resource_file,
                milestone_enabled,
                milestone_count,
                created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        `;

        const [result] = await db.query(insertQuery, [
            domainId,
            title,
            description,
            null, // resource_link is deprecated in favor of resource_file
            points || 10,
            createdBy || null,
            activeBatchId,
            deadline || null,
            assignmentRange,
            targetGroup,
            req.file ? `/uploads/${req.file.filename}` : null,
            milestoneEnabled,
            finalMilestoneCount
        ]);

        const taskId = result.insertId;

        // If assignment range is individual, insert into task_assignments
        if (assignmentRange === 'individual' && Array.isArray(selectedInternIds) && selectedInternIds.length > 0) {
            const assignmentValues = selectedInternIds.map(internId => [taskId, internId]);
            await db.query(
                "INSERT INTO task_assignments (task_id, intern_id) VALUES ?",
                [assignmentValues]
            );
        }

        // Fetch the created task
        const [newTask] = await db.query(
            `SELECT 
                t.task_id as id,
                t.title,
                t.description,
                t.resource_link as resourceLink,
                t.points,
                t.milestone_enabled,
                t.milestone_count,
                t.created_at as createdAt,
                d.name as category,
                d.domain_id as domainId,
                a.name as createdBy
            FROM tasks t
            LEFT JOIN domains d ON t.domain_id = d.domain_id
            LEFT JOIN admins a ON t.created_by = a.admin_id
            WHERE t.task_id = ?`,
            [result.insertId]
        );

        const formattedTask = {
            id: newTask[0].id,
            title: newTask[0].title,
            description: newTask[0].description,
            priority: 'medium',
            dueDate: newTask[0].deadline || new Date(newTask[0].createdAt).toISOString().split('T')[0],
            deadline: newTask[0].deadline,
            status: 'pending',
            category: newTask[0].category,
            domainId: newTask[0].domainId,
            resourceLink: newTask[0].resourceLink,
            points: newTask[0].points,
            milestoneEnabled: !!newTask[0].milestone_enabled,
            milestoneCount: newTask[0].milestone_count || 0,
            createdBy: newTask[0].createdBy,
            createdAt: newTask[0].createdAt
        };

        res.status(201).json(formattedTask);

        // Notify Interns
        (async () => {
            try {
                let recipientEmails = [];
                if (assignmentRange === 'individual' && Array.isArray(selectedInternIds) && selectedInternIds.length > 0) {
                    // Fetch individual intern emails
                    const [interns] = await db.query(
                        `SELECT name, email FROM interns WHERE intern_id IN (${selectedInternIds.map(() => '?').join(',')})`,
                        selectedInternIds
                    );
                    recipientEmails = interns;
                } else {
                    // Fetch batch-wide intern emails
                    let batchQuery = "SELECT name, email FROM interns WHERE batch = ? AND is_active = 1";
                    const batchParams = [activeBatchId];
                    if (assignmentRange === 'targeted' && targetGroup) {
                        batchQuery += " AND university = ?";
                        batchParams.push(targetGroup);
                    }
                    const [interns] = await db.execute(batchQuery, batchParams);
                    recipientEmails = interns;
                }

                // Send bulk emails
                recipientEmails.forEach(intern => {
                    if (intern.email) {
                        emailService.sendNotificationEmail(intern.email, intern.name, {
                            title: `New Task: ${title}`,
                            message: `A new task "${title}" has been assigned to your domain. Points: ${points || 10}.\nDeadline: ${deadline || 'N/A'}.`,
                            type: 'info'
                        }).catch(err => console.error(`Failed to send task email to ${intern.email}:`, err));
                    }
                });
            } catch (err) {
                console.error("Failed to process batch emails for new task:", err);
            }
        })();
    } catch (error) {
        console.error("Error creating task:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to create task",
            error: error.message
        });
    }
};

// Update task
const updateTask = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            title,
            description,
            category,
            resourceLink,
            points,
            deadline,
            assignmentRange,
            targetGroup,
            selectedInternIds: selectedInternIdsRaw = []
        } = req.body;

        // Parse selectedInternIds if it's a string (from FormData)
        let selectedInternIds = selectedInternIdsRaw;
        if (typeof selectedInternIds === 'string') {
            try {
                selectedInternIds = JSON.parse(selectedInternIds);
            } catch (e) {
                selectedInternIds = selectedInternIds.split(',').filter(Boolean);
            }
        }

        // Check if task exists
        const [existingTask] = await db.query(
            "SELECT task_id, assignment_range FROM tasks WHERE task_id = ?",
            [id]
        );

        if (existingTask.length === 0) {
            return res.status(404).json({
                status: "error",
                message: "Task not found"
            });
        }

        // Get domain_id if category is provided
        let domainId = null;
        if (category) {
            const [domains] = await db.query(
                "SELECT domain_id FROM domains WHERE name = ?",
                [category]
            );

            if (domains.length === 0) {
                return res.status(400).json({
                    status: "error",
                    message: "Invalid domain/category"
                });
            }
            domainId = domains[0].domain_id;
        }

        // Build update query dynamically
        const updates = [];
        const values = [];

        if (title) {
            updates.push("title = ?");
            values.push(title);
        }
        if (description) {
            updates.push("description = ?");
            values.push(description);
        }
        if (domainId) {
            updates.push("domain_id = ?");
            values.push(domainId);
        }
        if (resourceLink !== undefined) {
            updates.push("resource_link = ?");
            values.push(resourceLink || null);
        }
        if (points !== undefined) {
            updates.push("points = ?");
            values.push(points);
        }
        if (deadline !== undefined) {
            updates.push("deadline = ?");
            values.push(deadline || null);
        }
        if (assignmentRange) {
            updates.push("assignment_range = ?");
            values.push(assignmentRange);
        }
        if (targetGroup !== undefined) {
            updates.push("target_group = ?");
            values.push(targetGroup || null);
        }

        if (updates.length > 0) {
            values.push(id);
            const updateQuery = `
                UPDATE tasks 
                SET ${updates.join(", ")}
                WHERE task_id = ?
            `;
            await db.query(updateQuery, values);
        }

        // Handle selectedInternIds if assignmentRange is 'individual'
        if (assignmentRange === 'individual' || (existingTask[0].assignment_range === 'individual' && !assignmentRange)) {
            // Only update assignments if selectedInternIds is provided
            if (Array.isArray(selectedInternIds) && selectedInternIds.length > 0) {
                // Clear old assignments
                await db.query("DELETE FROM task_assignments WHERE task_id = ?", [id]);
                // Insert new ones
                const assignmentValues = selectedInternIds.map(internId => [id, internId]);
                await db.query(
                    "INSERT INTO task_assignments (task_id, intern_id) VALUES ?",
                    [assignmentValues]
                );
            }
        } else if (assignmentRange && assignmentRange !== 'individual') {
            // If switched away from individual, clear any old assignments
            await db.query("DELETE FROM task_assignments WHERE task_id = ?", [id]);
        }

        // Fetch updated task
        const [updatedTask] = await db.query(
            `SELECT 
                t.*,
                d.name as category,
                a.name as createdBy
            FROM tasks t
            LEFT JOIN domains d ON t.domain_id = d.domain_id
            LEFT JOIN admins a ON t.created_by = a.admin_id
            WHERE t.task_id = ?`,
            [id]
        );

        const formattedTask = {
            id: updatedTask[0].id,
            title: updatedTask[0].title,
            description: updatedTask[0].description,
            priority: 'medium',
            dueDate: updatedTask[0].deadline || new Date(updatedTask[0].createdAt).toISOString().split('T')[0],
            deadline: updatedTask[0].deadline,
            status: 'pending',
            category: updatedTask[0].category,
            domainId: updatedTask[0].domainId,
            resourceLink: updatedTask[0].resourceLink,
            points: updatedTask[0].points,
            createdBy: updatedTask[0].createdBy,
            createdAt: updatedTask[0].createdAt
        };

        res.status(200).json(formattedTask);
    } catch (error) {
        console.error("Error updating task:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to update task",
            error: error.message
        });
    }
};

// Delete a task
const deleteTask = async (req, res) => {
    try {
        const { id } = req.params;

        // Check if task exists
        const [existingTask] = await db.query(
            "SELECT task_id FROM tasks WHERE task_id = ?",
            [id]
        );

        if (existingTask.length === 0) {
            return res.status(404).json({
                status: "error",
                message: "Task not found"
            });
        }

        // 1. Delete dependent submission history
        // First get submission IDs
        const [submissions] = await db.query("SELECT submission_id FROM intern_task_submissions WHERE task_id = ?", [id]);
        const submissionIds = submissions.map(s => s.submission_id);

        if (submissionIds.length > 0) {
            // Use query with placeholder expansion for array
            await db.query("DELETE FROM task_submission_history WHERE submission_id IN (?)", [submissionIds]);
        }

        // 2. Delete submissions
        await db.query("DELETE FROM intern_task_submissions WHERE task_id = ?", [id]);

        // 3. Delete milestones
        await db.query("DELETE FROM intern_task_milestones WHERE task_id = ?", [id]);

        // 4. Delete assignments (if any)
        await db.query("DELETE FROM task_assignments WHERE task_id = ?", [id]);

        // 5. Finally delete task
        await db.query("DELETE FROM tasks WHERE task_id = ?", [id]);

        res.status(200).json({
            status: "success",
            message: "Task deleted successfully"
        });
    } catch (error) {
        console.error("Error deleting task:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to delete task",
            error: error.message
        });
    }
};

// Get task statistics
const getTaskStats = async (req, res) => {
    try {
        const query = `
            SELECT 
                d.name as domain,
                COUNT(t.task_id) as taskCount
            FROM domains d
            LEFT JOIN tasks t ON d.domain_id = t.domain_id
            GROUP BY d.domain_id, d.name
        `;

        const [stats] = await db.query(query);

        res.status(200).json(stats);
    } catch (error) {
        console.error("Error fetching task stats:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to fetch task statistics",
            error: error.message
        });
    }
};

// Get task completion statistics (for Task Wise View) - Active batch only
const getTaskCompletionStats = async (req, res) => {
    try {
        // Get active batch ID
        const [activeBatch] = await db.execute(
            "SELECT id FROM batch WHERE is_active = 1 LIMIT 1"
        );

        // If no active batch, return empty stats
        if (activeBatch.length === 0) {
            return res.status(200).json({
                status: "success",
                data: []
            });
        }

        const activeBatchId = activeBatch[0].id;

        const query = `
            SELECT 
                t.task_id as id,
                t.title,
                t.points,
                d.name as domain,
                COUNT(DISTINCT CASE WHEN its.status = 'approved' THEN its.intern_id END) as completedCount,
                CASE 
                    WHEN t.assignment_range = 'all' THEN (SELECT COUNT(*) FROM interns WHERE is_active = 1 AND batch = t.batch)
                    WHEN t.assignment_range = 'group' THEN (SELECT COUNT(*) FROM interns WHERE is_active = 1 AND batch = t.batch AND intern_type = t.target_group)
                    WHEN t.assignment_range = 'individual' THEN (SELECT COUNT(*) FROM task_assignments WHERE task_id = t.task_id)
                    ELSE 0
                END as totalInterns
            FROM tasks t
            LEFT JOIN domains d ON t.domain_id = d.domain_id
            LEFT JOIN intern_task_submissions its ON t.task_id = its.task_id
            WHERE t.batch = ?
            GROUP BY t.task_id, t.title, t.points, d.name, t.assignment_range, t.target_group, t.batch
            ORDER BY t.created_at DESC
        `;

        const [stats] = await db.query(query, [activeBatchId]);

        res.status(200).json({
            status: "success",
            data: stats
        });
    } catch (error) {
        console.error("Error fetching task completion stats:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to fetch task completion stats",
            error: error.message
        });
    }
};

// Get interns for a specific task with status (Active batch only)
const getTaskInterns = async (req, res) => {
    try {
        const { id } = req.params;
        const { mode } = req.query;
        console.log(`[getTaskInterns] Fetching interns for task ID: ${id}, Mode: ${mode}`);

        let activeBatchId = null;

        // If mode provided, finding active batch for that mode
        if (mode) {
            const [batchRows] = await db.execute(
                "SELECT id FROM batch WHERE is_active = 1 AND type = ? LIMIT 1",
                [mode]
            );
            if (batchRows.length > 0) {
                activeBatchId = batchRows[0].id;
            }
        }

        // If no mode or batch found for mode, fallback to default active batch
        if (!activeBatchId) {
            const [activeBatch] = await db.execute(
                "SELECT id FROM batch WHERE is_active = 1 LIMIT 1"
            );
            if (activeBatch.length > 0) {
                activeBatchId = activeBatch[0].id;
            }
        }

        // If still no active batch, return empty array
        if (!activeBatchId) {
            return res.status(200).json({ status: "success", data: [] });
        }

        // Get all active interns from active batch and their status for this task
        // Including submission details for timeline view
        const query = `
            SELECT 
                i.intern_id as id,
                i.name,
                i.email,
                i.mobile,
                i.organization,
                i.university,
                i.designation,
                i.profile_pic as avatar,
                d.name as domain,
                its.submission_id as submissionId,
                COALESCE(its.status, 'not_started') as status,
                its.submitted_at as submittedAt,
                its.linkedin_url as linkedinUrl,
                its.file_url as fileUrl,
                its.reviewed_at as reviewedAt,
                its.admin_feedback as adminFeedback,
                its.rejection_date as rejectionDate,
                its.rejection_feedback as rejectionFeedback,
                its.first_submitted_at as firstSubmittedAt,
                reviewer.name as reviewedBy,
                t.created_at as taskCreatedAt,
                creator.name as taskCreatedBy,
                t.deadline as taskDeadline,
                t.milestone_enabled as milestoneEnabled,
                t.deadline as taskDeadline,
                t.milestone_enabled as milestoneEnabled,
                t.milestone_count as milestoneCount,
                COALESCE(its.progress, 0) as progress
            FROM interns i
            JOIN domains d ON i.domain_id = d.domain_id
            JOIN tasks t ON t.task_id = ?
            LEFT JOIN intern_task_submissions its ON i.intern_id = its.intern_id AND its.task_id = t.task_id
            LEFT JOIN admins reviewer ON its.reviewed_by = reviewer.admin_id
            LEFT JOIN admins creator ON t.created_by = creator.admin_id
            WHERE i.is_active = 1 AND i.batch = t.batch
            AND (
                t.assignment_range = 'all'
                OR (t.assignment_range = 'group' AND t.target_group = i.intern_type)
                OR (t.assignment_range = 'individual' AND EXISTS (SELECT 1 FROM task_assignments ta WHERE ta.task_id = t.task_id AND ta.intern_id = i.intern_id))
            )
            ORDER BY 
                CASE 
                    WHEN its.status = 'approved' THEN 1 
                    WHEN its.status = 'pending' THEN 2
                    WHEN its.status = 'rejected' THEN 3
                    ELSE 4 
                END,
                i.name ASC
        `;

        const [interns] = await db.query(query, [id]);

        // If milestones are enabled for this task, fetch milestone progress for each intern
        if (interns.length > 0 && interns[0].milestoneEnabled) {
            const [milestones] = await db.query(
                `SELECT * FROM intern_task_milestones WHERE task_id = ?`,
                [id]
            );

            // Map milestones to interns
            interns.forEach(intern => {
                const internMilestones = milestones.filter(m => m.intern_id === intern.id);
                intern.milestones = internMilestones;

                // Calculate overall progress
                // If task has milestoneCount, we can calculate percentage
                const totalMilestones = intern.milestoneCount || 0;
                if (totalMilestones > 0) {
                    const approvedCount = internMilestones.filter(m => m.status === 'Approved').length;
                    intern.milestoneProgress = (approvedCount / totalMilestones) * 100;
                } else {
                    intern.milestoneProgress = 0;
                }
            });
        }

        console.log(`[getTaskInterns] Found ${interns.length} interns for task ${id}`);

        res.status(200).json({
            status: "success",
            data: interns
        });

    } catch (error) {
        console.error("Error fetching task interns:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to fetch task interns",
            error: error.message
        });
    }
};

// Get task insights statistics
const getTaskInsights = async (req, res) => {
    try {
        // Get total assigned tasks
        const [totalResult] = await db.query(
            "SELECT COUNT(*) as total FROM tasks"
        );

        // Get completed tasks (approved submissions)
        const [completedResult] = await db.query(
            `SELECT COUNT(DISTINCT task_id) as completed 
             FROM intern_task_submissions 
             WHERE status = 'approved'`
        );

        // Get overdue tasks (currently 0 - can be updated when due_date column is added)
        const overdueCount = 0;

        // Get tasks assigned today
        const [todayResult] = await db.query(
            `SELECT COUNT(*) as assignedToday 
             FROM tasks 
             WHERE DATE(created_at) = CURDATE()`
        );

        const insights = {
            totalAssigned: totalResult[0].total || 0,
            completed: completedResult[0].completed || 0,
            overdue: overdueCount,
            assignedToday: todayResult[0].assignedToday || 0
        };

        res.status(200).json({
            status: "success",
            data: insights
        });
    } catch (error) {
        console.error("Error fetching task insights:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to fetch task insights",
            error: error.message
        });
    }
};

// Submit a task
const submitTask = async (req, res) => {
    try {
        const { taskId } = req.params;
        const { linkedinUrl, internId, progress, studentComment } = req.body;
        const file = req.file;

        console.log(`[submitTask] Request received. TaskID: ${taskId}, InternID: ${internId}, Progress: ${progress}%`);

        if (!internId) {
            return res.status(400).json({
                status: "error",
                message: "Intern ID is required"
            });
        }

        // Check if task exists
        const [taskCheck] = await db.query("SELECT task_id, deadline FROM tasks WHERE task_id = ?", [taskId]);
        if (taskCheck.length === 0) {
            return res.status(404).json({
                status: "error",
                message: "Task not found"
            });
        }

        const task = taskCheck[0];
        const isLate = task.deadline && new Date() > new Date(task.deadline);
        const submissionStatus = 'pending'; // Always pending review, lateness is calculated by dates

        // Check if already submitted
        const [existingSubmission] = await db.query(
            "SELECT submission_id, status, reviewed_at, admin_feedback, submitted_at, first_submitted_at, rejection_date FROM intern_task_submissions WHERE task_id = ? AND intern_id = ?",
            [taskId, internId]
        );

        let submissionId;
        const progressValue = progress ? parseInt(progress) : 0;
        const filePath = file && file.filename ? `uploads/${file.filename}` : null; // New file or keep old? Logic below.

        if (existingSubmission.length > 0) {
            const existing = existingSubmission[0];
            submissionId = existing.submission_id;

            // Update existing submission
            let updateQuery = `
                UPDATE intern_task_submissions 
                SET submitted_at = NOW(), 
                    status = 'pending', 
                    progress = ?,
                    last_student_comment = ?
            `;
            const updateParams = [progressValue, studentComment || null];

            if (linkedinUrl !== undefined) {
                updateQuery += `, linkedin_url = ?`;
                updateParams.push(linkedinUrl || null);
            }
            if (filePath) {
                updateQuery += `, file_url = ?`;
                updateParams.push(filePath);
            }

            // If previously rejected, save rejection history (optional logic, keeping existing)
            if (existing.status === 'rejected' && !existing.rejection_date) {
                updateQuery += `, rejection_date = ?, rejection_feedback = ?`;
                updateParams.push(existing.reviewed_at, existing.admin_feedback);
            }

            // Set first_submitted_at if not already set
            if (!existing.first_submitted_at) {
                updateQuery += `, first_submitted_at = ?`;
                updateParams.push(existing.submitted_at);
            }

            updateQuery += ` WHERE submission_id = ?`;
            updateParams.push(submissionId);

            await db.query(updateQuery, updateParams);

        } else {
            // New submission
            const insertQuery = `
                INSERT INTO intern_task_submissions (
                    intern_id, task_id, linkedin_url, file_url, status, submitted_at, progress, last_student_comment
                ) VALUES (?, ?, ?, ?, 'pending', NOW(), ?, ?)
            `;
            const [result] = await db.query(insertQuery, [
                internId,
                taskId,
                linkedinUrl || null,
                filePath,
                progressValue,
                studentComment || null
            ]);
            submissionId = result.insertId;
        }

        // Insert into History
        await db.query(
            `INSERT INTO task_submission_history (
                submission_id, type, progress, file_url, student_comment, status
            ) VALUES (?, 'intern', ?, ?, ?, 'pending')`,
            [submissionId, progressValue, filePath || (existingSubmission.length > 0 ? existingSubmission[0].file_url : null), studentComment || null]
        );

        // Log Activity for Streak
        await db.query(
            `INSERT INTO activity_log (student_id, action_type, related_id, description) 
             VALUES (?, 'task_submission', ?, ?)`,
            [internId, taskId, `Submitted progress: ${progressValue}%`]
        );

        res.status(existingSubmission.length > 0 ? 200 : 201).json({
            status: "success",
            message: "Task submission updated successfully"
        });

    } catch (error) {
        console.error("Error submitting task:", error);
        console.error("Error details:", {
            message: error.message,
            code: error.code,
            sqlMessage: error.sqlMessage
        });
        res.status(500).json({
            status: "error",
            message: "Failed to submit task",
            error: error.message
        });
    }
};

// Review a milestone
const reviewMilestone = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, admin_review, admin_comments } = req.body;

        if (!status) {
            return res.status(400).json({
                status: "error",
                message: "Status is required"
            });
        }

        // Check if milestone exists
        const [milestone] = await db.query(
            "SELECT id, intern_id, task_id, milestone_number FROM intern_task_milestones WHERE id = ?",
            [id]
        );

        if (milestone.length === 0) {
            return res.status(404).json({
                status: "error",
                message: "Milestone not found"
            });
        }

        await db.query(
            "UPDATE intern_task_milestones SET status = ?, admin_review = ?, admin_comments = ?, reviewed_at = NOW() WHERE id = ?",
            [status, admin_review, admin_comments, id]
        );

        // Record in task_submission_history
        // 1. Ensure intern_task_submissions entry exists
        const [subRows] = await db.query(
            "SELECT submission_id FROM intern_task_submissions WHERE task_id = ? AND intern_id = ?",
            [milestone[0].task_id, milestone[0].intern_id]
        );

        let submissionId;
        if (subRows.length === 0) {
            const [result] = await db.query(
                "INSERT INTO intern_task_submissions (intern_id, task_id, status, progress) VALUES (?, ?, 'pending', 0)",
                [milestone[0].intern_id, milestone[0].task_id]
            );
            submissionId = result.insertId;
        } else {
            submissionId = subRows[0].submission_id;
        }

        // 2. Insert into history
        const adminId = req.user?.admin_id || req.user?.id || null;
        await db.query(
            `INSERT INTO task_submission_history (
                submission_id, type, admin_id, feedback, student_comment, status
            ) VALUES (?, 'admin', ?, ?, ?, ?)`,
            [submissionId, adminId, admin_comments || admin_review, `Milestone ${milestone[0].milestone_number} reviewed`, status.toLowerCase()]
        );

        res.status(200).json({
            status: "success",
            message: "Milestone reviewed successfully"
        });
    } catch (error) {
        console.error("Error reviewing milestone:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to review milestone",
            error: error.message
        });
    }
};

// Update milestone progress by student
const updateMilestoneProgress = async (req, res) => {
    try {
        const { id } = req.params;
        const { student_progress, note } = req.body;
        const files = req.files;

        // Build update query
        let updateQuery = "UPDATE intern_task_milestones SET student_progress = ?, status = ?";
        const params = [student_progress, 'Under Review']; // Auto-set status to 'Under Review'

        if (note) {
            // Assuming we use admin_comments for both or creating a new column is hard without schema check.
            // Let's use `files` column to store note if needed or just skip note for now if column doesn't exist?
            // Reviewing getTaskById, we select `admin_comments`, `admin_review`.
            // We don't see `intern_comments`.
            // However, offline task controller was doing something.
            // Let's assume we can only update progress and files for now, and maybe append note to file_names if desperate, but better not hack.
            // I'll skip note for now to avoid SQL error if column missing.
            // Wait, `getTaskInterns` in task.controller.js selects `admin_feedback` etc.
            // I'll stick to progress and files.
        }

        if (files && files.length > 0) {
            const filePaths = files.map(f => `/uploads/${f.filename}`).join(',');
            const fileNames = files.map(f => f.originalname).join(',');
            updateQuery += ", files = ?, file_names = ?";
            params.push(filePaths, fileNames);
        }

        updateQuery += " WHERE id = ?";
        params.push(id);

        await db.query(updateQuery, params);

        // Record in task_submission_history
        // 1. Get milestone details
        const [milestone] = await db.query("SELECT task_id, intern_id, milestone_number FROM intern_task_milestones WHERE id = ?", [id]);
        if (milestone.length > 0) {
            // 2. Ensure intern_task_submissions entry exists
            const [subRows] = await db.query(
                "SELECT submission_id, file_url FROM intern_task_submissions WHERE task_id = ? AND intern_id = ?",
                [milestone[0].task_id, milestone[0].intern_id]
            );

            let submissionId;
            let existingFile = null;
            if (subRows.length === 0) {
                const [result] = await db.query(
                    "INSERT INTO intern_task_submissions (intern_id, task_id, status, progress) VALUES (?, ?, 'pending', ?)",
                    [milestone[0].intern_id, milestone[0].task_id, student_progress]
                );
                submissionId = result.insertId;
            } else {
                submissionId = subRows[0].submission_id;
                existingFile = subRows[0].file_url;
            }

            // 3. Insert into history
            const filePaths = files && files.length > 0 ? files.map(f => `/uploads/${f.filename}`).join(',') : existingFile;
            await db.query(
                `INSERT INTO task_submission_history (
                    submission_id, type, progress, file_url, student_comment, status
                ) VALUES (?, 'intern', ?, ?, ?, 'pending')`,
                [submissionId, student_progress, filePaths, note ? `Milestone ${milestone[0].milestone_number}: ${note}` : `Updated Milestone ${milestone[0].milestone_number}`, 'pending']
            );
        }

        res.status(200).json({
            status: "success",
            message: "Milestone updated successfully"
        });
    } catch (error) {
        console.error("Error updating milestone progress:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to update milestone",
            error: error.message
        });
    }
};

module.exports = {
    getAllTasks,
    getTasksByDomain,
    getTaskById,
    createTask,
    updateTask,
    deleteTask,
    getTaskStats,
    getTaskCompletionStats,
    getTaskInterns,
    getTaskInsights,
    submitTask,
    reviewMilestone,
    updateMilestoneProgress
};

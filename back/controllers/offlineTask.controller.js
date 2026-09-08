const db = require("../config/db");
const emailService = require("../services/emailService");

const isAdmin = (user) => user && (user.role && ['admin', 'superadmin', 'super admin', 'batch admin', 'domain admin', 'reviewer', 'task-manager'].includes(String(user.role).toLowerCase()));
const isIntern = (user) => user && (user.userType === 'intern' || (!user.role && user.id));

// 1. Create Offline Task (Admin)
const createOfflineTask = async (req, res) => {
    try {
        const { student_id, batch_id, title, description, domain, start_date, deadline, total_milestones, created_by } = req.body;

        if (!student_id || !batch_id || !title || !total_milestones) {
            return res.status(400).json({ status: "error", message: "Missing required fields" });
        }

        // Start transaction to ensure both task and milestones are created
        const connection = await db.getConnection();
        await connection.beginTransaction();

        try {
            const [result] = await connection.execute(
                `INSERT INTO offline_tasks (student_id, batch_id, title, description, domain, start_date, deadline, total_milestones, created_by, status, progress_percentage, last_updated)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', 0, NOW())`,
                [student_id, batch_id, title, description || null, domain || null, start_date, deadline, total_milestones, created_by]
            );

            const taskId = result.insertId;

            // Create initial milestones
            for (let i = 1; i <= total_milestones; i++) {
                await connection.execute(
                    `INSERT INTO offline_task_milestones (task_id, milestone_number, status)
                     VALUES (?, ?, 'Not Started')`,
                    [taskId, i]
                );
            }

            await connection.commit();

            // Notify intern of new task
            const [intern] = await connection.execute(
                "SELECT name, email FROM interns WHERE intern_id = ?",
                [student_id]
            );

            if (intern.length > 0 && intern[0].email) {
                emailService.sendNotificationEmail(intern[0].email, intern[0].name, {
                    title: `New Task Assigned: ${title}`,
                    message: `A new task "${title}" has been assigned to you. Please check your dashboard for details and deadlines.`,
                    type: 'info'
                }).catch(err => console.error("Failed to send task assignment email:", err));
            }

            res.status(201).json({ status: "success", message: "Offline task created successfully", data: { taskId } });

        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            connection.release();
        }

    } catch (error) {
        console.error("Error creating offline task:", error);
        res.status(500).json({ status: "error", message: "Failed to create offline task" });
    }
};

// 2. Get Offline Tasks for Student (access: admin can pass any studentId; intern only own)
const getStudentOfflineTasks = async (req, res) => {
    try {
        const { studentId } = req.params;
        const sid = parseInt(studentId, 10);
        if (isNaN(sid)) return res.status(400).json({ status: "error", message: "Invalid student id" });

        if (isIntern(req.user) && req.user.id !== sid) {
            return res.status(403).json({ status: "error", message: "You can only view your own tasks" });
        }

        const [tasks] = await db.execute(`
            SELECT t.*, 
                   (SELECT COUNT(*) FROM offline_task_milestones m WHERE m.task_id = t.id) as total_milestones_count,
                   (SELECT COUNT(*) FROM offline_task_milestones m WHERE m.task_id = t.id AND m.status = 'Approved') as approved_milestones
            FROM offline_tasks t
            WHERE t.student_id = ?
            ORDER BY t.created_at DESC
        `, [sid]);

        res.status(200).json({ status: "success", data: tasks });
    } catch (error) {
        console.error("Error fetching student tasks:", error);
        res.status(500).json({ status: "error", message: "Failed to fetch tasks" });
    }
};

// 3. Get Task Details with Milestones (intern can only view own task)
const getOfflineTaskDetails = async (req, res) => {
    try {
        const { taskId } = req.params;
        const tid = parseInt(taskId, 10);
        if (isNaN(tid)) return res.status(400).json({ status: "error", message: "Invalid task id" });

        const [taskRows] = await db.execute("SELECT * FROM offline_tasks WHERE id = ?", [tid]);
        if (taskRows.length === 0) return res.status(404).json({ status: "error", message: "Task not found" });
        const task = taskRows[0];

        if (isIntern(req.user) && task.student_id !== req.user.id) {
            return res.status(403).json({ status: "error", message: "You can only view your own tasks" });
        }

        const [milestones] = await db.execute(`
            SELECT m.*, 
                   GROUP_CONCAT(f.file_path) as files,
                   GROUP_CONCAT(f.file_name) as file_names
            FROM offline_task_milestones m
            LEFT JOIN offline_task_files f ON m.id = f.milestone_id
            WHERE m.task_id = ?
            GROUP BY m.id
            ORDER BY m.milestone_number ASC
        `, [tid]);

        res.status(200).json({ status: "success", data: { ...task, milestones } });
    } catch (error) {
        console.error("Error fetching task details:", error);
        res.status(500).json({ status: "error", message: "Failed to fetch task details" });
    }
};

// 4. Update Milestone (Student)
const updateMilestone = async (req, res) => {
    try {
        const { milestoneId } = req.params;
        const { student_progress, note } = req.body;
        const files = req.files; // Array of files from multer

        const connection = await db.getConnection();
        await connection.beginTransaction();

        try {
            await connection.execute(
                `UPDATE offline_task_milestones 
                 SET student_progress = ?, status = 'Under Review', submitted_at = NOW() 
                 WHERE id = ?`,
                [student_progress, milestoneId]
            );

            if (note) {
                await connection.execute(
                    "INSERT INTO offline_task_notes (milestone_id, note_text) VALUES (?, ?)",
                    [milestoneId, note]
                );
            }

            if (files && files.length > 0) {
                for (const file of files) {
                    await connection.execute(
                        "INSERT INTO offline_task_files (milestone_id, file_path, file_name) VALUES (?, ?, ?)",
                        [milestoneId, `/uploads/offline/${file.filename}`, file.originalname]
                    );
                }
            }

            // Update Task Status if needed
            const [milestone] = await connection.execute("SELECT task_id FROM offline_task_milestones WHERE id = ?", [milestoneId]);
            await connection.execute(
                "UPDATE offline_tasks SET status = 'In Progress' WHERE id = ? AND status = 'Assigned'",
                [milestone[0].task_id]
            );

            await connection.commit();
            res.status(200).json({ status: "success", message: "Milestone updated successfully" });
        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error("Error updating milestone:", error);
        res.status(500).json({ status: "error", message: "Failed to update milestone" });
    }
};

// 5. Review Milestone (Admin)
const reviewMilestone = async (req, res) => {
    try {
        const { milestoneId } = req.params;
        const { status, admin_review, admin_comments } = req.body;

        const connection = await db.getConnection();
        await connection.beginTransaction();

        try {
            await connection.execute(
                `UPDATE offline_task_milestones 
                 SET status = ?, admin_review = ?, admin_comments = ? 
                 WHERE id = ?`,
                [status, admin_review, admin_comments, milestoneId]
            );

            // Get task ID
            const [milestone] = await connection.execute("SELECT task_id FROM offline_task_milestones WHERE id = ?", [milestoneId]);
            const taskId = milestone[0].task_id;

            // Check if all milestones are approved
            const [total] = await connection.execute("SELECT COUNT(*) as count FROM offline_task_milestones WHERE task_id = ?", [taskId]);
            const [approved] = await connection.execute("SELECT COUNT(*) as count FROM offline_task_milestones WHERE task_id = ? AND status = 'Approved'", [taskId]);

            if (total[0].count === approved[0].count) {
                await connection.execute("UPDATE offline_tasks SET status = 'Completed' WHERE id = ?", [taskId]);
            } else if (status === 'Submitted' || status === 'Under Review') {
                await connection.execute("UPDATE offline_tasks SET status = 'Under Review' WHERE id = ?", [taskId]);
            }

            await connection.commit();

            // Notify intern
            const [internData] = await connection.execute(
                `SELECT i.name, i.email, t.title as taskTitle
                 FROM offline_task_milestones m
                 JOIN offline_tasks t ON m.task_id = t.id
                 JOIN interns i ON t.student_id = i.intern_id
                 WHERE m.id = ?`,
                [milestoneId]
            );

            if (internData.length > 0) {
                emailService.sendTaskReviewEmail(
                    internData[0].email,
                    internData[0].name,
                    { id: milestoneId, taskName: internData[0].taskTitle, status, feedback: admin_comments }
                ).catch(err => console.error("Failed to notify intern of milestone review:", err));
            }

            res.status(200).json({ status: "success", message: "Milestone reviewed successfully" });
        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error("Error reviewing milestone:", error);
        res.status(500).json({ status: "error", message: "Failed to review milestone" });
    }
};

// 6. Update task progress (Student only) - progressPercentage, optional status, optional submission_notes
const updateTaskProgress = async (req, res) => {
    try {
        const { taskId } = req.params;
        const { progressPercentage, status, submission_notes } = req.body;
        const tid = parseInt(taskId, 10);
        if (isNaN(tid)) return res.status(400).json({ status: "error", message: "Invalid task id" });

        if (!isIntern(req.user)) {
            return res.status(403).json({ status: "error", message: "Only the assigned student can update progress" });
        }

        const progress = Math.min(100, Math.max(0, parseInt(progressPercentage, 10) || 0));
        let newStatus = status ? String(status).trim() : null;

        const [rows] = await db.execute("SELECT id, student_id, status FROM offline_tasks WHERE id = ?", [tid]);
        if (rows.length === 0) return res.status(404).json({ status: "error", message: "Task not found" });
        if (rows[0].student_id !== req.user.id) {
            return res.status(403).json({ status: "error", message: "You can only update your own tasks" });
        }

        if (progress === 100) {
            newStatus = 'Completed';
        } else if (newStatus === 'Completed') {
            newStatus = 'In Progress';
        }
        if (!newStatus) newStatus = progress > 0 ? 'In Progress' : 'Pending';

        const updates = [
            'progress_percentage = ?',
            'status = ?',
            'last_updated = NOW()',
            newStatus === 'Completed' ? 'completion_date = COALESCE(completion_date, NOW())' : null
        ].filter(Boolean);
        const setClause = updates.join(', ');
        const params = [progress, newStatus];
        if (submission_notes != null) {
            await db.execute(
                'UPDATE offline_tasks SET submission_notes = ?, last_updated = NOW() WHERE id = ?',
                [String(submission_notes), tid]
            );
        }
        await db.execute(
            `UPDATE offline_tasks SET ${setClause} WHERE id = ?`,
            [...params, tid]
        );

        res.status(200).json({ status: "success", message: "Progress updated", data: { progressPercentage: progress, status: newStatus } });
    } catch (error) {
        console.error("Error updating task progress:", error);
        res.status(500).json({ status: "error", message: "Failed to update progress" });
    }
};

// 7. Edit assigned task (Admin only) - title, description, domain, deadline
const updateTask = async (req, res) => {
    try {
        const { taskId } = req.params;
        const { title, description, domain, deadline } = req.body;
        const tid = parseInt(taskId, 10);
        if (isNaN(tid)) return res.status(400).json({ status: "error", message: "Invalid task id" });

        if (!isAdmin(req.user)) {
            return res.status(403).json({ status: "error", message: "Admin only" });
        }

        const [rows] = await db.execute("SELECT id FROM offline_tasks WHERE id = ?", [tid]);
        if (rows.length === 0) return res.status(404).json({ status: "error", message: "Task not found" });

        await db.execute(
            `UPDATE offline_tasks SET title = COALESCE(?, title), description = COALESCE(?, description), domain = COALESCE(?, domain), deadline = COALESCE(?, deadline), last_updated = NOW() WHERE id = ?`,
            [title || null, description || null, domain || null, deadline || null, tid]
        );
        res.status(200).json({ status: "success", message: "Task updated" });
    } catch (error) {
        console.error("Error updating task:", error);
        res.status(500).json({ status: "error", message: "Failed to update task" });
    }
};

// 8. Review task (Admin only) - set status Reviewed, mentor_feedback
const reviewTask = async (req, res) => {
    try {
        const { taskId } = req.params;
        const { mentor_feedback } = req.body;
        const tid = parseInt(taskId, 10);
        if (isNaN(tid)) return res.status(400).json({ status: "error", message: "Invalid task id" });

        if (!isAdmin(req.user)) {
            return res.status(403).json({ status: "error", message: "Admin only" });
        }

        const [rows] = await db.execute("SELECT id FROM offline_tasks WHERE id = ?", [tid]);
        if (rows.length === 0) return res.status(404).json({ status: "error", message: "Task not found" });

        await db.execute(
            "UPDATE offline_tasks SET status = 'Reviewed', mentor_feedback = COALESCE(?, mentor_feedback), last_updated = NOW() WHERE id = ?",
            [mentor_feedback != null ? String(mentor_feedback) : null, tid]
        );
        res.status(200).json({ status: "success", message: "Task reviewed" });
    } catch (error) {
        console.error("Error reviewing task:", error);
        res.status(500).json({ status: "error", message: "Failed to review task" });
    }
};

module.exports = {
    createOfflineTask,
    getStudentOfflineTasks,
    getOfflineTaskDetails,
    updateMilestone,
    reviewMilestone,
    updateTaskProgress,
    updateTask,
    reviewTask
};

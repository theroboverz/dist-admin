const db = require("../config/db");
const careerDb = require("../config/careerDb");
const emailService = require("../services/emailService");

// Create a new project
const createProject = async (req, res) => {
    try {
        const { title, description, assigned_to_type, assigned_to_id, priority, deadline } = req.body;
        const assigned_by = req.user.id || req.user.admin_id;

        if (!title || !assigned_to_id) {
            return res.status(400).json({ status: "error", message: "Title and assignee are required" });
        }

        const [projectResult] = await db.execute(
            `INSERT INTO projects (title, description, assigned_by, assigned_to_type, assigned_to_id, priority, deadline, status) 
             VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending')`,
            [title, description || null, assigned_by, assigned_to_type || 'Admin', assigned_to_id, priority || 'Medium', deadline || null]
        );

        const projectId = projectResult.insertId;

        // --- Notification & Email Logic ---
        try {
            let recipientName = '';
            let recipientEmail = '';
            let notificationPayload = {
                senderId: assigned_by,
                senderName: req.user.name || "Super Admin",
                title: "New Project Assigned",
                message: `You have been assigned a new project: ${title}`,
                type: "info"
            };

            if (assigned_to_type === 'Admin') {
                const [admins] = await db.execute("SELECT name, email FROM admins WHERE admin_id = ?", [assigned_to_id]);
                if (admins.length > 0) {
                    recipientName = admins[0].name;
                    recipientEmail = admins[0].email;
                    notificationPayload.adminId = assigned_to_id;
                }
            } else {
                const [interns] = await careerDb.execute("SELECT name, email FROM interns WHERE intern_id = ?", [assigned_to_id]);
                if (interns.length > 0) {
                    recipientName = interns[0].name;
                    recipientEmail = interns[0].email;
                    notificationPayload.internId = assigned_to_id;
                }
            }

            // 1. Dashboard Notification
            if (notificationPayload.adminId || notificationPayload.internId) {
                await db.execute(
                    `INSERT INTO notifications (intern_id, admin_id, sender_id, sender_name, title, message, type) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [notificationPayload.internId || null, notificationPayload.adminId || null, notificationPayload.senderId, notificationPayload.senderName, notificationPayload.title, notificationPayload.message, notificationPayload.type]
                );
            }

            // 2. Email Notification
            if (recipientEmail) {
                await emailService.sendProjectNotification(
                    recipientEmail,
                    recipientName,
                    "New Project Assignment",
                    `You have been assigned a new project: <strong>${title}</strong>. Please check your dashboard for details and deadlines.`,
                    { id: projectId, title, deadline, priority }
                );
            }
        } catch (alertError) {
            console.error("Failed to send project assignment alerts:", alertError);
            // Don't fail the response if alert fails
        }
        // ---------------------------------

        res.status(201).json({ status: "success", message: "Project created successfully", projectId });
    } catch (error) {
        console.error("Error creating project:", error);
        res.status(500).json({ status: "error", message: "Failed to create project" });
    }
};

// Get all projects
const getProjects = async (req, res) => {
    try {
        const userId = req.user.id || req.user.admin_id;
        const role = req.user.role.toLowerCase();
        const isSuperAdmin = role === 'superadmin' || role === 'super admin';

        let query = `
            SELECT p.*, a.name as creator_name,
            CASE 
                WHEN p.assigned_to_type = 'Admin' THEN (SELECT name FROM admins WHERE admin_id = p.assigned_to_id)
                WHEN p.assigned_to_type = 'Individual' THEN (SELECT name FROM interns WHERE intern_id = p.assigned_to_id)
            END as assignee_name
            FROM projects p
            LEFT JOIN admins a ON p.assigned_by = a.admin_id
        `;

        let params = [];
        if (!isSuperAdmin) {
            query += ` WHERE p.assigned_by = ? OR (p.assigned_to_id = ? AND p.assigned_to_type = 'Admin')`;
            params = [userId, userId];
        }

        query += ` ORDER BY p.created_at DESC`;

        const [projects] = await db.execute(query, params);

        res.status(200).json({ status: "success", data: projects });
    } catch (error) {
        console.error("Error fetching projects:", error);
        res.status(500).json({ status: "error", message: "Failed to fetch projects" });
    }
};

// Get project by ID
const getProjectById = async (req, res) => {
    try {
        const { id } = req.params;

        // Project details
        const [projects] = await db.execute(`
             SELECT p.*, a.name as creator_name,
            CASE 
                WHEN p.assigned_to_type = 'Admin' THEN (SELECT name FROM admins WHERE admin_id = p.assigned_to_id)
                WHEN p.assigned_to_type = 'Individual' THEN (SELECT name FROM interns WHERE intern_id = p.assigned_to_id)
            END as assignee_name
            FROM projects p
            LEFT JOIN admins a ON p.assigned_by = a.admin_id
            WHERE p.id = ?
        `, [id]);

        if (projects.length === 0) {
            return res.status(404).json({ status: "error", message: "Project not found" });
        }

        const project = projects[0];

        // Updates
        const [updates] = await db.execute(`SELECT * FROM project_updates WHERE project_id = ? ORDER BY created_at DESC`, [id]);

        // Parse JSON in updates
        const parsedUpdates = updates.map(u => ({
            ...u,
            files: u.files ? JSON.parse(u.files) : [],
            file_names: u.file_names ? JSON.parse(u.file_names) : []
        }));

        res.status(200).json({
            status: "success",
            data: {
                ...project,
                updates: parsedUpdates
            }
        });
    } catch (error) {
        console.error("Error fetching project details:", error);
        res.status(500).json({ status: "error", message: "Failed to fetch project details" });
    }
};

// Add project update (with files)
const addProjectUpdate = async (req, res) => {
    try {
        const { projectId, updateText } = req.body;

        if (!projectId || !updateText) {
            return res.status(400).json({ status: "error", message: "Project ID and update text are required" });
        }

        const files = req.files || [];
        const filePaths = files.map(f => f.path);
        const fileNames = files.map(f => f.originalname);

        await db.execute(
            `INSERT INTO project_updates (project_id, update_text, files, file_names) VALUES (?, ?, ?, ?)`,
            [projectId, updateText, JSON.stringify(filePaths), JSON.stringify(fileNames)]
        );

        // Also update project status if it was Pending
        await db.execute(
            `UPDATE projects SET status = 'In Progress' WHERE id = ? AND status = 'Pending'`,
            [projectId]
        );

        // --- Alert Creator ---
        try {
            const [projects] = await db.execute(
                `SELECT p.title, p.assigned_by, a.name as creator_name, a.email as creator_email 
                 FROM projects p 
                 JOIN admins a ON p.assigned_by = a.admin_id 
                 WHERE p.id = ?`,
                [projectId]
            );

            if (projects.length > 0) {
                const project = projects[0];
                const senderName = req.user.name || "Team Member";

                // Dashboard Notification to Creator
                await db.execute(
                    `INSERT INTO notifications (intern_id, admin_id, sender_id, sender_name, title, message, type) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [null, project.assigned_by, req.user.id || req.user.admin_id, senderName, "New Project Update", `New update posted for project: ${project.title}`, "info"]
                );

                // Email to Creator
                if (project.creator_email) {
                    await emailService.sendProjectNotification(
                        project.creator_email,
                        project.creator_name,
                        "New Progress Update",
                        `<strong>${senderName}</strong> has posted a new update for the project: <strong>${project.title}</strong>.<br><br>Update: ${updateText}`,
                        { id: projectId, title: project.title }
                    );
                }
            }
        } catch (alertError) {
            console.error("Failed to send project update alerts:", alertError);
        }

        res.status(201).json({ status: "success", message: "Update added successfully" });
    } catch (error) {
        console.error("Error adding project update:", error);
        res.status(500).json({ status: "error", message: "Failed to add project update" });
    }
};

// Update overall project status
const updateProjectStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        await db.execute(`UPDATE projects SET status = ? WHERE id = ?`, [status, id]);
        res.status(200).json({ status: "success", message: "Project status updated successfully" });
    } catch (error) {
        console.error("Error updating project status:", error);
        res.status(500).json({ status: "error", message: "Failed to update project status" });
    }
};

// Update project details (title, description, resources, etc.)
const updateProject = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, description, resources, priority, deadline, assigned_to_type, assigned_to_id } = req.body;

        const [result] = await db.execute(
            `UPDATE projects SET 
                title = COALESCE(?, title), 
                description = COALESCE(?, description), 
                resources = COALESCE(?, resources),
                priority = COALESCE(?, priority), 
                deadline = COALESCE(?, deadline),
                assigned_to_type = COALESCE(?, assigned_to_type),
                assigned_to_id = COALESCE(?, assigned_to_id)
             WHERE id = ?`,
            [title, description, resources, priority, deadline, assigned_to_type, assigned_to_id, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ status: "error", message: "Project not found" });
        }

        // --- Alert if Reassigned or Details Changed ---
        try {
            if (assigned_to_id || title) {
                let recipientName = '';
                let recipientEmail = '';
                const targetId = assigned_to_id;
                const targetType = assigned_to_type || 'Admin';

                if (targetType === 'Admin' && targetId) {
                    const [admins] = await db.execute("SELECT name, email FROM admins WHERE admin_id = ?", [targetId]);
                    if (admins.length > 0) {
                        recipientName = admins[0].name;
                        recipientEmail = admins[0].email;
                    }
                } else if (targetId) {
                    const [interns] = await careerDb.execute("SELECT name, email FROM interns WHERE intern_id = ?", [targetId]);
                    if (interns.length > 0) {
                        recipientName = interns[0].name;
                        recipientEmail = interns[0].email;
                    }
                }

                if (recipientEmail) {
                    await emailService.sendProjectNotification(
                        recipientEmail,
                        recipientName,
                        "Project Details Updated",
                        `The project "<strong>${title || 'assigned to you'}</strong>" has been updated. Please check your dashboard for any changes in requirements or deadlines.`,
                        { id, title: title || 'Project' }
                    );
                }
            }
        } catch (alertError) {
            console.error("Failed to send project update alerts:", alertError);
        }

        res.status(200).json({ status: "success", message: "Project updated successfully" });
    } catch (error) {
        console.error("Error updating project:", error);
        res.status(500).json({ status: "error", message: "Failed to update project" });
    }
};

// Edit a project update (log entry)
const updateProjectUpdate = async (req, res) => {
    try {
        const { id } = req.params;
        const { updateText, createdAt } = req.body;

        const files = req.files || [];
        const filePaths = files.map(f => f.path);
        const fileNames = files.map(f => f.originalname);

        let query = `UPDATE project_updates SET update_text = COALESCE(?, update_text)`;
        let params = [updateText];

        if (files.length > 0) {
            query += `, files = ?, file_names = ?`;
            params.push(JSON.stringify(filePaths), JSON.stringify(fileNames));
        }

        if (createdAt) {
            query += `, created_at = ?`;
            params.push(createdAt);
        }

        query += ` WHERE id = ?`;
        params.push(id);

        const [result] = await db.execute(query, params);

        if (result.affectedRows === 0) {
            return res.status(404).json({ status: "error", message: "Update entry not found" });
        }

        // --- Alert Creator for Modification ---
        try {
            const [updateDetails] = await db.execute(
                `SELECT pu.project_id, p.title, p.assigned_by, a.name as creator_name, a.email as creator_email 
                 FROM project_updates pu
                 JOIN projects p ON pu.project_id = p.id
                 JOIN admins a ON p.assigned_by = a.admin_id
                 WHERE pu.id = ?`,
                [id]
            );

            if (updateDetails.length > 0) {
                const project = updateDetails[0];
                const senderName = req.user.name || "Team Member";

                await emailService.sendProjectNotification(
                    project.creator_email,
                    project.creator_name,
                    "Progress Update Modified",
                    `<strong>${senderName}</strong> has modified a previous progress update for the project: <strong>${project.title}</strong>.`,
                    { id: project.project_id, title: project.title }
                );
            }
        } catch (alertError) {
            console.error("Failed to send update modification alerts:", alertError);
        }

        res.status(200).json({ status: "success", message: "Progress update modified" });
    } catch (error) {
        console.error("Error editing project update:", error);
        res.status(500).json({ status: "error", message: "Failed to modify update" });
    }
};

// Delete project completely (Super Admin only)
const deleteProject = async (req, res) => {
    try {
        const { id } = req.params;
        const role = req.user.role.toLowerCase();
        const isSuperAdmin = role === 'superadmin' || role === 'super admin';

        if (!isSuperAdmin) {
            return res.status(403).json({
                status: "error",
                message: "Permission denied. Only Super Admins can delete projects."
            });
        }

        // Deleting project will cascade to updates and milestones if FKs are set correctly,
        // but let's be explicit if not.
        await db.execute(`DELETE FROM project_updates WHERE project_id = ?`, [id]);
        const [result] = await db.execute(`DELETE FROM projects WHERE id = ?`, [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ status: "error", message: "Project not found" });
        }

        res.status(200).json({ status: "success", message: "Project deleted successfully" });
    } catch (error) {
        console.error("Error deleting project:", error);
        res.status(500).json({ status: "error", message: "Failed to delete project" });
    }
};

module.exports = {
    createProject,
    getProjects,
    getProjectById,
    addProjectUpdate,
    updateProjectStatus,
    updateProject,
    updateProjectUpdate,
    deleteProject
};

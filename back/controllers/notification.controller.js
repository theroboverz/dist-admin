const db = require("../config/db");
const emailService = require("../services/emailService");

// Send notification to a single intern
const sendNotification = async (req, res) => {
    try {
        const { internId, adminId, senderId, senderName, title, message, type } = req.body;

        // Validate required fields - either internId or adminId must be present
        if ((!internId && !adminId) || !title || !message) {
            return res.status(400).json({
                status: "error",
                message: "A recipient (internId or adminId), title, and message are required"
            });
        }

        let internEmail = null;
        let internName = null;

        if (internId) {
            // Verify intern exists
            const [intern] = await db.execute(
                "SELECT intern_id, name, email FROM interns WHERE intern_id = ?",
                [internId]
            );

            if (intern.length === 0) {
                return res.status(404).json({
                    status: "error",
                    message: "Intern not found"
                });
            }
            internEmail = intern[0].email;
            internName = intern[0].name;
        }

        // Insert notification
        const [result] = await db.execute(
            `INSERT INTO notifications 
            (intern_id, admin_id, sender_id, sender_name, title, message, type) 
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [internId || null, adminId || null, senderId || null, senderName || "Admin", title, message, type || "info"]
        );

        // Send email alert if intern notification
        if (internId && internEmail) {
            emailService.sendNotificationEmail(internEmail, internName, {
                title,
                message,
                type: type || 'info'
            }).catch(err => console.error("Failed to send notification email:", err));
        }

        res.status(201).json({
            status: "success",
            message: "Notification sent successfully",
            data: {
                notificationId: result.insertId,
                internId,
                title,
                message,
                type: type || "info"
            }
        });

    } catch (error) {
        console.error("Error sending notification:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to send notification",
            error: error.message
        });
    }
};

// Send notification to multiple interns (bulk)
const sendBulkNotification = async (req, res) => {
    try {
        const { internIds, senderId, senderName, title, message, type } = req.body;

        // Validate required fields
        if (!internIds || !Array.isArray(internIds) || internIds.length === 0) {
            return res.status(400).json({
                status: "error",
                message: "internIds array is required and must not be empty"
            });
        }

        if (!title || !message) {
            return res.status(400).json({
                status: "error",
                message: "title and message are required"
            });
        }

        // Fetch intern details for email
        const [interns] = await db.execute(
            `SELECT name, email FROM interns WHERE intern_id IN (${internIds.map(() => '?').join(',')})`,
            internIds
        );

        // Prepare bulk insert
        const values = internIds.map(internId => [
            internId,
            null, // admin_id
            senderId || null,
            senderName || "Admin",
            title,
            message,
            type || "info"
        ]);

        // Insert all notifications
        const placeholders = values.map(() => "(?, ?, ?, ?, ?, ?, ?)").join(", ");
        const flatValues = values.flat();

        const [result] = await db.execute(
            `INSERT INTO notifications 
            (intern_id, admin_id, sender_id, sender_name, title, message, type) 
            VALUES ${placeholders}`,
            flatValues
        );

        // Send emails in background
        interns.forEach(intern => {
            if (intern.email) {
                emailService.sendNotificationEmail(intern.email, intern.name, {
                    title,
                    message,
                    type: type || 'info'
                }).catch(err => console.error(`Failed to send bulk email to ${intern.email}:`, err));
            }
        });

        res.status(201).json({
            status: "success",
            message: `Notification sent to ${internIds.length} interns`,
            data: {
                count: internIds.length,
                firstNotificationId: result.insertId
            }
        });

    } catch (error) {
        console.error("Error sending bulk notifications:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to send bulk notifications",
            error: error.message
        });
    }
};

// Get notifications for an intern
const getInternNotifications = async (req, res) => {
    try {
        const { internId } = req.params;
        const { unreadOnly } = req.query;

        let query = `
            SELECT 
                notification_id,
                intern_id,
                sender_id,
                sender_name,
                title,
                message,
                type,
                is_read,
                created_at
            FROM notifications
            WHERE intern_id = ?
        `;

        const params = [internId];

        if (unreadOnly === 'true') {
            query += " AND is_read = FALSE";
        }

        query += " ORDER BY created_at DESC";

        const [notifications] = await db.execute(query, params);

        res.status(200).json({
            status: "success",
            count: notifications.length,
            data: notifications
        });

    } catch (error) {
        console.error("Error fetching notifications:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to fetch notifications",
            error: error.message
        });
    }
};

// Get unread notification count for an intern
const getUnreadCount = async (req, res) => {
    try {
        const { internId } = req.params;

        const [result] = await db.execute(
            "SELECT COUNT(*) as unreadCount FROM notifications WHERE intern_id = ? AND is_read = FALSE",
            [internId]
        );

        res.status(200).json({
            status: "success",
            data: {
                internId,
                unreadCount: result[0].unreadCount
            }
        });

    } catch (error) {
        console.error("Error fetching unread count:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to fetch unread count",
            error: error.message
        });
    }
};

// Mark notification as read
const markAsRead = async (req, res) => {
    try {
        const { id } = req.params;

        // Check if notification exists
        const [existing] = await db.execute(
            "SELECT notification_id FROM notifications WHERE notification_id = ?",
            [id]
        );

        if (existing.length === 0) {
            return res.status(404).json({
                status: "error",
                message: "Notification not found"
            });
        }

        // Update is_read to true
        await db.execute(
            "UPDATE notifications SET is_read = TRUE WHERE notification_id = ?",
            [id]
        );

        res.status(200).json({
            status: "success",
            message: "Notification marked as read"
        });

    } catch (error) {
        console.error("Error marking notification as read:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to mark notification as read",
            error: error.message
        });
    }
};

// Delete notification
const deleteNotification = async (req, res) => {
    try {
        const { id } = req.params;

        // Check if notification exists
        const [existing] = await db.execute(
            "SELECT notification_id FROM notifications WHERE notification_id = ?",
            [id]
        );

        if (existing.length === 0) {
            return res.status(404).json({
                status: "error",
                message: "Notification not found"
            });
        }

        // Delete notification
        await db.execute(
            "DELETE FROM notifications WHERE notification_id = ?",
            [id]
        );

        res.status(200).json({
            status: "success",
            message: "Notification deleted successfully"
        });

    } catch (error) {
        console.error("Error deleting notification:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to delete notification",
            error: error.message
        });
    }
};

// Get unread notification count for an admin
const getAdminUnreadCount = async (req, res) => {
    try {
        const { adminId } = req.params;

        const [result] = await db.execute(
            "SELECT COUNT(*) as count FROM notifications WHERE admin_id = ? AND is_read = FALSE",
            [adminId]
        );

        res.status(200).json({
            status: "success",
            count: result[0].count
        });

    } catch (error) {
        console.error("Error fetching admin unread count:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to fetch admin unread count",
            error: error.message
        });
    }
};

// Get notifications sent by an admin
const getAdminNotifications = async (req, res) => {
    try {
        const { adminId } = req.params;

        const [notifications] = await db.execute(
            `SELECT
                notification_id,
                intern_id,
                admin_id,
                sender_id,
                sender_name,
                title,
                message,
                type,
                is_read,
                created_at
            FROM notifications
            WHERE admin_id = ?
            ORDER BY created_at DESC`,
            [adminId]
        );

        res.status(200).json({
            status: "success",
            count: notifications.length,
            data: notifications
        });

    } catch (error) {
        console.error("Error fetching admin notifications:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to fetch admin notifications",
            error: error.message
        });
    }
};

module.exports = {
    sendNotification,
    sendBulkNotification,
    getInternNotifications,
    getUnreadCount,
    getAdminUnreadCount,
    getAdminNotifications,
    markAsRead,
    deleteNotification
};

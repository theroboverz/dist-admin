const express = require("express");
const router = express.Router();
const notificationController = require("../controllers/notification.controller");
const { auth } = require("../middleware/auth");

// Protect all notification routes
router.use(auth);

// Send notification to a single intern
router.post("/send", notificationController.sendNotification);

// Send notification to multiple interns (bulk)
router.post("/send-bulk", notificationController.sendBulkNotification);

// Get notifications for an intern
router.get("/intern/:internId", notificationController.getInternNotifications);

// Get unread notification count for an intern
router.get("/intern/:internId/unread-count", notificationController.getUnreadCount);

// Get notifications for an admin
router.get("/admin/:adminId", notificationController.getAdminNotifications);

// Get unread notification count for an admin
router.get("/admin/:adminId/unread/count", notificationController.getAdminUnreadCount);

// Mark notification as read
router.patch("/:id/read", notificationController.markAsRead);

// Delete notification
router.delete("/:id", notificationController.deleteNotification);

module.exports = router;

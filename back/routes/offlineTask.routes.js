const express = require("express");
const router = express.Router();
const offlineTaskController = require("../controllers/offlineTask.controller");
const offlineUpload = require("../middleware/offlineUpload");
const { auth, requireAdmin } = require("../middleware/auth");

// Protect all routes
router.use(auth);

// Admin: Create Offline Task
router.post("/create", requireAdmin, offlineTaskController.createOfflineTask);

// Shared: Get Task Details (intern can only view own)
router.get("/details/:taskId", offlineTaskController.getOfflineTaskDetails);

// Student or Admin: Get tasks by student (intern only own studentId)
router.get("/student/:studentId", offlineTaskController.getStudentOfflineTasks);

// Student: Update task progress (controller enforces own task)
router.patch("/task/:taskId/progress", offlineTaskController.updateTaskProgress);

// Admin: Edit assigned task
router.put("/task/:taskId", requireAdmin, offlineTaskController.updateTask);

// Admin: Review task (Reviewed + mentor_feedback)
router.post("/task/:taskId/review", requireAdmin, offlineTaskController.reviewTask);

// Student: Update Milestone (with file uploads)
router.post("/milestone/:milestoneId/update", offlineUpload.array('files', 5), offlineTaskController.updateMilestone);

// Admin: Review Milestone
router.post("/milestone/:milestoneId/review", requireAdmin, offlineTaskController.reviewMilestone);

module.exports = router;

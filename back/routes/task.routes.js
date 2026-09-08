const express = require("express");
const router = express.Router();
const taskController = require("../controllers/task.controller");
const upload = require("../middleware/upload");
const { auth } = require("../middleware/auth");

// Protect all task routes
router.use(auth);

// Get all tasks
router.get("/", taskController.getAllTasks);

// Get task statistics
router.get("/stats", taskController.getTaskStats);

// Get task insights (for TaskInsights component)
router.get("/insights", taskController.getTaskInsights);

// Get task completion statistics (for Task Wise View)
router.get("/completion-stats", taskController.getTaskCompletionStats);

// Get tasks by domain
router.get("/domain/:domainId", taskController.getTasksByDomain);

// Get interns for a specific task (MUST be before /:id route)
router.get("/:id/interns", taskController.getTaskInterns);

// Get single task by ID (MUST be after /:id/interns route)
router.get("/:id", taskController.getTaskById);

// Create new task
router.post("/", upload.single('file'), taskController.createTask);

// Update task
router.put("/:id", taskController.updateTask);

// Delete task
router.delete("/:id", taskController.deleteTask);

// Submit task
router.post("/:taskId/submit", upload.single('file'), taskController.submitTask);

// Review milestone
router.post("/milestones/:id/review", taskController.reviewMilestone);

// Update progress on milestone (Student)
router.post("/milestones/:id/progress", upload.array('files'), taskController.updateMilestoneProgress);

module.exports = router;
const express = require("express");
const router = express.Router();
const projectController = require("../controllers/project.controller");
const upload = require("../middleware/upload");
const { auth, requireAdmin, requireSuperAdmin } = require("../middleware/auth");

// All project routes require authentication and admin privileges
router.use(auth);
router.use(requireAdmin);

// Get all projects
router.get("/", projectController.getProjects);

// Get project by ID
router.get("/:id", projectController.getProjectById);

// Create project (Super Admin only)
router.post("/", requireSuperAdmin, projectController.createProject);

// Add project update (with file support)
router.post("/update", upload.array('files'), projectController.addProjectUpdate);

// Update project status
router.patch("/:id/status", projectController.updateProjectStatus);

// Update project details (title, description, resources, etc.)
router.patch("/:id", requireSuperAdmin, projectController.updateProject);

// Edit project update (log entry)
router.patch("/update/:id", upload.array('files'), projectController.updateProjectUpdate);

// Delete project (Super Admin only)
router.delete("/:id", requireSuperAdmin, projectController.deleteProject);

module.exports = router;

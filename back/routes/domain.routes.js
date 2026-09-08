const express = require("express");
const router = express.Router();
const domain = require("../controllers/domain.controller");
const { auth } = require("../middleware/auth");

// Protect all domain routes
router.use(auth);

// Get all domains (for sidebar dropdown)
router.get("/", domain.getAllDomains);

// Get interns for specific domain
router.get("/:domain/interns", domain.getDomainInterns);

// Get stats for specific domain
router.get("/:domain/stats", domain.getDomainStats);

// Get pending reviews count for specific domain
router.get("/:domain/pending-reviews", domain.getDomainPendingReviews);

// Get tasks for specific domain
router.get("/:domain/tasks", domain.getDomainTasks);

module.exports = router;
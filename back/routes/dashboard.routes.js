const express = require("express");
const router = express.Router();
const dashboardController = require("../controllers/dashboard.controller");
const { auth } = require("../middleware/auth");

// Protect dashboard routes with authentication
router.use(auth);

router.get("/stats", dashboardController.getDashboardStats);
router.get("/analytics", dashboardController.getAnalyticsData);

module.exports = router;

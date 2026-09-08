const express = require("express");
const router = express.Router();
const { auth, requireAdmin } = require("../middleware/auth");
const points = require("../controllers/points.controller");

router.use(auth, requireAdmin);

// ---------------------------
// GET ROUTES
// ---------------------------

// Get all points records
router.get("/", points.getAllPoints);

// Get points statistics
router.get("/stats", points.getPointsStats);

// Get overall leaderboard
router.get("/leaderboard", points.getLeaderboard);

// Get leaderboard by domain
// Example: /api/points/leaderboard/domain/ROS
router.get("/leaderboard/domain/:domain", points.getLeaderboardByDomain);

// Get points by specific intern
// Example: /api/points/intern/5
router.get("/intern/:internId", points.getPointsByIntern);

// Get points by domain
// Example: /api/points/domain/ROS
router.get("/domain/:domain", points.getPointsByDomain);

// ---------------------------
// POST ROUTES
// ---------------------------

// Award points to an intern
router.post("/award", points.awardPoints);

// Deduct points from an intern
router.post("/deduct", points.deductPoints);

// Bulk award points to multiple interns
router.post("/bulk-award", points.bulkAwardPoints);

// ---------------------------
// PUT ROUTES
// ---------------------------

// Update a points record
router.put("/:id", points.updatePointsRecord);

// ---------------------------
// DELETE ROUTES
// ---------------------------

// Delete a points record
router.delete("/:id", points.deletePointsRecord);

module.exports = router;
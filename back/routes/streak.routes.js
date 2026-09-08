const express = require("express");
const router = express.Router();
const streak = require("../controllers/streak.controller");

// Mark attendance
router.post("/mark", streak.markAttendance);

// Get current streak for an intern
router.get("/:intern_id", streak.getCurrentStreak);

// Get streak history for an intern
router.get("/:intern_id/history", streak.getStreakHistory);

// NEW: Recalculate and update all streaks
router.post("/update-all", streak.updateAllStreaks);

// NEW: Recalculate streak for specific intern
router.post("/recalculate/:intern_id", streak.recalculateStreak);

// Get attendance summary for an intern
router.get("/summary/:intern_id", streak.getAttendanceSummary);

module.exports = router;
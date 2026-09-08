const express = require("express");
const router = express.Router();
const meeting = require("../controllers/meeting.controller");
const { auth, requireAdmin } = require("../middleware/auth");

// All meeting routes require auth
router.use(auth);

// Get all meetings
router.get("/", meeting.getAllMeetings);

// Get meeting statistics
router.get("/stats", meeting.getMeetingStats);

// Get upcoming meetings (next meetings)
router.get("/upcoming", meeting.getUpcomingMeetings);

// Get meetings by date range
// Example: /api/meeting/range?startDate=2025-01-01&endDate=2025-01-31
router.get("/range", meeting.getMeetingsByDateRange);

// Get meetings by domain
// Example: /api/meeting/domain/ROS
router.get("/domain/:domain", meeting.getMeetingsByDomain);

// Create a new meeting
router.post("/", requireAdmin, meeting.createMeeting);

// Update a meeting
router.put("/:id", requireAdmin, meeting.updateMeeting);

// Delete a meeting
router.delete("/:id", requireAdmin, meeting.deleteMeeting);

module.exports = router;
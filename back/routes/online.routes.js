const express = require("express");
const router = express.Router();
const onlineController = require("../controllers/online.controller");

// POST /api/online/heartbeat - Send heartbeat to update last_active
router.post("/heartbeat", onlineController.sendHeartbeat);

// GET /api/online/admins - Get all online admins
router.get("/admins", onlineController.getOnlineAdmins);

// GET /api/online/interns - Get all online interns
router.get("/interns", onlineController.getOnlineInterns);

// GET /api/online/all - Get all online users (admins + interns)
router.get("/all", onlineController.getOnlineUsers);

// GET /api/online/profile/:userType/:id - Get full profile of a specific user
router.get("/profile/:userType/:id", onlineController.getOnlineUserProfile);

module.exports = router;

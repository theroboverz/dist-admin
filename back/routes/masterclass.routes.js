const express = require("express");
const router = express.Router();
const masterclassController = require("../controllers/masterclass.controller");
const upload = require("../middleware/upload"); // Assuming standard upload middleware exists

// --- Masterclass Routes ---

// Create Masterclass
router.post("/masterclass", upload.single("thumbnail"), masterclassController.createMasterclass);

// Get All Masterclasses
router.get("/masterclass", masterclassController.getAllMasterclasses);

// Get Single Masterclass
router.get("/masterclass/:id", masterclassController.getMasterclassById);

// Update Masterclass
router.put("/masterclass/:id", upload.single("thumbnail"), masterclassController.updateMasterclass);

// Publish/Unpublish Masterclass
router.patch("/masterclass/:id/publish", masterclassController.publishMasterclass);

// Delete Masterclass
router.delete("/masterclass/:id", masterclassController.deleteMasterclass);

// --- Session Routes ---

// Add Session
router.post("/masterclass-sessions", masterclassController.addSession);

// Update Session
router.put("/masterclass-sessions/:id", masterclassController.updateSession);

// Delete Session
router.delete("/masterclass-sessions/:id", masterclassController.deleteSession);

module.exports = router;

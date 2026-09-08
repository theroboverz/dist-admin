const express = require("express");
const router = express.Router();
const batchController = require("../controllers/batch.controller");
const { auth } = require("../middleware/auth");

// Protect all batch routes
router.use(auth);

// Get all batches
router.get("/", batchController.getAllBatches);

// Get active batch
router.get("/active", batchController.getActiveBatch);

// Get intern's batch end date
router.get("/intern-end-date", batchController.getInternBatchEndDate);

// Create a new batch
router.post("/", batchController.createBatch);

// Update a batch
router.put("/:id", batchController.updateBatch);

// Delete a batch
router.delete("/:id", batchController.deleteBatch);

// Set a batch as active
router.put("/:id/activate", batchController.setActiveBatch);

module.exports = router;

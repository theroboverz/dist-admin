
const express = require('express');
const router = express.Router();
const workUpdateController = require('../controllers/workUpdate.controller');
const { auth } = require('../middleware/auth');
const upload = require('../middleware/upload');

// Image upload
router.post('/upload', auth, upload.single('image'), workUpdateController.uploadImage);

// Create update
router.post('/', auth, workUpdateController.createWorkUpdates);

// Get updates
router.get('/', auth, workUpdateController.getWorkUpdates);

// Update a work item
router.put('/:id', auth, workUpdateController.updateWorkItem);

module.exports = router;

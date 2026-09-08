const express = require('express');
const router = express.Router();
const announcementController = require('../controllers/announcement.controller');
const upload = require('../middleware/upload');
const { auth } = require('../middleware/auth');

// Admin routes (protected)
router.get('/', auth, announcementController.getAllAnnouncements);
router.post('/', auth, announcementController.createAnnouncement);
router.put('/:id', auth, announcementController.updateAnnouncement);
router.delete('/:id', auth, announcementController.deleteAnnouncement);
router.patch('/:id/toggle', auth, announcementController.toggleAnnouncement);

// Image upload route (protected)
router.post('/upload-image', auth, upload.single('image'), announcementController.uploadImage);

// Public route for interns
router.get('/active', announcementController.getActiveAnnouncements);

module.exports = router;


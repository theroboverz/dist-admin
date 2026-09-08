const express = require('express');
const router = express.Router();
const publicProfileController = require('../controllers/publicProfile.controller');
const { auth } = require('../middleware/auth');

// Public routes (No auth required)
router.get('/profile/:slug', publicProfileController.getPublicProfile);

// Protected routes (Auth required)
router.post('/generate-share-link', auth, publicProfileController.generateShareLink);
router.post('/log-share', auth, publicProfileController.logShare);
router.get('/skills/:id?', auth, publicProfileController.getSkills);
router.get('/performance-metrics', auth, publicProfileController.getPerformanceMetrics);

module.exports = router;

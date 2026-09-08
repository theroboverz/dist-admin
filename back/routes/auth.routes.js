const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');

// Google OAuth login for admins
router.post('/google', authController.googleLogin);

// Google OAuth login for interns
router.post('/google/intern', authController.googleLoginIntern);

// Verify JWT token
router.post('/verify', authController.verifyToken);

// Logout
router.post('/logout', authController.logout);

module.exports = router;

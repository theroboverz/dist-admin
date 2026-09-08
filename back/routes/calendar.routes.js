const express = require('express');
const router  = express.Router();
const { auth, requireAdmin } = require('../middleware/auth');
const { getCalendar, setOverride, removeOverride, listOverrides } = require('../controllers/calendar.controller');

// Public read — any authenticated user (intern OR admin)
router.get('/', auth, getCalendar);

// Admin write
router.get('/overrides', auth, requireAdmin, listOverrides);
router.post('/override',  auth, requireAdmin, setOverride);
router.delete('/override/:date', auth, requireAdmin, removeOverride);

module.exports = router;

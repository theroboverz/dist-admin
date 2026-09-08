const express = require('express');
const router = express.Router();
const { auth, requireAdmin } = require('../middleware/auth');
const upload = require('../middleware/upload');
const ctrl = require('../controllers/ganttController');

router.use(auth);

// Overview (grouped Gantt data)
router.get('/admin/overview', requireAdmin, ctrl.getAdminOverview);
router.get('/employee/mine', (req, res, next) => {
    if (req.user.role !== 'employee') {
        return res.status(403).json({ status: 'error', message: 'Access denied. Employee role required.' });
    }
    next();
}, ctrl.getEmployeeMine);
router.get('/intern/mine', ctrl.getInternMine);

// Task detail + progress history
router.get('/task/:sourceType/:sourceId', ctrl.getTaskDetail);
router.get('/progress/:sourceType/:sourceId', ctrl.getProgressHistory);
router.post('/progress', upload.single('attachment'), ctrl.submitProgress);

// EOD deadline config + computed status
router.get('/eod-config', ctrl.getEodConfig);
router.put('/eod-config', requireAdmin, ctrl.setEodConfig);
router.get('/eod-status', ctrl.getEodStatus);

// Daily roster view
router.get('/roster', ctrl.getRoster);

module.exports = router;

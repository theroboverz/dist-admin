const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const upload = require('../middleware/upload');
const employeeCtrl = require('../controllers/employee.controller');

// All routes require a valid intern JWT
router.use(auth);

// Guard: only employees (role = 'employee') can call these endpoints
router.use((req, res, next) => {
    if (req.user.role !== 'employee') {
        return res.status(403).json({
            status: 'error',
            message: 'Access denied. Employee role required.'
        });
    }
    next();
});

router.get('/profile', employeeCtrl.getProfile);

router.post('/attendance/checkin', employeeCtrl.checkIn);
router.post('/attendance/checkout', employeeCtrl.checkOut);
router.get('/attendance/today', employeeCtrl.getTodayAttendance);
router.get('/attendance', employeeCtrl.getAttendanceHistory);
router.post('/attendance/correction', employeeCtrl.submitCorrectionRequest);

router.post('/eod', upload.single('resourceFile'), employeeCtrl.submitEOD);
router.get('/eod/mine', employeeCtrl.getMyEOD);
router.get('/eod', employeeCtrl.getTeamEOD);
router.post('/eod/:id/comment', employeeCtrl.addEODComment);

router.get('/projects', employeeCtrl.getMyProjects);
router.post('/projects/:id/update', upload.array('files'), employeeCtrl.addProjectUpdate);

// Employee Tasks (assigned by admin)
router.get('/tasks', employeeCtrl.getMyTasks);
router.put('/tasks/:id/status', upload.single('proofFile'), employeeCtrl.updateMyTaskStatus);
router.get('/tasks/:id/comments', employeeCtrl.getMyTaskComments);
router.post('/tasks/:id/comments', employeeCtrl.addMyTaskComment);

module.exports = router;

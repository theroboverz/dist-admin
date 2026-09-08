const express = require('express');
const router = express.Router();
const { auth, requireAdmin, requireSuperAdmin } = require('../middleware/auth');
const ctrl = require('../controllers/employee.admin.controller');

router.use(auth);
router.use(requireAdmin);

// Promote intern to employee (superadmin only)
router.post('/employees/promote', requireSuperAdmin, ctrl.promoteIntern);

// List all employees with today's attendance status
router.get('/employees', ctrl.listEmployeesWithAttendance);

// Get single employee
router.get('/employees/:id', ctrl.getEmployee);

// Update employee (superadmin only for sensitive fields)
router.put('/employees/:id', ctrl.updateEmployee);

// Override attendance
router.put('/attendance/override', ctrl.overrideAttendance);

// Get employee attendance history (admin)
router.get('/employees/:id/attendance', ctrl.getEmployeeAttendance);

// Employee profile overview, activity log, and report download
router.get('/employees/:id/overview', ctrl.getEmployeeOverview);
router.get('/employees/:id/activity', ctrl.getEmployeeActivity);
router.get('/employees/:id/report', ctrl.downloadEmployeeReport);

// EOD updates (admin view + comment)
router.get('/employee-eod', ctrl.getTeamEOD);
router.post('/employee-eod/:id/comment', ctrl.addEODComment);

// Attendance correction requests
router.get('/attendance/corrections', ctrl.listCorrectionRequests);
router.put('/attendance/corrections/:id', ctrl.handleCorrectionRequest);

module.exports = router;

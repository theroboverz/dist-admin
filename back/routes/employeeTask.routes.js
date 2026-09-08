const express = require('express');
const router = express.Router();
const { auth, requireAdmin } = require('../middleware/auth');
const upload = require('../middleware/upload');
const ctrl = require('../controllers/employeeTask.controller');

router.use(auth, requireAdmin);

router.get('/employees', ctrl.getEmployeesWithStats);
router.get('/:employeeId/tasks', ctrl.getTasksByEmployee);
router.post('/', upload.single('resourceFile'), ctrl.createTask);
router.put('/:taskId', upload.single('resourceFile'), ctrl.updateTask);
router.delete('/comments/:commentId', ctrl.deleteComment);
router.delete('/:taskId', ctrl.deleteTask);
router.get('/:taskId/comments', ctrl.getComments);
router.post('/:taskId/comments', ctrl.addComment);

module.exports = router;

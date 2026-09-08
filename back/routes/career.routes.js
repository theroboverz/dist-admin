const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const careerController = require('../controllers/career.controller');
const duplicateController = require('../controllers/duplicate.controller');
const { auth, requireAdmin } = require('../middleware/auth');

// Configure multer for resume upload
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '..', 'uploads', 'resumes');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'resume-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const fileFilter = (req, file, cb) => {
    if (file.fieldname === 'resume') {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Resume must be a PDF file'), false);
        }
    } else if (file.fieldname === 'formalPhoto') {
        const validImageTypes = ['image/jpeg', 'image/jpg', 'image/png'];
        if (validImageTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Formal photo must be a JPG or PNG image'), false);
        }
    } else {
        cb(new Error('Invalid file field'), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// ─── Public routes (no auth) ──────────────────────────────────────────────────

// Check for duplicate email/phone
router.get('/check-duplicate', duplicateController.checkDuplicate);

// Get admin settings (public — website reads this)
router.get('/settings', careerController.getAdminSettings);

// Get active roles (public — website reads this)
router.get('/roles', careerController.getRoles);

// Career application submission (public — applicants submit here)
router.post('/submit', upload.fields([
    { name: 'resume', maxCount: 1 },
    { name: 'formalPhoto', maxCount: 1 }
]), careerController.submitCareerApplication);

// ─── Admin-only routes (require JWT auth) ─────────────────────────────────────

// Update admin settings (PROTECTED — was missing auth before)
router.put('/settings', auth, requireAdmin, careerController.updateAdminSettings);

// Get all applicants with optional status/batch filter
router.get('/applicants', auth, requireAdmin, careerController.getApplicants);

// Get applicant statistics
router.get('/applicants/stats', auth, requireAdmin, careerController.getApplicantStats);

// Get distinct batch names from applicants
router.get('/applicants/batches', auth, requireAdmin, careerController.getApplicantBatches);

// Update applicant status
router.patch('/applicants/:id/status', auth, requireAdmin, careerController.updateApplicantStatus);

// Send status email notification
router.post('/applicants/:id/send-email', auth, requireAdmin, careerController.sendStatusEmail);

// Schedule interview
router.patch('/applicants/:id/schedule', auth, requireAdmin, careerController.scheduleInterview);

// Delete applicant permanently
router.delete('/applicants/:id', auth, requireAdmin, careerController.deleteApplicant);

// ─── Role management (admin-only) ─────────────────────────────────────────────

// Create a new role
router.post('/roles', auth, requireAdmin, careerController.createRole);

// Update a role (name, icon, is_active)
router.put('/roles/reorder', auth, requireAdmin, careerController.reorderRoles);

// Update a specific role
router.put('/roles/:id', auth, requireAdmin, careerController.updateRole);

// Delete a role
router.delete('/roles/:id', auth, requireAdmin, careerController.deleteRole);

module.exports = router;

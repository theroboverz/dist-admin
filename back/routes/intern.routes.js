const express = require("express");
const router = express.Router();
const { auth, requireAdmin } = require("../middleware/auth");

// Controllers
const intern = require("../controllers/intern.controller");

// Apply auth + requireAdmin to ALL intern management routes
router.use(auth, requireAdmin);

// Test route (keep)
router.get("/test", (req, res) => {
    res.json({ message: "Intern routes working!" });
});

// ========================================
// EXISTING ROUTES (UNCHANGED)
// ========================================

// Overview stats route (for dashboard cards)
router.get("/overview-stats", intern.getOverviewStats);

// Total interns count
router.get("/total", intern.getTotalInterns);

// Top performing interns
router.get("/top", intern.getTopPerformingInterns);

// ========================================
// NEW ROUTE - For InternAnalytics Component
// ========================================

// Get ALL interns with full details (streaks, points, domain)
// Used by: InternAnalytics.jsx component
router.get("/overview", intern.getAllInternsOverview);
router.get("/all", intern.getAllInternsOverview); // Alias for compatibility
router.get("/all-interns", intern.getAllInternsForAdmin); // All interns, all batches, flat array
router.get("/applicants", intern.getApplicants); // Career applications

// ========================================
// NEW ROUTES - Add Interns
// ========================================

// Add a single intern
router.post("/add", intern.addSingleIntern);

// Bulk upload interns from Excel (expects JSON array)
router.post("/bulk-upload", intern.addBulkInterns);

// ========================================
// INTERN MANAGEMENT ROUTES - Super Admin Only
// ========================================

// Update intern details
router.put("/:id", intern.updateIntern);

// Delete intern (soft delete - sets is_active = 0)
router.delete("/:id", intern.deleteIntern);

// Toggle intern active status
router.patch("/:id/status", intern.toggleInternStatus);

// Get single intern details
router.get("/:id", intern.getInternDetails);

const path = require("path");
const fs = require("fs");
const multer = require("multer");

// Configure multer for profile picture upload
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '..', 'uploads', 'profiles');
        // Create directory if it doesn't exist
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'profile-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB limit for profile pics
    fileFilter: (req, file, cb) => {
        const validImageTypes = ['image/jpeg', 'image/jpg', 'image/png'];
        if (validImageTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only JPG and PNG images are allowed'), false);
        }
    }
});

// ========================================
// INTERN PROFILE PHOTO
// ========================================

// Update intern profile picture
router.patch("/profile-pic", upload.single('profilePic'), intern.updateProfilePic);

// ========================================
// INTERN TIMELINE - Task Journey
// ========================================

// Get intern's task timeline history
router.get("/:internId/timeline", intern.getInternTimeline);

// Get all tasks journey for intern (per-task timelines)
router.get("/:internId/tasks-journey", intern.getInternTasksJourney);

module.exports = router;


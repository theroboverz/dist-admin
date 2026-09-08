const express = require("express");
const router = express.Router();
const admin = require("../controllers/admin.controller");
const { auth, requireAdmin, requireSuperAdmin } = require("../middleware/auth");

// All admin routes require authentication and admin privileges
router.use(auth);
router.use(requireAdmin);

// Get all admins (any admin can view the list)
router.get("/", admin.getAllAdmins);

// Create new admin (SuperAdmin only)
router.post("/", requireSuperAdmin, admin.createAdmin);

// Update admin (SuperAdmin only)
router.put("/:id", requireSuperAdmin, admin.updateAdmin);

// Delete admin (SuperAdmin only)
router.delete("/:id", requireSuperAdmin, admin.deleteAdmin);

// Toggle admin status (SuperAdmin only)
router.patch("/:id/status", requireSuperAdmin, admin.toggleAdminStatus);

module.exports = router;

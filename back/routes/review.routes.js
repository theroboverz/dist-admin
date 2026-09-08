const express = require("express");
const router = express.Router();
const reviewController = require("../controllers/review.controller");
const { auth } = require("../middleware/auth");

// Protect all review routes
router.use(auth);

// Get all pending reviews
router.get("/pending", reviewController.getPendingReviews);

// Get pending reviews count by domain
router.get("/domain/:domainName/pending", reviewController.getPendingReviewsByDomain);

// Get detailed pending reviews list by domain
router.get("/domain/:domainName/pending/list", reviewController.getPendingReviewsListByDomain);

// Get all reviews (with optional status filter via query params)
router.get("/", reviewController.getAllReviews);

// Get single submission by ID
router.get("/:id", reviewController.getSubmissionById);

// Update review status
router.put("/:id/status", reviewController.updateReviewStatus);

// Add admin feedback
router.post("/:id/feedback", reviewController.addAdminFeedback);

// Get submission history/iterations
router.get("/:id/history", reviewController.getSubmissionHistory);

module.exports = router;

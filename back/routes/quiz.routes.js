const express = require("express");
const router = express.Router();
const quizController = require("../controllers/quiz.controller");
const { auth } = require("../middleware/auth");

// Get all quizzes (active batch only)
router.get("/", quizController.getAllQuizzes);

// Get quizzes by domain
router.get("/domain/:domainId", quizController.getQuizzesByDomain);

// Get completion counts for all quizzes
router.get("/completion-counts", quizController.getQuizCompletionCounts);

// Get stats for a specific quiz
router.get("/:id/stats", quizController.getQuizStats);

// Get single quiz by ID
router.get("/:id", quizController.getQuizById);

// Create new quiz
router.post("/", quizController.createQuiz);

// Bulk create quizzes
router.post("/bulk", quizController.bulkCreateQuizzes);

// Update quiz
router.put("/:id", quizController.updateQuiz);

// Delete quiz
// Submit quiz (intern action)
router.post("/submit", auth, quizController.submitQuiz);

module.exports = router;

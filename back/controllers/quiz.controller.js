const db = require("../config/db");

// Get all quizzes with domain information - Active batch only
const getAllQuizzes = async (req, res) => {
    try {
        // Get active batch ID
        const [activeBatch] = await db.execute(
            "SELECT id FROM batch WHERE is_active = 1 LIMIT 1"
        );

        // If no active batch, return empty array
        if (activeBatch.length === 0) {
            return res.status(200).json([]);
        }

        const activeBatchId = activeBatch[0].id;

        const query = `
            SELECT 
                q.quiz_id as id,
                q.question_text as title,
                q.quiz_date,
                q.option_a,
                q.option_b,
                q.option_c,
                q.option_d,
                q.correct_answer as correctAnswer,
                q.created_at as createdAt,
                d.name as category,
                d.domain_id as domainId,
                a.name as createdBy
            FROM daily_quiz_questions q
            LEFT JOIN domains d ON q.domain_id = d.domain_id
            LEFT JOIN admins a ON q.created_by = a.admin_id
            WHERE q.batch = ?
            ORDER BY q.created_at DESC
        `;

        const [quizzes] = await db.query(query, [activeBatchId]);

        // Transform to match frontend format
        const formattedQuizzes = quizzes.map(quiz => ({
            id: quiz.id,
            title: quiz.title,
            quizDate: quiz.quiz_date,
            optionA: quiz.option_a,
            optionB: quiz.option_b,
            optionC: quiz.option_c,
            optionD: quiz.option_d,
            correctAnswer: quiz.correctAnswer,
            category: quiz.category,
            domainId: quiz.domainId,
            createdBy: quiz.createdBy,
            createdAt: quiz.createdAt
        }));

        res.status(200).json(formattedQuizzes);
    } catch (error) {
        console.error("Error fetching quizzes:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to fetch quizzes",
            error: error.message
        });
    }
};

// Get completion stats for a specific quiz
const getQuizStats = async (req, res) => {
    try {
        const { id } = req.params;

        const [stats] = await db.query(`
            SELECT 
                COUNT(*) as totalAttempts,
                SUM(is_correct = 1) as correctAttempts,
                SUM(is_correct = 0) as wrongAttempts
            FROM intern_quiz_attempts 
            WHERE quiz_id = ?
        `, [id]);

        // Get list of interns who attempted
        const [attempts] = await db.query(`
            SELECT 
                iqa.intern_id,
                i.name as intern_name,
                iqa.selected_answer,
                iqa.is_correct,
                iqa.attempted_at
            FROM intern_quiz_attempts iqa
            JOIN interns i ON iqa.intern_id = i.intern_id
            WHERE iqa.quiz_id = ?
            ORDER BY iqa.attempted_at DESC
        `, [id]);

        res.status(200).json({
            status: "success",
            data: {
                totalAttempts: stats[0].totalAttempts || 0,
                correctAttempts: stats[0].correctAttempts || 0,
                wrongAttempts: stats[0].wrongAttempts || 0,
                attempts: attempts
            }
        });
    } catch (error) {
        console.error("Error fetching quiz stats:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to fetch quiz stats",
            error: error.message
        });
    }
};

// Get completion counts for all quizzes
const getQuizCompletionCounts = async (req, res) => {
    try {
        const [counts] = await db.query(`
            SELECT 
                quiz_id,
                COUNT(*) as attempt_count,
                SUM(is_correct = 1) as correct_count
            FROM intern_quiz_attempts 
            GROUP BY quiz_id
        `);

        // Convert to object for easy lookup
        const countsMap = {};
        counts.forEach(row => {
            countsMap[row.quiz_id] = {
                attempts: row.attempt_count,
                correct: row.correct_count || 0
            };
        });

        res.status(200).json({
            status: "success",
            data: countsMap
        });
    } catch (error) {
        console.error("Error fetching quiz completion counts:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to fetch completion counts",
            error: error.message
        });
    }
};

// Get quizzes by domain - Active batch only
const getQuizzesByDomain = async (req, res) => {
    try {
        let { domainId } = req.params;

        // Get active batch ID
        const [activeBatch] = await db.execute(
            "SELECT id FROM batch WHERE is_active = 1 LIMIT 1"
        );

        // If no active batch, return empty array
        if (activeBatch.length === 0) {
            return res.status(200).json([]);
        }

        const activeBatchId = activeBatch[0].id;

        // If domainId is not a number, try to find the domain ID by name
        if (isNaN(domainId)) {
            const [domains] = await db.query("SELECT domain_id FROM domains WHERE name = ?", [domainId]);
            if (domains.length > 0) {
                domainId = domains[0].domain_id;
            } else {
                return res.status(200).json([]);
            }
        }

        const query = `
            SELECT 
                q.quiz_id as id,
                q.question_text as title,
                q.quiz_date,
                q.option_a,
                q.option_b,
                q.option_c,
                q.option_d,
                q.correct_answer as correctAnswer,
                q.created_at as createdAt,
                d.name as category,
                d.domain_id as domainId,
                a.name as createdBy
            FROM daily_quiz_questions q
            LEFT JOIN domains d ON q.domain_id = d.domain_id
            LEFT JOIN admins a ON q.created_by = a.admin_id
            WHERE q.domain_id = ? AND q.batch = ?
            ORDER BY q.created_at DESC
        `;

        const [quizzes] = await db.query(query, [domainId, activeBatchId]);

        const formattedQuizzes = quizzes.map(quiz => ({
            id: quiz.id,
            title: quiz.title,
            quizDate: quiz.quiz_date,
            optionA: quiz.option_a,
            optionB: quiz.option_b,
            optionC: quiz.option_c,
            optionD: quiz.option_d,
            correctAnswer: quiz.correctAnswer,
            category: quiz.category,
            domainId: quiz.domainId,
            createdBy: quiz.createdBy,
            createdAt: quiz.createdAt
        }));

        res.status(200).json(formattedQuizzes);
    } catch (error) {
        console.error("Error fetching quizzes by domain:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to fetch quizzes",
            error: error.message
        });
    }
};

// Get single quiz by ID
const getQuizById = async (req, res) => {
    try {
        const { id } = req.params;

        const query = `
            SELECT 
                q.quiz_id as id,
                q.question_text as title,
                q.quiz_date,
                q.option_a,
                q.option_b,
                q.option_c,
                q.option_d,
                q.correct_answer as correctAnswer,
                q.created_at as createdAt,
                d.name as category,
                d.domain_id as domainId,
                a.name as createdBy
            FROM daily_quiz_questions q
            LEFT JOIN domains d ON q.domain_id = d.domain_id
            LEFT JOIN admins a ON q.created_by = a.admin_id
            WHERE q.quiz_id = ?
        `;

        const [quizzes] = await db.query(query, [id]);

        if (quizzes.length === 0) {
            return res.status(404).json({
                status: "error",
                message: "Quiz not found"
            });
        }

        const quiz = quizzes[0];
        const formattedQuiz = {
            id: quiz.id,
            title: quiz.title,
            quizDate: quiz.quiz_date,
            optionA: quiz.option_a,
            optionB: quiz.option_b,
            optionC: quiz.option_c,
            optionD: quiz.option_d,
            correctAnswer: quiz.correctAnswer,
            category: quiz.category,
            domainId: quiz.domainId,
            createdBy: quiz.createdBy,
            createdAt: quiz.createdAt
        };

        res.status(200).json(formattedQuiz);
    } catch (error) {
        console.error("Error fetching quiz:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to fetch quiz",
            error: error.message
        });
    }
};

// Create new quiz - Auto-assigns to active batch
const createQuiz = async (req, res) => {
    try {
        const { questionText, category, optionA, optionB, optionC, optionD, correctAnswer, createdBy, quizDate } = req.body;

        // Validation
        if (!questionText || !category || !optionA || !optionB || !optionC || !optionD || !correctAnswer || !quizDate) {
            return res.status(400).json({
                status: "error",
                message: "All fields are required: questionText, category, optionA, optionB, optionC, optionD, correctAnswer, quizDate"
            });
        }

        // Validate correct answer
        const validAnswers = ['A', 'B', 'C', 'D'];
        if (!validAnswers.includes(correctAnswer.toUpperCase())) {
            return res.status(400).json({
                status: "error",
                message: "Correct answer must be A, B, C, or D"
            });
        }

        // Get active batch ID
        const [activeBatch] = await db.execute(
            "SELECT id FROM batch WHERE is_active = 1 LIMIT 1"
        );

        if (activeBatch.length === 0) {
            return res.status(400).json({
                status: "error",
                message: "No active batch found. Please set an active batch before creating quizzes."
            });
        }

        const activeBatchId = activeBatch[0].id;

        // Get domain_id from domain name
        const [domains] = await db.query(
            "SELECT domain_id FROM domains WHERE name = ?",
            [category]
        );

        if (domains.length === 0) {
            return res.status(400).json({
                status: "error",
                message: "Invalid domain/category"
            });
        }

        const domainId = domains[0].domain_id;

        // Insert quiz with batch
        const insertQuery = `
            INSERT INTO daily_quiz_questions (
                domain_id, 
                question_text, 
                quiz_date,
                option_a, 
                option_b, 
                option_c, 
                option_d, 
                correct_answer, 
                created_by,
                batch,
                created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        `;

        const [result] = await db.query(insertQuery, [
            domainId,
            questionText,
            quizDate,
            optionA,
            optionB,
            optionC,
            optionD,
            correctAnswer.toUpperCase(),
            createdBy || null,
            activeBatchId
        ]);

        // Fetch the created quiz
        const [newQuiz] = await db.query(
            `SELECT 
                q.quiz_id as id,
                q.question_text as title,
                q.quiz_date,
                q.option_a,
                q.option_b,
                q.option_c,
                q.option_d,
                q.correct_answer as correctAnswer,
                q.created_at as createdAt,
                d.name as category,
                d.domain_id as domainId,
                a.name as createdBy
            FROM daily_quiz_questions q
            LEFT JOIN domains d ON q.domain_id = d.domain_id
            LEFT JOIN admins a ON q.created_by = a.admin_id
            WHERE q.quiz_id = ?`,
            [result.insertId]
        );

        const formattedQuiz = {
            id: newQuiz[0].id,
            title: newQuiz[0].title,
            quizDate: newQuiz[0].quiz_date,
            optionA: newQuiz[0].option_a,
            optionB: newQuiz[0].option_b,
            optionC: newQuiz[0].option_c,
            optionD: newQuiz[0].option_d,
            correctAnswer: newQuiz[0].correctAnswer,
            category: newQuiz[0].category,
            domainId: newQuiz[0].domainId,
            createdBy: newQuiz[0].createdBy,
            createdAt: newQuiz[0].createdAt
        };

        res.status(201).json(formattedQuiz);
    } catch (error) {
        console.error("Error creating quiz:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to create quiz",
            error: error.message
        });
    }
};

// Bulk create quizzes
const bulkCreateQuizzes = async (req, res) => {
    try {
        const { quizzes } = req.body;

        if (!Array.isArray(quizzes) || quizzes.length === 0) {
            return res.status(400).json({
                status: "error",
                message: "Quizzes array is required and must not be empty"
            });
        }

        // Get active batch ID
        const [activeBatch] = await db.execute(
            "SELECT id FROM batch WHERE is_active = 1 LIMIT 1"
        );

        if (activeBatch.length === 0) {
            return res.status(400).json({
                status: "error",
                message: "No active batch found. Please set an active batch before creating quizzes."
            });
        }

        const activeBatchId = activeBatch[0].id;
        const createdQuizzes = [];
        const errors = [];

        for (let i = 0; i < quizzes.length; i++) {
            const quiz = quizzes[i];
            try {
                const { questionText, category, optionA, optionB, optionC, optionD, correctAnswer, createdBy, quizDate } = quiz;

                // Validation
                if (!questionText || !category || !optionA || !optionB || !optionC || !optionD || !correctAnswer) {
                    errors.push({ index: i, error: "Missing required fields" });
                    continue;
                }

                // Validate correct answer
                const validAnswers = ['A', 'B', 'C', 'D'];
                if (!validAnswers.includes(correctAnswer.toUpperCase())) {
                    errors.push({ index: i, error: "Correct answer must be A, B, C, or D" });
                    continue;
                }

                // Get domain_id from domain name
                const [domains] = await db.query(
                    "SELECT domain_id FROM domains WHERE name = ?",
                    [category]
                );

                if (domains.length === 0) {
                    errors.push({ index: i, error: "Invalid domain/category" });
                    continue;
                }

                const domainId = domains[0].domain_id;

                // Insert quiz with batch
                const insertQuery = `
                    INSERT INTO daily_quiz_questions (
                        domain_id, 
                        question_text, 
                        quiz_date,
                        option_a, 
                        option_b, 
                        option_c, 
                        option_d, 
                        correct_answer, 
                        created_by,
                        batch,
                        created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
                `;

                const [result] = await db.query(insertQuery, [
                    domainId,
                    questionText,
                    quizDate || null,
                    optionA,
                    optionB,
                    optionC,
                    optionD,
                    correctAnswer.toUpperCase(),
                    createdBy || null,
                    activeBatchId
                ]);

                createdQuizzes.push({ index: i, quizId: result.insertId });
            } catch (error) {
                errors.push({ index: i, error: error.message });
            }
        }

        res.status(201).json({
            status: "success",
            message: `Created ${createdQuizzes.length} quizzes`,
            created: createdQuizzes,
            errors: errors
        });
    } catch (error) {
        console.error("Error in bulk create quizzes:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to bulk create quizzes",
            error: error.message
        });
    }
};

// Update quiz
const updateQuiz = async (req, res) => {
    try {
        const { id } = req.params;
        const { questionText, category, optionA, optionB, optionC, optionD, correctAnswer, quizDate } = req.body;

        // Check if quiz exists
        const [existingQuiz] = await db.query(
            "SELECT quiz_id FROM daily_quiz_questions WHERE quiz_id = ?",
            [id]
        );

        if (existingQuiz.length === 0) {
            return res.status(404).json({
                status: "error",
                message: "Quiz not found"
            });
        }

        // Validate correct answer if provided
        if (correctAnswer) {
            const validAnswers = ['A', 'B', 'C', 'D'];
            if (!validAnswers.includes(correctAnswer.toUpperCase())) {
                return res.status(400).json({
                    status: "error",
                    message: "Correct answer must be A, B, C, or D"
                });
            }
        }

        // Get domain_id if category is provided
        let domainId = null;
        if (category) {
            const [domains] = await db.query(
                "SELECT domain_id FROM domains WHERE name = ?",
                [category]
            );

            if (domains.length === 0) {
                return res.status(400).json({
                    status: "error",
                    message: "Invalid domain/category"
                });
            }
            domainId = domains[0].domain_id;
        }

        // Build update query dynamically
        const updates = [];
        const values = [];

        if (questionText) {
            updates.push("question_text = ?");
            values.push(questionText);
        }
        if (domainId) {
            updates.push("domain_id = ?");
            values.push(domainId);
        }
        if (optionA) {
            updates.push("option_a = ?");
            values.push(optionA);
        }
        if (optionB) {
            updates.push("option_b = ?");
            values.push(optionB);
        }
        if (optionC) {
            updates.push("option_c = ?");
            values.push(optionC);
        }
        if (optionD) {
            updates.push("option_d = ?");
            values.push(optionD);
        }
        if (correctAnswer) {
            updates.push("correct_answer = ?");
            values.push(correctAnswer.toUpperCase());
        }
        if (quizDate !== undefined) {
            updates.push("quiz_date = ?");
            values.push(quizDate || null);
        }

        if (updates.length === 0) {
            return res.status(400).json({
                status: "error",
                message: "No fields to update"
            });
        }

        values.push(id);

        const updateQuery = `
            UPDATE daily_quiz_questions 
            SET ${updates.join(", ")}
            WHERE quiz_id = ?
        `;

        await db.query(updateQuery, values);

        // Fetch updated quiz
        const [updatedQuiz] = await db.query(
            `SELECT 
                q.quiz_id as id,
                q.question_text as title,
                q.quiz_date,
                q.option_a,
                q.option_b,
                q.option_c,
                q.option_d,
                q.correct_answer as correctAnswer,
                q.created_at as createdAt,
                d.name as category,
                d.domain_id as domainId,
                a.name as createdBy
            FROM daily_quiz_questions q
            LEFT JOIN domains d ON q.domain_id = d.domain_id
            LEFT JOIN admins a ON q.created_by = a.admin_id
            WHERE q.quiz_id = ?`,
            [id]
        );

        const formattedQuiz = {
            id: updatedQuiz[0].id,
            title: updatedQuiz[0].title,
            quizDate: updatedQuiz[0].quiz_date,
            optionA: updatedQuiz[0].option_a,
            optionB: updatedQuiz[0].option_b,
            optionC: updatedQuiz[0].option_c,
            optionD: updatedQuiz[0].option_d,
            correctAnswer: updatedQuiz[0].correctAnswer,
            category: updatedQuiz[0].category,
            domainId: updatedQuiz[0].domainId,
            createdBy: updatedQuiz[0].createdBy,
            createdAt: updatedQuiz[0].createdAt
        };

        res.status(200).json(formattedQuiz);
    } catch (error) {
        console.error("Error updating quiz:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to update quiz",
            error: error.message
        });
    }
};

// Delete quiz
const deleteQuiz = async (req, res) => {
    try {
        const { id } = req.params;

        // Check if quiz exists
        const [existingQuiz] = await db.query(
            "SELECT quiz_id FROM daily_quiz_questions WHERE quiz_id = ?",
            [id]
        );

        if (existingQuiz.length === 0) {
            return res.status(404).json({
                status: "error",
                message: "Quiz not found"
            });
        }

        // Delete quiz
        await db.query("DELETE FROM daily_quiz_questions WHERE quiz_id = ?", [id]);

        res.status(200).json({
            status: "success",
            message: "Quiz deleted successfully"
        });
    } catch (error) {
        console.error("Error deleting quiz:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to delete quiz",
            error: error.message
        });
    }
};

// Submit quiz attempt (for interns)
const submitQuiz = async (req, res) => {
    try {
        const { quizId, selectedAnswer } = req.body;
        const internId = req.user.id; // From auth middleware

        if (!quizId || !selectedAnswer) {
            return res.status(400).json({
                status: "error",
                message: "quizId and selectedAnswer are required"
            });
        }

        // Get the quiz to check the correct answer
        const [quizzes] = await db.query(
            "SELECT correct_answer FROM daily_quiz_questions WHERE quiz_id = ?",
            [quizId]
        );

        if (quizzes.length === 0) {
            return res.status(404).json({
                status: "error",
                message: "Quiz not found"
            });
        }

        const correctAnswer = quizzes[0].correct_answer;
        const isCorrect = selectedAnswer.toUpperCase() === correctAnswer.toUpperCase();

        // Save the attempt
        const [result] = await db.query(
            "INSERT INTO intern_quiz_attempts (intern_id, quiz_id, selected_answer, is_correct, attempted_at) VALUES (?, ?, ?, ?, NOW())",
            [internId, quizId, selectedAnswer, isCorrect ? 1 : 0]
        );

        // Log activity for streak
        await db.query(
            "INSERT INTO activity_log (student_id, action_type, related_id, description) VALUES (?, 'quiz_attempt', ?, ?)",
            [internId, quizId, `Attempted quiz #${quizId} - ${isCorrect ? 'Correct' : 'Incorrect'}`]
        );

        res.status(200).json({
            status: "success",
            message: "Quiz submitted successfully",
            data: {
                isCorrect,
                correctAnswer
            }
        });
    } catch (error) {
        console.error("Error submitting quiz:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to submit quiz",
            error: error.message
        });
    }
};

module.exports = {
    getAllQuizzes,
    getQuizzesByDomain,
    getQuizById,
    getQuizStats,
    getQuizCompletionCounts,
    createQuiz,
    bulkCreateQuizzes,
    updateQuiz,
    deleteQuiz,
    submitQuiz
};

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

// Database
const db = require("./config/db");
const logger = require("./utils/logger");

// Routes
const authRoutes = require("./routes/auth.routes");
const adminRoutes = require("./routes/admin.routes");
const internRoutes = require("./routes/intern.routes");
const taskRoutes = require("./routes/task.routes");
const quizRoutes = require("./routes/quiz.routes");
const streakRoutes = require("./routes/streak.routes");
const pointsRoutes = require("./routes/points.routes");
const meetingRoutes = require("./routes/meeting.routes");
const domainRoutes = require("./routes/domain.routes");
const reviewRoutes = require("./routes/review.routes");
const batchRoutes = require("./routes/batch.routes");
const ticketRoutes = require("./routes/ticket.routes");
const notificationRoutes = require("./routes/notification.routes");
const announcementRoutes = require("./routes/announcement.routes");
const onlineRoutes = require("./routes/online.routes");
const careerRoutes = require("./routes/career.routes");
const workUpdateRoutes = require("./routes/workUpdate.routes");
const reminderRoutes = require("./routes/reminder.routes");
const employeeRoutes = require("./routes/employee.routes");
const employeeAdminRoutes = require("./routes/employee.admin.routes");
const employeeTaskRoutes = require("./routes/employeeTask.routes");
const app = express();
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

// Middleware
// Middleware
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginOpenerPolicy: { policy: "unsafe-none" },
    crossOriginResourcePolicy: { policy: "cross-origin" },
}));

// CORS Configuration - MUST be before rate limiter
const allowedOrigins = [
    // Production
    'https://karthikeshrobotics.in',
    'https://www.karthikeshrobotics.in',
    'https://admin.karthikeshrobotics.in',
    'https://www.admin.karthikeshrobotics.in',
    'https://internship.karthikeshrobotics.in',
    'https://www.internship.karthikeshrobotics.in',
    // Local Development
    'http://localhost:5173',
    'http://localhost:3000',
    'http://localhost:5174',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5174'
];

// Handle preflight requests for all routes
app.options('*', cors());

app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) === -1) {
            var msg = 'The CORS policy for this site does not allow access from the specified Origin.';
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    },
    credentials: true
}));

// Rate Limiting - skip for localhost in development
const isLocalhost = (req) => {
    const ip = req.ip || req.connection.remoteAddress;
    return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
};
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5000,
    skip: isLocalhost,
    message: { status: "error", message: "Too many requests, please try again later." }
});
app.use(limiter);

app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true }));

// ── Request Logger ───────────────────────────────────────────────────────────
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => logger.request(req, res.statusCode, Date.now() - start));
    next();
});

// Serve static files from uploads directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/intern", internRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/quiz", quizRoutes);
app.use("/api/streak", streakRoutes);
app.use("/api/points", pointsRoutes);
app.use("/api/meeting", meetingRoutes);
app.use("/api/domain", domainRoutes);
app.use("/api/review", reviewRoutes);
app.use("/api/batch", batchRoutes);
app.use("/api/tickets", ticketRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/announcements", announcementRoutes);
app.use("/api/online", onlineRoutes);
app.use("/api/career", careerRoutes);
app.use("/api/work-updates", workUpdateRoutes);
app.use("/api/reminder", reminderRoutes);
app.use("/api/employee", employeeRoutes);
app.use("/api/admin", employeeAdminRoutes);
app.use("/api/admin/employee-tasks", employeeTaskRoutes);
app.use("/api/projects", require("./routes/project.routes"));
app.use("/api/offline-tasks", require("./routes/offlineTask.routes"));
app.use("/api/admin", require("./routes/masterclass.routes"));
app.use("/api/dashboard", require("./routes/dashboard.routes"));
app.use("/api/public", require("./routes/publicProfile.routes"));
app.use("/api/feedback", require("./routes/feedback.routes"));
app.use("/api/calendar", require("./routes/calendar.routes"));
app.use("/api/gantt", require("./routes/gantt.routes"));
// Test Route
// Serve Frontend Static Files
const frontendPath = path.join(__dirname, '../dist');
app.use(express.static(frontendPath));

// API 404 Handler (for missing /api routes specifically)
app.use('/api/*', (req, res) => {
    res.status(404).json({
        status: "error",
        message: "API Route not found",
    });
});

// SPA Fallback - Serve index.html for any other unknown routes (fixes refresh 404)
app.get('*', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
});

// Global Error Handler
app.use((err, req, res, next) => {
    logger.error('Unhandled server error', {
        method: req.method,
        path: req.originalUrl,
        error: err.message,
        stack: err.stack?.split('\n')[1]?.trim(),
        user: req.user?.id || 'anon',
    });
    res.status(500).json({
        status: "error",
        message: "Internal server error",
    });
});

// Start Server
// cPanel uses Passenger which sets PORT automatically
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});

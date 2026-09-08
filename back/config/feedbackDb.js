const mysql = require("mysql2/promise");

// Create connection pool for the feedback database
const feedbackPool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME_FEEDBACK,
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
});

// Test connection
(async () => {
    try {
        const connection = await feedbackPool.getConnection();
        console.log("✅ MySQL Connected (Feedback DB)...");
        connection.release();
    } catch (err) {
        console.error("❌ Feedback DB connection failed:", err.message);
    }
})();

module.exports = feedbackPool;

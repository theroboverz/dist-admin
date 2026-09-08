const mysql = require("mysql2/promise");

// Create connection pool for Career Database
const careerPool = mysql.createPool({
    host: process.env.DB_HOST,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME_CAREER, // Fallback or use env
    user: process.env.DB_USER,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
});

// Test database connection
(async () => {
    try {
        const connection = await careerPool.getConnection();
        console.log("✅ MySQL Connected (Career DB)...");
        connection.release();
    } catch (err) {
        console.error("❌ Database connection failed (Career DB):", err.message);
    }
})();

module.exports = careerPool;

// This file remains unchanged to preserve existing imports.
// See careerDb.js for the career database connection.
const mysql = require("mysql2/promise");

// Create connection pool with promise support
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
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
        const connection = await pool.getConnection();
        console.log("✅ MySQL Connected (Main DB)...");
        connection.release();
    } catch (err) {
        console.error("❌ Database connection failed (Main DB):", err.message);
    }
})();

// Export promise-based pool
module.exports = pool;
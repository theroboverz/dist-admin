require('dotenv').config();
const db = require('../config/db');

async function run() {
    // Attendance correction requests
    await db.execute(`
        CREATE TABLE IF NOT EXISTS attendance_correction_requests (
            id INT AUTO_INCREMENT PRIMARY KEY,
            intern_id INT NOT NULL,
            date DATE NOT NULL,
            requested_status ENUM('present','absent','half_day','late') NOT NULL,
            reason TEXT NOT NULL,
            status ENUM('pending','approved','denied') DEFAULT 'pending',
            admin_note TEXT,
            reviewed_by INT DEFAULT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    `);
    console.log('attendance_correction_requests table ready');

    // Task completion proof columns (safe — ignore duplicate column errors)
    const addCol = async (sql) => { try { await db.execute(sql); } catch(e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; } };
    await addCol(`ALTER TABLE employee_tasks ADD COLUMN completion_notes TEXT DEFAULT NULL`);
    await addCol(`ALTER TABLE employee_tasks ADD COLUMN completion_proof_url VARCHAR(500) DEFAULT NULL`);
    console.log('employee_tasks completion columns ready');

    process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });

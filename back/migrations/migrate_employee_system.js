require('dotenv').config();
const db = require('../config/db');

const addCol = async (sql) => {
    try { await db.execute(sql); }
    catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
};

async function run() {
    // A. Interns table — employee columns
    await addCol(`ALTER TABLE interns ADD COLUMN role ENUM('intern','employee') DEFAULT 'intern'`);
    await addCol(`ALTER TABLE interns ADD COLUMN employee_id VARCHAR(50) NULL`);
    await addCol(`ALTER TABLE interns ADD COLUMN aadhar_number TEXT NULL`);
    await addCol(`ALTER TABLE interns ADD COLUMN pan_number VARCHAR(255) NULL`);
    await addCol(`ALTER TABLE interns ADD COLUMN bank_account_number TEXT NULL`);
    await addCol(`ALTER TABLE interns ADD COLUMN bank_ifsc VARCHAR(20) NULL`);
    await addCol(`ALTER TABLE interns ADD COLUMN bank_name VARCHAR(100) NULL`);
    // Unique index on employee_id (ignore if already exists)
    try {
        await db.execute(`ALTER TABLE interns ADD UNIQUE INDEX uq_employee_id (employee_id)`);
    } catch (e) { if (e.code !== 'ER_DUP_KEYNAME' && e.code !== 'ER_DUP_ENTRY') throw e; }
    console.log('interns employee columns ready');

    // B. employee_attendance
    await db.execute(`
        CREATE TABLE IF NOT EXISTS employee_attendance (
            id INT PRIMARY KEY AUTO_INCREMENT,
            intern_id INT NOT NULL,
            date DATE NOT NULL,
            check_in DATETIME NULL,
            check_out DATETIME NULL,
            status ENUM('present','absent','half_day','late') DEFAULT 'absent',
            admin_override TINYINT(1) DEFAULT 0,
            admin_notes TEXT NULL,
            override_by INT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_attendance (intern_id, date),
            FOREIGN KEY (intern_id) REFERENCES interns(intern_id),
            FOREIGN KEY (override_by) REFERENCES admins(admin_id)
        )
    `);
    console.log('employee_attendance table ready');

    // C. employee_eod_updates
    await db.execute(`
        CREATE TABLE IF NOT EXISTS employee_eod_updates (
            id INT PRIMARY KEY AUTO_INCREMENT,
            intern_id INT NOT NULL,
            date DATE NOT NULL,
            title VARCHAR(255) NOT NULL,
            description TEXT,
            progress INT DEFAULT 0,
            resource_file_path TEXT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (intern_id) REFERENCES interns(intern_id)
        )
    `);
    console.log('employee_eod_updates table ready');

    // D. eod_comments
    await db.execute(`
        CREATE TABLE IF NOT EXISTS eod_comments (
            id INT PRIMARY KEY AUTO_INCREMENT,
            eod_id INT NOT NULL,
            commenter_id INT NULL,
            commenter_type ENUM('employee','admin') NOT NULL,
            commenter_name VARCHAR(255),
            comment TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (eod_id) REFERENCES employee_eod_updates(id) ON DELETE CASCADE
        )
    `);
    console.log('eod_comments table ready');

    // E. projects — add 'Employee' to assigned_to_type if not already there
    try {
        await db.execute(`ALTER TABLE projects MODIFY COLUMN assigned_to_type ENUM('Admin','Individual','Employee')`);
        console.log('projects.assigned_to_type updated');
    } catch (e) {
        console.log('projects.assigned_to_type already includes Employee or not found:', e.message);
    }

    process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });

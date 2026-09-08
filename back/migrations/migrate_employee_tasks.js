require('dotenv').config();
const db = require('../config/db');

async function run() {
    await db.execute(`
        CREATE TABLE IF NOT EXISTS employee_tasks (
            id INT AUTO_INCREMENT PRIMARY KEY,
            title VARCHAR(255) NOT NULL,
            description TEXT,
            assigned_to INT NOT NULL,
            assigned_by INT NOT NULL,
            priority ENUM('Low','Medium','High','Urgent') DEFAULT 'Medium',
            status ENUM('Pending','In Progress','Completed','On Hold') DEFAULT 'Pending',
            deadline DATE,
            resources TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    `);
    console.log('employee_tasks table ready');

    await db.execute(`
        CREATE TABLE IF NOT EXISTS employee_task_comments (
            id INT AUTO_INCREMENT PRIMARY KEY,
            task_id INT NOT NULL,
            author_id INT NOT NULL,
            author_type ENUM('admin','employee') DEFAULT 'admin',
            author_name VARCHAR(255),
            comment_type ENUM('comment','doubt','reply') DEFAULT 'comment',
            content TEXT NOT NULL,
            parent_id INT DEFAULT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (task_id) REFERENCES employee_tasks(id) ON DELETE CASCADE
        )
    `);
    console.log('employee_task_comments table ready');
    process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });

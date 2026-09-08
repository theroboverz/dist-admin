require('dotenv').config();
const db = require('../config/db');

const addCol = async (sql) => {
    try { await db.execute(sql); }
    catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
};

const addIndex = async (sql) => {
    try { await db.execute(sql); }
    catch (e) { if (e.code !== 'ER_DUP_KEYNAME') throw e; }
};

async function run() {
    // employee_tasks: start_date + project link (for Gantt timeline bars)
    await addCol(`ALTER TABLE employee_tasks ADD COLUMN start_date DATE DEFAULT NULL`);
    await addCol(`ALTER TABLE employee_tasks ADD COLUMN project_id INT DEFAULT NULL`);
    await db.execute(`UPDATE employee_tasks SET start_date = DATE(created_at) WHERE start_date IS NULL`);
    await addIndex(`CREATE INDEX idx_employee_tasks_project_id ON employee_tasks(project_id)`);
    console.log('employee_tasks: start_date + project_id ready');

    // tasks (intern task system): start_date + project link
    await addCol(`ALTER TABLE tasks ADD COLUMN start_date DATE DEFAULT NULL`);
    await addCol(`ALTER TABLE tasks ADD COLUMN project_id INT DEFAULT NULL`);
    await db.execute(`UPDATE tasks SET start_date = DATE(created_at) WHERE start_date IS NULL`);
    await addIndex(`CREATE INDEX idx_tasks_project_id ON tasks(project_id)`);
    console.log('tasks: start_date + project_id ready');

    // Unified daily progress history for both task systems
    await db.execute(`
        CREATE TABLE IF NOT EXISTS task_progress_logs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            task_type ENUM('employee_task','intern_task') NOT NULL,
            task_id INT NOT NULL,
            intern_id INT NOT NULL,
            log_date DATE NOT NULL,
            completion_percent INT NOT NULL DEFAULT 0,
            work_completed TEXT,
            work_remaining TEXT,
            blockers TEXT,
            notes TEXT,
            attachment_path VARCHAR(500) DEFAULT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_task_progress_lookup (task_type, task_id, log_date),
            INDEX idx_task_progress_intern (intern_id, log_date),
            UNIQUE KEY uq_task_progress_per_day (task_type, task_id, intern_id, log_date)
        )
    `);
    console.log('task_progress_logs ready');

    // EOD deadline config (admin-configurable, singleton row)
    await db.execute(`
        CREATE TABLE IF NOT EXISTS eod_config (
            id INT AUTO_INCREMENT PRIMARY KEY,
            deadline_time TIME NOT NULL DEFAULT '19:00:00',
            grace_minutes INT NOT NULL DEFAULT 0,
            updated_by INT DEFAULT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    `);
    await db.execute(`
        INSERT INTO eod_config (deadline_time, grace_minutes)
        SELECT '19:00:00', 0 WHERE NOT EXISTS (SELECT 1 FROM eod_config)
    `);
    console.log('eod_config ready');

    console.log('\nNOTE: projects.project_id links are unenforced (no FK constraint) because the');
    console.log('`projects` and `admin_settings` table DDLs are not tracked in this repo.');
    console.log('Run `DESCRIBE projects;` and `DESCRIBE admin_settings;` manually to confirm assumptions.');

    process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });

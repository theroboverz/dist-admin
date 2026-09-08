require('dotenv').config();
const db = require('../config/db');

const addCol = async (sql) => {
    try { await db.execute(sql); }
    catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
};

async function run() {
    // employee_tasks: progress tracking + file attachments
    await addCol(`ALTER TABLE employee_tasks ADD COLUMN progress_percent INT DEFAULT 0`);
    await addCol(`ALTER TABLE employee_tasks ADD COLUMN resource_file_path VARCHAR(500) DEFAULT NULL`);
    await addCol(`ALTER TABLE employee_tasks ADD COLUMN completion_file_path VARCHAR(500) DEFAULT NULL`);
    console.log('employee_tasks columns ready');

    // project_updates: file support (json array already exists, but ensure update_text column)
    // (no changes needed — project_updates already has files JSON column)

    process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });

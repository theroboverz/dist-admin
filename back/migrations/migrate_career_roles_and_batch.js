const mysql = require('mysql2/promise');
require('dotenv').config();

async function migrate() {
    let connection;
    try {
        connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASS,
            database: process.env.DB_NAME_CAREER,
        });

        console.log('Connected to career DB. Running migration...');

        // 1. Create career_roles table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS career_roles (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(100) NOT NULL UNIQUE,
                icon VARCHAR(20) DEFAULT '💼',
                is_active BOOLEAN DEFAULT TRUE,
                sort_order INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ career_roles table created (or already exists)');

        // 2. Seed initial roles (Web Developer replaces Robotics Mentor)
        const roles = [
            ['CAD Designer', '📐', 1, 1],
            ['ROS 2 Developer', '💻', 1, 2],
            ['Web Developer', '🌐', 1, 3],
            ['Video Editor', '🎬', 1, 4],
        ];
        for (const [name, icon, is_active, sort_order] of roles) {
            await connection.query(
                'INSERT IGNORE INTO career_roles (name, icon, is_active, sort_order) VALUES (?, ?, ?, ?)',
                [name, icon, is_active, sort_order]
            );
        }
        console.log('✅ Initial roles seeded');

        // 3. Add batch_name to admin_settings (safe if already exists)
        try {
            await connection.query(
                'ALTER TABLE admin_settings ADD COLUMN batch_name VARCHAR(100) DEFAULT NULL'
            );
            console.log('✅ batch_name column added to admin_settings');
        } catch (e) {
            if (e.code === 'ER_DUP_FIELDNAME') {
                console.log('ℹ️  batch_name column already exists in admin_settings');
            } else throw e;
        }

        // 4. Add hiring_batch to interns (safe if already exists)
        try {
            await connection.query(
                'ALTER TABLE interns ADD COLUMN hiring_batch VARCHAR(100) DEFAULT NULL'
            );
            console.log('✅ hiring_batch column added to interns');
        } catch (e) {
            if (e.code === 'ER_DUP_FIELDNAME') {
                console.log('ℹ️  hiring_batch column already exists in interns');
            } else throw e;
        }

        console.log('\n✅ Migration completed successfully!');
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        process.exit(1);
    } finally {
        if (connection) await connection.end();
    }
}

migrate();


const db = require('../config/db');

// Upload image helper (assuming multer middleware is used in route)
exports.uploadImage = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ status: 'error', message: 'No image file provided' });
        }

        // Construct the file URL (adjust domain/path as needed)
        const imageUrl = `/uploads/${req.file.filename}`;

        res.status(200).json({
            status: 'success',
            message: 'Image uploaded successfully',
            url: imageUrl
        });
    } catch (error) {
        console.error('Image Upload Error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to upload image' });
    }
};

exports.createWorkUpdates = async (req, res) => {
    try {
        const { date, items } = req.body;
        const adminId = req.user.id;

        if (!date || !items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ status: 'error', message: 'Invalid data. Date and items are required.' });
        }

        const connection = await db.getConnection();

        try {
            await connection.beginTransaction();

            for (const item of items) {
                const { description, status, client, percentage, image_url } = item;

                await connection.execute(
                    `INSERT INTO work_items 
                    (admin_id, work_date, task_description, status, client_name, percentage_completed, image_url) 
                    VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [
                        adminId,
                        date,
                        description,
                        status || 'In Progress',
                        client || '',
                        percentage || 0,
                        image_url || ''
                    ]
                );
            }

            await connection.commit();

            // Log activity only if it's an intern (student)
            // Note: We check if req.user.userType is 'intern' or similar if available,
            // or just try to log if we assume interns can also hit this endpoint.
            // Based on auth.controller.js, interns have userType: 'intern'.
            if (req.user && req.user.userType === 'intern') {
                await db.query(
                    "INSERT INTO activity_log (student_id, action_type, related_id, description) VALUES (?, 'work_update', NULL, ?)",
                    [req.user.id, `Submitted ${items.length} work update items for ${date}`]
                );
            }

            res.status(201).json({ status: 'success', message: 'Work updates saved successfully' });
        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            connection.release();
        }

    } catch (error) {
        console.error('Create Work Update Error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to save work updates', error: error.message });
    }
};

exports.getWorkUpdates = async (req, res) => {
    try {
        const { startDate, endDate, adminId } = req.query;

        let query = `
            SELECT w.*, a.name as admin_name 
            FROM work_items w 
            JOIN admins a ON w.admin_id = a.admin_id 
            WHERE 1=1
        `;
        const params = [];

        if (startDate) {
            query += ` AND w.work_date >= ?`;
            params.push(startDate);
        }
        if (endDate) {
            query += ` AND w.work_date <= ?`;
            params.push(endDate);
        }
        if (adminId) {
            query += ` AND w.admin_id = ?`;
            params.push(adminId);
        }

        query += ` ORDER BY w.work_date DESC, w.created_at DESC`;

        const [rows] = await db.execute(query, params);

        res.status(200).json({
            status: 'success',
            data: rows
        });

    } catch (error) {
        console.error('Get Work Updates Error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to fetch work updates' });
    }
};

exports.updateWorkItem = async (req, res) => {
    try {
        const { id } = req.params;
        const { work_date, description, status, client, percentage, image_url } = req.body;
        const adminId = req.user.id;

        // First verify the work item belongs to this admin
        const [existing] = await db.execute(
            'SELECT * FROM work_items WHERE id = ? AND admin_id = ?',
            [id, adminId]
        );

        if (existing.length === 0) {
            return res.status(404).json({
                status: 'error',
                message: 'Work item not found or you do not have permission to edit it'
            });
        }

        // Update the work item
        await db.execute(
            `UPDATE work_items 
             SET work_date = ?, task_description = ?, status = ?, client_name = ?, percentage_completed = ?, image_url = ?
             WHERE id = ? AND admin_id = ?`,
            [
                work_date || existing[0].work_date,
                description,
                status || 'In Progress',
                client || '',
                percentage || 0,
                image_url || '',
                id,
                adminId
            ]
        );

        res.status(200).json({
            status: 'success',
            message: 'Work item updated successfully'
        });

    } catch (error) {
        console.error('Update Work Item Error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to update work item' });
    }
};

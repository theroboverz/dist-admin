const db = require("../config/db");

// Get all batches
const getAllBatches = async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT 
                b.id,
                b.batch_id,
                b.start_date,
                b.end_date,
                b.is_active,
                b.type,
                b.start_time,
                b.end_time,
                COUNT(DISTINCT i.intern_id) as intern_count
            FROM batch b
            LEFT JOIN interns i ON CAST(i.batch AS UNSIGNED) = b.id
            GROUP BY b.id, b.batch_id, b.start_date, b.end_date, b.is_active, b.type, b.start_time, b.end_time
            ORDER BY b.is_active DESC, b.start_date DESC
        `);

        res.status(200).json({
            status: "success",
            data: { batches: rows }
        });
    } catch (error) {
        console.error("Error fetching batches:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to fetch batches"
        });
    }
};

// Create a new batch
const createBatch = async (req, res) => {
    try {
        const { batch_id, start_date, end_date, type, start_time, end_time } = req.body;

        // Validate required fields
        if (!batch_id || !start_date || !end_date) {
            return res.status(400).json({
                status: "error",
                message: "Batch ID, start date, and end date are required"
            });
        }

        // Check if batch_id already exists
        const [existing] = await db.execute(
            "SELECT id FROM batch WHERE batch_id = ?",
            [batch_id]
        );

        if (existing.length > 0) {
            return res.status(400).json({
                status: "error",
                message: "A batch with this ID already exists"
            });
        }

        // Validate dates
        if (new Date(end_date) <= new Date(start_date)) {
            return res.status(400).json({
                status: "error",
                message: "End date must be after start date"
            });
        }

        // Insert the batch (default is_active = 0)
        const [result] = await db.execute(
            `INSERT INTO batch (batch_id, start_date, end_date, is_active, type, start_time, end_time)
             VALUES (?, ?, ?, 0, ?, ?, ?)`,
            [batch_id, start_date, end_date, type || 'online', start_time || null, end_time || null]
        );

        res.status(201).json({
            status: "success",
            message: "Batch created successfully",
            data: {
                id: result.insertId,
                batch_id,
                start_date,
                end_date,
                is_active: 0,
                type: type || 'online',
                start_time: start_time || null,
                end_time: end_time || null
            }
        });
    } catch (error) {
        console.error("Error creating batch:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to create batch"
        });
    }
};

// Update a batch
const updateBatch = async (req, res) => {
    try {
        const { id } = req.params;
        const { batch_id, start_date, end_date, type, start_time, end_time } = req.body;

        // Check if batch exists
        const [existing] = await db.execute(
            "SELECT id, is_active FROM batch WHERE id = ?",
            [id]
        );

        if (existing.length === 0) {
            return res.status(404).json({
                status: "error",
                message: "Batch not found"
            });
        }

        const updates = [];
        const values = [];

        if (batch_id !== undefined) {
            // Check if new batch_id is unique
            const [duplicate] = await db.execute(
                "SELECT id FROM batch WHERE batch_id = ? AND id != ?",
                [batch_id, id]
            );

            if (duplicate.length > 0) {
                return res.status(400).json({
                    status: "error",
                    message: "A batch with this ID already exists"
                });
            }

            updates.push("batch_id = ?");
            values.push(batch_id);
        }

        if (start_date !== undefined) {
            updates.push("start_date = ?");
            values.push(start_date);
        }

        if (end_date !== undefined) {
            updates.push("end_date = ?");
            values.push(end_date);
        }

        if (type !== undefined) {
            updates.push("type = ?");
            values.push(type);
        }

        if (start_time !== undefined) {
            updates.push("start_time = ?");
            values.push(start_time);
        }

        if (end_time !== undefined) {
            updates.push("end_time = ?");
            values.push(end_time);
        }

        if (updates.length === 0) {
            return res.status(400).json({
                status: "error",
                message: "No fields to update"
            });
        }

        values.push(id);

        await db.execute(
            `UPDATE batch SET ${updates.join(", ")} WHERE id = ?`,
            values
        );

        // Get updated batch
        const [updated] = await db.execute(
            "SELECT * FROM batch WHERE id = ?",
            [id]
        );

        res.status(200).json({
            status: "success",
            message: "Batch updated successfully",
            data: { batch: updated[0] }
        });
    } catch (error) {
        console.error("Error updating batch:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to update batch"
        });
    }
};

// Delete a batch
const deleteBatch = async (req, res) => {
    try {
        const { id } = req.params;

        // Check if batch exists
        const [existing] = await db.execute(
            "SELECT batch_id, id FROM batch WHERE id = ?",
            [id]
        );

        if (existing.length === 0) {
            return res.status(404).json({
                status: "error",
                message: "Batch not found"
            });
        }

        // Check if any interns are associated with this batch (using numeric ID)
        const [interns] = await db.execute(
            "SELECT COUNT(*) as count FROM interns WHERE batch = ?",
            [id]
        );

        if (interns[0].count > 0) {
            return res.status(400).json({
                status: "error",
                message: `Cannot delete batch. ${interns[0].count} intern(s) are associated with this batch.`
            });
        }

        // Delete the batch
        await db.execute("DELETE FROM batch WHERE id = ?", [id]);

        res.status(200).json({
            status: "success",
            message: "Batch deleted successfully"
        });
    } catch (error) {
        console.error("Error deleting batch:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to delete batch"
        });
    }
};

// Set a batch as active (deactivate all others)
const setActiveBatch = async (req, res) => {
    try {
        const { id } = req.params;

        // Check if batch exists and get its type
        const [existing] = await db.execute(
            "SELECT id, type FROM batch WHERE id = ?",
            [id]
        );

        if (existing.length === 0) {
            return res.status(404).json({
                status: "error",
                message: "Batch not found"
            });
        }

        const batchType = existing[0].type;

        // Deactivate all batches of the same type
        await db.execute(
            "UPDATE batch SET is_active = 0 WHERE type = ?",
            [batchType]
        );

        // Activate the specified batch
        await db.execute(
            "UPDATE batch SET is_active = 1 WHERE id = ?",
            [id]
        );

        res.status(200).json({
            status: "success",
            message: `Batch (${batchType}) activated successfully`
        });
    } catch (error) {
        console.error("Error activating batch:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to activate batch"
        });
    }
};

// Get the active batch
const getActiveBatch = async (req, res) => {
    try {
        console.log("[getActiveBatch] Starting query...");

        const [rows] = await db.execute(`
            SELECT 
                b.id,
                b.batch_id,
                b.start_date,
                b.end_date,
                b.is_active,
                b.type,
                b.start_time,
                b.end_time,
                COUNT(DISTINCT i.intern_id) as intern_count
            FROM batch b
            LEFT JOIN interns i ON CAST(i.batch AS UNSIGNED) = b.id AND i.is_active = 1
            WHERE b.is_active = 1
            GROUP BY b.id, b.batch_id, b.start_date, b.end_date, b.is_active, b.type, b.start_time, b.end_time
        `);

        console.log("[getActiveBatch] Query successful, rows:", rows.length);

        res.status(200).json({
            status: "success",
            data: { batches: rows }
        });
    } catch (error) {
        console.error("[getActiveBatch] ERROR:", error.message);
        console.error("[getActiveBatch] ERROR CODE:", error.code);
        console.error("[getActiveBatch] STACK:", error.stack);
        res.status(500).json({
            status: "error",
            message: "Failed to fetch active batch",
            debug: {
                errorMessage: error.message,
                errorCode: error.code,
                sqlState: error.sqlState || null
            }
        });
    }
};

// Get the batch end date for a specific intern
const getInternBatchEndDate = async (req, res) => {
    try {
        const { intern_id } = req.query;

        if (!intern_id) {
            return res.status(400).json({
                status: "error",
                message: "Intern ID is required"
            });
        }

        // Get the intern's batch and corresponding end date
        const [rows] = await db.execute(`
            SELECT 
                b.end_date,
                b.batch_id,
                i.name as intern_name
            FROM interns i
            JOIN batch b ON CAST(i.batch AS UNSIGNED) = b.id
            WHERE i.intern_id = ? AND i.is_active = 1
            LIMIT 1
        `, [intern_id]);

        if (rows.length === 0) {
            return res.status(404).json({
                status: "error",
                message: "No batch found for this intern or intern is not active"
            });
        }

        res.status(200).json({
            status: "success",
            data: {
                end_date: rows[0].end_date,
                batch_id: rows[0].batch_id
            }
        });
    } catch (error) {
        console.error("Error fetching intern batch end date:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to fetch batch end date"
        });
    }
};

module.exports = {
    getAllBatches,
    createBatch,
    updateBatch,
    deleteBatch,
    setActiveBatch,
    getActiveBatch,
    getInternBatchEndDate
};

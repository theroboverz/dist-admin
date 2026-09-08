const db = require('../config/db');
const emailService = require('../services/emailService');

// Get all announcements (for admin)
const getAllAnnouncements = async (req, res) => {
    try {
        const [announcements] = await db.query(`
            SELECT a.*, ad.name as createdByName 
            FROM announcements a
            LEFT JOIN admins ad ON a.created_by = ad.admin_id
            ORDER BY a.created_at DESC
        `);

        res.status(200).json({
            status: 'success',
            data: announcements
        });
    } catch (error) {
        console.error('Error fetching announcements:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch announcements'
        });
    }
};

// Get active announcements (for interns - only active and not expired)
const getActiveAnnouncements = async (req, res) => {
    try {
        const [announcements] = await db.query(`
            SELECT id, type, title, message, cta_text, cta_link, image_url, created_at
            FROM announcements
            WHERE is_active = TRUE
            AND (expires_at IS NULL OR expires_at > NOW())
            ORDER BY created_at DESC
        `);

        res.status(200).json({
            status: 'success',
            data: announcements
        });
    } catch (error) {
        console.error('Error fetching active announcements:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch announcements'
        });
    }
};

// Create announcement
const createAnnouncement = async (req, res) => {
    try {
        const { type, title, message, cta_text, cta_link, image_url, expires_at } = req.body;
        const created_by = req.body.created_by || null;

        if (!title || !message) {
            return res.status(400).json({
                status: 'error',
                message: 'Title and message are required'
            });
        }

        const [result] = await db.query(
            `INSERT INTO announcements (type, title, message, cta_text, cta_link, image_url, created_by, expires_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [type || 'general', title, message, cta_text || null, cta_link || null, image_url || null, created_by, expires_at || null]
        );

        // Notify all admins and interns
        const announcementId = result.insertId;
        const announcementData = {
            id: announcementId,
            type: type || 'general',
            title,
            message,
            cta_text,
            cta_link
        };

        // Fetch all admins
        const [admins] = await db.query('SELECT name, email FROM admins');
        // Fetch all interns
        const [interns] = await db.query('SELECT name, email FROM interns');

        // Combine recipients
        const recipients = [
            ...admins.map(a => ({ ...a, role: 'Admin' })),
            ...interns.map(i => ({ ...i, role: 'Intern' }))
        ];

        // Send notifications asynchronously
        recipients.forEach(person => {
            emailService.sendTicketNotification( // Reusing ticket notification for general announcements
                person.email,
                person.name,
                `New Announcement: ${title}`,
                `A new announcement has been posted: "${title}".\n\n${message}`,
                { ticketId: announcementId, subject: title, role: person.role }
            ).catch(err => console.error(`Failed to notify ${person.email}:`, err));
        });

        res.status(201).json({
            status: 'success',
            message: 'Announcement created successfully',
            data: { id: announcementId }
        });
    } catch (error) {
        console.error('Error creating announcement:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to create announcement'
        });
    }
};

// Update announcement
const updateAnnouncement = async (req, res) => {
    try {
        const { id } = req.params;
        const { type, title, message, cta_text, cta_link, is_active, expires_at } = req.body;

        const updates = [];
        const values = [];

        if (type !== undefined) { updates.push('type = ?'); values.push(type); }
        if (title !== undefined) { updates.push('title = ?'); values.push(title); }
        if (message !== undefined) { updates.push('message = ?'); values.push(message); }
        if (cta_text !== undefined) { updates.push('cta_text = ?'); values.push(cta_text); }
        if (cta_link !== undefined) { updates.push('cta_link = ?'); values.push(cta_link); }
        if (req.body.image_url !== undefined && req.body.image_url !== '') { updates.push('image_url = ?'); values.push(req.body.image_url); }
        if (is_active !== undefined) { updates.push('is_active = ?'); values.push(is_active); }
        if (expires_at !== undefined) { updates.push('expires_at = ?'); values.push(expires_at); }

        if (updates.length === 0) {
            return res.status(400).json({
                status: 'error',
                message: 'No fields to update'
            });
        }

        values.push(id);

        await db.query(
            `UPDATE announcements SET ${updates.join(', ')} WHERE id = ?`,
            values
        );

        res.status(200).json({
            status: 'success',
            message: 'Announcement updated successfully'
        });
    } catch (error) {
        console.error('Error updating announcement:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to update announcement'
        });
    }
};

// Delete announcement
const deleteAnnouncement = async (req, res) => {
    try {
        const { id } = req.params;

        await db.query('DELETE FROM announcements WHERE id = ?', [id]);

        res.status(200).json({
            status: 'success',
            message: 'Announcement deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting announcement:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to delete announcement'
        });
    }
};

// Toggle announcement active status
const toggleAnnouncement = async (req, res) => {
    try {
        const { id } = req.params;

        await db.query(
            'UPDATE announcements SET is_active = NOT is_active WHERE id = ?',
            [id]
        );

        res.status(200).json({
            status: 'success',
            message: 'Announcement status toggled'
        });
    } catch (error) {
        console.error('Error toggling announcement:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to toggle announcement'
        });
    }
};

// Upload announcement image
const uploadImage = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                status: 'error',
                message: 'No image file uploaded'
            });
        }

        // Return the file path that can be used to access the image
        const imageUrl = `/uploads/${req.file.filename}`;

        res.status(200).json({
            status: 'success',
            message: 'Image uploaded successfully',
            data: {
                image_url: imageUrl,
                filename: req.file.filename
            }
        });
    } catch (error) {
        console.error('Error uploading image:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to upload image'
        });
    }
};

module.exports = {
    getAllAnnouncements,
    getActiveAnnouncements,
    createAnnouncement,
    updateAnnouncement,
    deleteAnnouncement,
    toggleAnnouncement,
    uploadImage
};


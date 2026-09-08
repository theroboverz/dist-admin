const db = require('../config/db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const emailService = require('../services/emailService');

// Configure multer for file upload
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../uploads/tickets');

        // Create directory if it doesn't exist
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'ticket-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);

        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'));
        }
    }
});

// Create a new ticket (supports both admin and intern)
const createTicket = async (req, res) => {
    try {
        const { subject, description, createdBy, priority, creatorType } = req.body;
        const imagePath = req.file ? `/uploads/tickets/${req.file.filename}` : null;

        // Validation
        if (!subject || !description) {
            return res.status(400).json({
                status: 'error',
                message: 'Subject and description are required'
            });
        }

        // Default priority to medium if not provided
        const ticketPriority = priority || 'medium';

        // Determine if creator is intern or admin
        const isIntern = creatorType === 'intern';

        // For interns, use intern_id column; for admins, use created_by
        let query, params;

        if (isIntern) {
            query = `
                INSERT INTO tickets (subject, description, image_path, created_by, intern_id, status, priority)
                VALUES (?, ?, ?, NULL, ?, 'open', ?)
            `;
            params = [subject, description, imagePath, createdBy, ticketPriority];
        } else {
            query = `
                INSERT INTO tickets (subject, description, image_path, created_by, status, priority)
                VALUES (?, ?, ?, ?, 'open', ?)
            `;
            params = [subject, description, imagePath, createdBy, ticketPriority];
        }

        const [result] = await db.query(query, params);

        // Fetch all admin emails to notify them
        const [admins] = await db.query('SELECT name, email FROM admins');

        // Notify admins asynchronously
        const ticketId = result.insertId;
        const ticketData = { ticketId, subject, description, priority: ticketPriority };

        admins.forEach(admin => {
            emailService.sendTicketNotification(
                admin.email,
                admin.name,
                'New Support Ticket Raised',
                `A new ticket has been raised with subject: "${subject}" and priority: "${ticketPriority}".`,
                ticketData
            ).catch(err => console.error(`Failed to notify admin ${admin.email}:`, err));
        });

        res.status(201).json({
            status: 'success',
            message: 'Ticket created successfully',
            data: {
                id: ticketId,
                ticketId: ticketId,
                subject,
                description,
                imagePath,
                createdBy,
                priority: ticketPriority,
                status: 'open'
            }
        });
    } catch (error) {
        console.error('Error creating ticket:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to create ticket',
            error: error.message
        });
    }
};



// Get all tickets (for admin dashboard)
const getAllTickets = async (req, res) => {
    try {
        const query = `
      SELECT 
        t.*,
        a.name as admin_name,
        a.email as admin_email,
        i.name as intern_name,
        i.email as intern_email,
        ua.name as updated_by_name,
        ua.email as updated_by_email,
        COALESCE(a.name, i.name) as creator_name
      FROM tickets t
      LEFT JOIN admins a ON t.created_by = a.admin_id
      LEFT JOIN interns i ON t.intern_id = i.intern_id
      LEFT JOIN admins ua ON t.updated_by = ua.admin_id
      ORDER BY t.created_at DESC
    `;

        const [tickets] = await db.query(query);

        // Map tickets to include creator_name as admin_name for backward compatibility
        const mappedTickets = tickets.map(ticket => ({
            ...ticket,
            admin_name: ticket.creator_name || ticket.admin_name
        }));

        res.json({
            status: 'success',
            data: {
                tickets: mappedTickets
            }
        });
    } catch (error) {
        console.error('Error fetching tickets:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch tickets',
            error: error.message
        });
    }
};

// Update ticket status
const updateTicketStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, updated_by } = req.body;

        // Validate status
        const validStatuses = ['open', 'in_progress', 'resolved', 'closed'];
        if (!status || !validStatuses.includes(status)) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid status. Must be one of: open, in_progress, resolved, closed'
            });
        }

        // Update ticket status and updated_by
        const query = `
      UPDATE tickets 
      SET status = ?, 
          updated_by = ?,
          resolved_at = CASE WHEN ? IN ('resolved', 'closed') THEN NOW() ELSE resolved_at END
      WHERE ticket_id = ?
    `;

        const [result] = await db.query(query, [status, updated_by || null, status, id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({
                status: 'error',
                message: 'Ticket not found'
            });
        }

        const [tickets] = await db.query(
            `SELECT 
                t.*,
                a.name as admin_name,
                a.email as admin_email,
                i.name as intern_name,
                i.email as intern_email,
                ua.name as updated_by_name,
                ua.email as updated_by_email
            FROM tickets t
            LEFT JOIN admins a ON t.created_by = a.admin_id
            LEFT JOIN interns i ON t.intern_id = i.intern_id
            LEFT JOIN admins ua ON t.updated_by = ua.admin_id
            WHERE t.ticket_id = ?`,
            [id]
        );

        const ticket = tickets[0];
        if (ticket) {
            // Send notification to the ticket creator
            const creatorEmail = ticket.admin_email || ticket.intern_email;
            const creatorName = ticket.admin_name || ticket.intern_name;

            if (creatorEmail) {
                emailService.sendTicketNotification(
                    creatorEmail,
                    creatorName,
                    'Ticket Status Updated',
                    `Your ticket regarding "${ticket.subject}" has been updated to: ${status.toUpperCase()}.`,
                    { ticketId: ticket.ticket_id, subject: ticket.subject }
                ).catch(err => console.error(`Failed to notify creator ${creatorEmail}:`, err));
            }
        }

        res.json({
            status: 'success',
            message: 'Ticket status updated successfully',
            data: {
                ticket: tickets[0]
            }
        });
    } catch (error) {
        console.error('Error updating ticket status:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to update ticket status',
            error: error.message
        });
    }
};

// Get tickets by admin or intern
const getTicketsByAdmin = async (req, res) => {
    try {
        const { adminId } = req.params;

        // Query checks created_by (for admins) OR intern_id (for interns)
        const query = `
      SELECT * FROM tickets
      WHERE created_by = ? OR intern_id = ?
      ORDER BY created_at DESC
    `;

        const [tickets] = await db.query(query, [adminId, adminId]);

        res.json({
            status: 'success',
            data: {
                tickets
            }
        });
    } catch (error) {
        console.error('Error fetching tickets:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch tickets',
            error: error.message
        });
    }
};

// Add a reply to a ticket
const addReply = async (req, res) => {
    try {
        const { id } = req.params; // ticket_id
        const { user_type, user_id, message } = req.body;

        // Validate input
        if (!user_type || !user_id || !message) {
            return res.status(400).json({
                status: 'error',
                message: 'user_type, user_id, and message are required'
            });
        }

        // Validate user_type
        if (!['admin', 'intern'].includes(user_type)) {
            return res.status(400).json({
                status: 'error',
                message: 'user_type must be either "admin" or "intern"'
            });
        }

        // Check if ticket exists
        const [ticket] = await db.query('SELECT ticket_id FROM tickets WHERE ticket_id = ?', [id]);
        if (ticket.length === 0) {
            return res.status(404).json({
                status: 'error',
                message: 'Ticket not found'
            });
        }

        // Insert reply
        const [result] = await db.query(
            `INSERT INTO ticket_replies (ticket_id, user_type, user_id, message) VALUES (?, ?, ?, ?)`,
            [id, user_type, user_id, message]
        );

        const [replies] = await db.query(
            `SELECT 
                r.*,
                CASE 
                    WHEN r.user_type = 'admin' THEN a.name
                    WHEN r.user_type = 'intern' THEN i.name
                END as user_name,
                CASE 
                    WHEN r.user_type = 'admin' THEN a.email
                    WHEN r.user_type = 'intern' THEN i.email
                END as user_email
            FROM ticket_replies r
            LEFT JOIN admins a ON r.user_type = 'admin' AND r.user_id = a.admin_id
            LEFT JOIN interns i ON r.user_type = 'intern' AND r.user_id = i.intern_id
            WHERE r.reply_id = ?`,
            [result.insertId]
        );

        // Notify the ticket creator about the new reply
        const [ticketInfo] = await db.query(
            `SELECT 
                t.subject, 
                a.name as admin_name, a.email as admin_email,
                i.name as intern_name, i.email as intern_email
            FROM tickets t
            LEFT JOIN admins a ON t.created_by = a.admin_id
            LEFT JOIN interns i ON t.intern_id = i.intern_id
            WHERE t.ticket_id = ?`,
            [id]
        );

        if (ticketInfo.length > 0) {
            const creatorEmail = ticketInfo[0].admin_email || ticketInfo[0].intern_email;
            const creatorName = ticketInfo[0].admin_name || ticketInfo[0].intern_name;
            const reply = replies[0];

            // Only notify if the replier is NOT the creator
            if (creatorEmail && reply.user_email !== creatorEmail) {
                emailService.sendTicketNotification(
                    creatorEmail,
                    creatorName,
                    'New Reply on Your Ticket',
                    `${reply.user_name} replied: "${message.substring(0, 100)}${message.length > 100 ? '...' : ''}"`,
                    { ticketId: id, subject: ticketInfo[0].subject }
                ).catch(err => console.error(`Failed to notify creator ${creatorEmail}:`, err));
            }
        }

        res.status(201).json({
            status: 'success',
            message: 'Reply added successfully',
            data: {
                reply: replies[0]
            }
        });
    } catch (error) {
        console.error('Error adding reply:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to add reply',
            error: error.message
        });
    }
};

// Get all replies for a ticket
const getReplies = async (req, res) => {
    try {
        const { id } = req.params; // ticket_id

        const [replies] = await db.query(
            `SELECT 
                r.*,
                CASE 
                    WHEN r.user_type = 'admin' THEN a.name
                    WHEN r.user_type = 'intern' THEN i.name
                END as user_name,
                CASE 
                    WHEN r.user_type = 'admin' THEN a.email
                    WHEN r.user_type = 'intern' THEN i.email
                END as user_email
            FROM ticket_replies r
            LEFT JOIN admins a ON r.user_type = 'admin' AND r.user_id = a.admin_id
            LEFT JOIN interns i ON r.user_type = 'intern' AND r.user_id = i.intern_id
            WHERE r.ticket_id = ?
            ORDER BY r.created_at ASC`,
            [id]
        );

        res.json({
            status: 'success',
            data: {
                replies
            }
        });
    } catch (error) {
        console.error('Error fetching replies:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch replies',
            error: error.message
        });
    }
};

// Delete a ticket (Super Admin only)
const deleteTicket = async (req, res) => {
    try {
        const { id } = req.params;

        // Check if ticket exists and get image path
        const [tickets] = await db.query('SELECT image_path FROM tickets WHERE ticket_id = ?', [id]);

        if (tickets.length === 0) {
            return res.status(404).json({
                status: 'error',
                message: 'Ticket not found'
            });
        }

        const imagePath = tickets[0].image_path;

        // Delete associated image file if it exists
        if (imagePath) {
            const fullPath = path.join(__dirname, '..', imagePath);
            if (fs.existsSync(fullPath)) {
                fs.unlinkSync(fullPath);
            }
        }

        // Delete replies first due to potential foreign key constraints
        await db.query('DELETE FROM ticket_replies WHERE ticket_id = ?', [id]);

        // Delete the ticket
        await db.query('DELETE FROM tickets WHERE ticket_id = ?', [id]);

        res.json({
            status: 'success',
            message: 'Ticket and associated replies/files deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting ticket:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to delete ticket',
            error: error.message
        });
    }
};

module.exports = {
    upload,
    createTicket,
    getAllTickets,
    updateTicketStatus,
    getTicketsByAdmin,
    addReply,
    getReplies,
    deleteTicket
};

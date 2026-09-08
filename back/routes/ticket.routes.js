const express = require('express');
const router = express.Router();
const { upload, createTicket, getAllTickets, updateTicketStatus, getTicketsByAdmin, addReply, getReplies, deleteTicket } = require('../controllers/ticket.controller');
const { auth, requireSuperAdmin } = require('../middleware/auth');

// Apply authentication to all ticket routes
router.use(auth);

// Create a new ticket (with optional image upload)
router.post('/', upload.single('image'), createTicket);

// Get all tickets (for superadmin)
router.get('/', getAllTickets);

// Update ticket status
router.patch('/:id/status', updateTicketStatus);

// Get tickets by admin ID
router.get('/admin/:adminId', getTicketsByAdmin);

// Get replies for a ticket
router.get('/:id/replies', getReplies);

// Add a reply to a ticket
router.post('/:id/replies', addReply);

// Delete a ticket (Super Admin only)
router.delete('/:id', requireSuperAdmin, deleteTicket);

module.exports = router;


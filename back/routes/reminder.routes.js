const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const emailService = require('../services/emailService');
const db = require('../config/db');

// Send reminder to a single intern
router.post('/single', auth, async (req, res) => {
    try {
        const { internId, email, name, domain, daysInactive, lastActivityDate } = req.body;

        if (!email || !name) {
            return res.status(400).json({
                status: 'error',
                message: 'Email and name are required'
            });
        }

        const result = await emailService.sendStreakReminderEmail(
            email,
            name,
            domain || 'N/A',
            daysInactive || 0,
            lastActivityDate || null
        );

        if (result.success) {
            res.status(200).json({
                status: 'success',
                message: `Reminder sent to ${name}`,
                messageId: result.messageId
            });
        } else {
            res.status(500).json({
                status: 'error',
                message: 'Failed to send reminder',
                error: result.error
            });
        }
    } catch (error) {
        console.error('Single Reminder Error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to send reminder' });
    }
});

// Send reminder to multiple interns
router.post('/bulk', auth, async (req, res) => {
    try {
        const { interns } = req.body;

        if (!interns || !Array.isArray(interns) || interns.length === 0) {
            return res.status(400).json({
                status: 'error',
                message: 'Interns array is required'
            });
        }

        const results = {
            success: [],
            failed: []
        };

        for (const intern of interns) {
            try {
                const result = await emailService.sendStreakReminderEmail(
                    intern.email,
                    intern.name,
                    intern.domain || 'N/A',
                    intern.daysInactive || 0,
                    intern.lastActivityDate || null
                );

                if (result.success) {
                    results.success.push(intern.name);
                } else {
                    results.failed.push({ name: intern.name, error: result.error });
                }
            } catch (err) {
                results.failed.push({ name: intern.name, error: err.message });
            }
        }

        res.status(200).json({
            status: 'success',
            message: `Sent ${results.success.length} of ${interns.length} reminders`,
            data: results
        });
    } catch (error) {
        console.error('Bulk Reminder Error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to send bulk reminders' });
    }
});

module.exports = router;

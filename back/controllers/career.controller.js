const db = require('../config/careerDb');
const path = require('path');
const fs = require('fs');
const emailService = require('../services/emailService');

// ─── Role Management ──────────────────────────────────────────────────────────

exports.getRoles = async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT id, name, icon, is_active, sort_order FROM career_roles ORDER BY sort_order ASC, id ASC'
        );
        res.status(200).json({ success: true, data: rows });
    } catch (error) {
        console.error('Error fetching roles:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch roles', error: error.message });
    }
};

exports.createRole = async (req, res) => {
    try {
        const { name, icon, is_active, sort_order } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ success: false, message: 'Role name is required' });
        }

        // Get max sort_order for appending
        const [[{ maxOrder }]] = await db.query('SELECT COALESCE(MAX(sort_order), 0) as maxOrder FROM career_roles');

        const [result] = await db.query(
            'INSERT INTO career_roles (name, icon, is_active, sort_order) VALUES (?, ?, ?, ?)',
            [name.trim(), icon || '💼', is_active !== false ? 1 : 0, sort_order ?? maxOrder + 1]
        );
        res.status(201).json({ success: true, message: 'Role created', data: { id: result.insertId } });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ success: false, message: 'A role with this name already exists' });
        }
        console.error('Error creating role:', error);
        res.status(500).json({ success: false, message: 'Failed to create role', error: error.message });
    }
};

exports.updateRole = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, icon, is_active } = req.body;

        const [existing] = await db.query('SELECT id FROM career_roles WHERE id = ?', [id]);
        if (existing.length === 0) {
            return res.status(404).json({ success: false, message: 'Role not found' });
        }

        await db.query(
            'UPDATE career_roles SET name = ?, icon = ?, is_active = ? WHERE id = ?',
            [name.trim(), icon || '💼', is_active ? 1 : 0, id]
        );
        res.status(200).json({ success: true, message: 'Role updated' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ success: false, message: 'A role with this name already exists' });
        }
        console.error('Error updating role:', error);
        res.status(500).json({ success: false, message: 'Failed to update role', error: error.message });
    }
};

exports.deleteRole = async (req, res) => {
    try {
        const { id } = req.params;

        const [existing] = await db.query('SELECT id FROM career_roles WHERE id = ?', [id]);
        if (existing.length === 0) {
            return res.status(404).json({ success: false, message: 'Role not found' });
        }

        await db.query('DELETE FROM career_roles WHERE id = ?', [id]);
        res.status(200).json({ success: true, message: 'Role deleted' });
    } catch (error) {
        console.error('Error deleting role:', error);
        res.status(500).json({ success: false, message: 'Failed to delete role', error: error.message });
    }
};

exports.reorderRoles = async (req, res) => {
    try {
        // Expects: [{ id: 1, sort_order: 0 }, { id: 3, sort_order: 1 }, ...]
        const { order } = req.body;
        if (!Array.isArray(order)) {
            return res.status(400).json({ success: false, message: 'order must be an array of {id, sort_order}' });
        }

        for (const item of order) {
            await db.query('UPDATE career_roles SET sort_order = ? WHERE id = ?', [item.sort_order, item.id]);
        }
        res.status(200).json({ success: true, message: 'Roles reordered' });
    } catch (error) {
        console.error('Error reordering roles:', error);
        res.status(500).json({ success: false, message: 'Failed to reorder roles', error: error.message });
    }
};

// ─── Applicants ───────────────────────────────────────────────────────────────

exports.getApplicants = async (req, res) => {
    try {
        const { status, batch } = req.query;
        let query = `
            SELECT
                id, application_id, name, email, whatsapp_number,
                role, user_type, status, hiring_batch,
                country, state, district,
                institution, department, current_year, year_of_passing, student_location,
                company_name, designation, experience_years, company_location, skill_area,
                github_url, linkedin_url, why_choose_kkr, why_hire_you,
                gender, dob, formal_photo_path, resume_path,
                created_at
            FROM interns
            WHERE 1=1
        `;
        const params = [];

        if (status && status !== 'all') {
            query += ' AND status = ?';
            params.push(status);
        }

        if (batch && batch !== 'all') {
            query += ' AND hiring_batch = ?';
            params.push(batch);
        }

        query += ' ORDER BY created_at DESC';

        const [rows] = await db.query(query, params);

        res.status(200).json({ success: true, data: rows });
    } catch (error) {
        console.error('Error fetching applicants:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch applicants', error: error.message });
    }
};

exports.getApplicantBatches = async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT DISTINCT hiring_batch FROM interns
             WHERE hiring_batch IS NOT NULL AND hiring_batch != ''
             ORDER BY hiring_batch DESC`
        );
        const batches = rows.map(r => r.hiring_batch);
        res.status(200).json({ success: true, data: batches });
    } catch (error) {
        console.error('Error fetching batches:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch batches', error: error.message });
    }
};

exports.submitCareerApplication = async (req, res) => {
    console.log('========== CAREER APPLICATION SUBMISSION START ==========');
    console.log('Timestamp:', new Date().toISOString());

    // SECURITY: Check application status BEFORE processing any files
    try {
        const [settingsRows] = await db.query('SELECT is_application_open FROM admin_settings ORDER BY id DESC LIMIT 1');
        const isOpen = settingsRows.length === 0 ? false : !!settingsRows[0].is_application_open;

        if (!isOpen) {
            console.log('REJECTED: Applications are currently closed');
            return res.status(403).json({
                success: false,
                message: 'Applications are currently closed. Please check back later.',
                error: 'APPLICATIONS_CLOSED'
            });
        }
    } catch (statusError) {
        console.error('Failed to verify application status:', statusError.message);
        return res.status(503).json({
            success: false,
            message: 'Unable to verify application status. Please try again later.',
            error: 'STATUS_CHECK_FAILED'
        });
    }

    // Schema Fix: Ensure id AUTO_INCREMENT
    try {
        try { await db.query('ALTER TABLE interns ADD PRIMARY KEY (id)'); } catch (pkError) { /* ignore */ }
        await db.query('ALTER TABLE interns MODIFY id INT AUTO_INCREMENT');
    } catch (schemaError) {
        console.log('DB Schema Check Note:', schemaError.message);
    }

    try {
        console.log('Step 1: Extracting form data from request body');
        const {
            name, email, whatsappNumber,
            country, state, district,
            userType,
            institution, department, year, yearOfPassing, studentLocation,
            companyName, designation, experienceYears, companyLocation, skillArea,
            role, githubUrl, linkedinUrl, whyChooseKKR, whyHireYou,
            gender, dateOfBirth
        } = req.body;

        console.log('Step 2: Basic applicant info:', { name, email, role, userType });

        // Generate Application ID
        const randomNum = Math.floor(1000 + Math.random() * 9000);
        const timestampSuffix = Date.now().toString().slice(-4);
        const applicationId = `KKR-C${randomNum}${timestampSuffix}`;
        console.log('Generated Application ID:', applicationId);

        // Get file paths
        const resumePath = req.files?.resume?.[0] ? `/uploads/resumes/${req.files.resume[0].filename}` : 'Not Provided';
        const formalPhotoPath = req.files?.formalPhoto?.[0] ? `/uploads/resumes/${req.files.formalPhoto[0].filename}` : 'Not Provided';

        // Check duplicate email
        const [existingUser] = await db.query('SELECT id FROM interns WHERE email = ?', [email]);
        if (existingUser.length > 0) {
            if (req.files?.resume?.[0]) {
                const p = path.join(__dirname, '..', 'uploads', 'resumes', req.files.resume[0].filename);
                if (fs.existsSync(p)) fs.unlinkSync(p);
            }
            if (req.files?.formalPhoto?.[0]) {
                const p = path.join(__dirname, '..', 'uploads', 'resumes', req.files.formalPhoto[0].filename);
                if (fs.existsSync(p)) fs.unlinkSync(p);
            }
            return res.status(400).json({
                success: false,
                message: 'You have already registered with this email address',
                error: 'EMAIL_ALREADY_EXISTS'
            });
        }

        // Get current batch name from settings
        const [settingsForBatch] = await db.query('SELECT batch_name FROM admin_settings ORDER BY id DESC LIMIT 1');
        const hiringBatch = settingsForBatch.length > 0 ? (settingsForBatch[0].batch_name || null) : null;

        // Insert into database
        const query = `
            INSERT INTO interns (
                application_id,
                name, email, whatsapp_number,
                country, state, district,
                user_type,
                institution, department, current_year, year_of_passing, student_location,
                company_name, designation, experience_years, company_location, skill_area,
                role, github_url, linkedin_url, why_choose_kkr,
                why_hire_you, gender, dob, formal_photo_path, resume_path,
                hiring_batch
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const values = [
            applicationId,
            name, email, whatsappNumber,
            country, state, district,
            userType || 'Intern',
            institution || null, department || null, year || null, yearOfPassing || null, studentLocation || null,
            companyName || null, designation || null, experienceYears || null, companyLocation || null, skillArea || null,
            role, githubUrl || null, linkedinUrl, whyChooseKKR,
            whyHireYou, gender, dateOfBirth, formalPhotoPath, resumePath,
            hiringBatch
        ];

        const [result] = await db.query(query, values);
        console.log('Database insert successful. Insert ID:', result.insertId);

        // Send confirmation email
        try {
            await emailService.sendApplicationReceivedEmail(email, name, {
                role,
                userType: userType || 'Intern',
                applicationId
            });
        } catch (emailError) {
            console.error('Failed to send confirmation email:', emailError.message);
        }

        // Send admin notification
        try {
            await emailService.sendApplicationNotificationToAdmin({
                name, email, whatsapp_number: whatsappNumber,
                country, state, district,
                role, user_type: userType || 'Intern',
                institution, department, current_year: year,
                company_name: companyName, designation,
                why_hire_you: whyHireYou
            });
        } catch (adminEmailError) {
            console.error('Failed to send admin notification:', adminEmailError.message);
        }

        res.status(201).json({
            success: true,
            message: 'Application submitted successfully',
            applicationId: result.insertId
        });

        console.log('========== CAREER APPLICATION SUBMISSION SUCCESS ==========');

    } catch (error) {
        console.error('========== CRITICAL ERROR IN CAREER SUBMISSION ==========');
        console.error('Error:', error.message);

        if (req.files?.resume?.[0]) {
            const p = path.join(__dirname, '..', 'uploads', 'resumes', req.files.resume[0].filename);
            if (fs.existsSync(p)) fs.unlinkSync(p);
        }
        if (req.files?.formalPhoto?.[0]) {
            const p = path.join(__dirname, '..', 'uploads', 'resumes', req.files.formalPhoto[0].filename);
            if (fs.existsSync(p)) fs.unlinkSync(p);
        }

        res.status(500).json({ success: false, message: 'Failed to submit application', error: error.message });
    }
};

// ─── Admin Settings ───────────────────────────────────────────────────────────

exports.getAdminSettings = async (req, res) => {
    try {
        const [results] = await db.query(
            `SELECT is_application_open, application_deadline, shortlisting_date,
                    interview_start_date, interview_end_date, notes, batch_name
             FROM admin_settings ORDER BY id DESC LIMIT 1`
        );

        if (results.length === 0) {
            return res.status(200).json({
                success: true,
                data: {
                    isApplicationOpen: false,
                    applicationDeadline: null,
                    shortlistingDate: null,
                    interviewStartDate: null,
                    interviewEndDate: null,
                    notes: '',
                    batchName: null
                }
            });
        }

        const s = results[0];
        res.status(200).json({
            success: true,
            data: {
                isApplicationOpen: !!s.is_application_open,
                applicationDeadline: s.application_deadline,
                shortlistingDate: s.shortlisting_date,
                interviewStartDate: s.interview_start_date,
                interviewEndDate: s.interview_end_date,
                notes: s.notes,
                batchName: s.batch_name
            }
        });
    } catch (error) {
        console.error('Error fetching admin settings:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch admin settings', error: error.message });
    }
};

exports.updateAdminSettings = async (req, res) => {
    try {
        const {
            isApplicationOpen,
            applicationDeadline,
            shortlistingDate,
            interviewStartDate,
            interviewEndDate,
            notes,
            batchName
        } = req.body;

        const [existing] = await db.query('SELECT id FROM admin_settings LIMIT 1');

        let query, values;

        if (existing.length > 0) {
            query = `
                UPDATE admin_settings SET
                    is_application_open = ?,
                    application_deadline = ?,
                    shortlisting_date = ?,
                    interview_start_date = ?,
                    interview_end_date = ?,
                    notes = ?,
                    batch_name = ?
                WHERE id = ?
            `;
            values = [
                isApplicationOpen ? 1 : 0,
                applicationDeadline || null,
                shortlistingDate || null,
                interviewStartDate || null,
                interviewEndDate || null,
                notes || '',
                batchName || null,
                existing[0].id
            ];
        } else {
            query = `
                INSERT INTO admin_settings (
                    is_application_open, application_deadline, shortlisting_date,
                    interview_start_date, interview_end_date, notes, batch_name
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            `;
            values = [
                isApplicationOpen ? 1 : 0,
                applicationDeadline || null,
                shortlistingDate || null,
                interviewStartDate || null,
                interviewEndDate || null,
                notes || '',
                batchName || null
            ];
        }

        await db.query(query, values);

        res.status(200).json({
            success: true,
            message: 'Admin settings updated successfully',
            data: { isApplicationOpen, applicationDeadline, shortlistingDate, interviewStartDate, interviewEndDate, notes, batchName }
        });
    } catch (error) {
        console.error('Error updating admin settings:', error);
        res.status(500).json({ success: false, message: 'Failed to update admin settings', error: error.message });
    }
};

// ─── Applicant Status / Email / Interview ─────────────────────────────────────

exports.updateApplicantStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const validStatuses = ['pending', 'shortlisted', 'scheduled', 'selected', 'rejected'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status' });
        }

        const [applicant] = await db.query(
            'SELECT id, name, email, role, user_type, application_id FROM interns WHERE id = ?', [id]
        );
        if (applicant.length === 0) {
            return res.status(404).json({ success: false, message: 'Applicant not found' });
        }

        await db.query('UPDATE interns SET status = ? WHERE id = ?', [status, id]);

        res.status(200).json({ success: true, message: `Applicant status updated to ${status}`, data: { id, status } });
    } catch (error) {
        console.error('Error updating applicant status:', error);
        res.status(500).json({ success: false, message: 'Failed to update applicant status', error: error.message });
    }
};

exports.sendStatusEmail = async (req, res) => {
    try {
        const { id } = req.params;
        const [applicant] = await db.query(
            'SELECT id, name, email, role, user_type, application_id, status FROM interns WHERE id = ?', [id]
        );
        if (applicant.length === 0) {
            return res.status(404).json({ success: false, message: 'Applicant not found' });
        }

        const app = applicant[0];
        const result = await emailService.sendStatusNotification(app.email, app.name, app.status, {
            role: app.role,
            userType: app.user_type,
            applicationId: app.application_id
        });

        if (result.success) {
            res.status(200).json({ success: true, message: `Email sent to ${app.email} for status: ${app.status}` });
        } else {
            res.status(500).json({ success: false, message: result.error || 'Failed to send email' });
        }
    } catch (error) {
        console.error('Error sending status email:', error);
        res.status(500).json({ success: false, message: 'Failed to send email', error: error.message });
    }
};

exports.scheduleInterview = async (req, res) => {
    try {
        const { id } = req.params;
        const { interviewDate, interviewTime, interviewLocation, feedback } = req.body;

        if (!interviewDate || !interviewTime || !interviewLocation) {
            return res.status(400).json({ success: false, message: 'Interview date, time, and location are required' });
        }

        const [applicant] = await db.query(
            'SELECT id, name, email, role, user_type, application_id FROM interns WHERE id = ?', [id]
        );
        if (applicant.length === 0) {
            return res.status(404).json({ success: false, message: 'Applicant not found' });
        }

        const appData = applicant[0];
        await db.query("UPDATE interns SET status = 'scheduled' WHERE id = ?", [id]);

        try {
            await emailService.sendInterviewScheduledEmail(appData.email, appData.name, {
                role: appData.role,
                userType: appData.user_type,
                applicationId: appData.application_id,
                interviewDate,
                interviewTime,
                interviewLocation,
                feedback
            });
        } catch (emailError) {
            console.error('Failed to send interview scheduling email:', emailError);
        }

        res.status(200).json({ success: true, message: 'Interview scheduled successfully', data: { id, status: 'scheduled' } });
    } catch (error) {
        console.error('Error scheduling interview:', error);
        res.status(500).json({ success: false, message: 'Failed to schedule interview', error: error.message });
    }
};

exports.getApplicantStats = async (req, res) => {
    try {
        const { batch } = req.query;
        let whereClause = '';
        const params = [];

        if (batch && batch !== 'all') {
            whereClause = 'WHERE hiring_batch = ?';
            params.push(batch);
        }

        const [results] = await db.query(
            `SELECT
                COUNT(*) as total,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN status = 'shortlisted' THEN 1 ELSE 0 END) as shortlisted,
                SUM(CASE WHEN status = 'scheduled' THEN 1 ELSE 0 END) as scheduled,
                SUM(CASE WHEN status = 'selected' THEN 1 ELSE 0 END) as selected,
                SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected
             FROM interns ${whereClause}`,
            params
        );

        const stats = results[0];
        res.status(200).json({
            success: true,
            data: {
                total: parseInt(stats.total) || 0,
                pending: parseInt(stats.pending) || 0,
                shortlisted: parseInt(stats.shortlisted) || 0,
                scheduled: parseInt(stats.scheduled) || 0,
                selected: parseInt(stats.selected) || 0,
                rejected: parseInt(stats.rejected) || 0
            }
        });
    } catch (error) {
        console.error('Error fetching applicant stats:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch applicant statistics', error: error.message });
    }
};

exports.deleteApplicant = async (req, res) => {
    try {
        const { id } = req.params;
        const [applicant] = await db.query('SELECT id, resume_path, formal_photo_path FROM interns WHERE id = ?', [id]);

        if (applicant.length === 0) {
            return res.status(404).json({ success: false, message: 'Applicant not found' });
        }

        const appData = applicant[0];

        if (appData.resume_path && appData.resume_path !== 'Not Provided') {
            const p = path.join(__dirname, '..', appData.resume_path);
            if (fs.existsSync(p)) fs.unlinkSync(p);
        }
        if (appData.formal_photo_path && appData.formal_photo_path !== 'Not Provided') {
            const p = path.join(__dirname, '..', appData.formal_photo_path);
            if (fs.existsSync(p)) fs.unlinkSync(p);
        }

        await db.query('DELETE FROM interns WHERE id = ?', [id]);

        res.status(200).json({ success: true, message: 'Applicant deleted successfully' });
    } catch (error) {
        console.error('Error deleting applicant:', error);
        res.status(500).json({ success: false, message: 'Failed to delete applicant', error: error.message });
    }
};

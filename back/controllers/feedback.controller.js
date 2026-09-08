const db = require('../config/feedbackDb');
const nodemailer = require('nodemailer');

// Zoho SMTP transporter
const transporter = nodemailer.createTransport({
    host: process.env.ZOHO_SMTP_HOST,
    port: parseInt(process.env.ZOHO_SMTP_PORT, 10),
    secure: true,
    auth: {
        user: process.env.ZOHO_EMAIL,
        pass: process.env.ZOHO_PASSWORD
    }
});

// ─── Submit Feedback ───
exports.submitFeedback = async (req, res) => {
    try {
        const {
            full_name, email, mobile, institution, location, designation,
            how_know_kkr, association, overall_rating,
            what_you_liked, improvements, focus_areas, advice,
            interests, testimonial, testimonial_public
        } = req.body;

        // Validate required fields
        if (!full_name || !email || !mobile) {
            return res.status(400).json({
                status: 'error',
                message: 'Full Name, Email, and Mobile Number are required.'
            });
        }

        // Photo path
        const photo_path = req.file ? req.file.filename : null;

        // Auto-tag leads
        let lead_tag = null;
        try {
            const interestsArr = JSON.parse(interests || '[]');
            if (interestsArr.includes('Investing in KKR')) {
                lead_tag = 'hot_lead';
            } else if (interestsArr.includes('Industrial Projects') || interestsArr.includes('Buying Robotics Solutions')) {
                lead_tag = 'business_lead';
            }
        } catch (e) {
            // interests not valid JSON, ignore
        }

        // Insert into database
        const [result] = await db.execute(
            `INSERT INTO kkr_feedback (
                full_name, email, mobile, institution, location, designation,
                how_know_kkr, association_type, overall_rating, what_you_liked,
                improvements, focus_areas, advice, interests, photo_path,
                testimonial, testimonial_public, lead_tag
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                full_name, email, mobile,
                institution || null, location || null, designation || null,
                how_know_kkr || null, association || null,
                parseInt(overall_rating) || null,
                what_you_liked || null, improvements || null,
                focus_areas || null, advice || null, interests || null,
                photo_path, testimonial || null,
                testimonial_public === '1' || testimonial_public === true ? 1 : 0,
                lead_tag
            ]
        );

        // Send email notification to team
        try {
            const starDisplay = '★'.repeat(parseInt(overall_rating) || 0) + '☆'.repeat(5 - (parseInt(overall_rating) || 0));
            let focusStr = '';
            let interestStr = '';
            try { focusStr = JSON.parse(focus_areas || '[]').join(', '); } catch(e) {}
            try { interestStr = JSON.parse(interests || '[]').join(', '); } catch(e) {}

            const leadBadge = lead_tag === 'hot_lead'
                ? '<span style="background:#dc2626;color:#fff;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;">🔥 HOT LEAD</span>'
                : lead_tag === 'business_lead'
                ? '<span style="background:#2563eb;color:#fff;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;">💼 BUSINESS LEAD</span>'
                : '';

            const emailHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
                body{font-family:'Segoe UI',Arial,sans-serif;background:#f1f5f9;margin:0;padding:20px}
                .c{max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.08)}
                .h{background:linear-gradient(135deg,#0f172a,#1e293b);padding:30px;text-align:center;border-bottom:4px solid #16a34a}
                .h h1{color:#fff;margin:0 0 4px;font-size:22px}
                .h p{color:#94a3b8;margin:0;font-size:13px}
                .b{padding:30px}
                .sec{margin-bottom:20px}
                .sec-t{font-size:14px;font-weight:700;color:#16a34a;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;border-bottom:1px solid #e2e8f0;padding-bottom:6px}
                .r{display:flex;margin-bottom:6px;font-size:14px}
                .l{width:160px;color:#64748b;font-weight:600}
                .v{color:#0f172a;flex:1}
                .stars{color:#f59e0b;font-size:18px;letter-spacing:2px}
                .lead{margin:12px 0}
                .f{background:#0f172a;padding:20px;text-align:center;color:#64748b;font-size:11px}
            </style></head><body><div class="c">
                <div class="h">
                    <h1>🎉 KKR Turns 2 — New Feedback</h1>
                    <p>A new response was submitted on the anniversary page</p>
                </div>
                <div class="b">
                    ${leadBadge ? `<div class="lead">${leadBadge}</div>` : ''}
                    <div class="sec">
                        <div class="sec-t">Personal Details</div>
                        <div class="r"><div class="l">Name:</div><div class="v">${full_name}</div></div>
                        <div class="r"><div class="l">Email:</div><div class="v">${email}</div></div>
                        <div class="r"><div class="l">Mobile:</div><div class="v">${mobile}</div></div>
                        ${institution ? `<div class="r"><div class="l">Institution:</div><div class="v">${institution}</div></div>` : ''}
                        ${location ? `<div class="r"><div class="l">Location:</div><div class="v">${location}</div></div>` : ''}
                        ${designation ? `<div class="r"><div class="l">Designation:</div><div class="v">${designation}</div></div>` : ''}
                    </div>
                    <div class="sec">
                        <div class="sec-t">Connection</div>
                        ${how_know_kkr ? `<div class="r"><div class="l">How they know KKR:</div><div class="v">${how_know_kkr}</div></div>` : ''}
                        ${association ? `<div class="r"><div class="l">Association:</div><div class="v">${association}</div></div>` : ''}
                    </div>
                    <div class="sec">
                        <div class="sec-t">Feedback</div>
                        <div class="r"><div class="l">Rating:</div><div class="v"><span class="stars">${starDisplay}</span></div></div>
                        ${what_you_liked ? `<div class="r"><div class="l">What they liked:</div><div class="v">${what_you_liked}</div></div>` : ''}
                        ${improvements ? `<div class="r"><div class="l">Improvements:</div><div class="v">${improvements}</div></div>` : ''}
                    </div>
                    ${focusStr || advice ? `<div class="sec">
                        <div class="sec-t">Future & Expectations</div>
                        ${focusStr ? `<div class="r"><div class="l">Focus areas:</div><div class="v">${focusStr}</div></div>` : ''}
                        ${advice ? `<div class="r"><div class="l">Advice:</div><div class="v">${advice}</div></div>` : ''}
                    </div>` : ''}
                    ${interestStr ? `<div class="sec">
                        <div class="sec-t">Interests</div>
                        <div class="r"><div class="l">Interested in:</div><div class="v">${interestStr}</div></div>
                    </div>` : ''}
                    ${testimonial ? `<div class="sec">
                        <div class="sec-t">Testimonial</div>
                        <div class="r"><div class="v" style="font-style:italic">"${testimonial}"</div></div>
                        <div class="r"><div class="l">Public use:</div><div class="v">${testimonial_public === '1' || testimonial_public === true ? 'Yes ✅' : 'No ❌'}</div></div>
                    </div>` : ''}
                </div>
                <div class="f">© ${new Date().getFullYear()} Karthikesh Robotics Pvt Ltd · Automated Notification</div>
            </div></body></html>`;

            await transporter.sendMail({
                from: `"KKR Anniversary Feedback" <${process.env.ZOHO_EMAIL}>`,
                to: 'team@karthikeshrobotics.in',
                subject: `🎉 New Feedback: ${full_name}${lead_tag ? (lead_tag === 'hot_lead' ? ' [🔥 HOT LEAD]' : ' [💼 BIZ LEAD]') : ''}`,
                html: emailHtml
            });
            console.log('📧 Feedback notification email sent for:', full_name);
        } catch (emailErr) {
            console.error('⚠️ Email notification failed (feedback saved):', emailErr.message);
        }

        res.status(201).json({
            status: 'success',
            message: 'Thank you for your feedback. You are part of KKR\'s journey 🚀',
            data: { id: result.insertId }
        });
    } catch (error) {
        console.error('❌ Feedback submission error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to submit feedback. Please try again.'
        });
    }
};

// ─── Get All Feedback (Admin) ───
exports.getAllFeedback = async (req, res) => {
    try {
        const [rows] = await db.execute(
            'SELECT * FROM kkr_feedback ORDER BY created_at DESC'
        );
        res.json({ status: 'success', data: rows });
    } catch (error) {
        console.error('Error fetching feedback:', error);
        res.status(500).json({ status: 'error', message: 'Failed to fetch feedback.' });
    }
};

// ─── Get Feedback Stats (Admin) ───
exports.getFeedbackStats = async (req, res) => {
    try {
        const [total] = await db.execute('SELECT COUNT(*) as count FROM kkr_feedback');
        const [hotLeads] = await db.execute("SELECT COUNT(*) as count FROM kkr_feedback WHERE lead_tag = 'hot_lead'");
        const [bizLeads] = await db.execute("SELECT COUNT(*) as count FROM kkr_feedback WHERE lead_tag = 'business_lead'");
        const [avgRating] = await db.execute('SELECT AVG(overall_rating) as avg FROM kkr_feedback WHERE overall_rating > 0');

        res.json({
            status: 'success',
            data: {
                total: total[0].count,
                hot_leads: hotLeads[0].count,
                business_leads: bizLeads[0].count,
                avg_rating: parseFloat(avgRating[0].avg || 0).toFixed(1)
            }
        });
    } catch (error) {
        console.error('Error fetching feedback stats:', error);
        res.status(500).json({ status: 'error', message: 'Failed to fetch stats.' });
    }
};

require('dotenv').config({ path: '../.env' });
const nodemailer = require('nodemailer');

// Create Zoho SMTP transporter
const transporter = nodemailer.createTransport({
    host: process.env.ZOHO_SMTP_HOST,
    port: parseInt(process.env.ZOHO_SMTP_PORT, 10),
    secure: true,
    auth: {
        user: process.env.ZOHO_EMAIL,
        pass: process.env.ZOHO_PASSWORD
    }
});

// Verify transporter configuration
transporter.verify((error, success) => {
    if (error) {
        console.error('Zoho Mail configuration error:', error);
    } else {
        console.log('Zoho Mail server is ready to send emails');
    }
});

// Professional Email Template
const createEmailTemplate = (name, title, message, details, type = 'success') => {
    const colors = {
        success: { primary: '#16a34a', accent: '#dcfce7', dark: '#166534' },
        info: { primary: '#2563eb', accent: '#dbeafe', dark: '#1e40af' }
    };
    const theme = colors[type] || colors.success;

    // Use provided application ID or generate a fallback
    const applicationId = details.applicationId || `KKR-TEMP${Math.floor(Math.random() * 10000)}`;

    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Karthikesh Robotics</title><style>body{font-family:'Segoe UI',Arial,sans-serif;background-color:#f8fafc;margin:0;padding:0}.email-wrapper{max-width:600px;margin:40px auto;background:#ffffff;box-shadow:0 4px 6px rgba(0,0,0,0.1);border-radius:8px;overflow:hidden}.email-header{background:linear-gradient(135deg,#1e293b 0%,#334155 100%);padding:30px;text-align:center;border-bottom:4px solid ${theme.primary}}.company-name{font-size:24px;font-weight:bold;color:#ffffff;margin-bottom:5px}.company-subtitle{font-size:14px;color:#cbd5e1}.email-body{padding:40px 30px;color:#334155}.greeting{font-size:18px;margin-bottom:20px;font-weight:600}.status-banner{background:${theme.accent};border-left:5px solid ${theme.primary};padding:20px;margin-bottom:25px;border-radius:4px}.status-title{font-size:20px;font-weight:bold;color:${theme.dark};margin-bottom:5px}.message-text{line-height:1.6;margin-bottom:20px;font-size:15px}.info-box{background:#f1f5f9;padding:20px;border-radius:6px;margin:25px 0}.info-item{margin-bottom:10px;font-size:14px}.info-label{font-weight:600;color:#475569;width:140px;display:inline-block}.app-id{color:#2563eb;font-weight:700;font-size:16px}.footer{background:#0f172a;padding:30px;text-align:center;color:#94a3b8;font-size:12px}.footer-link{color:#cbd5e1;text-decoration:none;margin:0 10px}.feedback-box{background:#fff7ed;border:1px solid #fed7aa;padding:15px;border-radius:6px;margin:20px 0;font-style:italic;color:#9a3412}</style></head><body><div class="email-wrapper"><div class="email-header"><div class="company-name">Karthikesh Robotics</div><div class="company-subtitle">Innovating the Future with ROS</div></div><div class="email-body"><div class="greeting">Hello ${name},</div><div class="status-banner"><div class="status-title">${title}</div></div><div class="message-text">${message}</div>${details.feedback ? `<div class="feedback-box"><strong>Feedback:</strong> ${details.feedback}</div>` : ''}<div class="info-box"><div class="info-item"><span class="info-label">Application ID:</span> <span class="app-id">${applicationId}</span></div><div class="info-item"><span class="info-label">Position:</span> ${details.role}</div>${details.interviewDate ? `<div class="info-item"><span class="info-label">Interview Date:</span> ${details.interviewDate}</div>` : ''}${details.interviewTime ? `<div class="info-item"><span class="info-label">Interview Time:</span> ${details.interviewTime}</div>` : ''}${details.interviewLocation ? `<div class="info-item"><span class="info-label">Location/Link:</span> ${details.interviewLocation}</div>` : ''}<div class="info-item"><span class="info-label">Date:</span> ${new Date().toLocaleDateString()}</div></div><div class="message-text">Please keep your <strong>Application ID (${applicationId})</strong> for future reference.</div><div class="message-text">Thank you for choosing Karthikesh Robotics.</div></div><div class="footer"><p>&copy; ${new Date().getFullYear()} Karthikesh Robotics Pvt Ltd. All rights reserved.</p><p><a href="https://karthikeshrobotics.in" class="footer-link">Website</a> • <a href="https://linkedin.com/company/karthikeshrobotics" class="footer-link">LinkedIn</a> • <a href="mailto:team@karthikeshrobotics.in" class="footer-link">Contact</a></p></div></div></body></html>`;
};

const emailService = {
    sendApplicationReceivedEmail: async (toEmail, name, applicationDetails) => {
        try {
            const mailOptions = {
                from: `"Karthikesh Robotics Careers" <${process.env.ZOHO_EMAIL}>`,
                to: toEmail,
                subject: 'Application Received - Karthikesh Robotics',
                html: createEmailTemplate(name, 'Application Submitted Successfully', 'We have received your application for the position. Thank you for your interest in joining Karthikesh Robotics.', applicationDetails, 'success')
            };
            const info = await transporter.sendMail(mailOptions);
            console.log('Application email sent to ' + toEmail + ':', info.messageId);
            return { success: true, messageId: info.messageId };
        } catch (error) {
            console.error('Failed to send application email:', error);
            return { success: false, error: error.message };
        }
    },

    sendApplicationNotificationToAdmin: async (applicantData) => {
        try {
            const adminEmail = 'team@karthikeshrobotics.in';
            const adminTemplate = `<!DOCTYPE html><html lang="en"><head><style>body{font-family:'Segoe UI',Arial,sans-serif;background-color:#f8fafc;padding:20px}.container{max-width:600px;margin:0 auto;background:#ffffff;padding:30px;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1)}.header{border-bottom:2px solid #2563eb;padding-bottom:15px;margin-bottom:20px}.title{color:#1e293b;font-size:24px;font-weight:bold}.subtitle{color:#64748b;font-size:14px}.section{margin-bottom:20px}.section-title{font-weight:bold;color:#334155;margin-bottom:10px;border-bottom:1px solid #e2e8f0;padding-bottom:5px}.row{display:flex;margin-bottom:8px}.label{width:140px;color:#64748b;font-weight:500}.value{color:#0f172a;flex:1}.button{display:inline-block;background-color:#2563eb;color:#ffffff;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:500;margin-top:20px}.footer{margin-top:30px;font-size:12px;color:#94a3b8;text-align:center}</style></head><body><div class="container"><div class="header"><div class="title">New Career Application</div><div class="subtitle">A new candidate has applied via the career portal.</div></div><div class="section"><div class="section-title">Personal Details</div><div class="row"><div class="label">Name:</div><div class="value">${applicantData.name}</div></div><div class="row"><div class="label">Email:</div><div class="value">${applicantData.email}</div></div><div class="row"><div class="label">Phone:</div><div class="value">${applicantData.whatsapp_number}</div></div><div class="row"><div class="label">Location:</div><div class="value">${applicantData.district}, ${applicantData.state}, ${applicantData.country}</div></div></div><div class="section"><div class="section-title">Role & Background</div><div class="row"><div class="label">Role Applied:</div><div class="value">${applicantData.role}</div></div><div class="row"><div class="label">User Type:</div><div class="value">${applicantData.user_type}</div></div></div><div style="text-align: center;"><a href="https://admin.karthikeshrobotics.in/settings" class="button">View Full Application</a></div><div class="footer">This is an automated notification from the Karthikesh Robotics Career Portal.</div></div></body></html>`;
            const mailOptions = {
                from: `"KR Careers Notification" <${process.env.ZOHO_EMAIL}>`,
                to: adminEmail,
                subject: 'New Application: ' + applicantData.name + ' - ' + applicantData.role,
                html: adminTemplate
            };
            const info = await transporter.sendMail(mailOptions);
            console.log('Admin notification sent to ' + adminEmail + ':', info.messageId);
            return { success: true, messageId: info.messageId };
        } catch (error) {
            console.error('Failed to send admin notification:', error);
            return { success: false, error: error.message };
        }
    },

    sendShortlistedEmail: async (toEmail, name, applicationDetails) => {
        try {
            const mailOptions = {
                from: `"Karthikesh Robotics Careers" <${process.env.ZOHO_EMAIL}>`,
                to: toEmail,
                subject: 'Shortlisted for 1st Round - Karthikesh Robotics',
                html: createEmailTemplate(name, 'Congratulations! You are Shortlisted', 'We are pleased to inform you that your application has been shortlisted for the first round of interviews. Our team will contact you soon with the schedule.', applicationDetails, 'success')
            };
            const info = await transporter.sendMail(mailOptions);
            return { success: true, messageId: info.messageId };
        } catch (error) {
            console.error('Failed to send shortlisting email:', error);
            return { success: false, error: error.message };
        }
    },

    sendInterviewScheduledEmail: async (toEmail, name, applicationDetails) => {
        try {
            const mailOptions = {
                from: `"Karthikesh Robotics Careers" <${process.env.ZOHO_EMAIL}>`,
                to: toEmail,
                subject: 'Interview Scheduled - Karthikesh Robotics',
                html: createEmailTemplate(name, 'Interview Invitation', 'Your interview has been scheduled. Please find the details below. We look forward to speaking with you.', applicationDetails, 'info')
            };
            const info = await transporter.sendMail(mailOptions);
            return { success: true, messageId: info.messageId };
        } catch (error) {
            console.error('Failed to send interview email:', error);
            return { success: false, error: error.message };
        }
    },

    sendSelectionEmailWithFeedback: async (toEmail, name, applicationDetails) => {
        try {
            const mailOptions = {
                from: `"Karthikesh Robotics Careers" <${process.env.ZOHO_EMAIL}>`,
                to: toEmail,
                subject: 'Update on your Application - Karthikesh Robotics',
                html: createEmailTemplate(name, 'Application Status Update', 'We have completed our review of your application and interview. Please find the update and feedback below.', applicationDetails, 'success')
            };
            const info = await transporter.sendMail(mailOptions);
            return { success: true, messageId: info.messageId };
        } catch (error) {
            console.error('Failed to send selection email:', error);
            return { success: false, error: error.message };
        }
    },

    sendStreakReminderEmail: async (toEmail, name, domain, daysInactive, lastActivityDate) => {
        try {
            const lastActive = lastActivityDate ? new Date(lastActivityDate).toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : 'Some time ago';
            const days = daysInactive || 0;

            const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>Activity Update</title><style>:root{color-scheme:light dark}body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;background:#f8fafc;margin:0;padding:20px}.c{max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,.05)}.h{background:linear-gradient(135deg,#1e293b,#0f172a);padding:35px 30px;text-align:center;border-bottom:4px solid #f97316}.h h1{font-size:24px;font-weight:700;color:#fff;margin:0 0 6px}.h p{font-size:12px;color:#94a3b8;margin:0;text-transform:uppercase;letter-spacing:1.5px}.ct{padding:35px 30px}.g{font-size:18px;font-weight:600;color:#1e293b;margin:0 0 20px}.sb{background:#fef7f0;border:1px solid #fed7aa;border-radius:10px;padding:20px;margin-bottom:24px}.sr{display:flex;justify-content:space-between;align-items:center}.si{text-align:center;flex:1}.sl{font-size:11px;color:#9a3412;text-transform:uppercase;letter-spacing:.5px;margin:0 0 4px;font-weight:600}.sv{font-size:14px;font-weight:700;color:#7c2d12;margin:0}.svl{font-size:28px;color:#ea580c}.d{width:1px;height:40px;background:#fed7aa}.m{font-size:15px;line-height:1.7;color:#475569;margin:0 0 24px}.hl{background:#fef3c7;padding:2px 8px;border-radius:4px;font-weight:600;color:#92400e}.cb{text-align:center;padding:28px;background:linear-gradient(135deg,#f0fdf4,#dcfce7);border-radius:10px;margin-bottom:24px}.ct2{font-size:15px;font-weight:600;color:#166534;margin:0 0 16px}.btn{display:inline-block;background:linear-gradient(135deg,#16a34a,#15803d);color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-size:14px;font-weight:600}.sp{font-size:13px;color:#64748b;text-align:center;padding:20px 0;border-top:1px solid #e2e8f0;margin:0}.f{background:#0f172a;padding:28px 30px;text-align:center}.fl{font-size:15px;font-weight:700;color:#fff;margin:0 0 12px}.fk{margin:0 0 12px}.fa{color:#60a5fa;text-decoration:none;font-size:12px;margin:0 10px}.ft{font-size:11px;color:#64748b;margin:0;line-height:1.6}@media(prefers-color-scheme:dark){body{background:#0f172a}.c{background:#1e293b}.g{color:#f1f5f9}.m{color:#cbd5e1}.sb{background:#292524;border-color:#78350f}.sl{color:#fdba74}.sv{color:#fed7aa}.svl{color:#fb923c}.d{background:#78350f}.hl{background:#78350f;color:#fde68a}.cb{background:linear-gradient(135deg,#14532d,#166534)}.ct2{color:#bbf7d0}.sp{color:#94a3b8;border-top-color:#334155}}</style></head><body><div class="c"><div class="h"><h1>Karthikesh Robotics</h1><p>Internship Program</p></div><div class="ct"><p class="g">Hello ' + name + ',</p><div class="sb"><div class="sr"><div class="si"><p class="sl">Domain</p><p class="sv">' + domain + '</p></div><div class="d"></div><div class="si"><p class="sl">Last Activity</p><p class="sv">' + lastActive + '</p></div><div class="d"></div><div class="si"><p class="sl">Days Inactive</p><p class="sv svl">' + days + '</p></div></div></div><p class="m">We noticed that you have not been active on the internship platform recently. Your <span class="hl">streak has ended</span>, but it is never too late to get back on track.</p><p class="m">Consistent participation is key to making the most of this internship opportunity. Each task you complete helps you build real skills and stay engaged with your learning journey.</p><div class="cb"><p class="ct2">Ready to resume your progress?</p><a href="https://internship.karthikeshrobotics.in" class="btn">Open Dashboard</a></div><p class="sp">Need help? Reply to this email or reach out to your assigned mentor.</p></div><div class="f"><p class="fl">Karthikesh Robotics Pvt Ltd</p><div class="fk"><a href="https://karthikeshrobotics.in" class="fa">Website</a><a href="https://linkedin.com/company/karthikeshrobotics" class="fa">LinkedIn</a><a href="mailto:team@karthikeshrobotics.in" class="fa">Contact</a></div><p class="ft">This is an automated message from the internship management system.</p></div></div></body></html>';

            const mailOptions = {
                from: '"Karthikesh Robotics" <' + process.env.ZOHO_EMAIL + '>',
                to: toEmail,
                subject: 'Your Internship Activity Update - Karthikesh Robotics',
                html: html
            };

            const info = await transporter.sendMail(mailOptions);
            console.log('Reminder email sent to ' + toEmail + ':', info.messageId);
            return { success: true, messageId: info.messageId };
        } catch (error) {
            console.error('Failed to send reminder email:', error);
            return { success: false, error: error.message };
        }
    },

    sendStatusNotification: async (toEmail, name, status, details) => {
        try {
            const emailContent = {
                pending: {
                    subject: 'Application Under Review - Karthikesh Robotics',
                    title: 'Application Under Review',
                    message: `Thank you for applying to Karthikesh Robotics for the <strong>${details.role}</strong> position. Your application is currently under review by our team. We will get back to you shortly with an update.<br><br>For any questions or updates, please reach out to us at <a href="mailto:team@karthikeshrobotics.in">team@karthikeshrobotics.in</a>.`
                },
                shortlisted: {
                    subject: 'Congratulations! You are Shortlisted - Karthikesh Robotics',
                    title: '🎉 You Have Been Shortlisted!',
                    message: `We are excited to inform you that your application for <strong>${details.role}</strong> has been shortlisted! Our team was impressed with your profile and we would like to move forward with the next steps.<br><br>We will reach out to you soon with further details about the interview process. In the meantime, if you have any questions, feel free to contact us at <a href="mailto:team@karthikeshrobotics.in">team@karthikeshrobotics.in</a>.`
                },
                scheduled: {
                    subject: 'Interview Scheduled - Karthikesh Robotics',
                    title: '📅 Interview Scheduled',
                    message: `Your interview for the <strong>${details.role}</strong> position has been scheduled. Our team will share the specific date, time, and meeting details with you shortly.<br><br>Please keep an eye on your inbox for the interview link and instructions. For any queries, contact us at <a href="mailto:team@karthikeshrobotics.in">team@karthikeshrobotics.in</a>.`
                },
                selected: {
                    subject: 'Congratulations! You are Selected - Karthikesh Robotics',
                    title: '🎊 Congratulations! You Are Selected!',
                    message: `We are thrilled to inform you that you have been <strong>selected</strong> for the <strong>${details.role}</strong> position at Karthikesh Robotics! Welcome to our team.<br><br>Our team will reach out to you with the onboarding details and next steps. For any questions or to get started, contact us at <a href="mailto:team@karthikeshrobotics.in">team@karthikeshrobotics.in</a>.`
                },
                rejected: {
                    subject: 'Application Update - Karthikesh Robotics',
                    title: 'Application Update',
                    message: `Thank you for your interest in the <strong>${details.role}</strong> position at Karthikesh Robotics. After careful consideration, we regret to inform you that we will not be moving forward with your application at this time.<br><br>We encourage you to apply for future opportunities. If you'd like feedback or have questions, please reach out to us at <a href="mailto:team@karthikeshrobotics.in">team@karthikeshrobotics.in</a>.`
                }
            };

            const content = emailContent[status];
            if (!content) {
                return { success: false, error: `No email template for status: ${status}` };
            }

            const html = createEmailTemplate(name, content.title, content.message, details, status === 'rejected' ? 'info' : 'success');

            const mailOptions = {
                from: `"Karthikesh Robotics Careers" <${process.env.ZOHO_EMAIL}>`,
                to: toEmail,
                subject: content.subject,
                html: html
            };

            const info = await transporter.sendMail(mailOptions);
            console.log(`Status email (${status}) sent to ${toEmail}:`, info.messageId);
            return { success: true, messageId: info.messageId };
        } catch (error) {
            console.error('Failed to send status notification email:', error);
            return { success: false, error: error.message };
        }
    },

    sendProjectNotification: async (toEmail, name, title, message, projectDetails) => {
        try {
            const details = {
                role: projectDetails.title,
                applicationId: `PRJ-${projectDetails.id}`,
                ...projectDetails
            };

            const html = createEmailTemplate(name, title, message, details, 'info');

            const mailOptions = {
                from: `"Karthikesh Robotics Projects" <${process.env.ZOHO_EMAIL}>`,
                to: toEmail,
                subject: `Project Update: ${projectDetails.title}`,
                html: html
            };

            const info = await transporter.sendMail(mailOptions);
            console.log(`Project email sent to ${toEmail}:`, info.messageId);
            return { success: true, messageId: info.messageId };
        } catch (error) {
            console.error('Failed to send project notification email:', error);
            return { success: false, error: error.message };
        }
    },

    sendTicketNotification: async (toEmail, name, subject, message, ticketDetails) => {
        try {
            const details = {
                role: `Ticket #${ticketDetails.ticketId}`,
                applicationId: `TIC-${ticketDetails.ticketId}`,
                ...ticketDetails
            };

            const html = createEmailTemplate(name, subject, message, details, 'info');

            const mailOptions = {
                from: `"Karthikesh Robotics Support" <${process.env.ZOHO_EMAIL}>`,
                to: toEmail,
                subject: `Ticket Update: ${ticketDetails.subject}`,
                html: html
            };

            const info = await transporter.sendMail(mailOptions);
            console.log(`Ticket email sent to ${toEmail}:`, info.messageId);
            return { success: true, messageId: info.messageId };
        } catch (error) {
            console.error('Failed to send ticket notification email:', error);
            return { success: false, error: error.message };
        }
    },

    sendNotificationEmail: async (toEmail, name, notificationDetails) => {
        try {
            const details = {
                role: notificationDetails.type || 'Announcement',
                applicationId: `NOT-${Date.now()}`,
                ...notificationDetails
            };

            const html = createEmailTemplate(name, notificationDetails.title, notificationDetails.message, details, 'info');

            const mailOptions = {
                from: `"Karthikesh Robotics Notifications" <${process.env.ZOHO_EMAIL}>`,
                to: toEmail,
                subject: `New Notification: ${notificationDetails.title}`,
                html: html
            };

            const info = await transporter.sendMail(mailOptions);
            console.log(`Notification email sent to ${toEmail}:`, info.messageId);
            return { success: true, messageId: info.messageId };
        } catch (error) {
            console.error('Failed to send notification email:', error);
            return { success: false, error: error.message };
        }
    },

    // ── Calendar update notification ──────────────────────────────────────────
    sendCalendarUpdateEmail: async (toEmail, name, formattedDate, type, reason, adminName) => {
        try {
            const isLeave = type === 'leave';
            const color   = isLeave ? '#dc2626' : '#16a34a';
            const label   = isLeave ? 'Leave Day' : 'Working Day';
            const icon    = isLeave ? '🔴' : '🟢';
            const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Calendar Update</title>
<style>body{font-family:'Segoe UI',Arial,sans-serif;background:#f8fafc;margin:0;padding:20px}
.c{max-width:580px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,.08)}
.h{background:linear-gradient(135deg,#1e293b,#0f172a);padding:28px 30px;border-bottom:4px solid ${color}}
.ht{font-size:22px;font-weight:700;color:#fff;margin:0 0 4px}.hs{font-size:12px;color:#94a3b8;margin:0}
.b{padding:32px 30px}.g{font-size:17px;font-weight:600;color:#1e293b;margin:0 0 20px}
.card{background:${isLeave ? '#fef2f2' : '#f0fdf4'};border:2px solid ${color};border-radius:10px;padding:20px;text-align:center;margin-bottom:24px}
.ci{font-size:36px;margin-bottom:8px}.cl{font-size:13px;font-weight:700;color:${color};text-transform:uppercase;letter-spacing:1px;margin-bottom:6px}
.cv{font-size:18px;font-weight:800;color:#1e293b}.ib{background:#f8fafc;border-radius:8px;padding:16px;margin-bottom:20px}
.ir{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #e2e8f0;font-size:14px}
.ir:last-child{border-bottom:none}.il{color:#64748b;font-weight:500}.iv{color:#1e293b;font-weight:600}
.f{background:#0f172a;padding:22px 30px;text-align:center}
.ft{font-size:11px;color:#64748b;margin:0;line-height:1.6}</style></head>
<body><div class="c">
<div class="h"><div class="ht">Karthikesh Robotics</div><div class="hs">Internship Program — Calendar Update</div></div>
<div class="b"><p class="g">Hello ${name},</p>
<div class="card"><div class="ci">${icon}</div><div class="cl">${label}</div><div class="cv">${formattedDate}</div></div>
<div class="ib">
<div class="ir"><span class="il">Status</span><span class="iv" style="color:${color}">${label}</span></div>
<div class="ir"><span class="il">Reason</span><span class="iv">${reason}</span></div>
<div class="ir"><span class="il">Updated by</span><span class="iv">${adminName}</span></div>
</div>
<p style="font-size:14px;color:#475569;line-height:1.6">Please plan your schedule accordingly. If you have any questions, contact your admin.</p>
</div>
<div class="f"><p class="ft">&copy; ${new Date().getFullYear()} Karthikesh Robotics Pvt Ltd. All rights reserved.<br>
<a href="https://internship.karthikeshrobotics.in" style="color:#60a5fa;text-decoration:none">Open Dashboard</a></p></div>
</div></body></html>`;
            const info = await transporter.sendMail({
                from: `"Karthikesh Robotics" <${process.env.ZOHO_EMAIL}>`,
                to: toEmail,
                subject: `📅 Calendar Update: ${formattedDate} is a ${label}`,
                html,
            });
            console.log('Calendar update email sent to ' + toEmail + ':', info.messageId);
            return { success: true, messageId: info.messageId };
        } catch (error) {
            console.error('Failed to send calendar update email:', error);
            return { success: false, error: error.message };
        }
    },

    // ── EOD submission notification to admin ──────────────────────────────────
    sendEODNotificationEmail: async (toEmail, adminName, employeeName, eodTitle, date, progress) => {
        try {
            const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>EOD Update</title>
<style>body{font-family:'Segoe UI',Arial,sans-serif;background:#f8fafc;margin:0;padding:20px}
.c{max-width:580px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,.08)}
.h{background:linear-gradient(135deg,#1e293b,#0f172a);padding:28px 30px;border-bottom:4px solid #0ea5e9}
.ht{font-size:22px;font-weight:700;color:#fff;margin:0 0 4px}.hs{font-size:12px;color:#94a3b8;margin:0}
.b{padding:32px 30px}.g{font-size:17px;font-weight:600;color:#1e293b;margin:0 0 20px}
.badge{display:inline-block;background:#eff6ff;color:#2563eb;font-weight:700;font-size:12px;padding:4px 12px;border-radius:20px;letter-spacing:.5px;margin-bottom:20px}
.ib{background:#f8fafc;border-radius:8px;padding:16px;margin-bottom:20px}
.ir{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #e2e8f0;font-size:14px}
.ir:last-child{border-bottom:none}.il{color:#64748b;font-weight:500}.iv{color:#1e293b;font-weight:600}
.prog{height:8px;background:#e2e8f0;border-radius:4px;margin-top:4px;overflow:hidden}
.progb{height:100%;background:#0ea5e9;border-radius:4px}
.btn{display:inline-block;background:#0ea5e9;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;margin-top:8px}
.f{background:#0f172a;padding:22px 30px;text-align:center}
.ft{font-size:11px;color:#64748b;margin:0}</style></head>
<body><div class="c">
<div class="h"><div class="ht">Karthikesh Robotics</div><div class="hs">EOD Update Notification</div></div>
<div class="b"><p class="g">Hello ${adminName},</p>
<span class="badge">📋 New EOD Submission</span>
<div class="ib">
<div class="ir"><span class="il">Employee</span><span class="iv">${employeeName}</span></div>
<div class="ir"><span class="il">Title</span><span class="iv">${eodTitle}</span></div>
<div class="ir"><span class="il">Date</span><span class="iv">${date}</span></div>
<div class="ir"><span class="il">Progress</span><span class="iv">${progress}%</span></div>
</div>
<div class="prog"><div class="progb" style="width:${progress}%"></div></div>
<br><a href="https://admin.karthikeshrobotics.in" class="btn">View in Dashboard</a>
</div>
<div class="f"><p class="ft">&copy; ${new Date().getFullYear()} Karthikesh Robotics Pvt Ltd. All rights reserved.</p></div>
</div></body></html>`;
            const info = await transporter.sendMail({
                from: `"Karthikesh Robotics" <${process.env.ZOHO_EMAIL}>`,
                to: toEmail,
                subject: `📋 EOD Update from ${employeeName}: ${eodTitle}`,
                html,
            });
            console.log('EOD notification email sent to ' + toEmail + ':', info.messageId);
            return { success: true, messageId: info.messageId };
        } catch (error) {
            console.error('Failed to send EOD notification email:', error);
            return { success: false, error: error.message };
        }
    },

    // ── Project update notification to admin ──────────────────────────────────
    sendProjectUpdateEmail: async (toEmail, adminName, employeeName, projectTitle, updateDescription) => {
        try {
            const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Project Update</title>
<style>body{font-family:'Segoe UI',Arial,sans-serif;background:#f8fafc;margin:0;padding:20px}
.c{max-width:580px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,.08)}
.h{background:linear-gradient(135deg,#1e293b,#0f172a);padding:28px 30px;border-bottom:4px solid #7c3aed}
.ht{font-size:22px;font-weight:700;color:#fff;margin:0 0 4px}.hs{font-size:12px;color:#94a3b8;margin:0}
.b{padding:32px 30px}.g{font-size:17px;font-weight:600;color:#1e293b;margin:0 0 20px}
.badge{display:inline-block;background:#f5f3ff;color:#7c3aed;font-weight:700;font-size:12px;padding:4px 12px;border-radius:20px;letter-spacing:.5px;margin-bottom:20px}
.ib{background:#f8fafc;border-radius:8px;padding:16px;margin-bottom:20px}
.ir{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #e2e8f0;font-size:14px}
.ir:last-child{border-bottom:none}.il{color:#64748b;font-weight:500}.iv{color:#1e293b;font-weight:600}
.desc{background:#f8fafc;border-left:3px solid #7c3aed;padding:12px 16px;border-radius:0 8px 8px 0;font-size:14px;color:#334155;line-height:1.6;margin-bottom:20px}
.btn{display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600}
.f{background:#0f172a;padding:22px 30px;text-align:center}
.ft{font-size:11px;color:#64748b;margin:0}</style></head>
<body><div class="c">
<div class="h"><div class="ht">Karthikesh Robotics</div><div class="hs">Project Update Notification</div></div>
<div class="b"><p class="g">Hello ${adminName},</p>
<span class="badge">🚀 Project Update</span>
<div class="ib">
<div class="ir"><span class="il">Employee</span><span class="iv">${employeeName}</span></div>
<div class="ir"><span class="il">Project</span><span class="iv">${projectTitle}</span></div>
<div class="ir"><span class="il">Date</span><span class="iv">${new Date().toLocaleDateString('en-IN')}</span></div>
</div>
<p style="font-size:13px;color:#64748b;font-weight:600;margin:0 0 6px">Update Description:</p>
<div class="desc">${updateDescription}</div>
<a href="https://admin.karthikeshrobotics.in" class="btn">View in Dashboard</a>
</div>
<div class="f"><p class="ft">&copy; ${new Date().getFullYear()} Karthikesh Robotics Pvt Ltd. All rights reserved.</p></div>
</div></body></html>`;
            const info = await transporter.sendMail({
                from: `"Karthikesh Robotics" <${process.env.ZOHO_EMAIL}>`,
                to: toEmail,
                subject: `🚀 Project Update: ${projectTitle} by ${employeeName}`,
                html,
            });
            console.log('Project update email sent to ' + toEmail + ':', info.messageId);
            return { success: true, messageId: info.messageId };
        } catch (error) {
            console.error('Failed to send project update email:', error);
            return { success: false, error: error.message };
        }
    },

    sendTaskReviewEmail: async (toEmail, name, reviewDetails) => {
        try {
            const details = {
                role: reviewDetails.taskName,
                applicationId: `REV-${reviewDetails.id}`,
                feedback: reviewDetails.feedback,
                ...reviewDetails
            };

            const title = `Task Review: ${reviewDetails.status.toUpperCase()}`;
            const message = `Your submission for "${reviewDetails.taskName}" has been ${reviewDetails.status}.`;
            const html = createEmailTemplate(name, title, message, details, reviewDetails.status === 'rejected' ? 'info' : 'success');

            const mailOptions = {
                from: `"Karthikesh Robotics Reviews" <${process.env.ZOHO_EMAIL}>`,
                to: toEmail,
                subject: `Task Review Update: ${reviewDetails.taskName}`,
                html: html
            };

            const info = await transporter.sendMail(mailOptions);
            console.log(`Task review email sent to ${toEmail}:`, info.messageId);
            return { success: true, messageId: info.messageId };
        } catch (error) {
            console.error('Failed to send task review email:', error);
            return { success: false, error: error.message };
        }
    }
};
module.exports = emailService;

const db = require("../config/db");

// Get total interns count (from active batch only)
const getTotalInterns = async (req, res) => {
    try {
        const { type } = req.query;

        // Get active batch IDs
        let batchQuery = "SELECT id FROM batch WHERE is_active = 1";
        const batchParams = [];

        if (type) {
            batchQuery += " AND type = ?";
            batchParams.push(type);
        }

        const [activeBatches] = await db.execute(batchQuery, batchParams);

        // If no active batch, return 0
        if (activeBatches.length === 0) {
            return res.status(200).json({
                status: "success",
                data: { totalInterns: 0 }
            });
        }

        const activeBatchIds = activeBatches.map(b => b.id);

        // Count interns in active batches
        const [rows] = await db.execute(
            `SELECT COUNT(*) as total FROM interns WHERE is_active = 1 AND batch IN (${activeBatchIds.map(() => '?').join(',')})`,
            activeBatchIds
        );

        res.status(200).json({
            status: "success",
            data: {
                totalInterns: rows[0].total
            }
        });
    } catch (error) {
        console.error("Error fetching total interns:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to fetch total interns"
        });
    }
};

// Get top performing interns (from active batch only)
const getTopPerformingInterns = async (req, res) => {
    try {
        const { type } = req.query;

        // Get active batch IDs
        let batchQuery = "SELECT id FROM batch WHERE is_active = 1";
        const batchParams = [];

        if (type) {
            batchQuery += " AND type = ?";
            batchParams.push(type);
        }

        const [activeBatches] = await db.execute(batchQuery, batchParams);

        // If no active batch, return empty array
        if (activeBatches.length === 0) {
            return res.status(200).json({
                status: "success",
                data: { topInterns: [] }
            });
        }

        const activeBatchIds = activeBatches.map(b => b.id);

        // Get top interns from active batches
        const [rows] = await db.execute(`
            SELECT
                i.intern_id,
                i.name,
                i.university,
                i.organization,
                COALESCE(SUM(ip.points), 0) as total_points,
                COUNT(ip.point_id) as total_activities
            FROM interns i
            LEFT JOIN intern_points ip ON i.intern_id = ip.intern_id
            WHERE i.is_active = 1 AND i.batch IN (${activeBatchIds.map(() => '?').join(',')})
            GROUP BY i.intern_id, i.name, i.university, i.organization
            ORDER BY total_points DESC
            LIMIT 5
        `, activeBatchIds);

        res.status(200).json({
            status: "success",
            data: {
                topInterns: rows
            }
        });
    } catch (error) {
        console.error("Error fetching top performing interns:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to fetch top performing interns"
        });
    }
};

// Get overview stats (combines both) - Active batch only
const getOverviewStats = async (req, res) => {
    try {
        const { type } = req.query; // optional: online | offline

        // Get active batch IDs
        let batchQuery = "SELECT id FROM batch WHERE is_active = 1";
        const batchParams = [];

        if (type) {
            batchQuery += " AND type = ?";
            batchParams.push(type);
        }

        const [activeBatches] = await db.execute(batchQuery, batchParams);

        // If no active batch, return zeros
        if (activeBatches.length === 0) {
            return res.status(200).json({
                status: "success",
                data: {
                    totalInterns: 0,
                    topInterns: []
                }
            });
        }

        const activeBatchIds = activeBatches.map(b => b.id);

        // Get total interns from active batches
        const [totalRows] = await db.execute(
            `SELECT COUNT(*) as total FROM interns WHERE is_active = 1 AND batch IN (${activeBatchIds.map(() => '?').join(',')})`,
            activeBatchIds
        );

        // Get top performing interns from active batches
        const [topRows] = await db.execute(`
            SELECT
                i.intern_id,
                i.name,
                i.university,
                i.organization,
                COALESCE(SUM(ip.points), 0) as total_points,
                COUNT(ip.point_id) as total_activities
            FROM interns i
            LEFT JOIN intern_points ip ON i.intern_id = ip.intern_id
            WHERE i.is_active = 1 AND i.batch IN (${activeBatchIds.map(() => '?').join(',')})
            GROUP BY i.intern_id, i.name, i.university, i.organization
            ORDER BY total_points DESC
            LIMIT 5
        `, activeBatchIds);

        res.status(200).json({
            status: "success",
            data: {
                totalInterns: totalRows[0].total,
                topInterns: topRows
            }
        });
    } catch (error) {
        console.error("Error fetching overview stats:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to fetch overview stats"
        });
    }
};

// ========================================
// NEW FUNCTION - For InternAnalytics Component
// ========================================
// Get ALL interns with streak data (for analytics)
const getAllInternsOverview = async (req, res) => {
    try {
        const { type } = req.query; // optional: online | offline

        // Check if specific batchId is provided
        const { batchId } = req.query;

        let activeBatchIds = [];

        if (batchId) {
            activeBatchIds = [batchId];
        } else {
            // Get active batch IDs based on type if no specific batch requested
            let batchQuery = "SELECT id FROM batch WHERE is_active = 1";
            const batchParams = [];

            if (type) {
                batchQuery += " AND type = ?";
                batchParams.push(type);
            }

            const [activeBatches] = await db.execute(batchQuery, batchParams);

            // If no active batch found and no specific batch requested, return empty
            if (activeBatches.length === 0) {
                return res.status(200).json({
                    status: "success",
                    data: { interns: [] }
                });
            }

            activeBatchIds = activeBatches.map(b => b.id);
        }

        // Get all interns from selected batches with basic data
        const [rows] = await db.execute(`
            SELECT
                i.intern_id,
                i.name,
                i.email,
                i.mobile,
                i.university,
                i.organization,
                i.designation,
                b.batch_id as batch,
                i.batch as batch_id_value,
                i.is_active,
                d.name as domain,
                d.domain_id,
                i.is_offline,
                i.intern_type,
                i.intern_uid,
                i.last_active,
                i.role,
                i.employee_id,
                COALESCE(SUM(ip.points), 0) as total_points
            FROM interns i
            LEFT JOIN batch b ON i.batch = b.id
            LEFT JOIN domains d ON i.domain_id = d.domain_id
            LEFT JOIN intern_points ip ON i.intern_id = ip.intern_id
            WHERE i.batch IN (${activeBatchIds.map(() => '?').join(',')})
            GROUP BY i.intern_id, i.name, i.email, i.mobile, i.university, i.organization, i.designation,
                     b.batch_id, i.batch, i.is_active, d.name, d.domain_id, i.is_offline, i.intern_type, i.intern_uid, i.last_active, i.role, i.employee_id
            ORDER BY i.name ASC
        `, activeBatchIds);

        // Calculate current streak for each intern
        const internsWithStreaks = await Promise.all(
            rows.map(async (intern) => ({
                ...intern,
                current_streak: await calculateCurrentStreak(intern.intern_id),
                longest_streak: await calculateLongestStreak(intern.intern_id)
            }))
        );

        res.status(200).json({
            status: "success",
            data: {
                interns: internsWithStreaks
            }
        });
    } catch (error) {
        console.error("Error fetching all interns overview:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to fetch interns overview"
        });
    }
};

// Helper function to calculate current streak for an intern
const calculateCurrentStreak = async (internId) => {
    try {
        const [streakRows] = await db.execute(`
            SELECT date, status 
            FROM intern_streaks 
            WHERE intern_id = ?
            ORDER BY date DESC
        `, [internId]);

        if (streakRows.length === 0) return 0;

        let currentStreak = 0;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        for (let i = 0; i < streakRows.length; i++) {
            const streakDate = new Date(streakRows[i].date);
            streakDate.setHours(0, 0, 0, 0);

            const expectedDate = new Date(today);
            expectedDate.setDate(expectedDate.getDate() - i);
            expectedDate.setHours(0, 0, 0, 0);

            if (streakDate.getTime() === expectedDate.getTime() && streakRows[i].status === 'present') {
                currentStreak++;
            } else {
                break;
            }
        }

        return currentStreak;
    } catch (error) {
        console.error("Error calculating streak:", error);
        return 0;
    }
};

// Helper function to calculate longest streak for an intern
const calculateLongestStreak = async (internId) => {
    try {
        const [streakRows] = await db.execute(`
            SELECT date, status 
            FROM intern_streaks 
            WHERE intern_id = ? AND status = 'present'
            ORDER BY date ASC
        `, [internId]);

        if (streakRows.length === 0) return 0;

        let longestStreak = 0;
        let tempStreak = 0;
        let prevDate = null;

        for (const row of streakRows) {
            const currentDate = new Date(row.date);
            currentDate.setHours(0, 0, 0, 0);

            if (!prevDate) {
                tempStreak = 1;
            } else {
                const daysDiff = Math.floor((currentDate - prevDate) / (1000 * 60 * 60 * 24));
                if (daysDiff === 1) {
                    tempStreak++;
                } else {
                    longestStreak = Math.max(longestStreak, tempStreak);
                    tempStreak = 1;
                }
            }

            prevDate = currentDate;
        }

        longestStreak = Math.max(longestStreak, tempStreak);
        return longestStreak;
    } catch (error) {
        console.error("Error calculating longest streak:", error);
        return 0;
    }
};

// ========================================
// NEW FUNCTION - Get Career Applications
// ========================================
// Get interns who applied but are not yet assigned to a batch
const getApplicants = async (req, res) => {
    try {
        console.log("Fetching applicants...");
        const [rows] = await db.execute(`
            SELECT * FROM ${process.env.DB_NAME_CAREER || 'karthik2_intern_registration_2026'}.interns 
            ORDER BY id DESC
        `);
        console.log(`Found ${rows.length} applicants`);

        res.status(200).json({
            status: "success",
            data: {
                applicants: rows
            }
        });
    } catch (error) {
        console.error("Error fetching applicants:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to fetch applicants"
        });
    }
};

// ========================================
// NEW FUNCTIONS - Add Interns
// ========================================

// Helper to generate custom Intern ID
const generateInternId = async (isOffline) => {
    try {
        const prefix = isOffline ? 'O' : 'R';
        const [rows] = await db.execute(
            `SELECT intern_uid FROM interns WHERE is_offline = ? ORDER BY intern_id DESC LIMIT 1`,
            [isOffline ? 1 : 0]
        );

        let nextNumber = 1;
        if (rows.length > 0 && rows[0].intern_uid) {
            const lastId = rows[0].intern_uid;
            // Expected format: KKR-I-O001 or KKR-I-R001
            const match = lastId.match(/[RO](\d+)$/);
            if (match) {
                nextNumber = parseInt(match[1]) + 1;
            }
        }

        return `KKR-I-${prefix}${nextNumber.toString().padStart(3, '0')}`;
    } catch (err) {
        console.error("Error generating intern ID:", err);
        return null;
    }
};

// Add a single intern
const addSingleIntern = async (req, res) => {
    try {
        const { name, email, mobile, dob, university, department, year_of_passing, organization, designation, domain_id, batch, is_offline, intern_type } = req.body;

        // Validate required fields (type-aware)
        const resolvedType = intern_type || 'student';
        const baseFieldsMissing = !name || !email || !mobile || !domain_id || !batch;
        const studentFieldsMissing = resolvedType === 'student' && !university;
        const professionalFieldsMissing = resolvedType === 'professional' && (!organization || !designation);

        if (baseFieldsMissing || studentFieldsMissing || professionalFieldsMissing) {
            return res.status(400).json({
                status: "error",
                message: resolvedType === 'student'
                    ? "Required fields: name, email, mobile, university, domain_id, batch"
                    : "Required fields: name, email, mobile, organization, designation, domain_id, batch"
            });
        }

        // Check if email already exists
        const [existingIntern] = await db.execute(
            "SELECT intern_id FROM interns WHERE email = ?",
            [email]
        );

        if (existingIntern.length > 0) {
            return res.status(400).json({
                status: "error",
                message: "An intern with this email already exists"
            });
        }

        // Verify domain exists
        const [domainExists] = await db.execute(
            "SELECT domain_id FROM domains WHERE domain_id = ?",
            [domain_id]
        );

        if (domainExists.length === 0) {
            return res.status(400).json({
                status: "error",
                message: "Invalid domain selected"
            });
        }

        // Generate Custom Intern ID
        let intern_uid = await generateInternId(is_offline || 0);
        // Fallback if generation fails — use timestamp-based ID
        if (!intern_uid) {
            const prefix = (is_offline || 0) ? 'O' : 'R';
            intern_uid = `KKR-I-${prefix}${Date.now().toString().slice(-6)}`;
        }

        // Insert the intern with new fields
        const [result] = await db.execute(
            `INSERT INTO interns (name, email, mobile, dob, university, department, year_of_passing, organization, designation, batch, domain_id, joined_at, is_active, is_offline, intern_uid, intern_type)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), 1, ?, ?, ?)`,
            [name, email, mobile, dob || null, university || null, department || null, year_of_passing || null, organization || null, designation || null, batch, domain_id, is_offline || 0, intern_uid, intern_type || 'student']
        );

        res.status(201).json({
            status: "success",
            message: "Intern added successfully",
            data: {
                intern_id: result.insertId,
                intern_uid: intern_uid
            }
        });
    } catch (error) {
        console.error("Error adding intern:", error);
        res.status(500).json({
            status: "error",
            message: error.message || "Failed to add intern"
        });
    }
};

// Add bulk interns from Excel
const addBulkInterns = async (req, res) => {
    try {
        console.log('Bulk upload request received');
        console.log('Request body:', JSON.stringify(req.body, null, 2));

        const { interns } = req.body;

        if (!interns || !Array.isArray(interns) || interns.length === 0) {
            console.log('Invalid interns data:', { interns, isArray: Array.isArray(interns), length: interns?.length });
            return res.status(400).json({
                status: "error",
                message: "No interns data provided"
            });
        }

        console.log(`Processing ${interns.length} interns...`);

        const errors = [];
        const successfulInterns = [];
        let addedCount = 0;

        // Get current counts for ID generation
        const [onlineRows] = await db.execute("SELECT COUNT(*) as count FROM interns WHERE is_offline = 0");
        const [offlineRows] = await db.execute("SELECT COUNT(*) as count FROM interns WHERE is_offline = 1");

        let onlineCount = onlineRows[0].count;
        let offlineCount = offlineRows[0].count;

        for (let i = 0; i < interns.length; i++) {
            const intern = interns[i];
            const rowNum = i + 2;

            try {
                // Validate required fields
                if (!intern.name || !intern.email || !intern.mobile ||
                    !intern.university || !intern.organization || !intern.designation || !intern.domain || !intern.batch) {
                    errors.push({
                        row: rowNum,
                        error: "Missing required fields (name, email, mobile, university, organization, designation, batch, domain)"
                    });
                    continue;
                }

                // Check if email already exists
                const [existingIntern] = await db.execute(
                    "SELECT intern_id FROM interns WHERE email = ?",
                    [intern.email]
                );

                if (existingIntern.length > 0) {
                    errors.push({
                        row: rowNum,
                        email: intern.email,
                        error: "Email already exists"
                    });
                    continue;
                }

                // Get domain_id from domain name
                const [domainResult] = await db.execute(
                    "SELECT domain_id FROM domains WHERE LOWER(name) = LOWER(?)",
                    [intern.domain]
                );

                if (domainResult.length === 0) {
                    errors.push({
                        row: rowNum,
                        domain: intern.domain,
                        error: "Invalid domain name"
                    });
                    continue;
                }

                const domain_id = domainResult[0].domain_id;
                const isOffline = intern.is_offline ? 1 : 0;

                // Generate UID for bulk
                const prefix = isOffline ? 'O' : 'R';
                let currentNum = isOffline ? ++offlineCount : ++onlineCount;
                const intern_uid = `KKR-I-${prefix}${currentNum.toString().padStart(3, '0')}`;

                // Insert the intern
                await db.execute(
                    `INSERT INTO interns (name, email, mobile, dob, university, department, year_of_passing, organization, designation, batch, domain_id, joined_at, is_active, is_offline, intern_uid, intern_type)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), 1, ?, ?, ?)`,
                    [intern.name, intern.email, intern.mobile, intern.dob || null,
                    intern.university || null, intern.department || null, intern.year_of_passing || null,
                    intern.organization || null, intern.designation || null, intern.batch, domain_id, isOffline, intern_uid, intern.intern_type || 'student']
                );

                addedCount++;
                successfulInterns.push(intern.name);
            } catch (error) {
                console.error(`Error adding intern at row ${rowNum}:`, error);
                errors.push({
                    row: rowNum,
                    error: error.message || "Failed to add intern"
                });
            }
        }

        res.status(errors.length === interns.length ? 400 : 201).json({
            status: addedCount > 0 ? "success" : "error",
            message: `Added ${addedCount} out of ${interns.length} interns`,
            data: {
                added: addedCount,
                total: interns.length,
                errors: errors.length > 0 ? errors : undefined
            }
        });
    } catch (error) {
        console.error("Error in bulk upload:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to process bulk upload"
        });
    }
};

// ========================================
// INTERN MANAGEMENT FUNCTIONS - Super Admin Only
// ========================================

// Update intern details
const updateIntern = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, email, mobile, dob, university, department, year_of_passing, organization, designation, domain_id, batch, is_offline, intern_type } = req.body;

        if (!name || !email || !mobile || !domain_id || !batch || !intern_type) {
            return res.status(400).json({
                status: "error",
                message: "Missing required fields"
            });
        }

        await db.execute(
            `UPDATE interns 
             SET name = ?, email = ?, mobile = ?, dob = ?, university = ?, department = ?, year_of_passing = ?, organization = ?, designation = ?, domain_id = ?, batch = ?, is_offline = ?, intern_type = ?
             WHERE intern_id = ?`,
            [name, email, mobile || null, dob || null, university || null, department || null, year_of_passing || null, organization || null, designation || null, domain_id || null, batch || null, is_offline || 0, intern_type, id]
        );

        const [updated] = await db.execute(
            `SELECT i.*, d.name as domain, b.batch_id as batch
             FROM interns i
             LEFT JOIN domains d ON i.domain_id = d.domain_id
             LEFT JOIN batch b ON CAST(i.batch AS UNSIGNED) = b.id
             WHERE i.intern_id = ?`,
            [id]
        );

        res.status(200).json({
            status: "success",
            message: "Intern updated successfully",
            data: { intern: updated[0] }
        });
    } catch (error) {
        console.error("Error updating intern:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to update intern"
        });
    }
};

// Delete intern (soft delete)
const deleteIntern = async (req, res) => {
    try {
        const { id } = req.params;

        await db.execute(
            `UPDATE interns SET is_active = 0 WHERE intern_id = ?`,
            [id]
        );

        res.status(200).json({
            status: "success",
            message: "Intern deactivated successfully"
        });
    } catch (error) {
        console.error("Error deleting intern:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to delete intern"
        });
    }
};

// Toggle intern active status
const toggleInternStatus = async (req, res) => {
    try {
        const { id } = req.params;

        const [intern] = await db.execute(
            `SELECT is_active FROM interns WHERE intern_id = ?`,
            [id]
        );

        if (intern.length === 0) {
            return res.status(404).json({
                status: "error",
                message: "Intern not found"
            });
        }

        const newStatus = intern[0].is_active === 1 ? 0 : 1;

        await db.execute(
            `UPDATE interns SET is_active = ? WHERE intern_id = ?`,
            [newStatus, id]
        );

        res.status(200).json({
            status: "success",
            message: `Intern ${newStatus === 1 ? 'activated' : 'deactivated'} successfully`,
            data: { is_active: newStatus }
        });
    } catch (error) {
        console.error("Error toggling intern status:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to toggle intern status"
        });
    }
};

// ========================================
// INTERN TIMELINE - Task Journey History
// ========================================

/**
 * Get intern's task timeline history
 * Returns all task submissions with their status changes
 */
const getInternTimeline = async (req, res) => {
    try {
        const { internId } = req.params;

        if (!internId) {
            return res.status(400).json({
                status: "error",
                message: "Intern ID is required"
            });
        }

        // Get all task submissions for this intern with domain-specific task number
        const [submissions] = await db.execute(`
            SELECT 
                its.submission_id,
                its.task_id,
                t.title as task_title,
                t.description as task_description,
                t.domain_id,
                (
                    SELECT COUNT(*) + 1 FROM tasks t2 
                    WHERE t2.domain_id = t.domain_id 
                    AND t2.task_id < t.task_id
                ) as domain_task_number,
                its.linkedin_url,
                its.post_url,
                its.file_url,
                its.submitted_at,
                its.first_submitted_at,
                its.status,
                its.reviewed_by,
                its.reviewed_at,
                its.admin_feedback,
                its.rejection_date,
                its.rejection_feedback,
                a.name as reviewer_name
            FROM intern_task_submissions its
            JOIN tasks t ON its.task_id = t.task_id
            LEFT JOIN admins a ON its.reviewed_by = a.admin_id
            WHERE its.intern_id = ?
            ORDER BY its.submitted_at DESC
        `, [internId]);

        // Transform submissions into timeline events
        const timeline = [];

        submissions.forEach(sub => {
            // First submission event
            const submitDate = sub.first_submitted_at || sub.submitted_at;
            if (submitDate) {
                timeline.push({
                    type: 'submitted',
                    date: submitDate,
                    taskId: sub.domain_task_number,
                    taskTitle: sub.task_title,
                    linkedinUrl: sub.linkedin_url,
                    postUrl: sub.post_url,
                    fileUrl: sub.file_url,
                    description: 'Submitted task for review'
                });
            }

            // Rejection event (if rejected and later resubmitted)
            if (sub.rejection_date) {
                timeline.push({
                    type: 'rejected',
                    date: sub.rejection_date,
                    taskId: sub.domain_task_number,
                    taskTitle: sub.task_title,
                    feedback: sub.rejection_feedback,
                    reviewerName: sub.reviewer_name,
                    description: 'Task was rejected'
                });

                // Resubmission event
                if (sub.submitted_at && sub.first_submitted_at && sub.submitted_at !== sub.first_submitted_at) {
                    timeline.push({
                        type: 'resubmitted',
                        date: sub.submitted_at,
                        taskId: sub.domain_task_number,
                        taskTitle: sub.task_title,
                        linkedinUrl: sub.linkedin_url,
                        postUrl: sub.post_url,
                        fileUrl: sub.file_url,
                        description: 'Resubmitted after rejection'
                    });
                }
            }

            // Review/Approval event
            if (sub.reviewed_at && sub.status === 'approved') {
                timeline.push({
                    type: 'approved',
                    date: sub.reviewed_at,
                    taskId: sub.domain_task_number,
                    taskTitle: sub.task_title,
                    feedback: sub.admin_feedback,
                    reviewerName: sub.reviewer_name,
                    description: 'Task approved'
                });
            }
        });

        // ========================================
        // TICKET EVENTS
        // ========================================
        const [tickets] = await db.execute(`
            SELECT 
                t.ticket_id,
                t.subject,
                t.description,
                t.status,
                t.priority,
                t.created_at,
                t.resolved_at,
                t.updated_by,
                a.name as resolver_name
            FROM tickets t
            LEFT JOIN admins a ON t.updated_by = a.admin_id
            WHERE t.intern_id = ?
            ORDER BY t.created_at DESC
        `, [internId]);

        tickets.forEach(ticket => {
            // Ticket created event
            timeline.push({
                type: 'ticket_created',
                date: ticket.created_at,
                ticketId: ticket.ticket_id,
                ticketSubject: ticket.subject,
                priority: ticket.priority,
                status: ticket.status,
                description: `Raised a ${ticket.priority} priority ticket`
            });

            // Ticket resolved event
            if (ticket.resolved_at) {
                timeline.push({
                    type: 'ticket_resolved',
                    date: ticket.resolved_at,
                    ticketId: ticket.ticket_id,
                    ticketSubject: ticket.subject,
                    resolverName: ticket.resolver_name,
                    description: 'Ticket was resolved'
                });
            }
        });

        // Sort timeline by date (newest first)
        timeline.sort((a, b) => new Date(b.date) - new Date(a.date));

        res.status(200).json({
            status: "success",
            data: {
                internId: parseInt(internId),
                totalEvents: timeline.length,
                timeline
            }
        });

    } catch (error) {
        console.error("Error fetching intern timeline:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to fetch intern timeline"
        });
    }
};

// ========================================
// INTERN TASKS JOURNEY - Per-Task Timelines
// ========================================

/**
 * Get all tasks for intern's domain with individual task progress
 */
const getInternTasksJourney = async (req, res) => {
    try {
        const { internId } = req.params;

        if (!internId) {
            return res.status(400).json({
                status: "error",
                message: "Intern ID is required"
            });
        }

        // Get intern's domain
        const [internRows] = await db.execute(
            `SELECT domain_id, batch FROM interns WHERE intern_id = ?`,
            [internId]
        );

        if (internRows.length === 0) {
            return res.status(404).json({
                status: "error",
                message: "Intern not found"
            });
        }

        const domainId = internRows[0].domain_id;

        // Get all tasks for this domain with domain-specific numbering
        const [allTasks] = await db.execute(`
            SELECT 
                t.task_id,
                t.title,
                t.description,
                t.created_at,
                t.deadline,
                t.points,
                (
                    SELECT COUNT(*) + 1 FROM tasks t2 
                    WHERE t2.domain_id = t.domain_id 
                    AND t2.task_id < t.task_id
                ) as task_number
            FROM tasks t
            WHERE t.domain_id = ? AND t.batch = ?
            ORDER BY t.task_id ASC
        `, [domainId, internRows[0].batch]);

        // Get all submissions for this intern
        const [submissions] = await db.execute(`
            SELECT 
                its.*,
                a.name as reviewer_name
            FROM intern_task_submissions its
            LEFT JOIN admins a ON its.reviewed_by = a.admin_id
            JOIN tasks t ON its.task_id = t.task_id
            WHERE t.domain_id = ? AND t.batch = ?
        `, [domainId, internRows[0].batch]);

        // Build per-task journey
        const tasksJourney = allTasks.map(task => {
            const taskSubmission = submissions.find(s => s.task_id === task.task_id);
            const events = [];

            // Task created event
            events.push({
                type: 'task_created',
                date: task.created_at,
                description: 'Task assigned'
            });

            if (taskSubmission) {
                // Submitted event
                if (taskSubmission.first_submitted_at || taskSubmission.submitted_at) {
                    events.push({
                        type: 'submitted',
                        date: taskSubmission.first_submitted_at || taskSubmission.submitted_at,
                        linkedinUrl: taskSubmission.linkedin_url,
                        fileUrl: taskSubmission.file_url,
                        description: 'Submitted for review'
                    });
                }

                // Rejection event
                if (taskSubmission.rejection_date) {
                    events.push({
                        type: 'rejected',
                        date: taskSubmission.rejection_date,
                        feedback: taskSubmission.rejection_feedback,
                        reviewerName: taskSubmission.reviewer_name,
                        description: 'Task was rejected'
                    });

                    // Resubmission
                    if (taskSubmission.submitted_at && taskSubmission.first_submitted_at &&
                        taskSubmission.submitted_at !== taskSubmission.first_submitted_at) {
                        events.push({
                            type: 'resubmitted',
                            date: taskSubmission.submitted_at,
                            description: 'Resubmitted after rejection'
                        });
                    }
                }

                // Approved event
                if (taskSubmission.reviewed_at && taskSubmission.status === 'approved') {
                    events.push({
                        type: 'approved',
                        date: taskSubmission.reviewed_at,
                        feedback: taskSubmission.admin_feedback,
                        reviewerName: taskSubmission.reviewer_name,
                        description: 'Task approved'
                    });
                }
            }

            // Determine status
            let status = 'not_started';
            if (taskSubmission) {
                status = taskSubmission.status; // pending, approved, rejected
            }

            return {
                taskId: task.task_id,
                taskNumber: task.task_number,
                title: task.title,
                description: task.description,
                createdAt: task.created_at,
                deadline: task.deadline,
                points: task.points,
                status,
                events: events.sort((a, b) => new Date(a.date) - new Date(b.date))
            };
        });

        res.status(200).json({
            status: "success",
            data: {
                internId: parseInt(internId),
                totalTasks: tasksJourney.length,
                tasksJourney
            }
        });

    } catch (error) {
        console.error("Error fetching intern tasks journey:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to fetch intern tasks journey"
        });
    }
};

// Update intern's profile picture
const updateProfilePic = async (req, res) => {
    try {
        const { internId } = req.body;

        if (!internId) {
            return res.status(400).json({
                status: "error",
                message: "Intern ID is required"
            });
        }

        if (!req.file) {
            return res.status(400).json({
                status: "error",
                message: "No image file provided"
            });
        }

        // The path we store in DB (relative to backend)
        const profilePicPath = `/uploads/profiles/${req.file.filename}`;

        // Update database
        await db.execute(
            "UPDATE interns SET profile_pic = ? WHERE intern_id = ?",
            [profilePicPath, internId]
        );

        res.status(200).json({
            status: "success",
            message: "Profile picture updated successfully",
            data: {
                profile_pic: profilePicPath
            }
        });
    } catch (error) {
        console.error("Error updating profile picture:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to update profile picture"
        });
    }
};

// Get single intern details with stats
const getInternDetails = async (req, res) => {
    try {
        const { id } = req.params;

        const [interns] = await db.execute(`
            SELECT
                i.*,
                d.name as domain,
                b.batch_id as batch_name,
                b.type as batch_type,
                COALESCE(SUM(ip.points), 0) as total_points,
                (SELECT COUNT(*) FROM intern_task_submissions its WHERE its.intern_id = i.intern_id AND its.status = 'approved') as tasks_completed,
                (SELECT COUNT(*) FROM intern_task_submissions its WHERE its.intern_id = i.intern_id AND its.status = 'pending') as pending_tasks,
                (SELECT COUNT(*) FROM tasks t WHERE t.domain_id = i.domain_id AND t.batch = i.batch) as total_tasks,
                (SELECT COUNT(*) FROM tickets tk WHERE tk.intern_id = i.intern_id) as tickets_count
            FROM interns i
            LEFT JOIN domains d ON i.domain_id = d.domain_id
            LEFT JOIN batch b ON i.batch = b.id
            LEFT JOIN intern_points ip ON i.intern_id = ip.intern_id
            WHERE i.intern_id = ?
            GROUP BY i.intern_id
        `, [id]);

        if (interns.length === 0) {
            return res.status(404).json({
                status: "error",
                message: "Intern not found"
            });
        }

        const intern = interns[0];
        intern.current_streak = await calculateCurrentStreak(id);
        intern.longest_streak = await calculateLongestStreak(id);
        intern.picture = intern.profile_pic; // Add consistency with login response

        res.status(200).json({
            status: "success",
            data: intern
        });
    } catch (error) {
        console.error("Error fetching intern details:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to fetch intern details"
        });
    }
};

// ========================================
// GET ALL INTERNS (ALL BATCHES) - For admin tools
// Returns a flat array of all interns across every batch — no streak calc.
// Used by: Promote Intern modal, Add Employee modal
// ========================================
const getAllInternsForAdmin = async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT
                i.intern_id,
                i.name,
                i.email,
                i.mobile,
                i.intern_uid,
                i.role,
                i.is_active,
                i.designation,
                i.profile_pic,
                d.name AS domain_name,
                d.domain_id,
                b.batch_id AS batch
            FROM interns i
            LEFT JOIN domains d ON i.domain_id = d.domain_id
            LEFT JOIN batch b ON i.batch = b.id
            ORDER BY i.name ASC
        `);
        res.json({ status: 'success', data: rows });
    } catch (error) {
        console.error('getAllInternsForAdmin error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to fetch interns' });
    }
};

module.exports = {
    getTotalInterns,
    getTopPerformingInterns,
    getOverviewStats,
    getAllInternsOverview,
    getAllInternsForAdmin,
    addSingleIntern,
    addBulkInterns,
    updateIntern,
    deleteIntern,
    toggleInternStatus,
    getInternDetails,
    getInternTimeline,
    getInternTasksJourney,
    getApplicants,
    updateProfilePic
};
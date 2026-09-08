const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const db = require('../config/db');

// Polyfill for older Node.js versions (for Headers API)
if (typeof global.Headers === 'undefined') {
    global.Headers = class Headers {
        constructor(init) {
            this.map = new Map();
            if (init) {
                Object.entries(init).forEach(([key, value]) => {
                    this.map.set(key.toLowerCase(), value);
                });
            }
        }
        get(key) {
            return this.map.get(key.toLowerCase());
        }
        set(key, value) {
            this.map.set(key.toLowerCase(), value);
        }
    };
}

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/**
 * Verify Google OAuth token and generate JWT
 */
exports.googleLogin = async (req, res) => {
    try {
        const { credential } = req.body;

        if (!credential) {
            return res.status(400).json({
                status: 'error',
                message: 'No credential provided'
            });
        }

        // Verify Google token
        const ticket = await client.verifyIdToken({
            idToken: credential,
            audience: process.env.GOOGLE_CLIENT_ID,
        });

        const payload = ticket.getPayload();
        const { email, name, picture, sub: googleId } = payload;

        // First, try to find admin by google_id (most secure and reliable)
        let [adminRows] = await db.execute(
            'SELECT admin_id, email, name, designation, role, domain_assigned, batch_assigned, mode_assigned, permissions, google_id FROM admins WHERE google_id = ? AND is_active = 1',
            [googleId]
        );

        // If not found by google_id, try to find by email (backward compatibility)
        if (adminRows.length === 0) {
            [adminRows] = await db.execute(
                'SELECT admin_id, email, name, designation, role, domain_assigned, batch_assigned, mode_assigned, permissions, google_id FROM admins WHERE email = ? AND is_active = 1',
                [email]
            );

            // If found by email but doesn't have google_id, update it
            if (adminRows.length > 0 && !adminRows[0].google_id) {
                await db.execute(
                    'UPDATE admins SET google_id = ? WHERE admin_id = ?',
                    [googleId, adminRows[0].admin_id]
                );
                console.log(`Updated google_id for admin: ${email}`);

                // Update the adminRows with the new google_id
                adminRows[0].google_id = googleId;
            }
        }

        if (adminRows.length === 0) {
            // User is not an admin or not active
            return res.status(403).json({
                status: 'error',
                message: 'You are not authorized to access this admin panel. Please contact support@karthikeshrobotics.in for assistance.',
                isNotAdmin: true,
                googleId: googleId,
                email: email
            });
        }

        const adminData = adminRows[0];

        // Parse domain_assigned if it's a JSON array
        let domainAssigned = adminData.domain_assigned;
        if (domainAssigned && typeof domainAssigned === 'string' && domainAssigned.startsWith('[')) {
            try {
                domainAssigned = JSON.parse(domainAssigned);
                // If it's an array, join it as comma-separated
                if (Array.isArray(domainAssigned)) {
                    domainAssigned = domainAssigned.join(', ');
                }
            } catch (e) {
                // If parsing fails, use the original string
                console.log('Failed to parse domain_assigned as JSON, using as-is');
            }
        }

        // Parse batch_assigned
        let batchAssigned = adminData.batch_assigned;
        if (batchAssigned && typeof batchAssigned === 'string' && batchAssigned.startsWith('[')) {
            try {
                batchAssigned = JSON.parse(batchAssigned);
            } catch (e) {
                // Use as-is
            }
        }

        // Parse permissions
        let permissions = adminData.permissions;
        if (permissions && typeof permissions === 'string') {
            try {
                permissions = JSON.parse(permissions);
            } catch (e) {
                permissions = {};
            }
        }
        if (!permissions) permissions = {};

        // Generate JWT token with admin information (including RBAC fields)
        const token = jwt.sign(
            {
                id: adminData.admin_id,
                googleId: adminData.google_id || googleId,
                email: adminData.email,
                name: adminData.name || name,
                designation: adminData.designation,
                picture,
                role: adminData.role,
                domainAssigned: domainAssigned,
                batchAssigned: batchAssigned,
                modeAssigned: adminData.mode_assigned,
                permissions: permissions
            },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
        );

        res.status(200).json({
            status: 'success',
            message: 'Authentication successful',
            data: {
                token,
                user: {
                    admin_id: adminData.admin_id,
                    email: adminData.email,
                    name: adminData.name || name,
                    designation: adminData.designation,
                    picture,
                    role: adminData.role,
                    domainAssigned: domainAssigned,
                    batchAssigned: batchAssigned,
                    modeAssigned: adminData.mode_assigned,
                    permissions: permissions
                }
            }
        });
    } catch (error) {
        console.error('Google Login Error:', {
            message: error.message,
            stack: error.stack,
            credential: req.body.credential ? `${req.body.credential.substring(0, 20)}...` : 'none',
            env: {
                hasClientId: !!process.env.GOOGLE_CLIENT_ID,
                clientIdPrefix: process.env.GOOGLE_CLIENT_ID?.substring(0, 20),
                hasSecret: !!process.env.GOOGLE_CLIENT_SECRET
            }
        });

        // Check if it's a database error
        if (error.code === 'ER_NO_SUCH_TABLE') {
            return res.status(500).json({
                status: 'error',
                message: 'Admin table not found. Please contact system administrator.',
                error: 'Database configuration error'
            });
        }

        res.status(401).json({
            status: 'error',
            message: 'Invalid Google token',
            error: error.message
        });
    }
};

/**
 * Verify Google OAuth token and generate JWT for INTERNS
 */
exports.googleLoginIntern = async (req, res) => {
    try {
        const { credential } = req.body;

        if (!credential) {
            return res.status(400).json({
                status: 'error',
                message: 'No credential provided'
            });
        }

        // Verify Google token
        const ticket = await client.verifyIdToken({
            idToken: credential,
            audience: process.env.GOOGLE_CLIENT_ID,
        });

        const payload = ticket.getPayload();
        const { email, name, picture, sub: googleId } = payload;

        // First, try to find intern by google_id
        let [internRows] = await db.execute(
            `SELECT i.intern_id, i.email, i.name, i.domain_id, i.designation, i.google_id,
                    i.dob, i.university, i.organization, i.mobile, i.profile_pic,
                    i.role, i.employee_id,
                    d.name as domain_name, b.id as batch_internal_id, i.is_offline
             FROM interns i
             LEFT JOIN domains d ON i.domain_id = d.domain_id
             LEFT JOIN batch b ON i.batch = b.batch_id
             WHERE i.google_id = ? AND i.is_active = 1`,
            [googleId]
        );

        // If not found by google_id, try to find by email (backward compatibility)
        if (internRows.length === 0) {
            [internRows] = await db.execute(
                `SELECT i.intern_id, i.email, i.name, i.domain_id, i.designation, i.google_id,
                        i.dob, i.university, i.organization, i.mobile, i.profile_pic,
                        i.role, i.employee_id,
                        d.name as domain_name, b.id as batch_internal_id, i.is_offline
                 FROM interns i
                 LEFT JOIN domains d ON i.domain_id = d.domain_id
                 LEFT JOIN batch b ON i.batch = b.batch_id
                 WHERE i.email = ? AND i.is_active = 1`,
                [email]
            );

            // If found by email but doesn't have google_id, update it
            if (internRows.length > 0 && !internRows[0].google_id) {
                await db.execute(
                    'UPDATE interns SET google_id = ? WHERE intern_id = ?',
                    [googleId, internRows[0].intern_id]
                );
                console.log(`Updated google_id for intern: ${email}`);
                internRows[0].google_id = googleId;
            }
        }

        if (internRows.length === 0) {
            return res.status(403).json({
                status: 'error',
                message: 'You are not authorized to access this intern portal. Please contact your administrator.',
                isNotIntern: true,
                googleId: googleId,
                email: email
            });
        }

        const internData = internRows[0];

        // Generate JWT token with intern information
        const token = jwt.sign(
            {
                id: internData.intern_id,
                googleId: internData.google_id || googleId,
                email: internData.email,
                name: internData.name || name,
                designation: internData.designation,
                picture: internData.profile_pic,
                domain_id: internData.domain_id,
                domain_name: internData.domain_name,
                batch_id: internData.batch_internal_id,
                mode: internData.is_offline ? 'offline' : 'online',
                userType: 'intern',
                role: internData.role || 'intern',
                employee_id: internData.employee_id || null
            },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
        );

        res.status(200).json({
            status: 'success',
            message: 'Authentication successful',
            data: {
                token,
                user: {
                    intern_id: internData.intern_id,
                    email: internData.email,
                    name: internData.name || name,
                    designation: internData.designation,
                    picture: internData.profile_pic,
                    domain_id: internData.domain_id,
                    domain_name: internData.domain_name,
                    dob: internData.dob,
                    university: internData.university,
                    organization: internData.organization,
                    mobile: internData.mobile,
                    is_offline: internData.is_offline,
                    batch_id: internData.batch_internal_id,
                    role: internData.role || 'intern',
                    employee_id: internData.employee_id || null
                }
            }
        });
    } catch (error) {
        console.error('Intern Google Login Error:', {
            message: error.message,
            stack: error.stack,
            credential: req.body.credential ? `${req.body.credential.substring(0, 20)}...` : 'none',
            env: {
                hasClientId: !!process.env.GOOGLE_CLIENT_ID,
                clientIdPrefix: process.env.GOOGLE_CLIENT_ID?.substring(0, 20),
                hasSecret: !!process.env.GOOGLE_CLIENT_SECRET
            }
        });

        // Check if it's a database error
        if (error.code === 'ER_NO_SUCH_TABLE') {
            return res.status(500).json({
                status: 'error',
                message: 'Interns table not found. Please contact system administrator.',
                error: 'Database configuration error'
            });
        }

        res.status(401).json({
            status: 'error',
            message: 'Invalid Google token',
            error: error.message
        });
    }
};

/**
 * Verify JWT token
 */
exports.verifyToken = async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];

        if (!token) {
            return res.status(401).json({
                status: 'error',
                message: 'No token provided'
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        res.status(200).json({
            status: 'success',
            message: 'Token is valid',
            data: {
                user: {
                    email: decoded.email,
                    name: decoded.name,
                    picture: decoded.picture
                }
            }
        });
    } catch (error) {
        res.status(401).json({
            status: 'error',
            message: 'Invalid or expired token'
        });
    }
};

/**
 * Logout (mainly for consistency, actual logout happens client-side)
 */
exports.logout = async (req, res) => {
    res.status(200).json({
        status: 'success',
        message: 'Logout successful'
    });
};

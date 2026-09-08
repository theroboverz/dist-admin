const jwt = require("jsonwebtoken");

/**
 * Basic authentication middleware - verifies JWT token
 */
exports.auth = (req, res, next) => {
    // Skip auth for OPTIONS (CORS preflight)
    if (req.method === 'OPTIONS') {
        return next();
    }

    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
        return res.status(401).json({
            status: "error",
            message: "No token provided. Please login to continue."
        });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({
            status: "error",
            message: "Invalid or expired token. Please login again."
        });
    }
};

/**
 * Admin-only middleware - requires valid admin role
 * Must be used after auth middleware
 */
exports.requireAdmin = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({
            status: "error",
            message: "Authentication required"
        });
    }

    const validAdminRoles = ['admin', 'superadmin', 'super admin', 'batch admin', 'domain admin', 'reviewer', 'task-manager'];

    if (!req.user.role || !validAdminRoles.includes(req.user.role.toLowerCase())) {
        return res.status(403).json({
            status: "error",
            message: "Access denied. Admin privileges required.",
            requiredRole: "admin"
        });
    }

    next();
};

/**
 * SuperAdmin-only middleware - requires superadmin role
 * Must be used after auth middleware
 */
exports.requireSuperAdmin = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({
            status: "error",
            message: "Authentication required"
        });
    }

    const isSuperAdmin = req.user.role &&
        (req.user.role.toLowerCase() === 'superadmin' || req.user.role.toLowerCase() === 'super admin');

    if (!isSuperAdmin) {
        return res.status(403).json({
            status: "error",
            message: "Access denied. Super Admin privileges required.",
            requiredRole: "superadmin"
        });
    }

    next();
};

/**
 * Permission-based middleware - requires specific permission key
 * Checks the permissions object in the JWT token
 * SuperAdmin bypasses all permission checks
 * Must be used after auth middleware
 * @param {string} permissionKey - e.g., 'can_manage_announcements'
 */
exports.requirePermission = (permissionKey) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                status: "error",
                message: "Authentication required"
            });
        }

        // SuperAdmin bypasses all permission checks
        const isSuperAdmin = req.user.role &&
            (req.user.role.toLowerCase() === 'superadmin' || req.user.role.toLowerCase() === 'super admin');

        if (isSuperAdmin) {
            return next();
        }

        // Check specific permission
        const permissions = req.user.permissions || {};
        if (!permissions[permissionKey]) {
            return res.status(403).json({
                status: "error",
                message: `Access denied. Missing permission: ${permissionKey}`,
                requiredPermission: permissionKey
            });
        }

        next();
    };
};

/**
 * Role-based middleware - requires specific role(s)
 * Must be used after auth middleware
 * @param {string|string[]} allowedRoles - Single role or array of allowed roles
 */
exports.requireRole = (allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                status: "error",
                message: "Authentication required"
            });
        }

        const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

        if (!req.user.role || !roles.map(r => r.toLowerCase()).includes(req.user.role.toLowerCase())) {
            return res.status(403).json({
                status: "error",
                message: `Access denied. Required role: ${roles.join(' or ')}`,
                requiredRoles: roles,
                userRole: req.user.role
            });
        }

        next();
    };
};

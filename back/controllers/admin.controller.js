const db = require("../config/db");

// Get all admins
const getAllAdmins = async (req, res) => {
    try {
        const [admins] = await db.execute(`
            SELECT admin_id, name, email, mobile, designation, role, domain_assigned, batch_assigned, mode_assigned, permissions, is_active, created_at
            FROM admins
            ORDER BY created_at DESC
        `);

        // Parse JSON fields for each admin
        const parsed = admins.map(admin => {
            let permissions = admin.permissions;
            if (permissions && typeof permissions === 'string') {
                try { permissions = JSON.parse(permissions); } catch (e) { permissions = {}; }
            }
            let domain_assigned = admin.domain_assigned;
            if (domain_assigned && typeof domain_assigned === 'string' && domain_assigned.startsWith('[')) {
                try { domain_assigned = JSON.parse(domain_assigned); } catch (e) { /* keep as-is */ }
            }
            let batch_assigned = admin.batch_assigned;
            if (batch_assigned && typeof batch_assigned === 'string' && batch_assigned.startsWith('[')) {
                try { batch_assigned = JSON.parse(batch_assigned); } catch (e) { /* keep as-is */ }
            }
            return {
                ...admin,
                permissions: permissions || {},
                domain_assigned: Array.isArray(domain_assigned) ? domain_assigned : (domain_assigned || null),
                batch_assigned: Array.isArray(batch_assigned) ? batch_assigned : (batch_assigned || null),
            };
        });

        res.status(200).json({
            status: "success",
            data: { admins: parsed }
        });
    } catch (error) {
        console.error("Error fetching admins:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to fetch admins"
        });
    }
};

// Create new admin
const createAdmin = async (req, res) => {
    try {
        const { email, mobile, name, designation, role, domain_assigned, batch_assigned, mode_assigned, permissions } = req.body;

        // Validation
        if (!email || !name || !role) {
            return res.status(400).json({
                status: "error",
                message: "Email, name, and role are required"
            });
        }

        // For admin role, require mandatory assignments
        const isAdmin = role.toLowerCase() === 'admin' || role === 'Batch Admin' || role === 'Domain Admin';
        if (isAdmin) {
            if (!mode_assigned) {
                return res.status(400).json({ status: "error", message: "Mode assignment is required for Admin role" });
            }
            if (!batch_assigned || (Array.isArray(batch_assigned) && batch_assigned.length === 0)) {
                return res.status(400).json({ status: "error", message: "Batch assignment is required for Admin role" });
            }
            if (!domain_assigned || (Array.isArray(domain_assigned) && domain_assigned.length === 0)) {
                return res.status(400).json({ status: "error", message: "Domain assignment is required for Admin role" });
            }
        }

        // Check if email already exists
        const [existing] = await db.execute(
            "SELECT admin_id FROM admins WHERE email = ?",
            [email]
        );

        if (existing.length > 0) {
            return res.status(400).json({
                status: "error",
                message: "Email already exists"
            });
        }

        // Convert domain_assigned to JSON array
        let domainJson = null;
        if (domain_assigned) {
            if (Array.isArray(domain_assigned)) {
                domainJson = JSON.stringify(domain_assigned);
            } else if (typeof domain_assigned === 'string' && domain_assigned.trim()) {
                const domainsArray = domain_assigned.split(',').map(d => d.trim()).filter(d => d);
                domainJson = JSON.stringify(domainsArray);
            }
        }

        // Convert batch_assigned to JSON array
        let batchJson = null;
        if (batch_assigned) {
            if (Array.isArray(batch_assigned)) {
                batchJson = JSON.stringify(batch_assigned);
            } else if (typeof batch_assigned === 'string') {
                batchJson = batch_assigned;
            }
        }

        // Permissions as JSON
        let permissionsJson = null;
        if (permissions) {
            permissionsJson = typeof permissions === 'string' ? permissions : JSON.stringify(permissions);
        }

        // Insert new admin
        await db.execute(
            `INSERT INTO admins (email, mobile, name, designation, role, domain_assigned, batch_assigned, mode_assigned, permissions, is_active, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW())`,
            [email, mobile || null, name, designation || null, role, domainJson, batchJson, mode_assigned || null, permissionsJson]
        );

        res.status(201).json({
            status: "success",
            message: "Admin created successfully"
        });
    } catch (error) {
        console.error("Error creating admin:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to create admin"
        });
    }
};

// Update admin
const updateAdmin = async (req, res) => {
    try {
        const { id } = req.params;
        const { email, mobile, name, designation, role, domain_assigned, batch_assigned, mode_assigned, permissions } = req.body;

        // Validation
        if (!email || !name || !role) {
            return res.status(400).json({
                status: "error",
                message: "Email, name, and role are required"
            });
        }

        // For admin role, require mandatory assignments
        const isAdmin = role.toLowerCase() === 'admin' || role === 'Batch Admin' || role === 'Domain Admin';
        if (isAdmin) {
            if (!mode_assigned) {
                return res.status(400).json({ status: "error", message: "Mode assignment is required for Admin role" });
            }
            if (!batch_assigned || (Array.isArray(batch_assigned) && batch_assigned.length === 0)) {
                return res.status(400).json({ status: "error", message: "Batch assignment is required for Admin role" });
            }
            if (!domain_assigned || (Array.isArray(domain_assigned) && domain_assigned.length === 0)) {
                return res.status(400).json({ status: "error", message: "Domain assignment is required for Admin role" });
            }
        }

        // Check if email exists for another admin
        const [existing] = await db.execute(
            "SELECT admin_id FROM admins WHERE email = ? AND admin_id != ?",
            [email, id]
        );

        if (existing.length > 0) {
            return res.status(400).json({
                status: "error",
                message: "Email already exists"
            });
        }

        // Convert domain_assigned to JSON array
        let domainJson = null;
        if (domain_assigned) {
            if (Array.isArray(domain_assigned)) {
                domainJson = JSON.stringify(domain_assigned);
            } else if (typeof domain_assigned === 'string' && domain_assigned.trim()) {
                const domainsArray = domain_assigned.split(',').map(d => d.trim()).filter(d => d);
                domainJson = JSON.stringify(domainsArray);
            }
        }

        // Convert batch_assigned to JSON array
        let batchJson = null;
        if (batch_assigned) {
            if (Array.isArray(batch_assigned)) {
                batchJson = JSON.stringify(batch_assigned);
            } else if (typeof batch_assigned === 'string') {
                batchJson = batch_assigned;
            }
        }

        // Permissions as JSON
        let permissionsJson = null;
        if (permissions) {
            permissionsJson = typeof permissions === 'string' ? permissions : JSON.stringify(permissions);
        }

        // Update admin
        await db.execute(
            `UPDATE admins 
             SET email = ?, mobile = ?, name = ?, designation = ?, role = ?, domain_assigned = ?, batch_assigned = ?, mode_assigned = ?, permissions = ?
             WHERE admin_id = ?`,
            [email, mobile || null, name, designation || null, role, domainJson, batchJson, mode_assigned || null, permissionsJson, id]
        );

        res.status(200).json({
            status: "success",
            message: "Admin updated successfully"
        });
    } catch (error) {
        console.error("Error updating admin:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to update admin"
        });
    }
};

// Delete admin (permanent)
const deleteAdmin = async (req, res) => {
    try {
        const { id } = req.params;

        // Check if admin exists
        const [existing] = await db.execute(
            `SELECT admin_id, name FROM admins WHERE admin_id = ?`,
            [id]
        );

        if (existing.length === 0) {
            return res.status(404).json({
                status: "error",
                message: "Admin not found"
            });
        }

        // Permanently delete the admin
        await db.execute(
            `DELETE FROM admins WHERE admin_id = ?`,
            [id]
        );

        res.status(200).json({
            status: "success",
            message: "Admin deleted permanently"
        });
    } catch (error) {
        console.error("Error deleting admin:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to delete admin"
        });
    }
};

// Toggle admin active status
const toggleAdminStatus = async (req, res) => {
    try {
        const { id } = req.params;

        // Get current status
        const [admin] = await db.execute(
            `SELECT is_active FROM admins WHERE admin_id = ?`,
            [id]
        );

        if (admin.length === 0) {
            return res.status(404).json({
                status: "error",
                message: "Admin not found"
            });
        }

        const newStatus = admin[0].is_active === 1 ? 0 : 1;

        // Toggle status
        await db.execute(
            `UPDATE admins SET is_active = ? WHERE admin_id = ?`,
            [newStatus, id]
        );

        res.status(200).json({
            status: "success",
            message: `Admin ${newStatus === 1 ? 'activated' : 'deactivated'} successfully`,
            data: { is_active: newStatus }
        });
    } catch (error) {
        console.error("Error toggling admin status:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to toggle admin status"
        });
    }
};

module.exports = {
    getAllAdmins,
    createAdmin,
    updateAdmin,
    deleteAdmin,
    toggleAdminStatus,
};

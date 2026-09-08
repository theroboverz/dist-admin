const db = require('../config/careerDb');

exports.checkDuplicate = async (req, res) => {
    try {
        const { email, phone } = req.query;

        if (!email && !phone) {
            return res.status(400).json({
                success: false,
                message: 'Email or phone number is required'
            });
        }

        let query = 'SELECT COUNT(*) as count FROM interns WHERE ';
        const params = [];
        const conditions = [];

        if (email) {
            conditions.push('email = ?');
            params.push(email);
        }

        if (phone) {
            conditions.push('whatsapp_number = ?');
            params.push(phone);
        }

        query += conditions.join(' OR ');

        const [rows] = await db.query(query, params);
        const exists = rows[0].count > 0;

        let field = '';
        if (exists) {
            // Check which field is duplicate
            if (email) {
                const [emailCheck] = await db.query('SELECT COUNT(*) as count FROM interns WHERE email = ?', [email]);
                if (emailCheck[0].count > 0) field = 'email';
            }
            if (phone && !field) {
                const [phoneCheck] = await db.query('SELECT COUNT(*) as count FROM interns WHERE whatsapp_number = ?', [phone]);
                if (phoneCheck[0].count > 0) field = 'phone number';
            }
        }

        res.status(200).json({
            success: true,
            exists: exists,
            field: field
        });

    } catch (error) {
        console.error('Error checking duplicate:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to check duplicate',
            error: error.message
        });
    }
};

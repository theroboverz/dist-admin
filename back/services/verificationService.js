const crypto = require('crypto');
const db = require('../config/db');

class VerificationService {
    /**
     * Generate a unique verification ID and hash for an intern.
     * Verification ID format: KKR-V-[Random8]
     * Verification Hash: SHA256(intern_id + joined_at + secret)
     */
    async generateVerification(internId) {
        const [rows] = await db.query('SELECT intern_id, joined_at, name, public_slug FROM interns WHERE intern_id = ?', [internId]);
        if (rows.length === 0) throw new Error('Intern not found');

        const intern = rows[0];
        const secret = process.env.JWT_SECRET || 'default_secret';

        // Generate unique ID
        const verificationId = `KKR-V-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

        // Generate hash
        const dataToHash = `${intern.intern_id}-${intern.joined_at}-${secret}`;
        const verificationHash = crypto.createHash('sha256').update(dataToHash).digest('hex');

        // Generate public slug: name-internID (e.g., jaeger-7)
        const slug = intern.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + intern.intern_id;

        await db.query(`
            UPDATE interns
            SET verification_id = ?,
                verification_hash = ?,
                public_slug = ?,
                is_public_profile = TRUE
            WHERE intern_id = ?
        `, [verificationId, verificationHash, slug, internId]);

        return { verificationId, verificationHash, slug };
    }

    async getBySlug(slug) {
        const [rows] = await db.query('SELECT * FROM interns WHERE public_slug = ? AND is_public_profile = TRUE', [slug]);
        return rows[0];
    }
}

module.exports = new VerificationService();

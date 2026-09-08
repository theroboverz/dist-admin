const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const KEY_HEX_LEN = 64; // 32 bytes = 64 hex chars

let _key = null;

function getKey() {
    if (_key) return _key;
    const hex = process.env.ENCRYPTION_KEY;
    if (!hex || hex.length !== KEY_HEX_LEN || !/^[0-9a-fA-F]+$/.test(hex)) {
        if (process.env.NODE_ENV === 'production') {
            throw new Error('ENCRYPTION_KEY is missing or invalid. Must be a 64-char hex string (32 bytes).');
        }
        // Dev fallback — NOT secure, only for local testing
        console.warn('[WARN] ENCRYPTION_KEY not set — using insecure dev key. Set a real key in production.');
        _key = Buffer.alloc(32, 1); // 0x01 repeated
    } else {
        _key = Buffer.from(hex, 'hex');
    }
    return _key;
}

/**
 * Encrypt plaintext with AES-256-GCM.
 * Returns a colon-separated base64 string: "iv:authTag:ciphertext"
 * Returns null for null/undefined/empty input.
 */
function encrypt(plaintext) {
    if (plaintext === null || plaintext === undefined || plaintext === '') return null;
    const text = String(plaintext);
    const key  = getKey();
    const iv   = crypto.randomBytes(12); // 96-bit IV for GCM
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return [
        iv.toString('base64'),
        authTag.toString('base64'),
        encrypted.toString('base64'),
    ].join(':');
}

/**
 * Decrypt a string produced by encrypt().
 * Returns plaintext string, or null on any failure.
 */
function decrypt(packed) {
    if (!packed || typeof packed !== 'string') return null;
    const parts = packed.split(':');
    if (parts.length !== 3) return null;
    try {
        const key     = getKey();
        const iv      = Buffer.from(parts[0], 'base64');
        const authTag = Buffer.from(parts[1], 'base64');
        const data    = Buffer.from(parts[2], 'base64');
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);
        return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
    } catch (err) {
        console.error('[ERROR] Decryption failed:', err.message);
        return null;
    }
}

module.exports = { encrypt, decrypt };

/**
 * Structured logger with IST timestamps.
 * No external dependencies — uses built-in console.
 */

function ts() {
    return new Date().toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false
    });
}

function fmt(level, msg, meta) {
    const metaStr = meta && Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
    return `[${ts()}] [${level}] ${msg}${metaStr}`;
}

const logger = {
    info(msg, meta = {}) {
        console.log(fmt('INFO ', msg, meta));
    },
    warn(msg, meta = {}) {
        console.warn(fmt('WARN ', msg, meta));
    },
    error(msg, meta = {}) {
        console.error(fmt('ERROR', msg, meta));
    },
    /**
     * AUDIT: for security-sensitive admin operations.
     * Always logged regardless of level setting.
     */
    audit(action, meta = {}) {
        console.log(fmt('AUDIT', action, meta));
    },
    /**
     * Request logger — call inside res.on('finish').
     */
    request(req, statusCode, durationMs) {
        const userId = req.user?.id || 'anon';
        const userRole = req.user?.role || req.user?.userType || '?';
        const ip = req.headers['x-forwarded-for'] || req.ip || 'unknown';
        console.log(fmt('REQ  ',
            `${req.method} ${req.originalUrl} → ${statusCode} (${durationMs}ms)`,
            { user: userId, role: userRole, ip }
        ));
    },
};

module.exports = logger;

/**
 * IST (Asia/Kolkata, UTC+5:30) date/time utilities.
 * Always use these instead of new Date().toISOString() on the server
 * to avoid UTC/IST mismatch on Linux servers.
 */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // +05:30 in ms

/** Returns a Date object shifted to IST wall-clock time */
function istNow() {
    return new Date(Date.now() + IST_OFFSET_MS);
}

/** YYYY-MM-DD in IST */
function istDateStr() {
    return istNow().toISOString().slice(0, 10);
}

/** YYYY-MM-DD HH:MM:SS in IST (MySQL DATETIME compatible) */
function istDateTimeStr() {
    return istNow().toISOString().slice(0, 19).replace('T', ' ');
}

/** IST hour (0-23) */
function istHour() {
    return istNow().getUTCHours();
}

/** IST minute (0-59) */
function istMinute() {
    return istNow().getUTCMinutes();
}

/** Validate YYYY-MM-DD */
function isValidDate(str) {
    if (!str || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
    const d = new Date(str + 'T00:00:00Z');
    return !isNaN(d.getTime());
}

/** Validate YYYY-MM */
function isValidYearMonth(str) {
    return str && /^\d{4}-\d{2}$/.test(str);
}

/** Format Date object to IST display string */
function formatIST(date) {
    if (!date) return '—';
    return new Date(date).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true
    });
}

module.exports = { istNow, istDateStr, istDateTimeStr, istHour, istMinute, isValidDate, isValidYearMonth, formatIST };

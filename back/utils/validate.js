/**
 * Input validation helpers — no external dependencies.
 */

const VALID_ATTENDANCE_STATUS = ['present', 'absent', 'half_day', 'late'];

/** Returns error string or null */

function month(val) {
    if (!val) return null;
    if (!/^\d{4}-\d{2}$/.test(val)) return 'month must be YYYY-MM format';
    return null;
}

function date(val) {
    if (!val) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(val) || isNaN(Date.parse(val)))
        return 'date must be a valid YYYY-MM-DD';
    return null;
}

function attendanceStatus(val) {
    if (!val) return 'status is required';
    if (!VALID_ATTENDANCE_STATUS.includes(val))
        return `status must be one of: ${VALID_ATTENDANCE_STATUS.join(', ')}`;
    return null;
}

function progress(val) {
    const n = parseInt(val);
    if (isNaN(n) || n < 0 || n > 100) return 'progress must be an integer 0–100';
    return null;
}

function pan(val) {
    if (!val) return null;
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(val.trim().toUpperCase()))
        return 'PAN must be in format AAAAA9999A (e.g. ABCDE1234F)';
    return null;
}

function aadhar(val) {
    if (!val) return null;
    const clean = String(val).replace(/\s/g, '');
    if (!/^\d{12}$/.test(clean)) return 'Aadhaar must be exactly 12 digits';
    return null;
}

function ifsc(val) {
    if (!val) return null;
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(val.trim().toUpperCase()))
        return 'IFSC must be 11 chars, format: ABCD0123456';
    return null;
}

function employeeId(val) {
    if (!val || !val.trim()) return 'employee_id is required';
    if (val.trim().length > 50) return 'employee_id must be ≤ 50 characters';
    if (!/^[A-Za-z0-9\-_]+$/.test(val.trim())) return 'employee_id may only contain letters, digits, - and _';
    return null;
}

function requiredString(val, name, maxLen = 255) {
    if (!val || !String(val).trim()) return `${name} is required`;
    if (String(val).trim().length > maxLen) return `${name} must be ≤ ${maxLen} characters`;
    return null;
}

function positiveInt(val, name) {
    const n = parseInt(val);
    if (isNaN(n) || n < 1) return `${name} must be a positive integer`;
    return null;
}

/**
 * Collect all non-null errors from an object of { field: errorStr|null }
 * Returns { field: errorMsg } for each failing field, or null if all pass.
 */
function collect(errMap) {
    const out = {};
    for (const [k, v] of Object.entries(errMap)) {
        if (v) out[k] = v;
    }
    return Object.keys(out).length ? out : null;
}

module.exports = {
    month, date, attendanceStatus, progress, pan, aadhar, ifsc,
    employeeId, requiredString, positiveInt, collect, VALID_ATTENDANCE_STATUS
};

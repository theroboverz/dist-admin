// Pure string-based HH:MM:SS time math for EOD deadline comparisons.
// Deliberately avoids JS Date/timezone conversion — created_at/deadline_time
// are treated as IST wall-clock strings throughout, matching dateUtils.js's
// istDateTimeStr() convention already used across the codebase.

function padTime(t) {
    // MySQL TIME columns come back as 'HH:MM:SS' already; guard against short forms.
    const [h = '00', m = '00', s = '00'] = String(t).split(':');
    return `${h.padStart(2, '0')}:${m.padStart(2, '0')}:${s.padStart(2, '0')}`;
}

function addMinutes(timeStr, minutes) {
    const [h, m, s] = padTime(timeStr).split(':').map(Number);
    let total = h * 60 + m + (minutes || 0);
    total = ((total % 1440) + 1440) % 1440; // wrap within a day
    const hh = Math.floor(total / 60);
    const mm = total % 60;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * @param {boolean} hasEod - whether an employee_eod_updates row exists for this date
 * @param {string|null} createdTimeStr - 'HH:MM:SS' time-of-day the EOD was created (IST), if hasEod
 * @param {{deadline_time:string, grace_minutes:number}} config
 * @param {string} dateStr - the date being evaluated, 'YYYY-MM-DD'
 * @param {string} todayStr - today's date in IST, 'YYYY-MM-DD'
 * @param {string} nowTimeStr - current time-of-day in IST, 'HH:MM:SS'
 * @returns {'Submitted'|'Late'|'Pending'|'Missing'}
 */
function computeEodStatus({ hasEod, createdTimeStr, config, dateStr, todayStr, nowTimeStr }) {
    const cutoff = addMinutes(config.deadline_time, config.grace_minutes || 0);
    if (hasEod) {
        return padTime(createdTimeStr) <= cutoff ? 'Submitted' : 'Late';
    }
    if (dateStr < todayStr) return 'Missing';
    if (dateStr === todayStr) {
        return nowTimeStr < cutoff ? 'Pending' : 'Missing';
    }
    return 'Pending'; // future date, not due yet
}

module.exports = { padTime, addMinutes, computeEodStatus };

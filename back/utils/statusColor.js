// Derives the Gantt's 4-color status (orange/blue/green/red) purely from
// backend status + deadline data. The frontend must never re-derive color.
//
// Priority: Completed always wins: green.
// Then Overdue: deadline has passed and the task isn't Completed: red.
// Then In Progress (actively being worked / submission pending review): blue.
// Everything else (Pending, On Hold, Rejected-not-yet-overdue, not started): orange.

function isPastDeadline(deadlineStr, todayStr) {
    return !!deadlineStr && deadlineStr < todayStr;
}

function employeeTaskColor(status, deadlineStr, todayStr) {
    if (status === 'Completed') return 'green';
    if (isPastDeadline(deadlineStr, todayStr)) return 'red';
    if (status === 'In Progress') return 'blue';
    return 'orange';
}

// submissionStatus is null/undefined when the intern hasn't submitted yet.
function internTaskColor(submissionStatus, deadlineStr, todayStr) {
    if (submissionStatus === 'approved') return 'green';
    if (isPastDeadline(deadlineStr, todayStr)) return 'red';
    if (submissionStatus === 'pending') return 'blue';
    return 'orange';
}

function projectColor(status, deadlineStr, todayStr) {
    if (status === 'Completed') return 'green';
    if (isPastDeadline(deadlineStr, todayStr)) return 'red';
    if (status === 'In Progress') return 'blue';
    return 'orange';
}

module.exports = { employeeTaskColor, internTaskColor, projectColor, isPastDeadline };

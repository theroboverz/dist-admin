// Derives the Gantt's 4-color status (red/blue/green/gray) purely from backend
// status data. The frontend must never re-derive color from rawStatus itself.

function employeeTaskColor(status) {
    switch (status) {
        case 'Pending': return 'red';
        case 'In Progress': return 'blue';
        case 'Completed': return 'green';
        case 'On Hold': return 'gray';
        default: return 'gray';
    }
}

// submissionStatus is null/undefined when the intern hasn't submitted yet.
function internTaskColor(submissionStatus) {
    switch (submissionStatus) {
        case null:
        case undefined: return 'red';
        case 'pending': return 'blue';
        case 'approved': return 'green';
        case 'rejected': return 'gray';
        default: return 'gray';
    }
}

function projectColor(status) {
    switch (status) {
        case 'Pending': return 'red';
        case 'In Progress': return 'blue';
        case 'Completed': return 'green';
        case 'On Hold':
        case 'Cancelled':
        default: return 'gray';
    }
}

module.exports = { employeeTaskColor, internTaskColor, projectColor };

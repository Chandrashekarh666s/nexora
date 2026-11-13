// Pure authorization rules. The backend, not the UI, decides access.
const ROLES = Object.freeze({
  STUDENT: 'STUDENT',
  STUDENT_COORDINATOR: 'STUDENT_COORDINATOR',
  FACULTY_COORDINATOR: 'FACULTY_COORDINATOR',
});

const isFaculty = (actor) => !!actor && actor.role === ROLES.FACULTY_COORDINATOR;

// isAssigned comes from the coordinator-assignment records (slice 2). Until those exist it is always false,
// so coordinators get no access to other students' records.
function canViewStudent(actor, targetId, { isAssigned = false } = {}) {
  if (!actor) return false;
  if (String(actor.id) === String(targetId)) return true;
  if (isFaculty(actor)) return true;
  if (actor.role === ROLES.STUDENT_COORDINATOR) return isAssigned === true;
  return false;
}

module.exports = { ROLES, isFaculty, canViewStudent };

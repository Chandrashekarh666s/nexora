// Who can see which students. Faculty: all. Coordinator: only students in an assigned semester+section. Student: nobody else.
const Assignment = require('../models/Assignment');
const User = require('../models/User');
const { ROLES } = require('./rbac');
const NOBODY = { _id: { $in: [] } };

async function studentFilter(actor) {
  if (actor.role === ROLES.FACULTY_COORDINATOR) return { role: { $in: [ROLES.STUDENT, ROLES.STUDENT_COORDINATOR] } };
  if (actor.role === ROLES.STUDENT_COORDINATOR) {
    const as = await Assignment.find({ coordinatorId: actor.id }).lean();
    if (!as.length) return NOBODY;
    return { role: ROLES.STUDENT, $or: as.map((a) => ({ semester: a.semester, section: a.section })) };
  }
  return NOBODY;
}
// Returns the student if the actor may see them, else null (callers answer 403 for both "missing" and "not yours").
async function visibleStudent(actor, id) {
  const f = await studentFilter(actor);
  return User.findOne({ $and: [f, { _id: id }] });
}
module.exports = { studentFilter, visibleStudent };

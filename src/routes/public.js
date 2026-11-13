const express = require('express');
const User = require('../models/User');
const { ROLES } = require('../lib/rbac');
const { wrap } = require('../middleware/errors');

const router = express.Router();

// Only figures that exist in the database are returned. Fields for features not built yet are null,
// and the UI shows them as unavailable instead of inventing numbers.
router.get('/stats', wrap(async (req, res) => {
  const registeredStudents = await User.countDocuments({
    role: { $in: [ROLES.STUDENT, ROLES.STUDENT_COORDINATOR] },
    status: 'ACTIVE',
  });
  res.set('Cache-Control', 'public, max-age=30');
  res.json({ data: { registeredStudents, problemsSolved: null, challengesPublished: null, currentCompetition: null } });
}));

module.exports = router;

const mongoose = require('mongoose');
const { ROLES } = require('../lib/rbac');
// Privileged accounts are created only by redeeming a faculty-issued, single-use, expiring invite.
// Only a SHA-256 hash of the code is stored, so a database leak does not leak usable codes.
const schema = new mongoose.Schema({
  codeHash: { type: String, required: true, unique: true },
  role: { type: String, enum: [ROLES.STUDENT_COORDINATOR, ROLES.FACULTY_COORDINATOR], required: true },
  note: { type: String, default: '', maxlength: 120 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  expiresAt: { type: Date, required: true },
  usedAt: { type: Date, default: null },
  usedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: { createdAt: true, updatedAt: false } });
module.exports = mongoose.models.Invite || mongoose.model('Invite', schema);

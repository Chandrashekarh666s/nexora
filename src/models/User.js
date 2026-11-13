const mongoose = require('mongoose');
const { ROLES } = require('../lib/rbac');

const needsAcademic = function () { return this.role !== ROLES.FACULTY_COORDINATOR; };

const schema = new mongoose.Schema({
  fullName: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
  identifier: { type: String, required: true, unique: true, uppercase: true, trim: true }, // USN or employee ID
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: Object.values(ROLES), default: ROLES.STUDENT, required: true },
  semester: { type: Number, min: 1, max: 8, required: needsAcademic },
  section: { type: String, uppercase: true, trim: true, required: needsAcademic },
  status: { type: String, enum: ['ACTIVE', 'SUSPENDED', 'PENDING'], default: 'ACTIVE' },
  mustChangePassword: { type: Boolean, default: false },
  tokenVersion: { type: Number, default: 0 },
  failedLoginCount: { type: Number, default: 0 },
  lockUntil: { type: Date, default: null },
  lastLoginAt: { type: Date, default: null },
  leetcodeUsername: { type: String, default: null, trim: true },
  githubUsername: { type: String, default: null, trim: true },
  integrations: { type: mongoose.Schema.Types.Mixed, default: {} }, // synced public data, display only, never used for scoring
  profile: { house: { type: String, enum: ['Turing', 'Ada', 'Hopper', 'Linus', null], default: null } },
}, { timestamps: true });

schema.index({ role: 1, status: 1 });

schema.methods.toPublic = function () {
  return {
    id: this._id.toString(),
    fullName: this.fullName,
    identifier: this.identifier,
    email: this.email,
    role: this.role,
    semester: this.semester ?? null,
    section: this.section ?? null,
    status: this.status,
    mustChangePassword: this.mustChangePassword,
    house: this.profile?.house ?? null,
    createdAt: this.createdAt,
    lastLoginAt: this.lastLoginAt,
    leetcodeUsername: this.leetcodeUsername ?? null,
    githubUsername: this.githubUsername ?? null,
    integrations: this.integrations || {},
  };
};

module.exports = mongoose.models.User || mongoose.model('User', schema);

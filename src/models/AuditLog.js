const mongoose = require('mongoose');

// Append-only by convention: no route updates or deletes these. In production also give the app's
// database user insert/find rights only on this collection.
const schema = new mongoose.Schema({
  action: { type: String, required: true, index: true },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  actorRole: { type: String, default: null },
  targetId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  ip: { type: String, default: null },
  userAgent: { type: String, default: null },
  meta: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: { createdAt: true, updatedAt: false } });

schema.index({ createdAt: -1 });

module.exports = mongoose.models.AuditLog || mongoose.model('AuditLog', schema);

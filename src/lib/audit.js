const AuditLog = require('../models/AuditLog');

// Audit failures are logged but never break the request.
async function audit(req, action, { actor, targetId, meta } = {}) {
  try {
    await AuditLog.create({
      action,
      actorId: actor?.id || req?.user?.id || null,
      actorRole: actor?.role || req?.user?.role || null,
      targetId: targetId || null,
      ip: req?.ip || null,
      userAgent: String(req?.get?.('user-agent') || '').slice(0, 200),
      meta: meta || {},
    });
  } catch (e) {
    console.error('audit write failed:', action, e.message);
  }
}

module.exports = { audit };

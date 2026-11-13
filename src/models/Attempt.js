const mongoose = require('mongoose');
// First time a student opened a problem. The server owns this clock, so Timeliness cannot be faked from the browser.
const schema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, required: true },
  problemId: { type: mongoose.Schema.Types.ObjectId, required: true },
  openedAt: { type: Date, default: Date.now },
});
schema.index({ studentId: 1, problemId: 1 }, { unique: true });
module.exports = mongoose.models.Attempt || mongoose.model('Attempt', schema);

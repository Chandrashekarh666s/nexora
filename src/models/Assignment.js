const mongoose = require('mongoose');
// Faculty -> Coordinator -> Section. One coordinator may hold many sections; a section may have many coordinators.
const schema = new mongoose.Schema({
  coordinatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  semester: { type: Number, min: 1, max: 8, required: true },
  section: { type: String, uppercase: true, trim: true, required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: { createdAt: true, updatedAt: false } });
schema.index({ coordinatorId: 1, semester: 1, section: 1 }, { unique: true });
module.exports = mongoose.models.Assignment || mongoose.model('Assignment', schema);

const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  coordinatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  note: { type: String, required: true, maxlength: 1000 },
  problemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Problem', default: null }, // targeted practice
  followUpDate: { type: Date, default: null },
  status: { type: String, enum: ['OPEN', 'FOLLOWED_UP', 'CLOSED'], default: 'OPEN' },
}, { timestamps: true });
module.exports = mongoose.models.Intervention || mongoose.model('Intervention', schema);

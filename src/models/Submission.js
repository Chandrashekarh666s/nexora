const mongoose = require('mongoose');
// Every graded attempt is stored separately. INTERNAL_ERROR means OUR/Judge0's failure, never the student's.
const VERDICTS = ['ACCEPTED', 'WRONG_ANSWER', 'COMPILATION_ERROR', 'RUNTIME_ERROR', 'TIME_LIMIT_EXCEEDED', 'MEMORY_LIMIT_EXCEEDED', 'INTERNAL_ERROR'];
const schema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  problemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Problem', required: true },
  language: { type: String, enum: ['c', 'cpp', 'java', 'python', 'javascript'], required: true },
  code: { type: String, required: true, maxlength: 20000 },
  verdict: { type: String, enum: VERDICTS, required: true },
  passed: { type: Number, default: 0 }, total: { type: Number, default: 0 },
  runtimeMs: { type: Number, default: null }, memoryKb: { type: Number, default: null },
  attempt: { type: Number, default: 1 },
  elapsedSec: { type: Number, default: null }, // first-open -> submit, measured by the server
  failedTestIndex: { type: Number, default: null }, // position only; never the hidden data
  systemFailure: { type: Boolean, default: false },
}, { timestamps: { createdAt: true, updatedAt: false } });
schema.index({ studentId: 1, createdAt: -1 });
schema.index({ problemId: 1, studentId: 1 });
module.exports = mongoose.models.Submission || mongoose.model('Submission', schema);
module.exports.VERDICTS = VERDICTS;

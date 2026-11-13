const mongoose = require('mongoose');
const test = new mongoose.Schema({ input: { type: String, default: '', maxlength: 10000 }, expected: { type: String, required: true, maxlength: 10000 }, hidden: { type: Boolean, default: false } }, { _id: false });
const schema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 120 },
  statement: { type: String, required: true, maxlength: 8000 },
  inputFormat: { type: String, default: '', maxlength: 2000 },
  outputFormat: { type: String, default: '', maxlength: 2000 },
  constraints: { type: String, default: '', maxlength: 2000 },
  difficulty: { type: String, enum: ['EASY', 'MEDIUM', 'HARD'], required: true },
  subject: { type: String, default: '', trim: true, maxlength: 60 },
  topic: { type: String, default: 'General', trim: true, maxlength: 60 },
  examples: [{ _id: false, input: String, output: String, explanation: { type: String, default: '' } }],
  tests: { type: [test], validate: (v) => v.length > 0 && v.some((t) => !t.hidden) }, // at least one public sample
  targetSemester: { type: Number, min: 1, max: 8, default: null },
  targetSeconds: { type: Number, min: 60, max: 14400, default: 1800 }, // "expected time" used for the Timeliness pillar
  deadline: { type: Date, default: null },
  status: { type: String, enum: ['DRAFT', 'PUBLISHED'], default: 'DRAFT', index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  publishedAt: { type: Date, default: null },
}, { timestamps: true });
// What a student may see. Hidden tests and every expected output of a hidden test never leave the server.
schema.methods.toStudent = function () {
  return { id: this.id, title: this.title, statement: this.statement, inputFormat: this.inputFormat, outputFormat: this.outputFormat,
    constraints: this.constraints, difficulty: this.difficulty, subject: this.subject, topic: this.topic, examples: this.examples,
    samples: this.tests.filter((t) => !t.hidden).map((t) => ({ input: t.input, expected: t.expected })), hiddenTestCount: this.tests.filter((t) => t.hidden).length,
    targetSeconds: this.targetSeconds, deadline: this.deadline, targetSemester: this.targetSemester, publishedAt: this.publishedAt };
};
schema.methods.toStaff = function () {
  return { ...this.toStudent(), status: this.status, tests: this.tests, createdBy: String(this.createdBy), publishedBy: this.publishedBy ? String(this.publishedBy) : null };
};
module.exports = mongoose.models.Problem || mongoose.model('Problem', schema);

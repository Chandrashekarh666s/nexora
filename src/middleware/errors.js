const { ZodError } = require('zod');

class AppError extends Error {
  constructor(status, code, message, fields) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, fields: err.fields } });
  }
  if (err instanceof ZodError) {
    const fields = Object.fromEntries(err.issues.map((i) => [i.path.join('.') || '_', i.message]));
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'Check the highlighted fields.', fields } });
  }
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'The request body is not valid JSON.' } });
  }
  if (err && err.code === 11000) {
    return res.status(409).json({ error: { code: 'DUPLICATE', message: 'An account with this USN or email already exists.' } });
  }
  if (err && err.name === 'ValidationError') {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'Some fields are invalid.' } });
  }
  console.error(err);
  return res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong on our side. Try again.' } });
}

module.exports = { AppError, wrap, errorHandler };

// Pure validation rules. No I/O, so they are unit-testable.
const USN_RE = /^[A-Z0-9]{6,20}$/;

const normalizeUsn = (s) => String(s || '').trim().toUpperCase();
const normalizeEmail = (s) => String(s || '').trim().toLowerCase();

// bcrypt only uses the first 72 bytes, so longer passwords are rejected rather than silently truncated.
function passwordProblems(password, ctx = {}) {
  const pw = String(password ?? '');
  const problems = [];
  if (pw.length < 10) problems.push('Use at least 10 characters.');
  if (Buffer.byteLength(pw, 'utf8') > 72) problems.push('Use at most 72 bytes.');
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) problems.push('Include at least one letter and one number.');
  const low = pw.toLowerCase();
  if (ctx.identifier && low.includes(String(ctx.identifier).toLowerCase())) {
    problems.push('Do not include your USN or employee ID.');
  }
  const local = ctx.email ? String(ctx.email).split('@')[0].toLowerCase() : '';
  if (local.length >= 4 && low.includes(local)) problems.push('Do not include your email name.');
  return problems;
}

module.exports = { USN_RE, normalizeUsn, normalizeEmail, passwordProblems };

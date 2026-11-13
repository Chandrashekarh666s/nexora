// Server-side Judge0 client. The browser never sees the key and code never runs inside Node.
const config = require('../config');
const LANG = { c: 50, cpp: 54, java: 62, python: 71, javascript: 63 }; // Judge0 CE language ids
const b64 = (s) => Buffer.from(String(s ?? ''), 'utf8').toString('base64');
const unb64 = (s) => (s ? Buffer.from(s, 'base64').toString('utf8') : '');
const configured = () => !!config.judge0Url;

function headers() {
  const h = { 'Content-Type': 'application/json' };
  if (config.judge0Key) { // works for self-hosted (X-Auth-Token) and RapidAPI-hosted Judge0
    h['X-Auth-Token'] = config.judge0Key; h['X-RapidAPI-Key'] = config.judge0Key;
    try { h['X-RapidAPI-Host'] = new URL(config.judge0Url).host; } catch { /* ignore */ }
  }
  return h;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// -> { status: 'OK'|'COMPILATION_ERROR'|'RUNTIME_ERROR'|'TIME_LIMIT_EXCEEDED'|'MEMORY_LIMIT_EXCEEDED'|'INTERNAL_ERROR', stdout, stderr, timeMs, memoryKb }
async function execute({ language, code, stdin }) {
  try {
    const create = await fetch(`${config.judge0Url}/submissions?base64_encoded=true&wait=false`, {
      method: 'POST', headers: headers(), signal: AbortSignal.timeout(10000),
      body: JSON.stringify({ language_id: LANG[language], source_code: b64(code), stdin: b64(stdin), cpu_time_limit: 3, memory_limit: 256000 }),
    });
    if (!create.ok) return { status: 'INTERNAL_ERROR', stderr: `Judge0 returned HTTP ${create.status}` };
    const { token } = await create.json();
    for (let i = 0; i < 25; i++) {
      await sleep(i < 3 ? 400 : 800);
      const r = await fetch(`${config.judge0Url}/submissions/${token}?base64_encoded=true`, { headers: headers(), signal: AbortSignal.timeout(10000) });
      if (!r.ok) return { status: 'INTERNAL_ERROR', stderr: `Judge0 returned HTTP ${r.status}` };
      const j = await r.json(); const id = j.status && j.status.id;
      if (id <= 2) continue; // queued / processing
      const base = { stdout: unb64(j.stdout), stderr: unb64(j.stderr) || unb64(j.compile_output), timeMs: j.time != null ? Math.round(parseFloat(j.time) * 1000) : null, memoryKb: j.memory ?? null };
      if (id === 3 || id === 4) return { status: 'OK', ...base };
      if (id === 5) return { status: 'TIME_LIMIT_EXCEEDED', ...base };
      if (id === 6) return { status: 'COMPILATION_ERROR', ...base };
      if (id >= 7 && id <= 12) return { status: j.memory && j.memory >= 250000 ? 'MEMORY_LIMIT_EXCEEDED' : 'RUNTIME_ERROR', ...base };
      return { status: 'INTERNAL_ERROR', ...base };
    }
    return { status: 'INTERNAL_ERROR', stderr: 'Judge0 timed out' };
  } catch (e) { return { status: 'INTERNAL_ERROR', stderr: 'Judge0 unreachable: ' + e.message }; }
}

const norm = (s) => String(s ?? '').replace(/\r/g, '').split('\n').map((l) => l.replace(/\s+$/, '')).join('\n').replace(/\n+$/, '');
const same = (a, b) => norm(a) === norm(b);

// Grade `tests` in order; stops comparing detail but runs all so pass counts are real.
async function grade({ language, code, tests }) {
  const results = [];
  for (let i = 0; i < tests.length; i += 4) { // 4 at a time, kind to the provider
    const chunk = await Promise.all(tests.slice(i, i + 4).map((t) => execute({ language, code, stdin: t.input })));
    results.push(...chunk);
  }
  let passed = 0, verdict = 'ACCEPTED', failed = null, system = false;
  const rank = { COMPILATION_ERROR: 5, RUNTIME_ERROR: 4, MEMORY_LIMIT_EXCEEDED: 4, TIME_LIMIT_EXCEEDED: 3, WRONG_ANSWER: 2, INTERNAL_ERROR: 9 }; let best = 0;
  results.forEach((r, i) => {
    let v = r.status === 'OK' ? (same(r.stdout, tests[i].expected) ? 'ACCEPTED' : 'WRONG_ANSWER') : r.status;
    if (v === 'ACCEPTED') passed++; else { if (failed === null) failed = i; if ((rank[v] || 1) > best) { best = rank[v] || 1; verdict = v; } if (v === 'INTERNAL_ERROR') system = true; }
  });
  if (system) verdict = 'INTERNAL_ERROR'; // a provider failure is never reported as the student's failure
  const ok = results.filter((r) => r.timeMs != null);
  return { verdict, passed, total: tests.length, failedTestIndex: failed, systemFailure: system, results,
    runtimeMs: ok.length ? Math.max(...ok.map((r) => r.timeMs)) : null, memoryKb: ok.length ? Math.max(...ok.map((r) => r.memoryKb || 0)) || null : null };
}
module.exports = { LANG, configured, execute, grade, same };

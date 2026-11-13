/* Coding Arena: Monaco editor + Run (samples) / Submit (all tests). Code is only ever sent to OUR backend, which talks to Judge0. */
(function () {
'use strict';
const $ = (s) => document.querySelector(s), E = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const id = new URLSearchParams(location.search).get('id'), MONACO = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs';
const START = {
  python: 'import sys\n\ndef main():\n    data = sys.stdin.read().split()\n    # write your solution\n    print()\n\nmain()\n',
  cpp: '#include <bits/stdc++.h>\nusing namespace std;\nint main(){\n    ios::sync_with_stdio(false);\n    // write your solution\n    return 0;\n}\n',
  c: '#include <stdio.h>\nint main(void){\n    /* write your solution */\n    return 0;\n}\n',
  java: 'import java.util.*;\npublic class Main {\n    public static void main(String[] args) {\n        Scanner in = new Scanner(System.in);\n        // write your solution\n    }\n}\n',
  javascript: "const lines = require('fs').readFileSync(0, 'utf8').split('\\n');\n// write your solution\nconsole.log();\n",
};
const MLANG = { python: 'python', cpp: 'cpp', c: 'c', java: 'java', javascript: 'javascript' };
let ed = null, lang = localStorage.getItem('nx-lang') || 'python', busy = false;
const key = () => `nx-draft:${id}:${lang}`;
const toast = (m) => { const t = $('#toast'); t.textContent = m; t.classList.add('on'); setTimeout(() => t.classList.remove('on'), 3000); };
async function api(p, o) {
  o = o || {}; let r, d = null; try { r = await fetch('/api' + p, { credentials: 'same-origin', method: o.method || 'GET', headers: { 'Content-Type': 'application/json' }, body: o.body === undefined ? undefined : JSON.stringify(o.body) }); } catch (e) { throw new Error('Cannot reach the server.'); }
  try { d = await r.json(); } catch (e) { /* none */ }
  if (!r.ok) { if (r.status === 401) location.href = '/'; const e = d && d.error; throw Object.assign(new Error(e ? e.message + (e.fields ? ' ' + Object.values(e.fields).join(' ') : '') : 'Request failed.'), { code: e && e.code }); }
  return d.data;
}
const get = () => (ed ? ed.get() : ''), set = (v) => ed && ed.set(v);
function fallback(host) { host.innerHTML = '<textarea spellcheck="false" aria-label="Code editor"></textarea>'; const t = host.firstChild; ed = { get: () => t.value, set: (v) => { t.value = v; }, lang: () => {} }; t.addEventListener('input', save); }
function loadMonaco(host) {
  return new Promise((resolve) => {
    const s = document.createElement('script'), timer = setTimeout(() => { fallback(host); resolve(); }, 9000);
    s.src = MONACO + '/loader.js'; s.onerror = () => { clearTimeout(timer); fallback(host); resolve(); };
    s.onload = () => {
      window.MonacoEnvironment = { getWorkerUrl: () => URL.createObjectURL(new Blob([`self.MonacoEnvironment={baseUrl:'${MONACO}/../'};importScripts('${MONACO}/base/worker/workerMain.js');`], { type: 'text/javascript' })) };
      window.require.config({ paths: { vs: MONACO } });
      window.require(['vs/editor/editor.main'], () => { clearTimeout(timer); const m = window.monaco.editor.create(host, { value: '', language: MLANG[lang], theme: 'vs-dark', automaticLayout: true, minimap: { enabled: false }, fontSize: 14, scrollBeyondLastLine: false });
        ed = { get: () => m.getValue(), set: (v) => m.setValue(v), lang: (l) => window.monaco.editor.setModelLanguage(m.getModel(), MLANG[l]) }; m.onDidChangeModelContent(save); m.addCommand(window.monaco.KeyMod.CtrlCmd | window.monaco.KeyCode.Enter, run); resolve(); }, () => { clearTimeout(timer); fallback(host); resolve(); });
    };
    document.head.appendChild(s);
  });
}
let st; const save = () => { clearTimeout(st); st = setTimeout(() => { try { localStorage.setItem(key(), get()); } catch (e) { /* storage full or blocked */ } }, 400); };
function loadDraft() { let v = null; try { v = localStorage.getItem(key()); } catch (e) { /* ignore */ } set(v == null ? START[lang] : v); if (ed) ed.lang(lang); }
const vcol = (v) => ({ ACCEPTED: 'ok', WRONG_ANSWER: 'bad', COMPILATION_ERROR: 'bad', RUNTIME_ERROR: 'bad', TIME_LIMIT_EXCEEDED: 'warn', MEMORY_LIMIT_EXCEEDED: 'warn', INTERNAL_ERROR: 'mut' }[v] || '');
const vname = (v) => String(v).replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());
function lock(b) { busy = b; ['run', 'sub', 'cust'].forEach((x) => ($('#' + x).disabled = b)); }
async function run() {
  if (busy) return; lock(true); $('#res').innerHTML = '<span class="mut">Running samples…</span>';
  try { const d = await api(`/problems/${id}/run`, { method: 'POST', body: { language: lang, code: get() } });
    $('#res').innerHTML = `<p><b class="${vcol(d.verdict)}">${vname(d.verdict)}</b> · ${d.passed}/${d.total} sample tests passed · <span class="mut">Run awards no points and does not mark the problem solved.</span></p><table><tr><th>Input</th><th>Expected</th><th>Your output</th><th>Result</th></tr>${d.results.map((r) => `<tr><td><pre class="o">${E(r.input)}</pre></td><td><pre class="o">${E(r.expected)}</pre></td><td><pre class="o">${E(r.actual)}${r.stderr ? '\n' + E(r.stderr) : ''}</pre></td><td class="${vcol(r.status === 'OK' ? (r.actual.trim() === r.expected.trim() ? 'ACCEPTED' : 'WRONG_ANSWER') : r.status)}">${r.status === 'OK' ? (r.actual.trim() === r.expected.trim() ? 'Pass' : 'Fail') : vname(r.status)}${r.runtimeMs != null ? '<br><span class="mut">' + r.runtimeMs + ' ms</span>' : ''}</td></tr>`).join('')}</table>`;
  } catch (e) { $('#res').innerHTML = `<p class="${e.code === 'EXECUTION_NOT_CONFIGURED' ? 'warn' : 'bad'}">${E(e.message)}</p>`; } lock(false);
}
async function submit() {
  if (busy) return; lock(true); $('#res').innerHTML = '<span class="mut">Grading against all tests…</span>';
  try { const { submission: s } = await api(`/problems/${id}/submit`, { method: 'POST', body: { language: lang, code: get() } });
    $('#res').innerHTML = `<p style="font-size:16px"><b class="${vcol(s.verdict)}">${vname(s.verdict)}</b> · ${s.passed}/${s.total} tests · attempt ${s.attempt}${s.late ? ' · <span class="warn">after deadline</span>' : ''}</p><p class="mut">Runtime ${s.runtimeMs == null ? 'n/a' : s.runtimeMs + ' ms'} · Memory ${s.memoryKb == null ? 'n/a' : Math.round(s.memoryKb / 1024) + ' MB'} (as reported by the judge)${s.failedTest ? ` · first failure: ${s.failedTest.hidden ? 'a hidden test' : 'sample test'} #${s.failedTest.position}` : ''}</p>${s.note ? `<p class="warn">${E(s.note)}</p>` : ''}<p class="mut">Saved to your submission history. Your dashboard and crown update from this result.</p>`;
  } catch (e) { $('#res').innerHTML = `<p class="${e.code === 'EXECUTION_NOT_CONFIGURED' ? 'warn' : 'bad'}">${E(e.message)}</p>`; } lock(false);
}
function custom() {
  const t = prompt('Custom input (stdin). Runs your code once with this input; nothing is graded or saved.', ''); if (t === null || busy) return; lock(true); $('#res').innerHTML = '<span class="mut">Running…</span>';
  api(`/problems/${id}/run`, { method: 'POST', body: { language: lang, code: get(), customInput: t } }).then((d) => { $('#res').innerHTML = `<p><b class="${vcol(d.status === 'OK' ? 'ACCEPTED' : d.status)}">${d.status === 'OK' ? 'Finished' : vname(d.status)}</b>${d.runtimeMs != null ? ' · ' + d.runtimeMs + ' ms' : ''}</p><pre class="o">${E(d.stdout)}${d.stderr ? '\n' + E(d.stderr) : ''}</pre>`; }).catch((e) => { $('#res').innerHTML = `<p class="bad">${E(e.message)}</p>`; }).then(() => lock(false));
}
(async () => {
  if (!id) { $('#pp').textContent = 'No problem selected. Go back to Practice.'; return; }
  try {
    const [d, me] = await Promise.all([api('/problems/' + id), api('/auth/me')]), p = d.problem; $('#who').textContent = me.user.fullName;
    $('#pp').innerHTML = `${d.execution === 'NOT_CONFIGURED' ? '<div class="ban">Code execution is not configured on this server yet (Judge0). You can read the problem and write code, but Run and Submit are blocked until the administrator sets JUDGE0_API_URL.</div>' : ''}<h1>${E(p.title)}</h1><p style="margin:0"><span class="${p.difficulty}">${p.difficulty}</span> · ${E(p.subject || 'General')} · ${E(p.topic)}${p.deadline ? ' · due ' + new Date(p.deadline).toLocaleString() : ''} · target ${Math.round(p.targetSeconds / 60)} min</p><p style="margin-top:14px">${E(p.statement)}</p>
    ${p.inputFormat ? '<h4>Input</h4><p>' + E(p.inputFormat) + '</p>' : ''}${p.outputFormat ? '<h4>Output</h4><p>' + E(p.outputFormat) + '</p>' : ''}${p.constraints ? '<h4>Constraints</h4><p>' + E(p.constraints) + '</p>' : ''}
    <h4>Examples</h4>${(p.examples.length ? p.examples : p.samples.map((s) => ({ input: s.input, output: s.expected, explanation: '' }))).map((x, i) => `<p style="margin:8px 0 4px"><b>Example ${i + 1}</b></p><pre>Input:\n${E(x.input)}\n\nOutput:\n${E(x.output)}</pre>${x.explanation ? '<p>' + E(x.explanation) + '</p>' : ''}`).join('')}
    <p class="mut" style="margin-top:14px">${p.hiddenTestCount} hidden test${p.hiddenTestCount === 1 ? '' : 's'} are also used when you Submit.</p>
    ${d.history.length ? '<h4>Your attempts</h4><table>' + d.history.map((h) => `<tr><td>#${h.attempt}</td><td class="${vcol(h.verdict)}">${vname(h.verdict)}</td><td>${h.passed}/${h.total}</td><td class="mut">${new Date(h.at).toLocaleString()}</td></tr>`).join('') + '</table>' : ''}`;
    $('#lang').value = START[lang] ? lang : 'python'; lang = $('#lang').value;
    await loadMonaco($('#mon')); loadDraft();
    $('#lang').onchange = () => { save(); lang = $('#lang').value; localStorage.setItem('nx-lang', lang); loadDraft(); };
    $('#reset').onclick = () => { if (confirm('Reset to the starter code?')) set(START[lang]); }; $('#run').onclick = run; $('#sub').onclick = submit; $('#cust').onclick = custom;
  } catch (e) { $('#pp').innerHTML = `<p class="bad">${E(e.message)}</p><p><a href="/dashboard.html#practice">Back to Practice</a></p>`; }
})();
})();

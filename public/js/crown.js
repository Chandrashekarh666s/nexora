/* LeaderboardCrown: data-driven 3D gold crown. No sliders, no buttons: it only reflects the numbers it is given.
   LeaderboardCrown.render(studentId | element, metrics [, {size}])  -> { fill, mastery, pillars }
     metrics = { pillars:{correctness,timeliness,consistency} }  (0..1, what the NEXORA backend returns)
            or { testsPassed, testsTotal, timeUsedSec, timeTargetSec, streakDays }  (raw)  -> see crown-core.js
   Calling render() again on the same slot makes the gold rise or drain smoothly. */
(function (root) {
  var Core = root.CrownCore, SVGNS = 'http://www.w3.org/2000/svg', uid = 0;
  var SIL = 'M16 142 L18 48 L38 96 L59 36 L80 96 L100 18 L120 96 L141 36 L162 96 L182 48 L184 142 Z';
  var TOP = 22, BOTTOM = 170; // liquid travels between these y values
  var CSS = '.nxc{position:relative;display:inline-block;line-height:0}.nxc svg{width:100%;height:auto;overflow:visible}' +
    '.nxc .liq{transition:transform 1.4s cubic-bezier(.22,.8,.25,1)}.nxc .wv1{animation:nxw 4.2s linear infinite}.nxc .wv2{animation:nxw 6.5s linear infinite reverse;opacity:.55}' +
    '@keyframes nxw{to{transform:translateX(-80px)}}' +
    '.nxc .stud,.nxc .sap,.nxc .dia{filter:saturate(.25) brightness(.55);transition:filter .9s}' +
    '.nxc.l1 .stud{filter:saturate(1.2) brightness(1.15) drop-shadow(0 0 2.5px currentColor)}.nxc.l2 .sap{filter:saturate(1.3) brightness(1.2) drop-shadow(0 0 6px #22d3ee)}' +
    '.nxc.l3 .dia{filter:brightness(1.4) drop-shadow(0 0 8px #ffb300)}' +
    '.nxc .fx{opacity:0;transition:opacity .8s}.nxc.l3 .fx{opacity:1}' +
    '.nxc .rays{transform-origin:100px 20px;animation:nxr 9s linear infinite}@keyframes nxr{to{transform:rotate(360deg)}}' +
    '.nxc .ring{transform-origin:100px 20px;animation:nxs 2.8s ease-out infinite;opacity:0}.nxc .ring2{animation-delay:1.4s}' +
    '@keyframes nxs{0%{transform:scale(.1);opacity:.85}100%{transform:scale(2.6);opacity:0}}' +
    '.nxc .sheen{animation:nxh 3.6s ease-in-out infinite}@keyframes nxh{0%{transform:translateX(-120px)}60%,100%{transform:translateX(260px)}}' +
    '.nxc .ember{animation:nxe 3.2s ease-in infinite;opacity:0}@keyframes nxe{0%{transform:translateY(0);opacity:0}15%{opacity:.95}100%{transform:translateY(-70px);opacity:0}}' +
    '@media(prefers-reduced-motion:reduce){.nxc *{animation:none!important;transition:none!important}}';
  function ensureCss() { if (document.getElementById('nxc-css')) return; var s = document.createElement('style'); s.id = 'nxc-css'; s.textContent = CSS; document.head.appendChild(s); }
  function wave(y) { var d = 'M-40 ' + y; for (var x = -40; x < 280; x += 40) d += ' q10 -5 20 0 t20 0'; return d + ' V240 H-40 Z'; }
  function hex(cx, cy, r) { var p = []; for (var i = 0; i < 6; i++) { var a = Math.PI / 3 * i - Math.PI / 2; p.push((cx + r * Math.cos(a)).toFixed(1) + ',' + (cy + r * Math.sin(a)).toFixed(1)); } return p.join(' '); }
  function build(el) {
    var i = ++uid, studs = [[30, '#ff4d6d'], [52, '#34d399'], [74, '#60a5fa'], [126, '#60a5fa'], [148, '#34d399'], [170, '#ff4d6d']], emb = '';
    for (var k = 0; k < 7; k++) emb += '<circle class="ember" cx="' + (70 + k * 10) + '" cy="40" r="1.8" fill="#ffc933" style="animation-delay:' + (k * 0.45).toFixed(2) + 's"/>';
    var rays = ''; for (var r = 0; r < 12; r++) rays += '<line x1="100" y1="20" x2="100" y2="-48" stroke="#ffd45e" stroke-width="2" opacity=".5" transform="rotate(' + r * 30 + ' 100 20)"/>';
    el.classList.add('nxc');
    el.innerHTML = '<svg viewBox="0 0 200 190" role="img" aria-label="Crown progress"><defs>' +
      '<linearGradient id="g' + i + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff0b0"/><stop offset=".45" stop-color="#e5a823"/><stop offset="1" stop-color="#7a4c08"/></linearGradient>' +
      '<linearGradient id="e' + i + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#23262c"/><stop offset="1" stop-color="#121418"/></linearGradient>' +
      '<linearGradient id="l' + i + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe27a"/><stop offset=".5" stop-color="#f4ae1e"/><stop offset="1" stop-color="#b9740a"/></linearGradient>' +
      '<linearGradient id="s' + i + '" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".38"/><stop offset=".35" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".5"/></linearGradient>' +
      '<linearGradient id="h' + i + '" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>' +
      '<radialGradient id="b' + i + '" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#bff4ff"/><stop offset=".45" stop-color="#1d8fd6"/><stop offset="1" stop-color="#0a2d6b"/></radialGradient>' +
      '<clipPath id="c' + i + '"><path d="' + SIL + '"/><rect x="14" y="132" width="172" height="40" rx="7"/></clipPath></defs>' +
      '<g class="fx" opacity="0"><g class="rays">' + rays + '</g></g>' +
      '<path d="' + SIL + '" fill="url(#e' + i + ')" stroke="url(#g' + i + ')" stroke-width="2.2" stroke-linejoin="round"/>' +
      '<rect x="14" y="132" width="172" height="40" rx="7" fill="url(#e' + i + ')" stroke="url(#g' + i + ')" stroke-width="2.2"/>' +
      '<g clip-path="url(#c' + i + ')"><g class="liq" style="transform:translateY(' + BOTTOM + 'px)"><rect x="-40" y="3" width="320" height="260" fill="url(#l' + i + ')"/>' +
      '<path class="wv2" d="' + wave(2) + '" fill="#ffe9a0"/><path class="wv1" d="' + wave(0) + '" fill="url(#l' + i + ')"/></g>' +
      '<rect x="0" y="0" width="200" height="190" fill="url(#s' + i + ')"/>' +
      '<path d="M38 96 Q59 112 80 96 Q100 114 120 96 Q141 112 162 96" fill="none" stroke="#000" stroke-opacity=".38" stroke-width="3"/>' +
      '<path d="M38 99 Q59 115 80 99 Q100 117 120 99 Q141 115 162 99" fill="none" stroke="#fff" stroke-opacity=".22" stroke-width="1.2"/>' +
      '<rect x="14" y="142" width="172" height="9" fill="#000" fill-opacity=".22"/><rect x="14" y="132" width="172" height="3" fill="#fff" fill-opacity=".35"/>' +
      '<g class="fx"><rect class="sheen" x="-30" y="0" width="34" height="190" fill="url(#h' + i + ')" transform="skewX(-18)"/></g></g>' +
      '<path d="' + SIL + '" fill="none" stroke="url(#g' + i + ')" stroke-width="2.2" stroke-linejoin="round"/>' +
      '<rect x="14" y="132" width="172" height="40" rx="7" fill="none" stroke="url(#g' + i + ')" stroke-width="2.2"/><rect x="22" y="160" width="156" height="3" rx="1.5" fill="#000" fill-opacity=".3"/>' +
      studs.map(function (s) { return '<circle class="stud" cx="' + s[0] + '" cy="151" r="4.6" fill="' + s[1] + '" stroke="#fff" stroke-opacity=".6" stroke-width=".8" style="color:' + s[1] + '"/>'; }).join('') +
      '<polygon class="sap" points="' + hex(100, 112, 15) + '" fill="url(#b' + i + ')" stroke="#e8f7ff" stroke-width="1.4"/><polygon points="' + hex(100, 112, 7) + '" fill="#fff" opacity=".25"/>' +
      '<polygon class="dia" points="59,23 66,32 59,43 52,32" fill="#fff6cc" stroke="#e8b92f" stroke-width="1.2"/><polygon class="dia" points="141,23 148,32 141,43 134,32" fill="#fff6cc" stroke="#e8b92f" stroke-width="1.2"/>' +
      '<circle class="dia" cx="18" cy="46" r="4.2" fill="#fff6cc" stroke="#e8b92f"/><circle class="dia" cx="182" cy="46" r="4.2" fill="#fff6cc" stroke="#e8b92f"/>' +
      '<g class="fx"><circle class="ring" cx="100" cy="20" r="24" fill="none" stroke="#ffd45e" stroke-width="2.5"/><circle class="ring ring2" cx="100" cy="20" r="24" fill="none" stroke="#ffd45e" stroke-width="2"/>' + emb + '</g>' +
      '<polygon class="dia" points="100,0 110,13 100,28 90,13" fill="#ffe27a" stroke="#ff9f1a" stroke-width="1.6"/><polygon points="100,3 105,13 100,21 95,13" fill="#fff" opacity=".45"/></svg>';
  }
  function slot(t) { if (t && t.nodeType) return t; return document.querySelector('[data-crown="' + String(t).replace(/"/g, '\\"') + '"]'); }
  function render(target, metrics, opts) {
    var el = slot(target); if (!el) return null; ensureCss();
    if (!el.__nxc) { build(el); el.__nxc = true; }
    if (opts && opts.size) el.style.width = typeof opts.size === 'number' ? opts.size + 'px' : opts.size;
    var m = metrics && metrics.fill != null && !metrics.pillars ? { fill: Math.max(0, Math.min(100, +metrics.fill || 0)), mastery: metrics.mastery === true || metrics.fill >= 100 } : Core.updateStudentCrown(metrics);
    var y = BOTTOM - (BOTTOM - TOP) * m.fill / 100;
    el.querySelector('.liq').style.transform = 'translateY(' + y.toFixed(1) + 'px)'; // CSS transition makes it rise or drain smoothly
    el.classList.toggle('l1', m.fill >= 35); el.classList.toggle('l2', m.fill >= 70); el.classList.toggle('l3', m.mastery && m.fill >= 100);
    el.setAttribute('data-fill', m.fill); el.querySelector('svg').setAttribute('aria-label', 'Crown ' + m.fill + ' percent full');
    return m;
  }
  /* autoRefresh(fetchRows, everyMs): fetchRows() -> Promise<[{id, metrics}]>. Re-renders so gold rises/drains with live data. Returns stop(). */
  function autoRefresh(fetchRows, ms) {
    var stopped = false, t;
    (function tick() { if (stopped) return; fetchRows().then(function (rows) { (rows || []).forEach(function (r) { render(r.id, r.metrics); }); }).catch(function () {}).then(function () { if (!stopped) t = setTimeout(tick, ms || 20000); }); })();
    return function () { stopped = true; clearTimeout(t); };
  }
  root.LeaderboardCrown = { render: render, autoRefresh: autoRefresh, updateStudentCrown: Core.updateStudentCrown };
})(typeof self !== 'undefined' ? self : this);

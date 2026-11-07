// "Tratamento de imagem" panel inside Better xCloud's video settings, and api.ui (helpers shared with
// the in-game HUD, hud.js). Both read and change state only through window.BxImageFilter
// (docs/api-imagefilter.md) and window.BxAndroid. Controls follow Better xCloud's navigation rules:
// every setting is an <input type=range> with integer steps (D-pad Left/Right change it, A cycles it),
// every action a <button>; nothing uses <select>, <svg> or the bx-focusable class.
(() => {
 const api = window.BxImageFilter, settings = api.settings, status = api.status, doc = document;
 const VERSION = 'v9.7.1';
 const num = v => typeof v === 'number' && Number.isFinite(v);

 /* =============================== api.ui =============================== */
 const styleParts = {};
 // One <style id="bxif-style"> for panel and HUD; each part is added once.
 function ensureStyle(part, css) {
  let el = doc.getElementById('bxif-style');
  if (styleParts[part] && el) return;
  styleParts[part] = css;
  if (!el) {
   el = doc.createElement('style'); el.id = 'bxif-style';
   el.textContent = Object.values(styleParts).join('\n');
   (doc.head || doc.documentElement).append(el);
  } else el.append(doc.createTextNode(css));
 }
 const fmt = (v, d = 1) => num(v) ? v.toFixed(d).replace('.', ',') : '—';
 const fmtMs = v => !num(v) ? '—' : Math.abs(v) < 9.95 ? fmt(v, 1) : String(Math.round(v));
 const fmtInt = v => num(v) ? String(Math.round(v)) : '—';
 const fmtThousands = v => num(v) ? String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '.') : '—';
 // Target cadence: 60 or 30 FPS, from the server clock, then the screen, then the received FPS.
 function target() {
  const o = status.origin, p = status.pacing, n = status.net;
  let N = 60;
  if (num(o?.server?.meanMs)) N = o.server.meanMs < 25 ? 60 : 30;
  else if (num(p?.meanMs)) N = p.meanMs < 25 ? 60 : 30;
  else if (num(n?.fpsReceived)) N = n.fpsReceived >= 45 ? 60 : 30;
  return {N, T: 1000 / N};
 }
 // Thresholds per indicator → 'good' | 'ok' | 'bad' | 'none' (no value) | 'info'.
 function grade(kind, v, c = {}) {
  if (kind === 'decoder') return v === 'hardware' ? 'good' : v === 'software' ? 'bad' : 'none';
  if (kind === 'warn') return v === 'error' ? 'bad' : v === 'warn' ? 'ok' : v === 'info' ? 'info' : 'none';
  if (!num(v)) return 'none';
  const lo = (g, o) => v <= g ? 'good' : v <= o ? 'ok' : 'bad', hi = (g, o) => v >= g ? 'good' : v >= o ? 'ok' : 'bad';
  const T = c.T || 1000 / 60, N = c.N || 60;
  switch (kind) {
   case 'fps': return hi(.97 * N, .9 * N);
   case 'dev': return lo(.08 * T, .18 * T);
   case 'p95': return lo(1.25 * T, 1.6 * T);
   case 'count': return lo(0, 2);
   case 'drops': return lo(0, 5);
   case 'wait': return lo(.5 * T, T);
   case 'rtt': return lo(50, 100);
   case 'buffer': { const r = c.r || 0; return lo(Math.max(40, r + 15), Math.max(60, r + 40)); }
   case 'decode': return lo(9, 12);
   case 'gpu': { const L = c.L || 10; return lo(.66 * L, L); }
   // Fence estimate (no GPU timer): time until the GPU finished a frame. Frames overlap in the GPU queue,
   // so a frame can take longer than its interval without losing FPS; over two intervals it falls behind.
   case 'gpu-est': return lo(T, 2 * T);
   case 'total': return lo(70, 110);
   case 'bitrate': return c.height >= 1000 ? hi(12, 7) : hi(6, 3.5);
   // QP 28 is the neutral level of the compression adaptation: typical streams read good.
   case 'qp': return lo(30, 36);
   case 'loss': return v < .2 ? 'good' : v <= 2 ? 'ok' : 'bad';
   case 'height': return hi(1000, 700);
  }
  return 'none';
 }
 const RANK = {none: 0, good: 1, info: 1, ok: 2, bad: 3};
 function worst(...grades) { let w = 'none'; for (const g of grades) if (RANK[g] > RANK[w]) w = g; return w; }
 // Displayed grades: a worse grade shows after it was computed on 2 consecutive ticks (~1 s); a better
 // one, and to or from 'none', at once, so a recovered value is never painted bad (e.g. "0,0%" in red).
 // Call .tick() once per refresh; within a tick a key always returns the same grade.
 function createHysteresis() {
  const state = new Map(), memo = new Map();
  const g = (key, grade) => {
   if (memo.has(key)) return memo.get(key);
   let s = state.get(key), out;
   if (!s) { state.set(key, {shown: grade, pend: null}); out = grade; }
   else if (grade === s.shown) { s.pend = null; out = grade; }
   else if (grade === 'none' || s.shown === 'none' || s.pend === grade || RANK[grade] < RANK[s.shown]) { s.shown = grade; s.pend = null; out = grade; }
   else { s.pend = grade; out = s.shown; }
   memo.set(key, out);
   return out;
  };
  g.tick = () => memo.clear();
  g.reset = () => { state.clear(); memo.clear(); };
  return g;
 }
 // Approximate video latency: network round trip, jitter buffer, decode, treatment and Fluidez wait.
 function latency() {
  const n = status.net, on = api.active, v = k => n && num(n[k]) ? n[k] : null;
  const rtt = v('rttMs'), buffer = v('bufferMs'), decode = v('decodeMs');
  // Without a GPU timer, the fence estimate's median: the time until the GPU finished the frame.
  const gpu = !on ? 0 : status.measurement === 'gpu' ? (num(status.gpuP95) ? status.gpuP95 : 0) : num(status.gpuEstimate?.p50) ? status.gpuEstimate.p50 : 0;
  const wait = on && status.fluidity && num(status.fluidity.extraMs) ? status.fluidity.extraMs : 0;
  return {rtt, buffer, decode, gpu, wait, total: rtt === null ? null : rtt + (buffer || 0) + (decode || 0) + gpu + wait};
 }
 // Frames the Fluidez pacer dropped per minute (its counter is cumulative per pacer). The window
 // counts at least 10 s, so a single drop right after a start is not read as dozens per minute.
 function dropRate() {
  const s = [];
  return {
   push(d, now = Date.now()) {
    if (!num(d)) { s.length = 0; return null; }
    if (s.length && d < s[s.length - 1][1]) s.length = 0;
    s.push([now, d]);
    while (s.length > 2 && now - s[0][0] > 60000) s.shift();
    if (s.length < 2) return 0;
    return (d - s[0][1]) * 60000 / Math.max(now - s[0][0], 10000);
   },
  };
 }
 // Interval graph: newest at the right edge, 0..2.5T, target line at T, late frames as ticks above it,
 // early frames as ticks below it. sizeCanvas() sets the backing store; this redraws only when the data
 // signature changed.
 function drawSparkline(cv, list, o = {}) {
  const W = cv.width, H = cv.height;
  if (!W || !H || W < 4) return;
  const count = o.count || 240, T = o.T || 1000 / 60, n = Math.min(count, list ? list.length : 0);
  const sig = n + '|' + (n ? list[list.length - 1] + '|' + list[list.length - 2] : '') + '|' + (status.intervalsTotal ?? '') + '|' + T + '|' + !!o.dim + '|' + W + 'x' + H;
  if (cv._bxifSig === sig) return;
  cv._bxifSig = sig;
  const g = cv.getContext('2d');
  if (!g) return;
  const s = (cv._bxifScale || 1) * (o.scale || 1), max = 2.5 * T, pad = Math.max(1, Math.round(s));
  const y = v => pad + (H - 2 * pad) * (1 - Math.min(v, max) / max), line = Math.max(1, Math.round(s));
  g.clearRect(0, 0, W, H);
  g.globalAlpha = o.dim ? .45 : 1;
  const yT = Math.round(y(T));
  if (n < 2) { g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(0, yT - (line >> 1), W, line); g.globalAlpha = 1; return; }
  g.fillStyle = 'rgba(255,255,255,.22)'; g.fillRect(0, yT - (line >> 1), W, line);
  const start = list.length - n, sorted = [];
  for (let i = start; i < list.length; i++) sorted.push(list[i]);
  sorted.sort((a, b) => a - b);
  const median = sorted[n >> 1], step = (W - line) / Math.max(1, count - 1), bad = o.bad || '#ff5f6d', ok = o.ok || '#ffcf5a';
  const xAt = i => W - line / 2 - (n - 1 - i) * step;
  g.lineWidth = 1.5 * s; g.lineCap = 'butt';
  for (let i = 0; i < n; i++) {
   const v = list[start + i];
   if (!(v > 1.5 * median || v < .5 * median)) continue;
   const x = Math.round(xAt(i));
   g.strokeStyle = v > median ? bad : ok;
   g.beginPath(); g.moveTo(x, yT); g.lineTo(x, y(v)); g.stroke();
   if (v > max) { g.fillStyle = bad; g.fillRect(x - Math.ceil(1.5 * s), 0, Math.ceil(3 * s), 2); }
  }
  g.beginPath();
  for (let i = 0; i < n; i++) { const x = xAt(i), yy = y(list[start + i]); i ? g.lineTo(x, yy) : g.moveTo(x, yy); }
  g.lineWidth = 1.25 * s; g.lineJoin = 'round'; g.strokeStyle = o.line || 'rgba(230,234,240,.85)'; g.stroke();
  g.globalAlpha = 1;
 }
 // Backing store for a canvas of CSS size w×h, sharp at any devicePixelRatio.
 function sizeCanvas(cv, w, h) {
  const dpr = window.devicePixelRatio || 1, W = Math.max(1, Math.round(w * dpr)), H = Math.max(1, Math.round(h * dpr));
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; cv._bxifSig = null; }
  cv._bxifScale = dpr;
 }
 // Calls fn when devicePixelRatio changes (browser zoom, moving to another screen).
 function watchDpr(fn) {
  let mq = null;
  const arm = () => {
   try { mq?.removeEventListener('change', on); mq = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`); mq.addEventListener('change', on); } catch {}
  };
  const on = () => { arm(); fn(); };
  arm();
  return () => { try { mq?.removeEventListener('change', on); } catch {} mq = null; };
 }
 const WORDS = {
  error: {word: 'ERRO', grade: 'bad', tag: ''}, waiting: {word: 'AGUARDANDO', grade: 'none', tag: ''}, idle: {word: 'SEM QUADROS', grade: 'none', tag: ''},
  diagnostic: {word: 'DIAGNÓSTICO', grade: 'info', tag: 'DIAG'}, filtered: {word: 'TRATANDO', grade: 'good', tag: ''},
  cas: {word: 'SÓ NITIDEZ', grade: 'ok', tag: 'NIT'}, original: {word: 'ORIGINAL', grade: 'ok', tag: 'ORIG'},
 };
 function stateWord() {
  if (status.mode === 'error') return WORDS.error;
  if (!api.active) return status.mode === 'waiting' ? WORDS.waiting : WORDS.idle;
  if (api.diagnostic) return WORDS.diagnostic;
  return WORDS[settings.mode] || WORDS.filtered;
 }
 const LEVEL = {error: 3, warn: 2, info: 1};
 // One reading of the status with raw grades; panel and HUD apply their own hysteresis.
 function snapshot() {
  const on = api.active, {N, T} = target(), n = status.net, cap = status.capture || {};
  const p = on ? status.pacing : null, o = on ? status.origin : null, fl = on ? status.fluidity : null, lat = latency();
  const s = {on, N, T, net: n, p, o, fl, lat, cap, direct: !!(on && cap.active), fps: on ? status.fps : null, fpsAny: on ? status.fps : n?.fpsReceived ?? null};
  s.gFps = grade('fps', s.fps, s); s.gFpsAny = grade('fps', s.fpsAny, s);
  s.gDev = grade('dev', p?.deviationMs, s); s.gP95 = grade('p95', p?.p95Ms, s); s.gHit = grade('count', p?.hitches);
  s.missed = o && num(o.missed) ? o.missed : null;
  s.gMiss = s.missed === null ? (s.direct ? 'good' : 'none') : grade('count', s.missed);
  s.gSrv = grade('dev', o?.server?.deviationMs, s); s.gArr = o && o.arrivalNetwork === false ? 'none' : grade('dev', o?.arrival?.deviationMs, s);
  s.gWait = fl ? grade('wait', fl.extraMs, s) : 'none';
  s.gRtt = grade('rtt', lat.rtt); s.gBuf = grade('buffer', lat.buffer, {r: settings.smoothing}); s.gDec = grade('decode', lat.decode);
  s.gDecoder = grade('decoder', n?.decoder); s.gTotal = grade('total', lat.total);
  s.gpu = on && status.measurement === 'gpu' && num(status.gpuP95) ? status.gpuP95 : null;
  s.L = settings.gpuBudget || 10; s.gGpu = grade('gpu', s.gpu, {L: s.L});
  s.gpuEst = on && status.measurement !== 'gpu' && num(status.gpuEstimate?.p95) ? status.gpuEstimate.p95 : null; s.gGpuEst = grade('gpu-est', s.gpuEst, {T});
  s.gpuShow = s.gpu !== null ? s.gpu : s.gpuEst; s.gGpuShow = s.gpu !== null ? s.gGpu : s.gGpuEst;
  s.gBitrate = grade('bitrate', n?.bitrateMbps, {height: n?.height});
  s.qp = num(status.adaptive?.qpMean) ? status.adaptive.qpMean : n && num(n.qp) ? n.qp : null; s.gQp = grade('qp', s.qp);
  // Bitrate estimate when the browser reports no QP (Android WebView): shown as "≈", never as a QP reading.
  s.qpEst = s.qp === null && status.adaptive?.source === 'bitrate' && num(status.adaptive.qpEstimate) ? status.adaptive.qpEstimate : null;
  s.gLoss = grade('loss', n?.lossPct); s.gHeight = grade('height', n?.height);
  s.gCapture = s.direct ? 'good' : settings.fluidity !== 'off' && settings.capture === 'direct' ? 'ok' : 'none';
  let lv = 0; for (const w of status.warnings || []) lv = Math.max(lv, LEVEL[w.level] || 0);
  s.warnLevel = ['', 'info', 'warn', 'error'][lv]; s.warnCount = (status.warnings || []).length; s.gWarn = grade('warn', s.warnLevel);
  s.overall = worst(s.gFps, s.gDev, s.gHit, s.gMiss, lv === 3 ? 'bad' : 'none');
  return s;
 }
 // Cached writes: touch the DOM only when the value changed.
 function setT(node, s) { if (node._bxifT !== s) { node._bxifT = s; node.textContent = s; } }
 function setA(node, k, v) {
  const c = node._bxifA || (node._bxifA = {});
  if (c[k] === v) return;
  c[k] = v;
  if (v === null || v === undefined || v === false) node.removeAttribute(k); else node.setAttribute(k, v === true ? '' : v);
 }
 function setS(node, prop, v) { const c = node._bxifS || (node._bxifS = {}); if (c[prop] !== v) { c[prop] = v; node.style.setProperty(prop, v); } }
 // Text made of parts [text, grade?]: one <span> per part, created only when the number of parts changes.
 function setParts(el, parts) {
  const kids = el.children;
  if (kids.length !== parts.length) { el.textContent = ''; for (let i = 0; i < parts.length; i++) el.append(doc.createElement('span')); }
  for (let i = 0; i < parts.length; i++) { setT(kids[i], parts[i][0]); setA(kids[i], 'data-g', parts[i][1] || null); }
 }
 api.ui = {ensureStyle, fmt, fmtMs, fmtInt, fmtThousands, target, grade, worst, createHysteresis, latency, dropRate, drawSparkline, sizeCanvas, watchDpr, stateWord, snapshot, setT, setA, setS, setParts, LEVEL};

 /* =============================== Panel style =============================== */
 const CSS = `
.bxif-panel{--bxif-bg0:#141518;--bxif-card:#222428;--bxif-line:#2f3237;--bxif-field:#2c2f35;--bxif-hover:#353941;--bxif-rowfocus:#2a2d33;
 --bxif-t1:#eef0f3;--bxif-tl:#d5d8de;--bxif-t2:#b4b9c2;--bxif-t3:#8a909a;
 --bxif-acc:var(--bx-primary-button-color,#008746);--bxif-acc-hi:var(--bx-primary-button-hover-color,#04b358);
 --bxif-danger:var(--bx-danger-button-color,#c10404);--bxif-danger-t:#ff8a8a;
 --bxif-good:#4fe0d2;--bxif-ok:#ffcf5a;--bxif-bad:#ff5f6d;--bxif-info:#7aa7ff;--bxif-none:#8b919c;
 --bxif-good-bg:rgba(79,224,210,.14);--bxif-ok-bg:rgba(255,207,90,.12);--bxif-bad-bg:rgba(255,95,109,.14);--bxif-info-bg:rgba(122,167,255,.12);--bxif-none-bg:rgba(139,145,156,.12);
 --bxif-ring:0 0 0 2px #1a1b1e,0 0 0 4px #fff;
 --bxif-fs-title:16px;--bxif-fs-ver:11px;--bxif-pill-h:22px;--bxif-fs-pill:11px;--bxif-fs-idx:12px;--bxif-fs-sec:13px;--bxif-fs-sum:13px;--bxif-sec-h:42px;
 --bxif-fs-label:14px;--bxif-fs-val:14px;--bxif-fs-seg:13.5px;--bxif-fs-hint:12.5px;--bxif-fs-read:13px;--bxif-fs-kpi:22px;--bxif-fs-cap:11px;--bxif-fs-sub:11.5px;--bxif-fs-tag:10.5px;
 --bxif-row-h:44px;--bxif-row-px:12px;--bxif-row-py:6px;--bxif-rail-h:34px;--bxif-hit:32px;--bxif-track:4px;--bxif-thumb:18px;--bxif-sw-w:44px;--bxif-sw-h:24px;--bxif-knob:18px;
 --bxif-fs-12:12.5px;--bxif-fs-11:11.5px;--bxif-fs-105:11px;--bxif-fs-10:11px;--bxif-fs-95:11px;--bxif-badge:14px;
 --bxif-chip-h:42px;--bxif-btn-h:38px;--bxif-gap:8px;--bxif-kpi-h:58px;--bxif-spark-h:36px;--bxif-head-h:36px;--bxif-live-px:14px;--bxif-live-py:12px;--bxif-scroll-b:44px}
@media (max-height:500px){.bxif-panel{--bxif-fs-title:15px;--bxif-pill-h:20px;--bxif-fs-pill:10.5px;--bxif-fs-idx:11px;--bxif-fs-sec:12px;--bxif-fs-sum:12px;--bxif-sec-h:38px;
 --bxif-fs-label:13px;--bxif-fs-val:13px;--bxif-fs-seg:12.5px;--bxif-fs-hint:12px;--bxif-fs-read:12.5px;--bxif-fs-kpi:20px;--bxif-fs-cap:11px;--bxif-fs-sub:11px;
 --bxif-fs-12:12px;--bxif-fs-11:11.5px;--bxif-fs-105:11px;--bxif-fs-10:11px;--bxif-fs-95:11px;--bxif-fs-tag:10.5px;
 --bxif-row-h:40px;--bxif-row-py:4px;--bxif-rail-h:32px;--bxif-hit:28px;--bxif-thumb:16px;--bxif-sw-w:40px;--bxif-sw-h:22px;--bxif-knob:16px;
 --bxif-chip-h:40px;--bxif-btn-h:36px;--bxif-kpi-h:52px;--bxif-spark-h:32px;--bxif-head-h:32px;--bxif-live-px:12px;--bxif-live-py:10px}}
/* Touch on the phone: every target at least 40 px tall, so near-miss taps stay in their own row. */
@media (max-height:500px) and (pointer:coarse){.bxif-panel{--bxif-rail-h:44px;--bxif-hit:42px;--bxif-thumb:22px;--bxif-row-h:50px;--bxif-sec-h:44px;--bxif-btn-h:42px;--bxif-chip-h:44px;--bxif-sw-w:46px;--bxif-sw-h:26px;--bxif-knob:20px}
 .bxif-panel .bxif-btn-sm{min-height:40px}}
@media (min-height:900px){.bxif-panel{--bxif-ring:0 0 0 2px #1a1b1e,0 0 0 5px #fff;
 --bxif-fs-title:21px;--bxif-fs-ver:14px;--bxif-pill-h:28px;--bxif-fs-pill:14px;--bxif-fs-idx:15px;--bxif-fs-sec:16px;--bxif-fs-sum:16px;--bxif-sec-h:52px;
 --bxif-fs-label:17px;--bxif-fs-val:17px;--bxif-fs-seg:16px;--bxif-fs-hint:15px;--bxif-fs-read:16px;--bxif-fs-kpi:28px;--bxif-fs-cap:14px;--bxif-fs-sub:14px;--bxif-fs-tag:13px;
 --bxif-row-h:56px;--bxif-row-px:16px;--bxif-row-py:8px;--bxif-rail-h:44px;--bxif-hit:40px;--bxif-track:6px;--bxif-thumb:24px;--bxif-sw-w:52px;--bxif-sw-h:28px;--bxif-knob:22px;
 --bxif-fs-12:16px;--bxif-fs-11:14px;--bxif-fs-105:14px;--bxif-fs-10:14px;--bxif-fs-95:14px;--bxif-badge:18px;
 --bxif-chip-h:52px;--bxif-btn-h:48px;--bxif-gap:12px;--bxif-kpi-h:72px;--bxif-spark-h:48px;--bxif-head-h:44px;--bxif-live-px:16px;--bxif-live-py:14px;--bxif-scroll-b:56px}}
.bxif-panel,.bxif-panel *,.bxif-panel *::before,.bxif-panel *::after{box-sizing:border-box}
.bxif-panel{display:flex;flex-direction:column;gap:var(--bxif-gap);margin:12px 0 16px;text-align:left;font-family:var(--bx-title-font,Bahnschrift,Arial,Roboto,sans-serif);font-size:13px;line-height:1.3;font-weight:400;
 color:var(--bxif-t1);user-select:none;-webkit-user-select:none;font-variant-numeric:tabular-nums lining-nums;-webkit-tap-highlight-color:transparent;letter-spacing:normal;text-transform:none;min-width:0;max-width:100%}
.bxif-panel b{font-weight:600}
:where(.bxif-panel) button{-webkit-appearance:none;appearance:none;margin:0;border:0;background:none;color:inherit;font:inherit;text-align:inherit;letter-spacing:inherit;text-transform:none;cursor:pointer;outline:none}
.bxif-panel input,.bxif-panel button{scroll-margin-top:calc(var(--bxif-sticky,72px) + 8px);scroll-margin-bottom:var(--bxif-scroll-b)}
.bxif-panel [data-hide]{display:none!important}
.bxif-panel [data-g=good]{color:var(--bxif-good)}.bxif-panel [data-g=ok]{color:var(--bxif-ok)}.bxif-panel [data-g=bad]{color:var(--bxif-bad)}
.bxif-panel [data-g=info]{color:var(--bxif-info)}.bxif-panel [data-g=none]{color:var(--bxif-t3)}.bxif-panel [data-g=lab]{color:var(--bxif-t2)}.bxif-panel [data-g=dim]{color:var(--bxif-t3)}
.bxif-meta [data-g=good],.bxif-lines [data-g=good],.bxif-legend [data-g=good],.bxif-total [data-g=good],.bxif-out [data-g=good],.bxif-pipe-v[data-g=good]{color:inherit}
.bxif-dot{display:inline-block;flex:none;width:8px;height:8px;border-radius:50%;background:currentColor}
[data-g=ok]>.bxif-dot{border-radius:1.5px;transform:rotate(45deg) scale(.82)}
[data-g=bad]>.bxif-dot{width:9px;border-radius:0;clip-path:polygon(50% 0,100% 100%,0 100%)}
[data-g=info]>.bxif-dot{background:none;box-shadow:inset 0 0 0 2px currentColor}
[data-g=none]>.bxif-dot{background:none;box-shadow:inset 0 0 0 1.5px currentColor}
/* header */
.bxif-head{display:flex;align-items:center;gap:10px;min-height:var(--bxif-head-h);padding:0 2px 0 2px}
.bxif-title{flex:1;min-width:0;display:flex;align-items:baseline;gap:8px;white-space:nowrap;overflow:hidden}
.bxif-name{font-size:var(--bxif-fs-title);font-weight:700;color:var(--bxif-t1);overflow:hidden;text-overflow:ellipsis}
.bxif-ver{font-size:var(--bxif-fs-ver);font-weight:600;color:var(--bxif-t3)}
.bxif-pill{flex:none;display:inline-flex;align-items:center;gap:7px;height:var(--bxif-pill-h);padding:0 11px 0 9px;border-radius:999px;background:var(--bxif-none-bg);color:var(--bxif-none);
 font-size:var(--bxif-fs-pill);font-weight:700;letter-spacing:.07em;text-transform:uppercase;white-space:nowrap}
.bxif-pill[data-g=good]{background:var(--bxif-good-bg)}.bxif-pill[data-g=ok]{background:var(--bxif-ok-bg)}.bxif-pill[data-g=bad]{background:var(--bxif-bad-bg)}.bxif-pill[data-g=info]{background:var(--bxif-info-bg)}
.bxif-pill .bxif-dot{width:7px;height:7px}
/* warnings */
.bxif-warns{display:flex;flex-direction:column;gap:6px}
.bxif-warn{display:flex;align-items:center;gap:10px;min-height:28px;padding:7px 8px 7px 12px;border-radius:8px;background:var(--bxif-ok-bg);color:var(--bxif-ok);box-shadow:inset 3px 0 0 currentColor}
.bxif-warn[data-level=error]{background:var(--bxif-bad-bg);color:var(--bxif-bad)}.bxif-warn[data-level=info]{background:var(--bxif-info-bg);color:var(--bxif-info)}
.bxif-badge{flex:none;align-self:flex-start;margin-top:1px;width:var(--bxif-badge);height:var(--bxif-badge);border-radius:50%;background:currentColor;font-style:normal;font-size:calc(var(--bxif-badge) - 4px);font-weight:800;line-height:var(--bxif-badge);text-align:center}
.bxif-badge::before{content:attr(data-c);color:#141518}
.bxif-warn-tx{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.bxif-warn-text{font-size:var(--bxif-fs-12);line-height:1.3;color:var(--bxif-t1)}
.bxif-warn-hint{font-size:var(--bxif-fs-11);line-height:1.3;color:#a3a9b3}
.bxif-panel .bxif-warn-more{align-self:flex-start;min-height:30px;padding:0 12px;border-radius:8px;font-size:var(--bxif-fs-11);font-weight:600;color:var(--bxif-t2)}
.bxif-panel[data-nav="1"] .bxif-warn-more:focus{box-shadow:var(--bxif-ring);background:var(--bxif-rowfocus)}
/* live card */
.bxif-live{background:var(--bxif-bg0);border:1px solid #2c2f36;border-radius:10px;padding:var(--bxif-live-py) var(--bxif-live-px) 2px}
.bxif-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));min-height:var(--bxif-kpi-h)}
.bxif-kpi{display:flex;flex-direction:column;justify-content:space-between;gap:3px;min-width:0;padding:0 0 0 12px}
.bxif-kpi:first-child{padding-left:0}.bxif-kpi+.bxif-kpi{border-left:1px solid #2c2f36}
.bxif-kpi-cap{display:flex;align-items:center;gap:5px;font-size:var(--bxif-fs-cap);font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--bxif-t3);white-space:nowrap;overflow:hidden}
.bxif-kpi-cap .bxif-dot{width:7px;height:7px}.bxif-kpi-cap [data-g=bad]>.bxif-dot{width:8px}
.bxif-kpi-val{font-size:var(--bxif-fs-kpi);font-weight:600;line-height:1;white-space:nowrap;color:var(--bxif-t1);letter-spacing:-.01em;overflow:hidden}
.bxif-unit{font-size:max(10px,.5em);font-weight:600;color:var(--bxif-t3);margin-left:2px;letter-spacing:0}
.bxif-kpi-sub{font-size:var(--bxif-fs-sub);color:var(--bxif-t3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bxif-spark{position:relative;height:var(--bxif-spark-h);margin-top:4px}
.bxif-spark canvas{display:block;width:100%;height:100%}
.bxif-spark-cap{display:flex;justify-content:space-between;margin-top:12px;font-size:var(--bxif-fs-95);line-height:1.1;font-weight:700;letter-spacing:.08em;color:var(--bxif-t3)}
.bxif-spark-t{font-weight:600;letter-spacing:0}
.bxif-meta{margin-top:10px;font-size:var(--bxif-fs-read);line-height:1.35;color:var(--bxif-t1);display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}
.bxif-meta[data-idle]{-webkit-line-clamp:3;color:var(--bxif-t2)}
.bxif-meta>span:first-child[data-g=lab]{display:block;margin-bottom:2px}
.bxif-hr{height:1px;background:#2c2f36;margin:10px 0 2px}
.bxif-live .bxif-row{padding-left:0;padding-right:0}
.bxif-live .bxif-row+.bxif-row{border-top:0}
.bxif-panel[data-nav="1"] .bxif-live .bxif-row:focus-within{padding-left:10px;padding-right:10px;margin:0 -10px;border-radius:6px}
/* sections */
.bxif-sec{background:var(--bxif-card);border:1px solid var(--bxif-line);border-radius:10px}
.bxif-sec-head,.bxif-sub-head{display:flex;align-items:center;gap:10px;width:100%;min-height:var(--bxif-sec-h);padding:0 14px 0 13px;border-radius:9px;transition:background-color .1s}
.bxif-sec[data-open]>.bxif-sec-head{border-radius:9px 9px 0 0;box-shadow:inset 3px 0 0 var(--bxif-acc-hi),inset 0 -1px 0 var(--bxif-line)}
.bxif-sec-idx{flex:none;min-width:2ch;font-size:var(--bxif-fs-idx);font-weight:600;color:var(--bxif-t3)}
.bxif-sec-title{flex:none;font-size:var(--bxif-fs-sec);font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--bxif-t1);white-space:nowrap}
.bxif-sec-sum{flex:1;min-width:0;text-align:right;font-size:var(--bxif-fs-sum);font-weight:500;color:var(--bxif-t2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bxif-chev{flex:none;width:8px;height:8px;margin:0 2px 0 4px;border-right:2px solid var(--bxif-t2);border-bottom:2px solid var(--bxif-t2);transform:translateY(-2px) rotate(45deg);transition:transform .15s}
[data-open]>.bxif-sec-head .bxif-chev,.bxif-sub-head[aria-expanded=true] .bxif-chev{transform:translateY(2px) rotate(225deg)}
.bxif-sec-body{display:none;padding:4px 0 8px}
.bxif-sec[data-open]>.bxif-sec-body{display:block}
.bxif-panel[data-nav="1"] .bxif-sec-head:focus,.bxif-panel[data-nav="1"] .bxif-sub-head:focus{box-shadow:var(--bxif-ring);background:var(--bxif-rowfocus)}
.bxif-panel[data-nav="1"] .bxif-sec[data-open]>.bxif-sec-head:focus{box-shadow:var(--bxif-ring),inset 3px 0 0 var(--bxif-acc-hi)}
.bxif-sec-body>.bxif-row+.bxif-row{border-top:1px solid rgba(255,255,255,.05)}
/* rows */
.bxif-row{position:relative;display:grid;grid-template-columns:minmax(104px,34%) minmax(0,1fr) auto;column-gap:12px;align-items:center;min-height:var(--bxif-row-h);padding:var(--bxif-row-py) var(--bxif-row-px);transition:background-color .1s}
.bxif-lab{grid-column:1;grid-row:1;min-width:0;font-size:var(--bxif-fs-label);font-weight:500;line-height:1.2;color:var(--bxif-tl);overflow-wrap:break-word}
.bxif-lab-sub{display:block;margin-top:2px;font-size:var(--bxif-fs-sub);font-weight:400;color:var(--bxif-t3)}
.bxif-ctl{grid-column:2/-1;grid-row:1;min-width:0}
.bxif-has-val>.bxif-ctl{grid-column:2}
.bxif-val{grid-column:3;grid-row:1;width:52px;text-align:right;font-size:var(--bxif-fs-val);font-weight:600;line-height:1.15;color:var(--bxif-t1);white-space:nowrap}
.bxif-v2{display:block;margin-top:1px;font-size:var(--bxif-fs-105);font-weight:500;color:var(--bxif-t2)}
.bxif-hint,.bxif-out,.bxif-x{grid-column:1/-1;min-width:0}
.bxif-hint{display:none;margin:6px 0 2px;font-size:var(--bxif-fs-hint);line-height:1.35;color:var(--bxif-t2)}
.bxif-row:focus-within>.bxif-hint,.bxif-row[data-disabled]>.bxif-hint{display:block}
.bxif-out{margin-top:6px;font-size:var(--bxif-fs-read);line-height:1.35;color:var(--bxif-t2)}
.bxif-row>.bxif-out:last-child{margin-bottom:2px}
.bxif-stack{grid-template-columns:minmax(0,1fr) auto}
.bxif-stack>.bxif-ctl{grid-column:1/-1;grid-row:2;margin-top:8px}
.bxif-stack>.bxif-val{grid-column:2;width:auto}
.bxif-panel[data-nav="1"] .bxif-row:focus-within{background:var(--bxif-rowfocus);box-shadow:inset 3px 0 0 var(--bxif-acc-hi)}
.bxif-row[data-disabled]>.bxif-ctl{opacity:.45}
.bxif-row[data-disabled] .bxif-seg-opt,.bxif-row[data-disabled] .bxif-slider{pointer-events:none}
@media (min-height:900px){.bxif-row{grid-template-columns:minmax(0,1fr) auto}
 .bxif-row>.bxif-ctl{grid-column:1/-1;grid-row:2;margin-top:8px}.bxif-row>.bxif-val{grid-column:2;width:auto;min-width:64px}
 .bxif-sec-head{gap:8px}.bxif-sec-title{letter-spacing:.05em}.bxif-kpi-cap,.bxif-cap,.bxif-pipe-k,.bxif-spark-cap{letter-spacing:.02em}.bxif-kpi{padding-left:10px}.bxif-kpi-cap{font-size:13px;gap:4px}}
.bxif-tag{display:inline-block;vertical-align:1px;margin-left:6px;padding:0 4px;border:1px solid #3a3f48;border-radius:4px;font-size:var(--bxif-fs-tag);font-weight:700;letter-spacing:.06em;line-height:1.5;color:var(--bxif-t2);text-transform:uppercase;white-space:nowrap}
.bxif-tag[data-g=ok]{border-color:rgba(255,207,90,.5)}
/* segmented choice */
.bxif-seg{position:relative;display:grid;grid-template-columns:repeat(var(--n),minmax(0,1fr));height:var(--bxif-rail-h);padding:2px;border-radius:8px;background:var(--bxif-bg0);box-shadow:inset 0 0 0 1px #1d1f23}
.bxif-panel input.bxif-in{position:absolute;inset:0;margin:0;padding:0;opacity:0;pointer-events:none;width:100%;height:100%;min-width:0;-webkit-appearance:none;appearance:none;background:none;border:0;z-index:0}
.bxif-seg-thumb{position:absolute;top:2px;bottom:2px;left:2px;width:calc((100% - 4px)/var(--n));transform:translateX(calc(var(--i)*100%));border-radius:6px;background:var(--bxif-acc);box-shadow:0 1px 2px rgba(0,0,0,.35);transition:transform .14s cubic-bezier(.2,.8,.2,1)}
.bxif-seg[data-none] .bxif-seg-thumb{display:none}
.bxif-seg-opt{position:relative;z-index:1;display:flex;align-items:center;justify-content:center;min-width:0;padding:0 5px;border-radius:6px;font-size:var(--bxif-fs-seg);font-weight:600;line-height:1.1;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--bxif-t2);cursor:pointer;transition:color .1s,background-color .1s}
.bxif-seg-opt>span{min-width:0;overflow:hidden;text-overflow:ellipsis}
.bxif-seg-opt[data-on]{color:#fff}
@media (hover:hover){.bxif-seg-opt:not([data-on]):hover,.bxif-step-arr:hover{background:var(--bxif-hover)}.bxif-btn:not(:disabled):hover{filter:brightness(1.12)}.bxif-sec-head:hover,.bxif-sub-head:hover{background:#272a2f}.bxif-chip:not([aria-pressed=true]):hover{background:var(--bxif-hover)}}
.bxif-panel[data-nav="1"] .bxif-seg:focus-within{box-shadow:var(--bxif-ring)}
.bxif-step{display:flex;align-items:center}
.bxif-step-arr{position:relative;z-index:1;flex:none;width:32px;height:100%;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:600;color:var(--bxif-t2);cursor:pointer}
.bxif-step-val{flex:1;min-width:0;text-align:center;font-size:var(--bxif-fs-seg);font-weight:600;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bxif-corner{position:relative;display:inline-block;vertical-align:middle;width:22px;height:14px;border:2px solid currentColor;border-radius:3px}
.bxif-corner::after{content:'';position:absolute;width:6px;height:4px;border-radius:1px;background:currentColor}
.bxif-corner[data-c=top-left]::after{top:1px;left:1px}.bxif-corner[data-c=top-right]::after{top:1px;right:1px}
.bxif-corner[data-c=bottom-left]::after{bottom:1px;left:1px}.bxif-corner[data-c=bottom-right]::after{bottom:1px;right:1px}
/* slider */
.bxif-slider{position:relative;height:var(--bxif-hit);display:flex;align-items:center;touch-action:pan-y;cursor:pointer;border-radius:999px;--bxif-fill:calc(var(--bxif-thumb)/2 + (100% - var(--bxif-thumb))*var(--p))}
.bxif-panel input.bxif-range{position:relative;z-index:1;display:block;width:100%;height:100%;margin:0;padding:0;opacity:1;pointer-events:none;background:none;border:0;-webkit-appearance:none;appearance:none}
.bxif-range::-webkit-slider-runnable-track{height:var(--bxif-track);border-radius:999px;background:linear-gradient(90deg,var(--bxif-acc-hi) var(--bxif-fill),#3a3e45 var(--bxif-fill))}
.bxif-range::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:var(--bxif-thumb);height:var(--bxif-thumb);margin-top:calc((var(--bxif-track) - var(--bxif-thumb))/2);border-radius:50%;background:#f2f4f7;border:2px solid var(--bxif-acc);box-shadow:0 1px 3px rgba(0,0,0,.55)}
.bxif-range::-moz-range-track{height:var(--bxif-track);border-radius:999px;background:#3a3e45}
.bxif-range::-moz-range-progress{height:var(--bxif-track);border-radius:999px;background:var(--bxif-acc-hi)}
.bxif-range::-moz-range-thumb{width:var(--bxif-thumb);height:var(--bxif-thumb);border-radius:50%;background:#f2f4f7;border:2px solid var(--bxif-acc);box-shadow:0 1px 3px rgba(0,0,0,.55)}
.bxif-panel[data-nav="1"] .bxif-slider:focus-within{box-shadow:var(--bxif-ring)}
.bxif-notch,.bxif-ghost{position:absolute;z-index:0;top:50%;width:2px;border-radius:1px;pointer-events:none;left:calc(var(--bxif-thumb)/2 + (100% - var(--bxif-thumb))*var(--nf) - 1px)}
.bxif-notch{height:12px;margin-top:-6px;background:#8a909a}
.bxif-ghost{height:16px;margin-top:-8px;background:var(--bxif-info)}
/* switch */
.bxif-sw{position:relative;display:inline-flex;align-items:center;gap:10px;min-height:var(--bxif-hit);padding-right:4px;vertical-align:middle;cursor:pointer}
.bxif-sw-pill{position:relative;flex:none;width:var(--bxif-sw-w);height:var(--bxif-sw-h);border-radius:999px;background:#3a3e45;transition:background-color .1s}
.bxif-sw-knob{position:absolute;top:50%;left:calc((var(--bxif-sw-h) - var(--bxif-knob))/2);width:var(--bxif-knob);height:var(--bxif-knob);margin-top:calc(var(--bxif-knob)/-2);border-radius:50%;background:#c9cdd4;box-shadow:0 1px 2px rgba(0,0,0,.4);transition:transform .14s cubic-bezier(.2,.8,.2,1)}
.bxif-sw[data-on] .bxif-sw-pill{background:var(--bxif-acc)}
.bxif-sw[data-on] .bxif-sw-knob{background:#fff;transform:translateX(calc(var(--bxif-sw-w) - var(--bxif-sw-h)))}
.bxif-sw-tx{font-size:var(--bxif-fs-val);font-weight:600;color:var(--bxif-t2)}
.bxif-sw[data-on] .bxif-sw-tx{color:var(--bxif-t1)}
.bxif-panel[data-nav="1"] .bxif-sw:focus-within .bxif-sw-pill{box-shadow:var(--bxif-ring)}
/* buttons and chips */
.bxif-btn{position:relative;display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:var(--bxif-btn-h);padding:0 14px;border-radius:8px;background:var(--bxif-field);color:var(--bxif-t1);
 font-size:var(--bxif-fs-seg);font-weight:600;line-height:1.2;text-align:center;overflow:hidden;transition:background-color .1s}
.bxif-panel .bxif-btn-primary{background:var(--bxif-acc);color:#fff}
.bxif-panel .bxif-btn-danger{background:transparent;box-shadow:inset 0 0 0 1px var(--bxif-danger);color:var(--bxif-danger-t)}
.bxif-panel .bxif-btn-danger[data-armed]{background:var(--bxif-danger);color:#fff}
.bxif-panel .bxif-btn-out{background:transparent;box-shadow:inset 0 0 0 1px var(--bxif-acc-hi);color:var(--bxif-t1)}
.bxif-panel .bxif-btn-sm{flex:none;min-height:30px;padding:0 10px;font-size:var(--bxif-fs-12);white-space:nowrap}
.bxif-btn:disabled{opacity:.45;cursor:default}
.bxif-panel[data-nav="1"] .bxif-btn:focus{box-shadow:var(--bxif-ring);background:#3a3e45}
.bxif-panel[data-nav="1"] .bxif-btn-primary:focus{background:var(--bxif-acc-hi)}
.bxif-panel[data-nav="1"] .bxif-btn-danger:focus{box-shadow:var(--bxif-ring),inset 0 0 0 1px var(--bxif-danger);background:rgba(193,4,4,.18)}
.bxif-panel[data-nav="1"] .bxif-btn-danger[data-armed]:focus{background:var(--bxif-danger)}
.bxif-count{position:absolute;left:0;right:0;bottom:0;height:3px;background:rgba(255,255,255,.75);transform-origin:left;transform:scaleX(0)}
.bxif-btn[data-armed] .bxif-count{transform:scaleX(1)}
.bxif-btn[data-armed] .bxif-count[data-run]{transform:scaleX(0);transition:transform 4s linear}
.bxif-chips{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px}
.bxif-chip{display:flex;align-items:center;justify-content:center;min-width:0;min-height:var(--bxif-chip-h);padding:3px 4px;border-radius:8px;background:var(--bxif-field);box-shadow:inset 0 0 0 1px transparent;
 font-size:var(--bxif-fs-seg);font-weight:600;line-height:1.12;text-align:center;color:var(--bxif-t1);overflow-wrap:anywhere;transition:background-color .1s}
.bxif-panel .bxif-chip[aria-pressed=true]{background:var(--bxif-acc);box-shadow:inset 0 0 0 1px var(--bxif-acc-hi);color:#fff}
.bxif-panel[data-nav="1"] .bxif-chip:focus{box-shadow:var(--bxif-ring)}
.bxif-panel[data-nav="1"] .bxif-chip:not([aria-pressed=true]):focus{background:#3a3e45}
.bxif-desc{margin-top:8px;min-height:2.7em;font-size:var(--bxif-fs-12);line-height:1.35;color:var(--bxif-t2);display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}
.bxif-pick{font-size:var(--bxif-fs-val);font-weight:600;color:var(--bxif-t1);text-align:right}
.bxif-panel .bxif-status{font-size:var(--bxif-fs-read);font-weight:500;color:var(--bxif-t2);white-space:normal}
/* verdict, pipeline, meters */
.bxif-verdict{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;column-gap:10px;min-height:44px;margin:8px var(--bxif-row-px) 4px;padding:6px 8px 6px 12px;border-radius:8px;background:var(--bxif-none-bg);color:var(--bxif-none)}
.bxif-verdict[data-g=good]{background:var(--bxif-good-bg)}.bxif-verdict[data-g=ok]{background:var(--bxif-ok-bg)}.bxif-verdict[data-g=bad]{background:var(--bxif-bad-bg)}.bxif-verdict[data-g=info]{background:var(--bxif-info-bg)}
.bxif-verdict-tx{font-size:var(--bxif-fs-12);line-height:1.35;color:var(--bxif-t1);display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}
.bxif-verdict .bxif-btn[data-off]{visibility:hidden}
.bxif-cap{margin:12px var(--bxif-row-px) 0;font-size:var(--bxif-fs-10);font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--bxif-t3)}
.bxif-pipe{display:grid;grid-template-columns:minmax(0,1fr) 14px minmax(0,1fr) 14px minmax(0,1fr);margin:6px var(--bxif-row-px) 0}
.bxif-pipe-cell{display:flex;flex-direction:column;align-items:center;gap:2px;min-width:0;padding:7px 4px 6px;border-radius:8px;background:var(--bxif-bg0)}
.bxif-pipe-k{font-size:var(--bxif-fs-10);font-weight:700;letter-spacing:.08em;color:var(--bxif-t3)}
.bxif-pipe-v{font-size:calc(var(--bxif-fs-val) + 3px);font-weight:600;line-height:1.1;color:var(--bxif-t1)}
.bxif-pipe-s{font-size:var(--bxif-fs-sub);color:var(--bxif-t3);white-space:nowrap}
.bxif-pipe-arr{align-self:center;justify-self:center;width:7px;height:7px;margin-left:-3px;border-top:2px solid #4b5059;border-right:2px solid #4b5059;transform:rotate(45deg)}
.bxif-lines{margin:8px var(--bxif-row-px) 2px;display:flex;flex-direction:column;gap:3px;font-size:var(--bxif-fs-read);line-height:1.35;color:var(--bxif-t1)}
.bxif-meter{position:relative;height:6px;margin-top:8px;border-radius:999px;background:var(--bxif-bg0)}
.bxif-meter-fill{position:absolute;left:0;top:0;bottom:0;width:100%;border-radius:999px;background:currentColor;transform-origin:left;transform:scaleX(0)}
.bxif-meter-clip{position:absolute;top:-4px;bottom:-4px;left:-1px;right:-1px;overflow:hidden;pointer-events:none}
.bxif-meter-pos{position:absolute;top:4px;bottom:4px;left:1px;right:1px}
.bxif-meter-tick{position:absolute;left:-1px;top:-3px;width:2px;height:12px;border-radius:1px;background:#fff;box-shadow:0 0 0 1px rgba(20,21,24,.7)}
.bxif-qp-track{position:relative;height:6px;border-radius:999px;background:linear-gradient(90deg,rgba(79,224,210,.35),rgba(255,207,90,.35) 50%,rgba(255,95,109,.35)),var(--bxif-bg0)}
.bxif-qp-cap{display:flex;justify-content:space-between;margin-top:5px;font-size:var(--bxif-fs-10);color:var(--bxif-t3)}
.bxif-x{margin-top:8px}
.bxif-stackbar{display:flex;gap:1px;height:8px;margin-top:8px;border-radius:3px;overflow:hidden;background:var(--bxif-bg0)}
.bxif-stackbar>span{flex:0 1 0;min-width:0}
.bxif-stackbar>span:nth-child(1){background:#d7dbe2}.bxif-stackbar>span:nth-child(2){background:#a9afba}.bxif-stackbar>span:nth-child(3){background:#7c8391}.bxif-stackbar>span:nth-child(4){background:#565c68}
.bxif-stackbar>span:nth-child(5){background:repeating-linear-gradient(45deg,#a9afba 0 2px,transparent 2px 4px)}
.bxif-legend{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px 14px;margin-top:8px;font-size:var(--bxif-fs-read)}
.bxif-legend>div{display:flex;align-items:center;gap:7px;min-width:0;white-space:nowrap}
.bxif-legend>div>span:nth-child(2){flex:1;min-width:0;color:var(--bxif-t2);overflow:hidden;text-overflow:ellipsis}
.bxif-sw-i{flex:none;width:9px;height:9px;border-radius:2px}
.bxif-legend>div:nth-child(1) .bxif-sw-i{background:#d7dbe2}.bxif-legend>div:nth-child(2) .bxif-sw-i{background:#a9afba}.bxif-legend>div:nth-child(3) .bxif-sw-i{background:#7c8391}
.bxif-legend>div:nth-child(4) .bxif-sw-i{background:#565c68}.bxif-legend>div:nth-child(5) .bxif-sw-i{background:repeating-linear-gradient(45deg,#a9afba 0 2px,transparent 2px 4px);box-shadow:inset 0 0 0 1px #a9afba}
.bxif-total{display:flex;align-items:baseline;justify-content:space-between;gap:10px;font-size:var(--bxif-fs-label);font-weight:500;color:var(--bxif-tl)}
.bxif-total b{font-size:calc(var(--bxif-fs-val) + 2px);font-weight:600;white-space:nowrap}
.bxif-foot{font-size:var(--bxif-fs-11);color:var(--bxif-t3);margin-top:8px}
.bxif-btns{display:flex;flex-direction:column;gap:8px}
.bxif-btns>.bxif-btn{width:100%}
.bxif-panel textarea.bxif-copy{display:block;width:100%;margin:0;padding:8px;border:0;border-radius:8px;background:var(--bxif-bg0);color:var(--bxif-t1);font:var(--bxif-fs-11)/1.35 var(--bx-monospaced-font,Consolas,monospace);resize:vertical;user-select:text;-webkit-user-select:text;outline:none}
.bxif-sub{margin:6px var(--bxif-row-px) 0;border-top:1px solid rgba(255,255,255,.05)}
.bxif-sub .bxif-sub-head{padding:0 2px;min-height:calc(var(--bxif-sec-h) - 2px);font-size:var(--bxif-fs-label);font-weight:500;color:var(--bxif-tl)}
.bxif-sub .bxif-sub-head>span{flex:1}
.bxif-about{display:flex;flex-direction:column;gap:8px;padding:2px 2px 6px}
.bxif-about p{margin:0;font-size:var(--bxif-fs-12);line-height:1.4;color:var(--bxif-t2)}
.bxif-foot-line{padding:0 2px;font-size:var(--bxif-fs-11);color:var(--bxif-t3)}
.bx-settings-row.bxif-native-muted>:not(.bx-settings-label){opacity:.45}
.bx-settings-row.bxif-native-muted .bx-settings-label{color:#9ea4ae}
.bx-settings-row.bxif-native-muted .bx-settings-label::after{content:"Substituída pela Nitidez do Tratamento de imagem";display:block;margin-top:2px;font-size:12px;font-weight:400;color:#b4b9c2}
@media (prefers-reduced-motion:reduce){.bxif-panel *{transition:none!important;animation:none!important}}
`;

 /* =============================== Panel model =============================== */
 // Heavy settings rebuild textures or restart the capture/pacer: leading edge plus one trailing update.
 const HEAVY = new Set(['fluidity', 'capture', 'output', 'gpuBudget', 'spatialMode']);
 const SYNC_KEYS = ['mode', 'sharpness', 'sharpening', 'scaler', 'output', 'adaptive', 'fluidity', 'capture', 'smoothing', 'gpuBudget', 'spatialMode', 'hud', 'hudPosition', 'cleanup', 'deband', 'chroma', 'detail', 'temporal', 'antialias', 'neural', 'desynchronized'];
 const TREAT = ['cleanup', 'deband', 'chroma', 'detail', 'temporal', 'antialias', 'neural'];
 const UI_KEY = 'BxImageFilter.ui.v1';
 const phoneTier = (() => { try { return matchMedia('(max-height:500px)').matches; } catch { return false; } })();
 const ui = {open: {fluidez: true, nitidez: !phoneTier, ajuste: false, desempenho: false, ferramentas: false}};
 try { const s = JSON.parse(localStorage.getItem(UI_KEY)); if (s && typeof s.open === 'object') for (const k in ui.open) if (typeof s.open?.[k] === 'boolean') ui.open[k] = s.open[k]; } catch {}
 const saveUi = () => { try { localStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch {} };

 function h(tag, props, ...kids) {
  const el = doc.createElement(tag);
  if (props) for (const k in props) {
   const v = props[k];
   if (v === null || v === undefined || v === false) continue;
   if (k === 'class') el.className = v; else if (k === 'text') el.textContent = v; else if (k === 'style') el.style.cssText = v;
   else if (k === 'tabIndex') el.tabIndex = v; else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
 }

 let root = null, lastSnap = null;
 const controls = [], sections = [], heads = [], deferred = new Map(), pending = new Map();
 const G = createHysteresis(), drops = dropRate(), els = {};
 let lastSig = '', nav = '0';
 const valueOf = k => pending.has(k) ? pending.get(k).value : settings[k];
 function setNav(v) { if (nav === v) return; nav = v; if (root) root.dataset.nav = v; }

 // Never disable or hide the element holding focus: Better xCloud would jump to the next group.
 function whenUnfocused(el, fn) {
  const a = doc.activeElement;
  if (a && a !== doc.body && el.contains(a)) deferred.set(el, fn); else { deferred.delete(el); fn(); }
 }
 function runDeferred(next) { for (const [el, fn] of deferred) if (!(next && el.contains(next))) { deferred.delete(el); fn(); } }
 const setDisabled = (c, flag) => whenUnfocused(c.row, () => { c.input.disabled = flag; setA(c.row, 'data-disabled', flag || null); });
 const setHidden = (el, flag) => whenUnfocused(el, () => setA(el, 'data-hide', flag || null));

 // Applies a setting. Better xCloud fires 'input' even at the clamp ends, and update() resets the GPU
 // adaptation, so an unchanged value is ignored.
 function commit(key, value, ev) {
  if (ev && ev.isTrusted === false) setNav('1');
  const p = pending.get(key);
  if (p) { p.value = value; afterCommit(key); return; }
  if (settings[key] === value) return;
  api.update({[key]: value});
  if (HEAVY.has(key)) pending.set(key, {value, timer: setTimeout(() => flush(key), 250)});
  afterCommit(key);
 }
 function flush(key) {
  const rec = pending.get(key);
  if (!rec) return;
  clearTimeout(rec.timer); pending.delete(key);
  if (settings[key] !== rec.value) api.update({[key]: rec.value});
  afterCommit(key);
 }
 // Presets, restore and suggestions replace values at once: a trailing commit must not undo them.
 function cancelPending() { for (const rec of pending.values()) clearTimeout(rec.timer); pending.clear(); }
 function afterCommit(key) {
  updateDependents();
  if (key === 'hud' || key === 'hudPosition' || key === 'reset') api.hud?.update();
  verdict.dirty = true;
  if (lastSnap) updateSummaries(lastSnap);
 }
 const sigOf = () => SYNC_KEYS.map(k => settings[k]).join('|') + '|' + api.diagnostic + '|' + status.desynchronized;
 function syncAll(periodic) {
  const a = doc.activeElement;
  let skipped = false;
  for (const c of controls) { if (periodic && root?.contains(a) && c.row.contains(a)) { skipped = true; continue; } c.sync(); }
  updateDependents();
  if (!skipped) lastSig = sigOf();
 }

 /* ------------------------------ control kit ------------------------------ */
 function labelCell(text, tag, sub) {
  const tx = h('span', {class: 'bxif-lab-tx', text}), tg = h('span', {class: 'bxif-tag', 'data-hide': tag ? null : ''}, tag || '');
  const el = h('div', {class: 'bxif-lab'}, tx, tg, sub ? h('span', {class: 'bxif-lab-sub', text: sub}) : null);
  return {el, tx, tag: tg, setTag(t, g) { setT(tg, t || ''); setA(tg, 'data-hide', t ? null : ''); setA(tg, 'data-g', g || null); }};
 }
 function makeRow(key, lab, ctl, extra = {}) {
  const hint = h('div', {class: 'bxif-hint'});
  const row = h('div', {class: 'bxif-row' + (extra.val ? ' bxif-has-val' : '') + (extra.stack ? ' bxif-stack' : ''), 'data-bxif-row': key}, lab.el, h('div', {class: 'bxif-ctl'}, ctl), extra.val || null, hint);
  return {row, hint};
 }
 const out = (name, cls = 'bxif-out') => h('div', {class: cls, 'data-bxif-out': name});
 const rangeInput = (key, kind, label, max, step, cls = 'bxif-in') => {
  const input = h('input', {class: cls, type: 'range', min: '0', max: String(max), step: String(step), 'aria-label': label, 'data-bxif-key': key, 'data-bxif-kind': kind});
  input.tabIndex = 0;
  return input;
 };

 // CHOICE: a segmented control over a hidden <input type=range min=0 max=n-1 step=1>. Gamepad and
 // keyboard Left/Right step it, A/Enter cycles it, a tap on a segment selects it.
 function choice(o) {
  const n = o.opts.length, values = o.opts.map(x => x[0]), stepper = n > 5;
  const input = rangeInput(o.key, 'choice', o.label, n - 1, 1);
  input.setAttribute('data-bxif-values', values.join(','));
  const thumb = stepper ? null : h('span', {class: 'bxif-seg-thumb', 'aria-hidden': 'true'});
  const optEls = stepper ? [] : o.opts.map((x, i) => h('span', {class: 'bxif-seg-opt', 'data-i': String(i), 'aria-hidden': 'true', tabIndex: -1}, o.icon ? o.icon(x[0]) : h('span', {text: x[1]})));
  const stepVal = stepper ? h('span', {class: 'bxif-step-val', 'aria-hidden': 'true'}) : null;
  const arrows = stepper ? [h('span', {class: 'bxif-step-arr', 'aria-hidden': 'true', tabIndex: -1, text: '‹'}), h('span', {class: 'bxif-step-arr', 'aria-hidden': 'true', tabIndex: -1, text: '›'})] : [];
  const seg = stepper ? h('div', {class: 'bxif-seg bxif-step', style: '--n:1;--i:0'}, input, arrows[0], stepVal, arrows[1]) : h('div', {class: 'bxif-seg', style: `--n:${n};--i:0`}, input, thumb, ...optEls);
  const lab = labelCell(o.label, o.tag, o.sub);
  const {row, hint} = makeRow(o.key, lab, seg, o);
  const get = o.get || (() => valueOf(o.key)), set = o.set || ((v, e) => commit(o.key, v, e));
  let idx = -1, reason = '';
  const c = {key: o.key, input, row, lab, hint, seg, values};
  function show(i) {
   idx = i;
   setS(seg, '--i', String(Math.max(i, 0))); setA(seg, 'data-none', i < 0 || null);
   for (let k = 0; k < optEls.length; k++) setA(optEls[k], 'data-on', k === i || null);
   const text = i >= 0 ? o.opts[i][1] : o.unknown ? o.unknown(get()) : '—';
   if (stepVal) setT(stepVal, text);
   setA(input, 'aria-valuetext', text);
   c.updateHint();
  }
  c.updateHint = () => setT(hint, reason || (o.hint ? o.hint(idx >= 0 ? values[idx] : get()) : ''));
  function apply(i, e) { i = Math.max(0, Math.min(n - 1, i)); input.value = String(i); show(i); set(values[i], e); }
  // Better xCloud's 'input' does not bubble: listen on the input itself.
  input.addEventListener('input', e => { if (e.isTrusted === false) setNav('1'); apply(+input.value, e); });
  input.addEventListener('click', e => { if (e.isTrusted || input.disabled) return; setNav('1'); apply((idx + 1) % n, e); });
  optEls.forEach((el, i) => {
   el.addEventListener('pointerdown', e => e.preventDefault());
   el.addEventListener('click', e => { if (input.disabled) return; apply(i, e); input.focus({preventScroll: true}); });
  });
  arrows.forEach((el, k) => {
   el.addEventListener('pointerdown', e => e.preventDefault());
   el.addEventListener('click', e => { if (input.disabled) return; apply(Math.max(idx, 0) + (k ? 1 : -1), e); input.focus({preventScroll: true}); });
  });
  c.sync = () => { const i = values.indexOf(get()); input.value = String(Math.max(i, 0)); show(i); };
  c.setReason = r => { if (reason !== r) { reason = r; c.updateHint(); } };
  c.sync();
  controls.push(c);
  return c;
 }

 // SLIDER: a visible range that ignores raw pointer input; the wrapper tells a horizontal drag or a tap
 // from a vertical scroll, so scrolling the dialog never changes a value by accident.
 function slider(o) {
  const scale = o.scale, max = o.max, step = o.step;
  const input = rangeInput(o.key, 'slider', o.label, max, step, 'bxif-in bxif-range');
  const notch = num(o.notch) && o.notch > 0 ? h('span', {class: 'bxif-notch', 'aria-hidden': 'true', style: `--nf:${Math.min(1, o.notch * scale / max)}`}) : null;
  const ghost = o.ghost ? h('span', {class: 'bxif-ghost', 'aria-hidden': 'true', 'data-hide': '', style: '--nf:0'}) : null;
  const wrap = h('div', {class: 'bxif-slider', style: '--p:0'}, notch, ghost, input);
  const v1 = h('span', {class: 'bxif-v1'}), v2 = h('span', {class: 'bxif-v2', 'data-hide': ''});
  const val = h('div', {class: 'bxif-val', 'aria-hidden': 'true'}, v1, v2);
  const lab = labelCell(o.label, o.tag);
  const {row, hint} = makeRow(o.key, lab, wrap, {val});
  const c = {key: o.key, input, row, lab, hint, v2, ghost, scale};
  const fill = () => setS(wrap, '--p', String(+input.value / max));
  function text(s) { const t = o.fmt(s); setT(v1, t); setA(input, 'aria-valuetext', t); }
  function fromInput(e) { fill(); const s = +input.value / scale; text(s); commit(o.key, s, e); }
  input.addEventListener('input', e => { if (e.isTrusted === false) setNav('1'); fromInput(e); });
  let g = null;
  const thumbPx = () => parseFloat(getComputedStyle(wrap).getPropertyValue('--bxif-thumb')) || 18;
  function setAt(x, e) {
   const f = Math.min(1, Math.max(0, (x - g.r.left - g.th / 2) / Math.max(1, g.r.width - g.th)));
   const v = Math.round(f * max / step) * step;
   if (+input.value !== v) { input.value = String(v); fromInput(e); }
  }
  function startDrag(e) { g.drag = true; try { wrap.setPointerCapture(e.pointerId); } catch {} input.focus({preventScroll: true}); setAt(e.clientX, e); }
  wrap.addEventListener('pointerdown', e => {
   if (input.disabled || e.button > 0) return;
   // One rect read per gesture.
   g = {id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, drag: false, dead: false, raf: 0, r: wrap.getBoundingClientRect(), th: thumbPx()};
   if (e.pointerType !== 'touch') { e.preventDefault(); startDrag(e); }
  });
  wrap.addEventListener('pointermove', e => {
   if (!g || e.pointerId !== g.id || g.dead) return;
   g.x = e.clientX;
   if (!g.drag) {
    const dx = Math.abs(e.clientX - g.x0), dy = Math.abs(e.clientY - g.y0);
    if (dy >= 6 && dy >= dx) { g.dead = true; return; }
    if (dx >= 6 && dx > dy) startDrag(e);
    return;
   }
   if (!g.raf) { const gg = g; gg.raf = requestAnimationFrame(() => { gg.raf = 0; if (g === gg) setAt(gg.x, null); }); }
  });
  wrap.addEventListener('pointerup', e => {
   if (!g || e.pointerId !== g.id) return;
   const gg = g; g = null;
   if (gg.raf) cancelAnimationFrame(gg.raf);
   if (gg.dead) return;
   const tap = Math.abs(e.clientX - gg.x0) < 6 && Math.abs(e.clientY - gg.y0) < 6;
   if (gg.drag || tap) { g = gg; setAt(e.clientX, e); g = null; if (!gg.drag) input.focus({preventScroll: true}); }
  });
  wrap.addEventListener('pointercancel', () => { if (g?.raf) cancelAnimationFrame(g.raf); g = null; });
  // A click listener makes Chromium's touch adjustment treat the track as a tap target of its own row.
  wrap.addEventListener('click', () => {});
  c.sync = () => { const s = settings[o.key]; input.value = String(Math.round(s * scale)); fill(); text(s); };
  c.sync();
  controls.push(c);
  return c;
 }

 // SWITCH: a range 0/1 laid over a pill; Right turns it on, Left off, A toggles.
 function toggle(o) {
  const input = rangeInput(o.key, 'switch', o.label, 1, 1);
  const pill = h('span', {class: 'bxif-sw-pill', 'aria-hidden': 'true'}, h('span', {class: 'bxif-sw-knob'}));
  const tx = h('span', {class: 'bxif-sw-tx', 'aria-hidden': 'true'});
  const sw = h('div', {class: 'bxif-sw'}, input, pill, tx);
  const lab = labelCell(o.label, o.tag || null, o.sub);
  const {row, hint} = makeRow(o.key, lab, sw);
  setT(hint, o.hint || '');
  const c = {key: o.key, input, row, lab, hint};
  function show(on) { input.value = on ? '1' : '0'; setA(sw, 'data-on', on || null); const t = on ? 'Ligado' : 'Desligado'; setT(tx, t); setA(input, 'aria-valuetext', t); }
  const set = (on, e) => { show(on); o.set(on, e); };
  input.addEventListener('input', e => { if (e.isTrusted === false) setNav('1'); set(input.value === '1', e); });
  input.addEventListener('click', e => { if (e.isTrusted) return; setNav('1'); set(input.value !== '1', e); });
  // A tap anywhere on the pill or its text toggles (Better xCloud's click targets the input itself).
  sw.addEventListener('pointerdown', e => { if (e.target !== input) e.preventDefault(); });
  sw.addEventListener('click', e => { if (e.target === input) return; set(input.value !== '1', e); input.focus({preventScroll: true}); });
  c.sync = () => show(!!o.get());
  c.sync();
  controls.push(c);
  return c;
 }
 function button(text, variant, onClick) {
  const label = h('span', {text});
  const b = h('button', {type: 'button', class: 'bxif-btn' + (variant ? ' bxif-btn-' + variant.split(' ').join(' bxif-btn-') : '')}, label);
  b._label = label;
  b.addEventListener('click', e => { if (e.isTrusted === false) setNav('1'); onClick?.(e); });
  return b;
 }
 function section(id, idx, title) {
  const sum = h('span', {class: 'bxif-sec-sum'});
  const head = h('button', {type: 'button', class: 'bxif-sec-head', 'aria-expanded': 'false', 'aria-controls': 'bxif-body-' + id},
   h('span', {class: 'bxif-sec-idx', text: idx}), h('span', {class: 'bxif-sec-title', text: title}), sum, h('i', {class: 'bxif-chev', 'aria-hidden': 'true'}));
  const body = h('div', {class: 'bxif-sec-body', id: 'bxif-body-' + id});
  const s = {id, head, body, sum, open: false, update: null, el: h('section', {class: 'bxif-sec', 'data-sec': id}, head, body)};
  s.setOpen = v => {
   s.open = v; setA(head, 'aria-expanded', String(v)); setA(s.el, 'data-open', v || null);
   if (ui.open[id] !== v) { ui.open[id] = v; saveUi(); }
   if (v && lastSnap && s.update) s.update(lastSnap);
  };
  head.addEventListener('click', e => { if (e.isTrusted === false) setNav('1'); s.setOpen(!s.open); });
  sections.push(s); heads.push(s);
  return s;
 }
 function subSection(id, title, content) {
  const body = h('div', {class: 'bxif-about', id: 'bxif-body-' + id, 'data-hide': ''}, ...content);
  const head = h('button', {type: 'button', class: 'bxif-sub-head', 'aria-expanded': 'false', 'aria-controls': 'bxif-body-' + id}, h('span', {text: title}), h('i', {class: 'bxif-chev', 'aria-hidden': 'true'}));
  const s = {head, open: false, setOpen(v) { s.open = v; setA(head, 'aria-expanded', String(v)); setA(body, 'data-hide', v ? null : ''); }};
  head.addEventListener('click', e => { if (e.isTrusted === false) setNav('1'); s.setOpen(!s.open); });
  heads.push(s);
  return h('div', {class: 'bxif-sub'}, head, body);
 }
 // Left/Right on a section header close/open it; on other buttons they do nothing (instead of
 // jumping to Better xCloud's tab bar). Ranges never get here: Better xCloud changes their value.
 function onSideKey(dir) {
  const a = doc.activeElement, s = heads.find(x => x.head === a);
  setNav('1');
  if (s) s.setOpen(dir === 2);
 }

 /* =============================== Panel content =============================== */
 const FLU = {off: 'Desligada', balanced: 'Equilibrada', max: 'Máxima'};
 const CORNER = {'top-left': 'Superior esquerdo', 'top-right': 'Superior direito', 'bottom-left': 'Inferior esquerdo', 'bottom-right': 'Inferior direito'};
 const SMOOTH_STATE = {waiting: 'aguardando vídeo', unsupported: 'não suportado', requested: 'aceito', partial: 'parcial', error: 'falhou'};
 const WARN_HINT = {bitrate: 'Better xCloud › Stream: Bitrate máximo → Ilimitado.', resolution: 'Better xCloud › Stream: escolha 1080p.', loss: 'Prefira Wi-Fi 5 GHz ou cabo.'};
 const natural = api.presets?.natural?.values || {};

 function kpi(name, cap) {
  const dot = h('i', {class: 'bxif-dot'}), dotWrap = h('span', {style: 'display:inline-flex'}, dot);
  const numEl = h('span'), unit = h('span', {class: 'bxif-unit'}), val = h('span', {class: 'bxif-kpi-val'}, numEl, unit), sub = h('span', {class: 'bxif-kpi-sub'});
  return {el: h('div', {class: 'bxif-kpi', 'data-bxif-out': name}, h('span', {class: 'bxif-kpi-cap'}, dotWrap, cap), val, sub), dotWrap, num: numEl, unit, val, sub};
 }

 function build() {
  const r = h('div', {class: 'bxif-panel', 'data-bx-restoration': VERSION, role: 'group', 'aria-label': 'Tratamento de imagem', 'data-nav': '0', 'data-tier': tierNow()});
  r.nearby = {loop: dir => (dir === 2 || dir === 4) ? (onSideKey(dir), true) : false};
  // [A] header
  els.pillWord = h('span');
  els.pill = h('span', {class: 'bxif-pill', 'aria-live': 'polite', 'data-g': 'none'}, h('i', {class: 'bxif-dot'}), els.pillWord);
  r.append(h('div', {class: 'bxif-head'}, h('div', {class: 'bxif-title'}, h('span', {class: 'bxif-name', text: 'Tratamento de imagem'}), h('span', {class: 'bxif-ver', text: VERSION})), els.pill));
  // [B] warnings
  els.warns = h('div', {class: 'bxif-warns', 'data-bxif-out': 'warnings', 'data-hide': ''});
  els.warnText = new Map();
  els.warns.addEventListener('focusout', e => { if (!(e.relatedTarget && els.warns.contains(e.relatedTarget))) els.warnSig = null; });
  r.append(els.warns);
  // [C] live card
  els.k = {fps: kpi('kpi-fps', 'FPS'), pacing: kpi('kpi-pacing', 'Ritmo'), hitches: kpi('kpi-hitches', 'Travadas'), latency: kpi('kpi-latency', 'Latência')};
  els.spark = h('canvas', {'data-bxif-out': 'spark', 'aria-hidden': 'true'});
  els.sparkT = h('span', {class: 'bxif-spark-t'});
  els.meta = h('div', {class: 'bxif-meta', 'data-bxif-out': 'meta'});
  const hud = choice({key: 'hud', label: 'Indicadores no jogo', opts: [['off', 'Desligado'], ['compact', 'Compacto'], ['full', 'Completo']],
   hint: v => ({off: 'Nada sobre o jogo.', compact: 'FPS, ritmo, travadas e latência num canto pequeno.', full: 'Fluidez, latência, rede e imagem.'})[v] || ''});
  els.corner = choice({key: 'hudPosition', label: 'Canto', opts: Object.entries(CORNER), icon: v => h('span', {class: 'bxif-corner', 'data-c': v}),
   hint: v => (CORNER[v] ? CORNER[v] + '. ' : '') + 'No celular, o modo Compacto usa a faixa preta lateral quando houver espaço.'});
  r.append(h('div', {class: 'bxif-live'},
   h('div', {class: 'bxif-kpis'}, els.k.fps.el, els.k.pacing.el, els.k.hitches.el, els.k.latency.el),
   h('div', {class: 'bxif-spark-cap', 'aria-hidden': 'true'}, h('span', {text: 'RITMO NA TELA'}), els.sparkT),
   h('div', {class: 'bxif-spark'}, els.spark), els.meta));
  // [D] 01 Fluidez
  const s1 = section('fluidez', '01', 'Fluidez');
  els.verdictTx = h('span', {class: 'bxif-verdict-tx'});
  els.verdictBtn = button('', 'sm out', e => verdict.action?.(e));
  els.verdictBtn.tabIndex = -1; setA(els.verdictBtn, 'data-off', true);
  els.verdict = h('div', {class: 'bxif-verdict', 'data-bxif-out': 'verdict', 'data-g': 'none'}, h('i', {class: 'bxif-dot'}), els.verdictTx, els.verdictBtn);
  els.verdict.addEventListener('focusout', e => { if (!(e.relatedTarget && els.verdict.contains(e.relatedTarget))) verdict.dirty = true; });
  const flu = choice({key: 'fluidity', label: 'Fluidez', opts: [['off', 'Desligada'], ['balanced', 'Equilibrada'], ['max', 'Máxima']], hint: v => ({
   off: 'Exibe cada quadro assim que chega: menor latência; o ritmo segue a rede.',
   balanced: 'Exibe no ritmo do servidor e corrige a oscilação da rede e da decodificação. Acrescenta poucos ms de espera.',
   max: 'Ritmo fixo de 30/60 FPS; corrige também jogo/servidor irregular. Um pouco mais de espera.'})[v] || ''});
  els.capture = choice({key: 'capture', label: 'Captura de quadros', opts: [['video', 'Vídeo'], ['direct', 'Direta']], hint: v => v === 'direct'
   ? 'Recebe cada quadro direto do decodificador: evita quadros pulados.' : 'Lê os quadros do elemento de vídeo (mais compatível).'});
  els.captureOut = out('capture'); els.capture.row.append(els.captureOut);
  const smoothHint = 'Pede ao navegador um alvo de buffer. Mais buffer deixa o ritmo mais regular, com mais latência. Não garante um atraso máximo.';
  els.smooth = choice({key: 'smoothing', label: 'Suavidade', opts: [[0, 'Auto'], [17, '17 ms'], [33, '33 ms'], [50, '50 ms']], hint: v => (v === 0 ? 'O navegador decide. ' : '') + smoothHint});
  els.smoothOut = out('smoothing'); els.smooth.row.append(els.smoothOut);
  els.pipe = {};
  const cell = (k, label) => { const v = h('span', {class: 'bxif-pipe-v'}), sub = h('span', {class: 'bxif-pipe-s'}); els.pipe[k] = {v, sub}; return h('div', {class: 'bxif-pipe-cell'}, h('span', {class: 'bxif-pipe-k', text: label}), v, sub); };
  els.pacingLine = h('div', {'data-bxif-out': 'pacing'}); els.fluLine = h('div', {'data-bxif-out': 'fluidity'});
  s1.body.append(els.verdict, flu.row, els.capture.row, els.smooth.row,
   h('div', {class: 'bxif-cap'}, 'Onde nasce a oscilação ', h('span', {style: 'text-transform:none', text: '· 2 s'})),
   h('div', {class: 'bxif-pipe', 'data-bxif-out': 'pipeline'}, cell('srv', 'SERVIDOR'), h('i', {class: 'bxif-pipe-arr'}), cell('arr', 'CHEGADA'), h('i', {class: 'bxif-pipe-arr'}), cell('scr', 'TELA')),
   h('div', {class: 'bxif-lines'}, els.pacingLine, els.fluLine));
  s1.update = updateFluidez;
  // [E] 02 Nitidez e imagem
  const s2 = section('nitidez', '02', 'Nitidez e imagem');
  els.chips = Object.entries(api.presets || {}).map(([k, p]) => {
   const b = button(p.label, null, () => { cancelPending(); api.applyPreset(k); syncAll(); afterCommit('preset'); });
   b.className = 'bxif-chip'; b.dataset.preset = k; setA(b, 'aria-pressed', 'false'); setA(b, 'aria-label', 'Perfil ' + p.label);
   b.addEventListener('focus', () => updatePreset(k)); b.addEventListener('blur', () => updatePreset(null));
   return b;
  });
  els.chipBox = h('div', {class: 'bxif-chips'}, ...els.chips);
  els.chipBox.nearby = {orientation: 'horizontal', focus: () => { (els.chips.find(b => b.getAttribute('aria-pressed') === 'true') || els.chips[0]).focus(); return true; }, loop: d => d === 2 || d === 4};
  els.presetPick = h('div', {class: 'bxif-val bxif-pick'});
  els.presetDesc = h('div', {class: 'bxif-desc'});
  els.presetLab = labelCell('Perfil');
  const presetRow = h('div', {class: 'bxif-row bxif-stack bxif-has-val', 'data-bxif-row': 'preset'}, els.presetLab.el, h('div', {class: 'bxif-ctl'}, els.chipBox, els.presetDesc), els.presetPick);
  els.sharp = slider({key: 'sharpness', label: 'Nitidez', max: 20, step: 1, scale: 2, notch: 3, fmt: s => s === 0 ? 'Desl.' : fmt(s, 1)});
  els.method = choice({key: 'sharpening', label: 'Método', opts: [['usm', 'USM'], ['cas', 'CAS'], ['rcas', 'RCAS'], ['native', 'Nativo']], hint: v => (({
   usm: 'Recomendado: contorno limpo.', cas: 'AMD FidelityFX CAS.', rcas: 'AMD FidelityFX RCAS.', native: 'Segue o Processamento do menu do Better xCloud (CAS/USM).'})[v] || '') + ' Vale também para a referência Só nitidez.'});
  // Spec 3 item 5: SGSR 1 replaces EASU + sharpening with one pass when the output is larger than the stream.
  els.scaler = choice({key: 'scaler', label: 'Escalador/nitidez', opts: [['easu', 'EASU + nitidez'], ['sgsr', 'SGSR (menos GPU)']], hint: v => (({
   easu: 'Atual: FSR 1 EASU amplia e o Método aplica a nitidez.', sgsr: 'Snapdragon GSR 1 amplia e dá nitidez numa passada só: menos GPU, um pouco menos de detalhe. Substitui o Método só quando a saída é maior que o stream; em saída nativa fica a nitidez atual.'})[v] || '')});
  els.output = choice({key: 'output', label: 'Resolução de saída', opts: [['auto', 'Auto'], ['native', 'Nativa'], ['1440', '2K'], ['2160', '4K']], unknown: v => v + 'p', hint: v => ({
   auto: 'Renderiza na altura real do vídeo na tela (FSR + nitidez no tamanho final). Em HDMI 1080p fica nativa.', native: 'Mantém a resolução do stream.',
   1440: 'Só para telas 1440p ou maiores; acima da tela só custa GPU.', 2160: 'Só para telas 4K; custo alto de GPU.'})[v] || 'Valor salvo fora das opções; escolha uma para substituí-lo.'});
  els.outputOut = out('output'); els.output.row.append(els.outputOut);
  els.adaptive = toggle({key: 'adaptive', label: 'Adaptar à compressão', get: () => valueOf('adaptive'), set: (v, e) => commit('adaptive', v, e),
   hint: 'Ajusta limpeza, degradês e detalhe à compressão (QP) do stream, devagar, sem pulsar.'});
  els.qpPos = h('span', {class: 'bxif-meter-pos', 'data-hide': ''}, h('i', {class: 'bxif-meter-tick'}));
  els.qp = h('div', {class: 'bxif-x', 'data-bxif-out': 'qp'}, h('div', {class: 'bxif-qp-track'}, h('span', {class: 'bxif-meter-clip'}, els.qpPos)), h('div', {class: 'bxif-qp-cap'}, h('span', {text: '20 limpo'}), h('span', {text: '28'}), h('span', {text: '36 forte'})));
  els.adaptiveOut = out('adaptive');
  els.adaptive.row.append(els.qp, els.adaptiveOut);
  els.mode = choice({key: 'mode', label: 'Comparação', opts: [['original', 'Original'], ['cas', 'Só nitidez'], ['filtered', 'Tratada']], hint: v => (({
   original: 'Vídeo puro, sem tratamento.', cas: 'Referência: só a nitidez, sem limpeza.', filtered: 'Tratamento completo (use esta para jogar).'})[v] || '') + ' Com o jogo aberto, compare ao vivo à esquerda do menu.'});
  s2.body.append(presetRow, els.sharp.row, els.method.row, els.scaler.row, els.output.row, els.adaptive.row, els.mode.row);
  s2.update = updateNitidez;
  // [F] 03 Ajuste fino
  const s3 = section('ajuste', '03', 'Ajuste fino');
  const TREAT_UI = [['Compressão', 'cleanup', 'Remove blocos e ruído de compressão.'], ['Degradês', 'deband', 'Suaviza faixas em céus e sombras; alto demais apaga textura.'],
   ['Cor nas bordas', 'chroma', 'Corrige cor borrada nas bordas (vídeo 4:2:0).'], ['Detalhe', 'detail', 'Realça microtextura.'], ['Estabilidade em movimento', 'temporal', 'Reduz cintilação entre quadros. Custa GPU.'],
   ['Antialiasing', 'antialias', 'Suaviza serrilhado; também suaviza textura.'], ['Reconstrução neural', 'neural', 'Rede treinada em streams H.264 limpa blocos antes da nitidez. ~30% mais GPU; use Nitidez ~2,5.']];
  els.treat = {};
  for (const [label, key, hint] of TREAT_UI) {
   const c = els.treat[key] = slider({key, label, max: 100, step: 5, scale: 100, notch: natural[key], tag: key === 'neural' ? 'EXP' : null, ghost: ['cleanup', 'deband', 'detail'].includes(key), fmt: s => Math.round(s * 100) + '%'});
   setT(c.hint, hint);
   s3.body.append(c.row);
  }
  const spatial = choice({key: 'spatialMode', label: 'Limpeza espacial', opts: [['selective', 'Seletiva'], ['legacy', 'Clássica']], hint: () => 'Seletiva (v8) preserva textura; Clássica é a referência da v7.1.'});
  s3.body.append(spatial.row);
  s3.update = updateAjuste;
  // [G] 04 Desempenho e rede
  const s4 = section('desempenho', '04', 'Desempenho e rede');
  const budgetTail = ' Acima do limite (p95) desliga nesta ordem: estabilidade, saída, antialiasing, neural, degradês, limpeza, detalhe.';
  const budget = choice({key: 'gpuBudget', label: 'Aliviar GPU acima de', opts: [[3, '3 ms'], [6, '6 ms'], [10, '10 ms'], [0, 'Nunca']], hint: v => (({
   3: 'Corta etapas cedo; prioriza a fluidez.', 6: 'Equilíbrio padrão.', 10: 'Mantém mais etapas; risco de queda de quadros.', 0: 'Nunca reduz o tratamento automaticamente.'})[v] || '') + budgetTail});
  els.gpuText = h('b'); els.gpuFill = h('i', {class: 'bxif-meter-fill'}); els.gpuTick = h('span', {class: 'bxif-meter-pos'}, h('i', {class: 'bxif-meter-tick'}));
  els.gpuMeter = h('div', {class: 'bxif-meter bxif-x'}, els.gpuFill, h('span', {class: 'bxif-meter-clip'}, els.gpuTick));
  els.gpuNote = h('div', {class: 'bxif-out', 'data-hide': ''}); els.adaptation = h('div', {class: 'bxif-out', 'data-bxif-out': 'adaptation'});
  els.gpu = h('div', {class: 'bxif-row bxif-stack', 'data-bxif-out': 'gpu'},
   h('div', {class: 'bxif-total bxif-x', style: 'margin-top:0'}, h('span', {text: 'Tratamento (GPU p95)'}), els.gpuText), els.gpuMeter, els.gpuNote, els.adaptation);
  els.latTotal = h('b'); els.latBar = h('div', {class: 'bxif-stackbar'}, h('span'), h('span'), h('span'), h('span'), h('span'));
  const legend = key => { const v = h('span'); return {row: h('div', null, h('i', {class: 'bxif-sw-i'}), h('span', {text: key + ' '}), v), v}; };
  els.leg = [legend('Rede (RTT)'), legend('Buffer'), legend('Decodificação'), legend('Tratamento'), legend('Espera da Fluidez')];
  els.latency = h('div', {class: 'bxif-row bxif-stack', 'data-bxif-out': 'latency'},
   h('div', {class: 'bxif-total bxif-x', style: 'margin-top:0'}, h('span', {text: 'Latência estimada'}), els.latTotal), h('div', {class: 'bxif-x', style: 'margin-top:0'}, els.latBar),
   h('div', {class: 'bxif-legend bxif-x'}, ...els.leg.map(x => x.row)), h('div', {class: 'bxif-foot bxif-x', text: 'Soma aproximada; não inclui controle, jogo nem tela.'}));
  els.stream = h('div', {'data-bxif-out': 'stream'}); els.decoder = h('div', {'data-bxif-out': 'decoder'}); els.quality = h('div', {'data-bxif-out': 'quality'}); els.drops = h('div', {'data-bxif-out': 'drops'});
  // Spec 3 item 11 (docs/medicoes/spec3/*item11*): on the Vostro at 30 FPS, display p95 50 → 34 ms and
  // about −0.5 ms of GPU per frame; at 60 FPS the frames shown fell from 58-59 to 44 FPS. On the Poco F7
  // no gain. Tearing was not evaluated. The attribute is fixed when the canvas is created.
  els.desync = toggle({key: 'desynchronized', label: 'Baixa latência (desynchronized)', tag: 'EXP', get: () => valueOf('desynchronized'), set: (v, e) => commit('desynchronized', v, e),
   hint: 'Só para PC em jogos a 30 FPS: ritmo mais estável. A 60 FPS mostrou menos quadros (44 em vez de 58) e no celular não ganhou. Pode causar tearing (imagem rasgada). Vale na próxima sessão.'});
  els.desyncOut = out('desynchronized'); els.desync.row.append(els.desyncOut);
  s4.body.append(budget.row, els.desync.row, els.gpu,els.latency, h('div', {class: 'bxif-lines', style: 'margin-top:4px'}, els.stream, els.decoder, els.quality, els.drops));
  s4.update = updateDesempenho;
  // [H] 05 Ferramentas
  const s5 = section('ferramentas', '05', 'Indicadores e ferramentas');
  els.diag = toggle({key: 'diagnostic', label: 'Diagnóstico', sub: 'Colorir imagem', get: () => api.diagnostic, set: v => { api.diagnostic = v; if (lastSnap) { updateHeader(); updateSummaries(lastSnap); } },
   hint: 'Colore a imagem para confirmar que o tratamento está rodando. Não é salvo.'});
  els.measureStart = button('Iniciar medição', 'primary');
  els.measureExport = button('Encerrar e exportar medição');
  els.measureLine = h('div', {class: 'bxif-val bxif-status', 'data-bxif-out': 'measure'});
  els.measureMsg = 'Pronta'; els.measureAt = 0;
  // Awaitable handlers (the harness awaits .onclick()); disabled only while running and unfocused.
  const busy = async (b, fn) => {
   if (b._busy) return;
   b._busy = true; const lock = doc.activeElement !== b; if (lock) b.disabled = true;
   try { await fn(); } finally { b._busy = false; if (lock) b.disabled = false; updateMeasure(); if (lastSnap) updateSummaries(lastSnap); }
  };
  els.measureStart.onclick = () => busy(els.measureStart, async () => {
   if (await api.startMeasurement()) { els.measureAt = Date.now(); els.measureMsg = ''; } else els.measureMsg = 'Sem tratamento ativo para medir';
  });
  els.measureExport.onclick = () => busy(els.measureExport, async () => {
   const report = await api.exportMeasurement(); els.measureMsg = report ? 'Medição exportada' : 'Nenhuma medição em andamento'; els.measureAt = 0;
  });
  const measureRow = h('div', {class: 'bxif-row bxif-stack bxif-has-val', 'data-bxif-row': 'measure'}, labelCell('Medição').el, h('div', {class: 'bxif-ctl bxif-btns'}, els.measureStart, els.measureExport), els.measureLine,
   h('div', {class: 'bxif-hint', text: 'Grava tempos de GPU e ritmo; exporta um JSON. Não mede a latência do controle.'}));
  els.copyBox = h('textarea', {class: 'bxif-copy', readonly: '', rows: '6', tabIndex: -1, 'data-hide': '', 'aria-label': 'Configuração'});
  els.copy = button('Copiar configuração', null, async () => {
   const text = api.configText(); els.copyBox.value = text;
   if (await api.copyText(text)) flashLabel(els.copy, 'Configuração copiada', 'Copiar configuração');
   else { setT(els.copy._label, 'Copie o texto abaixo'); setA(els.copyBox, 'data-hide', null); els.copyBox.select(); }
  });
  els.reset = button('Restaurar tratamento', 'danger', onReset);
  els.reset.append(h('i', {class: 'bxif-count', 'aria-hidden': 'true'}));
  const toolRow = h('div', {class: 'bxif-row bxif-stack', 'data-bxif-row': 'tools'}, labelCell('Configuração').el, h('div', {class: 'bxif-ctl bxif-btns'}, els.copy, els.copyBox, els.reset),
   h('div', {class: 'bxif-hint', text: 'Volta o tratamento ao padrão medido. Os indicadores no jogo não mudam.'}));
  const about = subSection('como', 'Como funciona', [
   'Saída Auto: renderiza na altura real do vídeo na tela; em celulares usa FSR e aplica a nitidez no tamanho final; em HDMI 1080p fica nativa.',
   'Fluidez: processa cada quadro ao chegar e o exibe num relógio constante. Equilibrada segue o servidor; Máxima impõe 30/60 fixo.',
   'Captura direta: recebe os quadros do decodificador sem passar pelo elemento de vídeo, que mostra no máximo um quadro por atualização da tela.',
   'Suavidade: pede um alvo de buffer ao navegador, que pode ajustá-lo; mais regularidade com mais latência, sem atraso máximo garantido.',
   'Reconstrução neural (experimental): limpa blocos antes da nitidez; ~30% mais GPU. Degradês altos e Antialiasing suavizam textura.',
   'v9: padrões medidos em streams H.264 tipo xCloud. Tudo fica salvo para todos os jogos.'].map(t => h('p', {text: t})));
  s5.body.append(hud.row, els.corner.row, els.diag.row, measureRow, toolRow, about);
  s5.update = updateMeasure;
  for (const s of sections) { r.append(s.el); s.setOpen(!!ui.open[s.id]); }
  r.append(h('div', {class: 'bxif-foot-line', text: 'Salvo para todos os jogos · Tratamento de imagem ' + VERSION}));
  r.addEventListener('focusout', e => runDeferred(e.relatedTarget));
  // Held D-pad presses never set html[data-active-input]: any focus not caused by a pointer shows the ring.
  // Chromium's focus scroll ignores scroll-margin, so a control landing under the sticky selector is
  // scrolled again with block:'start', which honours it (after Better xCloud's focus(), same task).
  r.addEventListener('focusin', e => {
   if (performance.now() - lastPointer > 400) setNav('1');
   const t = e.target;
   queueMicrotask(() => {
    const sel = els.sticky;
    if (doc.activeElement !== t || !sel?.isConnected) return;
    const box = (t.closest('.bxif-seg,.bxif-slider,.bxif-sw,.bxif-chips') || t).getBoundingClientRect();
    if (box.top < sel.getBoundingClientRect().bottom + 8) t.scrollIntoView({block: 'start'});
   });
  });
  return r;
 }

 /* ------------------------------ transient labels ------------------------------ */
 const flashes = new Set();
 function flashLabel(b, text, back, ms = 2000) {
  setT(b._label, text);
  clearTimeout(b._flash); flashes.add(b);
  b._flash = setTimeout(() => { flashes.delete(b); b._flash = 0; setT(b._label, back); }, ms);
 }
 let resetTimer = 0;
 function disarm() { clearTimeout(resetTimer); resetTimer = 0; setA(els.reset, 'data-armed', null); setA(els.reset.lastChild, 'data-run', null); setT(els.reset._label, 'Restaurar tratamento'); }
 // Two presses within 4 s; focus stays on the button.
 function onReset() {
  if (!resetTimer) {
   if (els.reset._flash) { clearTimeout(els.reset._flash); flashes.delete(els.reset); els.reset._flash = 0; }
   setT(els.reset._label, 'Confirmar restauração'); setA(els.reset, 'data-armed', true);
   requestAnimationFrame(() => { if (resetTimer) setA(els.reset.lastChild, 'data-run', true); });
   resetTimer = setTimeout(disarm, 4000);
   return;
  }
  disarm();
  cancelPending();
  api.reset(); syncAll(); afterCommit('reset');
  flashLabel(els.reset, 'Tratamento restaurado', 'Restaurar tratamento');
 }

 /* =============================== Updates =============================== */
 function updateDependents() {
  const fl = valueOf('fluidity'), direct = api.directSupported();
  setDisabled(els.capture, fl === 'off' || !direct);
  els.capture.setReason(fl === 'off' ? 'Disponível com a Fluidez ligada.' : !direct ? 'Este navegador não permite a captura direta.' : '');
  setHidden(els.corner.row, valueOf('hud') === 'off');
  els.mode.lab.setTag(settings.mode !== 'filtered' ? 'Comparando' : '', 'ok');
  setT(els.sharp.hint, '0 desliga. 2–3 é o ponto medido; acima de 4 aumenta a cintilação em movimento.' + (settings.neural > 0 ? ' Com Reconstrução neural, use ~2,5.' : '') + (valueOf('scaler') === 'sgsr' ? ' Com SGSR, define a força dele (2 → 1,0).' : ''));
  const o = valueOf('output');
  setT(els.output.lab.tx, 'Resolução de saída' + (['auto', 'native', '1440', '2160'].includes(o) ? '' : ` (${o}p)`));
  setA(els.qp, 'data-hide', valueOf('adaptive') ? null : '');
  updateDesync();
  updatePreset();
 }
 // The canvas keeps the attribute it was created with: a change shows as pending until the next session.
 function updateDesync() {
  const want = !!valueOf('desynchronized'), now = status.desynchronized;
  if (now === null || now === undefined) setParts(els.desyncOut, want ? [['Aplicado ao abrir o próximo jogo.', 'lab']] : []);
  else if (now === want) setParts(els.desyncOut, want ? [['Ativo nesta sessão', 'good']] : []);
  else setParts(els.desyncOut, [[want ? 'Liga na próxima sessão (reabra o jogo ou recarregue).' : 'Desliga na próxima sessão (reabra o jogo ou recarregue).', 'lab']]);
 }
 function updatePreset(focused) {
  if (focused !== undefined) els.chipFocus = focused;
  const active = api.preset(), p = api.presets[active];
  for (const b of els.chips) setA(b, 'aria-pressed', String(b.dataset.preset === active));
  setT(els.presetPick, p ? p.label : '');
  els.presetLab.setTag(p ? '' : 'Personalizado');
  const f = els.chipFocus && api.presets[els.chipFocus];
  setT(els.presetDesc, f ? f.description : p ? p.description : 'Valores ajustados à mão. Escolha um perfil para voltar a um ponto medido.');
 }
 function updateHeader() { const w = stateWord(); setT(els.pillWord, w.word); setA(els.pill, 'data-g', w.grade); }
 // Errors first, then warnings with a fix one press away (they must never hide behind "+N"), then the
 // rest. The block is rebuilt only when the set of warnings changes; texts (e.g. the loss %) update in place.
 const ACTIONABLE = new Set(['output', 'renderer']);
 const warnRank = w => w.level === 'error' ? 4 : ACTIONABLE.has(w.key) ? 3 : w.level === 'warn' ? 2 : 1;
 function focusRenderer() {
  const row = root?.parentElement && [...root.parentElement.children].find(e => e.prefKey === 'video.player.type');
  if (!row) return;
  // Controller-friendly selects (Android app) hide the native <select>; Better xCloud points nearby.focus at its '>' button.
  const wrap = row.querySelector('.bx-select'), visible = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.x >= 0 || r.y >= 0); };
  const t = wrap?.nearby?.focus instanceof HTMLElement ? wrap.nearby.focus : [...row.querySelectorAll('*')].find(e => e.tabIndex >= 0 && !e.disabled && visible(e));
  t?.focus();
 }
 function updateWarnings(force) {
  const list = (status.warnings || []).slice().sort((a, b) => warnRank(b) - warnRank(a));
  const shown = els.warnsAll ? list : list.slice(0, 3);
  const sig = shown.map(w => w.key + ':' + w.level).join('|') + '|' + list.length + '|' + !!els.warnsAll;
  if (sig === els.warnSig) { for (const w of shown) { const t = els.warnText.get(w.key); if (t) setT(t, w.text); } return; }
  if (!force && els.warns.contains(doc.activeElement)) return;
  els.warnSig = sig; els.warnText = new Map();
  els.warns.textContent = ''; els.warnMore = null;
  setA(els.warns, 'data-hide', list.length ? null : '');
  for (const w of shown) {
   const text = h('span', {class: 'bxif-warn-text', text: w.text}); els.warnText.set(w.key, text);
   const tx = h('div', {class: 'bxif-warn-tx'}, text, WARN_HINT[w.key] ? h('span', {class: 'bxif-warn-hint', text: WARN_HINT[w.key]}) : null);
   let action = null;
   if (w.key === 'output') action = button('Usar Auto', 'sm', e => { commit('output', 'auto', e); syncAll(); });
   if (w.key === 'renderer') action = button('Ir para Renderizador', 'sm', focusRenderer);
   els.warns.append(h('div', {class: 'bxif-warn', 'data-level': w.level}, h('i', {class: 'bxif-badge', 'data-c': w.level === 'info' ? 'i' : '!', 'aria-hidden': 'true'}), tx, action));
  }
  if (list.length > 3) {
   const rest = list.length - 3;
   els.warnMore = button(els.warnsAll ? 'Mostrar menos' : rest === 1 ? 'Mostrar +1 aviso' : `Mostrar +${rest} avisos`, null, () => {
    els.warnsAll = !els.warnsAll; updateWarnings(true); els.warnMore?.focus({preventScroll: true});
   });
   els.warnMore.className = 'bxif-warn-more';
   els.warns.append(els.warnMore);
  }
 }
 function parseRes() { const m = /(\d+)\s*×\s*(\d+)\s*→\s*(\d+)\s*×\s*(\d+)/.exec(status.resolution || ''); return m ? {w: +m[1], h: +m[2], ow: +m[3], oh: +m[4]} : null; }
 const DEC_SHORT = {hardware: 'HW', software: 'CPU'};
 function netParts(s, parts) {
  const n = s.net;
  if (!n) return;
  const sep = () => { if (parts.length) parts.push([' · ', 'dim']); };
  if (n.codec) { sep(); parts.push([n.codec, null]); }
  if (DEC_SHORT[n.decoder]) { sep(); parts.push([DEC_SHORT[n.decoder], G('dec-kind', s.gDecoder)]); }
  if (num(n.bitrateMbps)) { sep(); parts.push([fmt(n.bitrateMbps, 1) + ' Mb/s', G('bitrate', s.gBitrate)]); }
  if (num(s.qp)) { sep(); parts.push(['QP ' + fmtInt(s.qp), G('qp', s.gQp)]); }
  if (num(n.lossPct)) { sep(); parts.push(['perda ' + fmt(n.lossPct, 1) + '%', G('loss', s.gLoss)]); }
 }
 function updateLive(s) {
  const k = els.k, on = s.on, p = s.p;
  const kp = (t, value, unit, g, subParts) => { setT(t.num, value); setT(t.unit, unit); setA(t.val, 'data-g', g); setA(t.dotWrap, 'data-g', g); setParts(t.sub, subParts); };
  kp(k.fps, on ? fmtInt(s.fps) : '—', '', on ? G('fps', s.gFps) : 'none', [['de ' + s.N, null]]);
  kp(k.pacing, on && p ? '±' + fmt(p.deviationMs, 1) : '—', on && p ? 'ms' : '', on && p ? G('dev', s.gDev) : 'none', [['p95 ', null], [on && p ? fmtMs(p.p95Ms) : '—', on && p ? G('p95', s.gP95) : 'none']]);
  kp(k.hitches, on && p ? String(p.hitches) : '—', '', on && p ? G('hit', s.gHit) : 'none',
   s.missed === null && s.direct ? [['captura direta', 'good']] : [['pulados ', null], [s.missed === null ? '—' : String(s.missed), G('miss', s.gMiss)]]);
  kp(k.latency, s.lat.total === null ? '—' : '≈' + fmtInt(s.lat.total), s.lat.total === null ? '' : 'ms', G('total', s.gTotal), [['rede ', null], [fmtMs(s.lat.rtt), G('rtt', s.gRtt)]]);
  drawSparkline(els.spark, status.intervals, {count: 240, T: s.T, dim: !on});
  setT(els.sparkT, fmt(s.T, 1) + ' ms');
  const parts = [];
  setA(els.meta, 'data-idle', !on && status.mode !== 'error' || null);
  if (status.mode === 'error') parts.push(['Erro: ' + (status.error || 'falha no tratamento'), 'bad']);
  else if (!on) { parts.push(['Sem quadros recentes do tratamento. Selecione WebGL2 durante o jogo para filtrar a imagem.', 'lab']); netParts(s, parts); if (parts[1]) parts.splice(1, 1); }
  else {
   const r = parseRes();
   if (r) parts.push([r.h + 'p', s.net?.height ? G('height', s.gHeight) : null], [' → ', 'dim'], [r.oh + 'p', null]);
   netParts(s, parts);
  }
  setParts(els.meta, parts);
 }
 const adaptiveApplying = () => settings.adaptive && settings.mode === 'filtered' && !!status.adaptive;
 function clock() { if (!els.measureAt) return ''; const t = Math.floor((Date.now() - els.measureAt) / 1000); return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); }
 function updateSummaries(s) {
  const [s1, s2, s3, s4, s5] = sections;
  const fl = valueOf('fluidity'), p = s.p;
  const fParts = [[FLU[fl] || '', null]];
  if (s.on && p) { fParts.push([' · ±' + fmt(p.deviationMs, 1) + ' ms', null]); if (p.hitches > 0) fParts.push([` · ${p.hitches} trav.`, null]); }
  setParts(s1.sum, fParts); setA(s1.sum, 'data-g', s.on && p ? worst(G('dev', s.gDev), G('hit', s.gHit)) : null);
  const preset = api.presets[api.preset()];
  if (settings.mode !== 'filtered') { setParts(s2.sum, [['Comparando: ' + (settings.mode === 'cas' ? 'Só nitidez' : 'Original'), null]]); setA(s2.sum, 'data-g', 'ok'); }
  else { setParts(s2.sum, [[(preset ? preset.label : 'Personalizado') + ' · Nitidez ' + fmt(settings.sharpness, 1) + (settings.scaler === 'sgsr' ? ' · SGSR' : ''), null]]); setA(s2.sum, 'data-g', null); }
  const active = TREAT.filter(k => settings[k] > 0).length;
  setParts(s3.sum, [[`${active} de 7 ativos` + (adaptiveApplying() ? ' · adaptado' : ''), null]]);
  setParts(s4.sum, [['GPU ', null], [s.gpuShow === null ? '—' : (s.gpu === null ? '≈' : '') + fmtMs(s.gpuShow) + ' ms', G(s.gpu !== null ? 'gpu' : 'gpu-est', s.gGpuShow)], [' · Lat. ', null], [s.lat.total === null ? '—' : fmtInt(s.lat.total) + ' ms', G('total', s.gTotal)]]);
  if (api.measuring) { setParts(s5.sum, [['Medindo ' + (clock() || '…'), null]]); setA(s5.sum, 'data-g', 'ok'); }
  else if (api.diagnostic) { setParts(s5.sum, [['Diagnóstico ligado', null]]); setA(s5.sum, 'data-g', 'info'); }
  else { setParts(s5.sum, [['Indicadores: ' + ({off: 'desligados', compact: 'Compacto', full: 'Completo'}[settings.hud] || ''), null]]); setA(s5.sum, 'data-g', null); }
 }
 function updateFluidez(s) {
  const fl = valueOf('fluidity'), cap = s.cap, n = s.net;
  if (fl === 'off') setParts(els.captureOut, []);
  else if (cap.active) setParts(els.captureOut, [['Captura direta · ' + fmtThousands(cap.frames) + ' quadros', 'good']]);
  else if (valueOf('capture') === 'direct' && cap.reason) setParts(els.captureOut, [[cap.reason, /encerrado/i.test(cap.reason) ? 'lab' : 'ok']]);
  else if (valueOf('capture') === 'direct') setParts(els.captureOut, [['Captura direta: aguardando o vídeo', 'lab']]);
  else setParts(els.captureOut, [['Captura pelo vídeo', 'lab']]);
  setA(els.captureOut, 'data-hide', fl === 'off' || null);
  const sm = status.smoothing, req = sm ? sm.requestedMs : settings.smoothing;
  setParts(els.smoothOut, [['Buffer: ' + (req ? 'alvo ' + req + ' ms' + (sm && SMOOTH_STATE[sm.state] ? ' (' + SMOOTH_STATE[sm.state] + ')' : '') : 'automático') + ' · medido ', 'lab'],
   [n && num(n.bufferMs) ? fmtMs(n.bufferMs) + ' ms' : '—', G('buf', s.gBuf)]]);
  if (els.refresh) {
   const R = refreshNow(), parts = [[R > 0 ? `Fixada em ${R} Hz pelo app` : 'O sistema decide a taxa', 'lab']];
   if (R > 0 && R % s.N) parts.push([` · não é múltiplo de ${s.N} FPS`, 'ok']);
   setParts(els.refreshOut, parts);
   if (!els.refresh.row.contains(doc.activeElement)) els.refresh.sync();
  }
  const o = s.o, cellSet = (c, st, sub, key, g) => { setT(c.v, st ? '±' + fmt(st.deviationMs, 1) : '—'); setA(c.v, 'data-g', st ? G(key, g) : 'none'); setT(c.sub, sub); };
  cellSet(els.pipe.srv, o?.server, o?.server ? fmt(o.server.meanMs, 1) + ' ms' : '—', 'srv', s.gSrv);
  cellSet(els.pipe.arr, o?.arrival, o?.arrival ? fmt(o.arrival.meanMs, 1) + ' ms' : '—', 'arr', s.gArr);
  cellSet(els.pipe.scr, s.p, s.p ? 'p95 ' + fmtMs(s.p.p95Ms) : '—', 'dev', s.gDev);
  const p = s.p, pacing = [['Travadas ', 'lab'], [p ? String(p.hitches) : '—', p ? G('hit', s.gHit) : 'none']];
  if (s.missed === null && s.direct) pacing.push([' · Pulados ', 'lab'], ['0 (captura direta)', 'good']);
  else pacing.push([' · Pulados ', 'lab'], [s.missed === null ? '—' : String(s.missed), G('miss', s.gMiss)], [o && num(o.presented) ? ' de ' + o.presented : '', 'lab']);
  setParts(els.pacingLine, pacing);
  const f = s.fl;
  if (f) {
   const rate = s.dropRate;
   setParts(els.fluLine, [['Espera da Fluidez ', 'lab'], [num(f.extraMs) ? '+' + fmtMs(f.extraMs) + ' ms' : '—', G('wait', s.gWait)], [' · descartados ', 'lab'],
    [num(rate) ? fmtInt(rate) + '/min' : '—', G('drops', grade('drops', rate))]]);
  } else setParts(els.fluLine, []);
  setA(els.fluLine, 'data-hide', f ? null : '');
 }
 function updateNitidez(s) {
  setParts(els.outputOut, [[status.resolution || '—', null], [num(status.display) && status.display > 0 ? ' · vídeo na tela ' + status.display + 'p' : '', 'lab']]);
  setA(els.outputOut, 'data-hide', s.on && status.resolution ? null : '');
  const a = status.adaptive;
  if (!valueOf('adaptive')) { setParts(els.adaptiveOut, [['Desligado: usa os valores do Ajuste fino.', 'lab']]); setA(els.qpPos, 'data-hide', ''); return; }
  if (settings.mode !== 'filtered') setParts(els.adaptiveOut, [['Pausado durante a Comparação.', 'ok']]);
  else if (!a) setParts(els.adaptiveOut, [[status.net && num(status.net.bitrateMbps) && !num(status.net.qp) ? 'Este aparelho não informa o QP: estimando pela taxa de bits…' : 'Aguardando o QP do stream…', 'lab']]);
  else {
   const k = a.scales || {}, scales = [' → limpeza ×' + fmt(k.cleanup, 2) + ' · degradês ×' + fmt(k.deband, 2) + ' · detalhe ×' + fmt(k.detail, 2), 'lab'];
   if (a.source === 'bitrate') setParts(els.adaptiveOut, [['Estimado pela taxa de bits (sem QP neste aparelho): ', 'lab'], [fmt(a.bitsPerPixel, 2) + ' bit/pixel', null], [' ≈ QP ', 'lab'], [fmtInt(a.qpEstimate), G('qp', grade('qp', a.qpEstimate))], [' · nível ', 'lab'], [fmt(a.level, 1), null], scales]);
   else setParts(els.adaptiveOut, [['QP ', 'lab'], [fmtInt(a.qp), G('qp-now', grade('qp', a.qp))], [' · médio ', 'lab'], [fmt(a.qpMean, 1), G('qp', s.gQp)], [' · nível ', 'lab'], [fmt(a.level, 1), null], scales]);
  }
  const pos = a && num(a.qpMean) ? a.qpMean : a && num(a.qpEstimate) ? a.qpEstimate : null;
  if (pos !== null) { setA(els.qpPos, 'data-hide', null); setS(els.qpPos, 'transform', `translateX(${(Math.min(1, Math.max(0, (pos - 20) / 16)) * 100).toFixed(1)}%)`); }
  else setA(els.qpPos, 'data-hide', '');
 }
 function updateAjuste() {
  const applying = adaptiveApplying(), k = status.adaptive?.scales || {};
  for (const key of ['cleanup', 'deband', 'detail']) {
   const c = els.treat[key];
   if (applying && num(k[key])) {
    const eff = Math.min(1, settings[key] * k[key]);
    const same = Math.round(eff * 100) === Math.round(settings[key] * 100);
    setT(c.v2, '→ ' + Math.round(eff * 100) + '%'); setA(c.v2, 'data-hide', same ? '' : null);
    setS(c.ghost, '--nf', eff.toFixed(3)); setA(c.ghost, 'data-hide', same ? '' : null);
   } else { setA(c.v2, 'data-hide', ''); setA(c.ghost, 'data-hide', ''); }
  }
 }
 function updateDesempenho(s) {
  const L = settings.gpuBudget || 10, gpuG = G('gpu', s.gGpu);
  if (status.measurement === 'cadence' && s.on && s.gpuEst !== null) {
   // Fence estimate against the frame interval (33 ms at 30 FPS): an upper bound, it includes queued work.
   const T = 1000 / s.N, scaleMax = Math.max(2 * T, s.gpuEst), g = G('gpu-est', s.gGpuEst);
   setA(els.gpuMeter, 'data-hide', null);
   setT(els.gpuText, `≈${fmtMs(s.gpuEst)} ms de ${fmtInt(T)} ms por quadro`); setA(els.gpuText, 'data-g', g);
   setS(els.gpuFill, 'transform', `scaleX(${(s.gpuEst / scaleMax).toFixed(3)})`); setA(els.gpuFill, 'data-g', g);
   setS(els.gpuTick, 'transform', `translateX(${(T / scaleMax * 100).toFixed(1)}%)`);
   setT(els.gpuNote, 'Estimado (sem cronômetro de GPU neste navegador): até a GPU concluir o quadro, com a fila. A redução automática segue a cadência.'); setA(els.gpuNote, 'data-hide', null);
  } else if (status.measurement === 'cadence' && s.on) {
   setT(els.gpuText, '—'); setA(els.gpuText, 'data-g', 'none'); setS(els.gpuFill, 'transform', 'scaleX(0)'); setA(els.gpuMeter, 'data-hide', '');
   setT(els.gpuNote, 'Sem cronômetro de GPU neste navegador: adapta pela cadência.'); setA(els.gpuNote, 'data-hide', null);
  } else {
   const p95 = s.gpu, scaleMax = Math.max(2 * L, p95 || 0);
   setA(els.gpuMeter, 'data-hide', null);
   setT(els.gpuText, p95 === null ? '—' : `${fmtMs(p95)} ms de ${L} ms`); setA(els.gpuText, 'data-g', p95 === null ? 'none' : gpuG);
   setS(els.gpuFill, 'transform', `scaleX(${p95 === null ? 0 : (p95 / scaleMax).toFixed(3)})`); setA(els.gpuFill, 'data-g', gpuG);
   setS(els.gpuTick, 'transform', `translateX(${(L / scaleMax * 100).toFixed(1)}%)`);
   setA(els.gpuNote, 'data-hide', '');
  }
  setParts(els.adaptation, status.adaptation && s.on ? [['↓ ' + status.adaptation, 'ok']] : [['Nenhuma redução automática', 'dim']]);
  const lat = s.lat, flOn = valueOf('fluidity') !== 'off', segs = [lat.rtt, lat.buffer, lat.decode, lat.gpu, flOn ? lat.wait : 0];
  [...els.latBar.children].forEach((sp, i) => setS(sp, 'flex-grow', String(num(segs[i]) ? Math.max(0, +segs[i].toFixed(1)) : 0)));
  setT(els.latTotal, lat.total === null ? '—' : '≈' + fmtInt(lat.total) + ' ms'); setA(els.latTotal, 'data-g', G('total', s.gTotal));
  const legend = [[lat.rtt, 'rtt', s.gRtt], [lat.buffer, 'buf', s.gBuf], [lat.decode, 'dec', s.gDec], [s.gpu !== null ? s.gpu : s.gpuEst !== null ? lat.gpu : null, s.gpu !== null ? 'gpu' : 'gpu-est', s.gGpuShow], [s.fl ? s.fl.extraMs : null, 'wait', s.gWait]];
  legend.forEach(([v, key, g], i) => { setT(els.leg[i].v, num(v) ? fmtMs(v) + ' ms' : '—'); setA(els.leg[i].v, 'data-g', num(v) ? G(key, g) : 'none'); });
  setA(els.leg[4].row, 'data-hide', flOn ? null : '');
  const n = s.net;
  if (!n) { setParts(els.stream, [['Sem estatísticas do stream (abra um jogo).', 'lab']]); for (const el of [els.decoder, els.quality, els.drops]) setParts(el, []); return; }
  setParts(els.stream, [['Vídeo recebido ', 'lab'], [n.width && n.height ? n.width + '×' + n.height : '—', n.height ? G('height', s.gHeight) : 'none'], [' · ' + fmtInt(n.fpsReceived) + ' FPS · ' + (n.codec || '—'), null]]);
  setParts(els.decoder, [['Decodificação ', 'lab'], [{hardware: 'hardware', software: 'software (CPU)'}[n.decoder] || 'não informada', G('dec-kind', s.gDecoder)],
   [(n.implementation ? ' (' + n.implementation + ')' : '') + ' · ', null], [fmtMs(n.decodeMs) + ' ms', G('dec', s.gDec)]]);
  setParts(els.quality, [['Bitrate ', 'lab'], [num(n.bitrateMbps) ? fmt(n.bitrateMbps, 1) + ' Mb/s' : '—', G('bitrate', s.gBitrate)], [' · perda ', 'lab'], [num(n.lossPct) ? fmt(n.lossPct, 1) + '%' : '—', G('loss', s.gLoss)],
   ...(s.qpEst !== null ? [[' · QP ', 'lab'], ['≈' + fmtInt(s.qpEst) + ' (pela taxa de bits)', G('qp', grade('qp', s.qpEst))]] : [[' · QP ', 'lab'], [fmtInt(s.qp), G('qp', s.gQp)]])]);
  setParts(els.drops, [['Decodificador (1 s): ', 'lab'], [fmtInt(n.framesDropped) + ' descartados', n.framesDropped > 0 ? 'ok' : null], [' · ', 'lab'], [fmtInt(n.freezes) + ' congelamentos', n.freezes > 0 ? 'ok' : null]]);
 }
 function updateMeasure() {
  setT(els.measureStart._label, api.measuring ? 'Reiniciar medição' : 'Iniciar medição');
  setParts(els.measureLine, [[api.measuring ? 'Medindo · ' + (clock() || '…') : els.measureMsg || 'Pronta', api.measuring ? 'ok' : 'lab']]);
 }

 /* ------------------------------ Android refresh rate ------------------------------ */
 const refreshNow = () => { try { return Number(window.BxAndroid?.getRefreshRate?.()) || 0; } catch { return 0; } };
 const refreshRates = () => { try { return JSON.parse(window.BxAndroid.getRefreshRates()).map(Number).filter(v => v > 0); } catch { return []; } };
 // Added lazily after Suavidade on the first tick that sees the app bridge.
 function ensureRefreshRow() {
  if (els.refresh || !window.BxAndroid?.getRefreshRates) return;
  const values = [0, ...refreshRates()], cur = refreshNow();
  if (!values.includes(cur)) values.push(cur);
  let last = cur;
  els.refresh = choice({key: 'refreshRate', label: 'Taxa da tela', tag: 'APP', opts: values.map(v => [v, v ? v + ' Hz' : 'Sistema']), get: refreshNow,
   set: v => { if (v === last) return; last = v; try { window.BxAndroid.setRefreshRate(v); } catch {} verdict.dirty = true; },
   hint: () => '60 ou 120 Hz são múltiplos de 30/60 FPS e evitam tremulação; 90 Hz desalinha o ritmo.'});
  els.refreshOut = out('refresh'); els.refresh.row.append(els.refreshOut);
  els.smooth.row.after(els.refresh.row);
 }

 /* ------------------------------ verdict (section 01) ------------------------------ */
 const verdict = {shown: null, cand: null, action: null, dirty: true};
 function evaluate(s) {
  const fl = valueOf('fluidity'), act = (label, fn) => ({label, fn});
  const turnOn = act('Ligar Fluidez', e => commit('fluidity', 'balanced', e));
  if (!s.p) return {text: 'Sem dados de ritmo ainda.', g: 'none'};
  const D = s.gDev, S = s.gSrv, Ar = s.gArr, arBad = Ar === 'ok' || Ar === 'bad', dBad = D === 'ok' || D === 'bad', N = s.N;
  if (s.missed !== null && s.missed >= 3) {
   if (fl !== 'off' && valueOf('capture') === 'video' && api.directSupported()) return {text: 'Quadros pulados antes do tratamento: a captura direta evita isso.', g: 'bad', a: act('Usar captura direta', e => commit('capture', 'direct', e))};
   if (fl === 'off') return {text: 'Quadros pulados antes do tratamento: a Fluidez com captura direta evita isso.', g: 'bad', a: turnOn};
   return {text: 'Quadros pulados: a GPU está sem folga. Reduza a Resolução de saída ou o limite da GPU.', g: 'bad'};
  }
  // Frames dropped by the pacer are skipped content even when the interval on screen looks steady.
  if (fl !== 'off' && grade('drops', s.dropRate) === 'bad') {
   const a = valueOf('capture') === 'video' && api.directSupported() ? act('Usar captura direta', e => commit('capture', 'direct', e)) : fl === 'max' ? act('Usar Equilibrada', e => commit('fluidity', 'balanced', e)) : null;
   return {text: `A Fluidez está descartando quadros (${fmtInt(s.dropRate)}/min): eles chegam juntos demais.`, g: 'ok', a};
  }
  if (D === 'good' && s.p.hitches === 0) return {text: 'Ritmo estável.' + (arBad && fl !== 'off' ? ' A Fluidez está compensando a rede.' : ''), g: 'good'};
  const R = refreshNow();
  if (R > 0 && R % N) {
   const to = refreshRates().includes(120) ? 120 : 60;
   return {text: `Tela em ${R} Hz não é múltiplo de ${N} FPS: use 60 ou 120 Hz.`, g: 'ok', a: act(`Usar ${to} Hz`, () => { try { window.BxAndroid.setRefreshRate(to); } catch {} })};
  }
  if (S === 'bad') return {text: 'O jogo/servidor está irregular. A Fluidez Máxima uniformiza (com mais espera).', g: 'ok', a: fl !== 'max' ? act('Usar Máxima', e => commit('fluidity', 'max', e)) : null};
  if (arBad && dBad && fl === 'off') return {text: 'A rede está oscilando. A Fluidez Equilibrada corrige.', g: 'ok', a: turnOn};
  if (arBad && fl !== 'off' && settings.smoothing === 0 && s.p.hitches >= 1) return {text: 'Chegada irregular mesmo com a Fluidez: mais buffer ajuda.', g: 'ok', a: act('Suavidade 33 ms', e => commit('smoothing', 33, e))};
  if (fl !== 'off' && s.fl && num(s.fl.extraMs) && s.fl.extraMs > s.T)
   return {text: `Espera alta (+${fmtMs(s.fl.extraMs)} ms).` + (fl === 'max' ? ' A Equilibrada espera menos.' : ''), g: 'ok', a: fl === 'max' ? act('Usar Equilibrada', e => commit('fluidity', 'balanced', e)) : null};
  if (dBad && Ar === 'good') {
   if (fl === 'off') return {text: 'Oscilação no aparelho/tela. Ative a Fluidez.', g: 'ok', a: turnOn};
   return {text: 'Oscilação no aparelho/tela.' + (window.BxAndroid ? ' Fixe a tela em 60/120 Hz.' : ' Confira se a TV está em 60 Hz.'), g: 'ok'};
  }
  return {text: 'Ritmo oscilando.', g: 'ok'};
 }
 // New verdicts commit after 2 identical evaluations 2 s apart; settings changes re-evaluate at once.
 function updateVerdict(s, force) {
  const r = evaluate(s), key = r.text + '|' + (r.a ? r.a.label : '');
  if (!force && verdict.shown !== null && key !== verdict.shown && verdict.cand !== key) { verdict.cand = key; return; }
  verdict.cand = null;
  if (verdict.shown === key) return;
  const b = els.verdictBtn;
  // Keep a focused suggestion until focus leaves it (focusout marks the verdict dirty).
  if (doc.activeElement === b && !r.a) return;
  verdict.shown = key;
  setT(els.verdictTx, r.text); setA(els.verdict, 'data-g', r.g);
  verdict.action = r.a ? e => { cancelPending(); r.a.fn(e); syncAll(); verdict.dirty = true; } : null;
  if (r.a) { setT(b._label, r.a.label); b.tabIndex = 0; setA(b, 'data-off', null); }
  else whenUnfocused(b, () => { b.tabIndex = -1; setA(b, 'data-off', true); });
 }

 /* ------------------------------ native row, sticky, canvas, tier ------------------------------ */
 function muteNative() {
  try {
   const row = root?.parentElement && [...root.parentElement.children].find(e => e.prefKey === 'video.processing.sharpness');
   row?.classList.toggle('bxif-native-muted', api.nativePref('video.player.type') === 'webgl2');
  } catch {}
 }
 function readSticky() {
  try {
   // The sticky game selector, plus its tips line when Better xCloud shows it (per-game profile).
   const sel = els.sticky = (root.closest('.bx-settings-tab-contents') || doc).querySelector('.bx-stream-settings-selection:not(.bx-gone)');
   const tips = sel?.querySelector(':scope > p:not(.bx-gone)');
   root.style.setProperty('--bxif-sticky', (sel ? sel.offsetHeight + (tips ? tips.offsetHeight : 0) + 8 : 0) + 'px');
  } catch {}
 }
 const MQ = {phone: '(max-height:500px)', couch: '(min-height:900px)'};
 let mqs = null;
 function tierNow() { try { return matchMedia(MQ.phone).matches ? 'phone' : matchMedia(MQ.couch).matches ? 'couch' : 'regular'; } catch { return 'regular'; } }
 function watchTier() {
  if (mqs) return;
  const on = () => { if (root) root.dataset.tier = tierNow(); resizeSpark(); };
  try { mqs = [matchMedia(MQ.phone), matchMedia(MQ.couch)]; for (const m of mqs) m.addEventListener('change', on); } catch { mqs = []; }
  watchDpr(resizeSpark);
 }
 let sparkSize = null, ro = null;
 function resizeSpark() {
  if (!sparkSize || !els.spark) return;
  sizeCanvas(els.spark, sparkSize.w, sparkSize.h);
  if (lastSnap) drawSparkline(els.spark, status.intervals, {count: 240, T: lastSnap.T, dim: !lastSnap.on});
 }
 function watchSpark() {
  if (ro || typeof ResizeObserver !== 'function') return;
  ro = new ResizeObserver(entries => {
   const r = entries[entries.length - 1].contentRect;
   if (!r.width || !r.height) return;
   sparkSize = {w: r.width, h: r.height}; resizeSpark();
  });
  ro.observe(els.spark);
 }

 /* ------------------------------ lifecycle ------------------------------ */
 let timer = 0, visible = false, tickN = 0, io = null;
 function refresh() {
  tickN++;
  G.tick();
  runDeferred(doc.activeElement);
  const s = lastSnap = snapshot();
  s.dropRate = drops.push(s.fl ? s.fl.dropped : null);
  if (tickN % 4 === 0 && sigOf() !== lastSig) syncAll(true);
  ensureRefreshRow(); muteNative();
  updateHeader(); updateWarnings(); updateLive(s); updateSummaries(s);
  if (tickN % 4 === 1 || verdict.dirty) { updateVerdict(s, verdict.dirty || verdict.shown === null); verdict.dirty = false; }
  for (const sec of sections) if (sec.open && sec.update) sec.update(s);
 }
 // 2 Hz while the panel is on screen; nothing runs while it is scrolled away, hidden or removed.
 function loop() {
  timer = 0;
  if (!visible) return;
  if (!root.isConnected) { stop(); return; }
  timer = setTimeout(loop, 500);
  try { refresh(); } catch (error) { console.warn('[BxImageFilter panel]', error); }
 }
 function start() {
  if (visible) return;
  visible = true; api.panelOpen = true;
  readSticky(); watchSpark();
  loop();
 }
 function stop() {
  visible = false; api.panelOpen = false;
  clearTimeout(timer); timer = 0;
  for (const k of [...pending.keys()]) flush(k);
  for (const b of flashes) { clearTimeout(b._flash); b._flash = 0; }
  flashes.clear();
  if (els.copy) setT(els.copy._label, 'Copiar configuração');
  if (resetTimer) disarm(); else if (els.reset) setT(els.reset._label, 'Restaurar tratamento');
  ro?.disconnect(); ro = null;
 }
 function observe() {
  io?.disconnect();
  if (typeof IntersectionObserver !== 'function') { start(); return; }
  io = new IntersectionObserver(entries => {
   const e = entries[entries.length - 1];
   if (e.isIntersecting && root.isConnected) start(); else stop();
  });
  io.observe(root);
 }
 // Input method: the focus ring only for keyboard/gamepad (Better xCloud sets html[data-active-input]).
 let watching = false, lastPointer = -1e9;
 function watchInput() {
  if (watching) return;
  watching = true;
  window.addEventListener('pointerdown', () => { lastPointer = performance.now(); setNav('0'); }, {capture: true, passive: true});
  window.addEventListener('keydown', () => setNav('1'), true);
  try { new MutationObserver(() => setNav('1')).observe(doc.documentElement, {attributes: true, attributeFilter: ['data-active-input']}); } catch {}
  window.addEventListener('pagehide', () => { stop(); io?.disconnect(); io = null; });
  window.addEventListener('pageshow', e => { if (e.persisted && root?.isConnected) observe(); });
 }
 // Called by Better xCloud each time it renders the Display tab (also after it rebuilds the menu).
 function mount(parent) {
  ensureStyle('panel', CSS);
  if (!root) { root = build(); syncAll(); }
  const anchor = [...parent.children].find(e => e.prefKey === 'video.player.type');
  const h2 = anchor ? null : [...parent.querySelectorAll(':scope > h2')].pop();
  if (anchor) anchor.after(root); else if (h2) h2.after(root); else parent.append(root);
  nav = doc.documentElement.hasAttribute('data-active-input') ? '1' : '0'; root.dataset.nav = nav;
  root.dataset.tier = tierNow();
  watchInput(); watchTier();
  stop(); syncAll();
  observe();
  requestAnimationFrame(muteNative);
 }
 // timers(): timers this panel holds right now (the harness checks it drops to 0 after removal).
 api.panel = {mount, timers: () => (timer ? 1 : 0) + pending.size + flashes.size + (resetTimer ? 1 : 0)};
})();

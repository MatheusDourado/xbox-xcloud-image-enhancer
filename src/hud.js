// In-game HUD: small translucent indicators over the game while playing. Reads window.BxImageFilter
// through api.ui (panel.js); never focusable, never takes pointer events, updates at 2 Hz, and with
// settings.hud 'off' nothing exists and no timer runs.
(() => {
 const api = window.BxImageFilter, settings = api.settings, status = api.status, doc = document, ui = api.ui;
 if (!ui) { api.hud = {update() {}, timers: () => 0}; return; }
 const {fmt, fmtMs, fmtInt, grade, createHysteresis, dropRate, drawSparkline, sizeCanvas, stateWord, snapshot, ensureStyle, LEVEL} = ui;
 const CSS = `
.bxif-hud{--s:1;--bxif-ixl:max(16px,2.5vw);--bxif-ixr:max(16px,2.5vw);--bxif-iyt:max(16px,2.5vh);--bxif-iyb:max(16px,2.5vh);
 --hg-good:#4fe0d2;--hg-ok:#ffd666;--hg-bad:#ff7b86;--hg-info:#8fb6ff;--hg-none:#9aa0aa;--hl:#b3b9c3;
 position:fixed;z-index:1900;display:none;box-sizing:border-box;margin:0;pointer-events:none;user-select:none;-webkit-user-select:none;
 contain:layout paint style;will-change:transform;
 padding:calc(4px*var(--s)) calc(7px*var(--s));border-radius:calc(6px*var(--s));
 background:rgba(10,11,13,.8);border:1px solid rgba(255,255,255,.08);color:#f3f5f8;text-shadow:0 1px 1px rgba(0,0,0,.7);
 font:400 calc(11.5px*var(--s))/1 Bahnschrift,"Roboto Condensed","sans-serif-condensed","Arial Narrow",sans-serif;font-stretch:87.5%;
 font-variant-numeric:tabular-nums lining-nums;letter-spacing:normal;text-align:left;text-transform:none;white-space:nowrap}
.bxif-hud *{box-sizing:border-box}
@media (min-height:640px){.bxif-hud{--s:1.35}}
@media (min-height:1000px){.bxif-hud{--s:1.6}}
@media (max-height:500px){.bxif-hud{--bxif-ixl:max(8px,env(safe-area-inset-left));--bxif-ixr:max(8px,env(safe-area-inset-right));--bxif-iyt:max(8px,env(safe-area-inset-top));--bxif-iyb:max(8px,env(safe-area-inset-bottom))}}
.bxif-hud[data-show]{display:block;animation:bxif-hud-in .15s ease-out}
/* Overall state on the frame, apart from the FPS mark. */
.bxif-hud[data-overall=ok]{border-color:rgba(255,214,102,.55)}.bxif-hud[data-overall=bad]{border-color:rgba(255,123,134,.7)}
.bxif-hud[data-calm]{opacity:.6;transition:opacity .3s}
.bxif-hud[data-hiding]{opacity:0;transition:opacity .15s}
@keyframes bxif-hud-in{from{opacity:0}}
.bxif-hud[data-pos$=left]{left:calc(var(--bxif-ixl) + var(--bxif-gx,0px))}
.bxif-hud[data-pos$=right]{right:calc(var(--bxif-ixr) + var(--bxif-gx,0px))}
.bxif-hud[data-pos^=top]{top:max(var(--bxif-iyt),var(--bxif-top,0px))}
.bxif-hud[data-pos^=bottom]{bottom:var(--bxif-iyb)}
.bxif-hud [data-off]{display:none!important}
.bxif-hud [data-g=ok]{color:var(--hg-ok)}.bxif-hud [data-g=bad]{color:var(--hg-bad)}.bxif-hud [data-g=info]{color:var(--hg-info)}.bxif-hud [data-g=none]{color:var(--hg-none)}
.bxif-h-dot{flex:none;display:inline-block;width:calc(7px*var(--s));height:calc(7px*var(--s));border-radius:50%;background:var(--hg-none)}
.bxif-h-dot[data-g=good]{background:var(--hg-good)}.bxif-h-dot[data-g=ok]{background:var(--hg-ok);border-radius:1px;transform:rotate(45deg) scale(.82)}
.bxif-h-dot[data-g=bad]{background:var(--hg-bad);width:calc(8px*var(--s));border-radius:0;clip-path:polygon(50% 0,100% 100%,0 100%)}
.bxif-h-dot[data-g=info]{background:none;box-shadow:inset 0 0 0 calc(1.75px*var(--s)) var(--hg-info)}
.bxif-h-dot[data-g=none]{background:none;box-shadow:inset 0 0 0 calc(1.25px*var(--s)) var(--hg-none)}
.bxif-h-k{font-size:calc(9.5px*var(--s));font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--hl)}
.bxif-h-v{font-weight:600}
.bxif-h-s{font-size:calc(10.5px*var(--s));font-weight:500;color:var(--hl)}
.bxif-h-fps{font-size:calc(15px*var(--s));font-weight:700;min-width:3ch;text-align:right;letter-spacing:-.01em}
.bxif-h-tag{font-size:calc(9.5px*var(--s));font-weight:700;letter-spacing:.06em;line-height:1;padding:calc(1.5px*var(--s)) calc(3px*var(--s)) calc(1px*var(--s));border:1px solid currentColor;border-radius:calc(3px*var(--s))}
.bxif-h-badge{flex:none;display:inline-block;min-width:calc(14px*var(--s));height:calc(14px*var(--s));padding:0 calc(3px*var(--s));border-radius:calc(4px*var(--s));
 font-size:calc(10px*var(--s));font-weight:800;line-height:calc(14px*var(--s));text-align:center;text-shadow:none;color:#101114!important;background:var(--hg-ok)}
.bxif-h-badge[data-g=bad]{background:var(--hg-bad)}.bxif-h-badge[data-g=info]{background:var(--hg-info)}
.bxif-h-spark{display:block;flex:none}
.bxif-h-chip{display:inline-block;font-size:calc(10px*var(--s));font-weight:700;letter-spacing:.04em;line-height:1;padding:calc(2px*var(--s)) calc(4px*var(--s));border-radius:calc(3px*var(--s));background:rgba(255,123,134,.16);color:var(--hg-bad)}
/* card (compact) */
.bxif-h-l1,.bxif-h-l2,.bxif-h-l3{display:flex;align-items:center;gap:calc(5px*var(--s))}
.bxif-h-l1{height:calc(18px*var(--s))}
.bxif-h-l1>.bxif-h-k{margin-left:calc(-2px*var(--s))}
.bxif-h-l1>.bxif-h-spark{width:calc(56px*var(--s));height:calc(12px*var(--s));margin:0 0 0 auto;padding-left:calc(3px*var(--s))}
.bxif-h-l2{height:calc(14px*var(--s));gap:calc(3px*var(--s))}
.bxif-h-l2>.bxif-h-v{text-align:right;margin-right:calc(4px*var(--s))}.bxif-h-l2>.bxif-h-v:last-child{margin-right:0}
.bxif-h-l3{height:calc(17px*var(--s));padding-top:calc(3px*var(--s));gap:calc(4px*var(--s))}
/* lateral (compact inside the letterbox bar) */
.bxif-hud[data-layout=lateral]{width:var(--bxif-w,68px);padding:calc(6px*var(--s)) calc(4px*var(--s));background:rgba(10,11,13,.55);text-align:center}
.bxif-h-col .bxif-h-s{font-size:calc(9.5px*var(--s))}
.bxif-hud[data-layout=lateral][data-pos$=left]{left:var(--bxif-lx,4px)}
.bxif-hud[data-layout=lateral][data-pos$=right]{right:var(--bxif-lx,4px)}
.bxif-hud[data-layout=lateral][data-pos^=top]{top:max(8px,env(safe-area-inset-top),var(--bxif-top,0px))}
.bxif-hud[data-layout=lateral][data-pos^=bottom]{bottom:max(8px,env(safe-area-inset-bottom),var(--bxif-gy,0px))}
.bxif-h-col{display:flex;flex-direction:column;align-items:center;gap:calc(2px*var(--s))}
.bxif-h-col>div{display:flex;align-items:center;justify-content:center;gap:calc(4px*var(--s))}
.bxif-h-col .bxif-h-fps{min-width:0}
.bxif-h-col>.bxif-h-spark{height:calc(12px*var(--s));margin:calc(3px*var(--s)) 0}
.bxif-h-col>.bxif-h-cap{margin-top:calc(3px*var(--s))}
/* full */
.bxif-hud[data-layout=full]{width:calc(236px*var(--s));padding:calc(6px*var(--s)) calc(8px*var(--s)) calc(4px*var(--s))}
.bxif-h-head{display:flex;align-items:center;gap:calc(5px*var(--s));height:calc(18px*var(--s))}
.bxif-h-word{flex:1;min-width:0;overflow:hidden;font-size:calc(9.5px*var(--s));font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--hg-good)}
.bxif-h-big{font-size:calc(16px*var(--s));font-weight:700;min-width:3ch;text-align:right}
.bxif-hud[data-layout=full] .bxif-h-spark{width:calc(220px*var(--s));height:calc(24px*var(--s));margin:calc(3px*var(--s)) 0 calc(4px*var(--s))}
.bxif-h-grp{border-top:1px solid rgba(255,255,255,.10);padding:calc(2px*var(--s)) 0}
.bxif-h-row{display:flex;align-items:center;height:calc(14px*var(--s));min-width:0}
.bxif-h-row>.bxif-h-k{flex:none;width:calc(62px*var(--s))}
.bxif-h-val{display:block;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}
.bxif-h-bar{flex:none;display:flex;gap:1px;width:calc(72px*var(--s));height:calc(5px*var(--s));margin-left:auto;border-radius:1px;overflow:hidden;background:rgba(255,255,255,.08)}
.bxif-h-bar>i{flex:0 1 0;min-width:0}
.bxif-h-bar>i:nth-child(1){background:#d7dbe2}.bxif-h-bar>i:nth-child(2){background:#a9afba}.bxif-h-bar>i:nth-child(3){background:#7c8391}.bxif-h-bar>i:nth-child(4){background:#565c68}
.bxif-h-bar>i:nth-child(5){background:repeating-linear-gradient(45deg,#a9afba 0 2px,transparent 2px 4px)}
.bxif-h-leg{display:block;height:calc(13px*var(--s));line-height:calc(13px*var(--s));padding-left:calc(62px*var(--s));font-size:calc(10px*var(--s));overflow:hidden}
.bxif-h-warn{display:flex;align-items:center;gap:calc(5px*var(--s));height:calc(17px*var(--s));min-width:0}
.bxif-h-warn>.bxif-h-val{font-weight:500;font-size:calc(10.5px*var(--s))}
@media (prefers-reduced-motion:reduce){.bxif-hud,.bxif-hud *{transition:none!important;animation:none!important}}
`;
 const STEP = 500, WATCH = 1000, CHIPS = 2;
 const RANK = v => v === 'bad' ? 3 : v === 'ok' ? 2 : v === 'good' || v === 'info' ? 1 : 0;
 const num = v => typeof v === 'number' && Number.isFinite(v);
 // HUD scale (--s) from the same media queries as the CSS.
 const scaleNow = () => { try { return matchMedia('(min-height:1000px)').matches ? 1.6 : matchMedia('(min-height:640px)').matches ? 1.35 : 1; } catch { return 1; } };

 let el = null, f = null, built = '', showing = false, n = 0, calm = 0, s = 1, safe = null, lastNet = null, lastNetAt = 0;
 let watchTimer = 0, loopTimer = 0, fadeTimer = 0, mqs = [], dprOff = null, layoutDirty = true;
 const G = createHysteresis(), drops = dropRate();

 // A field is a span holding one Text node; writes happen only when its text or grade changed.
 // In the HUD good values stay white: only ok/bad/info/none get a color.
 const E = (tag, cls, ...kids) => { const e = doc.createElement(tag); if (cls) e.className = cls; for (const k of kids) e.append(k); return e; };
 function field(cls = 'bxif-h-v', initial = '—') { const t = doc.createTextNode(initial); return {e: E('span', cls, t), t, g: undefined}; }
 const lab = text => E('span', 'bxif-h-k', text), sub = text => E('span', 'bxif-h-s', text);
 function put(x, text, g) {
  if (x.t.data !== text) x.t.data = text;
  const v = g && g !== 'good' ? g : null;
  if (x.g !== v) { x.g = v; if (v) x.e.setAttribute('data-g', v); else x.e.removeAttribute('data-g'); }
 }
 function attr(e, k, v) { const c = e._bxifH || (e._bxifH = {}); if (c[k] === v) return; c[k] = v; if (v === null || v === false || v === undefined) e.removeAttribute(k); else e.setAttribute(k, v === true ? '' : v); }
 function prop(e, k, v) { const c = e._bxifP || (e._bxifP = {}); if (c[k] !== v) { c[k] = v; e.style.setProperty(k, v); } }
 const off = (e, flag) => attr(e, 'data-off', !!flag);
 function dot() { const e = E('i', 'bxif-h-dot'); return {e, set(g) { attr(e, 'data-g', g || 'none'); }}; }
 const minCh = (x, ch) => { x.e.style.display = 'inline-block'; x.e.style.minWidth = ch + 'ch'; return x; };

 function buildCard() {
  const d = dot(), fps = field('bxif-h-fps'), tag = field('bxif-h-tag', ''), badge = field('bxif-h-badge', ''), cv = E('canvas', 'bxif-h-spark');
  off(tag.e, true); off(badge.e, true);
  const rit = minCh(field(), 4), trav = minCh(field(), 2), lat = minCh(field(), 3);
  const chips = [field('bxif-h-chip', ''), field('bxif-h-chip', '')], l3 = E('div', 'bxif-h-l3', chips[0].e, chips[1].e);
  off(l3, true);
  el.append(E('div', 'bxif-h-l1', d.e, fps.e, lab('FPS'), tag.e, cv, badge.e), E('div', 'bxif-h-l2', lab('RIT'), rit.e, lab('TRAV'), trav.e, lab('LAT'), lat.e), l3);
  return {kind: 'card', dot: d, fps, tag, badge, cv, rit, trav, lat, chips, chipEls: chips.map(c => c.e), l3, spark: {count: 60, w: 56, h: 12}};
 }
 function buildLateral(w, full) {
  const d = dot(), fps = field('bxif-h-fps'), tag = field('bxif-h-tag', ''), badge = field('bxif-h-badge', ''), cv = E('canvas', 'bxif-h-spark');
  const rit = field(), trav = field(), lat = field(), chips = [field('bxif-h-chip', ''), field('bxif-h-chip', '')];
  const line = (...kids) => E('div', null, ...kids), cap = text => { const e = line(lab(text)); e.className = 'bxif-h-cap'; return e; };
  const chipRows = chips.map(c => line(c.e)), badgeRow = line(badge.e), tagRow = line(tag.e);
  for (const e of [...chipRows, badgeRow, tagRow]) off(e, true);
  const sw = Math.max(20, w - 12);
  cv.style.width = sw + 'px';
  // Completo on the phone: the same column with every indicator, still inside the black bar.
  let extra = null;
  const rows = [cap('RIT'), line(rit.e)];
  if (full) {
   extra = {p95: field(), desc: field(), wait: field(), br: field(), qp: field(), loss: field()};
   extra.descRows = [cap('DESC/MIN'), line(extra.desc.e)]; extra.waitRows = [cap('ESPERA'), line(extra.wait.e)];
   rows.push(line(sub('p95 '), extra.p95.e), cap('TRAV'), line(trav.e), ...extra.descRows, ...extra.waitRows, cap('LAT'), line(lat.e),
    cap('MB/S'), line(extra.br.e), cap('QP'), line(extra.qp.e), cap('PERDA'), line(extra.loss.e));
  } else rows.push(cap('TRAV'), line(trav.e), cap('LAT'), line(lat.e));
  el.append(E('div', 'bxif-h-col', line(d.e, fps.e), line(lab('FPS')), cv, ...rows, ...chipRows, badgeRow, tagRow));
  return {kind: 'lateral', dot: d, fps, tag, badge, cv, rit, trav, lat, chips, chipEls: chipRows, badgeEl: badgeRow, tagEl: tagRow, extra, spark: {count: 60, w: sw / s, h: full ? 16 : 12}};
 }
 function buildFull() {
  const d = dot(), word = field('bxif-h-word', ''), fps = field('bxif-h-big'), cv = E('canvas', 'bxif-h-spark');
  const dev = field(), devUnit = sub(' ms · p95 '), p95 = field(), hit = field(), missParts = [sub(' · pul '), null], miss = field(), descParts = [sub(' · desc '), null, sub('/min')], desc = field();
  missParts[1] = miss.e; descParts[1] = desc.e;
  const wait = field(), capSep = sub(' · '), cap = field();
  const total = field(), bar = E('span', 'bxif-h-bar', E('i'), E('i'), E('i'), E('i'), E('i'));
  const leg = ['R', 'B', 'D', 'T', 'E'].map((k, i) => ({k: sub((i ? ' · ' : '') + k + ' '), v: field()}));
  const vin = field(), vout = field(), codec = field('bxif-h-s', ''), dec = field();
  const br = field(), qp = field(), loss = field();
  const wbadge = field('bxif-h-badge', ''), wtext = field('bxif-h-val', '');
  const row = (k, ...kids) => E('div', 'bxif-h-row', lab(k), E('span', 'bxif-h-val', ...kids));
  const warn = E('div', 'bxif-h-grp', E('div', 'bxif-h-warn', wbadge.e, wtext.e));
  off(warn, true);
  const legEl = E('div', 'bxif-h-leg'), videoRow = row('Vídeo', vin.e, sub('→'), vout.e, sub(' · '), codec.e, sub(' · '), dec.e);
  // Without a black bar on the phone the card stays short: no latency legend or video row.
  if (s === 1) { off(legEl, true); off(videoRow, true); }
  for (const x of leg) legEl.append(x.k, x.v.e);
  el.append(E('div', 'bxif-h-head', d.e, word.e, fps.e, lab('FPS')), cv,
   E('div', 'bxif-h-grp', row('Ritmo', dev.e, devUnit, p95.e), row('Quadros', sub('trav '), hit.e, ...missParts, ...descParts), row('Fluidez', wait.e, capSep, cap.e)),
   E('div', 'bxif-h-grp', E('div', 'bxif-h-row', lab('Latência'), total.e, bar), legEl),
   E('div', 'bxif-h-grp', videoRow, row('Rede', br.e, sub(' Mb/s · QP '), qp.e, sub(' · perda '), loss.e)),
   warn);
  return {kind: 'full', dot: d, word, fps, cv, dev, p95, hit, miss, missParts, desc, descParts, wait, capSep, cap, total, bar, leg, vin, vout, codec, dec, br, qp, loss, warn, wbadge, wtext,
   spark: {count: 240, w: 220, h: 24}};
 }

 /* ------------------------------ layout and placement ------------------------------ */
 // Safe-area insets (notch/cutout) from a probe, read once and after a resize.
 function readSafe() {
  const p = E('div');
  p.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding-left:env(safe-area-inset-left,0px);padding-right:env(safe-area-inset-right,0px)';
  doc.documentElement.append(p);
  const cs = getComputedStyle(p);
  safe = {left: parseFloat(cs.paddingLeft) || 0, right: parseFloat(cs.paddingRight) || 0};
  p.remove();
 }
 // Compact on the phone moves into the black bar beside a letterboxed video (16:9 or the chosen ratio).
 function lateral() {
  if (settings.hud === 'off' || s !== 1) return null;
  const pref = api.nativePref('video.ratio');
  if (pref === 'fill') return null;
  const m = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(pref || ''), ratio = m ? m[1] / m[2] : 16 / 9;
  if (!safe) readSafe();
  const bar = (window.innerWidth - window.innerHeight * ratio) / 2, inset = String(settings.hudPosition).endsWith('left') ? safe.left : safe.right, usable = bar - inset;
  if (!(usable >= 60)) return null;
  const w = Math.round(Math.min(76, Math.max(56, usable - 8)));
  return {w, x: Math.round(inset + (usable - w) / 2)};
 }
 function sizeSpark() { if (f) sizeCanvas(f.cv, f.spark.w * s, f.spark.h * s); }
 // Rebuilds the inner DOM only when the mode or layout changed.
 function relayout() {
  layoutDirty = false;
  s = scaleNow();
  const lat = lateral(), want = lat ? 'lateral:' + lat.w + ':' + settings.hud : settings.hud === 'full' ? 'full' : 'card';
  attr(el, 'data-mode', settings.hud); attr(el, 'data-pos', settings.hudPosition);
  if (lat) { prop(el, '--bxif-w', lat.w + 'px'); prop(el, '--bxif-lx', lat.x + 'px'); }
  if (want === built) { sizeSpark(); return; }
  built = want; el.textContent = ''; G.reset();
  f = lat ? buildLateral(lat.w, settings.hud === 'full') : want === 'full' ? buildFull() : buildCard();
  attr(el, 'data-layout', f.kind);
  sizeSpark();
 }
 // Every 2 s at the start of a tick, before any write: below Better xCloud's stats bar when they
 // would overlap, and clear of its game bar in a bottom corner.
 function place() {
  const pos = settings.hudPosition, bar = pos.startsWith('top') ? doc.querySelector('.bx-stats-bar:not(.bx-gone)') : null, gb = doc.getElementById('bx-game-bar');
  let top = 0;
  if (bar) { const b = bar.getBoundingClientRect(), me = el.getBoundingClientRect(); if (b.width && b.height && b.left < me.right && b.right > me.left) top = Math.ceil(b.bottom + 4); }
  // The game bar (40×90 at the screen edge) sits in the letterbox bar too: the lateral column goes above it.
  const clash = gb && gb.getAttribute('data-position') === pos, lat = f?.kind === 'lateral';
  prop(el, '--bxif-top', top + 'px'); prop(el, '--bxif-gx', (clash && !lat ? 48 : 0) + 'px'); prop(el, '--bxif-gy', (clash && lat ? 98 : 0) + 'px');
 }

 /* ------------------------------ render ------------------------------ */
 const DEC = {hardware: 'HW', software: 'CPU'};
 function render() {
  n++;
  if (n % 4 === 1) place();
  if (layoutDirty) relayout();
  G.tick();
  const x = snapshot(), on = x.on, p = x.p, w = stateWord(), net = x.net;
  // Neural restoration asked for but not drawn (cut by the adaptation or no float targets): a short mark.
  const neuralOff = on && (status.neural === 'cut' || status.neural === 'no-float'), fence = x.gpu === null && x.gpuEst !== null;
  const overall = G('overall', x.overall), fpsG = G('fps', x.gFpsAny), devG = on && p ? G('dev', x.gDev) : 'none', hitG = on && p ? G('hit', x.gHit) : 'none';
  const totalG = G('total', x.gTotal), missG = G('miss', x.gMiss), warnG = x.warnCount ? G('warn', x.gWarn) : 'none';
  f.dot.set(f.kind === 'full' ? w.grade : fpsG);
  attr(el, 'data-overall', RANK(overall) > 1 ? overall : null);
  put(f.fps, fmtInt(x.fpsAny), fpsG);
  drawSparkline(f.cv, status.intervals, {count: f.spark.count, T: x.T, dim: !on, scale: s, ok: '#ffd666', bad: '#ff7b86'});
  const rate = drops.push(x.fl ? x.fl.dropped : null);
  let look = RANK(overall) > 1 || x.warnCount > 0 || neuralOff || [devG, hitG, totalG, fpsG, missG].some(v => RANK(v) > 1);
  if (f.kind !== 'full') {
   put(f.rit, on && p ? '±' + fmt(p.deviationMs, 1) : '—', devG);
   put(f.trav, on && p ? String(p.hitches) : '—', hitG);
   put(f.lat, x.lat.total === null ? '—' : fmtInt(x.lat.total), totalG);
   const tag = w.tag || (neuralOff ? 'SEM NEURAL' : '');
   put(f.tag, tag, w.tag ? w.grade : 'ok'); off(f.tagEl || f.tag.e, !tag);
   put(f.badge, x.warnCount ? '!' + x.warnCount : '', warnG); off(f.badgeEl || f.badge.e, !x.warnCount);
   // Line 3: at most two alerts, bad ones only, in priority order. An alert needs the bad grade on two
   // ticks to appear and leaves as soon as the value is back to good (never "PERDA 0,0%" in red).
   const alerts = [], add = (key, raw, text) => { if (!f.extra && G(key, raw) === 'bad' && raw !== 'good' && raw !== 'none' && alerts.length < CHIPS) alerts.push(text); };
   if (f.extra) {
    const e = f.extra, flOn = settings.fluidity !== 'off';
    put(e.p95, on && p ? fmtMs(p.p95Ms) : '—', on && p ? G('p95', x.gP95) : 'none');
    for (const r of [...e.descRows, ...e.waitRows]) off(r, !flOn);
    if (flOn) { put(e.desc, num(rate) ? fmtInt(rate) : '—', G('drops', grade('drops', rate))); put(e.wait, x.fl && num(x.fl.extraMs) ? '+' + fmtMs(x.fl.extraMs) : '—', G('wait', x.gWait)); }
    put(e.br, num(net?.bitrateMbps) ? fmt(net.bitrateMbps, 1) : '—', G('bitrate', x.gBitrate));
    put(e.qp, fmtInt(x.qp), G('qp', x.gQp));
    put(e.loss, num(net?.lossPct) ? fmt(net.lossPct, 1) + '%' : '—', G('loss', x.gLoss));
   }
   add('miss', x.gMiss, 'PUL ' + x.missed);
   add('loss', x.gLoss, 'PERDA ' + fmt(net?.lossPct, 1) + '%');
   add('qp', x.gQp, 'QP ' + fmtInt(x.qp));
   add('bitrate', x.gBitrate, fmt(net?.bitrateMbps, 1) + ' Mb/s');
   add('decoder', x.gDecoder, 'DECOD CPU');
   add('height', x.gHeight, net?.height + 'p');
   add('wait', x.gWait, 'ESP +' + fmtInt(x.fl?.extraMs));
   add('gpu', x.gGpuShow, (x.gpu !== null ? 'GPU ' : 'GPU ≈fence ') + fmt(x.gpuShow, 1));
   for (let i = 0; i < CHIPS; i++) { put(f.chips[i], alerts[i] || '', null); off(f.chipEls[i], !alerts[i]); }
   if (f.l3) off(f.l3, !alerts.length);
   look = look || alerts.length > 0;
  } else {
   put(f.word, w.word + (neuralOff ? ' · SEM NEURAL' : ''), neuralOff && w.grade === 'good' ? 'ok' : w.grade === 'good' ? null : w.grade);
   put(f.dev, on && p ? '±' + fmt(p.deviationMs, 1) : '—', devG);
   put(f.p95, on && p ? fmtMs(p.p95Ms) : '—', on && p ? G('p95', x.gP95) : 'none');
   put(f.hit, on && p ? String(p.hitches) : '—', hitG);
   // With direct capture nothing is skipped before the treatment (FLUIDEZ shows "Direta").
   for (const e of f.missParts) off(e, x.direct);
   put(f.miss, x.missed === null ? '—' : String(x.missed), missG);
   const flOn = settings.fluidity !== 'off';
   for (const e of f.descParts) off(e, !flOn);
   if (flOn) put(f.desc, num(rate) ? fmtInt(rate) : '—', G('drops', grade('drops', rate)));
   if (flOn) put(f.wait, x.fl && num(x.fl.extraMs) ? '+' + fmtMs(x.fl.extraMs) + ' ms' : '—', G('wait', x.gWait));
   else put(f.wait, 'desligada', 'none');
   off(f.capSep, !flOn); off(f.cap.e, !flOn);
   if (flOn) put(f.cap, x.direct ? 'Direta' : settings.capture === 'direct' ? 'Direta→vídeo' : 'Vídeo', x.gCapture === 'ok' ? 'ok' : null);
   put(f.total, x.lat.total === null ? '—' : '≈' + fmtInt(x.lat.total) + ' ms', totalG);
   const l = x.lat, segs = [l.rtt, l.buffer, l.decode, l.gpu, flOn ? l.wait : 0];
   for (let i = 0; i < 5; i++) prop(f.bar.children[i], 'flex-grow', String(num(segs[i]) ? Math.max(0, +segs[i].toFixed(1)) : 0));
   const legend = [[l.rtt, x.gRtt, 'rtt'], [l.buffer, x.gBuf, 'buf'], [l.decode, x.gDec, 'dec'], [x.gpu !== null ? x.gpu : x.gpuEst !== null ? l.gpu : null, x.gGpuShow, x.gpu !== null ? 'gpu' : 'gpu-est'], [x.fl ? x.fl.extraMs : null, x.gWait, 'wait']];
   legend.forEach(([v, gr, k], i) => put(f.leg[i].v, num(v) ? fmtMs(v) : '—', num(v) ? G(k, gr) : 'none'));
   if (f.fence !== fence) { f.fence = fence; f.leg[3].k.textContent = fence ? ' · T≈fence ' : ' · T '; }
   off(f.leg[4].k, !flOn); off(f.leg[4].v.e, !flOn);
   const r = on ? /(\d+)\s*×\s*(\d+)\s*→\s*(\d+)\s*×\s*(\d+)/.exec(status.resolution || '') : null, inH = r ? +r[2] : net?.height || null;
   put(f.vin, inH ? inH + 'p' : '—', net?.height ? G('height', x.gHeight) : 'none');
   put(f.vout, r ? r[4] + 'p' : '—', r ? null : 'none');
   put(f.codec, net?.codec ? net.codec.split(' ')[0] : '—', null);
   put(f.dec, net ? DEC[net.decoder] || '—' : '—', G('decoder', x.gDecoder));
   put(f.br, num(net?.bitrateMbps) ? fmt(net.bitrateMbps, 1) : '—', G('bitrate', x.gBitrate));
   put(f.qp, fmtInt(x.qp), G('qp', x.gQp));
   put(f.loss, num(net?.lossPct) ? fmt(net.lossPct, 1) + '%' : '—', G('loss', x.gLoss));
   const first = (status.warnings || []).slice().sort((a, b) => (LEVEL[b.level] || 0) - (LEVEL[a.level] || 0))[0];
   off(f.warn, !first);
   if (first) { put(f.wbadge, x.warnCount > 1 ? '!' + x.warnCount : first.level === 'info' ? 'i' : '!', warnG); put(f.wtext, first.text, warnG); }
  }
  // Calm: after 10 s with everything good and no warning the HUD fades to 60%; anything to look at restores it.
  calm = look || overall !== 'good' ? 0 : calm + 1;
  attr(el, 'data-calm', calm >= 20);
 }

 /* ------------------------------ lifecycle ------------------------------ */
 function loop() {
  loopTimer = 0;
  if (!showing || !el) return;
  loopTimer = setTimeout(loop, STEP);
  try { render(); } catch (error) { console.warn('[BxImageFilter HUD]', error); }
 }
 // Telemetry counts as live while status.net keeps being replaced (once per second).
 function netLive() {
  const net = status.net, now = Date.now();
  if (!net) return false;
  if (net !== lastNet) { lastNet = net; lastNetAt = now; }
  return now - lastNetAt < 4000;
 }
 function show() {
  showing = true;
  clearTimeout(fadeTimer); fadeTimer = 0;
  attr(el, 'data-hiding', null); attr(el, 'data-show', true);
  n = 0; calm = 0;
  clearTimeout(loopTimer); loop();
 }
 function hide() {
  showing = false;
  clearTimeout(loopTimer); loopTimer = 0;
  attr(el, 'data-calm', null); attr(el, 'data-hiding', true);
  clearTimeout(fadeTimer);
  fadeTimer = setTimeout(() => { fadeTimer = 0; if (!showing && el) { attr(el, 'data-show', null); attr(el, 'data-hiding', null); } }, 160);
 }
 // 1 Hz while the HUD is enabled: shows it while frames are treated or the stream telemetry is live.
 function watch() {
  watchTimer = 0;
  if (!el) return;
  watchTimer = setTimeout(watch, WATCH);
  // play.xbox.com's React hydration can drop nodes appended to <html> at document-start: put the HUD back.
  if (!el.isConnected) { doc.documentElement.append(el); layoutDirty = true; }
  const want = !doc.hidden && (api.active || netLive());
  if (want && !showing) show(); else if (!want && showing) hide();
 }
 const onVisibility = () => { if (!el) return; if (doc.hidden) { if (showing) hide(); } else { clearTimeout(watchTimer); watch(); } };
 const onResize = () => { safe = null; layoutDirty = true; };
 const onScale = () => { layoutDirty = true; if (showing) { relayout(); if (f) f.cv._bxifSig = null; } };
 function create() {
  el = doc.createElement('div');
  el.className = 'bxif-hud';
  el.setAttribute('aria-hidden', 'true'); el.setAttribute('inert', ''); el.inert = true;
  doc.documentElement.append(el);
  built = ''; layoutDirty = true;
  doc.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('resize', onResize);
  try { mqs = [matchMedia('(min-height:640px)'), matchMedia('(min-height:1000px)')]; for (const m of mqs) m.addEventListener('change', onScale); } catch { mqs = []; }
  dprOff = ui.watchDpr?.(() => { if (f) { f.cv._bxifSig = null; sizeSpark(); } }) || null;
 }
 function teardown() {
  clearTimeout(watchTimer); clearTimeout(loopTimer); clearTimeout(fadeTimer); watchTimer = loopTimer = fadeTimer = 0;
  showing = false;
  if (!el) return;
  doc.removeEventListener('visibilitychange', onVisibility);
  window.removeEventListener('resize', onResize);
  for (const m of mqs) { try { m.removeEventListener('change', onScale); } catch {} }
  mqs = []; dprOff?.(); dprOff = null;
  el.remove(); el = null; f = null; built = '';
 }
 // Re-reads settings.hud / hudPosition: builds, rebuilds or removes the HUD and renders at once.
 function update() {
  if (settings.hud !== 'compact' && settings.hud !== 'full') { teardown(); return; }
  ensureStyle('hud', CSS);
  if (!el) create();
  layoutDirty = true;
  if (showing) { n = 0; render(); }
  clearTimeout(watchTimer); watch();
 }
 window.addEventListener('pagehide', teardown);
 window.addEventListener('pageshow', e => { if (e.persisted) update(); });
 api.hud = {update, timers: () => (watchTimer ? 1 : 0) + (loopTimer ? 1 : 0) + (fadeTimer ? 1 : 0), get element() { return el; }};
 update();
})();

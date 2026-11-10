// play.xbox.com host, part 2: binds the treatment straight to the stream's <video>.
// The new site (React Router, WebRtcStreamV1) creates one <video> inside div[data-testid=media-container]
// and sets srcObject to the WebRTC MediaStream on ontrack (docs/play-xbox-com.md). Nothing in the
// site's code is changed: a WebGL2 canvas is placed over that video and the video is made transparent,
// so focus, pointer and keyboard input still reach the site's own element.
(() => {
 if (window.top !== window) return;
 const api = window.BxImageFilter;
 const CSS = `
video.bxif-play-source{opacity:0 !important}
canvas.bxif-play-canvas{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;pointer-events:none;background:#000;z-index:0}
.bxif-play-launch{position:fixed;left:0;top:0;z-index:2147483646;width:44px;height:44px;border:0;border-radius:50%;background:none;
 display:block;cursor:pointer;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent;
 transition:opacity .25s,left .2s,top .2s;opacity:.95;padding:0;margin:0;box-sizing:border-box;filter:drop-shadow(0 1px 3px rgba(0,0,0,.6))}
.bxif-play-launch svg{width:100%;height:100%;display:block;pointer-events:none}
.bxif-play-launch[data-drag]{transition:none;opacity:1;cursor:grabbing}
.bxif-play-launch[data-idle]{opacity:0;pointer-events:none}
.bxif-play-launch:focus{outline:none}
.bxif-play-launch:focus-visible{outline:2px solid #5DCAA5;outline-offset:2px}
.bxif-play-name{display:inline-flex;align-items:center;gap:8px}
.bxif-play-name svg{width:22px;height:22px;flex:none}
.bxif-play-backdrop{position:fixed;inset:0;z-index:2147483645;background:transparent;touch-action:none}
.bxif-play-backdrop[hidden]{display:none}
.bxif-play-dialog{position:fixed;top:0;right:0;bottom:0;z-index:2147483647;width:min(440px,100vw);box-sizing:border-box;
 overflow:auto;padding:12px 16px;background:rgba(18,20,24,.96);color:#fff;box-shadow:-4px 0 24px rgba(0,0,0,.5)}
.bxif-play-dialog[hidden]{display:none}
.bxif-play-head{display:flex;align-items:center;justify-content:space-between;gap:8px;font:600 15px Bahnschrift,Arial,Roboto,sans-serif}
.bxif-play-diag{margin:8px 0 4px;padding:8px 10px;border-radius:6px;background:#22262e;font:12px/1.4 Bahnschrift,Arial,Roboto,sans-serif;color:#cfd3da;white-space:pre-line;user-select:text}
.bxif-play-diag[data-state=active]{border-left:3px solid #04b358}
.bxif-play-diag[data-state=waiting]{border-left:3px solid #c1a404}
.bxif-play-diag[data-state=error]{border-left:3px solid #c10404}
.bxif-play-head button{border:0;border-radius:6px;background:#2a2e36;color:#fff;font:600 13px Bahnschrift,Arial,Roboto,sans-serif;padding:8px 12px;cursor:pointer}`;
 // Only a live WebRTC video track: trailers and hero videos on the new site use src, not srcObject.
 function isStream(video) {
  const stream = video.srcObject;
  if (!(typeof MediaStream === 'function' && stream instanceof MediaStream)) return false;
  return stream.getVideoTracks().some(t => t.readyState === 'live') && video.isConnected;
 }
 function findStream() {
  const inContainer = document.querySelectorAll('[data-testid="media-container"] video');
  for (const v of inContainer) if (isStream(v)) return v;
  // Fallback if the container's test id changes: any video playing a WebRTC track.
  for (const v of document.getElementsByTagName('video')) if (isStream(v)) return v;
  return null;
 }
 let player = null, starting = null, style = null;
 function ensureStyle() {
  if (style?.isConnected) return;
  style = document.createElement('style');style.id = 'bxif-play-style';style.textContent = CSS;
  (document.head || document.documentElement).append(style);
 }
 async function attach(video) {
  ensureStyle();
  const parent = video.parentElement;
  if (parent && getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
  const p = new WebGL2Player(video);
  p.$canvas.classList.add('bxif-play-canvas');
  p.$canvas.setAttribute('aria-hidden', 'true');
  starting = p;
  try { await p.init(); } catch (error) { console.warn('[BxImageFilter] play.xbox.com', error); }
  if (starting !== p) return;
  starting = null;
  // Without a context the original video stays visible.
  if (!p.gl) { p.destroy(); return; }
  player = p;
  video.classList.add('bxif-play-source');
  setStreaming(true);
 }
 function detach() {
  const p = player || starting;
  player = starting = null;
  if (!p) return;
  p.$video?.classList.remove('bxif-play-source');
  try { p.destroy(); } catch (error) { console.warn('[BxImageFilter] play.xbox.com', error); }
  setStreaming(false);
 }
 // srcObject changes fire no DOM mutation: a light check once a second (and on DOM changes) follows the
 // video from creation to teardown, including a reconnect that replaces it.
 function scan() {
  ensureUi();
  const current = player || starting;
  if (current) {
   const v = current.$video;
   if (!isStream(v) || findStream() !== v) detach(); else return;
  }
  const video = findStream();
  if (video && video.videoWidth > 0) attach(video);
  else if (video && !video.bxifWaiting) {
   video.bxifWaiting = true;
   video.addEventListener('loadeddata', () => { video.bxifWaiting = false; scan(); }, {once: true});
  }
 }
 let scanQueued = false;
 // While a player runs, the site's UI mutates often: the 1 s check alone notices the teardown.
 function queueScan() { if (scanQueued || player) return; scanQueued = true; requestAnimationFrame(() => { scanQueued = false; scan(); }); }
 // What the script sees, shown at the top of the panel: tells "not running" apart from "no stream found".
 function diagnosis() {
  const videos = [...document.getElementsByTagName('video')], webrtc = videos.filter(isStream).length;
  const version = (globalThis.BxBuild?.version || '').split('imagefilter.')[1] || '?', lines = [`Script ativo em ${location.hostname} (${NAME} v${version}, sem Better xCloud)`];
  let state = 'waiting';
  if (player) {
   const s = api.status;
   if (s.mode === 'error') { state = 'error'; lines.push('Erro no tratamento: ' + (s.error || 'desconhecido')); }
   else { state = 'active'; lines.push(`Tratamento ligado ao vídeo do jogo: ${s.resolution || 'aguardando quadro'} (${s.mode})`); }
  } else if (starting) lines.push('Stream encontrado: iniciando WebGL2…');
  else if (webrtc) lines.push('Stream encontrado: aguardando o primeiro quadro.');
  else lines.push(`Nenhum jogo em andamento. Vídeos na página: ${videos.length}, com stream WebRTC: ${webrtc}.`);
  if (status0.webgl === false) { state = 'error'; lines.push('WebGL2 indisponível neste navegador.'); }
  return {state, text: lines.join('\n')};
 }
 // WebGL2 support, probed once when the panel first shows the diagnosis (not on every page load).
 const status0 = {get webgl() {
  if (this.probed === undefined) {
   try { const gl = document.createElement('canvas').getContext('webgl2'); this.probed = !!gl; gl?.getExtension('WEBGL_lose_context')?.loseContext(); }
   catch { this.probed = false; }
  }
  return this.probed;
 }};
 function showDiagnosis() {
  if (!diag || dialog.hidden) return;
  const d = diagnosis();
  if (diag.textContent !== d.text) diag.textContent = d.text;
  diag.dataset.state = d.state;
 }
 // Panel widget: always on play.xbox.com, so the script is visibly running. A round button the user drags
 // anywhere; on release it snaps to the nearest side edge (inside the safe area) and the spot is saved. Until
 // it is moved: bottom right while browsing, top left during a game. Hidden after a few seconds without the
 // pointer while streaming. Also Alt+Shift+F.
 const NAME = 'xCloud Enhanced', SIZE = 44, EDGE = 12, DRAG = 8, POS_KEY = 'BxImageFilter.play.widget.v1';
 // The site's own header row (Xbox/stream menu at the top left; search, profile... at the top right) sits in
 // the top ~64 px: the widget is never placed there, or it covers the button that leaves the game.
 const TOP_BAND = 64;
 // Icon chosen by the user (48x48, its own dark translucent disc): a white cloud with a dark controller, white
 // d-pad and one teal button. This is the simplified variant (one dot, thicker d-pad) for <= 44 px; the full
 // one has four teal dots.
 const ICON = '<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><circle cx="24" cy="24" r="23" fill="#0d0f12" fill-opacity=".8" stroke="#fff" stroke-opacity=".2"/>'
  + '<path d="M13 36h21a8.5 8.5 0 0 0 1.4-16.9A11.5 11.5 0 0 0 13.9 16.9 9.5 9.5 0 0 0 13 36z" fill="#fff"/>'
  + '<path d="M18.4 21.6h11.2c2.1 0 3.8 1.4 4.3 3.4l1.3 5.3c.5 1.9-1.8 3.2-3.2 1.9l-2.4-2.4h-11.2l-2.4 2.4c-1.4 1.3-3.7 0-3.2-1.9l1.3-5.3c.5-2 2.2-3.4 4.3-3.4z" fill="#0d0f12"/>'
  + '<path d="M18.5 24.3v3.6M16.7 26.1h3.6" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/><circle cx="29.8" cy="26.1" r="1.6" fill="#5DCAA5"/></svg>';
 const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
 // Free area for the widget's top left corner in a viewport (vw x vh) with safe-area insets.
 function bounds(vw, vh, inset) {
  const x0 = inset.left + EDGE, y0 = inset.top + EDGE;
  return {x0, y0, x1: Math.max(x0, vw - inset.right - EDGE - SIZE), y1: Math.max(y0, vh - inset.bottom - EDGE - SIZE)};
 }
 // A saved spot {side: 'left'|'right', y: 0 (top) to 1 (bottom)} as pixels: relative, so it survives rotation.
 function place(pos, vw, vh, inset) {
  const b = bounds(vw, vh, inset);
  const y = Math.round(b.y0 + clamp(+pos.y || 0, 0, 1) * (b.y1 - b.y0));
  return {x: pos.side === 'left' ? b.x0 : b.x1, y: Math.min(Math.max(y, TOP_BAND), b.y1)};
 }
 // Until the user moves it: bottom right while browsing; right edge, about a third down, during a game (clear of
 // the site's menu button at the top left and of the touch controls at the bottom).
 const home = on => on ? {side: 'right', y: .35} : {side: 'right', y: 1};
 // Where a widget released at (x, y) settles: the nearest side edge, at the same height.
 function snap(x, y, vw, vh, inset) {
  const b = bounds(vw, vh, inset);
  return {side: x + SIZE / 2 < vw / 2 ? 'left' : 'right', y: b.y1 > b.y0 ? Math.round(clamp((y - b.y0) / (b.y1 - b.y0), 0, 1) * 1e4) / 1e4 : 0};
 }
 function loadPos() {
  try {
   const p = JSON.parse(localStorage.getItem(POS_KEY));
   if (p && (p.side === 'left' || p.side === 'right') && Number.isFinite(p.y)) return {side: p.side, y: clamp(p.y, 0, 1)};
  } catch {}
  return null;
 }
 function savePos(p) { try { localStorage.setItem(POS_KEY, JSON.stringify(p)); } catch {} }
 let launcher = null, dialog = null, backdrop = null, body = null, diag = null, idleTimer = 0, streaming = false;
 let saved = loadPos(), safe = null, at = {x: 0, y: 0}, press = null, dragged = false, dragTimer = 0, outside = null, backdropTimer = 0;
 // Safe-area insets (notch/cutout) from a probe, read once and again after a resize.
 function readSafe() {
  if (safe) return safe;
  safe = {top: 0, right: 0, bottom: 0, left: 0};
  try {
   const p = document.createElement('div');
   p.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
   document.documentElement.append(p);
   const cs = getComputedStyle(p);
   safe = {top: parseFloat(cs.paddingTop) || 0, right: parseFloat(cs.paddingRight) || 0, bottom: parseFloat(cs.paddingBottom) || 0, left: parseFloat(cs.paddingLeft) || 0};
   p.remove();
  } catch {}
  return safe;
 }
 const viewport = () => [window.innerWidth || document.documentElement.clientWidth || 0, window.innerHeight || document.documentElement.clientHeight || 0];
 function moveTo(x, y) { at = {x, y}; launcher.style.left = x + 'px'; launcher.style.top = y + 'px'; }
 // Saved spot, else the default for the state; recomputed after a resize or rotation, so it stays on screen.
 function layout() {
  if (!launcher || press?.drag) return;
  const [vw, vh] = viewport(), p = place(saved || home(streaming), vw, vh, readSafe());
  moveTo(p.x, p.y);
 }
 function onResize() { safe = null; layout(); }
 // Tap toggles the panel; a move past DRAG px is a drag and never toggles it. The widget's pointer events stop
 // here, so the site never sees a touch on it.
 function onDown(e) {
  e.stopPropagation();
  if (press || (e.button || 0) !== 0) return;
  dragged = false;
  press = {id: e.pointerId, x0: e.clientX, y0: e.clientY, left: at.x, top: at.y, drag: false};
  try { launcher.setPointerCapture(e.pointerId); } catch {}
 }
 function onMove(e) {
  e.stopPropagation();
  if (!press || e.pointerId !== press.id) return;
  const dx = e.clientX - press.x0, dy = e.clientY - press.y0;
  if (!press.drag && Math.hypot(dx, dy) < DRAG) return;
  if (!press.drag) { press.drag = true; launcher.setAttribute('data-drag', ''); }
  wake();
  const [vw, vh] = viewport(), b = bounds(vw, vh, readSafe());
  moveTo(clamp(press.left + dx, b.x0, b.x1), clamp(press.top + dy, b.y0, b.y1));
 }
 function onUp(e) {
  e.stopPropagation();
  if (!press || e.pointerId !== press.id) return;
  const p = press;press = null;
  try { launcher.releasePointerCapture(e.pointerId); } catch {}
  if (!p.drag) return;
  launcher.removeAttribute('data-drag');
  const [vw, vh] = viewport();
  saved = snap(at.x, at.y, vw, vh, readSafe());savePos(saved);layout();
  // The click that may follow the release is not a tap.
  dragged = true;clearTimeout(dragTimer);dragTimer = setTimeout(() => { dragged = false; }, 400);
 }
 // Close by tapping outside: while the panel is open a transparent layer covers the page under it (the widget
 // stays above it). A press that starts and ends on that layer closes the panel; every event on it stops there,
 // so the tap never reaches the game. The layer outlives the panel for a moment, to also catch the mouse/click
 // events the browser sends after the touch.
 function onBackdrop(e) {
  e.stopPropagation();
  if (e.cancelable && e.type !== 'pointermove') e.preventDefault();
  if (e.type === 'pointerdown') outside = e.pointerId;
  else if (e.type === 'pointercancel') outside = null;
  else if (e.type === 'pointerup' && outside === e.pointerId) { outside = null; if (!dialog.hidden) toggle(false, true); }
 }
 function build() {
  if (launcher) return;
  ensureStyle();
  launcher = document.createElement('button');
  launcher.type = 'button';launcher.className = 'bxif-play-launch';launcher.innerHTML = ICON;
  launcher.title = NAME + ' (Alt+Shift+F)';launcher.setAttribute('aria-label', NAME);launcher.setAttribute('aria-expanded', 'false');
  launcher.addEventListener('pointerdown', onDown);
  launcher.addEventListener('pointermove', onMove);
  launcher.addEventListener('pointerup', onUp);
  launcher.addEventListener('pointercancel', onUp);
  launcher.addEventListener('click', e => { e.stopPropagation(); if (dragged) { dragged = false; return; } toggle(); });
  backdrop = document.createElement('div');
  backdrop.className = 'bxif-play-backdrop';backdrop.hidden = true;backdrop.setAttribute('aria-hidden', 'true');
  for (const name of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu', 'touchstart', 'touchmove', 'touchend', 'wheel'])
   backdrop.addEventListener(name, onBackdrop, {passive: false});
  dialog = document.createElement('div');
  dialog.className = 'bxif-play-dialog';dialog.hidden = true;
  dialog.setAttribute('role', 'dialog');dialog.setAttribute('aria-label', NAME);
  const head = document.createElement('div'), title = document.createElement('span'), close = document.createElement('button');
  head.className = 'bxif-play-head';title.className = 'bxif-play-name';title.innerHTML = ICON;title.append(NAME);
  close.type = 'button';close.textContent = 'Fechar';close.addEventListener('click', () => toggle(false));
  head.append(title, close);
  diag = document.createElement('div');diag.className = 'bxif-play-diag';
  body = document.createElement('div');
  dialog.append(head, diag, body);
  // Keys typed in the panel are not game input.
  for (const name of ['keydown', 'keyup', 'keypress']) dialog.addEventListener(name, e => { if (e.key === 'Escape' && name === 'keydown') toggle(false); e.stopPropagation(); });
  document.body.append(backdrop, launcher, dialog);
  layout();
 }
 // React hydration of the whole document can drop nodes it did not render: put them back.
 function ensureUi() {
  if (!document.body) return;
  ensureStyle();
  build();
  if (!launcher.isConnected || !dialog.isConnected || !backdrop.isConnected) document.body.append(backdrop, launcher, dialog);
  showDiagnosis();
 }
 function toggle(open = dialog?.hidden ?? true, fromOutside = false) {
  build();
  // The panel sets api.panelOpen itself while it is on screen (IntersectionObserver).
  dialog.hidden = !open;
  launcher.setAttribute('aria-expanded', String(open));
  clearTimeout(backdropTimer);outside = null;
  if (open || !fromOutside) backdrop.hidden = !open;
  else backdropTimer = setTimeout(() => { if (dialog.hidden) backdrop.hidden = true; }, 350);
  if (open) { showDiagnosis(); api.mountControls(body); dialog.querySelector('button')?.focus(); }
  else { (player?.$video || launcher).focus?.({preventScroll: true}); wake(); }
 }
 function setStreaming(on) {
  streaming = on;
  if (!document.body) return;
  ensureUi();
  launcher.toggleAttribute('data-stream', on);
  layout();
  if (!on) { clearTimeout(idleTimer); launcher.removeAttribute('data-idle'); } else wake();
  showDiagnosis();
 }
 function wake() {
  if (!launcher) return;
  launcher.removeAttribute('data-idle');
  clearTimeout(idleTimer);
  if (streaming) idleTimer = setTimeout(() => { if (streaming && dialog.hidden && !press) launcher.setAttribute('data-idle', ''); }, 4000);
 }
 window.addEventListener('pointermove', wake, {passive: true, capture: true});
 window.addEventListener('pointerdown', wake, {passive: true, capture: true});
 window.addEventListener('resize', onResize);
 window.addEventListener('orientationchange', onResize);
 window.visualViewport?.addEventListener('resize', onResize);
 window.addEventListener('keydown', e => {
  if (e.altKey && e.shiftKey && (e.code === 'KeyF' || e.key === 'F' || e.key === 'f')) { e.preventDefault(); e.stopPropagation(); toggle(); }
  // Esc closes the panel even when the focus is outside it (e.g. on the widget).
  else if (e.key === 'Escape' && dialog && !dialog.hidden && !dialog.contains(e.target)) { e.preventDefault(); e.stopPropagation(); toggle(false); }
 }, true);
 let observer = null, timer = 0;
 function start() {
  if (!document.documentElement) return;
  observer ??= new MutationObserver(queueScan);
  observer.observe(document.documentElement, {childList: true, subtree: true});
  clearInterval(timer);timer = setInterval(scan, 1000);
  scan();
 }
 window.addEventListener('pagehide', () => { clearInterval(timer);timer = 0;observer?.disconnect();detach(); });
 window.addEventListener('pageshow', e => { if (e.persisted) start(); });
 if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once: true}); else start();
 // Test hook: the current player (null when none).
 api.playHost = {player: () => player, scan, diagnosis, toggle, widget: {bounds, place, snap, home, band: TOP_BAND, key: POS_KEY, at: () => ({...at}), saved: () => saved && {...saved}}};
})();

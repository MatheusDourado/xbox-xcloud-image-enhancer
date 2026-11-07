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
.bxif-play-launch{position:fixed;right:16px;bottom:16px;z-index:2147483646;width:44px;height:44px;border:2px solid #04b358;border-radius:22px;
 background:rgba(0,0,0,.7);color:#fff;font:700 13px/40px Bahnschrift,Arial,Roboto,sans-serif;text-align:center;cursor:pointer;
 transition:opacity .25s;opacity:.9;padding:0;box-sizing:border-box}
.bxif-play-launch[data-stream]{right:auto;bottom:auto;top:12px;left:12px}
.bxif-play-launch[data-idle]{opacity:0;pointer-events:none}
.bxif-play-launch:focus-visible{outline:2px solid #04b358;outline-offset:2px}
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
  const version = (globalThis.BxBuild?.version || '').split('imagefilter.')[1] || '?', lines = [`Script ativo em ${location.hostname} (Image Filter v${version}, sem Better xCloud)`];
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
 // Panel button: always on play.xbox.com, so the script is visibly running. Bottom right while browsing;
 // top left during a game, hidden after a few seconds without the pointer. Also Alt+Shift+F.
 let launcher = null, dialog = null, body = null, diag = null, idleTimer = 0, streaming = false;
 function build() {
  if (launcher) return;
  ensureStyle();
  launcher = document.createElement('button');
  launcher.type = 'button';launcher.className = 'bxif-play-launch';launcher.textContent = 'IF';
  launcher.title = 'Tratamento de imagem (Alt+Shift+F)';launcher.setAttribute('aria-label', 'Tratamento de imagem');
  launcher.addEventListener('click', e => { e.stopPropagation(); toggle(); });
  dialog = document.createElement('div');
  dialog.className = 'bxif-play-dialog';dialog.hidden = true;
  dialog.setAttribute('role', 'dialog');dialog.setAttribute('aria-label', 'Tratamento de imagem');
  const head = document.createElement('div'), title = document.createElement('span'), close = document.createElement('button');
  head.className = 'bxif-play-head';title.textContent = 'Tratamento de imagem';
  close.type = 'button';close.textContent = 'Fechar';close.addEventListener('click', () => toggle(false));
  head.append(title, close);
  diag = document.createElement('div');diag.className = 'bxif-play-diag';
  body = document.createElement('div');
  dialog.append(head, diag, body);
  // Keys typed in the panel are not game input.
  for (const name of ['keydown', 'keyup', 'keypress']) dialog.addEventListener(name, e => { if (e.key === 'Escape' && name === 'keydown') toggle(false); e.stopPropagation(); });
  document.body.append(launcher, dialog);
 }
 // React hydration of the whole document can drop nodes it did not render: put them back.
 function ensureUi() {
  if (!document.body) return;
  ensureStyle();
  build();
  if (!launcher.isConnected || !dialog.isConnected) document.body.append(launcher, dialog);
  showDiagnosis();
 }
 function toggle(open = dialog?.hidden ?? true) {
  build();
  // The panel sets api.panelOpen itself while it is on screen (IntersectionObserver).
  dialog.hidden = !open;
  if (open) { showDiagnosis(); api.mountControls(body); dialog.querySelector('button')?.focus(); }
  else (player?.$video || launcher).focus?.({preventScroll: true});
 }
 function setStreaming(on) {
  streaming = on;
  if (!document.body) return;
  ensureUi();
  launcher.toggleAttribute('data-stream', on);
  if (!on) { clearTimeout(idleTimer); launcher.removeAttribute('data-idle'); } else wake();
  showDiagnosis();
 }
 function wake() {
  if (!launcher) return;
  launcher.removeAttribute('data-idle');
  clearTimeout(idleTimer);
  if (streaming) idleTimer = setTimeout(() => { if (streaming && dialog.hidden) launcher.setAttribute('data-idle', ''); }, 4000);
 }
 window.addEventListener('pointermove', wake, {passive: true, capture: true});
 window.addEventListener('pointerdown', wake, {passive: true, capture: true});
 window.addEventListener('keydown', e => {
  if (e.altKey && e.shiftKey && (e.code === 'KeyF' || e.key === 'F' || e.key === 'f')) { e.preventDefault(); e.stopPropagation(); toggle(); }
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
 api.playHost = {player: () => player, scan, diagnosis};
})();

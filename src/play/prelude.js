// play.xbox.com host, part 1 (before Better xCloud's player classes and the treatment).
// The new site has no Better xCloud: this supplies the few names the reused WebGL2Player and the
// adapter (image-filter.js) read, and records the WebRTC connection for telemetry and Suavização.
const BxLogger = {info() {}, warning() {}, error: (tag, ...args) => console.warn('[BxImageFilter]', tag, ...args)};
// WebGL2Player asks for video.player.powerPreference; the adapter checks typeof for the others.
function getStreamPref(key) { return key === 'video.player.powerPreference' ? 'default' : undefined; }
// Same shape the adapter reads on the old site (STATES.currentStream.peerConnection). var: the adapter
// tests typeof STATES while it loads, before this scope's later declarations would exist.
var STATES = {currentStream: {peerConnection: null}};
(() => {
 const Native = window.RTCPeerConnection;
 if (typeof Native !== 'function' || Native.bxTracked) return;
 // The stream's connection is the one that receives a video track (WebRtcStreamV1 ontrack). Runs at
 // document-start, before the site's webrtc-adapter captures the constructor.
 class TrackedPeerConnection extends Native {
  constructor(...args) {
   super(...args);
   const current = STATES.currentStream.peerConnection;
   if (!current || current.connectionState === 'closed') STATES.currentStream.peerConnection = this;
   this.addEventListener('track', e => { if (e.track?.kind === 'video') STATES.currentStream.peerConnection = this; });
  }
 }
 TrackedPeerConnection.bxTracked = true;
 window.RTCPeerConnection = TrackedPeerConnection;
 if (window.webkitRTCPeerConnection === Native) window.webkitRTCPeerConnection = TrackedPeerConnection;
})();
// Stream resolution and "Impedir queda de resolução" (docs/play-xbox-com.md, medição de 2026-11-09 no Poco F7).
// The new site announces itself as android with its window size (807×394 on the Poco) and the server answers
// H.264 Baseline 3.1 in 720p. Declaring windows and 1920×1080 in POST /v5/sessions/cloud/play brings 1080p Main
// 4.2, as Better xCloud's stream.video.resolution does (getOsNameFromResolution: 1080p → windows, 1080p-hq → tizen).
// WebRtcStreamV1 then reports frameDecodedTimeMs = receiveTime + Δ totalDecodeTime / Δ framesDecoded (getStats) to
// the server, which drops 1080p to 720p within ~15 s at ~21 ms of decoding. With preventDrops the site's getStats
// sees at most 8 ms per decoded frame (Better xCloud's stream.video.preventResolutionDrops changes the same report
// inside the site's code). Our own telemetry reads the real values (realStats). Both settings are read when the
// session starts: a change applies to the next stream. Installed here, at document-start, before the site's code.
// Audit C11: the limit holds between any two reads, not only on the average since the start: each object queried
// (peer connection or receiver) keeps, per inbound stream, a virtual totalDecodeTime that grows by at most 8 ms per
// frame decoded since its previous read (monotonic, reset when the counters restart). preventDrops is latched by
// each object on its first read, so turning it on or off mid-game neither jumps the series nor acts before the next game.
var BxPlayStream = (() => {
 const CAP_MS = 8, OS = {'1080p': 'windows', '1080p-hq': 'tizen'}, PLAY = /\/sessions\/cloud\/play(?:[?#]|$)/i;
 // request: what the last play request asked for; capAt/capCalls/realMs: the last report the cap changed.
 const state = {request: null, capAt: 0, capCalls: 0, realMs: null, error: ''};
 // Per queried object: {on: preventDrops latched at its first read, streams: Map(stats id → {frames, real, out})}.
 const sessions = new WeakMap();
 const prefs = () => window.BxImageFilter?.settings || {};
 const isRequest = v => typeof Request === 'function' && v instanceof Request;
 // Body (JSON text) and x-ms-device-info (JSON text or null) of the play request, declaring osName.
 function rewritePlay(body, deviceInfo, osName) {
  const result = {body, deviceInfo, from: null};
  try {
   const o = JSON.parse(body);
   if (o?.settings && typeof o.settings === 'object') { result.from = o.settings.osName ?? null; o.settings.osName = osName; result.body = JSON.stringify(o); }
  } catch {}
  try {
   const o = JSON.parse(deviceInfo);
   if (o?.dev && typeof o.dev === 'object') {
    o.dev.os = {...o.dev.os, name: osName, ver: '22631.2715', platform: 'desktop'};
    o.dev.hw = {...o.dev.hw, make: 'Microsoft', model: 'Surface Pro'};
    o.dev.displayInfo = {dimensions: {widthInPixels: 1920, heightInPixels: 1080}, pixelDensity: {dpiX: 1, dpiY: 1}};
    o.dev.browser = {browserName: 'chrome', browserVersion: '130.0'};
    result.deviceInfo = JSON.stringify(o);
   }
  } catch {}
  return result;
 }
 // The report with each inbound video totalDecodeTime limited to capMs per frame decoded since the previous read of
 // the same stream (streams: Map kept by the caller; a new Map each call caps the totals since the start). The copy
 // is made only when a value changes. realMs: the real decoding time per frame over the last interval that was capped.
 function capReport(report, capMs = CAP_MS, streams = new Map()) {
  const out = new Map();let realMs = null, changed = false;
  report.forEach((v, k) => {
   if (v?.type === 'inbound-rtp' && (v.kind ?? v.mediaType) === 'video' && v.framesDecoded > 0 && typeof v.totalDecodeTime === 'number') {
    const id = v.id ?? k, s = streams.get(id), frames = v.framesDecoded, real = v.totalDecodeTime;
    let total;
    if (!s || frames < s.frames || real < s.real) {
     // First read or restarted counters: the totals since the start, capped as a whole.
     total = Math.min(real, frames * capMs / 1000);
     if (total < real) realMs = real / frames * 1000;
     streams.set(id, {frames, real, out: total});
    } else {
     const df = frames - s.frames, dt = real - s.real, step = Math.min(dt, df * capMs / 1000);
     if (step < dt && df > 0) realMs = dt / df * 1000;
     total = s.out + step;s.frames = frames;s.real = real;s.out = total;
    }
    if (total !== real) { v = {...v, totalDecodeTime: total};changed = true; }
   }
   out.set(k, v);
  });
  return {report: changed ? out : report, realMs};
 }
 // Native getStats per patched prototype: realStats calls it, so the adapter never sees the capped values.
 const natives = new Map();
 function wrapStats(proto) {
  const current = proto?.getStats;
  if (typeof current !== 'function') return;
  const native = current.bxNative || current;
  natives.set(proto, native);
  if (current.bxNative) return;
  // Not async: keeps length 0 and the legacy callback form, which webrtc-adapter tells apart by both.
  const getStats = function getStats() {
   const result = native.apply(this, arguments);
   if (typeof result?.then !== 'function' || this == null || typeof this !== 'object') return result;
   let session = sessions.get(this);
   if (!session) { session = {on: prefs().preventDrops === true, streams: new Map()};sessions.set(this, session); }
   if (!session.on) return result;
   return result.then(report => {
    try {
     const c = capReport(report, CAP_MS, session.streams);
     if (c.realMs !== null) { state.capAt = Date.now();state.capCalls++;state.realMs = c.realMs; }
     return c.report;
    } catch (error) { state.error = String(error); return report; }
   });
  };
  getStats.bxNative = native;
  proto.getStats = getStats;
 }
 function realStats(target) {
  for (const [proto, native] of natives) if (proto.isPrototypeOf(target)) return native.call(target);
  return target.getStats();
 }
 async function playRequest(self, input, init, resolution, osName) {
  const req = isRequest(input) ? input : null;
  try {
   const body = init?.body != null ? init.body : req ? await req.clone().text() : null;
   if (typeof body !== 'string') return nativeFetch.call(self, input, init);
   const headers = new Headers(init?.headers || req?.headers || undefined);
   const r = rewritePlay(body, headers.get('x-ms-device-info'), osName);
   if (r.deviceInfo != null) headers.set('x-ms-device-info', r.deviceInfo);
   state.request = {at: Date.now(), resolution, osName, from: r.from, header: r.deviceInfo != null, preventDrops: prefs().preventDrops === true};
   const options = {...init, body: r.body, headers};
   return req ? nativeFetch.call(self, new Request(req, options)) : nativeFetch.call(self, input, options);
  } catch (error) { state.error = String(error); return nativeFetch.call(self, input, init); }
 }
 const nativeFetch = window.fetch?.bxNative || window.fetch;
 if (typeof nativeFetch === 'function' && !window.fetch.bxNative) {
  const fetch = function fetch(input, init) {
   const resolution = prefs().streamResolution, osName = OS[resolution];
   if (osName) {
    const url = typeof input === 'string' ? input : input?.url ?? String(input);
    const method = String(init?.method || (isRequest(input) ? input.method : 'GET')).toUpperCase();
    if (method === 'POST' && PLAY.test(url)) return playRequest(this, input, init, resolution, osName);
   }
   return nativeFetch.apply(this, arguments);
  };
  fetch.bxNative = nativeFetch;
  window.fetch = fetch;
 }
 // The prototype that owns getStats: the native one, under TrackedPeerConnection above.
 const owner = proto => { while (proto && !Object.prototype.hasOwnProperty.call(proto, 'getStats')) proto = Object.getPrototypeOf(proto); return proto; };
 wrapStats(owner(window.RTCPeerConnection?.prototype));
 wrapStats(owner(window.RTCRtpReceiver?.prototype));
 // For the panel and the measurement: the settings, what the last session asked for and whether the cap is acting.
 function info() {
  const s = prefs();
  return {resolution: s.streamResolution ?? null, preventDrops: s.preventDrops === true, request: state.request && {...state.request},
   capActive: Date.now() - state.capAt < 5000, capMs: CAP_MS, realDecodeMs: state.realMs, capCalls: state.capCalls, error: state.error || null};
 }
 return {CAP_MS, OS, state, rewritePlay, capReport, realStats, info};
})();

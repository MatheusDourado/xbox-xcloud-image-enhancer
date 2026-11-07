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

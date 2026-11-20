# How far a WebView-based xCloud post-processor can go, and hybrid alternatives

Scope: the xCloud Enhanced Android WebView app (com.imagefilter.xcloud) on a Poco F7 (Snapdragon 8s Gen 4, Adreno 825, HyperOS). Research date: 2026-11-20. About 17 tool calls were used. Several items could not be confirmed from primary sources and are listed under Gaps.

## 1. Chromium/WebView features (WebCodecs, MSTP, rVFC, WebGPU external textures, jitter buffer, encoded transforms, canvas hints)

### Takeaway
The useful web-platform levers exist in Chromium. Two can be set from JS today with no native work: `jitterBufferTarget` (Chrome 124+) and WebGL context hints. `MediaStreamTrackProcessor` (MSTP) gives `VideoFrame`s, which can be imported into WebGPU with `importExternalTexture` and drawn without a CPU copy. Its WebView availability and window-vs-worker exposure must be checked on the device. WebGPU on Android is officially Adreno/Mali on Android 12+. WebView coverage arrived later than Chrome's, and the primary sources disagree on when.

### Cited Findings
- MSTP/VideoTrackGenerator ("breakout box") produce and consume `VideoFrame`s via WHATWG streams. Chrome's article says insertable streams for MediaStreamTrack are supported from Chrome 94 and feature-detects on `window`. It says nothing about Android or WebView specifically — [Chrome for Developers](https://developer.chrome.com/docs/capabilities/web-apis/mediastreamtrack-insertable-media-processing)
- The W3C spec exposes MSTP only in dedicated workers. MDN warns that "browsers differ on which global context they expose this interface in (e.g., only window in some browsers and only dedicated worker in others)". The window-exposed variant "blocks on the main thread" — [MDN MediaStreamTrackProcessor](https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrackProcessor); [W3C mediacapture-transform](https://www.w3.org/TR/mediacapture-transform)
- caniuse marks the MSTP constructor as "Partial support" on Chrome for Android. The data I could get did not include a WebView Android value — [caniuse](https://caniuse.com/mdn-api_mediastreamtrackprocessor_mediastreamtrackprocessor)
- A later blink-dev intent (MSTP frame counters) states support on all six Blink platforms, including Android WebView. That implies MSTP itself is present in WebView, but the thread is about a sub-feature — [blink-dev: MSTP frame counters](https://groups.google.com/a/chromium.org/g/blink-dev/c/VEWxjnESgho)
- WebGPU on Android: "enabled by default in Chrome 121 on devices running Android 12 and greater powered by Qualcomm and ARM GPUs" — [Chrome blog: New in WebGPU 121](https://developer.chrome.com/blog/new-in-webgpu-121)
- The WebGPU-on-Android intent: DevTrial behind a flag since M111, shipping est. M121, initially Adreno and Mali on Android 12+. Asked whether the feature ships on all six Blink platforms including WebView, it answers "No" (the WebView answer is ambiguous) — [blink-dev: Intent to Ship WebGPU on Android](https://groups.google.com/a/chromium.org/g/blink-dev/c/YFWuDlCKTP4)
- Later WebGPU intents list Android WebView explicitly. Texture formats tier1/tier2 lists shipping on Android, Android WebView and desktop at M142 (late 2025). Compatibility mode (an OpenGL ES 3.1 subset) lists Android and WebView at M146. The 'core-features-and-limits' intent (est. M139) listed Android WebView as not yet covered — [Texture formats tiers](https://groups.google.com/a/chromium.org/g/blink-dev/c/4RXrc7Z5rto); [Compatibility mode](https://groups.google.com/a/chromium.org/g/blink-dev/c/N3RlLGCOTJ4); [core-features-and-limits](https://groups.google.com/a/chromium.org/g/blink-dev/c/8Fy8vnSyNic)
- 2023 community report: without the flag, Android System WebView did not support WebGPU. This is dated — [tfjs issue #7910](https://github.com/tensorflow/tfjs/issues/7910)
- WebCodecs integration with WebGPU: `importExternalTexture()` accepts a WebCodecs `VideoFrame` (Chrome 116). Chrome 121 added an experimental `display-p3` destination color space for external textures, behind the developer-features flag — [New in WebGPU 116](https://developer.chrome.com/blog/new-in-webgpu-116); [New in WebGPU 121](https://developer.chrome.com/blog/new-in-webgpu-121)
- `RTCRtpReceiver.jitterBufferTarget` is supported from Chrome 124 (desktop and Android). It sets the preferred milliseconds the jitter buffer holds media. It is "essentially a rename of the already shipped playoutDelayHint" — [MDN jitterBufferTarget](https://developer.mozilla.org/en-US/docs/Web/API/RTCRtpReceiver/jitterBufferTarget); [blink-dev Intent to Ship jitterBufferTarget](https://groups.google.com/a/chromium.org/g/blink-dev/c/bReU8otUmdk); [discuss-webrtc status thread](https://groups.google.com/g/discuss-webrtc/c/rYPwaAHxs-4)
- Chromium also has an Intent to Ship for H.265 (HEVC) in WebRTC. This matters if xCloud ever negotiates HEVC — [blink-dev HEVC in WebRTC](https://groups.google.com/a/chromium.org/g/blink-dev/c/3h8lL8a377c)

### Inferences
- The lowest-copy pure-web path is: WebRTC track → MSTP in a dedicated worker → `VideoFrame` → WebGPU `importExternalTexture` (no `copyExternalImageToTexture`) → render to an OffscreenCanvas transferred from the visible canvas. The WebGL2 equivalent is `texImage2D(VideoFrame)`. Chromium can often back this with a GPU-to-GPU copy rather than a true alias, so "zero copy" is not guaranteed.
- Because WebGPU on Adreno is reported slower than WebGL2 in this project, `importExternalTexture` only helps if the per-frame upload is the bottleneck. A/B the import cost alone (empty shader) before migrating the effect chain.
- `jitterBufferTarget = 0` on the video receiver (already a common xCloud-userscript trick) is the only supported knob for decoder-side latency. Nothing exposes decoder internals: no MediaCodec low-latency key and no output-surface control.
- Encoded transforms (RTCRtpScriptTransform) would hand over encoded frames for self-decoding with WebCodecs `VideoDecoder`, which gives direct frame timing. This path was not confirmed for WebView in this session.

### Gaps
- No primary source confirmed the WebView Android row for MSTP, or whether the WebView build exposes it on window or worker. Test with `'MediaStreamTrackProcessor' in self` inside a worker on the target WebView version.
- I did not verify these, so they are not stated as facts: `requestVideoFrameCallback` WebView status, `desynchronized: true` behavior on Android (whether it bypasses the compositor), Chromium's SharedImage/AHardwareBuffer behavior for WebRTC frames in WebView, encoded transform availability in WebView, and WebGL `powerPreference` effect on Android.
- I found no published benchmark of WebGPU vs WebGL2 on Adreno 8xx. The project's own measurement is the best evidence.
- Sources conflict on whether WebGPU is on by default in Android WebView. Check `navigator.gpu` and `requestAdapter()` on the device.

## 2. Can the host app set refresh rate for the WebView window? HyperOS? WebView frame-rate voting

### Takeaway
The host app does have levers: `WindowManager.LayoutParams.preferredRefreshRate`/`preferredDisplayModeId` on the Activity window, `View.setRequestedFrameRate()` on the WebView itself (Android 15+ ARR), and `Surface/SurfaceControl.setFrameRate()` for SurfaceViews the app owns. They are all hints, and the platform has the final word. On Android 15+ the vote that matters for WebView content is the WebView View's vote. Forcing 60 Hz needs `preferredDisplayModeId` (a 60 Hz mode) or a vote of 60 with no higher votes present. Whether HyperOS honors these could not be confirmed.

### Cited Findings
- "Applications and games can influence the refresh rate via various methods, but the ultimate decision is made by the platform." `preferredDisplayModeId` is advised only when `setFrameRate` is unavailable or a specific mode is needed — [Android Developers Blog 2020](https://android-developers.googleblog.com/2020/04/high-refresh-rate-rendering-on-android.html)
- `preferredRefreshRate` "sets a preferred frame rate on the app's window, and the rate is applicable to all the surfaces within the window". It is ignored for Surfaces that use `setFrameRate()`. Use `preferredDisplayModeId` when the app "can't handle the display running at a multiple of the app's frame rate" or wants a heavy mode switch — [Android frame rate guide](https://developer.android.com/media/optimize/performance/frame-rate)
- The platform may run at a multiple of the requested rate (60 → 120 Hz). Battery saver or higher-priority surfaces can prevent a switch. Apps can verify with `DisplayManager.registerDisplayListener` and should set presentation timestamps (`EGL_ANDROID_presentation_time`, `ASurfaceTransaction_setDesiredPresentTime`, `VK_GOOGLE_display_timing`) — [Android frame rate guide](https://developer.android.com/media/optimize/performance/frame-rate)
- The guide gives a games example: `Surface.setFrameRate(60, FRAME_RATE_COMPATIBILITY_DEFAULT)` makes a 90 Hz device run at 60 Hz while the game is active — [Android frame rate guide](https://developer.android.com/media/optimize/performance/frame-rate)
- Android 15 ARR: each View votes, but only while it redraws. "The final frame rate is determined by the highest vote". Most Views default to "Normal" (about 60 Hz). Touch boost, window transitions and animations raise it to "High". Explicit SurfaceView/TextureView frame rates are respected. `Window.setFrameRateBoostOnTouchEnabled(false)` disables touch boost and `Window.setFrameRatePowerSavingsBalanced(false)` disables ARR. ARR requires Android 15-QPR1+ and HAL support (`Display.hasArrSupport()`) — [Android ARR guide](https://developer.android.com/develop/ui/views/animations/adaptive-refresh-rate)
- Developer reports (not authoritative): on Android 15+, a vote on the WebView is what ARR listens to. One game-streaming app sets `preferredDisplayModeId`, falls back to `preferredRefreshRate`, then adds a WebView vote, and reapplies after fold/unfold and resume. Its author notes OEM features (Samsung Motion smoothness, battery saver, Game Booster) can override it — [game-scroll PR #124](https://github.com/robthewizzuk/game-scroll/pull/124). Another report: a View that invalidates without a vote gets NORMAL (60 Hz on high-refresh panels) — [BiliPai PR #57](https://github.com/whisperers26/BiliPai/pull/57)
- Logs show WebView calling `setRequestedFrameRate` with a negative value (a category constant), which suggests WebView votes internally — [home-assistant/android #5286](https://github.com/home-assistant/android/issues/5286)
- Chromium has a helper for whether tagging a surface with a frame rate is supported (`android_surface_control_compat`) — [Chromium source](https://chromium.googlesource.com/chromium/src/+/b71e68fbe81456b4669750c8b1655d391d822036/ui/gfx/android/android_surface_control_compat.h)
- Older (around 2021) user reports: Chromium browsers stuttered on 120 Hz phones until the "Android SurfaceControl" flag was disabled — [Opera forum](https://forums.opera.com/topic/52007/scrolling-stutters-on-120hz-screens)

### Inferences
- For "lock 60 Hz during streaming", the most deterministic option is to pick the 60 Hz `Display.Mode` from `display.supportedModes` and set `window.attributes.preferredDisplayModeId`. Also call `webView.setRequestedFrameRate(60f)` on API 35+, and consider disabling touch boost while streaming. Then confirm with a DisplayListener or `display.refreshRate` and log it in the app, because HyperOS may override (game turbo, the system refresh setting).
- Votes are combined by "highest wins". A 60 Hz WebView vote does not lower the rate if anything else (touch boost, overlays, a SurfaceView at 120) votes higher. `preferredDisplayModeId` is the stronger tool for capping.
- The 9 → 25 ms decode inflation at 120 Hz may come from vsync-paced compositing and buffer queueing rather than the decoder itself. Capping at 60 Hz is cheap to test from Kotlin before any architecture change.

### Gaps
- No source on how HyperOS (Xiaomi) treats `preferredDisplayModeId`/`setRequestedFrameRate`, or whether its per-app refresh settings or Game Turbo override them. This needs an on-device test (`adb shell dumpsys SurfaceFlinger | grep -i refresh` and `dumpsys display`).
- No Chromium source found that documents WebView's default vote category, or whether Chromium sets frame rate on its own SurfaceControl in WebView.

## 3. Alternatives to system WebView (GeckoView, custom Chromium/WebView providers, Capacitor/Tauri)

### Takeaway
Swapping engines buys flags, not new APIs. A Chromium WebView provider such as Thorium WebView or Mulch, selected per app as Better xCloud's Android app does, lets you enable features like `WebViewSurfaceControl`. On user builds, though, WebView command-line flags are not app-settable through a public API. GeckoView has a different and less game-streaming-proven WebRTC/media stack. Capacitor and Tauri mobile both sit on the system WebView, so they add no control.

### Cited Findings
- Chromium WebView reads flags from `/data/local/tmp/webview-command-line` regardless of provider package, but only on `userdebug`/`eng` builds. On `user` builds, use WebView DevTools (flags UI) or reflash — [Chromium android_webview commandline-flags.md](https://chromium.googlesource.com/chromium/src/+/HEAD/android_webview/docs/commandline-flags.md)
- The Better xCloud Android app's "Optimize WebView performance" sets these WebView flags: `ignore-gpu-blocklist` (Enabled), `WebViewThreadSafeMedia` (Enabled), `WebViewSurfaceControl` (Enabled), `WebViewSurfaceControlForTV` (Enabled), `WebRtcCombinedNetworkAndWorkerThread` (Disabled) — [Better xCloud: Android WebView tweaks](https://better-xcloud.github.io/guide/android-webview-tweaks)
- The Better xCloud app can switch WebView implementation per app (Android System WebView, Thorium, DivestOS Mulch WebView) via its WebView Manager. The change only affects that app, and a force-close is needed — [Better xCloud: WebView implementation](https://better-xcloud.github.io/guide/android-webview-implementation)
- GeckoView/Firefox Android media in 2026: decode/encode now prefers the GPU process on Android (Bug 2080180), with MediaCodec 10-bit and max-size reporting (Bug 2082956) and FFmpegVideoDecoder hardware decoding on Android (Bug 1934009). Older GeckoView had WebRTC H.264 failures on some SoCs (Amlogic) — [Bug 2080180](https://bugzilla.mozilla.org/show_bug.cgi?id=2080180); [Bug 2082956](https://bugzilla.mozilla.org/show_bug.cgi?id=2082956); [Bug 1934009](https://bugzilla.mozilla.org/show_bug.cgi?id=1934009); [Bug 1927064](https://bugzilla.mozilla.org/show_bug.cgi?id=1927064)
- Firefox WebGPU on Android was reportedly still limited to pre-release builds as of August 2026 (secondary source) — [Wikipedia: WebGPU](https://en.wikipedia.org/wiki/WebGPU)

### Inferences
- How Better xCloud applies flags on user builds is not documented. It likely writes WebView DevTools-style flag overrides, or loads a bundled or third-party provider. xCloud Enhanced could copy the approach, but it means depending on the WebView provider's internal flag mechanism, which is not a stable API.
- A self-built Chromium (content shell or a fork as an embedded engine) gives full control: disable vsync-aligned BeginFrame throttling, expose decoder hooks, set MediaCodec `KEY_LOW_LATENCY`. It costs about 100–200 MB of APK, a Chromium build pipeline and security updates. In effort, that is close to a native client.
- GeckoView loses Chromium-specific APIs the project uses (MSTP on window, the WebGL2 performance profile) and lacks WebGPU on Android stable. It is not a good trade.

### Gaps
- No Thorium/Cromite/Kiwi WebView docs on which features or flags they enable by default or how apps select them. Kiwi was discontinued around 2025 (from training data, not verified).
- No evidence found on how xCloud on GeckoView performs (UA checks, codec negotiation).

## 4. Hybrid: WebView for login/signaling + native GL/Vulkan rendering; JS↔native bridge; overlay path; intercepting the WebRTC track natively

### Takeaway
WebView offers no API to get a WebRTC track, decoder output or frame buffer from native code, and none was found. Raw frames would have to cross the JS bridge as ArrayBuffers (`WebMessageCompat` TYPE_ARRAY_BUFFER), which means CPU readback plus copies. That is too slow for 1080p60, by inference. The viable hybrid is to move WebRTC itself to native: keep the WebView for login and tokens, then run the xCloud signaling and the PeerConnection in native code (libwebrtc), decode with MediaCodec into a SurfaceTexture or AImageReader, and post-process in GLES/Vulkan on a SurfaceView with explicit `setFrameRate`.

### Cited Findings
- `WebMessageCompat` supports ArrayBuffer payloads (androidx.webkit 1.8.0+, feature `WEB_MESSAGE_ARRAY_BUFFER`). Callbacks run on the main thread unless a Handler is supplied — [WebMessageCompat](https://developer.android.com/reference/androidx/webkit/WebMessageCompat); [WebMessagePortCompat](https://developer.android.com/reference/androidx/webkit/WebMessagePortCompat)
- Historically, WebView always disabled the fullscreen SurfaceView video path (ContentVideoView), and the zero-copy media decode pipeline failed in WebView, requiring texture copies during composition — [crbug 40454369](https://issues.chromium.org/issues/40454369); [codereview 1655083002](https://codereview.chromium.org/1655083002)
- Chromium has a `force-video-overlays` flag (SurfaceView instead of SurfaceTexture for media). Newer Chromium prefers ImageReader (AImageReader) over SurfaceTexture where possible, but disables it on some GPUs. This comes from a Mozilla discussion of Chromium, so it is secondary — [Mozilla Bug 1529629](https://bugzilla.mozilla.org/show_bug.cgi?id=1529629)
- `ASurfaceTransaction_setBuffer` with an AHardwareBuffer allows direct overlay without an extra EGL copy, while ANativeWindow needs an EGL copy — [Mozilla Bug 1529629](https://bugzilla.mozilla.org/show_bug.cgi?id=1529629)
- A native SurfaceView's explicit frame rate is respected under ARR, and `SurfaceControl.Transaction.setFrameRate` is API 30+ — [Android ARR guide](https://developer.android.com/develop/ui/views/animations/adaptive-refresh-rate); [SurfaceControl.Transaction](https://developer.android.com/reference/android/view/SurfaceControl.Transaction)

### Inferences
- Bridge bandwidth: 1920×1080 RGBA is about 8.3 MB per frame, or about 500 MB/s at 60 fps, plus `getImageData`/`readPixels` readback and main-thread delivery. This is infeasible as a per-frame path. The bridge is fine for control messages (stats, settings, input).
- "Native overlay under a transparent WebView" works for UI layering: SurfaceView behind, WebView with a transparent background on top for the touch controls and menus. The pixels still have to originate natively, so the native side must own the stream.
- Native ownership needs xCloud's session/signaling protocol (the REST endpoints for `/sessions/cloud/play`, SDP/ICE exchange) driven with tokens captured from the logged-in WebView, for example via `CookieManager` or a JS hook posting the auth token. Open-source xCloud clients (Greenlight, xbPlay) implement this protocol. That makes it a "native client with a web login", which is effectively the native rewrite for the media path, though UI and login stay web.
- Intermediate option: keep everything in WebView but cap refresh at 60 Hz from Kotlin, set `jitterBufferTarget=0`, use the MSTP→worker→OffscreenCanvas path, and enable `WebViewSurfaceControl` via a provider. These may close much of the gap before any native media work.

### Gaps
- No primary source found (Chromium docs or androidx) that explicitly states WebView cannot expose a MediaStreamTrack or decoder surface to the host app. This is inferred from the absence of any such API in androidx.webkit or android.webkit.
- No benchmarks for WebMessagePort ArrayBuffer throughput.

## 5. Better xCloud Android and similar wrappers: tricks used

### Takeaway
Better xCloud's Android app is a WebView "mini browser" with the userscript built in. Its tricks are per-app WebView provider switching (Thorium/Mulch), a flag set (`WebViewSurfaceControl`, `ignore-gpu-blocklist`, `WebViewThreadSafeMedia`, disabling `WebRtcCombinedNetworkAndWorkerThread`), an Android TV User-Agent (enables 1080p/High), disabled analytics, and a WebGL2 renderer fallback. I found no documented refresh-rate control in it.

### Cited Findings
- "It's a mini browser (WebView) that displays the xCloud website," with the Better xCloud userscript integrated, and it supports all Better xCloud features — [Telegram announcement](https://t.me/s/betterxcloud/84); [GitHub redphx/better-xcloud-android](https://www.github.com/redphx/better-xcloud-android)
- Optimize WebView performance (off by default) applies the flag list in section 3. It is recommended for Android TV. The guide also recommends User-Agent "Android TV", "Disable xCloud analytics", and Video renderer → WebGL2 if still unplayable (helps on TCL TVs) — [Android WebView tweaks](https://better-xcloud.github.io/guide/android-webview-tweaks); [a0.10.0 release](https://newreleases.io/project/github/redphx/better-xcloud-android/release/a0.10.0)
- Source code was to be shared after stable 1.0. Releases are past a0.24 / a0.18 betas — [ecosyste.ms listing](https://awesome.ecosyste.ms/projects/github.com%2Fredphx%2Fbetter-xcloud-android); [a0.18.0-beta](https://newreleases.io/project/github/redphx/better-xcloud-android/release/a0.18.0-beta)
- Other game-streaming wrappers on Android 15+ combine `preferredDisplayModeId`, `preferredRefreshRate` and a WebView `setRequestedFrameRate` vote — [game-scroll PR #124](https://github.com/robthewizzuk/game-scroll/pull/124)

### Inferences
- `WebViewSurfaceControl` lets WebView composite through SurfaceControl rather than the app's HWUI draw functor. That could reduce compositor latency and decouple frame timing, which is directly relevant to the 120 Hz decode inflation. It is worth an A/B on the Poco F7, but it needs a provider or flag mechanism like Better xCloud's.
- `WebRtcCombinedNetworkAndWorkerThread` disabled separates the WebRTC network and worker threads, which can reduce jitter under load. This interpretation comes from the feature name only.

### Gaps
- No primary info found on "xbPlay" or other "XCloud Android" GitHub wrappers' internals (hardware decoding flags, refresh rate) in this session.
- Better xCloud Android source is not public, so the exact flag-application mechanism on user builds is unconfirmed.

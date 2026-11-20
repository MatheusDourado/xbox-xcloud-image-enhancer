# Native xCloud clients and the xCloud streaming protocol: could a native Android client work?

Research date: 2026-11-20. Repo facts come from the GitHub API and a shallow clone of Geocld/XStreaming (HEAD 2026-11-20, v2.12.1). Older items are flagged.

## Q1. Open-source native/desktop xCloud clients: which stack do they use, and are they maintained in 2025-2026?

### Takeaway
XStreaming (Geocld) is the only actively maintained open-source client that streams through a real native WebRTC stack on Android. It does auth natively, receives video through react-native-webrtc (libwebrtc Android) with a custom MediaCodec low-latency decoder factory, and adds an experimental Rust webrtc-rs engine called "nano-rs". Greenlight and XStreamingDesktop are Electron/Chromium apps, and Better xCloud is a userscript. In short, the hybrid or native approach the project is weighing already exists and is MIT-licensed.

### Cited Findings
- **Geocld/XStreaming:** Android/iOS/HarmonyOS client, TypeScript/React Native. Last pushed 2026-11-20, releases v2.12.1 (2026-11-20), v2.12.0 (2026-11-02), v2.11.0 (2026-10-08). So it is very active. — [GitHub repo](https://github.com/Geocld/XStreaming)
- **XStreaming dependencies:** `react-native-webrtc` 124.0.5 (libwebrtc Android M124) and `react-native-webview` ^13.10.2. — [package.json](https://github.com/Geocld/XStreaming/blob/main/package.json)
- **XStreaming "dual render engines":** the WebView engine is the default, and a "Native" engine plays video through Android's native renderer. Users switch to Native when WebView < 91 shows a black screen. — [README](https://github.com/Geocld/XStreaming)
- **XStreaming extras:** FSR 1 upscaling, LSFG-based frame generation (30→60 / 60→120 fps "on Snapdragon devices", needs the user's own Lossless.dll), 1080P/1080P(HQ). — [README](https://github.com/Geocld/XStreaming)
- **XStreaming native decoder:** `android/app/src/main/java/com/xstreaming/webrtc/LowLatencyVideoDecoderFactory.java` wraps react-native-webrtc's `H264AndSoftwareVideoDecoderFactory`. For H264/H265/HEVC it returns a `LowLatencyVideoDecoder`. — [source](https://github.com/Geocld/XStreaming/tree/main/android/app/src/main/java/com/xstreaming/webrtc)
- **MediaCodec keys set by `LowLatencyVideoDecoder`:**
  - generic: `low-latency=1`, `priority=0`, `operating-rate`
  - Qualcomm: `vendor.qti-ext-dec-picture-order.enable`, `vendor.qti-ext-dec-low-latency.enable`
  - plus HiSilicon, Samsung (`vendor.sec.dec.*`), Amlogic, NVIDIA and MediaTek equivalents

  This is the same "custom VideoDecoderFactory over libwebrtc Android" pattern the project is considering. — [LowLatencyVideoDecoder.java](https://github.com/Geocld/XStreaming/blob/main/android/app/src/main/java/com/xstreaming/webrtc/LowLatencyVideoDecoder.java)
- **XStreaming `nano-rs`:** a Rust crate built as a cdylib with JNI on Android. It depends on `webrtc`/`rtp`/`rtcp`/`webrtc-media` 0.17.2 (webrtc-rs), `reqwest` and `tokio`. Modules: `signaling.rs`, `session.rs`, `video_sink.rs`, `channels/{control,input,message,chat}.rs`. Java side: `nano/NanoMediaCodecHelper.java` (probes the MediaCodec `low-latency` feature), `NanoRustBridge.java`, `NanoStreamView.java`. Commits Jul–Sep 2026 ("optimize nano RTP", "optimize nano render", "optimize nano resolution", Opus/USAGE_GAME audio fix 2026-09-06). — [nano-rs](https://github.com/Geocld/XStreaming/tree/main/nano-rs), [commits](https://github.com/Geocld/XStreaming/commits/main/nano-rs)
- **XStreaming native auth:** native XAL (`XalManager.java`) plus documented auth/web/stream flows in `docs/1.Auth.md`, `docs/2.Web.md`, `docs/3.Stream.md`. — [docs](https://github.com/Geocld/XStreaming/tree/main/docs)
- **Geocld/XStreamingDesktop:** v1.10.3, pushed 2026-11-02. Electron 37 + nextron, so it uses Chromium's WebRTC. — [package.json](https://github.com/Geocld/XStreamingDesktop/blob/main/package.json)
- **unknownskl/greenlight:** TypeScript desktop client (Linux/macOS/Windows/Steam Deck), ~3.0k stars, 235 open issues. Branch `main-v2`, monorepo `packages/desktop-v3`. Releases v2.4.0 (2025-12-10), v2.4.1 (2025-12-11), v2.4.2 (2026-06-05); last push 2026-11-16. Described as a "wrapper around xbox-xcloud-player". — [GitHub](https://github.com/unknownskl/greenlight), [Flathub](https://flathub.org/apps/io.github.unknownskl.greenlight)
- **unknownskl/xbox-xcloud-player:** a library that uses the browser `RTCPeerConnection` (`new RTCPeerConnection({})`, `videoTransceiver.setCodecPreferences(...)`). It therefore needs a Chromium/browser runtime and is not native. Last push 2025-11-04. — [src/player.ts](https://github.com/unknownskl/xbox-xcloud-player/blob/main/src/player.ts)
- **redphx/better-xcloud:** a userscript, last push 2026-11-18, still active. — [GitHub](https://github.com/redphx/better-xcloud)
- **LunarNX:** recommended by XStreaming's README as a native client running inside Atmosphere on Nintendo Switch. It does console streaming plus xCloud, max 1080p HQ. — [XStreaming README](https://github.com/Geocld/XStreaming), [LunarNX](https://github.com/thinkzhou/LunarNX)

### Inferences
- For the Poco F7, the closest working reference is XStreaming's Native engine: libwebrtc Android + a custom decoder factory + MediaCodec with QTI low-latency keys. Forking or studying it is far cheaper than writing a client from scratch.
- Greenlight and XStreamingDesktop gain nothing at the codec level over a browser, because they run Chromium's WebRTC.

### Gaps
- I did not verify whether XStreaming's Native engine is used for xCloud or only for xHome by default, or how nano-rs compares in quality and latency.
- I did not check xbPlay or xHome (closed-source / paid apps).
- I found no other standalone Rust or C++ xCloud client besides nano-rs and LunarNX.

## Q2. Protocol details: auth, session API, SDP/ICE, data channels, negotiation, server caps (1440p/4K, HEVC/AV1)

### Takeaway
The stack has five layers:
1. Xbox Live auth (device token + SISU, signed requests).
2. A gsToken for the `*.gssv-play-prod*.xboxlive.com` hosts.
3. REST `/v5/sessions/{cloud|home}/play`.
4. SDP offer/answer and ICE exchanged over REST.
5. WebRTC with four data channels.

The server decides resolution from the declared client `osName` plus the `dimensionschanged` message: `android` gives 720p, `windows` gives 1080p, and `tizen` gives "1080p HQ / 1440p". Since late 2025 Ultimate members can get up to 1440p and ~17–27 Mb/s on supported devices. Open-source clients still offer only H.264, at best Main profile (`4d`). HEVC/AV1/VP9 options exist in XStreaming but are commented out, and no reliable source shows xCloud serving them.

### Cited Findings

**Auth**
- Login uses the official Microsoft login URL and an `ms-xal-` redirect with code+state, plus PKCE (S256).
- Requests are signed with ECDSA P-256 over windowsTimestamp + method + path + auth + body (`signature` header).
- The device token comes from `https://device.auth.xboxlive.com/device/authenticate` (`DeviceType: 'Android'`, ProofOfPossession), followed by SISU authentication.

— [XStreaming docs/1.Auth.md](https://github.com/Geocld/XStreaming/blob/main/docs/1.Auth.md)

**Session start**
- `POST {host}/v5/sessions/{home|cloud}/play` (e.g. `uks.core.gssv-play-prodxhome.xboxlive.com`) with `Authorization: Bearer <gsToken>` and an `X-MS-Device-Info` JSON header.
- Body settings: `nanoVersion: 'V3;WebrtcTransport.dll'`, `sdkType: 'web'`, `osName`, plus `titleId` (cloud) or `serverId` (home).
- Then poll `/state` until `Provisioned`, `GET /configuration`, `POST /sdp` (`messageType: 'offer'`), then the `/ice` exchange.

— [XStreaming docs/3.Stream.md](https://github.com/Geocld/XStreaming/blob/main/docs/3.Stream.md)

**Resolution spoof (in XStreaming's own code)**
- `osName = 'android'` for 720, `'windows'` for 1080, `'tizen'` for 1081 ("1080p-HQ").
- Code comment: `// name: 'tizen', // 1080P(HQ) or 1440P`.
- `X-MS-Device-Info` declares `clientAppId: 'www.xbox.com'`, `clientAppType: 'browser'`, `browserName: 'edge'` and `displayInfo` 4096×2160.

— [src/xCloud/index.ts](https://github.com/Geocld/XStreaming/blob/main/src/xCloud/index.ts). nano-rs repeats this mapping in `os_name_for_resolution` (`1081 | 1440 => "tizen"`) and defaults to 1920×1080, 60 fps, `bitrate_kbps: 20_000`, `CodecProfile::Auto`. — [nano-rs/src/protocol.rs](https://github.com/Geocld/XStreaming/blob/main/nano-rs/src/protocol.rs)

**`dimensionschanged` (message channel)**
- Target `/streaming/characteristics/dimensionschanged` with `{horizontal, vertical, preferredWidth, preferredHeight, safeArea*, supportsCustomResolution: true}`.
- XStreaming sends 2560×1440 for its HQ/1440 setting, 1280×720 for 720, and 1920×1080 otherwise.
- Other messages sent on the same channel: `orientationchanged`, `touchinputenabledchanged`, `clientdevicecapabilities`.

— [src/webrtc/Channel/Message.ts](https://github.com/Geocld/XStreaming/blob/main/src/webrtc/Channel/Message.ts)

**Resolution-change messages (Greenlight issue)**
- A Greenlight issue (2026-11-04) says the official web client changes resolution with control-channel messages `VideoPreference` and `userRequestedResolutionUpdate`.
- It also says the console streams 2560×1440 when its display output is 1440p/4K ("Remote Play 1440p, October 2026 update").
- The source is a single user report. — [greenlight#1751](https://github.com/unknownskl/greenlight/issues/1751)

**Data channels**

| Channel | Protocol | Notes |
|---|---|---|
| `input` | `'1.0'` | ordered |
| `chat` | `chatV1` | |
| `control` | `controlV1` | ordered |
| `message` | `messageV1` | |

Supported version ranges: chat 1–1, control 1–3, input 1–8, message 1–1. The chat format is Opus/webm, 24 kHz mono. — [src/webrtc/index.ts](https://github.com/Geocld/XStreaming/blob/main/src/webrtc/index.ts), [protocol.rs](https://github.com/Geocld/XStreaming/blob/main/nano-rs/src/protocol.rs)

**Control-channel messages**
- `authorizationRequest` with a fixed `accessKey: '4BDB3609-C1F1-4195-9B37-FEFF45DA8B8E'`
- `gamepadChanged`
- `videoKeyframeRequested {ifrRequested}`, which can be sent periodically

— [xbox-xcloud-player src/channel/control.ts](https://github.com/unknownskl/xbox-xcloud-player/blob/main/src/channel/control.ts)

**Codec choice in XStreaming**
- Offered: `Auto`, `video/H264-4d` (labelled "H264-High", but `4d` = Main profile), `video/H264-42e` (Baseline), `video/H264-420`.
- `AV1`, `VP9`, `H265`, `VP8`, `flexfec`, `ulpfec`, `rtx`, `red` are all commented out.
- `NativeStream.tsx` rewrites `profile-level-id` in the H.264 fmtp lines.

— [src/common/settings/display.ts](https://github.com/Geocld/XStreaming/blob/main/src/common/settings/display.ts)

**XStreaming's in-app resolution tips (en.ts)**
- "1080P(HQ) supports bitrates of at least 15 Mbps."
- "Microsoft is currently adjusting xCloud resolution policies. Some games currently support only 720P/1440P for Xbox Game Pass Ultimate members."
- "Due to Microsoft protocol restrictions, the Microsoft Store cannot be used normally during console streaming in 1080P(HQ)/1440P mode."

— [src/languages/en.ts](https://github.com/Geocld/XStreaming/blob/main/src/languages/en.ts)

**Better xCloud corroboration**
- Issue #812 (2025-10-04), on Edge with Ultimate: choosing 1080p or 1080p HQ "goes to 1440p"; only 720p works as chosen. — [better-xcloud#812](https://github.com/redphx/better-xcloud/issues/812)
- **(older, Dec 2024)** The Samsung Smart TV UA profile gave peaks of ~20 Mb/s (vs the 15 Mb/s cap) when target resolution and quality were left at "default". Added in Better xCloud 6.0.0-beta-3. — [better-xcloud#579](https://github.com/redphx/better-xcloud/issues/579)

**Official service status**
- Xbox Cloud Gaming is out of beta. 1440p "higher bitrate streaming" for Game Pass Ultimate was on select Fire TVs, LG TVs, Samsung TVs, web browsers and the Xbox PC app, and reached Series X|S / One X / One S on 2026-02-25. No bitrate figures and no mobile mention. — [Xbox Wire Feb 2026](https://news.xbox.com/en-us/2026/02/25/february-xbox-update-1440p-streaming-rog-xbox-ally-updates-and-more/), [Engadget](https://www.engadget.com/gaming/xbox/xbox-consoles-now-support-1440p-streaming-204115304.html)
- **Bitrate at the ~Oct 2025 beta exit:** previous average ~10 Mb/s, peaks up to 27 Mb/s, some streams ~17 Mb/s, for "select games and select devices". This is secondary reporting. — [TechBuzz](https://techbuzz.ai/articles/xbox-cloud-gaming-exits-beta-with-1440p-streaming-upgrade); Digital Foundry confirmed 1440p in Avatar (Sep 2025) via [Pure Xbox](https://www.purexbox.com/news/2025/09/xbox-cloud-gaming-quality-bump-shows-dramatic-improvement-says-digital-foundry)
- **Codec claims:** one site says xCloud is "HEVC primary, AV1 in pilot regions" — unverified, weak source, and it conflicts with every open-source client still using H.264 only. — [CloudGaming.Expert](https://cloudgamingexpert.vercel.app/labs/codec-comparison-2026). A May 2026 article covers criticism over the lack of AV1. — [LevelUpTalk](https://leveluptalk.com/news/xcloud-av1-support-issues/)

### Inferences
- The project's 1080p trick (spoofing Windows or a Samsung TV) is the same lever every client uses. The next step up is `osName: 'tizen'` plus `dimensionschanged` 2560×1440 (and possibly `VideoPreference`/`userRequestedResolutionUpdate`) on an Ultimate account. That may yield a 1440p H.264 stream at ~15–27 Mb/s, and it works from a WebView too. Codec and decoder support do not block it: the Snapdragon 8s Gen 4 decodes 1440p60 H.264 trivially.
- No public evidence shows any client type receiving HEVC, AV1, VP9, H.264 High or 4K from xCloud. A native client would therefore most likely get the same streams as the web client. Its gains would be in decode latency and pacing, local upscaling (FSR or a custom shader on raw frames), and frame generation, not in better source pixels.
- The project's earlier result that "xCloud refused H.264 High" matches XStreaming's codec list, which tops out at `4d` (Main).

### Gaps
- No source documents the exact QoS/decode-time feedback message. I found only XStreaming computing decode time locally from `getStats().totalDecodeTime`; I did not find what it reports to the server.
- No confirmation that `tizen` + 1440 works on an Android client or WebView today.
- No primary Microsoft source on the codec or exact bitrate ceilings.
- Meta Quest and Fire TV codec details were not found.

## Q3. Legal/ToS and maintenance risk

### Takeaway
Third-party clients technically breach several clauses of the Microsoft Services Agreement. I found no enforcement against Greenlight, XStreaming or Better xCloud users. The practical risk is breakage when Microsoft changes auth or APIs; historically each break was fixed in weeks.

### Cited Findings
- **Microsoft Services Agreement clauses:**
  - 3.a.vi: "Don't circumvent any restrictions on access to, usage, or availability of the Services".
  - 8.b.ii: no reverse engineering or emulation of the Services.
  - 8.b.vii: no enabling access "by unauthorized third-party applications".
  - 14.a.vii: Microsoft may push updates that block "unauthorized XBOX games or XBOX apps".

  — [Microsoft Services Agreement](https://www.microsoft.com/en-us/servicesagreement)
- **Breakage history:**
  - **(older, 2023)** Greenlight "stuck on getting your stream ready", 53 comments. — [greenlight#896](https://github.com/unknownskl/greenlight/issues/896)
  - 2025-11-13: "Failed to retrieve streaming tokens"; fixed in v2.4.1 on 2025-12-11 (~4 weeks). — [greenlight#1506](https://github.com/unknownskl/greenlight/issues/1506)
  - 2025-11-24: "Cannot Login on 2.3.3". — [greenlight#1513](https://github.com/unknownskl/greenlight/issues/1513)
  - Better xCloud has had recent breakage too, e.g. the virtual controller stopped working (2026-03-21). — [better-xcloud#909](https://github.com/redphx/better-xcloud/issues/909)
- XStreaming's README carries an explicit "not affiliated with Microsoft" disclaimer, and the app ships on the Apple App Store as "PeaSyo" and on Huawei AppGallery. — [README](https://github.com/Geocld/XStreaming)

### Inferences
- A native client adds a new failure surface: auth, signing, device-info contract and data-channel versions all have to be maintained, on top of the existing WebView or userscript layer. Tracking XStreaming upstream reduces this.
- Distributing a client publicly carries more ToS exposure than personal use.

### Gaps
- No documented account bans tied to third-party clients were found. Absence of evidence is not proof.

## Q4. Hybrid approach (WebView/headless for auth or signaling, native decode and render)

### Takeaway
Yes, the hybrid approach is feasible, and XStreaming already ships it. libwebrtc Android (via react-native-webrtc) accepts a custom `VideoDecoderFactory`, so you control MediaCodec flags (QTI low-latency) and get frames as textures/`VideoFrame`s that you can render with your own GL shaders (FSR). The cheaper middle path is to keep the WebView only for login/token capture and run signaling plus WebRTC natively.

### Cited Findings
- XStreaming's `LowLatencyVideoDecoderFactory(EglBase.Context)` implements `org.webrtc.VideoDecoderFactory`, delegates to `H264AndSoftwareVideoDecoderFactory` and wraps the decoder. — [source](https://github.com/Geocld/XStreaming/blob/main/android/app/src/main/java/com/xstreaming/webrtc/LowLatencyVideoDecoderFactory.java)
- XStreaming ships an `RTCFsrVideoViewPackage` (an FSR video view on the native WebRTC path) and a `gl` package. — [java tree](https://github.com/Geocld/XStreaming/tree/main/android/app/src/main/java/com/xstreaming)
- The fully native alternative is nano-rs: webrtc-rs RTP → Java `MediaCodec` via JNI, bypassing libwebrtc. — [nano-rs](https://github.com/Geocld/XStreaming/tree/main/nano-rs)
- The REST signaling is plain HTTPS+JSON, which any HTTP client can drive once a gsToken exists. — [docs/3.Stream.md](https://github.com/Geocld/XStreaming/blob/main/docs/3.Stream.md)

### Inferences
- **Recommended order for "best image on a Poco F7":**
  1. Try `tizen` + 2560×1440 `dimensionschanged` in the existing WebView app (cheapest).
  2. If WebView decode or rendering limits remain, move video to libwebrtc Android with a QTI low-latency MediaCodec factory and a GL upscaler on raw frames, reusing XStreaming's MIT code.
- Native decoding also makes it easy to report a real (low) decode time, which removes the need to spoof it.

### Gaps
- No measurements comparing WebView vs native decode latency or quality on Snapdragon 8s Gen 4.

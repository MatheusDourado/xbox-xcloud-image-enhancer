# Native Android video pipeline for a low-latency, GPU-post-processed cloud-gaming client (Poco F7 / Snapdragon 8s Gen 4 / Adreno 825)

Research date: 2026-11-20. Sources are official Android/Qualcomm docs (current pages), moonlight-android master source, Khronos specs, Chromium source/bug threads. Where a source's date is unknown or old, it is flagged.

## 1. MediaCodec low-latency decode (KEY_LOW_LATENCY, FEATURE_LowLatency, Qualcomm vendor keys, operating-rate/priority) and how Moonlight configures it

### Takeaway
A native client controls the decoder config directly: `low-latency=1` (API 30), Qualcomm `vendor.qti-ext-dec-picture-order.enable` + `vendor.qti-ext-dec-low-latency.enable`, and `KEY_OPERATING_RATE=Short.MAX_VALUE` on Qualcomm. Moonlight-Android applies these with a retry ladder, from most to least risky. WebView exposes none of these knobs. No published ms figure exists for Moonlight decode latency on Snapdragon 8-series. It has to be measured on the device.

### Cited Findings
- `KEY_LOW_LATENCY` ("low-latency") was added in API 30: "If enabled, the decoder doesn't hold input and output data more than required by the codec standards… 1 when low-latency decoding is enabled… default 0." — [MediaFormat reference](https://developer.android.com/reference/android/media/MediaFormat#KEY_LOW_LATENCY)
- `KEY_OPERATING_RATE` (API 23) is "the desired operating frame rate… used by codec for resource planning and setting the operating points". `KEY_PRIORITY` (API 23) takes 0 = realtime and 1 = best effort. `KEY_FRAME_RATE` acts as the operating rate only when `KEY_OPERATING_RATE` is absent and priority is 0. — [MediaFormat reference](https://developer.android.com/reference/android/media/MediaFormat)
- `KEY_IMPORTANCE` (API 35) sets codec reclaim importance within the app. It is not a latency knob. — [MediaFormat reference](https://developer.android.com/reference/android/media/MediaFormat)
- Moonlight `MediaCodecHelper.setDecoderLowLatencyOptions(format, codecInfo, tryNumber)` retries `configure()` with an increasing `tryNumber`. Its comment reads "Options here should be tried in the order of most to least risky." The ladder:
  - try 0: `low-latency=1`. If the codec advertises `FEATURE_LowLatency`, the method returns with only this key set.
  - try < 2: `vdec-lowlatency=1` (MediaTek / Amlogic). The code skips it on Xiaomi devices at SDK ≤ M.
  - try < 3: `KEY_OPERATING_RATE = Short.MAX_VALUE` on Qualcomm (SDK M+, not Adreno 620). Other decoders get `KEY_PRIORITY = 0` instead.
  - Qualcomm (`omx.qcom`, `c2.qti`, SDK O+): try < 4 sets `vendor.qti-ext-dec-picture-order.enable=1`, and try < 5 sets `vendor.qti-ext-dec-low-latency.enable=1`. The code tries both keys first, then the low-latency key alone.
  - Exynos: `vendor.rtc-ext-dec-low-latency.enable`. Kirin: `vendor.hisi-ext-low-latency-video-dec.*`. Amlogic: `vendor.low-latency.enable`.
  — [moonlight-android MediaCodecHelper.java](https://github.com/moonlight-stream/moonlight-android/blob/master/app/src/main/java/com/limelight/binding/video/MediaCodecHelper.java)
- Qualcomm's max operating rate comment in Moonlight: "Operate at maximum rate to lower latency as much as possible on some Qualcomm platforms." The code warns that realtime priority can crash the decoder if the rate can't be met, citing the SD765G and Xiaomi Mi 10 Lite 5G / Redmi K30i 5G on Android 10. — [MediaCodecHelper.java](https://github.com/moonlight-stream/moonlight-android/blob/master/app/src/main/java/com/limelight/binding/video/MediaCodecHelper.java)
- On SDK S+ (31), Moonlight instantiates a real codec and calls `getSupportedVendorParameters()` to check which vendor keys exist. Comment: "we have to create an actual codec instance to get supported options." — [MediaCodecHelper.java](https://github.com/moonlight-stream/moonlight-android/blob/master/app/src/main/java/com/limelight/binding/video/MediaCodecHelper.java)
- Some Qualcomm devices ship separate low-latency decoder components, e.g. `c2.qti.hevc.decoder.low_latency`, which "advertise FEATURE_LowLatency while the standard ones… do not". Moonlight's `findKnownSafeDecoder()` prefers FEATURE_LowLatency decoders in its first pass. — [MediaCodecHelper.java](https://github.com/moonlight-stream/moonlight-android/blob/master/app/src/main/java/com/limelight/binding/video/MediaCodecHelper.java)
- Other Moonlight latency logic:
  - `decoderCanDirectSubmit()` lets the receive thread feed the codec directly on fast decoders.
  - Reference-frame invalidation is enabled when a low-latency option is supported.
  - Low-end Snapdragon parts (Adreno x0x) get no AVC RFI above 720p.
  — [MediaCodecHelper.java](https://github.com/moonlight-stream/moonlight-android/blob/master/app/src/main/java/com/limelight/binding/video/MediaCodecHelper.java)
- Upstream release note v4.8.1 (old, roughly 2017): "Reduce decoder latency on Qualcomm devices running Android 6.0 and later". No numbers given. — [moonlight-android v4.8.1](https://github.com/moonlight-stream/moonlight-android/releases/tag/v4.8.1)

### Inferences
- For the Poco F7 (`c2.qti.avc.decoder`, Android 15/16), the recommended config is: `low-latency=1`, both `vendor.qti-ext-dec-*` keys guarded by `getSupportedVendorParameters()`, and `KEY_OPERATING_RATE=Short.MAX_VALUE` with a fallback retry. A native client can also list codecs via `MediaCodecList` and pick a `.low_latency` variant if HyperOS ships one for AVC.
- The measured "decode ~9 ms at 60 Hz vs ~25 ms at 120 Hz" in WebView most likely reflects WebView/compositor frame handoff and vsync-quantised release, not raw decoder time. Moonlight-style direct `releaseOutputBuffer(index, renderTimestampNs)` plus a 60 Hz surface removes that coupling. This is an inference and needs on-device measurement, e.g. timing from `queueInputBuffer` to `onFrameRendered`/`OnFrameRenderedListener`.
- xCloud H.264 Main can carry B-frames or reordering. `picture-order` (output in decode order) only helps if the stream has no reordering. WebRTC H.264 is normally constrained-baseline/main without B-frames, which makes it a good fit (unverified for xCloud).

### Gaps
- I found no published, measured Moonlight decode latency in ms for Snapdragon 8-gen / 8s Gen 4. The Moonlight in-app "average decoding time" stat on the Poco F7 would be the way to get one.
- I found no public Qualcomm doc for the semantics of `vendor.qti-ext-dec-picture-order` / `-low-latency`. All that is known comes from Moonlight's source and comments.
- I could not verify whether Chromium's WebRTC/MediaCodec path in WebView sets `low-latency` or the QTI vendor keys. A search of `media/gpu/android/*` in Chromium source is needed.

## 2. Zero-copy decoded frames into a GPU post-process (SurfaceTexture/OES, ImageReader + AHardwareBuffer → Vulkan, raw Y/UV, 10-bit)

### Takeaway
There are two zero-copy routes.
- (a) MediaCodec → Surface from SurfaceTexture → `GL_TEXTURE_EXTERNAL_OES`. This is simplest, but the sampler returns driver-converted RGB, so you cannot see the raw chroma.
- (b) MediaCodec → `ImageReader` (usage `GPU_SAMPLED_IMAGE`) → `AHardwareBuffer` → Vulkan via `VK_ANDROID_external_memory_android_hardware_buffer` + `VkSamplerYcbcrConversion`. The decoder output on Adreno is usually an opaque, UBWC-compressed "external format", so even in Vulkan the hardware does the YCbCr conversion. Raw-plane access is possible only if the driver exposes a known multi-planar VkFormat, or via CPU-mapped linear NV12 (a copy).

Chromium itself uses the AImageReader/AHardwareBuffer route, which means WebView is already zero-copy internally. The gain from going native is control, not avoiding a copy.

### Cited Findings
- AHB images may use "implementation-defined external formats" that do not map to Vulkan formats. A Y'CbCr conversion is required to sample them. — [Khronos VK_ANDROID_external_memory_android_hardware_buffer](https://registry.khronos.org/vulkan/specs/1.3-extensions/man/html/VK_ANDROID_external_memory_android_hardware_buffer.html)
- AHBs with the same external format must have the same `SAMPLED_IMAGE_FILTER_LINEAR` support. Other format features may differ. — [VkAndroidHardwareBufferFormatPropertiesANDROID](https://docs.vulkan.org/refpages/latest/refpages/source/VkAndroidHardwareBufferFormatPropertiesANDROID.html)
- Dawn's (Chromium's WebGPU) YCbCr sampler feature: the opaque external-format integer "must be supplied when creating a sampler to sample this AHardwareBuffer". The texture entry must have format type EXTERNAL. This is how Chrome's WebGPU imports video on Android. — [Dawn y_cb_cr_vulkan_samplers.md](https://dawn.googlesource.com/dawn.git/+/3fd9e822a5fcbfa633e75df997480fce16ebd255/docs/dawn/features/y_cb_cr_vulkan_samplers.md)
- Open question from a Meta Quest 3 (Adreno) developer: can MediaCodec/AImageReader output be linear NV12 for zero-copy, or does the driver force UBWC? The thread has no answer. — [Unreal forum, Quest 3 zero copy Vulkan](https://forums.unrealengine.com/t/quest-3-zero-copy-vulkan/2693593)
- Chromium's MediaCodec video path uses `ImageReaderGLOwner` (AImageReader/AImage/AHardwareBuffer). The GL texture binds to an AHardwareBuffer, not directly to a SurfaceTexture. AImageReader is disabled on some GPUs. A feature flag limits the AImageReader queue to 1 image on some devices. The source is code comments of uncertain date. — [Chromium image_reader_gl_owner.cc](https://chromium.googlesource.com/chromium/src/+/d67bd4e6cc5bb4311ec00aae53ebda009ea5b142/gpu/command_buffer/service/image_reader_gl_owner.cc); [Chromium gpu_finch_features.cc](https://chromium.googlesource.com/chromium/src/+/a21ac4e0f88e5ca4043c3cb15d9da1a74aaeb84c/gpu/config/gpu_finch_features.cc); [Mozilla bug 1649110](https://bugzilla.mozilla.org/show_bug.cgi?id=1649110)
- Qualcomm on UBWC: it "lowers memory bus traffic and power", spans the GPU, display, video and camera blocks, and supports YUV and RGB. The following disable it: compute shaders (writes), `VK_IMAGE_TILING_LINEAR`, CPU readback, mutable/aliased images, and others. — [Qualcomm Adreno mobile best practices](https://docs.qualcomm.com/bundle/publicresource/80-78185-2/topics/mobile_best_practices.md)

### Inferences
- "Real chroma 4:2:0 reconstruction" on raw planes is only fully possible natively if the driver reports a standard `VK_FORMAT_G8_B8R8_2PLANE_420_UNORM` for the decoder AHB. If it does, you can create per-plane image views and sample Y and UV separately. If it reports only an external format, you are limited to the YCbCr sampler. Even then, you control `chromaFilter` (NEAREST vs LINEAR), `xChromaOffset`/`yChromaOffset` (COSITED_EVEN vs MIDPOINT), `ycbcrModel` (BT.709) and `ycbcrRange` (limited). NEAREST + correct siting gives a near-raw chroma signal that a custom upsampler can then reconstruct.
  - These are standard `VkSamplerYcbcrConversionCreateInfo` fields, which I know from the Vulkan spec but did not fetch separately in this session.
  - WebGL/WebGPU in WebView give none of these controls: the browser hands over RGB or an opaque external texture.
- Fallback for raw planes: `ImageReader` with `ImageFormat.YUV_420_888` and CPU-mapped planes, then upload. This adds a copy (~3 MB per 1080p frame, ~180 MB/s at 60 fps) and likely costs more latency than it saves.
- 10-bit: the xCloud stream is 8-bit H.264 Main, so P010/10-bit decode is irrelevant for input. The post-process can still render to an RGBA16F or RGB10A2 swapchain to avoid banding after the deband pass.

### Gaps
- I could not confirm the Adreno 825 / `c2.qti.avc.decoder` AHB format (external vs NV12 multi-planar) or whether UBWC can be disabled. This must be queried on device via `vkGetAndroidHardwareBufferPropertiesANDROID` and `VkAndroidHardwareBufferFormatPropertiesANDROID.format`/`externalFormat`.
- I found no measured latency comparison between the SurfaceTexture and ImageReader paths.

## 3. Frame pacing & display control (setFrameRate, preferredDisplayModeId, Choreographer, Swappy, ADPF, SurfaceControl timestamps, Game Mode)

### Takeaway
A native app can pin the panel to 60 Hz and pace frames to vsync. The relevant APIs:
- `Surface/SurfaceControl/ANativeWindow setFrameRate(60, DEFAULT)` (API 30+), or `preferredDisplayModeId`, which the docs explicitly recommend when the app "can't handle the display running at a multiple of the app's frame rate".
- Per-frame present timestamps: `EGL_ANDROID_presentation_time`, `VK_GOOGLE_display_timing`, `ASurfaceTransaction_setDesiredPresentTime`.
- ADPF hint sessions and thermal/headroom APIs.

Android 15 already defaults games to 60 Hz. WebView can do none of this.

### Cited Findings
- `setFrameRate()` variants: `Surface.setFrameRate`, `SurfaceControl.Transaction.setFrameRate`, `ANativeWindow_setFrameRate`, `ASurfaceTransaction_setFrameRate`. They require targeting API 30+. "There is no guarantee that your app will get the frame rate you request." — [Android frame rate guide](https://developer.android.com/media/optimize/performance/frame-rate)
- For games: `Surface.setFrameRate(60, FRAME_RATE_COMPATIBILITY_DEFAULT)` makes a 90/120 Hz device "run at 60Hz while the game is active". `FIXED_SOURCE` is for video only. — [frame rate guide](https://developer.android.com/media/optimize/performance/frame-rate)
- `CHANGE_FRAME_RATE_ALWAYS` permits non-seamless switches only if the user has also enabled "Match content frame rate". It is meant for long videos. On phones, the 60↔120 switch is normally seamless, so `ONLY_IF_SEAMLESS` (the default) suffices. — [frame rate guide](https://developer.android.com/media/optimize/performance/frame-rate)
- The platform may pick a multiple (60 → 120 Hz), e.g. when another surface wants 24 Hz. In that case, use per-frame presentation timestamps (`ASurfaceTransaction_setDesiredPresentTime`, `EGL_ANDROID_presentation_time`, `VK_GOOGLE_display_timing`) or Swappy. Use `preferredDisplayModeId` instead when the app can't handle a multiple, wants a heavy mode switch, or wants a resolution change. `preferredRefreshRate` is ignored for surfaces that use `setFrameRate()`. — [frame rate guide](https://developer.android.com/media/optimize/performance/frame-rate)
- To detect the actual rate, use `DisplayManager.registerDisplayListener` or `AChoreographer_registerRefreshRateCallback`. — [frame rate guide](https://developer.android.com/media/optimize/performance/frame-rate)
- "Android 15 sets a default 60Hz refresh rate for games to optimize power consumption. To unlock higher frame rates… explicitly request them using the Frame Rate API or the Swappy library." The system may still cap the rate for battery or thermal reasons. — [Display refresh rate change (games)](https://developer.android.com/games/optimize/display-refresh-rate-change)
- Swappy (Android Frame Pacing library) is an open-source C/C++ library that manages vsync and frame scheduling as "a higher-level abstraction layer over… setFrameRate()". — [Display refresh rate change](https://developer.android.com/games/optimize/display-refresh-rate-change)
- ADPF components: the Thermal API; the Game Mode and Game State APIs; Fixed Performance Mode for benchmarking; and Power Efficiency Mode (`PerformanceHintManager.Session.setPreferPowerEfficiency`, Android 15). — [ADPF overview](https://developer.android.com/games/optimize/adpf)
- Android 16 (API 36) adds `SystemHealthManager.getCpuHeadroom` and `getGpuHeadroom` (plus `get*HeadroomCalculationWindowRange` and `get*HeadroomMinIntervalMillis`). They return estimates of available CPU/GPU resources. Results may be cached if called too often, and the call throws `UnsupportedOperationException` where unsupported. — [Android 16 features](https://developer.android.com/about/versions/16/features); [API 36 diff SystemHealthManager](https://developer.android.com/sdk/api_diff/36/changes/android.os.health.SystemHealthManager); [AOSP system_health.cpp](https://android.googlesource.com/platform/frameworks/base/+/android16-qpr1-release/native/android/system_health.cpp)

### Inferences
- The highest-leverage single change for the "25 ms at 120 Hz" problem: in a native app, call `setFrameRate(60f, FRAME_RATE_COMPATIBILITY_DEFAULT)` on the output SurfaceView surface. Also set `preferredDisplayModeId` to the 60 Hz mode from `Display.getSupportedModes()` as a stronger hint for HyperOS. Verify with a display listener.
  - The xCloud 60 fps stream then lands one frame per vsync. Decoder output can be released with `releaseOutputBuffer(idx, vsyncTimeNs)` aligned to `Choreographer.postFrameCallback`'s frame time, which is the Moonlight approach.
- Pipeline latency budget: a decoded frame goes through the post-process and then a `SurfaceView` swap. That is one fewer compositor hop than WebView, which composites the canvas in its own GPU process and then hands it to SurfaceFlinger.
- An ADPF hint session (`createHintSession` with decoder/render thread tids, target 16.6 ms, `reportActualWorkDuration` per frame) helps keep CPU clocks up for the decode→render thread on a big.LITTLE SoC. The thermal headroom API can drive automatic downgrade of the shader chain (e.g. turning off the NN pass when headroom exceeds 0.9).

### Gaps
- HyperOS-specific behaviour is unverified. I found no source confirming whether HyperOS honours `setFrameRate(60)` or `preferredDisplayModeId` for third-party apps, or whether Xiaomi's "Smart refresh"/game turbo overrides them. This must be tested on the F7.
- The ADPF PerformanceHint page (`/games/optimize/adpf/performance-hint-api`) returned 404. API levels from memory, unverified this session: `PerformanceHintManager` Java API 31, NDK `APerformanceHint` API 33, `WorkDuration` with GPU time API 35. Confirm against the reference.
- Not researched: `ASurfaceControl` direct `ASurfaceTransaction_setBuffer` to an overlay plane (bypassing GPU composition), Game Dashboard, and per-game interventions on HyperOS.

## 4. GLES vs Vulkan on Adreno 8xx for full-screen post-process; Qualcomm best practices; SGSR

### Takeaway
Qualcomm's own guide says "Prefer Vulkan to OpenGL ES" and "Prefer fragment shaders to compute shaders when possible". Compute writes defeat the concurrent-resolve hardware and can disable UBWC. The best Adreno shape for the current chain is a fragment-shader pass chain, merged into as few render passes/subpasses as possible, in FP16. The current observation that WebGL2 is cheaper than WebGPU fits this: WebGPU in Chrome tends to be compute/storage-texture heavy and adds Dawn validation. SGSR1 is a single-pass, Adreno-tuned EASU-like upscaler plus sharpener (BSD-3).

### Cited Findings
- "Prefer Vulkan to OpenGL ES… While Vulkan is not a perfect superset of OpenGL ES", it is generally more performant and fully featured. — [Qualcomm Adreno mobile best practices](https://docs.qualcomm.com/bundle/publicresource/80-78185-2/topics/mobile_best_practices.md)
- "Prefer fragment shaders to compute shaders when possible." Compute kernels must write to memory before the next kernel starts, while fragment shaders use the "concurrent resolve hardware". Compute writes to a colour attachment "may perform acceptably". — [Qualcomm mobile best practices](https://docs.qualcomm.com/bundle/publicresource/80-78185-2/topics/mobile_best_practices.md)
- UBWC disablers: compute shaders, `VK_IMAGE_TILING_LINEAR`, CPU readback, VRS, fragment density maps, aliased, mutable and sparse images. — [same](https://docs.qualcomm.com/bundle/publicresource/80-78185-2/topics/mobile_best_practices.md)
- "Use strict half-precision types as much as possible". mediump/relaxed precision is faster and more power-efficient on Adreno's scalar ALUs. Combined image samplers get bindless mode; separate samplers showed 2–5% lower fill rate. — [same](https://docs.qualcomm.com/bundle/publicresource/80-78185-2/topics/mobile_best_practices.md)
- Merging consecutive passes with the same colour format, done via subpasses in binning mode, can give ">10% frametime". Use `LOAD_OP_DONT_CARE`/`CLEAR` and `VK_DEPENDENCY_BY_REGION_BIT`. — [same](https://docs.qualcomm.com/bundle/publicresource/80-78185-2/topics/mobile_best_practices.md)
- LPAC (low-priority async compute) is available from A740 upward via `VK_KHR_global_priority` with a low-priority compute queue. — [same](https://docs.qualcomm.com/bundle/publicresource/80-78185-2/topics/mobile_best_practices.md)
- Adreno 850+ supports Adreno Neural Fusion (ANF): "On these devices ANF is likely the best way of implementing Super Resolution." On other devices it runs on the NPU. The Adreno 825 is below 850. — [same](https://docs.qualcomm.com/bundle/publicresource/80-78185-2/topics/mobile_best_practices.md)
- SGSR 1 "integrates upscaling and sharpening in one single GPU shader pass". It is a 12-tap Lanczos-like filter plus adaptive sharpening on a single input texture. SGSR 2 is temporal (anti-flicker/ghosting). Licence BSD-3. No ms costs are published. — [SnapdragonStudios/snapdragon-gsr](https://github.com/SnapdragonStudios/snapdragon-gsr)
- Qualcomm published Vulkan/OpenCL sharing guidance for Adreno on Android in Oct 2026. Not read in detail. — [Qualcomm blog 2026/10](https://www.qualcomm.com/developer/blog/2026/10/how-to-share-vulkan-opencl-workloads-android-adreno-gpus)

### Inferences
- Native GLES 3.2 with `samplerExternalOES` is the lowest-effort port of the existing WebGL2 shaders, which are near-identical GLSL ES 3.0. Native Vulkan adds the YCbCr conversion controls, subpass merging, and explicit FP16. The guide favours Vulkan, but the absolute win for 3–6 full-screen 1080p passes is unmeasured.
- Merging deblock → deband → chroma → RCAS into one or two fragment passes, with SGSR1 replacing EASU+RCAS as a single pass, is consistent with Qualcomm guidance and likely the biggest GPU-time saving regardless of API.
- The small neural net could move to the NPU via QNN/LiteRT. ANF itself targets Adreno 850+, so it is likely unavailable on the 825.

### Gaps
- I found no public benchmark of GLES vs Vulkan for full-screen post-process on Adreno 8xx, and no SGSR ms figures.

## 5. Open-source native players/clients with shader post-processing on Android

### Takeaway
- **Moonlight-Android upstream:** low-latency decode only, no post-process.
- **Fork `derflacco/moonlight-android`:** adds FSR (EASU/RCAS presets, "GPU Raw" path, immediate frame release) and reports post-process cost in its "Delay" stat. It is the closest existing reference to what xCloud Enhanced would become natively.
- **mpv 0.41 (Dec 2025):** made libplacebo `gpu-next` the default and dropped `vo_mediacodec_embed` as the Android default. mpv-android therefore now supports full `glsl-shaders` post-processing of MediaCodec output, but it is a player tuned for quality rather than latency.

### Cited Findings
- The derflacco/moonlight-android fork releases mention:
  - lower-resolution presets "to decrease decoding latency", with FSR upscaling on top;
  - FSR presets Performance / Balanced / Quality for EASU and RCAS;
  - the "Delay" metric "now represents more than decode latency" (it includes upscaling);
  - "GPU Raw now uses immediate frame release for reduced latency";
  - FSR greyed out with "FastGL";
  - one release "Removed FSR EASU upscaling", so the feature set fluctuates.
  No device ms figures were found. — [derflacco/moonlight-android releases](https://github.com/derflacco/moonlight-android/releases)
- Moonlight-Qt PR #1557 adds Video Super Resolution, including Windows-on-ARM Snapdragon with an Adreno 618 shader path for 720p→1080p. This is the desktop client, not Android. — [moonlight-qt PR #1557](https://github.com/moonlight-stream/moonlight-qt/pull/1557)
- mpv 0.41 changes:
  - `gpu-next` (libplacebo) is the default;
  - Vulkan hwdec is preferred;
  - it requires libplacebo ≥ 6.338.2;
  - on Android, `vo_mediacodec_embed` is no longer the default and `gpu-next` is preferred;
  - it adds an AAudio backend.
  — [AlternativeTo news on mpv 0.41, 2025-12](https://alternativeto.net/news/2025/12/mpv-0-41-switches-to-gpu-next-by-default-improves-wayland-support-and-vulkan-decoding); [mpv v0.41.0 release mirror](https://newreleases.io/project/github/mpv-player/mpv/release/v0.41.0)
- An mpv-android-based fork exists (`Laskco/mpvNova`). Not investigated. — [mpvNova](https://github.com/Laskco/mpvNova)

### Inferences
- Architecture to copy: Moonlight's decoder/pacing code (MediaCodecHelper + MediaCodecDecoderRenderer) plus a GLES/Vulkan post-process like the derflacco fork. The hard part is that xCloud is WebRTC, not Moonlight's protocol. A native client needs a native WebRTC stack (libwebrtc Android with a custom `VideoDecoderFactory` wrapping MediaCodec with the low-latency keys and rendering to your own surface) plus xCloud's signalling and auth. That is a large, separate effort, and the ToS risk is unverified.
- A hybrid is lower effort: keep WebView for auth/signalling and run the media through a native libwebrtc `PeerConnection` in the app via a JS bridge. Not researched for feasibility.

### Gaps
- I found no latency or quality measurements for mpv-android glsl-shaders, Artemis/Moonlight-Noir, Kodi or VLC shader paths on Android (not searched in depth). I found no open-source native xCloud client with a GPU post-process.
- I found no Chromium bug or source confirming that WebView's WebRTC decode on Android sets `low-latency`, or whether WebView can ever call `setFrameRate`. Chromium has an Android WebView zero-copy MCVD flag, disabled by default per a code comment of unknown date. — [gpu_finch_features.cc](https://chromium.googlesource.com/chromium/src/+/a21ac4e0f88e5ca4043c3cb15d9da1a74aaeb84c/gpu/config/gpu_finch_features.cc)

# Real-time enhancement of compressed game/video streams on Snapdragon (Adreno 825 / Hexagon) — candidate techniques for xCloud Enhanced

Scope: 1080p H.264 Main ~12 Mb/s, 60 fps, Poco F7 (Snapdragon 8s Gen 4). Total frame budget is about 16.6 ms, and the device is thermal-limited. Current chain runs in WebGL2. Research date: 2026-11-20. I used about 18 tool calls. Several Qualcomm blog pages render through JavaScript and came back empty, so some Qualcomm facts below rest on search snippets and are marked that way.

## Ranked summary (expected visual gain vs cost on Adreno/Hexagon)

This ranking is an inference that synthesizes the cited findings in the sections below.

1. **Stream-aware artifact-reduction CNN that predicts a residual on top of a cheap upscale (RTX-VSR style), quantized and tiled.** It has the highest expected gain because the dominant defect at 12 Mb/s H.264 is compression (blocking, ringing, banding, smeared chroma), not resolution. Evidence: RTX VSR does "upscaling and compression artifact reduction in a single pass" by predicting a residual. AIM 2024 compressed-video SR winners use 0.05–0.4 M params and 0.5–13 ms on desktop GPUs. Qualcomm AI Hub SR nets (QuickSRNet, XLSR, SESR) run 0.3–1.5 ms per small tile on NPU. Cost is unknown at 1080p on Adreno 825. It is likely several ms, and it should replace stages of the current chain (deblock, chroma, detail) rather than be added on top.
2. **Swap FSR1 EASU / SGSR1 for a better single-frame luma upscaler (RAVU / ArtCNN-class) only if display scaling is large.** The gain is moderate, mostly on edges. The ArtCNN author's own metrics put ArtCNN above RAVU and FSRCNNX for luma doubling. RAVU is very cheap. Anime4K's README lists ravu-r4 at 3.6 ms vs FSRCNNX-16 at 30.4 ms for a 4K frame on desktop.
3. **SGSR2-style temporal accumulation without engine motion vectors.** The gain is potentially large for stability and shimmer, but the risk is high. SGSR2 needs clip-space velocity and depth, and only its 3-pass variant falls back to depth reprojection. A video stream has neither, so you would need estimated optical flow (block matching, or the Adreno motion-estimation extension, which WebGL cannot reach). Expect ghosting on game HUDs.
4. **Codec side-info–guided enhancement (MVs, QP, partition maps from the H.264 bitstream).** Gain is high and the research is strong (CVPR 2025 plug-and-play, MetaBit, CRDS). It is only feasible with native decode (MediaCodec gives no bitstream metadata), meaning your own parser or a software decoder, so it is not possible in the WebGL/browser path.
5. **Moving the NN to Hexagon NPU via QNN/LiteRT with AHardwareBuffer zero-copy.** This is a cost win, not a quality win. It frees GPU time and power, and the NPU is likely more efficient under thermal limits. It needs a native app (no NPU from WebGL).

## Upscalers: SGSR2 (temporal) without MVs; FSR1 vs SGSR1 vs NIS; Anime4K/ArtCNN/FSRCNNX/RAVU; mobile cost

### Takeaway
SGSR2 is cheap (about 0.9–2.4 ms on Snapdragon 8 Gen 3 at about 1.4 Mpx to 3.5 Mpx output). It is built around engine clip-space motion vectors plus depth, though. Only its 3-pass variant has a "no velocity" path, and that path reprojects depth, which a video stream also lacks. So SGSR2 does not drop into a stream pipeline without an estimated-flow front end. Among single-frame shader upscalers, ArtCNN and RAVU look like the best quality-per-cost upgrades over EASU/SGSR1. FSRCNNX and big Anime4K variants are too heavy for a mobile 16 ms budget.

### Cited Findings
- SGSR1: single input texture, one shader pass doing upscale plus sharpen, 12-tap Lanczos-like filter plus adaptive sharpening. Repo versions are 1.0.0 (2023-06-29), 1.1.0 (2024-01-29) and 2.0.0 (2024-10-21), BSD-3 license. — [SnapdragonStudios/snapdragon-gsr](https://github.com/SnapdragonStudios/snapdragon-gsr)
- SGSR2 required inputs (2-pass Convert): InputColor (RGBA), InputDepth (D24S8) and InputVelocity (clip-space motion vectors, encoded `velocity*0.2495 + 32767/65535`), all at render resolution. The uniform buffer needs `clipToPrevClip`, `preExposure`, `cameraFovAngleHor`, `bSameCamera` and `reset`. — [SGSR2 README](https://raw.githubusercontent.com/SnapdragonStudios/snapdragon-gsr/main/sgsr/v2/README.md)
- SGSR2 variants: 2-pass-fs (recommended, fastest), 2-pass-cs, and 3-pass-cs (Convert/Activate/Upscale, best visuals). The 3-pass Convert pass "reprojects depth if no velocity is available". The 2-pass variant documents no fallback for missing velocity. — [SGSR2 README](https://raw.githubusercontent.com/SnapdragonStudios/snapdragon-gsr/main/sgsr/v2/README.md)
- SGSR2 timing on Snapdragon 8 Gen 3 at max GPU clock, output 1260x2800: 2.0x scale 2-pass-CS 1.801 ms, 2-pass-FS 0.905 ms, 3-pass-CS 2.015 ms. 1.5x scale: 1.998 / 1.107 / 2.397 ms. — [SGSR2 README](https://raw.githubusercontent.com/SnapdragonStudios/snapdragon-gsr/main/sgsr/v2/README.md)
- The Qualcomm blog describes SGSR2's first pass as building the motion buffer and depth-clip buffer, the second as an "optimized Lanczos upscaling pass", with optional sharpening. This comes from a search snippet; the page did not render for fetch. — [Qualcomm blog, Oct 2024](https://www.qualcomm.com/developer/blog/2024/10/introducing-snapdragon-game-super-resolution-2)
- Qualcomm's 2026 "Adreno Neural Fusion" (Snapdragon 8 Elite Extreme Gen 6) is AI super resolution plus frame generation on the GPU's dedicated AI cores rather than the NPU. Android Authority reports that the non-Extreme 8 Elite Gen 6 lacks it, so the 8s Gen 4 almost certainly lacks it too. Its frame generation interpolates between two rendered frames at the cost of one frame of extra latency. — [Digital Trends](https://www.digitaltrends.com/phones/i-tested-qualcomms-ai-gaming-tech-trust-me-its-not-just-a-dlss-clone-for-phones/); [Android Authority](https://www.androidauthority.com/snapdragon-8-elite-extreme-gen-6-3712924/); [Qualcomm blog, Sep 2026 (title only retrieved)](https://www.qualcomm.com/developer/blog/2026/09/introducing-adreno-neural-fusion-sdk-for-snapdragon-mobile-platforms)
- mpv scaler evaluation (anime test image): FSRCNNX scored highest, then Anime4K, then RAVU. RAVU, FSR and small Anime4K were "very fast", while FSRCNNX_16 and the largest Anime4K were acceptable on an AMD RX 470, a desktop GPU. The test is older and not mobile. — [Artoriuz, Mathematically Evaluating mpv's Upscaling Algorithms](https://artoriuz.github.io/blog/mpv_upscaling.html)
- A newer post by the same author found ArtCNN ahead of RAVU and FSRCNNX for luma doubling and called it the best option for luma doubling. This is the author's own model, so the claim is self-reported. — [Artoriuz, mpv Resampling](https://artoriuz.github.io/blog/mpv_upscaling); [ArtCNN repo](https://github.com/Artoriuz/ArtCNN)
- Anime4K's README reports ravu-r4 at 3.6 ms vs FSRCNNX-16 at 30.4 ms for a 4K frame (desktop GPU) and claims Anime4K beats NGU and FSRCNNX on quality and speed. These are self-reported numbers. — [bloc97/Anime4K](https://github.com/bloc97/Anime4K)

### Inferences
- Content at 1080p in, ~1080p–1.2× out (Poco F7 panel is about 2712x1220) gives a scale factor of only about 1.13×. At that ratio the upscaler choice matters much less than artifact removal. EASU, SGSR1 and NIS will look nearly identical, so spend the budget on restoration, not on a fancier upscaler.
- To use SGSR2 on a stream you would need to (a) feed estimated flow as "velocity" in clip space, (b) set depth to a constant and rely on its color-based rejection, and (c) set `bSameCamera` and `reset` heuristically on scene cuts. This is an untested adaptation, not a documented use. Constant depth also neuters its depth-clip disocclusion logic, so ghosting risk is high around HUD and particles.
- ArtCNN and RAVU ship as GLSL hooks for mpv/libplacebo. Porting to WebGL2 fragment shaders is feasible (RAVU uses LUT weights; ArtCNN is a small conv net). Cost on Adreno 825 is unmeasured, so benchmark it before committing.
- FSRCNNX (30 ms at 4K on desktop) and large Anime4K variants exceed the mobile budget. Exclude them.

### Gaps
- No published Adreno ms numbers for FSR1 EASU vs SGSR1 vs NIS head-to-head, and none for RAVU or ArtCNN on any mobile GPU.
- NVIDIA Image Scaling (NIS) repo and cost were not re-verified in this session.
- Adreno Neural Fusion SDK details (APIs, inputs, device support) could not be fetched; only the title and press coverage were available.

## Compression artifact removal / real-time video restoration (RTX VSR, Edge VSR, vendor on-device SR, lightweight CNNs, challenge winners)

### Takeaway
The product-proven pattern is RTX VSR's: one small net that predicts a residual on top of a conventional upscale and handles compression artifacts in the same pass. Academic evidence (AIM 2024 compressed-video SR) shows 50K–400K-param nets beating Lanczos by 10–15 VMAF points at 0.5–13 ms on desktop GPUs. Qualcomm AI Hub models (QuickSRNet, XLSR, SESR) give the best on-device latency data: 0.3–1.5 ms per 128x128 tile. No vendor publishes a 1080p real-time number on Snapdragon.

### Cited Findings
- RTX VSR: "a deep learning network that performs upscaling and compression artifact reduction in a single pass". The network "predicts the residual image at the target resolution", which is "superimposed on top of a traditional upscaled image". It needs RTX 30/40 Tensor cores. Chrome ≥110.0.5481.105 and Edge ≥110.0.1587.56 are supported (Edge originally behind `edge://flags/#edge-video-super-resolution`). Launch was February 2023, so this is older. — [NVIDIA blog](https://blogs.nvidia.com/blog/rtx-video-super-resolution)
- Independent review titled "AI-enhanced streaming that barely makes a difference", from 2023, suggests gains are modest on already-good streams. — [TechPowerUp](https://www.techpowerup.com/305296/nvidia-rtx-video-super-resolution-tested-ai-enhanced-streaming-that-barely-makes-a-difference?cp=2)
- AIM 2024 Efficient VSR challenge on **AV1-compressed** content, mobile track 360p→1080p ×3:
  - SuperBicubic++: VMAF 66.39, PSNR-Y 30.51, 0.05 M params, 2.9 GMACs, 0.46 ms on A100.
  - FSMD: VMAF 60.17, 1.62 M params, 13.14 ms on RTX 4090.
  - BVI-RTVSR: VMAF 55.44, PSNR-Y 33.33, 0.062 M params, 0.8 ms on RTX 3090.
  - Lanczos baseline: VMAF 51.24.
  - The report notes "most models have less than 150K parameters". All timings are desktop GPUs, with no mobile measurement.
  - Note: the VMAF winner had the lowest PSNR, so VMAF rewards sharpening.
  — [AIM 2024 report, arXiv 2409.17256](https://arxiv.org/html/2409.17256v1)
- Mobile AI (MAI) 2025 real-time VSR track: input is 10 consecutive 180x320 frames upscaled ×4 to 720p, measured on a MediaTek Dimensity NPU. Example entry RepNet-VSR: 27.79 dB on REDS, 103 ms per 10-frame clip (about 10.3 ms per frame; the paper is internally inconsistent on this), 16 channels with 4 reparameterized blocks. Interim timings were on a Snapdragon 870 GPU in FP16. The input is bicubic-degraded, not codec-compressed. — [RepNet-VSR, arXiv 2504.15649](https://arxiv.org/html/2504.15649v1); [MAI 2025 workshop](https://openaccess.thecvf.com/CVPR2025_workshops/MAI)
- NTIRE 2025 Efficient SR challenge report (single image, desktop-oriented efficiency): [arXiv 2504.10686](https://arxiv.org/html/2504.10686v1)
- Qualcomm AI Hub QuickSRNetSmall on Snapdragon 8 Gen 3: TFLite w8a8 0.267 ms, TFLite float 0.621 ms, ONNX w8a8 0.338 ms. QuickSRNetLarge: TFLite w8a8 0.49 ms, float 1.449 ms, QNN DLC w8a8 0.439 ms. The model card's default input is small (not 1080p), and figures come from different AI Hub releases. — [HF qualcomm/QuickSRNetSmall](https://huggingface.co/qualcomm/QuickSRNetSmall); [HF qualcomm/QuickSRNetLarge](https://huggingface.co/qualcomm/QuickSRNetLarge); [AI Hub QuickSRNetSmall quantized](https://aihub.qualcomm.com/mobile/models/quicksrnetsmall_quantized)
- XLSR (MAI 2021 winner lineage, so older architecture): about 28K params at 128x128 input. Float NPU 2.2–4.6 ms on IoT parts. XLSR-Quantized has 22K params and a 39 KB model, 0.903 ms on Snapdragon 8 Elite QRD (ONNX). — [HF qualcomm/XLSR](https://huggingface.co/qualcomm/XLSR); [HF qualcomm/XLSR-Quantized](https://huggingface.co/qualcomm/XLSR-Quantized)
- SESR-M5-Quantized: 338K params, 128x128 input. 1.332 ms TFLite and 0.973 ms QNN on Galaxy S23 Ultra (Snapdragon 8 Gen 2). — [HF qualcomm/SESR-M5-Quantized](https://huggingface.co/qualcomm/SESR-M5-Quantized)
- Snapdragon 8 Elite product brief lists "Video super resolution" only as a camera feature, with no streaming or 1080p real-time spec. — [Snapdragon 8 Elite Product Brief](https://qualcomm.com/content/dam/qcomm-martech/dm-assets/documents/Snapdragon-8-Elite-Platform-Product-Brief.pdf)

### Inferences
- The AI Hub latencies are per 128x128 tile. A 1080p frame is about 127 tiles' worth of pixels, so naive scaling of 0.27–1.3 ms is far over budget. In practice throughput is better than linear because tiles batch and launch overhead amortizes, but treat the existing ~5 ms GPU net as roughly what the budget allows. The win comes from (a) training on the right degradation (H.264 at ~12 Mb/s on game content) and (b) making the net replace deblock, chroma reconstruction and detail boost rather than adding to them.
- Best training recipe from the evidence: residual over bilinear/EASU like RTX VSR, under 150K params like AIM 2024, reparameterized convs (RepNet-VSR / ECBSR style) so training-time branches fold into plain 3x3 convs, and int8 QAT for NPU. Train on xCloud-like captures re-encoded with x264 at 10–14 Mb/s.
- Running at 1× (no upscale) on luma only, with chroma handled by the existing luma-guided shader, cuts cost about 2–3× versus RGB.

### Gaps
- No ms numbers found for ECBSR, RLFN or SESR at full 1080p on Adreno 7xx/8xx.
- No public data on MediaTek MiraVision or Samsung on-device video SR internals.
- No Netflix/YouTube on-device SR paper surfaced in this session's searches.
- Microsoft Edge's own (non-NVIDIA) VSR was not researched.
- No MAI challenge track specifically for compressed-video quality enhancement on mobile was found for 2023–2026.

## Running NN on Hexagon NPU vs GPU in a real-time video loop (AI Hub, QNN, LiteRT, AHardwareBuffer, int8)

### Takeaway
LiteRT (2025) now has production Qualcomm NPU support with zero-copy AHardwareBuffer I/O and async execution, and it falls back to GPU or CPU when needed. Qualcomm's own int8 SR models run 2–3× faster than float on the NPU. This path needs a native Android app; WebGL cannot reach the NPU.

### Cited Findings
- LiteRT added async execution and zero-copy buffer interop. The sample retrieves output as AHardwareBuffer. Qualcomm and MediaTek are "first production-ready" NPU integrations, with AOT and on-device compilation via the CompiledModel API. LiteRT GPU is on average 1.4× faster than the legacy TFLite GPU delegate. The NPU claim of 3× over GPU is for LLM prefill and is vendor-reported. — [Google Developers Blog: LiteRT](https://developers.googleblog.com/litert-the-universal-framework-for-on-device-ai/); [LiteRT NPU docs](https://developers.google.com/edge/litert/next/npu?hl=en)
- LiteRT ships Qualcomm runtime libs per Hexagon generation (v69/v73/v75/v79/v81) and falls back to GPU or CPU. — [LiteRT NPU docs](https://developers.google.com/edge/litert/next/npu?hl=en)
- int8 vs float on NPU for SR nets: QuickSRNetSmall runs 0.267 ms int8 vs 0.621 ms float, and QuickSRNetLarge 0.49 vs 1.449 ms. — [HF qualcomm/QuickSRNetSmall](https://huggingface.co/qualcomm/QuickSRNetSmall); [HF qualcomm/QuickSRNetLarge](https://huggingface.co/qualcomm/QuickSRNetLarge)
- Qualcomm's sample app runs XLSR via ONNX Runtime plus the QNN execution provider on the NPU (Windows). — [AI Hub Super Resolution Windows app](https://aihub.qualcomm.com/apps/super_resolution_windows)

### Inferences
- A pipelined design is the realistic way to fit the budget: decoder → AHardwareBuffer → NPU (net on frame N) while the GPU does post and upscale on frame N−1. It costs one frame of latency (16.6 ms) but frees about 5 ms of GPU per frame and likely lowers power and heat.
- int8 SR nets lose a small amount of quality, typically fractions of a dB. Banding is the risk in flat gradients, so keep the debanding and dither stage after the net, on the GPU.

### Gaps
- No published measurement of GPU↔NPU handoff latency via AHardwareBuffer on Snapdragon 8s Gen 4. The "Unlocking Peak Performance on Qualcomm NPU with LiteRT" article was referenced but not opened.
- Hexagon generation in the 8s Gen 4 (v79 vs v81) was not confirmed.
- No measured int8-vs-fp16 visual quality data for compressed-video restoration nets.

## Using codec side information (MVs, QP, MB types) — compressed-domain enhancement

### Takeaway
Research is active and strong. The CVPR 2025 "Plug-and-Play Versatile Compressed Video Enhancement" reuses bitstream MVs and partition maps to avoid redundant computation and targets real-time use. MetaBit (2022/23) and CRDS (ACM MM 2024) use MVs plus QP conditioning. All of this requires access to the bitstream, so it is only feasible with native decode (your own H.264 parser alongside MediaCodec, or a software decoder). It is not feasible in a WebRTC/browser pipeline.

### Cited Findings
- Plug-and-Play Versatile Compressed Video Enhancement (CVPR 2025): codec-aware, "by reusing motion vectors and partition maps, it efficiently aggregates temporal and spatial clues without introducing redundant computations", positioned for real-time and downstream tasks. — [arXiv 2504.15380](https://arxiv.org/html/2504.15380v1); [CVF paper](https://openaccess.thecvf.com/content/CVPR2025/papers/Zeng_Plug-and-Play_Versatile_Compressed_Video_Enhancement_CVPR_2025_paper.pdf)
- MetaBit (Ehrlich et al.): uses bitstream MVs instead of estimated motion and a QP cross-attention so one model covers varying QP (prior works trained one model per QP). It is from 2022, revised in 2023, so it is older. — [arXiv 2202.00011](https://arxiv.org/pdf/2202.00011v3.pdf)
- CRDS (ACM MM 2024): treats compression as QP-dependent noise and uses MV-based alignment ("MuNA"). — [arXiv 2405.06342](https://www.arxiv.org/pdf/2405.06342v4)

### Inferences
- The cheapest high-value use is per-macroblock QP plus MB-type maps feeding a shader. Deblocking and denoise strength would then scale with actual QP, and skip or flat-intra blocks would get strong deband. Today these are guessed from pixels. Parsing slice headers and macroblock QP deltas needs CAVLC/CABAC entropy decoding, which in practice means running a software decoder like FFmpeg (it can export MVs via `+export_mvs`) in parallel or instead of MediaCodec. A software 1080p60 H.264 decode is CPU- and heat-costly on the phone. Flag this as feasible only in the native app path.
- Bitstream MVs can stand in for the missing "engine MVs" in temporal accumulation, but they are rate-distortion–optimized, not true motion. They need validation, such as a reprojection error check, before you use them for SGSR2-style accumulation.

### Gaps
- No mobile latency numbers were found for any compressed-domain enhancement net.
- WebRTC on Android exposes no MV or QP metadata. This is my understanding, not verified by source in this session.

## Temporal techniques without engine MVs (Adreno motion estimation / Frame Motion Engine, frame generation, temporal denoise)

### Takeaway
Adreno has hardware block-matching motion estimation (QCOM_motion_estimation GL/Vulkan extension, Adreno 6xx+) that produces motion vectors in under 1 ms per frame pair according to Qualcomm. It is the natural source of "MVs" for temporal stability or SGSR2 on a stream. It is only reachable from native GLES/Vulkan, not WebGL2. AI frame generation (Adreno Neural Fusion) is limited to the newest Extreme Gen 6 silicon and adds a frame of latency, which is bad for cloud gaming.

### Cited Findings
- QCOM_motion_estimation (OpenGL ES extension, Adreno 6xx): hardware block matching, two API functions. MVs are "often generated in under 1ms for both eyes" at VR resolutions, and the Middlebury pair runs in <0.5 ms. Source is a Qualcomm blog from 2021, older and vendor-reported. — [Qualcomm OnQ 2021](https://www.qualcomm.com/news/onq/2021/02/improving-vr-performance-using-motion-estimation-opengl-extensions)
- Improved motion-estimation handling of repeating patterns (2024 update). — [Qualcomm blog, Mar 2024](https://www.qualcomm.com/developer/blog/2024/03/gpu-motion-estimation-improved-handling-repeating-patterns)
- Synchronous Space Warp (Virtual Desktop) uses the Adreno Motion Engine to extrapolate frames. At 120 fps, two eye frames must be produced in under 7 ms. This is a precedent for MV-from-video-frames in a streaming product, since Virtual Desktop streams PC VR. — [Qualcomm blog, Sep 2022](https://www.qualcomm.com/developer/blog/2022/09/virtual-boost-vr-rendering-performance-synchronous-space-warp)
- Meta Horizon Hyperscape uses the Adreno GPU to improve judder (2025). — [Qualcomm blog, Jun 2025](https://www.qualcomm.com/developer/blog/2025/06/using-qualcomm-adreno-gpu-to-improve-judder-meta-horizon-hyperscape)
- "Adreno Frame Motion Engine 2.0" is mentioned in a 2025 Qualcomm low-power gaming blog without latency numbers. — [Qualcomm blog, Aug 2025](https://www.qualcomm.com/developer/blog/2025/08/optimize-performance-and-graphics-for-adreno-gpu-low-power-gaming)
- Adreno Neural Fusion frame generation interpolates between two rendered frames, adding one frame of input latency. — [Qualcomm blog, Sep 2026 (search snippet)](https://www.qualcomm.com/developer/blog/2026/09/introducing-adreno-neural-fusion-sdk-for-snapdragon-mobile-platforms)

### Inferences
- In a native build, replacing the experimental shader motion search with QCOM_motion_estimation would cut cost and improve vector quality. Those vectors could then drive (a) a TAA-style temporal denoise with neighborhood clamping (variance clip), and (b) potentially SGSR2 3-pass with velocity supplied. The Snapdragon Game Toolkit Vulkan sample is a starting point.
- Frame generation is not recommended. The stream is already 60 fps, and interpolation adds latency on top of cloud latency.
- In WebGL2, temporal stability must stay with shader-based block matching. Keep it conservative: luma-only, low-res search, and strong clamping to avoid HUD ghosting.

### Gaps
- Does Adreno 825 expose QCOM_motion_estimation via Vulkan/GLES, and with what latency at 1080p? Not confirmed.
- No research found on temporal denoise designed specifically for cloud-gaming streams on mobile.

## Perceptual quality metrics for automatic tuning (VMAF, LPIPS, CVQAD, NR metrics)

### Takeaway
For full-reference tuning, capture lossless or high-bitrate game footage, re-encode it to xCloud-like H.264 at ~12 Mb/s, run the chain, and score against the original. VMAF is the de facto choice in compressed-video SR challenges (AIM 2024 ranked by VMAF), but it is gameable by sharpening. Pair it with PSNR or a no-enhancement-gain variant to catch over-sharpening. For on-device or no-reference checks, gaming-specific NR models exist (GAMIVAL, nofu, a 2026 NR-VQA from NYCU/UT Austin/Netflix). Rendered-video NR metrics that score temporal stability are newly available (2025).

### Cited Findings
- AIM 2024 ranked by VMAF. The VMAF winner (SuperBicubic++, 66.4) had the lowest PSNR-Y (30.5 vs Lanczos 33.1), evidence that VMAF rewards sharpening and enhancement. — [arXiv 2409.17256](https://arxiv.org/html/2409.17256v1)
- 2026 gaming NR-VQA: a shared encoder supervised by multiple FR objectives during training, then frozen with a lightweight SVR head for NR. Aimed at real-time cloud-gaming monitoring. It notes VMAF "showed strong correlation with MOS in gaming streaming scenarios". — [arXiv 2602.11903](https://arxiv.org/html/2602.11903)
- GAMIVAL: gaming NR-VQA evaluated on the LIVE-Meta Mobile Cloud Gaming database, trained using VMAF-derived labels. — [arXiv 2305.02422](https://arxiv.org/pdf/2305.02422v1)
- nofu (2019, older): pixel-based NR model for gaming, reported to beat VMAF for gaming QoE. — [nofu paper](https://stg7.github.io/pdfs/2019/nofu_paper.pdf)
- 2025 NR metric for rendered video scoring image quality plus temporal stability, applied to comparing supersampling methods and frame generation. This is the closest match to upscaler validation. — [arXiv 2510.13349](https://arxiv.org/html/2510.13349v1)

### Inferences
- Suggested harness:
  1. Record clean reference clips (local console or PC capture at high bitrate).
  2. Encode with x264 at 12 Mb/s, Main profile, 1080p60 to mimic xCloud.
  3. Run the shader chain offline. A headless WebGL or the same GLSL in a desktop harness both work.
  4. Score with VMAF (and VMAF NEG to penalize enhancement gaming), LPIPS, and PSNR.
  5. Add a temporal-stability metric, such as flicker measured as frame-difference energy in static regions, or the 2025 rendered-video NR metric.
  6. Tune parameters by Bayesian search on a weighted score.
- VMAF NEG and CVQAD were not verified in this session. The recommendation to use VMAF NEG rests on general knowledge and should be checked against the Netflix vmaf repo.

### Gaps
- No sources were retrieved on VMAF NEG, CVQAD (MSU), or LPIPS used specifically for tuning post-processing upscalers.
- No source showed how mpv/libplacebo shader authors validate beyond the ArtCNN author's PSNR/SSIM-style tables.

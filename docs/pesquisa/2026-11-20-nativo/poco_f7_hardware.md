# Xiaomi Poco F7 (global, Snapdragon 8s Gen 4): hardware and OS limits for real-time cloud-game video post-processing

Scope: the base Poco F7 (not the F7 Pro or F7 Ultra). Research date: 2026-11-20. The Poco F7 Pro and F7 Ultra are different phones with different SoCs, and the Ultra also has a dedicated graphics chip. Do not carry their numbers or features over to the base F7.

## 1. Exact specs: SoC (CPU, GPU, NPU, video decoder), display, RAM, cooling, sustained performance

### Takeaway
The SoC is the SM8735 on TSMC 4 nm. Its CPU has 1x Cortex-X4 at 3.21 GHz, 3x A720 at 3.0 GHz, 2x A720 at 2.8 GHz and 2x A720 at 2.0 GHz. The GPU is the Adreno 825, officially rated for OpenGL ES 3.2, Vulkan 1.3 and OpenCL. The video decoder officially handles up to 4K60, with native VP9 and AV1, so a 1080p60 H.264 stream is a trivial load for the decoder itself.

The panel is a 6.83" 2772x1280 AMOLED at 120 Hz with 3840 Hz PWM. Memory is 12 GB LPDDR5X and storage is UFS 4.1. Cooling is passive. Sustained GPU performance is the weak point: in Notebookcheck's tests about 1/3 of performance is lost and some 3DMark stress tests abort with an overheating warning.

### Cited findings
**SoC and CPU**
- The chip is the Snapdragon 8s Gen 4 (SM8735) on 4 nm. Its CPU is 1x Cortex-X4 at 3.21 GHz, 3x A720 at 3.0 GHz, 2x A720 at 2.8 GHz and 2x A720 at 2.0 GHz. — [GSMArena SoC announcement](https://www.gsmarena.com/qualcomm_snapdragon_8s_gen_4_announced_with_kryo_cpu_adreno_825_gpu-news-67213.php); [Beebom](https://beebom.com/qualcomm-snapdragon-8s-gen-4-announced); [Nanoreview](https://nanoreview.info/en/phone/xiaomi-poco-f7)
- Poco's official spec page says "Snapdragon 8s Gen 4, TSMC 4nm, octa-core up to 3.21GHz, Adreno 825, Qualcomm Hexagon NPU". — [Poco F7 specs (po.co global)](https://www.po.co/global/product/poco-f7/specs/)
- Several reports say the chip uses TSMC N4P. — [Qualcomm 8s Gen 4 search summary / GSMArena](https://m.gsmarena.com/qualcomm_snapdragon_8s_gen_4_announced_with_kryo_cpu_adreno_825_gpu-news-67213.php)

**GPU**
- Qualcomm claims the GPU is 49% faster than the 8s Gen 3's. This is a marketing claim. — [Notebookcheck announcement](https://www.notebookcheck.net/Qualcomm-announces-Snapdragon-8s-Gen-4-Up-to-49-more-performance-for-affordable-flagships.991706.0.html); [GSMArena](https://www.gsmarena.com/qualcomm_snapdragon_8s_gen_4_announced_with_kryo_cpu_adreno_825_gpu-news-67213.php)
- Qualcomm's own 8s Gen 4 page lists the GPU APIs as "OpenGL ES 3.2, Vulkan 1.3, OpenCL 2.0 FP". — [Qualcomm 8s Gen 4 product page](https://www.qualcomm.com/smartphones/products/8-series/snapdragon-8s-gen-4-mobile-platform)
- Notebookcheck says few specifics are known about the shader count: "at least 768 unified shaders, 1024 or 1280 more likely". It lists Vulkan 1.3 and gives no official clock. Nanoreview lists a GPU clock of about 1150 MHz, which is unofficial. — [Notebookcheck Adreno 825](https://www.notebookcheck.net/Qualcomm-Adreno-825-Benchmarks-and-Specs.1063498.0.html); [Nanoreview SoC](https://nanoreview.net/ru/soc/qualcomm-snapdragon-8s-gen-4)
- For comparison, Notebookcheck lists the Adreno 830 (8 Elite) at 1536 shaders and about 1.1 GHz. — [Notebookcheck Adreno 825](https://www.notebookcheck.net/Qualcomm-Adreno-825-Benchmarks-and-Specs.1063498.0.html)
- Adreno 825 averages, per Notebookcheck:

  | Benchmark | Result |
  |---|---|
  | 3DMark Wild Life Extreme Unlimited | ~4499 |
  | Wild Life Unlimited | ~17898 |
  | Steel Nomad Light | ~1824 |
  | Solar Bay | ~8469 |
  | Geekbench 6 Vulkan | ~18816 |
  | Geekbench 6 OpenCL | ~13546 |
  | Aztec Normal offscreen power draw | ~11.8 W average (7 to 16.3 W) |

  — [Notebookcheck Adreno 825](https://www.notebookcheck.net/Qualcomm-Adreno-825-Benchmarks-and-Specs.1063498.0.html)
- Community Mesa Turnip builds from 2026 report Vulkan 1.4.359 and 1.4.362 on Adreno 825. These builds are unofficial and do not apply to the stock driver. — [Banners-Turnip releases](https://github.com/The412Banner/Banners-Turnip/releases)

**NPU**
- The NPU is a Hexagon with scalar, vector and tensor accelerators plus "Hexagon Direct Link". One outlet reports it as 44% faster than the previous generation. — [Qualcomm product brief (listing)](https://www.qualcomm.com/content/dam/qcomm-martech/dm-assets/documents/Product-Brief-Snapdragon-8s-Gen-4.pdf); [Android Central](https://www.androidcentral.com/phones/qualcomm/the-new-snapdragon-8s-gen-4-aims-to-make-premium-features-a-bit-more-accessible)

**Video decoder**
- Qualcomm's product brief says: "Video decode up to 4K at 60 FPS (native decode support VP9 and AV1 formats)". Aggregator sites claim 8K60 playback, which conflicts with the brief, so treat it as unverified. — [Qualcomm product brief](https://www.qualcomm.com/content/dam/qcomm-martech/dm-assets/documents/Product-Brief-Snapdragon-8s-Gen-4.pdf); conflicting: [FSL Specs](https://fsl-specs.com/mobile-processor/snapdragon-8s-gen-4-specs/), [91mobiles](https://www.91mobiles.com/processor/qualcomm-snapdragon-8s-gen-4-pdp)
- Maximum video resolution "remains capped at 4K (60 fps)" relative to the 8s Gen 3. — [Smartprix](https://www.smartprix.com/bytes/snapdragon-8s-gen-4-vs-8s-gen-3-how-do-the-premium-mid-range-processors-compare/)

**Display**
- The panel is 6.83", 1.5K, 2772x1280, 447 ppi, up to 120 Hz, with 68 billion colours and the DCI-P3 gamut. Brightness is 700 nits typical, 1700 nits HBM and 3200 nits peak (on 25% of the area). Contrast is 8,000,000:1, PWM dimming is 3840 Hz, and it supports HDR10+ and Dolby Vision. The glass is Gorilla Glass 7i. Touch sampling is 480 Hz, or 2560 Hz "only with Game Turbo Mode on". — [Poco F7 specs (po.co global)](https://www.po.co/global/product/poco-f7/specs/)
- GSMArena lists 12-bit colour depth, 120 Hz and 3840 Hz PWM. — [GSMArena via Notebookcheck search summary](https://m.gsmarena.com/xiaomi_poco_f7_5g-13951.php)
- Notebookcheck's measurements:

  | Measurement | Result |
  |---|---|
  | Brightness, full white | ~1637 nits |
  | Brightness, APL18 | 3318 nits |
  | Peak brightness, HDR | 3272 nits |
  | Colour accuracy | 98.9% sRGB, ColorChecker ΔE 1.1 |
  | Gamma | 2.24 |
  | Response time | ~1.1 ms black-to-white |
  | PWM | 120 Hz flicker (16.95% amplitude) plus 3846 Hz |

  — [Notebookcheck Poco F7 review](https://www.notebookcheck.net/Xiaomi-Poco-F7-smartphone-review-Potential-hit-for-bargain-hunters.1092382.0.html)

**Memory, OS, DRM**
- RAM is 12 GB LPDDR5X. Storage is UFS 4.1, 256 or 512 GB. The phone launched with HyperOS 2. — [Poco F7 specs](https://www.po.co/global/product/poco-f7/specs/)
- Notebookcheck lists HyperOS 2.0 on Android 15 and Widevine L1. — [Notebookcheck review](https://www.notebookcheck.net/Xiaomi-Poco-F7-smartphone-review-Potential-hit-for-bargain-hunters.1092382.0.html)

**Cooling**
- Poco India calls the system "POCO IceLoop": a liquid-vapor chamber with a 6000 mm² heat-dissipation area. The global spec page does not list the cooling hardware. — [poco.in F7 specs](https://www.poco.in/f7-specs); [po.co global specs](https://www.po.co/global/product/poco-f7/specs/)

**Sustained performance and throttling**
- Notebookcheck's 3DMark stress-test stability results for the Poco F7:

  | Test | Poco F7 | Poco F6 | Realme GT 7 (same SoC class) |
  |---|---|---|---|
  | Wild Life Stress | 76.3% | 73.5% | 99.5% |
  | Wild Life Extreme Stress | 78.6% | 82.3% | n/a |
  | Solar Bay Stress | 78.5% | 85% | 99.1% |
  | Steel Nomad Light Stress | 79.8% | 88.4% | 99.3% |

  The phone "reproducibly aborts some 3DMark stress tests with an overheating message". Tests complete only if the CPU starts at 30 °C or below. About 1/3 of performance is lost by the end. Surface temperatures under load are 44.6 °C average and 45.4 °C peak on top, and 45.1 °C on the bottom, at 22 °C ambient. — [Notebookcheck Poco F7 review](https://www.notebookcheck.net/Xiaomi-Poco-F7-smartphone-review-Potential-hit-for-bargain-hunters.1092382.0.html)
- Android Authority reports roughly 59.7% and 56.7% stability on the Wild Life stress tests and calls this poor. Mynexttablet says the phone shut down at a critical temperature before completing the Wild Life Extreme loop. The sources differ by test conditions, so expect high variance. — [Android Authority](https://www.androidauthority.com/snapdragon-8s-gen-4-benchmarks-poco-f7-nothing-phone-3-3569088) (fetched via search snippet; the page returned 403); [mynexttablet](https://mynexttablet.com/poco-f7-review/)
- Notebookcheck's series page recommends the iQOO Neo 10R, which has the same chipset, to hardcore gamers "sans the throttling issues". Beebom saw Genshin drop from 120 to 90 fps after throttling. — [Notebookcheck series](https://www.notebookcheck.net/Xiaomi-Poco-F7-Series.993976.0.html); [Beebom review](https://gadgets.beebom.com/reviews/poco-f7-5g)
- In the Notebookcheck review, Genshin ran at about 59 fps on its "120 fps" settings. — [Notebookcheck review](https://www.notebookcheck.net/Xiaomi-Poco-F7-smartphone-review-Potential-hit-for-bargain-hunters.1092382.0.html)

**Variants**
- The India and China (Redmi Turbo 4 Pro) units have a 7550 mAh battery. The global F7 was reported to have a smaller battery (6500 mAh, from a leak). The Indian F7 is described as a rebranded Redmi Turbo 4 Pro with a different design. — [Notebookcheck global battery](https://www.notebookcheck.net/Xiaomi-Poco-F7-to-launch-globally-with-nerfed-battery.1004508.0.html); [Smartprix India launch](https://www.smartprix.com/bytes/poco-f7-launched-in-india-with-snapdragon-8s-gen-4-7550mah-battery-for-rs-29999/); [GSMChina](https://gsmchina.com/?p=12592)

### Inferences
- The decoder is not the bottleneck at 60 Hz. The project measured decode at about 9 ms at 60 Hz and about 25 ms at 120 Hz. With a 4K60 AV1/VP9-capable block, the jump at 120 Hz looks like a pipeline or pacing effect (frame queueing, vsync phase, or the WebView compositor holding extra buffers), not a lack of decode throughput.
- GPU budget: the Adreno 825 is roughly one tier below the 830 and about 60% of 8 Elite throughput by shader count (estimated). The project's ~5 ms neural pass plus shaders sits inside a 16.7 ms frame. The real ceiling is thermal: expect a 20 to 35% clock drop after about 10 to 20 minutes. Budget the GPU work for the throttled state (~65 to 75% of peak), not for peak benchmark numbers.
- Panel geometry: in landscape the panel is 2772x1280 at about 19.5:9.
  - A 1920x1080 stream fitted to the panel height scales by 1280/1080 = **1.185x**. It renders at about 2276x1280, leaving pillarbox bars of about 248 px on each side.
  - Filling the panel width instead needs **1.444x** (2772/1920), which crops the image vertically to about 1559 px of height, a loss of about 18%.
  - So a "native" upscale target is only 1.185x in the fit case. A 1.5x or 2x super-resolution network is wasted work unless the WebView canvas runs at full 2772x1280 device pixels. Confirm `devicePixelRatio` and the canvas backing size.
- The 120 Hz flicker that Notebookcheck measured (16.95% amplitude) means "3840 Hz PWM" does not tell the whole story. It does not matter for processing, but it is relevant for user comfort.

### Gaps
- There is no official Adreno 825 ALU count, clock, GFLOPS figure or FP16 rate. Qualcomm does not publish them. Estimating them would need a device-side `clinfo` or `vulkaninfo` run.
- No gpuinfo.org report for the stock Adreno 825 driver turned up, so the exact Vulkan 1.3.x or 1.4 version and the GLES extension list are unknown. Running `vulkaninfo` and `adb shell dumpsys SurfaceFlinger` on the device would settle this.
- Hexagon NPU TOPS: Qualcomm does not publish a figure, and none was found.
- The H.264 decode level and maximum frame rate at 1080p (whether 240 fps is possible) are not documented. `MediaCodecInfo.VideoCapabilities` on the device would answer this.
- No Geekerwan or Golden Reviewer GPU power/performance curves were found for this specific SoC. The official product brief PDF could not be text-extracted: the fetch returned a badge graphic.
- Whether the vapor chamber is the same size on global and India units is unconfirmed. The 6000 mm² figure comes only from poco.in.

## 2. HyperOS 2/3 behaviour: refresh control, Game Turbo, background killing, thermal policy, display chip

### Takeaway
HyperOS limits many third-party apps to 60 Hz based on the app's declared preference and power policy. Xiaomi documents this itself and offers no supported per-app 120 Hz override.

The base Poco F7 advertises no dedicated display or graphics chip. The VisionBoost D7 chip, interpolation and super resolution belong to the F7 Ultra. The F7 Pro's "smart frame rate" works only for whitelisted games. Game Turbo exists on the F7 and officially unlocks 2560 Hz touch sampling. No source documents what it does to GPU governors.

HyperOS 3 (Android 16) reached the F7 in late 2025 with build 3.0.3.0.WOLMIXM.

### Cited findings
- Xiaomi's support FAQ says that not all third-party apps support high refresh rates. Another Xiaomi FAQ says that "certain Apps, especially third-party or resource-intensive Apps, can limit the refresh rate to reduce power consumption". — [Mi FAQ KA-483281](https://www.mi.com/global/support/faq/details/KA-483281/); [Mi FAQ KA-639769](https://www.mi.com/global/support/faq/details/KA-639769/)
- Developers report apps locked to 60 Hz on Xiaomi:
  - A Godot app on a Poco X6 runs at 60 while the system runs at 120.
  - Obsidian on a Xiaomi 13 Pro with HyperOS 1 is locked at 60 FPS.
  - On some builds, Android display settings show "based on app's preference".

  — [Godot forum](https://forum.godotengine.org/t/the-frame-rate-limit-on-android-is-60-fps-what-to-do/106289); [Obsidian forum](https://forum.obsidian.md/t/no-high-refresh-rate-on-android-xiaomi-13-pro/76871); [Unity discussions](https://discussions.unity.com/t/android-app-locked-to-60-fps-despite-targeting-120-hz-refresh-rate/1599621)
- Dropping to 60 Hz while video plays is a cross-OEM Android pattern (Fairphone, OxygenOS). Web content in Firefox and Chrome on Android is often capped at 60. — [Fairphone forum](https://forum.fairphone.com/t/display-throttles-from-120hz-to-60hz-while-watching-a-youtube-video/130509); [Android Police](https://www.androidpolice.com/oneplus-refresh-rate-autohz-workaround/); [Babylon.js forum](https://forum.babylonjs.com/t/mobile-browsers-and-the-60fps-cap/47582)
- A Poco F8 Ultra user on HyperOS found gameplay steadier at 60 Hz than at 120 Hz, which suggests frame-pacing issues at 120 Hz on Xiaomi devices. This is anecdotal. — [Sikayetvar](https://www.sikayetvar.com/en/poco-us/poco-f8-ultra-has-120hz-frame-pacing-problems)
- Game Turbo exists on the F7. The official spec page ties its 2560 Hz instant touch sampling to "Game Turbo Mode on". The global F7 spec page does not mention WildBoost. — [Poco F7 specs](https://www.po.co/global/product/poco-f7/specs/)
- The F7 Ultra has the VisionBoost D7, "POCO's first dedicated graphics boost chipset" on 12 nm. It provides "120FPS frame interpolation" and super resolution "currently only support Genshin Impact". Xiaomi notes that third-party FPS apps show the rendered rate, while interpolated output reaches 120.

  The F7 Pro offers Smart Frame Rate only in listed games (PUBG Mobile, MLBB, Wild Rift, CoD Mobile, Genshin, Honor of Kings), and its page does not mention the D7 chip.

  — [Poco F7 Ultra overview](https://www.mi.com/global/product/poco-f7-ultra/); [Mi FAQ KA-565287](https://www.mi.com/ph/support/faq/details/KA-565287/); [Poco F7 Pro overview](https://www.mi.com/global/product/poco-f7-pro/)
- WildBoost Optimisation 4.0 is described as AI resource reallocation (frame rate, cooling, in-game resolution) on the F7 Ultra. — [GosuGamers F7 Ultra review](https://www.gosugamers.net/entertainment/news/74741-poco-f7-ultra-review-a-great-gaming-phone-and-a-massive-leap-for-poco)
- On the Poco X7, game super resolution and frame insertion were not supported in the first OS batch, which shows these features depend on the OEM and the game whitelist. — [Mi FAQ KA-524468](https://www.mi.com/ph/support/faq/details/KA-524468)
- HyperOS 3 rollout: build 3.0.3.0.WOLMIXM went to the F7 (global) in about November 2025, and the Game Turbo dashboard was refreshed. — [Gizchina](https://www.gizchina.com/poco/my-favorite-poco-finally-picks-up-the-global-hyperos-3-update-at-last); [Sportskeeda](https://widgets.sportskeeda.com/gaming-tech/all-poco-phones-set-get-android-16-update); [Notebookcheck HyperOS 3 Poco rollout](https://www.notebookcheck.net/Xiaomi-starts-global-rollout-of-stable-HyperOS-3-update-for-Poco-devices.1152272.0.html)
- HyperOS 3 reportedly hurt emulation and GPU performance on some Xiaomi devices, and custom GPU drivers fixed the stutter. — [Notebookcheck](https://www.notebookcheck.net/HyperOS-3-update-reportedly-hurts-game-emulation-performance-on-some-Xiaomi-devices.1185752.0.html)
- Game Turbo "Performance mode" is said to lock the CPU and GPU at higher frequencies, but the only source is low-authority and is not confirmed by Xiaomi. — [Wondershare guide](https://drfone.wondershare.com/android-xiaomi/how-to-use-game-turbo-on-xiaomi-redmi-poco-for-better-gaming.html)

### Inferences
- The project's finding that the WebView app cannot switch refresh rate fits Xiaomi's documented policy. HyperOS decides the refresh rate per app, and WebView or browser surfaces with video tend to be pinned to 60 Hz.
- The measured 120 Hz penalty (decode 9 to 25 ms, latency 21 to 47 ms) argues for treating **60 Hz as the target** anyway. A 60 fps stream on a 120 Hz panel gains nothing unless frames are generated, and HyperOS pacing at 120 Hz appears to be fragile.
- A native path could call `Surface.setFrameRate(60, FRAME_RATE_COMPATIBILITY_FIXED_SOURCE)` on a SurfaceView. This is the standard Android API, but whether HyperOS honours it is unverified. Doing so would make the panel run at a clean 60 Hz multiple and avoid the 120 Hz mode switch.
- Adding the app's package to Game Turbo is the only user-accessible lever likely to change the scheduler or thermal profile and touch sampling. Its GPU-governor effect is undocumented, so it must be A/B-measured on the device (GPU frequency via Perfetto or `/sys/class/kgsl/kgsl-3d0/devfreq/cur_freq` with root or adb).
- The base F7 has no D7/X7-type chip, so there is no hardware MEMC or super-resolution path for the stream. All enhancement must run on the Adreno or Hexagon.

### Gaps
- No source says whether the base F7 (or its twin, the Redmi Turbo 4 Pro) has any independent display chip. The F7 global spec page names none, which suggests it has none, but this is not explicitly confirmed.
- No documentation was found on whether HyperOS honours `setFrameRate` or `preferredDisplayModeId` from third-party apps or WebView. There is also no confirmed per-app refresh-rate menu on HyperOS 2/3 for the F7.
- No source covers Game Turbo GPU governor changes, thermal limits for whitelisted apps, or PowerKeeper or Joyose behaviour for this specific device.
- No F7-specific data was found on background killing or the HyperOS battery saver's effect on a WebView streaming app. General Xiaomi aggressiveness is well known anecdotally (dontkillmyapp), but no F7-specific measurements were found.
- Whether HyperOS offers an FHD+ versus 1.5K resolution toggle on the F7 (which would change the WebView canvas backing size) was not verified.

## 3. Qualcomm features (Elite Gaming, AFME, Game Super Resolution, post-processing) and third-party access; developer tools

### Takeaway
The 8s Gen 4 lists Snapdragon Game Super Resolution 2.0, Adreno Frame Motion Engine 2.0 and hardware ray tracing. AFME is exposed to developers through GLES/Vulkan extensions (`QCOM_frame_extrapolation`, `QCOM_motion_estimation`) in the Adreno GPU SDK and the Snapdragon Game Toolkit. That means a **native** Vulkan or GLES app could use it, but WebGL2 or WebGPU inside a WebView cannot.

Snapdragon Profiler claims support for "all Snapdragon devices" and supports Perfetto. No source confirms Adreno 825 specifically.

### Cited findings
- The product brief's gaming features are Snapdragon Game Super Resolution 2.0, Adreno Frame Motion Engine 2.0, and hardware ray tracing with global illumination. — [Qualcomm 8s Gen 4 product brief](https://www.qualcomm.com/content/dam/qcomm-martech/dm-assets/documents/Product-Brief-Snapdragon-8s-Gen-4.pdf) (feature list seen in a search snippet; the full PDF text could not be extracted)
- Qualcomm describes AFME (on the 8s Gen 3 page) as doubling a game's frame rate from 60 to 120 fps. — [Qualcomm 8s Gen 3 page](https://www.qualcomm.com/smartphones/products/8-series/snapdragon-8s-gen-3-mobile-platform)
- The Snapdragon Game Toolkit includes an "Adaptive Frame Motion Extrapolation" sample using `QCOM_frame_extrapolation` and a `QCOM_motion_estimation` sample that generates motion-vector textures. — [Snapdragon Game Toolkit samples](https://www.qualcomm.com/developer/snapdragon-game-toolkit/samples); [Qualcomm blog: GPU motion estimation](https://www.qualcomm.com/developer/blog/2024/03/gpu-motion-estimation-improved-handling-repeating-patterns)
- Third-party apps have used the Adreno motion engine: Virtual Desktop (Synchronous Spacewarp) and Meta Horizon Hyperscape. — [Qualcomm blog: SSW](https://www.qualcomm.com/developer/blog/2022/09/virtual-boost-vr-rendering-performance-synchronous-space-warp); [Qualcomm blog: Hyperscape judder](https://www.qualcomm.com/developer/blog/2025/06/using-qualcomm-adreno-gpu-to-improve-judder-meta-horizon-hyperscape)
- The GDC 2026 recap lists AFME2, SGSR2 and Snapdragon Adaptive Game Configuration as available developer technologies. — [Qualcomm GDC 2026 recap](https://www.qualcomm.com/developer/blog/2026/05/snapdragon-game-studios-developer-forum-gdc-2026-recap)
- In September 2026 Qualcomm announced the "Adreno Neural Fusion SDK", which bundles Vulkan integration, a UE5 plugin, Unity 6.6+ and Snapdragon Profiler integration. The page body could not be retrieved, so the supported SoCs are unknown. — [Qualcomm blog: Adreno Neural Fusion SDK](https://www.qualcomm.com/developer/blog/2026/09/introducing-adreno-neural-fusion-sdk-for-snapdragon-mobile-platforms)
- Qualcomm's Adreno low-power gaming guide also exists. — [Qualcomm blog 2025/08](https://www.qualcomm.com/developer/blog/2025/08/optimize-performance-and-graphics-for-adreno-gpu-low-power-gaming)
- Snapdragon Profiler "works with all devices powered by Snapdragon processors", offers more than 150 hardware counters in 22 categories, and supports Perfetto traces on Android Q and later. No per-chip list is published. The separate HTP (NPU) profiler lists SM8850, SM8750 and SM8650 only, not SM8735. — [Snapdragon Profiler FAQ](https://developer.qualcomm.com/software/snapdragon-profiler/faq); [Profiler release notes](https://docs.qualcomm.com/bundle/publicresource/80-71528-1/topics/profiler_release_notes.md); [HTP profiler KBA](https://docs.qualcomm.com/doc/KBA-260416042116/KBA-260416042116_REV_2_CDSPKBA_Qualcomm_Profiler_for_HTP_Usage.pdf)

### Inferences
- From WebGL2 or WebGPU in Chromium WebView, no Qualcomm-specific extension (AFME, motion estimation, SGSR hardware paths) is reachable. Chromium does not expose `QCOM_*` extensions to web content.
- SGSR's algorithm is a shader and can be reimplemented in WebGL2. Qualcomm published SGSR1 as source on GitHub, but this was not verified in this session.
- To use AFME or motion estimation for 60 to 120 fps interpolation of the stream, the project would need a native rendering path: decode with MediaCodec into a SurfaceTexture or AHardwareBuffer, then process with GLES or Vulkan. Given the measured 120 Hz penalty and the thermal limits, 60 to 120 interpolation probably costs more than it delivers on this device.
- The Hexagon NPU is reachable natively (QNN or LiteRT/NNAPI delegates), not from WebView. Moving the ~5 ms neural pass to the NPU would free GPU budget and heat, but only on a native path.

### Gaps
- No confirmed Snapdragon Profiler, Adreno GPU Inspector or Android GPU Inspector support listing for SM8735 or Adreno 825. Test directly. Perfetto's `gpu.counters` data source availability depends on the OEM driver.
- Whether HyperOS ships the Qualcomm "Game Post Processing Accelerator" or any low-latency video decode mode (for example the `KEY_LOW_LATENCY` MediaCodec feature) on the F7 was not found. Query `MediaCodecInfo` on the device for `FEATURE_LowLatency`.
- Whether the F7's stock driver actually exposes `GL_QCOM_frame_extrapolation` or `GL_QCOM_motion_estimation` (some are OEM-gated) is unverified. Check with `adb shell` plus a GLES extension dump.

from pathlib import Path
# Spec 4: the renderer choice in the real player hook (WebGL2Player from script.js + image-filter.js). WebGPU
# draws on its own canvas under the WebGL2 one; temporal hands frames back to WebGL2; a failure or a lost
# device falls back to WebGL2 without a reload; direct capture feeds VideoFrames to WebGPU. Needs a WebGPU
# adapter (run-browser-tests.py launches it with the WebGPU flags); without one it reports itself skipped.
probe=r'''
(async()=>{
 const checks=[];function check(ok,label){if(!ok)throw new Error(label);checks.push(label);}
 const wait=ms=>new Promise(r=>setTimeout(r,ms));
 const until=async(fn,ms=8000)=>{const end=performance.now()+ms;while(performance.now()<end){if(fn())return true;await wait(50);}return false;};
 const adapter=navigator.gpu&&await navigator.gpu.requestAdapter();
 let device=null;try{device=adapter&&await adapter.requestDevice();}catch{}
 if(!device){document.getElementById('result').textContent=JSON.stringify({passed:['WebGPU unavailable here: suite skipped'],skipped:true,reason:adapter?'no device':'no adapter'});return;}
 device.destroy();
 window.pageMarker=Math.random();const marker=window.pageMarker;
 const src=document.createElement('canvas');src.width=320;src.height=180;const ctx=src.getContext('2d');
 const stream=src.captureStream(30);let n=0;let running=true;
 (async()=>{while(running){ctx.fillStyle=`rgb(${(n*37)%256},${(n*91)%256},90)`;ctx.fillRect(0,0,320,180);ctx.fillStyle='#fff';ctx.fillRect((n*7)%300,40,12,100);n++;await wait(33);}})();
 const video=document.createElement('video');video.muted=true;video.autoplay=true;video.playsInline=true;video.srcObject=stream;document.body.append(video);
 await new Promise(r=>video.addEventListener('loadeddata',r,{once:true}));await video.play().catch(()=>{});
 const player=new WebGL2Player(video);await player.setupShaders();
 let hold=false;const draw=()=>{if(player.isStopped)return;if(!hold)player.updateFrame();video.requestVideoFrameCallback(draw);};video.requestVideoFrameCallback(draw);
 const api=BxImageFilter,gpuCanvas=()=>document.querySelector('canvas[data-bx-renderer=webgpu]');
 api.update({renderer:'auto',fluidity:'off',capture:'video'});await wait(500);
 check(api.status.renderer.active==='webgl2'&&!gpuCanvas(),'Auto draws with WebGL2 and creates no WebGPU canvas');
 api.update({renderer:'webgpu'});
 check(await until(()=>api.status.renderer.active==='webgpu',15000),'WebGPU takes over once its pipelines are ready ('+api.status.renderer.state+' '+api.status.renderer.reason+')');
 const c=gpuCanvas();check(c&&c.nextElementSibling===player.$canvas&&c.style.visibility==='visible'&&player.$canvas.style.opacity==='0','WebGPU canvas sits under the transparent WebGL2 canvas');
 check(c.style.pointerEvents==='none'&&c.width===player.$canvas.width&&c.height===player.$canvas.height&&c.style.width===player.$canvas.style.width,'WebGPU canvas follows the WebGL2 canvas size and style, without input');
 {const f0=player.bxRender.frames;await wait(700);check(player.bxRender.renderer==='webgpu'&&player.bxRender.frames>f0,'WebGPU renders the video frames');}
 // Audit R1: the adapter of the engine fills the probe that Auto compares with BxRestoration.AUTO_WEBGPU.
 {const p=api.status.renderer.probe,a=player.bxRender.adapter;check(p&&p.vendor===a.vendor&&p.architecture===a.architecture&&BxRestoration.autoRenderer(p)==='webgl2','The WebGPU adapter fills the probe read by Auto',p);}
 // Audit R10: one measurement per player, shared by both renderers; nothing is saved without a treated frame.
 check(player.bxGpu.engine.diagnostics===player.bxEngine.diagnostics&&player.bxDiagnostics===player.bxEngine.diagnostics,'Both renderers share the player measurement');
 {hold=true;await wait(200);let saved=0;const download=BxRestoration.downloadReport;BxRestoration.downloadReport=()=>{saved++;};
  check(await api.startMeasurement(),'Measurement starts with no frame drawn');const r=await api.exportMeasurement();BxRestoration.downloadReport=download;hold=false;
  check(r&&r.saved===false&&r.segments.length===0&&saved===0&&!api.measuring,'An export without segments saves no file and says so (saved false)');}
 // Read in the task that draws: a WebGPU canvas texture is only readable until it is presented.
 {player.bxLastFrame=null;player.updateFrame();const t=document.createElement('canvas');t.width=c.width;t.height=c.height;const x=t.getContext('2d');x.drawImage(c,0,0);const p=x.getImageData(0,0,t.width,t.height).data;let lit=0;for(let i=0;i<p.length;i+=4)if(p[i]+p[i+1]+p[i+2]>30)lit++;
  check(lit>p.length/8,'The WebGPU canvas shows the picture ('+lit+' lit pixels)');}
 // Fluidez with direct capture: VideoFrames imported without a copy, the last pass in present().
 api.update({fluidity:'balanced',capture:'direct'});
 check(await until(()=>player.bxDirect&&player.bxDirect.rendered>10),'Direct capture renders VideoFrames with WebGPU');
 check(api.status.renderer.active==='webgpu'&&player.bxTiming.pacer&&player.bxTiming.shown,'The pacer presents WebGPU slots');
 if(player.bxRender.timestamps){await wait(1500);player.bxRender.poll();check(player.bxRender.budget.values.length>0&&api.status.measurement==='gpu','timestamp-query feeds the budget: measurement is GPU time, not cadence');}
 check(await api.startMeasurement(),'Measurement starts with WebGPU');await wait(800);
 {let report=null;BxRestoration.downloadReport=r=>{report=r;};await api.exportMeasurement();check(report&&report.metadata.api==='webgpu'&&report.segments.some(s=>s.config.renderer==='webgpu'),'The measurement records the WebGPU renderer');
  // Audit 3.5: WebGPU segments list their passes too (import of the decoded frame first, the deferred last pass marked @present).
  const seg=report.segments.find(s=>s.config.renderer==='webgpu'),seq=seg.passes[0]?.sequence||'';
  check(seg.passes.length>0&&/^import,/.test(seq)&&/@present$/.test(seq)&&seg.final&&seg.final.name===seq.split(',').pop().replace(/[#@].*$/,'')&&seg.cpu.count>0,'WebGPU segments list their passes and the main-thread cost ('+seq+')');}
 // Temporal is WebGL2-only: the frames go back to WebGL2 and return once it is off. A measurement started
 // before the switch keeps recording (audit R10): each renderer only adds its own segments.
 check(await api.startMeasurement(),'Measurement starts before the renderer switch');await wait(300);
 api.update({temporal:.5});check(await until(()=>api.status.renderer.active==='webgl2'),'Temporal hands the frames back to WebGL2');
 check(gpuCanvas().style.visibility==='hidden'&&player.$canvas.style.opacity==='','WebGL2 canvas is visible again');
 check(/WebGL2/.test(api.status.renderer.reason),'The panel status says why');
 await wait(400);check(api.measuring,'The measurement is still recording on WebGL2');
 api.update({temporal:0});check(await until(()=>api.status.renderer.active==='webgpu'),'WebGPU resumes when temporal is off');
 await wait(400);
 {let report=null;BxRestoration.downloadReport=r=>{report=r;};const r=await api.exportMeasurement();const renderers=report?[...new Set(report.segments.map(s=>s.config.renderer))]:null;
  check(r===report&&r.saved===true&&report.metadata.api==='webgpu'&&renderers.includes('webgpu')&&renderers.includes('webgl2')&&report.segments.every(s=>s.frames>0),'A renderer switch during the recording only adds segments: the export names both renderers',renderers);
  const switches=report.events.filter(e=>e.type==='renderer').map(e=>e.to);check(switches.includes('webgl2')&&switches.includes('webgpu')&&report.events.every(e=>Number.isFinite(e.t)),'The renderer switches are dated events of the measurement ('+switches.join(',')+')');}
 // A failure falls back to WebGL2 at once, without a reload, and is not retried until the setting changes.
 const glFrames=player.bxEngine.frames;player.bxRender.fail('forced in test');
 check(api.status.renderer.active==='webgl2'&&api.status.renderer.state==='fallback'&&!gpuCanvas()&&player.$canvas.style.opacity==='','A WebGPU failure falls back to WebGL2 and removes its canvas');
 check(await until(()=>player.bxEngine.frames>glFrames+5),'WebGL2 keeps rendering after the fallback');
 check(window.pageMarker===marker&&player.bxDirect,'No reload, direct capture still on');
 await wait(500);check(!gpuCanvas()&&api.status.renderer.state==='fallback','A failed WebGPU is not retried by itself');
 api.update({renderer:'webgl2'});api.update({renderer:'webgpu'});
 check(await until(()=>api.status.renderer.active==='webgpu',15000),'Changing the setting retries WebGPU');
 // A lost device (driver reset, GPU process crash) is a failure too.
 player.bxRender.device.destroy();
 check(await until(()=>api.status.renderer.active==='webgl2'&&api.status.renderer.state==='fallback'),'A lost WebGPU device falls back to WebGL2');
 check(await until(()=>player.bxEngine.frames>0)&&window.pageMarker===marker,'Still the same page');
 api.update({renderer:'webgl2'});api.update({renderer:'webgpu'});check(await until(()=>api.status.renderer.active==='webgpu',15000),'WebGPU comes back after a lost device when chosen again');
 player.destroy();check(!gpuCanvas()&&!player.bxGpu,'Destroying the player removes the WebGPU canvas');
 running=false;api.update({renderer:'auto',fluidity:'off',capture:'video'});
 document.getElementById('result').textContent=JSON.stringify({passed:checks});
})().catch(e=>{document.getElementById('result').textContent=JSON.stringify({error:e.message});console.error(e);});
'''
original=Path('script.js').read_text(encoding='utf-8');a=original.index('class WebGL2Player');b=original.index('class VideoPlayer',a)
base="\nconst prefs={'video.processing.sharpness':2,'video.processing':'cas','video.processing.mode':'performance','video.player.type':'webgl2'};function getStreamPref(key){return prefs[key]??'default';}\nclass BaseCanvasPlayer {\n constructor(type,video){this.$video=video;this.$canvas=document.createElement('canvas');this.$canvas.width=128;this.$canvas.height=96;this.$canvas.style.cssText='width:320px;height:180px';document.body.append(this.$canvas);this.options={processing:'cas',processingMode:'performance',sharpness:2,brightness:100,contrast:100,saturation:100};}\n toFilterId(){return 2;}destroy(){this.isStopped=true;if(this.$canvas.isConnected)this.$canvas.remove();}setTargetFps(t){this.targetFps=t;}\n}\n"
Path('output/playwright').mkdir(parents=True,exist_ok=True)
Path('output/playwright/renderer-harness.html').write_text('<!doctype html><meta charset="utf-8"><pre id="result">Running</pre><script src="../restoration.bundle.js"></script><script>'+base+original[a:b]+''.join(Path('src/'+n).read_text(encoding='utf-8') for n in ('image-filter.js','panel.js','hud.js'))+probe+'</script>',encoding='utf-8')

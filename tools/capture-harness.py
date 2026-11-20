from pathlib import Path
# Direct capture over a real WebRTC loopback: frames arriving in pairs 3 ms apart are partly skipped by the
# <video> element (one frame per display refresh) but all reach the treatment through the track processor.
probe=r'''
(async()=>{
 const checks=[];function check(ok,label){if(!ok)throw new Error(label);checks.push(label);}
 const wait=ms=>new Promise(r=>setTimeout(r,ms));
 const src=document.createElement('canvas');src.width=320;src.height=180;const ctx=src.getContext('2d');
 const stream=src.captureStream(0),track=stream.getVideoTracks()[0];
 const a=new RTCPeerConnection(),b=new RTCPeerConnection();
 a.onicecandidate=e=>e.candidate&&b.addIceCandidate(e.candidate);b.onicecandidate=e=>e.candidate&&a.addIceCandidate(e.candidate);
 a.addTrack(track,stream);
 const video=document.createElement('video');video.muted=true;video.autoplay=true;video.playsInline=true;document.body.append(video);
 const loaded=new Promise(r=>video.addEventListener('loadeddata',r,{once:true}));
 b.ontrack=e=>{video.srcObject=e.streams[0];video.play().catch(()=>{});};
 await a.setLocalDescription();await b.setRemoteDescription(a.localDescription);await b.setLocalDescription();await a.setRemoteDescription(b.localDescription);
 let produced=0;const produce=()=>{ctx.fillStyle=`rgb(${(produced*37)%256},${(produced*91)%256},90)`;ctx.fillRect(0,0,320,180);track.requestFrame();produced++;};
 let running=true;(async()=>{for(let i=0;running;i++){produce();await wait(i%2?63:3);}})();
 await loaded;
 window.STATES={currentStream:{peerConnection:b}};
 const player=new WebGL2Player(video);await player.setupShaders();
 // Upstream drawFrame: one updateFrame per presented video frame.
 const draw=()=>{if(player.isStopped)return;player.updateFrame();video.requestVideoFrameCallback(draw);};video.requestVideoFrameCallback(draw);
 const api=BxImageFilter;api.update({fluidity:'balanced',capture:'video'});
 await wait(800);
 const measure=async ms=>{const f0=player.bxEngine.frames,p0=produced;await wait(ms);return {rendered:player.bxEngine.frames-f0,produced:produced-p0};};
 const viaVideo=await measure(3000);
 check(api.status.origin.missed>0,`Video path skips bunched frames (${api.status.origin.missed} of ${api.status.origin.presented} in 2 s)`);
 check(api.directSupported(),'Track processor and VideoFrame are available');
 check(await api.startMeasurement(),'Measurement starts on the video path');await wait(1500);
 // Record what the pacer schedules after switching sources mid-session (same pacer, new clock).
 const scheduled=[],add=player.bxTiming.pacer.add.bind(player.bxTiming.pacer);player.bxTiming.pacer.add=f=>{scheduled.push(f);return add(f);};
 api.update({capture:'direct'});await wait(800);
 check(api.status.capture.active&&player.bxDirect,'Direct capture starts with Fluidez on');
 const direct=await measure(3000);
 const leads=scheduled.filter(f=>f.clock==='frame'&&f.p!=null).map(f=>f.p-f.arrival);
 check(leads.length>40&&leads.filter(v=>Math.abs(v-3)<1e-6).length<leads.length/2,`Pacer schedules direct frames after the switch (${leads.filter(v=>Math.abs(v-3)<1e-6).length} of ${leads.length} at arrival + 3 ms)`);
 check(direct.rendered>=direct.produced*.9,`Direct capture renders every decoded frame (${direct.rendered} of ${direct.produced})`);
 check(direct.rendered/direct.produced>viaVideo.rendered/viaVideo.produced+.15,`More frames than the video path (${direct.rendered}/${direct.produced} vs ${viaVideo.rendered}/${viaVideo.produced})`);
 check(api.status.fluidity&&api.status.pacing&&api.status.origin.missed===null,'Pacer runs on capture timestamps; video-element skips no longer apply');
 check(player.gl.getError()===player.gl.NO_ERROR,'VideoFrame upload renders without GL errors');
 // Without VideoFrame metadata, direct-capture arrival is the delivery to the script: not graded as network.
 check(api.status.origin.arrivalNetwork||api.ui.snapshot().gArr==='none',`Delivery time is not graded as network arrival (arrivalNetwork ${api.status.origin.arrivalNetwork})`);
 // Leaving the app mid-measurement: the hidden time is not recorded as a frame interval.
 Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));await wait(1500);
 delete document.hidden;await wait(800);
 // Measurement across the switch: per-segment intervals without mixed clocks, the Fluidez wait, a timeline
 // from the real getStats, the GPU method and the file saved through the Android bridge.
 let savedFile=null;window.BxAndroid={saveFile:(name,mime,text)=>{savedFile={name,mime,text};return 'Downloads/xCloud ImageFilter/'+name;}};
 const report=await api.exportMeasurement();delete window.BxAndroid;
 const segs=report.segments,seg=segs.find(s=>s.config.settings.capture==='direct'&&s.display.count>40);
 check(savedFile&&/^bx-v10\.1\.3-diagnostics-\d+\.json$/.test(savedFile.name)&&JSON.parse(savedFile.text).schema===4,'Measurement is saved through the Android bridge (schema 4)');
 check(seg&&seg.arrival.count>40&&seg.server.count>40&&seg.wait.count>40,`Direct segment records display, arrival, server and wait intervals (${seg&&[seg.display.count,seg.arrival.count,seg.server.count,seg.wait.count]})`);
 // Audit 3.5: the direct segment keeps the main-thread cost per frame and its passes end at present(); the video
 // segment before the switch has the lateness against the expected display time; the switch to direct capture is a dated event.
 check(seg.cpu.count>40&&seg.cpu.meanMs>0&&seg.passes.length>0&&seg.passes.every(p=>/^upload,.*@present$/.test(p.sequence))&&seg.final.name===seg.passes[0].sequence.split(',').pop().replace(/[#@].*$/,''),`Direct segment records the cpu series and deferred pass sequences (${seg.passes[0].sequence}; cpu ${seg.cpu.count} frames, mean ${seg.cpu.meanMs&&seg.cpu.meanMs.toFixed(2)} ms)`);
 const videoSeg=segs.find(s=>s.config.settings.capture!=='direct'&&s.frames>10);
 check(videoSeg&&videoSeg.cpu.count>10&&videoSeg.late.count>10&&videoSeg.late.hitches===null&&Number.isFinite(videoSeg.late.p50)&&videoSeg.late.p95>=videoSeg.late.p50&&videoSeg.late.maxMs>-1,`Video segment records the lateness against the expected display time (p50 ${videoSeg&&videoSeg.late.p50} ms, p95 ${videoSeg&&videoSeg.late.p95} ms, ${videoSeg&&videoSeg.pipeline.count} pipeline samples)`);
 const kinds=[...new Set(report.events.map(e=>e.type))];check(report.events.some(e=>e.type==='capture'&&e.active===true)&&report.events.every(e=>Number.isFinite(e.t)&&e.t>=0),`The switch to direct capture is a dated event (${kinds.join(',')})`);
 const longest=Math.max(...segs.flatMap(s=>[s.server.maxMs||0,s.arrival.maxMs||0]));
 check(longest<500,`No interval spans the switch between clocks (longest ${longest.toFixed(1)} ms)`);
 const shown=Math.max(...segs.map(s=>s.display.maxMs||0)),waited=Math.max(...segs.map(s=>s.wait.maxMs||0));
 check(shown<1000&&waited<1000,`No display or wait interval spans the hidden page (longest ${shown.toFixed(1)} / ${waited.toFixed(1)} ms)`);
 // Without a GPU timer the adaptation follows the decoder's live rate, with no CAS/original reference.
 {const engine=player.bxEngine,timer=engine.ext,cadence=engine.budget.cadence,calls=[];player.bxReferenceFps=null;engine.ext=null;engine.budget.cadence=(...args)=>calls.push(args);await wait(7000);engine.ext=timer;engine.budget.cadence=cadence;
  check(calls.some(([reference,shown,margin])=>reference>=10&&shown>0&&margin===.95),`Without a GPU timer the cadence follows the live decoder rate (${JSON.stringify(calls.map(c=>c.map(v=>typeof v==='number'?Math.round(v*100)/100:v)))})`);}
 check(segs.every(s=>s.wait.hitches===null&&Number.isInteger(s.videoSkipped))&&segs.some(s=>s.videoSkipped>0),`Per-segment video skips are recorded (${segs.map(s=>s.videoSkipped)})`);
 check(report.timeline.length>=2&&report.timeline.every(r=>Number.isFinite(r.t))&&report.timeline.some(r=>r.capture==='direct'&&r.fpsReceived>0&&r.bitrateMbps>0),`Timeline has a row per second from getStats (${report.timeline.length} rows)`);
 check(report.metadata.gpuMethod===(player.bxEngine.ext?'timer':'fence')&&report.metadata.refreshMeasuredHz>20&&report.metadata.betterXcloud&&report.status.capture.active,`Metadata names the GPU method (${report.metadata.gpuMethod}) and the measured refresh (${report.metadata.refreshMeasuredHz} Hz)`);
 if(!player.bxEngine.ext)check(api.status.gpuEstimate?.count>0&&api.status.gpuEstimate.p95>0&&segs.some(s=>s.gpu.count>0),`Without the GPU timer, fences estimate the GPU time (p95 ${api.status.gpuEstimate?.p95?.toFixed(1)} ms)`);
 // Better xCloud's FPS limit also applies to direct capture.
 player.setTargetFps(10);const capped=await measure(2000);player.setTargetFps(60);
 check(capped.rendered/2<=12&&capped.rendered>=10,`FPS limit of 10 applies to direct capture (${capped.rendered} in 2 s)`);
 const clone=player.bxDirect.track;api.update({capture:'video'});player.updateFrame();
 check(!player.bxDirect&&clone.readyState==='ended'&&!api.status.capture.active,'Switching back stops the cloned track');
 const viaVideoAgain=await measure(1000);check(viaVideoAgain.rendered>0,'Video path resumes');
 api.update({capture:'direct',fluidity:'off'});player.updateFrame();check(!player.bxDirect,'Direct capture needs Fluidez');
 // Fallback when the browser lacks the processor.
 const saved=window.MediaStreamTrackProcessor;delete window.MediaStreamTrackProcessor;
 api.update({fluidity:'balanced',capture:'direct'});await wait(500);
 check(!player.bxDirect&&/indisponível/i.test(api.status.capture.reason),'Unsupported browser falls back to the video path with a reason');
 const fallback=await measure(1000);check(fallback.rendered>0,'Video path keeps rendering after the fallback');
 window.MediaStreamTrackProcessor=saved;api.update({capture:'video'});api.update({capture:'direct'});await wait(800);
 check(player.bxDirect&&api.status.capture.frames>0,'Changing the setting retries direct capture');
 const last=player.bxDirect.track;player.destroy();
 check(last.readyState==='ended'&&!api.status.capture.active,'Destroying the player stops direct capture');
 running=false;a.close();b.close();api.update({capture:'video',fluidity:'off'});delete window.STATES;
 document.getElementById('result').textContent=JSON.stringify({passed:checks});
})().catch(e=>{document.getElementById('result').textContent=JSON.stringify({error:e.message});console.error(e);});
'''
original=Path('script.js').read_text();a=original.index('class WebGL2Player');b=original.index('class VideoPlayer',a)
base="\nconst prefs={'video.processing.sharpness':2,'video.processing':'cas','video.processing.mode':'performance','video.player.type':'webgl2'};function getStreamPref(key){return prefs[key]??'default';}\nclass BaseCanvasPlayer {\n constructor(type,video){this.$video=video;this.$canvas=document.createElement('canvas');this.$canvas.width=128;this.$canvas.height=96;this.$canvas.style.cssText='width:320px;height:180px';document.body.append(this.$canvas);this.options={processing:'cas',processingMode:'performance',sharpness:2,brightness:100,contrast:100,saturation:100};}\n toFilterId(){return 2;}destroy(){this.isStopped=true;}setTargetFps(t){this.targetFps=t;}\n}\n"
Path('output/playwright').mkdir(parents=True,exist_ok=True)
Path('output/playwright/capture-harness.html').write_text('<!doctype html><meta charset="utf-8"><pre id="result">Running</pre><script src="../restoration.bundle.js"></script><script>'+base+original[a:b]+''.join(Path('src/'+n).read_text() for n in ('image-filter.js','panel.js','hud.js'))+probe+'</script>')

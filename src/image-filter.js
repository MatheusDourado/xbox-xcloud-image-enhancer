// Better xCloud adapter for the shared restoration engine: rendering, frame timing, stream telemetry
// and the window.BxImageFilter API read by the panel (panel.js) and the in-game HUD (hud.js).
(() => {
 // v9 has measured defaults; a new key keeps v8.x saved values from overriding them.
 const key='BxImageFilter.v9';let saved;try{saved=JSON.parse(localStorage.getItem(key));}catch{}
 // Spec 3 changed the defaults (sharpness 2, no Compression/Detail, Debanding 60%). A user still on the
 // untouched v9 defaults moves to the new ones once; anything customised stays. 'Padrão v9' brings them back.
 try{if(saved&&typeof saved==='object'&&!localStorage.getItem('BxImageFilter.spec3')){const v9=BxRestoration.presets.v9.values;
  if(Object.entries(v9).every(([k,v])=>saved[k]===undefined||saved[k]===v))for(const k of ['sharpness','cleanup','deband','detail'])delete saved[k];}
  localStorage.setItem('BxImageFilter.spec3','1');}catch{}
 const settings=BxRestoration.normalize(saved);
 // Native image controls own sharpening; removed experimental color overrides stay neutral.
 settings.contrast=1;settings.saturation=1;settings.shadows=0;
 const status={mode:'waiting',frames:0,lastFrame:0,resolution:'',error:'',gpuP95:null,measurement:'cadence',adaptation:'',fps:null,
  // Display intervals (ms) of the last ~8 s at 30 FPS, oldest first: the HUD's pacing graph.
  intervals:[],intervalsTotal:0,net:null,warnings:[],adaptive:null,capture:{active:false,frames:0,reason:''},
  // GPU time estimate {p50, p95, count} from fences when the browser has no GPU timer (see Engine.startFence).
  gpuEstimate:null};
 let activeEngine=null,activePlayer=null;
 // Physical pixels the video occupies on screen. The canvas CSS box is fixed by Better
 // xCloud (object-fit contain), so this does not depend on the canvas backing size.
 // Without layout yet, fall back to the display/HDMI mode height.
 function displayHeight(player,w,h){
  const dpr=window.devicePixelRatio||1,rect=player?.$canvas?.getBoundingClientRect?.();
  if(rect&&rect.width>0&&rect.height>0&&w&&h)return Math.round(Math.min(rect.height,rect.width*h/w)*dpr);
  return Math.round((screen?.height||0)*dpr);
 }
 // Settings that do not change the processed image keep the GPU adaptation.
 const LIVE_KEYS=new Set(['mode','smoothing','hud','hudPosition']);
 // Bumped by every capture/Fluidez change: a failed direct capture is retried after the user changes either.
 let captureEpoch=0;
 const api=window.BxImageFilter={settings,status,diagnostic:false,panelOpen:false,presets:BxRestoration.presets,
  // Restores the treatment; the HUD choice is a display preference and stays.
  reset(){const {hud,hudPosition}=settings;Object.assign(settings,BxRestoration.defaults,{hud,hudPosition});persist();api.diagnostic=false;activeEngine?.resetBudget();if(activePlayer){activePlayer.bxReferenceFps=null;activePlayer.bxTimes=[];activePlayer.bxCadenceMark=performance.now();}},
  // Unchanged values are ignored: the gamepad repeats a held direction ~10 times a second, even at the ends.
  update(patch){const changed=Object.keys(patch).filter(k=>settings[k]!==patch[k]);if(!changed.length)return;
   Object.assign(settings,patch);if(changed.includes('capture')||changed.includes('fluidity'))captureEpoch++;if(changed.some(k=>!LIVE_KEYS.has(k)))activeEngine?.resetBudget();persist(true);},
  applyPreset(name){const p=BxRestoration.presets[name];if(p)api.update({...p.values});},
  preset:()=>BxRestoration.presetOf(settings),
  // Better xCloud keeps stream.*, server.* and userAgent.* as global prefs; video.* per stream/game.
  nativePref(k){try{if(/^(stream|server|userAgent)\./.test(k))return typeof getGlobalPref==='function'?getGlobalPref(k):undefined;return typeof getStreamPref==='function'?getStreamPref(k):undefined;}catch{return undefined;}},
  get active(){return !!status.lastFrame&&Date.now()-status.lastFrame<2500;},
  directSupported:()=>typeof MediaStreamTrackProcessor==='function'&&typeof VideoFrame==='function',
  async startMeasurement(){const engine=activeEngine,video=activePlayer?.$video;if(!engine)return false;
   const initial=await BxRestoration.captureVideoStats(video,peer());if(activeEngine!==engine)return false;
   const sc=globalThis.screen;
   engine.diagnostics.start({userAgent:navigator.userAgent,renderer:engine.gl.getParameter(engine.gl.RENDERER),timer:!!engine.ext,gpuMethod:engine.ext?'timer':engine.fenceTiming?'fence':null,floatTargets:engine.floatTargets,
    screen:{width:sc?.width??null,height:sc?.height??null,dpr:window.devicePixelRatio??null,refreshPref:androidCall('getRefreshRate')},app:androidCall('getAppInfo'),
    betterXcloud:nativePrefs(),capture:{...status.capture},smoothing:status.smoothing??null,initial});
   const id=engine.diagnostics.startedAt;measureRefresh().then(hz=>{if(engine.diagnostics.startedAt===id)engine.diagnostics.annotate({refreshMeasuredHz:hz});});
   return true;},
  get measuring(){return !!activeEngine?.diagnostics.active;},
  async exportMeasurement(){const engine=activeEngine;if(!engine)return null;engine.poll();engine.diagnostics.stop();
   const report=engine.diagnostics.report();report.final=await BxRestoration.captureVideoStats(activePlayer?.$video,peer());report.net=status.net;
   report.status={capture:status.capture,fluidity:status.fluidity??null,adaptive:status.adaptive,smoothing:status.smoothing??null,pacing:status.pacing??null,origin:status.origin??null,gpuP95:status.gpuP95,gpuEstimate:status.gpuEstimate,warnings:status.warnings.map(w=>w.text)};
   BxRestoration.downloadReport(report);return report;},
  // Clipboard: the Android app's bridge first (its WebView may deny navigator.clipboard).
  async copyText(text){try{if(window.BxAndroid?.copyText?.(text))return true;}catch{}try{await navigator.clipboard.writeText(text);return true;}catch{return false;}},
  // Configuration summary to paste in a support conversation (no account data).
  configText(){const native=nativePrefs();
   const o=status.origin,round=v=>typeof v==='number'?Math.round(v*10)/10:v;
   return JSON.stringify({build:globalThis.BxBuild?.version,app:window.BxAndroid?.getAppInfo?.()??null,screen:`${screen.width}×${screen.height} @${window.devicePixelRatio}`,
    status:{resolution:status.resolution,fps:round(status.fps),gpuP95:status.gpuP95,gpuEstimate:status.gpuEstimate,adaptation:status.adaptation,smoothing:status.smoothing,fluidity:status.fluidity,capture:status.capture,adaptive:status.adaptive},
    pacing:status.pacing&&{meanMs:round(status.pacing.meanMs),deviationMs:round(status.pacing.deviationMs),p95Ms:round(status.pacing.p95Ms),hitches:status.pacing.hitches},
    origin:o&&{server:o.server&&[round(o.server.meanMs),round(o.server.deviationMs)],arrival:o.arrival&&[round(o.arrival.meanMs),round(o.arrival.deviationMs)],missed:o.missed,presented:o.presented},
    net:status.net&&Object.fromEntries(Object.entries(status.net).map(([k,v])=>[k,k==='bitsPerPixel'&&typeof v==='number'?Math.round(v*1000)/1000:round(v)])),warnings:status.warnings.map(w=>w.text),
    preset:api.preset(),treatment:BxRestoration.normalize(settings),betterXcloud:native},null,1);},
 };
 // Better xCloud settings that shape the stream, for the configuration summary and the measurement.
 function nativePrefs(){const native={};for(const k of ['stream.video.resolution','stream.video.codecProfile','stream.video.maxBitrate','stream.video.preventResolutionDrops','server.region','server.bypassRestriction','userAgent.profile','video.player.type','video.processing','video.processing.mode','video.processing.sharpness','video.maxFps','video.player.powerPreference'])native[k]=api.nativePref(k)??null;return native;}
 function androidCall(name){try{const v=window.BxAndroid?.[name]?.();return v===undefined?null:v;}catch{return null;}}
 // Display refresh rate from 30 animation frames (median interval); null when the page is hidden.
 function measureRefresh(){return new Promise(resolve=>{const times=[],timer=window.setTimeout(()=>resolve(null),2000);
  const step=t=>{times.push(t);if(times.length<31){window.requestAnimationFrame(step);return;}
   const d=times.slice(1).map((v,i)=>v-times[i]).sort((a,b)=>a-b),m=d[d.length>>1];window.clearTimeout(timer);resolve(m>0?Math.round(10000/m)/10:null);};
  window.requestAnimationFrame(step);});}
 // Applies smoothing at once; the storage write is grouped (deferred=true) while a control is being moved.
 let saveTimer=0;
 function save(){saveTimer=0;try{localStorage.setItem(key,JSON.stringify(BxRestoration.normalize(settings)));}catch{}}
 function persist(deferred){window.clearTimeout(saveTimer);if(deferred)saveTimer=window.setTimeout(save,400);else save();smoothingTick();}
 // Follow the connection independently of the renderer and whether the menu is open.
 const peer=()=>typeof STATES==='undefined'?null:STATES.currentStream?.peerConnection;
 let smoothingPeer=null,smoothingTimer=null;
 function releaseSmoothing(){try{BxRestoration.applySmoothing(smoothingPeer,0);}catch{}smoothingPeer=null;}
 function smoothingTick(){
  const current=peer();if(current!==smoothingPeer){releaseSmoothing();smoothingPeer=current;}
  try{status.smoothing=BxRestoration.applySmoothing(current,settings.smoothing);}
  catch{status.smoothing={state:'error',requestedMs:settings.smoothing};}
 }
 // Stream telemetry for the panel, the HUD and the compression-adaptive treatment: one getStats per
 // second, only while one of them needs it.
 let telemetryBusy=false,lastRtp=null,telemetryPeer=null,bppSamples=[];
 async function pollTelemetry(){
  const pc=peer();
  // A new session starts from scratch: no deltas or QP level carried over from the previous game.
  if(pc!==telemetryPeer){telemetryPeer=pc;lastRtp=null;status.net=null;status.adaptive=null;bppSamples=[];}
  if(!pc?.getStats||telemetryBusy||!(api.panelOpen||settings.hud!=='off'||settings.adaptive||api.measuring||activeEngine&&!activeEngine.ext)){updateWarnings();return;}
  telemetryBusy=true;
  try{let rtp=null,rtt=null;const stats=await pc.getStats();
   if(peer()!==pc)return;
   stats.forEach(item=>{if(item.type==='inbound-rtp'&&item.kind==='video')rtp=item;
    if(item.type==='candidate-pair'&&item.nominated&&item.state==='succeeded'&&Number.isFinite(item.currentRoundTripTime))rtt=item.currentRoundTripTime*1000;});
   if(lastRtp&&rtp&&lastRtp.id!==rtp.id)lastRtp=null;
   const info=rtp&&stats.get?.(rtp.codecId),profile=BxRestoration.h264Profile(info?.sdpFmtpLine);
   const codec=info?.mimeType?info.mimeType.replace('video/','')+(profile?' '+profile:''):null;
   const d=BxRestoration.decoderSummary(lastRtp,rtp?{...rtp,codec}:null),q=BxRestoration.streamSummary(lastRtp,rtp);lastRtp=rtp;
   status.net=d&&{codec:d.codec,profile,fpsReceived:d.fps,decoder:d.kind,implementation:d.implementation,decodeMs:d.dtMs,bufferMs:d.jitterMs,rttMs:rtt,...q};
   if(Number.isFinite(rtp?.qpSum))adaptToCompression(q?.qp??null,q?.frames??0);else adaptToBitrate(q?.bitsPerPixel??null,q?.frames??0);
   const diag=activeEngine?.diagnostics;
   if(diag?.active&&d)diag.timeline({fpsReceived:d.fps,fpsShown:api.active?status.fps:null,bitrateMbps:q?.bitrateMbps,lossPct:q?.lossPct,rttMs:rtt,decodeMs:d.dtMs,bufferMs:d.jitterMs,
    qp:q?.qp,bitsPerPixel:q?.bitsPerPixel,level:status.adaptive?.level,gpuMs:status.gpuP95??status.gpuEstimate?.p95,waitMs:status.fluidity?.extraMs,
    decoderDropped:q?.framesDropped,freezes:q?.freezes,capture:activePlayer?.bxDirect?.rendered>0?'direct':'video'});
  }catch{status.net=null;}finally{telemetryBusy=false;updateWarnings();}
 }
 // The quantizer level moves the treatment only after a sustained change: an exponential mean of
 // the per-second QP, weighted by the frames behind each sample (a 2-frame keyframe second after a
 // stall barely counts), and a new level only when it moves by two steps (0.2) or more (no pumping).
 function adaptToCompression(qp,frames){
  if(!Number.isFinite(qp)||!(frames>0))return;
  const a=status.adaptive,weight=.3*Math.min(1,frames/30),mean=a?.qpMean==null?qp:a.qpMean*(1-weight)+qp*weight,target=BxRestoration.compressionLevel(mean);
  // Levels are multiples of 0.1: compare against 0.15, since 1.0-0.8 is 0.19999… in floating point.
  const level=a?.level==null||Math.abs(target-a.level)>.15?target:a.level;
  status.adaptive={source:'qp',qp,qpMean:mean,level,scales:BxRestoration.compressionScales(level)};
 }
 // Without the QP (Android WebView), the bits per pixel of the last minute: their 80th percentile, so
 // quiet scenes (few bits at a low QP) do not read as heavy compression. Seconds with under 10 frames
 // (stalls) are skipped; the first estimate needs 5 seconds. Same hysteresis as the QP.
 function adaptToBitrate(bpp,frames){
  if(!Number.isFinite(bpp)||!(bpp>0)||!(frames>=10))return;
  bppSamples.push(bpp);if(bppSamples.length>60)bppSamples.shift();if(bppSamples.length<5)return;
  const sorted=[...bppSamples].sort((a,b)=>a-b),p80=sorted[Math.ceil(sorted.length*.8)-1],qp=BxRestoration.qpFromBitsPerPixel(p80),target=BxRestoration.compressionLevel(qp);
  const a=status.adaptive,level=a?.level==null||Math.abs(target-a.level)>.15?target:a.level;
  status.adaptive={source:'bitrate',qp:null,qpMean:null,qpEstimate:qp,bitsPerPixel:p80,level,scales:BxRestoration.compressionScales(level)};
 }
 const MAX_BITRATE=15360000;
 function updateWarnings(){
  const w=[],pref=api.nativePref,net=status.net,dec=v=>v.toFixed(1).replace('.',',');
  if(pref('video.player.type')!==undefined&&pref('video.player.type')!=='webgl2')w.push({level:'error',key:'renderer',text:'Renderizador não é WebGL2: o tratamento está desligado.'});
  const bitrate=pref('stream.video.maxBitrate');if(bitrate>0&&bitrate<MAX_BITRATE)w.push({level:'warn',key:'bitrate',text:`Bitrate máximo limitado a ${dec(bitrate/1024000)} Mb/s no Better xCloud: use Ilimitado.`});
  const resolution=pref('stream.video.resolution');if(resolution&&!/^1080p/.test(resolution)&&resolution!=='auto')w.push({level:'warn',key:'resolution',text:'Resolução alvo abaixo de 1080p.'});
  if(net?.height&&net.height<1000)w.push({level:'warn',key:'stream',text:`O servidor está enviando ${net.height}p.`});
  if(net?.decoder==='software')w.push({level:'warn',key:'decoder',text:'Decodificação por software (CPU).'});
  if(net?.lossPct>1)w.push({level:net.lossPct>2?'error':'warn',key:'loss',text:`Perda de pacotes de ${dec(net.lossPct)}%.`});
  // Explicit 2K/4K above the display (e.g. 1080p HDMI to a 4K TV) is scaled back down by the browser.
  if(settings.mode==='filtered'&&['1440','2160'].includes(settings.output)&&status.display&&Number(settings.output)>status.display*1.1)w.push({level:'info',key:'output',text:`Tela em ${status.display}p: saída maior só aumenta custo. Use Auto.`});
  if(status.mode==='error'&&status.error)w.push({level:'error',key:'engine',text:status.error});
  status.warnings=w;
 }
 function tick(){smoothingTick();pollTelemetry();}
 function startSmoothing(){if(smoothingTimer===null)smoothingTimer=window.setInterval(tick,1000);tick();}
 window.addEventListener('pagehide',()=>{window.clearInterval(smoothingTimer);smoothingTimer=null;releaseSmoothing();});
 window.addEventListener('pageshow',startSmoothing);
 startSmoothing();
 // Frame timing per player: capture time on the server (RTP), arrival (WebRTC receive time) and
 // display time, plus the optional pacer ("Fluidez") that shows processed frames on a steady clock.
 const keep=(list,value,now)=>{list.push([now,value]);while(list.length>1&&now-list[0][0]>2000)list.shift();};
 // While the page is hidden nothing is shown (no rAF/rVFC): an interval spanning that time measures the
 // app switch, not the stream, and stays out of the graph and the measurement.
 let hiddenAt=-Infinity;
 document.addEventListener?.('visibilitychange',()=>{if(document.hidden)hiddenAt=performance.now();});
 // Records a frame shown on screen: 2 s window for the panel's pacing line, longer ring for the HUD graph.
 function shownAt(t,now,engine){keep(t.display,now,now);if(t.lastShown!=null&&t.lastShown>hiddenAt){status.intervals.push(now-t.lastShown);status.intervalsTotal++;if(status.intervals.length>240)status.intervals.shift();engine?.diagnostics.interval('display',now-t.lastShown);}t.lastShown=now;}
 const statsOf=list=>BxRestoration.frameStats(list.map(e=>e[1]));
 function startTiming(player){
  if(player.bxTiming)return;
  const t=player.bxTiming={server:[],arrival:[],display:[],presentedLog:[],clock:BxRestoration.createRtpClock(),pendingRtp:null,metaId:null,raf:null,pacer:null,shown:null};
  const video=player.$video;if(!video?.requestVideoFrameCallback)return;
  // Registered before Better xCloud's own draw callback, so a frame's metadata usually comes first;
  // attach() covers the opposite order.
  const onMeta=(now,meta)=>{
   if(player.isStopped)return;t.metaId=video.requestVideoFrameCallback(onMeta);
   // Direct capture records server/arrival times from its own frames (every decoded one).
   if(player.bxDirect?.frames>0)return;
   const at=performance.now(),presented=meta?.presentedFrames;
   // Frames the browser presented between two callbacks never reached the treatment (nor the canvas).
   if(Number.isFinite(presented)){if(presented>t.presented){keep(t.presentedLog,presented-t.presented,at);player.bxEngine?.diagnostics.skipped(presented-t.presented-1);}t.presented=presented;}
   const rtp=meta&&Number.isFinite(meta.rtpTimestamp)?t.clock(meta.rtpTimestamp):null,arrival=Number.isFinite(meta?.receiveTime)?meta.receiveTime:at;
   if(rtp!==null)keep(t.server,rtp,at);
   keep(t.arrival,arrival,at);origin(player,t,rtp,arrival);
   if(rtp!==null&&!(t.pacer&&t.pacer.attach(rtp)))t.pendingRtp=rtp;
  };
  t.metaId=video.requestVideoFrameCallback(onMeta);
 }
 // Server and arrival intervals for the measurement, from the frames reaching the treatment.
 function origin(player,t,server,arrival){const diag=player.bxEngine?.diagnostics;
  if(diag?.active&&t.lastArrival!=null&&t.lastArrival>hiddenAt){if(server!==null&&t.lastServer!=null)diag.interval('server',server-t.lastServer);diag.interval('arrival',arrival-t.lastArrival);}
  t.lastServer=server;t.lastArrival=arrival;}
 // Switching between video and direct capture changes the clocks: start the origin windows over.
 function clearOrigin(player){const t=player.bxTiming;if(!t)return;t.server.length=0;t.arrival.length=0;t.presentedLog.length=0;t.lastServer=t.lastArrival=null;t.presented=undefined;}
 function stopPacer(player){const t=player.bxTiming;if(!t?.pacer)return;if(t.raf!==null)cancelAnimationFrame(t.raf);t.raf=null;t.pacer=null;t.shown=null;player.bxEngine?.releasePaced();}
 function stopTiming(player){const t=player.bxTiming;if(!t)return;stopPacer(player);if(t.metaId!==null)player.$video?.cancelVideoFrameCallback?.(t.metaId);player.bxTiming=null;}
 function ensurePacer(player,mode){
  const t=player.bxTiming;if(t.pacer?.mode===mode)return t.pacer;
  stopPacer(player);t.pacer=BxRestoration.createPacer(mode);t.pacerDropped=0;
  const tick=()=>{
   if(!t.pacer||player.isStopped){t.raf=null;return;}
   t.raf=requestAnimationFrame(tick);
   const now=performance.now(),f=t.pacer.tick(now),engine=player.bxEngine;t.lastTick=now;
   const dropped=t.pacer.dropped;if(dropped>t.pacerDropped){engine?.diagnostics.dropped(dropped-t.pacerDropped);t.pacerDropped=dropped;}
   if(f&&engine&&player.gl&&!player.gl.isContextLost()&&engine.present(f.slot)){t.shown=f.slot;shownAt(t,now,engine);if(f.arrival>hiddenAt)engine.diagnostics.interval('wait',now-f.arrival);player.gl.useProgram(player.program);}
  };
  t.raf=requestAnimationFrame(tick);return t.pacer;
 }
 // Five persistent output textures: the one on screen, up to three queued, one being written.
 function freeSlot(t){const used=new Set([t.shown,...t.pacer.pending.map(f=>f.slot)]);for(let i=0;i<5;i++){const name='paced'+i;if(!used.has(name))return name;}return t.pacer.pending[0]?.slot||'paced0';}
 const proto=WebGL2Player.prototype,setup=proto.setupShaders,frame=proto.updateFrame,destroy=proto.destroy;
 function fallback(player){const gl=player.gl;if(gl&&!gl.isContextLost()){gl.bindVertexArray(null);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,player.bxOriginalTexture);gl.useProgram(player.program);gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,player.$canvas.width,player.$canvas.height);player.updateCanvas();frame.call(player);}}
 proto.setupShaders=async function(){
  await setup.call(this);if(this.isStopped||!this.gl)return;
  this.bxEngine?.destroy();this.bxOriginalTexture=this.gl.getParameter(this.gl.TEXTURE_BINDING_2D);
  try{this.bxEngine=new BxRestoration.Engine(this.gl,BxShaders);activeEngine=this.bxEngine;activePlayer=this;status.mode='ready';status.error='';}
  catch(error){status.mode='error';status.error=String(error.message||error);console.warn('[Bx Restoration]',error);}
  finally{this.gl.bindVertexArray(null);this.gl.activeTexture(this.gl.TEXTURE0);this.gl.bindTexture(this.gl.TEXTURE_2D,this.bxOriginalTexture);this.gl.useProgram(this.program);}
  this.bxLastFrame=null;this.bxLastSettings='';this.bxTimes=[];startTiming(this);
  if(!this.bxListeners){
   const reset=()=>{this.bxEngine?.resetHistory();this.bxLastFrame=null;this.bxReferenceFps=null;this.bxTimes=[];this.bxCadenceMark=performance.now();};
   const lost=e=>{e.preventDefault();reset();status.mode='error';status.error='Contexto GPU perdido; aguardando restauração';};
   const restored=()=>{stopPacer(this);this.bxEngine?.destroy();this.bxEngine=null;this.setupShaders().catch(e=>{status.error=String(e.message);});};
   this.bxListeners={reset,lost,restored};
   for(const name of ['seeking','pause','emptied'])this.$video.addEventListener(name,reset);
   this.$canvas.addEventListener('webglcontextlost',lost);this.$canvas.addEventListener('webglcontextrestored',restored);
  }
 };
 // Settings for one frame: native processing mode, compression-adaptive strengths and the output
 // resolved from the on-screen size. Also sizes the canvas (which restarts the pacer).
 function frameSettings(player,w,h){
  const renderSettings={...settings};
  // Sharpness comes from this panel, shared by the treatment and the CAS-only reference.
  if(typeof getStreamPref==='function'){
   const processing=getStreamPref('video.processing'),mode=getStreamPref('video.processing.mode');
   if(['cas','usm'].includes(processing))renderSettings.processing=processing;
   if(['quality','performance'].includes(mode))renderSettings.processingMode=mode;
  }
  // Compression-adaptive strengths (QP level from the telemetry; neutral until it is known).
  if(settings.adaptive&&settings.mode==='filtered'&&status.adaptive){const k=status.adaptive.scales;
   renderSettings.cleanup=Math.min(1,settings.cleanup*k.cleanup);renderSettings.deband=Math.min(1,settings.deband*k.deband);renderSettings.detail=Math.min(1,settings.detail*k.detail);}
  const shown=displayHeight(player,w,h);renderSettings.output=BxRestoration.resolveOutput(settings.output,shown,h);
  const size=player.bxEngine.outputSize(w,h,renderSettings),ow=size.width,oh=size.height;
  if(player.bxMode!==settings.mode){player.bxTimes=[];player.bxCadenceMark=performance.now();player.bxMode=settings.mode;}
  // Keep the reference cadence when the budget reduces output automatically.
  // Only user-selected output/source/FPS changes invalidate the comparison.
  // The frame source too: direct capture counts every decoded frame, the video path only those it presents.
  const conditions=`${w}:${h}:${settings.output}:${player.targetFps}:${player.bxDirect?'direct':'video'}`;
  if(player.bxConditions!==conditions){player.bxReferenceFps=null;player.bxTimes=[];player.bxCadenceMark=performance.now();player.bxConditions=conditions;}
  if(player.$canvas.width!==ow||player.$canvas.height!==oh){player.$canvas.width=ow;player.$canvas.height=oh;player.bxEngine.resetHistory();stopPacer(player);}
  return {renderSettings,shown,ow,oh};
 }
 // Status after a rendered frame; newFrame feeds the FPS and the cadence-based GPU adaptation.
 function publish(player,{w,h,ow,oh,shown,newFrame,timing}){
  const direct=!!player.bxDirect;
  status.mode=api.diagnostic?'diagnostic':settings.mode;status.frames=player.bxEngine.frames;status.lastFrame=Date.now();status.resolution=`${w}×${h} → ${ow}×${oh}`;
  status.gpuP95=player.bxEngine.budget.p95;status.measurement=player.bxEngine.ext?'gpu':'cadence';status.adaptation=player.bxEngine.budget.reason;
  status.gpuEstimate=player.bxEngine.ext?null:player.bxEngine.gpuEstimate;
  status.display=shown;
  const now=performance.now();if(newFrame)player.bxTimes.push(now);while(player.bxTimes.length>1&&now-player.bxTimes[0]>2000)player.bxTimes.shift();
  status.fps=player.bxTimes.length>1?(player.bxTimes.length-1)*1000/(player.bxTimes.at(-1)-player.bxTimes[0]):null;status.pacing=statsOf(timing.display)||BxRestoration.frameStats(player.bxTimes);
  // With direct capture every decoded frame reaches the treatment: the video element's skips do not apply.
  status.origin={server:statsOf(timing.server),arrival:statsOf(timing.arrival),arrivalNetwork:direct?!!timing.arrivalNetwork:true,presented:direct?null:timing.presentedLog.reduce((a,e)=>a+e[1],0),missed:direct?null:timing.presentedLog.reduce((a,e)=>a+e[1]-1,0)};
  status.fluidity=timing.pacer?{mode:timing.pacer.mode,extraMs:timing.pacer.extraDelayMs,dropped:timing.pacer.dropped}:null;
  if(direct)status.capture={active:true,frames:player.bxDirect.rendered,reason:''};
  if(newFrame&&now-(player.bxCadenceMark||0)>2000){
   if(settings.mode!=='filtered')player.bxReferenceFps=status.fps;
   else if(!player.bxEngine.ext){
    // Frames shown against frames decoded now. The <video> element also skips frames that arrive together
    // (about 2% on the Poco F7) with no GPU overload, so only direct capture keeps the 5% margin. A page
    // that was just hidden leaves a gap in the window. Without a live figure, the reference measured
    // in CAS/original stays.
    const live=BxRestoration.liveCadence(status.net?.fpsReceived,player.targetFps),list=timing.display,span=list.length>1?list.at(-1)[0]-list[0][0]:0;
    if(live===null)player.bxEngine.budget.cadence(player.bxReferenceFps,status.fps);
    else if(span>0&&now-hiddenAt>4000)player.bxEngine.budget.cadence(live,(list.length-1)*1000/span,direct?.95:.9);
   }
   player.bxCadenceMark=now;
  }
 }
 function fail(player,error){status.mode='error';status.error=String(error.message||error);stopDirect(player,'Erro no tratamento');stopPacer(player);player.bxEngine.destroy();player.bxEngine=null;activeEngine=null;fallback(player);}
 // Direct capture (Fluidez only): the <video> element shows at most one frame per display refresh, so
 // frames arriving together are skipped before the treatment sees them. Reading the WebRTC track with
 // MediaStreamTrackProcessor delivers every decoded frame; each VideoFrame is processed into a paced
 // texture and closed at once, so the hardware decoder never waits for the pacer.
 function startDirect(player){
  const source=player.$video?.srcObject?.getVideoTracks?.()[0];
  if(!source||source.readyState!=='live'||!api.directSupported())return false;
  let track=null,reader;
  try{track=source.clone();reader=new MediaStreamTrackProcessor({track}).readable.getReader();}
  catch(error){track?.stop();status.capture={active:false,frames:0,reason:'Indisponível: '+(error.message||error)};return false;}
  const d=player.bxDirect={track,reader,frames:0,rendered:0,started:performance.now(),nextAt:null};
  status.capture={active:true,frames:0,reason:''};
  (async()=>{let reason='Fluxo de vídeo encerrado';
   try{for(;;){const {value,done}=await reader.read();if(done)break;
     try{if(player.bxDirect!==d)break;d.frames++;renderDirect(player,value);}finally{value.close();}}}
   catch(error){reason=String(error?.message||error);}
   finally{if(player.bxDirect===d)stopDirect(player,reason);}})();
  return true;
 }
 function stopDirect(player,reason){
  const d=player.bxDirect;if(!d)return;player.bxDirect=null;
  try{d.reader.cancel().catch(()=>{});}catch{}d.track.stop();
  status.capture={active:false,frames:d.rendered,reason};clearOrigin(player);
 }
 function renderDirect(player,frame){
  const d=player.bxDirect,t=player.bxTiming;
  if(!d||!player.bxEngine||player.isStopped||!player.gl||player.gl.isContextLost())return;
  const w=frame.displayWidth,h=frame.displayHeight;if(!w||!h)return;
  // Every decoded frame: capture time (VideoFrame timestamp) and arrival, before the FPS limit.
  // Arrival: the network receive time when the browser gives VideoFrame metadata, otherwise the delivery
  // to this script, which adds decoding and main-thread delays (status.origin.arrivalNetwork false).
  const at=performance.now(),ms=frame.timestamp/1000;let meta=null;try{meta=frame.metadata?.();}catch{}
  const network=Number.isFinite(meta?.receiveTime),arrival=network?meta.receiveTime:at;
  if(t){if(d.frames===1)clearOrigin(player);t.arrivalNetwork=network;keep(t.server,ms,at);keep(t.arrival,arrival,at);origin(player,t,ms,arrival);}
  // Nothing is shown while the page is hidden (no rAF): close frames without processing them.
  if(document.hidden||t?.pacer&&t.lastTick!=null&&performance.now()-t.lastTick>250)return;
  // Better xCloud's FPS limit, on capture time (frames may arrive bunched); same rule as shouldDraw.
  const fps=player.targetFps;
  if(fps<=0)return;
  if(fps<60){const interval=1000/fps;
   if(d.nextAt==null||ms-d.nextAt>interval)d.nextAt=ms+interval;else if(ms<d.nextAt-2)return;else d.nextAt+=interval;}
  try{
   const {renderSettings,shown,ow,oh}=frameSettings(player,w,h),timing=player.bxTiming||(startTiming(player),player.bxTiming);
   // VideoFrame timestamps follow the capture cadence on a monotonic clock (in Chromium, time since
   // boot): the pacer's 'frame' clock and the temporal time base.
   const pacer=ensurePacer(player,settings.fluidity),slot=freeSlot(timing),check=d.rendered<3;
   if(check)player.gl.getError();
   if(!player.bxEngine.render(frame,ow,oh,renderSettings,ms/1000,api.diagnostic,slot,true))return;
   // Some drivers may not take a decoder frame as a texture: check the first frames once and fall back.
   if(check&&player.gl.getError()!==player.gl.NO_ERROR){stopDirect(player,'A GPU não aceitou o quadro direto: usando o vídeo');player.bxDirectFailed=true;return;}
   d.rendered++;pacer.add({slot,arrival:performance.now(),rtp:ms,clock:'frame'});
   publish(player,{w,h,ow,oh,shown,newFrame:true,timing});
  }catch(error){fail(player,error);}
  finally{if(player.gl&&!player.gl.isContextLost())player.gl.useProgram(player.program);}
 }
 // Starts, keeps or stops direct capture for the current settings; true while it renders the frames.
 function directCapture(player){
  const want=settings.fluidity!=='off'&&settings.capture==='direct';
  if(player.bxCaptureEpoch!==captureEpoch){player.bxCaptureEpoch=captureEpoch;player.bxDirectFailed=false;}
  if(!want){if(player.bxDirect)stopDirect(player,'');return false;}
  if(!player.bxDirect&&!player.bxDirectFailed&&!startDirect(player)){player.bxDirectFailed=true;if(!status.capture.reason)status.capture={active:false,frames:0,reason:'Captura direta indisponível neste navegador'};}
  const d=player.bxDirect;if(!d)return false;
  // The video path keeps rendering until the first direct frame; with none within 2 s, it stays.
  if(d.frames===0&&performance.now()-d.started>2000){stopDirect(player,'Nenhum quadro da captura direta: usando o vídeo');player.bxDirectFailed=true;return false;}
  return d.frames>0;
 }
 proto.updateFrame=function(){
  if(!this.bxEngine){fallback(this);return;}
  if(this.isStopped)return;
  if(directCapture(this))return;
  const video=this.$video,w=video.videoWidth||video.width,h=video.videoHeight||video.height;
  if(!w||!h)return;
  const time=Number.isFinite(video.currentTime)?video.currentTime:performance.now()/1000;
  const count=video.getVideoPlaybackQuality?.().totalVideoFrames;
  // WebRTC counts totalVideoFrames on arrival, so a frame that arrived before the previous
  // callback can be presented later with the same count. The presented-frame counter from
  // requestVideoFrameCallback marks every new frame on screen.
  const presented=this.bxTiming?.presented,id=Number.isFinite(presented)?presented+'/':'';
  const token=count>0?`${id}${count}:${w}:${h}`:`${id}${time}:${w}:${h}`;
  const newFrame=this.bxLastFrame!==token;
  const {renderSettings,shown,ow,oh}=frameSettings(this,w,h);
  const controls=JSON.stringify(renderSettings)+api.diagnostic+':'+this.bxEngine.budget.revision;
  if(this.bxLastFrame===token&&this.bxLastSettings===controls){this.bxEngine.poll();return;}
  try{
   const timing=this.bxTiming||(startTiming(this),this.bxTiming);
   if(settings.fluidity!=='off'){
    // Process now, show on the pacer's clock. A settings change on the same frame redraws it at once.
    // The last pass (sharpening or SGSR) runs at present(), straight to the canvas (Spec 3 item 8).
    const pacer=ensurePacer(this,settings.fluidity),slot=newFrame||!timing.shown?freeSlot(timing):timing.shown;
    if(!this.bxEngine.render(video,ow,oh,renderSettings,time,api.diagnostic,slot,true))return;
    timing.lastSlot=slot;
    if(newFrame||!timing.shown){const rtp=timing.pendingRtp;timing.pendingRtp=null;pacer.add({slot,arrival:performance.now(),rtp});}
    else if(this.bxEngine.present(slot))this.gl.useProgram(this.program);
   }else{
    if(timing.pacer)stopPacer(this);
    if(!this.bxEngine.render(video,ow,oh,renderSettings,time,api.diagnostic))return;
    if(newFrame)shownAt(timing,performance.now(),this.bxEngine);
   }
   this.bxLastFrame=token;this.bxLastSettings=controls;
   publish(this,{w,h,ow,oh,shown,newFrame,timing});
  }catch(error){fail(this,error);}
  finally{if(this.gl&&!this.gl.isContextLost())this.gl.useProgram(this.program);}
 };
 proto.destroy=function(){
  stopDirect(this,'');stopTiming(this);
  if(activePlayer===this)activePlayer=null;if(activeEngine===this.bxEngine)activeEngine=null;this.bxEngine?.destroy();this.bxEngine=null;
  if(this.bxListeners){const {reset,lost,restored}=this.bxListeners;for(const name of ['seeking','pause','emptied'])this.$video.removeEventListener(name,reset);this.$canvas.removeEventListener('webglcontextlost',lost);this.$canvas.removeEventListener('webglcontextrestored',restored);this.bxListeners=null;}
  status.mode='waiting';status.lastFrame=0;api.diagnostic=false;destroy.call(this);
 };
 api.mountControls=parent=>api.panel?.mount(parent);
})();

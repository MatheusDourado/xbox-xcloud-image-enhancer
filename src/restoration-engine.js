/* Shared GPU video processing engine. GLSL assets are embedded by tools/build.py. */
(() => {
  // v9 defaults come from tools/eval (docs/analysis-v9.md): same sharpness as the clean
  // render with the highest fidelity on xCloud-like H.264 streams.
  const defaults = Object.freeze({mode:'filtered',fluidity:'off',capture:'video',adaptive:true,hud:'off',hudPosition:'top-left',smoothing:0,neural:0,cleanup:0,deband:.6,chroma:.75,detail:0,temporal:0,upscale:true,output:'auto',antialias:0,gpuBudget:6,sharpness:2,scaler:'easu',processing:'cas',sharpening:'usm',spatialMode:'selective',lumaSharpen:true,noiseFloor:4,processingMode:'performance',contrast:1,saturation:1,shadows:0,desynchronized:false,renderer:'auto'});
  function normalize(value={}) {
    if(!value || typeof value!=='object')value={};
    const result={...defaults};
    if(['auto','native','1440','2160'].includes(value.output)||/^\d{3,4}$/.test(value.output)&&value.output>=360&&value.output<=2160)result.output=String(value.output);
    if([0,3,6,10].includes(value.gpuBudget))result.gpuBudget=value.gpuBudget;
    if(['original','cas','filtered'].includes(value.mode))result.mode=value.mode;
    if(['usm','cas','rcas','native'].includes(value.sharpening))result.sharpening=value.sharpening;
    if(['easu','sgsr'].includes(value.scaler))result.scaler=value.scaler;
    if(['auto','webgl2','webgpu'].includes(value.renderer))result.renderer=value.renderer;
    if([0,17,33,50].includes(value.smoothing))result.smoothing=value.smoothing;
    if(['off','balanced','max'].includes(value.fluidity))result.fluidity=value.fluidity;
    if(['video','direct'].includes(value.capture))result.capture=value.capture;
    if(['off','compact','full'].includes(value.hud))result.hud=value.hud;
    if(['top-left','top-right','bottom-left','bottom-right'].includes(value.hudPosition))result.hudPosition=value.hudPosition;
    if(['selective','legacy'].includes(value.spatialMode))result.spatialMode=value.spatialMode;
    if(['cas','usm'].includes(value.processing))result.processing=value.processing;
    if(['performance','quality'].includes(value.processingMode))result.processingMode=value.processingMode;
    if(typeof value.upscale==='boolean')result.upscale=value.upscale;
    if(typeof value.lumaSharpen==='boolean')result.lumaSharpen=value.lumaSharpen;
    if(typeof value.adaptive==='boolean')result.adaptive=value.adaptive;
    // Low-latency canvas (Spec 3 item 11): only an explicit true; it applies when the next canvas is created.
    if(value.desynchronized===true)result.desynchronized=true;
    for(const [key,min,max] of [['neural',0,1],['antialias',0,1],['sharpness',0,10],['cleanup',0,1],['deband',0,1],['chroma',0,1],['detail',0,1],['temporal',0,1],['contrast',.8,1.2],['noiseFloor',0,8],['saturation',0,1.3],['shadows',0,1]])
      if(typeof value[key]==='number'&&Number.isFinite(value[key]))result[key]=Math.min(max,Math.max(min,value[key]));
    return result;
  }
  function historyValid(previous,time,w,h){return !!previous && previous.w===w && previous.h===h && time>previous.time && time-previous.time<.25;}
  // Auto renders at the height the video occupies on screen in physical pixels, so
  // FSR and sharpening happen at final size instead of the compositor's bilinear
  // stretch (e.g. 1080p stream on a 1220-1280 px phone panel). Never above 2160p or
  // the display (an HDMI 1080p signal stays native); steps of 8 px avoid churn.
  function resolveOutput(output,displayHeight,sourceHeight){
    if(output!=='auto')return output;
    const height=Math.min(2160,Math.floor(displayHeight/8)*8);
    return height>sourceHeight*1.04?String(height):'native';
  }
  // SGSR 1 (Spec 3 item 5) parameters from the Nitidez slider. Measured on compressed video
  // (docs/spec2-estudo.md, Ganho visual): edge threshold 20/255 and strength 1.0 at the default
  // sharpness 2. The slope matches the edge energy of USM: SGSR 1.0/1.5 give 1.08/1.31 against USM
  // 2/3 at 1.04/1.26, so strength = 0.2 + 0.4 x sharpness (3 -> 1.4, 4.5 -> 2.0, the upstream value).
  // Sharpness 0 skips the edge step (threshold above any vote): plain bilinear scaling, no sharpening.
  function sgsrParams(sharpness){return sharpness>0?{sharp:.2+.4*sharpness,threshold:20/255}:{sharp:1,threshold:4};}
  function outputSize(w,h,output){const height=/^\d+$/.test(output)?Number(output):h;return {width:Math.round(w*height/h),height};}
  function createBudget(){return {limitMs:3,values:[],p95:null,cadenceOver:0,fenceOver:0,over:0,temporalAllowed:true,neuralAllowed:true,debandScale:1,debandTaps:4,antialiasAllowed:true,cleanupAllowed:true,enhanceAllowed:true,outputCap:Infinity,settings:defaults,sourceHeight:1080,revision:0,reason:'',
  configure(settings,height){this.settings=normalize(settings);this.sourceHeight=height;},
  outputFor(settings){
    if(settings.mode!=='filtered'||settings.gpuBudget===0||settings.output==='native'||this.outputCap===Infinity)return settings.output;
    const height=Math.min(Number(settings.output),this.outputCap);
    return height<=this.sourceHeight?'native':String(height);
  },degrade(){
    const s=this.settings;
    if(this.limitMs===0)return;
    if(s.temporal>0&&this.temporalAllowed){this.temporalAllowed=false;this.reason='Temporal desligado para preservar fluidez';}
    else if(s.output!=='native'&&Math.min(Number(s.output),this.outputCap)>this.sourceHeight){
      this.outputCap=Math.min(Number(s.output),this.outputCap)>1440&&this.sourceHeight<1440?1440:this.sourceHeight;
      this.reason='Saída reduzida para '+(this.outputCap===this.sourceHeight?'nativa':this.outputCap+'p')+' para preservar fluidez';
    }
    else if(s.antialias>0&&this.antialiasAllowed){this.antialiasAllowed=false;this.reason='Antialiasing desligado para preservar fluidez';}
    else if(s.neural>0&&this.neuralAllowed){this.neuralAllowed=false;this.reason='Reconstrução neural desligada para preservar fluidez';}
    else if(s.deband>0&&this.debandScale>0){this.debandScale=Math.max(0,this.debandScale-.5);this.debandTaps=this.debandScale>0?2:0;this.reason='Degradês reduzidos para preservar fluidez';}
    else if(s.cleanup>0&&this.cleanupAllowed){this.cleanupAllowed=false;this.reason='Limpeza desligada para preservar fluidez';}
    else if((s.detail>0||s.chroma>0)&&this.enhanceAllowed){this.enhanceAllowed=false;this.reason='Detalhe e cor desligados para preservar fluidez';}
    else return;
    // Do not let timings from a more expensive pipeline trigger the next reduction.
    this.values=[];this.over=0;this.cadenceOver=0;this.revision++;
  },cadence(reference,current,ratio=.95){
    if(this.limitMs===0)return;
    if(!Number.isFinite(reference)||reference<=0||!Number.isFinite(current))return;
    this.cadenceOver=current<reference*ratio?this.cadenceOver+1:0;
    if(this.cadenceOver>=3){this.degrade();this.cadenceOver=0;}
  },fenceTrend(p50,reference){
    // Early warning only (docs/spec2-estudo.md 10.4, an inference): the fence p50 above 1.5 frame
    // intervals for 3 windows in a row. It never reduces the treatment: the fence includes queued work,
    // so it is an upper bound, and the GPU occupancy, not milliseconds, is what the study validated.
    if(!Number.isFinite(p50)||!Number.isFinite(reference)||reference<=0){this.fenceOver=0;return false;}
    this.fenceOver=p50>1.5*1000/reference?this.fenceOver+1:0;
    return this.fenceOver>=3;
  },sample(ms,mode='filtered'){
    if(mode!=='filtered')return;
    if(!Number.isFinite(ms)||ms<0)return;
    this.values.push(ms);if(this.values.length>60)this.values.shift();
    const sorted=[...this.values].sort((a,b)=>a-b);this.p95=sorted[Math.ceil(sorted.length*.95)-1];
    if(this.values.length<60)return;
    this.over=this.limitMs>0&&this.p95>this.limitMs?this.over+1:0;
    if(this.over>=30){this.degrade();this.over=0;}
  }};}
  // Reference for the cadence adaptation without GPU timers: the frames the decoder delivers right now,
  // under Better xCloud's FPS limit. It follows the game (about 60 FPS in menus, 30 in a match) and falls
  // with the network, so a stream problem never reads as GPU overload. Under 10 FPS it is a stall: no reference.
  function liveCadence(received,limit){if(!Number.isFinite(received)||received<10)return null;return limit>0?Math.min(received,limit):received;}
  // Fraction of the live rate the frames shown must stay above, per path and target rate (Spec 3 item 6).
  // Direct capture shows every decoded frame: 5%. The <video> element skips frames that arrive together
  // without any GPU overload: 0.1% at 30 FPS on the Poco F7 (10% kept), but 5-17% of 60 FPS shown at
  // 60, with the GPU at 3.7% (bare video, 49.7 FPS) as well as at 88% (docs/medicoes/spec2 poco-base,
  // poco-fps, poco-candidatos, poco-longa60; a file clip, not WebRTC). There 20%: above the worst loss
  // without overload, while a sustained 30% fall still reduces.
  // 45 FPS splits the two targets (the live rate is about 30 or 60, lower only on a weak network).
  function cadenceMargin(direct,reference){return direct?.95:reference>45?.8:.9;}
  function createDiagnostics(){
    // One segment per distinct configuration: returning to an earlier one (e.g. the adaptive QP level)
    // continues its segment, with time counted only while it is current. Besides the GPU time, each
    // segment keeps the intervals between frames shown (display), reaching the treatment (arrival) and
    // captured by the server (server), the Fluidez wait per frame, its drops and the frames the <video>
    // element skipped; the report adds a per-second stream timeline, so pacing can be read from the
    // file, not only the average FPS.
    let recording=false,segments=[],byKey=new Map(),current=null,gpuCount=0,raw=0,disjoints=0,started=null,ended=null,stopReason=null,metadata={},timeline=[],timelineCut=false;
    const GPU_LIMIT=120000,RAW_LIMIT=300000,TIMELINE_LIMIT=3600,INTERVALS=['display','arrival','server','wait'];
    const percentile=(a,p)=>a.length?a[Math.ceil(a.length*p)-1]:null,round=v=>Math.round(v*100)/100;
    // Interval series: count, mean, deviation and maximum are exact and percentiles come from 0.1 ms bins,
    // so the summary covers the whole segment however long; only the raw samples stop at RAW_LIMIT in
    // total (samplesTruncated).
    const series=()=>({n:0,sum:0,sq:0,max:null,bins:new Map(),samples:[],cut:false});
    function push(x,v){x.n++;x.sum+=v;x.sq+=v*v;if(x.max===null||v>x.max)x.max=v;const b=Math.round(v*10);x.bins.set(b,(x.bins.get(b)||0)+1);
      if(raw<RAW_LIMIT){x.samples.push(round(v));raw++;}else x.cut=true;}
    // Hitches (display/arrival/server): intervals over 1.5x the median, i.e. a frame shown late. Not for waits.
    function summary(x,hitches=true){
      if(!x.n)return {count:0,meanMs:null,p50:null,p95:null,p99:null,maxMs:null,deviationMs:null,hitches:hitches?0:null,samplesMs:[],samplesTruncated:false};
      const bins=[...x.bins].sort((a,b)=>a[0]-b[0]),mean=x.sum/x.n;
      const at=p=>{const rank=Math.ceil(x.n*p);let acc=0;for(const [b,c] of bins){acc+=c;if(acc>=rank)return b/10;}return bins[bins.length-1][0]/10;};
      const median=at(.5);
      return {count:x.n,meanMs:mean,p50:median,p95:at(.95),p99:at(.99),maxMs:x.max,deviationMs:Math.sqrt(Math.max(0,x.sq/x.n-mean*mean)),
        hitches:hitches?bins.reduce((a,[b,c])=>b/10>median*1.5?a+c:a,0):null,samplesMs:x.samples,samplesTruncated:x.cut};}
    return {
      get active(){return recording;},get startedAt(){return started;},
      start(meta={}){recording=true;segments=[];byKey=new Map();current=null;gpuCount=raw=0;disjoints=0;started=Date.now();ended=null;stopReason=null;metadata=meta;timeline=[];timelineCut=false;},
      stop(reason=null){if(!recording)return;recording=false;ended=Date.now();stopReason=reason;},
      frame(config,time){if(!recording)return null;const key=JSON.stringify(config);
        if(current?.key!==key){if(current)current.activeMs+=current.last-current.since;
          let segment=byKey.get(key);
          if(!segment){if(segments.length>=256){this.stop('limite de 256 configurações');return null;}
            segment={key,config,frames:0,visits:0,activeMs:0,since:time,last:time,dropped:0,skipped:0,gpu:[],display:series(),arrival:series(),server:series(),wait:series()};segments.push(segment);byKey.set(key,segment);}
          segment.visits++;segment.since=segment.last=time;current=segment;}
        current.frames++;current.last=time;return current;
      },
      sample(segment,ms){if(!segment||!segments.includes(segment)||!Number.isFinite(ms)||ms<0)return;
        if(gpuCount>=GPU_LIMIT)return;segment.gpu.push(ms);gpuCount++;
      },
      // Interval (ms) of the configuration being rendered: 'display', 'arrival', 'server' or 'wait'.
      interval(kind,ms){if(!recording||!current||!INTERVALS.includes(kind)||!Number.isFinite(ms)||ms<0)return;push(current[kind],ms);},
      dropped(n){if(recording&&current&&n>0)current.dropped+=n;},
      skipped(n){if(recording&&current&&n>0)current.skipped+=n;},
      // One row per second of stream telemetry, t in seconds since the start; at most an hour.
      timeline(entry){if(!recording)return;if(timeline.length>=TIMELINE_LIMIT){timelineCut=true;return;}const row={t:round((Date.now()-started)/1000)};
        for(const [k,v] of Object.entries(entry))row[k]=typeof v==='number'?(Number.isFinite(v)?(k==='bitsPerPixel'?Math.round(v*1e4)/1e4:round(v)):null):v??null;timeline.push(row);},
      annotate(meta){if(recording)Object.assign(metadata,meta);},
      disjoint(){if(recording)disjoints++;},
      report(){return {schema:2,version:'10.0.0',build:globalThis.BxBuild??null,started,ended,stopReason,recording,metadata,disjoints,
        sampleLimit:{gpu:GPU_LIMIT,intervals:RAW_LIMIT,timeline:TIMELINE_LIMIT},truncated:gpuCount>=GPU_LIMIT||raw>=RAW_LIMIT||timelineCut||segments.length>=256,
        segments:segments.map(segment=>{const {config,frames,visits,gpu,dropped,skipped}=segment,durationMs=segment.activeMs+(segment===current?segment.last-segment.since:0);
          const sorted=[...gpu].sort((a,b)=>a-b);return {config,frames,durationMs,drawFps:durationMs>0?(frames-visits)*1000/durationMs:null,pacerDropped:dropped,videoSkipped:skipped,
            gpu:{count:gpu.length,p50:percentile(sorted,.5),p95:percentile(sorted,.95),p99:percentile(sorted,.99),samplesMs:[...gpu]},
            display:summary(segment.display),arrival:summary(segment.arrival),server:summary(segment.server),wait:summary(segment.wait,false)};}),
        timeline};}
    };
  }
  async function captureVideoStats(video,peer){
    const quality=video?.getVideoPlaybackQuality?.();
    const result={time:Date.now(),video:video?{width:video.videoWidth,height:video.videoHeight,currentTime:video.currentTime,totalVideoFrames:quality?.totalVideoFrames??null,droppedVideoFrames:quality?.droppedVideoFrames??null}:null,rtc:[]};
    if(peer?.getStats)try{const stats=await peer.getStats();stats.forEach(item=>{
      if(item.type!=='inbound-rtp'||item.kind!=='video')return;
      const row={};for(const key of ['id','timestamp','ssrc','decoderImplementation','powerEfficientDecoder','framesDecoded','framesPerSecond','framesDropped','framesReceived','totalDecodeTime','jitterBufferDelay','jitterBufferEmittedCount','freezeCount','totalFreezesDuration','bytesReceived','packetsReceived','packetsLost','jitter'])row[key]=item[key]??null;
      const codec=stats.get(item.codecId);row.codec=codec?{mimeType:codec.mimeType,sdpFmtpLine:codec.sdpFmtpLine,h264Profile:h264Profile(codec.sdpFmtpLine)}:null;result.rtc.push(row);
    });}catch{result.rtcUnavailable=true;}return result;
  }
  // Decoder summary from two inbound-rtp video snapshots: DT as in Better xCloud's stats bar
  // (decode time per frame) plus hardware/software when the browser exposes it. Chrome may hide
  // decoderImplementation/powerEfficientDecoder for privacy; then the kind is 'unknown'.
  // H.264 profile from profile-level-id (first byte, profile_idc): 42 Baseline, 4d Main, 64 High.
  function h264Profile(fmtp){
    const id=/profile-level-id=([0-9a-f]{2})/i.exec(fmtp||'')?.[1]?.toLowerCase();
    return {'42':'Baseline','4d':'Main','58':'Extended','64':'High'}[id]||null;
  }
  // Video pipeline summary from two inbound-rtp snapshots: DT as in Better xCloud's stats bar
  // (decode time per frame), jitter buffer delay per emitted frame, received FPS, plus
  // hardware/software when the browser exposes it (Chrome may hide it; then 'unknown').
  function decoderSummary(previous,current){
    if(!current)return null;
    const frames=previous?current.framesDecoded-previous.framesDecoded:0;
    const dt=frames>0?(current.totalDecodeTime-previous.totalDecodeTime)/frames*1000:null;
    const emitted=previous?current.jitterBufferEmittedCount-previous.jitterBufferEmittedCount:0;
    const jitter=emitted>0?(current.jitterBufferDelay-previous.jitterBufferDelay)/emitted*1000:null;
    const kind=current.powerEfficientDecoder===true?'hardware':current.powerEfficientDecoder===false?'software':'unknown';
    return {kind,implementation:current.decoderImplementation||null,dtMs:Number.isFinite(dt)?dt:null,jitterMs:Number.isFinite(jitter)?jitter:null,
      fps:Number.isFinite(current.framesPerSecond)?current.framesPerSecond:null,codec:current.codec||null};
  }
  // Frame pacing from the arrival times (ms) of new frames: mean interval, deviation, p95 and
  // "hitches" (intervals over 1.5x the median, i.e. a frame shown late). 30 FPS ideal: 33.3 ms, 0 hitches.
  function frameStats(times){
    const d=[];for(let i=1;i<times.length;i++)d.push(times[i]-times[i-1]);
    if(d.length<3)return null;
    const sorted=[...d].sort((a,b)=>a-b),median=sorted[Math.floor(sorted.length/2)],mean=d.reduce((a,b)=>a+b,0)/d.length;
    const deviation=Math.sqrt(d.reduce((a,b)=>a+(b-mean)**2,0)/d.length);
    return {meanMs:mean,deviationMs:deviation,p95Ms:sorted[Math.ceil(sorted.length*.95)-1],hitches:d.filter(v=>v>median*1.5).length,frames:d.length};
  }
  // Requested WebRTC buffering target (ms), not a guarantee of actual delay.
  // The browser may clamp or gradually apply it; null restores its own policy.
  function applySmoothing(peer,ms){
    const result={requestedMs:ms,receivers:0,supported:0,applied:0,failed:0,state:'waiting'};
    if(!peer?.getReceivers)return result;
    for(const r of peer.getReceivers()){
      if(r.track?.kind!=='video')continue;
      result.receivers++;
      const key='jitterBufferTarget' in r?'jitterBufferTarget':'playoutDelayHint' in r?'playoutDelayHint':null;
      if(!key)continue;
      result.supported++;
      try{
        const value=ms>0?(key==='playoutDelayHint'?ms/1000:ms):null;
        if(r[key]!==value)r[key]=value;
        if(r[key]===value)result.applied++;else result.failed++;
      }catch{result.failed++;}
    }
    result.state=!result.receivers?'waiting':!result.supported?'unsupported':result.applied===result.receivers?'requested':result.applied?'partial':'error';
    return result;
  }
  // RTP video timestamps are 90 kHz, 32-bit: unwrap to a monotonic millisecond clock.
  function createRtpClock(){let last=null,ms=0;return v=>{if(!Number.isFinite(v))return null;if(last===null){last=v;return ms;}
    let d=(v-last)>>>0;if(d>0x80000000)d-=0x100000000;last=v;ms+=d/90;return ms;};}
  // Frame pacer ("Fluidez"): frames are processed on arrival and shown on a steady clock instead of
  // the moment they arrive, delayed like a jitter buffer by the recent network transit.
  // balanced: the clock is the server capture time (RTP), keeping the game's own cadence; max: an
  // ideal 30/60 FPS grid that follows the capture clock's drift but not its jitter, also evening out
  // an irregular game/server cadence. Without RTP times, both use the grid on arrival times.
  function createPacer(mode='balanced',{minDelay=3,lead=4,maxQueue=2}={}){
    const queue=[],deltas=[],transits=[];let lastP=null,lastRef=null,clock=null,grid=null,offset=null,cadence=null,dropped=0,extra=null;
    // Cadence: median of recent intervals, so missing source frames (a 2x interval) do not stretch it,
    // snapped to exact 30/60 FPS when close. A mean of 34 ms (30 FPS, 2% missing) drifted the grid.
    function updateCadence(d){if(d>2&&d<200){deltas.push(d);if(deltas.length>30)deltas.shift();}
      if(deltas.length>=5){const m=[...deltas].sort((a,b)=>a-b)[deltas.length>>1];cadence=Math.abs(m-1000/30)<2?1000/30:Math.abs(m-1000/60)<1?1000/60:m;}}
    function schedule(f){
      // Clocks: 'rtp' (rVFC RTP times, from 0), 'frame' (VideoFrame times, monotonic since boot) or
      // 'arrival'. A change of clock, or a jump of more than a second (stall, RTP restart), restarts the
      // clock-relative state; lastP keeps the display order.
      const kind=f.rtp==null?'arrival':f.clock||'rtp',ref=f.rtp??f.arrival;
      if(kind!==clock||lastRef!==null&&(ref<lastRef||ref-lastRef>1000)){clock=kind;lastRef=grid=offset=null;transits.length=0;}
      const interval=lastRef===null?null:ref-lastRef;if(interval!==null)updateCadence(interval);lastRef=ref;
      let base=null,p;
      if(mode==='balanced'&&kind!=='arrival')base=ref;
      else if(cadence){
        // Whole periods since the last slot: a missing source frame holds the previous one for exactly
        // two. Following the clock by 5% per frame absorbs drift and filters jitter.
        const next=grid===null?ref:grid+cadence*Math.max(1,Math.round((ref-grid)/cadence));
        base=grid=next+.05*(ref-next);
      }
      if(base!==null){
        // Like a jitter buffer: delay = recent transit (arrival - clock) + margin, its 95th percentile
        // (balanced) or the latest of the last 3 s (max: no frame misses its slot). It rises at once
        // (a later slot only shows the frame late) and falls 0.25 ms per frame once late frames leave
        // the window, so the slots stay steady instead of following each sample.
        transits.push(f.arrival-base);if(transits.length>90)transits.shift();
        const sorted=[...transits].sort((a,b)=>a-b),target=sorted[Math.min(sorted.length-1,Math.floor(sorted.length*(mode==='max'?1:.95)))]+minDelay;
        offset=offset===null||target>offset?target:Math.max(target,offset-.25);p=base+offset;
      }else p=f.arrival+minDelay;
      if(p<f.arrival)p=f.arrival;
      // Never let the schedule fall behind real time by more than about a frame and a half.
      if(cadence&&p-f.arrival>cadence*1.5)p=f.arrival+minDelay;
      if(lastP!==null&&p<lastP)p=lastP;
      f.p=p;lastP=p;
    }
    return {
      mode,
      get queued(){return queue.length;},get pending(){return queue.slice();},get dropped(){return dropped;},get extraDelayMs(){return extra;},get cadenceMs(){return cadence;},
      add(frame){queue.push(frame);while(queue.length>maxQueue+1){queue.shift();dropped++;}return frame;},
      attach(rtp){for(let i=queue.length-1;i>=0;i--)if(queue[i].rtp==null&&queue[i].p==null){queue[i].rtp=rtp;return true;}return false;},
      // Returns the frame to show at this display refresh (or null to keep the current one).
      tick(now){
        for(const f of queue)if(f.p==null)schedule(f);
        let pick=-1;for(let i=0;i<queue.length;i++)if(queue[i].p<=now+lead)pick=i;
        if(pick<0)return null;
        if(pick>0)dropped+=pick;
        const f=queue.splice(0,pick+1).pop();f.shown=now;
        const delay=now-f.arrival;extra=extra===null?delay:extra*.9+delay*.1;
        return f;
      },
      reset(){queue.length=0;deltas.length=0;transits.length=0;lastP=lastRef=clock=grid=offset=cadence=extra=null;dropped=0;}
    };
  }
  // Stream quality between two inbound-rtp video snapshots (getStats, ms timestamps): received bitrate,
  // packet loss and the mean H.264 QP per decoded frame (lower = less compression, 0-51).
  function streamSummary(previous,current){
    if(!current)return null;
    const seconds=previous?(current.timestamp-previous.timestamp)/1000:0,delta=k=>previous&&Number.isFinite(current[k])&&Number.isFinite(previous[k])?current[k]-previous[k]:null;
    const bytes=delta('bytesReceived'),lost=delta('packetsLost'),received=delta('packetsReceived'),qp=delta('qpSum'),frames=delta('framesDecoded');
    return {bitrateMbps:seconds>0&&bytes>=0?bytes*8/seconds/1e6:null,lossPct:lost!==null&&received!==null&&lost+received>0?Math.max(0,lost)*100/(lost+received):null,
      qp:qp!==null&&frames>0?qp/frames:null,frames,framesDropped:delta('framesDropped'),freezes:delta('freezeCount'),
      width:Number.isFinite(current.frameWidth)?current.frameWidth:null,height:Number.isFinite(current.frameHeight)?current.frameHeight:null,
      // Encoded bits per pixel of each frame: the compression estimate when the browser reports no QP.
      bitsPerPixel:bytes!==null&&bytes>=0&&frames>0&&current.frameWidth>0&&current.frameHeight>0?bytes*8/(frames*current.frameWidth*current.frameHeight):null};
  }
  // Without the decoder's QP (the Android WebView reports no qpSum), the bits per pixel stand in for it:
  // 0.12 bit/pixel (15 Mb/s at 1080p60, the middle of the v9 calibration streams) is the neutral QP 28,
  // and each doubling 4 QP less. H.264 needs about 6 QP per doubling; the gentler slope keeps an
  // estimate that cannot see the scene content closer to neutral.
  function qpFromBitsPerPixel(bpp){if(!(bpp>0)||!Number.isFinite(bpp))return null;return Math.min(51,Math.max(0,28-4*Math.log2(bpp/.12)));}
  // Compression-adaptive treatment: like a codec's deblocking filter, cleanup and debanding follow the
  // quantizer. Level 0 (QP <= 20, clean stream) to 1 (QP >= 36, heavy compression), in steps of 0.1;
  // QP 28 is neutral (all scales 1), so typical streams keep the measured v9 strengths.
  function compressionLevel(qp){if(!Number.isFinite(qp))return null;const t=Math.min(1,Math.max(0,(qp-20)/16));return Math.round(t*t*(3-2*t)*10)/10;}
  function compressionScales(level){if(level===null||!Number.isFinite(level))return {cleanup:1,deband:1,detail:1};
    return {cleanup:.6+.8*level,deband:.6+.8*level,detail:1.2-.4*level};}
  // One-tap starting points. natural = Spec 3 defaults (docs/spec3-implementacao.md); v9 = the previous defaults (docs/analysis-v9.md); console = sharpness
  // 2 for less texture flicker (docs/analysis-v9.1.md); the others trade fidelity for a purpose.
  const presets=Object.freeze({
    natural:{label:'Natural',description:'Padrão da Spec 3: nitidez 2, degradês 60%, sem Compressão nem Detalhe (menos GPU, índice visual maior).',values:{sharpness:2,cleanup:0,deband:.6,chroma:.75,detail:0,sharpening:'usm',lumaSharpen:true,neural:0,temporal:0,antialias:0,output:'auto'}},
    v9:{label:'Padrão v9',description:'Padrão anterior (v9): nitidez 3, Compressão 50%, Degradês 30%, Detalhe 20%. Mais GPU.',values:{sharpness:3,cleanup:.5,deband:.3,chroma:.75,detail:.2,sharpening:'usm',lumaSharpen:true,neural:0,temporal:0,antialias:0,output:'auto'}},
    console:{label:'Console',description:'Nitidez 2: menos cintilação de textura, aparência de console.',values:{sharpness:2,cleanup:.5,deband:.3,chroma:.75,detail:.1,sharpening:'usm',lumaSharpen:true,neural:0,temporal:0,antialias:0,output:'auto'}},
    sharp:{label:'Nítido',description:'Mais contorno e textura; mais cintilação em movimento.',values:{sharpness:4.5,cleanup:.35,deband:.2,chroma:.75,detail:.35,sharpening:'usm',lumaSharpen:true,neural:0,temporal:0,antialias:0,output:'auto'}},
    clean:{label:'Bitrate baixo',description:'Mais limpeza de blocos e degradês para streams muito comprimidos.',values:{sharpness:2.5,cleanup:.8,deband:.6,chroma:.75,detail:.1,sharpening:'usm',lumaSharpen:true,neural:0,temporal:0,antialias:0,output:'auto'}},
    light:{label:'Leve',description:'Menos passes na GPU: saída nativa, sem degradês nem detalhe.',values:{sharpness:3,cleanup:.35,deband:0,chroma:.5,detail:0,sharpening:'usm',lumaSharpen:true,neural:0,temporal:0,antialias:0,output:'native'}},
  });
  function presetOf(settings){for(const [key,p] of Object.entries(presets))if(Object.entries(p.values).every(([k,v])=>settings[k]===v))return key;return 'custom';}
  // Indented JSON with each samplesMs array on one line (one number per line would multiply the size).
  function reportText(report){return JSON.stringify(report,(k,v)=>k==='samplesMs'&&Array.isArray(v)?'@@'+JSON.stringify(v)+'@@':v,2).replace(/"@@(\[[^"]*\])@@"/g,'$1');}
  // The Android app's WebView cannot download blobs: its bridge saves the file to Downloads instead.
  function downloadReport(report){const name='bx-v10.0.0-diagnostics-'+Date.now()+'.json';
    const text=reportText(report);
    if(typeof globalThis.BxAndroid?.saveFile==='function'){const where=globalThis.BxAndroid.saveFile(name,'application/json',text);if(where)return where;}
    const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  const vertex='#version 300 es\nlayout(location=0) in vec2 position;void main(){gl_Position=vec4(position,0,1);}';
  // Spatial pass variants (Spec 3, docs/spec2-estudo.md 10.2). The precision profile comes from the GPU:
  // mediump color math where mediump really is half precision (Adreno/Mali report 10 bits, Poco F7
  // spatial 2.9 -> 2.3 ms), highp elsewhere (Iris Xe and SwiftShader gain nothing and keep the
  // generic shader's exact output). Strengths stay uniforms: the compression adaptation moves them.
  function spatialPrecision(gl,requested='auto'){
    if(requested==='highp'||requested==='mediump')return requested;
    try{const f=gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER,gl.MEDIUM_FLOAT);return f&&f.precision>0&&f.precision<=10?'mediump':'highp';}catch{return 'highp';}
  }
  // What a variant compiles in: which filters run (strength > 0), the deband taps and the two flags.
  // These change only with the settings or an adaptation step, never per frame.
  function spatialProfile(u,precision='highp'){
    // Taps as the generic loop counts them: tap i runs while i < debandTaps.
    const deband=u.deband>0,taps=deband&&u.debandTaps>0?Math.min(4,Math.ceil(u.debandTaps)):0;
    return {precision,cleanup:u.cleanup>0,deband,taps,chroma:u.chroma>0,detail:u.detail>0,antialias:u.antialias>0,quantize:!!u.quantize,selective:!!u.selective};
  }
  function spatialKey(p){return [p.precision,p.cleanup,p.deband,p.taps,p.chroma,p.detail,p.antialias,p.quantize,p.selective].map(v=>v===true?1:v===false?0:v).join('.');}
  function spatialSource(code,p){
    const lines=['#define SPATIAL_FIXED 1','#define SPATIAL_PRECISION '+p.precision,'#define SPATIAL_TAPS '+p.taps.toFixed(1),'#define SPATIAL_QUANTIZE '+p.quantize,'#define SPATIAL_SELECTIVE '+p.selective];
    for(const k of ['cleanup','deband','chroma','detail','antialias'])lines.push('#define SPATIAL_'+k.toUpperCase()+' '+(p[k]?1:0));
    const at=code.indexOf('\n');return code.slice(0,at+1)+lines.join('\n')+'\n'+code.slice(at+1);
  }
  // SGSR precision as the spatial pass: mediump color math on half-precision GPUs, highp elsewhere.
  function sgsrSource(code,precision){const at=code.indexOf('\n');return code.slice(0,at+1)+'#define SGSR_PRECISION '+precision+'\n'+code.slice(at+1);}
  // What one frame runs, shared by the WebGL2 and WebGPU renderers (Spec 4): the filters left on by the
  // budget and their strengths, the scaler and the last pass with its uniforms. Each renderer only turns
  // this into draws. Neural restoration, temporal and the separate AA pass after it are WebGL2-only
  // (gl: true); the WebGPU renderer hands such a frame back to WebGL2 (rendererSupports).
  // floatTargets: whether Qualidade gets 16-bit float targets (then the spatial pass does not dither).
  function framePlan(s,budget,w,h,outW,outH,floatTargets,diagnostic=false){
    const filtered=s.mode==='filtered',quality=s.processingMode==='quality',plan={filtered,quality,neural:0,spatial:null,temporal:0,antialias:0,scaler:null,final:null,gl:false};
    if(filtered){
      if(s.neural>0&&floatTargets&&budget.neuralAllowed)plan.neural=s.neural;
      const cleanup=budget.cleanupAllowed?s.cleanup:0,deband=s.deband*budget.debandScale;
      const chroma=budget.enhanceAllowed?s.chroma:0,detail=budget.enhanceAllowed?s.detail:0;
      const temporalEnabled=s.temporal>0&&budget.temporalAllowed;
      // Without temporal, AA runs inside the spatial pass (no extra full-frame pass).
      const antialias=s.antialias>0&&budget.antialiasAllowed?s.antialias:0,fusedAntialias=temporalEnabled?0:antialias;
      if(cleanup>0||deband>0||chroma>0||detail>0||fusedAntialias>0)
        plan.spatial={cleanup,deband,chroma,detail,antialias:fusedAntialias,debandTaps:budget.debandTaps,quantize:!(quality&&floatTargets),selective:s.spatialMode==='selective'};
      if(temporalEnabled){plan.temporal=s.temporal;plan.antialias=antialias;}
      // Upscale: EASU then the sharpening pass, or SGSR alone as the last pass (item 5). At native
      // output SGSR is never used: the sharpening pass stays (SGSR was measured only when scaling).
      if(s.upscale&&outW>w&&outH>h)plan.scaler=s.scaler==='sgsr'?'sgsr':'easu';
    }
    // One last pass to the output: SGSR (scaling and sharpening, with the finishing of the sharpening
    // pass), or one sharpening stage. 'native' follows the Better xCloud menu (CAS/USM). The
    // reference applies the same method and strength with the unmodified upstream shader.
    if(plan.scaler==='sgsr')plan.final={name:'sgsr',key:'source',uniforms:{...sgsrParams(s.sharpness),brightness:1,contrast:s.contrast,saturation:s.saturation,shadows:s.shadows,deband:s.deband*budget.debandScale,diagnostic}};
    else{const method=s.sharpening==='native'?s.processing:s.sharpening;
      const name=s.mode!=='original'&&method==='rcas'?'rcas':filtered?'casFiltered':'cas';
      plan.final={name,key:'data',filterId:method==='usm'?1:2,uniforms:{iResolution:[outW,outH],qualityMode:filtered&&quality,rcasStrength:s.sharpness/10,haloMargin:(2+s.sharpness)/255,noiseFloor:s.noiseFloor/255,lumaSharpen:s.lumaSharpen,sharpenFactor:s.mode==='original'?0:s.mode==='cas'?s.sharpness/1.2:s.sharpness/(quality?1:1.2),brightness:1,contrast:filtered?s.contrast:1,saturation:filtered?s.saturation:1,shadows:filtered?s.shadows:0,deband:filtered?s.deband*budget.debandScale:0,diagnostic}};}
    plan.gl=plan.neural>0||plan.temporal>0;
    return plan;
  }
  // Whether the WebGPU renderer draws this plan; otherwise the frame goes to WebGL2 (same image).
  function rendererSupports(plan){return !plan.gl;}
  // Renderer for the 'auto' setting (Spec 4). WebGPU only on a GPU where both acceptance criteria of
  // docs/spec4-webgpu.md were met: an image equivalent to WebGL2 and a GPU cost equal or lower than WebGL2
  // in a 30 FPS session. Entries are adapter {vendor, architecture} pairs; none qualified so far.
  const AUTO_WEBGPU=Object.freeze([]);
  function autoRenderer(adapter){return adapter&&AUTO_WEBGPU.some(a=>a.vendor===adapter.vendor&&a.architecture===adapter.architecture)?'webgpu':'webgl2';}
  // Configuration of one frame in the measurement (diagnostics segment), shared by both renderers.
  function segmentConfig(s,budget,w,h,outW,outH,revision,diagnostic,floatTargets,renderer){
    const filtered=s.mode==='filtered',{hud:_hud,hudPosition:_position,...measured}=s;
    const config={settings:measured,diagnostic,source:[w,h],output:[outW,outH],revision,effective:{neural:filtered&&floatTargets&&budget.neuralAllowed?s.neural:0,temporal:filtered&&s.temporal>0&&budget.temporalAllowed,cleanup:filtered&&budget.cleanupAllowed?s.cleanup:0,chroma:filtered&&budget.enhanceAllowed?s.chroma:0,detail:filtered&&budget.enhanceAllowed?s.detail:0,deband:filtered?s.deband*budget.debandScale:0,debandTaps:filtered&&s.deband>0?budget.debandTaps:0,antialias:filtered&&budget.antialiasAllowed?s.antialias:0,scaler:filtered&&s.upscale&&outW>w&&outH>h?s.scaler:null}};
    if(renderer)config.renderer=renderer;return config;
  }
  class Engine {
    // options.spatialPrecision: 'auto' (from the GPU), 'highp' or 'mediump'; options.spatialVariants:
    // false keeps the generic uniform-driven spatial shader (benches, comparisons).
    constructor(gl,shaders,options={}){
      this.gl=gl;this.programs={};this.targets={};this.queries=[];this.budget=createBudget();this.previous=null;this.frames=0;this.diagnostics=createDiagnostics();this.ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');
      this.fenceTiming=!this.ext&&typeof gl.fenceSync==='function';this.fence=null;this.fenceAt=-Infinity;this.fenceValues=[];this.fenceGeneration=0;this.gpuEstimate=null;
      this.floatTargets=!!gl.getExtension('EXT_color_buffer_float');
      this.spatialPrecision=spatialPrecision(gl,options.spatialPrecision);this.spatialCode=options.spatialVariants===false?null:shaders.spatial||null;
      this.spatialJobs=new Map();this.spatialUsed=new Map();this.spatialFailed=new Set();this.parallelCompile=gl.getExtension('KHR_parallel_shader_compile');
      try {
        this.vao=gl.createVertexArray();gl.bindVertexArray(this.vao);this.buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
        gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
        for(const [name,code]of Object.entries(shaders))this.programs[name]=this.compile(name==='sgsr'?sgsrSource(code,this.spatialPrecision):code);
        // Pre-warmed with the rest: the spatial variant of the default settings on an RGBA8 target.
        if(this.spatialCode){const d=defaults;this.spatialVariant({cleanup:d.cleanup,deband:d.deband,chroma:d.chroma,detail:d.detail,antialias:d.antialias,debandTaps:4,quantize:true,selective:d.spatialMode==='selective'},true);}
        this.input=gl.createTexture();this.configure(this.input);
      }catch(e){this.destroy();throw e;}finally{gl.bindVertexArray(null);}
    }
    // Compilation in two halves: start() issues the work without waiting, finish() reads the status
    // (which waits for the compiler) and deletes the shader objects.
    startProgram(fragment){const gl=this.gl,program=gl.createProgram(),objects=[];
      for(const [kind,code]of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]]){const s=gl.createShader(kind);objects.push(s);gl.shaderSource(s,code);gl.compileShader(s);gl.attachShader(program,s);}
      gl.linkProgram(program);return {program,objects};}
    finishProgram({program,objects}){const gl=this.gl;try{
      if(!gl.getProgramParameter(program,gl.LINK_STATUS)){
        for(const s of objects)if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));
        throw new Error(gl.getProgramInfoLog(program));}
      return {program,locations:{}};
    }catch(e){gl.deleteProgram(program);throw e;}finally{for(const s of objects)gl.deleteShader(s);}}
    compile(fragment){return this.finishProgram(this.startProgram(fragment));}
    // Program name for the spatial pass with these uniforms. A new profile is compiled once and kept
    // (up to 8, least recently used out); until it is ready the generic shader draws, so a settings or
    // adaptation change never waits for the compiler inside a frame. Its status is read from the next
    // frame on (the browser's GPU process compiles in the meantime), or when KHR_parallel_shader_compile
    // reports it done. A variant that fails to build leaves the generic shader for that profile.
    spatialVariant(u,wait=false){
      if(!this.spatialCode)return 'spatial';
      const gl=this.gl,name='spatial@'+spatialKey(spatialProfile(u,this.spatialPrecision));
      if(!this.programs[name]){
        if(this.spatialFailed.has(name))return 'spatial';
        let job=this.spatialJobs.get(name);
        if(!job){job=this.startProgram(spatialSource(this.spatialCode,spatialProfile(u,this.spatialPrecision)));job.frame=this.frames;this.spatialJobs.set(name,job);}
        if(!wait&&(job.frame===this.frames||this.parallelCompile&&!gl.getProgramParameter(job.program,this.parallelCompile.COMPLETION_STATUS_KHR)))return 'spatial';
        this.spatialJobs.delete(name);
        try{this.programs[name]=this.finishProgram(job);}catch(e){this.spatialFailed.add(name);console.warn('[BxRestoration] spatial variant failed, using the generic shader',name,e);return 'spatial';}
      }
      this.spatialUsed.delete(name);this.spatialUsed.set(name,this.frames);
      if(this.spatialUsed.size>8){const [old]=this.spatialUsed.keys();this.spatialUsed.delete(old);gl.deleteProgram(this.programs[old].program);delete this.programs[old];}
      return name;
    }
    configure(texture){const gl=this.gl;gl.bindTexture(gl.TEXTURE_2D,texture);
      for(const p of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,p,gl.LINEAR);
      for(const p of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,p,gl.CLAMP_TO_EDGE);}
    target(name,w,h,precise=false){const gl=this.gl,fp=precise&&this.floatTargets;this.usedTargets?.add(name);let t=this.targets[name];if(t&&t.w===w&&t.h===h&&t.fp===fp)return t;
      if(t){gl.deleteTexture(t.texture);gl.deleteFramebuffer(t.fbo);}
      t={w,h,fp,texture:gl.createTexture(),fbo:gl.createFramebuffer()};this.targets[name]=t;this.configure(t.texture);
      gl.texImage2D(gl.TEXTURE_2D,0,fp?gl.RGBA16F:gl.RGBA8,w,h,0,gl.RGBA,fp?gl.HALF_FLOAT:gl.UNSIGNED_BYTE,null);
      gl.bindFramebuffer(gl.FRAMEBUFFER,t.fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,t.texture,0);
      if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('Framebuffer incompleto');return t;
    }
    // Two RGBA16F color attachments written by one pass (neural features).
    targetPair(name,w,h){const gl=this.gl;this.usedTargets?.add(name);let t=this.targets[name];if(t&&t.w===w&&t.h===h)return t;
      if(t){gl.deleteTexture(t.texture);gl.deleteTexture(t.second);gl.deleteFramebuffer(t.fbo);}
      t={w,h,fp:true,texture:gl.createTexture(),second:gl.createTexture(),fbo:gl.createFramebuffer()};this.targets[name]=t;
      gl.bindFramebuffer(gl.FRAMEBUFFER,t.fbo);
      for(const [i,texture] of [t.texture,t.second].entries()){this.configure(texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA16F,w,h,0,gl.RGBA,gl.HALF_FLOAT,null);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0+i,gl.TEXTURE_2D,texture,0);}
      gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);
      if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('Framebuffer incompleto');return t;
    }
    draw(name,target,w,h,textures={},uniforms={}){
      const gl=this.gl,p=this.programs[name];gl.bindVertexArray(this.vao);gl.bindFramebuffer(gl.FRAMEBUFFER,target?target.fbo:null);gl.viewport(0,0,w,h);gl.useProgram(p.program);
      // Cache misses too (null): shared uniform sets name uniforms some programs lack.
      const location=k=>Object.hasOwn(p.locations,k)?p.locations[k]:(p.locations[k]=gl.getUniformLocation(p.program,k));
      let slot=0;for(const [key,texture]of Object.entries(textures)){gl.activeTexture(gl.TEXTURE0+slot);gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform1i(location(key),slot++);}
      for(const [key,value]of Object.entries({outputSize:[w,h],...uniforms})){
        if(typeof value==='boolean')gl.uniform1i(location(key),value?1:0);
        else if(Array.isArray(value))gl.uniform2f(location(key),...value);
        else gl.uniform1f(location(key),value);
      }
      gl.drawArrays(gl.TRIANGLES,0,3);
    }
    dropQuery(item){for(const q of [].concat(item.q))this.gl.deleteQuery(q);}
    // A slot leaving the pacer without being presented: its render() time still counts.
    flushSlot(t){if(t.pendingQuery){this.queries.push(t.pendingQuery);t.pendingQuery=null;}t.final=null;}
    poll(){const gl=this.gl;if(!this.ext)return;
      if(gl.getParameter(this.ext.GPU_DISJOINT_EXT)){for(const item of this.queries)this.dropQuery(item);this.queries=[];this.diagnostics.disjoint();return;}
      // A deferred frame (render + present) is one sample made of two queries.
      while(this.queries.length&&[].concat(this.queries[0].q).every(q=>gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE))){
        const item=this.queries.shift();if(item.revision===this.budget.revision){const ms=[].concat(item.q).reduce((a,q)=>a+gl.getQueryParameter(q,gl.QUERY_RESULT),0)/1e6;this.budget.sample(ms,item.mode);this.diagnostics.sample(item.segment,ms);}this.dropQuery(item);}
    }
    // Without the timer query (Android WebView), every 0.5 s a fence after a frame, polled on later tasks,
    // times it from its first command until the GPU finished it: an upper bound of the GPU time (it also
    // counts work queued before it), shown as an estimate and never used to reduce the treatment.
    startFence(start,mode,segment){const gl=this.gl,sync=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);if(!sync)return;gl.flush();
      this.fenceAt=start;this.fence={sync,start,mode,segment,generation:this.fenceGeneration,checked:null};setTimeout(()=>this.pollFence(),1);}
    pollFence(){const gl=this.gl,f=this.fence;if(!f)return;
      if(gl.isContextLost()){this.fence=null;return;}
      const now=performance.now(),signaled=gl.getSyncParameter(f.sync,gl.SYNC_STATUS)===gl.SIGNALED,gap=f.checked===null?0:now-f.checked;
      if(!signaled&&now-f.start<250){f.checked=now;setTimeout(()=>this.pollFence(),1);return;}
      // A late reading measures the delay, not the GPU: a hidden page throttles timers, and a long task
      // between two polls hides when the fence finished. The first poll waits for the rendering update.
      gl.deleteSync(f.sync);this.fence=null;if(!signaled||now-f.start>=250||gap>20)return;
      const ms=now-f.start;this.diagnostics.sample(f.segment,ms);
      if(f.mode!=='filtered'||f.generation!==this.fenceGeneration)return;
      this.fenceValues.push(ms);if(this.fenceValues.length>30)this.fenceValues.shift();
      const sorted=[...this.fenceValues].sort((a,b)=>a-b);this.gpuEstimate={p50:sorted[(sorted.length-1)>>1],p95:sorted[Math.ceil(sorted.length*.95)-1],count:sorted.length};
    }
    outputSize(w,h,settings){
      if(this.budget.limitMs!==settings.gpuBudget){this.resetBudget();this.budget.limitMs=settings.gpuBudget;}
      this.budget.configure(settings,h);this.poll();
      return outputSize(w,h,this.budget.outputFor(settings));
    }
    // outputTarget: draw the final pass into that persistent texture instead of the canvas, so a
    // frame pacer can present it later with present(). Names starting with 'paced' stay allocated.
    // deferFinal (Spec 3 item 8, with outputTarget): the texture keeps the input of the last pass
    // (sharpening or SGSR) and present() draws that pass straight to the canvas, instead of drawing
    // it here and copying the result there: one full-screen copy less per frame. The last
    // intermediate target is handed to the slot without a copy; the video upload and the temporal
    // history, which the next frame reuses, are copied at source size.
    render(video,outW,outH,rawSettings,time,diagnostic=false,outputTarget=null,deferFinal=false){
      const gl=this.gl,s=normalize(rawSettings),w=video.videoWidth||video.displayWidth||video.width,h=video.videoHeight||video.displayHeight||video.height;
      if(!w||!h||gl.isContextLost())return false;
      const started=performance.now();let deferredSlot=null;
      if(this.budget.limitMs!==s.gpuBudget){this.resetBudget();this.budget.limitMs=s.gpuBudget;}
      this.budget.configure(s,h);
      this.poll();let q=null;
      const revision=this.budget.revision;
      const segment=this.diagnostics.active?this.diagnostics.frame(segmentConfig(s,this.budget,w,h,outW,outH,revision,diagnostic,this.floatTargets),performance.now()):null;
      this.usedTargets=new Set();
      if(this.ext&&this.queries.length<4){q=gl.createQuery();gl.beginQuery(this.ext.TIME_ELAPSED_EXT,q);}
      try{
        gl.activeTexture(gl.TEXTURE0);this.configure(this.input);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,video);
        let source=this.input;
        const plan=framePlan(s,this.budget,w,h,outW,outH,this.floatTargets,diagnostic);
        if(plan.filtered){
          // Neural restoration first: trained on decoded stream luma (tools/nn), needs float targets.
          if(plan.neural>0){
            const features=this.targetPair('nnFeatures',w,h),restored=this.target('neural',w,h,plan.quality);
            this.draw('nnFeatures',features,w,h,{source});
            this.draw('nnApply',restored,w,h,{source,featA:features.texture,featB:features.second},{strength:plan.neural});source=restored.texture;
          }
          if(plan.spatial){
            const spatial=this.target('spatial',w,h,plan.quality),u=plan.spatial;
            this.draw(this.spatialVariant(u),spatial,w,h,{source},u);source=spatial.texture;
          }
          const temporalEnabled=plan.temporal>0;
          if(temporalEnabled){
            const qw=Math.max(1,Math.ceil(w/4)),qh=Math.max(1,Math.ceil(h/4));
            const index=(this.historyIndex||0)^1;
            const low=this.target('low'+index,qw,qh),prevLow=this.target('low'+(index^1),qw,qh),history=this.target('history'+(index^1),w,h,true);
            this.draw('copy',low,qw,qh,{source:this.input});
            const valid=historyValid(this.previous,time,w,h);
            const cut=this.target('cut',1,1);this.draw('cut',cut,1,1,{source:low.texture,previous:prevLow.texture});
            const motion=this.target('motion',Math.max(1,Math.ceil(w/16)),Math.max(1,Math.ceil(h/16)));
            gl.bindTexture(gl.TEXTURE_2D,motion.texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
            this.draw('motion',motion,motion.w,motion.h,{source:low.texture,previous:prevLow.texture,cut:cut.texture,fullSource:this.input,fullPrevious:history.texture},{validHistory:valid});
            const temporal=this.target('history'+index,w,h,true);
            this.draw('temporal',temporal,w,h,{source,history:history.texture,motion:motion.texture},{temporal:valid?plan.temporal:0});source=temporal.texture;
            this.historyIndex=index; // Ping-pong retains both histories without two extra copies.
          }
          this.previous=temporalEnabled?{time,w,h}:null;
          if(plan.antialias>0){const aa=this.target('aa',w,h,plan.quality);this.draw('antialias',aa,w,h,{source},{amount:plan.antialias});source=aa.texture;}
          if(plan.scaler==='easu'){const scaled=this.target('scaled',outW,outH,plan.quality);this.draw('easu',scaled,outW,outH,{source});source=scaled.texture;}
        }else this.previous=null;
        const final={...plan.final,textures:{[plan.final.key]:source}};
        if(outputTarget&&deferFinal){
          const old=this.targets[outputTarget];if(old)this.flushSlot(old);
          const owner=source===this.input?null:Object.keys(this.targets).find(k=>this.targets[k].texture===source&&!k.startsWith('history')&&!k.startsWith('paced'));
          let slot;
          if(owner){slot=this.targets[owner];this.targets[outputTarget]=slot;if(old)this.targets[owner]=old;else delete this.targets[owner];}
          else{const fp=source!==this.input;slot=this.target(outputTarget,w,h,fp);this.draw('copy',slot,w,h,{source});}
          slot.final={name:final.name,filterId:final.filterId,key:Object.keys(final.textures)[0],uniforms:final.uniforms,w:outW,h:outH};deferredSlot=slot;
        }else this.drawFinal(final,outputTarget?this.target(outputTarget,outW,outH):null,outW,outH);
        if(this.fenceTiming&&!this.fence&&started-this.fenceAt>=500)this.startFence(started,s.mode,segment);
        this.frames++;return true;
      }finally{
        if(q){gl.endQuery(this.ext.TIME_ELAPSED_EXT);const item={q,mode:s.mode,revision,segment};if(deferredSlot)deferredSlot.pendingQuery=item;else this.queries.push(item);}
        for(const [name,t] of Object.entries(this.targets))if(!this.usedTargets.has(name)&&!name.startsWith('paced')){
          gl.deleteTexture(t.texture);if(t.second)gl.deleteTexture(t.second);gl.deleteFramebuffer(t.fbo);delete this.targets[name];
        }
        this.usedTargets=null;
        gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.bindVertexArray(null);gl.activeTexture(gl.TEXTURE0);
      }
    }
    drawFinal(f,target,w,h){if(f.filterId){const p=this.programs[f.name];this.gl.useProgram(p.program);this.gl.uniform1i(this.gl.getUniformLocation(p.program,'filterId'),f.filterId);}
      this.draw(f.name,target,w,h,f.textures,f.uniforms);}
    // Shows a frame stored by render(...,outputTarget) on the canvas (exact copy at output size).
    // A deferred slot (render(...,deferFinal)) runs its last pass here, timed with its render().
    present(name){const t=this.targets[name],gl=this.gl;if(!t||gl.isContextLost())return false;
      if(t.final){const item=t.pendingQuery;t.pendingQuery=null;let q=null;if(item&&this.ext){q=gl.createQuery();gl.beginQuery(this.ext.TIME_ELAPSED_EXT,q);}
        this.drawFinal({...t.final,textures:{[t.final.key]:t.texture}},null,t.final.w,t.final.h);
        if(q){gl.endQuery(this.ext.TIME_ELAPSED_EXT);item.q=[].concat(item.q,q);}if(item)this.queries.push(item);}
      else this.draw('copy',null,t.w,t.h,{source:t.texture});gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.bindVertexArray(null);gl.activeTexture(gl.TEXTURE0);return true;}
    releasePaced(){const gl=this.gl;for(const [name,t] of Object.entries(this.targets))if(name.startsWith('paced')){if(t.pendingQuery)this.dropQuery(t.pendingQuery);gl.deleteTexture(t.texture);gl.deleteFramebuffer(t.fbo);delete this.targets[name];}}
    resetHistory(){this.previous=null;}
    resetBudget(){for(const item of this.queries)this.dropQuery(item);this.queries=[];for(const t of Object.values(this.targets))if(t.pendingQuery){this.dropQuery(t.pendingQuery);t.pendingQuery=null;}this.budget=createBudget();this.resetHistory();this.fenceGeneration++;this.fenceValues=[];this.gpuEstimate=null;}
    destroy(){const gl=this.gl;
      for(const t of Object.values(this.targets)){gl.deleteTexture(t.texture);if(t.second)gl.deleteTexture(t.second);gl.deleteFramebuffer(t.fbo);}
      for(const p of Object.values(this.programs))gl.deleteProgram(p.program);
      for(const item of this.queries)this.dropQuery(item);for(const t of Object.values(this.targets))if(t.pendingQuery)this.dropQuery(t.pendingQuery);
      if(this.fence){gl.deleteSync(this.fence.sync);this.fence=null;}
      for(const job of this.spatialJobs?.values()||[]){gl.deleteProgram(job.program);for(const s of job.objects)gl.deleteShader(s);}this.spatialJobs?.clear();this.spatialUsed?.clear();
      gl.deleteTexture(this.input);gl.deleteBuffer(this.buffer);gl.deleteVertexArray(this.vao);this.targets={};this.programs={};this.queries=[];
    }
  }
  globalThis.BxRestoration={autoRenderer,AUTO_WEBGPU,framePlan,rendererSupports,segmentConfig,sgsrParams,sgsrSource,spatialPrecision,spatialProfile,spatialKey,spatialSource,liveCadence,cadenceMargin,streamSummary,qpFromBitsPerPixel,compressionLevel,compressionScales,presets,presetOf,createPacer,createRtpClock,frameStats,applySmoothing,h264Profile,decoderSummary,createDiagnostics,captureVideoStats,downloadReport,Engine,defaults,normalize,historyValid,createBudget,outputSize,resolveOutput};
})();

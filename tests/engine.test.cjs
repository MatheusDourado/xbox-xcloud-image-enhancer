const {test}=require('node:test'); const assert=require('node:assert/strict'); const fs=require('node:fs'); const vm=require('node:vm');
function api(){const context={globalThis:{},performance}; if(fs.existsSync('src/restoration-engine.js'))vm.runInNewContext(fs.readFileSync('src/restoration-engine.js','utf8'),context);return context.globalThis.BxRestoration;}
test('validated settings preserve natural colors and separate modes',()=>{const a=api();assert.ok(a,'engine exported');const s=a.normalize({cleanup:5,temporal:-1,contrast:NaN,mode:'bad'});assert.equal(s.cleanup,1);assert.equal(s.temporal,0);assert.equal(s.contrast,1);assert.equal(s.mode,'filtered');assert.equal(s.shadows,0);});
test('temporal history resets on interruption, resize and backwards time',()=>{const a=api();assert.ok(a);assert.equal(a.historyValid({time:1,w:100,h:100},1.02,100,100),true);for(const [time,w,h]of[[0.5,100,100],[2,100,100],[1.02,200,100]])assert.equal(a.historyValid({time:1,w:100,h:100},time,w,h),false);});
test('sustained GPU overload disables temporal before reducing debanding',()=>{const a=api();assert.ok(a);const p=a.createBudget();p.configure({temporal:1,deband:1},1080);for(let i=0;i<90;i++)p.sample(6);assert.equal(p.temporalAllowed,false);for(let i=0;i<90;i++)p.sample(6);assert.ok(p.debandScale<1);assert.equal(p.p95,6);});
test('reference GPU samples never reduce treatments',()=>{const a=api();const p=a.createBudget();for(let i=0;i<200;i++)p.sample(10,'cas');assert.equal(p.temporalAllowed,true);assert.equal(p.debandScale,1);});
test('without GPU timers adaptation requires a measured reference cadence',()=>{const a=api(),p=a.createBudget();p.configure({temporal:1,deband:1},1080);assert.equal(typeof p.cadence,'function');for(let i=0;i<5;i++)p.cadence(null,20);assert.equal(p.temporalAllowed,true);for(let i=0;i<3;i++)p.cadence(60,45);assert.equal(p.temporalAllowed,false);});

test('forced output uses source aspect ratio independent of screen',()=>{
 const a=api();assert.deepEqual(JSON.parse(JSON.stringify(a.outputSize(1920,1080,'native'))),{width:1920,height:1080});
 assert.deepEqual(JSON.parse(JSON.stringify(a.outputSize(1920,1080,'1440'))),{width:2560,height:1440});
 assert.deepEqual(JSON.parse(JSON.stringify(a.outputSize(1920,1080,'2160'))),{width:3840,height:2160});
 assert.equal(a.outputSize(1280,720,'2160').width,3840);
});
test('manual GPU policy retains temporal and gradients despite high timings or low cadence',()=>{
 const p=api().createBudget();p.limitMs=0;for(let i=0;i<200;i++){p.sample(20);p.cadence(60,20);}
 assert.equal(p.temporalAllowed,true);assert.equal(p.debandScale,1);assert.equal(p.p95,20);
});
test('new controls sanitize saved output, AA and GPU policy',()=>{
 const a=api(),s=a.normalize({output:'invalid',antialias:99,gpuBudget:-5});assert.equal(s.output,'auto');assert.equal(s.antialias,1);assert.equal(s.gpuBudget,6);
 assert.equal(a.normalize({gpuBudget:0,output:'2160'}).gpuBudget,0);
});

test('overload skips disabled temporal and reduces actual debanding work',()=>{
 const p=api().createBudget();p.configure({temporal:0,deband:.3,cleanup:.35,antialias:0,output:'native'},1080);
 for(let i=0;i<90;i++)p.sample(9);
 assert.equal(p.debandTaps,2);
 for(let i=0;i<90;i++)p.sample(9);
 assert.equal(p.debandScale,0);
 for(let i=0;i<90;i++)p.sample(9);
 assert.equal(p.cleanupAllowed,false);
});
test('overload can reduce forced resolution and AA without changing preferences',()=>{
 const a=api(),s=a.normalize({output:'2160',antialias:.5,deband:0,cleanup:0}),p=a.createBudget();p.configure(s,1080);
 for(let i=0;i<90;i++)p.sample(20);
 assert.equal(p.outputFor(s), '1440');
 for(let i=0;i<90;i++)p.sample(20);
 assert.equal(p.outputFor(s), 'native');
 for(let i=0;i<90;i++)p.sample(20);
 assert.equal(p.antialiasAllowed,false);
 assert.equal(s.output,'2160');assert.equal(s.antialias,.5);
 assert.equal(p.outputFor({...s,mode:'cas'}),'2160');
});
test('manual budget bypasses every automatic reduction',()=>{
 const a=api(),s=a.normalize({output:'2160',antialias:1,temporal:1,gpuBudget:0}),p=a.createBudget();p.limitMs=0;p.configure(s,1080);
 for(let i=0;i<1000;i++){p.sample(50);p.cadence(60,10);}
 assert.equal(p.outputFor(s),'2160');assert.equal(p.antialiasAllowed,true);assert.equal(p.cleanupAllowed,true);assert.equal(p.debandTaps,4);
});
test('explicit output below source resolution is retained before adaptation',()=>{
 const a=api(),s=a.normalize({output:'1440'}),p=a.createBudget();p.configure(s,2160);
 assert.equal(p.outputFor(s),'1440');
});

test('v9 sharpening defaults to luma-only USM and keeps every method selectable',()=>{
 const a=api();assert.equal(a.defaults.sharpening,'usm');assert.equal(a.defaults.lumaSharpen,true);assert.equal(a.defaults.sharpness,2);assert.equal(a.defaults.cleanup,0);assert.equal(a.defaults.detail,0);assert.equal(a.defaults.deband,.6);assert.equal(a.presets.v9.values.sharpness,3);assert.equal(a.defaults.spatialMode,'selective');
 for(const m of ['usm','cas','rcas','native'])assert.equal(a.normalize({sharpening:m}).sharpening,m);
 assert.equal(a.normalize({sharpening:'bad',spatialMode:'bad'}).sharpening,'usm');
 assert.equal(a.normalize({sharpening:'rcas',spatialMode:'legacy'}).spatialMode,'legacy');
 assert.equal(a.normalize({noiseFloor:99}).noiseFloor,8);assert.equal(a.normalize({lumaSharpen:false}).lumaSharpen,false);
});
test('diagnostics are opt-in, segment settings and compute percentiles without mixing modes',()=>{
 const d=api().createDiagnostics();assert.equal(d.frame({},0),null);d.start({test:true});
 const a=d.frame({mode:'cas'},0);d.frame({mode:'cas'},1000);for(let i=1;i<=100;i++)d.sample(a,i);
 const b=d.frame({mode:'filtered'},1100);d.sample(b,2);d.disjoint();d.sample(b,NaN);d.stop();
 const r=d.report();assert.equal(r.segments.length,2);assert.equal(r.segments[0].gpu.p95,95);assert.equal(r.segments[1].gpu.count,1);assert.equal(r.disjoints,1);assert.equal(d.frame({},2000),null);
 d.start();d.sample(a,123);assert.equal(d.report().segments.length,0);
});
// Audit R9: each segment names how its gpu series was timed (timer, timestamp or fence); null without a sample.
test('diagnostics keep the timing method of each segment',()=>{
 const d=api().createDiagnostics();d.start();const a=d.frame({r:'webgl2'},0),b=d.frame({r:'webgpu'},10),c=d.frame({r:'none'},20);
 d.sample(a,4,'fence');d.sample(b,2,'timestamp');d.sample(c,1);d.stop();
 const [x,y,z]=d.report().segments;assert.equal(x.gpu.method,'fence');assert.equal(y.gpu.method,'timestamp');assert.equal(z.gpu.method,null);assert.equal(z.gpu.count,1);
 const e=api().createDiagnostics();e.start();const f=e.frame({},0);e.sample(f,3,'timer');assert.equal(e.report().segments[0].gpu.method,'timer');
});
test('video stats export only allowlisted video counters, no addresses',async()=>{
 const a=api(),rows=new Map([['v',{id:'v',type:'inbound-rtp',kind:'video',framesDecoded:20,powerEfficientDecoder:true,decoderImplementation:'MediaCodec',codecId:'c',address:'private'}],['c',{mimeType:'video/H264',sdpFmtpLine:'profile-level-id=42e01f'}],['ip',{type:'candidate-pair',address:'private'}]]);
 const r=await a.captureVideoStats({videoWidth:1920,videoHeight:1080,currentTime:1,getVideoPlaybackQuality:()=>({totalVideoFrames:20,droppedVideoFrames:1})},{getStats:async()=>rows});
 assert.equal(r.rtc.length,1);assert.equal(r.rtc[0].framesDecoded,20);assert.equal(r.rtc[0].powerEfficientDecoder,true);assert.equal(r.rtc[0].decoderImplementation,'MediaCodec');assert.equal(r.rtc[0].codec.mimeType,'video/H264');assert.ok(!JSON.stringify(r).includes('private'));
});
test('ending a capture keeps the original interruption reason on export',()=>{
 const d=api().createDiagnostics();d.start();d.frame({},0);d.stop('source-changed');d.stop();assert.equal(d.report().stopReason,'source-changed');d.start();assert.equal(d.report().stopReason,null);
});

test('auto output matches the on-screen video height, never above it',()=>{
 const a=api();assert.equal(a.defaults.output,'auto');
 assert.equal(a.resolveOutput('auto',1080,1080),'native');
 assert.equal(a.resolveOutput('auto',864*1.25,1080),'native');
 assert.equal(a.resolveOutput('auto',1110,1080),'native');
 assert.equal(a.resolveOutput('auto',1220,1080),'1216');
 assert.equal(a.resolveOutput('auto',1280,1080),'1280');
 assert.equal(a.resolveOutput('auto',1440,1080),'1440');
 assert.equal(a.resolveOutput('auto',2160,1080),'2160');
 assert.equal(a.resolveOutput('auto',4320,1080),'2160');
 assert.equal(a.resolveOutput('auto',2160,2160),'native');
 assert.equal(a.resolveOutput('auto',0,1080),'native');
 assert.equal(a.resolveOutput('2160',1080,1080),'2160');
 assert.equal(a.normalize({output:'auto'}).output,'auto');
 assert.equal(a.normalize({output:'1216'}).output,'1216');
 assert.equal(a.normalize({output:'99999'}).output,'auto');
 assert.deepEqual(JSON.parse(JSON.stringify(a.outputSize(1920,1080,'1280'))),{width:2276,height:1280});
});
test('display-matched output degrades to native under overload',()=>{
 const a=api(),s=a.normalize({output:'1280',antialias:0,deband:0,cleanup:0}),p=a.createBudget();p.configure(s,1080);
 assert.equal(p.outputFor(s),'1280');
 for(let i=0;i<90;i++)p.sample(20);
 assert.equal(p.outputFor(s),'native');
});
test('v8.5 chroma and detail are bounded and degrade last under overload',()=>{
 const a=api(),s=a.normalize({chroma:7,detail:-1});assert.equal(s.chroma,1);assert.equal(s.detail,0);
 assert.ok(a.defaults.chroma>0&&a.presets.v9.values.detail>0);
 const p=a.createBudget();p.configure({cleanup:.35,deband:0,chroma:.5,detail:.35},1080);
 for(let i=0;i<90;i++)p.sample(9);
 assert.equal(p.cleanupAllowed,false);assert.equal(p.enhanceAllowed,true);
 for(let i=0;i<90;i++)p.sample(9);
 assert.equal(p.enhanceAllowed,false);
});

test('neural restoration is opt-in, bounded and degraded right after AA',()=>{
 const a=api();assert.equal(a.defaults.neural,0);assert.equal(a.normalize({neural:5}).neural,1);assert.equal(a.normalize({neural:-1}).neural,0);
 const p=a.createBudget();p.configure({neural:1,antialias:.5,deband:.3,cleanup:0,output:'native'},1080);
 for(let i=0;i<90;i++)p.sample(20);assert.equal(p.antialiasAllowed,false);assert.equal(p.neuralAllowed,true);
 for(let i=0;i<90;i++)p.sample(20);assert.equal(p.neuralAllowed,false);assert.equal(p.debandScale,1);
});

test('decoder summary reports DT like Better xCloud and the decoder kind when exposed',()=>{
 const a=api();
 const d=a.decoderSummary({framesDecoded:100,totalDecodeTime:1},{framesDecoded:160,totalDecodeTime:1.6,powerEfficientDecoder:true,decoderImplementation:'ExternalDecoder (MediaCodecVideoDecoder)'});
 assert.equal(d.kind,'hardware');assert.ok(Math.abs(d.dtMs-10)<1e-9);assert.match(d.implementation,/MediaCodec/);
 assert.equal(a.decoderSummary(null,{framesDecoded:1,totalDecodeTime:0}).dtMs,null);
 assert.equal(a.decoderSummary({framesDecoded:1,totalDecodeTime:0},{framesDecoded:2,totalDecodeTime:.0005,powerEfficientDecoder:false}).kind,'software');
 assert.equal(a.decoderSummary({framesDecoded:1,totalDecodeTime:0},{framesDecoded:2,totalDecodeTime:.0005}).kind,'unknown');
 assert.equal(a.decoderSummary(null,null),null);
});


test('H.264 profile and latency summary from WebRTC stats; codec test removed',()=>{
 const a=api();
 assert.equal(a.h264Profile('level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=640c1f'),'High');
 assert.equal(a.h264Profile('profile-level-id=4d001f'),'Main');assert.equal(a.h264Profile('profile-level-id=42e01f'),'Baseline');assert.equal(a.h264Profile(''),null);
 assert.equal(a.filterCodecs,undefined);assert.equal('codec' in a.normalize({codec:'h264high'}),false);
 const d=a.decoderSummary({framesDecoded:0,totalDecodeTime:0,jitterBufferDelay:0,jitterBufferEmittedCount:0},{framesDecoded:30,totalDecodeTime:.3,jitterBufferDelay:.45,jitterBufferEmittedCount:30,framesPerSecond:30});
 assert.ok(Math.abs(d.jitterMs-15)<1e-9);assert.ok(Math.abs(d.dtMs-10)<1e-9);assert.equal(d.fps,30);
});
test('frame pacing reports interval, deviation and hitches',()=>{
 const a=api(),steady=[...Array(61)].map((_,i)=>i*33.3);const s=a.frameStats(steady);
 assert.ok(Math.abs(s.meanMs-33.3)<1e-6&&s.deviationMs<1e-6&&s.hitches===0&&s.frames===60);
 const uneven=[0,33,66,120,133,166,199,260,266];const u=a.frameStats(uneven);assert.equal(u.hitches,2);assert.ok(u.deviationMs>10);
 assert.equal(a.frameStats([0,33]),null);
});
test('smoothing sets the WebRTC video buffer floor and restores the default',()=>{
 const a=api();assert.equal(a.defaults.smoothing,0);assert.equal(a.normalize({smoothing:33}).smoothing,33);assert.equal(a.normalize({smoothing:99}).smoothing,0);
 const video={track:{kind:'video'},jitterBufferTarget:null},audio={track:{kind:'audio'},jitterBufferTarget:null},legacy={track:{kind:'video'},playoutDelayHint:null};
 const peer={getReceivers:()=>[video,audio,legacy]};
 assert.equal(a.applySmoothing(peer,33).applied,2);assert.equal(video.jitterBufferTarget,33);assert.equal(audio.jitterBufferTarget,null);assert.ok(Math.abs(legacy.playoutDelayHint-.033)<1e-9);
 a.applySmoothing(peer,0);assert.equal(video.jitterBufferTarget,null);assert.equal(legacy.playoutDelayHint,null);assert.equal(a.applySmoothing(null,33).state,'waiting');
});

test('pacer turns irregular arrival into a steady display cadence',()=>{
 const a=api();let seed=7;const rnd=()=>(seed=(seed*1103515245+12345)%2147483648)/2147483648;
 const frames=[];let server=0;for(let i=0;i<300;i++){server+=1000/30;frames.push({rtp:server,arrival:server+60+(rnd()<.15?rnd()*20:rnd()*10)});}
 frames.sort((x,y)=>x.arrival-y.arrival);
 const run=mode=>{const p=a.createPacer(mode),shown=[];let i=0;for(let t=0;t<12000;t+=1000/120){while(i<frames.length&&frames[i].arrival<=t){p.add({slot:'s',arrival:frames[i].arrival,rtp:frames[i].rtp});i++;}if(p.tick(t))shown.push(t);}return {stats:a.frameStats(shown.slice(30)),p};};
 const direct=a.frameStats(frames.map(f=>Math.ceil(f.arrival/(1000/120))*(1000/120)).slice(30));
 const balanced=run('balanced'),max=run('max');
 assert.ok(balanced.stats.deviationMs<direct.deviationMs/2&&balanced.stats.hitches===0,'balanced '+JSON.stringify(balanced.stats));
 assert.ok(max.stats.deviationMs<1&&max.stats.hitches===0,'max '+JSON.stringify(max.stats));
 assert.ok(balanced.p.extraDelayMs<15&&max.p.extraDelayMs<25);
 assert.equal(balanced.p.cadenceMs,1000/30);
});
test('pacer drops the oldest frames when the queue overflows and RTP clock unwraps 32-bit time',()=>{
 const a=api(),p=a.createPacer('balanced');for(let i=0;i<6;i++)p.add({slot:'s'+i,arrival:i,rtp:null});assert.equal(p.queued,3);assert.equal(p.dropped,3);
 const f=p.tick(1e6);assert.equal(f.slot,'s5');assert.equal(p.queued,0);
 const clock=a.createRtpClock();assert.equal(clock(0xFFFFFF00),0);assert.ok(Math.abs(clock(0x00000200)-(0x300/90))<1e-9);assert.equal(clock(NaN),null);
 assert.equal(a.defaults.fluidity,'off');assert.equal(a.normalize({fluidity:'max'}).fluidity,'max');assert.equal(a.normalize({fluidity:'x'}).fluidity,'off');
});
test('max pacer locks to 30 FPS despite missing frames and its delay shrinks after a burst',()=>{
 // Field export (Poco F7): server 34.0 ± 4.7 ms = 30 FPS with 2% of frames missing. A mean cadence of
 // 34 ms drifted the grid until the delay hit its cap and frames were dropped.
 const a=api();let seed=5;const rnd=()=>(seed=(seed*1103515245+12345)%2147483648)/2147483648;
 const frames=[];for(let n=0;n<900;n++){if(rnd()<.02)continue;const rtp=n*1000/30;frames.push({rtp,arrival:rtp+40+rnd()*3+(n>=300&&n<330&&n%10===0?30:0)});}
 for(let i=1;i<frames.length;i++)frames[i].arrival=Math.max(frames[i].arrival,frames[i-1].arrival+.5);
 const p=a.createPacer('max'),shown=[];let i=0;
 for(let t=0;t<31000;t+=1000/120){while(i<frames.length&&frames[i].arrival<=t){p.add({slot:'s',arrival:t,rtp:frames[i].rtp});i++;}const f=p.tick(t+1);if(f)shown.push([t+1,t+1-f.arrival]);}
 assert.equal(p.cadenceMs,1000/30);assert.equal(p.dropped,0);
 const mean=(from,to)=>{const d=shown.filter(([t])=>t>=from&&t<to).map(e=>e[1]);return d.reduce((x,y)=>x+y,0)/d.length;};
 assert.ok(mean(11500,13500)>mean(25000,30000)+10&&mean(25000,30000)<12,`delay ${mean(11500,13500)} -> ${mean(25000,30000)} ms`);
 // Calm stream: frames keep whole 30 FPS periods (a missing frame is held for two), none shown early.
 const late=shown.filter(([t])=>t>20000).map(e=>e[0]);for(let k=1;k<late.length;k++)assert.ok(late[k]-late[k-1]>30,'interval '+(late[k]-late[k-1]));
});
test('stream summary reports bitrate, loss and mean QP between two snapshots',()=>{
 const a=api(),prev={timestamp:1000,bytesReceived:0,packetsLost:5,packetsReceived:1000,qpSum:0,framesDecoded:0,framesDropped:1,freezeCount:0};
 const s=a.streamSummary(prev,{timestamp:3000,bytesReceived:4e6,packetsLost:7,packetsReceived:1198,qpSum:1740,framesDecoded:60,framesDropped:3,freezeCount:1,frameWidth:1920,frameHeight:1080});
 assert.equal(s.bitrateMbps,16);assert.equal(s.lossPct,1);assert.equal(s.qp,29);assert.equal(s.framesDropped,2);assert.equal(s.freezes,1);assert.equal(s.height,1080);
 const first=a.streamSummary(null,{timestamp:1,bytesReceived:9});assert.equal(first.bitrateMbps,null);assert.equal(first.qp,null);assert.equal(a.streamSummary(prev,null),null);
});
test('compression level is neutral at QP 28 and bounded, presets are recognised',()=>{
 const a=api();assert.equal(a.compressionLevel(28),.5);assert.equal(a.compressionLevel(10),0);assert.equal(a.compressionLevel(51),1);assert.equal(a.compressionLevel(NaN),null);
 assert.deepEqual({...a.compressionScales(.5)},{cleanup:1,deband:1,detail:1});
 const clean=a.compressionScales(0),heavy=a.compressionScales(1);assert.ok(clean.cleanup<1&&clean.detail>1&&heavy.cleanup>1&&heavy.detail<1);
 assert.equal(a.presetOf(a.normalize({})),'natural');
 for(const [key,p] of Object.entries(a.presets)){const s={...a.normalize({}),...p.values};assert.equal(a.presetOf(s),key);assert.deepEqual({...a.normalize(s)},s,key+' values are valid settings');}
 assert.equal(a.presetOf({...a.normalize({}),sharpness:3.5}),'custom');
 assert.equal(a.normalize({capture:'direct'}).capture,'direct');assert.equal(a.normalize({capture:'x'}).capture,'video');assert.equal(a.normalize({hud:'full',hudPosition:'bottom-right'}).hudPosition,'bottom-right');assert.equal(a.normalize({adaptive:false}).adaptive,false);
});
test('pacer restarts its clock when the frame source changes, so pacing keeps working',()=>{
 // Video path: RTP clock from 0. Direct capture: VideoFrame times since boot (~2.7e6 ms).
 for(const mode of ['balanced','max']){
  const a=api(),p=a.createPacer(mode),leads=[];let t=0,n=0;
  const feed=(count,clock,epoch)=>{for(let i=0;i<count;i++,n++){const capture=n*1000/30,arrival=capture+40+(n%3)*6;
   while(t<arrival){t+=1000/120;const f=p.tick(t);if(f&&f.clock==='frame')leads.push(f.p-f.arrival);}
   p.add({slot:'s',arrival,rtp:capture+epoch,clock});}};
  feed(120,undefined,0);feed(120,'frame',2.7e6);
  const clamped=leads.filter(v=>Math.abs(v-3)<1e-9).length;
  // The latest frames of the window are scheduled at arrival + 3 ms by design; with mixed clocks all were.
  assert.ok(leads.length>100&&clamped<leads.length/2&&Math.max(...leads)>10,`${mode}: ${clamped} of ${leads.length} frames clamped to arrival + 3 ms`);
 }
 const p=api().createPacer('balanced');p.add({slot:'a',arrival:0,rtp:0});p.tick(100);p.add({slot:'b',arrival:5000,rtp:4000});assert.ok(p.tick(6000),'a jump of seconds restarts instead of scheduling far away');
});
test('diagnostics continue a segment when a configuration returns and explain the limit',()=>{
 const d=api().createDiagnostics();d.start();
 for(let i=0;i<10;i++){d.frame({level:i%2},i*100);d.frame({level:i%2},i*100+50);}
 const r=d.report();assert.equal(r.segments.length,2);assert.equal(r.segments[0].frames,10);assert.equal(r.segments[0].durationMs,250);assert.equal(r.segments[0].drawFps,20);
 const e=api().createDiagnostics();e.start();for(let i=0;i<300;i++)e.frame({i},i);assert.equal(e.active,false);assert.match(e.report().stopReason,/limite/);
});
test('bits per pixel stand in for a missing QP: neutral at 0.12, 4 QP per doubling, bounded',()=>{
 const a=api();assert.equal(a.qpFromBitsPerPixel(.12),28);assert.equal(a.qpFromBitsPerPixel(.24),24);assert.equal(a.qpFromBitsPerPixel(.06),32);
 assert.equal(a.qpFromBitsPerPixel(0),null);assert.equal(a.qpFromBitsPerPixel(NaN),null);assert.equal(a.qpFromBitsPerPixel(1e-9),51);assert.equal(a.qpFromBitsPerPixel(1e9),0);
 const s=a.streamSummary({timestamp:0,bytesReceived:0,framesDecoded:0},{timestamp:1000,bytesReceived:1555200,framesDecoded:30,frameWidth:1920,frameHeight:1080});
 assert.ok(Math.abs(s.bitsPerPixel-.2)<1e-12);assert.equal(s.qp,null);
 assert.equal(a.streamSummary(null,{timestamp:1,bytesReceived:9,framesDecoded:30,frameWidth:1920,frameHeight:1080}).bitsPerPixel,null);
 assert.equal(a.streamSummary({timestamp:0,bytesReceived:0,framesDecoded:0},{timestamp:1000,bytesReceived:9,framesDecoded:30}).bitsPerPixel,null,'no frame size, no estimate');
});
test('measurement keeps display, arrival, server and wait intervals per segment, pacer drops and a timeline',()=>{
 const d=api().createDiagnostics();d.interval('display',33);d.timeline({x:1});d.dropped(3);
 d.start({a:1});d.interval('display',33);d.frame({mode:'filtered'},0);
 for(const v of [33,33,34,33,66,33])d.interval('display',v);
 d.interval('arrival',30);d.interval('server',33.3333);d.interval('wait',5);d.interval('gpu',1);d.interval('frames',1);d.interval('display',NaN);d.interval('display',-1);
 d.dropped(2);d.dropped(0);d.timeline({fpsReceived:30,rttMs:20.456,qp:null,capture:'direct',bad:NaN,missing:undefined});d.annotate({refreshMeasuredHz:120});
 d.frame({mode:'cas'},100);d.interval('display',16);d.stop();d.interval('display',99);d.annotate({late:true});d.timeline({late:1});
 const r=d.report(),[a,b]=r.segments;
 assert.equal(r.schema,4);assert.equal(r.version,'10.1.3');assert.equal(r.metadata.a,1);assert.equal(r.metadata.refreshMeasuredHz,120);assert.equal(r.metadata.late,undefined);
 assert.equal(a.display.count,6);assert.equal(a.display.p50,33);assert.equal(a.display.hitches,1);assert.equal(a.display.maxMs,66);assert.equal(a.display.samplesMs.length,6);
 assert.equal(a.arrival.count,1);assert.deepEqual([...a.server.samplesMs],[33.33]);assert.equal(a.wait.p95,5);assert.equal(a.pacerDropped,2);assert.equal(a.gpu.count,0);
 assert.equal(b.display.count,1);assert.equal(b.pacerDropped,0);assert.equal(b.arrival.count,0);assert.equal(b.arrival.p95,null);
 assert.equal(r.timeline.length,1);const row=r.timeline[0];
 assert.equal(row.rttMs,20.46);assert.equal(row.qp,null);assert.equal(row.capture,'direct');assert.equal(row.bad,null);assert.equal(row.missing,null);assert.ok(Number.isFinite(row.t));
 d.start();assert.equal(d.report().timeline.length,0);assert.equal(d.report().segments.length,0);
});
test('measurement summaries cover long sessions and the export keeps sample arrays on one line',()=>{
 const context={globalThis:{}};vm.runInNewContext(fs.readFileSync('src/restoration-engine.js','utf8'),context);const a=context.globalThis.BxRestoration;
 const d=a.createDiagnostics();d.start();d.frame({},0);
 for(let i=0;i<310000;i++)d.interval('display',i%100?16.7:33.4);
 for(let i=0;i<10;i++)d.interval('wait',i);d.skipped(2);d.skipped(0);for(let i=0;i<3601;i++)d.timeline({fpsReceived:60,bitsPerPixel:.123456});
 const r=d.report(),seg=r.segments[0],x=seg.display;
 assert.equal(x.count,310000);assert.equal(x.samplesMs.length,300000);assert.equal(x.samplesTruncated,true);assert.equal(x.p50,16.7);assert.equal(x.p99,16.7);assert.equal(x.maxMs,33.4);assert.equal(x.hitches,3100);
 assert.ok(Math.abs(x.meanMs-(16.7*.99+33.4*.01))<1e-6);assert.ok(Math.abs(x.deviationMs-Math.sqrt(.99*.01)*16.7)<1e-6);
 assert.equal(seg.wait.count,10,'summaries continue after the raw cap');assert.equal(seg.wait.samplesTruncated,true);assert.equal(seg.wait.hitches,null);assert.equal(seg.wait.p50,4);
 assert.equal(r.truncated,true);assert.equal(seg.videoSkipped,2);assert.equal(r.timeline.length,3600);assert.equal(r.timeline[0].bitsPerPixel,.1235);
 let saved=null;context.globalThis.BxAndroid={saveFile:(name,mime,text)=>{saved={name,mime,text};return 'Downloads/xCloud ImageFilter/'+name;}};
 const small=a.createDiagnostics();small.start();small.frame({},0);for(const v of [16.7,16.6,33.3])small.interval('display',v);
 assert.equal(a.downloadReport(small.report()),'Downloads/xCloud ImageFilter/'+saved.name);
 assert.match(saved.name,/^bx-v10\.1\.3-diagnostics-\d+\.json$/);assert.match(saved.text,/"samplesMs": \[16\.7,16\.6,33\.3\]/);assert.match(saved.text,/"samplesMs": \[\]/);
 const back=JSON.parse(saved.text);assert.equal(back.segments[0].display.count,3);assert.equal(back.truncated,false);assert.equal(back.sampleLimit.intervals,300000);
});
// Review of v10.1.0: the cpu/late/pipeline series have their own raw pool, so a 60 FPS video session with Fluidez
// (7 series per frame) keeps raw display/arrival/server/wait samples as long as schema 2 did (75 000 frames).
test('measurement keeps the raw frame intervals in a pool apart from the per-frame costs',()=>{
 const d=api().createDiagnostics();d.start();d.frame({},0);
 const frame=['display','arrival','server','wait'],cost=['cpu','late','pipeline'];
 for(let i=0;i<74999;i++)for(const k of [...frame,...cost])d.interval(k,16.7);
 assert.equal(d.report().truncated,false,'below 300 000 frame samples nothing is truncated');for(const k of [...frame,...cost])d.interval(k,16.7);
 let seg=d.report().segments[0];
 for(const k of frame)assert.equal(seg[k].samplesTruncated,false,k+' keeps raw samples through 75 000 frames with 7 series');
 for(const k of cost)assert.equal(seg[k].samplesTruncated,false);assert.equal(seg.cpu.samplesMs.length,75000);assert.equal(d.report().truncated,true,'the frame pool is full');
 for(const k of frame)d.interval(k,16.7);seg=d.report().segments[0];
 for(const k of frame)assert.equal(seg[k].samplesTruncated,true,k+' is cut at 300 000 raw samples of its pool');assert.equal(seg.display.samplesMs.length,75000);assert.equal(seg.display.count,75001);
 for(const k of cost)assert.equal(seg[k].samplesTruncated,false,k+' is not cut by the frame pool');assert.equal(d.report().truncated,true);
 for(let i=0;i<25000;i++)for(const k of cost)d.interval(k,1);seg=d.report().segments[0];
 assert.equal(seg.cpu.samplesMs.length,100000);assert.equal(seg.cpu.samplesTruncated,false);d.interval('late',1);assert.equal(d.report().segments[0].late.samplesTruncated,true,'the cost pool is cut on its own');
});

test('without GPU timers the live decoder rate is the reference, under the FPS limit',()=>{const a=api();
 assert.equal(a.liveCadence(30,60),30);assert.equal(a.liveCadence(60,30),30);assert.equal(a.liveCadence(60,0),60);
 assert.equal(a.liveCadence(null,60),null);assert.equal(a.liveCadence(undefined,60),null);assert.equal(a.liveCadence(4,60),null);
});
test('a sustained gap to the live rate reduces the treatment; a healthy or stalled stream does not',()=>{const a=api(),setup=()=>{const p=a.createBudget();p.limitMs=6;p.configure({deband:.3,cleanup:.5,output:'native'},1080);return p;};
 const overloaded=setup();for(let i=0;i<3;i++)overloaded.cadence(a.liveCadence(30,60),26,.95);assert.equal(overloaded.revision,1);
 const healthy=setup();for(let i=0;i<30;i++)healthy.cadence(a.liveCadence(30,60),29.4,.95);assert.equal(healthy.revision,0);
 const stalled=setup();for(let i=0;i<30;i++)stalled.cadence(a.liveCadence(3,60),3,.95);assert.equal(stalled.revision,0);
 const network=setup();for(let i=0;i<30;i++)network.cadence(a.liveCadence(18,60),18,.95);assert.equal(network.revision,0);
});
test('the video element keeps a wider margin for frames it skips without overload',()=>{const a=api(),p=a.createBudget();p.limitMs=6;p.configure({deband:.3,output:'native'},1080);
 for(let i=0;i<30;i++)p.cadence(30,29.4*.97,.9);assert.equal(p.revision,0);
 for(let i=0;i<3;i++)p.cadence(30,26,.9);assert.equal(p.revision,1);
});
// Spec 3 item 6: margin per path and target rate.
test('cadence margin: 20% on the video path at 60 FPS, 10% at 30 FPS, 5% with direct capture',()=>{const a=api();
 assert.equal(a.cadenceMargin(false,60),.8);assert.equal(a.cadenceMargin(false,30),.9);assert.equal(a.cadenceMargin(true,60),.95);assert.equal(a.cadenceMargin(true,30),.95);
 const setup=()=>{const p=a.createBudget();p.limitMs=6;p.configure({deband:.3,cleanup:.5,output:'native'},1080);return p;};
 const run=(direct,live,shown,windows)=>{const p=setup(),ref=a.liveCadence(live,60);for(let i=0;i<windows;i++)p.cadence(ref,shown,a.cadenceMargin(direct,ref));return p.revision;};
 // The <video> element at 60 FPS loses 5-17% with an idle GPU: 12% must not reduce, even for a minute.
 assert.equal(run(false,60,60*.88,30),0);
 // A sustained 30% fall does, at 60 and at 30 FPS.
 assert.equal(run(false,60,60*.7,3),1);assert.equal(run(false,30,30*.7,3),1);
 // 30 FPS keeps 10%: 12% reduces, 8% does not.
 assert.equal(run(false,30,30*.88,3),1);assert.equal(run(false,30,30*.92,30),0);
 // Direct capture keeps 5%: 8% reduces at either rate.
 assert.equal(run(true,60,60*.92,3),1);assert.equal(run(true,30,30*.92,3),1);
 // Two windows over the margin are not sustained.
 assert.equal(run(false,60,60*.7,2),0);
});
test('fence trend is only a warning: 3 windows above 1.5 intervals, never a reduction',()=>{const a=api(),p=a.createBudget();p.limitMs=6;p.configure({deband:.3,output:'native'},1080);
 assert.equal(p.fenceTrend(41.7,60),false);assert.equal(p.fenceTrend(41.7,60),false);assert.equal(p.fenceTrend(41.7,60),true);assert.equal(p.revision,0);
 assert.equal(p.fenceTrend(15,60),false);assert.equal(p.fenceTrend(null,60),false);
 // 30 FPS: 1.5 x 33.3 ms = 50 ms; the Spec 3 default measured 0.4-0.7 interval.
 for(let i=0;i<5;i++)assert.equal(p.fenceTrend(21.5,30),false);
 for(let i=0;i<3;i++)p.fenceTrend(51,30);assert.equal(p.fenceOver,3);assert.equal(p.revision,0);
});
// Spec 3: compiled spatial variants, mediump only where mediump is real half precision.
function fakeGl(precision){const calls={programs:0};return new Proxy({},{get(_,k){
 if(k==='calls')return calls;if(k==='getShaderPrecisionFormat')return ()=>precision===null?null:({precision,rangeMin:15,rangeMax:15});
 if(k==='getExtension')return ()=>null;if(k==='createProgram')return ()=>{calls.programs++;return {};};
 if(typeof k==='string'&&/^[A-Z][A-Z0-9_]+$/.test(k))return k;return ()=>true;}});}
const spatialUniforms={cleanup:0,deband:.6,chroma:.75,detail:0,antialias:0,debandTaps:4,quantize:true,selective:true};
test('spatial precision is mediump only for half-precision mediump GPUs, unless forced',()=>{const a=api();
 assert.equal(a.spatialPrecision(fakeGl(10)),'mediump');assert.equal(a.spatialPrecision(fakeGl(23)),'highp');assert.equal(a.spatialPrecision(fakeGl(null)),'highp');
 assert.equal(a.spatialPrecision({getShaderPrecisionFormat(){throw new Error('lost');}}),'highp');
 assert.equal(a.spatialPrecision(fakeGl(10),'highp'),'highp');assert.equal(a.spatialPrecision(fakeGl(23),'mediump'),'mediump');});
test('spatial profile keys on enabled filters and flags, not on strengths',()=>{const a=api(),key=u=>a.spatialKey(a.spatialProfile(u,'mediump'));
 assert.equal(key(spatialUniforms),'mediump.0.1.4.1.0.0.1.1');
 assert.equal(key({...spatialUniforms,deband:.78,chroma:.4}),key(spatialUniforms),'compression adaptation must not recompile');
 assert.notEqual(key({...spatialUniforms,debandTaps:2}),key(spatialUniforms),'adaptation step to 2 taps is a new variant');
 assert.equal(a.spatialProfile({...spatialUniforms,deband:0}).taps,0);assert.equal(a.spatialProfile({...spatialUniforms,debandTaps:2.5}).taps,3);
 assert.notEqual(key({...spatialUniforms,quantize:false}),key(spatialUniforms));assert.equal(a.spatialProfile(spatialUniforms).precision,'highp');});
test('spatial variant source defines the profile right after #version',()=>{const a=api(),code=a.spatialSource('#version 300 es\nvoid main(){}',a.spatialProfile(spatialUniforms,'mediump'));
 const lines=code.split('\n');assert.equal(lines[0],'#version 300 es');for(const d of ['SPATIAL_FIXED 1','SPATIAL_PRECISION mediump','SPATIAL_TAPS 4.0','SPATIAL_QUANTIZE true','SPATIAL_SELECTIVE true','SPATIAL_CLEANUP 0','SPATIAL_DEBAND 1','SPATIAL_CHROMA 1','SPATIAL_DETAIL 0','SPATIAL_ANTIALIAS 0'])assert.ok(lines.includes('#define '+d),d);});
test('engine pre-warms the default spatial variant and never compiles per frame',()=>{const a=api(),gl=fakeGl(10),shaders={spatial:'#version 300 es\nvoid main(){}',copy:'#version 300 es\nvoid main(){}'};
 const e=new a.Engine(gl,shaders);assert.equal(gl.calls.programs,3,'two shaders and the default variant');assert.equal(e.spatialPrecision,'mediump');
 const name=e.spatialVariant(spatialUniforms);assert.match(name,/^spatial@mediump\./);
 for(let i=0;i<50;i++){e.frames++;assert.equal(e.spatialVariant({...spatialUniforms,deband:.5+i/100}),name);}assert.equal(gl.calls.programs,3);
 const other={...spatialUniforms,debandTaps:2};assert.equal(e.spatialVariant(other),'spatial','generic shader while the new variant compiles');assert.equal(e.spatialVariant(other),'spatial');assert.equal(gl.calls.programs,4);
 e.frames++;assert.match(e.spatialVariant(other),/^spatial@mediump\.0\.1\.2\./);assert.equal(gl.calls.programs,4);
 assert.equal(new a.Engine(fakeGl(23),shaders).spatialVariant(spatialUniforms).split('.')[0],'spatial@highp');
 assert.equal(new a.Engine(fakeGl(10),shaders,{spatialVariants:false}).spatialVariant(spatialUniforms),'spatial');});
test('spatial variant cache keeps at most eight programs',()=>{const a=api(),gl=fakeGl(10),e=new a.Engine(gl,{spatial:'#version 300 es\nvoid main(){}'});
 for(let i=0;i<20;i++){const u={...spatialUniforms,cleanup:i&1,detail:i&2,antialias:i&4,chroma:i&8,quantize:!(i&16)};e.spatialVariant(u,true);}
 assert.ok(Object.keys(e.programs).filter(k=>k.startsWith('spatial@')).length<=8);});
test('production WebGL2 contexts are created without MSAA (one full-screen triangle, Spec 3 item 9)',()=>{
 for(const file of ['script.js','better-xcloud-image-filter.user.js','player/player.js']){const code=fs.readFileSync(file,'utf8'),calls=[...code.matchAll(/getContext\(["']webgl2["'],\s*\{([^}]*)\}/g)].map(m=>m[1]);
  assert.ok(calls.length>0,file);for(const attrs of calls)assert.match(attrs,/antialias:\s*(!1|false)/,file);}});
// Spec 3 item 5: SGSR 1 as an optional scaler; EASU + sharpening stays the default.
test('scaler setting defaults to EASU, accepts SGSR and rejects anything else',()=>{const a=api();
 assert.equal(a.defaults.scaler,'easu');assert.equal(a.normalize({}).scaler,'easu');assert.equal(a.normalize({scaler:'sgsr'}).scaler,'sgsr');
 for(const bad of ['SGSR','fsr',1,null,true])assert.equal(a.normalize({scaler:bad}).scaler,'easu');
 for(const p of Object.values(a.presets))assert.equal('scaler' in p.values,false,'presets keep the chosen scaler');});
test('sharpness maps to the measured SGSR strength and threshold',()=>{const a=api();
 assert.equal(a.sgsrParams(2).sharp,1);assert.equal(a.sgsrParams(2).threshold,20/255);
 assert.ok(Math.abs(a.sgsrParams(3).sharp-1.4)<1e-9);assert.ok(Math.abs(a.sgsrParams(4.5).sharp-2)<1e-9);
 for(let s=.5;s<10;s+=.5)assert.ok(a.sgsrParams(s+.5).sharp>a.sgsrParams(s).sharp);
 assert.ok(a.sgsrParams(0).threshold>3,'sharpness 0 never takes the edge step (the vote is at most 3)');});
test('SGSR source gets its precision right after #version and the engine compiles it with the GPU profile',()=>{const a=api();
 const lines=a.sgsrSource('#version 300 es\nvoid main(){}','mediump').split('\n');assert.equal(lines[0],'#version 300 es');assert.equal(lines[1],'#define SGSR_PRECISION mediump');
 const compiled=[],gl=fakeGl(10),wrap=new Proxy(gl,{get(t,k){return k==='shaderSource'?(_,code)=>compiled.push(code):t[k];}});
 new a.Engine(wrap,{sgsr:'#version 300 es\nvoid main(){}',copy:'#version 300 es\nvoid main(){}'});
 assert.ok(compiled.some(c=>c.includes('#define SGSR_PRECISION mediump')));assert.equal(compiled.filter(c=>c.includes('SGSR_PRECISION')).length,1,'only the SGSR shader');
 compiled.length=0;new a.Engine(new Proxy(fakeGl(23),{get(t,k){return k==='shaderSource'?(_,code)=>compiled.push(code):t[k];}}),{sgsr:'#version 300 es\nvoid main(){}'});
 assert.ok(compiled.some(c=>c.includes('#define SGSR_PRECISION highp')));});
test('GPU adaptation drops the SGSR pass like EASU: output reduced to native',()=>{const a=api();
 for(const scaler of ['easu','sgsr']){const s=a.normalize({output:'1280',scaler,deband:0,chroma:0}),p=a.createBudget();p.configure(s,1080);
  assert.equal(p.outputFor(s),'1280');for(let i=0;i<90;i++)p.sample(20);assert.equal(p.outputFor(s),'native',scaler);assert.match(p.reason,/nativa/);}});
// Spec 4: one frame plan for both renderers; WebGPU draws everything but neural restoration and temporal.
test('renderer setting defaults to auto and accepts only auto, webgl2 and webgpu',()=>{const a=api();
 assert.equal(a.defaults.renderer,'auto');for(const r of ['auto','webgl2','webgpu'])assert.equal(a.normalize({renderer:r}).renderer,r);
 for(const bad of ['WebGPU','gpu',1,null,true])assert.equal(a.normalize({renderer:bad}).renderer,'auto');
 for(const p of Object.values(a.presets))assert.equal('renderer' in p.values,false,'presets keep the chosen renderer');});
test('auto keeps WebGL2 on every GPU until one meets both Spec 4 acceptance criteria',()=>{const a=api();
 assert.equal(a.AUTO_WEBGPU.length,0);for(const ad of [null,undefined,{vendor:'qualcomm',architecture:'adreno-8xx'},{vendor:'intel',architecture:'gen-12lp'}])assert.equal(a.autoRenderer(ad),'webgl2');});
test('frame plan: budget-filtered strengths, scaler, last pass and the WebGL2-only passes',()=>{const a=api(),b=a.createBudget(),s=a.normalize({deband:.6,chroma:.75,output:'1280'});
 let p=a.framePlan(s,b,1920,1080,2276,1280,false);assert.equal(p.scaler,'easu');assert.equal(p.final.name,'casFiltered');assert.equal(p.final.key,'data');assert.equal(p.spatial.deband,.6);assert.equal(p.spatial.quantize,true);assert.equal(p.gl,false);assert.ok(a.rendererSupports(p));
 p=a.framePlan({...s,scaler:'sgsr'},b,1920,1080,2276,1280,false);assert.equal(p.scaler,'sgsr');assert.equal(p.final.name,'sgsr');assert.equal(p.final.key,'source');
 p=a.framePlan({...s,scaler:'sgsr'},b,1920,1080,1920,1080,false);assert.equal(p.scaler,null,'no SGSR at native output');assert.equal(p.final.name,'casFiltered');
 p=a.framePlan(a.normalize({...s,processingMode:'quality'}),b,1920,1080,1920,1080,true);assert.equal(p.spatial.quantize,false,'float targets do not dither in the spatial pass');
 p=a.framePlan(a.normalize({...s,mode:'cas'}),b,1920,1080,2276,1280,true);assert.equal(p.spatial,null);assert.equal(p.scaler,null);assert.equal(p.final.name,'cas');
 p=a.framePlan(a.normalize({...s,sharpening:'rcas'}),b,1920,1080,1920,1080,true);assert.equal(p.final.name,'rcas');assert.ok(a.rendererSupports(p),'RCAS is ported');
 for(const extra of [{temporal:.5},{neural:1}]){p=a.framePlan(a.normalize({...s,...extra}),b,1920,1080,1920,1080,true);assert.equal(p.gl,true);assert.equal(a.rendererSupports(p),false);}
 p=a.framePlan(a.normalize({...s,neural:1}),b,1920,1080,1920,1080,false);assert.equal(p.neural,0,'neural needs float targets');
 p=a.framePlan(a.normalize({...s,temporal:.5,antialias:.5}),b,1920,1080,1920,1080,true);assert.equal(p.spatial.antialias,0);assert.equal(p.antialias,.5,'AA after temporal');
 const cut=a.createBudget();cut.configure(s,1080);cut.debandScale=.5;cut.debandTaps=2;cut.enhanceAllowed=false;
 p=a.framePlan(s,cut,1920,1080,1920,1080,false);assert.equal(p.spatial.deband,.3);assert.equal(p.spatial.debandTaps,2);assert.equal(p.spatial.chroma,0);assert.equal(p.final.uniforms.deband,.3);});
// Audit R10: one measurement per player, shared by both renderers, with the renderer in every segment.
test('a shared measurement survives a renderer switch: segments carry webgl2 or webgpu',()=>{const a=api(),gl=fakeGl(23),shaders={spatial:'#version 300 es\nvoid main(){}',copy:'#version 300 es\nvoid main(){}'},d=a.createDiagnostics();
 const e=new a.Engine(gl,shaders,{diagnostics:d});assert.equal(e.diagnostics,d);assert.equal(e.renderer,'webgl2');assert.notEqual(new a.Engine(gl,shaders).diagnostics,d,'without the option each engine has its own');
 const b=a.createBudget(),s=a.normalize({deband:.6}),cfg=r=>a.segmentConfig(s,b,1920,1080,1920,1080,0,false,true,r);
 assert.equal(cfg('webgl2').renderer,'webgl2');assert.equal(cfg('webgpu').renderer,'webgpu');assert.equal('renderer' in cfg(undefined),false);
 d.start({api:'webgpu'});d.frame(cfg('webgpu'),0);d.frame(cfg('webgpu'),33);d.frame(cfg('webgl2'),66);d.frame(cfg('webgpu'),100);d.stop();
 const r=d.report();assert.equal(JSON.stringify(r.segments.map(x=>[x.config.renderer,x.frames])),'[["webgpu",3],["webgl2",1]]');assert.equal(r.metadata.api,'webgpu');});
// Audit R1: the 'auto' probe reads {vendor, architecture} of the adapter without creating a device.
// (vm objects are from another realm: compared as JSON.)
function gpuApi(nav){const g={navigator:nav},context={globalThis:g,navigator:nav};for(const f of ['src/restoration-engine.js','src/webgpu-engine.js'])vm.runInNewContext(fs.readFileSync(f,'utf8'),context);return g.BxWebGPU;}
test('the WebGPU probe gives the adapter info or null, and is only offered where WebGPU exists',async()=>{
 const calls=[];const gpu=gpuApi({gpu:{requestAdapter:async o=>{calls.push(o);return {info:{vendor:'qualcomm',architecture:'adreno-8xx',description:''}};}}});
 const info='{"vendor":"qualcomm","architecture":"adreno-8xx","description":""}';assert.equal(gpu.supported(),true);assert.equal(JSON.stringify(await gpu.probe({powerPreference:'low-power'})),info);assert.equal(JSON.stringify(calls),'[{"powerPreference":"low-power"}]');
 assert.equal(JSON.stringify(await gpu.probe()),info);assert.equal(calls[1].powerPreference,'high-performance');
 const none=gpuApi({});assert.equal(none.supported(),false);assert.equal(await none.probe(),null);
 assert.equal(await gpuApi({gpu:{requestAdapter:async()=>null}}).probe(),null);assert.equal(JSON.stringify(await gpuApi({gpu:{requestAdapter:async()=>({})}}).probe()),'{}');});

// Audit 3.5 / 12.1 (measurement instrumentation): pass sequences, last pass, events and the cpu/late/pipeline series.
test('measurement counts the pass sequences of a segment, names its last pass and keeps the new series',()=>{
 const d=api().createDiagnostics();d.passes(null,'x');d.event('compile',{ms:1});d.start();
 const a=d.frame({r:'webgl2'},0);d.passes(a,'upload,spatial,casFiltered#1',{name:'casFiltered',filterId:1});
 for(let i=0;i<3;i++){d.frame({r:'webgl2'},10+i);d.passes(a,'upload,spatial@highp.0.1.4.1.0.0.1.1,casFiltered#1',{name:'casFiltered',filterId:1});}
 const b=d.frame({r:'webgpu'},100);d.passes(b,'import,spatial@highp.0.1.4.1.0.0.1.1,sgsr',{name:'sgsr'});d.passes({},'bogus');
 d.interval('cpu',2.5);d.interval('cpu',-1);d.interval('late',-3.2);d.interval('late',16.7);d.interval('late',0);d.interval('pipeline',48);d.interval('pipeline',NaN);d.interval('slack',5);
 d.stop();const r=d.report(),[x,y]=r.segments;
 assert.deepEqual(JSON.parse(JSON.stringify(x.passes)),[{sequence:'upload,spatial@highp.0.1.4.1.0.0.1.1,casFiltered#1',frames:3},{sequence:'upload,spatial,casFiltered#1',frames:1}],'the generic shader counts apart, inside the same segment');
 assert.deepEqual(JSON.parse(JSON.stringify(x.final)),{name:'casFiltered',filterId:1});assert.deepEqual(JSON.parse(JSON.stringify(y.final)),{name:'sgsr',filterId:null});assert.equal(y.passes.length,1);
 assert.equal(y.cpu.count,1);assert.equal(y.cpu.p50,2.5);assert.equal(y.cpu.hitches,null);assert.equal(y.late.count,3);assert.equal(y.late.p50,0);assert.equal(y.late.maxMs,16.7,'a frame one vsync late is the upper tail');assert.deepEqual([...y.late.samplesMs],[-3.2,16.7,0],'ending before the expected display (negative) is kept');assert.equal(y.pipeline.count,1);assert.equal(y.pipeline.p95,48);
 assert.equal(x.cpu.count,0);assert.equal(x.late.p50,null);assert.equal(y.slack,undefined,'schema 3 has no slack series');assert.equal(r.events.length,0);assert.equal(r.eventsTruncated,false);assert.equal(r.sampleLimit.events,500);
});
test('measurement events are dated from the start, rounded and capped at 500 with a truncation mark',()=>{
 const d=api().createDiagnostics();d.start();d.event('compile',{name:'spatial@highp.1.1.4.1.0.0.1.1',ms:12.3456,wait:false,frames:1,none:undefined,bad:NaN});
 d.event('target',{name:'spatial',w:1920,h:1080,bytes:8294400,realloc:true});d.event('degrade',{reason:'Temporal desligado para preservar fluidez',revision:1});
 d.event('renderer',{to:'webgpu'});d.event('fluidity',{mode:'balanced'});d.event('capture',{active:false,reason:'x'});d.event('resize',{from:[1920,1080],to:[2276,1280]});
 let r=d.report();assert.equal(r.events.length,7);const e=r.events[0];assert.equal(e.type,'compile');assert.equal(e.ms,12.35);assert.equal(e.wait,false);assert.equal(e.frames,1);assert.equal(e.none,null);assert.equal(e.bad,null);
 assert.ok(Number.isFinite(e.t)&&e.t>=0&&e.t<5,'t in seconds since the start');assert.equal(r.events[1].bytes,8294400);assert.equal(r.events[1].realloc,true);assert.match(r.events[2].reason,/Temporal/);assert.deepEqual(JSON.parse(JSON.stringify(r.events[6].to)),[2276,1280]);
 for(let i=0;i<600;i++)d.event('target',{name:'t'+i});r=d.report();assert.equal(r.events.length,500);assert.equal(r.eventsTruncated,true);assert.equal(r.truncated,true);
 d.stop();d.event('late',{});assert.equal(d.report().events.length,500);d.start();assert.equal(d.report().events.length,0);assert.equal(d.report().eventsTruncated,false);
});
// A GL fake that lets render() run: no context loss, complete framebuffers, distinct textures, no fence.
function renderGl(precision=23){const calls={programs:0,draws:0};return new Proxy({},{get(_,k){
 if(k==='calls')return calls;if(k==='getShaderPrecisionFormat')return ()=>({precision,rangeMin:15,rangeMax:15});
 if(k==='getExtension')return ()=>null;if(k==='createProgram')return ()=>{calls.programs++;return {};};if(k==='fenceSync')return undefined;
 if(k==='isContextLost')return ()=>false;if(k==='checkFramebufferStatus')return ()=>'FRAMEBUFFER_COMPLETE';if(k==='createTexture')return ()=>({});if(k==='drawArrays')return ()=>{calls.draws++;};
 if(typeof k==='string'&&/^[A-Z][A-Z0-9_]+$/.test(k))return k;return ()=>true;}});}
const shaderSet=Object.fromEntries(['spatial','copy','casFiltered','cas','rcas','sgsr','easu','antialias','nnFeatures','nnApply','temporal','motion','cut'].map(n=>[n,'#version 300 es\nvoid main(){}']));
test('engine records the passes of each frame, the variant compilation, allocations and reductions only while measuring',()=>{
 const a=api(),gl=renderGl(),d=a.createDiagnostics(),e=new a.Engine(gl,shaderSet,{diagnostics:d}),video={videoWidth:64,videoHeight:36},base=a.normalize({});
 assert.ok(e.render(video,64,36,base,0));assert.equal(e.trace,null,'no trace outside a measurement');assert.equal(d.report().segments.length,0);
 d.start();assert.ok(e.render(video,64,36,base,.033));assert.ok(e.render(video,64,36,base,.066));
 const custom={...base,cleanup:.5};assert.ok(e.render(video,64,36,custom,.1));assert.ok(e.render(video,64,36,custom,.133));assert.ok(e.render(video,64,36,custom,.166));
 e.budget.configure({...custom,temporal:1},36);e.budget.degrade();d.stop();
 const r=d.report(),[x,y]=r.segments;assert.equal(r.segments.length,2);
 assert.deepEqual(JSON.parse(JSON.stringify(x.passes)),[{sequence:'upload,spatial@highp.0.1.4.1.0.0.1.1,casFiltered#1',frames:2}]);assert.deepEqual(JSON.parse(JSON.stringify(x.final)),{name:'casFiltered',filterId:1});
 assert.deepEqual(JSON.parse(JSON.stringify(y.passes)),[{sequence:'upload,spatial@highp.1.1.4.1.0.0.1.1,casFiltered#1',frames:2},{sequence:'upload,spatial,casFiltered#1',frames:1}],'the generic shader drew while the variant compiled');
 const types=r.events.map(v=>v.type);assert.ok(types.includes('compile')&&types.includes('degrade'),types.join(','));
 const compile=r.events.find(v=>v.type==='compile');assert.equal(compile.name,'spatial@highp.1.1.4.1.0.0.1.1');assert.equal(compile.wait,false);assert.equal(compile.frames,1);assert.ok(compile.ms>=0);
 const degrade=r.events.find(v=>v.type==='degrade');assert.match(degrade.reason,/Temporal/);assert.equal(degrade.revision,1);
 assert.ok(!r.events.some(v=>v.type==='target'),'targets allocated before the measurement are not events');
 d.start();assert.ok(e.render(video,128,72,{...custom,output:'72'},.2));const t=d.report().events.find(v=>v.type==='target');assert.ok(t&&t.name==='scaled'&&t.w===128&&t.h===72&&t.bytes===128*72*4&&t.realloc===false,JSON.stringify(t));
 assert.equal(d.report().segments[0].passes[0].sequence,'upload,spatial@highp.1.1.4.1.0.0.1.1,easu,casFiltered#1');
 // Deferred last pass (Fluidez): marked as run at present().
 assert.ok(e.render(video,64,36,custom,.3,false,'paced0',true));assert.match(d.report().segments.at(-1).passes[0].sequence,/casFiltered#1@present$/);
});
// Audit F8: the spatial variant of the saved settings is compiled in the constructor, not inside the first frames.
test('engine pre-warms the spatial variant of the given settings together with the default one',()=>{const a=api(),shaders={spatial:'#version 300 es\nvoid main(){}',copy:'#version 300 es\nvoid main(){}'};
 let gl=fakeGl(10);new a.Engine(gl,shaders,{settings:{cleanup:.5}});assert.equal(gl.calls.programs,4,'two shaders, the default variant and the settings variant');
 gl=fakeGl(10);const e=new a.Engine(gl,shaders,{settings:{cleanup:.5}});assert.equal(e.spatialVariant({cleanup:.5,deband:.6,chroma:.75,detail:0,antialias:0,debandTaps:4,quantize:true,selective:true}),'spatial@mediump.1.1.4.1.0.0.1.1','ready on the first frame');assert.equal(gl.calls.programs,4);
 gl=fakeGl(10);new a.Engine(gl,shaders,{settings:{}});assert.equal(gl.calls.programs,3,'the defaults are already warm');
 gl=fakeGl(10);new a.Engine(gl,shaders,{settings:{cleanup:0,deband:0,chroma:0,detail:0}});assert.equal(gl.calls.programs,3,'no spatial pass, nothing more to warm');
 gl=fakeGl(10);new a.Engine(gl,shaders,{settings:{processingMode:'quality'}});assert.equal(gl.calls.programs,3,'without float targets the quality variant still quantizes: same as the default');
 gl=fakeGl(23);assert.ok(new a.Engine(gl,shaders,{settings:{temporal:.5,antialias:.5}}).programs['spatial@highp.0.1.4.1.0.0.1.1'],'with temporal the AA leaves the spatial pass');assert.equal(gl.calls.programs,3);
 assert.ok(Number.isFinite(new a.Engine(fakeGl(10),shaders).warmMs));
});

test('every budget cut is recorded with its step and source; cutState says what each filter lost (audit C02)',()=>{
 const a=api(),s=a.normalize({temporal:.5,antialias:.5,output:'native',deband:.6,cleanup:0,detail:0,chroma:0}),p=a.createBudget();p.configure(s,1080);
 const seen=[];p.ondegrade=(reason,revision,step)=>seen.push([step,revision]);
 for(let i=0;i<90;i++)p.sample(20);for(let i=0;i<3;i++)p.cadence(60,30);
 assert.deepEqual(JSON.parse(JSON.stringify(p.cuts.map(c=>[c.step,c.source,c.revision]))),[['temporal','timer',1],['antialias','cadence',2]]);assert.deepEqual(seen,[['temporal',1],['antialias',2]]);
 assert.match(p.cuts[0].reason,/antialiasing passa ao passe espacial/,'the AA path change is named with the temporal cut');
 assert.equal(p.reason,p.cuts[1].reason,'reason stays the last cut');
 const c=p.cutState(s);assert.equal(c.temporal,true);assert.equal(c.antialias,true);assert.equal(c.deband,false);assert.equal(c.output,null);
 assert.equal(p.cutState({...s,antialias:0}).antialias,false,'nothing asked, nothing cut');
});

test('the effective state comes from the plan that draws: AA path fused/separate and the strengths after the budget (audit C02/C03)',()=>{
 const a=api(),s=a.normalize({temporal:.5,antialias:.4,deband:.6,chroma:.75}),b=a.createBudget();b.configure(s,1080);
 let plan=a.framePlan(s,b,1920,1080,1920,1080,true),e=a.planEffective(plan,s,b);
 assert.equal(plan.antialiasPath,'separate');assert.equal(e.antialias,.4);assert.equal(e.antialiasPath,'separate');assert.equal(e.temporal,.5);assert.equal(e.requested.antialias,.4);
 b.temporalAllowed=false;plan=a.framePlan(s,b,1920,1080,1920,1080,true);e=a.planEffective(plan,s,b);
 assert.equal(plan.antialiasPath,'fused');assert.equal(e.antialias,.4);assert.equal(e.temporal,0);assert.equal(e.cuts.temporal,true);
 b.antialiasAllowed=false;e=a.planEffective(a.framePlan(s,b,1920,1080,1920,1080,true),s,b);
 assert.equal(e.antialias,0);assert.equal(e.antialiasPath,null);assert.equal(e.cuts.antialias,true);assert.equal(e.requested.antialias,.4);
 assert.equal(a.segmentConfig(s,b,1920,1080,1920,1080,0,false,true).effective.antialiasPath,null);
 const b2=a.createBudget();b2.configure(s,1080);b2.temporalAllowed=false;assert.equal(a.segmentConfig(s,b2,1920,1080,1920,1080,0,false,true).effective.antialiasPath,'fused');
 const off=a.planEffective(a.framePlan({...s,antialias:0},a.createBudget(),1920,1080,1920,1080,true),s,b2);assert.equal(off.antialiasPath,null);
});

test('frame tickets: presented, discarded and repeated frames counted in their own segment; intervals follow the frame shown (audit C09)',()=>{
 const d=api().createDiagnostics();assert.equal(d.rendered({},true,false),null,'nothing outside a measurement');d.start();
 const A=d.frame({c:'A'},0),a1=d.rendered(A,true,false,1),a2=d.rendered(A,true,false,2);
 const B=d.frame({c:'B'},10),b1=d.rendered(B,true,false,11),direct=d.rendered(B,false,true,12);
 d.presented(a1,20);d.discarded(a2);d.discarded(a2);d.presented(a1,22);d.discarded(a1);
 // B is the current segment while A's frame is on screen: the display/wait intervals go to A.
 d.interval('display',16.7,A);d.interval('wait',5,A);d.interval('treated',30,A);d.interval('display',16.7);d.discarded(b1);
 const r=d.report(),[x,y]=r.segments;
 assert.equal(r.schema,4);
 assert.deepEqual(JSON.parse(JSON.stringify(x.presentation)),{finalScheduled:2,finalExecuted:1,presented:1,discarded:1,repeated:1});
 assert.deepEqual(JSON.parse(JSON.stringify(y.presentation)),{finalScheduled:1,finalExecuted:1,presented:1,discarded:1,repeated:0});
 assert.equal(x.display.count,1);assert.equal(x.wait.count,1);assert.equal(x.treated.count,1);assert.equal(y.display.count,1);
 assert.deepEqual(JSON.parse(JSON.stringify(r.frames.columns)),['id','segment','renderedMs','presentedMs','state']);
 assert.deepEqual(JSON.parse(JSON.stringify(r.frames.rows.map(row=>[row[0],row[1],row[4]]))),[[1,0,'p'],[2,0,'d'],[3,1,'d'],[4,1,'p']]);
 assert.equal(r.frames.truncated,false);
});

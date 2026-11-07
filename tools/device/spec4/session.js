// Spec 4 bench, second part: the whole default path in WebGL2 (Engine) and WebGPU (BxWebGPU, the renderer the
// userscript ships) on a playing H.264 clip. Mirrors production like the Spec 2 session(): an on-screen canvas
// drawn from requestVideoFrameCallback, nothing waits for the GPU, Fluidez draws the last pass in present().
// Only the canvas of the renderer under test is visible (the other is hidden, so it is not composited).
// B.session(cfg) for the sweep (GPU time from Perfetto gpu_work_period), B.burst(cfg) for capacity on a paused
// frame, B.compare() for the pixels of both renderers on the decoded frame.
// Query: clip (default game30), ow/oh (output, default 2276x1280 as the Poco's panel).
const Q=new URLSearchParams(location.search),video=document.getElementById('v'),glc=document.getElementById('gl'),gpc=document.getElementById('gpu');
const W=1920,H=1080,OW=Number(Q.get('ow')||2276),OH=Number(Q.get('oh')||1280),CLIP=Q.get('clip')||'game30';
glc.width=gpc.width=OW;glc.height=gpc.height=OH;
const gl=glc.getContext('webgl2',{antialias:false,alpha:false,depth:false,stencil:false,preserveDrawingBuffer:false});
const e=new BxRestoration.Engine(gl,BxShaders);
let g=null;const sleep=ms=>new Promise(r=>setTimeout(r,ms)),px=new Uint8Array(4);
const stat=v=>{const q=[...v].sort((a,b)=>a-b),at=p=>q[Math.min(q.length-1,Math.floor(q.length*p))];return v.length?{n:v.length,p50:+at(.5).toFixed(3),p95:+at(.95).toFixed(3),max:+q[q.length-1].toFixed(3),mean:+(v.reduce((a,b)=>a+b,0)/v.length).toFixed(3)}:null;};
// Settings: Spec 3 defaults (the shipped ones) unless overridden; output 1280p as Auto picks on the Poco.
const settings=(o={})=>({...BxRestoration.defaults,mode:'filtered',gpuBudget:0,output:String(OH),...o});
function show(which){glc.style.visibility=which==='gl'?'':'hidden';gpc.style.visibility=which==='gpu'?'':'hidden';}
async function ready(){
 const blob=await (await fetch(`/output/videos/${CLIP}.mp4`)).blob();video.src=URL.createObjectURL(blob);await video.play();
 await new Promise(r=>video.requestVideoFrameCallback(r));
 const t=performance.now();g=await BxWebGPU.create(gpc,{readable:true});const createMs=performance.now()-t;
 const errors=[];g.onfail=r=>errors.push(r);B.errors=errors;await g.warmCompute();
 return {ua:navigator.userAgent,renderer:gl.getParameter((gl.getExtension('WEBGL_debug_renderer_info')||{}).UNMASKED_RENDERER_WEBGL||gl.RENDERER),timer:!!e.ext,spatialPrecision:e.spatialPrecision,
  adapter:g.adapter,format:g.format,timestamps:g.timestamps,createMs,warmMs:g.warmMs,attrs:gl.getContextAttributes(),css:[glc.clientWidth,glc.clientHeight],dpr:devicePixelRatio,hidden:document.hidden};
}
const readyPromise=ready();
// Production-like session. renderer 'gl' or 'gpu'; fluid: Fluidez (slot + present on rAF, last pass deferred);
// compute (WebGPU): fused compute spatial pass, or the default copy + fragment.
async function session({seconds=10,renderer='gl',fluid=false,overrides={},compute=false,direct=false}={}){
 await readyPromise;show(renderer);const engine=renderer==='gpu'?g:e;if(g)g.computeSpatial=compute;
 const s=settings(overrides),q0=video.getVideoPlaybackQuality(),ow=OW,oh=OH;
 // Direct capture: VideoFrames from the track of the playing video, as the userscript reads the WebRTC track.
 let reader=null,track=null;if(direct){track=video.captureStream().getVideoTracks()[0];reader=new MediaStreamTrackProcessor({track}).readable.getReader();}
 return new Promise(res=>{
  const cpu=[],gaps=[],rafGaps=[];let frames=0,done=false,lastAt=null,lastRaf=null,slot=0,pending=null,raf=0;const end=performance.now()+seconds*1000;
  const tick=t=>{if(done)return;if(lastRaf!==null)rafGaps.push(t-lastRaf);lastRaf=t;if(pending){engine.present(pending);pending=null;}raf=requestAnimationFrame(tick);};
  if(fluid)raf=requestAnimationFrame(tick);
  const finish=()=>{done=true;cancelAnimationFrame(raf);engine.releasePaced();track?.stop();const q=video.getVideoPlaybackQuality();show('gl');
   res({frames,fps:+(frames/seconds).toFixed(2),cpu:stat(cpu),gaps:stat(gaps),raf:stat(rafGaps),dropped:q.droppedVideoFrames-q0.droppedVideoFrames,decoded:q.totalVideoFrames-q0.totalVideoFrames,
    fence:e.gpuEstimate,gpuTimestamps:renderer==='gpu'?stat(engine.budget.values):null,errors:B.errors.slice()});};
  const draw=src=>{const now=performance.now();if(lastAt!==null)gaps.push(now-lastAt);lastAt=now;frames++;
   const a=performance.now(),target=fluid?'paced'+(slot=(slot+1)%5):null;
   engine.render(src,ow,oh,s,performance.now()/1000,false,target,fluid);if(fluid)pending=target;cpu.push(performance.now()-a);};
  engine.resetBudget();engine.budget.limitMs=0;
  if(reader)(async()=>{for(;;){const {value,done:d}=await reader.read();if(d)break;try{if(performance.now()>end||window.stopSession){window.stopSession=false;reader.cancel();finish();break;}draw(value);}finally{value.close();}}})();
  else{const cb=()=>{if(performance.now()>end||window.stopSession){window.stopSession=false;finish();return;}video.requestVideoFrameCallback(cb);draw(video);};video.requestVideoFrameCallback(cb);}
 });
}
// Capacity on a paused frame: n frames back to back (import or upload each time), wall time until the GPU is
// done, and the WebGPU timestamps of the same frames.
async function burst({renderer='gl',overrides={},compute=false,n=40,rounds=5,frame=false}={}){
 await readyPromise;video.pause();await sleep(200);const s=settings(overrides),engine=renderer==='gpu'?g:e;if(g)g.computeSpatial=compute;
 const src=frame?new VideoFrame(video):video,wall=[],ts=[];
 const tiny=e.target('pacedTiny',1,1),glDone=()=>{gl.bindFramebuffer(gl.FRAMEBUFFER,tiny.fbo);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,px);gl.bindFramebuffer(gl.FRAMEBUFFER,null);};
 const run=async()=>{engine.resetBudget();engine.budget.limitMs=0;const t=performance.now();for(let i=0;i<n;i++)engine.render(src,OW,OH,s,1,false,'pacedB'+(i&1));
  if(renderer==='gpu')await g.device.queue.onSubmittedWorkDone();else glDone();const w=(performance.now()-t)/n;
  if(renderer==='gpu'){await sleep(50);g.poll();}return {w,t:renderer==='gpu'?stat(g.budget.values):null};};
 await run();for(let r=0;r<rounds;r++){const v=await run();wall.push(v.w);if(v.t)ts.push(v.t.p50);await sleep(30);}
 if(frame)src.close();await video.play();return {wall:stat(wall),timestamp:stat(ts)};
}
// Pixels of both renderers on the decoded frame, into stored slots (GL readPixels; WebGPU read back, same row
// order). gl: the GL spatial precision under test ('highp' variant, or the device default).
function diff(a,b){let max=0,sum=0,over1=0,n=0;const hist=new Array(8).fill(0);for(let i=0;i<a.length;i++){if((i&3)===3)continue;const d=Math.abs(a[i]-b[i]);n++;sum+=d;if(d>max)max=d;if(d>1)over1++;hist[Math.min(7,d)]++;}return {max,mean:+(sum/n).toFixed(5),over1Pct:+(over1*100/n).toFixed(4),hist};}
async function compare(){await readyPromise;video.pause();await sleep(200);const out={},eh=new BxRestoration.Engine(gl,BxShaders,{spatialPrecision:'highp'});
 const cases={spec3:{},v9:BxRestoration.presets.v9.values,all:{cleanup:.5,deband:.6,chroma:.75,detail:.2,antialias:.5},sgsr:{scaler:'sgsr'}};
 const read=(eng,name)=>{const t=eng.targets[name],p=new Uint8Array(t.w*t.h*4);gl.bindFramebuffer(gl.FRAMEBUFFER,t.fbo);gl.readPixels(0,0,t.w,t.h,gl.RGBA,gl.UNSIGNED_BYTE,p);gl.bindFramebuffer(gl.FRAMEBUFFER,null);return p;};
 for(const [k,o] of Object.entries(cases)){const s=settings(o);out[k]={};
  e.render(video,OW,OH,s,1,false,'pacedC');const glDefault=read(e,'pacedC');for(let i=0;i<3;i++)eh.render(video,OW,OH,s,1,false,'pacedC');const glHigh=read(eh,'pacedC');
  for(const compute of [true,false]){g.computeSpatial=compute;g.render(video,OW,OH,s,1,false,'pacedC');await sleep(100);g.render(video,OW,OH,s,1,false,'pacedC');const p=await g.read('pacedC');
   out[k][compute?'compute':'copy']={vsGlDefault:diff(glDefault,p),vsGlHighp:diff(glHigh,p)};}
  out[k].glDefaultVsHighp=diff(glHigh,glDefault);}
 // Input conversion alone: WebGL2 upload against the WebGPU import of the same decoded frame.
 {const s=settings({mode:'original',sharpness:0,output:'native'});e.render(video,W,H,s,1,false,'pacedI');g.computeSpatial=false;g.render(video,W,H,s,1,false,'pacedI');out.input=diff(read(e,'pacedI'),await g.read('pacedI'));}
 g.computeSpatial=false;eh.destroy();e.releasePaced();g.releasePaced();await video.play();return {spatialPrecision:e.spatialPrecision,result:out,errors:B.errors};}
// The input conversion (YUV to RGB) of one decoded frame at time t, by both renderers. H.264 decoding is
// bit-exact, so the same frame on another device differs only by its conversion: inputAt(t,true) on the Vostro
// stores its conversion (output/spec4-entrada-<t>.bin, through tools/device/spec2/server.py), inputVsRef(t) on
// the Poco compares both of its conversions with it.
async function seek(t){await readyPromise;video.pause();video.currentTime=t;await new Promise(r=>video.addEventListener('seeked',r,{once:true}));await sleep(300);}
async function conversions(){const s=settings({mode:'original',sharpness:0,output:'native'});
 e.render(video,W,H,s,1,false,'pacedI');const t=e.targets.pacedI,a=new Uint8Array(W*H*4);gl.bindFramebuffer(gl.FRAMEBUFFER,t.fbo);gl.readPixels(0,0,W,H,gl.RGBA,gl.UNSIGNED_BYTE,a);gl.bindFramebuffer(gl.FRAMEBUFFER,null);
 g.computeSpatial=false;g.render(video,W,H,s,1,false,'pacedI');const b=await g.read('pacedI');e.releasePaced();g.releasePaced();return {gl:a,gpu:b};}
async function inputAt(t,save=false){await seek(t);const c=await conversions(),d=diff(c.gl,c.gpu);
 if(save)await fetch(`/save/spec4-entrada-${t}.bin`,{method:'POST',body:c.gl});await video.play();return {t,glVsGpu:d};}
async function inputVsRef(t){await seek(t);const c=await conversions(),ref=new Uint8Array(await (await fetch(`/output/spec4-entrada-${t}.bin`,{cache:'no-store'})).arrayBuffer());
 // Chroma edges: where the reference changes fast horizontally, the 4:2:0 upsampling dominates.
 const mask=new Uint8Array(W*H);for(let y=0;y<H;y++)for(let x=1;x<W;x++){const i=(y*W+x)*4,j=i-4;if(Math.abs(ref[i]-ref[j])+Math.abs(ref[i+2]-ref[j+2])>40)mask[y*W+x]=1;}
 const part=(a,b,m)=>{let sum=0,n=0,max=0;for(let p=0;p<W*H;p++){if(mask[p]!==m)continue;for(let c=0;c<3;c++){const d=Math.abs(a[p*4+c]-b[p*4+c]);sum+=d;n++;if(d>max)max=d;}}return {mean:+(sum/n).toFixed(4),max,pixels:n/3};};
 await video.play();return {t,glVsRef:diff(ref,c.gl),gpuVsRef:diff(ref,c.gpu),glVsGpu:diff(c.gl,c.gpu),edges:{gl:part(ref,c.gl,1),gpu:part(ref,c.gpu,1)},flat:{gl:part(ref,c.gl,0),gpu:part(ref,c.gpu,0)}};}
window.B={ready:()=>readyPromise,inputAt,inputVsRef,session,burst,compare,e,gl,get g(){return g;},video,stat,errors:[]};

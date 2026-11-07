// Spec 2 bench: real decoded H.264 frames through the shipped engine. The page mirrors production: an
// on-screen canvas above a playing <video>, drawn from requestVideoFrameCallback. Query: aa=1 for the
// production antialias:true context, ow/oh for the output size, clip for the video.
const Q=new URLSearchParams(location.search),video=document.getElementById('v'),canvas=document.getElementById('c');
const W=1920,H=1080,OW=Number(Q.get('ow')||2276),OH=Number(Q.get('oh')||1280),AA=Q.get('aa')==='1',CLIP=Q.get('clip')||'game30';
canvas.width=OW;canvas.height=OH;
const gl=canvas.getContext('webgl2',{antialias:AA,alpha:false,depth:false,stencil:false,preserveDrawingBuffer:false,desynchronized:Q.get('desync')==='1'});
const raw=(gl.texImage2D).bind(gl);
let e=new BxRestoration.Engine(gl,BxShaders);
const px=new Uint8Array(4),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const stat=v=>{const q=[...v].sort((a,b)=>a-b),at=p=>q[Math.min(q.length-1,Math.floor(q.length*p))];return v.length?{n:v.length,p50:+at(.5).toFixed(3),p95:+at(.95).toFixed(3),p99:+at(.99).toFixed(3),max:+q[q.length-1].toFixed(3),mean:+(v.reduce((a,b)=>a+b,0)/v.length).toFixed(3)}:null;};
const tiny=e.target('tiny',1,1);
function touch(tex){e.draw('copy',tiny,1,1,{source:tex});}
function finish(fbo=tiny.fbo){gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,px);}
// Upload variants. subTex is an immutable texture filled with texSubImage2D, the other way to avoid reallocating.
const subTex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,subTex);gl.texStorage2D(gl.TEXTURE_2D,1,gl.RGBA8,W,H);e.configure(subTex);
function up(kind,src){
 gl.activeTexture(gl.TEXTURE0);
 const flip=!kind.includes('NoFlip');
 const tex=kind.startsWith('sub')?subTex:e.input;gl.bindTexture(gl.TEXTURE_2D,tex);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,flip);
 gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,kind.includes('NoConv')?gl.NONE:gl.BROWSER_DEFAULT_WEBGL);
 if(kind.startsWith('sub'))gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,gl.RGBA,gl.UNSIGNED_BYTE,src);
 else if(kind.startsWith('rgb'))gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,src);
 else gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,src);
 gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,gl.BROWSER_DEFAULT_WEBGL);
 return tex;
}
async function ready(){
 const blob=await (await fetch(`/output/videos/${CLIP}.mp4`)).blob();video.src=URL.createObjectURL(blob);await video.play();
 await new Promise(r=>video.requestVideoFrameCallback(r));up('tex',video);
 return {ua:navigator.userAgent,renderer:gl.getParameter(gl.RENDERER),unmasked:gl.getParameter((gl.getExtension('WEBGL_debug_renderer_info')||{}).UNMASKED_RENDERER_WEBGL||gl.RENDERER),attrs:gl.getContextAttributes(),samples:gl.getParameter(gl.SAMPLES),size:[video.videoWidth,video.videoHeight],css:[canvas.clientWidth,canvas.clientHeight],dpr:devicePixelRatio,hidden:document.hidden,timer:!!e.ext};
}
// One callback per new decoded frame, at the stream cadence: GPU clocks and the decoder as in a session.
function live(seconds,step){return new Promise(res=>{const end=performance.now()+seconds*1000,rows=[];let last=null,id=0,gaps=[];
 const cb=(now,meta)=>{if(performance.now()>end){res({rows,gaps});return;}if(last!==null)gaps.push(meta.mediaTime-last>0?(meta.mediaTime-last)*1000:0);last=meta.mediaTime;rows.push(step(++id));video.requestVideoFrameCallback(cb);};
 video.requestVideoFrameCallback(cb);});}
const settings=o=>({...BxRestoration.defaults,mode:'filtered',output:'native',gpuBudget:0,...o});
function withoutUpload(fn){gl.texImage2D=()=>{};try{return fn();}finally{delete gl.texImage2D;}}
const dest=()=>e.targets.paced0||e.target('paced0',OW,OH);
const pipe={
 p1280:{w:OW,h:OH,s:settings({output:String(OH)})},
 p1080:{w:W,h:H,s:settings({})},
};
// Live cases; each returns cpu (JS blocked) and total (until the GPU finished, through a 1 px read).
const liveCases={
 none(){const a=performance.now();touch(e.input);const b=performance.now();finish();return [b-a,performance.now()-a];},
 tex(){const a=performance.now();const t=up('tex',video);const b=performance.now();touch(t);finish();return [b-a,performance.now()-a];},
 texNoFlip(){const a=performance.now();const t=up('texNoFlip',video);const b=performance.now();touch(t);finish();return [b-a,performance.now()-a];},
 sub(){const a=performance.now();const t=up('sub',video);const b=performance.now();touch(t);finish();return [b-a,performance.now()-a];},
 subNoFlip(){const a=performance.now();const t=up('subNoFlip',video);const b=performance.now();touch(t);finish();return [b-a,performance.now()-a];},
 texNoConv(){const a=performance.now();const t=up('texNoConv',video);const b=performance.now();touch(t);finish();return [b-a,performance.now()-a];},
 rgb(){const a=performance.now();const t=up('rgb',video);const b=performance.now();touch(t);finish();return [b-a,performance.now()-a];},
 frame(){const a=performance.now();const f=new VideoFrame(video);const t=up('tex',f);f.close();const b=performance.now();touch(t);finish();return [b-a,performance.now()-a];},
};
for(const [k,p] of Object.entries(pipe)){
 liveCases[k]=()=>{const a=performance.now();e.render(video,p.w,p.h,p.s,performance.now()/1000,false,'paced0');const b=performance.now();finish(dest().fbo);return [b-a,performance.now()-a];};
 liveCases[k+'NoUpload']=()=>{const a=performance.now();withoutUpload(()=>e.render(video,p.w,p.h,p.s,performance.now()/1000,false,'paced0'));const b=performance.now();finish(dest().fbo);return [b-a,performance.now()-a];};
}
async function uploadLive(names,seconds=5,rounds=3){
 const out={};for(const k of names)out[k]={cpu:[],total:[],frames:0};
 for(let r=0;r<rounds;r++)for(const k of names){const {rows}=await live(seconds,()=>liveCases[k]());rows.slice(3).forEach(([c,t])=>{out[k].cpu.push(c);out[k].total.push(t);});out[k].frames+=rows.length;}
 for(const k of names)out[k]={frames:out[k].frames,cpu:stat(out[k].cpu),total:stat(out[k].total)};
 return out;
}
// Burst on a paused frame: throughput, as Spec 1 measured passes. Also the Spec 1 source (2D canvas).
function canvas2d(){const c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');x.drawImage(video,0,0,W,H);return c;}
async function uploadBurst(N=30,rounds=5){
 video.pause();await sleep(200);const c2=canvas2d(),bmp=await createImageBitmap(video);
 const vf=new VideoFrame(video);
 const src={video,videoFrame:vf,canvas2d:c2,imageBitmap:bmp},out={};
 const kinds={tex:'tex',texNoFlip:'texNoFlip',sub:'sub',subNoFlip:'subNoFlip'};
 const base=[];for(let r=0;r<rounds;r++){const a=performance.now();for(let i=0;i<N;i++)touch(e.input);finish();base.push((performance.now()-a)/N);await sleep(30);}
 out.baseTiny=stat(base);
 for(const [sn,s] of Object.entries(src))for(const k in kinds){const v=[],c=[];up(k,s);finish();
  for(let r=0;r<rounds;r++){const a=performance.now();let cpu=0;for(let i=0;i<N;i++){const b=performance.now();const t=up(k,s);cpu+=performance.now()-b;touch(t);}finish();v.push((performance.now()-a)/N);c.push(cpu/N);await sleep(30);}
  out[sn+'.'+k]={ms:stat(v),cpu:stat(c)};}
 vf.close();bmp.close();await video.play();return out;
}
// Production-like session: nothing waits for the GPU. Draws from rVFC (direct to the canvas, or through a
// Fluidez slot presented on rAF). repeat multiplies the GPU load to see how the clock answers.
function session({seconds=10,mode='render',output=OH,fluid=false,repeat=1,overrides={},upload=true,hideCanvas=false,hideVideo=false,uploadOnly=false}={}){return new Promise(res=>{
 canvas.style.visibility=hideCanvas?'hidden':'';video.style.visibility=hideVideo?'hidden':'';
 const ow=output===H?W:OW,oh=output===H?H:OH,s=settings({output:output===H?'native':String(output),...overrides}),q0=video.getVideoPlaybackQuality();
 const cpu=[],gaps=[],rafGaps=[];let frames=0,done=false,lastAt=null,lastRaf=null,slot=0,pending=null,raf=0;const end=performance.now()+seconds*1000;
 const tick=t=>{if(done)return;if(lastRaf!==null)rafGaps.push(t-lastRaf);lastRaf=t;if(pending){e.present(pending);pending=null;}raf=requestAnimationFrame(tick);};
 if(fluid)raf=requestAnimationFrame(tick);
 const cb=()=>{const now=performance.now();if(now>end){done=true;cancelAnimationFrame(raf);const q=video.getVideoPlaybackQuality();canvas.style.visibility=video.style.visibility='';
   res({frames,fps:+(frames/seconds).toFixed(2),cpu:stat(cpu),gaps:stat(gaps),raf:stat(rafGaps),dropped:q.droppedVideoFrames-q0.droppedVideoFrames,decoded:q.totalVideoFrames-q0.totalVideoFrames,fence:e.gpuEstimate});return;}
  video.requestVideoFrameCallback(cb);if(lastAt!==null)gaps.push(now-lastAt);lastAt=now;frames++;
  if(mode!=='render')return;
  const a=performance.now();
  if(uploadOnly){touch(up('tex',video));cpu.push(performance.now()-a);return;}
  for(let k=0;k<repeat;k++){const target=fluid?'paced'+(slot=(slot+1)%5):null,go=()=>e.render(video,ow,oh,s,performance.now()/1000,false,target);
   if(upload&&k===0)go();else withoutUpload(go);if(fluid)pending=target;}
  cpu.push(performance.now()-a);};
 video.requestVideoFrameCallback(cb);});}
window.B={ready,uploadLive,uploadBurst,live,session,stat,e,gl,up,touch,finish,video,canvas,sleep,settings,pipe,W,H,OW,OH,dest,withoutUpload};

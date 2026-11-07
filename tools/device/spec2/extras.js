// Section 10.3 and upload alternatives: render in a Worker under a busy main thread, and WebGPU video import
// with real GPU timestamps. WebGPU here only answers the upload question; porting is Spec 4.
(()=>{
const {stat,video,session,sleep}=B;
// Long main-thread tasks stand in for xCloud's own work; Worker and main pipelines see the same load.
function busyLoop(ms,every){const id=setInterval(()=>{const end=performance.now()+ms*(.5+Math.random());while(performance.now()<end);},every);return ()=>clearInterval(id);}
async function mainPath(seconds,busy){const stop=busy?busyLoop(busy[0],busy[1]):()=>{};const r=await session({seconds,output:B.OH});stop();return {fps:r.fps,gaps:r.gaps,cpu:r.cpu};}
async function workerPath(seconds,busy){
 const c=document.createElement('canvas');c.width=B.OW;c.height=B.OH;c.style.cssText='position:fixed;left:0;top:0;width:100vw;height:100vh;object-fit:contain';document.body.append(c);
 const off=c.transferControlToOffscreen(),track=video.captureStream().getVideoTracks()[0],readable=new MediaStreamTrackProcessor({track}).readable;
 const w=new Worker('worker.js'),done=new Promise((res,rej)=>{w.onmessage=m=>res(m.data);w.onerror=e=>rej(new Error(e.message));});
 const stop=busy?busyLoop(busy[0],busy[1]):()=>{};
 w.postMessage({off,readable,seconds,OW:B.OW,OH:B.OH},[off,readable]);const r=await done;stop();w.terminate();track.stop();c.remove();return r;
}
async function worker(seconds=15){const out={};const load=[30,120];
 out.mainLivre=await mainPath(seconds,null);out.mainOcupada=await mainPath(seconds,load);
 try{out.workerLivre=await workerPath(seconds,null);out.workerOcupada=await workerPath(seconds,load);}catch(e){out.workerError=String(e.message||e);}
 return out;}
const WGSL_EXT=`@group(0) @binding(0) var s:sampler;@group(0) @binding(1) var t:texture_external;
@vertex fn v(@builtin(vertex_index) i:u32)->@builtin(position) vec4f{return vec4f(vec2f(f32((i<<1)&2),f32(i&2))*2-1,0,1);}
@fragment fn f(@builtin(position) p:vec4f)->@location(0) vec4f{return textureSampleBaseClampToEdge(t,s,p.xy/vec2f(1920,1080));}`;
const WGSL_HEAVY=`@group(0) @binding(0) var s:sampler;@group(0) @binding(1) var t:texture_2d<f32>;
@vertex fn v(@builtin(vertex_index) i:u32)->@builtin(position) vec4f{return vec4f(vec2f(f32((i<<1)&2),f32(i&2))*2-1,0,1);}
@fragment fn f(@builtin(position) p:vec4f)->@location(0) vec4f{var c=vec4f(0);let u=p.xy/vec2f(1920,1080);for(var i=0;i<28;i++){let d=vec2f(f32(i%7)-3,f32(i/7)-2)/vec2f(1920,1080);c+=textureSampleLevel(t,s,u+d,0)*(1+.01*sin(c.x+f32(i)));}return c/28;}`;
const WGSL_TEX=`@group(0) @binding(0) var s:sampler;@group(0) @binding(1) var t:texture_2d<f32>;
@vertex fn v(@builtin(vertex_index) i:u32)->@builtin(position) vec4f{return vec4f(vec2f(f32((i<<1)&2),f32(i&2))*2-1,0,1);}
@fragment fn f(@builtin(position) p:vec4f)->@location(0) vec4f{return textureSample(t,s,p.xy/vec2f(1920,1080));}`;
// Each sampled pass has its own timestamps. Live: one per decoded frame, at the governor's clock. Burst: back to back.
async function webgpu(seconds=8){
 const a=await navigator.gpu.requestAdapter({powerPreference:'high-performance'}),d=await a.requestDevice({requiredFeatures:['timestamp-query']}),fmt='rgba8unorm',W=1920,H=1080;
 const dst=d.createTexture({size:[W,H],format:fmt,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING}),src=d.createTexture({size:[W,H],format:fmt,usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT});
 const samp=d.createSampler({magFilter:'linear',minFilter:'linear'}),mk=code=>{const m=d.createShaderModule({code});return d.createRenderPipeline({layout:'auto',vertex:{module:m,entryPoint:'v'},fragment:{module:m,entryPoint:'f',targets:[{format:fmt}]}});};
 const pe=mk(WGSL_EXT),pt=mk(WGSL_TEX),ph=mk(WGSL_HEAVY),qs=d.createQuerySet({type:'timestamp',count:2}),rb=d.createBuffer({size:16,usage:GPUBufferUsage.QUERY_RESOLVE|GPUBufferUsage.COPY_SRC}),mb=d.createBuffer({size:16,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
 const pass=(p,bind)=>{const en=d.createCommandEncoder(),r=en.beginRenderPass({colorAttachments:[{view:dst.createView(),loadOp:'clear',storeOp:'store',clearValue:[0,0,0,1]}],timestampWrites:{querySet:qs,beginningOfPassWriteIndex:0,endOfPassWriteIndex:1}});r.setPipeline(p);r.setBindGroup(0,bind);r.draw(3);r.end();en.resolveQuerySet(qs,0,2,rb,0);en.copyBufferToBuffer(rb,0,mb,0,16);d.queue.submit([en.finish()]);};
 const read=async()=>{await mb.mapAsync(GPUMapMode.READ);const v=new BigUint64Array(mb.getMappedRange()),ms=Number(v[1]-v[0])/1e6;mb.unmap();return ms;};
 const ext=()=>d.createBindGroup({layout:pe.getBindGroupLayout(0),entries:[{binding:0,resource:samp},{binding:1,resource:d.importExternalTexture({source:video})}]});
 const tex=d.createBindGroup({layout:pt.getBindGroupLayout(0),entries:[{binding:0,resource:samp},{binding:1,resource:src.createView()}]});
 const live=async(fn)=>{const v=[],cpu=[],end=performance.now()+seconds*1000;while(performance.now()<end){await new Promise(r=>video.requestVideoFrameCallback(r));const t=performance.now();fn();cpu.push(performance.now()-t);v.push(await read());}return {gpu:stat(v),cpu:stat(cpu)};};
 const out={adapter:a.info?.architecture};
 out.liveExterno=await live(()=>pass(pe,ext()));
 out.liveTextura=await live(()=>pass(pt,tex));
 out.liveCopiaExterna=await live(()=>{d.queue.copyExternalImageToTexture({source:video},{texture:src},[W,H]);pass(pt,tex);});
 const burst=async fn=>{const v=[];for(let i=0;i<120;i++){fn();if(i%4===3)v.push(await read());}return stat(v);};
 video.pause();await sleep(150);out.burstExterno=await burst(()=>pass(pe,ext()));out.burstTextura=await burst(()=>pass(pt,tex));await video.play();
 // A heavy pass of about 3 ms: alone at the stream cadence, and after 2 s of back-to-back load. Timestamps time the GPU only.
 const heavy=d.createBindGroup({layout:ph.getBindGroupLayout(0),entries:[{binding:0,resource:samp},{binding:1,resource:src.createView()}]});
 const spaced=async(gap,n)=>{const v=[];for(let i=0;i<n;i++){pass(ph,heavy);v.push(await read());await sleep(gap);}return stat(v);};
 video.pause();await sleep(300);out.pesadoEspacado33=await spaced(33,150);out.pesadoEspacado8=await spaced(8,300);
 const end=performance.now()+2500,sat=[];while(performance.now()<end){for(let i=0;i<8;i++)pass(ph,heavy);sat.push(await read());}out.pesadoSaturado=stat(sat.slice(-40));out.pesadoEspacadoDepois=await spaced(33,150);await video.play();
 d.destroy();return out;
}
// Is the live cost a low clock? One frame of the default path, GPU finished before the next starts.
// decay: back-to-back frames, then frames every 33 ms, then a burst again, logging each frame: a governor shows
// a gradual change over time; cold caches or a power gate would show it at once, on the first spaced frame.
const one=()=>{const {e,OW,OH,settings,finish,dest,withoutUpload}=B,s=settings({output:String(OH)}),a=performance.now();withoutUpload(()=>e.render(video,OW,OH,s,performance.now()/1000,false,'paced0'));finish(dest().fbo);return performance.now()-a;};
async function until(ms,gap,rows,tag){const end=performance.now()+ms,t0=performance.now();while(performance.now()<end){const n=performance.now();rows.push([tag,+(n-t0).toFixed(0),+one().toFixed(2)]);if(gap)await sleep(Math.max(0,gap-(performance.now()-n)));}}
async function decay(){video.pause();await sleep(200);const rows=[];B.e.render(video,B.OW,B.OH,B.settings({output:String(B.OH)}),1,false,'paced0');B.finish(B.dest().fbo);await until(1500,0,rows,'rajada1');await until(6000,33,rows,'espacado');await until(1500,0,rows,'rajada2');await sleep(3000);await until(6000,33,rows,'espacado2');await video.play();return rows;}
async function gapCurve(){video.pause();await sleep(200);const out={};B.e.render(video,B.OW,B.OH,B.settings({output:String(B.OH)}),1,false,'paced0');B.finish(B.dest().fbo);for(const gap of [0,4,8,12,16,20,25,33,50,100]){const rows=[];await until(1000,gap,rows,'x');rows.length=0;await until(3000,gap,rows,'x');out[gap]=stat(rows.map(r=>r[2]));await sleep(200);}await video.play();return out;}
// Same fragment work in WebGL2 and WebGPU, one pass per decoded frame: does the API change the GPU active time?
const GLSL_HEAVY=`#version 300 es
precision highp float;uniform sampler2D source;uniform vec2 outputSize;out vec4 fragColor;
void main(){vec4 c=vec4(0);vec2 u=gl_FragCoord.xy/outputSize,px=1./outputSize;for(int i=0;i<28;i++){vec2 d=vec2(float(i%7)-3.,float(i/7)-2.)*px;c+=textureLod(source,u+d,0.)*(1.+.01*sin(c.x+float(i)));}fragColor=c/28.;}`;
async function heavySession(kind,seconds,opt={}){const {e,gl,W,H}=B;if(!e.programs.heavy)e.programs.heavy=e.compile(GLSL_HEAVY);const t=e.target('pacedHeavy',W,H),t2=e.target('pacedHeavy2',W,H);let frames=0,lat=[];
 let pass=null;if(kind==='gpu'){const a=await navigator.gpu.requestAdapter({powerPreference:'high-performance'}),d=await a.requestDevice(),m=d.createShaderModule({code:WGSL_HEAVY}),p=d.createRenderPipeline({layout:'auto',vertex:{module:m,entryPoint:'v'},fragment:{module:m,entryPoint:'f',targets:[{format:'rgba8unorm'}]}});
  const dst=d.createTexture({size:[W,H],format:'rgba8unorm',usage:GPUTextureUsage.RENDER_ATTACHMENT}),src=d.createTexture({size:[W,H],format:'rgba8unorm',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST}),b=d.createBindGroup({layout:p.getBindGroupLayout(0),entries:[{binding:0,resource:d.createSampler({magFilter:'linear',minFilter:'linear'})},{binding:1,resource:src.createView()}]});
  pass=()=>{const en=d.createCommandEncoder(),r=en.beginRenderPass({colorAttachments:[{view:dst.createView(),loadOp:'clear',storeOp:'store',clearValue:[0,0,0,1]}]});r.setPipeline(p);r.setBindGroup(0,b);r.draw(3);r.end();d.queue.submit([en.finish()]);};}
 else pass=()=>{const k=frames&1?t:t2;gl.bindFramebuffer(gl.FRAMEBUFFER,k.fbo);if(opt.inv)gl.invalidateFramebuffer(gl.FRAMEBUFFER,[gl.COLOR_ATTACHMENT0]);if(opt.clear){gl.clearColor(0,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT);}e.draw('heavy',k,W,H,{source:e.input});gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.flush();};
 const end=performance.now()+seconds*1000;while(performance.now()<end){await new Promise(r=>video.requestVideoFrameCallback(r));pass();frames++;}
 return {fps:+(frames/seconds).toFixed(2)};}
async function single(){const {e,gl,W,H,finish}=B;if(!e.programs.heavy)e.programs.heavy=e.compile(GLSL_HEAVY);video.pause();await sleep(200);
 const t=[e.target('pacedHeavy',W,H),e.target('pacedHeavy2',W,H)],u={cleanup:.5,deband:.3,chroma:.75,detail:.2,antialias:0,debandTaps:4,quantize:true,selective:true},out={};
 const prep={plain:()=>{},inv:()=>gl.invalidateFramebuffer(gl.FRAMEBUFFER,[gl.COLOR_ATTACHMENT0]),clear:()=>{gl.clearColor(0,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT);}};
 for(const prog of ['heavy','spatial'])for(const [k,f] of Object.entries(prep))for(const M of [1,40]){let i=0,v=[];const end=performance.now()+1500;while(performance.now()<end){const a=performance.now();let x;for(let m=0;m<M;m++){x=t[i++&1];gl.bindFramebuffer(gl.FRAMEBUFFER,x.fbo);f();e.draw(prog,x,W,H,{source:e.input},prog==='spatial'?u:{});}finish(x.fbo);v.push((performance.now()-a)/M);}out[`${prog}.${k}.M${M}`]=stat(v).p50;await sleep(100);}
 await video.play();return out;}
// Clock test proper: saturate with unsynchronized frames, then watch single frames decay; then watch a burst ramp up.
async function ramp(cycles=3){const {e,OW,OH,settings,finish,dest,withoutUpload}=B,st=settings({output:String(OH)}),draw=()=>withoutUpload(()=>e.render(video,OW,OH,st,1,false,'paced0'));video.pause();await sleep(200);e.render(video,OW,OH,st,1,false,'paced0');finish(dest().fbo);
 const out={decay:[],rampa:[]};
 for(let c=0;c<cycles;c++){let end=performance.now()+1500;while(performance.now()<end){for(let i=0;i<40;i++)draw();finish(dest().fbo);}
  const t0=performance.now();end=t0+2500;while(performance.now()<end){const n=performance.now();out.decay.push([+(n-t0).toFixed(0),+one().toFixed(1)]);await sleep(Math.max(0,33-(performance.now()-n)));}
  await sleep(1500);const t1=performance.now();end=t1+1500;while(performance.now()<end){const a=performance.now();for(let i=0;i<8;i++)draw();finish(dest().fbo);out.rampa.push([+(a-t1).toFixed(0),+((performance.now()-a)/8).toFixed(2)]);}await sleep(500);}
 await video.play();return out;}
Object.assign(B,{worker,webgpu,decay,gapCurve,heavySession,single,ramp});
})();

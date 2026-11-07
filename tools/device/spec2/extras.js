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
const WGSL_TEX=`@group(0) @binding(0) var s:sampler;@group(0) @binding(1) var t:texture_2d<f32>;
@vertex fn v(@builtin(vertex_index) i:u32)->@builtin(position) vec4f{return vec4f(vec2f(f32((i<<1)&2),f32(i&2))*2-1,0,1);}
@fragment fn f(@builtin(position) p:vec4f)->@location(0) vec4f{return textureSample(t,s,p.xy/vec2f(1920,1080));}`;
// Each sampled pass has its own timestamps. Live: one per decoded frame, at the governor's clock. Burst: back to back.
async function webgpu(seconds=8){
 const a=await navigator.gpu.requestAdapter({powerPreference:'high-performance'}),d=await a.requestDevice({requiredFeatures:['timestamp-query']}),fmt='rgba8unorm',W=1920,H=1080;
 const dst=d.createTexture({size:[W,H],format:fmt,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING}),src=d.createTexture({size:[W,H],format:fmt,usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT});
 const samp=d.createSampler({magFilter:'linear',minFilter:'linear'}),mk=code=>{const m=d.createShaderModule({code});return d.createRenderPipeline({layout:'auto',vertex:{module:m,entryPoint:'v'},fragment:{module:m,entryPoint:'f',targets:[{format:fmt}]}});};
 const pe=mk(WGSL_EXT),pt=mk(WGSL_TEX),qs=d.createQuerySet({type:'timestamp',count:2}),rb=d.createBuffer({size:16,usage:GPUBufferUsage.QUERY_RESOLVE|GPUBufferUsage.COPY_SRC}),mb=d.createBuffer({size:16,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
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
 d.destroy();return out;
}
// Is the live cost a low clock? One frame of the default path, GPU finished before the next starts.
// decay: back-to-back frames, then frames every 33 ms, then a burst again, logging each frame: a governor shows
// a gradual change over time; cold caches or a power gate would show it at once, on the first spaced frame.
const one=()=>{const {e,OW,OH,settings,finish,dest,withoutUpload}=B,s=settings({output:String(OH)}),a=performance.now();withoutUpload(()=>e.render(video,OW,OH,s,performance.now()/1000,false,'paced0'));finish(dest().fbo);return performance.now()-a;};
async function until(ms,gap,rows,tag){const end=performance.now()+ms,t0=performance.now();while(performance.now()<end){const n=performance.now();rows.push([tag,+(n-t0).toFixed(0),+one().toFixed(2)]);if(gap)await sleep(Math.max(0,gap-(performance.now()-n)));}}
async function decay(){video.pause();await sleep(200);const rows=[];one();await until(1500,0,rows,'rajada1');await until(6000,33,rows,'espacado');await until(1500,0,rows,'rajada2');await sleep(3000);await until(6000,33,rows,'espacado2');await video.play();return rows;}
async function gapCurve(){video.pause();await sleep(200);const out={};for(const gap of [0,4,8,12,16,20,25,33,50,100]){const rows=[];await until(1000,gap,rows,'x');rows.length=0;await until(3000,gap,rows,'x');out[gap]=stat(rows.map(r=>r[2]));await sleep(200);}await video.play();return out;}
Object.assign(B,{worker,webgpu,decay,gapCurve});
})();

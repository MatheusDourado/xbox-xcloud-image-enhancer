// Spec 4 bench: the spatial pass in WebGL2 (shipped engine) and in WebGPU (src/webgpu/spatial.wgsl) on the
// same decoded H.264 frame. B.ready() loads the clip and both renderers; B.compare() reads back both
// outputs and diffs them; B.cost() times the pass in bursts, both ways, interleaved.
// Query: clip (default game30), n (passes per burst), rounds.
const Q=new URLSearchParams(location.search),video=document.getElementById('v'),canvas=document.getElementById('c');
const W=1920,H=1080,CLIP=Q.get('clip')||'game30',N=Number(Q.get('n')||40),ROUNDS=Number(Q.get('rounds')||5);
canvas.width=W;canvas.height=H;
const gl=canvas.getContext('webgl2',{antialias:false,alpha:false,depth:false,stencil:false,preserveDrawingBuffer:false});
const e=new BxRestoration.Engine(gl,BxShaders);
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),px=new Uint8Array(4);
const stat=v=>{const q=[...v].sort((a,b)=>a-b),at=p=>q[Math.min(q.length-1,Math.floor(q.length*p))];return v.length?{n:v.length,p50:+at(.5).toFixed(3),min:+q[0].toFixed(3),max:+q[q.length-1].toFixed(3)}:null;};
const tiny=e.target('pacedTiny',1,1);
function glFinish(){e.draw('copy',tiny,1,1,{source:e.targets.pacedA.texture});gl.bindFramebuffer(gl.FRAMEBUFFER,tiny.fbo);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,px);}
function upload(){gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,e.input);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,video);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);}
// Settings under test: Spec 3 defaults, v9 defaults, everything on (AA fused).
const CASES={spec3:{cleanup:0,deband:.6,chroma:.75,detail:0,antialias:0},v9:{cleanup:.5,deband:.3,chroma:.75,detail:.2,antialias:0},all:{cleanup:.5,deband:.6,chroma:.75,detail:.2,antialias:.5}};
const glU=c=>({...c,debandTaps:4,quantize:true,selective:true});
const G={};
// WGSL source for a source kind: texture_external (video frame, no copy) or texture_2d<f32>.
function wgsl(code,kind){const ext=kind==='ext';
 return code.replaceAll('SRC_TYPE',ext?'texture_external':'texture_2d<f32>').replaceAll('LOAD(','loadSource(').replaceAll('SAMPLE(','sampleSource(')+
  (ext?'\nfn loadSource(c:vec2i)->vec4f{return textureLoad(source,c);}\nfn sampleSource(uv:vec2f)->vec4f{return textureSampleBaseClampToEdge(source,linearSampler,uv);}\n'
      :'\nfn loadSource(c:vec2i)->vec4f{return textureLoad(source,c,0);}\nfn sampleSource(uv:vec2f)->vec4f{return textureSampleLevel(source,linearSampler,uv,0.0);}\n');}
// Override constants from the profile shared with the WebGL2 variants (BxRestoration.spatialProfile).
function constants(c){const p=BxRestoration.spatialProfile(glU(c),'highp'),b=v=>v?1:0;
 return {CLEANUP:b(p.cleanup),DEBAND:b(p.deband),CHROMA:b(p.chroma),DETAIL:b(p.detail),ANTIALIAS:b(p.antialias),TAPS:p.taps,QUANTIZE:b(p.quantize),SELECTIVE:b(p.selective)};}
async function initGpu(){
 const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});if(!adapter)throw new Error('no adapter');
 const features=['timestamp-query'].filter(f=>adapter.features.has(f));
 const device=await adapter.requestDevice({requiredFeatures:features});
 const errors=[];device.addEventListener('uncapturederror',ev=>errors.push(String(ev.error.message).slice(0,400)));
 const code=await (await fetch('/src/webgpu/spatial.wgsl',{cache:'no-store'})).text();
 const layouts={};for(const kind of ['ext','tex'])layouts[kind]=device.createBindGroupLayout({entries:[
  {binding:0,visibility:GPUShaderStage.FRAGMENT,buffer:{type:'uniform'}},
  kind==='ext'?{binding:1,visibility:GPUShaderStage.FRAGMENT,externalTexture:{}}:{binding:1,visibility:GPUShaderStage.FRAGMENT,texture:{sampleType:'float'}},
  {binding:2,visibility:GPUShaderStage.FRAGMENT,sampler:{type:'filtering'}}]});
 const modules={};const compile={};
 for(const kind of ['ext','tex']){const t=performance.now();modules[kind]=device.createShaderModule({code:wgsl(code,kind)});const info=await modules[kind].getCompilationInfo();compile[kind]={ms:performance.now()-t,messages:info.messages.map(m=>`${m.type} ${m.lineNum}:${m.linePos} ${m.message}`)};}
 const sampler=device.createSampler({magFilter:'linear',minFilter:'linear',addressModeU:'clamp-to-edge',addressModeV:'clamp-to-edge'});
 const ubufs={};for(const [k,c] of Object.entries(CASES)){const b=device.createBuffer({size:32,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});device.queue.writeBuffer(b,0,new Float32Array([c.cleanup,c.deband,c.chroma,c.detail,c.antialias,0,0,0]));ubufs[k]=b;}
 const tex=()=>device.createTexture({size:[W,H],format:'rgba8unorm',usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_SRC|GPUTextureUsage.COPY_DST});
 const targets=[tex(),tex()],srcTex=tex();
 // Plain-texture source: the frame copied once (top row first, like the external texture).
 device.queue.copyExternalImageToTexture({source:video},{texture:srcTex},[W,H]);
 const pipes=new Map();
 async function pipeline(kind,caseName){const key=kind+caseName;if(pipes.has(key))return pipes.get(key);const t=performance.now();
  const p=await device.createRenderPipelineAsync({layout:device.createPipelineLayout({bindGroupLayouts:[layouts[kind]]}),vertex:{module:modules[kind],entryPoint:'vs'},
   fragment:{module:modules[kind],entryPoint:'fs',targets:[{format:'rgba8unorm'}],constants:constants(CASES[caseName])},primitive:{topology:'triangle-list'}});
  pipes.set(key,p);G.pipelineMs.push([key,performance.now()-t]);return p;}
 const copyModule=device.createShaderModule({code:`@group(0) @binding(0) var frame:texture_external;
@vertex fn vs(@builtin(vertex_index) i:u32)->@builtin(position) vec4f{let xy=array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));return vec4f(xy[i],0,1);}
@fragment fn fs(@builtin(position) p:vec4f)->@location(0) vec4f{return vec4f(textureLoad(frame,vec2i(p.xy)).rgb,1);}`});
 const copyLayout=device.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.FRAGMENT,externalTexture:{}}]});
 const copyPipe=device.createRenderPipeline({layout:device.createPipelineLayout({bindGroupLayouts:[copyLayout]}),vertex:{module:copyModule,entryPoint:'vs'},fragment:{module:copyModule,entryPoint:'fs',targets:[{format:'rgba8unorm'}]},primitive:{topology:'triangle-list'}});
 const frameTex=tex();
 const qs=features.length?device.createQuerySet({type:'timestamp',count:2}):null;
 const qResolve=qs&&device.createBuffer({size:16,usage:GPUBufferUsage.QUERY_RESOLVE|GPUBufferUsage.COPY_SRC});
 Object.assign(G,{copyLayout,copyPipe,frameTex,adapter,device,errors,layouts,sampler,ubufs,targets,srcTex,pipeline,qs,qResolve,compile,pipelineMs:[],features:[...device.features]});
}
function bindGroup(kind,caseName){const {device,layouts,ubufs,sampler,srcTex}=G;
 return device.createBindGroup({layout:layouts[kind],entries:[{binding:0,resource:{buffer:ubufs[caseName]}},{binding:1,resource:kind==='ext'?device.importExternalTexture({source:video}):srcTex.createView()},{binding:2,resource:sampler}]});}
function encodePass(enc,pipe,bg,target,ts){const rp=enc.beginRenderPass({colorAttachments:[{view:target.createView(),loadOp:'clear',storeOp:'store',clearValue:[0,0,0,1]}],...(ts?{timestampWrites:ts}:{})});
 rp.setPipeline(pipe);rp.setBindGroup(0,bg);rp.draw(3);rp.end();}
async function readTexture(texture){const {device}=G,buf=device.createBuffer({size:W*H*4,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
 const enc=device.createCommandEncoder();enc.copyTextureToBuffer({texture},{buffer:buf,bytesPerRow:W*4},[W,H]);device.queue.submit([enc.finish()]);
 await buf.mapAsync(GPUMapMode.READ);const out=new Uint8Array(buf.getMappedRange()).slice();buf.unmap();buf.destroy();return out;}
async function ready(){
 const blob=await (await fetch(`/output/videos/${CLIP}.mp4`)).blob();video.src=URL.createObjectURL(blob);await video.play();
 await new Promise(r=>video.requestVideoFrameCallback(r));video.pause();await sleep(200);upload();
 for(const t of ['pacedA','pacedB'])e.target(t,W,H);
 await initGpu();
 for(const k of Object.keys(CASES))for(const kind of ['ext','tex'])await G.pipeline(kind,k);
 const info=G.adapter.info||{};
 return {ua:navigator.userAgent,renderer:gl.getParameter((gl.getExtension('WEBGL_debug_renderer_info')||{}).UNMASKED_RENDERER_WEBGL||gl.RENDERER),timer:!!e.ext,spatialPrecision:e.spatialPrecision,
  adapter:{vendor:info.vendor,architecture:info.architecture,description:info.description,isFallback:info.isFallbackAdapter},features:G.features,compile:G.compile,pipelineMs:G.pipelineMs,errors:G.errors,size:[video.videoWidth,video.videoHeight],time:video.currentTime};
}
// Pixel diff between the WebGL2 output (rows from the bottom) and the WebGPU one (rows from the top).
function diff(a,b){let max=0,sum=0,over1=0,over2=0,n=0;const hist=new Array(8).fill(0);
 for(let y=0;y<H;y++){const ga=(H-1-y)*W*4,gb=y*W*4;for(let x=0;x<W*4;x++){if((x&3)===3)continue;const d=Math.abs(a[ga+x]-b[gb+x]);n++;sum+=d;if(d>max)max=d;if(d>1)over1++;if(d>2)over2++;hist[Math.min(7,d)]++;}}
 return {max,mean:+(sum/n).toFixed(5),over1Pct:+(over1*100/n).toFixed(4),over2Pct:+(over2*100/n).toFixed(4),hist};}
async function compare(){const out={};
 // Inputs first: the WebGL2 upload of the frame against the WebGPU copy of the same frame (YUV to RGB paths).
 {const t=e.targets.pacedA;e.draw('copy',t,W,H,{source:e.input});const a=new Uint8Array(W*H*4);gl.bindFramebuffer(gl.FRAMEBUFFER,t.fbo);gl.readPixels(0,0,W,H,gl.RGBA,gl.UNSIGNED_BYTE,a);gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  out.input=diff(a,await readTexture(G.srcTex));}
 for(const k of Object.keys(CASES)){
  const t=e.targets.pacedA,u=glU(CASES[k]);e.draw(e.spatialVariant(u,true),t,W,H,{source:e.input},u);
  const a=new Uint8Array(W*H*4);gl.bindFramebuffer(gl.FRAMEBUFFER,t.fbo);gl.readPixels(0,0,W,H,gl.RGBA,gl.UNSIGNED_BYTE,a);gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  // Generic GL shader too: the variant and the generic one may differ by rounding on some GPUs.
  e.draw('spatial',t,W,H,{source:e.input},u);const a2=new Uint8Array(W*H*4);gl.bindFramebuffer(gl.FRAMEBUFFER,t.fbo);gl.readPixels(0,0,W,H,gl.RGBA,gl.UNSIGNED_BYTE,a2);gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  out[k]={};
  for(const kind of ['ext','tex']){const enc=G.device.createCommandEncoder();encodePass(enc,await G.pipeline(kind,k),bindGroup(kind,k),G.targets[0]);G.device.queue.submit([enc.finish()]);
   const b=await readTexture(G.targets[0]);out[k][kind]=diff(a,b);if(kind==='tex')out[k].texVsGlGenericHighp=diff(a2,b);}
  // Reference: the GL generic shader against the GL variant, flipped the same way, as the noise floor.
  const flip=new Uint8Array(W*H*4);for(let y=0;y<H;y++)flip.set(a2.subarray((H-1-y)*W*4,(H-y)*W*4),y*W*4);out[k].glGenericVsVariant=diff(a,flip);
 }
 return {result:out,errors:G.errors};}
async function glBurst(k,n,withUpload){const u=glU(CASES[k]),name=e.spatialVariant(u,true),A=e.targets.pacedA,Bt=e.targets.pacedB;
 glFinish();let q=null;if(e.ext){q=gl.createQuery();gl.beginQuery(e.ext.TIME_ELAPSED_EXT,q);}
 const t0=performance.now();for(let i=0;i<n;i++){if(withUpload)upload();e.draw(name,i&1?A:Bt,W,H,{source:e.input},u);}
 if(q)gl.endQuery(e.ext.TIME_ELAPSED_EXT);glFinish();const wall=(performance.now()-t0)/n;let timer=null;
 if(q){for(let i=0;i<200&&!gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE);i++)await sleep(5);if(gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE)&&!gl.getParameter(e.ext.GPU_DISJOINT_EXT))timer=gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6/n;gl.deleteQuery(q);}
 return {wall,timer};}
async function gpuBurst(k,n,kind){const {device,qs,qResolve}=G,copy=kind==='copy',pipe=await G.pipeline(copy?'tex':kind,k);
 const copyBg=()=>device.createBindGroup({layout:G.copyLayout,entries:[{binding:0,resource:device.importExternalTexture({source:video})}]});
 const frameBg=copy&&device.createBindGroup({layout:G.layouts.tex,entries:[{binding:0,resource:{buffer:G.ubufs[k]}},{binding:1,resource:G.frameTex.createView()},{binding:2,resource:G.sampler}]});
 await device.queue.onSubmittedWorkDone();
 const t0=performance.now(),enc=device.createCommandEncoder();
 for(let i=0;i<n;i++){let ts=null;if(qs){ts={querySet:qs};if(i===0)ts.beginningOfPassWriteIndex=0;if(i===n-1)ts.endOfPassWriteIndex=1;if(i>0&&i<n-1)ts=null;}
  if(copy){const b=qs&&i===0?{querySet:qs,beginningOfPassWriteIndex:0}:null;encodePass(enc,G.copyPipe,copyBg(),G.frameTex,b);if(ts&&i===0){delete ts.beginningOfPassWriteIndex;if(ts.endOfPassWriteIndex===undefined)ts=null;}}
  encodePass(enc,pipe,copy?frameBg:bindGroup(kind,k),G.targets[i&1],ts);}
 let read=null;if(qs){enc.resolveQuerySet(qs,0,2,qResolve,0);read=device.createBuffer({size:16,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});enc.copyBufferToBuffer(qResolve,0,read,0,16);}
 device.queue.submit([enc.finish()]);await device.queue.onSubmittedWorkDone();const wall=(performance.now()-t0)/n;let timer=null;
 if(read){await read.mapAsync(GPUMapMode.READ);const v=new BigUint64Array(read.getMappedRange());timer=Number(v[1]-v[0])/1e6/n;read.unmap();read.destroy();}
 return {wall,timer};}
// Interleaved rounds; every case warms up once first.
async function cost(cases=Object.keys(CASES)){const res={};const runs=[];
 for(const k of cases)for(const [label,fn] of [['gl',()=>glBurst(k,N,false)],['glUpload',()=>glBurst(k,N,true)],['gpuTex',()=>gpuBurst(k,N,'tex')],['gpuExt',()=>gpuBurst(k,N,'ext')],['gpuCopy',()=>gpuBurst(k,N,'copy')]])runs.push([k+'.'+label,fn]);
 for(const [,fn] of runs)await fn();
 for(let r=0;r<ROUNDS;r++){const order=[...runs].sort(()=>Math.random()-.5);for(const [name,fn] of order){const v=await fn();(res[name]??={wall:[],timer:[]}).wall.push(v.wall);if(v.timer!=null)res[name].timer.push(v.timer);await sleep(30);}}
 return {n:N,rounds:ROUNDS,result:Object.fromEntries(Object.entries(res).map(([k,v])=>[k,{wall:stat(v.wall),timer:stat(v.timer)}])),errors:G.errors};}
// Same RGBA bytes on both sides: the WebGL2 input texture read back and written to a WebGPU texture, so
// only the shaders differ (the decoder frame's YUV to RGB conversion differs between the two APIs).
async function compareSame(){const out={},t=e.targets.pacedA;
 e.draw('copy',t,W,H,{source:e.input});const a=new Uint8Array(W*H*4);gl.bindFramebuffer(gl.FRAMEBUFFER,t.fbo);gl.readPixels(0,0,W,H,gl.RGBA,gl.UNSIGNED_BYTE,a);gl.bindFramebuffer(gl.FRAMEBUFFER,null);
 const top=new Uint8Array(W*H*4);for(let y=0;y<H;y++)top.set(a.subarray((H-1-y)*W*4,(H-y)*W*4),y*W*4);
 G.device.queue.writeTexture({texture:G.srcTex},top,{bytesPerRow:W*4},[W,H]);
 // The GL side reads its input from the same bytes too (the copy pass output is exact).
 for(const k of Object.keys(CASES)){const u=glU(CASES[k]);
  e.draw(e.spatialVariant(u,true),t,W,H,{source:e.input},u);const v=new Uint8Array(W*H*4);gl.bindFramebuffer(gl.FRAMEBUFFER,t.fbo);gl.readPixels(0,0,W,H,gl.RGBA,gl.UNSIGNED_BYTE,v);
  e.draw('spatial',t,W,H,{source:e.input},u);const g=new Uint8Array(W*H*4);gl.readPixels(0,0,W,H,gl.RGBA,gl.UNSIGNED_BYTE,g);gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  const enc=G.device.createCommandEncoder();encodePass(enc,await G.pipeline('tex',k),bindGroup('tex',k),G.targets[0]);G.device.queue.submit([enc.finish()]);
  const b=await readTexture(G.targets[0]);out[k]={vsGlVariant:diff(v,b),vsGlGenericHighp:diff(g,b)};}
 // Restore the decoded frame in srcTex for the other benches.
 {G.device.queue.copyExternalImageToTexture({source:video},{texture:G.srcTex},[W,H]);}
 return {spatialPrecision:e.spatialPrecision,result:out,errors:G.errors};}
window.B={ready,compare,compareSame,cost,e,gl,G};

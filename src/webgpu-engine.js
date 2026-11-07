/* WebGPU renderer (Spec 4, docs/spec4-webgpu.md): the frames of Engine (WebGL2) drawn with the WGSL ports in
   src/webgpu, embedded by tools/build.py as BxWgsl. Shared with WebGL2: BxRestoration.framePlan (what each
   frame runs and with which uniforms), the spatial profiles, the budget and the diagnostics. Only resources,
   frame import and draws live here. Neural restoration and temporal stay in WebGL2 (rendererSupports). */
(() => {
  const R=globalThis.BxRestoration;
  // Field order of each WGSL uniform struct (all f32; padded to 16 bytes).
  const PACK={
    spatial:u=>[u.cleanup,u.deband,u.chroma,u.detail,u.antialias,u.debandTaps,u.quantize?1:0,u.selective?1:0],
    easu:(u,w,h)=>[w,h,0,0],
    cas:u=>[u.iResolution[0],u.iResolution[1],u.sharpenFactor,u.brightness,u.contrast,u.saturation,u.shadows,u.deband,u.haloMargin,u.noiseFloor,u.filterId,u.qualityMode?1:0,u.lumaSharpen?1:0,u.diagnostic?1:0,0,0],
    rcas:(u,w,h)=>[w,h,u.rcasStrength,u.haloMargin,u.noiseFloor,u.contrast,u.saturation,u.shadows,u.deband,u.diagnostic?1:0,u.lumaSharpen?1:0,0],
    sgsr:(u,w,h)=>[w,h,u.sharp,u.threshold,u.brightness,u.contrast,u.saturation,u.shadows,u.deband,u.diagnostic?1:0,0,0],
    copy:()=>[0,0,0,0],
  };
  // Shader file and pipeline constants of each pass name used by framePlan.
  const SHADER={spatial:'spatial',easu:'easu',cas:'cas',casFiltered:'cas',rcas:'rcas',sgsr:'sgsr',copy:'copy'};
  const CONSTANTS={cas:{LIMIT:0},casFiltered:{LIMIT:1}};
  // Spatial variant: the same profile as the WebGL2 variants, as pipeline-overridable constants.
  function spatialConstants(p){const b=v=>v?1:0;return {FIXED:1,CLEANUP:b(p.cleanup),DEBAND:b(p.deband),CHROMA:b(p.chroma),DETAIL:b(p.detail),ANTIALIAS:b(p.antialias),TAPS:p.taps,QUANTIZE:b(p.quantize),SELECTIVE:b(p.selective)};}
  function wgsl(name,kind){const code=globalThis.BxWgsl.common+'\n'+globalThis.BxWgsl[name],ext=kind==='ext';
    return code.replaceAll('SRC_TYPE',ext?'texture_external':'texture_2d<f32>').replaceAll('LOAD(','loadSource(').replaceAll('SAMPLE(','sampleSource(')+
      (ext?'\nfn loadSource(c:vec2i)->vec4f{return textureLoad(source,c);}\nfn sampleSource(uv:vec2f)->vec4f{return textureSampleBaseClampToEdge(source,linearSampler,uv);}\n'
        :'\nfn loadSource(c:vec2i)->vec4f{return textureLoad(source,c,0);}\nfn sampleSource(uv:vec2f)->vec4f{return textureSampleLevel(source,linearSampler,uv,0.0);}\n');}
  const isFrame=s=>typeof VideoFrame!=='undefined'&&s instanceof VideoFrame||typeof HTMLVideoElement!=='undefined'&&s instanceof HTMLVideoElement;
  const SLOTS=16,PENDING=4;
  class GpuEngine {
    // Use create(): the device and the pipelines of the default frame are ready before the first frame.
    constructor(device,context,format,options){
      this.device=device;this.context=context;this.format=format;this.options=options;this.budget=R.createBudget();this.diagnostics=R.createDiagnostics();
      this.frames=0;this.previous=null;this.floatTargets=true;this.fenceTiming=false;this.gpuEstimate=null;this.targets={};this.pipelines=new Map();this.jobs=new Map();this.failedVariants=new Set();
      this.modules={};this.uniforms=new Map();this.failed=null;this.onfail=null;this.renderer='webgpu';
      this.timestamps=device.features.has('timestamp-query');this.ext=this.timestamps?{}:null;this.pending=[];this.free=[];this.nextQuery=0;
      if(this.timestamps){this.querySet=device.createQuerySet({type:'timestamp',count:SLOTS*4});this.resolve=device.createBuffer({size:SLOTS*256,usage:GPUBufferUsage.QUERY_RESOLVE|GPUBufferUsage.COPY_SRC});}
      const entry=(binding,resource)=>({binding,visibility:GPUShaderStage.FRAGMENT|GPUShaderStage.COMPUTE,...resource});
      this.layouts={tex:device.createBindGroupLayout({entries:[entry(0,{buffer:{type:'uniform'}}),entry(1,{texture:{sampleType:'float'}}),entry(2,{sampler:{type:'filtering'}})]}),
        ext:device.createBindGroupLayout({entries:[entry(0,{buffer:{type:'uniform'}}),entry(1,{externalTexture:{}}),entry(2,{sampler:{type:'filtering'}})]})};
      this.pipelineLayouts={tex:device.createPipelineLayout({bindGroupLayouts:[this.layouts.tex]}),ext:device.createPipelineLayout({bindGroupLayouts:[this.layouts.ext]})};
      this.sampler=device.createSampler({magFilter:'linear',minFilter:'linear',addressModeU:'clamp-to-edge',addressModeV:'clamp-to-edge'});
      this.dummy=device.createBuffer({size:16,usage:GPUBufferUsage.UNIFORM});
      device.lost.then(info=>this.fail('Dispositivo WebGPU perdido: '+(info.message||info.reason)));
      device.addEventListener('uncapturederror',e=>this.fail('Erro WebGPU: '+String(e.error?.message||e.error).slice(0,300)));
    }
    // A failure (device lost, validation error) stops this renderer for good; the owner falls back to WebGL2.
    fail(reason){if(this.failed)return;this.failed=reason;try{this.onfail?.(reason);}catch{}}
    module(name,kind){const key=name+'|'+kind;return this.modules[key]??=this.device.createShaderModule({code:wgsl(name,kind)});}
    // Pipeline for a pass, created asynchronously. ready() returns it or null while it compiles.
    pipelineKey(name,kind,format,constants){return [name,kind,format,JSON.stringify(constants||{})].join('|');}
    build(name,kind,format,constants={}){const key=this.pipelineKey(name,kind,format,constants);
      if(this.pipelines.has(key))return Promise.resolve(this.pipelines.get(key));
      let job=this.jobs.get(key);if(job)return job;
      const module=this.module(SHADER[name]||name,kind);
      job=this.device.createRenderPipelineAsync({layout:this.pipelineLayouts[kind],vertex:{module,entryPoint:'vs'},fragment:{module,entryPoint:'fs',targets:[{format}],constants},primitive:{topology:'triangle-list'}})
        .then(p=>{this.pipelines.set(key,p);this.jobs.delete(key);return p;},e=>{this.jobs.delete(key);this.failedVariants.add(key);throw e;});
      this.jobs.set(key,job);return job;}
    ready(name,kind,format,constants={}){const key=this.pipelineKey(name,kind,format,constants);const p=this.pipelines.get(key);if(p)return p;
      if(!this.failedVariants.has(key))this.build(name,kind,format,constants).catch(e=>console.warn('[BxWebGPU] pipeline failed',key,e));return null;}
    // Spatial pipeline for these uniforms: the compiled variant once ready, the generic one meanwhile.
    spatialPipeline(u,format){const c=spatialConstants(R.spatialProfile(u,'highp'));return {pipeline:this.ready('spatial','tex',format,c)||this.ready('spatial','tex',format,{FIXED:0}),variant:c};}
    async warm(){const f=['rgba8unorm','rgba16float'],out=this.format,d=R.defaults,jobs=[];
      jobs.push(this.build('copy','ext','rgba8unorm'),this.build('copy','tex','rgba8unorm'),this.build('copy','tex',out));
      for(const t of f){jobs.push(this.build('spatial','tex',t,{FIXED:0}),this.build('easu','tex',t));}
      // The default frame: Spec 3 spatial variant, EASU, then casFiltered or SGSR on the canvas or a slot.
      jobs.push(this.build('spatial','tex','rgba8unorm',spatialConstants(R.spatialProfile({cleanup:d.cleanup,deband:d.deband,chroma:d.chroma,detail:d.detail,antialias:d.antialias,debandTaps:4,quantize:true,selective:d.spatialMode==='selective'},'highp'))));
      for(const t of new Set([out,'rgba8unorm']))for(const n of ['casFiltered','cas','sgsr','rcas'])jobs.push(this.build(n,'tex',t,CONSTANTS[n]));
      await Promise.all(jobs);}
    texture(w,h,fp){return this.device.createTexture({size:[w,h],format:fp?'rgba16float':'rgba8unorm',usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_SRC|GPUTextureUsage.COPY_DST});}
    target(name,w,h,fp=false){this.usedTargets?.add(name);let t=this.targets[name];if(t&&t.w===w&&t.h===h&&t.fp===fp)return t;
      t?.texture.destroy();t={w,h,fp,format:fp?'rgba16float':'rgba8unorm'};t.texture=this.texture(w,h,fp);t.view=t.texture.createView();this.targets[name]=t;return t;}
    uniform(key,values){let b=this.uniforms.get(key);const size=Math.ceil(values.length/4)*16;
      if(!b||b.size<size){b?.destroy();b=this.device.createBuffer({size,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});this.uniforms.set(key,b);}
      const data=new Float32Array(size/4);data.set(values);this.device.queue.writeBuffer(b,0,data);return b;}
    bind(kind,buffer,resource){return this.device.createBindGroup({layout:this.layouts[kind],entries:[{binding:0,resource:{buffer:buffer||this.dummy}},{binding:1,resource},{binding:2,resource:this.sampler}]});}
    // Records one full-screen pass. ts: {begin,end} query indices of the frame's first or last pass.
    pass(encoder,pipeline,group,view,ts){const d={colorAttachments:[{view,loadOp:'clear',storeOp:'store',clearValue:[0,0,0,1]}]};
      if(ts&&(ts.begin!=null||ts.end!=null)){d.timestampWrites={querySet:this.querySet};if(ts.begin!=null)d.timestampWrites.beginningOfPassWriteIndex=ts.begin;if(ts.end!=null)d.timestampWrites.endOfPassWriteIndex=ts.end;}
      const p=encoder.beginRenderPass(d);p.setPipeline(pipeline);p.setBindGroup(0,group);p.draw(3);p.end();}
    // Encodes a list of passes; the first one writes the begin timestamp and the last one the end.
    encode(encoder,passes,q){passes.forEach((p,i)=>this.pass(encoder,p.pipeline,p.group,p.view,q&&{begin:i===0?q:null,end:i===passes.length-1?q+1:null}));}
    // Frame import. A decoded frame (VideoFrame, <video>) is imported without a copy (importExternalTexture)
    // and converted to RGB once, by the copy pass into the RGBA8 input: reading the external texture in every
    // tap of the spatial pass converts YUV again each time and costs more (docs/spec4-webgpu.md). Other
    // sources (canvas, ImageBitmap: tests) are copied by the queue.
    importFrame(source,w,h,passes){const input=this.target('input',w,h);
      if(isFrame(source)){const ext=this.device.importExternalTexture({source});const p=this.ready('copy','ext','rgba8unorm');if(!p)return null;
        passes.push({pipeline:p,group:this.bind('ext',null,ext),view:input.view});}
      else this.device.queue.copyExternalImageToTexture({source},{texture:input.texture},[w,h]);
      return input;}
    // The last pass of a frame: its pipeline for a target format and its uniform values.
    finalPass(f,format){const name=f.name,p=this.ready(name,'tex',format,CONSTANTS[name]);return p;}
    finalValues(f,w,h){return PACK[SHADER[f.name]]({...f.uniforms,filterId:f.filterId},w,h);}
    outputSize(w,h,settings){
      if(this.budget.limitMs!==settings.gpuBudget){this.resetBudget();this.budget.limitMs=settings.gpuBudget;}
      this.budget.configure(settings,h);this.poll();
      return R.outputSize(w,h,this.budget.outputFor(settings));
    }
    // Whether this renderer draws a frame with these settings (neural restoration and temporal: WebGL2 only).
    supports(rawSettings,w,h,outW,outH){const s=R.normalize(rawSettings);return R.rendererSupports(R.framePlan(s,this.budget,w,h,outW,outH,true));}
    nextQueries(){if(!this.timestamps||this.pending.length>=PENDING)return null;const q=(this.nextQuery%SLOTS)*4;this.nextQuery++;return q;}
    // Copies the frame's timestamps (begin/end of render, and of present when deferred) to a mappable buffer.
    collect(encoder,item){if(!item)return;const n=item.parts*2,read=this.free.pop()||this.device.createBuffer({size:32,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
      // Resolve offsets must be multiples of 256: one 256-byte block per frame slot.
      const at=item.q/4*256;encoder.resolveQuerySet(this.querySet,item.q,n,this.resolve,at);encoder.copyBufferToBuffer(this.resolve,at,read,0,n*8);item.read=read;this.pending.push(item);}
    mapPending(item){item.read.mapAsync(GPUMapMode.READ).then(()=>{const v=new BigUint64Array(item.read.getMappedRange());let ns=0;for(let i=0;i<item.parts;i++)ns+=Number(v[i*2+1]-v[i*2]);item.read.unmap();
        item.ms=ns/1e6;item.done=true;this.free.push(item.read);},()=>{item.done=true;item.ms=null;});}
    poll(){while(this.pending.length&&this.pending[0].done){const item=this.pending.shift();
      if(item.ms!=null&&item.ms>=0&&item.revision===this.budget.revision){this.budget.sample(item.ms,item.mode);this.diagnostics.sample(item.segment,item.ms);}}}
    render(source,outW,outH,rawSettings,time,diagnostic=false,outputTarget=null,deferFinal=false){
      if(this.failed)return false;
      const s=R.normalize(rawSettings),w=source.videoWidth||source.displayWidth||source.width,h=source.videoHeight||source.displayHeight||source.height;
      if(!w||!h)return false;
      if(this.budget.limitMs!==s.gpuBudget){this.resetBudget();this.budget.limitMs=s.gpuBudget;}
      this.budget.configure(s,h);this.poll();
      const plan=R.framePlan(s,this.budget,w,h,outW,outH,this.floatTargets,diagnostic);
      if(!R.rendererSupports(plan))return false;
      const revision=this.budget.revision,segment=this.diagnostics.active?this.diagnostics.frame(R.segmentConfig(s,this.budget,w,h,outW,outH,revision,diagnostic,this.floatTargets,'webgpu'),performance.now()):null;
      this.usedTargets=new Set();const passes=[];
      try{
        const input=this.importFrame(source,w,h,passes);if(!input)return false;
        let src=input;
        if(plan.spatial){const t=this.target('spatial',w,h,plan.quality),{pipeline}=this.spatialPipeline(plan.spatial,t.format);if(!pipeline)return false;
          passes.push({pipeline,group:this.bind('tex',this.uniform('spatial',PACK.spatial(plan.spatial)),src.view),view:t.view});src=t;}
        if(plan.scaler==='easu'){const t=this.target('scaled',outW,outH,plan.quality),p=this.ready('easu','tex',t.format);if(!p)return false;
          passes.push({pipeline:p,group:this.bind('tex',this.uniform('easu',PACK.easu(null,outW,outH)),src.view),view:t.view});src=t;}
        const final=plan.final,q=this.nextQueries();
        const item=q==null?null:{q,parts:1,mode:s.mode,revision,segment};
        const encoder=this.device.createCommandEncoder();
        if(outputTarget&&deferFinal){
          const old=this.targets[outputTarget];if(old)this.flushSlot(old);
          const owner=src===input?null:Object.keys(this.targets).find(k=>this.targets[k]===src&&!k.startsWith('paced'));
          let slot;
          if(owner){slot=src;this.targets[outputTarget]=slot;if(old)this.targets[owner]=old;else delete this.targets[owner];this.usedTargets.add(outputTarget);}
          else{slot=this.target(outputTarget,w,h,false);const p=this.ready('copy','tex','rgba8unorm');if(!p)return false;passes.push({pipeline:p,group:this.bind('tex',null,src.view),view:slot.view});}
          slot.final={...final,w:outW,h:outH};slot.pendingQuery=item;
          if(passes.length)this.encode(encoder,passes,item?.q);else if(item)item.empty=true;
        }else{
          const t=outputTarget?this.target(outputTarget,outW,outH):null,format=t?t.format:this.format,p=this.finalPass(final,format);if(!p)return false;
          passes.push({pipeline:p,group:this.bind('tex',this.uniform('final:'+(outputTarget||''),this.finalValues(final,outW,outH)),src.view),view:t?t.view:this.canvasView()});
          this.encode(encoder,passes,item?.q);this.collect(encoder,item);
        }
        this.device.queue.submit([encoder.finish()]);if(item?.read)this.mapPending(item);
        this.frames++;return true;
      }finally{
        for(const [name,t] of Object.entries(this.targets))if(!this.usedTargets.has(name)&&!name.startsWith('paced')){t.texture.destroy();delete this.targets[name];}
        this.usedTargets=null;
      }
    }
    canvasView(){this.canvasTexture=this.context.getCurrentTexture();return this.canvasTexture.createView();}
    // A slot leaving the pacer without being presented: its render() time still counts.
    flushSlot(t){const item=t.pendingQuery;t.pendingQuery=null;t.final=null;
      if(item&&!item.empty){const e=this.device.createCommandEncoder();this.collect(e,item);this.device.queue.submit([e.finish()]);this.mapPending(item);}}
    // Shows a frame stored by render(...,outputTarget): the deferred last pass, or a copy, on the canvas.
    present(name){const t=this.targets[name];if(!t||this.failed)return false;
      const encoder=this.device.createCommandEncoder(),view=this.canvasView();
      if(t.final){let item=t.pendingQuery;t.pendingQuery=null;const p=this.finalPass(t.final,this.format);if(!p)return false;
        const group=this.bind('tex',this.uniform('present',this.finalValues(t.final,t.final.w,t.final.h)),t.view);
        // The render() passes wrote queries q, q+1; this pass writes q+2, q+3 (or q, q+1 when render() drew nothing).
        let q=null;if(item){if(item.empty){item.empty=false;q=item.q;}else{q=item.q+2;item.parts=2;}}
        this.pass(encoder,p,group,view,q!=null&&{begin:q,end:q+1});this.collect(encoder,item);
        this.device.queue.submit([encoder.finish()]);if(item?.read)this.mapPending(item);}
      else{const p=this.ready('copy','tex',this.format);if(!p)return false;this.pass(encoder,p,this.bind('tex',null,t.view),view);this.device.queue.submit([encoder.finish()]);}
      return true;}
    // Pixels of a target or of the canvas texture of this task, as WebGL2's readPixels would return them
    // (RGBA, bottom row first): for regression tests and benches.
    async read(name){const t=name==='canvas'?{texture:this.canvasTexture,w:this.canvasTexture.width,h:this.canvasTexture.height,format:this.format}:this.targets[name];
      const w=t.w,h=t.h,fp=t.format==='rgba16float',bpp=fp?8:4,row=Math.ceil(w*bpp/256)*256,buf=this.device.createBuffer({size:row*h,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
      const e=this.device.createCommandEncoder();e.copyTextureToBuffer({texture:t.texture},{buffer:buf,bytesPerRow:row},[w,h]);this.device.queue.submit([e.finish()]);
      await buf.mapAsync(GPUMapMode.READ);const src=new Uint8Array(buf.getMappedRange()),out=new Uint8Array(w*h*4),bgra=t.format==='bgra8unorm';
      if(fp){const half=new Uint16Array(buf.getMappedRange());const f16=x=>{const s=x&0x8000?-1:1,e=(x>>10)&31,m=x&1023;return s*(e?Math.pow(2,e-15)*(1+m/1024):Math.pow(2,-14)*m/1024);};
        for(let y=0;y<h;y++)for(let x=0;x<w;x++)for(let c=0;c<4;c++)out[((h-1-y)*w+x)*4+c]=Math.round(Math.min(1,Math.max(0,f16(half[(y*row/2)+x*4+c])))*255);}
      else for(let y=0;y<h;y++){const a=src.subarray(y*row,y*row+w*4),o=(h-1-y)*w*4;out.set(a,o);if(bgra)for(let x=0;x<w;x++){const i=o+x*4,r=out[i];out[i]=out[i+2];out[i+2]=r;}}
      buf.unmap();buf.destroy();return out;}
    releasePaced(){for(const [name,t] of Object.entries(this.targets))if(name.startsWith('paced')){t.pendingQuery=null;t.texture.destroy();delete this.targets[name];}}
    resetHistory(){this.previous=null;}
    resetBudget(){for(const t of Object.values(this.targets))t.pendingQuery=null;this.pending=[];this.budget=R.createBudget();this.resetHistory();}
    destroy(){for(const t of Object.values(this.targets))t.texture.destroy();this.targets={};for(const b of this.uniforms.values())b.destroy();this.uniforms.clear();
      this.querySet?.destroy();this.resolve?.destroy();this.dummy?.destroy();this.onfail=null;try{this.context.unconfigure();}catch{}this.device.destroy();}
  }
  // Adapter, device (with timestamp-query when offered) and the pipelines of the default frame, before any
  // frame is drawn: creating a pipeline can take close to a second on the Adreno 825.
  async function create(canvas,options={}){
    // unavailable: no WebGPU here (no API, adapter or device), as opposed to a failure of this renderer.
    const unavailable=m=>Object.assign(new Error(m),{unavailable:true});
    if(!navigator.gpu)throw unavailable('WebGPU indisponível');
    const adapter=await navigator.gpu.requestAdapter({powerPreference:options.powerPreference||'high-performance'});if(!adapter)throw unavailable('Sem adaptador WebGPU');
    const requiredFeatures=['timestamp-query'].filter(f=>adapter.features.has(f)&&options.timestamps!==false);
    let device;try{device=await adapter.requestDevice({requiredFeatures});}catch(e){throw unavailable('Sem dispositivo WebGPU: '+(e.message||e));}
    const context=canvas.getContext('webgpu');if(!context){device.destroy();throw new Error('Canvas sem contexto WebGPU');}
    const format=options.format||navigator.gpu.getPreferredCanvasFormat();
    context.configure({device,format,alphaMode:'opaque',usage:GPUTextureUsage.RENDER_ATTACHMENT|(options.readable?GPUTextureUsage.COPY_SRC:0)});
    const engine=new GpuEngine(device,context,format,options);engine.adapter=adapter.info?{vendor:adapter.info.vendor,architecture:adapter.info.architecture,description:adapter.info.description}:{};
    const t=performance.now();try{await engine.warm();}catch(e){engine.destroy();throw e;}engine.warmMs=performance.now()-t;
    if(engine.failed){const r=engine.failed;engine.destroy();throw new Error(r);}
    return engine;
  }
  globalThis.BxWebGPU={create,GpuEngine,spatialConstants,supported:()=>!!globalThis.navigator?.gpu};
})();

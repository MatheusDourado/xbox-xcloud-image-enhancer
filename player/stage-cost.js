/* Stage cost bench (Spec 1): same engine as the userscript, one filter at a time, fixed 1080p source.
   Each batch renders N frames and then reads one pixel, so the GPU must finish: throughput per frame,
   including the per-frame texture upload. Deltas against the "base" row isolate each stage. */
(() => {
  const params=new URLSearchParams(location.search),duration=Math.max(500,Math.min(60000,Number(params.get('ms'))||4000));
  const upscale=String(Math.max(1088,Math.min(2160,Number(params.get('out'))||1280)));
  const canvas=document.querySelector('#canvas'),log=document.querySelector('#log'),table=document.querySelector('#table');
  const gl=canvas.getContext('webgl2',{alpha:false,antialias:false,preserveDrawingBuffer:false,depth:false,stencil:false});
  let report=null;
  // Synthetic 1080p scene with the content the filters react to: gradients (banding), noise texture,
  // hard and slanted edges, colored thin lines and text. 8-bit steps mimic a compressed stream.
  function syntheticSource(){
    const c=document.createElement('canvas');c.width=1920;c.height=1080;const x=c.getContext('2d');
    const g=x.createLinearGradient(0,0,1920,0);g.addColorStop(0,'#203040');g.addColorStop(1,'#405870');x.fillStyle=g;x.fillRect(0,0,1920,540);
    const img=x.createImageData(960,540);let s=1;const r=()=>(s=(s*16807)%2147483647)/2147483647;
    for(let i=0;i<img.data.length;i+=4){const v=90+r()*60;img.data[i]=v;img.data[i+1]=v*.9;img.data[i+2]=v*.7;img.data[i+3]=255;}
    x.putImageData(img,0,540);
    for(let i=0;i<40;i++){x.strokeStyle=`hsl(${i*9},70%,55%)`;x.lineWidth=1+i%3;x.beginPath();x.moveTo(960+i*24,540);x.lineTo(1200+i*18,1080);x.stroke();}
    x.fillStyle='#e8e8e8';x.font='48px sans-serif';for(let i=0;i<6;i++)x.fillText('Spec 1 — custo por etapa 0123456789',980,80+i*70);
    // 8x8 blocks with small steps between them, as left by the encoder.
    for(let by=0;by<540;by+=8)for(let bx=0;bx<960;bx+=8){const v=120+((bx*7+by*13)%5);x.fillStyle=`rgb(${v},${v},${v+4})`;x.fillRect(bx,by,8,8);}
    return c;
  }
  async function videoSource(url){
    const v=document.createElement('video');v.muted=true;v.playsInline=true;v.src=url;
    await new Promise((ok,no)=>{v.onloadeddata=ok;v.onerror=()=>no(new Error('vídeo não carregou'));});
    v.currentTime=Math.min(5,(v.duration||1)/2);await new Promise(ok=>v.onseeked=ok);return v;
  }
  const off={cleanup:0,deband:0,chroma:0,detail:0,antialias:0,temporal:0,neural:0,sharpness:0,output:'native',gpuBudget:0,adaptive:false,mode:'filtered'};
  const def={cleanup:.5,deband:.3,chroma:.75,detail:.2,sharpness:3,sharpening:'usm'};
  const configs=[
    ['floor: original, sem nitidez',{...off,mode:'original'}],
    ['base: tratamento com tudo em 0',off],
    ['+ compressão 50%',{...off,cleanup:.5}],
    ['+ degradês 30%',{...off,deband:.3}],
    ['+ cor nas bordas 75%',{...off,chroma:.75}],
    ['+ detalhe 20%',{...off,detail:.2}],
    ['+ antialiasing 50% (fundido)',{...off,antialias:.5}],
    ['espacial padrão (4 filtros)',{...off,cleanup:.5,deband:.3,chroma:.75,detail:.2}],
    ['+ nitidez USM 3',{...off,sharpness:3,sharpening:'usm'}],
    ['+ nitidez CAS 3',{...off,sharpness:3,sharpening:'cas'}],
    ['+ nitidez RCAS 3',{...off,sharpness:3,sharpening:'rcas'}],
    ['+ temporal 50%',{...off,temporal:.5}],
    ['+ reconstrução neural 100%',{...off,neural:1}],
    ['+ FSR EASU '+upscale+'p',{...off,output:upscale}],
    ['padrão v9 nativo 1080p',{...off,...def}],
    ['padrão v9 '+upscale+'p (Auto no Poco)',{...off,...def,output:upscale}],
    ['padrão v9 nativo, modo Qualidade (16F)',{...off,...def,processingMode:'quality'}],
  ];
  // Spec 4, task 1: what WebGPU offers on this browser (adapter, features, limits). Nothing is rendered.
  async function probeWebGPU(){
    if(!navigator.gpu)return {available:false,reason:'navigator.gpu ausente'};
    try{// Some headless/blocklisted setups never settle the request: give up after 5 s.
      const adapter=await Promise.race([navigator.gpu.requestAdapter({powerPreference:'high-performance'}),new Promise((_,no)=>setTimeout(()=>no(new Error('requestAdapter sem resposta em 5 s')),5000))]);if(!adapter)return {available:false,reason:'sem adaptador'};
      const info=adapter.info||(adapter.requestAdapterInfo?await adapter.requestAdapterInfo():{}),limits={};
      for(const k of ['maxTextureDimension2D','maxComputeWorkgroupSizeX','maxComputeWorkgroupSizeY','maxComputeInvocationsPerWorkgroup','maxComputeWorkgroupStorageSize','maxStorageTexturesPerShaderStage','maxBindGroups'])limits[k]=adapter.limits[k];
      return {available:true,vendor:info.vendor||null,architecture:info.architecture||null,device:info.device||null,description:info.description||null,
        features:[...adapter.features].sort(),timestampQuery:adapter.features.has('timestamp-query'),shaderF16:adapter.features.has('shader-f16'),limits,
        importExternalTexture:typeof GPUDevice!=='undefined'&&'importExternalTexture' in GPUDevice.prototype};
    }catch(e){return {available:false,reason:String(e.message||e)};}
  }
  const frame=()=>new Promise(requestAnimationFrame),pixel=new Uint8Array(4);
  const median=a=>{const s=[...a].sort((x,y)=>x-y);return s.length?s[(s.length-1)>>1]:null;};
  const p95=a=>{const s=[...a].sort((x,y)=>x-y);return s.length?s[Math.ceil(s.length*.95)-1]:null;};
  async function run(){
    if(!gl){log.textContent='WebGL2 indisponível';return;}
    const engine=new BxRestoration.Engine(gl,BxShaders),source=params.get('video')?await videoSource(params.get('video')):syntheticSource();
    const w=source.videoWidth||source.width,h=source.videoHeight||source.height,debug=gl.getExtension('WEBGL_debug_renderer_info');
    const rows=[];let t=0;
    for(const [name,raw] of configs){
      const settings=BxRestoration.normalize(raw),size=BxRestoration.outputSize(w,h,settings.output);
      canvas.width=size.width;canvas.height=size.height;engine.resetBudget();
      const timer=[];const sample=engine.budget.sample.bind(engine.budget);engine.budget.sample=(ms,mode)=>{timer.push(ms);sample(ms,mode);};
      log.textContent='Medindo: '+name;
      for(let i=0;i<20;i++){engine.render(source,size.width,size.height,settings,t+=1/60);await frame();}
      timer.length=0;const batches=[],N=10,start=performance.now();
      while(performance.now()-start<duration){
        const t0=performance.now();
        for(let i=0;i<N;i++)engine.render(source,size.width,size.height,settings,t+=1/60);
        gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);batches.push((performance.now()-t0)/N);
        engine.poll();await frame();
      }
      for(let i=0;i<6;i++){await frame();engine.poll();}
      rows.push({name,settings:raw,source:[w,h],output:[size.width,size.height],batches:batches.length,msPerFrame:median(batches),msPerFrameP95:p95(batches),timerP50:median(timer),timerCount:timer.length});
      engine.budget.sample=sample;
    }
    const base=rows[1].msPerFrame,baseTimer=rows[1].timerP50;
    for(const r of rows){r.deltaMs=r.msPerFrame-base;r.timerDeltaMs=r.timerP50!=null&&baseTimer!=null?r.timerP50-baseTimer:null;}
    report={schema:1,tool:'stage-cost',webgpu:await probeWebGPU(),build:globalThis.BxBuild??null,userAgent:navigator.userAgent,renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),
      timerQuery:!!engine.ext,floatTargets:engine.floatTargets,source:params.get('video')?'video':'synthetic',durationPerConfigMs:duration,method:'N=10 renders + 1px readPixels per batch; median of batches',rows};
    engine.destroy();
    const f=v=>v==null?'—':v.toFixed(2);
    table.innerHTML='<tr><th>Configuração</th><th>Saída</th><th>ms/quadro</th><th>Δ base</th><th>timer p50</th><th>Δ timer</th></tr>'+rows.map(r=>`<tr><td>${r.name}</td><td>${r.output.join('×')}</td><td>${f(r.msPerFrame)}</td><td>${f(r.deltaMs)}</td><td>${f(r.timerP50)}</td><td>${f(r.timerDeltaMs)}</td></tr>`).join('');
    log.textContent='Pronto. Renderer: '+report.renderer+(report.timerQuery?' (com timer de GPU)':' (sem timer de GPU: só vazão)')+'\nWebGPU: '+(report.webgpu.available?`${report.webgpu.vendor||'?'} ${report.webgpu.architecture||''}; timestamp-query ${report.webgpu.timestampQuery?'sim':'não'}; shader-f16 ${report.webgpu.shaderF16?'sim':'não'}`:'indisponível ('+report.webgpu.reason+')');
    document.title='done';
  }
  document.querySelector('#run').onclick=()=>run().catch(e=>{log.textContent='Erro: '+e.message;document.title='error';});
  document.querySelector('#save').onclick=()=>{if(report)BxRestoration.downloadReport(report);};
  if(params.has('auto'))document.querySelector('#run').click();
  globalThis.stageCostReport=()=>report;
})();

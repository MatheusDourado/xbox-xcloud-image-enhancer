from pathlib import Path

# Spec 4: the WebGPU renderer against the shipped WebGL2 engine, on the same input bytes, for every path the
# WebGPU renderer draws. Both read back as WebGL2 readPixels does (bottom row first). Without a WebGPU
# adapter the suite reports itself skipped (run-browser-tests.py launches it with the SwiftShader adapter).
html = r'''<!doctype html><meta charset="utf-8"><pre id="result">Running</pre>
<script src="../restoration.bundle.js"></script><script>
(async()=>{
 const checks=[],failures=[],report={};
 function check(ok,name,details){(ok?checks:failures).push({name,details});}
 const done=extra=>{document.getElementById('result').textContent=JSON.stringify({passed:checks,failures,...extra});};
 try{
 const adapter=navigator.gpu&&await navigator.gpu.requestAdapter();
 if(!adapter){check(true,'WebGPU unavailable here: suite skipped');done({skipped:true,reason:'no adapter'});return;}
 const W=128,H=96,OW=192,OH=144;
 const input=document.createElement('canvas');input.width=W;input.height=H;const ctx=input.getContext('2d');
 {const img=ctx.createImageData(W,H);let seed=7;const rnd=()=>(seed=(seed*1103515245+12345)&0x7fffffff)/0x7fffffff;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=(y*W+x)*4,ramp=40+x*.6+y*.2;let r=ramp,g=ramp+10,b=ramp*1.2;
   if(x>=64&&x<96){r=x%9<4?200:40;g=y%7<3?60:180;b=90;}if(x>=96){const n=rnd()*24-12;r=120+n;g=110+(y%4)*3+n;b=100+(x%3)*5;}if(x%17===0){r+=6;g-=4;}
   if(y>70&&x<40){r=g=b=x<20?50:62;}
   img.data[i]=r;img.data[i+1]=g;img.data[i+2]=b;img.data[i+3]=255;}
  ctx.putImageData(img,0,0);}
 const glc=document.createElement('canvas'),gl=glc.getContext('webgl2',{preserveDrawingBuffer:true,antialias:false});
 const glE=new BxRestoration.Engine(gl,BxShaders,{spatialPrecision:'highp'});
 const gpc=document.createElement('canvas');gpc.width=OW;gpc.height=OH;
 const t0=performance.now();let gpu;
 try{gpu=await BxWebGPU.create(gpc,{readable:true});}catch(e){if(!e.unavailable)throw e;check(true,'WebGPU device unavailable here: suite skipped');done({skipped:true,reason:String(e.message)});return;}
 report.createMs=Math.round(performance.now()-t0);
 report.adapter=gpu.adapter;report.gl=gl.getParameter((gl.getExtension('WEBGL_debug_renderer_info')||{}).UNMASKED_RENDERER_WEBGL||gl.RENDERER);report.format=gpu.format;report.timestamps=gpu.timestamps;
 const errors=[];gpu.onfail=r=>errors.push(r);
 const glRead=(name)=>{const t=name?glE.targets[name]:null;gl.bindFramebuffer(gl.FRAMEBUFFER,t?t.fbo:null);const w=t?t.w:glc.width,h=t?t.h:glc.height,p=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,p);gl.bindFramebuffer(gl.FRAMEBUFFER,null);return p;};
 const diff=(a,b)=>{if(a.length!==b.length)return {size:[a.length,b.length]};let max=0,sum=0,over1=0,n=0;for(let i=0;i<a.length;i++){if((i&3)===3)continue;const d=Math.abs(a[i]-b[i]);n++;sum+=d;if(d>max)max=d;if(d>1)over1++;}return {max,mean:+(sum/n).toFixed(5),over1Pct:+(over1*100/n).toFixed(4)};};
 // Tolerance. Same GPU: the WGSL ports are f32 and the GLSL highp, so only rounding at threshold steps may
 // differ. When WebGL2 and the WebGPU adapter are different devices (Chromium headless exposes WebGPU only as
 // SwiftShader next to a real GPU for WebGL2), filtering and float rounding differ too: the bound of the
 // Spec 3 mediump check (mean 0.04 level, 0.03% of values above 1 level) times about three.
 const glName=String(report.gl||''),sameDevice=/swiftshader/i.test(glName)===(gpu.adapter.architecture==='swiftshader');report.sameDevice=sameDevice;
 const close=d=>d.size===undefined&&(sameDevice?d.mean<=.02&&d.over1Pct<=.1:d.mean<=.1&&d.over1Pct<=.5);
 const base={gpuBudget:0,cleanup:0,deband:0,chroma:0,detail:0,sharpness:2};
 const cases=[['Spec 3 defaults, native',{deband:.6,chroma:.75},'native'],['v9 defaults, native',{cleanup:.5,deband:.3,chroma:.75,detail:.2,sharpness:3},'native'],
  ['all spatial filters + fused AA',{cleanup:.5,deband:.6,chroma:.75,detail:.2,antialias:.5},'native'],['legacy spatial mode',{cleanup:.5,deband:.6,spatialMode:'legacy'},'native'],
  ['EASU + casFiltered',{deband:.6,chroma:.75},'144'],['SGSR',{deband:.6,chroma:.75,scaler:'sgsr'},'144'],['SGSR from the upload',{scaler:'sgsr'},'144'],
  ['CAS method',{deband:.3,processing:'cas',sharpening:'native'},'native'],['Quality mode (16F targets)',{deband:.6,chroma:.75,processingMode:'quality'},'144'],
  ['RCAS',{sharpening:'rcas',sharpness:5,deband:.3},'144'],['CAS-only reference',{mode:'cas',sharpness:3},'144'],['original',{mode:'original'},'native'],
  ['diagnostic tint',{deband:.3},'144',true],['nothing to do',{},'native'],['sharpness 0',{sharpness:0,deband:.6},'native'],['luma off, USM 6',{sharpness:6,lumaSharpen:false,chroma:.75},'native']];
 report.cases={};
 for(const [name,s,output,diag] of cases){const o=BxRestoration.outputSize(W,H,output);glc.width=gpc.width=o.width;glc.height=gpc.height=o.height;const st={...base,...s,output};
  glE.render(input,o.width,o.height,st,1,!!diag);const a=glRead();
  const ok=gpu.render(input,o.width,o.height,st,1,!!diag);const b=ok?await gpu.read('canvas'):new Uint8Array(0);
  const d=diff(a,b);report.cases[name]=d;check(ok&&close(d),'WebGPU matches WebGL2: '+name,d);}
 // Fluidez: the last pass deferred to present(), straight to the canvas, through the pacer slots.
 {const o=BxRestoration.outputSize(W,H,'144');glc.width=gpc.width=o.width;glc.height=gpc.height=o.height;const st={...base,deband:.6,chroma:.75,output:'144'};
  const bad=[];for(let f=0;f<6;f++){glE.render(input,o.width,o.height,st,1+f/30,false,'pacedG'+(f%3),true);glE.present('pacedG'+(f%3));const a=glRead();
   gpu.render(input,o.width,o.height,st,1+f/30,false,'paced'+(f%3),true);gpu.present('paced'+(f%3));const d=diff(a,await gpu.read('canvas'));if(!close(d))bad.push({f,d});}
  check(!bad.length,'Deferred last pass in present() matches WebGL2 across pacer slots',bad);
  check(Object.keys(gpu.targets).filter(k=>k.startsWith('paced')).length===3,'Pacer slots survive reuse',Object.keys(gpu.targets));
  gpu.releasePaced();glE.releasePaced();}
 // Decoded-frame path: a VideoFrame imported without a copy (texture_external). With spatial filters the fused
 // compute pass reads it into workgroup tiles; without them, or with compute off, the copy pass converts it once.
 if(typeof VideoFrame==='function'){const bad=[];report.videoFrame={};
  for(const [name,s,output] of [['Spec 3 defaults',{deband:.6,chroma:.75},'native'],['v9 defaults',{cleanup:.5,deband:.3,chroma:.75,detail:.2,sharpness:3},'native'],
   ['all filters + AA',{cleanup:.5,deband:1,chroma:.75,detail:.2,antialias:.5},'native'],['EASU',{deband:.6,chroma:.75},'144'],['Quality',{deband:.6,processingMode:'quality'},'144'],['no spatial',{},'144']]){
   const o=BxRestoration.outputSize(W,H,output);glc.width=gpc.width=o.width;glc.height=gpc.height=o.height;const st={...base,...s,output};
   glE.render(input,o.width,o.height,st,1);const a=glRead();
   for(const compute of [true,false]){gpu.computeSpatial=compute;const frame=new VideoFrame(input,{timestamp:0});const ok=gpu.render(frame,o.width,o.height,st,1);frame.close();
    const d=diff(a,ok?await gpu.read('canvas'):new Uint8Array(0));report.videoFrame[name+(compute?' compute':' copy')]=d;if(!ok||!close(d))bad.push({name,compute,d});}}
  gpu.computeSpatial=true;check(!bad.length,'VideoFrame through importExternalTexture (compute tile and copy) matches the canvas upload',bad);}
 // Frames the WebGPU renderer hands back: neural restoration and temporal stay in WebGL2.
 for(const s of [{temporal:.5},{neural:1}]){const st={...base,...s,output:'native'};check(!gpu.supports(st,W,H,W,H)&&!gpu.render(input,W,H,st,1),'WebGPU hands back '+Object.keys(s)[0],s);}
 check(gpu.supports({...base,deband:.6,output:'native'},W,H,W,H),'WebGPU draws the default frame');
 // Pipeline variants: a new spatial profile draws with the generic pipeline until its variant is ready, same bytes.
 {glc.width=gpc.width=W;glc.height=gpc.height=H;const st={...base,deband:.3,detail:.1,cleanup:.2,output:'native'};
  glE.render(input,W,H,st,1);const a=glRead();gpu.render(input,W,H,st,1);const g=await gpu.read('canvas');
  await new Promise(r=>setTimeout(r,300));gpu.render(input,W,H,st,1);const v=await gpu.read('canvas');
  check(close(diff(a,g))&&close(diff(a,v)),'Generic spatial pipeline and its variant both match WebGL2',{generic:diff(a,g),variant:diff(a,v)});}
 // GPU time from timestamp-query feeds the budget like the WebGL2 timer.
 if(gpu.timestamps){const st={...base,deband:.6,output:'native',gpuBudget:3};for(let i=0;i<8;i++){gpu.render(input,W,H,st,1);await new Promise(r=>setTimeout(r,20));}
  gpu.poll();check(gpu.budget.values.length>0&&gpu.budget.values.every(v=>v>=0&&v<100),'timestamp-query samples reach the budget',gpu.budget.values.slice(0,4));}
 // A validation error stops the renderer (the owner falls back to WebGL2): no silent drawing after it.
 check(!errors.length,'No WebGPU errors',errors);
 {const failed=[];const e2c=document.createElement('canvas');e2c.width=W;e2c.height=H;const e2=await BxWebGPU.create(e2c);e2.onfail=r=>failed.push(r);e2.fail('test');
  check(failed.length===1&&!e2.render(input,W,H,{...base,output:'native'},1),'A failed WebGPU renderer reports once and stops drawing',failed);e2.destroy();}
 gpu.destroy();glE.destroy();
 done({report});
 }catch(e){failures.push({name:'exception',details:String(e&&e.stack||e)});done({report});}
})();
</script>'''
Path('output/playwright').mkdir(parents=True, exist_ok=True)
Path('output/playwright/webgpu-equivalence.html').write_text(html, encoding='utf-8')

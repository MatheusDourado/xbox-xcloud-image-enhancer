from pathlib import Path

# Pixel regressions run against the shipped engine, not a shader reimplementation.
html = r'''<!doctype html><meta charset="utf-8"><pre id="result">Running</pre>
<script src="../restoration.bundle.js"></script><script>
(()=>{
 const checks=[],failures=[];
 function check(ok,name,details){(ok?checks:failures).push({name,details});}
 const canvas=document.createElement('canvas');canvas.width=128;canvas.height=96;
 const gl=canvas.getContext('webgl2',{preserveDrawingBuffer:true,antialias:false});
 const engine=new BxRestoration.Engine(gl,BxShaders);
 const input=document.createElement('canvas');input.width=128;input.height=96;const ctx=input.getContext('2d');
 function pixels(){const p=new Uint8Array(128*96*4);gl.readPixels(0,0,128,96,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;}
 function render(s,time=1){engine.render(input,128,96,{gpuBudget:0,cleanup:0,deband:0,chroma:0,detail:0,output:'native',sharpness:0,...s},time);return pixels();}
 function step(a,b){ctx.fillStyle=`rgb(${a},${a},${a})`;ctx.fillRect(0,0,64,96);ctx.fillStyle=`rgb(${b},${b},${b})`;ctx.fillRect(64,0,64,96);}
 step(100,120);
 for(const processing of ['cas','usm','rcas'])for(const processingMode of ['performance','quality']){
  // Halo margin scales with strength: +-4 levels at 2 (previous fixed bound), +-12 at 10.
  for(const [sharpness,margin] of [[2,4],[10,12]]){
   const p=render({processing,sharpening:processing==='rcas'?'rcas':'native',processingMode,sharpness});const edge=[];
   for(let x=60;x<68;x++)edge.push(p[(40*128+x)*4]);
   check(Math.min(...edge)>=100-margin&&Math.max(...edge)<=120+margin,'Halo bound '+processing+' '+processingMode+' '+sharpness,edge);
  }
 }
 // An averaged compression boundary has a fractional code value before presentation.
 step(50,62);const p=render({cleanup:1,deband:.3});
 const column=Array.from({length:80},(_,y)=>p[((y+8)*128+64)*4]);
 check(new Set(column).size>1,'Dither survives the complete native-resolution pipeline',{levels:[...new Set(column)]});
 const qualityPixels=render({cleanup:1,deband:.3,processingMode:'quality'});
 const qualityLevels=new Set(Array.from({length:80},(_,y)=>qualityPixels[((y+8)*128+64)*4]));
 check(qualityLevels.size>1,'Quality pipeline dithers fractional levels at presentation',[...qualityLevels]);
 // A subtle, isolated texture extremum must not be classified as a smooth gradient.
 ctx.fillStyle='rgb(100,100,100)';ctx.fillRect(0,0,128,96);
 ctx.fillStyle='rgb(104,104,104)';ctx.fillRect(64,0,1,96);
 const texture=render({deband:1});
 check(Math.abs(texture[(40*128+64)*4]-104)<=1,'Debanding preserves low-contrast thin texture',texture[(40*128+64)*4]);
 // Isoluminant colored fine text can evade a luma-only extremum detector.
 ctx.fillStyle='rgb(100,100,100)';ctx.fillRect(0,0,128,96);
 ctx.fillStyle='rgb(108,98,100)';ctx.fillRect(64,0,1,96);
 const legacy=render({deband:1,spatialMode:'legacy'}),selective=render({deband:1});
 check(Math.abs(selective[(40*128+64)*4]-108)<Math.abs(legacy[(40*128+64)*4]-108),'Selective cleanup protects isoluminant color detail',{legacy:legacy[(40*128+64)*4],selective:selective[(40*128+64)*4]});
 // Constant ramp must not be interpreted as a block discontinuity.
 for(let x=0;x<128;x++){ctx.fillStyle=`rgb(${50+x},${50+x},${50+x})`;ctx.fillRect(x,0,1,96);}
 const ramp=render({cleanup:1});
 check(Array.from({length:100},(_,x)=>ramp[(40*128+x+14)*4]===64+x).every(Boolean),'Cleanup preserves continuous ramp');
 for(const level of [0,100,255]){
  ctx.fillStyle=`rgb(${level},${level},${level})`;ctx.fillRect(0,0,128,96);
  const uniform=render({sharpening:'rcas',sharpness:10});
  check(uniform.every((v,i)=>i%4===3||Math.abs(v-level)<=1),'RCAS uniform '+level);
 }
 step(100,120);const bypass=render({sharpening:'rcas',sharpness:0});
 check(bypass[(40*128+63)*4]===100&&bypass[(40*128+64)*4]===120,'RCAS zero strength bypass');
 // v8.5: 4:2:0-like color edge. Luma steps at x=64; chroma ramps over 4 columns.
 const toRgb=(Y,cb,cr)=>{const B=cb+Y,R=cr+Y,G=(Y-.2126*R-.0722*B)/.7152;return [R,G,B].map(v=>Math.round(Math.min(255,Math.max(0,v))));};
 for(let x=0;x<128;x++){const t=Math.min(1,Math.max(0,(x-62.5)/2)),Y=x<64?70:130;const [r,g,b]=toRgb(Y,-10+t*-30,-5+t*70);ctx.fillStyle=`rgb(${r},${g},${b})`;ctx.fillRect(x,0,1,96);}
 const chromaErr=px=>{let e=0;for(let x=60;x<68;x++){const i=(40*128+x)*4,Y=.2126*px[i]+.7152*px[i+1]+.0722*px[i+2],ideal=x<64?[-10,-5]:[-40,65];e+=Math.abs(px[i+2]-Y-ideal[0])+Math.abs(px[i]-Y-ideal[1]);}return e;};
 const blurred=render({}),guided=render({chroma:1});
 check(chromaErr(guided)<chromaErr(blurred)*.7,'Chroma from luma sharpens blurred 4:2:0 color edge',{before:chromaErr(blurred),after:chromaErr(guided)});
 // Isoluminant color detail has no luma guide and must keep decoded color.
 ctx.fillStyle='rgb(100,100,100)';ctx.fillRect(0,0,128,96);ctx.fillStyle='rgb(108,98,100)';ctx.fillRect(64,0,1,96);
 const iso=render({chroma:1});check(Math.abs(iso[(40*128+64)*4]-108)<=1,'Chroma reconstruction preserves isoluminant color line',iso[(40*128+64)*4]);
 // Low-contrast texture gains amplitude with detail; flat noise and edge ringing do not.
 for(let x=0;x<128;x++){const v=100+(x%6<3?6:-6);ctx.fillStyle=`rgb(${v},${v},${v})`;ctx.fillRect(x,0,1,96);}
 const amp=px=>{let lo=255,hi=0;for(let x=20;x<100;x++){const v=px[(40*128+x)*4];lo=Math.min(lo,v);hi=Math.max(hi,v);}return hi-lo;};
 const flatTex=render({}),detailTex=render({detail:1});check(amp(detailTex)>amp(flatTex),'Detail raises low-contrast texture amplitude',{before:amp(flatTex),after:amp(detailTex)});
 let seed=7;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
 for(let y=0;y<96;y++)for(let x=0;x<128;x++){const v=100+Math.round(rnd()*2-1);ctx.fillStyle=`rgb(${v},${v},${v})`;ctx.fillRect(x,y,1,1);}
 const sd=px=>{let a=[];for(let y=20;y<76;y++)for(let x=20;x<108;x++)a.push(px[(y*128+x)*4]);const m=a.reduce((s,v)=>s+v,0)/a.length;return Math.sqrt(a.reduce((s,v)=>s+(v-m)**2,0)/a.length);};
 const noise0=render({}),noise1=render({detail:1});check(sd(noise1)<=sd(noise0)*1.1,'Detail coring does not amplify faint noise',{before:sd(noise0),after:sd(noise1)});
 ctx.fillStyle='rgb(50,50,50)';ctx.fillRect(0,0,64,96);ctx.fillStyle='rgb(200,200,200)';ctx.fillRect(64,0,64,96);
 ctx.fillStyle='rgb(53,53,53)';ctx.fillRect(61,0,1,96);ctx.fillStyle='rgb(47,47,47)';ctx.fillRect(62,0,1,96);
 const ring0=render({}),ring1=render({detail:1});const ringAmp=px=>Math.max(...[59,60,61,62].map(x=>Math.abs(px[(40*128+x)*4]-50)));
 check(ringAmp(ring1)<=ringAmp(ring0)+1,'Detail does not amplify ringing beside a strong edge',{before:ringAmp(ring0),after:ringAmp(ring1)});
 step(100,120);const stepDetail=render({detail:1});check(Array.from({length:8},(_,i)=>stepDetail[(40*128+60+i)*4]).every(v=>v>=96&&v<=124),'Detail overshoot stays within CAS halo bound at a step',Array.from({length:8},(_,i)=>stepDetail[(40*128+60+i)*4]));
 // Count real draw submissions to protect the low-cost default and bypass paths.
 const draw=engine.draw.bind(engine);let passes=[];engine.draw=(name,...args)=>{passes.push(name);return draw(name,...args);};
 render({cleanup:.35,deband:.3,chroma:.5,detail:.35,sharpness:2});
 check(passes.length<=2,'Default native pipeline uses at most two passes',passes);
 passes=[];render({sharpening:'rcas',sharpness:2,cleanup:.35,deband:.3});check(passes.length===2,'RCAS retains two passes',passes);
 passes=[];render({cleanup:.35,deband:1,chroma:.5,detail:.35,antialias:1,sharpness:2});check(passes.length===2&&!passes.includes('antialias'),'AA is fused into the spatial pass without temporal',passes);
 passes=[];render({antialias:1,temporal:.3},2);check(passes.includes('antialias'),'Temporal keeps AA as a separate pass after history',passes);
 passes=[];render({neural:1,cleanup:.5,deband:.3,chroma:.75,detail:.2,sharpness:2});check(passes.map(p=>p.split('@')[0]).join()==='nnFeatures,nnApply,spatial,casFiltered','Neural restoration adds two passes before the spatial pass',passes);
 passes=[];render({});check(passes.length===1,'Disabled treatments bypass intermediate passes',passes);
 check(Object.keys(engine.targets).length===0,'Disabled treatments release unused intermediate textures',Object.keys(engine.targets));
 {let seed=7;const rnd=()=>(seed=(seed*1103515245+12345)%2147483648)/2147483648;
  for(let y=0;y<96;y+=2)for(let x=0;x<128;x+=2){const v=Math.round(110+(rnd()*2-1)*8);ctx.fillStyle=`rgb(${v},${v},${v})`;ctx.fillRect(x,y,2,2);}
  const hp=(b,i)=>4*b[i]-b[i-4]-b[i+4]-b[i-512]-b[i+512];const src=render({mode:'original'});
  const gain=b=>{let s=0,r=0;for(let y=4;y<92;y++)for(let x=4;x<124;x++){const i=(y*128+x)*4;s+=hp(b,i)*hp(src,i);r+=hp(src,i)**2;}return s/r;};
  const ref=gain(render({mode:'cas',sharpness:2})),two=gain(render({sharpness:2})),six=gain(render({sharpness:6}));
  check(two>=ref*.7&&six>ref,'Filtered sharpness reaches beyond the CAS-only reference at the same scale',{ref,two,six});}
 // Luma-only sharpening: a colored edge gains contrast without changing its chroma.
 ctx.fillStyle='rgb(150,60,60)';ctx.fillRect(0,0,64,96);ctx.fillStyle='rgb(60,60,150)';ctx.fillRect(64,0,64,96);
 {const chroma=(b,x)=>{const i=(40*128+x)*4,y=.2126*b[i]+.7152*b[i+1]+.0722*b[i+2];return [b[i]-y,b[i+2]-y];};
  const flat=render({mode:'original'}),luma=render({sharpening:'usm',lumaSharpen:true,sharpness:6}),rgb=render({sharpening:'usm',lumaSharpen:false,sharpness:6});
  const drift=b=>Math.max(...[62,63,64,65].map(x=>{const [r,u]=chroma(b,x),[r0,u0]=chroma(flat,x);return Math.max(Math.abs(r-r0),Math.abs(u-u0));}));
  check(drift(luma)<=2&&drift(rgb)>drift(luma),'Luma-only sharpening keeps edge chroma',{luma:drift(luma),rgb:drift(rgb)});}
 // Neural restoration changes luma only and does nothing to a flat field.
 ctx.fillStyle='rgb(90,90,90)';ctx.fillRect(0,0,128,96);
 {const flat=render({neural:1});check(Math.abs(flat[(40*128+64)*4]-90)<=2,'Neural restoration keeps a flat field',flat[(40*128+64)*4]);}
 step(60,140);{const off=render({}),on=render({neural:1});check(on.some((v,i)=>v!==off[i]),'Neural restoration changes an edge');}
 // Force the optional float-target capability off; this still uses real WebGL rendering.
 const getExtension=gl.getExtension.bind(gl);gl.getExtension=name=>name==='EXT_color_buffer_float'?null:getExtension(name);
 const fallback=new BxRestoration.Engine(gl,BxShaders);gl.getExtension=getExtension;
 step(50,62);fallback.render(input,128,96,{gpuBudget:0,cleanup:1,deband:.3,sharpness:0,processingMode:'quality'},1);
 const fp=pixels(),levels=new Set(Array.from({length:80},(_,y)=>fp[((y+8)*128+64)*4]));
 check(levels.size>1,'RGBA8 fallback retains dithered gradient levels',[...levels]);
 passes=[];const fdraw=fallback.draw.bind(fallback);fallback.draw=(name,...args)=>{passes.push(name);return fdraw(name,...args);};
 fallback.render(input,128,96,{gpuBudget:0,neural:1,cleanup:0,deband:0,chroma:0,detail:0},2);check(!passes.includes('nnFeatures'),'Neural restoration is skipped without float render targets',passes);
 // With every spatial treatment disabled, RCAS reference must use exactly the same shader.
 step(70,95);
 const rcasOnly={gpuBudget:0,cleanup:0,deband:0,chroma:0,detail:0,temporal:0,antialias:0,neural:0,sharpening:'rcas',sharpness:7};
 engine.render(input,128,96,{...rcasOnly,mode:'filtered'},3);const rcasFiltered=pixels();
 engine.render(input,128,96,{...rcasOnly,mode:'cas'},3);const rcasReference=pixels();
 check(rcasReference.every((v,i)=>v===rcasFiltered[i]),'RCAS reference keeps the selected sharpening algorithm');
 engine.render(input,128,96,{...rcasOnly,mode:'original'},3);const plain=pixels();
 engine.render(input,128,96,{...rcasOnly,mode:'original',sharpening:'cas'},3);const plainCas=pixels();
 check(plain.every((v,i)=>v===plainCas[i]),'Original stays unsharpened with RCAS selected');
 // Spec 3 item 5: SGSR 1 as the one last pass when scaling up; the EASU path stays as it was and is the default.
 {const OW=192,OH=144,off={gpuBudget:0,cleanup:0,deband:0,chroma:0,detail:0,output:'144',sharpness:2};
  const up=(s,diag=false)=>{passes=[];const nat=s.output==='native';engine.render(input,nat?128:OW,nat?96:OH,{...off,...s},5,diag,'pacedS');const t=engine.targets.pacedS;gl.bindFramebuffer(gl.FRAMEBUFFER,t.fbo);const p=new Uint8Array(t.w*t.h*4);gl.readPixels(0,0,t.w,t.h,gl.RGBA,gl.UNSIGNED_BYTE,p);return {p,passes:passes.slice(),w:t.w,h:t.h};};
  const same=(a,b)=>a.p.length===b.p.length&&a.p.every((v,i)=>v===b.p[i]);
  const e0=up({}),e1=up({scaler:'easu'}),e2=up({scaler:'bogus'});
  check(e0.passes.join()==='easu,casFiltered'&&same(e0,e1)&&same(e0,e2),'EASU + sharpening stays the default scaling path, byte for byte',e0.passes);
  const g=up({scaler:'sgsr'});check(g.passes.join()==='sgsr'&&g.w===OW&&g.h===OH,'SGSR replaces EASU and sharpening with one pass at output size',{passes:g.passes,w:g.w,h:g.h});
  check(!same(g,e0),'SGSR output differs from EASU');
  const gf=up({scaler:'sgsr',deband:.6,chroma:.75});check(gf.passes.length===2&&gf.passes[1]==='sgsr'&&gf.passes[0].startsWith('spatial'),'SGSR follows the spatial pass',gf.passes);
  const n0=up({output:'native'}),n1=up({output:'native',scaler:'sgsr'});check(n1.passes.join()==='casFiltered'&&same(n0,n1),'At native output SGSR keeps the current sharpening pass',n1.passes);
  // Finite output: SGSR straight into a float target on a noisy frame with flat areas.
  if(engine.floatTargets){const f={texture:gl.createTexture(),fbo:gl.createFramebuffer()};gl.bindTexture(gl.TEXTURE_2D,f.texture);gl.texStorage2D(gl.TEXTURE_2D,1,gl.RGBA32F,OW,OH);gl.bindFramebuffer(gl.FRAMEBUFFER,f.fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,f.texture,0);engine.draw('sgsr',f,OW,OH,{source:engine.input},{...BxRestoration.sgsrParams(2),brightness:1,contrast:1,saturation:1,shadows:0,deband:0,diagnostic:false});
   gl.bindFramebuffer(gl.FRAMEBUFFER,f.fbo);const v=new Float32Array(OW*OH*4);gl.readPixels(0,0,OW,OH,gl.RGBA,gl.FLOAT,v);
   gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.deleteFramebuffer(f.fbo);gl.deleteTexture(f.texture);check(v.every(x=>Number.isFinite(x)&&x>=0&&x<=1),'SGSR output is finite and within 0..1 (no NaN)');}
  for(const level of [0,100,255]){ctx.fillStyle=`rgb(${level},${level},${level})`;ctx.fillRect(0,0,128,96);
   const f=up({scaler:'sgsr',sharpness:10});check(f.p.every((v,i)=>i%4===3||Math.abs(v-level)<=1),'SGSR uniform '+level);}
  step(100,120);{const s=up({scaler:'sgsr',sharpness:10}),row=Array.from({length:OW},(_,x)=>s.p[(60*OW+x)*4]);
   check(Math.min(...row)>=99&&Math.max(...row)<=121,'SGSR never overshoots the local range at a step',[Math.min(...row),Math.max(...row)]);}
  // It takes over the finishing of the sharpening pass: dither of fractional levels and the diagnostic tint.
  step(50,62);{const d=up({scaler:'sgsr',cleanup:1,deband:.3}),col=new Set(Array.from({length:120},(_,y)=>d.p[((y+12)*OW+96)*4]));
   check(col.size>1,'SGSR dithers fractional levels at presentation',[...col]);}
  ctx.fillStyle='rgb(100,100,100)';ctx.fillRect(0,0,128,96);{const t=up({scaler:'sgsr'},true),i=(70*OW+96)*4;check(t.p[i]>t.p[i+1]+60,'SGSR applies the diagnostic tint',[t.p[i],t.p[i+1],t.p[i+2]]);}
  // The Nitidez slider still acts: more sharpness, more high-frequency gain against plain scaling.
  {let seed=11;const rnd=()=>(seed=(seed*1103515245+12345)%2147483648)/2147483648;
   for(let y=0;y<96;y+=2)for(let x=0;x<128;x+=2){const v=Math.round(110+(rnd()*2-1)*30);ctx.fillStyle=`rgb(${v},${v},${v})`;ctx.fillRect(x,y,2,2);}
   const hp=b=>{let s=0;for(let y=4;y<OH-4;y++)for(let x=4;x<OW-4;x++){const i=(y*OW+x)*4;s+=Math.abs(4*b[i]-b[i-4]-b[i+4]-b[i-OW*4]-b[i+OW*4]);}return s;};
   const s0=hp(up({scaler:'sgsr',sharpness:0}).p),s2=hp(up({scaler:'sgsr',sharpness:2}).p),s6=hp(up({scaler:'sgsr',sharpness:6}).p);
   check(s6>s2&&s2>s0*.9,'SGSR strength follows the Nitidez slider',{s0,s2,s6});}}
 // Spec 3 item 8: with Fluidez the last pass runs in present(), straight to the canvas. Same bytes as
 // drawing it at render time, one full-screen pass less, on every path that feeds the last pass.
 {const c2=document.createElement('canvas'),g2=c2.getContext('webgl2',{preserveDrawingBuffer:true,antialias:false});
  const direct=new BxRestoration.Engine(g2,BxShaders),deferred=new BxRestoration.Engine(g2,BxShaders);
  let count=0;const d0=deferred.draw.bind(deferred);deferred.draw=(...a)=>{count++;return d0(...a);};
  const read=()=>{const p=new Uint8Array(c2.width*c2.height*4);g2.readPixels(0,0,c2.width,c2.height,g2.RGBA,g2.UNSIGNED_BYTE,p);return p;};
  {const img=ctx.createImageData(128,96);let seed=5;const rnd=()=>(seed=(seed*1103515245+12345)&0x7fffffff)/0x7fffffff;
   for(let i=0;i<img.data.length;i+=4){const x=(i/4)%128,y=Math.floor(i/512),v=x<64?40+x+y*.3:100+rnd()*60;img.data[i]=v;img.data[i+1]=v*.9+10;img.data[i+2]=x%7<3?200:v;img.data[i+3]=255;}ctx.putImageData(img,0,0);}
  const base={gpuBudget:0,cleanup:0,deband:0,chroma:0,detail:0,sharpness:2};
  const cases=[['filters native',{deband:.6,chroma:.75},'native'],['nothing to do',{},'native'],['temporal history',{temporal:.5,deband:.3},'native'],['temporal + AA',{temporal:.5,antialias:.5},'native'],
   ['EASU upscale',{deband:.6,chroma:.75},'144'],['SGSR upscale',{deband:.6,chroma:.75,scaler:'sgsr'},'144'],['SGSR from the upload',{scaler:'sgsr'},'144'],['quality targets',{deband:.6,processingMode:'quality'},'144'],
   ['only sharpening',{mode:'cas'},'native'],['original',{mode:'original'},'native'],['rcas',{sharpening:'rcas',sharpness:5,deband:.3},'144'],['diagnostic',{deband:.3},'144',true]];
  const bad=[],passes={};
  for(const [name,s,output,diag] of cases){const o=BxRestoration.outputSize(128,96,output);c2.width=o.width;c2.height=o.height;direct.resetHistory();deferred.resetHistory();
   for(let f=0;f<3;f++){const st={...base,...s,output},t=1+f/30;
    count=0;deferred.render(input,o.width,o.height,st,t,!!diag,'pacedD'+(f%2),true);deferred.present('pacedD'+(f%2));const n=count;
    const b=read();direct.render(input,o.width,o.height,st,t,!!diag);const a=read();
    let diff=0;for(let i=0;i<a.length;i++)if(a[i]!==b[i])diff++;if(diff)bad.push({name,f,diff});if(f===2)passes[name]=n;}}
  check(!bad.length,'Deferred last pass in present() gives the same bytes as drawing it in render()',{bad,passes});
  // Draws per frame: the slot copy is gone where an intermediate target exists (copy kept for upload/history).
  check(passes['filters native']===2&&passes['EASU upscale']===3&&passes['SGSR upscale']===2&&passes['SGSR from the upload']===2,'Deferred last pass saves the present copy',passes);
  // A slot rendered again before it was shown (pacer drop) and the reuse of swapped targets stay consistent.
  {const o=BxRestoration.outputSize(128,96,'144');c2.width=o.width;c2.height=o.height;const st={...base,deband:.6,output:'144'};
   for(let f=0;f<12;f++)deferred.render(input,o.width,o.height,st,2+f/30,false,'pacedD'+(f%3),true);deferred.present('pacedD2');const b=read();direct.render(input,o.width,o.height,st,2);const a=read();
   check(a.every((v,i)=>v===b[i])&&Object.keys(deferred.targets).filter(k=>k.startsWith('paced')).length===3,'Deferred slots survive drops and reuse',Object.keys(deferred.targets));}
  check(g2.getError()===g2.NO_ERROR,'No GL errors with deferred slots');
  deferred.releasePaced();direct.destroy();deferred.destroy();}
 // Compiled spatial variants (Spec 3): the highp profile must give the generic shader's bytes exactly,
 // on a frame with smooth ramps, colored edges, thin lines and noise, for several filter sets.
 {const img=ctx.createImageData(128,96);let seed=7;const rnd=()=>(seed=(seed*1103515245+12345)&0x7fffffff)/0x7fffffff;
  for(let y=0;y<96;y++)for(let x=0;x<128;x++){const i=(y*128+x)*4,ramp=40+x*.6+y*.2;let r=ramp,g=ramp+10,b=ramp*1.2;
   if(x>=64&&x<96){r=x%9<4?200:40;g=y%7<3?60:180;b=90;}if(x>=96){const n=rnd()*24-12;r=120+n;g=110+(y%4)*3+n;b=100+(x%3)*5;}if(x%17===0){r+=6;g-=4;}
   img.data[i]=r;img.data[i+1]=g;img.data[i+2]=b;img.data[i+3]=255;}
  ctx.putImageData(img,0,0);
  const v=new BxRestoration.Engine(gl,BxShaders,{spatialPrecision:'highp'}),ta=v.target('pacedA',128,96),tb=v.target('pacedB',128,96);
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,v.input);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,input);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
  const read=t=>{gl.bindFramebuffer(gl.FRAMEBUFFER,t.fbo);const p=new Uint8Array(128*96*4);gl.readPixels(0,0,128,96,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;};
  const base={cleanup:0,deband:0,chroma:0,detail:0,antialias:0,debandTaps:4,quantize:true,selective:true},sets=[
   {...base,deband:.6,chroma:.75},{...base,cleanup:.5,deband:.3,chroma:.75,detail:.2},{cleanup:1,deband:1,chroma:1,detail:1,antialias:1,debandTaps:2,quantize:false,selective:false},
   {...base,deband:.3,debandTaps:2},{...base,cleanup:.35,selective:false},{...base,antialias:.5},{...base,detail:.35,chroma:.5,quantize:false},{...base}];
  const bad=[];let changed=0;
  for(const u of sets){const name=v.spatialVariant(u,true);v.draw('spatial',ta,128,96,{source:v.input},u);v.draw(name,tb,128,96,{source:v.input},u);const a=read(ta),b=read(tb);
   let diff=0;for(let i=0;i<a.length;i++)if(a[i]!==b[i])diff++;if(name==='spatial'||diff)bad.push({u,name,diff});if(name!=='spatial')changed++;}
  check(!bad.length&&changed===sets.length,'Highp spatial variants match the generic shader byte for byte',{bad,variants:changed});
  const fresh=v.spatialVariant({...base,deband:.3,detail:.1});check(fresh==='spatial','A new spatial profile draws with the generic shader until its variant is built',fresh);
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);v.destroy();}
 check(gl.getError()===gl.NO_ERROR,'No GL errors');
 engine.destroy();fallback.destroy();
 document.getElementById('result').textContent=JSON.stringify({passed:checks,failures});
})()
</script>'''
Path('output/playwright').mkdir(parents=True, exist_ok=True)
Path('output/playwright/regressions-v7.html').write_text(html)

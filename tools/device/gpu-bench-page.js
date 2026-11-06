(async()=>{
if(typeof BxRestoration==='undefined'||typeof BxShaders==='undefined')return JSON.stringify({error:'engine not in page',r:typeof BxRestoration,s:typeof BxShaders});
const W=1920,H=1080,OW=2276,OH=1280,N=40,ROUNDS=5;
const src=document.createElement('canvas');src.width=W;src.height=H;const x=src.getContext('2d');
const g=x.createLinearGradient(0,0,0,H/2);g.addColorStop(0,'#27486b');g.addColorStop(1,'#9fb7c9');x.fillStyle=g;x.fillRect(0,0,W,H/2);
const img=x.createImageData(W,H/2);let s=12345;for(let i=0;i<img.data.length;i+=4){s=(s*1664525+1013904223)>>>0;const n=s>>>24,px=(i/4)%W,py=((i/4)/W)|0,b=60+((px>>3^py>>3)&1)*50+(n>>2);img.data[i]=b;img.data[i+1]=b*.9;img.data[i+2]=b*.75;img.data[i+3]=255;}
x.putImageData(img,0,H/2);x.fillStyle='#d33';for(let i=0;i<40;i++)x.fillRect(i*48,H/2-60+(i%5)*20,24,3);
const c=document.createElement('canvas');c.width=OW;c.height=OH;
const gl=c.getContext('webgl2',{antialias:false,alpha:false,depth:false,stencil:false,preserveDrawingBuffer:false});
const e=new BxRestoration.Engine(gl,BxShaders);
gl.bindTexture(gl.TEXTURE_2D,e.input);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,src);
const big=e.target('benchBig',OW,OH),A=e.target('benchA',W,H),B=e.target('benchB',W,H),OA=e.target('benchOA',OW,OH),OB=e.target('benchOB',OW,OH),P=e.targetPair('benchNN',W,H);
e.draw('easu',big,OW,OH,{source:e.input});
const sp=o=>({cleanup:0,deband:0,chroma:0,detail:0,antialias:0,debandTaps:4,quantize:true,selective:true,...o});
const sharpU=sz=>({iResolution:sz,qualityMode:false,rcasStrength:.3,haloMargin:5/255,noiseFloor:4/255,lumaSharpen:true,sharpenFactor:2.5,brightness:1,contrast:1,saturation:1,shadows:0,deband:.3,diagnostic:false});
const spatial=o=>i=>{const t=i&1?A:B;e.draw('spatial',t,W,H,{source:e.input},sp(o));return t;};
const sharp=(tex,w,h,a,b)=>i=>{const t=i&1?a:b,p=e.programs.casFiltered;gl.useProgram(p.program);gl.uniform1i(gl.getUniformLocation(p.program,'filterId'),1);e.draw('casFiltered',t,w,h,{data:tex},sharpU([w,h]));return t;};
const cases={
 copy1080:i=>{const t=i&1?A:B;e.draw('copy',t,W,H,{source:e.input});return t;},
 spatialVazio:spatial({}),
 compressao:spatial({cleanup:.5}),
 degrades:spatial({deband:.3}),
 corBordas:spatial({chroma:.75}),
 detalhe:spatial({detail:.2}),
 antialias:spatial({antialias:.5}),
 spatialPadrao:spatial({cleanup:.5,deband:.3,chroma:.75,detail:.2}),
 easu1280:i=>{const t=i&1?OA:OB;e.draw('easu',t,OW,OH,{source:e.input});return t;},
 nitidez1080:sharp(e.input,W,H,A,B),
 nitidez1280:sharp(big.texture,OW,OH,OA,OB),
 present1280:i=>{const t=i&1?OA:OB;e.draw('copy',t,OW,OH,{source:big.texture});return t;},
 neural:i=>{e.draw('nnFeatures',P,W,H,{source:e.input});const t=i&1?A:B;e.draw('nnApply',t,W,H,{source:e.input,featA:P.texture,featB:P.second},{strength:.5});return t;},
};
const px=new Uint8Array(4),sleep=ms=>new Promise(r=>setTimeout(r,ms));
function run(fn){let t;const s=performance.now();for(let i=0;i<N;i++)t=fn(i);gl.bindFramebuffer(gl.FRAMEBUFFER,t.fbo);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,px);return (performance.now()-s)/N;}
const samples={};for(const k in cases){samples[k]=[];run(cases[k]);}
for(let r=0;r<ROUNDS;r++)for(const k in cases){samples[k].push(run(cases[k]));await sleep(30);}
// Whole frames through render(): the temporal cost is the gap between the two, upload included in both.
let time=0;const frame=o=>()=>{const s={...BxRestoration.defaults,mode:'filtered',output:'native',gpuBudget:0,...o};let last;for(let i=0;i<N;i++){time+=1/30;last=e.render(src,W,H,s,time);}gl.bindFramebuffer(gl.FRAMEBUFFER,null);return last;};
const whole={renderPadrao:frame({}),renderTemporal:frame({temporal:1})};
function runWhole(fn){const s=performance.now();fn();gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,px);return (performance.now()-s)/N;}
for(const k in whole){samples[k]=[];runWhole(whole[k]);}
for(let r=0;r<ROUNDS;r++)for(const k in whole){samples[k].push(runWhole(whole[k]));await sleep(30);}
const err=gl.getError();
const out={};for(const [k,v] of Object.entries(samples)){const q=[...v].sort((a,b)=>a-b);out[k]={med:+q[q.length>>1].toFixed(3),min:+q[0].toFixed(3),max:+q[q.length-1].toFixed(3)};}
e.destroy();gl.getExtension('WEBGL_lose_context')?.loseContext();
return JSON.stringify({glError:err,N,ROUNDS,out});
})()

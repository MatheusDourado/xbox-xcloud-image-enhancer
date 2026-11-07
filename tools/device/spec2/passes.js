// Per-pass cost on real decoded frames, in bursts (GPU at its top clock), plus the shader variants of
// sections 10.1 and 10.2. Prototypes live here only: nothing in src/ changes in Spec 2.
(()=>{
const {e,gl,video,W,H,OW,OH,sleep,stat,up,finish}=B;
const S=BxShaders;
const variants=BxVariants(S),def={cleanup:.5,deband:.3,debandTaps:4,chroma:.75,detail:.2,antialias:0};
const failed={};for(const [k,code] of Object.entries(variants))try{e.programs[k]=e.compile(code);}catch(err){failed[k]=String(err.message||err).slice(0,300);}
const big=e.target('pacedbenchBig',OW,OH),A=e.target('pacedbenchA',W,H),Bt=e.target('pacedbenchB',W,H),OA=e.target('pacedbenchOA',OW,OH),OB=e.target('pacedbenchOB',OW,OH),P=e.targetPair('pacedbenchNN',W,H),FA=e.target('pacedbenchFA',W,H,true),FB=e.target('pacedbenchFB',W,H,true),FO=e.target('pacedbenchFO',OW,OH,true),FO2=e.target('pacedbenchFO2',OW,OH,true);
const uSp=o=>({cleanup:0,deband:0,chroma:0,detail:0,antialias:0,debandTaps:4,quantize:true,selective:true,...o}),padrao=uSp({cleanup:.5,deband:.3,chroma:.75,detail:.2});
const sharpU=sz=>({iResolution:sz,qualityMode:false,rcasStrength:.3,haloMargin:5/255,noiseFloor:4/255,lumaSharpen:true,sharpenFactor:2.5,brightness:1,contrast:1,saturation:1,shadows:0,deband:.3,diagnostic:false});
const pair=(a,b)=>i=>i&1?a:b,t1080=pair(A,Bt),t1280=pair(OA,OB);
const spatial=(name,u,tg=t1080)=>i=>{const t=tg(i);e.draw(name,t,W,H,{source:e.input},u);return t;};
const sharp=(prog,tex,w,h,tg)=>i=>{const t=tg(i),p=e.programs[prog];gl.useProgram(p.program);gl.uniform1i(gl.getUniformLocation(p.program,'filterId'),1);e.draw(prog,t,w,h,{data:tex},sharpU([w,h]));return t;};
const inv=(fn,how)=>i=>{const t=(i&1?OA:OB);gl.bindFramebuffer(gl.FRAMEBUFFER,t.fbo);if(how==='inv')gl.invalidateFramebuffer(gl.FRAMEBUFFER,[gl.COLOR_ATTACHMENT0]);else{gl.clearColor(0,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT);}return fn(i);};
const easu=i=>{const t=t1280(i);e.draw('easu',t,OW,OH,{source:big2.texture});return t;};
const big2=e.target('pacedbenchS',W,H);
const copy=(tex,w,h,tg)=>i=>{const t=tg(i);e.draw('copy',t,w,h,{source:tex});return t;};
const chain=k=>i=>{let src=e.input,t;for(let n=0;n<k;n++){t=(n+i)&1?A:Bt;e.draw('copy',t,W,H,{source:src});src=t.texture;}return t;};
const sg=(prog,threshold)=>i=>{const t=t1280(i);e.draw(prog,t,OW,OH,{source:big2.texture},{sharp:2,threshold});return t;};
const cases={
 copy1080:copy(e.input,W,H,t1080),copy1280:copy(big.texture,OW,OH,t1280),copy1280x16F:copy(FO.texture,OW,OH,pair(FO2,FO2)),
 chain1:chain(1),chain2:chain(2),chain3:chain(3),chain4:chain(4),
 spatialVazio:spatial('spatial',uSp({})),compressao:spatial('spatial',uSp({cleanup:.5})),degrades:spatial('spatial',uSp({deband:.3})),corBordas:spatial('spatial',uSp({chroma:.75})),detalhe:spatial('spatial',uSp({detail:.2})),antialias:spatial('spatial',uSp({antialias:.5})),
 spatialPadrao:spatial('spatial',padrao),spatial16F:spatial('spatial',padrao,pair(FA,FB)),
 spatialMp:spatial('spatialMp',padrao),spatialMpS:spatial('spatialMpS',padrao),spatialConst:spatial('spatialConst',{}),spatialMpConst:spatial('spatialMpConst',{}),spatialTex:spatial('spatialTex',padrao),spatialGate:spatial('spatialGate',padrao),spatialUsm:spatial('spatialUsm',{...padrao,usmAmount:.8}),spatialDb2:spatial('spatialDb2',padrao),
 degradesR2:spatial('spatial',uSp({deband:.001})),degradesR8:spatial('spatial',uSp({deband:.999})),
 easu1280:easu,nitidez1080:sharp('casFiltered',big2.texture,W,H,t1080),nitidez1280:sharp('casFiltered',big.texture,OW,OH,t1280),nitidezMp1280:sharp('casMp',big.texture,OW,OH,t1280),
 sgsr8:sg('sgsr',8/255),sgsr20:sg('sgsr',20/255),sgsrHp8:sg('sgsrHp',8/255),
 present1280:copy(big.texture,OW,OH,t1280),
 present1280inv:inv(copy(big.texture,OW,OH,t1280),'inv'),present1280clear:inv(copy(big.texture,OW,OH,t1280),'clear'),easu1280inv:inv(easu,'inv'),nitidez1280inv:inv(sharp('casFiltered',big.texture,OW,OH,t1280),'inv'),
 neural:i=>{e.draw('nnFeatures',P,W,H,{source:e.input});const t=t1080(i);e.draw('nnApply',t,W,H,{source:e.input,featA:P.texture,featB:P.second},{strength:.5});return t;},
};
const N=40,px=new Uint8Array(4);
function warm(ms=220){const end=performance.now()+ms;let i=0;while(performance.now()<end){for(let k=0;k<4;k++)e.draw('spatial',i++&1?A:Bt,W,H,{source:e.input},padrao);finish(A.fbo);}}
function run(fn){warm();let t;const s=performance.now();for(let i=0;i<N;i++)t=fn(i);if(t.fp){B.touch(t.texture);finish();}else finish(t.fbo);return (performance.now()-s)/N;}
async function frameAt(sec){video.pause();video.currentTime=sec;await new Promise(r=>{video.onseeked=r;setTimeout(r,3000);});await new Promise(r=>{video.requestVideoFrameCallback(r);setTimeout(r,500);});up('tex',video);e.draw('spatial',big2,W,H,{source:e.input},padrao);e.draw('easu',big,OW,OH,{source:big2.texture});finish(big.fbo);}
async function passes(rounds=3,names=Object.keys(cases)){
 const out={},scenes={caverna:4,rocha:12,noite:20};names=names.filter(k=>!(k.startsWith('sgsr')&&failed.sgsr));
 for(const [scene,sec] of Object.entries(scenes)){await frameAt(sec);const v={};for(const k of names){v[k]=[];run(cases[k]);}
  for(let r=0;r<rounds;r++){const order=[...names];for(let i=order.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[order[i],order[j]]=[order[j],order[i]];}for(const k of order){v[k].push(run(cases[k]));await sleep(0);}}
  out[scene]=Object.fromEntries(names.map(k=>[k,stat(v[k]).p50]));}
 const all={};for(const k of names){const m=Object.values(out).map(s=>s[k]).sort((a,b)=>a-b);all[k]=m[1];}
 await video.play();return {median:all,scenes:out,glError:gl.getError(),failed};
}
// Whole frames: render() as production calls it, to explain the Spec 1 gap between passes and render().
async function renders(rounds=5){
 await frameAt(4);const s1=B.settings({output:String(OH)}),s0=B.settings({}),c2=document.createElement('canvas');c2.width=W;c2.height=H;c2.getContext('2d').drawImage(video,0,0,W,H);
 const f=(src,s,w,h,tgt,noUp)=>()=>{const go=()=>e.render(src,w,h,s,performance.now()/1000,false,tgt);warm();const a=performance.now();for(let i=0;i<N;i++)noUp?B.withoutUpload(go):go();finish(tgt?e.targets[tgt].fbo:null);return (performance.now()-a)/N;};
 const c={video1280slot:f(video,s1,OW,OH,'paced0'),video1280slotNoUp:f(video,s1,OW,OH,'paced0',true),video1280canvas:f(video,s1,OW,OH,null),canvas2d1280slot:f(c2,s1,OW,OH,'paced0'),canvas2d1280canvas:f(c2,s1,OW,OH,null),video1080slot:f(video,s0,W,H,'paced0'),video1080slotNoUp:f(video,s0,W,H,'paced0',true),video1080canvas:f(video,s0,W,H,null)};
 const v={};for(const k in c){v[k]=[];c[k]();}for(let r=0;r<rounds;r++)for(const k in c){v[k].push(c[k]());await sleep(30);}
 await video.play();return Object.fromEntries(Object.keys(c).map(k=>[k,stat(v[k])]));
}
// Pixel distance of each variant to the shipped shader, on a real frame.
async function diffs(){
 const a=e.target('paceddA',W,H),b=e.target('paceddB',W,H),n=W*H*4,pa=new Uint8Array(n),pb=new Uint8Array(n),out={};await frameAt(20);
 const read=(t,p)=>{gl.bindFramebuffer(gl.FRAMEBUFFER,t.fbo);gl.readPixels(0,0,W,H,gl.RGBA,gl.UNSIGNED_BYTE,p);};
 e.draw('spatial',a,W,H,{source:e.input},padrao);read(a,pa);
 for(const [k,u] of [['spatialMp',padrao],['spatialMpS',padrao],['spatialConst',{}],['spatialMpConst',{}],['spatialTex',padrao],['spatialGate',padrao]]){if(failed[k])continue;e.draw(k,b,W,H,{source:e.input},u);read(b,pb);let mx=0,s=0,over=0;for(let i=0;i<n;i++){if((i&3)===3)continue;const d=Math.abs(pa[i]-pb[i]);if(d>mx)mx=d;s+=d;if(d>1)over++;}out[k]={max:mx,mean:+(s/(n*.75)).toFixed(4),over1Pct:+(over/(n*.75)*100).toFixed(4)};}
 await video.play();return out;
}
// First use of each program with a cold driver cache (a unique comment defeats the program cache).
async function compile(){
 const out={},nonce='// '+Math.random()+'\n',tmp=e.target('pacedcTmp',W,H),par=gl.getExtension('KHR_parallel_shader_compile');
 for(const [k,code] of Object.entries(S)){const a=performance.now();const p=e.compile(code.replace('\n','\n'+nonce));const b=performance.now();out[k]={compileLink:+(b-a).toFixed(1)};gl.deleteProgram(p.program);}
 const a=performance.now();const fresh=new BxRestoration.Engine(gl,Object.fromEntries(Object.entries(S).map(([k,c])=>[k,c.replace('\n','\n//'+Math.random()+'\n')])));const b=performance.now();
 const first={},t=fresh.target('t',W,H),px4=new Uint8Array(4);
 for(const k of ['spatial','easu','casFiltered','copy']){gl.bindTexture(gl.TEXTURE_2D,fresh.input);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(4));const c=performance.now();fresh.draw(k,t,64,64,{source:fresh.input,data:fresh.input},{});gl.bindFramebuffer(gl.FRAMEBUFFER,t.fbo);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,px4);const d=performance.now();fresh.draw(k,t,64,64,{source:fresh.input,data:fresh.input},{});gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,px4);first[k]={first:+(d-c).toFixed(1),second:+(performance.now()-d).toFixed(1)};}
 fresh.destroy();return {perProgram:out,engineCtor:+(b-a).toFixed(1),first,parallel:!!par};
}
// Why is one frame about 3x the burst figure? Per-frame time when M frames share one wait, per pass and chained.
async function batches(){await frameAt(4);const out={},s1=B.settings({output:String(OH)}),s0=B.settings({});
 const R=(s,w,h)=>()=>{B.withoutUpload(()=>e.render(video,w,h,s,1,false,'paced0'));return e.targets.paced0;};
 const chainD=i=>{e.draw('spatial',A,W,H,{source:e.input},padrao);e.draw('easu',OA,OW,OH,{source:A.texture});const p=e.programs.casFiltered;gl.useProgram(p.program);gl.uniform1i(gl.getUniformLocation(p.program,'filterId'),1);e.draw('casFiltered',OB,OW,OH,{data:OA.texture},sharpU([OW,OH]));return OB;};
 const indep=i=>{e.draw('spatial',A,W,H,{source:e.input},padrao);e.draw('easu',OA,OW,OH,{source:big2.texture});const p=e.programs.casFiltered;gl.useProgram(p.program);gl.uniform1i(gl.getUniformLocation(p.program,'filterId'),1);e.draw('casFiltered',OB,OW,OH,{data:big.texture},sharpU([OW,OH]));return OB;};
 const fl=fn=>i=>{const t=fn(i);gl.flush();return t;};
 const list={render1280:R(s1,OW,OH),render1080:R(s0,W,H),encadeado:chainD,independente:indep,spatial:cases.spatialPadrao,easu:cases.easu1280,nitidez:cases.nitidez1280,copy1080:cases.copy1080};
 for(const [k,fn] of Object.entries(list)){out[k]={};for(const M of [1,2,4,8,16,40]){const v=[],end=performance.now()+1500;let t;for(fn(0),finish((fn(1)).fbo);performance.now()<end;){const a=performance.now();for(let i=0;i<M;i++)t=fn(i);finish(t.fbo);v.push((performance.now()-a)/M);}out[k][M]=stat(v).p50;}await sleep(100);}
 await video.play();return out;}
B.batches=batches;
B.warm=warm;Object.assign(B,{passes,renders,diffs,compile,failed,variants,cases,frameAt});
})();

// Per-pass cost on real decoded frames, in bursts (GPU at its top clock), plus the shader variants of
// sections 10.1 and 10.2. Prototypes live here only: nothing in src/ changes in Spec 2.
(()=>{
const {e,gl,video,W,H,OW,OH,sleep,stat,up,finish}=B;
const S=BxShaders;
const rep=(s,pairs)=>{for(const [a,b] of pairs){if(!s.includes(a)&&!(a instanceof RegExp&&a.test(s)))throw new Error('variant anchor missing: '+a);s=s.split(a).join(b);}return s;};
const hp=[['precision highp float;','precision mediump float;']],sp=[['precision highp sampler2D;','precision mediump sampler2D;']];
const spatialCoords=[['vec3 at(vec2 p)','vec3 at(highp vec2 p)'],['vec2 p=gl_FragCoord.xy-.5;','highp vec2 p=gl_FragCoord.xy-.5;'],['vec2 size=vec2(textureSize(source,0)),uv=(p+.5)/size','highp vec2 size=vec2(textureSize(source,0)),uv=(p+.5)/size']];
const def={cleanup:.5,deband:.3,debandTaps:4,chroma:.75,detail:.2,antialias:0};
const constants=s=>rep(s,[['uniform float cleanup, deband, debandTaps, chroma, detail, antialias;\nuniform bool quantize,selective;',`const float cleanup=${def.cleanup},deband=${def.deband},debandTaps=4.,chroma=${def.chroma},detail=${def.detail},antialias=0.;\nconst bool quantize=true,selective=true;`]]);
const FETCH_TEXTURE=[['return texelFetch(source,clamp(ivec2(p),ivec2(0),textureSize(source,0)-1),0).rgb;','return texture(source,(p+.5)/vec2(textureSize(source,0))).rgb;']];
// Detail only where the 5x5 neighbourhood has contrast: reads of the ring are skipped in flat areas.
const gate=s=>rep(s,[[' if(detail>0.){\n  // Reuse center/cross',' float gateRange=max(max(peak(c-west),peak(c-east)),max(peak(c-north),peak(c-south)));\n if(detail>0.&&gateRange>1.5/255.){\n  // Reuse center/cross']]);
// USM on the luma of the source, in the same pass: the native path loses a full-frame pass.
const fusedUsm=s=>rep(s,[[' // On devices without float color targets',' {float Lc=lum(result),blur=.25*(lum(west)+lum(east)+lum(south)+lum(north)),lo5=min(min(lum(west),lum(east)),min(lum(south),lum(north))),hi5=max(max(lum(west),lum(east)),max(lum(south),lum(north)));\n  float amt=(lum(c)-blur)*usmAmount;float lim=clamp(Lc+amt,min(Lc,lo5-5./255.),max(Lc,hi5+5./255.));result+=lim-Lc;}\n // On devices without float color targets'],['out vec4 fragColor;','uniform float usmAmount;out vec4 fragColor;']]);
// Deband with the per-sample test of FFmpeg vf_deband (MIT notice) and a per-pixel rotated pattern.
const debandV2=s=>rep(s,[['vec2 d=i==0?vec2(1,.5):i==1?vec2(-1,-.5):i==2?vec2(.5,-1):vec2(-.5,1);','float ang=6.2831853*fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))));vec2 rr=vec2(cos(ang),sin(ang));vec2 d=i==0?rr:i==1?-rr:i==2?vec2(-rr.y,rr.x):vec2(rr.y,-rr.x);']]);
const SGSR=`#version 300 es
precision mediump float;
precision highp int;
precision mediump sampler2D;
// Prototype of Snapdragon GSR 1 without textureGather (BSD-3-Clause, Qualcomm Innovation Center): 12 texelFetch.
uniform sampler2D source;uniform highp vec2 outputSize;uniform float sharp,threshold;out vec4 fragColor;
float L(ivec2 p,ivec2 m){return dot(texelFetch(source,clamp(p,ivec2(0),m),0).rgb,vec3(.2126,.7152,.0722));}
float lanczos(float x){float a=x-4.;float b=x*a-a;a*=a;return b*a;}
vec2 wy(float dx,float dy,float c,float s){float x=(dx*dx+dy*dy)*.55+clamp(abs(c)*s,0.,1.);float w=lanczos(x);return vec2(w,w*c);}
void main(){
 highp vec2 size=vec2(textureSize(source,0)),uv=gl_FragCoord.xy/outputSize;ivec2 m=ivec2(size)-1;
 vec3 color=textureLod(source,uv,0.).rgb;float cy=dot(color,vec3(.2126,.7152,.0722));
 highp vec2 img=uv*size+vec2(-.5,.5),ip=floor(img);vec2 pl=vec2(img-ip);ivec2 P=ivec2(ip);
 vec4 left;left.y=L(P,m);left.z=L(P+ivec2(0,-1),m);
 float vote=abs(left.z-left.y)+abs(cy-left.y)+abs(cy-left.z);
 if(vote>threshold){
  left.x=L(P+ivec2(-1,0),m);left.w=L(P+ivec2(-1,-1),m);
  vec4 right=vec4(L(P+ivec2(1,0),m),L(P+ivec2(2,0),m),L(P+ivec2(2,-1),m),L(P+ivec2(1,-1),m));
  vec4 ud=vec4(L(P+ivec2(0,-2),m),L(P+ivec2(1,-2),m),L(P+ivec2(1,1),m),L(P+ivec2(0,1),m));
  float mean=(left.y+left.z+right.x+right.w)*.25;left-=mean;right-=mean;ud-=mean;float cw=cy-mean;
  vec4 a=abs(left)+abs(right)+abs(ud);float std=2.181818/(a.x+a.y+a.z+a.w);
  vec2 s=wy(pl.x,pl.y+1.,ud.x,std)+wy(pl.x-1.,pl.y+1.,ud.y,std)+wy(pl.x-1.,pl.y-2.,ud.z,std)+wy(pl.x,pl.y-2.,ud.w,std);
  s+=wy(pl.x+1.,pl.y-1.,left.x,std)+wy(pl.x,pl.y-1.,left.y,std)+wy(pl.x,pl.y,left.z,std)+wy(pl.x+1.,pl.y,left.w,std);
  s+=wy(pl.x-1.,pl.y-1.,right.x,std)+wy(pl.x-2.,pl.y-1.,right.y,std)+wy(pl.x-2.,pl.y,right.z,std)+wy(pl.x-1.,pl.y,right.w,std);
  float fy=s.y/s.x,mx=max(max(left.y,left.z),max(right.x,right.w)),mn=min(min(left.y,left.z),min(right.x,right.w));
  fy=clamp(sharp*fy,mn,mx);float dy=clamp(fy-cw,-23./255.,23./255.);color=clamp(color+dy,0.,1.);
 }
 fragColor=vec4(color,1);
}`;
const variants={
 spatialMp:rep(S.spatial,[...hp,...spatialCoords]),spatialMpS:rep(S.spatial,[...hp,...sp,...spatialCoords]),
 spatialConst:constants(S.spatial),spatialTex:rep(S.spatial,FETCH_TEXTURE),spatialGate:gate(S.spatial),spatialUsm:fusedUsm(S.spatial),spatialDb2:debandV2(S.spatial),
 spatialMpConst:constants(rep(S.spatial,[...hp,...spatialCoords])),
 casMp:rep(S.casFiltered,[...hp,['vec2 texelSize =','highp vec2 texelSize ='],['vec3 clarityBoost(sampler2D tex, vec2 coord,','vec3 clarityBoost(sampler2D tex, highp vec2 coord,']]),
 sgsr:SGSR,sgsrHp:SGSR.replace('precision mediump float;','precision highp float;').replace('precision mediump sampler2D;','precision highp sampler2D;'),
};
const failed={};for(const [k,code] of Object.entries(variants))try{e.programs[k]=e.compile(code);}catch(err){failed[k]=String(err.message||err).slice(0,300);}
const big=e.target('benchBig',OW,OH),A=e.target('benchA',W,H),Bt=e.target('benchB',W,H),OA=e.target('benchOA',OW,OH),OB=e.target('benchOB',OW,OH),P=e.targetPair('benchNN',W,H),FA=e.target('benchFA',W,H,true),FB=e.target('benchFB',W,H,true),FO=e.target('benchFO',OW,OH,true),FO2=e.target('benchFO2',OW,OH,true);
const uSp=o=>({cleanup:0,deband:0,chroma:0,detail:0,antialias:0,debandTaps:4,quantize:true,selective:true,...o}),padrao=uSp({cleanup:.5,deband:.3,chroma:.75,detail:.2});
const sharpU=sz=>({iResolution:sz,qualityMode:false,rcasStrength:.3,haloMargin:5/255,noiseFloor:4/255,lumaSharpen:true,sharpenFactor:2.5,brightness:1,contrast:1,saturation:1,shadows:0,deband:.3,diagnostic:false});
const pair=(a,b)=>i=>i&1?a:b,t1080=pair(A,Bt),t1280=pair(OA,OB);
const spatial=(name,u,tg=t1080)=>i=>{const t=tg(i);e.draw(name,t,W,H,{source:e.input},u);return t;};
const sharp=(prog,tex,w,h,tg)=>i=>{const t=tg(i),p=e.programs[prog];gl.useProgram(p.program);gl.uniform1i(gl.getUniformLocation(p.program,'filterId'),1);e.draw(prog,t,w,h,{data:tex},sharpU([w,h]));return t;};
const inv=(fn,how)=>i=>{const t=(i&1?OA:OB);gl.bindFramebuffer(gl.FRAMEBUFFER,t.fbo);if(how==='inv')gl.invalidateFramebuffer(gl.FRAMEBUFFER,[gl.COLOR_ATTACHMENT0]);else{gl.clearColor(0,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT);}return fn(i);};
const easu=i=>{const t=t1280(i);e.draw('easu',t,OW,OH,{source:big2.texture});return t;};
const big2=e.target('benchS',W,H);
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
const N=30,px=new Uint8Array(4);
function run(fn){let t;const s=performance.now();for(let i=0;i<N;i++)t=fn(i);if(t.fp){B.touch(t.texture);finish();}else finish(t.fbo);return (performance.now()-s)/N;}
async function frameAt(sec){video.pause();video.currentTime=sec;await new Promise(r=>{video.onseeked=r;setTimeout(r,3000);});await new Promise(r=>{video.requestVideoFrameCallback(r);setTimeout(r,500);});up('tex',video);e.draw('spatial',big2,W,H,{source:e.input},padrao);e.draw('easu',big,OW,OH,{source:big2.texture});finish(big.fbo);}
async function passes(rounds=3,names=Object.keys(cases)){
 const out={},scenes={caverna:4,rocha:12,noite:20};names=names.filter(k=>!(k.startsWith('sgsr')&&failed.sgsr));
 for(const [scene,sec] of Object.entries(scenes)){await frameAt(sec);const v={};for(const k of names){v[k]=[];run(cases[k]);}
  for(let r=0;r<rounds;r++)for(const k of names){v[k].push(run(cases[k]));await sleep(10);}
  out[scene]=Object.fromEntries(names.map(k=>[k,stat(v[k]).p50]));}
 const all={};for(const k of names){const m=Object.values(out).map(s=>s[k]).sort((a,b)=>a-b);all[k]=m[1];}
 await video.play();return {median:all,scenes:out,glError:gl.getError(),failed};
}
// Whole frames: render() as production calls it, to explain the Spec 1 gap between passes and render().
async function renders(rounds=5){
 await frameAt(4);const s1=B.settings({output:String(OH)}),s0=B.settings({}),c2=document.createElement('canvas');c2.width=W;c2.height=H;c2.getContext('2d').drawImage(video,0,0,W,H);
 const f=(src,s,w,h,tgt,noUp)=>()=>{const go=()=>e.render(src,w,h,s,performance.now()/1000,false,tgt);const a=performance.now();for(let i=0;i<N;i++)noUp?B.withoutUpload(go):go();finish(tgt?e.targets[tgt].fbo:null);return (performance.now()-a)/N;};
 const c={video1280slot:f(video,s1,OW,OH,'paced0'),video1280slotNoUp:f(video,s1,OW,OH,'paced0',true),video1280canvas:f(video,s1,OW,OH,null),canvas2d1280slot:f(c2,s1,OW,OH,'paced0'),canvas2d1280canvas:f(c2,s1,OW,OH,null),video1080slot:f(video,s0,W,H,'paced0'),video1080slotNoUp:f(video,s0,W,H,'paced0',true),video1080canvas:f(video,s0,W,H,null)};
 const v={};for(const k in c){v[k]=[];c[k]();}for(let r=0;r<rounds;r++)for(const k in c){v[k].push(c[k]());await sleep(30);}
 await video.play();return Object.fromEntries(Object.keys(c).map(k=>[k,stat(v[k])]));
}
// Pixel distance of each variant to the shipped shader, on a real frame.
async function diffs(){
 const a=e.target('dA',W,H),b=e.target('dB',W,H),n=W*H*4,pa=new Uint8Array(n),pb=new Uint8Array(n),out={};await frameAt(20);
 const read=(t,p)=>{gl.bindFramebuffer(gl.FRAMEBUFFER,t.fbo);gl.readPixels(0,0,W,H,gl.RGBA,gl.UNSIGNED_BYTE,p);};
 e.draw('spatial',a,W,H,{source:e.input},padrao);read(a,pa);
 for(const [k,u] of [['spatialMp',padrao],['spatialMpS',padrao],['spatialConst',{}],['spatialMpConst',{}],['spatialTex',padrao],['spatialGate',padrao]]){if(failed[k])continue;e.draw(k,b,W,H,{source:e.input},u);read(b,pb);let mx=0,s=0,over=0;for(let i=0;i<n;i++){if((i&3)===3)continue;const d=Math.abs(pa[i]-pb[i]);if(d>mx)mx=d;s+=d;if(d>1)over++;}out[k]={max:mx,mean:+(s/(n*.75)).toFixed(4),over1Pct:+(over/(n*.75)*100).toFixed(4)};}
 await video.play();return out;
}
// First use of each program with a cold driver cache (a unique comment defeats the program cache).
async function compile(){
 const out={},nonce='// '+Math.random()+'\n',tmp=e.target('cTmp',W,H),par=gl.getExtension('KHR_parallel_shader_compile');
 for(const [k,code] of Object.entries(S)){const a=performance.now();const p=e.compile(code.replace('\n','\n'+nonce));const b=performance.now();out[k]={compileLink:+(b-a).toFixed(1)};gl.deleteProgram(p.program);}
 const a=performance.now();const fresh=new BxRestoration.Engine(gl,Object.fromEntries(Object.entries(S).map(([k,c])=>[k,c.replace('\n','\n//'+Math.random()+'\n')])));const b=performance.now();
 const first={},t=fresh.target('t',W,H),px4=new Uint8Array(4);
 for(const k of ['spatial','easu','casFiltered','copy']){gl.bindTexture(gl.TEXTURE_2D,fresh.input);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(4));const c=performance.now();fresh.draw(k,t,64,64,{source:fresh.input,data:fresh.input},{});gl.bindFramebuffer(gl.FRAMEBUFFER,t.fbo);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,px4);const d=performance.now();fresh.draw(k,t,64,64,{source:fresh.input,data:fresh.input},{});gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,px4);first[k]={first:+(d-c).toFixed(1),second:+(performance.now()-d).toFixed(1)};}
 fresh.destroy();return {perProgram:out,engineCtor:+(b-a).toFixed(1),first,parallel:!!par};
}
Object.assign(B,{passes,renders,diffs,compile,failed,variants,cases,frameAt});
})();

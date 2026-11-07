// Spec 3 items 2 and 9 in the Spec 2 bench (tools/device/spec2/bench.html, with passes.js loaded).
// Burst cost of the spatial pass and of render() with the generic shader against the compiled variants,
// and pixel distance of each variant to the generic shader on real frames.
// Usage: BX_MEAS_DIR=spec3 node tools/device/spec2/meas.cjs <poco|vostro> <name> "<query>" tools/device/spec3/item2.js
(async()=>{
const {e,gl,video,W,H,OW,OH,sleep,stat,finish}=B,S=BxShaders,R=BxRestoration;
const base={cleanup:0,deband:0,chroma:0,detail:0,antialias:0,debandTaps:4,quantize:true,selective:true};
const def={...base,deband:.6,chroma:.75},v9={...base,cleanup:.5,deband:.3,chroma:.75,detail:.2},debOnly={...base,deband:.6},chromaOnly={...base,chroma:.75};
const rep=(s,pairs)=>{for(const [a,b] of pairs){if(!s.includes(a))throw new Error('anchor '+a);s=s.split(a).join(b);}return s;};
const src=(u,p)=>R.spatialSource(S.spatial,R.spatialProfile(u,p));
// Experiment for the mediump steps: the chroma decision (gradient threshold, inside test, blend) in highp.
const lumDef='float lum(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}';
const chromaHp=s=>rep(s,[[lumDef,lumDef+'\nhighp float lumH(highp vec3 c){return dot(c,vec3(.2126,.7152,.0722));}'],
 ['vec2 g=vec2(lum(east)-lum(west),lum(north)-lum(south));','highp vec2 g=vec2(lumH(east)-lumH(west),lumH(north)-lumH(south));'],['float gl=length(g);','highp float gl=length(g);'],
 ['vec3 A=texture','highp vec3 A=texture'],['float yA=lum(A),yB=lum(B),Y=lum(result),span','highp float yA=lumH(A),yB=lumH(B),Y=lumH(result),span'],['float s=clamp','highp float s=clamp'],
 ['vec2 cA=','highp vec2 cA='],['vec2 inside','highp vec2 inside'],['vec2 weight=chroma','highp vec2 weight=chroma'],['vec2 cb_cr','highp vec2 cb_cr'],['float Bc','highp float Bc']]);
// Strengths as constants too (the Spec 2 candidate): only for reference, the adaptation moves them.
const allConst=(s,u)=>rep(s,[['uniform float cleanup, deband, chroma, detail, antialias;',`const float cleanup=${u.cleanup.toFixed(3)},deband=${u.deband.toFixed(3)},chroma=${u.chroma.toFixed(3)},detail=${u.detail.toFixed(3)},antialias=${u.antialias.toFixed(3)};`]]);
const progs={defHp:src(def,'highp'),defMp:src(def,'mediump'),defMpChromaHp:chromaHp(src(def,'mediump')),defMpConst:allConst(src(def,'mediump'),def),
 v9Hp:src(v9,'highp'),v9Mp:src(v9,'mediump'),debMp:src(debOnly,'mediump'),chromaMp:src(chromaOnly,'mediump'),chromaMpHp:chromaHp(src(chromaOnly,'mediump'))};
const failed={};for(const [k,code] of Object.entries(progs))try{e.programs['x3'+k]=e.compile(code);}catch(err){failed[k]=String(err.message||err).slice(0,400);}
const A=e.target('pacedx3A',W,H),Bt=e.target('pacedx3B',W,H),N=40;
const pass=(name,u)=>i=>{const t=i&1?A:Bt;e.draw(name,t,W,H,{source:e.input},u);return t;};
// render() as production calls it, upload excluded (it is the same for all), into a Fluidez slot.
const engines={gen:new R.Engine(gl,S,{spatialVariants:false}),hp:new R.Engine(gl,S,{spatialPrecision:'highp'}),mp:new R.Engine(gl,S,{spatialPrecision:'mediump'})};
const st=B.settings(OH>H?{output:String(OH)}:{});
const render=en=>()=>{B.withoutUpload(()=>en.render(video,OW,OH,st,1,false,'paced0'));return en.targets.paced0;};
const cases={genDef:pass('spatial',def),defHp:pass('x3defHp',def),defMp:pass('x3defMp',def),defMpChromaHp:pass('x3defMpChromaHp',def),defMpConst:pass('x3defMpConst',{}),
 genV9:pass('spatial',v9),v9Hp:pass('x3v9Hp',v9),v9Mp:pass('x3v9Mp',v9),
 renderGen:render(engines.gen),renderHp:render(engines.hp),renderMp:render(engines.mp)};
for(const k of Object.keys(cases))if(failed[k.replace(/^x3/,'')])delete cases[k];
const names=Object.keys(cases);
function run(fn){B.warm();let t;const s=performance.now();for(let i=0;i<N;i++)t=fn(i);finish(t.fbo);return (performance.now()-s)/N;}
// Engines feed their own input texture: copy the bench's current frame into each.
function feed(){for(const en of Object.values(engines)){gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,en.input);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,video);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);}}
const out={},scenes={caverna:4,rocha:12,noite:20};
for(const [scene,sec] of Object.entries(scenes)){await B.frameAt(sec);feed();const v={};for(const k of names){v[k]=[];run(cases[k]);}
 for(let r=0;r<3;r++){const order=[...names];for(let i=order.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[order[i],order[j]]=[order[j],order[i]];}for(const k of order){v[k].push(run(cases[k]));await sleep(0);}}
 out[scene]=Object.fromEntries(names.map(k=>[k,stat(v[k]).p50]));}
const median={};for(const k of names){const m=Object.values(out).map(s=>s[k]).sort((a,b)=>a-b);median[k]=m[1];}
// Pixel distance to the generic highp shader with the same uniforms.
const n=W*H*4,pa=new Uint8Array(n),pb=new Uint8Array(n),read=(t,p)=>{gl.bindFramebuffer(gl.FRAMEBUFFER,t.fbo);gl.readPixels(0,0,W,H,gl.RGBA,gl.UNSIGNED_BYTE,p);};
const cmp=()=>{let mx=0,s=0,ch=0,ov=0,ov8=0;for(let i=0;i<n;i++){if((i&3)===3)continue;const d=Math.abs(pa[i]-pb[i]);if(d>mx)mx=d;s+=d;if(d)ch++;if(d>1)ov++;if(d>8)ov8++;}return {max:mx,mean:+(s/(n*.75)).toFixed(4),changedPct:+(ch/(n*.75)*100).toFixed(4),over1Pct:+(ov/(n*.75)*100).toFixed(4),over1:ov,over8:ov8};};
const diffs={};
for(const [scene,sec] of [['caverna',4],['noite',20]]){await B.frameAt(sec);diffs[scene]={};
 for(const [k,u,ref] of [['defHp',def],['defMp',def],['defMpChromaHp',def],['defMpConst',{},def],['v9Hp',v9],['v9Mp',v9],['debMp',debOnly],['chromaMp',chromaOnly],['chromaMpHp',chromaOnly]]){
  if(failed[k])continue;e.draw('spatial',A,W,H,{source:e.input},ref||u);read(A,pa);e.draw('x3'+k,Bt,W,H,{source:e.input},u);read(Bt,pb);diffs[scene][k]=cmp();}}
// render() output of the three engines (last frame fed), whole pipeline at output size.
{await B.frameAt(20);feed();const m=OW*OH*4,ra=new Uint8Array(m),rb=new Uint8Array(m),rd=(en,p)=>{B.withoutUpload(()=>en.render(video,OW,OH,st,1,false,'paced0'));gl.bindFramebuffer(gl.FRAMEBUFFER,en.targets.paced0.fbo);gl.readPixels(0,0,OW,OH,gl.RGBA,gl.UNSIGNED_BYTE,p);};
 rd(engines.gen,ra);for(const k of ['hp','mp']){rd(engines[k],rb);let mx=0,ov=0;for(let i=0;i<m;i++){if((i&3)===3)continue;const d=Math.abs(ra[i]-rb[i]);if(d>mx)mx=d;if(d>1)ov++;}diffs['render-'+k]={max:mx,over1Pct:+(ov/(m*.75)*100).toFixed(4)};}}
const programs=Object.fromEntries(Object.entries(engines).map(([k,en])=>[k,Object.keys(en.programs).filter(x=>x.startsWith('spatial@'))]));
for(const en of Object.values(engines))en.destroy();
await video.play();
const f=gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER,gl.MEDIUM_FLOAT);
return {median,scenes:out,diffs,failed,programs,auto:R.spatialPrecision(gl),benchEngine:e.spatialPrecision,mediumFloat:{precision:f.precision,rangeMin:f.rangeMin,rangeMax:f.rangeMax},glError:gl.getError(),output:[OW,OH]};
})()

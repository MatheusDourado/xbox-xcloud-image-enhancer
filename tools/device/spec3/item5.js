// Spec 3 items 5 and 8 in the Spec 2 bench (tools/device/spec2/bench.html, with passes.js loaded).
// Burst cost (GPU at its top clock) of the shipped passes and whole frames: EASU + sharpening against SGSR,
// and with Fluidez the copy in present() against the last pass deferred to present() (item 8).
// Upload excluded (same for all). Also the SGSR mediump/highp pixel distance on real frames.
// Usage: BX_MEAS_DIR=spec3 node tools/device/spec2/meas.cjs <poco|vostro> <name> "<query>" tools/device/spec3/item5.js
(async()=>{
const {e,gl,video,W,H,OW,OH,sleep,stat,finish}=B,S=BxShaders,R=BxRestoration;
const up=OW>W&&OH>H,base=B.settings(up?{output:String(OH)}:{}),sg={...base,scaler:'sgsr'};
const spatialU={cleanup:0,deband:.6,chroma:.75,detail:0,antialias:0,debandTaps:4,quantize:true,selective:true};
const A=e.target('pacedx5A',W,H),O1=e.target('pacedx5O1',OW,OH),O2=e.target('pacedx5O2',OW,OH),SRC=e.target('pacedx5S',OW,OH),N=40;
const hp=e.compile(R.sgsrSource(S.sgsr,'highp'));e.programs.x5sgsrHp=hp;
const sharpU={iResolution:[OW,OH],qualityMode:false,rcasStrength:.2,haloMargin:4/255,noiseFloor:4/255,lumaSharpen:true,sharpenFactor:2/1.2,brightness:1,contrast:1,saturation:1,shadows:0,deband:.6,diagnostic:false};
const sgU={...R.sgsrParams(2),brightness:1,contrast:1,saturation:1,shadows:0,deband:.6,diagnostic:false};
const pair=i=>i&1?O1:O2;
let slot=0;const nextSlot=()=>'paced'+(slot=(slot+1)%3);
const frame=(s,mode)=>i=>{B.withoutUpload(()=>{
 if(mode==='canvas')e.render(video,OW,OH,s,1,false);
 else{const name=nextSlot();e.render(video,OW,OH,s,1,false,name,mode==='defer');if(mode!=='slot')e.present(name);}});
 return mode==='slot'?e.targets['paced'+slot]:null;};
const cases={
 easuPass:i=>{const t=pair(i);e.draw('easu',t,OW,OH,{source:A.texture});return t;},
 nitidezPass:i=>{const t=pair(i),p=e.programs.casFiltered;gl.useProgram(p.program);gl.uniform1i(gl.getUniformLocation(p.program,'filterId'),1);e.draw('casFiltered',t,OW,OH,{data:SRC.texture},sharpU);return t;},
 sgsrPass:i=>{const t=pair(i);e.draw('sgsr',t,OW,OH,{source:A.texture},sgU);return t;},
 sgsrHpPass:i=>{const t=pair(i);e.draw('x5sgsrHp',t,OW,OH,{source:A.texture},sgU);return t;},
 copyPass:i=>{const t=pair(i);e.draw('copy',t,OW,OH,{source:SRC.texture});return t;},
 directEasu:frame(base,'canvas'),directSgsr:frame(sg,'canvas'),
 fluCopyEasu:frame(base,'copy'),fluDeferEasu:frame(base,'defer'),fluCopySgsr:frame(sg,'copy'),fluDeferSgsr:frame(sg,'defer'),
};
const names=Object.keys(cases);
function run(fn){B.warm();let t;const s=performance.now();for(let i=0;i<N;i++)t=fn(i);finish(t?t.fbo:null);return (performance.now()-s)/N;}
function feed(){e.draw(e.spatialVariant(spatialU,true),A,W,H,{source:e.input},spatialU);e.draw('easu',SRC,OW,OH,{source:A.texture});finish(SRC.fbo);}
const out={},scenes={caverna:4,rocha:12,noite:20};
for(const [scene,sec] of Object.entries(scenes)){await B.frameAt(sec);feed();const v={};for(const k of names){v[k]=[];run(cases[k]);}
 for(let r=0;r<3;r++){const order=[...names];for(let i=order.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[order[i],order[j]]=[order[j],order[i]];}for(const k of order){v[k].push(run(cases[k]));await sleep(0);}}
 out[scene]=Object.fromEntries(names.map(k=>[k,stat(v[k]).p50]));}
const median={};for(const k of names){const m=Object.values(out).map(s=>s[k]).sort((a,b)=>a-b);median[k]=m[1];}
// SGSR as compiled for this GPU against highp, and the deferred present against the copy, on the canvas.
const n=OW*OH*4,pa=new Uint8Array(n),pb=new Uint8Array(n),read=(fbo,p)=>{gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.readPixels(0,0,OW,OH,gl.RGBA,gl.UNSIGNED_BYTE,p);};
const cmp=()=>{let mx=0,s=0,ch=0,ov=0;for(let i=0;i<n;i++){if((i&3)===3)continue;const d=Math.abs(pa[i]-pb[i]);if(d>mx)mx=d;s+=d;if(d)ch++;if(d>1)ov++;}return {max:mx,mean:+(s/(n*.75)).toFixed(4),changedPct:+(ch/(n*.75)*100).toFixed(4),over1Pct:+(ov/(n*.75)*100).toFixed(4)};};
const diffs={};
for(const [scene,sec] of [['caverna',4],['noite',20]]){await B.frameAt(sec);feed();diffs[scene]={};
 e.draw('x5sgsrHp',O1,OW,OH,{source:A.texture},sgU);read(O1.fbo,pa);e.draw('sgsr',O2,OW,OH,{source:A.texture},sgU);read(O2.fbo,pb);diffs[scene].sgsrAutoVsHighp=cmp();
 for(const [k,s] of [['easu',base],['sgsr',sg]]){B.withoutUpload(()=>{e.render(video,OW,OH,s,1,false,'paced7');e.present('paced7');});read(null,pa);
  B.withoutUpload(()=>{e.render(video,OW,OH,s,1,false,'paced8',true);e.present('paced8');});read(null,pb);diffs[scene]['deferVsCopy_'+k]=cmp();}}
await video.play();
return {median,scenes:out,diffs,precision:e.spatialPrecision,upscale:up,output:[OW,OH],glError:gl.getError()};
})()

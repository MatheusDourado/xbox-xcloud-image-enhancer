from pathlib import Path
# Real WebGL2 checks, without executing xCloud network/authentication code.
probe=r'''
(async()=>{
 const checks=[];function check(ok,label){if(!ok)throw new Error(label);checks.push(label);}
 const canvas=document.createElement('canvas');canvas.width=128;canvas.height=96;document.body.append(canvas);
 const gl=canvas.getContext('webgl2',{preserveDrawingBuffer:true,antialias:false});
 const engine=new BxRestoration.Engine(gl,BxShaders);
 const input=document.createElement('canvas');input.width=128;input.height=96;const ctx=input.getContext('2d');
 const pixels=()=>{const b=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,b);return b;};
 function pattern(){for(let x=0;x<128;x++){const v=x<64?50:62;ctx.fillStyle=`rgb(${v},${v},${v})`;ctx.fillRect(x,0,1,96);}ctx.fillStyle='white';ctx.fillRect(8,8,20,20);}
 pattern();const s=BxRestoration.normalize({cleanup:1,deband:0,temporal:0,mode:'original'});
 engine.render(input,128,96,s,0);const original=pixels();check(gl.getError()===gl.NO_ERROR,'Original source renders');
 s.mode='cas';engine.render(input,128,96,s,.016);const cas=pixels();check(cas.some((v,i)=>v!==original[i]),'CAS changes source');
 s.mode='filtered';engine.render(input,128,96,s,.032);const filtered=pixels();const jump=b=>Math.abs(b[(40*128+64)*4]-b[(40*128+63)*4]);
 check(jump(filtered)<jump(cas),'Compression reduces synthetic boundary discontinuity');check(filtered.some((v,i)=>v!==cas[i]),'Compression stage changes pixels');
 check(gl.getError()===gl.NO_ERROR,'Spatial and CAS shaders compile/render');
 s.cleanup=0;s.deband=0;s.detail=0;s.chroma=0;engine.render(input,128,96,s,.048);const neutral=pixels();
 check(Array.from({length:30},(_,x)=>neutral[(40*128+x+50)*4]).every(v=>v>=46&&v<=66),'Halo limiter keeps step inside neighborhood bounds');
 s.detail=BxRestoration.defaults.detail;s.chroma=BxRestoration.defaults.chroma;engine.render(input,128,96,s,.050);const stacked=pixels();
 check(Array.from({length:30},(_,x)=>stacked[(40*128+x+50)*4]).every(v=>v>=45&&v<=67),'Default detail plus CAS adds at most one level beyond the CAS bound');
 s.deband=1;for(let x=0;x<128;x++){const v=30+Math.floor(x/16)*5;ctx.fillStyle=`rgb(${v},${v},${v})`;ctx.fillRect(x,0,1,96);}
 s.mode='cas';engine.render(input,128,96,s,.064);const bands=pixels();s.mode='filtered';engine.render(input,128,96,s,.080);const debanded=pixels();
 check(debanded.some((v,i)=>v!==bands[i]),'Debanding changes stepped gradient');
 s.temporal=1;engine.render(input,128,96,s,.096);engine.render(input,128,96,s,.112);
 check(engine.previous!==null&&gl.getError()===gl.NO_ERROR,'Temporal block search and history run');
 ctx.fillStyle='white';ctx.fillRect(0,0,128,96);engine.render(input,128,96,s,.128);const cut=pixels();check(cut.every((v,i)=>i%4===3||v>=254),'Cut rejects old dark history');
 ctx.fillStyle='black';ctx.fillRect(0,0,128,96);engine.render(input,128,96,s,.144);const black=pixels();check(black.every((v,i)=>i%4===3||v<=1),'Black remains black without NaN');
 canvas.width=256;canvas.height=192;engine.render(input,256,192,s,.160);check(gl.getError()===gl.NO_ERROR,'FSR EASU compiles and upscales');
 check(pixels().every((v,i)=>i%4===3||v<=1),'FSR preserves flat black');
 engine.render(input,256,192,s,.176,true);check(pixels().some((v,i)=>i%4===0&&v>100),'Diagnostic tint is visible');
 s.mode='cas';engine.render(input,256,192,s,.192);check(pixels().every((v,i)=>i%4===3||v<=1),'CAS comparison removes diagnostic');
 engine.resetHistory();check(engine.previous===null,'Pause/seek clears history');
 engine.budget.temporalAllowed=false;engine.budget.debandScale=0;engine.resetBudget();check(engine.budget.temporalAllowed&&engine.budget.debandScale===1,'Reset restores performance budget');
 const adapterInput=document.createElement('canvas');adapterInput.width=128;adapterInput.height=96;adapterInput.currentTime=0;
 const player=new WebGL2Player(adapterInput);await player.setupShaders();player.updateFrame();
 check(player.gl.getParameter(player.gl.CURRENT_PROGRAM)===player.program,'Adapter restores Better xCloud GL program');
 player.refreshPlayer();check(player.gl.getError()===player.gl.NO_ERROR,'Better xCloud settings refresh remains valid');
 const count=player.bxEngine.frames;player.updateFrame();check(player.bxEngine.frames===count,'Duplicate source frame skipped');
 BxImageFilter.settings.mode='cas';player.updateFrame();check(player.bxEngine.frames===count+1,'Control change redraws paused frame');
 {const before=player.bxEngine.frames;player.bxTiming.presented=(player.bxTiming.presented||0)+1;player.updateFrame();
  check(player.bxEngine.frames===before+1,'A newly presented frame renders even when the decoded-frame counter did not advance');
  player.updateFrame();check(player.bxEngine.frames===before+1,'The same presented frame is not processed twice');}
 player.bxEngine.budget.temporalAllowed=false;BxImageFilter.reset();check(player.bxEngine.budget.temporalAllowed,'Panel reset clears adaptation');
 // status.neural follows the engine that draws: cut by its budget, never without float targets, off at 0.
 {const st=BxImageFilter.status,eng=player.bxEngine;check(st.neural==='off','Neural state is off while the slider is at 0');
  BxImageFilter.settings.neural=.5;player.updateFrame();
  check(st.neural===(eng.floatTargets?'running':'no-float')&&player.gl.getError()===player.gl.NO_ERROR,'Neural runs with float targets ('+st.neural+', floatTargets '+eng.floatTargets+')');
  // The first render after reset() rebuilt the budget for the saved limit: cut the one in use now.
  eng.budget.neuralAllowed=false;adapterInput.currentTime+=.016;player.updateFrame();
  check(st.neural==='cut'&&player.gl.getError()===player.gl.NO_ERROR,'Neural asked for but cut by the budget reads cut');
  eng.budget.neuralAllowed=true;adapterInput.currentTime+=.016;player.updateFrame();check(st.neural!=='cut','Allowed again, the state leaves cut');
  const ft=eng.floatTargets;eng.floatTargets=false;adapterInput.currentTime+=.016;player.updateFrame();check(st.neural==='no-float','Without float targets the neural state reads no-float');eng.floatTargets=ft;
  BxImageFilter.settings.mode='cas';player.updateFrame();check(st.neural==='off','Comparison modes read off');BxImageFilter.settings.mode='filtered';
  BxImageFilter.settings.neural=0;player.updateFrame();check(st.neural==='off','Back to 0 reads off');}
 
 const prevCount=player.bxEngine.frames;
 BxImageFilter.settings.mode='filtered';player.updateFrame();
 const readPlayer=()=>{const b=new Uint8Array(player.$canvas.width*player.$canvas.height*4);player.gl.readPixels(0,0,player.$canvas.width,player.$canvas.height,player.gl.RGBA,player.gl.UNSIGNED_BYTE,b);return b;};
 adapterInput.getContext('2d').fillStyle='#555';adapterInput.getContext('2d').fillRect(0,0,64,96);adapterInput.getContext('2d').fillStyle='#999';adapterInput.getContext('2d').fillRect(64,0,64,96);
 BxImageFilter.settings.sharpness=0;player.updateFrame();const noSharp=readPlayer();const beforeSharpCount=player.bxEngine.frames;
 const pacingCount=player.bxTimes.length;
 BxImageFilter.settings.sharpness=5;player.updateFrame();const withSharp=readPlayer();
 check(player.bxTimes.length===pacingCount,'Redrawing the same frame after a setting change does not count as a new video frame');
 check(withSharp.some((v,i)=>v!==noSharp[i]),'Panel sharpness changes actual filtered pixels');check(player.bxEngine.frames===beforeSharpCount+1,'Panel sharpness redraws unchanged video frame');
 prefs['video.processing.sharpness']=9;player.updateFrame();check(player.bxEngine.frames===beforeSharpCount+1,'Native sharpness slider does not override the panel');
 BxImageFilter.settings.mode='cas';player.updateFrame();const refFive=readPlayer();BxImageFilter.settings.sharpness=1;player.updateFrame();
 check(readPlayer().some((v,i)=>v!==refFive[i]),'CAS-only reference follows panel sharpness');BxImageFilter.settings.mode='filtered';BxImageFilter.settings.sharpness=5;player.updateFrame();
 prefs['video.processing.mode']='quality';player.updateFrame();check(player.gl.getError()===player.gl.NO_ERROR,'Native quality mode remains valid');
 const qualityPixels=readPlayer();check(Math.abs(qualityPixels[(40*128+20)*4]-85)<=1,'Quality halo limiter preserves uniform region luminance');
 const menu=document.createElement('section');document.body.append(menu);BxImageFilter.mountControls(menu);
 check(menu.querySelector('[data-bx-restoration="v10.1.0"]')&&!document.getElementById('bx-image-filter-panel'),'Controls mount inside supplied Better xCloud menu');
 const sleep=ms=>new Promise(r=>setTimeout(r,ms)),root=menu.querySelector('.bxif-panel');
 // Better xCloud's D-pad on a focused range: value = parseInt(value) + parseInt(step) * dir, then a non-bubbling 'input'.
 const pad=(el,dir)=>{el.value=(parseInt(el.value)+parseInt(el.step)*dir).toString();el.dispatchEvent(new InputEvent('input'));};
 const choose=(el,index)=>{el.value=String(index);el.dispatchEvent(new InputEvent('input'));};
 for(const head of menu.querySelectorAll('.bxif-sec:not([data-open]) > .bxif-sec-head'))head.click();
 menu.scrollIntoView();
 check(!menu.querySelector('svg')&&!root.classList.contains('bx-settings-row')&&!menu.querySelector('.bx-focusable')&&!menu.querySelector('select'),'Panel uses no svg, select, bx-settings-row root or bx-focusable class');
 check([...menu.querySelectorAll('input[data-bxif-key]')].every(i=>i.tabIndex>=0&&i.getAttribute('aria-label')&&i.type==='range'&&/^\d+$/.test(i.step)&&i.hasAttribute('aria-valuetext')),'Every setting is a focusable integer-step range with aria-label and aria-valuetext');
 check(menu.querySelectorAll("input[data-bxif-kind=slider]").length===8,"Sharpness, neural, compression, gradient, chroma, detail, temporal and AA sliders added");
 {const sh=menu.querySelector("input[data-bxif-key=sharpness]");check(sh?.max==="20"&&sh.step==="1"&&sh.value===String(Math.round(BxImageFilter.settings.sharpness*2)),"Panel sharpness slider maps 0-10 in half steps to an integer 0-20 range");}
 {const hintOf=k=>menu.querySelector(`input[data-bxif-key=${k}]`).closest('.bxif-row').querySelector('.bxif-hint').textContent;
  check(/\+45% de GPU em sessão a 30 FPS/.test(hintOf('neural'))&&/qualquer valor acima de 0 custa o mesmo/.test(hintOf('neural'))&&!/30%/.test(menu.querySelector('.bxif-panel').textContent)&&!/2,5/.test(hintOf('sharpness')),'Neural hint gives the measured +45% and no sharpness advice');
  check(/degraus de bloco/.test(hintOf('cleanup'))&&/não remove ringing nem mosquito/.test(hintOf('cleanup'))&&/~10 Mb\/s/.test(hintOf('cleanup')),'Compression hint says what it does not remove');
  check(/mesmas frequências finas que a Nitidez/.test(hintOf('detail'))&&/35%/.test(hintOf('detail'))&&/halo e cintilação/.test(hintOf('detail')),'Detail hint warns about the overlap with sharpening and the preset ceiling');
  check(/apaga textura/.test(hintOf('deband'))&&/borra bordas suaves de baixo contraste/.test(hintOf('deband')),'Deband hint keeps the texture warning and adds low-contrast edges');
  const timer=BxImageFilter.status.measurement==='gpu';await new Promise(r=>setTimeout(r,700));const text=menu.querySelector('.bxif-panel').textContent;
  check(timer?/Equilíbrio padrão/.test(hintOf('gpuBudget'))&&/Acima do limite \(p95\)/.test(hintOf('gpuBudget'))&&/Tratamento \(GPU p95\)/.test(text):/3, 6 e 10 ms se comportam igual/.test(hintOf('gpuBudget'))&&!/Equilíbrio padrão/.test(hintOf('gpuBudget'))&&/Tratamento \(GPU ≈ fence, p95\)/.test(text),'Budget hint and GPU label follow the measurement kind ('+BxImageFilter.status.measurement+')');
  const m=menu.querySelector('input[data-bxif-key=sharpening]');m.value='3';m.dispatchEvent(new InputEvent('input'));check(/Segue o Processamento do menu do Better xCloud/.test(hintOf('sharpening')),'Nativo hint follows the Better xCloud menu on the old site');m.value='0';m.dispatchEvent(new InputEvent('input'));}
 const sharpening=menu.querySelector('input[data-bxif-key=sharpening]');choose(sharpening,2);player.updateFrame();
 check(BxImageFilter.settings.sharpening==='rcas'&&player.gl.getError()===player.gl.NO_ERROR,'RCAS selector renders through native adapter');
 const measure=[...menu.querySelectorAll('button')].find(b=>b.textContent==='Iniciar medição');await measure.onclick();
 adapterInput.currentTime+=.016;player.updateFrame();
 check(player.bxEngine.diagnostics.report().segments.length===1,'Menu starts opt-in diagnostic capture');
 let exported=null;const download=BxRestoration.downloadReport;BxRestoration.downloadReport=r=>exported=r;
 await [...menu.querySelectorAll('button')].find(b=>b.textContent==='Encerrar e exportar medição').onclick();BxRestoration.downloadReport=download;
 check(exported?.segments.length===1&&!exported.recording&&exported.final,'Menu exports a stopped diagnostic report');
 check(exported.status.neural==='off'&&['gpu','cadence'].includes(exported.status.measurement)&&[null,'timer','fence'].includes(exported.segments[0].gpu.method)&&exported.segments[0].gpu.method!=='timestamp','Report carries the neural state, the measurement kind and the gpu method of the segment ('+exported.segments[0].gpu.method+')');
 // Audit 3.5: the passes each frame ran, the last pass, the cpu series, the events and the GPU metadata.
 {const seg=exported.segments[0],seq=seg.passes[0]?.sequence||'',last=seq.split(',').pop().replace(/[#@].*$/,'');
  check(exported.schema===3&&seg.passes.length>=1&&seq.startsWith('upload,')&&seg.passes[0].frames>=1&&seg.final&&seg.final.name===last,'Report lists the pass sequence and the last pass of the segment ('+seq+')');
  check(seg.cpu.count>=1&&seg.cpu.hitches===null&&seg.cpu.p50>=0&&'slack' in seg&&'pipeline' in seg&&seg.slack.hitches===null,'Report keeps the main-thread cost per frame with slack and pipeline series');
  check(Array.isArray(exported.events)&&exported.eventsTruncated===false&&exported.sampleLimit.events===500,'Report has a bounded event list');
  check(exported.status.resolution===BxImageFilter.status.resolution&&'adaptation' in exported.status&&'display' in exported.status&&exported.status.renderer.active==='webgl2','Report status carries adaptation, display, resolution and the renderer');
  check('gpu' in exported.metadata&&typeof exported.metadata.parallelCompile==='boolean'&&['highp','mediump'].includes(exported.metadata.spatialPrecision)&&Number.isFinite(exported.metadata.warmMs),'Report metadata names the GPU, the spatial precision, parallel compilation and the warm-up time');}
 choose(sharpening,3);check(BxImageFilter.settings.sharpening==='native','Method choice cycles to the native processing');
 const slider=menu.querySelector('input[data-bxif-key=cleanup]');slider.value='70';slider.dispatchEvent(new InputEvent('input'));check(BxImageFilter.settings.cleanup===.7,'Native menu controls persist settings');
 const menu2=document.createElement('section');document.body.append(menu2);BxImageFilter.mountControls(menu2);check(menu2.querySelector('input[data-bxif-key=cleanup]').value==='70'&&!menu.querySelector('[data-bx-restoration]')&&menu2.querySelector('.bxif-panel')===root,'Rebuilt menu retains controls and settings');
 menu2.scrollIntoView();
 // Gamepad: integer steps change Nitidez by 0.5 and switch the panel to the focus-ring style.
 {const sh=menu2.querySelector('input[data-bxif-key=sharpness]');sh.focus();const before=BxImageFilter.settings.sharpness;pad(sh,1);
  check(BxImageFilter.settings.sharpness===before+.5&&root.dataset.nav==='1'&&sh.getAttribute('aria-valuetext')===(before+.5).toFixed(1).replace('.',','),'Gamepad Right on Nitidez adds 0.5 (integer range step)');
  pad(sh,-1);check(BxImageFilter.settings.sharpness===before,'Gamepad Left on Nitidez subtracts 0.5');
  // Better xCloud keeps firing 'input' at the clamp end; update() (which resets the GPU adaptation) runs once.
  const orig=BxImageFilter.update;let calls=0;BxImageFilter.update=patch=>{calls++;return orig(patch);};
  sh.value='20';sh.dispatchEvent(new InputEvent('input'));pad(sh,1);
  const sp=menu2.querySelector('input[data-bxif-key=spatialMode]');choose(sp,1);pad(sp,1);await sleep(320);BxImageFilter.update=orig;
  check(calls===2&&BxImageFilter.settings.sharpness===10&&BxImageFilter.settings.spatialMode==='legacy'&&sp.value==='1','Repeated input at the max index calls update() once (slider and heavy choice)');
  choose(sp,0);sh.value=String(before*2);sh.dispatchEvent(new InputEvent('input'));sh.blur();await sleep(320);
  check(BxImageFilter.settings.spatialMode==='selective'&&BxImageFilter.settings.sharpness===before,'Choices and sliders restore their values');}
 // A on a choice cycles it (an untrusted click from Better xCloud); a tap on a segment selects it.
 {const mode=menu2.querySelector('input[data-bxif-key=mode]');mode.dispatchEvent(new MouseEvent('click',{bubbles:true}));
  check(BxImageFilter.settings.mode==='original'&&mode.value==='0','A cycles a choice to its next option');
  mode.closest('.bxif-seg').querySelector('.bxif-seg-opt[data-i="2"]').click();check(BxImageFilter.settings.mode==='filtered','Tapping a segment selects it');}
 // Presets apply their values and highlight the active chip.
 {const chip=k=>menu2.querySelector(`[data-preset=${k}]`);chip('console').click();
  check(BxImageFilter.preset()==='console'&&BxImageFilter.settings.sharpness===2&&chip('console').getAttribute('aria-pressed')==='true'&&chip('natural').getAttribute('aria-pressed')==='false'&&menu2.querySelector('input[data-bxif-key=sharpness]').value==='4','Preset chip applies its values and is highlighted');
  menu2.querySelector('input[data-bxif-key=detail]').value='50';menu2.querySelector('input[data-bxif-key=detail]').dispatchEvent(new InputEvent('input'));
  check(BxImageFilter.preset()==='custom'&&![...menu2.querySelectorAll('.bxif-chip')].some(b=>b.getAttribute('aria-pressed')==='true'),'Changing a value leaves the presets (Personalizado)');
  chip('natural').click();check(BxImageFilter.preset()==='natural'&&chip('natural').getAttribute('aria-pressed')==='true','Natural preset restores the measured defaults');}
 // Captura de quadros only with Fluidez on.
 {const capture=menu2.querySelector('input[data-bxif-key=capture]'),fluidity=menu2.querySelector('input[data-bxif-key=fluidity]');
  check(BxImageFilter.settings.fluidity==='off'&&capture.disabled,'Captura is disabled while Fluidez is off');
  choose(fluidity,1);check(BxImageFilter.settings.fluidity==='balanced'&&capture.disabled===!BxImageFilter.directSupported(),'Captura follows Fluidez');
  choose(fluidity,0);await sleep(320);check(BxImageFilter.settings.fluidity==='off'&&capture.disabled,'Fluidez off disables Captura again');}
 // No horizontal scroll at Better xCloud's 430 px content width.
 {menu2.style.width='430px';await sleep(50);check(root.scrollWidth<=root.clientWidth&&root.getBoundingClientRect().width<=430,'Panel fits 430 px without horizontal scroll ('+root.scrollWidth+')');menu2.style.width='';}
 // Live decoder line from a simulated WebRTC connection (two snapshots 2 s apart: 60 frames, 0.6 s decode).
 {let n=0;window.STATES={currentStream:{peerConnection:{getStats:async()=>{n++;return new Map([['v',{type:'inbound-rtp',kind:'video',framesDecoded:100+60*n,totalDecodeTime:.6*n,jitterBufferDelay:.9*n,jitterBufferEmittedCount:60*n,framesPerSecond:30,codecId:'c',powerEfficientDecoder:true,decoderImplementation:'MediaCodec'}],['c',{mimeType:'video/H264',sdpFmtpLine:'profile-level-id=640c1f'}],['p',{type:'candidate-pair',nominated:true,state:'succeeded',currentRoundTripTime:.042}]]);}}}};
  const out=name=>menu2.querySelector(`[data-bxif-out=${name}]`).textContent;
  const live=()=>/Decodificação hardware \(MediaCodec\)/.test(out('decoder'))&&/Vídeo recebido .* · 30 FPS · H264 High/.test(out('stream'))&&/Rede \(RTT\) 42 ms/.test(out('latency'))&&/Buffer 15 ms/.test(out('latency'))&&/Decodificação 10 ms/.test(out('latency'));
  for(let t=0;t<16&&!live();t++)await new Promise(r=>setTimeout(r,500));
  check(live(),'Panel shows codec profile, FPS, decoder and latency breakdown from WebRTC stats');
  check(/H264 High · HW/.test(out('meta')),'Live card shows codec and hardware decoding');
  // Smoothing reaches the video receiver of the live connection while playing.
  const receiver={track:{kind:'video'},jitterBufferTarget:null};window.STATES.currentStream.peerConnection.getReceivers=()=>[receiver];
  const smoothing=menu2.querySelector('input[data-bxif-key=smoothing]'),budgetBefore=player.bxEngine.budget;
  choose(smoothing,2);
  check(receiver.jitterBufferTarget===33&&player.bxEngine.budget===budgetBefore,'Smoothing applies immediately without rendering or resetting the GPU budget');
  await new Promise(r=>setTimeout(r,1100));
  check(/alvo 33 ms/.test(out('smoothing')),'Panel distinguishes the requested buffering target from measured delay');
  window.STATES.currentStream.peerConnection.getReceivers=()=>[{track:{kind:'video'}}];
  await new Promise(r=>setTimeout(r,2100));check(/\(não suportado\)/.test(out('smoothing')),'Panel reports unsupported smoothing');
  window.STATES.currentStream.peerConnection.getReceivers=()=>[receiver];
  BxImageFilter.settings.smoothing=0;await new Promise(r=>setTimeout(r,1100));adapterInput.currentTime+=.04;player.updateFrame();check(receiver.jitterBufferTarget===null,'Smoothing off restores the default buffer');
  // Frame pacing line from the frames the adapter rendered.
  for(let k=0;k<6;k++){adapterInput.currentTime+=.033;player.updateFrame();await new Promise(r=>setTimeout(r,34));}
  await new Promise(r=>setTimeout(r,1100));check(/Travadas \d+ · Pulados/.test(out('pacing'))&&/SERVIDOR(—|±[0-9,]+).*CHEGADA(—|±[0-9,]+).*TELA±[0-9,]+p95 [0-9,]+/.test(out('pipeline'))&&/^±[0-9,]+ms$/.test(out('kpi-pacing').replace(/^Ritmo/i,'').replace(/p95.*$/,'')),'Panel shows frame pacing and its origin');
  // Fluidez: frames go to persistent textures and reach the canvas on the pacer's clock.
  BxImageFilter.settings.fluidity='balanced';
  for(let k=0;k<8;k++){adapterInput.getContext('2d').fillStyle=k%2?'#222':'#ddd';adapterInput.getContext('2d').fillRect(0,0,128,96);adapterInput.currentTime+=.033;player.updateFrame();await new Promise(r=>setTimeout(r,34));}
  await new Promise(r=>setTimeout(r,1100));
  const pacedTargets=Object.keys(player.bxEngine.targets).filter(n=>n.startsWith('paced'));
  check(pacedTargets.length>=2&&player.bxTiming.pacer&&player.bxTiming.display.length>=4,'Fluidez renders into persistent textures and presents on its clock '+pacedTargets.join(','));
  check(/Espera da Fluidez \+[0-9,]+ ms · descartados/.test(out('fluidity')),'Panel shows the pacer delay');
  // The canvas buffer is cleared after compositing; check the texture that was presented instead. Since
  // Spec 3 item 8 it holds the input of the last pass, which present() draws at canvas size.
  {const g=player.gl,t=player.bxEngine.targets[player.bxTiming.shown],px=t.fp?new Float32Array(4):new Uint8Array(4);g.bindFramebuffer(g.FRAMEBUFFER,t.fbo);g.readPixels(10,10,1,1,g.RGBA,t.fp?g.FLOAT:g.UNSIGNED_BYTE,px);g.bindFramebuffer(g.FRAMEBUFFER,null);if(t.fp)px[0]*=255;
   check(t&&t.final&&t.final.w===player.$canvas.width&&t.final.h===player.$canvas.height&&px[0]>10,'Presented frame holds the processed image at canvas size');}
  BxImageFilter.settings.fluidity='off';adapterInput.currentTime+=.033;player.updateFrame();
  check(!player.bxTiming.pacer&&!Object.keys(player.bxEngine.targets).some(n=>n.startsWith('paced')),'Turning Fluidez off releases its textures and loop');
  const copyButton=[...menu2.querySelectorAll('button')].find(b=>b.textContent==='Copiar configuração');copyButton.click();await new Promise(r=>setTimeout(r,200));
  const exported=JSON.parse(menu2.querySelector('textarea').value);
  check(exported.treatment&&'smoothing' in exported.treatment&&'stream.video.resolution' in exported.betterXcloud&&exported.build==='6.7.12-imagefilter.10.1.0','Copy configuration exports treatment and Better xCloud settings');
  check(exported.status.neural==='off'&&['gpu','cadence'].includes(exported.status.measurement),'Copy configuration carries the neural state and the measurement kind');
  check(!menu2.querySelector('[aria-label="Codec (teste)"]')&&!menu2.querySelector('[data-bxif-key=refreshRate]'),'No codec test; refresh-rate control only inside the Android app');
  delete window.STATES;}
 // Exercise the browser's actual receiver setter, without media permissions or a remote service.
 {const pc=new RTCPeerConnection();const receiver=pc.addTransceiver('video').receiver;
  const result=BxRestoration.applySmoothing(pc,33);
  check(result.state==='requested'||result.state==='unsupported','Native WebRTC receiver reports buffering capability');
  if('jitterBufferTarget' in receiver){check(receiver.jitterBufferTarget===33,'Native receiver accepts the millisecond target');BxRestoration.applySmoothing(pc,0);check(receiver.jitterBufferTarget===null,'Native receiver restores the default target');}
  pc.close();}
 // Android app bridge: the refresh-rate selector appears once the bridge exists and calls the app.
 {let set=null;window.BxAndroid={getRefreshRates:()=>'[60,90,120]',getRefreshRate:()=>0,setRefreshRate:v=>{set=v;}};
  let sel=null;for(let t=0;t<10&&!(sel=menu2.querySelector('input[data-bxif-key=refreshRate]'));t++)await new Promise(r=>setTimeout(r,300));
  check(sel&&sel.dataset.bxifValues==='0,60,90,120'&&sel.closest('[data-bxif-row=refreshRate]').previousElementSibling?.dataset.bxifRow==='smoothing','Android app shows fixed refresh-rate options after Suavidade');
  choose(sel,3);check(set===120,'Selecting a refresh rate calls the app bridge');delete window.BxAndroid;}
 // In-game HUD: only while enabled and frames are treated; inert, cheap, and gone when off.
 {check(!document.querySelector('.bxif-hud')&&BxImageFilter.hud.timers()===0,'HUD off: no element and no timers');
  adapterInput.currentTime+=.033;player.updateFrame();
  choose(menu2.querySelector('input[data-bxif-key=hud]'),1);
  const hud=document.querySelector('.bxif-hud'),cs=hud&&getComputedStyle(hud);
  check(BxImageFilter.settings.hud==='compact'&&hud&&hud.hasAttribute('data-show')&&cs.display!=='none'&&hud.parentElement===document.documentElement,'HUD shows while frames are treated');
  check(cs.pointerEvents==='none'&&hud.inert&&hud.getAttribute('aria-hidden')==='true'&&!hud.querySelectorAll('[tabindex],button,input,a,select,textarea').length&&cs.position==='fixed'&&+cs.zIndex>1000&&+cs.zIndex<2000,'HUD is inert, unfocusable and between the game bar and Better xCloud dialogs');
  check(!menu2.querySelector('[data-bxif-row=hudPosition]').hasAttribute('data-hide'),'Canto appears when the HUD is on');
  let batches=0;const mo=new MutationObserver(()=>batches++);mo.observe(hud,{subtree:true,childList:true,characterData:true});
  for(let i=0;i<6;i++){adapterInput.currentTime+=.033;player.updateFrame();await sleep(500);}
  mo.disconnect();
  check(batches>0&&batches<=12,'HUD writes at most 4 batches per second ('+batches+' in 3 s)');
  check(/\d/.test(hud.textContent)&&hud.querySelector('canvas').width>0,'HUD shows live values and a sparkline');
  choose(menu2.querySelector('input[data-bxif-key=hud]'),2);
  check(hud.dataset.layout==='full'&&hud.dataset.mode==='full'&&/RITMO|Ritmo/.test(hud.textContent),'HUD full layout');
  BxImageFilter.status.neural='cut';await sleep(600);check(/SEM NEURAL/.test(hud.textContent),'HUD full marks a neural restoration asked for and not drawn');
  choose(menu2.querySelector('input[data-bxif-key=hud]'),1);await sleep(600);check(hud.dataset.layout==='card'&&/SEM NEURAL/.test(hud.textContent),'HUD compact shows the same mark as a tag');
  BxImageFilter.status.neural='off';await sleep(600);check(!/SEM NEURAL/.test(hud.textContent),'The mark leaves with the state');choose(menu2.querySelector('input[data-bxif-key=hud]'),2);await sleep(100);
  choose(menu2.querySelector('input[data-bxif-key=hudPosition]'),3);check(hud.dataset.pos==='bottom-right','HUD follows the chosen corner');
  BxImageFilter.status.lastFrame=Date.now()-5000;await sleep(1400);
  check(!hud.hasAttribute('data-show')&&getComputedStyle(hud).display==='none','HUD hides when the stream stops');
  choose(menu2.querySelector('input[data-bxif-key=hudPosition]'),0);choose(menu2.querySelector('input[data-bxif-key=hud]'),0);
  check(!document.querySelector('.bxif-hud')&&BxImageFilter.hud.timers()===0&&BxImageFilter.settings.hud==='off','HUD off removes it and its timers');}
 // The panel runs only while visible and leaves nothing behind once Better xCloud removes it.
 {menu2.scrollIntoView();await sleep(600);check(BxImageFilter.panelOpen===true&&BxImageFilter.panel.timers()===1,'Visible panel refreshes on one timer and enables telemetry');
  // A dialog hidden with display:none stops the refresh; showing it again resumes.
  menu2.style.display='none';await sleep(700);check(BxImageFilter.panel.timers()===0&&BxImageFilter.panelOpen===false,'Hidden dialog stops the panel refresh');
  menu2.style.display='';menu2.scrollIntoView();await sleep(700);check(BxImageFilter.panel.timers()===1,'Shown again, the panel refreshes');
  // Warning actions: 'Usar Auto' updates the setting and its control at once (no stale value).
  BxImageFilter.update({output:'1440'});await sleep(1700);
  const useAuto=[...menu2.querySelectorAll('.bxif-warns button')].find(b=>b.textContent==='Usar Auto');
  check(useAuto,'Actionable output warning is visible (actionable warnings are never hidden behind +N)');
  useAuto.click();
  check(BxImageFilter.settings.output==='auto'&&menu2.querySelector('input[data-bxif-key=output]').getAttribute('aria-valuetext')==='Auto','Usar Auto changes the setting and its control at once');
  // 'Ir para Renderizador' reaches Better xCloud's controller-friendly select (hidden <select>, '>' button in nearby.focus).
  {const row=document.createElement('div');row.prefKey='video.player.type';const wrap=document.createElement('div');wrap.className='bx-select';
   const sel=document.createElement('select');sel.style.cssText='position:absolute;top:-9999px;left:-9999px;visibility:hidden';const next=document.createElement('button');next.textContent='>';
   wrap.append(sel,next);wrap.nearby={focus:next};row.append(wrap);menu2.prepend(row);
   await sleep(600);const go=[...menu2.querySelectorAll('.bxif-warns button')].find(b=>b.textContent==='Ir para Renderizador');
   check(go,'Renderer warning offers its action');go.click();check(document.activeElement===next,'Ir para Renderizador focuses the controller-friendly selector');row.remove();}
  // Documented null fields never print undefined/NaN.
  {const net=BxImageFilter.status.net;BxImageFilter.status.net={codec:null,profile:null,fpsReceived:null,decoder:'unknown',implementation:null,decodeMs:null,bufferMs:null,rttMs:null,bitrateMbps:null,lossPct:null,qp:null,framesDropped:null,freezes:null,width:null,height:null};
   const fl=BxImageFilter.status.fluidity;BxImageFilter.status.fluidity={mode:'balanced',extraMs:null,dropped:0};BxImageFilter.status.adaptive=null;
   for(const s of menu2.querySelectorAll('.bxif-sec:not([data-open])>.bxif-sec-head'))s.click();
   await sleep(1200);const text=menu2.querySelector('.bxif-panel').textContent;
   check(!/undefined|NaN/.test(text)&&!/ · \? /.test(text),'Null telemetry fields render as dashes, never undefined/NaN/?');
   BxImageFilter.status.net=net;BxImageFilter.status.fluidity=fl;}
  // Android WebView: no QP and no GPU timer. The panel shows the bitrate estimate and the fence time, marked as estimates.
  {const st=BxImageFilter.status,saved={net:st.net,adaptive:st.adaptive,gpu:st.gpuEstimate,m:st.measurement};
   st.net={codec:'H264 Main',profile:'Main',fpsReceived:30,decoder:'unknown',implementation:null,decodeMs:10.4,bufferMs:9.4,rttMs:20,bitrateMbps:9.1,lossPct:0,qp:null,framesDropped:0,freezes:0,width:1920,height:1080,bitsPerPixel:.15};
   st.adaptive={source:'bitrate',qp:null,qpMean:null,qpEstimate:25.8,bitsPerPixel:.177,level:.3,scales:{cleanup:.84,deband:.84,detail:1.08}};
   st.measurement='cadence';st.gpuEstimate={p50:4.2,p95:6.8,count:20};st.lastFrame=Date.now();
   await sleep(1200);const text=menu2.querySelector('.bxif-panel').textContent;
   check(/Estimado pela taxa de bits/.test(text)&&/0,18 bit\/pixel/.test(text)&&/QP ≈26 \(pela taxa de bits\)/.test(text),'Missing QP shows the bitrate estimate, marked as such');
   check(/≈6,8 ms de \d+ ms por quadro/.test(text)&&/Estimado por fence \(sem cronômetro/.test(text)&&/limite superior/.test(text)&&/Tratamento \(GPU ≈ fence, p95\)/.test(text),'Missing GPU timer shows the fence estimate against the frame interval, labelled as a fence upper bound');
   check(/3, 6 e 10 ms se comportam igual/.test(menu2.querySelector('input[data-bxif-key=gpuBudget]').closest('.bxif-row').querySelector('.bxif-hint').textContent),'Without a GPU timer the budget hint says 3, 6 and 10 ms behave the same');
   st.neural='cut';await sleep(1700);const warn=menu2.querySelector('[data-bxif-out=warnings]');
   check(/Reconstrução neural pedida, mas não está rodando: desligada pela redução automática/.test(warn.textContent)&&/Restaurar tratamento, ou Aliviar GPU = Nunca/.test(warn.textContent),'Neural cut by the adaptation shows a warning with the way back');
   check(menu2.querySelector('input[data-bxif-key=neural]').closest('.bxif-row').querySelector('.bxif-tag').textContent==='Cortada','Neural slider is tagged Cortada');
   st.neural='no-float';await sleep(1700);check(/não renderiza em ponto flutuante/.test(warn.textContent)&&!/redução automática/.test(warn.textContent)&&menu2.querySelector('input[data-bxif-key=neural]').closest('.bxif-row').querySelector('.bxif-tag').textContent==='Sem float','Neural without float targets shows its own warning and tag');
   st.neural='off';await sleep(1700);check(!/Reconstrução neural pedida/.test(warn.textContent)&&menu2.querySelector('input[data-bxif-key=neural]').closest('.bxif-row').querySelector('.bxif-tag').textContent==='EXP','Neural off: no warning, EXP tag back');
   st.adaptive=null;await sleep(700);check(/não informa o QP/.test(menu2.querySelector('.bxif-panel').textContent),'Before the first estimate the panel says the device reports no QP');
   st.net=saved.net;st.adaptive=saved.adaptive;st.gpuEstimate=saved.gpu;st.measurement=saved.m;}
  menu2.remove();await sleep(700);check(BxImageFilter.panel.timers()===0&&BxImageFilter.panelOpen===false,'Removed panel leaves no timers and closes telemetry');}
 // A GPU failure while Fluidez is on must also end its display loop, not only the engine.
 BxImageFilter.settings.fluidity='balanced';adapterInput.currentTime+=.033;player.updateFrame();
 player.bxEngine.render=()=>{throw new Error('simulated GPU failure');};adapterInput.currentTime+=.033;player.updateFrame();
 check(!player.bxEngine&&!player.bxTiming.pacer&&BxImageFilter.status.mode==='error','Render failure stops the Fluidez loop and falls back to the original renderer');
 BxImageFilter.settings.fluidity='off';
 player.destroy();
 const nextPlayer=new WebGL2Player(adapterInput);await nextPlayer.setupShaders();nextPlayer.updateFrame();BxImageFilter.diagnostic=true;nextPlayer.updateFrame();
 const tint=new Uint8Array(128*96*4);nextPlayer.gl.readPixels(0,0,128,96,nextPlayer.gl.RGBA,nextPlayer.gl.UNSIGNED_BYTE,tint);
 check(nextPlayer.bxEngine.frames===2&&tint.some((v,i)=>i%4===0&&v>100),'Next player applies persisted settings and diagnostic without reload');
 nextPlayer.destroy();
 const stoppedPlayer=new WebGL2Player(adapterInput);const pending=stoppedPlayer.setupShaders();stoppedPlayer.destroy();await pending;check(!stoppedPlayer.bxEngine,'Destroy during asynchronous setup does not resurrect engine');


 // requestVideoFrameCallback metadata: presented-frame gaps are counted and a newly presented frame is drawn.
 {const rvfcInput=document.createElement('canvas');rvfcInput.width=128;rvfcInput.height=96;rvfcInput.currentTime=5;let onMeta=null;
  rvfcInput.requestVideoFrameCallback=cb=>{onMeta=cb;return 1;};rvfcInput.cancelVideoFrameCallback=()=>{};
  const rvfcPlayer=new WebGL2Player(rvfcInput);await rvfcPlayer.setupShaders();
  onMeta(0,{presentedFrames:10});rvfcPlayer.updateFrame();const drawn=rvfcPlayer.bxEngine.frames;
  onMeta(0,{presentedFrames:13});rvfcPlayer.updateFrame();
  check(rvfcPlayer.bxEngine.frames===drawn+1&&BxImageFilter.status.origin.presented===3&&BxImageFilter.status.origin.missed===2,'Presented frames that skipped the treatment are counted; the new one is drawn');
  rvfcPlayer.destroy();}
 // Reference sharpening keeps one source texel between taps when the output is larger than the video.
 {const overshoot=scale=>{const c=document.createElement('canvas');c.width=64*scale;c.height=32*scale;
   const g=c.getContext('webgl2',{preserveDrawingBuffer:true,antialias:false}),e=new BxRestoration.Engine(g,BxShaders);
   const src=document.createElement('canvas');src.width=64;src.height=32;const x=src.getContext('2d');x.fillStyle='rgb(80,80,80)';x.fillRect(0,0,32,32);x.fillStyle='rgb(160,160,160)';x.fillRect(32,0,32,32);
   e.render(src,c.width,c.height,BxRestoration.normalize({mode:'cas',sharpening:'usm',sharpness:5,gpuBudget:0}),0);
   const row=new Uint8Array(c.width*4);g.readPixels(0,16*scale,c.width,1,g.RGBA,g.UNSIGNED_BYTE,row);e.destroy();
   let hi=0;for(let i=0;i<row.length;i+=4)hi=Math.max(hi,row[i]);return hi-160;};
  const native=overshoot(1),doubled=overshoot(2);
  check(native>10&&doubled>=native*.6,`Reference sharpening keeps its strength at 2x output (${native} vs ${doubled})`);}
 // Isolate AA at native resolution and with sharpening disabled.
 canvas.width=128;canvas.height=96;
 for(let y=0;y<96;y++)for(let x=0;x<128;x++){ctx.fillStyle=x>y*.5+30?'white':'black';ctx.fillRect(x,y,1,1);}
 const aaSettings=BxRestoration.normalize({cleanup:0,deband:0,temporal:0,sharpness:0,antialias:0});
 engine.render(input,128,96,aaSettings,1);const jagged=pixels();aaSettings.antialias=1;engine.render(input,128,96,aaSettings,1.016);const smooth=pixels();
 const intermediates=b=>b.filter((v,i)=>i%4===0&&v>0&&v<255).length;
 check(intermediates(smooth)>intermediates(jagged),'AA blends staircase edge coverage');
 check(smooth[(10*128+100)*4]===255&&smooth[(80*128+10)*4]===0,'AA preserves uniform black and white');
 ctx.fillStyle='black';ctx.fillRect(0,0,64,96);ctx.fillStyle='white';ctx.fillRect(64,0,64,96);engine.render(input,128,96,aaSettings,1.032);
 check(intermediates(pixels())===0,'AA preserves axis-aligned edge');
 // Auto output follows the on-screen size of the canvas CSS box, not the backing size.
 {const autoInput=document.createElement('canvas');autoInput.width=192;autoInput.height=108;autoInput.currentTime=0;
  const autoPlayer=new WebGL2Player(autoInput);await autoPlayer.setupShaders();BxImageFilter.settings.output='auto';BxImageFilter.settings.gpuBudget=0;
  autoPlayer.$canvas.style.cssText='width:'+Math.round(400/devicePixelRatio)+'px;height:'+Math.round(400/devicePixelRatio)+'px;object-fit:contain';autoPlayer.updateFrame();
  check(autoPlayer.$canvas.height===224&&autoPlayer.$canvas.width===398,'Auto output renders at the displayed video height (contain box)');
  autoPlayer.$canvas.style.cssText='width:'+Math.round(96/devicePixelRatio)+'px;height:'+Math.round(54/devicePixelRatio)+'px';autoInput.currentTime+=.016;autoPlayer.updateFrame();
  check(autoPlayer.$canvas.height===108,'Auto output stays native when the video is shown smaller than the source');autoPlayer.destroy();}
 const forcedPlayer=new WebGL2Player(adapterInput);adapterInput.width=192;adapterInput.height=108;await forcedPlayer.setupShaders();
 BxImageFilter.settings.output='2160';BxImageFilter.settings.gpuBudget=0;forcedPlayer.updateFrame();
 check(forcedPlayer.$canvas.width===3840&&forcedPlayer.$canvas.height===2160,'4K output ignores smaller display dimensions');
 check(forcedPlayer.bxEngine.budget.limitMs===0,'Manual GPU policy is applied');
 BxImageFilter.settings.output='1440';forcedPlayer.updateFrame();check(forcedPlayer.$canvas.width===2560&&forcedPlayer.$canvas.height===1440,'2K output renders at 1440p');
 BxImageFilter.settings.output='native';forcedPlayer.updateFrame();check(forcedPlayer.$canvas.width===192&&forcedPlayer.$canvas.height===108,'Native output matches decoded source');
 check(forcedPlayer.gl.getError()===forcedPlayer.gl.NO_ERROR,'Forced output targets render without GL errors');
 check(!forcedPlayer.bxEngine.targets.scaled,'Returning to native output releases the upscale texture');
 // Exercise automatic resolution adaptation through the actual adapter, even on a paused frame.
 BxImageFilter.settings.gpuBudget=3;BxImageFilter.settings.output='2160';BxImageFilter.settings.temporal=0;forcedPlayer.updateFrame();
 for(let i=0;i<90;i++)forcedPlayer.bxEngine.budget.sample(20);
 forcedPlayer.updateFrame();check(forcedPlayer.$canvas.height===1440,'Overload redraws a paused frame at 1440p');
 for(let i=0;i<90;i++)forcedPlayer.bxEngine.budget.sample(20);
 forcedPlayer.updateFrame();check(forcedPlayer.$canvas.height===108,'Persistent overload returns to native source size');
 check(BxImageFilter.settings.output==='2160','Adaptation preserves the selected output preference');
 forcedPlayer.destroy();
 engine.diagnostics.start();engine.render(input,128,96,{gpuBudget:0,mode:'original'},3,false);engine.render(input,128,96,{gpuBudget:0,mode:'original'},3.016,true);
 const segments=engine.diagnostics.report().segments;
 check(segments.length===2&&segments[1].config.diagnostic,'Diagnostic tint starts a separate measurement segment');
 check(segments[0].config.effective.cleanup===0&&segments[0].config.effective.deband===0&&!segments[0].config.effective.temporal&&segments[0].config.effective.antialias===0,'Original report marks skipped treatments inactive');
 const textures=Object.values(engine.targets).map(t=>t.texture);engine.destroy();check(textures.every(t=>!gl.isTexture(t)),'GPU resources released');
 document.getElementById('result').textContent=JSON.stringify({passed:checks});
})().catch(e=>{document.getElementById('result').textContent=JSON.stringify({error:e.message});console.error(e);});
'''
original=Path('script.js').read_text();a=original.index('class WebGL2Player');b=original.index('class VideoPlayer',a)
base="\nconst prefs={'video.processing.sharpness':2,'video.processing':'cas','video.processing.mode':'performance'};function getStreamPref(key){return prefs[key]??'default';}\nclass BaseCanvasPlayer {\n constructor(type,video){this.$video=video;this.$canvas=document.createElement('canvas');this.$canvas.width=128;this.$canvas.height=96;document.body.append(this.$canvas);this.options={processing:'cas',processingMode:'performance',sharpness:2,brightness:100,contrast:100,saturation:100};}\n toFilterId(){return 2;}destroy(){}\n}\n"
Path('output/playwright').mkdir(parents=True,exist_ok=True)
Path('output/playwright/filter-harness.html').write_text('<!doctype html><meta charset="utf-8"><pre id="result">Running</pre><script src="../restoration.bundle.js"></script><script>'+base+original[a:b]+''.join(Path('src/'+n).read_text() for n in ('image-filter.js','panel.js','hud.js'))+probe+'</script>')

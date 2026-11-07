const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function load(stored){const calls=[];class WebGL2Player{updateFrame(){calls.push('original');}destroy(){calls.push('destroy');}async setupShaders(){}}
 const context={WebGL2Player,window:{setInterval(){return 1;},clearInterval(){},setTimeout(){return 0;},clearTimeout(){},addEventListener(){}},document:{readyState:'loading',addEventListener(){}},localStorage:{getItem:()=>stored,setItem(){}},console};
 vm.runInNewContext(fs.readFileSync('src/restoration-engine.js','utf8'),context);vm.runInNewContext(fs.readFileSync('src/image-filter.js','utf8'),context);return {context,calls,player:new WebGL2Player()};}
test('bad saved JSON resets to new conservative settings',()=>{const {context}=load('{broken');assert.equal(context.window.BxImageFilter.settings.cleanup,0);assert.equal(context.window.BxImageFilter.settings.temporal,0);});
test('untouched v9 saved defaults migrate once to the Spec 3 defaults; customised ones stay',()=>{
 const run=(saved,marker)=>{const store={'BxImageFilter.v9':JSON.stringify(saved)};if(marker)store['BxImageFilter.spec3']='1';
  const context={WebGL2Player:class{},window:{setInterval(){return 1;},clearInterval(){},setTimeout(){return 0;},clearTimeout(){},addEventListener(){}},document:{readyState:'loading',addEventListener(){}},localStorage:{getItem:k=>store[k]??null,setItem(k,v){store[k]=v;}},console};
  vm.runInNewContext(fs.readFileSync('src/restoration-engine.js','utf8'),context);vm.runInNewContext(fs.readFileSync('src/image-filter.js','utf8'),context);return {s:context.window.BxImageFilter.settings,store};};
 const v9={sharpness:3,cleanup:.5,deband:.3,detail:.2,hud:'full'};
 let r=run(v9,false);assert.equal(r.s.sharpness,2);assert.equal(r.s.cleanup,0);assert.equal(r.s.detail,0);assert.equal(r.s.deband,.6);assert.equal(r.s.hud,'full');assert.equal(r.store['BxImageFilter.spec3'],'1');
 r=run({...v9,sharpness:4},false);assert.equal(r.s.sharpness,4);assert.equal(r.s.cleanup,.5);
 r=run(v9,true);assert.equal(r.s.sharpness,3);assert.equal(r.s.cleanup,.5);});
test('diagnostic does not persist and color defaults stay neutral',()=>{const {context}=load('{"diagnostic":true,"contrast":999}');const a=context.window.BxImageFilter;assert.equal(a.diagnostic,false);assert.equal(a.settings.contrast,1);assert.equal(a.settings.saturation,1);assert.equal(a.status.mode,'waiting');});

// Exercise the actual upstream singleton from the generated deliverable.
test('new sessions recreate WebGL canvas and apply persisted player options',()=>{
 const source=fs.readFileSync('better-xcloud-image-filter.user.js','utf8');
 const start=source.indexOf('class StreamPlayerManager'),end=source.indexOf('function patchVideoApi',start);
 let created=0,destroyed=0;
 class CanvasPlayer{constructor(video){this.video=video;created++;}init(){}destroy(){destroyed++;}updateOptions(options){this.options=options;}}
 class VideoPlayer{init(){}clearFilters(){}updateOptions(){}}
 const context={VideoPlayer,WebGL2Player:CanvasPlayer,BX_FLAGS:{DeviceInfo:{}},assert};
 vm.runInNewContext(source.slice(start,end)+';globalThis.manager=StreamPlayerManager.getInstance();',context);
 const manager=context.manager;
 for(let i=0;i<3;i++){
  const video={classList:{add(){},remove(){}}};manager.setVideoElement(video);manager.switchPlayerType('webgl2');manager.updateOptions({sharpness:4});
  assert.equal(manager.canvasPlayer.video,video);assert.equal(manager.canvasPlayer.options.sharpness,4);
  manager.destroy();assert.equal(manager.canvasPlayer,null);
 }
 assert.equal(created,3);assert.equal(destroyed,3);
});
test('controls are inserted beside native sharpness in the video menu',()=>{
 const source=fs.readFileSync('better-xcloud-image-filter.user.js','utf8');
 assert.ok(source.includes('"video.processing.sharpness",($parent) => {window.BxImageFilter.mountControls($parent);},"video.saturation"'));
});
test('the scaler choice is saved and validated on load',()=>{
 assert.equal(load('{"scaler":"sgsr"}').context.window.BxImageFilter.settings.scaler,'sgsr');
 assert.equal(load('{"scaler":"bogus"}').context.window.BxImageFilter.settings.scaler,'easu');
 assert.equal(load(null).context.window.BxImageFilter.settings.scaler,'easu');
 const store={};const context={WebGL2Player:class{},window:{setInterval(){return 1;},clearInterval(){},setTimeout(){return 0;},clearTimeout(){},addEventListener(){}},document:{readyState:'loading',addEventListener(){}},localStorage:{getItem:k=>store[k]??null,setItem(k,v){store[k]=v;}},console};
 vm.runInNewContext(fs.readFileSync('src/restoration-engine.js','utf8'),context);vm.runInNewContext(fs.readFileSync('src/image-filter.js','utf8'),context);
 const a=context.window.BxImageFilter;context.window.setTimeout=f=>{f();return 0;};
 a.update({scaler:'sgsr'});assert.equal(JSON.parse(store['BxImageFilter.v9']).scaler,'sgsr','saved');
 a.reset();assert.equal(a.settings.scaler,'easu','Restaurar returns to EASU');assert.equal(JSON.parse(store['BxImageFilter.v9']).scaler,'easu');
});

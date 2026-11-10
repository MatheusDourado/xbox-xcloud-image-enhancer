const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');

// play.xbox.com prelude (src/play/prelude.js) with a fake fetch and WebRTC, then the engine and the adapter on top,
// in the order of the built userscript.
function play(settings={}){
 // decode: counters of the fake decoder; each getStats call advances them by grow frames at msPerFrame (one second).
 const sent=[],timers=[],decode={total:2.1,frames:100,time:1000,grow:0,msPerFrame:21};
 const advance=()=>{decode.time+=1000;decode.frames+=decode.grow;decode.total+=decode.grow*decode.msPerFrame/1000;};
 class RTCPeerConnection {addEventListener(){}getStats(){advance();return Promise.resolve(new Map([
  ['v',{id:'v',type:'inbound-rtp',kind:'video',timestamp:decode.time,framesDecoded:decode.frames,framesReceived:decode.frames,totalDecodeTime:decode.total}],
  ['a',{id:'a',type:'inbound-rtp',kind:'audio',timestamp:decode.time}]]));}}
 class RTCRtpReceiver {getStats(){return Promise.resolve(new Map([['v',{type:'inbound-rtp',mediaType:'video',framesDecoded:decode.frames,totalDecodeTime:decode.total}]]));}}
 const window={fetch(input,init){sent.push({input,init});return Promise.resolve('response');},RTCPeerConnection,RTCRtpReceiver,
  setInterval(fn){timers.push(fn);return timers.length;},clearInterval(){},setTimeout:()=>0,clearTimeout(){},addEventListener(){}};
 const context={window,Headers,Request,console,localStorage:{getItem:()=>null,setItem(){}},document:{},performance,screen:{width:1080,height:2400},WebGL2Player:class {}};
 vm.createContext(context);
 vm.runInContext(fs.readFileSync('src/play/prelude.js','utf8')+';globalThis.BxPlayStream=BxPlayStream;',context);
 vm.runInContext(fs.readFileSync('src/restoration-engine.js','utf8'),context);
 vm.runInContext(fs.readFileSync('src/image-filter.js','utf8'),context);
 const api=window.BxImageFilter;Object.assign(api.settings,settings);
 const tick=async()=>{for(const fn of timers)fn();for(let i=0;i<5;i++)await new Promise(r=>setImmediate(r));};
 return {context,window,api,sent,decode,tick,stream:context.BxPlayStream,pc:new window.RTCPeerConnection()};
}
const PLAY_URL='https://wus2.core.gssv-play-prod.xboxlive.com/v5/sessions/cloud/play';
const deviceInfo=JSON.stringify({appInfo:{env:{clientAppType:'browser'}},dev:{os:{name:'android',ver:'16',platform:'mobile'},hw:{make:'Xiaomi',model:'Poco',sdktype:'web'},
 browser:{browserName:'chrome',browserVersion:'156'},displayInfo:{dimensions:{widthInPixels:807,heightInPixels:394},pixelDensity:{dpiX:2.75,dpiY:2.75}}}});
const playBody=JSON.stringify({clientSessionId:'x',titleId:'nfs',settings:{nanoVersion:'V3',osName:'android',locale:'pt-BR'}});

test('stream settings: default 1080p with the decode cap, only valid values are kept',()=>{
 const ctx={globalThis:{},performance};vm.runInNewContext(fs.readFileSync('src/restoration-engine.js','utf8'),ctx);
 const a=ctx.globalThis.BxRestoration;
 assert.equal(a.defaults.streamResolution,'1080p');assert.equal(a.defaults.preventDrops,true);
 for(const v of ['auto','1080p','1080p-hq'])assert.equal(a.normalize({streamResolution:v}).streamResolution,v);
 assert.equal(a.normalize({streamResolution:'720p'}).streamResolution,'1080p');assert.equal(a.normalize({streamResolution:1080}).streamResolution,'1080p');
 assert.equal(a.normalize({preventDrops:false}).preventDrops,false);assert.equal(a.normalize({preventDrops:'false'}).preventDrops,true);
});

test('play request declares windows and 1920×1080 in the body and x-ms-device-info; other requests pass untouched',async()=>{
 const p=play({streamResolution:'1080p'});
 await p.window.fetch(PLAY_URL,{method:'POST',body:playBody,headers:{'Content-Type':'application/json','x-ms-device-info':deviceInfo}});
 const {input,init}=p.sent[0];assert.equal(input,PLAY_URL);
 const body=JSON.parse(init.body);assert.equal(body.settings.osName,'windows');assert.equal(body.settings.locale,'pt-BR');assert.equal(body.titleId,'nfs');
 const dev=JSON.parse(init.headers.get('x-ms-device-info')).dev;
 assert.deepEqual({...dev.os},{name:'windows',ver:'22631.2715',platform:'desktop'});
 assert.deepEqual({...dev.displayInfo.dimensions},{widthInPixels:1920,heightInPixels:1080});
 assert.equal(dev.hw.sdktype,'web');assert.equal(init.headers.get('content-type'),'application/json');
 assert.equal(p.stream.state.request.osName,'windows');assert.equal(p.stream.state.request.from,'android');assert.equal(p.stream.state.request.header,true);
 // Not the play POST: the original arguments.
 await p.window.fetch(PLAY_URL+'/state',{method:'GET'});await p.window.fetch(PLAY_URL,{method:'GET'});
 assert.equal(p.sent[1].init.method,'GET');assert.equal(p.sent[1].input,PLAY_URL+'/state');assert.equal(p.sent[2].init.body,undefined);
});

test('play request as a Request object, 1080p-hq declares tizen, auto leaves the request alone',async()=>{
 const p=play({streamResolution:'1080p-hq'});
 await p.window.fetch(new Request(PLAY_URL,{method:'POST',body:playBody,headers:{'x-ms-device-info':deviceInfo}}));
 const sent=p.sent[0].input;assert.ok(sent instanceof Request);assert.equal(sent.method,'POST');
 assert.equal(JSON.parse(await sent.text()).settings.osName,'tizen');assert.equal(JSON.parse(sent.headers.get('x-ms-device-info')).dev.os.name,'tizen');
 const q=play({streamResolution:'auto'}),init={method:'POST',body:playBody};
 await q.window.fetch(PLAY_URL,init);assert.equal(q.sent[0].init,init);assert.equal(q.stream.state.request,null);
 // Pure rewrite: a body without settings and a missing header stay as they were.
 const r=q.stream.rewritePlay('{"a":1}',null,'windows');assert.equal(r.body,'{"a":1}');assert.equal(r.deviceInfo,null);
});

test('the site sees inbound video decode time capped at 8 ms per frame; our telemetry reads the real one',async()=>{
 const p=play({preventDrops:true});
 const site=(await p.pc.getStats()).get('v');assert.equal(site.totalDecodeTime,.8);assert.equal(site.framesDecoded,100);
 const receiver=(await new p.window.RTCRtpReceiver().getStats()).get('v');assert.equal(receiver.totalDecodeTime,.8);
 const real=(await p.context.BxRestoration.readStats(p.pc)).get('v');assert.equal(real.totalDecodeTime,2.1);
 assert.equal((await p.context.BxRestoration.readStats(new p.window.RTCRtpReceiver())).get('v').totalDecodeTime,2.1);
 assert.ok(p.stream.info().capActive);assert.ok(Math.abs(p.stream.info().realDecodeMs-21)<1e-9);
 // Below the cap, and with the setting off, the site's report is the native one.
 p.decode.total=.5;assert.equal((await p.pc.getStats()).get('v').totalDecodeTime,.5);
 p.decode.total=2.1;p.api.settings.preventDrops=false;assert.equal((await p.pc.getStats()).get('v').totalDecodeTime,2.1);
 // The wrapper keeps length 0 (webrtc-adapter's getStats shim checks it).
 assert.equal(p.window.RTCPeerConnection.prototype.getStats.length,0);
});

test('adapter telemetry and warnings: real decodeMs while the site sees the cap, status.stream on play.xbox.com',async()=>{
 const p=play({preventDrops:true,hud:'full'});p.decode.grow=30;
 p.context.STATES.currentStream.peerConnection=p.pc;
 await p.tick();await p.tick();
 const net=p.api.status.net;assert.ok(net,'telemetry read');assert.ok(Math.abs(net.decodeMs-21)<1e-6,'real decode time, not the 8 ms cap');
 assert.equal(p.api.status.stream.capActive,false,'the adapter alone never triggers the cap');
 assert.ok(!p.api.status.warnings.some(w=>w.key==='prevent-drops'));
 // The site reads getStats: capped, and the next telemetry tick still reads 21 ms and warns.
 const site=(await p.pc.getStats()).get('v');assert.ok(Math.abs(site.totalDecodeTime-site.framesDecoded*.008)<1e-9);
 await p.tick();
 assert.ok(Math.abs(p.api.status.net.decodeMs-21)<1e-6);
 const w=p.api.status.warnings.find(x=>x.key==='prevent-drops');assert.ok(w);assert.match(w.text,/8 ms/);assert.match(w.text,/real: 21,0 ms/);
 assert.equal(p.api.status.stream.capActive,true);assert.equal(p.api.status.stream.resolution,'1080p');
 assert.ok(JSON.parse(p.api.configText()).status.stream.capActive);
 // Stream settings are live keys and survive Restaurar.
 p.api.update({streamResolution:'auto',preventDrops:false});p.api.reset();
 assert.equal(p.api.settings.streamResolution,'auto');assert.equal(p.api.settings.preventDrops,false);
});

// play.xbox.com host (src/play/host.js) on a minimal fake DOM: the floating widget and the panel dialog.
function host({store={},vw=800,vh=400}={}){
 const timers=[];let tid=0;
 class Node {
  constructor(tag){this.tagName=String(tag).toUpperCase();this.children=[];this.parent=null;this.attrs={};this.style={};this.dataset={};this.listeners=[];this.hidden=false;this.className='';this.textContent='';this.innerHTML='';}
  get isConnected(){let n=this;while(n.parent)n=n.parent;return n===doc;}
  append(...nodes){for(const n of nodes){if(typeof n==='string'){this.textContent+=n;continue;}if(n.parent)n.parent.children.splice(n.parent.children.indexOf(n),1);n.parent=this;this.children.push(n);}}
  remove(){if(this.parent){this.parent.children.splice(this.parent.children.indexOf(this),1);this.parent=null;}}
  contains(n){for(;n;n=n.parent)if(n===this)return true;return false;}
  querySelector(sel){for(const c of this.children){if(c.tagName===sel.toUpperCase())return c;const d=c.querySelector(sel);if(d)return d;}return null;}
  setAttribute(k,v){this.attrs[k]=String(v);}getAttribute(k){return this.attrs[k]??null;}hasAttribute(k){return k in this.attrs;}removeAttribute(k){delete this.attrs[k];}
  toggleAttribute(k,on){if(on)this.attrs[k]='';else delete this.attrs[k];}
  get classList(){const el=this;return {add(c){el.className+=' '+c;},remove(){},contains:c=>el.className.split(' ').includes(c)};}
  addEventListener(type,fn,opt){this.listeners.push({type,fn,capture:opt===true||!!opt?.capture});}
  focus(){doc.activeElement=this;}setPointerCapture(){}releasePointerCapture(){}
 }
 const doc=new Node('#document');doc.documentElement=new Node('html');doc.append(doc.documentElement);doc.head=new Node('head');doc.body=new Node('body');
 doc.documentElement.append(doc.head,doc.body);doc.readyState='complete';
 doc.createElement=t=>new Node(t);doc.querySelectorAll=()=>[];doc.getElementsByTagName=()=>[];
 const win=new Node('#window');
 // Capture from window down, the target, then bubbling back up, as the browser does.
 function fire(target,type,props={}){
  const e={type,target,button:0,pointerId:1,clientX:0,clientY:0,cancelable:true,defaultPrevented:false,stopped:false,...props,
   stopPropagation(){this.stopped=true;},preventDefault(){this.defaultPrevented=true;}};
  const path=[];for(let n=target;n;n=n.parent)path.unshift(n);if(target!==win)path.unshift(win);
  const up=path.slice(0,-1);
  for(const n of up){for(const l of n.listeners)if(l.type===type&&l.capture)l.fn(e);if(e.stopped)return e;}
  for(const l of target.listeners)if(l.type===type)l.fn(e);
  for(const n of up.reverse()){if(e.stopped)return e;for(const l of n.listeners)if(l.type===type&&!l.capture)l.fn(e);}
  return e;
 }
 const mounted=[];
 const context={document:doc,console,
  localStorage:{getItem:k=>store[k]??null,setItem(k,v){store[k]=String(v);}},
  getComputedStyle:()=>({position:'relative',paddingTop:'0px',paddingRight:'0px',paddingBottom:'0px',paddingLeft:'0px'}),
  MutationObserver:class {observe(){}disconnect(){}},requestAnimationFrame:()=>0,
  setInterval:()=>0,clearInterval(){},setTimeout(fn,ms){timers.push({fn,ms,id:++tid});return tid;},clearTimeout(id){const i=timers.findIndex(t=>t.id===id);if(i>=0)timers.splice(i,1);},
  location:{hostname:'play.xbox.com'},WebGL2Player:class {}};
 vm.createContext(context);
 const g=vm.runInContext('globalThis',context);
 Object.assign(g,{innerWidth:vw,innerHeight:vh,addEventListener:(t,fn,o)=>win.listeners.push({type:t,fn,capture:o===true||!!o?.capture})});
 g.window=g;g.top=g;g.BxImageFilter={status:{},mountControls:el=>mounted.push(el)};
 vm.runInContext(fs.readFileSync('src/play/host.js','utf8'),context);
 const body=doc.body,find=cls=>body.children.find(n=>n.className===cls);
 const launcher=find('bxif-play-launch'),dialog=find('bxif-play-dialog'),backdrop=find('bxif-play-backdrop');
 // A game element under everything and the site's document listeners: record what reaches them.
 const game=new Node('div'),seen=[];game.parent=body;body.children.unshift(game);
 for(const t of ['pointerdown','pointerup','click','touchstart','touchend','mousedown','mouseup'])game.listeners.push({type:t,fn:()=>seen.push(t),capture:false});
 for(const t of ['pointerdown','pointerup','click','touchstart','touchend'])doc.listeners.push({type:t,fn:()=>seen.push('doc:'+t),capture:false});
 const runTimers=ms=>{for(const t of timers.splice(0))if(t.ms<=ms)t.fn();else timers.push(t);};
 return {g,doc,win,fire,launcher,dialog,backdrop,game,seen,store,mounted,runTimers,host:g.BxImageFilter.playHost,
  tap(el,x=0,y=0,id=1){fire(el,'pointerdown',{pointerId:id,clientX:x,clientY:y});fire(el,'pointerup',{pointerId:id,clientX:x,clientY:y});fire(el,'click',{clientX:x,clientY:y});},
  drag(el,[x0,y0],[x1,y1],id=1){fire(el,'pointerdown',{pointerId:id,clientX:x0,clientY:y0});fire(el,'pointermove',{pointerId:id,clientX:x1,clientY:y1});
   fire(el,'pointerup',{pointerId:id,clientX:x1,clientY:y1});fire(el,'click',{clientX:x1,clientY:y1});}};
}
const xy=h=>({...h.host.widget.at()});

test('widget: product name and icon instead of "IF", bottom right while browsing',()=>{
 const h=host();
 assert.equal(h.launcher.getAttribute('aria-label'),'xCloud Enhanced');assert.equal(h.launcher.title,'xCloud Enhanced (Alt+Shift+F)');
 assert.match(h.launcher.innerHTML,/^<svg viewBox="0 0 48 48"[^>]*aria-hidden="true"/);assert.equal(h.launcher.textContent,'');
 assert.equal(h.dialog.getAttribute('aria-label'),'xCloud Enhanced');
 const title=h.dialog.children[0].children[0];assert.equal(title.textContent,'xCloud Enhanced');assert.match(title.innerHTML,/^<svg /);
 assert.match(h.host.diagnosis().text,/\(xCloud Enhanced v/);
 // 800x400, 44 px widget, 12 px margin.
 assert.deepEqual(xy(h),{x:744,y:344});assert.equal(h.launcher.style.left,'744px');assert.equal(h.launcher.style.top,'344px');
 assert.equal(h.backdrop.hidden,true);
});

test('widget: a small move is a tap and toggles the panel; past the threshold it is a drag that never toggles',()=>{
 const h=host();
 h.fire(h.launcher,'pointerdown',{clientX:766,clientY:366});h.fire(h.launcher,'pointermove',{clientX:771,clientY:370});
 h.fire(h.launcher,'pointerup',{clientX:771,clientY:370});h.fire(h.launcher,'click');
 assert.equal(h.dialog.hidden,false,'moved 6.4 px: still a tap');assert.equal(h.launcher.getAttribute('aria-expanded'),'true');
 assert.equal(h.mounted.length,1);assert.deepEqual(xy(h),{x:744,y:344},'a tap does not move the widget');
 h.tap(h.launcher);assert.equal(h.dialog.hidden,true);
 h.drag(h.launcher,[766,366],[300,200]);
 assert.equal(h.dialog.hidden,true,'a drag never opens the panel');
 assert.deepEqual(h.seen,[],'the site never sees the pointer on the widget');
 // The next real tap works again, also after a drag whose click never came.
 h.tap(h.launcher);assert.equal(h.dialog.hidden,false);h.tap(h.launcher);
 h.fire(h.launcher,'pointerdown',{clientX:22,clientY:100});h.fire(h.launcher,'pointermove',{clientX:22,clientY:150});h.fire(h.launcher,'pointercancel',{clientX:22,clientY:150});
 h.runTimers(400);h.fire(h.launcher,'click');assert.equal(h.dialog.hidden,false,'keyboard Enter after a cancelled drag');
});

test('widget: drag clamps to the viewport, snaps to the nearest side, persists and is restored',()=>{
 const store={},h=host({store});
 // Dragged far past the top left corner: clamped while moving.
 h.fire(h.launcher,'pointerdown',{clientX:766,clientY:366});h.fire(h.launcher,'pointermove',{clientX:-500,clientY:-500});
 assert.deepEqual(xy(h),{x:12,y:12});assert.ok(h.launcher.hasAttribute('data-drag'));
 h.fire(h.launcher,'pointermove',{clientX:300,clientY:200});assert.deepEqual(xy(h),{x:278,y:178});
 h.fire(h.launcher,'pointerup',{clientX:300,clientY:200});
 assert.ok(!h.launcher.hasAttribute('data-drag'));
 // x 278 + 22 < 400: left side; y (178-12)/(344-12) = 0.5.
 assert.deepEqual({...h.host.widget.saved()},{side:'left',y:.5});assert.deepEqual(xy(h),{x:12,y:178});
 assert.deepEqual(JSON.parse(store[h.host.widget.key]),{side:'left',y:.5});
 // Restored on the next load and kept on screen in another viewport (rotation): same side, same relative height.
 const r=host({store,vw:400,vh:800});assert.deepEqual(xy(r),{x:12,y:378});
 r.g.innerWidth=300;r.g.innerHeight=200;r.fire(r.win,'resize');assert.deepEqual(xy(r),{x:12,y:78});
 // Right half snaps right; bad saved data falls back to the default spot.
 r.drag(r.launcher,[20,90],[260,150]);assert.equal(r.host.widget.saved().side,'right');assert.equal(xy(r).x,244);
 for(const bad of ['{broken','{"side":"top","y":0.5}','{"side":"left","y":"x"}'])assert.deepEqual(xy(host({store:{[h.host.widget.key]:bad}})),{x:744,y:344});
 // Pure helpers: safe-area insets push the edges in; a viewport smaller than the widget pins it to the corner.
 const w=h.host.widget,inset={top:30,right:20,bottom:10,left:40};
 assert.deepEqual({...w.place({side:'left',y:0},800,400,inset)},{x:52,y:64});assert.deepEqual({...w.place({side:'right',y:1},800,400,inset)},{x:724,y:334});
 assert.deepEqual({...w.place({side:'right',y:7},30,30,{top:0,right:0,bottom:0,left:0})},{x:12,y:12});
 assert.deepEqual({...w.snap(500,1000,800,400,inset)},{side:'right',y:1});
});

test('panel: a tap outside closes it without reaching the game; presses inside, drags ending outside and Esc behave',()=>{
 const h=host();
 h.tap(h.launcher);assert.equal(h.dialog.hidden,false);assert.equal(h.backdrop.hidden,false);
 // A press inside the panel that ends outside (slider drag): stays open.
 const inside=h.dialog.children[2];
 h.fire(inside,'pointerdown',{pointerId:3});h.fire(h.backdrop,'pointerup',{pointerId:3});h.fire(h.doc.body,'click');
 assert.equal(h.dialog.hidden,false);
 // A cancelled press on the layer is not a tap.
 h.fire(h.backdrop,'pointerdown',{pointerId:4});h.fire(h.backdrop,'pointercancel',{pointerId:4});h.fire(h.backdrop,'pointerup',{pointerId:4});
 assert.equal(h.dialog.hidden,false);
 // Outside tap (touch sequence): closes; nothing reaches the game; the layer swallows the trailing events, then goes.
 h.seen.length=0;
 const down=h.fire(h.backdrop,'pointerdown',{pointerId:5}),ts=h.fire(h.backdrop,'touchstart');
 h.fire(h.backdrop,'pointerup',{pointerId:5});
 assert.equal(h.dialog.hidden,true);assert.equal(h.launcher.getAttribute('aria-expanded'),'false');
 h.fire(h.backdrop,'touchend');h.fire(h.backdrop,'mousedown');h.fire(h.backdrop,'mouseup');h.fire(h.backdrop,'click');
 assert.ok(down.defaultPrevented&&ts.defaultPrevented);assert.deepEqual(h.seen,[]);
 assert.equal(h.backdrop.hidden,false,'still catching the trailing events');h.runTimers(400);assert.equal(h.backdrop.hidden,true);
 // The widget sits above the layer: tapping it closes the open panel too, and the layer goes at once.
 h.tap(h.launcher);h.tap(h.launcher);assert.equal(h.dialog.hidden,true);assert.equal(h.backdrop.hidden,true);
 // Reopened right after an outside tap: the pending hide does not remove the layer.
 h.tap(h.launcher);h.fire(h.backdrop,'pointerdown',{pointerId:6});h.fire(h.backdrop,'pointerup',{pointerId:6});h.tap(h.launcher);
 h.runTimers(400);assert.equal(h.dialog.hidden,false);assert.equal(h.backdrop.hidden,false);
 // Esc: inside the panel, and from outside it (focus on the widget).
 h.fire(inside,'keydown',{key:'Escape'});assert.equal(h.dialog.hidden,true);
 h.tap(h.launcher);const esc=h.fire(h.launcher,'keydown',{key:'Escape'});assert.equal(h.dialog.hidden,true);assert.ok(esc.defaultPrevented);
 // Alt+Shift+F still toggles; Esc with the panel closed is left to the site.
 h.fire(h.doc.body,'keydown',{key:'F',code:'KeyF',altKey:true,shiftKey:true});assert.equal(h.dialog.hidden,false);assert.equal(h.backdrop.hidden,false);
 h.fire(h.doc.body,'keydown',{key:'F',code:'KeyF',altKey:true,shiftKey:true});assert.equal(h.dialog.hidden,true);assert.equal(h.backdrop.hidden,true);
 assert.equal(h.fire(h.doc.body,'keydown',{key:'Escape'}).defaultPrevented,false);
});

test('widget: defaults and saved spots stay clear of the site header (Xbox menu button at the top left)',()=>{
 const zero={top:0,right:0,bottom:0,left:0},w=host().host.widget,overlap=(p,r)=>p.x<r.x+r.w&&p.x+44>r.x&&p.y<r.y+r.h&&p.y+44>r.y;
 // Poco F7 landscape viewport, the site's guide button at about (10,16) 40x40.
 const guide={x:10,y:16,w:40,h:40},inGame=w.place(w.home(true),806,394,zero),browsing=w.place(w.home(false),806,394,zero);
 assert.deepEqual({...inGame},{x:750,y:126});assert.deepEqual({...browsing},{x:750,y:338});
 for(const p of [inGame,browsing]){assert.ok(!overlap(p,guide));assert.ok(p.y>=w.band,'below the header row');}
 // A saved spot at the very top (old builds, or a drag to the top) is nudged below the band, on either side.
 for(const side of ['left','right'])assert.equal(w.place({side,y:0},806,394,zero).y,64);
 const store={[w.key]:JSON.stringify({side:'left',y:0})},h=host({store,vw:806,vh:394});assert.deepEqual(xy(h),{x:12,y:64});
 // Dragged into the top left corner: free while dragging, then settles on the left edge under the band.
 h.fire(h.launcher,'pointerdown',{clientX:34,clientY:86});h.fire(h.launcher,'pointermove',{clientX:10,clientY:10});
 assert.deepEqual(xy(h),{x:12,y:12});h.fire(h.launcher,'pointerup',{clientX:10,clientY:10});
 assert.deepEqual({...h.host.widget.saved()},{side:'left',y:0});assert.deepEqual(xy(h),{x:12,y:64});assert.ok(!overlap(xy(h),guide));
 // A viewport too short for the band keeps the widget on screen.
 assert.equal(w.place({side:'left',y:0},300,100,zero).y,44);
});

test('widget: re-appended after hydration removes it, keeping its spot',()=>{
 const h=host();h.drag(h.launcher,[766,366],[100,100]);const at=xy(h);
 h.launcher.remove();h.backdrop.remove();h.dialog.remove();
 h.host.scan();assert.ok(h.launcher.isConnected&&h.dialog.isConnected&&h.backdrop.isConnected);
 assert.deepEqual(xy(h),at);assert.equal(h.launcher.style.left,at.x+'px');
});

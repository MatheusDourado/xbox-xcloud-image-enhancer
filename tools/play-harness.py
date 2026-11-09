from pathlib import Path
# play.xbox.com userscript on a page with the new site's stream structure (docs/play-xbox-com.md):
# div[data-testid=media-container] > video, srcObject set from a WebRTC loopback on ontrack, as
# WebRtcStreamV1 does. Loads the built xcloud-image-filter-play.user.js as is.
probe=r'''
(async()=>{
 const checks=[];function check(ok,label){if(!ok)throw new Error(label);checks.push(label);}
 const wait=ms=>new Promise(r=>setTimeout(r,ms));
 const until=async(test,ms,label)=>{const end=performance.now()+ms;while(performance.now()<end){if(test())return;await wait(50);}throw new Error('Timeout: '+label);};
 const api=window.BxImageFilter,host=api.playHost;
 check(RTCPeerConnection.bxTracked&&typeof RTCPeerConnection.generateCertificate==='function','RTCPeerConnection is tracked at document-start and keeps its statics');
 // A video without a WebRTC stream (trailer, hero) is never treated.
 const decoy=document.createElement('video');decoy.muted=true;document.body.append(decoy);
 await wait(1200);check(!host.player()&&!document.querySelector('canvas.bxif-play-canvas'),'Nothing is attached without a stream');
 // The button shows on every page, so the user can see the script runs; the panel says no game is running.
 let launch=document.querySelector('.bxif-play-launch');
 check(launch&&launch.isConnected&&!launch.hasAttribute('data-stream')&&getComputedStyle(launch).opacity>0.5,'Panel button is visible without a game');
 launch.click();await until(()=>api.panelOpen,2000,'panel visible without a game');
 check(/Nenhum jogo em andamento/.test(document.querySelector('.bxif-play-diag').textContent)&&document.querySelector('.bxif-play-dialog .bxif-panel'),'Panel opens without a game and says none is running');
 launch.click();await until(()=>!api.panelOpen,2000,'panel closed');
 // React hydration may drop nodes it did not render: the button comes back.
 launch.remove();await wait(1200);launch=document.querySelector('.bxif-play-launch');check(launch&&launch.isConnected,'Removed button is put back');
 const src=document.createElement('canvas');src.width=320;src.height=180;const ctx=src.getContext('2d');
 const stream=src.captureStream(30),track=stream.getVideoTracks()[0];
 let produced=0,running=true;(async()=>{while(running){ctx.fillStyle=`rgb(${(produced*37)%256},${(produced*91)%256},90)`;ctx.fillRect(0,0,320,180);ctx.fillStyle='#fff';ctx.fillRect((produced*7)%300,60,20,60);produced++;await wait(33);}})();
 const a=new RTCPeerConnection(),b=new RTCPeerConnection();
 check(a instanceof RTCPeerConnection&&Object.getPrototypeOf(RTCPeerConnection.prototype)===RTCPeerConnection.__proto__.prototype,'Tracked connections are real RTCPeerConnections');
 a.onicecandidate=e=>e.candidate&&b.addIceCandidate(e.candidate);b.onicecandidate=e=>e.candidate&&a.addIceCandidate(e.candidate);
 a.addTrack(track,stream);
 const root=document.createElement('div');root.dataset.testid='root-container';root.style.cssText='width:640px;height:360px';
 const container=document.createElement('div');container.dataset.testid='media-container';container.className='w-full h-full';container.style.cssText='width:100%;height:100%';
 root.append(container);document.body.append(root);
 // WebRtcStreamV1.connectAsync: the render target and its attributes.
 const makeVideo=()=>{const v=document.createElement('video');v.style.width='100%';v.style.height='100%';v.style.objectFit='contain';v.autoplay=true;v.playsInline=true;v.muted=true;v.tabIndex=0;container.append(v);return v;};
 let video=makeVideo();
 b.ontrack=e=>{if(e.track.kind==='video'){video.srcObject=e.streams[0];video.play().catch(()=>{});}};
 await a.setLocalDescription();await b.setRemoteDescription(a.localDescription);await b.setLocalDescription();await a.setRemoteDescription(b.localDescription);
 await until(()=>STATES.currentStream.peerConnection===b,3000,'receiving connection recorded');
 check(true,'The connection that receives video is the one used for telemetry');
 await until(()=>host.player()&&api.status.frames>10,6000,'player attached and rendering');
 const player=host.player(),canvas=player.$canvas;
 check(player.$video===video&&canvas.previousElementSibling===video&&canvas.classList.contains('bxif-play-canvas'),'Canvas is placed right after the stream video');
 check(video.classList.contains('bxif-play-source')&&getComputedStyle(video).opacity==='0'&&getComputedStyle(video).display!=='none','Video stays in place (input, focus) but transparent');
 check(getComputedStyle(canvas).pointerEvents==='none'&&getComputedStyle(container).position!=='static','Canvas lets pointer input through and covers the container');
 check(['filtered','original','cas'].includes(api.status.mode)&&player.gl.getError()===player.gl.NO_ERROR,`Treatment renders without GL errors (${api.status.mode}, ${api.status.resolution})`);
 const r=canvas.getBoundingClientRect();check(Math.abs(r.width-640)<2&&Math.abs(r.height-360)<2,`Canvas covers the stream area (${r.width}×${r.height})`);
 const f0=api.status.frames;await wait(1000);check(api.status.frames-f0>=15,`Frames keep coming (${api.status.frames-f0} in 1 s)`);
 // Panel: launcher button and Alt+Shift+F, keys inside it do not reach the page.
 check(launch.hasAttribute('data-stream')&&launch.getBoundingClientRect().top<20,'Panel button moves to the top left during the game');
 document.dispatchEvent(new KeyboardEvent('keydown',{key:'F',code:'KeyF',altKey:true,shiftKey:true,bubbles:true}));
 const dialog=document.querySelector('.bxif-play-dialog');
 await until(()=>api.panelOpen,2000,'panel visible');
 check(dialog&&!dialog.hidden&&dialog.querySelector('.bxif-panel'),'Alt+Shift+F opens the panel with the treatment controls');
 check(/Tratamento ligado ao vídeo do jogo/.test(document.querySelector('.bxif-play-diag').textContent),'Panel says the treatment is bound to the game video');
 let leaked=0;const spy=()=>leaked++;window.addEventListener('keydown',spy);
 dialog.querySelector('.bxif-panel button')?.dispatchEvent(new KeyboardEvent('keydown',{key:'a',bubbles:true}));
 window.removeEventListener('keydown',spy);check(leaked===0,'Keys typed in the panel do not reach the game');
 await until(()=>api.status.net&&api.status.net.fpsReceived>0,5000,'telemetry from getStats');
 check(true,`Stream telemetry reads the tracked connection (${api.status.net.codec}, ${Math.round(api.status.net.fpsReceived)} FPS)`);
 dialog.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
 check(dialog.hidden,'Escape closes the panel');await until(()=>!api.panelOpen,2000,'panel hidden');
 launch.click();check(!dialog.hidden,'The button opens the panel');launch.click();check(dialog.hidden,'The button closes it');
 // Teardown as WebRtcStreamV1 does it: srcObject cleared and the video removed.
 video.srcObject=null;video.remove();
 await until(()=>!host.player(),3000,'detach after teardown');
 check(!document.querySelector('canvas.bxif-play-canvas')&&!launch.hasAttribute('data-stream')&&launch.isConnected&&api.status.mode==='waiting','Teardown removes the canvas; the button returns to the corner');
 // Reconnect: a new video element and a new track.
 video=makeVideo();b.ontrack=null;video.srcObject=new MediaStream([b.getReceivers().find(x=>x.track.kind==='video').track]);video.play().catch(()=>{});
 await until(()=>host.player()&&host.player().$video===video&&api.status.frames>5,6000,'re-attach on reconnect');
 check(!video.nextElementSibling||video.nextElementSibling.classList.contains('bxif-play-canvas'),'A new stream video gets the treatment again');
 check(document.querySelectorAll('canvas.bxif-play-canvas').length===1,'Only one canvas exists');
 // Renderer WebGPU (audit R3): on the new site the canvas is positioned by the bxif-play-canvas class, so the
 // WebGPU canvas inherits the classes of the WebGL2 one. Headless Chromium has no WebGPU here: the engine
 // creation is stubbed to stay 'starting', the state in which the canvas is already placed and synced.
 {const gpu=globalThis.BxWebGPU,real={supported:gpu.supported,create:gpu.create};gpu.supported=()=>true;gpu.create=()=>new Promise(()=>{});
  const gpuCanvas=()=>document.querySelector('canvas[data-bx-renderer=webgpu]');
  api.update({renderer:'webgpu'});await until(gpuCanvas,3000,'WebGPU canvas created');
  const g=gpuCanvas(),c=host.player().$canvas,rg=g.getBoundingClientRect(),rc=c.getBoundingClientRect(),cs=getComputedStyle(g);
  check(g.nextElementSibling===c&&g.classList.contains('bxif-play-canvas')&&g.getAttribute('aria-hidden')==='true','WebGPU canvas sits under the WebGL2 canvas with its classes and aria-hidden');
  check(cs.position==='absolute'&&cs.pointerEvents==='none'&&rg.width>100&&['left','top','width','height'].every(k=>Math.abs(rg[k]-rc[k])<1),`WebGPU canvas covers the WebGL2 canvas rectangle (${rg.width}×${rg.height} at ${rg.left},${rg.top})`);
  check(api.status.renderer.state==='starting'&&api.status.renderer.active==='webgl2'&&g.style.visibility==='hidden','WebGL2 keeps drawing while WebGPU starts');
  c.classList.add('bxif-probe');await until(()=>g.classList.contains('bxif-probe'),2000,'class added on the WebGPU canvas');
  c.classList.remove('bxif-probe');await until(()=>!g.classList.contains('bxif-probe'),2000,'class removed from the WebGPU canvas');
  check(true,'Class changes on the WebGL2 canvas reach the WebGPU canvas');
  api.update({renderer:'auto'});await until(()=>!gpuCanvas(),3000,'WebGPU canvas removed');
  check(document.querySelectorAll('canvas.bxif-play-canvas').length===1&&api.status.renderer.state==='webgl2','Back to Auto removes the WebGPU canvas');
  Object.assign(gpu,real);}
 running=false;video.srcObject=null;video.remove();await until(()=>!host.player(),3000,'final detach');
 a.close();b.close();
 document.getElementById('result').textContent=JSON.stringify({passed:checks});
})().catch(e=>{document.getElementById('result').textContent=JSON.stringify({error:e.message});console.error(e);});
'''
Path('output/playwright').mkdir(parents=True,exist_ok=True)
Path('output/playwright/play-harness.html').write_text('<!doctype html><meta charset="utf-8"><pre id="result">Running</pre><script src="../../xcloud-image-filter-play.user.js"></script><script>'+probe+'</script>',encoding='utf-8')

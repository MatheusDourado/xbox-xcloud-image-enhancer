(()=>{ if(window.__rec){return 'already';}
const R=window.__rec={t0:performance.now(),wall0:Date.now(),sec:[],loaf:[],rvfc:[],marks:[],vid:null};
const pick=S=>({t:Math.round(performance.now()-R.t0),mode:S.mode,res:S.resolution,disp:S.display,fps:S.fps,gpuP95:S.gpuP95,est:S.gpuEstimate,neural:S.neural,adapt:S.adaptation,
 pacing:S.pacing,origin:S.origin&&{server:S.origin.server,arrival:S.origin.arrival,presented:S.origin.presented,missed:S.origin.missed},fl:S.fluidity,cap:S.capture&&{a:S.capture.active,f:S.capture.frames,r:S.capture.reason},
 net:S.net&&{w:S.net.width,h:S.net.height,fps:S.net.fpsReceived,mbps:S.net.bitrateMbps,codec:S.net.codec,dec:S.net.decoder,impl:S.net.implementation,decMs:S.net.decodeMs,bufMs:S.net.bufferMs,rtt:S.net.rttMs,loss:S.net.lossPct,drop:S.net.framesDropped,frz:S.net.freezes,bpp:S.net.bitsPerPixel},
 rend:S.renderer&&S.renderer.active,warn:(S.warnings||[]).map(w=>w.key).join(',')});
R.iv=setInterval(()=>{try{const S=BxImageFilter.status;R.sec.push(pick(S));if(R.sec.length>7200)R.sec.shift();}catch(e){}
 try{const v=document.querySelector('video');if(v&&v!==R.vid){R.vid=v;let last=null;const f=(now,m)=>{const t=performance.now();
  R.rvfc.push([Math.round(now-R.t0),+(t-now).toFixed(2),+(m.expectedDisplayTime-t).toFixed(2),last==null?0:m.presentedFrames-last-1,m.receiveTime?+(m.presentationTime-m.receiveTime).toFixed(1):null,m.processingDuration?+(m.processingDuration*1000).toFixed(2):null]);
  last=m.presentedFrames;if(R.rvfc.length>40000)R.rvfc.shift();if(R.vid===v)v.requestVideoFrameCallback(f);};v.requestVideoFrameCallback(f);}}catch(e){}
},1000);
try{new PerformanceObserver(l=>{for(const e of l.getEntries())if(e.duration>50)R.loaf.push({t:Math.round(e.startTime-R.t0),d:Math.round(e.duration),block:Math.round(e.blockingDuration||0),scripts:(e.scripts||[]).slice(0,3).map(s=>({src:(s.sourceURL||'').split('/').pop(),fn:s.sourceFunctionName,d:Math.round(s.duration)}))});}).observe({type:'long-animation-frame',buffered:false});}catch(e){R.loafErr=String(e)}
return 'installed';})()

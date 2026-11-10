(()=>{ if(window.__nodrop) return 'already';
const N=window.__nodrop={capMs:8,real:null,calls:0};
const wrap=orig=>async function(){const rep=await orig.apply(this,arguments);
  try{let changed=false;const m=new Map();
    rep.forEach((v,k)=>{if(v.type==='inbound-rtp'&&(v.kind==='video'||v.mediaType==='video')&&v.framesDecoded>0&&typeof v.totalDecodeTime==='number'){
        N.real={t:performance.now(),totalDecodeTime:v.totalDecodeTime,framesDecoded:v.framesDecoded};
        const c=Object.assign({},v);c.totalDecodeTime=Math.min(v.totalDecodeTime,v.framesDecoded*N.capMs/1000);m.set(k,c);changed=true;}
      else m.set(k,v);});
    N.calls++; if(changed) return m;}catch(e){N.err=String(e);}
  return rep;};
RTCPeerConnection.prototype.getStats=wrap(RTCPeerConnection.prototype.getStats);
if(window.RTCRtpReceiver)RTCRtpReceiver.prototype.getStats=wrap(RTCRtpReceiver.prototype.getStats);
return 'installed';})()

(()=>{ if(window.__f1080) return 'already';
const L=window.__f1080={log:[]};
const of=window.fetch;
window.fetch=async function(input,init){
  try{
    const url=typeof input==='string'?input:input.url;
    if(/\/sessions\/cloud\/play$/i.test(url)||/\/sessions\/[a-z]+\/play$/i.test(url)){
      let req=input instanceof Request?input:null;
      let body=init&&init.body; if(body==null&&req) body=await req.clone().text();
      let headers=new Headers((init&&init.headers)||(req&&req.headers)||{});
      const before={body:String(body).slice(0,1500),dev:headers.get('x-ms-device-info')};
      try{const b=JSON.parse(body); if(b.settings){b.settings.osName='windows';} body=JSON.stringify(b);}catch(e){}
      try{const d=JSON.parse(headers.get('x-ms-device-info'));
        if(d&&d.dev){d.dev.os=d.dev.os||{};d.dev.os.name='windows';d.dev.os.ver='22631.2715';d.dev.os.platform='desktop';
          d.dev.hw=d.dev.hw||{};d.dev.hw.make='Microsoft';d.dev.hw.model='Surface Pro';
          d.dev.displayInfo={dimensions:{widthInPixels:1920,heightInPixels:1080},pixelDensity:{dpiX:1,dpiY:1}};
          d.dev.browser={browserName:'chrome',browserVersion:'130.0'};}
        headers.set('x-ms-device-info',JSON.stringify(d));}catch(e){}
      L.log.push({url,before,after:{body:String(body).slice(0,1500),dev:headers.get('x-ms-device-info')}});
      const ni=Object.assign({},init||{},{body,headers,method:(init&&init.method)||(req&&req.method)||'POST'});
      return of.call(this,url,ni);
    }
  }catch(e){L.err=String(e);}
  return of.apply(this,arguments);
};
const osl=RTCPeerConnection.prototype.setLocalDescription, osr=RTCPeerConnection.prototype.setRemoteDescription;
const h264=s=>(s&&s.sdp||'').split('\n').filter(l=>/H264|profile-level-id/.test(l)).slice(0,12);
RTCPeerConnection.prototype.setLocalDescription=function(d){try{L.log.push({local:d&&d.type,h264:h264(d)});}catch(e){}return osl.apply(this,arguments);};
RTCPeerConnection.prototype.setRemoteDescription=function(d){try{L.log.push({remote:d&&d.type,h264:h264(d)});}catch(e){}return osr.apply(this,arguments);};
return 'installed';})()

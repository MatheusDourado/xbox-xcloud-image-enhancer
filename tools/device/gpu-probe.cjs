(async()=>{
const targets=await (await fetch('http://127.0.0.1:9222/json')).json();
const t=targets.find(x=>x.type==='page')||targets[0];
if(!t){console.log('no target');return;}
console.log('targets',targets.length,'origin',new URL(t.url).origin);
const ws=new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
const expr=`(async()=>{const out={secure:isSecureContext,ua:navigator.userAgent,hasGpu:!!navigator.gpu,mstp:typeof MediaStreamTrackProcessor,offscreen:typeof OffscreenCanvas};
const c=document.createElement('canvas'),gl=c.getContext('webgl2');
if(gl){const d=gl.getExtension('WEBGL_debug_renderer_info');out.webgl={renderer:gl.getParameter(gl.RENDERER),unmasked:d?gl.getParameter(d.UNMASKED_RENDERER_WEBGL):null,timer:!!gl.getExtension('EXT_disjoint_timer_query_webgl2'),floatRT:!!gl.getExtension('EXT_color_buffer_float'),halfRT:!!gl.getExtension('EXT_color_buffer_half_float'),highp:gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER,gl.HIGH_FLOAT).precision,medium:gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER,gl.MEDIUM_FLOAT).precision};gl.getExtension('WEBGL_lose_context')?.loseContext();}
if(navigator.gpu){try{const a=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});out.adapter=!!a;
if(a){const i=a.info||{};out.info={vendor:i.vendor,architecture:i.architecture,device:i.device,description:i.description,isFallback:i.isFallbackAdapter};out.features=[...a.features].sort();
const L={};for(const k of ['maxTextureDimension2D','maxComputeWorkgroupStorageSize','maxComputeInvocationsPerWorkgroup','maxComputeWorkgroupSizeX','maxStorageBufferBindingSize','maxBufferSize','maxColorAttachments'])L[k]=a.limits[k];out.limits=L;
const want=['timestamp-query','shader-f16'].filter(f=>a.features.has(f));
try{const dev=await a.requestDevice({requiredFeatures:want});out.device={ok:true,features:[...dev.features].sort()};
out.preferredFormat=navigator.gpu.getPreferredCanvasFormat();out.importExternalTexture=typeof dev.importExternalTexture;dev.destroy();}catch(e){out.device={ok:false,error:String(e)};}}
}catch(e){out.adapterError=String(e);}}
return JSON.stringify(out);})()`;
const res=await new Promise(r=>{ws.onmessage=m=>{const d=JSON.parse(m.data);if(d.id===1)r(d);};ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression:expr,awaitPromise:true,returnByValue:true}}));});
const v=res.result?.result?.value;
console.log(v?JSON.stringify(JSON.parse(v),null,1):JSON.stringify(res).slice(0,600));
ws.close();
})().catch(e=>console.log('ERR',e));

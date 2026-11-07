// Usage: adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>, then node tools/device/run-in-webview.cjs tools/device/gpu-bench-page.js
const fs=require('fs');(async()=>{
const targets=await (await fetch('http://127.0.0.1:9222/json')).json();
const t=targets.find(x=>x.type==='page');const ws=new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
const res=await new Promise(r=>{ws.onmessage=m=>{const d=JSON.parse(m.data);if(d.id===1)r(d);};ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression:fs.readFileSync(process.argv[2],'utf8'),awaitPromise:true,returnByValue:true}}));});
const v=res.result?.result?.value;console.log(v||JSON.stringify(res).slice(0,900));ws.close();
})().catch(e=>console.log('ERR',e));

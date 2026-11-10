// node cdp.cjs "<expr>"  | node cdp.cjs -f file.js   (requires adb forward tcp:9222 already)
const fs=require('fs');(async()=>{
let expr=process.argv[2]==='-f'?fs.readFileSync(process.argv[3],'utf8'):process.argv[2];
const targets=await (await fetch('http://127.0.0.1:9222/json')).json();
const t=targets.filter(x=>x.type==='page').find(x=>/xbox\.com/.test(x.url))||targets.find(x=>x.type==='page');
const ws=new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
const res=await new Promise(r=>{ws.onmessage=m=>{const d=JSON.parse(m.data);if(d.id===1)r(d);};
 ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression:`(async()=>{const __r=await (async()=>(${expr}))();return typeof __r==='string'?__r:JSON.stringify(__r,null,1);})()`,awaitPromise:true,returnByValue:true}}));});
const v=res.result?.result?.value;console.log(v??JSON.stringify(res).slice(0,1500));ws.close();
})().catch(e=>{console.log('ERR',e.message);process.exit(1)});

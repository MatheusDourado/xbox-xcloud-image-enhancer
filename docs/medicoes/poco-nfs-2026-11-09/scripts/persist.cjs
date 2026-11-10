const fs=require('fs');(async()=>{
const src=fs.readFileSync(process.argv[2],'utf8');
const targets=await (await fetch('http://127.0.0.1:9222/json')).json();
const t=targets.filter(x=>x.type==='page').find(x=>/xbox\.com/.test(x.url));
const ws=new WebSocket(t.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
let id=0;const send=(method,params={})=>new Promise(r=>{const i=++id;const h=m=>{const d=JSON.parse(m.data);if(d.id===i){ws.removeEventListener('message',h);r(d);}};ws.addEventListener('message',h);ws.send(JSON.stringify({id:i,method,params}));});
await send('Page.enable');
console.log('add',JSON.stringify(await send('Page.addScriptToEvaluateOnNewDocument',{source:src})));
if(process.argv[3]==='reload'){console.log('reload',JSON.stringify(await send('Page.reload',{ignoreCache:false})));}
ws.addEventListener('message',m=>{const d=JSON.parse(m.data);if(d.method==='Page.frameNavigated'&&!d.params.frame.parentId)console.log(new Date().toTimeString().slice(0,8),'nav',d.params.frame.url);});
ws.onclose=()=>{console.log('closed');process.exit(0)};
setInterval(()=>{},1e6);
})().catch(e=>{console.log('ERR',e.message);process.exit(1)});

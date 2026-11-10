(async()=>{
const targets=await (await fetch('http://127.0.0.1:9222/json')).json();
const t=targets.filter(x=>x.type==='page').find(x=>/xbox\.com/.test(x.url));
const ws=new WebSocket(t.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
let id=0;const scripts=[];const send=(method,params={})=>new Promise(r=>{const i=++id;const h=m=>{const d=JSON.parse(m.data);if(d.id===i){ws.removeEventListener('message',h);r(d);}};ws.addEventListener('message',h);ws.send(JSON.stringify({id:i,method,params}));});
ws.addEventListener('message',m=>{const d=JSON.parse(m.data);if(d.method==='Debugger.scriptParsed'&&d.params.url)scripts.push(d.params);});
await send('Debugger.enable');await new Promise(r=>setTimeout(r,1500));
const terms=process.argv.slice(2);
for(const s of scripts){ if(!/xbox|gssv|xboxlive|assets/.test(s.url))continue;
  const src=(await send('Debugger.getScriptSource',{scriptId:s.scriptId})).result?.scriptSource||'';
  for(const term of terms){let i=src.indexOf(term),n=0;while(i>=0&&n<3){console.log('##',s.url.split('/').pop(),term,i,'\n',src.slice(Math.max(0,i-400),i+500).replace(/\s+/g,' '));i=src.indexOf(term,i+1);n++;}}
}
await send('Debugger.disable');ws.close();
})().catch(e=>console.log('ERR',e.message));

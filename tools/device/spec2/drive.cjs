// CDP helper for the Spec 2 bench. Poco: adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>.
// Usage: node drive.cjs <port> <url|-> <expression file or inline> [timeoutSeconds]
const fs=require('fs'),path=require('path');
async function connect(port){
 const targets=await (await fetch(`http://127.0.0.1:${port}/json`)).json();const t=targets.find(x=>x.type==='page');if(!t)throw new Error('no page target');
 const ws=new WebSocket(t.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
 let id=0;const wait=new Map(),events=[],handlers=[];
 ws.onmessage=m=>{const d=JSON.parse(m.data);if(d.id&&wait.has(d.id)){wait.get(d.id)(d);wait.delete(d.id);}else{events.push(d);if(events.length>200)events.shift();for(const h of handlers)h(d);}};
 const send=(method,params={})=>new Promise(r=>{const n=++id;wait.set(n,r);ws.send(JSON.stringify({id:n,method,params}));});
 return {send,events,handlers,close:()=>ws.close()};
}
async function evaluate(c,expression,timeoutMs=600000){
 const r=await Promise.race([c.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true}),new Promise((_,j)=>setTimeout(()=>j(new Error('timeout')),timeoutMs))]);
 if(r.result?.exceptionDetails)throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0,800));return r.result?.result?.value;
}
async function navigate(c,url){await c.send('Page.enable');await c.send('Page.navigate',{url});
 for(let i=0;i<200;i++){await new Promise(r=>setTimeout(r,100));try{const s=await evaluate(c,'document.readyState+" "+location.href',2000);if(s&&s.startsWith('complete')&&s.includes(url.split('?')[0]))return;}catch{}}throw new Error('navigate '+url);}
// The Android WebView refuses cleartext HTTP, even on loopback, and the app must not change for a bench:
// CDP answers https://bench.invalid/* from the repository, so the page gets a secure origin with no network.
const TYPES={'.html':'text/html','.js':'text/javascript','.mp4':'video/mp4','.png':'image/png'};
async function serveRepo(c,host='https://bench.invalid'){const root=path.resolve(__dirname,'../../..');
 await c.send('Fetch.enable',{patterns:[{urlPattern:host+'/*'}]});
 c.handlers.push(d=>{if(d.method!=='Fetch.requestPaused')return;const {requestId,request}=d.params,rel=decodeURIComponent(new URL(request.url).pathname),file=path.join(root,rel);
  if(!file.startsWith(root)||!fs.existsSync(file)){c.send('Fetch.fulfillRequest',{requestId,responseCode:404});return;}
  c.send('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:TYPES[path.extname(file)]||'application/octet-stream'},{name:'Cache-Control',value:'no-store'}],body:fs.readFileSync(file).toString('base64')});});}
// Poco conditions. Temperatures come from the HAL section: thermalservice's cached list only refreshes on threshold events.
function pocoState(){const o=require('child_process').execSync('adb shell "dumpsys battery; dumpsys thermalservice; dumpsys window | grep mCurrentFocus"',{encoding:'utf8'}),m=r=>(o.match(r)||[])[1];
 const hal=o.slice(o.indexOf('Current temperatures from HAL')),temp=n=>{const r=hal.match(new RegExp('mValue=(-?[0-9.]+), mType=[0-9]+, mName='+n+','));return r?Number(r[1]):null;};
 const all=[...hal.matchAll(/mValue=([0-9.]+), mType=1, mName=GPU[0-9]/g)].map(x=>Number(x[1])),cool=n=>{const r=hal.match(new RegExp('CoolingDevice\{mValue=([0-9]+), mType=[0-9]+, mName='+n+'\}'));return r?Number(r[1]):null;};
 return {at:new Date().toISOString(),level:Number(m(/level: (\d+)/)),status:Number(m(/status: (\d+)/)),voltageV:temp('vbat'),currentA:temp('ibat'),tempC:Number(m(/temperature: (\d+)/))/10,thermal:Number(m(/Thermal Status: (\d+)/)),cpu0:temp('CPU0'),gpuMaxC:all.length?Math.max(...all):null,skinC:temp('skin'),socdPct:temp('socd'),coolGpu:cool('gpu'),coolBattery:cool('battery'),focus:(m(/mCurrentFocus=Window\{\S+ \S+ ([^}]+)\}/)||'').split('/')[0]};}
module.exports={connect,evaluate,navigate,serveRepo,pocoState};
if(require.main===module)(async()=>{const [port,url,expr,timeout]=process.argv.slice(2);const c=await connect(port);if(url!=='-')await navigate(c,url);
 const code=fs.existsSync(expr)?fs.readFileSync(expr,'utf8'):expr;console.log(await evaluate(c,code,(Number(timeout)||600)*1000));c.close();})().catch(e=>{console.error('ERR',e.message);process.exit(1);});

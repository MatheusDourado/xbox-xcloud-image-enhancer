// Sweep of production-like sessions with the GPU time the device itself reports.
// Poco: ftrace power/gpu_work_period through Perfetto (active ns per UID, about 1 s periods).
// Vostro: Windows counter GPU Engine 3D utilization. Usage: node sweep.cjs <poco|vostro> <name> <cases.json>
const fs=require('fs'),path=require('path'),{execSync,spawn}=require('child_process'),{connect,evaluate,navigate,serveRepo}=require('./drive.cjs');
const [device,name,casesFile]=process.argv.slice(2),poco=device==='poco',port=poco?9222:9333,base=poco?'https://bench.invalid':'http://127.0.0.1:8765';
const cases=JSON.parse(fs.readFileSync(casesFile,'utf8')),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const tmp=process.env.TEMP||'.',adbEnv={...process.env,MSYS_NO_PATHCONV:'1'};
function state(){if(!poco)return {at:new Date().toISOString()};
 const o=execSync('adb shell "dumpsys battery; dumpsys thermalservice; dumpsys window | grep mCurrentFocus"',{encoding:'utf8'}),m=r=>(o.match(r)||[])[1];
 return {at:new Date().toISOString(),level:Number(m(/level: (\d+)/)),tempC:Number(m(/temperature: (\d+)/))/10,thermal:Number(m(/Thermal Status: (\d+)/)),gpuC:Number(m(/mValue=([\d.]+), mType=\d+, mName=GPU[^,]*,/)),focus:(m(/mCurrentFocus=Window\{\S+ \S+ ([^}]+)\}/)||'').split('/')[0]};}
function trace(seconds){
 if(poco){const cfg=`buffers { size_kb: 16384 fill_policy: RING_BUFFER }\nduration_ms: ${seconds*1000}\ndata_sources { config { name: "linux.ftrace" ftrace_config { ftrace_events: "power/gpu_work_period" } } }\n`;
  const f=path.join(tmp,'wp.pbtx');fs.writeFileSync(f,cfg);execSync(`adb push "${f}" /data/local/tmp/wp.pbtx`,{stdio:'ignore',env:adbEnv});
  const p=spawn('adb',['shell','cat /data/local/tmp/wp.pbtx | perfetto --txt -c - -o /data/misc/perfetto-traces/wp.pftrace'],{stdio:'ignore',env:adbEnv});
  return new Promise(r=>p.on('exit',()=>{const out=path.join(tmp,'wp.pftrace');execSync(`adb pull /data/misc/perfetto-traces/wp.pftrace "${out}"`,{stdio:'ignore',env:adbEnv});
   r(JSON.parse(execSync(`python "${path.join(__dirname,'pftrace.py')}" --work "${out}"`,{encoding:'utf8'})));}));}
 const out=path.join(tmp,'gpu3d.txt');try{fs.unlinkSync(out);}catch{}
 const ps=`$s=Get-Counter -Counter '\\GPU Engine(*engtype_3D)\\Utilization Percentage' -SampleInterval 1 -MaxSamples ${seconds};$s|%{($_.CounterSamples|Measure-Object -Property CookedValue -Sum).Sum}|Out-File -Encoding ascii '${out}'`;
 const p=spawn('powershell',['-NoProfile','-Command',ps],{stdio:'ignore'});
 return new Promise(r=>p.on('exit',()=>{const v=fs.readFileSync(out,'utf8').trim().split(/\s+/).map(Number);r({utilPct:v});}));
}
const mid=v=>{const c=v.slice(2,-2),s=[...c].sort((a,b)=>a-b);return c.length?s[s.length>>1]:null;};
(async()=>{const c=await connect(port);if(poco)await serveRepo(c);let page=null,env=null;const rows=[];
 for(const k of cases){const query=k.query||'x=1';
  if(query!==page){await navigate(c,`${base}/tools/device/spec2/bench.html?${query}`);env=JSON.parse(await evaluate(c,'B.ready().then(JSON.stringify)',60000));page=query;await sleep(1500);}
  const before=state();if(poco&&!before.focus.includes('imagefilter'))throw new Error('app not in front');
  const T=k.seconds||12,t=trace(T);await sleep(poco?300:800);
  const r=JSON.parse(await evaluate(c,`B.session(${JSON.stringify({...k.cfg,seconds:T-1.5})}).then(JSON.stringify)`,(T+20)*1000));
  const g=await t,after=state();
  // GPU ms per frame: active share of the stable seconds over the frames actually drawn.
  const share=poco?mid(g.periods.map(p=>p.share)):mid(g.utilPct)/100,fps=r.fps,row={name:k.name,query,cfg:k.cfg,gpuBusyPct:+(share*100).toFixed(1),gpuMsPerFrame:fps>0?+(share*1000/fps).toFixed(2):null,fps,cpu:r.cpu,gaps:r.gaps,raf:r.raf,dropped:r.dropped,decoded:r.decoded,fence:r.fence,trace:g,before,after,attrs:env.attrs,samples:env.samples};
  rows.push(row);console.log(`${k.name.padEnd(26)} busy ${row.gpuBusyPct}% gpu/frame ${row.gpuMsPerFrame} ms fps ${fps} cpu p50 ${r.cpu?.p50} gap p95 ${r.gaps?.p95} dropped ${r.dropped} T ${after.tempC??''}`);await sleep(k.rest||1500);
 }
 c.close();const file=path.resolve(__dirname,'../../../docs/medicoes/spec2',`${device}-${name}.json`);fs.mkdirSync(path.dirname(file),{recursive:true});
 fs.writeFileSync(file,JSON.stringify({name,device,env,rows},null,1)+'\n');
})().catch(e=>{console.error('ERR',e.message);process.exit(1);});

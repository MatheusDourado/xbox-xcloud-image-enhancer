// Runs one measurement on a device and stores it with its conditions.
// Usage: node meas.cjs <poco|vostro> <name> <query> <expression> [timeoutSeconds]
// Output: docs/medicoes/spec2/<device>-<name>.json. Poco runs record battery and temperature before and after.
const fs=require('fs'),path=require('path'),{execSync}=require('child_process'),{connect,evaluate,navigate,serveRepo,pocoState}=require('./drive.cjs');
const [device,name,query,expr,timeout]=process.argv.slice(2);
const poco=device==='poco',port=poco?9222:9333,url=`${poco?'https://bench.invalid':'http://127.0.0.1:8765'}/tools/device/spec2/bench.html?${query}`;
function state(){return poco?pocoState():{at:new Date().toISOString()};}
(async()=>{
 const before=state();if(poco&&!before.focus.includes('imagefilter'))throw new Error('app not in front: '+before.focus);
 const c=await connect(port);if(poco)await serveRepo(c);await navigate(c,url);
 const env=JSON.parse(await evaluate(c,'B.ready().then(JSON.stringify)',60000));
 const code=fs.existsSync(expr)?fs.readFileSync(expr,'utf8'):expr;
 const value=await evaluate(c,`(async()=>JSON.stringify(await (${code})))()`,(Number(timeout)||900)*1000);
 c.close();const after=state(),out={name,device,query,before,after,env,result:JSON.parse(value)};
 const file=path.resolve(__dirname,'../../../docs/medicoes',process.env.BX_MEAS_DIR||'spec2',`${device}-${name}.json`);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(out,null,1)+'\n');
 console.log(JSON.stringify({before,after,env:{renderer:env.unmasked,attrs:env.attrs,samples:env.samples,css:env.css,hidden:env.hidden}}));console.log(value.slice(0,6000));
})().catch(e=>{console.error('ERR',e.message);process.exit(1);});

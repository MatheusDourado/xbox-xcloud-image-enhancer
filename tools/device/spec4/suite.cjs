// Runs a browser suite page (output/playwright/*.html, built by tools/*-harness.py) inside the Poco's WebView,
// served by CDP like the benches, and stores its result with the device conditions.
// Usage: node suite.cjs <page.html> [name]   Output: docs/medicoes/spec4/poco-suite-<name>.json
const fs=require('fs'),path=require('path'),{connect,evaluate,navigate,serveRepo,pocoState}=require('../spec2/drive.cjs');
const [page,name=page.replace(/\.html$/,'')]=process.argv.slice(2),sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const before=pocoState();if(!before.focus.includes('imagefilter'))throw new Error('app not in front: '+before.focus);
 const c=await connect(9222);await serveRepo(c);await navigate(c,`https://bench.invalid/output/playwright/${page}`);
 let result=null;for(let i=0;i<600&&!result;i++){await sleep(500);try{const t=await evaluate(c,"document.querySelector('#result').textContent",3000);const r=JSON.parse(t);if(r)result=r;}catch{}}
 const env=JSON.parse(await evaluate(c,"JSON.stringify({ua:navigator.userAgent})",3000));
 c.close();const after=pocoState(),file=path.resolve(__dirname,'../../../docs/medicoes/spec4',`poco-suite-${name}.json`);
 fs.writeFileSync(file,JSON.stringify({page,before,after,env,result},null,1)+'\n');
 console.log(JSON.stringify({passed:result?.passed?.length,failures:result?.failures,error:result?.error,skipped:result?.skipped,report:result?.report&&{adapter:result.report.adapter,gl:result.report.gl,sameDevice:result.report.sameDevice,createMs:result.report.createMs}},null,1).slice(0,4000));
 process.stdout.write('',()=>process.exit(0));
})().catch(e=>{console.error('ERR',e.message);process.exit(1);});

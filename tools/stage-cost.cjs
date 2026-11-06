// Runs player/stage-cost.html in headless Chromium and saves the JSON (Spec 1 cost table).
// Usage: node tools/stage-cost.cjs [msPerConfig] [outHeight]   (build first: python3 tools/build.py)
// Headless Chromium here renders on SwiftShader (CPU): values are relative only, never Adreno/Iris Xe.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),ms=Number(process.argv[2])||3000,out=Number(process.argv[3])||1280;
const types={'.html':'text/html','.js':'text/javascript','.mp4':'video/mp4','.webm':'video/webm'};
const server=http.createServer((req,res)=>{const file=path.join(root,decodeURIComponent(new URL(req.url,'http://x').pathname));
  if(!file.startsWith(root)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);});
server.listen(0,async()=>{
  const browser=await chromium.launch({args:['--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
  try{
    const page=await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/player/stage-cost.html?auto&ms=${ms}&out=${out}`);
    await page.waitForFunction(()=>document.title==='done'||document.title==='error',null,{timeout:ms*40+900000});
    const report=await page.evaluate(()=>stageCostReport());
    if(!report)throw new Error(await page.textContent('#log'));
    fs.mkdirSync(path.join(root,'output/playwright'),{recursive:true});
    const file=path.join(root,'output/playwright/stage-cost.json');fs.writeFileSync(file,JSON.stringify(report,null,1));
    console.log('renderer:',report.renderer,'timer:',report.timerQuery,'webgpu:',JSON.stringify(report.webgpu));
    for(const r of report.rows)console.log(r.name.padEnd(44),r.output.join('x').padEnd(10),r.msPerFrame.toFixed(2).padStart(7),'Δ',r.deltaMs.toFixed(2).padStart(6));
    console.log('saved',path.relative(root,file));
  }finally{await browser.close();server.close();}
});

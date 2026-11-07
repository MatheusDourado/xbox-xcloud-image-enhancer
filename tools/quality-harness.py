from pathlib import Path
# Deterministic motion/noise fixture. Compare against the same CAS applied to clean frames.
html=r'''<!doctype html><meta charset="utf-8"><pre id="result">Running motion-quality check</pre><script src="../restoration.bundle.js"></script><script>
(async()=>{
 const width=128,height=96;
 function engine(){const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const gl=canvas.getContext('webgl2',{preserveDrawingBuffer:true,antialias:false});return {gl,engine:new BxRestoration.Engine(gl,BxShaders)};}
 const truth=engine(),spatial=engine(),temporal=engine();
 const source=document.createElement('canvas');source.width=width;source.height=height;const ctx=source.getContext('2d');
 let movement=4;function image(frame,noisy){const data=ctx.createImageData(width,height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
   const px=x+frame*movement;let hash=(Math.imul(Math.floor(px/8),374761393)+Math.imul(Math.floor(y/8),668265263))>>>0;hash=Math.imul(hash^(hash>>>13),1274126177)>>>0;const base=45+(hash%90);
   const noise=noisy?(((Math.floor(px/4)*17+Math.floor(y/4)*31+frame*13)%9)-4):0;
   const i=(y*width+x)*4;data.data[i]=base+noise;data.data[i+1]=base+noise;data.data[i+2]=base+noise;data.data[i+3]=255;
  }ctx.putImageData(data,0,0);
 }
 function pixels(host){const data=new Uint8Array(width*height*4);host.gl.readPixels(0,0,width,height,host.gl.RGBA,host.gl.UNSIGNED_BYTE,data);return data;}
 function mse(a,b){let total=0,count=0;for(let y=8;y<height-8;y++)for(let x=16;x<width-16;x++){const i=(y*width+x)*4;total+=(a[i]-b[i])**2;count++;}return total/count;}
 const options=BxRestoration.normalize({cleanup:0,deband:0,temporal:0,upscale:false,sharpness:3,detail:.2});const results=[];
 for(const speed of [0,1,2,3,4,5,6,7,8,16,32]){movement=speed;for(const host of [truth,spatial,temporal])host.engine.resetBudget();let before=0,after=0,count=0;
 for(let frame=0;frame<30;frame++){
  image(frame,false);truth.engine.render(source,width,height,options,frame/60);const target=pixels(truth);
  image(frame,true);spatial.engine.render(source,width,height,options,frame/60);temporal.engine.render(source,width,height,{...options,temporal:1},frame/60);
  if(frame>4){before+=mse(pixels(spatial),target);after+=mse(pixels(temporal),target);count++;}
 }
 results.push({pixelsPerFrame:speed,frames:count,spatialMSE:before/count,temporalMSE:after/count,reductionPercent:100*(before-after)/before});}
 if(results.some(r=>r.reductionPercent<15))throw new Error('Temporal error reduction below 15% on deterministic motion fixture: '+JSON.stringify(results));
 const result={passed:true,fixture:'128x96 translated block texture, deterministic +/-4 code-value noise',cases:results};
 for(const host of [truth,spatial,temporal])host.engine.destroy();
 document.querySelector('#result').textContent=JSON.stringify(result);
})().catch(error=>{document.querySelector('#result').textContent=JSON.stringify({error:error.message});console.error(error);});
</script>'''
Path('output/playwright/motion-quality.html').write_text(html)

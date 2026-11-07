// Worker half of the 10.3 test: the shipped engine on an OffscreenCanvas, fed by a transferred frame stream.
importScripts('../../../output/restoration.bundle.js');
onmessage=async({data:{off,readable,seconds,OW,OH}})=>{
 const gl=off.getContext('webgl2',{antialias:false,alpha:false,depth:false,stencil:false,preserveDrawingBuffer:false}),e=new BxRestoration.Engine(gl,BxShaders),reader=readable.getReader();
 const s={...BxRestoration.defaults,mode:'filtered',output:String(OH),gpuBudget:0},gaps=[],cpu=[];let last=null,n=0;const end=performance.now()+seconds*1000;
 for(;;){const {value:f,done}=await reader.read();if(done)break;const now=performance.now();if(now>end){f.close();break;}
  if(last!==null)gaps.push(now-last);last=now;const a=performance.now();e.render(f,OW,OH,s,now/1000);cpu.push(performance.now()-a);f.close();n++;}
 reader.cancel().catch(()=>{});
 const stat=v=>{const q=[...v].sort((a,b)=>a-b),at=p=>q[Math.min(q.length-1,Math.floor(q.length*p))];return v.length?{n:v.length,p50:+at(.5).toFixed(3),p95:+at(.95).toFixed(3),p99:+at(.99).toFixed(3),max:+q[q.length-1].toFixed(3)}:null;};
 postMessage({fps:+(n/seconds).toFixed(2),gaps:stat(gaps),cpu:stat(cpu)});
};

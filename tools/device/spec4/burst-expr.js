(async()=>{const cases=[['gl',{renderer:'gl'}],['gpu',{renderer:'gpu'}],['gpuCompute',{renderer:'gpu',compute:true}],['glSgsr',{renderer:'gl',overrides:{scaler:'sgsr'}}],['gpuSgsr',{renderer:'gpu',overrides:{scaler:'sgsr'}}],
 ['glVideoFrame',{renderer:'gl',frame:true}],['gpuVideoFrame',{renderer:'gpu',frame:true}],['glV9',{renderer:'gl',overrides:BxRestoration.presets.v9.values}],['gpuV9',{renderer:'gpu',overrides:BxRestoration.presets.v9.values}]];
 const out={};for(const [k,c] of cases)await B.burst({...c,n:40,rounds:1});
 for(let r=0;r<3;r++)for(const [k,c] of [...cases].sort(()=>Math.random()-.5)){const v=await B.burst({...c,n:40,rounds:2});(out[k]??=[]).push(v);}
 return out;})()

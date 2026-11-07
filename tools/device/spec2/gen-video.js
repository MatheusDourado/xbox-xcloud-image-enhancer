// Encodes a game-like H.264 Main clip with WebCodecs (no ffmpeg on the bench machine) and writes the
// clean references and decoded frames in the layout tools/eval expects. Footage: local Windows
// wallpapers under a moving camera, with particles and a HUD; nothing is committed.
const SCENES=[{name:'caverna',src:'/wall/Screen/img100.jpg',pan:[1.3,.4],span:.62},{name:'rocha',src:'/wall/Wallpaper/Theme1/img3.jpg',pan:[.7,.5],span:.86},{name:'noite',src:'/wall/Wallpaper/Theme1/img13.jpg',pan:[1.6,.1],span:.42}];
const log=t=>{document.getElementById('log').textContent+='\n'+t;};
const save=(path,body)=>fetch('/save/'+path,{method:'POST',body}).then(r=>{if(!r.ok)throw new Error('save '+path);});
async function load(s){const b=await (await fetch(s.src)).blob();s.image=await createImageBitmap(b);return s;}
function draw(x,W,H,s,i,fps){
 // i: frame inside the scene. Motion is in seconds, so 30 and 60 FPS clips show the same camera.
 const t=i/fps,m=s.image,z=1+.05*Math.sin(t*.7),sw=m.width*s.span/z,sh=sw*9/16;
 const sx=Math.min(m.width-sw,Math.max(0,(m.width-sw)*.25+t*s.pan[0]*30)),sy=Math.min(m.height-sh,Math.max(0,(m.height-sh)*.3+t*s.pan[1]*30));
 x.imageSmoothingEnabled=true;x.imageSmoothingQuality='high';x.drawImage(m,sx,sy,sw,sh,0,0,W,H);
 const k=W/1920;
 for(let n=0;n<260;n++){const px=(n*97+t*30*(9+n%7))%1920,py=(n*53+t*30*(5+n%5))%1080,c=170+(n*37%85);x.fillStyle=`rgb(${c},${c-20},${c-60})`;x.beginPath();x.arc(px*k,py*k,1.6*k,0,7);x.fill();}
 x.fillStyle='rgba(20,24,30,.82)';x.beginPath();x.roundRect(46*k,886*k,526*k,150*k,14*k);x.fill();
 x.font=`bold ${36*k}px sans-serif`;x.fillStyle='#ebebeb';x.fillText('HP 1250 / 1500',68*k,936*k);
 x.font=`bold ${27*k}px sans-serif`;x.fillStyle='#ffc440';x.fillText('Missão: atravessar a ponte',68*k,980*k);
 x.font=`bold ${22*k}px sans-serif`;x.fillStyle='#78c8ff';x.fillText('Munição 24 | 120',68*k,1016*k);
 x.fillStyle='#b41e1e';x.fillRect(1426*k,60*k,434*k,18*k);x.fillStyle='#28c850';x.fillRect(1426*k,60*k,300*k,18*k);
 x.strokeStyle='#fff';x.lineWidth=1.5*k;for(let n=0;n<12;n++){x.beginPath();x.moveTo((1500+n*30)*k,120*k);x.lineTo((1522+n*30)*k,195*k);x.stroke();}
}
function box(type,...parts){const n=parts.reduce((a,p)=>a+p.length,8),o=new Uint8Array(n),d=new DataView(o.buffer);d.setUint32(0,n);for(let i=0;i<4;i++)o[4+i]=type.charCodeAt(i);let at=8;for(const p of parts){o.set(p,at);at+=p.length;}return o;}
const u32=(...v)=>{const o=new Uint8Array(v.length*4),d=new DataView(o.buffer);v.forEach((x,i)=>d.setUint32(i*4,x));return o;};
const u16=(...v)=>{const o=new Uint8Array(v.length*2),d=new DataView(o.buffer);v.forEach((x,i)=>d.setUint16(i*2,x));return o;};
const zeros=n=>new Uint8Array(n),text=s=>new TextEncoder().encode(s);
function mp4(samples,avcC,W,H,fps){
 const scale=fps*1000,delta=1000,dur=samples.length*delta,ms=Math.round(dur/scale*1000),matrix=u32(0x10000,0,0,0,0x10000,0,0,0,0x40000000);
 const ftyp=box('ftyp',text('isom'),u32(512),text('isomiso2avc1mp41'));
 const size=samples.reduce((a,s)=>a+s.data.length,0);
 const avc1=box('avc1',zeros(6),u16(1),zeros(16),u16(W,H),u32(0x480000,0x480000,0),u16(1),zeros(32),u16(24,0xffff),box('avcC',avcC));
 const stsd=box('stsd',u32(0,1),avc1),stts=box('stts',u32(0,1,samples.length,delta)),stsc=box('stsc',u32(0,1,1,samples.length,1));
 const stsz=box('stsz',u32(0,0,samples.length),u32(...samples.map(s=>s.data.length)));
 const keys=samples.flatMap((s,i)=>s.key?[i+1]:[]),stss=box('stss',u32(0,keys.length),u32(...keys));
 const build=first=>{const stbl=box('stbl',stsd,stts,stsc,stsz,box('stco',u32(0,1,first)),stss),dinf=box('dinf',box('dref',u32(0,1),box('url ',u32(1))));
  const minf=box('minf',box('vmhd',u32(1),zeros(8)),dinf,stbl);
  const mdia=box('mdia',box('mdhd',u32(0,0,0,scale,dur),u16(0x55c4,0)),box('hdlr',u32(0,0),text('vide'),zeros(12),text('video\0')),minf);
  const tkhd=box('tkhd',u32(3,0,0,1,0,ms,0,0,0,0),matrix,u32(W<<16,H<<16));
  const mvhd=box('mvhd',u32(0,0,0,1000,ms,0x10000),u16(0x100,0),zeros(10),matrix,zeros(24),u32(2));
  return box('moov',mvhd,box('trak',tkhd,mdia));};
 const moov=build(ftyp.length+build(0).length+8);
 return new Blob([ftyp,moov,u32(size+8),text('mdat'),...samples.map(s=>s.data)],{type:'video/mp4'});
}
async function png(canvas){return new Promise(r=>canvas.toBlob(r,'image/png'));}
async function decodeAndSave(samples,config,keep,fps,per,W,H){
 const c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d',{alpha:false});
 const pending=[];let n=0;
 const dec=new VideoDecoder({output:f=>{const i=n++,scene=Math.floor(i/per),local=i%per,want=keep.frames.includes(local),seq=keep.seq.includes(local);
   if(want||seq){x.drawImage(f,0,0,W,H);pending.push(png(c).then(b=>Promise.all([want&&save(`eval/${SCENES[scene].name}-${keep.mbps}-${local}.png`,b),seq&&save(`eval/seq/${SCENES[scene].name}-${local}.png`,b)])));}f.close();},error:e=>{throw e;}});
 dec.configure({codec:config.codec,codedWidth:W,codedHeight:H,description:config.description});
 for(let i=0;i<samples.length;i++){const s=samples[i];dec.decode(new EncodedVideoChunk({type:s.key?'key':'delta',timestamp:i,data:s.data}));while(dec.decodeQueueSize>4)await new Promise(r=>setTimeout(r,1));}
 await dec.flush();dec.close();await Promise.all(pending);
 for(const s of SCENES)for(const local of [...new Set([...keep.frames,...keep.seq])])for(const [key,w,h] of [['1080',1920,1080],['1280',2276,1280]]){
  const r=document.createElement('canvas');r.width=w;r.height=h;const rx=r.getContext('2d',{alpha:false});draw(rx,w,h,s,local,fps);const b=await png(r);
  if(keep.frames.includes(local))await save(`eval/${s.name}-ref${key}-${local}.png`,b);if(key==='1080'&&keep.seq.includes(local))await save(`eval/seq/${s.name}-ref-${local}.png`,b);}
}
async function encode({name,fps,mbps,seconds,keep}){
 const W=1920,H=1080,per=seconds*fps,c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d',{alpha:false});
 const samples=[];let config=null;
 const enc=new VideoEncoder({output:(chunk,meta)=>{if(meta?.decoderConfig)config=meta.decoderConfig;const d=new Uint8Array(chunk.byteLength);chunk.copyTo(d);samples.push({data:d,key:chunk.type==='key'});},error:e=>{log('enc error '+e);}});
 const cfg={codec:'avc1.4D0028',width:W,height:H,bitrate:mbps*1e6,framerate:fps,bitrateMode:'constant',latencyMode:'realtime',avc:{format:'avc'},hardwareAcceleration:'prefer-hardware'};
 const sup=await VideoEncoder.isConfigSupported(cfg);enc.configure(cfg);
 let n=0;
 for(const s of SCENES)for(let i=0;i<per;i++){draw(x,W,H,s,i,fps);const f=new VideoFrame(c,{timestamp:Math.round(n*1e6/fps),duration:Math.round(1e6/fps)});enc.encode(f,{keyFrame:n===0});f.close();n++;
  while(enc.encodeQueueSize>2)await new Promise(r=>setTimeout(r,1));if(n%120===0)log(name+' '+n);}
 await enc.flush();enc.close();
 const total=samples.reduce((a,s)=>a+s.data.length,0);
 await save(`videos/${name}.mp4`,mp4(samples,new Uint8Array(config.description),W,H,fps));
 const summary={name,frames:samples.length,keys:samples.filter(s=>s.key).length,mbps:total*8/(samples.length/fps)/1e6,bpp:total*8/samples.length/(W*H),codec:config.codec,colorSpace:config.colorSpace,supported:sup.supported};
 if(keep)await decodeAndSave(samples,config,keep,fps,per,W,H);
 return summary;
}
window.run=async()=>{await Promise.all(SCENES.map(load));log('loaded');
 const seq=Array.from({length:18},(_,i)=>150+i),out=[];
 out.push(await encode({name:'game30',fps:30,mbps:9,seconds:8,keep:{mbps:9,frames:[60,120,180],seq}}));
 out.push(await encode({name:'game60',fps:60,mbps:15,seconds:8}));
 return JSON.stringify(out);};

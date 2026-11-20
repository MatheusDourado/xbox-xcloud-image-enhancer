"""Objective evaluation of the real WebGL pipeline against clean references.

Requires: python3 tools/eval/make_eval_set.py <textures>, a static server at the repo
root (python3 -m http.server 8765) and Playwright with Chromium.
Usage: python3 tools/eval/run_eval.py [search|report] [--bundle path]
"""
import os
from playwright.sync_api import sync_playwright

SCENES = ['textures', 'sponza', 'sky']
BITRATES = [10, 15, 20]
SAMPLES = [24, 47]
PAGE = r'''<!doctype html><meta charset="utf-8"><pre id="result">ready</pre><script src="BUNDLE"></script><script>
const W=1920,H=1080;
const canvas=document.createElement('canvas');const gl=canvas.getContext('webgl2',{preserveDrawingBuffer:true,antialias:false});
const engine=new BxRestoration.Engine(gl,BxShaders);
const cache={};
// Central crop: 864x486 at (540,297) in 1080p maps exactly to 1024x576 at (640,352) in 1280p (factor 32/27).
async function image(src){if(cache[src])return cache[src];const i=new Image();i.src=src;await i.decode();
 const k=i.height/1080,w=Math.round(864*k),h=Math.round(486*k);
 const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.drawImage(i,Math.round(540*k),Math.round(297*k),w,h,0,0,w,h);
 return cache[src]={canvas:c,data:x.getImageData(0,0,w,h).data,width:w,height:h};}
function render(input,settings,w,h){canvas.width=w;canvas.height=h;engine.resetBudget();
 engine.render(input.canvas,w,h,{gpuBudget:0,...settings},1);
 const p=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,p);
 const o=new Uint8ClampedArray(w*h*4),s=w*4;for(let y=0;y<h;y++)o.set(p.subarray((h-1-y)*s,(h-y)*s),y*s);return o;}
function bilinear(data,w,h,ow,oh){const a=document.createElement('canvas');a.width=w;a.height=h;a.getContext('2d').putImageData(new ImageData(data,w,h),0,0);
 const b=document.createElement('canvas');b.width=ow;b.height=oh;const x=b.getContext('2d');x.imageSmoothingEnabled=true;x.imageSmoothingQuality='low';x.drawImage(a,0,0,ow,oh);return x.getImageData(0,0,ow,oh).data;}
function planes(d,n){const Y=new Float32Array(n),U=new Float32Array(n),V=new Float32Array(n);
 for(let i=0;i<n;i++){const r=d[i*4],g=d[i*4+1],b=d[i*4+2],y=.2126*r+.7152*g+.0722*b;Y[i]=y;U[i]=b-y;V[i]=r-y;}return {Y,U,V};}
function integral(a,w,h){const I=new Float64Array((w+1)*(h+1));for(let y=0;y<h;y++){let s=0;for(let x=0;x<w;x++){s+=a[y*w+x];I[(y+1)*(w+1)+x+1]=I[y*(w+1)+x+1]+s;}}return I;}
function metrics(out,ref,w,h,region){const n=w*h,A=planes(out,n),B=planes(ref,n);
 const y0=region?region[0]:0,y1=region?region[1]:h;
 let se=0,cse=0,cnt=0;for(let y=y0;y<y1;y++)for(let x=0;x<w;x++){const i=y*w+x;se+=(A.Y[i]-B.Y[i])**2;cse+=((A.U[i]-B.U[i])**2+(A.V[i]-B.V[i])**2)/2;cnt++;}
 // SSIM on luma, 8x8 box windows (integral images), stride 4.
 const sq=a=>a.map(v=>v*v),xy=new Float32Array(n);for(let i=0;i<n;i++)xy[i]=A.Y[i]*B.Y[i];
 const Ia=integral(A.Y,w,h),Ib=integral(B.Y,w,h),Iaa=integral(sq(A.Y),w,h),Ibb=integral(sq(B.Y),w,h),Iab=integral(xy,w,h);
 const box=(I,x,y)=>I[(y+8)*(w+1)+x+8]-I[y*(w+1)+x+8]-I[(y+8)*(w+1)+x]+I[y*(w+1)+x];
 const C1=(.01*255)**2,C2=(.03*255)**2;let ssim=0,sn=0;
 for(let y=y0;y<=y1-8;y+=4)for(let x=0;x<=w-8;x+=4){const ma=box(Ia,x,y)/64,mb=box(Ib,x,y)/64,va=box(Iaa,x,y)/64-ma*ma,vb=box(Ibb,x,y)/64-mb*mb,cab=box(Iab,x,y)/64-ma*mb;
  ssim+=((2*ma*mb+C1)*(2*cab+C2))/((ma*ma+mb*mb+C1)*(va+vb+C2));sn++;}
 // Detail: high-pass gain toward the reference; halo: overshoot beyond the reference 3x3 range.
 let hpRef=0,hpCross=0,hpOut=0,halo=0,hn=0;
 for(let y=Math.max(1,y0);y<Math.min(h-1,y1);y++)for(let x=1;x<w-1;x++){const i=y*w+x;
  const ha=4*A.Y[i]-A.Y[i-1]-A.Y[i+1]-A.Y[i-w]-A.Y[i+w],hb=4*B.Y[i]-B.Y[i-1]-B.Y[i+1]-B.Y[i-w]-B.Y[i+w];
  hpRef+=hb*hb;hpCross+=ha*hb;hpOut+=ha*ha;
  let lo=255,hi=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const v=B.Y[i+dy*w+dx];if(v<lo)lo=v;if(v>hi)hi=v;}
  if(hi-lo>40){halo+=Math.max(0,A.Y[i]-hi-1)+Math.max(0,lo-1-A.Y[i]);hn++;}}
 // Banding (smooth regions only): gradient of a 3x3 box blur (removes dither) against the reference.
 let band=0,bn=0;if(region){const blur=(P,i)=>(P[i-w-1]+P[i-w]+P[i-w+1]+P[i-1]+P[i]+P[i+1]+P[i+w-1]+P[i+w]+P[i+w+1])/9;
  for(let y=Math.max(2,y0);y<Math.min(h-2,y1);y++)for(let x=2;x<w-2;x++){const i=y*w+x;
   const ga=Math.abs(blur(A.Y,i+1)-blur(A.Y,i))+Math.abs(blur(A.Y,i+w)-blur(A.Y,i)),gb=Math.abs(blur(B.Y,i+1)-blur(B.Y,i))+Math.abs(blur(B.Y,i+w)-blur(B.Y,i));
   band+=Math.abs(ga-gb);bn++;}}
 return {psnr:10*Math.log10(255*255/(se/cnt)),chroma:10*Math.log10(255*255/(cse/cnt)),ssim:ssim/sn,detail:hpCross/hpRef,energy:hpOut/hpRef,halo:hn?halo/hn:0,band:bn?band/bn:0};}
// Sequential frames through one engine (temporal history kept). Flicker: luma change between
// consecutive outputs that the reference does not have (texture "boiling").
window.evaluateSequence=async(job)=>{engine.resetBudget();const res=[];let prevOut=null,prevRef=null;
 for(let k=0;k<job.inputs.length;k++){const input=await image(job.inputs[k]),ref=await image(job.refs[k]);const w=ref.width,h=ref.height;
  canvas.width=w;canvas.height=h;engine.render(input.canvas,w,h,{gpuBudget:0,...job.settings},1+k/60);
  const p=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,p);const out=new Uint8ClampedArray(w*h*4),st=w*4;for(let y=0;y<h;y++)out.set(p.subarray((h-1-y)*st,(h-y)*st),y*st);
  if(k>=job.from){const m=metrics(out,ref.data,w,h,null);
   if(prevOut){let f=0;const n=w*h;for(let i=0;i<n;i++){const lo=.2126*out[i*4]+.7152*out[i*4+1]+.0722*out[i*4+2],lpo=.2126*prevOut[i*4]+.7152*prevOut[i*4+1]+.0722*prevOut[i*4+2];
    const lr=.2126*ref.data[i*4]+.7152*ref.data[i*4+1]+.0722*ref.data[i*4+2],lpr=.2126*prevRef[i*4]+.7152*prevRef[i*4+1]+.0722*prevRef[i*4+2];f+=Math.abs((lo-lpo)-(lr-lpr));}m.flicker=f/n;}
   res.push(m);}
  prevOut=out;prevRef=ref.data;}
 return res;};
window.evaluate=async(jobs)=>{const results=[];
 for(const job of jobs){const input=await image(job.input),ref=await image(job.ref);
  let out=render(input,job.settings,job.display?input.width:ref.width,job.display?input.height:ref.height);
  if(job.display)out=bilinear(out,input.width,input.height,ref.width,ref.height);
  results.push(metrics(out,ref.data,ref.width,ref.height,job.region));}
 return results;};
</script>'''

def jobs(settings, target='1080', display=False, region_sky=False):
    out = []
    for scene in SCENES:
        for mbps in BITRATES:
            for i in SAMPLES:
                region = [0, 373 if target == '1080' else 442] if region_sky and scene == 'sky' else None  # sky rows of the crop
                if region_sky and scene != 'sky': continue
                out.append({'input': f'{scene}-{mbps}-{i}.png', 'ref': f'{scene}-ref{target}-{i}.png', 'settings': settings, 'display': display, 'region': region, 'scene': scene, 'mbps': mbps})
    return out

class Evaluator:
    def __init__(self, bundle='../restoration.bundle.js'):
        os.makedirs('output/eval', exist_ok=True)
        open('output/eval/eval.html', 'w').write(PAGE.replace('BUNDLE', bundle))
        self.p = sync_playwright().start()
        self.b = self.p.chromium.launch(executable_path=os.environ.get('CHROMIUM', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'),
                                        args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        self.page = self.b.new_page(); self.page.goto('http://127.0.0.1:8765/output/eval/eval.html')
    def run(self, job_list):
        clean = [{k: v for k, v in j.items() if k not in ('scene', 'mbps')} for j in job_list]
        res = self.page.evaluate('j=>evaluate(j)', clean)
        for j, r in zip(job_list, res): r.update(scene=j['scene'], mbps=j['mbps'])
        return res
    def score(self, settings, **kw):
        res = self.run(jobs(settings, **kw))
        mean = lambda k: sum(r[k] for r in res) / len(res)
        return {k: round(mean(k), 4) for k in ('ssim', 'psnr', 'chroma', 'detail', 'energy', 'halo', 'band')}, res
    def banding(self, settings, target='1080'):
        res = self.run(jobs(settings, target=target, region_sky=True))
        return round(sum(r['band'] for r in res) / len(res), 4)
    def sequence(self, settings, scenes=SCENES, start=30, end=48, measure_from=8):
        out = {}
        for scene in scenes:
            job = {'inputs': [f'seq/{scene}-{i}.png' for i in range(start, end)], 'refs': [f'seq/{scene}-ref-{i}.png' for i in range(start, end)],
                   'settings': settings, 'from': measure_from}
            res = self.page.evaluate('j=>evaluateSequence(j)', job)
            out[scene] = {k: round(sum(r[k] for r in res if k in r) / max(1, sum(1 for r in res if k in r)), 4) for k in ('ssim', 'psnr', 'detail', 'energy', 'halo', 'flicker')}
        mean = {k: round(sum(v[k] for v in out.values()) / len(out), 4) for k in ('ssim', 'psnr', 'detail', 'energy', 'halo', 'flicker')}
        return mean, out
    def close(self): self.b.close(); self.p.stop()

import json,sys,importlib.util
spec=importlib.util.spec_from_file_location('pf',sys.argv[1]); pf=importlib.util.module_from_spec(spec); spec.loader.exec_module(pf)
m=json.load(open(sys.argv[2])); R=json.load(open(sys.argv[3])); R=json.loads(R) if isinstance(R,str) else R; tr=sys.argv[4]
def q(a,p):
  a=sorted(x for x in a if x is not None); return round(a[min(len(a)-1,int(len(a)*p))],2) if a else None
for i,s in enumerate(m['segments']):
  print('SEG',i,s['config']['renderer'],'neural',s['config']['effective']['neural'],'frames',s['frames'],'dur',round(s['durationMs']/1e3),'drawFps',round(s['drawFps'],1),'pacerDropped',s['pacerDropped'],'passes',[p['sequence'] for p in s['passes']])
  print('  gpu',s['gpu']['method'],s['gpu']['p50'],s['gpu']['p95'],s['gpu']['p99'])
  for k in('display','arrival','wait','cpu'): d=s[k]; print('  ',k,d['p50'],d['p95'],d['p99'],d['maxMs'],'hitches',d['hitches'])
T=m['timeline']; race=[t for t in T if t['fpsReceived']<45 and t['bitrateMbps']>2]
print('timeline race secs',len(race),{k:(q([t[k] for t in race],.05),q([t[k] for t in race],.5),q([t[k] for t in race],.95)) for k in('bitrateMbps','fpsReceived','decodeMs','bufferMs','bitsPerPixel','gpuMs','waitMs','refreshHz')})
print('freezes',[(t['t'],t['freezes'],t['decoderDropped'],t['fpsReceived']) for t in T if t['freezes'] or t['decoderDropped']])
print('loaf',[(l['t'],l['d']) for l in R['loaf']]); print('marks',R['marks'])
rv=R['rvfc']
for idx,n in ((1,'cpu'),(2,'slack'),(4,'pipe'),(5,'proc')): print(' rvfc',n,[q([x[idx] for x in rv],p) for p in(.05,.5,.95,.99,1)])
print(' rvfc skips',sum(x[3] for x in rv if x[3]>0))
ft=pf.frame_timeline(tr); L=[v for k,v in ft['layers'].items() if 'xcloud' in k]
W=pf.gpu_work(tr); dur=(W[-1]['startMs']-W[0]['startMs'])/1e3 if W else 1
print('app layer frames',L[0]['frames'] if L else None,'per s %.1f'%(L[0]['frames']/dur) if L else '', 'stuffing',sum(v for k,v in (L[0].items() if L else []) if 'stuffing' in k),'app_deadline',sum(v for k,v in (L[0].items() if L else []) if 'app_deadline' in k))
ps=W[len(W)//4:]  # skip first quarter (loading)
A=sum(max(p['uids'].values()) for p in ps); Ln=sum(p['lengthMs'] for p in ps)
print('gpu busy (last 3/4) %.1f%%'%(100*A/Ln),'dur s',round(dur))

import sys,importlib.util
spec=importlib.util.spec_from_file_location('pf',sys.argv[1]); pf=importlib.util.module_from_spec(spec); spec.loader.exec_module(pf)
for path,a,b in ((sys.argv[2],.35,.6),(sys.argv[2],.65,.95),(sys.argv[3],.15,.95)):
  ev=[]
  for ts,pid,eid,bb in pf.ftrace_events(path):
    if eid==11:
      f={k:v for k,w,v in pf.fields(bb)}; ev.append((ts,f.get(2,0),f.get(1,0)))
  ev.sort(); t0,t1=ev[0][0],ev[-1][0]; lo,hi=t0+(t1-t0)*a,t0+(t1-t0)*b
  cur={};acc={};
  last=None
  for ts,cpu,fr in ev:
    if cpu in cur and ts>lo:
      s=max(cur[cpu][0],lo); e=min(ts,hi)
      if e>s: acc.setdefault(cpu,[0,0]); acc[cpu][0]+=cur[cpu][1]*(e-s); acc[cpu][1]+=e-s
    cur[cpu]=(ts,fr)
  print(path.split('/')[-1],a,b,{c:round(v[0]/v[1]/1e3) for c,v in sorted(acc.items()) if v[1]},'MHz')

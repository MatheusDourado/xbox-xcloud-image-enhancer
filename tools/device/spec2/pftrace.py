"""Minimal Perfetto trace reader: no trace_processor, so nothing has to be downloaded.

Decodes the protobuf wire format of a .pftrace enough to walk TracePacket fields
(ftrace bundles, stats). Field numbers come from perfetto's public trace protos.
"""
import sys

def varint(b, i):
    r = s = 0
    while True:
        c = b[i]; i += 1
        r |= (c & 127) << s; s += 7
        if c < 128: return r, i

def fields(b, i=0, end=None):
    end = len(b) if end is None else end
    while i < end:
        k, i = varint(b, i); f, w = k >> 3, k & 7
        if w == 0: v, i = varint(b, i)
        elif w == 1: v = b[i:i + 8]; i += 8
        elif w == 2:
            n, i = varint(b, i); v = b[i:i + n]; i += n
        elif w == 5: v = b[i:i + 4]; i += 4
        else: raise ValueError(f'wire {w}')
        yield f, w, v

def packets(path):
    data = open(path, 'rb').read()
    for f, w, v in fields(data):
        if f == 1 and w == 2: yield v

def ftrace_events(path):
    """Yields (timestamp_ns, pid, event_field_id, event_bytes)."""
    for p in packets(path):
        for f, w, v in fields(p):
            if f != 1 or w != 2: continue  # TracePacket.ftrace_events
            for bf, bw, bv in fields(v):
                if bf != 2 or bw != 2: continue  # FtraceEventBundle.event
                ts = pid = 0; ev = None; eid = None
                for ef, ew, evv in fields(bv):
                    if ef == 1: ts = evv
                    elif ef == 2: pid = evv
                    elif ew == 2: eid, ev = ef, evv
                if eid is not None: yield ts, pid, eid, ev

def gpu_work(path):
    """power/gpu_work_period (FtraceEvent field 488): active GPU ns per UID, per period."""
    rows = {}
    for ts, pid, eid, b in ftrace_events(path):
        if eid != 488: continue
        f = {k: v for k, w, v in fields(b)}
        rows.setdefault((f.get(1, 0), f.get(3), f.get(4)), []).append((f.get(2), f.get(5, 0)))
    out = []
    for (gpu, a, z), items in sorted(rows.items(), key=lambda r: r[0][1]):
        active = sum(v for _, v in items)
        out.append({'startMs': a / 1e6, 'lengthMs': (z - a) / 1e6, 'activeMs': active / 1e6, 'share': active / max(1, z - a), 'uids': {str(u): v / 1e6 for u, v in items}})
    return out

if __name__ == '__main__':
    if sys.argv[1] == '--work':
        import json; print(json.dumps({'periods': gpu_work(sys.argv[2])})); sys.exit()
    from collections import Counter
    top = Counter(); ev = Counter(); strs = []
    for p in packets(sys.argv[1]):
        for f, w, v in fields(p):
            top[f] += 1
            if f == 34 and w == 2:  # ftrace_stats
                for sf, sw, sv in fields(v):
                    if sw == 2:
                        try: strs.append((sf, sv.decode()))
                        except Exception: pass
    for ts, pid, eid, b in ftrace_events(sys.argv[1]): ev[eid] += 1
    print('packet fields', top.most_common(20)); print('ftrace ids', ev.most_common(30)); print('stats strings', strs[:40])

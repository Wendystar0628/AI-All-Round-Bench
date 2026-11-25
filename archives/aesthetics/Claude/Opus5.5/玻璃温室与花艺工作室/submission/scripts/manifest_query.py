import json, sys, collections, re
m = json.load(open(r'H:\AI_OneShot_Model\aesthetics\Claude\Opus5.5\玻璃温室与花艺工作室\manifest.json', encoding='utf-8'))
objs = m['objects']

def union(bbs):
    mn = [min(b[0][i] for b in bbs) for i in range(3)]
    mx = [max(b[1][i] for b in bbs) for i in range(3)]
    return [round(v, 2) for v in mn], [round(v, 2) for v in mx]

mode = sys.argv[1] if len(sys.argv) > 1 else 'coll'
if mode == 'coll':
    by = collections.defaultdict(list)
    for o in objs:
        if o.get('bbox_world_m'):
            by[o['collection']].append(o['bbox_world_m'])
    for k in sorted(by):
        print(k, len(by[k]), union(by[k]))
elif mode == 'prefix':
    # bounding boxes per name prefix (strip trailing numbers)
    pat = sys.argv[2]
    by = collections.defaultdict(list)
    tri = collections.Counter()
    mats = collections.defaultdict(set)
    for o in objs:
        if re.search(pat, o['name']) and o.get('bbox_world_m'):
            key = re.sub(r'(_\d+)+$', '', o['name'])
            by[key].append(o['bbox_world_m'])
            tri[key] += o['triangles']
            mats[key].update(o['materials'])
    for k in sorted(by):
        print(k, len(by[k]), 'tris', tri[k], sorted(mats[k]), union(by[k]))
elif mode == 'list':
    pat = sys.argv[2]
    for o in objs:
        if re.search(pat, o['name']):
            print(o['name'], o['collection'], o['materials'], o['triangles'], [[round(v, 2) for v in c] for c in o['bbox_world_m']])
elif mode == 'mat':
    pat = sys.argv[2]
    by = collections.defaultdict(list)
    tri = collections.Counter()
    for o in objs:
        if any(re.search(pat, mm) for mm in o['materials']):
            key = re.sub(r'(_\d+)+$', '', o['name'])
            by[key].append(o['bbox_world_m'])
            tri[key] += o['triangles']
    for k in sorted(by):
        print(k, len(by[k]), 'tris', tri[k], union(by[k]))

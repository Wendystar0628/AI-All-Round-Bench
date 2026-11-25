import bpy, sys, math
from mathutils import Vector
out = open(sys.argv[sys.argv.index("--") + 1], "w", encoding="utf-8")
sc = bpy.context.scene
dg = bpy.context.evaluated_depsgraph_get()
skip = set()
for o in bpy.data.objects:
    if o.type == 'MESH' and any(s.material and ("Glass" in s.material.name or "Water" in s.material.name) for s in o.material_slots):
        skip.add(o.name)
subjects = {
    "cloche_bench": [Vector((-4.9 + dx, 2.9 + dy, 0.96)) for dx in (-0.3, 0, 0.3) for dy in (-0.5, 0, 0.5)],
    "tea_table": [Vector((dx, 5.78 + dy, 0.78)) for dx in (-0.25, 0, 0.25) for dy in (-0.2, 0, 0.2)],
    "east_bench": [Vector((5.7, dy, 0.5)) for dy in (-0.6, -0.3, 0, 0.3, 0.6)],
    "orchids_E": [Vector((4.6, -1.5 + 0.5 * k, 1.6)) for k in range(7)],
    "pool": [Vector((x, y, 0.34)) for x in (-1.5, -0.5, 0.5, 1.5) for y in (-1.5, -0.5, 0.5, 1.5)],
    "workbench": [Vector((-11 + dx, dy, 0.95)) for dx in (-1.2, -0.4, 0.4, 1.2) for dy in (-0.6, 0, 0.6)],
}
def trace(o, d):
    for _ in range(10):
        hit, loc, nor, idx, ob, mat = sc.ray_cast(dg, o, d, distance=400.0)
        if not hit:
            return None
        if ob.name in skip:
            o = loc + d * 0.002
            continue
        return ob.name
    return None
for el in (18, 20.5, 23):
    for az in (300, 306, 312, 318, 324):
        a = math.radians(az); e = math.radians(el)
        d = Vector((math.sin(a) * math.cos(e), math.cos(a) * math.cos(e), math.sin(e)))
        line = []
        for k, pts in subjects.items():
            lit = 0
            blockers = {}
            for p in pts:
                r = trace(p, d)
                if r is None:
                    lit += 1
                else:
                    key = r.split("_")[0] + "_" + (r.split("_")[1] if len(r.split("_")) > 1 else "")
                    blockers[key] = blockers.get(key, 0) + 1
            top = sorted(blockers.items(), key=lambda x: -x[1])[:2]
            line.append(f"{k}={lit}/{len(pts)}{top}")
        out.write(f"az={az} el={el}: " + "  ".join(line) + "\n")
out.close()

import bpy, sys, math
from mathutils import Vector
out = open(sys.argv[sys.argv.index("--") + 1], "w", encoding="utf-8")
def p(*a):
    out.write(" ".join(str(x) for x in a) + "\n")

sc = bpy.context.scene
dg = bpy.context.evaluated_depsgraph_get()
glass_like = set()
for o in bpy.data.objects:
    if o.type == 'MESH' and any(s.material and ("Glass" in s.material.name or "Water" in s.material.name) for s in o.material_slots):
        glass_like.add(o.name)

def classify(name):
    o = bpy.data.objects[name]
    c = o.users_collection[0].name
    if c == "Orchard":
        return "tree"
    if c in ("Dome", "10_GH_Structure", "Roof lantern"):
        return "frame"
    if c.startswith("7") or c == "WS_Roof":
        return "workshop"
    if c in ("HangingBaskets", "Fern", "Ivy", "90_Fixtures"):
        return "hanging"
    return "other:" + c

def trace(origin, d):
    o = origin.copy()
    for _ in range(12):
        hit, loc, nor, idx, ob, mat = sc.ray_cast(dg, o, d, distance=500.0)
        if not hit:
            return None
        if ob.name in glass_like:
            o = loc + d * 0.002
            continue
        return classify(ob.name)
    return None

# sample points: GH floor grid, pool water, SE beds, workshop interior
pts = {}
pts["gh_floor"] = [Vector((x, y, 0.35)) for x in [i * 0.8 - 6 for i in range(16)] for y in [j * 0.8 - 6 for j in range(16)] if x * x + y * y < 36]
pts["pool"] = [Vector((x, y, 0.34)) for x in [i * 0.4 - 2 for i in range(11)] for y in [j * 0.4 - 2 for j in range(11)] if x * x + y * y < 4]
pts["se_beds"] = [Vector((x, y, 0.5)) for x in [3 + i * 0.4 for i in range(8)] for y in [-6 + j * 0.4 for j in range(8)] if 16 < x * x + y * y < 40]
pts["ws_floor"] = [Vector((x, y, 0.9)) for x in [-15 + i * 0.6 for i in range(14)] for y in [-3.5 + j * 0.6 for j in range(12)]]

for el in (16, 20, 22, 24, 26, 28, 32):
    for az in (295, 300, 305, 310, 315, 320, 325, 330):
        a = math.radians(az); e = math.radians(el)
        d = Vector((math.sin(a) * math.cos(e), math.cos(a) * math.cos(e), math.sin(e)))
        res = []
        for k, plist in pts.items():
            cnt = {}
            for pt in plist:
                r = trace(pt, d)
                key = r if r else "sun"
                cnt[key] = cnt.get(key, 0) + 1
            n = len(plist)
            s = cnt.get("sun", 0) / n
            tr = cnt.get("tree", 0) / n
            fr = cnt.get("frame", 0) / n
            res.append(f"{k}: sun={s:.2f} tree={tr:.2f} frame={fr:.2f}")
        p(f"az={az} el={el} | " + " | ".join(res))
out.close()

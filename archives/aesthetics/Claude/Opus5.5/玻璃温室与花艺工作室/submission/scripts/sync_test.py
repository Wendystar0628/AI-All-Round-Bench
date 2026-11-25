"""Session-only: remove one feature to find what forces a full per-frame re-sync."""
import bpy
import sys
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
opts = dict(a.split("=", 1) for a in argv if "=" in a)
what = opts.get("remove", "none")
sc = bpy.context.scene
if what in ("petals", "all"):
    for o in list(bpy.data.objects):
        if o.name.startswith("FX_Petal"):
            bpy.data.objects.remove(o)
if what in ("linking", "all"):
    o = bpy.data.objects.get("LGT_PoolCaustics")
    if o:
        o.light_linking.receiver_collection = None
if what in ("dust", "all"):
    for o in list(bpy.data.objects):
        if o.name.startswith("FX_Dust"):
            bpy.data.objects.remove(o)
if what in ("flicker", "all"):
    for o in bpy.data.objects:
        if o.type == 'LIGHT' and o.data.animation_data:
            o.data.animation_data_clear()
if what in ("timeanim", "all"):
    g = bpy.data.node_groups.get("GH_Time")
    if g and g.animation_data:
        g.animation_data_clear()
print("SYNC_TEST removed", what)

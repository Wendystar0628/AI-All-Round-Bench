import bpy, sys, os, collections, math
from mathutils import Vector

out_path = sys.argv[sys.argv.index("--") + 1]
f = open(out_path, "w", encoding="utf-8")
def p(*a):
    f.write(" ".join(str(x) for x in a) + "\n")

sc = bpy.context.scene
p("VERSION", bpy.app.version_string)
p("SCENE", sc.name, "engine", sc.render.engine, "res", sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage)
p("FPS", sc.render.fps, sc.render.fps_base, "range", sc.frame_start, sc.frame_end, "cur", sc.frame_current, "camera", sc.camera.name if sc.camera else None)
p("VIEW", sc.view_settings.view_transform, sc.view_settings.look, sc.view_settings.exposure, sc.view_settings.gamma, sc.display_settings.display_device)
p("WORLD", sc.world.name if sc.world else None)
p("UNITS", sc.unit_settings.system, sc.unit_settings.scale_length)
p("SCENES", [s.name for s in bpy.data.scenes])
p("TEXTS", [t.name for t in bpy.data.texts])
p("NODEGROUPS", [g.name for g in bpy.data.node_groups])
p("IMAGES", [i.name for i in bpy.data.images])
p("LIGHTS", [l.name for l in bpy.data.lights])
p("ACTIONS", len(bpy.data.actions))

p("\nMARKERS")
for m in sorted(sc.timeline_markers, key=lambda m: m.frame):
    p(" ", m.name, m.frame, m.camera.name if m.camera else None)

def coll_tree(c, depth=0):
    p("  " * depth + f"{c.name}  objs={len(c.objects)} hide_render={c.hide_render}")
    for ch in c.children:
        coll_tree(ch, depth + 1)
p("\nCOLLECTIONS")
coll_tree(sc.collection)

def lc_tree(lc, depth=0):
    p("  " * depth + f"{lc.name} exclude={lc.exclude} hide_viewport={lc.hide_viewport}")
    for ch in lc.children:
        lc_tree(ch, depth + 1)
p("\nLAYER COLLECTIONS")
lc_tree(bpy.context.view_layer.layer_collection)

p("\nCAMERAS")
for ob in bpy.data.objects:
    if ob.type != 'CAMERA':
        continue
    cd = ob.data
    anim = ob.animation_data
    act = anim.action if anim else None
    keys = []
    if act:
        try:
            fcs = act.fcurves
        except AttributeError:
            fcs = []
            for layer in act.layers:
                for strip in layer.strips:
                    for cb in strip.channelbags:
                        fcs.extend(cb.fcurves)
        for fc in fcs:
            keys.append((fc.data_path, fc.array_index, [round(k.co[0], 1) for k in fc.keyframe_points][:12], len(fc.keyframe_points)))
    p(" ", ob.name, "coll", [c.name for c in ob.users_collection], "data", cd.name, "lens", round(cd.lens, 2), "sensor", cd.sensor_width, cd.sensor_fit,
      "clip", cd.clip_start, cd.clip_end, "dof", cd.dof.use_dof, cd.dof.focus_distance, cd.dof.aperture_fstop, cd.dof.focus_object)
    p("     loc", tuple(round(v, 3) for v in ob.location), "rot", tuple(round(math.degrees(v), 2) for v in ob.rotation_euler), ob.rotation_mode, "parent", ob.parent.name if ob.parent else None,
      "constraints", [c.type for c in ob.constraints])
    p("     action", act.name if act else None, "data_anim", bool(cd.animation_data))
    for k in keys:
        p("       ", k)

p("\nCAMERA WORLD POS AT SHOT START/MID/END")
mk = sorted(sc.timeline_markers, key=lambda m: m.frame)
for i, m in enumerate(mk):
    end = mk[i + 1].frame - 1 if i + 1 < len(mk) else sc.frame_end
    cam = m.camera
    for fr in (m.frame, (m.frame + end) // 2, end):
        sc.frame_set(fr)
        mw = cam.matrix_world
        fwd = mw.to_3x3() @ Vector((0, 0, -1))
        p(f"  {m.name} f{fr} {cam.name} pos=({mw.translation.x:.2f},{mw.translation.y:.2f},{mw.translation.z:.2f}) fwd=({fwd.x:.2f},{fwd.y:.2f},{fwd.z:.2f}) lens={cam.data.lens:.1f}")
sc.frame_set(1)
for ob in bpy.data.objects:
    if ob.type == 'CAMERA' and not ob.name.startswith("TOUR"):
        mw = ob.matrix_world
        fwd = mw.to_3x3() @ Vector((0, 0, -1))
        p(f"  {ob.name} pos=({mw.translation.x:.2f},{mw.translation.y:.2f},{mw.translation.z:.2f}) fwd=({fwd.x:.2f},{fwd.y:.2f},{fwd.z:.2f}) lens={ob.data.lens:.1f}")

p("\nEMITTERS")
for ob in bpy.data.objects:
    if ob.name.endswith("_Emitter"):
        bb = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
        mn = Vector((min(v.x for v in bb), min(v.y for v in bb), min(v.z for v in bb)))
        mx = Vector((max(v.x for v in bb), max(v.y for v in bb), max(v.z for v in bb)))
        p(" ", ob.name, "coll", [c.name for c in ob.users_collection], "min", tuple(round(v, 2) for v in mn), "max", tuple(round(v, 2) for v in mx),
          "mats", [s.material.name if s.material else None for s in ob.material_slots], "parent", ob.parent.name if ob.parent else None, "tris", len(ob.data.polygons) if ob.type == 'MESH' else None)

p("\nMATERIAL USERS")
mu = collections.Counter()
for ob in bpy.data.objects:
    for s in ob.material_slots:
        if s.material:
            mu[s.material.name] += 1
for m in bpy.data.materials:
    p(" ", m.name, "objs", mu[m.name], "users", m.users, "nodes", m.use_nodes, [n.type for n in m.node_tree.nodes] if m.node_tree else None)

p("\nOBJECT TYPES", collections.Counter(o.type for o in bpy.data.objects))
p("MESH DATA", len(bpy.data.meshes))
p("MODIFIERS", collections.Counter(md.type for o in bpy.data.objects for md in o.modifiers))
p("INSTANCED (shared mesh) objects", sum(1 for o in bpy.data.objects if o.type == 'MESH' and o.data.users > 1))
p("HIDDEN render objs", [o.name for o in bpy.data.objects if o.hide_render][:30])
p("PARENTED objs", sum(1 for o in bpy.data.objects if o.parent))
p("ANIMATED objs", [o.name for o in bpy.data.objects if o.animation_data and o.animation_data.action][:40])

p("\nPER COLLECTION NAME PREFIXES")
for c in bpy.data.collections:
    pref = collections.Counter()
    for o in c.objects:
        parts = o.name.split("_")
        pref["_".join(parts[:2])] += 1
    p(" ", c.name, len(c.objects), pref.most_common(25))

f.close()

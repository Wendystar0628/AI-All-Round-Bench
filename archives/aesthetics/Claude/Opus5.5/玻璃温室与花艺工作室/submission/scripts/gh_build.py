"""Build greenhouse_final.blend from greenhouse_whitebox.blend.

Usage:
  blender -b greenhouse_whitebox.blend --python scripts/gh_build.py -- <output.blend>
Geometry, object transforms, TOUR/STILLS cameras, markers, frame range and fps are left untouched.
"""
import bpy
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import gh_nodes, gh_materials, gh_world, gh_fx, gh_render, gh_assign  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
out_path = argv[0] if argv else os.path.join(os.path.dirname(HERE), "greenhouse_final.blend")

t0 = time.time()
sc = bpy.context.scene
frame_range = (sc.frame_start, sc.frame_end, sc.render.fps, sc.render.fps_base)
markers = [(m.name, m.frame, m.camera.name if m.camera else None) for m in sc.timeline_markers]

# ---------------------------------------------------------------- materials
gh_assign.build_all_materials()
stats = gh_assign.assign_all()
print("ASSIGN", stats)

# ---------------------------------------------------------------- collections for additions
root = bpy.data.collections.get("FX_Lookdev") or bpy.data.collections.new("FX_Lookdev")
if root.name not in [c.name for c in sc.collection.children]:
    sc.collection.children.link(root)
c_light = gh_fx.get_coll("FX_Lighting", root)
c_atmo = gh_fx.get_coll("FX_Atmosphere", root)
c_anim = gh_fx.get_coll("FX_Motion", root)
c_focus = gh_fx.get_coll("FX_Focus", root)

# ---------------------------------------------------------------- light
gh_world.build_world_full()
gh_world.build_sun(c_light)
gh_world.build_practicals(c_light)
gh_world.build_studio_daylight(c_light)

# ---------------------------------------------------------------- depth of field (before FX volumes so focus rays hit real geometry)
gh_fx.build_dof(c_focus)

# ---------------------------------------------------------------- atmosphere & motion
gh_fx.build_fog(c_atmo)
gh_fx.build_dust(c_atmo)
gh_fx.build_steam(c_anim)
gh_fx.build_petals(c_anim)
gh_fx.build_cloud_shadows(c_atmo)
gh_fx.build_pool_caustics(c_light)

# ---------------------------------------------------------------- render, colour, compositor
gh_render.setup_all()

# ---------------------------------------------------------------- integrity: nothing about the cameras / timing changed
sc.frame_start, sc.frame_end = frame_range[0], frame_range[1]
sc.render.fps, sc.render.fps_base = frame_range[2], frame_range[3]
assert [(m.name, m.frame, m.camera.name if m.camera else None) for m in sc.timeline_markers] == markers
sc.frame_set(1)
sc.camera = bpy.data.objects["TOUR_Cam_01"]

bpy.ops.wm.save_as_mainfile(filepath=out_path, compress=False)
print(f"BUILD OK -> {out_path} in {time.time() - t0:.1f}s")

"""Preview / timing renders.

blender -b greenhouse_final.blend --python scripts/render_preview.py -- <outdir> <pct> <samples|0> <item> [<item> ...]
item = CAMNAME@FRAME  (e.g. STILL_03@1, TOUR_Cam_05@696) or just a frame number for the tour (camera from markers)
Writes <outdir>/<cam>_<frame>.png and appends timings to <outdir>/timings.txt
"""
import bpy
import os
import sys
import time

argv = sys.argv[sys.argv.index("--") + 1:]
outdir, pct, spp = argv[0], int(argv[1]), int(argv[2])
items = argv[3:]
os.makedirs(outdir, exist_ok=True)

prefs = bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type = 'OPTIX'
prefs.get_devices()
for d in prefs.devices:
    d.use = (d.type == 'OPTIX')

sc = bpy.context.scene
sc.render.resolution_percentage = pct
if spp > 0:
    sc.cycles.samples = spp
markers = sorted([(m.frame, m.camera) for m in sc.timeline_markers], key=lambda x: x[0])
for m in sc.timeline_markers:  # session only: let scene.camera decide (markers would force TOUR cams)
    m.camera = None


def cam_for_frame(f):
    cam = None
    for fr, c in markers:
        if fr <= f:
            cam = c
    return cam


log = open(os.path.join(outdir, "timings.txt"), "a", encoding="utf-8")
for it in items:
    if "@" in it:
        camn, fr = it.split("@")
        fr = int(fr)
        cam = bpy.data.objects[camn]
    else:
        fr = int(it)
        cam = cam_for_frame(fr)
        camn = cam.name
    sc.frame_set(fr)
    sc.camera = cam
    sc.render.filepath = os.path.join(outdir, f"{camn}_{fr:04d}.png")
    t0 = time.time()
    bpy.ops.render.render(write_still=True)
    dt = time.time() - t0
    log.write(f"{camn} {fr} {pct}% spp={sc.cycles.samples} {dt:.2f}s\n")
    log.flush()
    print(f"RENDERED {camn} {fr} in {dt:.2f}s")
log.close()

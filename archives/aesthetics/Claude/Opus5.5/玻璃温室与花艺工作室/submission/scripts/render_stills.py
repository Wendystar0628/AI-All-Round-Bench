"""Render the six STILL cameras in one CLI animation pass (frames 1..6 -> STILL_01..06), session only.
blender -b greenhouse_final.blend --python scripts/cli_setup.py --python scripts/render_stills.py -s 1 -e 6 -a -- out=<dir>/still_#### [pct=.. spp=..]
Only the camera changes between frames, so persistent data is reused. Time-based effects are evaluated
at t = 0..0.2 s (frame 1..6), i.e. the same instant as frame 1 for all practical purposes."""
import bpy

sc = bpy.context.scene
for m in sc.timeline_markers:
    m.camera = None
cams = {i + 1: bpy.data.objects[f"STILL_0{i + 1}"] for i in range(6)}


def pick(scene, depsgraph=None):
    cam = cams.get(scene.frame_current)
    if cam is not None and scene.camera != cam:
        scene.camera = cam


sc.camera = cams[1]
bpy.app.handlers.frame_change_pre.append(pick)
print("RENDER_STILLS ready")

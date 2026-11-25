"""A/B performance probe (session only). Frame S = warm-up, then one variant per following frame.
Variants are applied in a render_pre handler so the CLI animation path (with persistent data) is used."""
import bpy
import sys
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
opts = dict(a.split("=", 1) for a in argv if "=" in a)
S = int(opts.get("start", "2"))
variants = opts.get("variants", "base,world,cloud,glass,fog,dust,base").split(",")
sc = bpy.context.scene

# simple world
ws = bpy.data.worlds.new("W_Simple")
ws.use_nodes = True
ws.node_tree.nodes["Background"].inputs[0].default_value = (0.55, 0.5, 0.55, 1)
w_full = sc.world

# glass switch: wrap MAT_Glass_Pane output with a mix to a cheap shader
def add_switch(mat_name):
    m = bpy.data.materials[mat_name]
    nt = m.node_tree
    out = [n for n in nt.nodes if n.bl_idname == "ShaderNodeOutputMaterial"][0]
    src = out.inputs["Surface"].links[0].from_socket
    mix = nt.nodes.new("ShaderNodeMixShader")
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    nt.links.new(src, mix.inputs[1])
    nt.links.new(tr.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs["Surface"])
    mix.inputs[0].default_value = 0.0
    return mix

switches = [add_switch(n) for n in ("MAT_Glass_Pane", "MAT_Glass_Colored_Candidate", "MAT_Glass_Colored_Teal")]
objs = {k: bpy.data.objects.get(k) for k in ("FX_CloudShadowCaster", "FX_Fog_Greenhouse", "FX_Fog_Studio", "FX_Dust_Greenhouse", "FX_Dust_Studio")}


def apply(v):
    sc.world = ws if v in ("world", "all") else w_full
    for s in switches:
        s.inputs[0].default_value = 1.0 if v in ("glass", "all") else 0.0
    objs["FX_CloudShadowCaster"].hide_render = v in ("cloud", "all")
    for k in ("FX_Fog_Greenhouse", "FX_Fog_Studio"):
        objs[k].hide_render = v in ("fog", "all")
    for k in ("FX_Dust_Greenhouse", "FX_Dust_Studio"):
        objs[k].hide_render = v in ("dust", "all")
    if v == "nolights":
        for o in bpy.data.objects:
            if o.name.startswith("LGT_"):
                o.hide_render = True
    else:
        for o in bpy.data.objects:
            if o.name.startswith("LGT_"):
                o.hide_render = False


def pre(scene, depsgraph=None):
    k = scene.frame_current - S - 1
    v = variants[k] if 0 <= k < len(variants) else "base"
    apply(v)
    print(f"VARIANT frame={scene.frame_current} -> {v}", flush=True)


apply("base")
bpy.app.handlers.render_pre.append(pre)

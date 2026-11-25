"""Session-only setup for command-line renders (-f / -a): GPU prefs + optional overrides. Never saved."""
import bpy
import sys
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
opts = dict(a.split("=", 1) for a in argv if "=" in a)
prefs = bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type = 'OPTIX'
prefs.get_devices()
for d in prefs.devices:
    d.use = (d.type == 'OPTIX')
sc = bpy.context.scene
if "pct" in opts:
    sc.render.resolution_percentage = int(opts["pct"])
if "spp" in opts:
    sc.cycles.samples = int(opts["spp"])
if "thr" in opts:
    sc.cycles.adaptive_threshold = float(opts["thr"])
if "out" in opts:
    sc.render.filepath = opts["out"]
if "hide" in opts:
    for n in opts["hide"].split(","):
        ob = bpy.data.objects.get(n)
        if ob:
            ob.hide_render = True
if "still" in opts:
    for m in sc.timeline_markers:
        m.camera = None
    sc.camera = bpy.data.objects[opts["still"]]
c = sc.cycles
if "bounces" in opts:
    d, g, t, tr = (int(x) for x in opts["bounces"].split(","))
    c.diffuse_bounces, c.glossy_bounces, c.transmission_bounces, c.transparent_max_bounces = d, g, t, tr
    c.max_bounces = max(d, g, t) + 2
if "fastgi" in opts:
    c.use_fast_gi = True
    c.fast_gi_method = opts.get("fastgi_method", "REPLACE")
    c.ao_bounces_render = int(opts["fastgi"])
if "scramble" in opts:
    if opts["scramble"] == "auto":
        c.auto_scrambling_distance = True
    else:
        c.scrambling_distance = float(opts["scramble"])
if "nofog" in opts:
    for n in ("FX_Fog_Greenhouse", "FX_Fog_Studio"):
        ob = bpy.data.objects.get(n)
        if ob:
            ob.hide_render = True
if "hidelamps" in opts:
    for o in bpy.data.objects:
        if o.type == 'LIGHT' and o.name.startswith("LGT_") and o.name != "LGT_PoolCaustics":
            o.hide_render = True
if "fogg" in opts:
    m = bpy.data.materials.get("MAT_FX_Fog")
    for n in m.node_tree.nodes:
        if n.bl_idname == "ShaderNodeVolumePrincipled":
            n.inputs["Anisotropy"].default_value = float(opts["fogg"])
if "vbias" in opts:
    c.volume_biased = True
if "clampd" in opts:
    c.sample_clamp_direct = float(opts["clampd"])
if "foghomo" in opts:
    m = bpy.data.materials.get("MAT_FX_Fog")
    nt = m.node_tree
    pv = [n for n in nt.nodes if n.bl_idname == "ShaderNodeVolumePrincipled"][0]
    lp = nt.nodes.new("ShaderNodeLightPath")
    mu = nt.nodes.new("ShaderNodeMath")
    mu.operation = 'MULTIPLY'
    mu.inputs[1].default_value = float(opts["foghomo"])
    nt.links.new(lp.outputs["Is Camera Ray"], mu.inputs[0])
    nt.links.new(mu.outputs[0], pv.inputs["Density"])
if "lthr" in opts:
    c.light_sampling_threshold = float(opts["lthr"])
if "denoiser" in opts:
    c.denoiser = opts["denoiser"]
if "dq" in opts:
    c.denoising_quality = opts["dq"]
print("CLI_SETUP", opts)

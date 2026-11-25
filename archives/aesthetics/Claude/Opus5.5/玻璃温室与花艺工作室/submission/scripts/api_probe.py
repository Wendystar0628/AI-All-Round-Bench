import bpy, sys
out = open(sys.argv[sys.argv.index("--") + 1], "w", encoding="utf-8")
def p(*a):
    out.write(" ".join(str(x) for x in a) + "\n")

sc = bpy.context.scene
p("CYCLES PROPS")
for prop in sc.cycles.bl_rna.properties:
    if prop.identifier in ("rna_type",):
        continue
    try:
        v = getattr(sc.cycles, prop.identifier)
    except Exception as e:
        v = "ERR"
    extra = ""
    if prop.type == 'ENUM':
        extra = [i.identifier for i in prop.enum_items]
    p(" ", prop.identifier, repr(v)[:60], extra)

p("\nVIEW SETTINGS")
for prop in sc.view_settings.bl_rna.properties:
    try:
        v = getattr(sc.view_settings, prop.identifier)
    except Exception:
        v = "ERR"
    extra = [i.identifier for i in prop.enum_items] if prop.type == 'ENUM' else ""
    p(" ", prop.identifier, repr(v)[:80], extra)

p("\nSCENE attrs with 'compos' or 'node'")
for a in dir(sc):
    if "compos" in a.lower() or "node" in a.lower():
        p(" ", a)
p("\nRENDER attrs")
for prop in sc.render.bl_rna.properties:
    if any(k in prop.identifier for k in ("persistent", "compos", "film", "motion", "threads", "use_", "hair", "dither", "file", "image")):
        try:
            p(" ", prop.identifier, repr(getattr(sc.render, prop.identifier))[:60])
        except Exception:
            pass

p("\nCOMPOSITOR NODE TYPES")
names = sorted(n for n in dir(bpy.types) if n.startswith("CompositorNode"))
p(" ", names)
p("\nSHADER NODE TYPES")
p(" ", sorted(n for n in dir(bpy.types) if n.startswith("ShaderNode")))
p("\nGEO NODE TYPES (count)", len([n for n in dir(bpy.types) if n.startswith("GeometryNode")]))
p(" ", sorted(n for n in dir(bpy.types) if n.startswith("GeometryNode")))

# sky node
w = bpy.data.worlds.new("probe")
w.use_nodes = True
sky = w.node_tree.nodes.new("ShaderNodeTexSky")
for prop in sky.bl_rna.properties:
    if prop.type == 'ENUM':
        p("SKY ENUM", prop.identifier, [i.identifier for i in prop.enum_items])
    elif prop.identifier not in ("rna_type",):
        try:
            p("SKY", prop.identifier, repr(getattr(sky, prop.identifier))[:60])
        except Exception:
            pass
p("SKY inputs", [i.name for i in sky.inputs])

# principled
m = bpy.data.materials.new("probe")
m.use_nodes = True
pb = m.node_tree.nodes.get("Principled BSDF")
p("PRINCIPLED inputs", [(i.name, i.type) for i in pb.inputs])
for prop in pb.bl_rna.properties:
    if prop.type == 'ENUM':
        p("PRINC ENUM", prop.identifier, [i.identifier for i in prop.enum_items])
p("MATERIAL props", [pp.identifier for pp in m.bl_rna.properties])
p("MATERIAL cycles", [pp.identifier for pp in m.cycles.bl_rna.properties])
vol = m.node_tree.nodes.new("ShaderNodeVolumePrincipled")
p("VOLPRINC inputs", [i.name for i in vol.inputs])
for t in ("ShaderNodeBsdfTranslucent", "ShaderNodeBsdfGlass", "ShaderNodeBsdfGlossy", "ShaderNodeBsdfHair", "ShaderNodeBsdfSheen", "ShaderNodeVolumeScatter", "ShaderNodeVolumeCoefficients", "ShaderNodeTexNoise", "ShaderNodeTexVoronoi", "ShaderNodeTexWave", "ShaderNodeTexBrick", "ShaderNodeTexGabor", "ShaderNodeBump", "ShaderNodeMix", "ShaderNodeMapRange", "ShaderNodeAttribute", "ShaderNodeObjectInfo", "ShaderNodeNewGeometry", "ShaderNodeLightPath", "ShaderNodeTexCoord", "ShaderNodeBlackbody", "ShaderNodeEmission", "ShaderNodeHueSaturation", "ShaderNodeBsdfMetallic", "ShaderNodeRaycast"):
    try:
        n = m.node_tree.nodes.new(t)
        props = {}
        for prop in n.bl_rna.properties:
            if prop.type == 'ENUM' and prop.identifier not in ("location",):
                props[prop.identifier] = [i.identifier for i in prop.enum_items]
        p(t, "IN", [i.name for i in n.inputs], "OUT", [o.name for o in n.outputs], props)
    except Exception as e:
        p(t, "ERR", e)

p("\nOBJECT visibility props", [pp.identifier for pp in bpy.types.Object.bl_rna.properties if "visib" in pp.identifier or "shadow" in pp.identifier or "light" in pp.identifier.lower()])
ld = bpy.data.lights.new("probe", 'POINT')
p("LIGHT props", [pp.identifier for pp in ld.bl_rna.properties])
p("LIGHT cycles", [pp.identifier for pp in ld.cycles.bl_rna.properties] if hasattr(ld, "cycles") else None)
sd = bpy.data.lights.new("probesun", 'SUN')
p("SUN props", [pp.identifier for pp in sd.bl_rna.properties])

# preferences devices
prefs = bpy.context.preferences.addons['cycles'].preferences
p("COMPUTE", prefs.compute_device_type, [i.identifier for i in prefs.bl_rna.properties['compute_device_type'].enum_items])
try:
    prefs.compute_device_type = 'OPTIX'
    prefs.get_devices()
    for d in prefs.devices:
        p("  DEV", d.name, d.type, d.use)
except Exception as e:
    p("DEV ERR", e)

# eevee
p("\nEEVEE PROPS", [pp.identifier for pp in sc.eevee.bl_rna.properties][:200])
out.close()

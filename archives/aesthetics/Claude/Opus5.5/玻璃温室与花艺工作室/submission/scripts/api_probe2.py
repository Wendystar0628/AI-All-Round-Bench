import bpy, sys
out = open(sys.argv[sys.argv.index("--") + 1], "w", encoding="utf-8")
def p(*a):
    out.write(" ".join(str(x) for x in a) + "\n")

m = bpy.data.materials.new("probe")
nt = m.node_tree
for t, setup in (("ShaderNodeMix", lambda n: setattr(n, "data_type", "RGBA")), ("ShaderNodeMix", lambda n: setattr(n, "data_type", "FLOAT")),
                 ("ShaderNodeMapRange", None), ("ShaderNodeMath", None), ("ShaderNodeVectorMath", None), ("ShaderNodeBsdfPrincipled", None),
                 ("ShaderNodeValToRGB", None), ("ShaderNodeSeparateXYZ", None), ("ShaderNodeTexGradient", None), ("ShaderNodeLayerWeight", None),
                 ("ShaderNodeMapping", None), ("ShaderNodeTexWhiteNoise", None), ("ShaderNodeOutputMaterial", None), ("ShaderNodeVolumeAbsorption", None)):
    n = nt.nodes.new(t)
    if setup:
        setup(n)
    p(t, getattr(n, "data_type", ""), "IN:", [(i.identifier, i.name, i.type, i.enabled) for i in n.inputs if i.enabled])
    p("   OUT:", [(o.identifier, o.name, o.type) for o in n.outputs if o.enabled])

sc = bpy.context.scene
p("compositing_node_group default:", sc.compositing_node_group)
p("render.use_compositing", sc.render.use_compositing)
tree = bpy.data.node_groups.new("Comp", "CompositorNodeTree")
p("comp tree nodes initially:", [n.bl_idname for n in tree.nodes])
p("interface items:", [i.name for i in tree.interface.items_tree])
ok = []
bad = []
for t in sorted(n for n in dir(bpy.types) if n.startswith("ShaderNode") or n.startswith("CompositorNode") or n.startswith("NodeGroup") or n in ("NodeReroute", "NodeFrame")):
    try:
        n = tree.nodes.new(t)
        ok.append(t)
        tree.nodes.remove(n)
    except Exception as e:
        bad.append(t)
p("COMP OK:", ok)
# details of some compositor nodes
for t in ("CompositorNodeGlare", "CompositorNodeColorBalance", "CompositorNodeEllipseMask", "CompositorNodeLensdist", "CompositorNodeRLayers", "CompositorNodeImageCoordinates",
          "CompositorNodeSceneTime", "CompositorNodeColorCorrection", "CompositorNodeExposure", "CompositorNodeCurveRGB", "CompositorNodeHueSat", "CompositorNodeBlur",
          "CompositorNodeImageInfo", "CompositorNodeRelativeToPixel", "CompositorNodeTonemap", "CompositorNodeHueCorrect", "CompositorNodeViewer"):
    try:
        n = tree.nodes.new(t)
        props = {}
        for prop in n.bl_rna.properties:
            if prop.identifier in ("rna_type", "name", "label", "location", "location_absolute", "width", "height", "dimensions", "inputs", "outputs", "internal_links",
                                   "parent", "select", "show_options", "show_preview", "hide", "mute", "show_texture", "bl_idname", "bl_label", "bl_description", "bl_icon",
                                   "bl_static_type", "bl_width_default", "bl_width_min", "bl_width_max", "bl_height_default", "bl_height_min", "bl_height_max", "type",
                                   "use_custom_color", "color", "color_tag", "warning_propagation"):
                continue
            try:
                v = getattr(n, prop.identifier)
                if prop.type == 'ENUM':
                    props[prop.identifier] = (v, [i.identifier for i in prop.enum_items])
                else:
                    props[prop.identifier] = repr(v)[:40]
            except Exception:
                pass
        p(t, "IN:", [(i.identifier, i.name, i.type) for i in n.inputs], "OUT:", [(o.identifier, o.name) for o in n.outputs], "PROPS:", props)
    except Exception as e:
        p(t, "ERR", e)
# group output
try:
    tree.interface.new_socket(name="Image", in_out='OUTPUT', socket_type='NodeSocketColor')
    go = tree.nodes.new("NodeGroupOutput")
    p("GroupOutput inputs:", [(i.identifier, i.name) for i in go.inputs])
except Exception as e:
    p("GROUP OUTPUT ERR", e)

# AgX looks
vs = sc.view_settings
for vt in ("AgX", "Filmic", "Khronos PBR Neutral"):
    try:
        vs.view_transform = vt
        p("LOOKS for", vt, [i.identifier for i in vs.bl_rna.properties['look'].enum_items])
    except Exception as e:
        p("VT ERR", vt, e)
p("VIEW TRANSFORMS", [i.identifier for i in vs.bl_rna.properties['view_transform'].enum_items])

# light linking API
ob = bpy.data.objects.new("probe_ob", None)
p("light_linking props", [pp.identifier for pp in ob.light_linking.bl_rna.properties])
coll = bpy.data.collections.new("probe_coll")
p("collection props with link", [pp.identifier for pp in coll.bl_rna.properties if "light" in pp.identifier or "link" in pp.identifier])
try:
    p("collection_objects props", [pp.identifier for pp in bpy.types.CollectionLightLinking.bl_rna.properties])
except Exception as e:
    p("no CollectionLightLinking", e)
ld = bpy.data.lights.new("pl", 'POINT')
p("point light props", [(pp.identifier, repr(getattr(ld, pp.identifier))[:30]) for pp in ld.bl_rna.properties if pp.identifier not in ("rna_type",)])
w = bpy.data.worlds.new("pw")
p("world props", [pp.identifier for pp in w.bl_rna.properties])
p("world cycles", [pp.identifier for pp in w.cycles.bl_rna.properties])
p("world light settings", [pp.identifier for pp in w.light_settings.bl_rna.properties])
p("object cycles", [pp.identifier for pp in ob.bl_rna.properties if 'cycles' in pp.identifier])
cam = bpy.data.cameras.new("pc")
p("cam dof props", [pp.identifier for pp in cam.dof.bl_rna.properties])
p("render image settings", [pp.identifier for pp in sc.render.image_settings.bl_rna.properties])
out.close()

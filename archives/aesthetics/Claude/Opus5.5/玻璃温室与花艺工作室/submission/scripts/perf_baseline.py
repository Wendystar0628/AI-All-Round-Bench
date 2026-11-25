import bpy, math, sys
from mathutils import Vector, Euler

argv = sys.argv[sys.argv.index("--") + 1:]
outdir = argv[0]
samples = int(argv[1]) if len(argv) > 1 else 64
use_vol = (argv[2] == "vol") if len(argv) > 2 else True

sc = bpy.context.scene
prefs = bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type = 'OPTIX'
prefs.get_devices()
for d in prefs.devices:
    d.use = (d.type == 'OPTIX')

sc.render.engine = 'CYCLES'
c = sc.cycles
c.device = 'GPU'
c.samples = samples
c.use_adaptive_sampling = True
c.adaptive_threshold = 0.05
c.use_denoising = True
c.denoiser = 'OPENIMAGEDENOISE'
c.denoising_use_gpu = True
c.max_bounces = 8
c.diffuse_bounces = 3
c.glossy_bounces = 3
c.transmission_bounces = 8
c.transparent_max_bounces = 16
c.volume_bounces = 0
c.caustics_reflective = False
c.caustics_refractive = False
c.sample_clamp_indirect = 8.0
sc.render.use_persistent_data = True
sc.render.resolution_x = 1920
sc.render.resolution_y = 1080
sc.render.resolution_percentage = 100
sc.render.image_settings.file_format = 'JPEG'

# world
w = bpy.data.worlds.new("W")
sc.world = w
w.use_nodes = True
nt = w.node_tree
sky = nt.nodes.new("ShaderNodeTexSky")
sky.sky_type = 'MULTIPLE_SCATTERING'
sky.sun_elevation = math.radians(24)
sky.sun_rotation = math.radians(315)
bg = nt.nodes["Background"]
nt.links.new(sky.outputs[0], bg.inputs[0])
bg.inputs[1].default_value = 0.15

# sun
ld = bpy.data.lights.new("Sun", 'SUN')
ld.energy = 4.0
ld.angle = math.radians(0.6)
ld.color = (1.0, 0.72, 0.45)
so = bpy.data.objects.new("Sun", ld)
sc.collection.objects.link(so)
az = math.radians(315)
el = math.radians(24)
d = Vector((math.sin(az) * math.cos(el), math.cos(az) * math.cos(el), math.sin(el)))  # toward sun
so.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()

# glass panes thin
g = bpy.data.materials["MAT_Glass_Pane"]
g.node_tree.nodes.clear()
n = g.node_tree.nodes
o = n.new("ShaderNodeOutputMaterial")
tr = n.new("ShaderNodeBsdfTransparent"); tr.inputs[0].default_value = (0.92, 0.96, 0.93, 1)
gl = n.new("ShaderNodeBsdfGlossy"); gl.inputs["Roughness"].default_value = 0.02
fr = n.new("ShaderNodeFresnel"); fr.inputs[0].default_value = 1.5
mx = n.new("ShaderNodeMixShader")
g.node_tree.links.new(fr.outputs[0], mx.inputs[0])
g.node_tree.links.new(tr.outputs[0], mx.inputs[1])
g.node_tree.links.new(gl.outputs[0], mx.inputs[2])
g.node_tree.links.new(mx.outputs[0], o.inputs[0])

for mname in ("MAT_Glass_Vessel", "MAT_Lamp_Shade_Glass", "MAT_Water"):
    m = bpy.data.materials[mname]
    pb = m.node_tree.nodes.get("Principled BSDF")
    pb.inputs["Transmission Weight"].default_value = 1.0
    pb.inputs["Roughness"].default_value = 0.05

em = bpy.data.materials["MAT_Emitter_Candidate"]
pb = em.node_tree.nodes.get("Principled BSDF")
pb.inputs["Emission Color"].default_value = (1.0, 0.6, 0.3, 1)
pb.inputs["Emission Strength"].default_value = 30.0

for mname in ("MAT_Leaf_Fern", "MAT_Leaf_Ivy", "MAT_Leaf_Broad", "MAT_Leaf_Palm", "MAT_Leaf_Orchid", "MAT_Hedge", "MAT_Lawn"):
    m = bpy.data.materials[mname]
    pb = m.node_tree.nodes.get("Principled BSDF")
    pb.inputs["Base Color"].default_value = (0.08, 0.2, 0.05, 1)
    pb.inputs["Transmission Weight"].default_value = 0.0
    pb.inputs["Subsurface Weight"].default_value = 0.0

if use_vol:
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=6.7, depth=10.5, location=(0, 0, 5.25))
    vol = bpy.context.active_object
    vol.name = "FogTest"
    vm = bpy.data.materials.new("FogTestMat")
    vm.use_nodes = True
    vm.node_tree.nodes.clear()
    vo = vm.node_tree.nodes.new("ShaderNodeOutputMaterial")
    pv = vm.node_tree.nodes.new("ShaderNodeVolumePrincipled")
    pv.inputs["Density"].default_value = 0.02
    pv.inputs["Anisotropy"].default_value = 0.5
    vm.node_tree.links.new(pv.outputs[0], vo.inputs["Volume"])
    vol.data.materials.append(vm)

sc.render.filepath = outdir + "/base_####"

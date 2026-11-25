"""Render settings, colour management and the compositor grade."""
import bpy
from gh_nodes import NB, hexc

H = hexc

RENDER = dict(samples=40, threshold=0.04, min_samples=0)
GRADE = dict(exposure=0.1, look="AgX - Medium High Contrast", wb_temp=6300.0, wb_tint=8.0,
             haze=0.30, bloom_threshold=1.0, bloom_strength=0.22, bloom_size=0.55,
             vignette=0.30, grain=0.018, saturation=1.06)


def setup_render(scene=None):
    sc = scene or bpy.context.scene
    sc.render.engine = 'CYCLES'
    c = sc.cycles
    c.device = 'GPU'
    c.samples = RENDER["samples"]
    c.use_adaptive_sampling = True
    c.adaptive_threshold = RENDER["threshold"]
    c.adaptive_min_samples = RENDER["min_samples"]
    c.time_limit = 0.0
    c.use_denoising = True
    try:
        c.denoiser = 'OPENIMAGEDENOISE'
    except Exception:
        pass
    c.denoising_use_gpu = True
    c.denoising_input_passes = 'RGB_ALBEDO_NORMAL'
    c.denoising_prefilter = 'ACCURATE'
    c.denoising_quality = 'HIGH'
    c.use_light_tree = True
    c.light_sampling_threshold = 0.01
    c.max_bounces = 8
    c.diffuse_bounces = 2
    c.glossy_bounces = 2
    c.transmission_bounces = 6
    c.volume_bounces = 0
    c.volume_biased = True          # ray-marched volumes: no speckle in the sunlit haze at tour sample counts
    c.transparent_max_bounces = 16
    c.use_fast_gi = True
    c.fast_gi_method = 'REPLACE'
    c.ao_bounces_render = 1
    c.caustics_reflective = False
    c.caustics_refractive = False
    c.blur_glossy = 1.0
    c.sample_clamp_direct = 0.0
    c.sample_clamp_indirect = 6.0
    c.use_animated_seed = True
    c.seed = 7
    c.pixel_filter_type = 'BLACKMAN_HARRIS'
    c.filter_width = 1.5
    c.use_auto_tile = True
    c.tile_size = 2048
    sc.render.use_persistent_data = True
    sc.render.resolution_x = 1920
    sc.render.resolution_y = 1080
    sc.render.resolution_percentage = 100
    sc.render.pixel_aspect_x = 1.0
    sc.render.pixel_aspect_y = 1.0
    sc.render.use_motion_blur = False
    sc.render.use_compositing = True
    sc.render.use_sequencer = False
    sc.render.film_transparent = False
    sc.render.dither_intensity = 1.0
    try:
        sc.render.compositor_device = 'GPU'
    except Exception:
        pass
    ims = sc.render.image_settings
    ims.file_format = 'PNG'
    ims.color_mode = 'RGB'
    ims.color_depth = '8'
    ims.compression = 15
    sc.render.filepath = "//render/frame_####"
    vl = sc.view_layers[0]
    vl.use_pass_mist = True
    vl.pass_alpha_threshold = 0.5


def setup_color(scene=None):
    sc = scene or bpy.context.scene
    vs = sc.view_settings
    sc.display_settings.display_device = 'sRGB'
    vs.view_transform = 'AgX'
    for lk in (GRADE["look"], "AgX - Punchy", "Medium High Contrast", "None"):
        try:
            vs.look = lk
            break
        except Exception:
            continue
    vs.exposure = GRADE["exposure"]
    vs.gamma = 1.0
    vs.use_white_balance = True
    vs.white_balance_temperature = GRADE["wb_temp"]
    vs.white_balance_tint = GRADE["wb_tint"]
    vs.use_curve_mapping = False


def _menu(node, key, candidates):
    sock = node.inputs.get(key)
    if sock is None:
        return
    for c in candidates:
        try:
            sock.default_value = c
            return
        except Exception:
            continue


def setup_compositor(scene=None):
    sc = scene or bpy.context.scene
    name = "GH_Compositor"
    old = bpy.data.node_groups.get(name)
    if old:
        bpy.data.node_groups.remove(old)
    tree = bpy.data.node_groups.new(name, "CompositorNodeTree")
    tree.interface.new_socket(name="Image", in_out='OUTPUT', socket_type='NodeSocketColor')
    sc.compositing_node_group = tree
    nb = NB(tree)
    rl = nb.new("CompositorNodeRLayers")
    rl.scene = sc
    img = rl.outputs["Image"]
    mist = rl.outputs["Mist"]

    # 1) aerial perspective (skip the sky: mist == 1)
    bg = nb.maprange(mist, 0.985, 0.999, 0.0, 1.0)
    hz = nb.mul(nb.mul(nb.pow(mist, 1.15), GRADE["haze"]), nb.inv(bg))
    img = nb.mix(hz, img, H('#C9B2AA'))

    # 2) bloom
    gl = nb.new("CompositorNodeGlare")
    nb.set(gl, "Image", img)
    _menu(gl, "Type", ['Bloom', 'BLOOM'])
    _menu(gl, "Quality", ['High', 'HIGH'])
    nb.set(gl, "Highlights Threshold", GRADE["bloom_threshold"])
    nb.set(gl, "Highlights Smoothness", 0.35)
    nb.set(gl, "Strength", GRADE["bloom_strength"])
    nb.set(gl, "Size", GRADE["bloom_size"])
    nb.set(gl, "Saturation", 1.0)
    img = gl.outputs["Image"]

    # 3) grade: cool lift, warm gain (split tone)
    cb = nb.new("CompositorNodeColorBalance")
    nb.set(cb, "Image", img)
    _menu(cb, "Type", ['Lift/Gamma/Gain', 'LIFT_GAMMA_GAIN'])
    nb.set(cb, "Color Lift", (0.985, 0.99, 1.03, 1.0))
    nb.set(cb, "Color Gamma", (1.0, 1.0, 1.0, 1.0))
    nb.set(cb, "Color Gain", (1.03, 1.0, 0.96, 1.0))
    nb.set(cb, "Fac", 1.0)
    img = cb.outputs["Image"]
    hs = nb.new("CompositorNodeHueSat")
    nb.set(hs, "Image", img)
    nb.set(hs, "Saturation", GRADE["saturation"])
    img = hs.outputs["Image"]

    # 4) vignette
    ic = nb.new("CompositorNodeImageCoordinates")
    nb.set(ic, "Image", img)
    uni = ic.outputs["Uniform"]
    d = nb.vmath('LENGTH', nb.vmath('MULTIPLY', uni, (1.0, 1.0, 0.0)))
    vig = nb.sub(1.0, nb.mul(nb.smooth(d, 0.55, 1.25), GRADE["vignette"]))
    vv = nb.new("ShaderNodeMix", data_type='RGBA', blend_type='MULTIPLY')
    nb.set(vv, "Factor_Float", 1.0)
    nb.set(vv, "A_Color", img)
    vcol = nb.combxyz(vig, vig, vig)
    tree.links.new(vcol, nb.find_input(vv, "B_Color"))
    img = nb.out(vv, "Result_Color")

    # 5) faint film grain (new pattern every frame)
    st = nb.new("CompositorNodeSceneTime")
    px = ic.outputs["Pixel"]
    pxx, pxy, _ = nb.sepxyz(px)
    gv = nb.combxyz(pxx, pxy, nb.mul(st.outputs["Frame"], 1.37))
    wn = nb.whitenoise(gv, dims='3D')
    gk = nb.mul(nb.sub(wn, 0.5), GRADE["grain"])
    gm = nb.new("ShaderNodeMix", data_type='RGBA', blend_type='MULTIPLY')
    nb.set(gm, "Factor_Float", 1.0)
    nb.set(gm, "A_Color", img)
    g1 = nb.add(1.0, gk)
    tree.links.new(nb.combxyz(g1, g1, g1), nb.find_input(gm, "B_Color"))
    img = nb.out(gm, "Result_Color")

    go = nb.new("NodeGroupOutput")
    tree.links.new(img, go.inputs[0])
    nb.layout()
    return tree


def setup_all():
    setup_render()
    setup_color()
    setup_compositor()

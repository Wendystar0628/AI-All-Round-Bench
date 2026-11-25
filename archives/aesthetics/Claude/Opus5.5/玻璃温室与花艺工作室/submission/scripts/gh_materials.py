"""All surface materials for the greenhouse & florist studio.

Every material is procedural (no image files), uses per-object randomness so a
category never looks cloned, and keeps the node count moderate so the 1080p
tour stays inside the per-frame render budget.
"""
import bpy
import math
from gh_nodes import NB, hexc, lin, fresh_material, fresh_group

H = hexc


# ============================================================== shared groups
def iter_fcurves(idblock):
    ad = idblock.animation_data
    if not ad or not ad.action:
        return []
    act = ad.action
    out = []
    try:
        out = list(act.fcurves)
    except AttributeError:
        pass
    if not out:
        try:
            for layer in act.layers:
                for strip in layer.strips:
                    for cb in strip.channelbags:
                        out.extend(cb.fcurves)
        except AttributeError:
            pass
    return out


def make_linear(idblock, extrapolate=True):
    for fc in iter_fcurves(idblock):
        for kp in fc.keyframe_points:
            kp.interpolation = 'LINEAR'
        if extrapolate:
            fc.extrapolation = 'LINEAR'


def time_group():
    """GH_Time: outputs scene time in seconds (0 at frame 1, linear, keyframed -> works without Python)."""
    g, nb = fresh_group("GH_Time")
    g.interface.new_socket(name="Seconds", in_out='OUTPUT', socket_type='NodeSocketFloat')
    v = g.nodes.new("ShaderNodeValue")
    v.name = "Seconds"
    go = g.nodes.new("NodeGroupOutput")
    g.links.new(v.outputs[0], go.inputs[0])
    v.outputs[0].default_value = 0.0
    v.outputs[0].keyframe_insert("default_value", frame=1)
    v.outputs[0].default_value = 60.0
    v.outputs[0].keyframe_insert("default_value", frame=1441)
    make_linear(g)
    v.location = (-200, 0)
    return g


TIME = None


def t_sec(nb):
    return nb.group(TIME).outputs[0]


def apply_lod(mat, base, rough=0.5, metal=0.0, trans=0.0, trans_col=None, glossy=False):
    """Ray-type level of detail. Cycles' SVM skips a Mix-Shader branch whose weight is exactly 0, so the full
    procedural network is only evaluated for camera rays (also through transparent glass) and refracted
    (transmission) rays; diffuse/glossy bounces use a constant, energy-matched stand-in."""
    nt = mat.node_tree
    nb = NB(nt)
    out = [n for n in nt.nodes if n.bl_idname == "ShaderNodeOutputMaterial"][0]
    if not out.inputs["Surface"].links:
        return
    detailed = out.inputs["Surface"].links[0].from_socket
    lp = nb.lightpath()
    fac = nb.maxf(lp.outputs["Is Camera Ray"], lp.outputs["Is Transmission Ray"])
    if glossy:
        fac = nb.maxf(fac, lp.outputs["Is Glossy Ray"])
    b = H(base) if isinstance(base, str) else base
    simple = nb.principled(base=b, rough=rough, metal=metal)
    if trans > 0:
        tc = H(trans_col) if isinstance(trans_col, str) else (trans_col or b)
        simple = nb.mixshader(trans, simple, nb.bsdf("translucent", Color=tc))
    mix = nb.mixshader(fac, simple, detailed)
    nt.links.new(mix, out.inputs["Surface"])
    nb.layout()


# ============================================================== metals
def mat_castiron_white(name="MAT_CastIron"):
    """White-painted Victorian cast iron: enamel with orange-peel, chips, rust runs, darker joints."""
    m, nb = fresh_material(name)
    geo = nb.geometry(); oi = nb.objinfo()
    pos = geo.outputs["Position"]; rnd = oi.outputs["Random"]
    paint = nb.mix(rnd, H('#ECE7DA'), H('#DCD5C3'))
    g = nb.noise(pos, scale=0.9, detail=3, rough=0.6)
    grime = nb.smooth(g, 0.42, 0.78)
    low = nb.inv(nb.smooth(nb.sepxyz(pos)[2], 0.05, 0.9))          # splash dirt near ground
    paint = nb.mix(nb.add(nb.mul(grime, 0.28), nb.mul(low, 0.35)), paint, H('#A39A86'))
    pt = geo.outputs["Pointiness"]
    crev = nb.maprange(pt, 0.5, 0.43)                                # concave joints -> darker
    paint = nb.mix(nb.mul(crev, 0.55), paint, H('#6F6655'))
    chn = nb.noise(pos, scale=26, detail=4, rough=0.65)
    chl = nb.noise(pos, scale=3.5, detail=2)
    convex = nb.maprange(pt, 0.52, 0.6)
    chips = nb.smooth(nb.add(nb.add(nb.mul(chn, 0.75), nb.mul(chl, 0.3)), nb.mul(convex, 0.12)), 0.83, 0.87)
    rustn = nb.noise(pos, scale=60, detail=3)
    rust = nb.mix(rustn, H('#3E2A1E'), H('#8A4A24'))
    sv = nb.mapping(pos, scale=(16, 16, 1.4))
    streak = nb.mul(nb.smooth(nb.noise(sv, scale=1.0, detail=3), 0.6, 0.74), nb.add(0.15, nb.mul(grime, 0.5)))
    col = nb.mix(nb.mul(streak, 0.45), paint, H('#9C6E48'))
    col = nb.mix(chips, col, rust)
    rough = nb.mixf(chips, nb.add(0.34, nb.mul(grime, 0.22)), 0.78)
    peel = nb.noise(pos, scale=220, detail=2)
    height = nb.add(nb.mul(nb.inv(chips), 1.0), nb.mul(peel, 0.04))
    normal = nb.bump(height, strength=0.35, distance=0.0006)
    s = nb.principled(base=col, rough=rough, normal=normal, spec=0.5)
    nb.output_material(s)
    nb.layout()
    return m


def mat_iron_dark(name="MAT_Iron_Dark", base=('#1D2320', '#2B2B27')):
    """Black/green painted wrought iron (lanterns, baskets, gate, bench)."""
    m, nb = fresh_material(name)
    geo = nb.geometry(); oi = nb.objinfo()
    pos = geo.outputs["Position"]; rnd = oi.outputs["Random"]
    paint = nb.mix(rnd, H(base[0]), H(base[1]))
    pt = geo.outputs["Pointiness"]
    convex = nb.maprange(pt, 0.52, 0.62)
    wn = nb.noise(pos, scale=40, detail=3)
    worn = nb.mul(convex, nb.smooth(wn, 0.45, 0.7))
    col = nb.mix(nb.mul(worn, 0.7), paint, H('#5C5145'))
    rn = nb.noise(pos, scale=8, detail=4, rough=0.6)
    rust = nb.smooth(rn, 0.68, 0.8)
    col = nb.mix(nb.mul(rust, 0.6), col, H('#5B3420'))
    rough = nb.mixf(rust, nb.mixf(worn, 0.42, 0.3), 0.85)
    normal = nb.bump(nb.noise(pos, scale=180, detail=2), strength=0.08, distance=0.001)
    s = nb.principled(base=col, rough=rough, normal=normal, metal=nb.mul(worn, 0.6))
    nb.output_material(s)
    nb.layout()
    return m


def mat_steel_tool(name="MAT_Steel_Tool"):
    """Worn forged steel for blades, tines and spades: polished edges, light rust bloom."""
    m, nb = fresh_material(name)
    geo = nb.geometry(); oi = nb.objinfo()
    pos = geo.outputs["Position"]; rnd = oi.outputs["Random"]
    sc = nb.mapping(pos, scale=(400, 30, 30))
    scratch = nb.noise(sc, scale=1.0, detail=2)
    base = nb.mix(rnd, H('#8F8D88'), H('#6E6C68'))
    rn = nb.noise(pos, scale=14, detail=5, rough=0.65)
    rust = nb.smooth(rn, 0.58, 0.72)
    col = nb.mix(rust, base, H('#6A3B22'))
    metal = nb.inv(rust)
    rough = nb.mixf(rust, nb.add(0.22, nb.mul(scratch, 0.2)), 0.8)
    s = nb.principled(base=col, metal=metal, rough=rough, normal=nb.bump(nb.add(rn, nb.mul(scratch, 0.3)), 0.15, 0.002))
    nb.output_material(s)
    nb.layout()
    return m


def mat_copper(name="MAT_Copper", verdigris=0.55, polished=0.0, wet_near_water=True):
    """Copper with verdigris pooling in recesses, wet sheen near the water, bright rubbed spots."""
    m, nb = fresh_material(name)
    geo = nb.geometry(); oi = nb.objinfo()
    pos = geo.outputs["Position"]; rnd = oi.outputs["Random"]
    x, y, z = nb.sepxyz(pos)
    copper = nb.mix(rnd, H('#C27548'), H('#A45A36'))
    tarn = nb.noise(pos, scale=7, detail=4, rough=0.6)
    copper = nb.mix(nb.mul(nb.smooth(tarn, 0.35, 0.8), 0.7), copper, H('#5E3424'))   # dark brown tarnish
    pt = geo.outputs["Pointiness"]
    crev = nb.maprange(pt, 0.5, 0.42)
    vn = nb.noise(pos, scale=18, detail=5, rough=0.7)
    drip = nb.noise(nb.mapping(pos, scale=(30, 30, 3)), scale=1.0, detail=3)
    v = nb.add(nb.mul(crev, 0.9), nb.mul(nb.smooth(vn, 0.5, 0.85), 0.6))
    v = nb.add(v, nb.mul(nb.smooth(drip, 0.55, 0.75), 0.35))
    vmask = nb.clamp01(nb.mul(nb.smooth(v, 0.35, 0.75), verdigris * 1.6))
    vcol = nb.mix(nb.noise(pos, scale=40, detail=2), H('#5FA48C'), H('#8CC5A8'))
    col = nb.mix(vmask, copper, vcol)
    metal = nb.inv(vmask)
    rough = nb.mixf(vmask, nb.add(0.28, nb.mul(tarn, 0.2)), 0.75)
    if polished > 0:
        col = nb.mix(polished, col, H('#E39A6A'))
        metal = nb.mixf(polished, metal, 1.0)
        rough = nb.mixf(polished, rough, 0.16)
    if wet_near_water:
        # surfaces close to the fountain axis / below 1.9 m are splashed: lower roughness, clear-coat sheen
        rr = nb.vmath('LENGTH', nb.combxyz(x, y, 0.0))
        wet = nb.mul(nb.inv(nb.smooth(rr, 0.75, 1.6)), nb.inv(nb.smooth(z, 1.9, 2.1)))
        wet = nb.mul(wet, nb.smooth(nb.noise(pos, scale=9, detail=2), 0.3, 0.6))
        rough = nb.mixf(wet, rough, 0.08)
        coat = nb.mul(wet, 0.9)
    else:
        coat = 0.0
    normal = nb.bump(nb.add(vn, nb.mul(vmask, 0.6)), strength=0.18, distance=0.002)
    s = nb.principled(base=col, metal=metal, rough=rough, normal=normal, coat=coat, coat_rough=0.03)
    nb.output_material(s)
    nb.layout()
    return m


def mat_brass(name="MAT_Brass"):
    m, nb = fresh_material(name)
    geo = nb.geometry(); oi = nb.objinfo()
    pos = geo.outputs["Position"]; rnd = oi.outputs["Random"]
    base = nb.mix(rnd, H('#D9A54E'), H('#C08A3A'))
    ox = nb.noise(pos, scale=22, detail=5, rough=0.65)
    oxm = nb.smooth(ox, 0.56, 0.74)
    col = nb.mix(nb.mul(oxm, 0.85), base, H('#4E3B22'))
    pt = geo.outputs["Pointiness"]
    rub = nb.maprange(pt, 0.52, 0.6)
    col = nb.mix(nb.mul(rub, 0.5), col, H('#F0C46A'))
    rough = nb.mixf(oxm, nb.add(0.18, nb.mul(nb.noise(pos, scale=90, detail=2), 0.12)), 0.6)
    s = nb.principled(base=col, metal=nb.inv(nb.mul(oxm, 0.5)), rough=rough, normal=nb.bump(ox, 0.06, 0.002))
    nb.output_material(s)
    nb.layout()
    return m


def mat_galvanized(name="MAT_Galvanized"):
    """Zinc spangle crystals + chalky water marks."""
    m, nb = fresh_material(name)
    geo = nb.geometry(); oi = nb.objinfo()
    pos = geo.outputs["Position"]; rnd = oi.outputs["Random"]
    sp = nb.voronoi_node(pos, scale=45.0)
    spc = nb.bw(sp.outputs["Color"])
    base = nb.mix(spc, H('#8E9496'), H('#B8BDBE'))
    base = nb.mix(nb.mul(rnd, 0.4), base, H('#7C8285'))
    wm = nb.noise(nb.mapping(pos, scale=(10, 10, 2.5)), scale=1.6, detail=4)
    marks = nb.smooth(wm, 0.55, 0.7)
    ring = nb.smooth(nb.noise(pos, scale=6, detail=3), 0.6, 0.66)
    chalk = nb.clamp01(nb.add(nb.mul(marks, 0.5), nb.mul(ring, 0.4)))
    col = nb.mix(chalk, base, H('#C9C6BC'))
    rough = nb.mixf(chalk, nb.add(0.22, nb.mul(spc, 0.25)), 0.7)
    metal = nb.inv(nb.mul(chalk, 0.8))
    s = nb.principled(base=col, metal=metal, rough=rough, normal=nb.bump(spc, 0.04, 0.001))
    nb.output_material(s)
    nb.layout()
    return m


# ============================================================== glass & water
def mat_glass_pane(name="MAT_Glass_Pane", tint='#EDF5EA', colored=None, haze_scale=1.0):
    """Thin glazing: one Fresnel reflection on the front face, transparent back face (no TIR black-out),
    per-pane condition (clean / condensation / whitewash), bottom-edge dust and water stains.
    Camera rays get the full detail; shadow & GI rays get a texture-free equivalent (per-pane haze class),
    so sun shafts and the coloured light spots still come through correctly but cheaply."""
    m, nb = fresh_material(name)
    tc = nb.texcoord(); geo = nb.geometry(); oi = nb.objinfo(); lp = nb.lightpath()
    pos = geo.outputs["Position"]; rnd = oi.outputs["Random"]
    front = nb.inv(geo.outputs["Backfacing"])
    fr = nb.mul(nb.layerweight(0.07).outputs["Fresnel"], front)
    # pane condition classes (cheap, shared). Victorian summer shading: the upper dome is partly whitewashed,
    # so low sun slants through the clear panes as distinct beams.
    px, py_, pz = nb.sepxyz(pos)
    import gh_world as _GW
    _sd = _GW.sun_dir()
    _sh = (_sd.x / math.hypot(_sd.x, _sd.y), _sd.y / math.hypot(_sd.x, _sd.y), 0.0)
    sunward = nb.clamp01(nb.vmath('DOT_PRODUCT', nb.vmath('NORMALIZE', nb.combxyz(px, py_, 0.0)), _sh))
    ww_thr = nb.sub(nb.maprange(pz, 2.4, 8.0, 0.97, 0.70), nb.mul(nb.mul(sunward, nb.smooth(pz, 2.3, 3.0)), 0.14))
    ww_cls = nb.math('GREATER_THAN', rnd, ww_thr)
    cond_cls = nb.mul(nb.mul(nb.smooth(rnd, 0.30, 0.32), nb.inv(nb.smooth(rnd, 0.55, 0.57))), nb.inv(ww_cls))
    class_haze = nb.mul(nb.add(nb.add(nb.mul(cond_cls, 0.12), nb.mul(ww_cls, 0.72)), 0.01), haze_scale * (0.15 if colored else 1.0))
    base_tint = H(colored[0]) if colored else H(tint)
    # ---- simple branch (shadow / diffuse / glossy rays)
    Ts = nb.bsdf("transparent", Color=base_tint)
    Rs = nb.bsdf("glossy", Color=(1, 1, 1, 1), Roughness=0.02)
    Hs_s = nb.bsdf("translucent", Color=H('#F2EEE4'))
    simple = nb.mixshader(fr, Ts, Rs)
    simple = nb.mixshader(nb.mul(class_haze, front), simple, Hs_s)
    # ---- detailed branch (camera rays)
    gz = nb.sepxyz(tc.outputs["Generated"])[2]
    bottom = nb.inv(nb.smooth(gz, 0.0, 0.8))
    fogn = nb.noise(pos, scale=2.5, detail=3)
    drops = nb.inv(nb.smooth(nb.voronoi(pos, scale=150.0), 0.06, 0.38))
    cond = nb.mul(cond_cls, nb.add(nb.mul(nb.add(0.08, nb.mul(bottom, 0.22)), nb.add(0.5, nb.mul(fogn, 0.7))), nb.mul(drops, 0.10)))
    brush = nb.noise(nb.mapping(pos, scale=(3, 3, 10)), scale=2.0, detail=3)
    ww = nb.mul(ww_cls, nb.add(0.58, nb.mul(brush, 0.28)))
    haze = nb.mul(nb.add(nb.maxf(cond, ww), 0.01), haze_scale * (0.15 if colored else 1.0))
    edge = nb.inv(nb.smooth(gz, 0.0, 0.09))
    dn = nb.noise(pos, scale=11, detail=3)
    speck = nb.smooth(nb.noise(pos, scale=55, detail=1), 0.7, 0.8)
    dirt = nb.clamp01(nb.add(nb.mul(edge, nb.add(0.2, nb.mul(dn, 0.4))), nb.mul(speck, 0.06)))
    if colored:
        streak = nb.noise(nb.mapping(pos, scale=(2, 2, 9)), scale=3.0, detail=2)
        tcol = nb.mix(nb.add(0.25, nb.mul(streak, 0.6)), H(colored[0]), H(colored[1]))
    else:
        tcol = H(tint)
    T = nb.bsdf("transparent", Color=tcol)
    R = nb.bsdf("glossy", Color=(1, 1, 1, 1), Roughness=nb.add(0.006, nb.mul(haze, 0.3)))
    Hs = nb.bsdf("translucent", Color=H('#F2EEE4'))
    D = nb.bsdf("diffuse", Color=H('#857A66'))
    s = nb.mixshader(fr, T, R)
    s = nb.mixshader(nb.mul(haze, front), s, Hs)
    s = nb.mixshader(nb.mul(nb.mul(dirt, 0.5), front), s, D)
    out = nb.mixshader(lp.outputs["Is Camera Ray"], simple, s)
    nb.output_material(out)
    nb.layout()
    m.diffuse_color = (0.8, 0.9, 0.85, 0.3)
    return m


def mat_glass_vessel(name="MAT_Glass_Vessel"):
    """Solid refracting glass (bottles, jars, cloches). Shadow rays pass as tinted transparency so the
    vessels cast light, glassy shadows instead of black ones."""
    m, nb = fresh_material(name)
    geo = nb.geometry(); oi = nb.objinfo(); lp = nb.lightpath()
    pos = geo.outputs["Position"]; rnd = oi.outputs["Random"]
    tint = nb.mix(rnd, H('#F7FBF6'), H('#E9F2E8'))
    smudge = nb.smooth(nb.noise(pos, scale=25, detail=4), 0.55, 0.75)
    rough = nb.add(0.0, nb.mul(smudge, 0.06))
    g = nb.bsdf("glass", Color=tint, Roughness=rough, IOR=1.5)
    nz = nb.sepxyz(geo.outputs["Normal"])[2]
    dust = nb.mul(nb.smooth(nz, 0.6, 0.95), nb.mul(nb.smooth(nb.noise(pos, scale=40, detail=2), 0.5, 0.8), 0.25))
    d = nb.bsdf("diffuse", Color=H('#B9B2A3'))
    s = nb.mixshader(dust, g, d)
    t = nb.bsdf("transparent", Color=nb.mix(0.5, tint, (1, 1, 1, 1)))
    s = nb.mixshader(lp.outputs["Is Shadow Ray"], s, t)
    nb.output_material(s)
    nb.layout()
    return m


def mat_lamp_glass(name="MAT_Lamp_Shade_Glass", milk=0.65):
    """Frosted / opal lamp glass. Objects using it do not cast shadows, so the light inside passes;
    the translucent layer glows softly when the lamp is on."""
    m, nb = fresh_material(name)
    geo = nb.geometry()
    pos = geo.outputs["Position"]
    fr = nb.layerweight(0.12).outputs["Fresnel"]
    seed = nb.smooth(nb.noise(pos, scale=120, detail=2), 0.45, 0.75)
    tl = nb.bsdf("translucent", Color=H('#FFF1DC'))
    tp = nb.bsdf("transparent", Color=H('#FFF6EA'))
    body = nb.mixshader(nb.add(milk, nb.mul(seed, 0.12)), tp, tl)
    gl = nb.bsdf("glossy", Color=(1, 1, 1, 1), Roughness=0.12)
    s = nb.mixshader(fr, body, gl)
    nb.output_material(s)
    nb.layout()
    return m


def caustic_pattern(nb, pos, t, scale=7.0, speed=0.35):
    """Animated caustic network (bright thin lines) in world XY."""
    x, y, z = nb.sepxyz(pos)
    p2 = nb.combxyz(x, y, 0.0)
    warp = nb.noise(p2, scale=1.3, detail=2, dims='4D', w=nb.mul(t, 0.15), out='Color')
    pw = nb.vmath('ADD', p2, nb.vmath('SCALE', nb.vmath('SUBTRACT', warp, (0.5, 0.5, 0.5)), scale=0.35))
    e1 = nb.voronoi(pw, scale=scale, feature='DISTANCE_TO_EDGE', dims='4D', w=nb.mul(t, speed))
    e2 = nb.voronoi(pw, scale=scale * 1.73, feature='DISTANCE_TO_EDGE', dims='4D', w=nb.add(nb.mul(t, speed * 1.3), 7.0))
    l1 = nb.pow(nb.inv(nb.smooth(e1, 0.0, 0.11)), 2.0)
    l2 = nb.pow(nb.inv(nb.smooth(e2, 0.0, 0.09)), 2.0)
    return nb.clamp01(nb.add(nb.mul(l1, 0.85), nb.mul(l2, 0.45)))


def ripple_normal(nb, pos, t, base_strength=0.25, rings=None):
    """Animated small wind ripples + optional concentric rings around points (fountain jets)."""
    x, y, z = nb.sepxyz(pos)
    p2 = nb.combxyz(x, y, 0.0)
    r1 = nb.noise(p2, scale=7.0, detail=3, rough=0.55, dims='4D', w=nb.mul(t, 0.55))
    r2 = nb.noise(nb.mapping(p2, scale=(1.0, 2.2, 1.0)), scale=22.0, detail=2, dims='4D', w=nb.mul(t, 1.2))
    h = nb.add(r1, nb.mul(r2, 0.35))
    if rings:
        for (cx, cy, amp) in rings:
            d = nb.vmath('DISTANCE', p2, (cx, cy, 0.0))
            wave = nb.sin(nb.sub(nb.mul(d, 70.0), nb.mul(t, 9.0)))
            fall = nb.math('EXPONENT', nb.mul(d, -5.5))
            h = nb.add(h, nb.mul(nb.mul(wave, fall), amp))
    return nb.bump(h, strength=base_strength, distance=0.004)


POND_RINGS = [(1.42, 0.0, 0.10), (0.0, 1.42, 0.10), (-1.42, 0.0, 0.10), (0.0, -1.42, 0.10)]


def mat_water_pond(name="MAT_Water"):
    """Pool water: clear refraction, animated ripples + ring waves at the lion jets, teal depth absorption,
    and a caustic-modulated transparency for shadow rays so sunlight dances on the pool floor."""
    m, nb = fresh_material(name)
    geo = nb.geometry(); lp = nb.lightpath()
    pos = geo.outputs["Position"]
    t = t_sec(nb)
    normal = ripple_normal(nb, pos, t, base_strength=0.22, rings=POND_RINGS)
    surf = nb.principled(base=(1, 1, 1, 1), rough=0.015, ior=1.333, trans=1.0, normal=normal)
    ca = caustic_pattern(nb, pos, t, scale=6.5, speed=0.32)
    shadow_t = nb.mix(ca, H('#5E8F86'), H('#FFFFF6'))
    tsh = nb.bsdf("transparent", Color=shadow_t)
    s = nb.mixshader(lp.outputs["Is Shadow Ray"], surf, tsh)
    vol = nb.new("ShaderNodeVolumeAbsorption")
    nb.set(vol, "Color", H('#8CCFC0'))
    nb.set(vol, "Density", 2.2)
    nb.output_material(s, volume=vol)
    nb.layout()
    return m


def mat_water_basin(name="MAT_Water_Basin"):
    """Thin water sheets in the fountain basins: refracting with lively ripples (no volume)."""
    m, nb = fresh_material(name)
    geo = nb.geometry(); lp = nb.lightpath()
    pos = geo.outputs["Position"]
    t = t_sec(nb)
    x, y, z = nb.sepxyz(pos)
    p2 = nb.combxyz(x, y, 0.0)
    d = nb.vmath('LENGTH', p2)
    rings = nb.sin(nb.sub(nb.mul(d, 90.0), nb.mul(t, 11.0)))
    n1 = nb.noise(p2, scale=18.0, detail=2, dims='4D', w=nb.mul(t, 1.6))
    h = nb.add(nb.mul(rings, 0.25), n1)
    surf = nb.principled(base=(1, 1, 1, 1), rough=0.02, ior=1.333, trans=1.0, normal=nb.bump(h, 0.3, 0.003))
    tsh = nb.bsdf("transparent", Color=H('#E9F4EF'))
    s = nb.mixshader(lp.outputs["Is Shadow Ray"], surf, tsh)
    nb.output_material(s)
    nb.layout()
    return m


def mat_water_stream(name="MAT_Water_Stream"):
    """Falling jets: streaky flowing glass-like water, aerated whiter towards the impact."""
    m, nb = fresh_material(name)
    tc = nb.texcoord(); geo = nb.geometry(); lp = nb.lightpath()
    pos = geo.outputs["Position"]
    t = t_sec(nb)
    x, y, z = nb.sepxyz(pos)
    flow = nb.combxyz(nb.mul(x, 9.0), nb.mul(y, 9.0), nb.add(nb.mul(z, 2.2), nb.mul(t, 2.8)))
    st = nb.noise(flow, scale=3.0, detail=4, rough=0.6)
    fine = nb.noise(nb.combxyz(nb.mul(x, 40.0), nb.mul(y, 40.0), nb.add(nb.mul(z, 8.0), nb.mul(t, 9.0))), scale=2.0, detail=2)
    h = nb.add(st, nb.mul(fine, 0.4))
    aer = nb.mul(nb.inv(nb.smooth(z, 0.33, 0.75)), nb.smooth(fine, 0.45, 0.7))
    glass = nb.bsdf("glass", Color=H('#F3FAF8'), Roughness=nb.add(0.02, nb.mul(st, 0.06)), IOR=1.333, Normal=nb.bump(h, 0.6, 0.004))
    foam = nb.bsdf("translucent", Color=H('#F4F7F5'))
    s = nb.mixshader(nb.mul(aer, 0.55), glass, foam)
    tp = nb.bsdf("transparent", Color=H('#F2F7F5'))
    s = nb.mixshader(lp.outputs["Is Shadow Ray"], s, tp)
    nb.output_material(s)
    nb.layout()
    return m


def mat_water_splash(name="MAT_Water_Splash"):
    """Foam ring where a jet hits the surface: animated bubbly white."""
    m, nb = fresh_material(name)
    geo = nb.geometry(); lp = nb.lightpath(); oi = nb.objinfo()
    pos = geo.outputs["Position"]
    t = t_sec(nb)
    bub = nb.voronoi(pos, scale=260.0, dims='4D', w=nb.add(nb.mul(t, 2.5), nb.mul(oi.outputs["Random"], 20.0)))
    bubbles = nb.inv(nb.smooth(bub, 0.15, 0.45))
    fn = nb.noise(pos, scale=55.0, detail=3, dims='4D', w=nb.mul(t, 1.8))
    foam = nb.clamp01(nb.mul(nb.add(nb.mul(bubbles, 0.6), nb.smooth(fn, 0.45, 0.65)), 0.85))
    w = nb.principled(base=(1, 1, 1, 1), rough=0.03, ior=1.333, trans=1.0, normal=nb.bump(fn, 0.4, 0.002))
    f = nb.principled(base=H('#F5F7F6'), rough=0.35, sss=0.0)
    s = nb.mixshader(foam, w, f)
    tp = nb.bsdf("transparent", Color=(1, 1, 1, 1))
    s = nb.mixshader(lp.outputs["Is Shadow Ray"], s, tp)
    nb.output_material(s)
    nb.layout()
    return m


def mat_water_vase(name="MAT_Water_Vase"):
    m, nb = fresh_material(name)
    lp = nb.lightpath()
    g = nb.bsdf("glass", Color=H('#EEF6EE'), Roughness=0.0, IOR=1.333)
    t = nb.bsdf("transparent", Color=H('#F4F8F2'))
    s = nb.mixshader(lp.outputs["Is Shadow Ray"], g, t)
    nb.output_material(s)
    nb.layout()
    return m


# ============================================================== emitters
def mat_flame(name="MAT_Emit_Flame", strength=55.0, temp_core=1900.0, flicker=0.22, speed=7.0):
    """Candle / lantern flame: white-yellow core to orange tip, flickering intensity (per-object phase)."""
    m, nb = fresh_material(name)
    tc = nb.texcoord(); oi = nb.objinfo()
    gz = nb.sepxyz(tc.outputs["Generated"])[2]
    t = t_sec(nb)
    ph = nb.mul(oi.outputs["Random"], 100.0)
    f1 = nb.noise(None, scale=1.0, detail=2, dims='1D', w=nb.add(nb.mul(t, speed), ph))
    f2 = nb.noise(None, scale=1.0, detail=1, dims='1D', w=nb.add(nb.mul(t, speed * 3.1), ph))
    fl = nb.add(1.0, nb.mul(nb.add(nb.sub(f1, 0.5), nb.mul(nb.sub(f2, 0.5), 0.5)), flicker * 2.0))
    core = nb.inv(nb.smooth(gz, 0.15, 0.85))
    col = nb.mix(core, nb.blackbody(1350.0), nb.blackbody(temp_core + 600))
    col = nb.mix(nb.inv(nb.smooth(gz, 0.0, 0.12)), col, H('#5C7CFF'))   # thin blue base
    stren = nb.mul(nb.mul(nb.add(0.45, nb.mul(core, 0.75)), fl), strength)
    s = nb.emission(col, stren)
    nb.output_material(s)
    nb.layout()
    m.cycles.emission_sampling = 'NONE'
    return m


def mat_bulb(name="MAT_Emit_Bulb", temp=2500.0, strength=22.0, buzz=0.0):
    m, nb = fresh_material(name)
    tc = nb.texcoord()
    gz = nb.sepxyz(tc.outputs["Generated"])[2]
    hot = nb.add(0.75, nb.mul(nb.inv(nb.vmath('LENGTH', nb.vmath('SUBTRACT', tc.outputs["Generated"], (0.5, 0.5, 0.45)))), 0.4))
    col = nb.blackbody(temp)
    stren = nb.mul(hot, strength)
    if buzz > 0:
        t = t_sec(nb)
        f = nb.noise(None, scale=1.0, detail=1, dims='1D', w=nb.mul(t, 3.0))
        stren = nb.mul(stren, nb.add(1.0 - buzz * 0.5, nb.mul(f, buzz)))
    s = nb.emission(col, stren)
    nb.output_material(s)
    nb.layout()
    m.cycles.emission_sampling = 'NONE'
    return m


def mat_fire(name="MAT_Emit_Fire", strength=18.0, scale=14.0, speed=1.6):
    """Coal / log fire bed for the brazier and the stove: animated glowing embers with licking hot spots."""
    m, nb = fresh_material(name)
    geo = nb.geometry(); oi = nb.objinfo()
    pos = geo.outputs["Position"]
    t = t_sec(nb)
    w = nb.add(nb.mul(t, speed), nb.mul(oi.outputs["Random"], 50.0))
    n1 = nb.noise(pos, scale=scale, detail=4, rough=0.6, dims='4D', w=w)
    cells = nb.voronoi(pos, scale=scale * 1.8, feature='DISTANCE_TO_EDGE', dims='4D', w=nb.mul(w, 0.3))
    cracks = nb.inv(nb.smooth(cells, 0.0, 0.08))
    heat = nb.clamp01(nb.add(nb.mul(nb.smooth(n1, 0.35, 0.75), 0.8), nb.mul(cracks, 0.5)))
    col = nb.ramp(heat, [(0.0, H('#1A0703')), (0.35, H('#7A1A04')), (0.62, H('#E0520E')), (0.85, H('#FFAA38')), (1.0, H('#FFE7A8'))])
    fl = nb.add(0.85, nb.mul(nb.noise(None, scale=1.0, detail=2, dims='1D', w=nb.mul(t, 6.0)), 0.3))
    stren = nb.mul(nb.mul(nb.pow(heat, 1.6), fl), strength)
    em = nb.emission(col, stren)
    char = nb.principled(base=H('#1C1714'), rough=0.9)
    s = nb.addshader(char, em)
    nb.output_material(s)
    nb.layout()
    m.cycles.emission_sampling = 'NONE'
    return m


# ============================================================== stone, brick, ceramics
def mat_stone_flag(name="MAT_Stone_Flag"):
    """York-stone flags: per-slab tone, mottling, worn polish, damp patches (darker, glossier)."""
    m, nb = fresh_material(name)
    geo = nb.geometry(); oi = nb.objinfo()
    pos = geo.outputs["Position"]; rnd = oi.outputs["Random"]
    x, y, z = nb.sepxyz(pos)
    base = nb.ramp(rnd, [(0.0, H('#9E927F')), (0.25, H('#B2A68F')), (0.5, H('#8E8574')), (0.75, H('#A99A82')), (1.0, H('#968B7B'))])
    mot = nb.noise(pos, scale=4.0, detail=4, rough=0.6)
    base = nb.mix(nb.mul(nb.smooth(mot, 0.3, 0.8), 0.45), base, H('#7C7466'))
    grain = nb.noise(pos, scale=90.0, detail=3)
    base = nb.mix(nb.mul(grain, 0.25), base, H('#C2B8A6'))
    spk = nb.smooth(nb.noise(pos, scale=160.0, detail=1), 0.7, 0.8)
    base = nb.mix(nb.mul(spk, 0.5), base, H('#4E483F'))
    # damp: large patches + more around the pool
    dn = nb.noise(pos, scale=0.7, detail=3)
    r = nb.vmath('LENGTH', nb.combxyz(x, y, 0.0))
    nearpool = nb.inv(nb.smooth(r, 2.7, 3.6))
    damp = nb.clamp01(nb.add(nb.smooth(dn, 0.5, 0.66), nb.mul(nearpool, 0.7)))
    col = nb.mix(nb.mul(damp, 0.55), base, nb.mix(0.5, base, H('#3F3A33'), blend='MULTIPLY'))
    rough = nb.mixf(damp, nb.add(0.62, nb.mul(grain, 0.15)), 0.22)
    normal = nb.bump(nb.add(nb.mul(mot, 0.6), nb.mul(grain, 0.25)), strength=0.25, distance=0.004)
    s = nb.principled(base=col, rough=rough, normal=normal, spec=0.5)
    nb.output_material(s)
    nb.layout()
    return m


def mat_stone_coping(name="MAT_Stone_Coping"):
    """Weathered limestone; wetter and darker next to the water, lichen on outdoor pieces."""
    m, nb = fresh_material(name)
    geo = nb.geometry(); oi = nb.objinfo()
    pos = geo.outputs["Position"]; rnd = oi.outputs["Random"]
    x, y, z = nb.sepxyz(pos)
    base = nb.mix(rnd, H('#BDB3A0'), H('#A89E8B'))
    w1 = nb.noise(pos, scale=3.0, detail=5, rough=0.62)
    base = nb.mix(nb.mul(nb.smooth(w1, 0.4, 0.8), 0.5), base, H('#857B6A'))
    pits = nb.smooth(nb.voronoi(pos, scale=60.0), 0.0, 0.18)
    base = nb.mix(nb.mul(nb.inv(pits), 0.35), base, H('#6E6658'))
    # lichen (outdoors only: far from the hall centre)
    rr = nb.vmath('LENGTH', nb.combxyz(x, y, 0.0))
    outdoor = nb.smooth(rr, 9.0, 10.5)
    lich = nb.mul(outdoor, nb.smooth(nb.noise(pos, scale=9.0, detail=4), 0.58, 0.68))
    base = nb.mix(nb.mul(lich, 0.7), base, H('#B8B27A'))
    # wet near the pool: inner rim radius ~2.15-2.6 m, below 0.6 m
    nearw = nb.mul(nb.inv(nb.smooth(rr, 2.25, 2.85)), nb.inv(nb.smooth(z, 0.45, 0.7)))
    splash = nb.smooth(nb.noise(pos, scale=6.0, detail=3), 0.35, 0.6)
    wet = nb.clamp01(nb.mul(nearw, nb.add(0.55, nb.mul(splash, 0.6))))
    col = nb.mix(nb.mul(wet, 0.62), base, nb.mix(0.6, base, H('#3A372F'), blend='MULTIPLY'))
    rough = nb.mixf(wet, nb.add(0.6, nb.mul(w1, 0.2)), 0.12)
    normal = nb.bump(nb.add(nb.mul(w1, 0.5), nb.mul(pits, 0.3)), strength=0.3, distance=0.004)
    s = nb.principled(base=col, rough=rough, normal=normal, coat=nb.mul(wet, 0.6), coat_rough=0.05)
    nb.output_material(s)
    nb.layout()
    return m


def mat_stone_rough(name="MAT_Stone_Rough"):
    """Rubble / rockery / pond lining: wet and algae-tinted below the waterline."""
    m, nb = fresh_material(name)
    geo = nb.geometry(); oi = nb.objinfo()
    pos = geo.outputs["Position"]; rnd = oi.outputs["Random"]
    x, y, z = nb.sepxyz(pos)
    base = nb.mix(rnd, H('#8B8274'), H('#6F685D'))
    n1 = nb.noise(pos, scale=5.0, detail=6, rough=0.65)
    v1 = nb.voronoi(pos, scale=12.0)
    base = nb.mix(nb.mul(n1, 0.6), base, H('#A39A88'))
    base = nb.mix(nb.mul(nb.smooth(v1, 0.0, 0.25), 0.3), H('#4F4A42'), base)
    under = nb.inv(nb.smooth(z, 0.28, 0.42))
    algae = nb.mul(under, nb.smooth(nb.noise(pos, scale=7.0, detail=3), 0.35, 0.6))
    col = nb.mix(nb.mul(under, 0.55), base, nb.mix(0.55, base, H('#2F3A2A'), blend='MULTIPLY'))
    col = nb.mix(nb.mul(algae, 0.6), col, H('#3F5A2C'))
    rough = nb.mixf(under, nb.add(0.7, nb.mul(n1, 0.2)), 0.25)
    normal = nb.bump(nb.add(n1, nb.mul(v1, 0.6)), strength=0.45, distance=0.008)
    s = nb.principled(base=col, rough=rough, normal=normal)
    nb.output_material(s)
    nb.layout()
    return m


def mat_brick(name="MAT_Brick"):
    """Each brick is its own object -> per-brick colour from a Victorian red-brick palette, sand-struck
    texture, iron spots, efflorescence near the ground."""
    m, nb = fresh_material(name)
    geo = nb.geometry(); oi = nb.objinfo(); tc = nb.texcoord()
    pos = geo.outputs["Position"]; rnd = oi.outputs["Random"]
    x, y, z = nb.sepxyz(pos)
    base = nb.ramp(rnd, [(0.0, H('#7A3D2C')), (0.2, H('#9A5238')), (0.45, H('#A65E40')), (0.62, H('#8B4632')),
                         (0.8, H('#B5714F')), (0.92, H('#5E2F24')), (1.0, H('#6E3A2C'))])
    sand = nb.noise(pos, scale=55.0, detail=4, rough=0.7)
    base = nb.mix(nb.mul(sand, 0.4), base, nb.mix(0.5, base, H('#2E1A12'), blend='MULTIPLY'))
    spots = nb.smooth(nb.noise(pos, scale=140.0, detail=1), 0.7, 0.8)
    base = nb.mix(nb.mul(spots, 0.6), base, H('#3B2219'))
    fire = nb.noise(pos, scale=8.0, detail=2)
    base = nb.mix(nb.mul(nb.smooth(fire, 0.55, 0.8), 0.35), base, H('#C98760'))
    eff = nb.mul(nb.inv(nb.smooth(z, 0.05, 0.75)), nb.smooth(nb.noise(pos, scale=4.0, detail=4), 0.5, 0.7))
    col = nb.mix(nb.mul(eff, 0.55), base, H('#D8D2C4'))
    rough = nb.add(0.78, nb.mul(sand, 0.15))
    normal = nb.bump(nb.add(sand, nb.mul(spots, 0.5)), strength=0.3, distance=0.002)
    s = nb.principled(base=col, rough=rough, normal=normal)
    nb.output_material(s)
    nb.layout()
    return m


def mat_mortar(name="MAT_Mortar"):
    m, nb = fresh_material(name)
    geo = nb.geometry()
    pos = geo.outputs["Position"]
    n = nb.noise(pos, scale=70.0, detail=4)
    col = nb.mix(n, H('#BEB7A8'), H('#A39C8E'))
    s = nb.principled(base=col, rough=0.92, normal=nb.bump(n, 0.4, 0.002))
    nb.output_material(s)
    nb.layout()
    return m


def mat_plaster(name="MAT_Plaster"):
    """Limewash: trowel undulation, tea-coloured water stains from above, scuffs near the floor."""
    m, nb = fresh_material(name)
    geo = nb.geometry()
    pos = geo.outputs["Position"]
    x, y, z = nb.sepxyz(pos)
    base = H('#E3DCCB')
    tr = nb.noise(pos, scale=1.6, detail=4, rough=0.55)
    col = nb.mix(nb.mul(tr, 0.25), base, H('#CFC6B1'))
    st = nb.noise(nb.mapping(pos, scale=(3.0, 3.0, 0.7)), scale=1.5, detail=5, rough=0.6)
    top = nb.smooth(z, 2.2, 3.4)
    stain = nb.mul(nb.smooth(st, 0.55, 0.75), nb.add(0.25, nb.mul(top, 0.75)))
    col = nb.mix(nb.mul(stain, 0.45), col, H('#B39C78'))
    scuff = nb.mul(nb.inv(nb.smooth(z, 0.05, 0.45)), nb.smooth(nb.noise(pos, scale=12.0, detail=3), 0.45, 0.7))
    col = nb.mix(nb.mul(scuff, 0.5), col, H('#8A8170'))
    fine = nb.noise(pos, scale=160.0, detail=2)
    s = nb.principled(base=col, rough=0.88, normal=nb.bump(nb.add(tr, nb.mul(fine, 0.25)), 0.12, 0.004))
    nb.output_material(s)
    nb.layout()
    return m


def mat_tile_glazed(name, c1, c2, rough=0.12, coat=0.6, crackle=0.25):
    m, nb = fresh_material(name)
    geo = nb.geometry(); oi = nb.objinfo()
    pos = geo.outputs["Position"]; rnd = oi.outputs["Random"]
    col = nb.mix(rnd, H(c1), H(c2))
    wav = nb.noise(pos, scale=8.0, detail=3)
    cr = nb.smooth(nb.voronoi(pos, scale=55.0, feature='DISTANCE_TO_EDGE'), 0.012, 0.0)
    col = nb.mix(nb.mul(cr, crackle), col, H('#8A8274'))
    s = nb.principled(base=col, rough=nb.add(rough, nb.mul(wav, 0.05)), coat=coat, coat_rough=0.04,
                      normal=nb.bump(nb.add(wav, nb.mul(cr, 0.3)), 0.06, 0.002))
    nb.output_material(s)
    nb.layout()
    return m


def mat_tile_porch(name, c1, c2, worn_col):
    """Encaustic porch tiles: slight sheen, path wear down the middle of the porch."""
    m, nb = fresh_material(name)
    geo = nb.geometry(); oi = nb.objinfo()
    pos = geo.outputs["Position"]; rnd = oi.outputs["Random"]
    x, y, z = nb.sepxyz(pos)
    col = nb.mix(rnd, H(c1), H(c2))
    path = nb.inv(nb.smooth(nb.absf(x), 0.25, 1.1))
    wn = nb.noise(pos, scale=6.0, detail=4)
    wear = nb.mul(path, nb.smooth(wn, 0.3, 0.7))
    col = nb.mix(nb.mul(wear, 0.35), col, H(worn_col))
    grit = nb.noise(pos, scale=120.0, detail=2)
    rough = nb.mixf(wear, nb.add(0.3, nb.mul(grit, 0.15)), 0.18)
    s = nb.principled(base=col, rough=rough, normal=nb.bump(grit, 0.05, 0.001))
    nb.output_material(s)
    nb.layout()
    return m


def mat_roof_tile(name="MAT_Tile_Roof"):
    """Hand-made plain clay roof tiles with lichen and soot."""
    m, nb = fresh_material(name)
    geo = nb.geometry(); oi = nb.objinfo()
    pos = geo.outputs["Position"]; rnd = oi.outputs["Random"]
    base = nb.ramp(rnd, [(0.0, H('#8A4630')), (0.35, H('#A35A3C')), (0.7, H('#7A3E2C')), (1.0, H('#B06A48'))])
    n = nb.noise(pos, scale=20.0, detail=4)
    base = nb.mix(nb.mul(n, 0.35), base, H('#5A3326'))
    lich = nb.smooth(nb.noise(pos, scale=5.0, detail=5, rough=0.65), 0.6, 0.7)
    col = nb.mix(nb.mul(lich, 0.65), base, H('#9C9A6A'))
    moss = nb.smooth(nb.noise(pos, scale=2.2, detail=3), 0.66, 0.74)
    col = nb.mix(nb.mul(moss, 0.7), col, H('#4E5E2A'))
    s = nb.principled(base=col, rough=0.82, normal=nb.bump(n, 0.25, 0.003))
    nb.output_material(s)
    nb.layout()
    return m


def mat_marble(name="MAT_Marble"):
    """Polished Carrara: soft grey veining with fine secondary veins, clear polish."""
    m, nb = fresh_material(name)
    geo = nb.geometry()
    pos = geo.outputs["Position"]
    pv = nb.mapping(pos, rot=(0.3, 0.2, 0.7))
    dist = nb.noise(pv, scale=2.2, detail=6, rough=0.62, out='Color')
    pw = nb.vmath('ADD', pv, nb.vmath('SCALE', dist, scale=0.9))
    v1 = nb.wave(pw, scale=2.5, distortion=6.0, detail=4, dscale=1.5, direction='DIAGONAL')
    vein = nb.pow(nb.inv(nb.smooth(nb.absf(nb.sub(v1, 0.5)), 0.0, 0.08)), 2.5)
    v2 = nb.wave(nb.mapping(pw, scale=(2.5, 2.5, 2.5)), scale=4.0, distortion=9.0, detail=5, direction='X')
    vein2 = nb.mul(nb.inv(nb.smooth(nb.absf(nb.sub(v2, 0.5)), 0.0, 0.03)), 0.5)
    cloud = nb.noise(pos, scale=6.0, detail=4)
    base = nb.mix(nb.mul(cloud, 0.25), H('#F1EEE8'), H('#DCD9D3'))
    col = nb.mix(nb.clamp01(nb.add(nb.mul(vein, 0.75), nb.mul(vein2, 0.6))), base, H('#868A90'))
    s = nb.principled(base=col, rough=0.07, coat=0.6, coat_rough=0.02, sss=0.12, sss_radius=(0.4, 0.35, 0.3), sss_scale=0.01)
    nb.output_material(s)
    nb.layout()
    return m


def mat_terracotta(name="MAT_Terracotta"):
    """Orange-red clay, white salt bloom, darker wet base; per-pot hue."""
    m, nb = fresh_material(name)
    geo = nb.geometry(); oi = nb.objinfo(); tc = nb.texcoord()
    pos = geo.outputs["Position"]; rnd = oi.outputs["Random"]
    gz = nb.sepxyz(tc.outputs["Generated"])[2]
    base = nb.ramp(rnd, [(0.0, H('#B8643C')), (0.3, H('#C47446')), (0.55, H('#A85536')), (0.8, H('#C98457')), (1.0, H('#9E5034'))])
    g = nb.noise(pos, scale=45.0, detail=4)
    base = nb.mix(nb.mul(g, 0.3), base, H('#7E3E24'))
    salt_n = nb.noise(pos, scale=11.0, detail=5, rough=0.65)
    salt = nb.mul(nb.smooth(salt_n, 0.55, 0.72), nb.add(0.3, nb.mul(nb.smooth(gz, 0.4, 0.95), 0.7)))
    col = nb.mix(nb.mul(salt, 0.8), base, H('#E2DCCF'))
    wet = nb.mul(nb.inv(nb.smooth(gz, 0.05, 0.38)), nb.add(0.6, nb.mul(salt_n, 0.4)))
    col = nb.mix(nb.mul(wet, 0.6), col, nb.mix(0.6, col, H('#3A1E12'), blend='MULTIPLY'))
    moss = nb.mul(nb.inv(nb.smooth(gz, 0.0, 0.2)), nb.smooth(nb.noise(pos, scale=14.0, detail=3), 0.6, 0.7))
    col = nb.mix(nb.mul(moss, 0.6), col, H('#4E5A26'))
    rough = nb.mixf(wet, 0.86, 0.5)
    s = nb.principled(base=col, rough=rough, normal=nb.bump(nb.add(g, nb.mul(salt, 0.5)), 0.25, 0.002))
    nb.output_material(s)
    nb.layout()
    return m


def mat_ceramic_glazed(name="MAT_Ceramic_Glazed"):
    """Glazed urns and mugs: celadon / cream / cobalt per object; glaze pools darker in recesses."""
    m, nb = fresh_material(name)
    geo = nb.geometry(); oi = nb.objinfo()
    pos = geo.outputs["Position"]; rnd = oi.outputs["Random"]
    base = nb.ramp(rnd, [(0.0, H('#6E8E78')), (0.33, H('#6E8E78')), (0.34, H('#E5DCC6')), (0.66, H('#E5DCC6')), (0.67, H('#3A5A86')), (1.0, H('#3A5A86'))], interp='CONSTANT')
    pt = geo.outputs["Pointiness"]
    pool = nb.maprange(pt, 0.5, 0.42)
    col = nb.mix(nb.mul(pool, 0.5), base, nb.mix(0.6, base, H('#30302A'), blend='MULTIPLY'))
    edge = nb.maprange(pt, 0.52, 0.6)
    col = nb.mix(nb.mul(edge, 0.4), col, H('#EDE6D6'))
    n = nb.noise(pos, scale=30.0, detail=2)
    s = nb.principled(base=col, rough=nb.add(0.06, nb.mul(n, 0.06)), coat=0.7, coat_rough=0.03, normal=nb.bump(n, 0.03, 0.002))
    nb.output_material(s)
    nb.layout()
    return m


def mat_porcelain(name="MAT_Porcelain"):
    """Bone-white porcelain with a fine gilt rim on the top edge of each piece."""
    m, nb = fresh_material(name)
    tc = nb.texcoord(); geo = nb.geometry()
    gz = nb.sepxyz(tc.outputs["Generated"])[2]
    rim = nb.smooth(gz, 0.955, 0.975)
    base = H('#F4F1EA')
    col = nb.mix(rim, base, H('#D9AE5A'))
    s = nb.principled(base=col, metal=rim, rough=nb.mixf(rim, 0.05, 0.22), coat=nb.mixf(rim, 0.8, 0.0), coat_rough=0.02,
                      sss=nb.mixf(rim, 0.2, 0.0), sss_radius=(1.0, 0.8, 0.6), sss_scale=0.004)
    nb.output_material(s)
    nb.layout()
    return m


def mat_porcelain_plain(name="MAT_Porcelain_Sink"):
    m, nb = fresh_material(name)
    geo = nb.geometry()
    pos = geo.outputs["Position"]
    g = nb.smooth(nb.noise(pos, scale=8.0, detail=4), 0.6, 0.75)
    col = nb.mix(nb.mul(g, 0.3), H('#EFECE4'), H('#BDB4A0'))
    s = nb.principled(base=col, rough=0.1, coat=0.6, coat_rough=0.04)
    nb.output_material(s)
    nb.layout()
    return m


# ============================================================== wood
def wood_grain(nb, uvw, scale_along=1.2, scale_across=38.0):
    """Returns (grain 0..1, ring lines 0..1) for coordinates whose X runs along the board."""
    x, y, z = nb.sepxyz(uvw)
    d = nb.noise(nb.combxyz(nb.mul(x, 1.5), nb.mul(y, 12.0), nb.mul(z, 12.0)), scale=1.0, detail=3, out='Color')
    p = nb.vmath('ADD', nb.combxyz(nb.mul(x, scale_along * 0.12), nb.mul(y, 1.0), nb.mul(z, 1.0)), nb.vmath('SCALE', d, scale=0.12))
    rings = nb.wave(p, scale=scale_across, distortion=2.5, detail=3, dscale=1.2, wtype='BANDS', direction='Y', profile='SIN')
    fine = nb.noise(nb.combxyz(nb.mul(x, 2.0), nb.mul(y, 220.0), nb.mul(z, 220.0)), scale=1.0, detail=2)
    return rings, fine


def mat_wood(name, palette, rough=0.45, coat=0.0, wear=None, dust_top=0.0, uv_along_u=True, worn_path=None, painted=None):
    """Generic wood: UV-aligned grain (U runs along the member, UVs are in metres), per-member tone."""
    m, nb = fresh_material(name)
    tc = nb.texcoord(); geo = nb.geometry(); oi = nb.objinfo()
    uv = tc.outputs["UV"]; pos = geo.outputs["Position"]; rnd = oi.outputs["Random"]
    u, v, _ = nb.sepxyz(uv)
    off = nb.mul(rnd, 37.0)
    coord = nb.combxyz(nb.add(u, off), nb.add(v, nb.mul(rnd, 3.0)), nb.mul(rnd, 5.0)) if uv_along_u else nb.combxyz(nb.add(v, off), u, nb.mul(rnd, 5.0))
    rings, fine = wood_grain(nb, coord)
    stops = [(i / (len(palette) - 1), H(c)) for i, c in enumerate(palette)]
    tone = nb.ramp(rnd, stops)
    dark = nb.mix(0.55, tone, H('#2A1A10'), blend='MULTIPLY')
    col = nb.mix(nb.mul(nb.smooth(rings, 0.35, 0.95), 0.55), tone, dark)
    col = nb.mix(nb.mul(fine, 0.18), col, dark)
    knots = nb.smooth(nb.noise(pos, scale=3.0, detail=2), 0.72, 0.8)
    col = nb.mix(nb.mul(knots, 0.4), col, dark)
    r = nb.add(rough, nb.mul(rings, 0.08))
    if painted:
        pn = nb.noise(pos, scale=35.0, detail=4)
        pl = nb.noise(pos, scale=4.0, detail=2)
        pt = geo.outputs["Pointiness"]
        expose = nb.smooth(nb.add(nb.add(nb.mul(pn, 0.7), nb.mul(pl, 0.35)), nb.mul(nb.maprange(pt, 0.5, 0.6), 0.2)), 0.8, 0.86)
        pcol = nb.mix(rnd, H(painted[0]), H(painted[1]))
        pcol = nb.mix(nb.mul(fine, 0.06), pcol, H('#8F8470'))
        col = nb.mix(expose, pcol, col)
        r = nb.mixf(expose, 0.36, 0.7)
    if worn_path is not None:
        x, y, z = nb.sepxyz(pos)
        wp = worn_path(nb, x, y)
        wn = nb.noise(pos, scale=5.0, detail=3)
        wmask = nb.mul(wp, nb.smooth(wn, 0.25, 0.7))
        col = nb.mix(nb.mul(wmask, 0.45), col, H('#B08A62'))
        r = nb.mixf(wmask, r, 0.2)
    if dust_top > 0:
        nz = nb.sepxyz(geo.outputs["Normal"])[2]
        dmask = nb.mul(nb.smooth(nz, 0.6, 0.95), nb.mul(nb.smooth(nb.noise(pos, scale=8.0, detail=3), 0.35, 0.7), dust_top))
        col = nb.mix(dmask, col, H('#8C8577'))
        r = nb.mixf(dmask, r, 0.9)
    normal = nb.bump(nb.add(nb.mul(rings, 0.6), nb.mul(fine, 0.5)), strength=0.18, distance=0.0015)
    s = nb.principled(base=col, rough=r, coat=coat, coat_rough=0.12, normal=normal)
    nb.output_material(s)
    nb.layout()
    return m


def floor_traffic(nb, x, y):
    # main path from the greenhouse arch (x=-7) to the workbench, around the bench and to the sink
    p1 = nb.mul(nb.inv(nb.smooth(nb.absf(y), 0.5, 1.3)), nb.mul(nb.smooth(x, -13.6, -12.6), nb.inv(nb.smooth(x, -7.2, -6.6))))
    p2 = nb.mul(nb.inv(nb.smooth(nb.absf(nb.sub(y, 1.75)), 0.35, 0.9)), nb.mul(nb.smooth(x, -13.2, -12.5), nb.inv(nb.smooth(x, -9.6, -9.0))))
    return nb.maxf(p1, p2)


def mat_wicker(name="MAT_Wicker"):
    m, nb = fresh_material(name)
    tc = nb.texcoord(); geo = nb.geometry(); oi = nb.objinfo()
    uv = tc.outputs["UV"]; pos = geo.outputs["Position"]; rnd = oi.outputs["Random"]
    u, v, _ = nb.sepxyz(uv)
    strand = nb.noise(nb.combxyz(nb.mul(u, 300.0), nb.mul(v, 20.0), nb.mul(rnd, 9.0)), scale=1.0, detail=3)
    tone = nb.mix(rnd, H('#C2A273'), H('#9C7A4E'))
    col = nb.mix(nb.mul(strand, 0.4), tone, H('#6E5236'))
    peel = nb.smooth(nb.noise(pos, scale=60.0, detail=2), 0.7, 0.8)
    col = nb.mix(nb.mul(peel, 0.4), col, H('#D9C29A'))
    s = nb.principled(base=col, rough=nb.add(0.5, nb.mul(strand, 0.2)), sheen=0.3, sheen_tint=H('#F1E2C4'),
                      normal=nb.bump(strand, 0.35, 0.0015))
    nb.output_material(s)
    nb.layout()
    return m


# ============================================================== fabrics, paper, misc
def weave(nb, u, v, freq):
    a = nb.sin(nb.mul(u, freq))
    b = nb.sin(nb.mul(v, freq))
    return nb.add(nb.mul(nb.absf(a), 0.5), nb.mul(nb.absf(b), 0.5))


def mat_linen(name="MAT_Linen", base=('#DDD3C1', '#CFC3AE'), stripes=None, freq=1400.0, trans=0.15):
    m, nb = fresh_material(name)
    tc = nb.texcoord(); geo = nb.geometry(); oi = nb.objinfo()
    uv = tc.outputs["UV"]; pos = geo.outputs["Position"]; rnd = oi.outputs["Random"]
    u, v, _ = nb.sepxyz(uv)
    col = nb.mix(rnd, H(base[0]), H(base[1]))
    if stripes:
        # stripes = list of (center, halfwidth, hex) in UV v units (repeating every 'period')
        period, items = stripes
        vv = nb.math('FRACT', nb.div(v, period))
        for c, hw, hx in items:
            band = nb.inv(nb.smooth(nb.absf(nb.sub(vv, c)), hw, hw + 0.004))
            col = nb.mix(band, col, H(hx))
    slub = nb.noise(nb.combxyz(nb.mul(u, 6.0), nb.mul(v, 160.0), 0.0), scale=1.0, detail=2)
    col = nb.mix(nb.mul(slub, 0.15), col, H('#9E927C'))
    wv = weave(nb, u, v, freq)
    dirt = nb.smooth(nb.noise(pos, scale=5.0, detail=3), 0.55, 0.75)
    col = nb.mix(nb.mul(dirt, 0.25), col, H('#8E8270'))
    surf = nb.principled(base=col, rough=0.85, sheen=0.55, sheen_rough=0.4, sheen_tint=H('#FFF6E8'), normal=nb.bump(nb.add(wv, nb.mul(slub, 0.4)), 0.25, 0.0006))
    if trans > 0:
        tl = nb.bsdf("translucent", Color=nb.mix(0.3, col, (1, 1, 1, 1)))
        surf = nb.mixshader(trans, surf, tl)
    nb.output_material(surf)
    nb.layout()
    return m


def mat_burlap(name="MAT_Burlap"):
    m, nb = fresh_material(name)
    tc = nb.texcoord(); geo = nb.geometry()
    uv = tc.outputs["UV"]; pos = geo.outputs["Position"]
    u, v, _ = nb.sepxyz(uv)
    wv = weave(nb, u, v, 260.0)
    fib = nb.noise(pos, scale=200.0, detail=3)
    col = nb.mix(nb.mul(nb.add(nb.mul(wv, 0.5), nb.mul(fib, 0.5)), 0.6), H('#A8895E'), H('#6F5636'))
    soil = nb.mul(nb.smooth(nb.noise(pos, scale=4.0, detail=3), 0.55, 0.7), 0.6)
    col = nb.mix(soil, col, H('#4A3A28'))
    s = nb.principled(base=col, rough=0.95, sheen=0.7, sheen_rough=0.6, normal=nb.bump(nb.add(wv, nb.mul(fib, 0.6)), 0.7, 0.0015))
    nb.output_material(s)
    nb.layout()
    return m


def mat_wool_tartan(name="MAT_Wool"):
    """Soft wool picnic blanket in a muted tartan (rust / moss / cream)."""
    m, nb = fresh_material(name)
    tc = nb.texcoord(); geo = nb.geometry()
    uv = tc.outputs["UV"]; pos = geo.outputs["Position"]
    u, v, _ = nb.sepxyz(uv)
    def bands(c):
        f = nb.math('FRACT', nb.mul(c, 7.0))
        a = nb.inv(nb.smooth(nb.absf(nb.sub(f, 0.25)), 0.09, 0.1))
        b = nb.inv(nb.smooth(nb.absf(nb.sub(f, 0.7)), 0.03, 0.04))
        return a, b
    au, bu = bands(u)
    av, bv = bands(v)
    col = H('#8C3B2E')
    col = nb.mix(nb.mul(nb.maxf(au, av), 0.85), col, H('#3F5236'))
    col = nb.mix(nb.mul(nb.mul(au, av), 0.7), col, H('#2B3326'))
    col = nb.mix(nb.maxf(bu, bv), col, H('#E2D3B0'))
    fuzz = nb.noise(pos, scale=400.0, detail=2)
    s = nb.principled(base=col, rough=0.95, sheen=1.0, sheen_rough=0.55, sheen_tint=H('#FFE9D8'), normal=nb.bump(fuzz, 0.3, 0.0005))
    nb.output_material(s)
    nb.layout()
    return m


def mat_coir(name="MAT_Coir"):
    m, nb = fresh_material(name)
    geo = nb.geometry()
    pos = geo.outputs["Position"]
    fib = nb.noise(nb.mapping(pos, scale=(260, 70, 400)), scale=1.0, detail=3)
    fib2 = nb.noise(nb.mapping(pos, scale=(60, 260, 400)), scale=1.0, detail=3)
    f = nb.add(nb.mul(fib, 0.5), nb.mul(fib2, 0.5))
    col = nb.mix(f, H('#5C3E22'), H('#A47A46'))
    grime = nb.smooth(nb.noise(pos, scale=3.0, detail=3), 0.5, 0.75)
    col = nb.mix(nb.mul(grime, 0.5), col, H('#3B2C1E'))
    s = nb.principled(base=col, rough=0.95, sheen=0.5, sheen_rough=0.7, normal=nb.bump(f, 0.9, 0.002))
    nb.output_material(s)
    nb.layout()
    return m


def mat_paper(name, base, fibers=0.25, text=False, trans=0.25, rough=0.8):
    m, nb = fresh_material(name)
    tc = nb.texcoord(); geo = nb.geometry(); oi = nb.objinfo()
    uv = tc.outputs["UV"]; pos = geo.outputs["Position"]; rnd = oi.outputs["Random"]
    u, v, _ = nb.sepxyz(uv)
    col = nb.mix(nb.mul(rnd, 0.6), H(base[0]), H(base[1]))
    fib = nb.noise(nb.mapping(pos, scale=(260, 60, 260)), scale=1.0, detail=4)
    col = nb.mix(nb.mul(fib, fibers), col, nb.mix(0.5, col, H('#6B5A44'), blend='MULTIPLY'))
    fox = nb.smooth(nb.noise(pos, scale=18.0, detail=3), 0.66, 0.76)
    col = nb.mix(nb.mul(fox, 0.35), col, H('#B9935F'))
    if text:
        line = nb.math('FRACT', nb.mul(v, 95.0))
        lm = nb.mul(nb.inv(nb.smooth(nb.absf(nb.sub(line, 0.5)), 0.12, 0.2)), nb.smooth(nb.noise(nb.combxyz(nb.mul(u, 60.0), nb.mul(v, 95.0), 0.0), scale=1.0, detail=1), 0.38, 0.5))
        margin = nb.mul(nb.smooth(nb.math('FRACT', nb.mul(u, 1.0)), 0.06, 0.08), nb.inv(nb.smooth(nb.math('FRACT', nb.mul(u, 1.0)), 0.92, 0.94)))
        col = nb.mix(nb.mul(nb.mul(lm, margin), 0.55), col, H('#3A332C'))
    surf = nb.principled(base=col, rough=rough, sheen=0.2, normal=nb.bump(fib, 0.15, 0.0008))
    if trans > 0:
        surf = nb.mixshader(trans, surf, nb.bsdf("translucent", Color=col))
    nb.output_material(surf)
    nb.layout()
    return m


def mat_seed_label(name="MAT_Paper_SeedLabel"):
    """Cream printed seed labels with a coloured band (per packet)."""
    m, nb = fresh_material(name)
    tc = nb.texcoord(); oi = nb.objinfo(); geo = nb.geometry()
    gen = tc.outputs["Generated"]; rnd = oi.outputs["Random"]
    gx, gy, gz = nb.sepxyz(gen)
    band_col = nb.ramp(rnd, [(0.0, H('#8E2F2A')), (0.33, H('#3E6A3A')), (0.66, H('#2F4E7A')), (1.0, H('#C08A2A'))], interp='CONSTANT')
    band = nb.mul(nb.smooth(gz, 0.55, 0.57), nb.inv(nb.smooth(gz, 0.8, 0.82)))
    col = nb.mix(band, H('#E9DFC6'), band_col)
    ink = nb.smooth(nb.noise(nb.mapping(gen, scale=(30, 30, 30)), scale=1.0, detail=1), 0.6, 0.65)
    col = nb.mix(nb.mul(nb.mul(ink, nb.inv(band)), 0.5), col, H('#3A322A'))
    s = nb.principled(base=col, rough=0.7)
    nb.output_material(s)
    nb.layout()
    return m


def mat_ink(name="MAT_Ink"):
    m, nb = fresh_material(name)
    s = nb.principled(base=H('#2E2620'), rough=0.6)
    nb.output_material(s)
    nb.layout()
    return m


def mat_twine(name="MAT_Twine"):
    m, nb = fresh_material(name)
    tc = nb.texcoord(); geo = nb.geometry(); oi = nb.objinfo()
    uv = tc.outputs["UV"]; pos = geo.outputs["Position"]; rnd = oi.outputs["Random"]
    u, v, _ = nb.sepxyz(uv)
    twist = nb.sin(nb.mul(nb.add(nb.mul(u, 1.0), nb.mul(v, 1.0)), 900.0))
    fz = nb.noise(pos, scale=300.0, detail=2)
    col = nb.mix(rnd, H('#B39468'), H('#9A7C52'))
    col = nb.mix(nb.mul(nb.add(nb.mul(twist, 0.5), 0.5), 0.3), col, H('#6E5434'))
    s = nb.principled(base=col, rough=0.9, sheen=0.6, sheen_rough=0.6, normal=nb.bump(nb.add(twist, nb.mul(fz, 0.6)), 0.5, 0.0008))
    nb.output_material(s)
    nb.layout()
    return m


def mat_leather(name="MAT_Leather"):
    m, nb = fresh_material(name)
    geo = nb.geometry(); oi = nb.objinfo()
    pos = geo.outputs["Position"]; rnd = oi.outputs["Random"]
    col = nb.ramp(rnd, [(0.0, H('#7A4A2C')), (0.4, H('#5C2B20')), (0.7, H('#4A3526')), (1.0, H('#8C5A34'))])
    cr = nb.voronoi(pos, scale=180.0, feature='DISTANCE_TO_EDGE')
    crease = nb.noise(nb.mapping(pos, scale=(40, 120, 40)), scale=1.0, detail=4)
    worn = nb.smooth(nb.noise(pos, scale=12.0, detail=3), 0.55, 0.75)
    col = nb.mix(nb.mul(worn, 0.4), col, H('#A27A54'))
    col = nb.mix(nb.mul(nb.smooth(crease, 0.6, 0.7), 0.4), col, H('#2E1C14'))
    s = nb.principled(base=col, rough=nb.add(0.42, nb.mul(worn, 0.25)), sheen=0.15,
                      normal=nb.bump(nb.add(nb.smooth(cr, 0.0, 0.05), nb.mul(crease, 0.8)), 0.35, 0.001))
    nb.output_material(s)
    nb.layout()
    return m


def mat_rubber(name="MAT_Rubber"):
    """Wellington boots: matte green rubber with a soft sheen, mud on the soles."""
    m, nb = fresh_material(name)
    geo = nb.geometry(); tc = nb.texcoord(); oi = nb.objinfo()
    pos = geo.outputs["Position"]
    gz = nb.sepxyz(tc.outputs["Generated"])[2]
    col = nb.mix(oi.outputs["Random"], H('#2E3A29'), H('#34402C'))
    mud_n = nb.noise(pos, scale=18.0, detail=5, rough=0.6)
    mud = nb.mul(nb.inv(nb.smooth(gz, 0.08, 0.35)), nb.smooth(mud_n, 0.35, 0.6))
    col = nb.mix(mud, col, H('#4A3A2A'))
    bloom = nb.smooth(nb.noise(pos, scale=6.0, detail=2), 0.55, 0.8)
    col = nb.mix(nb.mul(bloom, 0.25), col, H('#6C705E'))
    s = nb.principled(base=col, rough=nb.mixf(mud, 0.48, 0.9), sheen=0.25, sheen_rough=0.3, normal=nb.bump(mud_n, nb.mul(mud, 0.6), 0.002))
    nb.output_material(s)
    nb.layout()
    return m


def mat_wax(name="MAT_Wax"):
    """Ivory candle wax: subsurface glow, warm light bleeding near the flame, drip streaks."""
    m, nb = fresh_material(name)
    tc = nb.texcoord(); geo = nb.geometry(); oi = nb.objinfo()
    gz = nb.sepxyz(tc.outputs["Generated"])[2]
    pos = geo.outputs["Position"]
    t = t_sec(nb)
    drip = nb.noise(nb.mapping(pos, scale=(90, 90, 8)), scale=1.0, detail=3)
    dmask = nb.mul(nb.smooth(drip, 0.58, 0.7), nb.smooth(gz, 0.3, 0.95))
    col = nb.mix(nb.mul(dmask, 0.6), H('#EFE5CF'), H('#FBF4E4'))
    glow = nb.smooth(gz, 0.72, 1.0)
    fl = nb.add(0.85, nb.mul(nb.noise(None, scale=1.0, detail=2, dims='1D', w=nb.add(nb.mul(t, 7.0), nb.mul(oi.outputs["Random"], 100.0))), 0.3))
    s = nb.principled(base=col, rough=0.35, sss=1.0, sss_radius=(1.0, 0.55, 0.3), sss_scale=0.012, sss_method='RANDOM_WALK',
                      emit=nb.blackbody(1900.0), emit_str=nb.mul(nb.mul(nb.pow(glow, 2.5), fl), 1.6),
                      normal=nb.bump(drip, nb.mul(dmask, 0.5), 0.002))
    nb.output_material(s)
    nb.layout()
    return m


# ============================================================== plants
def leaf_mat(name, palette, trans_amt=0.32, rough=0.42, spec=0.45, tip=None, tip_amt=0.0, midrib=0.0, veins=0.0,
             spots=0.0, spot_col='#6B5A2A', margin=None, zonal=None, coat=0.0, trans_boost=1.6, droplets=0.0,
             under=None, sat=1.0, gen_axis_v=True):
    """Thin leaf: Principled front + Translucent back-light, UV-based vein / tip / margin patterns."""
    m, nb = fresh_material(name)
    tc = nb.texcoord(); geo = nb.geometry(); oi = nb.objinfo()
    uv = tc.outputs["UV"]; pos = geo.outputs["Position"]; rnd = oi.outputs["Random"]
    u, v, _ = nb.sepxyz(uv)
    stops = [(i / max(1, len(palette) - 1), H(c)) for i, c in enumerate(palette)]
    base = nb.ramp(rnd, stops)
    mot = nb.noise(pos, scale=9.0, detail=3)
    base = nb.hsv(base, h=nb.add(0.485, nb.mul(mot, 0.03)), s=sat, v=nb.add(0.88, nb.mul(mot, 0.24)))
    col = base
    du = nb.absf(nb.sub(u, 0.5))
    if margin:
        mm = nb.smooth(du, margin[1], margin[1] + 0.05)
        mn = nb.noise(nb.combxyz(nb.mul(v, 12.0), nb.mul(rnd, 5.0), 0.0), scale=1.0, detail=2)
        mm = nb.smooth(nb.add(mm, nb.mul(nb.sub(mn, 0.5), 0.5)), 0.4, 0.6)
        col = nb.mix(mm, col, H(margin[0]))
    if zonal:
        rad = nb.vmath('LENGTH', nb.combxyz(nb.sub(u, 0.5), nb.sub(v, 0.5), 0.0))
        ring = nb.mul(nb.smooth(rad, zonal[1] - 0.06, zonal[1]), nb.inv(nb.smooth(rad, zonal[1] + 0.05, zonal[1] + 0.11)))
        col = nb.mix(nb.mul(ring, 0.7), col, H(zonal[0]))
    vein_h = None
    if midrib > 0:
        mr = nb.inv(nb.smooth(du, 0.004, 0.02))
        col = nb.mix(nb.mul(mr, midrib), col, nb.hsv(col, 0.5, 0.7, 1.45))
        vein_h = mr
    if veins > 0:
        sv = nb.math('FRACT', nb.add(nb.mul(v, 9.0), nb.mul(du, 7.0)))
        vl = nb.inv(nb.smooth(nb.absf(nb.sub(sv, 0.5)), 0.03, 0.08))
        col = nb.mix(nb.mul(vl, veins), col, nb.hsv(col, 0.5, 0.75, 1.3))
        vein_h = vl if vein_h is None else nb.maxf(vein_h, vl)
    if tip:
        tm = nb.mul(nb.smooth(v, 1.0 - tip_amt, 1.0), nb.smooth(rnd, 0.35, 0.6))
        tn = nb.noise(nb.combxyz(nb.mul(u, 8.0), nb.mul(v, 8.0), nb.mul(rnd, 7.0)), scale=1.0, detail=2)
        tm = nb.clamp01(nb.mul(tm, nb.add(0.6, tn)))
        col = nb.mix(tm, col, H(tip))
    if spots > 0:
        sp = nb.voronoi(nb.combxyz(nb.mul(u, 1.0), nb.mul(v, 1.0), nb.mul(rnd, 13.0)), scale=11.0)
        spm = nb.mul(nb.inv(nb.smooth(sp, 0.04, 0.09)), nb.smooth(nb.whitenoise(nb.combxyz(nb.mul(rnd, 31.0), 0.0, 0.0)), 1.0 - spots, 1.0 - spots + 0.05))
        col = nb.mix(nb.mul(spm, 0.8), col, H(spot_col))
    tcol = nb.hsv(col, 0.52, 1.25, trans_boost)
    r = rough
    if droplets > 0:
        dv = nb.voronoi(pos, scale=95.0, rand=1.0)
        dm = nb.mul(nb.inv(nb.smooth(dv, 0.05, 0.16)), nb.smooth(nb.noise(pos, scale=14.0, detail=1), 0.55, 0.62))
        r = nb.mixf(dm, rough, 0.02)
        dh = nb.mul(dm, nb.inv(nb.smooth(dv, 0.0, 0.16)))
        vein_h = dh if vein_h is None else nb.add(vein_h, nb.mul(dh, 3.0))
    bump_h = nb.add(nb.mul(mot, 0.2), vein_h if vein_h is not None else 0.0)
    normal = nb.bump(bump_h, strength=0.25, distance=0.0008)
    front = nb.principled(base=col, rough=r, spec=spec, normal=normal, coat=coat, coat_rough=0.12,
                          sheen=0.12, sheen_rough=0.3)
    if under:
        back = nb.principled(base=H(under), rough=0.6, spec=0.35, normal=normal)
        front = nb.mixshader(geo.outputs["Backfacing"], front, back)
    tl = nb.bsdf("translucent", Color=tcol)
    s = nb.mixshader(trans_amt, front, tl)
    nb.output_material(s)
    nb.layout()
    return m


def petal_mat(name, palette, by='object', grad=None, trans_amt=0.45, rough=0.5, sheen=0.35, veins=0.15, blush=None,
              world_scale=2.2, sss=0.0):
    """Thin petals: strongly translucent, with base->tip gradient, blush and fine veins."""
    m, nb = fresh_material(name)
    tc = nb.texcoord(); geo = nb.geometry(); oi = nb.objinfo()
    uv = tc.outputs["UV"]; pos = geo.outputs["Position"]; rnd = oi.outputs["Random"]
    u, v, _ = nb.sepxyz(uv)
    stops = [(i / max(1, len(palette) - 1), H(c)) for i, c in enumerate(palette)]
    if by == 'object':
        key = rnd
    elif by == 'cluster':
        cell = nb.voronoi_node(pos, scale=world_scale)
        key = nb.bw(cell.outputs["Color"])
        key = nb.maprange(key, 0.0, 1.0)
    else:  # smooth world gradient
        key = nb.noise(pos, scale=world_scale, detail=2)
        key = nb.maprange(key, 0.3, 0.7)
    col = nb.ramp(key, stops)
    if grad:
        g = nb.smooth(v, grad[1], grad[2])
        col = nb.mix(nb.mul(g, grad[3]), col, H(grad[0]))
    if blush:
        bl = nb.inv(nb.smooth(v, 0.0, blush[1]))
        col = nb.mix(nb.mul(bl, blush[2]), col, H(blush[0]))
    if veins > 0:
        vl = nb.sin(nb.mul(u, 90.0))
        vm = nb.mul(nb.smooth(vl, 0.6, 1.0), veins)
        col = nb.mix(vm, col, nb.hsv(col, 0.5, 1.2, 0.85))
    fine = nb.noise(nb.combxyz(nb.mul(u, 40.0), nb.mul(v, 6.0), nb.mul(rnd, 9.0)), scale=1.0, detail=2)
    col = nb.mix(nb.mul(fine, 0.12), col, nb.hsv(col, 0.5, 1.1, 0.88))
    tcol = nb.hsv(col, 0.5, 1.15, 1.25)
    front = nb.principled(base=col, rough=rough, sheen=sheen, sheen_rough=0.25, sheen_tint=(1, 1, 1, 1), spec=0.4,
                          sss=sss, sss_radius=(1.0, 0.4, 0.3), sss_scale=0.002,
                          normal=nb.bump(nb.add(fine, nb.sin(nb.mul(u, 90.0))), 0.05, 0.0005))
    tl = nb.bsdf("translucent", Color=tcol)
    s = nb.mixshader(trans_amt, front, tl)
    nb.output_material(s)
    nb.layout()
    return m


def mat_stem(name="MAT_Stem"):
    m, nb = fresh_material(name)
    tc = nb.texcoord(); geo = nb.geometry(); oi = nb.objinfo()
    pos = geo.outputs["Position"]; rnd = oi.outputs["Random"]
    col = nb.ramp(rnd, [(0.0, H('#4F6E2C')), (0.4, H('#5E7A34')), (0.7, H('#6B7A3A')), (0.9, H('#6E4E34')), (1.0, H('#5A6A2E'))])
    st = nb.noise(nb.mapping(pos, scale=(160, 160, 12)), scale=1.0, detail=2)
    col = nb.mix(nb.mul(st, 0.25), col, nb.hsv(col, 0.5, 0.8, 1.3))
    s = nb.principled(base=col, rough=0.5, sheen=0.1)
    s = nb.mixshader(0.2, s, nb.bsdf("translucent", Color=nb.hsv(col, 0.52, 1.2, 1.5)))
    nb.output_material(s)
    nb.layout()
    return m


def mat_bark(name="MAT_Bark", base=('#5E5246', '#4A4038')):
    m, nb = fresh_material(name)
    tc = nb.texcoord(); geo = nb.geometry(); oi = nb.objinfo()
    pos = geo.outputs["Position"]; rnd = oi.outputs["Random"]
    furrow = nb.voronoi(nb.mapping(pos, scale=(9, 9, 1.6)), scale=1.0, feature='DISTANCE_TO_EDGE')
    fn = nb.noise(nb.mapping(pos, scale=(18, 18, 3)), scale=1.0, detail=5, rough=0.6)
    col = nb.mix(rnd, H(base[0]), H(base[1]))
    col = nb.mix(nb.mul(nb.inv(nb.smooth(furrow, 0.0, 0.12)), 0.7), col, H('#2A231D'))
    lich = nb.smooth(nb.noise(pos, scale=3.5, detail=4), 0.6, 0.7)
    col = nb.mix(nb.mul(lich, 0.55), col, H('#8E9472'))
    s = nb.principled(base=col, rough=0.85, normal=nb.bump(nb.add(nb.smooth(furrow, 0.0, 0.12), nb.mul(fn, 0.5)), 0.8, 0.02))
    nb.output_material(s)
    nb.layout()
    return m


def mat_moss(name="MAT_Moss"):
    m, nb = fresh_material(name)
    geo = nb.geometry(); oi = nb.objinfo()
    pos = geo.outputs["Position"]; rnd = oi.outputs["Random"]
    f = nb.noise(pos, scale=280.0, detail=3, rough=0.7)
    c = nb.noise(pos, scale=18.0, detail=3)
    col = nb.ramp(nb.add(nb.mul(rnd, 0.5), nb.mul(c, 0.5)), [(0.0, H('#3E5A1E')), (0.5, H('#5C7A26')), (0.8, H('#7E8F32')), (1.0, H('#99993E'))])
    col = nb.mix(nb.mul(f, 0.35), col, H('#2A3A14'))
    s = nb.principled(base=col, rough=0.9, sheen=0.9, sheen_rough=0.5, sheen_tint=H('#D9F09A'), normal=nb.bump(f, 0.9, 0.003))
    s = nb.mixshader(0.15, s, nb.bsdf("translucent", Color=H('#7FA030')))
    nb.output_material(s)
    nb.layout()
    return m


def mat_hedge(name="MAT_Hedge", palette=('#3B5A28', '#4E6E2E', '#2E4A22'), scale=180.0):
    m, nb = fresh_material(name)
    geo = nb.geometry(); oi = nb.objinfo()
    pos = geo.outputs["Position"]; rnd = oi.outputs["Random"]
    big = nb.noise(pos, scale=1.2, detail=3)
    lv = nb.voronoi_node(pos, scale=scale)
    leafc = nb.bw(lv.outputs["Color"])
    col = nb.ramp(nb.add(nb.mul(big, 0.6), nb.mul(leafc, 0.4)), [(0.0, H(palette[2])), (0.5, H(palette[0])), (1.0, H(palette[1]))])
    edge = nb.smooth(lv.outputs["Distance"], 0.25, 0.45)
    col = nb.mix(nb.mul(edge, 0.45), col, H('#1C2A12'))
    s = nb.principled(base=col, rough=nb.add(0.55, nb.mul(leafc, 0.25)), spec=0.2, normal=nb.bump(nb.inv(edge), 0.6, 0.004))
    s = nb.mixshader(0.18, s, nb.bsdf("translucent", Color=H('#6E9A2E')))
    nb.output_material(s)
    nb.layout()
    return m


def mat_lawn(name="MAT_Lawn"):
    """Summer lawn: uneven greens, dry patches, mown stripes near the house, fine blade grain."""
    m, nb = fresh_material(name)
    geo = nb.geometry()
    pos = geo.outputs["Position"]
    x, y, z = nb.sepxyz(pos)
    big = nb.noise(pos, scale=0.06, detail=4, rough=0.6)
    mid = nb.noise(pos, scale=0.6, detail=3)
    col = nb.ramp(nb.add(nb.mul(big, 0.7), nb.mul(mid, 0.3)), [(0.0, H('#2F4A1A')), (0.4, H('#405F24')), (0.72, H('#52722C')), (1.0, H('#757A3A'))])
    stripes = nb.sin(nb.mul(x, 1.05))
    near = nb.inv(nb.smooth(nb.vmath('LENGTH', nb.combxyz(x, y, 0.0)), 25.0, 40.0))
    col = nb.mix(nb.mul(nb.mul(nb.smooth(stripes, -0.1, 0.1), near), 0.16), col, H('#5E7E34'))
    fine = nb.noise(pos, scale=180.0, detail=2)
    col = nb.mix(nb.mul(fine, 0.3), col, H('#2E4417'))
    clover = nb.smooth(nb.noise(pos, scale=3.0, detail=2), 0.68, 0.74)
    col = nb.mix(nb.mul(clover, 0.3), col, H('#4A6A2A'))
    s = nb.principled(base=col, rough=0.9, spec=0.05, normal=nb.bump(fine, 0.5, 0.004))
    nb.output_material(s)
    nb.layout()
    return m


def mat_lawn_distant(name="MAT_Lawn_Distant"):
    """Distant downs: patchwork of fields and hedgerows, softened by atmospheric perspective."""
    m, nb = fresh_material(name)
    geo = nb.geometry()
    pos = geo.outputs["Position"]
    x, y, z = nb.sepxyz(pos)
    p2 = nb.combxyz(x, y, 0.0)
    fw = nb.noise(p2, scale=0.012, detail=2, out='Color')
    pw = nb.vmath('ADD', p2, nb.vmath('SCALE', fw, scale=40.0))
    fields = nb.voronoi_node(pw, scale=0.022)
    fc = nb.bw(fields.outputs["Color"])
    col = nb.ramp(fc, [(0.0, H('#5E7A36')), (0.3, H('#7A8C44')), (0.55, H('#A39A5A')), (0.75, H('#6E8A3E')), (1.0, H('#8FA04E'))])
    hedge = nb.inv(nb.smooth(nb.voronoi(pw, scale=0.022, feature='DISTANCE_TO_EDGE'), 0.0, 0.035))
    col = nb.mix(nb.mul(hedge, 0.8), col, H('#2F4424'))
    trees = nb.smooth(nb.noise(p2, scale=0.12, detail=3), 0.64, 0.7)
    col = nb.mix(nb.mul(trees, 0.7), col, H('#33482A'))
    s = nb.principled(base=col, rough=0.85, spec=0.3)
    nb.output_material(s)
    nb.layout()
    return m


def mat_soil(name="MAT_Soil"):
    m, nb = fresh_material(name)
    geo = nb.geometry(); oi = nb.objinfo()
    pos = geo.outputs["Position"]; rnd = oi.outputs["Random"]
    cl = nb.voronoi(pos, scale=70.0)
    n = nb.noise(pos, scale=25.0, detail=5, rough=0.65)
    col = nb.mix(nb.add(nb.mul(n, 0.7), nb.mul(rnd, 0.3)), H('#2C1F16'), H('#4A3626'))
    perl = nb.smooth(nb.whitenoise(nb.mapping(pos, scale=(140, 140, 140))), 0.985, 0.99)
    perl = nb.mul(perl, nb.smooth(cl, 0.0, 0.25))
    col = nb.mix(perl, col, H('#D8D4C8'))
    wet = nb.smooth(nb.noise(pos, scale=4.0, detail=2), 0.5, 0.7)
    s = nb.principled(base=col, rough=nb.mixf(wet, 0.92, 0.45), normal=nb.bump(nb.add(nb.smooth(cl, 0.0, 0.3), nb.mul(n, 0.5)), 0.6, 0.004))
    nb.output_material(s)
    nb.layout()
    return m


def mat_gravel(name="MAT_Gravel"):
    m, nb = fresh_material(name)
    geo = nb.geometry()
    pos = geo.outputs["Position"]
    vn = nb.voronoi_node(pos, scale=38.0)
    vc = vn.outputs["Color"]
    vd = vn.outputs["Distance"]
    k = nb.bw(vc)
    col = nb.ramp(k, [(0.0, H('#9C9282')), (0.25, H('#B7AB94')), (0.5, H('#8A8173')), (0.7, H('#C4B9A2')), (0.85, H('#A38662')), (1.0, H('#6E675C'))])
    gap = nb.smooth(vd, 0.25, 0.55)
    col = nb.mix(nb.mul(gap, 0.65), col, H('#4E463C'))
    big = nb.noise(pos, scale=0.5, detail=3)
    col = nb.mix(nb.mul(nb.smooth(big, 0.55, 0.75), 0.25), col, H('#6E6050'))
    s = nb.principled(base=col, rough=0.7, normal=nb.bump(nb.inv(gap), 0.6, 0.006))
    nb.output_material(s)
    nb.layout()
    return m


def mat_pebble(name="MAT_Pebble"):
    """Per-pebble colour; underwater pebbles are wet: richer colour, glossy."""
    m, nb = fresh_material(name)
    geo = nb.geometry(); oi = nb.objinfo()
    pos = geo.outputs["Position"]; rnd = oi.outputs["Random"]
    x, y, z = nb.sepxyz(pos)
    col = nb.ramp(rnd, [(0.0, H('#8D8A84')), (0.2, H('#B6A688')), (0.4, H('#9A6C4C')), (0.55, H('#D8D3C8')), (0.7, H('#5A5650')),
                        (0.85, H('#A79C8A')), (1.0, H('#7B6A58'))])
    sp = nb.noise(pos, scale=120.0, detail=2)
    col = nb.mix(nb.mul(sp, 0.25), col, H('#5A544C'))
    under = nb.inv(nb.smooth(z, 0.25, 0.36))
    col = nb.mix(under, col, nb.hsv(col, 0.5, 1.35, 0.92))
    s = nb.principled(base=col, rough=nb.mixf(under, 0.55, 0.08), coat=nb.mul(under, 0.8), coat_rough=0.03, normal=nb.bump(sp, 0.12, 0.002))
    nb.output_material(s)
    nb.layout()
    return m


def mat_dust_mote(name="MAT_FX_Dust"):
    """Floating dust: only visible where it is struck by light (bright translucent specks)."""
    m, nb = fresh_material(name)
    d = nb.bsdf("diffuse", Color=H('#8A857C'))
    t = nb.bsdf("translucent", Color=H('#D8D0C0'))
    s = nb.mixshader(0.65, d, t)
    nb.output_material(s)
    nb.layout()
    return m

"""Sky, sun and practical lights."""
import bpy
import math
from mathutils import Vector
from gh_nodes import NB, hexc, fresh_group
import gh_materials as GM

H = hexc

SUN_AZ = 312.0     # degrees clockwise from north (+Y)
SUN_EL = 20.5      # degrees above horizon


def sun_dir():
    a = math.radians(SUN_AZ)
    e = math.radians(SUN_EL)
    return Vector((math.sin(a) * math.cos(e), math.cos(a) * math.cos(e), math.sin(e)))


def build_world_full():
    """Golden-hour sky: art-directed gradient (gold-orange horizon toward the sun, earth-shadow blue and a pink
    'belt of Venus' opposite, lavender-blue zenith), Mie glow, drifting sunset-lit cloud wisps and a sun disc.
    Two Background closures: lighting rays get the cheap gradient+glow, camera/glossy/refraction rays the full sky."""
    w = bpy.data.worlds.get("GH_World") or bpy.data.worlds.new("GH_World")
    bpy.context.scene.world = w
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes.clear()
    nb = NB(nt)
    sd = sun_dir()
    tc = nb.texcoord()
    d = nb.vmath('NORMALIZE', tc.outputs["Generated"])
    dx, dy, dz = nb.sepxyz(d)
    t = GM.t_sec(nb)
    lp = nb.lightpath()

    hor = nb.vmath('NORMALIZE', nb.combxyz(dx, dy, 0.0))
    sdh = Vector((sd.x, sd.y, 0)).normalized()
    az = nb.maprange(nb.vmath('DOT_PRODUCT', hor, (sdh.x, sdh.y, 0.0)), -1.0, 1.0, 0.0, 1.0)
    cosang = nb.vmath('DOT_PRODUCT', d, (sd.x, sd.y, sd.z))
    el = nb.clamp01(dz)
    elf = nb.pow(el, 0.55)

    sun_side = nb.ramp(elf, [(0.0, H('#FF9638')), (0.08, H('#FFAE52')), (0.18, H('#F7C58C')), (0.33, H('#D9B6B4')),
                             (0.52, H('#9AA0D0')), (1.0, H('#5468B0'))])
    anti_side = nb.ramp(elf, [(0.0, H('#7F84AE')), (0.1, H('#AE98B8')), (0.2, H('#D8A6AE')), (0.34, H('#B3A0C6')),
                              (0.52, H('#8592CC')), (1.0, H('#5366AE'))])
    sky = nb.mix(nb.pow(az, 1.3), anti_side, sun_side)
    below = nb.smooth(dz, 0.0, -0.06)
    sky = nb.mix(below, sky, H('#4E5040'))

    ca = nb.clamp01(cosang)
    glow = nb.add(nb.mul(nb.pow(ca, 7.0), 0.30), nb.add(nb.mul(nb.pow(ca, 120.0), 0.9), nb.mul(nb.pow(ca, 3000.0), 6.0)))

    def add_scaled(base_col, scal, col_hex):
        sc_ = nb.new("ShaderNodeVectorMath", operation='SCALE')
        nb.set(sc_, 0, H(col_hex)[:3])
        nb.set(sc_, "Scale", scal)
        ad = nb.new("ShaderNodeVectorMath", operation='ADD')
        nb.set(ad, 0, base_col)
        nt.links.new(sc_.outputs[0], ad.inputs[1])
        return ad.outputs[0]

    # ---- simple sky for lighting rays
    simple_col = add_scaled(sky, glow, '#FFBE78')
    bg_simple = nb.new("ShaderNodeBackground")
    nb.set(bg_simple, "Color", simple_col)
    nb.set(bg_simple, "Strength", 0.75)

    # ---- full sky: clouds + disc
    proj = nb.vmath('DIVIDE', nb.combxyz(dx, dy, 0.0), nb.combxyz(nb.add(dz, 0.08), nb.add(dz, 0.08), 1.0))
    wind = nb.combxyz(nb.mul(t, 0.011), nb.mul(t, 0.004), 0.0)
    cp = nb.vmath('ADD', proj, wind)
    cpm = nb.mapping(cp, rot=(0.0, 0.0, 0.5), scale=(0.75, 3.6, 1.0))
    c1 = nb.noise(cpm, scale=1.35, detail=6, rough=0.6, distortion=0.3)
    c2 = nb.noise(nb.mapping(cp, rot=(0.0, 0.0, 0.5), scale=(3.0, 10.0, 1.0)), scale=2.5, detail=3, rough=0.6)
    dens = nb.smooth(nb.add(nb.mul(c1, 0.85), nb.mul(c2, 0.28)), 0.60, 0.80)
    band = nb.mul(nb.smooth(dz, 0.015, 0.09), nb.inv(nb.smooth(dz, 0.5, 0.85)))
    dens = nb.mul(dens, band)
    lit = nb.pow(az, 2.0)
    cloud_sun = nb.mix(nb.smooth(dz, 0.03, 0.35), H('#FF8A55'), H('#FFC79A'))
    cloud_away = nb.mix(nb.smooth(dz, 0.03, 0.3), H('#E59A9E'), H('#B4A2C8'))
    ccol = nb.mix(lit, cloud_away, cloud_sun)
    ccol = nb.mix(nb.mul(nb.inv(c1), 0.35), ccol, nb.mix(0.55, ccol, H('#77708F'), blend='MULTIPLY'))
    full = nb.mix(nb.mul(dens, 0.9), sky, ccol)
    gl2 = nb.mul(glow, nb.inv(nb.mul(dens, 0.4)))
    rim = nb.mul(nb.mul(nb.pow(ca, 14.0), dens), 2.5)
    full = add_scaled(full, nb.add(gl2, rim), '#FFC07C')
    disc = nb.smooth(cosang, math.cos(math.radians(0.40)), math.cos(math.radians(0.28)))
    disc_e = nb.mul(nb.mul(disc, lp.outputs["Is Camera Ray"]), 700.0)
    full = add_scaled(full, disc_e, '#FFF0CC')
    bg_full = nb.new("ShaderNodeBackground")
    nb.set(bg_full, "Color", full)
    nb.set(bg_full, "Strength", 1.0)

    fac = nb.maxf(nb.maxf(lp.outputs["Is Camera Ray"], lp.outputs["Is Glossy Ray"]), lp.outputs["Is Transmission Ray"])
    mixw = nb.mixshader(fac, bg_simple.outputs[0], bg_full.outputs[0])
    out = nb.new("ShaderNodeOutputWorld")
    nt.links.new(mixw, out.inputs["Surface"])
    nb.layout()
    # sky light does not scatter in the haze: the mist then only glows where the sun (and lamps) cross it,
    # which is what makes the shafts legible instead of a uniform veil
    w.cycles_visibility.scatter = False
    w.cycles.sampling_method = 'MANUAL'
    w.cycles.sample_map_resolution = 512
    w.mist_settings.start = 30.0
    w.mist_settings.depth = 500.0
    w.mist_settings.falloff = 'QUADRATIC'
    return w


def add_light(name, ltype, loc, energy, temp=None, color=None, radius=0.05, rot=None, spot_size=None, blend=0.3,
              shadow=True, coll=None, angle=None):
    ld = bpy.data.lights.get(name)
    if ld is None:
        ld = bpy.data.lights.new(name, ltype)
    ld.energy = energy
    if temp is not None:
        ld.use_temperature = True
        ld.temperature = temp
        ld.color = color if color else (1, 1, 1)
    elif color is not None:
        ld.color = color
    if ltype in ('POINT', 'SPOT'):
        ld.shadow_soft_size = radius
    if ltype == 'SPOT':
        ld.spot_size = spot_size or math.radians(60)
        ld.spot_blend = blend
    if ltype == 'SUN' and angle is not None:
        ld.angle = angle
    ld.use_shadow = shadow
    ob = bpy.data.objects.get(name)
    if ob is None:
        ob = bpy.data.objects.new(name, ld)
        (coll or bpy.context.scene.collection).objects.link(ob)
    ob.location = loc
    if rot is not None:
        ob.rotation_euler = rot
    return ob


def build_sun(coll):
    sd = sun_dir()
    ob = add_light("GH_Sun", 'SUN', (0, 0, 30), 6.0, color=(1.0, 0.76, 0.50), coll=coll, angle=math.radians(0.55))
    ob.rotation_euler = sd.to_track_quat('Z', 'Y').to_euler()
    ob.data.cycles.max_bounces = 1024
    return ob


# per-emitter practical light design: (energy W, kelvin, radius, flicker)
EMITTER_LIGHTS = {
    "Lamp_DomeLantern": (20.0, 1950, 0.025, 'flame'),
    "Lamp_CabinetCandlestick": (3.5, 1850, 0.008, 'flame'),
    "Lamp_DeskLamp_Bulb": (30.0, 2700, 0.03, None),
    "Lamp_HandLantern": (8.0, 1950, 0.012, 'flame'),
    "Lamp_Pendant": (45.0, 2700, 0.05, None),
    "Lamp_PorchLantern": (26.0, 2000, 0.02, 'flame'),
    "Lamp_Sconce_Bulb": (22.0, 2650, 0.03, None),
    "Lamp_StreetLantern": (50.0, 2900, 0.05, None),
    "Lamp_TeaLantern": (24.0, 2500, 0.04, 'soft'),
    "Lamp_WalkLantern": (28.0, 2600, 0.04, 'soft'),
    "Brazier_Fire": (65.0, 1800, 0.17, 'fire'),
    "Stove_Fire": (40.0, 1700, 0.09, 'fire'),
}


def emitter_key(name):
    for k in EMITTER_LIGHTS:
        if name.startswith(k):
            return k
    return None


def add_flicker(light_ob, kind, seed):
    ld = light_ob.data
    ld.keyframe_insert("energy", frame=1)
    for fc in GM.iter_fcurves(ld):
        if fc.data_path == "energy":
            mod = fc.modifiers.new('NOISE')
            base = ld.energy
            if kind == 'flame':
                mod.scale = 2.2; mod.strength = base * 0.45; mod.phase = seed * 37.0; mod.depth = 1
            elif kind == 'fire':
                mod.scale = 3.0; mod.strength = base * 0.6; mod.phase = seed * 53.0; mod.depth = 2
            else:
                mod.scale = 6.0; mod.strength = base * 0.12; mod.phase = seed * 11.0; mod.depth = 0
            # default blend (REPLACE) keeps the noise centred on the base energy


def build_practicals(coll):
    lights = []
    i = 0
    for ob in bpy.data.objects:
        if not ob.name.endswith("_Emitter"):
            continue
        k = emitter_key(ob.name)
        if k is None:
            continue
        energy, kelvin, rad, flick = EMITTER_LIGHTS[k]
        bb = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
        c = sum(bb, Vector()) / 8.0
        if k in ("Lamp_DomeLantern", "Lamp_CabinetCandlestick", "Lamp_HandLantern", "Lamp_PorchLantern"):
            c.z += 0.006
        if k == "Stove_Fire":
            c.z += 0.02
        name = "LGT_" + ob.name.replace("_Emitter", "")
        lo = add_light(name, 'POINT', c, energy, temp=kelvin, radius=rad, coll=coll)
        lo.data.cycles.max_bounces = 4
        # soft halos in the haze without firefly-prone in-scattering
        lo.data.volume_factor = 0.15 if flick == 'fire' else 0.22
        if flick:
            add_flicker(lo, flick, i * 0.618 + 0.3)
        lights.append(lo)
        i += 1
        # emitter mesh: visible to camera / reflections only
        ob.visible_diffuse = False
        ob.visible_shadow = False
        ob.visible_volume_scatter = False
    return lights


def build_studio_daylight(coll):
    """Soft daylight from the studio's skylights (lavender sky) and windows (golden western sky).
    Fast GI shortens bounce light in this enclosed room; these area lights restore the daylight the
    openings would bring in. They are invisible to camera and reflections."""
    made = []
    groups = {
        "Skylight": ([o for o in bpy.data.objects if o.name.startswith("Glass_SkylightPane")], (0.0, 0.0, -1.0), '#C9D3F4', 55.0),
        "WestWindow": ([o for o in bpy.data.objects if o.name.startswith("Glass_Pane_WindowPane") and o.name.endswith("_West")], (1.0, 0.0, 0.0), '#FFD6A6', 60.0),
        "NorthWindow": ([o for o in bpy.data.objects if o.name.startswith("Glass_Pane_WindowPane") and o.name.endswith("_North")], (0.0, -1.0, 0.0), '#FFDDB4', 35.0),
    }
    for key, (obs, normal, col, energy) in groups.items():
        if not obs:
            continue
        pts = []
        for o in obs:
            pts += [o.matrix_world @ Vector(c) for c in o.bound_box]
        mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
        mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
        c = (mn + mx) * 0.5
        n = Vector(normal)
        nm = "LGT_Studio" + key
        ld = bpy.data.lights.get(nm) or bpy.data.lights.new(nm, 'AREA')
        ld.shape = 'RECTANGLE'
        ext = mx - mn
        if key == "Skylight":
            ld.size, ld.size_y = max(ext.x, 0.3), max(ext.y, 0.3)
        elif key == "WestWindow":
            ld.size, ld.size_y = max(ext.y, 0.3), max(ext.z, 0.3)
        else:
            ld.size, ld.size_y = max(ext.x, 0.3), max(ext.z, 0.3)
        ld.energy = energy
        ld.color = H(col)[:3]
        ld.spread = math.radians(120)
        ld.volume_factor = 0.0
        ob = bpy.data.objects.get(nm) or bpy.data.objects.new(nm, ld)
        if ob.name not in coll.objects:
            coll.objects.link(ob)
        ob.location = c + n * 0.12
        ob.rotation_euler = n.to_track_quat('-Z', 'Y').to_euler()
        ob.visible_camera = False
        ob.visible_glossy = False
        ob.visible_transmission = False
        made.append(ob)
    return made

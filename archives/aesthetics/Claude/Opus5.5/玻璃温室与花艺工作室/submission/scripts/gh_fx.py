"""Atmosphere & motion: fog volumes, dust motes, steam, falling petals, cloud shadows, pool caustics."""
import bpy
import bmesh
import math
import random
from mathutils import Vector, Matrix, Euler
from gh_nodes import NB, hexc, fresh_material, fresh_group
import gh_materials as GM
import gh_world as GW

H = hexc


def get_coll(name, parent=None):
    c = bpy.data.collections.get(name)
    if c is None:
        c = bpy.data.collections.new(name)
        (parent or bpy.context.scene.collection).children.link(c)
    return c


def new_mesh_object(name, bm, coll):
    me = bpy.data.meshes.get(name)
    if me is None:
        me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.get(name)
    if ob is None:
        ob = bpy.data.objects.new(name, me)
        coll.objects.link(ob)
    else:
        ob.data = me
    return ob


def only_camera_visibility(ob, shadow=False, transmission=True, glossy=False):
    ob.visible_camera = True
    ob.visible_diffuse = False
    ob.visible_glossy = glossy
    ob.visible_transmission = transmission
    ob.visible_volume_scatter = False
    ob.visible_shadow = shadow


# ------------------------------------------------------------------ fog
def lathe(profile, segs=32):
    bm = bmesh.new()
    rings = []
    for (r, z) in profile:
        ring = []
        if r < 1e-4:
            ring = [bm.verts.new((0, 0, z))]
        else:
            for i in range(segs):
                a = 2 * math.pi * i / segs
                ring.append(bm.verts.new((r * math.cos(a), r * math.sin(a), z)))
        rings.append(ring)
    for a, b in zip(rings[:-1], rings[1:]):
        if len(a) == 1 and len(b) > 1:
            for i in range(segs):
                bm.faces.new((a[0], b[i], b[(i + 1) % segs]))
        elif len(b) == 1 and len(a) > 1:
            for i in range(segs):
                bm.faces.new((a[i], b[0], a[(i + 1) % segs]))
        else:
            for i in range(segs):
                bm.faces.new((a[i], a[(i + 1) % segs], b[(i + 1) % segs], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def mat_fog(name, density, color='#FFF6EA', aniso=0.55, beams=0.0):
    m, nb = fresh_material(name)
    pv = nb.new("ShaderNodeVolumePrincipled")
    nb.set(pv, "Color", H(color))
    nb.set(pv, "Anisotropy", aniso)
    # Only camera rays scatter in the haze: the visible shafts are unchanged, but bounce/shadow rays skip
    # the volume entirely (the fog is optically thin, so their contribution is negligible and very costly).
    lp = nb.lightpath()
    dens = density
    if beams > 0:
        # mist drifting in loose sheets aligned with the sunlight: projecting the position onto the plane
        # perpendicular to the sun makes the density constant along the light direction -> legible shafts.
        sd = GW.sun_dir()
        geo = nb.geometry()
        pos = geo.outputs["Position"]
        t = GM.t_sec(nb)
        along = nb.vmath('DOT_PRODUCT', pos, (sd.x, sd.y, sd.z))
        perp = nb.vmath('SUBTRACT', pos, nb.vmath('SCALE', (sd.x, sd.y, sd.z), scale=along))
        drift = nb.vmath('ADD', perp, nb.combxyz(nb.mul(t, 0.03), nb.mul(t, -0.02), nb.mul(t, 0.012)))
        n = nb.noise(drift, scale=0.85, detail=2, rough=0.45)
        sheet = nb.smooth(n, 0.47, 0.62)
        height = nb.add(0.22, nb.mul(nb.smooth(nb.sepxyz(pos)[2], 1.0, 3.6), 0.78))
        dens = nb.mul(nb.mul(nb.add(1.0 - beams, nb.mul(sheet, beams * 2.4)), height), density)
    nb.set(pv, "Density", nb.mul(lp.outputs["Is Camera Ray"], dens))
    nb.output_material(volume=pv)
    nb.layout()
    return m


def build_fog(coll):
    prof = [(0.0, 0.03), (6.5, 0.03), (6.5, 4.45)]
    for i in range(1, 13):
        f = i / 12.0
        z = 4.45 + f * (10.3 - 4.45)
        r = 6.45 * math.sqrt(max(0.0, 1.0 - f * f))
        prof.append((r, z))
    prof[-1] = (0.0, 10.3)
    ob = new_mesh_object("FX_Fog_Greenhouse", lathe(prof, 40), coll)
    fog = mat_fog("MAT_FX_Fog", 0.05, '#F6F4F0', 0.7, beams=0.85)
    ob.data.materials.clear()
    ob.data.materials.append(fog)
    ob.visible_shadow = False
    # studio haze
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x = -11.4 + v.co.x * 8.5
        v.co.y = v.co.y * 7.5
        v.co.z = 1.55 + v.co.z * 3.0
    ws = new_mesh_object("FX_Fog_Studio", bm, coll)
    wf = mat_fog("MAT_FX_Haze_Studio", 0.012, '#F4F1EC', 0.5)
    ws.data.materials.clear()
    ws.data.materials.append(wf)
    ws.visible_shadow = False
    return ob, ws


# ------------------------------------------------------------------ dust motes (geometry nodes, Scene Time driven)
def dust_group(name, count, bmin, bmax, radius_max, seed, cyl_r=None, drift=0.5):
    g = bpy.data.node_groups.get(name)
    if g:
        bpy.data.node_groups.remove(g)
    g = bpy.data.node_groups.new(name, 'GeometryNodeTree')
    g.interface.new_socket(name="Geometry", in_out='INPUT', socket_type='NodeSocketGeometry')
    g.interface.new_socket(name="Geometry", in_out='OUTPUT', socket_type='NodeSocketGeometry')
    nb = NB(g)
    gi = nb.new("NodeGroupInput")
    go = nb.new("NodeGroupOutput")
    rv = nb.new("FunctionNodeRandomValue", data_type='FLOAT_VECTOR')
    nb.set(rv, "Min", bmin)
    nb.set(rv, "Max", bmax)
    nb.set(rv, "Seed", seed)
    rr = nb.new("FunctionNodeRandomValue", data_type='FLOAT')
    nb.set(rr, 2, radius_max * 0.3)   # Min (float)
    nb.set(rr, 3, radius_max)         # Max (float)
    nb.set(rr, "Seed", seed + 7)
    pts = nb.new("GeometryNodePoints")
    nb.set(pts, "Count", count)
    g.links.new(rv.outputs[0], pts.inputs["Position"])
    g.links.new(rr.outputs[1], pts.inputs["Radius"])
    geo = pts.outputs[0]
    if cyl_r:
        pos = nb.new("GeometryNodeInputPosition")
        sep = nb.new("ShaderNodeSeparateXYZ")
        g.links.new(pos.outputs[0], sep.inputs[0])
        cmb = nb.new("ShaderNodeCombineXYZ")
        g.links.new(sep.outputs[0], cmb.inputs[0])
        g.links.new(sep.outputs[1], cmb.inputs[1])
        ln = nb.new("ShaderNodeVectorMath", operation='LENGTH')
        g.links.new(cmb.outputs[0], ln.inputs[0])
        cmp = nb.new("FunctionNodeCompare", data_type='FLOAT', operation='GREATER_THAN')
        g.links.new(ln.outputs["Value"], cmp.inputs[0])
        nb.set(cmp, 1, cyl_r)
        dl = nb.new("GeometryNodeDeleteGeometry", domain='POINT')
        g.links.new(geo, dl.inputs["Geometry"])
        g.links.new(cmp.outputs[0], dl.inputs["Selection"])
        geo = dl.outputs[0]
    # time-based drift
    st = nb.new("GeometryNodeInputSceneTime")
    pos2 = nb.new("GeometryNodeInputPosition")
    tw = nb.new("ShaderNodeMath", operation='MULTIPLY')
    g.links.new(st.outputs["Seconds"], tw.inputs[0])
    nb.set(tw, 1, 0.045)
    nz = nb.new("ShaderNodeTexNoise", noise_dimensions='4D')
    g.links.new(pos2.outputs[0], nz.inputs["Vector"])
    g.links.new(tw.outputs[0], nz.inputs["W"])
    nb.set(nz, "Scale", 0.55)
    nb.set(nz, "Detail", 1.0)
    sub = nb.new("ShaderNodeVectorMath", operation='SUBTRACT')
    g.links.new(nz.outputs["Color"], sub.inputs[0])
    nb.set(sub, 1, (0.5, 0.5, 0.5))
    sc = nb.new("ShaderNodeVectorMath", operation='SCALE')
    g.links.new(sub.outputs[0], sc.inputs[0])
    nb.set(sc, "Scale", drift)
    # gentle upward drift in warm air
    up = nb.new("ShaderNodeMath", operation='MULTIPLY')
    g.links.new(st.outputs["Seconds"], up.inputs[0])
    nb.set(up, 1, 0.012)
    upv = nb.new("ShaderNodeCombineXYZ")
    g.links.new(up.outputs[0], upv.inputs[2])
    add = nb.new("ShaderNodeVectorMath", operation='ADD')
    g.links.new(sc.outputs[0], add.inputs[0])
    g.links.new(upv.outputs[0], add.inputs[1])
    sp = nb.new("GeometryNodeSetPosition")
    g.links.new(geo, sp.inputs["Geometry"])
    g.links.new(add.outputs[0], sp.inputs["Offset"])
    sm = nb.new("GeometryNodeSetMaterial")
    g.links.new(sp.outputs[0], sm.inputs["Geometry"])
    sm.inputs["Material"].default_value = bpy.data.materials["MAT_FX_Dust"]
    g.links.new(sm.outputs[0], go.inputs[0])
    nb.layout()
    return g


def build_dust(coll):
    GM.mat_dust_mote()
    obs = []
    for nm, cnt, bmin, bmax, rmax, seed, cyl in (
            ("FX_Dust_Greenhouse", 7000, (-6.3, -6.3, 0.5), (6.3, 6.3, 7.5), 0.0022, 11, 6.2),
            ("FX_Dust_Studio", 1500, (-15.4, -3.6, 0.4), (-7.3, 3.6, 3.0), 0.0016, 23, None)):
        me = bpy.data.meshes.get(nm) or bpy.data.meshes.new(nm)
        ob = bpy.data.objects.get(nm)
        if ob is None:
            ob = bpy.data.objects.new(nm, me)
            coll.objects.link(ob)
        for md in list(ob.modifiers):
            ob.modifiers.remove(md)
        md = ob.modifiers.new("Dust", 'NODES')
        md.node_group = dust_group("GN_" + nm, cnt, bmin, bmax, rmax, seed, cyl)
        only_camera_visibility(ob, shadow=False, transmission=True, glossy=False)
        obs.append(ob)
    return obs


# ------------------------------------------------------------------ teapot steam
def mat_steam(name="MAT_FX_Steam"):
    m, nb = fresh_material(name)
    tc = nb.texcoord()
    p = tc.outputs["Object"]
    x, y, z = nb.sepxyz(p)
    t = GM.t_sec(nb)
    h = nb.maxf(z, 0.0)
    ox = nb.mul(nb.sub(nb.noise(None, scale=1.0, detail=2, dims='1D', w=nb.add(nb.mul(h, 4.0), nb.mul(t, 0.45))), 0.5), nb.add(0.01, nb.mul(h, 0.35)))
    oy = nb.mul(nb.sub(nb.noise(None, scale=1.0, detail=2, dims='1D', w=nb.add(nb.add(nb.mul(h, 3.3), nb.mul(t, 0.38)), 17.0)), 0.5), nb.add(0.01, nb.mul(h, 0.3)))
    # gentle lean (warm air drifting toward the open door)
    ox = nb.add(ox, nb.mul(h, 0.18))
    r = nb.vmath('LENGTH', nb.combxyz(nb.sub(x, ox), nb.sub(y, oy), 0.0))
    rad = nb.add(0.006, nb.mul(h, 0.11))
    plume = nb.inv(nb.smooth(r, nb.mul(rad, 0.15), rad))
    tv = nb.vmath('ADD', p, nb.combxyz(0.0, 0.0, nb.mul(t, -0.22)))
    turb = nb.noise(tv, scale=28.0, detail=3, rough=0.55, dims='4D', w=nb.mul(t, 0.35))
    wisps = nb.smooth(turb, 0.42, 0.72)
    fade = nb.mul(nb.smooth(h, 0.0, 0.025), nb.inv(nb.smooth(h, 0.12, 0.40)))
    dens = nb.mul(nb.mul(nb.mul(plume, wisps), fade), 7.0)
    pv = nb.new("ShaderNodeVolumePrincipled")
    nb.set(pv, "Color", H('#FFFFFF'))
    nb.set(pv, "Density", dens)
    nb.set(pv, "Anisotropy", 0.45)
    nb.output_material(volume=pv)
    nb.layout()
    return m


def build_steam(coll):
    sp = bpy.data.objects.get("Porcelain_TeaPotSpout_001")
    pot = bpy.data.objects.get("Porcelain_TeaPot_001")
    if sp is None:
        return None
    mw = sp.matrix_world
    verts = [mw @ v.co for v in sp.data.vertices]
    pc = pot.matrix_world.translation if pot else Vector((0, 5.72, 0.75))
    def score(v):
        return v.z * 1.0 + (Vector((v.x, v.y)) - Vector((pc.x, pc.y))).length * 0.8
    tip = max(verts, key=score)
    near = [v for v in verts if (v - tip).length < 0.02]
    tipc = sum(near, Vector()) / len(near)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= 0.34
        v.co.y *= 0.34
        v.co.z = (v.co.z + 0.5) * 0.48 - 0.01
    ob = new_mesh_object("FX_TeaSteam", bm, coll)
    ob.location = tipc + Vector((0, 0, 0.004))
    ob.data.materials.clear()
    ob.data.materials.append(mat_steam())
    ob.visible_shadow = False
    return ob


# ------------------------------------------------------------------ falling petals
def petal_mesh(name, length=0.026, width=0.018, cup=0.004):
    bm = bmesh.new()
    nu, nv = 5, 7
    grid = []
    for j in range(nv):
        row = []
        v = j / (nv - 1)
        w = width * math.sin(math.pi * min(1.0, v * 0.92 + 0.08)) * (0.55 + 0.45 * v)
        for i in range(nu):
            u = i / (nu - 1) - 0.5
            x = u * w
            y = v * length
            z = cup * (4 * u * u) + cup * 0.6 * math.sin(math.pi * v)
            row.append(bm.verts.new((x, y - length * 0.5, z)))
        grid.append(row)
    uvl = bm.loops.layers.uv.new("UVMap")
    for j in range(nv - 1):
        for i in range(nu - 1):
            f = bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
            for lp, (a, b) in zip(f.loops, ((i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1))):
                lp[uvl].uv = (a / (nu - 1), b / (nv - 1))
    return bm


def mat_fx_petal(name, c_base, c_tip):
    m, nb = fresh_material(name)
    tc = nb.texcoord()
    u, v, _ = nb.sepxyz(tc.outputs["UV"])
    col = nb.mix(nb.smooth(v, 0.1, 1.0), H(c_base), H(c_tip))
    vein = nb.mul(nb.smooth(nb.sin(nb.mul(u, 60.0)), 0.7, 1.0), 0.12)
    col = nb.mix(vein, col, nb.hsv(col, 0.5, 1.1, 0.85))
    f = nb.principled(base=col, rough=0.5, sheen=0.35)
    tl = nb.bsdf("translucent", Color=nb.hsv(col, 0.5, 1.1, 1.2))
    s = nb.mixshader(0.45, f, tl)
    nb.output_material(s)
    nb.layout()
    return m


def cam_frame_point(cam, frame, dist, right=0.0, up=0.0):
    sc = bpy.context.scene
    sc.frame_set(frame)
    mw = cam.matrix_world.copy()
    fwd = (mw.to_3x3() @ Vector((0, 0, -1))).normalized()
    rgt = (mw.to_3x3() @ Vector((1, 0, 0))).normalized()
    upv = (mw.to_3x3() @ Vector((0, 1, 0))).normalized()
    return mw.translation + fwd * dist + rgt * right + upv * up


def animate_fall(ob, f0, f1, p0, floor_z, sway=0.12, spin=1.0, seed=0, land=None):
    rnd = random.Random(seed)
    ob.animation_data_clear()
    ob.hide_render = True
    ob.hide_viewport = False
    ob.keyframe_insert("hide_render", frame=f0 - 1)
    ob.hide_render = False
    ob.keyframe_insert("hide_render", frame=f0)
    n = f1 - f0
    ph = rnd.random() * 6.28
    end = land if land is not None else Vector((p0.x + 0.15, p0.y + 0.05, floor_z))
    for k in range(0, n + 1, 3):
        s = k / n
        ease = s * s * (3 - 2 * s) * 0.25 + s * 0.75
        x = p0.x + (end.x - p0.x) * ease + sway * math.sin(ph + s * 7.5)
        y = p0.y + (end.y - p0.y) * ease + sway * 0.6 * math.cos(ph * 0.7 + s * 6.1)
        z = p0.z + (end.z - p0.z) * ease
        ob.location = (x, y, z)
        ob.rotation_euler = (math.sin(ph + s * 9.0) * 1.1 * spin, math.cos(ph * 1.3 + s * 7.0) * 0.9 * spin, ph + s * 5.0 * spin)
        ob.keyframe_insert("location", frame=f0 + k)
        ob.keyframe_insert("rotation_euler", frame=f0 + k)
    # rest at landing spot (lies flat, keeps slowly rotating if floating)
    ob.location = end
    ob.rotation_euler = (0.0, 0.0, ph + 5.0 * spin)
    ob.keyframe_insert("location", frame=f1 + 2)
    ob.keyframe_insert("rotation_euler", frame=f1 + 2)


def build_petals(coll):
    sc = bpy.context.scene
    defs = [
        # name, camera, frame range, distance, right, up, colours, size, landing z or point
        ("FX_Petal_Geranium", "TOUR_Cam_05", (668, 742), 1.6, 0.18, 0.62, ('#D8323A', '#E85A5E'), (0.024, 0.019), None),
        ("FX_Petal_Rose", "TOUR_Cam_09", (1214, 1296), 2.1, -0.05, 0.55, ('#F1C8BE', '#F6D9CF'), (0.034, 0.028), 0.93),
        ("FX_Petal_Lily", "TOUR_Cam_03", (330, 410), 1.55, 0.25, 0.75, ('#F7E8EA', '#F2B3C4'), (0.030, 0.020), 0.335),
    ]
    obs = []
    for i, (nm, camn, (f0, f1), dist, r, u, cols, size, landz) in enumerate(defs):
        cam = bpy.data.objects[camn]
        ob = new_mesh_object(nm, petal_mesh(nm, size[0], size[1]), coll)
        ob.data.materials.clear()
        ob.data.materials.append(mat_fx_petal("MAT_FX_" + nm[3:], cols[0], cols[1]))
        start = cam_frame_point(cam, f0, dist, r, u)
        endp = cam_frame_point(cam, f1, dist + 0.15, r + 0.12, -0.45)
        if landz is not None:
            endp.z = landz
        else:
            endp.z = 0.03
        animate_fall(ob, f0, f1, start, endp.z, sway=0.10, seed=i * 13 + 5, land=endp)
        ob.visible_shadow = True
        obs.append(ob)
    sc.frame_set(1)
    return obs


# ------------------------------------------------------------------ drifting cloud shadows
def build_cloud_shadows(coll):
    sd = GW.sun_dir()
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=55.0)
    ob = new_mesh_object("FX_CloudShadowCaster", bm, coll)
    center = Vector((-3.0, -2.0, 2.0)) + sd * 300.0
    ob.location = center
    ob.rotation_euler = sd.to_track_quat('Z', 'Y').to_euler()
    m, nb = fresh_material("MAT_FX_CloudShadow")
    tc = nb.texcoord()
    t = GM.t_sec(nb)
    p = tc.outputs["Object"]
    pm = nb.vmath('ADD', p, nb.combxyz(nb.mul(t, 0.55), nb.mul(t, 0.22), 0.0))
    c = nb.noise(pm, scale=0.035, detail=5, rough=0.55)
    cl = nb.smooth(c, 0.55, 0.72)
    trans = nb.mix(cl, (1, 1, 1, 1), H('#5A5A5A'))
    s = nb.bsdf("transparent", Color=trans)
    nb.output_material(s)
    nb.layout()
    ob.data.materials.clear()
    ob.data.materials.append(m)
    ob.visible_camera = False
    ob.visible_diffuse = False
    ob.visible_glossy = False
    ob.visible_transmission = False
    ob.visible_volume_scatter = False
    ob.visible_shadow = True
    return ob


# ------------------------------------------------------------------ pool reflection caustics (gobo spot + light linking)
def build_pool_caustics(coll):
    sd = GW.sun_dir()
    virt = Vector((sd.x, sd.y, -sd.z)).normalized()      # direction to the sun's mirror image below the water
    pos = Vector((0.0, 0.0, 0.33)) + virt * 3.2
    aim = -virt                                           # reflected light travels up & away from the sun
    lo = GW.add_light("LGT_PoolCaustics", 'SPOT', pos, 260.0, color=(1.0, 0.82, 0.58), radius=0.0,
                      spot_size=math.radians(88), blend=0.5, shadow=False, coll=coll)
    lo.rotation_euler = aim.to_track_quat('-Z', 'Y').to_euler()
    ld = lo.data
    ld.volume_factor = 0.0
    ld.use_nodes = True
    nt = ld.node_tree
    nt.nodes.clear()
    nb = NB(nt)
    tc = nb.texcoord()
    t = GM.t_sec(nb)
    dvec = tc.outputs["Normal"]
    x, y, z = nb.sepxyz(dvec)
    zz = nb.maxf(nb.absf(z), 0.05)
    proj = nb.combxyz(nb.div(x, zz), nb.div(y, zz), 0.0)
    pat = GM.caustic_pattern(nb, nb.vmath('SCALE', proj, scale=1.6), t, scale=6.0, speed=0.4)
    em = nb.new("ShaderNodeEmission")
    nb.set(em, "Color", (1, 1, 1, 1))
    nb.set(em, "Strength", nb.add(0.03, nb.mul(pat, 1.6)))
    out = nb.new("ShaderNodeOutputLight")
    nt.links.new(em.outputs[0], out.inputs[0])
    nb.layout()
    # receivers: coping around the pool, island rocks and the fountain copper
    rc = bpy.data.collections.get("LL_PoolCausticReceivers") or bpy.data.collections.new("LL_PoolCausticReceivers")
    for o in list(rc.objects):
        rc.objects.unlink(o)
    for o in bpy.data.objects:
        if o.type != 'MESH':
            continue
        c0 = o.users_collection[0].name if o.users_collection else ""
        if (c0 == "20_Pond" and o.name.startswith(("Stone_Coping", "Stone_Island"))) or c0 == "Fountain" and o.name.startswith("Copper"):
            rc.objects.link(o)
    lo.light_linking.receiver_collection = rc
    return lo


# ------------------------------------------------------------------ depth of field
DOF = {
    # camera: (fstop, focus mode)  focus mode: ('ray', frame) -> focus empty at the hit point of the view centre
    "TOUR_Cam_01": (11.0, ('ray', 84)),
    "TOUR_Cam_02": (6.3, ('dist', 9.0)),
    "TOUR_Cam_03": (3.5, ('ray', 384)),
    "TOUR_Cam_04": (8.0, ('dist', 6.0)),
    "TOUR_Cam_05": (3.2, ('ray', 696)),
    "TOUR_Cam_06": (2.8, ('obj', "Porcelain_TeaPot_001")),
    "TOUR_Cam_07": (2.8, ('ray', 948)),
    "TOUR_Cam_08": (5.6, ('dist', 6.5)),
    "TOUR_Cam_09": (3.2, ('ray', 1248)),
    "TOUR_Cam_10": (11.0, ('dist', 26.0)),
    "STILL_01": (8.0, ('dist', 9.5)),
    "STILL_02": (8.0, ('dist', 7.5)),
    "STILL_03": (3.5, ('ray', 1)),
    "STILL_04": (3.2, ('ray', 1)),
    "STILL_05": (4.0, ('ray', 1)),
    "STILL_06": (11.0, ('dist', 26.0)),
}


def build_dof(coll):
    sc = bpy.context.scene
    dg = bpy.context.evaluated_depsgraph_get()
    for camn, (fs, mode) in DOF.items():
        cam = bpy.data.objects.get(camn)
        if cam is None:
            continue
        cd = cam.data
        cd.dof.use_dof = True
        cd.dof.aperture_fstop = fs
        cd.dof.aperture_blades = 7
        cd.dof.aperture_rotation = math.radians(12)
        kind = mode[0]
        if kind == 'dist':
            cd.dof.focus_object = None
            cd.dof.focus_distance = mode[1]
        elif kind == 'obj':
            cd.dof.focus_object = bpy.data.objects.get(mode[1])
        else:
            sc.frame_set(mode[1])
            dg = bpy.context.evaluated_depsgraph_get()
            mw = cam.matrix_world
            o = mw.translation
            d = (mw.to_3x3() @ Vector((0, 0, -1))).normalized()
            hit, loc, nor, idx, ob, _ = sc.ray_cast(dg, o, d, distance=60.0)
            if not hit:
                cd.dof.focus_distance = 5.0
                continue
            en = "FOCUS_" + camn
            e = bpy.data.objects.get(en)
            if e is None:
                e = bpy.data.objects.new(en, None)
                coll.objects.link(e)
            e.empty_display_size = 0.1
            e.location = loc
            cd.dof.focus_object = e
    sc.frame_set(1)

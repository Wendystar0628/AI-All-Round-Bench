"""Small node-building toolkit used by the greenhouse build scripts.

Every helper accepts either a constant or a socket/node for each input, so
material code stays compact and readable.
"""
import bpy
import math


def srgb_to_lin(c):
    c = max(0.0, min(1.0, c))
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hexc(h, a=1.0):
    """'#RRGGBB' (sRGB) -> linear RGBA tuple."""
    h = h.lstrip('#')
    r, g, b = (int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))
    return (srgb_to_lin(r), srgb_to_lin(g), srgb_to_lin(b), a)


def lin(r, g, b, a=1.0):
    return (r, g, b, a)


class NB:
    def __init__(self, tree):
        self.tree = tree
        self.nodes = tree.nodes
        self.links = tree.links

    # ------------------------------------------------------------ core
    @staticmethod
    def out(x, name=None):
        if isinstance(x, bpy.types.NodeSocket):
            return x
        if isinstance(x, bpy.types.Node):
            if name is not None:
                alias = {"Fac": ("Fac", "Factor"), "Factor": ("Fac", "Factor")}.get(name, (name,))
                for o in x.outputs:
                    if (o.identifier in alias or o.name in alias) and o.enabled:
                        return o
                raise KeyError(f"{x.bl_idname} has no output {name}: {[(o.identifier, o.name) for o in x.outputs]}")
            for o in x.outputs:
                if o.enabled:
                    return o
        raise TypeError(f"not a node/socket: {x!r}")

    @staticmethod
    def find_input(node, key):
        if isinstance(key, int):
            return node.inputs[key]
        for i in node.inputs:
            if i.identifier == key and i.enabled:
                return i
        for i in node.inputs:
            if i.name == key and i.enabled:
                return i
        for i in node.inputs:
            if i.identifier == key or i.name == key:
                return i
        raise KeyError(f"{node.bl_idname} has no input {key}: {[i.identifier for i in node.inputs]}")

    def set(self, node, key, value):
        sock = self.find_input(node, key)
        if isinstance(value, (bpy.types.NodeSocket, bpy.types.Node)):
            self.links.new(self.out(value), sock)
            return
        dv = getattr(sock, "default_value", None)
        if dv is None:
            return
        try:
            n = len(dv)
        except TypeError:
            n = 0
        if n and not isinstance(value, (tuple, list)):
            value = tuple([value] * n) if n != 4 else (value, value, value, 1.0)
        if n and isinstance(value, (tuple, list)) and len(value) != n:
            if n == 4 and len(value) == 3:
                value = tuple(value) + (1.0,)
            elif n == 3 and len(value) == 4:
                value = tuple(value[:3])
        sock.default_value = value

    def new(self, idname, inputs=None, label=None, **props):
        n = self.nodes.new(idname)
        for k, v in props.items():
            setattr(n, k, v)
        if inputs:
            for k, v in inputs.items():
                if v is not None:
                    self.set(n, k, v)
        if label:
            n.label = label
        return n

    def link(self, a, b_node, key):
        self.set(b_node, key, a)

    # ------------------------------------------------------------ inputs
    def texcoord(self):
        return self.new("ShaderNodeTexCoord")

    def geometry(self):
        return self.new("ShaderNodeNewGeometry")

    def objinfo(self):
        return self.new("ShaderNodeObjectInfo")

    def lightpath(self):
        return self.new("ShaderNodeLightPath")

    def value(self, v, label=None):
        n = self.new("ShaderNodeValue", label=label)
        n.outputs[0].default_value = v
        return n

    def rgb(self, c):
        n = self.new("ShaderNodeRGB")
        n.outputs[0].default_value = c
        return n

    def attr(self, name, atype='GEOMETRY'):
        return self.new("ShaderNodeAttribute", attribute_name=name, attribute_type=atype)

    # ------------------------------------------------------------ math
    def math(self, op, a, b=None, c=None, clamp=False):
        n = self.new("ShaderNodeMath", operation=op, use_clamp=clamp)
        self.set(n, 0, a)
        if b is not None:
            self.set(n, 1, b)
        if c is not None:
            self.set(n, 2, c)
        return n.outputs[0]

    def add(self, a, b, clamp=False):
        return self.math('ADD', a, b, clamp=clamp)

    def sub(self, a, b, clamp=False):
        return self.math('SUBTRACT', a, b, clamp=clamp)

    def mul(self, a, b, clamp=False):
        return self.math('MULTIPLY', a, b, clamp=clamp)

    def div(self, a, b):
        return self.math('DIVIDE', a, b)

    def pow(self, a, b):
        return self.math('POWER', a, b)

    def maxf(self, a, b):
        return self.math('MAXIMUM', a, b)

    def minf(self, a, b):
        return self.math('MINIMUM', a, b)

    def absf(self, a):
        return self.math('ABSOLUTE', a)

    def sin(self, a):
        return self.math('SINE', a)

    def madd(self, a, b, c):
        return self.math('MULTIPLY_ADD', a, b, c)

    def clamp01(self, a):
        n = self.new("ShaderNodeClamp")
        self.set(n, 0, a)
        return n.outputs[0]

    def inv(self, a):
        return self.sub(1.0, a, clamp=True)

    def maprange(self, v, fmin, fmax, tmin=0.0, tmax=1.0, clamp=True, interp='LINEAR'):
        n = self.new("ShaderNodeMapRange", interpolation_type=interp, clamp=clamp)
        self.set(n, "Value", v)
        self.set(n, "From Min", fmin)
        self.set(n, "From Max", fmax)
        self.set(n, "To Min", tmin)
        self.set(n, "To Max", tmax)
        return n.outputs[0]

    def smooth(self, v, a, b):
        return self.maprange(v, a, b, 0.0, 1.0, True, 'SMOOTHSTEP')

    def vmath(self, op, a, b=None, scale=None):
        n = self.new("ShaderNodeVectorMath", operation=op)
        self.set(n, 0, a)
        if b is not None:
            self.set(n, 1, b)
        if scale is not None:
            self.set(n, "Scale", scale)
        if op in ('LENGTH', 'DOT_PRODUCT', 'DISTANCE'):
            return self.out(n, "Value")
        return self.out(n, "Vector")

    def sepxyz(self, v):
        n = self.new("ShaderNodeSeparateXYZ")
        self.set(n, 0, v)
        return n.outputs[0], n.outputs[1], n.outputs[2]

    def combxyz(self, x, y, z):
        n = self.new("ShaderNodeCombineXYZ")
        self.set(n, 0, x)
        self.set(n, 1, y)
        self.set(n, 2, z)
        return n.outputs[0]

    def mapping(self, v, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1), vtype='POINT'):
        n = self.new("ShaderNodeMapping", vector_type=vtype)
        self.set(n, "Vector", v)
        self.set(n, "Location", loc)
        self.set(n, "Rotation", rot)
        self.set(n, "Scale", scale)
        return n.outputs[0]

    # ------------------------------------------------------------ colour
    def mix(self, fac, a, b, blend='MIX', clamp=False):
        n = self.new("ShaderNodeMix", data_type='RGBA', blend_type=blend, clamp_result=clamp)
        self.set(n, "Factor_Float", fac)
        self.set(n, "A_Color", a)
        self.set(n, "B_Color", b)
        return self.out(n, "Result_Color")

    def mixf(self, fac, a, b):
        n = self.new("ShaderNodeMix", data_type='FLOAT')
        self.set(n, "Factor_Float", fac)
        self.set(n, "A_Float", a)
        self.set(n, "B_Float", b)
        return self.out(n, "Result_Float")

    def ramp(self, fac, stops, interp='LINEAR'):
        n = self.new("ShaderNodeValToRGB")
        cr = n.color_ramp
        cr.interpolation = interp
        while len(cr.elements) > 1:
            cr.elements.remove(cr.elements[-1])
        cr.elements[0].position = stops[0][0]
        cr.elements[0].color = stops[0][1]
        for pos, col in stops[1:]:
            e = cr.elements.new(pos)
            e.color = col
        self.set(n, 0, fac)
        return self.out(n, "Color")

    def hsv(self, color, h=0.5, s=1.0, v=1.0, fac=1.0):
        n = self.new("ShaderNodeHueSaturation")
        self.set(n, "Hue", h)
        self.set(n, "Saturation", s)
        self.set(n, "Value", v)
        self.set(n, "Fac", fac)
        self.set(n, "Color", color)
        return n.outputs[0]

    def bw(self, color):
        n = self.new("ShaderNodeRGBToBW")
        self.set(n, 0, color)
        return n.outputs[0]

    def blackbody(self, t):
        n = self.new("ShaderNodeBlackbody")
        self.set(n, 0, t)
        return n.outputs[0]

    # ------------------------------------------------------------ textures
    def noise(self, vec=None, scale=5.0, detail=2.0, rough=0.5, distortion=0.0, dims='3D', w=None, lac=2.0, ntype='FBM', normalize=True, out='Factor'):
        n = self.new("ShaderNodeTexNoise", noise_dimensions=dims, noise_type=ntype, normalize=normalize)
        if vec is not None:
            self.set(n, "Vector", vec)
        if w is not None:
            self.set(n, "W", w)
        self.set(n, "Scale", scale)
        self.set(n, "Detail", detail)
        self.set(n, "Roughness", rough)
        self.set(n, "Lacunarity", lac)
        self.set(n, "Distortion", distortion)
        return self.out(n, "Color" if out == 'Color' else "Fac")

    def noise_node(self, vec=None, scale=5.0, detail=2.0, rough=0.5, distortion=0.0, dims='3D', w=None):
        n = self.new("ShaderNodeTexNoise", noise_dimensions=dims)
        if vec is not None:
            self.set(n, "Vector", vec)
        if w is not None:
            self.set(n, "W", w)
        self.set(n, "Scale", scale)
        self.set(n, "Detail", detail)
        self.set(n, "Roughness", rough)
        self.set(n, "Distortion", distortion)
        return n

    def voronoi(self, vec=None, scale=5.0, feature='F1', metric='EUCLIDEAN', rand=1.0, dims='3D', w=None, smooth=None, detail=0.0, out='Distance'):
        n = self.new("ShaderNodeTexVoronoi", feature=feature, distance=metric, voronoi_dimensions=dims)
        if vec is not None:
            self.set(n, "Vector", vec)
        if w is not None:
            self.set(n, "W", w)
        self.set(n, "Scale", scale)
        self.set(n, "Randomness", rand)
        self.set(n, "Detail", detail)
        if smooth is not None:
            self.set(n, "Smoothness", smooth)
        return self.out(n, out)

    def voronoi_node(self, vec=None, scale=5.0, feature='F1', metric='EUCLIDEAN', rand=1.0, dims='3D', w=None):
        n = self.new("ShaderNodeTexVoronoi", feature=feature, distance=metric, voronoi_dimensions=dims)
        if vec is not None:
            self.set(n, "Vector", vec)
        if w is not None:
            self.set(n, "W", w)
        self.set(n, "Scale", scale)
        self.set(n, "Randomness", rand)
        return n

    def wave(self, vec=None, scale=5.0, distortion=0.0, detail=2.0, dscale=1.0, wtype='BANDS', direction='X', profile='SIN', phase=0.0, out='Factor'):
        n = self.new("ShaderNodeTexWave", wave_type=wtype, bands_direction=direction, rings_direction=direction if direction in ('X', 'Y', 'Z', 'SPHERICAL') else 'X', wave_profile=profile)
        if vec is not None:
            self.set(n, "Vector", vec)
        self.set(n, "Scale", scale)
        self.set(n, "Distortion", distortion)
        self.set(n, "Detail", detail)
        self.set(n, "Detail Scale", dscale)
        self.set(n, "Phase Offset", phase)
        return self.out(n, "Fac" if out == 'Factor' else "Color")

    def whitenoise(self, vec, dims='3D', w=None, out='Value'):
        n = self.new("ShaderNodeTexWhiteNoise", noise_dimensions=dims)
        self.set(n, "Vector", vec)
        if w is not None:
            self.set(n, "W", w)
        return self.out(n, out)

    def gradient(self, vec, gtype='LINEAR'):
        n = self.new("ShaderNodeTexGradient", gradient_type=gtype)
        self.set(n, 0, vec)
        return self.out(n, "Fac")

    def brick(self, vec, c1, c2, mortar, scale=1.0, mortar_size=0.02, mortar_smooth=0.1, bias=0.0, bw=0.5, rh=0.25, offset=0.5, squash=1.0):
        n = self.new("ShaderNodeTexBrick", offset=offset, squash=squash)
        self.set(n, "Vector", vec)
        self.set(n, "Color1", c1)
        self.set(n, "Color2", c2)
        self.set(n, "Mortar", mortar)
        self.set(n, "Scale", scale)
        self.set(n, "Mortar Size", mortar_size)
        self.set(n, "Mortar Smooth", mortar_smooth)
        self.set(n, "Bias", bias)
        self.set(n, "Brick Width", bw)
        self.set(n, "Row Height", rh)
        return n

    def bump(self, height, strength=0.3, distance=0.01, normal=None, invert=False):
        n = self.new("ShaderNodeBump", invert=invert)
        self.set(n, "Height", height)
        self.set(n, "Strength", strength)
        self.set(n, "Distance", distance)
        if normal is not None:
            self.set(n, "Normal", normal)
        return n.outputs[0]

    def layerweight(self, blend=0.5, normal=None):
        n = self.new("ShaderNodeLayerWeight")
        self.set(n, "Blend", blend)
        if normal is not None:
            self.set(n, "Normal", normal)
        return n

    def fresnel(self, ior=1.5, normal=None):
        n = self.new("ShaderNodeFresnel")
        self.set(n, "IOR", ior)
        if normal is not None:
            self.set(n, "Normal", normal)
        return n.outputs[0]

    # ------------------------------------------------------------ shaders
    def principled(self, **kw):
        n = self.new("ShaderNodeBsdfPrincipled")
        mapping = {
            'base': 'Base Color', 'metal': 'Metallic', 'rough': 'Roughness', 'ior': 'IOR', 'alpha': 'Alpha', 'normal': 'Normal',
            'sss': 'Subsurface Weight', 'sss_radius': 'Subsurface Radius', 'sss_scale': 'Subsurface Scale', 'spec': 'Specular IOR Level',
            'spec_tint': 'Specular Tint', 'aniso': 'Anisotropic', 'aniso_rot': 'Anisotropic Rotation', 'trans': 'Transmission Weight',
            'coat': 'Coat Weight', 'coat_rough': 'Coat Roughness', 'coat_normal': 'Coat Normal', 'coat_tint': 'Coat Tint',
            'sheen': 'Sheen Weight', 'sheen_rough': 'Sheen Roughness', 'sheen_tint': 'Sheen Tint',
            'emit': 'Emission Color', 'emit_str': 'Emission Strength', 'diff_rough': 'Diffuse Roughness',
            'film': 'Thin Film Thickness', 'film_ior': 'Thin Film IOR',
        }
        sss_method = kw.pop('sss_method', None)
        if sss_method:
            n.subsurface_method = sss_method
        for k, v in kw.items():
            if v is None:
                continue
            self.set(n, mapping.get(k, k), v)
        if 'emit_str' not in kw:
            self.set(n, 'Emission Strength', 0.0)
        return n.outputs[0]

    def bsdf(self, kind, **inputs):
        n = self.new({"diffuse": "ShaderNodeBsdfDiffuse", "glossy": "ShaderNodeBsdfGlossy", "glass": "ShaderNodeBsdfGlass",
                      "transparent": "ShaderNodeBsdfTransparent", "translucent": "ShaderNodeBsdfTranslucent",
                      "refraction": "ShaderNodeBsdfRefraction", "sheen": "ShaderNodeBsdfSheen", "metallic": "ShaderNodeBsdfMetallic"}[kind])
        for k, v in inputs.items():
            if v is not None:
                self.set(n, k, v)
        return n.outputs[0]

    def emission(self, color, strength):
        n = self.new("ShaderNodeEmission")
        self.set(n, "Color", color)
        self.set(n, "Strength", strength)
        return n.outputs[0]

    def mixshader(self, fac, a, b):
        n = self.new("ShaderNodeMixShader")
        self.set(n, 0, fac)
        self.links.new(self.out(a), n.inputs[1])
        self.links.new(self.out(b), n.inputs[2])
        return n.outputs[0]

    def addshader(self, a, b):
        n = self.new("ShaderNodeAddShader")
        self.links.new(self.out(a), n.inputs[0])
        self.links.new(self.out(b), n.inputs[1])
        return n.outputs[0]

    def group(self, ng):
        n = self.new("ShaderNodeGroup")
        n.node_tree = ng
        return n

    def output_material(self, surface=None, volume=None, displacement=None):
        n = self.new("ShaderNodeOutputMaterial", target='ALL')
        if surface is not None:
            self.links.new(self.out(surface), n.inputs["Surface"])
        if volume is not None:
            self.links.new(self.out(volume), n.inputs["Volume"])
        if displacement is not None:
            self.links.new(self.out(displacement), n.inputs["Displacement"])
        return n

    # ------------------------------------------------------------ layout
    def layout(self):
        """Simple left-to-right layered layout so the delivered node trees are readable."""
        nodes = list(self.nodes)
        if not nodes:
            return
        depth = {n: 0 for n in nodes}
        children = {n: [] for n in nodes}
        for l in self.links:
            children[l.to_node].append(l.from_node)
        outs = [n for n in nodes if not any(l.from_node == n for l in self.links)]
        changed = True
        it = 0
        while changed and it < 200:
            changed = False
            it += 1
            for n in nodes:
                for c in children[n]:
                    if depth[c] < depth[n] + 1:
                        depth[c] = depth[n] + 1
                        changed = True
        cols = {}
        for n in nodes:
            cols.setdefault(depth[n], []).append(n)
        for d, col in cols.items():
            for i, n in enumerate(col):
                n.location = (-d * 260.0, -i * 220.0 + len(col) * 110.0)


def fresh_material(name):
    m = bpy.data.materials.get(name)
    if m is None:
        m = bpy.data.materials.new(name)
    m.use_nodes = True
    m.node_tree.nodes.clear()
    return m, NB(m.node_tree)


def fresh_group(name, kind='ShaderNodeTree'):
    g = bpy.data.node_groups.get(name)
    if g is not None:
        bpy.data.node_groups.remove(g)
    g = bpy.data.node_groups.new(name, kind)
    return g, NB(g)

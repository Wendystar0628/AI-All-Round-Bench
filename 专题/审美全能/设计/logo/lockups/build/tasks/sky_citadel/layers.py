"""05 天穹圣城 · 颜色层：每层一个 render(C, G, tok) -> 预乘 RGBA。

一盏光：朝阳在右上（和代表画面里画外右下的朝阳同侧），受光的边在右上，背光一侧压铜版细线。
颜色角色（报告 2.4）：
  字面色    纸白，右上透一点朝阳的淡粉金，背光一侧压极淡的铜版细线（和「穹」同一套刻线）
  主题色    深群青（底板）；晨曦天青与淡粉（日轮后的天光、云的亮边）
  阴影色    深群青的暗调（不用纯黑）
  高光      受光的边、光刃的受光面、塔尖上的星
  点缀色    水晶青：穹顶肋间的玻璃（主，像水彩一样化开、带颗粒）；采光亭的两扇窗、锚链末端的水晶珠、玻璃周围几粒晶尘为呼应
  共用金属  鎏金（「穹」、光刃，同料）；浅金（日轮、发丝、锚链、底线带）
"""
import math
import numpy as np
import cv2
from lockupkit import fx as F
from lockupkit.geom import circle, rect, poly, union, stroke_line

LIGHT = 40          # 光的方向（度，从右边逆时针量：右上）
GILT = {'deep': '#4A2E14', 'dark': '#7A4C20', 'mid': '#B8782F', 'lit': '#E9A550', 'hi': '#FBD99A', 'white': '#FFF3D6'}
PALE = '#F3D6A8'    # 浅金
DEEP = '#18203A'    # 深群青的暗调（阴影）
CRYSTAL = '#72E0DE'


# ====================================================================== 共用画法


def hatch(C, angle=-38, period=3.2, phase=0.0):
    """铜版细线：一组平行斜线的“密度场”（0–1），配合明暗阈值取线（暗处线粗，亮处线细到没有）"""
    a = math.radians(angle)
    u = (C.XX * math.cos(a) + C.YY * math.sin(a)) / period + phase
    return 0.5 + 0.5 * np.cos(2 * math.pi * u)


def engrave(C, shade, angle=-38, period=3.2, phase=0.0):
    """按明暗 shade（0 亮 – 1 暗）刻线：返回线的覆盖率"""
    h = hatch(C, angle, period, phase)
    thr = 1 - np.clip(shade, 0, 1) * 0.62
    return F.smoothstep(thr - 0.06, thr + 0.06, h) * (shade > 0.02)


def facing(mask, sigma, angle=LIGHT):
    """每个像素朝光的程度（-1 背光 … 1 朝光），按形状边的法线算，往里面化开"""
    sm = F.blur(mask, sigma)
    gx, gy = F.grad(sm)
    nrm = np.sqrt(gx * gx + gy * gy) + 1e-6
    nx, ny = -gx / nrm, -gy / nrm
    a = math.radians(angle)
    f = nx * math.cos(a) + ny * -math.sin(a)
    w = np.clip(nrm / (nrm.max() + 1e-6) * 6, 0, 1)
    return f * w


def ycol(C, y0, y1, stops):
    t = np.clip((C.YY - y0) / max(1e-3, y1 - y0), 0, 1)
    return F.ramp(t, stops)


# ====================================================================== 底板

CLOUD_Y = 452
_CLOUDS = {}


def cloud_bank(C, seed=11, y=CLOUD_Y, x0=40, x1=880):
    """底板下沿的一排棉花云（云纹）：中间的鼓包大、两头小，大鼓包后面再冒一两个小鼓包。
    返回 (覆盖率, 轮廓线)：轮廓线是每个鼓包露在外面的上半圈（后面的被前面的挡住），像铜版画里勾的云"""
    key = (seed, y, round(x0), round(x1), C.W)
    if key in _CLOUDS:
        return _CLOUDS[key]
    rng = np.random.default_rng(seed)
    front, back = [], []
    x = x0
    while x < x1:
        u = (x - x0) / (x1 - x0)
        big = 0.35 + 0.65 * math.sin(math.pi * u) ** 0.6
        r = (rng.uniform(14, 30) if rng.random() < 0.75 else rng.uniform(30, 40)) * big + 7
        cy = y - r * rng.uniform(0.15, 0.4)
        front.append((x, cy, r))
        for _ in range(int(rng.integers(0, 3))):
            rr = r * rng.uniform(0.38, 0.72)
            ang = math.radians(rng.uniform(-150, -30))
            back.append((x + math.cos(ang) * r * 0.72, cy + math.sin(ang) * r * 0.72, rr))
        x += r * rng.uniform(0.9, 1.6)
    order = back + front                      # 先画后面的小鼓包，再画前面的大鼓包
    m = C.zeros()
    lines = C.zeros()
    XX, YY = C.XX, C.YY
    w = 0.9
    for (px_, py, r) in order:
        disc = C.R(circle(px_, py, r))
        rim = C.R(circle(px_, py, r + w)) - C.R(circle(px_, py, r - w))
        upw = np.clip((py - YY) / r + 0.35, 0, 1)            # 只要上半圈
        lines = lines * (1 - disc) + np.clip(rim, 0, 1) * upw
        m = np.maximum(m, disc)
    base = C.R(rect(x0, y - 6, x1, y + 70))
    lines = lines * (1 - base)
    m = np.maximum(m, base)
    fade = F.smoothstep(x0 - 10, x0 + 70, XX) * F.smoothstep(x1 + 10, x1 - 70, XX)
    _CLOUDS[key] = (m * fade, np.clip(lines, 0, 1) * fade)
    return _CLOUDS[key]


def render_plate(C, G, tok):
    XX, YY, px = C.XX, C.YY, C.px
    c = G['C']
    r, th = C.polar(c)
    tb = G['text'].bounds
    # 形：一团托住字的深群青，往上鼓出日轮那一块；边被噪声吃进去（撕边、纤维），下沿是一排云
    n1 = F.fbm(C.H, C.W, 64, 51, octaves=6)
    n1 = F.warp(n1, F.fbm(C.H, C.W, 100, 52), F.fbm(C.H, C.W, 100, 53), px(22))
    n2 = F.fbm(C.H, C.W, 9, 55, octaves=4, aniso=(3.0, 0.6))
    cxb, rx = (tb[0] + tb[2]) / 2, (tb[2] - tb[0]) / 2 + 62
    body = np.clip(1.2 - (np.abs((XX - cxb) / rx) ** 2.6 + np.abs((YY - 312) / 140) ** 3.2), 0, 1)   # 方一点的椭圆：上下平、一直托到云
    sun = np.clip(1.25 - (r / 182) ** 2, 0, 1) * F.smoothstep(c[1] + 60, c[1] - 10, YY)
    shape = np.maximum(body, sun)
    e = shape + (n1 - 0.5) * 0.5 + (n2 - 0.5) * 0.12
    a = F.smoothstep(0.28, 0.42, e) * (shape > 0.02)
    clouds, rims = cloud_bank(C, x0=tb[0] - 50, x1=tb[2] + 70)
    nb = F.fbm(C.H, C.W, 30, 56, octaves=5)
    cl = clouds * F.smoothstep(CLOUD_Y + 30, CLOUD_Y - 2, YY + (nb - 0.5) * 10)              # 云往下化开，不进点题短语那一行
    a = np.where(YY > CLOUD_Y - 40, np.maximum(a * F.smoothstep(CLOUD_Y + 2, CLOUD_Y - 30, YY), cl * F.smoothstep(0, 0.2, body + 0.12)), a)
    a = a * F.smoothstep(0, 24, XX) * F.smoothstep(0, 24, C.w - XX) * F.smoothstep(0, 14, YY) * F.smoothstep(0, 10, C.h - YY)

    # 颜色：深群青；日轮周围被晨光染成淡紫到淡粉，一层水彩的晕和颗粒
    col = np.zeros((C.H, C.W, 3), np.float32) + F.rgb('#1B2341')
    col = F.mix(col, F.rgb('#2B3961')[None, None], (F.smoothstep(0.35, 0.85, n1) * 0.75)[..., None])
    glow = np.clip(np.exp(-(r / 140.0) ** 2) * F.smoothstep(c[1] + 70, c[1] - 20, YY) + np.exp(-(r / 60.0) ** 2) * 0.5, 0, 1)
    dawn = F.ramp(np.clip(r / 160, 0, 1), [(0, '#F4CDB6'), (0.38, '#C7A2BC'), (0.72, '#65699C'), (1.0, '#2B3961')])
    col = F.mix(col, dawn, (glow * 0.8)[..., None])
    wash = F.diffuse(C.H, C.W, 57, np.clip(glow * 1.15, 0, 1), cell=52, threshold=0.56, softness=0.14, warp_px=16, edge=0.6, granule=0.4)
    col = F.mix(col, F.rgb('#EFC2AE')[None, None], (wash * 0.18)[..., None])
    # 云：鼓包的身子比底板亮一档（暗紫灰，往下沉），露在外面的上半圈勾一道发丝亮边（朝阳一侧暖、背光一侧冷）
    cm = clouds * F.smoothstep(CLOUD_Y - 80, CLOUD_Y - 50, YY)
    body_c = F.ramp(np.clip((YY - (CLOUD_Y - 60)) / 70, 0, 1), [(0, '#4A4C80'), (0.5, '#353D6C'), (1.0, '#232B4E')])
    col = F.mix(col, body_c, (np.clip(cm, 0, 1) * 0.95)[..., None])
    d_in = F.dist_in(cm)
    inner = np.exp(-d_in / px(7)) * (cm > 0.05) * F.smoothstep(CLOUD_Y + 10, CLOUD_Y - 40, YY)
    col = col + (F.rgb('#8C83B4') - col) * (inner * 0.28)[..., None]
    warm = np.clip((XX - tb[0]) / (tb[2] - tb[0]), 0, 1)
    rim_col = F.mix(F.rgb('#C9BCE0')[None, None], F.rgb('#FFD9BE')[None, None], warm[..., None])
    rl = rims * F.smoothstep(CLOUD_Y + 6, CLOUD_Y - 24, YY)
    col = col + (rim_col - col) * (rl * 0.92)[..., None]
    # 星尘、颗粒
    dust = F.sparkles(C.H, C.W, 58, a * (1 - glow) * (YY < 320) * (1 - np.clip(cm, 0, 1)), 150, size=(0.5, 1.2), flare=0.03)
    col = col + F.rgb('#DCE4F6') * (dust * 0.4)[..., None]
    col = col * (1 + (F.grain(C.H, C.W, 59, 0.8)[..., None] - 0.5) * 0.07)
    return F.solid(a * 0.97, np.clip(col, 0, 1))


# ====================================================================== 背景巨字


def render_ghost(C, G, tok):
    GH = G['ghost']
    m = C.R(GH['path'], ss=3)
    # 字脚化进云气：最下面三成渐渐淡下去（云在它后面托着）
    sink = 1 - 0.85 * F.smoothstep(GH['base'] - GH['cap'] * 0.38, GH['base'] + 2, C.YY)
    top = GH['base'] - GH['cap']
    col = ycol(C, top, GH['base'], [(0, '#A89DC6'), (0.4, '#7676A4'), (1.0, '#454F80')])
    col = col * (0.95 + 0.1 * F.fbm(C.H, C.W, 26, 61, octaves=5)[..., None])
    hi, sh = F.bevel(m, C.px(0.9), chisel=True, angle=LIGHT, altitude=40)
    col = col + (1 - col) * hi[..., None] * 0.22
    col = col * (1 - sh[..., None] * 0.25)
    return F.solid(m * sink * 0.68, np.clip(col, 0, 1))


# ====================================================================== 主体元素：晨光圣轮


def gilt(C, mask, y0=None, y1=None, hatch_amt=1.0, key=0.8, period=2.4):
    """鎏金：竖向的金带着一道天光的亮带（上亮、腰间一道最亮、往下沉成暖褐、底边被下面的光托亮一点）；
    朝光的边亮成暖白；背光的边沿着轮廓刻几道铜版细线。返回颜色"""
    rows = np.where(mask.max(axis=1) > 0.05)[0]
    if y0 is None:
        y0 = (rows[0] if len(rows) else 0) / C.scale
        y1 = (rows[-1] if len(rows) else C.H) / C.scale
    col = ycol(C, y0, y1, [(0, '#FFE6B4'), (0.2, '#F7CF88'), (0.36, '#FFF0CC'), (0.5, '#EDB660'),
                           (0.7, '#C9883E'), (0.87, '#A2662A'), (1.0, '#C88A42')])
    col = col * (1 + (F.fbm(C.H, C.W, 14, 91, octaves=4)[..., None] - 0.5) * 0.10)       # 金箔的起伏
    hi, sh = F.bevel(mask, C.px(1.3), chisel=True, angle=LIGHT, altitude=38)
    f = facing(mask, C.px(2.2))
    d_in = F.dist_in(mask)
    col = col + (F.rgb(GILT['white']) - col) * (np.clip(hi * key + np.clip(f, 0, 1) * np.exp(-d_in / C.px(2.0)) * 0.6, 0, 1))[..., None]
    col = col * (1 - sh[..., None] * 0.35) + F.rgb(GILT['dark']) * (sh[..., None] * 0.2)
    edge_shade = np.clip(-f, 0, 1) * np.exp(-d_in / C.px(3.4)) + sh * 0.5
    lines = engrave(C, np.clip(edge_shade, 0, 1) * 0.95, angle=-38, period=period) * mask * hatch_amt
    col = col * (1 - lines[..., None] * 0.45) + F.rgb(GILT['deep']) * (lines[..., None] * 0.25)
    col = col + (F.rgb('#FFFFFF') - col) * (F.rim_light(mask, C.px(0.7), angle=LIGHT, power=2.4)[..., None] * 0.8)
    glint = F.sparkles(C.H, C.W, 93, np.clip(hi - 0.3, 0, 1) * mask, 40, size=(0.5, 1.2), flare=0)
    col = col + (1 - col) * np.clip(glint, 0, 1)[..., None] * 0.6
    return col


def render_gloria(C, G, tok):
    E = G['gloria']
    c = E['c']
    r, th = C.polar(c)
    px = C.px
    rings, face, hairs = C.R(E['rings'], ss=3), C.R(E['face'], ss=3), C.R(E['hairs'], ss=3)
    lit, shade, beads = C.R(E['lit'], ss=3), C.R(E['shade'], ss=3), C.R(E['beads'], ss=3)
    blades = np.clip(lit + shade, 0, 1)
    # 日面：发丝放射线，越往外越淡；一层淡粉金的光
    face_a = face * np.clip(1 - (r - E['R'] * 0.42) / (E['R'] * 0.6), 0, 1) * 0.6
    cy_src = np.clip(1 - (r - E['R'] * 0.42) / (E['R'] * 0.4), 0, 1)
    cyan = F.diffuse(C.H, C.W, 75, cy_src, cell=14, threshold=0.58, softness=0.16, warp_px=5, edge=0.6, granule=0.6)
    face_col = F.mix(np.zeros((C.H, C.W, 3), np.float32) + F.rgb(PALE), np.zeros((C.H, C.W, 3), np.float32) + F.rgb('#8FEDE6'), cyan[..., None])
    face_a = np.maximum(face_a, face * cyan * 0.75)
    halo = np.exp(-(r / (E['R'] * 0.8)) ** 2) * (C.YY < c[1] + 4)
    hair_a = hairs * np.clip(1.15 - (r - E['R']) / 75, 0, 1)
    # 光刃：两个面——受光面从刃根的暖白亮到刃尖的金，背光面是深一档的金；刃尖淡一点
    tr = np.clip((r - E['R']) / 70, 0, 1)
    col_l = F.ramp(tr, [(0, '#FFF7E2'), (0.5, '#FBE2A8'), (1.0, '#F2C67C')])
    col_s = F.ramp(tr, [(0, '#E9B163'), (0.5, '#CF9145'), (1.0, '#B0712E')])
    col_b = (col_l * lit[..., None] + col_s * shade[..., None]) / np.maximum(blades, 1e-4)[..., None]
    edge = F.outer_stroke(blades, px(0.6))
    tipfade = np.clip(1.25 - (r - E['R']) / 95, 0.55, 1)
    shadow = F.drop_shadow(blades, -px(1.0), px(1.5), px(1.2))
    bead_col = np.zeros((C.H, C.W, 3), np.float32) + F.rgb(PALE)
    hi, _ = F.bevel(beads, px(0.8), chisel=False, angle=LIGHT)
    bead_col = bead_col + (1 - bead_col) * hi[..., None] * 0.8
    return F.stack([
        F.glow_layer(halo * 0.22, '#FFE3C2'),
        F.solid(face_a, face_col),
        F.solid(hair_a * 0.85, PALE),
        F.solid(rings * 0.92, PALE),
        F.solid(shadow * 0.45, DEEP),
        F.solid(edge * 0.55 * tipfade, GILT['deep']),
        F.solid(blades * tipfade, np.clip(col_b, 0, 1)),
        F.solid(beads, np.clip(bead_col, 0, 1)),
    ])


# ====================================================================== 中文


def render_text(C, G, tok):
    """天、圣、城（连同「城」的发丝塔尖）：纸白，右上透朝阳的淡粉金，背光一侧压极淡的铜版细线"""
    A = C.R(G['others'], ss=3)
    px = C.px
    t = np.zeros_like(A)
    for ch in G['chars']:
        if ch['ch'] == '穹':
            continue
        t = np.where(C.R(ch['path']) > 0.01, np.clip((C.YY - ch['top']) / (ch['bottom'] - ch['top']), 0, 1), t)
    col = F.ramp(t, [(0.0, '#FFF6EC'), (0.45, '#F6EFE7'), (0.85, '#E6E4EE'), (1.0, '#D3D4E6')])
    f = facing(A, px(2.0))
    warm = np.clip(f, 0, 1)
    col = col + (F.rgb('#FFD9B8') - col) * (warm * 0.45)[..., None]
    # 朝阳的淡粉金：从右上化进来一层
    src = np.clip((C.XX - 380) / 420, 0, 1) * np.clip(1 - t * 1.3, 0, 1)
    tint = F.diffuse(C.H, C.W, 63, src, cell=46, threshold=0.62, softness=0.16, warp_px=12, edge=0.35, granule=0.3) * A
    col = F.mix(col, F.rgb('#F7D2BC')[None, None], (tint * 0.45)[..., None])
    hi, sh = F.bevel(A, px(1.2), chisel=True, angle=LIGHT, altitude=38)
    shade = np.clip(-f * 0.85 + sh * 0.7, 0, 1)
    col = col * (1 - shade[..., None] * 0.12)
    lines = engrave(C, shade * 0.8, angle=-38, period=2.6) * A
    col = F.mix(col, F.rgb('#8C93B8')[None, None], (lines * 0.32)[..., None])
    col = col + (1 - col) * F.rim_light(A, px(0.7), angle=LIGHT, power=2.2)[..., None] * 0.7
    col = col * (1 + (F.grain(C.H, C.W, 64, 0.7)[..., None] - 0.5) * 0.03)
    fill = F.solid(A, np.clip(col, 0, 1))
    shadow = F.drop_shadow(A, -px(2.0), px(3.0), px(2.4), spread=px(0.6))
    halo = np.clip(F.outer_glow(A, px(10), spread=px(1.0)) - 0.03, 0, 1)
    edge = F.outer_stroke(A, px(1.0))
    return F.stack([F.solid(halo * 0.45, DEEP), F.solid(shadow * 0.8, '#0F1528'), F.solid(edge * 0.7, '#222B4A'), fill])


def _hero(C, G, tok):
    """「穹」：鎏金，背光一侧刻铜版细线；穹顶肋间是水晶青的玻璃，采光亭两扇窗透亮。金和玻璃分两层交出（玻璃入场时单独亮起）"""
    H = C.R(G['hero'], ss=3)
    glass = C.R(G['dome']['glass'], ss=3)
    lamp = C.R(G['dome']['lamp'], ss=3)
    px = C.px
    gb = G['dome']['glass'].bounds
    col = gilt(C, H)
    # 签名字身上一层极淡的朝阳粉，从右上进来
    col = col * (1 + (F.grain(C.H, C.W, 71, 0.7)[..., None] - 0.5) * 0.05)
    fill = F.solid(H, np.clip(col, 0, 1))
    # 玻璃：上浅下深的水晶青，像水彩一样在玻璃里化开、带颗粒；右侧一道弧形反光
    tg = np.clip((C.YY - gb[1]) / max(1, gb[3] - gb[1]), 0, 1)
    gcol = F.ramp(tg, [(0, '#D6FBF5'), (0.4, '#8FE9E2'), (1.0, '#3E9FB0')])
    src = np.clip(1 - tg * 0.6, 0, 1) * glass
    gw = F.diffuse(C.H, C.W, 72, src, cell=18, threshold=0.5, softness=0.2, warp_px=5, edge=0.8, granule=0.55)
    gcol = F.mix(gcol, F.rgb('#5FCFD2')[None, None], (gw * 0.35)[..., None])
    cxg = (gb[0] + gb[2]) / 2
    rr = np.sqrt(((C.XX - cxg) / ((gb[2] - gb[0]) * 0.36)) ** 2 + ((C.YY - gb[3]) / ((gb[3] - gb[1]) * 0.86)) ** 2)
    refl = np.exp(-((rr - 1.0) / 0.07) ** 2) * (C.XX > cxg + 4) * glass
    gcol = gcol + (1 - gcol) * (refl * 0.75)[..., None]
    lamp_l = F.stack([F.glow_layer(F.blur(lamp, px(2.0)) * 0.9, CRYSTAL), F.solid(lamp, '#E6FFFB')])
    shadow = F.drop_shadow(H, -px(2.0), px(3.0), px(2.6), spread=px(0.6))
    halo = np.clip(F.outer_glow(H, px(12), spread=px(1.2)) - 0.03, 0, 1)
    edge = F.outer_stroke(H, px(1.0))
    under = 1 - glass                    # 金的晕、影、描边原本都压在玻璃下面：玻璃那里不画，叠出来和原先一样
    return {'gilt': F.stack([F.solid(halo * 0.4 * under, DEEP), F.solid(shadow * 0.85 * under, '#0F1528'),
                             F.solid(edge * 0.75 * under, GILT['deep']), fill]),
            # 玻璃压在金上面一层（入场时单独亮起）：只留金以外的部分，叠出来和原先“玻璃在金下面”一样
            'glass': F.stack([F.solid(glass * 0.92 * (1 - H), np.clip(gcol, 0, 1)), lamp_l])}


_HERO = {}


def _hero_parts(C, G, tok):
    k = (id(C), id(G))
    if k not in _HERO:
        _HERO.clear()
        _HERO[k] = _hero(C, G, tok)
    return _HERO[k]


def render_hero(C, G, tok):
    return _hero_parts(C, G, tok)['gilt']


def render_glass(C, G, tok):
    """穹顶肋间的玻璃、采光亭的窗（叠在金的上面）"""
    return _hero_parts(C, G, tok)['glass']


# ====================================================================== 锚链、底线带


def _beads(C, circles, px):
    m = C.zeros()
    for (x, y, r) in circles:
        m = np.maximum(m, C.R(circle(x, y, r), ss=3))
    col = np.zeros((C.H, C.W, 3), np.float32) + F.rgb(PALE)
    hi, sh = F.bevel(m, px(0.9), chisel=False, angle=LIGHT, altitude=40)
    col = col + (1 - col) * hi[..., None] * 0.85
    col = col * (1 - sh[..., None] * 0.45)
    return m, np.clip(col, 0, 1)


def render_rule(C, G, tok):
    """底线带那道发丝和它的珠点（锚链落下来以后，从水晶珠往两边铺开）"""
    px = C.px
    beads, bcol = _beads(C, G['dots'], px)
    rule = C.R(G['rule'], ss=3)
    sd = F.drop_shadow(np.maximum(beads, rule), -px(0.8), px(1.2), px(0.8))
    return F.stack([F.solid(sd * 0.6, DEEP), F.solid(rule * 0.9, PALE), F.solid(beads, bcol)])


def render_chain(C, G, tok):
    """锚链：从「弓」的钩尖垂下来的一串珠，末端一颗水晶珠"""
    px = C.px
    beads, bcol = _beads(C, G['chain'], px)
    # 水晶珠：两头尖的晶体，竖着挂，分四个面
    cx, cy = G['crystal']
    hgt, wid = 9.5, 5.2
    facets = [poly([(cx, cy - hgt), (cx - wid, cy - 1.5), (cx, cy)]), poly([(cx, cy - hgt), (cx, cy), (cx + wid, cy - 1.5)]),
              poly([(cx - wid, cy - 1.5), (cx, cy + hgt * 0.85), (cx, cy)]), poly([(cx, cy), (cx, cy + hgt * 0.85), (cx + wid, cy - 1.5)])]
    fm = [C.R(f, ss=3) for f in facets]
    crys = np.clip(sum(fm), 0, 1)
    ccol = np.zeros((C.H, C.W, 3), np.float32)
    for m, c_ in zip(fm, ('#9FF1EA', '#E8FFFC', '#2F8FA2', '#5FD3D3')):
        ccol = ccol + F.rgb(c_) * m[..., None]
    ccol = ccol / np.maximum(crys, 1e-4)[..., None]
    sd = F.drop_shadow(beads, -px(0.8), px(1.2), px(0.8))
    return F.stack([
        F.solid(sd * 0.6, DEEP),
        F.solid(beads, bcol),
        F.glow_layer(F.blur(crys, px(4)) * 0.7, CRYSTAL),
        F.solid(F.outer_stroke(crys, px(0.6)) * 0.6, '#123A4A'),
        F.solid(crys, np.clip(ccol, 0, 1)),
    ])


def render_en(C, G, tok):
    m = C.R(G['caps'], ss=3)
    sd = F.drop_shadow(m, -C.px(0.6), C.px(1.0), C.px(0.8))
    back = np.clip(F.outer_glow(m, C.px(4), spread=C.px(2.5)) * 1.4, 0, 1)
    return F.stack([F.solid(back * 0.75, '#222A4C'), F.solid(sd * 0.7, DEEP), F.solid(m * 0.95, '#F3E7D6')])


# ====================================================================== 高光


def render_fx(C, G, tok):
    """光刃尖上几粒闪光、穹顶玻璃周围几粒晶尘（水晶青，呼应）、水晶珠上一点亮"""
    out = []
    E = G['gloria']
    tips = C.zeros()
    for i, (x, y) in enumerate(E['tips']):
        if i % 2 == 0:
            tips = np.maximum(tips, np.exp(-(((C.XX - x) ** 2 + (C.YY - y) ** 2) / 3.0)))
    out.append(F.glow_layer(tips * 0.9, '#FFF1D2'))
    # 晶尘：穹顶玻璃透出来的水晶青，在日轮里散成一层细颗粒（越近穹顶越密），点缀色像纹理一样化开
    c = G['C']
    r, th = C.polar(c)
    E = G['gloria']
    glass = C.R(G['dome']['glass'])
    hero = C.R(G['hero'])
    inside = (r < E['R'] - 3) * (C.YY < c[1] - 2)
    dens = np.exp(-np.maximum(r - 30, 0) / 22.0) * inside * np.clip(1 - hero * 1.5 - glass, 0, 1)
    fine = F.sparkles(C.H, C.W, 81, dens, 220, size=(0.35, 0.85), flare=0.0)
    big = F.sparkles(C.H, C.W, 83, dens, 10, size=(0.9, 1.5), flare=0.3)
    out.append(F.glow_layer(np.clip(fine * 0.9 + big * 0.95, 0, 1.2), '#A6F4EE'))
    x, y = G['crystal']
    g = np.exp(-(((C.XX - x - 1.2) ** 2 + (C.YY - y + 3.5) ** 2) / 1.6))
    out.append(F.glow_layer(g * 1.2, '#F2FFFD'))
    cd = F.sparkles(C.H, C.W, 82, np.exp(-(((C.XX - x) / 22) ** 2 + ((C.YY - y) / 14) ** 2)), 7, size=(0.5, 1.1), flare=0)
    out.append(F.glow_layer(cd * 0.8, '#9FF5EE'))
    return F.stack(out)


# ====================================================================== 小形态


def gilt_small(C, mask, tone):
    if tone in ('ink', 'stamp-ink'):
        col = ycol(C, 0, C.h, [(0, '#B8782F'), (1, '#6A4018')])
    else:
        col = ycol(C, 0, C.h, [(0, '#FBD99A'), (0.5, '#E9A550'), (1, '#9A6224')])
    hi, sh = F.bevel(mask, C.px(0.9), chisel=True, angle=LIGHT, altitude=40)
    col = col + (1 - col) * hi[..., None] * 0.55
    col = col * (1 - sh[..., None] * 0.4)
    return F.solid(mask, np.clip(col, 0, 1))

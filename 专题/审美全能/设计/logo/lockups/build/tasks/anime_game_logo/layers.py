"""10 二次元游戏Logo · 颜色层：每层一个 render(C, G, tok) -> 预乘 RGBA。

颜色角色（报告 2.4，亮底）：
  字面色    铅墨（tok.ink）：中文和底线带。字边一圈吃墨略深、字心略透；压进纸里——背光一侧的纸墙一线暗、受光一侧一线亮
  主题色    校样纸（tok.world / worldPale）：撕边底板是另一种略深的校样纸，毛边一圈白纤维；花饰圈住的那片是灯下的暖白
  阴影      纸的暖灰（worldDeep 的淡调），不用黑
  高光      镭射箔：银底，镀铬式的明暗（亮天、暗地平线、沉地）是干净的银灰阶；彩虹只在最亮的几道斜峰上出现，暗处没有颜色
  点缀色    校对红（tok.lit）：圈住 g 的红圈为主；引线、turn 批注和转向记号为呼应；红墨在纸里洇开一点点
  共用金属  镭射箔（Logo、花饰、套准靶标同一块料）
光从左上来（排字房的暖灯在左上），一盏。
"""
import math
import numpy as np
import cv2
from lockupkit import fx as F
from lockupkit.geom import union, star4
from .draw import ribbon_long

LIGHT_ANGLE = 135          # fx 的光：从右边逆时针算，135 = 左上


# ====================================================================== 共用：压印、箔

def deboss(C, A, d=1.1, soft=0.6):
    """压进纸里：字外背光一侧（左上）一线暗、受光一侧（右下）一线亮。返回 (暗, 亮) 两张覆盖率（只在字外）"""
    dk = np.clip(F.shift(A, -C.px(d), -C.px(d)) - A, 0, 1)
    lt = np.clip(F.shift(A, C.px(d * 0.9), C.px(d * 0.9)) - A, 0, 1)
    return F.blur(dk, C.px(soft)), F.blur(lt, C.px(soft * 0.7))


def hsv_rgb(h, s, v):
    """色相 h（0–1，H×W）→ RGB"""
    h6 = (h % 1.0) * 6.0
    c = v * s
    x = c * (1 - np.abs(h6 % 2 - 1))
    z = np.zeros_like(h6)
    conds = [(h6 < 1), (h6 < 2), (h6 < 3), (h6 < 4), (h6 < 5), (h6 >= 5)]
    rs = [c, x, z, z, x, c]
    gs = [x, c, c, x, z, z]
    bs = [z, z, x, c, c, x]
    r = np.select(conds, rs)
    g = np.select(conds, gs)
    b = np.select(conds, bs)
    m = v - c
    return np.stack([r + m, g + m, b + m], -1).astype(np.float32)


SILVER = [(0.0, '#3C4049'), (0.28, '#626874'), (0.5, '#959BA6'), (0.7, '#C9CDD4'), (0.86, '#E8EAEE'), (1.0, '#FFFFFF')]


def foil(C, A, seed=1, band=(-38, 210), y0=150, y1=390, spec=0.75, bevel_px=1.3, rim=0.7, chrome=1.0):
    """镭射烫印的面：返回颜色（H×W×3，未乘 A）。
    明暗像镀铬（chrome 控制强弱）：上半是亮的“天”，一道窄的暗“地平线”，下半是沉一点的“地”，近底边回亮一线；
    再叠一组斜向的窄反光峰——银灰阶干净，最亮处只是几道斜的峰。
    彩：只在最亮的峰上出来（明度 > 0.82）——沿斜向一道道细的彩虹纹（衍射光栅），峰心发白；暗处、中间调一点颜色都没有。"""
    XX, YY = C.XX, C.YY
    ang = math.radians(band[0])
    u = (XX * math.cos(ang) + YY * math.sin(ang)) / band[1]
    ty = np.clip((YY - y0) / (y1 - y0), 0, 1)
    n = F.fbm(C.H, C.W, 160, seed, octaves=3)
    sky = 0.70 - 0.26 * ty
    horizon = np.exp(-((ty - 0.55) / 0.075) ** 2) * 0.48
    ground = F.smoothstep(0.5, 0.62, ty) * 0.16 - F.smoothstep(0.86, 1.0, ty) * 0.16
    base = sky - (horizon + ground) * chrome + (n - 0.5) * 0.08
    crest = np.clip(np.cos(2 * np.pi * u + 0.6), 0, 1) ** 8 * 0.50 + np.clip(np.cos(2 * np.pi * u * 1.7 + 2.4), 0, 1) ** 14 * 0.28
    V = np.clip(base + crest * (1 - 0.6 * ty), 0, 1)
    col = F.ramp(V, SILVER)
    # 衍射彩纹：色相沿另一斜向快速循环（一道道细纹），只在最亮的峰上；峰心发白
    ang2 = math.radians(band[0] + 70)
    u2 = (XX * math.cos(ang2) + YY * math.sin(ang2))
    hue = u2 / 42.0 + (F.fbm(C.H, C.W, 120, seed + 7, octaves=2) - 0.5) * 0.5
    rb = hsv_rgb(hue, 0.46, 1.0)
    m = F.smoothstep(0.80, 0.92, V) * (1 - F.smoothstep(0.97, 1.0, V) * 0.7) * spec
    col = col * (1 - m[..., None]) + rb * m[..., None]
    # 镭射颗粒：中高光里稀稀的一层彩色小闪粒（箔面的衍射颗粒），暗处没有
    gl = F.sparkles(C.H, C.W, seed + 31, A * F.smoothstep(0.55, 0.8, V), int(A.sum() / (C.scale ** 2) / 90) + 1,
                    size=(0.35, 0.8), flare=0)
    gh = hsv_rgb(hue * 1.7 + 0.3, 0.5, 1.0)
    col = col + (gh - col) * np.clip(gl * 0.55, 0, 1)[..., None]
    col = col * (1 + (F.grain(C.H, C.W, seed + 3, 0.5)[..., None] - 0.5) * 0.035)
    # 斜面：压印时箔边被压圆一点——受光边一线亮、背光边一线沉
    hi, sh = F.bevel(A, C.px(bevel_px), chisel=True, angle=LIGHT_ANGLE, altitude=38)
    col = col + (1 - col) * hi[..., None] * 0.6
    col = col * (1 - sh[..., None] * 0.45)
    # 箔边一线墨色的细边（纸墙的影），把银从纸上分出来
    edge = np.clip(1 - F.dist_in(A) / C.px(0.95), 0, 1) * (A > 0.02)
    col = col * (1 - edge[..., None] * rim) + F.rgb('#2A2A30') * edge[..., None] * rim * 0.9
    return np.clip(col, 0, 1)


# ====================================================================== 底板

def render_plate(C, G, tok):
    """撕边底板：一张另一种纸（略深的校样纸）撕下来垫在下面——毛边一圈白的纸纤维、身下一道软影；
    花饰圈住的那片是灯下的纸，暖、亮；圈外的纸往外沉一点；纸里零星几片烫印时飞出来的箔屑。"""
    XX, YY, px = C.XX, C.YY, C.px
    sw = C.R(G['swash'], ss=2)
    P = G['swash_P']
    inside = np.zeros((C.H, C.W), np.uint8)
    pts = np.round(np.concatenate([P, P[:1]]) * C.scale).astype(np.int32)
    cv2.fillPoly(inside, [pts.reshape(-1, 1, 2)], 1)
    inside = inside.astype(np.float32)
    # 纸的形：几团椭圆合起来，边被噪声撕开（大的起伏 + 细的锯齿）
    blobs = [(620, 292, 585, 148), (350, 302, 290, 126), (900, 252, 330, 158), (1110, 196, 96, 108)]
    shape = np.maximum.reduce([np.clip(1.15 - (((XX - x) / rx) ** 2 + ((YY - y) / ry) ** 2), 0, 1) for x, y, rx, ry in blobs])
    big = F.warp(F.fbm(C.H, C.W, 120, 51, octaves=3), F.fbm(C.H, C.W, 160, 52), F.fbm(C.H, C.W, 160, 53), px(24))
    tear = F.fbm(C.H, C.W, 5, 54, octaves=3, aniso=(0.5, 1.8))
    field = shape + (big - 0.5) * 0.30 + (tear - 0.5) * 0.07
    M = F.smoothstep(0.195, 0.205, field)
    # 纸面：另一种校样纸，比页面暖、深一档；纤维极淡
    fib = F.fbm(C.H, C.W, 14, 55, octaves=3, aniso=(4.0, 0.5))
    base = F.mix(F.rgb(tok['world']), F.rgb('#E9D9BC'), 0.35)
    col = np.broadcast_to(base, (C.H, C.W, 3)).copy()
    col = col * (1 + (fib[..., None] - 0.5) * 0.022)
    edge_d = F.dist_in(M) / C.scale
    col = col * (1 - np.exp(-edge_d / 18)[..., None] * 0.035)
    # 灯下的那片：花饰里面亮、暖（光色），从 Logo 往左淡下去
    lit = F.blur(inside, px(5)) * (0.6 + 0.4 * np.exp(-(((XX - 820) / 620) ** 2 + ((YY - 260) / 220) ** 2)))
    col = F.mix(col, F.mix(F.rgb('#FFFCF5'), F.rgb(tok['light']), 0.16), lit[..., None] * 0.9)
    # 撕边：一圈细的白纤维毛边（只在纸外沿），身下一道软影（暖灰，往右下）
    fringe = np.clip(F.dilate(M, px(1.2)) - M, 0, 1) * F.smoothstep(0.3, 0.7, F.fbm(C.H, C.W, 2.5, 56, octaves=2))
    shadow = F.blur(F.shift(M, px(2.5), px(4)), px(6)) * (1 - M)
    return F.stack([F.solid(shadow * 0.18, tok['worldDeep']), F.solid(M, np.clip(col, 0, 1)), F.solid(fringe * 0.95, '#FFFEFA')])


# ====================================================================== 主体元素：套准靶标

def render_emblem(C, G, tok):
    E = G['emblem']
    c = E['c']
    parts = [C.R(E[k], ss=3) for k in ('hair_ring', 'ticks', 'band', 'core', 'core_ring', 'cross')]
    A = np.maximum.reduce(parts)
    col = foil(C, A, seed=5, y0=c[1] - E['R'], y1=c[1] + E['R'], spec=0.7, bevel_px=0.9, rim=0.5)
    dk, lt = deboss(C, A, d=0.9)
    sh = F.drop_shadow(A, C.px(0.6), C.px(0.9), C.px(0.8))
    return F.stack([F.solid(sh * 0.16, tok['worldDeep']), F.solid(dk * 0.35, tok['worldDeep']), F.solid(lt * 0.8, '#FFFFFF'),
                    F.solid(A, col)])


# ====================================================================== 中文：铅墨

def render_text(C, G, tok):
    A = C.R(G['cn'], ss=3)
    px = C.px
    ink = F.rgb(tok['ink'])
    dA = F.dist_in(A)
    # 字心略透（铅印的墨在粗笔画中间薄一点），带极细的印刷颗粒；字边一圈吃墨略深
    core = F.smoothstep(px(1.6), px(5.0), dA)
    col = np.broadcast_to(ink, (C.H, C.W, 3)).copy()
    col = col + (F.rgb('#4A4A52') - col) * (core * 0.22)[..., None]
    col = col * (1 + (F.grain(C.H, C.W, 61, 0.5)[..., None] - 0.5) * 0.06)
    rim = np.clip(1 - dA / px(0.9), 0, 1) * (A > 0.02)
    col = col * (1 - rim[..., None] * 0.25) + F.rgb('#17171B') * rim[..., None] * 0.25
    # 竖向一点冷暖：上沿略冷、字脚略暖（排字房的暖灯从上面来，墨的反光）
    col = col + (F.rgb('#2E2B2A') - col) * np.clip((C.YY - 240) / 100, 0, 1)[..., None] * 0.35
    dk, lt = deboss(C, A, d=1.0)
    return F.stack([F.solid(dk * 0.32, tok['worldDeep']), F.solid(lt * 0.9, '#FFFFFF'), F.solid(A, np.clip(col, 0, 1))])


# ====================================================================== 主字：镭射箔的 Logo

def render_hero(C, G, tok):
    LG = G['logo']
    A = C.R(LG['word'], ss=3)
    col = foil(C, A, seed=11, y0=LG['L_box'][1], y1=LG['g_box'][3])
    dk, lt = deboss(C, A, d=1.3)
    sh = F.drop_shadow(A, C.px(0.8), C.px(1.4), C.px(1.6))
    return F.stack([F.solid(sh * 0.14, tok['worldDeep']), F.solid(dk * 0.4, tok['worldDeep']), F.solid(lt * 0.9, '#FFFFFF'),
                    F.solid(A, col)])


def render_swash(C, G, tok):
    """L 的花饰（和 Logo 同一块箔）与网点梯尺（实心银珠，迎光一侧一点亮）"""
    A = C.R(G['swash'], ss=3)
    col = foil(C, A, seed=13, band=(-30, 300), y0=120, y1=440, spec=0.8, bevel_px=0.8, rim=0.5, chrome=0.0)
    dk, lt = deboss(C, A, d=0.8)
    Bd = C.R(G['beads'], ss=3)
    hi, sh = F.bevel(Bd, C.px(0.9), chisel=False, angle=LIGHT_ANGLE, altitude=40)
    bcol = np.broadcast_to(F.rgb('#8E949E'), (C.H, C.W, 3)).copy()
    bcol = bcol + (1 - bcol) * hi[..., None] * 0.9
    bcol = bcol * (1 - sh[..., None] * 0.5)
    bdk, blt = deboss(C, Bd, d=0.6)
    return F.stack([F.solid(np.maximum(dk, bdk) * 0.3, tok['worldDeep']), F.solid(np.maximum(lt, blt) * 0.8, '#FFFFFF'),
                    F.solid(A, col), F.solid(Bd, np.clip(bcol, 0, 1))])


# ====================================================================== 英文

def render_en(C, G, tok):
    A = C.R(G['caps'], ss=3)
    dk, lt = deboss(C, A, d=0.6)
    return F.stack([F.solid(lt * 0.7, '#FFFFFF'), F.solid(A * 0.92, tok['ink'])])


# ====================================================================== 校对红

def red_stroke(P, w0, w1, start_taper=18, end_taper=26):
    s = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(P, axis=0), axis=1))])
    tot = s[-1]
    w = w0 + (w1 - w0) * (0.5 + 0.5 * np.sin(s / 37.0))
    w = w * np.clip(s / start_taper, 0.35, 1) ** 0.6 * np.clip((tot - s) / end_taper, 0.15, 1) ** 0.6
    return ribbon_long(P, w)


def render_red(C, G, tok):
    red = F.rgb(tok['lit'])
    loop = red_stroke(G['red_loop'], 2.1, 3.0)
    lead = red_stroke(G['red_lead'], 1.6, 2.0, 6, 10)
    turn = red_stroke(G['red_turn'], 1.7, 2.1, 6, 6)
    tp = G['red_turn']
    e, b = tp[-1], tp[-4]
    d = (e - b) / (np.linalg.norm(e - b) + 1e-9)
    nrm = np.array([-d[1], d[0]])
    from lockupkit.geom import poly
    head = poly([tuple(e + d * 6), tuple(e - d * 2 + nrm * 4.2), tuple(e - d * 2 - nrm * 4.2)])
    A = np.maximum.reduce([C.R(loop, ss=3), C.R(lead, ss=3), C.R(union(turn, head), ss=3), C.R(G['red_note'], ss=3)])
    # 红墨：笔画交叠和起收笔处积得深一点；边上往纸里洇一丝
    pool = F.blur(A, C.px(1.4))
    col = np.broadcast_to(red, (C.H, C.W, 3)).copy()
    col = col * (1 - np.clip(pool - 0.75, 0, 1)[..., None] * 0.6)
    bleed = np.clip(F.blur(A, C.px(0.9)) - A, 0, 1)
    return F.stack([F.solid(bleed * 0.35, tok['lit']), F.solid(A * 0.95, col)])


def small_face(C, mask, tone):
    """小形态里的 Logo：同一块镭射箔，小字号只留银的明暗和一两道彩"""
    rows = np.where(mask.max(axis=1) > 0.05)[0]
    y0, y1 = (rows[0], rows[-1]) if len(rows) else (0, C.H)
    col = foil(C, mask, seed=11, band=(-38, 60), y0=y0 / C.scale, y1=y1 / C.scale, spec=0.8, bevel_px=0.5, rim=0.6)
    if tone in ('ink', 'stamp-ink'):
        col = col * 0.82
    return F.solid(mask, col)


# ====================================================================== 星芒（全件唯一）与箔的闪点

def render_glint(C, G, tok):
    XX, YY = C.XX, C.YY
    sx, sy = G['star_at']
    st = C.R(star4(sx, sy, 15, 0.12, ry=24), ss=3)
    st2 = C.R(star4(sx, sy, 6.5, 0.2, rot=45), ss=3)
    d2 = (XX - sx) ** 2 + (YY - sy) ** 2
    core = np.exp(-d2 / 6.0)
    # 星身：白芯，四芒的边上一丝彩（和箔同一种光）
    hue = np.arctan2(YY - sy, XX - sx) / (2 * np.pi) + 0.5
    fringe = np.clip(F.blur(st, C.px(1.0)) - st, 0, 1)
    rb = hsv_rgb(hue + np.sqrt(d2) * 0.03, 0.55, 1.0)
    out = [
        F.solid(np.exp(-d2 / 300.0) * 0.28, '#FFF4DE'),
        F.solid(fringe * 0.7, rb),
        F.solid(np.clip(st + st2 * 0.8, 0, 1), '#FFFFFF'),
        F.solid(np.clip(core, 0, 1), '#FFFFFF'),
    ]
    # 箔的闪点：Logo 和靶标的亮处零星几粒带十字小芒
    LG = G['logo']
    A = np.maximum(C.R(LG['word']), C.R(G['emblem']['band']))
    sp = F.sparkles(C.H, C.W, 91, F.erode(A, C.px(2)) * np.clip(1.2 - (YY - 160) / 200, 0, 1), 4, size=(0.6, 1.2), flare=0.3)
    out.append(F.glow_layer(sp * 0.9, '#FFFFFF'))
    return F.stack(out)

"""04 · 颜色层：每层一个 render(C, G, tok) -> 预乘 RGBA。光从左上来，一盏。

颜色角色（报告 2.4）：
  字面      B200 蚀刻裸铜：玫瑰色、横向拉丝、中间细往外粗的蚀刻网点、粗处一道蚀刻内线；中文是冷奶白的丝印油墨
  主题色    电路板墨绿：底板（阻焊层，哑光，看得见的方格只在板上）、晶圆
  阴影      墨绿的暗调（不用纯黑）
  高光      铜面受光的边、星芒
  点缀      琥珀：信号灯为主；晶粒里两格、沿基线走线跑过去的那段光、灯旁边板上一小片像热图一样晕开的格子
  共用金属  浅金（化金）：过孔、焊盘、晶圆外缘、晶粒封边
"""
import math
import numpy as np
import cv2
from lockupkit import fx as F
from lockupkit.geom import union, rect, circle, poly, stroke_line, ring

SHADOW = '#03100B'
EDGE = '#061510'
GOLD = [(0.0, '#FFF3D0'), (0.35, '#EFD596'), (0.7, '#C9A35E'), (1.0, '#8E6B33')]


def lum_t(C, top, bottom):
    return np.clip((C.YY - top) / max(1.0, bottom - top), 0, 1)


def halftone(C, pitch, radius, angle=0.0):
    """网点：每格一个圆点，radius 是每个像素所在格子的点半径（舞台像素，H×W）。返回覆盖率"""
    p = pitch
    a = math.radians(angle)
    X = C.XX * math.cos(a) + C.YY * math.sin(a)
    Y = -C.XX * math.sin(a) + C.YY * math.cos(a)
    u = (X / p) % 1.0 - 0.5
    v = (Y / p) % 1.0 - 0.5
    d = np.sqrt(u * u + v * v) * p
    aa = 0.5 / C.scale
    return np.clip((radius - d) / (2 * aa) + 0.5, 0, 1)


def gold_disc(C, vias, light=(-0.55, -0.8)):
    """过孔、焊盘：化金的圆环，钻孔是暗的，左上一点高光"""
    ring_m = C.zeros()
    hole_m = C.zeros()
    col = np.zeros((C.H, C.W, 3), np.float32)
    for v in vias:
        x, y, r, h = v['x'], v['y'], v['r'], v['hole']
        m = C.R(circle(x, y, r), ss=4)
        hm = C.R(circle(x, y, h), ss=4)
        dx, dy = (C.XX - x) / r, (C.YY - y) / r
        t = np.clip(0.5 + 0.5 * (dx * light[0] + dy * light[1]) * -1, 0, 1)
        c = F.ramp(1 - t, GOLD)
        col = np.where(m[..., None] > 0, c, col)
        ring_m = np.maximum(ring_m, m)
        hole_m = np.maximum(hole_m, hm)
    hi, sh = F.bevel(ring_m, C.px(0.9), chisel=True, angle=120, altitude=40)
    col = col + (1 - col) * hi[..., None] * 0.6
    col = col * (1 - sh[..., None] * 0.35)
    gold = F.solid(ring_m, np.clip(col, 0, 1))
    # 钻孔：暗，上沿一道内阴影
    hole_col = np.zeros((C.H, C.W, 3), np.float32) + F.rgb('#050D09')
    inner = F.inner_shadow(hole_m, 0, C.px(0.8), C.px(0.6))
    hole = F.stack([F.solid(hole_m, hole_col), F.solid(inner * 0.5, '#000000')])
    return gold, hole, ring_m, hole_m


COPPER_RAMP = [(0.0, '#FFE2CC'), (0.14, '#F6BC9E'), (0.34, '#DB8F70'), (0.5, '#B9674B'), (0.62, '#CB7D5F'), (0.8, '#A0533A'), (1.0, '#7A3826')]


def copper(C, A, top, bottom, seed=3, brush=0.07):
    """一块蚀刻裸铜的面色（未乘覆盖率）：竖向的铜色带（COPPER_RAMP；入场的覆铜也用它）+ 一道环境反光 + 横向拉丝"""
    t = lum_t(C, top, bottom)
    col = F.ramp(t, COPPER_RAMP)
    br = F.fbm(C.H, C.W, 34, seed, octaves=4, aniso=(9.0, 0.08))
    col = col * (1 + (br[..., None] - 0.5) * brush * 2)
    fine = F.fbm(C.H, C.W, 6, seed + 1, octaves=2, aniso=(10.0, 0.1))
    col = col * (1 + (fine[..., None] - 0.5) * 0.05)
    return col


# ====================================================================== B200


def render_hero(C, G, tok):
    A = C.R(G['hero'], ss=4)
    body = C.R(G['hero_body'], ss=4)
    bx0, by0, bx1, by1 = G['b_box']
    px = C.px
    col = copper(C, A, by0 + 6, by1 - 2)
    # 蚀刻网点：只在粗的铺铜上；中间细，往两头一级级变粗（作品里“精度一级级降低”）
    dA = F.dist_in(body)
    local = cv2.dilate(dA, np.ones((int(px(12)), int(px(12))), np.uint8))
    thick = F.smoothstep(px(7), px(10), local) * F.smoothstep(px(2.2), px(3.6), dA)
    cxm = (bx0 + bx1) / 2
    dn = np.clip(np.abs(C.XX - cxm) / ((bx1 - bx0) / 2), 0, 1)
    rad = 0.35 + 1.05 * dn ** 1.4
    dots = halftone(C, 4.4, rad, angle=45) * thick
    col = col * (1 - dots[..., None] * 0.26) + F.rgb('#4A2014') * (dots[..., None] * 0.1)
    # 蚀刻内线：粗处离边 3.2px 一道暗线（铺铜里的隔离线），下面一线亮
    groove = np.exp(-((dA - px(3.3)) / px(0.42)) ** 2) * F.smoothstep(px(8.5), px(11), local)
    ridge = np.exp(-((dA - px(4.1)) / px(0.38)) ** 2) * F.smoothstep(px(8.5), px(11), local)
    col = col * (1 - groove[..., None] * 0.5)
    col = col + (F.rgb('#FFD9C2') - col) * (ridge[..., None] * 0.22)
    # 斜面、受光边
    hi, sh = F.bevel(A, px(1.3), chisel=True, angle=120, altitude=36)
    col = col + (F.rgb('#FFE6D4') - col) * hi[..., None] * 0.6
    col = col * (1 - sh[..., None] * 0.4) + F.rgb('#3A160D') * sh[..., None] * 0.4
    col = col + (1 - col) * F.rim_light(A, px(0.7), angle=120, power=2.2)[..., None] * 0.7
    fill = F.solid(body, np.clip(col, 0, 1))
    gold, hole, _, _ = gold_disc(C, G['vias'])
    # 字外：铜箔的厚（往右下挤 2px 暗铜）、暗边、墨绿的投影
    ext = C.zeros()
    ext_c = np.zeros((C.H, C.W, 3), np.float32)
    steps = int(px(2.2))
    for i in range(steps, 0, -1):
        m = F.shift(A, i * 0.45, i * 1.0)
        c_ = F.mix(F.rgb('#6B3020'), F.rgb('#2A0F08'), i / steps)
        ext_c = ext_c * (1 - m[..., None]) + c_ * m[..., None]
        ext = np.maximum(ext, m)
    ext = ext * (1 - A)
    k1 = F.outer_stroke(A, px(1.0))
    shadow = F.drop_shadow(A, px(2.0), px(4.0), px(4.0), spread=px(1.0))
    halo = F.outer_glow(A, px(14), spread=px(2), gain=1.0)
    return F.stack([F.solid(halo * 0.55, tok['worldDeep']), F.solid(shadow * 0.8, SHADOW),
                    F.solid(np.clip(k1 + A, 0, 1), EDGE), F.solid(ext, ext_c), fill, gold, hole])


def copper_small(C, mask, tone):
    """小形态的签名字 B200：一层铜，竖向铜色带、细斜面"""
    rows = np.where(mask.max(axis=1) > 0.05)[0]
    y0, y1 = (rows[0], rows[-1]) if len(rows) else (0, C.H - 1)
    t = np.clip((np.arange(C.H, dtype=np.float32)[:, None] - y0) / max(1, y1 - y0), 0, 1)
    t = np.broadcast_to(t, (C.H, C.W))
    if tone in ('ink', 'stamp-ink'):
        col = F.ramp(t, [(0, '#9A5038'), (0.5, '#7A3826'), (1, '#5C2618')])
    else:
        col = F.ramp(t, [(0, '#F4C4A6'), (0.3, '#DB9478'), (0.55, '#B0634A'), (0.75, '#C2775A'), (1, '#86412D')])
    hi, sh = F.bevel(mask, C.px(0.8), chisel=True, angle=120, altitude=40)
    col = col + (1 - col) * hi[..., None] * 0.45
    col = col * (1 - sh[..., None] * 0.3)
    return F.solid(mask, np.clip(col, 0, 1))


# ====================================================================== 晶粒（第二个 0 的字腔）


def render_die(C, G, tok, part):
    """晶粒，分两层：'base' 硅片、封边、引线（没通电的样子）；'cells' 点阵、两格琥珀、正中的光（通电时一格格亮起）"""
    D = G['die']
    x0, y0, x1, y1 = D['box']
    px = C.px
    body = C.R(rect(x0, y0, x1, y1), ss=4)
    cx, cy = D['center']
    # 硅片：近黑的墨绿，斜着一道冷的反光
    t = np.clip(((C.XX - x0) + (C.YY - y0)) / ((x1 - x0) + (y1 - y0)), 0, 1)
    col = F.ramp(t, [(0, '#163A2E'), (0.45, '#0C2019'), (1, '#07130F')])
    sheen = np.exp(-(((C.XX - x0) - (C.YY - y0) * 0.55 - 10) / 9.0) ** 2) * 0.12
    col = col + F.rgb('#7FC4AC') * sheen[..., None]
    die = F.solid(body, col)
    # 封边：一道浅金的发丝，往里 1.2px
    seal = np.clip(C.R(rect(x0 + 1.2, y0 + 1.2, x1 - 1.2, y1 - 1.2), ss=4) - C.R(rect(x0 + 2.2, y0 + 2.2, x1 - 2.2, y1 - 2.2), ss=4), 0, 1)
    # 点阵：5 列，格子正中最细、往外一级级变粗；两格琥珀
    cols = 5
    cw = (x1 - x0 - 6) / cols
    rows = int((y1 - y0 - 6) / cw)
    ch = (y1 - y0 - 6) / rows
    sq, amb = [], []
    mid_c, mid_r = (cols - 1) / 2, (rows - 1) / 2
    amber_cells = {(1, rows // 2 - 3), (3, rows // 2 + 4)}
    for i in range(cols):
        for j in range(rows):
            u = abs(i - mid_c) / max(1, mid_c)
            v = abs(j - mid_r) / max(1, mid_r)
            d = min(1.0, math.hypot(u * 0.8, v))
            s = (0.34 + 0.5 * d ** 1.1) * min(cw, ch)
            qx = x0 + 3 + (i + 0.5) * cw
            qy = y0 + 3 + (j + 0.5) * ch
            r_ = rect(qx - s / 2, qy - s / 2, qx + s / 2, qy + s / 2)
            (amb if (i, j) in amber_cells else sq).append(r_)
    sq_m = C.R(union(sq), ss=4)
    amb_m = C.R(union(amb), ss=4)
    r_c = np.sqrt((C.XX - cx) ** 2 + (C.YY - cy) ** 2)
    pow_ = np.exp(-(r_c / 46.0) ** 2)
    sq_col = F.mix(F.ramp(lum_t(C, y0, y1), [(0, '#E9B892'), (0.5, '#C98762'), (1, '#9C5A3E')]), F.rgb('#FFE7C8')[None, None], (pow_ * 0.55)[..., None])
    hi, sh = F.bevel(sq_m, px(0.5), chisel=True, angle=120, altitude=45)
    sq_col = sq_col + (1 - sq_col) * hi[..., None] * 0.4
    cells = F.solid(sq_m, np.clip(sq_col, 0, 1))
    amber = F.solid(amb_m, F.rgb('#FFC870'))
    amb_glow = F.glow_layer(F.blur(amb_m, px(2.2)) * 0.9, tok['lit'])
    core = F.glow_layer(np.exp(-(r_c / 10.0) ** 2) * 0.9 * body, '#FFF0D6')
    leads_m = C.R(D['leads'], ss=4)
    leads = F.solid(leads_m, F.ramp(lum_t(C, y0 - 20, y1 + 20), [(0, '#E8A98B'), (1, '#A0543A')]))
    shadow = F.drop_shadow(body, px(0.6), px(1.2), px(1.2))
    if part == 'base':
        return F.stack([F.solid(shadow * 0.8, SHADOW), die, F.solid(seal * 0.9, '#E6C98A'), leads])
    return F.stack([cells, amb_glow, amber, core])


# ====================================================================== 中文：丝印


def render_text(C, G, tok):
    A = C.R(G['cn'], ss=4)
    b = G['cn'].bounds
    t = lum_t(C, b[1], b[3])
    col = F.ramp(t, [(0, '#F4F8F5'), (0.6, tok['ink']), (1, '#C5D2CB')])
    # 丝印油墨：细颗粒，偶尔一点漏印的小孔
    gr = F.grain(C.H, C.W, 41, 0.7)
    col = col * (1 + (gr[..., None] - 0.5) * 0.06)
    voids = F.sparkles(C.H, C.W, 42, F.erode(A, C.px(1.0)), 70, size=(0.4, 0.9), flare=0)
    col = col * (1 - np.clip(voids, 0, 1)[..., None] * 0.18)
    hi, sh = F.bevel(A, C.px(0.6), chisel=False, angle=120, altitude=50)
    col = col + (1 - col) * hi[..., None] * 0.3
    col = col * (1 - sh[..., None] * 0.12)
    k1 = F.outer_stroke(A, C.px(1.1))
    shadow = F.drop_shadow(A, C.px(1.0), C.px(2.0), C.px(1.6), spread=C.px(0.5))
    halo = F.outer_glow(A, C.px(9), spread=C.px(1.5), gain=1.0)
    return F.stack([F.solid(halo * 0.6, tok['worldDeep']), F.solid(shadow * 0.85, SHADOW), F.solid(k1, EDGE), F.solid(A, np.clip(col, 0, 1))])


# ====================================================================== 英文


def render_en(C, G, tok):
    nv = C.R(G['nvidia'], ss=4)
    bd = C.R(G['band'], ss=4)
    rd = C.R(G['refdes'], ss=4)
    allm = np.clip(nv + bd + rd, 0, 1)
    k1 = F.outer_stroke(allm, C.px(0.9))
    return F.stack([F.solid(F.drop_shadow(allm, C.px(0.6), C.px(1.2), C.px(1.0)) * 0.8, SHADOW), F.solid(k1 * 0.9, EDGE),
                    F.solid(nv * 0.96, '#E2EAE5'), F.solid(bd * 0.84, '#B6C7BE'), F.solid(rd * 0.72, '#93AC9F')])


# ====================================================================== 走线


def render_lines(C, G, tok):
    A = C.R(G['lines'], ss=4)
    col = copper(C, A, G['top_rail_y'] - 6, G['junction'][1] + 6, seed=13, brush=0.04)
    col = F.mix(col, F.rgb('#C97D5D')[None, None], 0.45)
    hi, sh = F.bevel(A, C.px(0.7), chisel=True, angle=120, altitude=40)
    col = col + (1 - col) * hi[..., None] * 0.45
    col = col * (1 - sh[..., None] * 0.3)
    gold, hole, rm, hm = gold_disc(C, G['rail_vias'])
    allm = np.clip(A + rm, 0, 1)
    k1 = F.outer_stroke(allm, C.px(0.9))
    shadow = F.drop_shadow(allm, C.px(0.8), C.px(1.8), C.px(1.4))
    return F.stack([F.solid(shadow * 0.8, SHADOW), F.solid(k1, EDGE), F.solid(A, np.clip(col, 0, 1)), gold, hole])


def rail_mask(C, G, x0, x1):
    y = G['junction'][1]
    return C.R(rect(x0, y - G['hair'] / 2, x1, y + G['hair'] / 2), ss=4)


def render_signal(C, G, tok):
    """通电：一段光从晶粒下来、沿基线走线跑到信号灯（越靠灯越亮）"""
    jx, jy = G['junction']
    led = G['led']
    m = np.clip(rail_mask(C, G, jx, led['x0']) + C.R(rect(jx - G['hair'] / 2, jy - 10, jx + G['hair'] / 2, jy), ss=4), 0, 1)
    u = np.clip((C.XX - jx) / (led['x0'] - jx), 0, 1)
    core = m * (0.55 + 0.45 * u)
    glow = F.blur(m, C.px(2.2)) * (0.35 + 0.65 * u) * 1.4
    wide = F.blur(m, C.px(7)) * u ** 2 * 0.9
    return F.stack([F.glow_layer(np.clip(wide, 0, 1) * 0.55, tok['lit']), F.glow_layer(np.clip(glow, 0, 1.2), '#FFB14A'),
                    F.glow_layer(core * 1.15, '#FFE2B0')])


def render_led(C, G, tok):
    """信号灯：一颗贴片灯（两端化金焊盘、中间琥珀的灯珠），亮起来；灯旁边板上一小片格子像热图一样晕开"""
    L = G['led']
    x0, x1, y, h = L['x0'], L['x1'], L['y'], L['h']
    px = C.px
    cx = (x0 + x1) / 2
    pad_w = 3.6
    pads = C.R(union(rect(x0, y - h / 2, x0 + pad_w, y + h / 2), rect(x1 - pad_w, y - h / 2, x1, y + h / 2)), ss=4)
    lens = C.R(rect(x0 + pad_w + 0.6, y - h / 2 + 0.4, x1 - pad_w - 0.6, y + h / 2 - 0.4), ss=4)
    r = np.sqrt((C.XX - cx) ** 2 + ((C.YY - y) * 1.15) ** 2)
    # 热图：灯周围按板上的方格（6px 一格）亮起一片小方块，琥珀往外晕成墨绿；形状由噪声决定
    g = 6.0
    gx = (np.floor(C.XX / g) + 0.5) * g
    gy = (np.floor(C.YY / g) + 0.5) * g
    rc = np.sqrt((gx - cx) ** 2 + ((gy - y) * 1.25) ** 2)
    n = F.fbm(C.H, C.W, 22, 77, octaves=3)
    cell_n = cv2.resize(cv2.resize(n, (C.W // int(g * C.scale) + 1, C.H // int(g * C.scale) + 1), interpolation=cv2.INTER_AREA),
                        (C.W, C.H), interpolation=cv2.INTER_NEAREST)
    heat = np.clip(1.0 - rc / 46.0 + (cell_n - 0.5) * 0.4, 0, 1)
    heat = np.where(heat > 0.16, heat, 0)
    half = g * (0.12 + 0.3 * heat)
    sq = ((np.abs(C.XX - gx) < half) & (np.abs(C.YY - gy) < half)).astype(np.float32) * (heat > 0)
    sq = sq * (1 - F.dilate(C.R(G['text']), px(3)))
    sq_col = F.ramp(np.clip(heat, 0, 1), [(0, tok['worldPale']), (0.45, '#C08A3C'), (1, tok['lit'])])
    heat_l = F.solid(F.blur(sq, 0.5) * (0.25 + 0.5 * heat), sq_col)
    glow = F.glow_layer(np.exp(-(r / 34.0) ** 2) * 0.55 + np.exp(-(r / 12.0) ** 2) * 0.6, tok['lit'])
    streak = np.exp(-((C.YY - y) / 0.9) ** 2) * np.exp(-np.abs(C.XX - cx) / 26.0) * 0.8
    body_sh = F.drop_shadow(np.clip(pads + lens, 0, 1), px(0.5), px(1.0), px(0.8))
    hot = np.exp(-(r / 3.2) ** 2) * 1.6
    return F.stack([heat_l, glow, F.solid(body_sh * 0.8, SHADOW), F.solid(pads, '#E6C98A'), F.solid(lens, '#FFB548'),
                    F.glow_layer(np.clip(hot + streak, 0, 2), '#FFE6B8')])


# ====================================================================== 晶圆


def render_wafer(C, G, tok):
    E = G['wafer']
    cx, cy = E['c']
    R = E['r']
    px = C.px
    disc = C.R(E['disc'], ss=3)
    r, th = C.polar((cx, cy))
    # 盘面：抛光的硅，比板子更暗更亮——一面暗镜子，一道斜着的冷反光横过去；晶粒方格只比盘面亮一点
    t = np.clip(((C.XX - cx) * 0.6 + (C.YY - cy) * 0.8) / R * 0.5 + 0.5, 0, 1)
    col = F.ramp(t, [(0, '#163D30'), (0.5, '#0C241C'), (1, '#071611')])
    d_sheen = ((C.XX - cx) * 0.707 + (C.YY - cy) * 0.707) / R
    sheen = (np.exp(-((d_sheen + 0.32) / 0.13) ** 2) * 0.9 + np.exp(-((d_sheen - 0.42) / 0.06) ** 2) * 0.35) * (r < R)
    col = col + F.rgb('#7FC2AA') * (sheen * 0.2)[..., None]
    base = F.solid(disc * 0.98, col)
    dies = C.R(E['die_shapes'], ss=2)
    part = C.R(E['partial_shapes'], ss=2)
    var = F.fbm(C.H, C.W, 60, 5, octaves=3)
    die_col = col * (1.18 + 0.14 * var[..., None]) + F.rgb('#9AD6C0') * (sheen * 0.12)[..., None]
    die_l = F.solid(dies * 0.9, np.clip(die_col, 0, 1))
    part_l = F.solid(part * 0.6, col * 0.8)
    rim = C.R(E['rim'], ss=4)
    excl = C.R(E['excl'], ss=4)
    lit = np.clip(0.55 + 0.45 * np.cos(th - math.radians(-130)), 0, 1)
    rim_col = F.mix(F.rgb('#9A7C45')[None, None], F.rgb('#F4DFA8')[None, None], lit[..., None])
    shadow = F.drop_shadow(disc, px(3), px(6), px(9), spread=px(2))
    wt = C.R(G['wafer_text'], ss=4)
    return F.stack([F.solid(shadow * 0.75, SHADOW), base, die_l, part_l, F.solid(excl * 0.45, '#8C9B72'),
                    F.solid(wt * 0.75, '#BFA672'),
                    F.solid(rim, rim_col), F.glow_layer(F.blur(rim, px(1.2)) * lit * 0.25, '#F4DFA8')])


# ====================================================================== 底板：阻焊层


def render_plate(C, G, tok):
    XX, YY, px = C.XX, C.YY, C.px
    P = G['plate']
    smoke = F.fbm(C.H, C.W, 90, 61, octaves=6)
    smoke = F.warp(smoke, F.fbm(C.H, C.W, 130, 62), F.fbm(C.H, C.W, 130, 63), px(30))
    # 四方一点的形：超椭圆（|x|^4 + |y|^4）
    shapes = [np.clip(1.08 - ((np.abs(XX - e[0]) / e[2]) ** 4 + (np.abs(YY - e[1]) / e[3]) ** 4), 0, 1) * e[4] for e in P['blobs']]
    E = G['wafer']
    rw, _ = C.polar(E['c'])
    shapes.append(np.clip(1.08 - (rw / (E['r'] + 26)) ** 4, 0, 1))
    shape = np.maximum.reduce(shapes)
    # 板边：撕开的、被蚀刻吃进去的边（形先被噪声推歪，再加一层细碎的毛边）
    shape = F.warp(shape, F.fbm(C.H, C.W, 60, 68), F.fbm(C.H, C.W, 60, 69), px(34))
    a = F.smoothstep(0.26, 0.5, shape + (smoke - 0.5) * 0.46 + (F.fbm(C.H, C.W, 14, 64, octaves=5) - 0.5) * 0.2)
    # 干笔：两三道横着的刷痕从板边拖出去
    for (x0, x1, y, h, sd) in [(30, 330, 372, 12, 101), (900, 1090, 132, 8, 104)]:
        a = np.maximum(a, _brush(C, x0, x1, y, h, sd) * 0.7)
    a = a * F.smoothstep(0, 24, XX) * F.smoothstep(0, 24, C.w - XX) * F.smoothstep(0, 20, YY) * F.smoothstep(0, 20, C.h - YY)
    calm = np.clip(F.blur(C.R(G['text']), px(18)) * 1.5, 0, 1)
    col = np.zeros((C.H, C.W, 3), np.float32) + F.rgb(tok['worldDeep'])
    # 阻焊层：一层干净的墨绿，主角后面亮一点（被晶粒照着），往外沉下去；只有很轻的玻纤织纹
    E0 = G['die']['center']
    rr = np.sqrt(((XX - E0[0]) / 1.6) ** 2 + (YY - E0[1]) ** 2)
    back = np.exp(-(rr / 260.0) ** 2)
    col = F.mix(col, F.rgb(tok['world'])[None, None], (0.35 + 0.55 * back)[..., None])
    col = col + F.rgb('#2E6B55') * (np.exp(-(rr / 140.0) ** 2) * 0.22)[..., None]
    mott = F.smoothstep(0.45, 0.95, smoke)
    col = col * (1 + (mott[..., None] - 0.5) * 0.12)
    weave = F.fbm(C.H, C.W, 3, 66, octaves=1, aniso=(4.0, 0.25)) * F.fbm(C.H, C.W, 3, 67, octaves=1, aniso=(0.25, 4.0))
    col = col * (1 + (weave[..., None] - 0.25) * 0.05)
    # 看得见的方格：只在板上，12px 一格的小点（字后面收掉），格子和中文的方格同一个间距的整数倍
    g = 12.0
    dots = halftone(C, g, 0.7)
    dots = dots * F.smoothstep(0.45, 0.8, a) * (1 - calm * 0.9)
    col = col + F.rgb('#5E9C84') * (dots * 0.4)[..., None]
    # 阻焊层下的走线：几根浅一档的墨绿线，只在主角周围，0°/45°/90° 拐，端头一个小焊盘
    tr_m, pad_m = _under_traces(C, G)
    tr_m = tr_m * (1 - calm * 0.7)
    col = col + F.rgb('#3E7A63') * (tr_m * 0.42)[..., None]
    col = col + F.rgb('#6FA58E') * (pad_m * (1 - calm * 0.7) * 0.4)[..., None]
    col = col * (1 + (F.grain(C.H, C.W, 21, 0.8)[..., None] - 0.5) * 0.06)
    return F.solid(a * 0.96, np.clip(col, 0, 1))


def _brush(C, x0, x1, y, h, seed, taper=0.3):
    rng = np.random.default_rng(seed)
    m = F.blur(C.R(rect(x0, y - h / 2, x1, y + h / 2)), C.px(h * 0.22))
    u = (C.XX - x0) / (x1 - x0)
    env = F.smoothstep(0, taper + rng.uniform(-0.05, 0.05), u) * F.smoothstep(1, 1 - taper - rng.uniform(-0.05, 0.05), u)
    br = F.fbm(C.H, C.W, 22, seed, octaves=5, aniso=(10.0, 0.35))
    m = m * env
    reach = np.clip(F.blur(m, C.px(h * 0.3)) * 4.0, 0, 1)
    return F.smoothstep(0.28, 0.55, m + (br - 0.5) * 0.7 * (1.2 - m)) * reach


def _under_traces(C, G):
    """B200 四周往外走的几根暗走线（布线：先直走，45° 拐一次，再直走），端头一个小焊盘"""
    bx0, by0, bx1, by1 = G['b_box']
    rng = np.random.default_rng(404)
    lines, pads = [], []
    specs = [(-1, 0, by0 + 40), (-1, 0, by0 + 92), (-1, 0, by1 - 50), (0, -1, bx0 + 120), (0, -1, bx0 + 250),
             (0, -1, bx0 + 470), (0, 1, bx0 + 180), (0, 1, bx0 + 330), (0, 1, bx0 + 520), (0, -1, 900), (0, 1, 860), (1, 0, 300)]
    for sx, sy, t in specs:
        if sx < 0:
            p0 = (bx0 - 8, t)
        elif sx > 0:
            p0 = (1030, t)
        elif sy < 0:
            p0 = (t, by0 - 22)
        else:
            p0 = (t, by1 + 34)
        L1 = rng.uniform(14, 40)
        L2 = rng.uniform(16, 30)
        L3 = rng.uniform(20, 70)
        d = 1 if rng.random() < 0.5 else -1
        if sx:
            p1 = (p0[0] + sx * L1, p0[1])
            p2 = (p1[0] + sx * L2, p1[1] + d * L2)
            p3 = (p2[0] + sx * L3, p2[1])
        else:
            p1 = (p0[0], p0[1] + sy * L1)
            p2 = (p1[0] + d * L2, p1[1] + sy * L2)
            p3 = (p2[0], p2[1] + sy * L3)
        lines.append(stroke_line([p0, p1, p2, p3], 1.6, cap='butt', join='miter'))
        pads.append(circle(p3[0], p3[1], 2.6))
    return C.R(union(lines), ss=3), C.R(union(pads), ss=3)


# ====================================================================== 高光


def render_fx(C, G, tok):
    """铜面受光边上零星几颗闪点、晶圆外缘左上一颗大闪光（全件的星芒是矢量的，在晶粒正中，由页面画）"""
    A = C.R(G['hero'], ss=2)
    hi, _ = F.bevel(A, C.px(1.3), chisel=True, angle=120, altitude=36)
    bx0, by0, bx1, by1 = G['b_box']
    where = np.clip(hi - 0.45, 0, 1) * np.clip(1.25 - (C.YY - by0) / (by1 - by0) * 1.4, 0, 1)
    sp = F.sparkles(C.H, C.W, 91, where, 26, size=(0.8, 2.0), flare=0.5)
    E = G['wafer']
    cx, cy = E['c']
    a = math.radians(-128)
    gx, gy = cx + E['r'] * math.cos(a), cy + E['r'] * math.sin(a)
    from lockupkit.geom import star4
    st = C.R(star4(gx, gy, 9, 0.12)) + np.exp(-(((C.XX - gx) ** 2 + (C.YY - gy) ** 2) / 5.0)) * 1.2
    return F.stack([F.glow_layer(sp * 0.85, '#FFEBDD'), F.glow_layer(F.blur(st, C.px(1.2)) * 0.5, '#F4DFA8'), F.glow_layer(st, '#FFF6E2')])

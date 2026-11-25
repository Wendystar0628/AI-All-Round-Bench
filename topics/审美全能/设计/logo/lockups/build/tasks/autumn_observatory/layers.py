"""02 秋庭观星画室 · 颜色层：每层一个 render(C, G, tok) -> 预乘 RGBA。

卡通渲染 = 木版套色：每样东西都是“一块墨线版 + 几块平涂的色版”，明暗只有硬边的两三档（卡通的三档平涂），
版木的纹和和纸的纤维印在色里，色版边上积一点色。一盏光：暮色从右上来（和介绍页右边圆窗的光同一边）。

颜色角色（报告 2.4）：
  字面色    和纸白（暖），下沿一抹杏色ぼかし（木版的渐变摺）；卡通的厚度往左下挤出一档靛紫，外面一圈墨线
  主题色    黄昏靛紫：霞形底板、天球
  阴影色    靛紫暗调（不用纯黑）
  高光      受光一侧一道硬边亮线；珠上一点
  点缀色    朱：签名字「星」朱漆为主（窗光一道硬边反射、金粉从右下撒开）；赤道环上的朱珠、朱印为呼应；天球里几粒朱星
  共用金属  黄铜：环、珠、底线、极轴
"""
import math
import numpy as np
import cv2
from lockupkit import fx as F
from lockupkit.geom import circle, rect, union

LIGHT = (1.0, -0.85)                     # 光从右上来（屏幕坐标）
_l = math.hypot(*LIGHT)
LX, LY = LIGHT[0] / _l, LIGHT[1] / _l

INK = '#1B1426'                          # 墨线版
PAPER = '#F3EADB'
PAPER_SH = '#D9C8B6'
EXTRUDE = '#2E2545'                      # 字的卡通厚度：靛紫暗调
BRASS = {'body': '#C99A56', 'lit': '#F2D394', 'shade': '#8A6131', 'deep': '#5C3F1E', 'spec': '#FFF5DC'}
LACQ = {'body': '#D2462E', 'shade': '#9C2B1D', 'deep': '#6E1A12', 'win': '#EA7255', 'hot': '#F8A383', 'gold': '#EDCB86'}


# ====================================================================== 共用：纸、版木、卡通明暗


def woodgrain(C, seed, cell=40, amt=1.0):
    """版木的纹：横向拉长的年轮纹（印在平涂的色里，只是深浅里的一层）"""
    n = F.fbm(C.H, C.W, cell, seed, octaves=4, aniso=(9.0, 0.6))
    w = F.fbm(C.H, C.W, 160, seed + 1, octaves=3)
    rings = 0.5 + 0.5 * np.sin((C.YY * 0.9 + (w - 0.5) * 60 + n * 14) * 0.9)
    return (n * 0.6 + rings * 0.4 - 0.5) * amt


def washi(C, seed, count=1600):
    """和纸的纤维：很淡的短弯丝"""
    rng = np.random.default_rng(seed)
    m = C.zeros()
    for _ in range(count):
        x, y = rng.random() * C.W, rng.random() * C.H
        L = rng.uniform(5, 18) * C.scale
        a = rng.random() * math.pi * 2
        b = a + rng.uniform(-0.6, 0.6)
        mx, my = x + math.cos(a) * L / 2, y + math.sin(a) * L / 2
        ex, ey = mx + math.cos(b) * L / 2, my + math.sin(b) * L / 2
        cv2.line(m, (int(x * 16), int(y * 16)), (int(mx * 16), int(my * 16)), rng.uniform(0.4, 1.0), 1, cv2.LINE_AA, 4)
        cv2.line(m, (int(mx * 16), int(my * 16)), (int(ex * 16), int(ey * 16)), rng.uniform(0.4, 1.0), 1, cv2.LINE_AA, 4)
    return F.blur(m, 0.5)


def baren(C, seed):
    """馬連摺的不匀：低频的深浅"""
    return F.fbm(C.H, C.W, 90, seed, octaves=3) - 0.5


def facing(mask, width_px, power=1.0, toward=(LX, LY)):
    """形的边朝向某个方向的程度（0–1），只在边上一圈 width_px 以内"""
    d = F.dist_in(mask)
    band = (d > 0) & (d < width_px)
    sm = F.blur(mask, max(0.8, width_px * 0.5))
    gx, gy = F.grad(sm)
    nrm = np.sqrt(gx * gx + gy * gy) + 1e-6
    nx, ny = -gx / nrm, -gy / nrm          # 外法线
    f = np.clip(nx * toward[0] + ny * toward[1], 0, 1) ** power
    return f * band, d


def cel_rim(mask, width_px, toward, thr=0.35):
    """卡通的硬边：朝 toward 的边上 width_px 宽的一条（硬阈值，不是渐变）"""
    f, d = facing(mask, width_px * 1.6, 1.0, toward)
    hard = (f > thr) & (d < width_px)
    return F.blur(hard.astype(np.float32), 0.6) * mask


def extrude(C, mask, dx, dy, steps=None):
    """卡通的厚度：往 (dx, dy) 挤出去的一块平涂（硬边），返回字外面那部分的覆盖率"""
    n = steps or max(2, int(math.hypot(dx, dy) * C.scale))
    m = mask.copy()
    for i in range(1, n + 1):
        m = np.maximum(m, F.shift(mask, dx * C.scale * i / n, dy * C.scale * i / n))
    return np.clip(m - mask, 0, 1)


def cel_sphere(C, cx, cy, r, mask=None):
    """一颗卡通明暗的球：返回 (亮面, 暗面, 高光) 三张覆盖率。明暗交界是硬边的圆弧（偏到左下），高光是一小块硬边椭圆"""
    if mask is None:
        mask = C.R(circle(cx, cy, r), ss=3)
    off = 0.42 * r
    lit = C.R(circle(cx + LX * off * 0.2, cy + LY * off * 0.2, r * 0.96), ss=3) * \
        (1 - C.R(circle(cx - LX * off, cy - LY * off, r * 1.06), ss=3))
    shade = mask * (1 - C.R(circle(cx + LX * off * 0.35, cy + LY * off * 0.35, r * 1.02), ss=3))
    hx, hy = cx + LX * r * 0.42, cy + LY * r * 0.42
    spec = C.R(circle(hx, hy, max(0.7, r * 0.2)), ss=3)
    return np.clip(lit, 0, 1) * mask, np.clip(shade, 0, 1), spec * mask


def bead_layer(C, beads, kind):
    """一串卡通圆珠（黄铜或朱漆）：墨线一圈、三档平涂、硬边高光"""
    out = []
    pal = BRASS if kind == 'brass' else {'body': LACQ['body'], 'lit': LACQ['hot'], 'shade': LACQ['shade'], 'deep': LACQ['deep'], 'spec': '#FFE3CC'}
    for x, y, r in beads:
        m = C.R(circle(x, y, r), ss=3)
        key = C.R(circle(x, y, r + 0.9), ss=3)
        lit, sh, sp = cel_sphere(C, x, y, r, m)
        col = np.zeros((C.H, C.W, 3), np.float32) + F.rgb(pal['body'])
        col = F.mix(col, F.rgb(pal['lit']), (lit * 0.9)[..., None])
        col = F.mix(col, F.rgb(pal['shade']), sh[..., None])
        col = F.mix(col, F.rgb(pal['spec']), sp[..., None])
        out += [F.solid(key, INK), F.solid(m, col)]
    return F.stack(out) if out else None


def char_t(C, chars):
    t = C.zeros()
    for c in chars:
        m = C.R(c['path'])
        tt = np.clip((C.YY - c['top']) / (c['bottom'] - c['top']), 0, 1)
        t = np.where(m > 0.01, tt, t)
    return t


# ====================================================================== 字


def paper_face(C, A, t, seed):
    """和纸白的平涂：下沿一抹杏色ぼかし（木版的渐变摺，带版木纹）、纸纤维、馬連的不匀"""
    col = np.zeros((C.H, C.W, 3), np.float32) + F.rgb(PAPER)
    wg = woodgrain(C, seed, cell=26, amt=1.0)
    bk = np.clip((t - 0.5) / 0.5, 0, 1) ** 1.3 + wg * 0.12
    col = F.mix(col, F.rgb('#EDB98C'), np.clip(bk * 0.42, 0, 0.42)[..., None])
    col = col * (1 + baren(C, seed + 3)[..., None] * 0.05)
    fib = washi(C, seed + 5, 2200)
    col = col + (np.array([1.0, 0.99, 0.96], np.float32) - col) * (fib * 0.35)[..., None]
    return col


def render_text(C, G, tok):
    A = C.R(G['text_only'], ss=3)
    Bm = np.zeros_like(A)
    for x, y, r in G['beads']:
        Bm = np.maximum(Bm, C.R(circle(x, y, r + 0.8), ss=3))
    Aplain = np.clip(A - Bm, 0, 1)
    t = char_t(C, [c for c in G['chars'] if not c['hero']])
    px = C.px
    # 卡通的厚度：往左下挤出一档（光从右上来），外面一圈墨线
    ex = extrude(C, A, -LX * 2.6, -LY * 2.6)
    key = F.outer_stroke(np.maximum(A, ex), px(1.1))
    seat = F.drop_shadow(np.maximum(A, ex), -px(1.5), px(3), px(4))
    col = paper_face(C, Aplain, t, 41)
    # 背光一侧一道硬边的暗（卡通第二档），受光一侧一丝亮
    sh = cel_rim(Aplain, px(2.2), (-LX, -LY), 0.3)
    col = F.mix(col, F.rgb(PAPER_SH), (sh * 0.85)[..., None])
    hi = cel_rim(Aplain, px(1.0), (LX, LY), 0.45)
    col = F.mix(col, F.rgb('#FFF9EE'), (hi * 0.9)[..., None])
    layers = [
        F.solid(seat * 0.55, '#120D1C'),
        F.solid(np.clip(key + ex, 0, 1), INK),
        F.solid(ex, EXTRUDE),
        F.solid(Aplain, col),
        bead_layer(C, G['beads'], 'brass'),
    ]
    return F.stack(layers)


def render_hero(C, G, tok):
    """「星」朱漆莳绘：朱的平涂、背光一档暗朱、一道很宽的窗光反射（硬边，两档）、金粉从右下角撒开；日里那一道黄道环是黄铜"""
    H = C.R(G['hero'], ss=3)
    band = C.R(G['band_in'], ss=3)
    px = C.px
    XX, YY = C.XX, C.YY
    b = G['hero'].bounds
    ex = extrude(C, H, -LX * 3.6, -LY * 3.6)
    key = F.outer_stroke(np.maximum(H, ex), px(1.2))
    margin = F.outer_stroke(np.maximum(H, ex), px(1.7), offset=px(1.2))      # 版画的白边：墨线外一圈和纸色，签名字从暗天球上跳出来
    glow = F.outer_glow(H, px(16), spread=px(4), gain=1.0)
    seat = F.drop_shadow(np.maximum(H, ex), -px(2), px(4), px(5))
    col = np.zeros((C.H, C.W, 3), np.float32) + F.rgb(LACQ['body'])
    # 窗光反射：只落在「生」上（日里留给黄道环），两道平行的硬边斜光，一宽一窄
    cy_sun = G['C'][1]
    low = (YY > cy_sun + 0.16 * (b[3] - b[1])).astype(np.float32)
    u = (XX - b[0]) * 0.5 + (YY - b[1]) * 0.866
    c0 = (b[2] - b[0]) * 0.5 * 0.30 + (b[3] - b[1]) * 0.866 * 0.72
    wide = (np.abs(u - c0) < 15).astype(np.float32) * low
    narrow = (np.abs(u - c0 - 27) < 4.5).astype(np.float32) * low
    col = F.mix(col, F.rgb(LACQ['win']), (F.blur(wide, 0.6) * 0.8)[..., None])
    col = F.mix(col, F.rgb(LACQ['hot']), (F.blur(narrow, 0.6) * 0.85)[..., None])
    # 背光一侧的硬边暗朱
    sh = cel_rim(H, px(3.2), (-LX, -LY), 0.25)
    col = F.mix(col, F.rgb(LACQ['shade']), (sh * 0.95)[..., None])
    hi = cel_rim(H, px(1.1), (LX, LY), 0.45)
    col = F.mix(col, F.rgb('#FFC2A6'), (hi * 0.8)[..., None])
    # 漆面里一层极淡的纹（刷漆的方向），不脏
    col = col * (1 + woodgrain(C, 71, cell=30, amt=0.5)[..., None] * 0.04)
    # 金粉：从右下角撒进来，越往左上越稀（平蒔絵的ぼかし），粒子细
    gsrc = np.clip(((XX - b[0]) / (b[2] - b[0]) * 0.6 + (YY - b[1]) / (b[3] - b[1]) * 0.6 - 0.45) / 0.75, 0, 1) ** 1.6
    dust = F.sparkles(C.H, C.W, 73, H * gsrc, 900, size=(0.45, 1.25), flare=0)
    flakes = F.sparkles(C.H, C.W, 74, H * gsrc ** 2, 40, size=(1.2, 2.2), flare=0)
    gold = np.clip(dust * 0.9 + flakes, 0, 1)
    col = F.mix(col, F.rgb(LACQ['gold']), gold[..., None])
    fill = F.solid(H, np.clip(col, 0, 1))
    # 黄道环在日里那一段：黄铜，上沿受光一线亮、下沿一档暗，墨线一圈
    bkey = F.outer_stroke(band, px(0.9))
    bcol = np.zeros((C.H, C.W, 3), np.float32) + F.rgb(BRASS['body'])
    bcol = F.mix(bcol, F.rgb(BRASS['lit']), (cel_rim(band, px(1.6), (LX * 0.3, -1.0), 0.3) * 0.95)[..., None])
    bcol = F.mix(bcol, F.rgb(BRASS['shade']), (cel_rim(band, px(2.2), (-LX * 0.3, 1.0), 0.3) * 0.9)[..., None])
    return F.stack([
        F.glow_layer(glow * 0.32, tok['light']),
        F.solid(seat * 0.6, '#160A10'),
        F.solid(margin, '#F1E3CF'),
        F.solid(np.clip(key + ex, 0, 1), '#1E0B0E'),
        F.solid(ex, '#5A1A16'),
        fill,
        F.solid(bkey, INK),
        F.solid(band, bcol),
    ])


def lacquer_small(C, mask, tone, tok):
    """小形态里的签名字：朱漆两档（窗光一道），金粉稀一点"""
    col = np.zeros((C.H, C.W, 3), np.float32) + F.rgb(LACQ['body'] if tone != 'ink' else '#B23A26')
    b = np.where(mask > 0.5)
    if len(b[0]):
        y0, y1, x0, x1 = b[0].min(), b[0].max(), b[1].min(), b[1].max()
        yy, xx = np.mgrid[0:C.H, 0:C.W].astype(np.float32)
        u = (xx - x0) * 0.55 + (yy - y0) * 0.83
        c0 = (x1 - x0) * 0.55 * 0.62 + (y1 - y0) * 0.83 * 0.18
        col = F.mix(col, F.rgb(LACQ['win']), ((np.abs(u - c0) < C.px(5)) * 0.7)[..., None])
    sh = cel_rim(mask, C.px(1.0), (-LX, -LY), 0.3)
    col = F.mix(col, F.rgb(LACQ['shade']), (sh * 0.9)[..., None])
    return F.solid(mask, col)


# ====================================================================== 主体：浑天仪


_CACHE = {}


def _cached(name, fn, C, G, tok):
    """一次出图里几层共用的那一份（按 G 认）"""
    k = (name, id(G))
    if k not in _CACHE:
        for kk in [kk for kk in _CACHE if kk[0] == name]:
            del _CACHE[kk]
        _CACHE[k] = fn(C, G, tok)
    return _CACHE[k]


def _globe_parts(C, G, tok):
    A = G['arm']
    cx, cy = A['E']
    R = A['R']
    px = C.px
    disc = C.R(A['disc'], ss=3)
    # 天球：卡通三档（暗、本色、受光一弯），受光的边一线杏色（暮色从右上来）
    lit, shade, _ = cel_sphere(C, cx, cy, R - 3, disc)
    col = np.zeros((C.H, C.W, 3), np.float32) + F.rgb('#2C2547')
    col = F.mix(col, F.rgb('#3F3563'), (lit * 0.95)[..., None])
    col = F.mix(col, F.rgb('#231D3A'), (shade * 0.9)[..., None])
    rim = cel_rim(disc, px(2.4), (LX, LY), 0.35)
    col = F.mix(col, F.rgb(tok['light']), (rim * 0.75)[..., None])
    col = col * (1 + woodgrain(C, 81, cell=34, amt=1.0)[..., None] * 0.07)
    col = col * (1 + baren(C, 82)[..., None] * 0.06)
    # 印上去的星：淡的米白小点；朱只给三颗稍大的（点缀色在天球里像纹理一样散开，不撒满）
    rng = np.random.default_rng(83)
    stars = C.zeros()
    for _ in range(46):
        a, rr = rng.random() * 2 * math.pi, (R - 12) * math.sqrt(rng.random())
        x, y = cx + rr * math.cos(a), cy + rr * math.sin(a)
        s = rng.uniform(0.45, 1.1)
        cv2.circle(stars, (int(x * C.scale * 16), int(y * C.scale * 16)), max(1, int(s * C.scale * 16)), 1.0, -1, cv2.LINE_AA, 4)
    col = F.mix(col, F.rgb('#E9DCC6'), (stars * disc * 0.7)[..., None])
    reds = [(cx + 62, cy - 58, 2.0), (cx + 84, cy - 14, 1.5), (cx - 30, cy - 18, 1.6)]
    # 秋季四边形：发丝连线（黄铜，淡）+ 顶点上的小珠
    cons = C.R(A['constellation'], ss=3) * disc
    col = F.mix(col, F.rgb('#D8B676'), (cons * 0.6)[..., None])
    disc_l = F.solid(disc, np.clip(col, 0, 1))
    cstars = bead_layer(C, [(x, y, 2.6) for x, y in A['stars']], 'brass')
    red_l = bead_layer(C, reds, 'lit')
    # 后半圈的环（在球后、字后）：黄铜发丝，暗一档
    back_c = F.mix(F.rgb(BRASS['shade']), F.rgb(BRASS['body']), 0.55)
    ecl_back_l = F.solid(C.R(A['ecl_back'], ss=3), back_c)
    eq_back_l = F.solid(C.R(A['eq_back'], ss=3), back_c)
    front_eq = C.R(A['eq_front'], ss=3)
    # 子午环：黄铜环带，受光的右上半亮、左下半暗（硬边），内侧刻度压进去
    mer = C.R(A['meridian'], ss=3)
    ang = np.arctan2(C.YY - cy, C.XX - cx)
    side = (np.cos(ang) * LX + np.sin(ang) * LY)
    mcol = np.zeros((C.H, C.W, 3), np.float32) + F.rgb(BRASS['body'])
    mcol = F.mix(mcol, F.rgb(BRASS['lit']), ((side > 0.25).astype(np.float32) * 0.85)[..., None])
    mcol = F.mix(mcol, F.rgb(BRASS['shade']), ((side < -0.35).astype(np.float32) * 0.85)[..., None])
    groove = C.R(A['groove'], ss=3) * mer
    mcol = F.mix(mcol, F.rgb(BRASS['deep']), (groove * 0.7)[..., None])
    ticks = C.R(A['ticks'], ss=3)
    pins = C.R(A['pins'], ss=3)
    out = F.outer_stroke(np.maximum(mer, pins), px(1.0))
    shadow = F.drop_shadow(np.maximum(disc, mer), -px(4), px(6), px(9), spread=px(2))
    fx_, fy_, fr = A['finial']
    (p1x, p1y, p1r, _), (p2x, p2y, p2r, _), (p3x, p3y, p3r, _) = A['planets']   # 赤道环前半圈的朱珠、后半圈的铜珠、黄道环后半圈的铜珠
    return {
        # 天球：一块色版（暗、本色、受光一弯），印着星和秋季四边形
        'sphere': F.stack([F.solid(shadow * 0.6, '#0D0916'), F.solid(F.outer_stroke(disc, px(1.0)), INK), disc_l, cstars, red_l]),
        # 黄道环的后半圈和它上面的铜珠（前半圈在 orbit 层和「星」里）
        'ecl': F.stack([ecl_back_l, bead_layer(C, [(p3x, p3y, p3r)], 'brass')]),
        # 赤道环：后半圈、前半圈和两颗珠
        'eq': F.stack([eq_back_l, bead_layer(C, [(p2x, p2y, p2r)], 'brass'), F.solid(front_eq * 1.0, BRASS['body']), bead_layer(C, [(p1x, p1y, p1r)], 'lit')]),
        # 子午环、刻度、极轴、顶珠（整副架子）
        'cage': F.stack([F.solid(out, INK), F.solid(mer, mcol), F.solid(ticks * 0.8, BRASS['deep']), F.solid(pins, BRASS['body']),
                         bead_layer(C, [(fx_, fy_, fr)], 'brass')]),
    }


def render_sphere(C, G, tok):
    return _cached('globe', _globe_parts, C, G, tok)['sphere']


def render_ecl_ring(C, G, tok):
    return _cached('globe', _globe_parts, C, G, tok)['ecl']


def render_eq_ring(C, G, tok):
    return _cached('globe', _globe_parts, C, G, tok)['eq']


def render_cage(C, G, tok):
    return _cached('globe', _globe_parts, C, G, tok)['cage']


def render_globe(C, G, tok):
    """整个浑天仪（检查用）"""
    P = _cached('globe', _globe_parts, C, G, tok)
    return F.stack([P['sphere'], P['ecl'], P['eq'], P['cage']])


def render_orbit(C, G, tok):
    """黄道环出了日以后的发丝（前半圈，盖在字前）：黄铜，墨线一圈"""
    m = C.R(G['ecl_front'], ss=3)
    key = F.outer_stroke(m, C.px(0.8))
    col = np.zeros((C.H, C.W, 3), np.float32) + F.rgb(BRASS['body'])
    col = F.mix(col, F.rgb(BRASS['lit']), (cel_rim(m, C.px(1.2), (0.2, -1.0), 0.3) * 0.9)[..., None])
    return F.stack([F.solid(key, INK), F.solid(m, col)])


# ====================================================================== 底


def kasumi(C, bands, seed):
    """霞（すやり霞）：几条两头圆的横带，边是版刻出来的硬边（极轻的不齐）"""
    m = C.zeros()
    for (x0, x1, y0, y1) in bands:
        r = (y1 - y0) / 2
        p = union(rect(x0 + r, y0, x1 - r, y1), circle(x0 + r, (y0 + y1) / 2, r), circle(x1 - r, (y0 + y1) / 2, r))
        m = np.maximum(m, C.R(p))
    n1, n2 = F.fbm(C.H, C.W, 20, seed, octaves=3), F.fbm(C.H, C.W, 20, seed + 1, octaves=3)
    m = F.warp(m, n1, n2, C.px(1.6))
    return m


def _plate_parts(C, G, tok):
    """霞形的底板：三条すやり霞，一条一块版、各自从上到下ぼかし（靛紫 → 下沿一抹暮色的杏），后印的压在先印的上面；
    主角身后透出暮色的杏；版木纹、和纸纤维、馬連的不匀，版的边上积一点色"""
    px = C.px
    bands = [((60, 650, 298, 420), 15), ((300, 1100, 228, 392), 16), ((36, 770, 114, 272), 17)]
    parts = []
    total = C.zeros()
    for (x0, x1, y0, y1), sd in bands:
        m = kasumi(C, [(x0, x1, y0, y1)], sd)
        t = np.clip((C.YY - y0) / (y1 - y0), 0, 1)
        col = F.ramp(t, [(0.0, '#251F3B'), (0.5, '#352D51'), (0.8, '#54406A'), (1.0, '#8E5E6C')])
        col = col * (1 + woodgrain(C, sd, cell=46, amt=1.0)[..., None] * 0.10)
        col = col * (1 + baren(C, sd + 3)[..., None] * 0.07)
        d = F.dist_in(m)
        edge = np.exp(-d / px(2.0)) * (m > 0.02)
        col = col * (1 - edge[..., None] * 0.22)
        parts.append(F.solid(m * 0.97, np.clip(col, 0, 1)))
        total = np.maximum(total, m)
    # 主角身后透出来的暮色（只在底板上）
    cx, cy = G['E']
    r, _ = C.polar((cx, cy + 30))
    glow = np.clip(1 - r / 300, 0, 1) ** 1.7 * total
    fib = washi(C, 14, 2600) * total
    # 霞的上半是暮空：印几粒淡的星点（不是星芒；全件唯一的星芒在日心），离字远一点
    calm = 1 - np.clip(F.blur(C.R(G['text']), px(10)) * 3, 0, 1)
    sky = total * np.clip(1.15 - (C.YY - 110) / 120, 0, 1) * calm
    dots = F.sparkles(C.H, C.W, 19, sky, 70, size=(0.5, 1.3), flare=0)
    # 最后一版：暮色的ぼかし、和纸的纤维、暮空里的星点
    parts.append(F.stack([F.solid(glow * 0.42, tok['light']), F.solid(fib * 0.10, '#F2E6DA'), F.solid(np.clip(dots, 0, 1) * 0.55, '#EDE2D0')]))
    return parts


def render_kasumi_1(C, G, tok):
    """左下一条霞（in an autumn garden 身后，最先印）"""
    return _cached('plate', _plate_parts, C, G, tok)[0]


def render_kasumi_2(C, G, tok):
    """第二条霞（「星画室」身后）"""
    return _cached('plate', _plate_parts, C, G, tok)[1]


def render_kasumi_3(C, G, tok):
    """第三条霞（第一段身后，压在前两条上面）"""
    return _cached('plate', _plate_parts, C, G, tok)[2]


def render_bokashi(C, G, tok):
    """最后一版：主角身后透出的暮色ぼかし、和纸纤维、暮空的星点"""
    return _cached('plate', _plate_parts, C, G, tok)[3]


def render_plate(C, G, tok):
    """整块底板（检查用）"""
    return F.stack(_cached('plate', _plate_parts, C, G, tok))


# ====================================================================== 英文


def render_ghost(C, G, tok):
    """STARGAZING：先印的一块淡版（浅靛紫），版木纹看得见；套色错开一点，左下露一线更深的版"""
    gm = C.R(G['ghost']['path'], ss=3)
    off = F.shift(gm, -C.px(1.6), C.px(1.6)) * (1 - gm)
    col = np.zeros((C.H, C.W, 3), np.float32) + F.rgb('#5B4E7E')
    col = col * (1 + woodgrain(C, 21, cell=24, amt=1.0)[..., None] * 0.16)
    t = np.clip((C.YY - (G['ghost']['base'] - G['ghost']['cap'])) / G['ghost']['cap'], 0, 1)
    col = F.mix(col, F.rgb('#8A6F8C'), (t ** 1.5 * 0.45)[..., None])
    return F.stack([F.solid(off * 0.8, '#241D38'), F.solid(gm * 0.85, np.clip(col, 0, 1))])


def render_band(C, G, tok):
    m = C.R(G['band']['line'], ss=3)
    key = F.outer_stroke(m, C.px(0.7))
    col = np.zeros((C.H, C.W, 3), np.float32) + F.rgb(BRASS['body'])
    col = F.mix(col, F.rgb(BRASS['lit']), (cel_rim(m, C.px(0.8), (0, -1), 0.3) * 0.9)[..., None])
    return F.stack([F.solid(key, INK), F.solid(m, col), bead_layer(C, G['band']['beads'], 'brass')])


def _en_parts(C, G, tok):
    it = C.R(G['italic'], ss=3)
    cp = C.R(G['caps'], ss=3)
    S = G['seal']
    body = C.R(S['body'], ss=3)
    txt = C.R(S['text'], ss=3)
    # 朱印：印泥的不匀（颗粒、边上淡一点），字是反白（纸色）
    n = F.fbm(C.H, C.W, 4, 31, octaves=3)
    ink = np.clip(0.82 + (n - 0.5) * 0.5, 0, 1) * body
    seal_col = F.solid(ink, tok['lit'])
    paper = np.clip(txt, 0, 1) * body
    italic_l = F.solid(it, F.mix(F.rgb(tok['light']), F.rgb('#F6D2AE'), 0.25))
    caps_l = F.solid(cp * 0.92, '#D8C9B2')
    return {
        'en': F.stack([F.solid(F.drop_shadow(it, -C.px(1), C.px(1.5), C.px(1.2)) * 0.6, '#120D1C'), italic_l, caps_l]),
        'seal': F.stack([F.solid(F.drop_shadow(body, -C.px(1), C.px(1.5), C.px(1.5)) * 0.5, '#120D1C'), seal_col, F.solid(paper * 0.92, PAPER)]),
    }


def render_en_text(C, G, tok):
    """in an autumn garden 斜体小档、STARGAZING ATELIER 底线带"""
    return _cached('en', _en_parts, C, G, tok)['en']


def render_seal(C, G, tok):
    """朱印（竖排 AUTUMN，版元印）"""
    return _cached('en', _en_parts, C, G, tok)['seal']


def render_en(C, G, tok):
    """英文和朱印（检查用）"""
    P = _cached('en', _en_parts, C, G, tok)
    return F.stack([P['en'], P['seal']])


# ====================================================================== 高光


def render_fx(C, G, tok):
    """珠上、顶珠、子午环受光点上的一闪（小，硬边十字），朱漆金粉里几粒亮"""
    out = []
    pts = [(x, y, r) for x, y, r in G['beads']] + [(x, y, r) for x, y, r in G['band']['beads'] if r > 3]
    fxp, fyp, fr = G['arm']['finial']
    pts.append((fxp, fyp, fr))
    m = C.zeros()
    for x, y, r in pts:
        hx, hy = x + LX * r * 0.42, y + LY * r * 0.42
        s = max(1.2, r * 0.32)
        cv2.line(m, (int((hx - s * 2.2) * C.scale * 16), int(hy * C.scale * 16)), (int((hx + s * 2.2) * C.scale * 16), int(hy * C.scale * 16)), 0.9, max(1, int(C.scale * 0.7)), cv2.LINE_AA, 4)
        cv2.line(m, (int(hx * C.scale * 16), int((hy - s * 2.2) * C.scale * 16)), (int(hx * C.scale * 16), int((hy + s * 2.2) * C.scale * 16)), 0.9, max(1, int(C.scale * 0.7)), cv2.LINE_AA, 4)
    out.append(F.glow_layer(F.blur(m, 0.6) * 0.8, '#FFF3DA'))
    return F.stack(out)

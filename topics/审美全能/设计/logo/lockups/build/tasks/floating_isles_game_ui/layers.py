"""09 浮空群岛传说游戏UI · 颜色层：每层一个 render(C, G, tok) -> 预乘 RGBA。

颜色角色（报告 2.4）：
  字面色    奶白：四档抖动（上沿一格纯白，往下抖进淡紫），深紫描边，暮紫的一格硬投影（卡带盒上的游戏字）
  主题色    暮色群青：底板、第二段的菜单条、LEGEND
  阴影色    深紫（暮色群青的暗调，不用纯黑）
  高光      上沿的一格亮边、像素十字闪点、晶簇上的星芒
  点缀色    宝箱金：「岛」为主（四档平涂金），宝箱、光标为呼应；金方点在岛顶附近像纹理一样散开（学虹色五线谱后面那片彩色方格光）
            第二点缀浮岛翠绿：晶簇、滴落、岩体上沿的苔线、岛下一团光和翠绿方点
  共用金属  浅金：航路、珠点线
像素格：CELL = 2 舞台像素（出图 4 像素）。抖动用 4×4 的 Bayer 矩阵，按像素格对齐。
"""
import numpy as np
from lockupkit import fx as F
from lockupkit.geom import union, rect, stroke_line

CELL = 2.0
OUTLINE = '#1A0E30'       # 深紫描边
SHADOW = '#2C2163'        # 暮紫硬投影
DROP = 4.0                # 硬投影的错位（两格）

BAYER = (np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]], np.float32) + 0.5) / 16.0


def mixh(a, b, t):
    a, b = F.rgb(a), F.rgb(b)
    c = a * (1 - t) + b * t
    return '#' + ''.join(f'{int(round(v * 255)):02X}' for v in c)


def golds(tok):
    """四档宝箱金（和代表画面里那只宝箱同一副）：暗、中暗、本色、高光"""
    lit = tok['lit']
    return [mixh(lit, tok['worldDeep'], 0.55), mixh(lit, tok['worldDeep'], 0.25), lit, mixh(lit, '#FFF8E0', 0.6)]


# ====================================================================== 像素格


def cells(C):
    """每个图像像素所在像素格的 (列, 行) 和格心的舞台坐标"""
    k = CELL * C.scale
    yy, xx = np.mgrid[0:C.H, 0:C.W]
    gx, gy = (xx // k).astype(np.int32), (yy // k).astype(np.int32)
    return gx, gy, (gx + 0.5) * CELL, (gy + 0.5) * CELL


def bayer(C):
    gx, gy, _, _ = cells(C)
    return BAYER[gy % 4, gx % 4]


def on_cells(C, field):
    """把一张场按像素格取样（每格取格心的值），返回同尺寸的阶梯场"""
    k = int(CELL * C.scale)
    sm = field[k // 2::k, k // 2::k]
    big = np.repeat(np.repeat(sm, k, 0), k, 1)
    out = np.zeros_like(field)
    out[:big.shape[0], :big.shape[1]] = big[:field.shape[0], :field.shape[1]]
    return out




def step(C, field, edge, width=0.06):
    """像素格上的一道分界：field 过了 edge 就是 True；分界两边 width 以内是一条棋盘格过渡"""
    f = on_cells(C, field)
    gx, gy, _, _ = cells(C)
    chk = ((gx + gy) % 2).astype(bool)
    return (f > edge + width / 2) | ((f > edge - width / 2) & chk)


def rim(C, mask, dx, dy, n=1):
    """朝 (dx, dy) 那一侧的边往里 n 格"""
    k = CELL * C.scale * n
    return np.clip(mask - F.shift(mask, -dx * k, -dy * k), 0, 1)


def palette(idx, cols):
    P = np.array([F.rgb(c) for c in cols], np.float32)
    return P[idx]






def top_rim(C, mask, n=1):
    """朝上的边往里 n 格（像素格）：上面一格是空的那些格"""
    k = CELL * C.scale * n
    return np.clip(mask - F.shift(mask, 0, k), 0, 1)


def char_t(C, chars):
    t = C.zeros()
    for c in chars:
        m = C.R(c['path'])
        tt = np.clip((C.YY - c['top']) / (c['bottom'] - c['top']), 0, 1)
        t = np.where(m > 0.01, tt, t)
    return t


def game_type(C, A, extra_drop=None):
    """卡带盒的游戏字：深紫描边、暮紫硬投影、一圈暮色的柔光；返回（字下的层，描边覆盖）"""
    px = C.px
    K = np.clip(F.outer_stroke(A, px(2.2)) + 0, 0, 1)
    body = np.clip(A + K, 0, 1)
    d = px(DROP)
    sh = np.clip(F.shift(body, d, d) - body, 0, 1)
    halo = F.outer_glow(body, px(9), spread=px(1.0))
    return [F.solid(halo * 0.42, '#4B4FA0'), F.solid(np.clip(F.shift(body, d + px(1.5), d + px(1.5)) - body, 0, 1) * 0.5, '#0B0820'),
            F.solid(sh, SHADOW), F.solid(K, OUTLINE)], K


# ====================================================================== 汉字（第一段、第二段、U I）


def render_row1(C, G, tok):
    """第一段「浮空群」（入场时和第二段分开解析，所以分两层）"""
    return game_text(C, G['chars'][:3], G['row1'], G)


def render_row2(C, G, tok):
    """第二段「传说游戏UI」"""
    return game_text(C, G['chars'][4:], G['row2'], G)


def game_text(C, chars, path, G):
    """一段卡带盒游戏字（chars 是这一段各字的上下沿，path 是这一段的轮廓）"""
    A = C.R(path, ss=3)
    t = char_t(C, chars)
    px = C.px
    under, K = game_type(C, A)
    # 字面：奶白一整片；下部三成换淡紫（交界一条棋盘格）；上沿一格纯白、左沿一格亮；右下一格深一档淡紫（像素画的内阴影）
    col = np.zeros((C.H, C.W, 3), np.float32) + F.rgb('#EEE8DF')
    low = step(C, t, 0.7, 0.08)
    col = np.where(low[..., None], F.rgb('#DAD2E8'), col)
    up = np.clip(rim(C, A, 0, -1) + rim(C, A, -1, 0) * 0.6, 0, 1)
    dn = np.clip(rim(C, A, 1, 1), 0, 1) * (1 - up)
    # 受光的上沿：离「岛」近的几个字被金光擦亮（偏暖），离晶簇近的下沿映一点翠绿
    hc, ic = G['isle_c'], G['drip_at']
    warm = np.clip(1 - np.sqrt((C.XX - hc[0]) ** 2 + (C.YY - hc[1]) ** 2) / 260, 0, 1)
    cool = np.clip(1 - np.sqrt((C.XX - ic[0]) ** 2 + (C.YY - ic[1]) ** 2) / 200, 0, 1)
    up_col = F.mix(F.rgb('#FFFFFF')[None, None], F.rgb('#FFE7A6')[None, None], (warm ** 0.8)[..., None])
    dn_col = F.mix(F.rgb('#C3B8DE')[None, None], F.rgb('#8FD3B2')[None, None], (cool ** 0.8)[..., None])
    col = col * (1 - up[..., None]) + up_col * up[..., None]
    col = col * (1 - dn[..., None]) + dn_col * dn[..., None]
    return F.stack(under + [F.solid(A, np.clip(col, 0, 1))])


# ====================================================================== 签名字「岛」：像素金，连着倒挂的岩体


def render_hero(C, G, tok):
    px = C.px
    H = C.R(G['hero'], ss=3)
    R = C.R(G['rock'], ss=3)
    Ro = C.R(G['roots'], ss=3)
    allm = np.clip(H + R + Ro, 0, 1)
    under, K = game_type(C, allm)
    gd = golds(tok)
    # ---- 岛：四档平涂金。本色一整片；下部两成落一档（交界棋盘格）；朝光的左上沿两格亮、右下沿两格暗、最外一格最暗；上沿一格近白
    hb = [c for c in G['chars'] if c['ch'] == '岛'][0]
    t = np.clip((C.YY - hb['top']) / (hb['bottom'] - hb['top']), 0, 1)
    G4 = [F.rgb(c) for c in gd]
    col = np.zeros((C.H, C.W, 3), np.float32) + G4[2]
    col = np.where(step(C, t, 0.8, 0.08)[..., None], G4[1], col)
    hi = np.clip(rim(C, H, 0, -1, 2) + rim(C, H, -1, 0, 2), 0, 1)
    lo2 = np.clip(rim(C, H, 1, 1, 2), 0, 1) * (1 - hi)
    lo1 = np.clip(rim(C, H, 1, 1, 1), 0, 1) * (1 - hi)
    col = np.where((hi > 0.5)[..., None], G4[3], col)
    col = np.where((lo2 > 0.5)[..., None], G4[1], col)
    col = np.where((lo1 > 0.5)[..., None], G4[0], col)
    tr = rim(C, H, 0, -1, 1)
    col = col + (F.rgb('#FFF8E4') - col) * (tr[..., None] * 0.9)
    hero = F.solid(H, np.clip(col, 0, 1))
    # ---- 岩体：同一副金，在背光里。主棱左边受光（暗金），右边背光（暗紫褐），尖上最暗；主尖附近下半抖进翠绿的反光
    rx = G['ridges'][0][0][0]
    rt = np.clip((C.YY - G['rock_top']) / 75.0, 0, 1)
    left = C.XX < rx - (C.YY - G['rock_top']) * 0.05
    rcol = np.where(left[..., None], F.rgb(gd[0]), F.rgb('#4E3A4C'))
    deep = step(C, rt, 0.72, 0.1)
    rcol = np.where((deep & ~left)[..., None], F.rgb('#2E1F44'), rcol)
    rcol = np.where((deep & left)[..., None], F.rgb('#5E4B3E'), rcol)
    gl = np.clip(1 - np.sqrt((C.XX - G['drip_at'][0]) ** 2 + (C.YY - G['drip_at'][1] + 30) ** 2) / 60, 0, 1)
    rcol = np.where(step(C, gl, 0.5, 0.25)[..., None] & (R[..., None] > 0), F.rgb('#2F7A62'), rcol)
    # 岩体上沿：一格翠绿的苔线（草顶从下面看见的那一沿），下面一格暗金
    moss = top_rim(C, R)
    moss2 = np.clip(top_rim(C, R, 2) - moss, 0, 1)
    rcol = rcol * (1 - moss[..., None]) + F.rgb('#7FD6A4') * moss[..., None]
    rcol = rcol * (1 - moss2[..., None]) + F.rgb('#3E8C68') * moss2[..., None]
    # 棱线：一格亮金的线（只在受光的那几道）
    rid = C.zeros()
    for r in G['ridges']:
        rid = np.maximum(rid, C.R(stroke_line(r, 1.6)))
    rcol = rcol + (F.rgb(gd[1]) - rcol) * (rid * R * 0.55)[..., None]
    rock = F.solid(R, np.clip(rcol, 0, 1))
    roots = F.solid(Ro, F.rgb(gd[0]))
    return F.stack(under + [roots, rock, hero])


def render_pebbles(C, G, tok):
    """岛旁边浮着的两粒小石子（和岩体同料）：单独一层，入场时比岛慢半拍浮上来"""
    gd = golds(tok)
    Pb = C.R(G['pebbles'], ss=3)
    under, K = game_type(C, Pb)
    # 小石子：上半暗金、下半暗紫褐，上沿一格苔线
    pt = np.clip(Pb - F.shift(Pb, 0, CELL * C.scale), 0, 1)
    pcol = np.zeros((C.H, C.W, 3), np.float32) + F.rgb('#4E3A4C')
    for q in G['pebbles'].contours:
        b = q.bounds
        upper = (C.YY < (b[1] + b[3]) / 2 - 1)
        pm = C.R(q, ss=3) > 0.01
        pcol = np.where((pm & upper)[..., None], F.rgb(gd[0]), pcol)
    pcol = pcol * (1 - pt[..., None]) + F.rgb('#7FD6A4') * pt[..., None]
    return F.stack(under + [F.solid(Pb, pcol)])


# ====================================================================== 晶簇和滴（翠绿）


def render_crystal(C, G, tok):
    px = C.px
    out = []
    M = C.zeros()
    for cp in G['crystals']:
        M = np.maximum(M, C.R(cp, ss=3))
    glow = F.outer_glow(M, px(14), spread=px(2))
    out.append(F.glow_layer(glow * 0.55, '#3FA47E'))
    K = F.outer_stroke(M, px(1.6))
    out.append(F.solid(K, OUTLINE))
    # 每根晶体：左半受光、右半背光，尖上一格亮；按像素格三档
    col = np.zeros((C.H, C.W, 3), np.float32)
    for cp in G['crystals']:
        m = C.R(cp, ss=3)
        b = cp.bounds
        cx = (b[0] + b[2]) / 2
        side = C.XX - cx
        cc = np.where((side < 0)[..., None], F.rgb('#5CC796'), F.rgb('#2A876A'))
        tip = (C.YY - b[1]) / (b[3] - b[1] + 1e-3) > 0.8
        cc = np.where((tip & (side < 0))[..., None], F.rgb('#A8F0CA'), cc)
        col = np.where(m[..., None] > 0.01, cc, col)
    k = CELL * C.scale
    tr = top_rim(C, M)
    col = col + (F.rgb('#F0FFF6') - col) * (np.clip(M - F.shift(M, k, 0), 0, 1) * 0.6)[..., None]
    out.append(F.solid(M, np.clip(col, 0, 1)))
    return F.stack(out)


def render_drip(C, G, tok):
    """主尖下那一滴翠绿（航路的起点）：单独一层，入场时在尖上结出来、落到位"""
    px = C.px
    k = CELL * C.scale
    D = C.R(G['drip'], ss=3)
    out = [F.glow_layer(F.outer_glow(D, px(14), spread=px(2)) * 0.55, '#3FA47E'), F.solid(F.outer_stroke(D, px(1.6)), OUTLINE)]
    # 滴：亮翠绿，左上一格白
    dc = np.zeros((C.H, C.W, 3), np.float32) + F.rgb('#8FF0BE')
    dtr = np.clip(D - F.shift(D, k, k), 0, 1)
    dc = dc + (1 - dc) * dtr[..., None] * 0.9
    out.append(F.glow_layer(F.outer_glow(D, px(6)) * 0.9, '#7FF0B8'))
    out.append(F.solid(D, dc))
    return F.stack(out)


# ====================================================================== 主体元素：小浮石上的像素宝箱


def render_emblem(C, G, tok):
    E = G['emblem']
    gd = golds(tok)
    cols = {'o': OUTLINE, '1': gd[0], '2': gd[1], '3': gd[2], '4': gd[3], 'l': '#FFF4C8', 'k': OUTLINE,
            'G': '#7FD6A4', 'g': '#3E8C68', 'R': gd[0], 'r': '#4E3A4C', 'd': '#2E1F44'}
    s = C.scale
    a = C.zeros()
    col = np.zeros((C.H, C.W, 3), np.float32)
    for x, y, c, k in E['cells']:
        x0, y0 = int(round(x * s)), int(round(y * s))
        x1, y1 = int(round((x + c) * s)), int(round((y + c) * s))
        a[y0:y1, x0:x1] = 1
        col[y0:y1, x0:x1] = F.rgb(cols[k])
    d = C.px(DROP)
    sh = np.clip(F.shift(a, d, d) - a, 0, 1)
    halo = F.outer_glow(a, C.px(8), spread=C.px(1))
    return F.stack([F.solid(halo * 0.4, '#4B4FA0'), F.solid(sh, SHADOW), F.solid(a, col)])


# ====================================================================== 底


def render_plate(C, G, tok):
    px, XX, YY = C.px, C.XX, C.YY
    world, deep, pale = tok['world'], tok['worldDeep'], tok['worldPale']
    smoke = F.fbm(C.H, C.W, 90, 61, octaves=6)
    smoke = F.warp(smoke, F.fbm(C.H, C.W, 130, 62), F.fbm(C.H, C.W, 130, 63), px(36))
    # 形：两团（两段字后面、岛和宝箱后面）连成一条往右上斜的长条，边被噪声吃进去；下沿是一道云
    blobs = [(330, 300, 290, 140, 1.0), (660, 220, 190, 160, 1.0), (790, 385, 190, 70, 0.9), (230, 370, 200, 70, 0.9)]
    shape = np.maximum.reduce([np.clip(1.1 - (((XX - e[0]) / e[2]) ** 2 + ((YY - e[1]) / e[3]) ** 2), 0, 1) * e[4] for e in blobs])
    a = F.smoothstep(0.24, 0.56, shape + (smoke - 0.5) * 0.5 + (F.fbm(C.H, C.W, 22, 64, octaves=5) - 0.5) * 0.16)
    # 干笔：几道横扫
    br = F.fbm(C.H, C.W, 24, 66, octaves=5, aniso=(9.0, 0.35))
    for (x0, x1, y, h) in ((60, 560, 404, 26), (420, 940, 126, 20), (520, 960, 452, 16)):
        m = F.blur(C.R(rect(x0, y - h / 2, x1, y + h / 2)), px(h * 0.25))
        u = (XX - x0) / (x1 - x0)
        env = F.smoothstep(0, 0.3, u) * F.smoothstep(1, 0.7, u)
        a = np.maximum(a, F.smoothstep(0.3, 0.6, m * env + (br - 0.5) * 0.7 * (1.2 - m * env)) * np.clip(F.blur(m * env, px(8)) * 4, 0, 1) * 0.85)
    a = a * F.smoothstep(0, 30, XX) * F.smoothstep(0, 30, C.w - XX) * F.smoothstep(0, 24, YY) * F.smoothstep(0, 24, C.h - YY)
    # 颜色：暮色群青，中间亮四周沉；岛下一团翠绿，岛顶一层暖金
    col = np.zeros((C.H, C.W, 3), np.float32) + F.rgb(deep)
    wisp = F.smoothstep(0.38, 0.85, smoke)
    col = F.mix(col, F.rgb(world)[None, None], (np.clip(shape, 0, 1) * 0.7 + wisp * 0.3)[..., None] * 0.85)
    col = F.mix(col, F.rgb(mixh(world, '#8C8FE0', 0.35))[None, None], (F.smoothstep(0.7, 0.95, smoke) * np.clip(shape, 0, 1) * 0.35)[..., None])
    dc = G['drip_at']
    rg = np.sqrt((XX - dc[0]) ** 2 + ((YY - dc[1] + 20) * 1.3) ** 2)
    col = col + F.rgb(pale) * (np.exp(-(rg / 120.0) ** 2) * 0.55)[..., None]
    hc = G['isle_c']
    rh = np.sqrt((XX - hc[0]) ** 2 + ((YY - hc[1]) * 1.4) ** 2)
    col = col + F.rgb('#B98A3A') * (np.exp(-(rh / 150.0) ** 2) * 0.28)[..., None]
    # 像素方格光：岛顶附近金、岛底附近翠绿，像纹理一样散开（每格 6 舞台像素，格间 2）
    q = 6.0
    gx, gy = np.floor(XX / q), np.floor(YY / q)
    inner = ((XX - gx * q) < 4) & ((YY - gy * q) < 4)
    rnd = np.random.default_rng(7).random((int(C.h / q) + 2, int(C.w / q) + 2)).astype(np.float32)
    r_cell = rnd[gy.astype(np.int32), gx.astype(np.int32)]
    cxq, cyq = (gx + 0.5) * q, (gy + 0.5) * q
    fg = np.exp(-(((cxq - hc[0] - 40) / 120) ** 2 + ((cyq - hc[1] + 60) / 70) ** 2))
    fe = np.exp(-(((cxq - dc[0]) / 80) ** 2 + ((cyq - dc[1] + 30) / 50) ** 2))
    on_g = (r_cell < fg * 0.3) & inner
    on_e = (r_cell < fe * 0.35) & inner & ~on_g
    bright = 0.25 + 0.55 * rnd[(gy.astype(np.int32) + 7) % rnd.shape[0], (gx.astype(np.int32) + 3) % rnd.shape[1]]
    calm = np.clip(F.blur(C.R(G['text']), px(6)) * 2.5, 0, 1)
    col = col + F.rgb('#F4C43E') * (on_g * bright * fg * (1 - calm) * 0.55)[..., None]
    col = col + F.rgb('#4FC495') * (on_e * bright * fe * (1 - calm) * 0.6)[..., None]
    # 方的像素星：2–3 像素的方点，少数是五格的小十字
    rng = np.random.default_rng(31)
    stars = C.zeros()
    for _ in range(70):
        x, y = rng.random() * C.w, rng.random() * C.h
        s = 2 if rng.random() < 0.7 else 3
        v = 0.35 + rng.random() * 0.55
        x0, y0 = int(round(x / 2) * 2 * C.scale), int(round(y / 2) * 2 * C.scale)
        stars[y0:y0 + s * C.scale, x0:x0 + s * C.scale] = v
        if rng.random() < 0.12:
            c2 = 2 * C.scale
            stars[y0 - c2:y0 + c2 + s * C.scale, x0:x0 + s * C.scale] = v
            stars[y0:y0 + s * C.scale, x0 - c2:x0 + c2 + s * C.scale] = v
    stars = stars * (a > 0.3) * (1 - calm)
    col = col + (F.rgb('#F6EEDA') - col) * (stars * 0.8)[..., None]
    col = col * (1 + (F.grain(C.H, C.W, 21, 0.8)[..., None] - 0.5) * 0.08)
    return F.solid(a * 0.96, np.clip(col, 0, 1))


def render_bar(C, G, tok):
    """第二段的菜单选中条：暮色群青，四角两级像素台阶，上沿一格亮线；左端光标那一格更亮（选中）"""
    x0, y0, x1, y1 = G['bar']
    c = 3.0
    shape = union(rect(x0 + 2 * c, y0, x1 - 2 * c, y1), rect(x0 + c, y0 + c, x1 - c, y1 - c), rect(x0, y0 + 2 * c, x1, y1 - 2 * c))
    m = C.R(shape)
    u = np.clip((C.XX - x0) / (x1 - x0), 0, 1)
    col = F.ramp(u, [(0, mixh(tok['world'], '#6A74D8', 0.35)), (0.35, tok['world']), (1, mixh(tok['world'], tok['worldDeep'], 0.5))])
    k = C.scale * c
    tr = np.clip(m - F.shift(m, 0, k / 1.5), 0, 1)
    col = col + (F.rgb('#8C96E8') - col) * (tr * 0.7)[..., None]
    fade = F.smoothstep(x1, x1 - 160, C.XX)          # 右端淡进底板
    return F.solid(m * (0.55 + 0.4 * fade), col)


# ====================================================================== 英文


def render_ghost(C, G, tok):
    """LEGEND：明度比底板高一档、读得出；字面一层暮色的竖向渐变，下沿抖进底板（像素格抖动）"""
    GH = G['ghost']
    m = C.R(GH['path'], ss=3)
    t = np.clip((C.YY - GH['top']) / max(1, GH['cap']), 0, 1)
    col = F.ramp(t, [(0, mixh(tok['world'], '#A9B0F4', 0.5)), (0.55, mixh(tok['world'], '#8790E0', 0.36)), (1, mixh(tok['world'], '#6A72C8', 0.2))])
    fade = on_cells(C, np.clip(1.3 - t * 0.55, 0, 1)) > bayer(C) * 0.9
    return F.solid(m * fade * 0.92, col)


def render_press(C, G, tok):
    """底线带 PRESS START（像素字，深紫一格硬投影）"""
    px = C.px
    caps = C.R(G['caps'], ss=2)
    return F.stack([F.solid(np.clip(F.shift(caps, px(1.5), px(1.5)) - caps, 0, 1) * 0.9, OUTLINE), F.solid(caps * 0.92, '#EEE7F6')])


def render_lead(C, G, tok):
    """PRESS START 后面那串像素珠点（浅金），引到滴落处"""
    return F.solid(C.R(G['leader'], ss=2) * 0.85, '#F0DEA6')


def render_small(C, G, tok):
    """of the Floating Isles：Didone 斜体小档"""
    sm = C.R(G['small_en'], ss=3)
    return F.stack([F.solid(F.outer_glow(sm, C.px(3)) * 0.5, '#131538'), F.solid(sm * 0.95, '#E6DDF2')])


def render_cursor(C, G, tok):
    """「传说」前的像素三角光标：宝箱金三档（上亮下暗）、深紫描边、一格硬投影"""
    px = C.px
    cur = C.R(G['cursor'], ss=2)
    gd = golds(tok)
    ct = np.clip((C.YY - G['cursor'].bounds[1]) / (G['cursor'].bounds[3] - G['cursor'].bounds[1]), 0, 1)
    ccol = palette(np.clip((ct * 3).astype(np.int32), 0, 2), [gd[3], gd[2], gd[1]])
    cK = F.outer_stroke(cur, px(1.6))
    csh = np.clip(F.shift(np.clip(cur + cK, 0, 1), px(3), px(3)) - np.clip(cur + cK, 0, 1), 0, 1)
    return F.stack([F.glow_layer(F.outer_glow(cur, px(6)) * 0.5, '#F4C43E'), F.solid(csh, SHADOW), F.solid(cK, OUTLINE), F.solid(cur, ccol)])


# ====================================================================== 高光


def plus(C, x, y, arm, v=1.0, w=1):
    """像素十字闪点：中心一格、四臂各 arm 格（一格 CELL）"""
    m = C.zeros()
    s = C.scale
    c = CELL
    x0, y0 = int(round(x / c) * c * s), int(round(y / c) * c * s)
    cc = int(c * s)
    m[y0 - arm * cc:y0 + (arm + 1) * cc, x0:x0 + cc * w] = v * 0.85
    m[y0:y0 + cc * w, x0 - arm * cc:x0 + (arm + 1) * cc] = v * 0.85
    m[y0:y0 + cc, x0:x0 + cc] = v
    return m


def render_fx(C, G, tok):
    px, XX, YY = C.px, C.XX, C.YY
    out = []
    H = C.R(G['hero'], ss=2)
    # 岛顶的金光：贴着字的一层暖晕
    out.append(F.glow_layer(F.outer_glow(H, px(12), spread=px(1)) * 0.28, '#FFC850'))
    # 宝箱盖缝的光：往上扇开的一道、一圈窄暖晕
    gx, gy = G['emblem']['gap']
    fan = np.clip(1 - np.abs(XX - gx) / (34 + (gy - YY) * 0.35), 0, 1) * np.clip((gy - YY) / 70, 0, 1) * np.exp(-np.clip(gy - YY, 0, None) / 60)
    out.append(F.glow_layer(F.blur(fan, px(4)) * 0.22, '#FFD866'))
    out.append(F.glow_layer(np.exp(-(((XX - gx) / 46) ** 2 + ((YY - gy) / 3.5) ** 2)) * 0.55, '#FFE9A8'))
    # 像素十字闪点：岛的受光边上三颗、宝箱上一颗、光标边一颗
    hb = G['hero'].bounds
    m = C.zeros()
    for (x, y, arm) in ((hb[0] + 52, hb[1] + 14, 3), (hb[2] - 30, hb[1] + 52, 2), (hb[0] + 18, hb[1] + 96, 2)):
        m = np.maximum(m, plus(C, x, y, arm))
    ex = G['emblem']['chest_box']
    m = np.maximum(m, plus(C, ex[0] + 6, ex[1] + 4, 2))
    out.append(F.glow_layer(F.blur(m, px(1.2)) * 0.8, '#FFE7A0'))
    out.append(F.glow_layer(m * 1.1, '#FFFDF2'))
    # 金尘：宝箱上面浮着的几粒方金点
    rng = np.random.default_rng(5)
    d = C.zeros()
    for _ in range(12):
        x = gx + (rng.random() - 0.5) * 90
        y = gy - 16 - rng.random() * 70
        s = 2 if rng.random() < 0.7 else 3
        x0, y0 = int(round(x / 2) * 2 * C.scale), int(round(y / 2) * 2 * C.scale)
        d[y0:y0 + s * C.scale, x0:x0 + s * C.scale] = 0.4 + rng.random() * 0.5
    out.append(F.glow_layer(d, '#FFE08A'))
    return F.stack(out)


# ====================================================================== 小形态


def small_face(C, mask, tone):
    """小形态里签名字「岛」的面：三档像素金（上亮下暗），深紫描边"""
    t = np.clip((C.YY - C.YY[mask > 0.5].min() if (mask > 0.5).any() else 0) / max(1.0, C.h * 0.8), 0, 1)
    if tone in ('ink', 'stamp-ink'):
        cols = ['#6E5420', '#8E6E28', '#A8842F']
    else:
        cols = ['#BC983C', '#F4C43E', '#FBE39F']
    idx = np.clip(((1 - t) * 3).astype(np.int32), 0, 2)
    col = palette(idx, cols)
    K = F.outer_stroke(mask, C.px(1.2))
    return F.stack([F.solid(K, OUTLINE), F.solid(mask, col)])

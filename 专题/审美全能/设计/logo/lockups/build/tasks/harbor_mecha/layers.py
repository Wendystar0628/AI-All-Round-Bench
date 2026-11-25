"""08 雨夜港口的巨型机甲 · 颜色层：每层一个 render(C, G, tok) -> 预乘 RGBA。

颜色角色（报告 2.4）：
  字面色    湿钢：冷银、竖向湿光，全组一种料（字、主体元素、细线共用）
  主题色    钢青：底板的雨雾、蓝图网格
  阴影色    钢青的暗调（不用纯黑）
  高光      受光一侧的边、钢圈左上一颗闪光、「夜」上那颗星
  点缀色    炉心橙：炉心为主；「甲」（签名字，和炉心同料）受热成片地暖过去为呼应，最靠近炉心的那道分缝里一线余热
  共用金属  亮钢（环、螺栓、钢轨）
"""
import numpy as np
import cv2
from lockupkit import fx as F
from lockupkit.geom import circle, ring, stroke_line, star4, rect

STEEL_DARK = '#0A1118'


# ====================================================================== 共用画法


def rim_toward(C, mask, width, center, power=1.5):
    """朝某一点（炉芯）那一侧的边亮一圈：内圈的装甲板被炉心的橙光照亮。"""
    d = F.dist_in(mask)
    band = np.clip(1 - d / width, 0, 1) * (mask > 0.02)
    sm = F.blur(mask, max(0.8, width * 0.6))
    gx, gy = F.grad(sm)
    nrm = np.sqrt(gx * gx + gy * gy) + 1e-6
    nx, ny = -gx / nrm, -gy / nrm
    lx, ly = (center[0] - C.XX) * C.scale, (center[1] - C.YY) * C.scale
    ll = np.sqrt(lx * lx + ly * ly) + 1e-6
    return band * np.clip((nx * lx + ny * ly) / ll, 0, 1) ** power * mask


def concentric_brush(C, c, seed, fine=0.6, coarse=9.0):
    """同心拉丝：沿半径方向的细纹（车床车出来的钢面）。"""
    r, th = C.polar(c)
    rng = np.random.default_rng(seed)
    n = 4096
    line = cv2.GaussianBlur(rng.random(n).astype(np.float32).reshape(1, -1), (0, 0), fine).ravel()
    line2 = cv2.GaussianBlur(rng.random(n).astype(np.float32).reshape(1, -1), (0, 0), coarse).ravel()
    idx = np.clip((r * C.scale * 2).astype(np.int32), 0, n - 1)
    v = line[idx] * 0.6 + line2[idx] * 0.4
    v = (v - v.mean()) / (v.std() + 1e-6)
    return v * (0.6 + 0.8 * F.fbm(C.H, C.W, 220, seed + 5, octaves=3))


def steel(C, mask, base, top, bevel_px=3.0, key=0.75, shadow=0.6, brush=None, brush_amt=0.05,
          core_rim=0.0, core_c=None, rim=0.9):
    """一块钢：竖向的明暗（上亮下暗）、拉丝、雕刻清晰的斜面、受光的边、朝炉芯一侧的橙边。返回预乘图层。"""
    b, t = F.rgb(base), F.rgb(top)
    rows = np.where(mask.max(axis=1) > 0.05)[0]
    y0, y1 = (rows[0], rows[-1]) if len(rows) else (0, C.H - 1)
    tt = np.clip((np.arange(C.H, dtype=np.float32)[:, None] - y0) / max(1, y1 - y0), 0, 1)
    col = np.broadcast_to(t * (1 - tt[..., None]) + b * tt[..., None], (C.H, C.W, 3)).copy()
    if brush is not None:
        col = col * (1 + brush[..., None] * brush_amt)
    hi, sh = F.bevel(mask, C.px(bevel_px), chisel=True, angle=120, altitude=32)
    col = col + (1 - col) * (hi[..., None] * key)
    col = col * (1 - sh[..., None] * shadow) + F.rgb(STEEL_DARK) * (sh[..., None] * shadow)
    if rim:
        col = col + (1 - col) * F.rim_light(mask, C.px(0.9), angle=120, power=2.0)[..., None] * rim
    if core_rim and core_c is not None:
        col = col + F.rgb('#FF8C40') * rim_toward(C, mask, C.px(1.6), core_c)[..., None] * core_rim
    return F.solid(mask, np.clip(col, 0, 1.2))


def seam_mask(C, seams, widen=1.0):
    m = C.zeros()
    for s in seams:
        m = np.maximum(m, C.R(stroke_line(s['pts'], s['w'] * widen, cap='square')))
    return m


def droplets(C, A, seed, count, rmin=1.3, rmax=3.4, where=None):
    """湿钢上的水珠：接触阴影、折射的暗体、左上一点高光、下沿一线亮；少数挂着往下的水痕。返回 (乘暗, 提亮, 水痕)。"""
    rng = np.random.default_rng(seed)
    W, H = C.W, C.H
    inner = F.erode(A, C.px(3.2))
    prob = inner if where is None else inner * where
    p = prob.ravel().astype(np.float64)
    if p.sum() <= 0:
        return np.zeros_like(A), np.zeros_like(A), np.zeros_like(A)
    idx = rng.choice(p.size, size=count * 3, p=p / p.sum())
    pts = []
    for i in idx:
        y, x = divmod(int(i), W)
        r = rng.uniform(rmin, rmax) * C.scale
        if all((x - qx) ** 2 + (y - qy) ** 2 > (r + qr + 6) ** 2 for qx, qy, qr in pts):
            pts.append((x, y, r))
        if len(pts) >= count:
            break
    dark, lite, trails = C.zeros(), C.zeros(), C.zeros()
    S = 16
    for x, y, r in pts:
        cv2.ellipse(dark, (int((x + r * 0.25) * S), int((y + r * 0.45) * S)), (int(r * 1.05 * S), int(r * 0.95 * S)), 0, 0, 360, 0.55, -1, cv2.LINE_AA, 4)
        cv2.ellipse(dark, (int(x * S), int((y - r * 0.18) * S)), (int(r * 0.85 * S), int(r * 0.62 * S)), 0, 0, 360, 0.35, -1, cv2.LINE_AA, 4)
        cv2.ellipse(lite, (int(x * S), int((y + r * 0.1) * S)), (int(r * 0.7 * S), int(r * 0.62 * S)), 0, 20, 160, 0.55, max(1, int(r * 0.22)), cv2.LINE_AA, 4)
        cv2.circle(lite, (int((x - r * 0.38) * S), int((y - r * 0.4) * S)), max(1, int(r * 0.26 * S)), 1.0, -1, cv2.LINE_AA, 4)
        if rng.random() < 0.35:
            L = rng.uniform(6, 26) * C.scale
            cv2.line(trails, (int(x * S), int((y + r) * S)), (int((x + L * 0.08) * S), int((y + r + L) * S)), 0.6, max(1, int(r * 0.5)), cv2.LINE_AA, 4)
    return F.blur(dark, 0.9) * A, F.blur(lite, 0.5) * A, F.blur(trails, 1.0) * A


def char_t(C, chars):
    """每个字自己的竖向位置 t（0 顶 1 底），铺竖向渐变用。"""
    t = C.zeros()
    for c in chars:
        m = C.R(c['path'])
        tt = np.clip((C.YY - c['top']) / (c['bottom'] - c['top']), 0, 1)
        t = np.where(m > 0.01, tt, t)
    return t


# ====================================================================== 汉字


HEAT = [(0.0, '#FF8E48'), (0.35, '#F39A5C'), (0.7, '#D9AA88'), (1.0, '#B4C2CF')]


def render_text(C, G, tok):
    A = C.R(G['text'], ss=3)
    t = char_t(C, G['chars'])
    S = seam_mask(C, G['seams'])
    lit_S = seam_mask(C, [s for s in G['seams'] if s.get('lit')])
    hero = C.R(G['hero'], ss=3)
    XX, YY = C.XX, C.YY
    emb = G['emblem']['c']
    r_emb, _ = C.polar(emb)
    px = C.px

    # ---- 主色：发光的冷纸白，往字脚沉到浅钢青（每个字自己的上下）
    col = F.ramp(t, [(0.0, '#FFFFFF'), (0.5, '#F3F6F8'), (0.85, '#D6DFE7'), (1.0, '#B4C3D1')])
    # 第二色：钢青像水彩一样从字脚往上洇，前沿一道水渍线
    wsrc = np.clip((t - 0.25) / 0.75, 0, 1) ** 1.6
    wn = F.fbm(C.H, C.W, 38, 11, octaves=5)
    wn = F.warp(wn, F.fbm(C.H, C.W, 60, 12), F.fbm(C.H, C.W, 60, 13), px(10))
    wf = wsrc * 0.9 + (wn - 0.5) * 0.55
    wash = F.smoothstep(0.30, 0.42, wf)
    tide = np.exp(-((wf - 0.33) / 0.025) ** 2) * wash
    col = F.mix(col, F.ramp(t, [(0.3, '#B8CADB'), (1.0, '#7F9CB9')]), (wash * 0.55)[..., None])
    col = col * (1 - tide[..., None] * 0.16)
    # 第三色：炉心的热——只在签名字「甲」上，从靠炉心的右上成片地暖过去（一片干净的晕，前沿一道积色），不进别的字
    hsrc = np.clip(1.0 - (r_emb - 150) / 150, 0, 1)
    hn = F.fbm(C.H, C.W, 80, 21, octaves=3)
    hf = hsrc * 0.95 + (hn - 0.5) * 0.22
    heat = F.smoothstep(0.42, 0.56, hf) * hero
    h_t = np.clip(1 - (hf - 0.42) / 0.5, 0, 1)
    h_front = np.exp(-((hf - 0.445) / 0.022) ** 2) * hero
    col = F.mix(col, F.ramp(h_t, HEAT), (heat * 0.62)[..., None])
    col = col * (1 - h_front[..., None] * 0.1)
    # 第四色：左上来的冷青反光，薄薄一层
    sheen_src = np.clip(1 - t * 1.6, 0, 1) * np.clip(1.2 - XX / 900, 0, 1)
    sheen = F.diffuse(C.H, C.W, 37, sheen_src, cell=60, threshold=0.58, softness=0.18, warp_px=16, edge=0.3, granule=0.2)
    col = col + (F.rgb('#DDF4FF') - col) * (sheen * 0.35)[..., None]
    # 字面闪点：只在上半，冷白
    gl_up = F.sparkles(C.H, C.W, 27, A * np.clip(1.0 - t * 1.6, 0, 1), 110, size=(0.45, 1.1), flare=0)
    col = col + (F.rgb('#FFFFFF') - col) * np.clip(gl_up * 0.7, 0, 1)[..., None]
    # 雨痕、湿钢的竖向反光、颗粒
    rs = F.blur(F.streaks(C.H, C.W, 5, density=0.014, length=(18, 90), angle=8, width=1.2), 0.7)
    col = col * (1 - rs[..., None] * 0.07) + rs[..., None] * 0.03
    vs = F.fbm(C.H, C.W, 30, 8, octaves=4, aniso=(0.18, 7.0))
    col = col * (1 + (vs[..., None] - 0.5) * 0.10)
    col = col * (1 + (F.grain(C.H, C.W, 9, 0.6)[..., None] - 0.5) * 0.025)

    # ---- 斜面：细的雕刻斜面，只让边有厚度
    hi, sh = F.bevel(A, px(1.5), chisel=True, angle=120, altitude=34)
    col = col + (1 - col) * hi[..., None] * 0.5
    col = col * (1 - sh[..., None] * 0.42) + F.rgb('#243444') * sh[..., None] * 0.42
    col = col + (1 - col) * F.rim_light(A, px(0.7), angle=120, power=2.5)[..., None] * 0.9

    # ---- 装甲分层：粗笔画里沿边刻一道内线，细笔画不刻
    dA = F.dist_in(A)
    local = cv2.dilate(dA, np.ones((int(px(9)), int(px(9))), np.uint8))
    thick_m = F.smoothstep(px(6.5), px(8.5), local)
    groove = np.exp(-((dA - px(3.0)) / px(0.42)) ** 2) * thick_m
    ridge = np.exp(-((dA - px(3.9)) / px(0.4)) ** 2) * thick_m
    gx_, gy_ = F.grad(F.blur(dA, 1.0))
    face = (gx_ * -0.5 + gy_ * -0.866) / (np.sqrt(gx_ ** 2 + gy_ ** 2) + 1e-6)
    col = col * (1 - groove[..., None] * 0.42)
    col = col + (1 - col) * (ridge * np.clip(0.5 - face * 0.5, 0, 1) * 0.55)[..., None]

    # ---- 分缝的缝口：暗的刻槽、下沿一丝冷的受光（只有亮的那一道缝里漏一线余热，在字外画）
    near = F.dilate(S, px(1.2)) * A
    col = col * (1 - near[..., None] * 0.35)

    # ---- 水珠
    dk, lt, tr = droplets(C, A, 77, 26, rmin=1.1, rmax=2.6, where=np.clip(0.2 + t, 0, 1))
    col = col * (1 - dk[..., None] * 0.35)
    col = col + (1 - col) * lt[..., None] * 0.9
    col = col + (1 - col) * tr[..., None] * 0.14
    fill = F.solid(A, np.clip(col, 0, 1))

    # ---- 字外
    k1 = F.outer_stroke(A, px(1.4))
    ext = C.zeros()
    ext_c = np.zeros((C.H, C.W, 3), np.float32)
    steps = int(px(4.2))
    for i in range(steps, 0, -1):     # 钢板的厚度：往右下挤出 4px 的侧面，近处钢青、远处沉到暗
        m = F.shift(A, i * 0.42, i * 1.0)
        c_ = F.mix(F.rgb('#4A6075'), F.rgb('#0E161E'), i / steps)
        ext_c = ext_c * (1 - m[..., None]) + c_ * m[..., None]
        ext = np.maximum(ext, m)
    ext = ext * (1 - A)
    shadow = F.drop_shadow(A, px(2.5), px(4.0), px(3.0), spread=px(1.0))
    halo = F.outer_glow(A, px(12), spread=px(1.5), gain=1.0)
    ember_glow = F.outer_glow(hero, px(9), spread=px(1)) * np.exp(-np.maximum(r_emb - 70, 0) / 90.0)
    seam_glow = (F.blur(lit_S, px(0.5)) * 1.3 + F.blur(lit_S, px(1.6)) * 0.35) * F.dilate(A, px(1.0))
    seam_dark = S * F.dilate(A, px(1.0)) * (1 - lit_S)
    bloom = F.outer_glow(A, px(5), spread=px(0.5), gain=1.0)
    layers = [
        F.solid(halo * 0.55, '#3A5876'),
        F.glow_layer(bloom * 0.22, '#CFE6FA'),
        F.glow_layer(ember_glow * 0.22, '#FF6A20'),
        F.solid(shadow * 0.85, '#03070B'),
        F.solid(np.clip(k1 + A, 0, 1), STEEL_DARK),
        F.solid(ext, ext_c),
        fill,
        F.solid(seam_dark, '#0B141C'),
        F.glow_layer(seam_glow, '#FF8E42'),
    ]
    return F.stack(layers)


_TEXT = {}


def _text_cached(C, G, tok):
    k = id(G)
    if k not in _TEXT:
        _TEXT.clear()
        _TEXT[k] = render_text(C, G, tok)
    return _TEXT[k]


def _line_mask(C, G):
    """把整层字（连同它的光晕、影子）按“离哪一段字近”切成两半：1 是第一段（雨夜港口和钢杆），0 是第二段（的、巨型机甲）。
    硬切（只取 0 或 1），两半叠回去和整层一模一样。"""
    d1 = F.dist_out(C.R(G['line1']))
    d2 = F.dist_out(C.R(G['line2']))
    return (d1 <= d2).astype(np.float32)


def render_text_a(C, G, tok):
    """第一段「雨夜港口」连同雨夜的钢梁、插进炉心的钢杆"""
    return _text_cached(C, G, tok) * _line_mask(C, G)[..., None]


def render_text_b(C, G, tok):
    """第二段「的 巨型机甲」连同液压杆"""
    return _text_cached(C, G, tok) * (1 - _line_mask(C, G))[..., None]


# ====================================================================== 主体：炉心


def _emblem_parts(C, G, tok):
    E = G['emblem']
    c = E['c']
    r, th = C.polar(c)
    brush = concentric_brush(C, c, 3)
    band, bezel = C.R(E['band']), C.R(E['bezel'])
    plates, bolts, holes = C.R(E['plates'], ss=3), C.R(E['bolts'], ss=3), C.R(E['bolt_holes'], ss=3)
    back = C.R(circle(c[0], c[1], E['band_r'][1] + 0.5))
    disc = F.solid(back, F.ramp(np.clip(r / 150, 0, 1), [(0, '#05080B'), (0.55, '#0B1117'), (1.0, '#111A22')]))
    shadow = F.drop_shadow(back, C.px(5), C.px(8), C.px(10), spread=C.px(2))
    outer = F.outer_glow(back, C.px(13), spread=C.px(3))
    band_l = steel(C, band, '#121B24', '#1E2A36', bevel_px=1.4, key=0.45, shadow=0.5, brush=brush, brush_amt=0.10, rim=0.6)
    bez_l = steel(C, bezel, '#5E6F80', '#B9C6D2', bevel_px=2.0, key=0.85, shadow=0.7, brush=brush, brush_amt=0.16,
                  core_rim=0.6, core_c=c, rim=1.0)
    pl_l = steel(C, plates, '#3D4E5E', '#93A6B8', bevel_px=3.2, key=0.8, shadow=0.75, brush=brush, brush_amt=0.12,
                 core_rim=1.3, core_c=c, rim=1.0)
    # 板面靠里的一半被炉心烤暖：一片干净的晕（和「甲」上的热同一种颜色）
    warm = np.clip(1 - (r - 80) / 26, 0, 1) ** 1.4 * plates
    pl_col = F.mix(F.unpremul(pl_l)[..., :3], F.rgb('#E8925A'), (warm * 0.55)[..., None])
    pl_l = F.solid(plates, pl_col)
    pl_l = F.over(pl_l, F.solid(C.R(ring(c[0], c[1], 107.2, 108.2)) * plates * 0.7, STEEL_DARK))
    seam_m = C.zeros()
    for s in E['plate_seams']:
        seam_m = np.maximum(seam_m, C.R(stroke_line(s['pts'], s['w'])))
    seam_glow = (F.blur(seam_m, C.px(0.5)) * 1.5 + F.blur(seam_m, C.px(2.5)) * 0.6) * C.R(ring(c[0], c[1], 78, 115))
    bolt_l = steel(C, bolts, '#6C7E8F', '#D7E0E8', bevel_px=1.6, key=0.9, shadow=0.7, rim=1.0)
    bolt_sh = F.drop_shadow(bolts, C.px(1.0), C.px(1.6), C.px(1.0))
    return {
        'housing': F.stack([F.solid(outer * 0.65, '#05080B'), F.solid(shadow * 0.85, '#020306'), disc, band_l, bez_l]),
        'glow': F.glow_layer(seam_glow, '#FF8A3A'),
        'plates': F.stack([pl_l, F.solid(bolt_sh * 0.6, '#020306'), bolt_l, F.solid(holes, '#0A0F14')]),
    }


_EMB = {}


def _emblem_cached(C, G, tok):
    k = id(G)
    if k not in _EMB:
        _EMB.clear()
        _EMB[k] = _emblem_parts(C, G, tok)
    return _EMB[k]


def render_housing(C, G, tok):
    """炉心的壳：暗底盘、环带、亮钢的外圈（空的形状，先出来）"""
    return _emblem_cached(C, G, tok)['housing']


def render_plate_glow(C, G, tok):
    """装甲板之间的缝里透出的炉火（点火以后才亮）"""
    return _emblem_cached(C, G, tok)['glow']


def render_plates(C, G, tok):
    """八块装甲板和螺栓（拧进来锁死）"""
    return _emblem_cached(C, G, tok)['plates']


def render_emblem(C, G, tok):
    """整个炉心外壳（检查用）"""
    P = _emblem_cached(C, G, tok)
    return F.stack([P['housing'], P['glow'], P['plates']])


def render_core(C, G, tok):
    """炉芯的光：在涡轮叶后面，从叶缝里透出来。"""
    E = G['emblem']
    c = E['c']
    r, th = C.polar(c)
    I = (np.exp(-(r / 22.0) ** 2) * 2.4 + np.exp(-(r / 46.0) ** 2) * 0.85 + 0.10) * (0.85 + 0.15 * np.sin(th * 16 + r * 0.25))
    col = F.ramp(np.clip(I / 2.4, 0, 1), [(0, '#2A0C06'), (0.12, '#7A2410'), (0.3, '#D24F1C'), (0.5, '#FF7A2A'), (0.78, '#FFB070'), (1.0, '#FFF1DC')])
    return F.solid(C.R(circle(c[0], c[1], 79)), col)


def render_vanes(C, G, tok):
    E = G['emblem']
    c = E['c']
    r, th = C.polar(c)
    vanes, hub, rim = C.R(E['vanes'], ss=3), C.R(E['vane_hub'], ss=3), C.R(E['vane_rim'], ss=3)
    brush = concentric_brush(C, c, 8, fine=0.5)
    v_l = steel(C, vanes, '#1C2630', '#55687A', bevel_px=1.5, key=0.7, shadow=0.6, brush=brush, brush_amt=0.08,
                core_rim=1.6, core_c=c, rim=0.8)
    v_l = F.over(v_l, F.glow_layer(np.clip(1 - (r - 44) / 34, 0, 1) ** 1.5 * vanes * 0.25, '#FF7A2A'))
    v_sh = F.drop_shadow(vanes, C.px(0.8), C.px(1.2), C.px(1.2))
    rim_l = steel(C, rim, '#4A5B6B', '#AAB8C5', bevel_px=1.4, key=0.8, shadow=0.6, brush=brush, brush_amt=0.15, core_rim=0.8, core_c=c)
    hub_l = steel(C, hub, '#4A5B6B', '#C3CED8', bevel_px=1.6, key=0.85, shadow=0.6, brush=brush, brush_amt=0.15, core_rim=1.5, core_c=c)
    return F.stack([F.solid(v_sh * 0.7, '#140604'), v_l, rim_l, hub_l])


def render_delta(C, G, tok):
    E = G['emblem']
    c = E['c']
    r, th = C.polar(c)
    dm = C.R(E['delta'], ss=3)
    glow = F.glow_layer(np.clip(np.exp(-(r / 16.0) ** 2) * 1.8, 0, 2.0) * C.R(circle(c[0], c[1], 36)), '#FFD9A8')
    d_l = steel(C, dm, '#8A9AAA', '#E8EEF3', bevel_px=1.2, key=0.9, shadow=0.5, core_rim=1.8, core_c=c, rim=0.9)
    ax, ay = np.abs(C.XX - c[0]), np.abs(C.YY - c[1])
    streak = (np.exp(-(ay / 1.2) ** 2) * np.exp(-ax / 70.0) * 0.9 + np.exp(-(ay / 4.0) ** 2) * np.exp(-ax / 35.0) * 0.35) * F.smoothstep(240, 150, ax)
    bloom = np.exp(-(r / 70.0) ** 2) * 0.28
    return F.stack([glow, d_l, F.glow_layer(np.clip(streak + bloom, 0, 1.6), '#FFB27A')])


def render_ring(C, G, tok):
    """炉心环带上的刻字：亮钢的字压进暗环带（下沿一线亮、上沿一线暗）；左右两颗方位星"""
    EN = G['ring']
    m = C.R(EN['ring'], ss=3)
    stars = C.R(EN['stars'], ss=3)
    hi, sh = F.bevel(m, C.px(0.7), chisel=True, angle=120, altitude=40)
    col = np.zeros((C.H, C.W, 3), np.float32) + F.rgb('#A9BACA')
    col = col + (1 - col) * hi[..., None] * 0.6
    col = col * (1 - sh[..., None] * 0.5)
    return F.stack([F.solid(F.drop_shadow(m, C.px(0.5), C.px(0.8), C.px(0.5)) * 0.8, '#000000'), F.solid(m, col),
                    F.glow_layer(F.blur(stars, C.px(2.0)) * 0.9, '#FF8A3A'), F.solid(stars, '#FFE2C4')])


# ====================================================================== 底


def brush_stroke(C, x0, x1, y, h, seed, taper=0.18, bristle_cell=30):
    """一笔横向的干笔：中间实、两端被刷毛拉成一丝丝的飞白。返回覆盖率。"""
    rng = np.random.default_rng(seed)
    m = F.blur(C.R(rect(x0, y - h / 2, x1, y + h / 2)), C.px(h * 0.22))
    u = (C.XX - x0) / (x1 - x0)
    env = F.smoothstep(0, taper + rng.uniform(-0.05, 0.05), u) * F.smoothstep(1, 1 - taper - rng.uniform(-0.05, 0.05), u)
    br = F.fbm(C.H, C.W, bristle_cell, seed, octaves=5, aniso=(10.0, 0.35))
    m = m * env
    reach = np.clip(F.blur(m, C.px(h * 0.3)) * 4.0, 0, 1)
    return F.smoothstep(0.28, 0.55, m + (br - 0.5) * 0.7 * (1.2 - m)) * reach


def render_plate(C, G, tok):
    E = G['emblem']
    c = E['c']
    r, th = C.polar(c)
    XX, YY, px = C.XX, C.YY, C.px
    P = G['plate']
    smoke = F.fbm(C.H, C.W, 95, 61, octaves=6)
    smoke = F.warp(smoke, F.fbm(C.H, C.W, 140, 62), F.fbm(C.H, C.W, 140, 63), px(40))
    shapes = [np.clip(1.1 - (((XX - e[0]) / e[2]) ** 2 + ((YY - e[1]) / e[3]) ** 2), 0, 1) * e[4] for e in P['blobs']]
    shapes.append(np.clip(1.1 - (r / 178) ** 2, 0, 1))
    shape = np.maximum.reduce(shapes)
    a = F.smoothstep(0.26, 0.58, shape + (smoke - 0.5) * 0.55 + (F.fbm(C.H, C.W, 26, 64, octaves=5) - 0.5) * 0.18)
    strokes = C.zeros()
    for (x0, x1, y, h, sd) in P['strokes']:
        strokes = np.maximum(strokes, brush_stroke(C, x0, x1, y, h, sd, taper=0.32, bristle_cell=22))
    a = np.maximum(a, strokes * 0.85)
    base = np.clip(shape, 0, 1)
    spl = F.sparkles(C.H, C.W, 15, np.clip(F.dilate(a, px(22)) - a, 0, 1) * F.smoothstep(0.5, 0.7, smoke), 160, size=(0.6, 1.8), flare=0)
    a = np.clip(np.maximum(a, np.clip(spl, 0, 1) * 0.55), 0, 1)
    a = a * F.smoothstep(0, 30, XX) * F.smoothstep(0, 30, C.w - XX) * F.smoothstep(0, 26, YY) * F.smoothstep(0, 26, C.h - YY)
    calm = np.clip(F.blur(C.R(G['text']), px(22)) * 1.6, 0, 1)
    # 背景巨字后面要干净：网格、雨丝、网点、星尘都不进 BREAKER 的那一片
    quiet = 1 - np.clip(F.blur(C.R(G['ghost']['box']), px(14)) * 1.2, 0, 1)

    col = np.zeros((C.H, C.W, 3), np.float32) + F.rgb('#060B10')
    wisp = F.smoothstep(0.42, 0.85, smoke) * (1 - calm * 0.75)
    col = F.mix(col, F.rgb('#22384D')[None, None], (wisp * 0.9)[..., None])
    lit = F.smoothstep(0.70, 0.95, smoke) * (1 - calm * 0.9)
    col = F.mix(col, F.rgb('#4F7499')[None, None], (lit * 0.55 * (0.4 + 0.6 * quiet))[..., None])
    w2 = F.diffuse(C.H, C.W, 52, np.clip(base * 0.85 - 0.05, 0, 1), cell=64, threshold=0.6, softness=0.12, warp_px=20, edge=0.9, granule=0.55)
    col = F.mix(col, F.rgb('#2F5575')[None, None], (w2 * 0.45 * (0.5 + 0.5 * quiet))[..., None])
    col = col + F.rgb('#FF7A2A') * (np.exp(-(r / 185.0) ** 2) * (0.04 + 0.16 * wisp))[..., None]
    col = col + F.rgb('#7A6494') * (np.exp(-((r - 185) / 35.0) ** 2) * lit * 0.12)[..., None]
    # 蓝图网格：每 24px 一根，粗线每 5 格，只在噪声斑块里显出来
    g = C.zeros()
    step = 24 * C.scale
    ox, oy = 60 * C.scale, 30 * C.scale
    for x in range(ox % step, C.W, step):
        g[:, x:x + 1] = np.maximum(g[:, x:x + 1], 0.6 if ((x - ox) // step) % 5 == 0 else 0.28)
    for y in range(oy % step, C.H, step):
        g[y:y + 1, :] = np.maximum(g[y:y + 1, :], 0.6 if ((y - oy) // step) % 5 == 0 else 0.28)
    gm = F.smoothstep(0.4, 0.7, F.fbm(C.H, C.W, 120, 16, octaves=4)) * F.smoothstep(0.3, 0.8, base) * quiet
    col = col + F.rgb('#7393B2') * (g * gm * 0.22)[..., None]
    # 雨丝：和字里的雨刃同一个雨向
    rain = F.streaks(C.H, C.W, 17, density=0.010, length=(30, 160), angle=-G['rain_deg'], width=1.0) * a * quiet
    col = col + F.rgb('#A9BFD3') * (F.blur(rain, 0.6) * 0.22)[..., None]
    # 网点：第一段左后方一片，点径从左往右缩小
    hs = C.zeros()
    sp = 7 * C.scale
    x0, y0, x1, y1 = P['halftone']
    for yy in range(int(y0 * C.scale), int(y1 * C.scale), sp):
        for xx in range(int(x0 * C.scale), int(x1 * C.scale), sp):
            rr = (1 - (xx / C.scale - x0) / (x1 - x0)) ** 1.3 * sp * 0.44
            if rr > 0.6:
                cv2.circle(hs, (xx * 4, yy * 4), int(rr * 4), 1.0, -1, cv2.LINE_AA, 2)
    col = col + F.rgb('#5B7590') * (hs * F.smoothstep(0.3, 0.7, a) * quiet * 0.4)[..., None]
    # 星尘：零星的冷白，炉心附近几粒橙
    dust = F.sparkles(C.H, C.W, 19, a * (0.3 + base) * quiet, 420, size=(0.5, 1.4), flare=0.04)
    col = col + F.rgb('#C8D8E6') * (dust * 0.5)[..., None]
    edust = F.sparkles(C.H, C.W, 20, a * np.exp(-np.maximum(r - 100, 0) / 60), 40, size=(0.6, 1.6), flare=0)
    col = col + F.rgb('#FF9A50') * (edust * 0.8)[..., None]
    col = col * (1 + (F.grain(C.H, C.W, 21, 0.8)[..., None] - 0.5) * 0.10)
    return F.solid(a * 0.95, np.clip(col, 0, 1))


# ====================================================================== 英文


def render_ghost(C, G, tok):
    """BREAKER：模板喷字。字面实、边上一圈很窄的喷雾；明度贴近底板但读得出（比底板的雾亮一档）"""
    GH = G['ghost']
    m = C.R(GH['path'], ss=3)
    n = F.fbm(C.H, C.W, 6, 31, octaves=3)
    d_in, d_out = F.dist_in(m), F.dist_out(m)
    edge = np.clip(d_in / C.px(1.4), 0, 1)
    core = np.where(m > 0.5, np.clip(0.72 + edge * 0.28 - (1 - edge) * (n - 0.5) * 0.5, 0, 1), m)
    mist = np.exp(-d_out / C.px(1.6)) * (m < 0.5) * 0.25 * (0.6 + 0.8 * n)
    spray = F.sparkles(C.H, C.W, 33, np.exp(-d_out / C.px(4.0)) * (m < 0.5), 500, size=(0.4, 1.0), flare=0)
    a = np.clip(core + mist + spray * 0.35, 0, 1)
    t = np.clip((C.YY - (GH['base'] - GH['cap'])) / (GH['cap'] * 1.05), 0, 1)
    col = F.ramp(t, GH['colors'])
    col = col * (0.92 + 0.16 * F.fbm(C.H, C.W, 30, 34, octaves=5)[..., None])
    return F.solid(a * GH['alpha'], col)


def render_en(C, G, tok):
    caps = C.R(G['rail']['caps'], ss=3)
    return F.solid(caps * 0.9, '#B5C4D2')


# ====================================================================== 细线


def render_axis(C, G, tok):
    """蓝图的中线：炉心的水平轴线，往左伸到第一段下面、越远越淡"""
    E = G['emblem']
    c = E['c']
    XX = C.XX
    ax = C.R(rect(60, c[1] - 0.6, c[0] - E['R'] - 6, c[1] + 0.6)) * np.clip((XX - 60) / 300, 0, 1)
    ax2 = C.R(rect(c[0] + E['R'] + 6, c[1] - 0.6, 1040, c[1] + 0.6)) * np.clip((1040 - XX) / 120, 0, 1)
    m = np.maximum(ax, ax2)
    return F.solid(m * 0.55, '#8EA6BC')


def render_rail(C, G, tok):
    """第二段下面的甲板钢轨和铆钉"""
    rl = np.maximum(C.R(G['rail']['path'], ss=3), C.R(G['rail']['beads'], ss=3))
    hi, sh = F.bevel(rl, C.px(0.9), chisel=True)
    col = np.zeros((C.H, C.W, 3), np.float32) + F.rgb('#8FA3B6')
    col = col + (1 - col) * hi[..., None] * 0.7
    col = col * (1 - sh[..., None] * 0.6)
    return F.stack([F.solid(F.drop_shadow(rl, C.px(1), C.px(2), C.px(1.5)) * 0.8, '#03070B'), F.solid(rl, col)])


def render_geo_front(C, G, tok):
    """炉心的刻度外环（压在「甲」前面）"""
    E = G['emblem']
    m = np.maximum(C.R(E['hair'], ss=3), C.R(E['ticks'], ss=3))
    return F.stack([F.solid(F.blur(m, C.px(1.5)) * 0.35, '#9FB5CA'), F.solid(m * 0.85, '#CFDAE4')])


# ====================================================================== 高光


def render_fx(C, G, tok):
    """「夜」上那颗星（全件唯一，冷白，竖芒长）、字面上的闪点、钢圈左上一颗大闪光、炉心边上几粒余热火星"""
    XX, YY = C.XX, C.YY
    A = C.R(G['text'], ss=2)
    out = []
    sx, sy = G['star_at']
    st, st2 = C.R(star4(sx, sy, 11, 0.13, ry=30)), C.R(star4(sx, sy, 5.5, 0.2, rot=45))
    d2 = (XX - sx) ** 2 + (YY - sy) ** 2
    out.append(F.glow_layer(np.exp(-d2 / 260.0) * 0.55, '#7FB4E0'))
    out.append(F.glow_layer(F.blur(st, C.px(1.4)) * 0.8, '#BFE4FF'))
    out.append(F.glow_layer(st * 1.0 + st2 * 0.6 + np.exp(-d2 / 4.0) * 1.6, '#EAF6FF'))
    hi, _ = F.bevel(A, C.px(1.5), chisel=True, angle=120, altitude=34)
    sp = F.sparkles(C.H, C.W, 71, np.clip(hi - 0.5, 0, 1) * np.clip(1.3 - YY / 300, 0, 1), 60, size=(0.8, 2.2), flare=0.45)
    out.append(F.glow_layer(sp * 0.9, '#F2FAFF'))
    c = G['emblem']['c']
    near = F.blur(C.R(circle(c[0], c[1], 60)), C.px(20)) * 0.6
    es = F.sparkles(C.H, C.W, 72, np.clip(near, 0, 1), 12, size=(0.7, 1.6), flare=0.0)
    out.append(F.glow_layer(es * 0.9, '#FFB070'))
    gx, gy = c[0] - 0.68 * 119.5, c[1] - 0.73 * 119.5
    gl = C.R(star4(gx, gy, 9, 0.12)) + np.exp(-(((XX - gx) ** 2 + (YY - gy) ** 2) / 5.0)) * 1.2
    out.append(F.glow_layer(gl, '#F4FAFF'))
    return F.stack(out)

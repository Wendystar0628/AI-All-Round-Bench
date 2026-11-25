"""崩坏：星穹铁道 —— 组合、上色、出图。

    python sr.py preview     黑白小预览（work/sr_preview.png）
    python sr.py final       全尺寸分层、成品、黑白稿、检查图、网页素材
"""
import json
import math
import os
import sys
import numpy as np
from gb import Font, G, fx, output, latin, Canvas, fp, WORK, LOGOS, WEB
from util import unit, save_json, svg_d, bw_preview, point_at
import sr_glyphs as SG

S = 500.0
K = S / 1000.0
BASE = 900.0
X0 = 420.0
ADV = 545.0
SLK = math.tan(math.radians(SG.SLANT))
GOLD = '#E9C36E'

F_PF = os.path.join(r'C:\Windows\Fonts', 'PlayfairDisplay-VariableFont_wght.ttf')
F_PFI = os.path.join(r'C:\Windows\Fonts', 'PlayfairDisplay-Italic-VariableFont_wght.ttf')


def layout_items(res, x0, base, size, adv):
    out = []
    for i, r in enumerate(res):
        ch = r['char']
        ch.place(x0 + i * adv, base, size)
        strokes = [ch.layout(p) if list(p) else p for p in r['shapes']]
        out.append({'ch': r['ch'], 'char': ch, 'strokes': strokes, 'items': r['items'], 'anchors': r['anchors'],
                    'path': ch.layout(r['path']), 'font_shapes': r['shapes']})
    return out


def bez(p0, p1, p2, n=60):
    t = np.linspace(0, 1, n)[:, None]
    return (1 - t) ** 2 * p0 + 2 * (1 - t) * t * p1 + t ** 2 * p2


def arclen_param(P):
    d = np.linalg.norm(np.diff(P, axis=0), axis=1)
    s = np.concatenate([[0], np.cumsum(d)])
    return s / s[-1], s[-1]


def offset_curve(P, off):
    """折线 P 的每点沿左法向偏 off（数组或数）"""
    P = np.asarray(P, float)
    T = np.gradient(P, axis=0)
    T /= np.linalg.norm(T, axis=1, keepdims=True)
    N = np.stack([-T[:, 1], T[:, 0]], 1)
    off = np.broadcast_to(np.asarray(off, float), (len(P),))
    return P + N * off[:, None], T, N


def track(axis_layout):
    """高潮：铁轨。中线 = 道 的平捺（版面坐标），向右延伸、微微上扬，透视收窄。"""
    A = np.asarray(axis_layout, float)
    from glyphbase.geom import spline
    near = spline(A, 14)
    t_end = unit(near[-1] - near[-6])
    p0 = near[-1]
    p1 = p0 + t_end * 240 + np.array([0, -4])
    p2 = p0 + np.array([600, -150])
    far = bez(p0, p1, p2, 80)[1:]
    C = np.concatenate([near, far], 0)
    u, L = arclen_param(C)
    f = 1 - 0.84 * u ** 0.8                     # 透视：近处 1，远处 0.16
    G0 = 66.0
    gauge = G0 * f
    rw = np.maximum(14.0 * f, 2.4)
    railL, T, N = offset_curve(C, gauge / 2)
    railR, _, _ = offset_curve(C, -gauge / 2)
    rails = G.union(G.sweep(railL, list(rw), join='round'), G.sweep(railR, list(rw), join='round'))
    sleepers = []
    s = 12.0
    while True:
        uu = s / L
        if uu > 0.94:
            break
        q, d = point_at(C, uu)
        fu = 1 - 0.84 * uu ** 0.8
        n = np.array([-d[1], d[0]])
        half = (G0 * fu) / 2 + 17.0 * fu
        sleepers.append(G.slab(q - n * half, q + n * half, max(14.0 * fu, 2.0)))
        s += 40.0 * fu + 4.0
    sleepers = G.union(sleepers)
    return C, rails, sleepers, f


def ticket(cx, cy, w, h, rot):
    """主体元素：车票（星轨通票）。圆角矩形，左右各一个半圆缺口，右侧存根前一列打孔线。返回 (票面, 打孔, 存根中心)"""
    body = G.rect(cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2, r=12)
    notch = G.union(G.circle(cx - w / 2, cy, h * 0.15), G.circle(cx + w / 2, cy, h * 0.15))
    body = G.diff(body, notch)
    px_ = cx + w * 0.22
    holes = G.union([G.circle(px_, cy - h / 2 + 18 + k * 15.5, 4.2) for k in range(int((h - 30) / 15.5) + 1)])
    stub_c = (cx + w * 0.36, cy)
    body = G.rotate(body, rot, (cx, cy))
    holes = G.rotate(holes, rot, (cx, cy))
    r = math.radians(rot)
    sc = np.array(stub_c) - np.array([cx, cy])
    stub_c = (cx + sc[0] * math.cos(r) - sc[1] * math.sin(r), cy + sc[0] * math.sin(r) + sc[1] * math.cos(r))
    return body, holes, stub_c


def compose():
    main = SG.build('main')
    series = SG.build('series')
    M = layout_items(main, X0, BASE, S, ADV)
    text = G.union([g['path'] for g in M])

    # ---------------- 高潮：铁轨（道 的平捺）
    dao = M[3]
    rail_axis = [dao['char'].to_layout(p) for p in dao['anchors']['rail_axis']]
    C_track, rails, sleepers, f_track = track(rail_axis)
    far_end = C_track[-1]
    dest = far_end + unit(C_track[-1] - C_track[-4]) * 34
    dest_star = SG.star4(dest, 46, rot=90)

    # ---------------- 主体元素：车票，包住系列名「崩坏」
    em_top = BASE - 0.88 * S
    TW, TH, ROT = 480.0, 212.0, -7.0
    tcx, tcy = X0 + 205, em_top - 168
    tk_body, tk_holes, stub_c = ticket(tcx, tcy, TW, TH, ROT)
    s2 = 112.0
    SRs = layout_items(series, 0, 0, s2, s2 * 1.0)
    ser = G.union([g['path'] for g in SRs])
    sb = G.bounds(ser)
    ser = G.move(ser, tcx - TW * 0.41 - sb[0], tcy - 22 - sb[3] + (sb[3] - sb[1]) * 0.5)
    # HONKAI：票面上贴着系列名底线的小号大写（字高远小于主字的三分之一）
    F_cap = Font(F_PF, wght=600)
    sb2 = G.bounds(ser)
    hk, hkw = latin.text_line(F_cap, 'HONKAI', 25, 0, 0, tracking=0.5)
    hb = G.bounds(hk)
    hk = G.move(hk, sb2[0] + 6 - hb[0], sb2[3] + 40 - hb[3])
    rule = G.rect(sb2[0] + 6, sb2[3] + 6, sb2[0] + 6 + max(hkw, sb2[2] - sb2[0]), sb2[3] + 8.5)
    stub_star = SG.star4(stub_c, 44, rot=90)
    # 票面文字随票一起转
    ser = G.rotate(ser, ROT, (tcx, tcy))
    hk = G.rotate(hk, ROT, (tcx, tcy))
    rule = G.rotate(rule, ROT, (tcx, tcy))
    frame = G.diff(G.offset(tk_body, -11), G.offset(tk_body, -13.2))
    tk_ink = G.union(ser, hk, rule, stub_star, frame)

    # ---------------- 细线与点：星座线（字里的星点连起来）+ 铁轨尽头的发丝 + 小星
    lw = SG.WH * K                    # 细线宽 = 发丝横的宽
    qiong, dao_ = M[1], M[3]
    s_q1 = qiong['char'].to_layout(qiong['anchors']['穹1.star'])
    s_d1 = dao_['char'].to_layout(dao_['anchors']['道1.star'])
    s_d9 = dao_['char'].to_layout(dao_['anchors']['道9.star'])
    tie = M[2]
    x_mid = tie['char'].to_layout((520 + SLK * 1000, 1000))
    X1 = (x_mid[0] - 10, em_top - 70)
    X2 = (X1[0] + 330, em_top - 150)
    con_pts = [s_q1, X1, X2, s_d1]
    con = []
    for a, b in zip(con_pts[:-1], con_pts[1:]):
        a, b = np.asarray(a), np.asarray(b)
        d = unit(b - a)
        con.append(G.polyline([a + d * 52, b - d * 52], lw, cap='round'))
    con.append(G.polyline([np.asarray(s_d9) + unit(np.asarray(s_d1) - np.asarray(s_d9)) * 52,
                           np.asarray(s_d1) - unit(np.asarray(s_d1) - np.asarray(s_d9)) * 52], lw, cap='round'))
    small_stars = G.union(SG.star4(X1, 20, 90), SG.star4(X2, 26, 90))
    # 铁轨尽头之外的三颗小星（航线）
    dir_far = unit(C_track[-1] - C_track[-4])
    trail = [dest + dir_far * 120 + np.array([20, -40]), dest + dir_far * 210 + np.array([40, -110])]
    small_stars = G.union(small_stars, SG.star4(trail[0], 13, 90), SG.star4(trail[1], 9, 90))
    lines = G.union(con)

    # ---------------- 英文
    F_big = Font(F_PFI, wght=800)
    name_cx = (X0 + X0 + 3 * ADV + S) / 2 + 40
    big, _ = latin.text_line(F_big, 'Star Rail', 520, name_cx, BASE + 0.10 * S, tracking=-0.01, align='center')
    F_small = Font(F_PF, wght=500)
    cap_t = 'HONKAI : STAR RAIL'
    cap_size = 34.0
    cw_ = latin.text_width(F_small, cap_t, cap_size, tracking=0.48)
    caps, _ = latin.text_line(F_small, cap_t, cap_size, dest[0] - 40 - cw_, BASE + 0.12 * S + 58, tracking=0.48)
    caps = G.skew(caps, -SG.SLANT, 0, (0, BASE + 0.12 * S + 58))

    # ---------------- 底板：一片夜空，向铁轨的尽头收成透视的楔形（边缘是星尘颗粒）
    top_y, bot_y = em_top - 60, BASE + 0.12 * S + 104
    x_l = X0 - 150
    x_name_r = X0 + 3 * ADV + S + 40
    vx, vy = dest[0] + 70, dest[1]
    def sx(x, y):
        return x + SLK * (bot_y - y)
    # 下沿一直托到英文小字的末尾，再收向终点的星
    cb_ = G.bounds(caps)
    plate = G.polygon([(sx(x_l + 30, top_y), top_y), (sx(x_name_r - 80, top_y), top_y),
                       (vx, vy - 70), (vx + 40, vy), (vx - 10, vy + 110),
                       (cb_[2] + 60, bot_y), (sx(x_l, bot_y), bot_y), (sx(x_l - 26, top_y + 230), top_y + 230)])
    plate = G.round_corners(plate, 36)

    # ---------------- 阴影（贴着字边，往右下）
    shadow = G.move(G.union(text, rails, sleepers), 7, 9)
    return dict(main=M, series=SRs, text=text, rails=rails, sleepers=sleepers, track_c=C_track, dest=tuple(dest),
                dest_star=dest_star, tk_body=tk_body, tk_holes=tk_holes, tk_ink=tk_ink, series_text=ser, lines=lines,
                small_stars=small_stars, big=big, caps=caps, plate=plate, shadow=shadow, con_pts=con_pts, em_top=em_top)


def preview():
    D = compose()
    paths = [(D['plate'], 40), (D['big'], 62), (D['tk_body'], 200), (D['tk_ink'], 60), (D['shadow'], 10),
             (D['text'], 245), (D['rails'], 215), (D['sleepers'], 190), (D['dest_star'], 230), (D['lines'], 170),
             (D['small_stars'], 220), (D['caps'], 200)]
    paths.insert(4, (D['tk_holes'], 40))
    bw_preview(paths, (3200, 1500), os.path.join(WORK, 'sr_preview.png'), scale=0.5, bg=128)
    print('preview ok')


def render(D, min_w=4300):
    import time
    from render_common import fit_canvas, edge_chip, write_outputs, chars_payload, write_data_js, box_of
    t0 = time.time()
    C = fit_canvas([D['plate'], D['tk_body'], D['small_stars'], D['lines'], D['dest_star']], 52, 1.0, min_w=min_w)
    H, W = C.H, C.W
    R, px = C.R, C.px
    XX, YY = C.XX, C.YY
    print('canvas', C)

    grain = fx.grain(H, W, 31, 0.6)

    # ---------------- 底板：夜空（星尘颗粒的边、里面有星）
    m0 = R(D['plate'])
    n1, n2 = fx.fbm(H, W, px(60), 41), fx.fbm(H, W, px(60), 42)
    m_w = fx.warp(m0, n1, n2, px(6))
    d_in = fx.dist_in((m_w > 0.5).astype(np.float32), reach=int(px(30)) + 4)
    dust = fx.grain(H, W, 43, 0.9)
    edge_band = np.clip(1 - d_in / px(22), 0, 1)
    m_plate = m_w * np.where(edge_band > 0, (dust > (0.35 + 0.55 * edge_band)).astype(np.float32) * 0.85 + (1 - edge_band) * 0.15, 1.0)
    m_plate = np.clip(m_plate, 0, 1)
    # 外围飘散的星尘
    out_d = fx.dist_out((m_w > 0.5).astype(np.float32), reach=int(px(40)) + 4)
    spray = ((dust > 0.93) & (out_d < px(26)) & (out_d > 0)).astype(np.float32) * np.clip(1 - out_d / px(26), 0, 1)
    m_plate = np.clip(m_plate + spray * 0.8, 0, 1)
    b = G.bounds(D['plate'])
    tpl = fx.linear_t(C, (b[0], b[1]), (b[2], b[3]))
    neb = fx.fbm(H, W, px(140), 44, octaves=5)
    neb2 = fx.fbm(H, W, px(70), 45, octaves=4)
    plate_col = fx.ramp(tpl, [(0, '#140F33'), (0.55, '#1C1546'), (1, '#2A1E63')])
    plate_col = fx.mix(plate_col, fx.rgb('#3B2C86'), (fx.smoothstep(0.55, 0.95, neb) * 0.55)[..., None])
    plate_col = fx.mix(plate_col, fx.rgb('#1E3A7A'), (fx.smoothstep(0.6, 1.0, neb2) * 0.35)[..., None])
    rng = np.random.default_rng(46)
    stars = np.zeros((H, W), np.float32)
    n_st = int(W * H / 2600)
    ys, xs = rng.integers(0, H, n_st), rng.integers(0, W, n_st)
    vals = rng.random(n_st) ** 3
    stars[ys, xs] = vals
    stars = np.clip(fx.blur(stars, 1.0) * 9, 0, 1)
    plate_col = fx.mix(plate_col, fx.rgb('#E9E4FF'), (stars * 0.85)[..., None])
    L_plate = fx.solid(m_plate, plate_col * (0.96 + 0.08 * (grain - 0.5))[..., None])

    # ---------------- 背景英文
    m_big = R(D['big']) * (m_w > 0.5)
    L_big = fx.solid(m_big, '#2B2262')

    # ---------------- 主体元素：车票（烫金）
    m_tk = R(D['tk_body'])
    m_holes = R(D['tk_holes'])
    m_ticket = np.clip(m_tk - m_holes, 0, 1)
    tb = G.bounds(D['tk_body'])
    t_g = fx.linear_t(C, (tb[0], tb[1]), (tb[2] * 0.4 + tb[0] * 0.6, tb[3]))
    gold = fx.ramp(t_g, [(0, '#FFF2C4'), (0.35, '#EBC56E'), (0.7, '#C99A44'), (1, '#9A6E2B')])
    hi_t, sh_t = fx.bevel(m_ticket, px(3.5), soften=0.8)
    gold = fx.mix(gold, fx.rgb('#FFFBEA'), (hi_t * 0.6)[..., None])
    gold = fx.mix(gold, fx.rgb('#5A3C10'), (sh_t * 0.5)[..., None])
    foil = fx.fbm(H, W, px(10), 47, octaves=3)
    gold = gold * (0.95 + 0.1 * (foil - 0.5))[..., None]
    tk_shadow = fx.blur(fx.shift(m_ticket, px(8), px(10)), px(7)) * 0.6
    L_ticket = fx.stack([fx.solid(tk_shadow * (1 - m_ticket), '#05030F'), fx.solid(m_ticket, gold)])

    # ---------------- 阴影与辉光（主题色的暗调贴着字边；发光用主题色）
    m_text = R(D['text'])
    m_rail = np.clip(R(D['rails']) + R(D['sleepers']) + R(D['dest_star']), 0, 1)
    m_all = np.clip(m_text + m_rail, 0, 1)
    m_sh = R(D['shadow'])
    glow = fx.outer_glow(m_all, px(16), spread=px(2)) * 0.55
    L_shglow = fx.stack([fx.glow_layer(glow * (1 - m_all), '#6C5CFF'), fx.solid(m_sh * (1 - m_all), '#07051A')])

    # ---------------- 字面：镀铬（天空带 · 地平线 · 地面带）
    t_c = fx.linear_t(C, (0, D['em_top'] - 10), (0, BASE + 0.1 * S))
    chrome = fx.ramp(t_c, [(0, '#FFFFFF'), (0.36, '#F3F0FF'), (0.47, '#D2CBF4'), (0.5, '#6E62AE'),
                           (0.56, '#9187CF'), (0.78, '#DAD4FA'), (1, '#FFFFFF')])
    hi_c, sh_c = fx.bevel(m_text, px(3.0), soften=0.7, angle=120, altitude=40)
    chrome = fx.mix(chrome, fx.rgb('#FFFFFF'), (hi_c * 0.7)[..., None])
    chrome = fx.mix(chrome, fx.rgb('#3A2F70'), (sh_c * 0.35)[..., None])
    chrome = fx.mix(chrome, fx.rgb('#1A1240'), (fx.inner_stroke(m_text, px(0.9)) * 0.35)[..., None])
    L_text = fx.solid(m_text, chrome * (0.985 + 0.03 * (grain - 0.5))[..., None])

    # ---------------- 高潮：铁轨（烫金，同车票同料）
    t_r = fx.linear_t(C, (0, BASE - 0.2 * S), (0, BASE + 0.1 * S))
    rgold = fx.ramp(t_r, [(0, '#FFF0BF'), (0.5, '#E6BC62'), (1, '#A87A30')])
    m_rails, m_sleep = R(D['rails']), R(D['sleepers'])
    rgold_s = rgold * 0.78
    m_dest = R(D['dest_star'])
    L_rail = fx.stack([fx.solid(m_sleep, rgold_s), fx.solid(m_rails, rgold), fx.solid(m_dest, '#FFF4D0')])

    # ---------------- 系列名与票面印刷（深紫油墨）
    m_ink = R(D['tk_ink']) * m_ticket
    L_series = fx.solid(m_ink, '#2B1D5E')

    # ---------------- 英文小号大写
    m_caps = R(D['caps'])
    L_caps = fx.solid(m_caps, '#C9C1F2')

    # ---------------- 细线与点：星座
    m_lines = R(D['lines'])
    m_ss = R(D['small_stars'])
    L_lines = fx.stack([fx.solid(m_lines * 0.85, '#B8AEF0'), fx.solid(m_ss, '#F4F0FF')])

    # ---------------- 高光：受光边、星芒
    rim = fx.rim_light(m_text, px(1.6), angle=120) * 0.8
    rim_r = fx.rim_light(m_rails, px(1.0), angle=120) * 0.6
    L_hi = fx.solid(np.clip(rim + rim_r, 0, 1), '#FFFFFF')
    flares = np.zeros((H, W), np.float32)
    def flare(c, r, k=1.0):
        rr, th = C.polar(c)
        core = np.exp(-(rr / (r * 0.16)) ** 2)
        cross = (np.exp(-(np.abs(np.sin(th)) * rr / (r * 0.035)) ** 2) + np.exp(-(np.abs(np.cos(th)) * rr / (r * 0.035)) ** 2))
        cross *= np.exp(-(rr / r) ** 2)
        return (core + cross * 0.7) * k
    dx, dy = D['dest']
    flares += flare((dx, dy), 150, 1.0)
    for p in D['con_pts'][1:3]:
        flares += flare(p, 60, 0.6)
    gl = np.clip(flares, 0, 1.6)
    halo, _ = C.polar((dx, dy))
    halo = np.exp(-(halo / 90.0) ** 2) * 0.5
    L_hi = fx.stack([L_hi, fx.glow_layer(halo, '#E9C36E'), fx.glow_layer(gl, '#F6EEFF')])

    layers = {
        '底板_星夜': L_plate,
        '背景英文_StarRail': L_big,
        '主体元素_车票': L_ticket,
        '阴影与辉光': L_shglow,
        '字_主名星穹铁道': L_text,
        '字_高潮铁轨': L_rail,
        '字_系列名崩坏_票面印刷': L_series,
        '英文_小号大写': L_caps,
        '细线与点_星座': L_lines,
        '高光_受光边与星芒': L_hi,
    }
    print('layers', f'{time.time() - t0:.1f}s')
    tones = {'底板_星夜': 0.13, '背景英文_StarRail': 0.24, '主体元素_车票': 0.72, '阴影与辉光': 0.0,
             '字_主名星穹铁道': 1.0, '字_高潮铁轨': 0.82, '字_系列名崩坏_票面印刷': 0.08, '英文_小号大写': 0.8,
             '细线与点_星座': 0.7, '高光_受光边与星芒': 1.0}
    web_layers, full = write_outputs('sr', '星穹铁道', layers, C, tones,
                                     ['阴影与辉光', '字_主名星穹铁道', '字_高潮铁轨'])
    groups = ['plate', 'bgEn', 'main', 'text', 'text', 'text', 'text', 'lines', 'lines', 'hi']
    for wl, g in zip(web_layers, groups):
        wl['group'] = g
    dao = D['main'][3]
    # 高潮的那一笔（平捺）在组合里画成了铁轨：把铁轨放回这一笔的数据（入场时逐笔描出，方言示意里也看得到）
    track_all = G.union(D['rails'], D['sleepers'])
    ch = dao['char']
    for k, it in enumerate(dao['items']):
        if it.get('climax'):
            dao['strokes'][k] = track_all
            k_ = 1.0 / ch.k
            fs = track_all.transform(k_, 0, 0, -k_, -ch.x0 * k_, ch.base * k_)
            dao['font_shapes'][k] = G.inter(fs, G.rect(-200, -400, 1250, 1200))
    chars = chars_payload(C, [('main', D['main']), ('series', D['series'])])
    motif = [
        {'kind': 'climax', 'label': '高潮 · 道的平捺 → 一段铁轨', 'box': box_of(C, G.union(D['rails'], D['sleepers']))},
    ]
    tie = D['main'][2]
    if 'echo' in tie['anchors']:
        pts = [tie['char'].to_layout(p) for p in tie['anchors']['echo']]
        xs_, ys_ = [p[0] for p in pts], [p[1] for p in pts]
        motif.append({'kind': 'echo', 'label': '呼应 · 铁的捺：三道轨枕刻口', 'box': box_of(C, G.rect(min(xs_) - 40, min(ys_) - 40, max(xs_) + 40, max(ys_) + 40))})
    for g in D['main']:
        for k, v in g['anchors'].items():
            if k.endswith('.star'):
                p = g['char'].to_layout(v)
                motif.append({'kind': 'dot', 'label': f"点 → 四角星（{g['ch']}）", 'box': box_of(C, G.rect(p[0] - 40, p[1] - 40, p[0] + 40, p[1] + 40))})
    motif.append({'kind': 'element', 'label': '主体元素 · 车票（星轨通票），包住系列名', 'box': box_of(C, D['tk_body'])})
    motif.append({'kind': 'line', 'label': '细线 · 星座线（线宽 = 发丝横）', 'box': box_of(C, D['lines'])})
    data = {'key': 'sr', 'canvas': [round(C.w, 2), round(C.h, 2)], 'px': [C.W, C.H], 'layers': web_layers,
            'chars': chars, 'motif': motif}
    write_data_js('sr', data)
    print('done', f'{time.time() - t0:.1f}s')


if __name__ == '__main__':
    mode = sys.argv[1] if len(sys.argv) > 1 else 'preview'
    if mode == 'preview':
        preview()
    elif mode == 'final':
        render(compose())

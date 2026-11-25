"""明日方舟：终末地 —— 组合、上色、出图。

    python ef.py preview     黑白小预览（work/ef_preview.png）
    python ef.py final       全尺寸分层、成品、黑白稿、检查图、网页素材
"""
import json
import math
import os
import sys
import numpy as np
from gb import Font, G, fx, output, latin, proof, Canvas, fp, WORK, LOGOS, WEB
from util import unit, save_json, svg_d, bw_preview, save_web_png
import ef_glyphs as EG

CW, CH = 2600.0, 1300.0          # 版面
S = 560.0                         # 主名字号（1 em）
K = S / 1000.0
BASE = 915.0                      # 主名基线
X0 = 430.0                        # 终 的原点
ADV = 600.0                       # 字距（步进）
S2 = 150.0                        # 系列名字号
ISO = np.array([math.cos(math.radians(30)), math.sin(math.radians(30))])   # 厚度方向：右下 30°（屏幕坐标）

FL = os.path.join(r'C:\Windows\Fonts', 'bahnschrift.ttf')


def lf(wght, wdth=100):
    return Font(FL, wght=wght, wdth=wdth)


def layout_items(res, x0, base, size, adv):
    """排好每个字；返回 [(字, [每笔的版面 Path], 字的版面 Path)]"""
    out = []
    for i, r in enumerate(res):
        ch = r['char']
        ch.place(x0 + i * adv, base, size)
        strokes = [ch.layout(p) for p in r['shapes']]
        out.append({'ch': r['ch'], 'char': ch, 'strokes': strokes, 'items': r['items'], 'anchors': r['anchors'],
                    'path': ch.layout(r['path']), 'font_shapes': r['shapes']})
    return out


def crystal(cx, top, bot, half_w, lean=0.0):
    """源石结晶（主体元素）：等轴测画法的六棱柱晶体，尖顶尖底；返回 (受光面, 背光面, 棱线, 轮廓)。
    所有棱都取 30°/60°/90°：顶锥面 60°，棱柱竖直。lean 是整体倾斜角（度，正为右倾）。"""
    a = half_w
    t60 = math.tan(math.radians(60))
    h_cap = a * t60 * 0.62          # 顶锥高
    h_bot = a * t60 * 0.40
    T = np.array([cx, top])
    B = np.array([cx, bot])
    UL, UR = np.array([cx - a, top + h_cap]), np.array([cx + a, top + h_cap])
    LL, LR = np.array([cx - a, bot - h_bot]), np.array([cx + a, bot - h_bot])
    MU = np.array([cx + a * 0.18, top + h_cap * 1.08])     # 正面棱线上端（略偏右，显出两个面）
    MD = np.array([cx + a * 0.18, bot - h_bot * 1.1])
    pts = {'T': T, 'B': B, 'UL': UL, 'UR': UR, 'LL': LL, 'LR': LR, 'MU': MU, 'MD': MD}
    if lean:
        r = math.radians(lean)
        c, s = math.cos(r), math.sin(r)
        pivot = np.array([cx, bot])
        for k, v in pts.items():
            d = v - pivot
            pts[k] = pivot + np.array([d[0] * c - d[1] * s, d[0] * s + d[1] * c])
    P = pts
    lit = G.polygon([P['T'], P['MU'], P['MD'], P['B'], P['LL'], P['UL']])
    dark = G.polygon([P['T'], P['UR'], P['LR'], P['B'], P['MD'], P['MU']])
    outline = G.polygon([P['T'], P['UR'], P['LR'], P['B'], P['LL'], P['UL']])
    edges = [(P['T'], P['MU']), (P['MU'], P['MD']), (P['MD'], P['B']), (P['UL'], P['MU']), (P['MU'], P['UR']),
             (P['LL'], P['MD']), (P['MD'], P['LR'])]
    return lit, dark, edges, outline, P


def catenary(p0, p1, sag, n=64):
    p0, p1 = np.asarray(p0, float), np.asarray(p1, float)
    t = np.linspace(0, 1, n)
    pts = p0[None] * (1 - t[:, None]) + p1[None] * t[:, None]
    pts[:, 1] += sag * 4 * t * (1 - t)
    return pts


def hexnode(c, r):
    return G.ngon(c[0], c[1], r, 6, 30)


def compose():
    main = EG.build('main')
    series = EG.build('series')
    M = layout_items(main, X0, BASE, S, ADV)
    sx0 = X0 + 8
    SR = layout_items(series, sx0, BASE - 0.88 * S - 44, S2, S2 * 1.04)

    # ---------------- 主名：白字层 + 高潮塔身（单独上色）
    mo = M[1]
    mast_idx = [k for k, it in enumerate(mo['items']) if it['s'].type == '竖'][0]
    mast = mo['strokes'][mast_idx]
    white = []
    for g in M:
        for k, p in enumerate(g['strokes']):
            if g is mo and k == mast_idx:
                continue
            white.append(p)
    text_white = G.union(white)
    series_text = G.union([g['path'] for g in SR])
    ch_mo = mo['char']
    mast_x = ch_mo.to_layout((mo['anchors']['mast_x'], 0))[0]
    beacon = ch_mo.to_layout(mo['anchors']['beacon'])

    # 塔头上的地线横担（细，属于塔身）：从这里放出电缆
    arm_y = ch_mo.to_layout((0, 1095))[1]
    arm_half = 0.56 * 70
    earth_arm = G.rect(mast_x - arm_half, arm_y - EG.WEB * K / 2, mast_x + arm_half, arm_y + EG.WEB * K / 2)
    beacon_d = G.polygon([(beacon[0], beacon[1] - 26), (beacon[0] + 15, beacon[1]), (beacon[0], beacon[1] + 26), (beacon[0] - 15, beacon[1])])
    mast_full = G.union(mast, earth_arm)

    # ---------------- 主体元素：源石结晶（地 的右侧，顶部探出底板和主名的外轮廓）
    em_top = BASE - 0.88 * S
    cx = X0 + 3 * ADV + 150
    lit1, dark1, edges1, out1, P1 = crystal(cx, em_top - 40, BASE + 70, 84, lean=0)
    # 旁边一枚小结晶：从根部往右倾 30°（角度集里的角），探出底板右缘
    base2 = np.array([cx + 58, BASE + 66])
    lit2, dark2, edges2, out2, P2 = crystal(base2[0], base2[1] - 400, base2[1], 46, lean=30)
    cr_lit = G.union(lit1, G.diff(lit2, out1))
    cr_dark = G.union(dark1, G.diff(dark2, out1))
    cr_out = G.union(out1, out2)
    lw = EG.WEB * K                   # 细线宽 = 塔身腹杆宽（全件最细的笔画）
    edge_lines = []
    for e in edges1:
        edge_lines.append(G.polyline([e[0], e[1]], lw * 0.9, cap='round'))
    for e in edges2:
        edge_lines.append(G.diff(G.polyline([e[0], e[1]], lw * 0.9, cap='round'), out1))
    cr_edges = G.union(edge_lines)
    cr_rim = G.diff(G.offset(cr_out, lw * 0.5), G.offset(cr_out, -lw * 0.5))
    # 晶体根部埋在底板里：底板下沿以下不画
    cut_base = G.rect(0, BASE + 70, CW, CH)
    cr_lit, cr_dark, cr_edges, cr_rim, cr_out = [G.diff(p, cut_base) for p in (cr_lit, cr_dark, cr_edges, cr_rim, cr_out)]

    # ---------------- 细线：电缆（塔头地线横担 → 结晶顶），端点是六角绝缘子
    tipL = (mast_x - arm_half, arm_y)
    tipR = (mast_x + arm_half, arm_y)
    cr_top = tuple(P1['T'])
    node_r = 13.0
    cab_r_end = (cr_top[0] - 6, cr_top[1] + 40)
    cab1 = catenary(tipR, cab_r_end, 34)
    cab2 = catenary((mast_x + arm_half, arm_y + 30), (P1['UL'][0] + 6, P1['UL'][1] + 8), 22)
    # 左边：一根电缆伸向系列名的尾端（系列名像挂在线路上的铭牌）
    s_right = G.bounds(series_text)[2]
    nodeL = (s_right + 46, BASE - 0.88 * S - 44 - S2 * 0.55)
    cab3 = catenary(tipL, nodeL, 34)
    cables = G.union([G.polyline(c, lw, cap='round', join='round') for c in (cab1, cab2, cab3)])
    nodes = G.union([hexnode(tipR, node_r), hexnode(tipL, node_r), hexnode(cab_r_end, node_r),
                     hexnode((P1['UL'][0] + 6, P1['UL'][1] + 8), node_r * 0.85), hexnode((mast_x + arm_half, arm_y + 30), node_r * 0.85),
                     hexnode(nodeL, node_r)])

    # 延伸：地 的竖弯钩（30° 上挑）顺着笔势拉成细线，指向结晶的底部
    di = M[2]
    hook = [it for it in di['items'] if it['s'].name == '竖弯钩'][0]
    hook_end = di['char'].to_layout(hook['ax'][-1])
    d = unit(np.array(di['char'].to_layout(hook['ax'][-1])) - np.array(di['char'].to_layout(hook['ax'][-2])))
    ext_end = np.array(hook_end) + d * 150
    ext_line = G.taper(np.array(hook_end) + d * 30, ext_end, lw * 1.6, lw * 0.6)

    # ---------------- 英文
    F_cap = lf(600, 100)
    F_big = lf(700, 75)
    cap_size = 46.0
    cap_text = 'ARKNIGHTS : ENDFIELD'
    tw = latin.text_width(F_cap, cap_text, cap_size, tracking=0.0)
    left_x = X0 + 30
    right_x = X0 + 2 * ADV + 1000 * K - 20
    n = len(cap_text) - 1
    track = ((right_x - left_x) - tw) / n / cap_size
    cap_base = BASE + 0.12 * S + 98
    caps_a, _ = latin.text_line(F_cap, 'ARKNIGHTS : ', cap_size, left_x, cap_base, tracking=track)
    wa = latin.text_width(F_cap, 'ARKNIGHTS : ', cap_size, tracking=track)
    caps_b, _ = latin.text_line(F_cap, 'ENDFIELD', cap_size, left_x + wa + track * cap_size * 0, cap_base, tracking=track)
    # 两侧的结构线：英文行左右各一段细线，对齐到字面框的底
    big_size = 640.0
    name_cx = (X0 + X0 + 2 * ADV + 1000 * K) / 2
    big, bw = latin.text_line(F_big, 'ENDFIELD', big_size, name_cx, BASE + 0.11 * S, tracking=0.03, align='center')
    # 竖排小字：沿底板左缘（字高远小于主字的三分之一）
    vs = latin.text_line(lf(500, 100), 'ARKNIGHTS ENDFIELD', 21.0, 0, 0, tracking=0.5)[0]
    vs = G.rotate(vs, -90)
    vb = G.bounds(vs)
    vs = G.move(vs, 368 - vb[0], BASE + 0.12 * S - (vb[3] - vb[1]) - vb[1])

    # ---------------- 警示条（细线与点那一级）：英文行左端的一小段 60° 斜纹
    hz_x0, hz_y0 = left_x - 4, cap_base + 26
    hz = G.rect(hz_x0, hz_y0, right_x + 4, hz_y0 + 12)
    stripes = []
    for i in range(-2, 140):
        x = hz_x0 + i * 26
        stripes.append(G.polygon([(x, hz_y0), (x + 13, hz_y0), (x + 13 - 12 / math.tan(math.radians(60)) * 1, hz_y0 + 12), (x - 12 / math.tan(math.radians(60)), hz_y0 + 12)]))
    hz_black = G.inter(hz, G.union(stripes))
    hz_yellow = G.diff(hz, hz_black)

    # ---------------- 底板：60° 斜切角的工业铭牌，右上缺一角让结晶探出
    pl = [(330, 205), (CW - 330, 205), (CW - 230, 378), (CW - 230, 1105), (CW - 330 - 60, 1140), (420, 1140), (330, 985)]
    plate = G.polygon(pl)

    # ---------------- 厚度（阴影色）：字往右下 30° 挤出
    def extrude(p, dist, steps=10):
        cs = [G.move(p, ISO[0] * dist * i / steps, ISO[1] * dist * i / steps) for i in range(1, steps + 1)]
        return G.diff(G.union(cs), p)
    all_text = G.union(text_white, mast_full)
    thick = extrude(all_text, 15.0)
    thick_s = extrude(series_text, 6.0, 6)

    return dict(main=M, series=SR, text_white=text_white, mast=mast_full, beacon=beacon, beacon_d=beacon_d,
                series_text=series_text, cr_lit=cr_lit, cr_dark=cr_dark, cr_edges=cr_edges, cr_out=cr_out, cr_rim=cr_rim,
                cables=cables, nodes=nodes, ext_line=ext_line, caps_a=caps_a, caps_b=caps_b, big=big, vs=vs,
                hz_black=hz_black, hz_yellow=hz_yellow, plate=plate, thick=thick, thick_s=thick_s, mast_x=mast_x,
                crystal_pts=P1, hook_end=hook_end, ext_end=tuple(ext_end))


def preview(C=None):
    D = compose()
    paths = [(D['plate'], 40), (D['big'], 62), (D['cr_out'], 110), (D['cr_edges'], 200), (D['thick'], 20),
             (D['text_white'], 245), (D['mast'], 200), (D['series_text'], 235), (D['caps_a'], 220), (D['caps_b'], 200),
             (D['vs'], 150), (D['cables'], 190), (D['nodes'], 200), (D['ext_line'], 190), (D['hz_yellow'], 200),
             (D['hz_black'], 30)]
    bw_preview(paths, (CW, CH), os.path.join(WORK, 'ef_preview.png'), scale=0.5, bg=128)
    print('preview ok')


def render(D, scale_min_w=4300):
    import time
    from render_common import fit_canvas, edge_chip, write_outputs, path_payload
    t0 = time.time()
    C = fit_canvas([D['plate'], D['cr_out'], D['mast'], D['beacon_d']], 46, 1.0, min_w=scale_min_w)
    H, W = C.H, C.W
    R = C.R
    px = C.px
    print('canvas', C, f'{time.time() - t0:.1f}s')

    # 统一的纹理场（全组一致：喷漆的细颗粒 + 钢板的斑驳）
    grain = fx.grain(H, W, 11, 0.7)
    mottle = fx.fbm(H, W, px(46), 12, octaves=5)
    paint = (0.965 + 0.07 * (grain - 0.5)) * (0.97 + 0.05 * (mottle - 0.5))

    def tex(col):
        return col * paint[..., None]

    YEL = fx.rgb('#FFC20E')
    # ---------------- 底板
    m_plate = edge_chip(C, R(D['plate']), 21, px(0.7), px(18), chip=px(3.2))
    t = fx.linear_t(C, (0, G.bounds(D['plate'])[1]), (0, G.bounds(D['plate'])[3]))
    plate_col = fx.ramp(t, [(0, '#2A271E'), (0.55, '#1E1C16'), (1, '#16140F')])
    # 等轴测网格（图纸）：30°、150°、90° 三向细线，很淡
    XX, YY = C.XX, C.YY
    gs = 44.0
    def gridline(v):
        f = np.abs((v / gs) - np.round(v / gs)) * gs
        return np.clip(1 - f / 0.9, 0, 1)
    s30 = math.sin(math.radians(30)); c30 = math.cos(math.radians(30))
    g1 = gridline(YY * c30 - XX * s30)
    g2 = gridline(YY * c30 + XX * s30)
    g3 = gridline(XX * 1.0) * 0.0
    gridm = np.clip(g1 + g2 + g3, 0, 1) * 0.055
    plate_col = fx.mix(plate_col, fx.rgb('#4A4535'), gridm[..., None])
    plate_rim = fx.rim_light(m_plate, px(2.2), angle=120) * 0.22
    plate_col = fx.mix(plate_col, fx.rgb('#6C6553'), plate_rim[..., None])
    L_plate = fx.solid(m_plate, tex(plate_col))

    # ---------------- 背景英文（明度贴近底板）
    m_big = R(D['big']) * (m_plate > 0.5)
    L_big = fx.solid(m_big, tex(np.broadcast_to(fx.rgb('#332F24'), (H, W, 3)).copy()))

    # ---------------- 主体元素：源石结晶
    m_lit, m_dark = R(D['cr_lit']), R(D['cr_dark'])
    m_cr = np.clip(m_lit + m_dark, 0, 1)
    m_edges = R(D['cr_edges'])
    sh = fx.blur(fx.shift(m_cr, px(12) * ISO[0], px(12) * ISO[1]), px(5)) * 0.55
    t_cr = fx.linear_t(C, (0, D['crystal_pts']['T'][1]), (0, BASE + 70))
    lit_col = fx.ramp(t_cr, [(0, '#EAC255'), (0.4, '#CF9A12'), (1, '#8F6608')])
    dark_col = fx.ramp(t_cr, [(0, '#8E6A0C'), (1, '#4A3606')])
    cr_col = fx.mix(dark_col, lit_col, (m_lit / np.maximum(m_cr, 1e-4))[..., None])
    # 面里一条斜的反光带（天空带），方向和全件光源一致
    band = fx.smoothstep(0.0, 1.0, np.clip(1 - np.abs((XX - D['crystal_pts']['T'][0]) * 0.9 + (YY - 470) * 0.5) / 60.0, 0, 1))
    cr_col = fx.mix(cr_col, fx.rgb('#FFF3C9'), (band * 0.35 * (m_lit > 0.5))[..., None])
    cr_col = fx.mix(cr_col, fx.rgb('#FFF6DA'), (m_edges * 0.95)[..., None])
    inner_dark = fx.inner_stroke(m_cr, px(1.4)) * 0.55
    cr_col = fx.mix(cr_col, fx.rgb('#3A2B05'), inner_dark[..., None])
    L_cr = fx.stack([fx.solid(sh * m_plate, '#0A0906'), fx.solid(m_cr, tex(cr_col))])

    # ---------------- 厚度与投影（阴影色：主题色的暗调，只贴着字边）
    m_text = R(D['text_white'])
    m_mast = R(D['mast'])
    m_series = R(D['series_text'])
    m_thick = np.clip(R(D['thick']) + R(D['thick_s']), 0, 1)
    m_all = np.clip(m_text + m_mast + m_series, 0, 1)
    contact = fx.blur(fx.shift(np.clip(m_all + m_thick, 0, 1), px(10) * ISO[0], px(10) * ISO[1]), px(7)) * 0.5
    t_th = fx.linear_t(C, (0, BASE - S * 0.9), (0, BASE + 80))
    th_col = fx.ramp(t_th, [(0, '#5A470C'), (1, '#3A2D07')])
    L_thick = fx.stack([fx.solid(contact * (1 - m_all), '#050403'), fx.solid(m_thick, tex(th_col))])

    # ---------------- 字面
    t_face = fx.linear_t(C, (0, BASE - S * 0.9), (0, BASE + 60))
    face = fx.ramp(t_face, [(0, '#FBF8F0'), (0.6, '#EDE9DE'), (1, '#D9D3C4')])
    face = fx.mix(face, fx.rgb('#8F8774'), (fx.inner_stroke(m_text, px(1.2)) * 0.45)[..., None])
    L_text = fx.solid(m_text, tex(face))
    mast_col = fx.ramp(t_face, [(0, '#FFD95C'), (0.5, '#FFC20E'), (1, '#E8A600')])
    mast_col = fx.mix(mast_col, fx.rgb('#6B4E00'), (fx.inner_stroke(m_mast, px(1.2)) * 0.5)[..., None])
    L_mast = fx.solid(m_mast, tex(mast_col))
    t_s = fx.linear_t(C, (0, G.bounds(D['series_text'])[1]), (0, G.bounds(D['series_text'])[3]))
    s_face = fx.ramp(t_s, [(0, '#F6F3EA'), (1, '#D8D2C3')])
    L_series = fx.solid(m_series, tex(s_face))

    # ---------------- 英文（字重轻于中文；ENDFIELD 一个词用点缀色）
    m_ca, m_cb, m_vs = R(D['caps_a']), R(D['caps_b']), R(D['vs'])
    m_hy, m_hb = R(D['hz_yellow']), R(D['hz_black'])
    L_en = fx.stack([fx.solid(m_ca, '#D6D0C0'), fx.solid(m_cb, tex(np.broadcast_to(YEL, (H, W, 3)).copy())),
                     fx.solid(m_vs, '#8E8774'), fx.solid(m_hy, tex(np.broadcast_to(fx.rgb('#E8B10C'), (H, W, 3)).copy())),
                     fx.solid(m_hb, '#1B1913')])

    # ---------------- 细线与点：电缆、绝缘子、地 的延伸线
    m_cab = R(D['cables'])
    m_ext = R(D['ext_line'])
    m_nodes = R(D['nodes'])
    node_ring = fx.inner_stroke(m_nodes, px(1.6))
    L_lines = fx.stack([fx.solid(np.clip(m_cab + m_ext, 0, 1) * 0.92, '#DCD6C5'),
                        fx.solid(m_nodes, fx.mix(np.broadcast_to(YEL, (H, W, 3)).copy(), fx.rgb('#3A2B05'), node_ring[..., None]))])

    # ---------------- 高光：受光一侧的边（左上），信标的光
    rim_t = fx.rim_light(m_text, px(1.8), angle=120) * 0.75
    rim_m = fx.rim_light(m_mast, px(1.8), angle=120) * 0.8
    rim_s = fx.rim_light(m_series, px(1.2), angle=120) * 0.6
    rim_c = fx.rim_light(m_cr, px(2.0), angle=120) * 0.8
    hi = np.clip(rim_t + rim_s, 0, 1)
    L_hi = fx.stack([fx.solid(hi, '#FFFFFF'), fx.solid(np.clip(rim_m + rim_c, 0, 1), '#FFF6D2')])
    bx, by = D['beacon']
    rr, _ = C.polar((bx, by))
    glow = np.exp(-(rr / 26.0) ** 2) * 0.9 + np.exp(-(rr / 70.0) ** 2) * 0.35
    m_bd = R(D['beacon_d'])
    L_beacon = fx.stack([fx.glow_layer(glow * 0.9, '#FFC20E'), fx.solid(m_bd, '#FFFDF2')])
    # 结晶尖上的一点星光
    tx_, ty_ = D['crystal_pts']['T']
    rr2, _ = C.polar((tx_, ty_ + 10))
    spark = np.exp(-(rr2 / 9.0) ** 2) * 0.9
    L_hi = fx.stack([L_hi, L_beacon, fx.glow_layer(spark, '#FFF4C8')])

    layers = {
        '底板': L_plate,
        '背景英文_ENDFIELD': L_big,
        '主体元素_源石结晶': L_cr,
        '阴影_厚度与投影': L_thick,
        '字_主名终末地': L_text,
        '字_高潮中继塔塔身': L_mast,
        '字_系列名明日方舟': L_series,
        '英文_字距大写与警示条': L_en,
        '细线与点_电缆与绝缘子': L_lines,
        '高光_受光边与信标': L_hi,
    }
    print('layers', f'{time.time() - t0:.1f}s')
    mono_tones = {'底板': 0.12, '背景英文_ENDFIELD': 0.22, '主体元素_源石结晶': 0.62, '阴影_厚度与投影': 0.0,
                  '字_主名终末地': 1.0, '字_高潮中继塔塔身': 0.80, '字_系列名明日方舟': 1.0, '英文_字距大写与警示条': 0.78,
                  '细线与点_电缆与绝缘子': 0.85, '高光_受光边与信标': 1.0}
    web_layers, full = write_outputs('ef', '终末地', layers, C, mono_tones,
                                      ['阴影_厚度与投影', '字_主名终末地', '字_高潮中继塔塔身', '字_系列名明日方舟'])
    groups = ['plate', 'bgEn', 'main', 'text', 'text', 'text', 'text', 'lines', 'lines', 'hi']
    for wl, g in zip(web_layers, groups):
        wl['group'] = g
    export_data(D, C, web_layers)
    print('done', f'{time.time() - t0:.1f}s')


def export_data(D, C, web_layers):
    """网页要用的矢量和标注：逐笔路径（入场动画、方言示意）、母题落点"""
    from render_common import chars_payload
    mo_ = D['main'][1]
    for it in mo_['items']:
        if it['s'].type == '竖':
            it['climax'] = True
    for g in D['main']:
        for it in g['items']:
            if f"{it['s'].id}.hole" in g['anchors']:
                it['echo'] = True
    chars = chars_payload(C, [('main', D['main']), ('series', D['series'])])
    W, H = C.w, C.h

    def frac(x, y):
        return [round((x - C.ox) / W, 4), round((y - C.oy) / H, 4)]
    mo = D['main'][1]['char']
    mx = D['mast_x']
    b = G.bounds(D['mast'])
    motif = [
        {'kind': 'climax', 'label': '高潮 · 末的竖 → 中继塔塔身', 'note': 'Warren 桁架孔 + 塔头地线横担 + 信标；两根横担是塔的横担，撇捺是两折的塔腿',
         'box': frac(b[0], b[1]) + frac(b[2], b[3])},
    ]
    for g in D['main'] + D['series']:
        for k, v in g['anchors'].items():
            if k.endswith('.hole'):
                x0, y0, x1, y1 = v
                p0 = g['char'].to_layout((x0, y1))
                p1 = g['char'].to_layout((x1, y0))
                motif.append({'kind': 'echo', 'label': f"呼应 · {g['ch']}的竖：一小段桁架孔", 'note': '',
                              'box': frac(*p0) + frac(*p1)})
    cb = G.bounds(D['cr_out'])
    motif.append({'kind': 'element', 'label': '主体元素 · 源石结晶', 'note': '等轴测画法，棱线只用 30°/60°/90°', 'box': frac(cb[0], cb[1]) + frac(cb[2], cb[3])})
    lb = G.bounds(D['cables'])
    motif.append({'kind': 'line', 'label': '细线 · 电缆（线宽 = 腹杆宽）', 'note': '端点是六角绝缘子', 'box': frac(lb[0], lb[1]) + frac(lb[2], lb[3])})
    eb = G.bounds(D['ext_line'])
    motif.append({'kind': 'line', 'label': '延伸 · 地的竖弯钩顺势拉出', 'note': '', 'box': frac(eb[0], eb[1]) + frac(eb[2], eb[3])})
    data = {'key': 'ef', 'canvas': [round(W, 2), round(H, 2)], 'px': [C.W, C.H], 'layers': web_layers,
            'chars': chars, 'motif': motif}
    save_json(os.path.join(WORK, 'data_ef.json'), data)
    with open(os.path.join(WEB, 'data_ef.js'), 'w', encoding='utf-8') as f:
        f.write('window.LOGO_DATA = window.LOGO_DATA || {};\nwindow.LOGO_DATA.ef = ')
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
        f.write(';\n')


def _font_shape(g, it):
    """这一笔在字体单位里的方言形（build 里 shapes 是字体单位）"""
    idx = g['items'].index(it)
    return g['font_shapes'][idx]


if __name__ == '__main__':
    import json
    mode = sys.argv[1] if len(sys.argv) > 1 else 'preview'
    if mode == 'preview':
        preview()
    elif mode == 'final':
        D = compose()
        render(D)

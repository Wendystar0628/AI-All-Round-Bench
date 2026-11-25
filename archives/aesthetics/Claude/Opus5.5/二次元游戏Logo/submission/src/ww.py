"""鸣潮 —— 组合、上色、出图。

    python ww.py preview     黑白小预览（work/ww_preview.png）
    python ww.py final       全尺寸分层、成品、黑白稿、检查图、网页素材
"""
import json
import math
import os
import sys
import numpy as np
from gb import Font, G, fx, output, latin, Canvas, fp, WORK, LOGOS, WEB
from util import unit, save_json, svg_d, bw_preview, resample
import ww_glyphs as WG

S = 620.0
K = S / 1000.0
BASE = 940.0
X0 = 420.0
GAP = 150.0                       # 两字之间留给音叉的空
F_TR = os.path.join(r'C:\Windows\Fonts', 'TrajanPro3-Regular.otf')
F_TRB = os.path.join(r'C:\Windows\Fonts', 'TrajanPro3-Bold.otf')


def arc_pts(c, r, a0, a1, n=48):
    """圆弧上的点（角度：度，屏幕坐标，0 = 右，90 = 下）"""
    a = np.radians(np.linspace(a0, a1, n))
    return np.stack([c[0] + r * np.cos(a), c[1] + r * np.sin(a)], 1)


def crescent(c, r, a0, a1, wm):
    """声波弧：沿圆弧的柳叶形（两头尖、中间最宽）——方言里的“点”弯成弧"""
    P = arc_pts(c, r, a0, a1, 40)
    return G.sweep(P, lambda t: wm * math.sin(math.pi * min(max(t, 0), 1)) ** 0.8 + 0.6, join='round')


def compose():
    res = WG.build()
    ming, chao = res[0], res[1]
    ming['char'].place(X0, BASE, S)
    chao['char'].place(X0 + 1000 * K + GAP, BASE, S)
    em_top = BASE - 0.88 * S

    # 音叉（主体元素）：两字之间，叉齿探出主名的上沿；声波的圆心在叉齿上部
    fx_ = X0 + 1000 * K + GAP / 2 - 6
    prong_gap = 58.0
    lw_fork = 21.0
    y_tip = em_top - 175
    y_u = BASE - 0.36 * S
    y_stem = BASE + 40
    rad = prong_gap / 2
    Lp = [(fx_ - rad, y_tip), (fx_ - rad, y_u)]
    Rp = [(fx_ + rad, y_u), (fx_ + rad, y_tip)]
    u_arc = arc_pts((fx_, y_u), rad, 180, 0, 24)[::-1]          # 底部的 U 弯（从右到左……按屏幕坐标朝下）
    u_arc = arc_pts((fx_, y_u), rad, 0, 180, 24)
    fork_line = np.concatenate([np.array(Rp[::-1]), u_arc[1:-1], np.array(Lp[::-1])], 0)
    fork = G.polyline(fork_line, lw_fork, cap='round', join='round')
    # 柄：从 U 底垂下的悬针（方言的竖），柄头一颗小珠
    stem_top = y_u + rad
    stem = G.sweep(resample([(fx_, stem_top - 4), (fx_, y_stem)], 40),
                   lambda t: 30.0 * max(0.0, 1 - t ** 1.9) ** 0.8 + 1.0, join='round')
    knob = G.circle(fx_, stem_top + 28, 17)
    fork_all = G.union(fork, stem, knob)

    # 每个字：普通笔画直接排版；潮 的氵 三点重画成同一圈声波上的三段弧（高潮）；鸟 的点弯成小弧（呼应）
    def lay(g):
        return [g['char'].layout(it['shape']) for it in g['items']]
    m_strokes = lay(ming)
    c_strokes = lay(chao)
    wm_arc = WG.WM['点'] * K * 1.02
    # 三点的位置（骨架变换后的中线中点）
    dots = [it for it in chao['items'] if it['s'].part == '氵']
    mids = [np.array(chao['char'].to_layout((np.asarray(it['ax'][0]) + np.asarray(it['ax'][-1])) / 2)) for it in dots]
    # 声波圆心：音叉上、和氵中点同高（叉齿振动处）；上点和下提落在外圈，中点落在内圈——三段都朝外凸
    ring_c = (fx_, float(mids[1][1]) + 6)
    r_in = float(np.linalg.norm(mids[1] - np.array(ring_c))) + 10
    r_out = float((np.linalg.norm(mids[0] - np.array(ring_c)) + np.linalg.norm(mids[2] - np.array(ring_c))) / 2) + 6
    R = r_in
    arcs = []
    arc_spans = []
    for k, (it, m) in enumerate(zip(dots, mids)):
        rr = r_in if k == 1 else r_out
        a = math.degrees(math.atan2(m[1] - ring_c[1], m[0] - ring_c[0]))
        L = float(np.linalg.norm(np.asarray(it['ax'][-1]) - np.asarray(it['ax'][0]))) * K
        span = math.degrees(L / rr) * (1.25 if it['s'].type == '提' else 1.08)
        a0, a1 = a - span / 2, a + span / 2
        arcs.append(crescent(ring_c, rr, a0, a1, wm_arc * (1.08 if it['s'].type == '提' else 1.0)))
        arc_spans.append((rr, a0, a1))
    idx = [k for k, it in enumerate(chao['items']) if it['s'].part == '氵']
    for k, a in zip(idx, arcs):
        c_strokes[k] = a
        chao['items'][k]['climax'] = True
    # 呼应：鸟 的点
    bird_dot = [k for k, it in enumerate(ming['items']) if it['s'].type == '点'][0]
    it = ming['items'][bird_dot]
    mid = np.array(ming['char'].to_layout((np.asarray(it['ax'][0]) + np.asarray(it['ax'][-1])) / 2))
    r_d = float(np.linalg.norm(mid - np.array(ring_c)))
    a_d = math.degrees(math.atan2(mid[1] - ring_c[1], mid[0] - ring_c[0]))
    L = float(np.linalg.norm(np.asarray(it['ax'][-1]) - np.asarray(it['ax'][0]))) * K
    span = math.degrees(L / r_d) * 1.25
    m_strokes[bird_dot] = crescent(ring_c, r_d, a_d - span / 2, a_d + span / 2, WG.WM['点'] * K * 0.95)
    ming['items'][bird_dot]['echo'] = True
    text = G.union(m_strokes + c_strokes)
    climax = G.union(arcs)
    text_plain = G.diff(text, G.offset(climax, 0.5))

    # 细线：同心的声波细环（只画在字外的空处），线宽 = 最细的笔画（针尖收到的宽）
    lw = 3.4
    # 细环让开字和音叉：在栅格上做（字形很密，矢量布尔容易失败），这里先画完整的环
    ripples = []
    radii = [r_in, r_out, r_out + 0.2 * S, r_out + 0.42 * S, r_out + 0.66 * S]
    for k, rr in enumerate(radii):
        for a0, a1 in ((-84, 84), (96, 264)):
            P = arc_pts(ring_c, rr, a0, a1, 200)
            ripples.append(G.polyline(P, lw * (1.0 - 0.1 * k), cap='round', join='round'))
    ripples = G.union(ripples)
    # 端点小形：几颗落在细环上的小柳叶点（与声波弧同族）
    nodes = []
    for rr, aa in ((radii[2], -58), (radii[2], 238), (radii[3], -40), (radii[3], 220), (radii[4], -24), (radii[4], 204)):
        nodes.append(crescent(ring_c, rr, aa - 2.6, aa + 2.6, 10))
    nodes = G.union(nodes)

    # 英文：① 巨大的 WAVES 压在中文后面（明度贴近底板）② WUTHERING WAVES 沿最外一圈声波排（下弧）
    Fb = Font(F_TRB)
    name_cx = fx_
    big, _ = latin.text_line(Fb, 'WAVES', 470, name_cx, BASE - 0.10 * S, tracking=0.04, align='center')
    Fr = Font(F_TR)
    # 英文排在一圈声波上（下弧），这圈声波的半径对齐到中文字面框的底
    r_txt = (BASE + 0.12 * S + 118) - ring_c[1]
    span_t = 27
    arc_t = latin.text_on_arc(Fr, 'WUTHERING  WAVES', 38, ring_c[0], ring_c[1], r_txt, 90 + span_t, 90 - span_t, side='inner')
    # 下弧两端的细线（结构线）：把英文“托住”
    rule_l = G.polyline(arc_pts(ring_c, r_txt - 14, 90 + span_t + 22, 90 + span_t + 4, 40), lw, cap='round')
    rule_r = G.polyline(arc_pts(ring_c, r_txt - 14, 90 - span_t - 4, 90 - span_t - 22, 40), lw, cap='round')
    en_small = G.union(arc_t)
    rules = G.union(rule_l, rule_r)

    # 底板：一片水墨（横向的墨团，边上是干笔）——形状取“涟漪的水面”：四角都是大圆角
    x_l, x_r = X0 - 190, X0 + 2000 * K + GAP + 190
    y_t, y_b = em_top - 120, BASE + 0.12 * S + 150
    plate = G.rect(x_l, y_t, x_r, y_b, r=260)
    # 细环只在底板里（英文那一圈让开）
    ripples = G.inter(ripples, G.offset(plate, -30))
    ripples = G.diff(ripples, G.offset(G.union(en_small, rules), 16))
    nodes = G.inter(nodes, G.offset(plate, -30))
    shadow = G.move(text, 6, 8)
    return dict(ming=ming, chao=chao, m_strokes=m_strokes, c_strokes=c_strokes, text=text, text_plain=text_plain,
                climax=climax, fork=fork_all, ring_c=ring_c, R=R, ripples=ripples, nodes=nodes, big=big,
                en_small=en_small, rules=rules, plate=plate, shadow=shadow, em_top=em_top, arc_spans=arc_spans,
                r_txt=r_txt, prong_x=(fx_ - rad, fx_ + rad), r_in=r_in, r_out=r_out)


def preview():
    D = compose()
    paths = [(D['plate'], 40), (D['big'], 62), (D['ripples'], 150), (D['nodes'], 170), (D['fork'], 200),
             (D['shadow'], 10), (D['text_plain'], 245), (D['climax'], 220), (D['en_small'], 200), (D['rules'], 170)]
    bw_preview(paths, (2400, 1500), os.path.join(WORK, 'ww_preview.png'), scale=0.5, bg=128)
    print('preview ok')


def render(D, min_w=4300):
    import time
    from render_common import fit_canvas, write_outputs, chars_payload, write_data_js, box_of
    t0 = time.time()
    C = fit_canvas([D['plate'], D['fork']], 50, 1.0, min_w=min_w)
    H, W = C.H, C.W
    R, px = C.R, C.px
    XX, YY = C.XX, C.YY
    print('canvas', C)
    CYAN = '#7DF3E6'

    # ---------------- 底板：水墨（干笔的边，横向的笔丝）
    m0 = R(D['plate'])
    n1, n2 = fx.fbm(H, W, px(80), 61), fx.fbm(H, W, px(80), 62)
    m_w = fx.warp(m0, n1, n2, px(10))
    streak = fx.streaks(H, W, 63, density=0.010, length=(px(60), px(260)), angle=90, width=max(1, px(1.6)))
    streak = fx.blur(streak, 0.8)
    d_in = fx.dist_in((m_w > 0.5).astype(np.float32), reach=int(px(70)) + 4)
    edge = np.clip(1 - d_in / px(55), 0, 1)
    dry = fx.fbm(H, W, px(14), 64, octaves=4, aniso=(5.0, 0.6))
    hole = fx.smoothstep(0.52, 0.7, dry * 0.7 + edge * 0.55 - 0.1) * edge
    m_plate = np.clip(m_w * (1 - hole) + streak * edge * m_w * 0.4, 0, 1)
    # 墨色：中间略透出一点青
    rr, _ = C.polar(D['ring_c'])
    t_r = np.clip(rr / px(900) * C.scale / C.scale, 0, 1)
    ink = fx.ramp(np.clip(rr / 900.0, 0, 1), [(0, '#0E2A2E'), (0.55, '#0A1D20'), (1, '#071315')])
    wash = fx.fbm(H, W, px(110), 65, octaves=5)
    ink = fx.mix(ink, fx.rgb('#123A3D'), (fx.smoothstep(0.55, 0.95, wash) * 0.5)[..., None])
    ink = ink * (0.94 + 0.12 * (fx.grain(H, W, 66, 0.8) - 0.5))[..., None]
    L_plate = fx.solid(m_plate, ink)

    # ---------------- 背景英文
    m_big = R(D['big']) * (m_w > 0.5)
    L_big = fx.solid(m_big * 0.95, '#123236')

    # ---------------- 主体元素：音叉（主题色的光）
    m_fork = R(D['fork'])
    glow_f = fx.outer_glow(m_fork, px(14), spread=px(1)) * 0.65
    t_f = fx.linear_t(C, (0, G.bounds(D['fork'])[1]), (0, G.bounds(D['fork'])[3]))
    fork_col = fx.ramp(t_f, [(0, '#E9FFFB'), (0.4, '#9FF7EC'), (1, '#4CCFC2')])
    fork_col = fx.mix(fork_col, fx.rgb('#0C3A38'), (fx.inner_stroke(m_fork, px(1.0)) * 0.5)[..., None])
    L_fork = fx.stack([fx.glow_layer(glow_f * (1 - m_fork), CYAN), fx.solid(m_fork, fork_col)])

    # ---------------- 阴影（贴着字边）
    m_text = R(D['text_plain'])
    m_cl = R(D['climax'])
    m_all = np.clip(m_text + m_cl, 0, 1)
    m_sh = fx.blur(R(D['shadow']), px(2.5))
    L_sh = fx.solid(m_sh * (1 - m_all) * 0.85, '#010708')

    # ---------------- 字面：珠母（螺钿）——白里透青、粉、金的虹彩
    b = G.bounds(D['text'])
    t_y = fx.linear_t(C, (0, b[1]), (0, b[3]))
    base = fx.ramp(t_y, [(0, '#FFFFFF'), (0.5, '#EEF7F4'), (1, '#D6E8E4')])
    hue = fx.fbm(H, W, px(36), 67, octaves=4)
    hue = fx.warp(hue, fx.fbm(H, W, px(50), 68), fx.fbm(H, W, px(50), 69), px(20))
    irid = fx.ramp(hue, [(0, '#BFF4EC'), (0.35, '#F6D9E6'), (0.6, '#F7EBC8'), (0.85, '#C9E3FA'), (1, '#BFF4EC')])
    face = fx.mix(base, irid, 0.38)
    hi_b, sh_b = fx.bevel(m_text, px(3.4), soften=1.0, chisel=False, angle=120, altitude=42)
    face = fx.mix(face, fx.rgb('#FFFFFF'), (hi_b * 0.6)[..., None])
    face = fx.mix(face, fx.rgb('#6E8C8A'), (sh_b * 0.45)[..., None])
    L_text = fx.solid(m_text, face)

    # ---------------- 高潮：声波弧（和音叉同色同光）
    g_cl = fx.outer_glow(m_cl, px(10), spread=px(1)) * 0.75
    cl_col = fx.ramp(t_y, [(0, '#F2FFFD'), (1, '#8FF2E6')])
    cl_col = fx.mix(cl_col, fx.rgb('#FFFFFF'), (fx.inner_glow(m_cl, px(6), edge=False) * 0.5)[..., None])
    L_cl = fx.stack([fx.glow_layer(g_cl * (1 - m_cl), CYAN), fx.solid(m_cl, cl_col)])

    # ---------------- 英文（下弧）
    m_en = R(D['en_small'])
    m_rules = R(D['rules'])
    L_en = fx.stack([fx.solid(m_en, '#CFEDE7'), fx.solid(m_rules * 0.9, CYAN)])

    # ---------------- 细线与点：同心的声波细环
    m_rip = R(D['ripples'])
    # 细环让开字和音叉 20 个版面单位
    m_keep = np.clip(R(D['text']) + R(D['fork']), 0, 1)
    m_rip = m_rip * (1 - fx.dilate(m_keep, px(20)))
    m_nodes = R(D['nodes'])
    rr2, _ = C.polar(D['ring_c'])
    fade = np.clip(1.15 - rr2 / 820.0, 0.25, 1.0)
    L_rip = fx.stack([fx.solid(m_rip * fade * 0.75, CYAN), fx.solid(m_nodes * 0.95, '#C8FFF8')])

    # ---------------- 高光：受光边、叉齿尖的光
    rim = fx.rim_light(m_text, px(1.6), angle=120) * 0.7
    L_hi = fx.solid(rim, '#FFFFFF')
    fb = G.bounds(D['fork'])
    glints = np.zeros((H, W), np.float32)
    for x in (D['prong_x'][0], D['prong_x'][1]):
        r3, th = C.polar((x, fb[1] + 12))
        glints += np.exp(-(r3 / 7.0) ** 2) + 0.6 * np.exp(-(np.abs(np.sin(th)) * r3 / 1.6) ** 2) * np.exp(-(r3 / 60.0) ** 2)
    r4, _ = C.polar(D['ring_c'])
    core = np.exp(-(r4 / 46.0) ** 2) * 0.55
    L_hi = fx.stack([L_hi, fx.glow_layer(core, CYAN), fx.glow_layer(np.clip(glints, 0, 1.5), '#E8FFFC')])

    layers = {
        '底板_水墨': L_plate,
        '背景英文_WAVES': L_big,
        '主体元素_音叉': L_fork,
        '阴影': L_sh,
        '字_主名鸣潮': L_text,
        '字_高潮声波弧': L_cl,
        '英文_沿声波排的小号大写': L_en,
        '细线与点_同心声波环': L_rip,
        '高光_受光边与叉尖': L_hi,
    }
    print('layers', f'{time.time() - t0:.1f}s')
    tones = {'底板_水墨': 0.12, '背景英文_WAVES': 0.22, '主体元素_音叉': 0.78, '阴影': 0.0, '字_主名鸣潮': 1.0,
             '字_高潮声波弧': 0.86, '英文_沿声波排的小号大写': 0.8, '细线与点_同心声波环': 0.55, '高光_受光边与叉尖': 1.0}
    web_layers, full = write_outputs('ww', '鸣潮', layers, C, tones, ['阴影', '字_主名鸣潮', '字_高潮声波弧'])
    groups = ['plate', 'bgEn', 'main', 'text', 'text', 'text', 'lines', 'lines', 'hi']
    for wl, g in zip(web_layers, groups):
        wl['group'] = g
    # 逐笔数据
    for g, strokes in ((D['ming'], D['m_strokes']), (D['chao'], D['c_strokes'])):
        g['strokes'] = strokes
        ch = g['char']
        g['font_shapes'] = [it['shape'] for it in g['items']]
        for k, it in enumerate(g['items']):
            if it.get('climax') or it.get('echo'):
                # 弧形是版面上画的：换回字体单位给示意图用
                k_ = 1.0 / ch.k
                g['font_shapes'][k] = strokes[k].transform(k_, 0, 0, -k_, -ch.x0 * k_, ch.base * k_)
    chars = chars_payload(C, [('main', [D['ming'], D['chao']])])
    motif = [{'kind': 'climax', 'label': '高潮 · 潮的氵 → 三段声波弧', 'box': box_of(C, D['climax'])}]
    ming = D['ming']
    k_echo = [k for k, it in enumerate(ming['items']) if it.get('echo')][0]
    motif.append({'kind': 'echo', 'label': '呼应 · 鸟的点弯成一小段声波', 'box': box_of(C, D['m_strokes'][k_echo])})
    motif.append({'kind': 'element', 'label': '主体元素 · 音叉（共鸣者）', 'box': box_of(C, D['fork'])})
    motif.append({'kind': 'line', 'label': '细线 · 同心声波环', 'box': box_of(C, D['ripples'])})
    motif.append({'kind': 'en', 'label': '英文 · 沿一圈声波排的罗马大写', 'box': box_of(C, D['en_small'])})
    data = {'key': 'ww', 'canvas': [round(C.w, 2), round(C.h, 2)], 'px': [C.W, C.H], 'layers': web_layers,
            'chars': chars, 'motif': motif}
    write_data_js('ww', data)
    print('done', f'{time.time() - t0:.1f}s')


if __name__ == '__main__':
    mode = sys.argv[1] if len(sys.argv) > 1 else 'preview'
    if mode == 'preview':
        preview()
    elif mode == 'final':
        render(compose())

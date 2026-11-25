"""03 玻璃温室与花艺工作室 · 颜色层：每层一个 render(C, G, tok) -> 预乘 RGBA。画法在 paint.py。

颜色角色（报告 2.4）：
  字面色    暖棕墨（tok.ink），全组一种；受光的左上沿一线琥珀
  主题色    琥珀（tok.world / light）和玻璃灰绿两团水彩，敷在图鉴纸上：琥珀托第一段和 Hortus，灰绿托「室」和花
  阴影      暖棕（tok.worldDeep），偏右下，柔
  高光      夕光的琥珀白：字的受光沿、玻璃的斜反光、石膏受光面、黄铜的高光、屋脊顶饰上的星
  点缀色    陶土（tok.lit）：花盆为主；盆底的颜料往纸上洇开、顺着台面线淌开一小片为呼应
  扩散的纹理 夕光从左上斜照下来的几道光束（和底板上的是同一组）：落在墨字上是一层透明的琥珀，
            每道光的下沿一丝玻璃灰绿（光是透过玻璃来的），从左上往右下渐弱
  共用金属  黄铜：Hortus、藤、台面线左端的球、屋脊顶饰
  主角材质  石膏：「至」和马蹄莲同一块料
"""
import numpy as np
from lockupkit import fx as F
from lockupkit.geom import union, rect, circle, stroke_line
from . import paint as PT

AMBER_LIGHT = '#F2C27A'    # 夕光落在东西上的颜色


def _lum_ramp(t, a, b):
    return F.mix(F.rgb(a)[None, None], F.rgb(b)[None, None], np.clip(t, 0, 1)[..., None])


# ====================================================================== 底板：图鉴纸上的两团水彩


def render_plate(C, G, tok):
    XX, YY, px = C.XX, C.YY, C.px
    tex = PT.paper_tex(C, 11)
    # 琥珀：托住第一段和 Hortus，从左上（夕光来的方向）最浓，往右下淡；左下角让出来
    amber_shape = np.clip(1.15 - (((XX - 430) / 470) ** 2 + ((YY - 175) / 150) ** 2), 0, 1)
    amber_shape = np.maximum(amber_shape, np.clip(0.9 - (((XX - 640) / 520) ** 2 + ((YY - 300) / 110) ** 2), 0, 1) * 0.8)
    L1, a1 = PT.wash(C, amber_shape, '#E6C28A', 101, edge_col='#CB9550', opacity=0.6, cell=80, thresh=0.36, edge=0.55, inner=0.1,
                     granule=0.22, tex=tex)
    # 灰绿：玻璃的颜色，托住「室」和花盆、马蹄莲
    g_shape = np.clip(1.1 - (((XX - 960) / 210) ** 2 + ((YY - 230) / 175) ** 2), 0, 1)
    L2, a2 = PT.wash(C, g_shape, '#AFC5B8', 107, edge_col='#86A595', opacity=0.66, cell=64, thresh=0.34, edge=0.6, tex=tex)
    # 玻璃色的第二遍：只在「室」和花的身后，颜色更深（石膏的白要靠它托出来），湿边收得更利
    core = np.clip(1.05 - (((XX - 930) / 150) ** 2 + ((YY - 250) / 120) ** 2), 0, 1)
    L2b, _ = PT.wash(C, core, '#7E9E90', 109, edge_col='#5F8274', opacity=0.6, cell=48, thresh=0.4, edge=0.7, inner=0.12, tex=tex)
    L2 = F.over(L2, L2b)
    # 台面：沿着台面线一笔横扫的干笔，下沿被刷毛拉成飞白（1999 的撕边底板在纸上的样子）
    band = F.smoothstep(G['table']['y'] - 34, G['table']['y'] - 2, YY) * F.smoothstep(G['table']['y'] + 40, G['table']['y'] + 6, YY)
    span = F.smoothstep(60, 220, XX) * F.smoothstep(1180, 1040, XX)
    br = F.fbm(C.H, C.W, 26, 113, octaves=5, aniso=(12.0, 0.3))
    dry = F.smoothstep(0.42, 0.62, band * span * 0.95 + (br - 0.5) * 0.55)
    L3 = F.solid(dry * 0.32 * (0.75 + 0.25 * tex), '#C9A574')
    # 夕光：几道斜斜落下来的光（只把纸提亮一点、暖一点）
    bs, _ = beams(C)
    bm = F.blur(bs, px(2.0)) * np.maximum(a1, a2 * 0.7)
    out = F.stack([L1, L2, L3])
    out = F.over(out, F.solid(np.clip(bm, 0, 1) * 0.3, '#FFF1D2'))
    # 夕光的源头：左上角一团暖白的光晕（纸本身被照亮）
    glow = np.exp(-(((XX - 120) / 360) ** 2 + ((YY - 30) / 220) ** 2)) * 0.32
    out = F.over(out, F.solid(glow, '#FFE6B8'))
    # 四边淡出（右边让给代表画面）
    fade = F.smoothstep(0, 40, XX) * F.smoothstep(C.w, C.w - 70, XX) * F.smoothstep(0, 24, YY) * F.smoothstep(C.h, C.h - 50, YY)
    return out * fade[..., None]


# ====================================================================== 台面线


def render_line(C, G, tok):
    T = G['table']
    h = G['hair']
    y = T['y']
    ln = C.R(rect(T['x0'], y - h / 2, T['x1'], y + h / 2), ss=3) * np.clip((T['x1'] - C.XX) / 60, 0, 1) ** 0.6
    ball = C.R(T['ball'], ss=3)
    col = PT.brass(C, ball, y - h * 2, y + h * 2)
    return F.stack([F.solid(ln * 0.92, tok['ink']), F.solid(F.outer_stroke(ball, C.px(0.7)), tok['ink']), F.solid(ball, col)])


# ====================================================================== 主体元素


def render_lily(C, G, tok):
    """石膏马蹄莲：茎、两片叶、佛焰苞（喉部背光、肉穗被夕光照成琥珀）；一圈墨线；纸上一道柔影"""
    E = G['emblem']
    Cl = E['calla']
    m = C.R(E['plaster'], ss=3)
    col = PT.plaster(C, m, bevel_px=3.0, seed=43)
    th = C.R(Cl['throat'], ss=3)
    # 喉部：往里背光的冷灰，靠口沿一圈被反光提亮
    dth = F.dist_in((th > 0.5).astype(np.float32))
    thc = _lum_ramp(np.clip(dth / C.px(9), 0, 1), '#D9DAD2', '#9EA7A2')
    col = F.mix(col, thc, th[..., None])
    sp = C.R(Cl['spadix'], ss=3)
    spc = PT.brass(C, sp, Cl['tip'][1], Cl['base'][1], dark='#B07A36', mid='#E0AE5C', light='#F6D59A', spec='#FFF6E0', bevel_px=1.0)
    # 叶脉：叶片中线一道细的冷灰
    vein = C.zeros()
    for a, b in E['veins']:
        vein = np.maximum(vein, C.R(stroke_line([tuple(a), tuple(b)], 1.0)))
    col = col * (1 - (vein * m)[..., None] * 0.22)
    edge = PT.contour(C, np.maximum(m, sp), 0.85)
    sh = PT.soft_shadow(C, m, 5, 6, 5)
    return F.stack([F.solid(sh * 0.22, tok['worldDeep']), F.solid(edge, tok['ink']), F.solid(m, col), F.solid(sp, spc),
                    F.solid(PT.contour(C, sp, 0.6) * th, tok['ink'])])


def render_pot(C, G, tok):
    """陶土花盆：水彩敷两档（受光左边、背光右边），盆沿亮一档，盆口一线暗土；颜料从盆底往台面上洇开一小片（点缀色的扩散）"""
    P = G['emblem']['pot']
    XX, YY, px = C.XX, C.YY, C.px
    body, rim, mouth = C.R(P['body'], ss=3), C.R(P['rim'], ss=3), C.R(P['mouth'], ss=3)
    allm = np.clip(body + rim, 0, 1)
    x0, y0, x1, y1 = P['box']
    u = np.clip((XX - x0) / (x1 - x0), 0, 1)
    base = F.ramp(u, [(0, '#D98A5E'), (0.32, '#C76E45'), (0.7, tok['lit']), (1.0, '#86412A')])
    tex = PT.paper_tex(C, 61)
    n = F.fbm(C.H, C.W, 14, 62, octaves=4)
    col = base * (0.9 + 0.2 * (n[..., None] - 0.5)) * (0.94 + 0.1 * tex[..., None])
    # 湿边：盆身靠边一圈颜色更重
    d = F.dist_in((body > 0.5).astype(np.float32))
    col = col * (1 - np.exp(-d / px(1.6))[..., None] * 0.18 * body[..., None])
    rc = F.ramp(u, [(0, '#E7A27A'), (0.4, '#D27E55'), (1, '#9A4A2E')])
    col = F.mix(col, rc, rim[..., None])
    # 盆沿下面一道影
    under_rim = F.shift(rim, 0, px(2.5)) * body * (1 - rim)
    col = col * (1 - F.blur(under_rim, px(1.2))[..., None] * 0.3)
    col = F.mix(col, F.rgb('#4B2B1E')[None, None], (mouth * 0.9)[..., None])
    hi = F.rim_light(allm, px(1.0), angle=PT.LIGHT_ANGLE, power=1.6)
    col = col + (F.rgb('#FFD9B0') - col) * (hi * 0.6)[..., None]
    edge = PT.contour(C, allm, 0.85)
    # 点缀色的扩散：盆底的陶土颜料往台面上洇开（右边被夕光推得更远），颗粒沉进纸纹，前沿一线积色
    ty = G['table']['y']
    cx = P['cx']
    # 一小汪：贴着台面线下沿往右淌开，形是干净的，边上一线积色，里面极淡的颗粒
    src = np.clip(1.0 - (((XX - cx - 34) / 92) ** 2 + ((YY - ty - 7) / 11) ** 2), 0, 1)
    pud, _ = PT.wash(C, src, tok['lit'], 63, edge_col='#8E3F22', opacity=1.0, cell=26, warp_px=6, thresh=0.3, soft=0.03,
                      edge=0.8, granule=0.18, inner=0.25, tex=tex)
    bloom = F.unpremul(pud)[..., 3] * F.smoothstep(ty + 1, ty + 4, YY)
    # 几滴甩出去的陶土色：往右、往上，圆而干净
    rng = np.random.default_rng(64)
    for _ in range(9):
        x = cx + rng.uniform(20, 120)
        y = ty - rng.uniform(-4, 70)
        r = rng.uniform(0.9, 2.6)
        bloom = np.maximum(bloom, C.R(circle(x, y, r)) * rng.uniform(0.6, 1.0))
    sh = PT.soft_shadow(C, allm, 6, 3, 4)
    return F.stack([F.solid(np.clip(bloom, 0, 1) * 0.42, tok['lit']), F.solid(sh * 0.3, tok['worldDeep']), F.solid(edge, tok['ink']), F.solid(allm, col)])


# ====================================================================== 汉字


BEAMS = ((330, 30, 1.0), (450, 12, 0.7), (650, 40, 0.85), (840, 16, 0.6), (980, 26, 0.5))


def beams(C, soft=1.0):
    """夕光的光束：沿 35° 斜下来的几道带（锐利的边，带里平），强度从左上往右下减；返回 (光, 光的下沿)"""
    u = C.XX * 0.62 + C.YY * 0.78
    s = C.zeros()
    fr = C.zeros()
    for c, w, k in BEAMS:
        d = (u - c) / w
        band = F.smoothstep(1.15, 0.95, np.abs(d))
        s = np.maximum(s, band * k)
        fr = np.maximum(fr, np.exp(-((d - 1.25) / 0.18) ** 2) * k)
    fade = np.clip(1.25 - (C.XX + C.YY * 0.6) / 1150, 0, 1)
    return s * fade, fr * fade


def _ink_face(C, A, G, tok, chars, dapple_seed=21, dapple_amt=1.0):
    """墨字：每个字自己上暖下深；夕光透过玻璃落下的光斑；受光沿一线琥珀；背光沿收一点"""
    YY, px = C.YY, C.px
    t = C.zeros()
    for c in chars:
        m = C.R(c['path'])
        tt = np.clip((YY - c['top']) / (c['bottom'] - c['top']), 0, 1)
        t = np.where(m > 0.01, tt, t)
    col = _lum_ramp(t, '#5E4130', '#3A281D')
    # 夕光：从左上斜照下来的几道光（和底板上的光束是同一组），落在墨字上是一层透明的琥珀；
    # 每道光的下沿一丝玻璃的灰绿（光是透过玻璃来的）。越往右下越弱
    s, fr = beams(C)
    s = s * A * dapple_amt
    fr = fr * A * dapple_amt
    col = F.mix(col, F.rgb('#B07A45')[None, None], (s * 0.55)[..., None])
    col = F.mix(col, F.rgb('#6F9283')[None, None], (fr * 0.5)[..., None])
    # 受光沿、背光沿
    rim = F.rim_light(A, px(0.9), angle=PT.LIGHT_ANGLE, power=1.8)
    col = col + (F.rgb(AMBER_LIGHT) - col) * (rim * 0.75)[..., None]
    back = F.rim_light(A, px(1.2), angle=PT.LIGHT_ANGLE + 180, power=1.8)
    col = col * (1 - back[..., None] * 0.25)
    # 极淡的印痕：墨吃进纸里的不匀
    g = F.fbm(C.H, C.W, 7, dapple_seed + 9, octaves=3)
    col = col * (1 + (g[..., None] - 0.5) * 0.08)
    return np.clip(col, 0, 1)


def render_text(C, G, tok):
    A = C.R(G['body'], ss=3)
    chars = [c for c in G['chars'][:9]]
    col = _ink_face(C, A, G, tok, chars)
    sh = PT.soft_shadow(C, A, 2.6, 3.4, 2.6, spread=0.4)
    halo = F.outer_glow(A, C.px(9), spread=C.px(1.0), gain=0.8)
    return F.stack([F.solid(halo * 0.28, '#FBF2E2'), F.solid(sh * 0.34, tok['worldDeep']), F.solid(A, col)])


def render_hero(C, G, tok):
    """签名字「室」：铸铁的人字顶（墨）、四格灰绿玻璃（夕光从左上进来）、石膏的「至」；顶饰是黄铜"""
    R = G['roof']
    fr = C.R(R['frame'], ss=3)
    gl_cells = [C.R(c, ss=3) for c in R['glass']]
    hb = C.R(G['hero_body'], ss=3)
    tri = C.R(R['tri'], ss=3)
    ax, ay = R['apex']
    # 玻璃：每一格各自的色（老温室的玻璃不一样绿），左上进光
    out_g = C.empty()
    for i, m in enumerate(gl_cells):
        tint = ['#A4BFB1', '#98B5A8', '#A9C4B4', '#93B0A3'][i % 4]
        col, a = PT.glass(C, m, tint=tint, seed=i + 2, light_from=(ax - 120, ay - 40), reach=190)
        out_g = F.over(out_g, F.solid(a, col))
    # 框：黄铜（共用金属；温室的铸铁框刷了铜漆，夕光下是亮的），一圈墨线收边
    fy0, fy1 = R['spike_top'][1], R['frame_bottom']
    frc = PT.brass(C, fr, fy0, fy1, dark='#5E3E1C', mid='#A87532', light='#E9C27A', spec='#FFF1CF', bevel_px=0.9)
    fr_edge = F.outer_stroke(fr, C.px(0.55))
    fb = C.R(circle(ax, ay, 3.6), ss=3)
    # 石膏「至」
    pc = PT.plaster(C, hb, cool='#9AA39D', bevel_px=3.4, seed=47, key=1.15)
    # 「至」被玻璃顶滤过的光：上半略带一点灰绿的反光
    tt = np.clip((C.YY - (ay + 30)) / 120, 0, 1)
    pc = F.mix(pc, F.rgb('#DCE6DD')[None, None], ((1 - tt) * 0.22 * hb)[..., None])
    edge = PT.contour(C, hb, 1.2)
    sh = PT.soft_shadow(C, hb, 5.0, 6.0, 3.6, spread=0.8)
    sh_f = PT.soft_shadow(C, fr, 2.6, 3.4, 2.6)
    glass_sh = PT.soft_shadow(C, tri, 3, 4, 5) * 0.4
    fbc = PT.brass(C, fb, ay - 5, ay + 5)
    return F.stack([F.solid(sh * 0.5, '#4F5F55'), F.solid(sh_f * 0.3, tok['worldDeep']),
                    F.solid(glass_sh, '#6F8C7E'), out_g, F.solid(edge, tok['ink']), F.solid(hb, pc), F.solid(fr_edge * 0.85, '#3E2A1C'),
                    F.solid(fr, frc), F.solid(fb, fbc)])


# ====================================================================== 英文


def render_en(C, G, tok):
    H = G['hortus']
    V = G['vine']
    hb = H['H_box']
    mH = C.R(H['H'], ss=3)
    mr = C.R(H['rest'], ss=3)
    mv = C.R(union(V['vine'], V['leaves']), ss=3)
    allm = np.clip(mH + mr + mv, 0, 1)
    col = PT.brass(C, allm, hb[1], hb[3] + 6)
    # 藤和小写：黄铜收暗一档（主次：H 最亮）
    lowc = PT.brass(C, allm, hb[1] + 20, hb[3] + 40, dark='#6A4520', mid='#A07438', light='#D9B26E', spec='#F6E2B6', bevel_px=0.9)
    col = F.mix(col, lowc, np.clip(mv + mr, 0, 1)[..., None])
    edge = F.outer_stroke(allm, C.px(0.6))
    sh = PT.soft_shadow(C, allm, 1.6, 2.2, 1.6)
    caps = C.R(G['caps'], ss=3)
    return F.stack([F.solid(sh * 0.3, tok['worldDeep']), F.solid(edge * 0.55, '#5A3B1E'), F.solid(allm, col), F.solid(caps * 0.92, tok['worldDeep'])])


# ====================================================================== 高光


def render_fx(C, G, tok):
    """夕光里的几粒亮：玻璃上两三颗、H 的肩上一颗、马蹄莲苞尖一颗；空中几粒浮尘（屋脊顶饰上的那颗星是矢量的）"""
    XX, YY, px = C.XX, C.YY, C.px
    out = []
    pts = []
    R = G['roof']
    ax, ay = R['apex']
    pts += [(ax - 46, ay + 26, 5.5), (ax + 30, ay + 40, 3.6)]
    hb = G['hortus']['H_box']
    pts += [(hb[0] + (hb[2] - hb[0]) * 0.36, hb[1] + 6, 6.5)]
    tip = G['emblem']['calla']['tip']
    pts += [(tip[0] + 2, tip[1] + 6, 4.5)]
    m = C.zeros()
    for x, y, s in pts:
        st = C.R(__import__('lockupkit.geom', fromlist=['star4']).star4(x, y, s, 0.14, ry=s * 1.5))
        m = np.maximum(m, st + np.exp(-(((XX - x) ** 2 + (YY - y) ** 2) / (s * 0.6) ** 2)) * 0.9)
    out.append(F.glow_layer(F.blur(m, px(1.2)) * 0.6, '#FFD9A0'))
    out.append(F.glow_layer(np.clip(m, 0, 1.4), '#FFF6E6'))
    # 浮尘：夕光的光束里几粒
    beam = np.clip(1 - (XX + YY) / 1300, 0, 1) * F.smoothstep(40, 120, YY)
    dust = F.sparkles(C.H, C.W, 91, beam * F.smoothstep(0, 1, 1 - C.R(G['text'])), 34, size=(0.6, 1.6), flare=0)
    out.append(F.glow_layer(dust * 0.55, '#FFE9C2'))
    return F.stack(out)


# ====================================================================== 小形态


def plaster_small(C, mask, tone, tok):
    """书脊、迷你里的签名字：石膏收成它最认得出的那一面（暖白、受光面一线琥珀）。墨的那几档（纸、浅布：这一卷的布是浅褐）
    和全量锁定里的石膏「至」一样，外面一圈墨线、往右下一道墨影，把白托出来"""
    col = PT.plaster(C, mask, base='#F8F3EA', warm='#F6D6A2', cool='#B2B8B1', bevel_px=0.9, ao=0.3)
    if tone in ('ink', 'stamp-ink'):
        edge = F.outer_stroke(mask, C.px(1.3))
        sh = PT.soft_shadow(C, mask, 1.2, 1.6, 1.2)
        return F.stack([F.solid(sh * 0.45, tok['ink']), F.solid(edge, tok['ink']), F.solid(mask, col)])
    return F.solid(mask, col)

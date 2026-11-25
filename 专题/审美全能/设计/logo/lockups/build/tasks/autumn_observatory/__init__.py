"""02 秋庭观星画室 · 题名锁定模块。

  概念单     CONCEPT（下面）
  笔画标注   strokes.py
  刀法       knife.py（本题自己的笔画构造：刀只削短弯、横画加厚）
  笔画处理   letters.py（方言「刻本木版宋」、圆珠呼应、星的中横让给黄道环）
  主体元素   emblem.py（浑天仪）
  英文       english.py（STARGAZING 背景巨字、斜体小档、底线带、朱印）
  颜色层     layers.py（卡通渲染 = 木版套色：墨线版 + 平涂色版 + 硬边明暗）；图层表 LAYERS 和入场在本文件
出图：python 专题/审美全能/设计/logo/lockups/build/lockup.py autumn-observatory
"""
import numpy as np
from lockupkit.geom import union, diff, inter, rect
from lockupkit.run import Layer
from . import letters as LT, emblem as EM, english as EN, layers as LY
from .strokes import STROKES  # noqa: F401  （--strokes 用）

KEY = 'autumn-observatory'
TEXT = LT.TEXT
FONT = LT.FONT

CONCEPT = {
    '题名': '秋庭观星画室', '类别': '卡通渲染',
    '一句话概念': '一页木版套色的观星图：深秋的画室里，浑天仪的环套住一颗星。木版套色（新版画）是“平涂加墨线”，和卡通渲染同源。',
    '气质词': ['静谧', '怀旧', '温润'], '物件': '浑天仪（黄道环穿过「星」的日）', '动作': '铜环转到对齐、星落在环上',
    '同源媒介': '新版画的木版套色：一块墨线版加几块色版，色版平涂、边硬，版木的纹和和纸的纤维印在色里',
    '方言': '刻本木版宋：底字 Bold（比别题轻一档）；横画上下加厚，刀刻不出发丝，横竖对比三比一上下；刀只削短弯——竖脚、横末三角的勾、'
          '转角的小圆、撇的圆尖都削成一刀直线，长的撇捺弧顺刀留圆；字形锐利',
    '骨架': '两段错开：第一段「秋庭观」、第二段「画室」坐低一档，签名字「星」放大到 1.84 倍跨两段；字距略松（1.02 em）；横画水平，'
            '黄道环倾 -6°（在日里读成一道微微右扬的中横）、赤道环倾 +20°，全件只用这两个斜角',
    '母题落点': {'高潮': '「星」日的中横换成浑天仪的黄道环：环的前半圈正好穿过日心，从左竖后面、右竖前面穿过，在日里就是那一道中横（黄铜，'
                       '和横画同粗），出日变成发丝轨道，右边顺切线飞出去接 geo.out；日心落星芒（片头飞来的星落在这里）',
               '呼应': '所有的点（秋的两点、庭和室的顶点、室的左点、至的点）换成黄铜圆珠——轨道上停着的小珠，画成卡通的三档明暗；'
                       '浑天仪环上的珠、底线上的珠是同一种'},
    '主体元素': '浑天仪，把「星」的头包住：卡通明暗的靛蓝天球（印着秋季四边形）、子午环（黄铜环带加刻度）、赤道环、黄道环、极轴和顶珠；'
                '「生」像它的底座，顶珠顶出剪影上沿',
    '英文分工': 'STAR ◉ GAZING 背景巨字：淡版，拆在浑天仪两边，天球就是两个词之间的空（学 1999 精灵仍在等待把水晶球放进 AWAITS），STAR 被第一段挡住上沿、GAZING 在「画室」上方露出来；in an autumn garden 斜体小档坐第二段基线；'
                'STARGAZING ATELIER 底线带坐在带珠的黄铜发丝上；朱印竖排 AUTUMN（新版画的版元印）',
    '颜色角色': {'字面': '和纸白（暖），下沿一抹杏色ぼかし，版木纹和纸纤维', '主题色': '黄昏靛紫（霞形底板、天球）',
               '阴影': '靛紫暗调：字的卡通厚度和墨线', '高光': '受光一侧的硬边亮线、珠上的一点高光',
               '点缀': '朱：签名字「星」朱漆（窗光反射、金粉从右下撒开）为主，赤道环上的朱珠、朱印为呼应；天球里几粒朱星',
               '共用金属': '黄铜（环、珠、底线）'},
    '检查': '去色、遮掉浑天仪只剩字、缩到缩略图、白底黑底',
}

# ------------------------------------------------------------------ 版式（舞台像素；画板左上 = 介绍页上锁定的原点）

ARTBOARD = (1160, 520)
S1, SH, S2 = 112, 206, 112          # 第一段、签名字「星」、第二段的字号
ADV = 1020                          # 字距（字体单位）：略松
X1, B1 = 104, 246                   # 第一段第一个字的原点和基线
BH = 372                            # 「星」的基线（和第二段同一条）
XH = X1 + 3 * ADV * S1 / 1000 + 8
X2, B2 = XH + 0.985 * SH, 372       # 第二段
SUN = (508, 626)                    # 「星」日的中心（字体单位）
R = 118                             # 浑天仪子午环半径
ECL = (R, 27.0, -6.0)               # 黄道环：长半径、短半径、倾角（日里要读成一道中横，只微微右扬）
WB = 9.4                            # 黄道环在日里的宽（和横画同粗略重一点）
HAIR = 3.0                          # 发丝线宽（≈ 本题最细的笔画）
GAP = 1.8                           # 压在下面的那一笔和上面那一笔之间留的缝
BAND_Y = 404                        # 底线（收底的基线）
SEAL = (884, 326, 25, 78)           # 朱印 x, 上沿, 宽, 高
GHOST = dict(size=94, base=300, gap=12)   # STAR | 浑天仪 | GAZING：天球正好是两个词之间的那个空


def _t_at_x(E, ecl, x, lo, hi):
    """前半圈（t 在 lo..hi 之间）上横坐标等于 x 的那一点的 t"""
    ts = np.linspace(lo, hi, 2001)
    xs = np.array([EM.ell_pt(E, *ecl, t)[0] for t in ts])
    i = int(np.argmin(np.abs(xs - x)))
    return float(ts[i])


def geometry(tok):
    T = LT.letters()
    for i in range(3):
        T[i].place(X1 + i * ADV * S1 / 1000, B1, S1)
    T['星'].place(XH, BH, SH)
    for i in range(2):
        T[4 + i].place(X2 + i * ADV * S2 / 1000, B2, S2)
    star_g = T['星']
    C = np.array(star_g.to_stage(SUN))
    # 球心：黄道环前半圈的正中（t=90）落在日心
    E = C - EM.rot((0, ECL[1]), ECL[2])
    A = EM.armillary(tuple(E), R, ECL, HAIR)

    # ---- 黄道环在日里那一段（hero 层画）：从左竖外沿到右竖外沿；压在左竖后面、盖在右竖前面
    xl0, xl1 = star_g.to_stage((190, 0))[0], star_g.to_stage((316, 0))[0]     # 左竖
    xr0, xr1 = star_g.to_stage((700, 0))[0], star_g.to_stage((829, 0))[0]     # 右竖
    yt, yb = star_g.to_stage((0, 850))[1], star_g.to_stage((0, 410))[1]
    tL = _t_at_x(E, ECL, xl0 - 1.0, 90, 180)
    tR = _t_at_x(E, ECL, xr1 + 1.0, 0, 90)
    pts = [tuple(q) for q in EM.ell_pts(E, *ECL, tL, tR, 80)]
    band = EM.tapered(pts, [WB] * len(pts))
    band_cut = EM.tapered(pts, [WB + 2 * GAP] * len(pts))
    left_v = rect(xl0 - GAP, yt, xl1 + GAP, yb)
    right_v = rect(xr0 - 2, yt, xr1 + 2, yb)
    band_vis = diff(band, left_v)                                  # 从左竖后面穿过
    hero = diff(star_g.stage_path(), inter(band_cut, right_v))     # 盖在右竖前面
    # ---- 日外的发丝：左边从左竖外沿往左、绕到左端；右边从右竖外沿绕到右端（前半圈，盖在字前）
    def arm(t0, t1, n=60, taper=16.0):
        q = EM.ell_pts(E, *ECL, t0, t1, n)
        d = np.concatenate([[0], np.cumsum([np.linalg.norm(q[i + 1] - q[i]) for i in range(len(q) - 1)])])
        w = [HAIR + (WB - HAIR) * max(0.0, 1 - s / taper) ** 1.5 for s in d]
        return EM.tapered([tuple(v) for v in q], w)
    ecl_front = union(arm(tL, 180), arm(tR, 0))
    # ---- 伸进画面的那一根：右竖外沿那一点，顺切线出去（geo.out，矢量）
    p_out = EM.ell_pt(E, *ECL, tR)
    d_out = EM.ell_tangent(E, *ECL, tR, sign=-1)

    glyphs = [g.stage_path() for g in T]
    text_only = union([g.stage_path() for g in T if g.ch != '星'])
    text = union(glyphs)
    beads = LT.beads_stage(T)
    chars = [{'path': p, 'top': g.base - 0.86 * g.size, 'bottom': g.base + 0.10 * g.size, 'hero': g.ch == '星'} for p, g in zip(glyphs, T)]

    # ---- 英文
    gx1 = E[0] + R + 3.5 + GHOST['gap']
    gh = EN.ghost_split('STAR', 'GAZING', GHOST['size'], X1 + 2, gx1, GHOST['base'])
    it_p, it_w = EN.italic('in an autumn garden', 34, X1 + 6, B2)
    sx, sy, sw, sh = SEAL
    caps_p, caps_x0 = EN.caps('STARGAZING ATELIER', 12.5, sx - 12, BAND_Y - 7)
    seal = EN.seal(sx, sy, sw, sh)
    # 底线：一根黄铜发丝，左端从第一段的左边起，右端接朱印；珠子大小错落，最大的一颗正在「星」的竖下面（底座落在地平线上）
    xv = star_g.to_stage((514, 0))[0]
    band_line = rect(X1 - 4, BAND_Y - HAIR / 2, sx - 3, BAND_Y + HAIR / 2)
    band_beads = [(X1 - 4, 3.6), (X1 + 22, 2.2), (X1 + 34, 1.6), (xv - 26, 2.2), (xv, 6.2), (xv + 26, 2.2),
                  (caps_x0 - 16, 2.0), (sx - 3, 3.0)]
    star = {'x': round(float(C[0]), 2), 'y': round(float(C[1]), 2), 's': 19, 'long': 3.3, 'tall': 2.1}

    G = {
        'title': T, 'text': text, 'text_only': text_only, 'hero': hero, 'chars': chars, 'beads': beads,
        'band_in': band_vis, 'ecl_front': ecl_front, 'arm': A, 'C': tuple(C), 'E': tuple(E),
        'ghost': gh, 'italic': it_p, 'caps': caps_p, 'seal': seal,
        'band': {'line': band_line, 'beads': [(x, BAND_Y, r) for x, r in band_beads]},
        'baseline': BAND_Y,
        'tag': {'x': X1 + 2, 'y': 64},                 # 编号小标坐在浑天仪顶起来的那一截左边（低了会碰到天球）
        'star': star,
        'anchors': {'emblem_center': [round(float(E[0]), 2), round(float(E[1]), 2)], 'emblem_radius': R,
                    'sun': [round(float(C[0]), 2), round(float(C[1]), 2)], 'band_y': BAND_Y},
        # 黄道环出了日，顺切线飞进画面（介绍页接到代表画面的圆窗）；线宽 = 发丝，黄铜色，越远越淡
        'geo': {'out': {'x': round(float(p_out[0]), 2), 'y': round(float(p_out[1]), 2),
                        'dx': round(float(d_out[0]), 4), 'dy': round(float(d_out[1]), 4), 'len': 190,
                        'w': HAIR * 0.8, 'cap': 'round', 'rgb': '222,184,120', 'stops': [[0, 0.95], [0.55, 0.6], [1, 0.12]]}},
        'enter': {'geo': {'at': 0.56, 'dur': 0.4}, 'star': {'at': 0.5, 'dur': 0.12}, 'tag': {'at': 0.12, 'dur': 0.26}},
    }
    return G


# ------------------------------------------------------------------ 图层（从后往前）和入场
# at、dur 占整段入场的比例（片头一格 0.8 秒、介绍页 2.4 秒）。故事是“一页木版套色，浑天仪转到对齐”（kind 见 ae.js「02 秋庭观星画室」）：
#   套色——三条霞一条条印上去（馬連推的方向各不相同，色顺着版木的横纹吃进纸里），天球一块色版从上往下印，字的色版从左往右印出来、
#     「星」的朱漆从下往上印；最后一版是主角身后的暮色ぼかし；淡版 STAR GAZING 随后印出；
#   对齐——浑天仪的架子（子午环、极轴、顶珠）、赤道环先被拨了一下、各自转回来停住；「星」印好以后黄道环才转进来，最后停准，
#     出日的两截正好接上「星」日里那一横（片头里星已经在日心等着；介绍页里环一对齐，星就在日心亮起）；
#   落款——黄道环顺着切线飞进画面，底线的黄铜发丝从左往右拉出来，英文印上，朱印最后压下，珠上的高光一闪。


def _emblem_center():
    """入场锚点（球心）：和 geometry() 里算的同一个式子"""
    p = np.array([XH + SUN[0] * SH / 1000, BH - SUN[1] * SH / 1000])
    return [round(float(v), 1) for v in (p - EM.rot((0, ECL[1]), ECL[2]))]


EC = _emblem_center()

LAYERS = [
    Layer('kasumi_1', 'plate', LY.render_kasumi_1, enter={'at': 0.0, 'dur': 0.2, 'kind': 'autumn-print', 'dir': 'right'}),
    Layer('kasumi_2', 'plate', LY.render_kasumi_2, enter={'at': 0.05, 'dur': 0.2, 'kind': 'autumn-print', 'dir': 'left'}),
    Layer('kasumi_3', 'plate', LY.render_kasumi_3, enter={'at': 0.1, 'dur': 0.2, 'kind': 'autumn-print', 'dir': 'right'}),
    Layer('bokashi', 'plate', LY.render_bokashi, enter={'at': 0.2, 'dur': 0.26, 'kind': 'fade'}),
    Layer('ghost', 'ghost', LY.render_ghost, enter={'at': 0.22, 'dur': 0.22, 'kind': 'autumn-print', 'dir': 'right', 'grain': 0.5}),
    Layer('sphere', 'emblem', LY.render_sphere, enter={'at': 0.04, 'dur': 0.2, 'kind': 'autumn-print', 'dir': 'down'}),
    Layer('ecl_ring', 'emblem', LY.render_ecl_ring, enter={'at': 0.22, 'dur': 0.32, 'kind': 'autumn-align', 'angle': -32, 'from': EC}),
    Layer('eq_ring', 'emblem', LY.render_eq_ring, enter={'at': 0.1, 'dur': 0.32, 'kind': 'autumn-align', 'angle': 48, 'from': EC}),
    Layer('cage', 'emblem', LY.render_cage, enter={'at': 0.04, 'dur': 0.3, 'kind': 'autumn-align', 'angle': -34, 'from': EC}),
    Layer('text', 'text', LY.render_text, enter={'at': 0.04, 'dur': 0.2, 'kind': 'autumn-print', 'dir': 'right'}),
    Layer('hero', 'hero', LY.render_hero, enter={'at': 0.1, 'dur': 0.2, 'kind': 'autumn-print', 'dir': 'up', 'sweep': {'at': 0.58, 'dur': 0.3}}),
    Layer('orbit', 'line', LY.render_orbit, enter={'at': 0.22, 'dur': 0.32, 'kind': 'autumn-align', 'angle': -32, 'from': EC}),
    Layer('band', 'line', LY.render_band, enter={'at': 0.44, 'dur': 0.3, 'kind': 'wipe', 'dir': 'right', 'soft': 0.1}),
    Layer('en', 'en', LY.render_en_text, enter={'at': 0.48, 'dur': 0.22, 'kind': 'autumn-print', 'dir': 'right', 'grain': 0.3}),
    Layer('seal', 'en', LY.render_seal, enter={'at': 0.74, 'dur': 0.1, 'kind': 'land', 's': 0.16}),
    Layer('fx', 'glint', LY.render_fx, enter={'at': 0.84, 'dur': 0.16, 'kind': 'flash'}),
]


# ------------------------------------------------------------------ 小形态


def small(tok):
    """一行六个字：刀口和圆珠都留着；签名字「星」是朱漆（中横照常，小了看不清黄道环）"""
    T = LT.letters()
    chars = [g.path() for g in T]
    # 小形态里「星」的中横还原成一道横（和别的横同粗），小了以后环读不出来，横读得出来
    chars[3] = union(chars[3], rect(316, 629 - 18.5, 700, 629 + 18.5))

    def face(C, mask, tone):
        return LY.lacquer_small(C, mask, tone, tok)
    return {'chars': chars, 'hero': 3, 'face': face, 'advance': [1.02] * 6}

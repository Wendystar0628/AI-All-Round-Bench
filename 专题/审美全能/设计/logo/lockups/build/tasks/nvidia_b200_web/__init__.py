"""04 NVIDIA B200 网页艺术 · 题名锁定模块。

  概念单     CONCEPT（下面）
  B200       b200.py（方言「走线 Didone」：Libre Bodoni 粗体的骨架，按布线规矩重画；高潮是第二个 0 字腔里的晶粒）
  中文       strokes.py（走线化的中线）+ letters.py（方言「走线宋」，按中线一支笔重画）
  主体元素   emblem.py（一片晶圆）
  英文       english.py（NVIDIA 帽线小型大写、底线带、丝印位号）
  颜色层     layers.py；图层表 LAYERS 和入场在本文件
出图：python 专题/审美全能/设计/logo/lockups/build/lockup.py nvidia-b200-web（--preview 只看样子）
"""
import math
from lockupkit.geom import union, diff, poly, rect, circle, stroke_line, move
from lockupkit.run import Layer
from . import letters as LT, b200 as BB, emblem as EM, english as EN, layers as LY
from .strokes import STROKES  # noqa: F401  （--strokes 用）

KEY = 'nvidia-b200-web'
TEXT = LT.TEXT
FONT = LT.FONT

CONCEPT = {
    '题名': 'NVIDIA B200 网页艺术', '类别': '创意网页设计',
    '一句话概念': '一块刚曝光蚀刻好的芯片：铜线在墨绿的板子上通了电，光从晶粒沿着走线跑到一颗琥珀信号灯。',
    '气质词': ['精密', '锐利', '通电'], '物件': '一颗晶粒（die）和它所在的晶圆', '动作': '通电：光从晶粒出发，沿基线走线跑到信号灯，再伸进画面',
    '同源媒介': '电路板与光刻：蚀刻的裸铜、布线规则（只走 0°/45°/90°、拐角 45° 斜接）、过孔与焊盘、阻焊层、白色丝印',
    '方言': {'B200': '走线 Didone：Libre Bodoni 粗体的竖轴高对比留着，碗、字腔、肩全换成 45° 直边；粗处是铺铜，发丝是走线（宽 = 一根走线），'
                     '粗到细是一段 45° 渐收（焊盘接走线的泪滴）；发丝衬线的空端头是过孔，2 的球形收笔是带钻孔的焊盘',
             '中文': '走线宋：按走线化的中线一支笔重画；横 = 一根走线宽、竖 = 铺铜宽；撇捺点钩拆成 0°/45°/90° 的直段；'
                     '横末三角、横折的肩都是同一个 45° 小屋脊，竖头左高右低一刀 45°、竖脚右下 45° 切；字距按格子等分'},
    '骨架': '对齐在一张看不见的方格上；B200 帽线、基线是两根走线所在的高度；中文字高约为 B200 的三分之一，脚踩在基线走线上；重心低而稳',
    '母题落点': {'高潮': '第二个 0 的字腔是封闭框，和晶粒（die）同构：里面是一块晶粒的点阵，网点中间细、往外一级级变粗，'
                       '两格琥珀；星芒在晶粒正中；晶粒上下各一根引线接到 0 的发丝上',
               '呼应': 'B200 所有的发丝都是同一根走线，空端头都是过孔（B 的两枚左衬线、2 的竖钩，2 的球形收笔是焊盘）；'
                       '中文的横也是这根走线的宽，撇捺点钩按同样的 45° 规矩拐弯（网的两个㐅拐成一对换道的走线）'},
    '主体元素': '一片晶圆：发丝外缘（浅金）、V 形定位缺口、浅浅的晶粒方格、边缘禁区线；放在 B200 后面偏右，第二个 0 和「网页」压住它的下半，圆顶顶出剪影；不用准线和十字',
    '英文分工': 'B200 当主字；NVIDIA 小型大写拉开字距，坐在 B 帽线上伸出的一小段走线上；底线带 WEB ART · ETCHED IN LIGHT 挂在基线走线下；丝印位号 U1、D1 当最小一档的纹理',
    '颜色角色': {'字面': 'B200 蚀刻裸铜（玫瑰色、横向拉丝、网点蚀刻）；中文冷奶白（丝印油墨）', '主题色': '电路板墨绿：底板（阻焊层）和晶圆',
               '阴影': '墨绿的暗调', '点缀': '琥珀：信号灯为主；晶粒里两格、沿基线走线跑过去的那段光、底板上灯旁边一小片像热图一样晕开的格子为呼应',
               '共用金属': '浅金（ENIG 化金）：过孔、焊盘、晶圆外缘、晶粒封边'},
    '检查': '去色、遮掉晶圆和晶粒只剩字、缩到缩略图、白底黑底',
}

# ------------------------------------------------------------------ 版式（舞台像素；画板左上 = 介绍页上锁定的原点）

ARTBOARD = (1100, 520)
HAIR = 3.2                      # 一根走线的宽（舞台像素）：B200 的发丝、中文的横、所有线
XB, YB, KB = 100.0, 330.0, 0.236  # B200 的原点、基线、字号/1000
B_OFF = [0, 706, 1306, 1938]    # 四个字形的原点（字体单位）
XC, KC, PITCH = 727.0, 0.062, 1060  # 中文：第一个字的原点、字号/1000、步进（字体单位，按格子等分）
V_CN = 108                      # 中文竖的宽（字体单位）
RAIL = YB + 9.0                 # 基线走线（底线带的线）
WAFER = ((706.0, 186.0), 166.0)
LED_X = 994.0


def b200_parts():
    t = HAIR / KB
    via_r = 2.05 * t
    G = BB.build(t, via_r)
    return t, via_r, G


def geometry(tok):
    t, via_r, BG = b200_parts()

    def S(p):
        return p.transform(KB, 0, 0, -KB, 0, 0)

    def at(i, q):
        return (XB + (B_OFF[i] + q[0]) * KB, YB - q[1] * KB)

    hero, vias, glyphs = [], [], []
    for i, (ch, g) in enumerate(BG):
        p = g['body'].transform(KB, 0, 0, -KB, XB + B_OFF[i] * KB, YB)
        pads = [circle(*at(i, v[:2]), v[2] * KB) for v in g['vias']]
        glyphs.append(union([p] + pads))
        hero.append(p)
        for v in g['vias']:
            x, y = at(i, v[:2])
            vias.append({'x': x, 'y': y, 'r': v[2] * KB, 'hole': (v[3] if len(v) > 3 else v[2] * 0.42) * KB})
    # 第二个 0 的字腔 → 晶粒（die）：比字腔小一圈，上下各一根引线接到 0 的发丝
    x0, y0, x1, y1, ci = BG[3][1]['die_box']
    m = 26
    die_f = (x0 + m, y0 + 54, x1 - m, y1 - 54)
    dx0, dy1 = at(3, (die_f[0], die_f[1]))
    dx1, dy0 = at(3, (die_f[2], die_f[3]))
    die = {'box': (dx0, dy0, dx1, dy1)}
    cxd = (dx0 + dx1) / 2
    leads = union(rect(cxd - HAIR / 2, at(3, (0, y1))[1] - 0.5, cxd + HAIR / 2, dy0 + 0.5),
                  rect(cxd - HAIR / 2, dy1 - 0.5, cxd + HAIR / 2, at(3, (0, y0))[1] + 0.5))
    die['leads'] = leads
    die['center'] = (cxd, (dy0 + dy1) / 2)

    # 中文：走线宋，脚踩在基线走线上
    H = HAIR / KC
    T, cn = LT.letters(H, V_CN)
    yc = RAIL - HAIR / 2 - 0.6 + (-70) * KC   # 最低的竖脚（y = -70）落在走线的上沿
    cn_paths = []
    for i, (g, p) in enumerate(zip(T, cn)):
        g.place(XC + i * PITCH * KC, yc, 1000 * KC)
        cn_paths.append(g.stage(p))
    text_cn = union(cn_paths)
    hero_b = union(glyphs)

    # 线：B 的两枚左衬线过孔各拉出一根走线——上面那根托着 NVIDIA，下面那根是基线走线，一路走到信号灯
    vt = vias[0]
    vb = vias[1]
    top_y = vt['y'] - 10.0
    nv_x = vt['x'] + 22.0
    nv_base = top_y - HAIR / 2 - 3.2
    nv, nv_w = EN.nvidia(nv_x, nv_base)
    top_end = nv_x + nv_w + 16.0
    top_rail = stroke_line([(vt['x'], vt['y']), (vt['x'] + 10.0, top_y), (top_end, top_y)], HAIR, cap='butt', join='miter')
    rail_pts = [(vb['x'], vb['y']), (vb['x'] + (RAIL - vb['y']), RAIL), (LED_X, RAIL)]
    bot_rail = stroke_line(rail_pts, HAIR, cap='butt', join='miter')
    # 第二个 0 的底接到基线走线：一小段竖线 + 交点一枚过孔
    jx = cxd
    stub = rect(jx - HAIR / 2, YB - 1.0, jx + HAIR / 2, RAIL)
    rail_vias = [{'x': top_end, 'y': top_y, 'r': via_r * KB * 0.82, 'hole': via_r * KB * 0.34},
                 {'x': jx, 'y': RAIL, 'r': via_r * KB * 0.82, 'hole': via_r * KB * 0.34}]
    lines = union(top_rail, bot_rail, stub)
    # 底线带：挂在基线走线下面，从 B 的主竖下起
    bx = XB + 112 * KB
    band_base = RAIL + 18.0
    band, band_w = EN.band(bx, band_base)
    # 丝印位号
    u1, _ = EN.refdes('U1', XB + (B_OFF[3] + 610) * KB, YB - 640 * KB)
    d1, _ = EN.refdes('D1', LED_X + 1.0, RAIL - 9.0)
    led = {'x0': LED_X, 'x1': LED_X + 15.0, 'y': RAIL, 'h': 7.4}

    E = EM.wafer(*WAFER, hair=HAIR * 0.72, cell=15.0)
    star = die['center']
    # 入场要的几样：晶粒点阵的格子（逐格通电）、丝印刮板走过的高度
    enter_info = {'cells': {'box': [round(v, 2) for v in (die['box'][0] + 3, die['box'][1] + 3, die['box'][2] - 3, die['box'][3] - 3)],
                            'cols': 5, 'rows': int((die['box'][3] - die['box'][1] - 6) / ((die['box'][2] - die['box'][0] - 6) / 5))},
                  'print': [round(min(nv.bounds[1], text_cn.bounds[1]) - 3, 1), round(max(band.bounds[3], text_cn.bounds[3], d1.bounds[3]) + 3, 1)]}
    G = {
        'title': T, 'text': union(text_cn, hero_b), 'cn': text_cn,
        'hero': hero_b, 'hero_body': union(hero), 'vias': vias, 'rail_vias': rail_vias, 'die': die,
        'lines': lines, 'top_rail_y': top_y, 'junction': (jx, RAIL),
        'nvidia': nv, 'band': band, 'refdes': union(u1, d1), 'led': led,
        'wafer': E, 'wafer_text': EN.wafer_ring(WAFER[0], WAFER[1] - 19.0), 'hair': HAIR, 'b_box': hero_b.bounds,
        'baseline': band_base,
        'tag': {'x': 104, 'y': 88},
        'star': {'x': round(star[0], 2), 'y': round(star[1], 2), 's': 9.0, 'long': 2.7, 'tall': 2.3, 'a': 0.95},
        'anchors': {'die': [round(star[0], 2), round(star[1], 2)], 'wafer_center': list(WAFER[0]), 'wafer_radius': WAFER[1],
                    'led': [led['x1'], RAIL], 'rail_y': RAIL},
        # 伸进画面的那一根：基线走线过了信号灯继续往外，45° 拐下去再平着走（布线的拐法），接到代表画面里封装左沿的焊盘
        'geo': {'out': {'x': led['x1'] + 1.0, 'y': RAIL, 'dx': 0.7071, 'dy': 0.7071, 'len': 150, 'route': 'elbow', 'lead': 150,
                        'overshoot': False, 'w': HAIR, 'cap': 'butt', 'rgb': '232,166,112',
                        'stops': [[0, 0.95], [0.6, 0.7], [1, 0.25]]}},
        'enter': {'geo': {'at': 0.82, 'dur': 0.18}, 'star': {'at': 0.54, 'dur': 0.14}, 'tag': {'at': 0.04, 'dur': 0.22}},
        'plate': {'blobs': [(575, 252, 505, 126, 1.0), (330, 256, 280, 124, 0.9), (985, 300, 90, 62, 0.9)]},
    }
    # 入场里要用到几何的几样，写进图层表的 enter（清单里每层一份）
    bx0, by0, bx1, by1 = hero_b.bounds
    HERO_IN.update(box=[round(bx0 - 14, 1), round(by0 - 12, 1), round(bx1 + 14, 1), round(by1 + 10, 1)],
                   ramp_y=[round(by0 + 6, 1), round(by1 - 2, 1)], ramp=LY.COPPER_RAMP)
    CELLS_IN.update(enter_info['cells'], center=[round(star[0], 2), round(star[1], 2)])
    for e in (TEXT_IN, EN_IN):
        e['span'] = enter_info['print']
    PULSE_IN['path'] = [[round(jx, 2), round(die['box'][3], 2)], [round(jx, 2), RAIL], [LED_X, RAIL]]
    PLATE_IN['from'] = [round(star[0], 1), round(star[1], 1)]
    return G


# ------------------------------------------------------------------ 图层（从后往前）和入场
# 入场按一块板子的制程走，最后通电（at、dur 占整段：介绍页 2.4 秒、片头一格 0.8 秒）：
#   1. 板子：墨绿的阻焊层从晶粒那一点化开；晶圆同时转进来、缺口对准。
#   2. 曝光、蚀刻：B200 先是一整块覆铜（和字面同一条铜色带，字藏在里面，只看得出过孔和字边），像曝光一样由暗到亮、亮过一点落回；
#      然后字外的铜被一片片蚀刻掉，贴着字边的最后才没，剩下 B200。走线从过孔往右布出去；第二个 0 的字腔里，晶粒先是一块没通电的暗硅片。
#   3. 丝印：一把刮板从上往下走一遍，白油墨的 NVIDIA、网页艺术、底线带、位号一起印上（0.36 前印完，中文读得清）。
#   4. 通电：晶粒的点阵从正中一格格亮起，星芒在正中一闪；一个光点从晶粒下来、沿基线走线越跑越快到信号灯，灯亮、铜面闪点，
#      线从灯伸进画面。铜面上那道光在蚀刻完以后扫过一次。
# 带几何的参数（覆铜的范围和铜色带、点阵格子、刮板走的高度、光走的路、化开的中心）由 geometry() 填进下面这几份 enter。

PLATE_IN = {'at': 0.0, 'dur': 0.24, 'kind': 'grow', 'soft': 0.4}
HERO_IN = {'at': 0.06, 'dur': 0.28, 'kind': 'nvidia-etch', 'show': 0.2, 'sweep': {'at': 0.38, 'dur': 0.28}}
CELLS_IN = {'at': 0.42, 'dur': 0.13, 'kind': 'nvidia-boot', 'jitter': 0.3}
TEXT_IN = {'at': 0.22, 'dur': 0.15, 'kind': 'nvidia-print', 'soft': 6}
EN_IN = dict(TEXT_IN)
PULSE_IN = {'at': 0.58, 'dur': 0.18, 'kind': 'nvidia-pulse'}

LAYERS = [
    Layer('plate', 'plate', LY.render_plate, enter=PLATE_IN),
    Layer('wafer', 'emblem', LY.render_wafer, enter={'at': 0.04, 'dur': 0.32, 'kind': 'turn', 'from': list(WAFER[0]), 'angle': -28}),
    Layer('lines', 'line', LY.render_lines, enter={'at': 0.2, 'dur': 0.2, 'kind': 'wipe', 'dir': 'right', 'soft': 0.08}),
    Layer('hero', 'hero', LY.render_hero, enter=HERO_IN),
    Layer('die', 'emblem', lambda C, G, tok: LY.render_die(C, G, tok, part='base'), enter={'at': 0.3, 'dur': 0.08, 'kind': 'ignite', 'dark': 0.1}),
    Layer('cells', 'emblem', lambda C, G, tok: LY.render_die(C, G, tok, part='cells'), enter=CELLS_IN),
    Layer('text', 'text', LY.render_text, enter=TEXT_IN),
    Layer('en', 'en', LY.render_en, enter=EN_IN),
    Layer('signal', 'glint', LY.render_signal, enter=PULSE_IN),
    Layer('led', 'glint', LY.render_led, enter={'at': 0.75, 'dur': 0.08, 'kind': 'ignite', 'dark': 0.0}),
    Layer('fx', 'glint', LY.render_fx, enter={'at': 0.80, 'dur': 0.16, 'kind': 'flash'}),
]


# ------------------------------------------------------------------ 小形态


def small(tok):
    """一行：B200（走线 Didone，铜）+ 网页艺术（走线宋）。字小，过孔、晶粒这些细节不要；B200 是签名字"""
    t = 26.0
    BG = BB.build(t, 0)
    x = 0.0
    parts = []
    for i, (ch, g) in enumerate(BG):
        parts.append(move(g['body'], x, 0))
        x += BB.ADV[ch]
    b = union(parts)
    T, cn = LT.letters(60, 116)
    chars = [b] + cn
    adv = [x / 1000 + 0.16] + [1.04] * 4

    def face(C, mask, tone):
        return LY.copper_small(C, mask, tone)
    return {'chars': chars, 'hero': 0, 'face': face, 'advance': adv}

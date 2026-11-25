"""06 鹈鹕的二十二种画法 · 题名锁定模块。

  概念单     CONCEPT（下面）
  笔画标注   strokes.py
  剪纸条     paper.py（本题自己的构造：每一笔裁成一条纸、直刀、刀口、手贴）
  笔画处理   letters.py（方言「剪纸条宋」、鸟眼呼应、「鹕」的红纸喉囊）
  主体元素   emblem.py（黑卡纸的蘸水笔尖，和它画出的贝塞尔路径、锚点、手柄）
  英文       english.py（红纸条贴的 XXII、沿路径排的斜体）
  颜色层     layers.py（每层一个 render；纸条一条条贴、一条条投影）；图层表 LAYERS 和入场在本文件
出图：python 专题/审美全能/设计/logo/lockups/build/lockup.py pelican-22-styles
"""
import math
import numpy as np
from lockupkit.geom import union, poly, rect, circle
from lockupkit.run import Layer
from . import letters as LT, emblem as EM, english as EN, layers as LY, paper as P
from .strokes import STROKES  # noqa: F401  （--strokes 用）

KEY = 'pelican-22-styles'
TEXT = LT.TEXT
FONT = LT.FONT

CONCEPT = {
    '题名': '鹈鹕的二十二种画法', '类别': 'SVG 动画',
    '一句话概念': '一只骑单车的鹈鹕，被剪纸动画剪成二十二种样子；它脚下的路，是一枚蘸水笔尖用贝塞尔曲线画出来的。',
    '气质词': ['俏皮', '手作', '跳跃'], '物件': '一枚蘸水笔尖（和它拉出的贝塞尔曲线）', '动作': '剪、贴、一路往右蹦',
    '同源媒介': '1950–60 年代剪纸动画的片头和报纸拼贴：剪刀剪的黑卡纸、剪纸红、撕下来的新闻纸；SVG 的路径、锚点、手柄',
    '方言': '剪纸条宋：每一笔是一条单独剪下来的纸条（交叉处一条压一条，丁字处盖上去一截）；曲线剪成几刀直边，长边分几刀、刀间一个小折角；'
           '竖的圆字脚一刀斜剪（全组同一个方向）；发丝横加厚到剪得出来（横竖 1:2.7）；每条一道锐边小落影、朝光的剪口一线亮；手贴的一点歪斜',
    '骨架': '主字「鹈鹕」放大，「的」缩小下沉、歪得最厉害；字一高一低、一左一右交替倾斜（±3°），有规律地跳；字距紧；'
           'XXII 四个字母也跟着跳；整块是一条往右的横向长条，XXII 顶出上沿',
    '母题落点': {'高潮': '「鹕」里「鸟」的竖折折钩：鸟字底下那一横就是下喙，竖折折钩兜回来的钩正好是兜在下喙下面的喉囊——下半截剪成一块红纸喉囊，'
                       '往下多坠一点、钩尖探到下喙尖下面，喉囊下沿垫一片深一档的红；全件唯一的星在「鹕」的眼珠上',
               '呼应': '两个「鸟」里的点就是鸟的眼睛，都剪成打孔的圆眼（纸白的圆、黑眼珠）；XXII 的 X 本来就是两条交叉的纸条'},
    '主体元素': '一枚黑卡纸剪的蘸水笔尖（心形透气孔、笔缝、肩口剪穿，受光的半边灰一档、一线纸白的亮，笔身压着 PELICAN · No 22），'
             '站在「法」后面，笔尖落在基线上；放法是连接件：它画出的贝塞尔墨线从「鹈」脚下起笔、托着英文一路起伏到笔尖，'
             '笔尖是这根路径的当前锚点，朝下的那根手柄就是伸进画面的线，接到代表画面里那条路的起笔',
    '英文分工': 'XXII 红纸条贴的 Didone 罗马数字当主字（粗细两条纸交叉、衬线是压上去的细纸条）；「二十二种」竖排在两个 I 之间的白纸条上（空隙小字）；'
             'one pelican, twenty-two ways 用 Didone 斜体沿贝塞尔路径排（SVG 的 textPath），当底线带',
    '颜色角色': {'字面': '黑卡纸（暖黑，每条深浅差一点）', '主题色': '新闻纸（撕下来的一块，栏线、铅字行、网点）', '阴影': '纸的暗调（暖褐），不用纯黑',
               '高光': '朝光一侧的剪口一线亮、眼珠上的星', '点缀': '剪纸红：XXII 为主，「鹕」的喉囊为呼应；红网点从喉囊往周围的黑纸上、从 XXII 往新闻纸上像纹理一样洇开，'
               '路径的锚点和手柄、几片剪下来的红纸屑也是这一种红', '共用金属': '不用（本题不用任何金属，见特质与配色）'},
    '检查': '去色、遮掉笔尖和 XXII 只剩中文、缩到缩略图、白底黑底',
}

# ------------------------------------------------------------------ 版式（舞台像素；画板左上 = 介绍页上锁定的原点）

ARTBOARD = (1520, 540)
# 中文每个字：(原点 x, 基线, 字号, 歪斜°)。顺时针为正；一左一右、一高一低
LAYOUT = {
    '鹈': (104, 344, 172, -3.0),
    '鹕': (262, 326, 172, 3.0),
    '的': (424, 376, 86, -9.0),
    '画': (1036, 346, 156, -3.0),
    '法': (1182, 328, 156, 3.5),
}
XXII = dict(x0=518, base=374, H=228, col=52)       # XXII：左边、基线、字高、两个 I 之间留给「二十二种」的宽
COL = dict(size=40, gap=5, tilt=4.0)              # 「二十二种」
# 笔尖画出的贝塞尔曲线（舞台坐标）：起笔在「鹈」脚下，经「鹕」下（托着斜体）、XXII 下，落到「法」后面的笔尖
TIP = (1348, 404)
NIB_DEG = 28.0
CURVE = [(114, 402),
         ((230, 414), (350, 420), (478, 414)),
         ((610, 407), (800, 391), (936, 397)),
         ((1080, 404), (1238, 420), TIP)]
EN_LINE = dict(text='one pelican, twenty-two ways', size=25, s0=26, rise=6.5, tracking=0.012)


def placer(x0, base, size, deg, c=(500, 390)):
    """字体单位 → 舞台：字号 size、绕字心 c 顺时针转 deg、原点 (x0, 基线)"""
    k = size / 1000.0
    t = math.radians(deg)
    co, si = math.cos(t), math.sin(t)
    a, cc, b, d = k * co, k * si, k * si, -k * co
    e = x0 + k * c[0] - k * co * c[0] - k * si * c[1]
    f = base - k * c[1] - k * si * c[0] + k * co * c[1]

    def path(p):
        return p.transform(a, b, cc, d, e, f)

    def point(q):
        return (a * q[0] + cc * q[1] + e, b * q[0] + d * q[1] + f)
    return path, point, k


def _col_layout(cx, cy, n, size, gap):
    """竖排 n 个字：每个字的 (原点 x, 基线)"""
    total = n * size + (n - 1) * gap
    top = cy - total / 2
    out = []
    for i in range(n):
        mid = top + size / 2 + i * (size + gap)
        out.append((cx - size / 2, mid + 0.38 * size))
    return out, top, top + total


def geometry(tok, detail='full'):
    T, strips, anchors = LT.letters(detail)
    # ---- XXII
    xs, boxes, col_x = EN.xxii(XXII['x0'], XXII['base'], XXII['H'], XXII['col'])
    col_cy = XXII['base'] - XXII['H'] / 2 + 2
    col_pos, col_top, col_bot = _col_layout(col_x, col_cy, 4, COL['size'], COL['gap'])
    # ---- 中文：每个字排上去
    chars = []
    places = {}
    ci = 0
    for gi, g in enumerate(T):
        if g.ch in LAYOUT and g.label == g.ch and g.ch not in ('二', '十', '种'):
            x0, b, sz, deg = LAYOUT[g.ch]
            part = g.ch
        else:
            x0, b = col_pos[ci]
            sz, deg = COL['size'], COL['tilt'] * (1 if ci % 2 == 0 else -1)
            ci += 1
            part = 'slip'
        tp, pt, k = placer(x0, b, sz, deg)
        places[gi] = (tp, pt, k)
        jaw = False
        for s in strips[gi]:
            jaw = jaw or s['id'].endswith('.pouch')          # 「鹕」的下颌：喉囊、褶和压在上面的下喙（横），一起贴
            chars.append({'path': tp(s['path']), 'kind': s['kind'], 'id': s['id'], 'g': gi, 'small': sz < 60,
                          'part': 'jaw' if jaw else part})
    text = union([c['path'] for c in chars])
    hair = min((28 + 2 * LT.THICK) * places[gi][2] for gi in places)      # 本题字的最细笔画（加厚后的横，舞台像素）
    # 白纸条：垫在「二十二种」下面
    slip = poly([(col_x - 27, col_top - 13), (col_x + 26, col_top - 15), (col_x + 28, col_bot + 13), (col_x - 25, col_bot + 15)])
    slip_item = {'path': slip, 'kind': 'slip', 'small': True, 'part': 'slip'}
    LY.jitter([slip_item] + chars, 6)          # 每条纸的深浅差按整件贴的顺序定（拆层以后颜色不变）
    # 星：「鹕」的眼珠上那点光
    gi_e, q = anchors['鹕.eye']
    star = places[gi_e][1](q)
    gi_p, q = anchors['pouch']
    pouch_c = places[gi_p][1](q)
    # ---- 主体元素：笔尖 + 路径
    nib = EM.nib(TIP, NIB_DEG)
    pts = EN.bezier_pts(CURVE, 60)
    en_path, en_end = EN.text_on_path(paths_italic(), EN_LINE['text'], EN_LINE['size'], pts, EN_LINE['s0'],
                                      tracking=EN_LINE['tracking'], loc={'wght': 500}, rise=EN_LINE['rise'])
    # 锚点：起笔（空心）、XXII 下（选中：实心、带一对手柄）、笔尖（空心，手柄一根朝来路、一根朝下伸进画面）
    A2 = CURVE[2][2]
    h_in, h_out = CURVE[2][1], CURVE[3][0]
    out_dir = np.array([-0.22, 0.975])
    out_dir = out_dir / np.linalg.norm(out_dir)
    tip_in = CURVE[3][1]
    tip_out = (TIP[0] + out_dir[0] * 64, TIP[1] + out_dir[1] * 64)
    # 锚点分三组，钢笔经过哪一个它就出现在哪儿：起笔、XXII 下选中的那一个（带一对手柄）、笔尖（手柄一根朝来路、一根朝下）
    ui = {'w': max(1.1, hair * 0.62), 'r': 3.4, 'sq': 8.5,
          'groups': {'start': {'anchors': [CURVE[0]], 'handles': []},
                     'mid': {'selected': A2, 'handles': [(A2, _toward(A2, h_in, 70)), (A2, _toward(A2, h_out, 70))]},
                     'tip': {'anchors': [TIP], 'handles': [(TIP, _toward(TIP, tip_in, 58)), (TIP, tip_out)]}}}
    # ---- 红纸屑（剪 XXII 剩下的边角）
    rng = np.random.default_rng(22)
    snips = []
    for (x, y, s, a) in ((506, 392, 9, 20), (700, 404, 7, -35), (842, 120, 8, 60), (590, 126, 6, -10), (1012, 392, 8, 110), (968, 132, 6, 75),
                         (1250, 452, 6, 30), (440, 404, 5, -60)):
        tri = [(x + s * math.cos(math.radians(a + d)) * f_, y + s * math.sin(math.radians(a + d)) * f_) for d, f_ in ((0, 1.0), (130, 0.55), (215, 0.8))]
        snips.append(poly(tri))
    # XXII 一个字母一层、纸屑一层；深浅差仍按整组贴的顺序定
    xxii_items = [{'path': p, 'kind': tone, 'letter': nm.split('.')[0]} for p, tone, nm in xs]
    snip_items = [{'path': p, 'kind': 'red', 'small': True} for p in snips]
    LY.jitter(xxii_items + snip_items, 22)
    baseline = float(at_x(pts, 300)[1])
    G = {
        'title': T, 'text': text, 'chars': chars, 'slip_item': slip_item, 'hair': hair, 'xxii': xs, 'xxii_items': xxii_items,
        'snip_items': snip_items, 'curve': pts, 'en': en_path, 'nib': nib, 'ui': ui, 'pouch_c': pouch_c,
        'baseline': baseline,
        'tag': {'x': 106, 'y': 108},
        'star': {'x': round(star[0], 2), 'y': round(star[1], 2), 's': 6.5, 'long': 2.4, 'tall': 1.7, 'a': 0.95},
        'anchors': {'nib_tip': list(TIP), 'pouch': [round(pouch_c[0], 1), round(pouch_c[1], 1)], 'curve_start': list(CURVE[0]),
                    'xxii': [round(boxes[0][0], 1), round(min(b[1] for b in boxes), 1), round(boxes[-1][2], 1), round(max(b[3] for b in boxes), 1)]},
        # 伸进画面的那一根：笔尖这一锚点朝下的那根手柄方向，墨线一路画下去，接到代表画面里那条路的起笔（swing：先顺着手柄下去，再兜过去落到起笔上）
        'geo': {'out': {'x': TIP[0], 'y': TIP[1], 'dx': round(float(out_dir[0]), 3), 'dy': round(float(out_dir[1]), 3), 'len': 160,
                        'route': 'swing', 'lead': 30, 'overshoot': False, 'tail': False, 'w': round(hair * 1.25, 2), 'cap': 'round',
                        'rgb': '36,32,28', 'stops': [[0, 0.95], [0.75, 0.9], [1, 0.75]]}},
        'enter': {'geo': {'at': OUT_AT, 'dur': 0.2}, 'star': {'at': 0.86, 'dur': 0.14}, 'tag': {'at': 0.04, 'dur': 0.22}},
    }
    return G


def paths_italic():
    from lockupkit import paths
    return paths.DIDONE_I


def _toward(a, b, L):
    a, b = np.array(a, float), np.array(b, float)
    d = b - a
    return tuple(a + d / np.linalg.norm(d) * L)


def at_x(pts, x):
    i = int(np.argmin(np.abs(pts[:, 0] - x)))
    return pts[i]


# ------------------------------------------------------------------ 图层（从后往前）和入场
# 入场讲的是“剪、贴，再用钢笔画一笔”（at、dur 占整段：介绍页 2.4 秒、片头一格 0.8 秒）：
#   1. 贴：新闻纸先拍下去；纸条按读的顺序一张张从左上方贴下来（一路往右蹦），每张先悬着、身下一团软影，按下去影子收紧成锐边小落影；
#      一顿一顿地走（剪纸动画是定格拍的），每张按自己最后的歪斜多歪一点再摆正。0.35 前九个字都贴好。
#   2. 「鹕」的下颌（喉囊、褶、压在上面的下喙）单独晚一拍、重一点地拍上去：母题的高潮。
#   3. 画：笔尖落在起笔上，顺着贝塞尔路径一路滑到「法」后面（矢量是顺的，不一顿一顿），墨线和沿线的斜体紧跟在笔尖后面；
#      笔尖经过哪个锚点，那个锚点就出现、手柄拉出来。
#   4. 笔尖朝下那根手柄的墨线画进画面；最后「鹕」的眼珠上星一闪。


def _sway_inv(y):
    """sway 缓动（cubic-bezier(.65,0,.35,1)）的反函数：走到 y 那一刻的线性进度"""
    def bz(t, a, b):
        return 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t * t * b + t ** 3
    lo, hi = 0.0, 1.0
    for _ in range(40):
        t = (lo + hi) / 2
        if bz(t, 0, 1) < y:
            lo = t
        else:
            hi = t
    t = (lo + hi) / 2
    return bz(t, 0.65, 0.35)


def _pen_path(n=48):
    """钢笔走的路：贝塞尔路径按弧长等分的 n 个点；和 A2 在路上走到哪儿（弧长占比）"""
    pts = EN.bezier_pts(CURVE, 60)
    L = EN.arclen(pts)
    out = []
    for i in range(n):
        p, _ = EN.at_len(pts, L, L[-1] * i / (n - 1))
        out.append([round(float(p[0]), 1), round(float(p[1]), 1)])
    i2 = int(np.argmin(((pts - np.array(CURVE[2][2])) ** 2).sum(1)))
    return out, float(L[i2] / L[-1])


PEN, _S_A2 = _pen_path()
NIB_AT, NIB_DUR, PLACE = 0.37, 0.35, 0.06          # 笔尖：先落在起笔上（PLACE），再滑过去
GLIDE_AT, GLIDE_DUR = NIB_AT + PLACE, NIB_DUR - PLACE
U_A2 = GLIDE_AT + GLIDE_DUR * _sway_inv(_S_A2)     # 笔尖经过 XXII 下那个锚点的时刻
OUT_AT = GLIDE_AT + GLIDE_DUR + 0.05


def paste(at, rot, dx=-14, dy=-22, s=0.08, dur=0.11, n=4, lift=1.0):
    """贴一张纸：从左上方悬着进来（多歪 rot 度、大一点、身下一团软影），一顿一顿地按下去"""
    return {'at': round(at, 3), 'dur': dur, 'kind': 'pelican-paste', 'dx': dx, 'dy': dy, 'rot': rot, 's': s, 'n': n, 'lift': lift}


def ink(lag, soft):
    """跟着笔尖显出来：边缘落在笔尖身后 lag 处，软边 soft（都是锁定像素）"""
    return {'at': round(GLIDE_AT, 3), 'dur': round(GLIDE_DUR, 3), 'kind': 'pelican-ink', 'path': PEN, 'lag': lag, 'soft': soft}


def anchor(at, p, dur=0.08):
    return {'at': round(at, 3), 'dur': dur, 'kind': 'grow', 'from': [round(p[0], 1), round(p[1], 1)], 'soft': 0.12}


def _part(name):
    return lambda C, G, tok: LY.render_text(C, G, tok, part=name)


def _letter(name):
    return lambda C, G, tok: LY.render_xxii(C, G, tok, letter=name)


def _ui(name):
    return lambda C, G, tok: LY.render_ui(C, G, tok, group=name)


LAYERS = [
    Layer('plate', 'plate', LY.render_plate, enter=paste(0.0, -1.2, dx=-4, dy=-9, s=0.022, dur=0.15, n=3, lift=0.6)),
    Layer('curve', 'line', LY.render_curve, enter=ink(0, 4)),
    Layer('nib', 'emblem', LY.render_nib, enter={'at': NIB_AT, 'dur': NIB_DUR, 'kind': 'pelican-nib', 'path': PEN, 'tip': list(TIP),
                                                 'place': round(PLACE / NIB_DUR, 3)}),
    # XXII：红纸条，比字大，悬得高一点
    Layer('x1', 'hero', _letter('X0'), enter=paste(0.11, -5, dy=-30, s=0.06)),
    Layer('x2', 'hero', _letter('X1'), enter=paste(0.135, 5, dy=-30, s=0.06)),
    Layer('i1', 'hero', _letter('I2'), enter=paste(0.16, -5, dy=-30, s=0.06)),
    Layer('i2', 'hero', _letter('I3'), enter=paste(0.19, 5, dy=-30, s=0.06)),
    Layer('snips', 'hero', LY.render_snips, enter=paste(0.2, 0, dx=-6, dy=-12, s=0.0, dur=0.12, n=3, lift=0.4)),
    # 中文：一左一右地歪，进来时往自己那边多歪一点
    Layer('slip', 'text', _part('slip'), enter=paste(0.175, 6)),
    Layer('ti', 'text', _part('鹈'), enter=paste(0.05, -6)),
    Layer('hu', 'text', _part('鹕'), enter=paste(0.075, 6)),
    Layer('jaw', 'text', _part('jaw'), enter=paste(0.30, 9, dx=-6, dy=-34, s=0.12, dur=0.1)),
    Layer('de', 'text', _part('的'), enter=paste(0.10, -9, dy=-18)),
    Layer('hua', 'text', _part('画'), enter=paste(0.21, -6)),
    Layer('fa', 'text', _part('法'), enter=paste(0.235, 6)),
    Layer('en', 'en', LY.render_en, enter=ink(16, 18)),
    Layer('ui-start', 'line', _ui('start'), enter=anchor(GLIDE_AT, CURVE[0], 0.06)),
    Layer('ui-mid', 'line', _ui('mid'), enter=anchor(U_A2 - 0.01, CURVE[2][2])),
    Layer('ui-tip', 'line', _ui('tip'), enter=anchor(GLIDE_AT + GLIDE_DUR - 0.01, TIP)),
]


# ------------------------------------------------------------------ 小形态


def small(tok):
    """一行九个字：剪纸条的字形（直刀、刀口、加宽、手贴都在），眼睛和喉囊并进字里（小了只看形）"""
    T, strips, _ = LT.letters('small')
    chars = []
    for gs in strips:
        chars.append(union([s['path'] for s in gs if s['kind'] != 'white']))
    return {'chars': chars, 'hero': None, 'face': None}

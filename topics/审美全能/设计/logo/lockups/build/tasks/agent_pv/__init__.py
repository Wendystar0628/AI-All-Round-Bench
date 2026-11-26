"""01 现代Agent概念PV · 题名锁定模块。

  概念单     CONCEPT（下面）
  笔画标注   strokes.py
  笔画处理   letters.py（方言「光标宋」：方点、方脚；高潮「代」的点是光标）
  主体元素   emblem.py（刚按下去的回车键）
  英文       english.py（Agent、PV、六章章名的底线带、键帽字）
  颜色层     layers.py；图层表 LAYERS 和入场在本文件
出图：python topics/审美全能/设计/logo/lockups/build/lockup.py agent-pv（--preview 只看样子）
"""
from lockupkit.geom import union, glyph, rect
from lockupkit.run import Layer
from lockupkit import paths
from . import letters as LT, english as EN, emblem as EM, layers as LY
from .strokes import STROKES  # noqa: F401  （--strokes 用）

KEY = 'agent-pv'
TEXT = LT.TEXT
FONT = LT.FONT

CONCEPT = {
    '题名': '现代Agent概念PV', '类别': '动效设计（一支六章二十四镜的概念 PV：一行指令交给 Agent，读、拆、派给五位 AI、昼夜不停，直到交付）',
    '一句话概念': '回车落下的那一刻：这一行指令锁定，「代」上那一点亮成光标——替人去做的 Agent 就从这一点醒来。',
    '气质词': ['理性', '高效', '精确'], '物件': '一块闪烁的方块光标（全片贯穿的那一个）', '动作': '回车：锁定、醒来、往前写',
    '同源媒介': 'Agent 的命令行：亮底的屏上一块自发光的方块光标、背光的回车键、等宽的字格、输入框的下沿、从回车那一刻起走动的运行读数',
    '方言': '光标宋：思源宋体 Heavy 的高反差骨架、横末三角、撇捺钩的弧照宋体留着（人写的那一面不动）；所有的点换成立着的方块，'
            '收笔朝下的竖斜脚补成平底的方脚（精确）',
    '骨架': '两行，都从行首起（终端里的行）：第一行「现代▮Agent」坐在输入框的下沿上，第二行「概念PV」停在 g 的下行左边，'
            '回车键接在第二行末尾；Agent 比汉字大一档，A 的尖顶出整块剪影',
    '母题落点': {'高潮': '「代」——代理、代劳，替人去做——弋上那一点和光标同构：一个自由的小块。换成一块立着的光标，'
                       '比别的方点大一号，是全件唯一亮着的那一块，正落在「现代」和 Agent 交界处（光标成了 Agent 的焦点）；星落在它右上角',
               '呼应': '其余的点（概的木、皀，念的今、心）都是立着的方块，不亮：同一种光标，还没轮到它们'},
    '主体元素': '刚按下去的回车键：暖白的键帽、半透的布丁裙，顶面印着按本套笔画画的 ⏎（粗竖、发丝横、宋体横末那样的三角）和 RETURN，'
            '背光从裙边漏出来（和光标、Agent 同一种光）。接在第二行末尾：整行敲完、按下回车',
    '英文分工': 'Agent 当主字（题名里的拉丁字母，Bodoni 700，签名词）；PV 和汉字同一档；底线带是全片六章的英文章名，'
            '章间一块小方块；键帽上印 RETURN（Courier Prime，键帽本来的字）',
    '颜色角色': {'字面': '藏青（ink），朝光标一侧的边被它的蓝照着，带一层很淡的扫描线', '主题色': '浅灰蓝（world，底板：一块屏，隐着等宽的字格）',
               '阴影': '浅灰蓝往深藏青（worldDeep）压一档', '高光': '暖白（light：键帽、荧光的芯子）',
               '点缀': '电光蓝（lit）：光标为主——实心、芯子发白、一圈余辉；Agent 的荧光、回车键的透光箭头和背光为呼应（同一种料：屏上自发的光）',
               '共用金属': '不用金属：这一题共用的料是屏上的光'},
    '检查': '去色、遮掉回车键和英文只剩字（光标是「代」的点，留在字里）、缩到缩略图、白底黑底',
}

# ------------------------------------------------------------------ 版式（舞台像素；画板左上 = 介绍页上锁定的原点）

ARTBOARD = (1100, 520)
S1, B1, X1 = 118, 240, 104          # 第一段汉字「现代」：字号、基线、第一个字的原点
SA = 200                            # Agent 的字号
GAP_A = 10                          # 「代」和 A 之间（约 0.08em）
S2, B2 = 110, 382                   # 第二段「概念」：和第一段一样从左边起（终端里每一行都从行首起）
SP = 104                            # PV 的字号（大写比汉字矮一点）
GAP_P = 10
CAP = (660, 290, 204, 94)           # 回车键：左、上、宽、高（第二段末尾、g 的右边）
BAND_BASE = 422                     # 底线带的基线（收底的那条线；介绍页把它对到 y 422）


def hair():
    """本题字的最细笔画（舞台像素）：第二段汉字的横"""
    return LT.HAIR * S2 / 1000


def _right(ch, x0, size):
    """一个汉字排在 x0、字号 size 时，字形的右边（舞台 x）"""
    return x0 + glyph(LT.FONT, ch)[0].bounds[2] * size / 1000


def layout():
    """版式里各处的位置（舞台坐标）：几何和入场（图层表里的 cols、from、to）都从这里取"""
    o = {'xd': X1 + 0.98 * S1, 'x2b': X1 + 0.98 * S2}
    o['xa'] = o['xd'] + S1 + GAP_A + 3
    o['agent'], o['aspans'], o['xa_end'] = EN.word('Agent', SA, o['xa'], B1)
    o['xp'] = o['x2b'] + S2 + GAP_P
    o['pv'], o['pspans'], o['xp_end'] = EN.word('PV', SP, o['xp'], B2, kern={'PV': -0.04})
    cx, cy, cw, ch = LT.DOTS['代5']
    o['cursor_c'] = (o['xd'] + cx * S1 / 1000, B1 - cy * S1 / 1000)
    o['cursor_tr'] = (o['xd'] + (cx + cw / 2) * S1 / 1000, B1 - (cy + ch / 2) * S1 / 1000)
    o['right_xian'], o['right_dai'] = _right('现', X1, S1), _right('代', o['xd'], S1)
    o['right_gai'], o['right_nian'] = _right('概', X1, S2), _right('念', o['x2b'], S2)
    o['field_y'] = B1 + 27
    o['band'] = EN.band(X1 + 2, BAND_BASE)
    return o


LAY = layout()


def geometry(tok):
    T = LT.letters(cursor=False)
    T['现'].place(X1, B1, S1)
    T['代'].place(LAY['xd'], B1, S1)
    agent, aspans, xa_end = LAY['agent'], LAY['aspans'], LAY['xa_end']
    # 第二段：齐行首，末尾停在 g 的下行左边
    T['概'].place(X1, B2, S2)
    T['念'].place(LAY['x2b'], B2, S2)
    pv = LAY['pv']
    H = hair()

    line1 = union([T['现'].stage_path(), T['代'].stage_path()])
    line2 = union([T['概'].stage_path(), T['念'].stage_path(), pv])
    cursor = T['代'].stage(T['代'].cursor)
    text = union(line1, line2, cursor, agent)
    cx, cy = T['代'].to_stage(T['代'].anchors['cursor'])
    trx, try_ = T['代'].to_stage(T['代'].anchors['cursor_tr'])
    # 底线带：齐行首
    bw, bblocks, bend, _ = LAY['band']
    E = EM.keycap(*CAP, H)
    lab, _ = EN.type_line('RETURN', 8.6, E['label_at'][0], E['label_at'][1], track=0.16)
    # Agent 的 t 那一横的右端：伸进画面的那一根从这里接着往前写
    t0 = aspans[4][0]
    tx, ty = t0 + 344 * SA / 1000, B1 - 434.5 * SA / 1000
    right = max(xa_end, CAP[0] + CAP[2], bend)
    G = {
        'title': T, 'text': text, 'line1': line1, 'line2': line2, 'cursor': cursor, 'agent': agent, 'pv': pv,
        'chars': [{'path': g.stage_path(), 'top': g.base - 0.86 * g.size, 'bottom': g.base + 0.1 * g.size} for g in T],
        # 底板：两块圆角框（第一段、回车键加第二段加底线带），由字块长出来；span 是左右两头（扫描条从这里碎开）
        'plate': {'boxes': [(X1 - 24, B1 - 128, xa_end + 30, B1 + 40, 30),
                            (X1 - 24, B2 - 112, right + 26, BAND_BASE + 16, 30)],
                  'span': (X1 - 24, right + 30)},
        'hair': H, 'band': {'words': bw, 'blocks': bblocks, 'x0': X1 + 2, 'x1': bend, 'y': BAND_BASE},
        'cap': E, 'cap_label': lab, 'cursor_c': (cx, cy),
        # 输入框的下沿：第一段坐在它上面（这一行就是那行指令）；线宽 = 本题最细笔画，两头各一块小方块
        'field': {'y': LAY['field_y'], 'x0': X1 - 12, 'x1': xa_end + 14},
        'baseline': BAND_BASE,
        'tag': {'x': 104, 'y': 58},
        'star': {'x': round(trx - 1, 2), 'y': round(try_ + 1, 2), 's': 15, 'long': 2.7, 'tall': 2.0, 'a': 1.0},
        'anchors': {'cursor': [round(cx, 1), round(cy, 1)], 'enter_key': [round(E['legend_c'][0], 1), round(E['legend_c'][1], 1)],
                    'agent_t': [round(tx, 1), round(ty, 1)]},
        'geo': {'out': {'x': round(tx + 1, 2), 'y': round(ty, 2), 'dx': 1, 'dy': 0, 'len': 120, 'route': 'swing', 'lead': 40,
                        'overshoot': False, 'w': round(H, 2), 'cap': 'butt', 'rgb': LY.rgb_str(tok['lit']),
                        'stops': [[0, 0.9], [0.6, 0.6], [1, 0.25]]}},
        'enter': {'geo': {'at': 0.6, 'dur': 0.32}, 'star': {'at': 0.02, 'dur': 0.12}, 'tag': {'at': 0.1, 'dur': 0.24}},
    }
    return G


# ------------------------------------------------------------------ 图层（从后往前）和入场
# at、dur 占整段入场的比例（片头一格 0.8 秒、介绍页 1.8 秒）。故事是全片开头那一镜的缩写——回车落下的那一刻（kind 见 ae.js「01 现代Agent概念PV」）：
#   暗里先有一块光标在闪（片头飞来的星正落在它右上角，星就成了光标），暗渍从光标那里化开，输入框的下沿从光标两侧画出去；
#   人敲字：「现」落进来，停一下，「代」才落进来（快慢不匀，人的节奏）；
#   回车键从上面落下、按到底、停一下、弹回来，背光跟着亮起；整行指令（字和光标）往下一沉再弹回来；
#   光标的光推进 Agent：荧光的前沿从 A 往右推过去，前沿上一道过亮的光带，着的时候一顿一顿地闪，着完就稳；
#   「概念PV」由 Agent 敲出来：四个字等距、又快又匀，一块小光标跑在字前头，敲完就收走；
#   六章章名一章一章跟着出来；最后那根线从 Agent 的 t 那一横往画面里接着写（geo.out）。
# cols、sink 里的时刻是整段进度 u，几层对得上同一下回车。
_RGB = LY.rgb_str(paths.direction(KEY)['lit'])          # 打字时跑在字前头的小光标：点亮色（取 tokens）
_CX, _CY = LAY['cursor_c']
ENTER_U = 0.262                                          # 回车按到底的那一刻
SINK = {'at': ENTER_U, 'dur': 0.12, 'dy': 3}
_BAND = LAY['band'][3]

LAYERS = [
    Layer('plate', 'plate', LY.render_plate, enter={'at': 0.0, 'dur': 0.28, 'kind': 'grow', 'from': [round(_CX, 1), round(_CY, 1)], 'soft': 0.4}),
    Layer('cap_glow', 'emblem', LY.render_cap_glow, enter={'at': ENTER_U, 'dur': 0.12, 'kind': 'ignite', 'dark': 0}),
    Layer('cap', 'emblem', LY.render_cap, enter={'at': 0.2, 'dur': 0.2, 'kind': 'agent-press', 'drop': 12, 'press': 4,
                                                  'hit': round((ENTER_U - 0.2) / 0.2, 3), 'release': 0.5}),
    Layer('field', 'line', LY.render_field, enter={'at': 0.03, 'dur': 0.2, 'kind': 'grow', 'from': [round(_CX, 1), LAY['field_y']], 'soft': 0.12}),
    Layer('band', 'en', LY.render_band, enter={'at': 0.4, 'dur': 0.26, 'kind': 'agent-type',
                                               'cols': [[round(x + 6, 1), round(0.42 + 0.04 * i, 3)] for i, x in enumerate(_BAND[:-1])] + [[1100, 0.62]]}),
    Layer('line1', 'text', LY.render_line1, enter={'at': 0.0, 'dur': 0.4, 'kind': 'agent-type', 'sink': SINK,
                                                   'cols': [[round(LAY['right_xian'] + 2, 1), 0.1], [round(LAY['right_dai'] + 60, 1), 0.19]]}),
    Layer('agent', 'hero', LY.render_agent, enter={'at': 0.27, 'dur': 0.14, 'kind': 'agent-phosphor', 'from': round(_CX - 12, 1),
                                                   'to': round(LAY['xa_end'] + 30, 1), 'band': 52, 'flicker': 0.18}),
    Layer('line2', 'text', LY.render_line2, enter={'at': 0.29, 'dur': 0.1, 'kind': 'agent-type',
                                                   'cols': [[round(LAY['right_gai'] + 2, 1), 0.3], [round(LAY['right_nian'] + 2, 1), 0.325],
                                                            [round(LAY['pspans'][0][1], 1), 0.35], [round(LAY['xp_end'] + 40, 1), 0.375]],
                                                   'caret': {'w': 9, 'h': 80, 'y': B2 - 86, 'rgb': _RGB, 'gap': 7}}),
    Layer('cursor', 'hero', LY.render_cursor, enter={'at': 0.0, 'dur': 0.2, 'kind': 'agent-blink', 'sink': SINK,
                                                     'pattern': [[0, 1], [0.28, 0], [0.5, 1]]}),
]


# ------------------------------------------------------------------ 小形态


def small(tok):
    """一行：现代 Agent 概念 PV。方点、方脚留着；签名字是 Agent（荧光），「代」的光标并进 Agent 那一份一起换料
    （光标还在「代」的点上，只是和 Agent 同一种料，所以小了也亮）"""
    from lockupkit import small as SM
    T = LT.letters(cursor=False)
    S, HS = SM.S, SM.HS
    adv = [0.98, 1.0, None, 0.98, 1.1, None]
    word, spans, xe = EN.word('Agent', 1000, 0, 0)
    word = word.transform(1, 0, 0, -1, 0, 0)                  # 舞台（y 朝下）→ 字体单位（y 朝上）
    adv[2] = xe / 1000 + 0.12
    pv, _, xpe = EN.word('PV', 1000, 0, 0, kern={'PV': -0.04})
    pv = pv.transform(1, 0, 0, -1, 0, 0)
    adv[5] = xpe / 1000
    # 光标：在「代」的字体单位里 → 换到 Agent 那一份（签名字的字号、原点）的字体单位里（照 small.layout 的排法）
    x_d = 12 + S * adv[0]
    x_a = x_d + S * adv[1] + 6
    base_d = 8 + 0.88 * HS
    base_h = base_d + 2.4
    cx, cy, cw, ch = LT.DOTS['代5']

    def to_hero(u, v):
        x, y = x_d + u * S / 1000, base_d - v * S / 1000
        return (x - x_a) * 1000 / HS, (base_h - y) * 1000 / HS
    (u0, v0), (u1, v1) = to_hero(cx - cw / 2, cy - ch / 2), to_hero(cx + cw / 2, cy + ch / 2)
    hero = union(word, rect(u0, v0, u1, v1))
    chars = [T['现'].path(), T['代'].path(), hero, T['概'].path(), T['念'].path(), pv]
    return {'chars': chars, 'hero': 2, 'advance': adv, 'face': lambda C, m, tone: LY.small_face(C, m, tone, tok)}

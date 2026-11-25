"""05 天穹圣城 · 题名锁定模块。

  概念单     CONCEPT（下面）
  笔画标注   strokes.py（思源宋体 Bold）
  笔画处理   letters.py（方言「尖塔宋」、塔尖呼应、「穹」的肋拱穹顶高潮）
  主体元素   emblem.py（晨光圣轮：日轮 + 鎏金光刃）
  英文       english.py（CIVITAS CAELI 背景巨字、底线带）
  颜色层     layers.py（每层一个 render；「穹」的金和玻璃、锚链和底线带各分两层，入场时分开走）；图层表 LAYERS 和入场在本文件
  自用工具   tools.py（量字形：每一行的实心范围，标笔画用）
出图：python 专题/审美全能/设计/logo/lockups/build/lockup.py sky-citadel
"""
from lockupkit.geom import union, rect, circle, poly
from lockupkit.run import Layer
from . import letters as LT, emblem as EM, english as EN, layers as LY
from .strokes import STROKES  # noqa: F401  （--strokes 用）

KEY = 'sky-citadel'
TEXT = LT.TEXT
FONT = LT.FONT

CONCEPT = {
    '题名': '天穹圣城', '类别': '大型场景建模',
    '一句话概念': '晨光里，云上的圣城一根根尖塔往上长；太阳正从穹顶后面升起来。',
    '气质词': ['宏大', '神圣', '通透'], '物件': '一座带采光亭的肋拱穹顶', '动作': '往上长（尖塔、光刃、塔尖都朝上）',
    '同源媒介': '建筑立面的铜版画：发丝线排出明暗、鎏金穹顶、玻璃的肋拱；大场景建模在现实里就是画立面、搭城',
    '方言': '尖塔宋：思源宋体 Bold（细一档、透气）；长体（字身收到 0.86）；竖画出头处削成对称的塔尖，'
           '「城」的三根再延出收细的发丝和小圆珠；横末、转角上的三角拔成小尖顶；点削成两头尖的晶片；撇捺保留宋体的弧，尖不磨圆',
    '骨架': '一行，主字「穹」放大到 1.39 倍、站得最高；字距放开（约 0.15 字）取通透；横画全水平，竖画全竖直，只有撇捺斜',
    '母题落点': {
        '高潮': '「穹」的穴字头本来就是“顶下开口”的形：宀的横、左点、右钩原样做鼓座和两侧的墩，横上起一座三道肋的玻璃穹顶，'
              '宀顶那一点升到穹顶尖上做采光亭（尖顶上一颗星）；八的两笔下沿各掏一道弧成飞扶壁；「弓」三笔完整保留，末钩挑长一点，钩上挂锚链',
        '呼应': '竖画出头处都是塔尖：「城」土旁的竖、成的撇、戈的斜钩成三座高低不一的尖塔（一个字就是一道天际线），「圣」土的竖削尖',
    },
    '主体元素': '晨光圣轮：刚升到穹顶后面的太阳，画成巴洛克祭坛上的荣光——两道发丝日轮、一圈细放射线、十三把长短相间的鎏金光刃，'
              '刃尖连成一道尖拱，正上方最长、顶出剪影；放在「穹」后面，穹顶坐在日轮里，和「穹」同料',
    '英文分工': 'CIVITAS CAELI 背景巨字（Didone 大写撑满字块，压在中文下半截后面，字脚沉进云里，一排柱廊浮在云上）；'
              '底线带 A CITY ABOVE THE CLOUDS 挂在锚链下面那道发丝上，字后一段珠点线，末端接伸进画面的锚链',
    '颜色角色': {'字面': '纸白，受光一侧（右上）透一点朝阳的淡粉金，背光一侧压极淡的铜版细线（和「穹」同一套刻线）',
              '主题色': '深群青（底板）、晨曦天青与淡粉（日轮后的天光、云的亮边）', '阴影': '深群青的暗调',
              '点缀': '水晶青：穹顶肋间的玻璃（主，像水彩一样在玻璃里化开、带颗粒），采光亭的两扇窗和锚链末端的水晶珠为呼应，'
                    '玻璃周围散几粒晶尘；「城」的点不再上色',
              '共用金属': '鎏金与浅金：「穹」和光刃是鎏金（背光面压铜版细线），日轮、发丝、锚链、底线带是浅金'},
    '检查': '去色、遮掉穹顶和日轮只剩字、缩到缩略图、白底黑底',
}

# ------------------------------------------------------------------ 版式（舞台像素；画板左上 = 介绍页上锁定的原点）

ARTBOARD = (1000, 520)
CX = 0.86                          # 长体：只压横向
S, SH = 166, 230                   # 天、圣、城 / 穹 的字号
BASE = 350                         # 中文的基线（四个字同一条）
LEFT = 100                         # 字块左沿
GAPS = (24, 22, 22)                # 字与字之间的空（墨迹到墨迹，舞台像素）：字距放开，取通透
LINE_Y = 427                       # 底线带那道发丝（锚链落到这里）
CAPS_BASE = 432                    # 底线带的基线 = 收底的基线
GHOST = dict(word='CIVITAS CAELI', size=96, base=406)
TAG = {'x': 486, 'y': 100}          # 编号小标：放在「圣城」上方（左上让给日轮和光刃）


def _layout():
    """每个字的原点 x：按墨迹的左右沿一个挨一个排，字与字之间留 GAPS"""
    from lockupkit.geom import glyph
    xs, x = {}, LEFT
    for i, ch in enumerate(LT.TEXT):
        p, _ = glyph(LT.FONT, ch)
        b = p.bounds
        k = (SH if ch == '穹' else S) / 1000 * CX
        xs[ch] = x - b[0] * k
        x = xs[ch] + b[2] * k + (GAPS[i] if i < len(GAPS) else 0)
    return xs


X = _layout()
DOME_C = (X['穹'] + LT.DOME['cx'] * SH / 1000 * CX, BASE - LT.DOME['y0'] * SH / 1000)   # 穹顶鼓座中心 = 日轮圆心


def place(g, x0, base, size, cx=CX):
    """排版：字体单位 → 舞台像素，只压横向（长体）。把 g.stage / g.to_stage 换成带横向压缩的"""
    g.place(x0, base, size)
    k = g.k
    g.stage = lambda p, g=g: p.transform(k * cx, 0, 0, -k, g.x0, g.base)
    g.to_stage = lambda q, g=g: (g.x0 + float(q[0]) * k * cx, g.base - float(q[1]) * k)
    return g


def geometry(tok):
    T, ex = LT.letters()
    for g in T:
        place(g, X[g.ch], BASE, SH if g.ch == '穹' else S)
    Q = T['穹']
    glyphs = [g.stage_path() for g in T]
    others = union([g.stage_path() for g in T if g.ch != '穹'])
    hero = Q.stage_path()
    text = union(glyphs)
    hair = LT.HAIR * S / 1000                         # 本题最细的笔画（横的厚度，舞台像素）
    D = ex['dome']
    dome = {'glass': Q.stage(D['glass']), 'lamp': Q.stage(D['lamp']), 'gold': Q.stage(D['gold'])}
    C = DOME_C
    tip = Q.to_stage(Q.anchors['tip'])
    lamp = Q.to_stage(Q.anchors['lamp'])
    E = EM.gloria(C, 86, 42, hair)
    # 锚链：从「弓」的钩尖垂下来，落到底线带的发丝上，末端一颗水晶珠
    hook = Q.to_stage(Q.anchors['hook'])
    chain, y = [], hook[1] + 2.5
    radii = [1.9, 2.8, 1.9, 3.6, 1.9, 2.4, 1.9, 4.3, 1.9, 2.8, 1.9]
    i = 0
    while True:
        r = radii[i % len(radii)]
        if y + 2 * r > LINE_Y - 9:
            break
        chain.append((hook[0], y + r, r))
        y += 2 * r + 2.2
        i += 1
    crystal = (hook[0], LINE_Y)
    _layer('rule').enter['from'] = [round(crystal[0], 1), LINE_Y]          # 底线带从水晶珠往两边铺开
    # 底线带：水晶珠左边一截发丝（到字块左沿），右边接 A CITY ABOVE THE CLOUDS，字后一段珠点线到字块右沿
    tb = text.bounds
    x_left, x_right = tb[0] + 6, tb[2]
    caps, cw = EN.caps('A CITY ABOVE THE CLOUDS', crystal[0] + 22, CAPS_BASE)
    cap_end = crystal[0] + 22 + cw
    hl = hair * 0.62
    rule = union(rect(x_left, LINE_Y - hl / 2, crystal[0] - 11, LINE_Y + hl / 2),
                 rect(cap_end + 14, LINE_Y - hl / 2, x_right, LINE_Y + hl / 2))
    dots = [(x_left, LINE_Y, hair * 0.75)]
    xx = cap_end + 14 + 26
    k = 0
    while xx < x_right - 14:
        dots.append((xx, LINE_Y, hair * (0.85 if k % 3 == 1 else 0.5)))
        xx += 22
        k += 1
    gh = EN.ghost(GHOST['word'], tb[0] + 2, x_right, GHOST['base'], GHOST['size'])
    spires = {}
    for sid in ('城2', '城5', '城7'):
        g = T[sid[0]]
        spires[sid] = g.to_stage(g.anchors[sid + '.tip'])
    G = {
        'title': T, 'text': text, 'others': others, 'hero': hero, 'dome': dome, 'gloria': E, 'hair': hair,
        'chain': chain, 'crystal': crystal, 'rule': rule, 'dots': dots, 'caps': caps, 'ghost': gh,
        'lamp': lamp, 'spires': spires, 'C': C,
        'chars': [{'path': p, 'top': g.base - 0.9 * g.size, 'bottom': g.base + 0.1 * g.size, 'ch': g.ch} for p, g in zip(glyphs, T)],
        'baseline': CAPS_BASE,
        'tag': dict(TAG),
        'star': {'x': round(tip[0], 2), 'y': round(tip[1], 2), 's': 18, 'long': 2.4, 'tall': 2.8, 'a': 1.0},
        'anchors': {'gloria_center': list(C), 'gloria_radius': 86, 'dome_tip': list(tip), 'hook': list(hook),
                    'crystal': list(crystal), 'line_y': LINE_Y},
        # 伸进画面的那一根：锚链落到底线带，顺着珠点线往右走到字块右沿，再接着伸进画面（代表画面给落点时，先微微上扬、平着走，
        # 越过点题短语以后再落到岛底的锚环上）。
        # 线是一串圆珠（虚线、圆头），线宽 = 本题最细的笔画
        'geo': {'out': {'x': round(x_right + 4, 2), 'y': LINE_Y, 'dx': 0.95, 'dy': -0.3, 'len': 110, 'route': 'swing', 'lead': 80,
                        'overshoot': False, 'w': round(hair, 2), 'cap': 'round', 'dash': [0.1, 10.5], 'rgb': '243,214,168',
                        'stops': [[0, 0.95], [0.75, 0.7], [1, 0.25]]}},
        'enter': {'geo': {'at': 0.78, 'dur': 0.22}, 'star': {'at': 0.84, 'dur': 0.16}, 'tag': {'at': 0.12, 'dur': 0.26}},
    }
    return G


# ------------------------------------------------------------------ 图层（从后往前）和入场
# 入场讲的是“晨光里，云上的圣城往上长；太阳从穹顶后面升起来”（kind 见 ae.js「各题的入场方式」citadel-*）：
#   底板从日心化开（天先亮）→ 城往上长：天、穹、圣、城一座座从下往上长出来，塔尖最后探到顶（citadel-rise，「城」的三根发丝塔尖收在最后）；
#   背景巨字的柱廊从云里升起来 → 太阳从穹顶的鼓座后面升起、光刃一把把放出去（citadel-dawn，鼓座那条线以下藏着）→
#   穹顶的玻璃被晨光从下往上照透、亮一下再落定，鎏金上扫过一道光（citadel-glass、sweep）→
#   锚链从钩尖垂下来，落到水晶珠；底线带的发丝从水晶珠往两边铺开，英文跟着写出来，伸进画面的珠点线接着走 →
#   采光亭尖上的星最后亮（item.enter.star），光刃尖和晶尘一闪。


def _cols():
    """「天」「圣」「城」各自往上长，一个跟一个：每一段从哪个 x 起（锁定坐标）、晚多少（占这一层进度的比例）"""
    from lockupkit.geom import glyph
    span = {}
    for ch in LT.TEXT:
        b = glyph(LT.FONT, ch)[0].bounds
        k = (SH if ch == '穹' else S) / 1000 * CX
        span[ch] = (X[ch] + b[0] * k, X[ch] + b[2] * k)
    return [[0, 0], [round((span['天'][1] + span['穹'][0]) / 2, 1), 0.16], [round((span['圣'][1] + span['城'][0]) / 2, 1), 0.3]]


def _layer(id_):
    return next(ly for ly in LAYERS if ly.id == id_)


_SUN = [round(DOME_C[0], 1), round(DOME_C[1], 1)]
LAYERS = [
    Layer('plate', 'plate', LY.render_plate, enter={'at': 0.0, 'dur': 0.24, 'kind': 'grow', 'from': _SUN, 'soft': 0.4}),
    Layer('ghost', 'ghost', LY.render_ghost, enter={'at': 0.16, 'dur': 0.32, 'kind': 'citadel-rise', 'dy': 10, 'soft': 34}),
    Layer('gloria', 'emblem', LY.render_gloria, enter={'at': 0.22, 'dur': 0.46, 'kind': 'citadel-dawn', 'c': _SUN, 'r': 93, 'dy': 64,
                                                      'soft': 0.12}),
    Layer('text', 'text', LY.render_text, enter={'at': 0.08, 'dur': 0.27, 'kind': 'citadel-rise', 'dy': 16, 'soft': 36, 'cols': _cols()}),
    Layer('hero', 'hero', LY.render_hero, enter={'at': 0.11, 'dur': 0.32, 'kind': 'citadel-rise', 'dy': 22, 'soft': 44,
                                                'sweep': {'at': 0.52, 'dur': 0.34}}),
    Layer('glass', 'hero', LY.render_glass, enter={'at': 0.44, 'dur': 0.26, 'kind': 'citadel-glass'}),
    Layer('rule', 'line', LY.render_rule, enter={'at': 0.63, 'dur': 0.22, 'kind': 'grow', 'from': None, 'soft': 0.16}),
    Layer('chain', 'line', LY.render_chain, enter={'at': 0.48, 'dur': 0.2, 'kind': 'wipe', 'dir': 'down', 'soft': 0.1}),
    Layer('en', 'en', LY.render_en, enter={'at': 0.67, 'dur': 0.22, 'kind': 'wipe', 'dir': 'right', 'soft': 0.3}),
    Layer('fx', 'glint', LY.render_fx, enter={'at': 0.8, 'dur': 0.2, 'kind': 'flash'}),
]


# ------------------------------------------------------------------ 小形态


def small(tok):
    """一行四个字：方言（长体、塔尖、小尖顶、晶片点）留着，「城」的发丝、穹顶的发丝塔尖小了看不清，去掉；
    签名字「穹」是鎏金（穹顶的肋和采光亭是金，肋间的玻璃在小形态里空着）"""
    T, ex = LT.letters(detail='small')
    chars = [g.path().transform(CX, 0, 0, 1, 0, 0) for g in T]

    def face(Cv, mask, tone):
        return LY.gilt_small(Cv, mask, tone)
    return {'chars': chars, 'hero': 1, 'face': face, 'advance': [0.92, 0.92, 0.92, 0.92]}

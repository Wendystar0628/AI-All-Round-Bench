"""09 浮空群岛传说游戏UI · 题名锁定模块。

  概念单     CONCEPT（下面）
  笔画标注   strokes.py
  笔画处理   letters.py（方言「卡带盒描边宋」、浮石呼应、岛的岩根高潮；手术都是本模块自己写的）
  主体元素   emblem.py（小浮石上的像素宝箱）
  英文       english.py（LEGEND 背景巨字、of the Floating Isles 小档、PRESS START 像素底线带、像素光标）
  颜色层     layers.py（每层一个 render；像素格、四档平涂金、棋盘格过渡都写在那里）
出图：python topics/审美全能/设计/logo/lockups/build/lockup.py floating-isles-game-ui
"""
from lockupkit.geom import union
from lockupkit.run import Layer
from . import letters as LT, emblem as EM, english as EN, layers as LY
from .strokes import STROKES  # noqa: F401  （--strokes 用）

KEY = 'floating-isles-game-ui'
TEXT = LT.TEXT
FONT = LT.FONT

CONCEPT = {
    '题名': '浮空群岛传说游戏UI', '类别': '游戏 UI 设计',
    '一句话概念': '卡带盒上的标题画面：一座岛浮在暮色半空，岛底倒挂着岩根和晶簇，滴下的一点翠绿是一条虚线航路的起点，航路通向宝箱。',
    '气质词': ['奇幻', '冒险', '明亮'], '物件': '倒挂岩根的浮岛（「岛」本身）；航路节点上的像素宝箱', '动作': '升起、悬浮',
    '同源媒介': '16 位游戏的卡带盒与标题画面：描边加错位硬投影的标题字、四档平涂的像素美术、菜单光标和 PRESS START、地图上的点线航路',
    '方言': '卡带盒描边宋：思源宋 Heavy 骨架，横细竖粗；横末三角往右上张开、削尖，U、I 的衬线外端削成楔尖；'
            '宋体的圆头一律削尖——空着的竖脚削成朝下的岩尖（浮岛的底），捺末、提头的圆球削出刃尖；'
            '全组一圈深紫细描边、一格错位的硬投影；字面按像素格（2 舞台像素）平涂：上沿一格纯白、下部三成换淡紫（交界一条棋盘格）、右下一格内阴影',
    '骨架': '三档字号阶梯往右上升（升起）：第二段 84 在左下、坐在菜单条上，第一段 132 右移 48 在上，「岛」184 最高、基线比第一段高 22；重心偏上；'
            '右下是 LEGEND 和宝箱，左下是 PRESS START，一条航路把两边连起来',
    '母题落点': {'高潮': '「岛」的山完整保留作岛顶（只削平竖折转角的小脚，底横成一条地面），地面下隔一道细缝挂倒长的岩体：'
                       '三个高低不一的岩尖、两根细根，右下垂一簇翠绿晶体，主尖滴一点翠绿；星芒在晶簇上，滴落处是航路的起点',
               '呼应': '所有的点削成小浮石（刻面、尖底，和相邻笔画之间留一道空）；空着的竖脚削成小岩尖'},
    '主体元素': '小浮石上的像素宝箱（四档宝箱金，和「岛」同料），航路的节点：航路从滴落处落到底线带，往右穿过它，再伸进画面',
    '英文分工': 'LEGEND：Bodoni 粗体背景巨字，站在航路那一条上、右半边，宝箱压在它前面；of the Floating Isles 斜体小档坐在它右肩上；PRESS START：像素字底线带，后接像素珠点引到滴落处；'
                '「传说」前一个像素三角光标，第二段坐在一条菜单选中条上',
    '颜色角色': {'字面': '奶白，上沿一格纯白（离「岛」近的几个字偏暖），下部三成淡紫（离晶簇近的下沿映翠绿），深紫描边，暮紫硬投影', '主题色': '暮色群青：底板、菜单条、LEGEND',
               '阴影': '深紫（主题色的暗调）', '点缀': '宝箱金：「岛」为主，宝箱和光标为呼应，金方点在岛顶附近像纹理一样散开；'
               '第二点缀浮岛翠绿：晶簇、滴落、岩体上沿的苔线、岛下一团光和翠绿方点', '共用金属': '浅金：航路和珠点线'},
    '检查': '去色、遮掉岩根和宝箱只剩字、缩到缩略图、白底黑底',
}

# ------------------------------------------------------------------ 版式（舞台像素；画板左上 = 介绍页上锁定的原点）

ARTBOARD = (1000, 500)
S1, ADV1, X1, B1 = 132, 970, 178, 262        # 第一段「浮空群」：字号、字距（字体单位）、第一个字的原点、基线
SH, XH, BH = 184, 560, 240                   # 「岛」：浮起来，基线比第一段高 22
S2, ADV2, X2, B2 = 84, 945, 130, 376         # 第二段「传说游戏」
SU = 96                                      # U、I 的字号（大写和汉字等高）
BAND = 404                                   # 底线带 PRESS START 的基线（字高的中线就是航路那一条）
BASE = 420                                   # 收底的基线（介绍页对到 y 422）：比航路低 22，航路在介绍页上不碰点题短语
ROUTE_Y = 398                                # 航路和珠点线的高度
GHOST = dict(x0=638, base=396, size=74)      # LEGEND：站在航路那一条上，右半边
BAR = (96, 312, 586, 387)                    # 第二段的菜单选中条
HAIR = 2.4                                   # 本题最细的笔画（第二段的横，28 × 0.084）：航路、珠点线的宽


def place(T):
    for i in range(3):
        T[i].place(X1 + i * ADV1 * S1 / 1000, B1, S1)
    T['岛'].place(XH, BH, SH)
    for i in range(4):
        T[4 + i].place(X2 + i * ADV2 * S2 / 1000, B2, S2)
    xu = X2 + 3 * ADV2 * S2 / 1000 + 0.98 * S2 + 2
    T['U'].place(xu, B2, SU)
    T['I'].place(xu + 829 * SU / 1000 + 2, B2, SU)


def geometry(tok):
    T, root = LT.letters()
    place(T)
    g = T['岛']
    glyphs = [x.stage_path() for x in T]
    hero = g.stage_path()
    rock = g.stage(root['rock'])
    roots = g.stage(root['roots'])
    pebbles = union([g.stage(q) for q in root['pebbles']])
    crystals = [g.stage(c) for c in root['crystals']]
    drip = g.stage(root['drip'])
    text = union(glyphs)
    chars = [{'path': p, 'top': x.base - 0.86 * x.size, 'bottom': x.base + 0.1 * x.size, 'ch': x.ch} for x, p in zip(T, glyphs)]
    drip_tip = g.to_stage(root['drip_tip'])
    star = g.to_stage(root['star'])
    ridges = [[g.to_stage(q) for q in r] for r in root['ridges']]

    gh = EN.legend(GHOST['x0'], GHOST['base'], GHOST['size'])
    ps, pw = EN.press_start(X2 + 2, BAND)
    small_en = EN.of_isles(gh['x1'] - 4, gh['top'] - 9)
    lead = EN.leader(X2 + pw + 14, drip_tip[0] - 6, ROUTE_Y)
    cur = EN.cursor(BAR[0] + 10, (B2 - 0.86 * S2 + B2) / 2 - 2)
    # 宝箱压在 LEGEND 的 G 正前面：草顶落在航路那一条上面一点
    g_x0 = gh['x0'] + EN.advance('LE', GHOST['size'])
    g_w = EN.advance('G', GHOST['size'])
    cw, ch = EM.size()
    E = EM.emblem(round(g_x0 + g_w / 2 - cw / 2), ROUTE_Y - 10 - ch)
    G = {
        'title': T, 'text': text, 'row1': union(glyphs[:3]), 'row2': union(glyphs[4:]), 'hero': hero, 'chars': chars,
        'rock': rock, 'roots': roots, 'pebbles': pebbles, 'crystals': crystals, 'drip': drip, 'ridges': ridges, 'rock_top': g.to_stage((0, root['top']))[1],
        'drip_at': drip_tip, 'star_at': star, 'isle_c': g.to_stage((500, 400)),
        'ghost': gh, 'caps': ps, 'small_en': small_en, 'leader': lead, 'cursor': cur, 'bar': BAR, 'emblem': E,
        'baseline': BASE,
        'tag': {'x': X2 + 2, 'y': 58},
        'anchors': {'drip': [round(drip_tip[0], 1), round(drip_tip[1], 1)], 'chest': list(E['center']), 'crystal': [round(star[0], 1), round(star[1], 1)]},
        # 矢量星芒：晶簇上那一颗（全件唯一）
        'star': {'x': round(star[0], 1), 'y': round(star[1], 1), 's': 11, 'long': 2.0, 'tall': 2.7, 'a': 1},
        # 伸进画面的那一根：「岛」主尖滴落处出发的虚线航路（这一笔的延伸），方点宽 = 本题最细的笔画。
        # elbow：先竖直落到底线带那一条（ROUTE_Y），平着往右穿过宝箱那座小浮石，到落点正上方再落下去，接到代表画面里宝箱那座岛
        'geo': {'out': {'x': round(drip_tip[0], 2), 'y': round(drip_tip[1] + 4, 2), 'dx': 0, 'dy': 1, 'len': round(ROUTE_Y - drip_tip[1] - 4, 2),
                        'route': 'elbow', 'lead': round(ROUTE_Y - drip_tip[1] - 4, 2), 'w': HAIR, 'cap': 'butt', 'z': 'back',
                        'dash': [HAIR, 5.6], 'rgb': '240,222,166', 'stops': [[0, 0.95], [0.5, 0.8], [1, 0.6]]}},
        'enter': {'geo': {'at': 0.52, 'dur': 0.4}, 'star': {'at': 0.84, 'dur': 0.16}, 'tag': {'at': 0.1, 'dur': 0.26}},
    }
    return G


# ------------------------------------------------------------------ 图层（从后往前）和入场
# 入场是卡带开机的标题画面（ae.js 里 isles- 开头的几种）。16 位机的规矩：背景层整片做马赛克，精灵不受马赛克、按整格移动——
#   背景层（暮色底板、LEGEND、两段字）从大方块一档档对半解析到清晰，亮度同时分档升起（开机的马赛克淡入）；菜单条一格一格铺开，光标闪一下（选中）；
#   精灵：「岛」连着岩体从下面按整格浮上来、减速停住，晶簇跟着一起上来、停稳后分档亮起；两粒小石子慢半拍、浮得更远；
#   PRESS START 快闪两下（按下开始）→ 珠点一颗颗往右跑到滴落处；同时主尖结出一滴翠绿、落到位 → 航路从滴落处画出去，宝箱那座小浮石浮上来 →
#   像素十字闪点和宝箱的光亮起 → 星芒最后亮在晶簇上。片头一格（0.8 秒）里两段字在 0.27 秒解析清楚

LAYERS = [
    Layer('plate', 'plate', LY.render_plate, enter={'at': 0.0, 'dur': 0.3, 'kind': 'isles-mosaic', 'block': 32}),
    Layer('bar', 'plate', LY.render_bar, enter={'at': 0.1, 'dur': 0.12, 'kind': 'isles-tiles', 'tile': 24}),
    Layer('ghost', 'ghost', LY.render_ghost, enter={'at': 0.06, 'dur': 0.3, 'kind': 'isles-mosaic', 'block': 16}),
    Layer('text', 'text', LY.render_row1, enter={'at': 0.05, 'dur': 0.22, 'kind': 'isles-mosaic', 'block': 16}),
    Layer('text2', 'text', LY.render_row2, enter={'at': 0.12, 'dur': 0.2, 'kind': 'isles-mosaic', 'block': 12}),
    Layer('pebbles', 'hero', LY.render_pebbles, enter={'at': 0.1, 'dur': 0.42, 'kind': 'isles-rise', 'dy': 88}),
    Layer('hero', 'hero', LY.render_hero, enter={'at': 0.03, 'dur': 0.37, 'kind': 'isles-rise', 'dy': 60}),
    Layer('crystal', 'hero', LY.render_crystal, enter={'at': 0.03, 'dur': 0.45, 'kind': 'isles-rise', 'dy': 60, 'move': 0.82, 'dark': 0.3, 'light': [0.66, 0.92]}),
    Layer('drip', 'hero', LY.render_drip, enter={'at': 0.42, 'dur': 0.12, 'kind': 'isles-drip', 'dy': -7}),
    Layer('emblem', 'emblem', LY.render_emblem, enter={'at': 0.4, 'dur': 0.24, 'kind': 'isles-rise', 'dy': 18}),
    Layer('cursor', 'en', LY.render_cursor, enter={'at': 0.1, 'dur': 0.14, 'kind': 'isles-blink', 'blinks': 1}),
    Layer('press', 'en', LY.render_press, enter={'at': 0.3, 'dur': 0.18, 'kind': 'isles-blink', 'blinks': 2}),
    Layer('lead', 'line', LY.render_lead, enter={'at': 0.4, 'dur': 0.14, 'kind': 'isles-tiles', 'tile': 8}),
    Layer('small', 'en', LY.render_small, enter={'at': 0.28, 'dur': 0.14, 'kind': 'isles-mosaic', 'block': 0, 'levels': 3}),
    Layer('fx', 'glint', LY.render_fx, enter={'at': 0.68, 'dur': 0.22, 'kind': 'flash'}),
]


# ------------------------------------------------------------------ 小形态


def small(tok):
    """一行十个字：方言（楔形、岩尖、浮石）都在；「岛」只挂岩体（细根、晶簇小了看不清）；签名字「岛」是像素金"""
    T, root = LT.letters(detail='small')
    chars = []
    for g in T:
        p = g.path()
        if g.ch == '岛':
            p = union(p, root['rock'])
        chars.append(p)
    adv = [1.0] * 8 + [0.86, 0.46]
    return {'chars': chars, 'hero': 3, 'face': LY.small_face, 'advance': adv}

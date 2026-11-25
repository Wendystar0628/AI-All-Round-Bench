"""03 玻璃温室与花艺工作室 · 题名锁定模块。

  概念单     CONCEPT（下面）
  笔画标注   strokes.py
  笔画处理   letters.py（方言「维多利亚球端宋」、玻璃顶高潮、顶饰呼应）
  主体元素   emblem.py（陶土花盆里一枝石膏马蹄莲）
  英文       english.py（Hortus 花饰首字母和藤、底线带）
  本题工具   shapes.py（贝塞尔、带、叶、球端、卷须）、paint.py（水彩、石膏、玻璃、黄铜的画法）
  颜色层     layers.py；图层表 LAYERS 和入场在本文件
出图：python 专题/审美全能/设计/logo/lockups/build/lockup.py greenhouse-render
"""
from lockupkit.geom import union, circle
from lockupkit.run import Layer
from . import letters as LT, english as EN, emblem as EM, layers as LY
from .strokes import STROKES  # noqa: F401  （--strokes 用）

KEY = 'greenhouse-render'
TEXT = LT.TEXT
FONT = LT.FONT

CONCEPT = {
    '题名': '玻璃温室与花艺工作室', '类别': '白模渲染',
    '一句话概念': '黄昏的维多利亚温室：夕光穿过玻璃顶，照在一朵石膏做的花上。白模渲染就是石膏。',
    '气质词': ['柔和', '温暖', '黄昏'], '物件': '玻璃温室的人字顶、石膏马蹄莲', '动作': '夕光从左上斜照进来',
    '同源媒介': '维多利亚植物图鉴的铜版画：墨线刻出形，手工敷水彩，拉丁斜体标名',
    '方言': '维多利亚球端宋：高反差宋的骨架；横末三角全部收成一颗球（Didone 球形收笔，圆只在这一处，球颈是直切线）；'
          '横折横钩的转角三角削平成直角；收笔朝下的竖平切、两角尖；点全换成两头尖的叶片；撇捺钩尖照旧锐利',
    '骨架': '两段：玻璃温室 / 与花艺工作室，「与」缩到一半、沉到台面线上；第二段比第一段大一档，签名字「室」再大一档；'
          '字距放开（字身 1.08 倍步进）；第二段的字都站在台面线上',
    '母题落点': {'高潮': '「工作室」的「室」：宀 换成人字玻璃顶——横是檐，左点和右钩是檐下两只托，顶点是球加尖的屋脊顶饰，'
                       '人字里五根竖棂、四格灰绿玻璃；「至」做石膏浮雕（全件唯一的星芒在顶饰的球上）',
               '呼应': '「温室」的「室」顶点换成同一枚屋脊顶饰；所有横末的球和顶饰的球同形；所有叶点和马蹄莲的叶同形'},
    '主体元素': '台面线上一只陶土花盆，盆里一枝石膏马蹄莲：放在「室」的右边，花高出第一段的顶，是整块剪影唯一的突起；'
            '花和叶是石膏（和「至」同料），盆是陶土',
    '英文分工': 'Hortus 大号 Didone 斜体放在第一段右边的空角，H 的左脚甩出花饰长成一根藤托住第一段，藤尾卷进第二段左边的空当；'
            '底线带 A GLASSHOUSE AT GOLDEN HOUR 小型大写，坐在台面线下',
    '颜色角色': {'字面': '暖棕墨；受光的左上沿一线琥珀，夕光透过玻璃在字面上落下琥珀的光斑（像纹理一样从左上往右下渐少）',
               '主题色': '琥珀和玻璃灰绿两团水彩敷在图鉴纸上（琥珀托第一段，灰绿托「室」和花）', '阴影': '暖棕（主题色的暗调），偏右下',
               '点缀': '陶土：花盆为主，盆底的颜料往纸上洇开一圈为呼应', '共用金属': '黄铜：Hortus、藤、台面线左端的球'},
    '检查': '去色、遮掉玻璃顶和花盆只剩字、缩到缩略图、白底黑底',
}

# ------------------------------------------------------------------ 版式（舞台像素；画板左上 = 介绍页上锁定的原点）

ARTBOARD = (1200, 500)
S1, S2, S_YU, S_H = 114, 132, 62, 170     # 第一段、第二段、「与」、签名字「室」的字号
ADV1, ADV2 = 1085, 1070                   # 字距（字体单位）
X1, B1 = 98, 196                          # 第一段第一个字的原点和基线
X2, B2 = 268, 361                         # 第二段（花艺工作）
XYU = 194                                 # 「与」：缩小、沉到台面线上
TABLE_Y = 378                             # 台面线（代表画面里花艺台的后沿接着它）
X_H = 830                                 # 签名字「室」的原点
CAPS_BASE = 404                           # 底线带的基线（= 收底的基线）
POT_CX = 1038                             # 花盆中线


def geometry(tok):
    T = LT.letters()
    for i in range(4):
        T[i].place(X1 + i * ADV1 * S1 / 1000, B1, S1)
    T['与'].place(XYU, TABLE_Y - 0.075 * S_YU - 4, S_YU)
    for i in range(4):
        T[5 + i].place(X2 + i * ADV2 * S2 / 1000, B2, S2)
    hero = T[LT.HERO]
    hero.place(X_H, TABLE_Y - 0.043 * S_H, S_H)
    glyphs = [g.stage_path() for g in T]
    text = union(glyphs)
    body = union([p for p, g in zip(glyphs, T) if g is not hero])
    R = hero.roof
    roof = {'frame': hero.stage(R['frame']), 'glass': [hero.stage(c) for c in R['glass']], 'tri': hero.stage(R['tri']),
            'apex': hero.to_stage(R['apex']), 'spike_top': hero.to_stage(R['spike_top']), 'frame_bottom': hero.to_stage((0, 520))[1]}
    hero_body = hero.stage(LT.diff(hero.path(), R['frame']))        # 「至」（石膏）
    chars = [{'path': p, 'top': g.base - 0.88 * g.size, 'bottom': g.base + 0.1 * g.size, 'size': g.size} for p, g in zip(glyphs, T)]
    hair = min(LT.HAIR * g.k for g in T)                              # 本题字的最细笔画（舞台像素）

    # 英文
    last1 = T[3]
    hx = last1.x0 + 1.02 * S1 + 34
    H = EN.hortus(hx, B1)
    V = EN.vine(H, B1 + 30, X1 + 40, (X1 + 26, B1 + 74), 22)
    caps, _ = EN.caps(X1 + 4, CAPS_BASE)
    # 主体元素
    E = EM.emblem(TABLE_Y, POT_CX)
    star = R['apex']
    sx, sy = hero.to_stage(star)
    line_x0, line_x1 = X1 - 2, POT_CX + 82
    G = {
        'title': T, 'text': text, 'body': body, 'hero_body': hero_body, 'roof': roof, 'chars': chars,
        'hortus': H, 'vine': V, 'caps': caps, 'emblem': E, 'hair': hair,
        'table': {'y': TABLE_Y, 'x0': line_x0, 'x1': line_x1, 'ball': circle(line_x0, TABLE_Y, hair * 1.9)},
        'baseline': CAPS_BASE,
        'tag': {'x': X1 + 4, 'y': 50, 'tone': 'ink'},
        'anchors': {'table': [line_x0, TABLE_Y, line_x1], 'pot': [POT_CX, TABLE_Y], 'bloom': list(E['calla']['tip']),
                    'roof_apex': list(roof['apex'])},
        'star': {'x': round(sx, 1), 'y': round(sy, 1), 's': 8.5, 'long': 2.4, 'tall': 1.8, 'a': 0.95},
        # 台面线：画在 line 层里（左端一颗黄铜球、往右收淡，接代表画面里花艺台的后沿）。geo.strokes[0] 只给位置不显示：
        # 代表画面读它首点的高度（花艺台后沿）和末点（画面里那一段的起点）
        'geo': {'strokes': [{'pts': [[line_x0, TABLE_Y], [line_x1, TABLE_Y]], 'rgb': '74,52,38', 'w': round(hair, 2),
                             'stops': [[0, 0], [1, 0]], 'z': 'back'}]},
        'enter': {'star': {'at': 0.8, 'dur': 0.18}, 'tag': {'at': 0.08, 'dur': 0.26}},
    }
    return G


# ------------------------------------------------------------------ 图层（从后往前）和入场
# 故事是这一题本身：白模渲染。先出来一件没上材质的白模（整件锁定只有灰石膏的形体明暗，纸上还没有水彩）；
# 然后夕光沿光束的方向从左上斜扫到右下，扫过的地方长出材质——水彩化开、墨字转暖、玻璃转灰绿、黄铜亮起来、花盆上陶土色，
# 石膏还是石膏，只被照暖；光的前沿在形状上落一道琥珀。扫完以后一道光滑过「室」的石膏和玻璃，屋脊顶饰上的星最后一闪。
# 各层共用同一道光（ae.js 的 greenhouse-dusk：light 是光扫过的整段进度，front 是前沿走过的位置）

DUSK = {'kind': 'greenhouse-dusk', 'light': [0.1, 0.5], 'front': [30, 1230], 'dir': [0.62, 0.78], 'soft': 130,
        'tone': '250,212,146'}


def dusk(at, **kw):
    """白模从 at 起出来，光扫完（light 的终点）落定"""
    return dict(DUSK, at=at, dur=round(DUSK['light'][1] - at, 3), **kw)


LAYERS = [
    Layer('plate', 'plate', LY.render_plate, enter=dusk(0.09, clay=False, glow=0.4)),
    Layer('line', 'line', LY.render_line, enter=dusk(0.0, clay=[0.5, 0.4], glow=0.7)),
    Layer('lily', 'emblem', LY.render_lily, enter=dusk(0.03, clay=[0.36, 0.44], glow=0.6)),
    Layer('pot', 'emblem', LY.render_pot, enter=dusk(0.02, clay=[0.42, 0.42], glow=0.6)),
    Layer('text', 'text', LY.render_text, enter=dusk(0.0, clay=[0.52, 0.4], glow=0.7)),
    Layer('hero', 'hero', LY.render_hero, enter=dusk(0.02, clay=[0.38, 0.42], glow=0.7, sweep={'at': 0.47, 'dur': 0.34})),
    Layer('en', 'en', LY.render_en, enter=dusk(0.04, clay=[0.42, 0.4], glow=0.7)),
    Layer('fx', 'glint', LY.render_fx, enter={'at': 0.7, 'dur': 0.2, 'kind': 'flash'}),
]


# ------------------------------------------------------------------ 小形态


def small(tok):
    """一行十个字：球端、利角、平脚、叶点都留着；签名字「室」带玻璃顶，面是石膏"""
    T = LT.letters(detail='small')
    return {'chars': [g.path() for g in T], 'hero': 9, 'face': lambda C, m, tone: LY.plaster_small(C, m, tone, tok)}

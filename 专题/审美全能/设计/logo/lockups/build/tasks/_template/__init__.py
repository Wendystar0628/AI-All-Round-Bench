"""<编号> <题名> · 题名锁定模块（从 tasks/_template/ 建的，跑得通的最小样子：一行宋体、底板、底线带）。

一个模块五样东西：
  概念单     CONCEPT（下面；报告 1.3 的字段，先写再动手）
  笔画标注   strokes.py（这一题的每个字：类型、部件、中线、宽）
  笔画处理   letters.py（方言 = 全组规则；一处同构高潮；同类笔画呼应）
  主体元素   emblem.py
  英文       english.py
  颜色层     layers.py（每层一个 render）；图层表 LAYERS 和入场写在本文件
样板看 tasks/harbor_mecha/。出图：python 专题/审美全能/设计/logo/lockups/build/lockup.py <题key>（--preview 只看样子）
"""
from lockupkit.geom import union
from lockupkit.run import Layer
from . import letters as LT, english as EN, emblem as EM, layers as LY
from .strokes import STROKES  # noqa: F401  （--strokes 用）

KEY = 'template'
TEXT = LT.TEXT
FONT = LT.FONT

CONCEPT = {
    '题名': TEXT, '类别': '',
    '一句话概念': '这个名字“是”什么、“在做”什么',
    '气质词': ['', '', ''], '物件': '一个具体物件', '动作': '决定走势（可选）',
    '同源媒介': '题目在现实里用什么做出来、印出来、刻出来',
    '方言': '底字、粗细对比、起笔收笔、转角、构造规则',
    '骨架': '字面率、重心、中宫、角度、字距',
    '母题落点': {'高潮': '哪一笔、为什么同构', '呼应': '哪一类笔画、弱化成什么'},
    '主体元素': '画什么、五种放法里的哪一种',
    '英文分工': '底线带必有；再选一两种（背景巨字、首字括号、空隙小词、斜穿手写、侧边竖排）',
    '颜色角色': {'字面': '', '主题色': '', '阴影': '主题色的暗调', '点缀': '只给高潮 / 主字 / 首字母 / 一个英文词，和主体元素同色', '共用金属': '黄铜、浅金'},
    '检查': '去色、遮掉母题和主体元素、缩到缩略图、白底黑底',
}

# 画板（舞台像素）。画板左上 = 介绍页上锁定的原点：字块左边落在 x≈100、收底的基线落在 y≈422 时，介绍页按 1 倍摆
ARTBOARD = (1100, 520)
SIZE = 120          # 字号（舞台像素）
X0, BASE = 104, 330  # 第一个字的原点、基线
ADV = 960           # 字距（字体单位）


def geometry(tok):
    T = LT.letters()
    for i, g in enumerate(T):
        g.place(X0 + i * ADV * SIZE / 1000, BASE, SIZE)
    glyphs = [g.stage_path() for g in T]
    text = union(glyphs)
    b = text.bounds
    caps, cw = EN.caps(tok.get('catEn', 'TITLE'), b[0], BASE + 48)
    return {
        'title': T, 'text': text, 'caps': caps,
        'baseline': BASE + 48,                       # 收底的基线：这里是底线带
        'tag': {'x': round(b[0] + 2), 'y': round(b[1] - 52)},
        'anchors': {}, 'emblem': EM.emblem(b),
    }


# 图层（从后往前）；enter 的 at、dur 占整段入场的比例，kind 见 lockupkit/run.py 的 Layer
LAYERS = [
    Layer('plate', 'plate', LY.render_plate, enter={'at': 0.0, 'dur': 0.3, 'kind': 'grow', 'soft': 0.35}),
    Layer('text', 'text', LY.render_text, enter={'at': 0.08, 'dur': 0.26, 'kind': 'focus', 'blur': 6, 'dx': -22}),
    Layer('en', 'en', LY.render_en, enter={'at': 0.3, 'dur': 0.26, 'kind': 'slide', 'dx': 24}),
]


def small(tok):
    """小形态：一行的字（呼应的细节、伸出去的长笔画可以不要）；hero 是签名字的序号，face 是它的材质"""
    T = LT.letters(detail='small')
    return {'chars': [g.path() for g in T], 'hero': None, 'face': None}

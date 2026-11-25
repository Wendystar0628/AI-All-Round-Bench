"""02 秋庭观星画室 · 笔画处理（字体单位，1000 em，y 朝上）。

方言「刻本木版宋」：底字是思源宋体 Bold（比别题轻一档），六个字统一做——
  1. 横画留够宽：上下各加 THICK，刀刻不出发丝，横竖对比压到三比一上下；
  2. 刀只削短弯：竖的圆脚、横末三角的勾、钩的小圆、转角的小圆角、撇的圆尖都削成一刀直线（knife.sharpen），
     长的撇捺弧原样留着——大弧顺刀走得圆，收刀处见棱角。
呼应：所有的点（秋的两点、庭和室的顶点、室的左点和至的点）换成圆珠——轨道上停着的小珠，颜色层给它们画卡通的三档明暗；
      观的长点是一笔长画，不算点。
高潮：「星」日的中横拿掉，换成浑天仪的黄道环（环在排版后按舞台坐标画，见 __init__.geometry 和 emblem.py）。
"""
from lockupkit.strokes import Title
from lockupkit import paths
from lockupkit.geom import diff, rect, poly, circle
from .strokes import STROKES
from .knife import sharpen, thicken

FONT = paths.SONG_BOLD
TEXT = '秋庭观星画室'

THICK = 4.5         # 横画上下各加厚（字体单位）
KNIFE = 170         # 刀：控制多边形短于它的曲线段削成一刀直线（字体单位）

# 每个点在原字里占的那块（连同和邻笔粘连的尾巴）：拿掉后补圆珠。只框点自己，不碰邻笔的芯；独立轮廓的点直接用它切出来的形
DOT_CUT = {
    '秋5': [(304, 445), (365, 445), (475, 335), (475, 215), (325, 215), (304, 300)],
    '庭1': [(415, 865), (650, 865), (650, 699), (415, 699)],
    '室1': [(385, 865), (610, 865), (610, 713), (385, 713)],
    '室2': [(25, 800), (205, 800), (205, 716), (199, 716), (199, 578), (25, 578)],
    '室6': [(600, 500), (690, 500), (890, 440), (890, 240), (740, 240), (722, 330), (728, 398), (600, 410)],
}
# 圆珠：圆心落在原来那一点的“头”（点的重量在收笔一头），直径和点最宽处相当
BEADS = {
    '秋5': (384, 290, 48),
    '秋6': (468, 470, 49),
    '庭1': (545, 782, 54),
    '室1': (505, 786, 53),
    '室2': (124, 628, 58),
    '室6': (810, 338, 57),
}


def letters(detail='full'):
    """返回排版前的 Title（每个字的刀法都挂好了）。小形态用同一套（字小了也认得出的就是刀口和圆珠）。"""
    T = Title(FONT, TEXT, STROKES)
    dots = T.q(type='点').exclude('观2')
    for s in dots:                                   # 点先整块拿掉（连尾巴），刀法之后补圆珠
        cut = poly(DOT_CUT[s.id]) if s.id in DOT_CUT else s.piece
        s.g.op(lambda p, sh=cut: diff(p, sh))
    # 高潮：日的中横让给黄道环
    T.s('星3').variant(None)
    T['星'].op(lambda p: diff(p, rect(316, 600, 700, 658)))     # 中横伸进两竖里的那一截也去掉
    # 方言
    T.op(thicken, d=THICK)
    T.op(sharpen, max_len=KNIFE)
    # 呼应：点 → 圆珠（在刀之后补上，圆珠不过刀）
    for s in dots:
        cx, cy, r = BEADS[s.id]
        s.g.anchors.setdefault('beads', []).append((cx, cy, r))
        s.add(circle(cx, cy, r))
    return T


def beads_stage(T):
    """全部圆珠的舞台坐标 [(x, y, r)]（排版之后）"""
    out = []
    for g in T:
        for cx, cy, r in g.anchors.get('beads', []):
            x, y = g.to_stage((cx, cy))
            out.append((x, y, r * g.k))
    return out

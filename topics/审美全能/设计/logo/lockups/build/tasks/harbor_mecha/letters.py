"""08 雨夜港口的巨型机甲 · 笔画处理（字体单位，1000 em，y 朝上）。

方言「装甲宋」：以思源宋体 Heavy 为骨架，九个字统一做——
  1. 刻面   所有曲线换成机加工的直刻面（撇、捺、钩、字脚），形体始终是硬角；
  2. 斜切脚 收笔朝下、末端空着的竖：宋体的圆字脚一刀斜切，像装甲板的边；
  3. 装甲鳍 横末的三角、横折转角上的三角拔高、削尖，像肩甲上的鳍；
  4. 加厚   发丝横往竖向加厚，横画能受光、能刻斜面；
  5. 分缝   几处粗竖切出机甲面板线那样的折线分缝（构造规则）。
呼应：所有的点换成同一个雨向的两头尖的雨刃（「夜」亠的那一点留给全件唯一的星）。
高潮：「甲」的中竖穿出字脚，一节节收细成液压杆，杆尖接 70 M 尺寸线（尺寸线是这一笔的延伸，走矢量 geo.out）。
另外：夜、型、机的长撇拉成斜切刃口的长刀，夜的横撇收尾、机的弯钩也是刀；港的提重画成往右上挑的一把直刃；
「雨」的横梁接到「夜」（排版里接）。
"""
import math
import numpy as np
from lockupkit.geom import union, diff, poly, rect
from lockupkit.strokes import Title
from lockupkit.surgery import facet, thicken_h, foot, fin, seam, shard, stroke_blade, serif_apex
from lockupkit import paths
from .strokes import STROKES

FONT = paths.SONG_HEAVY
TEXT = '雨夜港口的巨型机甲'

# 雨向：从左上落到右下，偏离竖直约 23°（底板里的雨丝用同一个角度）
RAIN = (0.42, -1.0)
_L = math.hypot(*RAIN)
RX, RY = RAIN[0] / _L, RAIN[1] / _L
RAIN_DEG = math.degrees(math.atan2(RAIN[0], -RAIN[1]))

FACET_TOL = 7.0     # 刻面的粗细：越大刻面越明显
THICK = 6           # 横画上下各加厚
FIN = (16, 52)      # 装甲鳍：三角尖往右上拔的量


def rain_shard(s, length=245, w=60):
    """一片雨刃，放在这个点的身子上，沿雨向。尾在左上、头在右下。"""
    c = s.point(0.55) + np.array([8.0, 14.0])
    t = (c[0] - RX * length / 2, c[1] - RY * length / 2)
    h = (c[0] + RX * length / 2, c[1] + RY * length / 2)
    return shard(t, h, w, 0.62)


def rod(p, s):
    """「甲」的中竖穿出字脚，长成一根打进地里的钢桩：先一道套箍，再一刀长斜尖。杆尖记在锚点 rod_tip。"""
    cx, hw = float(s.end[0]), s.w_end / 2
    p = diff(p, rect(cx - hw - 20, -260, cx + hw + 20, -30))
    parts = [
        rect(cx - hw, -230, cx + hw, -26),                                                  # 竖画往下接长
        rect(cx - hw - 15.5, -132, cx + hw + 15.5, -104),                                   # 套箍
        poly([(cx - hw, -228), (cx + hw, -228), (cx + hw, -262), (cx - hw, -362)]),         # 斜尖：右高左低一刀切
    ]
    s.g.anchors['rod_tip'] = (cx - hw, -362)
    s.g.anchors['rod_x'] = (cx, 0)
    return union(p, *parts)


def letters(detail='full'):
    """返回排版前的 Title（每个字的手术都挂好了）。detail='small' 给小形态：不切分缝、不出长刀和液压杆。"""
    T = Title(FONT, TEXT, STROKES)
    big = detail == 'full'

    # ---- 呼应：所有的点 → 雨刃；「夜」亠的点拿掉，那里放全件唯一的星
    T.s('夜1').variant(None)
    T['夜'].anchors['star'] = (456, 812)
    T.q(type='点').exclude('夜1').variant(rain_shard)

    # ---- 方言 3：装甲鳍（「雨」的横梁要接到「夜」上，那个三角去掉；型的第二横、土的上横没有地方拔高）
    T.q(lambda s: serif_apex(s) is not None).exclude('雨1', '型2', '型7').op(fin, dx=FIN[0], dy=FIN[1])

    # ---- 方言 2：收笔朝下、末端空着的竖 → 一刀斜切（「甲」右竖往外切；中竖是液压杆）
    feet = T.q(end='down', free=True).exclude('甲5')
    feet.exclude('甲2').op(foot, slant=-1)
    T.s('甲2').op(foot, slant=1)

    # ---- 雨：右上的三角去掉，横梁拉长、左端削成一刀斜尖
    T['雨'].op(lambda p: diff(p, poly([(760, 735), (1000, 735), (1000, 900), (760, 900)])))
    T['雨'].op(lambda p: union(p, rect(28, 739, 950, 767)))
    T['雨'].op(lambda p: union(diff(p, rect(-10, 730, 44, 780)), poly([(44, 767), (44, 739), (-90, 750)])))

    # ---- 港：提重画——起笔的小顿、斜切的字脚、往右上挑出去的一把直刃
    T.s('港3').variant(poly([(30, 217), (30, 199), (82, 182), (88, -108), (244, -22), (224, 158),
                              (326, 676), (110, 236), (75, 217)]))

    # ---- 机：竖弯钩的圆底角 → 45° 倒角
    T['机'].op(lambda p: diff(p, poly([(690, 30), (690, -90), (810, -90)])))

    if big:
        # 长撇、横撇的收尾顺着收笔方向拉成斜切刃口的长刀；机的弯钩往右上挑成一把天线刃
        T.q(tag='长撇').add(lambda s: stroke_blade(s, back=0.2, ext=110, widths=(90, 54, 20), tip_len=44))
        T.s('夜6').add(lambda s: stroke_blade(s, back=0.1, ext=110, widths=(76, 44, 14), tip_len=34))
        T.s('机6').add(lambda s: stroke_blade(s, back=0.11, ext=150, bend=-16, widths=(90, 54, 18), tip_len=60))
        # 高潮：甲的中竖 → 液压杆
        T.s('甲5').op(rod)

    # ---- 全组：横画加厚 → 曲线刻面
    T.op(thicken_h, d=THICK)
    T.op(facet, tol=FACET_TOL)

    # ---- 构造规则：粗竖上的折线分缝（最后切，先切会被加厚填上）
    if big:
        T.s('雨4').op(seam, t=T.s('雨4').at_y(330), w=11)
        T.s('港12').op(seam, t=T.s('港12').at_y(150), w=11, at=-0.12)
        T.s('巨4').op(seam, t=T.s('巨4').at_y(420), w=12)
        T.s('巨2').op(seam, t=T.s('巨2').at_y(345), w=12)
        T.s('型6').op(seam, t=T.s('型6').at_y(620), w=12)
        T.s('机2').op(seam, t=T.s('机2').at_y(250), w=12)
    return T

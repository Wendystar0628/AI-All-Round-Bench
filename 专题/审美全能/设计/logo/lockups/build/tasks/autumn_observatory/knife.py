"""02 秋庭观星画室 · 刻本木版宋的刀法（本题自己的笔画构造，字体单位，y 朝上）。

木版是刻刀一刀刀刻出来的：刀顺着大弧走得圆，收刀处见棱角；刀刻不出发丝，横画要留够宽。
  sharpen(p, max_len)      刀只削短弯：控制多边形短于 max_len 的曲线段（竖的圆脚、点尾、横末三角的勾、撇的圆尖、转角的小圆）
                           换成一刀直线，长的撇、捺、钩的大弯原样留着。和均匀切段的刻面不同：只动收刀处，字仍是宋体的弧
  thicken(p, d)            横画上下各加 d：刀刻不出发丝
（点换圆珠在 letters.py：每个点按一块手框的多边形整块拿掉，再补一颗圆，见 DOT_CUT、BEADS）
"""
import math
from pathops import Path, PathVerb
from lockupkit.geom import union, move


def sharpen(p, max_len=150.0):
    out = Path()
    last = None
    for verb, pts in p:
        if verb == PathVerb.MOVE:
            out.moveTo(*pts[0])
            last = pts[0]
        elif verb == PathVerb.LINE:
            out.lineTo(*pts[0])
            last = pts[0]
        elif verb in (PathVerb.QUAD, PathVerb.CUBIC):
            ctrl = [last] + list(pts)
            L = sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(ctrl[:-1], ctrl[1:]))
            if L < max_len:
                out.lineTo(*pts[-1])
            elif verb == PathVerb.QUAD:
                out.quadTo(*pts[0], *pts[1])
            else:
                out.cubicTo(*pts[0], *pts[1], *pts[2])
            last = pts[-1]
        elif verb == PathVerb.CLOSE:
            out.close()
    return union(out)


def thicken(p, d, steps=4):
    ps = [p]
    for i in range(1, steps + 1):
        k = d * i / steps
        ps += [move(p, 0, k), move(p, 0, -k)]
    return union(ps)

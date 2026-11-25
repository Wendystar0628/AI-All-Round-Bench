"""04 · 主体元素：一片晶圆（舞台坐标）。

画法和 1999《真理的暗影》的二十面体一路：线稿为主，线宽 = 本题最细笔画（一根走线宽），颜色只在圆里面。
  外缘一道发丝圆（浅金），里面一道更暗的边缘禁区线；一道 V 形定位缺口；
  一张浅浅的晶粒方格（切割道），圆边上切不完整的那一圈晶粒更暗；不画准线、不画十字。
放法：放在 B200 后面偏右，第二个 0 和「网页」压住它的下半，圆顶顶出整块剪影的上沿。
"""
import math
from lockupkit.geom import union, diff, inter, poly, rect, circle, ring


def wafer(c, r, hair, cell=21.0, notch_deg=-50.0):
    cx, cy = c
    e = {'c': (cx, cy), 'r': r}
    # 缺口：V 形，朝圆心切进去
    a = math.radians(notch_deg)
    ux, uy = math.cos(a), math.sin(a)
    tx, ty = -uy, ux
    depth, half = 9.0, 6.5
    tip = (cx + ux * (r - depth), cy + uy * (r - depth))
    notch = poly([(cx + ux * (r + 4) + tx * half * 1.5, cy + uy * (r + 4) + ty * half * 1.5), tip,
                  (cx + ux * (r + 4) - tx * half * 1.5, cy + uy * (r + 4) - ty * half * 1.5)])
    disc = diff(circle(cx, cy, r), notch)
    e['disc'] = disc
    e['notch'] = {'tip': tip, 'deg': notch_deg}
    # 外缘发丝（沿着缺口拐进去）
    e['rim'] = union(diff(ring(cx, cy, r - hair, r), notch), inter(diff(_notch_edge(notch, hair), notch), circle(cx, cy, r)))
    # 边缘禁区线
    e['excl'] = ring(cx, cy, r - 9.5 - hair * 0.35, r - 9.5)
    # 晶粒方格：切割道是细线，晶粒是格子；完整的晶粒和边上切残的分开
    inner_r = r - 12
    x0 = cx - cell * math.floor(r / cell) - cell * 0.5
    y0 = cy - cell * math.floor(r / cell) - cell * 0.5
    n = int(2 * r / cell) + 3
    whole, partial = [], []
    for i in range(n):
        for j in range(n):
            xa, ya = x0 + i * cell, y0 + j * cell
            corners = [(xa, ya), (xa + cell, ya), (xa, ya + cell), (xa + cell, ya + cell)]
            inside = sum((qx - cx) ** 2 + (qy - cy) ** 2 <= inner_r ** 2 for qx, qy in corners)
            if inside == 4:
                whole.append((xa, ya))
            elif inside > 0:
                partial.append((xa, ya))
    e['cell'] = cell
    e['dies'] = whole
    e['partial'] = partial
    g = 1.1     # 切割道的宽
    e['die_shapes'] = union([rect(xa + g, ya + g, xa + cell - g, ya + cell - g) for xa, ya in whole])
    e['partial_shapes'] = inter(union([rect(xa + g, ya + g, xa + cell - g, ya + cell - g) for xa, ya in partial]), circle(cx, cy, inner_r))
    return e


def _notch_edge(notch, w):
    """缺口两条边的发丝"""
    from lockupkit.geom import stroke_line
    pts = []
    for verb, ps in notch:
        if ps:
            pts.append(ps[-1])
    pts = pts[:3]
    return stroke_line(pts, w * 2, cap='butt', join='miter')

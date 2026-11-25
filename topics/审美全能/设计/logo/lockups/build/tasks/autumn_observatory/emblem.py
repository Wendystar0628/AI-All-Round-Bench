"""02 秋庭观星画室 · 主体元素：浑天仪（舞台坐标）。

放法：把一个字包住——浑天仪的球心落在「星」的日上方，三道环把「星」的头（日）包在中间，「生」像它的底座；
最外的子午环和极轴顶上的圆珠顶出整件剪影的上沿。
  天球    球面印一层靛蓝，右上受光（卡通的三档明暗，硬边明暗交界），印着秋季四边形（飞马座大四边形）和几颗星
  子午环  正面看是一个圆：黄铜环带，内侧刻度（每 5° 一短刻、30° 一长刻）
  赤道环  倾 +20° 的椭圆，发丝；前半圈停一颗朱漆圆珠（行星），后半圈停一颗黄铜小珠
  黄道环  高潮：倾 -15° 的椭圆，前半圈正好穿过「星」日的中心，在日里就是那一道中横（见 __init__ 和 hero 层）；
          环身在日外是发丝，右侧出日后顺切线飞出去，接矢量的 geo.out
  极轴    垂直于赤道环，两端各一根短销，顶上一颗黄铜圆珠
"""
import math
import numpy as np
from lockupkit.geom import union, poly, circle, ring, slab, stroke_line


def rot(v, deg):
    t = math.radians(deg)
    c, s = math.cos(t), math.sin(t)
    return np.array([v[0] * c - v[1] * s, v[0] * s + v[1] * c])


def ell_pt(E, rx, ry, tilt, t):
    """椭圆上参数 t（度）的点：屏幕坐标，t=90 是下面（前半圈的正中），t=270 是上面"""
    tt = math.radians(t)
    return np.asarray(E, float) + rot((rx * math.cos(tt), ry * math.sin(tt)), tilt)


def ell_pts(E, rx, ry, tilt, t0, t1, n=None):
    n = n or max(8, int(abs(t1 - t0) / 1.5))
    return [ell_pt(E, rx, ry, tilt, t0 + (t1 - t0) * i / n) for i in range(n + 1)]


def ell_tangent(E, rx, ry, tilt, t, sign=-1):
    """t 处的切线方向（sign=-1：t 递减的方向，即前半圈从左往右走）"""
    tt = math.radians(t)
    d = rot((-rx * math.sin(tt) * sign, ry * math.cos(tt) * sign), tilt)
    return d / np.linalg.norm(d)


def tapered(pts, widths):
    """沿折线一条变宽的带（每个点一个宽）"""
    pts = [np.asarray(q, float) for q in pts]
    L, R = [], []
    for i, q in enumerate(pts):
        d = pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]
        d = d / (np.linalg.norm(d) + 1e-9)
        n = np.array([-d[1], d[0]])
        L.append(q + n * widths[i] / 2)
        R.append(q - n * widths[i] / 2)
    return poly([tuple(q) for q in L + R[::-1]])


def arc(E, el, t0, t1, w):
    q = ell_pts(E, *el, t0, t1)
    return tapered([tuple(v) for v in q], [w] * len(q))


def armillary(E, R, ecl, hair):
    """E 球心，R 子午环半径，ecl = (rx, ry, tilt) 黄道环，hair 发丝线宽。返回各部件的几何"""
    cx, cy = E
    e = {'E': (float(cx), float(cy)), 'R': R, 'hair': hair}
    # 天球（子午环里面）
    e['disc'] = circle(cx, cy, R - 3.0)
    # 子午环：黄铜环带 + 内侧刻度
    band_w = 7.0
    e['meridian'] = ring(cx, cy, R - band_w / 2, R + band_w / 2)
    ticks = []
    for i in range(72):
        a = math.radians(i * 5 - 90)
        L = 7.5 if i % 6 == 0 else 3.6
        w = 1.4 if i % 6 == 0 else 1.0
        r1 = R - band_w / 2 - 0.6
        ticks.append(slab((cx + (r1 - L) * math.cos(a), cy + (r1 - L) * math.sin(a)), (cx + r1 * math.cos(a), cy + r1 * math.sin(a)), w))
    e['ticks'] = union(ticks)
    # 子午环上的刻线（环带中间一圈细的暗线，像车出来的槽）
    e['groove'] = ring(cx, cy, R - 0.45, R + 0.45)
    # 赤道环
    eq = (R, R * 0.34, 20.0)
    e['eq'] = eq
    e['eq_back'] = arc(E, eq, 180, 360, hair * 0.8)
    e['eq_front'] = arc(E, eq, 0, 180, hair * 0.8)
    # 黄道环（高潮）：后半圈发丝在球后；前半圈在 __init__ 里按「星」的两竖分段
    e['ecl'] = ecl
    e['ecl_back'] = arc(E, ecl, 180, 360, hair)
    # 极轴：垂直于赤道环
    ax = rot((0, -1), eq[2])
    e['axis_dir'] = ax
    top0, top1 = np.array(E) + ax * (R + band_w / 2), np.array(E) + ax * (R + 22)
    bot0, bot1 = np.array(E) - ax * (R + band_w / 2), np.array(E) - ax * (R + 14)
    e['pins'] = union(slab(tuple(top0), tuple(top1), 3.2), slab(tuple(bot0), tuple(bot1), 3.2),
                      slab(tuple(top1 - ax * 3), tuple(top1 + ax * 0.5), 7.5))   # 顶上一道小箍
    tb = np.array(E) + ax * (R + 30)
    e['finial'] = (float(tb[0]), float(tb[1]), 8.0)
    # 环上的珠：赤道环前半圈一颗朱漆（行星），后半圈一颗黄铜小珠；黄道环后半圈一颗黄铜小珠
    p1 = ell_pt(E, *eq, 148)
    p2 = ell_pt(E, *eq, 292)
    p3 = ell_pt(E, *ecl, 238)
    e['planets'] = [(float(p1[0]), float(p1[1]), 7.5, 'lit'), (float(p2[0]), float(p2[1]), 4.6, 'brass'),
                    (float(p3[0]), float(p3[1]), 4.2, 'brass')]
    # 秋季四边形（飞马座大四边形）和仙女座的一串：印在天球左上没被字挡住的地方
    sq = [(-86, -40), (-50, -70), (-20, -36), (-56, -8)]
    chain = [(-50, -70), (-30, -96), (-2, -104), (24, -98)]
    e['stars'] = [(cx + x, cy + y) for x, y in sq + chain[1:]]
    e['constellation'] = union(stroke_line([(cx + x, cy + y) for x, y in sq + sq[:1]], 0.9, closed=False),
                               stroke_line([(cx + x, cy + y) for x, y in chain], 0.9))
    return e

"""08 雨夜港口的巨型机甲 · 主体元素：破浪者德尔塔胸口的炉心（舞台坐标）。

正面看：刻度外环（压在「甲」前面）、刻字环带、亮钢圈、八块装甲环板（每块一颗六角螺栓）、十六片涡轮叶、德尔塔三角的炉芯。
放法：插在第一段末尾，「口」的上横伸出去的钢杆插进刻字环，下缘被「甲」压住一点，顶出整块剪影的上沿。
"""
import math
from lockupkit.geom import union, diff, poly, circle, ring, ngon, slab, arc_band


def emblem(c, R):
    cx, cy = c
    e = {'c': (cx, cy), 'R': R}
    # 外圈：细刻度环（压在字前面）
    e['hair'] = ring(cx, cy, R - 1.3, R)
    ticks = []
    for i in range(120):
        a = math.radians(i * 3 - 90)
        L = 9 if i % 10 == 0 else (5.5 if i % 5 == 0 else 3.2)
        w = 1.3 if i % 10 == 0 else 0.9
        r1 = R - 1.5
        ticks.append(slab((cx + (r1 - L) * math.cos(a), cy + (r1 - L) * math.sin(a)),
                          (cx + r1 * math.cos(a), cy + r1 * math.sin(a)), w))
    for k in range(4):   # 四个方位的小三角，尖朝里
        a = math.radians(k * 90 - 90)
        tip = (cx + (R - 15) * math.cos(a), cy + (R - 15) * math.sin(a))
        b1 = (cx + (R - 1) * math.cos(a - 0.035), cy + (R - 1) * math.sin(a - 0.035))
        b2 = (cx + (R - 1) * math.cos(a + 0.035), cy + (R - 1) * math.sin(a + 0.035))
        ticks.append(poly([tip, b1, b2]))
    e['ticks'] = union(ticks)
    # 刻字环带（深色）；字在 ring 层
    e['band_r'] = (124, 151)
    e['band'] = ring(cx, cy, *e['band_r'])
    e['bezel'] = ring(cx, cy, 116, 123)
    # 装甲环板：八块，缝 4px，外侧两角倒 45°
    plates, bolts, seams = [], [], []
    n, gap, r0, r1 = 8, 4.2, 80, 113
    for i in range(n):
        a0 = i * 360 / n - 90 + 360 / n / 2
        a1 = a0 + 360 / n
        da0 = math.degrees(gap / 2 / r1)
        band = arc_band(cx, cy, r0, r1, a0 + da0, a1 - da0)
        for aa, sgn in ((a0 + da0, 1), (a1 - da0, -1)):
            ar = math.radians(aa)
            px, py = cx + r1 * math.cos(ar), cy + r1 * math.sin(ar)
            tx, ty = -math.sin(ar) * sgn, math.cos(ar) * sgn
            rx, ry = math.cos(ar), math.sin(ar)
            band = diff(band, poly([(px + rx * 2, py + ry * 2), (px - rx * 10, py - ry * 10), (px + tx * 10 + rx * 2, py + ty * 10 + ry * 2)]))
        plates.append(band)
        am = math.radians((a0 + a1) / 2)
        bolts.append({'c': (cx + 97 * math.cos(am), cy + 97 * math.sin(am)), 'r': 5.2, 'rot': (a0 + a1) / 2})
        a = math.radians(a0)
        seams.append({'pts': [(cx + (r0 - 2) * math.cos(a), cy + (r0 - 2) * math.sin(a)),
                              (cx + (r1 + 2) * math.cos(a), cy + (r1 + 2) * math.sin(a))], 'w': gap})
    e['plates'] = union(plates)
    e['bolts'] = union([ngon(b['c'][0], b['c'][1], b['r'], 6, b['rot']) for b in bolts])
    e['bolt_holes'] = union([circle(b['c'][0], b['c'][1], b['r'] * 0.38) for b in bolts])
    e['plate_seams'] = seams
    e['under'] = circle(cx, cy, 116)
    # 涡轮叶：十六片斜叶，单独一层（入场时转半圈）
    vanes = []
    rv0, rv1 = 44, 77
    for i in range(16):
        a = i * 360 / 16
        pts = []
        for r_, da in ((rv0, -5.0), (rv1, 5.0), (rv1, 21.5), (rv0, 7.0)):
            ar = math.radians(a + da + 24 * (r_ - rv0) / (rv1 - rv0))
            pts.append((cx + r_ * math.cos(ar), cy + r_ * math.sin(ar)))
        vanes.append(poly(pts))
    e['vanes'] = union(vanes)
    e['vane_hub'] = ring(cx, cy, 38, 45)
    e['vane_rim'] = ring(cx, cy, 77, 81)
    # 炉芯：德尔塔三角（尖朝上）
    tri_r = 33
    tri = [(cx + tri_r * math.cos(math.radians(-90 + k * 120)), cy + tri_r * math.sin(math.radians(-90 + k * 120))) for k in range(3)]
    e['delta'] = diff(poly(tri), poly([(cx + (tri_r - 5.5) * math.cos(math.radians(-90 + k * 120)),
                                        cy + (tri_r - 5.5) * math.sin(math.radians(-90 + k * 120))) for k in range(3)]))
    e['core_r'] = 38
    return e

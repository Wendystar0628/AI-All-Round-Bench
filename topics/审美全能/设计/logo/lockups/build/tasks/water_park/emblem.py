"""07 晴空水上乐园 · 主体元素：LIDO 的 O 是一只救生圈（舞台坐标）。

放法：当英文的末字母（报告 2.3 的“当英文字母”，像 1999 把 SHINING 的 S 画成月牙），比 LID 高出一截，顶出剪影。
画法：也是砖拼的，但砖顺着圆一圈圈排（马赛克的“走向”，andamento），三圈；八段珊瑚橙和白相间（每段 45°，
珊瑚段在上下左右），段和段的交界按砖走成台阶。一根深青的绳子（线宽 = 砖缝宽）在圈外四处缠住、之间往外垂，
缠住的地方压三道绳、外面一颗方珠。
"""
import math
from lockupkit.geom import union, poly, stroke_line
from .letters import P, GROUT


def _sector(c, r0, r1, a0, a1, steps=4):
    cx, cy = c
    out = [(cx + r1 * math.cos(a0 + (a1 - a0) * k / steps), cy + r1 * math.sin(a0 + (a1 - a0) * k / steps)) for k in range(steps + 1)]
    inn = [(cx + r0 * math.cos(a1 - (a1 - a0) * k / steps), cy + r0 * math.sin(a1 - (a1 - a0) * k / steps)) for k in range(steps + 1)]
    return poly(out + inn)


def ring(c, R=70.0, r=37.0, courses=3):
    """救生圈：{'tiles': [{'path', 'coral', 'course', 'a'}], 'rope', 'wraps', 'beads', 'c', 'R', 'r'}"""
    cx, cy = c
    tiles = []
    t = (R - r) / courses
    for k in range(courses):
        r0, r1 = r + k * t, r + (k + 1) * t
        rm = (r0 + r1) / 2
        n = max(8, int(round(2 * math.pi * rm / P)))
        off = (k % 2) * 0.5                                   # 相邻两圈错开半块，像砌砖
        for i in range(n):
            a0 = 2 * math.pi * (i + off) / n
            a1 = 2 * math.pi * (i + 1 + off) / n
            ga = GROUT / 2 / rm
            am = (a0 + a1) / 2
            seg = int(math.floor((math.degrees(am) + 22.5) % 360 / 45))    # 0 = 右，逆着屏幕顺时针数
            tiles.append({'path': _sector(c, r0 + GROUT / 2, r1 - GROUT / 2, a0 + ga, a1 - ga), 'coral': seg % 2 == 0,
                          'course': k, 'a': am, 'r': rm})
    # 绳子：在白段的正中缠住（45°、135°、225°、315°），之间往外垂
    att = [math.radians(a) for a in (45, 135, 225, 315)]
    rope = []
    for q in range(4):
        a0, a1 = att[q], att[(q + 1) % 4] + (2 * math.pi if q == 3 else 0)
        pts = []
        for s in range(41):
            u = s / 40
            a = a0 + (a1 - a0) * u
            rr = R + 2.6 + 6.5 * math.sin(math.pi * u) ** 1.4
            pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
        rope.append(stroke_line(pts, GROUT * 1.1, cap='butt', join='bevel'))
    wraps, beads = [], []
    for a in att:
        for d in (-0.07, 0.0, 0.07):
            aa = a + d
            wraps.append(stroke_line([(cx + (r - 1.5) * math.cos(aa), cy + (r - 1.5) * math.sin(aa)),
                                      (cx + (R + 3.0) * math.cos(aa), cy + (R + 3.0) * math.sin(aa))], GROUT * 1.1, cap='butt'))
        bx, by = cx + (R + 6.5) * math.cos(a), cy + (R + 6.5) * math.sin(a)
        beads.append(_rot_square(bx, by, 2.9, a))
    return {'tiles': tiles, 'rope': union(rope), 'wraps': union(wraps), 'beads': union(beads), 'c': c, 'R': R, 'r': r}


def _rot_square(x, y, h, a):
    c, s = math.cos(a), math.sin(a)
    return poly([(x + (dx * c - dy * s), y + (dx * s + dy * c)) for dx, dy in ((-h, -h), (h, -h), (h, h), (-h, h))])

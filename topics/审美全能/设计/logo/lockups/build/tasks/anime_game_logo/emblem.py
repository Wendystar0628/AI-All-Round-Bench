"""10 二次元游戏Logo · 主体元素：套准靶标（舞台坐标）。

放法：落在 Logo 右上角——商标注册号 ® 的位置。英文里两样都叫 registration mark：标志右上角的那枚 ®，和印刷校样上的套准靶标。
这里把 ® 换成校样上的套准靶标，和 Logo 同一种烫印箔。

构造（从外往里）：一圈发丝外环（每 6° 一根细刻度，每 30° 长一根）· 一圈粗环（Didone 的粗）·
四个方位的楔形缺口（尖朝圆心）· 分成四象限的靶心（左上、右下两块实，另两块空：分色校样上的靶标）·
十字准线穿过全部，四头收成针尖（横准线往右的那一头就是伸进画面的那根线，走矢量 geo.out）。
"""
import math
from lockupkit.geom import union, diff, ring, poly, slab, arc_band
from . import draw as D


def target(c, R, hair):
    cx, cy = c
    e = {'c': (cx, cy), 'R': R}
    r_hair = R                     # 发丝外环
    r_band = (R * 0.70, R * 0.80)  # 粗环
    r_core = R * 0.52              # 四象限靶心
    e['hair_ring'] = ring(cx, cy, r_hair - hair, r_hair)
    ticks = []
    for i in range(60):
        a = math.radians(i * 6 - 90)
        L = R * (0.11 if i % 5 == 0 else 0.055)
        w = hair * (1.0 if i % 5 == 0 else 0.7)
        r0 = r_hair - hair * 0.5
        ticks.append(D.needle((cx + r0 * math.cos(a), cy + r0 * math.sin(a)), w * 1.6,
                              (-math.cos(a), -math.sin(a)), L))
    e['ticks'] = union(ticks)
    band = ring(cx, cy, *r_band)
    # 四个方位的楔形缺口：从粗环外沿往里切一刀三角（尖朝圆心）
    notches = []
    for k in range(4):
        a = math.radians(k * 90 - 90)
        ux, uy = math.cos(a), math.sin(a)
        vx, vy = -uy, ux
        tip = (cx + ux * (r_band[0] - 1), cy + uy * (r_band[0] - 1))
        o = r_band[1] + 1
        notches.append(poly([tip, (cx + ux * o + vx * R * 0.07, cy + uy * o + vy * R * 0.07),
                             (cx + ux * o - vx * R * 0.07, cy + uy * o - vy * R * 0.07)]))
    e['band'] = diff(band, notches)
    # 靶心：四象限，左上、右下两块实；外面一圈发丝
    q1 = arc_band(cx, cy, 0.001, r_core, 180, 270)
    q2 = arc_band(cx, cy, 0.001, r_core, 0, 90)
    e['core'] = union(q1, q2)
    e['core_ring'] = ring(cx, cy, r_core - hair * 0.8, r_core)
    # 十字准线：发丝，上、下、左三头收成针尖；右头不收尖，停在外环外一点——伸进画面的那根线（矢量 geo.out）从这里接着往右走
    ext = R * 1.42
    arms = []
    for (dx, dy) in ((-1, 0), (0, 1), (0, -1)):
        a1 = (cx + dx * (ext - R * 0.2), cy + dy * (ext - R * 0.2))
        arms.append(slab((cx, cy), a1, hair))
        arms.append(D.needle(a1, hair, (dx, dy), R * 0.2))
    e['out_x'] = cx + R * 1.18
    arms.append(slab((cx, cy), (e['out_x'], cy), hair))
    e['cross'] = union(arms)
    e['ext'] = ext
    return e

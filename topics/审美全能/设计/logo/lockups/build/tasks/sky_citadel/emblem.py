"""05 天穹圣城 · 主体元素：晨光圣轮（舞台坐标，y 朝下）。

一轮刚升到穹顶后面的太阳，画成巴洛克祭坛上的“荣光”（gloria）：
  日轮      两道发丝同心环，只有地平线以上那半圈（下半圈沉在城下）；环上一圈小珠，正对每一道光刃；
  日面      环里一圈极细的放射线（铜版的刻线），只在穹顶周围露出来；
  光刃      十三把两头尖的鎏金光刃，长短相间；光刃的尖连起来是一道尖拱（哥特的尖顶），正上方最长、顶出剪影；
            每把光刃沿中脊分两个面（受光一面亮、背光一面暗），和「穹」同料；
  发丝光    光刃之间各一根发丝光，比短刃长。
放法：放在「穹」后面，圆心是穹顶的鼓座中心，穹顶正好坐在日轮里。线宽 = 本题字的最细笔画。
"""
import math
from lockupkit.geom import union, diff, poly, circle, ring, Path


def blade(c, ang, r0, r1, w, k=0.3):
    """一把两头尖的光刃：从半径 r0 到 r1，在 k 处最宽（w）。返回 (左半面, 右半面)（沿中脊分开，屏幕坐标）"""
    cx, cy = c
    ux, uy = math.cos(ang), math.sin(ang)
    nx, ny = -uy, ux
    a = (cx + ux * r0, cy + uy * r0)
    b = (cx + ux * r1, cy + uy * r1)
    m = r0 + (r1 - r0) * k
    p = (cx + ux * m + nx * w / 2, cy + uy * m + ny * w / 2)
    q = (cx + ux * m - nx * w / 2, cy + uy * m - ny * w / 2)
    return poly([a, p, b]), poly([a, b, q])


def hair_ray(c, ang, r0, r1, w0, w1):
    cx, cy = c
    ux, uy = math.cos(ang), math.sin(ang)
    nx, ny = -uy, ux
    pts = [(cx + ux * r0 + nx * w0 / 2, cy + uy * r0 + ny * w0 / 2), (cx + ux * r1 + nx * w1 / 2, cy + uy * r1 + ny * w1 / 2),
           (cx + ux * r1 - nx * w1 / 2, cy + uy * r1 - ny * w1 / 2), (cx + ux * r0 - nx * w0 / 2, cy + uy * r0 - ny * w0 / 2)]
    return poly(pts)


def arc_line(c, r, w, a0, a1, n=120):
    """一段发丝圆弧（屏幕角度，度）"""
    cx, cy = c
    out, inn = [], []
    for i in range(n + 1):
        t = math.radians(a0 + (a1 - a0) * i / n)
        out.append((cx + (r + w / 2) * math.cos(t), cy + (r + w / 2) * math.sin(t)))
        inn.append((cx + (r - w / 2) * math.cos(t), cy + (r - w / 2) * math.sin(t)))
    return poly(out + inn[::-1])


def gloria(c, R, top_y, hair, horizon_y=None, spread=78, n=13):
    """c 圆心（穹顶的鼓座中心）、R 日轮半径、top_y 最长那把光刃的尖不高过它、hair 线宽。
    spread 光刃张开的半角（度，从正上方量）。返回各部分的 Path 和锚点"""
    cx, cy = c
    e = {'c': c, 'R': R}
    a0, a1 = 180 + (90 - spread), 360 - (90 - spread)       # 屏幕角度：270 是正上方
    # 日轮：两道发丝环（只要地平线以上）
    e['rings'] = union(arc_line(c, R, hair * 0.9, 180, 360), arc_line(c, R + 7, hair * 0.45, 180, 360))
    # 日面：细放射线
    fine = []
    for i in range(0, 91):
        ang = 180 + i * 2
        fine.append(hair_ray(c, math.radians(ang), R * 0.42, R - 4, 0.55, 0.9))
    e['face'] = union(fine)
    # 光刃
    Lmax = cy - top_y - (R + 11)
    lit, shade, tips, beads, hairs = [], [], [], [], []
    for i in range(n):
        t = i / (n - 1)
        ang = a0 + (a1 - a0) * t
        off = abs(ang - 270) / spread                          # 0 正上方，1 两端
        env = (1 - off ** 1.7) ** 0.85                          # 尖拱：顶上长、两侧收
        long_ = i % 2 == 0
        L = Lmax * (0.42 + 0.58 * env) * (1.0 if long_ else 0.52)
        r0 = R + 11
        r1 = r0 + L
        w = (9.0 if long_ else 6.0) * (0.8 + 0.2 * env)
        L_, R_ = blade(c, math.radians(ang), r0, r1, w, 0.16)
        # 光从右上来：朝右的那一半是受光面
        if math.cos(math.radians(ang + 90)) >= 0:
            lit.append(R_); shade.append(L_)
        else:
            lit.append(L_); shade.append(R_)
        tips.append((cx + math.cos(math.radians(ang)) * r1, cy + math.sin(math.radians(ang)) * r1))
        beads.append(circle(cx + math.cos(math.radians(ang)) * (R + 3.5), cy + math.sin(math.radians(ang)) * (R + 3.5),
                            hair * (0.95 if long_ else 0.7)))
        if i < n - 1:
            am = math.radians(ang + (a1 - a0) / (n - 1) / 2)
            hl = Lmax * (0.30 + 0.62 * (1 - (abs(math.degrees(am) - 270) / spread) ** 1.7) ** 0.85) * 0.78
            hairs.append(hair_ray(c, am, R + 10, R + 10 + hl, hair * 0.7, 0.4))
    e['lit'], e['shade'] = union(lit), union(shade)
    e['blades'] = union(e['lit'], e['shade'])
    e['beads'] = union(beads)
    e['hairs'] = union(hairs)
    e['tips'] = tips
    e['top'] = min(y for _, y in tips)
    return e

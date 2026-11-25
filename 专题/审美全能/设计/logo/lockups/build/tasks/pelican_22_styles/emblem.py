"""06 鹈鹕 · 主体元素：一枚蘸水笔尖，拉出一根贝塞尔曲线（舞台坐标，y 朝下）。

笔尖是一片黑卡纸剪的（本题不用金属）：圆筒的笔身（受光的半边是一片灰一档的纸，边上一线纸白的亮）、两肩的切口、
心形的透气孔和一道笔缝（剪穿了，露出下面的纸）、笔身上压的刻印 PELICAN · No 22，笔尖上一点湿墨的亮。
放法：当连接件——它画出的那根线从「鹈」脚下起笔，托着英文一路起伏到「法」后面的笔尖；笔尖就是这根路径的当前锚点，
锚点上一对红手柄，一根朝来路、一根朝下，朝下的那根就是伸进画面的线（矢量 geo.out）。
线的语言就是 SVG 编辑器的“线加圆点”：曲线本身是墨线，锚点是空心小方块，选中的锚点实心，手柄是细线加圆点。
"""
import math
import numpy as np
from lockupkit.geom import union, diff, poly, circle, rect, rotate_about, move, glyph, font
from lockupkit import paths


def _local(pts, tip, deg):
    """笔尖自己的坐标（尖在原点，笔身朝 -y）→ 舞台：转 deg（顺时针为正），尖放到 tip"""
    t = math.radians(deg)
    c, s = math.cos(t), math.sin(t)
    return [(tip[0] + x * c - y * s, tip[1] + x * s + y * c) for x, y in pts]


def _mirror(half):
    """右半边的点（从尖往后）镜像出整圈"""
    return half + [(-x, y) for x, y in half[::-1]]


def nib(tip, deg, L=250.0, Wd=29.0):
    """返回笔尖的各片（舞台坐标）：白卡纸的笔身、蘸了墨的前半截（黑纸，波浪的墨线）、透气孔、笔缝、肩口、压痕、刻印"""
    T = lambda pts: _local(pts, tip, deg)
    k = L / 250.0
    w = Wd
    # 右半边轮廓：尖 → 齿 → 肩 → 笔身 → 尾
    half = [(0.0, 0.0), (1.8, -8 * k), (5.5 * k, -38 * k), (10.5 * k, -76 * k), (16 * k, -112 * k), (21.5 * k, -142 * k),
            (26 * k, -162 * k), (w, -174 * k), (w, -246 * k), (w * 0.62, -250 * k)]
    e = {'outline': poly(T(_mirror(half)))}
    # 背光的半边（右）：灰一档的一片纸
    shade = [(1.6, -14 * k), (5.2 * k, -38 * k), (10 * k, -76 * k), (15.4 * k, -112 * k), (20.8 * k, -142 * k), (25.2 * k, -162 * k),
             (w - 0.8, -174 * k), (w - 0.8, -245 * k), (w * 0.55, -248.5 * k), (9.0, -247 * k), (8.0, -176 * k), (3.0, -120 * k)]
    e['shade'] = poly(T(shade))
    # 受光一侧的一线亮（圆筒的棱）
    e['rim'] = poly(T([(-w + 2.0, -180 * k), (-w + 4.4, -180 * k), (-w + 4.6, -243 * k), (-w + 2.2, -243 * k)]))
    # 蘸了墨的前半截：一片黑纸，后沿是墨的波浪线，从左肩斜到右齿
    ink = [(0.0, 0.0), (2.2, -9 * k), (6.6 * k, -40 * k), (11.6 * k, -78 * k), (14.5 * k, -96 * k),
           (9 * k, -101 * k), (3 * k, -96 * k), (-3 * k, -100 * k), (-9 * k, -110 * k), (-15.5 * k, -112 * k),
           (-16.5 * k, -112 * k), (-11 * k, -78 * k), (-6 * k, -40 * k), (-2.0, -9 * k)]
    e['ink'] = poly(T(ink))
    e['ink_hi'] = poly(T([(-3.2 * k, -24 * k), (-1.6 * k, -24 * k), (-5.6 * k, -70 * k), (-7.4 * k, -70 * k)]))
    # 心形透气孔 + 笔缝（剪穿）
    hy = -132 * k
    r = 5.6 * k
    heart = union(circle(*T([(-r * 0.62, hy - r * 0.2)])[0], r * 0.78), circle(*T([(r * 0.62, hy - r * 0.2)])[0], r * 0.78),
                  poly(T([(-r * 1.3, hy - r * 0.05), (r * 1.3, hy - r * 0.05), (0, hy + r * 1.55)])))
    slit = poly(T([(-0.85, hy + r), (0.85, hy + r), (0.4, -3 * k), (-0.4, -3 * k)]))
    e['holes'] = union(heart, slit)
    # 两肩的小切口
    e['notches'] = union(poly(T([(w + 1, -172 * k), (w - 6, -176 * k), (w + 1, -180 * k)])),
                         poly(T([(-w - 1, -172 * k), (-w + 6, -176 * k), (-w - 1, -180 * k)])))
    # 笔身中线上的一道压痕（从孔到尾）、尾部一圈压痕
    e['crease'] = union(poly(T([(-0.6, -146 * k), (0.6, -146 * k), (0.6, -238 * k), (-0.6, -238 * k)])),
                        poly(T([(-w + 3, -236 * k), (w - 3, -236 * k), (w - 3, -237.4 * k), (-w + 3, -237.4 * k)])))
    e['imprint'] = imprint(T, k, deg)
    e['tip'] = tip
    e['deg'] = deg
    e['back'] = T([(0, -250 * k)])[0]
    return e


def imprint(T, k, deg):
    """笔身上压的字：PELICAN 顺着笔身，No 22 横在孔上方"""
    f, cmap, gs = font(paths.DIDONE)
    upm = f['head'].unitsPerEm
    out = []
    # PELICAN：沿笔身从孔往尾读，字头朝左（字的基线在中线右边一点）
    size = 8.2 * k
    kk = size / upm
    loc = {'wght': 600}
    gsl = f.getGlyphSet(location=loc)
    word = 'PELICAN'
    ws = [gsl[cmap[ord(ch)]].width * kk for ch in word]
    track = 0.16 * size
    total = sum(ws) + track * (len(word) - 1)
    y = -150 * k
    for ch, w in zip(word, ws):
        g, _ = glyph(paths.DIDONE, ch, loc)
        p = g.transform(kk, 0, 0, -kk, -w / 2, 0)
        p = rotate_about(p, deg - 90, 0, 0)     # 顺着笔身从孔往尾读，字头朝左
        q = T([(-3.2 * k, y - w / 2)])[0]
        out.append(move(p, q[0], q[1]))
        y -= w + track
    return union(out)


def anchor_square(c, s, w):
    """空心锚点：边长 s，线宽 w"""
    x, y = c
    return diff(rect(x - s / 2, y - s / 2, x + s / 2, y + s / 2), rect(x - s / 2 + w, y - s / 2 + w, x + s / 2 - w, y + s / 2 - w))


def handle(a, b, w, r):
    """手柄：从锚点 a 到控制点 b 的细线，末端一颗圆点"""
    a, b = np.array(a, float), np.array(b, float)
    d = b - a
    L = np.linalg.norm(d)
    d = d / L
    n = np.array([-d[1], d[0]]) * w / 2
    line = poly([tuple(a + n), tuple(b - d * r * 0.6 + n), tuple(b - d * r * 0.6 - n), tuple(a - n)])
    return union(line, circle(b[0], b[1], r))

"""08 雨夜港口的巨型机甲 · 英文（舞台坐标）。英文两类字体：Didone（Libre Bodoni）一类，加它开模板桥的喷字。

  背景巨字  BREAKER：Bodoni 粗体开模板桥，喷漆，压在第二段后面，明度贴近底板，被中文挡住上半，下半露出来读得出是一个词
  环字      炉心的刻字环带：上弧 BREAKER · DELTA（字头朝外），下弧 REACTOR · No. 08（字头朝里）
  底线带    IN THE HARBOR RAIN：小型大写拉开字距，嵌在甲板钢轨上
  尺寸      70 M：标在液压杆尖的尺寸线旁（尺寸线是矢量 geo.out，标签由运行时画）
"""
import math
import numpy as np
from lockupkit.geom import glyph, font, union, diff, rect, star4, raster
from lockupkit.latin import text_path, text_on_circle, text_on_circle_in
from lockupkit import paths

DIDONE = paths.DIDONE


def _stem_gap_x(path, y_probe):
    """在 y_probe 这一行上找第一段实心（主竖）的右边缘，用来开模板桥。"""
    b = path.bounds
    W = int(math.ceil(b[2] - b[0])) + 4
    m = raster(path, W, 1, (1, 0, 0, 1, -b[0] + 2, -y_probe + 0.5), ss=4)[0]
    xs = np.where(m > 0.5)[0]
    if len(xs) == 0:
        return None
    run_end = xs[0]
    for x in xs[1:]:
        if x == run_end + 1:
            run_end = x
        else:
            break
    return run_end + b[0] - 2 + 1


def stencil(word, size, x0, base, track=-0.01, wght=700):
    """Bodoni 粗体开模板桥：主竖右边开一道竖缝，A 在顶上开一道，R 的腿和碗之间开一道横桥。返回 {'path', 'x1', 'cap', …}"""
    f, cmap, gs = font(DIDONE)
    k = size / f['head'].unitsPerEm
    loc = {'wght': wght}
    letters = []
    x = x0
    cap = 0.70 * size
    for ch in word:
        g, w = glyph(DIDONE, ch, loc)
        p = g.transform(k, 0, 0, -k, x, base)
        bb = p.bounds
        bridges = []
        if ch in 'BREK':
            gx = _stem_gap_x(p, base - cap * 0.5)
            if gx is not None:
                bridges.append(rect(gx + 1.0, bb[1] - 2, gx + 1.0 + 0.045 * size, bb[3] + 2))
        if ch == 'A':
            mx = (bb[0] + bb[2]) / 2
            bridges.append(rect(mx - 0.02 * size, bb[1] - 2, mx + 0.025 * size, bb[1] + cap * 0.42))
        if ch == 'R':
            bridges.append(rect(bb[0] + (bb[2] - bb[0]) * 0.55, base - cap * 0.5 - 0.02 * size, bb[2] + 2, base - cap * 0.5 + 0.02 * size))
        letters.append(diff(p, *bridges))
        x += w * k + track * size
    return {'path': union(letters), 'x0': x0, 'x1': x, 'base': base, 'size': size, 'cap': cap}


def ring_text(c):
    cx, cy = c
    return {
        'ring': union(text_on_circle(DIDONE, 'BREAKER · DELTA', 15, cx, cy, 131.5, 214, 326, loc={'wght': 600}),
                      text_on_circle_in(DIDONE, 'REACTOR · No. 08', 15, cx, cy, 142, 104, 38, loc={'wght': 600})),
        'stars': union([star4(cx + 137 * math.cos(math.radians(a)), cy + 137 * math.sin(math.radians(a)), 7.5, 0.22) for a in (0, 180)]),
    }


def caps(x, base, size=13.5, track=0.32):
    p, w = text_path(DIDONE, 'IN  THE  HARBOR  RAIN', size, x, base, tracking=track, location={'wght': 500})
    return p, w

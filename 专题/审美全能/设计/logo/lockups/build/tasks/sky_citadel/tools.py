"""05 天穹圣城 · 自用的小工具（标笔画时量字形）。

  python tools.py 穹            打印这个字（思源宋体 Bold）每隔 20 个字体单位一行的实心范围：[(x0, x1), ...]
  python tools.py 穹 v 400 700 20   竖着量：x 从 400 到 700 每隔 20 一列的实心范围 [(y0, y1), ...]
坐标是字体单位（1000 em，y 朝上），和 strokes.py 的 S() 一样。坐标底图（lockup.py --glyphs）看大样，这里取准数。
"""
import os
import sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(os.path.dirname(HERE)))

from lockupkit import paths  # noqa: E402
from lockupkit.geom import glyph, raster  # noqa: E402


def _runs(a):
    out, i, n = [], 0, len(a)
    while i < n:
        if a[i]:
            j = i
            while j < n and a[j]:
                j += 1
            out.append((i, j - 1))
            i = j
        else:
            i += 1
    return out


def slices(ch, mode='h', a=880, b=-120, step=20, font=paths.SONG_BOLD):
    p, _ = glyph(font, ch)
    m = raster(p, 1200, 1200, (1, 0, 0, -1, 100, 1000), ss=1) > 0.5
    if mode == 'h':
        for y in range(a, b, -step):
            print(y, [(x0 - 100, x1 - 100) for x0, x1 in _runs(m[1000 - y])])
    else:
        for x in range(a, b, step):
            print(x, [(1000 - y1, 1000 - y0) for y0, y1 in _runs(m[:, x + 100])])


if __name__ == '__main__':
    args = sys.argv[1:]
    if not args:
        print(__doc__)
    elif len(args) >= 5:
        slices(args[0], args[1], int(args[2]), int(args[3]), int(args[4]))
    else:
        slices(args[0])

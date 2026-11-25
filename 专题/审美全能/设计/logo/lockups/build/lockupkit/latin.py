"""西文：一行字、沿圆排字（舞台像素，y 朝下）。字体是可变字体时用 loc={'wght': 600} 钉字重。

  text_path(字体, 'IN THE HARBOR RAIN', 字号, x, 基线, tracking=0.3, location={'wght': 500}) -> (轮廓, 宽)
  text_on_circle(字体, 'BREAKER · DELTA', 字号, cx, cy, r, 起角, 止角)      上弧：字头朝外，顺时针读
  text_on_circle_in(字体, 'REACTOR · No. 08', 字号, cx, cy, r, 起角, 止角)  下弧：字头朝圆心，从左往右读
  advance(字体, 文字, 字号, tracking) -> 宽
角度用度，0 = 右，90 = 下（屏幕坐标）。
"""
import math
from .geom import glyph, font, union, move, rotate_about, text_path  # noqa: F401  text_path 在 geom 里


def advance(fpath, s, size, tracking=0.0, location=None):
    f, cmap, gs = font(fpath)
    gsl = f.getGlyphSet(location=location) if location else gs
    k = size / f['head'].unitsPerEm
    w = sum(gsl[cmap[ord(ch)]].width * k for ch in s if ord(ch) in cmap)
    return w + tracking * size * max(0, len(s) - 1)


def text_on_circle(fpath, s, size, cx, cy, r, a_start, a_end=None, loc=None, tracking=0.0):
    """沿圆排一圈字：基线在半径 r 上，顺时针读，字头朝外。a_end 给出时把字距撑满 a_start→a_end。"""
    f, cmap, gs = font(fpath)
    k = size / f['head'].unitsPerEm
    gsl = f.getGlyphSet(location=loc) if loc else gs
    widths = [gsl[cmap[ord(ch)]].width * k if ord(ch) in cmap else size * 0.3 for ch in s]
    total = sum(widths) + tracking * size * (len(s) - 1)
    if a_end is not None:
        extra = (math.radians(a_end - a_start) * r - total) / max(1, len(s) - 1)
    else:
        extra = tracking * size
    out = []
    pos = 0.0
    for ch, w in zip(s, widths):
        if ch != ' ' and ord(ch) in cmap:
            g, _ = glyph(fpath, ch, loc)
            ang = math.radians(a_start) + (pos + w / 2) / r
            gl = g.transform(k, 0, 0, -k, -w / 2, 0)
            gl = rotate_about(gl, math.degrees(ang) + 90, 0, 0)
            out.append(move(gl, cx + r * math.cos(ang), cy + r * math.sin(ang)))
        pos += w + extra
    return union(out)


def text_on_circle_in(fpath, s, size, cx, cy, r, a_start, a_end, loc=None):
    """下弧的字：字头朝圆心、从左往右读（角度从 a_start 递减到 a_end）。r 是字的基线半径。"""
    f, cmap, gs = font(fpath)
    k = size / f['head'].unitsPerEm
    gsl = f.getGlyphSet(location=loc) if loc else gs
    widths = [gsl[cmap[ord(ch)]].width * k for ch in s]
    extra = (math.radians(a_start - a_end) * r - sum(widths)) / max(1, len(s) - 1)
    out = []
    pos = 0.0
    for ch, w in zip(s, widths):
        if ch != ' ':
            g, _ = glyph(fpath, ch, loc)
            ang = math.radians(a_start) - (pos + w / 2) / r
            gl = g.transform(k, 0, 0, -k, -w / 2, 0)
            gl = rotate_about(gl, math.degrees(ang) - 90, 0, 0)
            out.append(move(gl, cx + r * math.cos(ang), cy + r * math.sin(ang)))
        pos += w + extra
    return union(out)

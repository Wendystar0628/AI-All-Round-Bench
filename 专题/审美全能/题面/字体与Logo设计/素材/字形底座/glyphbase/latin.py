"""西文辅助：沿基线排一行字、沿圆弧排字。结果都是版面坐标（y 朝下）的 Path。

    p, w = text_line(F, 'Sample Text', 40, x=100, baseline=300, tracking=0.08)    一行字，字号 40，字距 0.08 em
    text_width(F, 'Sample Text', 40, tracking=0.08)                               只算宽
    p = text_on_arc(F, 'ALONG THE ARC', 24, cx, cy, r, 200, 340)                  上弧：字头朝外，顺时针读
    p = text_on_arc(F, 'UNDER THE ARC', 24, cx, cy, r, 160, 20, side='inner')     下弧：字头朝圆心，从左往右读
角度用度，0 = 右，90 = 下（屏幕坐标）。给了止角时把字距撑满起止角之间；不给时按 tracking 排。
F 是 fonts.Font（可变字体先在 Font 里定好轴）；中文也能排，用法一样。
"""
import math
from .fonts import Font
from .geom import Path, place, rotate, move, simplify


def _font(f):
    return Font(f) if isinstance(f, str) else f


def text_width(font, text, size, tracking=0.0, kern=True):
    """一行字的宽（版面单位）"""
    _, w = _font(font).layout(text, tracking, kern)
    return w * size / 1000.0


def text_line(font, text, size, x=0.0, baseline=0.0, tracking=0.0, kern=True, align='left'):
    """沿基线排一行字：返回 (轮廓, 宽)。tracking 以 em 计；kern=True 时用字体自带的字偶距。
    align：left 从 x 起，center 以 x 为中，right 到 x 止。"""
    F = _font(font)
    p, w = F.line(text, tracking, kern)
    k = size / 1000.0
    x0 = x - (w * k if align == 'right' else w * k / 2 if align == 'center' else 0.0)
    return place(p, x0, baseline, size), w * k


def text_on_arc(font, text, size, cx, cy, r, a_start, a_end=None, side='outer', tracking=0.0, kern=True):
    """沿圆弧排字，基线在半径 r 上。
    side='outer'：字头朝外，角度从 a_start 往大走（屏幕上顺时针），适合上弧；
    side='inner'：字头朝圆心，角度从 a_start 往小走，适合下弧（从左往右读）。
    a_end 给出时把字距撑满 a_start→a_end；不给时按 tracking。"""
    F = _font(font)
    pos, total = F.layout(text, tracking if a_end is None else 0.0, kern)
    k = size / 1000.0
    chars = [(c, x * k, F.advance(c) * k if not c.isspace() else 0.0) for c, x in pos]
    extra = 0.0
    if a_end is not None and len(chars) > 1:
        extra = (math.radians(abs(a_end - a_start)) * r - total * k) / (len(chars) - 1)
    sgn = 1.0 if side == 'outer' else -1.0
    out = Path()
    for i, (c, x, w) in enumerate(chars):
        if c.isspace():
            continue
        s = x + i * extra + w / 2
        ang = math.radians(a_start) + sgn * s / r
        g = place(F.outline(c), -w / 2, 0.0, size)
        g = rotate(g, math.degrees(ang) + (90 if side == 'outer' else -90))
        out.addPath(move(g, cx + r * math.cos(ang), cy + r * math.sin(ang)))
    return simplify(out)

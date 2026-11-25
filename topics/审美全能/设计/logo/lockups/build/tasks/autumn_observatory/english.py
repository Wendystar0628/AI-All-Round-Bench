"""02 秋庭观星画室 · 英文（舞台坐标）。一类字体：Didone（Libre Bodoni 正体与斜体）。

  背景巨字  STAR ◉ GAZING：Bodoni 粗体大写，像套色时先印的一块淡版，拆在浑天仪两边（天球是词间的空）；STAR 被「秋庭观」挡住上沿，GAZING 在「画室」上方露出来
  小档      in an autumn garden：Bodoni 斜体，杏色，坐第二段的基线，填第一段下面的空当
  底线带    STARGAZING ATELIER：小型大写拉开字距，坐在底线（一根带圆珠的黄铜发丝）上，右对齐到朱印
  侧边印    朱印里竖排 AUTUMN（新版画角上的版元印），反白
"""
import math
from lockupkit.geom import union, diff, poly, rotate_about, move
from lockupkit.latin import text_path, advance
from lockupkit import paths

DIDONE = paths.DIDONE
ITALIC = paths.DIDONE_I


def ghost(word, size, x0, base, wght=700, track=0.02):
    p, w = text_path(DIDONE, word, size, x0, base, tracking=track, location={'wght': wght})
    return {'path': p, 'x0': x0, 'x1': x0 + w, 'base': base, 'size': size, 'cap': 0.7 * size}


def ghost_split(a, b, size, xa, xb, base, wght=700, track=0.02):
    """两个词分在主体元素两边：a 从 xa 起，b 从 xb 起，同一条基线"""
    pa, wa = text_path(DIDONE, a, size, xa, base, tracking=track, location={'wght': wght})
    pb, wb = text_path(DIDONE, b, size, xb, base, tracking=track, location={'wght': wght})
    return {'path': union(pa, pb), 'x0': xa, 'x1': xb + wb, 'base': base, 'size': size, 'cap': 0.7 * size}


def italic(s, size, x0, base, wght=500):
    p, w = text_path(ITALIC, s, size, x0, base, tracking=0.0, location={'wght': wght})
    return p, w


def caps(s, size, x1, base, track=0.3, wght=500):
    """右对齐到 x1 的小型大写"""
    w = advance(DIDONE, s, size, track, location={'wght': wght})
    p, _ = text_path(DIDONE, s, size, x1 - w, base, tracking=track, location={'wght': wght})
    return p, x1 - w


def seal(x, y_top, w, h, text='AUTUMN', size=11.0):
    """朱印：竖长方，四角各崩掉一点（印泥和刻边），中间竖排反白的字（从上往下读）"""
    body = poly([(x + 1.2, y_top), (x + w, y_top + 0.8), (x + w - 0.6, y_top + h), (x, y_top + h - 1.0)])
    inner = poly([(x + 2.6, y_top + 2.6), (x + w - 2.4, y_top + 2.9), (x + w - 2.7, y_top + h - 2.6), (x + 2.4, y_top + h - 2.9)])
    frame = diff(body, inner)
    tw = advance(DIDONE, text, size, 0.16, location={'wght': 600})
    t, _ = text_path(DIDONE, text, size, 0, 0, tracking=0.16, location={'wght': 600})
    cx, cy = x + w / 2, y_top + h / 2
    t = move(t, -tw / 2, size * 0.35)          # 字的中心放到原点
    t = rotate_about(t, 90, 0, 0)              # 竖排：顺时针转 90°，从上往下读
    t = move(t, cx, cy)
    return {'body': body, 'frame': frame, 'inner': inner, 'text': t}

"""05 天穹圣城 · 英文（舞台坐标）。只用一类字体：Didone（Libre Bodoni），罗马体。

  背景巨字  CIVITAS CAELI（拉丁文“天上之城”）：Didone 大写撑满字块，压在中文下半截后面，明度比底板亮一档、看得见；
            一串 I 像一排柱子，字脚化进下面的云气——一排柱廊浮在云上；
  底线带    A CITY ABOVE THE CLOUDS：小号大写拉开字距，挂在锚链下面那道发丝上（锚链的水晶珠左边一截发丝、右边接字，
            字后是一段珠点线，末端就是伸进画面的那根线的起点）。
"""
from lockupkit.geom import glyph, font, union
from lockupkit.latin import text_path
from lockupkit import paths

DIDONE = paths.DIDONE


def ghost(word, x0, x1, base, size, wght=420):
    """背景巨字：把字距撑满 x0–x1。返回 {'path', 'cap', 'base', 'size', 'letters': [(字母, x, 宽)]}"""
    f, cmap, gs = font(DIDONE)
    k = size / f['head'].unitsPerEm
    loc = {'wght': wght}
    gsl = f.getGlyphSet(location=loc)
    ws = [gsl[cmap[ord(ch)]].width * k for ch in word]
    gaps = len(word) - 1
    track = (x1 - x0 - sum(ws)) / gaps
    out, letters = [], []
    x = x0
    cap = 0.705 * size
    for ch, w in zip(word, ws):
        if ch != ' ':
            g, _ = glyph(DIDONE, ch, loc)
            p = g.transform(k, 0, 0, -k, x, base)
            out.append(p)
            letters.append((ch, x, w))
        x += w + track
    return {'path': union(out), 'cap': cap, 'base': base, 'size': size, 'letters': letters, 'x0': x0, 'x1': x1}


def caps(text, x, base, size=13.5, track=0.34):
    p, w = text_path(DIDONE, text, size, x, base, tracking=track, location={'wght': 520})
    return p, w

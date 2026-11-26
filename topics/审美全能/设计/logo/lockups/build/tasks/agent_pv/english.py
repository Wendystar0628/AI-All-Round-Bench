"""01 现代Agent概念PV · 拉丁字母和英文（舞台坐标）。两类字体：Didone（Libre Bodoni）、终端打字机字（Courier Prime，这一题的戏服字 AE Type）。

  题名里的拉丁字母  Agent（签名词，Bodoni 700，比汉字大一档）、PV（Bodoni 700，和汉字同一档）
  底线带            全片六章的英文章名，小型大写拉开字距，章与章之间一块小方块（光标的同族小形）
  键帽字            回车键上的 RETURN（Courier Prime，键帽上本来就印着的字）
"""
from lockupkit.geom import glyph, union, rect
from lockupkit.latin import text_path
from lockupkit import paths

DIDONE = paths.DIDONE
TYPE = paths.FONTS + '/CourierPrime-Bold.ttf'
CHAPTERS = ['THE PROMPT', 'ATTENTION', 'DECOMPOSITION', 'FIVE MINDS', 'THE LONG RUN', 'DELIVERY']


def word(s, size, x, base, wght=700, track=0.0, kern=None):
    """Bodoni 一个词：返回 (轮廓, 每个字母的 [左, 右] 舞台 x, 末尾 x)"""
    k = size / 1000
    out, spans = [], []
    for i, ch in enumerate(s):
        g, w = glyph(DIDONE, ch, {'wght': wght})
        out.append(g.transform(k, 0, 0, -k, x, base))
        spans.append((x, x + w * k))
        x += w * k + track * size + (kern or {}).get(s[i:i + 2], 0) * size
    return union(out), spans, x


def band(x0, base, size=12.0, track=0.28, gap=None, block=(4.2, 4.2)):
    """底线带：六个章名，章与章之间一块小方块（落在字的半高上）。返回 (字的轮廓, 方块的轮廓, 末尾 x, 每个章名的右端 x)"""
    gap = gap if gap is not None else size * 1.6
    x = x0
    words, blocks, ends = [], [], []
    for i, c in enumerate(CHAPTERS):
        p, w = text_path(DIDONE, c, size, x, base, tracking=track, location={'wght': 500})
        words.append(p)
        x += w
        ends.append(x - track * size)
        if i < len(CHAPTERS) - 1:
            cx = x + gap / 2 - track * size / 2
            bw, bh = block
            blocks.append(rect(cx - bw / 2, base - size * 0.36 - bh / 2, cx + bw / 2, base - size * 0.36 + bh / 2))
            x += gap
    return union(words), union(blocks), x - track * size, ends


def type_line(s, size, x, base, track=0.08):
    p, w = text_path(TYPE, s, size, x, base, tracking=track)
    return p, w

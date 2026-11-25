"""07 晴空水上乐园 · 英文（舞台坐标）。英文两类字体：Didone 一类（砖拼的 LIDO 照它的骨架画，底线带用 Libre Bodoni 小型大写），
加一笔手写（AE Script，Tangerine）。

  LIDO       砖拼的大号英文，退后一层的浅池青；字母照 Didone 画：粗竖三块砖、发丝一块砖、衬线一块砖高的薄板，
             D 的碗右边粗、上下细（竖轴的对比）；O 是主体元素（泳圈），在 emblem.py
  greetings from   一笔深青的手写，斜着压在 LID 的头上（明信片上的那句问候）
  底线带     A SUMMER LAID / TILE BY TILE：小型大写拉开字距，两行叠在「晴」下面的空当里（空隙小词），坐在水线下面，
             水线就是它的那根细线
"""

from lockupkit.geom import union, rotate_about
from lockupkit.latin import text_path
from lockupkit import paths

# 砖拼字母（行从上往下，'X' 是一块砖）。大写高十二块砖：粗竖三块、发丝和衬线一块；L 的脚尾翘起一个喙，D 的碗右边粗、上下细
LETTERS = {
    'L': ['XXXXXX...',
          '.XXX.....',
          '.XXX.....',
          '.XXX.....',
          '.XXX.....',
          '.XXX.....',
          '.XXX.....',
          '.XXX.....',
          '.XXX.....',
          '.XXX....X',
          '.XXX...XX',
          'XXXXXXXXX'],
    'I': ['XXXXX',
          '.XXX.',
          '.XXX.',
          '.XXX.',
          '.XXX.',
          '.XXX.',
          '.XXX.',
          '.XXX.',
          '.XXX.',
          '.XXX.',
          '.XXX.',
          'XXXXX'],
    'D': ['XXXXXXX....',
          '.XXX...XX..',
          '.XXX....XX.',
          '.XXX....XXX',
          '.XXX....XXX',
          '.XXX....XXX',
          '.XXX....XXX',
          '.XXX....XXX',
          '.XXX....XXX',
          '.XXX....XX.',
          '.XXX...XX..',
          'XXXXXXX....'],
}


def lid_cells(col0, row0, gap=1):
    """LID 三个字母的砖 {(i, j): 字母}，左上角在 (col0, row0)；返回 (砖, 右边下一列)"""
    out = {}
    c = col0
    for ch in 'LID':
        rows = LETTERS[ch]
        for dj, r in enumerate(rows):
            for di, v in enumerate(r):
                if v == 'X':
                    out[(c + di, row0 + dj)] = ch
        c += len(rows[0]) + gap
    return out, c


def script(text, x, base, size, angle):
    """手写一行（Tangerine），绕起点转 angle 度（负数往右上扬）"""
    p, w = text_path(paths.SCRIPT, text, size, x, base, tracking=0.0)
    return rotate_about(p, angle, x, base), w


def caps(lines, x, base, size=12.5, track=0.34, lead=20):
    """底线带：小型大写拉开字距，几行叠起，最后一行的基线在 base"""
    out = []
    n = len(lines)
    widths = []
    for k, s in enumerate(lines):
        p, w = text_path(paths.DIDONE, '  '.join(s.split()), size, x, base - (n - 1 - k) * lead, tracking=track,
                         location={'wght': 560})
        out.append(p)
        widths.append(w)
    return union(out), max(widths)

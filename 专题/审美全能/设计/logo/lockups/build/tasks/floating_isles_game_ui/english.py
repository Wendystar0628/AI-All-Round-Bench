"""09 浮空群岛传说游戏UI · 英文（舞台坐标）。英文两类字体：Didone（Libre Bodoni）和像素字（Ark Pixel，全片像素字只在这一题）。

  背景巨字  LEGEND：Bodoni 粗体大写，站在航路那一条上、右半边，明度比底板高一档；宝箱压在 G 前面（学《精灵仍在等待》的 AW◯AITS）
  底线带    PRESS START：像素字小型大写拉开字距，后面一串像素珠点引到「岛」的滴落处，接上航路（游戏菜单里的点线引导）
  小档      of the Floating Isles：Didone 斜体，右对齐坐在 LEGEND 的右肩上（学《湖的启示》REVELATION 上面那行 OF THE WATER）
  光标      「传说」前一个像素三角光标（菜单选中），宝箱金
"""
from lockupkit.geom import union, rect, text_path, move
from lockupkit.latin import advance as _adv
from lockupkit import paths

DIDONE = paths.DIDONE
PIXEL = paths.FONTS + '/ArkPixel-12px-M-zh_cn.ttf'
PX = 1.5          # 像素字的一个像素（舞台像素）：Ark Pixel 12px，字号 = 12 × PX


TRACK = 0.05


def advance(s, size):
    """LEGEND 里一段字母的步进（含字距）"""
    return _adv(DIDONE, s, size, TRACK, {'wght': 700}) + TRACK * size


def legend(x0, base, size=112, track=TRACK):
    p, w = text_path(DIDONE, 'LEGEND', size, x0, base, tracking=track, location={'wght': 700})
    b = p.bounds
    return {'path': p, 'x0': x0, 'x1': x0 + w, 'base': base, 'size': size, 'cap': b[3] - b[1], 'top': b[1]}


def press_start(x0, base, track=0.25):
    """PRESS START：像素字，一个像素 = PX 舞台像素（对齐到像素格）"""
    p, w = text_path(PIXEL, 'PRESS START', 12 * PX, x0, base, tracking=track)
    return p, w


def leader(x0, x1, y, cell=2.4, gap=5.6):
    """像素珠点线：方的小点，点宽等于本题最细的笔画"""
    dots = []
    x = x0
    while x + cell <= x1:
        dots.append(rect(x, y - cell / 2, x + cell, y + cell / 2))
        x += cell + gap
    return union(dots)


def cursor(x, y, c=3.0):
    """像素三角光标 ▶：5 格宽、9 格高（一格 c 舞台像素），尖朝右，(x, y) 是左边的中点"""
    cells = []
    for i in range(5):           # 第 i 列，高 9 - 2i 格
        h = 9 - 2 * i
        cells.append(rect(x + i * c, y - h * c / 2, x + (i + 1) * c, y + h * c / 2))
    return union(cells)


def of_isles(x_right, base, size=19, track=0.02):
    """小档斜体短语，右端对齐 x_right"""
    p, w = text_path(paths.DIDONE_I, 'of the Floating Isles', size, 0, base, tracking=track, location={'wght': 500})
    return move(p, x_right - w, 0)

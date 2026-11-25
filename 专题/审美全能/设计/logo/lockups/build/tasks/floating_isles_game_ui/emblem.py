"""09 浮空群岛传说游戏UI · 主体元素：停在一座小浮石上的像素宝箱（舞台坐标）。

宝箱是一张 26×19 格的像素图（一格 CELL 舞台像素）：拱顶的箱盖、盖上一道金边、两条包边的竖带、四角的包角和铆钉、
跨在盖缝上的锁板和钥匙孔；盖缝里漏出一线金光，箱身上沿被它擦亮。四档宝箱金（和「岛」同一副金）、一格深紫描边。
下面托着一座小浮石：翠绿的草顶两行，倒长的岩底五行收成尖——「岛」那块岩体的小样。
放法：压在 LEGEND 的 G 前面（学《精灵仍在等待》的 AW◯AITS），也是航路的节点：
「岛」滴落处出发的虚线航路落到底线带那一条，往右从这座小浮石后面穿过，再伸进画面。
"""
from lockupkit.geom import union, rect

CELL = 3.0
CW, CH = 26, 19          # 宝箱：宽 26 格、高 19 格

# 格子的颜色代号（layers.py 按它上色）
#   o 描边  1 2 3 4 宝箱金四档（暗 → 亮）  l 盖缝的光  k 钥匙孔  G g 草顶（亮、暗）  R r 岩（受光、背光）  d 岩尖（最暗）
LID_HW = [7, 9, 11, 12, 12.5, 12.5, 12.5]     # 箱盖每一行的半宽（拱顶）


def _chest():
    cells = {}
    cx = (CW - 1) / 2

    def inside(x, y):
        if y < 7:
            return abs(x - cx) <= LID_HW[y]
        return 0 <= x < CW and y < CH

    for y in range(CH):
        for x in range(CW):
            if not inside(x, y):
                continue
            edge = not all(inside(x + dx, y + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))
            strap = x in (5, 6, 19, 20)
            plate = 11 <= x <= 14 and 4 <= y <= 11
            if edge:
                k = 'o'
            elif plate:
                if x in (11, 14) or y in (4, 11):
                    k = '1'
                elif x in (12, 13) and y in (7, 8):
                    k = 'k'
                elif y == 9 and x == 12:
                    k = 'k'
                else:
                    k = '4' if y == 5 else '3'
            elif y < 7:                                   # 箱盖
                if y == 6:
                    k = 'o'
                elif y == 1:
                    k = '4'
                elif y == 3:
                    k = '1' if not strap else '2'         # 盖上一道金边的下沿
                elif strap:
                    k = '2' if y >= 4 else '3'
                else:
                    k = '3' if y == 2 else '2'
            elif y == 7:
                k = 'l'                                   # 盖缝漏出的光
            else:                                         # 箱身
                corner = (x <= 2 or x >= CW - 3) and (y <= 10 or y >= CH - 4)
                rivet = (x, y) in ((1, 9), (CW - 2, 9), (1, CH - 3), (CW - 2, CH - 3))
                if y == 8:
                    k = '4'
                elif rivet:
                    k = '4'
                elif corner:
                    k = '1'
                elif strap:
                    k = '4' if y in (11, 15) else '2'
                elif y == CH - 2:
                    k = '1'
                elif y in (12, 15):
                    k = '2'                               # 木板的缝
                else:
                    k = '3' if 3 <= x <= CW - 4 else '2'
            cells[(x, y)] = k
    return cells


def _islet():
    """小浮石：草顶两行，岩底五行收成尖（比宝箱宽）"""
    rows = [(-3, 28), (-3, 28), (-1, 26), (2, 23), (5, 20), (8, 17), (11, 14)]
    cells = {}
    mid = (CW - 1) / 2
    for i, (a, b) in enumerate(rows):
        y = CH + i
        for x in range(a, b + 1):
            edge = x in (a, b) or i == len(rows) - 1
            if i == 0:
                k = 'o' if x in (a, b) else 'G'
            elif i == 1:
                k = 'o' if x in (a, b) else 'g'
            elif edge:
                k = 'o'
            else:
                k = 'R' if x < mid - 1 else 'r'
                if i >= 5:
                    k = 'd'
            cells[(x, y)] = k
    return cells


def emblem(x0, y0):
    """宝箱左上角在 (x0, y0)；返回 {'cells': [(x, y, w, 代号)…] 舞台坐标, 'shape': 轮廓, 'gap': 盖缝中心, …}"""
    out = {**_islet(), **_chest()}
    c = CELL
    cells = [(x0 + x * c, y0 + y * c, c, k) for (x, y), k in out.items()]
    path = union([rect(x0 + x * c, y0 + y * c, x0 + (x + 1) * c, y0 + (y + 1) * c) for (x, y) in out])
    return {'cells': cells, 'shape': path, 'c': c,
            'gap': (x0 + CW * c / 2, y0 + 7.5 * c), 'chest_box': (x0, y0, x0 + CW * c, y0 + CH * c),
            'center': (round(x0 + CW * c / 2, 1), round(y0 + CH * c / 2, 1)), 'grass_y': y0 + CH * c, 'tip': (x0 + 12.5 * c, y0 + (CH + 7) * c)}


def size():
    return CW * CELL, CH * CELL

"""07 晴空水上乐园 · 笔画处理：方言「马赛克宋」。

不是把字形栅格化（旧版那种像素滤镜），而是按笔画标注把每一笔重新铺在同一张方格上：一格一块砖。
  横    落在一行砖上，一块砖高；横末的宋体三角铺成三块砖的阶梯（左边两块叠起、右边一块，再接横的末砖），
        上面挨着别的笔画放不下时收成两块的一级台阶
  竖    两到三列砖（按原来的宽取整）；起笔空着的竖左上多一块砖（宋体的顿笔），收笔空着的竖右下少一块砖（斜收的脚）
  折    横段一行、竖段几列，转角上的宋体三角同样铺成三块砖的阶梯
  斜段  撇、捺、点、提、钩：沿中线按原来的粗细收成一条台阶，每一级都边挨边（不是只碰角），收尾收到一块砖
所有字共用舞台上的同一张方格（原点在舞台 0,0，砖距 P），字号不同的字砖一样大：大字只是砖多、竖画多一列。
骨架（SKEL）：只动中线的位置，不拉伸笔画。「晴」的日放宽到有太阳的体量，青相应收窄；挤的地方拉开到放得下台阶。
规则铺完以后的视觉修正（撞在一起的地方让开一格、钩的走向）写成每个字的定稿字符图 TARGETS（本文件末尾），
改了哪几块、规则原样是什么，出图时写进检查图目录的 砖格.txt。

高潮：「晴」的日（标签 '日'）是太阳：金砖，四周的墙砖一圈圈染暖（layers.py）。
呼应：标 '滴' 的点（空的宀点、八的点，乐的点）是水滴：池水的玻璃砖，受光处一块白（layers.py）。
构造规则：水线以下的砖整行错开（折射），见 __init__.py 的 shift_of()。
"""
import math
import numpy as np
from lockupkit.strokes import Title
from lockupkit.geom import raster, poly
from lockupkit import paths
from .strokes import STROKES

FONT = paths.SONG_HEAVY
TEXT = '晴空水上乐园'

P = 8.0                     # 砖距（舞台像素）：一块砖 + 砖缝
GROUT = 1.4                 # 砖缝宽（舞台像素）；本题的细线也是这个宽（线 = 砖缝）

# 骨架：字体单位里的分段线性映射（x、y 各一张），只挪中线，不拉宽笔画
SKEL_X = {
    '晴': [(0, 0), (54, 30), (120, 96), (187, 150), (253, 345), (320, 408), (388, 470), (394, 530), (515, 622),
          (583, 675), (674, 752), (777, 840), (845, 900), (987, 1030)],
}
SKEL_Y = {
    '晴': [(-100, -100), (144, 124), (206, 205), (268, 268), (386, 410), (472, 481), (492, 505), (604, 645),
          (714, 790), (730, 800), (790, 830), (840, 880), (900, 920)],
}


def _map(table, ch, v):
    k = table.get(ch)
    if not k:
        return v
    xs, ys = zip(*k)
    return float(np.interp(v, xs, ys))


def _hseg(a, b):
    return abs(b[1] - a[1]) <= 0.35 * abs(b[0] - a[0])


def _vseg(a, b):
    return abs(b[0] - a[0]) <= 0.35 * abs(b[1] - a[1])


def _cols(x0, x1):
    lo, hi = min(x0, x1), max(x0, x1)
    return range(int(math.ceil(lo / P - 0.5)), int(math.floor(hi / P - 0.5)) + 1)


def _taper_poly(pts, ws):
    pts = [np.array(q, float) for q in pts]
    L, R = [], []
    for i, q in enumerate(pts):
        d = pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]
        d = d / (np.linalg.norm(d) + 1e-9)
        n = np.array([-d[1], d[0]])
        L.append(q + n * ws[i] / 2)
        R.append(q - n * ws[i] / 2)
    return poly([tuple(q) for q in L + R[::-1]])


def _cover(path):
    """轮廓盖住每块砖的比例（字典 (i, j) -> 0–1）"""
    b = path.bounds
    i0, j0 = int(math.floor(b[0] / P)) - 1, int(math.floor(b[1] / P)) - 1
    i1, j1 = int(math.ceil(b[2] / P)) + 1, int(math.ceil(b[3] / P)) + 1
    S = 8
    m = raster(path, (i1 - i0) * S, (j1 - j0) * S, (S / P, 0, 0, S / P, -i0 * S, -j0 * S), ss=2)
    cov = m.reshape(j1 - j0, S, i1 - i0, S).mean(axis=(1, 3))
    return {(i0 + int(i), j0 + int(j)): float(cov[j, i]) for j, i in zip(*np.where(cov > 0.02))}


def _stair(cov, thresh=0.45):
    """覆盖够的砖连成台阶：两块只碰角时补上覆盖更多的那一块"""
    S = {c for c, v in cov.items() if v >= thresh}
    if not S and cov:
        S = {max(cov, key=cov.get)}
    add = set()
    for (i, j) in S:
        for di in (-1, 1):
            if (i + di, j + 1) in S and (i + di, j) not in S and (i, j + 1) not in S:
                a, b = (i + di, j), (i, j + 1)
                add.add(a if cov.get(a, 0) >= cov.get(b, 0) else b)
    return S | add


class Mosaic:
    """一个字的砖。cells {(i, j): 笔画 id}，(i, j) 是全局方格的列、行（砖的左上角在舞台 i·P, j·P）；
    deco {(i, j): '衬' | '头'}：宋体特征铺出来的砖。tags(c) 给这块砖所属笔画的标签（'日'、'滴'）"""

    def __init__(self, g):
        self.g = g
        self.cells = {}
        self.deco = {}
        self.stroke_tags = {s.id: set(s.tags) for s in g.strokes}

    def tags(self, c):
        return self.stroke_tags.get(self.cells.get(c), set())

    def bounds(self):
        a = np.array(list(self.cells))
        return int(a[:, 0].min()), int(a[:, 1].min()), int(a[:, 0].max()), int(a[:, 1].max())


def _stage(g, q):
    return g.to_stage((_map(SKEL_X, g.ch, q[0]), _map(SKEL_Y, g.ch, q[1])))


def _plan(g, s):
    """一笔：各段的类型、横段的行、竖段的列"""
    pts = [_stage(g, q) for q in s.axis]
    segs = list(zip(pts[:-1], pts[1:]))
    kinds = ['H' if _hseg(a, b) else ('V' if _vseg(a, b) else 'D') for a, b in segs]
    hrow, vcol = {}, {}
    for k, ((a, b), kd) in enumerate(zip(segs, kinds)):
        if kd == 'H':
            hrow[k] = int(math.floor((a[1] + b[1]) / 2 / P))
        elif kd == 'V':
            n = min(3, max(2, int(math.floor(s.ws[k] * g.k / P + 0.5))))
            i0 = int(round((a[0] + b[0]) / 2 / P - n / 2))
            vcol[k] = list(range(i0, i0 + n))
    return pts, segs, kinds, hrow, vcol


def _body(g, s):
    """一笔的砖（不含宋体特征）"""
    pts, segs, kinds, hrow, vcol = _plan(g, s)
    out = set()
    info = {'segs': segs, 'kinds': kinds, 'hrow': hrow, 'vcol': vcol}
    for k, ((a, b), kd) in enumerate(zip(segs, kinds)):
        if kd == 'H':
            j = hrow[k]
            xa, xb = a[0], b[0]
            if k - 1 in vcol:
                c = vcol[k - 1]
                xa = (c[0] + 0.5) * P if xb > xa else (c[-1] + 0.5) * P
            if k + 1 in vcol:
                c = vcol[k + 1]
                xb = (c[-1] + 0.5) * P if xb > xa else (c[0] + 0.5) * P
            out |= {(i, j) for i in _cols(xa, xb)}
        elif kd == 'V':
            cols = vcol[k]
            j_top = int(math.ceil(min(a[1], b[1]) / P - 0.5))
            j_bot = int(math.floor(max(a[1], b[1]) / P - 0.5))
            if k - 1 in hrow:
                j_top = hrow[k - 1]
            if k + 1 in hrow:
                j_bot = hrow[k + 1]
            out |= {(i, j) for j in range(j_top, j_bot + 1) for i in cols}
            if k == 0:
                info['top'] = (cols, j_top)
            if k == len(segs) - 1:
                info['bot'] = (cols, j_bot)
    diag = [k for k, kd in enumerate(kinds) if kd == 'D']
    if diag:
        ws = s.ws
        wpt = [ws[0]] + [(ws[i - 1] + ws[i]) / 2 for i in range(1, len(ws))] + [ws[-1]]
        if s.type in ('撇', '钩', '折', '提'):
            wpt[-1] = ws[-1] * 0.55
        cov = {}
        for k in diag:
            a, b = segs[k]
            w = [max(wpt[k] * g.k, P * 0.95), max(wpt[k + 1] * g.k, P * 0.95)]
            # 接在竖段、横段后面的斜段：往回伸进去半块砖，台阶和前一段连上
            d = np.array(b) - np.array(a)
            d = d / (np.linalg.norm(d) + 1e-9)
            a2 = tuple(np.array(a) - d * P * 0.5) if k > 0 else a
            for c, v in _cover(_taper_poly([a2, b], w)).items():
                cov[c] = max(cov.get(c, 0), v)
        out |= _stair(cov)
    return out, info


def build_glyph(g):
    """按方言把一个排好版的字铺成砖：先铺笔画，再铺宋体特征（撞到别的笔画就收）"""
    M = Mosaic(g)
    infos = {}
    for s in g.strokes:
        cells, info = _body(g, s)
        infos[s.id] = (s, info)
        for c in cells:
            M.cells.setdefault(c, s.id)

    def free(c, sid):
        """这块砖空着，而且四邻没有别的笔画（留得出一道砖缝）"""
        if c in M.cells and M.cells[c] != sid:
            return False
        for d in ((0, -1), (-1, 0), (1, 0)):
            q = (c[0] + d[0], c[1] + d[1])
            if q in M.cells and M.cells[q] != sid:
                return False
        return True

    def place(cs, sid, kind):
        for c in cs:
            if c not in M.cells:
                M.cells[c] = sid
                M.deco[c] = kind

    for sid, (s, info) in infos.items():
        segs, kinds, hrow, vcol = info['segs'], info['kinds'], info['hrow'], info['vcol']
        # 宋体三角 → 三块砖的阶梯；上面放不下就收成两块
        if '衬' in s.tags:
            if len(segs) > 1 and kinds[0] == 'H' and 1 in vcol:          # 横折：转角上
                j, a = hrow[0], vcol[1][0]
            else:                                                         # 横、横钩、横撇、竖折的横段：末端
                k = max(k for k, kd in enumerate(kinds) if kd == 'H')
                j = hrow[k]
                e = max(i for (i, jj), q in M.cells.items() if q == sid and jj == j)
                a = e - 2
            low = [(a, j - 1), (a + 1, j - 1)]
            if all(free(c, sid) for c in low):
                place(low, sid, '衬')
                if free((a, j - 2), sid) and (a, j - 3) not in M.cells:
                    place([(a, j - 2)], sid, '衬')
        # 竖的起笔：左上多一块
        if '头' in s.tags and 'top' in info:
            cols, jt = info['top']
            c = (cols[0], jt - 1)
            if free(c, sid) and (c[0], c[1] - 1) not in M.cells:
                place([c], sid, '头')
        # 竖的收笔：右下少一块
        if '脚' in s.tags and 'bot' in info:
            cols, jb = info['bot']
            c = (cols[-1], jb)
            if M.cells.get(c) == sid:
                del M.cells[c]
    return M


def letters(detail='full'):
    """排版前的 Title（笔画标注都在上面）；砖在排版后用 build() 铺"""
    return Title(FONT, TEXT, STROKES)


SYM = {'X': None, '@': '日', 'o': '滴', '#': '衬', '^': '头'}


def dump(M):
    """砖的字符图：第一行 c0=最左一列（相对这个字原点所在的砖），之后每行 '行号 字符…'"""
    i0, j0, i1, j1 = M.bounds()
    oi, oj = int(round(M.g.x0 / P)), int(round(M.g.base / P))
    lines = [f'c0={i0 - oi}']
    for j in range(j0, j1 + 1):
        row = ''
        for i in range(i0, i1 + 1):
            c = (i, j)
            if c in M.cells:
                t = M.tags(c)
                row += {'衬': '#', '头': '^'}.get(M.deco.get(c), 'o' if '滴' in t else ('@' if '日' in t else 'X'))
            else:
                row += '.'
        lines.append(f'{j - oj:4d} {row}')
    return chr(10).join(lines)


def apply_target(M, text):
    """按定稿的字符图改砖（规则铺出来以后的视觉修正）。返回 (补了几块, 拿掉几块)"""
    lines = [l for l in text.strip().splitlines() if l.strip()]
    c0 = int(lines[0].strip().split('=')[1])
    oi, oj = int(round(M.g.x0 / P)), int(round(M.g.base / P))
    want = {}
    for l in lines[1:]:
        r, row = l.split()
        for k, ch in enumerate(row):
            if ch != '.':
                want[(oi + c0 + k, oj + int(r))] = ch
    old = set(M.cells)
    added = len(set(want) - old)
    removed = len(old - set(want))
    cells, deco = {}, {}
    rule = list(M.cells.items())
    for c, ch in want.items():
        tag = SYM[ch]
        sid = M.cells.get(c)
        if sid is None:     # 规则没铺这块：归给最近的那一笔（标签跟着走）
            sid = min(rule, key=lambda kv: abs(kv[0][0] - c[0]) + abs(kv[0][1] - c[1]))[1]
        st = M.stroke_tags.get(sid, set())
        if tag in ('日', '滴') and tag not in st:
            sid = {'日': 'sun', '滴': 'drop'}[tag]
        elif tag is None and st & {'日', '滴'}:
            sid = 'edit'
        cells[c] = sid
        if tag in ('衬', '头'):
            deco[c] = tag
    M.cells, M.deco = cells, deco
    M.stroke_tags.update({'sun': {'日'}, 'drop': {'滴'}, 'edit': set()})
    return added, removed


def build(T, targets=None):
    """每个字铺成砖，再按定稿的字符图（targets）做视觉修正。返回 {字: Mosaic}；每个 Mosaic 的 fixed 记着补了、拿掉了几块"""
    out = {}
    for g in T:
        M = build_glyph(g)
        M.rule = dump(M)
        M.fixed = (0, 0)
        if targets and g.label in targets:
            M.fixed = apply_target(M, targets[g.label])
        out[g.label] = M
    return out


def font_paths(T, Ms, inset=0.1):
    """小形态用：每个字的砖换回这个字自己的字体单位（每块砖四边各收 inset 块，留出细缝）。返回 ([Path…], [步进 em…])"""
    from lockupkit.geom import rect, union as U
    paths_, adv = [], []
    for g in T:
        M = Ms[g.label]
        k = g.k
        rs = []
        for (i, j) in M.cells:
            x0, x1 = ((i + inset) * P - g.x0) / k, ((i + 1 - inset) * P - g.x0) / k
            y0, y1 = (g.base - (j + 1 - inset) * P) / k, (g.base - (j + inset) * P) / k
            rs.append(rect(x0, y0, x1, y1))
        p = U(rs)
        paths_.append(p)
        adv.append((p.bounds[2] + 70) / 1000.0)
    return paths_, adv


def ascii(M):
    return dump(M)


# ---------------------------------------------------------------- 视觉修正后的定稿
# 规则铺出来的样子（dump）在检查图目录的 砖格.txt 里；下面是改过的定稿（上没有改）。改动和理由：
#   晴  青整体往左收一列（日和青之间留两列）
#   空  宀点铺成头尖的水滴；宀左点只露一块在横上、底下往左鼓；横钩的钩往下走两行；八的撇收尾不碰工的横；
#       八的点（水滴）头收窄；工的上横往右让开水滴，不铺三角（宋体这里本来就小）
#   水  右边的撇和捺原来糊成一团：按宋体的走向重铺成贴在竖右边的“<”（撇头宽、捺越往下越宽、脚往右拖）；竖钩的钩往左上挑
#   乐  平撇右头按宋体铺成往右上翘的楔；竖折的横往左露一块（转角的脚）；竖钩的钩同水
#   园  元的第二横原来顶到囗的两壁（读成“日”）：两头各让一格；元的撇往里收、竖弯钩的弯和钩收在囗壁里面一格
TARGETS = {
    '晴': """c0=1
 -24 .................^........
 -23 ^.......#........XXX..#...
 -22 @@@.....##.......XXX..##..
 -21 @@@@@@@@@@@..XXXXXXXXXXXX.
 -20 @@@.....@@@......XXX......
 -19 @@@.....@@@......XXX..#...
 -18 @@@.....@@@......XXX..##..
 -17 @@@.....@@@..XXXXXXXXXXXX.
 -16 @@@.....@@@......XXX......
 -15 @@@.....@@@......XXX...##.
 -14 @@@.....@@@.XXXXXXXXXXXXXX
 -13 @@@@@@@@@@@...............
 -12 @@@.....@@@..........##...
 -11 @@@.....@@@..XXXXXXXXXXX..
 -10 @@@.....@@@..XXX.....XXX..
  -9 @@@.....@@@..XXX.....XXX..
  -8 @@@.....@@@..XXXXXXXXXXX..
  -7 @@@.....@@@..XXX.....XXX..
  -6 @@@@@@@@@@@..XXX.....XXX..
  -5 @@@.....@@@..XXX.....XXX..
  -4 @@@.....@@@..XXXXXXXXXXX..
  -3 @@@.....@@@..XXX.....XXX..
  -2 @@@..........XXX.....XXX..
  -1 .............XXX...X.XXX..
   0 .............XXX...XXXXX..
   1 .............XX.....XXX...
""",
    '空': """c0=1
 -17 ........o.........
 -16 .......ooo.....#..
 -15 ..X....ooo.....##.
 -14 XXXXXXXXXXXXXXXXXX
 -13 XXX............XX.
 -12 XX...XXX..ooo..X..
 -11 ....XXX.....oooo..
 -10 ...XXX.......oooo.
  -9 ..XX..........ooo.
  -8 .X................
  -7 ...XXXXXXXXXXXXX..
  -6 ........XXX.......
  -5 ........XXX.......
  -4 ........XXX.......
  -3 ........XXX.......
  -2 ........XXX....#..
  -1 ........XXX....##.
   0 XXXXXXXXXXXXXXXXXX
""",
    '水': """c0=0
 -16 ........^........
 -15 ........XXX......
 -14 ........XXX......
 -13 ........XXX......
 -12 ....#...XXX...XXX
 -11 ....##..XXX..XXXX
 -10 .XXXXXX.XXXX.XXX.
  -9 ....XXX.XXXXXXX..
  -8 ....XXX.XXXXX....
  -7 ....XXX.XXXXX....
  -6 ....XX..XXX.XX...
  -5 ...XXX..XXX.XXX..
  -4 ...XX...XXX.XXXX.
  -3 ..XX....XXX..XXXX
  -2 .XX.....XXX...XX.
  -1 XX...XX.XXX....X.
   0 ......XXXXX......
   1 .......XXX.......
""",
    '乐': """c0=1
 -16 ............X...
 -15 ..........XXXX..
 -14 ...XXXXXXXXXXXX.
 -13 ..XXX...........
 -12 ..XXX..XXX......
 -11 ..XXX..XXX......
 -10 ..XXX..XXX...#..
  -9 ..XXX..XXX...##.
  -8 .XXXXXXXXXXXXXXX
  -7 .......XXX......
  -6 ....X..XXX.o....
  -5 ...XXX.XXX.ooo..
  -4 ..XXX..XXX..ooo.
  -3 .XXX...XXX...ooo
  -2 XXX....XXX...oo.
  -1 X...XX.XXX......
   0 .....XXXXX......
   1 .......XX.......
""",
    '园': """c0=1
 -16 ^............#..
 -15 XXX..........##.
 -14 XXXXXXXXXXXXXXXX
 -13 XXX..........XXX
 -12 XXX..XXXXXX..XXX
 -11 XXX..........XXX
 -10 XXX......##..XXX
  -9 XXX.XXXXXXXX.XXX
  -8 XXX..XX.XX...XXX
  -7 XXX..XX.XX...XXX
  -6 XXX..XX.XX...XXX
  -5 XXX..XX.XX.X.XXX
  -4 XXX.XX..XX.X.XXX
  -3 XXX.X...XXXX.XXX
  -2 XXX..........XXX
  -1 XXXXXXXXXXXXXXXX
   0 XXX..........XX.
   1 XX..............
""",
}

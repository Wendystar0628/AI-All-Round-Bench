"""03 玻璃温室与花艺工作室 · 笔画处理（字体单位，1000 em，y 朝上）。

方言「维多利亚球端宋」（以思源宋体 Heavy 为骨架，十个字统一做）：
  1. 球端   横末的宋体三角全部收成一颗球（Didone 的球形收笔），球和发丝之间是一道直的切线颈：圆只在这一处；
  2. 利角   横折、横钩、横撇的转角三角削掉，转角是干净的直角（铸铁温室的框）；
  3. 平脚   收笔朝下、末端空着的竖：宋体的圆字脚一刀平切，两角是尖的；
  4. 叶点   所有的点换成两头尖的叶片（花艺；也和石膏马蹄莲的叶同形）。「璃」里 乂 的那一点是交叉结构的一半，不换。
  其余（撇、捺、钩尖、起笔的斜切）保留宋体本来的锐利。
高潮：「工作室」的「室」，宀 换成一座人字玻璃顶：横是檐，左点和右钩是檐下的两只托，顶点是球加尖的屋脊顶饰，
      檐上一个低坡的人字，里面五根竖棂、四格玻璃；不比原宝盖宽，只高出原来那一点的位置一点。「至」完整保留（石膏，由颜色层做）。
呼应：「温室」的「室」，宀 的顶点换成同一枚屋脊顶饰（球加尖），别的不动；所有横末的球和顶饰的球同形。
"""
import numpy as np
from lockupkit.geom import union, diff, inter, poly, rect, circle, raster
from lockupkit.strokes import Title, _vertices
from lockupkit import paths
from .strokes import STROKES
from . import shapes as SH

FONT = paths.SONG_HEAVY
TEXT = '玻璃温室与花艺工作室'
HAIR = 28            # 宋体 Heavy 横画的厚（发丝）
BALL_R = 46          # 球端的半径（直径约等于宋体三角的高）
NECK = 1.9           # 球颈从球心往左几倍半径处起
LINE_W = 18          # 字里另加的发丝线（竖棂、屋脊线、椽）的厚：比横画略细，和字是同一支笔
HERO = '室#2.'
ECHO = '室'


# ====================================================================== 量字形（栅格，1 单位 1 像素）


class Probe:
    """把一个字的原轮廓画成 1 单位的格子，用来量某一行、某一列上的实心段。"""
    O = 200

    def __init__(self, path):
        self.m = raster(path, 1400, 1400, (1, 0, 0, -1, self.O, 1200), ss=1) > 0.5

    def _rc(self, x, y):
        return int(round(1200 - y)), int(round(x + self.O))

    def row(self, y, x):
        r, c = self._rc(x, y)
        line = self.m[r]
        if not line[c]:
            return None
        a = c
        while a > 0 and line[a - 1]:
            a -= 1
        b = c
        while b < len(line) - 1 and line[b + 1]:
            b += 1
        return a - self.O, b - self.O

    def col(self, x, y):
        r, c = self._rc(x, y)
        colv = self.m[:, c]
        if not colv[r]:
            return None
        a = r
        while a > 0 and colv[a - 1]:
            a -= 1
        b = r
        while b < len(colv) - 1 and colv[b + 1]:
            b += 1
        return 1200 - b, 1200 - a       # (y 底, y 顶)


def _probe(g):
    if not hasattr(g, '_probe'):
        g._probe = Probe(g.src)
    return g._probe


def bar_edges(s, x):
    """横画在 x 处的上下沿（字体单位）"""
    yc = s.axis[0][1]
    r = _probe(s.g).col(x, yc)
    if r is None:
        for dy in range(1, 14):
            r = _probe(s.g).col(x, yc + dy) or _probe(s.g).col(x, yc - dy)
            if r:
                break
    return r


# ====================================================================== 方言


def core(s):
    """一笔的“芯”：沿标注的中线、按标注的宽、不外扩（挖三角时护住别的笔画用）"""
    from lockupkit.geom import slab
    return union([slab(tuple(a), tuple(b), w) for a, b, w in zip(s.axis[:-1], s.axis[1:], s.ws)])


def protect(s):
    return union([core(o) for o in s.g.strokes if o is not s and o not in s.g.removed])


def thin_column(s, x_from, step=-10, limit=40):
    """从 x_from 往左找发丝真正细的一列（避开穿过横画的竖），返回 (x, y底, y顶)"""
    x = x_from
    for _ in range(limit):
        r = bar_edges(s, x)
        if r and r[1] - r[0] < 48:
            return x, r[0], r[1]
        x += step
    r = bar_edges(s, x_from)
    return x_from, r[0], r[1]


def find_triangle(g, x0, x1, yt):
    """宋体横末（或转角）的三角尖：原字形在 x0–x1、高出发丝上沿 45–170 的落笔点里，
    往下一直实心连到发丝、往下 30 处的实心段又窄的那一点（竖画穿过横画不算：它往下 30 处是一整根竖的宽）。"""
    P = _probe(g)
    v = _vertices(g.src)
    m = v[(v[:, 0] >= x0) & (v[:, 0] <= x1) & (v[:, 1] > yt + 45) & (v[:, 1] < yt + 170)]
    for q in m[np.argsort(-m[:, 1])]:
        x, y = float(q[0]), float(q[1])
        for dx in (0, -3, 3):
            c = P.col(x + dx, y - 6)
            r = P.row(y - 30, x + dx)
            if c and c[0] <= yt + 3 and r and r[1] - r[0] < 95:
                return np.array([x, y])
    return None


def ball_end(s, r=BALL_R):
    """横末三角 → 球端。返回 (要挖掉的三角区域, 补上的球)；没有三角（收进竖里的横）返回 None"""
    xe_guess = float(s.end[0])
    x, yb, yt = thin_column(s, xe_guess - 250)
    run = _probe(s.g).row((yb + yt) / 2, x)
    xe = run[1] if run else xe_guess
    ap = find_triangle(s.g, xe - 250, xe - 15, yt)
    if ap is None:
        return None
    h = ap[1] - yt
    ball, c = SH.ball_drop(xe - 2, yb, r, yt - yb, neck=NECK, lift=1.0)
    # 三角整块挖掉；发丝在球心以右的那一小截（宋体收笔的小钩）也挖掉，末端只剩球
    cut = diff(union(rect(ap[0] - 1.05 * h - 14, yt + 0.6, xe + 40, ap[1] + 30), rect(c[0], yb - 30, xe + 40, yt + 1)), protect(s))
    s.g.anchors.setdefault('balls', []).append((float(c[0]), float(c[1]), r))
    return cut, ball


def op_ball(p, s, r=BALL_R):
    got = ball_end(s, r)
    if got is None:
        return p
    cut, ball = got
    return union(diff(p, cut), ball)


def op_square_shoulder(p, s, k=1):
    """横折、横钩、横撇：转角上的三角削平（转角是干净的直角）"""
    c = s.axis[k]
    x, yb, yt = thin_column(s, float(c[0]) - 150) if k == 1 else (None, None, None)
    if k != 1:
        r = _probe(s.g).col(float(c[0]) - 150, float(c[1]))
        yb, yt = r
    ap = find_triangle(s.g, float(c[0]) - 130, float(c[0]) + 150, yt)
    if ap is None:
        return p
    h = ap[1] - yt
    cut = diff(rect(ap[0] - 1.05 * h - 14, yt + 0.6, ap[0] + 1.25 * h + 30, ap[1] + 30), protect(s))
    return diff(p, cut)


def foot_of(s):
    """竖画（或以竖收笔的折）的字脚最低处；字脚下面空着才算（返回 None 表示接着别的笔画）"""
    if s.heading('end') != 'down':
        return None
    P = _probe(s.g)
    x = float(s.end[0])
    r = P.col(x, float(s.end[1]))
    if r is None:
        return None
    ymin = r[0]
    w = s.w_end
    if abs(ymin - float(s.end[1])) > 0.6 * w:        # 一路连到别的笔画里去了
        return None
    rw = P.row(ymin + 6, x)
    if rw is None or rw[1] - rw[0] > 1.6 * w:      # 落在一根横上（工、皿的竖）不算
        return None
    for dx in (-0.3 * w, 0, 0.3 * w):
        if P.col(x + dx, ymin - 14) is not None:
            return None
    # 字脚往左往右再找最低点（宋体的圆脚左低右高）
    for dx in (-0.4 * w, -0.2 * w, 0.2 * w, 0.4 * w):
        rr = P.col(x + dx, ymin + 20)
        if rr:
            ymin = min(ymin, rr[0])
    return ymin


def op_flat_foot(p, s, keep=0.12):
    """收笔朝下、末端空着的竖：圆字脚平切。在字脚最低处往上 keep×宽 处切平，两角是尖的。"""
    ymin = foot_of(s)
    if ymin is None:
        return p
    w = s.w_end
    yy = ymin + 0.9 * w
    run = _probe(s.g).row(yy, float(s.end[0]))
    if run is None:
        return p
    x0, x1 = run
    yc = ymin + keep * w
    p = diff(p, rect(x0 - 3, ymin - 60, x1 + 3, yy))
    return union(p, rect(x0, yc, x1, yy + 1))


def leaf_of(s, scale_w=0.82, belly=0.6, bend=0.09, back=-0.04):
    """把一个点换成叶片：沿标注的走向，从起笔尖略往前到收笔的圆肚外沿；宽取标注宽的八成。
    back > 0 时叶尖往回伸（盖住和它相接的那一笔的尖，接口不留碎角）"""
    a, b = s.start.astype(float), s.end.astype(float)
    u = (b - a) / np.linalg.norm(b - a)
    a = a - u * s.w * back
    b = b + u * s.w * 0.42
    return SH.leaf(a, b, s.w * scale_w, belly=belly, bend=bend)


def finial(cx, y0, k=1.0):
    """屋脊顶饰：领圈、一颗球（和球端同形）、一根尖。y0 是领圈底；k 缩放"""
    ball = circle(cx, y0 + 30 * k, 28 * k)
    spike = poly([(cx - 12 * k, y0 + 48 * k), (cx, y0 + 164 * k), (cx + 12 * k, y0 + 48 * k)])
    collar = poly([(cx - 34 * k, y0), (cx + 34 * k, y0), (cx + 18 * k, y0 + 10 * k), (cx - 18 * k, y0 + 10 * k)])
    return union(ball, spike, collar)


# ====================================================================== 高潮：玻璃顶


def glass_roof(g):
    """「室」的宀 → 人字玻璃顶。返回 {'frame': 墨线框, 'glass': [每格玻璃], 'finial': 顶饰, …}（字体单位）"""
    yb, yt = 687.0, 715.0                     # 原 横钩 的横 → 檐（系梁）
    xl, xr = 100.0, 905.0                     # 檐的两头（和原宝盖一样宽）
    ax, ay = 500.0, 872.0                     # 屋脊（人字的顶，原来那一点的位置）
    hw = LINE_W
    eave = rect(xl, yb, xr, yt)
    # 椽：从屋脊到两头的檐，和横画一样是发丝；在檐头收尖
    rl = SH.ribbon([(ax + 6, ay + 4), (xl, yt - 4)], [HAIR * 1.05, HAIR * 0.8])
    rr = SH.ribbon([(ax - 6, ay + 4), (xr, yt - 4)], [HAIR * 1.05, HAIR * 0.8])
    xs = [ax + d for d in (-240, -120, 0, 120, 240)]

    def roof_y(x):
        return yt + (ay - yt) * (1 - abs(x - ax) / ((ax - xl) if x <= ax else (xr - ax)))
    bars = union([rect(x - hw * 0.34, yt - 2, x + hw * 0.34, roof_y(x)) for x in xs])
    edges = [xl] + xs + [xr]
    tri = poly([(xl, yt), (ax, ay), (xr, yt)])
    glass = [inter(tri, rect(x0 + hw * 0.4, yt, x1 - hw * 0.4, ay)) for x0, x1 in zip(edges[:-1], edges[1:])]
    # 屋脊顶饰：屋脊上一颗球（和球端同形），上面一根尖
    fin = finial(ax, ay + 2, k=0.82)
    # 左托：原来的竖点 → 一片往下垂的叶（叶点是方言）；右托：原来的钩 → 一刀利的三角
    lbr = SH.leaf((xl + 36, yb + 8), (xl - 30, 520), 66, belly=0.6, bend=-0.12)
    rbr = poly([(xr - 70, yb + 1), (xr + 4, yb + 1), (xr - 56, 572)])
    frame = union(eave, rl, rr, bars, lbr, rbr, fin)
    return {'frame': frame, 'glass': glass, 'tri': tri, 'finial': fin, 'apex': (ax, ay + 2 + 30 * 0.82), 'spike_top': (ax, ay + 2 + 164 * 0.82),
            'eave': (xl, xr, yb, yt)}


def echo_roof(g):
    """「温室」的「室」：宀 的顶点换成和高潮同一枚屋脊顶饰（小一号、立在横上），别的不动"""
    return finial(470, 716, k=1.2)


# ====================================================================== 组装


def letters(detail='full'):
    """排版前的 Title（每个字的手术都挂好了）。detail='small' 给小形态：不画玻璃顶里的竖棂和呼应的细线。"""
    T = Title(FONT, TEXT, STROKES)
    big = detail == 'full'
    hero = T[HERO]

    # ---- 高潮：「工作室」的宀 整个换成玻璃顶（先拿掉原来三笔）
    hero_ops = T.sel(f'{HERO}1', f'{HERO}2', f'{HERO}3')
    for s in hero_ops:
        s.variant(None)
    hero.roof = glass_roof(hero) if big else None
    if big:
        hero.ops.append(lambda p, R=hero.roof: union(p, R['frame']))
    else:
        R = glass_roof(hero)
        hero.ops.append(lambda p, R=R: union(p, R['frame']))

    # ---- 方言 4：所有的点 → 叶片（高潮那两点已换成顶饰和托）
    T.q(type='点').exclude(f'{HERO}1', f'{HERO}2', f'{ECHO}1', '璃10', f'{HERO}6', f'{ECHO}6').variant(lambda s: leaf_of(s))
    # 「至」的点贴着上面那一笔的提尖起笔：叶尖往回伸一点盖住提尖
    T.sel(f'{HERO}6', f'{ECHO}6').variant(lambda s: leaf_of(s, back=0.2, scale_w=0.86))
    # 呼应：温室的室，顶点 → 顶饰
    T.s(f'{ECHO}1').variant(lambda s: echo_roof(s.g))

    # ---- 方言 1：横末三角 → 球端
    T.q(type='横').op(op_ball)

    # ---- 方言 2：转角三角削平（第一段是横的折和钩；高潮的横钩已经换掉）
    for s in T.q(type=('折', '钩')):
        if s.id.startswith(HERO) and s.n <= 3:
            continue
        if abs(s.start_dir[1]) < 0.3:
            s.op(op_square_shoulder)
    T.s('与2').op(op_square_shoulder, k=2)

    # ---- 方言 3：收笔朝下、末端空着的竖 → 平脚
    T.q(lambda s: s.type in ('竖', '折') and foot_of(s) is not None).op(op_flat_foot)

    return T

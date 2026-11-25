"""几何：基于 skia-pathops 的 Path（保留曲线）。

这里的函数不管单位：字形在字体单位里（1000 em，y 朝上），排进版面以后是版面坐标（y 朝下），两种都能用。
只有“方向”相关的说法要看坐标系：rotate 的正角在 y 朝上时是逆时针、在 y 朝下（屏幕）时是顺时针。

  布尔       union diff inter xor simplify
  变换       affine move scale rotate skew place
  外扩内缩   offset（d>0 外扩、d<0 内缩）、round_corners
  轮廓       contours（序号、面积、外框、方向、是不是孔）、pick、drop_small、area、bounds
  拍平       flatten -> [N×2 数组]
  点编辑     points、map_points、warp、move_points、straighten
  SVG        to_svg_d、from_svg_d
  基本形     polygon rect circle ellipse ring ngon arc_band slab taper polyline
  曲线取点   bezier、spline（过点的光滑曲线）
  扫笔画     sweep（沿中线按宽度变化扫出轮廓，两端用回调画端头）、cap_round cap_square cap_point
"""
import math
import re
import numpy as np
import pathops
from pathops import Path, PathOp, PathVerb

__all__ = [
    'Path', 'union', 'diff', 'inter', 'xor', 'simplify',
    'affine', 'move', 'scale', 'rotate', 'skew', 'place',
    'offset', 'round_corners', 'contours', 'pick', 'drop_small', 'area', 'signed_area', 'bounds',
    'flatten', 'points', 'map_points', 'warp', 'move_points', 'straighten',
    'to_svg_d', 'from_svg_d',
    'polygon', 'rect', 'circle', 'ellipse', 'ring', 'ngon', 'arc_band', 'slab', 'taper', 'polyline',
    'bezier', 'spline', 'sweep', 'cap_round', 'cap_square', 'cap_point',
]


# ================================================================ 基础

def _flat(ps):
    out = []
    for p in ps:
        if p is None:
            continue
        if isinstance(p, (list, tuple)):
            out.extend(_flat(p))
        else:
            out.append(p)
    return out


def _noconic(p):
    """skia 的描边、圆弧会产生 conic，布尔运算不收：换成二次曲线"""
    if any(v == PathVerb.CONIC for v, _ in p):
        p = Path(p)
        p.convertConicsToQuads()
    return p


def simplify(p):
    """去掉自交和重叠，统一绕向（布尔运算的结果已经是这样，不用再调）"""
    return pathops.op(_noconic(p), Path(), PathOp.UNION, fix_winding=True)


# ================================================================ 布尔

def union(*ps):
    """并。可以传多个 Path 或列表；None 跳过。"""
    # 逐个 op：OpBuilder 在“全是并集”时会把字腔当成外轮廓填掉
    ps = _flat(ps)
    if not ps:
        return Path()
    out = simplify(ps[0])
    for p in ps[1:]:
        out = pathops.op(out, _noconic(p), PathOp.UNION, fix_winding=True)
    return out


def diff(a, *bs):
    """差：a 减去其余所有"""
    bs = _flat(bs)
    if not bs:
        return a
    return pathops.op(_noconic(a), union(*bs), PathOp.DIFFERENCE, fix_winding=True)


def inter(a, *bs):
    """交：a 与其余每一个依次相交"""
    out = _noconic(a)
    for b in _flat(bs):
        out = pathops.op(out, _noconic(b), PathOp.INTERSECTION, fix_winding=True)
    return out


def xor(a, b):
    """异或：只属于其中一个的部分"""
    return pathops.op(_noconic(a), _noconic(b), PathOp.XOR, fix_winding=True)


def _union_polys(polys):
    """一批简单多边形的并：全部转成同一绕向放进一条路径，按非零规则一次化简（比逐个 op 快得多）"""
    p = Path()
    for q in polys:
        q = np.asarray(q, float)
        if len(q) < 3:
            continue
        a = _shoelace(q)
        if abs(a) < 1e-9:
            continue
        if a < 0:
            q = q[::-1]
        p.moveTo(*map(float, q[0]))
        for r in q[1:]:
            p.lineTo(*map(float, r))
        p.close()
    return simplify(p)


# ================================================================ 变换

def affine(p, a=1, b=0, c=0, d=1, e=0, f=0):
    """SVG 顺序的仿射：x' = a·x + c·y + e，y' = b·x + d·y + f"""
    return p.transform(a, b, c, d, e, f)


def move(p, dx, dy):
    return p.transform(1, 0, 0, 1, dx, dy)


def scale(p, sx, sy=None, about=(0.0, 0.0)):
    sy = sx if sy is None else sy
    cx, cy = about
    return p.transform(sx, 0, 0, sy, cx - sx * cx, cy - sy * cy)


def rotate(p, deg, about=(0.0, 0.0)):
    """转 deg 度：y 朝上时逆时针为正（y 朝下的屏幕上看是顺时针）"""
    t = math.radians(deg)
    c, s = math.cos(t), math.sin(t)
    cx, cy = about
    return p.transform(c, s, -s, c, cx - c * cx + s * cy, cy - s * cx - c * cy)


def skew(p, x_deg=0.0, y_deg=0.0, about=(0.0, 0.0)):
    """斜切：x' = x + tan(x_deg)·(y - cy)，y' = y + tan(y_deg)·(x - cx)。
    字体单位（y 朝上）里 x_deg>0 是往右倾（斜体的方向）。"""
    kx, ky = math.tan(math.radians(x_deg)), math.tan(math.radians(y_deg))
    cx, cy = about
    return p.transform(1, ky, kx, 1, -kx * cy, -ky * cx)


def place(p, x, baseline, size, upm=1000.0):
    """字体单位（y 朝上，基线 0）→ 版面坐标（y 朝下）：原点放在 (x, baseline)，1 em = size"""
    k = size / upm
    return p.transform(k, 0, 0, -k, x, baseline)


# ================================================================ 外扩、内缩

_JOIN = {'miter': pathops.LineJoin.MITER_JOIN, 'round': pathops.LineJoin.ROUND_JOIN, 'bevel': pathops.LineJoin.BEVEL_JOIN}
_CAP = {'butt': pathops.LineCap.BUTT_CAP, 'round': pathops.LineCap.ROUND_CAP, 'square': pathops.LineCap.SQUARE_CAP}


def _band(p, w, join='round', miter=4.0):
    """沿轮廓两侧各 w/2 的一条带"""
    q = Path(_noconic(p))
    q.stroke(float(w), _CAP['butt'], _JOIN[join], float(miter))
    return _noconic(q)


def offset(p, d, join='round', miter=4.0):
    """d>0 外扩、d<0 内缩 |d|（同 p 的单位）。join：转角的接法 round 圆、miter 尖、bevel 切。
    描边、厚度、内线、外框这类派生层都从这里来。"""
    if abs(d) < 1e-9:
        return p
    band = _band(p, 2 * abs(d), join, miter)
    return union(p, band) if d > 0 else diff(p, band)


def round_corners(p, r, convex=True, concave=False):
    """倒圆角：convex 凸角（先缩后扩），concave 凹角（先扩后缩）。r 是圆角半径。"""
    if convex:
        p = offset(offset(p, -r, 'round'), r, 'round')
    if concave:
        p = offset(offset(p, r, 'round'), -r, 'round')
    return p


# ================================================================ 轮廓

def _shoelace(q):
    x, y = q[:, 0], q[:, 1]
    return 0.5 * float(np.dot(x, np.roll(y, -1)) - np.dot(y, np.roll(x, -1)))


def signed_area(p, tol=0.5):
    """带符号的面积：正 = 在 y 朝上的坐标里逆时针"""
    return sum(_shoelace(c) for c in flatten(p, tol))


def area(p):
    """面积（不分绕向，孔按绕向扣掉）"""
    return abs(signed_area(p))


def bounds(p):
    """(xmin, ymin, xmax, ymax)；空路径给 None"""
    b = p.bounds
    return None if b == (0, 0, 0, 0) and not list(p) else tuple(b)


def contours(p):
    """拆出各个轮廓：[{i 序号, path, area 面积, signed 带符号面积, bounds 外框, dir 'ccw'/'cw'（按 y 朝上说）, hole 是不是孔}]。
    是不是孔按嵌套层数判断（被奇数个别的轮廓包着就是孔），和绕向无关。"""
    cs = list(_noconic(p).contours)
    info = []
    for i, c in enumerate(cs):
        a = signed_area(c)
        info.append({'i': i, 'path': c, 'area': abs(a), 'signed': a, 'bounds': tuple(c.bounds),
                     'dir': 'ccw' if a > 0 else 'cw'})
    for k in info:
        first = next((pts[-1] for v, pts in k['path'] if pts), None)
        depth = 0
        if first is not None:
            for j in info:
                if j is not k and j['path'].contains(tuple(first)):
                    depth += 1
        k['hole'] = depth % 2 == 1
    return info


def pick(p, idx):
    """按序号取出几个轮廓（序号同 contours()、坐标底图上的 c0 c1……）"""
    cs = list(_noconic(p).contours)
    idx = [idx] if isinstance(idx, int) else idx
    q = Path()
    for i in idx:
        q.addPath(cs[i])
    return simplify(q)


def drop_small(p, min_area):
    """去掉面积小于 min_area 的轮廓（布尔运算后的碎渣、小孔）"""
    q = Path()
    for c in contours(p):
        if c['area'] >= min_area:
            q.addPath(c['path'])
    return simplify(q)


# ================================================================ 拍平

def _cubic(p0, p1, p2, p3, n):
    t = np.linspace(0, 1, n + 1)[1:, None]
    mt = 1 - t
    return mt ** 3 * p0 + 3 * mt ** 2 * t * p1 + 3 * mt * t ** 2 * p2 + t ** 3 * p3


def _quad(p0, p1, p2, n):
    t = np.linspace(0, 1, n + 1)[1:, None]
    mt = 1 - t
    return mt ** 2 * p0 + 2 * mt * t * p1 + t ** 2 * p2


def flatten(p, tol=0.2):
    """拍平成多边形：[N×2 数组, …]，一个轮廓一个。tol 是允许的最大弦高（同 p 的单位）。"""
    contours_ = []
    cur = []
    last = None
    for verb, pts in _noconic(p):
        if verb == PathVerb.MOVE:
            if len(cur) > 2:
                contours_.append(np.array(cur, float))
            cur = [pts[0]]
            last = np.array(pts[0], float)
        elif verb == PathVerb.LINE:
            cur.append(pts[0])
            last = np.array(pts[0], float)
        elif verb == PathVerb.QUAD:
            c = np.array(pts, float)
            L = np.linalg.norm(c[0] - last) + np.linalg.norm(c[1] - c[0])
            n = max(2, int(math.sqrt(L / max(tol, 1e-3)) * 1.2))
            cur.extend(map(tuple, _quad(last, c[0], c[1], n)))
            last = c[1]
        elif verb == PathVerb.CUBIC:
            c = np.array(pts, float)
            L = np.linalg.norm(c[0] - last) + np.linalg.norm(c[1] - c[0]) + np.linalg.norm(c[2] - c[1])
            n = max(2, int(math.sqrt(L / max(tol, 1e-3)) * 1.4))
            cur.extend(map(tuple, _cubic(last, c[0], c[1], c[2], n)))
            last = c[2]
        elif verb == PathVerb.CLOSE:
            if len(cur) > 2:
                contours_.append(np.array(cur, float))
            cur = []
    if len(cur) > 2:
        contours_.append(np.array(cur, float))
    return contours_


def _from_polys(polys):
    p = Path()
    for q in polys:
        if len(q) < 3:
            continue
        p.moveTo(*map(float, q[0]))
        for r in q[1:]:
            p.lineTo(*map(float, r))
        p.close()
    return p


# ================================================================ 点编辑

def points(p):
    """全部的点：[(轮廓序号, 点序号, x, y, 是不是落笔点)]；是不是落笔点 False 的是曲线控制点"""
    out = []
    ci = -1
    k = 0
    for verb, pts in _noconic(p):
        if verb == PathVerb.MOVE:
            ci += 1
            k = 0
        for j, q in enumerate(pts):
            out.append((ci, k, float(q[0]), float(q[1]), j == len(pts) - 1))
            k += 1
    return out


def _rebuild(p, fn):
    """逐段重建路径：fn(verb, pts) -> 新 pts（同样个数）"""
    out = Path()
    for verb, pts in _noconic(p):
        pts = fn(verb, pts)
        if verb == PathVerb.MOVE:
            out.moveTo(*pts[0])
        elif verb == PathVerb.LINE:
            out.lineTo(*pts[0])
        elif verb == PathVerb.QUAD:
            out.quadTo(*pts[0], *pts[1])
        elif verb == PathVerb.CUBIC:
            out.cubicTo(*pts[0], *pts[1], *pts[2])
        elif verb == PathVerb.CLOSE:
            out.close()
    return out


def map_points(p, fn):
    """每个点（含曲线控制点）换成 fn(x, y) -> (x, y)，曲线结构不变。结果会化简（去自交）。"""
    return simplify(_rebuild(p, lambda verb, pts: [tuple(map(float, fn(q[0], q[1]))) for q in pts]))


def warp(p, fn, tol=None):
    """非线性的点变换：fn(N×2 数组) -> N×2 数组。
    tol=None 时只变换点和控制点（保留曲线，变换平缓时够用）；给 tol 时先按 tol 拍平再变换（变换剧烈时更准，结果是折线）。"""
    if tol is not None:
        polys = [np.asarray(fn(np.asarray(c, float)), float) for c in flatten(p, tol)]
        return simplify(_from_polys(polys))

    def f(verb, pts):
        if not pts:
            return pts
        q = np.asarray(fn(np.asarray(pts, float).reshape(-1, 2)), float)
        return [tuple(r) for r in q]
    return simplify(_rebuild(p, f))


def _weight(where, soft):
    """where：(cx, cy, r) 圆、(x0, y0, x1, y1) 框，或 fn(x, y) -> 0–1 / bool。返回 fn(x, y) -> 权重"""
    if callable(where):
        return lambda x, y: float(where(x, y))
    if len(where) == 3:
        cx, cy, r = where

        def w(x, y):
            d = math.hypot(x - cx, y - cy) / r
            if d > 1:
                return 0.0
            return (1 - d * d) ** 2 if soft else 1.0
        return w
    if len(where) == 4:
        x0, y0, x1, y1 = where
        return lambda x, y: 1.0 if (min(x0, x1) <= x <= max(x0, x1) and min(y0, y1) <= y <= max(y0, y1)) else 0.0
    raise ValueError('where 是 (cx, cy, r)、(x0, y0, x1, y1) 或函数')


def move_points(p, where, dx, dy, soft=False):
    """把范围里的点（含控制点）平移 (dx, dy)。where 见 _weight；soft=True 时圆形范围按距离平滑衰减（软选择）。"""
    w = _weight(where, soft)

    def f(x, y):
        k = w(x, y)
        return x + dx * k, y + dy * k
    return map_points(p, f)


def straighten(p, tol=3.0, where=None):
    """把曲线折成直段，每段曲线切成最少的几段，保证偏差不超过 tol。
    where 给范围时（同 move_points），只折两端都在范围里的曲线段。"""
    w = _weight(where, False) if where is not None else None
    out = Path()
    last = None
    for verb, pts in _noconic(p):
        if verb == PathVerb.MOVE:
            out.moveTo(*pts[0])
            last = np.array(pts[0], float)
        elif verb == PathVerb.LINE:
            out.lineTo(*pts[0])
            last = np.array(pts[0], float)
        elif verb in (PathVerb.CUBIC, PathVerb.QUAD):
            c = np.array(pts, float)
            end = c[-1]
            if w is not None and not (w(*last) > 0 and w(*end) > 0):
                if verb == PathVerb.QUAD:
                    out.quadTo(*pts[0], *pts[1])
                else:
                    out.cubicTo(*pts[0], *pts[1], *pts[2])
                last = end
                continue
            if verb == PathVerb.QUAD:
                p0, q1, p3 = last, c[0], c[1]
                c = np.array([p0 + 2 / 3 * (q1 - p0), p3 + 2 / 3 * (q1 - p3), p3])
            p0, p1, p2, p3 = last, c[0], c[1], c[2]
            M = max(np.linalg.norm(p0 - 2 * p1 + p2), np.linalg.norm(p1 - 2 * p2 + p3))
            n = max(1, int(math.ceil(math.sqrt(0.75 * M / max(tol, 1e-6)))))
            for i in range(1, n + 1):
                t = i / n
                mt = 1 - t
                q = mt ** 3 * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t ** 3 * p3
                out.lineTo(float(q[0]), float(q[1]))
            last = p3
        elif verb == PathVerb.CLOSE:
            out.close()
    return simplify(out)


# ================================================================ SVG

def to_svg_d(p, prec=2):
    """Path → SVG 的 d 字符串（坐标原样写出；y 朝上的字体单位先 place() 到 y 朝下再导出）"""
    fmt = f'{{:.{prec}f}}'

    def n(v):
        s = fmt.format(v).rstrip('0').rstrip('.')
        return '0' if s in ('-0', '') else s
    out = []
    for verb, pts in _noconic(p):
        xy = ' '.join(f'{n(q[0])} {n(q[1])}' for q in pts)
        out.append({PathVerb.MOVE: 'M', PathVerb.LINE: 'L', PathVerb.QUAD: 'Q', PathVerb.CUBIC: 'C', PathVerb.CLOSE: 'Z'}[verb] + xy)
    return ''.join(out)


_NUM = re.compile(r'[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?')


def from_svg_d(d):
    """SVG 的 d 字符串 → Path。支持 M L H V C S Q T A Z（大小写，相对坐标），坐标原样读入。"""
    i, n = 0, len(d)

    def skip():
        nonlocal i
        while i < n and d[i] in ' \t\r\n,':
            i += 1

    def num():
        nonlocal i
        skip()
        m = _NUM.match(d, i)
        if not m:
            raise ValueError(f'SVG 路径在第 {i} 个字符处读不出数：{d[i:i + 20]!r}')
        i = m.end()
        return float(m.group())

    def flag():
        nonlocal i
        skip()
        if i < n and d[i] in '01':
            i += 1
            return d[i - 1] == '1'
        raise ValueError(f'SVG 圆弧的标志位在第 {i} 个字符处不是 0/1')

    p = Path()
    cmd = None
    x = y = sx = sy = 0.0
    lc = None   # 上一段的第二控制点（S、T 用）
    lcmd = ''
    open_ = False
    while True:
        skip()
        if i >= n:
            break
        if d[i].isalpha():
            cmd = d[i]
            i += 1
        elif cmd is None:
            raise ValueError('SVG 路径要以命令开头')
        rel = cmd.islower()
        C = cmd.upper()
        ox, oy = (x, y) if rel else (0.0, 0.0)
        if C == 'Z':
            if open_:
                p.close()
            open_ = False
            x, y = sx, sy
            lc, lcmd = None, 'Z'
            continue
        if C == 'M':
            x, y = num() + ox, num() + oy
            p.moveTo(x, y)
            open_ = True
            sx, sy = x, y
            cmd = 'l' if rel else 'L'
            lc, lcmd = None, 'M'
            continue
        if C == 'L':
            x, y = num() + ox, num() + oy
            p.lineTo(x, y)
        elif C == 'H':
            x = num() + ox
            p.lineTo(x, y)
        elif C == 'V':
            y = num() + oy
            p.lineTo(x, y)
        elif C == 'C':
            x1, y1, x2, y2 = num() + ox, num() + oy, num() + ox, num() + oy
            x, y = num() + ox, num() + oy
            p.cubicTo(x1, y1, x2, y2, x, y)
            lc = (x2, y2)
        elif C == 'S':
            x1, y1 = (2 * x - lc[0], 2 * y - lc[1]) if lcmd in 'CS' and lc else (x, y)
            x2, y2 = num() + ox, num() + oy
            x, y = num() + ox, num() + oy
            p.cubicTo(x1, y1, x2, y2, x, y)
            lc = (x2, y2)
        elif C == 'Q':
            x1, y1 = num() + ox, num() + oy
            x, y = num() + ox, num() + oy
            p.quadTo(x1, y1, x, y)
            lc = (x1, y1)
        elif C == 'T':
            x1, y1 = (2 * x - lc[0], 2 * y - lc[1]) if lcmd in 'QT' and lc else (x, y)
            x, y = num() + ox, num() + oy
            p.quadTo(x1, y1, x, y)
            lc = (x1, y1)
        elif C == 'A':
            rx, ry, rot = num(), num(), num()
            large, sweep_ = flag(), flag()
            x, y = num() + ox, num() + oy
            if rx == 0 or ry == 0:
                p.lineTo(x, y)
            else:
                p.arcTo(abs(rx), abs(ry), rot, pathops.ArcSize.LARGE if large else pathops.ArcSize.SMALL,
                        pathops.Direction.CW if sweep_ else pathops.Direction.CCW, x, y)
        else:
            raise ValueError(f'不支持的 SVG 命令：{cmd}')
        lcmd = C
        if C not in 'CSQT':
            lc = None
    return _noconic(p)


# ================================================================ 基本形

def polygon(pts):
    """点列围成的多边形（自动闭合，绕向规范化）"""
    return _union_polys([np.asarray(pts, float)])


def rect(x0, y0, x1, y1, r=0.0):
    """矩形；r>0 时四角倒圆"""
    if r <= 0:
        return polygon([(x0, y0), (x1, y0), (x1, y1), (x0, y1)])
    xa, xb, ya, yb = min(x0, x1), max(x0, x1), min(y0, y1), max(y0, y1)
    r = min(r, (xb - xa) / 2, (yb - ya) / 2)
    k = 0.5522847498 * r
    p = Path()
    p.moveTo(xa + r, ya)
    p.lineTo(xb - r, ya)
    p.cubicTo(xb - r + k, ya, xb, ya + r - k, xb, ya + r)
    p.lineTo(xb, yb - r)
    p.cubicTo(xb, yb - r + k, xb - r + k, yb, xb - r, yb)
    p.lineTo(xa + r, yb)
    p.cubicTo(xa + r - k, yb, xa, yb - r + k, xa, yb - r)
    p.lineTo(xa, ya + r)
    p.cubicTo(xa, ya + r - k, xa + r - k, ya, xa + r, ya)
    p.close()
    return simplify(p)


def ellipse(cx, cy, rx, ry, rot=0.0):
    """椭圆（四段三次曲线），rot 是转角（度，方向同 rotate）"""
    kx, ky = 0.5522847498 * rx, 0.5522847498 * ry
    p = Path()
    p.moveTo(rx, 0)
    p.cubicTo(rx, ky, kx, ry, 0, ry)
    p.cubicTo(-kx, ry, -rx, ky, -rx, 0)
    p.cubicTo(-rx, -ky, -kx, -ry, 0, -ry)
    p.cubicTo(kx, -ry, rx, -ky, rx, 0)
    p.close()
    if rot:
        p = rotate(p, rot)
    return simplify(move(p, cx, cy))


def circle(cx, cy, r):
    return ellipse(cx, cy, r, r)


def ring(cx, cy, r0, r1):
    """圆环：内半径 r0，外半径 r1"""
    return diff(circle(cx, cy, max(r0, r1)), circle(cx, cy, min(r0, r1)))


def ngon(cx, cy, r, n, rot=0.0):
    """正 n 边形，r 是外接圆半径，rot 是第一个顶点的角度（度，从 +x 起）"""
    return polygon([(cx + r * math.cos(math.radians(rot + 360 * i / n)),
                     cy + r * math.sin(math.radians(rot + 360 * i / n))) for i in range(n)])


def arc_band(cx, cy, r0, r1, a0, a1, steps=None):
    """环上从角 a0 到 a1（度，从 +x 起往 +y 转）的一段，内外半径 r0、r1"""
    if steps is None:
        steps = max(8, int(abs(a1 - a0) / 2))
    ang = np.radians(np.linspace(a0, a1, steps + 1))
    outer = np.stack([cx + r1 * np.cos(ang), cy + r1 * np.sin(ang)], 1)
    inner = np.stack([cx + r0 * np.cos(ang[::-1]), cy + r0 * np.sin(ang[::-1])], 1)
    return polygon(np.concatenate([outer, inner]))


def slab(p0, p1, w, ext0=0.0, ext1=0.0):
    """一段等宽的直条（矩形），两端可以各自延长 ext0、ext1"""
    return taper(p0, p1, w, w, ext0, ext1)


def taper(p0, p1, w0, w1, ext0=0.0, ext1=0.0):
    """一段宽度从 w0 渐变到 w1 的直条"""
    p0, p1 = np.asarray(p0, float), np.asarray(p1, float)
    d = p1 - p0
    L = float(np.linalg.norm(d)) or 1.0
    u = d / L
    nrm = np.array([-u[1], u[0]])
    a, b = p0 - u * ext0, p1 + u * ext1
    return polygon([a + nrm * w0 / 2, b + nrm * w1 / 2, b - nrm * w1 / 2, a - nrm * w0 / 2])


def polyline(pts, w, cap='butt', join='miter', closed=False, miter=4.0):
    """把折线描成等宽的轮廓（细线、几何线）。cap：butt 平、round 圆、square 方；join：miter、round、bevel"""
    p = Path()
    p.moveTo(*map(float, pts[0]))
    for q in pts[1:]:
        p.lineTo(*map(float, q))
    if closed:
        p.close()
    p.stroke(float(w), _CAP[cap], _JOIN[join], float(miter))
    return simplify(p)


# ================================================================ 曲线取点

def bezier(p0, p1, p2, p3, n=48):
    """三次贝塞尔上均匀取 n 个点（含两端），返回 n×2"""
    t = np.linspace(0, 1, n)[:, None]
    p0, p1, p2, p3 = (np.asarray(q, float) for q in (p0, p1, p2, p3))
    m = 1 - t
    return m ** 3 * p0 + 3 * m * m * t * p1 + 3 * m * t * t * p2 + t ** 3 * p3


def _catmull(p0, p1, p2, p3, n, alpha=0.5):
    def tj(ti, a, b):
        return ti + max(1e-6, float(np.linalg.norm(b - a))) ** alpha
    t0 = 0.0
    t1 = tj(t0, p0, p1)
    t2 = tj(t1, p1, p2)
    t3 = tj(t2, p2, p3)
    t = np.linspace(t1, t2, n, endpoint=False)[:, None]
    A1 = (t1 - t) / (t1 - t0) * p0 + (t - t0) / (t1 - t0) * p1
    A2 = (t2 - t) / (t2 - t1) * p1 + (t - t1) / (t2 - t1) * p2
    A3 = (t3 - t) / (t3 - t2) * p2 + (t - t2) / (t3 - t2) * p3
    B1 = (t2 - t) / (t2 - t0) * A1 + (t - t0) / (t2 - t0) * A2
    B2 = (t3 - t) / (t3 - t1) * A2 + (t - t1) / (t3 - t1) * A3
    return (t2 - t) / (t2 - t1) * B1 + (t - t1) / (t2 - t1) * B2


def spline(pts, n=16):
    """过所有点的光滑曲线（向心 Catmull-Rom），每段取 n 个点，返回 M×2（首尾两点保留）"""
    P = [np.asarray(p, float) for p in pts]
    if len(P) < 3:
        return np.array(P)
    P = [2 * P[0] - P[1]] + P + [2 * P[-1] - P[-2]]
    out = [_catmull(P[i - 1], P[i], P[i + 1], P[i + 2], n) for i in range(1, len(P) - 2)]
    out.append(P[-2][None, :])
    return np.concatenate(out, 0)


# ================================================================ 扫笔画

def _arclen(P):
    d = np.linalg.norm(np.diff(P, axis=0), axis=1)
    return np.concatenate([[0.0], np.cumsum(d)])


def _seg_widths(P, w):
    """宽的各种写法 → 每段 (起宽, 止宽)"""
    n = len(P) - 1
    if callable(w):
        s = _arclen(P)
        t = s / (s[-1] or 1.0)
        return [(float(w(t[k])), float(w(t[k + 1]))) for k in range(n)]
    if np.isscalar(w):
        return [(float(w), float(w))] * n
    w = list(w)
    if len(w) == n and all(np.isscalar(v) for v in w):
        return [(float(v), float(v)) for v in w]
    if len(w) == n and all(not np.isscalar(v) and len(v) == 2 for v in w):
        return [(float(a), float(b)) for a, b in w]
    if len(w) == n + 1:
        return [(float(w[k]), float(w[k + 1])) for k in range(n)]
    raise ValueError(f'宽要写成：一个数；每点一个（{n + 1} 个）；每段一个（{n} 个）；每段 (起, 止)（{n} 对）；或函数 f(t)')


def _unit(v):
    L = float(np.hypot(v[0], v[1]))
    return v / L if L > 1e-12 else v * 0


def _join(v, d0, d1, h0, h1, kind, miter):
    """转角外侧补的一块：v 转角点，d0 d1 前后两段的方向，h0 h1 前后的半宽"""
    cross = d0[0] * d1[1] - d0[1] * d1[0]
    dot = float(d0 @ d1)
    if abs(cross) < 1e-9 and dot > 0:
        return None
    s = -1.0 if cross > 0 else 1.0     # 外侧：往左转时在右边
    n0, n1 = np.array([-d0[1], d0[0]]), np.array([-d1[1], d1[0]])
    A, B = v + s * n0 * h0, v + s * n1 * h1
    if kind == 'round':
        turn = math.atan2(cross, dot)
        k = max(4, int(abs(turn) / math.radians(6)))
        pts = [v]
        for i in range(k + 1):
            th = turn * i / k
            c, sn = math.cos(th), math.sin(th)
            r = h0 + (h1 - h0) * i / k
            u = s * n0
            pts.append(v + np.array([u[0] * c - u[1] * sn, u[0] * sn + u[1] * c]) * r)
        return np.array(pts)
    if kind == 'miter':
        det = -cross
        if abs(det) > 1e-9:
            rhs = B - A
            t = (rhs[0] * (-d1[1]) - (-d1[0]) * rhs[1]) / det
            X = A + d0 * t
            if t >= 0 and np.linalg.norm(X - v) <= miter * max(h0, h1):
                return np.array([v, A, X, B])
    return np.array([v, A, B])


def cap_round():
    """端头：半圆"""
    return lambda p, d, w: circle(p[0], p[1], w / 2)


def cap_square(ext=None):
    """端头：方头，往外延长 ext（默认半宽）"""
    return lambda p, d, w: slab(p, p + d * (w / 2 if ext is None else ext), w)


def cap_point(length=None):
    """端头：三角尖，往外伸出 length（默认等于宽）"""
    def f(p, d, w):
        n = np.array([-d[1], d[0]])
        L = w if length is None else length
        return polygon([p + n * w / 2, p + d * L, p - n * w / 2])
    return f


def _cap(fn, p, d, w):
    if fn is None:
        return None, None
    r = fn(np.asarray(p, float), np.asarray(d, float), float(w))
    if r is None:
        return None, None
    if isinstance(r, tuple):
        return r[0], r[1]
    return r, None


def sweep(pts, w, cap0=None, cap1=None, join='miter', smooth=0, corner=None, miter=4.0):
    """沿中线扫出一条有宽度的轮廓（按方言重画笔画的通用机制）。

    pts     中线点列，从起笔到收笔
    w       宽：一个数；每点一个（N 个）；每段一个（N-1 个，段内不变）；每段 (起宽, 止宽)（N-1 对）；
            或函数 f(t)，t 是沿中线的长度比例（0 起笔，1 收笔）
    cap0    起笔的端头，cap1 收笔的端头：回调 f(p, d, w)，p 端点，d 朝外的单位方向，w 这一端的宽；
            返回要补上的 Path，或 (补的形, 挖的形)，或 None。不给就是平头。
            cap_round()、cap_square()、cap_point() 是三个最基本的；别的形状由调用方自己写。
    join    转角外侧的接法：miter 尖角（超过 miter 倍半宽时改切角）、round 圆、bevel 切
    smooth  >0 时先用过点的光滑曲线把中线加密，每段 smooth 个点（弯的笔画用，折角仍保持尖）；0 时按折线走
    corner  走向变化超过这个度数的顶点算折角（折、钩的转角）：按 join 接，smooth 时也不圆顺。
            默认折线时 30、smooth 时 75
    返回 Path。"""
    P = np.asarray(pts, float)
    if len(P) < 2:
        raise ValueError('中线至少两个点')
    W = _seg_widths(P, w)
    if corner is None:
        corner = 75.0 if smooth else 30.0
    if smooth and len(P) >= 3:
        # 在转角（夹角超过 corner）处断开，各段分别过点加密：弯的地方圆顺，折的地方仍是尖角。
        # 宽：函数按加密后的点重新取；数值在一段里按顶点线性过渡（每段一个宽时，相邻两段在顶点处取平均），转角处保持跳变
        cut = [0]
        for i in range(1, len(P) - 1):
            d0, d1 = _unit(P[i] - P[i - 1]), _unit(P[i + 1] - P[i])
            if math.degrees(math.atan2(abs(d0[0] * d1[1] - d0[1] * d1[0]), float(d0 @ d1))) >= corner:
                cut.append(i)
        cut.append(len(P) - 1)
        dense, dW = [], []
        for a, b in zip(cut[:-1], cut[1:]):
            seg, ws = P[a:b + 1], W[a:b]
            pw = [ws[0][0]] + [(ws[i - 1][1] + ws[i][0]) / 2 for i in range(1, len(ws))] + [ws[-1][1]]
            if len(seg) >= 3:
                q = spline(seg, int(smooth))
                T = _arclen(seg)
                Tq = _arclen(q)
                qw = np.interp(Tq / (Tq[-1] or 1.0), T / (T[-1] or 1.0), pw)
            else:
                q, qw = seg, np.array(pw, float)
            dW += [(float(qw[i]), float(qw[i + 1])) for i in range(len(q) - 1)]
            dense.append(q if not dense else q[1:])
        P = np.concatenate(dense, 0)
        W = _seg_widths(P, w) if callable(w) else dW
    # 去掉重合的点
    keep = [0]
    for i in range(1, len(P)):
        if np.linalg.norm(P[i] - P[keep[-1]]) > 1e-6:
            keep.append(i)
    if len(keep) < 2:
        raise ValueError('中线的点都重合了')
    if len(keep) != len(P):
        Wk = []
        for a, b in zip(keep[:-1], keep[1:]):
            Wk.append((W[a][0], W[b - 1][1]))
        P, W = P[keep], Wk
    polys = []
    D = [_unit(P[k + 1] - P[k]) for k in range(len(P) - 1)]
    for k in range(len(P) - 1):
        a, b = P[k], P[k + 1]
        n = np.array([-D[k][1], D[k][0]])
        wa, wb = W[k]
        polys.append(np.array([a + n * wa / 2, b + n * wb / 2, b - n * wb / 2, a - n * wa / 2]))
    for i in range(1, len(P) - 1):
        d0, d1 = D[i - 1], D[i]
        ang = math.degrees(math.atan2(abs(d0[0] * d1[1] - d0[1] * d1[0]), float(d0 @ d1)))
        j = _join(P[i], d0, d1, W[i - 1][1] / 2, W[i][0] / 2, join if ang >= corner else 'miter', miter)
        if j is not None:
            polys.append(j)
    body = _union_polys(polys)
    adds, cuts = [], []
    for fn, p, d, wv in ((cap0, P[0], -D[0], W[0][0]), (cap1, P[-1], D[-1], W[-1][1])):
        a, c = _cap(fn, p, d, wv)
        if a is not None:
            adds.append(a)
        if c is not None:
            cuts.append(c)
    if adds:
        body = union(body, adds)
    if cuts:
        body = diff(body, cuts)
    return body

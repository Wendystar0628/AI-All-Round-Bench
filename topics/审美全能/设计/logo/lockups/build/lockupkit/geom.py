"""矢量几何：字形轮廓、布尔运算、形状、展平与光栅化。

坐标约定：
- 字形设计在字体单位里做（1000 em，y 朝上），见 glyph()；
- 画板用舞台像素（视频 1920×1080 舞台），y 朝下；出图时再乘画板的倍数（canvas.Canvas）。
布尔运算用 skia-pathops，保留曲线；光栅化先展平再用 OpenCV 填充，带超采样抗锯齿。
"""
import math
import numpy as np
import cv2
import pathops
from pathops import Path, PathOp, PathVerb
from fontTools.ttLib import TTFont

# ---------------------------------------------------------------- 字体

_FONTS = {}


def font(path):
    if path not in _FONTS:
        f = TTFont(path, lazy=True)
        _FONTS[path] = (f, f.getBestCmap(), f.getGlyphSet())
    return _FONTS[path]


def glyph(path, ch, location=None):
    """返回字形轮廓（字体单位，y 朝上）和步进宽度。location 用于可变字体，例如 {'wght': 700}。"""
    f, cmap, gs = font(path)
    if location:
        gs = f.getGlyphSet(location=location)
    name = cmap[ord(ch)]
    p = Path()
    gs[name].draw(p.getPen())
    p.simplify()
    return p, gs[name].width


def text_path(fpath, s, size, x=0.0, y=0.0, tracking=0.0, location=None, kern=None):
    """一行西文：返回舞台坐标（y 朝下）的轮廓，基线在 y，size 为字号（px）。tracking 以 em 计。"""
    f, cmap, gs = font(fpath)
    upm = f['head'].unitsPerEm
    k = size / upm
    out = Path()
    pen_x = x
    advances = []
    for i, ch in enumerate(s):
        if ch == ' ':
            w = gs[cmap[32]].width if location is None else f.getGlyphSet(location=location)[cmap[32]].width
            pen_x += w * k + tracking * size
            advances.append(pen_x)
            continue
        g, w = glyph(fpath, ch, location)
        out = union(out, g.transform(k, 0, 0, -k, pen_x, y))
        pen_x += w * k + tracking * size
        if kern and i < len(s) - 1:
            pen_x += kern.get(s[i:i + 2], 0) * size
        advances.append(pen_x)
    return out, pen_x - x


# ---------------------------------------------------------------- 布尔与变换


def _ps(ps):
    out = []
    for p in ps:
        if p is None:
            continue
        if isinstance(p, (list, tuple)):
            out.extend(_ps(p))
        else:
            out.append(p)
    return out


def union(*ps):
    # 逐个 op 合并：OpBuilder 在“全是并集”时会把字腔当成外轮廓填掉，不能用
    ps = _ps(ps)
    if not ps:
        return Path()
    out = pathops.op(ps[0], Path(), PathOp.UNION, fix_winding=True)
    for p in ps[1:]:
        out = pathops.op(out, p, PathOp.UNION, fix_winding=True)
    return out


def diff(a, *bs):
    bs = _ps(bs)
    if not bs:
        return a
    return pathops.op(a, union(*bs), PathOp.DIFFERENCE, fix_winding=True)


def inter(a, *bs):
    out = a
    for b in _ps(bs):
        out = pathops.op(out, b, PathOp.INTERSECTION, fix_winding=True)
    return out


def xor(a, b):
    return pathops.op(a, b, PathOp.XOR, fix_winding=True)


def tf(p, a=1, b=0, c=0, d=1, e=0, f=0):
    """SVG 顺序的仿射：x' = a x + c y + e，y' = b x + d y + f。"""
    return p.transform(a, b, c, d, e, f)


def move(p, dx, dy):
    return p.transform(1, 0, 0, 1, dx, dy)


def scale_about(p, sx, sy, cx, cy):
    return p.transform(sx, 0, 0, sy, cx - sx * cx, cy - sy * cy)


def rotate_about(p, deg, cx, cy):
    t = math.radians(deg)
    c, s = math.cos(t), math.sin(t)
    return p.transform(c, s, -s, c, cx - c * cx + s * cy, cy - s * cx - c * cy)


def bounds(p):
    return p.bounds


# ---------------------------------------------------------------- 形状


def poly(pts):
    p = Path()
    pts = [tuple(map(float, q)) for q in pts]
    p.moveTo(*pts[0])
    for q in pts[1:]:
        p.lineTo(*q)
    p.close()
    return union(p)  # 规范绕向


def rect(x0, y0, x1, y1):
    return poly([(x0, y0), (x1, y0), (x1, y1), (x0, y1)])


def circle(cx, cy, r):
    k = 0.5522847498 * r
    p = Path()
    p.moveTo(cx + r, cy)
    p.cubicTo(cx + r, cy + k, cx + k, cy + r, cx, cy + r)
    p.cubicTo(cx - k, cy + r, cx - r, cy + k, cx - r, cy)
    p.cubicTo(cx - r, cy - k, cx - k, cy - r, cx, cy - r)
    p.cubicTo(cx + k, cy - r, cx + r, cy - k, cx + r, cy)
    p.close()
    return union(p)


def ring(cx, cy, r0, r1):
    return diff(circle(cx, cy, r1), circle(cx, cy, r0))


def ngon(cx, cy, r, n, rot=0.0):
    return poly([(cx + r * math.cos(math.radians(rot + 360 * i / n)), cy + r * math.sin(math.radians(rot + 360 * i / n))) for i in range(n)])


def slab(p0, p1, w, ext0=0.0, ext1=0.0):
    """一段有宽度的直线（矩形），两端可以各自延长。"""
    (x0, y0), (x1, y1) = p0, p1
    dx, dy = x1 - x0, y1 - y0
    L = math.hypot(dx, dy) or 1.0
    ux, uy = dx / L, dy / L
    nx, ny = -uy * w / 2, ux * w / 2
    x0, y0 = x0 - ux * ext0, y0 - uy * ext0
    x1, y1 = x1 + ux * ext1, y1 + uy * ext1
    return poly([(x0 + nx, y0 + ny), (x1 + nx, y1 + ny), (x1 - nx, y1 - ny), (x0 - nx, y0 - ny)])


def taper(p0, p1, w0, w1):
    (x0, y0), (x1, y1) = p0, p1
    dx, dy = x1 - x0, y1 - y0
    L = math.hypot(dx, dy) or 1.0
    nx, ny = -dy / L, dx / L
    return poly([(x0 + nx * w0 / 2, y0 + ny * w0 / 2), (x1 + nx * w1 / 2, y1 + ny * w1 / 2),
                 (x1 - nx * w1 / 2, y1 - ny * w1 / 2), (x0 - nx * w0 / 2, y0 - ny * w0 / 2)])


def arc_band(cx, cy, r0, r1, a0, a1, steps=None):
    """环上一段（角度，度，逆时针，数学坐标或屏幕坐标都可，取决于调用方的 y 方向）。"""
    if steps is None:
        steps = max(8, int(abs(a1 - a0) / 2))
    outer = [(cx + r1 * math.cos(math.radians(a0 + (a1 - a0) * i / steps)), cy + r1 * math.sin(math.radians(a0 + (a1 - a0) * i / steps))) for i in range(steps + 1)]
    inner = [(cx + r0 * math.cos(math.radians(a1 - (a1 - a0) * i / steps)), cy + r0 * math.sin(math.radians(a1 - (a1 - a0) * i / steps))) for i in range(steps + 1)]
    return poly(outer + inner)


def star4(cx, cy, r, waist=0.16, rot=0.0, ry=None):
    """四角星芒：四个尖，腰收得很细。ry 给竖向的长度（不同则成十字长芒）。"""
    ry = r if ry is None else ry
    pts = []
    for i in range(8):
        a = math.radians(rot + 45 * i)
        if i % 2 == 0:
            rr = r if i % 4 == 0 else ry
        else:
            rr = min(r, ry) * waist
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    return poly(pts)


def stroke_line(pts, w, closed=False, cap='butt', join='miter'):
    """把折线描成一条有宽度的轮廓（发丝线、几何线）。"""
    p = Path()
    p.moveTo(*pts[0])
    for q in pts[1:]:
        p.lineTo(*q)
    if closed:
        p.close()
    capv = {'butt': pathops.LineCap.BUTT_CAP, 'round': pathops.LineCap.ROUND_CAP, 'square': pathops.LineCap.SQUARE_CAP}[cap]
    joinv = {'miter': pathops.LineJoin.MITER_JOIN, 'round': pathops.LineJoin.ROUND_JOIN, 'bevel': pathops.LineJoin.BEVEL_JOIN}[join]
    p.stroke(w, capv, joinv, 4)
    return union(p)


# ---------------------------------------------------------------- 展平与光栅化


def _cubic(p0, p1, p2, p3, n):
    t = np.linspace(0, 1, n + 1)[1:, None]
    mt = 1 - t
    return mt ** 3 * p0 + 3 * mt ** 2 * t * p1 + 3 * mt * t ** 2 * p2 + t ** 3 * p3


def _quad(p0, p1, p2, n):
    t = np.linspace(0, 1, n + 1)[1:, None]
    mt = 1 - t
    return mt ** 2 * p0 + 2 * mt * t * p1 + t ** 2 * p2


def flatten(p, tol=0.2):
    """展平成多边形列表（每个是 N×2 数组）。tol 是在当前坐标系里的最大弦高。"""
    contours = []
    cur = []
    last = None
    start = None
    for verb, pts in p:
        if verb == PathVerb.MOVE:
            if len(cur) > 2:
                contours.append(np.array(cur))
            cur = [pts[0]]
            last = np.array(pts[0])
            start = last
        elif verb == PathVerb.LINE:
            cur.append(pts[0])
            last = np.array(pts[0])
        elif verb == PathVerb.QUAD:
            c = np.array(pts)
            L = np.linalg.norm(c[0] - last) + np.linalg.norm(c[1] - c[0])
            n = max(2, int(math.sqrt(L / max(tol, 1e-3)) * 1.2))
            seg = _quad(last, c[0], c[1], n)
            cur.extend(map(tuple, seg))
            last = c[1]
        elif verb == PathVerb.CUBIC:
            c = np.array(pts)
            L = np.linalg.norm(c[0] - last) + np.linalg.norm(c[1] - c[0]) + np.linalg.norm(c[2] - c[1])
            n = max(2, int(math.sqrt(L / max(tol, 1e-3)) * 1.4))
            seg = _cubic(last, c[0], c[1], c[2], n)
            cur.extend(map(tuple, seg))
            last = c[2]
        elif verb == PathVerb.CLOSE:
            if len(cur) > 2:
                contours.append(np.array(cur))
            cur = []
    if len(cur) > 2:
        contours.append(np.array(cur))
    return contours


def raster(p, W, H, M=(1, 0, 0, 1, 0, 0), ss=2):
    """把轮廓画成 H×W 的覆盖率（float32，0–1）。M 是 SVG 顺序的仿射，把轮廓坐标映到像素。"""
    q = p.transform(*[v * ss if i in (0, 1, 2, 3, 4, 5) else v for i, v in enumerate(M)])
    img = np.zeros((H * ss, W * ss), np.uint8)
    cs = flatten(q, tol=0.15)
    if cs:
        SH = 4
        arr = [np.round(c * (1 << SH)).astype(np.int32).reshape(-1, 1, 2) for c in cs]
        cv2.fillPoly(img, arr, 255, lineType=cv2.LINE_AA, shift=SH)
    if ss > 1:
        img = cv2.resize(img, (W, H), interpolation=cv2.INTER_AREA)
    return img.astype(np.float32) / 255.0

"""笔画手术：在字体轮廓上做艺术字改造。全部在字体单位里（1000 em，y 朝上）。

两类：
  整字的规则（T.op(fn) 加在每个字上）       facet 刻面 · thicken_h 横画加厚
  一笔的手术（Sel.op(fn) / Stroke.op(fn)）  foot 斜切脚 · fin 鳍 · seam 分缝 · chamfer 倒角
  画形状（给 variant / add 用，返回 Path）  shard 两头尖的刃 · blade 沿中线长一把刀 · rod 液压杆
一笔的手术签名是 fn(path, s, **kw) -> path，s 是这一笔（strokes.Stroke），位置和大小都从它的中线、宽、切出来的形取。
"""
import math
import numpy as np
from pathops import Path, PathVerb
from .geom import union, diff, poly, rect, move, stroke_line
from .strokes import _vertices

# ============================================================== 整字的规则


def facet(p, tol=3.0):
    """把所有曲线换成直线刻面：每段曲线按 Wang 公式切成最少的直段，保证偏差不超过 tol。"""
    out = Path()
    last = None
    for verb, pts in p:
        if verb == PathVerb.MOVE:
            out.moveTo(*pts[0])
            last = np.array(pts[0])
        elif verb == PathVerb.LINE:
            out.lineTo(*pts[0])
            last = np.array(pts[0])
        elif verb in (PathVerb.CUBIC, PathVerb.QUAD):
            c = np.array(pts)
            if verb == PathVerb.QUAD:
                p0, q1, p3 = last, c[0], c[1]
                c = np.array([p0 + 2 / 3 * (q1 - p0), p3 + 2 / 3 * (q1 - p3), p3])
            p0, p1, p2, p3 = last, c[0], c[1], c[2]
            M = max(np.linalg.norm(p0 - 2 * p1 + p2), np.linalg.norm(p1 - 2 * p2 + p3))
            n = max(1, int(math.ceil(math.sqrt(0.75 * M / tol))))
            for i in range(1, n + 1):
                t = i / n
                mt = 1 - t
                q = mt ** 3 * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t ** 3 * p3
                out.lineTo(float(q[0]), float(q[1]))
            last = p3
        elif verb == PathVerb.CLOSE:
            out.close()
    return union(out)


def thicken_h(p, d, steps=4):
    """竖向膨胀 d（上下各 d）：横画从发丝变实，竖画几乎不变。"""
    ps = [p]
    for i in range(1, steps + 1):
        k = d * i / steps
        ps += [move(p, 0, k), move(p, 0, -k)]
    return union(ps)


# ============================================================== 一笔的手术


def _band_x(s, y0, y1):
    """这一笔切出来的形在 y0–y1 这一条里的左右范围"""
    v = _vertices(s.piece)
    m = v[(v[:, 1] >= y0) & (v[:, 1] <= y1)]
    if len(m) == 0:
        c = s.end
        return c[0] - s.w_end / 2, c[0] + s.w_end / 2
    return float(m[:, 0].min()), float(m[:, 0].max())


def foot_cut(p, x0, x1, ytop, yl, yr, below=-600):
    """把 x0–x1 之间、ytop 以下的字脚换成一刀直切：左端落到 yl，右端落到 yr。"""
    cut = diff(p, rect(x0, below, x1, ytop))
    return union(cut, poly([(x0, ytop + 2), (x1, ytop + 2), (x1, yr), (x0, yl)]))


def foot(p, s, slant=-1, lift=0.45, drop=22, rise=None):
    """宋体的圆字脚一刀斜切（收笔朝下的笔画）。slant=-1 左低右高，+1 右低左高；
    切口从字脚最低处往上 lift×宽 处开始，低的一角比原来的最低处再低 drop，高的一角在切口高度（或 rise）。"""
    v = _vertices(s.piece)
    ymin = float(v[:, 1].min())
    w = s.w_end
    x0, x1 = _band_x(s, ymin, ymin + 0.7 * w)
    ytop = ymin + lift * w
    lo, hi = ymin - drop, (ytop if rise is None else ymin + rise)
    yl, yr = (lo, hi) if slant < 0 else (hi, lo)
    return foot_cut(p, x0 - 1, x1 + 1, ytop, yl, yr)


def serif_apex(s):
    """宋体横末的三角（或横折转角上的三角）最高的那一点；没有时 None。
    收笔是横（横、竖折）：找收笔附近；第一段是横的折、钩：找第一个转角附近。只在这一笔切出来的形里找。"""
    ax = s.axis
    if abs(s.end_dir[1]) < 0.3 and s.end_dir[0] > 0:
        c = s.end
        box = (c[0] - 280, c[1] + s.ws[-1] / 2 + 12, c[0] + 90, c[1] + 300)
    elif len(ax) > 2 and abs(s.start_dir[1]) < 0.3:
        c = ax[1]
        box = (c[0] - 140, c[1] + s.ws[0] / 2 + 12, c[0] + 180, c[1] + 300)
    else:
        return None
    v = _vertices(s.piece)
    m = v[(v[:, 0] >= box[0]) & (v[:, 0] <= box[2]) & (v[:, 1] >= box[1]) & (v[:, 1] <= box[3])]
    if len(m) == 0:
        return None
    q = m[np.argmax(m[:, 1])]
    return float(q[0]), float(q[1])


def move_points(p, center, dx, dy, r):
    """把 center 附近 r 以内的轮廓点（含控制点）一起平移 (dx, dy)"""
    ax, ay = center
    out = Path()
    for verb, pts in p:
        pts = [(q[0] + dx, q[1] + dy) if (q[0] - ax) ** 2 + (q[1] - ay) ** 2 <= r * r else q for q in pts]
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
    return union(out)


def fin(p, s, dx=16, dy=52, r=30):
    """横末三角拔高、削尖成装甲鳍：三角的尖和它附近的点一起往 (dx, dy) 拉。找不到三角的笔画不动。"""
    a = serif_apex(s)
    return p if a is None else move_points(p, a, dx, dy, r)


def stepped_seam(x0, x1, y, step_at, step_h, slope=1.0):
    """机甲面板线常见的折缝：先平走，在 step_at 处 45° 折下 step_h，再平走。返回折线点。"""
    xb = step_at + step_h / slope
    return [(x0, y), (step_at, y), (xb, y - step_h), (x1, y - step_h)]


def seam(p, s, t=0.5, w=11, step=0.22, at=-0.15, over=10):
    """横切过一笔粗竖的折线分缝（装甲面板线）：在中线 t 处，缝宽 w，折下 step×宽，折点在中线偏 at×宽。
    缝的中线登记在字的 seams 里（渲染时往缝里灌光）。"""
    c = s.point(t)
    wk = s.w_at(t)
    pts = stepped_seam(c[0] - wk / 2 - over, c[0] + wk / 2 + over + 2, c[1], c[0] + at * wk, step * wk)
    s.g.seams.append({'pts': pts, 'w': w, 'stroke': s.id})
    return diff(p, stroke_line(pts, w, cap='square', join='miter'))


def chamfer(p, corner, size, direction):
    """切掉一个直角（45°）：corner 是角点，direction 是角朝外的方向 (sx, sy)，例如左下角 (-1, -1)。"""
    cx, cy = corner
    sx, sy = direction
    tri = poly([(cx + sx * 2, cy + sy * 2), (cx - sx * size, cy + sy * 2), (cx + sx * 2, cy - sy * size)])
    return diff(p, tri)


# ============================================================== 画形状（字体单位）


def shard(tail, head, w, k=0.66):
    """风筝形的刃：tail 端细长、尖；在 k 处最宽（w）；head 端短而尖。"""
    (x0, y0), (x1, y1) = tail, head
    dx, dy = x1 - x0, y1 - y0
    L = math.hypot(dx, dy)
    ux, uy = dx / L, dy / L
    nx, ny = -uy, ux
    mx, my = x0 + dx * k, y0 + dy * k
    return poly([(x0, y0), (mx + nx * w / 2, my + ny * w / 2), (x1, y1), (mx - nx * w / 2, my - ny * w / 2)])


def blade(pts, widths, tip='chisel', tip_len=None):
    """沿中心线 pts 长一把刀：widths 是每个点上的宽度；tip='chisel' 时末端是一刀斜切的硬尖。"""
    pts = [np.array(q, float) for q in pts]
    left, right = [], []
    for i, q in enumerate(pts):
        d = pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]
        d = d / (np.linalg.norm(d) + 1e-9)
        n = np.array([-d[1], d[0]])
        left.append(q + n * widths[i] / 2)
        right.append(q - n * widths[i] / 2)
    if tip == 'chisel':
        d = pts[-1] - pts[-2]
        d = d / np.linalg.norm(d)
        apex = pts[-1] + d * (tip_len if tip_len is not None else widths[-1] * 2.2)
        shape = left + [apex] + right[::-1]
    else:
        shape = left + right[::-1]
    return poly([tuple(q) for q in shape])


def stroke_blade(s, back=0.25, ext=100, widths=None, tip_len=None, bend=0.0):
    """把一笔的收笔拉成一把刀：从中线 1-back 处起，经收笔，再顺着收笔方向（可再偏 bend 度）伸出 ext。
    widths 三个数（起、收笔处、末端），默认取这一笔的宽往下收。"""
    a = s.point(1 - back)
    e = s.end
    d = s.end_dir
    if bend:
        t = math.radians(bend)
        d = np.array([d[0] * math.cos(t) - d[1] * math.sin(t), d[0] * math.sin(t) + d[1] * math.cos(t)])
    w0 = s.w_at(1 - back)
    ws = widths or (w0 * 0.85, w0 * 0.5, w0 * 0.18)
    return blade([tuple(a), tuple(e), tuple(e + d * ext)], ws, tip_len=tip_len)


def rod(x, y_top, segs):
    """液压杆：从 y_top 往下一节节接。segs = [(长度, 宽度, 套箍宽, 套箍高), ...]。返回 (轮廓, 末端点)。"""
    parts = []
    y = y_top
    for L, w, cw, ch in segs:
        parts.append(rect(x - w / 2, y - L, x + w / 2, y))
        if cw and ch:
            parts.append(rect(x - cw / 2, y - ch, x + cw / 2, y))
        y -= L
    return union(parts), (x, y)

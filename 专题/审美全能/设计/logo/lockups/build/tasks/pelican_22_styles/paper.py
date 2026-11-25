"""06 鹈鹕 · 剪纸条：把一个字的每一笔剪成一条单独的纸条（字体单位，1000 em，y 朝上）。本题自己的构造方法，不用 lockupkit 的机甲手术。

做法
  1. 切：每一笔先从整字里切出来（strokes.Glyph 的 piece），再按笔画标注的中线和宽“裁干净”——
     别的笔画的身子（中线 ± 宽/2）从这一条里拿掉，只有两笔真交叉（中线在彼此中段相交，比如「十」）时两条都保留完整，
     交叉处一条压一条；横碰到竖（丁字、拐角）时，这一条只留到自己中线的尽头，盖在竖上的那一截就是“压上去的一截纸”。
     宋体的横末三角、竖头、钩尖这些在中线外面的部分（标注图里的红块）照样归给最近的那一笔。
  2. 剪：曲线换成几刀直边（剪刀走不出顺滑的弧）；长边分成几刀，刀与刀之间有一点点折角；竖的圆字脚一刀斜剪。
  3. 加宽：发丝横往上下加厚到剪得出来的宽度（对比降低）。
  4. 贴：每一条有自己的一点歪斜和错位（手贴的），按笔顺一条压一条。
每一条交出 {'path', 'kind', 'id', 'z'}：kind 是用哪种纸（ink 黑卡纸 · red 剪纸红 · red_dk 深一档的红 · white 纸白 · pupil 眼珠）。
"""
import math
import numpy as np
from pathops import Path, PathVerb
from lockupkit.geom import union, diff, inter, slab, poly, rotate_about, move, flatten
from lockupkit.strokes import dist_to_polyline, _area


# ====================================================================== 一笔的身子


def core(s, grow=0.0, ext=0.0):
    """这一笔的身子：沿中线每段一条宽 ws[k] + 2·grow 的板；段与段的拐角补齐；两头各伸 ext"""
    parts = []
    n = len(s.axis) - 1
    for k, (a, b) in enumerate(zip(s.axis[:-1], s.axis[1:])):
        w = s.ws[k] + 2 * grow
        e0 = ext if k == 0 else w / 2
        e1 = ext if k == n - 1 else w / 2
        parts.append(slab(tuple(a), tuple(b), w, e0, e1))
    return union(parts)


def _seg_x(a, b, c, d):
    """两段线的交点参数 (u, v)，不相交时 None"""
    r, s = b - a, d - c
    den = r[0] * s[1] - r[1] * s[0]
    if abs(den) < 1e-9:
        return None
    q = c - a
    u = (q[0] * s[1] - q[1] * s[0]) / den
    v = (q[0] * r[1] - q[1] * r[0]) / den
    if 0 <= u <= 1 and 0 <= v <= 1:
        return u, v
    return None


def _frac(s, k, u):
    L = s.seglens
    return (sum(L[:k]) + L[k] * u) / max(1e-9, s.length)


def crosses(s, t, margin=0.1):
    """两笔真交叉：中线相交，并且交点在两笔各自的中段（不是谁的头或尾碰上了谁）"""
    for i, (a, b) in enumerate(zip(s.axis[:-1], s.axis[1:])):
        for j, (c, d) in enumerate(zip(t.axis[:-1], t.axis[1:])):
            x = _seg_x(a, b, c, d)
            if x is None:
                continue
            fs, ft = _frac(s, i, x[0]), _frac(t, j, x[1])
            if margin < fs < 1 - margin and margin < ft < 1 - margin:
                return True
    return False


def keep_big(p, frac=0.04, floor=600.0):
    """只留大块：去掉切剩的碎屑（面积小于最大块的 frac 或 floor 的），字腔（反向的轮廓）留着"""
    cs = list(p.contours)
    if len(cs) <= 1:
        return p
    areas = []
    for c in cs:
        q = flatten(c, tol=1.0)
        a = 0.0
        for arr in q:
            x, y = arr[:, 0], arr[:, 1]
            a += 0.5 * float(np.dot(x, np.roll(y, -1)) - np.dot(y, np.roll(x, -1)))
        areas.append(a)
    big = max(abs(a) for a in areas)
    sign = 1 if areas[int(np.argmax([abs(a) for a in areas]))] > 0 else -1
    out = Path()
    pen = out.getPen()
    for c, a in zip(cs, areas):
        if not (a * sign < 0 or abs(a) >= max(floor, frac * big)):
            continue
        started = False
        for verb, pts in c:
            if verb == PathVerb.MOVE:
                pen.moveTo(pts[0]); started = True
            elif verb == PathVerb.LINE:
                pen.lineTo(pts[0])
            elif verb == PathVerb.QUAD:
                pen.qCurveTo(*pts)
            elif verb == PathVerb.CUBIC:
                pen.curveTo(*pts)
            elif verb == PathVerb.CLOSE:
                pen.closePath(); started = False
        if started:
            pen.closePath()
    return union(out)


def cut_strips(g):
    """一个字的每一笔裁成干净的纸条（还没有剪、加宽、贴）。返回 {笔序: Path}"""
    S = g.strokes
    # 没盖到的碎块重新按最近的中线分一遍（Glyph 已经并进 piece 了，这里要单独知道是谁的）
    extra = {s.n: [] for s in S}
    for c in g.residue.contours:
        if _area(c) < 4:
            continue
        b = c.bounds
        q = ((b[0] + b[2]) / 2, (b[1] + b[3]) / 2)
        s = min(S, key=lambda s: dist_to_polyline(q, s.axis))
        extra[s.n].append(c)
    cores = {s.n: core(s) for s in S}
    out = {}
    for s in S:
        if s.c is not None:
            out[s.n] = s.piece
            continue
        mine = union(inter(s.piece, core(s, grow=max(26.0, 0.28 * s.w), ext=max(30.0, 0.5 * s.w_end))), *extra[s.n])
        others = [cores[t.n] for t in S if t is not s and not crosses(s, t)]
        if others:
            mine = diff(mine, diff(union(others), cores[s.n]))
        out[s.n] = keep_big(mine)
    return out


# ====================================================================== 剪


def facet(p, tol=9.0):
    """曲线换成直刀：每段曲线切成最少的直段，偏差不超过 tol"""
    out = Path()
    last = None
    for verb, pts in p:
        if verb == PathVerb.MOVE:
            out.moveTo(*pts[0]); last = np.array(pts[0])
        elif verb == PathVerb.LINE:
            out.lineTo(*pts[0]); last = np.array(pts[0])
        elif verb in (PathVerb.CUBIC, PathVerb.QUAD):
            c = np.array(pts)
            if verb == PathVerb.QUAD:
                p0, q1, p3 = last, c[0], c[1]
                c = np.array([p0 + 2 / 3 * (q1 - p0), p3 + 2 / 3 * (q1 - p3), p3])
            p0, p1, p2, p3 = last, c[0], c[1], c[2]
            M = max(np.linalg.norm(p0 - 2 * p1 + p2), np.linalg.norm(p1 - 2 * p2 + p3))
            n = max(1, int(math.ceil(math.sqrt(0.75 * M / tol))))
            for i in range(1, n + 1):
                t = i / n; mt = 1 - t
                q = mt ** 3 * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t ** 3 * p3
                out.lineTo(float(q[0]), float(q[1]))
            last = p3
        elif verb == PathVerb.CLOSE:
            out.close()
    return union(out)


def snips(p, rng, snip=210.0, amp=3.2, wob=1.6):
    """长边分成几刀：每刀之间的点沿法线错开一点（刀与刀之间一个小折角）；所有顶点再抖一点（手剪）。
    只动直线段的点；输入是已经剪成直刀的轮廓。"""
    out = Path()
    for c in flatten(p, tol=0.5):
        pts = [np.array(q, float) for q in c]
        if len(pts) < 3:
            continue
        new = []
        n = len(pts)
        for i in range(n):
            a, b = pts[i], pts[(i + 1) % n]
            a2 = a + rng.normal(0, wob, 2)
            new.append(a2)
            L = float(np.linalg.norm(b - a))
            k = int(L // snip)
            if k >= 1:
                d = (b - a) / L
                nrm = np.array([-d[1], d[0]])
                for j in range(1, k + 1):
                    t = j / (k + 1)
                    new.append(a + (b - a) * t + nrm * rng.uniform(-amp, amp))
        out.moveTo(*new[0])
        for q in new[1:]:
            out.lineTo(*q)
        out.close()
    return union(out)


def halfplane_cut(p, pt, nrm, big=3000):
    """拿掉 (x - pt)·nrm > 0 的那一半"""
    n = np.array(nrm, float); n /= np.linalg.norm(n)
    t = np.array([-n[1], n[0]])
    c = np.array(pt, float)
    box = poly([tuple(c + t * big), tuple(c + t * big + n * big), tuple(c - t * big + n * big), tuple(c - t * big)])
    return diff(p, box)


def foot_snip(p, s, slant=1, lift=0.22, deg=16.0):
    """竖的圆字脚一刀斜剪：在字脚最低处往上 lift×宽 的地方下刀，刀口偏水平 deg 度（slant=1 左低右高）"""
    v = np.array([q for c in flatten(p, tol=2.0) for q in c])
    e = s.end
    near = v[np.abs(v[:, 0] - e[0]) < s.w_end * 0.8]
    ymin = float(near[:, 1].min()) if len(near) else float(v[:, 1].min())
    a = math.radians(deg) * slant
    nrm = (math.sin(a), -math.cos(a))
    return halfplane_cut(p, (e[0], ymin + lift * s.w_end), nrm)


def thicken_v(p, d, steps=4):
    """竖向加厚：上下各 d（横从发丝变成剪得出来的纸条，竖几乎不变）"""
    ps = [p]
    for i in range(1, steps + 1):
        k = d * i / steps
        ps += [move(p, 0, k), move(p, 0, -k)]
    return union(ps)


def paste(p, rng, rot=0.7, shift=4.0, about=None):
    """手贴：每一条转一点、挪一点"""
    b = p.bounds
    c = about if about is not None else ((b[0] + b[2]) / 2, (b[1] + b[3]) / 2)
    q = rotate_about(p, rng.uniform(-rot, rot), c[0], c[1])
    return move(q, rng.uniform(-shift, shift), rng.uniform(-shift, shift))


def ngon_cut(cx, cy, r, n=14, rot=0.0, rng=None, amp=0.0):
    """剪刀剪的圆：n 刀直边，每个顶点抖一点"""
    pts = []
    for i in range(n):
        a = math.radians(rot + 360 * i / n)
        rr = r + (rng.uniform(-amp, amp) if rng is not None else 0)
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    return poly(pts)

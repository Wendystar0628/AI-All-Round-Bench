"""03 · 本题自己的矢量构造（字体单位或舞台坐标都可，调用方定）。不进共用库；值得归进去的在交回说明里写。

  bez(p0, p1, p2, p3, n)          三次贝塞尔取点
  ribbon(spine, widths, …)        沿一条中线（点列）按每点的宽画一条带：两头可以是尖、平或圆
  leaf(a, b, w, belly, bend)      叶形：两头尖，最宽处在 belly，中线可以弯 bend（占长度的比例）
  ball_drop(xe, yb, r, hair, …)   球形收笔：发丝横的末端收成一颗球，球和发丝之间一道利落的切线颈
  spiral(c, r0, r1, a0, turns, …) 卷须：半径由 r0 收到 r1 的螺线，末端一颗球
  pts_path(pts)                   点列 → 闭合轮廓
"""
import math
import numpy as np
from lockupkit.geom import union, poly, circle


def bez(p0, p1, p2, p3, n=48):
    t = np.linspace(0, 1, n)[:, None]
    p0, p1, p2, p3 = (np.asarray(q, float) for q in (p0, p1, p2, p3))
    m = 1 - t
    return m ** 3 * p0 + 3 * m * m * t * p1 + 3 * m * t * t * p2 + t ** 3 * p3


def chain(*segs):
    """几段贝塞尔（每段 4 个控制点）连成一条点列，接缝处去重"""
    out = []
    for s in segs:
        q = bez(*s)
        out.extend(q if not out else q[1:])
    return np.array(out)


def _normals(P):
    d = np.gradient(P, axis=0)
    d /= np.linalg.norm(d, axis=1, keepdims=True) + 1e-9
    return np.stack([-d[:, 1], d[:, 0]], 1)


def ribbon(spine, widths, cap0='point', cap1='point'):
    """沿中线 spine（N×2）画带，widths 是每点的全宽（N 个，或函数 f(t)）。cap 'point' 尖、'flat' 平。返回 Path。"""
    P = np.asarray(spine, float)
    n = len(P)
    t = np.linspace(0, 1, n)
    W = np.array([widths(x) for x in t]) if callable(widths) else np.interp(t, np.linspace(0, 1, len(widths)), widths)
    N = _normals(P)
    L = P + N * (W[:, None] / 2)
    R = P - N * (W[:, None] / 2)
    pts = list(map(tuple, L)) + list(map(tuple, R[::-1]))
    return poly(pts)


def leaf(a, b, w, belly=0.56, bend=0.1, n=40, sharp=1.0):
    """叶形：a、b 两头尖（sharp 越大尖得越利），最宽 w 在 belly 处；中线向左（a→b 的左手）弯 bend×长"""
    a, b = np.asarray(a, float), np.asarray(b, float)
    d = b - a
    L = float(np.linalg.norm(d))
    u = d / L
    nrm = np.array([-u[1], u[0]])
    t = np.linspace(0, 1, n)
    spine = a + np.outer(t, d) + np.outer(np.sin(np.pi * t) * bend * L, nrm)
    al = belly / (1 - belly)
    prof = t ** (al * sharp) * (1 - t) ** sharp
    prof /= prof.max()
    return ribbon(spine, lambda x: w * float(np.interp(x, t, prof)))


def tangent_point(p, c, r, side=1):
    """从圆外一点 p 引到圆 (c, r) 的切点；side 选两条切线中的哪一条"""
    p, c = np.asarray(p, float), np.asarray(c, float)
    v = p - c
    d = float(np.linalg.norm(v))
    a = math.acos(min(1.0, r / d))
    base = math.atan2(v[1], v[0])
    ang = base + side * a
    return c + r * np.array([math.cos(ang), math.sin(ang)])


def ball_drop(xe, yb, r, hair, neck=2.4, lift=0.0):
    """发丝横（底边 yb、厚 hair）的末端 xe 收成一颗球：球的右缘在 xe，球底贴着发丝底边（lift 往上抬）。
    球和发丝上沿之间一道切线颈（从球心往左 neck×r 处的发丝上沿起），颈是直线，所以接口利落。y 朝上。"""
    c = np.array([xe - r, yb + r + lift])
    p = np.array([c[0] - neck * r, yb + hair])
    q = tangent_point(p, c, r, side=-1)          # 上面那条切线（y 朝上时顺时针一侧）
    if q[1] < c[1]:
        q = tangent_point(p, c, r, side=1)
    wedge = poly([tuple(p), tuple(q), (c[0], c[1]), (c[0], yb), (p[0], yb)])
    return union(circle(c[0], c[1], r), wedge), c


def spiral(c, r0, r1, a0, turns, w0, w1, ccw=True, n=120, ball=None):
    """卷须：从角 a0（度）起，半径 r0 收到 r1，转 turns 圈；带宽 w0 收到 w1；末端一颗球（半径 ball）"""
    c = np.asarray(c, float)
    s = 1 if ccw else -1
    t = np.linspace(0, 1, n)
    ang = np.radians(a0) + s * t * turns * 2 * np.pi
    rr = r0 * (r1 / r0) ** t
    P = c + np.stack([rr * np.cos(ang), rr * np.sin(ang)], 1)
    out = ribbon(P, lambda x: w0 + (w1 - w0) * x, cap0='flat')
    if ball:
        out = union(out, circle(P[-1][0], P[-1][1], ball))
    return out, P


def pts_path(pts):
    return poly([tuple(map(float, q)) for q in pts])

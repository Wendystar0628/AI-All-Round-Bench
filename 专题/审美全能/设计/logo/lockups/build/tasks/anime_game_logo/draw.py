"""本题自己的作图工具（舞台坐标或字体单位都可以，只做几何）。

  spline(pts, n)                  过点的光滑曲线（向心 Catmull-Rom），返回 N×2
  arclen(P)                       每个点的累计弧长
  ribbon(P, widths)               沿中线 P 按每点的宽画一条带（尖头笔、花饰、针尖），返回 Path
  pen_widths(P, thin, thick, ...) 尖头笔的粗细：往下走粗、往上和横走细（竖向重心，Didone 的那支笔），两端收尖
  needle(base, width, d, length)  从 base 顺着方向 d 拉出的一根针尖（三角）
  ellipse_pts(cx, cy, rx, ry, rot, t0, t1, n)
  dash_beads(P, every, r0, r1)    沿线等距的一串圆珠，半径从 r0 渐变到 r1（网点梯尺）

可以考虑以后归进 lockupkit 的：ribbon、pen_widths、spline（任何要画花饰、尖头笔线条的题都用得上）。
"""
import math
import numpy as np
from lockupkit.geom import poly, union, circle


def _catmull(p0, p1, p2, p3, n, alpha=0.5):
    def tj(ti, a, b):
        return ti + max(1e-6, np.linalg.norm(b - a)) ** alpha
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


def spline(pts, n=24):
    """过所有点的光滑曲线；端点按首尾两段外推。n 是每段的采样数。"""
    P = [np.array(p, float) for p in pts]
    P = [2 * P[0] - P[1]] + P + [2 * P[-1] - P[-2]]
    out = []
    for i in range(1, len(P) - 2):
        out.append(_catmull(P[i - 1], P[i], P[i + 1], P[i + 2], n))
    out.append(P[-2][None, :])
    return np.concatenate(out, 0)


def arclen(P):
    d = np.linalg.norm(np.diff(P, axis=0), axis=1)
    return np.concatenate([[0.0], np.cumsum(d)])


def tangents(P):
    d = np.gradient(P, axis=0)
    n = np.linalg.norm(d, axis=1, keepdims=True) + 1e-9
    return d / n


def ribbon(P, widths, cap0=None, cap1=None):
    """沿中线画带：每个点左右各半宽。cap0/cap1 给一个长度时，首/尾再往外拉一根针尖。返回 Path。"""
    P = np.asarray(P, float)
    w = np.asarray(widths, float)
    T = tangents(P)
    N = np.stack([-T[:, 1], T[:, 0]], 1)
    L = P + N * (w[:, None] / 2)
    R = P - N * (w[:, None] / 2)
    pts = list(map(tuple, L))
    if cap1:
        pts.append(tuple(P[-1] + T[-1] * cap1))
    pts += list(map(tuple, R[::-1]))
    if cap0:
        pts.append(tuple(P[0] - T[0] * cap0))
    return poly(pts)


def ribbon_long(P, widths, chunk=40):
    """长线（会自己绕回来交叉的圈、花饰）分段画带再并起来，免得一整条带的轮廓自交"""
    P = np.asarray(P, float)
    w = np.asarray(widths, float)
    parts = []
    i = 0
    while i < len(P) - 1:
        j = min(len(P), i + chunk + 1)
        parts.append(ribbon(P[i:j], w[i:j]))
        if j >= len(P):
            break
        i = j - 2
    return union(parts)


def pen_widths(P, thin, thick, stress=0.0, power=1.6, taper0=0.0, taper1=0.0, y_down=True):
    """尖头笔：笔画往下走时压笔变粗，往上、横走是发丝。stress 是重心偏角（度，0 = 竖向）。
    taper0/taper1：首尾多长（同 P 的单位）收成尖。y_down：坐标 y 朝下（舞台）为 True，字体单位为 False。"""
    T = tangents(P)
    a = math.radians(stress)
    down = np.array([math.sin(a), math.cos(a) if y_down else -math.cos(a)])
    k = np.clip(T @ down, 0, 1) ** power
    w = thin + (thick - thin) * k
    s = arclen(P)
    tot = s[-1]
    if taper0:
        w = w * np.clip(s / taper0, 0, 1) ** 0.7
    if taper1:
        w = w * np.clip((tot - s) / taper1, 0, 1) ** 0.7
    return np.maximum(w, 0.0)


def needle(base, width, d, length):
    base = np.asarray(base, float)
    d = np.asarray(d, float) / (np.linalg.norm(d) + 1e-9)
    n = np.array([-d[1], d[0]])
    return poly([tuple(base + n * width / 2), tuple(base + d * length), tuple(base - n * width / 2)])


def ellipse_pts(cx, cy, rx, ry, rot=0.0, t0=0.0, t1=2 * math.pi, n=120):
    t = np.linspace(t0, t1, n)
    c, s = math.cos(rot), math.sin(rot)
    x, y = rx * np.cos(t), ry * np.sin(t)
    return np.stack([cx + x * c - y * s, cy + x * s + y * c], 1)


def at_length(P, s):
    """中线上弧长 s 处的点和切向"""
    S = arclen(P)
    i = int(np.clip(np.searchsorted(S, s), 1, len(P) - 1))
    k = (s - S[i - 1]) / max(1e-9, S[i] - S[i - 1])
    p = P[i - 1] + (P[i] - P[i - 1]) * k
    t = P[i] - P[i - 1]
    return p, t / (np.linalg.norm(t) + 1e-9)


def dash_beads(P, s0, s1, every, r0, r1):
    """从弧长 s0 到 s1 每隔 every 一颗圆珠，半径 r0 → r1。返回 (Path, [(x, y, r)])"""
    out, info = [], []
    s = s0
    while s <= s1 + 1e-6:
        p, _ = at_length(P, s)
        r = r0 + (r1 - r0) * (s - s0) / max(1e-9, s1 - s0)
        out.append(circle(p[0], p[1], r))
        info.append((float(p[0]), float(p[1]), float(r)))
        s += every
    return union(out), info

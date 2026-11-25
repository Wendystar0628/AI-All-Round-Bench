"""三枚 Logo 共用的几何小工具（不带风格）。"""
import math
import json
import os
import numpy as np
from gb import G, fx, output
from glyphbase.geom import Path


def unit(v):
    v = np.asarray(v, float)
    n = float(np.hypot(v[0], v[1]))
    return v / n if n > 1e-9 else v * 0


def ang_of(v):
    return math.degrees(math.atan2(v[1], v[0]))


def adiff(a, b):
    return abs(((a - b + 180) % 360) - 180)


def dir_of(deg):
    r = math.radians(deg)
    return np.array([math.cos(r), math.sin(r)])


def snap_polyline(pts, angles, force=None):
    """把折线的每一段吸附到角度集 angles（度）里最近的角度；同向的相邻段并成一段。
    顶点取原来的分段点在当前方向线上的投影，起点不动。force 给一个角度时整条都用它。"""
    P = [np.asarray(p, float) for p in pts]
    dirs = []
    for a, b in zip(P[:-1], P[1:]):
        an = ang_of(b - a)
        if force is not None:
            dirs.append(force)
        else:
            dirs.append(min(angles, key=lambda t: adiff(an, t)))
    segs = []
    for i, d in enumerate(dirs):
        if segs and segs[-1][0] == d:
            segs[-1] = (d, P[i + 1])
        else:
            segs.append((d, P[i + 1]))
    out = [P[0]]
    cur = P[0]
    for d, target in segs:
        u = dir_of(d)
        t = float((target - cur) @ u)
        cur = cur + u * max(t, 4.0)
        out.append(cur)
    return out


def polyline_len(P):
    P = np.asarray(P, float)
    return float(np.sum(np.linalg.norm(np.diff(P, axis=0), axis=1)))


def point_at(P, t):
    """折线上按长度比例 t 的点和方向"""
    P = np.asarray(P, float)
    seg = np.linalg.norm(np.diff(P, axis=0), axis=1)
    L = seg.sum() * min(max(t, 0), 1)
    acc = 0.0
    for k, s in enumerate(seg):
        if acc + s >= L or k == len(seg) - 1:
            u = (L - acc) / s if s > 1e-9 else 0
            return P[k] + (P[k + 1] - P[k]) * u, unit(P[k + 1] - P[k])
        acc += s
    return P[-1], unit(P[-1] - P[-2])


def resample(P, n):
    return np.array([point_at(P, i / (n - 1))[0] for i in range(n)])


def half_plane(p, n, size=4000, depth=None):
    """过点 p、外法向 n 的半平面（n 指向被切掉的一侧）：返回一个多边形。
    size 是沿切口方向的半长，depth 是往外的深度（默认同 size）。端头切口要用局部的小块，免得切到笔画别处。"""
    p = np.asarray(p, float)
    n = unit(n)
    t = np.array([-n[1], n[0]])
    dp = size if depth is None else depth
    return G.polygon([p + t * size, p + t * size + n * dp, p - t * size + n * dp, p - t * size])


def to_layout_pts(ch, pts):
    return [ch.to_layout(q) for q in pts]


def path_layout(ch, p):
    return ch.layout(p)


def save_json(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))


def svg_d(p, prec=1):
    return G.to_svg_d(p, prec)


def downsample_layer(L, w):
    import cv2
    H, W = L.shape[:2]
    h = int(round(H * w / W))
    return cv2.resize(L, (w, h), interpolation=cv2.INTER_AREA)


def save_web_png(path, L, w):
    """网页用的缩小版透明 PNG"""
    from PIL import Image
    Ls = downsample_layer(L, w)
    u = fx.to_u8(Ls)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    Image.fromarray(u, 'RGBA').save(path, optimize=True)
    return path


def save_web_webp(path, L, w, q=88):
    from PIL import Image
    Ls = downsample_layer(L, w)
    u = fx.to_u8(Ls)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    Image.fromarray(u, 'RGBA').save(path, 'WEBP', quality=q, method=5)
    return path


def bw_preview(paths, size, path, scale=1.0, bg=255, fg=0):
    """快速黑白预览：[(Path, 灰度)]，版面坐标"""
    from PIL import Image
    from glyphbase.canvas import raster
    W, H = int(size[0] * scale), int(size[1] * scale)
    img = np.full((H, W), bg, np.float32)
    for p, g in paths:
        m = raster(p, W, H, (scale, 0, 0, scale, 0, 0), ss=2)
        img = img * (1 - m) + g * m
    os.makedirs(os.path.dirname(path), exist_ok=True)
    Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).save(path)
    return path

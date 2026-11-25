"""图层样式合成器：像 Photoshop 的图层样式那样，对一张覆盖率（mask）逐层叠效果。

所有图层都是预乘 RGBA（float32，H×W×4，0–1）。颜色参数用 '#RRGGBB'。
提供：噪声（分形、各向异性、扭曲）、渐变填充、斜面浮雕（硬雕/平滑）、受光高光边、内发光、内阴影、
外描边、外发光、投影、噪声驱动的颜色扩散（水彩晕开、边缘积色、颗粒）、闪粉、水珠。
"""
import math
import numpy as np
import cv2

# ---------------------------------------------------------------- 颜色与图层


def rgb(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)], np.float32)


def mix(a, b, t):
    return a * (1 - t) + b * t


def empty(H, W):
    return np.zeros((H, W, 4), np.float32)


def solid(alpha, color):
    """单色图层：alpha 是覆盖率，color 是 '#hex' 或 H×W×3。"""
    c = rgb(color) if isinstance(color, str) else color
    out = np.empty(alpha.shape + (4,), np.float32)
    out[..., :3] = c * alpha[..., None]
    out[..., 3] = alpha
    return out


def over(dst, src, opacity=1.0):
    """src 盖在 dst 上（都是预乘）。"""
    if opacity != 1.0:
        src = src * opacity
    a = src[..., 3:4]
    return src + dst * (1 - a)


def stack(layers):
    out = None
    for L in layers:
        if L is None:
            continue
        out = L.copy() if out is None else over(out, L)
    return out


def add_light(dst, color_map, amount):
    """线性减淡（发光）：在 dst 的颜色上加光，不改透明度以外的地方。amount 是 H×W。"""
    c = rgb(color_map) if isinstance(color_map, str) else color_map
    out = dst.copy()
    out[..., :3] = out[..., :3] + c * amount[..., None]
    # 发光让不透明度也跟着上来一点，免得透明处的光被丢掉
    out[..., 3] = np.clip(np.maximum(out[..., 3], amount.clip(0, 1) * 0.0 + out[..., 3]), 0, 1)
    return out


def glow_layer(amount, color):
    """发光层：颜色 color，强度 amount（可以 >1 的部分做成过曝的白心）。输出可直接 over 的预乘图层。"""
    c = rgb(color) if isinstance(color, str) else color
    a = np.clip(amount, 0, 1)
    out = np.empty(amount.shape + (4,), np.float32)
    hot = np.clip(amount - 1, 0, 1)[..., None]
    col = c * (1 - hot) + np.array([1, 1, 1], np.float32) * hot
    out[..., :3] = col * a[..., None]
    out[..., 3] = a
    return out


def unpremul(L):
    a = L[..., 3:4]
    c = np.where(a > 1e-5, L[..., :3] / np.maximum(a, 1e-5), 0)
    return np.concatenate([np.clip(c, 0, 1), L[..., 3:4]], axis=-1)


def to_u8(L, bg=None):
    """预乘图层 → 8 位 RGBA（直通透明度）；给 bg 就铺在底色上得到 RGB。"""
    if bg is not None:
        b = rgb(bg) if isinstance(bg, str) else bg
        c = L[..., :3] + b * (1 - L[..., 3:4])
        return (np.clip(c, 0, 1) * 255 + 0.5).astype(np.uint8)
    u = unpremul(L)
    return (np.clip(u, 0, 1) * 255 + 0.5).astype(np.uint8)


def save_png(path, L, bg=None):
    u = to_u8(L, bg)
    if u.shape[-1] == 4:
        img = cv2.cvtColor(u, cv2.COLOR_RGBA2BGRA)
    else:
        img = cv2.cvtColor(u, cv2.COLOR_RGB2BGR)
    ok, buf = cv2.imencode('.png', img)
    buf.tofile(path)


# ---------------------------------------------------------------- 基础运算


def blur(a, sigma):
    if sigma <= 0.05:
        return a
    k = int(sigma * 3) * 2 + 1
    return cv2.GaussianBlur(a, (k, k), sigma, borderType=cv2.BORDER_CONSTANT)


def blur_dir(a, sx, sy):
    kx = int(sx * 3) * 2 + 1 if sx > 0.05 else 1
    ky = int(sy * 3) * 2 + 1 if sy > 0.05 else 1
    return cv2.GaussianBlur(a, (kx, ky), sigmaX=max(sx, 0.01), sigmaY=max(sy, 0.01), borderType=cv2.BORDER_CONSTANT)


def shift(a, dx, dy):
    M = np.float32([[1, 0, dx], [0, 1, dy]])
    return cv2.warpAffine(a, M, (a.shape[1], a.shape[0]), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)


def dist_in(mask):
    """形内到边的距离（像素，带亚像素修正）。"""
    m = (mask > 0.5).astype(np.uint8)
    d = cv2.distanceTransform(m, cv2.DIST_L2, 5)
    return np.where(m > 0, d - 0.5 + (mask - 0.5).clip(-0.5, 0.5), 0).astype(np.float32)


def dist_out(mask):
    m = (mask <= 0.5).astype(np.uint8)
    d = cv2.distanceTransform(m, cv2.DIST_L2, 5)
    return np.where(m > 0, d - 0.5 + (0.5 - mask).clip(-0.5, 0.5), 0).astype(np.float32)


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def grad(h):
    gx = cv2.Sobel(h, cv2.CV_32F, 1, 0, ksize=3) / 8.0
    gy = cv2.Sobel(h, cv2.CV_32F, 0, 1, ksize=3) / 8.0
    return gx, gy


# ---------------------------------------------------------------- 噪声


def value_noise(H, W, cell, seed, aniso=(1.0, 1.0)):
    """一层值噪声：cell 是格子的像素尺寸；aniso 把格子在 x、y 上各自拉长。"""
    rng = np.random.default_rng(seed)
    cx, cy = cell * aniso[0], cell * aniso[1]
    gw, gh = int(W / cx) + 4, int(H / cy) + 4
    g = rng.random((gh, gw)).astype(np.float32)
    big = cv2.resize(g, (int(gw * cx), int(gh * cy)), interpolation=cv2.INTER_CUBIC)
    ox, oy = int(rng.integers(0, int(cx) + 1)), int(rng.integers(0, int(cy) + 1))
    return big[oy:oy + H, ox:ox + W]


def fbm(H, W, cell, seed, octaves=5, gain=0.5, aniso=(1.0, 1.0)):
    out = np.zeros((H, W), np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        c = cell / (2 ** o)
        if c < 1.0:
            break
        out += amp * value_noise(H, W, c, seed * 131 + o * 17, aniso)
        tot += amp
        amp *= gain
    out /= tot
    # 拉开到 0–1
    lo, hi = np.percentile(out, 1), np.percentile(out, 99)
    return np.clip((out - lo) / (hi - lo + 1e-6), 0, 1)


def warp(a, fx, fy, amount):
    """用两张噪声把 a 的坐标推开 amount 像素（域扭曲，水彩边、撕边都靠它）。"""
    H, W = a.shape[:2]
    xx, yy = np.meshgrid(np.arange(W, dtype=np.float32), np.arange(H, dtype=np.float32))
    mx = xx + (fx - 0.5) * 2 * amount
    my = yy + (fy - 0.5) * 2 * amount
    return cv2.remap(a, mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)


def grain(H, W, seed, sigma=0.6):
    rng = np.random.default_rng(seed)
    g = rng.random((H, W)).astype(np.float32)
    if sigma > 0:
        g = cv2.GaussianBlur(g, (0, 0), sigma)
        g = (g - g.mean()) / (g.std() + 1e-6) * 0.5 + 0.5
    return np.clip(g, 0, 1)


def streaks(H, W, seed, density=0.004, length=(20, 120), angle=0.0, width=1.0, jitter=0.4):
    """一束细线纹（雨丝、拉丝、雨痕）：angle 是相对竖直方向的偏角（度，向右下为正）。返回 0–1。"""
    rng = np.random.default_rng(seed)
    img = np.zeros((H, W), np.float32)
    n = int(H * W * density / max(1, np.mean(length)))
    t = math.radians(angle)
    dx, dy = math.sin(t), math.cos(t)
    for _ in range(n):
        x, y = rng.random() * W, rng.random() * H
        L = rng.uniform(*length)
        v = rng.uniform(1 - jitter, 1.0)
        cv2.line(img, (int(x * 16), int(y * 16)), (int((x + dx * L) * 16), int((y + dy * L) * 16)), float(v),
                 max(1, int(round(width))), lineType=cv2.LINE_AA, shift=4)
    return img


# ---------------------------------------------------------------- 图层样式


def gradient_v(H, W, y0, y1, stops):
    """竖向多段渐变：stops = [(t, '#hex'), ...]，t 从 y0 到 y1。返回 H×W×3。"""
    t = np.clip((np.arange(H, dtype=np.float32) - y0) / max(1e-3, (y1 - y0)), 0, 1)
    cs = np.zeros((H, 3), np.float32)
    ts = [s[0] for s in stops]
    cols = [rgb(s[1]) for s in stops]
    for c in range(3):
        cs[:, c] = np.interp(t, ts, [k[c] for k in cols])
    return np.broadcast_to(cs[:, None, :], (H, W, 3)).copy()


def ramp(t, stops):
    """按 t（H×W，0–1）查多段色带，返回 H×W×3。"""
    ts = [s[0] for s in stops]
    cols = [rgb(s[1]) for s in stops]
    out = np.zeros(t.shape + (3,), np.float32)
    for c in range(3):
        out[..., c] = np.interp(t, ts, [k[c] for k in cols])
    return out


def light_vec(angle=120, altitude=35):
    """Photoshop 的光：angle 从右边逆时针算（120 = 左上），altitude 是高度角。屏幕坐标 y 朝下。"""
    a, b = math.radians(angle), math.radians(altitude)
    return np.array([math.cos(b) * math.cos(a), -math.cos(b) * math.sin(a), math.sin(b)], np.float32)


def bevel(mask, size, depth=1.0, soften=0.0, angle=120, altitude=35, chisel=True, contour=None):
    """斜面浮雕（内斜面）。返回 (highlight, shadow) 两张 0–1 的强度图。
    chisel=True 是“雕刻清晰”：距离场不做平滑，斜面是硬的刻面；False 是平滑。"""
    d = dist_in(mask)
    h = np.clip(d / size, 0, 1)
    if not chisel:
        h = smoothstep(0, 1, h)
        h = blur(h, size * 0.35)
    if soften > 0:
        h = blur(h, soften)
    gx, gy = grad(h * size * depth)
    n = np.dstack([-gx, -gy, np.ones_like(h)])
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    L = light_vec(angle, altitude)
    s = n @ L
    flat = L[2]
    hi = np.clip((s - flat) / (1 - flat), 0, 1)
    sh = np.clip((flat - s) / flat, 0, 1)
    if contour is not None:
        hi, sh = contour(hi), contour(sh)
    return hi * mask, sh * mask


def rim_light(mask, width, angle=120, power=2.0):
    """受光的高光边：只在朝光的那一侧边上亮一圈细线。"""
    d = dist_in(mask)
    band = np.clip(1 - d / width, 0, 1) * (mask > 0.02)
    sm = blur(mask, max(0.8, width * 0.6))
    gx, gy = grad(sm)
    nrm = np.sqrt(gx * gx + gy * gy) + 1e-6
    # 外法线 = -grad（mask 往外是减小）
    nx, ny = -gx / nrm, -gy / nrm
    a = math.radians(angle)
    lx, ly = math.cos(a), -math.sin(a)
    facing = np.clip(nx * lx + ny * ly, 0, 1) ** power
    return band * facing * mask


def inner_shadow(mask, dx, dy, sigma, choke=0.0):
    m = shift(mask, dx, dy)
    if choke > 0:
        m = np.clip(m * (1 + choke), 0, 1)
    m = blur(m, sigma)
    return np.clip(mask * (1 - m), 0, 1)


def inner_glow(mask, size, edge=True):
    """内发光：edge=True 从边往里，False 从中心往外。"""
    d = dist_in(mask)
    g = np.clip(1 - d / size, 0, 1) if edge else np.clip(d / size, 0, 1)
    return g * g * mask


def outer_stroke(mask, width, offset=0.0):
    """外描边，offset>0 时和字之间留一道缝（双描边的外圈）。返回覆盖率。"""
    do = dist_out(mask)
    outer = np.clip(width + offset + 0.5 - do, 0, 1)
    inner = np.clip(offset + 0.5 - do, 0, 1) if offset > 0 else mask
    return np.clip(outer - np.maximum(inner, mask if offset == 0 else inner), 0, 1) if offset > 0 else np.clip(outer * (1 - mask), 0, 1)


def dilate(mask, r):
    do = dist_out(mask)
    return np.clip(np.maximum(mask, r + 0.5 - do), 0, 1)


def erode(mask, r):
    di = dist_in(mask)
    return np.clip(di - r + 0.5, 0, 1) * (mask > 0)


def outer_glow(mask, sigma, spread=0.0, gain=1.0):
    m = dilate(mask, spread) if spread > 0 else mask
    return np.clip(blur(m, sigma) * gain, 0, 1)


def drop_shadow(mask, dx, dy, sigma, spread=0.0):
    m = dilate(mask, spread) if spread > 0 else mask
    return blur(shift(m, dx, dy), sigma)


def diffuse(H, W, seed, attract, cell=60, threshold=0.5, softness=0.12, warp_px=14, edge=0.6, granule=0.35):
    """噪声驱动的颜色扩散（点缀色在纹理里晕开）：
    attract 是 0–1 的“源”（离源越近越容易长出颜色），分形噪声决定晕开的形状，
    边缘积色（水彩干了以后边上颜色更重）和颗粒（颜料沉进纸纹/星尘）让它不是一块平涂。返回 0–1。"""
    n = fbm(H, W, cell, seed, octaves=6)
    n = warp(n, fbm(H, W, cell * 1.3, seed + 7), fbm(H, W, cell * 1.3, seed + 9), warp_px)
    field = n * 0.55 + attract * 0.75 - 0.3
    blob = smoothstep(threshold - softness, threshold + softness, field)
    # 边缘积色
    e = np.abs(blob - blur(blob, 2.0))
    e = np.clip(e * 4.0, 0, 1)
    g = grain(H, W, seed + 3, 0.7)
    out = blob * (1 - granule + granule * g) + e * edge * blob.max()
    return np.clip(out, 0, 1)


def sparkles(H, W, seed, where, count, size=(1.0, 3.0), flare=0.35):
    """闪粉：在 where（0–1 概率图）上撒亮点，少数带十字小芒。返回强度图。"""
    rng = np.random.default_rng(seed)
    img = np.zeros((H, W), np.float32)
    w = where.astype(np.float64).ravel()
    s = w.sum()
    if s <= 0:
        return img
    idx = rng.choice(w.size, size=count, p=w / s)
    ys, xs = np.unravel_index(idx, (H, W))
    for x, y in zip(xs, ys):
        r = rng.uniform(*size)
        v = rng.uniform(0.5, 1.0)
        cv2.circle(img, (int(x * 16), int(y * 16)), max(1, int(r * 16 * 0.5)), float(v), -1, lineType=cv2.LINE_AA, shift=4)
        if rng.random() < flare:
            L = r * rng.uniform(3, 6)
            cv2.line(img, (int((x - L) * 16), int(y * 16)), (int((x + L) * 16), int(y * 16)), float(v * 0.7), 1, cv2.LINE_AA, 4)
            cv2.line(img, (int(x * 16), int((y - L) * 16)), (int(x * 16), int((y + L) * 16)), float(v * 0.7), 1, cv2.LINE_AA, 4)
    img = np.maximum(img, blur(img, 1.2) * 1.4)
    return np.clip(img, 0, 1.5)

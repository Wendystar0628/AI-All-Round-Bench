"""图层样式：对一张覆盖率（遮罩，H×W，0–1）逐层叠效果，像图层样式面板那样。只有机制，参数和颜色都由调用方给。

图层是预乘 RGBA（H×W×4，float32，0–1）。颜色可以写 '#RRGGBB'、(r, g, b)（0–1）或 H×W×3 的数组。
长度参数（模糊半径、斜面宽、位移）都是像素；从版面单位换算用 Canvas.px()。
返回“强度图”（H×W，0–1）的函数，再用 solid() / glow_layer() 上色成图层。

  颜色与图层   rgb mix solid glow_layer over stack blend opacity clip unpremul to_u8
  渐变         ramp linear_t radial_t angle_t
  基础运算     blur blur_dir shift smoothstep grad dilate erode
  距离场       dist_in dist_out sdf
  斜面与光     light_vec bevel rim_light inner_shadow inner_glow outer_glow inner_stroke outer_stroke drop_shadow
  噪声         value_noise fbm warp grain streaks
  颜色扩散     diffuse
"""
import math
import numpy as np
import cv2

# ================================================================ 颜色与图层


def rgb(c):
    """'#RRGGBB' / '#RGB' / (r, g, b)（0–1；有大于 1 的数时按 0–255）/ 数组 → float32 颜色"""
    if isinstance(c, str):
        h = c.lstrip('#')
        if len(h) == 3:
            h = ''.join(x * 2 for x in h)
        return np.array([int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)], np.float32)
    a = np.asarray(c, np.float32)
    if a.ndim == 1 and a.size == 3 and a.max() > 1.0:
        a = a / 255.0
    return a


def mix(a, b, t):
    """a、b 按 t 混合（t 可以是数或 H×W×1）"""
    return a * (1 - t) + b * t


def solid(alpha, color):
    """单色（或逐像素颜色 H×W×3）图层：alpha 是覆盖率"""
    c = rgb(color)
    out = np.empty(alpha.shape + (4,), np.float32)
    out[..., :3] = c * alpha[..., None]
    out[..., 3] = alpha
    return out


def glow_layer(amount, color):
    """发光层：颜色 color，强度 amount；amount 超过 1 的部分渐变成白（过曝的芯）"""
    c = rgb(color)
    a = np.clip(amount, 0, 1)
    hot = np.clip(amount - 1, 0, 1)[..., None]
    col = c * (1 - hot) + np.ones(3, np.float32) * hot
    out = np.empty(amount.shape + (4,), np.float32)
    out[..., :3] = col * a[..., None]
    out[..., 3] = a
    return out


def over(dst, src, opacity=1.0):
    """src 盖在 dst 上（正常模式，都是预乘）"""
    if opacity != 1.0:
        src = src * opacity
    return src + dst * (1 - src[..., 3:4])


def stack(layers):
    """从后往前叠一串图层（列表，或 dict 的值按插入顺序）；None 跳过"""
    if isinstance(layers, dict):
        layers = list(layers.values())
    out = None
    for L in layers:
        if L is None:
            continue
        out = L.copy() if out is None else over(out, L)
    return out


def _B(mode, b, s):
    if mode == 'normal':
        return s
    if mode == 'multiply':
        return b * s
    if mode == 'screen':
        return b + s - b * s
    if mode == 'overlay':
        return np.where(b <= 0.5, 2 * b * s, 1 - 2 * (1 - b) * (1 - s))
    if mode == 'hard_light':
        return np.where(s <= 0.5, 2 * b * s, 1 - 2 * (1 - b) * (1 - s))
    if mode == 'soft_light':
        d = np.where(b <= 0.25, ((16 * b - 12) * b + 4) * b, np.sqrt(np.clip(b, 0, 1)))
        return np.where(s <= 0.5, b - (1 - 2 * s) * b * (1 - b), b + (2 * s - 1) * (d - b))
    if mode == 'darken':
        return np.minimum(b, s)
    if mode == 'lighten':
        return np.maximum(b, s)
    if mode == 'add':
        return np.minimum(1.0, b + s)
    if mode == 'difference':
        return np.abs(b - s)
    raise ValueError(f'混合模式只有 normal multiply screen overlay hard_light soft_light darken lighten add difference：{mode}')


def blend(dst, src, mode='normal', opacity=1.0):
    """按混合模式把 src 叠到 dst 上（W3C 合成公式，都是预乘）"""
    if opacity != 1.0:
        src = src * opacity
    sa, da = src[..., 3:4], dst[..., 3:4]
    cs = np.where(sa > 1e-6, src[..., :3] / np.maximum(sa, 1e-6), 0)
    cb = np.where(da > 1e-6, dst[..., :3] / np.maximum(da, 1e-6), 0)
    col = (1 - da) * src[..., :3] + (1 - sa) * dst[..., :3] + sa * da * _B(mode, cb, cs)
    a = sa + da * (1 - sa)
    return np.concatenate([col, a], -1).astype(np.float32)


def opacity(L, k):
    """整层不透明度乘 k（k 可以是数或 H×W）"""
    k = np.asarray(k, np.float32)
    return L * (k[..., None] if k.ndim == 2 else k)


def clip(L, mask):
    """剪切到遮罩里（遮罩外的部分去掉）"""
    return L * mask[..., None]


def unpremul(L):
    """预乘 → 直通透明度"""
    a = L[..., 3:4]
    c = np.where(a > 1e-5, L[..., :3] / np.maximum(a, 1e-5), 0)
    return np.concatenate([np.clip(c, 0, 1), np.clip(a, 0, 1)], axis=-1)


def to_u8(L, bg=None):
    """预乘图层 → 8 位 RGBA（直通透明度）；给 bg 就铺在底色上得到 8 位 RGB"""
    if bg is not None:
        c = L[..., :3] + rgb(bg) * (1 - L[..., 3:4])
        return (np.clip(c, 0, 1) * 255 + 0.5).astype(np.uint8)
    return (unpremul(L) * 255 + 0.5).astype(np.uint8)


# ================================================================ 渐变


def ramp(t, stops):
    """按 t（任意形状，0–1）查多段色带 stops = [(t, 颜色), …]，返回 t.shape + (3,)"""
    ts = [s[0] for s in stops]
    cols = [rgb(s[1]) for s in stops]
    t = np.asarray(t, np.float32)
    out = np.zeros(t.shape + (3,), np.float32)
    for c in range(3):
        out[..., c] = np.interp(t, ts, [k[c] for k in cols])
    return out


def linear_t(C, p0, p1):
    """线性渐变的 t：版面上 p0 处 0、p1 处 1（沿 p0→p1 方向，两端外夹到 0–1）。C 是 Canvas。"""
    dx, dy = p1[0] - p0[0], p1[1] - p0[1]
    L2 = dx * dx + dy * dy or 1.0
    return np.clip(((C.XX - p0[0]) * dx + (C.YY - p0[1]) * dy) / L2, 0, 1)


def radial_t(C, c, r):
    """径向渐变的 t：圆心 c 处 0、半径 r 处 1（版面单位）"""
    d, _ = C.polar(c)
    return np.clip(d / r, 0, 1)


def angle_t(C, c, a0=0.0):
    """角度渐变的 t：绕 c 一圈从 0 到 1，从角 a0（度，0 = 右，90 = 下）起顺时针（屏幕上）"""
    _, th = C.polar(c)
    return ((th - math.radians(a0)) / (2 * math.pi)) % 1.0


# ================================================================ 基础运算


def blur(a, sigma):
    """高斯模糊（遮罩或图层都行），sigma 是像素"""
    if sigma <= 0.05:
        return a
    k = int(sigma * 3) * 2 + 1
    return cv2.GaussianBlur(a, (k, k), sigma, borderType=cv2.BORDER_CONSTANT)


def blur_dir(a, sx, sy):
    """横竖分别模糊（拖影、运动模糊的近似）"""
    kx = int(sx * 3) * 2 + 1 if sx > 0.05 else 1
    ky = int(sy * 3) * 2 + 1 if sy > 0.05 else 1
    return cv2.GaussianBlur(a, (kx, ky), sigmaX=max(sx, 0.01), sigmaY=max(sy, 0.01), borderType=cv2.BORDER_CONSTANT)


def shift(a, dx, dy):
    """平移（像素，可以是小数）"""
    M = np.float32([[1, 0, dx], [0, 1, dy]])
    return cv2.warpAffine(a, M, (a.shape[1], a.shape[0]), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def grad(h):
    """梯度 (gx, gy)"""
    gx = cv2.Sobel(h, cv2.CV_32F, 1, 0, ksize=3) / 8.0
    gy = cv2.Sobel(h, cv2.CV_32F, 0, 1, ksize=3) / 8.0
    return gx, gy


# ================================================================ 距离场


def _crossings(mask, level=0.5):
    """覆盖率等于 level 的亚像素边界点（横竖相邻两像素之间线性插值），像素中心在整数坐标上"""
    out = []
    for ax in (1, 0):
        a = mask[:, :-1] if ax == 1 else mask[:-1, :]
        b = mask[:, 1:] if ax == 1 else mask[1:, :]
        s = (a - level) * (b - level) < 0
        ys, xs = np.nonzero(s)
        t = (level - a[s]) / (b[s] - a[s])
        out.append(np.stack([xs + t, ys], 1) if ax == 1 else np.stack([xs, ys + t], 1))
    return np.concatenate(out, 0)


def _dist(mask, inside, reach):
    m = (mask > 0.5) if inside else (mask <= 0.5)
    d = cv2.distanceTransform(m.astype(np.uint8), cv2.DIST_L2, cv2.DIST_MASK_PRECISE) - 0.5
    d = np.where(m, np.maximum(d, 0), 0).astype(np.float32)
    try:
        from scipy.spatial import cKDTree
    except ImportError:   # 没有 scipy：退回整像素的距离（斜边上的斜面会有细小的台阶）
        return d
    pts = _crossings(mask)
    if len(pts) == 0:
        return d
    sel = m & (d <= reach)
    ys, xs = np.nonzero(sel)
    if len(xs):
        dd, _ = cKDTree(pts).query(np.stack([xs, ys], 1).astype(np.float64), k=1)
        d[ys, xs] = dd
    return d


def dist_in(mask, reach=64):
    """形内每点到边的距离（像素）；形外为 0。离边 reach 像素以内按亚像素的边界精确算（斜面、内发光平滑），更远的按整像素算。"""
    return _dist(mask, True, reach)


def dist_out(mask, reach=64):
    """形外每点到边的距离（像素）；形内为 0"""
    return _dist(mask, False, reach)


def sdf(mask):
    """带符号的距离场：形外为正、形内为负（像素）"""
    return dist_out(mask) - dist_in(mask)


def dilate(mask, r):
    """遮罩外扩 r 像素（圆角）"""
    return np.clip(np.maximum(mask, r + 0.5 - dist_out(mask)), 0, 1)


def erode(mask, r):
    """遮罩内缩 r 像素"""
    return np.clip(dist_in(mask) - r + 0.5, 0, 1) * (mask > 0)


# ================================================================ 斜面与光


def light_vec(angle=120, altitude=35):
    """光的方向：angle 从右边逆时针算（120 = 左上），altitude 是高度角。屏幕坐标 y 朝下。"""
    a, b = math.radians(angle), math.radians(altitude)
    return np.array([math.cos(b) * math.cos(a), -math.cos(b) * math.sin(a), math.sin(b)], np.float32)


def bevel(mask, size, depth=1.0, soften=0.6, angle=120, altitude=35, chisel=True, contour=None):
    """斜面浮雕（内斜面）：返回 (高光, 阴影) 两张 0–1 的强度图。
    size 斜面宽（像素）；chisel=True 硬的刻面（距离场不平滑），False 平滑；soften 是斜面的模糊（像素，去掉斜边上的细碎纹）；
    angle、altitude 是光的方向和高度角（见 light_vec）；contour 可给一个 f(x)->x 调光泽曲线。"""
    d = dist_in(mask)
    h = np.clip(d / size, 0, 1)
    if not chisel:
        h = blur(smoothstep(0, 1, h), size * 0.35)
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
    """受光边：只在朝光那一侧的边上亮一圈细线（宽 width 像素）"""
    d = dist_in(mask)
    band = np.clip(1 - d / width, 0, 1) * (mask > 0.02)
    gx, gy = grad(blur(mask, max(0.8, width * 0.6)))
    nrm = np.sqrt(gx * gx + gy * gy) + 1e-6
    nx, ny = -gx / nrm, -gy / nrm
    a = math.radians(angle)
    facing = np.clip(nx * math.cos(a) + ny * -math.sin(a), 0, 1) ** power
    return band * facing * mask


def inner_shadow(mask, dx, dy, sigma, choke=0.0):
    """内阴影：形状往 (dx, dy) 挪开后露出来的边，模糊 sigma"""
    m = shift(mask, dx, dy)
    if choke > 0:
        m = np.clip(m * (1 + choke), 0, 1)
    return np.clip(mask * (1 - blur(m, sigma)), 0, 1)


def inner_glow(mask, size, edge=True):
    """内发光：edge=True 从边往里，False 从中心往外"""
    d = dist_in(mask)
    g = np.clip(1 - d / size, 0, 1) if edge else np.clip(d / size, 0, 1)
    return g * g * mask


def outer_glow(mask, sigma, spread=0.0, gain=1.0):
    """外发光：先外扩 spread 再模糊 sigma（返回的强度含形内，叠在字后面用）"""
    m = dilate(mask, spread) if spread > 0 else mask
    return np.clip(blur(m, sigma) * gain, 0, 1)


def inner_stroke(mask, width):
    """内描边：贴着边往里 width 像素的一圈"""
    return np.clip(mask - erode(mask, width), 0, 1)


def outer_stroke(mask, width, gap=0.0):
    """外描边：贴着边往外 width 像素的一圈；gap>0 时和形之间空开一道缝"""
    do = dist_out(mask)
    outer = np.clip(width + gap + 0.5 - do, 0, 1)
    inner = np.clip(gap + 0.5 - do, 0, 1) if gap > 0 else mask
    return np.clip(outer - np.maximum(inner, mask), 0, 1)


def drop_shadow(mask, dx, dy, sigma, spread=0.0):
    """投影：外扩 spread、挪 (dx, dy)、模糊 sigma"""
    m = dilate(mask, spread) if spread > 0 else mask
    return blur(shift(m, dx, dy), sigma)


# ================================================================ 噪声


def value_noise(H, W, cell, seed, aniso=(1.0, 1.0)):
    """一层值噪声（0–1）：cell 是格子的像素尺寸；aniso 把格子在 x、y 上各自拉长"""
    rng = np.random.default_rng(seed)
    cx, cy = cell * aniso[0], cell * aniso[1]
    gw, gh = int(W / cx) + 4, int(H / cy) + 4
    g = rng.random((gh, gw)).astype(np.float32)
    big = cv2.resize(g, (int(gw * cx), int(gh * cy)), interpolation=cv2.INTER_CUBIC)
    ox, oy = int(rng.integers(0, int(cx) + 1)), int(rng.integers(0, int(cy) + 1))
    return big[oy:oy + H, ox:ox + W]


def fbm(H, W, cell, seed, octaves=5, gain=0.5, aniso=(1.0, 1.0)):
    """分形噪声（几层值噪声叠加，拉开到 0–1）"""
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
    lo, hi = np.percentile(out, 1), np.percentile(out, 99)
    return np.clip((out - lo) / (hi - lo + 1e-6), 0, 1)


def warp(a, fx, fy, amount):
    """域扭曲：用两张 0–1 的噪声 fx、fy 把 a 的取样坐标推开最多 amount 像素（撕边、晕开、波纹都靠它）"""
    H, W = a.shape[:2]
    xx, yy = np.meshgrid(np.arange(W, dtype=np.float32), np.arange(H, dtype=np.float32))
    mx = xx + (fx - 0.5) * 2 * amount
    my = yy + (fy - 0.5) * 2 * amount
    return cv2.remap(a, mx.astype(np.float32), my.astype(np.float32), cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)


def grain(H, W, seed, sigma=0.6):
    """颗粒（0–1，均值约 0.5）"""
    rng = np.random.default_rng(seed)
    g = rng.random((H, W)).astype(np.float32)
    if sigma > 0:
        g = cv2.GaussianBlur(g, (0, 0), sigma)
        g = (g - g.mean()) / (g.std() + 1e-6) * 0.5 + 0.5
    return np.clip(g, 0, 1)


def streaks(H, W, seed, density=0.004, length=(20, 120), angle=0.0, width=1.0, jitter=0.4):
    """一束细线纹（0–1）：density 覆盖密度，length 每根的长度范围（像素），angle 相对竖直的偏角（度，向右下为正）"""
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


# ================================================================ 颜色扩散


def diffuse(H, W, seed, attract, cell=60, threshold=0.5, softness=0.12, warp_px=14, edge=0.6, granule=0.35):
    """噪声驱动的颜色扩散（0–1）：attract 是 0–1 的“源”（越靠近源越容易长出颜色），分形噪声决定晕开的形状；
    edge 是边缘积色的强度，granule 是颗粒感。返回的强度图再用 solid() 上色、clip() 限在字面里。"""
    n = fbm(H, W, cell, seed, octaves=6)
    n = warp(n, fbm(H, W, cell * 1.3, seed + 7), fbm(H, W, cell * 1.3, seed + 9), warp_px)
    field = n * 0.55 + attract * 0.75 - 0.3
    blob = smoothstep(threshold - softness, threshold + softness, field)
    e = np.clip(np.abs(blob - blur(blob, 2.0)) * 4.0, 0, 1)
    g = grain(H, W, seed + 3, 0.7)
    out = blob * (1 - granule + granule * g) + e * edge * blob.max()
    return np.clip(out, 0, 1)

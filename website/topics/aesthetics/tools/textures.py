"""网站的预渲纹理：网页上的「光」是静止的，被灯照亮的那一片墙、光锥的边、那轮日、纸的纤维都用预先画好的图，
不用 CSS 平滑渐变（质感贯穿方案 1.1、4.1）。光的过渡带用成簇的点画，不用逐像素抖动；点画只在过渡带里。

    python website/topics/aesthetics/tools/textures.py      （仓库根目录运行；带种子，每次画得一样）

写到 src/assets/light/：
    sky.webp     夜空 1920×1080：天顶近黑、近地平线微微泛暖，灰泥一样极淡的斑驳，一道聚集点画的银河，1–2px 的星
    cone.webp    吊星的光锥（透明底）：锥心一层淡暖光，锥边用点画散开，锥里几粒往上飘的暖尘
    pool.webp    灯落在墙上的一片光（透明底）：中心暖，向外由成簇的点过渡到暗
    sun.webp     选手身后那轮日（透明底）：中心偏上暖橙，往外锈红，再由点画散到透明
    paper.webp   纸的纤维（512 平铺，灰度，和奶油色正片叠底）：纤维、极淡的斑驳、零星的小点
    mottle.webp  夜墙的灰泥斑驳（512 平铺，灰度，柔光叠在夜上）
"""
from pathlib import Path

import numpy as np
from PIL import Image

OUT = Path(__file__).resolve().parent.parent / 'src' / 'assets' / 'light'


def periodic_noise(n, scale, seed):
    """n×n 可平铺的低频噪声（傅里叶域里滤掉高频的白噪声），值域 0–1。scale 越大斑块越大。"""
    rng = np.random.default_rng(seed)
    f = np.fft.fft2(rng.standard_normal((n, n)))
    k = np.fft.fftfreq(n)
    kk = np.sqrt(k[:, None] ** 2 + k[None, :] ** 2)
    f *= np.exp(-(kk * scale) ** 2)
    f[0, 0] = 0
    v = np.real(np.fft.ifft2(f))
    v = (v - v.min()) / (v.max() - v.min())
    return v


def fbm(h, w, seed, scales=(220, 90, 36), weights=(0.55, 0.3, 0.15)):
    """h×w 的分形噪声：几层可平铺噪声裁出来叠在一起，值域约 0–1。"""
    n = 1 << int(np.ceil(np.log2(max(h, w))))
    out = np.zeros((h, w))
    for i, (s, wt) in enumerate(zip(scales, weights)):
        out += periodic_noise(n, s / n * 6, seed + i)[:h, :w] * wt
    return out / sum(weights)


def stipple(alpha_field, density, rng, cluster=None):
    """在 alpha_field>0 的地方撒点：每个像素以 density×field（再乘上成簇的噪声）为概率落一个点。返回点的不透明度图。"""
    p = alpha_field * density
    if cluster is not None:
        p = p * (0.25 + 1.5 * cluster ** 2)
    hit = rng.random(p.shape) < p
    return hit * (0.45 + 0.55 * rng.random(p.shape))


def save_rgba(name, rgb, a, quality=88):
    img = np.dstack([np.clip(rgb, 0, 255), np.clip(a * 255, 0, 255)]).astype(np.uint8)
    Image.fromarray(img, 'RGBA').save(OUT / name, 'WEBP', quality=quality, method=6)


def save_rgb(name, rgb, quality=86):
    Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8), 'RGB').save(OUT / name, 'WEBP', quality=quality, method=6)


def sky():
    W, H = 1920, 1080
    rng = np.random.default_rng(11)
    y = np.linspace(0, 1, H)[:, None]
    x = np.linspace(0, 1, W)[None, :]
    # 天顶近黑、带一点藏青；近地平线微微泛暖
    top = np.array([7, 10, 17.0])
    mid = np.array([11, 15, 24.0])
    low = np.array([22, 22, 27.0])
    t = y ** 1.6
    base = top * (1 - t)[..., None] + mid * t[..., None]
    warm = np.clip((y - 0.62) / 0.38, 0, 1) ** 1.5
    base = base * (1 - warm[..., None]) + low * warm[..., None]
    base = np.broadcast_to(base, (H, W, 3)).copy()
    # 灰泥一样极淡的斑驳：远看是平的暗
    m = fbm(H, W, 3)
    base *= (0.95 + 0.1 * m)[..., None]
    # 银河：一道很淡的斜带，用成簇的点画出来
    d = (y - (0.62 - 0.5 * x)) / 0.16
    band = np.exp(-d ** 2) * np.clip(1.2 - y * 1.1, 0, 1)
    cl = fbm(H, W, 9, scales=(120, 40, 14), weights=(0.5, 0.35, 0.15))
    dots = stipple(band, 0.09, rng, cluster=cl)
    base += dots[..., None] * np.array([150, 158, 172.0]) * 0.2
    base += (band * cl * 4.0)[..., None]
    # 星：1–2px 的点，少数几颗偏暖
    for _ in range(320):
        sx, sy = rng.integers(0, W), int(rng.random() ** 1.35 * H * 0.86)
        a = 0.12 + rng.random() * 0.5
        col = np.array([240, 228, 206.0]) if rng.random() < 0.18 else np.array([214, 222, 236.0])
        s = 2 if rng.random() < 0.07 else 1
        base[sy:sy + s, sx:sx + s] = base[sy:sy + s, sx:sx + s] * (1 - a) + col * a
    save_rgb('sky.webp', base)


def cone():
    W, H = 1600, 1000
    rng = np.random.default_rng(21)
    j = np.arange(H)[:, None].astype(float)
    i = np.arange(W)[None, :].astype(float)
    cx = W / 2
    half = 42 + j * 0.6
    e = np.abs(i - cx) - half                       # 到锥边的距离（锥里为负）
    fall = np.clip(1 - j / H, 0, 1) ** 1.25
    inside = np.clip(-e / 160, 0, 1) ** 0.8
    core = np.exp(-((i - cx) / (half * 0.55 + 1)) ** 2) * 0.35
    fill = (inside * 0.65 + core) * fall
    # 锥边：一条约 70px 的过渡带，用成簇的点散开
    edge = np.clip(1 - np.abs(e + 10) / 70, 0, 1) * fall
    cl = fbm(H, W, 31, scales=(90, 30, 10), weights=(0.45, 0.35, 0.2))
    dots = stipple(edge, 0.32, rng, cluster=cl)
    a = (fill * 0.26 + dots * 0.3) * np.clip(j / 60, 0, 1)    # 顶上被吊星本身盖住，淡进来
    # 锥里几粒往上飘的暖尘
    for _ in range(34):
        jj = 120 + rng.random() * 720
        hh = 42 + jj * 0.6
        ii = cx + (rng.random() - 0.5) * hh * 1.5
        r = 0.7 + rng.random() * 1.3
        yy, xx = np.ogrid[-4:5, -4:5]
        spot = np.clip(1 - np.sqrt(xx ** 2 + yy ** 2) / (r + 0.6), 0, 1) * (0.25 + rng.random() * 0.4)
        y0, x0 = int(jj) - 4, int(ii) - 4
        a[y0:y0 + 9, x0:x0 + 9] = np.maximum(a[y0:y0 + 9, x0:x0 + 9], spot)
    rgb = np.broadcast_to(np.array([240, 210, 164.0]), (H, W, 3))
    save_rgba('cone.webp', rgb, a)


def pool():
    W, H = 1400, 1000
    rng = np.random.default_rng(41)
    y, x = np.ogrid[0:H, 0:W]
    r = np.sqrt(((x - W / 2) / (W * 0.42)) ** 2 + ((y - H * 0.4) / (H * 0.5)) ** 2)
    body = np.clip(1 - r, 0, 1) ** 1.8
    band = np.clip(1 - np.abs(r - 0.82) / 0.22, 0, 1)
    cl = fbm(H, W, 43, scales=(110, 36, 12), weights=(0.45, 0.35, 0.2))
    dots = stipple(band, 0.16, rng, cluster=cl)
    a = body * 0.34 + dots * 0.16
    rgb = np.broadcast_to(np.array([236, 200, 156.0]), (H, W, 3))
    save_rgba('pool.webp', rgb, a)


def sun():
    S = 1100
    rng = np.random.default_rng(51)
    y, x = np.ogrid[0:S, 0:S]
    R = S * 0.45
    cx, cy = S / 2, S / 2
    r = np.sqrt((x - cx) ** 2 + (y - cy) ** 2) / R
    rc = np.sqrt((x - cx) ** 2 + (y - (cy - R * 0.3)) ** 2) / R       # 光的中心偏上：顶光照着它
    c0, c1, c2 = np.array([236, 162, 104.0]), np.array([186, 88, 50.0]), np.array([112, 44, 28.0])
    t1 = np.clip(rc / 0.8, 0, 1)[..., None]
    t2 = np.clip((rc - 0.8) / 0.55, 0, 1)[..., None]
    rgb = c0 * (1 - t1) + c1 * t1
    rgb = rgb * (1 - t2) + c2 * t2
    # 日面是聚集点画：成簇的亮点和暗点，近看是印出来的
    cl = fbm(S, S, 53, scales=(70, 24, 8), weights=(0.45, 0.35, 0.2))
    hi = stipple(np.clip(1.1 - rc, 0, 1), 0.3, rng, cluster=cl)
    lo = stipple(np.clip(rc - 0.2, 0, 1), 0.22, rng, cluster=1 - cl)
    rgb = rgb * (0.88 + 0.12 * cl[..., None]) + hi[..., None] * np.array([255, 216, 170.0]) * 0.16 - lo[..., None] * 26
    # 不透明度：中间实，向外由点画散到透明（不是一刀切的圆边）
    body = np.clip(1 - np.clip((r - 0.55) / 0.45, 0, 1) ** 1.6, 0, 1)
    edge = np.clip(1 - np.abs(r - 0.98) / 0.16, 0, 1)
    rim = stipple(edge, 0.42, rng, cluster=cl)
    a = body * (0.88 - 0.3 * np.clip(rc - 0.6, 0, 1)) + rim * 0.5 * (r > 0.86)
    save_rgba('sun.webp', rgb, np.clip(a, 0, 1), quality=90)


def paper():
    N = 512
    rng = np.random.default_rng(61)
    v = 1 - 0.035 * periodic_noise(N, 1.6, 62) - 0.02 * periodic_noise(N, 0.5, 63)
    # 纤维：短而弯的细丝，过边就从对面接着画（平铺无缝）
    img = np.zeros((N, N))
    for _ in range(900):
        x0, y0 = rng.random() * N, rng.random() * N
        ang = rng.random() * np.pi
        length = 6 + rng.random() * 26
        bend = (rng.random() - 0.5) * 0.08
        tone = (rng.random() - 0.62) * 0.09
        for s in np.linspace(0, length, int(length * 2)):
            a = ang + bend * s
            xx, yy = int(x0 + np.cos(a) * s) % N, int(y0 + np.sin(a) * s) % N
            img[yy, xx] += tone
    speck = (rng.random((N, N)) < 0.0016) * (-0.18 * rng.random((N, N)))
    v = v + img * 0.6 + speck
    g = np.clip(v, 0, 1) * 255
    save_rgb('paper.webp', np.dstack([g, g, g]), quality=90)


def mottle():
    N = 512
    v = 0.5 + 0.5 * (periodic_noise(N, 3.0, 71) * 0.6 + periodic_noise(N, 1.0, 72) * 0.4 - 0.5)
    g = np.clip(v, 0, 1) * 255
    save_rgb('mottle.webp', np.dstack([g, g, g]), quality=85)


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    for fn in (sky, cone, pool, sun, paper, mottle):
        fn()
        print('写好', fn.__name__)

"""07 晴空水上乐园 · 颜色层：每层一个 render(C, G, tok) -> 预乘 RGBA。

本题自己的砖引擎（tile_field / glaze / raise_tiles）：每块砖是一个圆角极小的方块，按全局方格查表上色，
水线以下的行整行错开（G['shift']）；釉面 = 受光一侧的边亮、背光一侧的边暗 + 一道斜的釉光 + 少数砖上一点高光；
字的砖是微微凸起的（体素）：右下露出一点砖的侧面，整块字在墙上落一道池水青暗调的影。

颜色角色（报告 2.4）：
  字面色    深青墨的釉面砖（几种深浅的砖混着铺，不是一种平色）；水线以下浅一档的池青
  主题色    池水青（水、LIDO、水滴）和晒白的石（墙砖）；灰浆比墙砖深一点点
  阴影色    池水青的暗调（tok worldDeep），不用黑
  高光      釉面受光的边、砖上的高光点、水面一排方块闪光、日上的星芒
  点缀色    金和珊瑚：日（金→橙→珊瑚）为主，墙砖从日往外一圈圈、一道道染暖（光晕和光芒），救生圈的珊瑚为呼应
  共用金属  日中心的浅金
"""
import math
import numpy as np
import cv2
from lockupkit import fx as F
from lockupkit.geom import rect, circle, star4
from .letters import P, GROUT

LIGHT = (-0.6, -0.8)        # 光从左上来（屏幕坐标，指向光源）


def hx(h):
    return F.rgb(h)


def mixc(a, b, t):
    a = hx(a) if isinstance(a, str) else a
    b = hx(b) if isinstance(b, str) else b
    return a * (1 - t) + b * t


def _rng(seed):
    return np.random.default_rng(seed)


def _pick(rng, pal, w=None):
    i = rng.choice(len(pal), p=None if w is None else np.array(w) / np.sum(w))
    return hx(pal[i]) if isinstance(pal[i], str) else pal[i]


# ====================================================================== 砖引擎


def tile_field(C, keys, shift, size_var=0.25, jitter=0.25, r=0.9, seed=1, grout=GROUT):
    """方格上的一组砖（keys：[(i, j)…]）逐像素查表。返回 dict：
    k 每个像素落在第几块砖（-1 没有）、a 覆盖率、sx sy 到砖心的偏移（舞台像素）、depth 离砖边多深（像素，舞台）、nx ny 最近一条边的外法线"""
    XX, YY = C.XX, C.YY
    n = len(keys)
    out = {'k': np.full(XX.shape, -1, np.int32), 'a': np.zeros(XX.shape, np.float32)}
    if n == 0:
        return out
    ia = np.array([c[0] for c in keys])
    ja = np.array([c[1] for c in keys])
    i0, i1, j0, j1 = ia.min(), ia.max(), ja.min(), ja.max()
    lut = -np.ones((j1 - j0 + 1, i1 - i0 + 1), np.int32)
    lut[ja - j0, ia - i0] = np.arange(n)
    jj = np.floor(YY / P).astype(np.int32)
    jmin = int(jj.min())
    dxr = np.array([shift(j) for j in range(jmin, int(jj.max()) + 1)], np.float32)
    xs = XX - dxr[jj - jmin]
    ii = np.floor(xs / P).astype(np.int32)
    inb = (ii >= i0) & (ii <= i1) & (jj >= j0) & (jj <= j1)
    k = np.full(XX.shape, -1, np.int32)
    k[inb] = lut[jj[inb] - j0, ii[inb] - i0]
    rng = _rng(seed)
    jx, jy = rng.uniform(-jitter, jitter, n).astype(np.float32), rng.uniform(-jitter, jitter, n).astype(np.float32)
    sv = rng.uniform(-size_var, size_var, n).astype(np.float32)
    kk = np.maximum(k, 0)
    sx = (xs / P - ii - 0.5) * P - jx[kk]
    sy = (YY / P - jj - 0.5) * P - jy[kk]
    b = P / 2 - grout / 2 + sv[kk]
    e = b - r
    dqx, dqy = np.abs(sx) - e, np.abs(sy) - e
    d = np.sqrt(np.maximum(dqx, 0) ** 2 + np.maximum(dqy, 0) ** 2) + np.minimum(np.maximum(dqx, dqy), 0) - r
    a = np.clip(0.5 - d * C.scale, 0, 1) * (k >= 0)
    nx = np.where(dqx > dqy, np.sign(sx), 0.0)
    ny = np.where(dqx > dqy, 0.0, np.sign(sy))
    corner = (dqx > 0) & (dqy > 0)
    L = np.sqrt(dqx ** 2 + dqy ** 2) + 1e-6
    nx = np.where(corner, np.sign(sx) * dqx / L, nx)
    ny = np.where(corner, np.sign(sy) * dqy / L, ny)
    out.update({'k': k, 'a': a.astype(np.float32), 'sx': sx, 'sy': sy, 'depth': -d, 'nx': nx, 'ny': ny, 'n': n})
    return out


def glaze(C, T, colors, gloss=None, bright=None, bevel_px=1.0, edge=0.26, sheen=0.07, spec=0.45, seed=3):
    """釉面：每块砖自己的颜色 + 受光边亮、背光边暗 + 斜的釉光 + 高光点。返回预乘 RGBA"""
    k, a = T['k'], T['a']
    if T.get('n', 0) == 0:
        return np.zeros(a.shape + (4,), np.float32)
    kk = np.maximum(k, 0)
    n = T['n']
    rng = _rng(seed)
    if bright is None:
        bright = rng.uniform(0.965, 1.035, n).astype(np.float32)
    if gloss is None:
        gloss = (rng.random(n) < 0.35).astype(np.float32) * rng.uniform(0.4, 1.0, n).astype(np.float32)
    col = colors[kk] * bright[kk][..., None]
    bev = np.clip(1 - T['depth'] / bevel_px, 0, 1)
    facing = T['nx'] * LIGHT[0] + T['ny'] * LIGHT[1]
    lift = bev * facing
    col = np.where(lift[..., None] > 0, col + (1 - col) * (lift * edge)[..., None], col * (1 + lift * edge * 1.1)[..., None])
    u = T['sx'] / P + 0.5
    v = T['sy'] / P + 0.5
    col = col * (1 + sheen * (0.5 - (u + v) / 2))[..., None]
    sp = np.exp(-((u - 0.3) ** 2 + (v - 0.28) ** 2) / 0.010) * gloss[kk]
    col = col + (1 - col) * (sp * spec)[..., None]
    col = np.clip(col, 0, 1)
    return F.solid(a, col)


def raise_tiles(C, L, a, side_col, depth=1.3, shadow=None):
    """砖凸起（体素）：右下露出砖的侧面；shadow=(颜色, 不透明度, 偏移, 模糊) 时整块在墙上落影"""
    steps = 4
    side = np.zeros_like(L)
    for s in range(steps, 0, -1):
        t = depth * s / steps
        m = F.shift(a, t * 0.55 * C.scale, t * 0.85 * C.scale)
        side = F.over(side, F.solid(m, side_col))
    out = F.over(side, L)
    if shadow:
        sc, so, off, bl = shadow
        sh = F.drop_shadow(np.maximum(a, F.shift(a, depth * 0.55 * C.scale, depth * 0.85 * C.scale)), off[0] * C.scale, off[1] * C.scale, bl * C.scale)
        out = F.over(F.solid(sh * so, sc), out)
    return out


def tile_colors(keys, fn):
    return np.array([fn(c) for c in keys], np.float32).reshape(-1, 3)


def _noise_at(seed, cell=6.0):
    """砖格上的低频噪声 f(i, j) -> 0–1（让颜色成片地变，不是逐块乱跳）"""
    rng = _rng(seed)
    g = rng.random((64, 64)).astype(np.float32)
    g = cv2.GaussianBlur(g, (0, 0), 1.2)
    g = (g - g.min()) / (g.max() - g.min() + 1e-6)

    def f(i, j):
        x, y = i / cell, j / cell
        x0, y0 = int(math.floor(x)) % 63, int(math.floor(y)) % 63
        fx, fy = x - math.floor(x), y - math.floor(y)
        return float(g[y0, x0] * (1 - fx) * (1 - fy) + g[y0, x0 + 1] * fx * (1 - fy) + g[y0 + 1, x0] * (1 - fx) * fy + g[y0 + 1, x0 + 1] * fx * fy)
    return f


def _hash(i, j, s=0):
    h = (i * 73856093) ^ (j * 19349663) ^ (s * 83492791)
    h = (h ^ (h >> 13)) * 1274126177
    return ((h ^ (h >> 16)) & 0xFFFF) / 65535.0


# ====================================================================== 墙（底板）


def content_cells(G):
    """锁定里“有东西”的砖格：中文、LID、救生圈、手写、底线带（底板沿着它们的外轮廓长）"""
    occ = set(G['cells']) | set(G['lid'])
    cx, cy = G['ring']['c']
    R = G['ring']['R'] + 10
    for j in range(int((cy - R) // P), int((cy + R) // P) + 1):
        for i in range(int((cx - R) // P), int((cx + R) // P) + 1):
            if math.hypot((i + 0.5) * P - cx, (j + 0.5) * P - cy) < R:
                occ.add((i, j))
    # 「晴」下面、底线带上面那一角也算（底板在这里连成一片，不留洞）
    hb = G['hero'].bounds
    filler = rect(hb[0], hb[3], hb[2] + 2 * P, G['caps'].bounds[1])
    for p in (G['script'], G['caps'], filler):
        b = p.bounds
        for j in range(int(b[1] // P), int(b[3] // P) + 1):
            for i in range(int(b[0] // P), int(b[2] // P) + 1):
                occ.add((i, j))
    return occ


def plate_cells(G):
    """底板的砖：一块马赛克残片，沿着锁定的外轮廓往外长三四块砖，边上掉砖、零星几块散在外面。
    返回 {(i, j): f}，f > 0 在里面，越大离边越远"""
    occ = content_cells(G)
    ia = [c[0] for c in occ]
    ja = [c[1] for c in occ]
    i0, i1, j0, j1 = min(ia) - 10, max(ia) + 10, min(ja) - 10, max(ja) + 10
    m = np.zeros((j1 - j0 + 1, i1 - i0 + 1), np.uint8)
    for (i, j) in occ:
        m[j - j0, i - i0] = 1
    # 先把字与字之间的空当填上（闭运算），再量每块砖离锁定多远
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (17, 17))
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, k)
    dist = cv2.distanceTransform((1 - m).astype(np.uint8), cv2.DIST_L2, 5)
    nz = _noise_at(41, 3.2)
    nz2 = _noise_at(43, 1.3)
    out = {}
    for j in range(j0, j1 + 1):
        for i in range(i0, i1 + 1):
            d = dist[j - j0, i - i0]
            f = 1 - d / 3.6 + (nz(i, j) - 0.5) * 0.9 + (nz2(i, j) - 0.5) * 0.3
            h = _hash(i, j, 7)
            if f > 0.22 or (f > 0 and h < f / 0.22 * 0.8) or (f > -0.45 and h < 0.03):
                out[(i, j)] = f
    return out


STONE = ['#F4EFE6', '#F2ECE1', '#F6F2EA', '#F0EADE']
RAY = ['#F3D387', '#F6E0AA', '#F8EACB']
SUNDUST = ['#F2C963', '#F6D98F', '#F9E7B8']


def render_plate(C, G, tok):
    cells = plate_cells(G)
    keys = list(cells)
    wl = G['wl']
    jw = int(round(wl / P))
    sx, sy = G['sun']
    bx0, by0, bx1, by1 = G['sun_box']
    nz = _noise_at(5, 4.0)
    ground = hx(tok['worldPale'])
    w_top, w_deep = hx('#A9DEDC'), hx('#78C5C9')

    def caus(i, j):
        x, y = i * 0.43, (j - jw) * 0.61
        return abs(math.sin(x + 1.4 * math.sin(y * 0.9 + 0.3)) * math.sin(y * 1.1 + 1.2 * math.sin(x * 0.7)))

    def color(c):
        i, j = c
        h = _hash(i, j, 3)
        f = cells[c]
        fade = float(np.clip(0.35 + f / 0.5, 0, 1))          # 边上的砖淡到底色
        x, y = (i + 0.5) * P, (j + 0.5) * P
        if j < jw:
            base = hx(STONE[int(h * 3.999)])
            # 太阳的光芒：日的外面，十道金砖的放射线，一块块排出去，越远越淡
            d = math.hypot((x - sx) / 1.0, (y - sy) / 1.0)
            th = math.atan2(y - sy, x - sx)
            ray = ((th / (2 * math.pi)) * 10 + 0.25) % 1.0 < 0.34
            outside = not (bx0 - 2 * P <= x <= bx1 + 2 * P and by0 - 2 * P <= y <= by1 + 2 * P)
            if bx0 <= x <= bx1 and by0 <= y <= by1 and c not in G['cells']:
                # 日的字腔里：墙砖被太阳照透，浅金一片（太阳是满的，日的框仍然读得出）
                q = 0 if _hash(i, j, 15) < 0.55 else 1
                return hx(['#FBE9BD', '#F8DD9E'][q])
            if ray and outside and d < 250:
                t = d / 250
                q = 0 if t < 0.42 else (1 if t < 0.72 else 2)
                if not (q == 2 and h < 0.45):
                    base = hx(RAY[q])
            # 金色像纹理一样从日里散出来：越近越密，一块块的金砖
            if outside and d < 190 and y < sy + 60 and _hash(i, j, 13) < 0.24 * (1 - d / 190) ** 1.5:
                base = hx(SUNDUST[int(_hash(i, j, 14) * 2.999)])
            if (j == jw - 1 and h < 0.2) or (j == jw - 2 and h < 0.07):   # 水线上溅上来的池青
                base = hx('#BFE4E0')
            return base * fade + ground * (1 - fade)
        t = min(1.0, (j - jw) / 5.0)
        base = w_top * (1 - t) + w_deep * t
        base = base * (0.975 + 0.05 * nz(i, j))
        if caus(i, j) < 0.13:
            base = base + (hx('#E8F7F3') - base) * (0.6 * (1 - t * 0.6))
        if j == jw and h < 0.28:                             # 水面碎成方块的闪光
            base = hx('#F5FCFA')
        return base * fade + ground * (1 - fade)
    cols = tile_colors(keys, color)
    T = tile_field(C, keys, G['shift'], seed=11)
    tiles = glaze(C, T, cols, bevel_px=0.9, edge=0.16, sheen=0.04, spec=0.25, seed=12)
    # 灰浆：砖底下一整块（每块砖的整格）。墙上比砖深一点点，水下是浅池青；边上淡掉
    Tb = tile_field(C, keys, G['shift'], size_var=0.0, jitter=0.0, r=0.4, grout=-0.9)
    fk = np.array([float(np.clip(0.35 + cells[c] / 0.5, 0, 1)) for c in keys], np.float32)
    bed = Tb['a'] * (0.25 + 0.75 * fk[np.maximum(Tb['k'], 0)])
    yy = C.YY
    gcol = np.where((yy >= wl)[..., None], hx('#86C9CB')[None, None], hx('#E3DBCC')[None, None])
    gr = F.solid(bed, gcol)
    # 水面：贴着水线一道亮、下面一层薄的暗（弯月面）
    surf = np.exp(-((yy - wl - 1.0) / 1.1) ** 2) * bed
    under = np.clip((yy - wl) / 2.5, 0, 1) * np.exp(-(yy - wl) / 7.0) * bed
    out = F.stack([gr, tiles])
    out = F.over(out, F.solid(under * 0.22, tok['worldDeep']))
    out = F.over(out, F.solid(surf * 0.8, '#FFFFFF'))
    return out


# ====================================================================== 字


def _text_cells(G, role):
    return {c: v for c, v in G['cells'].items() if v['role'] == role}


INK = ['#10414A', '#13505A', '#163F5A', '#0D343C', '#124855']
UNDER = ['#2A7A86', '#2F838E', '#26717D', '#348B96', '#2C7E8A']
DROP = ['#2E9CA8', '#46AFB8', '#2189A0']


def _char_colors(G, cells, tok, seed):
    wl = G['wl']
    jw = int(round(wl / P))
    nz = _noise_at(seed, 5.0)

    def color(c):
        i, j = c
        v = cells[c]
        h = _hash(i, j, seed)
        if '滴' in v['tags']:
            pal = DROP if j < jw else ['#3FA6B1', '#4BB1BA', '#369CA8']
            # 水滴：最上面那块是受光的白
            top = (i, j - 1) not in cells or '滴' not in cells[(i, j - 1)]['tags']
            if top and j < jw and h < 0.7:
                return hx('#D6F1EE')
            return hx(pal[int(h * len(pal) * 0.999)])
        if j >= jw:
            q = min(len(UNDER) - 1, int((nz(i, j) * 0.6 + h * 0.4) * len(UNDER)))
            return hx(UNDER[q])
        q = int(min(0.999, nz(i, j) * 0.55 + h * 0.45) * len(INK))
        return hx(INK[q])
    return color


def _render_chars(C, G, tok, cells, color, seed, shadow_alpha=0.32):
    keys = list(cells)
    cols = tile_colors(keys, color)
    T = tile_field(C, keys, G['shift'], seed=seed)
    L = glaze(C, T, cols, seed=seed + 1)
    a = T['a']
    wl = G['wl']
    above = (C.YY < wl).astype(np.float32)
    side = mixc(tok['ink'], '#06191D', 0.5)
    out = raise_tiles(C, L, a, side, depth=1.3)
    # 整块字落在墙上的影（池水青暗调）；水下的字不落影
    sh = F.drop_shadow(a * above, 2.2 * C.scale, 3.4 * C.scale, 2.4 * C.scale) * above
    return F.over(F.solid(sh * shadow_alpha, tok['worldDeep']), out)


def render_text(C, G, tok):
    cells = _text_cells(G, 'text')
    return _render_chars(C, G, tok, cells, _char_colors(G, cells, tok, 21), 22)


HERO_SUN = ['#FBDA82', '#F5C45C', '#EDA947', '#EF8A48', '#F2694A']
HERO_QING = ['#123E58', '#17506A', '#0F3F4B', '#1B5D74', '#10414A']


def render_hero(C, G, tok):
    """「晴」：日是金砖太阳（中间浅金、往外橙、外缘珊瑚，按离日心的远近一圈圈换砖，边界上两色交错），青是钴蓝和深池青的砖"""
    cells = _text_cells(G, 'hero')
    sx, sy = G['sun']
    bx0, by0, bx1, by1 = G['sun_box']
    rx, ry = (bx1 - bx0) / 2, (by1 - by0) / 2
    nz = _noise_at(31, 3.0)

    def color(c):
        i, j = c
        h = _hash(i, j, 33)
        if '日' in cells[c]['tags']:
            # 日：中间浅金、往外金、再橙，四个角落珊瑚；两档之间只在交界那一圈交错
            d = max(abs((i + 0.5) * P - sx) / rx, abs((j + 0.5) * P - sy) / ry)
            dd = math.hypot(((i + 0.5) * P - sx) / rx, ((j + 0.5) * P - sy) / ry)
            q = dd * 2.6 + (h - 0.5) * 0.55
            q = int(np.clip(q, 0, 3))
            if d > 0.86 and dd > 1.12:
                q = 4
            return hx(HERO_SUN[q])
        q = int(min(0.999, nz(i, j) * 0.6 + h * 0.4) * len(HERO_QING))
        return hx(HERO_QING[q])
    keys = list(cells)
    cols = tile_colors(keys, color)
    T = tile_field(C, keys, G['shift'], seed=41)
    rng = _rng(42)
    gloss = np.array([0.9 if '日' in cells[c]['tags'] and rng.random() < 0.55 else (0.6 if rng.random() < 0.3 else 0.0) for c in keys], np.float32)
    L = glaze(C, T, cols, gloss=gloss, seed=43, spec=0.75)
    a = T['a']
    side_sun = mixc('#C86A2E', '#7A3418', 0.3)
    side_ink = mixc(tok['ink'], '#06191D', 0.5)
    k = T['k']
    is_sun = np.array([1.0 if '日' in cells[c]['tags'] else 0.0 for c in keys], np.float32)[np.maximum(k, 0)] * (k >= 0)
    side = side_ink * (1 - is_sun[..., None]) + side_sun * is_sun[..., None]
    out = raise_tiles(C, L, a, side, depth=1.4)
    sh = F.drop_shadow(a, 2.2 * C.scale, 3.4 * C.scale, 2.4 * C.scale)
    return F.over(F.solid(sh * 0.32, tok['worldDeep']), out)


# ====================================================================== 英文


LID_PAL = ['#A3D8D7', '#B4E0DD', '#92CFD0', '#C3E8E4']


def render_lido(C, G, tok):
    cells = G['lid']
    keys = list(cells)
    cols = tile_colors(keys, lambda c: hx(LID_PAL[int(_hash(c[0], c[1], 51) * 3.999)]))
    T = tile_field(C, keys, G['shift'], seed=52)
    L = glaze(C, T, cols, seed=53, edge=0.28)
    side = mixc(tok['world'], tok['worldDeep'], 0.45)
    out = raise_tiles(C, L, T['a'], side, depth=1.1)
    sh = F.drop_shadow(T['a'], 1.8 * C.scale, 2.8 * C.scale, 2.0 * C.scale)
    return F.over(F.solid(sh * 0.2, tok['worldDeep']), out)


def render_script(C, G, tok):
    """greetings from：深青墨的一笔手写，身下一圈墙砖的颜色把 LID 切开，再落一道很浅的影"""
    m = C.R(G['script'], ss=3)
    halo = F.dilate(m, 2.6 * C.scale)
    halo = F.blur(halo, 0.6 * C.scale)
    sh = F.drop_shadow(m, 1.2 * C.scale, 2.0 * C.scale, 1.4 * C.scale)
    return F.stack([F.solid(halo * 0.92, '#F3EEE4'), F.solid(sh * 0.35, tok['worldDeep']), F.solid(m, tok['worldDeep'])])


def render_caps(C, G, tok):
    m = C.R(G['caps'], ss=3)
    halo = F.blur(F.dilate(m, 1.6 * C.scale), 0.8 * C.scale)
    return F.stack([F.solid(halo * 0.35, '#E8F6F3'), F.solid(m, tok['ink'])])


# ====================================================================== 主体：救生圈


RING_CORAL = ['#F2694A', '#F47B58', '#EB5E41', '#F6876A']
RING_WHITE = ['#FFF8EC', '#F7F1E5', '#FFFCF5', '#F2EBDD']


def render_ring(C, G, tok):
    E = G['ring']
    cx, cy = E['c']
    R, r = E['R'], E['r']
    rm, half = (R + r) / 2, (R - r) / 2
    tiles = E['tiles']
    acc = np.zeros((C.H, C.W, 3), np.float32)
    A = np.zeros((C.H, C.W), np.float32)
    rng = _rng(61)
    for t in tiles:
        m = C.R(t['path'], ss=3)
        pal = RING_CORAL if t['coral'] else RING_WHITE
        col = hx(pal[int(rng.random() * 3.999)]) * rng.uniform(0.97, 1.03)
        acc = acc * (1 - m[..., None]) + col * m[..., None]
        A = np.maximum(A, m)
    # 圆环的体积：按到管心的距离和方向算法线，光从左上来
    dx, dy = C.XX - cx, C.YY - cy
    rr = np.sqrt(dx * dx + dy * dy) + 1e-6
    s = np.clip((rr - rm) / half, -1, 1)
    nz_ = np.sqrt(np.clip(1 - s * s, 0, 1))
    nxx, nyy = dx / rr * s, dy / rr * s
    lam = np.clip(nxx * LIGHT[0] + nyy * LIGHT[1] + nz_ * 0.75, 0, 1.4)
    shade = 0.62 + 0.42 * lam
    col = acc * shade[..., None]
    # 高光：管子左上方一道亮的弧
    hl = np.exp(-((s + 0.3) / 0.25) ** 2) * np.clip((dx / rr) * LIGHT[0] + (dy / rr) * LIGHT[1], 0, 1) ** 2.5
    col = col + (1 - col) * (hl * 0.75)[..., None]
    col = np.clip(col, 0, 1)
    # 砖缝底：深一点的珊瑚和白，按段
    bed = C.R(circle(cx, cy, R + 0.6), ss=3) * (1 - C.R(circle(cx, cy, r - 0.6), ss=3))
    bedcol = np.zeros((C.H, C.W, 3), np.float32) + hx('#D9D0C0')
    bedcol = bedcol * shade[..., None]
    rope = C.R(E['rope'], ss=3)
    wraps = C.R(E['wraps'], ss=3)
    beads = C.R(E['beads'], ss=3)
    ink = tok['worldDeep']
    sh = F.drop_shadow(np.maximum(bed, rope), 3.0 * C.scale, 5.0 * C.scale, 3.4 * C.scale)
    return F.stack([
        F.solid(sh * 0.34, tok['worldDeep']),
        F.solid(bed, bedcol),
        F.solid(A, col),
        F.solid(rope, ink), F.solid(wraps, ink),
        F.solid(beads, ink),
    ])


# ====================================================================== 高光


def render_fx(C, G, tok):
    """水面一排方块闪光（四芒小星）、日的金砖上几点闪光"""
    wl = G['wl']
    out = []
    pts = []
    rng = _rng(71)
    x0, x1 = G['geo']['strokes'][0]['pts'][0][0], G['geo']['strokes'][0]['pts'][1][0]
    for _ in range(9):
        x = rng.uniform(x0 + 40, x1 - 30)
        pts.append((x, wl + rng.uniform(1.5, 4.0), rng.uniform(4.5, 8.5)))
    m = C.zeros()
    for x, y, s in pts:
        m = np.maximum(m, C.R(star4(x, y, s, 0.14)))
        m = np.maximum(m, C.R(rect(x - 1.1, y - 1.1, x + 1.1, y + 1.1)))
    out.append(F.glow_layer(F.blur(m, 1.2 * C.scale) * 0.55, '#E8FBFF'))
    out.append(F.glow_layer(m * 0.95, '#FFFFFF'))
    sx0, sy0, sx1, sy1 = G['sun_box']
    g = C.zeros()
    for (x, y, s) in ((sx0 + 0.78 * (sx1 - sx0), sy0 + 0.46 * (sy1 - sy0), 6.0), (sx0 + 0.22 * (sx1 - sx0), sy0 + 0.82 * (sy1 - sy0), 5.0)):
        g = np.maximum(g, C.R(star4(x, y, s, 0.14)))
    out.append(F.glow_layer(F.blur(g, 1.0 * C.scale) * 0.6, '#FFF2CC'))
    out.append(F.glow_layer(g, '#FFFDF4'))
    return F.stack(out)


# ====================================================================== 小形态


def small_face(C, mask, ink):
    """小形态里签名字「晴」的面：左边的日是金砖（上浅金、下珊瑚），右边的青和题名同一种铅印的字色 ink"""
    cols = np.where(mask.max(axis=0) > 0.05)[0]
    x0, x1 = (cols[0], cols[-1]) if len(cols) else (0, C.W - 1)
    split = x0 + 0.43 * (x1 - x0)
    rows = np.where(mask.max(axis=1) > 0.05)[0]
    y0, y1 = (rows[0], rows[-1]) if len(rows) else (0, C.H - 1)
    t = np.clip((np.arange(C.H, dtype=np.float32)[:, None] - y0) / max(1, y1 - y0), 0, 1)
    t = np.broadcast_to(t, mask.shape).astype(np.float32)
    sun = F.ramp(t, [(0, '#FBDA82'), (0.5, '#EFA548'), (1, '#F2694A')])
    rest = np.zeros_like(sun) + hx(ink)
    left = (np.arange(C.W, dtype=np.float32)[None, :] < split).astype(np.float32)
    col = sun * left[..., None] + rest * (1 - left[..., None])
    return F.solid(mask, col)

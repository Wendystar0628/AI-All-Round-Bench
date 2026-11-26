"""01 现代Agent概念PV · 颜色层：每层一个 render(C, G, tok) -> 预乘 RGBA。颜色全部取 tok（tokens.json 里这一题的 directions[]）。

这一题是亮底：一块浅灰蓝的屏（world），上面藏青的字（ink），电光蓝（lit）是光标自己发的光。
颜色角色（报告 2.4）：
  字面色    藏青 ink：汉字和 PV；朝光标那一侧的边被它的蓝光照着，带一层很淡的扫描线
  主题色    浅灰蓝 world（底板：一块屏，里面隐着等宽的字格）、深藏青 worldDeep（阴影、键帽的影子）
  阴影色    浅灰蓝往深藏青压一档（不用纯黑）
  高光      暖白 light（键帽的受光边、荧光的芯子）
  点缀色    电光蓝 lit：光标为主（实心、芯子发白、一圈余辉）；Agent 的荧光、回车键的透光箭头和背光为呼应——同一种料：屏上自发的光
"""
import numpy as np
from lockupkit import fx as F
from lockupkit.geom import rect, union


def rgb_str(h):
    c = F.rgb(h)
    return ','.join(str(int(round(v * 255))) for v in c)


def mixh(a, b, t):
    return F.mix(F.rgb(a), F.rgb(b), t)


def scan(C, period=4.0, depth=0.12):
    """屏的扫描线：每 period 舞台像素一道暗线（1 = 不变，1 − depth = 最暗）"""
    y = C.YY * (2 * np.pi / period)
    return 1 - depth * (0.5 + 0.5 * np.cos(y)) ** 3


def lamp_rim(C, mask, G, width=1.2, power=1.6, reach=320.0):
    """光标是这一件里唯一的灯：每个形朝光标那一侧的边被它照亮一线，越远越淡。返回强度"""
    cx, cy = G['cursor_c']
    d = F.dist_in(mask)
    band = np.clip(1 - d / C.px(width), 0, 1) * (mask > 0.02)
    sm = F.blur(mask, max(0.8, C.px(width) * 0.6))
    gx, gy = F.grad(sm)
    nrm = np.sqrt(gx * gx + gy * gy) + 1e-6
    nx, ny = -gx / nrm, -gy / nrm
    lx, ly = cx - C.XX, cy - C.YY
    dist = np.sqrt(lx * lx + ly * ly) + 1e-6
    facing = np.clip((nx * lx + ny * ly) / dist, 0, 1) ** power
    return band * facing * np.exp(-dist / reach)


def shade(tok, t):
    """阴影色：浅灰蓝往深藏青压 t"""
    return mixh(tok['world'], tok['worldDeep'], t)


# ====================================================================== 底板


def scan_streaks(C, region, seed, count, length=(30, 260), height=(1.0, 3.2)):
    """一把横向的扫描条：落在 region（0–1 概率图）里，长短不一、粗细不一，都落在扫描线的格上。返回覆盖率"""
    rng = np.random.default_rng(seed)
    w = region.astype(np.float64).ravel()
    if w.sum() <= 0:
        return C.zeros()
    idx = rng.choice(w.size, size=count, p=w / w.sum())
    ys, xs = np.unravel_index(idx, region.shape)
    m = C.zeros()
    S = C.scale
    for x, y in zip(xs, ys):
        L = rng.uniform(*length) * S
        h = rng.uniform(*height) * S
        x0 = int(x - L * rng.uniform(0.2, 0.8))
        y0 = int(round(y / (4 * S))) * 4 * S
        m[max(0, y0):max(0, y0) + max(1, int(h)), max(0, x0):max(0, int(x0 + L))] = rng.uniform(0.55, 1.0)
    return m


def render_plate(C, G, tok):
    """一块浅灰蓝的屏：由字块长出来、跟着字走；左右两头碎成一行行横向的扫描条，上下两沿是撕口、边上积一线深色；
    里面隐着一张等宽的字格和很淡的扫描线；光标那里透一圈蓝"""
    from .emblem import rrect
    XX, YY, px = C.XX, C.YY, C.px
    P = G['plate']
    m = C.R(union([rrect(*b) for b in P['boxes']]))
    body = F.blur(m, px(20))
    n = F.fbm(C.H, C.W, 70, 3, octaves=6)
    nh = F.fbm(C.H, C.W, 46, 8, octaves=5, aniso=(9.0, 0.35))
    field = body + (nh - 0.5) * 0.5 + (n - 0.5) * 0.22
    core = F.smoothstep(0.47, 0.55, field)
    x0, x1 = P['span']
    xc, hw = (x0 + x1) / 2, (x1 - x0) / 2
    side = F.smoothstep(0.62, 0.9, np.abs(XX - xc) / hw)
    zone = F.smoothstep(0.30, 0.47, field) * (1 - core) * side
    streak = scan_streaks(C, zone, 11, 130, length=(12, 96), height=(1.0, 2.4))
    a = np.maximum(core, streak * 0.9)
    col = np.zeros((C.H, C.W, 3), np.float32) + F.rgb(tok['world'])
    col = F.mix(col, F.rgb(tok['worldPale'])[None, None], (F.smoothstep(0.55, 0.92, n) * 0.35)[..., None])
    # 撕口上积的一线深色（颜料干在边上）
    rim = np.clip(core - F.erode(core, px(2.5)), 0, 1)
    col = F.mix(col, shade(tok, 0.16)[None, None], (rim * 0.6)[..., None])
    col = F.mix(col, shade(tok, 0.10)[None, None], (streak * (1 - core) * 0.8)[..., None])
    # 字格：每 14 舞台像素一格，只在噪声斑块里隐约显出，离字远一点
    g = C.zeros()
    step = int(14 * C.scale)
    g[:, ::step] = 0.5
    g[::step, :] = np.maximum(g[::step, :], 0.5)
    gm = F.smoothstep(0.42, 0.72, F.fbm(C.H, C.W, 110, 7, octaves=4)) * (1 - np.clip(F.blur(C.R(G['text']), px(8)) * 2, 0, 1)) * core
    col = F.mix(col, shade(tok, 0.22)[None, None], (g * gm * 0.5)[..., None])
    col = col * scan(C, 4.0, 0.03)[..., None]
    # 光标那里透出来的一圈蓝
    cx, cy = G['cursor_c']
    r = np.sqrt((XX - cx) ** 2 + (YY - cy) ** 2)
    col = F.mix(col, F.rgb(tok['lit'])[None, None], (np.exp(-(r / 130.0) ** 2) * 0.16)[..., None])
    col = col * (1 + (F.grain(C.H, C.W, 9, 0.7)[..., None] - 0.5) * 0.03)
    return F.solid(a * 0.96, np.clip(col, 0, 1))


# ====================================================================== 汉字


def ink_text(C, path, tok, G, seat=True):
    """藏青的字：上沿略浅、下沿沉一点，朝光标那一侧的边被蓝光照着，一层很淡的扫描线；身下一圈浅灰蓝压暗的影子"""
    A = C.R(path, ss=3)
    rows = np.where(A.max(axis=1) > 0.05)[0]
    y0, y1 = (rows[0], rows[-1]) if len(rows) else (0, C.H - 1)
    t = np.clip((np.arange(C.H, dtype=np.float32)[:, None] - y0) / max(1, y1 - y0), 0, 1)[..., None]
    top, bot = mixh(tok['ink'], tok['worldDeep'], 0.35), F.rgb(tok['ink'])
    col = np.broadcast_to(top * (1 - t) + bot * t, (C.H, C.W, 3)).copy()
    col = col + (F.rgb(tok['world']) - col) * (1 - scan(C, 4.0, 0.05))[..., None]
    rim = lamp_rim(C, A, G, width=1.4)
    col = col + (F.rgb(tok['lit']) - col) * np.clip(rim * 1.3, 0, 1)[..., None]
    layers = []
    if seat:
        sh = F.drop_shadow(A, C.px(1.0), C.px(2.5), C.px(3.0), spread=C.px(0.6))
        layers.append(F.solid(sh * 0.5, shade(tok, 0.45)))
    layers.append(F.solid(A, np.clip(col, 0, 1)))
    return F.stack(layers)


def render_line1(C, G, tok):
    """第一段「现代」（光标单独一层）"""
    return ink_text(C, G['line1'], tok, G)


def render_line2(C, G, tok):
    """第二段「概念PV」"""
    return ink_text(C, G['line2'], tok, G)


# ====================================================================== 荧光：Agent 和光标


def phosphor(C, A, tok, G=None, heart=0.26, glow=0.32, halo=0.12):
    """屏上自发的光：点亮色的实心，笔画越厚的地方芯子越白（电子束打得最狠），一层扫描线；外面一圈蓝的余辉、再一大圈淡的。
    G 给了就加光标那一侧的亮边"""
    lit, white = F.rgb(tok['lit']), F.rgb(tok['light'])
    d = F.dist_in(A)
    h = np.clip((d - C.px(2.0)) / C.px(7), 0, 1)[..., None]
    col = lit[None, None] * (1 - h * heart) + white[None, None] * (h * heart)
    col = col * scan(C, 4.0, 0.07)[..., None]
    if G is not None:
        rim = lamp_rim(C, A, G, width=1.6, reach=420.0)
        col = col + (white - col) * np.clip(rim * 1.1, 0, 1)[..., None]
    return F.stack([F.solid(F.blur(A, C.px(18)) * halo, tok['lit']),
                    F.solid(F.blur(A, C.px(5)) * glow, tok['lit']),
                    F.solid(A, np.clip(col, 0, 1))])


def render_agent(C, G, tok):
    """Agent：签名词，屏上自发的光（和光标、回车键的透光箭头同一种料）；离光标近的 A 最亮，往右略收"""
    A = C.R(G['agent'], ss=3)
    sh = F.drop_shadow(A, C.px(1.2), C.px(3), C.px(4), spread=C.px(0.8))
    L = phosphor(C, A, tok, G)
    cx = G['cursor_c'][0]
    k = np.clip((C.XX - cx) / 560.0, 0, 1)[..., None]
    rgb = F.unpremul(L)[..., :3]
    rgb = rgb * (1 - 0.10 * k) + F.rgb(tok['lit']) * (0.10 * k)
    L = np.concatenate([rgb * L[..., 3:4], L[..., 3:4]], -1)
    return F.stack([F.solid(sh * 0.35, shade(tok, 0.6)), L])


def render_cursor(C, G, tok):
    """光标：全件唯一亮着的那一块、全件最饱和的一处——点亮色的实心，正中一小团烧成暖白，外面三圈余辉（紧的、中的、散开的）"""
    A = C.R(G['cursor'], ss=3)
    lit, white = F.rgb(tok['lit']), F.rgb(tok['light'])
    d = F.dist_in(A)
    h = (np.clip(d / C.px(9), 0, 1) ** 1.6)[..., None]
    col = lit[None, None] * (1 - h * 0.34) + white[None, None] * (h * 0.34)
    col = col * scan(C, 4.0, 0.05)[..., None]
    return F.stack([F.solid(F.blur(A, C.px(34)) * 0.5, tok['lit']),
                    F.solid(F.blur(A, C.px(10)) * 0.7, tok['lit']),
                    F.solid(F.blur(A, C.px(2.5)) * 0.9, tok['lit']),
                    F.solid(A, np.clip(col, 0, 1))])


# ====================================================================== 回车键


def render_cap(C, G, tok):
    """键帽：暖白的顶面（微凹，后沿一线白的高光，往前一点点灰下去）；两侧的裙边浅灰蓝；正面露出来的是半透的布丁裙，
    背光从下往上透成蓝；顶面上透光的回车箭头（点亮色、芯子发白）和 RETURN；身下一圈压暗的影子"""
    E = G['cap']
    sk, fc = C.R(E['skirt'], ss=3), C.R(E['face'], ss=3)
    x0, y0, x1, y1 = E['box']
    fx0, fy0, fx1, fy1 = E['face_box']
    XX, YY = C.XX, C.YY
    lit, white = F.rgb(tok['lit']), F.rgb(tok['light'])
    # 裙边：浅灰蓝，越往下越透出背光
    tt = np.clip((YY - (fy1 - 6)) / (y1 - fy1 + 6), 0, 1)[..., None]
    skin = shade(tok, 0.10)[None, None] * (1 - tt) + mixh(tok['world'], tok['lit'], 0.55)[None, None] * tt
    side_dark = np.clip(1 - np.minimum(XX - x0, x1 - XX) / 12, 0, 1)[..., None]
    skin = skin * (1 - 0.16 * side_dark)
    # 顶面：暖白，微凹（中间偏下暗一点），往前一点点灰下去
    u = np.clip((YY - fy0) / (fy1 - fy0), 0, 1)
    v = np.clip((XX - fx0) / (fx1 - fx0), 0, 1)
    dish = 0.06 * np.exp(-(((u - 0.62) / 0.42) ** 2 + ((v - 0.5) / 0.55) ** 2))
    face = white[None, None] * (1 - u[..., None] * 0.10) + F.rgb(tok['world'])[None, None] * (u[..., None] * 0.10)
    face = face * (1 - dish[..., None])
    col = skin * (1 - fc[..., None]) + face * fc[..., None]
    col = col + (white - col) * (F.rim_light(sk, C.px(0.9), angle=95, power=3.0) * 0.8)[..., None]
    # 顶面的下沿压在裙边上：一道细暗
    seam = np.clip(F.dilate(fc, C.px(1.2)) - fc, 0, 1)
    col = F.mix(col, shade(tok, 0.35), (seam * 0.55)[..., None])
    shadow = F.drop_shadow(sk, C.px(2), C.px(6), C.px(7), spread=C.px(1))
    leg = C.R(E['legend'], ss=3)
    lab = C.R(G['cap_label'], ss=3)
    d = F.dist_in(leg)
    lcol = lit[None, None] * (1 - np.clip(d / C.px(2.5), 0, 1)[..., None] * 0.45) + white[None, None] * (np.clip(d / C.px(2.5), 0, 1)[..., None] * 0.45)
    return F.stack([F.solid(shadow * 0.45, shade(tok, 0.55)), F.solid(sk, np.clip(col, 0, 1)),
                    F.solid(lab * 0.72, tok['ink']),
                    F.solid(F.blur(leg, C.px(5)) * 0.4, tok['lit']), F.solid(leg, np.clip(lcol, 0, 1))])


def render_cap_glow(C, G, tok):
    """键帽底下漏出来的背光：贴着裙边下沿，往外洇开一圈蓝"""
    E = G['cap']
    sk = C.R(E['skirt'])
    x0, y0, x1, y1 = E['box']
    halo = np.clip(F.blur(F.dilate(sk, C.px(2)), C.px(10)) * 1.4 - sk * 0.9, 0, 1)
    low = np.clip((C.YY - (y0 + (y1 - y0) * 0.45)) / ((y1 - y0) * 0.55), 0, 1) ** 1.2
    return F.solid(halo * low * 0.5, tok['lit'])


# ====================================================================== 输入框的下沿


def render_field(C, G, tok):
    """输入框的下沿：一根发丝线（线宽 = 本题最细笔画），两头各一块小方块（光标的同族小形）；
    光标底下那一段是它的蓝，往两头退成藏青、变淡"""
    fd = G['field']
    h = G['hair']
    y, x0, x1 = fd['y'], fd['x0'], fd['x1']
    line = C.R(rect(x0, y - h / 2, x1, y + h / 2), ss=3)
    caps = C.R(union(rect(x0 - 5, y - 4.5, x0 + 1, y + 4.5), rect(x1 - 1, y - 4.5, x1 + 5, y + 4.5)), ss=3)
    cx = G['cursor_c'][0]
    k = np.clip(np.abs(C.XX - cx) / 380.0, 0, 1)[..., None]
    col = F.rgb(tok['lit'])[None, None] * (1 - k) + mixh(tok['ink'], tok['world'], 0.25)[None, None] * k
    a = 0.9 - 0.3 * k[..., 0]
    m = np.maximum(line, caps)
    return F.stack([F.solid(F.blur(line, C.px(3)) * 0.25 * (1 - k[..., 0]), tok['lit']), F.solid(m * a, np.clip(col, 0, 1))])


# ====================================================================== 底线带


def render_band(C, G, tok):
    B = G['band']
    w = C.R(B['words'], ss=3)
    b = C.R(B['blocks'], ss=3)
    return F.stack([F.solid(w * 0.86, tok['ink']), F.solid(b * 0.9, tok['ink'])])


# ====================================================================== 小形态


def small_face(C, mask, tone, tok):
    """签名字（Agent 连同光标）的面：深色底、深色布上是屏上的光（点亮色、芯子发白、一圈余辉）；纸面、浅色布上收成深一档的墨"""
    if tone in ('ink', 'stamp-ink'):
        return F.solid(mask, mixh(tok['lit'], tok['ink'], 0.45))
    lit, white = F.rgb(tok['lit']), F.rgb(tok['light'])
    d = F.dist_in(mask)
    h = np.clip((d - C.px(0.8)) / C.px(2.5), 0, 1)[..., None]
    col = lit[None, None] * (1 - h * 0.4) + white[None, None] * (h * 0.4)
    return F.stack([F.glow_layer(F.blur(mask, C.px(3)) * 0.55, tok['lit']), F.solid(mask, np.clip(col, 0, 1))])

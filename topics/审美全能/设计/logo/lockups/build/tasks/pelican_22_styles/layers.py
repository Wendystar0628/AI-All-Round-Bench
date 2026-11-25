"""06 鹈鹕 · 颜色层：每层一个 render(C, G, tok) -> 预乘 RGBA。光是平的日光，从左上来；没有金属。

颜色角色（报告 2.4）：
  字面色    黑卡纸（tok ink 的暖黑），每条纸深浅差一点；朝光的剪口一线亮（纸的厚度接住了光）
  主题色    新闻纸（tok world）：撕下来的一块，撕口一圈纸白的纤维，栏线、铅字行、灰网点
  阴影      纸的暗调（暖褐），每一条纸一道锐边小落影，往右下
  高光      剪口的亮边、眼珠上的星（矢量）、笔尖湿墨的一点亮
  点缀      剪纸红（tok lit）：XXII 为主，「鹕」的喉囊为呼应；红网点从喉囊往周围的黑纸上、从 XXII 往新闻纸上洇开（干净的圆点，越远越小）；
            路径的锚点和手柄、几片红纸屑
纸条一条条贴（paste_stack）：每条先投影到已经贴好的纸上，再铺纸色、纤维、印的网点，最后剪口的亮边和背光一侧的暗边。
"""
import math
import numpy as np
import cv2
from lockupkit import fx as F
from lockupkit.geom import raster, union, poly, rect, circle, stroke_line

SHADOW = '#3B3027'


def tones(tok):
    ink = F.rgb(tok['ink'])
    red = F.rgb(tok['lit'])
    return {
        'ink': {'base': ink, 'rim': F.mix(ink, F.rgb(tok['light']), 0.5), 'edge': ink * 0.55, 'var': 0.16, 'fiber': 0.05},
        'pupil': {'base': ink * 0.75, 'rim': F.mix(ink, F.rgb(tok['light']), 0.3), 'edge': ink * 0.5, 'var': 0.0, 'fiber': 0.02},
        'red': {'base': red, 'rim': F.mix(red, F.rgb('#FFE2D2'), 0.45), 'edge': red * 0.7, 'var': 0.05, 'fiber': 0.04,
                'dots': red * 0.78},
        'red_dk': {'base': F.mix(red, F.rgb(tok['worldDeep']), 0.3), 'rim': F.mix(red, F.rgb('#FFE2D2'), 0.32), 'edge': red * 0.55,
                   'var': 0.04, 'fiber': 0.04, 'dots': red * 0.62},
        'white': {'base': F.rgb('#FBF7EE'), 'rim': F.rgb('#FFFFFF'), 'edge': F.rgb('#CFC6B4'), 'var': 0.01, 'fiber': 0.03},
        'slip': {'base': F.rgb('#F6F1E5'), 'rim': F.rgb('#FFFFFF'), 'edge': F.rgb('#C9BFAC'), 'var': 0.0, 'fiber': 0.035},
        'news': {'base': F.rgb(tok['world']), 'rim': F.rgb('#F4EFE4'), 'edge': F.rgb('#BDB3A0'), 'var': 0.0, 'fiber': 0.04},
    }


# ====================================================================== 一条条贴纸


class Win:
    """画板上的一个小窗：只在纸条附近光栅化、合成（快）"""

    def __init__(self, C, path, pad=10):
        b = path.bounds
        s = C.scale
        self.x0 = max(0, int(math.floor((b[0] - pad) * s)))
        self.y0 = max(0, int(math.floor((b[1] - pad) * s)))
        self.x1 = min(C.W, int(math.ceil((b[2] + pad) * s)))
        self.y1 = min(C.H, int(math.ceil((b[3] + pad) * s)))
        self.w, self.h = self.x1 - self.x0, self.y1 - self.y0
        self.s = s
        self.ok = self.w > 2 and self.h > 2

    def R(self, path, ss=3):
        return raster(path, self.w, self.h, (self.s, 0, 0, self.s, -self.x0, -self.y0), ss=ss)

    @property
    def sl(self):
        return (slice(self.y0, self.y1), slice(self.x0, self.x1))


def halftone(H, W, pitch, radius, angle=45.0, ox=0.0, oy=0.0):
    """网点：radius 是每个像素处想要的点半径（像素，H×W），返回 0–1 的干净圆点"""
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    t = math.radians(angle)
    u = (xx + ox) * math.cos(t) + (yy + oy) * math.sin(t)
    v = -(xx + ox) * math.sin(t) + (yy + oy) * math.cos(t)
    du = u - np.round(u / pitch) * pitch
    dv = v - np.round(v / pitch) * pitch
    d = np.sqrt(du * du + dv * dv)
    return np.clip(radius - d + 0.5, 0, 1)


def jitter(items, seed):
    """每条纸的深浅差按整件贴的顺序定（rng.uniform 同一串随机数），拆成几层分别贴时颜色不变"""
    rng = np.random.default_rng(seed)
    for it in items:
        it['jit'] = float(rng.random())


def paste_stack(C, items, tk, shadow=(1.5, 2.3), soft=0.55, sh_alpha=0.45, seed=1, rim_w=1.1, noise=None, track=None):
    """把纸条一条条贴上去。items: [{'path', 'kind', 'jit', 'small'?}]（jit 见 jitter；seed 定纤维的噪声）。返回 (预乘图层, 每种纸看得见的覆盖 {kind: H×W})"""
    L = C.empty()
    vis = {}
    if noise is None:
        noise = F.fbm(C.H, C.W, 7, seed + 40, octaves=4)
    shc = F.rgb(SHADOW)
    for it in items:
        sm = it.get('small')
        win = Win(C, it['path'], pad=8)
        if not win.ok:
            continue
        m = win.R(it['path'])
        if m.max() < 0.01:
            continue
        sl = win.sl
        Lw = L[sl]
        t = tk[it['kind']]
        # 落影：锐边、短，落在已经贴好的纸上和纸外
        k = 0.55 if sm else 1.0
        sh = F.blur(F.shift(m, shadow[0] * C.scale * k, shadow[1] * C.scale * k), soft * C.scale * k)
        sh = np.clip(sh - m, 0, 1) * sh_alpha
        Lw = F.over(Lw, F.solid(sh, shc))
        # 纸色：每条深浅差一点（jitter 按整件贴的顺序定好）；纤维
        base = t['base'] * (1 + (-t['var'] + 2 * t['var'] * it['jit']))
        n = noise[sl]
        col = np.broadcast_to(base, m.shape + (3,)).copy()
        col = col * (1 + (n[..., None] - 0.5) * t['fiber'] * 2)
        if 'dots' in t:                     # 红纸上印的网点（深一档的红）
            ht = halftone(win.h, win.w, 4.2 * C.scale, np.full(m.shape, 0.62 * C.scale, np.float32), 30.0, win.x0, win.y0)
            ht = ht * (0.55 + 0.9 * np.clip(n - 0.35, 0, 1))
            col = col * (1 - ht[..., None] * 0.55) + t['dots'] * ht[..., None] * 0.55
        # 剪口：朝光（左上）一线亮，背光（右下）一线暗
        rw = rim_w * C.scale * (0.7 if sm else 1.0)
        lit = F.rim_light(m, rw, angle=125, power=1.6)
        dk = F.rim_light(m, rw * 0.9, angle=-55, power=1.6)
        col = col * (1 - lit[..., None]) + t['rim'] * lit[..., None]
        col = col * (1 - dk[..., None] * 0.6) + t['edge'] * dk[..., None] * 0.6
        Lw = F.over(Lw, F.solid(m, np.clip(col, 0, 1)))
        L[sl] = Lw
        if track is not None:
            for kk in list(vis):
                vis[kk][sl] *= (1 - m)
            v = vis.setdefault(it['kind'], C.zeros())
            v[sl] = np.maximum(v[sl], m)
    return L, vis


# ====================================================================== 中文


def render_text(C, G, tok, part):
    """中文的一组纸条（一组一层，分别贴）：'slip' 白纸条和「二十二种」、某一个字、'jaw' 「鹕」的下颌（喉囊、褶、压在上面的下喙）"""
    tk = tones(tok)
    items = [it for it in [G['slip_item']] + G['chars'] if it['part'] == part]
    L, vis = paste_stack(C, items, tk, seed=6, track=True)
    # 点缀色洇开：红网点从喉囊往周围的黑纸上洇（印上去的，干净的圆点，越远越小），只印在黑纸上
    if '_pouch_ht' not in G:
        pc = G['pouch_c']
        r, _ = C.polar(pc)
        n = F.fbm(C.H, C.W, 46, 61, octaves=4)
        field = np.clip(1.1 - r / 118.0, 0, 1) ** 1.5 * (0.45 + 1.0 * n)
        field = np.clip(field - 0.18, 0, 1)
        rad = field * 1.05 * C.scale
        G['_pouch_ht'] = halftone(C.H, C.W, 4.4 * C.scale, rad, 30.0) * (field > 0.02)
    ink = vis.get('ink', C.zeros())
    dots = G['_pouch_ht'] * ink
    red = F.rgb(tok['lit'])
    L = F.over(L, F.solid(dots * 0.92, F.mix(red, F.rgb('#E0503C'), 0.25)))
    return L


# ====================================================================== XXII 和红纸屑


def render_xxii(C, G, tok, letter):
    """XXII 一个字母的红纸条（'X0' 'X1' 'I2' 'I3'，一个字母一层）"""
    items = [it for it in G['xxii_items'] if it['letter'] == letter]
    L, _ = paste_stack(C, items, tones(tok), shadow=(1.9, 2.9), seed=22)
    return L


def render_snips(C, G, tok):
    """剪 XXII 剩下的红纸屑"""
    L, _ = paste_stack(C, G['snip_items'], tones(tok), shadow=(1.9, 2.9), seed=22)
    return L


# ====================================================================== 底板：撕下来的一块新闻纸


def torn_poly(pts, rng, step=5.0, amp=5.5, jag=1.6):
    """把一圈折线撕开：每 step 一个点，沿法线按两层噪声推开（撕口的大起伏 + 纤维的小锯齿）"""
    out = []
    pts = [np.array(p, float) for p in pts]
    n = len(pts)
    phase = rng.uniform(0, 100)
    s_acc = 0.0
    for i in range(n):
        a, b = pts[i], pts[(i + 1) % n]
        L = float(np.linalg.norm(b - a))
        d = (b - a) / L
        nrm = np.array([d[1], -d[0]])
        k = max(1, int(L / step))
        for j in range(k):
            t = j / k
            s = s_acc + L * t
            off = amp * (0.6 * math.sin(s * 0.021 + phase) + 0.4 * math.sin(s * 0.057 + 2 * phase)) + rng.normal(0, jag)
            out.append(tuple(a + (b - a) * t + nrm * off))
        s_acc += L
    return poly(out)


PLATE = [(72, 178), (300, 166), (470, 180), (560, 176), (760, 168), (1010, 176), (1180, 186), (1300, 176), (1440, 196),
         (1428, 330), (1404, 448), (1180, 438), (900, 462), (600, 452), (360, 476), (120, 466), (60, 420), (82, 300)]


def render_plate(C, G, tok):
    tk = tones(tok)
    rng = np.random.default_rng(3)
    shape = torn_poly(PLATE, rng)
    m = C.R(shape, ss=2)
    XX, YY, px = C.XX, C.YY, C.px
    # 纸：新闻纸，略黄的纤维和一点不匀
    base = F.rgb(tok['world'])
    n1 = F.fbm(C.H, C.W, 90, 71, octaves=5)
    n2 = F.fbm(C.H, C.W, 5, 72, octaves=3)
    col = np.broadcast_to(base, (C.H, C.W, 3)).copy()
    col = col * (1 + (n1[..., None] - 0.5) * 0.05 + (n2[..., None] - 0.5) * 0.035)
    # 印的东西：整块印刷转 -1.2°（报纸剪得歪一点）
    t = math.radians(-1.2)
    U = (XX - 60) * math.cos(t) + (YY - 100) * math.sin(t)
    V = -(XX - 60) * math.sin(t) + (YY - 100) * math.cos(t)
    ink = F.rgb('#4E463D')
    pr = C.zeros()
    # 栏线：几根竖的细线
    for cx in (250, 520, 790, 1060, 1300):
        pr = np.maximum(pr, np.clip(0.75 - np.abs(U - cx) * C.scale / 1.4, 0, 1) * (V > 14) * (V < 372) * 0.5)
    # 报头下的一道粗线、细线
    pr = np.maximum(pr, ((np.abs(V - 30) < 1.6) * (U > 20) * (U < 1340)) * 0.55)
    pr = np.maximum(pr, ((np.abs(V - 35.5) < 0.5) * (U > 20) * (U < 1340)) * 0.45)
    # 铅字行：每栏一行行灰条（一个个“词”）
    lines = C.zeros()
    row_h = 9.0
    col_edges = [(20, 244), (256, 514), (526, 784), (796, 1054), (1066, 1294), (1306, 1360)]
    word = F.fbm(C.H, C.W, 18, 73, octaves=2, aniso=(3.0, 0.25))
    for (u0, u1) in col_edges:
        inside = (U > u0 + 4) & (U < u1 - 4) & (V > 46) & (V < 370)
        row = np.mod(V - 46, row_h)
        bar = (row > 3.0) & (row < 5.9)
        rid = np.floor((V - 46) / row_h)
        ragged = U < (u1 - 4 - (np.mod(rid * 37.0, 11.0) < 2) * 60)
        lines = np.maximum(lines, (inside & bar & ragged & (word > 0.22)).astype(np.float32))
    # 一块灰网点的“照片”和一个小标题块
    photo = (U > 800) & (U < 1050) & (V > 210) & (V < 360)
    ph_r = (0.35 + 0.75 * F.fbm(C.H, C.W, 40, 74, octaves=4)) * 1.15 * C.scale
    pht = halftone(C.H, C.W, 3.6 * C.scale, ph_r, 45.0) * photo
    lines = lines * (1 - photo)
    head = ((U > 30) & (U < 230) & (V > 52) & (V < 70) & (word > 0.12)).astype(np.float32)
    lines = np.maximum(lines * (1 - ((U > 30) & (U < 236) & (V > 46) & (V < 76))), head)
    # 字后面要安静：字周围的铅字行淡下去
    calm = np.clip(F.blur(C.R(G['text']), px(10)) * 1.8, 0, 1)
    col = col * (1 - (lines * (0.085 - 0.045 * calm))[..., None]) + ink * (lines * (0.085 - 0.045 * calm))[..., None]
    col = col * (1 - (pr * 0.26)[..., None]) + ink * (pr * 0.26)[..., None]
    col = col * (1 - (pht * 0.22)[..., None]) + ink * (pht * 0.22)[..., None]
    # 点缀色洇开：XXII 的红像套印一样往新闻纸上漫出一片红网点（XXII 左下、右上两团），越远越小
    xm = C.zeros()
    for p, tone, nm in G['xxii']:
        xm = np.maximum(xm, C.R(p, ss=1))
    src = F.blur(xm, px(26))
    nn = F.fbm(C.H, C.W, 60, 75, octaves=4)
    bias = np.exp(-(((XX - 560) / 190) ** 2 + ((YY - 410) / 70) ** 2)) + np.exp(-(((XX - 990) / 140) ** 2 + ((YY - 120) / 60) ** 2))
    f = np.clip(src * 2.3 * (0.35 + 1.0 * bias) * (0.5 + nn) - 0.15, 0, 1) * (1 - xm)
    rr = f * 1.6 * C.scale
    rh = halftone(C.H, C.W, 5.0 * C.scale, rr, 15.0)
    red = F.rgb(tok['lit'])
    col = col * (1 - (rh * 0.85)[..., None]) + red * (rh * 0.85)[..., None]
    # 撕口：一圈纸白的纤维（内缘不齐），外面几根毛
    di = F.dist_in(m)
    fib = F.fbm(C.H, C.W, 3, 76, octaves=3)
    rim_w = (1.4 + 2.6 * F.fbm(C.H, C.W, 30, 77, octaves=3)) * C.scale
    rim = np.clip((rim_w - di) / (0.8 * C.scale), 0, 1) * (m > 0.02) * (0.75 + 0.25 * fib)
    col = col * (1 - rim[..., None]) + F.rgb('#F7F3EA') * rim[..., None]
    hairs = F.streaks(C.H, C.W, 78, density=0.02, length=(2, 6), angle=0, width=1.0) * np.clip(1 - F.dist_out(m) / (2.5 * C.scale), 0, 1) * (m < 0.5)
    a = np.clip(m + hairs * 0.5, 0, 1)
    col = np.where(m[..., None] > 0.02, col, F.rgb('#F2EDE2'))
    # 这块纸贴在页面上：一道很浅的落影
    sh = F.blur(F.shift(m, px(1.6), px(2.4)), px(2.2)) * 0.22
    return F.over(F.solid(np.clip(sh - m, 0, 1), SHADOW), F.solid(a, np.clip(col, 0, 1)))


# ====================================================================== 墨线、锚点、手柄


def ink_line(pts, w0, w1, swell=1.7):
    """蘸水笔的墨线：起笔细、走着走着有一点按压的粗细，落到笔尖处满宽"""
    pts = np.asarray(pts, float)
    d = np.sqrt(((pts[1:] - pts[:-1]) ** 2).sum(1))
    s = np.concatenate([[0], np.cumsum(d)])
    u = s / s[-1]
    wv = w0 + (w1 - w0) * u
    wv = wv * (1 + (swell - 1) * np.sin(np.pi * np.clip(u * 3.0 % 1.0, 0, 1)) ** 2 * 0.6)
    left, right = [], []
    for i in range(len(pts)):
        a = pts[max(0, i - 1)]
        b = pts[min(len(pts) - 1, i + 1)]
        dd = b - a
        dd = dd / (np.linalg.norm(dd) + 1e-9)
        n = np.array([-dd[1], dd[0]])
        left.append(tuple(pts[i] + n * wv[i] / 2))
        right.append(tuple(pts[i] - n * wv[i] / 2))
    return poly(left + right[::-1])


def render_curve(C, G, tok):
    pts = G['curve']
    hair = G['hair']
    line = ink_line(pts, hair * 0.9, hair * 1.25)
    blot = circle(pts[0][0] - 1, pts[0][1], hair * 1.6)
    m = C.R(union(line, blot), ss=3)
    ink = F.rgb(tok['ink'])
    # 墨：边上浓一点（干了以后边上积墨），中间一丝亮
    di = F.dist_in(m)
    core = np.clip(1 - di / (hair * 0.6 * C.scale), 0, 1)
    col = np.broadcast_to(ink, m.shape + (3,)).copy() * (1 + 0.25 * (1 - core)[..., None] * 0)
    return F.solid(m * 0.96, col)


def render_ui(C, G, tok, group):
    """一组锚点（空心小方块；选中的那一个实心）和它的手柄（细线 + 圆点）：剪纸红。group：'start' 'mid' 'tip'（一组一层，笔尖经过时出现）"""
    U = G['ui']
    from .emblem import anchor_square, handle
    g = U['groups'][group]
    sq = U['sq']
    parts, anchors = [], []
    for a, b in g.get('handles', []):
        parts.append(handle(a, b, U['w'], U['r']))
    for a in g.get('anchors', []):
        parts.append(anchor_square(a, sq, U['w'] * 1.15))
        anchors.append(a)
    if g.get('selected'):
        s = g['selected']
        parts.append(rect(s[0] - sq / 2, s[1] - sq / 2, s[0] + sq / 2, s[1] + sq / 2))
    m = C.R(union(parts), ss=3)
    # 空心方块里面透一点纸色（盖住下面的墨线）
    holes = C.zeros()
    for a in anchors:
        holes = np.maximum(holes, C.R(rect(a[0] - sq / 2, a[1] - sq / 2, a[0] + sq / 2, a[1] + sq / 2), ss=2))
    red = F.rgb(tok['lit'])
    return F.stack([F.solid(holes * 0.95, tok['worldPale']), F.solid(m, red)])


# ====================================================================== 英文：沿路径的斜体


def render_en(C, G, tok):
    m = C.R(G['en'], ss=3)
    return F.solid(m * 0.92, tok['ink'])


# ====================================================================== 主体元素：笔尖


def render_nib(C, G, tok):
    """笔尖：白卡纸剪的笔身（背光的半边灰一档、受光一线亮），前半截蘸了墨（一片黑纸，波浪的墨线），
    孔、缝、肩口剪穿；压痕和刻印压进卡纸（上沿一线暗、下沿一线亮）"""
    E = G['nib']
    tk = tones(tok)
    ink = F.rgb(tok['ink'])
    body = C.R(E['outline'], ss=3)
    shade = C.R(E['shade'], ss=3) * body
    rim = C.R(E['rim'], ss=3) * body
    wet = C.R(E['ink'], ss=3) * body
    wet_hi = C.R(E['ink_hi'], ss=3) * wet
    holes = np.maximum(C.R(E['holes'], ss=4), C.R(E['notches'], ss=3))
    crease = C.R(E['crease'], ss=4)
    imp = C.R(E['imprint'], ss=4)
    a = np.clip(body - holes * (1 - wet * 0.85), 0, 1)
    # 落影：卡纸比字的纸厚一点
    sh = F.blur(F.shift(a, C.px(2.4), C.px(3.4)), C.px(0.8))
    sh = np.clip(sh - a, 0, 1) * 0.5
    card = F.rgb('#FBF7EE')
    n = F.fbm(C.H, C.W, 6, 91, octaves=4)
    col = np.broadcast_to(card, a.shape + (3,)).copy() * (1 + (n[..., None] - 0.5) * 0.05)
    col = col * (1 - shade[..., None]) + F.rgb('#D9D1C2') * shade[..., None]
    col = col * (1 - rim[..., None]) + F.rgb('#FFFFFF') * rim[..., None]
    # 压痕、刻印
    for mk, amt in ((crease, 0.9), (imp, 1.0)):
        dk = F.shift(mk, -C.px(0.3), -C.px(0.3))
        lt = F.shift(mk, C.px(0.4), C.px(0.4))
        col = col * (1 - (dk * 0.5 * amt)[..., None]) + F.rgb('#8F8576') * (dk * 0.5 * amt)[..., None]
        col = col * (1 - (lt * 0.6 * amt)[..., None]) + F.rgb('#FFFFFF') * (lt * 0.6 * amt)[..., None]
    # 墨：前半截一片黑纸（自己有一道很薄的落影在白卡上），湿的一线亮
    wsh = np.clip(F.blur(F.shift(wet, C.px(0.8), C.px(1.1)), C.px(0.4)) - wet, 0, 1) * body * 0.35
    col = col * (1 - wsh[..., None]) + F.rgb(SHADOW) * wsh[..., None]
    col = col * (1 - wet[..., None]) + ink * wet[..., None]
    col = col * (1 - wet_hi[..., None] * 0.5) + F.rgb('#CFC8BC') * wet_hi[..., None] * 0.5
    # 剪口：背光一侧一线暗
    dk = F.rim_light(a, C.px(0.9), angle=-55, power=1.6)
    col = col * (1 - dk[..., None] * 0.35) + F.rgb('#A89E8C') * dk[..., None] * 0.35
    return F.stack([F.solid(sh, SHADOW), F.solid(a, np.clip(col, 0, 1))])

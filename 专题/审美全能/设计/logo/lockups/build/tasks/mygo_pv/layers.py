"""01《壱雫空》PV · 颜色层：每层一个 render(C, G, tok) -> 预乘 RGBA。颜色全部从 tok（tokens.json 这一题的配色）派生。

颜色角色（报告 2.4）：
  字面色    深群青墨 tok.ink：全组一种料，上深下略透出天青；墨面带一点颜料的斑驳（像 1999 白字面上那层颗粒和色斑，换成墨）
  主题色    天青 tok.world：底板（湿边水彩、留白的云、太阳四周留白）；「下」那一滴的水；PV 的水彩字
  阴影色    深天青 tok.worldDeep 的淡影，落在背光的左下（光从右上的太阳来）
  高光      暖白 tok.light：日晕、水滴的受光边
  点缀色    太阳金 tok.lit：日核为主；水滴里倒映的太阳、受光点、水线末端那颗小水滴为呼应；
            离太阳近的笔画受光边和墨面上像金粉一样洒开，越远越稀（局部像纹理一样扩散）
  共用金属  浅金（日核的金压暗一档）：太阳的发丝环、环字、光芒
干净的规矩：金不和天青半透明叠在一起（会发绿发脏）——金只落在暖白的日晕里、墨上、或者自己是不透明的小点。
"""
import math
import numpy as np
import cv2
from lockupkit import fx as F
from lockupkit.geom import star4, rect
from .letters import RAIN_DEG


def pal(tok):
    rgb, mix = F.rgb, F.mix
    ink, world, deep, pale, lit, light = (rgb(tok[k]) for k in ('ink', 'world', 'worldDeep', 'worldPale', 'lit', 'light'))
    return {
        'ink': ink, 'ink_top': ink * 0.86, 'ink_bot': mix(ink, deep, 0.32), 'cobalt': mix(ink, deep, 0.55),
        'world': world, 'deep': deep, 'pale': pale, 'light': light, 'paper': mix(light, np.ones(3, np.float32), 0.55),
        'lit': lit, 'gold_deep': lit * np.array([0.9, 0.72, 0.5], np.float32), 'gold_pale': mix(lit, light, 0.55),
        'brass': lit * np.array([0.74, 0.6, 0.38], np.float32),
    }


def rim_toward(C, mask, width, center, power=1.4):
    """朝某一点（太阳）那一侧的边亮一圈"""
    d = F.dist_in(mask)
    band = np.clip(1 - d / width, 0, 1) * (mask > 0.02)
    sm = F.blur(mask, max(0.8, width * 0.6))
    gx, gy = F.grad(sm)
    nrm = np.sqrt(gx * gx + gy * gy) + 1e-6
    nx, ny = -gx / nrm, -gy / nrm
    lx, ly = (center[0] - C.XX), (center[1] - C.YY)
    ll = np.sqrt(lx * lx + ly * ly) + 1e-6
    return band * np.clip((nx * lx + ny * ly) / ll, 0, 1) ** power * mask


def char_t(C, chars):
    """每个字自己的竖向位置 t（0 顶 1 底）"""
    t = C.zeros()
    for c in chars:
        m = C.R(c['path'])
        tt = np.clip((C.YY - c['top']) / (c['bottom'] - c['top']), 0, 1)
        t = np.where(m > 0.01, tt, t)
    return t


def sun_dist(C, G):
    r, _ = C.polar(G['sun']['c'])
    return r


# ====================================================================== 底板：天青的湿边水彩


def ellipse_field(C, cx, cy, rx, ry):
    return np.clip(1.0 - (((C.XX - cx) / rx) ** 2 + ((C.YY - cy) / ry) ** 2), 0, 1)


def render_plate(C, G, tok):
    P = pal(tok)
    px = C.px
    r_sun = sun_dist(C, G)
    field = np.maximum.reduce([
        ellipse_field(C, 500, 300, 455, 132) * 1.0,
        ellipse_field(C, 880, 300, 200, 92) * 0.85,
        ellipse_field(C, 330, 360, 260, 80) * 0.9,
        np.clip(1.0 - (r_sun / 140) ** 2, 0, 1) * 0.95,
    ])
    n = F.fbm(C.H, C.W, 90, 201, octaves=6)
    n = F.warp(n, F.fbm(C.H, C.W, 130, 202), F.fbm(C.H, C.W, 130, 203), px(22))
    f = field + (n - 0.5) * 0.55 + (F.fbm(C.H, C.W, 20, 204, octaves=4) - 0.5) * 0.08
    wash = F.smoothstep(0.29, 0.345, f)
    pool = np.exp(-((f - 0.318) / 0.016) ** 2) * wash                    # 湿边：颜料积在边上一线
    # 太阳四周留白：一个化开的圆，边也是湿边
    sres = F.smoothstep(118, 64, r_sun + (n - 0.5) * 40)
    spool = np.exp(-((r_sun + (n - 0.5) * 40 - 112) / 4.5) ** 2) * (1 - sres)
    # 留白的云：横向拉长的几团，只在上半
    cn = F.fbm(C.H, C.W, 70, 207, octaves=5, aniso=(3.2, 1.0))
    cloud = F.smoothstep(0.64, 0.72, cn) * F.smoothstep(330, 200, C.YY) * (1 - sres)
    cpool = np.exp(-((cn - 0.645) / 0.012) ** 2) * F.smoothstep(330, 200, C.YY) * wash * (1 - cloud)
    a = wash * (1 - sres) * (1 - cloud * 0.92)
    a = a * F.smoothstep(0, 24, C.XX) * F.smoothstep(0, 24, C.w - C.XX) * F.smoothstep(0, 20, C.YY) * F.smoothstep(0, 20, C.h - C.YY)

    # 颜色：上浅下深的天青；颗粒（颜料沉进纸纹）；几处化开的浅（回水花）；边上积色
    tv = np.clip((C.YY - 120) / 340, 0, 1)[..., None]
    col = F.mix(F.mix(P['world'], P['pale'], 0.28), F.mix(P['world'], P['deep'], 0.22), tv)
    g = F.grain(C.H, C.W, 205, 0.7)
    gran = F.smoothstep(0.55, 0.9, g) * F.smoothstep(0.35, 0.7, F.fbm(C.H, C.W, 40, 206, octaves=4))
    col = F.mix(col, P['deep'], (gran * 0.12)[..., None])
    bloom = F.smoothstep(0.58, 0.8, F.fbm(C.H, C.W, 55, 208, octaves=5))
    col = F.mix(col, P['pale'], (bloom * 0.35)[..., None])
    col = F.mix(col, P['deep'], (np.clip(pool * 0.55 + cpool * 0.25 + spool * 0.35, 0, 1))[..., None])
    # 雨：细的斜线，太阳那一侧被照成暖白，别处比天亮一点
    rain = F.blur(F.streaks(C.H, C.W, 211, density=0.0065, length=(28, 120), angle=RAIN_DEG, width=1.0), 0.5)
    sunny = np.exp(-np.maximum(r_sun - 90, 0) / 160)
    col = F.mix(col, F.mix(P['pale'], P['light'], sunny[..., None]), (rain * (0.45 + 0.35 * sunny))[..., None])
    alpha = np.clip(a * 0.82, 0, 1)

    # 日晕：留白里一团暖白（不透明的纸白，金只在它里面）
    halo = np.clip(F.smoothstep(128, 30, r_sun) * 1.0, 0, 1)
    halo_col = F.mix(P['paper'], P['light'], np.clip(1 - r_sun / 80, 0, 1)[..., None])
    # 太阳附近的金粉：不透明的小点，越远越稀；只撒在留白和天青的边上
    zone = np.exp(-np.maximum(r_sun - 70, 0) / 70) * F.smoothstep(40, 70, r_sun)
    dust = F.sparkles(C.H, C.W, 213, zone, 130, size=(0.5, 1.7), flare=0.0)
    # 雨点落在画上：底板边上零星几滴水彩的小圆渍（干了以后边上一圈积色）
    spl = C.zeros()
    sring = C.zeros()
    rng = np.random.default_rng(215)
    edge_zone = np.clip(F.dilate(wash, px(26)) - wash, 0, 1) + pool * 0.6
    p_ = edge_zone.ravel().astype(np.float64)
    idx = rng.choice(p_.size, size=26, p=p_ / p_.sum())
    for i in idx:
        yy, xx = divmod(int(i), C.W)
        rr = rng.uniform(1.4, 5.5) * C.scale
        cv2.circle(spl, (xx * 16, yy * 16), int(rr * 16), 1.0, -1, cv2.LINE_AA, 4)
        cv2.circle(sring, (xx * 16, yy * 16), int(rr * 16), 1.0, max(1, int(C.scale * 0.8)), cv2.LINE_AA, 4)
    spl = spl * (1 - wash)
    sring = sring * (1 - wash)
    scol = F.mix(P['world'], P['pale'], 0.25)
    layers = [F.solid(alpha, col), F.solid(spl * 0.7, scol), F.solid(sring * 0.55, F.mix(P['world'], P['deep'], 0.4)),
              F.solid(halo * 0.95, halo_col), F.solid(np.clip(dust, 0, 1) * 0.9, P['lit'])]
    return F.stack(layers)


# ====================================================================== PV：天青的水彩斜体


def render_pv(C, G, tok):
    P = pal(tok)
    px = C.px
    m = C.R(G['pv'], ss=3)
    x0, y0, x1, y1 = G['pv_box']
    t = np.clip((C.YY - y0) / (y1 - y0), 0, 1)[..., None]
    col = F.mix(F.mix(P['deep'], P['world'], 0.15), F.mix(P['deep'], P['world'], 0.6), t)
    n = F.fbm(C.H, C.W, 26, 301, octaves=5)
    col = F.mix(col, P['world'], (F.smoothstep(0.55, 0.85, n) * 0.35)[..., None])           # 回水花
    d = F.dist_in(m)
    col = F.mix(col, P['ink'], (np.exp(-d / px(1.2)) * 0.45 * m)[..., None])                # 湿边积色
    g = F.grain(C.H, C.W, 302, 0.6)
    col = col * (1 + (g[..., None] - 0.5) * 0.08)
    rim = rim_toward(C, m, px(1.0), G['sun']['c']) * 0.8
    col = col + (P['light'] - col) * rim[..., None]
    key = F.outer_stroke(m, px(1.3))
    shadow = F.drop_shadow(m, -px(1.5), px(2.5), px(2.0)) * 0.28
    return F.stack([F.solid(shadow, P['deep']), F.solid(key * 0.9, P['paper']), F.solid(m * 0.94, np.clip(col, 0, 1))])


# ====================================================================== 太阳


def render_rays(C, G, tok):
    P = pal(tok)
    S = G['sun']
    r, _ = C.polar(S['c'])
    m = np.maximum(C.R(S['rays'], ss=3), C.R(S['ray_beads'], ss=4))
    t = np.clip((r - 55) / 37, 0, 1)[..., None]
    col = F.mix(P['brass'], F.mix(P['lit'], P['gold_pale'], 0.3), t)
    rim = rim_toward(C, m, C.px(0.6), (S['c'][0] + 400, S['c'][1] - 400)) * 0.7
    col = col + (P['light'] - col) * rim[..., None]
    return F.solid(m * np.clip(1.05 - t[..., 0] * 0.25, 0, 1), np.clip(col, 0, 1))


def render_sun(C, G, tok):
    P = pal(tok)
    px = C.px
    S = G['sun']
    r, _ = C.polar(S['c'])
    # 日晕的纸白托底（让环和日核干净地落在暖白上）
    under = F.smoothstep(56, 50, r)
    # 日核：暖金水彩——中心浅、边上积色、颗粒，受光的右上留一线白
    core = C.R(S['core'], ss=3)
    rc = np.clip(r / S['R_core'], 0, 1)
    ccol = F.mix(F.mix(P['lit'], P['light'], 0.6), P['lit'], (rc ** 1.4)[..., None])
    ccol = F.mix(ccol, P['gold_deep'], (np.exp(-((rc - 0.93) / 0.07) ** 2) * 0.75)[..., None])
    gn = F.fbm(C.H, C.W, 8, 401, octaves=4)
    ccol = F.mix(ccol, P['gold_deep'], (F.smoothstep(0.62, 0.9, gn) * 0.35 * core)[..., None])
    ccol = ccol * (1 + (F.grain(C.H, C.W, 402, 0.5)[..., None] - 0.5) * 0.10)
    hl = rim_toward(C, core, px(1.6), (S['c'][0] + 300, S['c'][1] - 300), power=2.0)
    ccol = ccol + (P['light'] - ccol) * (hl * 0.9)[..., None]
    lines = np.maximum.reduce([C.R(S['ring1'], ss=3), C.R(S['ring2'], ss=3), C.R(S['ring3'], ss=3),
                               C.R(S['beads'], ss=3), C.R(G['ring'], ss=3)])
    lcol = F.mix(P['brass'], P['lit'], 0.25)
    glow = F.blur(core, px(6)) * 0.55
    return F.stack([F.solid(under * 0.96, P['paper']), F.glow_layer(glow * 0.6, P['gold_pale']),
                    F.solid(lines * 0.95, lcol), F.solid(core, np.clip(ccol, 0, 1))])


def render_rain(C, G, tok):
    """太阳下半圈落下的雨（深天青，一道道发丝，下端小水滴，水滴受光的右上一点白）；两道从日面前划过的雨丝被照成金白；
    PV 上那一道截断的雨丝"""
    P = pal(tok)
    px = C.px
    S = G['sun']
    r, _ = C.polar(S['c'])
    fringe = np.maximum(C.R(S['rain'], ss=4), C.R(S['heads'], ss=4))
    fcol = F.mix(P['deep'], P['ink'], 0.25)
    hl = rim_toward(C, C.R(S['heads'], ss=4), px(0.7), (S['c'][0] + 300, S['c'][1] - 300), power=2.0)
    st = C.R(S['streaks'], ss=4)
    lit = F.smoothstep(70, 40, r)
    scol = F.mix(F.mix(P['deep'], P['world'], 0.3), F.mix(P['paper'], P['lit'], 0.25), lit[..., None])
    sl = C.R(G['pv_slash'], ss=4)
    return F.stack([F.solid(fringe * 0.92, fcol), F.solid(hl * 0.9, P['paper']),
                    F.solid(st * (0.35 + 0.6 * lit), np.clip(scol, 0, 1)),
                    F.solid(sl * 0.9, F.mix(P['deep'], P['world'], 0.2))])


# ====================================================================== 中文


def render_text(C, G, tok):
    return F.stack(ink_layers(C, G, tok, C.R(G['text_body'], ss=3)))


def ink_layers(C, G, tok, A):
    """墨字的几层（光晕、影、纸白描边、字面），A 是要画的形状：字层是挖掉那一滴的全部字，签名层是那一滴的墨边"""
    P = pal(tok)
    px = C.px
    t = char_t(C, G['chars'])
    r_sun = sun_dist(C, G)
    # 墨：每个字上深下略透出天青
    col = F.mix(P['ink_top'], P['ink_bot'], (t ** 1.3)[..., None])
    # 墨面的斑驳：几处颜料薄一点（偏钴蓝），像颜料干在纸上；很轻，保持是“墨”
    n = F.fbm(C.H, C.W, 34, 501, octaves=5)
    n = F.warp(n, F.fbm(C.H, C.W, 50, 502), F.fbm(C.H, C.W, 50, 503), px(6))
    mott = F.smoothstep(0.58, 0.8, n)
    col = F.mix(col, P['cobalt'], (mott * 0.45)[..., None])
    col = F.mix(col, P['ink_top'], (np.exp(-((n - 0.585) / 0.012) ** 2) * 0.5)[..., None])  # 斑块边一线积色
    col = col * (1 + (F.grain(C.H, C.W, 504, 0.6)[..., None] - 0.5) * 0.06)
    # 雨把墨打湿：每个字的下半截，天青像水彩一样从字脚往上洇，前沿一道水渍线（同一个色相，干净）；
    # 「下」的针一直洇到尖，成了一根水色的雨丝
    wsrc = np.clip((t - 0.5) / 0.5, 0, 1) ** 1.3
    wn = F.fbm(C.H, C.W, 30, 511, octaves=5)
    wn = F.warp(wn, F.fbm(C.H, C.W, 46, 512), F.fbm(C.H, C.W, 46, 513), px(7))
    wf = wsrc * 0.95 + (wn - 0.5) * 0.42
    wet = F.smoothstep(0.30, 0.40, wf)
    tide = np.exp(-((wf - 0.32) / 0.02) ** 2) * wet
    wet_col = F.mix(P['ink'], P['deep'], 0.42 + 0.25 * np.clip((t - 0.8) / 0.4, 0, 1)[..., None])
    col = F.mix(col, wet_col, (wet * 0.85)[..., None])
    col = F.mix(col, P['ink_top'], (tide * 0.6)[..., None])
    # 太阳一侧：受光的边一线暖白，离太阳越近越金、越亮
    near = np.exp(-np.maximum(r_sun - 60, 0) / 190)
    rim = rim_toward(C, A, px(1.1), G['sun']['c'], power=1.3) * (0.35 + 0.65 * near)
    rim_col = F.mix(P['light'], P['lit'], (near ** 1.5)[..., None])
    col = col + (rim_col - col) * (rim * 0.85)[..., None]
    # 金：向阳那一侧的边上一线金——离太阳近处是连着的一道细金边，往远处断成一粒粒金箔，再远只剩零星金粉，
    # 像太阳的光在字边上扩散开（金是实的，不和墨半透明地混，干净）
    face_sun = rim_toward(C, A, px(1.7), G['sun']['c'], power=1.0)
    attract = np.exp(-np.maximum(r_sun - 60, 0) / 150)
    g = F.grain(C.H, C.W, 507, 0.7)
    flake = F.smoothstep(0.5, 0.58, g * 0.55 + attract * 0.75) * F.smoothstep(0.18, 0.45, face_sun)
    flake = flake * F.smoothstep(0.08, 0.2, attract)
    gt = F.fbm(C.H, C.W, 12, 509, octaves=3)[..., None]
    gold = F.mix(F.mix(P['lit'], P['gold_deep'], 0.35), F.mix(P['lit'], P['gold_pale'], 0.5), gt)
    col = F.mix(col, gold, flake[..., None])
    dust = F.sparkles(C.H, C.W, 505, F.erode(A, px(0.8)) * near ** 2.0, 70, size=(0.45, 1.2), flare=0.0)
    col = F.mix(col, F.mix(P['lit'], P['gold_pale'], 0.3), np.clip(dust, 0, 1)[..., None])
    fill = F.solid(A, np.clip(col, 0, 1))
    key = F.outer_stroke(A, px(1.5))
    shadow = F.drop_shadow(A, -px(2.2), px(3.2), px(2.4), spread=px(0.3))
    halo = F.outer_glow(A, px(9), spread=px(1.5), gain=1.0)
    return [F.solid(halo * 0.45, P['paper']), F.solid(shadow * 0.34, P['deep']), F.solid(key * 0.95, P['paper']), fill]


# ====================================================================== 高潮：那一滴水


def render_water(C, G, tok):
    """整滴：墨边（水的厚度，和字同一种墨）+ 透明的水。墨边的光晕、影、描边不压到旁边的字上（和字连成一体时那样）"""
    body = C.R(G['text_body'], ss=3)
    ink = ink_layers(C, G, tok, C.R(G['drop']['rim'], ss=3))
    ink = [ly * (1 - body[..., None]) for ly in ink[:3]] + ink[3:]
    return F.stack(ink + [water_face(C, G, tok)])


def water_face(C, G, tok):
    """透明的水：里面倒映一小片天（倒过来：亮的天在下、深的在上）和太阳；向阳的右上一道亮白，左下一线聚光；
    边上一线极细的虹（色散），只在亮处"""
    P = pal(tok)
    px = C.px
    D = G['drop']
    W = C.R(D['water'], ss=4)
    cx, cy = D['c']
    R = D['r']
    XX, YY = C.XX, C.YY
    # 倒映的天：沿竖直方向，上深下亮
    v = np.clip((YY - (cy - R * 1.6)) / (R * 2.5), 0, 1)[..., None]
    col = F.mix(F.mix(P['deep'], P['ink'], 0.25), F.mix(P['pale'], P['light'], 0.5), v ** 0.9)
    # 一道倒过来的地平线（深天青的发丝弧）和一小团留白的云
    hz = np.exp(-((YY - (cy + 0.05 * R) - 0.12 * (XX - cx) ** 2 / R) / px(0.35)) ** 2)
    col = F.mix(col, P['deep'], (hz * 0.55)[..., None])
    cl = np.exp(-(((XX - (cx + 0.28 * R)) / (0.32 * R)) ** 2 + ((YY - (cy + 0.42 * R)) / (0.12 * R)) ** 2))
    col = F.mix(col, P['paper'], (F.smoothstep(0.35, 0.6, cl) * 0.8)[..., None])
    # 倒映的太阳：左下（和真的太阳在右上相反），金核加一圈发丝
    sx, sy = cx - 0.36 * R, cy + 0.36 * R
    ds = np.sqrt((XX - sx) ** 2 + (YY - sy) ** 2)
    sun = F.smoothstep(0.19 * R, 0.13 * R, ds)
    sring = np.exp(-((ds - 0.3 * R) / px(0.3)) ** 2)
    col = F.mix(col, F.mix(P['lit'], P['light'], 0.2), (sun * 0.95)[..., None])
    col = F.mix(col, P['lit'], (sring * 0.6)[..., None])
    # 向阳的右上：一道月牙形的亮白
    d1 = np.sqrt((XX - (cx + 0.18 * R)) ** 2 + (YY - (cy - 0.22 * R)) ** 2)
    d2 = np.sqrt((XX - (cx + 0.05 * R)) ** 2 + (YY - (cy - 0.05 * R)) ** 2)
    cres = F.smoothstep(0.72 * R, 0.62 * R, d1) * F.smoothstep(0.62 * R, 0.72 * R, d2) * F.smoothstep(cy + 0.1 * R, cy - 0.4 * R, YY)
    col = F.mix(col, P['paper'], (cres * 0.9)[..., None])
    # 左下一线聚光（光穿过水滴在对侧聚起来）
    d3 = np.sqrt((XX - (cx - 0.1 * R)) ** 2 + (YY - (cy + 0.1 * R)) ** 2)
    caus = np.exp(-((d3 - 0.66 * R) / px(0.7)) ** 2) * np.clip(((cx - XX) + (YY - cy)) / R, 0, 1)
    col = F.mix(col, F.mix(P['light'], P['lit'], 0.3), (caus * 0.8)[..., None])
    # 色散：聚光外面一线极细的虹
    hue = np.clip((d3 - 0.62 * R) / (0.16 * R), 0, 1)
    spec = F.ramp(hue, [(0, '#E58A7A'), (0.25, '#EFC57A'), (0.5, '#A9D49A'), (0.75, '#86B9E6'), (1, '#A897DA')])
    band = np.exp(-((d3 - 0.70 * R) / (0.07 * R)) ** 2) * np.clip(((cx - XX) + (YY - cy)) / R, 0, 1)
    col = F.mix(col, spec, (band * 0.55)[..., None])
    return F.solid(W, np.clip(col, 0, 1))


# ====================================================================== 英文和水线


def render_en(C, G, tok):
    P = pal(tok)
    px = C.px
    B = G['band']
    H = G['hair']
    y = B['y']
    XX = C.XX
    line = C.R(rect(B['x0'], y - H / 2, B['x1'], y + H / 2), ss=3)
    fade = F.smoothstep(B['x0'], B['x0'] + 140, XX)
    caps = C.R(B['caps'], ss=3)
    ed = C.R(B['end_drop'], ss=4)
    ed_hl = rim_toward(C, ed, px(0.8), (B['x1'] + 300, y - 300))
    ed_col = F.mix(P['gold_deep'], P['lit'], 0.4) + (P['light'] - F.mix(P['gold_deep'], P['lit'], 0.4)) * ed_hl[..., None]
    key = F.outer_stroke(caps, px(1.0))
    # 涟漪那一段水线让出来（涟漪层盖在上面，入场时从这里扩开）
    rip = ripple_mask(C, G)
    return F.stack([F.solid(line * fade * 0.8 * (1 - rip), P['ink']),
                    F.solid(key * 0.85, P['paper']), F.solid(caps * 0.92, P['ink']), F.solid(ed, np.clip(ed_col, 0, 1))])


def ripple_mask(C, G):
    return np.maximum.reduce([C.R(q, ss=4) for q in G['band']['ripples']])


def render_ripple(C, G, tok):
    """那一滴正下方水面上的三圈涟漪：靠太阳的右半边亮成暖白（和代表画面一样）"""
    P = pal(tok)
    rip = ripple_mask(C, G)
    rc = G['band']['rip_c']
    sunny = np.clip((C.XX - rc[0]) / 30, 0, 1)
    rip_col = F.mix(P['deep'], P['ink'], 0.3) * (1 - sunny[..., None]) + P['paper'] * sunny[..., None]
    return F.solid(rip * 0.85, np.clip(rip_col, 0, 1))


# ====================================================================== 高光


def render_fx(C, G, tok):
    """那一滴受光处的星芒（全件唯一）、太阳长芒尖上几粒闪光"""
    P = pal(tok)
    XX, YY = C.XX, C.YY
    D = G['drop']
    cx, cy = D['c']
    R = D['r']
    sx, sy = cx + 0.42 * R, cy - 0.5 * R
    out = []
    st = C.R(star4(sx, sy, 15, 0.1, ry=24))
    st2 = C.R(star4(sx, sy, 5.5, 0.22, rot=45))
    d2 = (XX - sx) ** 2 + (YY - sy) ** 2
    out.append(F.solid(F.blur(st, C.px(1.6)) * 0.55, P['lit']))
    out.append(F.solid(np.clip(st * 0.95 + st2 * 0.7, 0, 1), P['paper']))
    out.append(F.solid(np.clip(np.exp(-d2 / 6.0) * 1.0, 0, 1), np.ones(3, np.float32)))
    S = G['sun']
    c = S['c']
    for ang, rr, s in ((-90, 92, 4.5), (0, 92, 3.6), (180, 92, 3.2), (-45, 80, 2.6)):
        x, y = c[0] + rr * math.cos(math.radians(ang)), c[1] + rr * math.sin(math.radians(ang))
        g = C.R(star4(x, y, s, 0.18))
        out.append(F.solid(F.blur(g, C.px(0.8)) * 0.6, P['lit']))
        out.append(F.solid(g, P['paper']))
    return F.stack(out)


# ====================================================================== 小形态


def small_face(C, mask, tone, tok):
    """签名字「雫」的小形态：水，向阳的右上一线暖白（水的受光边）。暗底（迷你、深布）是天青的浅水；
    墨的那几档（纸、浅布：这一卷的布就是天青）是一块深水——上沿是字的墨青、往下透出深天青，比布深得多，一眼读得出"""
    P = pal(tok)
    ink = tone in ('ink', 'stamp-ink')
    top, bot = (P['ink'], P['deep']) if ink else (F.mix(P['world'], P['pale'], 0.55), P['world'])
    rows = np.where(mask.max(axis=1) > 0.05)[0]
    y0, y1 = (rows[0], rows[-1]) if len(rows) else (0, C.H - 1)
    t = np.clip((np.arange(C.H, dtype=np.float32)[:, None] - y0) / max(1, y1 - y0), 0, 1)
    col = np.broadcast_to(top * (1 - t[..., None]) + bot * t[..., None], (C.H, C.W, 3)).copy()
    rim = F.rim_light(mask, C.px(0.8), angle=45, power=1.5)
    col = col + (P['light'] - col) * (rim * 0.8)[..., None]
    return F.solid(mask, np.clip(col, 0, 1))

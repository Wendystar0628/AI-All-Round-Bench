"""03 · 本题的画法（预乘 RGBA，全在画板的 2 倍图上）。一盏光：夕光从左上来（LIGHT_ANGLE = 135°，屏幕坐标）。

  paper_tex(C, seed)                   图鉴纸的纤维和颗粒（0–1）
  wash(C, shape, color, …)             一团水彩：边上积色、颜料沉进纸纹的颗粒、湿边的花边；shape 是 0–1 的“想铺到哪”
  dapple(C, seed, src, …)              光斑：低频的干净色块（夕光透过玻璃落在字上），边缘有一道细的积色
  plaster(C, mask, …)                  石膏：哑光白，受光面暖、背光面冷灰，细的斜面、环境光遮蔽、极细的颗粒
  glass(C, mask, …)                    玻璃：灰绿透明，左上进来的琥珀光、两道斜反光
  brass(C, mask, …)                    黄铜：按高度的暗–亮–暗色带、受光边、细拉丝
  contour(C, mask, w)                  一圈贴外的墨线（铜版画的刻线）
  soft_shadow(C, mask, dx, dy, blur)   落在纸上的柔影
"""
import numpy as np
from lockupkit import fx as F

LIGHT_ANGLE = 135          # 光从左上来（fx 的约定：从右边逆时针，135 = 左上）


def paper_tex(C, seed=3):
    fib = F.fbm(C.H, C.W, 9, seed, octaves=3, aniso=(6.0, 0.6))
    g = F.grain(C.H, C.W, seed + 1, 0.7)
    return np.clip(fib * 0.6 + g * 0.4, 0, 1)


def wash(C, shape, color, seed, edge_col=None, opacity=0.85, cell=70, warp_px=26, thresh=0.42, soft=0.05,
         edge=0.55, granule=0.35, inner=0.18, tex=None):
    """一团水彩。shape 0–1；颜色在中间淡、边上积色（湿边干了以后的那一圈），颗粒沉在纸纹里。返回 (预乘层, 覆盖率)"""
    n = F.fbm(C.H, C.W, cell, seed, octaves=6)
    n = F.warp(n, F.fbm(C.H, C.W, cell * 1.6, seed + 1), F.fbm(C.H, C.W, cell * 1.6, seed + 2), C.px(warp_px))
    field = shape * 0.9 + (n - 0.5) * 0.5
    a = F.smoothstep(thresh - soft, thresh + soft, field)
    # 湿边：形内靠边的一圈颜色更重
    d = F.dist_in((a > 0.5).astype(np.float32))
    rim = np.exp(-d / C.px(2.2)) * a
    # 中间被水冲淡、留出不匀的浓淡
    body = 1 - inner + inner * F.fbm(C.H, C.W, cell * 0.6, seed + 4, octaves=4)
    t = paper_tex(C, seed + 7) if tex is None else tex
    gran = 1 - granule + granule * (t * 1.4 - 0.2)
    dens = np.clip(a * body * gran + rim * edge, 0, 1.3)
    base = F.rgb(color)
    ec = F.rgb(edge_col) if edge_col else base * 0.78
    col = base[None, None] * (1 - np.clip(rim * edge, 0, 1)[..., None]) + ec[None, None] * np.clip(rim * edge, 0, 1)[..., None]
    alpha = np.clip(dens, 0, 1) * opacity
    return F.solid(alpha, col), a


def dapple(C, seed, src, cell=46, thresh=0.56, soft=0.06, warp_px=10):
    """光斑：低频、边缘干净的几块；src 是 0–1 的“光从哪来”。返回 (斑, 斑的边)"""
    n = F.fbm(C.H, C.W, cell, seed, octaves=4)
    n = F.warp(n, F.fbm(C.H, C.W, cell * 1.4, seed + 1), F.fbm(C.H, C.W, cell * 1.4, seed + 2), C.px(warp_px))
    f = n * 0.7 + src * 0.6 - 0.25
    s = F.smoothstep(thresh - soft, thresh + soft, f)
    e = np.clip(np.abs(s - F.blur(s, C.px(1.0))) * 5, 0, 1)
    return s, e


def plaster(C, mask, base='#F7F2E9', warm='#F6D7A6', cool='#A9B0AA', bevel_px=2.6, ao=0.5, seed=41, key=1.0):
    """石膏：哑光的白。受光的斜面暖（夕光），背光的斜面冷灰，往里一点点环境光遮蔽，极细的颗粒。返回 (颜色 H×W×3)"""
    col = np.zeros((C.H, C.W, 3), np.float32) + F.rgb(base)
    # 浇出来的石膏：边是一道窄而利的倒角（不是枕头那样鼓起来），受光的倒角暖、背光的倒角冷
    hi, sh = F.bevel(mask, C.px(bevel_px), chisel=True, angle=LIGHT_ANGLE, altitude=42)
    col = F.mix(col, F.rgb(warm)[None, None], np.clip(hi * 1.1 * key, 0, 1)[..., None])
    col = F.mix(col, F.rgb(cool)[None, None], np.clip(sh * 1.05, 0, 1)[..., None])
    # 环境光遮蔽：离边近、在右下的那一侧暗一点
    d = F.dist_in(mask)
    occ = np.exp(-d / C.px(5.0)) * ao
    col = col * (1 - occ[..., None] * 0.18)
    g = F.grain(C.H, C.W, seed, 0.5)
    col = col * (1 + (g[..., None] - 0.5) * 0.04)
    return np.clip(col, 0, 1)


def glass(C, mask, tint='#9DB8AC', amber='#E9B467', seed=5, light_from=(0, 0), reach=300):
    """一格玻璃：灰绿；从左上（light_from）进来的夕光把靠光的一侧染成琥珀；两道 45° 的细反光。返回 (颜色, 不透明度)"""
    lx, ly = light_from
    r = np.sqrt((C.XX - lx) ** 2 + (C.YY - ly) ** 2)
    warm = np.clip(1 - r / reach, 0, 1) ** 1.2
    col = F.mix(np.zeros((C.H, C.W, 3), np.float32) + F.rgb(tint), F.rgb(amber)[None, None], (warm * 0.75)[..., None])
    u = (C.XX + C.YY) / 1.0
    streak = np.exp(-((np.mod(u + seed * 7, 46) - 23) / 1.4) ** 2) * 0.55 + np.exp(-((np.mod(u + seed * 7 + 9, 46) - 23) / 0.7) ** 2) * 0.35
    col = col + (1 - col) * (streak * mask)[..., None] * 0.8
    alpha = mask * (0.72 + 0.2 * warm)
    return np.clip(col, 0, 1), alpha


def brass(C, mask, y0, y1, dark='#6E4A22', mid='#B4843F', light='#EECB86', spec='#FFF3D6', bevel_px=1.3):
    """黄铜：按高度的色带（上亮、腰暗、下又亮一点——反射的天和地），受光边一线高光。返回颜色"""
    t = np.clip((C.YY - y0) / max(1.0, (y1 - y0)), 0, 1)
    col = F.ramp(t, [(0.0, light), (0.28, mid), (0.55, dark), (0.78, mid), (1.0, light)])
    hi, sh = F.bevel(mask, C.px(bevel_px), chisel=True, angle=LIGHT_ANGLE, altitude=34)
    col = col + (F.rgb(spec) - col) * (hi * 0.85)[..., None]
    col = col * (1 - sh[..., None] * 0.35)
    col = col + (F.rgb(spec) - col) * F.rim_light(mask, C.px(0.8), angle=LIGHT_ANGLE, power=2.0)[..., None] * 0.7
    return np.clip(col, 0, 1)


def contour(C, mask, w=0.9):
    """贴着形外的一圈细墨线"""
    return F.outer_stroke(mask, C.px(w))


def soft_shadow(C, mask, dx, dy, blur, spread=0.0):
    return F.drop_shadow(mask, C.px(dx), C.px(dy), C.px(blur), spread=C.px(spread) if spread else 0)

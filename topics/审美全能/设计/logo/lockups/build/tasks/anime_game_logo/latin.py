"""10 二次元游戏Logo · 主字 Logo（舞台坐标）。底字 Abril Fatface（Didone 胖脸体，反差推到最极端）。

  L    放大一档的首字：顶上的衬线左端顺着笔势甩出一道尖头笔花饰——往左发丝、在左边压笔变粗、兜到全件下面、
       再从右边挑起收住（花饰在 swash() 里画，由 geometry 接到 L 上）
  o g o  g 是装反的那一枚铅字：左右翻过来、略压歪（高潮），上字腔里是全件唯一的星芒

和中文同一支笔（方言「烫印宋」在拉丁字母上的样子）：
  L 的顶衬线右端、底脚右端的勾，都换成和中文横末一样的内凹的刺（宋体的衬线长进了 Didone）；
  g 的耳朵（Didone 的球形收笔）换成和中文的点一样的两头尖的楔形泪滴——全件没有一个圆头。
"""
import math
import os
import numpy as np
from lockupkit.geom import glyph, union, diff, rotate_about, rect, poly
from lockupkit import paths
from . import draw as D

FATFACE = os.path.join(paths.FONTS, 'AbrilFatface-Regular.ttf')


def _bend(a, b, inward, k, n=14):
    a, b = np.asarray(a, float), np.asarray(b, float)
    c = (a + b) / 2 + np.asarray(inward, float) * k * np.linalg.norm(b - a)
    t = np.linspace(0, 1, n)[:, None]
    return (1 - t) ** 2 * a + 2 * (1 - t) * t * c + t ** 2 * b


def thorn(base_l, base_r, apex, concave=0.16):
    """两边内凹的刺（和中文的刺形衬线同一个画法）：底边 base_l → base_r，尖在 apex"""
    L, R, A = (np.asarray(v, float) for v in (base_l, base_r, apex))
    cen = (L + R + A) / 3
    il = cen - (L + A) / 2
    ir = cen - (A + R) / 2
    left = _bend(L, A, il / np.linalg.norm(il), concave)
    right = _bend(A, R, ir / np.linalg.norm(ir), concave)
    return poly([tuple(q) for q in np.concatenate([left, right[1:]])])


def wedge_drop(a, e, W, lean=0.62):
    """两头尖的楔形泪滴：a → e，最宽处靠后，一边鼓、一边直（和中文的楔形点同一个画法）"""
    a, e = np.asarray(a, float), np.asarray(e, float)
    d = e - a
    L = np.linalg.norm(d)
    d = d / L
    n = np.array([-d[1], d[0]])
    t = np.linspace(0, 1, 28)
    prof = np.sin(np.pi * t ** 1.45) ** 0.85
    left = [a + d * (L * ti) + n * (W / 2 * pi) for ti, pi in zip(t, prof)]
    right = [a + d * (L * ti) - n * (W / 2 * pi * lean) for ti, pi in zip(t, prof)]
    return poly([tuple(q) for q in left + right[::-1]])


def glyph_dialect(ch):
    """按方言改过的字母轮廓（字体单位，y 朝上）"""
    g, w = glyph(FATFACE, ch)
    if ch == 'L':
        # 底脚右端：Didone 的弧托竖勾 → 内凹的刺（从脚面升起，尖略往前探）
        g = diff(g, rect(330, 21, 600, 260))
        g = union(g, thorn((318, 21.5), (571, 21.5), (588, 262), 0.2))
        # 顶衬线右端：长出一根和中文横末一样的刺
        g = union(g, thorn((262, 699.5), (383, 699.5), (392, 792), 0.18))
    if ch == 'g':
        # 耳朵：球 → 楔形泪滴（从颈部长出来，往右上收成尖）
        g = diff(g, rect(352, 470, 540, 640))
        g = union(g, wedge_drop((372, 470), (548, 642), 104, lean=0.5))
    return g, w


def letter(ch, size, x0, base, mirror=False):
    """一个字母：字体单位 → 舞台。mirror=True 时在自己的步进框里左右翻过来。返回 (Path, 步进)"""
    g, w = glyph_dialect(ch)
    k = size / 1000.0
    if mirror:
        return g.transform(-k, 0, 0, -k, x0 + w * k, base), w * k
    return g.transform(k, 0, 0, -k, x0, base), w * k


def to_stage(u, size, x0, base, adv=None, mirror=False):
    k = size / 1000.0
    x = x0 + ((adv - u[0]) if mirror else u[0]) * k
    return (x, base - u[1] * k)


def logo(S, SL, x0, base, gap=(-4, -2, -2), tilt=6.0):
    """排 Logo：返回 dict（各字母轮廓、整词轮廓、L 顶衬线左端、g 的字腔中心和整体中心……）"""
    out = {}
    L, wL = letter('L', SL, x0, base)
    x = x0 + wL + gap[0]
    o1, wo = letter('o', S, x, base)
    xo1 = x
    x += wo + gap[1]
    gx = x
    g, wg = letter('g', S, x, base, mirror=True)
    x += wg + gap[2]
    o2, _ = letter('o', S, x, base)
    xo2 = x
    # g：翻过来以后再略压歪——绕自己的中心转 tilt 度（像一枚没排正的铅字）
    gb = g.bounds
    gc = ((gb[0] + gb[2]) / 2, (gb[1] + gb[3]) / 2)
    g = rotate_about(g, tilt, *gc)
    k = S / 1000.0

    def gpt(u):
        p = to_stage(u, S, gx, base, adv=wg / k, mirror=True)
        a = math.radians(tilt)
        dx, dy = p[0] - gc[0], p[1] - gc[1]
        return (gc[0] + dx * math.cos(a) - dy * math.sin(a), gc[1] + dx * math.sin(a) + dy * math.cos(a))
    kL = SL / 1000.0
    out.update({
        'L': L, 'o1': o1, 'g': g, 'o2': o2,
        'word': union(L, o1, g, o2),
        'L_top_left': (x0 + 21 * kL, base - 689 * kL),      # 顶衬线左端（衬线厚度的中线）
        'L_serif_h': 22 * kL,
        'L_box': L.bounds, 'g_center': gc, 'g_counter': gpt((245, 320)), 'g_ear': gpt((450, 546)),
        'g_box': g.bounds, 'o1_box': o1.bounds, 'o2_box': o2.bounds,
        'xh': 476 * k, 'cap_L': 700 * kL, 'desc': 250 * k, 'right': xo2 + wo,
    })
    return out


def swash(P, thin, thick, tail=None):
    """L 的花饰：中线 P（舞台坐标），尖头笔——往下走压笔变粗、横走和往上是发丝；起笔从 L 的衬线厚度接出来，收笔一根针尖。"""
    w = D.pen_widths(P, thin, thick, stress=-18, power=1.3, taper1=60)
    s = D.arclen(P)
    # 起笔：从衬线的厚度（thin 的两倍）在 40 内收到发丝，和 L 的顶衬线接成一体
    w = np.maximum(w, np.interp(s, [0, 40], [thin * 2.2, thin]))
    return D.ribbon(P, w, cap1=tail), w

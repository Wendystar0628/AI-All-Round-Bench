"""03 · 英文（舞台坐标，y 朝下）。一类字体：Didone（Libre Bodoni 正体和斜体）。

  Hortus     大号 Didone 斜体，放在第一段右边的空角（1999「贝壳漂流记」的 Shell、「晚星所纺织的」的 That Steady 那个位置）；
             H 放大成首字母，左竖的脚上甩出一道花饰，往左沉到第一段下面，一路长成一根藤托住第一段，
             藤上三片叶（和叶点同形），藤尾往下卷进第二段左边的空当，末端一颗球（和球端同形）
  底线带     A GLASSHOUSE AT GOLDEN HOUR：小型大写拉开字距，坐在台面线下面，左对齐字块
"""
import numpy as np
from lockupkit.geom import glyph, union, raster
from lockupkit.latin import text_path
from lockupkit import paths
from . import shapes as SH

ITAL = paths.DIDONE_I
ROMAN = paths.DIDONE


def hortus(x, base, cap_size=150, low_size=74, wght=500, gap=-4):
    """Hortus：H 用 cap_size，ortus 用 low_size，同一条基线。返回 {'H', 'rest', 'foot', 'x1', 'H_box'}"""
    g, adv = glyph(ITAL, 'H', {'wght': wght})
    k = cap_size / 1000.0
    H = g.transform(k, 0, 0, -k, x, base)
    rest, w = text_path(ITAL, 'ortus', low_size, x + adv * k + gap, base, location={'wght': wght})
    hb = H.bounds
    # 左竖的脚：最底下一行最左边那一段
    W = int(hb[2] - hb[0]) + 6
    m = raster(H, W, 4, (1, 0, 0, 1, -hb[0] + 2, -(base - 2.5)), ss=4)[1]
    xs = np.where(m > 0.5)[0]
    run_end = xs[0]
    for q in xs[1:]:
        if q == run_end + 1:
            run_end = q
        else:
            break
    foot = (hb[0] - 2 + xs[0], hb[0] - 2 + run_end)
    return {'H': H, 'rest': rest, 'foot': foot, 'x1': x + adv * k + gap + w, 'H_box': hb, 'base': base}


def vine(H, y_run, x_end, curl_c, curl_r):
    """花饰和藤：从 H 左脚的左端起，先往左下甩出去，沉到 y_run 沿着第一段下面往左走，到 x_end 往下卷成卷须。
    返回 {'vine', 'leaves', 'ball', 'spine'}"""
    fx = H['foot'][0] + 3
    fy = H['base'] - 1.5
    s1 = ((fx, fy), (fx - 26, fy + 4), (fx - 40, y_run - 2), (fx - 90, y_run))
    s2 = ((fx - 90, y_run), (fx - 220, y_run + 3), (fx - 330, y_run - 5), (x_end + 120, y_run - 1))
    s3 = ((x_end + 120, y_run - 1), (x_end + 40, y_run + 3), (x_end - 4, y_run + 10), (curl_c[0] - curl_r * 0.2, curl_c[1] - curl_r))
    spine = SH.chain(s1, s2, s3)
    n = len(spine)
    t = np.linspace(0, 1, n)
    ws = np.interp(t, [0, 0.05, 0.18, 0.6, 1.0], [5.6, 4.2, 2.3, 1.9, 1.7])
    body = SH.ribbon(spine, list(ws))
    # 卷须：接着藤尾往下、往里卷一圈半，末端一颗球
    a0 = np.degrees(np.arctan2((spine[-1][1] - curl_c[1]), (spine[-1][0] - curl_c[0])))
    curl, cp = SH.spiral(curl_c, curl_r, curl_r * 0.32, a0, 1.25, 1.7, 1.25, ccw=False, ball=3.6)
    # 三片叶：长在藤上，一上一下一上，叶尖顺着藤往回指（藤是从右往左长的）
    leaves = []
    for tt, side, L, w in ((0.30, -1, 30, 11), (0.47, 1, 26, 10), (0.64, -1, 28, 10.5)):
        i = int(tt * (n - 1))
        p = spine[i]
        d = spine[min(n - 1, i + 2)] - spine[max(0, i - 2)]
        d = d / np.linalg.norm(d)
        nrm = np.array([-d[1], d[0]]) * side
        tip = p + d * L * 0.55 + nrm * L * 0.82
        leaves.append(SH.leaf(tuple(p - d * 2), tuple(tip), w, belly=0.45, bend=0.12 * side))
    return {'vine': union(body, curl), 'leaves': union(leaves), 'spine': spine, 'curl': cp}


def caps(x, base, size=14.5, track=0.34):
    p, w = text_path(ROMAN, 'A  GLASSHOUSE  AT  GOLDEN  HOUR', size, x, base, tracking=track, location={'wght': 500})
    return p, w

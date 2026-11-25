"""06 鹈鹕 · 英文（舞台坐标，y 朝下）。英文一类字体：Didone（Libre Bodoni，正体和斜体）。

  主字      XXII：用红纸条贴出来的 Didone 罗马数字。X 是一粗一细两条交叉的纸条（粗的左上到右下、细的右上到左下，
            正是 Didone 的粗细规则），四个末端各压一条细横纸条当衬线；I 是一条粗纸条加上下两条衬线。
            和中文的剪纸条同一套做法：直边、刀口、每条一道锐边小落影、手贴的歪斜；四个字母一高一低、一左一右地跳。
  空隙小字  「二十二种」竖排在两个 I 之间（在 letters 里，和中文同一套纸条），垫一条剪下来的白纸条。
  路径排字  one pelican, twenty-two ways：Didone 斜体沿着笔尖画出来的那条贝塞尔曲线排（SVG 的 textPath），跟着线一起起伏。
  笔尖刻印  PELICAN · No 22：压在笔尖上的小字（emblem 里画）。
"""
import math
import numpy as np
from lockupkit.geom import glyph, font, union, poly, rect, move, rotate_about
from lockupkit import paths

DIDONE, DIDONE_I = paths.DIDONE, paths.DIDONE_I


# ====================================================================== XXII


def _para(xt0, xt1, yt, xb0, xb1, yb):
    """上边 xt0–xt1 在 yt、下边 xb0–xb1 在 yb 的一条斜纸条（上下两刀水平剪）"""
    return poly([(xt0, yt), (xt1, yt), (xb1, yb), (xb0, yb)])


def x_strips(x, base, H, W):
    """一个 X：粗条（左上→右下）、细条（右上→左下）、四条衬线。返回 [(path, tone, name)]，按贴的顺序"""
    top = base - H
    tk, tn = 0.215 * H, 0.072 * H          # 粗、细（水平量）
    inset = 0.035 * H
    thick = _para(x + inset, x + inset + tk, top, x + W - inset - tk, x + W - inset, base)
    thin = _para(x + W - inset - tn - 0.02 * H, x + W - inset - 0.02 * H, top, x + inset + 0.02 * H, x + inset + tn + 0.02 * H, base)
    sh, so = 0.04 * H, 0.072 * H          # 衬线的高、两边伸出
    serifs = []
    for (c0, c1, y) in ((x + inset, x + inset + tk, top), (x + W - inset - tn - 0.02 * H, x + W - inset - 0.02 * H, top),
                        (x + W - inset - tk, x + W - inset, base), (x + inset + 0.02 * H, x + inset + tn + 0.02 * H, base)):
        y0 = y if y == top else y - sh
        serifs.append(rect(c0 - so, y0, c1 + so, y0 + sh))
    return [(thick, 'red', 'thick'), (thin, 'red_dk', 'thin')] + [(s, 'red_dk', 'serif') for s in serifs]


def i_strips(x, base, H):
    top = base - H
    st = 0.2 * H
    sh, so = 0.04 * H, 0.085 * H
    return [(rect(x, top, x + st, base), 'red', 'stem'),
            (rect(x - so, top, x + st + so, top + sh), 'red_dk', 'serif'),
            (rect(x - so, base - sh, x + st + so, base), 'red_dk', 'serif')]


def xxii(x0, base, H, gap_col):
    """XXII 一组纸条。gap_col：两个 I 之间留给「二十二种」的宽。返回 (strips, 每个字母的框, 空隙的中线 x)"""
    W = 0.66 * H
    so_i = 0.085 * H
    letters = []
    bounce = [(-5, -1.8), (6, 1.6), (-7, -1.2), (4, 1.8)]     # 每个字母：基线上下（px）、歪斜（度，顺时针为正）
    x = x0
    out = []
    boxes = []
    col_x = None
    for i, ch in enumerate('XXII'):
        dy, deg = bounce[i]
        b = base + dy
        if ch == 'X':
            ss = x_strips(x, b, H, W)
            w = W
        else:
            x += so_i
            ss = i_strips(x, b, H)
            w = 0.2 * H
        c = (x + w / 2, b - H / 2)
        ss = [(rotate_about(p, deg, c[0], c[1]), tone, f'{ch}{i}.{nm}') for p, tone, nm in ss]
        out += ss
        boxes.append((x, b - H, x + w, b))
        if ch == 'X':
            x += w + 0.035 * H
        else:
            x += w + so_i
            if i == 2:
                col_x = x + gap_col / 2
                x += gap_col
    return out, boxes, col_x


# ====================================================================== 沿路径排字


def bezier_pts(segs, n=48):
    """三次贝塞尔：segs = [P0, (c1, c2, P1), (c1, c2, P2), …] → 折线"""
    pts = [np.array(segs[0], float)]
    for c1, c2, p1 in segs[1:]:
        p0 = pts[-1]
        c1, c2, p1 = np.array(c1, float), np.array(c2, float), np.array(p1, float)
        for k in range(1, n + 1):
            t = k / n
            u = 1 - t
            pts.append(u ** 3 * p0 + 3 * u * u * t * c1 + 3 * u * t * t * c2 + t ** 3 * p1)
    return np.array(pts)


def arclen(pts):
    d = np.sqrt(((pts[1:] - pts[:-1]) ** 2).sum(1))
    return np.concatenate([[0], np.cumsum(d)])


def at_len(pts, L, s):
    """折线上弧长 s 处的点和切向"""
    i = int(np.clip(np.searchsorted(L, s) - 1, 0, len(pts) - 2))
    seg = L[i + 1] - L[i]
    t = 0 if seg < 1e-9 else (s - L[i]) / seg
    p = pts[i] + (pts[i + 1] - pts[i]) * t
    d = pts[i + 1] - pts[i]
    d = d / (np.linalg.norm(d) + 1e-9)
    return p, d


def text_on_path(fpath, s, size, pts, s0, tracking=0.0, loc=None, rise=0.0):
    """沿折线排一行字：字的基线贴着线（rise 往线的上方抬），从弧长 s0 起。返回 (轮廓, 末尾的弧长)"""
    f, cmap, gs = font(fpath)
    upm = f['head'].unitsPerEm
    k = size / upm
    gsl = f.getGlyphSet(location=loc) if loc else gs
    L = arclen(pts)
    pos = s0
    out = []
    for ch in s:
        w = gsl[cmap[ord(ch)]].width * k
        if ch != ' ':
            g, _ = glyph(fpath, ch, loc)
            p, d = at_len(pts, L, pos + w / 2)
            ang = math.degrees(math.atan2(d[1], d[0]))
            nrm = np.array([d[1], -d[0]])             # 线的上方
            gl = g.transform(k, 0, 0, -k, -w / 2, 0)
            gl = rotate_about(gl, ang, 0, 0)
            q = p + nrm * rise
            out.append(move(gl, q[0], q[1]))
        pos += w + tracking * size
    return union(out), pos

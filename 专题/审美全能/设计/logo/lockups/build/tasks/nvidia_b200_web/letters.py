"""04 · 中文「网页艺术」的方言「走线宋」（字体单位，1000 em，y 朝上）。

不在宋体轮廓上做手术，而是按 strokes.py 里走线化的中线、用一支笔把每一笔重新画出来（宋体只给骨架的位置）：
  1. 一支笔：横 = 一根走线宽（和 B200 的发丝、伸出去的线同一个宽），竖 = 铺铜宽，斜笔从竖宽收到尖或放到趾；
  2. 只走 0°、45°、90°：撇、捺、点、提、钩全拆成直段，拐弯处 45° 斜接（布线不走弧、不走直角以外的角）；
  3. 宋体的特征换成同一种 45° 的形：横末三角是一个 45° 的小屋脊（鳞），横折转角上一样的屋脊（肩），
     竖的起笔是左高右低的一刀 45°（头），收笔右下角 45° 切掉（脚），撇收成尖，点和捺放宽、平切成趾；
  4. 字距按方格等分。
全组规则没有例外，所以没有「一笔换色」「贴符号」：网的两个㐅本来就是交叉的两根线，按规则拐出来正好是一对换道的走线
（网 = 网络，换道的双绞线），这是规则自己长出来的，不另加。
"""
import math
import numpy as np
from lockupkit.geom import union, diff, poly, rect
from lockupkit.strokes import Title
from lockupkit import paths
from .strokes import STROKES

FONT = paths.SONG_BOLD
TEXT = '网页艺术'


def _line_x(a1, b1, a2, b2):
    """两条直线（各给两点）的交点；几乎平行时返回 None"""
    d1, d2 = b1 - a1, b2 - a2
    den = d1[0] * d2[1] - d1[1] * d2[0]
    if abs(den) < 1e-9:
        return None
    t = ((a2[0] - a1[0]) * d2[1] - (a2[1] - a1[1]) * d2[0]) / den
    return a1 + d1 * t


def ribbon(pts, ws):
    """沿折线 pts 的一条带子，拐角斜接（miter）。ws：每个顶点上的宽（可以是 0，收成尖），
    或者每段一对 (起宽, 止宽)（横段细、斜段粗这种一笔里换宽的）"""
    P = [np.asarray(p, float) for p in pts]
    n = len(P) - 1
    if not isinstance(ws[0], (tuple, list)):
        ws = [(ws[i], ws[i + 1]) for i in range(n)]
    L, R = [], []
    for i in range(n):
        d = P[i + 1] - P[i]
        d = d / (np.linalg.norm(d) + 1e-12)
        nv = np.array([-d[1], d[0]])
        L.append((P[i] + nv * ws[i][0] / 2, P[i + 1] + nv * ws[i][1] / 2))
        R.append((P[i] - nv * ws[i][0] / 2, P[i + 1] - nv * ws[i][1] / 2))

    def side(S):
        out = [S[0][0]]
        for i in range(1, n):
            q = _line_x(S[i - 1][0], S[i - 1][1], S[i][0], S[i][1])
            out.append(q if q is not None else (S[i - 1][1] + S[i][0]) / 2)
        out.append(S[-1][1])
        return out
    pl = side(L) + side(R)[::-1]
    return poly([tuple(map(float, q)) for q in pl])


def bevel_end(p, end, w, toward=-1):
    """竖着收尾的一笔：末端斜切 45°，尖落在收笔那一点的左下（toward=-1）或右下（+1）"""
    x, y = end
    if toward < 0:
        xl = x - w / 2
        return diff(p, poly([(xl, y), (xl + 600, y + 600), (xl + 600, y - 600), (xl - 600, y - 600), (xl - 600, y)]))
    xr = x + w / 2
    return diff(p, poly([(xr, y), (xr - 600, y + 600), (xr - 600, y - 600), (xr + 600, y - 600), (xr + 600, y)]))


def profile(axis, w0, w1):
    """按长度从 w0 线性收（放）到 w1：每个顶点上的宽"""
    seg = [float(np.linalg.norm(np.subtract(b, a))) for a, b in zip(axis[:-1], axis[1:])]
    tot = sum(seg)
    out, acc = [w0], 0.0
    for s in seg:
        acc += s
        out.append(w0 + (w1 - w0) * acc / tot)
    return out


class Pen:
    """一支笔：H 横（= 一根走线宽）、V 竖（铺铜宽），其余都从这两个数来"""

    def __init__(self, H, V):
        self.H, self.V = H, V
        self.a = 0.56 * V          # 鳞、肩那个 45° 小屋脊的高

    # ---------------------------------------------------------------- 端头
    def uroko(self, xe, y):
        """横末的鳞：屋脊顶在 (xe - a, 上沿 + a)，右坡 45° 一直切到下沿，就是横的收笔"""
        H, a = self.H, self.a
        yt, yb = y + H / 2, y - H / 2
        return poly([(xe - 2 * a, yb), (xe - 2 * a, yt), (xe - a, yt + a), (xe + H, yb)])

    def shoulder(self, xc, y, Vw):
        """横折转角上的肩：同一个 45° 屋脊，右坡落到竖的右缘"""
        a = self.a * 1.1
        yt = y + self.H / 2
        xr = xc + Vw / 2
        return poly([(xc - a, yt - 2), (xc - a, yt), (xc, yt + a), (xr, yt + a - Vw / 2), (xr, yt - 2)])

    def head(self, p, x, ytop, Vw):
        """竖的起笔：左高右低一刀 45°（左上角留 0.3 宽的平台）"""
        xl = x - Vw / 2
        k = 0.3 * Vw
        return diff(p, poly([(xl + k, ytop + 1), (x + Vw / 2 + 2, ytop + 1), (x + Vw / 2 + 2, ytop - (Vw - k) - 2)]))

    def foot(self, p, x, ybot, Vw):
        """竖的收笔：右下角 45° 切掉半个宽"""
        c = 0.5 * Vw
        xr = x + Vw / 2
        return diff(p, poly([(xr - c, ybot - 1), (xr + 2, ybot - 1), (xr + 2, ybot + c + 2)]))

    def toe(self, p, axis, w):
        """点、捺的收笔：顺着最后一段多走半个宽，再按收笔那一点的高度水平一刀（平底、两角 45° 的趾）"""
        e = np.asarray(axis[-1], float)
        return diff(p, rect(e[0] - 3 * w, e[1] - 3 * w, e[0] + 3 * w, e[1]))

    # ---------------------------------------------------------------- 一笔
    def draw(self, s):
        H, V = self.H, self.V
        ax = [tuple(map(float, q)) for q in s.axis]
        tags = s.tags
        if s.type == '横':
            p = ribbon(ax, [H, H])
            if '鳞' in tags:
                xe = ax[-1][0]
                p = union(diff(p, rect(xe - 2 * self.a, ax[-1][1] - H, xe + 400, ax[-1][1] + H)), self.uroko(xe, ax[-1][1]))
            return p
        if s.type == '竖':
            p = ribbon([(ax[0][0], ax[0][1]), (ax[-1][0], ax[-1][1])], [V, V])
            if '头' in tags:
                p = self.head(p, ax[0][0], ax[0][1], V)
            if '脚' in tags:
                p = self.foot(p, ax[-1][0], ax[-1][1], V)
            return p
        if s.type in ('折', '钩') and s.name in ('横折', '横折钩'):
            xc, yc = ax[1]
            ws_h = ribbon(ax[:2], [H, H])
            # 横段收到竖的中线为止，竖段从横的上沿起，转角由肩盖住（布线的 45°）
            vert = ribbon([(xc, yc + H / 2), ax[2]], [V, V])
            p = union(ws_h, vert, self.shoulder(xc, yc, V))
            if s.name == '横折钩':
                # 竖到底一刀平，左下 45° 回一个尖钩（布线拐 135° 也只用 45° 的边）
                hx, hy = ax[2]
                hook = ribbon([(hx, hy + V), (hx, hy), ax[3]], [V, V, 0])
                p = diff(union(p, hook), rect(hx - 400, hy - 400, hx + 400, hy - 0.28 * V))
            elif '脚' in tags:
                p = self.foot(p, ax[-1][0], ax[-1][1], V)
            return p
        if s.name == '横折弯钩':
            # 乙：横（走线宽）→ 45° 粗斜笔 → 短竖 → 45° → 粗底横 → 竖钩收尖
            D = 0.86 * V
            body = ribbon(ax[:6], [(H, H), (D, D), (D, D), (D, D), (D, D)])
            xh, yh = ax[5]
            hook = ribbon([(xh, yh - D / 2), ax[6]], [0.44 * V, 0])
            p = union(body, hook)
            return p
        if s.type == '撇' and '短' in tags:
            return ribbon(ax, [0.72 * V, 0.56 * V, 0.56 * V])
        if s.type == '撇':
            last = np.subtract(ax[-1], ax[-2])
            if abs(last[0]) < 1e-6:
                # 最后一段是竖的（网的㐅）：粗细不收，末端 45° 一刀，尖在左下
                w = 0.62 * V
                ws = profile(ax, 0.8 * V, w)
                ext = list(ax)
                ext[-1] = (ax[-1][0], ax[-1][1] - w)
                return bevel_end(ribbon(ext, ws), ax[-1], w, -1)
            w0 = 0.86 * V if len(ax) > 2 else 0.78 * V
            if len(ax) == 3 and abs(np.subtract(ax[1], ax[0])[0]) > 1e-6:
                ws = [0.9 * V, 0.62 * V, 0.0]              # 一整段 45° 的撇：前半段不急着收
            else:
                ws = profile(ax, w0, 0.0 if '尖' in tags else 0.2 * V)
            p = ribbon(ax, ws)
            if '头' in tags and abs(np.subtract(ax[1], ax[0])[0]) < 1e-6:
                p = self.head(p, ax[0][0], ax[0][1], w0)
            return p
        if s.type == '捺':
            # 45° 放宽，再一段水平的尾收成尖
            ws = [0.3 * V, 1.0 * V, 0.0]
            return ribbon(ax, ws)
        if s.type == '点':
            if len(ax) > 2:
                ws = profile(ax, 0.42 * V, 0.96 * V)
            else:
                ws = [0.3 * V, 1.0 * V]
            ext = list(ax)
            d = np.subtract(ax[-1], ax[-2])
            d = d / np.linalg.norm(d)
            w_end = ws[-1]
            ext[-1] = tuple(np.asarray(ax[-1]) + d * w_end * 0.75)
            p = ribbon(ext, ws[:-1] + [w_end])
            return self.toe(p, ax, w_end) if '趾' in tags else p
        raise ValueError(f'{s.id}：方言里没有 {s.type}/{s.name} 的画法')


def letters(H, V):
    """返回 (Title, [每个字的轮廓（字体单位）])：Title 给检查图画笔画标注，轮廓是按方言重画的字"""
    T = Title(FONT, TEXT, STROKES)
    pen = Pen(H, V)
    out = []
    for g in T:
        out.append(union([pen.draw(s) for s in g.strokes]))
    return T, out

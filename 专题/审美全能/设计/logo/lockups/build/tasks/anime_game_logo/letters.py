"""10 二次元游戏Logo · 中文笔画处理（字体单位，1000 em，y 朝上）。

方言「烫印宋」：和 Logo 的 Didone 胖脸体用同一支尖头笔——横是发丝，竖、撇、捺重；锋利，没有圆头。五个字统一做：
  1. 发丝横   横画上下各削一点，削到和 Logo 的发丝一样细（整字竖向收）；
  2. 刺形衬线 横末的三角、折肩的三角重画成两边内凹的刺：尖更尖、身更瘦（Didone 无托衬线的那种利）；
  3. 针尖收笔 撇、提、钩、捺的收尾顺着笔势再拉出一截针尖；
  4. 楔形点   所有的点重画成两头尖的楔形泪滴（一刀切出来的，不是圆头）。
detail='small' 给小形态：针尖收短。
"""
import numpy as np
from lockupkit.strokes import Title
from lockupkit.geom import union, diff, inter, move, slab, poly, rect, flatten
from lockupkit.surgery import serif_apex
from lockupkit import paths
from .strokes import STROKES

FONT = paths.SONG_HEAVY
TEXT = '二次元游戏'

THIN = 4.5                 # 横画上下各削
THORN = dict(lift=18, lean=10, concave=0.16, slim=0.82)   # 刺形衬线：尖再拔高、往前探、两边内凹、底边收窄


def thin_h(p, d=THIN):
    """竖向收 d：横画变成发丝，竖画几乎不变"""
    return inter(p, move(p, 0, d), move(p, 0, -d))


def _bend(a, b, inward, k, n=14):
    """a → b 的一段内凹弧：控制点从中点往 inward 方向推 k×边长"""
    a, b = np.asarray(a, float), np.asarray(b, float)
    c = (a + b) / 2 + np.asarray(inward, float) * k * np.linalg.norm(b - a)
    t = np.linspace(0, 1, n)[:, None]
    return (1 - t) ** 2 * a + 2 * (1 - t) * t * c + t ** 2 * b


def thorn(p, s, lift=THORN['lift'], lean=THORN['lean'], concave=THORN['concave'], slim=THORN['slim']):
    """横末三角 / 折肩三角 → 两边内凹的刺。先把这一笔在横画上沿以上的三角切掉，再补一根刺（底边略收窄）。"""
    a = serif_apex(s)
    if a is None:
        return p
    ax, ay = a
    # 横画（或折的横段）的上沿：沿横段竖着量几处，只取发丝那么细的几处（避开交叉的笔画），取上沿的中位数
    y_axis = s.axis[0][1]
    x_a, x_b = s.axis[0][0], s.axis[1][0]
    tops = []
    for u in np.linspace(0.08, 0.6, 9):
        off, wv = cross_section(s, (x_a + (x_b - x_a) * u, y_axis), (0.0, 1.0), reach=40)
        if 6 < wv < 45:
            tops.append(y_axis + off + wv / 2)
    y0 = (float(np.median(tops)) if tops else y_axis + s.ws[0] / 2) - THIN - 0.8
    box = rect(ax - 190, y0, ax + 150, ay + 6)
    R = inter(s.piece, box)
    rb = R.bounds
    if rb[2] - rb[0] < 10:
        return p
    xl, xr = rb[0], rb[2]
    mid = (xl + xr) / 2
    xl, xr = mid + (xl - mid) * slim, mid + (xr - mid) * slim + (xr - mid) * (1 - slim) * 0.6
    apex = np.array([ax + lean, ay + lift])
    L = np.array([xl, y0 - 0.5])
    Rr = np.array([xr, y0 - 0.5])
    cen = (L + Rr + apex) / 3
    left = _bend(L, apex, (cen - (L + apex) / 2) / (np.linalg.norm(cen - (L + apex) / 2) + 1e-9), concave)
    right = _bend(apex, Rr, (cen - (apex + Rr) / 2) / (np.linalg.norm(cen - (apex + Rr) / 2) + 1e-9), concave)
    shape = poly([tuple(q) for q in np.concatenate([left, right[1:]])])
    return union(diff(p, own(s, inter(R, rect(rb[0] - 1, y0 + 0.5, rb[2] + 1, rb[3] + 1)))), shape)


def own(s, shape):
    """shape 里只属于这一笔的部分（切取区域会互相重叠，切这一笔时不能咬到同一个字里别的笔画）"""
    others = [o.piece for o in s.g.strokes if o is not s]
    return diff(shape, union(others)) if others else shape


def thinned(s):
    """这一笔削过发丝横以后的样子（针尖按它量宽、切尾，才和字上真实的边接得上）"""
    if not hasattr(s, '_thin'):
        s._thin = thin_h(s.piece)
    return s._thin


def cross_section(s, q, n, reach=110.0, piece=None):
    """这一笔切出来的形在点 q、法向 n 上的那一截：返回 (中点偏移, 宽)，只量 q 所在的那一截"""
    q = np.asarray(q, float)
    n = np.asarray(n, float)
    cut = inter(s.piece if piece is None else piece, slab(tuple(q - n * reach), tuple(q + n * reach), 3.0))
    best, out = 1e9, (0.0, 0.0)
    for c in flatten(cut, tol=0.5):
        proj = (c - q) @ n
        lo, hi = proj.min(), proj.max()
        d = 0.0 if lo <= 0 <= hi else min(abs(lo), abs(hi))
        if d < best:
            best, out = d, (float((lo + hi) / 2), float(hi - lo))
    return out


def needle(p, s, back=55.0, ext=60.0):
    """收尾换成针尖：在离收笔 back 处横切这一笔，切口以外的尾巴拿掉，换一根从切口收到针尖的三角；
    针尖的方向取切口中点到原来笔尖的方向，再往外拉 ext。"""
    d0 = np.array(s.end_dir, float)
    n = np.array([-d0[1], d0[0]])
    b = np.array(s.end, float) - d0 * back
    off, w = cross_section(s, b, n, piece=thinned(s))
    if w < 4:
        return p
    b = b + n * off
    # 切口以外、离切口不远的那一截尾巴（只在这一笔里、横向不出切口太多）
    side, reach = w / 2 + 25, back + 90
    zone = poly([tuple(b - n * side + d0 * 0.5), tuple(b + n * side + d0 * 0.5),
                 tuple(b + n * side + d0 * reach), tuple(b - n * side + d0 * reach)])
    tail = own(s, inter(thinned(s), zone))
    cs = flatten(tail, tol=0.5)
    if not cs:
        return p
    pts = np.concatenate(cs, 0)
    far = pts[np.argmax((pts - b) @ d0)]          # 原来的笔尖
    d = far - b
    d = d / (np.linalg.norm(d) + 1e-9)
    tip = far + d * ext
    shape = poly([tuple(b + n * w / 2 - d0 * 1.5), tuple(tip), tuple(b - n * w / 2 - d0 * 1.5)])
    return union(diff(p, tail), shape)


def wedge_dot(s, grow=1.0):
    """楔形泪滴：沿点的中线，两头尖，最宽处靠后，一边鼓、一边直（一刀切出来）"""
    a, e = np.array(s.start, float), np.array(s.end, float)
    d = e - a
    L = np.linalg.norm(d)
    d = d / L
    n = np.array([-d[1], d[0]])
    a = a - d * 14
    L = L + 40
    W = s.w * 1.02 * grow
    t = np.linspace(0, 1, 28)
    prof = np.sin(np.pi * np.clip(t, 0, 1) ** 1.45) ** 0.85
    left = [a + d * (L * ti) + n * (W / 2 * pi) for ti, pi in zip(t, prof)]
    right = [a + d * (L * ti) - n * (W / 2 * pi * 0.62) for ti, pi in zip(t, prof)]
    return poly([tuple(q) for q in left + right[::-1]])


def letters(detail='full'):
    T = Title(FONT, TEXT, STROKES)
    k = 1.0 if detail == 'full' else 0.5

    # ---- 1. 发丝横（先做：后面补上的刺、针尖不再被收）
    T.op(thin_h)
    # ---- 4. 楔形点
    T.q(type='点').variant(lambda s: wedge_dot(s))
    # ---- 2. 刺形衬线（横末三角、折肩三角）
    T.q(lambda s: s.type in ('横', '折', '钩') and serif_apex(s) is not None).op(thorn)
    # ---- 3. 针尖收笔
    T.q(type='撇').exclude('次3', '游8').op(needle, back=30, ext=55 * k)
    T.q(type='提').op(needle, back=30, ext=50 * k)
    for sid, ext in (('元4', 60), ('戏4', 60), ('游6', 45), ('游11', 45), ('次4', 40)):
        T.s(sid).op(needle, back=22, ext=ext * k)
    T.q(type='捺').exclude('戏2').op(needle, back=25, ext=35 * k)
    return T

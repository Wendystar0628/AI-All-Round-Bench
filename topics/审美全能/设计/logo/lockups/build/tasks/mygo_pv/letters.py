"""01《壱雫空》PV · 笔画处理（字体单位，1000 em，y 朝上）。

方言「雨丝明朝」：底字思源宋体 Bold（细一档的明朝），三个字统一做——
  1. 发丝横    横收成真正的发丝（上下各收 THIN，约 27 → 11），竖保留，横竖对比拉到 1999 那样高；
  2. 尖鳞      横末三角、转角三角往右上拔高、收尖，像向阳的一粒晶（太阳在右上）；
  3. 雨丝脚    收笔朝下、末端空着的竖，宋体的圆脚换成往下收尖的雨丝针；
  4. 水滴点    所有的点画成同一种水滴：对称的泪滴，圆腹在收笔处，尖在起笔处，按原来的位置、方向和体量。
母题：「雫」= 雨 + 下，字本身就在讲“一滴雨落下”——
  · 雨字头的四点 → 四道斜落的细长雨滴（梭形，雨点和雨丝同构）；
  · 「下」的那一点 → 一滴透明的水（高潮）：原位置、原方向，比原来那一点稍大；字形里是它的墨边（水的厚度，
    背光的左下厚、向阳的右上薄），水本身、倒映的天和太阳在 hero 层（layers.py）；
  · 「空」八的长点和它是同一类笔画（往右下的长点），画成同形的实心墨滴，是高潮的近处呼应。
书名号《》不在这里，见 english.py 的 brackets()（两道折起来的雨线）。
"""
import math
import numpy as np
import pathops
from pathops import Path
from lockupkit.geom import union, diff, inter, poly, rect, move
from lockupkit.strokes import Title
from lockupkit.surgery import serif_apex, move_points
from lockupkit import paths
from .strokes import STROKES

FONT = paths.SONG_BOLD
TEXT = '壱雫空'

THIN = 8              # 横画上下各收（字体单位）：27 → 11 的发丝
HAIR = 27 - 2 * THIN  # 本题字的最细笔画（字体单位）；几何线、雨丝的宽都取它
RAIN_DEG = 16         # 雨向：从左上落到右下，偏离竖直的角度（雨字头、太阳上的雨丝、底板的雨都用它）
_R = math.radians(RAIN_DEG)
RAIN = np.array([math.sin(_R), -math.cos(_R)])      # 字体单位里往下落的方向（y 朝上）

# ====================================================================== 水滴（字体单位）


def drop_pts(tip, c, r, bend=0.0, needle=0.12, n_arc=56, n_tail=22):
    """一颗对称泪滴的轮廓点：腹是圆心 c、半径 r 的圆，两侧顺着圆的切线收到尖 tip。
    needle：尖附近两侧往里收的程度（0 是直的切线、经典的泪滴；越大尖越细长）；bend：尾往左手边弯（尾长的比例）。"""
    tip, c = np.asarray(tip, float), np.asarray(c, float)
    ax = tip - c
    L = float(np.linalg.norm(ax))
    u = ax / L
    nrm = np.array([-u[1], u[0]])
    r = min(r, L * 0.8)
    th = math.acos(r / L)
    base = math.atan2(u[1], u[0])
    a0, a1 = base + th, base - th + 2 * math.pi            # 从左切点绕过腹到右切点
    arc = [c + r * np.array([math.cos(a), math.sin(a)]) for a in np.linspace(a0, a1, n_arc)]

    def side(p0):
        tl = float(np.linalg.norm(tip - p0))
        tang = (tip - p0) / tl
        c1 = p0 + tang * tl * 0.35
        c2 = tip - tang * tl * 0.3 + (c + u * L * 0.7 - (tip - tang * tl * 0.3)) * needle
        return [(1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * c1 + 3 * (1 - t) * t * t * c2 + t ** 3 * tip
                for t in np.linspace(0, 1, n_tail)]
    right = side(arc[-1])                  # 右切点 → 尖
    left = side(arc[0])[::-1]              # 尖 → 左切点
    pts = arc + right[1:] + left[1:-1]
    if bend:
        pts = [q + nrm * bend * L * max(0.0, float((q - c) @ u) / L) ** 2 for q in pts]
    return [tuple(map(float, q)) for q in pts]


def drop(tip, c, r, **kw):
    return poly(drop_pts(tip, c, r, **kw))


# 水滴点：屋檐（冖、雨头、宀）的左点是挂在檐口的一滴水——檐（那一横）往左伸出一小截，水滴从檐口垂直挂下来；
# 宀的顶点是落在屋顶上的一滴雨（顺着雨向）。(尖, 腹心, 半径)
DROPS = {
    '壱4': ((147, 452), (147, 300), 62),
    '雫2': ((131, 663), (131, 513), 60),
    '空2': ((139, 691), (139, 538), 62),
    '空1': ((468, 885), (505, 754), 58),
}
EAVES = {'壱4': (147, 222, 445.5), '雫2': (131, 196, 657), '空2': (139, 204, 685)}   # 檐口伸出：x0, x1, 中线高度（收细后横厚约 13.5）
# 拿掉原来的点用的范围（整块切掉，连同它和横接上的那一小截）
CUT = {
    '壱4': [(20, 240), (207, 240), (207, 540), (20, 540)],
    '雫2': [(20, 500), (182, 500), (182, 735), (20, 735)],
    '空2': [(20, 470), (190, 470), (190, 790), (20, 790)],
    '空1': [(370, 702), (620, 702), (620, 880), (370, 880)],
    '雫11': [(553, 40), (900, 40), (900, 330), (553, 330)],
}
# 雨字头四点 → 四道细长雨滴：(腹心, 长)
RAIN_DROPS = {'雫5': ((262, 515), 120), '雫6': ((352, 462), 140), '雫7': ((648, 515), 120), '雫8': ((738, 462), 140)}
RAIN_R = 24

# 高潮：「下」的那一点 → 一滴透明的水
CLIMAX = dict(tip=(548, 298), c=(796, 122), r=90, bend=-0.04)
RIM = 18              # 墨边（水的厚度）：背光一侧的厚度；向阳一侧只剩 RIM_LIT
RIM_LIT = 8


def rain_drop(head, length, r=RAIN_R):
    head = np.asarray(head, float)
    return drop(head - RAIN * length, head, r, needle=0.25)


def climax_shapes():
    """(外形, 墨边, 水)：水是往右上（向阳）挪开一点的小一号水滴，所以墨边左下厚、右上薄。字体单位。"""
    k = CLIMAX
    outer = drop(k['tip'], k['c'], k['r'], bend=k['bend'])
    sh = np.array([0.6, 0.8]) * (RIM - RIM_LIT) / 2          # 往右上挪
    c_in = np.asarray(k['c']) + sh
    tip = np.asarray(k['tip'], float)
    u = (tip - np.asarray(k['c'])) / np.linalg.norm(tip - np.asarray(k['c']))
    r_in = k['r'] - (RIM + RIM_LIT) / 2
    inner = drop(tuple(tip - u * 120), tuple(c_in), r_in, bend=k['bend'])
    edge = Path(outer)
    edge.stroke(RIM_LIT * 2, pathops.LineCap.BUTT_CAP, pathops.LineJoin.MITER_JOIN, 4)
    inner = diff(inter(inner, outer), union(edge))
    return outer, diff(outer, inner), inner


# ====================================================================== 方言的手术


def thin_h(p, d=THIN, steps=4):
    """竖向收：上下各收 d（竖向腐蚀），横画从 27 收成发丝，竖画只短一点点。"""
    out = None
    for i in range(steps + 1):
        q = move(p, 0, d * (2 * i / steps - 1))
        out = q if out is None else inter(out, q)
    return out


def needle_foot(p, s, y_cut, tip, y_min=None, concave=0.32):
    """收笔朝下的竖：y_cut 以下这一笔的字脚拿掉，换成往下收尖的针（两侧微凹），尖在 tip。"""
    x0, x1 = s.end[0] - s.w_end / 2, s.end[0] + s.w_end / 2
    y_min = s.end[1] - 20 if y_min is None else y_min
    p = diff(p, rect(x0 - 6, y_min, x1 + 6, y_cut))
    tip = np.asarray(tip, float)
    L = y_cut - tip[1]
    left, right = [], []
    for i in range(29):
        t = i / 28
        bow = s.w_end * concave * t * (1 - t)
        y = y_cut - L * t
        left.append((x0 + (tip[0] - x0) * t + bow, y))
        right.append((x1 + (tip[0] - x1) * t - bow, y))
    return union(p, poly(left + right[::-1]), rect(x0, y_cut - 1, x1, y_cut + 4))


def sharpen(p, s, dx=4, dy=14, r=34):
    """尖鳞：横末三角（或转角三角）的尖往右上拔、收尖。找不到三角的笔画不动。"""
    a = serif_apex(s)
    if a is None:
        return p
    return move_points(p, (a[0], a[1] - THIN), dx, dy, r)


# ====================================================================== 全组


def letters(detail='full'):
    """返回排版前的 Title（手术都挂好了）。detail='small' 给小形态：针短一些，雨滴粗一点，高潮那滴画成实心。"""
    T = Title(FONT, TEXT, STROKES)
    big = detail == 'full'

    # ---- 先拿掉要重画的点（在收细之前，按原字形切）
    for sid, pts in CUT.items():
        g = T.s(sid).g
        g.op(lambda p, rg=poly(pts): diff(p, rg))
    for sid in RAIN_DROPS:                      # 雨字头四点：本来就是独立的轮廓，整个拿掉
        s = T.s(sid)
        s.g.op(lambda p, pc=s.piece: diff(p, pc))

    # ---- 方言 1：发丝横
    T.op(thin_h)
    # ---- 方言 2：尖鳞
    T.q(lambda s: serif_apex(s) is not None).exclude('壱6').op(sharpen)
    # ---- 方言 3：雨丝脚（「下」的竖是全件最长的一根，收成长针；「雨」的竖下面就是「下」的横，只收成短尖）
    T.s('雫10').op(needle_foot, y_cut=40, tip=(493, -260 if big else -170))
    T.s('雫4').op(needle_foot, y_cut=470, tip=(497, 396), y_min=390)

    # ---- 方言 4 / 呼应：点 → 水滴
    for sid, (x0, x1, y) in EAVES.items():
        T.s(sid).add(rect(x0, y - 6.75, x1, y + 6.75))
    for sid, (tip, c, r) in DROPS.items():
        T.s(sid).add(drop(tip, c, r))
    for sid, (head, L) in RAIN_DROPS.items():
        T.s(sid).add(rain_drop(head, L if big else L * 0.85, RAIN_R if big else RAIN_R * 1.3))

    # ---- 高潮：「下」的点 → 一滴透明的水。字形里只放墨边；小形态里放实心整滴
    outer, rim, water = climax_shapes()
    T.s('雫11').add(rim if big else outer)
    T['雫'].anchors['drop_c'] = CLIMAX['c']
    T['雫'].anchors['drop_tip'] = CLIMAX['tip']
    return T

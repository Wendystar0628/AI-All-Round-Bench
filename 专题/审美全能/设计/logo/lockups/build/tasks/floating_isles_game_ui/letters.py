"""09 浮空群岛传说游戏UI · 笔画处理（字体单位，1000 em，y 朝上）。笔画手术都写在本文件里（没有用机甲那一套）。

方言「卡带盒描边宋」：思源宋体 Heavy 的骨架（横细竖粗），十个字（连 U、I）统一做——
  1. 楔形外张  宋体横末的三角、横折转角上的三角往右上张开、削尖；U、I 的衬线外端削成往外挑的楔尖；
  2. 圆头削尖  宋体的圆东西一律削成刃：收笔朝下、末端空着的竖，圆字脚削成朝下的岩尖（两刀刻面，尖偏左，像浮岛的底）；
               捺和长点末端的圆球、三点水提画起头的圆球，在原来的轮廓里削出刃尖（只削不补，体量不变）；
  3. 描边投影  全组同一圈深紫细描边、同一格错位的硬投影（颜色层做，见 layers.py）。
呼应：所有的点削成小浮石：取这一点的外形，削成五六刀的刻面，最低的一角往下拉成尖（平顶、尖底）。
高潮：「岛」的山完整保留作岛顶（只把竖折转角那个小脚削平，底横成了一条平的地面），
      地面下面隔一道细缝挂一块倒长的岩体：下沿三个高低不一的岩尖、两根垂下的细根，岩体右下挂一簇晶体，
      主尖下面滴一点翠绿。晶簇是全件星芒的位置；滴落处是伸进画面的那条航路的起点。
"""
import math
import numpy as np
import cv2
from lockupkit.geom import union, diff, inter, poly, rect, circle, flatten, Path
from lockupkit.strokes import Title, _vertices
from lockupkit.surgery import serif_apex, move_points
from lockupkit import paths
from .strokes import STROKES

FONT = paths.SONG_HEAVY
TEXT = '浮空群岛传说游戏UI'

FLARE = (24, 12)        # 横末三角往右上张开的量
HAIR = 28               # 宋体横的宽：本题最细的笔画（细根、航路、细线都按它换算）


# ====================================================================== 小工具


def runs_at(p, y, x0=-300, x1=1400):
    """轮廓在高度 y 上的几段 [(左, 右)]"""
    r = inter(p, rect(x0, y - 0.5, x1, y + 0.5))
    return sorted((c.bounds[0], c.bounds[2]) for c in r.contours)


def _rot(pts, deg, c):
    t = math.radians(deg)
    cs, sn = math.cos(t), math.sin(t)
    return [(c[0] + (x - c[0]) * cs - (y - c[1]) * sn, c[1] + (x - c[0]) * sn + (y - c[1]) * cs) for x, y in pts]


def taper_line(pts, w0, w1):
    """一根从 w0 收到 w1 的线（细根）"""
    P = [np.array(q, float) for q in pts]
    left, right = [], []
    for i, q in enumerate(P):
        d = P[min(i + 1, len(P) - 1)] - P[max(i - 1, 0)]
        d = d / (np.linalg.norm(d) + 1e-9)
        n = np.array([-d[1], d[0]])
        w = w0 + (w1 - w0) * i / (len(P) - 1)
        left.append(q + n * w / 2)
        right.append(q - n * w / 2)
    return poly([tuple(q) for q in left + right[::-1]])


# ====================================================================== 方言


def flare(p, s, dx=FLARE[0], dy=FLARE[1], r=30):
    """宋体横末三角（或横折转角上的三角）的尖往右上张开：尖和它附近的点一起挪"""
    a = serif_apex(s)
    return p if a is None else move_points(p, a, dx, dy, r)


def rock_foot(p, s, lift=0.55, depth=0.34, at=0.4):
    """收笔朝下、末端空着的竖：圆字脚削成朝下的岩尖。在字脚最低处往上 lift×宽 处横切，
    下面换成两刀刻面：左肩低、右肩高，尖在 at×宽（偏左），比原来的最低处再低 depth×宽。"""
    v = _vertices(s.piece)
    ymin = float(v[:, 1].min())
    cx = float(s.end[0])
    w = s.w_end
    ytop = ymin + lift * w
    rs = [r for r in runs_at(p, ytop, cx - w, cx + w) if r[1] - r[0] > 20]
    x0, x1 = min(rs, key=lambda r: abs((r[0] + r[1]) / 2 - cx))
    ww = x1 - x0
    p = diff(p, rect(x0 - 0.5, ymin - 300, x1 + 0.5, ytop))
    tip = (x0 + at * ww, ymin - depth * ww)
    return union(p, poly([(x0, ytop + 1), (x1, ytop + 1), (x1, ymin + 0.30 * ww), tip, (x0, ymin + 0.08 * ww)]))


def wedge_cut(p, s, which='end', back=0.25, ext=0.35, half=0.62, reach=1.5):
    """末端的圆球在原轮廓里削出刃尖：以中线 1-back（起头时 back）为界，往外一段只留一个楔形，楔尖在端点外 ext×宽。
    只削不补；削的范围限在端点 reach×宽 以内，碰不到别的笔画。"""
    if which == 'end':
        a, e, d, w = s.point(1 - back), s.end, s.end_dir, s.w_at(1 - back)
    else:
        a, e, d, w = s.point(back), s.start, -s.start_dir, s.w_at(back)
    n = np.array([-d[1], d[0]])
    R = w * reach
    zone = inter(poly([tuple(a + n * R), tuple(a + n * R + d * R * 2), tuple(a - n * R + d * R * 2), tuple(a - n * R)]),
                 circle(float(e[0]), float(e[1]), R * 1.1))
    tip = e + d * (ext * w)
    keep = poly([tuple(a + n * w * half - d * 2), tuple(tip), tuple(a - n * w * half - d * 2)])
    return diff(p, diff(zone, keep))


# U、I 的衬线（实测：上衬线 y 712–747；I 的下衬线 y 0–35）：外端换成往外挑的楔尖
LATIN_SERIFS = {'U': [(36, 392, 712, 747), (533, 802, 712, 747)], 'I': [(41, 395, 712, 747), (41, 395, 0, 35)]}


def latin_serifs(p, ch, cut=46, out=26, lift=7):
    for x0, x1, y0, y1 in LATIN_SERIFS[ch]:
        top = y0 > 300
        edge, inner = (y1, y0) if top else (y0, y1)
        sg = 1 if top else -1
        p = diff(p, rect(x0 - 1, y0 - 2, x0 + cut, y1 + 2), rect(x1 - cut, y0 - 2, x1 + 1, y1 + 2))
        p = union(p,
                  poly([(x0 + cut + 1, edge), (x0 - out, edge + sg * lift), (x0 + cut + 1, inner + sg * 6)]),
                  poly([(x1 - cut - 1, edge), (x1 + out, edge + sg * lift), (x1 - cut - 1, inner + sg * 6)]))
    return p


# ====================================================================== 呼应：点 → 小浮石

# 和别的笔画连着的点：切取的范围（实测轮廓定的，不碰相邻的笔画）；单独一个轮廓的点直接用 c
DOT_ZONE = {
    '空1': rect(385, 699, 612, 864),
    '空2': union(rect(20, 470, 196, 673), rect(118, 700, 192, 782)),
    '岛4': poly([(352, 660), (566, 660), (566, 560), (513, 506), (513, 484), (440, 484), (352, 560)]),
    '说3': union(rect(404, 692, 630, 864), rect(486, 637, 630, 692)),
    '游4': rect(325, 668, 505, 862),
    '戏6': rect(690, 638, 912, 806),
}


def stone_of(shape, eps=0.055, keel=0.12, shrink=0.94):
    """一块浮石：取原来这一点的外形 → 凸包 → 削成六七刀刻面（点的走向、体量不变）→ 最低的一角往下拉成尖（石底）。
    略收小一点，四周多出一圈空，和投影一起读成“浮着”。"""
    pts = np.concatenate(flatten(shape, tol=1.0), 0)
    hull = cv2.convexHull(pts.astype(np.float32)).reshape(-1, 2)
    size = float(max(np.ptp(hull[:, 0]), np.ptp(hull[:, 1])))
    ap = cv2.approxPolyDP(hull.reshape(-1, 1, 2), eps * size, True).reshape(-1, 2).astype(float)
    c = ap.mean(0)
    ap = c + (ap - c) * shrink
    k = int(np.argmin(ap[:, 1]))
    ap[k] = ap[k] + np.array([-0.02 * size, -keel * size])
    return poly([tuple(q) for q in ap])


# 和别的笔画连着的点削成浮石以后，往外挪开一点，和相邻的笔画之间留一道空（浮着）
DOT_LIFT = {'空1': (0, 16), '空2': (-4, -12), '岛4': (-8, 12), '说3': (0, 14), '游4': (0, 14), '戏6': (6, 14)}


def make_stone(s):
    zone = DOT_ZONE.get(s.id)
    g = s.g
    if zone is not None:
        piece = inter(g.src, zone)
        g.ops.append(lambda p, z=zone: diff(p, z))
        st = stone_of(piece, shrink=0.9)
        dx, dy = DOT_LIFT.get(s.id, (0, 0))
        st = st.transform(1, 0, 0, 1, dx, dy)
    else:
        piece = s.piece
        g._remove(s)
        st = stone_of(piece)
    g.ops.append(lambda p, st=st: union(p, st))


# ====================================================================== 高潮：岛


ROCK_TOP = 26          # 岩体上沿（山的底横下沿在 y≈46，中间留一道缝）


def isle_root(detail='full'):
    """「岛」下面的东西（这个字自己的字体单位）：岩体、岩体的分面线、细根、晶簇、滴，和锚点。山一笔不动。"""
    t = ROCK_TOP
    rock = poly([
        (128, t), (582, t),
        (570, -26), (540, -84), (500, -150),
        (478, -250),                    # 右边的小尖
        (446, -186), (410, -176), (378, -250),
        (334, -392),                    # 主尖
        (296, -250), (262, -146), (228, -112),
        (196, -170),                    # 左边的小尖
        (172, -86), (146, -36),
    ])
    # 分面：岩体的几道棱（颜色层按它分出受光面和背光面）
    ridges = [[(350, t), (334, -392)], [(196, -170), (228, -112), (350, -40)], [(478, -250), (500, -150), (350, -40)]]
    out = {'rock': rock, 'ridges': ridges, 'top': t, 'tip': (334, -392)}
    if detail != 'full':
        out.update(roots=Path(), crystals=[], pebbles=[], drip=Path(), star=(334, -392), drip_tip=(334, -392))
        return out
    out['roots'] = union(
        taper_line([(214, -140), (204, -214), (218, -290), (206, -356)], HAIR * 0.75, 2),
        taper_line([(512, -130), (522, -196), (510, -256), (520, -310)], HAIR * 0.7, 2),
    )

    def crystal(c, length, width, tilt):
        cx, cy = c
        hw = width / 2
        pts = [(cx - hw, cy + 10), (cx + hw, cy + 10), (cx + hw, cy - length * 0.66), (cx, cy - length), (cx - hw, cy - length * 0.66)]
        return poly(_rot(pts, tilt, (cx, cy)))
    # 晶簇：从右边小尖和主尖之间的岩底垂下，三根六棱晶，最长的一根居中
    out['crystals'] = [
        crystal((420, -176), 214, 56, 6),       # 主晶
        crystal((388, -206), 132, 40, -16),     # 左小晶
        crystal((454, -204), 124, 38, 22),      # 右小晶
    ]
    # 翠绿的一滴：主尖下面，尖头朝上的水滴（刻面画）
    # 两粒浮在岩体旁边的小石子（群岛的小样）：平顶尖底，和岩体同料
    def pebble(cx, cy, s):
        return poly([(cx - s, cy + s * 0.35), (cx - s * 0.3, cy + s * 0.55), (cx + s, cy + s * 0.3),
                     (cx + s * 0.55, cy - s * 0.35), (cx + s * 0.1, cy - s * 1.1), (cx - s * 0.6, cy - s * 0.3)])
    out['pebbles'] = [pebble(36, -150, 34), pebble(668, -232, 24)]
    out['drip'] = poly([(334, -426), (348, -452), (348, -472), (334, -484), (320, -472), (320, -452)])
    out['star'] = (418, -370)
    out['drip_tip'] = (334, -484)
    return out


def isle_cut(p):
    """山的竖折转角下面那个小脚削平（岩体托在下面），底横成了一条平的地面"""
    return diff(p, rect(60, -40, 260, 44))


# ====================================================================== 一整行


def letters(detail='full'):
    """排版前的 Title（每个字的手术都挂好了）和「岛」的岩根（字体单位）。detail='small' 给小形态：岩根只留岩体。"""
    T = Title(FONT, TEXT, STROKES)

    # ---- 呼应：所有的点 → 小浮石（长点除外）
    for s in T.q(type='点').q(lambda s: '长点' not in s.tags):
        make_stone(s)

    # ---- 方言 1：楔形外张；U、I 的衬线
    T.q(lambda s: s.g.ch not in 'UI' and serif_apex(s) is not None).op(flare)
    T['U'].op(latin_serifs, ch='U')
    T['I'].op(latin_serifs, ch='I')

    # ---- 方言 2：圆头削尖
    T.q(tag='字脚').op(rock_foot)
    T.q(tag='圆收').op(wedge_cut, back=0.3, ext=0.3)
    T.q(type='提', part='氵').op(wedge_cut, which='start', back=0.18, ext=0.2, half=0.6)

    # ---- 高潮
    T['岛'].op(isle_cut)
    return T, isle_root(detail)

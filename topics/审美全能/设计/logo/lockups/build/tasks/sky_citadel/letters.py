"""05 天穹圣城 · 笔画处理（字体单位，1000 em，y 朝上）。底字思源宋体 Bold（比别题细一档，透气）。

方言「尖塔宋」，四个字统一做：
  1. 长体     字身收窄到 0.86（排版时只压横向，竖画跟着变细变挺，横画仍是发丝，见 __init__.place）；
  2. 塔尖     竖画出头的那一端（「城」土旁的竖、成的撇、戈的斜钩，「圣」土的竖）削成对称的塔尖，
              「城」的三根再往上延出一根收细的发丝，顶上一颗小圆珠：一个「城」字就是三座高低不一的尖塔；
  3. 小尖顶   横末、转角上的宋体三角拔高、收窄，像哥特屋檐上的小尖顶（pinnacle）；
  4. 点       「城」戈上那一点削成两头尖的晶片，和全组的锐利一致；
  5. 撇捺     保留宋体的弧，末端本来就尖，不磨圆。
高潮：「穹」的穴字头本来就是“顶下开口”的形，和穹顶同构——
  宀的横、左点、右钩原样留着做穹顶的鼓座和两侧的墩；宀顶的点升到穹顶尖上做采光亭（灯笼亭 + 尖顶 + 发丝塔尖，星芒落在尖上）；
  横上面起一座肋拱穹顶：外壳宋体式的粗细（两侧粗、顶上细），三道肋，肋间是玻璃；
  八的两笔各在下沿掏出一道弧，成两道飞扶壁；
  「弓」三笔完整保留，末钩的尖再挑长一点，钩上挂一串锚链（锚链在 __init__ 里按舞台坐标排，接着伸进画面）。
"""
import math
import numpy as np
from lockupkit.geom import union, diff, inter, poly, rect, circle
from lockupkit.strokes import Title
from lockupkit.surgery import fin, serif_apex
from lockupkit import paths
from .strokes import STROKES

FONT = paths.SONG_BOLD
TEXT = '天穹圣城'
HAIR = 22            # 本题最细的笔画（横的厚度，字体单位）

# ---------------------------------------------------------------- 穹顶（「穹」的字体单位）
DOME = dict(cx=497, y0=716, a=256, h=134, side=60, top=20)


def _profile(cx, y0, a, h, n=64, p=0.62):
    """穹顶外形（右半边从底到顶）：y = y0 + h·(1-u²)^p，p>0.5 时顶上收得更尖一点"""
    pts = []
    for i in range(n + 1):
        u = 1 - i / n
        pts.append((cx + a * u, y0 + h * (1 - u * u) ** p))
    return pts


def _cap(cx, y0, a, h, p=0.62, n=64):
    """整个穹顶的外形（闭合）"""
    r = _profile(cx, y0, a, h, n, p)
    l = [(2 * cx - x, y) for x, y in reversed(r)]
    return poly(r + l[1:] + [(cx - a, y0 - 1), (cx + a, y0 - 1)])


def _band(pts, w0, w1):
    """沿一条折线画一道由 w0 收到 w1 的笔画"""
    pts = [np.array(q, float) for q in pts]
    n = len(pts)
    L, R = [], []
    for i, q in enumerate(pts):
        d = pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]
        d = d / (np.linalg.norm(d) + 1e-9)
        nv = np.array([-d[1], d[0]])
        w = w0 + (w1 - w0) * i / (n - 1)
        L.append(q + nv * w / 2)
        R.append(q - nv * w / 2)
    return poly([tuple(q) for q in L + R[::-1]])


def dome():
    """穹顶的几何：gold（外壳、肋、采光亭、尖顶）、glass（肋间的玻璃）、lamp（采光亭的玻璃窗）、tip（塔尖顶端）、spire（发丝塔尖）"""
    D = DOME
    cx, y0, a, h = D['cx'], D['y0'], D['a'], D['h']
    outer = _cap(cx, y0, a, h)
    inner = _cap(cx, y0 - 2, a - D['side'], h - D['top'])
    shell = diff(outer, inner)
    apex = y0 + h
    ribs = []
    for s in (-0.52, 0.52):
        # 子午线：在立面上是一条半宽 (a-side)·|s| 的椭圆弧，从顶收到底，宽从 13 渐到 26
        pts = []
        for i in range(33):
            th = math.radians(90 * i / 32)
            pts.append((cx + (a - D['side']) * s * math.cos(th) * 1.02, y0 + (h - D['top']) * math.sin(th) ** 0.9))
        ribs.append(_band(pts[::-1], 12, 26))
    ribs.append(_band([(cx, apex - 4), (cx, y0)], 14, 24))
    gold = union(shell, *ribs)
    glass = diff(inner, *ribs)
    # 采光亭：一个小鼓座（两扇窄窗）、一顶小尖盔、上面是发丝塔尖
    lw, lh = 44, 50
    base = apex - 8
    lantern = union(rect(cx - lw, base, cx + lw, base + lh),
                    rect(cx - lw - 10, base + lh - 2, cx + lw + 10, base + lh + 10))       # 檐口
    lamp = union([rect(cx + dx - 6, base + 10, cx + dx + 6, base + lh - 10) for dx in (-17, 17)])
    lantern = diff(lantern, lamp)
    top0 = base + lh + 10
    helm = poly([(cx - lw - 4, top0), (cx + lw + 4, top0), (cx + 10, top0 + 30), (cx + 5, top0 + 62), (cx, top0 + 78),
                 (cx - 5, top0 + 62), (cx - 10, top0 + 30)])
    gold = union(gold, lantern, helm)
    tip0 = (cx, top0 + 70)
    # 发丝塔尖：从尖盔往上收细，中间一颗圆珠（十字架上的圣球），顶端是星
    spire = union(_band([tip0, (cx, top0 + 210)], HAIR * 0.9, 5), circle(cx, top0 + 118, 15))
    tip = (cx, top0 + 212)
    return {'gold': gold, 'glass': glass, 'lamp': lamp, 'spire': spire, 'tip': tip, 'apex': (cx, apex), 'base_y': y0,
            'lamp_c': (cx, base + lh / 2)}


# ---------------------------------------------------------------- 方言的手术


def piece_x(s, y, tol=3):
    """这一笔切出来的形在高度 y 上的左右范围"""
    b = inter(s.piece, rect(-300, y - tol, 1300, y + tol)).bounds
    return b[0], b[2]


def spire_top(p, s, y_cut, height, xs=None, lean=0.0):
    """竖画出头的那一端削成塔尖：y_cut 以上换成一个对称的尖（高 height），只动这一笔切出来的形"""
    x0, x1 = xs or piece_x(s, y_cut)
    top = inter(s.piece, rect(x0 - 40, y_cut, x1 + 40, 1400))
    p = diff(p, top)
    cx = (x0 + x1) / 2 + lean
    return union(p, poly([(x0, y_cut - 2), (x1, y_cut - 2), (x1 - (x1 - x0) * 0.08, y_cut + height * 0.35),
                          (cx, y_cut + height), (x0 + (x1 - x0) * 0.08, y_cut + height * 0.35)]))


def spire_hair(x, y, length, bead=18):
    """塔尖上的发丝：从 HAIR 收到很细，顶端一颗小圆珠，再一小截针尖"""
    top = y + length
    return union(_band([(x, y - 30), (x, top)], HAIR, 7), circle(x, top + bead * 0.7, bead),
                 _band([(x, top + bead * 1.4), (x, top + bead * 1.4 + 34)], 7, 1))


def arch_cut(p, s, center, r):
    """飞扶壁：在这一笔的下沿掏一道圆弧（只掏这一笔自己的形）"""
    return diff(p, inter(circle(center[0], center[1], r), s.piece))


def shard(tail, head, w, k=0.58):
    (x0, y0), (x1, y1) = tail, head
    dx, dy = x1 - x0, y1 - y0
    L = math.hypot(dx, dy)
    nx, ny = -dy / L, dx / L
    mx, my = x0 + dx * k, y0 + dy * k
    return poly([(x0, y0), (mx + nx * w / 2, my + ny * w / 2), (x1, y1), (mx - nx * w / 2, my - ny * w / 2)])


# 塔尖：哪一笔、在哪儿下刀、尖多高、发丝多长（发丝 0 = 只削尖）
SPIRES = {
    '城2': dict(y_cut=770, height=128, hair=150),
    '城5': dict(y_cut=640, height=104, hair=70, xs=(346, 453)),
    '城7': dict(y_cut=778, height=150, hair=250, xs=(651, 760)),
    '圣4': dict(y_cut=338, height=84, hair=0, xs=(427, 549), lean=10),
}


def letters(detail='full'):
    """返回 (Title, extra)：Title 的每个字都挂好了手术；extra 是穹顶的几何和锚点（字体单位，「穹」自己的坐标）"""
    T = Title(FONT, TEXT, STROKES)
    big = detail == 'full'
    extra = {}

    # ---- 方言 3：横末、转角上的三角拔成小尖顶
    T.q(lambda s: serif_apex(s) is not None and s.part != '弓').exclude('城1').op(fin, dx=-8, dy=42, r=30)

    # ---- 方言 2：竖画出头处削成塔尖；「城」的三根延出发丝
    for sid, c in SPIRES.items():
        T.s(sid).op(spire_top, y_cut=c['y_cut'], height=c['height'], xs=c.get('xs'), lean=c.get('lean', 0.0))

    # 塔尖的位置（排完再用）：中心 x、尖顶 y
    for sid, c in SPIRES.items():
        s = T.s(sid)
        if c.get('xs'):
            x0, x1 = c['xs']
        else:
            x0, x1 = piece_x(s, c['y_cut'])
        cx = (x0 + x1) / 2 + c.get('lean', 0.0)
        s.g.anchors[sid + '.tip'] = (cx, c['y_cut'] + c['height'])
        if big and c['hair']:
            s.add(spire_hair(cx, c['y_cut'] + c['height'], c['hair']))

    # ---- 方言 4：「城」戈的点 → 两头尖的晶片
    T.s('城9').variant(lambda s: shard((805, 818), (944, 652), 96))

    # ---- 高潮：「穹」
    Q = T['穹']
    D = dome()
    extra['dome'] = D
    T.s('穹1').variant(None)                                  # 宀顶的点升到穹顶尖上，成采光亭
    Q.op(lambda p: diff(p, rect(380, 723, 640, 900)))              # 点贴着横的那一小截也拿掉
    Q.op(lambda p: union(p, D['gold']))
    if big:
        Q.op(lambda p: union(p, D['spire']))
    Q.anchors['tip'] = D['tip']
    Q.anchors['lamp'] = D['lamp_c']
    # 八 → 两道飞扶壁：下沿各掏一道弧
    T.s('穹4').op(arch_cut, center=(345, 261), r=300)
    T.s('穹5').op(arch_cut, center=(559, 341), r=260)
    # 弓的末钩：钩尖再挑长一点，钩上挂锚链
    Q.op(lambda p: union(p, poly([(590, 27), (400, 52), (500, 15)])))
    Q.anchors['hook'] = (410, 50)
    return T, extra

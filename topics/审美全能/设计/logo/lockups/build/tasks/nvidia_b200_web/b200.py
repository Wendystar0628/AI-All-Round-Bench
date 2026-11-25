"""04 · B200 四个字形的构造（Libre Bodoni 粗体的骨架，字体单位 1000 em，y 朝上，基线 0）。

方言「走线 Didone」：Didone 的竖轴高对比留着（粗竖、发丝横），但整套字按电路板的布线规矩重新画——
  1. 只走 0°、45°、90°：碗、字腔、肩全换成直边，转角一律 45° 斜接（布线不走直角，也不走弧）；
  2. 粗的地方是铜箔（铺铜），细的地方是走线：发丝横、肩、字腔顶底都收成同一根走线的宽 t，
     粗竖到发丝之间是一段 45° 的渐收（布线里焊盘接走线的泪滴）；
  3. 发丝衬线的空端头是过孔：B 的两枚左衬线、2 的竖钩；2 的球形收笔本来就是一枚圆，画成焊盘（带钻孔）。
高潮：第二个 0 的字腔是一块晶粒（die），里面是点阵；它底下那根发丝往右伸出去，就是沿基线走的那根走线（排版里接）。

这里只交几何：每个字形 {'body': 铜的轮廓, 'vias': [(x, y, r, 孔半径)], 'anchors': {…}, 'die_box': 字腔的框（只有 0#2）}。
"""
import math
from lockupkit.geom import union, diff, poly, rect, circle, stroke_line

R2 = math.sqrt(2)
CAP = 740          # B200 统一的高（帽线）；NVIDIA 坐在这条线上
ADV = {'B': 706, '2': 600, '0': 632}


def octo(x0, y0, x1, y1, tl=0.0, tr=0.0, br=0.0, bl=0.0):
    """四角各自 45° 斜切的矩形（切去的直角边长）"""
    pts = []
    pts += [(x0, y1 - tl), (x0 + tl, y1)] if tl else [(x0, y1)]
    pts += [(x1 - tr, y1), (x1, y1 - tr)] if tr else [(x1, y1)]
    pts += [(x1, y0 + br), (x1 - br, y0)] if br else [(x1, y0)]
    pts += [(x0 + bl, y0), (x0, y0 + bl)] if bl else [(x0, y0)]
    return poly(pts)


def shoulder(s, t, ci):
    """外角斜切多少，才能让肩上那一段正好是一根走线宽 t：s 是粗边的厚，ci 是字腔那个角的斜切"""
    return s + t - t * R2 + ci


def trace(pts, w, cap='butt'):
    return stroke_line(pts, w, cap=cap, join='miter')


def glyph_B(t, via_r):
    x0, stem = 112, 160                 # 主竖
    xs = x0 + stem
    yw = 384                            # 腰线（上下两碗交接的那根发丝）
    su, sl = 148, 172                   # 上碗、下碗右边的厚
    ou, ol = 640, 672                   # 上碗、下碗外缘
    up_o = octo(xs - 2, yw - t / 2, ou, CAP, tr=shoulder(su, t, 34), br=124)
    up_i = octo(xs, yw + t / 2, ou - su, CAP - t, tr=34)
    lo_o = octo(xs - 2, 0, ol, yw + t / 2, tr=118, br=shoulder(sl, t, 56))
    lo_i = octo(xs, t, ol - sl, yw - t / 2, br=56)
    body = union(rect(x0, 0, xs, CAP), diff(up_o, up_i), diff(lo_o, lo_i))
    # 两枚左衬线：从主竖往左伸出去一段走线，端头一枚过孔
    vx = 26
    body = union(body, trace([(vx, CAP - t / 2), (x0 + 4, CAP - t / 2)], t), trace([(vx, t / 2), (x0 + 4, t / 2)], t))
    vias = [(vx, CAP - t / 2, via_r), (vx, t / 2, via_r)]
    return {'body': body, 'vias': vias, 'anchors': {'serif_top': (vx, CAP - t / 2), 'serif_bot': (vx, t / 2)}}


def glyph_2(t, via_r, s=160, xr=560, d=76, pad=(142, 500, 74), yb=132, y_r=420):
    """2：左上一枚焊盘（Didone 的球形收笔）→ 走线 45° 爬上去、过顶 → 右边粗弧 → 45° 斜笔 → 厚底座 → 右端竖钩（过孔）"""
    px, py, pr = pad
    x0 = px - t / 2                      # 左边那根走线落在焊盘正上方
    tl = 92
    top_ci = 40
    top_o = octo(x0, y_r + 20, xr, CAP, tl=tl, tr=shoulder(s, t, top_ci))
    top_i = octo(x0 + t, 200, xr - s, CAP - t, tl=tl - t * (2 - R2), tr=top_ci)
    arc = diff(top_o, top_i)
    arc = diff(arc, rect(x0 - 10, 0, x0 + t + 10, py))          # 焊盘以下不要
    # 斜笔：外缘过 (xr, y_r) 的 45° 线；内缘与它平行、相距 d
    b1 = y_r - xr
    b2 = b1 + d * R2
    diag = poly([(xr, y_r + 30), (xr, y_r), (yb - b1, yb), (yb - b2, yb), (xr - s, xr - s + b2), (xr - s, y_r + 30)])
    # 底座：一整块厚铜，左端顺着斜笔的内缘一刀 45° 落到基线；右端一根竖钩往上，端头过孔
    base = poly([(-b2, 0), (xr, 0), (xr, yb), (yb - b2, yb)])
    bx = xr - t / 2
    by = 250
    beak = trace([(bx, yb - 4), (bx, by)], t)
    body = union(arc, diag, base, beak, circle(px, py, pr))
    vias = [(px, py, pr, pr * 0.36), (bx, by, via_r)]
    return {'body': body, 'vias': vias, 'anchors': {'pad': (px, py), 'beak': (bx, by)}}


def glyph_0(t, via_r, die=False):
    x0, x1 = 34, 604
    s = 150
    ci = 58
    co = shoulder(s, t, ci)
    o = octo(x0, 0, x1, CAP, co, co, co, co)
    i = octo(x0 + s, t, x1 - s, CAP - t, ci, ci, ci, ci)
    g = {'body': diff(o, i), 'vias': [], 'anchors': {'center': ((x0 + x1) / 2, CAP / 2), 'bottom_right': (x1 - co, t / 2)}}
    if die:
        g['die_box'] = (x0 + s, t, x1 - s, CAP - t, ci)
    return g


def build(t, via_r):
    """B200 四个字形（字体单位）；排版时各自乘字号放进舞台"""
    return [('B', glyph_B(t, via_r)), ('2', glyph_2(t, via_r)), ('0', glyph_0(t, via_r)), ('0', glyph_0(t, via_r, die=True))]

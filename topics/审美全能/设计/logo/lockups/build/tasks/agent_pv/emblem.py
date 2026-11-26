"""01 现代Agent概念PV · 主体元素：刚按下去的回车键（舞台坐标）。

一枚背光键帽，正面略俯视：外圈是键帽的裙边（正面那一截是半透的布丁裙），里面一块微凹的顶面；顶面上印着回车的箭头 ⏎，
箭头按这一套字的笔画画——一笔粗竖往下、一笔发丝横往左、一枚宋体横末那样的三角箭头；左上角印一行 RETURN。
键帽底下的背光从裙边漏出来，和光标、Agent 同一种光。
放法：接在第二行「概念PV」末尾、g 的下行右边——整行敲完，按下回车。
"""
from lockupkit.geom import union, poly, rect, circle


def rrect(x0, y0, x1, y1, r):
    """圆角矩形"""
    r = min(r, (x1 - x0) / 2, (y1 - y0) / 2)
    parts = [rect(x0 + r, y0, x1 - r, y1), rect(x0, y0 + r, x1, y1 - r)]
    for cx, cy in ((x0 + r, y0 + r), (x1 - r, y0 + r), (x0 + r, y1 - r), (x1 - r, y1 - r)):
        parts.append(circle(cx, cy, r))
    return union(parts)


def keycap(x0, y0, w, h, hair):
    """键帽（正面略俯视）。返回各部分的轮廓（舞台坐标）和几个要用的点。hair 是本题的线宽（最细笔画）。
      skirt  整个键帽的外形（脚印）      face  顶面（微凹，印着箭头；它下面露出来的一截裙边是布丁裙）
      legend 回车箭头                   legend_c 箭头的中心      label_at RETURN 的位置"""
    x1, y1 = x0 + w, y0 + h
    e = {'box': (x0, y0, x1, y1)}
    e['skirt'] = rrect(x0, y0, x1, y1, 14)
    side, low = 11, 25
    fx0, fy0, fx1, fy1 = x0 + side, y0 + 1, x1 - side, y1 - low
    e['face_box'] = (fx0, fy0, fx1, fy1)
    e['face'] = rrect(fx0, fy0, fx1, fy1, 10)
    # 回车箭头：粗竖从上往下，转成发丝横往左，三角箭头（按这一套字的笔画画：粗竖、发丝横、宋体横末那样的三角）
    fw, fh = fx1 - fx0, fy1 - fy0
    vx = fx0 + fw * 0.78
    vt, vb = fy0 + fh * 0.26, fy0 + fh * 0.66
    sw = max(5.0, hair * 1.8)
    hw = max(1.6, hair * 0.72)
    ax = fx0 + fw * 0.42
    head_l, head_h = fh * 0.26, fh * 0.32
    stem = rect(vx - sw / 2, vt, vx + sw / 2, vb + hw / 2)
    bar = rect(ax + head_l * 0.6, vb - hw / 2, vx, vb + hw / 2)
    head = poly([(ax, vb), (ax + head_l, vb - head_h / 2), (ax + head_l * 0.8, vb), (ax + head_l, vb + head_h / 2)])
    nib = poly([(vx - sw / 2, vt), (vx + sw / 2 + 1.6, vt - 2.6), (vx + sw / 2 + 1.6, vt + 4.2), (vx + sw / 2, vt + 5.2)])
    e['legend'] = union(stem, bar, head, nib)
    e['legend_c'] = ((ax + vx) / 2, (vt + vb) / 2)
    e['label_at'] = (fx0 + 9, fy0 + 14)
    return e

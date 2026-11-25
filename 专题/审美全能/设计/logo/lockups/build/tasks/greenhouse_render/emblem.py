"""03 · 主体元素：台面线上一只陶土花盆，盆里一枝石膏马蹄莲（舞台坐标，y 朝下）。

放法：插在第二段末尾，「室」的右边，盆底坐在台面线上；花茎往上，佛焰苞朝左上（迎着夕光、朝着题名）张开，
高出第一段的顶，是整块剪影唯一的突起。花和叶是石膏（和「至」同料），盆是陶土（全件唯一的点缀色）。
画法是图鉴的铜版线：每一片都有一圈利落的墨线，里面平敷两档（受光、背光），不画写实光影。
"""
import numpy as np
from lockupkit.geom import union, poly
from . import shapes as SH


def _flip(pts):
    return [(float(x), float(y)) for x, y in pts]


def pot(base_c, base_y, top_w=80, bot_w=58, h=74, rim_h=17):
    """陶土花盆：卷边的盆沿、略收的盆身、底下一道垫脚。返回 {'body', 'rim', 'foot', 'groove', 'mouth', 'top_y'}"""
    cx = base_c
    y1 = base_y                 # 盆底（台面线）
    y0 = base_y - h             # 盆口
    body = poly([(cx - top_w / 2 + 4, y0 + rim_h), (cx + top_w / 2 - 4, y0 + rim_h),
                 (cx + bot_w / 2, y1 - 3), (cx - bot_w / 2, y1 - 3)])
    rim = poly([(cx - top_w / 2 - 3, y0 + 2), (cx + top_w / 2 + 3, y0 + 2), (cx + top_w / 2 + 1, y0 + rim_h),
                (cx - top_w / 2 - 1, y0 + rim_h)])
    foot = poly([(cx - bot_w / 2 - 2, y1 - 4), (cx + bot_w / 2 + 2, y1 - 4), (cx + bot_w / 2 - 1, y1), (cx - bot_w / 2 + 1, y1)])
    mouth = poly([(cx - top_w / 2 + 2, y0 - 1), (cx + top_w / 2 - 2, y0 - 1), (cx + top_w / 2 - 6, y0 + 3), (cx - top_w / 2 + 6, y0 + 3)])
    return {'body': union(body, foot), 'rim': rim, 'mouth': mouth, 'top_y': y0, 'cx': cx, 'w': top_w, 'h': h,
            'box': (cx - top_w / 2 - 3, y0, cx + top_w / 2 + 3, y1)}


def calla(stem_root, bloom_base, scale=1.0):
    """石膏马蹄莲：一根花茎、一片佛焰苞（喇叭口朝左上迎着夕光，背脊往上收成一个往后翻的利尖）、喉里一根肉穗。
    返回 {'stem', 'spathe', 'throat', 'spadix', 'tip', 'base'}。坐标是舞台的（y 朝下）"""
    k = scale
    bx, by = bloom_base
    rx, ry = stem_root
    stem_spine = SH.chain(((rx, ry), (rx + 1, ry - 50), (bx + 10, by + 60), (bx, by)))
    stem = SH.ribbon(stem_spine, [8.0 * k, 7.0 * k, 6.0 * k])

    def P(x, y):
        return (bx + x * k, by - y * k)
    # 局部坐标 y 朝上，花托在原点。背脊：从花托往右上鼓、再往上收到苞尖；苞尖往右后方翻一下（利尖）
    back = SH.chain((P(-3, 0), P(12, 14), P(26, 46), P(28, 82)),
                    (P(28, 82), P(29, 112), P(22, 136), P(14, 154)),
                    (P(14, 154), P(16, 160), P(20, 165), P(25, 168)))
    # 口沿：从苞尖往左下翻出去（先略凹、再鼓），到最左最低的那一卷，再收回花托
    lip = SH.chain((P(25, 168), P(12, 158), P(2, 140), P(-14, 126)),
                   (P(-14, 126), P(-34, 110), P(-60, 104), P(-72, 88)),
                   (P(-72, 88), P(-80, 76), P(-74, 62), P(-58, 56)),
                   (P(-58, 56), P(-40, 48), P(-24, 34), P(-12, 18)),
                   (P(-12, 18), P(-8, 10), P(-6, 4), P(-3, 0)))
    spathe = poly(_flip(list(back) + list(lip[1:])))
    # 喉部：口沿里面看得见的内壁（背光）。外沿贴着口沿往里一点，内沿是远处那一面的内壁
    throat = poly(_flip(list(SH.chain((P(8, 150), P(-2, 134), P(-16, 120), P(-34, 108)),
                                       (P(-34, 108), P(-54, 98), P(-66, 90), P(-68, 78)),
                                       (P(-68, 78), P(-58, 70), P(-38, 70), P(-20, 78)),
                                       (P(-20, 78), P(-4, 88), P(10, 108), P(14, 128)),
                                       (P(14, 128), P(15, 140), P(12, 146), P(8, 150))))))
    # 肉穗：从喉里斜着伸出来，头收尖
    spadix = SH.ribbon(SH.chain((P(-14, 72), P(-17, 84), P(-24, 96), P(-33, 110))), [7.0 * k, 6.4 * k, 1.6 * k])
    return {'stem': stem, 'spathe': spathe, 'throat': throat, 'spadix': spadix, 'tip': P(25, 168), 'top': P(14, 168),
            'base': P(0, 0)}


def leaf(root, tip, w, bend, belly=0.46):
    """马蹄莲的叶：一根叶柄，叶片是宽的箭头形——两头尖（和叶点同形，大一号），最宽处靠近叶基"""
    root, tip = np.asarray(root, float), np.asarray(tip, float)
    d = tip - root
    mid = root + d * 0.22
    petiole = SH.ribbon([tuple(root), tuple(mid + d * 0.04)], [6.0, 5.0])
    blade = SH.leaf(tuple(mid - d * 0.02), tuple(tip), w, belly=belly, bend=bend, sharp=1.1)
    return union(petiole, blade), (mid + d * 0.04, tip - d * 0.08)


def emblem(table_y, pot_cx):
    """主体元素：花盆坐在台面线上（盆底 = table_y），盆里一枝马蹄莲。返回各部分（舞台坐标）"""
    P = pot(pot_cx, table_y)
    top = P['top_y']
    C = calla((pot_cx + 2, top + 2), (pot_cx + 8, top - 104))
    L1, v1 = leaf((pot_cx - 6, top + 2), (pot_cx - 70, top - 128), 34, bend=-0.07)
    L2, v2 = leaf((pot_cx + 10, top + 2), (pot_cx + 62, top - 96), 28, bend=0.08)
    return {'pot': P, 'calla': C, 'leaves': [L1, L2], 'veins': [v1, v2],
            'plaster': union(C['spathe'], C['stem'], L1, L2),
            'box': (pot_cx - 80, top - 300, pot_cx + 90, table_y)}

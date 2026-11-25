"""06 鹈鹕的二十二种画法 · 笔画处理（字体单位，1000 em，y 朝上）。剪纸条的构造写在 paper.py。

方言「剪纸条宋」：以思源宋体 Heavy 为骨架，九个字（连同空隙里的「二十二种」）每一笔都是一条剪下来的纸条——
  1. 一笔一条   每一笔单独裁出来，交叉处一条压一条（按笔顺，后写的压在上面），丁字和拐角处盖上去一截；
  2. 直刀       曲线剪成几刀直边，长边分成几刀，刀与刀之间一个小折角；
  3. 刀口       竖的圆字脚一刀斜剪（左低右高，全组同一把剪刀的方向）；撇、点、钩的尖本来就是剪出来的尖；
  4. 加宽       发丝横上下各加厚 THICK，剪得出来，横竖对比从 1:4 降到 1:2.7；
  5. 手贴       每一条转一点、挪一点。
呼应：两个「鸟」里的点（鸟的眼睛）都剪成打孔的圆眼——一片纸白的圆、一颗黑眼珠。
高潮：「鹕」的竖折折钩，下半截剪成一块红纸喉囊：鸟字底下那一横就是下喙，竖折折钩往下兜回来的钩正好是喉囊兜在下喙下面的形，
      把它剪得更饱满（往下多坠一点、钩尖探到下喙尖下面），用剪纸红，喉囊下沿再垫一片深一档的红；上半截仍是黑纸，接缝是一刀斜剪。
      全件唯一的星落在「鹕」的眼珠上（眼睛里的那点光）。
"""
import math
import numpy as np
from lockupkit.strokes import Title
from lockupkit.geom import union, diff, poly, circle, rect
from lockupkit import paths
from . import paper as P
from .strokes import STROKES

FONT = paths.SONG_HEAVY
TEXT = '鹈鹕的二十二种画法'

THICK = 8.0        # 横上下各加厚
FACET = 10.0       # 直刀：曲线偏差
SNIP = 210.0       # 一刀剪多长
EYE_R, PUPIL_R = 50.0, 22.0


def _horizontalish(s):
    return any(abs(s.axis[k + 1][1] - s.axis[k][1]) < 0.25 * abs(s.axis[k + 1][0] - s.axis[k][0]) + 1 and s.ws[k] < 45
               for k in range(len(s.axis) - 1))


def pouch():
    """「鹕」的喉囊：竖折折钩下半截剪成一只兜在下喙下面的袋子（剪纸红）。袋口贴着下喙（中间留一道缝，鸟字的形还在），
    袋底往下坠，袋尖探到下喙尖的下面。返回 (红纸, 深红的一道褶)"""
    outer = [(968, 214), (964, 110), (952, 22), (924, -50), (870, -102), (796, -130), (716, -122), (658, -94),
             (618, -54), (592, -6), (578, 48), (574, 100), (626, 92), (700, 94), (776, 98), (826, 108), (838, 140), (836, 186)]
    crease = [(916, -34), (870, -82), (800, -108), (726, -104), (672, -82), (636, -50), (650, -42), (686, -68),
              (736, -86), (802, -88), (858, -66), (902, -24)]
    return poly(outer), poly(crease)


def letters(detail='full', seed=6):
    """返回 (Title, 每个字的纸条 [{path, kind, id, z}], 锚点 {名字: (字序, 字体单位的点)})"""
    T = Title(FONT, TEXT, STROKES)
    rng = np.random.default_rng(seed)
    big = detail == 'full'
    out, anchors = [], {}
    for gi, g in enumerate(T):
        raw = P.cut_strips(g)
        strips = []
        for s in g.strokes:
            p = raw[s.n]
            kind = 'ink'
            if '眼' in s.tags:
                # 呼应：鸟的眼睛——打孔的圆眼。纸白的圆 + 黑眼珠（朝左上看，鸟头朝左）
                b = p.bounds
                c = ((b[0] + b[2]) / 2 + 6, (b[1] + b[3]) / 2 + 4)
                strips.append({'path': P.ngon_cut(c[0], c[1], EYE_R, 15, rng.uniform(0, 30), rng, 2.0), 'kind': 'white', 'id': s.id + '.eye', 'z': 50})
                pc = (c[0] - 14, c[1] + 10)
                strips.append({'path': P.ngon_cut(pc[0], pc[1], PUPIL_R, 11, rng.uniform(0, 30), rng, 1.2), 'kind': 'pupil', 'id': s.id + '.pupil', 'z': 50.1})
                anchors[g.label + '.eye'] = (gi, (pc[0] + 8, pc[1] + 9))
                continue
            if _horizontalish(s):
                p = P.thicken_v(p, THICK)
            if s.heading('end') == 'down' and s.type in ('竖',) and s.end_free:
                p = P.foot_snip(p, s, slant=1)
            hero = g.ch == '鹕' and '喉囊' in s.tags and big
            if hero:
                # 高潮：竖折折钩下半截换成红纸喉囊；上半截在喉部一刀斜剪
                p = P.halfplane_cut(p, (900, 196), (math.sin(math.radians(12)), -math.cos(math.radians(12))))
            p = P.facet(p, FACET)
            p = P.snips(p, rng, snip=SNIP)
            p = P.paste(p, rng)
            strips.append({'path': p, 'kind': kind, 'id': s.id, 'z': s.n})
            if hero:
                red, dark = pouch()
                strips.append({'path': P.paste(P.snips(red, rng, snip=SNIP), rng, rot=0.4, shift=2), 'kind': 'red', 'id': s.id + '.pouch', 'z': s.n + 0.2})
                strips.append({'path': P.snips(dark, rng, snip=SNIP, amp=1.5), 'kind': 'red_dk', 'id': s.id + '.crease', 'z': s.n + 0.3})
                anchors['pouch'] = (gi, (760, -30))
        # 笔顺就是贴的顺序；喉囊压在下喙下面：下喙（横）最后贴
        strips.sort(key=lambda d: d['z'])
        out.append(strips)
    return T, out, anchors

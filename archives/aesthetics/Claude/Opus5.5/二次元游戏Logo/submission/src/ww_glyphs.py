"""鸣潮 —— 字形（方言：钟声的包络 · 柳叶 / 悬针篆的笔法）。

方言（全组同一套规则）：
  笔形     每一笔是一次钟鸣的包络：起笔“急起”（很短的尖头迅速涨到最宽），收笔“余音”（长长地收成针尖）
           宽度 w(t) = Wm · A(t) · D(t)，A 是 60 单位的急起，D = (1-t)^0.55 的衰减——横竖撇捺折钩一律如此
  粗细     横 70，竖 82，斜 78：几乎等粗，靠包络起伏
  转角     圆转（钟声不断），折与钩的转角按一笔连续的包络走
  竖       悬针：收成长针尖，最长的几根竖向下多垂一截
  点       一律是短的柳叶（两头尖）
  骨架     字面收窄（0.9），重心上提，字形修长
  高潮     潮的氵 → 三段同心的声波弧：三点落在同一圈声波上（上点“\”、中点“|”、下提“/”）
  呼应     鸟的点也落在同一组同心圆上，弯成一小段弧
"""
import math
import numpy as np
from gb import Font, Word, G, fp
from strokes_data import WW_STROKES
from util import unit, ang_of, resample

WM = {'横': 74.0, '竖': 86.0, '撇': 82.0, '捺': 82.0, '提': 74.0, '折': 80.0, '钩': 80.0, '点': 66.0}
ATTACK = 60.0
SCALE_X = 0.90
LIFT = 18.0


def envelope(L, wm, attack=ATTACK, p=1.9, q=0.8, tail_min=1.2):
    """钟声包络：急起（attack 单位内从尖涨到最宽）→ 长身 → 余音收成针尖"""
    a = min(0.3, attack / max(L, 1))

    def w(t):
        x = min(1.0, t / a) if a > 0 else 1.0
        A = math.sqrt(max(0.0, 1.0 - (1.0 - x) ** 2))     # 圆的起笔：一滴水的头
        D = max(0.0, 1.0 - t ** p) ** q
        return max(wm * A * D, tail_min)
    return w


def leaf(L, wm):
    """点：两头尖的柳叶"""
    def w(t):
        return wm * math.sin(math.pi * min(max(t, 0), 1)) ** 0.8 + 0.5
    return w


def skel(p):
    """骨架变换：收窄、重心上提（字体单位）"""
    x, y = float(p[0]), float(p[1])
    x = 500 + (x - 500) * SCALE_X
    t = (y + 120) / 1000.0
    y = y + LIFT * math.sin(math.pi * min(max(t, 0), 1))
    return np.array([x, y])


def dense(P, step=5.0):
    """按弧长加密（宽度函数逐点取值，直笔也要有足够的点）"""
    P = np.asarray(P, float)
    L = float(np.sum(np.linalg.norm(np.diff(P, axis=0), axis=1)))
    n = max(8, int(L / step))
    return resample(P, n), L


def stroke_shape(s, ax, wm=None):
    P, L = dense(ax)
    wm = wm or WM.get(s.type, 76.0)
    if s.type == '点':
        fn = leaf(L, wm)
        return G.sweep(P, fn, cap0=None, cap1=None, join='round')
    fn = envelope(L, wm)
    return G.sweep(P, fn, cap0=None, cap1=None, join='round')


def round_corners_axis(ax, r=60.0):
    """折、钩的转角：用圆弧倒角（钟声不断）"""
    P = [np.asarray(p, float) for p in ax]
    if len(P) < 3:
        return P
    out = [P[0]]
    for i in range(1, len(P) - 1):
        a, b, c = P[i - 1], P[i], P[i + 1]
        d0, d1 = unit(b - a), unit(c - b)
        rr = min(r, np.linalg.norm(b - a) * 0.45, np.linalg.norm(c - b) * 0.45)
        p0, p1 = b - d0 * rr, b + d1 * rr
        for t in np.linspace(0, 1, 9):
            q = (1 - t) ** 2 * p0 + 2 * (1 - t) * t * b + t ** 2 * p1
            out.append(q)
    out.append(P[-1])
    return out


# 方言里直接给的中线（字体单位，骨架变换之前）
OVERRIDE = {
    # 鸣：口 的竖与横折、末横；鸟 的竖折折钩收尾
    '鸣1': [(120, 752), (120, 40)],
    '鸣7': [(472, 748), (472, 307), (887, 307), (880, 120), (852, -10), (760, -42), (680, -10)],
    # 潮：月 的撇与横折钩，竖向下多垂一截（悬针）
    '潮11': [(448, 252), (448, -150)],
    '潮12': [(698, 800), (698, 300), (688, 160), (660, 40), (600, -70)],
    '潮13': [(698, 760), (890, 760), (890, 20), (862, -40), (780, -52), (730, -20)],
}
HANG = {'鸣1', '潮11'}     # 悬针：向下多垂的竖


def build(fork_center_layout=None, place=None):
    """返回两个字；氵 的三点在组合里按声波圆心重画（需要 place 之后的版面坐标），这里先记下它们的中线"""
    F = Font(fp('SourceHanSansCN-Medium.otf'))
    W = Word(F, '鸣潮', WW_STROKES)
    out = []
    for g in W:
        items = []
        for s in g.strokes:
            raw = OVERRIDE.get(s.id) or [tuple(p) for p in s.axis]
            ax = [skel(p) for p in raw]
            if s.type in ('折', '钩') or len(ax) > 2:
                ax_r = round_corners_axis(ax, 70.0)
            else:
                ax_r = ax
            shape = stroke_shape(s, ax_r)
            items.append({'s': s, 'ax': ax, 'ax_r': ax_r, 'shape': shape})
        out.append({'ch': g.ch, 'char': g, 'items': items})
    return out


if __name__ == '__main__':
    import os
    from gb import WORK, proof
    res = build()
    items = []
    for r in res:
        items.append((r['ch'], G.union([it['shape'] for it in r['items']])))
    proof.compare(items, os.path.join(WORK, 'ww_big.png'), cell=560)
    print('ok')

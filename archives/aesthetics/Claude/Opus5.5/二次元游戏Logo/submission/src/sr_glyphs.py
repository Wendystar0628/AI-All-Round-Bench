"""崩坏：星穹铁道 —— 字形（方言：装饰艺术风的铁路铭牌字 · 发丝横 · 带刻线的粗竖 · 星点 · 前倾）。

方言（全组同一套规则）：
  对比     横是发丝（36），竖是粗柱（150）：横竖比约 1:4，横像钢轨，竖像轨枕
  构造     粗笔画中线上刻一道细槽（内线，宽 16）：一根粗笔看上去是一对并行的轨
  端头     竖与横都平切；撇收成尖；捺由细到粗、末端斜切；钩收成尖
  转角     发丝横与粗竖相接处方角：粗竖的顶齐到横的上沿
  点       一律换成四角星（星芒向内弯），和母题“星光”同族
  骨架     整体前倾 12°（列车前进的方向），重心略高
  高潮     道的平捺 → 一段铁轨：两根钢轨 + 轨枕，向右透视收窄，尽头是一颗星
  呼应     铁的捺带三道轨枕刻口；全组粗笔的内线是“轨”的弱化形
"""
import math
import numpy as np
from gb import Font, Word, G, fp
from strokes_data import SR_STROKES
from util import unit, ang_of

WH, WV = 30.0, 150.0
GROOVE = 16.0
SLANT = 12.0
WD_THICK, WD_THIN = 132.0, 30.0


def star4(c, r, rot=0.0, waist=0.26, n=12):
    """四角星：四个尖，边向内弯（用二次曲线拍平）"""
    c = np.asarray(c, float)
    pts = []
    for k in range(4):
        a0 = math.radians(rot + 90 * k)
        a1 = math.radians(rot + 90 * k + 90)
        tip0 = c + r * np.array([math.cos(a0), math.sin(a0)])
        tip1 = c + r * np.array([math.cos(a1), math.sin(a1)])
        mid = c + r * waist * np.array([math.cos((a0 + a1) / 2), math.sin((a0 + a1) / 2)])
        for t in np.linspace(0, 1, n, endpoint=False):
            q = (1 - t) ** 2 * tip0 + 2 * (1 - t) * t * mid + t ** 2 * tip1
            pts.append(q)
    return G.polygon(pts)


def straight(s):
    pts = [np.asarray(p, float) for p in s.axis]
    if s.type == '横':
        y = float(np.mean([p[1] for p in pts]))
        return [np.array([pts[0][0], y]), np.array([pts[-1][0], y])]
    if s.type == '竖':
        x = float(np.mean([p[0] for p in pts]))
        return [np.array([x, pts[0][1]]), np.array([x, pts[-1][1]])]
    if s.type in ('折', '钩'):
        out = [pts[0]]
        for a, b in zip(pts[:-1], pts[1:]):
            d = b - a
            an = ang_of(d) % 180
            q = b.copy()
            if an < 12 or an > 168:
                q[1] = out[-1][1]
            elif abs(an - 90) < 12:
                q[0] = out[-1][0]
            out.append(q)
        return out
    return pts


def seg_kind(d):
    an = ang_of(d) % 180
    if an < 12 or an > 168:
        return 'h'
    if abs(an - 90) < 12:
        return 'v'
    return 'd'


def taper_stroke(pts, w0, w1, cap1='point', smooth=10):
    P = np.asarray(pts, float)
    f = (lambda t: w0 + (w1 - w0) * t)
    c1 = G.cap_point(max(w1, 8) * 1.6) if cap1 == 'point' else None
    return G.sweep(P, f, cap0=None, cap1=c1, join='round', smooth=smooth if len(P) > 2 else 0)


def groove_for(pts, w_fn, L_min=90.0, trim=0.22):
    """粗笔中线上的刻槽：只在笔画宽于 L_min 的一段，两端各缩进 trim"""
    P = np.asarray(pts, float)
    seg = np.linalg.norm(np.diff(P, axis=0), axis=1)
    if seg.sum() < 60:
        return None
    from util import resample
    Q = resample(P, 40)
    T = np.linspace(0, 1, 40)
    keep = [(q, t) for q, t in zip(Q, T) if w_fn(t) >= L_min and trim * 0.6 <= t <= 1 - trim * 0.6]
    if len(keep) < 3:
        return None
    pts2 = [k[0] for k in keep]
    return G.sweep(pts2, GROOVE, cap0=G.cap_round(), cap1=G.cap_round(), join='round')


def stroke_shape(s, ax):
    """返回 (形, 槽)"""
    t = s.type
    if t == '横':
        return G.sweep(ax, WH), None
    if t == '竖':
        body = G.sweep(ax, WV)
        a, b = np.asarray(ax[0]), np.asarray(ax[-1])
        u = unit(b - a)
        L = float(np.linalg.norm(b - a))
        gr = G.sweep([a + u * min(70, L * 0.2), b - u * min(70, L * 0.2)], GROOVE, cap0=G.cap_round(), cap1=G.cap_round()) if L > 200 else None
        return body, gr
    if t == '撇':
        w0, w1 = WD_THICK, 24.0
        body = taper_stroke(ax, w0, w1, 'point')
        return body, groove_for(ax, lambda u: w0 + (w1 - w0) * u, 95, 0.25)
    if t == '捺':
        w0, w1 = 30.0, WD_THICK * 1.05
        body = taper_stroke(ax, w0, w1, None)
        # 捺脚：按水平线切平（和竖的底同一种收法）
        e = np.asarray(ax[-1], float)
        body = G.diff(body, G.rect(e[0] - 300, e[1] - 400, e[0] + 300, e[1] - WD_THICK * 0.18))
        return body, groove_for(ax, lambda u: w0 + (w1 - w0) * u, 95, 0.25)
    if t == '提':
        if len(ax) > 2 and seg_kind(np.asarray(ax[1]) - np.asarray(ax[0])) == 'v':
            v = G.sweep(ax[:2], WV)
            d = taper_stroke(ax[1:], 110, 22, 'point', 0)
            a, b = np.asarray(ax[0]), np.asarray(ax[1])
            u = unit(b - a)
            L = float(np.linalg.norm(b - a))
            gr = G.sweep([a + u * 70, b - u * 70], GROOVE, cap0=G.cap_round(), cap1=G.cap_round()) if L > 220 else None
            return G.union(v, d, G.rect(b[0] - WV / 2, b[1] - 10, b[0] + WV / 2, b[1] + 10)), gr
        return taper_stroke(ax, 104, 22, 'point', 0), None
    if t in ('折', '钩'):
        parts, grooves = [], []
        n = len(ax) - 1
        kinds = [seg_kind(np.asarray(ax[k + 1], float) - np.asarray(ax[k], float)) for k in range(n)]
        for k in range(n):
            a, b = np.asarray(ax[k], float), np.asarray(ax[k + 1], float)
            kind = kinds[k]
            last = k == n - 1
            if kind == 'h':
                # 发丝横：两端伸进相邻的粗竖里（方角）
                a2 = a - unit(b - a) * (WV / 2 if k > 0 and kinds[k - 1] == 'v' else 0)
                b2 = b + unit(b - a) * (WV / 2 if not last and kinds[k + 1] == 'v' else 0)
                parts.append(G.sweep([a2, b2], WH))
            elif kind == 'v':
                u = unit(b - a)
                # 粗竖：与发丝横相接的一端齐到横的外沿（方角）
                a2 = a - u * (WH / 2) if k > 0 and kinds[k - 1] == 'h' else a
                b2 = b + u * (WH / 2) if not last and kinds[k + 1] == 'h' else b
                if not last and kinds[k + 1] == 'd':
                    b2 = b + u * (WV * 0.12)
                parts.append(G.sweep([a2, b2], WV))
                L = float(np.linalg.norm(b - a))
                if L > 220:
                    grooves.append(G.sweep([a + u * 70, b - u * 70], GROOVE, cap0=G.cap_round(), cap1=G.cap_round()))
            else:
                # 斜段（钩、撇出的尾）：从前一段的粗竖里起笔，收成尖
                a2 = a
                if k > 0 and kinds[k - 1] == 'v':
                    a2 = a + unit(np.asarray(ax[k - 1], float) - a) * (WV * 0.42)
                    parts.append(G.rect(a[0] - WV / 2, a[1] - WV * 0.1, a[0] + WV / 2, a[1] + WV * 0.45))
                if last:
                    parts.append(taper_stroke([a2, b], WD_THICK * (0.95 if t == '钩' else 0.9), 12, 'point', 0))
                else:
                    parts.append(G.sweep([a2, b], WD_THICK * 0.85, join='round'))
        parts = [p for p in parts if p is not None]
        return G.union(parts), (G.union(grooves) if grooves else None)
    if t == '点':
        a, b = np.asarray(ax[0], float), np.asarray(ax[-1], float)
        c = (a + b) / 2
        L = float(np.linalg.norm(b - a))
        r = max(L * 0.62, 70.0)
        return star4(c, r, rot=90 + 0), None
    return G.sweep(ax, 60), None


# 个别笔画在方言里的中线（字体单位）
OVERRIDE = {
    # 穹：宀 的横钩 = 发丝横 + 粗钩；八 = 左撇 + 右长点（长点按捺的笔法画，不换星）；弓按方言理顺
    '穹3': [(150, 705), (830, 705), (772, 618)],
    '穹4': [(352, 600), (250, 532), (150, 478), (40, 425)],
    '穹5': [(540, 640), (700, 590), (790, 548), (850, 490)],
    '穹6': [(262, 467), (690, 467), (690, 300)],
    '穹7': [(300, 325), (690, 325)],
    '穹8': [(226, 420), (226, 190), (735, 190), (735, 10), (560, 44)],
    # 星的撇：去掉宋体撇头上那一小横
    '星5': [(282, 400), (238, 312), (170, 222), (60, 112)],
    # 崩：两个月的横折钩收尾理顺；山的竖折
    '崩2': [(180, 810), (180, 640), (790, 640)],
    '崩5': [(170, 515), (403, 515), (403, 10), (262, 52)],
    '崩9': [(605, 515), (845, 515), (845, 10), (702, 52)],
    # 坏：提取直
    '坏3': [(40, 168), (435, 350)],
    # 道：辶 的横折折撇
    '道10': [(40, 475), (215, 475), (215, 175), (62, -24)],
}
LONG_DOT = {'穹5'}      # 长点：按捺的笔法


def build(kind='main'):
    F = Font(fp('SourceHanSerifCN-Heavy.otf'))
    text = '星穹铁道' if kind == 'main' else '崩坏'
    W = Word(F, text, SR_STROKES)
    out = []
    for g in W:
        items = []
        for s in g.strokes:
            ax = [np.asarray(p, float) for p in (OVERRIDE.get(s.id) or straight(s))]
            if s.id in LONG_DOT:
                w0, w1 = 34.0, WD_THICK
                body = taper_stroke(ax, w0, w1, None)
                gr = groove_for(ax, lambda u: w0 + (w1 - w0) * u, 95, 0.25)
            else:
                body, gr = stroke_shape(s, ax)
            items.append({'s': s, 'ax': ax, 'shape': body, 'groove': gr})
        anchors = {}
        # 高潮：道的平捺 → 铁轨（在组合里画，因为它伸出字外）；这里把原来的捺拿掉，记下中线
        if g.ch == '道' and kind == 'main':
            for it in items:
                if it['s'].name == '平捺':
                    it['shape'] = G.Path()
                    it['groove'] = None
                    anchors['rail_axis'] = [tuple(map(float, p)) for p in it['ax']]
                    it['climax'] = True
        # 呼应：铁的捺上三道轨枕刻口
        if g.ch == '铁':
            for it in items:
                if it['s'].type == '捺':
                    P = it['ax']
                    from util import point_at
                    cuts = []
                    for tt in (0.52, 0.66, 0.8):
                        q, d = point_at(P, tt)
                        nrm = np.array([-d[1], d[0]])
                        cuts.append(G.slab(q - nrm * 90, q + nrm * 90, 13))
                    it['shape'] = G.diff(it['shape'], cuts)
                    it['groove'] = None          # 这一笔用轨枕刻口代替内线
                    it['echo'] = True
                    anchors['echo'] = [tuple(map(float, point_at(P, tt)[0])) for tt in (0.52, 0.66, 0.8)]
        shapes = []
        for it in items:
            sh = it['shape']
            if it['groove'] is not None and list(sh):
                sh = G.diff(sh, it['groove'])
            shapes.append(sh)
        for it in items:
            s = it['s']
            if s.type == '点':
                a, b = it['ax'][0], it['ax'][-1]
                anchors[f'{s.id}.star'] = tuple(map(float, (np.asarray(a) + np.asarray(b)) / 2))
        # 整体前倾：结构做好后整体斜切（以基线为轴）
        k = math.tan(math.radians(SLANT))
        sl = lambda p: p.transform(1, 0, k, 1, 0, 0)   # x' = x + k·y
        shapes = [sl(p) if list(p) else p for p in shapes]
        for it in items:
            it['ax_slant'] = [np.array([p[0] + k * p[1], p[1]]) for p in it['ax']]
        for kk, v in list(anchors.items()):
            if kk == 'rail_axis':
                anchors[kk] = [(x + k * y, y) for x, y in v]
            elif kk == 'echo':
                anchors[kk] = [(x + k * y, y) for x, y in v]
            elif isinstance(v, tuple) and len(v) == 2:
                anchors[kk] = (v[0] + k * v[1], v[1])
        path = G.union([p for p in shapes if list(p)])
        out.append({'ch': g.ch, 'char': g, 'items': items, 'shapes': shapes, 'path': path, 'anchors': anchors, 'adv': g.adv})
    return out


if __name__ == '__main__':
    import os
    from gb import WORK, proof
    for kind in ('main', 'series'):
        res = build(kind)
        proof.compare([(r['ch'], r['path']) for r in res], os.path.join(WORK, f'sr_{kind}_big.png'), cell=480)
        print('ok', kind)

"""明日方舟：终末地 —— 字形（方言：钢构件 · 等轴测角度集 · 拼缝）。

方言（全组同一套规则）：
  角度集   0° / 30° / 60° / 90°（等轴测制图的角度）：每一段笔画都吸附到 30° 的整数倍；弯笔折成直段（像弯折的钢条）
  粗细     横 108，竖 124，斜 116（横略细于竖）
  起笔     切口贴网格：取最接近垂直于笔画的水平线或竖线
  收笔     自由端一律斜切，切口与笔画轴线成 60°（垂直面转 30°）
  转角     尖角（焊接的折弯）
  点       两端都贴网格切的平行四边形（等轴测方块的一个面）
  构造     每一笔是一根独立的钢构件：相接、相交处留 16 的拼缝（模版喷涂的桥）；
           T 字接头里“顶上来”的那根让开，十字交叉里横让竖
  特征笔画 竖：每根竖上开一个 60° 三角减重孔（与高潮“桁架”同族）
"""
import math
import numpy as np
from gb import Font, Word, G, fp
from strokes_data import EF_STROKES
from util import snap_polyline, unit, ang_of, adiff, dir_of, half_plane

ANG = [i * 30 for i in range(12)]
WH, WV, WD = 108.0, 124.0, 116.0
GAP = 16.0
CUT_ROT = 30.0          # 收笔切口相对垂直面转的角度
PRIO = {'横': 0, '提': 1, '点': 1, '折': 2, '钩': 2, '撇': 3, '捺': 3, '竖': 4}


def seg_w(d):
    a = ang_of(d) % 180
    if a < 1 or a > 179:
        return WH
    if abs(a - 90) < 1:
        return WV
    return WD


def grid_face_normal(d):
    """起笔：切口贴网格——水平线或竖线里更接近“垂直于笔画”的那条；返回切口的外法向（指向笔画外）"""
    d = unit(d)
    # 候选外法向：(±1,0)（竖线切口）或 (0,±1)（水平线切口）
    cands = [np.array([1.0, 0]), np.array([-1.0, 0]), np.array([0, 1.0]), np.array([0, -1.0])]
    return max(cands, key=lambda n: float(n @ d))


def rot(v, deg):
    r = math.radians(deg)
    c, s = math.cos(r), math.sin(r)
    return np.array([v[0] * c - v[1] * s, v[0] * s + v[1] * c])


def cap_grid(p, d, w):
    """起笔回调：沿笔画往外延长，再按贴网格的切口切掉（d 为朝外方向）"""
    n = grid_face_normal(d)
    ext = G.slab(p, p + d * w * 1.2, w)
    # 切口过端点：外法向 n 一侧挖掉（只挖端头附近的一小块）
    cut = half_plane(p, n, size=w * 1.6, depth=w * 2.2)
    return ext, cut


def cap_slash(p, d, w):
    """收笔回调：延长后按“垂直面转 30°”的斜口切掉"""
    n = rot(unit(d), CUT_ROT)
    ext = G.slab(p, p + d * w * 1.2, w)
    cut = half_plane(p, n, size=w * 1.6, depth=w * 2.2)
    return ext, cut


def sweep_steel(pts, ws, cap0=cap_grid, cap1=cap_slash):
    return G.sweep(pts, ws, cap0=cap0, cap1=cap1, join='miter', miter=6.0)


def dot_shape(pts):
    """点：两端都贴网格切的平行四边形"""
    a, b = np.asarray(pts[0], float), np.asarray(pts[-1], float)
    return sweep_steel([a, b], [WD], cap0=cap_grid, cap1=cap_grid)


ALLOWED = {
    '撇': [270, 240, 210, 180],
    '捺': [270, 300, 330, 0],
    '点': [300, 330, 240, 210],
    '提': [30, 270],
    '折': ANG,
    '钩': ANG,
}

# 个别笔画在方言里直接给中线（字体单位）：末的撇捺是塔腿——先陡（60°）后缓（30°）的两折钢腿
OVERRIDE = {
    '末4': [(440, 300), (350, 144), (110, 5)],
    '末5': [(560, 300), (650, 144), (890, 5)],
    # 终的纟：基础字形太挤，按方言重新排开三笔（240° 的撇 + 水平的折；提取 30°）
    '终1': [(262, 845), (70, 512), (250, 512)],
    '终2': [(352, 700), (128, 312), (372, 312)],
    '终3': [(40, -12), (362, 197)],
    # 冬：横撇 = 横 → 短竖 → 240° → 210°；捺 = 300° → 330°
    '终5': [(600, 703), (812, 703), (812, 655), (700, 461), (520, 357)],
    '终6': [(530, 640), (620, 484), (950, 293)],
    '舟1': [(512, 862), (446, 735)],
}
# 不留拼缝的笔画（太挤的地方，强度降为 0）：终的第一笔撇折，折直接并进第二笔
NOSEAM = {'终1'}


def design_axis(s):
    """笔画中线 → 方言里的中线（吸附角度集）"""
    if s.id in OVERRIDE:
        return [np.asarray(p, float) for p in OVERRIDE[s.id]]
    pts = [np.asarray(p, float) for p in s.axis]
    if s.type == '横':
        y = float(np.mean([p[1] for p in pts]))
        return [np.array([pts[0][0], y]), np.array([pts[-1][0], y])]
    if s.type == '竖':
        x = float(np.mean([p[0] for p in pts]))
        return [np.array([x, pts[0][1]]), np.array([x, pts[-1][1]])]
    return snap_polyline(pts, ALLOWED.get(s.type, ANG))


def _closest_on(ax, q):
    """点 q 到折线 ax 的最近点：返回 (距离, 带符号的法向偏移, 段方向, 段法向)"""
    best = None
    for a, b in zip(ax[:-1], ax[1:]):
        a, b = np.asarray(a, float), np.asarray(b, float)
        ab = b - a
        L2 = float(ab @ ab)
        t = 0.0 if L2 < 1e-9 else max(0.0, min(1.0, float((q - a) @ ab) / L2))
        c = a + ab * t
        d = float(np.linalg.norm(q - c))
        u = unit(ab)
        n = np.array([-u[1], u[0]])
        off = float((q - c) @ n)
        if best is None or d < best[0]:
            best = (d, off, u, n, t)
    return best


def clamp_ends(items):
    """宽度改了以后，原来贴着别的笔画外沿的端头会冒出来：沿本笔方向收回，和对方的新外沿齐平"""
    for it in items:
        ax = it['ax']
        for which in (0, -1):
            E = np.asarray(ax[which], float)
            inward = unit(ax[1] - ax[0]) if which == 0 else unit(ax[-2] - ax[-1])
            for ot in items:
                if ot is it:
                    continue
                d, off, u, n, t = _closest_on(ot['ax'], E)
                wb_base = float(ot['s'].w)
                wb_new = seg_w(u)
                if d > wb_base / 2 + 6:
                    continue
                if abs(off) <= wb_new / 2:
                    continue
                k = float(inward @ n)
                if abs(k) < 0.3:
                    continue
                target = math.copysign(wb_new / 2, off)
                tt = (target - off) / k
                if 0 < tt < 120:
                    ax[which] = E + inward * tt
                    E = np.asarray(ax[which], float)


def cap_butt(p, d, w):
    """接在别的笔画上的端头：平头（不往外伸，转角处和对方外沿齐平）"""
    return None


def stroke_shape(s, axis=None, free0=True, free1=True):
    ax = axis if axis is not None else design_axis(s)
    if s.type == '点':
        return dot_shape(ax)
    ws = [seg_w(b - a) for a, b in zip(ax[:-1], ax[1:])]
    return sweep_steel(ax, ws, cap0=cap_grid if free0 else cap_butt, cap1=cap_slash if free1 else cap_butt)


def _ends(ax):
    return [np.asarray(ax[0], float), np.asarray(ax[-1], float)]


def apply_seams(items):
    """items: [{'s': stroke, 'ax': axis, 'shape': Path}]，按笔顺。返回拼缝后的形（列表），以及被切的对子"""
    shapes = [it['shape'] for it in items]
    orig = [G.Path(p) for p in shapes]
    fat = [G.offset(p, 6) for p in orig]
    pairs = []
    for i in range(len(items)):
        for j in range(i + 1, len(items)):
            if G.area(G.inter(orig[i], orig[j])) < 30:
                continue
            ei = any(fat[j].contains(tuple(map(float, e))) for e in _ends(items[i]['ax']))
            ej = any(fat[i].contains(tuple(map(float, e))) for e in _ends(items[j]['ax']))
            if items[i].get('noseam') or items[j].get('noseam'):
                continue
            # 只在 T 字接头留缝：一笔的端头顶在另一笔的身上；转角（两笔端头相接）和十字交叉不留
            if ej and not ei:
                cut = j
            elif ei and not ej:
                cut = i
            else:
                continue
            other = j if cut == i else i
            if items[cut].get('keep'):
                continue
            pairs.append((cut, other))
    for cut, other in pairs:
        shapes[cut] = G.diff(shapes[cut], G.offset(orig[other], GAP, 'miter'))
    return [G.drop_small(p, 400) for p in shapes], pairs


CHORD = 20.0     # 桁架弦杆（塔身两侧的边）
WEB = 15.0       # 腹杆（斜撑）宽：全件最细的笔画，细线也取这个宽


def truss_tris(x, ya, yb, w=WV, chord=CHORD, web=WEB):
    """竖条 [ya, yb] 里的 Warren 桁架孔：底边贴弦杆、尖顶到对面弦杆的三角孔，左右交替；腹杆是 30° 斜撑"""
    a = w - 2 * chord                      # 两弦杆之间的净宽
    half = a * math.tan(math.radians(30))  # 三角孔底边的一半（腹杆与水平成 30°）
    xl, xr = x - a / 2, x + a / 2
    tris = []
    y = ya + half
    left = True
    while y + half <= yb + 1e-6:
        if left:
            t = G.polygon([(xl, y - half), (xl, y + half), (xr, y)])
        else:
            t = G.polygon([(xr, y - half), (xr, y + half), (xl, y)])
        tris.append(G.offset(t, -web / 2, 'miter'))
        y += half
        left = not left
    return tris


def tri_hole(x, cy, w=WV):
    """特征笔画（呼应）：竖上开一小段和塔身同形的桁架孔（两个三角，一左一右）——塔身的弱化形"""
    a = w - 2 * CHORD
    half = a * math.tan(math.radians(30))
    return G.union(truss_tris(x, cy - half * 1.5, cy + half * 1.5))


# ------------------------------------------------------------------ 高潮：末的竖 → 中继塔塔身
def tower_mast(s, top_extra=500.0, bottom=-95.0, arms=(638.0, 388.0), arm_w=WH):
    """末的竖：桁架塔身（实心竖条里开 Warren 桁架孔），横担处保持实心；顶上收分的塔头 + 避雷杆。
    返回 (塔身轮廓, 信标点)"""
    x = float(np.mean([p[0] for p in s.axis]))
    w = WV
    y0, y1 = bottom, float(max(p[1] for p in s.axis))
    body = G.rect(x - w / 2, y0, x + w / 2, y1)
    # 整根塔身一条连续的 Warren 桁架（横担是另外的构件，压在桁架前面）
    ya, yb = y0 + 22, y1 - 22
    a = w - 2 * CHORD
    half = a * math.tan(math.radians(30))
    n = int((yb - ya) / half) - 1
    used = (n + 1) * half
    off = (yb - ya - used) / 2
    holes = truss_tris(x, ya + off, yb - off)
    mast = G.diff(body, holes) if holes else body
    top = y1
    head = G.polygon([(x - w / 2, top), (x + w / 2, top), (x + w * 0.18, top + 96), (x - w * 0.18, top + 96)])
    rod = G.rect(x - WEB / 2, top + 80, x + WEB / 2, top + top_extra)
    mast = G.union(mast, head, rod)
    beacon = (x, top + top_extra)
    return mast, beacon


def build(kind='main'):
    """kind='main'：终末地；'series'：明日方舟。返回 dict：chars（每字 {'ch','paths':[每笔 Path], 'path', 'anchors'}）"""
    F = Font(fp('SourceHanSansCN-Heavy.otf'))
    text = '终末地' if kind == 'main' else '明日方舟'
    W = Word(F, text, EF_STROKES)
    out = []
    for g in W:
        items = []
        for s in g.strokes:
            items.append({'s': s, 'ax': [np.asarray(p, float) for p in design_axis(s)]})
        clamp_ends(items)
        for it in items:
            it['shape'] = stroke_shape(it['s'], it['ax'])
        # 自由端才斜切：端头落在别的笔画身上（转角、接头）的，改成平头
        fat0 = [G.offset(it['shape'], 4) for it in items]
        for k, it in enumerate(items):
            ends = _ends(it['ax'])
            free = []
            for e in ends:
                inside = any(fat0[j].contains(tuple(map(float, e))) for j in range(len(items)) if j != k)
                free.append(not inside)
            it['free'] = free
            if not all(free):
                it['shape'] = stroke_shape(it['s'], it['ax'], free0=free[0], free1=free[1])
        for it in items:
            if it['s'].id in NOSEAM:
                it['noseam'] = True
        anchors = {}
        if g.ch == '末' and kind == 'main':
            # 竖是高潮：塔身，十字交叉里保持连续
            for it in items:
                if it['s'].type == '竖':
                    it['keep'] = True
        shapes, pairs = apply_seams(items)
        # 竖上的减重孔（特征笔画/呼应）
        for k, it in enumerate(items):
            s = it['s']
            if s.type != '竖':
                continue
            if g.ch == '末' and kind == 'main':
                mast, beacon = tower_mast(s)
                # 塔身是连续的主构件：横担（左右两臂）和塔腿都在它两侧让开一道拼缝
                shapes[k] = mast
                body = G.rect(anchors.get('mx0', 0), -200, 0, 0)  # 占位，下面用塔身外框
                mx = float(np.mean([p[0] for p in s.axis]))
                band = G.rect(mx - WV / 2 - GAP, -400, mx + WV / 2 + GAP, 1400)
                for j, o in enumerate(items):
                    if o['s'].type in ('横', '撇', '捺'):
                        shapes[j] = G.diff(shapes[j], band)
                anchors['beacon'] = beacon
                anchors['mast_x'] = float(np.mean([p[0] for p in s.axis]))
                continue
            if kind != 'main':
                continue          # 系列名字小，减重孔会糊成噪点：强度降为 0
            ax = it['ax']
            x = float(ax[0][0])
            ya, yb = sorted([float(ax[0][1]), float(ax[-1][1])])
            # 在竖的空段（没被别的笔画盖住、也不在拼缝里）找位置：取下三分之一处附近
            best = None
            for frac in np.linspace(0.18, 0.82, 33):
                cy = ya + (yb - ya) * frac
                hole = tri_hole(x, cy)
                ring = G.offset(hole, 18)
                if G.area(G.diff(ring, shapes[k])) < 5:
                    d = abs(frac - 0.33)
                    if best is None or d < best[0]:
                        best = (d, hole)
            if best is not None:
                shapes[k] = G.diff(shapes[k], best[1])
                anchors[f'{s.id}.hole'] = tuple(map(float, G.bounds(best[1])))
        # 端点记下来（细线、标注用）
        for k, it in enumerate(items):
            s = it['s']
            anchors[f'{s.id}.start'] = tuple(map(float, it['ax'][0]))
            anchors[f'{s.id}.end'] = tuple(map(float, it['ax'][-1]))
        path = G.union(shapes)
        out.append({'ch': g.ch, 'char': g, 'items': items, 'shapes': shapes, 'path': path, 'anchors': anchors,
                    'adv': g.adv, 'pairs': pairs})
    return out


if __name__ == '__main__':
    import os
    from gb import WORK, proof
    for kind in ('main', 'series'):
        res = build(kind)
        items = []
        for r in res:
            items.append((f"{r['ch']} 底字", r['char'].src))
            items.append((f"{r['ch']} 方言", r['path']))
        proof.compare(items, os.path.join(WORK, f'ef_{kind}_compare.png'), cell=300)
        print('ok', kind)

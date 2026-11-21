"""C 包：尺寸归属、特征见证和纸面摆放。审计及见证均为私有字段。

不回退到任意图线贴点的 legacy 算法，不画孤立见证十字。几何用视图
毫米，Marks 用纸面毫米；缺视图时返回逐 D 的结构化失败。
"""
import copy
import math
import re
from collections import Counter
from types import SimpleNamespace

import numpy as np

from drawing_common import DimensionAssignmentError, Marks, Occupancy, box_union, check_assembly_relation, g2, marks_bounds, text_box, visible_curve_overlap

TOL = .025  # 投影序列化容差，不是吸附半径。
END_EPS = 2e-5  # 图线端点以六位小数写出，斜投影的点积还会引入一次舍入。
# C-04：指挥逐项批准将这批缺加工端面的原 D 表述为刀具行程。
PROCESS_DEPTHS = {'13':{68,74}, '19':{152,164,176,188,195},
                  '21':{161,173,185,197,209,221,228}, '25':{173,185,197,209,221,233,240}}
PLANES = {'XY': ([1, 0, 0], [0, 1, 0]), 'XZ': ([1, 0, 0], [0, 0, 1]),
          'YZ': ([0, 1, 0], [0, 0, 1]), 'YX': ([0, 1, 0], [1, 0, 0]),
          'ZX': ([0, 0, 1], [1, 0, 0]), 'ZY': ([0, 0, 1], [0, 1, 0])}


def _unit(v):
    v = np.asarray(v, float)
    if np.linalg.norm(v) < 1e-10:
        raise ValueError('零长度方向')
    return v / np.linalg.norm(v)


def _project(point, c):
    p = np.asarray(point, float)-np.asarray(c.get('origin', [0, 0, 0]), float)
    return np.array([p@c['u'], p@c['v']])


def _frame(f):
    plane = f.get('plane', 'XY')
    if isinstance(plane, str):
        x, y = map(np.asarray, PLANES[plane])
        return np.asarray(f.get('origin', [0, 0, 0]), float), x, y, np.cross(x, y)
    n = _unit(plane['normal'])
    x = np.array(plane['x_dir'], float)
    x = _unit(x-n*(x@n))
    return np.array(plane.get('origin', f.get('origin', [0, 0, 0])), float), x, np.cross(n, x), n


def _cylinders(f):
    if f.get('type') not in ('extrude', 'hole'):
        return []
    o, x, y, n = _frame(f)
    if f['type'] == 'hole':
        if f.get('through') or isinstance(f.get('at', [0])[0], list):
            return []
        a, b, loops = -float(f['depth']), 0., [dict(circle=f['at'], d=f['d'])]
    else:
        a, b = f['depth']
        loops = f['loops']
    return [(o+x*lp['circle'][0]+y*lp['circle'][1]+n*a,
             o+x*lp['circle'][0]+y*lp['circle'][1]+n*b,
             float(lp.get('d', 2*lp.get('r', 0)))/2) for lp in loops if 'circle' in lp]


def _distance(c, point):
    p = np.asarray(point, float)
    if c['geom'] in ('circle', 'arc'):
        center = np.array(c['center'])
        angle = math.degrees(math.atan2(*(p-center)[::-1]))
        start, end = g2.span_of(c)
        if c['geom'] == 'circle' or (angle-start) % 360 <= end-start+1e-8:
            return abs(float(np.linalg.norm(p-center))-c['r'])
        return min(np.linalg.norm(p-center-c['r']*np.array([math.cos(a), math.sin(a)]))
                   for a in map(math.radians, (start, end)))
    pts = [c['from'], c['to']] if c['geom'] == 'line' else c['points']
    best = float('inf')
    for a, b in zip(pts, pts[1:]):
        a, b = np.array(a), np.array(b)
        v = b-a
        t = np.clip((p-a)@v/max(v@v, 1e-20), 0, 1)
        best = min(best, float(np.linalg.norm(p-a-v*t)))
    return best


def _visible(c):
    return c.get('type') in ('visible', 'cut')


def _retained(curve, visible):
    """分裂边允许多段连续覆盖；不能以离散采样跨过被遮住的一小段。"""
    if any(line == curve for line in visible):
        return True
    if curve['geom'] == 'polyline':
        return all(_retained(g2.line(a, b, 'visible'), visible)
                   for a, b in zip(curve['points'], curve['points'][1:]) if np.linalg.norm(np.subtract(b, a)) > 1e-8)
    overlaps = []
    for line in visible:
        overlaps.extend(visible_curve_overlap(curve, line))
    if not overlaps:
        return False
    return abs(sum(g2.length(c) for c in g2.merge(overlaps, priority=('visible',)))-g2.length(curve)) < 1e-4


def _datum_points(element, direction, coordinate):
    """坐标界线只能认出端点、平行轮廓、真形圆的极值或有轮廓支撑的轴线。"""
    c = element['curve']
    points = _intersections(c, direction, coordinate)
    if c['geom'] == 'line':
        ends = np.asarray([c['from'], c['to']])
        return [p for p in points if np.min(np.linalg.norm(ends-p, axis=1)) < TOL]
    if c['geom'] in ('arc', 'circle'):
        center = np.asarray(c['center'])
        return [p for p in points if abs(abs((p-center)@direction)-c['r']) < TOL]
    return [p for p in points if any(np.linalg.norm(np.subtract(end, p)) < TOL for end in (c['points'][0], c['points'][-1]))]


def _same_support(a, b):
    if a['geom'] in ('arc', 'circle') and b['geom'] in ('arc', 'circle'):
        return np.linalg.norm(np.array(a['center'])-b['center']) < TOL and abs(a['r']-b['r']) < TOL
    if a['geom'] == b['geom'] == 'line':
        x, y, p, q = map(np.array, (a['from'], a['to'], b['from'], b['to']))
        if min(np.linalg.norm(y-x), np.linalg.norm(q-p)) < TOL:
            return False
        e = _unit(y-x)
        n = np.array([-e[1], e[0]])
        return abs((p-x)@n) < TOL and abs((q-x)@n) < TOL
    return False


def _intersections(c, e, coordinate):
    out = []
    if c['geom'] in ('circle', 'arc'):
        center, r = np.array(c['center']), c['r']
        h = coordinate-center@e
        if abs(h) <= r+1e-8:
            n = np.array([-e[1], e[0]])
            for sign in (-1, 1):
                p = center+h*e+sign*math.sqrt(max(0, r*r-h*h))*n
                if _distance(c, p) < TOL:
                    out.append(p)
    else:
        pts = [c['from'], c['to']] if c['geom'] == 'line' else c['points']
        if len(pts)>4:
            pts = np.asarray(pts)
            values = pts@e-coordinate
            hits = list(pts[np.abs(values)<END_EPS])
            mask = values[:-1]*values[1:] < -1e-12
            frac = values[:-1][mask]/(values[:-1][mask]-values[1:][mask])
            hits.extend(pts[:-1][mask]+(pts[1:]-pts[:-1])[mask]*frac[:,None])
            return hits
        for a, b in zip(pts, pts[1:]):
            a, b = np.array(a), np.array(b)
            da, db = a@e-coordinate, b@e-coordinate
            if abs(da) < END_EPS:
                out.append(a)
            if abs(db) < END_EPS:
                out.append(b)
            if da*db < -1e-12:
                out.append(a+(b-a)*da/(da-db))
    return out


def _supports(f, c):
    """原特征表面的真实棱边、母线及与剖切平面的交线。"""
    out, direction = [], _unit(c['direction'])
    for a, b, r in _cylinders(f):
        axis = _unit(b-a)
        if abs(axis@direction) > 1-1e-7:
            out.append(g2.arc(_project(a, c), r, 0, 360, 'visible'))
        elif abs(axis@direction) < 1e-7:
            radial = _unit(np.cross(axis, direction))
            if c.get('section'):
                offset = (a-np.array(c['section']['point']))@direction
                if abs(offset) > r+TOL:
                    continue
                r = math.sqrt(max(0, r*r-offset*offset))
            for sign in (-1, 1):
                out.append(g2.line(_project(a+radial*r*sign, c), _project(b+radial*r*sign, c), 'visible'))
            for p in (a, b):
                out.append(g2.line(_project(p-radial*r, c), _project(p+radial*r, c), 'visible'))
    if f.get('type') != 'extrude':
        return out

    o, x, y, n = _frame(f)
    for loop in f['loops']:
        if 'rect' in loop:
            x0, y0, x1, y1 = loop['rect']
            polygon = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
        elif 'path' in loop and all(isinstance(p, list) and len(p) == 2 for p in loop['path']):
            polygon = loop['path']
        else:
            continue
        rings = [[o+x*p[0]+y*p[1]+n*h for p in polygon] for h in f['depth']]
        faces = [rings[0], rings[1]]
        for i in range(len(polygon)):
            j = (i+1) % len(polygon)
            faces.append([rings[0][i], rings[0][j], rings[1][j], rings[1][i]])
        for face in faces:
            for p, q in zip(face, face[1:]+face[:1]):
                pp, pq = _project(p, c), _project(q, c)
                if np.linalg.norm(pq-pp) > TOL:
                    out.append(g2.line(pp, pq, 'visible'))
            if c.get('section'):
                plane, hits = np.array(c['section']['point']), []
                for p, q in zip(face, face[1:]+face[:1]):
                    dp, dq = (p-plane)@direction, (q-plane)@direction
                    if abs(dp) < 1e-8:
                        hits.append(p)
                    if dp*dq < -1e-12:
                        hits.append(p+(q-p)*dp/(dp-dq))
                if len(hits) >= 2:
                    p = hits[0]
                    q = max(hits, key=lambda h: np.linalg.norm(h-p))
                    if np.linalg.norm(q-p) > TOL:
                        out.append(g2.line(_project(p, c), _project(q, c), 'visible'))
    return out


def _text(d):
    text = d.get('text')
    if text is None:
        prefix = 'Φ' if d.get('type') == 'diameter' else 'R' if d.get('type') == 'radius' else ''
        text = prefix+format(float(d['value']), '.6g')
    if isinstance(text, list):
        text = ' '.join(map(str, text))
    return '('+str(text)+')' if d.get('reference') else str(text)


def _overlaps(a, b, margin=0.):
    return not (a[2]+margin <= b[0] or b[2]+margin <= a[0] or a[3]+margin <= b[1] or b[3]+margin <= a[1])


def _curve_hits_box(curve, box):
    if not _overlaps(_quick_box(curve), box):
        return False
    if curve['geom'] in ('circle', 'arc'):
        return any(box[0] < p[0] < box[2] and box[1] < p[1] < box[3]
                   for p in g2.sample(curve, .35))
    pts = [curve['from'], curve['to']] if curve['geom'] == 'line' else curve['points']
    for a, b in zip(pts, pts[1:]):
        a, b = np.array(a), np.array(b)
        lo, hi = 0., 1.
        for axis in (0, 1):
            delta = b[axis]-a[axis]
            if abs(delta) < 1e-10:
                if a[axis] <= box[axis] or a[axis] >= box[axis+2]:
                    hi = -1.
                    break
            else:
                x, y = sorted([(box[axis]-a[axis])/delta, (box[axis+2]-a[axis])/delta])
                lo, hi = max(lo, x), min(hi, y)
        if hi > lo+1e-8:
            return True
    return False


def _quick_box(c):
    if c['geom'] in ('circle', 'arc'):
        x, y = c['center']
        return [x-c['r'], y-c['r'], x+c['r'], y+c['r']]
    if c['geom'] == 'line':
        a, b = c['from'], c['to']
        return [min(a[0], b[0]), min(a[1], b[1]), max(a[0], b[0]), max(a[1], b[1])]
    return g2.bounds([c])


class _CurveBounds:
    def __init__(self, curves):
        self.curves = curves
        self.bounds = np.asarray([_quick_box(c) for c in curves],dtype=float).reshape(-1,4)

    def at(self, box):
        x0,y0,x1,y1 = box
        bounds = self.bounds
        indices = np.flatnonzero((bounds[:,2]>=x0-TOL)&(bounds[:,0]<=x1+TOL)&
                                 (bounds[:,3]>=y0-TOL)&(bounds[:,1]<=y1+TOL))
        return (self.curves[i] for i in indices)


def _hatch_material(hatches, box):
    # 标签已另外避开轮廓。奇偶填充逐分区保留内孔，不能只检查截面的外接矩形。
    for bounds, loops in hatches:
        if not _overlaps(bounds,box):
            continue
        for x,y in ((box[0],box[1]),(box[0],box[3]),(box[2],box[1]),(box[2],box[3]),
                    ((box[0]+box[2])/2,(box[1]+box[3])/2)):
            parity = 0
            for a,b in loops:
                mask = (a[:,1]>y)!=(b[:,1]>y)
                p,q = a[mask],b[mask]
                parity ^= int(np.count_nonzero(p[:,0]+(y-p[:,1])*(q[:,0]-p[:,0])/(q[:,1]-p[:,1])>x)%2)
            if parity:
                return True
    return False


def _extension_clear(q, e, normal, length, lines, scale, gap, profiles=None):
    # 孔中心界线可以短距离引出外缘。射线必须确实越过最外侧轮廓；
    # 穿入相邻孔、穿过筋的两侧或沿轮廓重复描线均不成立。
    key = tuple(np.round([*q, *normal, scale], 6))
    profile = profiles.get(key) if profiles is not None else None
    if profile is None:
        distances, collinear, straight = set(), [], set()
        for curve in lines:
            if curve['geom'] == 'line':
                ends = np.asarray([curve['from'], curve['to']])*scale-q
                offsets = ends@e
                if max(abs(offsets)) < 1e-6:
                    collinear.append(sorted(ends@normal))
                if min(offsets) > TOL or max(offsets) < -TOL:
                    continue
            for point in _intersections(curve, e, (q/scale)@e):
                distance = round(float((point*scale-q)@normal), 3)
                distances.add(distance)
                if curve['geom']=='line':
                    straight.add(distance)
        profile = distances, collinear, straight
        if profiles is not None:
            profiles[key] = profile
    distances, collinear, straight = profile
    if any(min(hi, length)-max(lo, gap) > TOL for lo, hi in collinear):
        return False
    hits = [d for d in distances if d > gap+.1]
    crossed = [t for t in hits if t < length-.1]
    return not crossed or (len(crossed)==1 and crossed[0]<=14. and
                           (len(hits)==1 or (length<=16. and crossed[0] in straight)))


def _curves_cross(line, curve):
    """尺寸直线与有限图线相交；端点接触不计作穿越。"""
    first, second = _quick_box(line), _quick_box(curve)
    if first[2]+TOL < second[0] or second[2]+TOL < first[0] or first[3]+TOL < second[1] or second[3]+TOL < first[1]:
        return False
    a, b = np.array(line['from']), np.array(line['to'])
    if np.linalg.norm(b-a) < 1e-8:
        return False
    e = _unit(b-a)
    normal = np.array([-e[1], e[0]])
    span = np.linalg.norm(b-a)
    if curve['geom'] == 'line' and _same_support(line, curve):
        lo, hi = sorted((np.array([curve['from'], curve['to']])-a)@e)
        return min(span, hi)-max(0, lo) > TOL
    return any(TOL < (p-a)@e < span-TOL for p in _intersections(curve, normal, a@normal))


def _inward(q, e, normal, lines, scale, gap):
    intersections = set()
    for curve in lines:
        for point in _intersections(curve, e, (q/scale)@e):
            distance = (point*scale-q)@normal
            if distance > gap+.25:
                intersections.add(round(float(distance), 3))
    # 仅作优先级；局部壁厚允许在图形内部用短界线标注。
    return len(intersections) % 2


def _linear_plans_single(proof, label, view, style, occupied, tracks):
    p, q = [np.array(v)*view.scale for v in proof['points']]
    e = _unit(proof['direction'])
    elements = proof['elements']
    if len(elements) == 1:
        elements = elements*2
    reversed_order = (q-p)@e < 0
    if reversed_order:
        p, q = q, p
        elements = elements[::-1]
    n, low, high = np.array([-e[1], e[0]]), p@e, q@e
    height, arrow, gap, over = (style[k] for k in ('DIM_H', 'ARROW', 'EXT_GAP', 'EXT_OVER'))
    tb0 = text_box(label, [0, 0], height)
    width = tb0[2]-tb0[0]
    angle = (math.degrees(math.atan2(e[1], e[0]))+90) % 180-90
    plans, lines = [], [c for c in view.geom.get('lines', []) if _visible(c)]
    for sign in (1, -1):
        normal = n*sign
        far = max(p@normal, q@normal)
        inward = sum(_inward(point, e, normal, lines, view.scale, gap) for point in (p, q))
        near = min(p@normal, q@normal)
        # 小尺寸可直接标在两条同特征母线之间。已有轮廓作界线时不重画一条细线。
        positions_normal = [far+height, far+max(14., height+5.), far, (far+near)/2, near, far+height/2]
        if style.get('_callout'):
            positions_normal.extend(np.linspace(near,far,max(2,min(15,int((far-near)/4)+1))))
        positions_normal += [far+max(14., height+5.)+k*max(12., height+4.) for k in range(1,5)]
        for pos in dict.fromkeys(positions_normal):
            if any(np.linalg.norm(track['normal']-normal) < 1e-7 and
                   min(high, track['high']) > max(low, track['low'])-.5 and
                   pos < track['pos']+max(12., height+4.)-.1 for track in tracks):
                continue
            witnesses, separators = [], []
            for point, element in zip((p, q), elements):
                curve = element['curve']
                if curve['geom'] == 'line':
                    ends = np.asarray([curve['from'], curve['to']])*view.scale
                    if max(abs((ends-point)@e)) < 1e-6:
                        lower, upper = sorted(ends@normal)
                        point = point+normal*(np.clip(pos, lower, upper)-point@normal)
                witnesses.append(point)
                separators.append(pos-point@normal)
            lengths = [abs(d) for d in separators]
            gb = view.box_geom
            limit = max(30., min(65., max(gb[2]-gb[0], gb[3]-gb[1])*.45))
            if max(lengths) > limit or any(TOL < d < gap+1. for d in lengths):
                continue
            if not all(_extension_clear(point, e, normal*np.sign(delta), length+over, lines, view.scale, gap, style['_rays'])
                       for point, delta, length in zip(witnesses, separators, lengths) if length > TOL):
                continue
            a, b = [point+normal*d for point, d in zip(witnesses, separators)]
            inside, arrows_in = high-low > width+2*arrow+3, high-low >= 2*arrow+2
            mid = (low+high)/2
            # 字串比箭头间距长时，文字仍可在界线上方居中或沿尺寸线平移；
            # 不能只把整串推到孔外而压到邻壁。数字放在界线超出段之外。
            positions = [mid]+[mid+sign*height*k for k in (1, 2, 3) for sign in (-1, 1)]
            if not inside:
                positions += [high+arrow+3+width/2, low-arrow-3-width/2]
            for tc in ([mid] if style.get('_callout') else positions):
                m = Marks()
                for point, delta in zip(witnesses, separators):
                    if abs(delta) > TOL:
                        side = normal*np.sign(delta)
                        m.line(point+side*gap, point+side*(abs(delta)+over), role='dimension-extension')
                m.line(a, b, role='dimension-line')
                if not arrows_in:
                    m.line(a-e*(arrow+2), a, role='dimension-line')
                    m.line(b, b+e*(arrow+2), role='dimension-line')
                m.arrow(a, -e if arrows_in else e, role='dimension-arrow', size=arrow)
                m.arrow(b, e if arrows_in else -e, role='dimension-arrow', size=arrow)
                if tc > high:
                    m.line(b, b+e*(tc-high+width/2), role='dimension-line')
                elif tc < low:
                    m.line(a+e*(tc-low-width/2), a, role='dimension-line')
                at = e*tc+normal*(pos+over+.8)
                anchor = 'mb' if np.array([-math.sin(math.radians(angle)), math.cos(math.radians(angle))])@normal > 0 else 'mt'
                m._dimension_track = dict(normal=normal, low=low, high=high, pos=pos)
                actual = witnesses[::-1] if reversed_order else witnesses
                m._actual_proof = dict(proof, points=[(point/view.scale).tolist() for point in actual])
                if style.get('_callout'):
                    plans.append((sum(lengths)+inward*12,m,[]))
                    continue
                m.text(label, at, h=height, anchor=anchor, angle=angle, role='dimension-text')
                tb = text_box(label, at, height, anchor, angle)
                if any(_overlaps(tb, box, 1.2) for box in occupied):
                    continue
                occ = getattr(view, 'occ', None)
                cost = (occ.cost(tb) if occ else 0)+sum(lengths)+inward*25+abs(tc-mid)*.12
                plans.append((cost, m, [tb]))
    return plans


def _linear_plans(proof, label, view, style, occupied, tracks):
    plans = []
    for alternative in proof.get('alternatives', [dict(points=proof['points'], elements=proof['elements'])]):
        actual = dict(proof, **alternative)
        actual.pop('alternatives', None)
        for plan in _linear_plans_single(actual, label, view, style, occupied, tracks):
            plans.append(plan)
    return plans


def _wrap_label(label, height):
    lines, line = [], ''
    for token in re.findall(r'〔D\d+〕|[A-Za-z0-9Φ⌀°+.−-]+|.', label):
        if line and text_box(line+token,[0,0],height)[2]-text_box(line+token,[0,0],height)[0]>height*13:
            lines.append(line.rstrip())
            line = ''
        line += token
        if token in ('；','。'):
            lines.append(line.rstrip())
            line = ''
    if line.strip():
        lines.append(line.rstrip())
    return lines


def _leader_plans(proof, label, view, style, occupied):
    height, arrow, plans = style['DIM_H'], style['ARROW'], []
    lines = _wrap_label(label,height) if style.get('_wrap') else [label]
    for el in proof['elements']:
        if el['kind'] == 'axis' and 'anchor_point' not in proof:
            continue
        curve = el['curve']
        tips = np.asarray([proof['anchor_point']]) if 'anchor_point' in proof else g2.sample(curve, max(g2.length(curve)/12, .4))
        for point in tips*view.scale:
            for degrees in (45, 135, -45, -135, 0, 180, 90, -90):
                e = np.array([math.cos(math.radians(degrees)), math.sin(math.radians(degrees))])
                for length in (12., 20., 28.):
                    knee = point+e*length
                    sign = 1 if e[0] >= 0 else -1
                    anchor, at = ('lb' if sign > 0 else 'rb'), knee+np.array([sign*1., 1.])
                    offsets = [at+np.array([0.,(len(lines)-1-i)*(height+1.5)]) for i in range(len(lines))]
                    boxes = [text_box(line,where,height,anchor) for line,where in zip(lines,offsets)]
                    if any(_overlaps(tb, box, 1.2) for tb in boxes for box in occupied):
                        continue
                    occ = getattr(view, 'occ', None)
                    cost = (sum(occ.cost(tb) for tb in boxes)+occ.line_cost(point, knee) if occ else 0)+length
                    m = Marks()
                    m.line(point, knee, role='dimension-leader')
                    m.arrow(point, -e, role='dimension-arrow', size=arrow)
                    m.line(knee, knee+np.array([sign*height, 0]), role='dimension-landing')
                    for line,where in zip(lines,offsets):
                        m.text(line,where,h=height,anchor=anchor,role='dimension-text')
                    m._actual_proof = dict(proof, elements=[el], tip=(point/view.scale).tolist())
                    plans.append((cost, m, boxes))
    return plans


def _offset_label(baselines, label, height, occupied, clear):
    """窄间距仍画两界线与一对箭头，把数字用短折引线移到可读的空白。"""
    seen = set()
    for _, baseline, _ in sorted(baselines, key=lambda item:item[0]):
        signature = repr([(m['kind'],m.get('curve'),m.get('tip')) for m in baseline.items])
        if signature in seen:
            continue
        seen.add(signature)
        if not clear(baseline, []):
            continue
        tips = np.array([m['tip'] for m in baseline.items if m['kind']=='arrow'])
        start = np.mean(tips,axis=0)
        measure = _unit(tips[1]-tips[0])
        for length in (8.,14.,22.,32.,44.):
            for degrees in (45.,135.,-45.,-135.,90.,-90.,0.,180.):
                ray = np.array([math.cos(math.radians(degrees)),math.sin(math.radians(degrees))])
                if abs(ray@measure)>.98:
                    continue
                knee = start+ray*length
                for sign in ((1,-1) if abs(ray[0])<.1 else (int(np.sign(ray[0])),)):
                    anchor = 'lb' if sign==1 else 'rb'
                    linesets = [(label,)]
                    if ' ' in label:
                        prefix, value = label.split(' ',1)
                        linesets.append((value, prefix))
                    for lines in linesets:
                        at = knee+np.array([sign,1.2])
                        boxes = [text_box(line,at+[0,i*(height+1.5)],height,anchor) for i,line in enumerate(lines)]
                        if any(_overlaps(b,o,1.2) for b in boxes for o in occupied):
                            continue
                        marks = copy.copy(baseline)
                        marks.items = list(baseline.items)
                        marks.line(start,knee,role='dimension-leader')
                        marks.line(knee,knee+[sign*height,0],role='dimension-landing')
                        for i,line in enumerate(lines):
                            marks.text(line,at+[0,i*(height+1.5)],h=height,anchor=anchor,role='dimension-text')
                        if clear(marks,boxes):
                            return 0.,marks,boxes
    return None


def layout_dimensions(view, dimensions, *, style, legacy=None):
    """返回 dimensions/bbox/unresolved；不改变几何、纸张和原值。"""
    return _layout(view, dimensions, style, {})


def _dimension_order(d):
    linear = d.get('type') == 'linear' or any(k in d.get('category','') for k in ('轴向','深'))
    return not linear, float(d.get('value',0)), int(re.sub(r'\D', '', d.get('_id','0')) or 0)


def _layout(view, dimensions, style, state):
    style = dict(style)
    style['DIM_H'] = max(8., float(style.get('DIM_H', 8.)))
    style['ARROW'] = float(style.get('ARROW', 3.))
    style['EXT_GAP'] = min(2., max(1., float(style.get('EXT_GAP', 1.5))))
    style['EXT_OVER'] = min(3., max(2., float(style.get('EXT_OVER', 2.5))))
    if not state:
        geometry = [g2.xform(c, view.scale, (0, 0)) for c in view.geom.get('lines', [])]
        occupied = [text_box(m['text'],m['at'],m['height'],m.get('anchor','mm'),m.get('angle',0))
                    for m in getattr(getattr(view,'marks',None),'items',[]) if m['kind']=='text']
        hatch_areas = []
        for region in view.geom.get('hatches',[]):
            loops = [np.asarray(r)*view.scale for r in region['loops'] if len(r)>=3]
            if loops:
                pts = np.vstack(loops)
                hatch_areas.append(([*pts.min(axis=0),*pts.max(axis=0)],[(r,np.roll(r,-1,axis=0)) for r in loops]))
        state.update(geometry=geometry, lookup=_CurveBounds(geometry), visible=[c for c in geometry if _visible(c)], occupied=occupied,
                     curves=[], tracks=[], rays={}, validation={}, crossings={},hatches=hatch_areas,text_geometry={})
    geometry, visible_geometry = state['geometry'], state['visible']
    occupied, prior_curves, tracks = state['occupied'], state['curves'], state['tracks']
    style['_rays'] = state['rays']
    out, unresolved, bbox = [], [], None
    ordered = sorted(dimensions, key=_dimension_order)
    for source in ordered:
        proof = source.get('_dimension_witness')
        if not proof or not proof.get('elements') or proof.get('view_key') != view.view_key:
            unresolved.append(_failure(source, (proof or {}).get('part'), '缺少该视图的特征见证；必须先 assign_dimensions'))
            continue
        # 运行期再核查；不能用曾经存在、后来被 A/B 改掉的边。
        runtime_lines = [c for c in view.geom.get('lines', []) if _visible(c)]
        def valid(el):
            key = repr((el['kind'],el['curve'],el.get('support'),el.get('retained_axis')))
            cache = state['validation']
            if key not in cache:
                if el['kind']=='axis':
                    cache[key] = bool(el.get('support')) and all(valid(s) for s in el['support']) and (
                        'retained_axis' not in el or el['retained_axis'] in view.geom.get('lines', []))
                else:
                    cache[key] = _retained(el['curve'], runtime_lines)
            return cache[key]
        if proof.get('alternatives'):
            options = [alt for alt in proof['alternatives'] if all(valid(el) for el in alt['elements'])]
            if options:
                proof = dict(proof, **options[0], alternatives=options)
        else:
            options = [proof] if all(valid(el) for el in proof['elements']) else []
        if not options or not all(valid(el) for el in proof.get('pattern_elements', [])+proof.get('direction_support', [])) or not all(
                any(valid(el) for el in row['witnesses']) for row in proof.get('assembly_evidence', [])):
            unresolved.append(_failure(source, proof['part'], '见证轮廓在运行期投影消失，需重新归属'))
            continue
        text = proof.get('process_text') or _text(source)
        label = f"〔{source['_id']}〕 {text}"
        if proof.get('angle_reference'):
            label += ' '+proof['angle_reference']
        plans = (_linear_plans(proof, label, view, style, occupied, tracks) if proof['mode'] == 'linear'
                 else _leader_plans(proof, label, view, style, occupied))
        # 标注线不得穿已排文字，数字也不能盖在轮廓/既有标注线上。
        def crosses_geometry(mark):
            if mark['kind'] != 'curve' or mark['curve']['geom'] != 'line' or mark['role'] == 'dimension-extension':
                return False
            line = mark['curve']
            key = (tuple(line['from']),tuple(line['to']))
            if key not in state['crossings']:
                state['crossings'][key] = any(_curves_cross(line,curve) for curve in state['lookup'].at(_quick_box(line))
                                              if _visible(curve))
            if not state['crossings'][key]:
                return False
            if mark['role'] == 'dimension-leader':
                a, b = np.asarray(line['from']), np.asarray(line['to'])
                ray = _unit(b-a)
                return not _extension_clear(a, np.array([-ray[1], ray[0]]), ray, np.linalg.norm(b-a),
                                            visible_geometry, 1., 0., style['_rays'])
            return True

        def clear(marks, boxes):
            for box in boxes:
                signature = tuple(box)
                if signature not in state['text_geometry']:
                    state['text_geometry'][signature] = (any(_curve_hits_box(curve,box) for curve in state['lookup'].at(box))
                                                         or _hatch_material(state['hatches'],box))
                if state['text_geometry'][signature]:
                    return False
            return (
                    not any(_curve_hits_box(curve, box) for box in boxes for curve in prior_curves)
                    and not any(_curve_hits_box(mark['curve'],box) for mark in marks.items
                                if mark['kind']=='curve' for box in occupied)
                    and not any(crosses_geometry(mark) for mark in marks.items))
        best = next((plan for plan in sorted(plans, key=lambda plan: plan[0]) if clear(plan[1],plan[2])), None)
        if best is None and proof['mode']!='linear' and len(_wrap_label(label,style['DIM_H']))>1:
            wrapped = _leader_plans(proof,label,view,dict(style,_wrap=True),occupied)
            best = next((p for p in sorted(wrapped,key=lambda x:x[0]) if clear(p[1],p[2])),None)
        if best is None and proof['mode']=='linear':
            baselines = _linear_plans(proof, label, view, dict(style,_callout=True), occupied, tracks)
            best = _offset_label(baselines, label, style['DIM_H'], occupied, clear)
        if best is None:
            unresolved.append(_failure(source, proof['part'], '8 mm 字高下无清楚的短界线/引线位置；需局部视图或 D 调整布局'))
            continue
        _, marks, boxes = best
        proof = getattr(marks, '_actual_proof', proof)
        if hasattr(marks, '_dimension_track'):
            tracks.append(marks._dimension_track)
        for el in proof['elements']:
            if el['kind'] == 'axis':
                if not _retained(dict(el['curve'], type='visible'),
                                 [dict(c, type='visible') for c in view.geom.get('lines', []) if c.get('type')=='center']):
                    marks.curve(g2.xform(el['curve'], view.scale, (0, 0)), role='dimension-axis')
        if 'pitch_circle' in proof:
            marks.curve(g2.xform(proof['pitch_circle'], view.scale, (0, 0)), role='dimension-axis')
        bounds = marks_bounds(marks.to_view(view.scale), view.scale)
        marks.box = bounds  # 补齐旧 Marks.box 漏掉的箭头翼。
        record = copy.deepcopy(source)
        record.update(id=source['_id'], text=text, marks=marks, _dimension_witness=copy.deepcopy(proof))
        if proof['mode'] == 'linear':
            record.update({'from': proof['points'][0], 'to': proof['points'][1]})
        record['_dimension_audit'] = dict(copy.deepcopy(source.get('_dimension_audit', {})),
                                         witnesses=copy.deepcopy(proof['elements']), bbox=bounds, status='laid_out')
        record['_dimension_audit']['feature_relations'] = _relations(source, proof)
        out.append(record)
        bbox = box_union(bbox, bounds)
        occupied.extend(boxes)
        prior_curves.extend(mark['curve'] for mark in marks.items if mark['kind'] == 'curve')
        if getattr(view, 'occ', None) is not None:
            for mark in marks.items:
                if mark['kind'] == 'curve':
                    view.occ.add_curve(mark['curve'])
                elif mark['kind'] == 'text':
                    view.occ.add_text(text_box(mark['text'], mark['at'], mark['height'], mark['anchor'], mark['angle']))
    return dict(dimensions=out, bbox=bbox, unresolved=unresolved)



def _parameters(d):
    w = d.get('_witness_3d') or {}
    if w.get('kind')=='assembly_relation':
        return [r['kind'] for r in w['relations']]
    f, category = w.get('feature') or {}, d.get('category', '')
    if d.get('type') == 'linear' and w.get('axis'):
        return [f"position.{w['axis']}.from", f"position.{w['axis']}.to"]
    if f.get('type') == 'fillet':
        return ['radius']
    if f.get('type') == 'chamfer':
        return ['distance']
    if '深' in category or '轴向' in category:
        return ['depth']
    if '分布圆' in category:
        return ['hole_pattern.pitch_diameter', 'hole_pattern.orientation']
    if '径' in category or d.get('type') == 'diameter':
        return ['d' if f.get('type') == 'hole' else 'loops[].d']
    if '角' in category:
        return ['plane.normal']
    return [f"annotation.{category or d.get('type', 'unknown')}"]


def _failure(d, part, reason, **more):
    return dict(id=d.get('_id', d.get('id')), part=part, feature=d.get('source_feature'),
                parameters=_parameters(d), reason=reason, requested='A/B: 对应特征的可见轮廓、真实轴线或轴向剖', **more)


def _part_for(d, candidates, context):
    if (d.get('_witness_3d') or {}).get('kind')=='assembly_relation':
        return str(d['source_part'])
    for c in candidates:
        if c['view_key'] == d.get('view_key') or (c.get('_head_sheet') == d.get('_head_sheet') and c.get('name') == d.get('view')):
            if c.get('part') is not None:
                return str(c['part'])
    for s in context.get('head_sheets', []):
        if s.get('id') == d.get('_head_sheet') and s.get('part') is not None:
            return str(s['part'])
    f = (d.get('_witness_3d') or {}).get('feature')
    matches = [str(p.get('name', i)) for i, p in enumerate(context.get('parts', []), 1)
               if d.get('source_feature') and len(p.get('features', [])) >= d['source_feature']
               and p['features'][d['source_feature']-1] == f]
    return matches[0] if len(matches) == 1 else None


def _validate_candidate(c):
    for key in ('direction', 'u', 'v'):
        if c.get(key) is None or len(c[key]) != 3 or not np.isfinite(c[key]).all():
            raise ValueError(f'候选缺少有效三维 {key}')
    basis = np.array([c['u'], c['v'], c['direction']], float)
    if not np.allclose(basis@basis.T, np.eye(3), atol=1e-6):
        raise ValueError('候选轴系不是正交单位轴系')
    if c.get('section') and len(c['section'].get('point', [])) != 3:
        raise ValueError('剖视候选缺少三维剖切点')


def _relations(d, proof):
    """一对多参数关系也进审计；未见证的共享关系不能假称覆盖完成。"""
    if proof.get('assembly_evidence'):
        return [dict(row,id=d['_id'],parameters=[row['relation']],view_key=proof['view_key'],status='witnessed')
                for row in proof['assembly_evidence']]
    relations = []
    for fid in d.get('covers_features', []) or [d.get('source_feature')]:
        witnesses = [el for el in proof['elements']+proof.get('pattern_elements', []) if el.get('feature') == fid]
        relations.append(dict(part=proof['part'], feature=fid, parameters=proof['parameters'],
            id=d['_id'], view_key=proof['view_key'], witnesses=copy.deepcopy(witnesses),
            status='witnessed' if witnesses else 'shared_parameter_requires_cross_view',
            derivation=proof['derivation'] if witnesses else '原 shared_points 只证明参数同值，需其他视图补可见要素'))
    return relations


def _depth_end(point, end_center, axis, elements, visible):
    """孔口/孔底在实体上的拐点。裁剪后的孤立母线端点不足以标注深度。"""
    if abs((point-end_center)@axis) > TOL:
        return False
    normal = np.array([-axis[1],axis[0]])
    for el in elements:
        c = el['curve']
        if el['kind']=='axis' or c['geom']!='line':
            continue
        ends = np.asarray([c['from'], c['to']])
        if min(np.linalg.norm(ends-point,axis=1)) > TOL or abs((ends[1]-ends[0])@normal) > TOL:
            continue
        if any(edge['geom']=='line' and abs((np.asarray(edge['to'])-edge['from'])@normal)>TOL
               and _distance(edge, point)<TOL for edge in visible):
            return True
    return False


def _pitch_circle(d, index, base):
    ids = list(dict.fromkeys(d.get('covers_features', [])))
    if len(ids) < 3:
        raise ValueError('分布圆缺少至少三个明确的孔身份')
    centers, faces, witnesses = [], [], []
    for fid in ids:
        holes = _cylinders(index.features.get(fid, {}))
        if len(holes) != 1:
            raise ValueError(f'分布圆孔{fid}缺少唯一圆柱轴')
        a, face, r = holes[0]
        if abs(_unit(face-a)@index.c['direction']) < 1-1e-7:
            raise ValueError('分布圆需沿全部孔轴的真形投影')
        ctr = _project(face, index.c)
        circle = next((el for el in index.get(fid) if el['kind']=='contour' and el['curve']['geom']=='circle'
                       and abs(el['curve']['r']-r)<TOL and np.linalg.norm(ctr-el['curve']['center'])<TOL), None)
        if circle is None:
            raise ValueError(f'分布圆的孔{fid}缺可见完整真形圆')
        centers.append(ctr)
        faces.append(face)
        witnesses.append(circle)
    normal = np.array(index.c['direction'])
    if np.ptp(np.array(faces)@normal)>TOL:
        raise ValueError('孔口不在同一端面')
    center = np.mean(centers, axis=0)
    offsets = centers-center
    radius = float(d['value'])/2
    angles = np.sort(np.arctan2(offsets[:,1], offsets[:,0]))
    if max(abs(np.linalg.norm(offsets,axis=1)-radius))>TOL or not np.allclose(
            np.diff(np.r_[angles, angles[0]+2*np.pi]), 2*np.pi/len(angles), atol=1e-5):
        raise ValueError('实际孔轴中心不能证明原均布圆直径')
    first = faces[0]-np.mean(faces, axis=0)
    if '低侧' in _text(d) and (first[2]>=0 or abs(first@np.cross(normal,[0.,0.,1.]))>TOL):
        raise ValueError('首孔不在总 Z 与端面轴线共面的低侧')
    # 箭头落在有完整孔壁支撑的首孔中心，其余孔轴与它共享真形分布圆。
    n = _unit(offsets[0])
    r = witnesses[0]['curve']['r']
    axis = dict(part=index.part, feature=ids[0], kind='axis', parameters=['at'],
        curve=g2.line(centers[0]-r*n, centers[0]+r*n, 'center'), support=[witnesses[0]],
        provenance='true bore center on verified pitch circle')
    return dict(base, mode='leader', elements=[axis], anchor_point=centers[0].tolist(), pattern_elements=witnesses,
                pitch_circle=g2.arc(center,radius,0,360,'center'), derivation='同端面各孔真形圆心、原均布角及首孔方向')


def _process_text(d, dimensions):
    f = d['_witness_3d']['feature']
    cylinder = _cylinders(f)
    if len(cylinder)!=1:
        raise ValueError('原加工深度缺少唯一圆柱')
    a,mouth,_ = cylinder[0]
    value = float(d['value'])
    if abs(np.linalg.norm(mouth-a)-value)>TOL:
        raise ValueError('原加工圆柱轴向行程与目录不符')
    if f['name'].endswith('主通道'):
        return f"钻深{value:g}（自{f['name'][:-3]}外端面沿轴向内，含沉台深度）"
    if f['name']=='空间斜注油孔':
        return f"钻深{value:g}（自箱壳顶面沿孔轴钻穿壳壁）"
    for axis in np.argsort(-abs(_unit(mouth-a))):
        for ref in dimensions:
            w = ref.get('_witness_3d') or {}
            if ref['type']=='linear' and w.get('axis')=='XYZ'[axis] and any(
                    np.linalg.norm(mouth-x['point'])<TOL
                    for x in w.get('shared_points',[])):
                target = '向外钻穿壳壁' if f['name']=='斜排屑孔' else '钻通入内腔'
                return f"钻深{value:g}（自〔{ref['_id']}〕的{w['axis']}向终端基准面与孔轴交点起，{target}）"
    raise ValueError('原加工深度缺少可由原目录推出的起点基准')


def _process_proof(d,index,base,elements,process_text):
    a,b,r = _cylinders(index.features[d['source_feature']])[0]
    c = index.c
    axis = _unit(b-a)
    pa,pb = _project(a,c),_project(b,c)
    true_circle = [el for el in elements if el['kind']=='contour' and el['curve']['geom'] in ('circle','arc')
        and abs(el['curve']['r']-r)<TOL and np.linalg.norm(pb-el['curve']['center'])<TOL]
    if abs(axis@c['direction'])>1-1e-7 and true_circle:
        return dict(base,mode='leader',elements=true_circle,process_text=process_text,
                    derivation='C-04 原加工行程；引线指向同孔真形孔口')
    if c.get('section') and abs(axis@c['direction'])<1e-7 and abs((a-c['section']['point'])@c['direction'])<TOL:
        e = _unit(pb-pa)
        n = np.array([-e[1],e[0]])
        walls = [el for el in elements if el['kind']=='contour' and el['curve']['geom']=='line'
                 and any(_same_support(el['curve'],g2.line(pa+s*r*n,pb+s*r*n,'visible')) for s in (-1,1))]
        if walls:
            wall = min(walls,key=lambda item:min(np.linalg.norm(np.asarray(item['curve'][k])-pb) for k in ('from','to')))
            mouth = max((wall['curve']['from'],wall['curve']['to']),key=lambda p:p@e)
            return dict(base,mode='leader',elements=[wall],anchor_point=list(mouth),process_text=process_text,
                        derivation='C-04 原加工行程；引线指向含轴剖面的实际孔壁入口')
    raise ValueError('加工深度需有此孔实际入口的端视或含轴剖视')


def _analyse(d, index, endpoint_features, process_text=None):
    c, part, features = index.c, index.part, index.features
    fid = d.get('source_feature')
    w, f = d.get('_witness_3d') or {}, features.get(fid)
    if not f or not w:
        raise ValueError('没有可验证的零件特征与三维见证；装配约束需显式见证')
    explicitly_expressed = any(el.get('feature') == fid and str(el.get('part', part)) == part
                               for el in c.get('expresses', []))
    if fid in c.get('omitted_features', []) and not explicitly_expressed and not index.tagged.get(fid) and not (
            d.get('type') == 'linear' and len(w.get('shared_points', [])) > 1 and index.authoritative):
        raise ValueError('A 已省略该内部特征，需 B 的剖视/局部表达')
    elements = index.get(fid)
    chain = d.get('type') == 'linear' and w.get('axis') and 'from' in w and 'to' in w
    if not elements and not chain:
        raise ValueError('该特征无独有可见轮廓；重合支持线/R/C 最终边需身份见证')
    category = d.get('category', '')
    end_view = (c.get('role') == 'detail' and c.get('kind') == 'auxiliary' and not c.get('section')
                and (c.get('keep') or {}).get('_a_local'))
    if not process_text and end_view and any(word in category for word in ('深', '轴向', '角')):
        raise ValueError('接口端视不能表达孔深、轴向长度或空间方向角')
    base = dict(part=part, feature=fid, parameters=_parameters(d), view_key=c['view_key'])
    if process_text:
        return _process_proof(d,index,base,elements,process_text)
    if chain:
        axis = np.eye(3)['XYZ'.index(w['axis'])]
        e = np.array([axis@c['u'], axis@c['v']])
        if abs(np.linalg.norm(e)-1) > 1e-7:
            raise ValueError('定位轴不是实长投影')
        p1, p2 = _project(w['from'], c), _project(w['to'], c)
        if abs(abs((p2-p1)@e)-float(d['value'])) > TOL:
            raise ValueError('原值与三维基准差不一致')
        choices = []
        for role, p in (('from', p1), ('to', p2)):
            ids = list(dict.fromkeys(endpoint_features.get((w['axis'], tuple(w[role])), [])))
            if role == 'to':
                ids = list(dict.fromkeys([fid]+ids))
            if not ids and np.linalg.norm(w[role]) < 1e-8:
                ids = list(features)  # 原点须落在真实轮廓，不能凭空建立 O 十字。
            options = []
            for feature_id in ids:
                for element in index.get(feature_id):
                    for point in _datum_points(element, e, p@e):
                        options.append(dict(point=point.tolist(), element=element))
            if not options:
                raise ValueError(f"{role} 基准{w['axis']}={np.array(w[role])@axis:g} 特征{ids}无可见见证")
            choices.append(options)
        normal = np.array([-e[1], e[0]])
        gb = g2.bounds(index.lines)
        corners = np.array([[gb[0], gb[1]], [gb[0], gb[3]], [gb[2], gb[1]], [gb[2], gb[3]]])
        low, high = min(corners@normal), max(corners@normal)
        def cost(pair):
            coord = np.array([item['point'] for item in pair])@normal
            return (abs(coord[1]-coord[0])+min(high-min(coord), max(coord)-low)
                    + (0 if pair[1]['element']['feature'] == fid else 6))
        def matched_pair(a, b):
            points = [np.asarray(a['point']), np.asarray(b['point'])]
            for i, item in enumerate((a, b)):
                curve = item['element']['curve']
                if curve['geom'] != 'line':
                    continue
                ends = np.asarray([curve['from'], curve['to']])
                if max(abs((ends-points[i])@e)) < 1e-6:
                    lo, hi = sorted(ends@normal)
                    desired = np.clip(points[1-i]@normal, lo, hi)
                    points[i] = points[i]+normal*(desired-points[i]@normal)
            return dict(a, point=points[0].tolist()), dict(b, point=points[1].tolist())
        pairs = sorted((matched_pair(a, b) for a in choices[0] for b in choices[1]), key=cost)
        alternatives, seen = [], set()
        for a, b in pairs:
            signature = tuple((tuple(round(float(v), 5) for v in item['point']), repr(item['element']['curve']))
                              for item in (a, b))
            if signature not in seen:
                alternatives.append(dict(points=[a['point'], b['point']], elements=[a['element'], b['element']]))
                seen.add(signature)
            if len(alternatives) == 12:
                break
        a, b = pairs[0]
        return dict(base, mode='linear', points=[a['point'], b['point']], direction=e.tolist(),
                    elements=[a['element'], b['element']], alternatives=alternatives,
                    derivation=f"原{w['axis']}基准差；保留原链路")
    if f['type'] in ('fillet', 'chamfer'):
        amount = f['radius'] if f['type'] == 'fillet' else f['distance']
        if abs(float(d['value'])-float(amount)) > TOL:
            raise ValueError('R/C 原值与所指最终处理特征不一致')
        elements = [el for el in elements if el['kind'] == 'final_edge']
        if not elements:
            raise ValueError('R/C 需要最终边身份，不能使用旧选边点')
        return dict(base, mode='leader', elements=elements, derivation='R/C 指向最终处理边')
    cylinders = _cylinders(f)
    if ('深' in category or '轴向' in category) and cylinders:
        if not c.get('section'):
            raise ValueError('孔深/轴向长度需要含孔轴的纵剖')
        for a, b, radius in cylinders:
            if abs(_unit(b-a)@_unit(c['direction'])) > 1e-7 or abs(np.linalg.norm(b-a)-float(d['value'])) > TOL:
                continue
            if abs((a-np.array(c['section']['point']))@_unit(c['direction'])) > TOL:
                continue
            axes = [el for el in elements if el['kind'] == 'axis']
            pa, pb = _project(a, c), _project(b, c)
            e = _unit(pb-pa)
            normal = np.array([-e[1],e[0]])
            walls = [el for el in elements if el['kind']=='contour' and el['curve']['geom']=='line'
                     and any(_same_support(el['curve'],g2.line(pa+side*radius*normal,pb+side*radius*normal,'visible'))
                             for side in (-1,1))]
            coaxial_support = []
            if not axes and not walls:
                for other, feature in features.items():
                    if other==fid:
                        continue
                    for oa,ob,_ in _cylinders(feature):
                        if abs(_unit(ob-oa)@_unit(b-a))>1-1e-7 and np.linalg.norm(np.cross(oa-a,_unit(b-a)))<TOL:
                            coaxial_support.extend(el for el in index.get(other) if el['kind']=='axis')
            if axes or walls or coaxial_support:
                def end_options(end):
                    options = []
                    for el in elements:
                        if el['kind']=='axis':
                            continue
                        curve = el['curve']
                        cap = False
                        if curve['geom']=='line':
                            ends = np.asarray([curve['from'],curve['to']])-end
                            cap = max(abs(ends@e))<END_EPS and max(abs(ends@normal))<=radius+TOL
                        for p in _intersections(curve,e,end@e):
                            if cap or _depth_end(p,end,e,elements,index.lines):
                                options.append((p,el))
                    return options
                first_end,second_end = end_options(pa),end_options(pb)
                pairs = [dict(points=[p.tolist(),q.tolist()], elements=[first,second])
                         for p,first in first_end for q,second in second_end]
                if pairs:
                    pairs.sort(key=lambda pair: abs((np.array(pair['points'][1])-pair['points'][0])@np.array([-e[1], e[0]])))
                    return dict(base, mode='linear', **pairs[0], direction=e.tolist(), alternatives=pairs[:12],
                                direction_support=(axes or walls or coaxial_support)[:1],
                                derivation='含轴纵剖：孔口到真实终止，尺寸方向平行孔轴')
        raise ValueError('纵剖中孔口/终止或两条母线不完整')
    if '分布圆' in category:
        return _pitch_circle(d, index, base)
    if '径' in category or d.get('type') in ('diameter', 'radius'):
        circles = [el for el in elements if el['kind'] != 'axis' and el['curve']['geom'] in ('circle', 'arc')
                   and abs(el['curve']['r']*(1 if d.get('type') == 'radius' else 2)-float(d['value'])) < TOL
                   and any(abs(_unit(b-a)@c['direction'])>1-1e-7 and abs(r-el['curve']['r'])<TOL
                           and np.linalg.norm(_project(a,c)-el['curve']['center'])<TOL for a,b,r in cylinders)]
        if not circles:
            if c.get('section'):
                for a, b, radius in cylinders:
                    if abs(2*radius-float(d['value'])) > TOL or abs(_unit(b-a)@_unit(c['direction'])) > 1e-7:
                        continue
                    # 偏离轴线的弦宽不能标成直径。
                    if abs((a-np.array(c['section']['point']))@_unit(c['direction'])) > TOL:
                        continue
                    pa, pb = _project(a, c), _project(b, c)
                    axis = _unit(pb-pa)
                    normal = np.array([-axis[1], axis[0]])
                    sides = []
                    for sign in (-1, 1):
                        side = []
                        for el in elements:
                            curve = el['curve']
                            if el['kind'] != 'axis' and curve['geom'] == 'line' and _same_support(curve,
                                    g2.line(pa+normal*radius*sign, pb+normal*radius*sign, 'visible')):
                                side.append(el)
                        sides.append(side)
                    alternatives = []
                    for first in sides[0]:
                        for second in sides[1]:
                            a0, a1 = sorted(np.array([first['curve']['from'], first['curve']['to']])@axis)
                            b0, b1 = sorted(np.array([second['curve']['from'], second['curve']['to']])@axis)
                            lo, hi = max(a0, b0), min(a1, b1)
                            if hi-lo < TOL:
                                continue
                            for coordinate in (lo, hi, (lo+hi)/2):
                                p = _intersections(first['curve'], axis, coordinate)[0]
                                q = _intersections(second['curve'], axis, coordinate)[0]
                                alternatives.append(dict(points=[p.tolist(), q.tolist()], elements=[first, second]))
                    if alternatives:
                        return dict(base, mode='linear', **alternatives[0], direction=normal.tolist(), alternatives=alternatives,
                                    derivation='含轴纵剖两条同特征真实母线之间的直径')
            raise ValueError('直径需同特征真形圆/圆弧或含轴纵剖的成对母线')
        return dict(base, mode='radial', elements=circles, derivation='同特征真形圆径')
    if '深' in category or '轴向' in category:
        raise ValueError('该轴向参数缺少可验证的孔口/终止')
    if '角' in category:
        if not cylinders:
            raise ValueError('方向角缺少真实轴线')
        axis = _unit(cylinders[0][1]-cylinders[0][0])
        text = ' '.join(d['text']) if isinstance(d.get('text'), list) else str(d.get('text', ''))
        expected = (math.degrees(math.acos(np.clip(axis[2], -1, 1))) if '倾角' in text
                    else math.degrees(math.atan2(axis[1], axis[0])) % 360)
        if abs((expected-float(d['value'])+180) % 360-180) > .02:
            raise ValueError('原方向角与特征轴线不一致或语义不完整')
        if abs(_unit(c['direction'])@axis) > 1-1e-7:
            raise ValueError('端视不能表达空间方向角，需定位/轴向视图')
        supported = [el for el in elements if el['kind']=='axis']
        if not supported:
            raise ValueError('倾角/方位需要有同特征可见轮廓支持的轴线')
        if '倾角' in text and (abs(axis@c['direction'])>1e-6 or abs(c['direction'][2])>1e-6):
            raise ValueError('倾角需在包含实长孔轴及总 Z 方向的视图引出')
        axis_element = max(supported,key=lambda el:g2.length(el['curve']))
        curve = axis_element['curve']
        return dict(base,mode='leader',elements=[axis_element],anchor_point=np.mean([curve['from'],curve['to']],axis=0).tolist(),
                    angle_reference='对总+Z' if '倾角' in text else '总XY面自+X逆时针',
                    derivation='真实轴线的三维方向；方位是水平投影的空间参数，未取竖剖纸面夹角')
    return dict(base, mode='leader', elements=[el for el in elements if el['kind'] != 'axis'],
                derivation='原参数文字指向同特征可见轮廓')


def _projection_key(candidate):
    # 候选重用只限完整投影定义、来源图和身份元数据均相同的情形。
    return repr(tuple(candidate.get(k) for k in ('projection_key', 'part', 'parts', 'frame', 'kind',
        'direction', 'u', 'v', 'origin', 'section', 'keep', 'detail', 'parent_key', '_a_features',
        'witness_elements', 'omitted_features', 'role', 'expresses')))


def _assembly_proof(d, c, projection):
    tags = [el for el in c.get('witness_elements',[])+projection.get('witness_elements',[])
            if el.get('kind')=='contour' and el.get('coordinate_system')=='assembly' and el.get('support_3d')]
    visible = [line for line in projection['lines'] if _visible(line)]
    verified = {}
    def retained(el):
        key = repr(el['curve'])
        if key not in verified:
            verified[key] = _retained(el['curve'],visible)
        return verified[key]
    relations = d['_witness_3d']['relations']
    evidence, primary = [], []
    for relation in relations:
        if not check_assembly_relation(relation):
            raise ValueError(f"装配原三维要素未证明 {relation['kind']}，需集成核对")
        for item in relation['elements']:
            if item['kind']=='frame':
                continue
            point = np.array(item['point'])
            owner = [el for el in tags if el['part']==item['part'] and el['feature']==item['feature']]
            hits = []
            for el in owner:
                for support in el['support_3d']:
                    delta = point-support['point']
                    if item['kind']=='axis' and support['kind']=='cylinder':
                        axis = np.asarray(support['direction'])
                        ok = (abs(axis@item['direction'])>1-1e-7 and np.linalg.norm(np.cross(delta,axis))<.002
                              and abs(support['radius']-item['radius'])<.002)
                    elif item['kind']=='plane' and support['kind'] in ('end_plane','side_plane'):
                        n = np.asarray(support['normal'])
                        ok = abs(n@item['direction'])>1-1e-7 and abs(n@delta)<.002
                    else:
                        ok = False
                    if ok and retained(el):
                        hits.append(el)
                        break
            if item['kind']=='point' and item['selector']=='rect_center':
                # 键槽矩形中心须由一对确有身份的平行边界限制，不认最近图线。
                for i,first in enumerate(owner):
                    for second in owner[i+1:]:
                        for a in first['support_3d']:
                            for b in second['support_3d']:
                                if a['kind']!='side_plane' or b['kind']!='side_plane':
                                    continue
                                n = np.asarray(a['normal'])
                                x,y = n@(point-a['point']), n@(point-b['point'])
                                if abs(n@b['normal'])>1-1e-7 and x*y<0 and abs(x+y)<.002 and retained(first) and retained(second):
                                    hits.extend([first,second])
            if not hits:
                raise ValueError(f"装配 {relation['kind']} 缺件{item['part']}特征{item['feature']} {item['selector']} 的可见三维支承")
            hits = list({repr(el['curve']):el for el in hits}.values())
            if not primary:
                primary = hits
            evidence.append(dict(relation=relation['kind'],part=item['part'],feature=item['feature'],
                                 selector=item['selector'],witnesses=hits))
    return dict(mode='leader',part=str(d['source_part']),feature=d['source_feature'],view_key=c['view_key'],
                elements=primary, parameters=_parameters(d),assembly_evidence=evidence,derivation='原装配系配合要素及同图可见支承')


def _view_cover(options, candidates, fingerprints):
    """最少不同图形覆盖已证明的 D，同时保留必选图和实际纸面来源。"""
    from scipy.optimize import Bounds, LinearConstraint, milp
    from scipy.sparse import csr_matrix
    groups = list(dict.fromkeys(fingerprints.values()))
    if not groups or not options:
        return set()
    idx = {group:i for i,group in enumerate(groups)}
    rows, lower, upper = [], [], []
    minimum = np.zeros(len(groups))
    for c in candidates:
        i = idx[fingerprints[c['view_key']]]
        if not c.get('layout_optional'):
            minimum[i]=1.
        parent = c.get('source_key')
        if parent in fingerprints:
            j = idx[fingerprints[parent]]
            if i!=j:
                rows.append({i:-1.,j:1.})
                lower.append(0.)
                upper.append(np.inf)
    for choices in options.values():
        rows.append({idx[fingerprints[c['view_key']]]:1. for _,c,_ in choices})
        lower.append(1.)
        upper.append(np.inf)
    matrix = csr_matrix(([value for row in rows for value in row.values()],
        ([i for i,row in enumerate(rows) for _ in row],[j for row in rows for j in row])),shape=(len(rows),len(groups)))
    result = milp(np.ones(len(groups)),integrality=np.ones(len(groups)),bounds=Bounds(minimum,np.ones(len(groups))),
                  constraints=LinearConstraint(matrix,lower,upper))
    if not result.success:
        raise ValueError('有见证的尺寸未能构成候选覆盖：'+result.message)
    return {group for group,x in zip(groups,result.x) if x>.5}


def assign_dimensions(dimensions, candidates, *, context, legacy=None):
    """完整成功返回每个原 D 恰一次；不足抛带部分归属和审计的异常。"""
    ids, keys = [d.get('_id') for d in dimensions], [c['view_key'] for c in candidates]
    if None in ids or len(ids) != len(set(ids)):
        raise ValueError('原 D 编号必须完整且唯一')
    if len(keys) != len(set(keys)):
        raise ValueError('候选 view_key 重复')
    features = {str(p.get('name', i)): dict(enumerate(p.get('features', []), 1))
                for i, p in enumerate(context.get('parts', []), 1)}
    parts = {d['_id']: _part_for(d, candidates, context) for d in dimensions}
    part_dimensions = {}
    for item in context.get('dimensions', dimensions):
        owner = parts.get(item['_id']) or _part_for(item,candidates,context)
        part_dimensions.setdefault(owner,[]).append(item)
    endpoints = {}
    for d in dimensions:
        w, part = d.get('_witness_3d') or {}, parts[d['_id']]
        if not w.get('axis') or w.get('point') is None:
            continue
        primary = tuple(w['point'])
        group = endpoints.setdefault(part, {}).setdefault((w['axis'], primary), [])
        group.append(d['source_feature'])
        coordinate = 'XYZ'.index(w['axis'])
        for entry in w.get('shared_points', []):
            if abs(entry['point'][coordinate]-primary[coordinate]) < 1e-6:
                group.append(entry['feature'])
    indexes, proofs, projections = {}, {}, {}
    fingerprints = {c['view_key']: _projection_key(c) for c in candidates}
    assigned, unresolved, audit = [], [], []
    trial_views, used_features, options = {}, {}, {}
    ordered = sorted(dimensions, key=_dimension_order)
    for d in ordered:
        part, choices, reasons = parts[d['_id']], [], []
        approved = int(d['_id'][1:]) in PROCESS_DEPTHS.get(context.get('problem'),set())
        try:
            process_text = _process_text(d,part_dimensions[part]) if approved else None
        except ValueError as exc:
            failure = _failure(d,part,str(exc))
            unresolved.append(failure)
            audit.append(dict(failure,status='unresolved',value=d.get('value')))
            continue
        assembly = (d.get('_witness_3d') or {}).get('kind')=='assembly_relation'
        for c in candidates:
            if assembly and c.get('frame')!='assembly':
                continue
            if not assembly and (part is None or c.get('frame', 'part') != 'part' or str(c.get('part')) != part):
                continue
            key = c['view_key']
            fingerprint = fingerprints[key]
            try:
                _validate_candidate(c)
                if fingerprint not in projections:
                    if 'project_candidate' not in context:
                        raise ValueError('缺少真实投影回调')
                    projections[fingerprint] = context['project_candidate'](c, scale=1.)
                projection = projections[fingerprint]
                if not assembly and fingerprint not in indexes:
                    indexes[fingerprint] = _ElementIndex(c, projection, features.get(part, {}), part)
                cache_key = (d['_id'], fingerprint)
                if cache_key not in proofs:
                    try:
                        proofs[cache_key] = (_assembly_proof(d,c,projection) if assembly else
                                             _analyse(d,indexes[fingerprint],endpoints.get(part, {}),process_text))
                    except ValueError as exc:
                        proofs[cache_key] = str(exc)
                proof = proofs[cache_key]
                if isinstance(proof, str):
                    raise ValueError(proof)
                proof = dict(copy.deepcopy(proof), view_key=key)
                score = len(projection['lines'])*.028
                if proof['mode'] == 'linear':
                    p, q = map(np.array, proof['points'])
                    e = np.array(proof['direction'])
                    score += abs((q-p)@np.array([-e[1], e[0]]))*.15
                score -= .1 if key == d.get('view_key') else 0
                if proof['mode']=='linear' and '母线之间的直径' in proof['derivation']:
                    score += 3.  # 有真形端视时先尝试直接标在孔口圆上。
                score -= .5 if any(el.get('feature') == d.get('source_feature') and str(el.get('part', part)) == part
                                     for el in c.get('expresses', [])) else 0
                choices.append((score, c, proof))
            except ValueError as exc:
                reasons.append(dict(view_key=key, reason=str(exc)))
        if not choices:
            failure = _failure(d, part, '；'.join(dict.fromkeys(x['reason'] for x in reasons)) or
                               ('装配约束没有唯一特征及装配坐标见证' if part is None else '没有对应零件的候选视图'), candidates=reasons)
            unresolved.append(failure)
            audit.append(dict(failure, status='unresolved', value=d.get('value')))
            continue
        options[d['_id']] = choices
    cover = _view_cover(options,candidates,fingerprints)
    available = {ident:{fingerprints[c['view_key']] for _,c,_ in items} & cover for ident,items in options.items()}
    reserved = Counter(next(iter(groups)) for groups in available.values() if len(groups)==1)
    loads = Counter()
    for d in ordered:
        if d['_id'] not in options:
            continue
        part = parts[d['_id']]
        groups = available[d['_id']]
        if len(groups)==1:
            reserved[next(iter(groups))] -= 1
        choices = [choice for choice in options[d['_id']] if fingerprints[choice[1]['view_key']] in groups]
        if len(dimensions)>40:
            def has_room(choice):
                group = fingerprints[choice[1]['view_key']]
                return loads[group]+reserved[group]<25
            choices = ([choice for choice in choices if has_room(choice)]
                       or [choice for choice in options[d['_id']] if has_room(choice)] or choices)
        # 在等价候选上共享已占空间。不能靠 HEAD 的重复视图制造虚假容量。
        # 此处用原比例 1:1 试固定字高；正式分页仍以 D 的实尺度再排。
        def priority(choice):
            score, candidate, _ = choice
            identity = fingerprints[candidate['view_key']]
            trial = trial_views.get(identity)
            used = used_features.get(identity,set())
            opening = 4. if candidate.get('layout_optional') and not used else 0.
            same_structure = bool(used & set(d.get('covers_features') or [d['source_feature']]))
            return score+opening-(2.5 if same_structure else 0.)+(.15*len(trial[1].get('occupied', [])) if trial else 0.)
        ranked = sorted(choices, key=priority)
        _, c, proof = ranked[0]
        attempted = set()
        for _, candidate, option in ranked if len(dimensions)>1 else ():
            identity = fingerprints[candidate['view_key']]
            if identity in attempted:
                continue
            attempted.add(identity)
            if identity not in trial_views:
                projection = projections[identity]
                box = g2.bounds(projection['lines'])
                runtime = SimpleNamespace(geom=projection, scale=1., box_geom=box, marks=Marks(), occ=Occupancy(box))
                for curve in projection['lines']:
                    runtime.occ.add_curve(curve)
                trial_views[identity] = runtime, {}
            runtime, state = trial_views[identity]
            runtime.view_key = candidate['view_key']
            result = _layout(runtime, [dict(d, _dimension_witness=option)], {}, state)
            if result['dimensions']:
                c, proof = candidate, option
                break
        out = copy.deepcopy(d)
        if proof.get('process_text'):
            out['text'] = proof['process_text']
        loads[fingerprints[c['view_key']]] += 1
        used_features.setdefault(fingerprints[c['view_key']],set()).update(d.get('covers_features') or [d['source_feature']])
        out.update(view_key=c['view_key'], view=c.get('name', c['view_key']), _dimension_witness=proof)
        if c.get('_head_sheet'):
            out['_head_sheet'] = c['_head_sheet']
        row = dict(part=part, feature=d.get('source_feature'), covers_features=copy.deepcopy(d.get('covers_features', [])),
                   parameters=proof['parameters'], id=d['_id'], value=d.get('value'), view_key=c['view_key'],
                   sheet=None, head_sheet=c.get('_head_sheet'), status='assigned', witnesses=proof['elements'], derivation=proof['derivation'])
        row['feature_relations'] = _relations(d, proof)
        out['_dimension_audit'] = row
        assigned.append(out)
        audit.append(copy.deepcopy(row))
    order = {ident:i for i,ident in enumerate(ids)}
    assigned.sort(key=lambda item: order[item['_id']])
    audit.sort(key=lambda item: order[item['id']])
    unresolved.sort(key=lambda item: order[item['id']])
    context['dimension_audit'] = audit
    if unresolved:
        details = '; '.join(f"{r['id']} 零件{r.get('part')} 特征{r.get('feature')}: {r['reason']}"
                            for r in unresolved)
        raise DimensionAssignmentError('请 A/B 补尺寸见证：' + details,
                                       unresolved=unresolved, assignments=assigned, audit=audit)
    return assigned


class ProjectedDatums:
    """在有限可见棱和实际中心线中查找原三维要素的二维投影。"""
    def __init__(self, candidate, geometry):
        from scipy.spatial import cKDTree
        self.c = candidate
        self.geometry = geometry
        self.lines = [c for c in geometry['lines'] if _visible(c) or c['type'] == 'center']
        self.tags = {}
        for el in geometry.get('witness_elements', []) + candidate.get('witness_elements', []):
            if el.get('curve') and el.get('feature') is not None:
                self.tags.setdefault((str(el.get('part')),el['feature']), []).append(el)
        self.tree = None
        self.cache = {}
        self.ready = False
        self.support_cache = {}

    def hit(self, p):
        key = tuple(np.round(p,5))
        if key in self.cache:
            return self.cache[key]
        if not self.ready:
            from scipy.spatial import cKDTree
            samples = [g2.sample(c,.65) for c in self.lines]
            if samples:
                self.tree = cKDTree(np.concatenate(samples))
                self.owners = np.repeat(np.arange(len(samples)),[len(s) for s in samples])
            self.ready = True
        result = None
        if self.tree is not None:
            indices = self.tree.query_ball_point(p, .48)
            for i in dict.fromkeys(int(self.owners[j]) for j in indices):
                curve = self.lines[i]
                if _distance(curve,p) < .035:
                    result = dict(kind='centerline' if curve['type']=='center' else 'contour',
                                  curve=curve,provenance='原三维点在有限实际图线上的投影')
                    break
        self.cache[key] = result
        return result

    def feature_anchor(self, part, fid, f, diameter=None):
        """只有在原特征解析边与可见图线实际重合时才采用该点。"""
        key = (part,fid,diameter)
        if key in self.support_cache:
            return self.support_cache[key]
        result = None
        for el in self.tags.get((part,fid), []) if diameter is None else ():
            curve = el['curve']
            pts = g2.sample(curve,max(.15,g2.length(curve)/8))
            for p in pts[len(pts)//2:]:
                hit = self.hit(p)
                if hit:
                    result = (p.tolist(),dict(el, curve=hit['curve']))
                    break
            if result:break
        if not result:
            for support in _supports(f,self.c):
                pts = g2.sample(support,max(.15,g2.length(support)/8))
                for j in range(1,len(pts)-1):
                    hit = self.hit(pts[j])
                    if hit and hit['kind']=='contour' and _distance(hit['curve'],pts[j-1]) < .045 and _distance(hit['curve'],pts[j+1]) < .045:
                        result = (pts[j].tolist(),dict(hit,part=part,feature=fid,provenance='原特征解析边与成品可见轮廓的连续重合'))
                        break
                if result:break
        self.support_cache[key]=result
        return result


def geometric_dimension(d, index, part, previous=None):
    """方向实长并检查两个投影端点。深度不同不改变定向距离。"""
    w = d.get('_witness_3d') or {}
    if d['type']!='linear' or not w.get('axis') or not all(k in w for k in ('from','to')):
        return None
    c=index.c
    axis=np.eye(3)['XYZ'.index(w['axis'])]
    if abs(axis @ c['direction']) > 1e-6:
        return None
    direction=np.array([axis @ c['u'],axis @ c['v']])
    # 同一链式坐标的共有基准也可由原规格明确列出的同层要素承载。
    ends=[]
    for side,other in [('from',previous),('to',d)]:
        options=[w[side]]
        if other:
            ow=other['_witness_3d']
            options += [q['point'] for q in ow.get('shared_points',[])
                        if abs((np.array(q['point'])-w[side])@axis)<1e-6]
        hits=[]
        for xyz in options:
            p=_project(xyz,c)
            el=index.hit(p)
            if el:hits.append((p,el,xyz))
        if not hits:return None
        ends.append(hits)
    pairs=[(a,b) for a in ends[0] for b in ends[1]
           if abs(abs((a[0]-b[0])@direction)-d['value'])<.001]
    if not pairs:return None
    a,b=min(pairs,key=lambda pair:np.linalg.norm(pair[0][0]-pair[1][0]))
    return dict(mode='linear',part=part,feature=d['source_feature'],view_key=c['view_key'],
                points=[a[0].tolist(),b[0].tolist()],direction=direction.tolist(),parameters=_parameters(d),
                elements=[a[1],b[1]],datums_3d=[a[2],b[2]],method='geometry',
                derivation='投影平面含测量方向，原三维基准点落在可见轮廓或真实中心线')


def visible_parameter(d,index,part,previous=None):
    w=d['_witness_3d']
    f=w.get('feature') or {}
    c=index.c
    if w.get('kind')=='assembly_relation':
        for rel in w['relations']:
            for el in rel['elements']:
                if not el.get('feature'):continue
                for pt in [el['point']]+el.get('endpoints',[]):
                    p=_project(pt,c)
                    hit=index.hit(p)
                    if hit:
                        return dict(mode='leader',part=el['part'],feature=el['feature'],view_key=c['view_key'],
                                    elements=[hit],anchor_point=p.tolist(),method='callout',
                                    parameters=_parameters(d),derivation='原装配基准与图线重合；完整配合关系见引注')
        return None
    fid=d['source_feature']
    chain=d.get('type')=='linear' and w.get('axis') and 'to' in w
    if chain:
        axis=np.eye(3)['XYZ'.index(w['axis'])]
        if abs(axis@c['direction'])>1e-6:return None
        e=np.array([axis@c['u'],axis@c['v']]);q=_project(w['to'],c);level=float(q@e)
        choice=None
        for xyz in [w['to']]+[s['point'] for s in w.get('shared_points',[]) if abs((np.asarray(s['point'])-w['to'])@axis)<1e-6]:
            pt=_project(xyz,c);hit=index.hit(pt)
            if hit:
                choice=(pt.tolist(),hit);break
        if not choice:
            # 同一端面上可换引出点，但该点必须仍在原测量坐标层及真实轮廓上。
            for curve in _supports(f,c):
                for pt in _intersections(curve,e,level):
                    hit=index.hit(pt)
                    if hit and abs(np.asarray(pt)@e-level)<.001:
                        choice=(np.asarray(pt).tolist(),hit);break
                if choice:break
    else:
        if '径' in d['category'] and '分布圆' not in d['category'] and f.get('type')=='extrude':
            circles=[lp for lp in f['loops'] if 'circle' in lp]
            if circles:
                matching=[lp for lp in circles if abs(lp.get('d',lp.get('r',0)*2)-d['value'])<.01]
                if not matching:return None
                f=dict(f,loops=matching)
        diameter=d['value'] if '径' in d['category'] and len(w.get('feature',{}).get('loops',[]))>1 else None
        choice=index.feature_anchor(part,fid,f,diameter)
    if choice is None:return None
    p,element=choice
    text=_text(d)
    if chain:
        ref=previous['_id']+'终端' if previous else '零件原点'
        text=f"{f['name']}定位，距{ref}沿{w['axis']}向 {d['value']:g}"
    return dict(mode='leader',part=part,feature=fid,parameters=_parameters(d),view_key=c['view_key'],
                elements=[element],anchor_point=p,method='callout',callout_text=text,
                derivation='引注于原特征的实际可见轮廓；原尺寸值及基准由文字说明')


def resolve_delivery(data, views, aliases, owners, handoff):
    """依次采用交付的身份见证、实长投影、实际切面和具名引注。返回逐 D 的结果及例外。"""
    import json
    from collections import defaultdict
    import drawing_views
    from drawkit import model
    dims=[d for s in data['spec']['sheets'] for d in s['dimensions']]
    parts={str(p['name']):p for p in data['description']['parts']}
    prior={}
    if (handoff/'assignments.json').exists():
        prior={d['_id']:d for d in json.loads((handoff/'assignments.json').read_bytes())}
    ends={(owners[d['_id']][0],w['axis'],tuple(w['to'])):d for d in dims
          if d['type']=='linear' and (w:=d['_witness_3d']).get('axis') and 'to' in w}
    endpoint_features=defaultdict(dict)
    for (part,axis,point),source in ends.items():
        endpoint_features[part][axis,point]=[source['source_feature']]+[
            item['feature'] for item in source['_witness_3d'].get('shared_points',[])]
    index_cache={}
    assigned,missing,loads,models,cutkeys={},[],Counter(),{},{}
    for d in dims:
        ident=d['_id'];part,frame,head,name=owners[ident]
        w=d['_witness_3d'];f=w.get('feature') or {};fid=d['source_feature']
        previous=ends.get((part,w.get('axis'),tuple(w.get('from',[]))))
        pool=[(k,i) for k,i in views.items() if i.c['frame']==frame and (frame=='assembly' or str(i.c.get('part'))==part)]
        key=None; proof=None; text=_text(d)
        old=prior.get(ident)
        if old and old['value']==d['value'] and old['view_key'] in aliases:
            key=aliases[old['view_key']]
            proof=dict(old['_dimension_witness'],method='identity',view_key=key)
            proof.pop('alternatives',None)
            text=proof.get('process_text') or _text(d)
        else:
            # 优先本结构已有视图，优先容纳同组相关尺寸。
            pool.sort(key=lambda kv:(not(kv[1].c.get('name')==name),not(0<loads[kv[0]]<10),len(kv[1].lines)))
            if frame=='assembly':
                for k,idx in pool:
                    if not idx.tags:continue
                    try:
                        p=_assembly_proof(d,idx.c,idx.geometry)
                    except ValueError:
                        continue
                    proof=dict(p,method='identity');key=k;break
            if not prior and frame=='part':
                for k,idx in pool:
                    if k not in index_cache:
                        index_cache[k]=_ElementIndex(idx.c,idx.geometry,dict(enumerate(parts[part]['features'],1)),part)
                    try:
                        p=_analyse(d,index_cache[k],endpoint_features[part])
                    except ValueError:
                        continue
                    if p.get('elements'):
                        proof=dict(p,method='identity');proof.pop('alternatives',None);key=k;break
            for k,idx in ([] if proof else pool):
                p=geometric_dimension(d,idx,part,previous)
                if p:
                    key,proof=k,p;break
            if not proof:
                for k,idx in sorted(pool,key=lambda kv:(not kv[1].c.get('section') if f.get('op')=='cut' else False,
                                                         not bool(kv[1].tags.get((part,fid))),not(0<loads[kv[0]]<10))):
                    p=visible_parameter(d,idx,part,previous)
                    if p:
                        key,proof=k,p;break
        if not proof and frame=='assembly':
            elements=[e for r in w['relations'] for e in r['elements'] if e.get('feature')]
            names=list(dict.fromkeys(e['part'] for e in elements))
            for n in names:
                if n not in models:models[n]=model.build_part(parts[n],int(n))
            shapes={n:models[n].placed() for n in names}
            for normal in np.eye(3):
                point=np.asarray(elements[0]['point'],float)
                # 平面取配合厚度中部，避免在恰好共面的两零件端面间作退化布尔。
                depths=[np.dot(e['point'],normal) for e in elements]
                point=point+normal*(np.mean(depths)-point@normal)
                c,g=drawing_views.cut_at_datum(names[0],shapes,point,normal,'配合断面·件'+'、'.join(names))
                k=f"{data['problem']}:配合:{ident}";c['view_key']=k
                ix=ProjectedDatums(c,g)
                p=visible_parameter(d,ix,part,previous)
                if p:
                    views[k]=ix;key,proof=k,dict(p,method='section');break
        if not proof and frame=='part':
            # 在原基准/刀具中部或 R/C 选边处剖最终零件，以真实界面为引注位置。
            if part not in models:
                models[part]=model.build_part(parts[part],int(part))
                if models[part].error:raise ValueError(models[part].error)
            finish=f.get('type') in ('fillet','chamfer')
            cuts=[]
            if f.get('type')=='revolve':
                o,u,v,n=_frame(f)
                name='回转母线剖面·'+f['name']
                k=f"{data['problem']}:{part}:回转{fid}"
                if k not in views:
                    c,g=drawing_views.cut_at_datum(part,models[part].shape,o,n,name)
                    c['view_key']=k
                    profile=f['loops'][0]['path']
                    axis_pts=[_project(o+v*min(p[1] for p in profile),c),_project(o+v*max(p[1] for p in profile),c)]
                    g['lines'].append(g2.line(*axis_pts,'center'))
                    # 埋入其他特征的回转截面用双点画原母线，并以图名明确其含义。
                    for sign in (-1,1):
                        poly=[_project(o+u*sign*r+v*z,c) for r,z in profile]
                        for p1,p2 in zip(poly,poly[1:]+poly[:1]):
                            if np.linalg.norm(p1-p2)>1e-6:g['lines'].append(g2.line(p1,p2,'phantom'))
                    views[k]=ProjectedDatums(c,g)
                idx=views[k];c=idx.c
                z=d['_witness_3d']['projected_anchor']['at'][1]-o[2]
                radius=d['value']/2
                pts=[_project(o+v*z+u*sign*radius,c) for sign in (-1,1)]
                els=[]
                for p in pts:
                    hit=idx.hit(p)
                    if hit is None:
                        curve=next((l for l in idx.geometry['lines'] if l['type']=='phantom' and _distance(l,p)<.03),None)
                        if curve:hit=dict(kind='profile',curve=curve,provenance='原回转母线的真实点')
                    if hit:els.append(hit)
                if len(els)==2:
                    key=k;proof=dict(mode='linear' if radius else 'leader',view_key=k,part=part,feature=fid,
                                     points=[p.tolist() for p in pts],direction=_unit(_project(o+u,c)-_project(o,c)).tolist(),
                                     anchor_point=pts[0].tolist(),elements=els,parameters=_parameters(d),method='section',
                                     derivation='过原回转轴的成品断面；双点画线为原工序母线')
            if finish:
                from OCP.BRepAdaptor import BRepAdaptor_Curve
                import drawing_common as dc
                for pt in f['edges'][:2]:
                    # 原选边切向定义法截面，真实截面中的圆弧/倒角斜边再决定落点。
                    before=next(s.result for s in models[part].steps if s.index==fid-1)
                    from OCP.BRepExtrema import BRepExtrema_DistShapeShape
                    from OCP.BRepBuilderAPI import BRepBuilderAPI_MakeVertex
                    vertex=BRepBuilderAPI_MakeVertex(model.pnt(pt)).Vertex()
                    for e in dc.FinalEdgeWitnesses.edges(before):
                        distance=BRepExtrema_DistShapeShape(vertex,e)
                        if distance.IsDone() and distance.Value()<.051:
                            ac=BRepAdaptor_Curve(e)
                            from OCP.gp import gp_Pnt,gp_Vec
                            pos,vec=gp_Pnt(),gp_Vec()
                            t=distance.ParOnEdgeS2(1) if distance.SupportTypeShape2(1).name=='BRepExtrema_IsOnEdge' else (ac.FirstParameter()+ac.LastParameter())/2
                            ac.D1(t[0] if isinstance(t,tuple) else t,pos,vec)
                            cuts.append((pt,list(vec.Coord())));break
                for pt in f['edges'][:1]:
                    cuts += [(pt,normal) for normal in np.eye(3)]
                if fid>1:
                    for a,b,radius in _cylinders(parts[part]['features'][fid-2]):
                        axis=_unit(b-a)
                        seed=np.asarray(f['edges'][0])
                        center=a+axis*((seed-a)@axis)
                        radial=seed-center
                        if abs(np.linalg.norm(radial)-radius) < .05:
                            for angle in np.arange(45,360,45):
                                theta=np.radians(angle)
                                v=radial*np.cos(theta)+np.cross(axis,radial)*np.sin(theta)
                                cuts.append((center+v,np.cross(axis,v)))
            else:
                cyl=_cylinders(f)
                if cyl:
                    a,b,_=cyl[0]; axis=_unit(b-a);mid=(a+b)/2
                    cuts.append((mid,axis))
                    cuts.append((mid,np.cross(axis,np.eye(3)[np.argmin(abs(axis))])))
                if 'to' in w:
                    pt=np.array(w['to'])
                    if 'axis' in w:
                        axis=np.eye(3)['XYZ'.index(w['axis'])]
                        delta=pt-np.array(w['from'])
                        if np.linalg.norm(np.cross(axis,delta))>1e-5:cuts.append((pt,np.cross(axis,delta)))
                    cuts += [(pt,n) for n in np.eye(3)]
                if f.get('type')=='extrude':
                    o,u,v,n=_frame(f); lp=f['loops'][0]
                    xy=(np.array(lp['rect']).reshape(2,2).mean(axis=0) if 'rect' in lp else
                        np.mean(lp['path'],axis=0) if 'path' in lp else lp.get('circle',[0,0]))
                    mid=o+u*xy[0]+v*xy[1]+n*np.mean(f['depth'])
                    cuts += [(mid,normal) for normal in [n,u,v]]
            for pt,n in ([] if proof else cuts):
                n=_unit(n);stamp=(part,*np.round(n,6),round(n@pt,5))
                if stamp not in cutkeys:
                    k=f"{data['problem']}:{part}:剖{len(cutkeys)+1}"
                    c,g=drawing_views.cut_at_datum(part,models[part].shape,pt,n,'断面·'+f.get('name','定位'))
                    c['view_key']=k
                    cutkeys[stamp]=k
                    views[k]=ProjectedDatums(c,g)
                k=cutkeys[stamp];idx=views[k]
                p=geometric_dimension(d,idx,part,previous)
                if not p and finish:
                    point=_project(pt,idx.c); value=float(d['value'])
                    lines=[l for l in idx.lines if _visible(l) and
                           ((f['type']=='fillet' and l['geom'] in ('arc','circle') and abs(l['r']-value)<.035) or
                            (f['type']=='chamfer' and l['geom']=='line' and abs(g2.length(l)-value*math.sqrt(2))<.09))]
                    for line in sorted(lines,key=lambda l:_distance(l,point)):
                        if _distance(line,point)<=1.55*value:
                            ep=g2.sample(line,max(.05,g2.length(line)/4))
                            p=dict(part=part,feature=fid,mode='leader',parameters=_parameters(d),view_key=k,
                                   elements=[dict(kind='final_edge',curve=line,part=part,feature=fid)],
                                   anchor_point=ep[len(ep)//2].tolist(),method='section',derivation='原选边法截面内成品圆弧/倒角的实测值')
                            break
                if not p:p=visible_parameter(d,idx,part,previous)
                if p:
                    key,proof=k,dict(p,method='section');break
        if not proof and frame=='part':
            extra=operation_section(d,previous,part,models[part].shape)
            if extra:
                c,g,proof=extra
                key=f"{data['problem']}:{part}:工序{fid}:{w['axis']}"
                c['view_key']=key;views[key]=ProjectedDatums(c,g)
        if proof:
            if not proof.get('elements'):raise ValueError((ident,'空见证'))
            if int(ident[1:]) in PROCESS_DEPTHS.get(data['problem'],set()):
                text=_process_text(d,[other for other in dims if owners[other['_id']][0]==part])
            else:text=proof.get('callout_text',text)
            proof['view_key']=key
            assigned[ident]=dict(d,view_key=key,_dimension_witness=proof,display_text=text)
            loads[key]+=1
        else:
            missing.append(dict(id=ident,part=part,feature=fid,name=f.get('name'),type=d['category'],value=d['value']))
    return assigned,missing


def operation_section(d,previous,part,body):
    """加工终止落入已有空腔或并入后续实体时，用原工具截面复核该工序尺寸。"""
    import drawing_views
    from drawkit import model
    w=d['_witness_3d'];f=w['feature']
    if 'axis' not in w or 'to' not in w or f['type'] not in ('extrude','hole'):
        return None
    tool_f=dict(f,op='add')
    if f['type']=='hole':
        tool_f.update(type='extrude',loops=[dict(circle=f['at'],d=f['d'])],depth=[-f['depth'],0])
    tool=model.build_part(dict(name=part,features=[tool_f]),1)
    if tool.error:return None
    lo,hi=model.shape_bbox(tool.shape)
    middle=(np.asarray(lo)+hi)/2
    axis=np.eye(3)['XYZ'.index(w['axis'])]
    for direction in sorted(np.eye(3),key=lambda n:abs(n@axis)):
        if abs(direction@axis)>.001:continue
        c,g=drawing_views.cut_at_datum(part,body,middle,direction,'工序断面·'+f['name'])
        _,profile=drawing_views.cut_at_datum(part,tool.shape,middle,direction,'工具截面')
        if not profile['hatches'] or not g['hatches']:continue
        e=np.array([axis@c['u'],axis@c['v']]);goal=_project(w['to'],c);level=goal@e
        hits=[]
        for line in profile['lines']:
            if not _visible(line):continue
            actual=dict(line,type='phantom')
            g['lines'].append(actual)
            for point in _intersections(line,e,level):
                hits.append((np.linalg.norm(point-goal),point,actual))
        if not hits:continue
        _,at,curve=min(hits,key=lambda item:item[0])
        datum=previous['_id']+'终端' if previous else '零件原点'
        text=f"{f['name']}工序终端距{datum}，{w['axis']}向 {d['value']:g}"
        proof=dict(mode='leader',part=part,feature=d['source_feature'],parameters=_parameters(d),
                   elements=[dict(kind='profile',curve=curve,feature=d['source_feature'],part=part)],
                   anchor_point=at.tolist(),method='operation',callout_text=text,
                   derivation='成品实体与原工序实体同平面实截；双点画线指示工序边界，原 D 坐标层在该边界上')
        return c,g,proof
    return None


def _support_key(curve):
    if curve['geom'] in ('circle', 'arc'):
        return 'circle', [*curve['center'], curve['r']]
    if curve['geom'] == 'line':
        a, b = np.array(curve['from']), np.array(curve['to'])
        if np.linalg.norm(b-a) < TOL:
            return None
        e = _unit(b-a)
        if (abs(e[0]) > 1e-7 and e[0] < 0) or (abs(e[0]) <= 1e-7 and e[1] < 0):
            e = -e
        return 'line', [e[0]*100, e[1]*100, np.array([-e[1], e[0]])@a]
    return None


def _inclined_axes(candidate, cylinder, contours, tagged, drawn):
    """由斜投影椭圆反算端面圆，不把任意折线或单独的 center 标签当作孔轴。"""
    a, b, radius = cylinder
    axis = _unit(b-a)
    cosine = abs(axis@candidate['direction'])
    if cosine < 1e-5 or cosine > 1-1e-7:
        return []
    basis1 = _unit(np.cross(axis, candidate['direction']))
    basis2 = np.cross(axis, basis1)
    matrix = np.array([candidate['u'], candidate['v']])@np.array([basis1, basis2]).T
    inv = np.linalg.inv(matrix)
    pa, pb = _project(a,candidate), _project(b,candidate)
    direction = _unit(pb-pa)
    normal = np.array([-direction[1],direction[0]])
    out = []
    for center in (pa,pb):
        support, offsets = [], []
        for el in contours:
            c = el['curve']
            if c['geom'] != 'polyline' or len(c['points'])<3:
                continue
            pts = np.asarray(c['points'])-center
            if max(abs(np.linalg.norm(pts@inv.T,axis=1)-radius)) < TOL:
                support.append(el)
                offsets.extend(pts@normal)
        if not offsets or min(offsets)>-radius*.25 or max(offsets)<radius*.25:
            continue
        for el in tagged:
            line = el['curve']
            if el['kind']!='axis' or line.get('type')!='center' or line['geom']!='line' or line not in drawn:
                continue
            ends = np.asarray([line['from'],line['to']])-center
            lo, hi = sorted(ends@direction)
            if max(abs(ends@normal))<TOL and lo < -TOL and hi > TOL:
                # 保留认得出孔口的有限区段，不让很长的同支持线作异地基准。
                half = radius*cosine+3.
                segment = g2.line(center+max(lo,-half)*direction, center+min(hi,half)*direction, 'center')
                out.append(dict(el, curve=segment, support=support, retained_axis=line,
                                provenance='projected finite cylinder axis / retained centerline / verified elliptic rim'))
    return out


class _ElementIndex:
    def __init__(self, candidate, projection, features, part):
        self.c, self.projection, self.features, self.part = candidate, projection, features, part
        self.lines = [c for c in projection.get('lines', []) if _visible(c)]
        self.cache, self.tagged = {}, {}
        self.line_keys = {repr(c) for c in self.lines}
        for el in list(candidate.get('witness_elements', []))+list(projection.get('witness_elements', [])):
            if str(el.get('part')) == part and el.get('provenance') and el.get('curve'):
                self.tagged.setdefault(el['feature'], []).append(el)
        self.authoritative = 'witness_elements' in candidate or 'witness_elements' in projection
        if self.authoritative:
            return
        from scipy.spatial import cKDTree
        self.supports = {i: list({repr(c): c for c in _supports(f, candidate)}.values()) for i, f in features.items()}
        families = {}
        for fid, supports in self.supports.items():
            for support in supports:
                key = _support_key(support)
                if key:
                    families.setdefault(key[0], []).append((key[1], fid, support))
        trees = {kind: cKDTree([item[0] for item in entries]) for kind, entries in families.items()}
        self.matches = {}
        for line in self.lines:
            key = _support_key(line)
            if not key or key[0] not in trees:
                continue
            matches = [(families[key[0]][i][1], families[key[0]][i][2])
                       for i in trees[key[0]].query_ball_point(key[1], .06)
                       if _same_support(line, families[key[0]][i][2])]
            for fid, support in matches:
                self.matches.setdefault(fid, []).append((line, support, matches))

    def get(self, fid):
        if fid not in self.cache:
            self.cache[fid] = self._build(fid)
        return self.cache[fid]

    def _build(self, fid):
        out = []
        for el in self.tagged.get(fid, []):
            curve = el['curve']
            if el['kind'] == 'axis':
                # 标签本身不能证明轴线：由下文已验证轮廓推导。
                continue
            if repr(curve) in self.line_keys or _retained(curve, self.lines):
                out.append(copy.deepcopy(el))
        if not out and self.authoritative:
            return []  # A/B 的身份列表是权威；缺项不能由匿名二维线偷偷补成证明。
        if not out:
            if self.features.get(fid, {}).get('type') in ('fillet', 'chamfer'):
                return []  # 原选边点不是 R/C 的最终边证明。
            for line, support, matches in self.matches.get(fid, []):
                if line['geom'] == 'line':
                    a, b = np.array(support['from']), np.array(support['to'])
                    e = _unit(b-a)
                    lo, hi = sorted(np.array([line['from'], line['to']])@e)
                    sl, sh = sorted([a@e, b@e])
                    lo, hi = max(lo, sl), min(hi, sh)
                    if hi-lo < TOL:
                        continue
                    curve = g2.line(a+(lo-a@e)*e, a+(hi-a@e)*e, 'visible')
                else:
                    curve = copy.deepcopy(line)
                samples = g2.sample(curve, max(.5, g2.length(curve)/8))
                # 重合支持线的特征归属不能靠二维距离猜；交由 A/B 明确。
                if any(i != fid and any(_distance(other, p) < TOL for p in samples[1:-1]) for i, other in matches):
                    continue
                out.append(dict(part=self.part, feature=fid, kind='contour', curve=curve, parameters=[],
                                provenance='feature geometry / final visible curve intersection'))
        unique = {repr(x['curve']): x for x in out}
        out = list(unique.values())
        for a, b, r in _cylinders(self.features.get(fid, {})):
            pa, pb = _project(a, self.c), _project(b, self.c)
            out.extend(_inclined_axes(self.c, (a,b,r), list(out), self.tagged.get(fid, []),
                                      self.projection.get('lines', [])))
            if np.linalg.norm(pb-pa) < TOL:
                circles = [el for el in out if el['curve']['geom'] in ('arc', 'circle') and abs(el['curve']['r']-r) < TOL]
                # 只在完整真形圆成立时从圆心推导轴线，残弧不能补十字。
                if any(el['curve']['geom'] == 'circle' for el in circles):
                    for delta in (np.array([r, 0]), np.array([0, r])):
                        out.append(dict(part=self.part, feature=fid, kind='axis', curve=g2.line(pa-delta, pa+delta, 'center'),
                                        parameters=[], provenance='true-form cylindrical contour', support=copy.deepcopy(circles)))
            else:
                e = _unit(pb-pa)
                normal = np.array([-e[1], e[0]])
                side_elements = [[el for el in out if el['curve']['geom'] == 'line' and _same_support(el['curve'],
                    g2.line(pa+normal*r*sign, pb+normal*r*sign, 'visible'))] for sign in (-1, 1)]
                for first in side_elements[0]:
                    for second in side_elements[1]:
                        lo1, hi1 = sorted((np.array([first['curve']['from'], first['curve']['to']])-pa)@e)
                        lo2, hi2 = sorted((np.array([second['curve']['from'], second['curve']['to']])-pa)@e)
                        lo, hi = max(0., lo1, lo2), min(np.linalg.norm(pb-pa), hi1, hi2)
                        if hi-lo > TOL:
                            out.append(dict(part=self.part, feature=fid, kind='axis', curve=g2.line(pa+e*lo, pa+e*hi, 'center'),
                                            parameters=[], provenance='overlap of two visible cylindrical generators',
                                            support=copy.deepcopy([first, second])))
        return out

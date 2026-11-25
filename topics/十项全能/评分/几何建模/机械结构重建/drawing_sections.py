"""B 包：按孔轴/腔室选单平面剖视，保留精确布尔截面及来源标记。

页码、尺寸及外视隐藏线由其他包决定。重复 HEAD 候选保留原匹配名和键。
"""
import copy
import math
import re

import numpy as np

import drawing_common as common
from drawkit import geom2d as g2, model, project


def _unit(vector):
    v = np.asarray(vector, float)
    if v.shape != (3,) or not np.isfinite(v).all() or np.linalg.norm(v) < 1e-10:
        raise ValueError('剖切方向必须是有限的非零三维向量')
    return v / np.linalg.norm(v)


def _plane(feature):
    """复用原建模器坐标约定，也保留顶层 origin 与反向命名平面。"""
    frame = model.sketch_frame(feature)
    return frame.o, frame.xd, frame.yd, frame.n


def _depth(feature):
    depth = feature.get('depth', 0)
    if isinstance(depth, (int, float)):
        return (-float(depth), 0.) if feature['type'] == 'hole' else (0., float(depth))
    return tuple(map(float, depth))


def _polygon(loop):
    if 'rect' in loop:
        x0, y0, x1, y1 = loop['rect']
        return np.array([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], float)
    path = loop.get('path')
    if isinstance(path, list) and path and all(isinstance(p, list) and len(p) == 2 for p in path):
        return np.array(path, float)
    return None


def _feature_records(part, assembly=False):
    """只解释可溯源的拉伸/孔；不猜测倒圆后拓扑身份。"""
    transform = model.placement_matrix(part.get('placement')) if assembly else np.eye(4)
    records = []
    for i, f in enumerate(part.get('features', []), 1):
        if f.get('type') not in ('extrude', 'hole'):
            continue
        o, u, v, n = _plane(f)
        o = transform[:3, :3] @ o + transform[:3, 3]
        u, v, n = (transform[:3, :3] @ a for a in (u, v, n))
        lo, hi = sorted(_depth(f))
        loops = f.get('loops', []) if f['type'] == 'extrude' else [dict(circle=f.get('at', [0, 0]), d=f['d'])]
        rec = dict(part=str(part['name']), feature=i, definition=f, o=o, u=u, v=v, n=n,
                   lo=lo, hi=hi, loops=loops, cut=f.get('op') == 'cut' or f['type'] == 'hole')
        if loops and 'circle' in loops[0]:
            xy = np.array(loops[0]['circle'], float)
            rec.update(axis=o+xy[0]*u+xy[1]*v, radius=float(loops[0].get('d', 2*loops[0].get('r', 0)))/2)
            rec['center'] = rec['axis']+n*((lo+hi)/2)
        elif loops and (poly := _polygon(loops[0])) is not None:
            rec['poly'] = poly
            xy = (poly.min(axis=0)+poly.max(axis=0))/2
            rec['center'] = o+xy[0]*u+xy[1]*v+n*((lo+hi)/2)
            rec['vertices'] = np.array([o+p[0]*u+p[1]*v+n*d for d in (lo, hi) for p in poly])
        else:
            continue
        records.append(rec)
    return records


def _paths(rec, *leaves):
    return [f"features[{rec['feature']-1}].{leaf}" for leaf in leaves]


def _parameters(rec):
    if rec['definition']['type'] == 'hole':
        return _paths(rec, 'plane.origin', 'plane.normal', 'at', 'd', 'depth')
    return _paths(rec, 'plane', 'loops', 'depth')


def _plane_range(rec, normal):
    if 'vertices' in rec:
        ds = rec['vertices'] @ normal
        return ds.min(), ds.max()
    c = float(rec['center'] @ normal)
    a = abs(float(rec['n'] @ normal))
    r = rec['radius']*math.sqrt(max(0., 1-a*a))+(rec['hi']-rec['lo'])/2*a
    return c-r, c+r


def _choose_point(candidate, records):
    """少量孔轴/腔室平面打分，不读取尺寸坐标链来拼带。"""
    n = _unit(candidate['direction'])
    old = np.array(candidate['section']['point'], float)
    cuts = [r for r in records if r['cut']]
    options = [old]+[r['center'] for r in cuts]
    if not cuts:
        return old.tolist()

    def score(p):
        depth = float(p @ n)
        value = 0.
        for r in cuts:
            lo, hi = _plane_range(r, n)
            if depth <= lo+1e-4 or depth >= hi-1e-4:
                continue
            if 'axis' in r and abs(r['n'] @ n) < 1e-7:
                if abs((r['axis']-p) @ n) < 1e-6:
                    length = r['hi']-r['lo']
                    value += r['radius']*min(3., length/max(2*r['radius'], 1.))
                    if re.search('轴承|主轴', r['definition'].get('name', '')):
                        value += 80
                    elif re.search('主孔|主流|主通|检修|贯通', r['definition'].get('name', '')):
                        value += 12
            elif 'poly' in r:
                value += 3+3*(1-abs(depth-(lo+hi)/2)/((hi-lo)/2))
        return value, -abs(float((p-old) @ n))

    best = max(options, key=score)
    return (old+n*float((best-old) @ n)).tolist()


def _hull(points):
    points = sorted(set(tuple(np.round(p, 8)) for p in points))
    def cross(o, a, b):
        return (a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0])
    lower, upper = [], []
    for p in points:
        while len(lower) > 1 and cross(lower[-2], lower[-1], p) <= 1e-10:
            lower.pop()
        lower.append(p)
    for p in reversed(points):
        while len(upper) > 1 and cross(upper[-2], upper[-1], p) <= 1e-10:
            upper.pop()
        upper.append(p)
    return [list(p) for p in lower[:-1]+upper[:-1]]


def _rib_regions(candidate, records):
    pj = project.Projector(candidate)
    p = np.array(candidate['section']['point'], float)
    by_part = {}
    for r in records:
        if r['cut'] or 'vertices' not in r or not re.search('肋|隔板|隔桥|中层板|加强|三角撑', r['definition'].get('name', '')):
            continue
        vertices = r['vertices']
        axes = [r['u'], r['v'], r['n']]
        widths = np.ptp(vertices @ np.array(axes).T, axis=0)
        thin = int(np.argmin(widths))
        if widths[thin] > .4*sorted(widths)[1] or abs(axes[thin] @ pj.w) < 1-1e-7:
            continue
        lo, hi = _plane_range(r, pj.w)
        if not lo+1e-6 < p @ pj.w < hi-1e-6:
            continue
        poly = r['poly']
        if len(_hull(poly)) != len(set(map(tuple, poly))):
            continue  # 非凸肋不能用凸包补材料。
        region = _hull([pj.to2(q) for q in vertices])
        if len(region) >= 3:
            by_part.setdefault(r['part'], []).append(region)
    return by_part


def _solid_axis(part, assembly):
    """实心轴/销可有端部小螺孔；贯通套筒仍应剖。"""
    if not re.search('轴|销|螺栓|螺钉|杆', part.get('title', '')):
        return None
    records = _feature_records(part, assembly)
    bodies = [r for r in records if not r['cut'] and 'axis' in r]
    if not bodies:
        return None
    body = max(bodies, key=lambda r: (r['hi']-r['lo'])*r['radius']**2)
    for r in records:
        if r['cut'] and 'axis' in r and abs(r['n'] @ body['n']) > .999:
            if r['hi']-r['lo'] >= .8*(body['hi']-body['lo']) and len(r['loops']) == 1:
                return None
    return body


def _unsectioned(candidate, parts):
    n, p = _unit(candidate['direction']), np.array(candidate['section']['point'])
    names = set(candidate['section'].get('unsectioned', []))
    if candidate.get('frame') == 'part' and candidate['section'].get('mode') == 'local':
        return sorted(names)  # 零件图的局部剖可单独揭示轴端盲孔。
    for part in parts:
        if str(part['name']) not in candidate.get('parts', []):
            continue
        axis = _solid_axis(part, candidate.get('frame') == 'assembly')
        if axis is not None and abs(n @ axis['n']) < 1e-7 and abs(n @ (axis['axis']-p)) < 1e-5:
            names.add(str(part['name']))
    return sorted(names)


def _signature(c):
    n = _unit(c['direction'])
    return (c.get('frame', 'part'), c.get('part'), tuple(c.get('parts', [])),
            tuple(np.round(n, 7)), round(float(n @ c['section']['point']), 6),
            tuple(np.round(c['u'], 7)), tuple(np.round(c['v'], 7)), tuple(c.get('origin', [0,0,0])),
            c['section'].get('mode', 'full'), repr(c['section'].get('region')), repr(c.get('keep')))


def _letter(index):
    result = ''
    while True:
        result = chr(65+index % 26)+result
        index = index//26-1
        if index < 0:
            return result


def _pick_parent(candidate, candidates):
    n = _unit(candidate['direction'])
    eligible = [c for c in candidates if c['view_key'] != candidate['view_key']
                and c.get('frame') == candidate.get('frame') and c.get('part') == candidate.get('part')
                and not c.get('section') and c.get('kind') != 'detail'
                and abs(_unit(c['direction']) @ n) < 1e-7]
    if not eligible:
        raise ValueError(f"{candidate['view_key']} 没有能将剖切面表示为直线的来源图")
    return max(eligible, key=lambda c: (c['view_key'] == candidate.get('parent_key'),
                                      c.get('_head_sheet') == candidate.get('_head_sheet'),
                                      not bool(c.get('keep'))))


def _on_boundary(rec, points, tol=.002, *, allow_end=True):
    """后方棱须在原特征侧面；剖切交线还可来自特征的终止面。"""
    q = np.asarray(points)-rec['o']
    xy = np.column_stack([q @ rec['u'], q @ rec['v']])
    z = q @ rec['n']
    if np.any(z < rec['lo']-tol) or np.any(z > rec['hi']+tol):
        return False
    if 'axis' in rec:
        distances = [np.linalg.norm(xy-np.array(lp['circle']), axis=1) for lp in rec['loops']]
        radii = [float(lp.get('d', 2*lp.get('r', 0)))/2 for lp in rec['loops']]
        radial = np.minimum.reduce([abs(d-r) for d, r in zip(distances, radii)])
        within = distances[0] <= radii[0]+tol
        for d, r in zip(distances[1:], radii[1:]):
            within &= d >= r-tol
    else:
        poly, ds = rec['poly'], []
        for a, b in zip(poly, np.roll(poly, -1, axis=0)):
            edge = b-a
            if edge @ edge < 1e-15:
                continue
            t = np.clip((xy-a) @ edge/(edge @ edge), 0, 1)
            ds.append(np.linalg.norm(xy-a-t[:, None]*edge, axis=1))
        radial = np.minimum.reduce(ds)
        within = g2.contains(dict(shape='polygon', points=poly.tolist()), xy) | (radial <= tol)
    end = np.minimum(abs(z-rec['lo']), abs(z-rec['hi']))
    return bool(np.all(within & ((radial <= tol) | (allow_end & (end <= tol)))))


def _visible_edges(scene, names, pj):
    """返回每条实体棱在整个已剖场景中真正可见的三维参数区间。"""
    from OCP.BRepAdaptor import BRepAdaptor_Curve
    from OCP.HLRAlgo import HLRAlgo_Projector
    from OCP.HLRBRep import HLRBRep_Algo
    from OCP.TopoDS import TopoDS
    from OCP.gp import gp_Ax2
    hlr = HLRBRep_Algo()
    for shape in scene:
        hlr.Add(shape)
    hlr.Projector(HLRAlgo_Projector(gp_Ax2(model.pnt(pj.o), model.gdir(pj.w), model.gdir(pj.u))))
    hlr.Update()
    hlr.Hide()
    data = hlr.DataStructure()
    edge_data, edge_map = data.EDataArray(), data.EdgeMap()
    for index, name in enumerate(names, 1):
        first, last = hlr.ShapeBounds(index).Bounds()[2:4]
        for i in range(max(1, first), last+1):
            edge = TopoDS.Edge_s(edge_map.FindKey(i))
            item = edge_data.Value(i)
            status = item.Status()
            for interval in range(1, status.NbVisiblePart()+1):
                a, b = status.VisiblePart(interval, 0., 0.)
                if b-a > 1e-8:
                    yield name, edge, BRepAdaptor_Curve(edge), a, b


def _feature_line(rec, ends):
    """HLR 会合并同一直线上的棱。截出位于原特征范围的那段。"""
    frame = np.array([rec['u'], rec['v'], rec['n']])
    local = (ends-rec['o']) @ frame.T
    if 'poly' in rec:
        low, high = rec['poly'].min(axis=0), rec['poly'].max(axis=0)
    else:
        center = np.asarray(rec['loops'][0]['circle'])
        low, high = center-rec['radius'], center+rec['radius']
    bounds = zip(local[0], local[1]-local[0], [*low, rec['lo']], [*high, rec['hi']])
    start, stop = 0., 1.
    for p, v, lo, hi in bounds:
        if abs(v) < 1e-9:
            if p < lo-1e-6 or p > hi+1e-6:
                return None
        else:
            a, b = sorted(((lo-p)/v, (hi-p)/v))
            start, stop = max(start, a), min(stop, b)
    if stop-start > 1e-7:
        return ends[0]+np.outer([start, stop], ends[1]-ends[0])


def _retained_piece(support, line):
    if support['geom'] == line['geom'] == 'polyline':
        # 曲线区间经 HLR 及裁窗后离散起点可能不同；只接受整段仍落在
        # 同一已证明可见的三维棱投影上的折线。
        a = np.asarray(support['points'])
        ds = np.diff(a, axis=0)
        lengths = np.maximum(np.sum(ds*ds, axis=1), 1e-20)
        for point in g2.sample(line, .3):
            delta = point-a[:-1]
            t = np.clip(np.sum(delta*ds, axis=1)/lengths, 0, 1)
            if np.min(np.sum((delta-ds*t[:, None])**2, axis=1)) > .008**2:
                return []
        return [line]
    overlap = common.visible_curve_overlap(support, line)
    if overlap and abs(sum(g2.length(c) for c in overlap)-g2.length(line)) < 1e-6:
        return [line]
    return overlap


def _assembly_support(rec, samples):
    """描述实际可见棱所在的装配系解析面，供 C 与原配合关系核对。"""
    axial = (samples-rec['o']) @ rec['n']
    faces = []
    for end in (rec['lo'], rec['hi']):
        if np.max(abs(axial-end)) < .002:
            faces.append(dict(kind='end_plane', normal=rec['n'].tolist(), point=(rec['o']+end*rec['n']).tolist()))
    if 'axis' in rec:
        for loop in rec['loops']:
            x, y = loop['circle']
            origin = rec['o']+x*rec['u']+y*rec['v']
            radius = float(loop.get('d',2*loop.get('r',0)))/2
            radial = np.linalg.norm(np.cross(samples-origin,rec['n']),axis=1)
            if np.max(abs(radial-radius)) < .002:
                faces.append(dict(kind='cylinder', point=origin.tolist(), direction=rec['n'].tolist(),radius=radius))
    elif 'poly' in rec:
        for a,b in zip(rec['poly'],np.roll(rec['poly'],-1,axis=0)):
            tangent = (b[0]-a[0])*rec['u']+(b[1]-a[1])*rec['v']
            if np.linalg.norm(tangent) < 1e-8:
                continue
            normal = _unit(np.cross(tangent,rec['n']))
            origin = rec['o']+a[0]*rec['u']+a[1]*rec['v']
            if np.max(abs((samples-origin) @ normal)) < .002:
                faces.append(dict(kind='side_plane',normal=normal.tolist(),point=origin.tolist()))
    return faces


def _match_assembly_datums(elements, dimensions):
    """给可证实的棱标回原 D 的 selector；不把键槽中心变成虚拟画点。"""
    requested = {}
    for d in dimensions:
        w = d.get('_witness_3d') or {}
        if w.get('kind') != 'assembly_relation':
            continue
        for relation in w['relations']:
            for item in relation['elements']:
                radial = relation['elements'][0] if relation['kind']=='radial_alignment' else None
                requested.setdefault((item['part'],item['feature']),[]).append((d['_id'],item,radial))
    for e in elements:
        matched = []
        for dim, item, radial in requested.get((e['part'],e['feature']),[]):
            for s in e.get('support_3d', []):
                delta = np.array(item['point'])-s['point']
                derivation = None
                if item['kind']=='plane' and s['kind'] in ('end_plane','side_plane'):
                    valid = abs(np.dot(item['direction'],s['normal']))>1-1e-7 and abs(np.dot(delta,s['normal']))<.002
                elif item['kind']=='axis' and s['kind'] in ('cylinder','axis'):
                    valid = (abs(np.dot(item['direction'],s['direction']))>1-1e-7 and
                             np.linalg.norm(np.cross(delta,s['direction']))<.002 and
                             (s['kind']=='axis' or abs(s['radius']-item['radius'])<.002))
                elif item['selector']=='rect_center' and radial and s['kind']=='side_plane':
                    # 键槽/铣扁的径向定向只取实际可见侧壁的朝向与半侧。
                    # 原矩形中心可在已切掉的材料中，不将其画作引线落点。
                    base, axis = np.asarray(radial['point']), np.asarray(radial['direction'])
                    ray = np.asarray(item['point'])-base
                    ray = ray-axis*(ray@axis)
                    valid = (np.linalg.norm(ray)>1e-6 and abs(_unit(ray) @ s['normal'])>1-1e-7
                             and (np.asarray(s['point'])-base) @ ray > 0)
                    derivation = 'radial_direction_from_visible_side_plane'
                else:
                    continue
                if valid:
                    ref = dict(id=dim,selector=item['selector'],kind=item['kind'])
                    if derivation:
                        ref['derivation'] = derivation
                    if ref not in matched:
                        matched.append(ref)
        if matched:
            e['assembly_datums'] = matched


def _witnesses(candidate, records, geom):
    from OCP.BRep import BRep_Tool
    from OCP.BRepBuilderAPI import BRepBuilderAPI_MakeEdge
    from OCP.GeomAbs import GeomAbs_Line
    pj = project.Projector(candidate)
    scene = geom.get('_shapes', [])
    names = list(candidate['parts'])
    if candidate.get('kind') == 'removed_section':
        names = [n for n in names if n not in candidate['section'].get('unsectioned', [])]
    lines = [c for c in geom['lines'] if c['type'] == 'visible']
    if len(scene) != len(names) or not scene or not lines:
        return [], []
    boxes = np.array([g2.bounds([c]) for c in lines])
    if len(scene)>1 and candidate.get('keep'):
        # 可见线窗之外的整个实体不可能遮挡窗内射线。保留所有投影框
        # 与窗口相交的实体（包括没有待标特征的遮挡件）。
        window = [*boxes[:,:2].min(axis=0),*boxes[:,2:].max(axis=0)]
        active = []
        for name, shape in zip(names,scene):
            bounds = project.shape_bbox(shape)
            if bounds is None:
                continue
            lo,hi = bounds
            xy = np.array([pj.to2([x,y,z]) for x in (lo[0],hi[0]) for y in (lo[1],hi[1]) for z in (lo[2],hi[2])])
            if np.all(xy.min(axis=0) <= np.array(window[2:])+.01) and np.all(xy.max(axis=0) >= np.array(window[:2])-.01):
                active.append((name,shape))
        if not active:
            return [], []
        names, scene = zip(*active)
    w0 = pj.depth(candidate['section']['point'])
    hits = {}
    records_by_part = {name: [r for r in records if r['part'] == name] for name in names}
    bounds = {name: np.array([[_plane_range(r, axis) for axis in np.eye(3)] for r in items])
              for name, items in records_by_part.items()}
    for name, edge, curve, a, b in _visible_edges(scene, names, pj):
        if not records_by_part[name]:
            continue
        linear = curve.GetType() == GeomAbs_Line
        ts = [a, b] if linear else np.linspace(a, b, 17)
        xyz = np.array([curve.Value(t).Coord() for t in ts])
        on_cut = max(abs((xyz-pj.o) @ pj.w-w0)) < 1e-5
        if candidate.get('kind') == 'removed_section' and not on_cut:
            continue
        curved_support = None
        box = bounds[name]
        near_features = np.all((box[:, :, 1] >= xyz.min(axis=0)-.002) &
                               (box[:, :, 0] <= xyz.max(axis=0)+.002), axis=1)
        for rid in np.flatnonzero(near_features):
            rec = records_by_part[name][rid]
            piece = _feature_line(rec, xyz) if linear else xyz
            if piece is None:
                continue
            samples = piece[0]+np.outer(np.linspace(0., 1., 9), piece[1]-piece[0]) if linear else piece
            if not _on_boundary(rec, samples, allow_end=on_cut):
                continue
            if linear:
                support = [g2.line(pj.to2(piece[0]), pj.to2(piece[1]), 'visible')]
            else:
                if curved_support is None:
                    trimmed = BRepBuilderAPI_MakeEdge(BRep_Tool.Curve_s(edge, 0., 0.), a, b)
                    curved_support = project.edge_curves(trimmed.Edge(), 'visible', pj.to2) if trimmed.IsDone() else []
                support = curved_support
            for s in support:
                x0, y0, x1, y1 = g2.bounds([s])
                near = (boxes[:, 0]<=x1+1e-5)&(boxes[:, 2]>=x0-1e-5)&(boxes[:, 1]<=y1+1e-5)&(boxes[:, 3]>=y0-1e-5)
                for i in np.flatnonzero(near):
                    for visible in _retained_piece(s, lines[i]):
                        key = (name, rec['feature'])
                        support_3d = _assembly_support(rec,samples) if candidate.get('frame')=='assembly' else []
                        hits.setdefault(key, {})[repr(visible)] = (visible, on_cut, support_3d)
    elements, expresses = [], []
    for rec in records:
        curves = hits.get((rec['part'], rec['feature']), {})
        if not curves:
            continue
        params = _parameters(rec)
        expresses.append(dict(part=rec['part'], feature=rec['feature'], parameters=params))
        for c, on_cut, surfaces in curves.values():
            element = dict(part=rec['part'], feature=rec['feature'], parameters=params,
                kind='contour', curve=copy.deepcopy(c),
                provenance='visible_3d_edge_interval/' + ('cut_plane' if on_cut else 'retained_feature_edge'))
            if surfaces:
                element.update(coordinate_system='assembly', support_3d=surfaces)
            elements.append(element)
        if ('axis' in rec and abs(rec['n'] @ pj.w) < 1e-7
                and abs((rec['axis']-np.array(candidate['section']['point'])) @ pj.w) < 1e-6):
            a, b = (np.asarray(pj.to2(rec['axis']+rec['n']*d)) for d in (rec['lo'], rec['hi']))
            length = np.linalg.norm(b-a)
            if length < 1e-7:
                continue
            along = (b-a)/length
            offset = rec['radius']*np.array([-along[1], along[0]])
            sides = []
            for delta in (-offset, offset):
                support = g2.line(a+delta,b+delta,'visible')
                sides.append([sorted((np.array([p['from'],p['to']])-a) @ along)
                              for c, _, _ in curves.values() for p in common.visible_curve_overlap(support,c)])
            for l0, l1 in sides[0]:
                for r0, r1 in sides[1]:
                    lo, hi = max(l0,r0), min(l1,r1)
                    if hi-lo > 1e-5:
                        element = dict(part=rec['part'], feature=rec['feature'],
                            parameters=_paths(rec, 'plane', 'at' if rec['definition']['type']=='hole' else 'loops[0].circle'),
                            kind='axis', curve=g2.line(a+lo*along, a+hi*along, 'center'),
                            provenance='overlap_of_visible_cylinder_generators')
                        if candidate.get('frame') == 'assembly':
                            element.update(coordinate_system='assembly',support_3d=[dict(kind='axis',
                                point=rec['axis'].tolist(), direction=rec['n'].tolist(),
                                endpoints=[(rec['axis']+rec['n']*(rec['lo']+d)).tolist() for d in (lo,hi)])])
                        elements.append(element)
    return expresses, elements


def _supporting_sections(candidates, records):
    """跨层通路共用一个真实平面；局部零件剖视使用本件坐标。"""
    additions = []
    seen_parts = set()
    for source in candidates:
        if source.get('frame') != 'part' or source.get('kind') != 'basic' or source.get('section'):
            continue
        part = source.get('part')
        if part in seen_parts:
            continue
        seen_parts.add(part)
        features = {r['definition'].get('name', ''): r for r in records(source)}

        def add(key, title, point, normal, up, optional=True, local_points=None, section_radius=None):
            if np.linalg.norm(normal) < 1e-7:
                return
            normal = _unit(normal)
            if not any(other.get('part') == part and other.get('frame') == 'part'
                       and not other.get('section') and other.get('kind') != 'detail'
                       and abs(_unit(other['direction']) @ normal) < 1e-7 for other in candidates):
                return
            if any(c.get('part') == part and c.get('frame') == 'part' and c.get('section')
                   and not c.get('keep') and abs(abs(_unit(c['direction']) @ normal)-1) < 1e-7
                   and abs((point-np.asarray(c['section']['point'])) @ normal) < 1e-6
                   for c in candidates + additions):
                return
            u, v = project.frame_axes(normal, up)
            section = dict(point=point.tolist(), mode='full')
            if local_points is not None:
                xy = np.asarray(local_points) @ np.array([u, v]).T
                x0, y0 = xy.min(axis=0)-1.
                x1, y1 = xy.max(axis=0)+1.
                section.update(mode='local', region=[[x0,y0],[x1,y0],[x1,y1],[x0,y1]])
            candidate = dict(view_key=f"{source['view_key']}:B-{key}", name=title,
                frame='part', part=part, parts=list(source['parts']), kind='auxiliary',
                direction=normal.tolist(), u=u.tolist(), v=v.tolist(), origin=[0, 0, 0], hidden=False,
                section=section, _head_sheet=source.get('_head_sheet'), layout_optional=optional,
                layout_group=source.get('layout_group') or f'part:{part}:body',
                spec=dict(type='auxiliary', name=title, direction=normal.tolist(), up=list(up),
                          free=True, section=copy.deepcopy(section)))
            if section_radius is not None:
                section['mode'] = 'removed'
                candidate.update(kind='removed_section',keep=dict(shape='circle',
                    center=list(project.Projector(candidate).to2(point)),r=section_radius))
                candidate['spec'] = dict(type='removed_section',name=title,normal=normal.tolist(),
                    point=point.tolist(),up=list(up),free=True,section=copy.deepcopy(section))
            additions.append(candidate)

        # 平面通过两窗口中部，沿窗口长度方向保持实长，同一截面穿中板回流孔。
        upper, lower = features.get('左隔板上缺口'), features.get('右隔板下窗口')
        if upper and lower:
            along = upper['v']
            add('windows', '上下窗口及中板回流孔联合剖视', upper['center'],
                np.cross(lower['center']-upper['center'], along), along)

        # 两条平行但高度不同的孔轴唯一确定一个纵剖面。
        for left, right, key in [('前横向流道', '后横向流道', 'passages'),
                                 ('前环形分配腔', '后环形分配腔', 'rings')]:
            a, b = features.get(left), features.get(right)
            if a and b and abs(a['n'] @ b['n']) > 1-1e-7:
                add(key, left+'与'+right+'共同轴剖', a['center'],
                    np.cross(a['n'], b['center']-a['center']), a['n'])

        # 水平剖切深度取该层独有材料/空腔的中部；槽口与主腔已相通的
        # 重叠高度不能用来见证沟槽外形。
        for name, neighbor, key in [('下层导油槽', '主齿轮腔', 'oil-groove'),
                                    ('上层内腔', None, 'upper-cavity'),
                                    ('左下独立回路', '前下腔', 'lower-circuits'),
                                    ('下层平衡腔', '前下腔', 'balance'),
                                    ('齿轮啮合窗口', None, 'gear-window')]:
            r = features.get(name)
            if r:
                middle = r['center']
                main = features.get(neighbor)
                if main and np.allclose(r['n'], main['n']) and r['lo'] < main['lo'] < r['hi']:
                    middle = middle + r['n']*((main['lo']-r['hi'])/2)
                footprint = r['vertices'] if name in ('上层内腔','下层导油槽') else None
                add(key, name+'层剖视', middle, -r['n'], r['v'], local_points=footprint)

        fork, cavity = features.get('叉销孔'), features.get('上层内腔')
        if fork and cavity:
            add('fork-cavity', '叉销孔与两层齿轮腔纵剖', fork['center'],
                np.cross(fork['n'], cavity['center']-fork['center']), fork['n'])

        for name in ('前接口内旁路环槽','后接口内旁路环槽','高速沉孔'):
            r = features.get(name)
            if r is None:
                continue
            point = r['center']
            if name=='高速沉孔' and '双肩阀壳' in features:
                # 锪刀伸出壳体外，断面取刀具与壳体轴向包络实际相交的区间。
                lo,hi = _plane_range(features['双肩阀壳'],r['n'])
                z0,z1 = sorted((r['axis'] @ r['n']+r['lo'],r['axis'] @ r['n']+r['hi']))
                if min(z1,hi)<=max(z0,lo):
                    continue
                point = point+r['n']*((min(z1,hi)+max(z0,lo))/2-point @ r['n'])
            add('transverse-'+str(r['feature']),name+'横断面',point,r['n'],r['v'],section_radius=r['radius']+9.)

        feet = [r for r in records(source) if r['definition'].get('name') == '沉孔' and 'axis' in r]
        if len(feet) >= 2:
            a, b = feet[:2]
            if abs(a['n'] @ b['n']) > 1-1e-7:
                add('counterbores', '同排地脚沉孔轴剖', a['center'], np.cross(a['n'], b['center']-a['center']), a['n'])

        # 空心阀套的主孔、内环槽及径向配油孔同时通过两条相交轴线。
        bore, port = features.get('阀芯配合通孔'), features.get('径向配油孔')
        if bore and port:
            normal = np.cross(bore['n'], port['n'])
            if abs((bore['axis']-port['axis']) @ normal) < 1e-6:
                add('sleeve', '阀套通孔、环槽及配油孔轴剖', port['center'], normal, bore['n'], optional=False)
        for left, right, key in [('中心避空','偏置测压孔','cover'), ('环内孔','外圆密封槽','seal')]:
            a, b = features.get(left), features.get(right)
            if a and b:
                offset = b['axis']-a['axis']
                normal = np.cross(a['n'], offset) if np.linalg.norm(offset) > 1e-6 else a['v']
                add(key, left+'及'+right+'轴剖', a['center'], normal, a['n'])
        pin = features.get('拔销螺孔')
        if pin:
            corners = [pin['axis']+d*pin['n']+x*pin['u'] for d in (pin['lo'],pin['hi'])
                       for x in (-pin['radius'],pin['radius'])]
            add('pin-end', '拔销螺孔端部局部剖', pin['center'], pin['v'], pin['n'], local_points=corners)
        cross_hole = features.get('横销孔')
        if cross_hole and '工作轴' in features:
            # 横断芯轴，同时纵剖横销孔，主轴纵向保持完整。
            add('cross-pin', '芯轴横销孔横剖', cross_hole['center'], features['工作轴']['n'], cross_hole['n'])
    return additions


def _assembly_pin_rows(source, parts):
    """同行的销共用一剖，剖图只取底板与销，HLR 仍使用整套装配。"""
    pins = [r for p in parts for r in _feature_records(p, True) if r['definition'].get('name')=='定位杆'
            and 'axis' in r and abs(r['n'][2]) > 1-1e-7]
    rows = {}
    for pin in pins:
        rows.setdefault(round(float(pin['center'][1]),6),[]).append(pin)
    result = []
    for row in rows.values():
        p = row[0]['center']
        normal, up = np.array([0.,1.,0.]), np.array([0.,0.,1.])
        u,v = project.frame_axes(normal,up)
        members = {r['part'] for r in row}
        bodies = [r for part in parts if str(part['name']) in members for r in _feature_records(part,True)
                  if not r['cut'] and 'axis' in r]
        bounds = np.array([[_plane_range(r,axis) for axis in (u,v)] for r in bodies])
        x0,y0 = bounds[:,:,0].min(axis=0)-6.
        x1,y1 = bounds[:,:,1].max(axis=0)+6.
        section = dict(point=p.tolist(),mode='full',unsectioned=sorted(members))
        title = '定位销与底板装配轴剖'
        result.append(dict(view_key=source['view_key']+':B-pin-row:'+row[0]['part'], name=title,kind='auxiliary',
            frame='assembly',part=None,parts=list(source['parts']),direction=normal.tolist(),u=u.tolist(),v=v.tolist(),
            origin=[0,0,0],hidden=False,section=section,layout_optional=True,_head_sheet=source.get('_head_sheet'),
            keep=dict(shape='polygon',points=[[x0,y0],[x1,y0],[x1,y1],[x0,y1]]),
            spec=dict(type='auxiliary',name=title,direction=normal.tolist(),up=up.tolist(),free=True,
                      section=copy.deepcopy(section))))
    return result


def plan_sections(candidates, *, context):
    """修改/增加单平面剖视；保留原键/匹配名，补实际图线见证。"""
    result = copy.deepcopy(candidates)
    parts = context.get('parts', [])
    by_part = {str(p['name']): p for p in parts}
    record_cache = {}

    def records(c):
        key = (c.get('frame', 'part'), tuple(c.get('parts', [])))
        if key not in record_cache:
            record_cache[key] = [r for name in key[1] if name in by_part
                                 for r in _feature_records(by_part[name], key[0] == 'assembly')]
        return record_cache[key]

    assembly_sources = [c for c in result if c.get('frame') == 'assembly' and not c.get('section')
                        and c.get('kind') == 'basic']
    if assembly_sources and not any(c.get('frame') == 'assembly' and c.get('section') and not c.get('keep') for c in result):
        shafts = [axis for p in parts if (axis := _solid_axis(p, True)) is not None]
        if shafts:
            shaft = max(shafts, key=lambda r: r['radius']**2*(r['hi']-r['lo']))
            axis = shaft['n']
            normal = np.cross(axis, [0., 0., 1.])
            if np.linalg.norm(normal) < 1e-7:
                normal = np.array([0., 1., 0.])
            normal = _unit(normal)
            u, v = project.frame_axes(normal, axis)
            source = assembly_sources[0]
            c = copy.deepcopy(source)
            c.update(view_key=f"{source['view_key']}:B-main", name='装配轴线主剖', kind='auxiliary',
                     direction=normal.tolist(), u=u.tolist(), v=v.tolist(), keep=None, hidden=False, layout_optional=False,
                     section=dict(point=shaft['axis'].tolist(), mode='full'))
            c.pop('canonical_key', None)
            c['spec'] = dict(type='auxiliary', name=c['name'], direction=normal.tolist(), up=axis.tolist(),
                             free=True, section=copy.deepcopy(c['section']))
            result.append(c)

    for c in result:
        if not c.get('section'):
            continue
        _validate_definition(c)
        if c.get('frame') != 'assembly' and c.get('kind') == 'basic' and c['section'].get('mode', 'full') == 'full':
            c['section']['point'] = _choose_point(c, records(c))
        elif c.get('frame')=='assembly' and c.get('kind')=='basic' and c.get('keep') and '前盖与定位环' in c['name']:
            center = next((r for r in records(c) if r['definition'].get('name')=='中心避空'),None)
            gauge = next((r for r in records(c) if r['definition'].get('name')=='偏置测压孔'
                          and center and r['part']==center['part']),None)
            if gauge:
                direction = _unit(np.cross(center['n'],gauge['axis']-center['axis']))
                u,v = project.frame_axes(direction,center['n'])
                c.update(kind='auxiliary',direction=direction.tolist(),u=u.tolist(),v=v.tolist())
                c['section']['point'] = center['axis'].tolist()
                c['keep'] = dict(shape='circle',center=list(project.Projector(c).to2(center['axis'])),r=c['keep']['r'])
                c['spec'] = dict(type='auxiliary',name=c['name'],direction=c['direction'],up=c['v'],free=True,
                                 section=copy.deepcopy(c['section']))

    # 交错隔板的上下窗口不共面时，补另一独立单平面，而非沿窗口拼带。
    # 每个方向最多补一处；选面依据窗口和孔轴，不用尺寸链。
    added_chambers = set()
    for source in list(result):
        if source.get('kind') != 'basic' or not source.get('section') or source.get('frame') == 'assembly':
            continue
        normal = _unit(source['direction'])
        group = (source.get('part'), tuple(np.round(normal, 7)))
        if group in added_chambers:
            continue
        for window in records(source):
            if not window['cut'] or not re.search('隔板上缺口|隔板下窗口', window['definition'].get('name', '')):
                continue
            lo, hi = _plane_range(window, normal)
            depth = float(normal @ source['section']['point'])
            if lo+1e-5 < depth < hi-1e-5:
                continue
            span = hi-lo
            if span < 20:  # 这是横切小窗口，不据此追随隔板中面。
                continue
            axes = [r for r in records(source) if r['cut'] and 'axis' in r and abs(r['n'] @ normal) < 1e-7
                    and lo+1e-5 < r['center'] @ normal < hi-1e-5]
            point = min(axes, key=lambda r: abs((r['center']-window['center']) @ normal))['center'] if axes else window['center']
            c = copy.deepcopy(source)
            c.pop('canonical_key', None)
            c.update(view_key=f"{source['view_key']}:B-cavity2", name='另一腔室单平面剖视', layout_optional=True)
            c['section']['point'] = (np.array(source['section']['point'])+normal*float((point-np.array(source['section']['point'])) @ normal)).tolist()
            # 主剖已朝向后壁；反向看同一腔内的前壁油口和腰槽。
            u, v = project.frame_axes(-normal, source['v'])
            c.update(kind='auxiliary', direction=(-normal).tolist(), u=u.tolist(), v=v.tolist())
            c['spec'] = dict(type='auxiliary', name=c['name'], direction=c['direction'],
                             up=c['v'], free=True, section=copy.deepcopy(c['section']))
            result.append(c)
            added_chambers.add(group)
            break

    # 窗口高度由纵剖表达，平面内的起止位置另用水平单剖直接定位。
    # 不把不同高度窗口沿尺寸链拼成同一截面。
    level_seen = set()
    for source in list(result):
        if not source.get('section') or source.get('frame') == 'assembly':
            continue
        for window in records(source):
            if not window['cut'] or not re.search('隔板上缺口|隔板下窗口', window['definition'].get('name', '')):
                continue
            key = (source.get('part'), window['feature'])
            if key in level_seen:
                continue
            level_seen.add(key)
            normal = -window['n']
            u, v = project.frame_axes(normal, window['v'])
            # 窗口层内还穿过隔板圆孔时，同一水平剖兼作真直径纵剖。
            heights = [r['center'] for r in records(source) if r['cut'] and 'axis' in r
                       and '隔板圆孔' in r['definition'].get('name', '') and abs(r['n'] @ normal) < 1e-7
                       and window['lo'] < (r['center']-window['o']) @ window['n'] < window['hi']]
            point = window['center'].copy()
            if heights:
                height = min(heights, key=lambda p: abs((p-point) @ normal))
                point += normal*((height-point) @ normal)
            c = copy.deepcopy(source)
            c.pop('canonical_key', None)
            c.update(view_key=f"{source['view_key']}:B-level:{window['feature']}",
                     name=window['definition'].get('name', '窗口')+'水平剖视', kind='auxiliary', direction=normal.tolist(),
                     u=u.tolist(), v=v.tolist(), keep=None, layout_optional=True,
                     section=dict(point=point.tolist(), mode='full'))
            chambers = [r for r in records(source) if r['definition'].get('name') in ('左腔', '中腔', '右腔')]
            if len(chambers) == 3:
                # 仅在三个内腔上方揭开箱盖，保留外圈盖板螺孔作真实定位要素。
                pj = project.Projector(c)
                xy = np.array([pj.to2(q) for r in chambers for q in r['vertices']])
                x0, y0 = xy.min(axis=0)-1.
                x1, y1 = xy.max(axis=0)+1.
                c['section'].update(mode='local', region=[[x0,y0],[x1,y0],[x1,y1],[x0,y1]])
                c['name'] = window['definition']['name']+'与盖板螺孔水平局部剖视'
            c['spec'] = dict(type='auxiliary', name=c['name'], direction=normal.tolist(), up=window['v'].tolist(),
                             free=True, section=copy.deepcopy(c['section']))
            result.append(c)

    # 真正斜接口增加含完整孔轴的纵剖；重复端视只生成一次。
    axes_seen = set()
    bore_features = {}
    for source in list(result):
        if source.get('section') or source.get('kind') != 'auxiliary' or source.get('frame') == 'assembly':
            continue
        d = _unit(source['direction'])
        holes = [r for r in records(source) if r['cut'] and 'axis' in r
                 and isinstance(r['definition'].get('plane'), dict) and abs(r['n'] @ d) > 1-1e-7]
        if not holes:
            continue
        def distance(r):
            keep = source.get('keep') or {}
            if 'center' in keep:
                return np.linalg.norm(np.array(project.Projector(source).to2(r['center']))-keep['center'])
            anchor = source.get('spec', {}).get('arrow_at')
            return np.linalg.norm(r['axis'][[0, 2]]-anchor) if anchor else -r['radius']
        hole = min(holes, key=lambda r: (distance(r), -r['radius'], -(r['hi']-r['lo'])))
        key = (source.get('part'), tuple(np.round(hole['axis'], 6)), tuple(np.round(hole['n'], 6)))
        if key in axes_seen:
            continue
        axes_seen.add(key)
        coaxial = [r for r in holes if np.linalg.norm(np.cross(r['axis']-hole['axis'], hole['n'])) < 1e-5]
        hole = max(coaxial, key=lambda r: r['hi']-r['lo'])
        axis = hole['n']
        normal = _unit(source['v'])
        normal = _unit(normal-axis*(normal @ axis))
        fasteners = [r for r in holes if '端盖螺孔' in r['definition'].get('name','')
                     and np.linalg.norm(r['o']-hole['o']) < 1e-6]
        if fasteners:
            # 同一纵剖兼剖端盖孔群中原尺寸所指的代表孔。
            requested = {d.get('source_feature') for d in context.get('dimensions', [])
                         if d.get('category') == '孔深' and ((d.get('_witness_3d') or {}).get('feature') or {})
                         .get('plane') == hole['definition'].get('plane')}
            bolt = next((r for r in fasteners if r['feature'] in requested), fasteners[-1])
            normal = _unit(np.cross(axis, bolt['axis']-hole['axis']))
        u = _unit(np.cross(normal, axis))
        c = copy.deepcopy(source)
        c.pop('canonical_key', None)
        c.pop('omitted_features', None)
        c.update(view_key=f"{source['view_key']}:B-long", kind='auxiliary', direction=normal.tolist(),
                 u=u.tolist(), v=axis.tolist(), origin=[0, 0, 0], hidden=False, layout_optional=False,
                 parent_key=source['view_key'], section=dict(point=hole['axis'].tolist(), mode='full'))
        c['name'] = hole['definition'].get('name','接口孔')+'纵剖'
        bore_features[c['view_key']] = {hole['feature']}
        c['spec'] = dict(type='auxiliary', name=c['name'], direction=normal.tolist(), up=axis.tolist(),
                         free=True, section=copy.deepcopy(c['section']))
        # 仅二维局部范围；不用端视薄层，不制造纵剖人工盖面。
        pj = project.Projector(c)
        ends = np.array([pj.to2(hole['axis']+axis*d) for d in (hole['lo'], hole['hi'])])
        radius = max(r['radius'] for r in coaxial)+10
        if fasteners:
            radius = max(radius, np.linalg.norm(np.cross(bolt['axis']-hole['axis'], axis))+bolt['radius']+5.)
        c['keep'] = dict(shape='polygon', points=[[float(ends[:, 0].mean()+x), float(y)]
                         for x, y in [(-radius, ends[:, 1].min()-8), (radius, ends[:, 1].min()-8),
                                      (radius, ends[:, 1].max()+8), (-radius, ends[:, 1].max()+8)]])
        if re.fullmatch('桥[左右]跨腔斜路',hole['definition'].get('name','')):
            pair = [r for r in records(source) if re.fullmatch('桥[左右]跨腔斜路',r['definition'].get('name',''))]
            if (len(pair)==2 and all(abs(r['n'] @ normal)<1e-7 and
                    abs((r['axis']-hole['axis']) @ normal)<1e-6 for r in pair)):
                # 两轴已共面。局部窗包含两条完整斜路，复用一个剖切符号。
                ranges = np.array([[_plane_range(r,d) for d in (u,axis)] for r in pair])
                x0,y0 = ranges[:,:,0].min(axis=0)-8.
                x1,y1 = ranges[:,:,1].max(axis=0)+8.
                c['keep'] = dict(shape='polygon',points=[[x0,y0],[x1,y0],[x1,y1],[x0,y1]])
                c['name'] = c['spec']['name'] = '桥内左右斜路共同轴剖'
                bore_features[c['view_key']] = {r['feature'] for r in pair}
                axes_seen.update((source.get('part'),tuple(np.round(r['axis'],6)),tuple(np.round(r['n'],6))) for r in pair)
        c['layout_group'] = source.get('layout_group', source.get('canonical_key', source['view_key']))
        result.append(c)

    supplements = _supporting_sections(result, records)
    layered_parts = {c['part'] for c in supplements if c['view_key'].endswith((':B-upper-cavity',':B-rings'))}
    for c in result:
        if (c.get('frame')=='part' and c.get('part') in layered_parts and c.get('kind')=='basic'
                and c.get('section') and abs(_unit(c['direction'])[2])>1-1e-7):
            # 两个主纵剖仍在。第三个水平总剖与分层/回路专剖按实际尺寸择用。
            c['layout_optional'] = True
    result.extend(supplements)
    if assembly_sources and any(abs(c['direction'][1]) < 1e-7 for c in assembly_sources):
        result.extend(_assembly_pin_rows(assembly_sources[0], parts))
    signatures, projection_cache, witness_cache = {}, {}, {}
    for c in result:
        if not c.get('section'):
            continue
        sec = c['section']
        parent = _pick_parent(c, result)
        c['parent_key'] = c['source_key'] = parent['view_key']
        c['role'] = 'detail' if c.get('keep') or c.get('layout_optional') else 'overview'
        c.pop('view_role', None)
        c.setdefault('layout_group', f"B:{c.get('frame')}:{c.get('part')}:main")
        longitudinal = c['view_key'].endswith(':B-long')
        if longitudinal:
            side, axis = _unit(c['u']), _unit(c['v'])
            width, height = np.ptp(c['keep']['points'], axis=0)
            horizontal = height > 1.5 * width
            if horizontal:
                # 纸面顺时针转 90°。剖切平面、来源图和投射方向均由三维量确定。
                c.update(u=axis.tolist(), v=(-side).tolist())
                c['spec'].update(up=c['v'], rotated='cw')
                c['keep']['points'] = [[y, -x] for x, y in c['keep']['points']]
        ribs = _rib_regions(c, records(c))
        if ribs:
            sec['no_hatch'] = [p for polys in ribs.values() for p in polys]
            sec['_no_hatch_parts'] = ribs
        solid = _unsectioned(c, parts)
        if solid:
            sec['unsectioned'] = solid
        if context.get('project_candidate') and longitudinal:
            # 某些精确共面交线会令 OCP 布尔结果为空。绕同一真实孔轴改选
            # 另一纵剖平面，不移动孔轴、不平移切面，不把空投影当合格候选。
            geom = context['project_candidate'](c)
            if not geom['lines'] or not geom['hatches']:
                original_normal = _unit(c['direction'])
                old_x = float(np.array(sec['point']) @ side)
                group = [r for r in records(c) if '端盖螺孔' in r['definition'].get('name','')
                         and np.linalg.norm(r['o']-np.asarray(sec['point'])) < 1e-6]
                angles = (180,) if c['name']=='桥内左右斜路共同轴剖' else ((180,) if group else ()) + (15,-15,30,-30,60,90)
                for angle in angles:
                    a = math.radians(angle)
                    normal = _unit(original_normal*math.cos(a)+side*math.sin(a))
                    u = _unit(np.cross(normal, axis))
                    shift = float(np.array(sec['point']) @ u)-old_x
                    c.update(direction=normal.tolist(), u=(axis if horizontal else u).tolist(),
                             v=(-u if horizontal else axis).tolist())
                    c['spec']['up'] = c['v']
                    c['keep']['points'] = [[x, y-shift] if horizontal else [x+shift, y]
                                           for x, y in c['keep']['points']]
                    old_x += shift
                    c['spec']['direction'] = normal.tolist()
                    geom = context['project_candidate'](c)
                    if geom['lines'] and geom['hatches']:
                        break
                else:
                    raise ValueError(f"{c['view_key']} 的含孔轴纵剖未获得有效材料截面")
                # 纵剖例外依赖最终切向，绕轴改面后须重新判断，不能沿用旧肋区。
                sec.pop('no_hatch', None)
                sec.pop('_no_hatch_parts', None)
                ribs = _rib_regions(c, records(c))
                if ribs:
                    sec['no_hatch'] = [p for polys in ribs.values() for p in polys]
                    sec['_no_hatch_parts'] = ribs
                geom = context['project_candidate'](c)
            projection_cache[_signature(c)] = geom
        signature = _signature(c)
        if signature not in signatures:
            signatures[signature] = (c['view_key'], _letter(len(signatures)))
        canonical, label = signatures[signature]
        c['canonical_key'] = canonical
        spec = c.setdefault('spec', {})
        if longitudinal:
            spec['keep'] = copy.deepcopy(c['keep'])
        oldname = spec.get('name', c['name'])
        suffix = re.sub(r'^[A-Z]+[-—][A-Z]+', '', oldname) if re.match(r'^[A-Z]+[-—][A-Z]+', oldname) else ''
        if c.get('kind') == 'basic' and sec.get('mode', 'full') == 'full':
            suffix = '（单平面主剖）'
        spec['name'] = f'{label}-{label}{suffix}'
        spec['label'] = label
        spec['section'] = dict(copy.deepcopy(sec), label=label, parent=parent['spec'].get('name', parent['name']))
        if context.get('project_candidate'):
            if signature not in projection_cache:
                projection_cache[signature] = context['project_candidate'](c)
            if signature not in witness_cache:
                witness_cache[signature] = _witnesses(c, records(c), projection_cache[signature])
                if c.get('frame')=='assembly':
                    _match_assembly_datums(witness_cache[signature][1],context.get('dimensions',[]))
            c['expresses'], c['witness_elements'] = copy.deepcopy(witness_cache[signature])
            if longitudinal:
                for element in c['witness_elements']:
                    if element['kind']=='axis' and element['feature'] in bore_features[c['view_key']]:
                        element['draw_bore_axis'] = True
        else:
            # 无真实投影时不把预测轮廓当作已经成立的见证。
            c['expresses'], c['witness_elements'] = [], []
    return result


def _validate_definition(definition):
    sec = definition.get('section')
    if not isinstance(sec, dict):
        raise ValueError('project_section 需要 section 定义')
    if sec.get('mode', 'full') not in ('full', 'removed', 'half', 'local'):
        raise ValueError('不支持拼带剖面；应拆成独立单平面剖视')
    for key in ('bands', 'planes', 'offsets', 'path', 'steps', 'section_only'):
        if key in sec or key in definition:
            raise ValueError('不支持拼带/多平面截面；应选两个独立单平面剖视')
    _unit(definition['direction'])
    point = np.asarray(sec.get('point'), float)
    if point.shape != (3,) or not np.isfinite(point).all():
        raise ValueError('剖切点必须是有限三维坐标')
    if definition.get('kind') == 'removed_section' and sec.get('mode') != 'removed':
        raise ValueError('移出断面必须明确采用 removed 模式')
    if sec.get('mode') == 'removed' and definition.get('kind') != 'removed_section':
        raise ValueError('断面不得冒称全剖视')


def _closed_hatches(geom):
    for hatch in geom['hatches']:
        loops = []
        for loop in hatch['loops']:
            pts = np.asarray(loop, float)
            if len(pts) < 3 or pts.shape[1:] != (2,) or not np.isfinite(pts).all():
                raise ValueError('截面材料环不是有效闭合轮廓')
            if np.linalg.norm(pts[0]-pts[-1]) > .001:
                raise ValueError('截面材料轮廓未闭合，拒绝用假线补口')
            pts[-1] = pts[0]
            area = abs(np.sum(pts[:-1, 0]*pts[1:, 1]-pts[1:, 0]*pts[:-1, 1]))/2
            if area < 1e-8:
                raise ValueError('截面材料环退化')
            loops.append(pts.tolist())
        hatch['loops'] = loops
    return geom


def _bore_axis_lines(elements):
    """每根指定孔轴只画一次，取同孔两侧真实母线共同支持的首末位置。"""
    groups = {}
    for e in elements:
        if e.get('draw_bore_axis'):
            groups.setdefault((e['part'], e['feature']), []).extend((e['curve']['from'], e['curve']['to']))
    lines = []
    for points in groups.values():
        xy = np.array(points)
        along = xy[1]-xy[0]
        coordinates = xy @ along
        lines.append(g2.line(xy[coordinates.argmin()], xy[coordinates.argmax()], 'center'))
    return lines


def project_section(shapes, definition, *, parent=None, legacy):
    """全剖保留切面后轮廓；断面只留截交轮廓，材料/孔由 OCP 给出。"""
    _validate_definition(definition)
    sec = definition['section']
    owned = sec.get('_no_hatch_parts')
    removed = definition.get('kind') == 'removed_section'
    if owned or removed:
        clean = copy.deepcopy(definition)
        clean['section'].pop('no_hatch', None)
        if removed:
            keep_whole = set(sec.get('unsectioned', []))
            clean['parts'] = [n for n in definition.get('parts', list(shapes)) if n not in keep_whole]
            selected = {n: s for n, s in shapes.items() if n in clean['parts']}
            geom = project.project_view(selected, clean, parent=parent)
        else:
            geom = project.project_view(shapes, clean, parent=parent)
        extra = []
        if owned:
            for name, regions in owned.items():
                extra += project.rib_lines(dict(no_hatch=regions), [h for h in geom['hatches'] if h['part'] == name])
        elif removed:
            extra += project.rib_lines(sec, geom['hatches'])
        geom['lines'] += extra
        if removed and definition.get('keep'):
            keep = definition['keep']
            geom['lines'] = g2.clip_all(geom['lines'], keep)
            pj = project.Projector(definition)
            if geom['_shapes']:
                geom['lines'] += project.boundary_waves(keep, pj, project.Material(geom['_shapes']))
            for h in geom['hatches']:
                h['clip'] = [keep]
    else:
        geom = legacy()
    axes = _bore_axis_lines(definition.get('witness_elements', []))
    output = dict(geom, lines=geom['lines']+axes, hatches=copy.deepcopy(geom['hatches']))
    return _closed_hatches(output)


def section_marks(parent, point, direction, letter, *, legacy):
    """真实父图轮廓定位粗短画、箭头、字母，均使用纸面毫米。"""
    pj = project.Projector(parent.vdef)
    direction = _unit(direction)
    n = np.array([direction @ pj.u, direction @ pj.v])
    if np.linalg.norm(n) < 1-1e-6:
        raise ValueError(f'剖切面 {letter} 在来源图中不是直线；需要垂直该面的定位图')
    n /= np.linalg.norm(n)
    t = np.array([-n[1], n[0]])
    scale = float(parent.scale)
    c = float((np.asarray(point)-pj.o) @ direction)*scale
    stamp = (str(letter), tuple(np.round(n, 7)), round(c, 6))
    marked = getattr(parent, '_b_section_marked', set())
    if stamp in marked:
        return None
    hits = []
    for curve in parent.geom['lines']:
        if curve['type'] != 'visible':
            continue
        samples = g2.sample(curve, .25)*scale
        for a, b in zip(samples[:-1], samples[1:]):
            da, db = float(a @ n-c), float(b @ n-c)
            if abs(da) < 1e-7:
                hits.append(float(a @ t))
            if da*db <= 0 and abs(da-db) > 1e-10:
                hits.append(float((a+(b-a)*da/(da-db)) @ t))
    if not hits:
        raise ValueError(f'剖切面 {letter} 与来源图可见轮廓没有交点')
    marked.add(stamp)
    parent._b_section_marked = marked
    low, high = min(hits), max(hits)
    base, m = n*c, parent.marks
    h = max(9., float(common.LABEL_H))
    refs = (getattr(parent, 'candidate', None) or {}).get('section_references', [])
    ref = next((r for r in refs if r.get('label') == letter and r.get('target_sheet') is not None), None)
    m.line(base+t*low, base+t*high, 'center', role='section')
    for sign, end in ((-1, low), (1, high)):
        inner, outer = base+t*(end+sign*1.5), base+t*(end+sign*8)
        m.line(inner, outer, 'cut', role='section')
        tip = outer+n*8
        m.line(outer, tip, 'thin', role='section')
        m.arrow(tip, n, role='section')
        at = tip+n*(2+h/2)+t*sign*(h*.25)
        if getattr(parent, 'occ', None) is not None:
            options = [at+t*sign*distance for distance in (0., h, 2*h, 3*h)]
            at = min(options, key=lambda p: parent.occ.cost(common.text_box(letter, p, h, 'mm')))
        m.text(letter, at, h, 'mm', role='section')
        if ref:
            target = str(ref['target_sheet']).rsplit('-', 1)[-1]
            m.text(f'见第 {target} 张', at+n*(h/2+5), max(6.5, h*.7), 'mm', role='section')
    return None

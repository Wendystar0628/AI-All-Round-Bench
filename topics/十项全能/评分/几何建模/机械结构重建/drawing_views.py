"""外形总览和接口真形端视；不选择剖面、分配尺寸或分页。

keep._a_local 是最终实体的局部深度窗口。人工截取面的可见边转换为
波浪线，绝不冒充零件的真实棱边，也不填剖面线。
"""
import copy
import json

import numpy as np


def delivery_views(data, handoff, geometry_dir, *, baseline=None):
    """从同一题原实体的已有投影读取图线；交付五题优先用 A/B 的实测投影。"""
    import subprocess
    from drawing_dimensions import ProjectedDatums
    spec=data['spec']
    by_key, unique, shared, originals = {}, {}, {}, {}
    def include(c,geom,token):
        if not geom.get('lines'):return
        key=c['view_key']
        signature=(c.get('frame'),c.get('part'),token,tuple(c['u']),tuple(c['v']),tuple(c.get('origin',[0,0,0])))
        if signature not in shared:
            if key.startswith('原图/'):
                geom=dict(geom,lines=delivery_axes(geom['lines']))
            shared[signature]=key
            unique[key]=ProjectedDatums(c,geom)
        by_key[key]=shared[signature]
    for sh in spec['sheets']:
        for d in sh.get('dimensions',[]):
            originals[d['_id']] = (str(sh.get('part') or '1'),sh.get('frame','part'),sh['id'],d['view'])
    if (handoff/'inputs.json').exists():
        bundle=json.loads((handoff/'inputs.json').read_bytes())
        paths=json.loads((handoff/'projections.json').read_bytes())
        loaded={}
        for c in bundle['candidates']:
            path=paths.get(c['view_key'])
            if not path:continue
            if path not in loaded:loaded[path]=json.loads((handoff/path).read_bytes())
            include(c,loaded[path],path)
    # 补足旧版正投影视图。零件/装配坐标、原点、比例与缓存文件逐一对应。
    if baseline:
        from drawing_common import git_task_directory
        root, revision = baseline
        source_dir = git_task_directory(root, revision) / geometry_dir.name
    for sh in spec['sheets']:
        path=geometry_dir/(sh['id']+'.json')
        if baseline:
            source = (source_dir / path.name).as_posix()
            page=json.loads(subprocess.check_output(
                ['git','cat-file','blob',revision+':'+source],cwd=root))
        else:
            page=json.loads(path.read_bytes())
        for i,v in enumerate(page['views'],1):
            key=f"{sh['id']}:v{i}"
            vd=dict(v['definition'])
            if 'u' not in vd:
                vd.update({a:vd['parent_definition'][a] for a in ('u','v','direction','origin')})
            frame=sh.get('frame','part')
            part=str(sh.get('part') or '1') if frame=='part' else None
            c=dict(vd,view_key='原图/'+key,name=v['name'],frame=frame,part=part,
                   role='detail' if vd.get('section') or vd.get('keep') else 'overview',
                   spec=dict(type=v.get('position') or v['kind'],name=v['name']))
            identity=json.dumps({k:vd.get(k) for k in ('section','parts','keep','direction','u','v','detail','hidden')},sort_keys=True)
            gg=dict(lines=[l for l in v['lines'] if l['type']!='hidden'],hatches=v['hatches'])
            include(c,gg,identity)
    return unique,by_key,originals


def delivery_axes(lines):
    """隐藏边省略后，轴线仍须有可见圆缘或连到可见端面的成对母线支撑。"""
    from drawing_dimensions import _curves_cross, _distance, _quick_box
    accepted = _necessary_axes([c for c in lines if c['type']!='hidden'],1.)
    contours = [c for c in accepted if c['type'] in ('visible','cut')]
    boxes = np.asarray([_quick_box(c) for c in contours])
    centers = [np.asarray(c['center']) for c in contours if c['geom'] in ('arc','circle')]
    result = []
    for c in accepted:
        if c['type']!='center' or c['geom']!='line':
            result.append(c)
            continue
        if any(_point_on_segment(p,c['from'],c['to']) for p in centers):
            result.append(c)
            continue
        if not len(boxes):
            continue
        x,y,X,Y=_quick_box(c)
        nearby=np.flatnonzero((boxes[:,0]<=X+.035)&(boxes[:,2]>=x-.035)&
                              (boxes[:,1]<=Y+.035)&(boxes[:,3]>=y-.035))
        if any(_curves_cross(c,contours[j]) or
               min(_distance(contours[j],c['from']),_distance(contours[j],c['to']))<.035 for j in nearby):
            result.append(c)
    return result


def cut_at_datum(part, shape, point, normal, name):
    """实际最终实体与给定平面的单平面移出断面；剖面空腔保留。"""
    from drawkit import project
    n=_unit(normal)
    up=np.eye(3)[np.argmin(abs(n))] if abs(n[2])>.96 else np.array([0.,0.,1.])
    u=_unit(np.cross(n,up))
    v=_unit(np.cross(u,n))
    c=dict(kind='removed_section',parts=[part],part=part,frame='part',direction=n.tolist(),
           u=u.tolist(),v=v.tolist(),origin=[0.,0.,0.],section=dict(mode='removed',point=np.asarray(point,float).tolist()),
           hidden=False,name=name,role='detail',spec=dict(type='removed_section',name=name))
    if isinstance(shape,dict):
        c.update(frame='assembly',part=None,parts=list(shape))
    geom=project.project_view(shape if isinstance(shape,dict) else {part:shape},c)
    return c,dict(lines=geom['lines'],hatches=geom['hatches'])


def _unit(value):
    a = np.asarray(value, float)
    return a / np.linalg.norm(a)


def _frame(feature):
    from drawkit import model
    f = model.sketch_frame(feature)
    return f.o, f.xd, f.yd, f.n


def _circle(feature):
    if feature.get('type') == 'hole':
        at = feature.get('at', [0, 0])
        if not isinstance(at[0], (float, int)):
            return None
        return np.asarray(at, float), float(feature['d']) / 2
    loops = feature.get('loops', [])
    if len(loops) == 1 and 'circle' in loops[0]:
        return np.asarray(loops[0]['circle'], float), float(loops[0]['d']) / 2
    return None


def _range(feature):
    depth = feature.get('depth', [0, 0])
    if isinstance(depth, (int, float)):
        return (-float(depth), 0.) if feature.get('type') == 'hole' else tuple(sorted((0.,float(depth))))
    return tuple(sorted(map(float, depth)))


def _parameters(feature, end=False):
    """表达任务，不等价于 C 的最终图线身份验证。"""
    out = []
    if _circle(feature) is not None:
        out += ['d', 'at'] if feature['type'] == 'hole' else ['loops[0].d', 'loops[0].circle']
    elif feature.get('type') == 'extrude':
        out += [f'loops[{i}]' for i in range(len(feature.get('loops', [])))]
    if isinstance(feature.get('plane'), dict):
        out.append('plane.origin')
    if not end and feature.get('op', 'cut' if feature.get('type') == 'hole' else 'add') == 'add':
        out.append('depth')
    return out


def _feature_boxes(features):
    boxes = {}
    for i, f in enumerate(features, 1):
        if f.get('type') not in ('extrude', 'hole'):
            continue
        o, x, y, n = _frame(f)
        circle = _circle(f)
        if circle is not None:
            at, radius = circle
            ends = np.array([o + at[0]*x + at[1]*y + t*n for t in _range(f)])
            extent = radius * np.hypot(x, y)
            boxes[i] = ends.min(axis=0)-extent, ends.max(axis=0)+extent
            continue
        pts = []
        for loop in f.get('loops', []):
            if 'rect' in loop:
                x0, y0, x1, y1 = loop['rect']
                pts += [(x0,y0), (x1,y0), (x1,y1), (x0,y1)]
            elif 'path' in loop and all(isinstance(p, list) for p in loop['path']):
                pts += loop['path']
            elif 'circle' in loop:
                c, r = np.asarray(loop['circle']), loop['d']/2
                pts += [c + [a*r,b*r] for a in (-1,1) for b in (-1,1)]
        if pts:
            world = np.array([o + p[0]*x + p[1]*y + t*n for p in pts for t in _range(f)])
            boxes[i] = world.min(axis=0), world.max(axis=0)
    return boxes


def _additive_boxes(features):
    return {i: b for i, b in _feature_boxes(features).items()
            if features[i-1].get('op', 'cut' if features[i-1]['type'] == 'hole' else 'add') == 'add'}


def _external_faces(features):
    """外表面可能的朝向只用于选图。实际要素身份由最终实体消隐后验证。"""
    boxes = _feature_boxes(features)
    solids = _additive_boxes(features)
    outer = {i: b for i, b in solids.items() if not any(
        j != i and np.all(b[0] >= s[0]-1e-6) and np.all(b[1] <= s[1]+1e-6)
        and np.any(b[1]-b[0] < s[1]-s[0]-1e-6) for j, s in solids.items())}
    faces = {}
    for i, (lo, hi) in boxes.items():
        f = features[i-1]
        circular = _circle(f) is not None
        normal = _frame(f)[3]
        if i in solids and i not in outer:
            continue
        directions = set()
        for j, (a, b) in outer.items():
            if np.any(np.minimum(hi, b) < np.maximum(lo, a)-1e-6):
                continue
            for k in range(3):
                # 圆孔取可见孔口方向；并不把侧投影中藏在壳内的母线当成外缘。
                if circular and abs(normal[k]) < 1e-7 and i != j:
                    continue
                for bound, sign in ((a[k], -1), (b[k], 1)):
                    if not lo[k]-1e-6 <= bound <= hi[k]+1e-6:
                        continue
                    across = [t for t in range(3) if t != k]
                    if any(c[k] < bound+sign*1e-5 < d[k] and
                           np.all(lo[across] >= c[across]) and np.all(hi[across] <= d[across])
                           for h, (c, d) in outer.items() if h != j):
                        continue
                    directions.add((k,sign))
        if directions:
            faces[i] = directions
    return faces


def _overview_tasks(features, candidate):
    """只声明图面内的参数；包在主体内部的加料交剖视，不假报外形覆盖。"""
    boxes = _additive_boxes(features)
    tasks = []
    for i, f in enumerate(features, 1):
        if i not in boxes:
            continue
        lo, hi = boxes[i]
        if any(j != i and np.all(lo >= b[0]-1e-6) and np.all(hi <= b[1]+1e-6)
               and np.any((hi-lo) < (b[1]-b[0])-1e-6) for j, b in boxes.items()):
            continue
        o, x, y, n = _frame(f)
        d = _unit(candidate['direction'])
        parameters = []
        if abs(n @ d) > 1-1e-7:
            parameters = _parameters(f, end=True)
        elif abs(n @ d) < 1e-7:
            parameters.append('depth')
            if _circle(f) is not None:
                parameters.append('loops[0].d')
            for j, loop in enumerate(f.get('loops', [])):
                if 'rect' in loop:
                    for axis, slots in ((x,(0,2)), (y,(1,3))):
                        if abs(axis @ d) < 1e-7:
                            parameters += [f'loops[{j}].rect[{k}]' for k in slots]
        if isinstance(f.get('plane'), dict):
            parameters.append('plane.origin')
        if parameters:
            tasks.append(dict(part=str(candidate['part']), feature=i, parameters=list(dict.fromkeys(parameters))))
    return tasks


def _outer_openings(candidates, parts, problem):
    """补背面/底面开口的必要局部向视，避免为少一个口恢复全套隐藏线。"""
    from drawkit import project
    extra = []
    for part in parts:
        name, features = str(part['name']), part.get('features', [])
        parents = [c for c in candidates if str(c.get('part')) == name and c.get('frame') == 'part'
                   and c['kind'] == 'basic' and not c.get('section')]
        boxes = _additive_boxes(features)
        if not parents or not boxes:
            continue
        lo, hi = max(boxes.values(), key=lambda b: np.prod(b[1]-b[0]))
        for index, f in enumerate(features, 1):
            circle = _circle(f)
            if circle is None or isinstance(f.get('plane'), dict) or f.get('op', 'cut' if f['type'] == 'hole' else 'add') != 'cut':
                continue
            o, x, y, n = _frame(f)
            at, radius = circle
            base = o + at[0]*x + at[1]*y
            axis = int(np.argmax(np.abs(n)))
            if any(not lo[k]+radius < base[k] < hi[k]-radius for k in range(3) if k != axis):
                continue
            ends = [base+t*n for t in _range(f)]
            openings = []
            for p in ends:
                for bound, sign in ((lo[axis],-1), (hi[axis],1)):
                    if abs(p[axis]-bound) < 1e-5:
                        outward = np.zeros(3); outward[axis] = sign
                        openings.append((p,-outward))
            if any(any(np.linalg.norm(d-np.asarray(c['direction'])) < 1e-7 for c in parents) for p,d in openings):
                continue                     # 通孔另一端已有真形方向，不重复
            for p, d in openings[:1]:
                up = [0,1,0] if abs(d[2]) > .9 else [0,0,1]
                u, v = project.frame_axes(d, up)
                parent = max(parents, key=lambda c: sum(np.dot(d,c[a])**2 for a in ('u','v')))
                center, depth = [float(p@a) for a in (u,v)], float(p@(-d))
                keep = dict(shape='circle', center=center, r=radius+max(8.,radius*.5),
                            _a_local=dict(depth=[depth-2*radius-6, depth+max(8.,radius)], features=[index],
                                          reason='背面/底面外部开口及必要连接'))
                title = f'局部端视{index}'
                extra.append(dict(kind='auxiliary', direction=d.tolist(), u=u.tolist(), v=v.tolist(), origin=[0,0,0],
                    parts=[name], part=name, frame='part', section=None, hidden=False, keep=keep,
                    view_key=f'{problem}:{name}:port:{index}', name=title, parent_key=parent['view_key'], expresses=[],
                    spec=dict(type='auxiliary', name=title, parent=parent['name'], direction=d.tolist(),up=up, hidden=False),
                    _head_sheet=parent['_head_sheet'], _opening_point=p.tolist()))
    return extra


def _interface(candidate, features, parent):
    """由轴向、原定位点选接口，不依靠“斜视几”这样的显示名。"""
    if candidate.get('_opening_point') is not None:
        ids = candidate['keep']['_a_local']['features']
        return [(i, features[i-1]) for i in ids], np.asarray(candidate['_opening_point']), candidate['keep']
    w = -_unit(candidate['direction'])
    matching = []
    for index, f in enumerate(features, 1):
        if not isinstance(f.get('plane'), dict) or _circle(f) is None:
            continue
        o, x, y, n = _frame(f)
        if np.dot(n, w) < 1 - 1e-7:
            continue
        if (candidate.get('keep') or {}).get('shape') == 'circle':
            center = candidate['keep']['center']
            q = np.array([(o - candidate['origin']) @ candidate[a] for a in ('u', 'v')])
        elif parent is not None:
            center = candidate['spec'].get('arrow_at', [0, 0])
            q = np.array([(o - parent['origin']) @ np.array(parent[a]) for a in ('u', 'v')])
        else:
            center, q = [0, 0], [0, 0]
        matching.append((float(np.linalg.norm(q - center)), index, f))
    if not matching:
        return None
    _, index, f = min(matching, key=lambda item: (item[0], item[1]))
    o, x, y, n = _frame(f)
    group = [(i, g) for i, g in enumerate(features, 1)
             if isinstance(g.get('plane'), dict) and _circle(g) is not None
             and np.linalg.norm(_frame(g)[0] - o) < 1e-6
             and np.dot(_frame(g)[3], n) > 1 - 1e-7]
    radius = max(np.linalg.norm(_circle(g)[0]) + _circle(g)[1] for _, g in group)
    bosses = [g for _, g in group if g.get('op') == 'add']
    root = min((_range(g)[0] for g in bosses), default=-max(10., radius))
    extension = max(6., radius * .2)
    center = [(o - candidate['origin']) @ np.asarray(candidate[a]) for a in ('u', 'v')]
    depth0 = (o - candidate['origin']) @ w
    local = dict(depth=[float(depth0 + root - extension), float(depth0 + max(radius, 6.))],
                 features=[i for i, _ in group],
                 reason='接口端面及根部连接；孔深和贯通关系由轴向剖表达')
    return group, o, dict(shape='circle', center=list(map(float, center)),
                         r=radius + max(8., radius * .3), _a_local=local)


def _position_views(candidates, context, faces_by_part, used):
    """为同一原链中的外部基准选共视方向；两处共用同一个正投影坐标系。"""
    from drawkit import project
    dims = context.get('dimensions', [])
    part_of_sheet = {s.get('id'): str(s.get('part') or '1') for s in context.get('head_sheets', [])
                     if s.get('frame', 'part') == 'part'}
    result = []
    for part in context['parts']:
        name = str(part['name'])
        features = part.get('features', [])
        faces = faces_by_part[name]
        parents = [c for c in candidates if str(c.get('part')) == name and c['kind'] == 'basic'
                   and c.get('frame') == 'part' and not c.get('section') and c['canonical_key'] == c['view_key']]
        if not parents:
            continue
        rows = [d for d in dims if part_of_sheet.get(d.get('_head_sheet')) == name and d.get('_witness_3d')]
        owners = {}
        for d in rows:
            w = d['_witness_3d']
            if w.get('axis') not in ('X','Y','Z') or 'point' not in w:
                continue
            k = 'XYZ'.index(w['axis'])
            owners[w['axis'],tuple(w['point'])] = [
                (item['feature'],item['point']) for item in w.get('shared_points', [])
                if item['feature'] in faces and abs(item['point'][k]-w['point'][k])<1e-6]
        groups = {}
        primary_geometry = {}
        project_candidate = context.get('project_candidate')
        existing_ports = {task['feature'] for c in candidates if c.get('_opening_point') is not None
                          and str(c.get('part'))==name for task in c['expresses']}
        def add_patch(key, direction, fid, point, radius, parameter, dimension):
            patches = groups.setdefault(key, (direction, {}))[1]
            pk = (fid, tuple(np.round(point, 6)))
            if pk not in patches:
                patches[pk] = dict(feature=fid, point=list(map(float,point)), r=float(radius), parameters=[],dimensions=[])
            if parameter not in patches[pk]['parameters']:
                patches[pk]['parameters'].append(parameter)
            if dimension not in patches[pk]['dimensions']:
                patches[pk]['dimensions'].append(dimension)

        for d in rows:
            w, fid = d['_witness_3d'], d.get('source_feature')
            if not fid:
                continue
            f = features[fid-1]
            circle = _circle(f)
            if circle is not None and project_candidate and fid in faces and fid not in existing_ports and (
                    d.get('type')=='diameter' or '径' in d.get('category','')) and not isinstance(f.get('plane'),dict):
                o,x,y,n = _frame(f)
                at,r = circle
                k = int(np.argmax(np.abs(n)))
                if abs(n[k])>1-1e-8:
                    # 正视实际已证明孔径则复用；背面的同心凸缘、沉台与通孔共一幅端视。
                    proven = False
                    for c in parents:
                        if abs(c['direction'][k])<1-1e-8:
                            continue
                        if c['view_key'] not in primary_geometry:
                            primary_geometry[c['view_key']] = project_candidate(c,scale=1.).get('witness_elements',[])
                        proven = any(el['feature']==fid and el['kind']=='contour'
                            and el['curve']['geom'] in ('circle','arc') and abs(el['curve']['r']-r)<1e-4
                            for el in primary_geometry[c['view_key']])
                        if proven:
                            break
                    if not proven:
                        for axis,sign in sorted(faces[fid]):
                            direction = -sign*np.eye(3)[k]
                            if axis!=k or any(np.linalg.norm(direction-c['direction'])<1e-6 for c in parents):
                                continue
                            center3 = o+at[0]*x+at[1]*y
                            p = max((center3+n*t for t in _range(f)),key=lambda q:sign*q[k])
                            key = f'face-{k}{"p" if sign>0 else "m"}'
                            parameter = 'd' if f['type']=='hole' else 'loops[0].d'
                            add_patch(key,direction,fid,p,r+max(4.,.2*r),parameter,d['_id'])
            if d.get('category') == '角度' and _circle(f) is not None and f.get('op') == 'add':
                o, x, y, axis = _frame(f)
                side = np.cross(axis, [0,0,1])
                if np.linalg.norm(side) > 1e-6 and '倾角' in str(d.get('text','')):
                    direction = _unit(side)
                    if direction[np.argmax(np.abs(direction))] < 0:
                        direction = -direction
                    at, radius = _circle(f)
                    p = o + at[0]*x + at[1]*y
                    add_patch(f'axis-{fid}', direction, fid, p, radius+6, 'plane.normal',d['_id'])
            if d.get('type') != 'linear' or w.get('axis') not in ('X','Y','Z') or 'from' not in w or 'to' not in w:
                continue
            k = 'XYZ'.index(w['axis'])
            left = owners.get((w['axis'],tuple(w['from'])), [])
            right = owners.get((w['axis'],tuple(w['to'])), [])
            options = []
            for first, p in left:
                for second, q in right:
                    if first == second:
                        continue
                    for fa in faces[first]:
                        for fb in faces[second]:
                            if k in (fa[0], fb[0]) or (fa[0] == fb[0] and fa != fb):
                                continue
                            outward = _unit(np.eye(3)[fa[0]]*fa[1] + np.eye(3)[fb[0]]*fb[1])
                            basic = any(np.linalg.norm(outward+np.asarray(c['direction']))<1e-6 for c in parents)
                            rank = 0 if basic else 1 if fa==fb else 2
                            options.append((rank,second!=fid,float(np.linalg.norm(np.subtract(p,q))),fa,fb,first,second,p,q,outward))
            if options:
                rank, _, _, fa, fb, first, second, p, q, outward = min(options,key=lambda item:item[:-1])
                if rank == 0:
                    continue
                key = 'face-' + '-'.join(f'{i}{"p" if sign>0 else "m"}' for i,sign in sorted({fa,fb}))
                for target, point, face in ((first,p,fa), (second,q,fb)):
                    feature = features[target-1]
                    point = np.array(point,float)
                    radius = 10.
                    circle = _circle(feature)
                    if circle is not None:
                        o, x, y, n = _frame(feature)
                        at, r = circle
                        ends = [o+at[0]*x+at[1]*y+t*n for t in _range(feature)]
                        # 只有不移动被标坐标时才能把原孔轴基准转到外侧孔口。
                        end = max(ends,key=lambda p:p[face[0]]*face[1])
                        if abs(end[k]-point[k]) < 1e-5:
                            point = end
                        radius = r + max(4., .25*r)
                    add_patch(key,-outward,target,point,radius,'position.'+w['axis'],d['_id'])
        for key, (direction, group) in groups.items():
            patches = list(group.values())
            up = [0,1,0] if abs(direction[2])>.9 else [0,0,1]
            u, v = project.frame_axes(direction, up)
            parent = max(parents, key=lambda c: 1-np.dot(c['direction'], direction)**2)
            p = np.array(patches[0]['point'])
            centers = np.array([[np.dot(patch['point'],a) for a in (u,v)] for patch in patches])
            center = centers.mean(axis=0)
            keep = dict(shape='circle', center=center.tolist(),
                        r=max(float(np.linalg.norm(q-center))+patch['r'] for q,patch in zip(centers,patches)),
                        _a_position=patches)
            letter = next((chr(n) for n in range(65,91) if chr(n) not in used), f'V{len(used)+1}')
            used.add(letter)
            title = letter+(' 向孔口端视' if all(
                all(param.endswith('.d') or param=='d' for param in entry['parameters']) for entry in patches
            ) else ' 向定位图')
            vk = f"{context.get('problem','local')}:{name}:position:{key}"
            spec = dict(type='auxiliary',name=title, label=letter, parent=parent['name'],
                        arrow_at=[float((p-parent['origin'])@np.asarray(parent[a])) for a in ('u','v')],
                        direction=direction.tolist(),up=up,keep=copy.deepcopy(keep),hidden=False,free=True)
            targets = sorted({patch['feature'] for patch in patches})
            candidate = dict(kind='auxiliary',direction=direction.tolist(),u=u.tolist(),v=v.tolist(),
                origin=[0,0,0],parts=[name],part=name,frame='part',section=None,hidden=False,keep=keep,
                view_key=vk,canonical_key=vk,name=title,spec=spec,parent_key=parent['view_key'],
                source_key=parent['view_key'],_head_sheet=parent['_head_sheet'],role='detail',
                layout_group=f'{name}:position:{key}',layout_optional=True,
                _a_features=[entry for entry in parent['_a_features'] if entry['feature'] in targets],
                omitted_features=[],expresses=[dict(part=name,feature=i,parameters=sorted({
                    par for patch in patches if patch['feature']==i for par in patch['parameters']})) for i in targets])
            if project_candidate:
                # 定位父图只用于画箭头；A 规划期集成端尚未注册父图依赖。
                def proved(c):
                    geom = project_candidate(dict(c,parent_key=None,source_key=None),scale=1.)
                    witnesses = geom.get('witness_elements',[])
                    contours = {e['feature'] for e in witnesses if e['kind']=='contour'}
                    axes = {e['feature'] for e in witnesses if e['kind']=='axis'}
                    true_circles = {e['feature'] for e in witnesses if e['kind']=='contour'
                                    and e['curve']['geom'] in ('circle','arc')}
                    for task in c['expresses']:
                        i = task['feature']
                        task['parameters'] = [param for param in task['parameters'] if i in contours and (
                            i in true_circles if param=='d' or param.endswith('.d')
                            else i in axes if param=='plane.normal' else True)]
                    if key.startswith('axis-'):
                        return targets[0] in axes
                    diameters = {p['feature'] for p in patches
                                 if any(v=='d' or v.endswith('.d') for v in p['parameters'])}
                    if any(e['feature'] in diameters and e['kind']=='contour'
                           and e['curve']['geom'] in ('circle','arc') for e in witnesses):
                        return True
                    pairs = {}
                    for patch in patches:
                        for did in patch['dimensions']:
                            pairs.setdefault(did,set()).add(patch['feature'])
                    return any(len(ids)>=2 and ids<=contours for ids in pairs.values())
                intended = copy.deepcopy(candidate['expresses'])
                if not proved(candidate):
                    if not key.startswith('axis-'):
                        continue
                    candidate['direction'] = spec['direction'] = (-direction).tolist()
                    candidate['u'] = (-u).tolist()
                    keep['center'][0] *= -1
                    spec['keep'] = copy.deepcopy(keep)
                    candidate['expresses'] = intended
                    if not proved(candidate):
                        continue
                candidate['expresses'] = [task for task in candidate['expresses'] if task['parameters']]
                visible_ids = {task['feature'] for task in candidate['expresses']}
                anchor = next(patch['point'] for patch in patches if patch['feature'] in visible_ids)
                spec['arrow_at'] = [float((np.asarray(anchor)-parent['origin'])@parent[a]) for a in ('u','v')]
            result.append(candidate)
    return result


def plan_views(context, *, legacy):
    """旧键保留为兼容别名，canonical_key 标出应合并的重复图。

    role/layout_group/source_key 供 D 分组，expresses 供 C 选表达任务。
    omitted_features 明确交 B 补内部表达，不能把关闭虚线当覆盖完成。
    """
    candidates = copy.deepcopy(legacy())
    candidates += _outer_openings(candidates, context['parts'], context.get('problem', 'local'))
    by_key = {c['view_key']: c for c in candidates}
    part_map = {str(p.get('name', i)): p for i, p in enumerate(context['parts'], 1)}
    faces_by_part = {name: _external_faces(p.get('features', [])) for name,p in part_map.items()}
    datum_axes = {}
    sheets = {s.get('id'):str(s.get('part') or '1') for s in context.get('head_sheets',[])
              if s.get('frame','part')=='part'}
    for dimension in context.get('dimensions',[]):
        w = dimension.get('_witness_3d') or {}
        if dimension.get('type')=='linear' and w.get('axis') in ('X','Y','Z'):
            name = sheets.get(dimension.get('_head_sheet'))
            for fid in {dimension.get('source_feature'),*(p['feature'] for p in w.get('shared_points',[]))}:
                datum_axes.setdefault((name,fid),set()).add(w['axis'])
    used = {c['spec'].get('section', {}).get('label') for c in candidates}
    letters, canonical = {}, {}
    for c in candidates:
        if c.get('section') or c['kind'] == 'removed_section':
            continue
        features = part_map.get(str(c.get('part')), {}).get('features', [])
        c['_a_features'] = ([dict(part=str(c['part']), feature=i, definition=copy.deepcopy(f))
                             for i, f in enumerate(features, 1)] if c.get('frame') == 'part' else [])
        if c['kind']=='basic':
            for entry in c['_a_features']:
                axes = datum_axes.get((entry['part'],entry['feature']))
                if axes:
                    entry['datum_axes'] = sorted(axes)
        c['hidden'] = False
        c['spec']['hidden'] = False
        c['role'] = 'overview'
        c['source_key'] = c.get('parent_key')
        c['layout_group'] = f"{c.get('frame')}:{c.get('part')}:body"
        c['expresses'] = _overview_tasks(features, c)
        outside = faces_by_part.get(str(c.get('part')), {})
        c['omitted_features'] = [i for i, f in enumerate(features, 1)
                                 if f.get('op') == 'cut' or f.get('type') == 'hole']
        if c['kind'] == 'basic' and c.get('frame') == 'part':
            # 未被省略也不等同于可标：C 仍须在这张图上取得实际轮廓见证。
            c['omitted_features'] = [i for i in c['omitted_features'] if i not in outside]
            for i in outside:
                if not any(item['feature'] == i for item in c['expresses']):
                    f = features[i-1]
                    c['expresses'].append(dict(part=str(c['part']),feature=i,parameters=[
                        'position.'+axis for axis,t in zip('XYZ',c['direction']) if abs(t)<1e-7]))
            c['layout_optional'] = c['spec'].get('type') != 'front'
        if c['kind'] == 'auxiliary':
            parent = by_key.get(c.get('parent_key'))
            found = _interface(c, features, parent)
            if found:
                group, origin, keep = found
                c['keep'] = keep
                c['spec']['keep'] = copy.deepcopy(keep)
                c['role'] = 'detail'
                # 正交背面/底面孔已有真形及定位替代图时允许 D 省略；独有斜端面须保留。
                c['layout_optional'] = c.get('_opening_point') is not None
                c['layout_group'] = f"{c.get('part')}:interface:{group[0][0]}"
                c['expresses'] = [dict(part=str(c['part']), feature=i, parameters=_parameters(f, end=True))
                                  for i, f in group]
                identity = (c.get('part'), group[0][0])
                if identity not in letters:
                    letter = next((chr(i) for i in range(65, 91) if chr(i) not in used), None)
                    letters[identity] = letter or f"V{len(letters) + 1}"
                    used.add(letters[identity])
                c['spec']['label'] = letters[identity]
                c['spec']['name'] = letters[identity] + ' 向端视'
                parents = [p for p in candidates if p.get('part') == c.get('part')
                           and p.get('frame') == c.get('frame') and p['kind'] == 'basic'
                           and not p.get('section') and p['_head_sheet'] == c['_head_sheet']]
                if parents:
                    parent = max(parents, key=lambda p: sum(float(np.dot(c['direction'], p[a])) ** 2 for a in ('u', 'v')))
                    c['parent_key'] = parent['view_key']
                    c['source_key'] = parent['view_key']
                    c['spec']['parent'] = parent['spec'].get('name', parent['name'])
                    c['spec']['arrow_at'] = [float((origin - parent['origin']) @ np.asarray(parent[a])) for a in ('u', 'v')]
        elif c['kind'] == 'detail':
            c['role'] = 'detail'
            c['layout_optional'] = True
            c['layout_group'] = f"{c.get('part')}:detail:{c['detail']['center']}"
            c['expresses'] = []
        signature = json.dumps({k: c.get(k) for k in
                                ('part', 'frame', 'kind', 'parts', 'direction', 'u', 'v', 'origin', 'keep', 'detail')}, sort_keys=True)
        c['canonical_key'] = canonical.setdefault(signature, c['view_key'])
    for c in candidates:
        if c.get('source_key') in by_key:
            c['source_key'] = by_key[c['source_key']].get('canonical_key', c['source_key'])
    additions = _position_views(candidates, context, faces_by_part, used)
    projector = context.get('project_candidate')
    if projector:
        tested = {}
        for c in candidates:
            local = (c.get('keep') or {}).get('_a_local',{})
            if not local or c.get('section'):
                continue
            targets = set(local['features'])
            if c.get('_opening_point') is not None:
                # 同向定位图若确有同孔真形，用同一候选兼容旧键，D 可以合并。
                for pos in additions:
                    if c['part']!=pos['part'] or not np.allclose(c['direction'],pos['direction']):
                        continue
                    if not targets.issubset({task['feature'] for task in pos['expresses']}):
                        continue
                    geom = projector(dict(pos,parent_key=None,source_key=None),scale=1.)
                    proved = {w['feature'] for w in geom.get('witness_elements',[])
                              if w['kind']=='contour' and w['curve']['geom']=='circle'}
                    if targets.issubset(proved):
                        alias = c['view_key'],c['name']
                        c.update(copy.deepcopy(pos))
                        c['view_key'],c['name'] = alias
                        break
            elif not any(s['feature'] in targets and s['definition'].get('op')=='add' for s in c['_a_features']):
                if c['canonical_key'] not in tested:
                    # 用未移去任何遮挡物的最终实体判断是否真为外部接口。
                    probe = dict(c,keep=None,parent_key=None,source_key=None,
                                 _a_features=[s for s in c['_a_features'] if s['feature'] in targets])
                    geom = projector(probe,scale=1.)
                    tested[c['canonical_key']] = any(w['feature'] in targets and w['kind']=='contour'
                                                      for w in geom.get('witness_elements',[]))
                c['layout_optional'] = not tested[c['canonical_key']]
    return candidates + additions


def _subtract_artificial(curves, artificial):
    from drawkit import geom2d as g2
    if not artificial:
        return curves
    marked = [dict(c, type='_cut') for c in artificial]
    return [c for c in g2.merge(curves + marked, priority=('_cut', 'visible')) if c['type'] == 'visible']


def _local_projection(shapes, definition):
    """精确消隐局部最终实体，人工边界换波浪线，不更改参考实体。"""
    from OCP.BRepAlgoAPI import BRepAlgoAPI_Common
    from OCP.HLRAlgo import HLRAlgo_Projector
    from OCP.HLRBRep import HLRBRep_Algo, HLRBRep_HLRToShape
    from OCP.gp import gp_Ax2
    from drawkit import geom2d as g2, model, project
    pj = project.Projector(definition)
    region = {k: v for k, v in definition['keep'].items() if not k.startswith('_a_')}
    low, high = definition['keep']['_a_local']['depth']
    source = [shapes[n] for n in (definition.get('parts') or list(shapes)) if n in shapes and shapes[n] is not None]
    big = project.big_size(source)
    tool = project.local_box(pj, [-big, -big, low], [big, big, high])
    local_shapes, caps = [], []
    for shape in source:
        result = BRepAlgoAPI_Common(shape, tool).Shape()
        if result.IsNull():
            continue
        local_shapes.append(result)
        for height in (low, high):
            original = project.plane_faces(shape, pj, height)
            for face in project.plane_faces(result, pj, height):
                if not any(face.IsSame(f) for f in original):
                    caps.append(face)
    if not local_shapes:
        raise ValueError('局部范围没有实体；请调整接口深度，不退回整件线框')
    algo = HLRBRep_Algo()
    for shape in local_shapes:
        algo.Add(shape)
    # HLRToShape 的按实体查询只识别 Add 的顶层形状。单独注册盖面，
    # 仍由完整局部实体遮挡它，才能取出“可见的人工边”而非后盖面投影。
    for cap in caps:
        algo.Add(cap)
    algo.Projector(HLRAlgo_Projector(gp_Ax2(model.pnt(pj.o), model.gdir(pj.w), model.gdir(pj.u))))
    algo.Update()
    algo.Hide()
    output = HLRBRep_HLRToShape(algo)
    xy = lambda p: (p.X(), p.Y())
    curves = project.compound_curves(output.VCompound(), 'visible', xy)
    curves += project.compound_curves(output.OutLineVCompound(), 'visible', xy)
    artificial = []
    for cap in caps:
        artificial += project.compound_curves(output.VCompound(cap), 'visible', xy)
        artificial += project.compound_curves(output.OutLineVCompound(cap), 'visible', xy)
    curves = g2.clip_all(_subtract_artificial(g2.merge(curves), g2.merge(artificial)), region)
    # 部分旧题的斜孔入口在毛坯内部，真实端视只能见局部孔口或完全遮住。
    # 仅补目标孔本身的真形隐藏圆弧，不能为此恢复整个零件的隐藏线。
    hidden = project.compound_curves(output.HCompound(), 'hidden', xy)
    hidden += project.compound_curves(output.OutLineHCompound(), 'hidden', xy)
    allowed = []
    target_has_boss = False
    ids = definition['keep']['_a_local'].get('features', [])
    for source_feature in definition.get('_a_features', []):
        f = source_feature['definition']
        if source_feature['feature'] not in ids or _circle(f) is None:
            continue
        target_has_boss |= f.get('op') == 'add'
        o, x, y, n = _frame(f)
        at, radius = _circle(f)
        if abs(n @ pj.w) > 1 - 1e-7:
            allowed.append(g2.arc(pj.to2(o + at[0]*x + at[1]*y), radius, 0, 360, 'hidden'))
    # 相交曲面上的孔口常由内核作为细分折线返回。已知真实圆柱轴系时，
    # 将采样误差内的圆周折线还原为该圆的精确弧，保留原 HLR 可见性。
    curves = [_target_arc(c,allowed) for c in curves]
    hidden = [_target_arc(c,allowed) for c in hidden]
    curves = g2.merge(curves + g2.clip_all([c for c in hidden if any(_on_curve(c, e) for e in allowed)], region))
    target_only = bool(allowed) and not target_has_boss
    if target_only:
        # 单纯钻孔没有独立凸台根部。端视只表达该孔及所在壁的局部范围，
        # 邻轴凸台/腔室的背景棱线没有新的表达任务，不随局部孔图带入。
        curves = [c for c in curves if any(_on_curve(c,e) for e in allowed)]
    waves = []
    for edge in ([] if target_only else g2.clip_all(g2.merge(artificial), region)):
        path = g2.sample(edge, .5 / pj.scale)
        waves += g2.wave_runs(path, [True] * len(path), project.WAVE_AMP / pj.scale, project.WAVE_LEN / pj.scale)
    curves += project.auto_centerlines(local_shapes, pj, curves)
    curves = g2.clip_all(curves, region)
    curves += project.boundary_waves(region, pj, project.Material(local_shapes))
    return dict(lines=curves + waves, hatches=[], _shapes=local_shapes)


def _point_on_segment(p, a, b, tol=1e-4):
    a, b = np.asarray(a), np.asarray(b)
    d = b - a
    if np.linalg.norm(d) < tol:
        return np.linalg.norm(p - a) < tol
    t = np.dot(p - a, d) / np.dot(d, d)
    return -tol <= t <= 1 + tol and np.linalg.norm(p - a - t*d) < tol


def _target_arc(curve, circles):
    from drawkit import geom2d as g2
    if curve['geom'] != 'polyline' or len(curve['points']) < 3:
        return curve
    points = np.asarray(curve['points'])
    for circle in circles:
        q = points-np.asarray(circle['center'])
        if np.max(np.abs(np.linalg.norm(q,axis=1)-circle['r'])) > .03:
            continue
        angles = np.unwrap(np.arctan2(q[:,1],q[:,0]))
        if angles[-1] < angles[0]:
            angles = angles[::-1]
        if np.any(np.diff(angles) < -1e-5) or not .01 < angles[-1]-angles[0] <= 2*np.pi+1e-5:
            continue
        return g2.arc(circle['center'],circle['r'],float(np.degrees(angles[0])),float(np.degrees(angles[-1])),curve['type'])
    return curve


def _on_curve(curve, expected):
    if curve['geom'] == expected['geom'] == 'line':
        return all(_point_on_segment(np.asarray(curve[p]), expected['from'], expected['to']) for p in ('from', 'to'))
    if curve['geom'] in ('arc', 'circle') and expected['geom'] in ('arc', 'circle'):
        return np.linalg.norm(np.asarray(curve['center']) - expected['center']) < 1e-4 and abs(curve['r'] - expected['r']) < 1e-4
    return False


def _necessary_axes(lines, scale):
    """只留有可见圆或成对母线支撑的原中心线，去掉穿箱体的内部孔轴。"""
    from drawkit import geom2d as g2
    visible = [c for c in lines if c['type'] == 'visible']
    circles = [c for c in visible if c['geom'] in ('circle', 'arc')]
    # 局部端视中特意保留的真形隐藏圆也有必要的真实孔轴。
    circles += [c for c in lines if c['type'] == 'hidden' and c['geom'] in ('circle', 'arc')]
    straight = [c for c in visible if c['geom'] == 'line']
    out = [c for c in lines if c['type'] != 'center']
    ext = 3. / scale
    for c in lines:
        if c['type'] != 'center':
            continue
        if c['geom'] in ('circle', 'arc'):
            if sum(abs(np.linalg.norm(np.asarray(k['center'])-c['center'])-c['r']) < 1e-4 for k in circles) >= 3:
                out.append(c)
            continue
        if c['geom'] != 'line':
            continue
        a, b = np.asarray(c['from']), np.asarray(c['to'])
        if np.linalg.norm(b-a) < 1e-6:
            continue
        e = _unit(b-a)
        n = np.array([-e[1], e[0]])
        intervals = []
        for arc in circles:
            p = np.asarray(arc['center'])
            if abs((p-a) @ n) < 1e-4 and _point_on_segment(p, a, b):
                t = float((p-a) @ e)
                intervals.append((max(0., t-arc['r']-ext), min(np.linalg.norm(b-a), t+arc['r']+ext)))
        sides = []
        for ln in straight:
            p, q = np.asarray(ln['from']), np.asarray(ln['to'])
            if np.linalg.norm(q-p) > 1e-6 and abs(_unit(q-p) @ n) < 1e-5:
                sides.append((float((p-a) @ n), sorted([float((p-a) @ e), float((q-a) @ e)])))
        for offset, span in sides:
            if offset < 1e-4:
                continue
            for opposite, other_span in sides:
                lo, hi = max(span[0],other_span[0]), min(span[1],other_span[1])
                if abs(offset+opposite) < 1e-4 and hi-lo > 1e-4:
                    intervals.append((max(0.,lo-ext), min(np.linalg.norm(b-a),hi+ext)))
        for lo, hi in intervals:
            if hi-lo > 1e-4:
                out.append(g2.line(a+lo*e, a+hi*e, 'center'))
    centers = g2.merge([c for c in out if c['type'] == 'center'], priority=('center',))
    return [c for c in out if c['type'] != 'center'] + centers


def _witnesses(geometry, definition):
    """解析边界与保留图线的交集；R/C 不做近邻身份猜测。"""
    from drawkit import geom2d as g2, project
    from drawing_common import visible_curve_overlap
    pj = project.Projector(definition)
    visible = [c for c in geometry['lines'] if c['type'] == 'visible']
    centers = [c for c in geometry['lines'] if c['type'] == 'center']
    from OCP.IntCurvesFace import IntCurvesFace_ShapeIntersector
    from OCP.gp import gp_Lin
    from drawkit import model
    intersectors = []
    for shape in geometry.get('_shapes', []):
        tracer = IntCurvesFace_ShapeIntersector()
        tracer.Load(shape, 1e-7)
        intersectors.append(tracer)
    front_cache = {}

    def front_points(uv):
        key = tuple(np.round(uv, 7))
        if key not in front_cache:
            hits = []
            # 轮廓处的相切射线可能不相交；邻近四条射线只探真实材料侧。
            for delta in ([0,0], [1e-4,0], [-1e-4,0], [0,1e-4], [0,-1e-4]):
                p = np.asarray(uv) + delta
                ray = gp_Lin(model.pnt(pj.world(*p)), model.gdir(pj.w))
                choices = []
                for tracer in intersectors:
                    tracer.Perform(ray, -1e7, 1e7)
                    if tracer.IsDone():
                        choices += [(tracer.WParameter(i), tracer.Pnt(i)) for i in range(1,tracer.NbPnt()+1)]
                if choices:
                    hit = max(choices, key=lambda pair: pair[0])[1]
                    hits.append(np.array([hit.X(),hit.Y(),hit.Z()]))
            front_cache[key] = hits
        return front_cache[key]

    def has_3d_source(curve, feature):
        samples = (np.asarray(curve['points']) if curve['geom']=='polyline' else
                   g2.sample(curve, max(.1, g2.length(curve)/8)))
        chosen = samples[np.linspace(0,len(samples)-1,9).round().astype(int)[1:-1]]
        return all(any(_on_feature_surface(p, feature) for p in front_points(uv)) for uv in chosen)
    out = []
    surfaces = []
    for entry in definition.get('_a_features', []):
        f = entry['definition']
        loops = f.get('loops',[])
        if len(loops)>1 and all('circle' in loop for loop in loops):
            # 外露环槽有不同半径的内外柱面，共用原特征号，各自核对有限深度。
            surfaces.extend((dict(entry,definition=dict(f,loops=[loop])),i) for i,loop in enumerate(loops))
        else:
            surfaces.append((entry,None))
    for source, loop_index in surfaces:
        f = source['definition']
        if f.get('type') not in ('extrude', 'hole'):
            continue
        o, x, y, n = _frame(f)
        circle, expected, axis_center = _circle(f), [], None
        low, high = _range(f)
        if circle is not None:
            at, radius = circle
            base = o + at[0] * x + at[1] * y
            a, b = np.asarray(pj.to2(base + low*n)), np.asarray(pj.to2(base + high*n))
            if abs(n @ pj.w) > 1 - 1e-7:
                axis_center = np.asarray(pj.to2(base))
                expected.append(g2.arc(axis_center, radius, 0, 360, 'visible'))
            elif np.linalg.norm(b-a) > 1e-7:
                e = _unit(b-a)
                q = np.array([-e[1], e[0]]) * radius
                expected.extend([g2.line(a+q, b+q, 'visible'), g2.line(a-q, b-q, 'visible')])
                if abs(n @ pj.w) < 1e-7:
                    # 圆端面侧投为直线；其归属仍须由前方真实圆柱面验证。
                    expected.extend([g2.line(a-q,a+q,'visible'),g2.line(b-q,b+q,'visible')])
        else:
            for loop in f.get('loops', []):
                if 'rect' in loop:
                    x0, y0, x1, y1 = loop['rect']
                    pts = [(x0,y0), (x1,y0), (x1,y1), (x0,y1)]
                elif 'path' in loop and all(isinstance(p, list) for p in loop['path']):
                    pts = loop['path']
                else:
                    continue
                for i, p in enumerate(pts):
                    q = pts[(i+1) % len(pts)]
                    for depth in (low, high):
                        expected.append(g2.line(pj.to2(o+p[0]*x+p[1]*y+depth*n), pj.to2(o+q[0]*x+q[1]*y+depth*n), 'visible'))
                    expected.append(g2.line(pj.to2(o+p[0]*x+p[1]*y+low*n), pj.to2(o+p[0]*x+p[1]*y+high*n), 'visible'))
        matched = {}
        for c in visible:
            pieces = []
            if any(_on_curve(c,e) for e in expected):
                pieces = [c]
            elif c['geom']=='line':
                pieces = [piece for e in expected for piece in visible_curve_overlap(e,c)]
            elif c['geom']=='polyline' and circle is not None:
                # 斜投影的孔口以及与弯壁相交的孔口由 HLR 给出折线。
                # 保留原始节点，沿观察射线核对前表面及有限圆柱，不拟合成真形圆。
                pts = np.asarray(c['points'])
                lo2, hi2 = np.minimum(a,b)-radius-1e-4,np.maximum(a,b)+radius+1e-4
                if np.all(pts.min(axis=0)>=lo2) and np.all(pts.max(axis=0)<=hi2):
                    pieces = [c]
            for piece in pieces:
                key = repr(piece)
                if key not in matched and has_3d_source(piece,f):
                    matched[key] = piece
        params = _parameters(f, end=abs(n@pj.w)>1-1e-7)
        if loop_index is not None:
            params = [p.replace('loops[0]',f'loops[{loop_index}]') for p in params]
        for c in matched.values():
            out.append(dict(part=source['part'], feature=source['feature'], parameters=params,
                            kind='contour', curve=copy.deepcopy(c), provenance='analytic-3D-feature-surface / frontmost-final-material / retained-visible-HLR'))
        if matched and axis_center is not None:
            for c in centers:
                if c['geom'] == 'line' and _point_on_segment(axis_center, c['from'], c['to']):
                    out.append(dict(part=source['part'], feature=source['feature'], parameters=['at' if f['type'] == 'hole' else f'loops[{loop_index or 0}].circle'],
                                    kind='axis', curve=copy.deepcopy(c), provenance='true-cylinder-axis / visible-coaxial-contour'))
    return out


def _on_feature_surface(point, feature, tol=5e-4):
    """拒绝只有二维重合、实际属于不同深度特征的图线身份。"""
    o, x, y, n = _frame(feature)
    q = point-o
    uv, t = np.array([q@x,q@y]), float(q@n)
    low, high = _range(feature)
    if not low-tol <= t <= high+tol:
        return False
    circle = _circle(feature)
    if circle is not None:
        at, radius = circle
        return abs(np.linalg.norm(uv-at)-radius) < tol
    for loop in feature.get('loops', []):
        if 'rect' in loop:
            x0,y0,x1,y1 = loop['rect']
            pts = [(x0,y0),(x1,y0),(x1,y1),(x0,y1)]
        elif 'path' in loop and all(isinstance(p,list) for p in loop['path']):
            pts = loop['path']
        else:
            continue
        if any(_point_on_segment(uv,pts[i],pts[(i+1)%len(pts)],tol) for i in range(len(pts))):
            return True
    return False


def _position_projection(shapes, definition):
    """两基准保持同一投影。先由完整实体消隐，局部只取指定三维特征的可见边。"""
    from drawkit import geom2d as g2, model, project
    from OCP.gp import gp_Lin
    pj = project.Projector(definition)
    full = project.project_view(shapes, dict(definition, keep=None, hidden=False))
    sources = {s['feature']:s for s in definition['_a_features']}
    material = project.Material(full['_shapes'])
    lines, elements, patches = [], [], []
    bounds = [(c, g2.bounds([c])) for c in full['lines'] if c['type'] in ('visible','center')]
    for patch in definition['keep']['_a_position']:
        source = sources[patch['feature']]
        center, r = np.array(pj.to2(patch['point'])), patch['r']
        region = dict(shape='circle', center=center.tolist(), r=r)
        nearby = [c for c, b in bounds if b[0] <= center[0]+r and b[2] >= center[0]-r
                  and b[1] <= center[1]+r and b[3] >= center[1]-r]
        clipped = g2.clip_all(nearby,region)
        witnesses = _witnesses(dict(full,lines=clipped),dict(definition,_a_features=[source]))
        contours = [el['curve'] for el in witnesses if el['kind']=='contour']
        if not contours:
            continue
        x0,y0,x1,y1 = g2.bounds(contours)
        if max(x1-x0,y1-y0)<r*.25:
            continue  # 遮挡后只剩不可辨的小线头，不能据此开一块定位窗口。
        supported = _necessary_axes(contours+[c for c in clipped if c['type']=='center'],pj.scale)
        # 被前方实体遮去的孔口要交代可见弧为何在此中断。只补与目标端点
        # 相接的局部真实直棱，不给遮挡物贴上孔的身份，也不带入整片背景。
        ends = []
        for c in contours:
            if c['geom']!='circle':
                pair = g2.sample(c,1e6)[[0,-1]]
                ends.extend(p for p in pair if np.linalg.norm(p-center)<r-1e-3)
        for c in clipped:
            if c['type']=='visible' and c['geom']=='line' and c not in contours and any(
                    _point_on_segment(p,c['from'],c['to'],1e-4) for p in ends):
                supported.append(c)
        f = source['definition']
        circle = _circle(f)
        if circle is not None:
            o,x,y,n = _frame(f)
            at,radius = circle
            start = o + at[0]*x + at[1]*y
            a = np.array(pj.to2(start))
            delta = np.array([n@pj.u,n@pj.v])
            if np.linalg.norm(delta)>1e-6:
                e = _unit(delta)
                side = np.array([-e[1],e[0]])
                # 在看得到孔口两侧的斜视中，仅沿真实柱轴画短点画线。
                if abs(n@pj.w)>1e-6:
                    for t in _range(f):
                        mouth = a+t*delta
                        rim = [c for c in contours if c['geom']=='polyline']
                        points = [np.asarray(c['points']) for c in rim]
                        if not points:
                            continue
                        xy = np.concatenate(points)-mouth
                        # 只用落在这个圆端面投影椭圆上的节点，排除另一端。
                        radial = np.hypot(xy@side,(xy@e)/(n@pj.w))
                        xy = xy[np.abs(radial-radius)<.03]
                        if len(xy)<5 or min((xy@side).max(),-(xy@side).min()) < .8*radius:
                            continue
                        h = abs(n@pj.w)*radius + 2/pj.scale
                        supported.extend(g2.clip(g2.line(mouth-e*h,mouth+e*h,'center'),region))
                        break
                for c in supported:
                    if c['type']=='center' and c['geom']=='line' and all(
                            abs((np.asarray(c[p])-a)@side)<1e-4 for p in ('from','to')):
                        witnesses.append(dict(part=source['part'],feature=source['feature'],
                            parameters=['plane.normal'],kind='axis',curve=c,
                            provenance='finite-cylinder-axis / same-feature visible rim or paired generators'))
        lines.extend(supported)
        elements.extend(witnesses)
        patches.append((region,pj.depth(patch['point'])))
    # 只在目标实体所在深度且观察者最近的材料上画截断线；后方的无关物体不能补齐波浪线。
    waves = []
    for idx, (region, depth) in enumerate(patches):
        path = g2.boundary_polyline(region,.5/pj.scale)
        exposed = np.ones(len(path), dtype=bool)
        for j, (other, _) in enumerate(patches):
            if j != idx and other != region:
                exposed &= ~g2.contains(other,path)
        for i in np.flatnonzero(exposed):
            ray = gp_Lin(model.pnt(pj.world(*path[i])),model.gdir(pj.w))
            heights = []
            for tracer in material.items:
                tracer.Perform(ray,-1e7,1e7)
                if tracer.IsDone():
                    heights.extend(tracer.WParameter(k) for k in range(1,tracer.NbPnt()+1))
            exposed[i] = bool(heights and abs(max(heights)-depth) <= region['r']*1.5)
        waves.extend(c for c in g2.wave_runs(path,exposed,project.WAVE_AMP/pj.scale,project.WAVE_LEN/pj.scale)
                     if g2.length(c)>=project.WAVE_LEN/pj.scale)
    # 同一条线可被两特征共用，但在图上只画一次。
    unique = {repr(c):c for c in lines+waves}
    seen = {(el['feature'],el['kind'],repr(el['curve'])):el for el in elements
            if repr(el['curve']) in unique}
    return dict(lines=list(unique.values()),witness_elements=list(seen.values()),hatches=[],_shapes=full['_shapes'])


def _datum_axes_on_partial_rims(geometry, definition):
    """缺口切去小段孔口时，仅补原链所需、由大于半圆的真实孔缘支撑的中心线。"""
    from drawkit import geom2d as g2, project
    pj = project.Projector(definition)
    entries = geometry['witness_elements']
    for s in definition.get('_a_features',[]):
        f = s['definition']
        if not s.get('datum_axes') or _circle(f) is None:
            continue
        o,x,y,n = _frame(f)
        if abs(n@pj.w)<1-1e-7:
            continue
        at,r = _circle(f)
        center = np.array(pj.to2(o+at[0]*x+at[1]*y))
        rims = [w['curve'] for w in entries if w['feature']==s['feature'] and w['kind']=='contour'
                and _on_curve(w['curve'],dict(geom='circle',center=center,r=r))]
        if not rims or any(c['geom']=='circle' for c in rims):
            continue
        arcs = g2.merge([g2.arc(center,r,*g2.span_of(c),'visible') for c in rims])
        if sum(g2.length(c) for c in arcs)<=np.pi*r:
            continue
        for axis in s['datum_axes']:
            k = 'XYZ'.index(axis)
            e = np.array([pj.u[k],pj.v[k]])
            if np.linalg.norm(e)<1-1e-7:
                continue
            tangent = np.array([-e[1],e[0]])
            if any(c['type']=='center' and c['geom']=='line' and
                   all(abs((np.asarray(c[p])-center)@e)<1e-5 for p in ('from','to')) and
                   _point_on_segment(center,c['from'],c['to']) for c in geometry['lines']):
                continue
            t = (r+project.CENTER_EXT/pj.scale)*tangent
            curve = g2.line(center-t,center+t,'center')
            geometry['lines'].append(curve)
            entries.append(dict(part=s['part'],feature=s['feature'],kind='axis',parameters=['position.'+axis],
                                curve=curve,provenance='true-cylinder-axis / same-feature visible major arc'))


def project_external_view(shapes, definition, *, parent=None, legacy):
    """原内核输出格式加 witness_elements，不改变传入实体或定义。"""
    from drawkit import project
    vdef = copy.deepcopy(definition)
    if vdef.get('section') or vdef.get('kind') == 'removed_section':
        return legacy()
    if (vdef.get('keep') or {}).get('_a_position'):
        return _position_projection(shapes,vdef)
    if vdef.get('kind') == 'detail':
        if parent is None:
            raise ValueError('局部放大需要父图实际投影')
        geometry = project.project_view(shapes, vdef, parent=parent)
    elif (vdef.get('keep') or {}).get('_a_local'):
        geometry = _local_projection(shapes, vdef)
    else:
        vdef['hidden'] = False
        geometry = project.project_view(shapes, vdef)
    geometry['lines'] = _necessary_axes(geometry['lines'], float(vdef.get('scale', 1)))
    geometry['witness_elements'] = _witnesses(geometry, vdef)
    if vdef.get('kind')=='basic' and not vdef.get('keep'):
        _datum_axes_on_partial_rims(geometry,vdef)
    return geometry

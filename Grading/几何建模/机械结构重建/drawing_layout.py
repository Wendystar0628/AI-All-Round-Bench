"""D：按结构分页，用完整纸面范围试排。坐标、尺寸和投影均由上游提供。

不调用 legacy 分页，不截取图形，不按尺寸条数分包，也不降低字高。
冻结样例的诊断入口见 test_drawing_layout.py --samples。
"""

import copy
import json
import math
from functools import lru_cache
from collections import Counter, OrderedDict
from itertools import product
from types import SimpleNamespace

import numpy as np

import drawing_common as dc
from drawkit import project

# GB/ISO 常用优先及补充比例；几何比例不影响纸面文字大小。
STANDARD_SCALES = tuple(sorted(set(dc.SCALES) | {50.0, 20.0, 10.0, 0.1, 0.05}, reverse=True))
BASIC_GRID = dict(front=(0, 0), top=(1, 0), left=(0, 1), bottom=(-1, 0), right=(0, -1), back=(0, 2))


class LayoutError(ValueError):
    """保持字号仍无法容纳内容；调用者必须调整表达，不能静默输出越界页。"""


def drawing_style(paper):
    if paper not in ('A3', 'A2'):
        raise LayoutError('重画只使用横向 A3/A2；禁止回退 A1 或缩小字体')
    f = 1.4 if paper == 'A2' else 1.0
    return dict(
        DIM_H=8 * f,
        LABEL_H=9 * f,
        FRAME_H=7 * f,
        LEVEL_STEP=13 * f,
        ARROW=3 * f,
        EXT_GAP=1.5,
        EXT_OVER=2.5,
        LEVEL0=12 * f,
        VIEW_GAP=10 * f,
        thin_width=0.5 * f,
        thick_width=1 * f,
        hatch_spacing=2.5 * f,
        hatch_styles=[(45, 2.5 * f), (135, 2.5 * f), (60, 3 * f), (120, 3 * f)],
        dpi=240,
        frame_builder=sheet_frame,
    )


def _scale_text(scale):
    if scale >= 1:
        return f'{scale:g}:1'
    return f'1:{1 / scale:g}'


@lru_cache(maxsize=512)
def _wrap(text, width, height):
    """按实际字体宽度换行；不压扁、截断或缩字号。"""
    result, line = [], ''
    for char in str(text):
        if char == '\n':
            result.append(line)
            line = ''
        elif dc.render.text_extent(line + char, height)[0] > width and line:
            result.append(line)
            line = char
        else:
            line += char
    return result + ([line] if line else [])


def sheet_frame(paper, info, index, count, parts_list, notes):
    """紧凑底部标题栏；技术要求和明细只在规划指定的主页出现。"""
    style = drawing_style(paper)
    f, h = style['FRAME_H'] / 7, style['FRAME_H']
    width, height, left, edge = dc.PAPERS[paper]
    right, top = width - edge, height - edge
    pad, leading = 3 * f, h + 3 * f
    m = dc.Marks()
    m.curve(dc.g2.polyline([(left, edge), (right, edge), (right, top), (left, top), (left, edge)], 'frame'))
    title = str(info.get('title', ''))
    # 两行横式标题栏：题名和材料在上，图号、张次、比例在下。
    material = str(info.get('material') or '')
    qty = str(info.get('quantity') or '')
    meta = '  '.join(x for x in ('材料 ' + material if material else '', '数量 ' + qty if qty else '') if x)
    meta_w = dc.render.text_extent(meta, h)[0] + (2 * pad if meta else 0)
    title_lines = _wrap(title, right - left - 2 * pad - meta_w, 9 * f)
    footer_top = edge + 2 * pad + leading + max(1, len(title_lines)) * 11 * f
    m.line((left, footer_top), (right, footer_top), 'frame')
    for i, line in enumerate(title_lines):
        m.text(line, (left + pad, footer_top - pad - i * 11 * f), 9 * f, 'lt', role='title')
    if meta:
        m.text(meta, (right - pad, footer_top - pad), h, 'rt', role='title')
    first = f"图号 {info.get('drawing_no', '')}    第{index}张/共{count}张"
    second = f"第一角画法   比例 {info.get('scale_text') or _scale_text(info.get('scale', 1))}   单位 mm"
    if sum(dc.render.text_extent(t, h)[0] for t in (first, second)) + 3 * pad > right - left:
        raise LayoutError('图号和比例栏过宽')
    m.text(first, (left + pad, edge + pad), h, 'lb', role='title')
    m.text(second, (right - pad, edge + pad), h, 'rb', role='title')
    reserved = [[left, edge, right, footer_top]]
    y = top - pad
    note_lines = []
    if notes:
        note_lines = _wrap('  '.join(str(n) for n in notes), right - left - 2 * pad, h)
    for line in note_lines:
        m.text(line, (left + pad, y), h, 'lt', role='technical')
        y -= leading
    if note_lines:
        y -= pad
    if parts_list:
        # 明细并排两栏；列内行序自下向上。保留原序号、名称、数量、材料、图号。
        def table(columns):
            width = (right - left) / columns
            n = math.ceil(len(parts_list) / columns)
            cols = []
            for i in range(columns):
                rows = []
                for row in parts_list[i * n : (i + 1) * n]:
                    name = row['name']
                    code = row.get('drawing_no') or row.get('standard') or row.get('note')
                    text = f"{row['no']} {name} ×{row['qty']} {row.get('material', '')}"
                    if code:
                        text += ' ' + str(code)
                    rows.append(_wrap(text, width - 2 * pad, h))
                cols.append(rows)
            heights = [
                max(len(col[r]) for col in cols if r < len(col)) * (h + 1.5 * f) + 1.5 * f for r in range(n)
            ]
            return sum(heights), width, cols, heights

        _, col_width, column_rows, row_heights = min(
            (table(n) for n in range(1, min(len(parts_list), 4) + 1)), key=lambda entry: entry[0]
        )
        header = ['序号  名称  数量  材料']
        leading = h + 1.5 * f
        table_h = leading + sum(row_heights)
        bottom = y - table_h
        for c, rows in enumerate(column_rows):
            x = left + c * col_width
            m.text(header[0], (x + pad, y), h, 'lt', role='parts-header')
            yy = bottom
            for r, lines in enumerate(rows):
                for k, line in enumerate(lines):
                    m.text(
                        line, (x + pad, yy + row_heights[r] - 0.6 * f - k * leading), h, 'lt', role='parts'
                    )
                yy += row_heights[r]
            m.line((x, bottom), (x, y + pad), 'thin')
        m.line((left, bottom), (right, bottom), 'thin')
        y = bottom - pad
    if notes or parts_list:
        reserved.append([left, y, right, top])
    frame_box = (left + pad, footer_top + pad, right - pad, y - pad)
    # 可用区为空时保留真实范围，交给试排失败诊断，不省略说明或明细。
    return m, frame_box, reserved


def _extent(view):
    box = dc.view_extent(view)
    box = dc.box_union(box, getattr(view, 'dimension_bbox', None))
    # Marks.box 的旧算法没计箭头翼/圆点，必须补全。
    if getattr(view, 'marks', None) is not None:
        box = dc.box_union(box, dc.marks_bounds(view.marks.items, 1.0))
    for dim in getattr(view, 'dims', []):
        marks = dim.get('marks')
        if marks is not None:
            box = dc.box_union(box, dc.marks_bounds(marks.items, 1.0))
    if box is None or not all(math.isfinite(float(x)) for x in box):
        raise LayoutError(f"视图 {getattr(view, 'name', '?')} 缺少有效实际包围框")
    return list(box)


def _shift(box, x, y):
    return [box[0] + x, box[1] + y, box[2] + x, box[3] + y]


def _contains(outer, inner):
    return (
        inner[0] >= outer[0] - 1e-7
        and inner[1] >= outer[1] - 1e-7
        and inner[2] <= outer[2] + 1e-7
        and inner[3] <= outer[3] + 1e-7
    )


def _readable_subjects(views, paper, complex_subject):
    if not complex_subject:
        return True
    main = [
        v
        for v in views
        if getattr(v, 'candidate', None)
        and v.candidate.get('role') != 'locator'
        and v.candidate.get('kind') == 'basic'
        and v.spec.get('type', 'front') == 'front'
        and not v.candidate.get('section')
        and not v.candidate.get('keep')
    ]
    return (
        not main or max((v.box_geom[2] - v.box_geom[0]) * 1300 / dc.PAPERS[paper][0] for v in main) >= 500
    )


def _grid_objects(views, ext, gap):
    """同一零件共享投影原点。多件合画时每件保留自己的第一角坐标网格。"""
    objects, grids = [], OrderedDict()
    for view in views:
        if view.grid is not None:
            part = (getattr(view, 'candidate', None) or {}).get('part')
            grids.setdefault(part, []).append(view)
    for basics in grids.values():
        cells = [tuple(v.grid) for v in basics]
        if len(cells) != len(set(cells)):
            raise LayoutError('同一零件的基本投影位置重复')
        rows, cols = sorted({r for r, c in cells}), sorted({c for r, c in cells})
        xs, ys = {cols[0]: 0.0}, {rows[0]: 0.0}
        for prev, cur in zip(cols, cols[1:]):
            xs[cur] = (
                xs[prev]
                + max(ext[id(v)][2] for v in basics if v.grid[1] == prev)
                + gap
                - min(ext[id(v)][0] for v in basics if v.grid[1] == cur)
            )
        for prev, cur in zip(rows, rows[1:]):
            ys[cur] = (
                ys[prev]
                + min(ext[id(v)][1] for v in basics if v.grid[0] == prev)
                - gap
                - max(ext[id(v)][3] for v in basics if v.grid[0] == cur)
            )
        objects.append([(v, xs[v.grid[1]], ys[v.grid[0]]) for v in basics])
    independent = sorted(
        (v for v in views if v.grid is None),
        key=lambda v: (
            not bool(v.spec.get('at')),
            -(ext[id(v)][2] - ext[id(v)][0]) * (ext[id(v)][3] - ext[id(v)][1]),
        ),
    )
    return objects + [[(v, 0.0, 0.0)] for v in independent]


def arrange_views(views, frame_box, reserved, *, style, legacy=None):
    """同时试排第一角视图簇和自由视图；失败时不留下部分 paper_origin。"""
    if not views or frame_box[2] <= frame_box[0] or frame_box[3] <= frame_box[1]:
        return False
    ext = {id(v): _extent(v) for v in views}
    gap = style['VIEW_GAP']
    objects = _grid_objects(views, ext, gap)
    object_boxes = []
    for obj in objects:
        box = None
        for v, x, y in obj:
            box = dc.box_union(box, _shift(ext[id(v)], x, y))
        object_boxes.append(box)
    # 正常目标为 90% 的可用宽高；只有目标框排不下才试整个可用区。
    fx0, fy0, fx1, fy1 = frame_box
    attempts = [(0.05 * (fx1 - fx0), 0.05 * (fy1 - fy0)), (1.5, 1.5)]
    for inset_x, inset_y in attempts:
        frame = (fx0 + inset_x, fy0 + inset_y, fx1 - inset_x, fy1 - inset_y)
        # beam state: 放置映射、实际占用矩形、总范围。保留多个布局避免贪心死角。
        states = [({}, list(reserved), None)]
        for obj, ob in zip(objects, object_boxes):
            next_states = []
            w, h = ob[2] - ob[0], ob[3] - ob[1]
            for positions, occupied, union in states:
                fixed = obj[0][0].spec.get('at') if len(obj) == 1 else None
                if fixed is not None:
                    locations = [(fixed[0] - w / 2, fixed[1] - h / 2)]
                else:
                    xset = {frame[0], frame[2] - w, (frame[0] + frame[2] - w) / 2}
                    yset = {frame[1], frame[3] - h, (frame[1] + frame[3] - h) / 2}
                    for b in occupied:
                        xset.update((b[2] + gap, b[0] - gap - w))
                        yset.update((b[3] + gap, b[1] - gap - h))
                    locations = [
                        (x, y)
                        for x in xset
                        for y in yset
                        if x >= frame[0] - 1e-7
                        and x + w <= frame[2] + 1e-7
                        and y >= frame[1] - 1e-7
                        and y + h <= frame[3] + 1e-7
                    ]
                    locations.sort(
                        key=lambda xy: (
                            (xy[0] + w / 2 - (fx0 + fx1) / 2) ** 2 + (xy[1] + h / 2 - (fy0 + fy1) / 2) ** 2,
                            xy,
                        )
                    )
                for x, y in locations:
                    dx, dy = x - ob[0], y - ob[1]
                    boxes = [_shift(ext[id(v)], ox + dx, oy + dy) for v, ox, oy in obj]
                    if any(
                        not _contains(frame, b) or any(dc.box_overlap(b, old, 2.0) for old in occupied)
                        for b in boxes
                    ):
                        continue
                    new = dict(positions)
                    ub = union
                    for (v, ox, oy), b in zip(obj, boxes):
                        new[id(v)] = [ox + dx, oy + dy]
                        ub = dc.box_union(ub, b)
                    next_states.append((new, occupied + boxes, ub))
            if not next_states:
                states = []
                break

            def score(state):
                b = state[2]
                # 紧凑、居中；不靠故意拉大视图间距伪造占图幅。
                return (b[2] - b[0]) * (b[3] - b[1]) + 0.1 * (
                    (b[0] + b[2] - fx0 - fx1) ** 2 + (b[1] + b[3] - fy0 - fy1) ** 2
                )

            next_states.sort(key=score)
            states = next_states[:24]
        if states:
            for v in views:
                v.paper_origin = states[0][0][id(v)]
            return True
    return False


def arrange_finalized_page(doc):
    """按最终 JSON 中实际移动过的文字、引线重验纸面，必要时仅平移整图。"""
    paper = doc['paper']['size']
    _, frame, reserved = sheet_frame(
        paper,
        dict(doc['title_block'], scale_text=doc['scale']),
        doc['sheet_index'],
        doc['sheet_count'],
        doc['parts_list'],
        doc['notes'],
    )
    views, occupied = [], []
    fits = True
    for spec in doc['views']:
        scale = spec['placement']['scale']
        b = project.geometry_bounds(spec)
        b = dc.box_union(b, dc.g2.bounds(spec['lines']))
        box = [x * scale for x in b]
        box = dc.box_union(box, dc.marks_bounds(spec['annotations'], scale))
        for dimension in spec['dimensions']:
            box = dc.box_union(box, dc.marks_bounds(dimension['draw'], scale))
        placed = _shift(box, *spec['placement']['paper_origin'])
        tolerance = [0.01, 0.01, -0.01, -0.01]
        outer = [limit - delta for limit, delta in zip(frame, tolerance)]
        fits = (
            fits
            and _contains(outer, placed)
            and not any(dc.box_overlap(placed, other) for other in occupied)
        )
        occupied.append(placed)
        definition = spec['definition']
        grid = None
        if spec.get('role') != 'locator' and not definition.get('section') and not definition.get('keep'):
            grid = BASIC_GRID.get(spec.get('position'))
        part = tuple(definition.get('parts') or doc.get('parts', ()))
        views.append(
            SimpleNamespace(
                name=spec['name'],
                box_geom=box,
                box_full=box,
                grid=grid,
                marks=dc.Marks(),
                dims=[],
                scale=scale,
                spec={},
                candidate=dict(part=part),
            )
        )
    if fits:
        return True
    if not arrange_views(views, frame, reserved, style=drawing_style(paper)):
        return False
    for spec, view in zip(doc['views'], views):
        spec['placement']['paper_origin'] = [round(x, 4) for x in view.paper_origin]
    return True


def delivery_targets(d):
    """给定见证，返回当前视图的有限测点。双端尺寸保留两条界线的起点。"""
    proof=d['_dimension_witness']
    if proof['mode']=='linear':return np.array(proof['points'],float)
    if 'anchor_point' in proof:return np.array([proof['anchor_point']],float)
    for el in proof['elements']:
        curve=el['curve']
        if curve['geom'] in ('arc','circle'):
            points=dc.g2.sample(curve,max(.1,dc.g2.length(curve)/12))
            return points[[len(points)//8]]
        if el['kind']!='axis':
            points=dc.g2.sample(curve,max(.1,dc.g2.length(curve)/8))
            return points[[len(points)//2]]
    line=proof['elements'][0]['curve']
    return dc.g2.sample(line,max(.1,dc.g2.length(line)/4))[[1]]


def field_text(d):
    p=d['_dimension_witness']; value=d['display_text']
    import re
    numeric=re.findall(r'(?<![\d.])-?\d+(?:\.\d+)?',re.sub(r'D\d+','',value))
    if not any(abs(float(x)-d['value'])<5e-6 for x in numeric):
        value+='  '+format(d['value'],'.8g')
    if p.get('mode')=='linear':
        axis=d['_witness_3d'].get('axis') if d['category']=='链式或相对定位尺寸' else None
        return (axis+'向 ' if axis else '')+value
    return value


def panel_groups(views,dimensions):
    """每组固定图位，按测点邻近和实际文字宽度拆分。"""
    from collections import defaultdict
    by_key=defaultdict(list)
    for d in dimensions:by_key[d['view_key']].append(d)
    panels=[]
    for key,group in by_key.items():
        c=views[key]['c']
        points={d['_id']:delivery_targets(d).mean(axis=0) for d in group}
        group=sorted(group,key=lambda d:tuple(points[d['_id']]))
        while group:
            batch=[]; lines=0
            while group and len(batch)<12:
                j=min(range(len(group)),key=lambda i:np.linalg.norm(points[group[i]['_id']]-points[batch[-1]['_id']])) if batch else 0
                d=group[j]
                count=len(_wrap('D000  AB  '+field_text(d),177,7.3))
                if batch and lines+count>11:break
                batch.append(group.pop(j));lines+=count
            panels.append(dict(key=key,dims=batch,rows=lines,frame=c['frame']))
    return panels


def delivery_pages(views,dimensions):
    """把相同坐标系的图组装成每张 2–4 图。复杂件每页最多 25 个 D。"""
    panels=panel_groups(views,dimensions)
    pages=[]
    def index(p):
        c=views[p['key']]['c']
        return (c['frame']!='assembly',int(c.get('part') or 0),not(c.get('role')=='overview'),min(int(d['_id'][1:]) for d in p['dims']))
    panels.sort(key=index)
    for frame in ('assembly','part'):
        pending=[p for p in panels if p['frame']==frame]
        rows=[]
        while pending:
            p=pending.pop(0);row=[p]
            if p['rows']<=9:
                fits=[(i,q['rows']) for i,q in enumerate(pending) if q['rows']<=9 and
                      len(p['dims'])+len(q['dims'])<=13 and q['key']!=p['key']]
                j=max(fits,key=lambda pair:pair[1])[0] if fits else None
                if j is not None:row.append(pending.pop(j))
            rows.append(row)
        while rows:
            page=[rows.pop(0)]
            if rows:
                seen={p['key'] for p in page[0]}
                room=25-sum(len(p['dims']) for p in page[0])
                fits=[i for i,r in enumerate(rows) if sum(len(p['dims']) for p in r)<=room]
                if fits:
                    i=next((i for i in fits if not any(p['key'] in seen for p in rows[i])),fits[0])
                    page.append(rows.pop(i))
            if sum(map(len,page))==1:
                p=page[0][0];c=views[p['key']]['c']
                option=next((k for k,v in views.items() if v['c']['frame']==frame and
                         v['c'].get('part')==c.get('part') and k!=p['key'] and v['c'].get('role')=='overview'
                         and v['c'].get('direction')!=c.get('direction')),None)
                if option:page.append([dict(key=option,dims=[],rows=0,frame=frame)])
            pages.append(page)
    return pages


class PaperSpace:
    """纸面线迹占用。计算字框内的墨迹和已放标注，保留字高。"""
    def __init__(self, curves, scale, offset, bounds):
        from PIL import Image,ImageDraw
        self.bounds=bounds;self.text=[];self.leaders=[]
        self.grid=2
        raster=Image.new('L',(851,601),0); pen=ImageDraw.Draw(raster)
        for c in curves:
            pts=dc.g2.sample(c,max(.45/scale,dc.g2.length(c)/180))*scale+offset
            if len(pts)>1:pen.line([tuple(q) for q in (pts*self.grid).round().astype(int)],fill=1,width=2)
        self.integral=np.pad(np.asarray(raster).cumsum(axis=0,dtype=np.int32).cumsum(axis=1,dtype=np.int32),((1,0),(1,0)))
    def ink(self,b):
        lo=np.maximum(0,np.floor(np.asarray(b[:2])*2).astype(int));hi=np.minimum([850,600],np.ceil(np.asarray(b[2:])*2).astype(int))
        x,y=lo;X,Y=hi
        t=self.integral
        return int(t[Y,X]-t[y,X]-t[Y,x]+t[y,x])
    def allowed(self,b):
        from drawing_dimensions import _curve_hits_box
        return (_contains(self.bounds,b) and not any(dc.box_overlap(b,old,1.15) for old in self.text)
                and not any(_curve_hits_box(line,b) for line in self.leaders))
    def clear_segment(self,a,b):
        from drawing_dimensions import _curve_hits_box
        line=dc.g2.line(a,b,'thin')
        return not any(_curve_hits_box(line,old) for old in self.text)
    def choose_tag(self,point,label,h):
        w=dc.render.text_extent(label,h)[0]
        choices=[]
        for dist in (5,8,12,16,21,27,32):
            for angle in range(0,360,20):
                t=math.radians(angle); e=np.array([math.cos(t),math.sin(t)])
                center=point+e*(dist+.5*(abs(e[0])*w+abs(e[1])*h))
                b=[center[0]-w/2-.35,center[1]-h/2-.35,center[0]+w/2+.35,center[1]+h/2+.35]
                if not self.allowed(b) or self.ink(b):continue
                end=center-e*min((w/2+.7)/max(1e-7,abs(e[0])),(h/2+.7)/max(1e-7,abs(e[1])))
                samples=point+(end-point)*np.linspace(.12,.95,6)[:,None]
                if any(any(x0-.3<x<x1+.3 and y0-.3<y<y1+.3 for x0,y0,x1,y1 in self.text) for x,y in samples):continue
                cost=self.ink(b)*9+dist+sum(self.ink([x-.4,y-.4,x+.4,y+.4]) for x,y in samples)*.7
                choices.append((cost,center,end,b))
            if choices and min(q[0] for q in choices)<dist+3:break
        if not choices:raise LayoutError('该局部的短引线密度过高，需拆分图组')
        _,center,end,b=min(choices,key=lambda q:q[0])
        self.text.append(b)
        self.leaders.append(dc.g2.line(point,end,'thin'))
        return center,end


def paper_marks(marks,scale,offset):
    """纸面标注转回私有 JSON 的视图坐标。"""
    result=marks.to_view(scale)
    for mark in result:
        if mark['kind']=='curve':
            mark['curve']=dc.g2.xform(mark['curve'],1,-offset/scale)
        for k in ('at','tip'):
            if k in mark:mark[k]=(np.asarray(mark[k])-offset/scale).tolist()
    return result


def direct_chain(d,targets,scale,offset,space,marks):
    """短界线可以同时够到两端时，直接画双箭头尺寸。"""
    p=d['_dimension_witness']
    if p['mode']!='linear':return False
    a,b=targets*scale+offset
    e=np.array(p['direction'],float)
    if (b-a)@e<0:e=-e
    n=np.array([-e[1],e[0]])
    span=(b-a)@e
    if span<.7 or abs((a-b)@n)>17:return False
    text=f"{d['_id']} {d['display_text']}"
    h=7.5;w=dc.render.text_extent(text,h)[0]
    for sign,gap in ((1,3),(-1,3),(1,7),(-1,7),(1,12),(-1,12),(1,17),(-1,17)):
        v=n*sign;level=max(a@v,b@v)+gap
        pa=a+(level-a@v)*v;pb=b+(level-b@v)*v
        if max(np.linalg.norm(pa-a),np.linalg.norm(pb-b))>20:continue
        if not all(_contains(space.bounds,[*q,*q]) for q in (pa,pb)):continue
        samples=pa+(pb-pa)*np.linspace(.05,.95,12)[:,None]
        if any(space.ink([x-.5,y-.5,x+.5,y+.5]) or
               any(l<x<r and low<y<hi for l,low,r,hi in space.text) for x,y in samples):continue
        for loc in [(pa+pb)/2+v*side*((abs(v[0])*w+abs(v[1])*h)/2+1.4) for side in (1,-1)]+[
                pb+e*((abs(e[0])*w+abs(e[1])*h)/2+2),pa-e*((abs(e[0])*w+abs(e[1])*h)/2+2)]:
            box=dc.text_box(text,loc,h)
            if not space.allowed(box) or space.ink(box):continue
            if not all(space.clear_segment(q,end) for q,end in ((a,pa),(b,pb),(pa,pb))):continue
            for q,end in ((a,pa),(b,pb)):
                marks.line(q+v*.8,end+v*1.8,role='dimension-extension')
            marks.line(pa,pb,role='dimension-line')
            if span<6:
                marks.line(pa-e*3,pa,role='dimension-line');marks.line(pb,pb+e*3,role='dimension-line')
            marks.arrow(pa,e if span<6 else -e,size=2.1,role='dimension-tip')
            marks.arrow(pb,-e if span<6 else e,size=2.1,role='dimension-tip')
            marks.text(text,loc,h,'mm',role='dimension-text')
            space.text.append(box)
            space.leaders.extend(m['curve'] for m in marks.items if m['kind']=='curve')
            return True
    return False


def delivery_panel(views,panel,box,side_by_side,part_names):
    """先给图形留足空间；半栏下方文字不够时，试右侧文字或增加说明区高度。"""
    if not side_by_side or not panel['dims']:
        return _delivery_panel(views,panel,box,side_by_side,part_names,.58)
    best=None;last=None
    for stacked,fraction in ((True,.32),(False,.58),(True,.45),(True,.58)):
        try:
            view=_delivery_panel(views,panel,box,stacked,part_names,fraction)
        except LayoutError as exc:
            last=exc
            continue
        bb=dc.g2.bounds(view['lines'])
        size=max(bb[2]-bb[0],bb[3]-bb[1])*view['placement']['scale']
        if size>=79:return view
        if best is None or size>best[0]:best=(size,view)
    if best:return best[1]
    raise last


def _delivery_panel(views,panel,box,side_by_side,part_names,note_fraction):
    c,geom=(views[panel['key']][k] for k in ('c','g'))
    ds=panel['dims']
    x0,y0,x1,y1=box;w=x1-x0
    title_h=9.; note_h=7.3
    name=c.get('spec',{}).get('name') or c.get('name','视图')
    if c.get('section') and name==str(c.get('spec',{}).get('label'))+'-'+str(c.get('spec',{}).get('label')):
        description=c.get('name','')
        if description!=name and '剖' in description and '-' not in description:
            name+=' '+description
    if c.get('section') and '断面' not in name and '剖' not in name:
        name+= ' 剖视'
    part=c.get('part')
    short=part_names.get(str(part),'')
    caption=(f'件{part} {short} · ' if part and len(part_names)>1 else '')+name
    if c['kind']=='basic' and not c.get('section') and not c.get('keep'):
        dirs=[]
        for vec,arrow in ((c['u'],'→'),(c['v'],'↑')):
            axis=int(np.argmax(np.abs(vec)))
            dirs.append(('−' if vec[axis]<0 else '')+'XYZ'[axis]+arrow)
        caption+='  '+''.join(dirs)
    available=w-43
    if dc.render.text_extent(caption,title_h)[0]>available and part and len(part_names)>1:
        caption=f'件{part} · '+name
    original=caption
    sequence=1
    while caption in panel.get('occupied_names',()):
        sequence+=1
        caption=original+('（续）' if sequence==2 else f'（续{sequence-1}）')
    title_lines=_wrap(caption,available,title_h)
    header=title_h+(len(title_lines)-1)*(title_h+1.5)
    columns=1
    if side_by_side:
        columns=2 if len(ds)>3 else 1
        col_width=(w-8)/columns
        estimate=sum(len(_wrap('D000 AB '+field_text(d),col_width-1,note_h)) for d in ds)
        height=min((y1-y0)*note_fraction,(math.ceil(estimate/columns)+.4)*9.1)
        note=[x0+3,y0+2,x1-3,y0+max(4,height)+3]
        gb=[x0+3,note[3]+1,x1-3,y1-header-4]
    else:
        cut=x0+w*((.53 if w<220 else .49) if ds else .94)
        note=[cut+4,y0+3,x1-3,y1-header-4]
        gb=[x0+3,y0+3,cut-3,y1-header-4]
    locator=None
    if c.get('section'):
        if not side_by_side and panel['rows']*9.1 < note[3]-note[1]-40:
            locator=[note[0],note[1],note[0]+52,note[1]+37]
            note[1]+=39
        else:
            locator=[gb[2]-51,gb[1],gb[2],min(gb[3],gb[1]+38)]
            gb[2]-=53
    lines=[l for l in geom['lines'] if l['type']!='hidden']
    bb=dc.g2.bounds(lines) or [0,0,1,1]
    # 视图比例按实际可用图位确定；四周留出短界线和端点字母的空间。
    bw,bh=max(1,bb[2]-bb[0]),max(1,bb[3]-bb[1])
    sc=min((gb[2]-gb[0]-(10 if w<220 else 20))/bw,(gb[3]-gb[1]-12)/bh,8.)
    if sc<=0:raise LayoutError('图位高度不足')
    offset=(np.array(gb[:2])+gb[2:])/2-(np.array(bb[:2])+bb[2:])*sc/2
    field=PaperSpace(lines,sc,offset,gb)
    annotations=dc.Marks()
    if locator:delivery_cut_locator(views,c,locator,annotations)
    delivery_origin(c,sc,offset,field,annotations)
    for balloon in panel.get('balloons',[]):
        at=np.asarray(balloon['at'])*sc+offset
        label=str(balloon['text'])
        center,end=field.choose_tag(at,label,9.)
        annotations.line(end,at,role='balloon')
        annotations.dot(at,role='balloon',r=.65)
        annotations.text(label,center,9.,role='balloon')
    ratio=f'{sc:.2f}:1' if sc>=1 else f'1:{1/sc:.2f}'
    for i,line in enumerate(title_lines):
        annotations.text(line,(x0+3,y1-1-i*(title_h+1.5)),title_h,'lt',role='label')
    annotations.text(ratio,(x1-3,y1-1),7,'rt',role='scale')
    tags={}; note_y=note[3];col=0;records=[]
    for d in ds:
        p=d['_dimension_witness']; coordinates=delivery_targets(d)
        marks=dc.Marks(); labels=[]
        for el in p['elements']:
            if el.get('kind')=='axis' and el.get('support') and el['curve'] not in lines:
                lines.append(el['curve'])
        direct=False
        if p['mode']=='linear':
            direct=any(direct_chain(d,pair,sc,offset,field,marks) for pair in paper_linear_pairs(p,coordinates))
        else:
            direct=feature_label(d,coordinates[0],sc,offset,field,marks)
        for q in (() if direct else coordinates):
            signature=tuple(np.round(q,3))
            if signature not in tags:
                label=chr(65+len(tags)) if len(tags)<26 else 'A'+chr(65+len(tags)-26)
                point=q*sc+offset
                center,end=field.choose_tag(point,label,6.7)
                marks.line(end,point,role='dimension-extension' if p['mode']=='linear' else 'dimension-leader')
                direction=point-end
                if np.linalg.norm(direction)>.001:
                    marks.arrow(point,direction,role='dimension-tip',size=2.1)
                marks.text(label,center,6.7,'mm',role='dimension-datum')
                tags[signature]=label
            labels.append(tags[signature])
        label='–'.join(labels)
        text=field_text(d)
        first=f"{d['_id']}  {label}  {text}"
        col_width=(note[2]-note[0])/columns
        rows=[] if direct else _wrap(first,col_width-1,note_h)
        if note_y-len(rows)*9.1<note[1]-1 and col+1<columns:
            col+=1;note_y=note[3]
        if note_y-len(rows)*9.1 < note[1]-1:raise LayoutError('尺寸文字列超出分配图位')
        for row in rows:
            marks.text(row,(note[0]+col*col_width,note_y),note_h,'lt',role='dimension-text')
            note_y-=9.1
        records.append(dict(id=d['_id'],type=d['type'],category=d['category'],value=d['value'],text=d['display_text'],
                            draw=paper_marks(marks,sc,offset),source_feature=d['source_feature'],_dimension_witness=p,
                            _datum_labels=labels))
    definition={k:c[k] for k in ('kind','direction','u','v','origin','parts','section','keep','detail') if k in c}
    hatches=[dict(h,angle=h.get('angle',45 if int(h.get('part','1'))%2 else 135),spacing=max(3,h.get('spacing',3))) for h in geom.get('hatches',[])]
    return dict(name=caption,kind=c['kind'],position=c.get('spec',{}).get('type') if c['kind']=='basic' else None,
                frame=c['frame'],role=c.get('role'),view_key=panel['key'],definition=definition,_panel_bounds=box,
                placement=dict(scale=sc,paper_origin=offset.tolist(),scale_text=f'{sc:.3g}:1'),
                lines=lines,hatches=hatches,dimensions=records,annotations=paper_marks(annotations,sc,offset),
                section_label=(c.get('spec',{}).get('label') or name) if c.get('section') else None)


def paper_linear_pairs(proof,targets):
    e=np.array(proof['direction']);normal=np.array([-e[1],e[0]])
    bnds=[]
    for el,pt in zip(proof['elements'],targets):
        curve=el['curve']
        if curve['geom']=='line':
            coords=np.array([curve['from'],curve['to']])
            if max(abs((coords-pt)@e))<.03:
                bnds.append(sorted(coords@normal));continue
        bnds.append([pt@normal,pt@normal])
    if len(bnds)!=2:return [targets]
    levels=[targets[0]@normal,targets[1]@normal,*bnds[0],*bnds[1],np.mean(bnds)]
    pairs=[np.array([p+(np.clip(t,lo,hi)-p@normal)*normal for p,(lo,hi) in zip(targets,bnds)]) for t in levels]
    return [targets]+sorted(pairs,key=lambda pair:abs((pair[0]-pair[1])@normal))


def feature_label(d,point,scale,offset,space,marks):
    proof=d['_dimension_witness']
    if proof['mode']=='linear':return False
    text=d['_id']+' '+field_text(d)
    # 说明能就近写全时直接引出；放不下时交回同图的测点字母和完整说明。
    if dc.render.text_extent(text,7.5)[0]>(space.bounds[2]-space.bounds[0])*.65:
        return False
    try:
        center,end,b=choose_short_value(space,point*scale+offset,text,7.5)
    except LayoutError:
        return False
    space.text.append(b)
    tip=point*scale+offset
    space.leaders.append(dc.g2.line(tip,end,'thin'))
    marks.line(tip,end,role='dimension-leader');marks.arrow(tip,tip-end,size=2.15,role='dimension-tip')
    marks.text(text,center,7.5,'mm',role='dimension-text')
    return True


def choose_short_value(space,pt,text,h):
    w=dc.render.text_extent(text,h)[0]
    for length in (4,8,13,19):
        possible=[]
        for x in (-1,1):
            for y in (.65,-.65,0,1.25,-1.25):
                end=pt+np.array([x,y])*length
                center=end+np.array([x*(w/2+1),0])
                b=dc.text_box(text,center,h)
                if space.allowed(b) and space.ink(b)==0 and space.clear_segment(pt,end):
                    cost=abs(y)*.01+space.ink(dc.box_pts([pt+(end-pt)*.3,end]))*.12
                    possible.append((cost,center,end,b))
        if possible:return min(possible,key=lambda q:q[0])[1:]
    raise LayoutError('固定字高数值无邻近空白')


def delivery_cut_locator(views, candidate, bounds, marks):
    """剖面在本图的定位小图。边视画切线两端；正斜投影画平面上一点和观察箭头。"""
    section = candidate['section']
    normal = np.asarray(candidate['direction'], float)
    point = np.asarray(section['point'], float)
    sources = [v for v in views.values() if v['c']['kind'] == 'basic'
               and not v['c'].get('section') and not v['c'].get('keep')
               and v['c']['frame'] == candidate['frame'] and v['c'].get('part') == candidate.get('part')]
    if not sources:
        raise LayoutError(f"{candidate['name']} 缺少定位图")
    sources.sort(key=lambda v: (round(abs(normal @ v['c']['direction']), 5),
                                v['c'].get('view_key') != candidate.get('source_key')))
    parent = sources[0]
    source = parent['c']
    curves = [l for l in parent['g']['lines'] if l['type'] == 'visible']
    bb = dc.g2.bounds(curves)
    if not bb:
        raise LayoutError(f"{candidate['name']} 缺少定位轮廓")
    axes = np.asarray([source['u'],source['v']])
    base = axes @ (point - source['origin'])
    n = axes @ normal
    edge_on = abs(normal @ source['direction']) < 1e-5
    if edge_on:
        tangent = np.array([-n[1], n[0]])
        limits = []
        for axis in (0,1):
            if abs(tangent[axis]) < 1e-8:
                continue
            for value in (bb[axis], bb[axis+2]):
                at = base + tangent * (value-base[axis]) / tangent[axis]
                if bb[1-axis]-.05 <= at[1-axis] <= bb[3-axis]+.05:
                    limits.append(at)
        if len(limits) >= 2:
            limits.sort(key=lambda at: at @ tangent)
            ends = [limits[0],limits[-1]]
        else:
            edge_on = False
    if not edge_on:
        bb = dc.box_union(bb,[*base,*base])
    x,y,X,Y = bounds
    scale = min((X-x-9)/max(bb[2]-bb[0],1),(Y-y-12)/max(bb[3]-bb[1],1))
    offset = np.array([(x+X)/2,(y+Y-6)/2]) - scale*(np.array(bb[:2])+bb[2:])/2
    for curve in curves:
        marks.curve(dc.g2.xform(dict(curve,type='thin'),scale,offset),role='locator-outline')
    suffix = {'front':'主','top':'俯','left':'左','right':'右','bottom':'仰','back':'后'}.get(source['spec']['type'],'原')
    marks.text('剖位·'+suffix,(x+.5,Y),6.7,'lt',role='locator-label')
    if edge_on:
        a,b = [at*scale+offset for at in ends]
        marks.line(a,b,'center',role='cut-trace')
        for tip,sign in ((a,-1),(b,1)):
            tip = tip + sign*tangent*1.2
            marks.line(tip,tip-sign*tangent*min(3,np.linalg.norm(b-a)/2),'visible',role='cut-trace')
            marks.line(tip-n*3.8,tip,'thin',role='cut-trace')
            marks.arrow(tip,n,size=1.7,role='cut-trace')
    else:
        tip = base*scale+offset
        marks.dot(tip,'cut-trace',.8)
        if np.linalg.norm(n)>.01:
            n = n/np.linalg.norm(n)
            marks.line(tip-5*n,tip,role='cut-trace')
            marks.arrow(tip,n,size=1.9,role='cut-trace')
    return source['view_key']


def delivery_origin(c, scale, offset, space, marks):
    """标准正投影的真实原点及图面正向，标注避开尺寸文字。"""
    if c.get('section') or c.get('kind')!='basic' or c.get('keep'):
        return
    at = offset-np.asarray([c['u'],c['v']]) @ np.asarray(c['origin'])*scale
    if not _contains(space.bounds,[*at,*at]):
        return
    center,end = space.choose_tag(at,'O',7)
    marks.line(end,at,role='origin')
    marks.dot(at,'origin',.8)
    marks.text('O',center,7,'mm',role='origin')


def _signature(candidate):
    fields = (
        'frame',
        'part',
        'parts',
        'kind',
        'direction',
        'u',
        'v',
        'origin',
        'section',
        'keep',
        'hidden',
        'detail',
    )
    values = {key: candidate.get(key) for key in fields}
    if values.get('detail'):
        values['detail'] = dict(values['detail'])
        values['detail'].pop('parent', None)
        values['parent_key'] = candidate.get('parent_key')
    return json.dumps(values, ensure_ascii=False, sort_keys=True)


def _deduplicate(candidates, dimensions):
    by_signature, remap, kept = {}, {}, []
    for original in candidates:
        c = copy.deepcopy(original)
        signature = _signature(c)
        # canonical_key 是 A 的等价投影声明；仍以几何签名复核，不能误合并不同剖面。
        if c.get('canonical_key'):
            signature = (c['canonical_key'], signature)
        if signature not in by_signature:
            by_signature[signature] = c['view_key']
            kept.append(c)
        else:
            first = next(v for v in kept if v['view_key'] == by_signature[signature])
            first['layout_optional'] = bool(first.get('layout_optional')) and bool(c.get('layout_optional'))
        remap[c['view_key']] = by_signature[signature]
    for c in kept:
        c['parent_key'] = remap.get(c.get('parent_key'))
        c['source_key'] = remap.get(c.get('source_key'), c.get('source_key'))
        c.setdefault('role', c.get('view_role'))
        # 清除 HEAD 页面上的位置/绝对比例。选定比例后每个图都在纸面重新测量。
        for key in ('at', 'scale'):
            c['spec'].pop(key, None)
    dims = copy.deepcopy(dimensions)
    for d in dims:
        if d.get('view_key') not in remap:
            raise LayoutError(f"{d.get('_id')} 指向不存在的候选视图")
        old = d['view_key']
        d['view_key'] = remap[old]
        # C 会在运行期核查见证所属视图。仅在已验证等价的别名合并时迁移私有键，
        # 不碰见证点、曲线、原三维见证和尺寸值。
        proof = d.get('_dimension_witness')
        if proof and proof.get('view_key') == old:
            proof['view_key'] = remap[old]
        audit = d.get('_dimension_audit', {})
        for record in [audit] + audit.get('feature_relations', []):
            if record.get('view_key') == old:
                record['view_key'] = remap[old]
    return kept, dims, remap


def _sheet_template(context, group, members, remap):
    """把原标记按原页 + 原视图身份迁移，避免同名主视错接到别的零件。"""
    template = dict(
        frame=group[0], part=group[1], title=context.get('title', ''), paper='A3', notes=[], parts_list=[]
    )
    keys = {v['view_key'] for v in members}
    by_key = {v['view_key']: v for v in members}
    selected_labels = {v.get('spec', {}).get('section', {}).get('label') for v in members}
    title_set = False
    for head in context.get('head_sheets', []):
        if (head.get('frame', 'part'), head.get('part')) != group:
            continue
        if not title_set:
            template['title'] = head.get('title', template['title'])
            title_set = True
        for field in ('material', 'quantity'):
            if field in head:
                template.setdefault(field, head[field])
        names = {
            v.get('name', {'front': '主视图', 'top': '俯视图', 'left': '左视图'}.get(v['type'])): remap.get(
                v.get('view_key', f"{head['id']}:v{i + 1}")
            )
            for i, v in enumerate(head['views'])
        }
        for field, ref in (
            ('balloons', 'view'),
            ('section_traces', 'parent'),
            ('centerlines', 'view'),
            ('phantom', 'view'),
        ):
            for mark in head.get(field, []):
                key = names.get(mark.get(ref))
                if key not in keys:
                    continue
                if by_key[key].get('role') == 'locator':
                    # 定位图只保留自身轮廓/轴线和当前子图所需的投射/剖切标记。
                    # compose 会由当前子图画这些标记，不能把原页整套序号也搬过来。
                    continue
                if field == 'section_traces' and mark.get('label') not in selected_labels:
                    continue
                item = copy.deepcopy(mark)
                item[ref] = by_key[key]['spec'].get('name', by_key[key]['name'])
                target = template.setdefault(field, [])
                if item not in target:
                    target.append(item)
    return template


def _rename_view(sheet, spec, name):
    old = spec['name']
    spec['name'] = name
    for v in sheet['views']:
        if v.get('parent') == old:
            v['parent'] = name
        if v.get('section', {}).get('parent') == old:
            v['section']['parent'] = name
        detail = v.get('_definition', {}).get('detail')
        if detail and detail.get('parent') == old:
            detail['parent'] = name
    for key, ref in (
        ('dimensions', 'view'),
        ('balloons', 'view'),
        ('centerlines', 'view'),
        ('phantom', 'view'),
        ('section_traces', 'parent'),
    ):
        for item in sheet.get(key, []):
            if item.get(ref) == old:
                item[ref] = name


def _fit_sheet(sheet, context, complex_subject, index=1, count=1):
    """实际投影和 C 标注都能放下才返回。局部使用独立的标准比例。"""
    reason = '尺寸和图名的完整纸面范围放不下'
    fallback = None
    counts = Counter(d['view_key'] for d in sheet.get('dimensions', ()))
    main = max(sheet['views'], key=lambda v: counts[v['view_key']])['view_key']
    for paper in ('A3', 'A2'):
        seen = set()
        style = drawing_style(paper)
        for compact, scale in product((False, True), STANDARD_SCALES):
            # 先测不可再缩的几何范围，避免为明显越界的比例反复生成标注。
            trial = dict(sheet, paper=paper, scale=scale)
            specs = [dict(v) for v in sheet['views']]
            trial['views'] = specs
            skeleton = []
            for spec in specs:
                c = spec['_candidate']
                gb = c.get('geometry_bbox')
                vs = scale
                if gb and gb[2] > gb[0]:
                    min_px = (
                        250
                        if c.get('section')
                        or c.get('keep')
                        or c['kind'] in ('detail', 'auxiliary', 'removed_section')
                        else 0
                    )
                    if c.get('role') == 'locator':
                        min_px = 160
                    minimum = dc.PAPERS[paper][0] * min_px / (1300 * (gb[2] - gb[0]))
                    if min_px:
                        smallest = next((s for s in reversed(STANDARD_SCALES) if s >= minimum), None)
                        if smallest is None:
                            break
                        if c.get('role') == 'locator' or (compact and spec['view_key'] != main):
                            vs = smallest
                        else:
                            vs = max(vs, smallest)
                if vs != scale:
                    spec['scale'] = vs
                    if spec['type'] != 'detail':
                        spec['name'] += ' ' + _scale_text(vs)
                if gb:
                    b = [x * vs for x in gb]
                    skeleton.append(
                        SimpleNamespace(
                            name=spec['name'],
                            box_geom=b,
                            box_full=b,
                            dims=[],
                            marks=dc.Marks(),
                            scale=vs,
                            spec=spec,
                            candidate=c,
                            grid=None if spec.get('free') else BASIC_GRID.get(spec['type']),
                        )
                    )
            scales = tuple(v.get('scale', scale) for v in specs)
            if (
                len(skeleton) < sum(bool(s['_candidate'].get('geometry_bbox')) for s in specs)
                or scale not in scales
                or scales in seen
            ):
                continue
            seen.add(scales)
            info = dict(
                title=trial['title'],
                drawing_no=trial['drawing_no'],
                scale=scale,
                material=trial.get('material', ''),
                quantity=trial.get('quantity', ''),
            )
            _, box, reserved = sheet_frame(
                paper, info, index, count, trial.get('parts_list', []), trial.get('notes', [])
            )
            if len(skeleton) == len(specs):
                if not _readable_subjects(skeleton, paper, complex_subject) or not arrange_views(
                    skeleton, box, reserved, style=style
                ):
                    continue
            # make_sheet_spec 的所有名字引用必须与独立比例标签一起迁移。
            for old, new in zip(sheet['views'], specs):
                if old['name'] != new['name']:
                    for k in ('dimensions', 'balloons', 'centerlines', 'phantom', 'section_traces'):
                        if k in trial:
                            trial[k] = [dict(item) for item in trial[k]]
                    for item in specs:
                        if item.get('section'):
                            item['section'] = dict(item['section'])
                        if item.get('_definition', {}).get('detail'):
                            item['_definition'] = dict(
                                item['_definition'], detail=dict(item['_definition']['detail'])
                            )
                    name, new['name'] = new['name'], old['name']
                    _rename_view(trial, new, name)
            try:
                runtime = context['measure_sheet'](trial, scale)
            except Exception as err:
                # compose 以此错误报告 C 在该比例没有可用轨道；其余错误直接交还调用方。
                if not (
                    str(err).startswith('未解决尺寸：') or ('剖切面' in str(err) and '没有交点' in str(err))
                ):
                    raise
                reason = str(err)[:650]
                continue
            if not runtime or any(getattr(v, 'layout_conflicts', ()) for v in runtime):
                reason = '上游完整标注在图内互盖'
                continue
            if not _readable_subjects(runtime, paper, complex_subject) or not arrange_views(
                runtime, box, reserved, style=style
            ):
                continue
            union = None
            for v in runtime:
                union = dc.box_union(union, _shift(_extent(v), *v.paper_origin))
            fill = [
                round((union[2] - union[0]) / (box[2] - box[0]), 3),
                round((union[3] - union[1]) / (box[3] - box[1]), 3),
            ]
            trial['_layout'] = dict(
                fits=True, fill=fill, target_fill=[0.7, 0.9], complex_subject=complex_subject
            )
            if not all(0.7 <= ratio <= 0.9 for ratio in fill):
                trial['_layout']['fill_reason'] = '标准比例档差、图形长宽比及标注边距限制'
            missing = sum(len(getattr(v, 'layout_unresolved', ())) for v in runtime)
            if missing:
                trial['_layout']['unplaced_dimensions'] = missing
            if not missing or not context.get('optimize_witnesses') or sheet.get('id') == '试排':
                return trial
            if fallback is None or missing < fallback['_layout']['unplaced_dimensions']:
                fallback = trial
    if fallback is not None:
        return fallback
    return dict(
        sheet,
        paper='A2',
        scale=1.0,
        _layout=dict(fits=False, reason='固定字高：' + reason, complex_subject=complex_subject),
    )


def _is_basic(c):
    return c['kind'] == 'basic' and not c.get('section') and not c.get('keep')


def _content_order(members):
    # 主体和主剖依阅读顺序排，优先让接口端视与纵剖同页。
    groups = OrderedDict()
    basic = [v['view_key'] for v in members if _is_basic(v)]

    def reading_order(v):
        key = v.get('source_key') or v['view_key']
        return (
            basic.index(key) if key in basic else len(basic),
            0 if _is_basic(v) else 1,
            0 if str(v.get('layout_group', '')).endswith(':main') else 1,
        )

    for c in sorted(members, key=reading_order):
        key = (c.get('source_key') or c['view_key'], c.get('layout_group') or c['view_key'])
        groups.setdefault(str(key), []).append(c)
    return [c for group in groups.values() for c in group]


def _source_marks(pages, external=()):
    sheets = list(pages)
    if external:
        shared = []
        for c in external:
            spec = c['spec']
            shared.append(
                dict(
                    view_key=c['view_key'],
                    name=spec.get('name', c['name']),
                    section=dict(spec['section']) if spec.get('section') else None,
                    label=spec.get('label'),
                    arrow_at=spec.get('arrow_at', [0, 0]),
                    _candidate=dict(c),
                )
            )
        sheets.append(dict(id='其他页', views=shared))
    location = {
        v['view_key']: (i, s, v)
        for i, s in enumerate(sheets, 1)
        for v in s['views']
        if v['_candidate'].get('role') != 'locator'
    }
    for index, sheet in enumerate(sheets, 1):
        for v in sheet['views']:
            c = v['_candidate']
            key = c.get('source_key') or c.get('parent_key')
            if not key or key not in location or c.get('role') == 'locator':
                continue
            n, source_sheet, source = location[key]
            if external and n == index == len(sheets):
                continue
            section = v.get('section')
            if section:
                section.update(source_sheet=n, source_sheet_id=source_sheet['id'])
                record = dict(
                    label=section.get('label') or v.get('label'),
                    point=c['section']['point'],
                    direction=c['direction'],
                    target_sheet=index,
                    target_sheet_id=sheet['id'],
                )
                if record not in source.setdefault('section_references', []):
                    source['section_references'].append(record)
                    source['_candidate'].setdefault('section_references', []).append(copy.deepcopy(record))
                if n != index:
                    trace = dict(parent=source['name'], parent_key=key, **record)
                    if trace not in source_sheet.setdefault('section_traces', []):
                        source_sheet['section_traces'].append(trace)
            elif c['kind'] == 'auxiliary' and n != index:
                record = dict(
                    view_key=c['view_key'],
                    label=v.get('label') or v['name'],
                    direction=c['direction'],
                    arrow_at=v.get('arrow_at', [0, 0]),
                    target_sheet=index,
                )
                if record not in source.setdefault('auxiliary_references', []):
                    source['auxiliary_references'].append(record)
                    source['_candidate'].setdefault('auxiliary_references', []).append(
                        copy.deepcopy(record)
                    )
            if n != index:
                v['_source_reference'] = dict(
                    view_key=key, sheet_id=source_sheet['id'], sheet_index=n, view=source['name']
                )
                if key not in {w['view_key'] for w in sheet['views']}:
                    v['parent'] = None
                    if section:
                        section.pop('parent', None)


def _plane_crosses_source(cut, source, projection):
    """整剖的三维原平面在来源图上须为直线，原剖点须落在实线的两个交点之间。"""
    normal = np.array(cut['direction'], float)
    normal /= np.linalg.norm(normal)
    if abs(normal @ source['direction']) > 1e-7:
        return False
    projector = project.Projector(source)
    n = np.array([normal @ projector.u, normal @ projector.v])
    t = np.array([-n[1], n[0]])
    p = np.asarray(cut['section']['point']) - projector.o
    point = np.array([p @ projector.u, p @ projector.v])
    hits = []
    for curve in projection['lines']:
        if curve['type'] != 'visible':
            continue
        samples = dc.g2.sample(curve, 0.25) - point
        signs = samples @ n
        hits.extend(samples[abs(signs) < 1e-7] @ t)
        for i in np.flatnonzero(signs[:-1] * signs[1:] < 0):
            hit = samples[i] + (samples[i + 1] - samples[i]) * signs[i] / (signs[i] - signs[i + 1])
            hits.append(float(hit @ t))
    return len(hits) >= 2 and min(hits) <= 1e-6 and max(hits) >= -1e-6


def plan_sheets(candidates, dimensions, *, context, legacy=None):
    """先组成图形组，再根据完整纸面范围和投影依赖决定纸张、比例和张次。"""
    if not context.get('measure_sheet'):
        raise LayoutError('分页需要 context[measure_sheet] 实际投影与尺寸包围框')
    kept, dims, remap = _deduplicate(candidates, dimensions)
    by_key = {c['view_key']: c for c in kept}
    assigned = {d['view_key'] for d in dims}
    active_keys = {c['view_key'] for c in kept if not c.get('layout_optional') or c['view_key'] in assigned}
    projections = {}

    def projection(candidate):
        key = candidate['view_key']
        if key not in projections:
            projections[key] = context['project_candidate'](candidate, scale=1.0)
        return projections[key]

    source_changes = []
    if context.get('project_candidate'):
        for c in kept:
            source = by_key.get(c.get('source_key'))
            if (
                c['view_key'] not in active_keys
                or not source
                or not source.get('keep')
                or (c.get('section') or {}).get('mode') != 'full'
            ):
                continue
            # 裁剪端视有时仅剩断裂波线，无处落剖切符号。在同件已选基本图上
            # 用该整剖原平面定位；裁剪父图、平面、结果图及所有 D 见证保持原值。
            if any(curve['type'] == 'visible' for curve in projection(source)['lines']):
                continue
            for v in kept:
                if (
                    v['view_key'] in active_keys
                    and _is_basic(v)
                    and (v['frame'], v.get('part')) == (c['frame'], c.get('part'))
                    and _plane_crosses_source(c, v, projection(v))
                ):
                    source_changes.append(
                        dict(section=c['view_key'], old=source['view_key'], new=v['view_key'])
                    )
                    c['source_key'] = v['view_key']
                    break
    # source_key 必须有纸面落点；仅作为裁剪依赖的 parent_key 仍可隐藏。
    pending = list(active_keys)
    while pending:
        key = by_key[pending.pop()].get('source_key')
        if key in by_key and key not in active_keys:
            active_keys.add(key)
            pending.append(key)
    active = [c for c in kept if c['view_key'] in active_keys]
    if not active:
        raise LayoutError('无需要绘制的候选')
    for c in active:
        if not c.get('geometry_bbox') and context.get('project_candidate'):
            proj = projection(c)
            c['geometry_bbox'] = project.geometry_bounds(proj)
    groups = OrderedDict()
    for c in sorted(active, key=lambda c: c['frame'] != 'assembly'):
        groups.setdefault((c['frame'], c.get('part')), []).append(c)
    problem = str(context['problem'])
    heads = context.get('head_sheets', [])
    notes = list(dict.fromkeys(n for h in heads for n in h.get('notes', [])))
    bom = next((h['parts_list'] for h in heads if h.get('parts_list')), [])
    pages = []
    cache = {}
    reasons = []

    def build(selection, first, complex_subject):
        keys = tuple(c['view_key'] for c in selection)
        stamp = (keys, first)
        if stamp in cache:
            return cache[stamp]
        members = [dict(c, spec=dict(c['spec'])) for c in selection]
        group = (members[0]['frame'], members[0].get('part'))
        # 单独的图形可以由一个真实父图定位，多个结果图使用跨页定位。
        # 局部放大的范围圆只在来源视图上可画。跨页时并入该局部唯一的定位副本。
        locators = []
        for c in members:
            key = c.get('source_key') or c.get('parent_key')
            if c['kind'] == 'detail' and key in by_key and key not in keys and key not in locators:
                locators.append(key)
        if len(members) == 1:
            parent = members[0].get('source_key') or members[0].get('parent_key')
            if not parent and _is_basic(members[0]):
                # 分开的基本投影可用同一零件的另一正投影作方向定位。
                parent = next(
                    (
                        c['view_key']
                        for c in active
                        if c['view_key'] != keys[0]
                        and (c['frame'], c.get('part')) == group
                        and _is_basic(c)
                    ),
                    None,
                )
            if parent in by_key and parent not in locators:
                locators.append(parent)
        for key in reversed(locators):
            p = by_key[key]
            members.insert(
                0,
                dict(
                    p,
                    role='locator',
                    spec=dict(p['spec'], free=True, origin_marker=False, name='定位' + p['name']),
                ),
            )
        title_parts = {c.get('part') for c in members}
        multi = len(title_parts) > 1
        names = set()
        for c in members:
            spec = c['spec']
            name = spec.get('name') or c['name']
            if multi:
                name = '件' + str(c['part']) + ' ' + name
            if name in names:
                name += ' ' + str(len(names) + 1)
            spec['name'] = name
            names.add(name)
            if c.get('section') or c.get('keep'):
                spec['free'] = True
        template = _sheet_template(context, group, members, remap)
        if multi:
            for part in dict.fromkeys(c.get('part') for c in members):
                if part == group[1]:
                    continue
                extra = _sheet_template(context, (group[0], part), members, remap)
                for key in ('balloons', 'section_traces', 'centerlines', 'phantom'):
                    if extra.get(key):
                        template.setdefault(key, []).extend(extra[key])
            template.pop('quantity', None)
            template['title'] = (
                ' / '.join(dict.fromkeys(h['title'] for h in heads if h.get('part') in title_parts))
                or '零件图'
            )
            template['material'] = ' / '.join(
                dict.fromkeys(
                    h['material'] for h in heads if h.get('part') in title_parts and h.get('material')
                )
            )
        template.update(
            drawing_no='JX-'
            + problem
            + '-'
            + ('Z' if group[0] == 'assembly' else '+'.join(dict.fromkeys(str(c['part']) for c in members))),
            notes=notes if first else [],
            parts_list=bom if first and group[0] == 'assembly' else [],
        )
        sheet = dc.make_sheet_spec(template, members, [d for d in dims if d['view_key'] in keys])
        limit = 25 if complex_subject else 40
        if len(sheet['dimensions']) > limit:
            fitted = dict(
                sheet,
                paper='A3',
                scale=1.0,
                _layout=dict(
                    fits=False,
                    complex_subject=complex_subject,
                    capacity_failure=True,
                    reason=f"该结构组有{len(sheet['dimensions'])}项尺寸，超过单页{limit}项",
                ),
            )
        elif len(members) > 4 or (len(members) < 2 and len(active) > 1):
            fitted = dict(
                sheet,
                paper='A3',
                scale=1.0,
                _layout=dict(fits=False, complex_subject=complex_subject, reason='单图缺少相关配图'),
            )
        else:
            preview = dict(
                sheet,
                id='试排',
                views=copy.deepcopy(sheet['views']),
                section_traces=copy.deepcopy(sheet.get('section_traces', [])),
            )
            _source_marks([preview], [c for c in active if c['view_key'] not in keys])
            fitted = _fit_sheet(preview, context, complex_subject)
        # 保留未加独立比例后的规格以便最终回填后重新测量。
        fitted['_layout_base'] = sheet
        cache[stamp] = fitted
        return fitted

    pending_groups = list(groups.items())
    while pending_groups:
        group, members = pending_groups.pop(0)
        complex_subject = bool(context.get('parts')) and (
            group[0] == 'assembly'
            or 3 <= int(problem) <= 21
            or (int(problem) >= 22 and str(group[1]) == '1')
        )
        seq = _content_order(members)
        combined = list(seq)
        combinations = []
        if group[0] == 'part' and len(seq) < 4:
            for next_group, other in pending_groups:
                if next_group[0] != 'part' or len(combined) + len(other) > 4:
                    break
                combined = combined + _content_order(other)
                combinations.append(combined)
        for n in range(len(combinations), 0, -1):
            together = build(combinations[n - 1], not pages, complex_subject)
            if together['_layout']['fits']:
                del pending_groups[:n]
                pages.append(together)
                break
        else:
            n = 0
        if n:
            continue
        # 按相邻结构组的页划分做动态规划。页数相同优先保留端视/纵剖配对。
        best = {len(seq): ((0, 0, 0), [])}
        for start in reversed(range(len(seq))):
            options = []
            for end in range(min(start + 4, len(seq)), start, -1):
                if end not in best:
                    continue
                page = build(seq[start:end], not pages and start == 0, complex_subject)
                tail, rest = best[end]
                broken = int(
                    end < len(seq)
                    and seq[end].get('layout_group')
                    and seq[end]['layout_group'] == seq[end - 1].get('layout_group')
                    or 0
                )
                if page['_layout']['fits']:
                    cost = (tail[0], 1 + tail[1], tail[2] + broken)
                    options.append((cost, [page] + rest))
                elif end == start + 1:
                    options.append(((tail[0] + 1, 1 + tail[1], tail[2] + broken), [page] + rest))
            best[start] = min(options, key=lambda option: option[0])
        new = best[0][1]
        # 跨相邻组归并同件稀疏页。完整图形、原尺寸及必需来源一同复测。
        while len(new) > 1:
            contents = [
                [
                    v['view_key']
                    for v in page['_layout_base']['views']
                    if v['_candidate'].get('role') != 'locator'
                ]
                for page in new
            ]
            merged = False
            for i in sorted(range(len(contents)), key=lambda k: len(contents[k])):
                original = contents[i]
                for j in sorted(range(len(new)), key=lambda j: abs(i - j)):
                    if i == j or len(original) + len(contents[j]) > 4:
                        continue
                    low, high = sorted((i, j))
                    selected = set(original + contents[j])
                    union = [c for c in seq if c['view_key'] in selected]
                    joined = build(union, not pages and low == 0, complex_subject)
                    if joined['_layout']['fits']:
                        new[low] = joined
                        new.pop(high)
                        merged = True
                        break
                if merged:
                    break
            if not merged:
                break
        budget = 2 if group[0] == 'assembly' or 3 <= int(problem) <= 15 else (4 if complex_subject else 1)
        if len(new) > budget:
            reasons.append(
                dict(
                    group=list(group),
                    count=len(new),
                    budget=budget,
                    reason=f'{len(seq)}个需表达图形、{sum(d["view_key"] in {c["view_key"] for c in seq} for d in dims)}项尺寸，'
                    f'每页2–4图，按固定字高、完整包围框及结构配对排{len(new)}张',
                )
            )
        pages.extend(new)
    bases = [s.pop('_layout_base') for s in pages]
    for i, base in enumerate(bases, 1):
        base['id'] = f'{problem}-{i}'
    _source_marks(bases)
    failures = []
    final = []
    transferred = {}
    technical_sheet = 1
    for i, (base, pre) in enumerate(zip(bases, pages), 1):
        subject = pre['_layout']['complex_subject']
        if i in transferred:
            sheet = transferred[i]
        elif pre['_layout'].get('capacity_failure'):
            sheet = dict(pre, id=base['id'])
        else:
            sheet = _fit_sheet(base, context, subject, i, len(pages))
        if (
            i == 1
            and not sheet['_layout']['fits']
            and not pre['_layout'].get('capacity_failure')
            and (base['notes'] or base['parts_list'])
        ):
            # 将整块技术要求/明细移到同一套图中能容纳它的一张。两张都复测成功才采用。
            first = _fit_sheet(dict(base, notes=[], parts_list=[]), context, subject, i, len(pages))
            if first['_layout']['fits']:
                for n, other in enumerate(bases[1:], 2):
                    if base['parts_list'] and other['frame'] != 'assembly':
                        continue
                    if pages[n - 1]['_layout'].get('capacity_failure'):
                        continue
                    with_notes = dict(other, notes=base['notes'], parts_list=base['parts_list'])
                    updated = _fit_sheet(
                        with_notes, context, pages[n - 1]['_layout']['complex_subject'], n, len(pages)
                    )
                    if updated['_layout']['fits']:
                        sheet, transferred[n], technical_sheet = first, updated, n
                        break
        sheet['_layout'].update(
            sheet_index=i, sheet_count=len(pages), group=[sheet['frame'], sheet.get('part')]
        )
        if not sheet['_layout']['fits'] or len(sheet['views']) < 2:
            sheet['_layout']['fits'] = False
            failures.append(
                dict(
                    group=sheet['_layout']['group'],
                    views=[v['view_key'] for v in sheet['views']],
                    reason=sheet['_layout'].get('reason', '每页至少两图'),
                )
            )
        final.append(sheet)
    emitted = [d['_id'] for s in final for d in s['dimensions']]
    expected = [d['_id'] for d in dimensions]
    if sorted(emitted) != sorted(expected) or len(emitted) != len(set(emitted)):
        raise LayoutError('分页后尺寸重复或丢失')
    context['layout_report'] = dict(
        head_count=len(heads),
        input_views=len(candidates),
        unique_views=len(kept),
        active_views=len(active),
        new_count=len(final),
        reasons=reasons,
        failures=failures,
        pending_source_references=[],
        section_source_changes=source_changes,
        technical_sheet=technical_sheet,
    )
    if failures and not context.get('layout_diagnostic'):
        raise LayoutError('；'.join(str(f['views']) + ' ' + f['reason'] for f in failures))
    return final

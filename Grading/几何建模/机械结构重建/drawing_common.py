"""私有制图公共设施；原 HEAD 的标注设施与纸面样式。禁止反向导入主入口。"""
import argparse
import copy
import json
import math
import os
import sys
from contextlib import contextmanager
from pathlib import Path
import numpy as np
HERE = Path(__file__).resolve().parent
PUBLIC = HERE.parents[2] / "几何建模" / "机械结构重建"
sys.path.insert(0, str(PUBLIC / "工具"))
from drawkit import geom2d as g2, render

PAPERS = {"A4": (210, 297, 25, 5), "A3": (420, 297, 25, 5), "A2": (594, 420, 25, 10), "A1": (841, 594, 25, 10)}
SCALES = [5, 4, 2.5, 2, 1, 1 / 1.5, 1 / 2, 1 / 2.5, 1 / 3, 1 / 4, 1 / 5]
DIM_H = 9.0        # 尺寸数字字高
LABEL_H = 9.0      # 视图名称字高
ARROW = 3.0        # 箭头长
EXT_GAP = 1.0      # 尺寸界线与轮廓的间隙
EXT_OVER = 2.0     # 尺寸界线超出尺寸线
LEVEL0 = 12.0       # 第一道尺寸线离轮廓
LEVEL_STEP = 14.0   # 相邻尺寸线间距
VIEW_GAP = 12.0    # 视图间距
TB_W, TB_H = 180.0, 32.0
PL_ROW = 7.0
ROMAN = ["Ⅰ", "Ⅱ", "Ⅲ", "Ⅳ", "Ⅴ", "Ⅵ", "Ⅶ", "Ⅷ"]
HATCH_STYLES = [(45, 3.0), (135, 3.0), (45, 1.8), (135, 1.8), (60, 3.0), (120, 3.0)]

# 私有接口；public_sheet 的显式白名单不引用这些字段。
CANDIDATE_PRIVATE_FIELDS = ('layout_group', 'role', 'source_key', 'canonical_key',
                            'omitted_features', 'witness_elements', '_a_features',
                            'section_references', 'auxiliary_references', 'layout_optional')
VIEW_DEFINITION_FIELDS = ('kind', 'parts', 'direction', 'u', 'v', 'origin',
                          'section', 'keep', 'hidden', 'detail',
                          'witness_elements', '_a_features')
VIEW_ROLES = frozenset(('overview', 'locator', 'detail'))


class DimensionAssignmentError(ValueError):
    """C 的可检查失败；audit 不使用旧 _head_sheet 冒充最终图页。"""
    def __init__(self, message='尺寸归属存在未解决项', *, unresolved=None, assignments=None, audit=None):
        super().__init__(message)
        self.unresolved = [] if unresolved is None else unresolved
        self.assignments = [] if assignments is None else assignments
        self.audit = [] if audit is None else audit


def normalize_candidate(candidate):
    """规范 A/B 输出的 role 与 layout_optional；只有生产包明确标记的图可选。"""
    candidate = copy.deepcopy(candidate)
    spec = candidate.get('spec', {})
    old_role = candidate.pop('view_role', None)
    old_display_role = spec.pop('view_role', None)
    role = candidate.get('role') or spec.get('role') or old_role or old_display_role
    if role == 'interface_end':
        role = 'detail'
    if role is None:
        role = 'overview' if candidate.get('kind') == 'basic' and not candidate.get('keep') else 'detail'
    optional = candidate.get('layout_optional', spec.get('layout_optional'))
    if optional is not None:
        if not isinstance(optional, bool):
            raise ValueError('layout_optional 必须是布尔值')
        candidate['layout_optional'] = optional
        if 'layout_optional' in spec:
            spec['layout_optional'] = optional
        # B 旧版把未裁剪的候选剖面一律称作总览。选配剖面在 D 中属于结构详图。
        if optional and candidate.get('section') and role == 'overview':
            role = 'detail'
    if role not in VIEW_ROLES:
        raise ValueError(f'未知候选 role：{role}')
    candidate['role'] = role
    if 'role' in spec or old_display_role is not None:
        spec['role'] = role
    return candidate


def backfill_dimension_audit(audit, locations, dimension_id=None):
    """原地填最终 sheet_id/sheet_index/view_key/view，返回按 D 归集的记录。

    支持记录列表、按 D 号索引的字典和含这些记录的 audit 包装字典。
    单条 _dimension_audit 可由 dimension_id 指定所属 D；不改原 _head_sheet。
    """
    records = {}

    def visit(node, inherited=None):
        if isinstance(node, dict):
            identity = node.get('id', node.get('_id', node.get('dimension_id', inherited)))
            if isinstance(identity, str) and identity in locations:
                node.update(copy.deepcopy(locations[identity]))
                if 'sheet' in node:
                    node['sheet'] = locations[identity]['sheet_id']
                records.setdefault(identity, []).append(node)
            for key, value in list(node.items()):
                visit(value, key if key in locations else None)
        elif isinstance(node, list):
            for value in node:
                visit(value, inherited)
    visit(audit, dimension_id)
    return records


def visible_curve_overlap(first, visible, tolerance=1e-5):
    """仅对精确直线/真形圆弧求共同区间，不用最近邻给边认身份。"""
    if first['geom'] == visible['geom'] == 'line':
        a,b = np.asarray(first['from']),np.asarray(first['to'])
        c,d = np.asarray(visible['from']),np.asarray(visible['to'])
        direction = b-a
        length = np.linalg.norm(direction)
        if length <= tolerance:
            return []
        direction /= length
        normal = np.array([-direction[1],direction[0]])
        if max(abs((c-a)@normal),abs((d-a)@normal)) > tolerance:
            return []
        lo,hi = sorted((float((c-a)@direction),float((d-a)@direction)))
        lo,hi = max(0.,lo),min(length,hi)
        return [g2.line(a+lo*direction,a+hi*direction,'visible')] if hi-lo > tolerance else []
    if first['geom'] not in ('arc','circle') or visible['geom'] not in ('arc','circle'):
        return []  # 斜投影折线不冒充精确最终边，需要更清楚的真形视图。
    if (np.linalg.norm(np.asarray(first['center'])-visible['center']) > tolerance or
            abs(first['r']-visible['r']) > tolerance):
        return []
    def intervals(curve):
        start,end = g2.span_of(curve)
        if end-start >= 360-1e-7:
            return [(0.,360.)]
        end = start % 360 + end-start
        start %= 360
        return [(start,min(360.,end))]+([(0.,end-360)] if end>360 else [])
    result = []
    for a,b in intervals(first):
        for c,d in intervals(visible):
            lo,hi = max(a,c),min(b,d)
            if hi-lo > 1e-7:
                result.append(g2.arc(visible['center'],visible['r'],lo,hi,'visible'))
    return result


class FinalEdgeWitnesses:
    """A-03：操作生成面 → 最终拓扑边 → 同场景该边的可见 HLR → 已保留图线。

    只读 Model.steps；不改参考描述/实体，不将旧选边点或相邻线当最终边。
    无法证明、被后续加工去掉、被遮挡或不能精确映射时返回空见证并记 audit。
    """
    def __init__(self, mdl, description):
        self.model = mdl
        self.features = {str(p.get('name',i)):p['features'] for i,p in enumerate(description['parts'],1)}
        self.audit = {}
        self._owned = {}
        self._proofs = {}

    @staticmethod
    def edges(shape):
        from OCP.TopAbs import TopAbs_EDGE
        from OCP.TopExp import TopExp_Explorer
        from OCP.TopoDS import TopoDS
        result,buckets = [],{}
        iterator = TopExp_Explorer(shape,TopAbs_EDGE)
        while iterator.More():
            edge = TopoDS.Edge_s(iterator.Current())
            bucket = buckets.setdefault(hash(edge),[])
            if not any(edge.IsSame(previous) for previous in bucket):
                result.append(edge)
                bucket.append(edge)
            iterator.Next()
        return result

    @staticmethod
    def length(shape):
        from OCP.BRepGProp import BRepGProp
        from OCP.GProp import GProp_GProps
        properties = GProp_GProps()
        BRepGProp.LinearProperties_s(shape,properties,True)
        return properties.Mass()

    @staticmethod
    def boxes_overlap(first,second):
        from drawkit import model
        a,b = model.shape_bbox(first),model.shape_bbox(second)
        return a is not None and b is not None and bool(np.all(a[1]+1e-5>=b[0]) and np.all(b[1]+1e-5>=a[0]))

    @classmethod
    def covered_edge(cls,edge,support):
        from OCP.BRepAlgoAPI import BRepAlgoAPI_Common
        if not cls.boxes_overlap(edge,support):
            return False
        common = BRepAlgoAPI_Common(edge,support)
        common.Build()
        if not common.IsDone():
            return False
        length = cls.length(edge)
        return length>1e-7 and abs(cls.length(common.Shape())-length)<=1e-6*max(1.,length)

    def owned_edges(self,part,feature_id):
        """重建该次 R/C maker 的 Generated 面，验证最终边仍完整位于生成面上。"""
        from drawkit import model
        from OCP.BRepFilletAPI import BRepFilletAPI_MakeFillet,BRepFilletAPI_MakeChamfer
        from OCP.BRepBuilderAPI import BRepBuilderAPI_MakeVertex
        from OCP.BRepExtrema import BRepExtrema_DistShapeShape
        from OCP.TopAbs import TopAbs_FACE
        key = (part.name,feature_id)
        if key in self._owned:
            return self._owned[key]
        feature = self.features[part.name][feature_id-1]
        before = next(step.result for step in part.steps if step.index==feature_id-1)
        edges = self.edges(before)
        selected = []
        for point in feature['edges']:
            vertex = BRepBuilderAPI_MakeVertex(model.pnt(point)).Vertex()
            hits = []
            for edge in edges:
                distance = BRepExtrema_DistShapeShape(vertex,edge)
                distance.Perform()
                if distance.IsDone() and distance.Value()<=feature.get('tolerance',.05):
                    hits.append(edge)
            if len(hits)!=1:
                raise ValueError('原 R/C 选边不能唯一重现')
            selected.append(hits[0])
        maker = (BRepFilletAPI_MakeFillet(before) if feature['type']=='fillet' else BRepFilletAPI_MakeChamfer(before))
        parameter = 'radius' if feature['type']=='fillet' else 'distance'
        for edge in selected:
            maker.Add(float(feature[parameter]),edge)
        maker.Build()
        if not maker.IsDone():
            raise ValueError('R/C Generated 历史重建失败')
        faces = [face for edge in selected for face in maker.Generated(edge) if face.ShapeType()==TopAbs_FACE]
        if not faces:
            raise ValueError('R/C 没有可核查的 Generated 面')
        owned = []
        for index,edge in enumerate(self.edges(part.shape),1):
            if any(self.covered_edge(edge,face) for face in faces):
                owned.append((index,edge))
        self._owned[key] = owned
        return owned

    def prove(self,candidate,geometry):
        from drawkit import model,project
        from OCP.BRepLib import BRepLib
        from OCP.HLRBRep import HLRBRep_Algo,HLRBRep_HLRToShape
        from OCP.HLRAlgo import HLRAlgo_Projector
        from OCP.gp import gp_Ax2
        scene = geometry.get('_shapes', [])
        visible = [c for c in geometry.get('lines',[]) if c['type']=='visible']
        if not scene or not visible:
            return []
        stamp = (tuple(hash(shape) for shape in scene),json.dumps({k:candidate.get(k) for k in
            ('view_key','frame','parts','direction','u','v','origin')},sort_keys=True),
            json.dumps(visible,separators=(',',':')))
        if stamp in self._proofs:
            return copy.deepcopy(self._proofs[stamp])
        scene_edges = self.edges(model.compound(scene))
        matches = []
        for name in candidate.get('parts') or self.features:
            name = str(name)
            part = self.model.part(name)
            for fid,feature in enumerate(self.features.get(name,[]),1):
                if feature['type'] not in ('fillet','chamfer'):
                    continue
                audit_key = f"{candidate.get('view_key')}:{name}:{fid}"
                self.audit[audit_key] = dict(part=name,feature=fid,view_key=candidate.get('view_key'),status='unresolved',
                    reason='最终边未在本视图的保留可见图线中获得证明')
                try:
                    owned = self.owned_edges(part,fid)
                    if not owned:
                        self.audit[audit_key]['reason'] = 'R/C 生成面上没有保留下来的完整最终边'
                    if candidate.get('frame')=='assembly':
                        transform = model.trsf_from_matrix(part.placement)
                        owned = [(index,model.transformed(edge,transform)) for index,edge in owned]
                    for index,edge in owned:
                        for scene_index,actual in enumerate(scene_edges,1):
                            if actual.IsSame(edge) or self.covered_edge(actual,edge):
                                matches.append((name,fid,index,scene_index,actual,audit_key))
                except Exception as error:
                    self.audit[audit_key]['reason'] = f'{type(error).__name__}: {error}'
        if not matches:
            self._proofs[stamp] = []
            return []
        pj = project.Projector(candidate)
        algorithm = HLRBRep_Algo()
        for shape in scene:
            BRepLib.EncodeRegularity_s(shape,1e-4)
            algorithm.Add(shape)
        algorithm.Projector(HLRAlgo_Projector(gp_Ax2(model.pnt(pj.o),model.gdir(pj.w),model.gdir(pj.u))))
        algorithm.Update()
        algorithm.Hide()
        result = HLRBRep_HLRToShape(algorithm)
        elements,seen = [],set()
        for name,fid,index,scene_index,edge,audit_key in matches:
            # 此重载查询“这一条最终拓扑边”的可见部分，排除同投影但被遮挡的边。
            compound = result.VCompound(edge)
            curves = project.compound_curves(compound,'visible',lambda point:(point.X(),point.Y()))
            for curve in curves:
                for retained in visible:
                    for overlap in visible_curve_overlap(curve,retained):
                        identity = (name,fid,index,json.dumps(overlap,sort_keys=True))
                        if identity in seen:
                            continue
                        seen.add(identity)
                        feature = self.features[name][fid-1]
                        elements.append(dict(part=name,feature=fid,parameters=[
                            'radius' if feature['type']=='fillet' else 'distance'],kind='final_edge',curve=overlap,
                            provenance=dict(method='occt_generated_face_final_edge_visible_hlr',
                                final_edge=index,scene_edge=scene_index,feature=fid,
                                ownership='Generated face / exact 3D Common',visibility='VCompound(final scene edge)',
                                mapping='retained visible line/circle interval intersection',tolerance_mm=1e-5)))
                        self.audit[audit_key]['status'] = 'proved'
                        self.audit[audit_key].pop('reason',None)
        self._proofs[stamp] = copy.deepcopy(elements)
        return elements

def box_union(a, b):
    if a is None:
        return b
    if b is None:
        return a
    return [min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3])]


def box_pts(pts):
    pts = np.asarray(pts, float)
    return [float(pts[:, 0].min()), float(pts[:, 1].min()), float(pts[:, 0].max()), float(pts[:, 1].max())]


def box_overlap(a, b, margin=0.0):
    return not (a[2] + margin <= b[0] or b[2] + margin <= a[0] or a[3] + margin <= b[1] or b[3] + margin <= a[1])


def text_box(text, at, h, anchor="mm", angle=0.0):
    w, hh = render.text_extent(text, h)
    ax = {"l": 0.0, "m": 0.5, "r": 1.0}[anchor[0]] * w
    ay = {"t": 1.0, "m": 0.5, "b": 0.0}[anchor[1]] * hh
    corners = np.array([[0, 0], [w, 0], [w, hh], [0, hh]]) - [ax, ay]
    a = math.radians(angle)
    rot = np.array([[math.cos(a), -math.sin(a)], [math.sin(a), math.cos(a)]])
    return box_pts(corners @ rot.T + np.asarray(at))


class Occupancy:
    """视图周围的占用栅格（局部图纸坐标，0.5 毫米一格），用来给文字、引线找不压线的位置。"""
    RES = 0.5

    def __init__(self, box, margin=100.0):
        self.x0, self.y0 = box[0] - margin, box[1] - margin
        self.nx = int((box[2] - box[0] + 2 * margin) / self.RES) + 1
        self.ny = int((box[3] - box[1] + 2 * margin) / self.RES) + 1
        self.g = np.zeros((self.ny, self.nx), np.float32)
        self.text_g = np.zeros_like(self.g)

    def _ij(self, pts):
        pts = np.atleast_2d(pts)
        i = ((pts[:, 0] - self.x0) / self.RES).astype(int)
        j = ((pts[:, 1] - self.y0) / self.RES).astype(int)
        ok = (i >= 0) & (i < self.nx) & (j >= 0) & (j < self.ny)
        return i[ok], j[ok]

    def add_curve(self, c, w=1.0):
        i, j = self._ij(g2.sample(c, 0.25))
        self.g[j, i] = np.maximum(self.g[j, i], w)

    def _slice(self, box, inset=0.0):
        i0 = int(np.floor((box[0] + inset - self.x0) / self.RES))
        i1 = int(np.ceil((box[2] - inset - self.x0) / self.RES))
        j0 = int(np.floor((box[1] + inset - self.y0) / self.RES))
        j1 = int(np.ceil((box[3] - inset - self.y0) / self.RES))
        return slice(max(0, j0), max(0, min(self.ny, j1))), slice(max(0, i0), max(0, min(self.nx, i1)))

    def add_box(self, box, w=4.0):
        sj, si = self._slice(box)
        self.g[sj, si] += w

    def add_text(self, box):
        sj, si = self._slice(box)
        self.g[sj, si] += 20.0
        self.text_g[sj, si] = 1.0

    def crosses_text(self, a, b):
        i, j = self._ij(g2.sample(g2.line(a, b, "x"), 0.25))
        return float(self.text_g[j, i].sum())

    def add_fill(self, loops, w=0.5):
        b = box_pts(np.concatenate([np.asarray(lp, float) for lp in loops]))
        sj, si = self._slice(b)
        if sj.stop <= sj.start or si.stop <= si.start:
            return
        jj, ii = np.mgrid[sj, si]
        pts = np.stack([self.x0 + (ii.ravel() + 0.5) * self.RES, self.y0 + (jj.ravel() + 0.5) * self.RES], axis=1)
        inside = np.zeros(len(pts), bool)
        for lp in loops:
            inside ^= g2.contains({"shape": "polygon", "points": lp}, pts)
        sub = self.g[sj, si].ravel()
        sub[inside] = np.maximum(sub[inside], w)
        self.g[sj, si] = sub.reshape(self.g[sj, si].shape)

    def cost(self, box, inset=0.3):
        sj, si = self._slice(box, inset)
        return float(self.g[sj, si].sum())

    def line_cost(self, a, b):
        i, j = self._ij(g2.sample(g2.line(a, b, "x"), 0.25))
        return float(self.g[j, i].sum()) * 0.5


class Marks:
    """视图内的标注图元，坐标先用"局部图纸坐标"（视图坐标 × 比例），最后换回视图坐标。
    occ 不为空时，画上的图元同时登记到占用栅格。"""

    def __init__(self, occ=None):
        self.items = []
        self.box = None
        self.occ = occ
        self.group_section_pages = False

    def curve(self, c, role=None):
        self.items.append({"kind": "curve", "curve": c, "role": role})
        self.box = box_union(self.box, g2.bounds([c]))
        if self.occ is not None:
            self.occ.add_curve(c, 1.0)

    def line(self, a, b, kind="thin", role=None):
        self.curve(g2.line(a, b, kind), role)

    def arrow(self, tip, d, role=None, size=None):
        size = ARROW if size is None else size
        d = np.asarray(d, float)
        d = d / np.linalg.norm(d)
        self.items.append({"kind": "arrow", "tip": g2.P(tip), "dir": g2.P(d), "size": size, "role": role})
        self.box = box_union(self.box, box_pts([tip, np.asarray(tip) - d * size]))
        if self.occ is not None:
            self.occ.add_box(box_pts([tip, np.asarray(tip) - d * size]), 1.0)

    def dot(self, at, role=None, r=0.6):
        self.items.append({"kind": "dot", "at": g2.P(at), "r": r, "role": role})

    def text(self, text, at, h=None, anchor="mm", angle=0.0, role=None):
        h = DIM_H if h is None else h
        if '见第' in str(text) and '张' in str(text):
            if self.group_section_pages and role == 'section' and str(text).startswith('见第'):
                return
            h = max(h, LABEL_H)
        self.items.append({"kind": "text", "text": str(text), "at": g2.P(at), "height": h,
                           "anchor": anchor, "angle": float(angle), "role": role})
        tb = text_box(text, at, h, anchor, angle)
        self.box = box_union(self.box, tb)
        if self.occ is not None:
            self.occ.add_text([tb[0] - 0.8, tb[1] - 0.8, tb[2] + 0.8, tb[3] + 0.8])

    def to_view(self, s):
        out = []
        for m in self.items:
            m = dict(m)
            if m["kind"] == "curve":
                m["curve"] = g2.xform(m["curve"], 1 / s, (0, 0))
                for key in ("from", "to", "center", "points"):
                    if key in m["curve"]:
                        m["curve"][key] = round_any(m["curve"][key])
                if "r" in m["curve"]:
                    m["curve"]["r"] = round(m["curve"]["r"], 6)
            for key in ("tip", "at"):
                if key in m:
                    m[key] = [round(m[key][0] / s, 6), round(m[key][1] / s, 6)]
            if m.get("role") is None:
                m.pop("role", None)
            out.append(m)
        return out


def round_any(v):
    if isinstance(v, (list, tuple)) and v and isinstance(v[0], (list, tuple)):
        return [[round(a, 6), round(b, 6)] for a, b in v]
    return [round(v[0], 6), round(v[1], 6)]


class Stack:
    def __init__(self):
        self.levels = {"top": [], "bottom": [], "left": [], "right": []}

    def place(self, side, lo, hi):
        levels = self.levels[side]
        for k, occ in enumerate(levels):
            if all(hi <= a - 0.5 or lo >= b + 0.5 for a, b in occ):
                occ.append((lo, hi))
                return k
        levels.append([(lo, hi)])
        return len(levels) - 1


def view_extent(v):
    """视图在局部图纸坐标（视图原点为 0）下占的范围，含尺寸、标注、名称。"""
    b = None
    s = v.scale
    gb = getattr(v, "box_full", v.box_geom)
    b = box_union(b, gb)
    for d in v.dims:
        b = box_union(b, d["marks"].box)
    b = box_union(b, v.marks.box)
    return b


def drawing_style(paper):
    """HEAD 样式；所有长度为纸面 mm，dpi 独立。重画新样式由 D 包实现。"""
    h = 9.0 if paper == 'A1' else 6.5
    return dict(DIM_H=h, LABEL_H=h, LEVEL_STEP=h+5, FRAME_H=h,
                ARROW=ARROW, EXT_GAP=EXT_GAP, EXT_OVER=EXT_OVER,
                LEVEL0=LEVEL0, VIEW_GAP=VIEW_GAP, thin_width=.35,
                thick_width=.7, hatch_spacing=3.)


def apply_style(style):
    """同步公共 Marks 默认字高；主入口同时更新旧常量别名。"""
    for key in ('DIM_H', 'LABEL_H', 'LEVEL_STEP', 'ARROW', 'EXT_GAP', 'EXT_OVER', 'LEVEL0', 'VIEW_GAP'):
        if key in style:
            globals()[key] = style[key]


@contextmanager
def render_style(style):
    """仅在私有出图进程内应用线宽；不改公开 drawkit 文件，退出时恢复。"""
    original = render.STYLE
    thin, thick = style['thin_width'], style['thick_width']
    widths = dict(visible=thick, hidden=thin, center=thin, wave=thin, thin=thin,
                  cut=thick*1.5, frame=thick, border=thin, phantom=thin)
    render.STYLE = {name: (widths[name], pattern) for name, (_, pattern) in original.items()}
    try:
        yield
    finally:
        render.STYLE = original


def marks_bounds(marks, scale):
    """JSON 标注（视图 mm）→完整包围框（局部纸面 mm），供冻结样例使用。"""
    box = None
    for mark in marks:
        kind = mark['kind']
        if kind == 'curve':
            bounds = g2.bounds([g2.xform(mark['curve'], scale, (0, 0))])
        elif kind == 'text':
            bounds = text_box(mark['text'], np.asarray(mark['at'])*scale,
                mark['height'], mark.get('anchor', 'mm'), mark.get('angle', 0))
        elif kind == 'arrow':
            tip = np.asarray(mark['tip'])*scale
            direction = np.asarray(mark['dir'])
            base = tip-direction*mark['size']
            normal = np.array([-direction[1], direction[0]])*mark['size']*.4
            bounds = box_pts([tip, base+normal, base-normal])
        elif kind == 'dot':
            x,y = np.asarray(mark['at'])*scale
            r = mark['r']
            bounds = [x-r, y-r, x+r, y+r]
        else:
            raise ValueError(f'未知标注图元 {kind}')
        box = box_union(box, bounds)
    return box


def check_assembly_relation(relation, tol=1e-6):
    """Verify nominal assembly datums in mm (angles in degrees). Visibility is checked on the projection."""
    kind, elements = relation['kind'], relation['elements']
    points = np.array([e['point'] for e in elements], dtype=float)
    first = elements[0]
    direction = np.asarray(relation.get('direction', [0,0,0]), dtype=float)

    def parallel(a, b):
        return np.linalg.norm(np.cross(a, b)) <= tol

    if kind in ('coaxial', 'coplanar', 'contact'):
        a, b = (e['direction'] for e in elements)
        delta = points[1] - points[0]
        if not parallel(a, b):
            return False
        return parallel(delta, a) if kind == 'coaxial' else abs(delta @ a) <= tol
    if kind == 'offset':
        for e in elements:
            if e['kind'] == 'plane' and not parallel(e['direction'], direction):
                return False
            if e['kind'] == 'axis' and abs(direction @ e['direction']) > tol:
                return False
        return abs((points[1]-points[0]) @ direction - relation['value']) <= tol
    if kind == 'tangent':
        normal = elements[1]['direction']
        return (abs(np.dot(first['direction'], normal)) <= tol and
                abs(abs((points[1]-points[0]) @ normal) - first['radius']) <= tol)
    if kind == 'centered':
        return (all(parallel(e['direction'], direction) for e in elements)
                and abs((points[0]+points[1]-points[2]-points[3]) @ direction)/2 <= tol)
    if kind == 'positive_side':
        return (points[1]-points[0]) @ direction > tol
    if kind == 'radial_alignment':
        axis = np.asarray(first['direction'])
        low = direction - (direction @ axis)*axis
        length = np.linalg.norm(low)
        if length <= tol:
            return False
        low /= length
        radial = points[1:] - points[0]
        radial -= np.outer(radial @ axis, axis)
        return (parallel(elements[1]['direction'], low) and parallel(elements[2]['direction'], axis)
                and all(v @ low > tol and parallel(v, low) for v in radial))
    if kind == 'coincident':
        return all(np.linalg.norm(p-points[0]) <= tol for p in points[1:])
    if kind == 'parallel':
        return parallel(first['direction'], direction)
    if kind == 'angle':
        cosine = np.clip(direction @ first['direction'], -1, 1)
        return abs(np.degrees(np.arccos(cosine)) - relation['value']) <= tol
    if kind == 'frame_axis':
        return np.linalg.norm(first['axes']['XYZ'.index(relation['axis'])] - direction) <= tol
    if kind == 'aligned_frames':
        return np.allclose(first['axes'], elements[1]['axes'], atol=tol, rtol=0)
    raise ValueError(f'未知装配关系 {kind}')


def freeze_dimensions(dimensions, start=0):
    """在规格分页前按 HEAD 顺序固定 _id；只增加私有字段，返回末号。"""
    for number, dimension in enumerate(dimensions, start+1):
        dimension['_id'] = f'D{number}'
        dimension.setdefault('source_feature', None)
        dimension.setdefault('covers_features', [])
        dimension.setdefault('_witness_3d', None)
    return start+len(dimensions)


def ensure_dimension_ids(spec):
    """旧规格仅在全部无编号时补号；已有编号不随新页序重编号。"""
    dimensions = [d for sheet in spec['sheets'] for d in sheet.get('dimensions', [])]
    if not any(d.get('_id') for d in dimensions):
        freeze_dimensions(dimensions)
    ids = [d.get('_id') for d in dimensions]
    if set(ids) != {f'D{i}' for i in range(1, len(ids)+1)} or len(ids) != len(set(ids)):
        raise ValueError('尺寸 _id 必须完整、唯一，且保留原 D 目录')
    return dimensions


def make_sheet_spec(template, candidates, dimensions, *, projection_views=()):
    """D 包把一页内容转换为旧规格；候选的几何字段为权威，spec 仅存显示配置。

    输出自带稳定 view_key 和私有 _definition；原始模板不会被修改。
    """
    sheet = copy.deepcopy(template)
    candidates = [normalize_candidate(v) for v in candidates]
    projection_views = [normalize_candidate(v) for v in projection_views]
    names = {v['view_key']: v['spec'].get('name', v.get('name')) for v in candidates + projection_views}
    drawn_keys = {v['view_key'] for v in candidates}

    def view_spec(candidate):
        spec = copy.deepcopy(candidate['spec'])
        spec.pop('view_role', None)
        spec['view_key'] = candidate['view_key']
        spec['parent_key'] = candidate.get('parent_key')
        spec['_candidate'] = copy.deepcopy(candidate)
        for field in CANDIDATE_PRIVATE_FIELDS:
            if field in candidate:
                spec[field] = copy.deepcopy(candidate[field])
        spec['_definition'] = {k: copy.deepcopy(candidate[k]) for k in VIEW_DEFINITION_FIELDS if k in candidate}
        if candidate.get('parent_key') in names:
            parent = names[candidate['parent_key']]
            spec['parent'] = parent
            if spec.get('section'):
                spec['section']['parent'] = parent
            if spec['_definition'].get('detail'):
                spec['_definition']['detail']['parent'] = parent
        return spec

    sheet['views'] = [view_spec(v) for v in candidates]
    if projection_views:
        sheet['projection_views'] = [view_spec(v) for v in projection_views]
    if sheet.get('frame', 'part') == 'part':
        parts = list(dict.fromkeys(str(n) for v in candidates for n in (v.get('parts') or [v.get('part')]) if n is not None))
        if parts:
            sheet['parts'] = parts
            sheet['part'] = parts[0] if len(parts) == 1 else None
    sheet['dimensions'] = []
    for dimension in dimensions:
        dimension = copy.deepcopy(dimension)
        if dimension.get('view_key') not in drawn_keys:
            raise ValueError(f"{dimension['_id']} 的 view_key 不属于该页")
        dimension['view'] = names[dimension['view_key']]
        sheet['dimensions'].append(dimension)
    return sheet


def complete_projection_dependencies(sheet, candidates):
    """补足仅供投影的父图闭包，绝不把依赖加进实际绘制的 views。"""
    sheet = copy.deepcopy(sheet)
    by_key = {v['view_key']: normalize_candidate(v) for v in candidates}
    present = {v.get('view_key'): v for v in sheet.get('views', []) + sheet.get('projection_views', [])
               if v.get('view_key')}
    visiting, complete = set(), set()
    dependencies = list(sheet.get('projection_views', []))

    def add(key):
        if key in complete:
            return
        if key in visiting:
            raise ValueError('候选父图引用成环')
        visiting.add(key)
        view = present.get(key)
        candidate = (view or {}).get('_candidate') or by_key.get(key, {})
        parent = (view or {}).get('parent_key') or candidate.get('parent_key')
        if parent:
            if parent not in present:
                if parent not in by_key:
                    raise ValueError(f'找不到投影依赖父图 {parent}')
                parent_spec = make_sheet_spec({}, [by_key[parent]], [])['views'][0]
                present[parent] = parent_spec
                dependencies.append(parent_spec)
            add(parent)
        visiting.remove(key)
        complete.add(key)
    for view in sheet.get('views', []):
        if view.get('view_key'):
            add(view['view_key'])
    if dependencies:
        sheet['projection_views'] = dependencies
    return sheet


def assert_reference(path, description):
    """与原 save() 的 UTF-8 文本、换行字节逐字比较；不重写已有参考答案。"""
    expected = (json.dumps(description, ensure_ascii=False, indent=2)+'\n').replace('\n', os.linesep).encode('utf-8')
    actual = Path(path).read_bytes()
    assert actual == expected, f'参考答案逐字不一致：{path}'
    return actual


def sandbox_directory(out_dir):
    """拒绝源程序/参考答案/公开目录及其父目录，避免沙箱覆盖正式材料。"""
    out = Path(out_dir).resolve()
    for protected in (HERE, PUBLIC):
        if out.is_relative_to(protected) or protected.is_relative_to(out):
            raise ValueError(f'沙箱目录不能覆盖正式材料：{out}')
    out.mkdir(parents=True, exist_ok=True)
    return out


def thumbnails(inputs, out_dir, long_edges=(1300, 2300)):
    """整页等比 LANCZOS 缩小，不裁剪；在 1300/2300 子目录保留相对路径。"""
    from PIL import Image
    out = sandbox_directory(out_dir)
    written = []
    for source in inputs:
        source = Path(source)
        paths = sorted(source.rglob('*.png')) if source.is_dir() else [source]
        for path in paths:
            if path.resolve().is_relative_to(out):
                continue
            for edge in long_edges:
                target = out / str(edge) / (path.relative_to(source) if source.is_dir() else Path(path.name))
                with Image.open(path) as image:
                    factor = min(1., edge/max(image.size))
                    size = tuple(max(1, round(n*factor)) for n in image.size)
                    preview = image.resize(size, Image.Resampling.LANCZOS)
                    target.parent.mkdir(parents=True, exist_ok=True)
                    preview.save(target)
                written.append(target)
    return written


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    parser = argparse.ArgumentParser(description='整页 PNG 缩图（无裁剪）')
    parser.add_argument('--thumbnails', nargs='+', required=True, help='整页 PNG 或目录')
    parser.add_argument('--out', required=True)
    args = parser.parse_args()
    for path in thumbnails(args.thumbnails, args.out):
        print(path)



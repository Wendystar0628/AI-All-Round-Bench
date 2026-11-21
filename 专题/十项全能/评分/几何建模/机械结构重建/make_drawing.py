"""出图程序：参考建模描述 + 出图规格 → 240 dpi工程图PNG、公开尺寸/视图JSON与出题端私有图线JSON。

用法：
  python make_drawing.py 出图规格/01.json                    # 参考描述默认取 参考答案/第01题.json
  python make_drawing.py 出图规格/01.json --ref X.json --out 输出目录 --dpi 200
  python make_drawing.py --all                                # 出图规格/ 下全部
  python make_drawing.py --sandbox 08 --out 调研沙箱目录         # 单题隔离出图
  python make_drawing.py --freeze-samples --out 样例目录         # 五题 HEAD 冻结样例
出图规格的写法见本目录 README.md。输出默认写到 专题/十项全能/题面/几何建模/机械结构重建/<题号>/。
"""
import argparse
import copy
import json
import math
import re
import sys
import subprocess
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
PUBLIC = HERE.parents[2] / "题面" / "几何建模" / "机械结构重建"
sys.path.insert(0, str(PUBLIC / "工具"))
from drawkit import geom2d as g2  # noqa: E402
from drawkit import model, project, render  # noqa: E402

BASIC = {
    "front": ("主视图", (0, 1, 0), (1, 0, 0), (0, 0, 1), (1, 1)),
    "top": ("俯视图", (0, 0, -1), (1, 0, 0), (0, 1, 0), (2, 1)),
    "left": ("左视图", (1, 0, 0), (0, -1, 0), (0, 0, 1), (1, 2)),
    "right": ("右视图", (-1, 0, 0), (0, 1, 0), (0, 0, 1), (1, 0)),
    "bottom": ("仰视图", (0, 0, 1), (1, 0, 0), (0, -1, 0), (0, 1)),
    "rear": ("后视图", (0, -1, 0), (-1, 0, 0), (0, 0, 1), (1, 3)),
}
from drawing_common import (PAPERS, SCALES, DIM_H, LABEL_H, ARROW, EXT_GAP, EXT_OVER,
                            LEVEL0, LEVEL_STEP, VIEW_GAP, TB_W, TB_H, PL_ROW, ROMAN, HATCH_STYLES)
from drawing_common import box_union, box_pts, box_overlap, text_box, Occupancy, Marks, round_any, Stack, view_extent
import drawing_common
import drawing_views
import drawing_sections
import drawing_dimensions
import drawing_layout


class SpecError(Exception):
    pass


WARN = []


def warn(msg):
    WARN.append(msg)


def flush_warnings():
    seen = []
    for m in WARN:
        if m not in seen:
            seen.append(m)
            print("警告：" + m)
    WARN.clear()


def scale_text(s):
    if s >= 1:
        return f"{model.fmt(s)}:1"
    return f"1:{model.fmt(1 / s)}"


# ---------------------------------------------------------------- 小工具

# ---------------------------------------------------------------- 视图解析

class View:
    def __init__(self, spec, index):
        self.spec = spec
        self.index = index
        self.kind = spec.get("type")
        self.name = None
        self.vdef = None
        self.grid = None
        self.parent = spec.get("parent")
        self.scale = None
        self.geom = None
        self.dims = []
        self.marks = Marks()
        self.extra_lines = []
        self.box_geom = None
        self.paper_origin = None
        self.view_key = spec.get('view_key')
        self.candidate = spec.get('_candidate')
        self.parent_key = spec.get('parent_key', (self.candidate or {}).get('parent_key'))
        self.source_key = spec.get('source_key', (self.candidate or {}).get('source_key'))
        self.source_reference = spec.get('_source_reference')
        self.section_references = spec.get('section_references', (self.candidate or {}).get('section_references', []))
        self.auxiliary_references = spec.get('auxiliary_references', (self.candidate or {}).get('auxiliary_references', []))
        if self.section_references:
            # B.section_marks 读取 candidate；D 试排也允许只在纸面 spec 上给引用。
            self.candidate = dict(self.candidate or {}, section_references=self.section_references)


def resolve_views(sheet, part_names, *, check_names=True):
    views = []
    letters_used = set()
    for i, spec in enumerate(sheet.get("views", [])):
        v = View(spec, i)
        t = v.kind
        parts = spec.get("parts") or part_names
        if t in BASIC:
            name, d, u, vv, grid = BASIC[t]
            sec = spec.get("section")
            v.grid = None if (spec.get("at") or spec.get("free")) else grid
            vdef = {"kind": "basic", "direction": list(d), "u": list(u), "v": list(vv), "origin": [0, 0, 0],
                    "parts": parts, "hidden": spec.get("hidden", not sec), "section": None, "keep": spec.get("keep")}
            v.letter = None
            if sec:
                name = apply_section(v, vdef, sec, name)
            v.name = spec.get("name", name)
            v.vdef = vdef
        elif t == "auxiliary":
            d = np.asarray(spec["direction"], float)
            d /= np.linalg.norm(d)
            u, vv = project.frame_axes(d, spec.get("up", [0, 0, 1]))
            v.letter = spec.get("label", spec.get("name"))
            name = v.letter
            v.vdef = {"kind": "auxiliary", "direction": list(d), "u": list(u), "v": list(vv), "origin": [0, 0, 0],
                      "parts": parts, "hidden": spec.get("hidden", False), "section": None, "keep": spec.get("keep")}
            if spec.get("section"):
                name = apply_section(v, v.vdef, spec["section"], name)
            v.name = spec.get("name", name)
        elif t == "removed_section":
            d = np.asarray(spec["normal"], float)
            d /= np.linalg.norm(d)
            u, vv = project.frame_axes(d, spec.get("up", [0, 0, 1]))
            v.letter = spec.get("label")
            v.name = spec.get("name", f"{v.letter}-{v.letter}" if v.letter else "断面")
            v.vdef = {"kind": "removed_section", "direction": list(d), "u": list(u), "v": list(vv),
                      "origin": [0, 0, 0], "parts": parts, "hidden": False,
                      "section": {"point": spec["point"], "mode": "removed"}}
        elif t == "detail":
            v.letter = spec.get("label")
            v.name = spec.get("name", v.letter or "局部放大图")
            v.vdef = {"kind": "detail", "parts": parts,
                      "detail": {"parent": spec["parent"], "center": spec["center"], "r": spec["r"]}}
        else:
            raise SpecError(f"未知视图类型 {t}")
        if spec.get('_definition'):
            v.vdef = copy.deepcopy(spec['_definition'])
            v.vdef['parts'] = v.vdef.get('parts') or parts
        for key in ('witness_elements', '_a_features'):
            if key in spec:
                v.vdef[key] = copy.deepcopy(spec[key])
        views.append(v)
    names = [v.name for v in views]
    if check_names and len(set(names)) != len(names):
        raise SpecError(f"视图名称重复：{names}")
    # 局部放大图编号
    k = 0
    for v in views:
        if v.kind == "detail" and not v.letter:
            v.letter = ROMAN[k]
            v.name = v.spec.get("name", v.letter)
            k += 1
    return views


def restore_assembly_witnesses(spec, description):
    """给本题未规划的旧规格恢复同一原始尺寸的身份。自定义零件或不同尺寸不能借用见证。"""
    missing = [d for sheet in spec['sheets'] if sheet.get('frame') == 'assembly'
               for d in sheet.get('dimensions', []) if not d.get('_witness_3d')]
    if not missing or spec['problem'] not in ('01', '02', '22', '23', '24', '25'):
        return
    from advanced_parts import problem_data
    data = problem_data(spec['problem'])
    if data['description']['parts'] != description['parts']:
        return
    originals = {d['_id']: d for sheet in data['spec']['sheets'] if sheet.get('frame') == 'assembly'
                 for d in sheet['dimensions']}
    for target in missing:
        source = originals.get(target['_id'])
        if source and all(source.get(k) == target.get(k) for k in ('type','text','value','category')):
            for key in ('source_part','source_feature','covers_features','_witness_3d'):
                target[key] = copy.deepcopy(source[key])


def plan_problem(spec, description):
    """运行 A→B→C→D 接缝；只增加私有元数据，默认重建 HEAD 原页序。"""
    spec = copy.deepcopy(spec)
    for index, sheet in enumerate(spec['sheets'], 1):
        sheet.setdefault('id', spec['problem'] if len(spec['sheets']) == 1 else f"{spec['problem']}-{index}")
    dimensions = drawing_common.ensure_dimension_ids(spec)
    restore_assembly_witnesses(spec, description)
    for sheet in spec['sheets']:
        for dimension in sheet.get('dimensions', []):
            dimension['_head_sheet'] = sheet['id']
    context = dict(problem=spec['problem'], title=spec.get('title', ''),
                   parts=description['parts'], dimensions=dimensions, head_sheets=spec['sheets'], dimension_audit=[],
                   layout_capabilities={'source_references': True})
    # C 可以按需查看候选投影，D 可以在正式分页前取得 C 的尺寸范围。
    # 默认空包不调用这两个回调，因此仍走原 HEAD 的一次建模/出图路径。
    planning_model = None
    final_edge_service = None
    candidates = []

    def get_planning_model():
        nonlocal planning_model
        if planning_model is None:
            planning_model = model.build(description)
            for part in planning_model.parts:
                if part.error:
                    raise SpecError(f"参考描述生成失败：{part.error}")
        return planning_model

    def project_candidate(candidate, scale=1.):
        sheet = drawing_common.make_sheet_spec(dict(frame=candidate['frame'], part=candidate.get('part')), [candidate], [])
        sheet = drawing_common.complete_projection_dependencies(sheet, candidates)
        shapes, names = sheet_shapes(get_planning_model(), sheet)
        views, dependencies = projection_views(sheet, names)
        project_all(views + dependencies, shapes, scale)
        view = next(v for v in views if v.view_key == candidate['view_key'])
        elements = final_edge_witnesses(dict(candidate, **view.vdef), view.geom)
        if elements:
            return dict(view.geom, witness_elements=list(view.geom.get('witness_elements', []))+elements)
        return view.geom

    def final_edge_witnesses(candidate, projection=None):
        nonlocal final_edge_service
        if projection is None:
            projected = project_candidate(candidate)
            return [element for element in projected.get('witness_elements', [])
                if isinstance(element.get('provenance'), dict) and
                element['provenance'].get('method') == 'occt_generated_face_final_edge_visible_hlr']
        if final_edge_service is None:
            final_edge_service = drawing_common.FinalEdgeWitnesses(get_planning_model(), description)
            context['final_edge_audit'] = final_edge_service.audit
        return final_edge_service.prove(candidate, projection)

    def measure_sheet(sheet, scale):
        sheet = drawing_common.complete_projection_dependencies(sheet, candidates)
        _apply_drawing_style(sheet.get('paper', 'A3'))
        return compose(sheet, get_planning_model(), scale, 1, 1, spec['problem'], spec.get('title', ''))

    context['project_candidate'] = project_candidate
    context['measure_sheet'] = measure_sheet
    context['final_edge_witnesses'] = final_edge_witnesses

    def head_candidates():
        candidates = []
        for sheet in spec['sheets']:
            all_names = [str(p.get('name', i)) for i, p in enumerate(description['parts'], 1)]
            names = sheet.get('parts') or (all_names if sheet.get('frame', 'part') == 'assembly'
                                           else [sheet.get('part') or all_names[0]])
            views = resolve_views(sheet, names)
            keys = {v.name: v.spec.get('view_key', f"{sheet['id']}:v{v.index+1}") for v in views}
            for view in views:
                definition = copy.deepcopy(view.vdef)
                if view.kind == 'detail':
                    parent = view_by_name(views, view.parent)
                    definition.update({k: copy.deepcopy(parent.vdef[k]) for k in ('direction', 'u', 'v', 'origin')})
                candidate = dict(definition, view_key=keys[view.name], name=view.name,
                    part=(view.vdef['parts'][0] if sheet.get('frame', 'part') == 'part' and len(view.vdef['parts']) == 1 else None),
                    frame=sheet.get('frame', 'part'), parent_key=keys.get(view.parent),
                    expresses=[], spec=copy.deepcopy(view.spec), _head_sheet=sheet['id'])
                for field in drawing_common.CANDIDATE_PRIVATE_FIELDS + ('view_role',):
                    if field in view.spec:
                        candidate[field] = copy.deepcopy(view.spec[field])
                candidates.append(candidate)
        return candidates

    candidates = [drawing_common.normalize_candidate(v) for v in drawing_views.plan_views(context, legacy=head_candidates)]
    candidates = [drawing_common.normalize_candidate(v) for v in drawing_sections.plan_sections(candidates, context=context)]
    context['candidates'] = candidates
    keys = [v['view_key'] for v in candidates]
    if len(set(keys)) != len(keys):
        raise SpecError('候选 view_key 重复')

    def head_assignments():
        by_name = {(v['_head_sheet'], v['name']): v['view_key'] for v in candidates}
        return [dict(d, view_key=by_name[(d['_head_sheet'], d['view'])]) for d in dimensions]

    original = {d['_id']: copy.deepcopy(d) for d in dimensions}
    try:
        assigned = drawing_dimensions.assign_dimensions(dimensions, candidates, context=context, legacy=head_assignments)
    except ValueError as error:
        if isinstance(error, drawing_common.DimensionAssignmentError) or (
                type(error).__name__ == 'DimensionAssignmentError' and
                all(hasattr(error, field) for field in ('unresolved', 'assignments', 'audit'))):
            context['dimension_audit'] = error.audit
            error.context = context
        raise
    if len(assigned) != len(original) or {d['_id'] for d in assigned} != set(original):
        raise SpecError('每个原 D 必须恰好归属一次')
    for dimension in assigned:
        if dimension.get('view_key') not in keys:
            raise SpecError(f"{dimension['_id']} 未归属有效候选视图")
        for field in ('value', 'category', 'source_part', 'source_feature', 'covers_features', '_witness_3d'):
            if dimension.get(field) != original[dimension['_id']].get(field):
                raise SpecError(f"{dimension['_id']} 改动了原尺寸 {field}")

    def head_sheets():
        return [drawing_common.make_sheet_spec(sheet,
                    [v for v in candidates if v['_head_sheet'] == sheet['id']],
                    [d for d in assigned if d['_head_sheet'] == sheet['id']]) for sheet in spec['sheets']]

    spec['sheets'] = drawing_layout.plan_sheets(candidates, assigned, context=context, legacy=head_sheets)
    spec['sheets'] = [drawing_common.complete_projection_dependencies(sheet, candidates) for sheet in spec['sheets']]
    emitted = [d['_id'] for sheet in spec['sheets'] for d in sheet.get('dimensions', [])]
    if len(emitted) != len(original) or set(emitted) != set(original):
        raise SpecError('分页后原 D 目录不完整或重复')
    for sheet in spec['sheets']:
        drawn_keys = {v.get('view_key') for v in sheet.get('views', [])}
        for dimension in sheet.get('dimensions', []):
            if dimension.get('view_key') not in drawn_keys:
                raise SpecError(f"{dimension['_id']} 未归属本页实际绘制视图")
            for field in ('value', 'category', 'source_part', 'source_feature', 'covers_features', '_witness_3d'):
                if dimension.get(field) != original[dimension['_id']].get(field):
                    raise SpecError(f"分页改动了 {dimension['_id']} 的原尺寸 {field}")
    finalize_sheet_references(spec['sheets'], candidates)
    finalize_dimension_audit(spec, assigned, context)
    spec['_drawing_planned'] = True
    return spec, candidates, assigned


def finalize_sheet_references(sheets, candidates):
    """按最终页表回填来源、剖切追踪；投影父键与本页符号父图互不混用。"""
    by_key = {v['view_key']: v for v in candidates}
    locations = {}
    # 试排携带的页码可能随最后一次合页改变。按最终可见视图重建分页引用，
    # 保留 HEAD 手工指定的、没有目标页号的独立剖切标记。
    for candidate in candidates:
        candidate.pop('section_references', None)
    for index, sheet in enumerate(sheets, 1):
        if 'section_traces' in sheet:
            sheet['section_traces'] = [r for r in sheet['section_traces']
                                       if 'target_sheet' not in r and 'target_sheet_id' not in r]
        for view in sheet.get('views', []):
            view.pop('section_references', None)
            view.get('_candidate', {}).pop('section_references', None)
            view.pop('_source_reference', None)
            key = view.get('view_key')
            if not key:
                continue
            role = view.get('role', view.get('_candidate', {}).get('role'))
            previous = locations.get(key)
            if previous is None or (previous[3] == 'locator' and role != 'locator'):
                locations[key] = (index, sheet, view, role)

    def locate(key):
        seen = set()
        fallback = (None, None)
        while key and key not in seen:
            if key in locations:
                if locations[key][3] != 'locator':
                    return key, locations[key]
                if fallback[0] is None:
                    fallback = (key, locations[key])
            seen.add(key)
            key = by_key.get(key, {}).get('canonical_key')
        return fallback

    def append_reference(container, reference):
        references = container.setdefault('section_references', [])
        if reference not in references:
            references.append(copy.deepcopy(reference))

    for index, sheet in enumerate(sheets, 1):
        visible_keys = {v.get('view_key') for v in sheet.get('views', [])}
        for view in sheet.get('views', []):
            candidate = view.get('_candidate', {})
            parent_key = view.get('parent_key') or candidate.get('parent_key')
            explicit_source = view.get('source_key') or candidate.get('source_key')
            key, located = locate(explicit_source or parent_key)
            if parent_key and parent_key not in visible_keys:
                view['parent'] = None
                if view.get('section'):
                    view['section'].pop('parent', None)
            if view.get('role', candidate.get('role')) == 'locator':
                continue  # 定位副本不占用剖视结果的正式目标页。
            if not located:
                if explicit_source:
                    raise SpecError(f"{view.get('view_key')} 的定位来源 {explicit_source} 没有绘制在任何图页")
                continue
            source_index, source_sheet, source_view, _ = located
            if source_index == index and not explicit_source:
                continue
            if explicit_source and explicit_source not in visible_keys and key in visible_keys:
                view['source_key'] = key
            section = view.get('section') or view.get('_definition', {}).get('section')
            if source_index != index:
                view['_source_reference'] = dict(view_key=key, sheet_id=source_sheet['id'],
                    sheet_index=source_index, view=source_view.get('name', source_view.get('_candidate', {}).get('name')))
            if not section:
                continue
            if not view.get('section'):
                view['section'] = copy.deepcopy(section)
            view['section'].update(source_sheet=source_index, source_sheet_id=source_sheet['id'])
            if 'source_reference' in view['section']:
                if source_index != index:
                    view['section']['source_reference'] = f'剖切位置见第{source_index}张'
                else:
                    view['section'].pop('source_reference')
            for original in (candidate, by_key.get(view.get('view_key'))):
                if original is not None:
                    display = original.setdefault('spec', {})
                    if not display.get('section'):
                        display['section'] = copy.deepcopy(section)
                    display['section'].update(source_sheet=source_index, source_sheet_id=source_sheet['id'])
            label = view['section'].get('label') or view.get('label')
            if not label:
                continue
            definition = view.get('_definition', candidate)
            cut = definition.get('section') or section
            reference = dict(label=label, point=copy.deepcopy(cut['point']),
                direction=copy.deepcopy(definition['direction']), target_sheet=index,
                target_sheet_id=sheet['id'])
            append_reference(source_view, reference)
            append_reference(source_view.setdefault('_candidate', {}), reference)
            if key in by_key:
                append_reference(by_key[key], reference)
            if source_index != index:
                trace = dict(parent=source_view.get('name', source_view['_candidate'].get('name')),
                    parent_key=key, **reference)
                traces = source_sheet.setdefault('section_traces', [])
                identity = lambda r: (r.get('parent_key', r.get('parent')), r.get('label'),
                    json.dumps(r.get('point')), json.dumps(r.get('direction')))
                if not any(identity(old) == identity(trace) for old in traces):
                    traces.append(trace)


def finalize_dimension_audit(spec, assignments, context):
    """只在最终分页成功后写实际 sheet.id，不用原 _head_sheet 代替。"""
    locations = {}
    for index, sheet in enumerate(spec['sheets'], 1):
        names = {v.get('view_key'): v.get('name', v.get('_candidate', {}).get('name'))
                 for v in sheet.get('views', [])}
        for dimension in sheet.get('dimensions', []):
            locations[dimension['_id']] = dict(sheet_id=sheet['id'], sheet_index=index,
                view_key=dimension.get('view_key'), view=names.get(dimension.get('view_key'), dimension.get('view')))
    audit = context.get('dimension_audit', [])
    records = drawing_common.backfill_dimension_audit(audit, locations)
    if audit:
        spec['_dimension_audit'] = copy.deepcopy(audit)
    for dimension in assignments + [d for s in spec['sheets'] for d in s.get('dimensions', [])]:
        identity = dimension['_id']
        if '_dimension_audit' in dimension:
            drawing_common.backfill_dimension_audit(dimension['_dimension_audit'], locations, identity)
        elif identity in records:
            found = records[identity]
            dimension['_dimension_audit'] = copy.deepcopy(found[0] if len(found) == 1 else found)


def apply_section(v, vdef, sec, name):
    mode = sec.get("mode", "full")
    letter = sec.get("label")
    s2 = {"point": sec.get("point", [0, 0, 0]), "mode": mode}
    if mode == "half":
        s2["half"] = sec["half"]
    if mode == "local":
        s2["region"] = sec["region"]
    for key in ("unsectioned", "no_hatch", "_no_hatch_parts"):
        if sec.get(key):
            s2[key] = sec[key]
    vdef["section"] = s2
    if "hidden" not in v.spec:
        vdef["hidden"] = False
    if letter and mode != "local":
        name = f"{letter}-{letter}"
    v.parent = sec.get("parent")
    v.letter = letter
    return name


def view_by_name(views, name):
    for v in views:
        if v.name == name:
            return v
    raise SpecError(f"找不到视图 {name}")


_PROJECT_CACHE = {}


def projection_views(sheet, part_names):
    """实际绘制列表与仅供父投影依赖的列表分开解析，均用稳定键寻父图。"""
    visible = resolve_views(sheet, part_names)
    dependencies = resolve_views(dict(sheet, views=sheet.get('projection_views', [])), part_names, check_names=False)
    keys = [v.view_key for v in visible + dependencies if v.view_key]
    if len(keys) != len(set(keys)):
        raise SpecError('同一页的绘制图与投影依赖 view_key 重复')
    return visible, dependencies


def parent_view(views, view):
    if view.parent_key:
        return next((v for v in views if v.view_key == view.parent_key), None)
    name = view.parent or (view.vdef.get('detail') or {}).get('parent')
    return next((v for v in views if v.name == name), None) if name else None


def annotation_parent_view(views, view):
    if view.source_key:
        return next((v for v in views if v.view_key == view.source_key), None)
    return parent_view(views, view)


def part_no_hatch(geometry, definition):
    """B 的纵剖肋免剖区域仅作用于对应零件，不修改公开内核或参考实体。"""
    regions = (definition.get('section') or {}).get('_no_hatch_parts')
    if not regions:
        return geometry
    geometry = dict(geometry, hatches=copy.deepcopy(geometry['hatches']))
    extra = []
    for name, polygons in regions.items():
        hatches = [h for h in geometry['hatches'] if h['part'] == str(name)]
        if hatches:
            pending = [poly for poly in polygons if not all(
                {'shape':'polygon','points':poly} in h.get('exclude',[]) for h in hatches)]
            extra.extend(project.rib_lines({'no_hatch': pending}, hatches))
    if definition.get('keep'):
        extra = g2.clip_all(extra, definition['keep'])
    geometry['lines'] = list(geometry['lines']) + extra
    return geometry


def project_all(views, shapes, scale):
    complete, active = set(), set()

    def project_one(v):
        identity = id(v)
        if identity in complete:
            return
        if identity in active:
            raise SpecError('候选父图引用成环')
        active.add(identity)
        v.scale = float(v.spec.get("scale", scale))
        if v.kind == 'detail':
            parent = parent_view(views, v)
            if parent is None:
                raise SpecError(f'局部放大图 {v.name} 缺少投影父图')
            project_one(parent)
            v.vdef.update({k: parent.vdef[k] for k in ('direction', 'u', 'v', 'origin')})
            v.vdef['parent_definition'] = copy.deepcopy(parent.vdef)
            v.vdef['scale'] = v.scale
            v.geom = drawing_views.project_external_view(shapes, v.vdef, parent=parent.geom,
                legacy=lambda: project.project_view(shapes, v.vdef, parent=parent.geom))
            complete.add(identity)
            active.remove(identity)
            return
        v.vdef["scale"] = v.scale
        key=(tuple((n,hash(s)) for n,s in shapes.items()),json.dumps(v.vdef,sort_keys=True))
        if key not in _PROJECT_CACHE:
            callback = drawing_sections.project_section if v.vdef.get('section') else drawing_views.project_external_view
            projected=callback(shapes,v.vdef,legacy=lambda: project.project_view(shapes,v.vdef))
            if 'witness_elements' in v.vdef and 'witness_elements' not in projected:
                projected=dict(projected,witness_elements=copy.deepcopy(v.vdef['witness_elements']))
            _PROJECT_CACHE[key]=part_no_hatch(projected, v.vdef)
        v.geom = _PROJECT_CACHE[key]
        complete.add(identity)
        active.remove(identity)
    for view in views:
        project_one(view)


# ---------------------------------------------------------------- 尺寸

def drawn_points(view, step=0.5):
    curves = list(view.geom["lines"])
    # 补充中心线也可作为尺寸基准，且与图纸导出的中心线一致。
    for mark in view.marks.items:
        if mark.get("role") == "centerline" and mark.get("kind") == "curve":
            curves.append(g2.xform(mark["curve"], 1 / view.scale, (0, 0)))
    pts = [g2.sample(c, step) for c in curves]
    return np.concatenate(pts) if pts else np.zeros((0, 2))


def check_point(view, p, what):
    from scipy.spatial import cKDTree
    if not hasattr(view, "_tree"):
        pts = drawn_points(view, 0.05)
        view._tree = cKDTree(pts) if len(pts) else None
    if view._tree is None:
        return
    d, _ = view._tree.query(p)
    if d > 0.05:
        WARN.append(f"{view.name} 的尺寸 {what} 端点 ({model.fmt(p[0])}, {model.fmt(p[1])}) 不在图线上（最近 {d:.2f}）")


def dim_text(spec, value, default_prefix=""):
    if "text" in spec:
        text = str(spec["text"])
    else:
        text = f"{spec.get('prefix', default_prefix)}{model.fmt(value)}{spec.get('suffix', '')}"
    if spec.get("reference"):
        text = f"({text})"
    return (f"〔{spec['_id']}〕 " if spec.get("_id") else "") + text


def linear_dims(view, specs, s):
    """线性尺寸：自动分道排布在视图轮廓外侧（剖切符号、箭头之外）。"""
    gb = view.box_geom
    outer = gb
    for m in view.marks.items:
        if m.get("role") in ("section", "aux", "origin"):
            mb = Marks()
            mb.items = []
            if m["kind"] == "curve":
                outer = box_union(outer, g2.bounds([m["curve"]]))
            elif m["kind"] == "text":
                outer = box_union(outer, text_box(m["text"], m["at"], m["height"], m["anchor"], m["angle"]))
    stack = Stack()
    jobs = []
    for spec in specs:
        p1, p2 = np.asarray(spec["from"], float), np.asarray(spec["to"], float)
        if spec.get("snap"):
            ax = 0 if spec["dir"] == "h" else 1
            samples=[g2.sample(c,0.15) for c in view.geom["lines"]]
            def witness(p):
                candidates=[]
                for pts in samples:
                    for a,b in zip(pts,pts[1:]):
                        da,db=a[ax]-p[ax],b[ax]-p[ax]
                        if abs(da)<1e-6:candidates.append(a)
                        if da*db<0:candidates.append(a+(b-a)*(-da)/(db-da))
                    if len(pts) and abs(pts[-1,ax]-p[ax])<1e-6:candidates.append(pts[-1])
                # 理论交线因倒圆消失时，保留辅助尺寸界线的理论位置。
                return min(candidates,key=lambda q:np.linalg.norm(q-p)) if candidates else p
            p1,p2=witness(p1),witness(p2)
        check_point(view, p1, spec.get("text", f"{model.fmt(abs(p2[0]-p1[0]))}/{model.fmt(abs(p2[1]-p1[1]))}"))
        check_point(view, p2, spec.get("text", f"{model.fmt(abs(p2[0]-p1[0]))}/{model.fmt(abs(p2[1]-p1[1]))}"))
        d = spec.get("dir")
        if d is None:
            side0 = spec.get("side")
            if side0 in ("top", "bottom"):
                d = "h"
            elif side0 in ("left", "right"):
                d = "v"
            else:
                d = "h" if abs(p1[1] - p2[1]) < 1e-9 else "v" if abs(p1[0] - p2[0]) < 1e-9 else "a"
        value = abs(p2[0] - p1[0]) if d == "h" else abs(p2[1] - p1[1]) if d == "v" else float(np.linalg.norm(p2 - p1))
        text = dim_text(spec, value)
        q1, q2 = p1 * s, p2 * s
        if d == "a":
            aligned_dim(view, spec, q1, q2, text, value)
            continue
        side = spec.get("side")
        if side is None:
            if d == "h":
                side = "top" if (gb[3] - max(q1[1], q2[1])) < (min(q1[1], q2[1]) - gb[1]) else "bottom"
            else:
                side = "right" if (gb[2] - max(q1[0], q2[0])) < (min(q1[0], q2[0]) - gb[0]) else "left"
        if (d == "h") != (side in ("top", "bottom")):
            raise SpecError(f"{view.name} 尺寸 {text}：dir={d} 与 side={side} 不匹配")
        ax = 0 if d == "h" else 1
        span = abs(q2[ax] - q1[ax])
        jobs.append((span, spec, q1, q2, d, side, text, value))
    jobs.sort(key=lambda j: j[0])
    for span, spec, q1, q2, d, side, text, value in jobs:
        ax = 0 if d == "h" else 1
        a, b = sorted((q1[ax], q2[ax]))
        tw, _ = render.text_extent(text, DIM_H)
        inside = b - a >= tw + 2 * ARROW + 1.5
        arrows_in = b - a >= 2 * ARROW + 1.0
        lo, hi = a, b
        if not inside:
            hi = b + (ARROW + 2 if not arrows_in else 1) + tw + 1
            lo = a - (ARROW + 2 if not arrows_in else 1) - tw - 1
        if not arrows_in:
            lo = min(lo, a - ARROW - 2)
        sgn = 1 if side in ("top", "right") else -1
        edge = (outer[3] if side == "top" else outer[1]) if d == "h" else (outer[2] if side == "right" else outer[0])
        if "offset" in spec:
            far = max(q1[1 - ax], q2[1 - ax]) if sgn > 0 else min(q1[1 - ax], q2[1 - ax])
            pos = far + sgn * float(spec["offset"])
        else:
            k = stack.place(side, lo, hi)
            pos = edge + sgn * (LEVEL0 + LEVEL_STEP * k)
        P = (lambda t, n: (t, n)) if d == "h" else (lambda t, n: (n, t))
        occ = view.occ
        # 文字位置：先居中，压线时沿尺寸线挪动或移到尺寸界线外
        if d == "h":
            tbox = lambda tc: text_box(text, (tc, pos + 0.8), DIM_H, "mb")
        else:
            tbox = lambda tc: text_box(text, (pos - 0.8, tc), DIM_H, "mb", 90)
        mid = (a + b) / 2
        out_gap = (ARROW + 2 if not arrows_in else 1) + tw / 2 + 0.5
        cands = []
        if inside:
            lim = (b - a) / 2 - ARROW - tw / 2 - 0.5
            k = 0.0
            while k <= lim + 1e-9:
                cands += [(mid + k, k * 0.01), (mid - k, k * 0.01)] if k else [(mid, 0.0)]
                k += 1.0
        cands += [(b + out_gap, 3.0), (a - out_gap, 3.2)]
        best = min(cands, key=lambda c_: occ.cost(tbox(c_[0])) + c_[1])
        tc = best[0]
        m = Marks(occ)
        for q in (q1, q2):
            start = q[1 - ax] + sgn * EXT_GAP
            if (pos - start) * sgn > 0:
                m.line(P(q[ax], start), P(q[ax], pos + sgn * EXT_OVER))
        if arrows_in:
            m.line(P(a, pos), P(b, pos))
            m.arrow(P(a, pos), P(-1, 0) if d == "h" else (0, -1))
            m.arrow(P(b, pos), P(1, 0) if d == "h" else (0, 1))
        else:
            m.line(P(a - ARROW - 2, pos), P(b + ARROW + 2, pos))
            m.arrow(P(a, pos), P(1, 0) if d == "h" else (0, 1))
            m.arrow(P(b, pos), P(-1, 0) if d == "h" else (0, -1))
        if tc > b:
            m.line(P(b, pos), P(tc + tw / 2 + 0.5, pos))
        elif tc < a:
            m.line(P(tc - tw / 2 - 0.5, pos), P(a, pos))
        if d == "h":
            m.text(text, (tc, pos + 0.8), anchor="mb")
        else:
            m.text(text, (pos - 0.8, tc), anchor="mb", angle=90)
        view.dims.append({"reference": bool(spec.get("reference", False)), "type": "linear", "dir": d, "text": text, "value": round(value, 6),
                          "from": g2.P(q1 / s), "to": g2.P(q2 / s), "marks": m})


def aligned_dim(view, spec, q1, q2, text, value):
    e = (q2 - q1) / np.linalg.norm(q2 - q1)
    nrm = np.array([-e[1], e[0]])
    if spec.get("side", "left") == "right":
        nrm = -nrm
    off = float(spec.get("offset", 10.0))
    a1, a2 = q1 + nrm * off, q2 + nrm * off
    m = Marks(view.occ)
    m.line(q1 + nrm * EXT_GAP, a1 + nrm * EXT_OVER)
    m.line(q2 + nrm * EXT_GAP, a2 + nrm * EXT_OVER)
    m.line(a1, a2)
    m.arrow(a1, -e)
    m.arrow(a2, e)
    ang = math.degrees(math.atan2(e[1], e[0]))
    if ang > 90 + 1e-6:
        ang -= 180
    if ang <= -90 + 1e-6:
        ang += 180
    up = np.array([-math.sin(math.radians(ang)), math.cos(math.radians(ang))])
    mid = (a1 + a2) / 2
    if up @ nrm >= 0:
        m.text(text, mid + up * 0.8, anchor="mb", angle=ang)
    else:
        m.text(text, mid - up * 0.8, anchor="mt", angle=ang)
    view.dims.append({"reference": bool(spec.get("reference", False)), "type": "linear", "dir": "a", "text": text, "value": round(value, 6),
                      "from": g2.P(q1 / view.scale), "to": g2.P(q2 / view.scale), "marks": m})


def shoulder_ops(start, e, text_lines):
    """引出线末端的水平折线和文字：返回图元计划。"""
    sgn = 1 if e[0] >= 0 else -1
    tw = max(render.text_extent(t, DIM_H)[0] for t in text_lines)
    start = np.asarray(start, float)
    end = start + [sgn * (tw + 2), 0]
    cx = (start[0] + end[0]) / 2
    ops = [("line", start, end, True)]
    ops.append(("text", text_lines[0], (cx, start[1] + 0.8), "mb"))
    for i, t in enumerate(text_lines[1:]):
        ops.append(("text", t, (cx, start[1] - 0.8 - i * (DIM_H + 1.5)), "mt"))
    return ops


def plan_cost(occ, ops):
    cost = 0.0
    for op in ops:
        if op[0] == "line" and op[3]:
            cost += occ.line_cost(op[1], op[2]) + 100000 * occ.crosses_text(op[1], op[2])
        elif op[0] == "text":
            cost += 10000 * occ.cost(text_box(op[1], op[2], DIM_H, op[3]))
    return cost


def apply_ops(m, ops):
    for op in ops:
        if op[0] == "line":
            m.line(op[1], op[2])
        elif op[0] == "arrow":
            m.arrow(op[1], op[2])
        elif op[0] == "dot":
            m.dot(op[1])
        else:
            m.text(op[1], op[2], anchor=op[3])


ANGLE_TRIES = [0, 15, -15, 30, -30, 45, -45, 60, -60, 75, -75, 90, -90, 120, -120, 150, -150, 180]


def best_plan(occ, spec, make, base_angle, base_len):
    """在引线方向、长度上搜索不压线的布置；spec 写 "fixed": true 时不搜索。"""
    if spec.get("fixed"):
        return make(base_angle, base_len)
    best = None
    for da in ANGLE_TRIES:
        for j, extra in enumerate((0.0, 5.0, 10.0, 20.0, 35.0, 50.0, 70.0, 90.0)):
            ops = make(base_angle + da, base_len + extra)
            score = plan_cost(occ, ops) + 0.02 * abs(da) / 15 + 0.05 * j
            if spec.get('_avoid_box'):
                for op in ops:
                    if op[0]=='text' and box_overlap(text_box(op[1],op[2],DIM_H,op[3]),spec['_avoid_box'],3):
                        score+=1e12
            if best is None or score < best[0] - 1e-9:
                best = (score, ops)
        if best[0] < 0.05:
            break
    return best[1]


def circle_dim(view, spec, s, kind):
    if spec.get('avoid_box'):
        spec=dict(spec,_avoid_box=view.box_geom)
    c = np.asarray(spec["center"], float) * s
    if kind == "diameter":
        r = (spec["d"] / 2 if "d" in spec else spec["r"])
        value = 2 * r
        text = dim_text(spec, value, "Φ")
    else:
        r = spec["r"]
        value = r
        text = dim_text(spec, value, "R")
    rs = r * s

    def make(ang, lead):
        e = np.array([math.cos(math.radians(ang)), math.sin(math.radians(ang))])
        knee = c + e * (rs + lead)
        if kind == "diameter" and 2 * rs >= 12 and not spec.get("outside"):
            ops = [("line", c - e * rs, c + e * (rs + 1), False), ("line", c + e * (rs + 1), knee, True),
                   ("arrow", c + e * rs, e), ("arrow", c - e * rs, -e)]
        elif kind == "radius" and rs >= 8 and not spec.get("outside"):
            ops = [("line", c, c + e * (rs + 1), False), ("line", c + e * (rs + 1), knee, True),
                   ("arrow", c + e * rs, e)]
        else:
            ops = [("line", c + e * rs, c + e * (rs + 1.5), False), ("line", c + e * (rs + 1.5), knee, True),
                   ("arrow", c + e * rs, -e)]
        return ops + shoulder_ops(knee, e, [text])

    m = Marks(view.occ)
    apply_ops(m, best_plan(view.occ, spec, make, float(spec.get("angle", 45)), float(spec.get("length", 8.0))))
    view.dims.append({"reference": bool(spec.get("reference", False)), "type": kind, "text": text, "value": round(value, 6), "center": g2.P(c / s),
                      "r": round(r, 6), "marks": m})


def angle_dim(view, spec, s):
    o = np.asarray(spec["vertex"], float) * s
    p1 = np.asarray(spec["from"], float) * s
    p2 = np.asarray(spec["to"], float) * s
    a1 = math.degrees(math.atan2(*(p1 - o)[::-1]))
    a2 = math.degrees(math.atan2(*(p2 - o)[::-1]))
    span = (a2 - a1) % 360
    value = span
    text = dim_text(spec, value, "")
    if "text" not in spec:
        text = text + "°"
    R0 = float(spec.get("radius", 18.0))
    mid = math.radians(a1 + span / 2)
    em = np.array([math.cos(mid), math.sin(mid)])
    anchor = ("l" if em[0] > 0.3 else "r" if em[0] < -0.3 else "m") + ("b" if em[1] > 0.3 else "t" if em[1] < -0.3 else "m")
    R = min((R0 + k for k in (0, 5, 10, -4, 15)) if not spec.get("fixed") else [R0],
            key=lambda rr: view.occ.cost(text_box(text, o + em * (rr + 2.5), DIM_H, anchor)) + 0.01 * abs(rr - R0))
    m = Marks(view.occ)
    m.curve(g2.arc(o, R, a1, a1 + span, "thin"))
    for ang, p in ((a1, p1), (a2, p2)):
        L = np.linalg.norm(p - o)
        e = np.array([math.cos(math.radians(ang)), math.sin(math.radians(ang))])
        if L < R + 1:
            m.line(o + e * (L + EXT_GAP if L > 0.5 else 0), o + e * (R + EXT_OVER))
    for ang, sgn in ((a1, -1), (a1 + span, 1)):
        t = math.radians(ang)
        tip = o + R * np.array([math.cos(t), math.sin(t)])
        tangent = np.array([-math.sin(t), math.cos(t)]) * sgn
        m.arrow(tip, tangent)
    m.text(text, o + em * (R + 2.5), anchor=anchor)
    view.dims.append({"reference": bool(spec.get("reference", False)), "type": "angle", "text": text, "value": round(value, 6), "vertex": g2.P(o / s),
                      "from": g2.P(p1 / s), "to": g2.P(p2 / s), "marks": m})


def leader_dim(view, spec, s):
    point = np.asarray(spec["at"], float)
    # 基准尺寸的见证必须落在最终实体的图线/轴线上。切削工具伸出外缘、
    # 多个特征相交等情况会消去原来的见证点；沿同一基准位置移到实际图线上。
    if spec.get("category") == "线性坐标尺寸":
        axis = str(spec["text"][0])[0]
        component = 0 if axis == "X" else 1
        value = float(spec["value"])
        samples = [g2.sample(c, 0.08) for c in view.geom["lines"]]
        points = np.concatenate(samples) if samples else np.zeros((0, 2))
        if len(points) and np.linalg.norm(points-point, axis=1).min() > 0.15:
            candidates=[]
            for pts in samples:
                for a,b in zip(pts,pts[1:]):
                    da,db=a[component]-value,b[component]-value
                    if abs(da)<1e-7:candidates.append(a)
                    if da*db<0:
                        candidates.append(a+(b-a)*(-da)/(db-da))
                if len(pts) and abs(pts[-1,component]-value)<1e-7:candidates.append(pts[-1])
            if not candidates:
                raise SpecError(f"{view.name} 的基准尺寸{axis}={value}没有最终图线见证")
            point = min(candidates,key=lambda p:np.linalg.norm(p-point))
    at = point * s
    a = math.radians(spec.get("angle", 45))
    e = np.array([math.cos(a), math.sin(a)])
    lines = list(spec["text"]) if isinstance(spec["text"], list) else [spec["text"]]
    if spec.get("reference"):
        lines = ["(" + " ".join(lines) + ")"]
    if spec.get("_id"):
        lines[0] = f"〔{spec['_id']}〕 " + lines[0]

    def make(ang, length):
        e = np.array([math.cos(math.radians(ang)), math.sin(math.radians(ang))])
        knee = at + e * length
        ops = [("line", at, at + e * 1.5, False), ("line", at + e * 1.5, knee, True)]
        ops.append(("arrow", at, -e) if spec.get("end", "arrow") == "arrow" else ("dot", at))
        return ops + shoulder_ops(knee, e, lines)

    m = Marks(view.occ)
    apply_ops(m, best_plan(view.occ, spec, make, float(spec.get("angle", 45)), float(spec.get("length", 12.0))))
    view.dims.append({"reference": bool(spec.get("reference", False)), "type": "leader", "text": " ".join(lines), "lines": lines, "at": g2.P(at / s), "marks": m})


def build_dims(view, specs):
    s = view.scale
    lin = [d for d in specs if d.get("type", "linear") == "linear"]
    linear_dims(view, lin, s)
    for d in specs:
        t = d.get("type", "linear")
        if t in ("diameter", "radius"):
            if "center" in d:
                pts = np.asarray(d["center"], float)
                ok = any(c["geom"] in ("arc", "circle") and np.hypot(c["center"][0] - pts[0], c["center"][1] - pts[1]) < 1e-3
                         and abs(c["r"] - (d.get("d", 0) / 2 if t == "diameter" and "d" in d else d.get("r", 0))) < 1e-3
                         for c in view.geom["lines"])
                if not ok:
                    warn(f"{view.name} 的尺寸 {d.get('text', t)}：图上没有对应的圆或圆弧")
            circle_dim(view, d, s, t)
        elif t == "angle":
            angle_dim(view, d, s)
        elif t == "leader":
            leader_dim(view, d, s)
        elif t != "linear":
            raise SpecError(f"未知尺寸类型 {t}")

    catalog = {d.get("_id"): d for d in specs}
    for d in view.dims:
        match = re.match(r"〔(D\d+)〕\s*", d["text"])
        if not match:
            raise SpecError("尺寸缺少编号")
        d["id"] = match[1]
        d["text"] = d["text"][match.end():]
        source = catalog[d["id"]]
        if "value" in source:
            d["value"] = source["value"]
        if "category" in source:
            d["category"] = source["category"]
        d["source_feature"] = source.get("source_feature")
        d['covers_features'] = copy.deepcopy(source.get('covers_features', []))
        d['_witness_3d'] = copy.deepcopy(source.get('_witness_3d'))
        for key in ('source_part', '_dimension_witness', '_dimension_audit'):
            if key in source:
                d[key] = copy.deepcopy(source[key])


# ---------------------------------------------------------------- 标注：剖切符号、箭头、原点

def trace_symbol(parent, plane_point, direction, letter):
    return drawing_sections.section_marks(parent, plane_point, direction, letter,
        legacy=lambda: _head_trace_symbol(parent, plane_point, direction, letter))


def _head_trace_symbol(parent, plane_point, direction, letter):
    """在父视图上画剖切位置（粗短画）、投射方向箭头和字母。"""
    s = parent.scale
    pj = project.Projector(parent.vdef)
    d = np.asarray(direction, float)
    n = np.array([d @ pj.u, d @ pj.v])
    if np.linalg.norm(n) < 0.99:
        warn(f"剖切面 {letter} 与 {parent.name} 不垂直，无法在 {parent.name} 上画剖切符号")
        return
    n /= np.linalg.norm(n)
    c = float((np.asarray(plane_point, float) - pj.o) @ d)
    t = np.array([-n[1], n[0]])
    gb = np.asarray(parent.box_geom).reshape(2, 2)
    corners = np.array([[gb[0, 0], gb[0, 1]], [gb[1, 0], gb[0, 1]], [gb[1, 0], gb[1, 1]], [gb[0, 0], gb[1, 1]]])
    # 用剖切线与真实轮廓的交点定位短画。斜断面不能取整张视图
    # 包围盒在切线方向上的极值，否则短画会远离被剖的细长斜臂。
    hits = []
    for curve in parent.geom["lines"]:
        if curve["type"] not in ("visible", "hidden"):
            continue
        points = g2.sample(curve, 0.1) * s
        for aa, bb in zip(points[:-1], points[1:]):
            da, db = aa @ n - c * s, bb @ n - c * s
            if da * db <= 0 and abs(da - db) > 1e-10:
                hit = aa + (bb - aa) * da / (da - db)
                hits.append(float(hit @ t))
            elif abs(da) < 1e-7:
                hits.append(float(aa @ t))
    ts = np.asarray(hits) if hits else corners @ t
    base = n * c * s
    m = parent.marks
    for sign, tt in ((-1, ts.min()), (1, ts.max())):
        p_in = base + t * (tt + sign * 1.5)
        p_out = base + t * (tt + sign * 7.5)
        m.line(p_in, p_out, "cut", role="section")
        m.line(p_out, p_out + n * 7, "thin", role="section")
        m.arrow(p_out + n * 7, n, role="section")
        m.text(letter, p_out + n * 7 + n * (2.0 + LABEL_H / 2) + t * sign * 0.5, LABEL_H, "mm", role="section")


def auxiliary_symbol(parent, direction, arrow_at, label, target_sheet=None):
    """在通过原指向点的投射线上，将箭头与字母放在可见轮廓外侧。"""
    projector = project.Projector(parent.vdef)
    direction = np.asarray(direction, float)
    axis = np.array([direction @ projector.u, direction @ projector.v])
    length = np.linalg.norm(axis)
    if length < 1e-8:
        raise SpecError(f'向视 {label} 的投射方向无法在来源图 {parent.name} 上表示')
    if length < .2:
        warn(f'斜视图 {label} 的投射方向与 {parent.name} 的图面几乎垂直')
    axis /= length
    anchor = np.asarray(arrow_at, float)*parent.scale
    normal = np.array([-axis[1],axis[0]])
    reach = 0.
    for curve in parent.geom['lines']:
        if curve['type'] != 'visible':
            continue
        coords = g2.sample(curve, .15)*parent.scale-anchor
        along, across = coords@axis, coords@normal
        a,b = across[:-1],across[1:]
        hit = (a*b <= 0) & (abs(a-b) > 1e-10)
        if np.any(hit):
            t = a[hit]/(a-b)[hit]
            reach = max(reach, -float(np.min(along[:-1][hit]+t*np.diff(along)[hit])))
    text = str(label)+(f'（见第 {target_sheet} 张）' if target_sheet is not None else '')
    width, height = render.text_extent(text,LABEL_H)
    choices = []
    for gap in (2.,6.,12.,20.):
        tip = anchor-axis*(reach+gap)
        tail = tip-axis*8
        for sign in (1,-1):
            side = normal*sign
            at = tail+side*(1.5+(abs(side[0])*width+abs(side[1])*height)/2)
            cost = parent.occ.cost(text_box(text,at,LABEL_H)) + parent.occ.line_cost(tail,tip)
            choices.append((cost,gap,tip,tail,at))
    _,_,tip,tail,at = min(choices,key=lambda item:item[:2])
    parent.marks.line(tail,tip,role='aux')
    parent.marks.arrow(tip,axis,role='aux')
    parent.marks.text(text,at,LABEL_H,'mm',role='aux-direction')


def reference_legend(view):
    """密集总览保留各个箭头旁的字母，重复的页号合写于本图下方。"""
    pages = {}
    for ref in view.section_references + view.auxiliary_references:
        if ref.get('target_sheet') is not None:
            labels = pages.setdefault(ref['target_sheet'], [])
            if ref['label'] not in labels:
                labels.append(ref['label'])
    x0,y0,x1,_ = view.box_geom
    rows = []
    for page,labels in pages.items():
        entry = f"{'、'.join(labels)}见第{page}张"
        if rows and render.text_extent(rows[-1]+'　'+entry,LABEL_H)[0] <= 1.2*(x1-x0):
            rows[-1] += '　'+entry
        else:
            rows.append(entry)
    y = min(y0,view.marks.box[1] if view.marks.box else y0)-3
    for row in rows:
        view.marks.text(row,((x0+x1)/2,y),LABEL_H,'mt',role='source-reference')
        y -= LABEL_H+2


def origin_marker(view):
    if view.kind not in BASIC:
        return
    pj = project.Projector(view.vdef)
    m = view.marks
    m.curve(g2.arc((0, 0), 1.2, 0, 360, "thin"), role="origin")
    axes = {}
    for name, e in (("X", (1, 0, 0)), ("Y", (0, 1, 0)), ("Z", (0, 0, 1))):
        d2 = np.array([np.dot(e, pj.u), np.dot(e, pj.v)])
        if np.linalg.norm(d2) > 0.99:
            axes[name] = [round(float(d2[0])), round(float(d2[1]))]
            tip = d2 * 18
            m.line(d2 * 1.2, tip, "thin", role="origin")
            m.arrow(tip, d2, role="origin", size=2.5)
            nrm = np.array([-d2[1], d2[0]])
            cands = [(tip + d2 * 1.5, "lm" if d2[0] > 0.5 else "rm" if d2[0] < -0.5 else ("mb" if d2[1] > 0 else "mt")),
                     (tip - d2 * 1.5 + nrm * 1.2, "mb" if abs(d2[0]) > 0.5 else ("rm" if nrm[0] < 0 else "lm")),
                     (tip - d2 * 1.5 - nrm * 1.2, "mt" if abs(d2[0]) > 0.5 else ("rm" if -nrm[0] < 0 else "lm"))]
            at, anchor = min(cands, key=lambda c_: view.occ.cost(text_box(name, c_[0], LABEL_H, c_[1])))
            m.text(name, at, LABEL_H, anchor, role="origin")
    cands = [((-4, 4), "rb"), ((-4, -4), "rt"), ((4, -4), "lt"), ((4, 4), "lb")]
    at, anchor = min(cands, key=lambda c_: view.occ.cost(text_box("O", c_[0], LABEL_H, c_[1])))
    m.text("O", at, LABEL_H, anchor, role="origin")
    view.axes = axes


# ---------------------------------------------------------------- 图框、标题栏、明细栏

def sheet_frame(paper, info, sheet_index, sheet_count, parts_list, notes):
    style=drawing_layout.drawing_style(paper)
    if style.get('frame_builder'):
        return style['frame_builder'](paper, info, sheet_index, sheet_count, parts_list, notes)
    W,H,a,c=PAPERS[paper]
    m=Marks()
    m.curve(g2.polyline([(a,c),(W-c,c),(W-c,H-c),(a,H-c),(a,c)],'frame'))
    h=style['FRAME_H']
    m.text(f"{info['title']}  |  {info['problem_label']}  {sheet_index}/{sheet_count}",(a+6,c+6),h,'lb')
    m.text(f"第一角画法   单位mm   比例{info['scale_text']}   {info['drawing_no']}",(W-c-6,c+6),h,'rb')
    m.line((a,c+22),(W-c,c+22),'frame')
    y=H-c-8
    reserved=[[a,c,W-c,c+25]]
    # 技术要求行短而明确；文字放大不改变零件视图大小。
    for text in notes[1:]:
        m.text(text,(a+6,y),h,'lt'); y-=h+4
    reserved.append([a,H-c-4*(h+4)-10,W-c,H-c])
    if parts_list:
        labels=['装配明细：']+[f"{r['no']} {r['name']} ×{r['qty']}" for r in parts_list]
        line='  '.join(labels)
        # 每行三件，明细栏字号与其他文字一致。
        for k in range(0,len(labels),3):
            m.text('  '.join(labels[k:k+3]),(a+6,y),h,'lt'); y-=h+4
        reserved[-1][1]=y-6
    return m,(a,c+25,W-c,y-6),reserved


def add_label(v):
    b = view_extent(v)
    cx = (b[0] + b[2]) / 2 if v.kind not in BASIC else (v.box_geom[0] + v.box_geom[2]) / 2
    if v.kind == "detail":
        y = b[3] + 4
        tw = max(render.text_extent(v.letter, LABEL_H)[0], render.text_extent(scale_text(v.scale), DIM_H)[0])
        v.marks.text(scale_text(v.scale), (cx, y), DIM_H, "mb", role="label")
        v.marks.line((cx - tw / 2 - 1, y + DIM_H + 1), (cx + tw / 2 + 1, y + DIM_H + 1), role="label")
        v.marks.text(v.letter, (cx, y + DIM_H + 2), LABEL_H, "mb", role="label")
    else:
        v.marks.text(v.name, (cx, b[3] + 4), LABEL_H, "mb", role="label")
        if v.spec.get("rotated"):
            # 旋转配置的斜视图：字母旁画旋转符号（半圆箭头）
            tw = render.text_extent(v.name, LABEL_H)[0]
            c = np.array([cx + tw / 2 + 4.5, b[3] + 4 + LABEL_H / 2])
            r = LABEL_H / 2
            v.marks.curve(g2.arc(c, r, 0, 180, "thin"), role="label")
            clockwise = v.spec.get("rotated") == "cw"
            v.marks.arrow(c + ([r, 0] if clockwise else [-r, 0]), (0, -1), role="label", size=1.8)
    if v.source_reference and v.source_reference.get('sheet_index'):
        reference = v.source_reference
        page = f"见第 {reference['sheet_index']} 张"
        text = ('剖切位置' if v.vdef.get('section') else '定位来源') + page
        if re.sub(r'\s+', '', page) not in re.sub(r'\s+', '', v.name):
            bounds = view_extent(v)
            v.marks.text(text, (cx, bounds[3]+3), DIM_H, 'mb', role='source-reference')


def arrange(views, frame_box, reserved, placed_boxes=None):
    basics = [v for v in views if v.grid is not None]
    grids = [v.grid for v in basics]
    if len(set(grids)) != len(grids):
        raise SpecError("同一个基本视图位置上有两个视图；其中一个请加 \"free\": true 或 \"at\" 另行配置")
    ext = {v.name: view_extent(v) for v in views}
    occupied = list(reserved)
    rows = sorted({v.grid[0] for v in basics})
    cols = sorted({v.grid[1] for v in basics})
    L = {c: max(-ext[v.name][0] for v in basics if v.grid[1] == c) for c in cols}
    Rr = {c: max(ext[v.name][2] for v in basics if v.grid[1] == c) for c in cols}
    T = {r: max(ext[v.name][3] for v in basics if v.grid[0] == r) for r in rows}
    B = {r: max(-ext[v.name][1] for v in basics if v.grid[0] == r) for r in rows}
    xs, ys = {}, {}
    x = 0.0
    for i, c in enumerate(cols):
        if i:
            x += Rr[cols[i - 1]] + VIEW_GAP + L[c]
        xs[c] = x
    y = 0.0
    for i, r in enumerate(rows):
        if i:
            y -= B[rows[i - 1]] + VIEW_GAP + T[r]
        ys[r] = y
    fit = True
    if basics:
        cl = [xs[c] - L[c] for c in cols]
        cr = [xs[c] + Rr[c] for c in cols]
        ct = [ys[r] + T[r] for r in rows]
        cb = [ys[r] - B[r] for r in rows]
        cluster = [min(cl), min(cb), max(cr), max(ct)]
        cw, ch = cluster[2] - cluster[0], cluster[3] - cluster[1]
        fx0, fy0, fx1, fy1 = frame_box
        best = None
        ideal = ((fx0 + fx1) / 2, (fy0 + fy1) / 2 + 5)
        for ox in np.arange(fx0 + 5, fx1 - 5 - cw + 1e-9, 2.0):
            for oy in np.arange(fy0 + 5, fy1 - 5 - ch + 1e-9, 2.0):
                rect = [ox, oy, ox + cw, oy + ch]
                if any(box_overlap(rect, r, 3) for r in occupied):
                    continue
                dist = (ox + cw / 2 - ideal[0]) ** 2 + (oy + ch / 2 - ideal[1]) ** 2
                if best is None or dist < best[0]:
                    best = (dist, ox, oy)
        if best is None:
            fit = False
            best = (0, (fx0 + fx1) / 2 - cw / 2, (fy0 + fy1) / 2 - ch / 2)
        dx, dy = best[1] - cluster[0], best[2] - cluster[1]
        for v in basics:
            v.paper_origin = [xs[v.grid[1]] + dx, ys[v.grid[0]] + dy]
            e = ext[v.name]
            occupied.append([e[0] + v.paper_origin[0], e[1] + v.paper_origin[1],
                             e[2] + v.paper_origin[0], e[3] + v.paper_origin[1]])
    others = [v for v in views if v.grid is None]
    for v in others:
        e = ext[v.name]
        w, h = e[2] - e[0], e[3] - e[1]
        if v.spec.get("at"):
            cx, cy = v.spec["at"]
            v.paper_origin = [cx - (e[0] + e[2]) / 2, cy - (e[1] + e[3]) / 2]
            rect = [e[0] + v.paper_origin[0], e[1] + v.paper_origin[1],
                    e[2] + v.paper_origin[0], e[3] + v.paper_origin[1]]
            if rect[0] < frame_box[0] + 3 or rect[1] < frame_box[1] + 3 or rect[2] > frame_box[2] - 3 or rect[3] > frame_box[3] - 3:
                fit = False
            if any(box_overlap(rect, r, 2) for r in occupied):
                fit = False
        else:
            target = None
            if v.parent:
                pv = parent_view(views, v)
                if pv is not None and pv.paper_origin is not None:
                    pe = ext[pv.name]
                    target = ((pe[0] + pe[2]) / 2 + pv.paper_origin[0], (pe[1] + pe[3]) / 2 + pv.paper_origin[1])
            fx0, fy0, fx1, fy1 = frame_box
            if target is None:
                target = ((fx0 + fx1) / 2, (fy0 + fy1) / 2)
            best = None
            for ox in np.arange(fx0 + 4, fx1 - 4 - w + 1e-9, 2.0):
                for oy in np.arange(fy0 + 4, fy1 - 4 - h + 1e-9, 2.0):
                    rect = [ox, oy, ox + w, oy + h]
                    if any(box_overlap(rect, r, 4) for r in occupied):
                        continue
                    dist = (ox + w / 2 - target[0]) ** 2 + (oy + h / 2 - target[1]) ** 2
                    if best is None or dist < best[0]:
                        best = (dist, ox, oy)
            if best is None:
                fit = False
                best = (0, fx0 + 5, fy0 + 5)
            v.paper_origin = [best[1] - e[0], best[2] - e[1]]
        occupied.append([e[0] + v.paper_origin[0], e[1] + v.paper_origin[1],
                         e[2] + v.paper_origin[0], e[3] + v.paper_origin[1]])
    return fit


# ---------------------------------------------------------------- 整张图

def sheet_shapes(mdl, sheet):
    frame = sheet.get("frame", "part")
    def explicit_parts(view):
        return view.get('_definition', {}).get('parts') or view.get('parts') or []

    defaults = [str(n) for n in (sheet.get('parts') or [])]
    if not defaults:
        if frame == 'assembly':
            defaults = [p.name for p in mdl.parts]
        else:
            defaults = [str(sheet.get('part') or mdl.parts[0].name)]
    names = []
    for view in sheet.get('views', []) + sheet.get('projection_views', []):
        for name in explicit_parts(view) or defaults:
            if str(name) not in names:
                names.append(str(name))
    names = names or defaults
    if frame == "assembly":
        cache=getattr(mdl,'_drawing_placed',{})
        shapes={}
        for p in mdl.parts:
            if p.name not in names:
                continue
            stamp=(hash(p.shape),tuple(p.placement.ravel()))
            if p.name not in cache or cache[p.name][0]!=stamp:cache[p.name]=(stamp,p.placed())
            shapes[p.name]=cache[p.name][1]
        mdl._drawing_placed=cache
        if set(names) - set(shapes):
            raise SpecError(f'参考描述中没有零件 {set(names)-set(shapes)}')
        return shapes, defaults
    shapes = {}
    for name in names:
        part = mdl.part(name)
        if part is None:
            raise SpecError(f"参考描述中没有零件 {name}")
        shapes[name] = part.shape
    return shapes, defaults


def compose(sheet, mdl, scale, sheet_index, sheet_count, problem, problem_title):
    shapes, names = sheet_shapes(mdl, sheet)
    views, dependencies = projection_views(sheet, names)
    project_all(views + dependencies, shapes, scale)
    for v in views:
        s = v.scale
        gb = project.geometry_bounds(v.geom)
        v.box_geom = [gb[0] * s, gb[1] * s, gb[2] * s, gb[3] * s]
        full = g2.bounds(v.geom["lines"]) or gb
        v.box_full = box_union(v.box_geom, [full[0] * s, full[1] * s, full[2] * s, full[3] * s])
        v.occ = Occupancy(v.box_geom)
        for c in v.geom["lines"]:
            v.occ.add_curve(g2.xform(c, s, (0, 0)), 0.8 if c["type"] == "center" else 1.0)
        for h in v.geom["hatches"]:
            if not h.get("clip"):
                v.occ.add_fill([[[p[0] * s, p[1] * s] for p in lp] for lp in h["loops"]], 0.5)
        v.marks.occ = v.occ
        v.marks.group_section_pages = len(v.auxiliary_references) > 1
    # D 的最终试排先有 section_references，正式页还会有 section_traces。
    marked_sections = set()

    def mark_section(parent, point, direction, label):
        key = (parent.index, label, tuple(point), tuple(direction))
        if key not in marked_sections:
            trace_symbol(parent, point, direction, label)
            marked_sections.add(key)

    for trace in sheet.get("section_traces", []):
        parent = next((v for v in views if trace.get('parent_key') and v.view_key == trace['parent_key']), None)
        mark_section(parent or view_by_name(views, trace["parent"]), trace["point"], trace["direction"], trace["label"])
    for view in views:
        for reference in view.section_references:
            mark_section(view, reference['point'], reference['direction'], reference['label'])
        seen = set()
        for reference in view.auxiliary_references:
            key = json.dumps(reference,sort_keys=True)
            if key not in seen:
                target = None if view.marks.group_section_pages else reference['target_sheet']
                auxiliary_symbol(view,reference['direction'],reference['arrow_at'],reference['label'],target)
                seen.add(key)
    # 剖切符号、斜视图箭头、放大范围圆
    for v in views:
        pv = annotation_parent_view(views, v)
        if pv is None and (v.source_key or parent_view(dependencies, v) is not None):
            continue  # 父图仅供投影；不在隐藏依赖上添加纸面符号。
        if (v.vdef.get('section') and (v.parent or v.source_key) and v.letter
                and v.vdef['section']['mode'] != 'local'):
            mark_section(pv or view_by_name(views, v.parent), v.vdef["section"]["point"], v.vdef["direction"], v.letter)
        elif v.kind == "auxiliary" and (v.parent or v.source_key):
            pv = pv or view_by_name(views, v.parent)
            auxiliary_symbol(pv,v.vdef['direction'],v.spec.get('arrow_at',[0,0]),v.letter)
        elif v.kind == "detail":
            pv = pv or view_by_name(views, v.vdef["detail"]["parent"])
            c = np.asarray(v.vdef["detail"]["center"], float) * pv.scale
            r = v.vdef["detail"]["r"] * pv.scale
            pv.marks.curve(g2.arc(c, r, 0, 360, "thin"), role="detail")
            e = np.array([math.cos(math.radians(55)), math.sin(math.radians(55))])
            pv.marks.line(c + e * r, c + e * (r + 7), role="detail")
            pv.marks.text(v.letter, c + e * (r + 7) + [0, 0.8], LABEL_H, "mb", role="detail")
    for v in views:
        origin_marker(v)
        if v.marks.group_section_pages:
            reference_legend(v)
    # 补充中心线
    for cl in sheet.get("centerlines", []):
        v = view_by_name(views, cl["view"])
        a, b = np.asarray(cl["from"], float), np.asarray(cl["to"], float)
        e = (b - a) / np.linalg.norm(b - a)
        ext = cl.get("extend", 3.0)
        v.marks.line(a * v.scale - e * ext, b * v.scale + e * ext, "center", role="centerline")
    for ph in sheet.get("phantom", []):
        v = view_by_name(views, ph["view"])
        s = v.scale
        if "points" in ph:
            pts = [[p[0] * s, p[1] * s] for p in ph["points"]]
            if ph.get("closed"):
                pts.append(pts[0])
            v.marks.curve(g2.polyline(pts, "phantom"), role="phantom")
        else:
            c = [ph["center"][0] * s, ph["center"][1] * s]
            v.marks.curve(g2.arc(c, ph["r"] * s, ph.get("start", 0), ph.get("end", 360), "phantom"), role="phantom")
    # 尺寸
    for v in views:
        mine = [d for d in sheet.get('dimensions', [])
                if (d.get('view_key') == v.view_key if d.get('view_key') else d.get('view') == v.name)]
        def head_dimensions():
            build_dims(v, mine)
            bbox = None
            for dimension in v.dims:
                bbox = box_union(bbox, drawing_common.marks_bounds(dimension['marks'].to_view(v.scale), v.scale))
            return dict(dimensions=v.dims, bbox=bbox, unresolved=[])
        result = drawing_dimensions.layout_dimensions(v, mine,
            style=drawing_layout.drawing_style(sheet.get('paper', 'A3')), legacy=head_dimensions)
        if result.get('unresolved'):
            raise SpecError(f"未解决尺寸：{result['unresolved']}")
        v.dims = result['dimensions']
        v.dimension_bbox = result['bbox']
    # 零件序号
    balloons = sheet.get("balloons", [])
    for v in views:
        mine = [b for b in balloons if b.get("view") == v.name]
        if mine:
            place_balloons(v, mine)
    for v in views:
        add_label(v)
    return views


def place_balloons(v, items):
    gb = v.box_geom
    cx, cy = (gb[0] + gb[2]) / 2, (gb[1] + gb[3]) / 2
    sides = {"left": [], "right": [], "top": []}
    for b in items:
        at = np.asarray(b["at"], float) * v.scale
        side = b.get("side") or ("left" if at[0] < cx else "right")
        sides[side].append((b, at))
    for side, lst in sides.items():
        if not lst:
            continue
        if side == "top":
            lst.sort(key=lambda x: x[1][0])
            y = gb[3] + 10
            xs = [x[1][0] for x in lst]
            for i in range(1, len(xs)):
                xs[i] = max(xs[i], xs[i - 1] + 9)
            for (b, at), x in zip(lst, xs):
                v.marks.dot(at, role="balloon")
                v.marks.line(at, (x, y), role="balloon")
                v.marks.line((x - LABEL_H, y), (x + LABEL_H, y), role="balloon")
                v.marks.text(str(b["part"]), (x, y + 0.8), LABEL_H, "mb", role="balloon")
            continue
        lst.sort(key=lambda x: -x[1][1])
        x = (gb[0] - 12) if side == "left" else (gb[2] + 12)
        ys = [at[1] + 6 for _, at in lst]
        for i in range(1, len(ys)):
            ys[i] = min(ys[i], ys[i - 1] - 9)
        previous_y = float('inf')
        for (b, at), y in zip(lst, ys):
            y = min(y, previous_y - 9)
            x2 = x - 7 if side == "left" else x + 7
            # 尺寸先于序号绘制，序号也须避开已有的多行说明。
            dimension_marks = [m for d in v.dims for m in d['marks'].items]
            occupied = [text_box(m['text'], m['at'], m['height'], m['anchor'], m['angle'])
                        for m in v.marks.items + dimension_marks if m['kind'] == 'text']
            for _ in range(100):
                candidate = text_box(str(b['part']), ((x+x2)/2, y+0.8), LABEL_H, 'mb')
                if not any(box_overlap(candidate, other, 1.5) for other in occupied):
                    break
                y -= LABEL_H + 2
            previous_y = y
            v.marks.dot(at, role="balloon")
            v.marks.line(at, (x, y), role="balloon")
            x2 = x - 7 if side == "left" else x + 7
            v.marks.line((x, y), (x2, y), role="balloon")
            v.marks.text(str(b["part"]), ((x + x2) / 2, y + 0.8), LABEL_H, "mb", role="balloon")


def _apply_drawing_style(paper):
    style=drawing_layout.drawing_style(paper)
    drawing_common.apply_style(style)
    for key in ('DIM_H', 'LABEL_H', 'LEVEL_STEP', 'ARROW', 'EXT_GAP', 'EXT_OVER', 'LEVEL0', 'VIEW_GAP'):
        if key in style:globals()[key]=style[key]
    return style


def pick_scale(sheet, mdl, paper, sheet_index, sheet_count, problem, title, info, parts_list, notes):
    style=_apply_drawing_style(paper)
    spec_scale = sheet.get("scale", 1)
    candidates = [float(x) for x in spec_scale] if isinstance(spec_scale, list) else SCALES if spec_scale == "auto" else [float(spec_scale)]
    for sc in candidates:
        WARN.clear()
        views = compose(sheet, mdl, sc, sheet_index, sheet_count, problem, title)
        _, frame_box, reserved = sheet_frame(paper, dict(info, scale_text=scale_text(sc)), sheet_index,
                                             sheet_count, parts_list, notes)
        fit = drawing_layout.arrange_views(views, frame_box, reserved, style=style,
            legacy=lambda: arrange(views, frame_box, reserved))
        if fit:
            flush_warnings()
            return sc, views
        if sc == candidates[-1]:
            raise SpecError(f"第 {sheet.get('id')} 张图在 {paper} 图幅上排不下，请改用更大图幅或更小比例")
    raise AssertionError


def hatch_style(index, styles=None):
    styles=HATCH_STYLES if styles is None else styles
    return styles[index % len(styles)]


def protect_annotation_text(view):
    """标注线遇文字留白；只断开尺寸/辅助线，绝不裁剪零件轮廓。"""
    scale=view['placement']['scale']
    groups=[d['draw'] for d in view['dimensions']]+[view.get('annotations',[])]
    boxes=[]
    for marks in groups:
        for mark in marks:
            if mark['kind']=='text':
                b=text_box(mark['text'],np.asarray(mark['at'])*scale,mark['height'],mark.get('anchor','mm'),mark.get('angle',0))
                boxes.append([(b[0]-.5)/scale,(b[1]-.5)/scale,(b[2]+.5)/scale,(b[3]+.5)/scale])
    for marks in groups:
        revised=[]
        for mark in marks:
            if mark['kind']!='curve':
                revised.append(mark);continue
            curves=[mark['curve']]
            for x0,y0,x1,y1 in boxes:
                region={'shape':'polygon','points':[[x0,y0],[x1,y0],[x1,y1],[x0,y1]]}
                if any(box_overlap(g2.bounds([c]),[x0,y0,x1,y1]) for c in curves):
                    curves=g2.clip_all(curves,region,inside=False)
            revised.extend(dict(mark,curve=c) for c in curves)
        marks[:]=revised


def protect_hatch_text(sheet):
    """把整页最终字框换回各剖视坐标；仅向 hatch.exclude 追加留白区域。"""
    views = sheet['views']
    if not any(v.get('hatches') for v in views):
        return sheet
    boxes = []

    def collect(marks, scale, origin):
        for mark in marks:
            if mark['kind'] != 'text' or not mark['text']:
                continue
            x0,y0,x1,y1 = text_box(mark['text'], [0,0], mark['height'], mark.get('anchor','mm'))
            # 0.5 mm 为纸面留白，随文字旋转，字高不随视图比例缩放。
            corners = np.array([[x0-.5,y0-.5], [x1+.5,y0-.5], [x1+.5,y1+.5], [x0-.5,y1+.5]])
            angle = math.radians(mark.get('angle', 0))
            c,s = math.cos(angle), math.sin(angle)
            polygon = corners @ np.array([[c,s],[-s,c]]) + np.asarray(mark['at'])*scale + origin
            boxes.append((box_pts(polygon), polygon))

    collect(sheet.get('sheet_marks', []), 1, [0,0])
    for view in views:
        scale, origin = render.view_xf(view)
        collect(view.get('annotations', []), scale, origin)
        for dimension in view.get('dimensions', []):
            collect(dimension['draw'], scale, origin)
    for view in views:
        scale, origin = render.view_xf(view)
        for hatch in view.get('hatches', []):
            loops = [loop for loop in hatch['loops'] if len(loop) >= 3]
            if not loops:
                continue
            bounds = box_pts(np.concatenate(loops)*scale + origin)
            excluded = list(hatch.get('exclude', []))  # 原免剖区可能与投影缓存共享。
            for box, polygon in boxes:
                if box_overlap(bounds, box):
                    region = dict(shape='polygon', points=((polygon-origin)/scale).tolist())
                    if region not in excluded:
                        excluded.append(region)
            if excluded:
                hatch['exclude'] = excluded
    return sheet


def make_sheet(sheet, mdl, problem, title, sheet_index, sheet_count, dpi, *, finalize=False):
    paper = sheet.get("paper", "A3")
    if paper not in PAPERS:
        raise SpecError(f"图幅 {paper} 不支持，可用 {'、'.join(PAPERS)}")
    style = drawing_layout.drawing_style(paper)
    parts_list = sheet.get("parts_list") or []
    notes = sheet.get("notes") or []
    frame = sheet.get("frame", "part")
    info = {"title": sheet.get("title", title), "drawing_no": sheet.get("drawing_no", f"JX-{problem}"),
            "material": sheet.get("material", ""), "quantity": sheet.get("quantity", 1 if frame == "part" else ""),
            "problem_label": f"第 {problem} 题" + (f" · 第 {sheet_index} 张" if sheet_count > 1 else "")}
    sc, views = pick_scale(sheet, mdl, paper, sheet_index, sheet_count, problem, title, info, parts_list, notes)
    info["scale_text"] = scale_text(sc)
    frame_marks, _, _ = sheet_frame(paper, info, sheet_index, sheet_count, parts_list, notes)
    W, H = PAPERS[paper][:2]
    order = [p.name for p in mdl.parts]
    out_views = []
    for v in views:
        hatches = []
        for h in v.geom["hatches"]:
            ang, sp = hatch_style(order.index(h["part"]) if h["part"] in order else 0, style.get('hatch_styles'))
            if frame == "part":
                ang, sp = 45, style['hatch_spacing']
            hh = {"part": h["part"], "angle": ang, "spacing": sp, "loops": h["loops"]}
            for key in ("clip", "exclude"):
                if h.get(key):
                    hh[key] = h[key]
            hatches.append(hh)
        vdef = {k: val for k, val in v.vdef.items() if k not in ("parent_definition",)}
        for k in ("direction", "u", "v", "origin"):
            if k in vdef:
                vdef[k] = [float(x) + 0.0 for x in vdef[k]]
        if v.kind == "detail":
            vdef["parent_definition"] = {k: val for k, val in v.vdef["parent_definition"].items()}
        entry = {
            "name": v.name,
            "view_key": v.view_key,
            "kind": v.kind if v.kind in ("auxiliary", "removed_section", "detail") else "basic",
            "position": v.kind if v.kind in BASIC else None,
            "frame": frame,
            "definition": vdef,
            "placement": {"scale": v.scale, "scale_text": scale_text(v.scale),
                          "paper_origin": [round(v.paper_origin[0], 4), round(v.paper_origin[1], 4)]},
        }
        for key in drawing_common.CANDIDATE_PRIVATE_FIELDS:
            if key in v.spec:
                entry[key] = copy.deepcopy(v.spec[key])
        if v.geom.get('witness_elements') is not None:
            entry['witness_elements'] = copy.deepcopy(v.geom['witness_elements'])
        if v.source_reference:
            entry['_source_reference'] = copy.deepcopy(v.source_reference)
        if getattr(v, "axes", None):
            entry["axes"] = v.axes
        if v.kind in BASIC and v.vdef.get("section"):
            entry["section_label"] = v.letter
        entry["lines"] = [c for c in v.geom["lines"]]
        entry["hatches"] = hatches
        entry["dimensions"] = []
        for d in v.dims:
            dd = {k: val for k, val in d.items() if k != "marks"}
            dd["draw"] = d["marks"].to_view(v.scale)
            entry["dimensions"].append(dd)
        entry["annotations"] = v.marks.to_view(v.scale)
        protect_annotation_text(entry)
        out_views.append(entry)
    sheet_json = {
        "format": "机械结构重建·图纸", "version": 1,
        "problem": problem, "sheet": sheet["id"], "sheet_index": sheet_index, "sheet_count": sheet_count,
        "title": info["title"], "frame": frame, "part": sheet.get("part") if frame == "part" else None,
        "paper": {"size": paper, "width": W, "height": H}, "dpi": dpi,
        "projection": "第一角画法", "units": "毫米", "scale": scale_text(sc),
        "conventions": CONVENTIONS,
        "title_block": {k: info[k] for k in ("title", "drawing_no", "material", "quantity", "scale_text")},
        "parts_list": parts_list,
        "notes": notes,
        "views": out_views,
        "sheet_marks": frame_marks.to_view(1.0),
    }
    for key in ('_dimension_audit', 'parts'):
        if key in sheet:
            sheet_json[key] = copy.deepcopy(sheet[key])
    move_letters = str(problem).isdigit() and 16 <= int(problem) <= 25
    if finalize:
        if move_letters:
            _move_auxiliary_letters(sheet_json)
        if not drawing_layout.arrange_finalized_page(sheet_json):
            raise SpecError(f"{sheet['id']}：{paper} 比例 {scale_text(sc)} 放不下最终文字、引线和视图")
    elif move_letters:
        return sheet_json  # 试排调用方可先检查原位，再单独调用 clear_auxiliary_letters。
    return protect_hatch_text(sheet_json)


CONVENTIONS = {
    "零件坐标系": "三维坐标单位为毫米。各基本视图上画有坐标原点 O 和坐标轴箭头 X、Y、Z（指向正向）。"
              "主视图沿 +Y 方向投射，俯视图沿 −Z，左视图沿 +X；第一角画法。",
    "视图坐标": "每个视图有自己的二维坐标 (u, v)，单位为零件毫米（实际尺寸，不受比例影响）。"
             "三维点 P 投影到视图：u = (P − origin)·definition.u，v = (P − origin)·definition.v；"
             "definition.direction 为投射方向（视线方向）。",
    "图纸位置": "图纸毫米坐标原点在图幅左下角，y 向上；视图坐标 (u, v) 在图纸上的位置为 "
             "placement.paper_origin + placement.scale × (u, v)。",
    "曲线": "line 为线段 from→to；circle 为整圆；arc 为圆弧，start、end 是角度（度），从 u 正向逆时针量，"
          "圆弧从 start 逆时针画到 end；polyline 为折线逼近（椭圆、相贯线等）。",
    "线型": render.LINE_TYPE_CN,
    "剖切": "section 定义剖切：剖切平面过 point 且垂直于投射方向，观察者一侧的材料移去；mode 为 full（全剖）、"
          "half（半剖，half.axis 为分界所在坐标轴 u 或 v，at 为分界坐标，side 为剖开的一侧 + 或 −）、"
          "local（局部剖，region 为剖开范围的多边形）。removed_section（断面图）只画剖切平面上的截面。"
          "hatches 为剖面线区域（loops 为闭合边界，奇偶规则；clip 为附加裁剪区域）。",
    "局部视图": "keep 为局部视图保留的区域，边界在材料上画波浪线；detail 为局部放大图，"
             "detail.center、detail.r 为在父视图坐标中的放大范围。",
    "尺寸": "dimensions 中 value 为尺寸数值（毫米或度），text 为标注文字；linear 的 from、to 为被测两点，"
          "dir 为 h（沿 u 方向的距离）、v（沿 v 方向）或 a（两点连线方向）；diameter、radius 给 center 和 r；"
          "angle 给 vertex、from、to（从 from 射线逆时针量到 to 射线）；leader 为引出标注（如孔的说明）。"
          "draw 为尺寸线、尺寸界线、箭头和文字的画法图元。",
}



PUBLIC_CONVENTIONS = {
    "图纸": "形状、图线、遮挡关系和剖面边界仅见同名PNG；JSON不提供图线或标注图元坐标。",
    "尺寸": "每个尺寸旁的〔D编号〕对应dimensions目录；编号在整题内唯一。value为尺寸数值，text为完整标注，参考尺寸保留括号。",
    "坐标": "O是零件坐标原点，箭头X/Y/Z指向正向；单位毫米。装配图采用总坐标系，零件图采用各自坐标系。",
    "投影": "第一角画法；主视沿+Y，俯视沿−Z，左视沿+X。其他视图以definition.direction为投射方向。",
    "剖切": "definition.section只说明剖切平面与方式；剖切位置字母标在PNG上，不包含截面轮廓。",
    "尺寸链": "线性尺寸由尺寸界线所指的轮廓、轴线或中心位置之间量取。局部定形与相对定位尺寸需结合PNG联立；不得将尺寸数值直接当成绝对坐标。",
}


def public_sheet(sheet):
    """明确的允许字段白名单；绝不递归复制图元。"""
    keys = ("format", "problem", "sheet", "sheet_index", "sheet_count", "title", "frame", "part",
            "paper", "dpi", "projection", "units", "scale", "title_block", "parts_list", "notes")
    out = {k: sheet[k] for k in keys}
    out.update(version=2, conventions=PUBLIC_CONVENTIONS, dimensions=[], views=[])
    cn = {"linear": "线性", "diameter": "直径", "radius": "半径", "angle": "角度", "leader": "孔标注或尺寸说明"}
    kind_cn = {"basic": "基本视图", "auxiliary": "斜视图", "removed_section": "断面", "detail": "局部放大"}
    for v in sheet["views"]:
        # 新题仅使用全剖/断面；视图定位是页面布局而非任何参考图线。
        vv = {k: v[k] for k in ("name", "kind", "position", "frame")}
        vv["projection_direction"] = v["definition"].get("direction")
        vv["section"] = ({"label":v.get("section_label"),"mode":v["definition"]["section"]["mode"]} if v["definition"].get("section") else None)
        vv["type"] = "剖视" if v["definition"].get("section") else kind_cn[v["kind"]]
        vv["section_label"] = v.get("section_label")
        vv["coordinate_system"] = "装配总坐标系" if sheet["frame"] == "assembly" else "零件自身坐标系；O及正向见PNG"
        out["views"].append(vv)
        for d in v["dimensions"]:
            out["dimensions"].append({"id": d["id"], "view": v["name"], "type": d.get("category", cn[d["type"]]),
                "value": d.get("value"), "text": d["text"]})
    out["dimensions"].sort(key=lambda d: int(d["id"][1:]))
    return out


def validate_public(doc):
    forbidden = {"lines", "hatches", "loops", "draw", "annotations", "sheet_marks", "from", "to", "points", "vertices", "center", "region"}
    forbidden.update(drawing_common.CANDIDATE_PRIVATE_FIELDS)
    forbidden.update({'source_part', 'source_feature', 'covers_features', '_dimension_witness', '_dimension_audit', '_witness_3d', 'projection_views',
                      '_a_local', '_a_position', '_no_hatch_parts', '_source_reference', 'view_role'})
    def visit(node):
        if isinstance(node, dict):
            if forbidden.intersection(node):
                raise SpecError(f"公开JSON泄露图元字段：{forbidden.intersection(node)}")
            for val in node.values():
                visit(val)
        elif isinstance(node, list):
            for val in node:
                visit(val)
    visit(doc)
    ids = [d["id"] for d in doc["dimensions"]]
    if len(ids) != len(set(ids)):
        raise SpecError("尺寸编号重复")


def _move_auxiliary_letters(sheet):
    """文字避开真实零件轮廓，保留原定位端点并以引线关联。"""
    geometry=[];texts=[];points=[];occupied=[]
    width, height = sheet['paper']['width'], sheet['paper']['height']
    frame = [31,40,width-15,height-20]
    if 'title_block' in sheet:
        info = dict(sheet['title_block'], problem_label=sheet['problem'])
        _, frame, _ = sheet_frame(sheet['paper']['size'], info, sheet['sheet_index'],
                                  sheet['sheet_count'], sheet['parts_list'], sheet['notes'])
    for v in sheet['views']:
        sc,off=render.view_xf(v)
        curves=[c for c in v['lines'] if c['type'] in ('visible','hidden')]
        gb=g2.bounds(curves)
        geometry.append(None if gb is None else [gb[0]*sc+off[0],gb[1]*sc+off[1],gb[2]*sc+off[0],gb[3]*sc+off[1]])
        arrays=[g2.sample(g2.xform(c,sc,off),.35) for c in curves]
        points.append(np.concatenate(arrays) if arrays else np.zeros((0,2)))
        marks = v['annotations']+[m for d in v['dimensions'] for m in d['draw']]
        # D 已为每个视图分配含图名、箭头、尺寸在内的范围。移动文字也要避开邻图。
        full = g2.bounds(v['lines'])
        full = box_union([x*sc for x in full] if full is not None else None, drawing_common.marks_bounds(marks,sc))
        occupied.append([p+off[i%2] for i,p in enumerate(full)] if full is not None else None)
        for m in marks:
            if m['kind']=='text':texts.append(text_box(m['text'],np.array(m['at'])*sc+off,m['height'],m.get('anchor','mm'),m.get('angle',0)))
    for m in sheet['sheet_marks']:
        if m['kind']=='text':texts.append(text_box(m['text'],m['at'],m['height'],m.get('anchor','mm'),m.get('angle',0)))
    for vi,v in enumerate(sheet['views']):
        sc,off=render.view_xf(v);gb=geometry[vi];pts=points[vi]
        if gb is None:continue
        targets=[m for m in v['annotations'] if m['kind']=='text' and m.get('role') in ('aux','detail','section','label')]
        targets += [m for d in v['dimensions'] for m in d['draw'] if m['kind']=='text']
        for m in targets:
            old=np.array(m['at'])*sc+off
            box=text_box(m['text'],old,m['height'],m.get('anchor','mm'),m.get('angle',0))
            n=int(((pts[:,0]>box[0]+.6)&(pts[:,0]<box[2]-.6)&(pts[:,1]>box[1]+.6)&(pts[:,1]<box[3]-.6)).sum())
            own=next((i for i,b in enumerate(texts) if np.allclose(b,box,atol=1e-6)),None)
            others=[b for i,b in enumerate(texts) if i!=own]
            collision=any(box_overlap([box[0]+.6,box[1]+.6,box[2]-.6,box[3]-.6],[b[0]+.6,b[1]+.6,b[2]-.6,b[3]-.6]) for b in others)
            if n<=2 and not collision:continue
            if own is not None:texts.pop(own)
            tw,th=render.text_extent(m['text'],m['height']);candidates=[]
            for gap in (8,16,24,36,50,70,100):
                candidates += [[gb[2]+gap+tw/2,old[1]],[gb[0]-gap-tw/2,old[1]],
                    [old[0],gb[3]+gap+th/2],[old[0],gb[1]-gap-th/2]]
            def choose(candidates):
                good=[]
                for at in candidates:
                    b=text_box(m['text'],at,m['height'],'mm')
                    if b[0]<frame[0] or b[2]>frame[2] or b[1]<frame[1] or b[3]>frame[3]:continue
                    proposed=box_union(occupied[vi],b)
                    if any(box_overlap(proposed,r) for i,r in enumerate(occupied) if i!=vi and r is not None):continue
                    if any(box_overlap(b,r,2) for r in geometry+texts if r is not None):continue
                    good.append((float(np.linalg.norm(np.array(at)-old)),at,b))
                return min(good,key=lambda t:t[0]) if good else None
            best=choose(candidates)
            if best is None:best=choose([[x,y] for x in np.arange(frame[0]+tw/2,frame[2]-tw/2+1e-6,8) for y in np.arange(frame[1]+th/2,frame[3]-th/2+1e-6,8)])
            if best is None:raise SpecError(f"{sheet['sheet']}：文字无空白位置：{m['text']}")
            _,at,bestbox=best;m['at']=((np.array(at)-off)/sc).tolist();m['anchor']='mm';m['angle']=0
            occupied[vi]=box_union(occupied[vi],bestbox)
            v['annotations'].append(dict(kind='curve',curve=g2.line((old-off)/sc,m['at'],'thin'),role='text-callout'))
            texts.append(bestbox)
    for v in sheet['views']:protect_annotation_text(v)


def clear_auxiliary_letters(sheet):
    """独立试排入口。最终写出由 make_sheet(finalize=True) 在整图平移后统一留白。"""
    _move_auxiliary_letters(sheet)
    return protect_hatch_text(sheet)


def run(spec_path, ref_path=None, out_dir=None, dpi=240, sheet_filter=None):
    _PROJECT_CACHE.clear()
    spec = json.loads(Path(spec_path).read_text(encoding="utf-8-sig"))
    problem = spec.get("problem") or Path(spec_path).stem
    spec.setdefault('problem', problem)
    ref_path = Path(ref_path) if ref_path else HERE / "参考答案" / f"第{problem}题.json"
    if spec.get('format')=='终稿实测图元':
        return replay_delivery(spec_path,spec,ref_path,out_dir,dpi,sheet_filter)
    desc = model.load(ref_path)
    if not spec.get('_drawing_planned'):
        spec, _, _ = plan_problem(spec, desc)
    mdl = model.build(desc)
    for p in mdl.parts:
        for w in p.warnings:
            warn(w)
        if p.error:
            raise SpecError(f"参考描述生成失败：零件 {p.error['part']} 第 {p.error['step']} 个特征：{p.error['message']}")
    out_dir = Path(out_dir) if out_dir else PUBLIC
    out_dir.mkdir(parents=True, exist_ok=True)
    sheets = spec["sheets"]
    title = spec.get("title", "")
    written = []
    private = HERE / "图纸几何" if out_dir == PUBLIC else out_dir / "出题端几何"
    private.mkdir(parents=True, exist_ok=True)
    out_dir = out_dir / problem   # 公开图纸按题号分文件夹：<输出目录>/NN/NN-张次.png
    out_dir.mkdir(parents=True, exist_ok=True)
    for i, sheet in enumerate(sheets, start=1):
        sheet.setdefault("id", problem if len(sheets) == 1 else f"{problem}-{i}")
        if sheet_filter and sheet["id"] not in sheet_filter:
            continue
        sj = make_sheet(sheet, mdl, problem, sheet.get("title", title), i, len(sheets), dpi, finalize=True)
        jpath = out_dir / f"{sheet['id']}.json"
        (private / jpath.name).write_text(json.dumps(sj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        public = public_sheet(sj)
        validate_public(public)
        jpath.write_text(json.dumps(public, ensure_ascii=False, indent=2), encoding="utf-8")
        with drawing_common.render_style(drawing_layout.drawing_style(sj['paper']['size'])):
            img = render.render_sheet(sj).image()
        ppath = out_dir / f"{sheet['id']}.png"
        img.save(ppath, optimize=True, dpi=(dpi, dpi))
        written += [ppath, jpath]
        print(f"已出图：{ppath.name}（{sj['paper']['size']}，比例 {sj['scale']}，{len(sj['views'])} 个视图）")
    return written


def sandbox(problem, out_dir, dpi=240, sheet_filter=None):
    """单题规格/私有 JSON/公开 JSON/PNG 全部写到 out_dir；正式目录只读。"""
    from advanced_parts import problem_data
    out = drawing_common.sandbox_directory(out_dir)
    data = problem_data(problem)
    pid = data['problem']
    reference = HERE/'参考答案'/f'第{pid}题.json'
    before = drawing_common.assert_reference(reference, data['description'])
    try:
        report=delivery_problem((pid,out,dpi,False),sheet_filter=sheet_filter)
        return [out/pid/(key+suffix) for key in report['sheets']
                if not sheet_filter or key in sheet_filter for suffix in ('.png','.json')]
    finally:
        assert reference.read_bytes() == before, f'沙箱出图修改了参考答案：{reference}'


def freeze_samples(out_dir, problems=('08', '13', '19', '21', '25')):
    """冻结 HEAD 已生成的候选投影和标注；不出新图、不改正式材料。"""
    from advanced_parts import problem_data
    out = drawing_common.sandbox_directory(out_dir)
    root = HERE.parents[4]
    revision = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
    task_dir = drawing_common.git_task_directory(root, revision)
    for problem in problems:
        data = problem_data(problem)
        pid = data['problem']
        drawing_common.assert_reference(HERE/'参考答案'/f'第{pid}题.json', data['description'])
        spec, candidates, dimensions = plan_problem(data['spec'], data['description'])
        by_key = {v['view_key']: v for v in candidates}
        by_id = {d['_id']: d for d in dimensions}
        projections = {}
        projection_keys = {}
        for sheet in spec['sheets']:
            relative = (task_dir/'图纸几何'/f"{sheet['id']}.json").as_posix()
            head = json.loads(subprocess.check_output(['git', 'show', f'{revision}:{relative}'], cwd=root))
            by_name = {v['name']: v for v in head['views']}
            for definition in sheet['views']:
                candidate = by_key[definition['view_key']]
                view = by_name[candidate['name']]
                scale = view['placement']['scale']
                projection = {key: view[key] for key in ('lines', 'hatches')}
                encoded = json.dumps(projection, ensure_ascii=False, separators=(',', ':'))
                if encoded not in projection_keys:
                    projection_keys[encoded] = f'P{len(projections)+1}'
                    projections[projection_keys[encoded]] = projection
                candidate['projection_key'] = projection_keys[encoded]
                candidate['head_placement'] = view['placement']
                candidate['geometry_bbox'] = project.geometry_bounds(projection)
                geometry_box = [v*scale for v in candidate['geometry_bbox']]
                bbox = box_union(geometry_box, drawing_common.marks_bounds(view['annotations'], scale))
                candidate['head_annotations'] = view['annotations']
                for dimension in view['dimensions']:
                    target = by_id[dimension['id']]
                    assert target['value'] == dimension['value'], (pid, target['_id'])
                    dim_box = drawing_common.marks_bounds(dimension['draw'], scale)
                    target['head_layout'] = dict(draw=dimension['draw'], bbox=dim_box,
                        text=dimension['text'], scale=scale)
                    bbox = box_union(bbox, dim_box)
                candidate['head_bbox'] = bbox
        frozen = dict(format='机械图纸接缝冻结样例', version=1, head=revision,
            problem=pid, title=spec['title'], units='mm', parts=data['description']['parts'],
            candidates=candidates, projections=projections, dimensions=dimensions, head_sheets=data['spec']['sheets'])
        (out/f'{pid}.json').write_text(json.dumps(frozen, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
        print(f'冻结 {pid}：{len(candidates)} 个候选，{len(dimensions)} 条尺寸')


def prepare_delivery(problem, out, handoff):
    """三维规格与实测投影的输入校验；缓存只写在指定沙箱。"""
    from advanced_parts import problem_data
    data=problem_data(problem)
    drawing_common.assert_reference(HERE/'参考答案'/f'第{problem}题.json',data['description'])
    views,aliases,owners=drawing_views.delivery_views(data,handoff,HERE/'图纸几何',
        baseline=(HERE.parents[4], 'b383021e5fa8eb4bc458f79acaa1e28368657c9e'))
    assigned,missing=drawing_dimensions.resolve_delivery(data,views,aliases,owners,handoff)
    used={d['view_key'] for d in assigned.values()}
    for k,idx in views.items():
        c=idx.c
        if c.get('kind')=='basic' and not c.get('section') and not c.get('keep') and c.get('spec',{}).get('type') in BASIC:
            used.add(k)
    def save(name,value):
        (out/name).write_text(json.dumps(value,ensure_ascii=False,separators=(',',':')),encoding='utf8')
    out.mkdir(parents=True,exist_ok=True)
    save('views.json',{k:dict(c={field:v for field,v in idx.c.items() if field not in ('_a_features','witness_elements','_candidate')},
                              g={f:idx.geometry[f] for f in ('lines','hatches')}) for k,idx in views.items() if k in used})
    save('dimensions.json',list(assigned.values()))
    save('missing.json',missing)
    print(problem,len(assigned),'已归属；未归属',missing,flush=True)
    return missing


def export_delivery(problem,out,views,dimensions,dpi=240,sheet_filter=None):
    """同一次布局产生私有图元、公开目录和 PNG，逐个 D 核对实际文字和数值。"""
    from advanced_parts import problem_data
    data=problem_data(problem)
    ref=HERE/'参考答案'/f'第{problem}题.json'
    original=drawing_common.assert_reference(ref,data['description'])
    catalog={d['_id']:d for sh in data['spec']['sheets'] for d in sh['dimensions']}
    if {d['_id']:d['value'] for d in dimensions}!={k:d['value'] for k,d in catalog.items()} or len(dimensions)!=len(catalog):
        raise SpecError(f'{problem} 尺寸目录不完整')
    part_names={str(i):p.title for i,p in enumerate(data['parts'],1)}
    pages=drawing_layout.delivery_pages(views,dimensions)
    exceptions=[]
    # 装配总图另配完整明细和两个实投影；零件尺寸页保留序号。
    if len(part_names)>1:
        overall=[]
        for key,v in views.items():
            c=v['c']
            if c['frame']=='assembly' and c.get('kind')=='basic' and not c.get('section') and not c.get('keep') and c.get('direction') not in [views[p['key']]['c']['direction'] for p in overall]:
                balloons=[b for b in data['spec']['sheets'][0].get('balloons',[]) if b['view']==c['name']]
                overall.append(dict(key=key,dims=[],rows=0,frame='assembly',balloons=balloons))
            if len(overall)==2:break
        if len(overall)==2:pages.insert(0,[overall])
    def info_for(page_no,rows):
        assembly=rows[0][0]['frame']=='assembly'
        info=dict(title=data['name']+(' · 装配' if assembly else ''),drawing_no=f'JX-{problem}-{page_no}',
                  material='',quantity='',scale_text='各视图见图注')
        bom=data['spec']['sheets'][0].get('parts_list',[]) if assembly and page_no==1 else []
        notes=[]
        if page_no==(2 if len(part_names)>1 else 1):
            notes=list(dict.fromkeys(n for sh in data['spec']['sheets'] for n in sh.get('notes',[]) if n!='技术要求'))
            notes.append('图中字母标出测点，两点间按所注方向量取。')
        if any(any(l['type']=='phantom' for l in views[p['key']]['g']['lines'])
               and ('工序断面' in views[p['key']]['c']['name'] or '回转母线' in views[p['key']]['c']['name'])
               for row in rows for p in row):
            notes.append('双点画线为工序轮廓或回转母线，实线为成品断面。')
        owners={str(views[p['key']]['c'].get('part')) for row in rows for p in row}
        if not assembly and len(owners)==1:
            info['material']=next((s.get('material','') for s in data['spec']['sheets'] if str(s.get('part')) in owners),'')
        return info,bom,notes
    def draw(page_no,rows,count):
        info,bom,notes=info_for(page_no,rows)
        frame,box,_=drawing_layout.sheet_frame('A3',info,page_no,count,bom,notes)
        x0,y0,x1,y1=box; bands=len(rows);pitch=(y1-y0)/bands
        actual=[]
        for r,row in enumerate(rows):
            top=y1-r*pitch;bottom=top-pitch
            if r:frame.line([x0,top],[x1,top],'thin',role='panel-divider')
            for j,panel in enumerate(row):
                dx=(x1-x0)/len(row)
                cell=[x0+j*dx,bottom+1,x0+(j+1)*dx,top-1]
                if j:frame.line([cell[0],cell[1]],[cell[0],cell[3]],'thin',role='panel-divider')
                try:
                    trial=dict(panel,occupied_names={u['name'] for u in actual})
                    v=drawing_layout.delivery_panel(views,trial,cell,len(row)>1,part_names)
                except drawing_layout.LayoutError as error:
                    error.panel=panel
                    raise
                actual.append(v)
        frame_type=rows[0][0]['frame']
        owner={str(views[p['key']]['c'].get('part')) for row in rows for p in row}
        doc=dict(format='机械结构重建·图纸',version=1,problem=problem,sheet=f'{problem}-{page_no}',sheet_index=page_no,
                 sheet_count=count,title=info['title'],frame=frame_type,part=next(iter(owner)) if len(owner)==1 and frame_type=='part' else None,
                 paper=dict(size='A3',width=420,height=297),dpi=dpi,projection='第一角画法',units='毫米',
                 scale=info['scale_text'],title_block=info,parts_list=bom,notes=notes,conventions=CONVENTIONS,
                 views=actual,sheet_marks=frame.to_view(1))
        return protect_hatch_text(doc)
    # 真纸面容不下的图组二分，最多到单个原 D；不丢标注。
    docs=[];i=0
    while i<len(pages):
        rows=pages[i]
        if len(rows)==1 and i+1<len(pages):
            following=pages[i+1]
            first=following[0]
            if (first[0]['frame']==rows[0][0]['frame']
                    and sum(len(p['dims']) for row in (rows[0],first) for p in row)<=25):
                rows.append(following.pop(0))
                if not following:pages.pop(i+1)
        if sum(map(len,rows))==1:
            panel=rows[0][0]; c=views[panel['key']]['c']
            locator=next((k for k,rec in views.items() if k!=panel['key'] and rec['c']['frame']==c['frame']
                          and rec['c'].get('part')==c.get('part') and rec['c'].get('role')=='overview'
                          and rec['c']['direction']!=c['direction']),None)
            if locator:rows.append([dict(key=locator,dims=[],rows=0,frame=c['frame'])])
        try:
            doc=draw(i+1,rows,len(pages))
        except drawing_layout.LayoutError as error:
            failed=getattr(error,'panel',None)
            if failed is None:raise
            row_i=next(j for j,row in enumerate(rows) if any(p is failed for p in row))
            if len(rows[row_i])>1:
                split=rows[:row_i]+[[p] for p in rows[row_i]]+rows[row_i+1:]
            else:
                ds=failed['dims']
                if len(ds)<2:raise
                n=(len(ds)+1)//2
                split=rows[:row_i]+[[dict(failed,dims=a,rows=len(a))] for a in (ds[:n],ds[n:])]+rows[row_i+1:]
            pages[i:i+1]=[split[j:j+2] for j in range(0,len(split),2)]
            exceptions.append(str(error))
            continue
        docs.append(doc)
        i+=1
    public_dir=out/problem;private=out/'出题端几何';spec_dir=out/'出图规格'
    for path in (public_dir,private,spec_dir):path.mkdir(parents=True,exist_ok=True)
    proof_dir=out/'看图'/problem
    if problem in ('03','08','13','16','19','21','22','25'):proof_dir.mkdir(parents=True,exist_ok=True)
    manifest=out/'工作'/problem/'report.json'
    previous=json.loads(manifest.read_bytes()) if manifest.is_file() else {}
    seen={}; plans=[]; methods={}
    def write(path,obj):path.write_text(json.dumps(obj,ensure_ascii=False,separators=(',',':')),encoding='utf8')
    for i,(doc,rows) in enumerate(zip(docs,pages),1):
        info,bom,notes=info_for(i,rows)
        if doc['sheet_count']!=len(pages):
            marks,_,_=drawing_layout.sheet_frame('A3',info,i,len(pages),bom,notes)
            doc['sheet_marks']=marks.to_view(1)+[m for m in doc['sheet_marks'] if m.get('role')=='panel-divider']
            doc['sheet_count']=len(pages)
        sheet_id=doc['sheet']
        for view in doc['views']:
            for d in view['dimensions']:
                ident=d['id']
                label=''.join(m['text'] for m in d['draw'] if m.get('role')=='dimension-text')
                if ident in seen or ident not in label or d['value']!=catalog[ident]['value']:raise SpecError((sheet_id,ident,label))
                seen[ident]=sheet_id
                method=d['_dimension_witness']['method'];methods[method]=methods.get(method,0)+1
        write(private/(sheet_id+'.json'),doc)
        if not sheet_filter or sheet_id in sheet_filter:
            write_delivery_page(doc,public_dir,proof_dir if proof_dir.is_dir() else None)
        plans.append(dict(id=sheet_id,frame=doc['frame'],paper='A3',views=[dict(name=v['name'],definition=v['definition'],
                          placement=v['placement'],view_key=v['view_key']) for v in doc['views']],
                          dimensions=[d for row in rows for p in row for d in p['dims']],private_file='出题端几何/'+sheet_id+'.json'))
    if set(seen)!=set(catalog):raise SpecError((problem,'绘制 D 缺项',set(catalog)-set(seen)))
    assert ref.read_bytes()==original
    write(spec_dir/(problem+'.json'),dict(problem=problem,title=data['name'],format='终稿实测图元',sheets=plans))
    report=dict(problem=problem,head=len(data['spec']['sheets']),pages=len(pages),drawn=len(seen),total=len(catalog),
                methods=methods,exceptions=list(dict.fromkeys(exceptions)),sheets={s['id']:{'views':len(s['views']),'dimensions':len(s['dimensions'])} for s in plans})
    if not sheet_filter:
        for stale in previous.get('sheets',{}).keys()-report['sheets'].keys():
            if not re.fullmatch(re.escape(problem)+r'-[1-9]\d*',stale):
                raise SpecError(f'旧沙箱图号无效 {stale}')
            for directory,suffix in ((public_dir,'.png'),(public_dir,'.json'),(private,'.json'),(proof_dir,'.png')):
                (directory/(stale+suffix)).unlink(missing_ok=True)
    write(manifest,report)
    print(problem,'已出图',len(pages),len(seen),'/',len(catalog),flush=True)
    return report


def delivery_problem(job, *, sheet_filter=None):
    problem,out,dpi,reuse=job
    out=drawing_common.sandbox_directory(out)
    stage=out/'工作'/problem
    handoff=HERE.parents[4]/'调研/机械图纸重画/沙箱/C/交付'/problem
    if not reuse or not all((stage/name).is_file() for name in ('views.json','dimensions.json','missing.json')):
        prepare_delivery(problem,stage,handoff)
    missing=json.loads((stage/'missing.json').read_bytes())
    if missing:raise SpecError(f'{problem} 原尺寸未解决：{missing}')
    return export_delivery(problem,out,json.loads((stage/'views.json').read_bytes()),
                           json.loads((stage/'dimensions.json').read_bytes()),dpi,sheet_filter)


def delivery_suite(out,dpi,problems=None,reuse=False):
    from concurrent.futures import ProcessPoolExecutor,as_completed
    out=drawing_common.sandbox_directory(out)
    pids=problems or [f'{n:02d}' for n in range(1,26)]
    jobs=[(pid,out,dpi,reuse) for pid in pids]
    if len(jobs)==1:return [delivery_problem(jobs[0])]
    results=[];errors=[]
    with ProcessPoolExecutor(max_workers=min(6,len(jobs))) as pool:
        tasks={pool.submit(delivery_problem,job):job[0] for job in jobs}
        for future in as_completed(tasks):
            try:results.append(future.result())
            except Exception as exc:
                errors.append((tasks[future],str(exc)))
                print(tasks[future],str(exc),file=sys.stderr,flush=True)
    if errors:raise SpecError(errors)
    return sorted(results,key=lambda item:item['problem'])


def write_delivery_page(doc, public_dir, proof_dir=None):
    from PIL import Image
    public = public_sheet(doc)
    validate_public(public)
    public_dir.mkdir(parents=True, exist_ok=True)
    path = public_dir / doc['sheet']
    path.with_suffix('.json').write_text(json.dumps(public, ensure_ascii=False, separators=(',',':')), encoding='utf8')
    with drawing_common.render_style(drawing_layout.drawing_style(doc['paper']['size'])):
        image = render.render_sheet(doc).image()
    dpi = doc['dpi']
    image.save(path.with_suffix('.png'),dpi=(dpi,dpi),compress_level=3)
    if proof_dir:
        image.thumbnail((1300,1300),Image.Resampling.LANCZOS)
        image.save(proof_dir / (doc['sheet']+'.png'),compress_level=3)
    return [path.with_suffix('.png'),path.with_suffix('.json')]


def replay_delivery(spec_path, spec, reference, out_dir, dpi, sheet_filter):
    """终稿规格以同一交付根目录内的私有图元为依据，支持逐张重绘与重设 DPI。"""
    from advanced_parts import problem_data
    if out_dir is None:
        raise SpecError('终稿沙箱重绘须指定 --out')
    out = drawing_common.sandbox_directory(out_dir)
    pid = spec['problem']
    data = problem_data(pid)
    drawing_common.assert_reference(reference,data['description'])
    catalog = {d['_id']:d['value'] for s in data['spec']['sheets'] for d in s['dimensions']}
    planned = [d for s in spec['sheets'] for d in s['dimensions']]
    if len(planned)!=len(catalog) or {d['_id']:d['value'] for d in planned}!=catalog:
        raise SpecError(f'{pid} 终稿规格尺寸目录与原题不一致')
    sources = Path(spec_path).resolve().parent.parent
    results = []
    for i,sheet in enumerate(spec['sheets'],1):
        sid = f'{pid}-{i}'
        relative = sheet['private_file']
        if sheet['id']!=sid or relative not in ('出题端几何/'+sid+'.json','图纸几何/'+sid+'.json'):
            raise SpecError(f'{sid} 私有图纸索引不符')
        if sheet_filter and sid not in sheet_filter:
            continue
        doc = json.loads((sources / relative).read_bytes())
        public = public_sheet(doc)
        if (doc['sheet']!=sid or doc['problem']!=pid or doc['sheet_count']!=len(spec['sheets'])
                or {d['id']:d['value'] for d in public['dimensions']}!={d['_id']:d['value'] for d in sheet['dimensions']}
                or [(v['name'],v['view_key'],v['definition'],v['placement']) for v in doc['views']]
                    !=[(v['name'],v['view_key'],v['definition'],v['placement']) for v in sheet['views']]):
            raise SpecError(f'{sid} 私有图纸与规格不一致')
        doc['dpi']=dpi
        (out/'出题端几何').mkdir(exist_ok=True)
        (out/'出题端几何'/(sid+'.json')).write_text(json.dumps(doc,ensure_ascii=False,separators=(',',':')),encoding='utf8')
        results.extend(write_delivery_page(doc,out/pid))
    return results


def audit_delivery_problem(job):
    """从 Git 原目录和已落盘的 PNG/两份 JSON 独立复核一个题号。"""
    import csv
    from collections import Counter
    from PIL import Image, ImageChops
    from advanced_parts import problem_data
    root, pid, approved = job
    repo = HERE.parents[4]
    task_dir = drawing_common.git_task_directory(repo, 'HEAD')
    def head_path(path):
        return 'HEAD:' + (task_dir / path.relative_to(HERE)).as_posix()
    def head_file(relative):
        return subprocess.check_output(['git','show',head_path(relative)], cwd=repo)
    original = json.loads(head_file(HERE/'出图规格'/(pid+'.json')))
    catalog = {d['_id']:d for d in drawing_common.ensure_dimension_ids(original)}
    ref = HERE/'参考答案'/f'第{pid}题.json'
    data = problem_data(pid)
    exact = drawing_common.assert_reference(ref,data['description'])
    # Git 索引通常存 LF，工作区按 checkout 属性展开后再逐字节对照。
    head_ref = subprocess.check_output(['git','cat-file','--filters',head_path(ref)],cwd=repo)
    if exact!=head_ref:
        raise SpecError(f'{pid} 参考答案与 HEAD checkout 字节不同')
    plan=json.loads((root/'出图规格'/f'{pid}.json').read_bytes())
    ids=[s['id'] for s in plan['sheets']]
    gallery_pid=pid in ('03','08','13','16','19','21','22','25')
    def stems(folder,pattern):
        return {f.stem for f in folder.glob(pattern)}
    if (set(ids)!=stems(root/pid,'*.png') or set(ids)!=stems(root/pid,'*.json')
            or set(ids)!=stems(root/'出题端几何',pid+'-*.json')
            or gallery_pid and set(ids)!=stems(root/'看图'/pid,'*.png')):
        raise SpecError(f'{pid} 页目录与图纸文件不一致')
    records={}; counts=Counter(); specials=[]; view_counts=[];loads=[];sections=0;process=[]
    for page_no,sheet in enumerate(plan['sheets'],1):
        sid=sheet['id']
        doc=json.loads((root/sheet['private_file']).read_bytes())
        pub=json.loads((root/pid/(sid+'.json')).read_bytes())
        validate_public(pub)
        if pub!=public_sheet(doc) or doc['sheet_count']!=len(ids) or doc['sheet_index']!=page_no:
            raise SpecError(f'{sid} 公开目录或页码与私有图纸不一致')
        n=len(pub['dimensions'])
        if not 2<=len(doc['views'])<=4 or n>25:
            raise SpecError(f'{sid} 图数或尺寸数超限')
        view_counts.append(len(doc['views']));loads.append(n)
        if {d['_id']:d['value'] for d in sheet['dimensions']}!={d['id']:d['value'] for d in pub['dimensions']}:
            raise SpecError(f'{sid} 规格尺寸与图纸不符')
        canvas=render.Canvas(doc['paper']['width'],doc['paper']['height'],doc['dpi'],'L')
        for v in doc['views']:
            scale,origin=render.view_xf(v)
            panel=v['_panel_bounds']
            texts=v['annotations']+[m for d in v['dimensions'] for m in d['draw']]
            for m in texts:
                if m['kind']!='text':continue
                at=np.asarray(m['at'])*scale+origin
                box=text_box(m['text'],at,m['height'],m.get('anchor','mm'),m.get('angle',0))
                if not drawing_layout._contains([panel[0]-.5,panel[1]-.5,panel[2]+.5,panel[3]+.5],box):
                    raise SpecError(f"{sid} 文字越出所属图位：{m['text']}")
            drawn_letters={m['text'] for d in v['dimensions'] for m in d['draw'] if m.get('role')=='dimension-datum'}
            idx=drawing_dimensions.ProjectedDatums({},v)
            idx.lines.extend(c for c in v['lines'] if c['type']=='phantom')
            if v['definition'].get('section'):
                if not any(m.get('role')=='cut-trace' for m in v['annotations']):
                    raise SpecError(f"{sid} {v['name']} 缺少剖切位置")
                sections+=1
            for d in v['dimensions']:
                key=d['id']; proof=d['_dimension_witness']; method=proof['method']
                marks=[m for m in d['draw'] if m.get('role')=='dimension-text']
                message=''.join(m['text'] for m in marks)
                numbers=re.findall(r'(?<![\d.])-?\d+(?:\.\d+)?',re.sub(r'D\d+','',message))
                correct=any(abs(float(x)-d['value'])<1e-6 for x in numbers)
                if (key in records or key not in catalog or d['value']!=catalog[key]['value']
                        or d['category']!=catalog[key]['category'] or not re.search(r'(?<![A-Za-z0-9])'+key+r'(?!\d)',message)
                        or not correct or not all(m['height']>=7 for m in marks)):
                    raise SpecError(f'{sid} {key} 数值、原义或标注文字不符：{message}')
                if not set(d['_datum_labels'])<=drawn_letters:
                    raise SpecError(f'{sid} {key} 缺测点字母')
                qs=drawing_layout.delivery_targets(d)
                if not all(idx.hit(q) for q in qs):
                    raise SpecError(f'{sid} {key} 测点离开本图曲线')
                if proof['mode']=='linear' and abs(abs((qs[1]-qs[0])@proof['direction'])-d['value'])>.035:
                    raise SpecError(f'{sid} {key} 投影长度与原值不符')
                if key in approved:
                    if approved[key] not in ''.join(message.split()):
                        raise SpecError(f'{sid} {key} 加工深度标注与批准文本不同：{message}')
                    process.append(key)
                if method=='operation' or '过原回转轴的成品断面' in proof.get('derivation',''):
                    specials.append((key,sid,v['name'],d['text']))
                visual='测点字母' if d['_datum_labels'] else ('双箭头' if proof['mode']=='linear' else '短引线')
                records[key]=(pid,key,sid,v['name'],d['value'],d['category'],method,visual,message)
                counts[method]+=1
                letters=[m for m in d['draw'] if m.get('role')=='dimension-datum']
                render.draw_marks(canvas,marks+letters,*render.view_xf(v))
        with Image.open(root/pid/(sid+'.png')) as img:
            mask=np.asarray(canvas.image())
            if img.size!=canvas.size or np.any((mask<24)&(np.asarray(img.convert('L'))>88)):
                raise SpecError(f'{sid} 实际 PNG 缺少标注字形')
            if gallery_pid:
                thumb=img.copy()
                thumb.thumbnail((1300,1300),Image.Resampling.LANCZOS)
                with Image.open(root/'看图'/pid/(sid+'.png')) as preview:
                    if max(preview.size)!=1300 or preview.size!=thumb.size or ImageChops.difference(thumb,preview).getbbox():
                        raise SpecError(f'{sid} 缩图与原页不同')
    if set(records)!=set(catalog) or set(process)!=set(approved):
        raise SpecError(f'{pid} 原 D 或加工深度缺项')
    order=lambda k:int(k[1:])
    with (root/'工作'/pid/'逐D核对.csv').open('w',encoding='utf-8-sig',newline='') as f:
        w=csv.writer(f);w.writerow(['题号','原D','页号','视图','原数值','原类别','见证方法','图上标法','实际绘制文字'])
        w.writerows(records[k] for k in sorted(records,key=order))
    return dict(pid=pid,head=len(original['sheets']),pages=len(ids),dimensions=len(records),counts=counts,
                specials=sorted(specials,key=lambda x:order(x[0])),process=[(k,records[k][2]) for k in sorted(process,key=order)],
                loads=loads,views=view_counts,sections=sections,gallery=gallery_pid,
                letters=sum(row[7]=='测点字母' for row in records.values()))


def audit_delivery(root):
    from concurrent.futures import ProcessPoolExecutor
    root=drawing_common.sandbox_directory(root)
    approved={}
    notes=HERE.parents[4]/'调研/机械图纸重画/沙箱/C/交付/加工深度21项.md'
    for line in notes.read_text(encoding='utf8').splitlines():
        cells=line.strip('|').split('|')
        if len(cells)==6 and cells[0].isdigit():
            approved.setdefault(cells[0],{})[cells[1]]=''.join(cells[3].split())
    if sum(map(len,approved.values()))!=21:raise SpecError('原加工深度清单不是 21 项')
    jobs=[(root,f'{i:02}',approved.get(f'{i:02}',{})) for i in range(1,26)]
    with ProcessPoolExecutor(max_workers=4) as pool:
        rows=list(pool.map(audit_delivery_problem,jobs))
    total=sum(r['dimensions'] for r in rows);sheets=sum(r['pages'] for r in rows);head=sum(r['head'] for r in rows)
    letter_count=sum(r['letters'] for r in rows)
    widths=[v for r in rows for v in r['views']]
    loads=[n for r in rows for n in r['loads']]
    gallery=sum(r['pages'] for r in rows if r['gallery'])
    body=['# 机械结构重建逐题复核','',
          f'25 题共 {sheets} 张，HEAD 共 {head} 张。原有 {total} 个 D 全部落图。每张 {min(widths)}–{max(widths)} 个主图位，最多 {max(loads)} 个尺寸。装配首页提供总图和零件明细。','',
          f'从 HEAD 逐 D 读取原编号、类别和值，与终稿规格、公开目录和私有标注交叉核对。每个引出点都落在该图的有限曲线上。双端标注另核对沿测量方向的投影长度。复核程序在相同纸面位置独立栅格化尺寸文字与测点字母，逐张检查存盘 PNG 对应的墨迹。25 份参考答案与原生成文本及 HEAD 检出字节一致。','',
          f'其中 {letter_count} 个尺寸用短引线标字母，数值和测量方向列在同一视图内，其余尺寸就近标值。加工深度 21 项按 C 的原文逐项核对。八题全部 {gallery} 张预览均由完整 PNG 等比缩到长边 1300 px，已逐像素对照。','',
          '## 各题','',
          '| 题号 | 新张数 / HEAD | 图上 D / 原 D | 每页最多 D | 身份见证 | 几何双端 | 局部引线说明 | 补剖 | 工序断面 | 逐 D 明细 |',
          '|---|---:|---:|---:|---:|---:|---:|---:|---:|---|']
    for r in rows:
        p=r['pid'];c=r['counts'];n=r['dimensions']
        link=f'[{p}](看图/{p}/)' if r['gallery'] else p
        body.append(f'| {link} | {r["pages"]} / {r["head"]} | {n} / {n} | {max(r["loads"])} | '
                    +' | '.join(str(c.get(k,0)) for k in ('identity','geometry','callout','section','operation'))
                    +f' | [核对表](工作/{p}/逐D核对.csv) |')
    body+=['','## 例外与读图','','原图中的加工行程和已被后续加工消除的轮廓需要结合工序理解。下表列出逐项页号。其余局部引线、补剖和字母标法均可在逐 D 明细按方法或页号筛选。','',
           '| 题号 | 原 D | 图号 | 说明 |','|---|---|---|---|']
    for r in rows:
        for k,sid,name,msg in r['specials']:
            body.append(f'| {r["pid"]} | {k} | [{sid}]({r["pid"]}/{sid}.png) | {name}。{msg} |')
        for k,sid in r['process']:
            body.append(f'| {r["pid"]} | {k} | [{sid}]({r["pid"]}/{sid}.png) | {approved[r["pid"]][k]} |')
    body+=['','工序断面以双点画线给出原工序边界，实线表示成品。20 题回转剖面也用双点画线给出原母线，用于判读轴线闭合与内锥。带“剖位”的小图给出对应剖面的剖切位置和观察方向。字母仅在本图位内有效。','',
           '部分铸件的页数超过早期张数目标。以 19 题为例，213 个尺寸按每页上限 25 项至少需要 9 张，实际还须给斜接口、内部通道和长加工说明留出图位。各题的实际页数和例外以表中数据为准。','']
    (root/'逐题报告.md').write_text('\n'.join(body),encoding='utf8')
    gallery_index=['# 整页看图','',f'长边 1300 px，共 {gallery} 张。每行按纸面张次排列。','']
    for r in rows:
        if r['gallery']:
            pid=r['pid']
            links=' · '.join(f'[{i}]({pid}/{pid}-{i}.png)' for i in range(1,r['pages']+1))
            gallery_index.extend([f'**第 {pid} 题**（共 {r["pages"]} 张）  ',links,''])
    (root/'看图'/'目录.md').write_text('\n'.join(gallery_index),encoding='utf8')
    print(f'独立回读通过：{sheets}/{head} 张，{total}/{total} D，{gallery} 张缩图，{sum(len(r["specials"]) for r in rows)} 项工序或回转说明',flush=True)
    return rows


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("spec", nargs="*", help="出图规格 JSON")
    ap.add_argument("--ref", help="参考建模描述（默认 参考答案/第NN题.json）")
    ap.add_argument("--out", help="输出目录（默认 专题/十项全能/题面/几何建模/机械结构重建/；图纸写在其下的题号文件夹）")
    ap.add_argument("--dpi", type=int, default=240, help="PNG 分辨率；200—300 dpi，默认240")
    ap.add_argument("--all", action="store_true", help="处理 出图规格/ 下全部规格")
    ap.add_argument("--sheets", help="只重出指定图号，逗号分隔；尺寸编号仍按完整题目分配")
    ap.add_argument('--sandbox', help='只生成指定题号到 --out，正式材料只读')
    ap.add_argument('--delivery',help='按终稿口径一次生成沙箱；all 或逗号分隔题号')
    ap.add_argument('--audit-delivery',action='store_true',help='回读 --out 中全部 25 题图纸并生成逐题报告')
    ap.add_argument('--reuse-projections',action='store_true',help='沿用同一沙箱已核对的逐题投影和归属')
    ap.add_argument('--freeze-samples', action='store_true', help='冻结 08/13/19/21/25 的 HEAD 投影及尺寸到 --out')
    args = ap.parse_args()
    if args.audit_delivery:
        if not args.out or args.delivery or args.sandbox or args.spec or args.all or args.freeze_samples:
            ap.error('--audit-delivery 须单独指定 --out')
        audit_delivery(args.out)
        return
    if args.delivery:
        if not args.out or args.spec or args.all or args.sandbox or args.ref or not 200<=args.dpi<=300:
            ap.error('--delivery 须单独指定 --out 和 200–300 dpi')
        problems=None if args.delivery=='all' else [f'{int(x):02d}' for x in args.delivery.split(',')]
        delivery_suite(args.out,args.dpi,problems,args.reuse_projections)
        return
    if args.sandbox or args.freeze_samples:
        if not args.out:ap.error('沙箱/样例必须指定 --out')
        if args.sandbox and args.freeze_samples:ap.error('--sandbox 与 --freeze-samples 不能同时使用')
        if args.spec or args.all or args.ref:ap.error('沙箱/样例不能混用规格、--all 或 --ref')
        if not 200<=args.dpi<=300:ap.error('图纸分辨率必须为200—300 dpi')
        if args.sandbox:
            sandbox(args.sandbox, args.out, args.dpi, set(args.sheets.split(',')) if args.sheets else None)
        else:
            freeze_samples(args.out)
        return
    specs = [Path(p) for p in args.spec]
    if args.all:
        specs = sorted((HERE / "出图规格").glob("*.json"))
    if not specs:
        ap.error("请给出出图规格文件或 --all")
    for sp in specs:
        spec = json.loads(sp.read_text(encoding="utf-8-sig"))
        big = any(s.get("paper", "A3") in ("A2", "A1") for s in spec.get("sheets", []))
        dpi = args.dpi or 240
        if not 200 <= dpi <= 300:
            ap.error("图纸分辨率必须为200—300 dpi")
        try:
            run(sp, args.ref, args.out, dpi, set(args.sheets.split(',')) if args.sheets else None)
        except (SpecError, model.ModelError, KeyError) as exc:
            print(f"出图失败（{sp.name}）：{exc}")
            sys.exit(1)


if __name__ == "__main__":
    main()

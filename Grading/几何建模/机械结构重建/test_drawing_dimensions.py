"""C 包回归；直接执行本文件可从冻结样例生成私有试排，不调用正式出图器。"""
import copy
import json
import sys
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pytest

import drawing_dimensions as dd
from drawing_common import Marks, Occupancy, g2, marks_bounds

ROOT = Path(__file__).resolve().parents[3]
SAMPLES = ROOT/'调研/机械图纸重画/沙箱/样例'
OUTPUT = ROOT/'调研/机械图纸重画/沙箱/C'


def candidate(key='v1', **kwargs):
    c = dict(view_key=key, name=key, part='1', frame='part', kind='basic',
             direction=[0, 1, 0], u=[1, 0, 0], v=[0, 0, 1], origin=[0, 0, 0],
             section=None, _head_sheet='s1', expresses=[], spec={})
    c.update(kwargs)
    return c


def box(x=0, width=40):
    return dict(type='extrude', plane='XY', loops=[dict(rect=[x, 0, x+width, 20])], depth=[0, 30], op='add')


def box_lines(x=0, width=40):
    return [g2.line(a, b, 'visible') for a, b in [([x, 0], [x+width, 0]), ([x+width, 0], [x+width, 30]),
            ([x+width, 30], [x, 30]), ([x, 30], [x, 0])]]


def linear(fid=1, value=40, start=None, end=None, ident='D1'):
    start, end = start or [0, 0, 0], end or [40, 20, 30]
    return dict(_id=ident, type='linear', value=value, text=str(value), view='v1', view_key='v1', _head_sheet='s1',
                category='链式或相对定位尺寸', source_feature=fid, covers_features=[fid],
                _witness_3d=dict(feature=box(), axis='X', point=end, shared_points=[dict(feature=fid, point=end)],
                                   **{'from': start, 'to': end}))


def context(features, projections):
    return dict(parts=[dict(name='1', features=features)],
                project_candidate=lambda c, scale=1.: projections[c['view_key']])


def view(c, projection, scale=1):
    bounds = g2.bounds(projection['lines'])
    bounds = [x*scale for x in bounds]
    v = SimpleNamespace(view_key=c['view_key'], candidate=c, vdef=c, name=c['name'],
                        geom=projection, scale=scale, marks=Marks(), box_geom=bounds, dims=[])
    v.occ = Occupancy(bounds)
    for curve in projection['lines']:
        v.occ.add_curve(g2.xform(curve, scale, (0, 0)))
    return v


def test_unique_assignment_preserves_original_and_does_not_use_legacy():
    dims = [linear()]
    original = copy.deepcopy(dims)
    a, b = candidate(), candidate('v2')
    ctx = context([box()], {c['view_key']: dict(lines=box_lines()) for c in [a, b]})
    assigned = dd.assign_dimensions(dims, [a, b], context=ctx, legacy=lambda: pytest.fail('legacy must not prove witnesses'))
    assert dims == original and len(assigned) == 1 and assigned[0]['view_key'] == 'v1'
    for key in ('_id', 'value', 'category', 'source_feature', 'covers_features', '_witness_3d'):
        assert assigned[0][key] == original[0][key]
    assert ctx['dimension_audit'][0]['sheet'] is None


def test_hidden_and_neighbor_contours_cannot_witness_target_feature():
    d, c = linear(), candidate()
    projection = dict(lines=[dict(x, type='hidden') for x in box_lines()]+box_lines(80))
    ctx = context([box(), box(80)], {'v1': projection})
    with pytest.raises(dd.DimensionAssignmentError) as error:
        dd.assign_dimensions([d], [c], context=ctx)
    assert error.value.unresolved[0]['id'] == 'D1'
    assert error.value.unresolved[0]['feature'] == 1
    assert not error.value.assignments


def test_coincident_projection_requires_feature_identity():
    other = box()
    other['loops'][0]['rect'][1:4:2] = [50, 70]
    ctx = context([box(), other], {'v1': dict(lines=box_lines())})
    with pytest.raises(dd.DimensionAssignmentError):
        dd.assign_dimensions([linear()], [candidate()], context=ctx)


def test_short_arc_arrow_stays_on_visible_arc():
    f = dict(type='extrude', plane='XZ', loops=[dict(circle=[20, 20], d=12)], depth=[0, 10], op='cut')
    c = candidate()
    arc = g2.arc([20, 20], 6, 12, 58, 'visible')
    d = dict(_id='D7', type='diameter', value=12, d=12, source_feature=1, covers_features=[1],
             view_key='v1', _witness_3d=dict(feature=f), category='孔径')
    assigned = dd.assign_dimensions([d], [c], context=context([f], {'v1': dict(lines=[arc])}))
    result = dd.layout_dimensions(view(c, dict(lines=[arc])), assigned, style={})
    assert not result['unresolved']
    arrows = [m for m in result['dimensions'][0]['marks'].items if m['kind'] == 'arrow']
    assert arrows and all(dd._distance(arc, m['tip']) < dd.TOL for m in arrows)


def test_diameter_rejects_wrong_radius_and_hidden_circle():
    f = dict(type='extrude', plane='XZ', loops=[dict(circle=[20, 20], d=12)], depth=[0, 10])
    d = dict(_id='D1', type='diameter', value=12, source_feature=1, covers_features=[1],
             view_key='v1', _witness_3d=dict(feature=f), category='孔径')
    lines = [g2.arc([20, 20], 5, 0, 360, 'visible'), g2.arc([20, 20], 6, 0, 360, 'hidden')]
    with pytest.raises(dd.DimensionAssignmentError):
        dd.assign_dimensions([d], [candidate()], context=context([f], {'v1': dict(lines=lines)}))


def test_depth_requires_longitudinal_section_and_real_termination():
    f = dict(type='hole', plane='XY', at=[20, 10], d=10, depth=20)
    d = dict(_id='D2', type='leader', text=['深20'], value=20, source_feature=1, covers_features=[1],
             view_key='v1', _witness_3d=dict(feature=f), category='孔深')
    lines = [g2.line([15, -20], [15, 0], 'visible'), g2.line([25, -20], [25, 0], 'visible'),
             g2.line([15, -20], [25, -20], 'visible'), g2.line([15, 0], [25, 0], 'visible')]
    ctx = context([f], {'v1': dict(lines=lines)})
    with pytest.raises(dd.DimensionAssignmentError):
        dd.assign_dimensions([d], [candidate()], context=ctx)
    c = candidate(section=dict(point=[0, 10, 0], mode='full'))
    assigned = dd.assign_dimensions([d], [c], context=ctx)
    proof = assigned[0]['_dimension_witness']
    assert proof['mode'] == 'linear'
    assert np.linalg.norm(np.array(proof['points'][1])-proof['points'][0]) == 20
    ctx['project_candidate'] = lambda c, scale=1.: dict(lines=lines[:2])
    with pytest.raises(dd.DimensionAssignmentError):
        dd.assign_dimensions([d], [c], context=ctx)


def test_finish_needs_final_edge_not_old_selection_point():
    f = dict(type='chamfer', edges=[[0, 0, 0]], distance=1)
    d = dict(_id='D3', type='leader', text='C1', value=1, view_key='v1', source_feature=1,
             covers_features=[1], category='45度等距倒角', _witness_3d=dict(feature=f))
    edge = g2.line([0, 1], [1, 0], 'visible')
    c, ctx = candidate(), context([f], {'v1': dict(lines=[edge])})
    with pytest.raises(dd.DimensionAssignmentError):
        dd.assign_dimensions([d], [c], context=ctx)
    c['witness_elements'] = [dict(part='1', feature=1, kind='final_edge', curve=edge,
                                  parameters=['distance'], provenance='final chamfer face boundary')]
    assigned = dd.assign_dimensions([d], [c], context=ctx)
    assert assigned[0]['_dimension_witness']['elements'][0]['kind'] == 'final_edge'


def test_diameter_between_real_section_generators_and_reject_offset_chord():
    f = dict(type='hole', plane='XY', at=[20, 10], d=10, depth=20)
    d = dict(_id='D4', type='leader', text=['Φ10'], value=10, source_feature=1, covers_features=[1],
             view_key='v1', _witness_3d=dict(feature=f), category='孔径')
    lines = [g2.line([15, -20], [15, 0], 'visible'), g2.line([25, -20], [25, 0], 'visible')]
    c = candidate(section=dict(point=[0, 10, 0], mode='full'))
    assigned = dd.assign_dimensions([d], [c], context=context([f], {'v1': dict(lines=lines)}))
    result = dd.layout_dimensions(view(c, dict(lines=lines)), assigned, style={})
    assert not result['unresolved']
    p, q = map(np.array, result['dimensions'][0]['_dimension_witness']['points'])
    assert np.linalg.norm(p-q) == pytest.approx(10)
    assert '母线' in assigned[0]['_dimension_witness']['derivation']
    c['section']['point'] = [0, 11, 0]
    with pytest.raises(dd.DimensionAssignmentError):
        dd.assign_dimensions([d], [c], context=context([f], {'v1': dict(lines=lines)}))


@pytest.mark.parametrize('scale', [.5, 1, 2])
def test_paper_gaps_overruns_font_and_complete_bbox(scale):
    c, projection = candidate(), dict(lines=box_lines())
    assigned = dd.assign_dimensions([linear()], [c], context=context([box()], {'v1': projection}))
    result = dd.layout_dimensions(view(c, projection, scale), assigned, style=dict(DIM_H=6.5, EXT_GAP=1.5, EXT_OVER=2.5))
    assert not result['unresolved']
    marks = result['dimensions'][0]['marks']
    assert result['bbox'] == marks_bounds(marks.to_view(scale), scale) == marks.box
    text = next(m for m in marks.items if m['kind'] == 'text')
    assert text['height'] == 8 and 'D1' in text['text']
    extensions = [m['curve'] for m in marks.items if m.get('role') == 'dimension-extension']
    line = next(m['curve'] for m in marks.items if m.get('role') == 'dimension-line')
    for ext in extensions:
        start, end = np.array(ext['from']), np.array(ext['to'])
        witnesses = [np.array(p)*scale for p in assigned[0]['_dimension_witness']['points']]
        assert min(np.linalg.norm(start-p) for p in witnesses) == pytest.approx(1.5)
        assert abs(end[1]-line['from'][1]) == pytest.approx(2.5)


def test_stale_projection_fails_instead_of_cross_marker():
    c, projection = candidate(), dict(lines=box_lines())
    assigned = dd.assign_dimensions([linear()], [c], context=context([box()], {'v1': projection}))
    result = dd.layout_dimensions(view(c, dict(lines=box_lines(80))), assigned, style={})
    assert result['unresolved'][0]['id'] == 'D1' and not result['dimensions'] and result['bbox'] is None


def test_long_extension_through_view_is_rejected():
    c, projection = candidate(), dict(lines=box_lines(width=200))
    d = linear(value=100, end=[100, 20, 30])
    # 用真实端点的人工证明测试布局本身，内点不能穿过上下轮廓引出。
    d['_dimension_witness'] = dict(view_key='v1', part='1', feature=1, mode='linear',
        points=[[40, 15], [140, 15]], direction=[1, 0], elements=[])
    result = dd.layout_dimensions(view(c, projection), [d], style={})
    assert result['unresolved'] and not result['dimensions']


def test_shared_coordinate_audit_keeps_one_to_many_and_original_witness():
    d, c = linear(), candidate()
    d['covers_features'] = [1, 2]
    original = copy.deepcopy(d['_witness_3d'])
    assigned = dd.assign_dimensions([d], [c], context=context([box()], {'v1': dict(lines=box_lines())}))
    assert assigned[0]['_dimension_audit']['covers_features'] == [1, 2]
    assert assigned[0]['_witness_3d'] == original


def test_duplicate_d_and_missing_proof_are_errors():
    with pytest.raises(ValueError, match='唯一'):
        dd.assign_dimensions([linear(), linear()], [], context={})
    result = dd.layout_dimensions(view(candidate(), dict(lines=box_lines())), [linear()], style={})
    assert result['unresolved'] and not result['dimensions']


def test_incomplete_candidate_has_concrete_failure_not_type_error():
    c = candidate()
    c.pop('u')
    with pytest.raises(dd.DimensionAssignmentError) as error:
        dd.assign_dimensions([linear()], [c], context=context([box()], {'v1': dict(lines=box_lines())}))
    assert error.value.unresolved[0]['id'] == 'D1'
    assert 'u' in error.value.unresolved[0]['reason']


def test_omitted_internal_feature_cannot_be_assigned_to_overview():
    c = candidate(omitted_features=[1])
    with pytest.raises(dd.DimensionAssignmentError) as error:
        dd.assign_dimensions([linear()], [c], context=context([box()], {'v1': dict(lines=box_lines())}))
    assert '内部特征' in error.value.unresolved[0]['reason']


def test_explicit_local_expression_overrides_inherited_overview_omission():
    # A 的局部端视和 B 的新剖视会继承来源总览的 omitted_features。
    # 当前视图自己的明确表达与真实轮廓优先，仍需通过元素身份校验。
    c = candidate(omitted_features=[1], expresses=[dict(part='1', feature=1, parameters=['position.X'])])
    assigned = dd.assign_dimensions([linear()], [c], context=context([box()], {'v1': dict(lines=box_lines())}))
    assert assigned[0]['_id'] == 'D1'


def test_small_dimension_inside_large_dimension_tracks():
    c, projection = candidate(), dict(lines=box_lines(width=100))
    el = dict(part='1', feature=1, kind='contour', curve=projection['lines'][0], provenance='test real bottom edge')
    small, large = linear(value=20, ident='D1'), linear(value=100, ident='D2')
    for d, ends in [(small, [[20, 0], [40, 0]]), (large, [[0, 0], [100, 0]])]:
        d['_dimension_witness'] = dict(view_key='v1', part='1', feature=1, mode='linear',
                                        points=ends, direction=[1, 0], elements=[el], parameters=['position.X'], derivation='test datum')
    result = dd.layout_dimensions(view(c, projection), [large, small], style={})
    assert not result['unresolved']
    a, b = result['dimensions']
    assert a['id'] == 'D1' and b['id'] == 'D2'
    first, second = a['marks']._dimension_track, b['marks']._dimension_track
    assert np.allclose(first['normal'], second['normal'])
    assert second['pos'] >= first['pos']+12


def test_axis_tag_without_recognizable_contour_does_not_prove_witness():
    c = candidate(witness_elements=[dict(part='1', feature=1, kind='axis', parameters=['position.X'],
                 curve=g2.line([0, 0], [40, 0], 'center'), provenance='unsupported claimed axis')])
    with pytest.raises(dd.DimensionAssignmentError):
        dd.assign_dimensions([linear()], [c], context=context([box()], {'v1': dict(lines=box_lines(80))}))


def test_authoritative_identity_list_does_not_fall_back_to_anonymous_lines():
    ctx = context([box()], {'v1': dict(lines=box_lines(), witness_elements=[])})
    with pytest.raises(dd.DimensionAssignmentError):
        dd.assign_dimensions([linear()], [candidate()], context=ctx)


def test_annotation_lines_never_run_through_an_existing_label():
    c, projection = candidate(), dict(lines=box_lines())
    assigned = dd.assign_dimensions([linear()], [c], context=context([box()], {'v1': projection}))
    v = view(c, projection)
    v.marks.text('已有图名', [20, -14], h=8)
    obstacle = dd.text_box('已有图名', [20, -14], 8)
    result = dd.layout_dimensions(v, assigned, style={})
    for d in result['dimensions']:
        assert all(not dd._curve_hits_box(m['curve'], obstacle) for m in d['marks'].items if m['kind'] == 'curve')


def test_dimension_line_cannot_cross_a_neighbor_hole_even_when_end_rays_are_clear():
    # 08 母线尺寸的实见失败：两个端点的界线绕开邻孔，尺寸线却横穿邻孔。
    first = g2.line([15, 8], [15, 0], 'visible')
    second = g2.line([25, 8], [25, 0], 'visible')
    neighbor = g2.arc([20, 20], 5, 0, 360, 'visible')
    projection = dict(lines=[first, second, neighbor])
    f = dict(type='hole', plane='XY', at=[20, 10], d=10, depth=8)
    c = candidate(section=dict(point=[0, 10, 0], mode='full'))
    d = linear(value=10)
    elements = [dict(part='1', feature=1, kind='contour', curve=curve, provenance='true generators') for curve in (first, second)]
    d['_dimension_witness'] = dict(view_key='v1', part='1', feature=1, mode='linear', points=[[15, 8], [25, 8]],
                                    direction=[1, 0], elements=elements, parameters=['d'], derivation='true diameter')
    result = dd.layout_dimensions(view(c, projection), [d], style={})
    for record in result['dimensions']:
        assert all(not dd._curves_cross(mark['curve'], neighbor) for mark in record['marks'].items if mark['kind'] == 'curve')


def test_frozen_samples_d_catalog_is_completely_accounted_for():
    # 真样例的所有原 D 要么唯一归属，要么有具体失败；绝不能静默丢 D。
    sample = json.loads((SAMPLES/'08.json').read_text(encoding='utf-8'))
    ctx = dict(sample, project_candidate=lambda c, scale=1.: sample['projections'][c['projection_key']])
    try:
        assigned = dd.assign_dimensions(sample['dimensions'], sample['candidates'], context=ctx)
        unresolved = []
    except dd.DimensionAssignmentError as error:
        assigned, unresolved = error.assignments, error.unresolved
    original = {d['_id']: d for d in sample['dimensions']}
    emitted = [d['_id'] for d in assigned]+[d['id'] for d in unresolved]
    assert len(emitted) == len(set(emitted)) == len(original) and set(emitted) == set(original)
    for d in assigned:
        for key in ('value', 'category', 'source_feature', 'covers_features', '_witness_3d'):
            assert d[key] == original[d['_id']][key]
    assert all(r['reason'] and r['feature'] for r in unresolved)


def test_oblique_axis_requires_actual_centerline_and_two_sides_of_ellipse():
    f = dict(type='extrude',plane='XY',loops=[dict(circle=[0,0],d=10)],depth=[0,8])
    c = candidate(u=[1,0,0], v=[0,2**-.5,2**-.5],direction=[0,-2**-.5,2**-.5])
    angle = np.linspace(0,2*np.pi,41)
    rim = dict(geom='polyline',points=np.c_[5*np.cos(angle),5*2**-.5*np.sin(angle)].tolist(),type='visible')
    center = g2.line([0,-4],[0,4],'center')
    def index(curve, drawn):
        tags = [dict(part='1',feature=1,kind=k,curve=x,provenance='actual visible rim')
                for k,x in [('axis',center),('contour',curve)]]
        return dd._ElementIndex(c,dict(lines=[curve]+drawn,witness_elements=tags),{1:f},'1')
    assert any(x['kind']=='axis' for x in index(rim,[center]).get(1))
    assert not any(x['kind']=='axis' for x in index(rim,[]).get(1))
    assert not any(x['kind']=='axis' for x in index(dict(rim,points=rim['points'][:7]),[center]).get(1))


def test_pitch_circle_uses_every_original_bore():
    c = candidate(u=[1,0,0],v=[0,1,0],direction=[0,0,1])
    points = [[12,0],[0,12],[-12,0],[0,-12]]
    features = [dict(type='hole',plane='XY',at=p,d=4,depth=6) for p in points]
    lines = [g2.arc(p,2,0,360,'visible') for p in points]
    d = dict(_id='D4',type='leader',category='分布圆直径',text='分布圆Φ24',value=24,source_feature=1,
             covers_features=[1,2,3,4],_witness_3d=dict(feature=features[0]),view_key='v1')
    ctx = context(features,{'v1':dict(lines=lines)})
    assigned = dd.assign_dimensions([d],[c],context=ctx)
    proof = assigned[0]['_dimension_witness']
    assert proof['pitch_circle']['r']==12 and len(proof['pattern_elements'])==4
    assert dd.layout_dimensions(view(c,dict(lines=lines[:-1])),assigned,style={})['unresolved']


def test_assembly_needs_both_feature_identities_and_matching_planes():
    c = candidate(part=None,parts=['1','2'],frame='assembly')
    lines = [g2.line([0,0],[10,0],'visible'),g2.line([10,0],[20,0],'visible')]
    tags, planes = [], []
    for i,line in enumerate(lines,1):
        p = [10*(i-1),0,0]
        planes.append(dict(part=str(i),feature=1,kind='plane',selector='end',point=p,direction=[0,0,1]))
        tags.append(dict(part=str(i),feature=1,kind='contour',curve=line,coordinate_system='assembly',
            provenance='verified final edge',support_3d=[dict(kind='end_plane',point=p,normal=[0,0,1])]))
    d = dict(_id='D1',type='leader',category='装配贴合及定向关系',text='端面贴合',value=0,source_part='1',
             source_feature=1,covers_features=[1],_witness_3d=dict(kind='assembly_relation',coordinate_system='assembly',
             relations=[dict(kind='contact',elements=planes)]))
    def check(items):
        return dd.assign_dimensions([d],[c],context=context([],{c['view_key']:dict(lines=lines,witness_elements=items)}))
    assert len(check(tags)[0]['_dimension_audit']['feature_relations'])==2
    with pytest.raises(dd.DimensionAssignmentError,match='件2'):
        check(tags[:1])
    planes[1]['point'][2]=1.
    with pytest.raises(dd.DimensionAssignmentError,match='三维要素'):
        check(tags)


def test_real_visible_contour_overrides_inherited_omission_and_false_datum_rejected():
    c = candidate(omitted_features=[1])
    lines = box_lines()
    tags = [dict(part='1',feature=1,kind='contour',curve=line,provenance='retained wall') for line in lines]
    ctx = context([box()],{'v1':dict(lines=lines,witness_elements=tags)})
    assert dd.assign_dimensions([linear()],[c],context=ctx)
    with pytest.raises(dd.DimensionAssignmentError):
        dd.assign_dimensions([linear(value=11,end=[11,0,0])],[c],context=ctx)


def test_authorized_process_depth_is_a_mouth_callout_with_public_text():
    c = candidate(u=[1,0,0],v=[0,1,0],direction=[0,0,1])
    f = dict(type='hole',name='空间斜注油孔',plane='XY',at=[0,0],d=8,depth=76)
    d = dict(_id='D68',type='leader',value=76,text='深76',category='孔深',source_feature=1,
             covers_features=[1],view_key='v1',_witness_3d=dict(feature=f))
    g = dict(lines=[g2.arc([0,0],4,0,360,'visible')])
    ctx = dict(context([f],{'v1':g}),problem='13')
    assigned = dd.assign_dimensions([d],[c],context=ctx)
    r = dd.layout_dimensions(view(c,g),assigned,style={})['dimensions'][0]
    assert r['value']==76 and r['text']==assigned[0]['text'] and '钻深76' in r['text']
    assert '箱壳顶面' in r['text'] and not any(m['role']=='dimension-extension' for m in r['marks'].items)
    assert d['text']=='深76'


def test_rounded_axial_endpoint_is_recognized_and_hatch_hole_remains_usable():
    c = g2.line([0,100.],[0,112.202124],'visible')
    assert dd._intersections(c,np.array([0,1]),112.20212378)
    rings = [np.array([[0,0],[40,0],[40,40],[0,40]]),np.array([[10,10],[30,10],[30,30],[10,30]])]
    areas = [([0,0,40,40],[(r,np.roll(r,-1,axis=0)) for r in rings])]
    assert dd._hatch_material(areas,[2,4,6,8]) and not dd._hatch_material(areas,[15,15,25,25])


def export_samples(numbers=('08', '13', '19', '21', '25')):
    """保持 HEAD 冻结纸张、比例、视图位置；仅替换 C 尺寸，失败不伪绘。"""
    from drawing_common import PAPERS, render, render_style
    summaries = []
    for number in numbers:
        sample = json.loads((SAMPLES/f'{number}.json').read_text(encoding='utf-8'))
        ctx = dict(sample, project_candidate=lambda c, scale=1.: sample['projections'][c['projection_key']])
        try:
            assigned = dd.assign_dimensions(sample['dimensions'], sample['candidates'], context=ctx)
            unresolved = []
        except dd.DimensionAssignmentError as error:
            assigned, unresolved = error.assignments, error.unresolved
        print(number, 'assigned', len(assigned), 'unresolved', len(unresolved), flush=True)
        folder = OUTPUT/'冻结复核'/number
        folder.mkdir(parents=True, exist_ok=True)
        audit = {r['id']: copy.deepcopy(r) for r in ctx['dimension_audit']}
        plotted, pages = 0, []
        for template in sample['head_sheets']:
            candidates = [c for c in sample['candidates'] if c['_head_sheet'] == template['id']]
            mine = [d for d in assigned if any(c['view_key'] == d['view_key'] for c in candidates)]
            if not mine:
                continue
            paper = template.get('paper', 'A3')
            width, height, *_ = PAPERS[paper]
            sheet = dict(id=template['id'], paper=dict(width=width, height=height), views=[], dpi=240)
            title = Marks()
            title.text(f"C 冻结见证试排 {template['id']}（部分尺寸，未通过最终验收）", [width/2, height-14], h=9)
            sheet['sheet_marks'] = title.to_view(1.)
            for c in candidates:
                projection = sample['projections'][c['projection_key']]
                placement = c['head_placement']
                v = view(c, projection, placement['scale'])
                for mark in c['head_annotations']:
                    if mark.get('role') == 'origin':
                        continue
                    mark = copy.deepcopy(mark)
                    if mark['kind'] == 'curve':
                        mark['curve'] = g2.xform(mark['curve'], v.scale, (0, 0))
                    for key in ('at', 'tip'):
                        if key in mark:
                            mark[key] = (np.array(mark[key])*v.scale).tolist()
                    v.marks.items.append(mark)
                result = dd.layout_dimensions(v, [d for d in mine if d['view_key'] == c['view_key']],
                                               style=dict(DIM_H=8., EXT_GAP=1.5, EXT_OVER=2.5))
                unresolved.extend(result['unresolved'])
                dimensions = []
                for record in result['dimensions']:
                    dimensions.append(dict(id=record['id'], value=record['value'], text=record['text'],
                                           type=record['type'], draw=record['marks'].to_view(v.scale)))
                    audit[record['id']] = dict(record['_dimension_audit'], sheet='frozen:'+template['id'])
                for failure in result['unresolved']:
                    audit[failure['id']].update(status='layout_unresolved', reason=failure['reason'])
                plotted += len(dimensions)
                annotations = [m for m in c['head_annotations'] if m.get('role') not in ('origin',)]
                sheet['views'].append(dict(name=c['name'], lines=projection['lines'], hatches=projection.get('hatches', []),
                    placement=placement, annotations=annotations, dimensions=dimensions))
            path = folder/f"{template['id']}.json"
            path.write_text(json.dumps(sheet, ensure_ascii=False, indent=2), encoding='utf-8')
            with render_style(dict(thin_width=.5, thick_width=1.)):
                image = render.render_sheet(sheet, dpi=240).image()
            image.save(path.with_suffix('.png'), dpi=(240, 240))
            for size in (1300, 2300):
                thumb = image.copy()
                thumb.thumbnail((size, size))
                destination = OUTPUT/'冻结复核'/'缩图'/str(size)/number
                destination.mkdir(parents=True, exist_ok=True)
                thumb.save(destination/path.with_suffix('.png').name)
            pages.append(template['id'])
            print('rendered', template['id'], flush=True)
        ids = [d['_id'] for d in assigned]+[r['id'] for r in ctx['dimension_audit'] if r['status'] == 'unresolved']
        assert len(ids) == len(set(ids)) == len(sample['dimensions'])
        (folder/'audit.json').write_text(json.dumps(list(audit.values()), ensure_ascii=False, indent=2), encoding='utf-8')
        (folder/'unresolved.json').write_text(json.dumps(unresolved, ensure_ascii=False, indent=2), encoding='utf-8')
        rows = [f'# {number}：未解决尺寸（冻结 HEAD 候选）', '',
                '未解决项不画。页号仍是冻结样例旧页号，最终页由 D/集成人决定。', '',
                '|D|零件|特征|参数|缺少的见证/位置|', '|---|---|---|---|---|']
        rows += [f"|{r['id']}|{r.get('part')}|{r.get('feature')}|{','.join(r.get('parameters', []))}|{r['reason']}|" for r in unresolved]
        (folder/'未解决.md').write_text('\n'.join(rows)+'\n', encoding='utf-8')
        summary = dict(problem=number, total=len(sample['dimensions']), assigned=len(assigned), drawn=plotted,
                       unresolved=len(unresolved), pages=pages, frozen_head=sample['head'])
        summaries.append(summary)
        (OUTPUT/'冻结复核'/'汇总.json').write_text(json.dumps(summaries, ensure_ascii=False, indent=2), encoding='utf-8')
    return summaries


def probe_b08():
    """B-02/B-03 授权的真实候选；保持 B 的 A3 图幅、比例与位置。"""
    from drawing_common import render, render_style
    sample = json.loads((SAMPLES/'08.json').read_text(encoding='utf-8'))
    base = ROOT/'调研/机械图纸重画/沙箱/B/08'
    manifest = json.loads((base/'manifest.json').read_text(encoding='utf-8'))
    documents = [json.loads((base/Path(entry['file']).with_suffix('.json')).read_text(encoding='utf-8')) for entry in manifest]
    # B 仍在写后续候选；只接已授权且在 manifest 中有实际投影的样板，避免串入
    # 尚未完成的候选与过期 projection_key。
    candidates = copy.deepcopy([c for c in sample['candidates'] if not c.get('section')])
    candidates += [copy.deepcopy(d['candidate']) for d in documents]
    signature = lambda c: repr((c['direction'], c['section']['point']))
    projections = {signature(d['candidate']): d['sheet']['views'][1] for d in documents}
    for c in candidates:
        if c.get('section'):
            c['projection_key'] = 'B:'+c.get('canonical_key', c['view_key'])
    def project(c, scale=1.):
        return projections[signature(c)] if c.get('section') else sample['projections'][c['projection_key']]
    ctx = dict(sample, project_candidate=project)
    try:
        assigned = dd.assign_dimensions(sample['dimensions'], candidates, context=ctx)
        unresolved = []
    except dd.DimensionAssignmentError as error:
        assigned, unresolved = error.assignments, error.unresolved
    folder = OUTPUT/'B08复核'
    folder.mkdir(parents=True, exist_ok=True)
    audit = {r['id']: copy.deepcopy(r) for r in ctx['dimension_audit']}
    drawn_ids = set()
    for entry, document in zip(manifest, documents):
        letter = Path(entry['file']).stem.split('-')[-1]
        c, sheet = document['candidate'], copy.deepcopy(document['sheet'])
        projection = sheet['views'][1]
        scale = projection['placement']['scale']
        v = view(c, projection, scale)
        for mark in projection.get('annotations', []):
            mark = copy.deepcopy(mark)
            if mark['kind'] == 'curve':
                mark['curve'] = g2.xform(mark['curve'], scale, (0, 0))
            for key in ('at', 'tip'):
                if key in mark:
                    mark[key] = (np.array(mark[key])*scale).tolist()
            v.marks.items.append(mark)
        mine = [d for d in assigned if d['view_key'] == c['view_key']]
        result = dd.layout_dimensions(v, mine, style=dict(DIM_H=8, EXT_GAP=1.5, EXT_OVER=2.5))
        unresolved.extend(result['unresolved'])
        projection['dimensions'] = []
        for record in result['dimensions']:
            bounds, origin = record['marks'].box, projection['placement']['paper_origin']
            page = [bounds[0]+origin[0], bounds[1]+origin[1], bounds[2]+origin[0], bounds[3]+origin[1]]
            if page[0] < 0 or page[1] < 0 or page[2] > sheet['paper']['width'] or page[3] > sheet['paper']['height']:
                failure = dd._failure(record, record['_dimension_witness']['part'], 'B 见证样板预留边距不足，完整尺寸框交 D 分页摆放')
                unresolved.append(failure)
                audit[record['id']].update(status='layout_unresolved', reason=failure['reason'])
                continue
            projection['dimensions'].append(dict(id=record['id'], value=record['value'], type=record['type'],
                                                 text=record['text'], draw=record['marks'].to_view(scale)))
            audit[record['id']] = dict(record['_dimension_audit'], sheet=f'trial-B08-{letter}')
            drawn_ids.add(record['id'])
        for failure in result['unresolved']:
            audit[failure['id']].update(status='layout_unresolved', reason=failure['reason'])
        path = folder/f'08-{letter}.json'
        path.write_text(json.dumps(sheet, ensure_ascii=False, indent=2), encoding='utf-8')
        with render_style(dict(thin_width=.5, thick_width=1.)):
            image = render.render_sheet(sheet, dpi=240).image()
        image.save(path.with_suffix('.png'), dpi=(240, 240))
        for size in (1300, 2300):
            destination = folder/str(size)
            destination.mkdir(exist_ok=True)
            thumb = image.copy()
            thumb.thumbnail((size, size))
            thumb.save(destination/path.with_suffix('.png').name)
    for row in audit.values():
        if row['status'] == 'assigned':
            row['status'] = 'assigned_awaiting_D_trial'
    (folder/'audit.json').write_text(json.dumps(list(audit.values()), ensure_ascii=False, indent=2), encoding='utf-8')
    (folder/'unresolved.json').write_text(json.dumps(unresolved, ensure_ascii=False, indent=2), encoding='utf-8')
    rows = ['# 08 接 B 实际剖视：未解决项', '',
            '未解决 D 不绘制；外部候选仍为冻结 HEAD，A 的新孔口尚未合入。', '',
            '|D|零件|特征|参数|原因|', '|---|---|---|---|---|']
    rows += [f"|{r['id']}|{r.get('part')}|{r.get('feature')}|{','.join(r.get('parameters', []))}|{r['reason']}|" for r in unresolved]
    (folder/'未解决.md').write_text('\n'.join(rows)+'\n', encoding='utf-8')
    summary = dict(total=len(sample['dimensions']), assigned=len(assigned), drawn_on_B_sheets=len(drawn_ids),
                   unresolved_on_B_trial=len(unresolved), pending_D_trial=sum(r['status'] == 'assigned_awaiting_D_trial' for r in audit.values()))
    (folder/'汇总.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')
    return summary


def probe_real08():
    """实际集成候选上的归属及图元复核。"""
    snapshot_real_candidates('08')
    evaluate_real('08', layout=True)
    return json.loads((OUTPUT/'真实候选/08/汇总.json').read_text(encoding='utf8'))


def snapshot_real_candidates(number):
    """在真实 A/B → C 调用处截取可复查投影，复用同一零件模型。"""
    from unittest.mock import patch
    import advanced_parts
    import make_drawing
    from drawing_common import assert_reference
    data = advanced_parts.problem_data(number)
    assert_reference(Path(__file__).parent/f'参考答案/第{number}题.json', data['description'])
    folder = OUTPUT/'真实候选'/number
    folder.mkdir(exist_ok=True, parents=True)
    measured = {}
    plan_sections = make_drawing.drawing_sections.plan_sections

    def shape_key(c):
        return repr([c.get(k) for k in ('part','parts','frame','kind','direction','u','v','origin','section',
                                        'keep','detail','parent_key','_a_features')])

    def remember(candidates, *, context):
        project = context['project_candidate']
        def recording(c, scale=1.):
            projection = project(c, scale)
            if scale==1.:
                measured[shape_key(c)] = {k:v for k,v in projection.items() if k in ('lines','hatches','witness_elements')}
            return projection
        context['project_candidate'] = recording
        return plan_sections(candidates,context=context)

    class Captured(Exception):
        pass

    def capture(dimensions, candidates, *, context, legacy):
        def save(name, value):
            (folder/name).write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
        save('inputs.json', dict(dimensions=dimensions, parts=context['parts'], head_sheets=[
            {k: s[k] for k in ('id', 'part', 'frame', 'paper') if k in s} for s in context['head_sheets']],
            candidates=candidates))
        files, keys = {}, {}
        for i, c in enumerate(candidates):
            key = dd._projection_key(c)
            if key not in files:
                p = measured.get(shape_key(c))
                if p is None:
                    p = context['project_candidate'](c, scale=1.)
                name = f'projection-{i+1:03d}.json'
                save(name, {k: v for k, v in p.items() if k in ('lines', 'hatches', 'witness_elements')})
                files[key] = name
            keys[c['view_key']] = files[key]
        save('projections.json', keys)
        raise Captured()

    with patch.object(dd, 'assign_dimensions', capture), patch.object(make_drawing.drawing_sections,'plan_sections',remember):
        try:
            make_drawing.plan_problem(data['spec'], data['description'])
        except Captured:
            return
    raise AssertionError('集成入口未调用 C')


def delivery_inputs(number):
    """使用集成实际投影及随后 A/B 明确交付的实投影；冻结完整输入供 D 复排。"""
    from drawing_common import normalize_candidate
    import shutil
    previous, dest = OUTPUT/'真实候选'/number, OUTPUT/'交付'/number
    dest.mkdir(parents=True,exist_ok=True)
    def read(path):
        return json.loads(path.read_text(encoding='utf8'))
    def save(name,item):
        (dest/name).write_text(json.dumps(item,ensure_ascii=False,separators=(',',':')),encoding='utf8')
    data = read(previous/'inputs.json')
    files = read(previous/'projections.json')
    candidates = {c['view_key']:c for c in data['candidates'] if c['view_key'] in files}
    files = {key:name for key,name in files.items() if key in candidates}
    for name in set(files.values()):
        shutil.copyfile(previous/name,dest/name)
    updates = []
    for p in (OUTPUT.parent/f'A/定位交付/复核/{number}').glob('*.json'):
        obj = read(p)
        if isinstance(obj,dict) and 'candidate' in obj and 'projection' in obj:
            updates.append((p,obj['candidate'],obj['projection']))
    bfolder = OUTPUT.parent/f'B/本轮复核/{number}'
    for p in list(bfolder.glob('*.json'))+list((bfolder/'装配').glob('*.json')):
        obj = read(p)
        if not isinstance(obj,dict) or 'candidate' not in obj:
            continue
        proj = obj.get('sheet',{}).get('views',[])[-1:] or [obj]
        if 'lines' in proj[0]:
            updates.append((p,obj['candidate'],proj[0]))
    sources = {}
    for i,(path,c,projection) in enumerate(updates):
        key = c['view_key']
        geometry = {k:projection[k] for k in ('lines','hatches','witness_elements') if k in projection}
        old = candidates.get(key)
        if old and all(old.get(k)==c.get(k) for k in ('frame','part','parts','direction','u','v','origin','section','keep')):
            before = read(dest/files[key])
            final = [e for e in before.get('witness_elements',[]) if e['kind']=='final_edge' and
                     dd._retained(e['curve'],[x for x in geometry['lines'] if dd._visible(x)])]
            if final:
                geometry['witness_elements'] = geometry.get('witness_elements',[])+final
        name = f'handoff-{i+1:03d}.json'
        save(name,geometry)
        files[key],candidates[key],sources[key] = name,normalize_candidate(c),str(path.relative_to(ROOT))
    if number=='25':
        spec = read(OUTPUT.parent/'集成/C-03/出图规格/25.json')
        updated = {d['_id']:d for sheet in spec['sheets'] for d in sheet.get('dimensions',[])
                   if (d.get('_witness_3d') or {}).get('kind')=='assembly_relation'}
        assert len(updated)==25
        for d in data['dimensions']:
            if d['_id'] in updated:
                new = updated[d['_id']]
                assert (d['value'],d['category'])==(new['value'],new['category'])
                d.update({k:new[k] for k in ('source_part','source_feature','covers_features','_witness_3d')})
    data.update(problem=number,candidates=list(candidates.values()))
    save('inputs.json',data)
    save('projections.json',files)
    save('更新来源.json',sources)
    return dest


def evaluate_real(number, layout=False, folder=None):
    """用同一次真实投影快照重放 C。逐视图图元/框交给 D，页号留待分页回填。"""
    from functools import lru_cache
    folder = folder or OUTPUT/'真实候选'/number
    def read(name):
        return json.loads((folder/name).read_text(encoding='utf-8'))
    def save(name, data):
        (folder/name).write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    data, files = read('inputs.json'), read('projections.json')
    projected = lru_cache(None)(read)
    ctx = dict(data, project_candidate=lambda c, scale=1.: projected(files[c['view_key']]))
    ctx['problem'] = number
    try:
        assigned = dd.assign_dimensions(data['dimensions'], data['candidates'], context=ctx)
        missing = []
    except dd.DimensionAssignmentError as error:
        assigned, missing = error.assignments, error.unresolved
    originals = {d['_id']: d for d in data['dimensions']}
    assert len(assigned)+len(missing) == len(originals) == len(data['dimensions'])
    assert {d['_id'] for d in assigned} | {r['id'] for r in missing} == set(originals)
    for d in assigned:
        assert all(d.get(k) == originals[d['_id']].get(k) for k in
                   ('value','source_feature','category','covers_features','_witness_3d'))
    audit = {row['id']: row for row in ctx['dimension_audit']}
    summary = dict(problem=number, total=len(originals), assigned=len(assigned), missing=len(missing))
    save('assignments.json', assigned)
    save('加工深度文字.json',[dict(id=d['_id'],text=d['text'],value=d['value'],view_key=d['view_key'])
         for d in assigned if d['_dimension_witness'].get('process_text')])
    save('audit.json', list(audit.values()))
    save('unresolved.json', missing)
    save('汇总.json', summary)
    rows = [f'# {number} 待补的尺寸见证', '', '|D|零件 / 原特征|原参数或定位轴两端（零件坐标）|具体缺项|',
            '|---|---|---|---|']
    for failure in missing:
        d = originals[failure['id']]
        w = d.get('_witness_3d') or {}
        parameter = (f"{w['axis']} {w['from']} → {w['to']}" if d['type']=='linear' and 'axis' in w
                     else str(d.get('text') or d['value']))
        rows.append(f"|{d['_id']}|{failure['part']} / {failure['feature']}|{parameter}|{failure['reason']}|")
    (folder/'逐D补图.md').write_text('\n'.join(rows)+'\n', encoding='utf-8')
    print(summary, flush=True)
    if not layout:
        return
    trials, failed = [], []
    for c in data['candidates']:
        mine = [d for d in assigned if d['view_key']==c['view_key']]
        if not mine:
            continue
        runtime = view(c, projected(files[c['view_key']]))
        result = dd.layout_dimensions(runtime, mine, style=dict(DIM_H=8.))
        failed += result['unresolved']
        dimensions = []
        for record in result['dimensions']:
            marks = record['marks']
            assert marks.box == marks_bounds(marks.to_view(1.), 1.)
            dimensions.append(dict(id=record['id'], value=record['value'], text=record['text'],
                type=record['type'], bbox=marks.box, draw=marks.to_view(1.)))
            audit[record['id']] = record['_dimension_audit']
        trials.append(dict(view_key=c['view_key'], scale=1., bbox=result['bbox'], dimensions=dimensions,
                           unresolved=result['unresolved']))
    for r in failed:
        audit[r['id']].update(status='layout_unresolved', reason=r['reason'])
    summary.update(drawn=sum(len(t['dimensions']) for t in trials), layout_unresolved=len(failed))
    assert summary['drawn']+len(failed)==len(assigned)
    save('layout-trials.json', trials)
    save('audit.json', list(audit.values()))
    save('摆放缺项.json', failed)
    save('汇总.json', summary)
    print(summary, flush=True)


def render_real_sample(number, folder=None):
    """选用 D 或 B 的现有试排页，只复核 C 图元。纸张、比例、原点、图框由原页给定。"""
    from drawing_common import render, render_style
    from PIL import Image
    folder = folder or OUTPUT/'真实候选'/number
    def read(path):
        return json.loads(path.read_text(encoding='utf-8'))
    data, assigned = read(folder/'inputs.json'), read(folder/'assignments.json')
    by_view = {}
    for dim in assigned:
        by_view.setdefault(dim['view_key'],[]).append(dim)
    candidates = {c['view_key']:c for c in data['candidates']}
    pages = []
    for path in (OUTPUT.parent/'D/真实样板'/number).glob(number+'-*.json'):
        sheet = read(path)
        keys = [v.get('view_key') for v in sheet['views']]
        pages.append((path,sheet,keys))
    if not any(any(k in by_view for k in keys) for _,_,keys in pages):
        for path in (OUTPUT.parent/'B/本轮复核'/number).glob('*.json'):
            doc = read(path)
            if isinstance(doc,dict) and 'candidate' in doc and 'sheet' in doc:
                pages.append((path,doc['sheet'],[None,doc['candidate']['view_key']]))
    def readable(v,sheet):
        box = g2.bounds(v['lines'])
        if box is None:
            return False
        span = max(box[2]-box[0],box[3]-box[1])*v['placement']['scale']
        return 1300*span/max(sheet['paper']['width'],sheet['paper']['height'])>=250
    pages.sort(key=lambda item:-sum(len(by_view.get(k,[])) for v,k in zip(item[1]['views'],item[2]) if readable(v,item[1])))
    for path,sheet,keys in pages:
        done, omitted, boxes, records = [], [], [], []
        size = sheet['paper']
        height = 11.2 if size.get('size')=='A2' else 8.
        reserved = []
        for other in sheet['views']:
            pos = other['placement']
            bounds = g2.bounds(other['lines'])
            if bounds:
                reserved.append((other,np.asarray(bounds)*pos['scale']+np.tile(pos['paper_origin'],2)))
            for m in other.get('annotations',[]):
                if m['kind']=='text':
                    at = np.asarray(m['at'])*pos['scale']+pos['paper_origin']
                    reserved.append((other,dd.text_box(m['text'],at,m['height'],m.get('anchor','mm'),m.get('angle',0))))
        sheet_curves = [m['curve'] for m in sheet.get('sheet_marks',[]) if m['kind']=='curve']
        for m in sheet.get('sheet_marks',[]):
            if m['kind']=='text':
                reserved.append((None,dd.text_box(m['text'],m['at'],m['height'],m.get('anchor','mm'),m.get('angle',0))))
        for v,key in zip(sheet['views'],keys):
            v['dimensions'] = []
            if key not in by_view or key not in candidates:
                continue
            if not readable(v,sheet):
                omitted.extend(dict(id=d['_id'],reason='给定图位的特征图在1300 px整页下不足250 px') for d in by_view[key])
                continue
            scale = v['placement']['scale']
            origin = np.asarray(v['placement']['paper_origin'])
            runtime = view(candidates[key],v,scale)
            for old in v.get('annotations',[]):
                if old['kind']=='text':
                    runtime.marks.text(old['text'],np.array(old['at'])*scale,h=old['height'],
                                       anchor=old.get('anchor','mm'),angle=old.get('angle',0))
            result = dd.layout_dimensions(runtime,by_view[key],style=dict(DIM_H=height))
            omitted.extend(result['unresolved'])
            for d in result['dimensions']:
                bounds = np.asarray(d['marks'].box)+np.tile(origin,2)
                if min(bounds[:2])<0 or bounds[2]>size['width'] or bounds[3]>size['height']:
                    omitted.append(dict(id=d['id'],reason='既定页内位置越出图纸'))
                    continue
                other = [b for k,b in boxes if k!=key]
                if any(dd._overlaps(bounds,b) for b in other):
                    omitted.append(dict(id=d['id'],reason='跨视图的标注范围相交'))
                    continue
                obstacles = [b for owner,b in reserved if owner is not v]
                curves = [g2.xform(m['curve'],1.,origin) for m in d['marks'].items if m['kind']=='curve']
                texts = [dd.text_box(m['text'],np.asarray(m['at'])+origin,m['height'],m['anchor'],m['angle'])
                         for m in d['marks'].items if m['kind']=='text']
                if (any(dd._overlaps(b,area,1.) for b in texts for area in obstacles)
                        or any(dd._curve_hits_box(c,b) for c in sheet_curves for b in texts)
                        or any(dd._curve_hits_box(c,area) for c in curves for area in obstacles)):
                    omitted.append(dict(id=d['id'],reason='既定图位与其他视图、图框或标题栏相交'))
                    continue
                boxes.append((key,bounds))
                done.append(d['id'])
                records.append(dict(d['_dimension_audit'],sheet=path.stem,view_key=key,
                                    sheet_bbox=bounds.tolist(),status='trial_sheet'))
                v['dimensions'].append(dict(id=d['id'],type=d['type'],text=d['text'],value=d['value'],
                                             draw=d['marks'].to_view(scale)))
        if not done:
            continue
        dest = OUTPUT/'样板图'/number
        dest.mkdir(parents=True,exist_ok=True)
        (dest/'试排页.json').write_text(json.dumps(sheet,ensure_ascii=False),encoding='utf8')
        (dest/'尺寸见证.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf8')
        (dest/'页内复核.json').write_text(json.dumps(dict(template=str(path.relative_to(ROOT)),drawn=done,
                unresolved=omitted),ensure_ascii=False,indent=2),encoding='utf8')
        factor = height/8.
        with render_style(dict(thin_width=.5*factor,thick_width=1.*factor)):
            img = render.render_sheet(sheet,dpi=240).image()
        img.save(dest/'试排页.png',dpi=(240,240))
        for length in (1300,2300):
            thumb = img.copy()
            thumb.thumbnail((length,length),Image.Resampling.LANCZOS)
            thumb.save(dest/f'{length}.png')
        print(number,path.name,len(done),flush=True)
        return
    raise RuntimeError(f'{number} 当前试排纸面无可摆放见证')


if __name__ == '__main__':
    if sys.argv[1:2]==['--deliver']:
        for number in sys.argv[2:]:
            folder = delivery_inputs(number)
            evaluate_real(number,True,folder)
            render_real_sample(number,folder)
        raise SystemExit()
    if sys.argv[1:2]==['--plates']:
        for number in sys.argv[2:]:
            render_real_sample(number)
        raise SystemExit()
    if sys.argv[1:2] in (['--real-assign'], ['--real-layout']):
        for number in sys.argv[2:]:
            evaluate_real(number, sys.argv[1]=='--real-layout')
        raise SystemExit()
    if '--snapshot' in sys.argv:
        for number in sys.argv[2:]:
            print('读取真实候选', number, flush=True)
            snapshot_real_candidates(number)
            print('投影已保存', number, flush=True)
        raise SystemExit()
    if '--probe-real08' in sys.argv:
        print(json.dumps(probe_real08(), ensure_ascii=False, indent=2))
        raise SystemExit()
    if '--probe-b08' in sys.argv:
        print(json.dumps(probe_b08(), ensure_ascii=False, indent=2))
        raise SystemExit()
    if '--export' not in sys.argv:
        raise SystemExit('用 --export [08 13 19 21 25] 从冻结样例生成 C 沙箱，测试用 -m pytest。')
    numbers = tuple(arg for arg in sys.argv[1:] if arg != '--export') or ('08', '13', '19', '21', '25')
    print(json.dumps(export_samples(numbers), ensure_ascii=False, indent=2))

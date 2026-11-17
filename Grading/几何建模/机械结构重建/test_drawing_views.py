"""A 包回归：精确消隐、真实局部深度、人工截口和定位引用。"""
import copy
import sys
from pathlib import Path

import numpy as np
import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parents[2] / '几何建模' / '机械结构重建' / '工具'))
from drawkit import geom2d as g2, model, project
from OCP.BRepAlgoAPI import BRepAlgoAPI_Cut
from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox, BRepPrimAPI_MakeCylinder
from OCP.gp import gp_Pnt
import drawing_views as a


def head_candidates(data):
    """只解析接缝 HEAD 候选，不运行其他包的开发中规划器。"""
    import make_drawing as md
    result = []
    for sheet in data['spec']['sheets']:
        names = ([str(p['name']) for p in data['description']['parts']]
                 if sheet.get('frame') == 'assembly' else [sheet.get('part', '1')])
        views = md.resolve_views(sheet, names)
        keys = {v.name: f"{sheet['id']}:v{v.index+1}" for v in views}
        for v in views:
            definition = copy.deepcopy(v.vdef)
            if v.kind == 'detail':
                parent = md.view_by_name(views, v.parent)
                definition.update({k: copy.deepcopy(parent.vdef[k]) for k in ('direction', 'u', 'v', 'origin')})
            result.append(dict(definition, view_key=keys[v.name], name=v.name, part=sheet.get('part'),
                               frame=sheet.get('frame', 'part'), parent_key=keys.get(v.parent),
                               expresses=[], spec=copy.deepcopy(v.spec), _head_sheet=sheet['id']))
    return result


def planned(pid):
    from advanced_parts import problem_data
    data = problem_data(pid)
    candidates = a.plan_views(dict(parts=data['description']['parts'], dimensions=[], head_sheets=data['spec']['sheets']),
                              legacy=lambda: head_candidates(data))
    return data, candidates


def view(**kwargs):
    definition = dict(kind='basic', direction=[0,0,-1], u=[1,0,0], v=[0,1,0], origin=[0,0,0],
                      parts=['1'], scale=1, hidden=True, section=None, keep=None)
    definition.update(kwargs)
    return definition


def external(shape, definition):
    return a.project_external_view({'1': shape}, definition, legacy=lambda: project.project_view({'1': shape}, definition))


@pytest.mark.parametrize('pid', [f'{i:02}' for i in range(1, 26)])
def test_planning_preserves_geometry_dimensions_and_marks_duplicates(pid):
    from advanced_parts import problem_data
    data = problem_data(pid)
    before = copy.deepcopy((data['description'], data['spec']))
    original = head_candidates(data)
    original_copy = copy.deepcopy(original)
    candidates = a.plan_views(dict(parts=data['description']['parts']), legacy=lambda: original)
    keys = {c['view_key'] for c in candidates}
    assert len(keys) == len(candidates)
    for c in candidates:
        if c.get('section') or c['kind'] == 'removed_section':
            continue
        assert c['hidden'] is False
        assert c['canonical_key'] in keys
        assert c['role'] in ('overview', 'detail')
        if c['kind'] == 'auxiliary':
            assert c['keep']['_a_local']['features']
            assert c['parent_key'] in keys
            parent = next(p for p in candidates if p['view_key'] == c['parent_key'])
            assert c['source_key'] == parent['canonical_key']
            assert sum(np.dot(c['direction'], parent[k]) ** 2 for k in ('u', 'v')) > .04
            assert c['spec']['label'] in c['spec']['name']
            assert all('depth' not in item['parameters'] for item in c['expresses'])
    assert (data['description'], data['spec']) == before
    assert original == original_copy


def test_overview_keeps_all_visible_contours_and_removes_hidden_stack():
    box = BRepPrimAPI_MakeBox(gp_Pnt(-20,-20,0), gp_Pnt(20,20,40)).Shape()
    bore = BRepPrimAPI_MakeCylinder(5,30).Shape()
    shape = BRepAlgoAPI_Cut(box, bore).Shape()
    definition = view()
    old = project.project_view({'1': shape}, definition)
    original = copy.deepcopy(definition)
    result = external(shape, definition)
    assert any(c['type'] == 'hidden' for c in old['lines'])
    assert not any(c['type'] == 'hidden' for c in result['lines'])
    assert [c for c in result['lines'] if c['type'] == 'visible'] == [c for c in old['lines'] if c['type'] == 'visible']
    assert definition == original


def test_visible_artificial_front_cap_is_wave_not_real_square():
    shape = BRepPrimAPI_MakeBox(gp_Pnt(-10,-10,0), gp_Pnt(10,10,20)).Shape()
    definition = view(keep=dict(shape='circle', center=[0,0], r=30, _a_local=dict(depth=[5,15])))
    result = external(shape, definition)
    assert not result['hatches']
    assert any(c['type'] == 'wave' for c in result['lines'])
    assert not any(c['type'] == 'visible' for c in result['lines'])


def test_hidden_rear_cap_does_not_erase_real_front_circle():
    shape = BRepPrimAPI_MakeCylinder(10,20).Shape()
    definition = view(keep=dict(shape='circle', center=[0,0], r=30, _a_local=dict(depth=[5,30])))
    result = external(shape, definition)
    assert any(c['type'] == 'visible' and c['geom'] == 'circle' and c['r'] == 10 for c in result['lines'])
    assert not any(c['type'] == 'wave' for c in result['lines'])


def test_depth_selection_removes_far_geometry_inside_same_2d_circle():
    near = BRepPrimAPI_MakeCylinder(10,20).Shape()
    far = BRepPrimAPI_MakeBox(gp_Pnt(-24,-6,-40), gp_Pnt(24,6,-30)).Shape()
    shape = model.compound([near, far])
    region = dict(shape='circle', center=[0,0], r=28)
    flat = project.project_view({'1': shape}, view(hidden=False, keep=region))
    result = external(shape, view(keep=dict(region, _a_local=dict(depth=[-2,30]))))
    assert any(c['type'] == 'visible' and c['geom'] == 'line' for c in flat['lines'])
    assert not any(c['type'] == 'visible' and c['geom'] == 'line' for c in result['lines'])
    assert model.shape_bbox(shape)[0][2] < -39


def test_detail_keeps_local_part_and_break_waves_only():
    shape = BRepPrimAPI_MakeBox(gp_Pnt(-20,-20,0), gp_Pnt(20,20,10)).Shape()
    parent = external(shape, view())
    definition = view(kind='detail', detail=dict(parent='front', center=[20,0], r=12))
    result = a.project_external_view({'1': shape}, definition, parent=parent, legacy=lambda: None)
    assert any(c['type'] == 'wave' for c in result['lines'])
    assert not any(c['type'] == 'hidden' for c in result['lines'])
    points = np.concatenate([g2.sample(c,.5) for c in result['lines'] if c['type'] != 'wave'])
    assert np.max(np.linalg.norm(points - [20,0], axis=1)) <= 12 + 1e-4


def test_witnesses_reference_retained_curves_and_real_cylinder_axis():
    shape = BRepPrimAPI_MakeCylinder(10,20).Shape()
    feature = dict(type='extrude', op='add', plane='XY', loops=[dict(circle=[0,0], d=20)], depth=20)
    definition = view(_a_features=[dict(part='1', feature=1, definition=feature)])
    result = external(shape, definition)
    assert result['witness_elements']
    assert {w['kind'] for w in result['witness_elements']} == {'contour','axis'}
    for w in result['witness_elements']:
        assert w['curve'] in result['lines']
        assert w['curve']['type'] == ('visible' if w['kind'] == 'contour' else 'center')


def test_buried_port_keeps_only_its_necessary_hidden_true_circle():
    box = BRepPrimAPI_MakeBox(gp_Pnt(-20,-20,0),gp_Pnt(20,20,30)).Shape()
    from OCP.gp import gp_Ax2, gp_Dir
    bore = BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(0,0,5),gp_Dir(0,0,1)),5,10).Shape()
    shape = BRepAlgoAPI_Cut(box,bore).Shape()
    f = dict(type='hole',plane=dict(origin=[0,0,15],normal=[0,0,1],x_dir=[1,0,0]),at=[0,0],d=10,depth=10)
    definition = view(keep=dict(shape='circle',center=[0,0],r=12,_a_local=dict(depth=[0,35],features=[1])),
                      _a_features=[dict(part='1',feature=1,definition=f)])
    result = external(shape,definition)
    hidden = [c for c in result['lines'] if c['type'] == 'hidden']
    assert hidden and all(c['geom'] == 'circle' and c['r'] == 5 for c in hidden)
    neighbor = BRepPrimAPI_MakeBox(gp_Pnt(6,3,30),gp_Pnt(10,8,35)).Shape()
    crowded = model.compound([shape,neighbor])
    raw = project.project_view({'1':crowded},dict(definition,hidden=False))
    assert any(c['type']=='visible' and c['geom']=='line' for c in raw['lines'])
    selected = external(crowded,definition)
    assert not any(c['type']=='visible' and c['geom']=='line' for c in selected['lines'])


def test_invisible_oblique_axes_do_not_cross_overview():
    lines = [g2.line([0,0],[40,0],'visible'), g2.line([0,20],[40,20],'visible'),
             g2.line([-3,10],[43,10],'center'), g2.line([0,0],[40,40],'center')]
    result = a._necessary_axes(lines,1)
    centers = [c for c in result if c['type'] == 'center']
    assert len(centers) == 1
    assert centers[0]['from'][1] == centers[0]['to'][1] == 10


def test_projected_coincident_but_buried_feature_gets_no_false_identity():
    from OCP.gp import gp_Ax2,gp_Dir
    front = BRepPrimAPI_MakeCylinder(10,20).Shape()
    rear = BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(0,0,-40),gp_Dir(0,0,1)),10,20).Shape()
    f = dict(type='extrude',op='add',plane='XY',loops=[dict(circle=[0,0],d=20)],depth=[0,20])
    buried = dict(f,origin=[0,0,-40])
    result = external(model.compound([front,rear]),view(_a_features=[
        dict(part='1',feature=1,definition=f),dict(part='1',feature=2,definition=buried)]))
    assert {w['feature'] for w in result['witness_elements']} == {1}


def test_08_rear_and_bottom_ports_get_local_views_not_overview_hidden_lines():
    _, candidates = planned('08')
    ports = [c for c in candidates if c.get('_opening_point') is not None]
    assert {c['keep']['_a_local']['features'][0] for c in ports} == {13,14}
    assert all(c['keep']['r'] < 30 and c['role'] == 'detail' for c in ports)


def test_trimmed_cylindrical_mouth_keeps_hlr_visibility_when_sampled_as_polyline():
    angles = np.linspace(0,np.pi,31)
    points = np.column_stack((6*np.cos(angles),6*np.sin(angles)))
    points[1:-1] *= .999
    visible = g2.polyline(points,'visible')
    expected = g2.arc([0,0],6,0,360,'hidden')
    arc = a._target_arc(visible,[expected])
    merged = g2.merge([arc,expected])
    assert arc['geom']=='arc' and arc['type']=='visible'
    assert sum(g2.length(c) for c in merged if c['type']=='visible') == pytest.approx(6*np.pi,abs=1e-4)
    assert sum(g2.length(c) for c in merged if c['type']=='hidden') == pytest.approx(6*np.pi,abs=1e-4)


@pytest.mark.parametrize('pid', ['08','13','19','21'])
def test_sample_overviews_keep_exact_silhouette(pid):
    data, candidates = planned(pid)
    shape = model.build(data['description']).parts[0].shape
    c = next(c for c in candidates if c['kind'] == 'basic' and not c.get('section'))
    c = dict(c, scale=1)
    raw = project.project_view({'1':shape}, dict(c, hidden=False))
    result = external(shape,c)
    assert [p for p in result['lines'] if p['type'] == 'visible'] == [p for p in raw['lines'] if p['type'] == 'visible']


@pytest.fixture(scope='module')
def position_08():
    from advanced_parts import problem_data
    from drawing_common import ensure_dimension_ids
    data = problem_data('08')
    dims = ensure_dimension_ids(data['spec'])
    for sheet in data['spec']['sheets']:
        for d in sheet['dimensions']:
            d['_head_sheet'] = sheet['id']
    shape = model.build(data['description']).parts[0].shape
    def project_candidate(c,scale=1):
        return external(shape, dict(c,scale=scale))
    candidates = a.plan_views(dict(problem='08',parts=data['description']['parts'],dimensions=dims,
        head_sheets=data['spec']['sheets'],project_candidate=project_candidate),legacy=lambda:head_candidates(data))
    return candidates, project_candidate


def test_d36_sees_both_perpendicular_bores_in_one_true_x_projection(position_08):
    candidates, project_candidate = position_08
    c = next(c for c in candidates if c['view_key']=='08:1:position:face-1p-2m')
    assert c['layout_optional'] and c['parent_key']==c['source_key']
    assert np.hypot(c['u'][0],c['v'][0])==pytest.approx(1)
    geom = project_candidate(c)
    assert not geom['hatches'] and not any(el['type']=='hidden' for el in geom['lines'])
    axes = {el['feature']:el['curve'] for el in geom['witness_elements'] if el['kind']=='axis'}
    assert set(axes)=={13,14}
    assert abs(axes[14]['from'][0]-axes[13]['from'][0])==pytest.approx(2)
    for fid, axis in axes.items():
        assert axis in geom['lines'] and axis['from'][0]==axis['to'][0]
        assert any(el['feature']==fid and el['kind']=='contour' and el['curve']['geom']=='polyline'
                   and el['curve'] in geom['lines'] for el in geom['witness_elements'])


def test_positions_share_only_original_datum_and_coalesce_port_alias(position_08):
    candidates, project_candidate = position_08
    front_top = next(c for c in candidates if c['view_key']=='08:1:position:face-1m-2p')
    witnesses = project_candidate(front_top)['witness_elements']
    assert {w['feature'] for w in witnesses} >= {15,17}
    assert 'D45' in {d for p in front_top['keep']['_a_position'] for d in p['dimensions']}
    rear = next(c for c in candidates if c['view_key']=='08:1:port:13')
    locator = next(c for c in candidates if c['view_key']=='08:1:position:face-1p')
    assert rear['canonical_key']==locator['view_key'] and rear['keep']==locator['keep']
    assert {w['feature'] for w in project_candidate(locator)['witness_elements']}=={2,13}
    assert all(c['spec']['type']=='front' for c in candidates if c.get('role') and not c.get('layout_optional'))


def test_occluded_position_target_cannot_produce_an_axis_or_a_break_line():
    cylinder = BRepPrimAPI_MakeCylinder(5,8).Shape()
    cover = BRepPrimAPI_MakeBox(gp_Pnt(-20,-20,15),gp_Pnt(20,20,18)).Shape()
    feature = dict(type='extrude',op='add',plane='XY',loops=[dict(circle=[0,0],d=10)],depth=[0,8])
    c = view(keep=dict(shape='circle',center=[0,0],r=10,_a_position=[dict(feature=1,point=[0,0,8],r=10)]),
             _a_features=[dict(part='1',feature=1,definition=feature)])
    geom = external(model.compound([cover,cylinder]),c)
    assert geom['witness_elements']==[] and geom['lines']==[]


def test_exposed_annular_shaft_groove_preserves_loop_identity():
    from OCP.gp import gp_Ax2,gp_Dir
    shaft = BRepPrimAPI_MakeCylinder(10,24).Shape()
    plane = gp_Ax2(gp_Pnt(0,0,8),gp_Dir(0,0,1))
    ring = BRepAlgoAPI_Cut(BRepPrimAPI_MakeCylinder(plane,10,4).Shape(),
                           BRepPrimAPI_MakeCylinder(plane,7,4).Shape()).Shape()
    shaft = BRepAlgoAPI_Cut(shaft,ring).Shape()
    f = dict(type='extrude',op='cut',plane='XY',loops=[dict(circle=[0,0],d=d) for d in (20,14)],depth=[8,12])
    c = view(direction=[0,1,0],u=[1,0,0],v=[0,0,1],_a_features=[dict(part='2',feature=4,definition=f)])
    witnesses = external(shaft,c)['witness_elements']
    inner = [w['curve'] for w in witnesses if 'loops[1].d' in w['parameters'] and w['curve']['geom']=='line']
    assert {round(line['from'][0]) for line in inner if abs(line['from'][0]-line['to'][0])<1e-5}=={-7,7}


def test_25_keyed_bolt_hole_gets_only_the_required_coordinate_axis():
    from advanced_parts import problem_data
    part = problem_data('25')['description']['parts'][3]
    shape = model.build(dict(parts=[part])).parts[0].shape
    c = view(_a_features=[dict(part='4',feature=3,definition=part['features'][2],datum_axes=['X'])])
    g = external(shape,c)
    rim = next(w['curve'] for w in g['witness_elements'] if w['kind']=='contour' and w['curve']['geom']=='arc')
    assert 280 < rim['end']-rim['start'] < 290
    axis = next(w['curve'] for w in g['witness_elements'] if w['parameters']==['position.X'])
    assert axis in g['lines'] and axis['from'][0]==axis['to'][0]==27
    assert a._point_on_segment(np.array([27.,0]),axis['from'],axis['to'])

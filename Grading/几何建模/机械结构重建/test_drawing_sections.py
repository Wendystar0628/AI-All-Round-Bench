"""B 包回归：真实材料/空腔、完整轴剖、纵剖例外、来源标记。

运行使用含 OCP 的 Python 3.12；所有缓存/样板输出指定到沙箱/B。
"""
import copy
import json
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pytest
from OCP.BRepClass3d import BRepClass3d_SolidClassifier
from OCP.TopAbs import TopAbs_IN, TopAbs_ON

import drawing_sections as b
from drawing_common import Marks
from drawkit import geom2d as g2, model, project

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
SAMPLES = ROOT/'调研/机械图纸重画/沙箱/样例'


def definition(direction=(0, 1, 0), point=(0, 15, 0), **section):
    up = [0, 1, 0] if abs(direction[2]) > .99 else [0, 0, 1]
    u, v = project.frame_axes(np.array(direction, float), up)
    return dict(kind='basic', direction=list(direction), u=u.tolist(), v=v.tolist(), origin=[0, 0, 0],
                parts=['1'], hidden=False, section=dict(point=list(point), mode='full', **section))


def project_b(shapes, d):
    return b.project_section(shapes, d, legacy=lambda: project.project_view(shapes, d))


def solid(features, name='1', title='测试壳'):
    p = dict(name=name, title=title, features=features)
    mdl = model.build(dict(parts=[p]))
    assert not mdl.parts[0].error
    return p, mdl.parts[0].shape


def block(rect=(0, 0, 40, 30), depth=(0, 20), **kw):
    return dict(type='extrude', plane='XY', loops=[dict(rect=list(rect))], depth=list(depth), **kw)


def in_material(geom, points):
    return np.logical_or.reduce([project.in_loops(np.array(points, float), h['loops']) for h in geom['hatches']])


def candidate(d, key='v1', name='A-A', frame='part', part='1'):
    return dict(copy.deepcopy(d), view_key=key, name=name, frame=frame, part=part, parent_key=None,
                expresses=[], _head_sheet='T-1', spec=dict(type='front', name=name, section=copy.deepcopy(d.get('section'))))


def test_full_section_material_and_voids_are_not_inverted():
    _, shape = solid([block(), block((8, 6, 32, 24), (5, 16), op='cut')])
    geom = project_b({'1': shape}, definition())
    assert in_material(geom, [[2, 10], [10, 2], [10, 18], [38, 10]]).all()
    assert not in_material(geom, [[10, 10], [25, 8]]).any()
    assert all(lp[0] == lp[-1] for h in geom['hatches'] for lp in h['loops'])


def test_removed_section_keeps_complete_hole_and_has_no_background():
    f = dict(type='extrude', plane='XY', loops=[dict(circle=[20, 15], d=10)], depth=[0, 20], op='cut')
    _, shape = solid([block(), f, block((45, 5, 50, 10), (0, 3))])
    d = definition((0, 0, -1), (0, 0, 10))
    d['u'], d['v'] = [1, 0, 0], [0, 1, 0]
    d['kind'], d['section']['mode'] = 'removed_section', 'removed'
    geom = project_b({'1': shape}, d)
    assert not in_material(geom, [[20, 15]])[0]
    assert in_material(geom, [[5, 5]])[0]
    assert len(geom['hatches'][0]['loops']) == 2
    circles = [c for c in geom['lines'] if c['geom'] in ('circle', 'arc')]
    assert any(c['geom'] == 'circle' or c.get('end', 0)-c.get('start', 0) >= 359.9 for c in circles)
    assert project.geometry_bounds(geom)[2] <= 40.001


def test_full_section_keeps_visible_features_behind_cut():
    _, shape = solid([block(), block((45, 5, 50, 10), (0, 3))])
    d = definition((0, 0, -1), (0, 0, 10))
    d['u'], d['v'] = [1, 0, 0], [0, 1, 0]
    assert project.geometry_bounds(project_b({'1': shape}, d))[2] >= 49.99


def test_rib_longitudinal_exclusion_is_owned_and_transverse_is_hatched():
    fs = [block(), block((5, 14, 35, 16), (20, 36), name='加强肋')]
    p, shape = solid(fs)
    d = definition()
    regions = b._rib_regions(d, b._feature_records(p))
    assert '1' in regions
    d['section']['no_hatch'] = regions['1']
    d['section']['_no_hatch_parts'] = regions
    _, other = solid([block((10, 10, 15, 20), (40, 44))], '2')
    d['parts'] = ['1', '2']
    geom = project_b({'1': shape, '2': other}, d)
    assert all(h.get('exclude') for h in geom['hatches'] if h['part'] == '1')
    assert all(not h.get('exclude') for h in geom['hatches'] if h['part'] == '2')
    assert any(c['type'] == 'visible' and c['geom'] == 'line' and
               max(c['from'][1], c['to'][1]) >= 35.9 for c in geom['lines'])
    transverse = definition((1, 0, 0), (20, 0, 0))
    assert not b._rib_regions(transverse, b._feature_records(p))


def test_assembly_solid_shaft_is_unsectioned_only_longitudinally():
    p = dict(name='2', title='芯轴', features=[dict(type='extrude', plane='XY', loops=[dict(circle=[20, 15], d=8)], depth=[0, 50])])
    d = definition()
    d['parts'] = ['1', '2']
    assert b._unsectioned(d, [p]) == ['2']
    transverse = definition((0, 0, -1), (0, 0, 25))
    transverse['parts'] = ['2']
    assert b._unsectioned(transverse, [p]) == []
    _, shaft = solid(p['features'], '2', '芯轴')
    _, case = solid([block(), block((12, 8, 28, 22), (2, 18), op='cut')])
    d['section']['unsectioned'] = ['2']
    geom = project_b({'1': case, '2': shaft}, d)
    assert {h['part'] for h in geom['hatches']} == {'1'}


@pytest.mark.parametrize('key', ['bands', 'path', 'planes', 'offsets', 'section_only'])
def test_08_19_band_regression_rejects_coordinate_stitching(key):
    d = definition()
    d['section'][key] = list(range(19))
    with pytest.raises(ValueError, match='单平面'):
        project_b({}, d)


def test_open_material_loop_fails_instead_of_fabricating_a_closing_edge():
    geom = dict(lines=[], hatches=[dict(part='1', loops=[[[0, 0], [10, 0], [10, 10]]])])
    with pytest.raises(ValueError, match='未闭合'):
        b.project_section({}, definition(), legacy=lambda: geom)


def test_section_marks_use_real_outline_paper_sizes_and_cross_sheet_reference():
    d = definition()
    d['section'] = None
    d['direction'], d['u'], d['v'] = [0, 0, -1], [1, 0, 0], [0, 1, 0]
    d['origin'] = [10, 5, 0]
    lines = [g2.line(a, z, 'visible') for a, z in [([0, 0], [40, 0]), ([40, 0], [40, 30]),
                                                                ([40, 30], [0, 30]), ([0, 30], [0, 0])]]
    parent = SimpleNamespace(vdef=d, scale=.5, geom=dict(lines=lines), marks=Marks(), occ=None,
                             candidate=dict(section_references=[dict(label='K', target_sheet='08-2')]))
    b.section_marks(parent, [0, 15, 0], [0, 1, 0], 'K', legacy=lambda: pytest.fail('旧标记不能吞掉缺失来源'))
    marks = parent.marks.items
    assert len([m for m in marks if m['kind'] == 'arrow']) == 2
    cut = [m['curve'] for m in marks if m['kind'] == 'curve' and m['curve']['type'] == 'cut']
    assert len(cut) == 2
    assert all(abs(np.linalg.norm(np.array(c['to'])-c['from'])-6.5) < 1e-6 for c in cut)
    assert len([m for m in marks if m.get('text') == 'K']) == 2
    assert all(m['height'] >= 9 for m in marks if m.get('text') == 'K')
    assert len([m for m in marks if m.get('text') == '见第 2 张']) == 2
    count = len(marks)
    b.section_marks(parent, [0, 15, 0], [0, 1, 0], 'K', legacy=lambda: None)
    assert len(marks) == count
    with pytest.raises(ValueError, match='不是直线'):
        b.section_marks(parent, [0, 15, 0], [0, 0, -1], 'L', legacy=lambda: None)


@pytest.mark.parametrize('pid', ['08', '13', '19', '21', '25'])
def test_sample_plans_keep_inputs_single_planes_and_continuous_letters(pid):
    sample = json.loads((SAMPLES/f'{pid}.json').read_text(encoding='utf-8'))
    before = copy.deepcopy(sample)
    cs = b.plan_sections(sample['candidates'], context=dict(parts=sample['parts']))
    assert sample == before
    original_candidates = {c['view_key']: c for c in sample['candidates']}
    keys = {c['view_key']: c for c in cs}
    canonical = {}
    for c in cs:
        if not c.get('section'):
            assert c == original_candidates[c['view_key']]
            continue
        assert c['section']['mode'] in ('full', 'local', 'removed')
        assert not any(k in c['section'] for k in ('bands', 'planes', 'path'))
        source = keys[c['source_key']]
        assert abs(np.dot(source['direction'], c['direction'])) < 1e-6
        canonical.setdefault(c['canonical_key'], c['spec']['section']['label'])
        assert canonical[c['canonical_key']] == c['spec']['section']['label']
        assert c['layout_group'] and c['role']
        if c['view_key'].endswith(':B-long'):
            assert '_a_local' not in c['keep']
            assert len(c['keep']['points']) == 4
    assert list(canonical.values()) == [b._letter(i) for i in range(len(canonical))]
    assert len(set(canonical.values())) == len(canonical)
    if pid == '08':
        sections = [c for c in cs if c.get('section')]
        assert len(sections) == 6
        assert [s['view_key'] for s in sections if not s.get('layout_optional')] == ['08-1:v4','08-2:v4']
        assert sections[0]['section']['point'][1] == 78
        assert next(c for c in sections if c['view_key'].endswith(':B-cavity2'))['section']['point'][1] == 32
        levels = [c['section']['point'][2] for c in sections if ':B-level:' in c['view_key']]
        assert levels == [70, 30]  # 每道窗口和对应隔板圆孔轴线共用一个平面。
        windows = next(c for c in sections if c['view_key'].endswith(':B-windows'))
        assert abs(windows['direction'][1]) < 1e-8   # Y 尺寸为实长。
    if pid == '13':
        left = next(c for c in cs if c['view_key'] == '13-2:v4')
        assert left['section']['point'][0] == 66  # 原 x86 未穿主轴孔。
    if pid == '25':
        assert any(c['view_key'].endswith(':B-main') for c in cs)
        assert '3' in next(c for c in cs if c['view_key'] == '25-2:v2')['section']['unsectioned']
        rows = [c for c in cs if ':B-pin-row:' in c['view_key']]
        assert len(rows)==3 and all(c['layout_optional'] for c in rows)
        assert {n for c in rows for n in c['section']['unsectioned']} == {'22','23','24','25','26'}
    if pid == '21':
        both = next(c for c in cs if c['name']=='桥内左右斜路共同轴剖')
        bridge = [r for r in b._feature_records(sample['parts'][0]) if r['definition']['name'] in ('桥左跨腔斜路','桥右跨腔斜路')]
        pj = project.Projector(both)
        for r in bridge:
            for t in (r['lo'],r['hi']):
                end = r['axis']+t*r['n']
                assert abs((end-both['section']['point']) @ pj.w)<1e-6
                assert g2.contains(both['keep'], [pj.to2(end)])[0]


def test_witnesses_are_actual_retained_curves_and_true_cylinder_axes():
    fs = [block(), dict(type='extrude', plane='YZ', loops=[dict(circle=[15, 10], d=8)], depth=[0, 40], op='cut')]
    p, shape = solid(fs)
    d = definition()
    geom = project_b({'1': shape}, d)
    expresses, elements = b._witnesses(d, b._feature_records(p), geom)
    hole = [e for e in elements if e['feature'] == 2]
    assert any(e['kind'] == 'axis' for e in hole)
    contours = [e for e in hole if e['kind'] == 'contour']
    assert len(contours) >= 2
    assert all(any(abs(sum(g2.length(piece) for piece in b.common.visible_curve_overlap(e['curve'], line))
                       -g2.length(e['curve'])) < 1e-5 for line in geom['lines'] if line['type']=='visible')
               for e in contours)
    assert any(e['feature'] == 2 for e in expresses)


def test_rear_opening_is_visible_but_removed_coaxial_opening_has_no_identity():
    def port(depth):
        return dict(type='extrude',op='cut',plane='XZ',loops=[dict(circle=[20,10],d=6)],depth=depth)
    part, shape = solid([block(),block((4,6,36,24),(4,16),op='cut'),port([-6,0]),port([-30,-24])])
    d = definition()
    _, elements = b._witnesses(d,b._feature_records(part),project_b({'1':shape},d))
    assert not any(e['feature']==3 for e in elements)
    assert any(e['feature']==4 and e['curve']['geom']=='circle' and
               'retained_feature_edge' in e['provenance'] for e in elements)


def test_assembly_selectors_use_placed_cylinder_and_actual_end_plane():
    p = dict(name='7',title='阀套',placement=dict(translate=[45,0,0]),features=[
        dict(type='extrude',op='add',plane='XY',loops=[dict(circle=[10,15],d=12)],depth=[0,18]),
        dict(type='extrude',op='cut',plane='XY',loops=[dict(circle=[10,15],d=6)],depth=[0,18])])
    shape = model.build(dict(parts=[p])).parts[0].placed()
    d = dict(definition(),parts=['7'],frame='assembly')
    _,els = b._witnesses(d,b._feature_records(p,True),project_b({'7':shape},d))
    sample = dict(part='7',feature=2,point=[55,15,0],direction=[0,0,1])
    original = [dict(sample,kind='axis',selector='cylinder',radius=3),
                dict(sample,feature=1,kind='plane',selector='end',point=[55,15,18])]
    wrong = dict(sample,kind='plane',selector='wrong',point=[55,15,17])
    b._match_assembly_datums(els,[dict(_id='D1',_witness_3d=dict(kind='assembly_relation',relations=[dict(kind='contact',elements=original+[wrong])]))])
    assert {v['selector'] for el in els for v in el.get('assembly_datums',[])} == {'cylinder','end'}
    assert any(el['kind']=='axis' and el.get('assembly_datums') for el in els)


def test_08_windows_have_actual_cross_level_edges_and_preserve_cover_holes():
    sample = json.loads((SAMPLES/'08.json').read_bytes())
    p = sample['parts'][0]
    shape = model.build(dict(parts=[p])).parts[0].shape
    cs = b.plan_sections(sample['candidates'],context=dict(parts=[p],project_candidate=lambda c: project_b({'1':shape},c)))
    def contours(suffix, fid):
        c = next(c for c in cs if c['view_key'].endswith(suffix))
        return [e['curve'] for e in c['witness_elements'] if e['feature']==fid and e['kind']=='contour']
    for fid, y in [(6,52), (7,66)]:
        assert any(c['geom']=='line' and abs(c['from'][1]-y)<1e-5 and abs(c['to'][1]-y)<1e-5
                   for c in contours(':B-windows',fid))
    for suffix, fid in [(':B-level:6',23),(':B-level:7',24)]:
        assert any(c['geom']=='circle' and c['r']==2.5 for c in contours(suffix,fid))


def test_21_empty_coplanar_cut_is_replaced_by_another_plane_on_the_same_axis():
    sample = json.loads((SAMPLES/'21.json').read_text(encoding='utf-8'))
    source = next(c for c in sample['candidates'] if c['view_key'] == '21-11:v2')
    mdl = model.build(dict(parts=[sample['parts'][0]]))
    shapes = {'1': mdl.parts[0].shape}
    projections = {}
    def callback(c):
        geom = project_b(shapes, c)
        projections[c['view_key']] = geom
        return geom
    cs = b.plan_sections([source], context=dict(parts=sample['parts'], project_candidate=callback))
    section = next(c for c in cs if c.get('section'))
    assert projections[section['view_key']]['hatches']
    assert projections[section['view_key']]['lines']
    hole = next(r for r in b._feature_records(sample['parts'][0]) if r['feature'] == 25)
    assert abs(np.dot(section['direction'], hole['n'])) < 1e-6
    assert abs(np.dot(np.array(section['section']['point'])-hole['axis'], section['direction'])) < 1e-6
    assert section['witness_elements']


def test_19_long_bypass_is_horizontal_with_same_cut_and_real_axis_on_paper():
    sample = json.loads((SAMPLES/'19.json').read_bytes())
    source = next(c for c in sample['candidates'] if c['view_key']=='19-19:v2')
    part = sample['parts'][0]
    hole = next(r for r in b._feature_records(part) if r['definition'].get('name')=='跨层旁通孔1')
    shapes = {'1': model.build(dict(parts=[part])).parts[0].shape}
    cs = b.plan_sections([source], context=dict(parts=[part], project_candidate=lambda c: project_b(shapes,c)))
    cut = next(c for c in cs if c.get('section'))
    assert cut['spec']['rotated']=='cw' and cut['source_key']==source['view_key']
    assert np.allclose(cut['direction'],source['v'])
    assert np.allclose(cut['section']['point'],hole['axis']) and np.allclose(cut['u'],hole['n'])
    assert np.allclose(project.frame_axes(np.array(cut['direction']),cut['spec']['up']),[cut['u'],cut['v']])
    assert cut['spec']['keep']==cut['keep']
    geom = project_b(shapes,cut)
    x0,y0,x1,y1 = project.geometry_bounds(geom)
    assert x1-x0>3.5*(y1-y0) and geom['hatches']
    axes = b._bore_axis_lines(cut['witness_elements'])
    assert len(axes)==1 and axes[0] in geom['lines']
    assert abs(axes[0]['from'][1]-axes[0]['to'][1])<1e-6


def test_reselecting_a_longitudinal_plane_rechecks_rib_cut_direction():
    fs = [block(), block((5, 14, 35, 16), (20, 36), name='加强肋'),
          dict(type='hole', plane=dict(origin=[20, 15, 36], normal=[0, 0, 1], x_dir=[1, 0, 0]),
               at=[0, 0], d=4, depth=36)]
    part, shape = solid(fs)
    d = definition((0, 0, -1))
    d.update(kind='auxiliary', u=[1, 0, 0], v=[0, 1, 0], section=None)
    source = candidate(d, name='端视')
    source['spec'] = dict(type='auxiliary', name='端视', label='端视', direction=[0, 0, -1])
    projections = []
    def callback(c):
        if not projections:
            projections.append(dict(lines=[], hatches=[]))
        else:
            projections.append(project_b({'1': shape}, c))
        return projections[-1]
    cs = b.plan_sections([source], context=dict(parts=[part], project_candidate=callback))
    section = next(c for c in cs if c.get('section'))
    assert abs(section['direction'][0]) > .1  # 已离开肋中面，斜横切肋应画材料线。
    assert not section['section'].get('no_hatch')
    assert all(not h.get('exclude') for h in projections[-1]['hatches'])


def test_all_25_plans_keep_reference_bytes_and_valid_section_sources():
    import advanced_parts
    import make_drawing
    import drawing_common
    for number in range(1, 26):
        pid = f'{number:02d}'
        data = advanced_parts.problem_data(pid)
        drawing_common.assert_reference(HERE/'参考答案'/f'第{pid}题.json', data['description'])
        candidates = []
        for sheet in data['spec']['sheets']:
            names = [p['name'] for p in data['description']['parts']] if sheet.get('frame') == 'assembly' else [sheet.get('part', '1')]
            views = make_drawing.resolve_views(sheet, names)
            keys = {v.name: f"{sheet['id']}:v{v.index+1}" for v in views}
            for v in views:
                d = copy.deepcopy(v.vdef)
                if v.kind == 'detail':
                    parent = next(p for p in views if p.name == v.parent)
                    d.update({k: parent.vdef[k] for k in ('direction', 'u', 'v', 'origin')})
                candidates.append(dict(d, view_key=keys[v.name], name=v.name, part=sheet.get('part'),
                                       frame=sheet.get('frame', 'part'), parent_key=keys.get(v.parent),
                                       expresses=[], spec=copy.deepcopy(v.spec), _head_sheet=sheet['id']))
        cs = b.plan_sections(candidates, context=dict(problem=pid, parts=data['description']['parts']))
        bykey = {c['view_key']: c for c in cs}
        assert len(bykey) == len(cs)
        if len(data['description']['parts']) > 1:
            assert any(c.get('frame') == 'assembly' and c.get('section') for c in cs), pid
        for c in cs:
            if c.get('section'):
                assert abs(np.dot(c['direction'], bykey[c['source_key']]['direction'])) < 1e-6


@pytest.mark.parametrize('pid', ['08', '13', '19', '21', '25'])
def test_sample_main_sections_match_original_solid_material(pid):
    path = HERE/'参考答案'/f'第{pid}题.json'
    original = path.read_bytes()
    description = json.loads(original)
    part_defs = {p['name']: p for p in description['parts']}
    shapes = {}
    sample = json.loads((SAMPLES/f'{pid}.json').read_text(encoding='utf-8'))
    cs = b.plan_sections(sample['candidates'], context=dict(parts=sample['parts']))
    seen = set()
    for c in cs:
        if not c.get('section') or c.get('frame') == 'assembly' or c.get('keep') or c['canonical_key'] in seen:
            continue
        seen.add(c['canonical_key'])
        name = c['part']
        if name not in shapes:
            part = model.build(dict(parts=[part_defs[name]])).parts[0]
            assert not part.error
            shapes[name] = part.shape
        shape = shapes[name]
        geom = project_b({name: shape}, c)
        assert geom['hatches']
        pj = project.Projector(c)
        box = project.geometry_bounds(geom)
        xs = np.linspace(box[0]+.437, box[2]-.593, 17)
        ys = np.linspace(box[1]+.317, box[3]-.719, 13)
        points = np.array([[x, y] for x in xs for y in ys])
        actual = in_material(geom, points)
        classifier = BRepClass3d_SolidClassifier(shape)
        expected = []
        for q in points:
            # 选面可与真实壁面重合；材料按布尔剖切保留侧的极限判断。
            xyz = pj.world(*q, pj.depth(c['section']['point']))-pj.w*1e-4
            classifier.Perform(model.pnt(xyz), 1e-7)
            expected.append(classifier.State() in (TopAbs_IN, TopAbs_ON))
        region = project.section_region(c['section'])
        if region:
            expected = np.asarray(expected) & g2.contains(region, points)
        assert np.array_equal(actual, expected), (pid, c['view_key'])
    assert path.read_bytes() == original

"""公开材料边界与图纸编号契约；防止重新泄露可照抄的参考图线。"""
import json
from pathlib import Path
from PIL import Image
import make_drawing
import pytest

HERE=Path(__file__).resolve().parent
PUBLIC=make_drawing.PUBLIC


def test_final_dimensions_allow_depth_difference_only_with_two_real_projected_datums():
    import drawing_dimensions as dd
    top=dict(direction=[0,0,-1],u=[1,0,0],v=[0,1,0],view_key='top')
    dim=dict(type='linear',source_feature=3,value=6,
             _witness_3d={'from':[1,2,4], 'to':[7,2,19], 'axis':'X'})
    edges=[make_drawing.g2.line([x,0],[x,5],'visible') for x in (1,7)]
    def solve(c,lines):
        return dd.geometric_dimension(dim,dd.ProjectedDatums(c,{'lines':lines}),'1')
    assert solve(top,edges)['points']==[[1,2],[7,2]]
    assert solve(top,[edges[0],dict(edges[1],type='hidden')]) is None
    assert solve(dict(top,direction=[1,0,0],u=[0,1,0],v=[0,0,1]),edges) is None


def test_hidden_hole_center_cross_is_removed_before_assigning_dimensions():
    from drawing_views import delivery_axes
    g=make_drawing.g2
    outline=g.polyline([[-20,-20],[20,-20],[20,20],[-20,20],[-20,-20]],'visible')
    cross=[g.line([-8,0],[8,0],'center'),g.line([0,-8],[0,8],'center')]
    circle=dict(geom='circle',center=[0.,0.],r=5.,type='visible')
    filtered=delivery_axes([outline,dict(circle,type='hidden'),*cross])
    assert all(c['type']!='center' for c in filtered)
    retained=delivery_axes([outline,circle,*cross])
    assert sum(c['type']=='center' for c in retained)==2


def check_assembly_relation(relation):
    import numpy as np
    from numpy.testing import assert_allclose

    kind, elements = relation['kind'], relation['elements']
    pts = np.array([e['point'] for e in elements])
    axis = np.array(relation.get('direction'))
    def equal(a, b):
        assert_allclose(a, b, rtol=0, atol=1e-8)
    if kind == 'coaxial':
        u, v = (np.array(e['direction']) for e in elements)
        equal(np.cross(u,v), 0)
        equal(np.cross(pts[1]-pts[0], u), 0)
    elif kind in ('coplanar','contact'):
        u,v = (e['direction'] for e in elements)
        equal(np.cross(u,v), 0)
        equal((pts[1]-pts[0]) @ u, 0)
    elif kind == 'offset':
        equal((pts[1]-pts[0]) @ axis, relation['value'])
    elif kind == 'coincident':
        for point in pts[1:]:
            equal(point, pts[0])
    elif kind == 'centered':
        equal((pts[0]+pts[1]-pts[2]-pts[3]) @ axis, 0)
    elif kind == 'positive_side':
        assert (pts[1]-pts[0]) @ axis > 0
    elif kind == 'tangent':
        cylinder, face = elements
        equal(np.dot(cylinder['direction'], face['direction']), 0)
        equal(abs((pts[1]-pts[0]) @ face['direction']), cylinder['radius'])
    elif kind == 'radial_alignment':
        u = np.array(elements[0]['direction'])
        low_side = axis - (axis @ u)*u
        low_side /= np.linalg.norm(low_side)
        for delta in pts[1:]-pts[0]:
            radial = delta - (delta @ u)*u
            equal(radial/np.linalg.norm(radial), low_side)
        equal(np.cross(elements[1]['direction'], low_side), 0)
    elif kind == 'angle':
        equal(np.cos(np.deg2rad(relation['value'])), elements[0]['direction'] @ axis)
    elif kind == 'parallel':
        equal(np.cross(elements[0]['direction'], axis), 0)
    elif kind == 'frame_axis':
        equal(elements[0]['axes']['XYZ'.index(relation['axis'])], axis)
    else:
        assert kind == 'aligned_frames'
        equal(elements[0]['axes'], elements[1]['axes'])


@pytest.mark.parametrize('pid,count', [('01',10),('02',12),('22',13),('23',17),('24',21),('25',25)])
def test_assembly_dimensions_bind_original_features_and_verify_placed_relations(pid, count):
    import advanced_parts
    import drawing_common as dc
    import numpy as np
    from drawkit import model

    data = advanced_parts.problem_data(pid)
    dc.assert_reference(HERE/'参考答案'/f'第{pid}题.json', data['description'])
    spec = json.loads(json.dumps(data['spec']))
    dc.ensure_dimension_ids(spec)
    published = json.loads((HERE/'出图规格'/f'{pid}.json').read_bytes())
    dc.ensure_dimension_ids(published)
    def assembly_dims(s):
        return [d for sh in s['sheets'] if sh.get('frame') == 'assembly' for d in sh['dimensions']]
    dims = assembly_dims(spec)
    assert [d['_id'] for d in dims] == [f'D{i}' for i in range(1,count+1)]
    parts = {p['name']:p for p in data['description']['parts']}
    actual_dims = assembly_dims(published)
    by_id = {d['_id']:d for d in actual_dims}
    assert len(actual_dims) == len(by_id) == count
    assert set(by_id) == {d['_id'] for d in dims}
    for d in dims:
        existing = by_id[d['_id']]
        for field in ('_id','type','at','text','value','category','source_part','source_feature','_witness_3d'):
            assert d[field] == existing[field]
        w = d['_witness_3d']
        assert w['coordinate_system'] == 'assembly' and w['kind'] == 'assembly_relation'
        primary = (d['source_part'], d['source_feature'])
        identities = set()
        for relation in w['relations']:
            for e in relation['elements']:
                part = parts.get(e['part'])
                pose = model.placement_matrix(part.get('placement') if part else None)
                np.testing.assert_allclose(e['point'], pose[:3,:3] @ e['local_point'] + pose[:3,3], atol=1e-9)
                if 'direction' in e:
                    np.testing.assert_allclose(e['direction'], pose[:3,:3] @ e['local_direction'], atol=1e-9)
                if e['kind'] == 'frame':
                    np.testing.assert_allclose(e['axes'], pose[:3,:3].T, atol=1e-9)
                    continue
                assert part['features'][e['feature']-1]['name'] == e['name']
                identities.add((e['part'],e['feature']))
                if e['kind'] == 'axis':
                    ends = np.asarray(e['endpoints'])
                    assert e['radius'] > 0 and np.linalg.norm(ends[1]-ends[0]) > 0
                    np.testing.assert_allclose(np.cross(ends[1]-ends[0], e['direction']), 0, atol=1e-8)
            check_assembly_relation(relation)
        assert primary in identities
        assert set(d['covers_features']) == {fid for part,fid in identities if part == primary[0]}


def test_assembly_datums_check_signed_distance_and_stay_private():
    import advanced_parts
    import drawing_common as dc

    spec = advanced_parts.problem_data('25')['spec']
    dims = {d['_id']:d for s in spec['sheets'] if s.get('frame') == 'assembly' for d in s['dimensions']}
    offset = next(r for r in dims['D20']['_witness_3d']['relations'] if r['kind'] == 'offset')
    assert offset['value'] == 6 and dc.check_assembly_relation(offset)
    assert not dc.check_assembly_relation(dict(offset, value=-6))
    radial = next(r for r in dims['D1']['_witness_3d']['relations'] if r['kind'] == 'radial_alignment')
    assert not dc.check_assembly_relation(dict(radial, direction=[0,0,1]))

    published=json.loads((HERE/'出图规格/25.json').read_bytes())
    seen=[]
    for sheet in published['sheets']:
        if sheet['frame']!='assembly':continue
        page=json.loads((HERE/sheet['private_file']).read_bytes())
        public=json.loads((PUBLIC/'25'/(sheet['id']+'.json')).read_bytes())
        for view in page['views']:
            for d in view['dimensions']:
                source=dims[d['id']]
                d.update({k:source[k] for k in ('source_part','source_feature','covers_features','_witness_3d')})
                seen.append(d['id'])
        exported=make_drawing.public_sheet(page)
        make_drawing.validate_public(exported)
        assert exported==public
    assert len(seen)==len(dims) and set(seen)==set(dims)


@pytest.fixture
def head_drawing_hooks(monkeypatch):
    """旧契约用 HEAD 算法测接缝，独立于四包正在开发的策略/图幅限制。"""
    import drawing_common as dc
    import drawing_views as a
    import drawing_sections as b
    import drawing_dimensions as c
    import drawing_layout as d
    monkeypatch.setattr(a,'plan_views',lambda context,*,legacy:legacy())
    monkeypatch.setattr(a,'project_external_view',lambda shapes,definition,*,parent=None,legacy:legacy())
    monkeypatch.setattr(b,'plan_sections',lambda candidates,*,context:candidates)
    monkeypatch.setattr(b,'project_section',lambda shapes,definition,*,parent=None,legacy:legacy())
    monkeypatch.setattr(b,'section_marks',lambda parent,point,direction,letter,*,legacy:legacy())
    monkeypatch.setattr(c,'assign_dimensions',lambda dimensions,candidates,*,context,legacy:legacy())
    monkeypatch.setattr(c,'layout_dimensions',lambda view,dimensions,*,style,legacy:legacy())
    monkeypatch.setattr(d,'plan_sheets',lambda candidates,dimensions,*,context,legacy:legacy())
    monkeypatch.setattr(d,'arrange_views',lambda views,frame_box,reserved,*,style,legacy:legacy())
    monkeypatch.setattr(d,'drawing_style',dc.drawing_style)


def test_public_drawings_are_dimension_catalogs_without_geometry():
    cfg=json.loads((HERE/'references.json').read_text(encoding='utf-8'))
    assert len(cfg['records'])==25
    for rec in cfg['records']:
        spec=json.loads((HERE/'出图规格'/f'{rec["id"]}.json').read_text(encoding='utf-8'))
        ids=[]
        for sheet in spec['sheets']:
            doc=json.loads((PUBLIC/rec['id']/f'{sheet["id"]}.json').read_text(encoding='utf-8'))
            make_drawing.validate_public(doc)
            assert doc['version']==2
            assert len(doc['views'])>=2
            assert all(isinstance(d['value'],(int,float)) for d in doc['dimensions'])
            assert all(set(d)=={'id','view','type','value','text'} for d in doc['dimensions'])
            assert all(d['type']!='线性坐标尺寸' for d in doc['dimensions'])
            assert all('definition' not in v and 'placement' not in v for v in doc['views'])
            ids.extend(int(d['id'][1:]) for d in doc['dimensions'])
            with Image.open(PUBLIC/rec['id']/f'{sheet["id"]}.png') as img:
                assert 200 <= img.info['dpi'][0] <= 300
                assert img.width>3000 and img.height>2500
        assert sorted(ids)==list(range(1,len(ids)+1))


def test_only_preview_is_public_entry_point():
    assert {p.name for p in (PUBLIC/'工具').glob('*.py')}=={'preview.py'}
    assert (HERE/'compare.py').is_file()
    assert not (PUBLIC/'工具/compare.py').exists()


def test_every_reference_feature_has_dimension_witnesses():
    audit=json.loads((HERE/'尺寸覆盖审计.json').read_text(encoding='utf-8'))
    for row in audit:
        for part in row['parts']:
            assert all(feature['witnesses']>0 for feature in part['feature_coverage'])


def test_no_polyline_pairing_in_public_dimensions():
    for path in PUBLIC.glob('*/*.json'):
        doc=json.loads(path.read_text(encoding='utf-8'))
        assert all(not isinstance(d['value'],(list,dict)) for d in doc['dimensions'])
        assert all('角点' not in d['text'] for d in doc['dimensions'])


def test_authoring_placed_cache_tracks_shape_and_pose():
    from drawkit import model
    mdl=model.build({'parts':[{'name':'1','features':[{'type':'extrude','loops':[{'rect':[0,0,20,10]}],'depth':8}]}]})
    sh={'frame':'assembly'}
    a=make_drawing.sheet_shapes(mdl,sh)[0]['1'];b=make_drawing.sheet_shapes(mdl,sh)[0]['1']
    assert a is b
    mdl.parts[0].placement[0,3]=9
    c=make_drawing.sheet_shapes(mdl,sh)[0]['1']
    assert c is not a and abs(model.shape_bbox(c)[0][0]-9)<1e-5


def test_preview_only_renders_two_isometric_images(tmp_path):
    import subprocess, sys
    answer=tmp_path/'第01题.json'
    answer.write_text(json.dumps({'problem':'01','parts':[{'features':[{'type':'extrude','plane':'XY','loops':[{'rect':[0,0,20,12]}],'depth':8}]}]}),encoding='utf-8')
    out=tmp_path/'preview'
    run=subprocess.run([sys.executable,str(PUBLIC/'工具/preview.py'),str(answer),'--out',str(out)],capture_output=True,text=True,encoding='utf-8',timeout=90)
    assert run.returncode==0,run.stderr
    assert {p.name for p in out.iterdir()}=={'轴测-1.png','轴测-2.png'}
    assert '已画图纸' not in run.stdout
    source=(PUBLIC/'工具/preview.py').read_text(encoding='utf-8')
    assert 'from drawkit import model, shade' in source
    assert '--drawings' not in source


def test_preview_cache_does_not_reuse_geometry_from_another_answer():
    from drawkit import model, sheets, project
    definition=dict(kind='basic', direction=[0,1,0],u=[1,0,0],v=[0,0,1],origin=[0,0,0],parts=['1'],hidden=True,section=None)
    sheet={'frame':'part','views':[{'name':'主视图','definition':definition}]}
    def box(width):
        return model.build({'parts':[{'name':'1','features':[{'type':'extrude','plane':'XY','loops':[{'rect':[0,0,width,10]}],'depth':8}]}]}).parts[0].shape
    a,b=box(20),box(35)
    cache={}
    first=sheets.reproject(sheet,{'1':a},cache=cache)['主视图']
    repeated=sheets.reproject(sheet,{'1':a},cache=cache)['主视图']
    changed=sheets.reproject(sheet,{'1':b},cache=cache)['主视图']
    assert repeated is first
    assert abs(project.geometry_bounds(first)[2]-20)<1e-5
    assert abs(project.geometry_bounds(changed)[2]-35)<1e-5


def test_private_oblique_direction_survives_json_roundtrip(head_drawing_hooks):
    from drawkit import model
    mdl=model.build({'parts':[{'name':'1','features':[{'type':'extrude','loops':[{'rect':[0,0,20,10]}],'depth':8}]}]})
    sh={'id':'16-test','paper':'A1','scale':2,'views':[{'type':'auxiliary','name':'A','direction':[.12345678912345678,.8,.2]}]}
    expected=make_drawing.resolve_views(sh,['1'])[0].vdef
    actual=json.loads(json.dumps(make_drawing.make_sheet(sh,mdl,'16','精度检查',1,1,240)))['views'][0]['definition']
    for key in ('direction','u','v','origin'):
        assert actual[key]==expected[key]


def test_auxiliary_letter_moves_clear_without_erasing_outline():
    import copy
    from drawkit import geom2d as g2
    lines=[g2.polyline([[0,0],[50,0],[50,30],[0,30],[0,0]],'visible')]
    view={'lines':copy.deepcopy(lines),'placement':{'scale':1,'paper_origin':[300,200]},'dimensions':[],
          'annotations':[{'kind':'text','text':'斜视2','at':[47,15],'height':9,'role':'aux'},
                         {'kind':'arrow','tip':[47,15],'dir':[1,0],'size':3,'role':'aux'}]}
    sh={'sheet':'16-test','paper':{'width':841,'height':594},'views':[view],'sheet_marks':[]}
    rib = {'shape':'circle', 'center':[-80,-80], 'r':2}
    view['hatches'] = [dict(loops=[[[-100,-100],[150,-100],[150,130],[-100,130]]], exclude=[rib])]
    make_drawing.clear_auxiliary_letters(sh)
    mark=next(m for m in view['annotations'] if m['kind']=='text')
    b=make_drawing.text_box(mark['text'],mark['at'],9,mark['anchor'])
    assert not make_drawing.box_overlap(b,[0,0,50,30],1)
    assert view['lines']==lines
    exclusions = view['hatches'][0]['exclude']
    assert exclusions[0] == rib and len(exclusions) == 2
    assert g2.contains(exclusions[1], mark['at'])[0]
    assert not g2.contains(exclusions[1], [47,15])[0]


def test_rotated_label_protects_hatch_in_neighbouring_view_in_view_units():
    from drawkit import geom2d as g2
    import copy
    import numpy as np
    view = dict(placement=dict(scale=2,paper_origin=[100,90]),annotations=[],dimensions=[],lines=[],
                hatches=[dict(loops=[[[-30,-30],[30,-30],[30,30],[-30,30]]])])
    label = dict(kind='text',text='12',height=8,at=[20,20],angle=45,anchor='lb')
    other = dict(placement=dict(scale=.5,paper_origin=[90,80]),annotations=[],dimensions=[dict(draw=[label])])
    sheet = dict(views=[view,other])
    make_drawing.protect_hatch_text(sheet)
    exclusion, = view['hatches'][0]['exclude']
    corners = np.array(exclusion['points'])
    np.testing.assert_allclose(corners[1]-corners[0], np.repeat((corners[1]-corners[0])[0],2))
    assert g2.contains(exclusion,[0,1])[0]
    assert not g2.contains(exclusion,[12,-6])[0]
    first = copy.deepcopy(sheet)
    make_drawing.protect_hatch_text(sheet)
    assert sheet == first


def test_writer_checks_final_letter_positions_before_any_page_output(tmp_path, monkeypatch, head_drawing_hooks):
    import drawing_layout

    spec = {'problem':'19', '_drawing_planned':True, 'sheets':[{
        'id':'19-1', 'paper':'A3', 'scale':1, 'views':[{'type':'front'}]}]}
    ref = {'parts':[{'name':'1','features':[{'type':'extrude','loops':[{'rect':[0,0,20,8]}],'depth':6}]}]}
    spec_path, ref_path, out = tmp_path/'spec.json', tmp_path/'ref.json', tmp_path/'output'
    spec_path.write_text(json.dumps(spec), encoding='utf-8')
    ref_path.write_text(json.dumps(ref), encoding='utf-8')
    moved = []
    move = make_drawing._move_auxiliary_letters
    def observe_move(doc):
        move(doc)
        moved.append(doc)
    monkeypatch.setattr(make_drawing, '_move_auxiliary_letters', observe_move)
    def reject(doc):
        assert moved[-1] is doc
        return False
    monkeypatch.setattr(drawing_layout, 'arrange_finalized_page', reject)
    with pytest.raises(make_drawing.SpecError, match='19-1.*最终'):
        make_drawing.run(spec_path, ref_path, out)
    assert len(moved) == 1 and not any(p.is_file() for p in out.rglob('*'))


@pytest.mark.parametrize('rotation,side', [('cw',1),('ccw',-1)])
def test_rotated_view_label_arrow_is_tangent_at_correct_end(rotation,side):
    from types import SimpleNamespace
    import numpy as np

    v = SimpleNamespace(kind='auxiliary', name='A-A', marks=make_drawing.Marks(), box_geom=[0,0,30,12],
                        dims=[], scale=1, source_reference=None, spec=dict(rotated=rotation))
    make_drawing.add_label(v)
    arc, = [m['curve'] for m in v.marks.items if m['kind']=='curve']
    arrow, = [m for m in v.marks.items if m['kind']=='arrow']
    np.testing.assert_allclose(arrow['tip'],np.array(arc['center'])+[side*arc['r'],0])
    assert arrow['dir']==[0,-1]


def test_explicit_view_position_must_stay_inside_paper_frame(head_drawing_hooks):
    from drawkit import model
    mdl=model.build({'parts':[{'name':'1','features':[{'type':'extrude','loops':[{'rect':[0,0,20,10]}],'depth':8}]}]})
    view={'type':'front','free':True,'at':[0,0]}
    sh={'id':'16-frame','paper':'A1','scale':2,'views':[view]}
    try:
        make_drawing.make_sheet(sh,mdl,'16','图框边界',1,1,240)
    except make_drawing.SpecError:
        pass
    else:
        raise AssertionError('自由定位视图越出图框应拒绝出图')
    view['at']=[350,250]
    actual=make_drawing.make_sheet(sh,mdl,'16','图框边界',1,1,240)
    assert len(actual['views'])==1


def test_seam_freezes_head_ids_before_repagination_and_preserves_references(head_drawing_hooks):
    import advanced_parts
    import drawing_common
    for number in range(1, 26):
        data=advanced_parts.problem_data(number)
        drawing_common.assert_reference(HERE/'参考答案'/f'第{number:02d}题.json',data['description'])
        dims=[d for sh in data['spec']['sheets'] for d in sh.get('dimensions',[])]
        expected={d['_id']:d['value'] for d in dims}
        assert list(expected)==[f'D{i}' for i in range(1,len(dims)+1)]
        assert all(d.get('_witness_3d') is not None for d in dims if d.get('source_feature'))
        data['spec']['sheets'].reverse()
        planned,_,assigned=make_drawing.plan_problem(data['spec'],data['description'])
        assert {d['_id']:d['value'] for d in assigned}==expected
        assert {d['_id']:d['value'] for sh in planned['sheets'] for d in sh.get('dimensions',[])}==expected


def test_seam_private_metadata_does_not_enter_public_catalog(head_drawing_hooks):
    import copy
    import advanced_parts
    data=advanced_parts.problem_data('08')
    _,candidates,dims=make_drawing.plan_problem(data['spec'],data['description'])
    private=json.loads((HERE/'图纸几何/08-1.json').read_text(encoding='utf-8'))
    private['views'][0]['view_key']=candidates[0]['view_key']
    first=private['views'][0]['dimensions'][0]
    dimension=next(d for d in dims if d['_id']==first['id'])
    first.update({k:copy.deepcopy(dimension[k]) for k in ('source_feature','covers_features','_witness_3d')})
    public=make_drawing.public_sheet(private)
    make_drawing.validate_public(public)
    assert all(set(d)=={'id','view','type','value','text'} for d in public['dimensions'])
    serialized=json.dumps(public)
    assert all(k not in serialized for k in ('view_key','source_feature','covers_features','_witness_3d'))


def test_sandbox_rejects_reference_drift_before_generating_files(tmp_path,monkeypatch):
    import advanced_parts
    import drawing_common
    import pytest
    data=advanced_parts.problem_data('08')
    data['description']['parts'][0]['features'][0]['name']='不允许改变几何来源'
    monkeypatch.setattr(advanced_parts,'problem_data',lambda _:data)
    with pytest.raises(AssertionError,match='参考答案逐字不一致'):
        make_drawing.sandbox('08',tmp_path/'draft')
    assert not list(tmp_path.rglob('*.json'))
    for protected in (HERE/'参考答案',PUBLIC/'08',HERE.parents[4]):
        with pytest.raises(ValueError,match='正式材料'):
            drawing_common.sandbox_directory(protected)


def test_c_and_d_can_measure_candidates_before_final_pagination(monkeypatch,head_drawing_hooks):
    import drawing_common
    import drawing_dimensions
    import drawing_layout
    description={'parts':[{'name':'1','features':[{'type':'extrude','loops':[{'rect':[0,0,20,12]}],'depth':8}]}]}
    spec={'problem':'08','sheets':[{'id':'08-test','paper':'A1','frame':'part','part':'1',
        'views':[{'type':'front'}],'dimensions':[{'view':'主视图','type':'linear',
        'from':[0,0],'to':[20,0],'dir':'h','value':20}]}]}
    seen=[]
    def assign(dimensions,candidates,*,context,legacy):
        projection=context['project_candidate'](candidates[0])
        assert projection['lines']
        seen.append('projected')
        return legacy()
    def sheets(candidates,dimensions,*,context,legacy):
        assert context['layout_capabilities']['source_references'] is True
        trial=drawing_common.make_sheet_spec(context['head_sheets'][0],candidates,dimensions)
        views=context['measure_sheet'](trial,1.)
        assert views[0].dimension_bbox is not None
        assert views[0].dims[0]['value']==20
        seen.append('measured')
        return legacy()
    monkeypatch.setattr(drawing_dimensions,'assign_dimensions',assign)
    monkeypatch.setattr(drawing_layout,'plan_sheets',sheets)
    make_drawing.plan_problem(spec,description)
    assert seen==['projected','measured']


def test_multiple_parts_share_sheet_without_using_assembly_placements(head_drawing_hooks):
    from drawkit import model,project
    description={'parts':[{'name':str(i),'placement':{'translate':[100*i,30,10]},
        'features':[{'type':'extrude','loops':[{'rect':[0,0,width,12]}],'depth':8}]}
        for i,width in [(1,20),(2,35)]]}
    mdl=model.build(description)
    sheet={'id':'08-multi','paper':'A1','scale':2,'frame':'part','parts':['1','2'],
        'views':[{'type':'front','name':f'零件{i}主视','parts':[str(i)],'free':True} for i in (1,2)]}
    shapes,names=make_drawing.sheet_shapes(mdl,sheet)
    assert names==['1','2']
    assert all(abs(model.shape_bbox(shape)[0][0])<1e-6 for shape in shapes.values())
    runtime=make_drawing.compose(sheet,mdl,2,1,1,'08','小件合页')
    assert [round(project.geometry_bounds(v.geom)[2],6) for v in runtime]==[20,35]
    actual=make_drawing.make_sheet(sheet,mdl,'08','小件合页',1,1,240)
    assert len(actual['views'])==2 and actual['parts']==['1','2']
    assert [v['definition']['parts'] for v in actual['views']]==[['1'],['2']]


def test_cross_page_parents_are_projected_but_not_drawn_and_section_traces_use_new_pages(monkeypatch,head_drawing_hooks):
    import copy
    import drawing_common as dc
    import drawing_sections
    import drawing_layout
    from drawkit import model
    description={'parts':[{'name':'1','features':[{'type':'extrude','loops':[{'rect':[0,0,20,12]}],'depth':8}]}]}
    source={'type':'top','name':'平面'}
    section={'type':'front','name':'A-A','free':True,'section':{'mode':'full','point':[0,6,0],'label':'A','parent':'平面'}}
    auxiliary={'type':'auxiliary','direction':[0,-1,0],'name':'斜视','label':'L','parent':'平面','arrow_at':[10,6]}
    detail={'type':'detail','name':'局部','parent':'平面','center':[10,6],'r':4,'scale':3,'label':'Ⅰ'}
    spec={'problem':'08','sheets':[{'id':'旧页','paper':'A1','frame':'part','part':'1','scale':2,
        'views':[source,section,auxiliary,detail],'dimensions':[]}]}
    def sections(candidates,*,context):
        for candidate in candidates[1:]:
            candidate['source_key']=candidates[0]['view_key']
        return candidates
    def sheets(candidates,dimensions,*,context,legacy):
        pages = [dc.make_sheet_spec(dict(context['head_sheets'][0], id=f'新页-{i}'), [candidate], [])
                 for i,candidate in enumerate(candidates,1)]
        trial_ref = dict(label='A', point=[0,6,0], direction=[0,1,0], target_sheet=7, target_sheet_id='试排旧页')
        pages[0]['views'][0]['section_references'] = [trial_ref]
        pages[0]['section_traces'] = [dict(trial_ref, parent='平面', parent_key=candidates[0]['view_key'])]
        return pages
    monkeypatch.setattr(drawing_sections,'plan_sections',sections)
    monkeypatch.setattr(drawing_layout,'plan_sheets',sheets)
    planned,candidates,_=make_drawing.plan_problem(spec,description)
    pages=planned['sheets']
    assert pages[1]['views'][0]['section']['source_sheet']==1
    assert pages[1]['views'][0]['section']['source_sheet_id']=='新页-1'
    trace, = pages[0]['section_traces']
    ref, = pages[0]['views'][0]['section_references']
    assert trace['target_sheet_id'] == ref['target_sheet_id'] == '新页-2'
    assert trace['target_sheet'] == ref['target_sheet'] == 2
    assert candidates[0]['section_references'] == [ref]
    assert candidates[1]['spec']['section']['source_sheet_id'] == '新页-1'
    snapshot = copy.deepcopy(pages)
    make_drawing.finalize_sheet_references(pages, candidates)
    assert pages == snapshot
    for page in pages[1:]:
        assert len(page['views'])==1 and len(page['projection_views'])==1
        assert page['views'][0]['parent'] is None
    mdl=model.build(description)
    for index,page in enumerate(pages,1):
        actual=make_drawing.make_sheet(page,mdl,'08','跨页',index,len(pages),240)
        assert len(actual['views'])==1
        if index>1:
            assert actual['views'][0]['view_key']==page['views'][0]['view_key']
            assert any('见第 1 张' in m.get('text','') for m in actual['views'][0]['annotations'])


def test_dimension_assignment_error_retains_partial_results_and_audit(monkeypatch,head_drawing_hooks):
    import drawing_common as dc
    import drawing_dimensions
    import drawing_layout
    audit=[{'id':'D1','status':'unresolved','reason':'最终边身份不足'}]
    unresolved=[{'id':'D1','feature':1,'reason':'需要 final_edge'}]
    partial=[{'_id':'D2','view_key':'proved'}]
    def assign(dimensions,candidates,*,context,legacy):
        raise dc.DimensionAssignmentError(unresolved=unresolved,assignments=partial,audit=audit)
    monkeypatch.setattr(drawing_dimensions,'assign_dimensions',assign)
    monkeypatch.setattr(drawing_layout,'plan_sheets',lambda *a,**k:pytest.fail('失败归属不得进入分页'))
    spec={'problem':'08','sheets':[{'id':'旧页','views':[{'type':'front'}],
        'dimensions':[{'view':'主视图','type':'leader','at':[0,0],'text':['R1'],'value':1}]}]}
    with pytest.raises(dc.DimensionAssignmentError) as caught:
        make_drawing.plan_problem(spec,{'parts':[{'name':'1','features':[]}]})
    assert caught.value.context['dimension_audit'] is audit
    assert caught.value.unresolved==unresolved and caught.value.assignments==partial
    assert 'sheet_id' not in audit[0]


def test_projection_parent_can_differ_from_visible_locator(head_drawing_hooks):
    import copy
    import drawing_common as dc
    from drawkit import model
    base={'view_key':'parent','name':'平面','kind':'basic','frame':'part','part':'1','parts':['1'],
        'direction':[0,0,-1],'u':[1,0,0],'v':[0,1,0],'origin':[0,0,0],'hidden':False,'section':None,
        'spec':{'type':'top','name':'平面'}}
    locator=copy.deepcopy(base)
    locator.update(view_key='locator',role='locator',name='小定位')
    locator['spec'].update(name='小定位',free=True,scale=1)
    detail={'view_key':'detail','name':'局部','kind':'detail','frame':'part','part':'1','parts':['1'],
        'parent_key':'parent','source_key':'locator','detail':{'parent':'平面','center':[10,6],'r':4},
        'spec':{'type':'detail','name':'局部','parent':'平面','center':[10,6],'r':4,'label':'Ⅰ','scale':3}}
    sheet=dc.make_sheet_spec({'id':'08-locator','frame':'part','paper':'A1','scale':2},
        [detail,locator],[],projection_views=[base])
    mdl=model.build({'parts':[{'name':'1','features':[{'type':'extrude','loops':[{'rect':[0,0,20,12]}],'depth':8}]}]})
    actual=make_drawing.make_sheet(sheet,mdl,'08','定位',1,1,240)
    assert {v['view_key'] for v in actual['views']}=={'detail','locator'}
    locator_view=next(v for v in actual['views'] if v['view_key']=='locator')
    assert any(m.get('role')=='detail' for m in locator_view['annotations'])
    with pytest.raises(ValueError,match='不属于该页'):
        dc.make_sheet_spec({'frame':'part'},[detail,locator],
            [{'_id':'D1','view_key':'parent'}],projection_views=[base])


def test_dimension_audit_uses_final_sheet_ids_and_private_metadata_survives(monkeypatch,head_drawing_hooks):
    import copy
    import drawing_common as dc
    import drawing_dimensions
    import drawing_layout
    from drawkit import model
    captured={}
    witness={'kind':'contour','curve':{'geom':'line','from':[0,0],'to':[20,0],'type':'visible'}}
    def assign(dimensions,candidates,*,context,legacy):
        result=legacy()
        context['dimension_audit']=[{'id':d['_id'],'_head_sheet':d['_head_sheet'],'status':'proved'} for d in result]
        captured['context']=context
        for d in result:
            d['_dimension_witness']=copy.deepcopy(witness)
            d['_dimension_audit']={'id':d['_id'],'status':'proved'}
        return result
    def sheets(candidates,dimensions,*,context,legacy):
        return [dc.make_sheet_spec(dict(context['head_sheets'][0],id=identity),candidates,[d])
            for identity,d in zip(['最终乙','最终甲'],reversed(dimensions))]
    monkeypatch.setattr(drawing_dimensions,'assign_dimensions',assign)
    monkeypatch.setattr(drawing_layout,'plan_sheets',sheets)
    description={'parts':[{'name':'1','features':[{'type':'extrude','loops':[{'rect':[0,0,20,12]}],'depth':8}]}]}
    spec={'problem':'08','sheets':[{'id':'旧页','paper':'A1','scale':2,'views':[{'type':'front'}],
        'dimensions':[{'view':'主视图','type':'leader','at':[0,0],'text':[str(v)],'value':v} for v in (1,2)]}]}
    planned,_,assigned=make_drawing.plan_problem(spec,description)
    audits={d['id']:d for d in captured['context']['dimension_audit']}
    assert audits['D1']['sheet_id']=='最终甲' and audits['D2']['sheet_id']=='最终乙'
    assert all(d['_head_sheet']=='旧页' for d in audits.values())
    assert planned['_dimension_audit']==captured['context']['dimension_audit']
    assert assigned[0]['_dimension_audit']['sheet_id']=='最终甲'
    actual=make_drawing.make_sheet(planned['sheets'][0],model.build(description),'08','审计',1,2,240)
    dimension=actual['views'][0]['dimensions'][0]
    assert dimension['_dimension_witness']==witness
    assert dimension['_dimension_audit']['sheet_id']=='最终乙'
    public=make_drawing.public_sheet(actual)
    make_drawing.validate_public(public)
    assert set(public['dimensions'][0])=={'id','view','type','value','text'}
    assert '_dimension_' not in json.dumps(public)
    public['dimensions'][0]['_dimension_audit']={'status':'proved'}
    with pytest.raises(make_drawing.SpecError,match='泄露'):
        make_drawing.validate_public(public)


def test_optional_candidate_identity_fields_are_private_and_role_is_canonical(head_drawing_hooks):
    import drawing_common as dc
    from drawkit import model
    candidate={'view_key':'end','name':'端视','kind':'basic','part':'1','frame':'part','parts':['1'],
        'direction':[0,1,0],'u':[1,0,0],'v':[0,0,1],'origin':[0,0,0],'hidden':False,'section':None,
        'spec':{'type':'front','name':'端视'},'view_role':'interface_end','layout_group':'接口1',
        'source_key':'base','canonical_key':'end','omitted_features':[2],
        'layout_optional':True,
        'keep':{'shape':'circle','center':[10,4],'r':20,'_a_local':{'depth':[-12,0],'features':[1]}},
        '_a_features':[{'part':'1','feature':1,'definition':{'type':'extrude'}}],
        'witness_elements':[{'part':'1','feature':1,'parameters':['depth'],'kind':'contour',
            'curve':{'geom':'line','from':[0,0],'to':[20,0],'type':'visible'},'provenance':'final HLR'}]}
    sheet=dc.make_sheet_spec({'id':'08-end','paper':'A1','scale':2},[candidate],[])
    view=sheet['views'][0]
    assert view['role']=='detail' and 'view_role' not in view['_candidate']
    assert view['layout_optional'] is True
    assert view['_definition']['_a_features']==candidate['_a_features']
    assert view['_definition']['witness_elements']==candidate['witness_elements']
    assert view['_definition']['keep']['_a_local']==candidate['keep']['_a_local']
    mdl=model.build({'parts':[{'name':'1','features':[{'type':'extrude','loops':[{'rect':[0,0,20,12]}],'depth':8}]}]})
    actual=make_drawing.make_sheet(sheet,mdl,'08','身份',1,1,240)
    assert actual['views'][0]['witness_elements']==candidate['witness_elements']
    public=make_drawing.public_sheet(actual)
    serialized=json.dumps(public)
    assert all(key not in serialized for key in dc.CANDIDATE_PRIVATE_FIELDS)


def test_no_hatch_parts_does_not_exclude_other_parts_material():
    import copy
    loops=[[[0,0],[10,0],[10,10],[0,10]]]
    geometry={'lines':[],'hatches':[{'part':'1','loops':copy.deepcopy(loops)},
                                  {'part':'2','loops':copy.deepcopy(loops)}]}
    polygon=[[2,2],[8,2],[8,8],[2,8]]
    result=make_drawing.part_no_hatch(geometry,{'section':{'_no_hatch_parts':{'1':[polygon]}}})
    assert result['hatches'][0]['exclude']==[{'shape':'polygon','points':polygon}]
    assert 'exclude' not in result['hatches'][1]
    assert all('exclude' not in h for h in geometry['hatches'])


@pytest.mark.parametrize('kind,parameter,value',[('fillet','radius',2),('chamfer','distance',1)])
def test_rc_final_edge_proof_uses_generated_face_and_final_visible_topology(kind,parameter,value):
    import copy
    import drawing_common as dc
    from drawkit import model,project
    description={'parts':[{'name':'1','features':[
        {'type':'extrude','loops':[{'rect':[0,0,20,12]}],'depth':8},
        dict(type=kind,edges=[[0,0,4]],**{parameter:value})]}]}
    original=copy.deepcopy(description)
    mdl=model.build(description)
    part=mdl.parts[0]
    before=model.shape_volume(part.shape)
    candidate=dict(view_key='top',frame='part',kind='basic',parts=['1'],
        direction=[0,0,-1],u=[1,0,0],v=[0,1,0],origin=[0,0,0],hidden=False,scale=1)
    geometry=project.project_view({'1':part.shape},candidate)
    service=dc.FinalEdgeWitnesses(mdl,description)
    elements=service.prove(candidate,geometry)
    assert elements and all(e['kind']=='final_edge' and e['feature']==2 for e in elements)
    assert all(e['provenance']['visibility']=='VCompound(final scene edge)' for e in elements)
    if kind=='fillet':
        assert any(e['curve']['geom']=='arc' and e['curve']['r']==2 for e in elements)
    else:
        assert any(e['curve']['geom']=='line' for e in elements)
    assert description==original and abs(model.shape_volume(part.shape)-before)<1e-9


def test_rc_final_edge_proof_rejects_a_hidden_edge_even_with_coincident_visible_arc():
    import drawing_common as dc
    from drawkit import model,project
    description={'parts':[{'name':'1','features':[
        {'type':'extrude','loops':[{'rect':[0,0,20,12]}],'depth':8},
        {'type':'fillet','radius':2,'edges':[[0,0,4]]}]},
        {'name':'2','features':[{'type':'extrude','loops':[{'rect':[0,0,20,12],'r':2}],'depth':[9,10]}]}]}
    mdl=model.build(description)
    candidate=dict(view_key='occluded',frame='part',kind='basic',parts=['1','2'],
        direction=[0,0,-1],u=[1,0,0],v=[0,1,0],origin=[0,0,0],hidden=False,scale=1)
    geometry=project.project_view({p.name:p.shape for p in mdl.parts},candidate)
    assert any(c['type']=='visible' and c['geom']=='arc' and c['center']==[2.,2.] for c in geometry['lines'])
    assert dc.FinalEdgeWitnesses(mdl,description).prove(candidate,geometry)==[]


def test_rc_final_edge_proof_rejects_finish_removed_by_later_feature():
    import drawing_common as dc
    from drawkit import model,project
    description={'parts':[{'name':'1','features':[
        {'type':'extrude','loops':[{'rect':[0,0,20,12]}],'depth':8},
        {'type':'fillet','radius':2,'edges':[[0,0,4]]},
        {'type':'extrude','op':'cut','loops':[{'rect':[-1,-1,4,4]}],'depth':8}]}]}
    mdl=model.build(description)
    assert mdl.ok
    candidate=dict(view_key='removed',frame='part',kind='basic',parts=['1'],
        direction=[0,0,-1],u=[1,0,0],v=[0,1,0],origin=[0,0,0],hidden=False,scale=1)
    geometry=project.project_view({'1':mdl.parts[0].shape},candidate)
    service=dc.FinalEdgeWitnesses(mdl,description)
    assert service.prove(candidate,geometry)==[]
    assert service.audit['removed:1:2']['status']=='unresolved'


def test_rc_final_edge_proof_respects_assembly_placement():
    import drawing_common as dc
    from drawkit import model,project
    description={'parts':[{'name':'1','placement':{'translate':[50,-8,12]},'features':[
        {'type':'extrude','loops':[{'rect':[0,0,20,12]}],'depth':8},
        {'type':'fillet','radius':2,'edges':[[0,0,4]]}]}]}
    mdl=model.build(description)
    candidate=dict(view_key='placed',frame='assembly',kind='basic',parts=['1'],
        direction=[0,0,-1],u=[1,0,0],v=[0,1,0],origin=[0,0,0],hidden=False,scale=1)
    geometry=project.project_view({'1':mdl.parts[0].placed()},candidate)
    elements=dc.FinalEdgeWitnesses(mdl,description).prove(candidate,geometry)
    assert any(e['curve'].get('center')==[52.,-6.] for e in elements)


def test_project_candidate_supplies_rc_final_edges_to_c(monkeypatch,head_drawing_hooks):
    import drawing_dimensions
    captured={}
    def assign(dimensions,candidates,*,context,legacy):
        geometry=context['project_candidate'](candidates[0])
        captured['elements']=[e for e in geometry.get('witness_elements',[]) if e['kind']=='final_edge']
        assert context['final_edge_witnesses'](candidates[0])==captured['elements']
        captured['audit']=context['final_edge_audit']
        return legacy()
    monkeypatch.setattr(drawing_dimensions,'assign_dimensions',assign)
    description={'parts':[{'name':'1','features':[
        {'type':'extrude','loops':[{'rect':[0,0,20,12]}],'depth':8},
        {'type':'fillet','radius':2,'edges':[[0,0,4]]}]}]}
    spec={'problem':'08','sheets':[{'id':'08-test','frame':'part','part':'1','paper':'A1',
        'views':[{'type':'top'}],'dimensions':[]}]}
    make_drawing.plan_problem(spec,description)
    assert captured['elements']
    assert any(row['status']=='proved' for row in captured['audit'].values())


def test_cross_page_auxiliary_references_are_drawn_before_dimension_layout(monkeypatch,head_drawing_hooks):
    import drawing_dimensions
    from drawkit import model
    seen=[]
    def layout(view,dimensions,*,style,legacy):
        labels=[m for m in view.marks.items if m['kind']=='text' and '见第 2 张' in m['text']]
        assert labels and any(m['kind']=='arrow' for m in view.marks.items)
        label=labels[0]
        assert view.occ.cost(make_drawing.text_box(label['text'],label['at'],label['height'],label['anchor']))>0
        seen.append('source_mark_before_dimensions')
        return legacy()
    monkeypatch.setattr(drawing_dimensions,'layout_dimensions',layout)
    reference={'view_key':'remote','label':'L','direction':[1,1,0],'arrow_at':[5,4],'target_sheet':2}
    sheet={'id':'08-source','frame':'part','part':'1','paper':'A1','scale':2,
        'views':[{'type':'front','auxiliary_references':[reference]}]}
    mdl=model.build({'parts':[{'name':'1','features':[{'type':'extrude','loops':[{'rect':[0,0,20,12]}],'depth':8}]}]})
    private=make_drawing.make_sheet(sheet,mdl,'08','来源',1,2,240)
    assert seen==['source_mark_before_dimensions']
    assert private['views'][0]['auxiliary_references']==[reference]
    public=make_drawing.public_sheet(private)
    assert 'auxiliary_references' not in json.dumps(public)


def test_actual_08_planners_deliver_optional_sections_and_ports_to_dimension_assignment(monkeypatch):
    import advanced_parts
    import drawing_dimensions

    class CandidatesChecked(Exception):
        pass

    def check(dimensions, candidates, *, context, legacy):
        assert context['layout_capabilities']['source_references'] is True
        assert context['candidates'] is candidates
        by_key = {c['view_key']: c for c in candidates}
        cuts = {'08-1:v4:B-cavity2', '08-1:v4:B-level:6', '08-1:v4:B-level:7'}
        ports = {'08:1:port:13', '08:1:port:14'}
        for key in cuts | ports:
            assert by_key[key]['layout_optional'] is True
            assert by_key[key]['role'] == 'detail'
        assert all(not by_key[key].get('layout_optional') for key in ('08-1:v1','08-1:v4','08-2:v4'))
        assert all(by_key[key]['role'] == 'overview' for key in ('08-1:v1','08-1:v2','08-1:v3'))
        assert all('view_role' not in c and 'view_role' not in c['spec'] for c in candidates)
        assert len(dimensions) == 65
        raise CandidatesChecked

    monkeypatch.setattr(drawing_dimensions, 'assign_dimensions', check)
    data = advanced_parts.problem_data('08')
    with pytest.raises(CandidatesChecked):
        make_drawing.plan_problem(data['spec'], data['description'])


def test_explicit_selection_survives_role_alias_and_undeclared_views_remain_required():
    import drawing_common as dc

    c = {'view_key':'08:1:port:13', 'kind':'auxiliary', 'spec':{'view_role':'interface_end', 'layout_optional':False}}
    normalized = dc.normalize_candidate(c)
    assert normalized['role'] == normalized['spec']['role'] == 'detail'
    assert normalized['layout_optional'] is False and 'view_role' not in normalized['spec']
    assert c['spec']['view_role'] == 'interface_end'
    required = dc.normalize_candidate({'view_key':'new', 'kind':'basic'})
    assert required['role'] == 'overview' and not required.get('layout_optional')


def test_d_measures_real_b_target_markers_before_paginated_traces_exist(monkeypatch):
    import drawing_dimensions
    from drawkit import model

    mdl = model.build({'parts':[{'name':'1', 'features':[
        {'type':'extrude', 'loops':[{'rect':[0,0,20,12]}], 'depth':8}]}]})
    ref = dict(label='F', point=[0,6,0], direction=[0,1,0], target_sheet=3)
    source = {'type':'top', 'name':'来源总览', 'view_key':'source', 'section_references':[ref]}
    sheet = {'id':'来源', 'paper':'A3', 'part':'1', 'views':[source]}
    observed = []

    def inspect(view, dimensions, *, style, legacy):
        marks = view.marks.items
        labels = [m for m in marks if m['kind'] == 'text' and m['text'] == '见第 3 张']
        assert len(labels) == 2 and sum(m['kind'] == 'arrow' and m.get('role') == 'section' for m in marks) == 2
        assert all(view.occ.cost(make_drawing.text_box(m['text'], m['at'], m['height'], m['anchor'])) > 0 for m in labels)
        observed.append(labels)
        return legacy()

    monkeypatch.setattr(drawing_dimensions, 'layout_dimensions', inspect)
    make_drawing.compose(sheet, mdl, 1, 1, 3, '08', '试排')
    sheet['section_traces'] = [dict(ref, parent='来源总览', parent_key='source', target_sheet_id='结果')]
    make_drawing.compose(sheet, mdl, 1, 1, 3, '08', '正式')
    assert observed[0] == observed[1]


@pytest.mark.parametrize('private_definition', [False, True])
def test_hidden_part_dependency_never_changes_default_projection_selection(head_drawing_hooks, private_definition):
    from drawkit import model, project

    mdl = model.build({'parts':[{'name': str(n), 'features':[
        {'type':'extrude', 'loops':[{'rect':[0,0,n*10,12]}], 'depth':8}]} for n in (1,2)]})
    sheet = {'frame':'part', 'views':[{'type':'front', 'name':'正面', 'view_key':'visible'}],
             'projection_views':[{'type':'front', 'parts':['2'], 'name':'正面', 'view_key':'dep'}]}
    if private_definition:
        sheet['views'][0]['_definition'] = dict(kind='basic', direction=[0,1,0], u=[1,0,0], v=[0,0,1],
                                               origin=[0,0,0], hidden=False)
    shapes, defaults = make_drawing.sheet_shapes(mdl, sheet)
    assert set(shapes) == {'1','2'} and defaults == ['1']
    visible, = make_drawing.compose(sheet, mdl, 1, 1, 1, '08', '试排')
    assert visible.vdef['parts'] == ['1'] and round(project.geometry_bounds(visible.geom)[2]) == 10

"""D 回归及冻结投影试排。运行本文件 --samples 只写指定沙箱 D。"""

import argparse
import copy
import json
from pathlib import Path
from types import SimpleNamespace

import pytest
import drawing_common as dc
import drawing_layout as layout


def view(name, box, grid=None, *, dimension_bbox=None, at=None):
    return SimpleNamespace(
        name=name,
        box_geom=box,
        box_full=box,
        scale=1.0,
        grid=grid,
        dims=[],
        marks=dc.Marks(),
        dimension_bbox=dimension_bbox,
        paper_origin=None,
        spec={'at': at} if at is not None else {},
    )


def candidate(key, typ='front', *, parent=None, frame='part', part='1', **extra):
    result = dict(
        view_key=key,
        name=key,
        kind='basic',
        frame=frame,
        part=part,
        parts=[part],
        parent_key=parent,
        direction=[0, 1, 0],
        u=[1, 0, 0],
        v=[0, 0, 1],
        origin=[0, 0, 0],
        section=None,
        keep=None,
        hidden=False,
        spec=dict(type=typ, name=key),
        geometry_bbox=[0, 0, 50, 30],
    )
    result.update(extra)
    return result


def fake_context(candidates, dimensions, *, problem='08', size=(70, 45)):
    def measure(sheet, scale):
        return [
            view(
                v['name'],
                [0, 0, size[0] * v.get('scale', scale), size[1] * v.get('scale', scale)],
                None if v.get('free') else layout.BASIC_GRID.get(v['type']),
            )
            for v in sheet['views']
        ]

    heads = [dict(id='old', frame='part', part='1', title='测试', views=[], notes=[])]
    return dict(problem=problem, title='测试', head_sheets=heads, measure_sheet=measure)


def test_fixed_readability_and_a2_scaling():
    a, b = layout.drawing_style('A3'), layout.drawing_style('A2')
    assert (a['DIM_H'], a['FRAME_H'], a['LABEL_H'], a['thin_width'], a['thick_width']) == (8, 7, 9, 0.5, 1)
    for key in ('DIM_H', 'FRAME_H', 'LABEL_H', 'thin_width', 'thick_width', 'hatch_spacing'):
        assert b[key] == pytest.approx(a[key] * 1.4)
    assert (b['EXT_GAP'], b['EXT_OVER']) == (1.5, 2.5)  # 统一规范第二节的绝对纸面间隙。
    with pytest.raises(layout.LayoutError):
        layout.drawing_style('A1')


def test_first_angle_origins_remain_aligned_with_asymmetric_dimensions():
    a = view('主', [-20, -10, 50, 40], (0, 0))
    b = view('俯', [-5, -20, 50, 10], (1, 0))
    c = view('左', [-40, -5, 10, 40], (0, 1))
    free = view('剖', [0, 0, 40, 20])
    assert layout.arrange_views([a, b, c, free], [0, 0, 250, 180], [], style=layout.drawing_style('A3'))
    assert a.paper_origin[0] == b.paper_origin[0]
    assert a.paper_origin[1] == c.paper_origin[1]
    assert b.paper_origin[1] < a.paper_origin[1]
    assert c.paper_origin[0] > a.paper_origin[0]


def test_dimension_return_bbox_and_arrow_wings_cannot_hide_outside_frame():
    v = view('图', [0, 0, 20, 20], dimension_bbox=[0, 0, 500, 20])
    assert not layout.arrange_views([v], [0, 0, 200, 150], [], style=layout.drawing_style('A3'))
    assert v.paper_origin is None
    v.dimension_bbox = None
    v.marks.arrow([0, 0], [1, 0], size=30)
    assert layout._extent(v)[1] <= -12


def test_explicit_position_and_reservations_are_enforced_atomically():
    v = view('图', [0, 0, 30, 30], at=[10, 10])
    assert not layout.arrange_views([v], [0, 0, 200, 100], [], style=layout.drawing_style('A3'))
    assert v.paper_origin is None
    v.spec['at'] = [50, 50]
    assert not layout.arrange_views(
        [v], [0, 0, 200, 100], [[30, 30, 70, 70]], style=layout.drawing_style('A3')
    )


def test_no_dimension_count_pagination_and_no_input_mutation():
    c = candidate('v1')
    top = candidate('top', 'top', direction=[0, 0, -1])
    ctx = fake_context([c, top], [])
    d = [
        dict(
            _id=f'D{i}',
            view_key='v1',
            value=i,
            source_feature=i,
            category='test',
            covers_features=[i],
            _witness_3d={'point': [i, 0, 0]},
        )
        for i in range(1, 39)
    ]
    before = copy.deepcopy(([c, top], d))
    sheets = layout.plan_sheets([c, top], d, context=ctx)
    assert len(sheets) == 1  # 数量本身不是切页条件；真实尺寸框由 measure 返回。
    assert sheets[0]['scale'] in layout.STANDARD_SCALES
    assert sheets[0]['paper'] == 'A3'
    assert sheets[0]['dimensions'] == [dict(x, view='v1') for x in d]
    assert ([c, top], d) == before


def test_oversize_dimension_group_requires_new_upstream_witness():
    cs = [candidate('front'), candidate('top', 'top', direction=[0, 0, -1])]
    ctx = fake_context(cs, [])
    ctx['parts'] = ['1']
    ds = [dict(_id=f'D{i}', view_key='front', value=i) for i in range(26)]
    with pytest.raises(layout.LayoutError, match='超过单页25项'):
        layout.plan_sheets(cs, ds, context=ctx)


def test_identical_projection_repeated_on_head_pages_is_emitted_once():
    a, b = candidate('old:v1'), candidate('old2:v1')
    top = candidate('top', 'top', direction=[0, 0, -1])
    d = [dict(_id='D1', value=5, view_key=a['view_key']), dict(_id='D2', value=6, view_key=b['view_key'])]
    sheets = layout.plan_sheets([a, b, top], d, context=fake_context([a, b, top], d))
    assert len(sheets) == 1
    assert len(sheets[0]['views']) == 2
    assert [d['_id'] for d in sheets[0]['dimensions']] == ['D1', 'D2']


def test_alias_merge_rebinds_c_witness_key_without_changing_points():
    a, b = candidate('a'), candidate('alias')
    top = candidate('top', 'top', direction=[0, 0, -1])
    proof = dict(view_key='alias', points=[[1, 2], [4, 2]], elements=[{'kind': 'axis'}])
    d = dict(
        _id='D1', view_key='alias', value=3, _dimension_witness=proof, _witness_3d={'original': [1, 2, 3]}
    )
    ctx = fake_context([a, b, top], [d])
    measure = ctx['measure_sheet']

    def c_guard(sheet, scale):
        for dim in sheet['dimensions']:
            assert dim['_dimension_witness']['view_key'] == dim['view_key']
        return measure(sheet, scale)

    ctx['measure_sheet'] = c_guard
    output = layout.plan_sheets([a, b, top], [d], context=ctx)[0]['dimensions'][0]
    assert output['_dimension_witness'] == dict(proof, view_key='a')
    assert d['_dimension_witness']['view_key'] == 'alias'
    assert output['_witness_3d'] == d['_witness_3d']


def test_only_explicit_unused_alternatives_can_be_omitted():
    root = candidate('root')
    top = candidate('top', 'top', direction=[0, 0, -1])
    cut = candidate('alternative', section={'point': [0, 3, 0]}, layout_optional=True)
    cut['spec']['free'] = True
    cs = [root, top, cut]
    sheets = layout.plan_sheets(cs, [], context=fake_context(cs, []))
    assert {v['view_key'] for s in sheets for v in s['views']} == {'root', 'top'}
    d = dict(_id='D1', view_key='alternative', value=3)
    sheets = layout.plan_sheets(cs, [d], context=fake_context(cs, [d]))
    assert [x['_id'] for s in sheets for x in s['dimensions']] == ['D1']
    assert 'alternative' in {v['view_key'] for s in sheets for v in s['views']}


def test_optional_direction_source_is_kept_without_adding_hidden_crop_parent():
    root = candidate('source', role='overview', layout_optional=True)
    middle = candidate(
        'orient',
        kind='auxiliary',
        role='detail',
        source_key='source',
        layout_optional=True,
        direction=[1, 0, 0],
    )
    middle['spec'].update(type='auxiliary', free=True, label='A')
    crop = candidate('crop', layout_optional=True, direction=[0, 0, 1])
    used = candidate(
        'end',
        kind='auxiliary',
        role='detail',
        source_key='orient',
        parent='crop',
        layout_optional=True,
        direction=[1, 1, 0],
    )
    used['spec'].update(type='auxiliary', free=True, label='B')
    cs = [root, middle, crop, used]
    ds = [dict(_id='D1', view_key='end', value=9)]
    sheets = layout.plan_sheets(cs, ds, context=fake_context(cs, ds))
    assert {v['view_key'] for s in sheets for v in s['views']} == {'source', 'orient', 'end'}
    assert [d['value'] for s in sheets for d in s['dimensions']] == [9]


def test_full_cut_uses_real_piercing_plane_when_cropped_locator_only_has_break_lines():
    root = candidate('root', role='overview')
    end = candidate(
        'empty',
        kind='auxiliary',
        role='detail',
        layout_optional=True,
        source_key='root',
        keep={'shape': 'circle', 'center': [25, 15], 'r': 4},
    )
    cut = candidate(
        'cut',
        kind='auxiliary',
        role='detail',
        source_key='empty',
        parent='empty',
        direction=[1, 0, 0],
        section={'point': [25, 0, 15], 'mode': 'full'},
    )
    cut['spec'].update(type='auxiliary', free=True, label='A', section=dict(cut['section'], label='A'))
    cs = [root, end, cut]
    ctx = fake_context(cs, [])
    outline = [[0, 0], [50, 0], [50, 30], [0, 30], [0, 0]]
    ctx['project_candidate'] = lambda c, scale: dict(
        lines=[dc.g2.polyline(outline, 'wave' if c['view_key'] == 'empty' else 'visible')], hatches=[]
    )
    sheets = layout.plan_sheets(cs, [], context=ctx)
    assert {v['view_key'] for s in sheets for v in s['views']} == {'root', 'cut'}
    spec = next(v for s in sheets for v in s['views'] if v['view_key'] == 'cut')
    assert spec['source_key'] == 'root' and spec['parent_key'] == 'empty'
    assert cut['source_key'] == 'empty'
    assert ctx['layout_report']['section_source_changes'] == [dict(section='cut', old='empty', new='root')]


def test_small_parts_keep_their_own_labels_and_projection_grids():
    cs = [candidate(f'part{n}', part=n) for n in ('1', '2')]
    ctx = fake_context(cs, [])
    ctx['head_sheets'] = [
        dict(id='old' + n, frame='part', part=n, title='零件' + n, views=[], notes=[]) for n in ('1', '2')
    ]

    def measure(sheet, scale):
        out = []
        for spec in sheet['views']:
            v = view(spec['name'], [0, 0, 40 * scale, 20 * scale], layout.BASIC_GRID[spec['type']])
            v.spec = spec
            v.candidate = spec['_candidate']
            out.append(v)
        return out

    ctx['measure_sheet'] = measure
    sheets = layout.plan_sheets(cs, [], context=ctx)
    assert len(sheets) == 1
    assert sheets[0]['parts'] == ['1', '2']
    assert [v['name'] for v in sheets[0]['views']] == ['件1 part1', '件2 part2']


def test_continuation_uses_hidden_dependencies_and_resolved_source_and_target_pages():
    root = candidate('root')
    cuts = []
    for i in range(5):
        c = candidate(
            f'cut{i}',
            parent='root',
            section={'point': [0, i, 0], 'mode': 'full'},
            source_key='root',
            layout_group=f'feature{i}',
            role='detail',
        )
        c['spec'].update(free=True, section={'label': chr(65 + i), 'point': [0, i, 0], 'parent': 'root'})
        cuts.append(c)
    ctx = fake_context([root] + cuts, [], size=(45, 25))
    sheets = layout.plan_sheets([root] + cuts, [], context=ctx)
    assert len(sheets) == 2
    locator = [v for v in sheets[1]['views'] if v['_candidate'].get('role') == 'locator']
    assert not locator
    assert len(sheets[1]['views']) <= 4
    assert all(v['_source_reference']['sheet_index'] == 1 for v in sheets[1]['views'])
    source = sheets[0]['views'][0]
    assert {x['target_sheet'] for x in source['section_references']} == {1, 2}
    for sheet in sheets:
        for spec in sheet['views']:
            if spec.get('section'):
                assert spec['section']['source_sheet'] == 1


def test_cross_page_auxiliary_arrows_are_collected_on_real_source():
    root = candidate('root')
    aux = []
    for i in range(5):
        c = candidate(
            f'aux{i}',
            kind='auxiliary',
            parent='root',
            source_key='root',
            layout_group=f'interface{i}',
            role='detail',
            direction=[i + 1, 1, 1],
        )
        c['spec'].update(type='auxiliary', free=True, label=chr(65 + i), arrow_at=[i, 0])
        aux.append(c)
    ctx = fake_context([root] + aux, [], size=(45, 25))
    ctx['layout_capabilities'] = {'source_references': True}
    sheets = layout.plan_sheets([root] + aux, [], context=ctx)
    references = sheets[0]['views'][0]['auxiliary_references']
    assert {r['target_sheet'] for r in references} == {2}
    assert len(references) == 2
    assert not ctx['layout_report']['pending_source_references']
    assert all(v.get('parent') is None for v in sheets[1]['views'])


def test_unfit_content_is_not_silently_scaled_or_clipped():
    c = candidate('v1')
    ctx = fake_context([c], [])
    ctx['measure_sheet'] = lambda sheet, scale: [view('拥挤尺寸', [0, 0, 900, 900])]
    with pytest.raises(layout.LayoutError, match='固定字高'):
        layout.plan_sheets([c], [], context=ctx)
    assert ctx['layout_report']['failures']


def test_detail_uses_its_own_standard_scale_to_keep_250px_width():
    root = candidate('root')
    detail = candidate(
        'end',
        parent='root',
        keep={'shape': 'circle', 'center': [15, 15], 'r': 15},
        geometry_bbox=[0, 0, 30, 30],
        role='detail',
    )
    detail['spec']['free'] = True
    ctx = fake_context([root, detail], [], size=(50, 30))
    sheets = layout.plan_sheets([root, detail], [], context=ctx)
    for sheet in sheets:
        for spec in sheet['views']:
            if spec['view_key'] == 'end':
                scale = spec.get('scale', sheet['scale'])
                assert scale in layout.STANDARD_SCALES
                assert 30 * scale / dc.PAPERS[sheet['paper']][0] * 1300 >= 250


def test_tiny_complex_overview_is_rejected_even_if_annotation_box_fits():
    c = candidate('body', role='overview')
    ctx = fake_context([c], [])
    ctx['parts'] = [{'name': '1'}]

    def measure(sheet, scale):
        v = view('主体', [0, 0, 100, 60])
        v.candidate = c
        return [v]

    ctx['measure_sheet'] = measure
    with pytest.raises(layout.LayoutError):
        layout.plan_sheets([c], [], context=ctx)


def test_frame_notes_and_parts_are_measured_not_blanket_reserved():
    info = dict(title='检验标题', drawing_no='JX-08', scale=0.5, material='HT250', quantity=1)
    marks, box, reserved = layout.sheet_frame('A3', info, 2, 12, [], [])
    assert len(reserved) == 1
    assert box[3] > 270
    _, notes_box, notes_reserved = layout.sheet_frame('A3', info, 2, 12, [], ['说明文字'] * 3)
    assert notes_box[3] < box[3]
    assert len(notes_reserved) == 2
    texts = [m for m in marks.items if m['kind'] == 'text']
    for i, a in enumerate(texts):
        ba = dc.text_box(a['text'], a['at'], a['height'], a['anchor'])
        assert layout._contains([25, 5, 415, 292], ba)
        for b in texts[i + 1 :]:
            assert not dc.box_overlap(ba, dc.text_box(b['text'], b['at'], b['height'], b['anchor']))


def test_two_nonadjacent_sparse_groups_can_share_one_sheet():
    cs = []
    for i in range(8):
        c = candidate(str(i), kind='auxiliary', role='detail', direction=[i, 1, 0])
        c['spec'].update(type='auxiliary', free=True)
        cs.append(c)
    ctx = fake_context(cs, [])
    compatible = [set('0145'), set('2367')]

    def measure(sheet, scale):
        keys = {v['view_key'] for v in sheet['views']}
        if not any(keys <= group for group in compatible):
            return []
        return [view(v['name'], [0, 0, 30 * scale, 20 * scale]) for v in sheet['views']]

    ctx['measure_sheet'] = measure
    sheets = layout.plan_sheets(cs, [], context=ctx)
    assert [{v['view_key'] for v in s['views']} for s in sheets] == compatible


def test_finalized_paper_repositions_displaced_text_together_with_its_view():
    box = dc.g2.polyline([[0, 0], [30, 0], [30, 15], [0, 15], [0, 0]], 'visible')

    def entry(name, x):
        return dict(
            name=name,
            lines=[box],
            hatches=[],
            role='detail',
            position=None,
            placement=dict(scale=1.0, paper_origin=[x, 80]),
            definition=dict(parts=['1']),
            annotations=[dict(kind='text', text=name, at=[50, 15], height=9, anchor='mb', angle=0)],
            dimensions=[],
        )

    doc = dict(
        paper=dict(size='A3'),
        title_block=dict(title='终稿', drawing_no='JX'),
        scale='1:1',
        sheet_index=1,
        sheet_count=1,
        parts_list=[],
        notes=[],
        views=[entry('A', 50), entry('B', 80)],
    )
    before = copy.deepcopy(doc)
    assert layout.arrange_finalized_page(doc)
    assert [v['placement']['paper_origin'] for v in before['views']] != [
        v['placement']['paper_origin'] for v in doc['views']
    ]
    assert [v['annotations'] for v in before['views']] == [v['annotations'] for v in doc['views']]
    stable = copy.deepcopy(doc)
    assert layout.arrange_finalized_page(doc) and doc == stable


def test_whole_page_1300_ink_readability():
    # 真实渲染、整页缩小后测墨迹；不是仅检验名义字号。
    import numpy as np
    from PIL import Image

    for paper in ('A3', 'A2'):
        style = layout.drawing_style(paper)
        w, h = dc.PAPERS[paper][:2]
        canvas = dc.render.Canvas(w, h, 240)
        f = 1.4 if paper == 'A2' else 1.0
        for i, text in enumerate('0123456789'):
            canvas.text(text, (30 * f + i * 18 * f, 90 * f), style['DIM_H'], 'lb')
        canvas.text('中文说明', (30 * f, 50 * f), style['FRAME_H'], 'lb')
        canvas.polyline([[30 * f, 20 * f], [130 * f, 20 * f]], style['thin_width'])
        img = canvas.image().resize((1300, round(h / w * 1300)), Image.Resampling.LANCZOS)
        arr = np.array(img)
        k = 1300 / w
        for i in range(10):
            x = (30 + i * 18) * f * k
            y = (h - 90 * f) * k
            crop = arr[round(y - 12 * f * k) : round(y + 2 * f * k), round(x - 1) : round(x + 10 * f * k)]
            rows = (crop < 128).any(axis=1)
            assert rows.sum() >= 16, (paper, i, rows.sum())
        y = (h - 50 * f) * k
        crop = arr[round(y - 11 * f * k) : round(y + 2 * f * k), round(30 * f * k) : round(70 * f * k)]
        assert (crop < 128).any(axis=1).sum() >= 20
        x, y = round(70 * f * k), round((h - 20 * f) * k)
        # 抗锯齿后的等效黑线宽，而非非白像素外缘。
        thickness = (255 - arr[y - 5 : y + 6, x].astype(float)).sum() / 255
        assert thickness >= 1.5, (paper, thickness)


def _frozen_runner(samples, output, problems=('08', '13', '19', '21', '25')):
    """冻结几何/尺寸图元移植到新字高；隔离正在开发的 A/B/C。

    没有重新建模。原尺寸数值/语义不变。排不下的页仅输出诊断，绝不冒充合格图纸。
    """
    import contextlib
    import make_drawing as md
    from PIL import Image

    output = Path(output).resolve()
    expected = Path(__file__).resolve().parents[5] / '调研' / '机械图纸重画' / '沙箱' / 'D'
    if not output.is_relative_to(expected.resolve()):
        raise ValueError('冻结试排只允许输出到沙箱 D')
    output.mkdir(parents=True, exist_ok=True)
    summary = []
    for no in problems:
        sample = json.loads((Path(samples) / f'{no}.json').read_text(encoding='utf-8'))
        projections = sample['projections']
        frozen_by_id = {d['_id']: d for d in sample['dimensions']}
        old_project, old_shapes = md.project_all, md.sheet_shapes
        old_dims, old_sections = md.drawing_dimensions, md.drawing_sections

        def frozen_project(views, shapes, scale):
            for v in views:
                v.scale = float(v.spec.get('scale', scale))
                v.geom = copy.deepcopy(projections[v.candidate['projection_key']])
                if v.kind == 'detail':
                    v.vdef['parent_definition'] = next(x.vdef for x in views if x.name == v.parent)

        def frozen_dims(v, dimensions, *, style, legacy):
            # 不在 D 测试中重做 C 的标注搜索；直接使用冻结的实际图元和原值。
            results, bounds = [], None
            for d in dimensions:
                frozen = frozen_by_id[d['_id']]['head_layout']
                marks = dc.Marks()
                marks.items = copy.deepcopy(frozen['draw'])
                for m in marks.items:
                    if m['kind'] == 'curve':
                        m['curve'] = dc.g2.xform(m['curve'], v.scale, (0, 0))
                    for key in ('at', 'tip'):
                        if key in m:
                            m[key] = [p * v.scale for p in m[key]]
                    if m['kind'] == 'text':
                        m['height'] = style['DIM_H']
                    if m['kind'] == 'arrow':
                        m['size'] = style['ARROW']
                marks.box = dc.marks_bounds(marks.items, 1.0)
                bounds = dc.box_union(bounds, marks.box)
                record = {
                    k: copy.deepcopy(value)
                    for k, value in d.items()
                    if k not in ('head_layout', 'view_key')
                }
                record.update(id=d['_id'], text=frozen['text'], marks=marks)
                results.append(record)
            return dict(dimensions=results, bbox=bounds, unresolved=[])

        md.project_all = frozen_project
        md.sheet_shapes = lambda mdl, sheet: ({}, [sheet.get('part', '1')])
        md.drawing_dimensions = SimpleNamespace(layout_dimensions=frozen_dims)
        md.drawing_sections = SimpleNamespace(section_marks=lambda *a, legacy, **kw: legacy())
        ctx = dict(sample, layout_diagnostic=True)
        folder = output / no
        folder.mkdir(exist_ok=True)
        try:

            def measure(sheet, scale):
                md._apply_drawing_style(sheet['paper'])
                views = md.compose(sheet, None, scale, 1, 1, no, sample['title'])
                for v in views:
                    texts = [(d['id'], m) for d in v.dims for m in d['marks'].items if m['kind'] == 'text']
                    texts += [('annotation', m) for m in v.marks.items if m['kind'] == 'text']
                    boxes = [
                        (
                            key,
                            dc.text_box(
                                m['text'], m['at'], m['height'], m.get('anchor', 'mm'), m.get('angle', 0)
                            ),
                        )
                        for key, m in texts
                    ]
                    v.layout_conflicts = [
                        (a[0], b[0])
                        for j, a in enumerate(boxes)
                        for b in boxes[j + 1 :]
                        if dc.box_overlap(a[1], b[1], -0.5)
                    ]
                return views

            ctx['measure_sheet'] = measure
            with (
                (folder / 'diagnostic.log').open('w', encoding='utf-8') as log,
                contextlib.redirect_stdout(log),
            ):
                sheets = layout.plan_sheets(sample['candidates'], sample['dimensions'], context=ctx)
                for i, sheet in enumerate(sheets, 1):
                    if not sheet['_layout']['fits']:
                        continue
                    runtime = measure(sheet, sheet['scale'])
                    _, box, reserved = layout.sheet_frame(
                        sheet['paper'],
                        dict(title=sheet['title'], drawing_no=sheet['drawing_no'], scale=sheet['scale']),
                        i,
                        len(sheets),
                        sheet.get('parts_list', []),
                        sheet.get('notes', []),
                    )
                    if not layout.arrange_views(
                        runtime, box, reserved, style=layout.drawing_style(sheet['paper'])
                    ):
                        sheet['_layout']['fits'] = False
                        sheet['_layout']['reason'] = '最终跨页引用加入后排不下'
                        continue
                    # make_sheet 再次使用相同冻结投影和标注；所有输出留在沙箱。
                    mdl = SimpleNamespace(
                        parts=[SimpleNamespace(name=str(j + 1)) for j in range(len(sample['parts']))]
                    )
                    private = md.make_sheet(sheet, mdl, no, sample['title'], i, len(sheets), 240)
                    path = folder / f'{no}-{i}.png'
                    with dc.render_style(layout.drawing_style(sheet['paper'])):
                        dc.render.render_sheet(private).image().save(path, dpi=(240, 240))
                    (folder / f'{no}-{i}.json').write_text(
                        json.dumps(private, ensure_ascii=False), encoding='utf-8'
                    )
                    img = Image.open(path)
                    for edge in (1300, 2300):
                        sub = folder / str(edge)
                        sub.mkdir(exist_ok=True)
                        img.resize(
                            (edge, round(img.height / img.width * edge)), Image.Resampling.LANCZOS
                        ).save(sub / path.name)
                report = ctx['layout_report']
                report['rendered_count'] = sum(s['_layout']['fits'] for s in sheets)
                report['complete'] = report['rendered_count'] == len(sheets)
                report['mode'] = '冻结几何/尺寸图元移植为固定字高；尚未接 A/B/C 新内容；互盖页拒绝出图'
                (folder / 'plan.json').write_text(
                    json.dumps(sheets, ensure_ascii=False, indent=2), encoding='utf-8'
                )
                (folder / 'report.json').write_text(
                    json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8'
                )
                summary.append(dict(problem=no, **report))
            print(
                f"{no}: HEAD {len(sample['head_sheets'])} -> 计划 {len(sheets)}, 可排 {report['rendered_count']}",
                flush=True,
            )
        finally:
            md.project_all, md.sheet_shapes = old_project, old_shapes
            md.drawing_dimensions, md.drawing_sections = old_dims, old_sections
    (output / 'comparison.json').write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8'
    )
    lines = [
        '# D 冻结试排张数对照',
        '',
        '本表为诊断计划；未排下页不出图，不能作为整题验收通过。',
        '',
        '| 题号 | HEAD | 新计划 | 成功出图 | 整题排下 |',
        '|---|---:|---:|---:|---|',
    ]
    lines += [
        f"| {s['problem']} | {s['head_count']} | {s['new_count']} | {s['rendered_count']} | {'是' if s['complete'] else '否'} |"
        for s in summary
    ]
    lines += ['', '仅使用冻结投影；未重新建模或修改尺寸值。1300 与 2300 为整页等比缩图。']
    for s in summary:
        for reason in s['reasons']:
            lines += [
                f"- {s['problem']} {reason['group']}：{reason['count']} 张超预算 {reason['budget']}，{reason['reason']}。"
            ]
        for failure in s['failures']:
            lines += [f"- {s['problem']} {failure['views']}：{failure['reason']}。"]
    (output / '张数对照.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')


def _real_previews(inputs, destination):
    """在 D 沙箱复用 A/B 投影、C 真实试排图元；输入缺口逐项记录在页外报告中。"""
    from unittest.mock import patch
    from PIL import Image
    import drawing_dimensions as dd
    import make_drawing as md

    inputs, destination = Path(inputs), Path(destination).resolve()
    allowed = Path(__file__).resolve().parents[5] / '调研/机械图纸重画/沙箱/D'
    if not destination.is_relative_to(allowed.resolve()):
        raise ValueError('试排必须位于沙箱 D')
    no = inputs.name
    destination.mkdir(parents=True, exist_ok=True)

    def read(key):
        return json.loads((inputs / (key + '.json')).read_text('utf-8'))

    def save(key, data):
        (destination / (key + '.json')).write_text(
            json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8'
        )

    if (inputs / 'inputs.json').is_file():
        bundle = read('inputs')
        candidates = bundle['candidates']
        keys = read('projections')
        projections = {name: json.loads((inputs / name).read_text('utf-8')) for name in set(keys.values())}
        # C 出口只带原图号；标题、明细和标记取对应 HEAD 冻结规格。
        frozen = json.loads((allowed.parent / '样例' / (no + '.json')).read_text('utf-8'))
        heads = frozen['head_sheets']
        for head in heads:
            head['dimensions'] = [d for d in bundle['dimensions'] if d['_head_sheet'] == head['id']]
    else:
        candidates, heads, projections, keys = map(read, ('candidates', 'head', 'projections', 'keys'))
    assignments, unassigned = read('assignments'), read('unresolved')
    exported = (
        {(t['view_key'], t['scale']): t for t in read('layout-trials')}
        if (inputs / 'layout-trials.json').exists()
        else {}
    )
    catalog = {d['_id']: d for h in heads for d in h['dimensions']}
    partial = True  # 尺寸摆放诊断图在逐项复核前始终带试排标记。
    for c in candidates:
        geom = projections[keys[c['view_key']]]
        c['geometry_bbox'] = md.project.geometry_bounds(geom)
        # 空组由 D 统一判定；拒绝对 C 的历史快照擅自指定备选。
    style_cache, native_dims = {}, dd.layout_dimensions
    reused = set()

    def dimensions(view, ds, *, style, legacy=None):
        cache_key = (
            view.view_key,
            view.scale,
            style['DIM_H'],
            tuple(d['_id'] for d in ds),
            tuple((m['text'], tuple(m['at'])) for m in view.marks.items if m['kind'] == 'text'),
        )
        if cache_key in style_cache:
            return style_cache[cache_key]
        trial = exported.get((view.view_key, view.scale)) if style['DIM_H'] == 8 else None
        wanted = {d['_id'] for d in ds}
        if trial and wanted == {d['id'] for d in trial['dimensions']} | {
            d['id'] for d in trial['unresolved']
        }:
            # C 出口给的是视图坐标；转换为纸面坐标后与最终来源文字核对。
            # 若交叠，回到 C 的同一摆放入口，以实际纸面标记为障碍重新计算。
            records = []
            occupied = [
                dc.text_box(m['text'], m['at'], m['height'], m.get('anchor', 'mm'), m.get('angle', 0))
                for m in view.marks.items
                if m['kind'] == 'text'
            ]
            conflict = False
            for d in trial['dimensions']:
                marks = dc.Marks()
                for m in copy.deepcopy(d['draw']):
                    if m['kind'] == 'curve':
                        m['curve'] = dc.g2.xform(m['curve'], view.scale, (0, 0))
                    for k in ('tip', 'at'):
                        if k in m:
                            m[k] = [p * view.scale for p in m[k]]
                    if m['kind'] == 'text':
                        tb = dc.text_box(
                            m['text'], m['at'], m['height'], m.get('anchor', 'mm'), m.get('angle', 0)
                        )
                        conflict |= any(dc.box_overlap(tb, b) for b in occupied)
                    marks.items.append(m)
                marks.box = dc.marks_bounds(marks.items, 1.0)
                records.append(
                    dict(id=d['id'], text=d['text'], type=d['type'], value=d['value'], marks=marks)
                )
            if not conflict:
                reused.add((view.view_key, view.scale))
                result = dict(dimensions=records, bbox=trial['bbox'], unresolved=trial['unresolved'])
            else:
                result = native_dims(view, ds, style=style)
        else:
            result = (
                native_dims(view, ds, style=style) if ds else dict(dimensions=[], bbox=None, unresolved=[])
            )
        style_cache[cache_key] = result
        return result

    def input_projection(views, shapes, scale):
        for v in views:
            v.scale = float(v.spec.get('scale', scale))
            v.geom = projections[keys[v.view_key]]
            if v.kind == 'detail':
                v.vdef['parent_definition'] = md.parent_view(views, v).vdef

    # 正式 compose 对未解决尺寸抛错。诊断图只放 C 实际返回的图元，逐图记录失败编号，
    # 并在图题中清楚标明试排。正式 plan_sheets 的接口仍要求 C 的完整尺寸列表。
    def diagnostic_dims(v, ds, *, style, legacy):
        result = dimensions(v, ds, style=style)
        v.layout_unresolved = result['unresolved']
        return dict(result, unresolved=[])

    # 一幅图的真实纸面范围可复用于多个候选组合；来源标记、图名、比例、
    # 明细序号或尺寸一旦不同便重新走 compose。最终页始终按原入口重测。
    extent_cache = {}

    def measure(sheet, scale):
        md._apply_drawing_style(sheet['paper'])
        complete = dc.complete_projection_dependencies(sheet, candidates)
        if sheet.get('id') != '试排':
            return md.compose(complete, None, scale, 1, 1, no, '')
        stamps = []
        for v in sheet['views']:
            key, name = v['view_key'], v['name']
            marks = [
                m
                for field in ('balloons', 'section_traces', 'centerlines', 'phantom')
                for m in sheet.get(field, [])
                if name in (m.get('view'), m.get('parent')) or key == m.get('parent_key')
            ]
            children = [
                (c['view_key'], c.get('label'), c.get('section'), c.get('arrow_at'), c.get('name'))
                for c in sheet['views']
                if (c.get('source_key') or c.get('parent_key')) == key
            ]
            fields = {k: x for k, x in v.items() if k not in ('_candidate', '_definition')}
            stamps.append(
                json.dumps(
                    (
                        sheet['paper'],
                        v.get('scale', scale),
                        fields,
                        marks,
                        children,
                        [d['_id'] for d in sheet['dimensions'] if d['view_key'] == key],
                    ),
                    sort_keys=True,
                )
            )
        if not all(stamp in extent_cache for stamp in stamps):
            actual = md.compose(complete, None, scale, 1, 1, no, '')
            for stamp, v in zip(stamps, actual):
                extent_cache[stamp] = SimpleNamespace(
                    name=v.name,
                    scale=v.scale,
                    spec=v.spec,
                    candidate=v.candidate,
                    grid=v.grid,
                    box_geom=v.box_geom,
                    box_full=layout._extent(v),
                    marks=dc.Marks(),
                    dims=[],
                    layout_unresolved=getattr(v, 'layout_unresolved', ()),
                )
        return [copy.copy(extent_cache[stamp]) for stamp in stamps]

    def project(c, scale=1.0):
        return projections[keys[c['view_key']]]

    ctx = dict(
        problem=no,
        title=heads[0]['title'],
        head_sheets=heads,
        parts=list({p for c in candidates for p in c['parts']}),
        layout_diagnostic=True,
        optimize_witnesses=True,
        project_candidate=project,
        measure_sheet=measure,
    )
    if partial:
        heads = copy.deepcopy(heads)
        for h in heads:
            h['title'] = h['title'] + ' · 尺寸试排'
        ctx['head_sheets'] = heads
    parts = sorted(ctx['parts'], key=lambda x: int(x))
    mdl = SimpleNamespace(parts=[SimpleNamespace(name=n) for n in parts])
    with (
        patch.object(md, 'project_all', input_projection),
        patch.object(md, 'sheet_shapes', lambda mdl, s: ({}, s.get('parts') or parts)),
        patch.object(dd, 'layout_dimensions', diagnostic_dims),
    ):
        pages = layout.plan_sheets(candidates, assignments, context=ctx)
        all_drawn, published, page_audit = {}, 0, []
        for i, s in enumerate(pages, 1):
            missing = []
            if s['_layout']['fits']:
                full = dc.complete_projection_dependencies(s, candidates)
                runtime = measure(full, s['scale'])
                missing = [r for v in runtime for r in getattr(v, 'layout_unresolved', ())]
                try:
                    doc = md.make_sheet(full, mdl, no, s['title'], i, len(pages), 240, finalize=True)
                except (md.SpecError, layout.LayoutError) as err:
                    s['_layout'].update(fits=False, reason=str(err))
                    page_audit.append(
                        dict(
                            sheet=s['id'],
                            views=[v['view_key'] for v in s['views']],
                            paper=s['paper'],
                            scale=s['scale'],
                            assigned=[d['_id'] for d in s['dimensions']],
                            layout=s['_layout'],
                            unresolved=missing,
                        )
                    )
                    continue
                path = destination / (s['id'] + '.png')
                with dc.render_style(layout.drawing_style(s['paper'])):
                    im = dc.render.render_sheet(doc).image()
                im.save(path, dpi=(240, 240))
                for edge in (1300, 2300):
                    folder = destination / str(edge)
                    folder.mkdir(exist_ok=True)
                    im.resize((edge, round(im.height / im.width * edge)), Image.Resampling.LANCZOS).save(
                        folder / path.name
                    )
                save(s['id'], doc)
                for v in doc['views']:
                    for d in v['dimensions']:
                        assert d['id'] not in all_drawn and catalog[d['id']]['value'] == d['value']
                        all_drawn[d['id']] = s['id']
                published += 1
            page_audit.append(
                dict(
                    sheet=s['id'],
                    views=[v['view_key'] for v in s['views']],
                    paper=s['paper'],
                    scale=s['scale'],
                    assigned=[d['_id'] for d in s['dimensions']],
                    layout=s['_layout'],
                    unresolved=missing,
                )
            )
        summary = dict(
            problem=no,
            head=len(heads),
            plan=len(pages),
            rendered=published,
            total_dimensions=len(catalog),
            assigned=len(assignments),
            drawn=len(all_drawn),
            complete=published == len(pages) and len(all_drawn) == len(catalog),
            C_trial_pairs_reused=sorted(reused),
            pages=page_audit,
            unassigned=unassigned,
            unprinted_ids=sorted(set(catalog) - set(all_drawn), key=lambda x: int(x[1:])),
            **ctx['layout_report'],
        )
        save('report', summary)
        print(
            no,
            'HEAD',
            len(heads),
            'plan',
            len(pages),
            'rendered',
            published,
            'drawn',
            len(all_drawn),
            '/',
            len(catalog),
            flush=True,
        )


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--samples')
    parser.add_argument('--out', required=True)
    parser.add_argument('--problems', nargs='+', default=['08', '13', '19', '21', '25'])
    parser.add_argument('--current-input')
    args = parser.parse_args()
    if args.current_input:
        _real_previews(args.current_input, args.out)
    else:
        _frozen_runner(args.samples, args.out, args.problems)

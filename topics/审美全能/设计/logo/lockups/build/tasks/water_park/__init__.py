"""07 晴空水上乐园 · 题名锁定模块。

  概念单     CONCEPT（下面）
  笔画标注   strokes.py
  笔画处理   letters.py（方言「马赛克宋」：按笔画把字重新铺在同一张方格上；高潮「晴」的日是金砖太阳；呼应：点是水滴）
  主体元素   emblem.py（LIDO 的 O 是一只砖拼的救生圈）
  英文       english.py（砖拼的 LID、一笔手写 greetings from、底线带）
  颜色层     layers.py（砖的釉面、墙、水、太阳的光晕都在这里画）；图层表 LAYERS 和入场在本文件
出图：python topics/审美全能/设计/logo/lockups/build/lockup.py water-park
"""
import math
from lockupkit.geom import union, rect
from lockupkit.run import Layer
from lockupkit import small as SM
from . import letters as LT, english as EN, emblem as EM, layers as LY
from .strokes import STROKES  # noqa: F401  （--strokes 用）

KEY = 'water-park'
TEXT = LT.TEXT
FONT = LT.FONT
P = LT.P

CONCEPT = {
    '题名': '晴空水上乐园', '类别': '体素建模',
    '一句话概念': '正午泳场的一面马赛克墙：字是一块块釉面砖拼出来的，「晴」的日是一轮金砖太阳，水线以下的字在水里晃。体素和马赛克都是“一格一格”。',
    '气质词': ['明快', '清凉', '一格一格'], '物件': '泳池的釉面马赛克砖（和砖拼的救生圈）', '动作': '一块块铺上去；水线下错开',
    '同源媒介': '老式露天泳场（Lido）池壁上的砖拼字和水深标记：方砖、白灰浆、釉面的光',
    '方言': '马赛克宋：全部笔画对齐到同一张方格，一格一块砖；横一块砖高、竖两到三列；撇捺点钩收成边挨边的整齐台阶，收尾收到一块砖；'
            '宋体的横末三角（和横折转角的三角）铺成三块砖的阶梯，挨着别的笔画时收成两块；竖的起笔左上多一块、收笔右下少一块；'
            '砖是微微凸起的釉面砖（体素），砖缝是晒白的灰浆',
    '骨架': '「晴」的日放宽到有太阳的体量（三列竖、三列字腔），青相应收窄；晴的横对齐到同几行（日的上横、中横和龶的上横、下横同一行）；'
            '字距两列砖；第一段「晴空」、第二段「水上乐园」错开，第二段从「晴」的右边起；所有字的基线落在砖缝上',
    '母题落点': {'高潮': '「晴」的日：日就是太阳的象形，铺成金砖（中间浅金、往外橙、外缘珊瑚），四周的墙砖一圈圈、一道道染暖，星芒在日上',
               '呼应': '所有长着水滴样子的点（空的宀点、八的点，乐的点）铺成池水的玻璃砖水滴；水线以下的砖整行错开半块、一行行晃（折射），覆盖水上乐园四个字'},
    '主体元素': 'LIDO 的 O 是一只砖拼的救生圈：砖顺着圆排三圈，八段珊瑚和白相间，深青的绳在四处缠住、之间往外垂；当英文末字母，比 LID 高出一截顶出剪影',
    '英文分工': 'LIDO 砖拼、退后一层的浅池青，接在第一段右边（O 是救生圈）；greetings from 一笔深青手写斜压在 LID 头上；'
              '底线带 A SUMMER LAID / TILE BY TILE 小型大写两行叠在「晴」下面的空当里，水线是它的细线',
    '颜色角色': {'字面': '深青墨的釉面砖，水线以下浅一档的池青', '主题色': '池水青（水、LIDO、水滴）和晒白的石（墙砖、灰浆）',
               '阴影': '池水青的暗调', '点缀': '金和珊瑚：日为主（金→橙→珊瑚），向四周的墙砖里一块块散开；救生圈的珊瑚为呼应；手写不用橙',
               '共用金属': '日上的浅金'},
    '检查': '去色、遮掉日的颜色和救生圈、缩到缩略图、白底黑底',
}

# ------------------------------------------------------------------ 版式（舞台像素；全部落在砖格上）

ARTBOARD = (1100, 520)
# 字：(字号, 原点所在的列, 基线所在的行)。列、行是全局方格（舞台 x = 列·P、y = 行·P）
PLACE = {'晴': (210, 11, 36), '空': (160, 41, 36), '水': (145, 40, 54), '上': (145, 58, 54), '乐': (145, 77, 54), '园': (145, 95, 54)}
LID_AT = (63, 25)                # LID 左上角那块砖（列、行）：大写十二块砖高，底和「空」的末横同一行
WL = 400.0                       # 水线（舞台 y，正落在第 50 行的砖缝上）
RING_R = 65.0
RING_C = (793.0, 231.0)          # 救生圈的圆心：D 右边隔一块砖，圈底和 LID 的底齐（geometry 里核对）
BASELINE = 448.0                 # 收底：底线带第二行的基线


def shift_of(j):
    """第 j 行砖在水里往右错开多少（舞台像素）：水线以下整行错开半块，再一行行晃一点"""
    k = j - int(round(WL / P))
    if k < 0:
        return 0.0
    return P * 0.42 + 0.5 * math.sin(k * 1.35 + 0.6)


def geometry(tok):
    T = LT.letters()
    for g in T:
        size, ci, rj = PLACE[g.ch]
        g.place(ci * P, rj * P, size)
    Ms = LT.build(T, LT.TARGETS)
    cells = {}      # (i, j) -> {'ch', 'role', 'tags'}
    for g in T:
        M = Ms[g.label]
        role = 'hero' if g.ch == '晴' else 'text'
        for c in M.cells:
            cells[c] = {'ch': g.ch, 'role': role, 'tags': M.tags(c), 'deco': M.deco.get(c)}
    # 中文的轮廓：每块砖整格（字块外框、检查图用）
    def cell_path(cs):
        return union([rect(i * P, j * P, (i + 1) * P, (j + 1) * P) for (i, j) in cs])
    text = cell_path([c for c, v in cells.items()])
    lid, lid_end = EN.lid_cells(*LID_AT)
    ring_c = (lid_end * P + RING_R, (LID_AT[1] + 12) * P - RING_R)
    assert abs(ring_c[0] - RING_C[0]) < 0.01 and abs(ring_c[1] - RING_C[1]) < 0.01, ring_c
    E = EM.ring(ring_c, RING_R)
    # 日的中心（太阳）：「晴」里标 '日' 的砖的外框中心
    sun = [c for c, v in cells.items() if '日' in v['tags']]
    sx = (min(c[0] for c in sun) + max(c[0] for c in sun) + 1) / 2 * P
    sy = (min(c[1] for c in sun) + max(c[1] for c in sun) + 1) / 2 * P
    sun_box = (min(c[0] for c in sun) * P, min(c[1] for c in sun) * P, (max(c[0] for c in sun) + 1) * P, (max(c[1] for c in sun) + 1) * P)
    script, sw = EN.script('greetings from', 498, 204, 66, -7.5)
    capsp, cw = EN.caps(['A SUMMER LAID', 'TILE BY TILE'], 106, BASELINE)
    tb = text.bounds
    _write_grid_log(Ms)
    x_line0, x_line1 = 80.0, 928.0
    G0 = {'cells': cells, 'lid': lid, 'ring': E, 'hero': cell_path([c for c, v in cells.items() if v['role'] == 'hero']),
          'script': script, 'caps': capsp, 'sun': (sx, sy)}
    _fill_tiles(G0)
    G = {
        'title': T, 'mosaic': Ms, 'text': text, 'cells': cells, 'lid': lid, 'ring': E, 'shift': shift_of, 'wl': WL,
        'sun': (sx, sy), 'sun_box': sun_box, 'script': script, 'caps': capsp,
        'hero': cell_path([c for c, v in cells.items() if v['role'] == 'hero']),
        'baseline': BASELINE,
        'tag': {'x': 106, 'y': 58},
        # 星芒：落在日的左上角那块金砖上（受光的一角）
        'star': {'x': sun_box[0] + 6, 'y': sun_box[1] + 16, 's': 15, 'long': 2.6, 'tall': 1.9, 'a': 1},
        'anchors': {'sun': [round(sx, 1), round(sy, 1)], 'ring': [round(ring_c[0], 1), round(ring_c[1], 1)], 'water_y': WL},
        # 水线：代表画面读 geo.strokes[0] 的高度（pts[0] 的 y）当它的水线；伸进画面的 out 是这道水线往右的延长
        'geo': {
            'strokes': [{'pts': [[x_line0, WL], [x_line1, WL]], 'rgb': '17,83,94', 'w': LT.GROUT,
                         'stops': [[0, 0], [0.06, 0.8], [1, 0.85]], 'z': 'front'}],
            'out': {'x': x_line1, 'y': WL, 'dx': 1, 'dy': 0, 'len': 190, 'w': LT.GROUT, 'rgb': '17,83,94',
                    'stops': [[0, 0.85], [1, 0.15]], 'cap': 'butt'},
        },
        'enter': {'geo': {'at': 0.42, 'dur': 0.36}, 'star': {'at': 0.76, 'dur': 0.18}, 'tag': {'at': 0.08, 'dur': 0.26}},
        'plate_box': (x_line0, tb[1] - 26, x_line1, BASELINE + 22),
    }
    return G


def _write_grid_log(Ms):
    """检查图目录里写一份 砖格.txt：每个字规则铺出来的样子、定稿的样子、改了几块（视觉修正的改动清单）"""
    import os
    from lockupkit import paths
    lines = ['马赛克宋：每个字先按笔画规则铺砖（规则），再做视觉修正（定稿）。符号：X 砖 · # 宋体三角的阶梯 · ^ 竖的顿笔 · @ 日的金砖 · o 水滴', '']
    for k, M in Ms.items():
        lines += [f'== {k}  补 {M.fixed[0]} 块、拿掉 {M.fixed[1]} 块（共 {len(M.cells)} 块）', '-- 规则', M.rule, '-- 定稿', LT.dump(M), '']
    try:
        with open(os.path.join(paths.check_dir(KEY), '砖格.txt'), 'w', encoding='utf-8') as f:
            f.write(chr(10).join(lines))
    except OSError:
        pass


# ------------------------------------------------------------------ 图层（从后往前）和入场
# 入场讲的是“一块块铺上去；水线下错开”（kind 见 ae.js「各题的入场方式」lido-*）：
#   砖从「晴」的日心往外一块块铺开（lido-tiles：每块砖从中心长满一格；墙、字、LID 是同一道前沿，墙在前、字紧跟、LID 再晚一点）；
#   「晴」自己铺得慢一些，日的金砖先从中间亮起来；
#   水从底下涨上来，涨到哪一行、那一行的砖才错开半块（折射），水线下的字没被水漫过时还是干的深青墨，漫过了才变成池青；
#   救生圈从右边滚进来停在 D 后面（lido-roll，滚多远转多少）→ 手写 greetings from 写出来、底线带在水里对焦 →
#   水线从左往右画出来、伸进画面 → 水面的方块闪光、日上的星芒最后亮。
WAVE_V = 3150.0          # 铺砖前沿走多快（锁定像素 / 整段进度）：墙、字、LID 同一道前沿
TILE = {'tile': 0.05, 'jit': 0.02}
TIDE = [0.2, 0.46]       # 水从底板底边涨到水线（整段进度）
LAG = 0.07               # 水漫过一行以后，这一行错开用多少整段进度


def _tiles(start, v=WAVE_V, **kw):
    """lido-tiles 的参数；起点、半径、错开、at/dur 在 geometry() 里按排好的砖算（见 _fill_tiles）"""
    return {'kind': 'lido-tiles', 'start': start, 'v': v, **TILE, **kw}


LAYERS = [
    Layer('plate', 'plate', LY.render_plate, enter=_tiles(0.0, tile=0.06, pool=True)),
    Layer('lido', 'en', LY.render_lido, enter=_tiles(0.1)),
    Layer('ring', 'emblem', LY.render_ring, enter={'at': 0.3, 'dur': 0.36, 'kind': 'lido-roll', 'dx': 96, 'r': RING_R}, pivot=RING_C),
    Layer('text', 'text', LY.render_text, enter=_tiles(0.025, dry=0.6)),
    Layer('hero', 'hero', LY.render_hero, enter=_tiles(0.0, v=1150.0, tile=0.07, jit=0.03)),
    Layer('script', 'en', LY.render_script, enter={'at': 0.44, 'dur': 0.26, 'kind': 'wipe', 'dir': 'right', 'soft': 0.2}),
    Layer('caps', 'en', LY.render_caps, enter={'at': 0.48, 'dur': 0.22, 'kind': 'focus', 'blur': 3}),
    Layer('fx', 'glint', LY.render_fx, enter={'at': 0.7, 'dur': 0.18, 'kind': 'flash'}),
]


def _fill_tiles(G):
    """把 lido-tiles 要的几何写进各层的 enter：砖距、日心、水线、水线下每一行错开多少、水怎么涨；
    铺砖前沿从 start 起、按 v 往外走，走到这一层最远那块砖为止；at、dur 盖住铺完、水涨完、错开完"""
    sun = [round(G['sun'][0], 1), round(G['sun'][1], 1)]
    jw = int(round(WL / P))
    plate = LY.plate_cells(G)
    y0 = (max(j for _, j in plate) + 1) * P                            # 水从底板的底边涨起
    shift = [round(shift_of(j), 2) for j in range(jw, int(y0 // P) + 1)]
    cells = {'plate': list(plate), 'lido': list(G['lid']),
             'text': [c for c, v in G['cells'].items() if v['role'] == 'text'], 'hero': [c for c, v in G['cells'].items() if v['role'] == 'hero']}
    for ly in LAYERS:
        e = ly.enter
        if e.get('kind') != 'lido-tiles':
            continue
        if 'start' in e:                                                   # 起点、速度只在这里用，不进清单
            ly.wave = (e.pop('start'), e.pop('v'))
        start, v = ly.wave
        r = max(math.hypot((i + 0.5) * P - sun[0], (j + 0.5) * P - sun[1]) for i, j in cells[ly.id]) + P
        end = start + r / v
        under = any(j >= jw for _, j in cells[ly.id])
        last = max(end + e['jit'] + e['tile'], TIDE[1] + LAG + (e['tile'] if e.get('pool') else 0) if under else 0)
        e.update({'grid': P, 'o': sun, 'wave': [start, round(end, 3)], 'rmax': round(r, 1), 'wl': WL, 'at': start, 'dur': round(last - start + 0.005, 3)})
        if under:                                                          # 有砖在水线下的层才要水
            e.update({'shift': shift, 'tide': [TIDE[0], TIDE[1], y0], 'lag': LAG})


# ------------------------------------------------------------------ 小形态


def small(tok):
    """一行六个字，还是砖拼的（马赛克宋的台阶就是这个方言最认得出的那一面），砖缝收细；签名字「晴」的日是金砖、青随题名的字色。
    题名铅印：纸白或墨，墨用铅印的墨（这一题自己的墨是深池青，和它的青布书脊同色系，印上去读不出）"""
    T = LT.letters()
    for g in T:
        size, ci, rj = PLACE[g.ch]
        g.place(ci * P, rj * P, size)
    Ms = LT.build(T, LT.TARGETS)
    chars, adv = LT.font_paths(T, Ms, inset=0.09)

    def face(C, mask, tone):
        return LY.small_face(C, mask, SM.LEAD_INK if tone in ('ink', 'stamp-ink') else SM.PAPER)
    return {'chars': chars, 'hero': 0, 'face': face, 'advance': adv, 'ink': SM.LEAD_INK}

"""08 雨夜港口的巨型机甲 · 题名锁定模块（第一个走通新生成器的样板）。

  概念单     CONCEPT（下面）
  笔画标注   strokes.py
  笔画处理   letters.py（方言「装甲宋」、雨刃呼应、液压杆高潮）
  主体元素   emblem.py（胸口炉心）
  英文       english.py（BREAKER 背景巨字、环字、底线带）
  颜色层     layers.py（每层一个 render）；图层表 LAYERS 和入场在本文件
出图：python 专题/审美全能/设计/logo/lockups/build/lockup.py harbor-mecha
"""
import math
from lockupkit.geom import union, poly, rect, circle, move
from lockupkit.run import Layer
from . import letters as LT, emblem as EM, english as EN, layers as LY
from .strokes import STROKES  # noqa: F401  （--strokes 用）

KEY = 'harbor-mecha'
TEXT = LT.TEXT
FONT = LT.FONT

CONCEPT = {
    '题名': '雨夜港口的巨型机甲', '类别': '硬表面建模',
    '一句话概念': '雨夜船坞里刚装配完的机甲，胸口的炉心正在点火。',
    '气质词': ['硬质', '冷峻', '厚重'], '物件': '胸口的炉心', '动作': '点火、合拢',
    '同源媒介': '工业纪录片与船厂蓝图：机加工的钢板、面板线、尺寸标注',
    '方言': '装甲宋：曲线换成机加工刻面；宋体圆脚一刀斜切；横末三角拔成装甲鳍；发丝横加厚到能刻斜面；粗竖开折线分缝',
    '骨架': '字距紧，整块重心压低；角度只用水平、竖直和雨的斜角（偏竖直 23°）',
    '母题落点': {'高潮': '「甲」的中竖穿出字脚，一节节收细成液压杆，杆尖接 70 M 尺寸线（这一笔的延伸伸进画面）',
               '呼应': '所有的点（雨、夜、港的三点水、的、机）换成同一雨向的雨刃；粗竖开分缝（构造规则）'},
    '主体元素': '胸口炉心：圆形反应堆，装甲环板、涡轮叶、发光的德尔塔三角，外圈一圈刻字；插在第一段末尾，「口」的上横伸成钢杆插进刻字环，下缘被「甲」压住，顶出剪影',
    '英文分工': 'BREAKER 模板喷字作背景巨字（压在第二段后面）；IN THE HARBOR RAIN 底线带配甲板钢轨；环字 BREAKER · DELTA / REACTOR · No. 08；70 M 尺寸标注',
    '颜色角色': {'字面': '湿钢（冷银、竖向湿光），全组一种料', '主题色': '钢青（底板雨雾、蓝图网格）', '阴影': '钢青暗调',
               '点缀': '炉心橙：炉心为主；签名字「甲」受热成片暖过去、最近炉心的那道分缝一线余热为呼应', '共用金属': '亮钢'},
    '检查': '去色、遮掉炉心只剩字、缩到缩略图、白底黑底',
}

# ------------------------------------------------------------------ 版式（舞台像素；画板左上 = 介绍页上锁定的原点）

ARTBOARD = (1100, 520)
S1, S2, S_DE = 112, 158, 64       # 第一段「雨夜港口」、第二段「巨型机甲」、「的」的字号
ADV1, ADV2 = 930, 950             # 字距（字体单位）：字挨得紧
X1, B1 = 109, 214                 # 第一段第一个字的原点和基线
X2, B2 = 172, 371                 # 第二段
XDE, BDE = 102, 371               # 「的」缩小下沉，塞进第二段左边的空当
EMB = (814, 206)                  # 胸口炉心的圆心
R = 160                           # 炉心最外圈半径
# 背景巨字 BREAKER：压在第二段后面，上面四成被字挡住，下面六成从字脚下露出来；它的基线就是甲板钢轨，
# IN THE HARBOR RAIN 接在它后面、坐同一条轨（读起来是 BREAKER · IN THE HARBOR RAIN）
GHOST = dict(word='BREAKER', size=132, x0=106, base=440, alpha=0.92,
             colors=[(0, '#5C7690'), (1, '#4A6279')])
RAIL_Y = 444                      # 甲板钢轨（BREAKER 的基线下面一点）


def geometry(tok):
    T = LT.letters()
    for i in range(4):
        T[i].place(X1 + i * ADV1 * S1 / 1000, B1, S1)
    T['的'].place(XDE, BDE, S_DE)
    for i in range(4):
        T[5 + i].place(X2 + i * ADV2 * S2 / 1000, B2, S2)
    k1 = S1 / 1000

    def line1(p):
        return p.transform(k1, 0, 0, -k1, X1, B1)
    # 雨夜的横梁：雨的梁（高）带一个 45° 折角落到夜的梁（低），连成一根钢梁；口的上横伸成钢杆，插进炉心的刻字环
    beam = poly([(915, 773), (948, 773), (1013, 708), (1013, 668), (980, 668), (915, 733)])
    yb = B1 - 0.682 * S1
    xr = EMB[0] - math.sqrt(151.5 ** 2 - (EMB[1] - yb) ** 2)
    conduit = rect(3 * ADV1 + 880, 662, (xr - X1) / S1 * 1000, 702)
    links = line1(union(beam, conduit))
    glyphs = [g.stage_path() for g in T]
    text = union(glyphs + [links])
    line1, line2 = union(glyphs[:4] + [links]), union(glyphs[4:])     # 两段分开入场（第一段带着钢杆推进来，第二段被液压杆顶上来）
    chars = [{'path': p, 'top': g.base - 0.86 * g.size, 'bottom': g.base + 0.12 * g.size} for p, g in zip(glyphs, T)]
    seams = []
    for g in T:
        for s in g.seams:
            seams.append({'pts': [g.to_stage(q) for q in s['pts']], 'w': s['w'] * g.k, 'lit': s['stroke'] == '机2'})
    star = T['夜'].to_stage(T['夜'].anchors['star'])
    rod_tip = T['甲'].to_stage(T['甲'].anchors['rod_tip'])
    rod_x = T['甲'].to_stage(T['甲'].anchors['rod_x'])[0]
    hair = min((28 + 2 * LT.THICK) * g.k for g in T)        # 本题字的最细笔画（加厚后的横，舞台像素）

    E = EM.emblem(EMB, R)
    ringt = EN.ring_text(EMB)
    gh = EN.stencil(GHOST['word'], GHOST['size'], GHOST['x0'], GHOST['base'])
    gb = gh['path'].bounds
    gh.update(GHOST, box=rect(gb[0] - 6, gb[1] - 6, gb[2] + 6, gb[3] + 6))
    # 甲板：一根钢轨托住 BREAKER 和底线带，左端斜尖，铆钉一颗颗排开；线宽 = 本题最细笔画
    caps, cw = EN.caps(0, 0)
    tx0 = gh['x1'] + 22
    y = RAIL_Y
    hw = hair / 2
    rail = union(poly([(92, y), (110, y - hw), (110, y + hw)]), rect(110, y - hw, tx0 + cw + 14, y + hw))
    beads = union([circle(x, y, hair * 0.95) for x in range(138, int(gh['x1']), 46)])
    baseline = GHOST['base']
    caps = move(caps, tx0, baseline)
    G = {
        'title': T, 'text': text, 'line1': line1, 'line2': line2, 'hero': T['甲'].stage_path(), 'chars': chars, 'seams': seams, 'star_at': star,
        'emblem': E, 'ring': ringt, 'ghost': gh, 'rain_deg': LT.RAIN_DEG,
        'rail': {'path': rail, 'beads': beads, 'caps': caps, 'y': y},
        'plate': {'blobs': [(440, 315, 375, 140, 1.0), (300, 175, 230, 70, 0.9)],
                  'strokes': [(52, 380, 352, 34, 101), (600, 1040, 430, 22, 103), (520, 960, 70, 20, 104)],
                  'halftone': (60, 120, 260, 250)},
        'baseline': baseline,
        'tag': {'x': 104, 'y': 58},
        'anchors': {'emblem_center': list(EMB), 'emblem_radius': R, 'star': list(star), 'rod_tip': list(rod_tip), 'rail_y': y},
        # 伸进画面的那一根：「甲」液压杆尖往下的尺寸线（这一笔的延伸，线宽 = 本题最细笔画）。有落点时先落到甲板钢轨上、
        # 顺着钢轨往右走，到落点正上方再竖直落下去（elbow），接到代表画面里巨影的脚下；没有落点时直着往下
        'geo': {'out': {'x': rod_tip[0], 'y': rod_tip[1], 'dx': 0, 'dy': 1, 'len': 150, 'route': 'elbow', 'lead': round(y - rod_tip[1], 2),
                        'overshoot': False, 'w': round(hair, 2), 'cap': 'butt', 'rgb': '214,226,238',
                        'stops': [[0, 0.9], [0.7, 0.55], [1, 0]], 'ticks': {'every': 58, 'len': 7},
                        'label': {'text': '70 M', 'at': 0.86, 'dx': 14, 'dy': 6}}},
        'enter': {'geo': {'at': 0.56, 'dur': 0.38}, 'tag': {'at': 0.12, 'dur': 0.26}},
    }
    return G


# ------------------------------------------------------------------ 图层（从后往前）和入场
# at、dur 占整段入场的比例（片头一格 0.8 秒、介绍页 2.4 秒）。故事是“装配，然后点火”（kind 见 ae.js「08 雨夜港口的巨型机甲」）：
#   蓝图先出来——炉心的刻度圈绕一圈画出、中线往两边拉开，雨雾从炉心那里浓起来，炉壳是一个空的形状；
#   装配——八块装甲板带着一拧（-16°、从大一圈收进来）锁死在环上，涡轮叶反向一拧合拢（没通电，炉心周围也是冷的）；第一段字从左边推进来，钢杆正好插进刻字环，
#     第二段被液压杆从下面顶上来，几件在同一刻到位（钢边亮一下）。这时字是没通电的冷钢：暗、发灰，但已经读得清；
#   空一拍——点火：炉芯一下没着、再着，过亮一下回到本色；装甲板缝里透出火；光从炉心往外推，沿钢杆进「口」、一圈圈亮过每个字，
#     前沿上一道冷白的电光；BREAKER 被喷枪从左往右喷上去；
#   收尾——刻字环转进来，钢轨铺开、IN THE HARBOR RAIN 顺着轨滑到位，液压杆尖的 70 M 尺寸线落下去，德尔塔一团过曝的白收进三角，星最后一闪。
POWER = {'at': 0.35, 'dur': 0.22, 'from': list(EMB), 'reach': 760, 'band': 90, 'dark': 0.55}

LAYERS = [
    Layer('plate', 'plate', LY.render_plate, enter={'at': 0.0, 'dur': 0.34, 'kind': 'grow', 'from': list(EMB), 'soft': 0.5}),
    Layer('ghost', 'ghost', LY.render_ghost, enter={'at': 0.4, 'dur': 0.28, 'kind': 'mecha-spray'}),
    Layer('axis', 'line', LY.render_axis, enter={'at': 0.0, 'dur': 0.22, 'kind': 'grow', 'from': list(EMB), 'soft': 0.06}),
    Layer('rail', 'line', LY.render_rail, enter={'at': 0.46, 'dur': 0.24, 'kind': 'wipe', 'dir': 'right', 'soft': 0.08}),
    Layer('housing', 'emblem', LY.render_housing, enter={'at': 0.02, 'dur': 0.18, 'kind': 'focus', 'blur': 6}),
    Layer('plate_glow', 'emblem', LY.render_plate_glow, enter={'at': 0.34, 'dur': 0.14, 'kind': 'ignite', 'dark': 0}),
    Layer('plates', 'emblem', LY.render_plates, enter={'at': 0.05, 'dur': 0.26, 'kind': 'mecha-power', 'angle': -16, 's': 0.1, 'from': list(EMB), 'seat': 0.3, 'power': POWER}),
    Layer('core', 'emblem', LY.render_core, enter={'at': 0.3, 'dur': 0.14, 'kind': 'mecha-ignite'}),
    Layer('vanes', 'emblem', LY.render_vanes, enter={'at': 0.05, 'dur': 0.26, 'kind': 'mecha-power', 'angle': 40, 'seat': 0.15, 'power': POWER}, pivot=EMB),
    Layer('ring', 'emblem', LY.render_ring, enter={'at': 0.46, 'dur': 0.3, 'kind': 'turn', 'from': list(EMB), 'angle': -28}),
    Layer('delta', 'emblem', LY.render_delta, enter={'at': 0.68, 'dur': 0.18, 'kind': 'mecha-flare', 'from': list(EMB)}),
    Layer('en', 'en', LY.render_en, enter={'at': 0.52, 'dur': 0.24, 'kind': 'slide', 'dx': -26}),
    Layer('text_a', 'text', LY.render_text_a, enter={'at': 0.03, 'dur': 0.26, 'kind': 'mecha-power', 'dx': -64, 'seat': 0.18, 'power': POWER}),
    Layer('text_b', 'text', LY.render_text_b, enter={'at': 0.06, 'dur': 0.26, 'kind': 'mecha-power', 'dy': 36, 'seat': 0.18, 'power': POWER}),
    Layer('geo_front', 'line', LY.render_geo_front, enter={'at': 0.0, 'dur': 0.24, 'kind': 'trace', 'from': list(EMB), 'start': -90, 'soft': 0.08}),
    Layer('fx', 'glint', LY.render_fx, enter={'at': 0.84, 'dur': 0.16, 'kind': 'flash'}),
]


# ------------------------------------------------------------------ 小形态


def small(tok):
    """一行九个字：方言（刻面、斜切脚、鳍、雨刃）留着，分缝、长刀、液压杆这些小了看不清的去掉；签名字「甲」是湿钢"""
    T = LT.letters(detail='small')

    def face(C, mask, tone):
        if tone in ('ink', 'stamp-ink'):
            return LY.steel(C, mask, '#3B4A58', '#7E91A3', bevel_px=0.9, key=0.6, shadow=0.5, rim=0.6)
        return LY.steel(C, mask, '#6F8294', '#E9EFF4', bevel_px=0.9, key=0.75, shadow=0.55, rim=0.9)
    return {'chars': [g.path() for g in T], 'hero': 8, 'face': face}

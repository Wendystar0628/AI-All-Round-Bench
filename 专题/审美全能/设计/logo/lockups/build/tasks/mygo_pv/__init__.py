"""01《壱雫空》PV · 题名锁定模块。

  概念单     CONCEPT（下面）
  笔画标注   strokes.py
  笔画处理   letters.py（方言「雨丝明朝」：发丝横、尖鳞、雨丝脚、水滴点；高潮「下」的那一滴透明的水）
  主体元素   emblem.py（被雨丝划过的太阳）
  书名号英文 english.py（《》两道折起来的雨线、PV 细斜体、底线带、环字）
  颜色层     layers.py；图层表 LAYERS 和入场在本文件
出图：python 专题/审美全能/设计/logo/lockups/build/lockup.py mygo-pv（--preview 只看样子）
"""
from lockupkit.geom import union, diff, circle, scale_about
from lockupkit.run import Layer
from . import letters as LT, emblem as EM, english as EN, layers as LY
from .strokes import STROKES  # noqa: F401  （--strokes 用）

KEY = 'mygo-pv'
TEXT = LT.TEXT
FONT = LT.FONT

CONCEPT = {
    '题名': '《壱雫空》PV', '类别': 'PV 设计（MyGO!!!!! 的歌《壱雫空》的 PV）',
    '一句话概念': '晴天里落下的一滴雨，雨滴里倒映着整片天。',
    '气质词': ['清爽', '晴朗', '透气'], '物件': '一滴透明的雨，和一轮被雨丝划过的太阳', '动作': '落下；放晴（第二段往右上扬）',
    '同源媒介': '动画电影的片名卡：细明朝排在晴空上（雨和晴天的动画片名多用细明朝）；背景是透明水彩的天——湿边、留白的云',
    '方言': '雨丝明朝：思源宋体 Bold（细一档）；横收成真正的发丝，竖细而挺，对比拉到 1999 那样高；横末三角往右上收尖（向阳）；'
            '收笔朝下、空着的竖换成收尖的雨丝针；所有的点画成同一种泪滴：屋檐（冖、雨头、宀）的左点是挂在檐口的一滴水，宀的顶点是落在屋顶上的一滴雨',
    '骨架': '「雫」放大到 1.45 倍居中；第二段「空》PV」往右上扬；重心偏上，字距放松；角度只用水平、竖直和雨向（偏竖直 16°，和代表画面的雨同向）',
    '母题落点': {'高潮': '「雫」= 雨 + 下，字本身在讲“一滴雨落下”。「下」的那一点和“一滴水”同构：画成一滴透明的水，原位置、原方向，比原来那一点稍大；'
                       '墨边是水的厚度（背光的左下厚、向阳的右上薄），里面倒映一小片天和太阳，受光处一颗星芒',
               '呼应': '所有的点都是泪滴（壱的冖、雨头、宀的左点挂在檐口，宀的顶点落在屋顶）；雨字头四点换成四道斜落的细长雨滴（雨点和雨丝同构）；'
                       '书名号《》是两道折起来的雨线；「下」的竖收成长针，是落进水里的一根雨丝'},
    '主体元素': '一轮被雨丝划过的太阳：暖金日核、发丝环、环字 SUNSHOWER、一圈长短相间的针形光芒，三道雨丝从日面前斜划过、划过日面的几段被照成金。'
                '插在「雫」「空」之间的上方（雫的右上），「空」顶上那滴雨正从太阳下缘落下，顶出剪影',
    '英文分工': '大档 PV：Didone 细斜体放大在第二段右边，天青的水彩字，比中文浅一档；底线带 A SINGLE DROP OF SKY 坐在水线上，'
                '水线在那滴水正下方起一圈涟漪，末端一颗小水滴，再伸进画面；环字 SUNSHOWER 在太阳外圈',
    '颜色角色': {'字面': '深群青墨（全组一种料，上深下略透出天青，墨面带一点颜料的斑驳）', '主题色': '天青：底板（湿边水彩、留白的云、太阳四周留白）和「下」那一滴的水',
               '阴影': '深天青的淡影，落在背光的左下', '高光': '暖白：日晕、水滴的受光边',
               '点缀': '太阳金：日核为主；水滴里倒映的太阳和受光点、水线末端那颗小水滴为呼应；离太阳近的笔画受光边和横末尖上像金粉一样洒开，越远越稀',
               '共用金属': '浅金（太阳的发丝环和光芒）'},
    '检查': '去色、遮掉太阳和英文只剩字、缩到缩略图、白底黑底',
}

# ------------------------------------------------------------------ 版式（舞台像素；画板左上 = 介绍页上锁定的原点）

ARTBOARD = (1100, 520)
S1, S0 = 165, 240                 # 「壱」「空」、「雫」的字号
X_YI, B_YI = 140, 362             # 「壱」
X_NA, B_NA = 300, 366             # 「雫」：放大居中，「下」的针一直落到水线
X_KU, B_KU = 532, 334             # 「空」：第二段往右上扬
BAND_Y = 430                      # 水线（底线带）
SUN_C = (609, 108)                # 太阳：「空」顶上那滴雨的正上方
PV_X, PV_BASE, PV_SIZE = 752, 334, 188


def hair():
    """本题字的最细笔画（舞台像素）：「壱」「空」那一档的发丝横"""
    return LT.HAIR * S1 / 1000 * 1.1


def geometry(tok):
    T = LT.letters()
    T['壱'].place(X_YI, B_YI, S1)
    T['雫'].place(X_NA, B_NA, S0)
    T['空'].place(X_KU, B_KU, S1)
    H = hair()
    glyphs = [g.stage_path() for g in T]
    # 书名号：两道折起来的雨线；《 的顶点对着「壱」的中腰，》跟着「空」往上扬
    bl = EN.bracket(104, B_YI - 0.40 * S1, 150, -1)
    kb = T['空'].stage_path().bounds
    br = EN.bracket(kb[2] + 36, B_KU - 0.40 * S1, 150, +1)
    text = union(glyphs + [bl, br])
    # 高潮那一滴：墨边在字里，水在 hero 层
    outer, rim, water = LT.climax_shapes()
    g = T['雫']
    drop = {'outer': g.stage(outer), 'water': g.stage(water), 'c': g.to_stage(LT.CLIMAX['c']), 'r': LT.CLIMAX['r'] * g.k,
            'tip': g.to_stage(LT.CLIMAX['tip'])}
    drop['rim'] = g.stage(rim)
    # 那一滴整滴（墨边连同水）单独一层，入场时能从「雨」落进「下」；字层里挖掉它
    text_body = diff(text, drop['outer'])
    # 太阳：「空」顶上那滴雨的尖让开
    d1 = LT.DROPS['空1']
    S = EM.sun(SUN_C, H, drop=(T['空'].to_stage(d1[0]), T['空'].to_stage(d1[1]), d1[2] * T['空'].k))
    ringt = EN.ring_text(SUN_C, 38.2)
    # PV
    pv, pvw = EN.pv(PV_X, PV_BASE, PV_SIZE)
    # 一处截断：一道雨丝穿过 P 的碗，右半边被水折射着挪开一点
    pv, pv_slash = EN.slash(pv, (PV_X + 0.40 * PV_SIZE, PV_BASE - 0.50 * PV_SIZE), up=118, down=112)
    # 底线带：水线从《下面起，经过「下」的针尖、那一滴正下方起一圈涟漪，往右托住 A SINGLE DROP OF SKY，末端一颗小水滴
    cw = EN.caps_width()
    cx0 = PV_X + 4
    caps, _ = EN.caps(cx0, BAND_Y - 6)
    x_end = cx0 + cw + 22
    end_drop = LT.drop((x_end - 1, BAND_Y - 1.5), (x_end + 4.2, BAND_Y + 6.5), 3.6)
    rip_c = (drop['c'][0], BAND_Y)
    ripples = [ring_ellipse(rip_c, rx, H * (0.9 if i else 1.1)) for i, rx in enumerate((40, 26, 13))]
    needle_tip = T['雫'].to_stage((493, -260))
    chars = [{'path': p, 'top': gg.base - 0.88 * gg.size, 'bottom': gg.base + 0.12 * gg.size} for p, gg in zip(glyphs, T)]
    G = {
        'title': T, 'text': text, 'text_body': text_body, 'chars': chars, 'drop': drop,
        'sun': S, 'ring': ringt, 'pv': pv, 'pv_slash': pv_slash, 'pv_box': (PV_X, PV_BASE - 0.72 * PV_SIZE, PV_X + pvw, PV_BASE + 0.05 * PV_SIZE),
        'band': {'y': BAND_Y, 'x0': 92, 'x1': x_end, 'caps': caps, 'end_drop': end_drop, 'ripples': ripples, 'rip_c': rip_c,
                 'needle': needle_tip},
        'hair': H,
        'baseline': BAND_Y,
        'tag': {'x': 104, 'y': round(min(p.bounds[1] for p in glyphs) - 50)},
        'anchors': {'sun': list(SUN_C), 'drop': [round(drop['c'][0], 1), round(drop['c'][1], 1)], 'ripple': list(rip_c),
                    'band_end': [round(x_end + 4, 1), BAND_Y + 6]},
        # 伸进画面的那一根：水线末端那颗小水滴落下去，走到代表画面里那滴水正下方的涟漪（emblems/mygo-pv.js 的 link）。
        # 线宽 = 本题最细笔画；先顺着落下的方向出去一小段，再平着走、到落点上方才落下（不穿过左栏的点题短语和正文）
        'geo': {'out': {'x': round(x_end + 4.2, 2), 'y': round(BAND_Y + 10.5, 2), 'dx': 0.45, 'dy': 0.89, 'len': 150, 'route': 'swing',
                        'lead': 22, 'w': round(H, 2), 'cap': 'round', 'rgb': '47,110,153',
                        'stops': [[0, 0.75], [0.6, 0.5], [1, 0]]}},
        'enter': {'geo': {'at': 0.66, 'dur': 0.32}, 'tag': {'at': 0.1, 'dur': 0.26}},
    }
    return G


def ring_ellipse(c, rx, w, flat=0.17):
    """一圈涟漪：扁椭圆的发丝环"""
    cx, cy = c
    outer = scale_about(circle(cx, cy, rx + w / 2), 1, (flat * rx + w / 2) / (rx + w / 2), cx, cy)
    inner = scale_about(circle(cx, cy, rx - w / 2), 1, max(0.01, flat * rx - w / 2) / (rx - w / 2), cx, cy)
    return diff(outer, inner)


# ------------------------------------------------------------------ 图层（从后往前）和入场
# 故事是「雫」= 雨 + 下：晴天里落下一滴雨。
#   天青的水彩从太阳那里化开、太阳从一团晃眼的光里收出来、光芒往外伸 → 字从虚到实（0.3 秒内读得清；「下」那一点先空着）→
#   PV 的水彩字擦出、太阳下半圈的雨越落越快地落下 → 那一滴从「雨」里落进「下」的那一点（顺着雨向，越落越快、身后一道淡雨痕，到位就停）→
#   落定的那一刻，正下方水面起涟漪，一圈扩开、外面一圈散掉；水线从涟漪往两边铺开、托出英文 → 水面扫过一道光 → 那一滴受光处的星最后一闪
DROP_C = (X_NA + LT.CLIMAX['c'][0] * S0 / 1000, B_NA - LT.CLIMAX['c'][1] * S0 / 1000)
RIP_C = (DROP_C[0], BAND_Y)
LAND = 0.44                       # 那一滴落定（占整段）：涟漪和水线从这一刻起

LAYERS = [
    Layer('plate', 'plate', LY.render_plate, enter={'at': 0.0, 'dur': 0.32, 'kind': 'grow', 'from': list(SUN_C), 'soft': 0.4}),
    Layer('ghost', 'ghost', LY.render_pv, enter={'at': 0.14, 'dur': 0.32, 'kind': 'wipe', 'dir': 'right', 'soft': 0.22}),
    Layer('rays', 'emblem', LY.render_rays, enter={'at': 0.07, 'dur': 0.3, 'kind': 'grow', 'from': list(SUN_C), 'soft': 0.22}),
    Layer('sun', 'emblem', LY.render_sun, enter={'at': 0.02, 'dur': 0.26, 'kind': 'pv-glare', 'from': list(SUN_C),
                                                 'glare': 0.55, 'blur': 9, 's': 0.14}),
    Layer('text', 'text', LY.render_text, enter={'at': 0.05, 'dur': 0.24, 'kind': 'focus', 'blur': 6, 'dy': -10}),
    Layer('hero', 'hero', LY.render_water, enter={'at': LAND - 0.17, 'dur': 0.17, 'kind': 'pv-fall', 'c': list(DROP_C),
                                                   'fall': 150, 'stretch': 0.12, 'sweep': {'at': 0.52, 'dur': 0.3}}),
    Layer('rain', 'line', LY.render_rain, enter={'at': 0.16, 'dur': 0.22, 'kind': 'pv-rain', 'dy': 16, 'soft': 0.3}),
    Layer('ripple', 'line', LY.render_ripple, enter={'at': LAND, 'dur': 0.34, 'kind': 'pv-ripple', 'from': list(RIP_C), 'echo': 0.7}),
    Layer('en', 'en', LY.render_en, enter={'at': LAND + 0.03, 'dur': 0.3, 'kind': 'grow', 'from': list(RIP_C), 'soft': 0.22}),
    Layer('fx', 'glint', LY.render_fx, enter={'at': 0.8, 'dur': 0.18, 'kind': 'flash'}),
]


# ------------------------------------------------------------------ 小形态


def small(tok):
    """一行：《壱雫空》PV。方言（发丝横、雨丝针、泪滴点、雨字头的雨滴）留着；「下」那一滴画成实心，签名字「雫」是水"""
    T = LT.letters(detail='small')
    k = 1000 / S1
    bl = EN.bracket(0, 0, 136, -1).transform(k, 0, 0, -k, 360, 380)     # 舞台 → 字体单位（y 朝上），顶点放在字身中腰
    br = EN.bracket(0, 0, 136, +1).transform(k, 0, 0, -k, 260, 380)
    pv, w = EN.pv(0, 0, 1000)
    pv = pv.transform(1, 0, 0, -1, 40, 0)
    chars = [bl] + [g.path() for g in T] + [br, pv]
    return {'chars': chars, 'hero': 2, 'face': lambda C, m, tone: LY.small_face(C, m, tone, tok), 'advance': [0.62, 1, 1, 1, 0.62, w / 1000 + 0.1]}

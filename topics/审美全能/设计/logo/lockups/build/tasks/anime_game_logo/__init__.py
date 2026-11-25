"""10 二次元游戏Logo · 题名锁定模块。

  概念单     CONCEPT（下面）
  笔画标注   strokes.py
  中文笔画   letters.py（方言「烫印宋」）
  主字       latin.py（Logo：L 的尖头笔花饰、装反的 g）
  主体元素   emblem.py（套准靶标，放在 ® 的位置）
  英文       english.py（底线带、校对红批注）
  作图工具   draw.py（尖头笔的带、光滑曲线、针尖、圆珠梯尺）
  颜色层     layers.py；图层表 LAYERS 和入场在本文件
出图：python topics/审美全能/设计/logo/lockups/build/lockup.py anime-game-logo
"""
import math
import numpy as np
from lockupkit.geom import union, move, circle
from lockupkit.run import Layer
from . import letters as LT, latin as LA, emblem as EM, english as EN, layers as LY, draw as D
from .strokes import STROKES  # noqa: F401  （--strokes 用）

KEY = 'anime-game-logo'
TEXT = LT.TEXT
FONT = LT.FONT

CONCEPT = {
    '题名': '二次元游戏Logo', '类别': '字体与Logo设计',
    '一句话概念': '一张刚压好的烫印校样：镭射箔的 Logo 压进纸里，套准靶标还在角上，校对员用红笔圈出一枚装反了的 g。',
    '气质词': ['华丽', '锋利', '精工'], '物件': '烫印校样上的套准靶标', '动作': '压印、圈改',
    '同源媒介': '铅字排印与烫金校样：铅字、烫印版、套准靶标、网点梯尺、校对符号',
    '方言': '烫印宋（中文）+ Didone 胖脸体（Logo），同一支尖头笔、全件没有圆头：横是发丝、竖撇捺重；'
          '中文横末和折肩的三角、L 的顶衬线右端和底脚的勾，都画成两边内凹的刺；撇、提、钩、捺的收尾拉成针尖；'
          '中文的点和 g 的耳朵都画成两头尖的楔形泪滴',
    '骨架': '一行：中文坐在 Logo 的基线上、字高等于 Logo 的小写高；Logo 的 L 放大一档统领全行；字距紧（排字房密排）；横画水平；'
          'L 的花饰圈出一道右宽左窄的椭圆，把整行托住',
    '母题落点': {'高潮': 'Logo 的 g 是一枚装反的铅字：左右翻过来、略压歪，上字腔里是全件唯一的星芒，校对红圈住它',
               '呼应': '刺形衬线（中文 12 处、L 两处）、楔形泪滴（中文 5 个点、g 的耳朵）、针尖收笔（中文撇提钩捺、花饰收尾、靶标准线）；'
                     '全组同一种压印（背光一侧一线暗、受光一侧一线亮）'},
    '主体元素': '套准靶标：发丝外环带刻度、粗环、四个楔形缺口、四象限靶心、针尖的十字准线；放在 Logo 右上角 ® 的位置'
            '（registration mark 双关），和 Logo 同一种镭射箔；横准线往右就是伸进画面的那根线',
    '英文分工': 'Logo 是主字；底线带 ANIME GAME LOGO · PROOF No. 10 挂在花饰托底的发丝下面；校对员的红笔手写 turn 和转向记号斜在右下页边',
    '颜色角色': {'字面': '中文铅墨', '主题色': '校样纸（撕边底板，花饰圈里是灯下的暖白）', '阴影': '纸的暖灰（压痕、底板的软影）',
               '点缀': '校对红：圈住 g 的红圈为主，引线、turn 批注和转向记号为呼应',
               '高光': '镭射箔：银灰阶的镀铬明暗，彩虹只在最亮的几道斜峰上出现，中高光里一层稀的彩色闪粒',
               '共用金属': '镭射箔银（Logo、花饰、网点梯尺、靶标）'},
    '检查': '去色、遮掉靶标和红笔只剩字、缩到缩略图、白底黑底',
}

# ------------------------------------------------------------------ 版式（舞台像素；画板左上 = 介绍页上锁定的原点）

ARTBOARD = (1260, 480)
B = 330                       # Logo 的基线 = 中文落脚的线
SC = 96                       # 中文字号
ADV_C = 0.955                 # 中文步进（em）：密排
X_C = 110                     # 第一个中文字的原点
S = 210                       # Logo 小写的字号（x 高 = 中文字高）
SL = 244                      # L 放大一档
RUN = 404                     # 花饰托底那一段的高度；底线带挂在它下面，底线带的基线 = 收底的基线
TGT = (1112, 176)             # 套准靶标中心
TGT_R = 62


def geometry(tok):
    T = LT.letters()
    BC = B + 3 - 0.095 * SC                   # 中文的字身底（-95 单位）落在 Logo 基线下 3 像素
    for i, g in enumerate(T):
        g.place(X_C + i * ADV_C * SC, BC, SC)
    cn = [g.stage_path() for g in T]
    cn_all = union(cn)
    cb = cn_all.bounds
    LG = LA.logo(S, SL, cb[2] + 20 - 21 * SL / 1000, B)
    hair = 28 * SC / 1000 * 0.82              # 本题字的最细笔画（中文发丝横，舞台像素）

    # ---- L 的花饰：顶衬线左端 → 往左压着中文上沿走发丝 → 左边压笔变粗 → 兜到全件下面 → 右边挑起、卷回来收住
    x0, y0 = LG['L_top_left']
    R_ = LG['right']
    # 花饰的走法：右宽左窄（Logo 那头高、中文这头收紧），像一道由右往左收拢的椭圆
    P = D.spline([(x0, y0), (x0 - 123, y0 + 5), (x0 - 263, y0 + 19), (x0 - 383, y0 + 39), (x0 - 463, y0 + 61),
                  (x0 - 507, y0 + 91), (x0 - 521, y0 + 126), (x0 - 511, y0 + 160), (x0 - 481, y0 + 186),
                  (x0 - 421, y0 + 203), (x0 - 321, y0 + 215), (x0 - 171, y0 + 228), (x0 - 40, RUN - 2), (x0 + 40, RUN),
                  (R_ - 20, RUN), (R_ + 30, RUN - 4), (R_ + 65, RUN - 24), (R_ + 80, RUN - 59),
                  (R_ + 72, RUN - 92), (R_ + 50, RUN - 108)], n=30)
    sw, sw_w = LA.swash(P, hair, 17, tail=24)
    # 花饰里沿的一串网点梯尺：贴着上沿的发丝、往里一点，从左往右由细到粗（校样边上的阶调梯尺）
    T_ = D.tangents(P)
    bead_pts = []
    for s_ in np.arange(70, 400, 17):
        p_, t_ = D.at_length(P, s_)
        nrm = np.array([t_[1], -t_[0]])                      # 往花饰里面（上沿往下）
        bead_pts.append((p_ + nrm * 10.5, 0.7 + 2.1 * (1 - (s_ - 70) / 330) ** 1.6))
    beads = union([circle(q[0], q[1], r) for q, r in bead_pts])

    # ---- 底线带：挂在花饰托底那一段发丝下面
    caps, cw = EN.caps(x0 + 8, RUN + 18)

    # ---- 主体元素：套准靶标（® 的位置）
    E = EM.target(TGT, TGT_R, hair)

    # ---- 校对红：一笔圈住 g（多绕一点、起收笔交叠）→ 引线落到右下页边 → 批注 turn 和一个转向记号
    gc = LG['g_center']
    gb = LG['g_box']
    loop_c = ((gb[0] + gb[2]) / 2 + 2, (gb[1] + gb[3]) / 2 - 2)
    wob = lambda t: 1 + 0.035 * np.sin(t * 2.3 + 0.7) + 0.02 * np.sin(t * 5.1)
    tt = np.linspace(math.radians(-150), math.radians(-150 + 385), 220)
    rx, ry, rot = (gb[2] - gb[0]) / 2 + 12, (gb[3] - gb[1]) / 2 + 8, math.radians(-7)
    red_loop = np.stack([loop_c[0] + rx * wob(tt) * np.cos(tt) * math.cos(rot) - ry * wob(tt) * np.sin(tt) * math.sin(rot),
                         loop_c[1] + rx * wob(tt) * np.cos(tt) * math.sin(rot) + ry * wob(tt) * np.sin(tt) * math.cos(rot)], 1)
    a_lead = math.radians(28)
    lead0 = np.array([loop_c[0] + rx * math.cos(a_lead), loop_c[1] + ry * math.sin(a_lead)])
    lead1 = np.array([LG['right'] - 62, RUN - 46])
    red_lead = D.spline([tuple(lead0), tuple((lead0 + lead1) / 2 + np.array([4, 6])), tuple(lead1)], n=20)
    red_note, nw = EN.hand('turn', LG['right'] - 58, RUN - 16, size=29)
    # 转向记号：一个往回绕的小弧加箭头（校对符号里“转正”的意思），写在 turn 后面
    tc = (LG['right'] - 58 + nw + 13, RUN - 29)
    red_turn = D.ellipse_pts(tc[0], tc[1], 9, 9, 0, math.radians(200), math.radians(200 + 285), 50)

    text = union(cn_all, LG['word'])
    # ---- 入场里笔走的路（logo-trace 按它一段段画出来；舞台坐标，抽稀到约 8 像素一点）
    tail = P[-1] + D.tangents(P)[-1] * 34                    # 花饰收尾的针尖比中线长一截
    SWASH.enter['paths'] = [_thin(np.vstack([P, tail[None]]))]
    nb = red_note.bounds
    tp = red_turn
    tip = tp[-1] + (tp[-1] - tp[-4]) / (np.linalg.norm(tp[-1] - tp[-4]) + 1e-9) * 7   # 转向记号的箭头尖
    RED.enter['paths'] = [_thin(red_loop), _thin(red_lead),
                          [[round(nb[0] - 2, 1), round((nb[1] + nb[3]) / 2, 1)], [round(nb[2] + 2, 1), round((nb[1] + nb[3]) / 2, 1)]],
                          _thin(np.vstack([tp, tip[None]]))]
    RED.enter['w'] = [12, 10, round(nb[3] - nb[1] + 10, 1), 12]
    G = {
        'title': T, 'cn': cn_all, 'cn_list': cn, 'logo': LG, 'text': text, 'hair': hair,
        'swash': sw, 'swash_P': P, 'beads': beads, 'caps': caps, 'emblem': E,
        'red_loop': red_loop, 'red_lead': red_lead, 'red_note': red_note, 'red_turn': red_turn,
        'star_at': LG['g_counter'], 'g_center': gc,
        'baseline': RUN + 18,
        'tag': {'x': round(cb[0] + 2), 'y': 104},
        'anchors': {'target': list(TGT), 'target_r': TGT_R, 'g': list(gc)},
        # 伸进画面的那一根：套准靶标的横准线往右接着走（registration line），接到代表画面里校样左上角的裁切线上；
        # 线宽 = 本题字的最细笔画，颜色取箔的中间调
        'geo': {'out': {'x': round(E['out_x'], 2), 'y': TGT[1], 'dx': 1, 'dy': 0, 'len': 140, 'w': round(hair, 2),
                        'rgb': '112,118,130', 'stops': [[0, 0.9], [1, 0.45]], 'z': 'front'}},
        'enter': {'geo': {'at': 0.38, 'dur': 0.34}, 'tag': {'at': 0.1, 'dur': 0.26}},
    }
    return G


def _thin(P, step=8.0):
    """折线抽稀到约 step 像素一点（入场参数写进清单，不要几百个点）"""
    P = np.asarray(P, float)
    out, acc = [P[0]], 0.0
    for a, b in zip(P[:-1], P[1:]):
        acc += float(np.linalg.norm(b - a))
        if acc >= step:
            out.append(b)
            acc = 0.0
    if np.linalg.norm(out[-1] - P[-1]) > 0.5:
        out.append(P[-1])
    return [[round(float(x), 1), round(float(y), 1)] for x, y in out]


# 入场是一张校样从上版到改样的过程（ae.js 里 logo- 开头的几种；at、dur 占整段入场的比例，片头一格 0.8 秒、介绍页 2.4 秒）：
#   校样纸放上压台、略带一点斜落平 → 套准靶标两版错位的影子合成一个（对准）→ 铅字一压，中文的墨一下子吃进纸里、压痕的影由深变浅 →
#   烫印版压下，Logo 先是一枚没上箔的素压凹痕，箔膜从左往右揭开，揭口一道亮的镭射边扫过去 → 花饰顺着笔路从 L 的衬线一笔写出去（网点梯尺随笔出现），
#   靶标的横准线伸进画面 → 底线带随后压上 → 校对员的红笔圈住装反的 g、拉出引线、写 turn、画转向记号 → g 的字腔里那颗星一闪。
#   片头一格里中文在 0.15 秒压实，Logo 在 0.3 秒基本揭完
SWASH = Layer('swash', 'line', LY.render_swash, enter={'at': 0.27, 'dur': 0.32, 'kind': 'logo-trace', 'w': 34})
RED = Layer('red', 'line', LY.render_red, enter={'at': 0.6, 'dur': 0.27, 'kind': 'logo-trace', 'lift': 0.05})
LAYERS = [
    Layer('plate', 'plate', LY.render_plate, enter={'at': 0.0, 'dur': 0.18, 'kind': 'logo-sheet'}),
    Layer('emblem', 'emblem', LY.render_emblem, enter={'at': 0.05, 'dur': 0.28, 'kind': 'logo-register', 'd': 13}),
    SWASH,
    Layer('text', 'text', LY.render_text, enter={'at': 0.15, 'dur': 0.12, 'kind': 'logo-strike'}),
    Layer('hero', 'hero', LY.render_hero, enter={'at': 0.12, 'dur': 0.28, 'kind': 'logo-foil', 'strike': 0.22}),
    Layer('en', 'en', LY.render_en, enter={'at': 0.52, 'dur': 0.1, 'kind': 'logo-strike'}),
    RED,
    Layer('glint', 'glint', LY.render_glint, enter={'at': 0.87, 'dur': 0.13, 'kind': 'flash'}),
]


def small(tok):
    """小形态：一行「二次元游戏」+ Logo（签名字，镭射箔）。中文的针尖收短；Logo 不带花饰，g 仍是反的"""
    T = LT.letters(detail='small')
    k = SL / S
    LGs = LA.logo(1000, 1000 * k, 0, 0)
    word = LGs['word'].transform(1, 0, 0, -1, 0, 0)          # 舞台（y 朝下）→ 字体单位（y 朝上）
    wb = word.bounds
    word = move(word, -wb[0] + 30, 0)
    s_logo = 0.78                                            # 签名字放大 1.42 倍后，Logo 的 L 和中文一样高一点
    word = word.transform(s_logo, 0, 0, s_logo, 0, 0)
    adv = [ADV_C] * len(T) + [(wb[2] - wb[0] + 60) * s_logo / 1000]
    return {'chars': [g.path() for g in T] + [word], 'hero': len(T), 'face': LY.small_face, 'advance': adv}

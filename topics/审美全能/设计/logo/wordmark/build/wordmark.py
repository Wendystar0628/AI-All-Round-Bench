# -*- coding: utf-8 -*-
"""
AI审美全能 · 字标「AI审美全能」生成器

字标是整个专题的总牌子，按艺术字的方法画（概念单见下面的 CONCEPT，依据《艺术字设计思路调研》第一到三节）：
  方言「铜版宋」：思源宋体 Heavy 的骨架；横收成发丝（和 AI 的发丝、衬线同粗）；横末三角改成刺形，刀尖利；
                  撇收成针尖，捺脚和钩尖都是利的；所有的点换成菱形（雕刻刀的菱形刀点）。
  高潮：「审」就是天文台——宀 是屋顶，横在子午线上断开一道观测缝，锈橙星落进缝里、星尖碰到申的长竖；
        申的长竖是平顶，正对着缝。
  呼应：宀 左点、美 的 丷、能 的点，都是同一种菱形（星的弱化形）。
  AI：Didone 的结构按同一支笔画——竖比汉字竖重一档，细腿、横、衬线都是发丝；A 是尖顶，A 的右脚衬线和 I 的左脚衬线连成一笔。

产物（都在 logo/wordmark/，视频和网站同一份）：
  wordmark.js     window.AE_WORDMARK：两种字形（display 大字、small 小字号）的矢量路径、星的位置、配色、分层图清单。
                  页面用 AE.wordmarkSVG() / AE.wordmark()（ae.js）画；片头主题页、落版直接读它。
  *.svg           矢量标志：wordmark(-ink)、wordmark-full(-ink)（带底线带英文）、wordmark-small(-ink)
  layers/*.png    分层透明图（2 倍，200px 字号的舞台坐标），每张旁边一张同名 .webp（网页用）
检查图写到 调研/审美全能/模板设计/字标/检查/。

用法（项目根目录）：python topics/审美全能/设计/logo/wordmark/build/wordmark.py
依赖：numpy、opencv-python、fonttools、skia-pathops、Pillow；几何借用题名锁定生成器的 lockupkit.geom（只读，不改它）。
"""
import json
import math
import os
import sys

import numpy as np
import pathops
from fontTools.svgLib.path import parse_path
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
WM = os.path.dirname(HERE)                                   # logo/wordmark/
DESIGN = os.path.normpath(os.path.join(WM, '..', '..'))      # topics/审美全能/设计/
ROOT = os.path.normpath(os.path.join(DESIGN, '..', '..', '..'))
FONTS = os.path.join(DESIGN, 'fonts')
CHECKS = os.path.join(ROOT, '调研', '审美全能', '模板设计', '字标', '检查')
sys.path.insert(0, os.path.join(DESIGN, 'logo', 'lockups', 'build'))
from lockupkit import geom                                    # noqa: E402
from lockupkit.geom import Path, diff, poly, rect, union      # noqa: E402

CONCEPT = {
    '题名': 'AI审美全能（专题总牌子；十个题名锁定的统领）',
    '一句话概念': '一张铜版星图的图题：AI 和四个宋字出自同一把雕刻刀；「审」是一座天文台，屋顶开着观测缝，今夜那颗锈橙星正过子午线，落进缝里。',
    '气质词': ['稳', '精', '夜里的暖'],
    '物件': '天文台屋顶的观测缝和缝里的星',
    '动作': '静：横平竖直，不倾斜，星落在子午线上（中天）',
    '同源媒介': '十八、十九世纪的铜版雕刻星图与图题（Didone 本身就从铜版雕刻里长出来）',
    '方言': '铜版宋：思源宋体 Heavy 骨架；横收成发丝，和 AI 的发丝、衬线同粗；横末三角改刺形、刀尖利；撇收针尖，捺脚、钩尖利；点一律是菱形刀点',
    '骨架': '字面率满、重心居中、中宫略收；五字等高，一行排开，字距 0；AI 和汉字之间 0.08em',
    '母题落点': {
        '高潮': '「审」：宀 本来就是屋顶——横在申的长竖中线（子午线）上断开一道观测缝，锈橙切面星落进缝里、星尖碰到申的平顶；顶上的点和星同构',
        '呼应': '宀 左点、美 的 丷、能 的点都换成同一种菱形，是星的弱化形（雕刻刀的菱形刀点）',
    },
    '主体元素': '锈橙星兼任（像 1999 SHINING 的月牙 S）：它顶出整块剪影唯一的突起；标题卡上另有吊星在正上方',
    '英文分工': 'AI 是名字的一部分，浅金 Didone 大写、和汉字共帽线与底线；AI AESTHETICS 是底线带：拉开字距的小号大写，上面一根两端渐隐的发丝线',
    '颜色角色': {
        '字面': '纸白 #EDE5D8（纸上是墨 #2B2723），平的、干净',
        '共用金属': '浅金 #E4D2A0 给 AI（纸上 #7A5A2C），黄铜给底线带的发丝',
        '点缀': '锈橙 #C25E30 只在星上，八个切面、一圈窄暖晕；全系列唯一的常量',
        '底板': '不要：夜本身就是底',
    },
    '检查': '去色、只剩字（拿掉星和英文）、缩到页眉页脚的字号、白底、黑底',
}

# ================================================================= 笔

HAIR = 18          # 发丝：汉字的横、AI 的细腿、横和衬线
STEM_L = 168       # 拉丁大写的竖（汉字竖约 145–150，拉丁字母字面空，重一档灰度才相当）
MERIDIAN = 496.5   # 「审」申的长竖中线
SLIT = 52          # 观测缝的宽：大字号上看得出断开，星尖从缝中间穿过
CAP_B, CAP_T = -40, 858   # AI 的底线、帽线：对齐汉字的底横和字面顶
GAP = 80           # AI 和汉字之间 0.08em
SMALL_GROW = 9     # 小字号：整字向外长 9 单位（发丝 36），观测缝不开

STAR = {'display': {'x': MERIDIAN, 'y': 816, 'w': 236, 'h': 304},   # 下尖穿过观测缝，碰到申的平顶（y 664）
        'small': {'x': MERIDIAN, 'y': 842, 'w': 300, 'h': 360}}
# 小字号形态在 20px 以下星再放大：每小 1px 大 6%，最多 1.4 倍，下尖不动（星只往上长）
STAR_BOOST = {'below': 20, 'per': 0.06, 'max': 1.4}

COLORS = {
    'dark': {'cn': '#EDE5D8', 'ai': '#E4D2A0', 'star': '#C25E30', 'halo': '#F2A877', 'hair': 'rgba(233,220,205,.6)', 'en': '#BBA893', 'ground': '#0D1420'},
    'ink': {'cn': '#2B2723', 'ai': '#7A5A2C', 'star': '#A64A26', 'halo': None, 'hair': 'rgba(43,39,35,.5)', 'en': '#6E6860', 'ground': '#EFE5D2'},
}


def f1(v):
    s = '%.1f' % v
    return s[:-2] if s.endswith('.0') else s


def pt(p):
    return f1(p[0]) + ' ' + f1(p[1])


def P(d):
    p = Path()
    parse_path(d, p.getPen())
    return union(p)


def thorn(tip, apex, base, k=0.10):
    """横末三角：刀尖 → 微凹的一边 → 顶 → 直下到横的上沿。返回从刀尖开始的命令串"""
    mx, my = (tip[0] + apex[0]) / 2, (tip[1] + apex[1]) / 2
    dx, dy = apex[0] - tip[0], apex[1] - tip[1]
    L = math.hypot(dx, dy)
    c = (mx + dy / L * L * k, my - dx / L * L * k)
    return 'L%s Q%s %s L%s' % (pt(tip), pt(c), pt(apex), pt(base))


def lozenge(t0, t1, w, t=0.42):
    """菱形点：从起笔尖到收笔尖，最宽处在 t"""
    (x0, y0), (x1, y1) = t0, t1
    dx, dy = x1 - x0, y1 - y0
    L = math.hypot(dx, dy)
    nx, ny = -dy / L, dx / L
    mx, my = x0 + dx * t, y0 + dy * t
    return poly([(x0, y0), (mx + nx * w / 2, my + ny * w / 2), (x1, y1), (mx - nx * w / 2, my - ny * w / 2)])


# ================================================================= 汉字（字体单位：1000 em，y 朝上，基线 0）
# 轮廓取自思源宋体 Heavy，逐段改成本方言；「审」整字按原字的比例重画。

def shen(slit=True):
    """审 = 天文台：宀 是屋顶，横在子午线上断开观测缝；日 是一间屋，申 的长竖平顶对着缝"""
    y0, y1 = 692, 710
    T, M, B = (511, 529), (342, 360), (165, 183)
    parts = [
        lozenge((178, 756), (68, 584), 96, 0.40),                    # 宀 左点（比原来的泪滴短，挂在横的左端）
        rect(166, y0, 842, y1),                                      # 宀 的横
        P('M808 %d L873 786 Q 940 712 998 668 Q 900 600 812 546 Q 842 612 842 %d L808 %d Z' % (y1, y0, y0)),   # 横钩：刺形角、下钩
        P('M159 590 L297 537 L297 125 C297 111 237 80 179 80 L159 80 Z'),                           # 日 左竖
        P('M676 %d L744 604 L846 522 Q 836 512 830 500 L830 144 C829 135 761 105 712 105 L688 105 L688 %d Z' % (T[1], T[1])),  # 日 右竖与肩
        P('M424 664 L569 664 L569 -52 C569 -64 506 -95 451 -95 L424 -95 Z'),                       # 申 的长竖，平顶
    ]
    parts += [rect(290, a, 700, b) for a, b in (T, M, B)]
    g = union(*parts)
    if slit:
        g = diff(g, rect(MERIDIAN - SLIT / 2, y0 - 8, MERIDIAN + SLIT / 2, y1 + 8))
    return g


def mei():
    a, b, c, d, e, g, h, i = 658, 676, 517, 535, 368, 386, 198, 216
    s0 = ('M561 %d L90 %d L95 %d L413 %d L413 %d L154 %d L157 %d L413 %d L413 %d L60 %d L65 %d ' % (b, b, a, a, d, d, c, c, g, g, e) +
          thorn((962, e), (819, 488), (745, g)) + ' L563 %d L563 %d ' % (g, c) +
          thorn((878, c), (743, 624), (675, d)) + ' L563 %d L563 %d ' % (d, a) +
          thorn((946, a), (805, 772), (733, b)) + ' Z')
    s1 = ('M395 348 C394 302 391 260 384 %d L38 %d L43 %d L378 %d C350 85 268 -7 4 -94 C409 -44 506 53 541 %d '
          'L547 %d C604 23 716 -47 882 -94 C895 -24 929 24 997 49 C817 61 648 88 567 %d ' % (i, i, h, h, h, h, h) +
          thorn((981, h), (835, 316), (760, i)) + ' L547 %d C552 248 556 277 559 307 C582 310 593 320 594 335 Z' % i)
    return union(P(s0 + ' ' + s1), lozenge((246, 852), (452, 694), 136), lozenge((798, 846), (604, 690), 122))


def quan():
    s0 = ('M64 -36 L69 -54 ' + thorn((974, -54), (829, 66), (754, -36)) + ' L574 -36 L574 193 ' +
          thorn((883, 193), (742, 306), (670, 211)) + ' L574 211 L574 410 ' +
          thorn((809, 410), (676, 518), (609, 428)) + ' L209 428 L214 410 L421 410 L421 211 L172 211 L177 193 L421 193 L421 -36 Z')
    s1 = ('M550 760 C605 587 733 477 874 399 C884 457 925 527 998 555 C851 593 657 648 565 772 '
          'C602 776 616 782 620 797 L402 854 C365 707 187 487 2 360 C225 436 448 597 550 760 Z')
    return P(s0 + ' ' + s1)


def neng():
    s0 = ('M218 -50 L218 183 L335 183 L335 77 C335 66 332 60 318 60 L222 57 C276 44 291 28 302 7 C312 -14 316 -46 317 -91 '
          'C456 -79 475 -28 475 62 L475 423 C496 426 508 436 515 444 L386 542 L325 468 L223 468 L101 522 '
          'C223 557 325 591 410 632 L123 640 C201 675 289 730 343 779 C363 778 373 786 377 796 L196 859 '
          'C176 799 101 684 47 654 C35 648 14 643 14 643 L72 503 C77 505 82 509 87 513 L87 -94 L107 -94 C164 -94 218 -64 218 -50 Z')
    s1 = ('M728 362 L553 376 L553 44 C553 -47 576 -72 686 -72 L772 -72 C925 -72 977 -47 977 10 C977 35 968 51 933 67 '
          'L922 196 C899 126 881 86 869 71 C862 62 854 60 842 59 C831 58 810 58 790 58 L723 58 C701 58 696 63 696 77 '
          'L696 179 ' + thorn((976, 240), (821, 351), (812, 340), k=0.06) + ' C794 315 744 264 696 221 L696 336 C718 339 727 349 728 362 Z')
    s2 = ('M721 824 L547 838 L547 514 C547 424 569 400 676 400 L760 400 C909 400 960 425 960 481 C960 506 951 522 917 537 '
          'L906 656 C884 591 866 555 855 541 C848 532 839 530 828 530 C817 529 797 529 778 529 L715 529 C693 529 689 533 689 547 '
          'L689 642 ' + thorn((966, 691), (820, 801), (811, 790), k=0.06) + ' C792 767 739 717 689 676 L689 798 C710 802 719 811 721 824 Z')
    holes = 'M335 201 L218 201 L218 312 L335 312 Z M335 450 L335 350 L218 350 L218 450 Z'
    return union(P(' '.join([s0, s1, s2, holes])), lozenge((338, 754), (550, 528), 146))


# ================================================================= AI：Didone 的结构，同一支笔

def _x_at(p, q, y):
    return p[0] + (q[0] - p[0]) * (y - p[1]) / (q[1] - p[1])


def _band(p, q, w, side):
    dx, dy = q[0] - p[0], q[1] - p[1]
    L = math.hypot(dx, dy)
    nx, ny = (-dy / L, dx / L) if side > 0 else (dy / L, -dx / L)
    a, b = (p[0] - dx * 3, p[1] - dy * 3), (q[0] + dx * 3, q[1] + dy * 3)
    return poly([a, b, (b[0] + nx * w, b[1] + ny * w), (a[0] + nx * w, a[1] + ny * w)])


def letter_A(x):
    yb, ft = CAP_B, CAP_B + HAIR
    apex = (x + 430, CAP_T + 16)               # 尖顶，略出帽线：和「全」的人字顶、星尖同族
    fo, tf = (x + 790, ft), (x + 80, ft)       # 粗腿外缘、细腿外缘的落脚
    body = union(_band(apex, fo, STEM_L, -1), _band(apex, tf, HAIR + 2, +1),
                 rect(x - 200, yb + 0.28 * (CAP_T - CAP_B), x + 1200, yb + 0.28 * (CAP_T - CAP_B) + HAIR))
    body = geom.inter(body, poly([apex, (_x_at(apex, tf, yb), yb), (_x_at(apex, fo, yb), yb)]))
    tx = _x_at(apex, tf, ft) + 6
    return union(body, rect(tx - 100, yb, tx + 104, ft), rect(x + 538, yb, x + 872, ft)), x + 872


def letter_I(x):
    wing = 100
    s0 = x + wing
    g = union(rect(s0, CAP_B, s0 + STEM_L, CAP_T), rect(x, CAP_B, s0 + STEM_L + wing, CAP_B + HAIR),
              rect(x, CAP_T - HAIR, s0 + STEM_L + wing, CAP_T))
    return g, s0 + STEM_L + wing


def ai():
    a, xa = letter_A(0)
    i, xi = letter_I(xa)                       # 脚衬线连成一笔
    return union(a, i), xi


# ================================================================= 排一行

def grow(p, r):
    s = Path(p)
    s.stroke(2 * r, pathops.LineCap.BUTT_CAP, pathops.LineJoin.MITER_JOIN, 3)
    return union(p, s)


def build(form):
    """返回 {'w', 'glyphs': [(ch, role, path, x)], 'star'}（字体单位）"""
    small = form == 'small'
    a, w_ai = ai()
    cn = {'审': shen(slit=not small), '美': mei(), '全': quan(), '能': neng()}
    glyphs, x = [('AI', 'ai', a, 0.0)], w_ai + GAP
    for ch in '审美全能':
        glyphs.append((ch, 'cn', cn[ch], x))
        x += 1000
    if small:
        glyphs = [(c, r, grow(g, SMALL_GROW), gx) for c, r, g, gx in glyphs]
    sx = [gx for c, r, g, gx in glyphs if c == '审'][0]
    st = dict(STAR[form])
    st['x'] = round(sx + st['x'], 1)
    return {'w': round(x, 1), 'glyphs': glyphs, 'star': st, 'boost': STAR_BOOST if small else None}


def path_d(p):
    out = []
    for verb, pts in p:
        v = int(verb)
        if v == 0:
            out.append('M' + pt(pts[0]))
        elif v == 1:
            out.append('L' + pt(pts[0]))
        elif v == 2:
            out.append('Q' + ' '.join(pt(q) for q in pts))
        elif v == 4:
            out.append('C' + ' '.join(pt(q) for q in pts))
        elif v == 5:
            out.append('Z')
    return ''.join(out)


# ================================================================= 星：八个切面，左上受光（和 ae.js 的 AE.facetStar 同一个算法）

def hexrgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def mixhex(a, b, t):
    A, B = hexrgb(a), hexrgb(b)
    return '#' + ''.join('%02x' % int(round(A[i] + (B[i] - A[i]) * t)) for i in range(3))


FACET_TONES = [0.42, 0.18, 0, -0.32, -0.22, 0, -0.08, 0.3]


def facets(cx, cy, w, h, color, k=0.22):
    """屏幕坐标（y 朝下）。返回 [(三点, 颜色)]，顺序：上左、上右、右上、右下、下右、下左、左下、左上"""
    rx, ry = w / 2, h / 2
    T, R, B, L = (cx, cy - ry), (cx + rx, cy), (cx, cy + ry), (cx - rx, cy)
    q = lambda sx, sy: (cx + sx * rx * k, cy + sy * ry * k)
    tr, br, bl, tl = q(1, -1), q(1, 1), q(-1, 1), q(-1, -1)
    tris = [(T, tl), (T, tr), (R, tr), (R, br), (B, br), (B, bl), (L, bl), (L, tl)]
    return [((a, b, (cx, cy)), mixhex(color, '#FFE9D2', t) if t >= 0 else mixhex(color, '#1A0E08', -t)) for (a, b), t in zip(tris, FACET_TONES)]


# ================================================================= 矢量标志

D_UPM = 1000
D_CAPS = os.path.join(FONTS, 'LibreBodoni-Variable.ttf')
EN_TEXT, EN_TRACK = 'AI AESTHETICS', 0.62


def en_line(size):
    """AI AESTHETICS：Libre Bodoni wght 500，拉开 0.62em。返回（舞台坐标、基线 y=0 的轮廓，宽）"""
    return geom.text_path(D_CAPS, EN_TEXT, size, 0, 0, tracking=EN_TRACK, location={'wght': 500})


def svg_doc(F, theme, size, full=False, title='AI审美全能'):
    C = COLORS[theme]
    s = size / 1000.0
    base = 880 * s
    st = F['star']
    top = max(0.0, (st['y'] + st['h'] / 2) * s - base) + 4          # 星尖高出字身，留出来
    W = F['w'] * s
    body = ''.join('<path transform="translate(%s 0)" fill="%s" d="%s"/>' % (f1(gx), C['ai'] if role == 'ai' else C['cn'], path_d(g))
                   for ch, role, g, gx in F['glyphs'])
    defs, extra = '', ''
    cx, cy, sw, sh = st['x'] * s, base - st['y'] * s, st['w'] * s, st['h'] * s
    if C['halo']:
        defs += ('<radialGradient id="halo"><stop offset="0" stop-color="%s" stop-opacity=".38"/><stop offset=".45" stop-color="#E08A58" stop-opacity=".10"/>'
                 '<stop offset="1" stop-color="#E08A58" stop-opacity="0"/></radialGradient>' % C['halo'])
        extra += '<circle cx="%s" cy="%s" r="%s" fill="url(#halo)"/>' % (f1(cx), f1(cy), f1(sh * 0.62))
    extra += ''.join('<path d="M%s L%s L%sZ" fill="%s"/>' % (pt(a), pt(b), pt(c), col) for (a, b, c), col in facets(cx, cy, sw, sh, C['star']))
    H = top + base + 0.14 * size
    tail = ''
    if full:
        en_size = 0.17 * size
        en, en_w = en_line(en_size)
        hair_y = top + base + 0.30 * size
        en_base = hair_y + 0.15 * size + en_size * 0.75
        hw = 0.28 * W
        defs += ('<linearGradient id="hair" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="{0}" stop-opacity="0"/>'
                 '<stop offset=".5" stop-color="{0}"/><stop offset="1" stop-color="{0}" stop-opacity="0"/></linearGradient>').format(C['hair'])
        tail = ('<rect x="%s" y="%s" width="%s" height="%s" fill="url(#hair)"/>' % (f1(W / 2 - hw / 2), f1(hair_y), f1(hw), f1(max(1.0, HAIR * s))) +
                '<path transform="translate(%s %s)" fill="%s" d="%s"/>' % (f1((W - en_w) / 2), f1(en_base), C['en'], path_d(en)))
        H = en_base + en_size * 0.3
    W2, H2 = math.ceil(W + 2), math.ceil(H)
    return '\n'.join([
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" height="%d">' % (W2, H2, W2, H2),
        '<title>%s</title>' % title,
        '<defs>%s</defs>' % defs if defs else '',
        '<g transform="translate(1 %s)">' % f1(top),
        '<g transform="translate(0 %s) scale(%s %s)">%s</g>' % (f1(base), '%.5f' % s, '%.5f' % -s, body),
        extra, '</g>', tail, '</svg>', ''])


# ================================================================= 分层透明图

SIZE = 200      # 分层图按 200px 字号的舞台坐标出，2 倍图
SCALE = 2


class Board:
    """字标的舞台框：x 从 0 到 w，y 从字身框顶（0）往下；星和英文可以越出框"""

    def __init__(self, F, full=True):
        self.s = SIZE / 1000.0
        self.base = 880 * self.s
        self.w = math.ceil(F['w'] * self.s + 2)
        self.h = math.ceil(self.base + 0.14 * SIZE)
        st = F['star']
        self.top = -math.ceil(max(0.0, (st['y'] + st['h'] / 2) * self.s - self.base) + 8)
        self.bottom = math.ceil(self.base + (0.66 * SIZE if full else 0.14 * SIZE))
        self.left, self.right = -4, self.w + 4
        self.W, self.H = (self.right - self.left) * SCALE, (self.bottom - self.top) * SCALE

    def M(self, gx=0.0):
        """字体单位 → 图上像素"""
        k = self.s * SCALE
        return (k, 0, 0, -k, (gx * self.s - self.left) * SCALE, (self.base - self.top) * SCALE)

    def stageM(self):
        return (SCALE, 0, 0, SCALE, -self.left * SCALE, -self.top * SCALE)

    def raster(self, p, M):
        return geom.raster(p, self.W, self.H, M, ss=3)


def rgba_layer(mask, color, alpha=1.0):
    r, g, b = hexrgb(color)
    a = np.clip(mask * alpha, 0, 1)
    out = np.zeros(mask.shape + (4,), np.float32)
    out[..., 0], out[..., 1], out[..., 2], out[..., 3] = r * a, g * a, b * a, a * 255
    return out          # 预乘


def over(dst, src):
    a = src[..., 3:4] / 255.0
    return src + dst * (1 - a)


def to_image(pm):
    a = pm[..., 3:4]
    rgb = np.where(a > 0, pm[..., :3] / np.maximum(a / 255.0, 1e-6), 0)
    return Image.fromarray(np.clip(np.concatenate([rgb, a], -1), 0, 255).astype(np.uint8), 'RGBA')


def halo_layer(bd, cx, cy, r, color):
    yy, xx = np.mgrid[0:bd.H, 0:bd.W].astype(np.float32)
    px, py = (cx - bd.left) * SCALE, (cy - bd.top) * SCALE
    d = np.hypot(xx - px, yy - py) / (r * SCALE)
    # 和 SVG 的径向渐变一样：0 处 .38，.45 处 .10，1 处 0
    a = np.interp(d, [0, 0.45, 1.0], [0.38, 0.10, 0.0]).astype(np.float32)
    c0, c1 = np.array(hexrgb(color), np.float32), np.array(hexrgb('#E08A58'), np.float32)
    t = np.clip(d / 0.45, 0, 1)[..., None]
    rgb = c0 * (1 - t) + c1 * t
    out = np.zeros((bd.H, bd.W, 4), np.float32)
    out[..., :3] = rgb * a[..., None]
    out[..., 3] = a * 255
    return out


def star_layer(bd, F, color):
    st, s = F['star'], bd.s
    cx, cy, w, h = st['x'] * s, bd.base - st['y'] * s, st['w'] * s, st['h'] * s
    out = np.zeros((bd.H, bd.W, 4), np.float32)
    for tri, col in facets(cx, cy, w, h, color):
        out = over(out, rgba_layer(bd.raster(poly(tri), bd.stageM()), col))
    return out, (cx, cy, h)


def en_layer(bd, F, C):
    s = bd.s
    W = F['w'] * s
    en_size = 0.17 * SIZE
    en, en_w = en_line(en_size)
    hair_y = bd.base + 0.30 * SIZE
    en_base = hair_y + 0.15 * SIZE + en_size * 0.75
    hw = 0.28 * W
    out = rgba_layer(bd.raster(geom.move(en, (W - en_w) / 2, en_base), bd.stageM()), C['en'])
    # 发丝线：两端渐隐
    hm = bd.raster(rect(W / 2 - hw / 2, hair_y, W / 2 + hw / 2, hair_y + max(1.0, HAIR * s)), bd.stageM())
    xx = (np.arange(bd.W) / SCALE + bd.left - W / 2) / (hw / 2)
    fade = np.clip(1 - np.abs(xx), 0, 1)[None, :]
    col = C['hair']
    rgb = '#%02x%02x%02x' % tuple(int(v) for v in col[col.index('(') + 1:col.index(')')].split(',')[:3])
    alpha = float(col[col.index(')') - 3:col.index(')')].split(',')[-1]) if col.startswith('rgba') else 1.0
    return over(rgba_layer(hm * fade, rgb, alpha), out)


def trim(pm, bd, pad=2):
    a = pm[..., 3]
    ys, xs = np.nonzero(a > 0.5)
    if not len(xs):
        return None
    x0, x1 = max(0, xs.min() - pad), min(bd.W, xs.max() + 1 + pad)
    y0, y1 = max(0, ys.min() - pad), min(bd.H, ys.max() + 1 + pad)
    x0, y0 = x0 - x0 % SCALE, y0 - y0 % SCALE
    x1, y1 = min(bd.W, x1 + (-x1) % SCALE), min(bd.H, y1 + (-y1) % SCALE)
    return pm[y0:y1, x0:x1], (bd.left + x0 / SCALE, bd.top + y0 / SCALE, (x1 - x0) / SCALE, (y1 - y0) / SCALE)


def save_layer(pm, bd, name, role, out_dir):
    t = trim(pm, bd)
    if t is None:
        return None
    crop, (x, y, w, h) = t
    im = to_image(crop)
    png = os.path.join(out_dir, name + '.png')
    im.save(png, optimize=True)
    im.save(os.path.join(out_dir, name + '.webp'), quality=90, method=6, alpha_quality=100)
    return {'id': name, 'role': role, 'file': 'layers/' + name + '.png', 'x': round(x, 1), 'y': round(y, 1), 'w': round(w, 1), 'h': round(h, 1)}


def layers(F, theme, out_dir, prefix=''):
    """分层：halo（暖晕，暗底才有）→ ai → cn → star → en。返回（清单，各层预乘图）"""
    C = COLORS[theme]
    bd = Board(F)
    made, ims = [], {}
    sfx = '' if theme == 'dark' else '-ink'
    st_pm, (cx, cy, h) = star_layer(bd, F, C['star'])
    if C['halo']:
        ims['halo'] = halo_layer(bd, cx, cy, h * 0.62, C['halo'])
    for role in ('ai', 'cn'):
        m = np.zeros((bd.H, bd.W), np.float32)
        for ch, r, g, gx in F['glyphs']:
            if r == role:
                m = np.maximum(m, bd.raster(g, bd.M(gx)))
        ims[role] = rgba_layer(m, C[role])
    ims['star'] = st_pm
    ims['en'] = en_layer(bd, F, C)
    roles = {'halo': 'glint', 'ai': 'text', 'cn': 'text', 'star': 'glint', 'en': 'en'}
    for k in ('halo', 'ai', 'cn', 'star', 'en'):
        if k in ims:
            it = save_layer(ims[k], bd, prefix + k + sfx, roles[k], out_dir)
            if it:
                made.append(it)
    return made, ims, bd


def flat(F, theme, out_dir, name):
    """小字号：一张图（字 + 星），透明底"""
    C = COLORS[theme]
    bd = Board(F, full=False)
    pm = np.zeros((bd.H, bd.W, 4), np.float32)
    for ch, r, g, gx in F['glyphs']:
        pm = over(pm, rgba_layer(bd.raster(g, bd.M(gx)), C['ai'] if r == 'ai' else C['cn']))
    pm = over(pm, star_layer(bd, F, C['star'])[0])
    return save_layer(pm, bd, name, 'text', out_dir), pm, bd


# ================================================================= 检查图

def font_cn(size):
    return ImageFont.truetype(os.path.join(FONTS, 'SourceHanSerifCN-Medium.otf'), size)


def composite(ims, order, bg, H, W):
    out = np.zeros((H, W, 3), np.float32) + np.array(hexrgb(bg), np.float32)
    for k in order:
        if k in ims:
            pm = ims[k]
            a = pm[..., 3:4] / 255.0
            out = pm[..., :3] + out * (1 - a)
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), 'RGB')


def label(im, text, color):
    d = ImageDraw.Draw(im)
    d.text((24, 16), text, font=font_cn(26), fill=color)
    return im


def checks(D, S):
    os.makedirs(CHECKS, exist_ok=True)
    tmp = os.path.join(HERE, '_tmp')
    os.makedirs(tmp, exist_ok=True)
    _, dk, bd = layers(D, 'dark', tmp)
    _, ik, _ = layers(D, 'ink', tmp)
    H, W = bd.H, bd.W
    all_k = ('halo', 'ai', 'cn', 'star', 'en')
    night, paper = COLORS['dark']['ground'], COLORS['ink']['ground']
    panels = []
    finished = composite(dk, all_k, night, H, W)
    finished.save(os.path.join(CHECKS, '成品.png'))
    panels.append(label(finished.copy(), '成品 · 暗底', '#8F877C'))
    gray = finished.convert('L').convert('RGB')
    panels.append(label(gray, '去色', '#8F877C'))
    bw = Image.fromarray(np.where(np.asarray(composite(dk, ('ai', 'cn', 'star'), '#000000', H, W).convert('L')) > 60, 255, 0).astype(np.uint8)).convert('RGB')
    panels.append(label(bw, '黑白', '#888888'))
    panels.append(label(composite(dk, ('ai', 'cn'), night, H, W), '只剩字（拿掉星、暖晕和英文）', '#8F877C'))
    panels.append(label(composite(ik, all_k, paper, H, W), '纸面 · 墨', '#6E6860'))
    panels.append(label(composite(ik, all_k, '#FFFFFF', H, W), '白底', '#6E6860'))
    panels.append(label(composite(dk, all_k, '#000000', H, W), '黑底', '#8F877C'))
    sheet = Image.new('RGB', (W, H * len(panels)), '#000')
    for i, p in enumerate(panels):
        sheet.paste(p, (0, i * H))
    sheet.save(os.path.join(CHECKS, '检查图.png'))
    # 缩小：页眉、页脚、片中页眉的字号（小字号字形），和大字形同号对照
    rows = []
    for theme in ('dark', 'ink'):
        bg = COLORS[theme]['ground']
        cells = []
        for px in (64, 40, 28, 22, 18, 14):
            for F, tag in ((D, '大'), (S, '小')):
                if tag == '大' and px < 28:
                    continue
                cells.append((render_flat(F, theme, px), '%s %dpx' % (tag, px)))
        row = Image.new('RGB', (sum(im.size[0] + 30 for im, _ in cells) + 20, 150), bg)
        d = ImageDraw.Draw(row)
        x = 20
        for im, tag in cells:
            row.paste(im, (x, 30), im)
            d.text((x, 112), tag, font=font_cn(16), fill='#8F877C' if theme == 'dark' else '#6E6860')
            x += im.size[0] + 30
        rows.append(row)
    small = Image.new('RGB', (max(r.size[0] for r in rows), 300))
    small.paste(rows[0], (0, 0))
    small.paste(rows[1], (0, 150))
    small.save(os.path.join(CHECKS, '缩小.png'))
    # 分层：每层铺在棋盘格上
    order = [k for k in all_k if k in dk]
    cell = 24
    yy, xx = np.mgrid[0:H, 0:W]
    board = np.where(((yy // cell) + (xx // cell)) % 2 == 0, 58, 44).astype(np.float32)[..., None].repeat(3, -1)
    lay = Image.new('RGB', (W, H * len(order)))
    for i, k in enumerate(order):
        pm = dk[k]
        a = pm[..., 3:4] / 255.0
        im = Image.fromarray(np.clip(pm[..., :3] + board * (1 - a), 0, 255).astype(np.uint8))
        lay.paste(label(im, '%d · %s' % (i + 1, k), '#BBBBBB'), (0, i * H))
    lay.save(os.path.join(CHECKS, '分层.png'))
    for fn in os.listdir(tmp):
        os.remove(os.path.join(tmp, fn))
    os.rmdir(tmp)
    with open(os.path.join(CHECKS, '概念单.json'), 'w', encoding='utf-8', newline='\n') as f:
        json.dump(CONCEPT, f, ensure_ascii=False, indent=2)


def star_at(F, px):
    """字号 px 时星的中心和宽高（字体单位）：小字号形态在 STAR_BOOST['below'] px 以下按下尖不动放大（和 ae.js 的 AE.wordmarkSVG 同一条规则）"""
    st = dict(F['star'])
    b = F.get('boost')
    if b and px < b['below']:
        k = min(b['max'], 1 + (b['below'] - px) * b['per'])
        foot = st['y'] - st['h'] / 2
        st['w'], st['h'] = st['w'] * k, st['h'] * k
        st['y'] = foot + st['h'] / 2
    return st


def render_flat(F, theme, px):
    """按字号 px 出一张小图（字 + 星，暗底带暖晕），RGBA"""
    C = COLORS[theme]
    s = px / 1000.0
    st = star_at(F, px)
    top = max(0.0, (st['y'] + st['h'] / 2) * s - 880 * s) + 2
    W, H = math.ceil(F['w'] * s + 4), math.ceil(top + 880 * s + 0.16 * px)
    out = np.zeros((H, W, 4), np.float32)
    M = lambda gx: (s, 0, 0, -s, gx * s + 2, top + 880 * s)
    for ch, r, g, gx in F['glyphs']:
        out = over(out, rgba_layer(geom.raster(g, W, H, M(gx), ss=4), C['ai'] if r == 'ai' else C['cn']))
    cx, cy = st['x'] * s + 2, top + (880 - st['y']) * s
    for tri, col in facets(cx, cy, st['w'] * s, st['h'] * s, C['star']):
        out = over(out, rgba_layer(geom.raster(poly(tri), W, H, (1, 0, 0, 1, 0, 0), ss=4), col))
    return to_image(out)


# ================================================================= 清单

def form_json(F):
    out = {'w': F['w'], 'glyphs': [{'ch': ch, 'role': role, 'x': round(gx, 1), 'd': path_d(g)} for ch, role, g, gx in F['glyphs']],
           'star': F['star']}
    if F.get('boost'):
        out['starBoost'] = F['boost']
    return out


def main():
    D, S = build('display'), build('small')
    out_layers = os.path.join(WM, 'layers')
    os.makedirs(out_layers, exist_ok=True)
    keep = set()
    lay_dark, _, bd = layers(D, 'dark', out_layers)
    lay_ink, _, _ = layers(D, 'ink', out_layers)
    sm_dark = flat(S, 'dark', out_layers, 'small')[0]
    sm_ink = flat(S, 'ink', out_layers, 'small-ink')[0]
    for it in lay_dark + lay_ink + [sm_dark, sm_ink]:
        keep.add(os.path.basename(it['file']))
        keep.add(os.path.basename(it['file'])[:-4] + '.webp')
    for fn in os.listdir(out_layers):          # 多出来的旧图删掉
        if fn not in keep:
            os.remove(os.path.join(out_layers, fn))
    # 矢量
    for name, F, theme, full in (('wordmark', D, 'dark', False), ('wordmark-ink', D, 'ink', False),
                                 ('wordmark-full', D, 'dark', True), ('wordmark-full-ink', D, 'ink', True),
                                 ('wordmark-small', S, 'dark', False), ('wordmark-small-ink', S, 'ink', False)):
        with open(os.path.join(WM, name + '.svg'), 'w', encoding='utf-8', newline='\n') as f:
            f.write(svg_doc(F, theme, 200 if not name.startswith('wordmark-small') else 48, full=full,
                            title='AI审美全能 · AI AESTHETICS' if full else 'AI审美全能'))
    data = {
        'upm': 1000, 'ascent': 880, 'text': 'AI审美全能',
        'colors': {k: {kk: vv for kk, vv in v.items() if kk != 'ground'} for k, v in COLORS.items()},
        'forms': {'display': form_json(D), 'small': form_json(S)},
        'raster': {'scale': SCALE, 'size': SIZE, 'box': {'w': bd.w, 'h': bd.h}, 'dark': lay_dark, 'ink': lay_ink,
                   'small': sm_dark, 'smallInk': sm_ink},
    }
    js = ('/* 由 build/wordmark.py 生成，不要手改。字标「AI审美全能」：用法见 设计系统.md「字标」；页面用 AE.wordmarkSVG() / AE.wordmark()（ae.js）。\n'
          '   forms：display 大字（≥48px）、small 小字号（页眉、页脚、片中页眉）。字形坐标：1000 单位、y 向上、基线为 0；'
          'glyphs 的 role：ai 浅金、cn 纸白（纸面上换 ink 那一套颜色）；star 是「审」上那颗锈橙星的中心和宽高；\n'
          '   small 的 starBoost：字号低于 below px 时星按下尖不动放大，每小 1px 大 per，最多 max 倍。\n'
          '   raster：分层透明图（2 倍，200px 字号的舞台坐标，x、y 相对字身框左上，星和英文可以越出框），每张旁边一张同名 .webp。 */\n'
          'window.AE_WORDMARK = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')
    with open(os.path.join(WM, 'wordmark.js'), 'w', encoding='utf-8', newline='\n') as f:
        f.write(js)
    checks(D, S)
    print('display w', D['w'], 'small w', S['w'], 'star', D['star'])
    print('layers', [it['id'] for it in lay_dark + lay_ink], 'small', sm_dark['id'], sm_ink['id'])
    print('wordmark.js', len(js) // 1024, 'KB')


if __name__ == '__main__':
    main()

"""演示：用一个中性的字「永」（永字八法：侧勒努趯策掠啄磔都在里面）和一个中性的英文词，把底座的整条管道走一遍。

    python 素材\\字形底座\\examples\\demo.py [输出目录]        输出目录默认是 examples\\out\\

出的文件：
  01_坐标底图_永.png    字体单位网格 + 轮廓序号（标笔画时对着读坐标）
  02_笔画标注_永.png    标注核对：每笔一色、中线和收笔箭头、红色是没盖到的碎块
  03_对照.png           原字 → 骨架变换 → 改完（点换成几何形、由中线重画一笔、延伸成线）
  layers\\01_….png      同尺寸的透明分层
  final.png             合成（透明底）
  mono.png              黑白稿
  检查图.png             去色 · 两档黑白 · 只留字 · 高 64 像素 · 白底 · 黑底
  分层.png               分层展开图
  logo.svg              矢量路径（网页用）
这里的形状、颜色和参数只为把机制走通，不是任何设计建议。
"""
import os
import sys
import time
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))          # 字形底座\，里面是 glyphbase\
sys.stdout.reconfigure(errors='replace')

from glyphbase import Font, find_fonts, Word, S, Canvas  # noqa: E402
from glyphbase import geom as G, skeleton as sk, proof, fx, output, latin  # noqa: E402

OUT = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.join(HERE, 'out')
FONTS = os.path.join(os.environ.get('WINDIR', r'C:\Windows'), 'Fonts')
t0 = time.time()


def step(msg):
    print(f'[{time.time() - t0:5.1f}s] {msg}')


# ================================================================ 1. 字体：取轮廓和度量

serif = os.path.join(FONTS, 'NotoSerifSC-VF.ttf')
if os.path.exists(serif):
    F = Font(serif, wght=700)                      # 可变字体按轴取实例
else:                                              # 没有这款字体时，找一款能覆盖「永」的
    hit = find_fonts('永')[0]
    F = Font(hit['path'], hit['index'])
latin_path = os.path.join(FONTS, 'bahnschrift.ttf')
FL = Font(latin_path, wght=600) if os.path.exists(latin_path) else Font(os.path.join(FONTS, 'arial.ttf'))
FS = Font(latin_path, wght=350, wdth=80) if os.path.exists(latin_path) else FL
step(f'中文字体 {F.name}；西文字体 {FL.name}')
print('   「永」的度量：', {k: (tuple(round(v) for v in x) if isinstance(x, tuple) else x) for k, x in F.metrics('永').items()})
w_k, w_n = latin.text_width(FL, 'ETERNAL', 100, kern=True), latin.text_width(FL, 'ETERNAL', 100, kern=False)
print(f'   ETERNAL 在 100 字号下宽 {w_k:.1f}（用字偶距）/ {w_n:.1f}（不用）')

# ================================================================ 2. 坐标底图（读坐标、轮廓序号）

src = F.outline('永')
proof.coord_map(src, os.path.join(OUT, '01_坐标底图_永.png'), title=f'永  {F.name}', box=F.em_box('永'), adv=F.advance('永'))
step('坐标底图')

# ================================================================ 3. 标笔画（按笔顺；八法写在标签里）
# 坐标从坐标底图上读；c= 是坐标底图上的轮廓序号（这一笔正好是一个独立轮廓时用）。
# 这些坐标是按 Noto Serif SC 量的；换了字体要对着新的坐标底图重标。

STROKES = {
    '永': [
        S('点', '丶', (330, 835), (470, 790), (600, 720), w=90, c=2, tags='侧'),
        S('钩', '水', (194, 603), (502, 603), (502, -50), (280, 42), w=(28, 119, 60), name='横折钩', tags=('勒', '努', '趯')),
        S('折', '水', (44, 431), (315, 425), (281, 300), (234, 189), (148, 78), (26, 3), w=(28, 111, 105, 100, 80),
          name='横撇', c=1, tags=('策', '掠')),
        S('撇', '水', (855, 565), (640, 392), w=90, tags='啄'),
        S('捺', '水', (598, 530), (612, 411), (656, 300), (770, 189), (930, 75), w=(40, 60, 80, 130), pad=14, tags='磔'),
    ],
}

W = Word(F, '永', STROKES)
proof.stroke_map(W, os.path.join(OUT, '02_笔画标注_永.png'))
step(f'笔画标注图（没盖到的碎块占 {W[0].coverage():.1%}）')

# ================================================================ 4. 骨架变换（先做，再查和改）

W.warp(sk.chain(sk.width(0.94), sk.slant(6)))
warped = G.Path(W[0].src)

# ================================================================ 5. 查

print('   所有的点：', W.q(type='点').ids)
print('   收笔朝右下的：', W.q(end='右下').ids)
print('   收笔末端空着的撇：', W.q(type=('撇', '折'), free=True).ids)
print('   带「掠」标签的：', W.q(tag='掠').ids, '；中线长过 600 的：', W.q(lambda s: s.length > 600).ids)

# ================================================================ 6. 批量改

# 一条全组规则：所有的点换成一个简单几何形（菱形），占住原来那一笔的位置和大小——只演示机制
W.q(type='点').variant(lambda s: G.ngon(*s.mid, s.w * 0.72, 4))


# 由中线重画一笔：横撇沿标注的中线扫出来，每段给一个宽；smooth 让撇的弯圆顺，横和撇之间的转角仍是尖的；
# 起笔用自己写的端头回调（斜切一刀），收笔用现成的尖头
def oblique(p, d, w, deg=35):
    """端头回调 f(端点, 朝外的方向, 宽)：返回 (补的形, 挖的形)。这里只挖：过端点、和法线成 deg 度的一刀，切掉外侧"""
    n = np.array([-d[1], d[0]])
    t = np.tan(np.radians(deg))
    big = 2 * w
    a, b = p + n * big + d * t * big, p - n * big - d * t * big
    return None, G.polygon([a, b, b + d * 4 * big, a + d * 4 * big])


W.s('永3').redraw(w=(28, 105, 100, 80, 40), smooth=12, cap0=oblique, cap1=G.cap_point(length=60))

# 顺着收笔方向延伸成线：捺的末端拉出一根渐细的线，末端点记进锚点
W.s('永5').extend(length=210, w0=28, w1=5)
step('查和改')

ch = W[0]
proof.compare([('原字', src), ('骨架变换', warped), ('改完', ch.path())], os.path.join(OUT, '03_对照.png'))
step('对照图')

# ================================================================ 7. 排版（版面坐标，y 朝下）

C = Canvas(1200, 580, scale=2)                     # 版面 1200×580，出 2400×1160 的图
W.row(110, 440, 360)                               # 「永」的原点放在 (110, 440)，字号 360
text = W.layout_path()
tip = ch.to_layout(ch.anchors['永5.tip'])          # 延伸线的末端（版面坐标）
en, en_w = latin.text_line(FL, 'ETERNAL', 96, 560, 330, tracking=0.08)
sub, _ = latin.text_line(FS, 'YONG ZI BA FA', 26, 563, 386, tracking=0.32)
cx, cy = ch.to_layout((500, 380))                  # 字身框的中心（版面坐标）
arc = G.union(latin.text_on_arc(FS, 'EIGHT PRINCIPLES', 18, cx, cy, 214, 208, 332),
              latin.text_on_arc(FS, 'OF ONE CHARACTER', 18, cx, cy, 214 + 18 * 0.72, 148, 32, side='inner'),
              G.ring(cx, cy, 206, 207.5))
rule = G.polyline([tip, (1110, tip[1])], 2.0)
plate = G.rect(40, 40, 1160, 540, r=28)

# 派生的层：都从字形外扩、偏移得到
outline = G.diff(G.offset(text, 9), text)          # 外扩 9 减去字本身 = 一圈描边
shadow = G.move(G.offset(text, 9), 10, 12)         # 外扩后往右下偏移 = 投影的形
step('排版与派生层')

# ================================================================ 8. 栅格化与图层样式

H, Wpx = C.H, C.W
m_plate, m_text, m_out = C.R(plate), C.R(text), C.R(outline)
m_shadow, m_en, m_sub, m_arc, m_rule = C.R(shadow), C.R(en), C.R(sub), C.R(arc), C.R(rule)

n1, n2 = fx.fbm(H, Wpx, C.px(40), 1), fx.fbm(H, Wpx, C.px(40), 2)
edge = fx.warp(m_plate, n1, n2, C.px(5))           # 域扭曲：边缘不齐
tone = 0.94 + 0.06 * fx.fbm(H, Wpx, C.px(90), 3) + 0.04 * (fx.grain(H, Wpx, 4) - 0.5)
L_plate = fx.solid(edge, fx.rgb('#E2DFD9') * tone[..., None])

L_shadow = fx.solid(fx.blur(m_shadow, C.px(6)), '#000000') * 0.35
L_out = fx.solid(m_out, '#F6F5F2')
L_arc = fx.solid(m_arc, '#8A8884')

face = fx.ramp(fx.linear_t(C, (0, 120), (0, 480)), [(0, '#4A4A4A'), (1, '#121212')])
hi, sh = fx.bevel(m_text, C.px(4))
face = fx.mix(face, np.ones(3, np.float32), (hi * 0.45)[..., None])
face = fx.mix(face, np.zeros(3, np.float32), (sh * 0.5)[..., None])
face = fx.mix(face, np.ones(3, np.float32), (fx.rim_light(m_text, C.px(1.6)) * 0.5)[..., None])
face = fx.mix(face, np.zeros(3, np.float32), (fx.inner_shadow(m_text, C.px(2), C.px(3), C.px(3)) * 0.4)[..., None])
L_text = fx.solid(m_text, face)

L_en = fx.stack([fx.solid(m_en, '#1C1C1C'), fx.solid(m_sub, '#5C5B58')])
L_rule = fx.solid(m_rule, '#1C1C1C')

layers = {
    '底板': L_plate,
    '投影': L_shadow,
    '描边': L_out,
    '圆弧字': L_arc,
    '字': L_text,
    '英文': L_en,
    '细线': L_rule,
}
step('图层样式')

# ================================================================ 9. 输出

output.save_layers(layers, os.path.join(OUT, 'layers'))
full = output.composite(layers)
output.save_png(os.path.join(OUT, 'final.png'), full)
output.save_png(os.path.join(OUT, 'mono.png'), output.mono(layers, tones={'底板': 0.88, '投影': 0.55, '描边': 1.0, '圆弧字': 0.45}), bg='#FFFFFF')
output.check_sheet(layers, os.path.join(OUT, '检查图.png'), read=['字'])
output.exploded(layers, os.path.join(OUT, '分层.png'))
output.save_svg(os.path.join(OUT, 'logo.svg'), [
    ('plate', plate, '#E2DFD9'), ('shadow', shadow, '#B9B6B0'), ('outline', outline, '#F6F5F2'), ('arc', arc, '#8A8884'),
    ('text', text, '#1C1C1C'), ('en', G.union(en, sub), '#1C1C1C'), ('rule', rule, '#1C1C1C'),
], (C.w, C.h))
step(f'输出到 {OUT}')
for root, _, files in os.walk(OUT):
    for f in sorted(files):
        print('   ', os.path.relpath(os.path.join(root, f), OUT))

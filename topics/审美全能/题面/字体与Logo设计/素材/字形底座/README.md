# 字形底座

一个 Python 小库（包名 `glyphbase`），提供做艺术字时都要用到的管道：从字体取字形和度量，对轮廓做几何运算，给笔画做标注、切分、查询和批量修改，出核对图，在统一的画布上栅格化、叠图层样式，最后输出分层 PNG、黑白稿、检查图和 SVG。

它只是管道，不带任何风格：没有预设的笔画造型、母题、配色、材质或版式，也不替你做任何设计决定。它可以改，可以只用其中一部分，也可以完全不用。

```
字形底座\
  README.md          本说明
  find_fonts.py      小工具：列出能覆盖某几个字的字体
  glyphbase\         库
    fonts.py         字体：打开、轮廓、度量、字偶距、排一行
    geom.py          几何：布尔、变换、外扩内缩、轮廓、拍平、点编辑、SVG、基本形、沿中线扫笔画
    strokes.py       笔画数据：标注 S()、字 Char、一组字 Word、一组笔画 Sel
    skeleton.py      骨架变换：宽窄、高矮、重心、中宫、倾斜、缩放
    proof.py         核对图：坐标底图、笔画标注图、字形对照
    canvas.py        画布与栅格化
    fx.py            图层样式
    output.py        分层 PNG、合成、黑白稿、检查图、分层展开图、SVG
    latin.py         西文：沿基线排字、沿圆弧排字
  examples\demo.py   用「永」和一个英文词把整条管道走一遍
```

## 依赖与引用

依赖 Python 3.10 以上、numpy、scipy、Pillow、fontTools、skia-pathops、opencv-python（本机都已装好）。其中 scipy 只用于让距离场达到亚像素精度，没有它也能运行。

在工作目录根下运行的脚本里这样引用：

```python
import sys
sys.path.insert(0, r'素材\字形底座')
import glyphbase as gb
from glyphbase import Font, Word, Char, S, Canvas
from glyphbase import geom as G, skeleton as sk, proof, fx, output, latin
```

运行演示：`python 素材\字形底座\examples\demo.py [输出目录]`，输出目录默认是 `examples\out\`。

## 坐标约定

| 坐标 | 用在哪 | 约定 |
|---|---|---|
| 字体单位 | 轮廓、笔画标注、中线、`sweep`、骨架变换、坐标底图、对照图 | 统一换算到 1000 em，y 朝上，基线为 0。中文字体的字身框一般是 (0, −120) 到 (1000, 880)，用 `Font.em_box()` 取 |
| 版面坐标 | 排版以后的全部几何、`latin` 的输出、SVG | y 朝下，单位自定。`Char.place()`、`Word.row()`、`geom.place()` 负责从字体单位换算过来 |
| 像素 | 图层 | `Canvas(w, h, scale)` 把版面坐标映射成像素。所有层共用同一张画布，尺寸相同、天然对齐。图层样式的长度参数（模糊、斜面宽、位移）都以像素计，从版面单位换算用 `C.px()` |

- **Path**：skia-pathops 的 `Path`，保留曲线。布尔运算和变换都返回新的 Path。
- **图层**：预乘 RGBA，`float32`，形状 H×W×4，取值 0–1。一组图层用 dict `{层名: 图层}` 装，按插入顺序从后往前叠。
- **遮罩**：覆盖率，H×W，取值 0–1，由 `C.R(path)` 得到。`fx` 里返回“强度图”的函数，再用 `fx.solid()` 上色成图层。

## 标注格式

每个字一张表，按笔顺写：

```python
STROKES = {
    '永': [
        S('点', '丶', (330, 835), (470, 790), (600, 720), w=90, c=2, tags='侧'),
        S('钩', '水', (194, 603), (502, 603), (502, -50), (280, 42), w=(28, 119, 60), name='横折钩', tags=('勒', '努', '趯')),
        S('折', '水', (44, 431), (315, 425), (281, 300), (234, 189), (148, 78), (26, 3), w=(28, 111, 105, 100, 80), name='横撇', c=1),
        ...
    ],
}
```

`S(类型, 部件, 中线上的点…, w=宽, name=全名, c=轮廓序号, pad=外扩, tags=标签)`

| 字段 | 写法 |
|---|---|
| 类型 | 只能是 横 竖 点 撇 捺 提 钩 折。复合笔画按收尾归类：横折、竖折、横撇归「折」，竖钩、横折钩、竖弯钩归「钩」；全名写在 `name` |
| 部件 | 这一笔属于哪个部件，名字自己起，同一组字里保持一致 |
| 中线 | 从起笔到收笔、按书写方向的点列（字体单位），至少两个点；折和钩在转折处加点 |
| `w` | 宽：一个数，或者每段一个（例如横折的横段细、竖段粗） |
| `c` | 这一笔恰好是字形里一个（或几个）独立轮廓时，写轮廓序号，这样取形最准，而且这几个轮廓只归这一笔。序号就是坐标底图上的 c0、c1…… |
| `pad` | 切取区域比笔画宽多出的量，默认取宽的三成、至少 24。这个区域只用来从整字里切出这一笔 |
| `tags` | 自定标签，一个字符串或几个，查询时用 |

- **切分**：每一笔沿中线、按宽加 `pad` 的区域，从整字里切出自己的形 `s.piece`。所有区域都没盖到的碎块，自动归给离它最近的那一笔。相邻笔画的区域在交接处可以重叠。
- **笔画编号**：字加笔序，从 1 数，例如 `'永3'`。同一个字在一组字里第二次出现时，标签是 `'永#2.'`，笔画写 `'永#2.3'`；`STROKES` 里可以用 `'永#2.'` 给它单独标注，不写就沿用 `'永'` 的。
- **方向名**：用于 `end=`、`start=`，取值有 `down` `up` `left` `right` `downleft` `downright` `upleft` `upright`，也可以写 下 上 左 右 左下 右下 左上 右上。

## 用法

按管道的顺序。

### 1. 取轮廓

```python
F = Font(r'C:\Windows\Fonts\NotoSerifSC-VF.ttf', wght=700)    # 可变字体按轴取实例
F2 = Font(r'C:\Windows\Fonts\msyh.ttc', index=1)               # TTC 带索引
p = F.outline('永')          # Path：1000 em，y 朝上，基线 0；重叠的轮廓已经并起来
F.metrics('永'); F.vmetrics; F.em_box('永'); F.axes; F.instances
```

找字体可以用命令行工具 `python 素材\字形底座\find_fonts.py 终末地`，也可以在代码里调 `gb.find_fonts('终末地')`。

### 2. 出坐标底图

```python
proof.coord_maps(F, '永', 'work/坐标底图')        # 每个字一张：网格、轮廓序号、基线、字身框、步进
proof.coord_map(p, 'work/x.png', title='x', points=True)   # 任意轮廓；points=True 时标出轮廓上的点
```

### 3. 标笔画，然后核对

```python
W = Word(F, '永', STROKES)
proof.stroke_map(W, 'work/笔画.png')    # 每笔一种颜色；黑线是中线，箭头指收笔方向；红色是没盖到的碎块
W[0].coverage()                         # 没盖到的面积占比
```

红色面积大，说明中线或宽标偏了，回去改标注。

### 4. 骨架变换

骨架变换要在查和改之前做。它会立刻作用在原字形、各笔切出来的形、中线和锚点上。

```python
W.warp(sk.chain(sk.width(0.94), sk.gravity(20), sk.center(0.1), sk.slant(6)))
```

笔画的宽不跟着变换走：之后由中线重画时，粗细保持标注的值；直接使用字体轮廓时，轮廓上的点跟着变换走。

### 5. 查和批量改

```python
W.q(type='点')                                  # 所有的点
W.q(type=('竖', '钩'), end='下', free=True)     # 收笔朝下、末端空着的
W.q(part='氵') / W.q(ch='永') / W.q(tag='主笔') / W.q(lambda s: s.length > 400)
W.s('永3') / W.sel('永2', '永5') / sel.exclude('永4')

sel.variant(lambda s: 新形)          # 换成新形：先把这一笔从字里拿掉，再补上 fn(s) 返回的 Path
sel.op(fn, **kw)                     # 在这一笔所在的字上做一步：fn(path, s, **kw) -> path
sel.add(fn) / sel.cut(fn)            # 补上或挖掉 fn(s) 返回的形
sel.extend(length=200, w1=4)         # 顺着收笔方向延伸成渐细的线；末端点记在 char.anchors['永5.tip']
W.op(fn, **kw)                       # 每个字都做的一步：fn(path, **kw) -> path
```

一笔上能直接取的几何量：`s.start`、`s.end`、`s.mid`、`s.start_dir`、`s.end_dir`、`s.point(t)`、`s.dir(t)`、`s.normal(t)`、`s.w_at(t)`、`s.at_y(y)`、`s.at_x(x)`、`s.length`、`s.w`、`s.w_end`、`s.heading()`、`s.end_free`、`s.piece`、`s.bounds`。其中 t 是沿中线的长度比例，0 为起笔，1 为收笔。

所有改动按调用的顺序排队，到 `char.path()` 时才算出结果。

### 6. 由中线重画

```python
W.s('永3').redraw(w=(28, 105, 100, 80, 40), smooth=12, cap0=我的端头, cap1=G.cap_point(60))
W.q(type='横').redraw(cap0=…, cap1=…)            # 一组笔画都重画
shape = s.sweep(…)                              # 只要形、不改字
G.sweep(pts, w, cap0, cap1, join, smooth, corner)   # 任意中线
```

- **宽 `w`**：可以写一个数；每点一个（N 个）；每段一个（N−1 个）；每段一对 `(起宽, 止宽)`（N−1 对）；或者写函数 `f(t)`。
- **`smooth`**：大于 0 时先用过点的光滑曲线加密中线，折角仍保持尖。
- **`corner`**：走向变化超过多少度的顶点算折角。折角外侧按 `join` 接：`miter` 尖角、`round` 圆角、`bevel` 切角。
- **端头回调**：签名是 `f(p, d, w)`。`p` 是端点，`d` 是朝外的单位方向，`w` 是这一端的宽。返回要补上的 Path，或者 `(补的形, 挖的形)`，或者 `None`。
  - 库里只带三个最基本的端头：`cap_round()`、`cap_square()`、`cap_point()`。
  - 不给端头就是平头。

### 7. 排版与派生层

```python
W.row(x=100, baseline=440, size=360)          # 依步进排成一行；也可以逐字 W[i].place(x, baseline, size)
text = W.layout_path()                        # 版面坐标
tip = W[0].to_layout(W[0].anchors['永5.tip'])
outline = G.diff(G.offset(text, 9), text)     # 外扩再减去本身：一圈描边
shadow = G.move(G.offset(text, 9), 10, 12)    # 外扩再偏移：投影的形
en, w = latin.text_line(FL, 'WORD', 96, x, baseline, tracking=0.08)
arc = latin.text_on_arc(FL, 'ALONG', 20, cx, cy, r, 200, 340)              # 上弧
arc2 = latin.text_on_arc(FL, 'UNDER', 20, cx, cy, r, 150, 30, side='inner')  # 下弧
```

### 8. 栅格化和图层样式

```python
C = Canvas(1200, 580, scale=4)       # 版面 1200×580，出 4800×2320 的图
m = C.R(text)                        # 遮罩
hi, sh = fx.bevel(m, C.px(4))
face = fx.ramp(fx.linear_t(C, (0, 120), (0, 480)), [(0, '#…'), (1, '#…')])
L_text = fx.solid(m, face)
L_shadow = fx.solid(fx.blur(C.R(shadow), C.px(6)), '#000000') * 0.35
```

### 9. 输出

```python
layers = {'底板': …, '投影': …, '字': …, '英文': …}
output.save_layers(layers, 'logos/x/layers')               # 01_底板.png……，同尺寸透明 PNG
output.save_png('logos/x/final.png', output.composite(layers))
output.save_png('logos/x/mono.png', output.mono(layers, tones={'底板': 0.85}), bg='#FFFFFF')
output.check_sheet(layers, 'work/检查图.png', read=['字'])  # 去色·两档黑白·只留字·高64像素·白底·黑底
output.exploded(layers, 'work/分层.png')
output.save_svg('web/x.svg', [('text', text, '#…'), …], (C.w, C.h))   # 每条路径带 id
```

## API 速查

**fonts**
- `Font(path, index=0, location=None, **axes)`
  - 名字与轴：`.name` `.family` `.style` `.axes` `.instances` `.upm`
  - 查字：`.has(ch)` `.missing(text)` `.gname(ch)`
  - 轮廓与度量：`.outline(ch)` `.advance(ch)` `.metrics(ch)` `.vmetrics` `.em_box(ch)`
  - 排字：`.kern(a, b)` `.layout(text, tracking, kern)`，返回每个字的位置和总宽；`.line(text, tracking, kern)`，返回轮廓和总宽
- `find_fonts(text, folder)` → `[{path, index, name, family, style, axes}]`

**geom**
- 布尔：`union(*ps)` `diff(a, *bs)` `inter(a, *bs)` `xor(a, b)` `simplify(p)`
- 变换：`affine(p, a, b, c, d, e, f)` `move(p, dx, dy)` `scale(p, sx, sy, about)` `rotate(p, deg, about)` `skew(p, x_deg, y_deg, about)` `place(p, x, baseline, size)`
- 外扩内缩：`offset(p, d, join)`，d>0 外扩、d<0 内缩；`round_corners(p, r, convex, concave)`
- 轮廓：`contours(p)`，返回 `[{i, path, area, signed, bounds, dir, hole}]`；`pick(p, idx)` `drop_small(p, min_area)` `area(p)` `signed_area(p)` `bounds(p)`
- 拍平：`flatten(p, tol)`，返回 `[N×2 数组]`
- 点编辑：`points(p)` `map_points(p, fn(x, y))` `warp(p, fn(N×2), tol)` `move_points(p, where, dx, dy, soft)` `straighten(p, tol, where)`。其中 `where` 可以写 `(cx, cy, r)`、`(x0, y0, x1, y1)` 或 `fn(x, y)`
- SVG：`to_svg_d(p)` `from_svg_d(d)`
- 基本形：`polygon(pts)` `rect(x0, y0, x1, y1, r)` `circle` `ellipse(cx, cy, rx, ry, rot)` `ring(cx, cy, r0, r1)` `ngon(cx, cy, r, n, rot)` `arc_band(cx, cy, r0, r1, a0, a1)` `slab(p0, p1, w)` `taper(p0, p1, w0, w1)` `polyline(pts, w, cap, join, closed)`
- 曲线：`bezier(p0, p1, p2, p3, n)` `spline(pts, n)`
- 扫笔画：`sweep(pts, w, cap0, cap1, join, smooth, corner)` `cap_round()` `cap_square(ext)` `cap_point(length)`

**strokes**
- `S(...)`：一笔的标注
- `Char(font, ch, specs, label, src=None)`：一个字；`src` 可以换成自己给的轮廓
  - 数据：`.src` `.box` `.adv` `.strokes` `.residue` `.anchors`
  - 核对与查：`.coverage()` `.q()` `[n]`
  - 改：`.op()` `.add()` `.cut()` `.warp()`
  - 结果：`.path()`
  - 排版：`.place()` `.to_layout(pt)` `.layout(p)` `.layout_path()`
- `Word(font, text, strokes)` / `Word.of([Char…])`：一组字
  - 取字和笔画：`[i]` `['永']` `.strokes`
  - 查：`.q()` `.s(id)` `.sel(*ids)`
  - 改：`.op()` `.warp()`
  - 排版：`.row(x, baseline, size, tracking, gaps)` `.layout_path()`
- `Sel`：查出来的一组笔画
  - 筛：`.q()` `.exclude()` `.ids` `.each(fn)`
  - 改：`.variant()` `.redraw()` `.op()` `.add()` `.cut()` `.extend()`
- `Stroke`：一笔
  - 几何量见第 5 步
  - 方法：`.sweep()` `.redraw()` `.variant()` `.op()` `.add()` `.cut()` `.extend()` `.region()`

**skeleton**

每个函数都返回 `f(N×2, box)`，交给 `Char.warp` 或 `Word.warp` 用。
- `width(k, cx)`：宽窄
- `height(k, cy)`：高矮
- `scale(sx, sy, c)`：缩放
- `move(dx, dy)`：平移
- `slant(deg, y0)`：倾斜
- `gravity(dy, at)`：重心上下挪，上下沿不动
- `center(k, c)`：中宫，k>0 收紧，k<0 放开
- `chain(*fs)`：几个变换按顺序串起来

**proof**
- `coord_map(p, path, title, box, adv, points)`
- `coord_maps(font, text, out_dir)`
- `stroke_map(word, path)`
- `compare([(标题, Path)…], path)`

**canvas**
- `Canvas(w, h, scale, origin)`
  - 属性：`.W` `.H` `.M` `.XX` `.YY`
  - 栅格化与换算：`.R(path, ss)` `.px(v)` `.to_px(x, y)` `.to_layout(px, py)` `.polar(c)`
  - 空图：`.empty()` `.zeros()`
- `raster(p, W, H, M, ss)`

**fx**
- 颜色与图层：`rgb` `mix` `solid(mask, 颜色或 H×W×3)` `glow_layer(amount, color)` `over(dst, src, opacity)` `stack(layers)` `blend(dst, src, mode, opacity)` `opacity(L, k)` `clip(L, mask)` `unpremul` `to_u8`
  - `blend` 的模式：normal multiply screen overlay hard_light soft_light darken lighten add difference
- 渐变：`ramp(t, stops)` `linear_t(C, p0, p1)` `radial_t(C, c, r)` `angle_t(C, c, a0)`
- 基础运算：`blur` `blur_dir` `shift` `smoothstep` `grad` `dilate(mask, r)` `erode(mask, r)`
- 距离场：`dist_in` `dist_out` `sdf`
- 光与样式：`light_vec(angle, altitude)` `bevel(mask, size, …)` `rim_light(mask, width, angle)` `inner_shadow(mask, dx, dy, sigma)` `inner_glow(mask, size, edge)` `outer_glow(mask, sigma, spread)` `inner_stroke(mask, width)` `outer_stroke(mask, width, gap)` `drop_shadow(mask, dx, dy, sigma, spread)`
- 噪声：`value_noise(H, W, cell, seed, aniso)` `fbm(H, W, cell, seed, octaves, gain, aniso)` `warp(a, fx, fy, amount)` `grain(H, W, seed, sigma)` `streaks(H, W, seed, density, length, angle, width)`
- 扩散：`diffuse(H, W, seed, attract, …)`，噪声驱动的颜色扩散

**output**
- PNG：`save_png(path, L, bg)` `load_png(path)` `save_layers(layers, out_dir, numbered)`
- 合成与黑白：`composite(layers, names)` `mono(layers, tones, default, names)` `grayscale(L)` `two_tone(L, bg, threshold)`
- 检查：`check_sheet(layers, path, read, bg, thumb_h)` `exploded(layers, path)`
- SVG：`save_svg(path, [(id, Path, fill)…], (w, h), viewbox, bg)`

**latin**
- `text_width(font, text, size, tracking, kern)`
- `text_line(font, text, size, x, baseline, tracking, kern, align)`：返回轮廓和宽
- `text_on_arc(font, text, size, cx, cy, r, a_start, a_end, side, tracking, kern)`

## 已知局限

- **排字**：只读 GPOS 里 `kern` 特性的成对字偶距和旧的 `kern` 表，不做连字、上下文替换和竖排。可变字体的字偶距取默认实例的值。
- **笔画切分**：按区域切，相邻笔画在交接处会重叠。拿掉一笔时，交接处属于别的笔画的部分会留下；重画后如果交接处有残留，要自己补形或挖形。
- **非线性骨架变换**：直接作用在轮廓的点和控制点上，变换剧烈时给 `tol`，先拍平再变换。
- **栅格化**：路径先化简再按多边形填充，抗锯齿靠超采样（`ss`，默认 2）。
- **耗时**：画布很大（宽 4000 像素以上）时，模糊和距离场一类的样式每层要几秒。

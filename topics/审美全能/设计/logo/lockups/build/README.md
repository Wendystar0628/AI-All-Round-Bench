# 题名锁定生成器

十道题的题名锁定（题名 Logo），视频和网站共用。做法依据《艺术字设计思路调研》（`调研/审美全能/艺术字调研/艺术字设计思路调研.md`，第一、二节的方法和规则，第六节十题的方向）和设计系统第七节。样板是 `tasks/harbor_mecha/`（08 雨夜港口的巨型机甲）。

## 文件

| 位置 | 是什么 |
|---|---|
| `lockup.py` | 入口（下面的命令都是它） |
| `lockupkit/` | 共用工具：`strokes`（笔画标注、查、批量改、变体、延伸）、`surgery`（刻面、加厚、斜切脚、鳍、分缝、刃、刀、液压杆）、`fx`（图层样式）、`canvas`（画板）、`latin`（西文、沿圆排字）、`small`（小形态）、`checks`（检查图）、`output`（出图、清单）、`run`（跑一题；模块要交出什么写在它开头） |
| `tasks/<题>/` | 一题一个模块（题 key 的连字符换成下划线）。`_template/` 是新建时拷的模板 |

依赖：Python 3、numpy、opencv-python、fonttools、skia-pathops、Pillow（本机都装好了）。命令都在项目根目录跑，下面把 `python topics/审美全能/设计/logo/lockups/build/lockup.py` 简写成 `lockup.py`。

## 新建一题的模块

```
lockup.py --new sky-citadel
```

建出 `tasks/sky_citadel/`，马上能出图（一行宋体、底板、底线带），再一样样改：

| 文件 | 写什么 |
|---|---|
| `__init__.py` | 概念单 `CONCEPT`（报告 1.3 的字段，先写再动手）；画板 `ARTBOARD`；`geometry(tok)` 排版、交出全部矢量几何；图层表 `LAYERS`（从后往前，每层 `Layer(id, role, render, enter=…, pivot=…)`）；`small(tok)` 小形态的字 |
| `strokes.py` | 笔画标注 |
| `letters.py` | 笔画处理：方言（全组规则）→ 一处同构高潮 → 同类笔画呼应 |
| `emblem.py` | 主体元素的几何 |
| `english.py` | 英文的几何 |
| `layers.py` | 颜色层：每层一个 `render(C, G, tok)`，返回预乘 RGBA；`tok` 是 `tokens.json` 里这一题的配色 |

`geometry()` 必须交出 `title`（排好版的 Title）、`text`（全部中文的轮廓）、`baseline`（收底的基线）；可选 `tag`、`anchors`、`geo`、`star`、`enter`，含义见 `lockupkit/run.py` 开头。

**role**（网站和视频靠它摆放、插几何线）：`plate` 底板 · `ghost` 背景巨字 · `emblem` 主体元素（可以拆几层分别入场）· `line` 画进图层的细线 · `text` 中文 · `hero` 单独换料的签名字 · `en` 英文 · `glint` 星芒与高光。

**入场**写在每层的 `enter`：`{'at': 0.1, 'dur': 0.26, 'kind': 'mecha-power', …}`，at、dur 占整段入场的比例（片头一格 0.8 秒、介绍页 2.4 秒），这一层在 at + dur 时落定。入场要讲这一件自己的构造和母题（材质怎样出现、主体元素怎样运转、母题那一笔怎样落定），0.3 秒内中文要读得清。

- **kind** 是 `ae.js` 里登记的入场方式 `AE.lockupKind(名字, { ease, pose, draw })`。内置的有 fade、focus、slide、land、wipe、grow、turn、ignite、flash、trace；各题自己的名字带题前缀（`mecha-power`、`autumn-print`……），一种一块，写在 `ae.js`「各题的入场方式」一段。参数随 kind 定，见 `ae.js` 登记处的注释和各题那一块。
- `pose(o, k)` 只改这一层的样子（不透明度、位移、转缩、模糊、亮度、`filter` 另加的 canvas 滤镜、`clip` 遮罩：wipe 从一边擦出、radial 从一点化开（给 `r` 是绝对半径，几层共用一道前沿）、conic 绕一点转着显出）；`draw(c, D, o, env)` 自己在 canvas 上画这一层，视频的介绍页和片头都用它（同一份画法）。写 draw 的工具：`AE.lockupReveal`（按一张阈值图逐像素显出：溶解、逐格铺、吃墨、喷涂）、`AE.lockupNoise`（带种子的平滑噪声）、`env.paint`（照常画，可换成自己处理过的图）。
- 任何 kind 都能带：`sweep: {at, dur}` 材质面上扫过一道光；`steps: N` 进度按 N 格跳（定格动画那种一顿一顿）；参数里任何 `{at, dur}` 形式的子段都算进整段走完的时刻。
- 每层都要写 enter（没有按 role 的缺省）。几何线、星芒、编号小标的时刻写在 `geometry()` 交出的 `enter.{geo, star, tag}`（没写的取 `AE.LOCKUP_ENTER`）。
- 需要分开入场的部件（逐段的字、主体元素的零件、几块色版）就拆成几层出图；拆开的几层叠回去要和原来一模一样，role 的含义照旧。

**摆放**：画板左上就是锁定的原点。中文字块左边落在 x≈100、`baseline` 落在 y≈422、编号小标和要读的几层（text、hero、en）不高过 y 58 时，介绍页按 1 倍摆；超了整件按比例缩小。主体元素可以比字高（剪影的突起）。

## 标笔画

1. 出坐标底图：`lockup.py --glyphs 天穹圣城`，图在 `调研/审美全能/模板设计/题名锁定/_坐标底图/`（字体单位网格，绿色是轮廓序号）。
2. 在 `strokes.py` 里每个字一张表，按笔顺：

   ```python
   '甲': [
       S('竖', '田', (170, 785), (170, 200), w=148),
       S('折', '田', (244, 738), (823, 738), (823, 210), w=(28, 150), name='横折'),
       S('横', '田', (244, 516), (748, 516), w=28),
       S('横', '田', (244, 287), (748, 287), w=28),
       S('竖', '中竖', (494, 752), (494, -80), w=153, tags='主笔'),
   ],
   ```

   类型只有 横 竖 点 撇 捺 提 钩 折（复合笔画按收尾归类，`name` 写全名）；部件自己起名，同一题一致；中线从起笔到收笔，折、钩在转折处加点；`w` 一个数或每段一个；分开写的点用 `c=轮廓序号` 取形最准；`tags` 是自定标签。
3. 核对：`lockup.py <题key> --strokes`，看检查目录里的 `笔画.png`：每一笔一种颜色，黑线是中线、箭头是收笔方向，红色是区域没盖到的碎块（已自动归给最近的一笔，大块的红说明中线或宽标偏了）。
4. 在 `letters.py` 里用：

   ```python
   T.q(type='点').variant(lambda s: 新形)            # 所有的点换成新形（呼应）
   T.q(end='down', free=True).op(foot, slant=-1)    # 收笔朝下、末端空着的笔画：字脚一刀斜切
   T.q(part='氵') / T.q(ch='港') / T.q(tag='长撇') / T.q(lambda s: s.length > 400)
   T.s('甲5').op(某个手术) / T.s('甲5').variant(新形)  # 某一笔（高潮）
   T.s('机6').add(lambda s: stroke_blade(s, ext=150))  # 顺着收笔方向延伸
   T.s('甲5').extend(length=200, w1=6)               # 延伸成线，末端记在 anchors
   T.op(thicken_h, d=6); T.op(facet, tol=7)          # 每个字都做
   ```

   一笔的几何：`s.start`、`s.end`、`s.end_dir`、`s.point(t)`、`s.w_at(t)`、`s.at_y(y)`、`s.piece`（从整字里切出来的这一笔）、`s.end_free`。手术按写的顺序执行；同一个字出现两次时，第二个写 `'室#2.3'`。

## 只重出自己那一题

| 命令 | 做什么 | 大约 |
|---|---|---|
| `lockup.py <题key> --preview` | 只出检查图看样子，不写 `lockups/` 和清单 | 2–20 秒 |
| `lockup.py <题key>` | 正式出：图层和小形态（PNG + WebP）写进 `lockups/<题key>/`，清单 `lockups.js` 里换掉这一题那一项，再出检查图 | 20 秒 |
| `lockup.py <题key> --no-forms` | 不重出小形态（清单沿用上次的） | |
| `lockup.py --list` | 十题各有哪些层 | |

九个人可以同时跑：每题只写自己的目录（多出来的旧文件会删掉，只删自己目录里的）；写 `lockups.js` 时排队拿锁 `build/.lockups.lock`，拿到后重新读一遍、只换自己那一项。锁超过两分钟没人动会被当作残留删掉。

## 检查图在哪

`调研/审美全能/模板设计/题名锁定/<编号>-<题名>/检查/`，每次出图（含 `--preview`）都重写：

- `成品.png`：合成在这一题的底色上；
- `检查图.png`：黑白、去色、只剩字（拿掉底板、主体元素、英文、细线）、缩略图（连同迷你和书脊）、白底、黑底；
- `分层.png`：每层单独铺在棋盘格上，标 z 序和 role；
- `笔画.png`：笔画标注图；
- `概念单.json`：模块里的概念单。

## 看效果（截图）

先跑下一节的同步。截图输出路径用纯英文路径，看完要留的再拷进 `调研/审美全能/模板设计/题名锁定/<编号>-<题名>/`。设 `SHOT_KEEP=1` 才留图。

- **视频介绍页**（第二拍看点是十几秒处，入场在开头一两秒）：
  `SHOT_KEEP=1 node videos/engine/shot.mjs --film videos/topics/aesthetics/dev --scene task.html --query task=<题key> --output <路径>/brief --times 1.6,2.6,17`
- **片头那一格**：第 N 格从 3.6 + (N−1)×1.2 秒起（准确的时刻看 `videos/topics/aesthetics/scenes/intro/beats.json` 的 `montage.frames[].at`，[小节, 拍]，一小节 2.4 秒、一拍 0.6 秒）。`only=` 只放这一格，其余是占位：
  `SHOT_KEEP=1 node videos/engine/shot.mjs --film videos/topics/aesthetics/dev --scene intro.html --query only=08 --output <路径>/intro --times 12.0,12.1,12.2,12.35,12.5,12.8`
- **网站题目页**：在 `website/topics/aesthetics/` 下开一个自己的开发服务器（别用别人开着的那个，它缓存着旧清单），用无窗口浏览器截页首：

  ```
  cd website/topics/aesthetics && npx vite --port 52xx --strictPort
  "C:/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --disable-gpu --hide-scrollbars --user-data-dir=<路径>\prof --window-size=1920,1080 --virtual-time-budget=10000 --screenshot=<路径>\site.png http://localhost:52xx/tasks/<题key>/
  ```

  截完关掉服务器。

## 出完要跑的同步

1. 视频模板：`node videos/topics/aesthetics/tools/sync_design.mjs`（出片时也会自动跑；`scenes/design/` 是副本，不手改）；
2. 网站：`cd website/topics/aesthetics && npm run sync`（只拷清单和 WebP）；
3. 片头的固定缓存 `videos/topics/aesthetics/renders/fixed/intro.*` 如果存在，删掉，下次出片会重渲。

不提交 git、不发布网站，交给统筹。

## 注意

- 只改自己的 `tasks/<题>/`；自己的入场方式加在 `ae.js`「各题的入场方式」一段（一种一块）。共用工具（`lockupkit/`）、`ae.js` 其余部分、视频和网站的取用代码要改时先说，大家共用。
- 代表画面会读锁定的东西，改之前看一眼 `videos/topics/aesthetics/scenes/emblems/<题key>.js` 里的 `lockupPlace`：03 温室、07 水上乐园读 `geo.strokes[0]`（台面线、水线的高度），10 Logo 读伸出去那根线的出口 `geo.out`；01 片头开场飞来的星落在锁定的矢量星芒 `star` 上。新锁定要保留这几样（同样的含义），或者和代表画面的设计师一起改。
- 伸进画面的那根线走矢量 `geo.out`（介绍页、网站把它接到代表画面给的落点），线宽等于本题字的最细笔画。画进图层的线是死的，伸不进画面。
- `G['star']` 只给矢量星芒 `{x, y, s, long, tall, a}`；星芒画进图层时不要给，别的点放 `anchors`。
- 颜色取 `tokens.json` 的 `directions[]`（`tok`），不要另抄一份色值表。
- 字体文件只用 `topics/审美全能/设计/fonts/` 里的（`lockupkit/paths.py` 有常用的几个）。

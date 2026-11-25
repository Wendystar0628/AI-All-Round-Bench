# AI审美全能 网站

「AI审美全能」专题的展示网站：每个模型按同一份题面做十个方向的作品，这里只放从作品里截下的静帧和作品下载，不打分、不排名、不计时计费。线上挂在 `/aesthetics/`（英文 `/aesthetics/en/`），现在是草稿（专题清单 `website_status: draft`），只在本地预览。

Vite 多页静态站：页面在构建时由 `src/render/` 画成静态 HTML，浏览器脚本只管交互（看图器、页签、卷目的主角卷、随版面画的线、语言）。设计方案和代码怎么写见 [docs/design.md](docs/design.md)，数据字段见 [docs/data.md](docs/data.md)，下载包见 [docs/downloads.md](docs/downloads.md)，站点项目的七条约定见 [网站说明](../../README.md)。

## 开发

在本目录运行（第一次先 `npm install`）：

```powershell
npm run dev        # http://localhost:5195/ ，挂在 /，英文在 /en/
```

- 每次请求现画页面：改了 `src/render/`、`src/i18n/` 或数据，浏览器自动刷新；改样式和浏览器脚本由 Vite 热更新。
- 也可以用仓库 `.claude/launch.json` 里的 `aesthetics-dev`（端口 5195）。
- 数据：`ONESHOT_SITE_DATA_DIR` 给了就读它，否则先读 `data-local/`，没有再读 `data/`。
- 看手机排法用浏览器的设备模拟（390 宽）；无头 Chrome 直接给 `--window-size=390,…` 排不到 390 宽。

## 构建与预览成品

```powershell
$env:ONESHOT_SITE_BASE="/aesthetics/"; $env:ONESHOT_SITE_DATA_DIR="data-local"; npm run build   # 成品在 dist/
$env:ONESHOT_SITE_BASE="/aesthetics/"; npm run preview                                         # http://localhost:5196/aesthetics/
```

- 构建两个变量都要给（站点项目约定 1）：不给 `ONESHOT_SITE_BASE` 直接报错、不清掉 `dist/`；本专题是草稿，导出只写 `data-local/`，所以 `ONESHOT_SITE_DATA_DIR` 指到它。正式发布由 `website/tools/publish.py` 构建，两个变量它都会给。
- 构建时按站内实际用字把字体子集化（`scripts/fonts.mjs`），数据目录原样拷进 `dist/data/`（图片和下载包都从这里取）。
- 预览成品要和构建时给同一个 `ONESHOT_SITE_BASE`，地址带 `/aesthetics/`。

## 数据从哪来

页面只读数据目录里的 `topic.json`、`models.json`、`works.json` 和 `media/`、`downloads/`，不读平台登记和素材目录。它们由导出插件 `export.py` 写出，在仓库根目录运行：

| 做什么 | 命令 |
|---|---|
| 作品素材导出或更新后，完整刷新（先自动打下载包，再挑图、导出） | `python website/tools/export.py --topic aesthetics` |
| 作答关闭后刷新实时数据（不打包，平台自动跑） | `python website/tools/export.py --topic aesthetics --live` |

- 草稿阶段只导出到 `data-local/`（不进 git）；上线后 `data/` 进 git，其中的 `media/`、`downloads/` 不进，随时可以从 `website/.build-cache/aesthetics/` 重新拷出。
- 题目、方向的顺序和展示文案来自 `topics/审美全能/展示文案.json`，评委来自 `videos/topics/aesthetics/judges/judges.json`，型号来自参测登记；作品图由 `tools/shots.py` 挑，下载包由 `tools/package.py` 打。细节见 `docs/data.md`、`docs/downloads.md`。
- 评语、PV设计和字体与Logo设计的题面现在都还没有；数据里有了，页面自己会显示，不用改代码（空状态见 `docs/design.md` 4.2）。

## 设计素材怎么同步

网站用设计系统的副本，不直接引用设计目录。`npm run dev` 和 `npm run build` 开头都会跑 `scripts/sync.mjs`（也可以单独 `npm run sync`），把下面这些拷到 `src/vendor/`（不进 git），内容没变的不重拷，多出来的删掉：

| 来源（相对仓库根） | 用来做什么 |
|---|---|
| `topics/审美全能/设计/tokens.css`、`tokens.json` | 令牌（颜色、字号、栅格、缓动）；十个方向各自的一套配色（世界色、点亮色、墨、光色）和票根动作，网站各题的颜色只从这里读 |
| `topics/审美全能/设计/ae.js`、`logo/glyphs.js`、`logo/wordmark/wordmark.js`、`ornaments/ornaments.js` | 构建时在 Node 里画字标（`wordmark.js`）、题名字形、锁定的几何线、星座、吊星（`src/render/design.mjs`） |
| `topics/审美全能/设计/logo/lockups/` | 十个题名锁定：清单 `lockups.js` 和网页用的 WebP 图层（视频和网站同一份；不拷 PNG 和 `build/`） |
| `topics/审美全能/设计/portraits/` | 预渲的进光立绘：清单 `portraits.json` 和 `players/`、`judges/` 里的图（不拷 `build.mjs`、`render.html`） |
| `topics/审美全能/设计/stills/` | 代表画面的静图（题目页页首）和几何线的落点 `links.json`（有的话）；静图还没有时页首画缺省画面 |
| `topics/审美全能/设计/textures/textures.css`、`logo/favicon.svg` | 颗粒、网站图标（标签栏） |
| `scripts/fonts.mjs` 的 `FONT_FILES` | 字体：Libre Bodoni、Tangerine 取设计系统的 `fonts/`；中文用 Noto Serif SC（思源宋体的同一设计，没有保留字名），先找 `topics/审美全能/设计/fonts/NotoSerifSC-VF.ttf`，没有时用本机装的那一份（Windows 的 `C:/Windows/Fonts/NotoSerifSC-VF.ttf`） |
| `assets/厂商图标/mark/*.svg` | 厂商图标；缺了某个图标时构建照常，只打一行提示、页面上不画它 |

- 设计系统改了（字形、锁定、立绘重新生成），重新跑一次 `npm run dev` 或 `npm run build` 就同步过来，不用改站点代码。开发服务器开着时同步了新素材，要重启它（`design.mjs` 在启动时读这些文件）。
- 字体映射只在 `scripts/fonts.mjs` 里改（`FACES`），出处里的字体名跟着 `FAMILIES` 列。
- 页面上的光和纸是预渲的贴图（`src/assets/light/`，进 git）：要换画法就改 `tools/textures.py`，在仓库根目录运行 `python website/topics/aesthetics/tools/textures.py`。
- 只用设计系统里原创的图形和开源字体；不取别的专题的素材。

## 上线之前

- `topics/审美全能/` 整个目录现在还被 `.git/info/exclude` 排除在仓库外，而同步的设计素材、导出读的专题清单和展示文案都在里面：上线前要先把它放进仓库，否则在别处 clone 下来构建会在同步这一步失败。
- 用户说上线后，把专题清单的 `website_status` 改成 `online`，再按 `website/tools/README.md` 发布。

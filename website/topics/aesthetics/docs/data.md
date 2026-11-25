# 审美全能网站的数据约定

前端只读这里写的数据，不读平台登记、素材目录和缓存。数据由导出插件 `export.py` 生成，图片由 `tools/shots.py` 做，下载包由 `tools/package.py` 做（规则见 [downloads.md](downloads.md)）。

## 数据目录

`npm run build` 从 `ONESHOT_SITE_DATA_DIR` 读，`npm run dev` 先读 `data-local/`、没有再读 `data/`（见 `website/README.md` 的站点项目契约）。目录里：

| 文件 | 内容 |
|---|---|
| `topic.json` | 专题信息、方向与题目（按展示顺序）、评委 |
| `models.json` | 参测型号，按参测登记的顺序 |
| `works.json` | 作品：`works[题key][型号id]` |
| `media/` | 网页用的图片（WebP），路径写在上面三个文件里 |
| `downloads/` | 作品下载包，路径写在 `works.json` 里 |

数据里所有文件路径都相对数据目录的根，例如 `media/works/gpt-6-2-astra/sky-citadel/01.webp`。双语文字一律写成 `{"zh": …, "en": …}`；只有中文的字段名不带后缀，英文的带 `_en`。

## topic.json

```json
{"id": "aesthetics", "name": "AI审美全能", "name_en": "AI Aesthetics",
 "about": {"zh": "…", "en": "…"}, "updated": "2026-11-24", "notice": null,
 "categories": [ … ], "judges": [ … ]}
```

- `about`：一句话介绍（取专题清单的 `coming_soon`），没有时 `null`。这句写给总站卡片；网站页面上不直接用它，扉页和页面描述用 `src/i18n/*/home.json` 里网站自己的话。
- `updated`：作品素材最近一次更新的日期。
- `notice`：正式发布时 `publish/notice.json` 打开的暂停公示 `{zh, en}`；这时 `models.json` 为空、`works.json` 里各题都没有作品。本地预览恒为 `null`。

### categories：方向，按展示顺序

PV设计、卡通渲染、白模渲染、创意网页设计、大型场景建模、SVG动画、体素建模、硬表面建模、游戏UI设计、字体与Logo设计。顺序、展示用的中英文名和介绍取共用展示文案 `topics/审美全能/展示文案.json`（视频的题目介绍页也用它）；这个文件缺了或少了某个方向时，照常导出：方向按专题清单的顺序排，名字用登记名，介绍为空。

| 字段 | 内容 |
|---|---|
| `key` | 方向标识，如 `toon` |
| `no` | 展示序号，1 起 |
| `name`、`name_en` | 方向名，展示用的写法，如「卡通渲染」（登记名是「卡通渲染（三渲二）」） |
| `short`、`short_en` | 方向的简称，如「网页设计」「Web」：卷目星座的星下写它（展示文案的 `category.short`，没有时同方向名） |
| `judge` | 点评这个方向的评委 `id`，见 `judges` |
| `download` | 这个方向的作品提供不提供下载；白模渲染和 PV设计为 `false` |
| `tasks` | 这个方向已登记的题，现在每个方向至多一道 |
| `upcoming` | 题面还没出的方向（PV设计、字体与Logo设计）：`tasks` 为空，这里是按已定主题暂写的题 `{key, name, name_en, tagline, summary, highlights}`，题面定稿后会变；其他方向为 `null` |

`tasks[]` 每道题：

| 字段 | 内容 |
|---|---|
| `key` | 题标识，如 `sky-citadel`，题目页用它做网址 |
| `no` | 题的序号，按展示顺序数已登记的题，1 起 |
| `name`、`name_en` | 题名，展示用的写法，如「NVIDIA B200 网页艺术」 |
| `category` | 所属方向 `key` |
| `judge`、`download` | 同所属方向 |
| `tagline` | 点题短语 `{zh, en}`，放在题名旁 |
| `summary` | 主要内容 `{zh, en}`，两三句 |
| `highlights` | 看点 `[{zh, en}]`，3–4 条 |
| `statement` | 题面在仓库里的路径。网站现在不链题面：整个 `topics/审美全能/` 还没进 git（`.git/info/exclude`），见文末「上线之前」 |

`tagline`、`summary` 缺文案时为 `null`，`highlights` 为空数组。

### judges：评委

三位评委，每个方向只有一位点评。登记在 `videos/topics/aesthetics/judges/judges.json`。

| 字段 | 内容 |
|---|---|
| `id` | `gpt`、`claude`、`gemini` |
| `name` | 显示名，如 `GPT 6.2 Sol`（评委不是受测身份，不带推理强度） |
| `model` | `{key, id, vendor, logo}`：评委对应的型号；`logo` 是厂商图标名（`platform/厂商图标/mark/<logo>.svg`）。评委同时参测时，可以用 `key` 在 `models.json` 里找到它的型号页 |
| `persona` | 人设 `{zh, en}` |
| `categories` | 负责的方向 `key`，按展示顺序 |
| `portrait` | 立绘，格式见下文「图片」，带 `head` |

## models.json

数组，每项一个参测型号：

| 字段 | 内容 |
|---|---|
| `id` | 网址标识，如 `gpt-6-2-astra`，型号页用它做网址 |
| `key` | 平台型号键，如 `GPT/6.2Astra` |
| `name`、`short` | 名称、简称 |
| `effort` | 推理强度，如 `max` |
| `display_name` | 页面上写的名字「名字 (推理强度)」，如 `GPT 6.2 Astra (max)`；没有推理强度时就是名字 |
| `vendor`、`logo` | 厂商名、厂商图标名（站点从 `platform/厂商图标/mark/<logo>.svg` 同步） |
| `agent` | 作答用的智能体，如 `Codex` |
| `released` | 发布日期 |
| `tested` | 测评日期：参测登记写了就用它，否则取这个型号在本专题最近一次开始作答的日期 |
| `portrait` | 立绘，格式见「图片」，带 `head`；没登记时 `null` |

本专题不打分、不计时、不计费，数据里没有分数、名次、用时和开销。

## works.json

```json
{"sky-citadel": {"gpt-6-2-astra": {"state": "done", "images": [ … ], "download": { … }, "comment": null}}}
```

外层按 `topic.json` 的题目顺序，里层按 `models.json` 的型号顺序。只列有作答的作品，没做这道题的型号不出现。

| 字段 | 内容 |
|---|---|
| `state` | `done` 作答已结束；`answering` 这道题正在作答（新作答或重测），这时的图和下载包可能还没有，或者还是上一次的 |
| `images` | 展示用的图片，第一张是封面（`cover: true`）；素材还没导出时是空数组 |
| `download` | 下载包，没有时 `null`：方向不提供下载（看 `download`），或者包还没打好 |
| `comment` | 评语的位置，现在都是 `null`；以后是 `{zh, en}`，点评人是这道题所属方向的 `judge` |

`download`：

| 字段 | 内容 |
|---|---|
| `href` | 文件路径，`downloads/<文件名>` |
| `file` | 文件名，如 `gpt-6-2-astra_sky-citadel.html` |
| `bytes` | 字节数 |
| `kind` | `html`（单个网页，浏览器直接打开）或 `zip`（压缩包） |
| `note` | 说明 `{zh, en}`，如「单个网页文件，下载后用 Chrome 打开即可观看。」 |

## 图片

每张图有大图和缩略图，都是 WebP：

```json
{"src": "media/works/gpt-6-2-astra/sky-citadel/01.webp", "width": 1920, "height": 1080,
 "thumb": "media/works/gpt-6-2-astra/sky-citadel/01.thumb.webp", "thumb_width": 800, "thumb_height": 450,
 "cover": true}
```

- 大图长边不超过 1920，缩略图长边不超过 800，保持原比例；透明图保留透明。
- 作品图多一个 `cover`，第一张为 `true`、其余为 `false`。
- 立绘多一个 `head`：头部框 `{x, y, w, h}`，是占整张图宽高的比例（0–1），由 `videos/model_character/transparent/heads.json` 按原图像素量的框换算，可用来裁头像；没量过的立绘没有这个字段。
- 路径和文件名固定：作品图 `media/works/<型号id>/<题key>/NN.webp` 和 `NN.thumb.webp`，NN 从 01 起按展示顺序编号；型号立绘 `media/models/<型号id>/portrait.webp`，评委立绘 `media/judges/<评委id>/portrait.webp`（缩略图都是同名的 `.thumb.webp`）。同一份素材重做，文件名不变。

作品图从模型的作品里截取，挑法见 `tools/shots.py` 开头：

- 网页类作品（卡通渲染、创意网页设计、大型场景建模、SVG动画、体素建模、硬表面建模、游戏UI设计）从导出的作品视频里挑帧：去掉黑屏、空白、交叉淡化和运镜里拖糊的帧，按清晰、稳定打分，在整段视频上分段取候选，再挑彼此差别大的，一般每件 7–12 张。封面取视频开场 5 秒里最好的一帧：镜头组从全景开场，整页滚动从首屏开场，游戏界面从标题画面开场；SVG动画的短片取收尾 5 秒，也就是片尾那张冲线照片。其余按视频里的时间排。
- 硬表面建模和体素建模的 `peek/` 定点截图都用上（彼此重复的只留一张），视频帧补在后面、和截图重复的不要；全景 `full` 是封面，截图按它在视频里对应的时间排进去。
- 白模渲染用 6 张静帧，按题面相机顺序，第 1 张（门厅向里看的全景）是封面。

## 缓存与公开范围

- 重的产物放在 `website/.build-cache/aesthetics/`（不进 git）：`media/` 是图片，和数据目录里的 `media/` 同样的布局，每组图的目录里有一份 `shots.json`，记着来源文件的大小和修改时间、挑图参数和挑中的图；`packages/` 是下载包和清单 `manifest.json`。导出时按本次的型号和作品把用到的文件拷进数据目录，大小和修改时间没变的不重拷，数据目录里多出来的删掉。
- 作答目录和素材目录只读，图片和下载包都不写回去。
- 本地预览（`data-local/`）列出全部参测型号，包括本机私有型号。正式发布只列 `publish/confirmed.json` 里确认过、且已在公开参测登记里的型号。上线后 `data/` 进 git，但其中的 `media/` 和 `downloads/` 不进（`.gitignore`），随时可以从缓存重新拷出。

## 重新生成

在仓库根目录运行：

| 做什么 | 命令 |
|---|---|
| 作品素材导出或更新后，重做图片并刷新本地预览 | `python website/tools/export.py --topic aesthetics` |
| 只看挑图结果，把每件作品挑的图拼成总览图 | `python website/topics/aesthetics/tools/shots.py --sheet <目录>` |
| 改了挑图规则后全部重挑 | `python website/topics/aesthetics/tools/shots.py --force`，再完整刷新 |
| 打下载包 | 完整刷新会先自动打包（来源没变的沿用，`--live` 不打包）；只重打某几个包用 `python website/topics/aesthetics/tools/package.py --model … --task …`，再完整刷新 |
| 用户确认一个型号的作品可以公开 | `python website/tools/publish.py --confirm aesthetics "厂商/型号" --no-upload`：写进确认快照、解除待审核标记，再按平台流程构建（不加 `--no-upload` 会接着推送） |

- 导出时图片缓存按来源自动判断要不要重做，来源没变就直接用；`shots.py` 的 `--model`、`--task` 只做指定的作品。
- 作答关闭时平台自动跑 `export.py --topic aesthetics --live`。缺图、缺下载包、缺展示文案都照常导出，只打印提示：作品先没有图或没有下载，补齐后再刷新一次就有。
- 素材目录被清理掉以后，导出沿用缓存里上次做好的图；要撤下一件作品的图，删掉缓存里它的目录再刷新。
- `export.py` 在总站卡片里给出题目数、型号数和作品数，主色取 `meta/card.json`，介绍取专题清单的 `coming_soon`。评委人设的英文在 `meta/judges.json`。

## 仓库与版权素材

`topics/审美全能/` 纳入仓库：题面、设计素材（`设计/`）、专题清单 `专题.json` 和展示文案 `展示文案.json` 都在里面，别处 clone 下来可以照常 `npm run build` 和 `export.py`。第三方版权素材不进公开仓库，由 `.git/info/exclude` 排除：PV 题的歌曲、歌词和角色立绘（`题面/PV设计/素材/`），Logo 题的原版 Logo 和活动参考图，机甲题的参考照片；Blender 工程（`*.blend`）也不进仓库。归档工具同样不收作答里原样拷贝的题目素材和 Blender 工程，只在清单的 `excluded` 里记下来源。

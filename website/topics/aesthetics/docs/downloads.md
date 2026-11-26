# 作品下载包

观众在网站上按题下载某个型号的作答，拿到的是一个文件：网页作品是双击就能看的单个 html，其余是压缩包。每个型号每道题一个包，不做一键下载全部。包由 `tools/package.py` 生成，导出时拷进站点自己的静态文件（走阿里云 DCDN），所以要小：GitHub Pages 单个文件不能超过 100 MB，超过的打包命令会报出来。

## 哪些题有包

| 类别 | 包的形式 |
|---|---|
| 白模渲染、动效设计 | 不提供下载（动效作答里有第三方的角色立绘） |
| 创意网页设计 | 必须是单个 html |
| 卡通渲染、大型场景建模、SVG动画、体素建模、硬表面建模、游戏UI设计 | 优先单个 html；比对不过的退回压缩包，包里附打开说明 |
| 以后加的题（如字体与Logo设计） | 作答根部有 `index.html` 的按网页作品打；否则打压缩包 |

去掉平台材料后什么都不剩的，不出包。作答目录被清理掉以后，沿用上次打好的包（和作品图一样）；要撤下一个包，删掉 `package-work/<包名>/` 再运行一次。

## 包里放什么

只放模型自己交的东西。作答目录只读，先把要放的文件复制到缓存里再加工。去掉的有三类：

- **题面**：作答根部的题面文件（`专题.json` 里 `statement` 的文件名）。
- **平台发的材料**：`专题.json` 里 `materials` 指定的东西。放进子目录的整个去掉，如机甲题的 `参考图/`（有版权的产品照片）；放在根部的按原文件名去掉，如白模渲染的 `greenhouse_whitebox.blend` 和 `manifest.json`。
- **杂物**：隐藏文件和目录（`.git` 等）、`node_modules/`、`__pycache__/`、`screenshots/`、`截图/`、`logs/`、`tmp/`、`temp/` 目录；`.log`、`.tmp`、`.temp`、`.bak`、`.old`、`.orig`、`.swp`、`.swo`、`.pyc`、`.blend1` 之类的文件，`~` 结尾的备份，名字里带 `.原版.` 的备份，`Thumbs.db`、`desktop.ini`，以及 `screenshot`、`snapshot`、`截图`、`屏幕截图` 开头的截图。

作品运行要用的第三方库（如 `three.min.js`）和随附的许可证、来源说明都保留。`node_modules/` 不进包：作品运行的是模型自己打好的包，`package.json` 和锁文件留着，要重新构建可以自己 `npm install`。模型自己打包时去掉了库的许可证注释的（esbuild 的 `legalComments: 'none'`，如 Claude Opus 5.5 的三件 three.js 作品），单个 html 的开头注释里补上 three.js 的 MIT 许可证：页面里有 three.js（`__THREE__`）却没有「three.js authors」版权声明时补。

## 单个 html 怎么打

从作品的 `index.html` 出发，把它引用的本地文件都写进这一个文件：

- `<script src>` 换成内联脚本；带 `defer` 的改用 `data:` 地址，保留延后执行。
- `<link rel="stylesheet">` 换成 `<style>`，`@import` 的样式表展开，`url(…)` 按样式表自己的位置找文件。
- 图片、字体、音频、JSON、着色器等素材换成 `data:` 地址。认得出的写法有：样式里的 `url(…)`，以及页面和脚本里整段写在引号里的路径（如 `'airship.svg'`、`fetch('data/x.json')`）。拼接出来的路径认不出，比对时会发现。
- 用了模块脚本或 import map 的，先用 esbuild 按文档顺序打成一个不再引用其他文件的模块，再内联。
- 文件开头加一段注释：说明这是打包件，后面附作品目录里的 README、许可证和来源说明原文（只有单个 html 的包里没法另放这些文件），缺 three.js 许可证的补上（见上节）。文件带 UTF-8 BOM，保证双击打开时按 UTF-8 解码。

作品的代码本身不改，也不压缩。源码目录、构建脚本不进单个 html。

## 怎么比对

每个打好的 html 都比对一次，`tools/verify.mjs` 做：

- 无头 Chrome，1920×1080。原作品经本地网页服务器打开，打好的 html 以 `file://` 打开，两边注入同一个 `Math.random` 种子。
- 两边都用作品自己的 `window.videoExport` 以 3 帧/秒逐帧走完整段，在 2%、20%、40%、60%、80%、98% 处截图，逐对比较。截图前把页面上的 CSS 和 Web 动画停在这一帧的时刻：有的作品在导出模式下还有按真实时间转的 CSS 动画，不停住的话同一个作品打开两次也会差几条细线。平均差（0–255）超过 1.0，或任一通道差超过 24 的像素多于 0.5%，算画面不同。
- 收集控制台报错和未捕获异常，打好的 html 比原作品多出来的算不通过；它还要去读本地文件（原作品里有的文件）也算不通过。漏内联的小图标靠这一条查出，不靠截图。
- 原作品没有 `videoExport` 的，只比报错和本地文件读取，结果里会注明。

比对结果记在 `website/.build-cache/aesthetics/package-work/<包名>/state.json` 的 `check` 里。通过的用单个 html，截图不留；不通过的退回压缩包，包里加 `打开说明-How-to-open.txt`（用 `python -m http.server` 起本地服务器），比对截图和打好的 html 留在同一个目录里查原因。创意网页设计比对不过时同样先退回压缩包，但命令以退出码 1 结束并打印「要处理」，因为这一类必须修到单个 html。

## 压缩包

内容相同就生成完全相同的文件：条目按路径排序，时间戳固定为 1980-01-01 00:00，权限 0644，Deflate 9 级。包里有一层和文件名同名的文件夹，文件名按 UTF-8 记录。

## 产物和清单

都在 `website/.build-cache/aesthetics/packages/`：

```text
packages/
  manifest.json
  <型号网址标识>_<题key>.html | .zip      如 gpt-6-2-astra_autumn-observatory.html
```

`manifest.json`：

```json
{"packages": [
  {"model": "GPT/6.2Astra", "task": "autumn-observatory",
   "file": "gpt-6-2-astra_autumn-observatory.html", "bytes": 920462, "kind": "html",
   "note": {"zh": "单个网页文件，下载后用 Chrome 打开即可观看。", "en": "A single HTML file: download it and open it in Chrome."}}
]}
```

| 字段 | 含义 |
|---|---|
| `model` | 型号键，同仓库根目录 `models.json` 的 `key` |
| `task` | 题 key，同 `专题.json` |
| `file` | 包的文件名，只有小写英文、数字、`-` 和 `_` |
| `bytes` | 文件大小 |
| `kind` | `html`（单个网页）或 `zip`（压缩包） |
| `note` | 给观众看的一句说明，`{zh, en}` |

条目按参测登记的型号顺序、再按 `专题.json` 的题目顺序排。清单只列现有作答的包，也包括本机私有型号的（现在没有）；导出只拷它要公开的型号的包。

## 重新生成

完整导出（`python website/tools/export.py --topic aesthetics`，或不带参数刷新全部专题）会先把全部包跑一遍：来源没变的沿用，改了的重打并比对，再导出；实时刷新（`--live`）不打包，用现有的包。只想重打某些包时，在仓库根目录运行：

```powershell
python website/topics/aesthetics/tools/package.py                                    # 全部
python website/topics/aesthetics/tools/package.py --model GPT/6.2Astra --task autumn-observatory
python website/topics/aesthetics/tools/package.py --force                            # 来源没变也重做
```

- `--model` 收型号键或网址标识，`--task` 收题 key 或题名，都可以重复，做的是给出的型号和题的组合；不给就全做。
- 来源没变就沿用上次的包：比的是要放进包的文件清单、大小和修改时间，加上 `package.py`、`verify.mjs`、`bundle.mjs` 三个文件的内容。改了打包规则会全部重做。
- 重打一个包时旧包留在原处，新包做好后原子替换；每次运行最后按当前登记重写清单，再删掉不在清单里的包和工作目录。所以打包中途导出，拿到的是完整的旧包。
- 需要：本机 Chrome（路径登记在 `orchestrator/machine.json` 的 `runtime.chrome`）、Node 22 以上、Python 的 Pillow 和 numpy；第一次在 `website/topics/aesthetics/` 运行 `npm install` 装 esbuild（和网站的 Vite 一起装）。比对用 Chrome 自己的临时配置目录，结束时只关自己起的进程。
- 现有的包和比对结果看 `packages/manifest.json` 和各包的 `package-work/<包名>/state.json`。

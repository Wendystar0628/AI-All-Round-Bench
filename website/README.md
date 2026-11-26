# 网站

正式域名下是一个总站加若干专题站：总站在 `/`（英文 `/en/`），每个上线专题在 `/<id>/`（`<id>` 是专题标识）。总站和每个专题站都是独立的项目，共用的只有一条导出与发布流水线和本文的契约，没有共用的界面代码。

## 目录

```text
website/
  README.md              本文：网站架构与站点项目契约
  hub/                   总站项目：只认通用卡片格式（hub/README.md），字体等素材自带
  tools/                 共用流水线：导出驱动 export.py 与共用件 export_core.py、发布 publish.py、预览 preview.py（tools/README.md）
  topics/<id>/           每个专题一个站点项目（下文契约）
  dist/  .build-cache/   拼好的整站与各专题成品缓存（不进 git）
```

网站用到的登记和素材都不在 `website/` 里：

| 东西 | 位置 |
|---|---|
| 专题清单（`website_status`：`online` 上线、`draft` 只在本地预览、`none` 没有站点项目；可选 `coming_soon`：还没有站点时在总站显示一张「筹备中」卡片，写一句 `{zh, en}` 介绍） | `topics/<名>/专题.json` |
| 参测登记 | `topics/<名>/参测.json` |
| 本专题的设计系统（品牌、装饰、类别图标、字体） | `topics/<名>/设计/` |
| 型号身份（名字、厂商、图标名） | 仓库根目录的 `models.json` |
| 厂商图标（`mark/` 标记、`wordmark/` 字标） | `assets/厂商图标/` |

## 数据与发布

- **导出**分两层：共用驱动 `tools/export.py` 读登记、调各专题的导出插件、写总站卡片；每个专题的插件 `topics/<id>/export.py` 写本专题的数据文件，返回总站卡片（格式见 `hub/README.md`）。插件接口：
  ```python
  def export(ctx, out: Path, formal: bool) -> dict      # 写本专题数据文件，返回总站卡片
  def confirm(ctx, model: str) -> None                  # 更新本专题确认快照
  def summary(card: dict, out: Path) -> list[str]       # 发布日志里打印的几行
  ```
- **本地预览数据**：评分完成、改分、作答关闭时，平台按专题刷新本地数据（`export.py --topic <id> --live`），写进该项目的 `data/` 和 `data-local/`，以及总站的本地卡片。`website_status` 为 `none` 的专题跳过。
- **发布**：`tools/publish.py` 对每个上线专题用确认快照导出一份正式数据、构建该项目，再构建总站，拼成 `dist/`：总站放 `/`，专题放 `/<id>/`。专题构建失败时用上次成功的成品。专题的 `publish/legacy-routes.json` 声明的旧网址在根下生成跳转页。命令、暂停推送和托管配置见 `tools/README.md`。

## 站点项目契约

每个专题站是 `website/topics/<id>/` 下的一个 npm 项目，挂在 `/<id>/`。用什么框架、页面怎么设计由该专题自己定，只须守下面几条：

1. **构建**：`npm run build` 从环境变量 `ONESHOT_SITE_DATA_DIR` 读数据目录，从 `ONESHOT_SITE_BASE`（`/<id>/`）读站内根路径；配置里不写死根路径。产出 `dist/index.html`（中文首页）和 `dist/en/index.html`（英文首页），数据文件随构建拷进 `dist/`。`publish.py` 构建时两个变量都会给，另给一个 `ONESHOT_VOTES_API`（观测者票选的接口所在的源，取自 `tools/publish.json` 的 `votes_api`；用不到的站点不管它）。
2. **开发**：`npm run dev` 优先读本项目的 `data-local/`（可含本机私有型号，不进 git），没有再读 `data/`。
3. **回总站**：每页页头必须有回总站的入口，中文页链到 `/`，英文页链到 `/en/`（不加站内根路径）。
4. **语言**：中文在根路径，英文在 `en/`。选择记在 `localStorage` 的 `octa.lang`（`zh` / `en`），总站和各专题站共用这个键；第一次访问按浏览器语言，地址带 `?stay` 时不跳。
5. **素材**：厂商图标从 `assets/厂商图标/` 同步；本专题的设计系统从 `topics/<名>/设计/` 同步。不取别的专题的素材，同步来的副本不进 git。
6. **型号名**：受测型号一律写成「名字 (推理强度)」，如 `Claude Opus 5.5 (xhigh)`。
7. **项目里的文件**：
   - 站点源码（`package.json`、构建配置、页面、脚本、样式、长文）和自己的 `.gitignore`（至少排除 `node_modules/`、`dist/`、`data-local/` 和同步来的素材）；
   - `export.py`：导出插件；
   - `meta/`：站点文案；`meta/card.json` 是总站卡片的主色 `{"accent": "#rrggbb"}`；
   - `publish/`：确认快照 `confirmed.json`、暂停公示 `notice.json`，以及本专题需要的其他发布文件（如旧网址清单 `legacy-routes.json`）；
   - `docs/`：本专题网页的设计文档；
   - 生成物：`data/`（进 git）、`data-local/`、`dist/`、`node_modules/`（都不进 git）。

## 新增一个专题站

建站之前想先在总站预告：在专题清单加 `coming_soon`（`website_status` 保持 `none`），再运行 `python website/tools/export.py`。

1. 照上面的契约在 `website/topics/<id>/` 建站点项目，写导出插件 `export.py` 和 `meta/card.json`。
2. 把 `topics/<名>/专题.json` 的 `website_status` 改为 `draft`，本地预览没问题后改为 `online`。
3. 开发预览：在 `.claude/launch.json` 加一项 `<id>-dev`（`npm --prefix website/topics/<id> run dev`）。
4. 总站不用改：卡片由导出插件给出。插件要用一种总站还不会画的展示块时，按 `hub/README.md` 给总站加一种画法。

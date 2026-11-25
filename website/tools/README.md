# 网站导出、预览与发布

以下命令在仓库根目录运行。拼音索引依赖 `pypinyin`，可用 `python -m pip install pypinyin==0.53.0` 安装。站点项目的七条构建约定见 [网站说明](../README.md)。

## 日常命令

| 操作 | 命令 |
|---|---|
| 刷新所有已建站专题、正式和本地总站卡片 | `python website/tools/export.py` |
| 完整刷新一个专题 | `python website/tools/export.py --topic <id>` |
| 评分或作答变化后刷新实时数据和本地卡片 | `python website/tools/export.py --topic <id> --live` |
| 导出一个上线专题的正式构建输入供核对 | `python website/tools/export.py --topic <id> --formal --out <独立目录>` |
| 用确认数据拼站，供本地检查 | `python website/tools/publish.py --no-upload` |
| 浏览已拼好的整站 | `python website/tools/preview.py --open` |
| 用当前确认数据发布 | `python website/tools/publish.py` |
| 用户确认一个型号后更新该专题快照并发布 | `python website/tools/publish.py --confirm <id> "厂商/型号"` |

根目录的 `打开成绩网站.cmd` 依次构建并打开预览。已有开发启动项为 `site-preview`（5181，整站）、`decathlon-dev`（5188，十项全能）、`hub-dev`（5189，总站）、`aesthetics-dev`（5195，审美全能）。开发服务器优先读各自的 `data-local/`。在沙盒测试整站时可显式指定 `preview.py --port 28150`。

## 数据去向

| 专题的 `website_status` | 站点项目的导出目录 | 总站 |
|---|---|---|
| `online` | `data/` 为公开登记型号的实时数据。开发用的 `data-local/` 可含本机私有型号。发布另用独立目录读取确认快照 | 本地卡片来自实时数据，正式卡片来自确认数据 |
| `draft` | 仅导出到 `data-local/` | 只进入本地卡片 |
| `none` | 跳过 | 跳过 |

专题清单可选的 `coming_soon`（`{"zh": "…", "en": "…"}`，一句介绍）：该专题在某份总站索引里还没有自己的卡片时，`export.py` 写索引（本地、正式和发布时的都算）会补一张 `status: "soon"` 的卡片，只含 `id`、`name`、`name_en` 和这句 `about`，排在其他卡片后面。专题有了上线卡片后这张自动让位；本地预览里草稿卡片同样优先。

总站卡片写入 `website/hub/{data,data-local}/topics.json`。单专题刷新替换该专题的卡片，并保留索引中其余符合状态的专题。`--live` 只更新本地卡片，十项全能在此模式下会补齐缺少的静态数据。改题面、文案或题表后用完整刷新。首次准备所有专题的预览时运行不带参数的导出命令。

作答关闭、清理到时会话及评分变更时，平台调用 `site_publish.request(topic, model)`，后台刷新该专题的预览。结果送至指挥的事件队列，日志在 `orchestrator/logs/<id>/site/`。

## 参测登记与公开范围

- `平台/型号.json` 记录共用型号身份，包括评测键 `key`、小写网址标识 `id`、全名、简称、别名、厂商、地区和图标名。网站从 `平台/厂商图标/mark/<logo>.svg` 取图标。
- `专题/<名>/参测.json` 以同一个 `key` 登记该专题的作答工具 `agent`、推理强度 `effort`、测评日期 `tested` 和待审核标记 `audit`。日期留空时取该型号在本专题最近一次作答的开始日期。用户明确确认完整成绩后，以 `--confirm` 更新该型号的快照并解除审核标记。
- 本机私有身份在 `orchestrator/private_models.json` 里按 `topics.<id>` 登记参测信息。私有型号只进入忽略跟踪的 `data-local/`。确认公开成绩需要该型号已在公开身份表和本专题参测表登记。
- 单题的实时成绩可以先展示。十项全能须有全套 13 题最终成绩才有总分和名次，按规则判为 0 分也计入。正式数据从已确认快照筛选当前公开且通过审核的条目。
- 本地和正式构建的开销都取当前专题台账，按网站白名单导出金额、Token、用时、吞吐率、套餐与计价来源。内部推算依据、题目级明细、运行路径和会话号留在平台。套餐、汇率及计价来源在 `orchestrator/billing.json`，本专题的核算调整在 `orchestrator/topics/<id>/billing.json`。详见 [测试开销](../../orchestrator/docs/测试开销.md)。

## 专题插件

共用驱动 `export.py` 按专题清单选取站点。共用件 `export_core.py` 提供身份与参测登记、专题作答记录、确认快照读写、JSON 原子替换、开销字段筛选、题干摘录与搜索拼音。每个站点在 `website/topics/<id>/export.py` 提供三个函数。

| 函数 | 用途 |
|---|---|
| `export(ctx, out, formal) -> dict` | 把该站点的数据写入 `out`，返回一张通用卡片 |
| `confirm(ctx, model) -> None` | 确认本专题的一个型号，写入本专题的快照 |
| `summary(card, out) -> list[str]` | 根据实际构建数据生成发布摘要 |

`ctx.topic` 是专题对象，`ctx.project` 是站点目录。`ctx.include_private` 仅在导出本机预览时打开，`ctx.live` 表示实时刷新。卡片主色取本站 `meta/card.json`，统计项和展示块由插件返回。卡片字段见 [总站数据格式](../hub/README.md)。

十项全能的站点文件相对 `website/topics/decathlon/` 放置。

| 文件 | 内容 |
|---|---|
| `meta/tasks_meta.json` | 类别、题目与说明页的双语文案和搜索别名 |
| `meta/graders.json` | 本专题评分员的公开显示名和显示顺序 |
| `publish/confirmed.json` | 用户逐个确认的成绩和当时的测试日期 |
| `publish/notice.json` | 写入 `{"notice":{"zh":"…","en":"…"}}` 暂停正式成绩公示，恢复时将 `notice` 改为 `null`。本地预览继续显示实时成绩 |
| `publish/zero-reasons.json` | 以题名、型号为键登记 0 分原因。导出只选取本次数据里实际得 0 分的项 |
| `publish/zero-reasons-prompt.md` | 补写 0 分原因时使用的派工说明 |
| `publish/legacy-routes.json` | 冻结的旧网址清单、跳转页文案和 404 兜底声明 |

该插件按清单顺序输出类别和题目。评分读取专题评法的题分、类别分与总分，按一位小数排同分名次。`scores.json` 保留逐题缺分原因、设计题评分员分数和匿名异常说明。`stems/` 依据题面标题摘录正文和材料中的分题，`search.json` 含型号、题目、类别、说明页的名称、别名、拼音全拼和首字母。详见 [题干规则](../topics/decathlon/docs/tasks.md) 和 [0 分原因](../topics/decathlon/docs/zeros.md)。

审美全能的插件不打分，数据约定见 [审美全能数据](../topics/aesthetics/docs/data.md)，下载包见 [作品下载包](../topics/aesthetics/docs/downloads.md)，站点怎么开发、预览见 [审美全能网站](../topics/aesthetics/README.md)。作品图在导出时按素材自动挑（有缓存）；下载包在完整导出时先自动打好（有缓存，`--live` 不打包）。

## 拼站与托管

1. `publish.py` 向每个上线专题的 `npm run build` 提供 `ONESHOT_SITE_DATA_DIR` 和 `ONESHOT_SITE_BASE=/<id>/`，将带中英文首页的成品、卡片和发布摘要一同缓存。某个专题构建失败时使用上次成功的整包；首次失败且缺少缓存时跳过该专题。所有上线专题均无可用成品时中止发布。
2. 总站从 `ONESHOT_SITE_DATA_DIR` 读本次实际采用的专题卡片。拼好的整站在 `website/dist/`，总站挂在 `/`，专题挂在 `/<id>/`。专题可声明根下需要保留的旧网址，跳转保留查询参数和锚点。至多一个专题承接未知网址的 404 兜底。
3. `website/tools/site.json` 中 `"hold": true` 暂停推送，仍可构建。在 `--confirm` 后追加 `--no-upload` 也可单次只构建。公示提示须重新正式发布后才对访客生效。
4. 远端 Pages 的目标分支和域名在 `publish.json`。推送会将整站连同 `CNAME` 和 `.nojekyll` 发布到该分支。托管使用 GitHub Pages 分支根目录，并由阿里云 DCDN 代理自定义域名。源站为 `wendystar0628.github.io`，回源 HOST 设为加速域名；HTML/JSON 缓存 5 分钟，静态 assets 缓存 365 天。域名 CNAME 到 DCDN，HTTPS 和用量封顶在 DCDN 配置。

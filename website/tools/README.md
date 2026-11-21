# 成绩网站的登记、导出和发布

在项目根目录运行本文命令。如尚未安装搜索拼音依赖，运行 `python -m pip install pypinyin==0.53.0`。

## 登记型号与参测信息

1. 在 `website/tools/models.json` 登记共用信息。一种型号使用一个网址标识 `id`（小写字母、数字和连字符）和一个评测记录键 `key`（如 `GPT/6.1Sol`）。
   - 填全名 `name`、简称 `short`、搜索别名 `aliases`、厂商 `vendor`、地区 `region` 和图标名 `logo`。同一厂商统一写法，新图标放在 `website/logos/mark/<logo>.svg`。
   - 出片时由做视频的 AI 自己加（可选，网站不用，测评视频的 `build_data.py` 读；不问用户）：`released` 发布日期 `YYYY-MM-DD`，查厂商官方发布信息；`tier` 定位（顶级旗舰 / 中高端性能主力 / 均衡性价比型 / 甜点快速型），按产品线位置判断；`series` 选手页背景大字，用模型代号（大写英文一个词，如 `OPUS`、`SOL`）；`portrait` 立绘文件名（`videos/model_character/transparent/` 里的透明 PNG），用这个模型自己的立绘，没有专属的用同厂商的（如 `claude.png`）；它的头部框登记在同目录 `heads.json`；`cover_name` 封面上显示的型号名（用户要求封面带版本号等时才写，如 `DeepSeek V4.1 Flash 1017`），只有封面用，片中和网站仍用 `name`。
2. 在 `website/tools/topics/<专题 id>/participants.json` 用同一个 `key` 登记该专题的参测信息。例如十项全能使用 `topics/decathlon/participants.json`。

   ```json
   {
     "GPT/6.1Sol": {
       "agent": "Codex",
       "effort": "xhigh",
       "tested": "2026-11-04"
     }
   }
   ```

   `agent` 是作答工具，`effort` 是展示在型号名后的推理强度。`tested` 留空时取该型号在本专题最近一次作答的开始日期。待审核型号加 `"audit": true`，可在本地查看。待该型号本专题全部题目评分完成并获得用户明确确认，再用下文的 `--confirm` 更新该专题快照并解除其审核标记。
   网站导出、确认、视频数据和封面都读取本专题的 `participants.json`。采集用量时按作答题所属专题的 `agent` 选择会话记录读取器。
3. 同时登记 `orchestrator/billing.json`：`models.<key>` 映射到 `plans` 的套餐。订阅填月费 `price`、币种 `currency`、`period: month`，按 ModelDial 填该型号的 `weekly_tokens_e8`（亿 Token）；积分套餐填套餐积分 `credits`。没有周额度时，填官方 `api_prices` 的分档价格、套餐 `estimate_ref` 与参考型号 `weekly_api_usd`。`source` 保留来源、日期及美元人民币汇率。`usage_proxy` 仅在明确需要历史型号代理时配置；全无本型号实测用量才启用，13 题全标拟合，使用目标型号自己的套餐。
   来源若为平均月Token，先以“月Token × 12 ÷ 52”换成周值写入；不要把月值直接当周值。Gemini Carbon/Hydrogen按2026-11-13截图的95.3/126亿Token每月与$199.99月费直接折算，不再套用其他型号的估计。
4. API 计费套餐必须登记本型号官方 `api_prices`：输入（缓存未命中）、缓存命中、输出、币种、提示长度分档及时段规则、来源网址和读取日期；按本地逐次请求记录自动算 API 等值并换成人民币，直接作为开销。`total_cny` 只可保留为历史对照，不再要求用户提供；重测自动选最新作答及续做重算。缺映射、官方价格、汇率或参考额度时金额为 null，网站显示“数据暂缺”，`costs.py status` 和导出日志列出缺项，不用 0 代替。

本地预览会显示已评定的单题分数。未测齐时，总分和总榜名次为 `null`。正式榜单从本专题已确认记录取数，并按当前参测登记和审核状态筛选。按规则评为 0 的题视为已有成绩。

## 暂停公示

需要暂停某专题的成绩公示时，在 `website/tools/topics/<专题 id>/site.json` 写入双语提示，例如

```json
{ "notice": { "zh": "正在重新设计题目，测评中", "en": "The tasks are being redesigned; testing is in progress" } }
```

- **打开**：`notice` 写中英两句。导出时一个模型都不输出（效果同所有模型都带 `audit`，`models.json` 本身不用改），`scores.json` 带上这句 `notice`；首页、排行总榜、题目类别榜和模型得分页只显示这条提示和去题目详情、挑战赛说明的按钮，题目页的「各模型得分」也只写这句；题目页、题目详情、挑战赛说明和猜你想问照常。
- **关闭**：把 `notice` 改成 `null`，一切恢复原样。
- 改完运行 `publish.py` 才对正式站生效；本地实时预览不受正式暂停公示影响。

## 暂停推送

整站共用一个推送开关，位于 `website/tools/site.json` 的 `hold` 字段。

- **打开**：`"hold": true`。手动 `publish.py` 只构建已确认正式成绩，不推送；自动评分只刷新本地，不走此入口。
- **关闭**：改为 `false`（或删掉），再运行 `publish.py` 推送。
- 和 `notice` 互不影响：`notice` 管网页上显不显示成绩，`hold` 管推不推送。

## 导出和本地预览

| 命令 | 结果 |
|---|---|
| `python website/tools/export_data.py` | 完整导出各专题数据，以及总站正式和本地摘要 |
| `python website/tools/export_data.py --topic decathlon --scores-only` | 刷新十项全能的型号、成绩、搜索索引、0 分原因和总站本地摘要，缺少静态数据时补全题目和题干 |
| `python website/tools/export_data.py --topic decathlon --confirmed --out <独立目录>` | 将本专题完整的正式构建输入写入指定目录，便于单独核对 |

十项全能的 `website/site/data/` 保存公开登记型号的实时数据，`data-local/` 供开发预览读取，可含本机私有登记。总站正式摘要写入 `website/hub/data/topics.json`，只收录清单标为 `online` 的专题，成绩与对应专题的正式快照同源。`website/hub/data-local/topics.json` 同时收录草稿专题和本地预览成绩。每个条目包含入口网址、题数、类别数、已上榜型号数、成绩日期和按总分排序的前三个型号。

私有型号登记在本机的 `orchestrator/private_models.json`，其中 `topics` 以专题 id 为键，可分别指定作答工具、推理强度和测评日期。没有 `topics` 的历史登记归十项全能。所有 `data-local/` 目录仅供本机使用。

评分结束后，`orchestrator/site_publish.py` 在后台刷新相应专题及总站本地摘要。结果通过事件送给指挥，日志文件名为 `preview-<专题 id>-<时间戳>.log`。改动题目后运行完整导出命令。

## 发布

| 命令 | 结果 |
|---|---|
| `python website/tools/publish.py --no-upload` | 用已确认成绩独立构建并拼站，成品在 `website/dist/` |
| `python website/tools/publish.py` | 构建并按全站 `hold` 设置推送到配置的 Pages 分支 |
| `python website/tools/publish.py --confirm decathlon "厂商/型号"` | 用户明确确认后更新十项全能的指定型号，再构建发布。加 `--no-upload` 可仅构建 |

1. 导出各上线专题的确认数据到独立目录，通过 `ONESHOT_SITE_DATA_DIR` 传给网页项目。每个项目分别执行 `npm run build`。专题构建失败时使用 `website/.build-cache/topics/<id>/` 中上次成功的正式成品。首次构建失败且没有缓存时，本次拼站跳过该专题。如果上线专题均无可用成品，整站发布中止。
2. 用本次采用的专题成品汇总首页数据，把该目录通过 `ONESHOT_HUB_DATA_DIR` 交给 `website/hub/` 构建。总站放在 `website/dist/` 根目录，专题成品放在各自清单的 `paths.url` 下。十项全能的项目目录 `paths.website` 为 `website/site`，站内路径为 `/decathlon/`。构建结果按专题打印成绩摘要。
3. `/` 和 `/en/` 分别保留为总站中英文首页。根据十项全能成品的其余页面生成旧网址跳转页，保留查询参数和锚点，canonical 指向正式新网址。根目录的 `404.html` 将未知旧路径转到十项全能，例如 `/en/old/` 转到 `/decathlon/en/old/`。
4. 推送时将整站连同 `CNAME`、`.nojekyll` 作为一个新提交强制推到 `publish.json` 指定分支。访问自定义域名时，经阿里云 DCDN 到 GitHub Pages，页面在 DCDN 缓存到期后更新。

运行仓库根目录的 `打开成绩网站.cmd` 可构建并打开拼好的整站。开发工具的启动项中，`site-preview` 在 5181 端口预览整站，`site-dev`（5188）和 `hub-dev`（5189）分别开发十项全能和总站。开发服务器优先读取本项目的 `data-local/`，缺少它时读取 `data/`。

**一次性准备**：
1. GitHub：仓库 Settings → Pages，来源选 `publish.json` 的 `branch` 分支根目录，自定义域名填它的 `domain`（DNS 指向 DCDN，GitHub 的 DNS 检查报警不用管，不勾强制 HTTPS）。
2. 阿里云 DCDN：加速域名为 `domain`，源站类型「域名」`wendystar0628.github.io`、端口 80、回源协议 HTTP、回源 HOST 设为加速域名；缓存规则：`html`、`json` 5 分钟，目录 `/assets/` 365 天；HTTPS 用免费证书并强制跳转；设用量封顶。
3. 云解析：`domain` 的主机记录 CNAME 到 DCDN 给出的地址。

## 文件和规则

| 文件 | 来源 |
|---|---|
| `models.json` | 共用型号身份、图标和出片字段 |
| `topics/<id>/participants.json` | 本专题参测型号与 `agent`、`effort`、`tested`、`audit` |
| `site.json` | 全站推送开关 `hold` |
| `topics/<id>/site.json` | 专题暂停公示的双语提示 `notice` |
| `topics/<id>/tasks_meta.json` | 类别和题目的中英文案（名称、短名、一句定位、交付物、搜索别名），说明页各节标题 |
| `export_data.py` | 默认本地实时导出；`--topic <id> --confirmed --out <独立目录>` 导出正式快照 |
| `topics/<id>/confirmed-scores.json` | 已确认公开成绩快照，只能显式确认某型号时更新 |
| `topics/<id>/zero-reasons.json` | 0分盘点的原因：按题名、型号存 `{kind, zh, en}`；导出时只取当前确实是 0 分的写进 `data/zeros.json`，不随快照冻结（见 `website/docs/zeros.md`） |
| `zero-reasons-prompt.md` | 派 Sol 补 0 分原因的任务说明；导出日志列出「这些 0 分还没写原因」时，把那几条题名、型号补在末尾，用 `sol_exec.py --work` 派出 |
| `publish.py` | 唯一的发布命令：导出、构建、推送 |
| `publish.json` | 发布目标（自定义域名、分支），只在这里规定，不含密钥 |

- 本地分数用 `orchestrator/grading.py` 的 `load`、`task_scores`、`model_scores` 算，和 `grading.py status` 一致，一位小数。权重、限时、题型取专题清单。
- 题目顺序：按专题清单的类别顺序排列，各类别内按清单题序编号。十项全能的 `no` 为 01–13。
- 十项全能正式成绩须全套 13 题无评分缺口且已由用户明确确认；缺答按规则正式计 0 分亦属完整。本地可查看已有 final 单题分数，未齐题时 total/rank 为 null；视频仍严格排除未完整模型。
- 在已定格式之外加的字段：
  - `models.json`：`key`、`aliases`（登记表里出片用的 `released`、`tier`、`series`、`portrait` 不导出到网站）；
  - `tasks.json`：类别加 `short`、`short_en`、`icon`、`kind`、`brief`、`brief_en`；题目加 `path`、`no`、`category`、`statement`（题面在仓库里的路径）；
  - `scores.json`：顶层 `order`（总榜顺序，评测中的排在最后）、`notice`（暂停公示时的中英提示，平时 `null`）；每个模型加 `status`、`done`（已出分题数）、`rank`、`category_ranks`、`task_ranks`（同分同名次）。
  - `scores.<模型 id>.task_info`：按题目 key，只写分数本身说不出的内容，没有可补充的题不出现。`state` 是没出分的原因：`testing` 评测中（还在作答或还在评分）、`missing` 未交、`failed` 评分失败、`unscored` 评分员没给总分；`graders` 是设计题主项有两位评分员时各自单独给出的题分（`[{name, score}]`，性能项仍用它自己的评分员，两者平均就是题分）；`anomaly` 是分数异常说明（`[{text}]`），只公开异常原文及其顺序，不公开异常所属评分员；设计题正常的 `graders` 分项不变。网站的成绩矩阵和题目类别榜“按题”视图用它写格里的短标记和浮签。
  - “未交”的判定：`grading.py` 报这题缺少提交（没有评分任务，也没有作答目录），并且 `orchestrator/state.json` 里这个模型这题的作答记录已经关闭；作答记录还没关闭或没有记录时算评测中。
  - 测试开销只按公开白名单导出：`scores.json.cost_source` 为 `{name, name_en, url, fetched, usd_cny}`；`scores.<模型 id>.cost` 为 `{cny, basis, plan, tokens, tasks, method, api_usd, api_cny, hours, tps, tps_replies}`，金额、Token 和时长只累计已答的题（`tasks` 为计入的题数）。`plan` 只含 `name`、`name_en`、`price`、`currency`、`period`、`credits` 中已有的通用套餐字段。金额、Token、计费方法及测试时长沿用 `orchestrator/costs.py` 的计算值；不公开内部采集情况、估算标记或题目清单、代理关系、日志路径、运行/会话 ID、`fitted`、`fit_basis`、`usage_gaps`、`pricing_issues` 及其他扩展。JSON/CSV 下载只读这些公开数据，不另取内部台账。换算和内部核算约定见 `orchestrator/docs/测试开销.md`。
- 本地和正式数据的开销都从当前用量台账读取。作答日志和用量由 clean、close、核心归档入口自动入账。
- `updated` 是用到的评分结果文件（`result.json`）里最晚的修改日期。
- `search.json`：`{ items: [{ type, id, name, en, short, terms, py, pyi, href, … }] }`，`type` 为 model、task、category、section；`py`、`pyi` 是名称、短名和中文别名的拼音全拼和首字母（数组）。
- `stems/<类别>/<题目>.json`：题目页的题干，完整导出时更新当前题干并清除已撤题的 JSON。摘录规则只写在 `export_data.py` 的 `STEM_RULE` 注释和 `NOT_STEM` 词表（按标题排除作答、规定、评分、环境、录制接口等章节，题面旁材料文件夹里的 `第NN题.md` 接在后面），`website/docs/tasks.md`「题干的摘录规则」照录并写明理由。改题面后重新发布，题干自动跟上。

- 只算已答的题（有实测用量或已有评分），未答和正在作答的题不推算。已答但缺用量日志的题按实际运行时长补估：已测 Token 合计 / 对应运行分钟合计 × 该题实际分钟；代理也只补已答的题，按目标自己的时长缩放。内部计算的可选 `cost.fit_basis` 记录速率、来源、各题分钟及限时回退，不进入网站导出；详见测试开销约定。新型号启动前即写 E 盘 runtime.json，每次归档把用量与时长一并入台账，核心归档和清理前自动采集，正常完整测试无需拟合。

- 最新作答按计时记录和显式续做关系选择，日志缺失不能回退旧作答。部分续做缺日志只补缺失段；内部 `cost.fit_basis` 带时间精度、缺失段和归属证据，不公开。只知截止的时长标为“实际停止未知”。内部 `cost.usage_gaps` 表示服务未返回用量，不能用字符数冒充实测。

# 网站架构约定

本文是实现约定，给并行开发的各方共用。设计以 README.md 和各页文档为准，这里只定代码怎么分、数据怎么来、谁改哪些文件。

## 一、型号与参测登记

- 共用型号身份和出片字段放在 `website/tools/models.json`。`key` 对应评测记录里的型号，例如 `GPT/6.1Sol`，`id` 用在网址里，例如 `gpt-6-1-sol`。厂商图标放在 `website/logos/mark/`。
- 各专题在 `website/tools/topics/<id>/participants.json` 按 `key` 登记参测型号、作答工具、推理强度、测评日期和审核状态。专题清单 `专题/<专题名>/专题.json` 的 `paths.website`、`paths.url` 指定独立网页项目和站内路径。

## 二、数据与发布

- `website/tools/export_data.py` 按专题调用 `orchestrator/grading.py` 的 `task_scores`、`model_scores`。各专题的题序、权重、限时取自清单，双语文案和搜索别名取自 `website/tools/topics/<id>/tasks_meta.json`。
- 十项全能的实时数据写到 `website/site/data/`，包含 `models.json`、`scores.json`、`tasks.json`、`search.json`、`zeros.json` 和题干 `stems/<类别>/<题目>.json`。开发服务器优先读取包含本地私有型号的 `data-local/`。题干摘录规则见 `tasks.md`。
- 总站从 `data/topics.json` 读各专题的入口、题数、类别数、已上榜型号数、更新日期和总分前三名。正式摘要来自上线专题的确认成绩，开发摘要来自各专题本地数据，并包含草稿专题。
- 评分完成或改分后，调度通过 `orchestrator/site_publish.py` 刷新本专题与总站的本地数据。正式成绩保存在各专题的 `confirmed-scores.json`，用户明确确认指定型号后，用 `publish.py --confirm <专题> <型号>` 更新。
- `python website/tools/publish.py --no-upload` 构建各上线专题和总站，按清单路径拼到 `website/dist/`。普通 `publish.py` 还会按全站 `hold` 开关推送。专题构建失败时取上次成功的正式成品，成绩摘要随实际使用的成品。具体命令、预览入口和托管配置见 `website/tools/README.md`。

## 三、页面与路由

- 每种页面一个 HTML 模板，放在 `site/pages/<类型>.html`；对应一个脚本入口 `site/src/pages/<类型>/main.js`。
  - 页面类型：`home`、`leaderboard`、`categories`、`about`、`faq`、`tasks`、`task`、`model`、`zeros`。
- 构建时由 `vite.config.js` 里的路由插件，按模板和 `site/data/*.json` 生成每个路由的 HTML：
  - 中文版在 `/decathlon/`，英文版在 `/decathlon/en/`；
  - 中文题目页位于 `/decathlon/tasks/<类别>/<题目>/`；
  - 每个导出的模型一页 `/decathlon/models/<id>/`（中文模型得分）；入口页 `/decathlon/models/` 是总分第 1 名的那一页。
  - 开发服务器用同一套规则。
- 生成的页面在 `<body>` 上写 `data-page`、`data-lang`、`data-id`（模型 id 或题目路径），页面脚本据此渲染。
- 网站挂在发布域名的 `/decathlon/` 下（`vite.config.js` 的 `base`；根路径是总站首页 `website/hub`），站内链接一律经 `core/route.js` 生成。

## 四、目录与分工

```text
site/
  package.json  vite.config.js  README.md
  pages/                 页面模板（骨架方建，各页负责人改自己那一个）
  data/                  导出脚本的产物（数据方）
  public/                字体、星图底纹、厂商图标、类别图标、装饰，由同步脚本从 website/ 拷入（骨架方）
  src/
    core/                取数、i18n、路由信息、主题、网址参数和本地存储、格式化（模型名加推理强度）（骨架方）
    shell/               命令栏、全站搜索、快捷键表、模型侧面板、页脚、深浅和语言切换（骨架方）
    charts/              共用的星盘、导出图片、配色取值、坐标轴工具（骨架方）
    ui/                  共用的模型行、工具条（厂商筛选、搜模型、勾选对比）、数据下载（骨架方）
    styles/              全站样式：技能的 stellar.css 加本站的 visual.md 补充（骨架方）
    motion.js            动效档位和曲线（骨架方，按 motion.md）
    i18n/zh/<命名空间>.json、i18n/en/<命名空间>.json   common 归骨架方，每页一个命名空间归该页
    pages/<类型>/         各页自己的脚本、样式和部件（各页负责人）
  content/               说明页、猜你想问和题目页的长文，中英各一份（阅读页负责人）
tools/
  models.json  export_data.py                    共用登记与导出
  topics/<id>/                                   专题参测登记、快照、题目文案和 0 分原因
  publish.py  publish.json                       发布（README.md）
```

- 各页负责人只改 `pages/<自己的类型>.html`、`src/pages/<自己的类型>/`、自己的 i18n 文件和 `content/` 下自己的文件。
- 共用部件归骨架方。页面需要的共用部件不够用时，先在自己的页面目录里扩展，在交付说明里写明，最后由整合方并入。

## 五、共同约束

- 设计系统用 `website/stellar-ui-skill`；视觉和动效按 `website/docs/visual.md`、`motion.md`；各页内容按对应文档。
- 素材只用 `website/decor`、`website/logos`、`website/icons/categories` 和技能自带的素材，不用 `assets/readme/` 下的旧图。
- 界面文字都放在 i18n 文件里，中文是主语言。
- 按桌面网页设计（宽 1024 以上）；模型得分页、题目类别榜和题目页在手机宽度下也不出现横向滚动。浅色、深色两套主题都要验收。
- 网站轻量，不展示作品的截图、录像和解答，也不放视频文件。

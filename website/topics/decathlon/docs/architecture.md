# 网站架构约定

本文是十项全能专题网站的实现约定，给并行开发的各方共用。设计以 README.md 和各页文档为准，这里只定代码怎么分、数据怎么来、谁改哪些文件。网站整体（总站、专题站、导出与发布、站点项目契约）见 `website/README.md`。

## 一、数据

- 本站是 `website/topics/decathlon/` 这个站点项目，按 `website/README.md` 的站点项目契约构建：数据目录取 `ONESHOT_SITE_DATA_DIR`，站内根路径取 `ONESHOT_SITE_BASE`（`/decathlon/`）。
- 数据由本专题的导出插件 `export.py` 写出（经共用驱动 `website/tools/export.py`），包含 `models.json`、`scores.json`、`tasks.json`、`search.json`、`zeros.json` 和题干 `stems/<类别>/<题目>.json`。实时数据在 `data/`，开发服务器优先读含本机私有型号的 `data-local/`。题干摘录规则见 `tasks.md`。
- 型号身份取自仓库根目录的 `models.json`，参测登记取自 `topics/十项全能/参测.json`；题序、权重、限时取自 `topics/十项全能/专题.json`，双语文案和搜索别名取自 `meta/tasks_meta.json`。
- 正式成绩是 `publish/confirmed.json` 的确认快照，暂停公示是 `publish/notice.json`，0 分原因是 `publish/zero-reasons.json`。
- 总站卡片的主色写在 `meta/card.json`（`accent`）。

## 二、页面与路由

- 每种页面一个 HTML 模板，放在 `pages/<类型>.html`；对应一个脚本入口 `src/pages/<类型>/main.js`。
  - 页面类型：`home`、`leaderboard`、`categories`、`about`、`faq`、`tasks`、`task`、`model`、`zeros`。
- 构建时由 `vite.config.js` 里的路由插件，按模板和 `data/*.json` 生成每个路由的 HTML：
  - 中文版在 `/decathlon/`，英文版在 `/decathlon/en/`；
  - 中文题目页位于 `/decathlon/tasks/<类别>/<题目>/`；
  - 每个导出的模型一页 `/decathlon/models/<id>/`（中文模型得分）；入口页 `/decathlon/models/` 是总分第 1 名的那一页。
  - 开发服务器用同一套规则。
- 生成的页面在 `<body>` 上写 `data-page`、`data-lang`、`data-id`（模型 id 或题目路径），页面脚本据此渲染。
- 站内链接一律经 `core/route.js` 生成。命令栏最左是回总站的入口（中文页到 `/`，英文页到 `/en/`）。

## 三、目录与分工

```text
website/topics/decathlon/
  package.json  vite.config.js  README.md
  pages/                 页面模板（骨架方建，各页负责人改自己那一个）
  data/                  导出插件的产物（数据方）
  public/                字体、星图底纹、厂商图标、类别图标、装饰，由同步脚本从 topics/十项全能/设计 和 assets/厂商图标 拷入（骨架方）
  src/
    core/                取数、i18n、路由信息、主题、网址参数和本地存储、格式化（模型名加推理强度）（骨架方）
    shell/               命令栏（含回总站入口）、全站搜索、快捷键表、模型侧面板、页脚、深浅和语言切换（骨架方）
    charts/              共用的星盘、导出图片、配色取值、坐标轴工具（骨架方）
    ui/                  共用的模型行、工具条（厂商筛选、搜模型、勾选对比）、数据下载（骨架方）
    styles/              全站样式：技能的 stellar.css 加本站的 visual.md 补充（骨架方）
    motion.js            动效档位和曲线（骨架方，按 motion.md）
    i18n/zh/<命名空间>.json、i18n/en/<命名空间>.json   common 归骨架方，每页一个命名空间归该页
    pages/<类型>/         各页自己的脚本、样式和部件（各页负责人）
  content/               说明页、猜你想问和题目页的长文，中英各一份（阅读页负责人）
  export.py  meta/  publish/                     导出插件、站点文案、确认快照与公示（数据方）
  docs/                  本目录
```

- 各页负责人只改 `pages/<自己的类型>.html`、`src/pages/<自己的类型>/`、自己的 i18n 文件和 `content/` 下自己的文件。
- 共用部件归骨架方。页面需要的共用部件不够用时，先在自己的页面目录里扩展，在交付说明里写明，最后由整合方并入。

## 四、共同约束

- 设计系统用 `topics/十项全能/设计/stellar-ui-skill`；视觉和动效按本目录的 `visual.md`、`motion.md`；各页内容按对应文档。
- 素材只用 `topics/十项全能/设计/` 下的装饰（`decor`）和类别图标（`icons/categories`）、`assets/厂商图标` 和技能自带的素材，不用 README 配图（`topics/十项全能/assets/readme/`）。
- 界面文字都放在 i18n 文件里，中文是主语言。
- 按桌面网页设计（宽 1024 以上）；模型得分页、题目类别榜和题目页在手机宽度下也不出现横向滚动。浅色、深色两套主题都要验收。
- 网站轻量，不展示作品的截图、录像和解答，也不放视频文件。

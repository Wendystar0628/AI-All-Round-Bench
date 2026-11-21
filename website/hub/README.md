# 总站首页 `website/hub`

正式域名根路径 `/` 的页面：总站名、一句简介、各专题卡片、页脚链接。中文在 `/`，英文在 `/en/`。各专题网页是各自独立的项目（十项全能在 `website/site`，挂在 `/decathlon/`）。

## 命令

```sh
cd website/hub
npm run dev       # http://localhost:5187/ ，每次请求现渲染页面，改完刷新即可
npm run build     # 输出 dist/（拼站时放在站点根路径）
npm run preview   # http://localhost:5186/ ，看 dist/
```

- 不需要 `npm install`：只用 Node 自带模块。`--port <端口>` 换端口。
- 数据：开发时读 `data-local/topics.json`，没有再读 `data/topics.json`；构建只读 `data/`，原样拷到 `dist/data/`。环境变量 `ONESHOT_HUB_DATA_DIR` 可指定别的目录（开发和构建都认），例如用样例开发：`ONESHOT_HUB_DATA_DIR=dev-sample npm run dev`。
- `data/`、`data-local/` 由 `website/tools/export_data.py` 生成，不手改。

## 改哪里

- `site.config.mjs`：总站名（正式名「AI全能测评」）、简介、仓库和备案链接、各专题卡片的标识色、界面文字。
- `src/hub.css`、`src/hub.js`、`src/favicon.svg`：样式、卡片渲染、图标。`scripts/render.mjs` 是两页共用的 HTML。
- 厂商图标取自 `website/logos/mark`，数字和英文用 `website/stellar-ui-skill/assets/fonts/Saira.ttf`，构建时拷进 `dist/`。

## `topics.json`

```json
{"updated": "YYYY-MM-DD",
 "topics": [{"id": "decathlon", "name": "AI十项全能", "name_en": "AI Decathlon",
             "status": "online", "url": "/decathlon/",
             "tasks": 13, "categories": 10, "ranked": 25, "updated": "YYYY-MM-DD",
             "top": [{"id": "…", "name": "…", "short": "…", "vendor": "…", "logo": "…", "effort": "…", "total": 84.0}]}]}
```

卡片按数组顺序排。英文页的卡片链到 `url` 后加 `en/`（数据里有 `url_en` 时用它）。`status` 不是 `online` 的专题显示「草稿」记号（只会出现在本地预览数据里）。

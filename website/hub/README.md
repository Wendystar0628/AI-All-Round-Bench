# 总站首页 `website/hub`

正式域名根路径 `/` 的页面：总站名、一句简介、各专题卡片、页脚链接。中文在 `/`，英文在 `/en/`。各专题网页是各自独立的站点项目（`website/topics/<id>/`，挂在 `/<id>/`，见 `website/README.md`）。总站不认识任何专题：卡片上的一切都来自 `topics.json`。

## 命令

```sh
cd website/hub
npm run dev       # http://localhost:5187/ ，每次请求现渲染页面，改完刷新即可
npm run build     # 输出 dist/（拼站时放在站点根路径）
npm run preview   # http://localhost:5186/ ，看 dist/
```

- 不需要 `npm install`：只用 Node 自带模块。`--port <端口>` 换端口。
- 数据：`ONESHOT_SITE_DATA_DIR` 指定的目录（开发和构建都认，`publish.py` 构建时传入）；没有它时，开发读 `data-local/topics.json`，没有再读 `data/topics.json`，构建只读 `data/`。数据原样拷到 `dist/data/`。用样例开发：`ONESHOT_SITE_DATA_DIR=dev-sample npm run dev`。
- `data/`、`data-local/` 由 `website/tools/export.py` 生成，不手改；`dev-sample/` 是手写的样例。

## 改哪里

- `site.config.mjs`：总站名（正式名「AI全能测评」）、简介、仓库和备案链接、界面文字。这里不写任何专题。
- `src/hub.css`、`src/hub.js`、`src/favicon.svg`：样式、卡片渲染、图标。`scripts/render.mjs` 是两页共用的 HTML。
- 字体自带：`fonts/Saira.ttf`（数字和英文，OFL 许可证同目录）。厂商图标取自 `平台/厂商图标/mark`。构建时都拷进 `dist/`。

## `topics.json`（通用卡片）

```json
{"updated": "YYYY-MM-DD",
 "topics": [{"id": "<id>", "name": "…", "name_en": "…", "status": "online", "url": "/<id>/", "accent": "#7a3cf0", "updated": "YYYY-MM-DD",
             "stats": [{"label": {"zh": "题目", "en": "Tasks"}, "value": 13}],
             "feature": {"kind": "ranking", "title": {"zh": "前 3 名", "en": "Top 3"},
                         "items": [{"model": {"id": "…", "name": "…", "vendor": "…", "logo": "…", "effort": "…"}, "value": 84.0, "max": 100}]}}]}
```

- 卡片由各专题的导出插件给出，按数组顺序排。英文页的卡片链到 `url` 后加 `en/`。
- `status` 不是 `online` 的卡片显示「草稿」记号（只会出现在本地预览数据里）。
- `accent`：卡片左边那道标识色，取该专题自己网页的主色；不写或不是 `#` 色值时用中性灰。
- `stats`：卡片左栏的几个数，按顺序排；`value` 是数或短文字，原样显示。
- `feature`：卡片右半边的展示块，按 `kind` 画，没有或认不出的 `kind` 就不画右半边。现在只有一种：
  - `ranking`：名次表。`items` 按顺序就是名次，每行画名次、厂商图标、「名字 (推理强度)」、`value`（保留一位小数）和一根 `value / max` 的条；条目数由导出决定。
- 以后加一种展示块（例如展示型专题的作品墙）：在 `src/hub.js` 的 `FEATURES` 里加一种画法，在 `src/hub.css` 里加它的样式，并在这里写上格式。

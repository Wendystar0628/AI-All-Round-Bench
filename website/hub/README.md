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
                         "items": [{"model": {"id": "…", "name": "…", "vendor": "…", "logo": "…", "effort": "…"}, "value": 84.0, "max": 100}]}},
            {"id": "<id>", "name": "…", "name_en": "…", "status": "soon", "about": {"zh": "…", "en": "…"}}]}
```

- 每张卡片画成图版上的一页，按数组顺序排：左边一栏文字，右边一扇带坐标框和网格的星空窗，星座只画在窗里。英文页链到 `url` 后加 `en/`。
- `status`：`online` 是已开放的专题，整页链到 `url`；`soon` 是筹备中的专题（`export.py` 按专题清单的 `coming_soon` 生成，见 `website/tools/README.md`），只有名字、`about`、「筹备中」记号和一扇虚线框的测绘中星空窗，没有链接和数字；其他值显示「草稿」记号（只会出现在本地预览数据里）。没有 `url` 的卡片也按筹备中画。
- `about`：可选，一句话介绍，`{zh, en}`。
- `accent`：星座、读数引线和页顶页签用的颜色，取该专题自己网页的主色；不写或不是 `#` 色值时用中性灰。
- `stats`：文字栏里的几个数，按顺序排；`value` 是数或短文字，原样显示。
- `feature`：窗下面的展示块，按 `kind` 画，没有或认不出的 `kind` 就不画。现在只有一种：
  - `ranking`：读数尺。窗的宽度就是 0 到 `max` 的刻度，`items` 按顺序就是名次（α、β、γ…）：左栏写厂商图标、「名字 (推理强度)」和 `value`（保留一位小数），右边一根从 0 起长 `value / max` 的引线，末端一颗星（第 1 名是荧光绿星）；星座最亮的星正对第 1 名，一根细线连下来。条目数由导出决定。
- 以后加一种展示块（例如展示型专题的作品墙）：在 `src/hub.js` 的 `FEATURES` 里加一种画法，在 `src/hub.css` 里加它的样式，并在这里写上格式。

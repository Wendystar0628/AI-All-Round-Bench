# 太阳雨中的小渔港堤岸

Three.js 制作的微缩三维场景（三渲二 / 日式动画风），按题面《太阳雨渔港3D渲染.md》完成。

## 运行

直接用 Chrome 打开根目录的 `index.html`（`file://` 本地方式即可，不需要网页服务器）。

- 鼠标左键拖拽旋转、滚轮缩放、右键拖拽平移。
- 页面只呈现场景，没有任何 UI 元素。
- 想直接查看某个定时事件（如彩虹约在 75 秒、灯塔约在 62–74 秒亮灯），可在地址后加 `?t=秒`，例如 `index.html?t=75`，实时时钟会从该时刻开始。

## 视频导出接口

```js
window.videoExport.runs                          // ['overview', 'tour']
await window.videoExport.begin(runId, { fps })   // 回到该段起始状态，返回 { frames }
await window.videoExport.frame(i)                // i 从 0 起依次调用，完成后第 i 帧已显示
window.videoExport.end()                         // 恢复正常的可操作状态
```

- `overview`：5 秒，镜头静止的中景，展示全貌。
- `tour`：20 秒连续巡游，依次经过全景、岸壁剖面与水下、小渔船驾驶舱、仓库卷帘门内部、候船室玻璃窗，最后回到全景。
- 所有动态都是时间的纯函数：第 `i` 帧对应内部时刻 `i / fps`，与真实时间和机器速度无关。

## 源码结构

```
index.html            入口（加载打包后的经典脚本 dist/app.js）
dist/app.js           打包产物（已提交，可直接运行）
src/main.js           渲染器、实时循环、视频导出接口
src/world.js          组装场景，并驱动每帧的动态更新
src/camera.js         全貌构图的取景、轨道控制
src/tour.js           20 秒巡游的关键帧与插值
src/core/             色板、合并几何体的构建器、材质（三阶色阶、描边、混凝土着色）、时间与风场
src/scene/            各部分：底座、水面（色块化倒影）、码头道具、船只、建筑与灯塔、山坡、生态（海鸥、猫、雨、光柱等）
```

## 构建

依赖 Three.js 与 esbuild，已在 `package.json` 中声明。修改 `src/` 后执行：

```
npm install
npm run build
```

会重新生成 `dist/app.js`。

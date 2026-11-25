# 天穹圣城

Three.js 制作的悬浮天空之城大型场景。双击根目录的 `index.html` 即可在 Chrome 中以本地文件方式运行（无需网页服务器）。

## 操作
- 左键拖拽：旋转；右键（或 Shift + 左键）拖拽：平移；滚轮：缩放
- 底部切换条：‹ › 切换观景点，点击名称或方格图标展开全部 16 个观景点
- 键盘：← → 切换观景点，数字键 1–9、0 直达前十个观景点

## 视频导出接口
```js
window.videoExport.runs                         // ['tour']
await window.videoExport.begin('tour', { fps }) // -> { frames }，tour 时长 90 秒
await window.videoExport.frame(i)               // 第 i 帧 = 作品内部时刻 i / fps
window.videoExport.end()
```

## 工程结构
- `app.js`：打包好的运行文件（由 `src/` 经 esbuild 打包，内含 three.js r187）
- `src/core`：噪声与纹理生成、几何合批、材质（程序化石材/铜瓦/岩石等）与共享着色器片段
- `src/render`：渲染管线（场景 → SSAO → 大气：天空、体积云海、雾、光柱 → 透明层 → 辉光 → 调色）
- `src/world`：主岛岩体、城墙、下城、主殿、水系、六座卫星岛、五种连接、外环道路、旗帜飞鸟等
- `src/camera`：观景点、交互相机（带碰撞）、tour 镜头组
- 重新打包：`npm install` 后执行 `node build.mjs`

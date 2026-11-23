# Nested OS · 嵌套图形操作系统

Windows 桌面项目（Electron 45.2.1 + Chromium + Three.js）。根系统提供桌面、电子表格、小组件、编辑器、任务管理器、设置和真实 Chromium 浏览器；每个子系统由父系统文件系统中的内核程序运行，可继续递归创建，形成多级桌面和并行分支。

## 启动

```powershell
npm install
npm start
```

带参数启动（评测/自动化）：

```powershell
npm start -- --data-dir "D:\nos-data" --width 1600 --height 1000 --remote-debugging-port=19106
```

- 本地静态资源服务：`18106`（启动入口自动启动，无需手动开启）。
- 桌面调试端口：`19106`（Electron `--remote-debugging-port`）。
- 数据目录：`--data-dir` 指定；运行数据不写回源码目录。
- 根目录 `automation.json` 描述启动命令、主窗口与素材路径。
- 根目录 `docs/说明.md` 是完整操作、程序格式、系统接口、内核修改、飞控接口、预算计量、场景/工作簿/记录格式说明；桌面内也可从开始菜单打开“操作说明”。

## 快速上手

1. 初次启动显示根系统桌面（`outer`）。
2. 双击“新建子系统”或从开始菜单打开“系统管理器”，创建 `inner-1`。
3. 在子系统里打开“三维场景播放器”，播放默认的紫黄 24 号直升机演出；切换到“飞行排演”开始飞控。
4. 在根系统打开“示例工作簿”，在子系统“图表工作台”连接 `A1:D4`，建立实时数据连接。
5. 在播放器/图表窗口点击“投送到祖先桌面”，把可交互视图投到根桌面。
6. 在任意层继续创建子系统，可到达第四层及以上；每层都有独立文件系统、进程表、虚拟时钟与配额。

## 目录

- `main.js` / `preload.js`：Electron 主进程、静态服务与数据目录 API。
- `index.html` / `css/style.css`：桌面外壳与视觉。
- `js/lang.js`：NOScript 词法、语法、编译器与显式程序计数器解释器。
- `js/kernel.js`：进程表、调度、消息、文件系统、系统调用、预算/配额、快照序列化。
- `js/flight.js`：飞行简化动力学与确定性重放。
- `js/terrain.js`：场景与物理共用的地形高度函数。
- `js/scene.js`：Three.js 场景、直升机、烟尘、碎片、镜头。
- `js/apps/*.js`：文件管理器、电子表格、编辑器、任务管理器、设置、浏览器、播放器、图表、系统管理器。
- `js/shell.js`：桌面、窗口管理、系统树、投送、快照、持久化与 `window.bench`。
- `assets/`：自制壁纸；`vendor/`：打包的 Three.js。
- `docs/说明.md`：完整说明。

## 自动化

主渲染上下文提供：

```js
window.bench.version       // 1
await window.bench.ready()
await window.bench.reset()
window.bench.inspect()     // systems / windows / browsers / players / charts / projections
```

关键控件带 `data-testid`；窗口容器带 `data-window-id`、`data-app-id`、`data-system-id`。详见 `docs/说明.md` 与 `automation.json`。

## 边界

- 外部网页由 Chromium 真实加载，不纳入虚拟时间/逻辑预算/完整快照；不向网页暴露宿主对象。
- 宿主绘制与网页执行不计入逻辑预算；应用计算、窗口管理、飞行动力学、图表与显示提交计入所属系统预算。
- 支持窗口被遮挡时继续推进；图形上下文丢失后从系统状态恢复。
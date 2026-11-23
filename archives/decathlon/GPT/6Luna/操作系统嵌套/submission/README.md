# Nested OS

桌面端递归操作系统模拟作品。使用 Electron 45.2.1 与 Chromium WebView；初次启动进入根系统桌面，不会自动播放场景。

## 启动

首次安装依赖后运行：

```powershell
npm start
```

支持自动化启动参数：

```powershell
npm start -- --data-dir "C:\temp\nested-test" --width 1440 --height 900 --remote-debugging-port=19106
```

`--data-dir` 指定独立运行数据目录；素材从项目 `fixtures/` 初始化到该目录的 `outer/`。开发调试端口按 Electron Chromium remote debugging 提供。

## 桌面操作

- 桌面双击图标打开应用，右键桌面空白处可新建系统或打开设置；开始菜单可启动各应用。
- 窗口支持拖动、边缘缩放、最小化、最大化和关闭；任务栏按钮切换窗口。
- 子系统桌面嵌在父系统的系统窗口中。每层可新建子系统；任务管理器提供暂停、继续、单步、重启、快照及分叉入口。
- 根系统应用：文件管理器、电子表格、小组件、编辑器、Chromium 浏览器、任务管理器和设置。子系统提供文件、编辑器、任务管理器、三维场景播放器和图表工作台。
- 播放器/图表的“投送”入口会在祖先桌面新建独立投送窗口；关闭投送不关闭源应用。

## 程序与资源

`.nos` 是可编辑的系统程序文本格式。支持 `let name = expression`、`repeat N { ... }`、`while true { ... }`、赋值和 `print`；指令在逻辑预算内轮转执行，持续循环仍受单个调度量子限制。预置 `accumulator.nos`、`message-ping.nos`、`continuous.nos`、`flight-control.nos`。系统间消息接口示例为 `send process:<id> "value"` 与 `receive`。内核普通文本源位于 `/Kernel/kernel.nos`；重启入口从该文件重新载入。执行量以调度器发放的逻辑指令单位计量，内存与存储配额显示在进程管理器。

场景 `.scene` 是独立 JSON 数据，含场景时长、帧率、直升机颜色、部件和演出阶段；播放器按所属虚拟时钟取样，时长 15 秒、30 FPS。播放器控制支持播放、暂停、逐帧、进度定位、循环、调速和镜头模式。排演参数包括风、目标航向和故障时机，记录文件保存为实例状态中的 `.record` 素材。

`.sheet` 是 JSON 工作簿，`cells` 对象使用 A1 地址；公式支持四则运算、单元格引用、区域 `SUM`。示例 `/Demo/sample.sheet` 具有题目规定的 A1:D4 内容。图表连接根工作簿副本，表格编辑后发布新版本。

## 自动化

根目录 `automation.json` 记录启动、素材定位和连接约定。主窗口 `window.bench` 提供 `version`、`ready()`、`reset()`、`inspect()`。桌面应用控件使用题面列出的 `data-testid`，同时附系统与窗口标识。外部网页在 Chromium WebView 中执行，采用独立持久化分区。

根系统壁纸 `fixtures/Wallpapers/alpine.svg` 为项目自制矢量风景。所有预置资源位于 `fixtures/`。

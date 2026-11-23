# AEROLITH Nested OS

Windows 桌面端的递归图形操作系统实验环境。根系统提供文件、表格、小组件、编辑器、资源管理与真实 Chromium 浏览器；每个子系统拥有独立桌面、内核程序、文件、虚拟时钟、消息、调度、WebGL2 场景播放器、闭环飞行排演和实时图表。

## 启动

```powershell
npm install
npm start
```

自动化与独立数据目录：

```powershell
npm start -- --data-dir C:\Temp\aerolith-data --width 1600 --height 960 --remote-debugging-port=19106
```

主窗口标题为 `Nested OS · AEROLITH`。首次启动进入 `outer` 根桌面，不会自动播放演示。桌面顶部的“＋ 子系统”创建 `inner-1`、`inner-2`……；双击桌面图标启动应用。项目使用 Electron 45.2.1，外部网页由隔离的 Chromium `<webview>` 运行。

## 自动化

根渲染上下文提供：

```js
window.bench.version
await window.bench.ready()
await window.bench.reset()
await window.bench.inspect()
```

启动参数、窗口标题、素材和上下文位置见 `automation.json`。关键控件均使用题面约定的 `data-testid`、`data-system-id` 与 `data-window-id`。

## 内置素材

- 根工作簿：`/Demo/sample.sheet`
- 根与子系统场景：`/Demo/helicopter-24.scene`
- 子系统飞控：`/System/flight-control.nos`
- 场景播放器程序：`/System/scene-player.nos`
- 桌面与投送程序：`/System/desktop-shell.nos`、`/System/projection-service.nos`
- 窗口、文件与图表服务：`/System/window-manager.nos`、`/System/file-manager.nos`、`/System/chart-workbench.nos`
- 编译器：`/System/compiler.nos`
- 用户程序：`/Programs/*.nos`
- 子系统内核（创建后位于父系统）：`/Systems/inner-N/kernel.nos`

详细程序语法、内核修改、预算计量、飞控接口、场景格式、数据连接、投送与快照说明可从每层桌面的“AEROLITH 操作说明”打开。

## 执行边界

逻辑单位 `u` 用于 NEST 指令、内核、文件、图表、飞行物理、场景取样和显示提交；配额是上限，祖先逐级拨付且兄弟共享。Three.js 的 GPU 实际绘制与外部 Chromium 网页执行不计入逻辑预算。投送窗口只承载外框、复制后的显示数据与输入转发，应用状态和计算仍属于源系统。

修改服务程序后重启对应子系统即可装载新规则：窗口程序决定层叠方式，文件程序决定排序，图表程序决定取值缩放，播放器程序的 `SPEED`、`TIMELINE cost`、`SCENE cost`、`APPLICATION cost`、`REHEARSAL cost` 与 `FRAMESTEP` 分别决定播放推进和各协作进程的真实预算消耗。修改只作用于该实例，任务管理器会显示相同进程的工作量、待处理量和错误。

桌面图标与开始菜单来自 `desktop-shell.nos` 的 `APPS` 清单。投送服务只接受源程序通过显示接口提交的状态副本，不引用源窗口对象；投送输入按 `projection-service.nos` 的 `INPUT message-queue` 回到源应用队列，删除 `DISPLAY copy` 或输入规则并重启会分别停止画面提交或拒绝输入。

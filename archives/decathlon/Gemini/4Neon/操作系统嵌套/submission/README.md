# Nested OS — 递归嵌套图形操作系统

## 启动方式

本项目基于 Electron 45.2.1 + Three.js（WebGL 2）交付，全部系统源码、字体栈、原创壁纸、原创图标、NOS 内核/应用/飞控程序与三维直升机场景均随项目打包，断网时各层系统与本地应用均可正常运行（根系统 Chromium 浏览器支持真实联网浏览）。

```bash
npm start
```

支持自动化与测试启动参数：

```bash
npm start -- --data-dir "<独立数据目录>" --width 1440 --height 900 --remote-debugging-port=19106
```

- `--data-dir`：独立运行数据目录（保存根系统文件系统、设置、便笺与浏览器配置，绝不写回源码目录）。
- `--width` / `--height`：主窗口客户区宽高（适配至 3840×2160）。
- `--remote-debugging-port`：CDP 自动化调试端口。

## 核心架构一览

1. **真实自举与程序驱动内核 (`src/vm/` + `src/nos_programs/`)**：
   - `compiler.nos`：用 NOS 语言编写的自举编译器，可在系统内修改并编译自身（`/sys/compiler.nos -> /sys/compiler.bc`），后续新启动程序使用新编译器编译。
   - `kernel.nos`：存放在父系统 `/Systems/<childId>/kernel.nos` 的子系统内核程序，负责进程表、时间片抢占调度、虚拟时钟、FIFO 消息投递、虚拟文件系统、内存/存储配额、按进度付费的未完成工作、系统调用分发与直属子系统承载。
   - `wm.nos`：子系统窗口管理器程序，负责桌面图标、任务栏、开始菜单、窗口层叠/焦点/命中判断、拖动/缩放/半屏贴靠与跨层投送入口。
   - 子系统应用：`files.nos`、`editor.nos`、`tasks.nos`、`chart_recv.nos` + `chart_ui.nos`、`player_timer.nos` + `player_scene.nos` + `player_fx.nos` + `flight_ctrl.nos`。
2. **24 号紫黄直升机三维场景与闭环排演**：
   - 独立纯数据资源 `/Demo/helicopter-24.scene`（不含宿主代码），支持编辑修改与加载任意同格式 `.scene` 场景。
   - 单一共享 WebGL 2 渲染器向任意数量 2D Canvas 视图输出，突破浏览器 16 个 WebGL 上下文上限并支持图形上下文丢失无损恢复。
   - 默认 15 秒演出与闭环飞行排演共用同一六自由度物理与地形/障碍碰撞引擎；预算、调度与时间速率实时影响飞控回路，支持排演记录保存回放与任意位置续演分叉。
3. **详细简体中文操作与开发说明**：启动应用后点击桌面“操作说明”或开始菜单“操作说明”即可随时查阅。

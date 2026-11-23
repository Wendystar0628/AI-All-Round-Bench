# 嵌套操作系统 · 设计与接口约定（开发者笔记）

## 分层
- `src/runtime/nos-vm.js` 字节码虚拟机（可按预算暂停、状态可复制、sys_ 调用陷入内核）。
- `src/runtime/nos-stdlib.js` 标准库原生函数（字符串/数组/映射/数学/JSON/随机数）。
- `src/runtime/universe.js` 系统树：Sys（系统）、预算拨付、承载进程（carrier）、磁盘配额、显示面、快照/恢复/分叉、内核特权调用 `priv_*`。
- `src/runtime/sim-natives.js` 进程可用的计算库（飞行物理等，按规模计费）。
- `tools/nosc.js` 引导编译器（仅开发期）；`assets/system/compiler.ns` 系统内编译器（自举，`compiler.nobj` 为其字节码）。
- `assets/system/kernel.ns` 内核程序；`assets/system/wm.ns` 窗口管理；`assets/system/apps/*.ns` 应用；`assets/system/lib/*.ns` 公共库。
- 宿主（Electron 渲染进程）：显示组合（显示面 -> DOM）、输入转发、3D 视图、网页视图、存储。

## 语言 Nest Script（.ns）
C 式语法：`var`、`func`、`if/else`、`while`、`for (init; cond; post)`、`for (var x in arr)`、`return/break/continue`；
值：nil、布尔、数字、字符串、数组、映射；`#include "/path"` 由内核在启动程序前展开。
调用：普通函数、标准库原生函数、`sys_*`（系统调用，内核处理）、`priv_*`（仅内核可用）。

## 系统调用（进程 -> 内核）
`sys_now` `sys_sleep(s)` `sys_recv` `sys_send(pid|"wm", msg)` `sys_self` `sys_exit(v)` `sys_kill(pid)`
`sys_spawn(path, args)` -> {ok,pid,error} `sys_submit(surface, nodes)` `sys_info` `sys_procs` `sys_set_quota(pid, q)`
文件：`sys_fs_read(p)` `sys_fs_write(p, text)` `sys_fs_list(dir)` `sys_fs_stat(p)` `sys_fs_mkdir(p)` `sys_fs_mkdirs(p)` `sys_fs_delete(p)`（进回收站） `sys_fs_move(a,b)` `sys_fs_copy(a,b)` `sys_fs_restore(trashPath)`
剪贴板/通知/设置：`sys_clip_set(text)` `sys_clip_hist` `sys_notify(title, body)` `sys_notes` `sys_note_read` `sys_settings` `sys_set(key, value)`
跨系统：`sys_xpost(sysId, msg)` `sys_kids` `sys_child_new` `sys_child_ctl(id, action, arg)` `sys_ancestors` `sys_drag_begin(payload)` `sys_drag_end` `sys_budget(key, value)` `sys_frozen(id)` `sys_res_put(key, data)` `sys_web(op, arg)`
标准库额外提供 `measure(text, size)`。

## 消息
收件人为 pid 或 "wm"。消息按值复制。内核收件箱（宿主/父/子）中的消息带 `to`：`"wm"`、pid 或 `"kernel"`。

## 显示节点（display list）
显示面由 `sys_submit(surfaceId, nodes)` 提交，宿主把它画成 DOM。节点是映射：
- `{t:"r", x,y,w,h, f(填充), s(描边), sw, r(圆角), o(透明度), sh(阴影), tid, lbl, hv(悬停), cur}`
- `{t:"t", x,y,w,h, s(文字), z(字号), c(颜色), b(粗体 1), a("l"|"c"|"r"), tid}`，文字在框内垂直居中
- `{t:"svg", x,y,w,h, els:[...]}`：图表用，元素 `{e:"path"|"circle"|"rect"|"line"|"text", ...}`
- `{t:"img", x,y,w,h, src}`
- `{t:"surf", sys, id, x,y,w,h, k}`：嵌入另一面（可以是子系统的 desktop）
- `{t:"web", tab, url, x,y,w,h, k}`：浏览器网页视图
- `{t:"3d", sys, res, st, x,y,w,h, k}`：三维视图（st 为每帧状态，res 为资源键）
`tid` 写入 data-testid；`sys/win/app` 写入 data-system-id/data-window-id/data-app-id。

## 命名与路径
- 根系统 `outer`；子系统 `inner-N`（全局创建序号）。
- 子系统内核源文件：父系统 `/Kernels/<名>.ns`。
- 快照：父系统 `/Snapshots/<名>.snap`。
- 回收站 `/Trash`；示例工作簿 `/Demo/sample.sheet`；场景 `/Demo/helicopter-24.scene`。

## 预算
逻辑步固定 1/60 s。根系统每步得到 `cfg.budget` 单位；内核拨付给进程和承载；子系统受 `cfg.budget` 上限。
单步：父系统暂停时可对直属子系统执行一个 0.1 s 虚拟时间步。

## 进度（截至本次提交）
- [x] 语言：虚拟机、标准库、三元运算符、引导编译器与系统内编译器自举校验（tests/vm.test.js，tools/bootstrap-check.js）
- [x] 内核程序（assets/system/kernel.ns）：进程表、调度（时间片、进程额度、挂起/继续/结束）、消息、定时接收、文件系统（回收站、复制、移动）、剪贴板、通知、设置、承载子系统、快照/恢复/分叉、工作簿订阅转交（tests/kernel*.test.js）
- [x] 系统树（src/runtime/universe.js）：多层（已验证四层）、预算拨付与空闲不计费、单步、暂停、速率、重启（重载内核源）、关闭、快照、恢复、分叉、内核错误停止
- [x] 窗口管理（assets/system/wm.ns）：桌面、任务栏、开始菜单、托盘、通知中心、小组件面板、窗口拖动/缩放/最小化/最大化/贴靠、右键菜单、投送、拖放落点、嵌套系统窗口
- [x] 应用：文件管理器、编辑器（运行程序并显示消息输出）、任务管理器（进程、子系统、预算、快照）、设置、小组件、电子表格（公式、重算、撤销、订阅）、浏览器（Chromium 网页视图）、图表工作台（实时订阅、投送）、三维播放器（演出、跟随、自由镜头、排演、记录）
- [x] 三维与飞行：sim.ns（物理进程）、fx.ns（烟尘与残骸，确定性）、scene.ns（时序，消息驱动，序号丢弃过期画面）、/Flight/controller.ns（可编辑飞控，已调参在 B 号停机坪降落）、src/renderer/scene3d.js（Three.js 共享渲染器）
- [x] 宿主：Electron 外壳、显示组合（DOM）、输入、窗口标识（data-testid 等）、window.bench（ready/reset/inspect）、automation.json、操作说明（assets/documents/使用说明.txt）
- [~] 拖放：源端与目标端分别验证；跨层鼠标拖放的最后一段（宿主按指针位置找目标桌面）未在自动化中完整验证
- [~] 录制主线：已验证排演（风、航向、尾桨故障、崩溃）→ 保存记录（时长取保存时刻）→ 文件管理器双击 .rec 回放（事件重现，崩溃时刻一致）；未逐步完整跑通整条一分钟主线
- [x] 子系统窗口标题栏：显示所属系统与运行状态（运行中／已暂停／已挂起／内核错误），并提供“返回父桌面”入口（隐藏本窗口，露出所属桌面）
- [x] 投送外框的“返回父桌面”入口（隐藏投送外框，投送仍然有效，可从任务栏恢复）

## 已知问题与注意
- 预编译：assets 下系统程序由 tools/build-images.js 预编译（与系统内编译器逐字一致）；修改 .ns 后需运行该脚本（npm start 会自动运行）。
- 宿主的 nos:// 协议不缓存；开发时修改 src/renderer 后需要重启应用（主进程），页面刷新不会清除子系统。
- 子系统不随应用重启保留（设计内）；快照保存在父系统 /Snapshots。
- 根磁盘在应用重启后保留；程序模板版本变化时，系统程序与示例文件会被项目里的版本覆盖（用户文件保留）。

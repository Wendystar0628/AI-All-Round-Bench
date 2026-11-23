# NEXUS 嵌合操作系统（Nested OS）

一个使用 Electron / Chromium 的递归图形桌面。根系统包含文件、电子表格、小组件、编辑器、任务管理、设置和真实网页浏览器；每个子系统都有完整桌面、可编辑内核、程序进程、三维播放器、闭环飞行排演与实时图表。

## 启动

```bash
npm install
npm start
```

指定独立数据目录与主窗口客户区：

```bash
npm start -- --data-dir "C:\\Temp\\nexus-data" --width 1600 --height 1000 --remote-debugging-port=19106
```

- 入口：`main.js`，包管理脚本：`npm start`。
- 标题：`Nested OS`；调试端口：建议 `19106`。
- 所有本地系统、程序、场景与壁纸均可离线运行。只有浏览器访问真实外站需要网络。
- `--data-dir` 之间互不影响，运行状态写入所选数据目录，不写回源码素材。
- 根系统提供 `window.bench.version / ready() / reset() / inspect()`，详见 `automation.json` 和题面附录。

## 桌面入口

点击左下 NEXUS 标志打开开始菜单。应用支持拖动、八向缩放、最小化、最大化、双击标题栏、左右半屏贴靠和任务栏切换。桌面与文件支持右键菜单；文件管理器支持多选和跨层拖放。

“新建直属子系统”会在父系统 `/Systems/inner-N.kernel.os` 创建真实内核源文件，并由父层承载进程执行。系统窗口上方提供暂停、继续、单步 50ms、速率、快照、分叉、重启和内核编辑。

双击 `.snapshot.json` 可恢复到原子树；关闭后仍可从父层文件管理器重新打开。播放器与图表标题栏的投送按钮可选择任意祖先桌面。

## 素材与源文件清单

| 逻辑素材 | 系统内路径 | 项目源文件 |
|---|---|---|
| 示例工作簿 | `outer:/Demo/sample.sheet` | 由 `kernel.js` 初始化，D 列含公式 |
| 24 号机场景 | 每层 `/Demo/helicopter-24.scene` | `assets/helicopter-24.scene` |
| 最小场景 | 每层 `/Demo/minimal.scene` | `assets/minimal.scene` |
| 子系统内核 | 父层 `/Systems/inner-N.kernel.os` | 由 `/System/kernel.template.os` 复制 |
| 编译器 | 每层 `/System/compiler.os` | `defaultPrograms()` 初始化 |
| 飞控程序 | 每层 `/System/flight-controller.os` | 同上 |
| 窗口管理 | 每层 `/System/wm.os` | 同上 |
| 文件应用 | 每层 `/System/apps/files.os` | 同上 |
| 播放器时序/场景/特效 | 每层 `/System/apps/player-*.os` | 同上 |
| 图表接收/绘图 | 每层 `/System/apps/charts-*.os` | 同上 |
| 示例程序 | 每层 `/Programs/*.os` | 累加、发送、接收、持续计算 |
| 原创壁纸 | 设置中三种 | `assets/wallpaper-*.svg` |

## 格式与接口速查

详细中文说明可从每层“操作说明”应用打开，分为快速上手、程序与编译、系统接口、预算与快照、场景与飞控、投送与图表六章。

### NEXUS VM

`.os` 是逐行文本程序：`LET/CALC/SET`、`LABEL/GOTO/IF`、`WAIT/YIELD`、`SEND/RECV`、`SPAWN/KILL`、`CALL service args => result`、`PRINT/END`。表达式由项目自己的解析器执行，不使用宿主 `eval`。程序 PC、变量、等待、消息、输出、错误和预算读数均可快照。

内核通过 `sys.schedule`、`sys.deliver`、`sys.windows`、`sys.clock` 运行自己的进程、消息、窗口输入和时钟。默认策略可改为 `priority/reverse`、`fifo/lifo/duplicate`、`focus/broadcast`。修改父层内核源文件后重启该子树生效。

可在内核主循环前加入 `CALL sys.register "answer" 42` 注册新调用，之后普通程序用 `CALL answer => value` 取得结果；`CALL sys.filePolicy "readonly"` 会启用只读文件规则。自定义调用与策略进入快照。`/System/compiler.os` 中 `LET instructionCost 8` 是之后启动进程的指令计量参数，编译器也可编译自身。编辑器允许保存错误文本，重启时由承载进程报告真实内核错误。

### 场景与飞行

`.scene` 是 JSON 数据，描述图元、材质、部件变换、环境、灯光、相机与关键帧。播放器不内置特定直升机。默认 15 秒演出为 30 FPS 确定性取样；WebGL2 设备绘制三维几何、阴影、尘土、烟火和有厚度的碎片。

排演调用：

```text
CALL flight.sense => s
CALL flight.control lift pitch roll yaw
```

传感器包含时间戳、位置、速度、姿态、旋翼、目标、风和故障。控制保持到下一次写入；调低祖先拨付、持续计算竞争或提高时间速率会拉长实际控制周期。`.flight` 保存资源、初态、输入、控制时序与实际记录帧，可回放或续演。

### 表格与实时图表

`.sheet` 保存单元格原文、公式与基本格式。公式支持四则、括号、区域、单元格引用和 `SUM`，含除零、无效引用与循环反馈。连接按工作簿文档身份与选区建立；每次提交完成重算后发布完整副本。暂停子树时更新在根侧排队，恢复后由接收与绘图进程按序处理。

## 资源边界

固定逻辑步为 50ms。预算计量 VM 指令、数据规模、文件/表格/图表计算、飞行物理与场景提交；宿主最终绘制和 Chromium 网页不计入自定义逻辑预算。配额与拨付是共享上限而非额外预算。暂停不补跑现实时间，最小化不停止程序，结束一棵子树不影响祖先或兄弟。

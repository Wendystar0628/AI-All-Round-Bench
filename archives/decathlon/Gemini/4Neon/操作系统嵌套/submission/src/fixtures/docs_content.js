// 完整简体中文操作与开发说明（可从根桌面或开始菜单随时打开）

export const HELP_MANUAL_SECTIONS = [
  {
    id: 'overview',
    title: '1. 系统架构与宿主边界',
    body: `Nested OS 是一个支持无限级（默认配置流畅运行四层以上）递归嵌套的图形操作系统。

• 根系统 (outer)：由宿主桌面环境承载，提供日常办公桌面（文件管理器、电子表格、小组件、文本/程序编辑器、任务管理器、设置、以及真实联网的 Chromium 浏览器）与子系统创建入口。
• 子系统 (inner-1, inner-2, inner-3, ...)：每个子系统均由存放在父系统文件系统中的真实内核程序 (/Systems/<id>/kernel.nos) 驱动运行。宿主仅提供：① 字节码虚拟机 (VM) 执行环境；② 按提交数据绘制二维显示列表与三维场景的显示设备；③ 原始指针与键盘事件。
• 预算与执行边界：
  - 逻辑执行预算以“逻辑运算步 (op)”为计量单位，每个逻辑步长固定为 1/30 秒 (33.33 ms，对应 30 fps)。
  - 内核自身调度、窗口管理器、文件读写、图表计算、场景取样与提交、飞行物理、飞控进程以及子系统承载均消耗逻辑预算并受逐级拨付约束；调高时间速率不会增加预算。
  - 宿主的 GPU 光栅化绘制 (Three.js WebGL 2) 与根系统 Chromium 浏览器网页脚本执行不计入自定义逻辑预算；浏览器的网页视图在任务管理器中单独列出。`,
  },
  {
    id: 'nos-lang',
    title: '2. NOS 程序格式与系统调用接口',
    body: `所有子系统程序（内核、编译器、窗口管理器、应用、飞控与用户程序）均使用同一种脚本格式：Nested OS Script (.nos)。

【基本语法】
  let x = 10;                  // 变量声明（支持数字、字符串、布尔、null、数组 []、对象 {}）
  fn add(a, b) { return a + b; }
  if (x > 5) { ... } else { ... }
  while (cond) { ... }         // 也支持 for (let i = 0; i < n; i += 1) { ... }、break、continue
  try { ... } catch (e) { ... } // 支持 throw "消息";

【内置函数（按数据规模计费）】
  len, keys, has, del, push, pop, slice, concat, substr, index_of, split, join, replace, trim, lower, upper,
  char_code, from_char_code, str, num, int, type, abs, floor, ceil, round, min, max, sqrt, pow, sin, cos,
  tan, asin, acos, atan2, clamp, exp, log, clone, json_encode, json_decode, mem_size, sort_by, rand_next

【核心系统调用 syscall(name, ...args)】
  • 时间与等待：syscall("time") | syscall("sleep", seconds) | syscall("yield")
  • 进程控制：  syscall("getpid") | syscall("spawn", path, args, opts) | syscall("kill", pid)
                syscall("suspend", pid) | syscall("resume", pid) | syscall("ps")
  • 消息通信：  syscall("send", toPid, payload, toGen) | syscall("recv", timeoutSec) | syscall("find_proc", key)
  • 文件系统：  syscall("fs_list", dir) | syscall("fs_read", path) | syscall("fs_write", path, text)
                syscall("fs_mkdir", dir) | syscall("fs_delete", path) | syscall("fs_copy", src, dst) | syscall("fs_move", src, dst)
  • 结果与日志：syscall("log", msg) | syscall("set_result", val)
  • 画面提交：  syscall("app_present", windowId, uiTree, scene3dPacket, meta)

【预置示例程序（位于 /Programs/）】
  • /Programs/sum.nos      — 累加计算程序
  • /Programs/receiver.nos — 消息接收程序（先运行）
  • /Programs/sender.nos   — 消息发送程序（后运行，核对 FIFO 顺序与值快照）
  • /Programs/busy.nos     — 持续计算程序（不让出执行权，检验时间片抢占与飞控竞争）`,
  },
  {
    id: 'kernel-mod',
    title: '3. 修改内核、窗口管理器、应用与自举编译器',
    body: `【修改子系统内核】
  1. 每个直属子系统 <id> 的内核源文件位于父系统的 /Systems/<id>/kernel.nos。
  2. 在父系统任务管理器或子系统窗口栏点击“打开内核”，即可在父系统编辑器中直接修改：
     - 改写 schedule_pick(st) 修改调度顺序或时间片策略；
     - 改写 handle_custom_syscall(st, proc, name, args) 新增自定义系统调用；
     - 改写 deliver_message(...) 修改消息投递规则；
     - 改写 vfs_list / vfs_read / vfs_write 修改文件可见性与读写行为。
  3. 保存后点击“重启子系统”生效（保留已保存的文件与系统树结构）。若内核改坏导致语法或运行时错误，该子系统停止并显示内核错误提示，父系统与兄弟系统照常运行；修复保存后重启即可恢复。

【修改窗口管理器与应用】
  • /sys/wm.nos        — 修改 wm_bring_to_front / wm_set_focus / wm_hit_test 改变窗口层叠、焦点与命中规则；
  • /apps/files.nos    — 修改 sort_file_entries 改变文件排序与操作行为；
  • /apps/chart_ui.nos — 修改 extract_chart_series 改变图表取值与绘图规则。

【自举编译器 (/sys/compiler.nos)】
  • 编译器本身是系统内的普通 .nos 程序，输出字节码到 /sys/compiler.bc。
  • 在编辑器中打开 /sys/compiler.nos，修改编译规则或 compilerTag 后点击“自举编译”，当前编译器会编译修改后的自身并热重载 /sys/compiler.bc，此后启动的新程序均由新编译器编译。`,
  },
  {
    id: 'budget-quota',
    title: '4. 共享预算、内存与存储配额及单步计量',
    body: `• 执行预算：每个系统在每个 33.33ms 逻辑步内拥有有限总预算，内核、窗口管理器、应用进程、用户程序与直属子系统承载进程共同竞争。进程额度与子系统拨付上限仅限制其最高可用份额，不会凭空增加总预算。
• 按进度付费（剩余工作）：大文件写入、显示提交、数据拷贝与快照序列化按实际数据规模计费。预算不足时保留已付进度（可在进程管理器的“剩余工作”列查看），待后续逻辑步付清后再提交结果。
• 内存与存储配额：变量、字符串、数组、消息队列、以及载入显示设备的三维场景资源（含投送）均计入源系统内存配额；VFS 文件与快照计入存储配额。配额不足时分配/保存失败，仅影响对应配额范围内的系统。
• 虚拟时间与单步：子系统时间 = 父系统逻辑步长 × 自身时间速率。暂停祖先会冻结整棵子树；父系统可对已暂停的直属子系统执行“单步”（固定推进 1 个逻辑步 = 33.33ms），后代仍遵守各自的暂停状态与预算。`,
  },
  {
    id: 'scene-format',
    title: '5. 三维场景资源格式与最小示例场景',
    body: `三维场景播放器与显示设备均不包含硬编码直升机。所有模型几何、贴图参数、灯光、地形、障碍、镜头与默认飞行记录均存放在独立的 .scene JSON 文件中（预置路径：/Demo/helicopter-24.scene）。
在编辑器中修改材质颜色、机身数字（如将 "24" 改为其他数字）、地形波动或障碍物位置后重新在播放器打开，画面与飞行碰撞结果立即同步变化。

【最小合法场景写法（一个物体、一盏灯、一台相机，保存为 .scene 后即可直接用播放器打开）】
{
  "format": "nos-scene-v1",
  "name": "最小示例场景",
  "duration": 5,
  "fps": 30,
  "environment": { "skyTop": "#1b2a4a", "skyMid": "#2f4868", "skyHorizon": "#d9a066", "fogColor": "#c9a882" },
  "lights": [
    { "id": "sun", "type": "directional", "color": "#fff4e0", "intensity": 2.2, "pos": [10, 20, 10], "castShadow": true }
  ],
  "cameras": {
    "cinematic": { "pos": [0, 4, 10], "target": [0, 1, 0], "fov": 45 }
  },
  "parts": [
    {
      "id": "cube1", "name": "示例立方体", "pos": [0, 1, 0], "pickRadius": 1.6,
      "subShapes": [
        { "geom": { "type": "box", "size": [2, 2, 2] }, "material": { "color": "#38bdf8", "roughness": 0.35, "metalness": 0.25 } }
      ]
    }
  ]
}`,
  },
  {
    id: 'flight-ctrl',
    title: '6. 飞行排演、飞控接口与记录回放',
    body: `【多进程协作】
  播放器默认由三个职责独立的进程协作：player_timer.nos（时序控制）通过消息驱动 player_scene.nos（六自由度飞行物理、碰撞、碎片与 3D 点选）和 player_fx.nos（下洗尘土、草叶倾倒、火花烟火与帧提交）。进入排演时另启动第四个进程：/apps/flight_ctrl.nos（闭环飞控）。

【飞控进程接口】
  • 读取传感器：let s = syscall("flight_read_sensors", ARGS.windowId);
    返回：{ t, pos[3], vel[3], rot[3], angVel[3], groundY, altitude, rpm, targetPos[3], targetHeading, landAtTarget, crashed }
  • 写入控制量：syscall("flight_write_controls", ARGS.windowId, { collective, pitch, roll, yaw });
    控制量采用零阶保持直至下次写入，错过周期不补发。
  • 调度影响飞行：排演中的直升机具有固有姿态不稳定性。降低祖先预算、运行 /Programs/busy.nos 抢占预算或调高时间速率，都会拉长飞控周期，导致机体抖动、发散直至坠毁；及时恢复预算可重新拉回姿态。
  • 2 号停机坪降落：预置飞控自动导航至 2 号高台停机坪 (38, 2.2, -26) 悬停并平缓着陆；排演中点击三维地面可直接设定新目标航向与航路点。

【记录回放 vs 子树快照】
  • 排演记录 (.replay)：保存场景引用、初态、输入事件与实际控制时序，重开后任意跳转不随当前预算变化；可在任意时刻点击“开始排演/从此续演”无缝分叉出新的飞行过程。
  • 子树快照 (.snap)：由父系统保存整棵子树的内核、全部进程、变量、未完成工作、消息队列、虚拟时间、文件、桌面与相机状态，支持原位恢复、分叉为独立新子树，以及导出到本机后重启软件导入恢复。`,
  },
  {
    id: 'projection-charts',
    title: '7. 跨层窗口投送与实时图表数据连接',
    body: `【跨层窗口投送边界】
  • 子系统的三维场景播放器与图表工作台窗口右上角均有“投送”按钮，可选择投送到任意祖先桌面（包括跨多层直接投送到根桌面 outer）。
  • 执行归属：源应用、状态、物理与图表计算始终保留在源系统，工作量逐级计入承载预算；目标桌面仅负责外框绘制与输入转发，绝不搬动源 DOM 或另启副本。
  • 投送外框归目标系统，内容与交互结果归源系统：暂停源系统或任一祖先时，内容冻结且提示原因，但目标桌面上的外框仍可移动、缩放与关闭。

【实时图表数据连接与工作簿格式】
  • 根系统电子表格支持 .sheet (JSON) 工作簿，含四则运算、括号、单元格/区域引用与 SUM 公式，自动按依赖图重算并标注 #DIV/0! / #REF! / #CYCLE! 错误。
  • 任意深度的子系统“图表工作台”可选择根系统已打开的工作簿与矩形区域（如 A1:D4），指定标签列与数值列并显式建立实时连接。数据以副本经跨层服务传递，支持分组柱状图与折线图切换。
  • 子树暂停期间，根系统表格仍可正常编辑重算，更新在范围外按序暂存，恢复后按序交付处理。快照恢复或分叉后，图表保留已缓存数据并进入“已恢复，待重新连接”状态，点击重新连接即可取得当前最新完整选区。`,
  },
];

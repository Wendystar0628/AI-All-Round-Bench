// 预置资源：内核、系统服务、飞控、示例程序、工作簿、场景与清单
export const FORMAT = 'nos';

export const KERNEL_TEMPLATE = `# ============================================================
# 嵌套操作系统 · 子系统内核程序
# 由父系统中的承载进程执行，决定本系统的调度、消息与文件策略。
# 修改本文件并保存后，在父系统任务管理器重新载入内核或重启本系统生效。
# ------------------------------------------------------------
# 可调参数（直接改变数字即可）：
#   quantum     每个进程在一个逻辑步内可连续执行的指令数
#   msg_limit   每个进程消息队列上限（超出后 send 返回 -2）
#   fs_prefix   文件路径重写前缀；fs_replace 为替换结果
#   boost       给指定进程提高调度权重的 pid（-1 表示关闭）
# ------------------------------------------------------------
# 自定义系统调用示例：
#   程序调用 service("double", 21)，内核收到 ["double", 21, 请求号]，
#   用 service_reply(请求号, 结果) 返回，调用方得到 42。
#   增加新的 tag 即可增加一个系统调用。
# ============================================================

let tick = 0
let quantum = 420
let msg_limit = 64
let fs_prefix = ""
let fs_replace = ""
let boost = -1

while true {
  set tick = tick + 1
  call set_quantum(quantum)
  call set_msg_limit(msg_limit)
  call set_fs_rule(fs_prefix, fs_replace)
  if boost >= 0 {
    call set_priority(boost, 4)
  }

  # 处理程序通过 service() 发来的请求
  let m = recv(0)
  while m != -1 {
    if m[0] == "double" {
      call service_reply(m[2], m[1] * 2)
    }
    set m = recv(0)
  }

  # 内核自身也消耗本系统的执行预算
  call sleep(20)
}
`;

export const WINMAN_TEMPLATE = `# 窗口管理程序：决定新窗口的层叠偏移与获得焦点后的行为
# focus_rule: 1 = 点击窗口即获得焦点并置顶；0 = 保持原次序
let cascade = 26
let focus_rule = 1
while true {
  call wm_config(cascade, focus_rule)
  call sleep(50)
}
`;

export const FILES_TEMPLATE = `# 文件管理器程序：决定文件列表的排序规则
# sort_mode: 0 = 名称，1 = 类型，2 = 修改时间
let sort_mode = 0
while true {
  call files_config(sort_mode)
  call sleep(60)
}
`;

export const PLAYER_TEMPLATE = `# 播放器时序程序：按本系统虚拟时间推进播放位置并提交画面
# 每次调用 player_tick 推进一步；暂停时播放器不推进
while true {
  call player_tick()
  call sleep(0)
}
`;

export const CHARTS_TEMPLATE = `# 图表数据接收程序：接收跨层工作簿版本，计算坐标并提交图形
# 数据更新以消息送达；图表过渡使用本系统虚拟时间
while true {
  let m = recv(60)
  if m != -1 {
    call chart_handle(m)
  }
  call chart_tick()
  call sleep(0)
}
`;

export const FLIGHT_TEMPLATE = `# 飞行动力学程序：以固定步长推进机体状态
# 控制量由飞控进程写入，未写入时保持上一次控制量
while true {
  call flight_tick()
  call sleep(0)
}
`;

export const CONTROLLER_TEMPLATE = `# ============================================================
# 飞控程序 · 悬停、转场与降落
# 可用传感器编号：
#   0 滚转角(度)   1 俯仰角(度)   2 离地高度(米)   3 垂直速度
#   4 航向(度)     5 到目标水平距离(米)   6 目标方位(度)
#   7 前向速度(米/秒)   8 旋翼转速   9 是否接地
# 输出：control(总距, 滚转舵, 俯仰舵, 偏航舵)
# 控制周期由本程序的 sleep 决定，实际执行受本系统预算与调度限制。
# ============================================================
let tick = 0
while true {
  let roll = sensor(0)
  let pitch = sensor(1)
  let alt = sensor(2)
  let vy = sensor(3)
  let hdg = sensor(4)
  let dist = sensor(5)
  let brg = sensor(6)
  let spd = sensor(7)
  let ground = sensor(9)

  # 传感器融合：每个控制周期做固定量的计算
  # 预算降低时这段计算会拉长控制周期，机体随之抖动直至失控
  let k = 0
  let filt = roll
  while k < 2000 {
    set filt = filt * 0.92 + roll * 0.08
    set k = k + 1
  }

  # 目标高度：靠近二号停机坪后下降
  let targetAlt = 3.2
  if dist < 14 {
    set targetAlt = 0.0
  }

  # 总距：高度与垂直速度反馈
  let thr = 0.408 + (targetAlt - alt) * 0.12 - vy * 0.2
  if dist < 14 && alt < 1.0 {
    set thr = 0.26
  }
  if thr < 0 { set thr = 0 }
  if thr > 1 { set thr = 1 }

  # 期望前向速度：远处巡航，近处减速
  let desired = 8.0
  if dist < 16 {
    set desired = dist * 0.32
  }
  if ground == 1 && dist > 14 {
    set desired = 5.0
  }

  # 姿态角速率（度/秒 -> 弧度/秒）
  let q = sensor(12) / 57.3
  let p = sensor(13) / 57.3
  let r = sensor(14) / 57.3

  # 偏航通道：按方位误差给出期望角速率
  let dh = brg - hdg
  while dh > 180 { set dh = dh - 360 }
  while dh < -180 { set dh = dh + 360 }

  # 俯仰通道：期望俯仰角由速度误差给出，再用角度与角速率反馈
  let pitchR = pitch / 57.3
  let rollR = roll / 57.3
  let desiredPitch = (desired - spd) * 0.06
  if desiredPitch > 0.35 { set desiredPitch = 0.35 }
  if desiredPitch < -0.35 { set desiredPitch = -0.35 }
  let pitchCmd = (desiredPitch - pitchR) * 3.0 - q * 0.9
  if pitchCmd > 1 { set pitchCmd = 1 }
  if pitchCmd < -1 { set pitchCmd = -1 }

  # 滚转通道：按航向误差压坡度，实现协调转弯
  let desiredRoll = dh * 0.02
  if desiredRoll > 0.55 { set desiredRoll = 0.55 }
  if desiredRoll < -0.55 { set desiredRoll = -0.55 }
  let rollCmd = (desiredRoll - rollR) * 3.0 - p * 0.9
  if rollCmd > 1 { set rollCmd = 1 }
  if rollCmd < -1 { set rollCmd = -1 }

  # 偏航通道：期望角速率
  let desiredRate = dh * 0.02
  if desiredRate > 0.5 { set desiredRate = 0.5 }
  if desiredRate < -0.5 { set desiredRate = -0.5 }
  let yawCmd = (desiredRate - r) * 1.5
  if yawCmd > 1 { set yawCmd = 1 }
  if yawCmd < -1 { set yawCmd = -1 }

  call control(thr, rollCmd, pitchCmd, yawCmd)
  set tick = tick + 1
  call sleep(20)
}
`;

export const ADD_PROGRAM = `# 累加计算：每次循环把平方累加到 total
let total = 0
let i = 0
while i < 5 {
  set total = total + i * i
  set i = i + 1
  call log("i=" + i + " total=" + total)
}
call log("累加完成：" + total)
`;

export const LOOP_PROGRAM = `# 持续计算：不主动等待或让出执行权，用于检验调度
# 预算不足时由调度器按量子截断，其他进程仍可获得执行机会
let i = 0
let acc = 0
while true {
  set acc = acc + i * i
  set i = i + 1
  if i > 1000000 {
    call log("已执行一百万次循环")
    set i = 0
  }
}
`;

export const SENDER_PROGRAM = `# 消息发送：启动接收进程并发送三条消息
let pid = spawn("/Demo/receiver.prog", "receiver")
call sleep(120)
let i = 0
while i < 3 {
  let ok = send(pid, 100 + i)
  call log("发送 " + (100 + i) + " 结果 " + ok)
  set i = i + 1
}
call sleep(200)
`;

export const RECEIVER_PROGRAM = `# 消息接收：等待消息并打印，没有消息时最多等一秒
while true {
  let m = recv(1000)
  if m != -1 {
    call log("收到消息：" + m)
  } else {
    call log("等待超时")
    call sleep(200)
  }
}
`;

export const SERVICE_PROGRAM = `# 自定义系统调用：通过内核的 service 请求 double
let r = service("double", 21)
call log("double(21) = " + r)
let i = 0
while i < 3 {
  set r = service("double", i)
  call log("double(" + i + ") = " + r)
  set i = i + 1
}
`;

export const COMPILER_TEMPLATE = `# 编译器配置程序：宿主编译器读取这里的编译约束
# max_depth 限制表达式嵌套，max_ops 限制单程序指令规模
let max_depth = 32
let max_ops = 200000
let allow_index = 1
while true {
  call compiler_config(max_depth, max_ops, allow_index)
  call sleep(100)
}
`;

export const DRAW_PROGRAM = `# 二维显示提交：向本系统的显示设备提交图形
# 面板 id 为 "demo"，在“程序面板”窗口中查看
let i = 0
while true {
  call panel_clear("demo", "#0d1424")
  let x = 20
  while x < 360 {
    let h = (x * 3 + i * 11) % 160
    call panel_rect("demo", x, 240 - h, 18, h, "#6f8dff")
    set x = x + 26
  }
  call panel_text("demo", 18, 26, "程序面板 · 实时提交 " + i, "#dfe7ff")
  set i = i + 1
  call sleep(80)
}
`;

export const SAMPLE_SHEET = {
  format: 'nos-sheet',
  version: 1,
  name: '示例工作簿',
  cells: {
    A1: '项目', B1: '数量', C1: '单价', D1: '小计',
    A2: '项目 A', B2: 24, C2: 6, D2: '=B2*C2',
    A3: '项目 B', B3: 12, C3: 8, D3: '=B3*C3',
    A4: '项目 C', B4: 18, C4: 4, D4: '=B4*C4'
  },
  formats: { A1: 'bold', B1: 'bold', C1: 'bold', D1: 'bold', D2: 'money', D3: 'money', D4: 'money' },
  colWidths: { A: 140, B: 90, C: 90, D: 110 }
};

export const SCENE_HELICOPTER = {
  format: 'nos-scene',
  version: 1,
  name: '紫翼 24 号 · 黄昏山谷',
  author: 'Nested OS Studio',
  environment: {
    time: '17:40', weather: '晴 · 微风',
    skyTop: '#0d1730', skyMid: '#5c5d94', skyBottom: '#f0a76e',
    sunColor: '#ffe6c0', sun: [0.55, 0.42, -0.35], intensity: 1.55,
    ambient: 0.42, hemiSky: '#b6c8ff', hemiGround: '#3a2d2a',
    fogColor: '#7a7290', fogNear: 130, fogFar: 620,
    exposure: 0.95
  },
  terrain: {
    size: 640, segments: 128, seed: 24, hills: 1.0,
    colorLow: '#33502f', colorHigh: '#6f7a45', rock: '#3d3a30'
  },
  helicopter: { body: '#7b3fe4', bodyDark: '#4e2596', accent: '#ffd23f', number: '24', scale: 1 },
  pads: [
    { x: 0, z: 0, r: 11, label: 'H1' },
    { x: 74, z: -38, r: 11, label: 'H2' }
  ],
  buildings: [
    { type: 'hangar', x: -42, z: 30, w: 26, d: 18, h: 8, rot: 0.2, color: '#6b6f78' },
    { type: 'tower', x: 52, z: 26, w: 7, d: 7, h: 17, rot: 0, color: '#8a8f99' },
    { type: 'container', x: 30, z: 34, w: 12, d: 5, h: 3, rot: -0.1, color: '#9a5b4a' },
    { type: 'container', x: 44, z: 38, w: 12, d: 5, h: 3, rot: 0.05, color: '#4a6f8a' },
    { type: 'silo', x: -58, z: -18, w: 8, d: 8, h: 12, rot: 0, color: '#a8a49a' }
  ],
  trees: 54,
  rocks: 20,
  timeline: {
    duration: 15,
    fps: 30,
    keys: [
      { t: 0, pos: [0, 1.0, 0], rot: [0, 0, 0], rotor: 0.18, damage: 0, cam: [[18, 8.5, 22], [0, 2.2, 0]], label: '停机坪 · 旋翼启动' },
      { t: 1.4, pos: [0, 3.6, 0], rot: [0.02, 0, 0.01], rotor: 0.95, damage: 0, cam: [[16, 9.5, 20], [0, 3.4, 0]], label: '离地' },
      { t: 3.0, pos: [2, 8.0, -3], rot: [-0.05, -0.25, 0.03], rotor: 1, damage: 0, cam: [[12, 12.5, 14], [0, 3.8, 0]], label: '爬升转向' },
      { t: 5.0, pos: [20, 9.2, -19], rot: [-0.08, -0.55, 0.04], rotor: 1, damage: 0, cam: [[8, 13, 6], [0, 4, 0]], label: '前飞' },
      { t: 6.6, pos: [33, 8.7, -27], rot: [0.06, -0.62, -0.05], rotor: 0.86, damage: 0.15, cam: [[4, 12, -2], [0, 4, 0]], label: '故障征兆 · 旋翼功率下降' },
      { t: 8.2, pos: [41, 7.4, -30], rot: [0.28, -0.5, 0.22], rotor: 0.55, damage: 0.45, cam: [[2, 11, -8], [0, 3.5, 0]], label: '失控' },
      { t: 9.6, pos: [45, 5.0, -32], rot: [0.72, -0.25, 0.55], rotor: 0.3, damage: 0.7, cam: [[-2, 9, -14], [0, 3, 0]], label: '坠落' },
      { t: 10.8, pos: [47.5, 2.4, -33], rot: [1.25, 0.15, 0.95], rotor: 0.16, damage: 0.95, cam: [[-4, 7, -20], [0, 2, 0]], label: '撞击前' },
      { t: 11.35, pos: [48, 1.15, -33.2], rot: [1.62, 0.35, 1.25], rotor: 0.05, damage: 1, cam: [[-6, 5.5, -24], [0, 1.4, 0]], label: '撞击' },
      { t: 12.2, pos: [48.4, 1.0, -33.4], rot: [1.58, 0.42, 1.31], rotor: 0, damage: 1, cam: [[-8, 6.5, -26], [0, 1.4, 0]], label: '残骸与烟尘' },
      { t: 15.0, pos: [48.4, 1.0, -33.4], rot: [1.58, 0.42, 1.31], rotor: 0, damage: 1, cam: [[-9, 7.5, -27.5], [0, 1.4, 0]], label: '余波 · 画面停稳' }
    ]
  },
  flight: { wind: 2.2, faultAt: 0, start: [0, 3.4, 0], targetPad: 1 },
  camera: { fov: 46, near: 0.5, far: 1400 }
};

export const SCENE_MINIMAL = {
  format: 'nos-scene',
  version: 1,
  name: '最小场景 · 一个物体、一盏灯、一台相机',
  environment: {
    time: '12:00', weather: '晴',
    skyTop: '#20344f', skyMid: '#6d87a8', skyBottom: '#d7c9a8',
    sunColor: '#fff2d0', sun: [0.4, 0.8, 0.2], ambient: 0.6,
    hemiSky: '#cfe0ff', hemiGround: '#4a4032',
    fogColor: '#9aa8b8', fogNear: 40, fogFar: 220, exposure: 1
  },
  terrain: { size: 160, segments: 32, seed: 5, hills: 0.15, colorLow: '#5b6b4a', colorHigh: '#8a8a62', rock: '#4a4038' },
  helicopter: { body: '#6f8dff', bodyDark: '#3c55b0', accent: '#ffd23f', number: '01', scale: 1 },
  pads: [{ x: 0, z: 0, r: 8, label: 'H' }],
  buildings: [],
  trees: 3,
  rocks: 2,
  timeline: {
    duration: 6, fps: 30,
    keys: [
      { t: 0, pos: [0, 1, 0], rot: [0, 0.4, 0], rotor: 0.5, damage: 0, cam: [[9, 5, 11], [0, 2, 0]] },
      { t: 3, pos: [0, 2.2, 0], rot: [0, 1.1, 0], rotor: 1, damage: 0, cam: [[7, 6, 9], [0, 2.2, 0]] },
      { t: 6, pos: [0, 1, 0], rot: [0, 2.0, 0], rotor: 0.5, damage: 0, cam: [[9, 5, 11], [0, 2, 0]] }
    ]
  },
  flight: { wind: 0, faultAt: 0, start: [0, 3, 0], targetPad: 0 },
  camera: { fov: 46, near: 0.5, far: 800 }
};

export const APP_DEFS = {
  files: { title: '文件管理器', icon: 'files', color: '#ffc857', launch: 'launch-files', desc: '浏览与管理本系统文件' },
  spreadsheet: { title: '电子表格', icon: 'sheet', color: '#4ade80', launch: 'launch-spreadsheet', desc: '公式、区域与实时数据发布' },
  widgets: { title: '小组件', icon: 'widgets', color: '#7dd3fc', launch: 'launch-widgets', desc: '时钟、倒计时、便笺与通知' },
  editor: { title: '文本与程序编辑器', icon: 'editor', color: '#93c5fd', launch: 'launch-editor', desc: '编辑程序、内核与飞控' },
  browser: { title: '浏览器', icon: 'browser', color: '#60a5fa', launch: 'launch-browser', desc: '基于 Chromium 的真实网页浏览' },
  tasks: { title: '任务管理器', icon: 'tasks', color: '#f472b6', launch: 'launch-tasks', desc: '进程、预算、内存与配额' },
  settings: { title: '设置', icon: 'settings', color: '#a3b3d9', launch: 'launch-settings', desc: '名称、壁纸、强调色与缩放' },
  player: { title: '三维场景播放器', icon: 'player', color: '#c084fc', launch: 'launch-player', desc: '场景播放、镜头与飞行排演' },
  charts: { title: '图表工作台', icon: 'charts', color: '#34d399', launch: 'launch-charts', desc: '实时数据连接与图表' },
  sysmgr: { title: '系统管理器', icon: 'system', color: '#f0abfc', launch: 'launch-system', desc: '子系统树、快照与内核' },
  projection: { title: '投送窗口', icon: 'projection', color: '#67e8f9', launch: null, desc: '祖先桌面上的应用投送' }
};

export const WALLPAPERS = [
  { id: 'dusk', name: '暮色山谷', file: 'assets/wallpaper-dusk.svg', tint: 'linear-gradient(180deg, rgba(10,14,28,.02), rgba(10,14,28,.25))' },
  { id: 'aurora', name: '极光雪岭', file: 'assets/wallpaper-aurora.svg', tint: 'linear-gradient(180deg, rgba(6,10,24,.02), rgba(6,10,24,.28))' },
  { id: 'dunes', name: '赤沙丘', file: 'assets/wallpaper-dunes.svg', tint: 'linear-gradient(180deg, rgba(20,10,20,.02), rgba(20,10,20,.25))' },
  { id: 'tide', name: '月下潮汐', file: 'assets/wallpaper-tide.svg', tint: 'linear-gradient(180deg, rgba(4,10,18,.02), rgba(4,10,18,.3))' }
];

export const ACCENTS = [
  { id: 'blue', name: '晴空蓝', a: '#6f8dff', b: '#a06bff' },
  { id: 'violet', name: '暮光紫', a: '#a06bff', b: '#e879d9' },
  { id: 'teal', name: '潮汐青', a: '#2dd4bf', b: '#38bdf8' },
  { id: 'amber', name: '沙丘金', a: '#f59e0b', b: '#f97316' },
  { id: 'rose', name: '霞光粉', a: '#fb7185', b: '#c084fc' },
  { id: 'green', name: '苔原绿', a: '#4ade80', b: '#22d3ee' }
];

export const FIXTURE_MANIFEST = {
  outer: {
    workbook: '/Demo/sample.sheet',
    helicopter: '/Demo/helicopter-24.scene',
    minimalScene: '/Demo/minimal.scene',
    documents: '/Documents',
    kernelTemplate: '/System/kernel.sys',
    controller: '/System/controller.prog',
    compiler: '/System/compiler.prog'
  },
  inner: {
    helicopter: '/Demo/helicopter-24.scene',
    minimalScene: '/Demo/minimal.scene',
    documents: '/Documents',
    controller: '/System/controller.prog',
    compiler: '/System/compiler.prog',
    programs: ['/System/winman.prog', '/System/files.prog', '/System/player.prog', '/System/charts.prog', '/System/flight.prog']
  }
};

export const APP_ORDER_ROOT = ['files', 'spreadsheet', 'widgets', 'editor', 'browser', 'tasks', 'settings', 'sysmgr'];
export const APP_ORDER_INNER = ['files', 'editor', 'tasks', 'player', 'charts', 'sysmgr', 'settings'];

export const DEMO_FILES = {
  '/Documents/readme.txt': 'Nested OS 示例文档\n\n这是根系统中的一个普通文本文件，可以在编辑器中打开和修改。\n',
  '/Documents/flight-notes.md': '# 飞行记录说明\n\n排演记录保存实际输入与控制时序，重新打开后可从任意位置回放或续演。\n',
  '/Demo/add.prog': ADD_PROGRAM,
  '/Demo/loop.prog': LOOP_PROGRAM,
  '/Demo/sender.prog': SENDER_PROGRAM,
  '/Demo/receiver.prog': RECEIVER_PROGRAM,
  '/Demo/service.prog': SERVICE_PROGRAM,
  '/Demo/draw.prog': DRAW_PROGRAM,
  '/Demo/minimal.scene': JSON.stringify(SCENE_MINIMAL, null, 2),
  '/System/kernel.sys': KERNEL_TEMPLATE,
  '/System/controller.prog': CONTROLLER_TEMPLATE,
  '/System/compiler.prog': COMPILER_TEMPLATE,
  '/System/winman.prog': WINMAN_TEMPLATE,
  '/System/files.prog': FILES_TEMPLATE,
  '/System/player.prog': PLAYER_TEMPLATE,
  '/System/charts.prog': CHARTS_TEMPLATE,
  '/System/flight.prog': FLIGHT_TEMPLATE
};

export const INNER_FILES = {
  '/Documents/welcome.txt': '这是子系统文档目录。\n\n子系统拥有独立的文件系统、进程表、虚拟时钟和桌面。\n',
  '/Demo/add.prog': ADD_PROGRAM,
  '/Demo/loop.prog': LOOP_PROGRAM,
  '/Demo/sender.prog': SENDER_PROGRAM,
  '/Demo/receiver.prog': RECEIVER_PROGRAM,
  '/Demo/service.prog': SERVICE_PROGRAM,
  '/Demo/draw.prog': DRAW_PROGRAM,
  '/System/winman.prog': WINMAN_TEMPLATE,
  '/System/files.prog': FILES_TEMPLATE,
  '/System/player.prog': PLAYER_TEMPLATE,
  '/System/charts.prog': CHARTS_TEMPLATE,
  '/System/flight.prog': FLIGHT_TEMPLATE,
  '/System/controller.prog': CONTROLLER_TEMPLATE,
  '/System/compiler.prog': COMPILER_TEMPLATE,
  '/System/kernels/README.txt': '子系统的内核源文件保存在父系统中：/System/kernels/<实例>.kernel\n'
};
const fs = require("fs");
const put = (n, v) =>
  fs.writeFileSync(__dirname + "/" + n, JSON.stringify(v, null, 2));
const kernel = {
  name: "Nest Kernel / 分层轮转",
  format: "nest-1",
  code: [
    ["call", "process.spawn", "wm", "/System/wm.nest"],
    ["label", "loop"],
    ["call", "clock.pending", "clock"],
    ["if", ["==", "$clock.frame", "$lastFrame"], "requests"],
    ["call", "clock.advance", null, "$clock.delta"],
    ["set", "lastFrame", "$clock.frame"],
    ["label", "requests"],
    ["call", "request.next", "req"],
    ["if", ["==", "$req", null], "schedule"],
    ["if", ["==", "$req.name", "message.send"], "message"],
    ["if", ["==", "$req.name", "file.read"], "read"],
    ["if", ["==", "$req.name", "file.write"], "write"],
    ["if", ["==", "$req.name", "process.spawn"], "spawn"],
    ["if", ["==", "$req.name", "echo"], "echo"],
    ["call", "request.reply", null, "$req.pid", "未知系统调用"],
    ["jump", "schedule"],
    ["label", "message"],
    [
      "call",
      "message.deliver",
      "result",
      "$req.pid",
      ["at", "$req.args", 0],
      ["at", "$req.args", 1],
    ],
    ["jump", "reply"],
    ["label", "read"],
    ["call", "file.read", "result", ["at", "$req.args", 0]],
    ["jump", "reply"],
    ["label", "write"],
    [
      "call",
      "file.write",
      "result",
      ["at", "$req.args", 0],
      ["at", "$req.args", 1],
    ],
    ["jump", "reply"],
    ["label", "spawn"],
    ["call", "process.spawn", "result", ["at", "$req.args", 0]],
    ["jump", "reply"],
    ["label", "echo"],
    ["set", "result", ["at", "$req.args", 0]],
    ["label", "reply"],
    ["call", "request.reply", null, "$req.pid", "$result"],
    ["label", "schedule"],
    ["call", "tasks.list", "ids"],
    ["set", "i", 0],
    ["label", "each"],
    ["if", [">=", "$i", ["len", "$ids"]], "loop"],
    ["set", "pid", ["at", "$ids", "$i"]],
    ["call", "task.info", "task", "$pid"],
    ["if", ["==", "$task.state", "ended"], "next"],
    ["if", ["==", "$task.state", "error"], "next"],
    ["if", ["==", "$task.state", "suspended"], "next"],
    ["if", ["==", "$task.state", "syswait"], "next"],
    ["if", ["==", "$task.state", "compiling"], "next"],
    ["if", ["!=", "$task.state", "waiting"], "run"],
    ["if", ["==", "$task.waitMessage", true], "wait-mail"],
    ["time", "now"],
    ["if", ["<", "$now", "$task.wake"], "next"],
    ["jump", "wake"],
    ["label", "wait-mail"],
    ["if", ["==", "$task.messages", 0], "next"],
    ["label", "wake"],
    ["call", "task.state", null, "$pid", "ready"],
    ["label", "run"],
    ["call", "task.execute", null, "$pid", 192],
    ["label", "next"],
    ["add", "i", 1],
    ["jump", "each"],
  ],
};
for (const operation of ["mkdir", "rename", "delete", "restore"]) {
  kernel.code.splice(
    kernel.code.findIndex(
      (i) => i[0] === "if" && JSON.stringify(i).includes("message.send"),
    ),
    0,
    ["if", ["==", "$req.name", "file." + operation], "fs-" + operation],
  );
  kernel.code.push(
    ["label", "fs-" + operation],
    [
      "call",
      "file." + operation,
      "result",
      ["at", "$req.args", 0],
      ["at", "$req.args", 1],
    ],
    ["jump", "reply"],
  );
}
put("kernel.nest.json", kernel);
put("compiler.nest.json", {
  name: "Nest 编译器",
  format: "nest-1",
  code: [
    ["recv", "source"],
    ["call", "compiler.parse", "result", "$source"],
    ["call", "compiler.launch", null, "$result"],
    ["halt"],
  ],
});
put("wm.nest.json", {
  name: "桌面合成器",
  format: "nest-1",
  policy: { stack: "last", focus: "clicked", hit: "top" },
  code: [
    ["call", "display.desktop"],
    ["wait", 0.1],
    ["jump", 0],
  ],
});
for (const [id, policy] of Object.entries({
  files: { sort: "ascending" },
  charts: { multiplier: 1 },
  player: { sampleRate: 30 },
  editor: { tabSize: 2 },
  tasks: { sort: "pid" },
}))
  put(id + ".nest.json", {
    name: id + " 应用服务",
    format: "nest-1",
    policy,
    code: [
      ["call", "app.events"],
      ["call", "app." + id],
      ["wait", 0.05],
      ["jump", 0],
    ],
  });
put("flight.nest.json", {
  name: "24 号 · 闭环飞控",
  format: "nest-1",
  code: [
    ["label", "control"],
    ["call", "flight.sensor", "s"],
    [
      "set",
      "lift",
      ["+", 0.62, ["*", 0.12, ["-", 5, "$s.y"]], ["*", -0.2, "$s.vy"]],
    ],
    ["call", "flight.control", null, "$lift", ["*", -0.8, "$s.roll"]],
    ["wait", 0.1],
    ["jump", "control"],
  ],
});
put("accumulate.nest.json", {
  name: "累加计算",
  format: "nest-1",
  code: [
    ["set", "sum", 0],
    ["set", "i", 1],
    ["label", "loop"],
    ["add", "sum", "$i"],
    ["add", "i", 1],
    ["if", ["<=", "$i", 1000], "loop"],
    ["print", "$sum"],
    ["halt"],
  ],
});
put("compute.nest.json", {
  name: "持续计算",
  format: "nest-1",
  code: [
    ["set", "n", 0],
    ["label", "loop"],
    ["add", "n", 1],
    ["jump", "loop"],
  ],
});
put("receive.nest.json", {
  name: "消息接收",
  format: "nest-1",
  code: [
    ["label", "again"],
    ["recv", "message"],
    ["print", "$message"],
    ["jump", "again"],
  ],
});
put("send.nest.json", {
  name: "消息发送（修改 target 为接收 PID）",
  format: "nest-1",
  code: [
    ["set", "target", 1],
    ["set", "i", 0],
    ["label", "loop"],
    ["send", "$target", "来自发送进程的问候"],
    ["add", "i", 1],
    ["wait", 0.5],
    ["if", ["<", "$i", 5], "loop"],
    ["halt"],
  ],
});
put("sample.sheet.json", {
  title: "山谷基地 · 物资清单",
  cells: {
    A1: "项目",
    B1: "数量",
    C1: "单价",
    D1: "小计",
    A2: "项目 A",
    B2: "24",
    C2: "6",
    D2: "=B2*C2",
    A3: "项目 B",
    B3: "12",
    C3: "8",
    D3: "=B3*C3",
    A4: "项目 C",
    B4: "18",
    C4: "4",
    D4: "=B4*C4",
  },
  formats: { A1: "header", B1: "header", C1: "header", D1: "header" },
});
const scene = {
  format: "nest-scene-1",
  title: "24 / 山谷回声",
  duration: 15,
  fps: 30,
  sky: "#c6d6d9",
  fog: "#b9cbd0",
  nodes: [],
  tracks: [],
  effects: [
    {
      type: "dust",
      start: 1,
      end: 5,
      count: 65,
      color: "#cbbd9b",
      origin: [0, 0, 0],
      radius: 4,
    },
    {
      type: "smoke",
      start: 8,
      end: 15,
      count: 65,
      color: "#56545a",
      origin: [9, 0, 0],
      radius: 2,
    },
    {
      type: "fire",
      start: 10.7,
      end: 14,
      count: 30,
      color: "#ffab40",
      origin: [9, 0.6, 0],
      radius: 1.6,
    },
  ],
  lights: [
    { type: "sun", position: [-15, 30, 12], color: "#ffebcd", intensity: 3 },
  ],
  camera: { position: [8.5, 6.4, 11], target: [0, 1.7, 0] },
  group: "aircraft",
};
let idx = 0;
function node(name, shape, pos, scale, color, extra = {}) {
  scene.nodes.push({
    id: "n" + idx++,
    name,
    shape,
    position: pos,
    scale,
    color,
    ...extra,
  });
  return scene.nodes.at(-1);
}
node("山谷地面", "terrain", [0, -0.12, 0], [100, 1, 100], "#85998a", {
  roughness: 1,
});
for (const x of [0, 16]) {
  node("停机坪", "cylinder", [x, 0, 0], [5, 0.15, 5], "#b1b5aa");
  node("停机坪标线", "ring", [x, 0.09, 0], [4, 0.01, 4], "#eadc9d");
  node("H", "text", [x, 0.11, 0], [3, 3, 3], "#f4e7bb", {
    text: "H",
    ground: true,
  });
}
node("机库", "box", [-15, 2, -11], [9, 4, 7], "#b7b5a9");
node("机库顶", "box", [-15, 4.1, -11], [9.5, 0.25, 7.5], "#657d7a");
node("机库门", "box", [-15, 1.8, -7.45], [5, 3.4, 0.1], "#3d5658");
node("塔台", "box", [-8, 3, -16], [3, 6, 3], "#a5aca1");
node("观察室", "box", [-8, 6, -16], [4, 2, 4], "#627a80");
let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
for (let i = 0; i < 55; i++) {
  let x = (rnd() - 0.5) * 85,
    z = (rnd() - 0.5) * 75;
  if (Math.abs(z) < 7 && x > -7 && x < 23) continue;
  let h = 1 + rnd() * 3;
  node("杉树树干", "cylinder", [x, h / 3, z], [0.18, h * 0.7, 0.18], "#6d6653");
  node(
    "杉树",
    "cone",
    [x, h, z],
    [h * 0.65, h * 1.6, h * 0.65],
    ["#526f63", "#617e6b", "#78907a"][i % 3],
  );
}
for (let i = 0; i < 18; i++) {
  let a = (i / 18) * Math.PI * 2;
  node(
    "远山",
    "cone",
    [Math.sin(a) * 62, -2, Math.cos(a) * 62],
    [18 + rnd() * 14, 15 + rnd() * 19, 18 + rnd() * 12],
    "#8da39d",
  );
}
node("机身", "sphere", [0, 1.9, 0], [2.9, 2.1, 1.8], "#76639b", {
  group: "aircraft",
  metalness: 0.3,
});
node("黄色机腹", "sphere", [0.15, 1.45, 0], [2.8, 1.1, 1.86], "#e4b94d", {
  group: "aircraft",
});
node("驾驶舱", "sphere", [1, 2.1, 0], [1.7, 1.5, 1.65], "#284d61", {
  group: "aircraft",
  metalness: 0.65,
  roughness: 0.15,
});
node("风挡框", "box", [0.6, 2.3, 0], [0.12, 1.45, 1.78], "#c2b2cf", {
  group: "aircraft",
});
node("尾梁", "box", [-2.8, 2.05, 0], [4, 0.4, 0.5], "#76639b", {
  group: "aircraft",
});
node("尾翼", "box", [-4.6, 2.55, 0], [0.6, 1.5, 0.18], "#e4b94d", {
  group: "aircraft",
  rotation: [0, 0, -0.25],
});
node("水平尾翼", "box", [-4, 2.1, 0], [1.2, 0.12, 2], "#e4b94d", {
  group: "aircraft",
});
node("主旋翼轴", "cylinder", [-0.3, 3.25, 0], [0.15, 1, 0.15], "#424951", {
  group: "aircraft",
});
node("主旋翼", "box", [-0.3, 3.65, 0], [9, 0.06, 0.2], "#434950", {
  group: "aircraft",
  spin: [0, 24, 0],
  breakAt: 10.8,
});
node("主旋翼交叉叶", "box", [-0.3, 3.65, 0], [0.2, 0.06, 9], "#434950", {
  group: "aircraft",
  spin: [0, 24, 0],
  breakAt: 10.8,
});
node("尾旋翼", "box", [-4.65, 2.5, 0.4], [0.1, 1.7, 0.12], "#e4b94d", {
  group: "aircraft",
  spin: [0, 0, 30],
  breakAt: 10.8,
});
for (let z of [-0.95, 0.95]) {
  node("滑橇", "box", [0, 0.14, z], [3.7, 0.12, 0.13], "#414c54", {
    group: "aircraft",
    breakAt: 10.8,
  });
  for (let x of [-0.8, 0.8])
    node("起落架", "box", [x, 0.54, z], [0.12, 0.9, 0.12], "#5b6268", {
      group: "aircraft",
    });
  node("24 号识别", "text", [-0.4, 2, z * 1.03], [1, 1, 1], "#fff0b0", {
    text: "24",
    group: "aircraft",
    rotation: [0, z < 0 ? Math.PI : 0, 0],
  });
}
scene.tracks = [
  { time: 0, position: [0, 0, 0], rotation: [0, 0, 0] },
  { time: 1.5, position: [0, 0, 0], rotation: [0, 0, 0] },
  { time: 4, position: [0, 5, 0], rotation: [0.02, 0, -0.05] },
  { time: 6.5, position: [5, 7, -1], rotation: [0.08, -0.3, -0.1] },
  { time: 8, position: [9, 6, 0], rotation: [0.05, -0.7, 0.08] },
  { time: 9, position: [11, 5, 0], rotation: [0.25, -1, 0.3] },
  { time: 10, position: [11, 3, 0], rotation: [0.45, -1.5, 0.8] },
  { time: 10.8, position: [9, -0.15, 0], rotation: [0.6, -2, 1.4] },
  { time: 12, position: [9, -0.35, 0], rotation: [0.65, -2, 1.5] },
  { time: 15, position: [9, -0.35, 0], rotation: [0.65, -2, 1.5] },
];
put("helicopter-24.scene.json", scene);
put("minimal.scene.json", {
  format: "nest-scene-1",
  title: "最小场景",
  duration: 5,
  fps: 30,
  sky: "#cad4d8",
  nodes: [
    {
      id: "cube",
      name: "立方体",
      shape: "box",
      position: [0, 1, 0],
      scale: [2, 2, 2],
      color: "#9474b5",
    },
  ],
  tracks: [],
  lights: [
    { type: "sun", position: [10, 10, 10], intensity: 3, color: "#fff5da" },
  ],
  camera: { position: [7, 5, 8], target: [0, 1, 0] },
});

for (const [name, program] of Object.entries(require("./programs.cjs")))
  put(name + ".nest.json", program);

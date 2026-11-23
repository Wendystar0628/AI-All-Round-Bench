const fs = require("fs");
let seed = 24;
function rand() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}
const scene = {
  title: "24 号 · 高原试飞",
  duration: 15,
  sky: "#b6ceca",
  fog: 155,
  light: [-28, 52, 24],
  cameras: [
    [9, 5, 13],
    [4, 3, 12],
    [-8, 7, 14],
  ],
  ground: 0,
  nodes: [],
  tracks: {},
  weather: "高积云 · 西南风",
};
const N = scene.nodes;
function part(
  id,
  shape,
  color,
  p,
  size,
  parent = "",
  rot = [0, 0, 0],
  more = {},
) {
  N.push({ id, shape, color, p, size, parent, rot, ...more });
  return id;
}
function group(id, p, parent = "") {
  return part(id, "group", "#fff", p, [1, 1, 1], parent);
}
function rod(id, a, b, r, c, parent) {
  return part(id, "rod", c, a, [r, r, 1], parent, [], { end: b });
}
group("机体", [0, 0, 0]);
const purple = "#68428e",
  gold = "#ffcf44",
  navy = "#272939",
  glass = "#264652",
  silver = "#b3b8ad";
part("机舱", "ball", purple, [0, 1.47, 0], [2.65, 1.12, 1.17], "机体");
part("驾驶舱", "ball", glass, [1.45, 1.6, 0], [1.37, 1.0, 1.12], "机体");
part("下部整流罩", "ball", gold, [0.47, 1.01, 0], [2.25, 0.53, 1.12], "机体");
part("发动机罩", "ball", purple, [-0.7, 2.32, 0], [1.24, 0.51, 0.78], "机体");
for (let sign of [-1, 1]) {
  part(
    "侧舱门" + sign,
    "box",
    purple,
    [-0.1, 1.48, sign * 1.045],
    [1.74, 1.14, 0.12],
    "机体",
  );
  part(
    "侧窗" + sign,
    "box",
    "#3d6571",
    [0.06, 1.79, sign * 1.123],
    [1.24, 0.45, 0.05],
    "机体",
  );
  part(
    "机号" + sign,
    "label",
    gold,
    [-0.45, 1.23, sign * 1.126],
    [1.12, 0.62, 1],
    "机体",
    [0, sign < 0 ? Math.PI : 0, 0],
    { text: "24" },
  );
  rod(
    "前窗框" + sign,
    [1.53, 2.47, sign * 0.29],
    [2.51, 1.35, sign * 0.83],
    0.04,
    gold,
    "机体",
  );
  rod(
    "门柱" + sign,
    [0.87, 2.29, sign * 0.67],
    [0.96, 1.14, sign * 1.14],
    0.055,
    gold,
    "机体",
  );
  for (let x of [-1.28, 1.12])
    rod(
      "起落架支柱" + x + sign,
      [x, 0.94, sign * 0.68],
      [x - 0.13, 0.15, sign * 1.19],
      0.071,
      navy,
      "机体",
    );
  rod(
    "滑橇" + sign,
    [-2, 0.11, sign * 1.2],
    [1.8, 0.11, sign * 1.2],
    0.095,
    navy,
    "机体",
  );
  rod(
    "滑橇前缘" + sign,
    [1.8, 0.11, sign * 1.2],
    [2.19, 0.32, sign * 1.2],
    0.085,
    navy,
    "机体",
  );
  for (let i = 0; i < 5; i++)
    part(
      "散热栅" + i + sign,
      "box",
      navy,
      [-1.55 + i * 0.16, 2.36, sign * 0.71],
      [0.087, 0.25, 0.05],
      "机体",
      [0, 0, -0.22],
    );
}
part("尾梁", "cone", purple, [-3.7, 1.73, 0], [0.69, 4.8, 0.69], "机体", [
  0,
  0,
  Math.PI / 2 + 0.09,
]);
part(
  "尾鳍",
  "box",
  gold,
  [-5.75, 2.14, 0],
  [0.56, 1.75, 0.19],
  "机体",
  [0, 0, -0.33],
);
part("水平安定面", "box", purple, [-4.74, 1.93, 0], [0.69, 0.13, 2.05], "机体");
part("旋翼轴", "cyl", silver, [-0.44, 2.98, 0], [0.13, 0.68, 0.13], "机体");
group("主旋翼", [-0.44, 3.31, 0], "机体");
for (let i = 0; i < 4; i++) {
  let a = (i * Math.PI) / 2;
  part(
    "旋翼叶片" + i,
    "box",
    navy,
    [Math.cos(a) * 2.71, 0, -Math.sin(a) * 2.71],
    [5.35, 0.075, 0.27],
    "主旋翼",
    [0, a, 0],
  );
  part(
    "叶尖" + i,
    "box",
    gold,
    [Math.cos(a) * 5.09, 0.014, -Math.sin(a) * 5.09],
    [0.65, 0.08, 0.29],
    "主旋翼",
    [0, a, 0],
  );
}
group("尾桨", [-5.75, 2.3, 0.23], "机体");
for (let i = 0; i < 3; i++) {
  let a = (i * Math.PI * 2) / 3;
  part(
    "尾桨叶" + i,
    "box",
    navy,
    [0.48 * Math.cos(a), 0.48 * Math.sin(a), 0],
    [0.91, 0.1, 0.1],
    "尾桨",
    [0, 0, a],
  );
}
part("草甸", "box", "#92a181", [0, -0.36, 0], [420, 0.7, 420]);
for (let i = 0; i < 37; i++) {
  let a = (i * 6.28) / 37,
    rad = 67 + rand() * 28;
  part(
    "山脊" + i,
    "rock",
    ["#91a99a", "#92aba8", "#819b92", "#a6b6a3"][i % 4],
    [Math.cos(a) * rad, -2, Math.sin(a) * rad],
    [16 + rand() * 20, 13 + rand() * 26, 16 + rand() * 16],
  );
}
for (let [i, x] of [0, 18].entries()) {
  part("机坪" + i, "cyl", "#525e58", [x, 0.016, i * -3], [6, 0.12, 6]);
  part("停机圈" + i, "ring", "#f6dd86", [x, 0.09, i * -3], [4.3, 4.43, 1], "", [
    -Math.PI / 2,
    0,
    0,
  ]);
  part(
    "停机标识" + i,
    "label",
    "#f4e8c3",
    [x, 0.1, i * -3],
    [3.3, 3.3, 1],
    "",
    [-Math.PI / 2, 0, 0],
    { text: "H" },
  );
}
for (let i = 0; i < 112; i++) {
  let a = rand() * 6.28,
    rad = 24 + rand() * 49;
  let x = rad * Math.cos(a),
    z = rad * Math.sin(a);
  let h = 1.6 + rand() * 4;
  part(
    "云杉" + i,
    "pine",
    ["#536e5e", "#607b65", "#486859"][i % 3],
    [x, h * 0.49, z],
    [h * 0.24, h, h * 0.24],
  );
}
for (let i = 0; i < 3; i++) {
  let x = -17 + i * 7;
  part("库房" + i, "box", "#c6bea0", [x, 1.55, -17], [5.6, 3.1, 5]);
  part("屋顶" + i, "box", "#627671", [x, 3.21, -17], [6, 0.27, 5.4]);
  part("机库门" + i, "box", "#677e74", [x, 1.33, -14.44], [3.8, 2.6, 0.12]);
}
part("风向杆", "cyl", "#e7dab9", [9, 2, -9], [0.085, 4, 0.085]);
part(
  "风向袋",
  "cone",
  "#eb9f64",
  [9.72, 3.91, -9],
  [0.31, 1.55, 0.31],
  "",
  [0, 0, -1.63],
);
scene.motion = {
  body: "机体",
  rotor: "主旋翼",
  tail: "尾桨",
  keys: [
    [0, 0, 0.1, 0, 0, 0, 0],
    [2, 0, 0.1, 0, 0, 0, 0],
    [4, 1, 4, 0, -0.12, -0.14, 0],
    [7, 7, 6, -1, -0.24, -0.18, 0.09],
    [9, 12, 5.8, -2, -0.1, -0.35, 0.14],
    [10.8, 16, 4.7, -2, -0.28, -0.6, 0.38],
    [12.1, 19, 0.4, -1, -0.72, -0.88, 0.88],
    [13, 19.6, 0.45, -0.5, -0.52, -1, 0.97],
    [15, 19.6, 0.45, -0.5, -0.52, -1, 0.97],
  ],
  smoke: 9,
  impact: 12.1,
};
require("./enrich_scene.cjs")(scene, part, rod, group, rand);
const { advanceFlight, collisionHeight } = require("./flight-model.js");
let f = {
    x: 0,
    y: collisionHeight(scene.nodes, 0, 0),
    z: 0,
    vy: 0,
    vx: 0,
    vz: 0,
    roll: 0,
    spin: 0,
    yaw: 0,
    tilt: 0,
  },
  commands = [],
  keys = [];
for (let frame = 0; frame <= 600; frame++) {
  let t = frame / 40,
    height =
      t < 1.8 ? 0.08 : t < 5.8 ? Math.min(5.4, (t - 1.8) * 1.8 + 0.08) : 5.4;
  let ctl = {
    c: [
      9.81 + 2.1 * (height - f.y) - 1.9 * f.vy,
      -4.7 * f.roll - 2.5 * f.spin,
      t < 6 ? 0 : -0.32,
    ],
    wind: t > 9 ? 0.8 : 0,
    speed: t < 2.8 ? 0 : 2.05,
    fault: t >= 10.85,
  };
  if (frame % 3 === 0) commands.push({ t, ...ctl });
  let held = commands.at(-1);
  if (
    frame &&
    advanceFlight(f, held, 0.025, t, collisionHeight(scene.nodes, f.x, f.z))
  )
    scene.motion.impact = t;
  keys.push(
    [t, f.x, f.y, f.z, f.tilt, f.yaw, f.roll].map((v) => +v.toFixed(5)),
  );
}
scene.motion.keys = keys;
scene.motion.controls = commands;
scene.motion.smoke = 9.15;
fs.mkdirSync("assets", { recursive: true });
fs.writeFileSync("assets/helicopter-24.scene", JSON.stringify(scene));
fs.writeFileSync(
  "scene-data.js",
  "const DEFAULT_SCENE=" + JSON.stringify(scene) + ";",
);

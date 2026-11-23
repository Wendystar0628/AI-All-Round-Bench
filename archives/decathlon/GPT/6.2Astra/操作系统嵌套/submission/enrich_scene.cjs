// Model-building tools. The renderer consumes the resulting geometry as data.
module.exports = function enrich(scene, part, rod, group, rand) {
  const N = scene.nodes,
    remove = [
      "机舱",
      "驾驶舱",
      "下部整流罩",
      "机号",
      "侧舱门",
      "侧窗",
      "门柱",
      "前窗框",
    ];
  scene.nodes.splice(
    0,
    scene.nodes.length,
    ...N.filter((n) => !remove.some((x) => n.id.startsWith(x))),
  );
  scene.cameras = [
    [4.8, 2.9, 13.7],
    [2.5, 3.2, 12],
    [-7, 6, 15],
  ];
  const frames = [
    [-2.66, 1.59, 0.14, 0.25],
    [-2.18, 1.54, 0.68, 0.66],
    [-1.42, 1.47, 1.01, 0.96],
    [-0.43, 1.45, 1.14, 1.09],
    [0.67, 1.43, 1.12, 1.03],
    [1.54, 1.36, 1.0, 0.86],
    [2.26, 1.23, 0.7, 0.63],
    [2.7, 1.12, 0.32, 0.33],
    [2.78, 1.1, 0.06, 0.14],
  ];
  const coord = (f, a, inflate = 1) => [
    f[0],
    f[1] + Math.sin(a) * f[3] * inflate,
    Math.cos(a) * f[2] * inflate,
  ];
  function mesh(id, c, verts, parent = "机体", more = {}) {
    return part(id, "mesh", c, [0, 0, 0], [1, 1, 1], parent, [0, 0, 0], {
      verts,
      ...more,
    });
  }
  function strip(id, col, fs, a, b, gap = 0, inflate = 1) {
    let out = [];
    for (let i = 0; i < fs.length - 1; i++)
      for (let j = 0; j < 8; j++) {
        let x = coord(fs[i], a + ((b - a) * j) / 8, inflate),
          y = coord(fs[i], a + ((b - a) * (j + 1)) / 8, inflate),
          z = coord(fs[i + 1], a + ((b - a) * j) / 8, inflate),
          w = coord(fs[i + 1], a + ((b - a) * (j + 1)) / 8, inflate);
        out.push(...x, ...y, ...z, ...y, ...w, ...z);
      }
    mesh(id, col, out);
  }
  strip("机舱主壳", "#694488", frames, 0, Math.PI * 2);
  strip("腹部防护涂层", "#f2bd3f", frames, -2.67, -0.46, 0, 1.006);
  for (let side of [1, -1]) {
    const sideAngle = (a) => (side === 1 ? a : Math.PI - a);
    strip(
      "侧部识别带" + side,
      "#f9ca48",
      frames,
      sideAngle(-0.48),
      sideAngle(-0.32),
      0,
      1.018,
    );
    for (let i = 3; i < 8; i++) {
      let a = frames[i],
        b = frames[i + 1],
        int = (t) => a.map((v, k) => v + (b[k] - v) * t);
      strip(
        "舷窗 " + side + "/" + i,
        i < 5 ? "#3b5565" : "#344e5a",
        [int(0.035), int(0.965)],
        sideAngle(i <= 4 ? 0.16 : 0.03),
        sideAngle(i < 5 ? 1.03 : 1.43),
        0,
        1.025,
      );
    }
    // Decals on a tangent plane immediately above the door skin.
    part(
      "机号 24 / " + side,
      "label",
      "#fff0a1",
      [-0.53, 1.53, side * 1.17],
      [1.38, 0.74, 1],
      "机体",
      [0, side < 0 ? Math.PI : 0, 0],
      { text: "24" },
    );
    rod(
      "舱门把手" + side,
      [0.29, 1.5, side * 1.15],
      [0.54, 1.5, side * 1.15],
      0.024,
      "#e6daba",
      "机体",
    );
    part(
      "机尾注册号" + side,
      "label",
      "#fbe99a",
      [-3.07, 1.76, side * 0.5],
      [1.34, 0.22, 1],
      "机体",
      [0, side < 0 ? Math.PI : 0, 0],
      { text: "ST—024" },
    );
    part(
      "引擎进气道" + side,
      "ball",
      "#343d41",
      [-0.6, 2.48, side * 0.56],
      [0.83, 0.37, 0.33],
      "机体",
    );
    part(
      "排气管" + side,
      "cyl",
      "#53565a",
      [-1.64, 2.4, side * 0.51],
      [0.18, 0.68, 0.18],
      "机体",
      [0, 0, Math.PI / 2],
    );
    part(
      "航行灯" + side,
      "ball",
      side > 0 ? "#fb674e" : "#a7d896",
      [-1.43, 1.75, side * 1.04],
      [0.089, 0.06, 0.05],
      "机体",
    );
  }
  rod("机首探管", [2.51, 1.03, 0], [3.16, 0.84, 0], 0.018, "#686865", "机体");
  part("桨毂", "ball", "#53555c", [-0.44, 3.35, 0], [0.39, 0.19, 0.39], "机体");
  for (let i = 0; i < 4; i++) {
    let a = (i * Math.PI) / 2;
    rod(
      "旋翼连杆" + i,
      [-0.44 + 0.13 * Math.cos(a), 2.91, 0.13 * Math.sin(a)],
      [-0.44 + 0.5 * Math.cos(a + 0.4), 3.31, 0.5 * Math.sin(a + 0.4)],
      0.035,
      "#93978d",
      "机体",
    );
  }
  scene.callsign = "FLT—024";
  scene.sky = "#c8deda";
  scene.fog = 112;
  const meadow = N.find((n) => n.id === "草甸");
  meadow.color = "#a7b397";
  meadow.texture = { seed: 24, frequency: 42, strength: 0.2 };
  for (let n of N.filter((n) => n.id.startsWith("山脊"))) {
    n.size[1] *= 0.44;
    n.p[1] -= 1;
  }
  scene.motion.debris = N.filter((n) =>
    [
      "旋翼叶片1",
      "叶尖1",
      "尾鳍",
      "水平安定面",
      "滑橇1",
      "旋翼叶片3",
      "叶尖3",
    ].includes(n.id),
  ).map((n, i) => ({
    id: n.id,
    v: [((i % 3) - 1) * 2.7, 2 + (i % 3), (i % 2 ? 1 : -1) * (1.7 + i * 0.2)],
    spin: [1 + i * 0.3, 2, 0.5],
  }));
  // Distant ranges, snowfields and two-tone alpine woodland.
  for (let i = 0; i < 49; i++) {
    let a = i * 2.4,
      rad = 85 + rand() * 34,
      x = Math.cos(a) * rad,
      z = Math.sin(a) * rad,
      h = 11 + rand() * 23;
    part(
      "峰体" + i,
      "peak",
      "#7f9991",
      [x, h * 0.45 - 1, z],
      [15 + rand() * 13, h, 16 + rand() * 10],
    );
    part(
      "峰顶" + i,
      "peak",
      "#dedbc3",
      [x, h * 0.83 - 1, z],
      [6.4, h * 0.24, 6.6],
    );
  }
  for (let n of N.filter((n) => n.shape === "pine")) {
    let [x, y, z] = n.p,
      [a, h, b] = n.size;
    n.p[1] = h * 0.49;
    n.size[1] = h * 0.78;
    part(
      "梢冠" + n.id,
      "pine",
      "#66816b",
      [x, h * 0.79, z],
      [a * 0.66, h * 0.63, b * 0.66],
    );
    part(
      "树干" + n.id,
      "cyl",
      "#716e56",
      [x, h * 0.13, z],
      [a * 0.2, h * 0.26, a * 0.2],
    );
  }
  let patches = [];
  for (let i = 0; i < 3400; i++) {
    let x = rand() * 104 - 48,
      z = rand() * 98 - 49;
    if (Math.min(Math.hypot(x, z), Math.hypot(x - 18, z + 3)) < 6.6) continue;
    let h = 0.15 + rand() * 0.32,
      a = rand() * 6.28;
    patches.push([x, 0.04, z, h, a]);
  }
  part("草甸植被", "grass", "#7b916d", [0, 0, 0], [1, 1, 1], "", [], {
    instances: patches,
  });
  for (let i = 0; i < 36; i++) {
    let a = rand() * 6.28,
      r = 10 + rand() * 40;
    part(
      "砾石" + i,
      "rock",
      "#a8a792",
      [Math.cos(a) * r, 0.1, Math.sin(a) * r],
      [rand() * 0.9 + 0.2, rand() * 0.42 + 0.1, rand() * 0.7 + 0.2],
    );
  }
  for (let i = 0; i < 2; i++) {
    let x = i * 18,
      z = -i * 3;
    for (let k = 0; k < 36; k++) {
      let a = (k * Math.PI) / 18;
      if (k % 3 !== 0)
        part(
          "坪边标线" + i + "/" + k,
          "box",
          "#e4cf8c",
          [x + 5.66 * Math.cos(a), 0.091, z + 5.66 * Math.sin(a)],
          [0.54, 0.02, 0.12],
          "",
          [0, -a - Math.PI / 2, 0],
        );
    }
    part(
      "坪号" + i,
      "label",
      "#f9dfa1",
      [x, 0.103, z + 3],
      [1.7, 0.77, 1],
      "",
      [-Math.PI / 2, 0, 0],
      { text: "0" + (i + 1) },
    );
  }
  for (let i = 0; i < 3; i++) {
    let x = -17 + i * 7;
    for (let k = 0; k < 8; k++)
      part(
        "卷帘" + i + "/" + k,
        "box",
        "#879387",
        [x, 0.23 + k * 0.32, -14.36],
        [3.72, 0.035, 0.035],
      );
    for (let k = 0; k < 3; k++)
      part(
        "厂房侧窗" + i + "/" + k,
        "box",
        "#42585b",
        [x - 1.7 + k * 1.65, 2.5, -14.37],
        [1.23, 0.44, 0.06],
      );
    part(
      "库号" + i,
      "label",
      "#f6edc9",
      [x + 2.27, 1.8, -14.39],
      [0.74, 0.46, 1],
      "",
      [0, 0, 0],
      { text: "0" + (i + 1) },
    );
  }
  for (let [x, z] of [
    [-8, -7],
    [-6, -7],
    [8, -12],
    [9, -12],
    [10, -12],
  ]) {
    part("路锥" + x, "cone", "#d9874f", [x, 0.38, z], [0.22, 0.73, 0.22]);
    part("反光条" + x, "cone", "#fcdfb8", [x, 0.49, z], [0.11, 0.32, 0.11]);
    part("锥底" + x, "box", "#5a6155", [x, 0.045, z], [0.55, 0.09, 0.55]);
  }
  let tower = group("观测塔", [15, 0, -23]);
  for (let x of [-1.5, 1.5])
    for (let z of [-1.5, 1.5])
      rod("塔柱" + x + z, [x, 0, z], [x, 6.5, z], 0.13, "#7a806d", tower);
  part("塔台", "box", "#c4c7b1", [0, 7, 0], [4.4, 1.5, 4.4], tower);
  part("塔台窗", "box", "#425d62", [0, 7.7, 0], [4.3, 0.8, 4.3], tower);
  part("塔台檐", "box", "#637668", [0, 8.18, 0], [4.9, 0.18, 4.9], tower);
  rod("天线", [0.9, 8.2, 0], [0.9, 10.6, 0], 0.055, "#9c9f8e", tower);
  const ground=N.find(n=>n.id==="草甸");ground.shape="terrain";
  ground.hills=[[-23,13,17,17,3.8],[32,23,23,17,5.5],[25,-42,34,26,5.7],[-44,-21,24,26,6.8],[6,41,30,20,5.2],[52,-9,20,24,4.6]];
  const {terrainRelief}=require("./flight-model.js");
  for(let n of N){if(n.shape==="grass"){for(let blade of n.instances)blade[1]+=terrainRelief(ground,blade[0],blade[2])}
    else if(!n.parent&&n!==ground)n.p[1]+=terrainRelief(ground,n.p[0],n.p[2]);
    if(n.id.startsWith("舷窗")){n.roughness=.19;n.metalness=.35}
  }
};

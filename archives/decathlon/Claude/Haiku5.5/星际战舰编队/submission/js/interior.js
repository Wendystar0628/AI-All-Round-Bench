// 舰内空间：小艇机库、能量装填与导能长廊、指挥舰桥、动力核心中庭。
// 每个空间使用自己的局部坐标（与舰外无关），镜头以剪接方式切入，运动方向与舰外承接。

var INTERIOR = (function () {
  var PAL = {
    wall: '#8593A3', wall2: '#6B7A8B', deck: '#4A5563', rec: '#1F2A38',
    gold: '#D8B370', amber: '#FFB55C', cyan: '#63EAFF', white: '#E8FBFF', screen: '#7FE8FF'
  };
  function H(c) { return packVal(MAT.HULL, c); }
  function R() { return packVal(MAT.RECESS, PAL.rec); }
  function G() { return packVal(MAT.TRIM, PAL.gold); }
  function E(c) { return packVal(MAT.EMIT, c); }
  function GL() { return packVal(MAT.GLASS, '#8CCBF2'); }
  function SC() { return packVal(MAT.SCREEN, PAL.screen); }
  function FL() { return packVal(MAT.FLOW, '#2A6C78'); }

  var MESH = {};
  var core = null;

  // ---------- 机库 ----------
  // 局部：x -70..70，y 0..90，z 0..400（入口在 z=400，深处在 z=0）
  function buildHangar() {
    var v = new VOX.Vox();
    v.fill(-70, 0, 0, 70, 4, 400, H(PAL.deck));
    v.fill(-70, 0, 0, -64, 90, 400, H(PAL.wall));
    v.fill(64, 0, 0, 70, 90, 400, H(PAL.wall));
    v.fill(-70, 84, 0, 70, 90, 400, H(PAL.wall2));
    v.fill(-70, 0, 0, 70, 90, 6, H(PAL.wall2));
    // 深处的光窗（远端）
    v.fill(-34, 26, 0, 34, 66, 6, E('#CFEFFF'));
    v.fill(-40, 20, 0, -34, 72, 6, G());
    v.fill(34, 20, 0, 40, 72, 6, G());
    // 天花梁架
    for (var z = 40; z < 400; z += 50) v.fill(-64, 78, z, 64, 84, z + 4, H(PAL.wall2));
    // 停泊凹位：两侧墙面的暗色凹腔与金边
    for (var k = 0; k < 6; k++) {
      var z0 = 40 + k * 56;
      v.fill(-64, 8, z0, -52, 36, z0 + 30, R());
      v.fill(52, 8, z0, 64, 36, z0 + 30, R());
      v.fill(-64, 36, z0 - 1, -52, 38, z0 + 31, G());
      v.fill(52, 36, z0 - 1, 64, 38, z0 + 31, G());
      // 凹位内的发光导引
      v.fill(-52, 8, z0 + 14, -51, 10, z0 + 16, E(PAL.amber));
      v.fill(51, 8, z0 + 14, 52, 10, z0 + 16, E(PAL.amber));
      // 维修构架（竖向）
      v.fill(-60, 36, z0 + 4, -58, 78, z0 + 6, H(PAL.wall2));
      v.fill(58, 36, z0 + 4, 60, 78, z0 + 6, H(PAL.wall2));
    }
    // 两侧墙面的竖向肋条（体现尺度与板块）
    for (z = 20; z < 400; z += 40) {
      v.fill(-64, 6, z, -62, 84, z + 3, H(PAL.wall2));
      v.fill(62, 6, z, 64, 84, z + 3, H(PAL.wall2));
    }
    // 深处的第二重舱壁与舱口（透出远端的光）
    v.fill(-70, 0, 198, 70, 90, 202, H(PAL.wall2));
    v.fill(-26, 8, 198, 26, 64, 202, 0);
    v.fill(-28, 6, 198, -26, 66, 202, G());
    v.fill(26, 6, 198, 28, 66, 202, G());
    v.fill(-28, 64, 198, 28, 66, 202, G());
    v.fill(-26, 6, 198, 26, 8, 202, E(PAL.amber));
    // 两侧高架通道与栏杆，悬挂的线缆束
    for (var side = -1; side <= 1; side += 2) {
      var cx0 = side < 0 ? -62 : 52, cx1 = side < 0 ? -52 : 62;
      v.fill(cx0, 46, 0, cx1, 50, 400, H(PAL.wall2));
      v.fill(cx0, 50, 0, cx1, 53, 400, G());
      v.fill(side < 0 ? -52 : 52, 50, 0, side < 0 ? -51 : 53, 56, 400, G());
    }
    for (z = 12; z < 400; z += 36) {
      v.cylinder(1, -22, 60, z, 24, 1.1, H(PAL.wall2));
      v.cylinder(1, 22, 60, z + 18, 24, 1.1, H(PAL.wall2));
    }
    // 地面中线与导引光
    v.fill(-2, 4, 0, 2, 5, 400, R());
    for (z = 0; z < 400; z += 20) {
      // 导引光向远端收拢：近处宽、远处窄
      var gx = Math.round(40 + 18 * z / 400);
      v.fill(-gx - 2, 4, z, -gx, 5, z + 2, E(PAL.amber));
      v.fill(gx, 4, z, gx + 2, 5, z + 2, E(PAL.amber));
    }
    // 入口门框（z=400 端）
    v.fill(-70, 0, 396, -64, 90, 400, G());
    v.fill(64, 0, 396, 70, 90, 400, G());
    v.fill(-70, 84, 396, 70, 90, 400, G());
    return v;
  }

  // ---------- 能量长廊 ----------
  // 局部：x -50..50，y 0..70，z 0..360
  function buildCorridor() {
    var v = new VOX.Vox();
    v.fill(-50, 0, 0, 50, 4, 360, H(PAL.deck));
    v.fill(-50, 0, 0, -44, 70, 360, H(PAL.wall));
    v.fill(44, 0, 0, 50, 70, 360, H(PAL.wall));
    v.fill(-50, 66, 0, 50, 70, 360, H(PAL.wall2));
    // 槽列（墙面凹槽）
    for (var y = 10; y < 60; y += 12) {
      v.fill(-45, y, 0, -43, y + 3, 360, R());
      v.fill(43, y, 0, 45, y + 3, 360, R());
    }
    // 装填装置：厚重外构架与发光内核
    for (var z = 30; z < 360; z += 62) {
      v.fill(-40, 4, z, -30, 66, z + 14, H(PAL.wall2));
      v.fill(30, 4, z, 40, 66, z + 14, H(PAL.wall2));
      v.fill(-30, 52, z, 30, 66, z + 14, H(PAL.wall2));
      v.fill(-30, 4, z + 6, -28, 46, z + 8, E(PAL.cyan));
      v.fill(28, 4, z + 6, 30, 46, z + 8, E(PAL.cyan));
      v.fill(-38, 20, z - 2, -30, 34, z, G());
      v.fill(30, 20, z - 2, 38, 34, z, G());
    }
    // 导能构件：中央悬置的管束
    v.cylinder(2, 0, 58, 0, 360, 3, FL());
    v.cylinder(2, -22, 40, 0, 360, 2.5, FL());
    v.cylinder(2, 22, 40, 0, 360, 2.5, FL());
    v.cylinder(2, -22, 22, 0, 360, 2, R());
    v.cylinder(2, 22, 22, 0, 360, 2, R());
    // 远端发亮的腔口
    v.ellipsoid(0, 36, 364, 30, 30, 8, E('#9FF6FF'), 0);
    v.fill(-50, 0, 356, -44, 70, 360, G());
    v.fill(44, 0, 356, 50, 70, 360, G());
    return v;
  }

  // ---------- 指挥舰桥 ----------
  // 局部：x,z -65..65，y 0..70
  function buildBridge() {
    var v = new VOX.Vox();
    v.fill(-65, 0, -65, 65, 4, 65, H(PAL.deck));
    // 地面同心环纹
    for (var r = 30; r < 60; r += 10) v.ellipsoid(0, 3, 0, r, 1, r, R(), 1);
    // 四周墙体：前方（+z）为观景开口
    v.fill(-65, 0, -65, -59, 70, 65, H(PAL.wall));
    v.fill(59, 0, -65, 65, 70, 65, H(PAL.wall));
    v.fill(-65, 0, -65, 65, 70, -59, H(PAL.wall));
    v.fill(-65, 66, -65, 65, 70, 65, H(PAL.wall2));
    v.fill(-65, 0, 59, 65, 70, 65, H(PAL.wall));
    v.fill(-40, 14, 59, 40, 56, 65, 0);                         // 观景开口
    v.fill(-40, 12, 60, 40, 14, 65, G());
    v.fill(-40, 56, 60, 40, 58, 65, G());
    v.fill(-42, 12, 60, -40, 58, 65, G());
    v.fill(40, 12, 60, 42, 58, 65, G());
    v.fill(-40, 14, 62, 40, 56, 63, GL());                      // 玻璃
    // 控制台阶梯（沿三面墙）
    for (var t = 0; t < 3; t++) {
      var y0 = 4 + t * 6;
      v.fill(-58 + t * 5, y0, -58, -54 + t * 5, y0 + 6, 58, H(PAL.wall2));
      v.fill(54 - t * 5, y0, -58, 58 - t * 5, y0 + 6, 58, H(PAL.wall2));
      v.fill(-58, y0, -58 + t * 5, 58, y0 + 6, -54 + t * 5, H(PAL.wall2));
    }
    for (var x = -48; x <= 48; x += 12) {
      v.fill(x, 22, -58, x + 8, 24, -50, SC());
      v.fill(x, 22, 54, x + 8, 24, 56, SC());
    }
    // 中央指挥基座（阶梯圆柱）
    v.cylinder(1, 0, 4, 0, 6, 26, H(PAL.wall2));
    v.cylinder(1, 0, 10, 0, 6, 20, H(PAL.wall));
    v.cylinder(1, 0, 16, 0, 6, 14, H(PAL.wall2));
    v.cylinder(1, 0, 22, 0, 2, 26, G());
    v.cylinder(1, 0, 24, 0, 1, 12, SC());
    // 悬置显示层：全息圆盘与环
    v.cylinder(1, 0, 42, 0, 1, 12, SC());
    v.cylinder(1, 0, 46, 0, 1, 16, packVal(MAT.SCREEN, '#4BD6FF'));
    v.cylinder(1, 0, 36, 0, 3, 3, G());
    // 顶部跨空梁架
    for (var z = -40; z <= 40; z += 40) v.fill(-60, 60, z, 60, 66, z + 4, H(PAL.wall2));
    v.fill(-4, 60, -60, 4, 66, 60, H(PAL.wall2));
    // 悬挂的显示板（大小不一，自顶部梁架下垂）
    var pw = [10, 14, 8, 16, 12];
    for (var pk = 0; pk < 5; pk++) {
      var px = -44 + pk * 22, pl = pw[pk];
      v.fill(px, 52, -pl / 2 - 6, px + 4, 54, pl / 2 - 6, SC());
      v.fill(px, 48, -pl / 2 - 6, px + 4, 49, pl / 2 - 6, G());
    }
    // 远端的光带
    v.fill(-60, 66, -60, 60, 67, -58, E(PAL.cyan));
    return v;
  }
  // 长廊中缓慢合拢分开的机构（颚板）
  function buildJaw() {
    var v = new VOX.Vox();
    v.fill(-3, -6, -7, 3, 6, 7, H(PAL.wall2));
    v.fill(-3, 4, -7, 3, 6, 7, E(PAL.amber));
    return v;
  }
  // 舰队投影的光点（小方块）
  function buildIcon() {
    var v = new VOX.Vox();
    v.fill(-2, 0, -1, 2, 1, 1, E('#B8FBFF'));
    v.fill(-1, 1, -1, 1, 2, 1, E('#7EEBFF'));
    return v;
  }

  // ---------- 动力核心中庭 ----------
  // 局部：x,z -125..125，y 0..250；核心位于 (0,120,0)
  var CORE_Y = 120;
  function buildAtrium() {
    var v = new VOX.Vox();
    v.fill(-125, 0, -125, 125, 6, 125, H(PAL.deck));
    v.fill(-125, 6, -125, 125, 8, 125, G());
    // 外墙与顶环
    v.shell(-125, 0, -125, 125, 250, 125, 6, H(PAL.wall));
    v.fill(-125, 244, -125, 125, 250, 125, H(PAL.wall2));
    v.cylinder(1, 0, 244, 0, 6, 40, packVal(MAT.RECESS, '#0C1420'));
    // 墙面的竖向肋（贴墙布置，不占据中庭内侧的视线）
    for (var k = 0; k < 16; k++) {
      var a = k * Math.PI / 8;
      var cx = Math.round(Math.cos(a) * 121), cz = Math.round(Math.sin(a) * 121);
      v.fill(cx - 2, 8, cz - 2, cx + 2, 244, cz + 2, H(PAL.wall2));
      v.fill(cx - 1, 10, cz - 3, cx + 1, 240, cz + 3, E(PAL.amber));
    }
    // 五层环形平台（外环）
    var tiers = [36, 88, 140, 192, 232];
    // 分叉平台：每层为三条弧形臂，臂间留出缺口，使视线能穿过各层向上延伸
    var ARM = 2 * Math.PI / 3;
    var inArm = function (x, z) {
      var a = Math.atan2(z + 0.5, x + 0.5);
      if (a < 0) a += 2 * Math.PI;
      return (a % ARM) / ARM < 0.74;
    };
    tiers.forEach(function (y, i) {
      var pm = H(i % 2 ? PAL.wall : PAL.wall2);
      v.paint(-125, y - 2, -125, 125, y + 2, 125, function (x, yy, z) {
        var d2 = (x + 0.5) * (x + 0.5) + (z + 0.5) * (z + 0.5);
        if (d2 > 124 * 124 || d2 < 60 * 60 || !inArm(x, z)) return 0;
        return d2 > 118 * 118 ? E(PAL.amber) : pm;
      });
      v.paint(-125, y + 2, -125, 125, y + 4, 125, function (x, yy, z) {
        var d2 = (x + 0.5) * (x + 0.5) + (z + 0.5) * (z + 0.5);
        if (d2 > 60 * 60 || d2 < 56 * 56 || !inArm(x, z)) return 0;
        return G();
      });
    });
    // 平台之间的斜撑（从墙到核心方向）
    for (k = 0; k < 6; k++) {
      var aa = k * Math.PI / 3 + 0.3;
      for (var s = 0; s < 120; s++) {
        var rr = 124 - s;
        var px = Math.round(Math.cos(aa) * rr), pz = Math.round(Math.sin(aa) * rr);
        v.fill(px - 1, 10, pz - 1, px + 2, 232, pz + 2, H(PAL.wall2));
      }
    }
    return v;
  }
  // 核心的构件：外壳、内核与旋转环
  function buildCoreShell() {
    var v = new VOX.Vox();
    v.ellipsoid(0, 0, 0, 28, 28, 28, packVal(MAT.FLOW, '#63EAFF'), 4);
    return v;
  }
  function buildCoreInner() {
    var v = new VOX.Vox();
    v.ellipsoid(0, 0, 0, 16, 16, 16, E('#E6FFFF'), 0);
    return v;
  }
  // 环：位于 XZ 平面（绕 Y 轴），半径 R，厚度 t
  function buildRing(R, t, hh, val) {
    var v = new VOX.Vox();
    v.paint(-R - 2, -hh - 2, -R - 2, R + 2, hh + 2, R + 2, function (x, y, z) {
      var px = x + 0.5, py = y + 0.5, pz = z + 0.5;
      var rr = Math.sqrt(px * px + pz * pz);
      if (Math.abs(py) > hh) return 0;
      if (rr > R || rr < R - t) return 0;
      return typeof val === 'function' ? val(x, y, z) : val;
    });
    return v;
  }
  // 能量块（长廊中的流光）：6×6×6 立方
  function buildBlock() {
    var v = new VOX.Vox();
    v.fill(-3, -3, -3, 3, 3, 3, E('#8FEFFF'));
    return v;
  }

  // 舰内网格按需构建：首次绘制舱内画面时完成，避免拖慢开场
  var inited = false;
  function ensure() {
    if (inited) return;
    inited = true;
    initMeshes();
  }
  function initMeshes() {
    var h = buildHangar();
    MESH.hangar = GLR.uploadMesh(MESHER.buildMesh(h, { ox: 0, oy: 0, oz: 0 }));
    var co = buildCorridor();
    MESH.corridor = GLR.uploadMesh(MESHER.buildMesh(co, { ox: 0, oy: 0, oz: 0 }));
    var br = buildBridge();
    MESH.bridge = GLR.uploadMesh(MESHER.buildMesh(br, { ox: 0, oy: 0, oz: 0 }));
    var at = buildAtrium();
    MESH.atrium = GLR.uploadMesh(MESHER.buildMesh(at, { ox: 0, oy: 0, oz: 0 }));
    MESH.block = GLR.uploadMesh(MESHER.buildMesh(buildBlock(), {}));
    MESH.icon = GLR.uploadMesh(MESHER.buildMesh(buildIcon(), {}));
    MESH.jaw = GLR.uploadMesh(MESHER.buildMesh(buildJaw(), {}));
    MESH.cage = GLR.uploadMesh(MESHER.buildMesh(buildRing(32, 2, 2, packVal(MAT.RECESS, '#2A3848')), {}));
    MESH.holo = GLR.uploadMesh(MESHER.buildMesh(buildRing(18, 1, 1, packVal(MAT.SCREEN, '#7FE8FF')), {}));
    MESH.coreShell = GLR.uploadMesh(MESHER.buildMesh(buildCoreShell(), {}));
    MESH.coreInner = GLR.uploadMesh(MESHER.buildMesh(buildCoreInner(), {}));
    // 旋转环（中心在核心，绕不同轴旋转）
    var rings = [[46, 3, 3, PAL.gold], [62, 3, 2, PAL.cyan], [78, 3, 2, PAL.amber]];
    core = rings.map(function (r) {
      return { mesh: GLR.uploadMesh(MESHER.buildMesh(buildRing(r[0], r[1], r[2], packVal(MAT.TRIM, r[3])), {})),
        R: r[0] };
    });
  }

  // ---------- 小艇停泊位（机库） ----------
  var PARK = [
    { p: [-58, 16, 55], dir: [0, 0, -1] }, { p: [58, 16, 55], dir: [0, 0, -1] },
    { p: [-58, 16, 167], dir: [0, 0, -1] }, { p: [58, 16, 167], dir: [0, 0, -1] }
  ];

  // 绘制与灯光设定（每个空间）
  function sceneFor(name, tau, base) {
    var s = {};
    for (var k in base) s[k] = base[k];
    s.skyCol = [0.06, 0.08, 0.12];
    s.gndCol = [0.03, 0.03, 0.04];
    s.fogDen = 0.0;
    s.fogCol = [0.0, 0.0, 0.0];
    s.sunCol = [0.25, 0.25, 0.28];
    s.plights = [];
    if (name === 'hangar') {
      s.plights = [
        { p: [0, 60, 360], c: [0.85, 0.95, 1.0], r: 180 },
        { p: [0, 40, 40], c: [1.0, 0.75, 0.4], r: 150 }
      ];
    } else if (name === 'corridor') {
      s.plights = [{ p: [0, 36, 180], c: [0.45, 0.95, 1.0], r: 160 }, { p: [0, 36, 330], c: [0.6, 0.9, 1.0], r: 120 }];
    } else if (name === 'bridge') {
      s.plights = [{ p: [0, 40, 0], c: [0.16, 0.34, 0.4], r: 90 }, { p: [0, 58, 40], c: [0.2, 0.22, 0.25], r: 70 }];
      s.sunCol = [0.4, 0.45, 0.5];
    } else if (name === 'atrium') {
      s.plights = [{ p: [0, CORE_Y, 0], c: [0.22, 0.4, 0.45], r: 170 }, { p: [0, 36, 0], c: [0.5, 0.35, 0.2], r: 150 }];
      s.sunCol = [0.5, 0.5, 0.55];
    }
    s.time = tau;
    return s;
  }

  // 绘制一个空间（camera 已由调用方设置）；t 为本空间内的时间（秒）
  function draw(name, tau, camPos) {
    ensure();
    var mm = function (p, bx, by, bz, cp) { return SCENE.xform(p, bx, by, bz, camPos); };
    var I = [0, 0, 0];
    if (name === 'hangar') {
      GLR.drawMesh(MESH.hangar, mm(I, [1, 0, 0], [0, 1, 0], [0, 0, 1], camPos), { emit: 1.0 });
      PARK.forEach(function (pk, i) {
        var bp = pk.p;
        var b = MATH.basis([0, 0, -1], [0, 1, 0]);
        GLR.drawMesh(SCENE.M.boat, mm(bp, b.x, b.y, b.z, camPos), {});
      });
      // 进港的小艇（沿 z 方向飞入）
      var dz = SPL.eval([[0, 0, 22, 120], [2, 0, 30, 170], [4, 0, 40, 200]], tau);
      GLR.drawMesh(SCENE.M.boat, mm([dz[0], dz[1], dz[2]], MATH.basis([0, 0, 1], [0, 1, 0]).x, [0, 1, 0], [0, 0, 1], camPos), { thrust: 0.2 });
      var bz = SPL.eval([[0, -18, 44, 262], [4.5, -18, 36, 175]], tau);
      var bb = MATH.basis([0, 0, -1], [0, 1, 0]);
      GLR.drawMesh(SCENE.M.boat, mm([bz[0], bz[1], bz[2]], bb.x, bb.y, bb.z, camPos), { thrust: 0.2 });
    } else if (name === 'corridor') {
      GLR.drawMesh(MESH.corridor, mm(I, [1, 0, 0], [0, 1, 0], [0, 0, 1], camPos), { emit: 1.0 });
      // 装填装置之间的颚板缓慢合拢、分开
      for (var jk = 0; jk < 5; jk++) {
        var jz = 30 + jk * 62 + 7;
        var js = 0.5 + 0.5 * Math.sin(tau * 0.7 + jk * 0.9);
        var jx = 22 - 12 * js;
        GLR.drawMesh(MESH.jaw, mm([-jx, 12, jz], [1, 0, 0], [0, 1, 0], [0, 0, 1], camPos), { emit: 1.1 });
        GLR.drawMesh(MESH.jaw, mm([jx, 12, jz], [1, 0, 0], [0, 1, 0], [0, 0, 1], camPos), { emit: 1.1 });
      }
      // 能量块沿槽列流动（朝远端）
      var lanes = [[-38, 14], [-38, 38], [38, 14], [38, 38], [0, 60], [-22, 22], [22, 22]];
      for (var i = 0; i < lanes.length; i++) {
        for (var j = 0; j < 3; j++) {
          var z = ((tau * 60 + j * 120 + i * 37) % 360 + 360) % 360;
          GLR.drawMesh(MESH.block, mm([lanes[i][0], lanes[i][1], z], [1, 0, 0], [0, 1, 0], [0, 0, 1], camPos), { emit: 0.9 });
        }
      }
    } else if (name === 'bridge') {
      GLR.drawMesh(MESH.bridge, mm(I, [1, 0, 0], [0, 1, 0], [0, 0, 1], camPos), { emit: 1.0 });
      // 舰队投影：绕中枢的光点
      for (var q = 0; q < 14; q++) {
        var th = q / 14 * Math.PI * 2 + tau * (0.12 + 0.02 * (q % 3));
        var rad = 12 + 6 * (q % 4);
        var pp = [Math.cos(th) * rad, 52 + 2 * Math.sin(th * 2 + q), Math.sin(th) * rad];
        GLR.drawMesh(MESH.icon, mm(pp, [1, 0, 0], [0, 1, 0], [0, 0, 1], camPos), { emit: 1.4 });
      }
    } else if (name === 'atrium') {
      GLR.drawMesh(MESH.atrium, mm(I, [1, 0, 0], [0, 1, 0], [0, 0, 1], camPos), { emit: 1.0 });
      var C0 = [0, CORE_Y, 0];
      var breath = 1 + 0.35 * Math.sin(tau * 1.3);
      GLR.drawMesh(MESH.coreShell, mm(C0, [1, 0, 0], [0, 1, 0], [0, 0, 1], camPos), { emit: 0.45 });
      GLR.drawMesh(MESH.coreInner, mm(C0, [1, 0, 0], [0, 1, 0], [0, 0, 1], camPos), { emit: 0.7 * breath });
      // 核心的外构架：三道相互垂直的暗色骨环，缓慢转动
      var cageAx = [[1, 0, 0], [0, 0, 1], [0.7, 0.7, 0]];
      for (var ci = 0; ci < 3; ci++) {
        var cM = MATH.rotAxis(MATH.V.norm(cageAx[ci]), tau * 0.15 * (ci + 1));
        var cc2 = SCENE.cols(cM);
        GLR.drawMesh(MESH.cage, mm(C0, cc2[0], cc2[1], cc2[2], camPos), { emit: 1.0 });
      }
      var axes = [[0.2, 1, 0.1], [1, 0.3, 0.2], [0.4, 0.2, 1]];
      var spd = [0.45, -0.3, 0.2];
      core.forEach(function (rg, i) {
        var M3 = MATH.rotAxis(MATH.V.norm(axes[i]), spd[i] * tau + i);
        var cc = SCENE.cols(M3);
        GLR.drawMesh(rg.mesh, mm(C0, cc[0], cc[1], cc[2], camPos), { emit: 1.0 });
      });
    }
    if (name === 'bridge') {
      // 观景窗外的悬浮轨道环，与光点的航迹线带
      var hr = M3spin(tau * 0.25);
      GLR.drawMesh(MESH.holo, mm([0, 44, 0], hr.x, hr.y, hr.z, camPos), { emit: 0.6 });
      for (var tq = 0; tq < 14; tq++) {
        for (var tt = 1; tt <= 2; tt++) {
          var th2 = tq / 14 * Math.PI * 2 + tau * (0.12 + 0.02 * (tq % 3)) - tt * 0.18;
          var rad2 = 12 + 6 * (tq % 4);
          GLR.drawMesh(MESH.icon, mm([Math.cos(th2) * rad2, 52 + 2 * Math.sin(th2 * 2 + tq), Math.sin(th2) * rad2], [1, 0, 0], [0, 1, 0], [0, 0, 1], camPos), { emit: 0.5 / tt });
        }
      }
    }
    if (name === 'atrium') {
      // 能量沿六道支撑向核心汇聚（由外向内逐渐变亮）
      for (var sk = 0; sk < 6; sk++) {
        var sa = sk * Math.PI / 3 + 0.3;
        for (var sh = 0; sh < 3; sh++) {
          var sp = ((tau * 0.12 + sk * 0.17 + sh * 0.33) % 1 + 1) % 1;
          var rr = 92 - 62 * sp;
          var yy = 60 + sh * 60;
          GLR.drawMesh(MESH.block, mm([Math.cos(sa) * rr, yy, Math.sin(sa) * rr], [1, 0, 0], [0, 1, 0], [0, 0, 1], camPos), { emit: 0.6 + 1.0 * sp });
        }
      }
    }
    GLR.endVoxelBatch();
  }
  function M3spin(a) {
    var R = MATH.rotAxis([0.2, 1, 0.05], a);
    var c = SCENE.cols(R);
    return { x: c[0], y: c[1], z: c[2] };
  }

  return { ensure: ensure, sceneFor: sceneFor, draw: draw, PARK: PARK, CORE_Y: CORE_Y };
})();

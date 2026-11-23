// 舰船体素模型：旗舰、近卫舰、前卫舰、小艇、导弹、炮塔与炮座。
// 统一母题：阶梯层片壳体 + 深色凹槽 + 金色点缀 + 青色发光。舰首为 +X，舷侧为 ±Z。

var SHIPS = (function () {
  var PAL = {
    h1: '#B9C5D1', h2: '#9DAEBF', h3: '#CCD5DE',   // 三级舰体浅灰蓝
    rec: '#27364A',                                // 深色凹槽
    gold: '#D8B370',                               // 金色点缀
    cyan: '#63EAFF', amber: '#FFB55C', white: '#E8FBFF',
    glass: '#7CC4F0'
  };
  function H(c) { return packVal(MAT.HULL, c); }
  function R() { return packVal(MAT.RECESS, PAL.rec); }
  function G() { return packVal(MAT.TRIM, PAL.gold); }
  function E(c) { return packVal(MAT.EMIT, c || PAL.cyan); }
  function GL() { return packVal(MAT.GLASS, PAL.glass); }
  function NZ() { return packVal(MAT.NOZZLE, PAL.white); }

  // 体素网格 -> 网格数据（可选偏移使锚点位于原点）
  function bake(vox, ox, oy, oz) {
    return MESHER.buildMesh(vox, { ox: ox || 0, oy: oy || 0, oz: oz || 0 });
  }

  // ---------- 旗舰 ----------
  // 本地坐标：x 0..1100 （尾到首），y 0..340，z -260..260；输出时平移到中心 (550,170,0)
  var FLAG_ANCHOR = [550, 170, 0];
  function buildFlagship() {
    var v = new VOX.Vox();
    var h1 = H(PAL.h1), h2 = H(PAL.h2), h3 = H(PAL.h3);
    // 尾部逐层退让的推进段
    v.shell(0, 60, -100, 36, 200, 100, 4, h2);
    v.shell(36, 36, -124, 100, 224, 124, 5, h1);
    v.shell(60, 40, -118, 200, 220, 118, 4, h2);
    // 九个主喷口：环口 / 暗膛 / 发光核
    var nys = [92, 130, 168], nzs = [-50, 0, 50];
    for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) {
      var yy = nys[i], zz = nzs[j];
      v.cylinder(0, 0, yy, zz, 4, 19, G());
      v.cylinder(0, 0, yy, zz, 18, 14, R());
      v.cylinder(0, 0, yy, zz, 4, 9, NZ());
    }
    // 中段脊背与腹部：大面积阶梯装甲
    v.shell(60, 60, -105, 640, 200, 105, 4, h1);
    v.shell(300, 40, -118, 600, 220, 118, 4, h2);
    v.shell(120, 28, -90, 560, 60, 90, 4, h2);
    v.shell(160, 200, -60, 540, 216, 60, 4, h3);
    // 腹部肋架
    for (var x = 150; x < 560; x += 56) {
      v.fill(x, 26, -92, x + 8, 60, -86, h2);
      v.fill(x, 26, 86, x + 8, 60, 92, h2);
    }
    // 上层阶梯甲板
    v.shell(280, 216, -88, 820, 236, 88, 4, h1);
    v.shell(340, 236, -66, 760, 256, 66, 4, h2);
    v.fill(420, 256, -42, 680, 270, 42, h3);
    // 甲板凹缝与中脊槽
    v.fill(300, 236, -1, 800, 238, 2, R());
    for (x = 380; x <= 720; x += 110) v.fill(x, 216, -88, x + 3, 236, -84, R());
    for (x = 380; x <= 720; x += 110) v.fill(x, 216, 84, x + 3, 236, 88, R());
    // 舰桥塔楼
    v.shell(800, 236, -60, 920, 300, 60, 4, h1);
    v.fill(830, 300, -40, 900, 322, 40, h2);
    v.fill(919, 252, -46, 921, 268, 46, GL());           // 指挥舱观景窗
    v.fill(921, 262, -50, 923, 266, 50, E(PAL.cyan));    // 窗边光带
    v.ellipsoid(872, 300, 0, 46, 22, 58, h3, 4);
    v.cylinder(1, 860, 322, 0, 40, 2, G());
    v.fill(848, 360 - 20, -20, 872, 362 - 20, 20, G());
    // 外伸侧部（两侧）
    for (var s = -1; s <= 1; s += 2) {
      var zc = function (a, b) { return s > 0 ? [a, b] : [-b, -a]; };
      var z1 = zc(102, 190), z2 = zc(150, 230), z3 = zc(212, 246), z4 = zc(96, 150);
      v.shell(300, 96, z1[0], 820, 132, z1[1], 4, h1);
      v.shell(360, 116, z2[0], 760, 140, z2[1], 4, h2);
      v.fill(420, 126, z3[0], 700, 146, z3[1], h3);
      v.shell(380, 60, z4[0], 760, 96, z4[1], 4, h2);
      // 侧部凹槽与金边
      v.fill(330, 132, z1[0] + 4, 800, 133, z1[0] + 6, G());
      v.fill(330, 96, z1[1] - 3, 800, 97, z1[1] - 1, R());
      // 侧面光窗
      for (x = 340; x < 800; x += 26) v.fill(x, 112, z1[1] - 1, x + 8, 115, z1[1], E(PAL.amber));
      // 机库开口：贯穿舷壁挖空，外缘镶金边
      // 开口向外延伸穿过上方的翼板，小艇可由侧面直接入库
      var oz0 = s > 0 ? 88 : -192, oz1 = s > 0 ? 192 : -88;
      v.fill(520, 70, oz0, 840, 130, oz1, 0);
      var lz0 = s > 0 ? 118 : -124, lz1 = s > 0 ? 124 : -118;
      v.fill(518, 128, lz0, 842, 132, lz1, G());
      v.fill(518, 66, lz0, 842, 70, lz1, G());
      v.fill(518, 70, lz0, 522, 128, lz1, G());
      v.fill(836, 70, lz0, 842, 128, lz1, G());
      // 机库内部梁架与底板
      v.fill(524, 62, -92, 836, 70, 92, h2);
      for (x = 560; x < 840; x += 70) v.fill(x, 70, -96, x + 6, 196, 96, h2);
      v.fill(524, 186, -96, 836, 196, 96, h2);
      v.fill(524, 116, s > 0 ? 84 : -88, 836, 118, s > 0 ? 86 : -86, E(PAL.amber));
    }
    // 前部分叉舰首与中央主炮基座
    v.shell(600, 80, -70, 980, 170, 70, 4, h1);
    // 分叉刃翼：自舰首两侧逐级向外张开、向前收窄，每级留出阶面与金边
    for (s = -1; s <= 1; s += 2) {
      for (var fxo = 930; fxo < 1100; fxo += 8) {
        var kf = (fxo - 930) / 170;
        var zc = s * (58 + 46 * kf), hwz = 16 - 7 * kf, hyz = 58 - 30 * kf;
        var mat3 = kf < 0.5 ? h2 : h3;
        v.fill(fxo, 120 - hyz, zc - hwz, fxo + 8, 120 + hyz, zc + hwz, mat3);
        v.fill(fxo, 120 + hyz - 2, zc - hwz, fxo + 8, 120 + hyz, zc + hwz, G());
        v.fill(fxo, 120 - hyz, zc - hwz + 1, fxo + 8, 120 - hyz + 1, zc + hwz - 1, R());
      }
    }
    v.fill(930, 60, -38, 1000, 80, 38, R());
    v.fill(860, 90, -50, 940, 150, 50, h1);
    v.fill(880, 76, -62, 930, 164, 62, h2);
    v.fill(860, 90, -52, 940, 92, 52, G());
    v.fill(860, 148, -52, 940, 150, 52, G());
    // 光束主炮：宽基、炮身环节与发亮的口部
    v.cylinder(0, 930, 120, 0, 170, 13, h3, 3);
    for (var k = 0; k < 6; k++) {
      var sx = 934 + k * 28;
      v.cylinder(0, sx, 120, 0, 22, 14.4, packVal(MAT.CANNON, PAL.cyan), 1.6);
    }
    v.cylinder(0, 1092, 120, 0, 8, 16, E(PAL.white));
    v.cylinder(0, 1096, 120, 0, 4, 9, E('#E6FFFF'));
    // 舰首发光缘与尖端
    v.fill(1096, 100, -4, 1100, 110, 4, E(PAL.white));
    // 舷窗光带（沿舰身一侧）
    for (x = 150; x < 560; x += 24) {
      v.fill(x, 136, 104, x + 6, 139, 106, E(PAL.cyan));
      v.fill(x, 136, -106, x + 6, 139, -104, E(PAL.cyan));
    }
    // 舰顶点缀光线
    for (x = 320; x < 800; x += 60) v.fill(x, 270, -2, x + 16, 272, 2, E(PAL.amber));
    // 装甲板拼缝：甲板与舷侧的深色细缝，按板块节奏切分
    for (x = 420; x < 820; x += 44) {
      v.fill(x, 236, -86, x + 2, 238, 86, R());
      v.fill(x, 256, -64, x + 2, 258, 64, R());
    }
    for (x = 80; x < 600; x += 52) {
      var zs = x < 300 ? 103 : 116;
      v.fill(x, 74, -zs - 1, x + 2, 186, -zs + 1, R());
      v.fill(x, 74, zs, x + 2, 186, zs + 2, R());
    }
    // 中段舷侧的散热格栅（小凹坑成排）
    for (x = 360; x < 580; x += 22) for (var gy = 90; gy < 170; gy += 14) {
      v.fill(x, gy, 116, x + 8, gy + 6, 118, R());
      v.fill(x, gy, -118, x + 8, gy + 6, -116, R());
    }
    // 甲板上的天线与传感鳍（薄片）
    for (x = 440; x <= 660; x += 110) {
      v.fill(x, 270, -1, x + 3, 300, 1, h3);
      v.fill(x - 2, 292, -1, x + 5, 294, 1, G());
    }
    // 雷达天线罩与甲板通风口
    v.ellipsoid(730, 256, 40, 16, 9, 16, h3, 2);
    v.cylinder(1, 730, 256, 40, 10, 2, G());
    for (x = 640; x <= 760; x += 30) v.fill(x, 236, -58, x + 8, 238, -50, R());
    // 舰桥外环与观景窗带
    v.shell(806, 300, -44, 916, 304, 44, 2, G());
    v.fill(800, 256, -62, 920, 258, -60, G());
    v.fill(800, 256, 60, 920, 258, 62, G());
    // 中段舷侧的通透观察窗（半透明玻璃，映出后方层次）
    for (x = 340; x < 580; x += 48) {
      v.fill(x, 146, 116, x + 14, 156, 118, GL());
      v.fill(x, 146, -118, x + 14, 156, -116, GL());
    }
    // 舰尾的推进层级：外缘的金色边
    v.fill(0, 60, -101, 36, 62, -99, G());
    v.fill(0, 60, 99, 36, 62, 101, G());
    // 轮廓线
    v.fill(60, 200, -106, 640, 201, -104, G());
    v.fill(60, 200, 104, 640, 201, 106, G());
    return v;
  }
  // 旗舰脉冲炮台位置（本地坐标，未平移）
  var FLAG_PODS = [];
  (function () {
    for (var x = 350; x <= 710; x += 120) {
      FLAG_PODS.push({ x: x, y: 236, z: -50, dir: [1, 0, 0], kind: 'pulse' });
      FLAG_PODS.push({ x: x, y: 236, z: 50, dir: [1, 0, 0], kind: 'pulse' });
    }
    for (x = 260; x <= 760; x += 170) {
      FLAG_PODS.push({ x: x, y: 26, z: -70, dir: [1, 0, 0], kind: 'pulse' });
      FLAG_PODS.push({ x: x, y: 26, z: 70, dir: [1, 0, 0], kind: 'pulse' });
    }
  })();

  // 脉冲炮台：底座、炮管、发光口（沿 +X 射击）
  function buildPulsePod() {
    var v = new VOX.Vox();
    v.fill(-7, -5, -7, 7, 2, 7, H(PAL.h2));
    v.fill(-7, 2, -7, 7, 3, 7, G());
    v.fill(-5, 3, -5, 5, 9, 5, H(PAL.h1));
    v.fill(-3, 9, -3, 3, 11, 3, G());
    v.fill(4, 5, -2, 22, 9, 2, H(PAL.h3));
    v.fill(18, 5, -3, 22, 9, 3, R());
    v.fill(21, 6, -2, 23, 8, 2, E(PAL.cyan));
    return v;
  }
  // 近防炮座：小型双管炮座
  function buildGunPod() {
    var v = new VOX.Vox();
    v.fill(-5, -3, -5, 5, 2, 5, H(PAL.h2));
    v.fill(-4, 2, -4, 4, 5, 4, H(PAL.h3));
    v.fill(3, 3, -3, 15, 4, -1, R());
    v.fill(3, 3, 1, 15, 4, 3, R());
    v.fill(14, 3, -3, 15, 4, -1, E(PAL.amber));
    v.fill(14, 3, 1, 15, 4, 3, E(PAL.amber));
    return v;
  }

  // ---------- 近卫舰（紧凑厚实） ----------
  var NG_ANCHOR = [85, 50, 0];
  function buildNearGuard() {
    var v = new VOX.Vox();
    var h1 = H(PAL.h1), h2 = H(PAL.h2), h3 = H(PAL.h3);
    v.fill(30, 22, -40, 130, 78, 40, h1);            // 中央主体
    v.fill(130, 30, -26, 168, 70, 26, h2);           // 收束的前端
    v.fill(50, 78, -28, 120, 92, 28, h3);            // 上甲板
    v.fill(70, 92, -10, 100, 100, 10, G());          // 传感器
    for (var s = -1; s <= 1; s += 2) {
      var zz = s > 0 ? [40, 70] : [-70, -40];
      v.fill(40, 38, zz[0], 110, 60, zz[1], h2);     // 短翼
      v.fill(60, 44, zz[0] + 2, 100, 54, zz[1] - 2, h3);
      v.fill(60, 58, zz[0] + 2, 100, 59, zz[1] - 2, E(PAL.amber));
      v.fill(70, 66, zz[0] + 2, 92, 67, zz[1] - 2, R());
    }
    v.fill(0, 30, -34, 30, 70, 34, h2);             // 后段推进体
    v.fill(-0, 36, -20, 4, 64, 20, R());
    v.cylinder(0, 0, 50, -16, 6, 9, G());
    v.cylinder(0, 0, 50, 16, 6, 9, G());
    v.cylinder(0, 0, 50, -16, 4, 5, R());
    v.cylinder(0, 0, 50, 16, 4, 5, R());
    v.cylinder(0, 0, 50, -16, 2, 3, NZ());
    v.cylinder(0, 0, 50, 16, 2, 3, NZ());
    // 舷侧凹缝与窗光
    for (var x = 46; x < 124; x += 16) v.fill(x, 52, -41, x + 6, 54, -40, E(PAL.cyan));
    for (x = 46; x < 124; x += 16) v.fill(x, 52, 40, x + 6, 54, 41, E(PAL.cyan));
    v.fill(30, 78, -40, 130, 79, -39, R());
    v.fill(30, 78, 39, 130, 79, 40, R());
    v.fill(150, 40, -2, 168, 60, 2, G());
    return v;
  }
  // 近卫舰的炮座位置（本地，未平移，沿 +X 射击）
  var NG_PODS = [
    { x: 70, y: 92, z: -18 }, { x: 70, y: 92, z: 18 },
    { x: 118, y: 80, z: -16 }, { x: 118, y: 80, z: 16 }
  ];

  // ---------- 前卫舰（舒展延伸、导弹发射臂） ----------
  var VG_ANCHOR = [115, 35, 0];
  var VG_TUBES = [];   // 导弹发射口（本地）：{x,y,z}
  function buildVanguard() {
    var v = new VOX.Vox();
    var h1 = H(PAL.h1), h2 = H(PAL.h2), h3 = H(PAL.h3);
    v.fill(0, 30, -14, 200, 46, 14, h1);            // 脊梁
    v.fill(200, 32, -9, 215, 44, 9, h3);            // 尖削的前端
    v.fill(40, 46, -12, 170, 54, 12, h2);
    v.fill(60, 46, -2, 110, 68, 2, h2);             // 竖向鳍片
    v.fill(70, 66, -1, 100, 70, 1, G());
    v.fill(0, 34, -8, 14, 40, 8, R());              // 尾段凹腔
    v.fill(0, 36, -6, 3, 40, 6, E(PAL.cyan));
    for (var s = -1; s <= 1; s += 2) {
      var zz = s > 0 ? [16, 50] : [-50, -16];
      v.fill(60, 26, zz[0], 190, 40, zz[1], h2);    // 导弹发射臂
      v.fill(60, 40, zz[0] + 2, 190, 41, zz[1] - 2, G());
      // 发射臂顶面的槽列（自上方可见的重复开口）
      for (var sl = 0; sl < 4; sl++) {
        var slz = s > 0 ? 22 + sl * 8 : -22 - sl * 8;
        for (var slx = 110; slx < 186; slx += 18) v.fill(slx, 39, slz - 2, slx + 9, 41, slz + 2, R());
      }
      for (var row = 0; row < 2; row++) {
        var ty = row === 0 ? 29 : 37;
        for (var k = 0; k < 4; k++) {
          var tz = s > 0 ? 22 + k * 8 : -22 - k * 8;
          v.cylinder(0, 183, ty, tz, 7, 2.5, R());
          v.cylinder(0, 189, ty, tz, 1, 3.4, E(PAL.amber), 0.9);
          VG_TUBES.push({ x: 190, y: ty, z: tz });
        }
      }
    }
    v.cylinder(0, 0, 38, -8, 4, 6, G());
    v.cylinder(0, 0, 38, 8, 4, 6, G());
    v.cylinder(0, 0, 38, -8, 3, 4, R());
    v.cylinder(0, 0, 38, 8, 3, 4, R());
    v.cylinder(0, 0, 38, -8, 2, 2.5, NZ());
    v.cylinder(0, 0, 38, 8, 2, 2.5, NZ());
    v.fill(40, 38, -15, 180, 39, -14, E(PAL.cyan));
    v.fill(40, 38, 14, 180, 39, 15, E(PAL.cyan));
    return v;
  }
  var VG_PODS = [];

  // ---------- 小艇 ----------
  var BOAT_ANCHOR = [15, 6, 0];
  function buildBoat() {
    var v = new VOX.Vox();
    v.fill(4, 2, -4, 24, 9, 4, H(PAL.h1));
    v.fill(24, 3, -2, 30, 7, 2, G());
    v.fill(12, 9, -2, 18, 11, 2, GL());
    v.fill(8, 4, 4, 14, 6, 9, H(PAL.h2));
    v.fill(8, 4, -9, 14, 6, -4, H(PAL.h2));
    v.fill(0, 4, 1, 4, 7, 3, NZ());
    v.fill(0, 4, -3, 4, 7, -1, NZ());
    v.fill(4, 2, 0, 24, 3, 1, R());
    return v;
  }

  // ---------- 导弹 ----------
  var MISSILE_ANCHOR = [7, 2, 2];
  function buildMissile() {
    var v = new VOX.Vox();
    v.fill(0, 0, 0, 12, 4, 4, H(PAL.white));
    v.fill(12, 1, 1, 15, 3, 3, H(PAL.h3));
    v.fill(15, 1, 1, 16, 3, 3, E('#FFFFFF'));
    v.fill(2, 4, 1, 5, 6, 3, G());
    v.fill(2, -2, 1, 5, 0, 3, G());
    v.fill(-2, 1, 0, 0, 3, 4, E(PAL.amber));
    return v;
  }

  // ---------- 烘焙所有模型 ----------
  function bakeAll() {
    var out = {};
    var fv = buildFlagship();
    out.flag = bake(fv, -FLAG_ANCHOR[0], -FLAG_ANCHOR[1], -FLAG_ANCHOR[2]);
    out.pulse = bake(buildPulsePod(), 0, 0, 0);
    out.gun = bake(buildGunPod(), 0, 0, 0);
    var ng = buildNearGuard();
    out.ng = bake(ng, -NG_ANCHOR[0], -NG_ANCHOR[1], -NG_ANCHOR[2]);
    var vg = buildVanguard();
    out.vg = bake(vg, -VG_ANCHOR[0], -VG_ANCHOR[1], -VG_ANCHOR[2]);
    out.boat = bake(buildBoat(), -BOAT_ANCHOR[0], -BOAT_ANCHOR[1], -BOAT_ANCHOR[2]);
    out.missile = bake(buildMissile(), -MISSILE_ANCHOR[0], -MISSILE_ANCHOR[1], -MISSILE_ANCHOR[2]);
    return out;
  }

  return {
    FLAG_ANCHOR: FLAG_ANCHOR, FLAG_PODS: FLAG_PODS, NG_ANCHOR: NG_ANCHOR, NG_PODS: NG_PODS,
    VG_ANCHOR: VG_ANCHOR, VG_TUBES: VG_TUBES, BOAT_ANCHOR: BOAT_ANCHOR, MISSILE_ANCHOR: MISSILE_ANCHOR,
    bakeAll: bakeAll, PAL: PAL
  };
})();

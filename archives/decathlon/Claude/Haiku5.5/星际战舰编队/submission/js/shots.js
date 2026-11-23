// 镜头程序：分段运镜、舰内剪接与导出分块。
// 舰外镜头以旗舰中心 C(t) 为基准的相对偏移描述（循环首尾相接）；舰内镜头使用各自的局部坐标。

var SHOTS = (function () {
  var TT = FLEET.T;
  var FOV = 40 * Math.PI / 180;

  // 舰外：航行与巡礼（首尾镜头在循环接缝处相同：取向偏向前方，使接缝处刚碎裂的陨石碎块已移出画面）（0–26 秒），相对旗舰中心的相机位置与注视点
  var EXT1_POS = [[0, -120, 170, 1000], [4, -380, -240, 900], [9, 330, 190, 760], [12, 560, 220, 640], [15, 640, 180, 720], [20, 330, 120, 820], [23, 120, 80, 700], [26, 40, 40, 600]];
  var EXT1_TGT = [[0, 480, 0, 0], [4, 0, -60, 0], [9, 60, 0, 0], [13, 150, -20, 0], [17, -100, -40, 0], [20, -200, -40, 60], [23, -220, -50, 150], [26, -200, -50, 200]];
  // 舰外：陨石预告（42–46 秒）：自舰侧向前望去，让观众看见陨石与舰队的相对位置
  var REV_POS = [[42, 150, 120, 700], [46, 420, 260, 900]];
  var REV_TGT = [[42, 900, -40, 0], [46, 800, -120, -100]];
  // 舰外：开火（46–66 秒）
  var EXT2_POS = [[46, 420, 260, 900], [56, 480, 240, 980], [66, 300, 260, 800]];
  var EXT2_TGT = [[46, 800, -120, -100], [56, 820, -120, -100], [66, 700, -60, -60]];
  // 舰外：开盾、加速并回到开头的位置（66–78 秒）
  var EXT3_POS = [[66, 300, 260, 800], [72, -250, 200, 900], [78, -120, 170, 1000]];
  var EXT3_TGT = [[66, 700, -60, -60], [72, 150, 0, 0], [78, 480, 0, 0]];

  // 小艇返航时的跟拍：相机相对小艇的偏移
  var FOLLOW_POS = [[15, 230, 90, 420], [22, 60, 330, 160], [24, 40, 300, 330], [26, 20, 240, 420]];
  var FOLLOW_TGT = [[15, 0, 0, 0], [22, -10, -40, -40], [24, -10, -60, -40], [26, -10, -70, -80]];
  function extPose(t) {
    var C = FLEET.flagCenter(t);
    var p, g;
    if (t < 26) { p = SPL.eval(EXT1_POS, t); g = SPL.eval(EXT1_TGT, t); }
    else if (t < 46) { p = SPL.eval(REV_POS, t); g = SPL.eval(REV_TGT, t); }
    else if (t < 66) { p = SPL.eval(EXT2_POS, t); g = SPL.eval(EXT2_TGT, t); }
    else { p = SPL.eval(EXT3_POS, t); g = SPL.eval(EXT3_TGT, t); }
    if (t < 26) {
      // 15–19 秒由舰队巡礼镜头平滑过渡到跟拍小艇
      var w = MATH.smooth(15, 19, t);
      var bs = FLEET.boatState(0, t);
      var brel = [bs.p[0] - C[0], bs.p[1] - C[1], bs.p[2] - C[2]];
      var fp = SPL.eval(FOLLOW_POS, t), fg = SPL.eval(FOLLOW_TGT, t);
      var fpos = [brel[0] + fp[0], brel[1] + fp[1], brel[2] + fp[2]];
      var fgt = [brel[0] + fg[0], brel[1] + fg[1], brel[2] + fg[2]];
      p = [MATH.mix(p[0], fpos[0], w), MATH.mix(p[1], fpos[1], w), MATH.mix(p[2], fpos[2], w)];
      g = [MATH.mix(g[0], fgt[0], w), MATH.mix(g[1], fgt[1], w), MATH.mix(g[2], fgt[2], w)];
    }
    return {
      pos: [C[0] + p[0], C[1] + p[1], C[2] + p[2]],
      target: [C[0] + g[0], C[1] + g[1], C[2] + g[2]]
    };
  }

  // 舰内：每段一个镜头，tau 为段内时间（秒）
  function interiorPose(name, tau) {
    if (name === 'hangar') {
      var bz = 380 - 20 * tau;
      return { pos: [0, 30, Math.max(300, bz)], target: [0, 34, 0] };
    }
    if (name === 'corridor') {
      return { pos: [0, 30, 340 - 26 * tau], target: [0, 34, 0] };
    }
    if (name === 'bridge') {
      // 自观景窗向内推进（承接长廊的运动方向），再缓缓环顾中枢
      var zb = 50 - 3 * tau;
      return { pos: [14 * Math.sin(0.35 * tau), 48 + 2 * Math.sin(tau), zb], target: [0, 34, -20] };
    }
    // atrium：沿分叉平台之间的缺口（支撑之间的清晰扇区）自底层缓缓升至顶层，
    // 视线指向核心：各层平台依次掠过，中庭的全高纵深一次展示
    var y = 22 + 31 * tau;
    return { pos: [116 * Math.cos(1.8), y, 116 * Math.sin(1.8)], target: [0, 118, 0] };
  }

  // 段落：舰外与舰内交替（运动承接见各段起止）
  var SEG = [
    { name: 'hangar', t0: 26, t1: 30 },
    { name: 'corridor', t0: 30, t1: 34 },
    { name: 'bridge', t0: 34, t1: 39 },
    { name: 'atrium', t0: 39, t1: 42 }
  ];

  var RUN_LIST = [
    { name: 'tour', t0: 0, t1: 26 },
    { name: 'interior', t0: 26, t1: 42 },
    { name: 'battle', t0: 42, t1: 66 },
    { name: 'return', t0: 66, t1: TT }
  ];

  function init() {}

  function at(t) {
    for (var i = 0; i < SEG.length; i++) {
      var s = SEG[i];
      if (t >= s.t0 && t < s.t1) {
        var p = interiorPose(s.name, t - s.t0);
        return { pos: p.pos, target: p.target, fov: FOV, stage: s.name, tau: t - s.t0 };
      }
    }
    var e = extPose(t);
    return { pos: e.pos, target: e.target, fov: FOV, stage: 'ext', tau: t };
  }

  return { init: init, at: at, runs: function () { return RUN_LIST; } };
})();

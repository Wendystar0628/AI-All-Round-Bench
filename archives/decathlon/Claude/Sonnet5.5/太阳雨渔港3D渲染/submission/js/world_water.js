'use strict';
/* 水面、剖面水墙、框线、水洼 */
const PUDDLES = [
  { x: -0.6, z: 9.4, rx: 1.9, rz: 1.2, rot: 0.3 }, { x: 3.4, z: 8.4, rx: 1.3, rz: 0.8, rot: -0.2 },
  { x: 6.2, z: 11.2, rx: 1.7, rz: 1.0, rot: 0.5 }, { x: -8.1, z: 4.4, rx: 1.0, rz: 1.8, rot: 0.1 },
  { x: -8.2, z: -4.8, rx: 0.9, rz: 1.6, rot: -0.1 }, { x: -11.5, z: 10.5, rx: 1.7, rz: 1.0, rot: 0.2 },
  { x: -4.0, z: 12.3, rx: 1.3, rz: 0.8, rot: -0.4 }, { x: -10.8, z: 0.2, rx: 1.0, rz: 1.4, rot: 0.2 },
  { x: -3.0, z: 8.6, rx: 1.1, rz: 0.7, rot: 0.1 }, { x: 4.4, z: 12.6, rx: 1.1, rz: 0.7, rot: 0.3 },
  { x: -7.8, z: 8.0, rx: 0.8, rz: 0.9, rot: 0.6 }, { x: -9.2, z: -7.0, rx: 0.7, rz: 1.1, rot: 0.0 },
  { x: 1.2, z: 10.8, rx: 0.9, rz: 0.6, rot: -0.3 },
  { x: -11.0, z: -6.4, rx: 0.9, rz: 1.1, rot: 0.2, y: QH + 0.058 }, { x: -10.2, z: -4.2, rx: 0.7, rz: 0.55, rot: -0.4, y: QH + 0.058 },
  { x: -10.1, z: -8.1, rx: 0.65, rz: 0.5, rot: 0.5, y: QH + 0.058 }
];
function buildWater(scene, { reflW, reflP }) {
  scene.add(makeWaterSurface(reflW));
  scene.add(makeWaterWall(28, 3, [14, -1.5, 0], Math.PI / 2));
  scene.add(makeWaterWall(5, 3, [11.5, -1.5, 14], 0));
  scene.add(makeWaterWall(18, 3, [5, -1.5, -14], Math.PI));
  scene.add(makePuddles(reflP, PUDDLES));
  // 岸壁/堤壁水线浪花与水光
  scene.add(makeFoamRibbon(lineRibbonPts(-6, 6, -6, -9.5, 1, 0), 0.38));
  scene.add(makeFoamRibbon(lineRibbonPts(-6, 6, 0.9, 6, 0, -1), 0.38));
  scene.add(makeFoamRibbon(lineRibbonPts(5.5, 6, 9, 6, 0, -1), 0.38));
  scene.add(makeFoamRibbon(lineRibbonPts(9, 6, 9, 14, 1, 0), 0.4));
  scene.add(makeFoamRibbon(lineRibbonPts(-6, -10.0, 4.6, -10.0, 0, 1), 0.36));
  scene.add(makeFoamRibbon(lineRibbonPts(-6, -12.2, 4.6, -12.2, 0, -1), 0.36));
  scene.add(makeFoamRibbon(lineRibbonPts(4.6, -12.2, 4.6, -10.0, 1, 0), 0.36));
  scene.add(makeCaustic(15.4, 0.85, [-5.985, 0.46, -1.7], [0, Math.PI / 2, 0], { amt: 0.3, scale: 1.0, color: '#d6fbf2' }));
  scene.add(makeCaustic(14.8, 0.85, [1.6, 0.46, 5.985], [0, Math.PI, 0], { amt: 0.26, scale: 1.0, color: '#d6fbf2' }));
  scene.add(makeCaustic(10.4, 0.7, [-0.7, 0.4, -9.985], [0, 0, 0], { amt: 0.26, scale: 1.0, color: '#d6fbf2' }));
  // 水箱框线：顶边与立柱
  const P = new Parts(); P.jit = 0;
  const fc = '#e6f7f2', fd = '#7ec9c0';
  P.box(0.16, 0.12, 28.16, [14, 0.0, 0], fc); P.box(5.16, 0.12, 0.16, [11.5, 0.0, 14], fc); P.box(18.16, 0.12, 0.16, [5, 0.0, -14], fc);
  for (const [x, z] of [[14, 14], [9, 14], [-4, -14], [14, -14]]) P.box(0.16, 3.12, 0.16, [x, -1.5, z], fd);
  P.box(0.16, 0.12, 0.16, [14, 0, 14], fc);
  P.box(0.16, 0.14, 28.16, [14, BOT + 0.02, 0], fd); P.box(5.16, 0.14, 0.16, [11.5, BOT + 0.02, 14], fd); P.box(18.16, 0.14, 0.16, [5, BOT + 0.02, -14], fd);
  scene.add(mesh(P.build(), MAT.vc, { cast: false }));
}

'use strict';
// 一次性修补：三维视图按场景资源分别建立世界（互不影响）；旋翼圆盘直接引用。
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'src', 'renderer', 'scene3d.js');
let s = fs.readFileSync(file, 'utf8');
const pairs = [
  ['  let shared = null;                // 共享的场景对象（灯光、天空等）', '  const worlds = new WeakMap();     // 场景资源 -> 世界（场景、灯光、直升机等）'],
  ['  function ensureShared() {\n    if (shared) return shared;\n    const scene = new THREE.Scene();', '  function makeWorld(res) {\n    const scene = new THREE.Scene();'],
  ['    shared = { scene, sun, hemi, pool, debris, heli, sprite, numTex: numberTexture(), dummy: new THREE.Object3D() };\n    return shared;',
   '    const world = { scene, sun, hemi, pool, debris, heli, sprite, dummy: new THREE.Object3D(), prepared: null, cam: null };\n    world.prepared = prepareResource(res);\n    scene.add(world.prepared.terrain);\n    for (const o of world.prepared.obstacles) scene.add(o);\n    for (const q of world.prepared.pads) scene.add(q);\n    scene.add(world.prepared.trees);\n    worlds.set(res, world);\n    return world;'],
  ['    const disc = new THREE.Mesh(new THREE.CircleGeometry(7.2, 48), new THREE.MeshBasicMaterial({ color: 0xdfe6ff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));',
   '    const disc = new THREE.Mesh(new THREE.CircleGeometry(7.2, 48), new THREE.MeshBasicMaterial({ color: 0xdfe6ff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));\n    discRef = disc;'],
  ['    g.userData = { body, rotor, tailRotor, hull, blades: rotor.children };', '    g.userData = { body, rotor, tailRotor, hull, disc: discRef };'],
  ['  function buildHeli(scene) {\n    const g = new THREE.Group();', '  function buildHeli(scene) {\n    let discRef = null;\n    const g = new THREE.Group();'],
  [`  function attachResource(sh, key, res) {
    const T = THREE;
    if (!res) return null;
    let p = prepared.get(res);
    if (!p) {
      p = prepareResource(res);
      prepared.set(res, p);
      sh.scene.add(p.terrain);
      for (const o of p.obstacles) sh.scene.add(o);
      for (const q of p.pads) sh.scene.add(q);
      sh.scene.add(p.trees);
      sh.scene.userData.res = p;
    }
    return p;
  }`, `  function worldFor(res) {
    return worlds.get(res) || makeWorld(res);
  }`],
  ['    const sh = shared;\n    const st = node.st;', '    const st = node.st;'],
  ['    attachResource(sh, node.res, res);\n    const cam = applyCam(sh, st.cam, w / h);', '    const sh = worldFor(res);\n    const cam = applyCam(sh, st.cam, w / h);'],
  ['      ud.rotor.children.forEach((c, i) => { if (c.isMesh && c.geometry.type === \'BoxGeometry\') c.visible = hel.rotor > 0.05; });\n      ud.rotor.children[2] && (ud.rotor.children[2].material.opacity = Math.max(0, Math.min(0.35, (hel.rotor - 0.5) * 0.9)));',
   '      ud.disc.material.opacity = Math.max(0, Math.min(0.35, (hel.rotor - 0.5) * 0.9));'],
  ['    if (!shared) ensureShared();\n', ''],
  ['    if (!sh.cam) sh.cam = new THREE.PerspectiveCamera(42, aspect, 0.3, 3000);\n    const c = sh.cam;', '    if (!sh.cam) sh.cam = new THREE.PerspectiveCamera(42, aspect, 0.3, 3000);\n    const c = sh.cam;'],
  ['    if (!sh.renderer && false) return;\n', ''],
];
for (const [a, b] of pairs) {
  const n = s.split(a).length - 1;
  if (n !== 1) throw new Error('anchor ' + n + ': ' + a.slice(0, 70));
  s = s.replace(a, () => b);
}
// 旧的全局对象引用：prepared 变量已不再使用
s = s.replace('  const prepared = new WeakMap();   // 资源对象 -> 预处理结果\n', '');
s = s.replace(/if \(!shared\)[^\n]*\n/g, '');
fs.writeFileSync(file, s);
console.log('scene3d patched; leftover shared refs:', (s.match(/\bshared\b/g) || []).length);

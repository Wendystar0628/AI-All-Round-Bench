/* ============================================================
   fx.js — 消波块浪花、泡沫、舱顶/天花板粼光（补充局部）
   ============================================================ */
(function () {
'use strict';
const { scene, onUpdate, R, RR, MAT, toon, LAYOUT, mulberry32, makeCanvas, texFromCanvas } = H;

/* ---------- 白色泡沫片（翻涌） ---------- */
function foamTexture(seed) {
  const [c, g] = makeCanvas(64, 64);
  const r = mulberry32(seed);
  g.clearRect(0, 0, 64, 64);
  g.fillStyle = 'rgba(255,255,255,0.9)';
  for (let i = 0; i < 18; i++) {
    g.beginPath();
    g.arc(12 + r() * 40, 12 + r() * 40, 2 + r() * 5, 0, 7);
    g.fill();
  }
  g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 1.5;
  for (let i = 0; i < 5; i++) {
    g.beginPath();
    g.arc(32, 32, 8 + i * 5 + r() * 3, r() * 3, r() * 3 + 2.4);
    g.stroke();
  }
  return new THREE.CanvasTexture(c);
}
const foams = [];
const foamTexs = [foamTexture(1), foamTexture(2), foamTexture(3)];
(function initFoam() {
  const r = mulberry32(66);
  const spots = H.foamSpots || [];
  for (const sp of spots) {
    for (let k = 0; k < 2; k++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({
          map: foamTexs[k % 3], transparent: true, depthWrite: false,
          color: 0xffffff, opacity: 0.8,
        }));
      m.rotation.x = -Math.PI / 2;
      m.position.copy(sp);
      m.position.x += (r() - 0.5) * 1.6;
      m.position.z += (r() - 0.5) * 1.6;
      const s = 0.8 + r() * 1.2;
      m.scale.set(s, s, s);
      m.renderOrder = 6;
      scene.add(m);
      foams.push({ m, ph: r() * 7, base: s, x: m.position.x, z: m.position.z });
    }
  }
})();

/* ---------- 拍岸碎浪白线（沿南壁水线） ---------- */
const shoreFoams = [];
(function shoreline() {
  const [c, g] = makeCanvas(128, 16);
  g.clearRect(0, 0, 128, 16);
  g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 3;
  g.beginPath();
  for (let x = 0; x <= 128; x += 8) {
    const y = 8 + Math.sin(x * 0.3) * 3;
    x ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.stroke();
  const tex = new THREE.CanvasTexture(c);
  const r = mulberry32(77);
  for (let i = 0; i < 10; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.5),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(-10 + i * 4.2, LAYOUT.waterY + 0.06, 3.7);
    m.renderOrder = 6;
    scene.add(m);
    shoreFoams.push({ m, ph: r() * 7 });
  }
})();

/* ---------- 船舷/灯罩滴水涟漪（由全局节奏触发） ---------- */
onUpdate((t, dt) => {
  const gust = H.gust || 0;
  for (const f of foams) {
    const k = 0.5 + 0.5 * Math.sin(t * 1.6 + f.ph);
    const s = f.base * (0.75 + k * 0.35 + gust * 0.2);
    f.m.scale.set(s, s, s);
    f.m.material.opacity = 0.45 + k * 0.4;
    f.m.position.y = LAYOUT.waterY + H.waveHeight(f.x, f.z, t) * 0.5 + 0.06;
  }
  for (const sf of shoreFoams) {
    const k = 0.5 + 0.5 * Math.sin(t * 1.2 + sf.ph);
    sf.m.position.z = 3.7 - k * 0.35 - gust * 0.15;
    sf.m.material.opacity = 0.3 + k * 0.5;
    sf.m.position.y = LAYOUT.waterY + 0.07;
  }
  // 灯柱滴水
  if (R() < dt * 0.8 && H.lamps && H.lamps.length) {
    const L = H.lamps[Math.floor(R() * H.lamps.length)];
    H.spawnRipple(L.x + 0.85 + RR(-0.3, 0.3), L.z + RR(-0.3, 0.3), 0.04,
      L.z < 4 ? true : false);
  }
});

})();

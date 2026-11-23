/* =========================================================================
 *  动态路由塔防 · 美术资源
 *  art.js — 程序化贴图与材质（全部 Canvas 生成，file:// 可用）
 * ========================================================================= */
(function (global) {
  'use strict';
  const RT = (global.RT = global.RT || {});
  const T = THREE;

  const cache = {};

  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  function tex(c, repeat) {
    const t = new T.CanvasTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    if (repeat) t.repeat.set(repeat[0], repeat[1]);
    t.anisotropy = 4;
    t.needsUpdate = true;
    return t;
  }

  /* ---------------- 地面网格贴图 ---------------- */
  function gridTexture(base, edge, accent) {
    const c = canvas(512, 512), x = c.getContext('2d');
    x.fillStyle = base; x.fillRect(0, 0, 512, 512);
    // 细网格
    x.strokeStyle = edge; x.globalAlpha = 0.35; x.lineWidth = 1;
    for (let i = 0; i <= 512; i += 32) {
      x.beginPath(); x.moveTo(i + 0.5, 0); x.lineTo(i + 0.5, 512); x.stroke();
      x.beginPath(); x.moveTo(0, i + 0.5); x.lineTo(512, i + 0.5); x.stroke();
    }
    // 主网格
    x.globalAlpha = 0.7; x.lineWidth = 2; x.strokeStyle = accent;
    for (let i = 0; i <= 512; i += 128) {
      x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 512); x.stroke();
      x.beginPath(); x.moveTo(0, i); x.lineTo(512, i); x.stroke();
    }
    // 电路走线
    x.globalAlpha = 0.35; x.strokeStyle = accent; x.lineWidth = 2;
    for (let n = 0; n < 26; n++) {
      let px = Math.random() * 512, py = Math.random() * 512;
      x.beginPath(); x.moveTo(px, py);
      const steps = 2 + Math.floor(Math.random() * 3);
      for (let s = 0; s < steps; s++) {
        if (Math.random() > 0.5) px += (Math.random() > 0.5 ? 1 : -1) * (16 + Math.random() * 48);
        else py += (Math.random() > 0.5 ? 1 : -1) * (16 + Math.random() * 48);
        x.lineTo(px, py);
      }
      x.stroke();
      x.fillStyle = accent; x.globalAlpha = 0.5;
      x.fillRect(px - 3, py - 3, 6, 6);
      x.globalAlpha = 0.35;
    }
    // 噪点
    x.globalAlpha = 0.06;
    for (let i = 0; i < 2600; i++) {
      x.fillStyle = Math.random() > 0.5 ? '#ffffff' : '#000000';
      x.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
    }
    x.globalAlpha = 1;
    return tex(c);
  }

  /* ---------------- 链路贴图（带流动箭头） ---------------- */
  function roadTexture(color, accent) {
    const c = canvas(128, 256), x = c.getContext('2d');
    x.fillStyle = color; x.fillRect(0, 0, 128, 256);
    // 两侧暗边
    const g = x.createLinearGradient(0, 0, 128, 0);
    g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(0.18, 'rgba(0,0,0,0)');
    g.addColorStop(0.82, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.55)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 256);
    // 中央导流线
    x.strokeStyle = accent; x.globalAlpha = 0.85; x.lineWidth = 3;
    x.beginPath(); x.moveTo(64, 0); x.lineTo(64, 256); x.stroke();
    // 流动箭标
    x.globalAlpha = 0.95;
    for (let i = 0; i < 4; i++) {
      const y = i * 64 + 14;
      x.fillStyle = accent;
      x.beginPath();
      x.moveTo(64, y + 20); x.lineTo(52, y); x.lineTo(58, y);
      x.lineTo(58, y - 12); x.lineTo(70, y - 12); x.lineTo(70, y);
      x.closePath(); x.fill();
    }
    x.globalAlpha = 0.25; x.fillStyle = '#000';
    for (let i = 0; i < 900; i++) x.fillRect(Math.random() * 128, Math.random() * 256, 2, 2);
    x.globalAlpha = 1;
    return tex(c, [1, 1]);
  }

  /* ---------------- 通用发光圆点 ---------------- */
  function glowTexture(color) {
    const c = canvas(128, 128), x = c.getContext('2d');
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, color || 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.12)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    const t = new T.CanvasTexture(c);
    t.needsUpdate = true;
    return t;
  }

  /* ---------------- 六边形气隙贴图 ---------------- */
  function hexTexture(color) {
    const c = canvas(256, 256), x = c.getContext('2d');
    x.clearRect(0, 0, 256, 256);
    x.strokeStyle = color; x.globalAlpha = 0.55; x.lineWidth = 1.4;
    const r = 22, dx = r * 1.5, dy = r * Math.sqrt(3);
    for (let row = -1; row < 8; row++) {
      for (let col = -1; col < 8; col++) {
        const cx = col * dx, cy = row * dy + (col % 2 ? dy / 2 : 0);
        x.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI / 3) * i;
          const px = cx + r * Math.cos(a), py = cy + r * Math.sin(a);
          i ? x.lineTo(px, py) : x.moveTo(px, py);
        }
        x.closePath(); x.stroke();
      }
    }
    x.globalAlpha = 0.16; x.fillStyle = color; x.fillRect(0, 0, 256, 256);
    x.globalAlpha = 1;
    const t = new T.CanvasTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    return t;
  }

  /* ---------------- 数据流竖条贴图 ---------------- */
  function streamTexture(color) {
    const c = canvas(64, 256), x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.4, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 256);
    x.fillStyle = '#ffffff'; x.globalAlpha = 0.75;
    for (let i = 0; i < 8; i++) {
      const y = Math.random() * 250, h = 2 + Math.random() * 10;
      x.globalAlpha = 0.15 + Math.random() * 0.6;
      x.fillRect(Math.random() * 60, y, 2 + Math.random() * 3, h);
    }
    x.globalAlpha = 1;
    return tex(c, [1, 1]);
  }

  /* ---------------- 金属面板贴图 ---------------- */
  function panelTexture(base, line) {
    const c = canvas(256, 256), x = c.getContext('2d');
    x.fillStyle = base; x.fillRect(0, 0, 256, 256);
    x.strokeStyle = line; x.globalAlpha = 0.3; x.lineWidth = 1;
    for (let i = 0; i < 256; i += 16) {
      x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 256); x.stroke();
    }
    x.globalAlpha = 0.5; x.fillStyle = line;
    for (let i = 0; i < 40; i++) {
      x.fillRect(Math.floor(Math.random() * 250), Math.floor(Math.random() * 250), 6, 3);
    }
    x.globalAlpha = 1;
    return tex(c, [1, 1]);
  }

  /* ---------------- 材质工厂 ---------------- */
  function std(color, opts) {
    return new T.MeshStandardMaterial(Object.assign({
      color: new T.Color(color),
      roughness: 0.55, metalness: 0.55, flatShading: false
    }, opts || {}));
  }
  function emis(color, intensity, opts) {
    return new T.MeshStandardMaterial(Object.assign({
      color: new T.Color(color), emissive: new T.Color(color),
      emissiveIntensity: intensity === undefined ? 1.6 : intensity,
      roughness: 0.35, metalness: 0.2
    }, opts || {}));
  }
  function glowMat(color, opacity) {
    return new T.MeshBasicMaterial({
      color: new T.Color(color), transparent: true, opacity: opacity === undefined ? 0.5 : opacity,
      blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide
    });
  }

  function getTextures(theme) {
    if (cache.tex && cache.theme === theme) return cache.tex;
    cache.theme = theme;
    cache.tex = {
      grid: gridTexture(theme.ground, theme.groundEdge, theme.accent),
      road: roadTexture('#0c1a2b', theme.roadGlow),
      old: roadTexture('#1d1408', theme.old),
      glowWhite: glowTexture('rgba(255,255,255,1)'),
      hex: hexTexture(theme.accent),
      stream: streamTexture(theme.accent),
      panel: panelTexture('#131a26', theme.accent)
    };
    return cache.tex;
  }

  /* ---------------- 工具：圆角环 / 棱柱 ---------------- */
  function ringGeo(r, tube, seg) {
    return new T.TorusGeometry(r, tube, 8, seg || 32);
  }
  function hexGeo(r, h) {
    return new T.CylinderGeometry(r, r * 1.08, h, 6);
  }

  RT.Art = {
    canvas, tex, gridTexture, roadTexture, glowTexture, hexTexture, streamTexture,
    panelTexture, std, emis, glowMat, getTextures, ringGeo, hexGeo
  };
})(typeof window !== 'undefined' ? window : globalThis);

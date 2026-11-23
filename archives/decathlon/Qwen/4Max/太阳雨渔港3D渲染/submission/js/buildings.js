/* 渔协仓库与候船室（可见室内） */
'use strict';
(function (H) {
  const P = H.PAL, L = H.LAYOUT;
  const toon = H.toon, box = H.box, cyl = H.cyl, sph = H.sph, grp = H.grp, outline = H.outline;

  function corrugatedTexture(base, rust) {
    return H.canvasTex(256, 256, (ctx, w, h) => {
      const rnd = H.mulberry32(31);
      ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 16) {
        ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(x, 0, 6, h);
        ctx.fillStyle = 'rgba(40,60,60,0.16)'; ctx.fillRect(x + 8, 0, 5, h);
      }
      if (rust) {
        for (let i = 0; i < 26; i++) {
          ctx.fillStyle = 'rgba(150,90,55,' + (0.1 + rnd() * 0.25) + ')';
          const x = rnd() * w;
          ctx.fillRect(x, rnd() * h * 0.4, 2 + rnd() * 5, 20 + rnd() * 70);
        }
        H.speckle(ctx, w, h, 80, ['#8a4f33', '#b26a44'], 1, 4, 0.2, rnd);
      }
    }, [2, 1]);
  }

  function shutterTexture() {
    return H.canvasTex(256, 256, (ctx, w, h) => {
      ctx.fillStyle = '#b9c4c0'; ctx.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 14) {
        ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(0, y, w, 5);
        ctx.fillStyle = 'rgba(50,70,68,0.3)'; ctx.fillRect(0, y + 9, w, 4);
      }
      const rnd = H.mulberry32(13);
      H.speckle(ctx, w, h, 90, ['#9fb0aa', '#8a9a94', '#c4cdc9'], 1, 5, 0.3, rnd);
      for (let i = 0; i < 10; i++) {
        ctx.fillStyle = 'rgba(138,79,51,' + (0.12 + rnd() * 0.2) + ')';
        ctx.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 3, 10 + rnd() * 40);
      }
    }, [1, 2]);
  }

  function blackboardTexture() {
    return H.canvasTex(256, 192, (ctx, w, h) => {
      ctx.fillStyle = '#2f4440'; ctx.fillRect(0, 0, w, h);
      const rnd = H.mulberry32(27);
      H.speckle(ctx, w, h, 120, ['#3a524c', '#263a36'], 2, 8, 0.3, rnd);
      ctx.fillStyle = '#f4f1e4';
      ctx.font = 'bold 22px "Yu Gothic", "Microsoft YaHei", sans-serif';
      ctx.fillText('本日拍賣', 62, 32);
      ctx.strokeStyle = 'rgba(244,241,228,0.6)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(20, 44); ctx.lineTo(236, 44); ctx.stroke();
      ctx.font = '17px "Yu Gothic", "Microsoft YaHei", sans-serif';
      const rows = [['鯛', '820'], ['鰤', '640'], ['鯖', '310'], ['平目', '950']];
      rows.forEach(function (r, i) {
        const y = 72 + i * 28;
        ctx.fillStyle = '#f4f1e4'; ctx.fillText(r[0], 34, y);
        ctx.fillStyle = '#f2d264'; ctx.fillText('¥' + r[1], 130, y);
        ctx.fillStyle = 'rgba(244,241,228,0.5)'; ctx.fillText('/kg', 190, y);
      });
      ctx.fillStyle = 'rgba(244,241,228,0.55)'; ctx.font = '12px sans-serif';
      ctx.fillText('汐見港漁協', 150, 182);
    });
  }

  function timetableTexture() {
    return H.canvasTex(256, 192, (ctx, w, h) => {
      ctx.fillStyle = '#efe9d8'; ctx.fillRect(0, 0, w, h);
      const rnd = H.mulberry32(19);
      H.speckle(ctx, w, h, 100, ['#e2dcc8', '#d8d2be'], 2, 10, 0.4, rnd);
      ctx.fillStyle = '#5d7078';
      ctx.font = 'bold 20px "Yu Gothic", "Microsoft YaHei", sans-serif';
      ctx.fillText('連絡船 時刻表', 58, 30);
      ctx.strokeStyle = '#9fb0aa'; ctx.lineWidth = 1;
      ctx.strokeRect(16, 44, 224, 120);
      ctx.font = '12px "Yu Gothic", monospace';
      ctx.fillStyle = '#7a8a88';
      ctx.fillText('汐見 → 大島', 26, 62);
      ctx.fillText('汐見 → 沖ノ瀬', 140, 62);
      const t1 = ['07:10', '09:35', '12:20', '15:05', '17:40'];
      const t2 = ['08:00', '10:45', '13:30', '16:15', '18:30'];
      ctx.fillStyle = '#5d7078';
      t1.forEach(function (t, i) { ctx.fillText(t, 30, 84 + i * 17); });
      t2.forEach(function (t, i) { ctx.fillText(t, 144, 84 + i * 17); });
      ctx.beginPath(); ctx.moveTo(128, 44); ctx.lineTo(128, 164); ctx.stroke();
      ctx.fillStyle = '#b0684f'; ctx.font = '11px sans-serif';
      ctx.fillText('※ 欠航の場合あり', 60, 180);
    });
  }

  function clockTexture() {
    return H.canvasTex(128, 128, (ctx, w, h) => {
      ctx.fillStyle = '#f6f4ea'; ctx.beginPath(); ctx.arc(64, 64, 60, 0, 6.283); ctx.fill();
      ctx.strokeStyle = '#46565c'; ctx.lineWidth = 2;
      for (let i = 0; i < 12; i++) {
        const a = i * Math.PI / 6;
        ctx.beginPath();
        ctx.moveTo(64 + 50 * Math.cos(a), 64 + 50 * Math.sin(a));
        ctx.lineTo(64 + 56 * Math.cos(a), 64 + 56 * Math.sin(a));
        ctx.stroke();
      }
      ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(64, 64); ctx.lineTo(64 + 30 * Math.cos(-1.1), 64 + 30 * Math.sin(-1.1)); ctx.stroke();
      ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(64, 64); ctx.lineTo(64 + 44 * Math.cos(1.9), 64 + 44 * Math.sin(1.9)); ctx.stroke();
      ctx.strokeStyle = '#d95f4c'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(64, 64); ctx.lineTo(64 + 46 * Math.cos(3.6), 64 + 46 * Math.sin(3.6)); ctx.stroke();
      ctx.fillStyle = '#46565c'; ctx.beginPath(); ctx.arc(64, 64, 3, 0, 6.283); ctx.fill();
    });
  }

  function radioTexture() {
    return H.canvasTex(128, 96, (ctx, w, h) => {
      ctx.fillStyle = '#8a6242'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#d9c9a8'; ctx.fillRect(8, 10, 70, 76);
      ctx.strokeStyle = '#8a7a5a'; ctx.lineWidth = 1.5;
      for (let x = 12; x < 76; x += 6) { ctx.beginPath(); ctx.moveTo(x, 14); ctx.lineTo(x, 82); ctx.stroke(); }
      ctx.fillStyle = '#f4f1e4'; ctx.fillRect(84, 14, 36, 24);
      ctx.strokeStyle = '#d95f4c'; ctx.beginPath(); ctx.moveTo(96, 16); ctx.lineTo(96, 36); ctx.stroke();
      ctx.fillStyle = '#46565c';
      ctx.beginPath(); ctx.arc(94, 60, 8, 0, 6.283); ctx.fill();
      ctx.beginPath(); ctx.arc(112, 60, 8, 0, 6.283); ctx.fill();
    });
  }

  function crateStack(parent, x, y, z, nx, ny, nz, blue) {
    const rnd = H.mulberry32(nx * 7 + ny * 13 + nz);
    const wm = toon(P.crateWhite), bm = toon(P.crateBlue);
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) for (let k = 0; k < nz; k++) {
      if (rnd() < 0.12 && j === ny - 1) continue;
      const c = box(0.42, 0.24, 0.3, (blue && rnd() < 0.4) ? bm : wm,
        x + i * 0.44 + (rnd() - 0.5) * 0.03, y + j * 0.25 + 0.12, z + k * 0.32 + (rnd() - 0.5) * 0.03, parent);
      c.rotation.y = (rnd() - 0.5) * 0.08;
      // 箱沿
      box(0.44, 0.03, 0.32, toon(0xc9d4ce), c.position.x, c.position.y + 0.12, c.position.z, parent).rotation.y = c.rotation.y;
    }
  }
  H.crateStack = crateStack;

  function buildBuildings(scene) {
    const g = grp(0, 0, 0, scene);
    H.refs.buildings = g;

    // ================= 渔协仓库 =================
    const wh = grp(-8.2, L.quayY, -1.2, g);
    H.refs.warehouse = wh;
    const W = 3.4, D = 2.6, Hh = 2.25;   // 宽(z) 深(x) 高
    const wallM = new THREE.MeshToonMaterial({ color: 0xd8ddd6, gradientMap: H.gradientMap, map: H.concreteTexture(23, false) });
    const roofM = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: H.gradientMap, map: corrugatedTexture('#7a8a88', true) });
    // 地面（室内湿水泥）
    const floorM = new THREE.MeshToonMaterial({ color: 0xb9c6c0, gradientMap: H.gradientMap, map: H.concreteTexture(29, true) });
    const floor = box(D, 0.08, W, floorM, 0, 0.04, 0, wh);
    floor.receiveShadow = true;
    // 后墙（-x）与两侧墙
    box(0.1, Hh, W, wallM, -D / 2, Hh / 2, 0, wh);
    box(D, Hh, 0.1, wallM, 0, Hh / 2, -W / 2, wh);
    box(D, Hh, 0.1, wallM, 0, Hh / 2, W / 2, wh);
    // 前墙（+x）：门洞两侧 + 过梁
    const openW = 2.0, openH = 1.7;
    box(0.1, Hh, (W - openW) / 2, wallM, D / 2, Hh / 2, -(openW / 2 + (W - openW) / 4), wh);
    box(0.1, Hh, (W - openW) / 2, wallM, D / 2, Hh / 2, (openW / 2 + (W - openW) / 4), wh);
    box(0.1, Hh - openH, openW, wallM, D / 2, openH + (Hh - openH) / 2, 0, wh);
    // 半拉起卷帘（遮住上半）
    const shutter = box(0.05, openH * 0.52, openW - 0.06, new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: H.gradientMap, map: shutterTexture() }), D / 2 - 0.03, openH - openH * 0.26, 0, wh);
    shutter.castShadow = true;
    cyl(0.09, 0.09, openW, 10, toon(0x8a9a94), D / 2 - 0.03, openH + 0.1, 0, wh).rotation.x = Math.PI / 2;
    // 门轨
    box(0.06, openH + 0.2, 0.06, toon(0x6e7a7e), D / 2, (openH + 0.2) / 2, -openW / 2 - 0.03, wh);
    box(0.06, openH + 0.2, 0.06, toon(0x6e7a7e), D / 2, (openH + 0.2) / 2, openW / 2 + 0.03, wh);
    // 屋顶（双坡波纹铁）
    const r1 = box(D + 0.3, 0.07, W * 0.62, roofM, -0.05, Hh + 0.32, -W * 0.27, wh);
    r1.rotation.x = 0.32; r1.castShadow = true;
    const r2 = box(D + 0.3, 0.07, W * 0.62, roofM, -0.05, Hh + 0.32, W * 0.27, wh);
    r2.rotation.x = -0.32; r2.castShadow = true;
    box(D + 0.32, 0.08, 0.14, toon(0x6e5a48), -0.05, Hh + 0.52, 0, wh);
    // 山墙三角
    const gableShape = new THREE.Shape();
    gableShape.moveTo(-W / 2, 0); gableShape.lineTo(W / 2, 0); gableShape.lineTo(0, 0.55); gableShape.closePath();
    const gableGeo = new THREE.ShapeGeometry(gableShape);
    [-1, 1].forEach(function (sx) {
      const gb = new THREE.Mesh(gableGeo, wallM);
      gb.position.set(sx * D / 2, Hh, 0);
      gb.rotation.y = sx * Math.PI / 2;
      wh.add(gb);
    });
    // 高窗（侧墙上部，阳光穿入）
    const hiWinM = toon(P.glass, { transparent: true, opacity: 0.35, emissive: 0xfff2cc, emissiveIntensity: 0.25 });
    [[-W / 2 - 0.01, 0], [W / 2 + 0.01, Math.PI]].forEach(function (w) {
      const win = H.plane(0.7, 0.4, hiWinM, 0.3, Hh - 0.35, w[0], wh);
      win.rotation.y = Math.PI / 2 + w[1];
      box(0.06, 0.44, 0.74, toon(0x8a9a94), 0.3, Hh - 0.35, w[0] * 0.99, wh).rotation.y = 0;
    });
    H.refs.warehouseHiWin = { x: -8.2 + 0.3, y: L.quayY + Hh - 0.35, z: -1.2 };
    // 招牌
    const signTex = H.canvasTex(256, 64, (ctx, w, h) => {
      ctx.fillStyle = '#e8ebe6'; ctx.fillRect(0, 0, w, h);
      const rnd = H.mulberry32(8);
      H.speckle(ctx, w, h, 60, ['#c4cdc9', '#b9c4c0'], 1, 4, 0.4, rnd);
      ctx.fillStyle = '#2e7f8f'; ctx.font = 'bold 30px "Yu Gothic", "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center'; ctx.fillText('汐見港漁協 倉庫', 128, 42);
      ctx.strokeStyle = '#2e7f8f'; ctx.lineWidth = 2; ctx.strokeRect(6, 6, 244, 52);
    });
    const sign = H.plane(1.7, 0.42, new THREE.MeshBasicMaterial({ map: signTex }), D / 2 + 0.06, openH + 0.42, 0, wh);
    sign.rotation.y = Math.PI / 2;
    // 室内：鱼箱垛
    crateStack(wh, -1.05, 0.08, -1.35, 2, 3, 2, false);
    crateStack(wh, -1.05, 0.08, 0.95, 2, 2, 2, true);
    // 冰柜
    const freezer = box(0.85, 0.62, 0.55, toon(0xeef1ec), -0.7, 0.39, 0.15, wh);
    outline(freezer, 0.015);
    box(0.87, 0.05, 0.57, toon(0xc9d4ce), -0.7, 0.72, 0.15, wh);
    box(0.2, 0.04, 0.04, toon(0x8a9a94), -0.7, 0.62, 0.44, wh);
    // 磅秤
    const scaleG = grp(0.55, 0.08, -0.9, wh);
    box(0.4, 0.06, 0.34, toon(0x8a9a94), 0, 0.16, 0, scaleG);
    cyl(0.03, 0.04, 0.5, 8, toon(0x6e7a7e), 0.14, 0.42, -0.12, scaleG);
    const dial = cyl(0.11, 0.11, 0.04, 14, toon(0xf4f1e4), 0.14, 0.68, -0.12, scaleG);
    dial.rotation.x = Math.PI / 2 - 0.3;
    // 墙上雨靴
    const bootM = toon(0x4d8fb8), bootM2 = toon(0xd95f4c);
    [[-0.4, bootM], [-0.15, bootM], [0.35, bootM2], [0.6, bootM2]].forEach(function (b) {
      const boot = grp(-D / 2 + 0.12, 1.35, b[0], wh);
      cyl(0.055, 0.065, 0.3, 8, b[1], 0, -0.15, 0, boot);
      box(0.07, 0.06, 0.16, b[1], 0, -0.3, 0.05, boot);
      cyl(0.012, 0.012, 0.08, 4, toon(P.iron), 0, 0.04, 0, boot);
    });
    // 黑板
    const bb = H.plane(0.9, 0.68, new THREE.MeshBasicMaterial({ map: blackboardTexture() }), -D / 2 + 0.10, 1.5, 0.55, wh);
    bb.rotation.y = Math.PI / 2;
    box(0.04, 0.72, 0.94, toon(0x8a6242), -D / 2 + 0.05, 1.5, 0.55, wh);
    // 散落冰块
    const iceM = toon(0xdff2f2, { transparent: true, opacity: 0.75 });
    const rnd = H.mulberry32(37);
    for (let i = 0; i < 12; i++) {
      const ice = box(0.05 + rnd() * 0.05, 0.04, 0.05 + rnd() * 0.05, iceM, -0.4 + rnd() * 1.4, 0.1, -0.6 + rnd() * 1.4, wh);
      ice.rotation.y = rnd() * 3;
      ice.castShadow = false;
    }
    // 室内水渍反光（地面亮片）
    const wetPatch = H.plane(1.6, 1.2, new THREE.MeshBasicMaterial({ color: H.srgbColor(0xcfe8e2), transparent: true, opacity: 0.22, depthWrite: false }), 0.2, 0.085, 0.2, wh);
    wetPatch.rotation.x = -Math.PI / 2; wetPatch.renderOrder = 2;
    // 天花板（接收粼光）
    const ceil = box(D - 0.1, 0.05, W - 0.1, toon(0xc9d4ce), 0, Hh - 0.03, 0, wh);
    ceil.receiveShadow = true;
    H.anim.causticTargets = H.anim.causticTargets || [];
    H.anim.causticTargets.push({ parent: wh, x: 0, y: Hh - 0.06, z: 0, w: D - 0.3, h: W - 0.3, rotX: Math.PI / 2 });
    // 室内补光
    const whLight = new THREE.PointLight(0xfff2cc, 0.85, 4.5, 2);
    whLight.position.set(0.3, 1.7, 0);
    wh.add(whLight);
    // 光柱注册（fx 生成）：高窗两道 + 卷帘一道
    H.refs.warehouseShafts = [
      { pos: new THREE.Vector3(-8.2 + 0.3, L.quayY + Hh - 0.35, -1.2 - 1.0), dir: new THREE.Vector3(-0.5, -0.75, -0.28), len: 2.6, w: 0.5 },
      { pos: new THREE.Vector3(-8.2 + 0.3, L.quayY + Hh - 0.35, -1.2 + 1.0), dir: new THREE.Vector3(-0.5, -0.75, -0.35), len: 2.6, w: 0.5 },
      { pos: new THREE.Vector3(-6.85, L.quayY + 1.5, -1.2), dir: new THREE.Vector3(-0.55, -0.65, -0.12), len: 2.2, w: 0.9 }
    ];
    // 室外：靠墙网兜与水桶（props 补充）、雨渍
    const stain = H.plane(0.5, 1.4, new THREE.MeshBasicMaterial({ color: H.srgbColor(0x9fb0aa), transparent: true, opacity: 0.25, depthWrite: false }), D / 2 + 0.055, 1.0, -1.35, wh);
    stain.rotation.y = Math.PI / 2;

    // ================= 候船室 =================
    const wr = grp(-8.0, L.quayY, 8.3, g);
    H.refs.waitingRoom = wr;
    const WW = 3.8, WD = 2.4, WH = 2.15;   // 宽(x) 深(z) 高
    const wrWallM = toon(0xeef0e8);
    const wrFloorM = new THREE.MeshToonMaterial({ color: 0xc9b99a, gradientMap: H.gradientMap, map: woodTextureFloor() });
    function woodTextureFloor() {
      return H.canvasTex(256, 256, (ctx, w, h) => {
        ctx.fillStyle = '#c9b99a'; ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = 'rgba(138,98,66,0.4)'; ctx.lineWidth = 2;
        for (let y = 0; y < h; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
        const rnd = H.mulberry32(3);
        H.speckle(ctx, w, h, 80, ['#b9a98a', '#d9c9a8'], 1, 5, 0.3, rnd);
      }, [2, 2]);
    }
    const wrFloor = box(WW, 0.1, WD, wrFloorM, 0, 0.05, 0, wr);
    wrFloor.receiveShadow = true;
    // 后墙(+z)、左墙(-x)、右墙(+x 带门)
    box(WW, WH, 0.1, wrWallM, 0, WH / 2, WD / 2, wr);
    box(0.1, WH, WD, wrWallM, -WW / 2, WH / 2, 0, wr);
    box(0.1, WH, WD * 0.45, wrWallM, WW / 2, WH / 2, WD * 0.275, wr);
    box(0.1, WH, WD * 0.25, wrWallM, WW / 2, WH / 2, -WD * 0.375, wr);
    box(0.1, WH - 1.6, WD * 0.3, wrWallM, WW / 2, 1.6 + (WH - 1.6) / 2, 0, wr);
    // 侧门（玻璃门，微开）
    const wrDoor = grp(WW / 2, 0, -WD * 0.15, wr);
    wrDoor.rotation.y = -0.5;
    box(0.05, 1.6, 0.62, toon(0xdfe5de), 0, 0.8, -0.31, wrDoor);
    const wrDoorGl = H.plane(0.5, 1.1, H.glassMat, 0.03, 0.95, -0.31, wrDoor);
    wrDoorGl.rotation.y = Math.PI / 2; wrDoorGl.renderOrder = 12;
    // 前立面：落地玻璃（-z）
    const frontGlass = H.plane(WW - 0.24, WH - 0.24, H.glassMat, 0, (WH - 0.24) / 2 + 0.1, -WD / 2, wr);
    frontGlass.renderOrder = 12;
    // 玻璃框
    const frameM = toon(0x8a9a94);
    box(WW, 0.12, 0.1, frameM, 0, 0.06, -WD / 2, wr);
    box(WW, 0.14, 0.1, frameM, 0, WH - 0.07, -WD / 2, wr);
    for (let i = 0; i <= 3; i++) box(0.07, WH, 0.09, frameM, -WW / 2 + 0.06 + i * (WW - 0.12) / 3, WH / 2, -WD / 2, wr);
    // 侧墙玻璃窗
    const sideGl = H.plane(WD * 0.5, WH * 0.55, H.glassMat, -WW / 2, WH * 0.5, -WD * 0.1, wr);
    sideGl.rotation.y = Math.PI / 2; sideGl.renderOrder = 12;
    // 平屋顶 + 檐口
    const wrRoof = box(WW + 0.4, 0.12, WD + 0.4, toon(0x9fb0aa), 0, WH + 0.06, 0, wr);
    wrRoof.castShadow = true; wrRoof.receiveShadow = true;
    outline(wrRoof, 0.018);
    box(WW + 0.42, 0.16, 0.06, toon(0x7a8a88), 0, WH + 0.02, -WD / 2 - 0.2, wr);
    // 招牌
    const wrSignTex = H.canvasTex(192, 48, (ctx, w, h) => {
      ctx.fillStyle = '#2e7f8f'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#f6f8f5'; ctx.font = 'bold 26px "Yu Gothic", "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center'; ctx.fillText('候 船 室', 96, 34);
    });
    const wrSign = H.plane(1.1, 0.28, new THREE.MeshBasicMaterial({ map: wrSignTex }), 0, WH - 0.32, -WD / 2 - 0.06, wr);
    // 室内：木长椅 ×2
    function bench(x, z, ry) {
      const b = grp(x, 0.1, z, wr, ry);
      const bm = toon(0xb98d5e);
      box(1.3, 0.06, 0.34, bm, 0, 0.36, 0, b);
      box(1.3, 0.3, 0.05, bm, 0, 0.55, 0.16, b);
      [[-0.55, -0.12], [0.55, -0.12], [-0.55, 0.12], [0.55, 0.12]].forEach(function (p) {
        box(0.06, 0.34, 0.06, toon(0x8a6242), p[0], 0.17, p[1], b);
      });
      return b;
    }
    bench(-0.7, 0.55, 0);
    bench(0.8, 0.55, 0);
    // 时刻表（后墙）
    const tt = H.plane(0.85, 0.64, new THREE.MeshBasicMaterial({ map: timetableTexture() }), -0.6, 1.45, WD / 2 - 0.09, wr);
    tt.rotation.y = Math.PI;
    box(0.89, 0.68, 0.03, toon(0x8a6242), -0.6, 1.45, WD / 2 - 0.05, wr);
    // 挂钟（略歪）
    const clockG = grp(0.75, 1.62, WD / 2 - 0.07, wr);
    clockG.rotation.z = 0.09;
    const clockBody = cyl(0.19, 0.19, 0.05, 18, toon(0x8a6242), 0, 0, 0, clockG);
    clockBody.rotation.x = Math.PI / 2;
    const clockFace = H.plane(0.34, 0.34, new THREE.MeshBasicMaterial({ map: clockTexture(), transparent: true }), 0, 0, -0.03, clockG);
    clockFace.rotation.y = Math.PI;
    H.refs.wallClock = clockG;
    // 老式收音机（小桌上）
    const table = box(0.5, 0.42, 0.35, toon(0xb98d5e), 1.35, 0.31, 0.75, wr);
    const radio = box(0.4, 0.28, 0.18, new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: H.gradientMap, map: radioTexture() }), 1.35, 0.66, 0.75, wr);
    outline(radio, 0.012);
    cyl(0.006, 0.006, 0.34, 4, toon(P.iron), 1.5, 0.9, 0.72, wr).rotation.z = -0.3;
    H.refs.radio = radio;
    // 热水壶（角落小架）
    const kettleStand = box(0.34, 0.5, 0.34, toon(0xdfe5de), -1.55, 0.35, 0.8, wr);
    const kettle = cyl(0.09, 0.11, 0.2, 12, toon(0xb9c6c9), -1.55, 0.71, 0.8, wr);
    cyl(0.03, 0.05, 0.05, 8, toon(0x8a9a94), -1.55, 0.83, 0.8, wr);
    const spout = cyl(0.02, 0.03, 0.12, 6, toon(0xb9c6c9), -1.44, 0.74, 0.8, wr);
    spout.rotation.z = -0.8;
    const kHandle = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.012, 5, 12, Math.PI), toon(0x46565c));
    kHandle.position.set(-1.55, 0.82, 0.8); wr.add(kHandle);
    // 绿萝
    const pot = cyl(0.1, 0.08, 0.16, 10, toon(0xd9764f), -1.55, 0.18, -0.75, wr);
    const pothos = grp(-1.55, 0.3, -0.75, wr);
    const leafM = toon(0x6fae7c), leafM2 = toon(0x93c98d);
    for (let i = 0; i < 9; i++) {
      const a = i * 0.7, r = 0.08 + (i % 3) * 0.04;
      const lf = sph(0.055, i % 2 ? leafM : leafM2, Math.cos(a) * r, 0.05 + (i % 4) * 0.04, Math.sin(a) * r, pothos, 7, 5);
      lf.scale.set(1.2, 0.5, 1);
    }
    // 垂蔓
    for (let i = 0; i < 3; i++) {
      const vine = H.tubeAlong([
        new THREE.Vector3(0, 0.08, 0),
        new THREE.Vector3(0.1 + i * 0.03, -0.05, 0.08),
        new THREE.Vector3(0.14 + i * 0.04, -0.22, 0.1)
      ], 0.008, toon(0x4d8a63), 8);
      pothos.add(vine);
      sph(0.035, leafM2, 0.14 + i * 0.04, -0.22, 0.1, pothos, 6, 4).scale.set(1.2, 0.5, 1);
    }
    // 室内暖光
    const wrLight = new THREE.PointLight(0xfff2cc, 0.6, 4.5, 2);
    wrLight.position.set(0, 1.7, 0.3);
    wr.add(wrLight);
    // 候船室前檐下小灯
    const wrLamp = sph(0.05, new THREE.MeshBasicMaterial({ color: H.srgbColor(0xfff2cc) }), 0, WH - 0.18, -WD / 2 - 0.12, wr);
    H.refs.wrLamp = wrLamp;

    return g;
  }

  H.buildBuildings = buildBuildings;
})(window.HARBOR);
/* =====================================================================
   buildings.js — 渔协仓库 / 候船室 / 山坡民家 / 灯塔
   ===================================================================== */
(function () {
  'use strict';
  const THREE = window.THREE;
  const TY = window.TY;
  const U = TY.util;
  const G = U.G, T = U.T;
  const M = TY.M;
  const L = TY.LAYOUT;

  const buildings = { group: null, shafts: [], caustics: [], clock: null, lamp: null, doors: [] };

  /* ---------- 光柱 ---------- */
  function makeShaft(from, to, r0, r1, color, intensity) {
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    const geo = new THREE.CylinderGeometry(r1, r0, len, 14, 1, true);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uIntensity: { value: intensity },
        uTime: { value: 0 },
      },
      vertexShader: [
        'varying vec2 vUvv;',
        'void main(){ vUvv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }'
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 uColor; uniform float uIntensity, uTime;',
        'varying vec2 vUvv;',
        'void main(){',
        '  float f = pow(1.0 - vUvv.y, 1.6);',
        '  float shimmer = 0.82 + 0.18*sin(vUvv.y*22.0 + uTime*1.7);',
        '  float a = f * uIntensity * shimmer;',
        '  gl_FragColor = vec4(uColor, a);',
        '}'
      ].join('\n'),
    });
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(from).add(to).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    m.renderOrder = 7;
    return m;
  }

  /* ---------- 焦散材质（天花板 / 舱顶） ---------- */
  TY.causticsMaterial = function (color, intensity) {
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: {
        uColor: { value: new THREE.Color(color || 0xbfe9ff) },
        uIntensity: { value: intensity === undefined ? 0.38 : intensity },
        uTime: { value: 0 },
      },
      vertexShader: [
        'varying vec2 vUvc;',
        'void main(){ vUvc = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }'
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 uColor; uniform float uIntensity, uTime;',
        'varying vec2 vUvc;',
        'void main(){',
        '  vec2 p = vUvc * vec2(5.0, 3.2);',
        '  float t = uTime * 0.55;',
        '  float n1 = sin(p.x*2.9 + t*1.1) * sin(p.y*2.3 - t*0.85);',
        '  float n2 = sin(p.x*4.7 - t*1.5 + n1*1.4) * sin(p.y*3.9 + t*1.25);',
        '  float n3 = sin((p.x+p.y)*6.1 + t*2.0) * 0.4;',
        '  float v = pow(max(0.0, (n1*0.5 + n2*0.35 + n3*0.15)*0.5 + 0.5), 4.5);',
        '  gl_FragColor = vec4(uColor, v * uIntensity);',
        '}'
      ].join('\n'),
    });
    return mat;
  };

  buildings.build = function (scene) {
    const grp = new THREE.Group();
    grp.name = 'buildings';
    scene.add(grp);
    buildings.group = grp;
    buildings.buildWarehouse(grp);
    buildings.buildWaitingRoom(grp);
    buildings.buildHill(grp);
    buildings.buildLighthouse(grp);
    TY.registerReflect(grp);
    return grp;
  };

  /* ================= 渔协仓库 ================= */
  buildings.buildWarehouse = function (grp) {
    const w = L.warehouse;
    const x0 = w.x0, x1 = w.x1, z0 = w.z0, z1 = w.z1;
    const y = L.top, h = w.h;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const bld = new U.Builder();
    const wall = (bx, by, bz, bw, bh, bd, ry) => bld.put(G.box(bw, bh, bd), M.wall, bx, by, bz, ry, 0.42);

    // 墙
    wall(x0 + 0.09, y + h / 2, cz, 0.18, h, z1 - z0, 0);                       // 西
    wall(cx, y + h / 2, z0 + 0.09, x1 - x0, h, 0.18, 0);                       // 南
    wall(cx, y + h / 2, z1 - 0.09, x1 - x0, h, 0.18, 0);                       // 北
    // 东墙（留卷帘门洞）
    const doorC = cz - 0.5, doorW = 3.0, doorH = 3.15;
    const eastSegs = [[z0, doorC - doorW / 2], [doorC + doorW / 2, z1]];
    eastSegs.forEach((s) => {
      const len = s[1] - s[0];
      if (len > 0.05) wall(x1 - 0.09, y + h / 2, (s[0] + s[1]) / 2, 0.18, h, len, 0);
    });
    // 门洞上方
    wall(x1 - 0.09, y + doorH + (h - doorH) / 2, doorC, 0.18, h - doorH, doorW, 0);
    // 门框
    bld.put(G.box(0.22, doorH + 0.1, 0.12), M.rustSolid, x1 - 0.09, y + (doorH + 0.1) / 2, doorC - doorW / 2 - 0.05, 0, 0.9);
    bld.put(G.box(0.22, doorH + 0.1, 0.12), M.rustSolid, x1 - 0.09, y + (doorH + 0.1) / 2, doorC + doorW / 2 + 0.05, 0, 0.9);

    // 屋顶（双坡 + 檐口）
    const roof = new U.Builder();
    const halfD = (z1 - z0) / 2, pitch = 0.30;
    const slabL = halfD / Math.cos(pitch);
    const ridgeY = y + h + halfD * 0.5 * Math.tan(pitch);
    roof.add(G.box(x1 - x0 + 0.3, 0.11, slabL), M.metalRoof,
      T.m(cx, ridgeY, cz - halfD / 2, -pitch, 0, 0), 0.5);
    roof.add(G.box(x1 - x0 + 0.3, 0.11, slabL), M.metalRoof,
      T.m(cx, ridgeY, cz + halfD / 2, pitch, 0, 0), 0.5);
    roof.add(G.box(x1 - x0 + 0.34, 0.1, 0.22), M.rustSolid, T.m(cx, ridgeY + 0.11, cz, 0, 0, 0), 0.9);
    roof.add(G.box(x1 - x0 + 0.42, 0.1, 0.26), M.rustSolid, T.m(cx, y + h - 0.02, z0 - 0.13, 0, 0, 0), 0.9);
    roof.add(G.box(x1 - x0 + 0.42, 0.1, 0.26), M.rustSolid, T.m(cx, y + h - 0.02, z1 + 0.13, 0, 0, 0), 0.9);
    // 山墙（三角）
    const gShape = new THREE.Shape();
    gShape.moveTo(-halfD - 0.12, 0);
    gShape.lineTo(halfD + 0.12, 0);
    gShape.lineTo(0, (halfD + 0.12) * Math.tan(pitch) + 0.06);
    gShape.closePath();
    const gGeo = new THREE.ExtrudeGeometry(gShape, { depth: 0.12, bevelEnabled: false });
    gGeo.rotateY(Math.PI / 2);
    gGeo.computeVertexNormals();
    U.triplanarUV(gGeo, 0.5);
    const gable = new THREE.Mesh(gGeo, M.wall);
    gable.position.set(x0 - 0.06, y + h, cz);
    gable.castShadow = true; gable.receiveShadow = true;
    grp.add(gable); TY.outline.attach(gable, 1.0);
    const gable2 = new THREE.Mesh(gGeo, M.wall);
    gable2.position.set(x1 + 0.18, y + h, cz);
    gable2.scale.z = -1;
    gable2.castShadow = true; gable2.receiveShadow = true;
    grp.add(gable2); TY.outline.attach(gable2, 1.0);
    roof.build(grp, { outline: true, outlineWidth: 1.05 });

    // 高窗（东墙上部 + 南墙）
    const winMat = TY.toon({ color: 0xd9f2f6, steps: 2, emissive: 0xfff0cc, emissiveIntensity: 0.55, transparent: true, opacity: 0.92 });
    for (let i = 0; i < 3; i++) {
      const zz = doorC - 1.0 + i * 1.0;
      bld.put(G.box(0.07, 0.46, 0.72), winMat, x1 - 0.06, y + h - 0.62, zz, 0, 1.1);
    }
    for (let i = 0; i < 3; i++) {
      bld.put(G.box(0.78, 0.46, 0.07), winMat, x0 + 1.1 + i * 1.0, y + h - 0.62, z0 + 0.06, 0, 1.1);
    }
    bld.build(grp, { outline: true, outlineWidth: 0.9 });

    /* 卷帘门（半拉起） */
    const shutH = 1.62;
    const shutter = new THREE.Mesh(new THREE.BoxGeometry(0.07, shutH, doorW - 0.06), M.shutter);
    shutter.position.set(x1 - 0.02, y + doorH - shutH / 2, doorC);
    grp.add(shutter); TY.outline.attach(shutter, 1.0);
    // 卷帘横棱
    const ribs = new U.Builder();
    for (let i = 0; i < 9; i++) {
      ribs.add(G.box(0.03, 0.05, doorW - 0.08), M.shutter,
        T.m(x1 + 0.02, y + doorH - 0.1 - i * (shutH / 9), doorC, 0, 0, 0), 1.1);
    }
    ribs.build(grp, { outline: false });
    // 门底锈边
    const sill = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.09, doorW - 0.06), M.rustSolid);
    sill.position.set(x1 - 0.02, y + doorH - shutH - 0.03, doorC);
    grp.add(sill); TY.outline.attach(sill, 0.9);
    // 卷帘卷筒
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, doorW, 12), M.ironMatte);
    roll.rotation.x = Math.PI / 2;
    roll.position.set(x1 - 0.02, y + doorH + 0.1, doorC);
    grp.add(roll); TY.outline.attach(roll, 0.9);
    // 导轨
    const guide = new U.Builder();
    guide.put(G.box(0.1, doorH, 0.08), M.rustSolid, x1 - 0.02, y + doorH / 2, doorC - doorW / 2, 0, 1.0);
    guide.put(G.box(0.1, doorH, 0.08), M.rustSolid, x1 - 0.02, y + doorH / 2, doorC + doorW / 2, 0, 1.0);
    guide.build(grp, { outline: true, outlineWidth: 0.8 });
    buildings.doors.push({ m: shutter, base: y + doorH - shutH / 2, phase: 0 });

    /* ---------------- 室内 ---------------- */
    const inner = new THREE.Group();
    grp.add(inner);
    const ib = new U.Builder();
    // 地板
    ib.put(G.box(x1 - x0 - 0.2, 0.06, z1 - z0 - 0.2), M.concreteSide, cx, y + 0.03, cz, 0, 0.5);
    // 成垛鱼箱
    const stacks = [[x0 + 1.0, z0 + 0.9, 4], [x0 + 1.05, z0 + 1.55, 3], [x0 + 2.0, z0 + 1.0, 5],
    [x1 - 1.3, z1 - 0.9, 3], [x0 + 2.6, z1 - 1.2, 4]];
    stacks.forEach((s, si) => {
      for (let i = 0; i < s[2]; i++) {
        ib.put(G.box(0.62, 0.28, 0.44), si % 2 ? M.crateWhite : M.crateBlue,
          s[0] + (i % 2) * 0.04, y + 0.18 + i * 0.29, s[1] + (i % 2) * 0.03, si * 0.3, 1.0);
      }
    });
    // 冰柜
    ib.put(G.box(1.5, 0.86, 0.72), M.whitePlastic, x0 + 1.1, y + 0.47, z1 - 0.75, 0, 1.0);
    ib.put(G.box(1.56, 0.09, 0.78), M.steel, x0 + 1.1, y + 0.92, z1 - 0.75, 0, 1.0);
    // 磅秤
    ib.put(G.box(0.78, 0.09, 0.78), M.steel, x1 - 1.0, y + 0.08, z0 + 0.95, 0, 1.1);
    ib.put(G.cyl(0.045, 0.045, 0.95, 8), M.ironMatte, x1 - 1.32, y + 0.55, z0 + 0.95, 0, 1.3);
    ib.put(G.cyl(0.24, 0.24, 0.07, 16), M.whitePlastic, x1 - 1.32, y + 1.05, z0 + 0.95, 0, 1.2);
    // 黑板
    ib.put(G.box(0.05, 0.86, 1.28), M.woodDark, x0 + 0.2, y + 1.7, cz + 0.3, 0, 1.0);
    ib.build(inner, { outline: true, outlineWidth: 0.85 });

    // 黑板面
    const bb = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.8), M.blackboard);
    bb.position.set(x0 + 0.23, y + 1.7, cz + 0.3);
    bb.rotation.y = Math.PI / 2;
    inner.add(bb);
    // 墙上的雨靴
    const bootMat = M.yellowRain;
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Group();
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.3, 8), bootMat);
      leg.position.y = -0.15;
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.24), bootMat);
      foot.position.set(0, -0.34, 0.05);
      b.add(leg); b.add(foot);
      b.position.set(x0 + 0.25, y + 2.25, z0 + 1.5 + i * 0.32);
      b.rotation.y = Math.PI / 2 + 0.1;
      inner.add(b);
      TY.outline.attach(leg, 0.85);
    }
    // 挂钩
    const hook = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 1.2), M.steel);
    hook.position.set(x0 + 0.2, y + 2.42, z0 + 1.95);
    inner.add(hook);
    // 散落冰块
    const rnd = U.mulberry32(31);
    for (let i = 0; i < 26; i++) {
      const ice = new THREE.Mesh(new THREE.IcosahedronGeometry(0.05 + rnd() * 0.05, 0), M.ice);
      ice.position.set(x0 + 0.7 + rnd() * (x1 - x0 - 1.4), y + 0.07, z0 + 0.5 + rnd() * (z1 - z0 - 1.0));
      ice.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
      ice.castShadow = false;
      inner.add(ice);
    }
    // 地面反光水渍
    const wet = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0 - 0.5, z1 - z0 - 0.5), new THREE.MeshBasicMaterial({
      color: 0x9fc6cf, transparent: true, opacity: 0.22, depthWrite: false,
    }));
    wet.rotation.x = -Math.PI / 2;
    wet.position.set(cx, y + 0.07, cz);
    wet.renderOrder = 2;
    inner.add(wet);

    // 天花板
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0 - 0.2, z1 - z0 - 0.2), M.wallWarm);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(cx, y + h - 0.12, cz);
    inner.add(ceil);
    // 天花板粼光
    const ca = TY.causticsMaterial(0xbfe9ff, 0.30);
    const cam = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0 - 0.3, z1 - z0 - 0.3), ca);
    cam.rotation.x = Math.PI / 2;
    cam.position.set(cx, y + h - 0.2, cz);
    cam.renderOrder = 5;
    inner.add(cam);
    buildings.caustics.push(ca);

    // 室内暖光 + 光柱
    const lamp = new THREE.PointLight(0xffdca0, 0.9, 7.5, 2);
    lamp.position.set(cx - 0.4, y + h - 0.7, cz);
    inner.add(lamp);
    const lamp2 = new THREE.PointLight(0xffe8bc, 0.55, 5.5, 2);
    lamp2.position.set(x1 - 0.8, y + 1.6, doorC);
    inner.add(lamp2);

    for (let i = 0; i < 3; i++) {
      const zz = doorC - 1.0 + i * 1.0;
      const from = new THREE.Vector3(x1 + 0.4, y + h - 0.55, zz);
      const to = new THREE.Vector3(x1 - 3.4, y + 0.1, zz - 0.35);
      const s = makeShaft(from, to, 0.3, 0.72, 0xffe6b0, 0.30);
      grp.add(s);
      buildings.shafts.push(s);
    }
    // 门洞里的一束斜光
    const ds = makeShaft(new THREE.Vector3(x1 + 0.5, y + doorH - 0.2, doorC),
      new THREE.Vector3(x1 - 3.2, y + 0.05, doorC + 0.3), 0.5, 0.95, 0xffdfa0, 0.20);
    grp.add(ds); buildings.shafts.push(ds);

    // 门外的堆放
    const outB = new U.Builder();
    for (let i = 0; i < 4; i++) {
      outB.put(G.box(0.62, 0.28, 0.44), M.crateBlue, x1 + 0.55, L.top + 0.15 + i * 0.29, z1 - 0.5, 0.4, 1.0);
    }
    outB.build(grp, { outline: true, outlineWidth: 0.9 });

    // 仓库招牌
    const signB = new U.Builder();
    signB.put(G.box(1.5, 0.42, 0.06), M.rustSolid, x1 + 0.05, y + h - 0.18, doorC, 0, 0.9);
    signB.build(grp, { outline: true, outlineWidth: 0.9 });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.34), M.warnSign);
    sign.position.set(x1 + 0.09, y + h - 0.18, doorC);
    sign.rotation.y = Math.PI / 2;
    grp.add(sign);
  };

  /* ================= 候船室 ================= */
  buildings.buildWaitingRoom = function (grp) {
    const w = L.waiting;
    const x0 = w.x0, x1 = w.x1, z0 = w.z0, z1 = w.z1;
    const y = L.top, h = w.h;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const bld = new U.Builder();
    bld.put(G.box(0.16, h, z1 - z0), M.wallWarm, x0 + 0.08, y + h / 2, cz, 0, 0.45);
    bld.put(G.box(x1 - x0, h, 0.16), M.wallWarm, cx, y + h / 2, z0 + 0.08, 0, 0.45);
    bld.put(G.box(x1 - x0, h, 0.16), M.wallWarm, cx, y + h / 2, z1 - 0.08, 0, 0.45);
    // 东面：落地玻璃 + 框
    bld.put(G.box(x1 - x0, 0.3, 0.16), M.wallWarm, cx, y + 0.15, z1 - 0.08, 0, 0.45);
    bld.put(G.box(x1 - x0, 0.34, 0.16), M.wallWarm, cx, y + h - 0.17, z1 - 0.08, 0, 0.45);
    bld.put(G.box(0.16, h, 0.14), M.wallWarm, x1 - 0.08, y + h / 2, z0 + 0.1, 0, 0.45);
    bld.put(G.box(0.16, h, 0.14), M.wallWarm, x1 - 0.08, y + h / 2, z1 - 0.1, 0, 0.45);
    bld.put(G.box(0.13, h, 0.1), M.wallWarm, x1 - 0.08, y + h / 2, cz + 0.35, 0, 0.45);
    // 屋顶（平缓双坡）
    const hD = (z1 - z0) / 2, hP = 0.22;
    const hL = hD / Math.cos(hP);
    const hRidge = y + h + hD * 0.5 * Math.tan(hP);
    bld.add(G.box(x1 - x0 + 0.34, 0.1, hL), M.roof,
      T.m(cx, hRidge, cz - hD / 2, -hP, 0, 0), 0.6);
    bld.add(G.box(x1 - x0 + 0.34, 0.1, hL), M.roof,
      T.m(cx, hRidge, cz + hD / 2, hP, 0, 0), 0.6);
    bld.put(G.box(x1 - x0 + 0.38, 0.08, 0.18), M.rustSolid, cx, hRidge + 0.08, cz, 0, 0.9);
    bld.put(G.box(x1 - x0 + 0.44, 0.09, 0.2), M.rustSolid, cx, y + h - 0.02, z1 + 0.12, 0, 0.9);
    bld.build(grp, { outline: true, outlineWidth: 1.0 });

    // 玻璃
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(z1 - z0 - 0.34, h - 0.62), M.glassClear);
    glass.rotation.y = Math.PI / 2;
    glass.position.set(x1 - 0.09, y + 0.3 + (h - 0.62) / 2, cz + 0.18);
    glass.renderOrder = 6;
    grp.add(glass);
    const glass2 = new THREE.Mesh(new THREE.PlaneGeometry(0.9, h - 0.62), M.glassClear);
    glass2.rotation.y = Math.PI / 2;
    glass2.position.set(x1 - 0.09, y + 0.3 + (h - 0.62) / 2, z0 + 0.45);
    glass2.renderOrder = 6;
    grp.add(glass2);
    // 门
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.07, h - 0.62, 0.5), M.glassClear);
    door.position.set(x1 - 0.06, y + 0.3 + (h - 0.62) / 2, z0 + 0.32);
    grp.add(door);

    /* 室内 */
    const inner = new THREE.Group();
    grp.add(inner);
    const ib = new U.Builder();
    ib.put(G.box(x1 - x0 - 0.16, 0.06, z1 - z0 - 0.16), M.wood, cx, y + 0.03, cz, 0, 0.7);
    // 木长椅
    for (let i = 0; i < 2; i++) {
      const bz = cz - 0.45 + i * 1.05;
      ib.put(G.box(0.4, 0.07, 1.3), M.woodDark, x0 + 0.85, y + 0.46, bz, 0, 1.1);
      ib.put(G.box(0.09, 0.44, 0.09), M.steel, x0 + 0.62, y + 0.24, bz - 0.5, 0, 1.3);
      ib.put(G.box(0.09, 0.44, 0.09), M.steel, x0 + 0.62, y + 0.24, bz + 0.5, 0, 1.3);
      ib.put(G.box(0.07, 0.42, 1.3), M.woodDark, x0 + 0.66, y + 0.72, bz, 0, 1.1);
    }
    // 桌子
    ib.put(G.box(0.7, 0.05, 0.9), M.woodDark, x1 - 0.75, y + 0.68, cz - 0.5, 0, 1.1);
    ib.put(G.box(0.08, 0.66, 0.08), M.woodDark, x1 - 0.75, y + 0.34, cz - 0.85, 0, 1.3);
    ib.put(G.box(0.08, 0.66, 0.08), M.woodDark, x1 - 0.75, y + 0.34, cz - 0.15, 0, 1.3);
    ib.build(inner, { outline: true, outlineWidth: 0.85 });

    // 收音机
    const radio = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.2, 0.17), M.radio);
    radio.position.set(x1 - 0.75, y + 0.8, cz - 0.5);
    radio.rotation.y = 0.2;
    inner.add(radio); TY.outline.attach(radio, 0.9);
    // 热水壶
    const kettle = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.22, 12), M.whitePlastic);
    kettle.position.set(x1 - 0.5, y + 0.78, cz + 0.85);
    inner.add(kettle); TY.outline.attach(kettle, 0.85);
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.035, 0.16, 6), M.steel);
    spout.position.set(x1 - 0.63, y + 0.86, cz + 0.85);
    spout.rotation.z = 0.7;
    inner.add(spout);
    // 绿萝
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.1, 0.18, 12), M.beige);
    pot.position.set(x0 + 0.55, y + 0.12, z1 - 0.5);
    inner.add(pot); TY.outline.attach(pot, 0.85);
    const plantMat = M.green;
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.09, 7, 5), plantMat);
      leaf.scale.set(1, 0.35, 0.6);
      leaf.position.set(x0 + 0.55 + Math.cos(a) * 0.13, y + 0.26 + (i % 3) * 0.07, z1 - 0.5 + Math.sin(a) * 0.13);
      leaf.rotation.set(0.3 * Math.sin(a), a, 0.4 * Math.cos(a));
      inner.add(leaf);
      const vine = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.3, 4), M.green);
      vine.position.set(x0 + 0.55 + Math.cos(a) * 0.07, y + 0.3, z1 - 0.5 + Math.sin(a) * 0.07);
      vine.rotation.set(Math.sin(a) * 0.4, 0, Math.cos(a) * 0.4);
      inner.add(vine);
    }
    // 墙上的时刻表
    const sch = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.56), M.schedule);
    sch.position.set(x0 + 0.17, y + 1.5, cz - 0.3);
    sch.rotation.y = Math.PI / 2;
    inner.add(sch);
    const schFrame = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.6, 0.48), M.woodDark);
    schFrame.position.set(x0 + 0.16, y + 1.5, cz - 0.3);
    inner.add(schFrame);
    // 歪斜的挂钟
    const clock = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 20), M.clock);
    clock.rotation.set(0, 0, Math.PI / 2);
    clock.rotation.z = 0;
    clock.position.set(x1 - 0.16, y + 2.1, z1 - 0.42);
    clock.rotation.y = Math.PI / 2;
    clock.rotateZ(0.14);
    inner.add(clock); TY.outline.attach(clock, 0.85);
    buildings.clock = clock;
    // 室内灯
    const lamp = new THREE.PointLight(0xffe4b4, 0.75, 5.2, 2);
    lamp.position.set(cx + 0.1, y + h - 0.5, cz);
    inner.add(lamp);
    // 窗外斜射光
    const s = makeShaft(new THREE.Vector3(x1 + 0.5, y + h - 0.5, cz + 0.4),
      new THREE.Vector3(x0 + 0.2, y + 0.05, cz - 0.5), 0.32, 0.6, 0xffe2aa, 0.11);
    grp.add(s); buildings.shafts.push(s);
    // 雨搭
    const aw = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.06, z1 - z0 + 0.3), M.rustSolid);
    aw.position.set(x1 + 0.3, y + h + 0.0, cz);
    aw.rotation.z = 0.12;
    grp.add(aw); TY.outline.attach(aw, 0.95);
  };

  /* ================= 山坡与民家 ================= */
  buildings.buildHill = function (grp) {
    const h = L.hill;
    const w = h.x1 - h.x0, d = h.z1 - h.z0;
    const cx = (h.x0 + h.x1) / 2, cz = (h.z0 + h.z1) / 2;
    const RX = 3.4 * (w / 6.8), RZ = 3.4 * (d / 6.8), RY = 3.4 * 0.85;
    const hillMat = M.grass;
    // 山坡表面高度
    function moundY(x, z) {
      const a = (x - cx) / RX, b = (z - cz) / RZ;
      const k = a * a + b * b;
      if (k >= 1) return L.top - 0.2;
      return L.top - 0.2 + RY * Math.sqrt(1 - k);
    }
    buildings.moundY = moundY;
    const mound = new THREE.Mesh(new THREE.SphereGeometry(3.4, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), hillMat);
    mound.scale.set(w / 6.8, 0.85, d / 6.8);
    mound.position.set(cx, L.top - 0.2, cz);
    mound.receiveShadow = true; mound.castShadow = true;
    grp.add(mound); TY.outline.attach(mound, 0.9);

    // 树
    const rnd = U.mulberry32(5);
    const trees = [];
    for (let i = 0; i < 18; i++) {
      const a = rnd() * Math.PI * 2, rr = 0.25 + rnd() * 0.72;
      const tx = cx + Math.cos(a) * rr * RX * 0.92;
      const tz = cz + Math.sin(a) * rr * RZ * 0.92;
      const ty = moundY(tx, tz) - 0.12;
      const s = 0.8 + rnd() * 0.7;
      const tr = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.085, 0.95, 6), M.woodDark);
      trunk.position.y = 0.47;
      tr.add(trunk);
      const leaves = new THREE.Group();
      for (let k = 0; k < 3; k++) {
        const c = new THREE.Mesh(new THREE.SphereGeometry(0.46 - k * 0.08, 9, 7), k % 2 ? M.tree : M.treeLight);
        c.position.set((k - 1) * 0.13, 1.0 + k * 0.32, (k % 2 ? 0.13 : -0.11));
        c.scale.set(1, 0.8, 1);
        leaves.add(c);
        TY.outline.attach(c, 0.9);
      }
      tr.add(leaves);
      tr.position.set(tx, ty, tz);
      tr.scale.setScalar(s);
      tr.castShadow = true;
      grp.add(tr);
      trees.push({ tr: tr, leaves: leaves, phase: rnd() * 6.28, base: leaves.rotation.z });
    }
    buildings.trees = trees;

    // 民家（依坡面高度落位）
    const houses = [[-8.75, -8.45, 0.55], [-7.05, -6.15, -0.35], [-5.95, -8.95, 1.05], [-9.35, -6.05, 0.25], [-8.0, -5.35, 0.2]];
    houses.forEach((hh, i) => {
      const bld = new U.Builder();
      const hw = 1.25 + (i % 2) * 0.18, hd = 1.0, hh2 = 1.05;
      const y = moundY(hh[0], hh[1]) - 0.18;
      bld.put(G.box(hw, hh2, hd), M.plaster, hh[0], y + hh2 / 2, hh[1], hh[2], 0.7);
      // 屋顶
      bld.add(G.box(hw + 0.32, 0.09, hd * 0.64), M.roof, T.m(hh[0], y + hh2 + 0.17, hh[1] - hd * 0.24, 0.38, hh[2], 0), 0.8);
      bld.add(G.box(hw + 0.32, 0.09, hd * 0.64), M.roof, T.m(hh[0], y + hh2 + 0.17, hh[1] + hd * 0.24, -0.38, hh[2], 0), 0.8);
      // 山墙
      bld.add(G.box(hw + 0.12, hh2 * 0.42, 0.1), M.plaster, T.m(hh[0], y + hh2 + 0.12, hh[1] - hd * 0.46, 0.38, hh[2], 0), 0.8);
      bld.add(G.box(hw + 0.12, hh2 * 0.42, 0.1), M.plaster, T.m(hh[0], y + hh2 + 0.12, hh[1] + hd * 0.46, -0.38, hh[2], 0), 0.8);
      bld.build(grp, { outline: true, outlineWidth: 0.95 });
      // 窗与门
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.32), TY.toon({
        color: 0xffe0a8, steps: 2, emissive: 0xffcf88, emissiveIntensity: 0.6,
      }));
      win.position.set(hh[0] + Math.cos(hh[2]) * (hw / 2 + 0.015), y + 0.58, hh[1] - Math.sin(hh[2]) * (hw / 2 + 0.015));
      win.rotation.y = hh[2];
      grp.add(win);
      const win2 = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.28), TY.toon({
        color: 0xffe0a8, steps: 2, emissive: 0xffcf88, emissiveIntensity: 0.6,
      }));
      win2.position.set(hh[0] + Math.sin(hh[2]) * (hd / 2 + 0.015), y + 0.58, hh[1] + Math.cos(hh[2]) * (hd / 2 + 0.015));
      win2.rotation.y = hh[2] + Math.PI / 2;
      grp.add(win2);
    });
  };

  /* ================= 灯塔 ================= */
  buildings.buildLighthouse = function (grp) {
    const lh = L.lighthouse;
    const baseY = L.break.top;
    const bld = new U.Builder();
    // 基座
    bld.put(G.cyl(0.52, 0.62, 0.32, 14), M.concreteSide, lh.x, baseY + 0.16, lh.z, 0, 0.7);
    // 塔身（分段红白）
    let y = baseY + 0.32;
    const segs = [[0.42, 0.38, 0.42], [0.38, 0.34, 0.42], [0.34, 0.30, 0.42], [0.30, 0.27, 0.38]];
    segs.forEach((s, i) => {
      const hgt = s[2];
      bld.put(G.cyl(s[1], s[0], hgt, 14), i % 2 ? M.lighthouseWhite : M.lighthouseRed, lh.x, y + hgt / 2, lh.z, 0, 1.0);
      y += hgt;
    });
    // 挑檐平台
    bld.put(G.cyl(0.44, 0.44, 0.08, 16), M.concreteSide, lh.x, y + 0.04, lh.z, 0, 1.0);
    // 栏杆
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      bld.put(G.cyl(0.014, 0.014, 0.26, 4), M.ironMatte, lh.x + Math.cos(a) * 0.38, y + 0.21, lh.z + Math.sin(a) * 0.38, 0, 1.6);
    }
    bld.put(G.tor(0.38, 0.016, 4, 18), M.ironMatte, lh.x, y + 0.34, lh.z, Math.PI / 2, 1.4);
    y += 0.08;
    // 灯室
    const lampY = y + 0.34;
    const glassCyl = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.46, 12), M.glassClear);
    glassCyl.position.set(lh.x, lampY, lh.z);
    glassCyl.renderOrder = 6;
    grp.add(glassCyl);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      bld.put(G.box(0.035, 0.48, 0.035), M.ironMatte, lh.x + Math.cos(a) * 0.21, lampY, lh.z + Math.sin(a) * 0.21, 0, 1.6);
    }
    // 顶盖
    bld.put(G.cyl(0.1, 0.26, 0.24, 12), M.lighthouseRed, lh.x, lampY + 0.36, lh.z, 0, 1.0);
    bld.put(G.sph(0.05, 8, 6), M.ironMatte, lh.x, lampY + 0.5, lh.z, 0, 1.6);
    // 门
    bld.put(G.box(0.2, 0.42, 0.08), M.rustSolid, lh.x + 0.36, baseY + 0.55, lh.z, 0, 1.2);
    bld.build(grp, { outline: true, outlineWidth: 1.0 });

    // 灯
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), new THREE.MeshBasicMaterial({ color: 0xfff0c0 }));
    bulb.position.set(lh.x, lampY, lh.z);
    grp.add(bulb);
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 10), new THREE.MeshBasicMaterial({
      color: 0xffe9a8, transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    halo.position.copy(bulb.position);
    grp.add(halo);
    const pl = new THREE.PointLight(0xffdf9a, 0, 9, 2);
    pl.position.copy(bulb.position);
    grp.add(pl);
    buildings.lamp = { bulb: bulb, halo: halo, light: pl, x: lh.x, y: lampY, z: lh.z };
  };

  /* ---------------- 更新 ---------------- */
  buildings.update = function (t, dt) {
    for (const s of buildings.shafts) s.material.uniforms.uTime.value = t;
    for (const c of buildings.caustics) c.uniforms.uTime.value = t;
    if (buildings.trees) {
      const gust = TY.life ? TY.life.gustAmount : 0;
      for (const tr of buildings.trees) {
        const s = Math.sin(t * 1.15 + tr.phase) * 0.035 + Math.sin(t * 2.4 + tr.phase * 1.7) * 0.016 + gust * 0.11;
        tr.leaves.rotation.z = tr.base + s;
        tr.leaves.rotation.x = s * 0.6;
      }
    }
    if (buildings.lamp) {
      const blink = TY.life ? TY.life.lighthouseBlink : 0;
      buildings.lamp.bulb.material.color.setRGB(1, 0.94 * (0.4 + blink * 0.6), 0.75 * (0.2 + blink * 0.8));
      buildings.lamp.halo.material.opacity = blink * 0.55;
      buildings.lamp.light.intensity = blink * 3.2;
    }
  };

  TY.buildings = buildings;
})();

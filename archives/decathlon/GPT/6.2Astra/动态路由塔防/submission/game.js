let S,
  sel = null,
  choice = null,
  hover = null,
  aim = 0,
  tab = 0,
  modalOn = false,
  demo = null,
  exporting = false,
  fx = [],
  nowNotice = 0,
  stepTick = 0,
  thumbs,
  uid = 0,
  simRand = 1;
function random() {
  simRand = (Math.imul(simRand, 1664525) + 1013904223) >>> 0;
  return simRand / 4294967296;
}
function init(id = 0) {
  let m = maps[id];
  sel = choice = hover = pendingRemoval = null;
  fx = [];
  simRand = 734 + id;
  uid = 0;
  stepTick = 0;
  demo = null;
  exporting = false;
  modalOn = false;
  $("overlay").innerHTML = "";
  $("dragSim").style.display =
    $("context").style.display =
    $("sub").style.display =
    $("cursorSim").style.display =
    $("notice").style.display =
      "none";
  S = {
    map: m,
    mapid: id,
    grid: graph(m),
    wave: 1,
    time: 0,
    elapsed: 0,
    speed: 1,
    paused: false,
    active: false,
    over: false,
    cpu: 180,
    intel: 40,
    core: 100,
    towers: [],
    enemies: [],
    paths: [],
    queue: [],
    logs: [],
    cd: [0, 0, 0],
    killed: 0,
    lost: 0,
    reroutes: 0,
    built: 0,
    warn: null,
    seen: new Set(),
  };
  S.ins = m.ins.map((v) => S.grid[key(...v)]);
  S.outs = m.outs.map((v) => S.grid[key(...v)]);
  S.paths = S.ins.map((c) => path(c));
  board(S);
  let spots = Object.values(S.grid).filter((c) => c.platform);
  for (let [i, p] of [
    [3, m.pref[0]],
    [4, m.pref[1]],
  ]) {
    let c = spots
      .filter((c) => !c.tower)
      .sort((a, b) => dist(a, { x: p[0], z: p[1] }) - dist(b, { x: p[0], z: p[1] }))[0];
    if (c) build(i, c, 0, true);
  }
  log("汐域告警 · 蛰影威胁混入业务流量");
  log("路由收敛，链路连接正常");
  log("守护进程已就绪");
  refresh();
  updateLegend();
  dock(0);
  render();
}
function dist(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
function blocked(c, extra) {
  return !c || !c.road || c.k == extra?.block || extra?.blocks?.has(c.k) || c.lock > S.time || (c.node && c.tower && extra?.open !== c.k);
}
function old(c, extra) {
  return c.old || c.slow > S.time || (extra?.slow && dist(c, extra.slow) <= 2);
}
function path(from, extra, goals = S.outs) {
  if (!from || blocked(from, extra)) return null;
  let q = [from],
    ds = new Map([[from, 0]]),
    prev = new Map();
  while (q.length) {
    q.sort((a, b) => ds.get(b) - ds.get(a));
    let a = q.pop();
    if (goals.includes(a)) {
      let out = [a];
      while (prev.has(a)) {
        a = prev.get(a);
        out.unshift(a);
      }
      return out;
    }
    for (let b of a.adj) {
      if (blocked(b, extra)) continue;
      let d = ds.get(a) + (old(b, extra) ? 1.85 : 1);
      if (d < (ds.get(b) ?? 1e9)) {
        ds.set(b, d);
        prev.set(b, a);
        if (!q.includes(b)) q.push(b);
      }
    }
  }
  return null;
}
function proposal(extra) {
  let ps = S.ins.map((c) => path(c, extra));
  let fail = ps.findIndex((p) => !p);
  if (fail >= 0) return { why: "入口 " + "ABC"[fail] + " 将失去通路", at: S.ins[fail], ps };
  for (let e of S.enemies)
    if (e.t != 4 && (!path(e.cell, extra) || (e.next && (e.next.k === extra.block || extra.blocks?.has(e.next.k)))))
      return { why: "链路 " + (e.next || e.cell).k + " 有在途威胁，无法隔离", at: e, ps };
  return { ps };
}
function converge(msg) {
  let before = S.paths;
  S.paths = S.ins.map((c) => path(c));
  updateLegend();
  let changed = S.paths
    .map((p, i) =>
      p?.map((a) => a.k).join("|") != before[i]?.map((a) => a.k).join("|") ? "ABC"[i] : "",
    )
    .join("");
  for (let e of S.enemies) {
    if (e.t === 4 || !e.next) continue;
    // Compare both ends of the occupied edge before committing the new heading.
    const costFrom = cell => {
      const route = path(cell);
      if (!route) return Infinity;
      return dist(e, cell) + route.slice(1).reduce((sum, tile) => sum + (old(tile) ? 1.85 : 1), 0);
    };
    if (costFrom(e.cell) + .001 < costFrom(e.next)) {
      [e.cell, e.next] = [e.next, e.cell];
    }
  }
  updateRoutes();
  if (choice != null && hover) mark(hover, Boolean(sel));
  else if (pendingRemoval && pendingRemoval.c.tower === pendingRemoval) previewWithdrawal(pendingRemoval);
  if (changed) {
    S.reroutes++;
    log(changed + " 路由已切换");
    if (msg) notice(changed + " 路由收敛 · " + msg);
  }
}
function log(msg) {
  S.logs.unshift([Math.floor(S.time), msg]);
  S.logs.length = Math.min(60, S.logs.length);
}
function notice(msg, d = 3) {
  $("notice").textContent = msg;
  $("notice").style.display = "block";
  nowNotice = S.time + d;
}
function maxHp(t) {
  return t < 6 ? devices[t][4] : 95;
}
function build(t, c, dir = 0, free = false) {
  let obj = deviceArt(t),
    tw = {
      t,
      c,
      x: c.x,
      z: c.z,
      hp: maxHp(t),
      max: maxHp(t),
      level: 1,
      branch: 0,
      obj,
      dir,
      cd: 0,
      skill: 0,
      enc: 0,
      shield: 0,
      age: 0,
      hit: 0,
      spend: free ? 0 : devices[t]?.[3] || 0,
    };
  tw.obj.position.set(c.x, c.road ? 0.15 : 0.2, c.z);
  obj.rotation.y = dir;
  units.add(obj);
  c.tower = tw;
  S.towers.push(tw);
  if (c.node) {
    tw.badge = group(units, c.x, 0.18, c.z);
    for (let j = 0; j < 4; j++) {
      let m = box(tw.badge, 0, 0.08, 0, 1, 0.1, 0.06, orange);
      m.rotation.y = (j * Math.PI) / 2;
      m.position.x = 0.45 * Math.sin(m.rotation.y);
      m.position.z = 0.45 * Math.cos(m.rotation.y);
    }
    converge("节点隔离");
    ripple(c.x, c.z, orange, 1.2);
  }
  if (!free) S.built++;
  return tw;
}
function upgrade(branch) {
  let t = sel?.tower;
  if (!t || t.level >= 2) return;
  let special = t.t == 1 || t.t == 3;
  if (S.cpu < 35 || (special && S.intel < 10))
    return notice("资源不足 · 需要 35 算力" + (special ? " / 10 情报" : ""));
  S.cpu -= 35;
  t.spend += 35;
  if (special) S.intel -= 10;
  t.level = 2;
  t.branch = branch;
  t.hp += t.max * 0.5;
  t.max *= 1.5;
  clearGroup(t.obj);
  t.obj = deviceArt(t.t, 2, branch);
  t.obj.position.set(t.x, t.c.road ? 0.15 : 0.2, t.z);
  t.obj.rotation.y = t.dir;
  units.add(t.obj);
  ripple(t.x, t.z, cyan, 1.4);
  log(devices[t.t][0] + " 升级完成");
  tone(610);
  inspect(t.c);
  refresh();
}
function removeTower(t, refund = false) {
  if (!t.c.tower) return;
  if (refund) clearGroup(t.obj); else retireModel(t.obj,false);
  clearGroup(t.bar);
  clearGroup(t.status);
  clearGroup(t.badge);
  if (pendingRemoval === t) pendingRemoval = null;
  t.c.tower = null;
  S.towers = S.towers.filter((a) => a != t);
  if (refund) S.cpu += Math.floor(t.spend * 0.55);
  if (t.c.node) {
    t.c.reopen = S.time + 6;
    converge("旁路直通");
  }
  if (sel === t.c) {
    sel = null;
    clearPreview();
    panel();
  }
  ripple(t.x, t.z, refund ? cyan : orange, 1.1);
  log((devices[t.t]?.[0] || "隔离器") + (refund ? " 已撤下" : " 已离线"));
}
function ability(t) {
  if (!t || t.enc > 0 || t.skill > 0) return notice("技能尚未就绪");
  if (t.t == 5) {
    for (let a of S.towers)
      if (dist(t, a) <= reach(t)) {
        a.enc = 0;
        a.shield = t.level == 2 ? 100 : 65;
        ray(t, a, 0x36d3ad, 0.035, 0.5);
      }
    ripple(t.x, t.z, green, reach(t));
    log("冗余切换 · 护盾已同步");
  } else if (t.t == 1) {
    for (let e of S.enemies)
      if (e.t != 4 && dist(t, e) <= reach(t)) e.stun = t.level == 2 && !t.branch ? 5 : 3;
    ripple(t.x, t.z, gold, reach(t));
    log("诱捕协议已执行");
  } else return;
  t.skill = 12;
  tone(t.t===1 ? 265 : 620,.23,.065,"triangle");
  tone(t.t===1 ? 396 : 930,.32,.034);
  panel();
}
function reach(t) {
  return (
    (devices[t.t]?.[5] || 0) +
    (t.level == 2 && (t.t == 4 || (t.t == 1 && t.branch) || t.t == 0) ? 0.9 : 0)
  );
}
function applyChoice(c) {
  let why = valid(c);
  if (why) return notice(why);
  let i = choice;
  if (i < 6) {
    S.cpu -= devices[i][3];
    if (c.node) S.intel -= 10;
    build(i, c, aim);
    log(devices[i][0] + " 接入网络");
  } else {
    let j = i - 6;
    if (j == 2) S.cpu -= 30;
    else S.intel -= items[j][3];
    S.cd[j] = [10, 14, 8][j];
    if (j == 0) build(6, c);
    if (j == 1) {
      for (let a of Object.values(S.grid))
        if (a.road && dist(a, c) <= 2) {
          a.slow = S.time + 12;
          if (!a.slowObj) {
            a.slowObj = group(units, a.x, 0.11, a.z);
            for (let j = -1; j <= 1; j++) box(a.slowObj, j * 0.22, 0, 0, 0.05, 0.028, 0.6, gold);
          }
        }
      converge("协议降级");
      ripple(c.x, c.z, orange, 2);
    }
    if (j == 2) {
      c.tower.enc = 0;
      c.tower.hp = Math.min(c.tower.max, c.tower.hp + c.tower.max * 0.5);
      ripple(c.x, c.z, green, 1);
    }
    log(items[j][0] + " 已执行");
  }
  if (i >= 6) {
    const chord = [[225, 338], [415, 277], [520, 780]][i-6];
    tone(chord[0], .25, .08, "triangle"); tone(chord[1], .38, .055);
  } else tone(580);
  cancel();
  inspect(c);
  refresh();
}
function valid(c) {
  if (!c) return "请选择投放位置";
  let i = choice;
  if (i == 8) {
    if (!c.tower) return "请选择己方设备";
  } else if (i == 7) {
    if (blocked(c)) return "协议降级需要可通行链路";
  } else {
    if (c.tower) return "此处已有设备";
    if (i == 2 || i == 6) {
      if (!c.node) return "请选择交换节点";
    } else if (i == 0 || i == 1) {
      if (!c.road || c.entry || c.exit || (i == 1 && c.node)) return "请选择有效链路";
    } else if (!c.platform) return "远程设备需要设备平台";
    if (c.node) {
      if (c.reopen > S.time) return "旁路稳定中 · " + Math.ceil(c.reopen - S.time) + " 秒";
      let p = proposal({ block: c.k });
      if (p.why) return p.why;
    }
    if (c.lock > S.time) return "此链路被锁死";
  }
  if (i >= 6 && S.cd[i - 6] > 0) return "道具冷却中";
  let cpu = i < 6 ? devices[i][3] : i == 8 ? 30 : 0,
    intel = i == 6 ? 15 : i == 7 ? 12 : i < 6 && c.node ? 10 : 0;
  if (S.cpu < cpu || S.intel < intel)
    return "资源不足 · 需要 " + cpu + " 算力 / " + intel + " 情报";
  return "";
}
function wavePlan() {
  let w = S.wave,
    max = Math.min(6, 1 + Math.floor(w / 2)),
    p = [];
  let n = 5 + w * 2 + (S.mapid && w == 9 ? 18 : 0);
  for (let i = 0; i < n; i++) {
    let ent = (i + w - 1) % S.ins.length;
    let t = (i * 7 + Math.floor(i / 3) + w) % max;
    if (w == S.map.waves && i == 2) t = 6 + S.mapid;
    p.push({ t, ent, at: w == 9 && S.mapid ? Math.floor(i / 3) * .78 : i * .88 });
  }
  return p;
}
function startWave() {
  if (S.over || S.active) return;
  S.active = true;
  if(S.wave===9 && S.mapid) notice("洪峰告警 · 三个入口同步接入");
  S.paused = false;
  S.elapsed = 0;
  S.queue = wavePlan();
  log("第 " + pad(S.wave) + " 波流量接入");
  tone(320);
  refresh();
}
function spawn(t, cell, copy = false, entry = 0) {
  let ob = enemyArt(t);
  units.add(ob);
  let hp = [32, 48, 105, 62, 35, 75, 720, 810, 900][t] * (1 + (S.wave - 1) * 0.07);
  let e = {
    id: uid++,
    t,
    x: cell.x,
    z: cell.z,
    cell,
    goal: null,
    plan: null,
    next: null,
    entry,
    obj: ob,
    hp,
    max: hp,
    shield: 0,
    cd: random() * 0.5,
    stun: 0,
    slow: 0,
    copy,
    visible: t != 1 && t != 8,
    phase: 0,
    age: 0,
    hit: 0,
    offset: (random() - 0.5) * 0.16,
  };
  S.enemies.push(e);
  if (t>=6) {ripple(cell.x,cell.z,red,1.25);ripple(cell.x,cell.z,gold,.82,.55);}
  e.obj.position.set(e.x, 0.14, e.z);
  if (!S.seen.has(t)) {
    S.seen.add(t);
    log("威胁识别 · " + threats[t][0]);
    if (t < 6 && !demo) notice("新威胁接入 · " + threats[t][0], 2.5);
    if (t >= 6) {
      notice("高危事件 · " + threats[t][0] + " 已入侵");
      tone(95, 0.5);
    }
  }
  return e;
}
function ripple(x, z, c, r, y = 0.17) {
  let o = tor(units, x, y, z, 1, 0.025, c);
  o.scale.setScalar(.015);
  fx.push({ o, age: 0, ttl: 0.65, r, type: 0 });
}
function ray(a, b, col, width = .03, ttl = .16) {
  const start = [a.x, a.c ? .78 : a.t === 4 ? 1.18 : .38, a.z];
  const end = [b.x, b.c ? .67 : b.t === 4 ? 1.25 : .34, b.z];
  const shell = a.c && a.t === 4;
  const healing = a.c && a.t === 5;
  const ransomware = !a.c && a.t === 3;
  if (shell || healing || ransomware) {
    ttl = shell ? .28 : ttl;
    const arc = shell ? .56 : healing ? .16 : 0;
    let prev = start;
    for (let i = 1; i <= 8; i++) {
      const f = i / 8;
      const pt = start.map((v,k) => v+(end[k]-v)*f);
      pt[1] += Math.sin(Math.PI*f)*arc;
      if (shell || i%2 === 0) {
        const trace = beam(units, prev, pt, width*.48, col);
        fx.push({o:trace, age:0, ttl, type:1});
      }
      prev = pt;
    }
    const packet = group(units, ...start);
    if (healing) {
      box(packet,0,0,0,.18,.058,.052,green);
      box(packet,0,0,0,.058,.18,.052,green);
      packet.quaternion.copy(cam.quaternion);
    } else {
      cyl(packet,0,0,0,.105,.13,shell?cyan:col,4);
      tor(packet,0,.031,0,.105,.016,white);
    }
    fx.push({o:packet,age:0,ttl,type:2,start,end,arc});
  } else {
    const trace = beam(units,start,end,width,col);
    fx.push({o:trace,age:0,ttl,type:1});
    const pulse = cyl(units,...start,width*2.3,.09,0xffefbc,6);
    fx.push({o:pulse,age:0,ttl,type:2,start,end});
  }
}
function bar(a) {
  if (!a.bar) {
    let g = group(units);
    box(g, 0, 0, 0, 0.63, 0.073, 0.016, navy);
    g.userData.icon = new T.Sprite(statusGlyph("shield"));
    g.userData.icon.scale.set(.23,.23,1);g.userData.icon.position.set(.43,.024,.02);g.add(g.userData.icon);
    g.userData.shield = box(g,0,.058,.02,.58,.027,.02,cyan);
    g.userData.fill = box(g, 0, 0, 0.02, 0.58, 0.045, 0.02, a.c ? green : orange);
    a.bar = g;
  }
  let g = a.bar,
    f = a.hp / a.max;
  g.position.set(a.x, a.c ? 1.42 : a.t == 4 ? 1.65 : a.t >= 6 ? 1.85 : 0.83, a.z);
  g.quaternion.copy(cam.quaternion);
  g.userData.fill.scale.x = 0.58 * Math.max(0, f);
  g.userData.fill.position.x = -0.29 * (1 - f);
  const protectedPart=Math.min(1, (a.shield||0)/a.max);
  g.userData.shield.visible=protectedPart>0;
  g.userData.shield.scale.x=.58*protectedPart;
  g.userData.shield.position.x=-.29*(1-protectedPart);
  g.userData.fill.material=mat(a.c?(f<.3?red:green):orange);
  const state=a.enc>0?"lock":a.stun>0?"trap":a.shield>0?"shield":a.slow>0?"slow":a.block?"block":"";
  g.userData.icon.visible=Boolean(state);
  if(state)g.userData.icon.material=statusGlyph(state);
  if(a.hit>.19)g.userData.fill.material=mat(white);
  g.visible=Boolean(state)||a.hp<a.max||a.t>=6||sel===a||sel?.tower===a;
}
function status(a) {
  let color = a.enc > 0 ? 0xaa51c9 : a.shield > 0 ? cyan : a.stun > 0 ? gold : a.block ? orange : 0;
  if (color && !a.status) a.status = tor(units, a.x, 0.55, a.z, 0.41, 0.028, color);
  if (a.status) {
    a.status.visible = !!color;
    a.status.material = mat(color);
    a.status.position.set(a.x, a.t == 4 && !a.c ? 1.25 : 0.35 + Math.sin(S.time * 5) * 0.08, a.z);
  }
}
function hurt(a, n) {
  if (a.hp <= 0) return;
  if (!a.c && a.t===8 && a.phase>0) n/=1.35;
  let sh = Math.min(n, a.shield || 0);
  a.shield -= sh;
  a.hp -= n - sh;
  a.hit = 0.24;
  if (a.hp > 0) return;
  burst(a.x, a.z, a.c ? steel : red);
  if (a.c) removeTower(a);
  else {
    if (a.t == 1 && !a.visible) for (let tw of [...S.towers]) if (dist(tw, a) < 1.7) hurt(tw, 32);
    S.cpu += a.t >= 2 ? 9 : 5;
    if (a.t >= 2) S.intel += 2;
    S.killed++;
    ripple(a.x, a.z, orange, 0.55);
    erase(a);
  }
}
function erase(a) {
  S.enemies = S.enemies.filter((e) => e !== a);
  retireModel(a.obj,a.hp>0);
  clearGroup(a.tether);
  clearGroup(a.bar);
  clearGroup(a.status);
  if (sel === a) {
    sel = null;
    clearPreview();
    panel();
  }
}
function retireModel(model, absorbed) {
  fx.push({o:model, age:0, ttl:.36, type:4, absorbed, initialY:model.position.y, scale:model.scale.x});
}
function effectStep(dt) {
  for (let f of fx) {
    f.age += dt;
    let t = Math.min(1, f.age / f.ttl);
    if (!f.type) f.o.scale.setScalar(Math.max(0.01, t * f.r));
    if (f.type === 4) {
      f.o.scale.setScalar(f.scale*(1-t*t));
      f.o.position.y=f.initialY+(f.absorbed?t*.65:-t*.18);
      if (!f.absorbed) f.o.rotation.z=t*t*.85;
    }
    if (f.type == 3) {
      f.o.position.x += f.vx * dt;
      f.o.position.z += f.vz * dt;
      f.vy -= 6 * dt;
      f.o.position.y += f.vy * dt;
      f.o.rotation.x += dt * 9;
      f.o.rotation.z += dt * 5;
    }
    if (f.type == 2) {
      f.o.position.set(...f.start.map((a, i) => a + (f.end[i] - a) * t));
      f.o.position.y += Math.sin(Math.PI * t) * (f.arc || 0);
    }
    if (t >= 1) clearGroup(f.o);
  }
  fx = fx.filter((f) => f.age < f.ttl);
}
function turnTo(o, y, dt) {
  let d = Math.atan2(Math.sin(y - o.rotation.y), Math.cos(y - o.rotation.y));
  o.rotation.y += d * Math.min(1, dt * 9);
}
function towerStep(a, dt) {
  let r = reach(a);
  a.age += dt;
  a.cd -= dt;
  a.enc = Math.max(0, a.enc - dt);
  a.skill = Math.max(0, a.skill - dt);
  a.hit = Math.max(0, a.hit - dt);
  let head = a.obj.userData.head;
  head.rotation.z = Math.sin(a.hit * 32) * a.hit * 0.35;
  head.rotation.x = (a.recoil || 0) * -0.4;
  a.recoil = Math.max(0, (a.recoil || 0) - dt * 1.6);
  bar(a);
  status(a);
  if (a.t == 6) {
    if (a.age > 12) removeTower(a);
    return;
  }
  if (a.t == 2 && a.level == 2) a.hp = Math.min(a.max, a.hp + 2 * dt);
  if (a.t == 4 && a.enc <= 0)
    for (let e of S.enemies) if (e.t != 4 && dist(a, e) <= r) e.visible = true;
  if (a.enc > 0 || a.cd > 0 || a.t == 2 || a.t == 1) return;
  if (a.t == 5) {
    let list = S.towers
      .filter((b) => a != b && dist(a, b) <= r && b.hp < b.max)
      .sort((b, c) => b.hp / b.max - c.hp / c.max);
    for (let b of list.slice(0, a.level)) {
      b.hp = Math.min(b.max, b.hp + 12);
      a.recoil = .24;
      ray(a, b, green, 0.026, 0.28);
    }
    a.cd = 0.8;
    return;
  }
  let list = S.enemies.filter((e) => dist(a, e) <= r && (e.t != 4 || a.t == 3));
  if (a.t == 3) {
    list = list.filter(
      (e) =>
        e.visible && -(e.z - a.z) * Math.cos(a.dir) - (e.x - a.x) * Math.sin(a.dir) >= -0.00001,
    );
  }
  if (a.t == 4) for (let e of list) e.visible = true;
  if (a.t == 0) list = list.filter((e) => e.block === a);
  list.sort((e, b) => (e.remaining ?? 80) - (b.remaining ?? 80));
  let b = list[0];
  if (!b) return;
  a.recoil = 0.34;
  head.rotation.y = Math.atan2(a.x - b.x, a.z - b.z) - a.dir;
  a.cd = a.t == 4 ? 1.65 : a.t == 0 ? 0.8 : 0.72;
  ray(a, b, [gold, 0, 0, 0x4cabff, 0x54cccd][a.t], a.t == 0 ? 0.066 : 0.038);
  tone(a.t == 4 ? 180 : 480, 0.055, 0.03);
  if (a.t == 4) {
    ripple(b.x, b.z, cyan, a.level == 2 ? 1.35 : 0.93);
    for (let e of [...S.enemies])
      if (e.t != 4 && dist(b, e) < (a.level == 2 ? 1.35 : 0.93)) hurt(e, 15 * a.level);
  } else {
    if (a.t == 3 && a.level == 2) {
      if (a.branch) b.slow = 2;
      else {
        let dx = b.x - a.x,
          dz = b.z - a.z,
          l = Math.hypot(dx, dz) || 1;
        for (let e of [...S.enemies]) {
          let ex = e.x - b.x,
            ez = e.z - b.z;
          if (
            e != b &&
            Math.abs(ex * dz - ez * dx) / l < 0.4 &&
            ex * dx + ez * dz > 0 &&
            dist(e, b) < 1.8
          ) {
            ray(b, e, cyan);
            hurt(e, 16);
          }
        }
      }
    }
    hurt(
      b,
      (a.t == 3 ? 15 : 10) * (a.level == 2 ? 1.5 : 1),
    );
  }
}
function attack(e, t, dmg, col) {
  if (!t || e.cd > 0) return;
  e.cd = e.t == 2 ? 1.05 : 1.25;
  e.strike = .33;
  if (e.t === 2) ripple(t.x,t.z,orange,.64);
  ray(e, t, col, 0.04, 0.24);
  hurt(t, dmg);
  tone(e.t === 3 ? 293 : e.t === 2 ? 73 : 136, e.t === 3 ? .17 : .09, .045, e.t === 3 ? "sawtooth" : "triangle");
}
function boss(e) {
  if (e.t < 6) return;
  let ph = e.hp / e.max;
  if (e.t == 6) {
    if (e.age > 5 && !e.phase) {
      e.phase = 1;
      warn(e, "洪峰冲击", S.towers.find((t) => t.c.node)?.c || e.cell);
    }
    if (ph < 0.6 && !e.split) {
      e.split = true;
      phaseChange(e);
      for (let i = 0; i < 6; i++) spawn(0, e.cell, true);
    }
  } else if (e.t == 7) {
    if (e.age > 4 && !e.phase) {
      e.phase = 1;
      warn(e, "伪路由黑洞");
    }
    if (ph < 0.5 && !e.split) {
      e.split = true;
      phaseChange(e);
      S.towers.filter((t) => dist(t, e) < 4).forEach((t) => (t.shield = 0));
      ripple(e.x, e.z, 0x9559c8, 4);
    }
  } else {
    if ((ph < 0.72 || e.age > 13) && e.phase == 0) {
      e.phase = 1;
      e.visible = true;
      e.obj.scale.setScalar(2.25);
      phaseChange(e);
      spawn(1, e.cell);
      spawn(1, e.cell);
      notice("蛰影提权 · 释放木马");
    }
    if ((ph < 0.4 || e.age > 23) && e.phase == 1) {
      e.phase = 2;
      phaseChange(e);
      warn(e, "运维环锁死");
    }
  }
}
function warn(e, msg, target) {
  let candidates = [...(path(e.cell) || []).slice(1), ...S.paths.flat()].filter(
    (c) => c && !c.exit && !c.entry && !blocked(c),
  );
  let c = target || candidates.find((c) => !proposal({ block: c.k }).why);
  if (!c) return;
  clearGroup(S.warn?.mark);
  let mark = group(units, c.x, 0.17, c.z);
  tor(mark, 0, 0, 0, 0.52, 0.04, red);
  for (let i = 0; i < 4; i++) {
    let a = (i * Math.PI) / 2;
    box(mark, Math.sin(a) * 0.4, 0.4, Math.cos(a) * 0.4, 0.04, 0.8, 0.04, orange);
  }
  let cells = [c];
  if (e.t===6) {
    cells=S.towers.filter(t=>t.c.node).map(t=>t.c);
    for (const tile of cells) if(tile!==c) tor(mark,tile.x-c.x,.025,tile.z-c.z,.52,.04,red);
  }
  if (e.t === 8) {
    const neighbor = c.adj.find(other => !other.entry && !other.exit && !other.tower &&
      !blocked(other) && !proposal({blocks: new Set([c.k, other.k])}).why);
    if (neighbor) {
      cells.push(neighbor);
      tor(mark, neighbor.x - c.x, 0, neighbor.z - c.z, .46, .035, red);
    }
  }
  S.warn = { c, cells, e, msg, mark, at: S.time + 2 };
  ripple(c.x, c.z, red, 1.2);
  notice("预警 · " + msg + " [" + c.k + "]");
  log("预警：" + msg);
}
function enemyStep(e, dt) {
  if (e.hp <= 0) return;
  e.age += dt;
  e.cd -= dt;
  e.stun -= dt;
  e.slow -= dt;
  e.hit = Math.max(0, e.hit - dt);
  let t = e.t;
  e.strike = Math.max(0,(e.strike || 0)-dt);
  e.obj.userData.body.position.z = -.18*Math.sin(Math.PI*e.strike/.33);
  boss(e);
  if (e.obj.userData.body.userData.rotor)
    e.obj.userData.body.userData.rotor.rotation.y = e.age * (1 + e.phase);
  if (t === 1 && old(e.cell)) e.visible = true;
  if (t == 1 && e.visible && !e.shown) {
    e.shown = true;
    e.unmask = 0;
    let bd = e.obj.userData.body;
    for (let s of [-1, 1]) {
      let m = box(bd, s * 0.23, 0.32, 0, 0.09, 0.22, 0.35, red);
      m.rotation.z = s * -0.55;
    }
    cyl(bd, 0, 0.38, 0, 0.12, 0.21, red, 4);
    ripple(e.x,e.z,cyan,.51);
  }
  if (e.shown) {
    e.unmask = Math.min(1, e.unmask+dt*3.5);
    e.obj.userData.body.userData.packet.userData.lids.forEach((lid,j)=>{lid.rotation.z=(j===0?1:-1)*e.unmask*1.35});
  }
  if (t === 2) e.obj.userData.body.userData.ram.position.z=-.29-.15*Math.sin(Math.PI*e.strike/.33);
  let list = S.towers.filter((a) => dist(a, e) <= (t == 3 ? 2.9 : 1.01));
  let lure = S.towers
    .filter((a) => a.t == 1 && dist(a, e) <= reach(a))
    .sort((a, b) => dist(e, a) - dist(e, b))[0];
  if (t == 3 && e.stun <= 0 && list.length) {
    let target = list.find((a) => a.t == 1) || (list.includes(e.block) ? e.block : null) || list.sort((a, b) => dist(e, a) - dist(e, b))[0];
    if (e.cd <= 0) {
      e.obj.userData.body.userData.mount.rotation.y = Math.atan2(e.x-target.x,e.z-target.z)-e.obj.rotation.y;
      if (target.t != 1) target.enc = 2.1;
      attack(e, target, 15, 0xc651ad);
    }
  }
  if (t == 5 && e.stun <= 0 && e.cd <= 0) {
    e.cd = 3.2;
    S.enemies
      .filter((a) => a != e && dist(e, a) < 1.8)
      .forEach((a) => (a.shield = Math.max(a.shield, 18)));
    ripple(e.x, e.z, 0x7cacff, 1.8);
  }
  let gate =
    t == 2
      ? S.towers
          .filter((a) => a.c.node && dist(e, a) < 4.1)
          .sort((a, b) => dist(e, a) - dist(e, b))[0]
      : null;
  let b = e.block;
  if (b && !S.towers.includes(b)) b = null;
  if (!b && t != 4) {
    for (let a of S.towers) {
      if (a.t != 0 && a.t != 1) continue;
      if (dist(e, a) > ((a.c.node ? 1.23 : .62) + (a.t === 0 && a.level === 2 ? .32 : 0))) continue;
      let cap = a.level == 2 && (!a.t || a.branch) ? 4 : 2,
        used = S.enemies.filter((v) => v.block == a).reduce((n, v) => n + (v.t == 2 ? 2 : 1), 0);
      if (cap - used >= (t == 2 ? 2 : 1)) {
        b = a;
        break;
      }
    }
  }
  if (b !== e.tetherTarget) {
    clearGroup(e.tether);
    e.tether = null;
    if (b) {
      e.tether = group(units);
      const near=[e.x,.29,e.z],far=[b.x,.37,b.z];
      for(let i=0;i<3;i++){
        const interp=t=>near.map((v,k)=>v+(far[k]-v)*t);
        beam(e.tether,interp(i/3),interp((i+.56)/3),.029,gold);
      }
    }
    e.tetherTarget=b;
  }
  e.block = b;
  if (b && t === 1) e.visible = true;
  let strike = gate && gate.c.adj.includes(e.cell) && dist(e, gate) <= 1.04 ? gate : b;
  if (strike && e.stun <= 0) {
    attack(e, strike, t == 2 ? 37 : t >= 6 ? 30 : 9, orange);
    turnTo(e.obj, Math.atan2(e.x - strike.x, e.z - strike.z), dt);
  } else if (e.stun <= 0) {
    let goal = gate?.c || (lure && [0, 2, 3].includes(t) ? lure.c : null);
    if (!e.next) {
      let goals = gate ? gate.c.adj.filter((a) => !blocked(a)) : goal ? [goal] : S.outs;
      let p = path(e.cell, null, goals);
      if (!p || (p.length < 2 && !e.cell.exit)) p = path(e.cell);
      e.remaining = (goal ? path(e.cell) : p)?.length || 1;
      e.next = t == 4 ? S.outs.slice().sort((a, b) => dist(a, e) - dist(b, e))[0] : p?.[1];
      e.remaining = t == 4 ? dist(e, e.next) : e.remaining - 1;
    }
    let next = e.next;
    if (S.warn && S.warn.e.t!==6 && S.warn.cells.includes(next) && t != 4) {
      e.next = null;
      next = null;
    }
    if (next) {
      let dx = next.x - e.x,
        dz = next.z - e.z,
        l = Math.hypot(dx, dz),
        v =
          [0.91, 0.9, 0.74, 0.68, 1.19, 0.7, 0.49, 0.55, 0.51][t] *
          (t != 4 && old(e.cell) ? 0.54 : 1) *
          (e.slow > 0 ? 0.53 : 1) *
          dt;
      turnTo(e.obj, Math.atan2(-dx, -dz), dt);
      if (l <= v) {
        e.x = next.x;
        e.z = next.z;
        e.cell = next;
        e.next = null;
        if (next.exit) {
          S.core = Math.max(0, S.core - (t >= 6 ? 24 : t == 2 ? 5 : 3));
          S.lost++;
          ripple(next.x, next.z, red, 1.15, .39);
          erase(e);
          log("中枢告警 · 流量穿透");
          tone(100);
          if (!S.core) finish(false);
          return;
        }
        if (next.node && t == 0 && !e.copy) {
          e.copy = true;
          spawn(0, next, true, e.entry);
          ripple(e.x, e.z, gold, 0.45);
        }
      } else {
        e.remaining = Math.max(0, (e.remaining ?? l) - v);
        e.x += (dx / l) * v;
        e.z += (dz / l) * v;
      }
    }
  }
  let walk = e.age * (b ? 12 : 8) + e.id;
  e.obj.position.set(
    e.x + e.offset,
    t == 4 ? 1.05 + Math.sin(walk * 0.4) * 0.12 : 0.13 + Math.abs(Math.sin(walk)) * 0.03 + (t>=6?1.1*Math.max(0,1-e.age/.72)**2:0),
    e.z,
  );
  e.obj.userData.body.rotation.x = e.hit * Math.sin(e.hit * 35) + (b ? Math.sin(walk) * 0.13 : 0);
  e.obj.userData.limbs.forEach(
    (o, i) => (o.rotation.z = Math.sin(walk + i * 1.6) * (t == 4 ? 0.2 : 0.21)),
  );
  bar(e);
  status(e);
}
function step(dt) {
  if (S.over) return;
  S.time += dt;
  S.cd = S.cd.map((v) => Math.max(0, v - dt));
  let dirty = false;
  for (let c of Object.values(S.grid)) {
    if (c.slow && c.slow <= S.time) {
      c.slow = 0;
      clearGroup(c.slowObj);
      c.slowObj = null;
      dirty = true;
    }
    if (c.lock && c.lock <= S.time) {
      c.lock = 0;
      clearGroup(c.lockObj);
      dirty = true;
    }
  }
  if (dirty) converge("协议恢复");
  if (S.warn) S.warn.mark.position.y=.17+Math.sin(S.time*10)*.05;
  if (S.warn && S.time >= S.warn.at) {
    let { c, e, msg, cells } = S.warn;
    clearGroup(S.warn.mark);
    S.warn = null;
    if (e.t == 6) {
      for (let t of [...S.towers]) if (t.c.node) { hurt(t, t.t===6 ? t.hp+t.shield : 150); ripple(t.x,t.z,orange,1); }
    } else if (!proposal({ blocks: new Set(cells.map(cell => cell.k)) }).why) {
      for (const cell of cells) {
        cell.lock = S.time + 9;
        cell.lockObj = group(units, cell.x, .14, cell.z);
        if (e.t === 7) {
          cyl(cell.lockObj, 0, .03, 0, .44, .05, 0x221d36, 20);
          for (let i = 0; i < 3; i++) tor(cell.lockObj, 0, .06+i*.045, 0, .38-i*.095, .025, 0xaf59bc);
        } else {
          for (const side of [-1,1]) box(cell.lockObj,side*.39,.22,0,.13,.44,.3,navy);
          for (let i=0; i<4; i++) box(cell.lockObj,-.27+i*.18,.29,0,.16,.17,.18,i%2?black:orange);
        }
      }
      converge(msg);
    } else warn(e, msg);
    ripple(c.x, c.z, red, 1.5);
  }
  if (S.active) {
    S.elapsed += dt;
    S.cpu += dt * 0.72;
    S.intel += dt * 0.19 * S.towers.filter((t) => t.c.node && t.t != 6).length;
    while (S.queue.length && S.queue[0].at <= S.elapsed) {
      let a = S.queue.shift();
      spawn(a.t, S.ins[a.ent], false, a.ent);
    }
  }
  for (let e of [...S.enemies]) enemyStep(e, dt);
  for (let t of [...S.towers]) towerStep(t, dt);
  effectStep(dt);
  if (S.active && !S.enemies.length && !S.queue.length && !demo) {
    S.active = false;
    S.intel += 8;
    S.cpu += 32;
    log("清除完成 · 回收 32 算力");
    if (S.wave == S.map.waves) finish(true);
    else S.wave++;
    refresh();
  }
  if (nowNotice < S.time) $("notice").style.display = "none";
  if ((stepTick += dt) > 0.23) {
    stepTick = 0;
    refresh();
    if (sel) panel();
  }
}

function burst(x, z, col) {
  for (let i = 0; i < 7; i++) {
    let o = box(units, x, 0.36, z, 0.06 + random() * 0.06, 0.07, 0.07, i % 2 ? col : orange);
    fx.push({
      o,
      age: 0,
      ttl: 0.5,
      type: 3,
      vx: (random() - 0.5) * 2.3,
      vz: (random() - 0.5) * 2.3,
      vy: 1 + random() * 1.8,
    });
  }
}
function phaseChange(e) {
  let g = e.obj.userData.body;
  for (let j = 0; j < 4; j++) {
    let a = (j * Math.PI) / 2,
      k = cyl(
        g,
        Math.sin(a) * 0.25,
        0.46,
        Math.cos(a) * 0.25,
        0.025,
        0.51,
        e.phase == 2 ? gold : red,
        4,
        0.093,
      );
    k.rotation.x = Math.cos(a) * 0.6;
    k.rotation.z = -Math.sin(a) * 0.6;
  }
  ripple(e.x, e.z, 0xa84089, 1.9);
  tone(75, 0.45, 0.12, "triangle");
}

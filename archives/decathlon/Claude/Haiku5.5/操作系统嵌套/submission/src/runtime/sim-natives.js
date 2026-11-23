'use strict';
/*
 * 飞行物理库（进程可调用的原生计算）。
 *
 * 直升机是一个简化的刚体：位置、速度、偏航/俯仰/横滚角与角速度，旋翼转速，
 * 总距与周期变距由飞控程序写入（经内核的消息），地面与障碍物的接触由地形网格和长方体给出。
 * 每个固定子步（1/120 秒）按规模计费；预算不足时停在已完成的子步上，之后从那里继续。
 *
 * 事件日志：输入（控制、风、航向、故障、目标）按虚拟时间记录；回放时按同样的时刻重新施加，结果相同。
 */

const G = 9.81;
const SUB = 1 / 120;          // 固定子步（秒）
const COST_STEP = 40;         // 每个子步计费（单位）
const CHECK_EVERY = 1;        // 检查点间隔（秒）

const scenes = new Map();     // 场景键 -> 预处理后的场景

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

// 解析场景文本（JSON），预计算地形采样参数。
function prepareScene(obj) {
  const t = obj.terrain;
  const n = t.n;
  return {
    name: obj.name,
    env: obj.env || {},
    terrain: { x0: t.x0, z0: t.z0, size: t.size, n, h: t.heights, step: t.size / (n - 1) },
    pads: obj.helipads || [],
    boxes: obj.obstacles || [],
    trees: obj.trees || [],
    heli: obj.heli || {},
    start: obj.start,
    record: obj.record || { events: [], duration: 15 },
    camera: obj.camera || {},
    parts: obj.parts || {},
  };
}

function terrainH(sc, x, z) {
  const T = sc.terrain;
  let fx = (x - T.x0) / T.step;
  let fz = (z - T.z0) / T.step;
  const maxI = T.n - 1;
  fx = clamp(fx, 0, maxI - 0.0001);
  fz = clamp(fz, 0, maxI - 0.0001);
  const i = Math.floor(fx), j = Math.floor(fz);
  const u = fx - i, v = fz - j;
  const h = T.h;
  const a = h[j * T.n + i], b = h[j * T.n + i + 1];
  const c = h[(j + 1) * T.n + i], d = h[(j + 1) * T.n + i + 1];
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

function inBox(sc, x, y, z, r) {
  for (const b of sc.boxes) {
    const ex = b.sx / 2 + r, ey = b.sy / 2 + r, ez = b.sz / 2 + r;
    const dx = x - b.x, dz = z - b.z;
    // 绕竖直轴旋转的长方体
    const c = Math.cos(-(b.rot || 0)), s = Math.sin(-(b.rot || 0));
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    if (Math.abs(lx) < ex && Math.abs(lz) < ez && y < b.y + b.sy + r && y > b.y - r) return b;
  }
  return null;
}

// 旋翼推力方向（机体向上）与前向、右向
function axes(st) {
  const sy = Math.sin(st.yaw), cy = Math.cos(st.yaw);
  const sp = Math.sin(st.pitch), cp = Math.cos(st.pitch);
  const sr = Math.sin(st.roll), cr = Math.cos(st.roll);
  const right = [cy, 0, -sy];
  const upP = [-sp * sy, cp, -sp * cy];
  const up = [cr * upP[0] + sr * right[0], cr * upP[1] + sr * right[1], cr * upP[2] + sr * right[2]];
  return { right, up };
}

function ctlOf(st) {
  return st.ctl;
}

// 一个子步的物理推进（就地修改 st）
function substep(st, sc) {
  const dt = SUB;
  const m = 1;
  const alive = !st.crashed;
  const ctl = ctlOf(st);
  // 旋翼转速
  const engineOk = !st.engineOut;
  const omegaT = engineOk && st.rotorHealth > 0 ? 1 : (st.crashed ? 0 : 0.0);
  st.omega += (omegaT - st.omega) * Math.min(1, dt * (st.crashed ? 0.8 : 1.6));
  if (st.omega < 0) st.omega = 0;

  const c = alive ? clamp(ctl.c, 0, 1) : 0;
  // 总推力：悬停约在总距 0.5
  const thrustMax = m * G / (0.35 + 0.65 * 0.5);
  const T = thrustMax * st.omega * st.omega * (0.35 + 0.65 * c) * st.rotorHealth;

  // 姿态目标
  const lon = alive ? clamp(ctl.lon, -1, 1) : 0;
  const lat = alive ? clamp(ctl.lat, -1, 1) : 0;
  const thT = lon * 0.35, phT = lat * 0.35;
  const k = st.crashed ? 0 : 1;
  st.pitchRate += (k * 14 * (thT - st.pitch) - 7 * st.pitchRate + 0.55 * st.pitch) * dt;
  st.rollRate += (k * 14 * (phT - st.roll) - 7 * st.rollRate + 0.55 * st.roll) * dt;
  st.pitch += st.pitchRate * dt;
  st.roll += st.rollRate * dt;
  st.pitch = clamp(st.pitch, -1.4, 1.4);
  st.roll = clamp(st.roll, -1.4, 1.4);

  // 偏航：尾桨控制，故障时尾桨无效并产生偏转力矩
  let tail = alive ? clamp(ctl.tail, -1, 1) : 0;
  if (st.tailFault) tail = 0;
  const spin = st.tailFault ? 6.0 : 0;
  st.yawRate += ((tail * 2.2 - 1.2 * st.yawRate) + spin - 0.4 * st.yawRate * (st.tailFault ? 0 : 1)) * dt * (st.crashed ? 0.3 : 1);
  st.yaw += st.yawRate * dt;

  // 力：推力、重力、阻力（相对空气的速度）
  const ax_ = axes(st);
  const w = st.wind;
  const rvx = st.vx - w[0], rvy = st.vy, rvz = st.vz - w[1];
  const drag = 0.22;
  let ax = (T * ax_.up[0] - drag * rvx) / m;
  let ay = (T * ax_.up[1] - m * G - drag * rvy) / m;
  let az = (T * ax_.up[2] - drag * rvz) / m;
  if (st.crashed) { ax = -drag * st.vx / m * 0; ay = -G; az = 0; }

  st.vx += ax * dt;
  st.vy += ay * dt;
  st.vz += az * dt;
  st.x += st.vx * dt;
  st.y += st.vy * dt;
  st.z += st.vz * dt;

  // 地面接触（起落架高度 0.6 m）
  const gh = terrainH(sc, st.x, st.z);
  const skid = 0.6;
  if (st.y < gh + skid) {
    const impact = -st.vy;
    const tilt = Math.max(Math.abs(st.pitch), Math.abs(st.roll));
    st.y = gh + skid;
    if (!st.crashed) {
      if (impact > 2.6 || tilt > 0.6 || Math.abs(st.yawRate) > 2.6 && impact > 0.8 || st.rotorHealth < 1 && impact > 1.2) {
        crash(st, sc, 'ground');
      } else {
        st.vy = Math.max(0, st.vy) * 0;
        st.vx *= Math.max(0, 1 - 6 * dt);
        st.vz *= Math.max(0, 1 - 6 * dt);
        st.onGround = true;
      }
    } else {
      st.vy = -st.vy * 0.25;
      st.vx *= 0.85;
      st.vz *= 0.85;
      if (Math.abs(st.vy) < 0.15) st.vy = 0;
    }
  } else {
    st.onGround = false;
  }
  if (st.crashed && st.y <= gh + 0.3) {
    st.vy = 0;
    st.vx *= 0.9;
    st.vz *= 0.9;
  }

  // 障碍物（长方体）
  if (!st.crashed) {
    const hit = inBox(sc, st.x, st.y, st.z, 1.4);
    if (hit) {
      crash(st, sc, 'box:' + (hit.id || 'obstacle'));
    }
  }

  // 尾桨故障导致的失控：偏航很快时立即视为坠毁
  if (!st.crashed && Math.abs(st.yawRate) > 4.5) {
    crash(st, sc, 'spin');
  }

  st.t += dt;
  // 速度太大的爆炸式坠毁后限制数值
  if (st.crashed && !st.crashPos) st.crashPos = [st.x, st.y, st.z];
}

function crash(st, sc, why) {
  if (st.crashed) return;
  st.crashed = true;
  st.crashT = st.t;
  st.crashWhy = why;
  st.crashPos = [st.x, Math.max(st.y, terrainH(sc, st.x, st.z)), st.z];
  st.crashVel = [st.vx, st.vy, st.vz];
  st.rotorHealth = Math.min(st.rotorHealth, 0.25);
}

function applyEvent(st, ev) {
  // ev: [t, kind, value]
  const kind = ev[1];
  const v = ev[2];
  if (kind === 'ctl') {
    st.ctl = { c: Number(v.c), lon: Number(v.lon), lat: Number(v.lat), tail: Number(v.tail) };
  } else if (kind === 'wind') {
    st.wind = [Number(v[0]), Number(v[1])];
  } else if (kind === 'target') {
    st.target = [Number(v[0]), Number(v[1])];
  } else if (kind === 'fault') {
    if (v === 'tail') st.tailFault = true;
    else if (v === 'engine') st.engineOut = true;
    else if (v === 'rotor') st.rotorHealth = Math.min(st.rotorHealth, 0.6);
    else if (v === 'clear') { st.tailFault = false; st.engineOut = false; }
  } else if (kind === 'engine') {
    st.engineOut = !!v;
  }
}

function newState(sc) {
  const s = sc.start;
  return {
    t: 0,
    x: s.pos[0], y: s.pos[1], z: s.pos[2],
    vx: 0, vy: 0, vz: 0,
    yaw: s.yaw || 0, pitch: 0, roll: 0,
    yawRate: 0, pitchRate: 0, rollRate: 0,
    omega: 0,
    ctl: { c: 0, lon: 0, lat: 0, tail: 0 },
    wind: [...(sc.env.wind || [0, 0])],
    target: s.target ? [...s.target] : [0, 0],
    tailFault: false, engineOut: false, rotorHealth: 1,
    crashed: false, crashT: -1, crashWhy: '', crashPos: null, crashVel: null,
    onGround: true,
    ei: 0,          // 下一个待施加的预设事件
    log: [],        // 已施加的输入事件（回放用）
    cps: [],        // 检查点 [{t, st}]
    lastCp: -1,
  };
}

// 施加事件（实时输入与预设事件共用）：记录到日志
function inject(st, ev) {
  applyEvent(st, ev);
  st.log.push(ev);
}

// 推进到目标时刻（预算与子步数限制）。返回执行的子步数。
function runTo(st, sc, target, vm) {
  let steps = 0;
  const ev = st.evs || sc.record.events;
  const budget = vm && vm.meter ? vm.meter : null;
  while (st.t + 1e-9 < target) {
    if (budget && budget.left < COST_STEP) break;
    // 预设事件按时刻施加（只在预设模式下使用）
    while (st.ei < ev.length && ev[st.ei][0] <= st.t + 1e-9) {
      if (st.preset) { applyEvent(st, ev[st.ei]); st.log.push(ev[st.ei]); }
      st.ei++;
    }
    substep(st, sc);
    steps++;
    if (budget) budget.left -= COST_STEP;
    if (st.t - st.lastCp >= CHECK_EVERY - 1e-9) {
      st.lastCp = st.t;
      st.cps.push({ t: st.t, st: snapshotState(st) });
    }
  }
  return steps;
}

function snapshotState(st) {
  const out = {};
  for (const k of Object.keys(st)) {
    if (k === 'cps' || k === 'log' || k === 'evs') continue;
    const v = st[k];
    out[k] = Array.isArray(v) ? v.slice() : (v && typeof v === 'object' ? { ...v } : v);
  }
  return out;
}

// 读取某时刻之前最近的检查点并复制
function seekState(st, sc, target) {
  let base = null;
  for (const cp of st.cps) if (cp.t <= target + 1e-9) base = cp;
  const fresh = base ? base.st : null;
  const next = fresh ? restoreFrom(fresh) : newStateFromScene(sc);
  next.cps = st.cps.filter((c) => c.t <= (base ? base.t : -1) + 1e-9);
  next.lastCp = next.cps.length ? next.cps[next.cps.length - 1].t : -1;
  // 检查点之后的输入日志保留（回放时按时刻重施）
  next.log = st.log.filter((e) => e[0] <= (base ? base.t : 0) + 1e-9);
  next.preset = st.preset;
  next.evs = st.evs;
  next.ei = 0;
  const ev = st.evs || sc.record.events;
  while (next.ei < ev.length && ev[next.ei][0] <= next.t + 1e-9) next.ei++;
  return next;
}

function restoreFrom(s) {
  const r = {};
  for (const k of Object.keys(s)) r[k] = Array.isArray(s[k]) ? s[k].slice() : (s[k] && typeof s[k] === 'object' ? { ...s[k] } : s[k]);
  r.cps = [];
  r.log = [];
  return r;
}

function newStateFromScene(sc) {
  const st = newState(sc);
  st.preset = false;
  return st;
}

// 传感器：飞控程序读取的带时间戳的测量值（不含真值以外的信息）
function sense(st, sc) {
  const gh = terrainH(sc, st.x, st.z);
  return {
    t: st.t,
    alt: st.y - gh,
    x: st.x, y: st.y, z: st.z,
    vx: st.vx, vy: st.vy, vz: st.vz,
    pitch: st.pitch, roll: st.roll, yaw: st.yaw,
    yawRate: st.yawRate,
    rotor: st.omega * st.rotorHealth,
    tgtX: st.target[0], tgtZ: st.target[1],
    crashed: st.crashed,
    onGround: st.onGround,
  };
}

// 渲染用状态：三维视图需要的最小数据
function renderState(st, sc) {
  const gh = terrainH(sc, st.x, st.z);
  return {
    t: st.t,
    p: [st.x, st.y, st.z],
    yaw: st.yaw, pitch: st.pitch, roll: st.roll,
    rotor: st.omega * st.rotorHealth,
    crashed: st.crashed,
    crashT: st.crashT,
    crashPos: st.crashPos,
    crashVel: st.crashVel,
    crashWhy: st.crashWhy,
    gh,
    wind: st.wind,
    tailFault: st.tailFault,
    engineOut: st.engineOut,
    yawRate: st.yawRate,
    alt: st.y - gh,
    vy: st.vy,
    speed: Math.hypot(st.vx, st.vy, st.vz),
    ctl: { ...st.ctl },
    target: st.target,
    rotorHealth: st.rotorHealth,
  };
}

// 场景按文本缓存（字符串按引用传递，不复制），进程快照恢复后仍可直接使用
function sceneOf(text) {
  let sc = scenes.get(text);
  if (!sc) {
    let obj;
    try { obj = JSON.parse(text); } catch (e) { throw new Error('场景文件格式错误：' + e.message); }
    if (!obj || !obj.terrain || !obj.start) throw new Error('场景缺少地形或起点');
    sc = prepareScene(obj);
    scenes.set(text, sc);
  }
  return sc;
}

function makeNatives() {
  return {
    // 检查场景并返回摘要（名称、时长、停机坪、是否带预置记录）
    sim_scene(a) {
      const sc = sceneOf(String(a[0]));
      return { name: sc.name, duration: sc.record.duration || 15, pads: sc.pads, hasRecord: sc.record.events.length > 0, boxes: sc.boxes.length, camera: sc.camera, env: sc.env, heli: sc.heli };
    },
    // 新建模拟状态。preset=true 时按场景预置的记录施加输入（默认演出）。
    sim_new(a) {
      const sc = sceneOf(String(a[0]));
      const st = newState(sc);
      st.preset = !!a[1];
      if (Array.isArray(a[2])) st.evs = a[2];
      return st;
    },
    // 推进到目标时刻；返回本次执行的子步数（预算不足时可能少于应有值）
    sim_run(a, vm) {
      const sc = sceneOf(String(a[0]));
      return runTo(a[1], sc, Number(a[2]), vm);
    },
    // 施加一条实时输入（记录到日志）
    sim_input(a) {
      inject(a[0], a[1]);
      return true;
    },
    // 回到目标时刻之前最近的检查点，返回复制的新状态（输入日志随之截断）
    sim_seek(a) {
      const sc = sceneOf(String(a[0]));
      return seekState(a[1], sc, Number(a[2]));
    },
    sim_sense(a) {
      return sense(a[1], sceneOf(String(a[0])));
    },
    sim_render(a) {
      return renderState(a[1], sceneOf(String(a[0])));
    },
    sim_log(a) {
      return a[0].log.slice();
    },
    sim_ground(a) {
      return terrainH(sceneOf(String(a[0])), Number(a[1]), Number(a[2]));
    },
  };
}

module.exports = { makeNatives, prepareScene, terrainH, substep, newState, runTo, applyEvent, scenes, sceneOf, SUB, G };

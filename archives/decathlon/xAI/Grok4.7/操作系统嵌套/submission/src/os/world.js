// 系统树、预算、文件、快照与内核宿主调用。
// 根系统的调度在这里实现；子系统的调度在内核程序里。

import { compile, makeProc, step, resume, snapshotProc, restoreProc, recountMem, cloneVal } from "../nest/nest.js";
import { createWorkbook, loadWorkbook, serializeWorkbook, setRaw, commit, undo, redo, rangeMatrix, recalc } from "./sheet.js";

export const TICK_MS = 50;

const TEXT = {
  kernel: "/Programs/kernel.npl",
  compiler: "/Programs/compiler.npl",
};

export function createWorld(presetFiles) {
  const world = {
    presets: presetFiles,
    nextInner: 1,
    pool: 520000,
    tickN: 0,
    compilerProgram: null,
    subs: [],
    projections: [],
    nextProj: 1,
    sheetSeq: 1,
    heldBoot: [],
    browsers: [],
    rootWindows: [],
    clipboard: [],
    notifications: [],
    dnd: false,
    settings: {
      name: "巢航",
      wallpaper: "dusk-mesa",
      accent: "#e39b3a",
      scale: 1,
    },
    widgets: {
      note: "",
      timerLeft: 0,
      timerSet: 0,
      timerRun: false,
      stopwatch: 0,
      stopRun: false,
      calYear: 0,
      calMonth: 0,
    },
  };
  const now = new Date();
  world.widgets.calYear = now.getFullYear();
  world.widgets.calMonth = now.getMonth();
  world.compilerProgram = bootstrapCompiler(world);
  const outer = makeSystem(world, { id: "outer", name: "巢航", parent: null });
  outer.clock = Date.now();
  seedFiles(outer, "outer");
  writeCompilerNbc(outer, world.compilerProgram);
  world.outer = outer;
  world.books = [];
  const sample = presetFiles["/Demo/sample.sheet"];
  if (sample) {
    const wb = loadWorkbook(JSON.parse(sample), "/Demo/sample.sheet");
    wb.dirty = false;
    world.books.push(wb);
  }
  return world;
}

function bootstrapCompiler(world) {
  const src = world.presets[TEXT.compiler];
  if (!src) throw new Error("缺少编译器源文件");
  const js = compile(src);
  if (!js.ok) throw new Error(js.errors.join("\n"));
  const proc = makeProc(js.program, "bootstrap-compiler");
  let guard = 0;
  while (proc.status !== "halt" && proc.status !== "error" && guard++ < 200000) {
    const r = step(proc, 100000);
    if (r.reason === "trap") {
      if (r.name === "read_in") resume(proc, src);
      else resume(proc, null);
    }
  }
  if (proc.status === "halt" && proc.result && proc.result.ok && proc.result.program) return proc.result.program;
  return js.program;
}

function writeCompilerNbc(sys, program) {
  sys.files.set("/Programs/compiler.nbc", JSON.stringify(program));
}

export function makeSystem(world, { id, name, parent }) {
  const sys = {
    world, id, name, parent,
    children: [],
    clock: parent ? parent.clock : Date.now(),
    rate: 1,
    paused: false,
    state: "running",
    kernelError: null,
    budgetCap: parent ? 420000 : 520000,
    grantCap: parent ? 320000 : 420000,
    memQuota: 256 * 1024 * 1024,
    storageQuota: 48 * 1024 * 1024,
    cap: parent ? 320000 : 520000,
    taken: 0,
    tickKernel: 0,
    tickInternal: 0,
    totalKernel: 0,
    totalInternal: 0,
    files: new Map(),
    dirs: new Set(["/", "/Documents", "/Downloads", "/Demo", "/Programs", "/Recycle", "/Snapshots", "/Systems", "/Desktop"]),
    procs: new Map(),
    nextPid: 1,
    kernelProc: null,
    kernelPath: null,
    input: [],
    bridge: [],
    held: [],
    frame: null,
    scenes: Object.create(null),
    gpuBytes: 0,
    published: Object.create(null),
    logs: [],
    bootJob: null,
    compileJob: null,
    compileQueue: [],
    mail: new Map(),
    rng: 123456789,
    stepOnce: false,
    chartHold: false,
    carrierPid: null,
    kernelSrcHash: "",
  };
  for (const d of sys.dirs) ensureDir(sys, d);
  return sys;
}

function seedFiles(sys, kind) {
  const presets = sys.world.presets;
  for (const [path, content] of Object.entries(presets)) {
    if (kind !== "outer" && path === "/Demo/sample.sheet") continue;
    writeFileDirect(sys, path, content);
  }
  if (!sys.files.has("/Documents/欢迎.txt")) {
    writeFileDirect(sys, "/Documents/欢迎.txt", "这是「巢航」的文件。可以把文件在各层桌面之间拖动，得到一份独立副本。\n");
  }
  if (!sys.files.has("/Downloads/说明.txt")) {
    writeFileDirect(sys, "/Downloads/说明.txt", "下载目录。从本机导入的文件可以放在这里。\n");
  }
  writeFileDirect(sys, "/Programs/readme.txt", "程序、内核、飞控与场景都在这个文件系统里。操作说明见桌面「操作说明」。\n");
}

function ensureDir(sys, path) {
  if (!path || path === "/") { sys.dirs.add("/"); return; }
  const parts = path.split("/").filter(Boolean);
  let cur = "";
  for (const p of parts) {
    cur += "/" + p;
    sys.dirs.add(cur);
  }
}

function parentDir(path) {
  const i = path.lastIndexOf("/");
  if (i <= 0) return "/";
  return path.slice(0, i);
}

function baseName(path) {
  const i = path.lastIndexOf("/");
  return path.slice(i + 1);
}

export function writeFileDirect(sys, path, content) {
  if (!path.startsWith("/")) return { error: "路径无效" };
  const data = String(content ?? "");
  const prev = sys.files.get(path);
  const used = storageUsed(sys) - (prev ? prev.length : 0) + data.length;
  if (used > sys.storageQuota) return { error: "存储配额不足" };
  ensureDir(sys, parentDir(path));
  sys.files.set(path, data);
  return { ok: true, bytes: data.length };
}

export function storageUsed(sys) {
  let n = 0;
  for (const v of sys.files.values()) n += v.length;
  return n;
}

export function listDir(sys, path) {
  const dir = path === "" ? "/" : path;
  if (dir !== "/" && !sys.dirs.has(dir) && !hasChild(sys, dir)) return { error: "没有这个目录", entries: [] };
  const entries = [];
  const prefix = dir === "/" ? "/" : dir + "/";
  const seen = new Set();
  for (const p of sys.files.keys()) {
    if (!p.startsWith(prefix)) continue;
    const rest = p.slice(prefix.length);
    if (!rest || rest.includes("/")) continue;
    seen.add(rest);
    entries.push({ name: rest, path: p, kind: "file", size: sys.files.get(p).length });
  }
  for (const d of sys.dirs) {
    if (d === dir || d === "/") continue;
    if (!d.startsWith(prefix)) continue;
    const rest = d.slice(prefix.length);
    if (!rest || rest.includes("/")) continue;
    if (seen.has(rest)) continue;
    seen.add(rest);
    entries.push({ name: rest, path: d, kind: "dir", size: 0 });
  }
  entries.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name, "zh") : a.kind === "dir" ? -1 : 1));
  return { error: null, entries };
}

function hasChild(sys, dir) {
  const prefix = dir === "/" ? "/" : dir + "/";
  for (const p of sys.files.keys()) if (p.startsWith(prefix)) return true;
  for (const d of sys.dirs) if (d.startsWith(prefix)) return true;
  return sys.dirs.has(dir);
}

export function readFile(sys, path) {
  if (sys.dirs.has(path) && !sys.files.has(path)) return { error: "这是目录", data: null };
  if (!sys.files.has(path)) return { error: "文件不存在", data: null };
  return { error: null, data: sys.files.get(path) };
}

export function removePath(sys, path, { recycle = false } = {}) {
  if (path === "/" || path === "/Recycle") return { error: "不能删除该位置" };
  const isDir = sys.dirs.has(path) && !sys.files.has(path);
  if (!isDir && !sys.files.has(path)) {
    // 目录可能既在 dirs 也含文件
    if (!sys.dirs.has(path)) return { error: "不存在" };
  }
  if (recycle && !path.startsWith("/Recycle")) {
    const stamp = Math.floor(sys.clock || Date.now());
    const dest = "/Recycle/" + baseName(path) + "." + stamp;
    const meta = { from: path, at: stamp };
    if (sys.files.has(path)) {
      writeFileDirect(sys, dest, sys.files.get(path));
      writeFileDirect(sys, dest + ".meta", JSON.stringify(meta));
      sys.files.delete(path);
    } else {
      // 目录：逐个移动
      const kids = [...sys.files.keys()].filter((p) => p === path || p.startsWith(path + "/"));
      for (const k of kids) {
        const rel = k.slice(path.length);
        writeFileDirect(sys, dest + rel, sys.files.get(k));
        sys.files.delete(k);
      }
      writeFileDirect(sys, dest + ".meta", JSON.stringify(meta));
    }
    return { ok: true, recycled: dest };
  }
  const keys = [...sys.files.keys()].filter((p) => p === path || p.startsWith(path + "/"));
  for (const k of keys) sys.files.delete(k);
  for (const d of [...sys.dirs]) if (d === path || d.startsWith(path + "/")) sys.dirs.delete(d);
  return { ok: true };
}

export function movePath(sys, from, to) {
  const r = readFile(sys, from);
  if (r.error) return r;
  const w = writeFileDirect(sys, to, r.data);
  if (w.error) return w;
  sys.files.delete(from);
  return { ok: true };
}

export function copyAcross(fromSys, fromPath, toSys, toPath, { overwrite = false } = {}) {
  const r = readFile(fromSys, fromPath);
  if (r.error) return r;
  if (toSys.files.has(toPath) && !overwrite) return { error: "已存在", needOverwrite: true };
  // 副本是独立字符串
  const w = writeFileDirect(toSys, toPath, r.data);
  if (w.error) return w;
  const cost = r.data.length;
  return { ok: true, bytes: cost, data: r.data };
}

export function restoreRecycle(sys, recyclePath) {
  const metaPath = recyclePath + ".meta";
  const metaRaw = sys.files.get(metaPath);
  if (!metaRaw) return { error: "没有原始位置信息" };
  let meta;
  try { meta = JSON.parse(metaRaw); } catch { return { error: "回收信息损坏" }; }
  const data = sys.files.get(recyclePath);
  if (data == null) return { error: "文件不存在" };
  let dest = meta.from;
  if (sys.files.has(dest)) dest = meta.from + ".restored";
  const w = writeFileDirect(sys, dest, data);
  if (w.error) return w;
  sys.files.delete(recyclePath);
  sys.files.delete(metaPath);
  return { ok: true, path: dest };
}

export function findSystem(world, id) {
  let found = null;
  walk(world.outer, (s) => { if (s.id === id) found = s; });
  return found;
}

export function walk(sys, fn) {
  fn(sys);
  for (const c of sys.children) walk(c, fn);
}

function ancestorPaused(sys) {
  let s = sys;
  while (s) {
    if (s.paused && !s.stepOnce) return true;
    s = s.parent;
  }
  return false;
}

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

function compilerProgramFor(sys) {
  const raw = sys.files.get("/Programs/compiler.nbc");
  if (raw) {
    try {
      const p = JSON.parse(raw);
      if (p && p.functions && p.functions.main) return p;
    } catch { /* use world default */ }
  }
  return sys.world.compilerProgram;
}

function startCompile(sys, source) {
  const program = compilerProgramFor(sys.parent || sys);
  const proc = makeProc(program, "compiler");
  return { proc, source, done: false, result: null, fed: false, cost: 0 };
}

function pumpCompile(job, budget) {
  if (!job || job.done) return 0;
  let used = 0;
  while (used < budget && !job.done) {
    const r = step(job.proc, Math.min(50000, budget - used));
    used += r.cost;
    job.cost += r.cost;
    if (r.reason === "trap") {
      if (r.name === "read_in" && !job.fed) {
        job.fed = true;
        resume(job.proc, job.source);
      } else resume(job.proc, null);
    } else if (r.reason === "halt") {
      job.done = true;
      job.result = job.proc.result;
    } else if (r.reason === "error") {
      job.done = true;
      job.result = { ok: false, error: job.proc.error || "编译进程异常", program: null };
    } else if (r.cost === 0) break;
  }
  return used;
}

export function createChild(parent, { name } = {}) {
  const world = parent.world;
  const id = "inner-" + world.nextInner++;
  const sys = makeSystem(world, { id, name: name || id, parent });
  seedFiles(sys, "inner");
  writeCompilerNbc(sys, world.compilerProgram);
  parent.children.push(sys);
  const kernelSrc = parent.files.get(TEXT.kernel) || parent.files.get("/Programs/kernel.npl") || world.presets[TEXT.kernel];
  const kpath = "/Systems/" + id + "/kernel.npl";
  writeFileDirect(parent, kpath, kernelSrc);
  writeFileDirect(parent, "/Systems/" + id + "/meta.json", JSON.stringify({ id, name: sys.name, created: parent.clock }));
  sys.kernelPath = kpath;
  sys.kernelSrcHash = hashStr(kernelSrc);
  sys.state = "compiling";
  sys.bootJob = startCompile(parent, kernelSrc);
  const rec = {
    pid: parent.nextPid++,
    name: "承载:" + id,
    kind: "carrier",
    vm: null,
    carrierFor: sys,
    instrTick: 0,
    instrTotal: 0,
    logs: [],
    path: kpath,
    quota: sys.grantCap,
  };
  parent.procs.set(rec.pid, rec);
  sys.carrierPid = rec.pid;
  // 根系统没有 NPL 内核，把承载进程放进轮转表
  if (!parent.parent) {
    parent.rr = parent.rr || [];
    parent.rr.push(rec.pid);
  }
  return sys;
}

function startKernel(sys, program) {
  const proc = makeProc(program, "kernel");
  if (proc.status === "error") {
    sys.kernelError = proc.error || "内核无法启动";
    sys.state = "kernel-error";
    sys.kernelProc = null;
    return;
  }
  sys.kernelProc = proc;
  sys.kernelError = null;
  sys.state = sys.paused ? "paused" : "running";
  sys.tickKernel = 0;
}

export function restartSystem(sys) {
  const parent = sys.parent;
  if (!parent) return { error: "不能重启根系统" };
  const src = parent.files.get(sys.kernelPath) || parent.files.get(TEXT.kernel);
  if (!src) return { error: "找不到内核源文件" };
  // 结束子树内进程，保留文件，按原树重新启动
  const keepChildren = sys.children.slice();
  stopRuntime(sys, { keepFiles: true, keepChildren: true });
  sys.children = keepChildren;
  for (const c of sys.children) restartSystem(c);
  sys.kernelSrcHash = hashStr(src);
  sys.kernelError = null;
  sys.state = "compiling";
  sys.bootJob = startCompile(parent, src);
  sys.frame = null;
  return { ok: true };
}

function stopRuntime(sys, { keepFiles = true, keepChildren = false } = {}) {
  sys.kernelProc = null;
  sys.procs.clear();
  sys.input = [];
  sys.bridge = [];
  sys.held = [];
  sys.compileJob = null;
  sys.bootJob = null;
  sys.published = Object.create(null);
  sys.scenes = Object.create(null);
  if (!keepChildren) {
    for (const c of sys.children) stopRuntime(c, { keepFiles, keepChildren: false });
    sys.children = [];
  }
  if (!keepFiles) {
    sys.files.clear();
    sys.dirs = new Set(["/"]);
  }
  sys.state = "stopped";
}

export function closeSystem(sys) {
  const parent = sys.parent;
  if (!parent) return { error: "不能关闭根系统" };
  stopRuntime(sys, { keepFiles: true, keepChildren: false });
  parent.children = parent.children.filter((c) => c !== sys);
  if (sys.carrierPid) parent.procs.delete(sys.carrierPid);
  if (parent.rr) parent.rr = parent.rr.filter((p) => p !== sys.carrierPid);
  // 投送结束
  const world = sys.world;
  world.projections = world.projections.filter((p) => {
    if (p.sourceSystemId === sys.id || containsId(sys, p.sourceSystemId)) {
      p.ended = "源系统已关闭";
      return false;
    }
    return true;
  });
  world.subs = world.subs.filter((s) => s.systemId !== sys.id && !containsId(sys, s.systemId));
  return { ok: true };
}

function containsId(sys, id) {
  let yes = false;
  walk(sys, (s) => { if (s.id === id) yes = true; });
  return yes;
}

export function setPaused(sys, paused) {
  sys.paused = paused;
  sys.state = sys.kernelError ? "kernel-error" : paused ? "paused" : (sys.kernelProc ? "running" : sys.state);
  if (!paused) flushHeld(sys);
}

function flushHeld(sys) {
  if (ancestorPaused(sys)) return;
  if (sys.held.length) {
    sys.bridge.push(...sys.held);
    sys.held = [];
  }
  for (const c of sys.children) flushHeld(c);
}

export function singleStep(parent, child) {
  if (!parent || !child) return { error: "没有目标" };
  if (ancestorPaused(parent) || parent.paused) return { error: "上层已暂停，不能单步" };
  if (!child.paused) return { error: "只能单步已暂停的直属子系统" };
  if (child.parent !== parent) return { error: "只能单步直属子系统" };
  if (child.kernelError) return { error: "内核错误，请修改后重启" };
  const world = parent.world;
  const savedPool = world.pool;
  world.pool = Math.min(parent.budgetCap, child.grantCap);
  zeroTaken(child);
  child.cap = child.grantCap;
  child.stepOnce = true;
  advanceClock(child, TICK_MS, true);
  if (child.kernelProc) runKernel(child, world.pool);
  child.stepOnce = false;
  world.pool = savedPool;
  child.paused = true;
  child.state = "paused";
  return { ok: true, tick: TICK_MS };
}

function zeroTaken(sys) {
  sys.taken = 0;
  for (const c of sys.children) zeroTaken(c);
}

function advanceClock(sys, parentDt, forceSelf) {
  if (sys.paused && !forceSelf && !sys.stepOnce) return;
  const dt = parentDt * (Number(sys.rate) || 1);
  sys.clock += dt;
  sys.tickDt = dt;
  for (const c of sys.children) advanceClock(c, dt, false);
}

export function tick(world) {
  world.tickN++;
  world.pool = world.outer.budgetCap;
  resetTick(world.outer);
  advanceClock(world.outer, TICK_MS, false);
  pumpBoots(world);
  // 小组件使用根系统虚拟时间
  tickWidgets(world);
  if (!world.outer.paused) runRoot(world.outer);
  return { tick: TICK_MS, pool: world.pool };
}

function resetTick(sys) {
  sys.taken = 0;
  sys.cap = sys.parent ? Math.min(sys.grantCap, sys.budgetCap) : sys.budgetCap;
  sys.tickKernel = 0;
  sys.tickInternal = 0;
  for (const p of sys.procs.values()) p.instrTick = 0;
  for (const c of sys.children) resetTick(c);
}

function pumpBoots(world) {
  walk(world.outer, (sys) => {
    if (sys.bootJob && !sys.bootJob.done) {
      const parent = sys.parent || sys;
      const cost = pumpCompile(sys.bootJob, 300000);
      if (parent.parent) { /* charged visually */ }
      sys.totalKernel += 0;
      world.pool = Math.max(0, world.pool - Math.min(world.pool, cost));
      if (sys.bootJob.done) {
        const res = sys.bootJob.result;
        sys.bootJob = null;
        if (!res || !res.ok || !res.program) {
          sys.kernelError = (res && res.error) || "内核编译失败";
          sys.state = "kernel-error";
        } else startKernel(sys, res.program);
      }
    }
  });
}

function tickWidgets(world) {
  const w = world.widgets;
  const dt = TICK_MS;
  if (world.outer.paused) return;
  if (w.timerRun) {
    w.timerLeft -= dt;
    if (w.timerLeft <= 0) {
      w.timerLeft = 0;
      w.timerRun = false;
      pushNote(world, "倒计时", "倒计时结束");
    }
  }
  if (w.stopRun) w.stopwatch += dt;
}

export function pushNote(world, title, body) {
  world.notifications.unshift({
    id: "n" + (world.sheetSeq++),
    title, body,
    at: world.outer.clock,
    read: false,
  });
  if (world.notifications.length > 40) world.notifications.pop();
}

function runRoot(sys) {
  sys.rr = sys.rr || [];
  sys.rr = sys.rr.filter((pid) => sys.procs.has(pid));
  for (const [pid, rec] of sys.procs) if (!sys.rr.includes(pid) && rec.kind !== "dead") sys.rr.push(pid);
  const n = sys.rr.length;
  for (let i = 0; i < n && worldAllowance(sys) > 0; i++) {
    const idx = ((sys.rrCursor || 0) + i) % n;
    const pid = sys.rr[idx];
    const rec = sys.procs.get(pid);
    if (!rec) continue;
    if (rec.kind === "carrier") {
      const child = rec.carrierFor;
      if (!child || child.paused || child.kernelError || !child.kernelProc) continue;
      const want = Math.min(64000, worldAllowance(child));
      if (want <= 0) continue;
      const used = runKernel(child, want);
      rec.instrTick += used;
      rec.instrTotal += used;
    } else if (rec.vm && rec.vm.status !== "waiting" && rec.vm.status !== "suspended" && rec.vm.status !== "halt" && rec.vm.status !== "error") {
      stepRootUser(sys, rec, Math.min(4000, worldAllowance(sys)));
    }
  }
  if (n) sys.rrCursor = ((sys.rrCursor || 0) + 1) % n;
}

function worldAllowance(sys) {
  let n = sys.world.pool;
  let s = sys;
  while (s) {
    n = Math.min(n, s.cap - s.taken);
    s = s.parent;
  }
  return Math.max(0, n);
}

function take(sys, cost) {
  if (!cost || cost < 0) return;
  let s = sys;
  while (s) { s.taken += cost; s = s.parent; }
  sys.world.pool -= cost;
}

function runKernel(sys, want) {
  if (!sys.kernelProc || sys.kernelError) return 0;
  if ((sys.paused && !sys.stepOnce) || (ancestorPaused(sys.parent) )) {
    if (!(sys.stepOnce)) return 0;
  }
  let used = 0;
  let spins = 0;
  while (used < want && spins++ < 40) {
    const room = Math.min(5000, want - used, worldAllowance(sys));
    if (room <= 0) break;
    const before = sys.kernelProc.status;
    if (before === "error" || before === "halt") {
      sys.kernelError = sys.kernelProc.error || "内核已停止";
      sys.state = "kernel-error";
      break;
    }
    if (before === "waiting") break;
    const r = step(sys.kernelProc, room);
    take(sys, r.cost);
    used += r.cost;
    sys.tickKernel += r.cost;
    sys.totalKernel += r.cost;
    if (r.reason === "trap") {
      const y = onKernelTrap(sys, r);
      if (y === "yield") break;
    } else if (r.reason === "error" || r.reason === "halt") {
      sys.kernelError = r.message || sys.kernelProc.error || "内核停止";
      sys.state = "kernel-error";
      break;
    } else if (r.cost === 0) break;
  }
  return used;
}

function onKernelTrap(sys, r) {
  const k = sys.kernelProc;
  const name = r.name;
  const args = r.args || [];
  const reply = (v) => resume(k, v);
  try {
    if (name === "k_idle") { reply(null); return "yield"; }
    if (name === "k_time") { reply(sys.clock); return "ok"; }
    if (name === "k_dt") { reply(sys.tickDt || TICK_MS); return "ok"; }
    if (name === "k_poll") {
      const ev = sys.input.splice(0, sys.input.length);
      reply(ev);
      return "ok";
    }
    if (name === "k_bridge_poll") {
      const ev = sys.bridge.splice(0, sys.bridge.length);
      reply(ev);
      return "ok";
    }
    if (name === "k_step") {
      reply(kernelStep(sys, args[0], args[1] | 0));
      return "ok";
    }
    if (name === "k_resume") {
      const rec = sys.procs.get(args[0]);
      if (rec && rec.vm) resume(rec.vm, args[1]);
      reply(true);
      return "ok";
    }
    if (name === "k_set_wait") {
      const rec = sys.procs.get(args[0]);
      if (rec && rec.vm) {
        rec.vm.status = "waiting";
        rec.vm.wait = args[1] || "wait";
        rec.vm.trap = null;
      }
      reply(true);
      return "ok";
    }
    if (name === "k_load") {
      const program = args[0];
      const pname = args[1] || "proc";
      if (!program || !program.functions) { reply({ pid: 0, error: "字节码无效" }); return "ok"; }
      const vm = makeProc(program, pname);
      if (vm.status === "error") { reply({ pid: 0, error: vm.error }); return "ok"; }
      const rec = addProc(sys, vm, pname, "user");
      rec.path = args[2] || "";
      reply({ pid: rec.pid, error: null });
      return "ok";
    }
    if (name === "k_kill") {
      killProc(sys, args[0]);
      reply(true);
      return "ok";
    }
    if (name === "k_info") { reply(procInfo(sys, args[0])); return "ok"; }
    if (name === "k_result") {
      const rec = sys.procs.get(args[0]);
      reply(rec && rec.vm ? rec.vm.result : null);
      return "ok";
    }
    if (name === "k_list") { reply(listDir(sys, args[0] || "/")); return "ok"; }
    if (name === "k_read") {
      const path = args[0];
      const res = readFile(sys, path);
      const cost = res.data ? res.data.length : 1;
      take(sys, Math.min(cost, worldAllowance(sys)));
      sys.tickInternal += Math.min(cost, 1000000);
      reply(res);
      return "ok";
    }
    if (name === "k_write") {
      const res = writeFileDirect(sys, args[0], args[1] == null ? "" : String(args[1]));
      const cost = args[1] ? String(args[1]).length : 1;
      take(sys, Math.min(cost, Math.max(0, worldAllowance(sys))));
      reply(res);
      return "ok";
    }
    if (name === "k_delete") { reply(removePath(sys, args[0], { recycle: false })); return "ok"; }
    if (name === "k_recycle") { reply(removePath(sys, args[0], { recycle: true })); return "ok"; }
    if (name === "k_restore") { reply(restoreRecycle(sys, args[0])); return "ok"; }
    if (name === "k_mkdir") {
      const p = String(args[0] || "");
      if (!p.startsWith("/")) { reply({ error: "路径无效" }); return "ok"; }
      ensureDir(sys, p);
      reply({ ok: true });
      return "ok";
    }
    if (name === "k_hash") { reply(hashStr(String(args[0] ?? ""))); return "ok"; }
    if (name === "k_suspend") {
      const rec = sys.procs.get(args[0]);
      if (rec && rec.vm) {
        if (args[1]) {
          rec.suspendSaved = rec.vm.status;
          rec.vm.status = "suspended";
        } else if (rec.vm.status === "suspended") {
          const saved = rec.suspendSaved;
          rec.vm.status = saved && saved !== "suspended" && saved !== "running" ? saved : "ready";
        }
      }
      reply(true);
      return "ok";
    }
    if (name === "k_import") {
      const from = findSystem(sys.world, args[0]);
      const res = from ? copyAcross(from, args[1], sys, args[2], { overwrite: !!args[3] }) : { error: "没有源系统" };
      reply(res);
      return "ok";
    }
    if (name === "k_move") { reply(movePath(sys, args[0], args[1])); return "ok"; }
    if (name === "k_log") {
      const line = stringify(args[0]);
      sys.logs.push(line);
      if (sys.logs.length > 80) sys.logs.shift();
      const rec = args[1] ? sys.procs.get(args[1]) : null;
      if (rec) { rec.logs.push(line); if (rec.logs.length > 40) rec.logs.shift(); }
      reply(null);
      return "ok";
    }
    if (name === "k_present") {
      sys.frame = cloneVal(args[0]);
      const cost = 40 + rough(args[0]);
      take(sys, Math.min(cost, Math.max(0, worldAllowance(sys))));
      sys.tickInternal += cost;
      reply(true);
      return "ok";
    }
    if (name === "k_present3d") {
      const channel = String(args[0] || "main");
      sys.scenes[channel] = cloneVal(args[1]);
      const cost = 80 + rough(args[1]);
      sys.gpuBytes = Math.max(sys.gpuBytes, cost * 2);
      take(sys, Math.min(8000, cost / 4));
      sys.tickInternal += Math.min(8000, cost / 4);
      reply(true);
      return "ok";
    }
    if (name === "k_publish") {
      sys.published[String(args[0])] = cloneVal(args[1]);
      reply(true);
      return "ok";
    }
    if (name === "k_children") {
      reply(sys.children.map((c) => ({
        id: c.id, name: c.name, state: systemState(c), paused: c.paused,
        pid: c.carrierPid, rate: c.rate, kernelError: c.kernelError,
        grant: c.grantCap,
      })));
      return "ok";
    }
    if (name === "k_create_child") {
      const child = createChild(sys, { name: args[0] || undefined });
      reply({ id: child.id, pid: child.carrierPid, name: child.name });
      return "ok";
    }
    if (name === "k_ctl") {
      reply(kernelCtl(sys, args[0], args[1], args[2]));
      return "ok";
    }
    if (name === "k_quota") {
      reply({
        budget: sys.budgetCap,
        grant: sys.grantCap,
        mem: sys.memQuota,
        storage: sys.storageQuota,
        memUsed: memUsed(sys),
        storageUsed: storageUsed(sys),
        pool: Math.max(0, worldAllowance(sys)),
        clock: sys.clock,
        rate: sys.rate,
        tick: TICK_MS,
        kernel: sys.tickKernel,
        internal: sys.tickInternal,
      });
      return "ok";
    }
    if (name === "k_set_quota") {
      reply(applyQuota(sys, args[0], args[1], args[2]));
      return "ok";
    }
    if (name === "k_compile_begin") {
      if (sys.compileJob && !sys.compileJob.done) { reply({ ok: false, error: "已有编译在进行" }); return "ok"; }
      sys.compileJob = startCompile(sys, String(args[0] ?? ""));
      reply({ ok: true, pending: true });
      return "ok";
    }
    if (name === "k_compile_poll") {
      if (!sys.compileJob) { reply({ done: false, result: null }); return "ok"; }
      const cost = pumpCompile(sys.compileJob, Math.min(120000, Math.max(1000, worldAllowance(sys))));
      take(sys, Math.min(cost, Math.max(0, worldAllowance(sys) + cost)));
      sys.tickInternal += cost;
      if (sys.compileJob.done) {
        const res = sys.compileJob.result;
        sys.compileJob = null;
        reply({ done: true, result: res });
      } else reply({ done: false, result: null });
      return "ok";
    }
    if (name === "k_rand") {
      sys.rng = (sys.rng * 48271) % 2147483647;
      reply(sys.rng / 2147483647);
      return "ok";
    }
    if (name === "k_self_id") { reply(sys.id); return "ok"; }
    if (name === "k_self_name") { reply(sys.name); return "ok"; }
    if (name === "k_ancestor_ids") {
      const ids = [];
      let s = sys.parent;
      while (s) { ids.push(s.id); s = s.parent; }
      reply(ids);
      return "ok";
    }
    if (name === "k_books") {
      reply(sys.world.books.filter((b) => b.open !== false).map((b) => ({ id: b.id, title: b.title, path: b.path || "" })));
      return "ok";
    }
    if (name === "k_subscribe") {
      const windowId = String(args[4] || "chart");
      const sub = {
        id: "sub-" + (sys.world.sheetSeq++),
        systemId: sys.id,
        windowId,
        workbookId: args[0],
        range: args[1],
        label: args[2],
        series: args[3],
        active: true,
      };
      sys.world.subs = sys.world.subs.filter((s) => !(s.systemId === sys.id && s.windowId === windowId));
      sys.world.subs.push(sub);
      sys.chartHold = false;
      const wb = sys.world.books.find((b) => b.id === sub.workbookId);
      let initial = null;
      if (wb) {
        const m = rangeMatrix(wb, sub.range);
        initial = {
          tag: "sheet", subId: sub.id, version: ++sys.world.sheetSeq,
          workbookId: wb.id, title: wb.title, range: sub.range,
          rows: m.rows ? m.rows.map((row) => row.map((c) => (c.error ? c.error : c.value))) : [],
          label: sub.label, series: sub.series, windowId: sub.windowId,
        };
      }
      reply({ ok: !!wb, subId: sub.id, initial, error: wb ? null : "工作簿未打开" });
      return "ok";
    }
    if (name === "k_unsubscribe") {
      const windowId = args[0] ? String(args[0]) : "";
      if (windowId) sys.world.subs = sys.world.subs.filter((s) => !(s.systemId === sys.id && s.windowId === windowId));
      else sys.world.subs = sys.world.subs.filter((s) => s.systemId !== sys.id);
      reply(true);
      return "ok";
    }
    if (name === "k_project") {
      const res = openProjection(sys, args[0] || {});
      reply(res);
      return "ok";
    }
    if (name === "k_unproject") {
      closeProjection(sys.world, args[0]);
      reply(true);
      return "ok";
    }
    if (name === "k_pick") {
      reply({ hit: null, note: "由显示设备在渲染端计算" });
      return "ok";
    }
    reply(null);
    return "ok";
  } catch (e) {
    sys.kernelError = e.message || String(e);
    sys.state = "kernel-error";
    return "yield";
  }
}

function kernelStep(sys, pid, n) {
  const rec = sys.procs.get(pid);
  if (!rec) return { reason: "error", cost: 0, name: null, args: null, message: "无此进程" };
  if (rec.kind === "carrier" && rec.carrierFor) {
    const child = rec.carrierFor;
    if (!child.kernelProc || child.paused || child.kernelError || ancestorPaused(child)) {
      return { reason: "idle", cost: 0, name: null, args: null, message: child.kernelError };
    }
    const used = runKernel(child, Math.max(0, n | 0));
    rec.instrTick += used;
    rec.instrTotal += used;
    return { reason: used ? "budget" : "idle", cost: used, name: null, args: null, message: null };
  }
  return stepUser(sys, rec, n | 0);
}

function stepUser(sys, rec, n) {
  const proc = rec.vm;
  if (!proc) return { reason: "error", cost: 0, name: null, args: null, message: "无虚拟机" };
  if (proc.status === "suspended") return { reason: "idle", cost: 0, name: null, args: null, message: null };
  if (proc.status === "waiting") return { reason: "idle", cost: 0, name: null, args: null, message: null };
  if (proc.status === "halt") return { reason: "halt", cost: 0, name: null, args: null, message: null };
  if (proc.status === "error") return { reason: "error", cost: 0, name: null, args: null, message: proc.error };
  if (proc.status === "trap") return { reason: "trap", cost: 0, name: proc.trap.name, args: proc.trap.args, message: null };
  const room = Math.min(Math.max(0, n), worldAllowance(sys));
  if (room <= 0) return { reason: "budget", cost: 0, name: null, args: null, message: null };
  const r = step(proc, room);
  take(sys, r.cost);
  rec.instrTick += r.cost;
  rec.instrTotal += r.cost;
  sys.tickInternal += r.cost;
  sys.totalInternal += r.cost;
  if (memUsed(sys) > sys.memQuota) {
    proc.status = "error";
    proc.error = "内存配额不足";
    return { reason: "error", cost: r.cost, name: null, args: null, message: proc.error };
  }
  return { reason: r.reason, cost: r.cost, name: r.name || null, args: r.args || null, message: r.message || proc.error || null };
}

function addProc(sys, vm, name, kind) {
  const rec = {
    pid: sys.nextPid++,
    name, kind, vm,
    carrierFor: null,
    instrTick: 0,
    instrTotal: 0,
    logs: [],
    path: "",
    quota: 20000,
  };
  sys.procs.set(rec.pid, rec);
  vm.pid = rec.pid;
  return rec;
}

function killProc(sys, pid) {
  const rec = sys.procs.get(pid);
  if (!rec) return;
  if (rec.vm && rec.vm.status !== "halt") {
    rec.vm.status = "halt";
    rec.vm.result = null;
  }
  rec.kind = "dead";
  sys.procs.delete(pid);
  if (sys.mail) sys.mail.delete(pid);
}

function procInfo(sys, pid) {
  if (pid === 0 || pid === "kernel") {
    const k = sys.kernelProc;
    return {
      pid: 0, name: "内核", status: k ? k.status : "empty",
      instr: sys.tickKernel, total: sys.totalKernel, mem: k ? recountMem(k) : 0,
      error: sys.kernelError, kind: "kernel",
    };
  }
  const rec = sys.procs.get(pid);
  if (!rec) return null;
  const vm = rec.vm;
  let mem = 0;
  if (vm) { try { mem = recountMem(vm); } catch { mem = vm.mem || 0; } }
  if (rec.kind === "carrier" && rec.carrierFor) mem = memUsed(rec.carrierFor);
  return {
    pid: rec.pid,
    name: rec.name,
    status: rec.kind === "carrier" ? systemState(rec.carrierFor) : (vm ? vm.status : rec.kind),
    instr: rec.instrTick,
    total: rec.instrTotal,
    mem,
    error: vm ? vm.error : (rec.carrierFor && rec.carrierFor.kernelError),
    kind: rec.kind,
    path: rec.path || "",
    wait: vm ? vm.wait : null,
    logs: rec.logs.slice(-6),
    kernelOwn: rec.kind === "carrier" && rec.carrierFor ? rec.carrierFor.tickKernel : 0,
    internal: rec.kind === "carrier" && rec.carrierFor ? rec.carrierFor.tickInternal : rec.instrTick,
  };
}

function memUsed(sys) {
  let n = sys.gpuBytes || 0;
  if (sys.kernelProc) {
    try { n += recountMem(sys.kernelProc); } catch { /* ignore */ }
  }
  for (const rec of sys.procs.values()) {
    if (rec.vm) {
      try { n += recountMem(rec.vm); } catch { n += 64; }
    }
  }
  for (const c of sys.children) {
    // 子树内存记在承载上，由调用方决定是否递归。这里只算本层。
  }
  n += sys.bridge.length * 64 + sys.input.length * 32;
  return n;
}

function kernelCtl(parent, op, id, arg) {
  const child = parent.children.find((c) => c.id === id);
  if (!child && op !== "noop") return { ok: false, error: "没有这个子系统" };
  if (op === "pause") { setPaused(child, true); return { ok: true }; }
  if (op === "resume") { setPaused(child, false); return { ok: true }; }
  if (op === "step") return singleStep(parent, child);
  if (op === "rate") { child.rate = Math.max(0.1, Math.min(8, Number(arg) || 1)); return { ok: true, rate: child.rate }; }
  if (op === "restart") return restartSystem(child);
  if (op === "stop") return closeSystem(child);
  if (op === "grant") { child.grantCap = Math.max(1000, Number(arg) || child.grantCap); child.cap = child.grantCap; return { ok: true }; }
  if (op === "rename") { child.name = String(arg || child.name); return { ok: true }; }
  if (op === "snapshot") return { ok: true, file: saveSnapshot(parent, child) };
  if (op === "fork") {
    if (typeof arg === "string" && arg.startsWith("/")) return { ok: true, id: forkSnapshot(parent, arg) };
    return { ok: true, id: forkSnapshot(parent, child) };
  }
  return { ok: false, error: "未知操作" };
}

function applyQuota(sys, key, value, childId) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return { ok: false, error: "配额无效" };
  if (childId) {
    const child = sys.children.find((c) => c.id === childId);
    if (!child) return { ok: false, error: "没有这个子系统" };
    if (key === "grant") child.grantCap = n;
    else return { ok: false, error: "不能直接改写子系统内部配额" };
    return { ok: true };
  }
  if (key === "budget") sys.budgetCap = n;
  else if (key === "mem") sys.memQuota = n;
  else if (key === "storage") sys.storageQuota = n;
  else if (key === "rate") sys.rate = Math.max(0.1, Math.min(8, n));
  else return { ok: false, error: "未知配额" };
  return { ok: true };
}

function openProjection(source, spec) {
  const world = source.world;
  const targetId = spec.targetId;
  const target = findSystem(world, targetId);
  if (!target) return { ok: false, error: "没有目标桌面" };
  // 目标必须是祖先
  let s = source.parent;
  let ok = false;
  while (s) { if (s.id === target.id) ok = true; s = s.parent; }
  if (!ok) return { ok: false, error: "只能投送到祖先桌面" };
  const existing = world.projections.find((p) => p.sourceSystemId === source.id && p.sourceWindowId === spec.windowId && !p.ended);
  if (existing) return { ok: true, windowId: existing.windowId, focused: true };
  const proj = {
    windowId: "proj-" + (world.nextProj++),
    sourceSystemId: source.id,
    sourceWindowId: spec.windowId,
    sourceAppId: spec.appId || "player",
    targetSystemId: target.id,
    title: spec.title || "投送",
    state: "normal",
    x: 80, y: 48, w: 760, h: 520,
    ended: null,
  };
  world.projections.push(proj);
  return { ok: true, windowId: proj.windowId };
}

function closeProjection(world, windowId) {
  const p = world.projections.find((x) => x.windowId === windowId);
  if (p) p.ended = "已取消投送";
  world.projections = world.projections.filter((x) => x.windowId !== windowId);
}

export function pushInput(sys, ev) {
  if (!sys) return;
  if (ancestorPaused(sys)) return;
  sys.input.push(ev);
  if (sys.input.length > 200) sys.input.splice(0, sys.input.length - 200);
}

export function publishWorkbook(world, wb) {
  world.sheetSeq++;
  const version = world.sheetSeq;
  for (const sub of world.subs) {
    if (!sub.active || sub.workbookId !== wb.id) continue;
    const sys = findSystem(world, sub.systemId);
    if (!sys || sys.chartHold) continue;
    const m = rangeMatrix(wb, sub.range);
    const msg = {
      tag: "sheet",
      subId: sub.id,
      version,
      workbookId: wb.id,
      title: wb.title,
      range: sub.range,
      label: sub.label,
      series: sub.series,
      windowId: sub.windowId,
      rows: m.error ? [] : m.rows.map((row) => row.map((c) => (c.error ? c.error : c.value))),
    };
    deliverBridge(sys, msg);
  }
}

export function postBridge(sys, msg) {
  deliverBridge(sys, msg);
}

function deliverBridge(sys, msg) {
  let blocked = false;
  let s = sys;
  while (s) { if (s.paused) blocked = true; s = s.parent; }
  if (blocked) sys.held.push(cloneVal(msg));
  else sys.bridge.push(cloneVal(msg));
}

export function markBooksClosed(world, wb) {
  for (const sub of world.subs) {
    if (sub.workbookId !== wb.id) continue;
    const sys = findSystem(world, sub.systemId);
    if (!sys) continue;
    deliverBridge(sys, { tag: "source-closed", workbookId: wb.id, title: wb.title, subId: sub.id });
  }
}

export function saveSnapshot(parent, child) {
  const snap = capture(child);
  const text = JSON.stringify(snap);
  const path = "/Snapshots/" + child.id + "-" + Math.floor(parent.clock) + ".snap";
  // 快照写入按规模消耗父系统预算与存储
  const cost = text.length;
  take(parent, Math.min(cost, Math.max(0, worldAllowance(parent))));
  const w = writeFileDirect(parent, path, text);
  if (w.error) return null;
  return path;
}

function capture(sys) {
  return {
    version: 1,
    kind: "nest-snap-1",
    id: sys.id,
    name: sys.name,
    clock: sys.clock,
    rate: sys.rate,
    paused: sys.paused,
    budgetCap: sys.budgetCap,
    grantCap: sys.grantCap,
    memQuota: sys.memQuota,
    storageQuota: sys.storageQuota,
    rng: sys.rng,
    kernelPath: sys.kernelPath,
    kernelError: sys.kernelError,
    files: Object.fromEntries(sys.files),
    dirs: [...sys.dirs],
    frame: sys.frame,
    scenes: sys.scenes,
    published: sys.published,
    input: sys.input,
    bridge: sys.bridge,
    held: sys.held,
    chartHold: sys.chartHold,
    kernel: sys.kernelProc ? snapshotProc(sys.kernelProc) : null,
    procs: [...sys.procs.values()].filter((p) => p.kind !== "carrier").map((p) => ({
      pid: p.pid,
      name: p.name,
      kind: p.kind,
      path: p.path,
      quota: p.quota,
      instrTotal: p.instrTotal,
      logs: p.logs,
      vm: p.vm ? snapshotProc(p.vm) : null,
    })),
    nextPid: sys.nextPid,
    children: sys.children.map(capture),
  };
}

export function restoreSnapshot(parent, child, snap) {
  if (!snap || snap.kind !== "nest-snap-1") return { error: "快照无法读取" };
  // 只替换选定子树
  applySnap(child, snap, false, new Map());
  child.chartHold = true;
  deliverBridge(child, { tag: "restored" });
  return { ok: true };
}

export function forkSnapshot(parent, source) {
  const snap = typeof source === "string" ? JSON.parse(readFile(parent, source).data || "null") : capture(source);
  if (!snap) return null;
  const idMap = new Map();
  const copy = assignNewIds(parent.world, snap, idMap);
  const sys = materialize(parent, copy, idMap);
  parent.children.push(sys);
  const rec = {
    pid: parent.nextPid++,
    name: "承载:" + sys.id,
    kind: "carrier",
    vm: null,
    carrierFor: sys,
    instrTick: 0,
    instrTotal: 0,
    logs: [],
    path: sys.kernelPath,
    quota: sys.grantCap,
  };
  parent.procs.set(rec.pid, rec);
  sys.carrierPid = rec.pid;
  if (!parent.kernelProc) {
    parent.rr = parent.rr || [];
    parent.rr.push(rec.pid);
  }
  sys.chartHold = true;
  deliverBridge(sys, { tag: "restored" });
  // 外部投送不复制。连接待重新建立。
  return sys.id;
}

function assignNewIds(world, snap, idMap) {
  const id = "inner-" + world.nextInner++;
  idMap.set(snap.id, id);
  const children = (snap.children || []).map((c) => assignNewIds(world, c, idMap));
  return { ...snap, id, name: (snap.name || snap.id) + " 副本", children };
}

function materialize(parent, snap, idMap) {
  const sys = makeSystem(parent.world, { id: snap.id, name: snap.name || snap.id, parent });
  applySnap(sys, snap, true, idMap);
  sys.children = (snap.children || []).map((c) => materialize(sys, c, idMap));
  return sys;
}

function applySnap(sys, snap, remapped, idMap) {
  sys.name = snap.name;
  sys.clock = snap.clock;
  sys.rate = snap.rate;
  sys.paused = snap.paused;
  sys.budgetCap = snap.budgetCap;
  sys.grantCap = snap.grantCap;
  sys.memQuota = snap.memQuota;
  sys.storageQuota = snap.storageQuota;
  sys.rng = snap.rng || 1;
  sys.kernelPath = snap.kernelPath;
  sys.kernelError = snap.kernelError;
  sys.files = new Map(Object.entries(snap.files || {}));
  sys.dirs = new Set(snap.dirs || ["/"]);
  sys.frame = remapVal(snap.frame, idMap);
  sys.scenes = remapVal(snap.scenes, idMap) || Object.create(null);
  sys.published = remapVal(snap.published, idMap) || Object.create(null);
  sys.input = remapVal(snap.input, idMap) || [];
  sys.bridge = remapVal(snap.bridge, idMap) || [];
  sys.held = remapVal(snap.held, idMap) || [];
  sys.chartHold = true;
  sys.nextPid = snap.nextPid || 1;
  sys.procs = new Map();
  sys.state = snap.kernelError ? "kernel-error" : snap.paused ? "paused" : "running";
  if (snap.kernel && snap.kernel.program) {
    const vm = restoreProc(remapProcSnap(snap.kernel, idMap));
    sys.kernelProc = vm;
  } else sys.kernelProc = null;
  for (const p of snap.procs || []) {
    const vm = p.vm && p.vm.program ? restoreProc(remapProcSnap(p.vm, idMap)) : null;
    const rec = {
      pid: p.pid, name: p.name, kind: p.kind, vm,
      carrierFor: null, instrTick: 0, instrTotal: p.instrTotal || 0,
      logs: p.logs || [], path: p.path || "", quota: p.quota || 20000,
    };
    sys.procs.set(rec.pid, rec);
  }
  if (!remapped) {
    // 恢复到原实例：子树替换为快照中的孩子
    sys.children = (snap.children || []).map((c) => {
      const child = makeSystem(sys.world, { id: c.id, name: c.name, parent: sys });
      applySnap(child, c, false, idMap);
      child.carrierPid = ensureCarrier(sys, child);
      return child;
    });
  }
}

function ensureCarrier(parent, child) {
  let found = null;
  const want = "承载:" + child.id;
  for (const rec of parent.procs.values()) {
    if (rec.kind === "carrier" && (rec.carrierFor === child || rec.name === want)) found = rec;
  }
  if (found) {
    found.carrierFor = child;
    found.kind = "carrier";
    child.carrierPid = found.pid;
    return found.pid;
  }
  const rec = {
    pid: parent.nextPid++,
    name: "承载:" + child.id,
    kind: "carrier",
    vm: null,
    carrierFor: child,
    instrTick: 0,
    instrTotal: 0,
    logs: [],
    path: child.kernelPath,
    quota: child.grantCap,
  };
  parent.procs.set(rec.pid, rec);
  child.carrierPid = rec.pid;
  return rec.pid;
}

function remapProcSnap(snap, idMap) {
  if (!idMap || !idMap.size) return snap;
  const copy = cloneVal(snap);
  copy.stack = remapVal(copy.stack, idMap);
  copy.slots = remapVal(copy.slots, idMap);
  copy.frames = (copy.frames || []).map((f) => ({ ...f, slots: remapVal(f.slots, idMap) }));
  copy.job = remapVal(copy.job, idMap);
  copy.trap = remapVal(copy.trap, idMap);
  copy.result = remapVal(copy.result, idMap);
  return copy;
}

function remapVal(v, idMap, seen = new Map()) {
  if (!idMap || !idMap.size || v == null) return v;
  if (typeof v === "string") return idMap.get(v) || v;
  if (typeof v !== "object") return v;
  if (seen.has(v)) return seen.get(v);
  if (Array.isArray(v)) {
    const a = new Array(v.length);
    seen.set(v, a);
    for (let i = 0; i < v.length; i++) a[i] = remapVal(v[i], idMap, seen);
    return a;
  }
  const o = Object.create(null);
  seen.set(v, o);
  for (const k of Object.keys(v)) {
    const nk = idMap.get(k) || k;
    o[nk] = remapVal(v[k], idMap, seen);
  }
  return o;
}

function systemState(sys) {
  if (!sys) return "empty";
  if (sys.kernelError || sys.state === "kernel-error") return "kernel-error";
  if (sys.state === "compiling" || sys.bootJob) return "compiling";
  if (sys.paused) return "paused";
  if (sys.state === "stopped") return "stopped";
  return "running";
}

function rough(v) {
  try { return Math.min(200000, JSON.stringify(v).length / 8); }
  catch { return 100; }
}

function stringify(v) {
  if (v == null) return "null";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try { return JSON.stringify(v); } catch { return String(v); }
}

// ---------- 根系统上的用户程序（根内核由宿主实现） ----------

export function spawnRoot(world, path) {
  const sys = world.outer;
  const src = sys.files.get(path);
  if (src == null) return { error: "文件不存在" };
  const js = compile(src);
  // 根上的新程序也走系统内编译器，以尊重编译器修改。
  const job = startCompile(sys, src);
  // 同步泵到完成，根编辑器的「运行」可以等待一小会儿；超大程序仍分tick。
  let guard = 0;
  while (!job.done && guard++ < 200) pumpCompile(job, 200000);
  if (!job.done || !job.result || !job.result.ok) {
    // 若系统编译器失败，退回宿主引导编译器只用于报告错误，不静默替换策略。
    return { error: (job.result && job.result.error) || (js.ok ? "编译未完成" : js.errors.join("；")) };
  }
  const vm = makeProc(job.result.program, baseName(path));
  const rec = addProc(sys, vm, baseName(path), "user");
  rec.path = path;
  sys.rr = sys.rr || [];
  sys.rr.push(rec.pid);
  return { pid: rec.pid };
}

function stepRootUser(sys, rec, n) {
  const r = stepUser(sys, rec, n);
  if (r.reason === "trap") dispatchRoot(sys, rec, r);
  return r;
}

function dispatchRoot(sys, rec, r) {
  const pid = rec.pid;
  const vm = rec.vm;
  const name = r.name;
  const args = r.args || [];
  const ok = (v) => resume(vm, v);
  if (name === "clock") return ok(sys.clock);
  if (name === "sleep") {
    vm.status = "waiting";
    vm.wait = { type: "time", until: sys.clock + Number(args[0] || 0) };
    vm.trap = null;
    return;
  }
  if (name === "self") return ok(pid);
  if (name === "exit") { killProc(sys, pid); return; }
  if (name === "log") {
    const line = stringify(args[0]);
    rec.logs.push(line);
    sys.logs.push(rec.name + ": " + line);
    return ok(null);
  }
  if (name === "send") {
    const target = sys.procs.get(args[0]);
    if (!target || !target.vm || target.vm.status === "halt" || target.vm.status === "error") return ok("dead");
    const box = sys.mail.get(target.pid) || [];
    box.push(cloneVal(args[1]));
    sys.mail.set(target.pid, box);
    if (target.vm.status === "waiting" && target.vm.wait && target.vm.wait.type === "msg") {
      const m = box.shift();
      resume(target.vm, m);
    }
    return ok("ok");
  }
  if (name === "recv" || name === "wait_msg") {
    const box = sys.mail.get(pid) || [];
    if (box.length) return ok(box.shift());
    if (name === "recv") return ok(null);
    vm.status = "waiting";
    vm.wait = { type: "msg" };
    vm.trap = null;
    return;
  }
  if (name === "read_file") {
    const res = readFile(sys, args[0]);
    return ok(res.error ? null : res.data);
  }
  if (name === "write_file") {
    const res = writeFileDirect(sys, args[0], args[1] == null ? "" : String(args[1]));
    return ok(res.error || "ok");
  }
  if (name === "list_dir") return ok(listDir(sys, args[0] || "/"));
  if (name === "spawn") {
    const res = spawnRoot(sys.world, args[0]);
    return ok(res.pid || 0);
  }
  if (name === "rand") {
    sys.rng = (sys.rng * 48271) % 2147483647;
    return ok(sys.rng / 2147483647);
  }
  return ok(null);
}

export function wakeRootSleepers(world) {
  const sys = world.outer;
  for (const rec of sys.procs.values()) {
    const vm = rec.vm;
    if (!vm || vm.status !== "waiting" || !vm.wait) continue;
    if (vm.wait.type === "time" && sys.clock >= vm.wait.until) resume(vm, null);
  }
}

// 在 tick 末尾唤醒。包装一下供 UI 调用。
const _tick = tick;
export function stepWorld(world) {
  const r = _tick(world);
  wakeRootSleepers(world);
  // 根进程若在 tick 中进入 sleep，下一次 tick 的调度会看到 waiting 并跳过，
  // wake 发生在 tick 末，所以再给醒了的进程一次很短的机会。
  if (!world.outer.paused) {
    for (const rec of world.outer.procs.values()) {
      if (rec.vm && rec.vm.status === "ready") stepRootUser(world.outer, rec, 2000);
    }
  }
  return r;
}

export function sheetCommit(world, wb) {
  const info = commit(wb);
  publishWorkbook(world, wb);
  return info;
}

export function systemStateOf(sys) { return systemState(sys); }
export function memoryUsed(sys) { return memUsed(sys); }

export function inspect(world) {
  const systems = [];
  const windows = [];
  const players = [];
  const charts = [];
  walk(world.outer, (sys) => {
    systems.push({ id: sys.id, parentId: sys.parent ? sys.parent.id : null, name: sys.name, state: systemState(sys) });
    if (sys.frame && sys.frame.nodes) {
      for (const n of sys.frame.nodes) {
        const kind = n.type || n.t;
        if (kind === "window") {
          windows.push({
            id: n.id, systemId: sys.id, appId: n.appId || n.app || (n.props && n.props.appId) || "",
            title: n.title || (n.props && n.props.title) || "",
            state: n.state || "normal",
          });
        }
      }
    }
    const pub = sys.published || {};
    if (pub.player) {
      players.push({
        windowId: pub.player.windowId,
        systemId: sys.id,
        state: pub.player.state,
        position: pub.player.position,
        duration: pub.player.duration,
        rate: pub.player.rate,
        scene: pub.player.scene,
        frameTime: pub.player.frameTime,
      });
    }
    const chartList = [];
    if (pub.chart) chartList.push(pub.chart);
    if (Array.isArray(pub.charts)) chartList.push(...pub.charts);
    for (const ch of chartList) {
      charts.push({
        windowId: ch.windowId,
        systemId: sys.id,
        sourceTitle: ch.sourceTitle || "",
        range: ch.range || "",
        chartType: ch.chartType || "bar",
        connectionState: sys.chartHold ? "restored-pending" : (ch.connectionState || "disconnected"),
      });
    }
  });
  for (const w of world.rootWindows) windows.push(w);
  return {
    systems,
    windows,
    browsers: world.browsers.slice(),
    players: players.filter((p) => p.windowId),
    charts: charts.filter((c) => c.windowId),
    projections: world.projections.filter((p) => !p.ended).map((p) => ({
      windowId: p.windowId,
      systemId: p.targetSystemId,
      sourceSystemId: p.sourceSystemId,
      sourceWindowId: p.sourceWindowId,
      sourceAppId: p.sourceAppId,
      state: p.state,
    })),
  };
}

export function serializeWorld(world) {
  return {
    version: 1,
    nextInner: world.nextInner,
    settings: world.settings,
    widgets: world.widgets,
    notifications: world.notifications,
    dnd: world.dnd,
    clipboard: world.clipboard,
    books: world.books.map((b) => ({ ...serializeWorkbook(b), path: b.path, open: b.open !== false, dirty: !!b.dirty })),
    outer: capture(world.outer),
    subs: world.subs,
    projections: world.projections,
  };
}

export function loadWorld(presetFiles, data) {
  const world = createWorld(presetFiles);
  if (!data) return world;
  world.nextInner = data.nextInner || world.nextInner;
  world.settings = { ...world.settings, ...(data.settings || {}) };
  world.widgets = { ...world.widgets, ...(data.widgets || {}) };
  world.notifications = data.notifications || [];
  world.dnd = !!data.dnd;
  world.clipboard = data.clipboard || [];
  if (data.outer) {
    applySnap(world.outer, data.outer, false, new Map());
    // 根没有内核程序
    world.outer.kernelProc = null;
    world.outer.parent = null;
    world.outer.id = "outer";
    // 重建承载指针
    relink(world.outer);
  }
  world.books = (data.books || []).map((b) => {
    const wb = loadWorkbook(b, b.path);
    wb.open = b.open !== false;
    wb.dirty = !!b.dirty;
    return wb;
  });
  world.subs = data.subs || [];
  world.projections = data.projections || [];
  return world;
}

function relink(sys) {
  for (const c of sys.children) {
    c.parent = sys;
    c.world = sys.world;
    let carrier = null;
    for (const rec of sys.procs.values()) if (rec.kind === "carrier" && rec.name === "承载:" + c.id) carrier = rec;
    if (!carrier) {
      carrier = {
        pid: sys.nextPid++,
        name: "承载:" + c.id,
        kind: "carrier",
        vm: null,
        carrierFor: c,
        instrTick: 0,
        instrTotal: 0,
        logs: [],
        path: c.kernelPath,
        quota: c.grantCap,
      };
      sys.procs.set(carrier.pid, carrier);
    } else carrier.carrierFor = c;
    c.carrierPid = carrier.pid;
    relink(c);
  }
  if (!sys.parent) {
    sys.rr = [...sys.procs.keys()];
  }
}

export function sheetUndo(world, wb) {
  if (!undo(wb)) return false;
  publishWorkbook(world, wb);
  return true;
}

export function sheetRedo(world, wb) {
  if (!redo(wb)) return false;
  publishWorkbook(world, wb);
  return true;
}

export function depthOf(sys) {
  let d = 0;
  let s = sys;
  while (s && s.parent) { d += 1; s = s.parent; }
  return d;
}

export function isFrozen(sys) {
  return ancestorPaused(sys);
}

export function pumpSystem(sys) {
  if (!sys || !sys.kernelProc || sys.kernelError) return 0;
  if ((sys.paused && !sys.stepOnce) || ancestorPaused(sys.parent)) return 0;
  return runKernel(sys, 28000);
}

export function endProjection(world, windowId) {
  closeProjection(world, windowId);
}

export function projectFrom(source, spec) {
  return openProjection(source, spec);
}

export function resetWorld(world) {
  const next = createWorld(world.presets);
  world.nextInner = next.nextInner;
  world.pool = next.pool;
  world.tickN = 0;
  world.subs = [];
  world.projections = [];
  world.nextProj = 1;
  world.sheetSeq = next.sheetSeq;
  world.browsers = [];
  world.rootWindows = [];
  world.clipboard = [];
  world.notifications = [];
  world.dnd = false;
  world.settings = next.settings;
  world.widgets = next.widgets;
  world.books = next.books;
  world.compilerProgram = next.compilerProgram;
  world.outer = next.outer;
  world.outer.world = world;
  return world;
}

export { createWorkbook, loadWorkbook, serializeWorkbook, setRaw, commit, undo, redo, rangeMatrix, recalc };

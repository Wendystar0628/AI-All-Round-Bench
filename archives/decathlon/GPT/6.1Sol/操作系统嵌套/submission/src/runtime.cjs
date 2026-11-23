const fixture = {
  kernel: require("../fixtures/kernel.nest.json"),
  compiler: require("../fixtures/compiler.nest.json"),
  wm: require("../fixtures/wm.nest.json"),
  flight: require("../fixtures/flight.nest.json"),
  files: require("../fixtures/files.nest.json"),
  charts: require("../fixtures/charts.nest.json"),
  player: require("../fixtures/player.nest.json"),
  editor: require("../fixtures/editor.nest.json"),
  tasks: require("../fixtures/tasks.nest.json"),
  accumulate: require("../fixtures/accumulate.nest.json"),
  compute: require("../fixtures/compute.nest.json"),
  receive: require("../fixtures/receive.nest.json"),
  send: require("../fixtures/send.nest.json"),
  counter: require("../fixtures/counter.nest.json"),
  physics: require("../fixtures/physics.nest.json"),
};
const helicopter = require("../fixtures/helicopter-24.scene.json"),
  minimal = require("../fixtures/minimal.scene.json"),
  sample = require("../fixtures/sample.sheet.json");
const clone = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));
const size = (v) => (JSON.stringify(v) ?? "null").length * 2;
function initialFiles() {
  let f = {
    "/Documents": { dir: true },
    "/Downloads": { dir: true },
    "/Demo": { dir: true },
    "/System": { dir: true },
    "/Programs": { dir: true },
    "/Recycle": { dir: true },
    "/Snapshots": { dir: true },
  };
  for (let [k, v] of Object.entries(fixture))
    f[
      (["kernel", "compiler", "wm"].includes(k) ? "/System/" : "/Programs/") +
        k +
        ".nest"
    ] = { text: JSON.stringify(v, null, 2) };
  f["/Demo/sample.sheet"] = { text: JSON.stringify(sample) };
  f["/Demo/helicopter-24.scene"] = { text: JSON.stringify(helicopter) };
  f["/Demo/minimal.scene"] = { text: JSON.stringify(minimal) };
  f["/Documents/欢迎来到栖境.txt"] = {
    text: "栖境 NEST\n\n每一层，都是一个新的可能。\n\n双击桌面图标开始；打开「系统树」创建子系统。\n在子系统打开播放器，选择「投送」把画面带回根桌面。\n\n所有程序与场景都可在文件管理器和编辑器中查看、修改。",
  };
  return f;
}
function makeSystem(id, parentId) {
  return {
    id,
    parentId,
    name: id === "outer" ? "栖境 · 主桌面" : id,
    state: "running",
    time: 0,
    rate: 1,
    budget: 12000,
    grant: 12000,
    memory: 64000000,
    storage: 64000000,
    used: 0,
    kernelUsed: 0,
    total: 0,
    files: initialFiles(),
    processes: [],
    windows: [],
    nextPid: 1,
    focus: null,
    settings: { accent: "#7f6c9c", wallpaper: "valley", scale: 1, dnd: false },
    notifications: [],
    clipboard: [],
    note: "",
    calls: [],
    external: [],
    output: [],
    frame: -1,
    kernelPath: null,
    timer: null,
    wmPolicy: { stack: "last", focus: "clicked", hit: "top" },
  };
}
function compile(text) {
  const p = typeof text === "string" ? JSON.parse(text) : clone(text);
  if (p.format !== "nest-1" || !Array.isArray(p.code))
    throw Error("不是合法的 nest-1 程序");
  const labels = {};
  p.code.forEach((x, i) => {
    if (!Array.isArray(x)) throw Error("指令应为数组");
    if (x[0] === "label") labels[x[1]] = i;
  });
  return { ...p, labels };
}
function processOf(s, program, path, kind = "user", windowId = null) {
  const c = compile(program);
  let p = {
    pid: s.nextPid++,
    name: c.name || path,
    path,
    kind,
    windowId,
    code: c.code,
    labels: c.labels,
    policy: c.policy || {},
    pc: 0,
    vars: {},
    inbox: [],
    state: "ready",
    wake: 0,
    total: 0,
    used: 0,
    quota: 2400,
    remaining: 0,
    output: [],
    error: null,
    work: null,
  };
  s.processes.push(p);
  return p;
}
function val(e, p) {
  if (typeof e === "string" && e.startsWith("$")) {
    let [v, ...rest] = e.slice(1).split(".");
    return rest.reduce(
      (a, k) => (a && Object.hasOwn(a, k) ? a[k] : undefined),
      Object.hasOwn(p.vars, v) ? p.vars[v] : undefined,
    );
  }
  if (!Array.isArray(e)) return e;
  if (e[0] === "literal") return clone(e[1]);
  const [op, ...args] = e;
  const a = args.map((x) => val(x, p));
  switch (op) {
    case "+":
      return a.reduce((x, y) => x + y, 0);
    case "-":
      return a[0] - a[1];
    case "*":
      return a.reduce((x, y) => x * y, 1);
    case "/":
      return a[0] / a[1];
    case "%":
      return a[0] % a[1];
    case "<":
      return a[0] < a[1];
    case "<=":
      return a[0] <= a[1];
    case ">":
      return a[0] > a[1];
    case ">=":
      return a[0] >= a[1];
    case "==":
      return a[0] === a[1];
    case "!=":
      return a[0] !== a[1];
    case "len":
      return a[0]?.length || 0;
    case "at":
      return a[0]?.[a[1]];
    case "concat":
      return a.join("");
    case "array":
      return a;
    case "abs":
      return Math.abs(a[0]);
    case "sin":
      return Math.sin(a[0]);
    case "cos":
      return Math.cos(a[0]);
    case "get":
      return a[0]?.[a[1]];
    case "max":
      return Math.max(...a);
    case "min":
      return Math.min(...a);
    case "endsWith":
      return String(a[0]).endsWith(String(a[1]));
    default:
      throw Error("未知表达式 " + op);
  }
}
const names = {
  files: "文件管理器",
  spreadsheet: "电子表格",
  widgets: "小组件",
  editor: "文本与程序",
  browser: "探索浏览器",
  tasks: "进程管理器",
  settings: "个性化",
  player: "三维场景播放器",
  charts: "图表工作台",
  systems: "系统树",
  help: "使用指南",
};
class Engine {
  constructor(saved) {
    this.state = saved || {
      systems: [makeSystem("outer", null)],
      nextSystem: 1,
      nextWindow: 1,
      tick: 0,
      books: {},
      version: 1,
    };
    this.listeners = [];
    this.dirty = true;
    this.ensureRoot();
  }
  ensureRoot() {
    let s = this.get("outer");
    if (!s.processes.length) {
      processOf(s, fixture.wm, "/System/wm.nest", "wm");
    }
    this.state.systems.forEach((s) => {
      s.external ??= [];
      s.calls ??= [];
    });
  }
  get(id) {
    return this.state.systems.find((s) => s.id === id);
  }
  on(fn) {
    this.listeners.push(fn);
    return () => (this.listeners = this.listeners.filter((x) => x !== fn));
  }
  changed() {
    this.dirty = true;
    for (const fn of this.listeners) fn();
  }
  notify(s, text) {
    s.notifications.unshift({
      id: Date.now() + Math.random(),
      text,
      time: s.time,
    });
    s.notifications = s.notifications.slice(0, 40);
    this.changed();
  }
  active(s) {
    if (!s || s.state !== "running") return false;
    return !s.parentId || this.active(this.get(s.parentId));
  }
  children(s) {
    return this.state.systems.filter((x) => x.parentId === s.id);
  }
  descendants(s) {
    return [s, ...this.children(s).flatMap((x) => this.descendants(x))];
  }
  memoryUsed(s, tree = false) {
    const local =
      s.processes
        .filter((p) => !["ended", "error"].includes(p.state))
        .reduce((n, p) => n + size(p), 0) +
      size(s.calls) +
      s.windows.reduce(
        (n, w) =>
          n +
          (w.scene ? size(w.scene) * 8 : 0) +
          size(w.pending || []) +
          size(w.cache || []) +
          size(w.player || {}) +
          size(w.display || {}),
        0,
      );
    return (
      local +
      (tree
        ? this.children(s)
            .filter((c) => c.state !== "stopped")
            .reduce((n, c) => n + this.memoryUsed(c, true), 0)
        : 0)
    );
  }
  storageUsed(s, tree = false) {
    return (
      size(s.files) +
      (tree
        ? this.children(s)
            .filter((c) => c.state !== "stopped")
            .reduce((n, c) => n + this.storageUsed(c, true), 0)
        : 0)
    );
  }
  fits(s, kind, delta) {
    let node = s;
    while (node) {
      let used =
        kind === "memory"
          ? this.memoryUsed(node, true)
          : this.storageUsed(node, true);
      if (used + delta > node[kind]) return false;
      node = this.get(node.parentId);
    }
    return true;
  }
  create(parent) {
    let id = "inner-" + this.state.nextSystem++;
    let s = makeSystem(id, parent.id);
    s.kernelPath = "/System/" + id + ".kernel.nest";
    parent.files[s.kernelPath] = {
      text: parent.files["/System/kernel.nest"].text,
    };
    this.state.systems.push(s);
    this.boot(s);
    const w = this.open(parent, "system", { target: id });
    w.title = id + " · 子系统桌面";
    this.notify(parent, "已启动 " + id + " · 内核来自 " + s.kernelPath);
    return s;
  }
  boot(s) {
    try {
      let par = this.get(s.parentId);
      s.kernel = processOf(
        { processes: [], nextPid: 0 },
        par.files[s.kernelPath].text,
        s.kernelPath,
        "kernel",
      );
      s.kernel.name = "内核 · " + s.id;
      s.programScheduling = true;
      s.state = "running";
      s.processes = [];
      s.bootEvents = [];
      s.nextPid = 1;
      s.calls = [];
      if (!s.programScheduling)
        processOf(s, s.files["/System/wm.nest"].text, "/System/wm.nest", "wm");
      let carrier = par.processes.find((p) => p.child === s.id);
      if (!carrier) {
        carrier = processOf(
          par,
          {
            format: "nest-1",
            name: s.id + " · 系统承载",
            code: [
              ["call", "carrier"],
              ["jump", 0],
            ],
          },
          s.kernelPath,
          "carrier",
        );
        carrier.child = s.id;
        carrier.quota = 12000;
      }
      carrier.state = "ready";
      s.error = null;
    } catch (e) {
      s.state = "error";
      s.error = e.message;
    }
  }
  restart(s) {
    for (const n of this.descendants(s)) {
      n.windows = [];
      n.time = 0;
      n.processes = [];
      n.nextPid = 1;
      n.calls = [];
      n.external = [];
      if (n.parentId) this.boot(n);
    }
    this.cleanup();
    this.changed();
  }
  stop(s) {
    this.descendants(s).forEach((n) => {
      n.state = "stopped";
      n.processes.forEach((p) => (p.state = "ended"));
      n.windows = [];
    });
    const par = this.get(s.parentId);
    par?.processes
      .filter((p) => p.child === s.id)
      .forEach((p) => (p.state = "ended"));
    this.cleanup();
    this.changed();
  }
  cleanup() {
    for (let s of this.state.systems)
      s.windows = s.windows.filter(
        (w) => w.appId !== "projection" || this.findWindow(w.sourceWindowId),
      );
  }
  findWindow(id) {
    for (const s of this.state.systems) {
      const w = s.windows.find((w) => w.id === id);
      if (w) return { s, w };
    }
    return null;
  }
  open(s, appId, extra = {}) {
    let n = s.windows.filter((w) => w.appId === appId).length;
    let w = {
      id: "w" + this.state.nextWindow++,
      systemId: s.id,
      appId,
      title: names[appId] || appId,
      x: appId === "system" ? 130 : 165 + n * 24,
      y: appId === "system" ? 54 : 65 + n * 24,
      width:
        appId === "system"
          ? 1120
          : appId === "player"
            ? 850
            : appId === "spreadsheet"
              ? 860
              : appId === "systems"
                ? 770
                : 760,
      height:
        appId === "system"
          ? 780
          : appId === "player"
            ? 590
            : appId === "spreadsheet"
              ? 590
              : 520,
      minimized: false,
      maximized: false,
      ...extra,
    };
    if (appId === "files") {
      w.path = extra.path || "/Demo";
      w.selected = [];
    }
    if (appId === "spreadsheet") {
      const path = extra.path || "/Demo/sample.sheet";
      const file = s.files[path];
      w.bookId = w.id;
      w.sheet = file
        ? JSON.parse(file.text)
        : { title: "未命名工作簿", cells: {}, formats: {} };
      w.path = path;
      w.selection = "A1";
      w.selectionEnd = "A1";
      w.history = [];
      w.future = [];
      w.version = 1;
      w.dirty = false;
    }
    if (appId === "editor") {
      w.path = extra.path || "/Programs/accumulate.nest";
      w.text = s.files[w.path]?.text || "";
      w.dirty = false;
    }
    if (appId === "player") {
      w.path = extra.path || "/Demo/helicopter-24.scene";
      try {
        w.scene = JSON.parse(s.files[w.path].text);
      } catch {
        w.scene = clone(helicopter);
      }
      w.player = {
        state: "stopped",
        position: 0,
        frameTime: 0,
        duration: w.scene.duration || 15,
        rate: 1,
        loop: false,
        camera: "演出镜头",
        selection: "未选择部件",
        orbit: 0,
        zoom: 1,
        mode: "record",
        wind: 0,
        heading: 0,
        fault: false,
        flight: {
          x: 0,
          y: 0,
          z: 0,
          vx: 0,
          vy: 0,
          roll: 0,
          rv: 0,
          lift: 0.62,
          control: 0,
          lastControl: 0,
        },
        record: [],
        frames: [],
        partTime: 0,
        effectTime: 0,
      };
    }
    if (appId === "charts")
      Object.assign(w, {
        sourceId:
          this.get("outer").windows.find((x) => x.appId === "spreadsheet")
            ?.id || "",
        range: "A1:D4",
        labelColumn: "A",
        series: "D",
        chartType: "bar",
        connectionState: "未连接",
        cache: [],
        version: 0,
        pending: [],
      });
    if (appId === "browser")
      ((w.tabs = [
        {
          id: "tab1",
          url: "https://www.bilibili.com",
          title: "bilibili",
          loadState: "loading",
        },
      ]),
        (w.activeTab = "tab1"));
    const allocation =
      (w.scene ? size(w.scene) * 8 : 0) + size(w.player || {}) + 1024;
    if (!this.fits(s, "memory", allocation)) {
      this.notify(s, "无法打开应用：本系统或祖先内存配额不足");
      return null;
    }
    s.windows.push(w);
    s.focus = w.id;
    if (!["system", "projection", "program"].includes(appId)) {
      const path = "/Programs/" + appId + ".nest";
      let prog = s.files[path]?.text || {
        format: "nest-1",
        name: names[appId],
        code: [
          ["call", "app.events"],
          ["wait", 0.05],
          ["jump", 0],
        ],
      };
      let p = processOf(s, prog, path, "app", w.id);
      p.name = names[appId];
      w.pid = p.pid;
      if (appId === "player") {
        for (const kind of ["scene", "effects"]) {
          let q = processOf(
            s,
            {
              format: "nest-1",
              name: kind === "scene" ? "飞行场景" : "环境特效",
              code: [
                ["recv", "frame"],
                ["call", "display." + kind, null, "$frame"],
                ["jump", 0],
              ],
            },
            "/Programs/" + kind + ".nest",
            kind,
            w.id,
          );
          w[kind + "Pid"] = q.pid;
        }
      }
      if (appId === "charts") {
        let q = processOf(
          s,
          {
            format: "nest-1",
            name: "工作簿数据接收",
            code: [
              ["call", "data.receive"],
              ["wait", 0.05],
              ["jump", 0],
            ],
          },
          "/Programs/data.nest",
          "data",
          w.id,
        );
        w.dataPid = q.pid;
      }
    }
    this.changed();
    return w;
  }
  focus(s, w) {
    if (s.parentId) {
      this.windowCommand(s, w, "focus");
      return;
    }
    s.focus = w.id;
    const wm = s.processes.find((p) => p.kind === "wm");
    s.wmPolicy = wm?.policy || s.wmPolicy;
    if (s.wmPolicy.focus !== "first") {
      s.windows = s.windows.filter((x) => x !== w);
      s.windows.push(w);
    }
    if (s.wmPolicy.stack === "first") s.windows.reverse();
    w.minimized = false;
    this.changed();
  }
  close(s, w) {
    if (w.appId === "system") {
      this.stop(this.get(w.target));
    } else if (w.appId !== "projection") {
      s.processes
        .filter((p) => p.windowId === w.id)
        .forEach((p) => (p.state = "ended"));
      if (w.appId === "spreadsheet")
        for (const n of this.state.systems)
          for (const c of n.windows)
            if (c.sourceId === w.id) c.connectionState = "数据源已关闭";
    }
    s.windows = s.windows.filter((x) => x.id !== w.id);
    this.cleanup();
    s.focus = s.windows.at(-1)?.id;
    this.changed();
  }
  event(s, w, action, data) {
    if (w.appId === "projection") {
      const src = this.findWindow(w.sourceWindowId);
      if (src) this.event(src.s, src.w, action, clone(data));
      return;
    }
    if (!this.active(s)) {
      this.notify(this.get("outer"), "源系统已暂停，输入未送达");
      return;
    }
    const p = s.processes.find((p) => p.pid === w.pid);
    if (!p || p.state === "ended" || p.state === "error") return;
    const event = { type: "input", windowId: w.id, action, data: clone(data) };
    if (s.parentId) {
      const wm = s.processes.find((p) => p.kind === "wm");
      (wm?.inbox || (s.bootEvents ??= [])).push({ sender: 0, value: event });
    } else p.inbox.push(event);
    this.changed();
  }
  windowCommand(s, w, action, patch) {
    const wm = s.processes.find((p) => p.kind === "wm");
    if (
      !this.active(s) ||
      (wm && ["ended", "error", "suspended"].includes(wm.state))
    )
      return false;
    if (!wm) {
      (s.bootEvents ??= []).push({
        sender: 0,
        value: { type: "window", windowId: w?.id, action, patch: clone(patch) },
      });
      return true;
    }
    const last = wm.inbox.at(-1)?.value;
    if (
      action === "patch" &&
      last?.action === "patch" &&
      last.windowId === w?.id
    )
      Object.assign(last.patch, clone(patch));
    else
      wm.inbox.push({
        sender: 0,
        value: { type: "window", windowId: w?.id, action, patch: clone(patch) },
      });
    this.changed();
    return true;
  }
  patchWindow(s, w, patch) {
    if (s.parentId) return this.windowCommand(s, w, "patch", patch);
    Object.assign(w, patch);
    this.changed();
    return true;
  }
  launchApp(s, appId, extra = {}) {
    if (!s.parentId) return this.open(s, appId, extra);
    const wm = s.processes.find((p) => p.kind === "wm");
    if (this.active(s))
      (wm?.inbox || (s.bootEvents ??= [])).push({
        sender: 0,
        value: { type: "window", action: "open", appId, extra: clone(extra) },
      });
    this.changed();
  }
  newSystem(s) {
    if (s.parentId) {
      this.windowCommand(s, null, "new-system");
      return;
    }
    const child = this.create(s);
    this.launchApp(child, "player");
    return child;
  }
  requestClose(s, w) {
    if (s.parentId) this.windowCommand(s, w, "close");
    else this.close(s, w);
  }
  project(s, w, target) {
    let existing = this.state.systems
      .flatMap((x) => x.windows)
      .find((x) => x.sourceWindowId === w.id);
    if (existing) {
      const o = this.findWindow(existing.id);
      this.focus(o.s, existing);
      return;
    }
    const t = this.get(target);
    if (!t) return;
    this.open(t, "projection", {
      title: w.title + " · " + s.id,
      sourceSystemId: s.id,
      sourceWindowId: w.id,
      sourceAppId: w.appId,
      width: 880,
      height: 620,
    });
    this.changed();
  }
  runProgram(s, path, text) {
    try {
      const source = text || s.files[path].text;
      if (!this.fits(s, "memory", size(source) * 2)) {
        this.notify(s, "无法启动：本系统或祖先内存配额不足");
        return null;
      }
      let p = processOf(
        s,
        { format: "nest-1", name: path.split("/").pop(), code: [] },
        path,
      );
      if (path === "/System/wm.nest") {
        p.kind = "wm";
        p.inbox.push(...(s.bootEvents || []));
        s.bootEvents = [];
      }
      p.state = "compiling";
      try {
        const compiler = processOf(
          s,
          s.files["/System/compiler.nest"].text,
          "/System/compiler.nest",
          "compiler",
        );
        compiler.launchTarget = p.pid;
        compiler.inbox.push({
          sender: 0,
          value: typeof source === "string" ? source : JSON.stringify(source),
        });
      } catch (e) {
        p.state = "error";
        p.error = "编译器错误：" + e.message;
      }
      this.notify(s, "编译并启动 " + p.name + " · PID " + p.pid);
      return p;
    } catch (e) {
      this.notify(s, "编译失败：" + e.message);
      return null;
    }
  }
  write(s, path, text) {
    const delta = text.length * 2 - (s.files[path]?.text?.length || 0) * 2;
    if (!this.fits(s, "storage", delta)) {
      this.notify(s, "存储配额不足");
      return false;
    }
    s.files[path] = { text };
    this.notify(s, "已保存 " + path);
    return true;
  }
  copyFile(from, path, to, dir, overwrite = false) {
    let target = dir.replace(/\/$/, "") + "/" + path.split("/").pop();
    if (to.files[target] && !overwrite) return { exists: target };
    if (!from.files[path]) return false;
    const payload = Object.fromEntries(
      Object.entries(from.files)
        .filter(([p]) => p === path || p.startsWith(path + "/"))
        .map(([p, f]) => [target + p.slice(path.length), clone(f)]),
    );
    if (!this.fits(to, "storage", size(payload))) {
      this.notify(to, "传输失败：存储配额不足");
      return false;
    }
    Object.assign(to.files, payload);
    this.notify(to, "已从 " + from.id + " 接收 " + target);
    return true;
  }
  deleteFiles(s, paths) {
    for (const path of paths) {
      const keys = Object.keys(s.files).filter(
        (p) => p === path || p.startsWith(path + "/"),
      );
      for (const key of keys) {
        if (!key.startsWith("/Recycle/")) {
          const target = "/Recycle/" + key.slice(path.lastIndexOf("/") + 1);
          s.files[target] = { ...s.files[key], original: key };
        }
        delete s.files[key];
      }
    }
    this.notify(s, "已删除 " + paths.length + " 项");
  }
  restoreFiles(s, paths) {
    for (const path of paths) {
      const keys = Object.keys(s.files).filter(
        (p) => p === path || p.startsWith(path + "/"),
      );
      for (const key of keys) {
        const f = s.files[key];
        if (f.original) {
          const { original, ...data } = f;
          s.files[original] = data;
          delete s.files[key];
        }
      }
    }
    this.notify(s, "文件已恢复");
  }
  snapshot(parent, s) {
    let nodes = clone(this.descendants(s));
    for (let n of nodes)
      n.windows.forEach((w) => {
        if (w.appId === "charts") w.connectionState = "已恢复，待重新连接";
      });
    let path =
        "/Snapshots/" + s.id + "-" + Math.floor(s.time * 10) + ".snapshot",
      text = JSON.stringify({ format: "nest-snapshot-1", root: s.id, nodes });
    if (!this.fits(parent, "storage", text.length * 2)) {
      this.notify(parent, "快照失败：存储配额不足");
      return null;
    }
    const writer = processOf(
      parent,
      { format: "nest-1", name: "快照写入 · " + s.id, code: [["halt"]] },
      path,
      "snapshot",
    );
    writer.work = {
      name: "snapshot.write",
      args: [path, text],
      left: Math.max(1, Math.ceil(text.length / 32)),
    };
    writer.remaining = writer.work.left;
    this.notify(parent, "正在保存快照 · " + s.id);
    return path;
  }
  restore(parent, path, fork = false) {
    const snap = JSON.parse(parent.files[path].text);
    if (snap.format !== "nest-snapshot-1") throw Error("快照格式错误");
    let nodes = clone(snap.nodes),
      map = {};
    if (!this.get(snap.root)) fork = true;
    if (fork) {
      for (let n of nodes) map[n.id] = "inner-" + this.state.nextSystem++;
      const wmap = {};
      for (let n of nodes)
        for (let w of n.windows) wmap[w.id] = "w" + this.state.nextWindow++;
      for (let n of nodes) {
        let old = n.id;
        n.id = map[old];
        n.name = n.id;
        n.parentId = map[n.parentId] || parent.id;
        n.processes.forEach((p) => {
          if (p.child) p.child = map[p.child];
          if (p.windowId) p.windowId = wmap[p.windowId];
          const remapEvent = (value) => {
            if (!value || typeof value !== "object") return;
            for (const [key, item] of Object.entries(value)) {
              if (
                [
                  "windowId",
                  "sourceWindowId",
                  "sourceWindowId",
                  "targetWindowId",
                ].includes(key) &&
                wmap[item]
              )
                value[key] = wmap[item];
              else if (
                ["systemId", "sourceSystemId", "targetSystemId"].includes(
                  key,
                ) &&
                map[item]
              )
                value[key] = map[item];
              else if (item && typeof item === "object") remapEvent(item);
            }
          };
          remapEvent(p.inbox);
          remapEvent(p.work);
          remapEvent(p.vars);
          if (p.kind === "wm") {
            if (wmap[p.vars.target]) p.vars.target = wmap[p.vars.target];
            if (p.vars.window && wmap[p.vars.window.id])
              p.vars.window.id = wmap[p.vars.window.id];
            if (Array.isArray(p.vars.windows))
              p.vars.windows = p.vars.windows.map((id) => wmap[id] || id);
          }
        });
        n.windows.forEach((w) => {
          w.id = wmap[w.id];
          w.systemId = n.id;
          if (w.target) w.target = map[w.target];
          if (w.sourceWindowId) w.sourceWindowId = wmap[w.sourceWindowId];
          if (w.sourceSystemId) w.sourceSystemId = map[w.sourceSystemId];
          if (w.appId === "charts") {
            w.connectionState = "已恢复，待重新连接";
            w.pending = [];
            w.sourceId = "";
          }
        });
        n.focus = wmap[n.focus];
        const oldKernelPath = n.kernelPath;
        n.kernelPath = "/System/" + n.id + ".kernel.nest";
        if (n.kernel) {
          n.kernel.path = n.kernelPath;
          n.kernel.name = "内核 · " + n.id;
        }
        const kp =
          this.get(n.parentId) || nodes.find((x) => x.id === n.parentId);
        if (kp)
          kp.files[n.kernelPath] = {
            text:
              kp.files[oldKernelPath]?.text ||
              JSON.stringify({
                format: "nest-1",
                name: n.kernel?.name || "Nest Kernel",
                code: n.kernel?.code || fixture.kernel.code,
              }),
          };
      }
    } else {
      const old = this.get(snap.root);
      if (old) {
        const ids = this.descendants(old).map((x) => x.id);
        this.state.systems = this.state.systems.filter(
          (n) => !ids.includes(n.id),
        );
      }
      nodes.forEach((n) =>
        n.windows.forEach((w) => {
          if (w.appId === "charts") {
            w.connectionState = "已恢复，待重新连接";
            w.pending = [];
          }
        }),
      );
    }
    this.state.systems.push(...nodes);
    this.state.nextSystem = Math.max(
      this.state.nextSystem,
      ...this.state.systems.map((n) => +(n.id.split("-")[1] || 0) + 1),
    );
    this.state.nextWindow = Math.max(
      this.state.nextWindow,
      ...this.state.systems.flatMap((n) =>
        n.windows.map((w) => +w.id.slice(1) + 1),
      ),
    );
    let root = nodes[0];
    let carrier = parent.processes.find((p) => p.child === root.id);
    if (!carrier) {
      carrier = processOf(
        parent,
        {
          format: "nest-1",
          name: root.id + " · 系统承载",
          code: [
            ["call", "carrier"],
            ["jump", 0],
          ],
        },
        root.kernelPath,
        "carrier",
      );
      carrier.child = root.id;
      carrier.quota = 12000;
    }
    carrier.state = "ready";
    if (!parent.windows.some((w) => w.target === root.id))
      this.open(parent, "system", {
        target: root.id,
        title: root.id + " · 子系统桌面",
        width: 960,
        height: 650,
        x: 130,
        y: 54,
      });
    this.cleanup();
    this.changed();
    return root;
  }
  step(s, forced = false) {
    if (s.parentId && !this.active(this.get(s.parentId))) return false;
    if (s.state !== "paused" && !forced) return false;
    // The carrier consumes this request in the next ordinary scheduling step.
    // No out-of-band execution or extra ancestor budget is created.
    s.stepRequested = true;
    this.changed();
    return true;
  }
  tick() {
    let frame = ++this.state.tick;
    this.state.systems.forEach((s) => {
      s.used = 0;
      s.kernelUsed = 0;
      s.actualGrant = 0;
      if (s.kernel) s.kernel.used = 0;
      s.processes.forEach((p) => (p.used = 0));
    });
    this.executeSystem(
      this.get("outer"),
      this.get("outer").budget,
      0.1,
      frame,
      false,
    );
    this.changed();
  }
  advanceClock(s, delta) {
    s.lastDt = Math.max(0, +delta || 0);
    s.time += s.lastDt;
    if (s.timer?.running) {
      s.timer.remaining -= s.lastDt;
      if (s.timer.remaining <= 0) {
        s.timer.remaining = 0;
        s.timer.running = false;
        this.notify(s, "倒计时结束 · 时间到了");
      }
    }
    if (s.stopwatch?.running) s.stopwatch.elapsed += s.lastDt;
  }
  executeSystem(s, budget, dt, frame, force = false) {
    if (
      !s ||
      (!force && s.state !== "running") ||
      s.state === "stopped" ||
      s.state === "error"
    )
      return 0;
    const cap = Math.min(s.budget, s.parentId ? s.grant : s.budget);
    budget = Math.max(0, Math.min(budget, cap - s.used));
    if (!budget) return 0;
    s.actualGrant = Math.max(s.actualGrant || 0, s.used + budget);
    if (s.frame !== frame) {
      s.frame = frame;
      if (s.parentId && s.programScheduling) {
        s.pendingClock = { frame, delta: dt * s.rate };
        s.lastDt = 0;
      } else this.advanceClock(s, dt * s.rate);
    }
    let spent = 0;
    if (s.id === "outer") {
      let ready = s.processes.filter(
        (p) => !["ended", "error", "suspended"].includes(p.state),
      );
      s.rr ??= 0;
      let safety = 0;
      while (spent < budget && ready.length && safety++ < budget) {
        let p = ready[s.rr++ % ready.length];
        let n = this.execute(
          s,
          p,
          Math.min(
            p.kind === "carrier" ? 512 : 48,
            budget - spent,
            p.quota - p.used,
          ),
          frame,
        );
        spent += n;
        if (
          !n &&
          ready.every(
            (q) =>
              q.used >= q.quota || q.state === "waiting" || q.state === "ended",
          )
        )
          break;
      }
    } else {
      try {
        spent = this.execute(s, s.kernel, budget, frame, true);
      } catch (e) {
        s.state = "error";
        s.error = e.message;
      }
    }
    s.used += spent;
    s.total += spent;
    return spent;
  }
  execute(s, p, limit, frame, kernel = false) {
    if (!p || ["ended", "error", "suspended"].includes(p.state) || limit <= 0)
      return 0;
    if (["syswait", "compiling"].includes(p.state)) return 0;
    if (p.state === "waiting") {
      if (s.parentId && s.programScheduling && !kernel) return 0;
      if (p.waitMessage && !p.inbox.length) return 0;
      if (!p.waitMessage && s.time < p.wake) return 0;
      p.state = "ready";
      p.waitMessage = false;
    }
    let used = 0;
    try {
      while (used < limit && p.state === "ready") {
        if (!kernel && p.used >= p.quota) break;
        if (p.work) {
          const pay = Math.min(limit - used, p.work.left);
          p.work.left -= pay;
          used += pay;
          p.used += pay;
          p.total += pay;
          if (kernel) s.kernelUsed += pay;
          p.remaining = p.work.left;
          if (p.work.left > 0) break;
          const work = p.work;
          p.work = null;
          this.device(s, p, work.name, work.args, frame, true);
          continue;
        }
        const ins = p.code[p.pc];
        if (!ins) {
          p.state = "ended";
          break;
        }
        const [op, ...a] = ins;
        if (p.instructionDebt === undefined) {
          let bytes = 0;
          if (op === "set") bytes = size(val(a[1], p));
          else if (op === "call")
            bytes = a.slice(2).reduce((sum, x) => sum + size(val(x, p)), 0);
          else if (op === "send" || op === "write" || op === "print")
            bytes = a.reduce((sum, x) => sum + size(val(x, p)), 0);
          else if (op === "read")
            bytes = (s.files[val(a[0], p)]?.text?.length || 0) * 2;
          p.instructionDebt = Math.max(1, Math.ceil(bytes / 64));
        }
        const fee = Math.min(limit - used, p.instructionDebt);
        p.instructionDebt -= fee;
        used += fee;
        p.used += fee;
        p.total += fee;
        if (kernel) s.kernelUsed += fee;
        p.remaining = p.instructionDebt;
        if (p.instructionDebt > 0) break;
        delete p.instructionDebt;
        p.pc++;
        switch (op) {
          case "label":
            break;
          case "set": {
            let parts = a[0].split("."),
              key = parts.pop(),
              obj = p.vars;
            if (
              [...parts, key].some((k) =>
                ["__proto__", "constructor", "prototype"].includes(k),
              )
            )
              throw Error("受保护的变量字段");
            for (let k of parts) obj = obj[k] ??= {};
            obj[key] = clone(val(a[1], p));
            break;
          }
          case "add":
            p.vars[a[0]] = (p.vars[a[0]] || 0) + val(a[1], p);
            break;
          case "put": {
            const obj = val(a[0], p),
              key = val(a[1], p);
            if (
              !obj ||
              typeof obj !== "object" ||
              ["__proto__", "constructor", "prototype"].includes(key)
            )
              throw Error("无效的数据字段");
            obj[key] = val(a[2], p);
            break;
          }
          case "jump":
            p.pc = typeof a[0] === "number" ? a[0] : p.labels[a[0]];
            if (p.pc === undefined) throw Error("跳转标签不存在");
            break;
          case "if":
            if (val(a[0], p))
              p.pc = typeof a[1] === "number" ? a[1] : p.labels[a[1]];
            break;
          case "wait":
            p.wake = s.time + Math.max(0.001, +val(a[0], p));
            p.state = "waiting";
            break;
          case "recv":
            if (p.inbox.length) {
              let m = p.inbox.shift();
              p.vars[a[0]] = clone(Object.hasOwn(m, "value") ? m.value : m);
              p.vars.sender = m.sender;
            } else {
              p.pc--;
              p.state = "waiting";
              p.waitMessage = true;
            }
            break;
          case "send": {
            if (s.parentId) {
              this.request(s, p, "message.send", [val(a[0], p), val(a[1], p)]);
              break;
            }
            let to = s.processes.find(
              (q) => q.pid === val(a[0], p) && q.state !== "ended",
            );
            if (to)
              to.inbox.push({ sender: p.pid, value: clone(val(a[1], p)) });
            p.vars.result = to ? "已投递" : "目标不存在";
            break;
          }
          case "read":
            if (s.parentId)
              this.request(s, p, "file.read", [val(a[0], p)], a[1]);
            else p.vars[a[1]] = s.files[val(a[0], p)]?.text ?? null;
            break;
          case "write":
            if (s.parentId)
              this.request(s, p, "file.write", [
                val(a[0], p),
                String(val(a[1], p)),
              ]);
            else this.write(s, val(a[0], p), String(val(a[1], p)));
            break;
          case "spawn":
            if (s.parentId)
              this.request(
                s,
                p,
                "process.spawn",
                [val(a[0], p)],
                a[1] || "pid",
              );
            else p.vars[a[1] || "pid"] = this.runProgram(s, val(a[0], p))?.pid;
            break;
          case "kill": {
            let q = s.processes.find((x) => x.pid === val(a[0], p));
            if (q) this.terminate(s, q);
            break;
          }
          case "time":
            p.vars[a[0]] = s.time;
            break;
          case "self":
            p.vars[a[0]] = p.pid;
            break;
          case "print": {
            let t =
              typeof val(a[0], p) === "string"
                ? val(a[0], p)
                : JSON.stringify(val(a[0], p));
            p.output.push(t);
            s.output.push({ pid: p.pid, text: t, time: s.time });
            s.output = s.output.slice(-100);
            break;
          }
          case "halt":
            p.state = "ended";
            break;
          case "call": {
            const name = a[0],
              dest = a[1],
              args = a.slice(2).map((x) => clone(val(x, p)));
            if (name.startsWith("sys.")) {
              if (s.parentId) this.request(s, p, name.slice(4), args, dest);
              else {
                const result = this.device(s, p, name.slice(4), args, frame);
                if (dest) p.vars[dest] = clone(result);
              }
            } else if (name === "task.execute") {
              if (p.kind !== "kernel")
                throw Error("只有内核程序能拨付任务执行预算");
              const q = s.processes.find((x) => x.pid === args[0]);
              if (q) {
                let paid = this.execute(
                  s,
                  q,
                  Math.min(+args[1] || 48, limit - used, q.quota - q.used),
                  frame,
                );
                used += paid;
              }
            } else if (name === "carrier") {
              if (s.programScheduling && s.clockAdvancedFrame !== frame) break;
              let child = this.get(p.child);
              if (child) {
                const single =
                  child.state === "paused" &&
                  (child.stepRequested || child.stepFrame === frame);
                if (single) {
                  child.stepRequested = false;
                  child.stepFrame = frame;
                }
                let paid = this.executeSystem(
                  child,
                  Math.min(limit - used, p.quota - p.used, child.grant),
                  single ? 0.1 / child.rate : (s.lastDt ?? 0.1),
                  frame,
                  single,
                );
                used += paid;
                p.used += paid;
                p.total += paid;
                p.internal = child.used - child.kernelUsed;
                p.kernelWork = child.kernelUsed;
              }
            } else {
              const result = this.device(s, p, name, args, frame);
              if (dest) {
                if (size(result) > 128)
                  p.work = {
                    name: "result.deliver",
                    args: [dest, clone(result)],
                    left: Math.ceil(size(result) / 64),
                  };
                else p.vars[dest] = clone(result);
              }
            }
            break;
          }
          default:
            throw Error("未知指令 " + op);
        }
        if (size(p.vars) + size(p.inbox) > s.memory / 2)
          throw Error("进程内存配额不足");
        if (p.pc === undefined) throw Error("无效程序位置");
      }
    } catch (e) {
      p.state = "error";
      p.error = e.message;
      if (p.kind === "compiler" && p.launchTarget) {
        const target = s.processes.find((q) => q.pid === p.launchTarget);
        if (target) {
          target.state = "error";
          target.error = "编译失败：" + e.message;
        }
      }
      if (kernel) {
        s.state = "error";
        s.error = e.message;
      }
    }
    return used;
  }
  request(s, p, name, args, dest = "result") {
    s.calls.push({ pid: p.pid, name, args: clone(args) });
    p.pendingDest = dest || "result";
    p.state = "syswait";
  }
  terminate(s, p) {
    p.state = "ended";
    p.inbox = [];
    p.vars = {};
    if (p.child) this.stop(this.get(p.child));
    if (p.windowId) {
      const w = s.windows.find((w) => w.id === p.windowId);
      if (w) this.close(s, w);
    }
    this.changed();
  }
  device(s, p, name, args, frame, paid = false) {
    let w = s.windows.find((x) => x.id === p.windowId);
    if (!w && ["flight.sensor", "flight.control"].includes(name)) {
      w = s.windows.findLast(
        (w) => w.appId === "player" && w.player.mode === "rehearsal",
      );
      if (!w) throw Error("请先打开播放器并开始飞行排演");
      for (const q of s.processes)
        if (q !== p && q.kind === "flight" && q.windowId === w.id)
          q.state = "ended";
      p.windowId = w.id;
      p.kind = "flight";
      w.flightPid = p.pid;
    }
    switch (name) {
      case "clock.pending":
        return clone(s.pendingClock || { frame: s.frame, delta: 0 });
      case "clock.advance":
        if (p.kind !== "kernel") throw Error("只有内核可推进虚拟时钟");
        this.advanceClock(s, args[0]);
        s.clockAdvancedFrame = frame;
        return;
      case "tasks.list":
        return s.processes.map((p) => p.pid);
      case "task.info": {
        const q = s.processes.find((q) => q.pid === args[0]);
        return q
          ? {
              state: q.state,
              wake: q.wake,
              waitMessage: !!q.waitMessage,
              messages: q.inbox.length,
            }
          : null;
      }
      case "task.state": {
        if (p.kind !== "kernel") throw Error("只有内核可唤醒任务");
        const q = s.processes.find((q) => q.pid === args[0]);
        if (q) {
          q.state = args[1];
          q.waitMessage = false;
        }
        return;
      }
      case "result.deliver":
        p.vars[args[0]] = clone(args[1]);
        return;
      case "display.submit": {
        if (!paid) {
          p.work = {
            name,
            args: clone(args),
            left: Math.max(1, Math.ceil(size(args[0]) / 32)),
          };
          return;
        }
        if (!this.fits(s, "memory", size(args[0]) - size(w?.display))) {
          throw Error("显示提交失败：共享内存配额不足");
        }
        let target = w;
        if (!target) {
          target = this.open(s, "program", {
            title: args[0]?.title || p.name,
            pid: p.pid,
          });
          p.windowId = target.id;
        }
        target.display = clone(args[0]);
        target.displayVersion = (target.displayVersion || 0) + 1;
        return;
      }
      case "program.policy":
        return clone(p.policy);
      case "input.next": {
        const i = p.inbox.findIndex(
          (m) => m.type === "input" || m.value?.type === "input",
        );
        if (i < 0) return null;
        const m = p.inbox.splice(i, 1)[0];
        return clone(m.value ?? m);
      }
      case "model.get":
        return clone(
          String(args[0])
            .split(".")
            .reduce((o, k) => o?.[k], w),
        );
      case "model.pick": {
        const o = String(args[0])
          .split(".")
          .reduce((o, k) => o?.[k], w);
        return Object.fromEntries(args[1].map((k) => [k, clone(o?.[k])]));
      }
      case "model.set": {
        if (!w) return;
        const keys = String(args[0]).split(".");
        if (
          ["id", "systemId", "pid", "appId"].includes(keys[0]) ||
          keys.some((k) =>
            ["__proto__", "prototype", "constructor"].includes(k),
          )
        )
          throw Error("不可修改的应用身份");
        let obj = w;
        for (const k of keys.slice(0, -1)) obj = obj[k] ??= {};
        if (
          !this.fits(
            s,
            "memory",
            Math.max(0, size(args[1]) - size(obj[keys.at(-1)])),
          )
        )
          throw Error("应用内存配额不足");
        obj[keys.at(-1)] = clone(args[1]);
        if (
          [
            "player.wind",
            "player.fault",
            "player.heading",
            "player.goalX",
            "player.goalY",
          ].includes(args[0]) &&
          w.player?.mode === "rehearsal"
        ) {
          (w.player.inputHistory ??= []).push({
            t: w.player.desiredPosition ?? w.player.position,
            wind: w.player.wind,
            fault: w.player.fault,
            heading: w.player.heading,
          });
        }
        return;
      }
      case "model.patch": {
        for (const key of ["sourceId", "range", "series", "labelColumn"])
          if (Object.hasOwn(args[0] || {}, key)) w[key] = clone(args[0][key]);
        return;
      }
      case "window.list":
        return s.windows.filter((w) => !w.minimized).map((w) => w.id);
      case "window.info": {
        const target = s.windows.find((w) => w.id === args[0]);
        return target
          ? {
              id: target.id,
              pid: target.pid,
              appId: target.appId,
              x: target.x,
              y: target.y,
              width: target.width,
              height: target.height,
            }
          : null;
      }
      case "window.focus": {
        const target = s.windows.find((w) => w.id === args[0]);
        if (target) {
          s.focus = target.id;
          target.minimized = false;
        }
        return;
      }
      case "system.create":
        return this.create(s).id;
      case "system.info":
        return { id: s.id, parentId: s.parentId, time: s.time };
      case "system.post": {
        const target = this.children(s).find((c) => c.id === args[0]),
          wm = target?.processes.find((p) => p.kind === "wm");
        if (!target) return false;
        (wm?.inbox || (target.bootEvents ??= [])).push({
          sender: 0,
          value: clone(args[1]),
        });
        return true;
      }
      case "window.raise": {
        const target = s.windows.find((w) => w.id === args[0]);
        if (target)
          s.windows = [...s.windows.filter((w) => w !== target), target];
        return;
      }
      case "window.lower": {
        const target = s.windows.find((w) => w.id === args[0]);
        if (target)
          s.windows = [target, ...s.windows.filter((w) => w !== target)];
        return;
      }
      case "window.patch": {
        const target = s.windows.find((w) => w.id === args[0]);
        if (target)
          for (const key of [
            "x",
            "y",
            "width",
            "height",
            "maximized",
            "minimized",
            "adjusted",
          ])
            if (Object.hasOwn(args[1] || {}, key)) target[key] = args[1][key];
        return;
      }
      case "window.open":
        return this.open(s, args[0], args[1] || {})?.id;
      case "window.close": {
        const target = s.windows.find((w) => w.id === args[0]);
        if (target) this.close(s, target);
        return;
      }
      case "fs.list":
        return Object.keys(s.files).filter(
          (path) =>
            path.startsWith(args[0] === "/" ? "/" : args[0] + "/") &&
            !path.slice(args[0] === "/" ? 1 : args[0].length + 1).includes("/"),
        );
      case "fs.info":
        return s.files[args[0]]
          ? { dir: !!s.files[args[0]].dir, bytes: size(s.files[args[0]]) }
          : null;
      case "snapshot.restore":
        try {
          return this.restore(s, args[0]).id;
        } catch (e) {
          this.notify(s, e.message);
          return null;
        }
      case "array.sort":
        return clone(args[0]).sort(
          (a, b) =>
            (s.files[a]?.dir ? -1 : 0) - (s.files[b]?.dir ? -1 : 0) ||
            a.localeCompare(b, "zh-CN") * (args[1] === "descending" ? -1 : 1),
        );
      case "file.mkdir":
        if (s.files[args[0]]) return false;
        s.files[args[0]] = { dir: true };
        this.notify(s, "已创建文件夹 " + args[0]);
        return true;
      case "file.rename": {
        const [from, to] = args;
        if (!s.files[from] || s.files[to]) return false;
        for (const key of Object.keys(s.files))
          if (key === from || key.startsWith(from + "/")) {
            s.files[to + key.slice(from.length)] = s.files[key];
            delete s.files[key];
          }
        this.notify(s, "文件已重命名");
        return true;
      }
      case "file.delete":
        this.deleteFiles(s, args[0]);
        return true;
      case "file.restore":
        this.restoreFiles(s, args[0]);
        return true;
      case "data.next": {
        const i = p.inbox.findIndex((m) => m.type === "dataset");
        return i >= 0 ? clone(p.inbox.splice(i, 1)[0].value) : null;
      }
      case "data.connect":
        this.connectChart(s, w);
        return;
      case "data.disconnect":
        this.disconnectChart(s, w);
        return;
      case "chart.submit": {
        const packet = args[0];
        if (packet.epoch !== w.connectionEpoch || packet.version <= w.version)
          return;
        w.cache = clone(packet.rows);
        w.chartMax = packet.max;
        w.version = packet.version;
        w.chartTime = s.time;
        w.multiplier = 1;
        if (["连接中", "已连接"].includes(w.connectionState))
          w.connectionState = "已连接";
        (w.processedVersions ??= []).push(w.version);
        w.processedVersions = w.processedVersions.slice(-64);
        return;
      }
      case "scene.advance":
        if (w.player.mode === "rehearsal") return;
        if (!paid) {
          p.work = {
            name,
            args,
            left:
              Math.max(8, Math.ceil(w.scene.nodes.length / 5)) +
              Math.ceil((+args[0] || 0) / 0.025),
          };
          return;
        }
        this.playerTick(s, w, +args[0]);
        return;
      case "frame.submit":
        this.submitFrame(s, w);
        return;
      case "frame.invalidate":
        w.player.epoch = (w.player.epoch || 0) + 1;
        for (const pid of [w.scenePid, w.effectsPid]) {
          const q = s.processes.find((p) => p.pid === pid);
          if (q) q.inbox = [];
        }
        return;
      case "rehearsal.begin":
        this.applyInput(s, w, "rehearsal");
        return;
      case "snapshot.write":
        return this.write(s, args[0], args[1]);
      case "request.next":
        return s.calls.shift() || null;
      case "request.reply": {
        let q = s.processes.find(
          (q) => q.pid === args[0] && q.state === "syswait",
        );
        if (q) {
          q.vars[q.pendingDest || "result"] = clone(args[1]);
          q.state = "ready";
          q.pendingDest = null;
        }
        return;
      }
      case "message.deliver": {
        let q = s.processes.find(
          (q) => q.pid === args[1] && !["ended", "error"].includes(q.state),
        );
        if (!q) return "目标不存在";
        q.inbox.push({ sender: args[0], value: clone(args[2]) });
        return "已投递";
      }
      case "file.read":
        return s.files[args[0]]?.text ?? null;
      case "file.write":
        return this.write(s, args[0], String(args[1]));
      case "process.spawn":
        return this.runProgram(s, args[0])?.pid;
      case "tasks.ready":
        return s.processes
          .filter(
            (q) =>
              !["ended", "error", "suspended", "syswait", "compiling"].includes(
                q.state,
              ),
          )
          .map((q) => q.pid);
      case "kernel.requests": {
        let req = s.calls.shift();
        if (req) {
          let target = s.processes.find((p) => p.pid === req.pid);
          if (target) {
            if (req.name === "echo") target.vars.result = clone(req.args[0]);
            else if (req.name === "file.read")
              target.vars.result = s.files[req.args[0]]?.text;
            else if (req.name === "message.send") {
              let r = s.processes.find((p) => p.pid === req.args[0]);
              r?.inbox.push({ sender: req.pid, value: clone(req.args[1]) });
            }
          }
        }
        return null;
      }
      case "display.desktop":
        s.wmPolicy = clone(p.policy);
        return null;
      case "compiler.parse": {
        const result = compile(args[0]);
        const aliases = p.policy.aliases || {};
        result.code = result.code.map((ins) => [
          aliases[ins[0]] || ins[0],
          ...ins.slice(1),
        ]);
        return result;
      }
      case "compiler.launch": {
        const q = s.processes.find((q) => q.pid === p.launchTarget);
        if (q) {
          const c = compile(args[0]);
          Object.assign(q, {
            name: c.name || q.name,
            code: c.code,
            labels: c.labels,
            policy: c.policy || {},
            state: "ready",
          });
        }
        return q?.pid;
      }
      case "app.events": {
        if (!w) return;
        let index = p.inbox.findIndex((m) => m.type === "input");
        if (index >= 0) {
          let m = p.inbox.splice(index, 1)[0];
          this.applyInput(s, w, m.action, m.data);
        }
        return;
      }
      case "app.player":
        if (!w) return;
        if (!paid) {
          p.work = {
            name,
            args,
            left: Math.max(8, Math.ceil(w.scene.nodes.length / 5)),
          };
          return;
        }
        this.playerTick(s, w);
        return;
      case "display.scene":
        if (w) {
          if ((args[0]?.epoch || 0) !== (w.player.epoch || 0)) return;
          w.player.partTime = args[0]?.position ?? w.player.position;
          w.player.frameTime = w.player.partTime;
          w.player.renderFlight = clone(args[0]?.flight || w.player.flight);
          w.player.renderCrashed = !!args[0]?.crashed;
        }
        return;
      case "display.effects":
        if (w && (args[0]?.epoch || 0) === (w.player.epoch || 0)) {
          w.player.effectTime = args[0]?.position ?? w.player.position;
          w.player.renderEffectFlight = clone(
            args[0]?.flight || w.player.flight,
          );
        }
        return;
      case "data.receive":
        if (w && w.pending?.length) {
          const v = w.pending.shift();
          let q = s.processes.find((x) => x.pid === w.pid);
          q?.inbox.push({ type: "dataset", value: clone(v) });
        }
        return;
      case "app.charts":
        if (!w) return;
        {
          const index = p.inbox.findIndex((m) => m.type === "dataset");
          if (index >= 0) {
            const v = p.inbox.splice(index, 1)[0].value;
            if (v.epoch === w.connectionEpoch && v.version > w.version) {
              p.work = {
                name: "chart.compute",
                args: [v],
                left: Math.max(1, (size(v) / 20) | 0),
              };
            }
          }
          return;
        }
      case "chart.compute":
        if (w && args[0].epoch === w.connectionEpoch) {
          w.cache = clone(args[0].rows);
          w.version = args[0].version;
          w.chartTime = s.time;
          if (["连接中", "已连接"].includes(w.connectionState))
            w.connectionState = "已连接";
          w.multiplier = p.policy.multiplier ?? 1;
          (w.processedVersions ??= []).push(w.version);
          w.processedVersions = w.processedVersions.slice(-64);
        }
        return;
      case "flight.sensor":
        return clone({
          ...w?.player.flight,
          goalX: w?.player.goalX ?? 0,
          goalY: w?.player.goalY ?? 5,
          goalZ: w?.player.goalZ ?? 0,
          timestamp: s.time,
        });
      case "flight.control":
        if (w) {
          const q = w.player,
            command = {
              t: q.desiredPosition ?? q.position,
              time: s.time,
              lift: q.crashed ? 0 : Math.max(0, Math.min(1.5, +args[0])),
              control: +args[1] || 0,
              pitch: +args[2] || 0,
            };
          (q.controlHistory ??= []).push(command);
          q.record.push({
            ...command,
            wind: q.wind,
            heading: q.heading,
            fault: q.fault,
          });
          if (!w.physicsPid) {
            q.flight.lift = command.lift;
            q.flight.control = command.control;
            q.flight.lastControl = s.time;
          }
        }
        return;
      case "flight.controlsAt": {
        const q = w.player,
          u = q.controlHistory?.findLast((u) => u.t <= args[0]) ||
            q.controlHistory?.[0] || {
              lift: 0.6125,
              control: 0,
              pitch: 0,
              time: s.time,
            };
        const input = q.inputHistory?.findLast((u) => u.t <= args[0]) || {
          wind: 0,
          fault: false,
          heading: 0,
        };
        return { ...clone(u), ...clone(input), lift: q.crashed ? 0 : u.lift };
      }
      case "environment.contact": {
        const f = args[0],
          terrain = w.scene.nodes.find((n) => n.shape === "terrain");
        let height = terrain
            ? (terrain.position?.[1] || 0) +
              Math.sin(f.x * 0.19) *
                Math.cos(f.z * 0.13) *
                0.6 *
                Math.min(1, Math.max(0, (Math.abs(f.z) - 7) / 10))
            : 0,
          blocked = false;
        for (const n of w.scene.nodes) {
          if (n.group || n.shape !== "box") continue;
          const pos = n.position || [0, 0, 0],
            scale = n.scale || [1, 1, 1];
          if (
            Math.abs(f.x - pos[0]) < scale[0] / 2 + 0.65 &&
            Math.abs(f.z - pos[2]) < scale[2] / 2 + 0.65 &&
            f.y + 1 > pos[1] - scale[1] / 2 &&
            f.y < pos[1] + scale[1] / 2
          ) {
            blocked = true;
            height = Math.max(height, pos[1] + scale[1] / 2);
          }
        }
        return { height, blocked };
      }
      case "flight.record": {
        if (!paid) {
          const frame = {
            t: w.player.position,
            flight: clone(w.player.flight),
            crashed: !!w.player.crashed,
          };
          p.work = {
            name,
            args: [frame],
            left: Math.max(1, Math.ceil(size(frame) / 64)),
          };
          return;
        }
        if (!this.fits(s, "memory", size(args[0])))
          throw Error("排演记录内存配额不足");
        w.player.frames.push(clone(args[0]));
        return;
      }
      default:
        if (name.startsWith("app.")) return null;
        if (name.startsWith("sys.")) {
          s.calls.push({ pid: p.pid, name: name.slice(4), args: clone(args) });
          return null;
        }
        throw Error("未知系统服务 " + name);
    }
  }
  applyInput(s, w, action, data) {
    if (w.appId === "player") {
      let p = w.player;
      switch (action) {
        case "play":
          if (p.position >= p.duration) p.position = 0;
          p.state = "playing";
          p.last = s.time;
          break;
        case "pause":
          p.state = "paused";
          break;
        case "stop":
          p.state = "stopped";
          p.position = 0;
          break;
        case "seek":
          p.position = Math.min(p.duration, Math.max(0, +data));
          break;
        case "step":
          p.state = "paused";
          p.position = Math.min(
            p.duration,
            p.position + 1 / (w.scene.fps || 30),
          );
          break;
        case "rate":
          p.rate = +data;
          break;
        case "loop":
          p.loop = !!data;
          break;
        case "camera":
          p.camera = data;
          break;
        case "orbit":
          p.orbit += data.dx;
          p.zoom = Math.max(0.4, Math.min(3, p.zoom + data.zoom));
          break;
        case "select":
          p.selection = data;
          break;
        case "rehearsal":
          if (p.mode !== "rehearsal" && !w.scene.recordFrames) {
            const keys = w.scene.tracks || [];
            let j = keys.findIndex((k) => k.time >= p.position);
            let a = keys[Math.max(0, j - 1)] || keys.at(-1),
              b = keys[Math.max(0, j)] || a;
            if (a && b) {
              let u =
                b.time === a.time
                  ? 0
                  : (p.position - a.time) / (b.time - a.time);
              u = u * u * (3 - 2 * u);
              let pos = a.position.map((v, i) => v + (b.position[i] - v) * u),
                rot = a.rotation.map((v, i) => v + (b.rotation[i] - v) * u);
              Object.assign(p.flight, {
                x: pos[0],
                y: pos[1],
                z: pos[2],
                roll: rot[2],
              });
              p.heading = (-rot[1] * 180) / Math.PI;
            }
          }
          p.mode = "rehearsal";
          p.state = "playing";
          p.duration = 60;
          p.record = (w.scene.record || p.record || []).filter(
            (x) => x.t <= p.position,
          );
          p.frames = (w.scene.recordFrames || p.frames || []).filter(
            (x) => x.t <= p.position,
          );
          p.desiredPosition = p.position;
          Object.assign(p.flight, {
            simTime: p.position,
            vz: p.flight.vz || 0,
            pitch: p.flight.pitch || 0,
          });
          p.goalX ??= p.flight.x;
          p.goalZ ??= p.flight.z;
          p.goalY ??= 5;
          p.controlHistory = (p.record || []).filter((u) => u.t <= p.position);
          if (!p.controlHistory.length)
            p.controlHistory = [
              {
                t: p.position,
                time: s.time,
                lift: p.flight.lift || 0.6125,
                control: 0,
                pitch: 0,
              },
            ];
          p.inputHistory = [
            { t: p.position, wind: p.wind, fault: p.fault, heading: p.heading },
          ];
          if (!p.frames.length)
            p.frames.push({
              t: p.position,
              flight: clone(p.flight),
              crashed: !!p.crashed,
            });
          if (
            !s.processes.some(
              (q) =>
                q.kind === "physics" &&
                q.windowId === w.id &&
                q.state !== "ended",
            )
          ) {
            const q = processOf(
              s,
              s.files["/Programs/physics.nest"].text,
              "/Programs/physics.nest",
              "physics",
              w.id,
            );
            w.physicsPid = q.pid;
          }
          if (
            !s.processes.some(
              (q) =>
                q.kind === "flight" &&
                q.windowId === w.id &&
                q.state !== "ended",
            )
          ) {
            let q = processOf(
              s,
              s.files["/Programs/flight.nest"].text,
              "/Programs/flight.nest",
              "flight",
              w.id,
            );
            w.flightPid = q.pid;
          }
          break;
        case "wind":
          p.wind = +data;
          break;
        case "heading":
          p.heading = +data;
          break;
        case "fault":
          p.fault = true;
          break;
      }
      if (p.mode !== "rehearsal" && w.scene.recordFrames) {
        const f =
          w.scene.recordFrames.findLast((x) => x.t <= p.position) ||
          w.scene.recordFrames[0];
        if (f) {
          p.flight = clone(f.flight);
          p.crashed = f.crashed;
        }
      }
      p.last = s.time;
      this.submitFrame(s, w);
    }
    if (w.appId === "charts") {
      if (action === "configure") Object.assign(w, data);
      if (action === "type") w.chartType = data;
      if (action === "disconnect") this.disconnectChart(s, w);
      if (action === "connect") {
        Object.assign(w, data);
        this.connectChart(s, w);
      }
      if (action === "select") w.selectedPoint = data;
    }
  }
  disconnectChart(s, w, reason = "已断开") {
    w.connectionEpoch = (w.connectionEpoch || 0) + 1;
    w.connectionState = reason;
    w.pending = [];
    for (const p of s.processes.filter((p) => p.windowId === w.id)) {
      p.inbox = p.inbox.filter((m) => m.type !== "dataset");
      if (p.work?.name === "chart.compute")
        ((p.work = null), (p.remaining = 0));
    }
  }
  connectChart(s, w) {
    this.disconnectChart(s, w, "连接中");
    const book = this.findWindow(w.sourceId);
    if (!book || book.w.appId !== "spreadsheet") {
      w.connectionState = "数据源未打开";
      return;
    }
    try {
      const [a, b] = w.range.toUpperCase().trim().split(":");
      const start = parseAddress(a),
        end = parseAddress(b || a);
      const series = w.series
        .toUpperCase()
        .split(/[,， ]+/)
        .filter(Boolean);
      const label = parseAddress(w.labelColumn.toUpperCase() + "1").c;
      if (
        start.r >= end.r ||
        start.c > end.c ||
        (end.r - start.r) * (end.c - start.c + 1) > 10000 ||
        label < start.c ||
        label > end.c ||
        !series.length ||
        series.some((c) => {
          const n = parseAddress(c + "1").c;
          return n < start.c || n > end.c;
        })
      )
        throw Error(
          "请选择包含表头和数据的矩形区域，标签列与数值列必须位于选区内",
        );
      w.subscription = {
        bookId: w.sourceId,
        range: w.range.toUpperCase(),
        labelColumn: w.labelColumn.toUpperCase(),
        series: series.join(","),
      };
      w.version = 0;
      w.processedVersions = [];
      this.publish(w.subscription.bookId);
    } catch (e) {
      w.connectionState = "区域错误：" + e.message;
    }
  }
  submitFrame(s, w) {
    const p = w.player;
    if (p.mode !== "rehearsal" && w.scene.recordFrames) {
      const record =
        w.scene.recordFrames.findLast((f) => f.t <= p.position) ||
        w.scene.recordFrames[0];
      if (record) {
        p.flight = clone(record.flight);
        p.crashed = record.crashed;
      }
    }
    for (let pid of [w.scenePid, w.effectsPid]) {
      const p = s.processes.find((x) => x.pid === pid);
      if (p) {
        p.inbox.push({
          sender: w.pid,
          value: {
            position: w.player.position,
            epoch: w.player.epoch || 0,
            crashed: !!w.player.crashed,
            flight: clone(w.player.flight),
          },
        });
        if (p.inbox.length > 3) p.inbox.shift();
      }
    }
  }
  playerTick(s, w, suppliedDt) {
    const p = w.player;
    let dt = suppliedDt;
    if (dt === undefined) {
      if (p.state !== "playing") return;
      dt = Math.max(0, s.time - (p.last ?? s.time)) * p.rate;
      p.last = s.time;
      p.position += dt;
      if (p.position >= p.duration) {
        if (p.loop) p.position %= p.duration;
        else ((p.position = p.duration), (p.state = "paused"));
      }
    }
    if (p.mode === "rehearsal") {
      const f = p.flight;
      let steps = Math.ceil(dt / 0.025);
      for (let i = 0; i < steps; i++) {
        let h = dt / steps;
        f.vy += (f.lift * 16 - 9.8 - (p.fault ? 5 : 0) - f.vy * 0.4) * h;
        f.y = Math.max(0, f.y + f.vy * h);
        f.rv +=
          (f.roll * 0.5 + f.control + p.wind * 0.035 + (p.fault ? 1 : 0)) * h;
        f.roll += f.rv * h;
        f.vx += (Math.sin(f.roll) * 4 + p.wind * 0.1) * h;
        f.x += f.vx * h;
        f.z += Math.sin((p.heading * Math.PI) / 180) * h;
        let terrain = w.scene.nodes.find((n) => n.shape === "terrain"),
          ground = terrain
            ? (terrain.position?.[1] || 0) +
              Math.sin(f.x * 0.19) *
                Math.cos(f.z * 0.13) *
                0.6 *
                Math.min(1, Math.max(0, (Math.abs(f.z) - 7) / 10))
            : 0;
        for (const n of w.scene.nodes) {
          if (n.group || n.shape !== "box") continue;
          const pos = n.position || [0, 0, 0],
            scale = n.scale || [1, 1, 1];
          if (
            Math.abs(f.x - pos[0]) < scale[0] / 2 + 0.65 &&
            Math.abs(f.z - pos[2]) < scale[2] / 2 + 0.65 &&
            f.y + 1 > pos[1] - scale[1] / 2 &&
            f.y < pos[1] + scale[1] / 2
          ) {
            p.crashed = true;
            ground = Math.max(ground, pos[1] + scale[1] / 2);
          }
        }
        if (f.y <= ground && f.vy < 0) {
          if (f.vy < -3 || Math.abs(f.roll) > 0.7) p.crashed = true;
          f.y = ground;
          f.vy = 0;
          f.rv *= 0.9;
        }
        if (p.crashed) f.lift = 0;
      }
      p.record.push({
        t: p.position,
        wind: p.wind,
        heading: p.heading,
        fault: p.fault,
        lift: f.lift,
        control: f.control,
        lastControl: f.lastControl,
      });
      p.frames.push({ t: p.position, flight: clone(f), crashed: p.crashed });
    } else if (w.scene.recordFrames) {
      const frames = w.scene.recordFrames;
      let current = frames.findLast((x) => x.t <= p.position) || frames[0];
      if (current)
        ((p.flight = clone(current.flight)), (p.crashed = current.crashed));
    }
    if (suppliedDt === undefined) this.submitFrame(s, w);
  }
  publish(bookId) {
    const src = this.findWindow(bookId);
    if (!src || src.w.appId !== "spreadsheet") return;
    for (let s of this.state.systems)
      for (let c of s.windows)
        if (
          c.appId === "charts" &&
          (c.subscription?.bookId || c.sourceId) === bookId &&
          ["已连接", "连接中"].includes(c.connectionState)
        ) {
          try {
            const binding = c.subscription || c;
            const [a, b] = binding.range.toUpperCase().split(":");
            const start = parseAddress(a),
              end = parseAddress(b || a);
            let series = binding.series
              .toUpperCase()
              .split(/[,， ]+/)
              .filter(Boolean);
            let rows = [];
            for (let r = start.r + 1; r <= end.r; r++) {
              let row = {
                label: cellValue(src.w.sheet.cells, binding.labelColumn + r),
                values: series.map((col) => ({
                  name: String(cellValue(src.w.sheet.cells, col + start.r)),
                  value: cellValue(src.w.sheet.cells, col + r),
                })),
              };
              rows.push(row);
            }
            c.pending.push({
              epoch: c.connectionEpoch,
              version: src.w.version,
              rows: clone(rows),
            });
            c.sourceTitle = src.w.sheet.title;
          } catch (e) {
            c.connectionState = "区域错误：" + e.message;
          }
        }
  }
  editSheet(s, w, updates) {
    w.history.push(clone(w.sheet.cells));
    w.history = w.history.slice(-50);
    w.future = [];
    Object.assign(w.sheet.cells, updates);
    w.dirty = true;
    w.version++;
    this.publish(w.id);
    this.changed();
  }
  undoSheet(w, redo = false) {
    let from = redo ? w.future : w.history,
      to = redo ? w.history : w.future;
    if (from.length) {
      to.push(clone(w.sheet.cells));
      w.sheet.cells = from.pop();
      w.dirty = true;
      w.version++;
      this.publish(w.id);
      this.changed();
    }
  }
  saveSheet(s, w) {
    if (this.write(s, w.path, JSON.stringify(w.sheet))) w.dirty = false;
    this.changed();
  }
  inspect() {
    const systems = this.state.systems;
    return {
      systems: systems.map(
        ({ id, parentId, name, state, time, used, budget }) => ({
          id,
          parentId,
          name,
          state,
          time,
          used,
          budget,
        }),
      ),
      windows: systems.flatMap((s) =>
        s.windows.map((w) => ({
          id: w.id,
          systemId: s.id,
          appId: w.appId,
          title: w.title,
          state: w.minimized
            ? "minimized"
            : w.maximized
              ? "maximized"
              : "normal",
        })),
      ),
      browsers: systems.flatMap((s) =>
        s.windows
          .filter((w) => w.appId === "browser")
          .flatMap((w) =>
            w.tabs.map((t) => ({
              windowId: w.id,
              tabId: t.id,
              url: t.url,
              loadState: t.loadState,
            })),
          ),
      ),
      players: systems.flatMap((s) =>
        s.windows
          .filter((w) => w.appId === "player")
          .map((w) => ({
            windowId: w.id,
            systemId: s.id,
            state: w.player.state,
            position: w.player.position,
            duration: w.player.duration,
            rate: w.player.rate,
            scene: w.path,
            frameTime: w.player.frameTime,
          })),
      ),
      charts: systems.flatMap((s) =>
        s.windows
          .filter((w) => w.appId === "charts")
          .map((w) => ({
            windowId: w.id,
            systemId: s.id,
            sourceTitle: w.sourceTitle,
            range: w.range,
            chartType: w.chartType,
            connectionState: w.connectionState,
          })),
      ),
      projections: systems.flatMap((s) =>
        s.windows
          .filter((w) => w.appId === "projection")
          .map((w) => ({
            windowId: w.id,
            systemId: s.id,
            sourceSystemId: w.sourceSystemId,
            sourceWindowId: w.sourceWindowId,
            sourceAppId: w.sourceAppId,
            state: w.minimized ? "minimized" : "normal",
          })),
      ),
    };
  }
}
function parseAddress(a) {
  const m = /^([A-Z]+)([1-9]\d*)$/.exec(a || "");
  if (!m) throw Error("#REF!");
  let c = 0;
  for (let l of m[1]) c = c * 26 + l.charCodeAt(0) - 64;
  return { c, r: +m[2] };
}
function column(c) {
  let s = "";
  while (c) {
    c--;
    s = String.fromCharCode(65 + (c % 26)) + s;
    c = Math.floor(c / 26);
  }
  return s;
}
function cellValue(cells, addr, seen = new Set()) {
  if (seen.has(addr)) return "#CYCLE!";
  let v = cells[addr] ?? "";
  if (typeof v !== "string" || !v.startsWith("="))
    return v !== "" && !isNaN(+v) ? +v : v;
  seen = new Set([...seen, addr]);
  try {
    let formula = v.slice(1).toUpperCase();
    formula = formula.replace(/SUM\(([A-Z]+\d+):([A-Z]+\d+)\)/g, (_, a, b) => {
      const x = parseAddress(a),
        y = parseAddress(b);
      let sum = 0;
      for (let r = x.r; r <= y.r; r++)
        for (let c = x.c; c <= y.c; c++) {
          let n = cellValue(cells, column(c) + r, seen);
          if (String(n).startsWith("#")) throw Error(n);
          sum += +n || 0;
        }
      return "(" + sum + ")";
    });
    formula = formula.replace(/[A-Z]+\d+/g, (a) => {
      let n = cellValue(cells, a, seen);
      if (String(n).startsWith("#")) throw Error(n);
      if (n === "") return "0";
      if (!isFinite(+n)) throw Error("#VALUE!");
      return "(" + n + ")";
    });
    if (!/^[\d.\s()+*/%-]+$/.test(formula)) throw Error("#REF!");
    let out = Function('"use strict";return (' + formula + ")")();
    return !isFinite(out) ? "#DIV/0!" : Math.round(out * 1e8) / 1e8;
  } catch (e) {
    return e.message.startsWith("#") ? e.message : "#ERROR!";
  }
}
module.exports = {
  Engine,
  clone,
  size,
  compile,
  processOf,
  makeSystem,
  cellValue,
  column,
  parseAddress,
  names,
};

const assert = require("node:assert/strict");
const { Engine } = require("../src/runtime.cjs");
const ticks = (e, n = 20) => {
  for (let i = 0; i < n; i++) e.tick();
};
const setup = () => {
  const e = new Engine(),
    r = e.get("outer"),
    s = e.create(r);
  ticks(e, 3);
  return { e, r, s };
};
let count = 0;
function test(name, fn) {
  fn();
  count++;
  console.log("PASS", name);
}
test("window manager suspension freezes shell changes and application input", () => {
  const { e, s } = setup(),
    w = e.open(s, "player"),
    wm = s.processes.find((p) => p.kind === "wm");
  ticks(e, 2);
  wm.state = "suspended";
  e.patchWindow(s, w, { x: 40 });
  e.event(s, w, "play");
  ticks(e, 3);
  assert.notEqual(w.x, 40);
  assert.equal(w.player.state, "stopped");
  wm.state = "ready";
  e.patchWindow(s, w, { x: 40 });
  ticks(e, 3);
  assert.equal(w.x, 40);
  assert.equal(w.player.state, "playing");
});
test("edited window-manager source changes stacking and keyboard focus", () => {
  const { e, s } = setup();
  const source = JSON.parse(s.files["/System/wm.nest"].text);
  source.policy = { focus: "first", stack: "first", hit: "top" };
  s.files["/System/wm.nest"].text = JSON.stringify(source);
  e.restart(s);
  const a = e.open(s, "editor"),
    b = e.open(s, "tasks");
  e.focus(s, b);
  ticks(e, 3);
  assert.equal(s.focus, a.id);
  assert.equal(s.windows[0].id, a.id);
});
test("rewriting player seek instructions changes timeline and submitted frame", () => {
  const { e, s } = setup();
  const source = JSON.parse(s.files["/Programs/player.nest"].text);
  let i = source.code.findIndex(
    (x) => x[0] === "label" && x[1] === "action-seek",
  );
  let instruction = source.code
    .slice(i)
    .find((x) => x[0] === "call" && x[1] === "model.set");
  instruction[4] = ["*", "$e.data", 0.5];
  s.files["/Programs/player.nest"].text = JSON.stringify(source);
  const w = e.open(s, "player");
  e.event(s, w, "seek", 8);
  ticks(e, 5);
  assert.equal(w.player.position, 4);
  assert.equal(w.player.partTime, 4);
});
test("files program owns listing order, create, directory navigation and file opening", () => {
  const { e, s } = setup();
  let source = JSON.parse(s.files["/Programs/files.nest"].text);
  source.policy.sort = "descending";
  s.files["/Programs/files.nest"].text = JSON.stringify(source);
  const w = e.open(s, "files", { path: "/Documents" });
  e.event(s, w, "create", { name: "test.txt", dir: false });
  ticks(e);
  assert(s.files["/Documents/test.txt"]);
  assert(w.entries[0].localeCompare(w.entries.at(-1), "zh-CN") >= 0);
  e.event(s, w, "open", { path: "/Documents/test.txt" });
  ticks(e, 5);
  assert(
    s.windows.some(
      (w) => w.appId === "editor" && w.path === "/Documents/test.txt",
    ),
  );
});
test("kernel file-write edit governs file-manager behavior as well as ordinary programs", () => {
  const { e, r, s } = setup();
  let source = JSON.parse(r.files[s.kernelPath].text);
  let i = source.code.findIndex(
    (x) => x[0] === "call" && x[1] === "file.write",
  );
  source.code[i] = ["set", "result", false];
  r.files[s.kernelPath].text = JSON.stringify(source);
  e.restart(s);
  const w = e.open(s, "files", { path: "/Documents" });
  e.event(s, w, "create", { name: "blocked.txt", dir: false });
  ticks(e);
  assert(!s.files["/Documents/blocked.txt"]);
});
test("edited chart calculation program transforms the actual cached dataset", () => {
  const { e, r, s } = setup();
  let source = JSON.parse(s.files["/Programs/charts.nest"].text);
  source.code.find((x) => x[0] === "put" && x[2] === "value")[3] = [
    "+",
    "$v.value",
    100,
  ];
  s.files["/Programs/charts.nest"].text = JSON.stringify(source);
  const b = e.open(r, "spreadsheet"),
    w = e.open(s, "charts");
  e.event(s, w, "connect", {
    sourceId: b.id,
    range: "A1:D4",
    labelColumn: "A",
    series: "D",
  });
  ticks(e);
  assert.equal(w.cache[0].values[0].value, 244);
  assert.equal(w.multiplier, 1);
  assert.equal(w.cache[0].values[0].ratio, 1);
});
test("a new program creates its own controls, receives input and can replace an app", () => {
  const { e, s } = setup();
  let p = e.runProgram(s, "/Programs/counter.nest");
  ticks(e, 12);
  let w = s.windows.find((w) => w.pid === p.pid);
  assert(w.display.nodes.some((n) => n.id === "increment"));
  e.event(s, w, "increment");
  ticks(e, 5);
  assert.equal(p.vars.count, 1);
  assert.equal(w.display.nodes[2].text, "计数：1");
  const replacement = JSON.parse(s.files["/Programs/counter.nest"].text);
  replacement.code.find((x) => x[0] === "add")[2] = 7;
  s.files["/Programs/files.nest"].text = JSON.stringify(replacement);
  let files = e.open(s, "files");
  ticks(e, 5);
  e.event(s, files, "increment");
  ticks(e, 5);
  assert.equal(files.display.nodes[2].text, "计数：7");
});
test("VM physics and flight control are independent scheduled programs", () => {
  const { e, s } = setup(),
    w = e.open(s, "player");
  e.event(s, w, "rehearsal");
  ticks(e, 60);
  assert(w.player.flight.y > 3);
  assert(s.processes.some((p) => p.kind === "physics" && p.total > 0));
  let controller = s.processes.find((p) => p.kind === "flight");
  controller.state = "suspended";
  ticks(e, 140);
  assert(w.player.crashed);
  assert(w.player.frames.length > 100);
});
test("custom flight program takes control and a scene process suspension freezes only its submitted pose", () => {
  const { e, s } = setup(),
    w = e.open(s, "player");
  e.event(s, w, "rehearsal");
  ticks(e, 25);
  let old = w.flightPid;
  const p = e.runProgram(s, "/Programs/custom-control.nest", {
    format: "nest-1",
    code: [
      ["call", "flight.sensor", "f"],
      ["call", "flight.control", null, 0.7, 0, 0],
      ["wait", 0.1],
      ["jump", 0],
    ],
  });
  ticks(e, 5);
  assert.equal(w.flightPid, p.pid);
  assert.equal(s.processes.find((q) => q.pid === old).state, "ended");
  const scene = s.processes.find((q) => q.pid === w.scenePid);
  scene.state = "suspended";
  let before = w.player.renderFlight.simTime,
    physical = w.player.flight.simTime;
  ticks(e, 8);
  assert.equal(w.player.renderFlight.simTime, before);
  assert(w.player.flight.simTime > physical);
});
test("copy charges retain an unfinished instruction and survive snapshot", () => {
  const { e, r, s } = setup();
  const p = e.runProgram(s, "large-copy", {
    format: "nest-1",
    code: [["set", "value", "x".repeat(8000)], ["halt"]],
  });
  p.quota = 8;
  for (let i = 0; i < 80 && !(p.instructionDebt > 0); i++) e.tick();
  assert(p.instructionDebt > 0);
  assert(!Object.hasOwn(p.vars, "value"));
  s.state = "paused";
  const debt = p.instructionDebt,
    path = e.snapshot(r, s);
  ticks(e, 50);
  const restored = e.restore(r, path),
    q = restored.processes.find((q) => q.pid === p.pid);
  assert.equal(q.instructionDebt, debt);
  restored.state = "running";
  ticks(e, 45);
  assert.equal(q.vars.value.length, 8000);
});
test("ancestor memory quota refuses a scene allocation without affecting a sibling", () => {
  const { e, r, s } = setup(),
    sibling = e.create(r);
  s.memory = e.memoryUsed(s, true) + 2048;
  assert.equal(e.open(s, "player"), null);
  assert(e.open(sibling, "editor"));
  ticks(e, 3);
  assert.equal(sibling.state, "running");
  assert(s.notifications.some((n) => n.text.includes("内存")));
});
test("kernel source owns clock advancement and wait/message wake rules", () => {
  const { e, r, s } = setup(),
    source = JSON.parse(r.files[s.kernelPath].text);
  source.code = source.code.map((i) =>
    i[0] === "call" && i[1] === "clock.advance"
      ? ["set", "clockDisabled", true]
      : i,
  );
  r.files[s.kernelPath].text = JSON.stringify(source);
  e.restart(s);
  const compute = e.runProgram(s, "/Programs/compute.nest");
  ticks(e, 8);
  assert.equal(s.time, 0);
  assert(compute.vars.n > 0);
  assert(r.time > 0);
  const clean = JSON.parse(r.files["/System/kernel.nest"].text);
  clean.code = clean.code.map((i) =>
    i[0] === "call" && i[1] === "task.state"
      ? ["set", "wakeDisabled", true]
      : i,
  );
  r.files[s.kernelPath].text = JSON.stringify(clean);
  e.restart(s);
  const wait = e.runProgram(s, "wait-program", {
    format: "nest-1",
    code: [["wait", 0.2], ["print", "woke"], ["halt"]],
  });
  ticks(e, 12);
  assert.equal(wait.state, "waiting");
  assert.deepEqual(wait.output, []);
  assert(s.time > 1);
});
test("kernel source can control whether the window-manager program is started", () => {
  const { e, r, s } = setup(),
    source = JSON.parse(r.files[s.kernelPath].text);
  source.code[0] = ["set", "skipDesktop", true];
  r.files[s.kernelPath].text = JSON.stringify(source);
  e.restart(s);
  e.launchApp(s, "editor");
  ticks(e, 8);
  assert(!s.processes.some((p) => p.kind === "wm"));
  assert.equal(s.windows.length, 0);
  assert(s.bootEvents.length > 0);
  assert.equal(r.state, "running");
});
console.log(count + " editable program checks passed");

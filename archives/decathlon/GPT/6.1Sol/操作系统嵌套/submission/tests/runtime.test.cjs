const assert = require("node:assert/strict");
const { Engine, cellValue, clone } = require("../src/runtime.cjs");
function ticks(e, n = 20) {
  for (let i = 0; i < n; i++) e.tick();
}
function setup() {
  let e = new Engine(),
    root = e.get("outer"),
    a = e.create(root),
    b = e.create(root),
    c = e.create(a),
    d = e.create(c);
  return { e, root, a, b, c, d };
}
let tests = 0;
function test(name, fn) {
  fn();
  tests++;
  console.log("PASS", name);
}
test("formula dependency, range, division and cycle", () => {
  let cells = {
    A1: "3",
    A2: "4",
    B1: "=SUM(A1:A2)*2",
    B2: "=B1/(A2-A2)",
    C1: "=C2",
    C2: "=C1",
  };
  assert.equal(cellValue(cells, "B1"), 14);
  assert.equal(cellValue(cells, "B2"), "#DIV/0!");
  assert.equal(cellValue(cells, "C1"), "#CYCLE!");
  cells.A1 = "5";
  assert.equal(cellValue(cells, "B1"), 18);
});
test("four layers make progress and share finite root budget", () => {
  let { e, root, d } = setup();
  let p = e.runProgram(d, "/Programs/compute.nest");
  ticks(e, 25);
  assert(p.vars.n > 0);
  assert(root.used <= root.budget);
  let first = p.vars.n;
  root.budget = 500;
  ticks(e, 25);
  let low = p.vars.n - first;
  root.budget = 12000;
  first = p.vars.n;
  ticks(e, 25);
  assert(p.vars.n - first > low);
});
test("ancestor pause freezes time and descendants, siblings continue", () => {
  let { e, a, b, c, d } = setup();
  ticks(e, 2);
  a.state = "paused";
  let t = d.time,
    bt = b.time;
  d.state = "running";
  ticks(e, 5);
  assert.equal(d.time, t);
  assert(b.time > bt);
  a.state = "running";
  c.state = "paused";
  ticks(e, 2);
  assert.equal(d.time, t);
  c.state = "running";
  ticks(e, 2);
  assert(d.time > t);
});
test("message copied at send and delivered through editable kernel", () => {
  let { e, a } = setup();
  let recv = e.runProgram(a, "/Programs/receive.nest");
  let sender = e.runProgram(a, "sender", {
    format: "nest-1",
    name: "sender",
    code: [
      ["set", "a", ["array", 1, 2]],
      ["send", recv.pid, "$a"],
      ["set", "a", ["array", 3, 4]],
      ["halt"],
    ],
  });
  ticks(e, 15);
  assert.equal(recv.output[0], "[1,2]");
  assert.equal(sender.state, "ended");
});
test("kernel request source can implement a new syscall", () => {
  let { e, root, a } = setup();
  let k = JSON.parse(root.files[a.kernelPath].text);
  let i = k.code.findIndex((x) => x[0] === "label" && x[1] === "echo");
  k.code.splice(i + 1, 1, ["set", "result", ["*", ["at", "$req.args", 0], 3]]);
  root.files[a.kernelPath].text = JSON.stringify(k);
  e.restart(a);
  let p = e.runProgram(a, "test", {
    format: "nest-1",
    code: [["call", "sys.echo", "answer", 7], ["print", "$answer"], ["halt"]],
  });
  ticks(e, 10);
  assert.equal(p.output[0], "21");
});
test("malformed kernel stops only its subtree", () => {
  let { e, root, a, b } = setup();
  root.files[a.kernelPath].text = "{ broken";
  e.restart(a);
  ticks(e, 2);
  assert.equal(a.state, "error");
  assert.equal(b.state, "running");
  assert(b.time > 0);
});
test("snapshot exact continuation and fork identity", () => {
  let { e, root, a } = setup();
  let p = e.runProgram(a, "/Programs/compute.nest");
  ticks(e, 3);
  a.state = "paused";
  let path = e.snapshot(root, a),
    n = p.vars.n;
  ticks(e, 30);
  let restored = e.restore(root, path);
  assert.equal(restored.processes.find((q) => q.pid === p.pid).vars.n, n);
  assert.equal(restored.state, "paused");
  let fork = e.restore(root, path, true);
  assert.notEqual(fork.id, a.id);
  assert.equal(fork.processes.find((q) => q.pid === p.pid).vars.n, n);
  fork.state = "running";
  ticks(e, 3);
  assert(fork.processes.find((q) => q.pid === p.pid).vars.n > n);
  assert.equal(restored.processes.find((q) => q.pid === p.pid).vars.n, n);
});
test("chart data messages catch up after subtree pause and disconnect", () => {
  let { e, root, a } = setup(),
    sheet = e.open(root, "spreadsheet"),
    chart = e.open(a, "charts");
  e.event(a, chart, "connect", {
    sourceId: sheet.id,
    range: "A1:D4",
    labelColumn: "A",
    series: "D",
  });
  ticks(e, 10);
  assert.equal(chart.cache[0].values[0].value, 144);
  a.state = "paused";
  e.editSheet(root, sheet, { B2: "30" });
  ticks(e, 5);
  assert.equal(chart.cache[0].values[0].value, 144);
  a.state = "running";
  ticks(e, 10);
  assert.equal(chart.cache[0].values[0].value, 180);
  e.event(a, chart, "disconnect");
  ticks(e, 3);
  e.editSheet(root, sheet, { B2: "10" });
  ticks(e, 5);
  assert.equal(chart.cache[0].values[0].value, 180);
});
test("player pause, seek, project and subtree snapshot use same state", () => {
  let { e, root, a } = setup(),
    w = e.open(a, "player");
  e.event(a, w, "play");
  ticks(e, 12);
  assert(w.player.position > 0);
  e.event(a, w, "pause");
  ticks(e, 3);
  let t = w.player.position;
  ticks(e, 4);
  assert.equal(w.player.position, t);
  e.event(a, w, "seek", 8.5);
  ticks(e, 4);
  assert.equal(w.player.position, 8.5);
  assert.equal(w.player.partTime, 8.5);
  e.project(a, w, "outer");
  assert(root.windows.some((x) => x.sourceWindowId === w.id));
  let path = e.snapshot(root, a);
  ticks(e, 30);
  let restored = e.restore(root, path);
  assert.equal(
    restored.windows.find((x) => x.id === w.id).player.position,
    8.5,
  );
});
test("file transfers are independent copies, storage failure is explicit", () => {
  let { e, root, a } = setup();
  root.files["/Documents/a.txt"] = { text: "abc" };
  e.copyFile(root, "/Documents/a.txt", a, "/Documents");
  root.files["/Documents/a.txt"].text = "changed";
  assert.equal(a.files["/Documents/a.txt"].text, "abc");
  a.storage = 1;
  assert.equal(e.write(a, "/Documents/b.txt", "123"), false);
});
test("compiler is scheduled, editable and can compile its own source", () => {
  let { e, a } = setup();
  let compiler = JSON.parse(a.files["/System/compiler.nest"].text);
  compiler.policy = { aliases: { plus: "add" } };
  a.files["/System/compiler.nest"].text = JSON.stringify(compiler);
  let p = e.runProgram(a, "custom", {
    format: "nest-1",
    code: [["set", "n", 1], ["plus", "n", 2], ["print", "$n"], ["halt"]],
  });
  assert.equal(p.state, "compiling");
  ticks(e, 15);
  assert.equal(p.output[0], "3");
  let self = e.runProgram(a, "/System/compiler.nest");
  ticks(e, 10);
  assert(self.code.some((x) => x[1] === "compiler.parse"));
  assert(a.processes.some((x) => x.kind === "compiler" && x.total > 0));
});
test("invalid program compiler error is isolated and visible", () => {
  let { e, a, b } = setup();
  let p = e.runProgram(a, "invalid", "not json");
  ticks(e, 10);
  assert.equal(p.state, "error");
  assert(p.error.includes("编译"));
  assert.equal(b.state, "running");
});
test("rehearsal recorded frame is restored by a paused seek", () => {
  let { e, a } = setup();
  let w = e.open(a, "player");
  e.event(a, w, "rehearsal");
  ticks(e, 30);
  assert(w.player.frames.length > 5);
  let record = {
    ...clone(w.scene),
    duration: w.player.position,
    recordFrames: clone(w.player.frames),
    record: clone(w.player.record),
  };
  e.write(a, "/Documents/test.replay", JSON.stringify(record));
  let replay = e.open(a, "player", { path: "/Documents/test.replay" });
  let frame = record.recordFrames[3];
  e.event(a, replay, "seek", frame.t);
  ticks(e, 10);
  assert.equal(replay.player.flight.y, frame.flight.y);
  assert.equal(replay.player.state, "stopped");
});
test("snapshot imported into fresh desktop gets independent global identities", () => {
  const one = setup(),
    player = one.e.open(one.a, "player"),
    path = one.e.snapshot(one.root, one.a);
  ticks(one.e, 40);
  const two = new Engine(),
    root = two.get("outer");
  two.open(root, "files");
  root.files[path] = clone(one.root.files[path]);
  const imported = two.restore(root, path);
  const ids = two.state.systems.flatMap((n) => n.windows.map((w) => w.id));
  assert.equal(new Set(ids).size, ids.length);
  assert(imported.windows.some((w) => w.appId === "player"));
  let next = two.create(root);
  assert.notEqual(next.id, imported.id);
});
console.log(`${tests} tests passed`);

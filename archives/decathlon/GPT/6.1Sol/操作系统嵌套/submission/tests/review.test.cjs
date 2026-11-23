const assert = require("node:assert/strict");
const { Engine, clone } = require("../src/runtime.cjs");
const tick = (e, n = 20) => {
  for (let i = 0; i < n; i++) e.tick();
};
function setup() {
  const e = new Engine(),
    r = e.get("outer"),
    a = e.create(r),
    b = e.create(r);
  return { e, r, a, b };
}
let count = 0;
function test(name, fn) {
  fn();
  count++;
  console.log("PASS", name);
}
test("system budget and grant are per logical step, not per carrier invocation", () => {
  const { e, r, a, b } = setup();
  a.budget = 230;
  a.grant = 140;
  b.budget = 510;
  b.grant = 340;
  for (let i = 0; i < 12; i++) {
    e.tick();
    assert(a.used <= 140);
    assert(b.used <= 340);
    assert(r.used <= r.budget);
  }
});
test("single step is scheduled through ancestors and preserves descendant pause", () => {
  const { e, r, a } = setup();
  const child = e.create(a);
  a.state = "paused";
  child.state = "paused";
  tick(e, 2);
  const before = a.time,
    ct = child.time;
  a.rate = 4;
  assert(e.step(a));
  assert.equal(a.time, before);
  e.tick();
  assert(Math.abs(a.time - before - 0.1) < 1e-8);
  assert.equal(child.time, ct);
  assert(a.used > 0);
  assert(r.used >= a.used);
  e.tick();
  assert(Math.abs(a.time - before - 0.1) < 1e-8);
  r.state = "paused";
  assert.equal(e.step(a), false);
});
test("null is delivered as the actual message payload", () => {
  const { e, a } = setup();
  let recv = e.runProgram(a, "/Programs/receive.nest");
  e.runProgram(a, "send-null", {
    format: "nest-1",
    code: [["send", recv.pid, null], ["halt"]],
  });
  tick(e);
  assert.equal(recv.output[0], "null");
});
test("chart binding changes only on connect and disconnect cancels paid/queued work", () => {
  const { e, r, a } = setup(),
    book = e.open(r, "spreadsheet"),
    chart = e.open(a, "charts");
  e.event(a, chart, "connect", {
    sourceId: book.id,
    range: "A1:D4",
    labelColumn: "A",
    series: "D",
  });
  tick(e);
  e.event(a, chart, "configure", { series: "B" });
  tick(e, 3);
  e.editSheet(r, book, { B2: "30" });
  tick(e);
  assert.equal(chart.cache[0].values[0].value, 180);
  const q = a.processes.find((p) => p.pid === chart.pid);
  q.state = "suspended";
  e.editSheet(r, book, { B2: "40" });
  tick(e, 4);
  // A disconnect delivered through the same source application invalidates all subscription generations.
  e.applyInput(a, chart, "disconnect");
  q.state = "ready";
  tick(e);
  assert.equal(chart.cache[0].values[0].value, 180);
  assert.equal(chart.connectionState, "已断开");
});
test("chart backlog is processed in version order and invalid regions are rejected", () => {
  const { e, r, a } = setup(),
    book = e.open(r, "spreadsheet"),
    chart = e.open(a, "charts");
  e.event(a, chart, "connect", {
    sourceId: book.id,
    range: "A1:D4",
    labelColumn: "A",
    series: "D",
  });
  tick(e);
  a.state = "paused";
  for (let n = 25; n < 30; n++) e.editSheet(r, book, { B2: String(n) });
  a.state = "running";
  tick(e, 35);
  assert.deepEqual(chart.processedVersions, [1, 2, 3, 4, 5, 6]);
  assert.equal(chart.cache[0].values[0].value, 174);
  e.event(a, chart, "connect", {
    sourceId: book.id,
    range: "D4:A1",
    labelColumn: "A",
    series: "Z",
  });
  tick(e, 3);
  assert(chart.connectionState.startsWith("区域错误"));
});
console.log(count + " review regressions passed");

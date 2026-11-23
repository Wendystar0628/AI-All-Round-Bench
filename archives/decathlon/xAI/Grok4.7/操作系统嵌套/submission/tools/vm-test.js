import { compile, makeProc, step, resume, snapshotProc, restoreProc } from "../src/nest/nest.js";

let failed = 0;
function check(name, cond) {
  if (!cond) { failed++; console.error("FAIL", name); }
  else console.log("ok", name);
}

function run(src, handler, budget = 10000) {
  const c = compile(src);
  if (!c.ok) throw new Error(c.errors.join("\n") + "\n" + src);
  const proc = makeProc(c.program);
  let guard = 0;
  while (proc.status !== "halt" && proc.status !== "error" && guard++ < 10000) {
    const r = step(proc, budget);
    if (r.reason === "trap") {
      const val = handler ? handler(r, proc) : null;
      resume(proc, val);
    }
  }
  return proc;
}

{
  const p = run(`
    fn main() {
      let i = 0;
      let s = 0;
      while (i < 100) {
        s = s + i;
        i = i + 1;
      }
      return s;
    }
  `);
  check("sum", p.result === 4950);
}

{
  const p = run(`
    fn add(a, b) { return a + b; }
    fn main() { return add(2, 40); }
  `);
  check("call", p.result === 42);
}

{
  const logs = [];
  const p = run(`
    fn main() {
      if (false && missing()) { return 1; }
      if (true || missing()) { return 2; }
      return 0;
    }
  `, (r) => { logs.push(r.name); return null; });
  check("short circuit", p.result === 2 && logs.length === 0);
}

{
  const p = run(`
    fn fact(n) {
      if (n < 2) { return 1; }
      return n * fact(n - 1);
    }
    fn main() { return fact(6); }
  `);
  check("fact", p.result === 720);
}

{
  const p = run(`
    fn main() {
      let a = [1, 2, 3];
      a[1] = 9;
      let o = { "k": 1, name: "巢" };
      o.k = o.k + 1;
      return a[1] + o.k + len(o.name);
    }
  `);
  check("index", p.status === "halt" && p.result === 12);
}

{
  const p = run(`
    fn main() {
      let s = "";
      let i = 0;
      while (i < 3) {
        s = s + str(i);
        i = i + 1;
      }
      return s;
    }
  `);
  check("concat", p.result === "012");
}

{
  const c = compile(`fn main() { let i = 0; while (true) { i = i + 1; } return i; }`);
  const proc = makeProc(c.program);
  let steps = 0;
  let saw = 0;
  while (steps < 20) {
    const r = step(proc, 25);
    steps++;
    if (proc.slots[0] > 0) saw++;
    if (r.reason === "error" || r.reason === "halt") break;
  }
  check("preempt", proc.status === "ready" && proc.slots[0] > 10 && proc.slots[0] < 10000);
}

{
  const c = compile(`fn main() { let i = 0; while (i < 1000) { i = i + 1; } return i; }`);
  const proc = makeProc(c.program);
  step(proc, 30);
  const snap = snapshotProc(proc);
  const proc2 = restoreProc(snap);
  let g = 0;
  while (proc2.status !== "halt" && proc2.status !== "error" && g++ < 5000) step(proc2, 200);
  check("snapshot", proc2.result === 1000 && proc2.status === "halt");
}

{
  const logs = [];
  const p = run(`
    fn main() {
      log(1 + 2);
      return len(json_parse("{\\"a\\":[1,2]}").a);
    }
  `, (r) => { if (r.name === "log") logs.push(r.args[0]); return null; });
  check("json", p.result === 2 && logs[0] === 3);
}

{
  const p = run(`fn main() { return 1 / 0; }`);
  check("div0", p.status === "error" && String(p.error).includes("除零"));
}

console.log(failed ? `FAILED ${failed}` : "ALL PASS");
process.exit(failed ? 1 : 0);

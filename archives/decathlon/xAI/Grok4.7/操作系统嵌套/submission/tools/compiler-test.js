import fs from "fs";
import { compile, makeProc, step, resume } from "../src/nest/nest.js";

const src = fs.readFileSync(new URL("../presets/npl/compiler.npl", import.meta.url), "utf8");
const boot = compile(src);
if (!boot.ok) {
  console.error(boot.errors);
  process.exit(1);
}
console.log("js compile compiler", boot.program.functions.main.code.length, "ops in main");

function runCompiler(program, input, limit = 5_000_000_000) {
  const proc = makeProc(program, "compiler");
  let used = 0;
  const t0 = Date.now();
  while (proc.status !== "halt" && proc.status !== "error") {
    const room = Math.min(200000, limit - used);
    if (room <= 0) throw new Error("budget exceeded at " + used);
    const r = step(proc, room);
    used += r.cost;
    if (r.reason === "trap") {
      if (r.name !== "read_in") throw new Error("unexpected syscall " + r.name);
      resume(proc, input);
    }
  }
  console.log("status", proc.status, "instr", used, "ms", Date.now() - t0, proc.error || "");
  return proc;
}

function runMain(program) {
  const proc = makeProc(program, "user");
  let used = 0;
  while (proc.status !== "halt" && proc.status !== "error" && used < 2_000_000) {
    const r = step(proc, 5000);
    used += r.cost;
    if (r.reason === "trap") resume(proc, null);
  }
  return proc;
}

const sample = `
fn add(a, b) { return a + b; }
fn main() {
  let i = 0;
  let s = 0;
  while (i < 10) {
    s = s + i;
    i = i + 1;
  }
  let o = { "k": 2 };
  o.k = o.k + 3;
  let a = [1, 2, 3];
  a[1] = 8;
  if (s == 45 && o.k == 5) { return a[1] + add(1, 1); }
  return 0;
}
`;

const first = runCompiler(boot.program, sample);
if (first.status !== "halt") {
  console.error("compiler failed", first.error);
  process.exit(1);
}
console.log("sample compile ok", first.result && first.result.ok, first.result && first.result.error);
const user = runMain(first.result.program);
console.log("sample result", user.status, user.result, user.error);

console.log("self-compile...");
const self = runCompiler(boot.program, src);
if (self.status !== "halt" || !self.result || !self.result.ok) {
  console.error("self compile failed", self.error, self.result && self.result.error);
  process.exit(1);
}
console.log("self ok, fns", Object.keys(self.result.program.functions).length);
const second = runCompiler(self.result.program, sample);
console.log("second", second.status, second.result && second.result.ok, second.result && second.result.error);
if (second.result && second.result.ok) {
  const user2 = runMain(second.result.program);
  console.log("sample via self", user2.result, user2.error);
}

const hookedSrc = src.replace("fn num_hook(n) {\n  return n;\n}", "fn num_hook(n) {\n  return n + 1;\n}");
const hooked = runCompiler(self.result.program, hookedSrc);
if (!hooked.result || !hooked.result.ok) {
  console.error("hook compile failed", hooked.result && hooked.result.error, hooked.error);
  process.exit(1);
}
const ten = runCompiler(hooked.result.program, "fn main() { return 10; }\n");
const tenProc = runMain(ten.result.program);
console.log("hooked literal 10 ->", tenProc.result);

// 根系统电子表格：四则运算、括号、单元格与区域引用、SUM、依赖重算。

const COLS = 26;
const ROWS = 48;

export function colName(i) {
  let n = i + 1;
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function parseAddr(addr) {
  const m = /^([A-Z]+)(\d+)$/.exec(String(addr || "").toUpperCase());
  if (!m) return null;
  let c = 0;
  for (const ch of m[1]) c = c * 26 + (ch.charCodeAt(0) - 64);
  const row = Number(m[2]);
  if (row < 1 || row > 500 || c < 1 || c > 200) return null;
  return { c: c - 1, r: row - 1, addr: m[1] + String(row) };
}

export function addrOf(c, r) {
  return colName(c) + String(r + 1);
}

export function createWorkbook(title = "未命名工作簿") {
  return {
    format: "nest-sheet-1",
    id: "wb-" + Math.random().toString(36).slice(2, 10),
    title,
    cells: Object.create(null),
    undo: [],
    redo: [],
    dirty: false,
  };
}

export function loadWorkbook(obj, path) {
  const wb = createWorkbook(obj.title || "工作簿");
  if (obj.id) wb.id = obj.id;
  wb.path = path || obj.path || "";
  const cells = obj.cells || {};
  for (const k of Object.keys(cells)) {
    const raw = typeof cells[k] === "string" ? cells[k] : cells[k].raw;
    if (raw != null && raw !== "") setRaw(wb, k, String(raw), false);
  }
  recalc(wb);
  wb.dirty = false;
  wb.undo = [];
  wb.redo = [];
  return wb;
}

export function serializeWorkbook(wb) {
  const cells = {};
  for (const k of Object.keys(wb.cells)) {
    if (wb.cells[k] && wb.cells[k].raw != null && wb.cells[k].raw !== "") cells[k] = { raw: wb.cells[k].raw };
  }
  return { format: "nest-sheet-1", id: wb.id, title: wb.title, cells };
}

function snapshotCells(wb) {
  const cells = {};
  for (const k of Object.keys(wb.cells)) cells[k] = wb.cells[k].raw;
  return cells;
}

function restoreCells(wb, snap) {
  wb.cells = Object.create(null);
  for (const k of Object.keys(snap)) {
    if (snap[k] != null && snap[k] !== "") setRaw(wb, k, snap[k], false);
  }
}

export function setRaw(wb, addr, raw, pushUndo = true) {
  const a = parseAddr(addr);
  if (!a) return { error: "无效单元格" };
  if (pushUndo) {
    wb.undo.push(snapshotCells(wb));
    if (wb.undo.length > 80) wb.undo.shift();
    wb.redo = [];
    wb.dirty = true;
  }
  if (raw == null || raw === "") delete wb.cells[a.addr];
  else wb.cells[a.addr] = { raw: String(raw), value: null, error: null, formula: String(raw).startsWith("=") };
  return { ok: true, addr: a.addr };
}

export function commit(wb) {
  const result = recalc(wb);
  return result;
}

export function undo(wb) {
  const snap = wb.undo.pop();
  if (!snap) return false;
  wb.redo.push(snapshotCells(wb));
  restoreCells(wb, snap);
  recalc(wb);
  wb.dirty = true;
  return true;
}

export function redo(wb) {
  const snap = wb.redo.pop();
  if (!snap) return false;
  wb.undo.push(snapshotCells(wb));
  restoreCells(wb, snap);
  recalc(wb);
  wb.dirty = true;
  return true;
}

export function recalc(wb) {
  const memo = Object.create(null);
  const visiting = [];
  let steps = 0;
  const keys = Object.keys(wb.cells);
  for (const k of keys) {
    evalCell(wb, k, memo, visiting);
    steps += 1;
  }
  // 被引用但没有公式的空单元格不在 keys 里，按需计算。
  return { steps: steps + Object.keys(memo).length, cells: keys.length };
}

function evalCell(wb, addr, memo, visiting) {
  const a = parseAddr(addr);
  if (!a) return { value: null, error: "#REF!" };
  if (memo[a.addr]) return memo[a.addr];
  if (visiting.includes(a.addr)) {
    const err = { value: null, error: "#CYCLE!" };
    for (const v of visiting) {
      memo[v] = err;
      if (wb.cells[v]) wb.cells[v].value = null, wb.cells[v].error = "#CYCLE!";
    }
    return err;
  }
  const cell = wb.cells[a.addr];
  if (!cell) {
    const r = { value: 0, error: null, blank: true };
    memo[a.addr] = r;
    return r;
  }
  if (!cell.formula) {
    const n = Number(cell.raw);
    const r = cell.raw !== "" && Number.isFinite(n) && String(cell.raw).trim() !== ""
      ? { value: n, error: null, text: null }
      : { value: cell.raw, error: null, text: String(cell.raw) };
    // 纯数字存成数字；文本保留
    if (typeof r.value === "number") {
      cell.value = r.value;
      cell.error = null;
      cell.text = null;
    } else {
      cell.value = r.value;
      cell.text = r.text;
      cell.error = null;
    }
    memo[a.addr] = { value: typeof cell.value === "number" ? cell.value : cell.value, error: null, text: cell.text || null };
    return memo[a.addr];
  }
  visiting.push(a.addr);
  let r;
  try {
    const ast = parseFormula(cell.raw.slice(1));
    r = evalAst(wb, ast, memo, visiting);
  } catch (e) {
    r = { value: null, error: e.message || "#ERR!" };
  }
  visiting.pop();
  if (r.error === "#CYCLE!") {
    cell.value = null;
    cell.error = "#CYCLE!";
    memo[a.addr] = r;
    return r;
  }
  cell.value = r.error ? null : r.value;
  cell.error = r.error;
  cell.text = null;
  memo[a.addr] = r.error ? r : { value: r.value, error: null };
  return memo[a.addr];
}

function evalAst(wb, node, memo, visiting) {
  if (!node) return { value: 0, error: null };
  if (node.k === "num") return { value: node.v, error: null };
  if (node.k === "cell") return numeric(evalCell(wb, node.addr, memo, visiting));
  if (node.k === "range") return { value: null, error: "#REF!" };
  if (node.k === "unary") {
    const v = numeric(evalAst(wb, node.a, memo, visiting));
    if (v.error) return v;
    return { value: -v.value, error: null };
  }
  if (node.k === "bin") {
    const a = numeric(evalAst(wb, node.a, memo, visiting));
    if (a.error) return a;
    const b = numeric(evalAst(wb, node.b, memo, visiting));
    if (b.error) return b;
    if (node.op === "+") return { value: a.value + b.value, error: null };
    if (node.op === "-") return { value: a.value - b.value, error: null };
    if (node.op === "*") return { value: a.value * b.value, error: null };
    if (node.op === "/") {
      if (b.value === 0) return { value: null, error: "#DIV/0!" };
      return { value: a.value / b.value, error: null };
    }
  }
  if (node.k === "sum") {
    let s = 0;
    let n = 0;
    for (const part of String(node.range).split(",")) {
      for (const addr of expandRange(part.trim())) {
        const v = numeric(evalCell(wb, addr, memo, visiting));
        if (v.error) return v;
        s += v.value;
        n++;
      }
    }
    return { value: s, error: null, work: n };
  }
  return { value: null, error: "#ERR!" };
}

function numeric(r) {
  if (!r) return { value: 0, error: null };
  if (r.error) return r;
  if (r.blank) return { value: 0, error: null };
  if (typeof r.value === "number" && Number.isFinite(r.value)) return { value: r.value, error: null };
  if (typeof r.value === "string" && r.value.trim() === "") return { value: 0, error: null };
  return { value: null, error: "#VALUE!" };
}

export function expandRange(range) {
  const [a, b] = String(range).split(":");
  const A = parseAddr(a);
  const B = parseAddr(b || a);
  if (!A || !B) return [];
  const c1 = Math.min(A.c, B.c), c2 = Math.max(A.c, B.c);
  const r1 = Math.min(A.r, B.r), r2 = Math.max(A.r, B.r);
  const out = [];
  for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) out.push(addrOf(c, r));
  return out;
}

export function rangeValues(wb, range) {
  recalc(wb);
  const addrs = expandRange(range);
  return addrs.map((addr) => {
    const cell = wb.cells[addr];
    if (!cell) return { addr, value: "", error: null, raw: "" };
    if (cell.error) return { addr, value: cell.error, error: cell.error, raw: cell.raw };
    if (cell.text != null) return { addr, value: cell.text, error: null, raw: cell.raw };
    if (typeof cell.value === "number") return { addr, value: cell.value, error: null, raw: cell.raw };
    return { addr, value: cell.value ?? "", error: null, raw: cell.raw };
  });
}

export function rangeMatrix(wb, range) {
  const [a, b] = String(range).split(":");
  const A = parseAddr(a);
  const B = parseAddr(b || a);
  if (!A || !B) return { error: "#REF!", rows: [] };
  const c1 = Math.min(A.c, B.c), c2 = Math.max(A.c, B.c);
  const r1 = Math.min(A.r, B.r), r2 = Math.max(A.r, B.r);
  const flat = Object.create(null);
  for (const item of rangeValues(wb, addrOf(c1, r1) + ":" + addrOf(c2, r2))) flat[item.addr] = item;
  const rows = [];
  for (let r = r1; r <= r2; r++) {
    const row = [];
    for (let c = c1; c <= c2; c++) row.push(flat[addrOf(c, r)]);
    rows.push(row);
  }
  return { rows, c1, c2, r1, r2 };
}

function parseFormula(src) {
  let i = 0;
  const s = src.trim();
  function peek() { return s[i]; }
  function eat() { return s[i++]; }
  function skip() { while (s[i] === " ") i++; }
  function parseExpr() { return parseAdd(); }
  function parseAdd() {
    let left = parseMul();
    skip();
    while (s[i] === "+" || s[i] === "-") {
      const op = eat();
      const right = parseMul();
      left = { k: "bin", op, a: left, b: right };
      skip();
    }
    return left;
  }
  function parseMul() {
    let left = parseUnary();
    skip();
    while (s[i] === "*" || s[i] === "/") {
      const op = eat();
      const right = parseUnary();
      left = { k: "bin", op, a: left, b: right };
      skip();
    }
    return left;
  }
  function parseUnary() {
    skip();
    if (s[i] === "-") { eat(); return { k: "unary", a: parseUnary() }; }
    return parsePrimary();
  }
  function parsePrimary() {
    skip();
    if (s[i] === "(") {
      eat();
      const e = parseExpr();
      skip();
      if (s[i] !== ")") throw new Error("#ERR!");
      eat();
      return e;
    }
    if (s[i] >= "0" && s[i] <= "9" || (s[i] === "." && s[i + 1] >= "0" && s[i + 1] <= "9")) {
      const j = i;
      while ((s[i] >= "0" && s[i] <= "9") || s[i] === ".") i++;
      return { k: "num", v: Number(s.slice(j, i)) };
    }
    if (/[A-Za-z]/.test(s[i] || "")) {
      const j = i;
      while (/[A-Za-z]/.test(s[i] || "")) i++;
      const word = s.slice(j, i).toUpperCase();
      skip();
      if (s[i] === "(") {
        eat();
        skip();
        const argStart = i;
        let depth = 1;
        while (i < s.length && depth) {
          if (s[i] === "(") depth++;
          else if (s[i] === ")") depth--;
          if (depth) i++;
        }
        const arg = s.slice(argStart, i);
        if (s[i] !== ")") throw new Error("#ERR!");
        eat();
        if (word !== "SUM") throw new Error("#NAME?");
        if (!/^[A-Z]+\d+:[A-Z]+\d+$/.test(arg.replace(/\s/g, "").toUpperCase()) && !/^[A-Z]+\d+$/.test(arg.trim().toUpperCase())) {
          // 也允许 SUM(A1,B2) 合并成多个区域
        }
        const parts = arg.split(",").map((x) => x.trim().toUpperCase());
        if (parts.length === 1) return { k: "sum", range: parts[0].includes(":") ? parts[0] : parts[0] + ":" + parts[0] };
        // 多参数：展开为加法树的 SUM 节点列表，用一个虚拟范围列表
        return { k: "sum", range: parts.map((p) => (p.includes(":") ? p : p + ":" + p)).join(",") };
      }
      const addr = word + readRow();
      skip();
      if (s[i] === ":") {
        eat();
        skip();
        const a2 = readAddr();
        return { k: "range", a: addr, b: a2 };
      }
      if (!parseAddr(addr)) throw new Error("#REF!");
      return { k: "cell", addr };
    }
    throw new Error("#ERR!");
  }
  function readRow() {
    const j = i;
    while (s[i] >= "0" && s[i] <= "9") i++;
    if (j === i) throw new Error("#REF!");
    return s.slice(j, i);
  }
  function readAddr() {
    skip();
    const j = i;
    while (/[A-Za-z]/.test(s[i] || "")) i++;
    const col = s.slice(j, i).toUpperCase();
    const row = readRow();
    const addr = col + row;
    if (!parseAddr(addr)) throw new Error("#REF!");
    return addr;
  }
  const ast = parseExpr();
  skip();
  if (i < s.length) throw new Error("#ERR!");
  if (ast && ast.k === "range") throw new Error("#REF!");
  return ast;
}

// SUM 多段：改 eval 以支持逗号。这里覆盖 sum 的 range 含逗号。
const _evalAst = evalAst;
export function adjustFormula(raw, dc, dr) {
  if (!raw || !String(raw).startsWith("=")) return raw;
  return "=" + raw.slice(1).replace(/(\$?)([A-Z]+)(\$?)(\d+)/gi, (m, ac, col, ar, row) => {
    let c = 0;
    const up = col.toUpperCase();
    for (const ch of up) c = c * 26 + (ch.charCodeAt(0) - 64);
    let nc = c - 1;
    let nr = Number(row) - 1;
    if (!ac) nc += dc;
    if (!ar) nr += dr;
    if (nc < 0 || nr < 0) return "#REF!";
    return (ac || "") + colName(nc) + (ar || "") + String(nr + 1);
  });
}

export { COLS, ROWS };

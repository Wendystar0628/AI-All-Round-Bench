'use strict';
// 一次性修补：给语言加入三元运算符 cond ? a : b（右结合，优先级最低），两个编译器同步修改。
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

function patch(file, pairs) {
  const p = path.join(root, file);
  let s = fs.readFileSync(p, 'utf8');
  for (const [a, b] of pairs) {
    const n = s.split(a).length - 1;
    if (n !== 1) throw new Error(`${file}: anchor found ${n} times: ${a.slice(0, 70)}`);
    s = s.replace(a, () => b);
  }
  fs.writeFileSync(p, s);
  console.log('patched', file);
}

patch('tools/nosc.js', [
  ["const ONE_CHAR = new Set(['+', '-', '*', '/', '%', '<', '>', '=', '!', '(', ')', '{', '}', '[', ']', ',', ';', '.', ':']);",
   "const ONE_CHAR = new Set(['+', '-', '*', '/', '%', '<', '>', '=', '!', '(', ')', '{', '}', '[', ']', ',', ';', '.', ':', '?']);"],
  [`  function parseExpr() { return parseOr(); }`,
   `  function parseExpr() {
    const c = parseOr();
    if (isOp('?')) {
      next();
      const a = parseExpr();
      expectOp(':');
      const b = parseExpr();
      return ['cond', c, a, b];
    }
    return c;
  }`],
  [`      case 'or': {
        genExpr(e[1]);
        const j = emit(['jtk', 0]);
        genExpr(e[2]);
        patch(j, here());
        return;
      }`,
   `      case 'or': {
        genExpr(e[1]);
        const j = emit(['jtk', 0]);
        genExpr(e[2]);
        patch(j, here());
        return;
      }
      case 'cond': {
        genExpr(e[1]);
        const jf = emit(['jf', 0]);
        genExpr(e[2]);
        const jend = emit(['j', 0]);
        patch(jf, here());
        genExpr(e[3]);
        patch(jend, here());
        return;
      }`],
]);

patch('assets/system/compiler.ns', [
  [`var ONE = {"+": true, "-": true, "*": true, "/": true, "%": true, "<": true, ">": true, "=": true, "!": true, "(": true, ")": true, "{": true, "}": true, "[": true, "]": true, ",": true, ";": true, ".": true, ":": true};`,
   `var ONE = {"+": true, "-": true, "*": true, "/": true, "%": true, "<": true, ">": true, "=": true, "!": true, "(": true, ")": true, "{": true, "}": true, "[": true, "]": true, ",": true, ";": true, ".": true, ":": true, "?": true};`],
  [`func parse_expr() {
    return parse_bin(0);
}`,
   `func parse_expr() {
    var c = parse_bin(0);
    if (isop("?")) {
        nexttok();
        var a = parse_expr();
        expect_op(":");
        var b = parse_expr();
        return ["cond", c, a, b];
    }
    return c;
}`],
  [`    if (k == "or") {
        gen_expr(e[1]);
        var jo = emit(["jtk", 0]);
        gen_expr(e[2]);
        patch(jo, here());
        return;
    }`,
   `    if (k == "or") {
        gen_expr(e[1]);
        var jo = emit(["jtk", 0]);
        gen_expr(e[2]);
        patch(jo, here());
        return;
    }
    if (k == "cond") {
        gen_expr(e[1]);
        var jc = emit(["jf", 0]);
        gen_expr(e[2]);
        var jce = emit(["j", 0]);
        patch(jc, here());
        gen_expr(e[3]);
        patch(jce, here());
        return;
    }`],
]);

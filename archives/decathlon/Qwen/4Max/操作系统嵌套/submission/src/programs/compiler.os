// NestedOS 编译器程序（系统内程序，用本语言编写）
// 接收 {type:"compile", payload:{reqId, source}} 消息，把源程序编译为字节码程序对象，
// 以 {type:"compiled", payload:{reqId, ok, program}} 回复内核(pid 1)。
// 修改本文件后，在编辑器中“重新编译编译器”即可让此后的程序使用新编译器。
var KW = { "var": true, "fn": true, "if": true, "else": true, "while": true, "for": true, "break": true, "continue": true, "return": true, "true": true, "false": true, "null": true };
var OPS2 = { "==": true, "!=": true, "<=": true, ">=": true, "&&": true, "||": true, "+=": true, "-=": true, "*=": true, "/=": true };
var PREC = { "||": 1, "&&": 2, "==": 3, "!=": 3, "<": 4, "<=": 4, ">": 4, ">=": 4, "+": 5, "-": 5, "*": 6, "/": 6, "%": 6 };
var SINGLE = "+-*/%()<>=!{}[];,:.?";
var toks = [];
var tp = 0;
var funcs = [];
var cur = null;
var loopStack = [];

fn isDigit(c) { var o = ord(c); return o >= 48 && o <= 57; }
fn isAlpha(c) { var o = ord(c); return (o >= 65 && o <= 90) || (o >= 97 && o <= 122) || c == "_" || c == "$"; }
fn isIdChar(c) { return isAlpha(c) || isDigit(c); }

fn lex(src) {
  var out = [];
  var i = 0;
  var line = 1;
  var n = len(src);
  while (i < n) {
    var c = sub(src, i, 1);
    if (c == "\n") { line = line + 1; i = i + 1; continue; }
    if (c == " " || c == "\t" || c == "\r") { i = i + 1; continue; }
    if (c == "/" && sub(src, i + 1, 1) == "/") {
      while (i < n && sub(src, i, 1) != "\n") { i = i + 1; }
      continue;
    }
    if (c == "/" && sub(src, i + 1, 1) == "*") {
      i = i + 2;
      while (i < n && !(sub(src, i, 1) == "*" && sub(src, i + 1, 1) == "/")) {
        if (sub(src, i, 1) == "\n") { line = line + 1; }
        i = i + 1;
      }
      i = i + 2;
      continue;
    }
    if (isDigit(c) || (c == "." && isDigit(sub(src, i + 1, 1)))) {
      var j = i;
      while (j < n && (isDigit(sub(src, j, 1)) || sub(src, j, 1) == ".")) { j = j + 1; }
      if (sub(src, j, 1) == "e" || sub(src, j, 1) == "E") {
        j = j + 1;
        if (sub(src, j, 1) == "+" || sub(src, j, 1) == "-") { j = j + 1; }
        while (j < n && isDigit(sub(src, j, 1))) { j = j + 1; }
      }
      push(out, { t: "num", v: num(sub(src, i, j - i)), line: line });
      i = j;
      continue;
    }
    if (c == "\"" || c == "'") {
      var q = c;
      var j2 = i + 1;
      var s = "";
      while (j2 < n && sub(src, j2, 1) != q) {
        var ch = sub(src, j2, 1);
        if (ch == "\\") {
          j2 = j2 + 1;
          var e = sub(src, j2, 1);
          if (e == "n") { s = s + "\n"; }
          else if (e == "t") { s = s + "\t"; }
          else if (e == "r") { s = s + "\r"; }
          else { s = s + e; }
          j2 = j2 + 1;
        } else {
          s = s + ch;
          j2 = j2 + 1;
        }
      }
      if (j2 >= n) { error("字符串未结束 (行 " + str(line) + ")"); }
      push(out, { t: "str", v: s, line: line });
      i = j2 + 1;
      continue;
    }
    if (isAlpha(c)) {
      var j3 = i;
      while (j3 < n && isIdChar(sub(src, j3, 1))) { j3 = j3 + 1; }
      var w = sub(src, i, j3 - i);
      if (has(KW, w)) { push(out, { t: w, v: w, line: line }); }
      else { push(out, { t: "id", v: w, line: line }); }
      i = j3;
      continue;
    }
    var three = sub(src, i, 3);
    if (three == "===" || three == "!==") {
      push(out, { t: "op", v: sub(three, 0, 2), line: line });
      i = i + 3;
      continue;
    }
    var two = sub(src, i, 2);
    if (has(OPS2, two)) {
      push(out, { t: "op", v: two, line: line });
      i = i + 2;
      continue;
    }
    if (find(SINGLE, c) >= 0) {
      push(out, { t: "op", v: c, line: line });
      i = i + 1;
      continue;
    }
    error("无法识别的字符 \"" + c + "\" (行 " + str(line) + ")");
  }
  push(out, { t: "eof", v: null, line: line });
  return out;
}

fn peek() { return toks[tp]; }
fn advance() { var k = toks[tp]; tp = tp + 1; return k; }
fn isTok(t, v) { var k = toks[tp]; return k.t == t && (v == null || k.v == v); }
fn expect(t, v) {
  var k = toks[tp];
  if (k.t != t || (v != null && k.v != v)) {
    var want = v;
    if (want == null) { want = t; }
    error("语法错误: 期望 " + want + " 实际 \"" + str(k.v) + "\" (行 " + str(k.line) + ")");
  }
  tp = tp + 1;
  return k;
}
fn parseBlock() {
  expect("op", "{");
  var body = [];
  while (!isTok("op", "}")) {
    if (isTok("eof", null)) { error("语法错误: 缺少 }"); }
    push(body, parseStmt());
  }
  expect("op", "}");
  return { type: "Block", body: body };
}
fn parseStmt() {
  var k = peek();
  if (k.t == "var") {
    advance();
    var name = expect("id", null).v;
    var init = null;
    if (isTok("op", "=")) { advance(); init = parseAssign(); }
    expect("op", ";");
    return { type: "Var", name: name, init: init };
  }
  if (k.t == "fn") {
    advance();
    var name2 = expect("id", null).v;
    expect("op", "(");
    var params = [];
    while (!isTok("op", ")")) {
      push(params, expect("id", null).v);
      if (isTok("op", ",")) { advance(); } else { break; }
    }
    expect("op", ")");
    return { type: "Fn", name: name2, params: params, body: parseBlock() };
  }
  if (k.t == "if") {
    advance();
    expect("op", "(");
    var cond = parseAssign();
    expect("op", ")");
    var then = parseBlock();
    var els = null;
    if (isTok("else", null)) {
      advance();
      if (isTok("if", null)) { els = parseStmt(); } else { els = parseBlock(); }
    }
    return { type: "If", cond: cond, then: then, els: els };
  }
  if (k.t == "while") {
    advance();
    expect("op", "(");
    var cond2 = parseAssign();
    expect("op", ")");
    return { type: "While", cond: cond2, body: parseBlock() };
  }
  if (k.t == "for") {
    advance();
    expect("op", "(");
    var init2 = null;
    if (!isTok("op", ";")) { init2 = parseStmt(); }
    var cond3 = null;
    if (!isTok("op", ";")) { cond3 = parseAssign(); }
    expect("op", ";");
    var step = null;
    if (!isTok("op", ")")) { step = parseAssign(); }
    expect("op", ")");
    return { type: "For", init: init2, cond: cond3, step: step, body: parseBlock() };
  }
  if (k.t == "break") { advance(); expect("op", ";"); return { type: "Break" }; }
  if (k.t == "continue") { advance(); expect("op", ";"); return { type: "Continue" }; }
  if (k.t == "return") {
    advance();
    var val = null;
    if (!isTok("op", ";")) { val = parseAssign(); }
    expect("op", ";");
    return { type: "Return", val: val };
  }
  if (k.t == "op" && k.v == "{") { return parseBlock(); }
  var e = parseAssign();
  expect("op", ";");
  return { type: "ExprStmt", expr: e };
}
fn parseAssign() {
  var left = parseExpr(0);
  if (isTok("op", "?")) {
    advance();
    var t = parseAssign();
    expect("op", ":");
    var e = parseAssign();
    return { type: "Tern", cond: left, then: t, els: e };
  }
  if (isTok("op", "=") || isTok("op", "+=") || isTok("op", "-=") || isTok("op", "*=") || isTok("op", "/=")) {
    var op = advance().v;
    var right = parseAssign();
    if (left.type != "Id" && left.type != "Index") { error("语法错误: 非法赋值目标"); }
    return { type: "Assign", op: op, target: left, value: right };
  }
  return left;
}
fn parseExpr(minPrec) {
  var left = parseUnary();
  while (true) {
    var k = peek();
    if (k.t == "op" && has(PREC, k.v) && PREC[k.v] >= minPrec) {
      advance();
      left = { type: "Bin", op: k.v, left: left, right: parseExpr(PREC[k.v] + 1) };
    } else { break; }
  }
  return left;
}
fn parseUnary() {
  if (isTok("op", "!")) { advance(); return { type: "Un", op: "!", arg: parseUnary() }; }
  if (isTok("op", "-")) { advance(); return { type: "Un", op: "-", arg: parseUnary() }; }
  return parsePostfix();
}
fn parsePostfix() {
  var e = parsePrimary();
  while (true) {
    if (isTok("op", "(")) {
      advance();
      var args = [];
      while (!isTok("op", ")")) {
        push(args, parseAssign());
        if (isTok("op", ",")) { advance(); } else { break; }
      }
      expect("op", ")");
      e = { type: "Call", callee: e, args: args };
    } else if (isTok("op", "[")) {
      advance();
      var idx = parseAssign();
      expect("op", "]");
      e = { type: "Index", obj: e, idx: idx };
    } else if (isTok("op", ".")) {
      advance();
      e = { type: "Index", obj: e, idx: { type: "Str", v: expect("id", null).v } };
    } else { break; }
  }
  return e;
}
fn parsePrimary() {
  var k = peek();
  if (k.t == "num") { advance(); return { type: "Num", v: k.v }; }
  if (k.t == "str") { advance(); return { type: "Str", v: k.v }; }
  if (k.t == "true") { advance(); return { type: "Bool", v: true }; }
  if (k.t == "false") { advance(); return { type: "Bool", v: false }; }
  if (k.t == "null") { advance(); return { type: "Null" }; }
  if (k.t == "id") { advance(); return { type: "Id", name: k.v }; }
  if (k.t == "op" && k.v == "(") { advance(); var e = parseAssign(); expect("op", ")"); return e; }
  if (k.t == "op" && k.v == "[") {
    advance();
    var items = [];
    while (!isTok("op", "]")) {
      push(items, parseAssign());
      if (isTok("op", ",")) { advance(); } else { break; }
    }
    expect("op", "]");
    return { type: "Arr", items: items };
  }
  if (k.t == "op" && k.v == "{") {
    advance();
    var entries = [];
    while (!isTok("op", "}")) {
      var key = null;
      if (isTok("str", null)) { key = advance().v; } else { key = expect("id", null).v; }
      expect("op", ":");
      push(entries, [key, parseAssign()]);
      if (isTok("op", ",")) { advance(); } else { break; }
    }
    expect("op", "}");
    return { type: "Obj", entries: entries };
  }
  error("语法错误: 意外的 \"" + str(k.v) + "\" (行 " + str(k.line) + ")");
  return null;
}

fn newFunc(name, params) {
  var f = { name: name, params: params, code: [], consts: [] };
  push(funcs, f);
  return f;
}
fn constIdx(v) {
  var i = 0;
  while (i < len(cur.consts)) {
    var c = cur.consts[i];
    if (type(c) == type(v) && type(v) != "object" && c == v) { return i; }
    i = i + 1;
  }
  push(cur.consts, v);
  return len(cur.consts) - 1;
}
fn emit(op, arg) {
  if (arg == null) { push(cur.code, [op]); }
  else { push(cur.code, [op, arg]); }
  return len(cur.code) - 1;
}
fn setJmp(idx, target) { cur.code[idx][1] = target; }
fn genBlock(node) {
  var i = 0;
  while (i < len(node.body)) { genStmt(node.body[i]); i = i + 1; }
}
fn genStmt(node) {
  var t = node.type;
  if (t == "Block") { genBlock(node); return; }
  if (t == "Var") {
    if (node.init != null) { genExpr(node.init); } else { emit("push", constIdx(null)); }
    emit("decl", node.name);
    return;
  }
  if (t == "Fn") {
    var save = cur;
    var nf = newFunc(node.name, node.params);
    var nfIdx = len(funcs) - 1;
    cur = nf;
    emit("enter", nfIdx);
    genBlock(node.body);
    emit("push", constIdx(null));
    emit("ret", null);
    cur = save;
    emit("push", constIdx({ __fnref: nfIdx }));
    emit("decl", node.name);
    return;
  }
  if (t == "If") {
    genExpr(node.cond);
    var jz = emit("jz", 0);
    genStmt(node.then);
    if (node.els != null) {
      var jmp = emit("jmp", 0);
      setJmp(jz, len(cur.code));
      genStmt(node.els);
      setJmp(jmp, len(cur.code));
    } else {
      setJmp(jz, len(cur.code));
    }
    return;
  }
  if (t == "While") {
    var start = len(cur.code);
    genExpr(node.cond);
    var jz2 = emit("jz", 0);
    push(loopStack, { breaks: [], continues: [] });
    genStmt(node.body);
    var ls = pop(loopStack);
    emit("jmp", start);
    setJmp(jz2, len(cur.code));
    var i = 0;
    while (i < len(ls.breaks)) { setJmp(ls.breaks[i], len(cur.code)); i = i + 1; }
    i = 0;
    while (i < len(ls.continues)) { setJmp(ls.continues[i], start); i = i + 1; }
    return;
  }
  if (t == "For") {
    if (node.init != null) { genStmt(node.init); }
    var start2 = len(cur.code);
    var jz3 = -1;
    if (node.cond != null) { genExpr(node.cond); jz3 = emit("jz", 0); }
    push(loopStack, { breaks: [], continues: [] });
    genStmt(node.body);
    var ls2 = pop(loopStack);
    var contTarget = len(cur.code);
    if (node.step != null) { genExpr(node.step); emit("pop", null); }
    emit("jmp", start2);
    var end = len(cur.code);
    if (jz3 >= 0) { setJmp(jz3, end); }
    var i2 = 0;
    while (i2 < len(ls2.breaks)) { setJmp(ls2.breaks[i2], end); i2 = i2 + 1; }
    i2 = 0;
    while (i2 < len(ls2.continues)) { setJmp(ls2.continues[i2], contTarget); i2 = i2 + 1; }
    return;
  }
  if (t == "Break") {
    if (len(loopStack) == 0) { error("break 不在循环中"); }
    var ls3 = loopStack[len(loopStack) - 1];
    push(ls3.breaks, emit("jmp", 0));
    return;
  }
  if (t == "Continue") {
    if (len(loopStack) == 0) { error("continue 不在循环中"); }
    var ls4 = loopStack[len(loopStack) - 1];
    push(ls4.continues, emit("jmp", 0));
    return;
  }
  if (t == "Return") {
    if (node.val != null) { genExpr(node.val); } else { emit("push", constIdx(null)); }
    emit("ret", null);
    return;
  }
  if (t == "ExprStmt") { genExpr(node.expr); emit("pop", null); return; }
  error("未知语句 " + t);
}
fn genExpr(node) {
  var t = node.type;
  if (t == "Num") { emit("push", constIdx(node.v)); return; }
  if (t == "Str") { emit("push", constIdx(node.v)); return; }
  if (t == "Bool") { emit("push", constIdx(node.v)); return; }
  if (t == "Null") { emit("push", constIdx(null)); return; }
  if (t == "Id") { emit("load", node.name); return; }
  if (t == "Arr") {
    var i = 0;
    while (i < len(node.items)) { genExpr(node.items[i]); i = i + 1; }
    emit("arr", len(node.items));
    return;
  }
  if (t == "Obj") {
    var i2 = 0;
    while (i2 < len(node.entries)) {
      emit("push", constIdx(node.entries[i2][0]));
      genExpr(node.entries[i2][1]);
      i2 = i2 + 1;
    }
    emit("obj", len(node.entries));
    return;
  }
  if (t == "Index") { genExpr(node.obj); genExpr(node.idx); emit("idx", null); return; }
  if (t == "Un") {
    genExpr(node.arg);
    if (node.op == "!") { emit("not", null); } else { emit("neg", null); }
    return;
  }
  if (t == "Tern") {
    genExpr(node.cond);
    var jzT = emit("jz", 0);
    genExpr(node.then);
    var jmpT = emit("jmp", 0);
    setJmp(jzT, len(cur.code));
    genExpr(node.els);
    setJmp(jmpT, len(cur.code));
    return;
  }
  if (t == "Bin") {
    if (node.op == "&&") {
      genExpr(node.left);
      var jz = emit("jz", 0);
      genExpr(node.right);
      var jmp = emit("jmp", 0);
      setJmp(jz, len(cur.code));
      emit("push", constIdx(false));
      setJmp(jmp, len(cur.code));
      return;
    }
    if (node.op == "||") {
      genExpr(node.left);
      var jnz = emit("jnz", 0);
      genExpr(node.right);
      var jmp2 = emit("jmp", 0);
      setJmp(jnz, len(cur.code));
      emit("push", constIdx(true));
      setJmp(jmp2, len(cur.code));
      return;
    }
    genExpr(node.left);
    genExpr(node.right);
    var map = { "+": "add", "-": "sub", "*": "mul", "/": "div", "%": "mod", "==": "eq", "!=": "ne", "<": "lt", "<=": "le", ">": "gt", ">=": "ge" };
    emit(map[node.op], null);
    return;
  }
  if (t == "Assign") {
    var tg = node.target;
    if (node.op == "=") {
      if (tg.type == "Id") { genExpr(node.value); emit("store", tg.name); }
      else { genExpr(tg.obj); genExpr(tg.idx); genExpr(node.value); emit("setidx", null); }
    } else {
      var bop = "+=";
      if (node.op == "+=") { bop = "add"; }
      if (node.op == "-=") { bop = "sub"; }
      if (node.op == "*=") { bop = "mul"; }
      if (node.op == "/=") { bop = "div"; }
      if (tg.type == "Id") {
        emit("load", tg.name);
        genExpr(node.value);
        emit(bop, null);
        emit("store", tg.name);
      } else {
        genExpr(tg.obj);
        genExpr(tg.idx);
        emit("dup2", null);
        emit("idx", null);
        genExpr(node.value);
        emit(bop, null);
        emit("setidx", null);
      }
    }
    return;
  }
  if (t == "Call") {
    genExpr(node.callee);
    var i3 = 0;
    while (i3 < len(node.args)) { genExpr(node.args[i3]); i3 = i3 + 1; }
    emit("call", len(node.args));
    return;
  }
  error("未知表达式 " + t);
}
fn compileSource(src) {
  toks = lex(src);
  tp = 0;
  funcs = [];
  loopStack = [];
  cur = newFunc("<main>", []);
  while (!isTok("eof", null)) { genStmt(parseStmt()); }
  emit("halt", null);
  return { funcs: funcs, entry: 0 };
}

while (true) {
  var m = sys_recv();
  if (m.type == "compile") {
    var prog = compileSource(m.payload.source);
    sys_send(1, "compiled", { reqId: m.payload.reqId, ok: true, program: prog });
  }
}

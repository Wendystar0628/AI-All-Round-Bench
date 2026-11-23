/* OSL 解析器：把程序文本解析为 AST（嵌套数组）。
   OSL 是 S 表达式语言：
     (set x 1) (defn f (a b) (return (+ a b)))
     (if c then else) (while c body...) (begin ...)
   字符串支持 "..." 与转义；数字、true/false/nil；'x 符号。 */
'use strict';
window.NOS = window.NOS || {};

class OSLParseError extends Error {}

function tokenize(src) {
  const toks = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === ';') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '#') {
      // #| ... |# 块注释 或 行注释
      if (src[i + 1] === '|') {
        i += 2;
        while (i < n && !(src[i] === '|' && src[i + 1] === '#')) i++;
        i += 2;
        continue;
      }
      while (i < n && src[i] !== '\n') i++; continue;
    }
    if (/\s/.test(c)) { i++; continue; }
    if (c === '(' || c === ')' || c === '[' || c === ']' || c === '{' || c === '}' || c === "'") { toks.push(c); i++; continue; }
    if (c === '"') {
      let j = i + 1, s = '';
      while (j < n && src[j] !== '"') {
        if (src[j] === '\\') {
          const e = src[j + 1];
          if (e === 'n') s += '\n';
          else if (e === 't') s += '\t';
          else if (e === 'r') s += '\r';
          else if (e === '\\') s += '\\';
          else if (e === '"') s += '"';
          else if (e === 'x') { s += String.fromCharCode(parseInt(src.substr(j + 2, 2), 16)); j += 2; }
          else s += e;
          j += 2;
        } else { s += src[j]; j++; }
      }
      if (j >= n) throw new OSLParseError('未闭合字符串');
      toks.push({ str: s });
      i = j + 1;
      continue;
    }
    let j = i;
    while (j < n && !/[\s()\[\]{}'"#;]/.test(src[j])) j++;
    toks.push(src.slice(i, j));
    i = j;
  }
  return toks;
}

function atom(tok) {
  if (typeof tok === 'object') return tok.str;
  if (tok === 'true') return true;
  if (tok === 'false') return false;
  if (tok === 'nil' || tok === 'null') return null;
  if (/^-?\d+(\.\d+)?$/.test(tok)) return Number(tok);
  return { sym: tok };
}

function parseTokens(toks) {
  let pos = 0;
  function parseOne() {
    if (pos >= toks.length) throw new OSLParseError('意外的结尾');
    const t = toks[pos++];
    if (t === '(' || t === '[') {
      const close = t === '(' ? ')' : ']';
      const list = [];
      while (toks[pos] !== close) {
        if (pos >= toks.length) throw new OSLParseError('未闭合括号');
        list.push(parseOne());
      }
      pos++;
      return list;
    }
    if (t === ')' || t === ']') throw new OSLParseError('多余括号');
    if (t === "'") return [ { sym: 'quote' }, parseOne() ];
    if (t === '{' || t === '}') return atom(t);
    return atom(t);
  }
  const forms = [];
  while (pos < toks.length) forms.push(parseOne());
  return forms;
}

function parseOSL(src) {
  return parseTokens(tokenize(src));
}

/* 把 AST 转为可 JSON 序列化的程序对象：
   { forms: [...], defs: {name: {params, body}}, globalsInit:[...] } */
function compileAST(ast) {
  const defs = {};
  const globals = [];
  for (const form of ast) {
    if (Array.isArray(form) && form[0] && form[0].sym === 'defn') {
      const name = form[1].sym || form[1];
      defs[name] = { params: form[2].map(p => p.sym || p), body: form.slice(3) };
    } else if (Array.isArray(form) && form[0] && form[0].sym === 'def') {
      // (def name value) 顶层常量
      defs['__def_' + (form[1].sym || form[1])] = { params: [], body: [['return', form[2]]] };
      globals.push(form[1].sym || form[1]);
    }
  }
  return { v: 1, ast, defs, globals };
}

NOS.osl = { parse: parseOSL, tokenize, compileAST, OSLParseError };

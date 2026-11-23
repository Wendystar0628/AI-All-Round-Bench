window.Nexus = window.Nexus || {};
(function (N) {
  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const now = () => Date.now();
  let sequence = 1;
  const uid = prefix => `${prefix}-${now().toString(36)}-${(sequence++).toString(36)}`;
  const normalize = path => {
    const parts = [];
    String(path || '/').replace(/\\/g, '/').split('/').forEach(part => {
      if (!part || part === '.') return;
      if (part === '..') parts.pop(); else parts.push(part);
    });
    return '/' + parts.join('/');
  };
  const dirname = path => normalize(path).split('/').slice(0, -1).join('/') || '/';
  const basename = path => normalize(path).split('/').pop() || '/';
  const join = (base, name) => normalize(base + '/' + name);
  const formatTime = seconds => {
    const value = Math.max(0, Number(seconds) || 0);
    const minutes = Math.floor(value / 60);
    const secs = Math.floor(value % 60);
    const centis = Math.floor((value % 1) * 100);
    return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(centis).padStart(2, '0')}`;
  };
  Object.assign(N, { clone, clamp, uid, normalize, dirname, basename, join, formatTime });

  class VFS {
    constructor(entries) { this.entries = entries || {}; this.trashSequence = 1; }
    static initial(kind, assets) {
      const vfs = new VFS();
      ['/Documents', '/Downloads', '/Recycle', '/Demo', '/Programs', '/System', '/System/apps', '/Systems'].forEach(path => vfs.mkdir(path));
      const programs = N.defaultPrograms();
      Object.entries(programs).forEach(([path, content]) => vfs.write(path, content));
      if (assets && assets.scene) vfs.write('/Demo/helicopter-24.scene', assets.scene);
      if (assets && assets.minimalScene) vfs.write('/Demo/minimal.scene', assets.minimalScene);
      vfs.write('/Documents/欢迎使用.txt', `欢迎来到 ${kind === 'outer' ? 'NEXUS 嵌合系统' : kind}。\n\n这里的文件、程序、进程与窗口均属于当前系统实例。\n打开“操作说明”可以查看程序格式与系统接口。`);
      vfs.write('/Programs/问候.txt', '你好，来自一个真实运行的 NEXUS 程序。');
      if (kind === 'outer') {
        const workbook = {
          format: 'nexus-sheet-1', id: 'workbook-demo', title: '飞行物资清单',
          cells: {
            A1: { raw: '项目', bold: true, bg: '#302a48' }, B1: { raw: '数量', bold: true, bg: '#302a48' }, C1: { raw: '单价', bold: true, bg: '#302a48' }, D1: { raw: '小计', bold: true, bg: '#302a48' },
            A2: { raw: '项目 A' }, B2: { raw: '24' }, C2: { raw: '6' }, D2: { raw: '=B2*C2' },
            A3: { raw: '项目 B' }, B3: { raw: '12' }, C3: { raw: '8' }, D3: { raw: '=B3*C3' },
            A4: { raw: '项目 C' }, B4: { raw: '18' }, C4: { raw: '4' }, D4: { raw: '=B4*C4' }
          }
        };
        vfs.write('/Demo/sample.sheet', JSON.stringify(workbook, null, 2));
        vfs.write('/Documents/飞行观察笔记.txt', '24 号机 / 黄昏测试\n\n旋翼启动后注意下洗尘土。\n故障征兆出现时，保持观察。\n第二停机坪可用于飞行排演降落。');
      }
      vfs.write('/Recycle/1-旧航行日志.txt', '已删除的上次航行日志。可在回收站恢复。');
      vfs.get('/Recycle/1-旧航行日志.txt').originalPath = '/Documents/旧航行日志.txt';
      vfs.trashSequence = 2;
      return vfs;
    }
    exists(path) { return !!this.entries[normalize(path)]; }
    get(path) { return this.entries[normalize(path)] || null; }
    mkdir(path) {
      path = normalize(path);
      if (this.entries[path]) return { ok: true };
      const parent = dirname(path);
      if (parent !== path && !this.entries[parent]) this.mkdir(parent);
      this.entries[path] = { type: 'dir', modified: now() };
      return { ok: true };
    }
    list(path = '/', sort = 'name') {
      path = normalize(path);
      const prefix = path === '/' ? '/' : path + '/';
      return Object.entries(this.entries).filter(([key]) => key !== path && key.startsWith(prefix) && !key.slice(prefix.length).includes('/')).map(([key, entry]) => ({
        path: key, name: basename(key), type: entry.type, size: entry.type === 'file' ? new Blob([entry.content || '']).size : 0, modified: entry.modified || now(), originalPath: entry.originalPath
      })).sort((a, b) => {
        if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
        if (sort === 'modified') return b.modified - a.modified;
        if (sort === 'size') return b.size - a.size;
        if (sort === 'reverse') return b.name.localeCompare(a.name, 'zh-CN');
        return a.name.localeCompare(b.name, 'zh-CN');
      });
    }
    read(path) {
      const entry = this.get(path);
      if (!entry || entry.type !== 'file') throw new Error(`文件不存在：${normalize(path)}`);
      return entry.content;
    }
    write(path, content) {
      path = normalize(path);
      if (path === '/') throw new Error('不能覆盖根目录');
      if (!this.exists(dirname(path))) this.mkdir(dirname(path));
      const previous = this.get(path);
      if (previous && previous.type === 'dir') throw new Error('目标是目录');
      this.entries[path] = { type: 'file', content: String(content ?? ''), modified: now() };
      return { ok: true, size: new Blob([String(content ?? '')]).size };
    }
    copy(source, target) {
      source = normalize(source); target = normalize(target);
      const entry = this.get(source);
      if (!entry) throw new Error(`源路径不存在：${source}`);
      if (entry.type === 'file') return this.write(target, entry.content);
      this.mkdir(target);
      Object.entries(this.entries).filter(([path]) => path.startsWith(source + '/')).forEach(([path, value]) => {
        const destination = target + '/' + path.slice(source.length + 1);
        if (value.type === 'dir') this.mkdir(destination); else this.write(destination, value.content);
      });
      return { ok: true };
    }
    rename(source, target) {
      source = normalize(source); target = normalize(target);
      const entry = this.get(source);
      if (!entry) throw new Error('源路径不存在');
      if (target.startsWith(source + '/')) throw new Error('不能移动到自身内部');
      const affected = Object.keys(this.entries).filter(path => path === source || path.startsWith(source + '/'));
      affected.sort((a, b) => a.length - b.length).forEach(path => {
        const destination = target + path.slice(source.length);
        this.entries[destination] = this.entries[path];
        this.entries[destination].modified = now();
        delete this.entries[path];
      });
      return { ok: true };
    }
    remove(path, useTrash = true) {
      path = normalize(path);
      const entry = this.get(path);
      if (!entry) throw new Error('文件不存在');
      if (path === '/' || path === '/Recycle') throw new Error('不能删除此目录');
      if (useTrash && !path.startsWith('/Recycle/')) {
        const target = `/Recycle/${this.trashSequence++}-${basename(path)}`;
        this.rename(path, target);
        this.entries[target].originalPath = path;
      } else {
        Object.keys(this.entries).filter(key => key === path || key.startsWith(path + '/')).forEach(key => delete this.entries[key]);
      }
      return { ok: true };
    }
    restore(path) {
      const entry = this.get(path);
      if (!entry || !entry.originalPath) throw new Error('没有可恢复的原始位置');
      const target = entry.originalPath;
      delete entry.originalPath;
      this.rename(path, target);
      return { ok: true, path: target };
    }
    size() { return Object.values(this.entries).reduce((sum, entry) => sum + (entry.content ? new Blob([entry.content]).size : 64), 0); }
    serialize() { return { entries: clone(this.entries), trashSequence: this.trashSequence }; }
    static restore(data) { const vfs = new VFS(clone(data.entries)); vfs.trashSequence = data.trashSequence || 1; return vfs; }
  }
  N.VFS = VFS;

  function tokenizeExpression(source) {
    const tokens = [];
    let i = 0;
    while (i < source.length) {
      const c = source[i];
      if (/\s/.test(c)) { i++; continue; }
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(source[i + 1]))) {
        const match = source.slice(i).match(/^(?:\d+\.?\d*|\.\d+)/);
        tokens.push({ type: 'number', value: Number(match[0]) }); i += match[0].length; continue;
      }
      if (c === '"' || c === "'") {
        const quote = c; let value = ''; i++;
        while (i < source.length && source[i] !== quote) {
          if (source[i] === '\\') {
            const escaped = source[++i]; value += escaped === 'n' ? '\n' : escaped === 't' ? '\t' : escaped; i++;
          } else value += source[i++];
        }
        if (source[i] !== quote) throw new Error('字符串缺少结束引号');
        i++; tokens.push({ type: 'literal', value }); continue;
      }
      if (/[A-Za-z_$\u4e00-\u9fff]/.test(c)) {
        const match = source.slice(i).match(/^[A-Za-z_$\u4e00-\u9fff][\w$\u4e00-\u9fff]*/);
        tokens.push({ type: 'identifier', value: match[0] }); i += match[0].length; continue;
      }
      const operator = ['>=', '<=', '==', '!=', '&&', '||', '**'].find(op => source.startsWith(op, i));
      if (operator) { tokens.push({ type: 'op', value: operator }); i += operator.length; continue; }
      if ('+-*/%><!().[],'.includes(c)) { tokens.push({ type: 'op', value: c }); i++; continue; }
      throw new Error(`无法识别表达式字符：${c}`);
    }
    return tokens;
  }

  class ExpressionParser {
    constructor(source) { this.tokens = tokenizeExpression(source); this.index = 0; }
    peek(value) { return this.tokens[this.index] && (value == null || this.tokens[this.index].value === value); }
    take(value) {
      const token = this.tokens[this.index];
      if (!token || (value != null && token.value !== value)) throw new Error(`表达式需要 ${value}`);
      this.index++; return token;
    }
    parse() { const ast = this.or(); if (this.index < this.tokens.length) throw new Error(`多余表达式：${this.tokens[this.index].value}`); return ast; }
    or() { let node = this.and(); while (this.peek('||')) { this.take(); node = { t: 'binary', op: '||', a: node, b: this.and() }; } return node; }
    and() { let node = this.compare(); while (this.peek('&&')) { this.take(); node = { t: 'binary', op: '&&', a: node, b: this.compare() }; } return node; }
    compare() { let node = this.add(); while (this.peek() && ['>', '<', '>=', '<=', '==', '!='].includes(this.tokens[this.index].value)) { const op = this.take().value; node = { t: 'binary', op, a: node, b: this.add() }; } return node; }
    add() { let node = this.multiply(); while (this.peek() && ['+', '-'].includes(this.tokens[this.index].value)) { const op = this.take().value; node = { t: 'binary', op, a: node, b: this.multiply() }; } return node; }
    multiply() { let node = this.unary(); while (this.peek() && ['*', '/', '%'].includes(this.tokens[this.index].value)) { const op = this.take().value; node = { t: 'binary', op, a: node, b: this.unary() }; } return node; }
    unary() { if (this.peek('!') || this.peek('-')) { const op = this.take().value; return { t: 'unary', op, value: this.unary() }; } return this.member(); }
    member() {
      let node = this.primary();
      while (this.peek('.')) {
        this.take(); const property = this.take().value; node = { t: 'member', object: node, property };
      }
      return node;
    }
    primary() {
      if (this.peek('(')) { this.take(); const node = this.or(); this.take(')'); return node; }
      const token = this.tokens[this.index++];
      if (!token) throw new Error('表达式不完整');
      if (token.type === 'number' || token.type === 'literal') return { t: 'literal', value: token.value };
      if (token.type === 'identifier') {
        if (token.value === 'true') return { t: 'literal', value: true };
        if (token.value === 'false') return { t: 'literal', value: false };
        if (token.value === 'null') return { t: 'literal', value: null };
        return { t: 'name', name: token.value };
      }
      throw new Error(`表达式标记无效：${token.value}`);
    }
  }
  function evaluate(ast, vars) {
    if (!ast) return null;
    if (ast.t === 'literal') return clone(ast.value);
    if (ast.t === 'name') return clone(vars[ast.name]);
    if (ast.t === 'member') { const object = evaluate(ast.object, vars); return object == null ? null : clone(object[ast.property]); }
    if (ast.t === 'unary') { const value = evaluate(ast.value, vars); return ast.op === '!' ? !value : -Number(value); }
    const a = evaluate(ast.a, vars);
    if (ast.op === '&&') return a && evaluate(ast.b, vars);
    if (ast.op === '||') return a || evaluate(ast.b, vars);
    const b = evaluate(ast.b, vars);
    switch (ast.op) {
      case '+': return typeof a === 'string' || typeof b === 'string' ? String(a) + String(b) : Number(a) + Number(b);
      case '-': return Number(a) - Number(b); case '*': return Number(a) * Number(b);
      case '/': return Number(b) === 0 ? NaN : Number(a) / Number(b); case '%': return Number(a) % Number(b);
      case '>': return a > b; case '<': return a < b; case '>=': return a >= b; case '<=': return a <= b;
      case '==': return a === b; case '!=': return a !== b; default: return null;
    }
  }
  function splitArguments(source) {
    const parts = []; let current = ''; let depth = 0; let quote = null;
    for (let i = 0; i < source.length; i++) {
      const c = source[i];
      if (quote) { current += c; if (c === '\\') { current += source[++i] || ''; } else if (c === quote) quote = null; continue; }
      if (c === '"' || c === "'") { quote = c; current += c; continue; }
      if (c === '(') depth++; if (c === ')') depth--;
      if (/\s/.test(c) && depth === 0) { if (current) { parts.push(current); current = ''; } } else current += c;
    }
    if (current) parts.push(current);
    return parts;
  }

  function compile(source) {
    const instructions = []; const labels = {};
    String(source).replace(/\r/g, '').split('\n').forEach((raw, lineIndex) => {
      const line = raw.trim();
      if (!line || line.startsWith('//') || line.startsWith('#')) return;
      const words = splitArguments(line);
      const op = words[0].toUpperCase();
      if (op === 'LABEL') {
        if (!words[1]) throw new Error(`第 ${lineIndex + 1} 行缺少标签`);
        labels[words[1]] = instructions.length;
        instructions.push({ op, name: words[1], line: lineIndex + 1 }); return;
      }
      let instruction = { op, line: lineIndex + 1, raw };
      if (op === 'LET' || op === 'CALC' || op === 'SET') {
        instruction.name = words[1];
        instruction.expr = new ExpressionParser(line.slice(line.indexOf(words[1]) + words[1].length)).parse();
      } else if (op === 'IF') {
        const goto = words.indexOf('GOTO');
        if (goto < 0) throw new Error(`第 ${lineIndex + 1} 行 IF 需要 GOTO`);
        instruction.expr = new ExpressionParser(words.slice(1, goto).join(' ')).parse();
        instruction.target = words[goto + 1];
      } else if (op === 'GOTO') instruction.target = words[1];
      else if (op === 'WAIT') instruction.expr = new ExpressionParser(words.slice(1).join(' ')).parse();
      else if (op === 'PRINT') instruction.expr = new ExpressionParser(line.slice(5)).parse();
      else if (op === 'SEND') {
        const rest = line.slice(4).trim(); const args = splitArguments(rest);
        instruction.targetExpr = new ExpressionParser(args[0]).parse();
        instruction.expr = new ExpressionParser(rest.slice(args[0].length)).parse();
      } else if (op === 'SPAWN' || op === 'KILL' || op === 'RECV' || op === 'CALL') {
        if (op === 'CALL') {
          instruction.service = words[1];
          let rest = line.slice(line.indexOf(words[1]) + words[1].length).trim();
          const output = rest.match(/(?:^|\s)=>\s*([\w$\u4e00-\u9fff]+)\s*$/);
          if (output) { instruction.output = output[1]; rest = rest.slice(0, output.index); }
          instruction.args = splitArguments(rest).map(arg => new ExpressionParser(arg).parse());
        } else if (op === 'SPAWN') {
          const output = words.indexOf('=>'); instruction.expr = new ExpressionParser(words[1]).parse(); instruction.output = output > 0 ? words[output + 1] : null;
        } else if (op === 'KILL') instruction.expr = new ExpressionParser(words[1]).parse();
        else { const output = words.indexOf('=>'); instruction.output = output > 0 ? words[output + 1] : 'message'; }
      } else if (!['YIELD', 'END', 'NOP'].includes(op)) throw new Error(`第 ${lineIndex + 1} 行：未知指令 ${op}`);
      instructions.push(instruction);
    });
    return { instructions, labels, source: String(source), version: 'nexus-vm-1' };
  }
  N.compile = compile;

  class Process {
    constructor(system, path, source, options = {}) {
      this.id = options.id || uid('pid'); this.systemId = system.id; this.name = options.name || basename(path);
      this.path = path; this.code = compile(source); this.pc = 0; this.vars = clone(options.vars || {});
      this.state = 'ready'; this.waitUntil = 0; this.waitingFor = null; this.inbox = [];
      this.output = []; this.error = null; this.quota = options.quota || 1800; this.work = 0; this.ownWork = 0;
      this.descendantWork = 0; this.tickWork = 0; this.appId = options.appId || null; this.windowId = options.windowId || null;
      this.carrierFor = options.carrierFor || null; this.createdAt = system.time; this.remainingWork = 0; this.memory = 64;
      this.started = true;
    }
    get instructionCost() { return this.instructionCostValue || 8; }
    runSlice(system, budget, forcedDt = null) {
      let used = 0; let iterations = 0;
      if (this.state === 'ended' || this.state === 'error' || this.state === 'suspended') return 0;
      if (this.carrierFor && forcedDt == null) {
        const child = system.os.systems.get(this.carrierFor);
        if (!child || child.state !== 'running') return 0;
      }
      if (this.waitingFor === 'time' && system.time + 1e-8 < this.waitUntil) { this.state = 'waiting'; return 0; }
      if (this.waitingFor === 'message' && !this.inbox.length) { this.state = 'waiting'; return 0; }
      if (this.state === 'waiting') this.state = 'ready';
      while (used + this.instructionCost <= budget && iterations++ < 500 && !['ended', 'error', 'suspended', 'waiting'].includes(this.state)) {
        const instruction = this.code.instructions[this.pc];
        if (!instruction) { this.state = 'ended'; break; }
        this.state = 'running';
        let advance = true; let cost = this.instructionCost;
        try {
          const value = expr => evaluate(expr, this.vars);
          switch (instruction.op) {
            case 'LABEL': case 'NOP': break;
            case 'LET': case 'CALC': case 'SET': this.vars[instruction.name] = value(instruction.expr); break;
            case 'IF': this.pc = value(instruction.expr) ? this.code.labels[instruction.target] : this.pc + 1; advance = false; break;
            case 'GOTO':
              if (this.code.labels[instruction.target] == null) throw new Error(`标签不存在：${instruction.target}`);
              this.pc = this.code.labels[instruction.target]; advance = false; break;
            case 'WAIT': {
              const seconds = Math.max(0, Number(value(instruction.expr)) || 0);
              this.waitUntil = system.time + seconds; this.waitingFor = 'time'; this.state = 'waiting'; break;
            }
            case 'RECV':
              if (!this.inbox.length) { this.waitingFor = 'message'; this.state = 'waiting'; advance = false; }
              else this.vars[instruction.output] = clone(this.inbox.shift().value);
              break;
            case 'SEND': {
              const target = value(instruction.targetExpr);
              system.mailbox.push({ id: uid('msg'), from: this.id, to: target, value: value(instruction.expr), sentAt: system.time, sequence: system.messageSequence++ });
              cost += 8 + JSON.stringify(value(instruction.expr) || '').length;
              break;
            }
            case 'SPAWN': {
              const result = system.spawnProgram(value(instruction.expr));
              if (instruction.output) this.vars[instruction.output] = result ? result.id : null;
              cost += 24; break;
            }
            case 'KILL': cost += 12; system.endProcess(value(instruction.expr)); break;
            case 'PRINT': {
              const printed = value(instruction.expr); this.output.push({ time: system.time, text: typeof printed === 'object' ? JSON.stringify(printed) : String(printed) });
              if (this.output.length > 100) this.output.shift(); cost += String(printed).length; break;
            }
            case 'YIELD': this.state = 'ready'; used += cost; this.work += cost; this.ownWork += cost; this.tickWork += cost; this.pc++; system.services.afterInstruction(this, cost); return used;
            case 'END': this.state = 'ended'; break;
            case 'CALL': {
              const args = instruction.args.map(value);
              const result = system.services.call(this, instruction.service, args, budget - used - cost, forcedDt);
              if (result && result.__wait) { this.state = 'waiting'; this.waitingFor = result.waitingFor || 'service'; advance = false; }
              else {
                if (instruction.output) this.vars[instruction.output] = clone(result && Object.prototype.hasOwnProperty.call(result, 'value') ? result.value : result);
                if (result && result.cost) cost += result.cost;
                if (result && result.descendantCost) { this.descendantWork += result.descendantCost; cost += result.descendantCost; }
              }
              break;
            }
          }
          if (!Number.isFinite(cost) || cost < 0) cost = this.instructionCost;
          if (used + cost > budget) {
            this.state = 'ready';
            break;
          }
          used += cost; this.work += cost; this.ownWork += cost; this.tickWork += cost;
          this.memory = Math.min(512 * 1024 * 1024, 64 + JSON.stringify(this.vars).length * 2 + this.inbox.reduce((sum, msg) => sum + JSON.stringify(msg).length * 2, 0) + this.output.length * 128);
          system.services.afterInstruction(this, cost);
          if (advance) this.pc++;
          if (this.pc >= this.code.instructions.length && this.state !== 'waiting') this.state = 'ended';
        } catch (error) {
          this.error = `第 ${instruction.line} 行：${error.message}`; this.state = 'error'; this.output.push({ time: system.time, text: this.error, error: true });
          if (this.carrierFor) {
            const child = system.os.systems.get(this.carrierFor);
            if (child) { child.state = 'error'; child.kernelError = this.error; }
          }
        }
      }
      if (this.state === 'running') this.state = 'ready';
      return used;
    }
    serialize() {
      const data = {};
      Object.entries(this).forEach(([key, value]) => { if (typeof value !== 'function') data[key] = clone(value); });
      return data;
    }
    static restore(data) {
      const process = Object.create(Process.prototype); Object.assign(process, clone(data)); return process;
    }
  }
  N.Process = Process;

  class Services {
    constructor(system) { this.system = system; }
    afterInstruction() {}
    call(process, name, args, remaining, forcedDt) {
      const s = this.system; const os = s.os;
      const value = data => ({ value: clone(data), cost: 8 + (data == null ? 0 : JSON.stringify(data).length * .25) });
      switch (name) {
        case 'sys.time': return value(s.time);
        case 'sys.self': return value(process.id);
        case 'sys.identity': return value({ systemId: s.id, pid: process.id, appId: process.appId, windowId: process.windowId });
        case 'sys.spawn': { const child = s.spawnProgram(String(args[0]), { appId: process.appId }); return value(child ? child.id : null); }
        case 'sys.kill': s.endProcess(args[0]); return value(true);
        case 'fs.read': return value(s.fs.read(String(args[0])));
        case 'fs.write': { if (s.filePolicy === 'readonly') throw new Error('内核文件策略：本系统为只读'); s.assertStorage(String(args[1] || '').length - (s.fs.get(String(args[0]))?.content?.length || 0)); s.fs.write(String(args[0]), String(args[1] ?? '')); return value(true); }
        case 'fs.list': return value(s.fs.list(String(args[0] || '/'), String(args[1] || 'name')));
        case 'fs.mkdir': s.fs.mkdir(String(args[0])); return value(true);
        case 'fs.delete': s.fs.remove(String(args[0])); return value(true);
        case 'fs.copy': s.fs.copy(String(args[0]), String(args[1])); return value(true);
        case 'device.log': os.notify(s.id, '程序输出', String(args[0])); return value(true);
        case 'sys.launch': {
          if (!process.carrierFor) throw new Error('sys.launch 只允许内核调用');
          const child = os.systems.get(process.carrierFor); if (!child) return value(0);
          return value(child.launchPrograms());
        }
        case 'sys.schedule': {
          if (!process.carrierFor) throw new Error('sys.schedule 只允许承载内核调用');
          const child = os.systems.get(process.carrierFor);
          if (!child) return value(0);
          const quantum = clamp(Number(args[1]) || 640, 80, 5000);
          const innerBudget = Math.floor(Math.min(remaining, child.budget) * .65);
          const result = child.executeFromKernel(innerBudget, forcedDt == null ? .05 : forcedDt, quantum, String(args[0] || 'round-robin'));
          return { value: result.used, cost: 10, descendantCost: result.used };
        }
        case 'sys.deliver': {
          if (!process.carrierFor) throw new Error('sys.deliver 只允许内核调用');
          const child = os.systems.get(process.carrierFor); if (!child) return value(0);
          const count = child.deliverMessages(String(args[0] || 'fifo'));
          return value(count);
        }
        case 'sys.windows': {
          if (!process.carrierFor) throw new Error('sys.windows 只允许内核调用');
          const child = os.systems.get(process.carrierFor); if (!child) return value(0);
          const count = child.dispatchInput(String(args[0] || 'focus'));
          return value(count);
        }
        case 'sys.clock': {
          if (!process.carrierFor) throw new Error('sys.clock 只允许内核调用');
          const child = os.systems.get(process.carrierFor); if (!child) return value(0);
          const dt = forcedDt == null ? Number(args[0]) || .05 : forcedDt;
          if (forcedDt != null || child.lastClockParentFrame !== s.frame) {
            child.time += dt * child.rate; child.frame++; child.lastClockParentFrame = s.frame;
          }
          return value(child.time);
        }
        case 'sys.register': {
          if (!process.carrierFor) throw new Error('sys.register 只允许内核调用');
          const child = os.systems.get(process.carrierFor); if (!child) return value(false);
          child.customSyscalls[String(args[0])] = { value: clone(args[1]) }; return value(true);
        }
        case 'sys.filePolicy': {
          if (!process.carrierFor) throw new Error('sys.filePolicy 只允许内核调用');
          const child = os.systems.get(process.carrierFor); if (!child) return value(false);
          child.filePolicy = String(args[0] || 'normal'); return value(child.filePolicy);
        }
        case 'compiler.compile': {
          const compiled = compile(String(args[0] || '')); return value({ valid: true, instructions: compiled.instructions.length, version: compiled.version });
        }
        case 'wm.dispatch': return value(s.windowManagerService(process, args[0]));
        case 'files.poll': return value(s.fileService(process, args[0]));
        case 'editor.poll': return value(s.editorService(process));
        case 'tasks.poll': return value(s.tasksService(process));
        case 'device.files': s.updateAppView(process, { path: args[0], items: args[1] }); return value(true);
        case 'player.control': return value(s.playerControl(process));
        case 'player.tick': { const result = s.playerTick(process, Number(args[0]) || 1); return { value: clone(result), cost: 8 + (result?.work || 0) }; }
        case 'player.emit': { const app = s.apps[process.windowId]; const cost = 30 + (app?.flight ? 180 : 30); return { value: clone(s.playerEmit(process)), cost }; }
        case 'player.sample': {
          const app = s.apps[process.windowId]; const cost = 100 + (app?.resource?.parts?.length || 0) * 12 + (app?.sceneState?.particles?.length || 0) * 2;
          if (remaining < cost) { process.remainingWork = cost; return { __wait: true, waitingFor: 'budget' }; }
          process.remainingWork = 0; return { value: clone(s.playerSample(process, args[0])), cost };
        }
        case 'player.effects': return value(s.playerEffects(process, args[0]));
        case 'flight.sense': return value(s.flightSense(process));
        case 'flight.control': return value(s.flightControl(process, args));
        case 'chart.receive': { const cost = 12 + JSON.stringify(args[0] || null).length * .15; return { value: clone(s.chartReceive(process, args[0])), cost }; }
        case 'chart.forward': return value(s.chartForward(process, args[0]));
        case 'chart.compute': {
          const cost = 40 + JSON.stringify(args[0]?.data || []).length * .25;
          if (remaining < cost) { process.remainingWork = cost; return { __wait: true, waitingFor: 'budget' }; }
          process.remainingWork = 0; return { value: clone(s.chartCompute(process, args[0], String(args[1] || 'numeric'), String(args[2] || 'none'))), cost };
        }
        default: {
          const custom = s.customSyscalls[name];
          if (custom) return value(typeof custom === 'function' ? custom(args, process) : custom.value);
          throw new Error(`未知系统调用：${name}`);
        }
      }
    }
  }

  class SystemNode {
    constructor(os, id, parentId, options = {}) {
      this.os = os; this.id = id; this.parentId = parentId; this.name = options.name || (id === 'outer' ? 'NEXUS 根系统' : id);
      this.kind = id === 'outer' ? 'outer' : 'inner'; this.fs = options.fs || VFS.initial(id, os.assets);
      this.time = options.time || 0; this.rate = options.rate || 1; this.state = options.state || 'running'; this.frame = 0;
      this.budget = options.budget || (id === 'outer' ? 48000 : 22000); this.memoryQuota = options.memoryQuota || (id === 'outer' ? 4096 : 384);
      this.storageQuota = options.storageQuota || (id === 'outer' ? 1024 : 96); this.childGrant = options.childGrant || 15000;
      this.processes = []; this.mailbox = []; this.messageSequence = 1; this.inputQueue = []; this.launchQueue = []; this.customSyscalls = {};
      this.apps = {}; this.children = []; this.kernelError = null; this.stats = { tickWork: 0, totalWork: 0, actualGrant: 0, remainingWork: 0 };
      this.settings = { wallpaper: 'dusk', accent: '#a98bff', scale: 1, dnd: false };
      this.randomState = options.randomState || 2463534242; this.services = new Services(this); this.desktop = null; this.zCounter = 100;
      this.createdAt = now();
    }
    get depth() { let depth = 1, node = this; while (node.parentId) { node = this.os.systems.get(node.parentId); depth++; if (depth > 20) break; } return depth; }
    effectiveRunning() {
      if (this.state !== 'running') return false;
      let parent = this.parentId && this.os.systems.get(this.parentId);
      while (parent) { if (parent.state !== 'running') return false; parent = parent.parentId && this.os.systems.get(parent.parentId); }
      return true;
    }
    random() { let x = this.randomState | 0; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; this.randomState = x | 0; return (x >>> 0) / 4294967296; }
    spawnProgram(path, options = {}) {
      try {
        const source = this.fs.read(path);
        const process = new Process(this, path, source, options);
        const compilerSource = this.fs.exists('/System/compiler.os') ? this.fs.read('/System/compiler.os') : '';
        const cost = compilerSource.match(/LET\s+instructionCost\s+(\d+(?:\.\d+)?)/);
        if (cost) process.instructionCostValue = Math.max(1, Number(cost[1]));
        this.processes.push(process); return process;
      } catch (error) {
        const process = Object.create(Process.prototype);
        Object.assign(process, { id: uid('pid'), systemId: this.id, name: basename(path), path, state: 'error', error: error.message, output: [{ text: error.message, error: true }], work: 0, ownWork: 0, descendantWork: 0, tickWork: 0, quota: 0, memory: 0, inbox: [], vars: {}, carrierFor: options.carrierFor || null, appId: options.appId || null, windowId: options.windowId || null });
        this.processes.push(process);
        if (options.carrierFor) { const child = this.os.systems.get(options.carrierFor); if (child) { child.state = 'error'; child.kernelError = error.message; } }
        return process;
      }
    }
    endProcess(id) {
      const process = this.processes.find(item => item.id === id);
      if (!process || process.state === 'ended') return false;
      process.state = 'ended'; process.inbox = []; process.waitingFor = null;
      if (process.carrierFor) { const child = this.os.systems.get(process.carrierFor); if (child) this.os.stopSystem(child.id, false); }
      return true;
    }
    deliverMessages(policy = 'fifo') {
      let delivered = 0;
      while (this.mailbox.length) {
        let index = 0;
        if (policy === 'lifo') index = this.mailbox.length - 1;
        const message = this.mailbox[index];
        const target = this.processes.find(process => process.id === message.to && process.state !== 'ended' && process.state !== 'error');
        if (!target) {
          const sender = this.processes.find(process => process.id === message.from);
          if (sender) sender.output.push({ time: this.time, text: `投递失败：目标 ${message.to} 不存在`, error: true });
          this.mailbox.splice(index, 1); continue;
        }
        if (policy === 'duplicate') target.inbox.push(clone(message));
        target.inbox.push(clone(message)); this.mailbox.splice(index, 1); delivered++;
      }
      return delivered;
    }
    dispatchInput(policy = 'focus') {
      let count = 0;
      while (this.inputQueue.length) {
        const input = this.inputQueue.shift();
        const windowEvent = ['focus', 'window-move', 'window-resize'].includes(input.action);
        const wm = this.processes.find(process => process.path === '/System/wm.os' && !['ended', 'error'].includes(process.state));
        if (windowEvent && wm) wm.inbox.push({ from: 'kernel-window-input', value: clone(input) });
        const targets = this.processes.filter(process => process.windowId === input.windowId && !['ended', 'error'].includes(process.state));
        if (!windowEvent || policy === 'broadcast') {
          if (policy === 'broadcast') targets.forEach(target => target.inbox.push({ from: 'window-manager', value: clone(input) }));
          else {
            const target = targets.find(process => /timing|receiver|files|wm/.test(process.name)) || targets[0];
            if (target) target.inbox.push({ from: 'window-manager', value: clone(input) });
          }
        }
        count++;
      }
      return count;
    }
    launchPrograms() {
      let launched = 0;
      while (this.launchQueue.length) {
        const request = this.launchQueue.shift(); const app = this.apps[request.windowId];
        if (!app) continue;
        const spawn = (path, name, quota) => this.spawnProgram(path, { appId: request.appId, windowId: request.windowId, name, quota });
        if (request.appId === 'files') spawn('/System/apps/files.os', 'files-timing', 1800);
        else if (request.appId === 'editor' || request.appId === 'tasks') spawn(`/System/apps/${request.appId}.os`, `${request.appId}-service`, 1500);
        else if (request.appId === 'player') {
          ['timing', 'scene', 'effects'].forEach(role => { const process = spawn(`/System/apps/player-${role}.os`, `player-${role}`, role === 'timing' ? 2200 : 1700); app.processes[role] = process.id; });
        } else if (request.appId === 'charts') {
          ['receiver', 'renderer'].forEach(role => { const process = spawn(`/System/apps/charts-${role}.os`, `charts-${role}`, 1600); app.processes[role] = process.id; });
        }
        launched++;
      }
      return launched;
    }
    windowManagerService(process, event) {
      if (process.path !== '/System/wm.os' || !event) return null;
      const candidates = event.payload?.candidates || [];
      let targetId = event.windowId;
      if (candidates.length) {
        const windows = candidates.map(id => this.os.windows.find(window => window.id === id)).filter(Boolean);
        if (windows.length) targetId = (process.vars.hitTest === 'bottommost' ? windows.sort((a, b) => a.z - b.z)[0] : windows.sort((a, b) => b.z - a.z)[0]).id;
      }
      if (event.action === 'focus') {
        if (process.vars.focusPolicy === 'sticky') {
          const current = this.os.windows.find(window => window.systemId === this.id && window.element.classList.contains('focused'));
          if (current) targetId = current.id;
        }
        this.os.applyManagedFocus(targetId, process.vars.order !== 'reverse');
      } else if (event.action === 'window-move' || event.action === 'window-resize') {
        this.os.applyManagedBounds(targetId, event.payload, !!process.vars.clipToDesktop);
      }
      return { targetId, order: process.vars.order, hitTest: process.vars.hitTest };
    }
    execute(dt = .05) {
      this.stats.tickWork = 0; this.stats.actualGrant = 0;
      this.processes.forEach(process => process.tickWork = 0);
      if (!this.effectiveRunning()) return 0;
      this.time += dt * this.rate; this.frame++;
      this.deliverMessages('fifo'); this.dispatchInput('focus');
      const used = this.scheduleProcesses(this.budget, dt, 6000, 'round-robin');
      this.stats.tickWork = used; this.stats.totalWork += used; return used;
    }
    executeFromKernel(budget, dt, quantum, policy) {
      this.stats.tickWork = 0; this.stats.actualGrant = budget;
      this.processes.forEach(process => process.tickWork = 0);
      const used = this.scheduleProcesses(Math.min(budget, this.budget), dt, quantum, policy);
      this.stats.tickWork = used; this.stats.totalWork += used; return { used };
    }
    scheduleProcesses(budget, dt, quantum, policy) {
      let used = 0; let rounds = 0; let active = true;
      const activeProcesses = () => this.processes.filter(process => !['ended', 'error', 'suspended'].includes(process.state));
      while (used < budget && active && rounds++ < 80) {
        active = false;
        let list = activeProcesses();
        if (policy === 'priority') list.sort((a, b) => (b.vars.priority || 0) - (a.vars.priority || 0) || a.createdAt - b.createdAt);
        if (policy === 'reverse') list.reverse();
        for (const process of list) {
          if (used >= budget) break;
          if (process.waitingFor === 'time' && process.waitUntil > this.time) continue;
          if (process.waitingFor === 'message' && !process.inbox.length) continue;
          const allocation = process.carrierFor ? Math.min(process.quota || budget, budget - used) : Math.min(quantum, process.quota || quantum, budget - used);
          if (allocation < process.instructionCost) continue;
          const consumed = process.runSlice(this, allocation, null);
          if (consumed > 0) { used += consumed; active = true; }
        }
        if (!active && list.some(process => process.state === 'ready')) active = true;
      }
      this.stats.remainingWork = this.processes.reduce((sum, process) => sum + (process.state === 'ready' ? Math.max(process.quota - process.tickWork, 0) + process.remainingWork : 0), 0);
      return used;
    }
    runCarrier(child, dt, budget) {
      const carrier = this.processes.find(process => process.carrierFor === child.id && !['ended', 'error'].includes(process.state));
      if (!carrier) return 0;
      return carrier.runSlice(this, Math.min(budget || child.budget, carrier.quota || child.budget), dt);
    }
    assertStorage(additional) {
      const used = this.fs.size() + this.children.reduce((sum, id) => { const child = this.os.systems.get(id); return sum + (child ? child.fs.size() : 0); }, 0);
      if (used + Math.max(0, additional) > this.storageQuota * 1024 * 1024) throw new Error('存储配额不足，文件未写入');
    }
    memoryUsed() {
      const own = this.fs.size() + this.processes.reduce((sum, process) => sum + (process.memory || 0), 0) + Object.values(this.apps).reduce((sum, app) => sum + (app.memory || 0), 0);
      return own + this.children.reduce((sum, id) => { const child = this.os.systems.get(id); return sum + (child ? child.memoryUsed() : 0); }, 0);
    }
    registerApp(windowId, appId, state = {}) {
      const required = state.memory || 12000;
      if (this.memoryUsed() + required > this.memoryQuota * 1024 * 1024) throw new Error(`内存配额不足：${this.id} 无法装载 ${appId}`);
      this.apps[windowId] = Object.assign({ windowId, appId, memory: 0, inputs: [], view: {}, createdAt: this.time }, state);
      return this.apps[windowId];
    }
    removeApp(windowId) {
      this.processes.filter(process => process.windowId === windowId).forEach(process => { process.state = 'ended'; process.inbox = []; });
      delete this.apps[windowId];
      this.os.projections.filter(projection => projection.sourceWindowId === windowId).forEach(projection => this.os.closeProjection(projection.windowId, '源应用已关闭'));
    }
    appProcesses(windowId) { return this.processes.filter(process => process.windowId === windowId); }
    updateAppView(process, view) { const app = this.apps[process.windowId]; if (app) app.view = clone(view); }
    queueInput(windowId, action, payload = {}) {
      const app = this.apps[windowId]; if (!app) return false;
      app.inputs.push({ action, payload: clone(payload), time: this.time });
      return true;
    }
    fileService(process, currentPath) {
      const app = this.apps[process.windowId]; if (!app) return currentPath;
      let path = app.path || currentPath || '/';
      while (app.inputs.length) {
        const input = app.inputs.shift(); const data = input.payload;
        try {
          if (process.vars.readOnly && ['new-file', 'new-folder', 'delete', 'restore', 'copy', 'rename', 'drop'].includes(input.action)) throw new Error('文件管理程序规则：只读模式');
          if (input.action === 'navigate') path = N.normalize(data.path);
          else if (input.action === 'new-file') this.fs.write(N.join(path, data.name || '新建文本.txt'), data.content || '');
          else if (input.action === 'new-folder') this.fs.mkdir(N.join(path, data.name || '新建文件夹'));
          else if (input.action === 'delete') this.fs.remove(data.path);
          else if (input.action === 'restore') this.fs.restore(data.path);
          else if (input.action === 'copy') this.fs.copy(data.source, data.target);
          else if (input.action === 'rename') this.fs.rename(data.source, data.target);
          else if (input.action === 'drop') {
            const sourceSystem = this.os.systems.get(data.sourceSystemId); if (!sourceSystem) throw new Error('来源系统不存在');
            const entry = sourceSystem.fs.get(data.sourcePath); if (!entry) throw new Error('来源文件不存在');
            const target = N.join(path, N.basename(data.sourcePath));
            const content = entry.type === 'file' ? entry.content : '';
            this.assertStorage(content.length); this.fs.write(target, content);
            this.os.notify(this.id, '跨层传递完成', `${N.basename(target)} → ${this.id}:${path}`);
          }
        } catch (error) { app.error = error.message; this.os.notify(this.id, '文件操作失败', error.message, 'error'); }
      }
      app.path = path; return path;
    }
    editorService(process) {
      const app = this.apps[process.windowId]; if (!app) return 0; let handled = 0;
      while (app.inputs.length) {
        const input = app.inputs.shift(); const data = input.payload; handled++;
        try {
          if (input.action === 'save') { if (this.filePolicy === 'readonly') throw new Error('内核文件策略：本系统为只读'); this.assertStorage(data.content.length); this.fs.write(data.path, data.content); app.lastResult = `已保存 ${data.path}`; this.os.notify(this.id, '程序已保存', data.path, 'success'); }
          else if (input.action === 'compile') { const code = compile(data.content); app.lastResult = `编译成功：${code.instructions.length} 条指令`; }
          else if (input.action === 'run') { const child = this.spawnProgram(data.path, { appId: 'editor' }); app.lastRunPid = child.id; app.lastResult = `已启动 ${child.id}`; }
        } catch (error) { app.lastResult = error.message; app.error = error.message; }
      }
      return handled;
    }
    tasksService(process) {
      const app = this.apps[process.windowId]; if (!app) return 0; let handled = 0;
      while (app.inputs.length) {
        const input = app.inputs.shift(); const data = input.payload; handled++;
        if (input.action === 'quota' && ['budget', 'childGrant', 'memoryQuota', 'storageQuota'].includes(data.key)) this[data.key] = Math.max(1, Number(data.value) || 1);
        else if (input.action === 'process') { const target = this.processes.find(item => item.id === data.pid); if (target) { if (data.op === 'end') this.endProcess(target.id); else target.state = data.op === 'suspend' ? 'suspended' : 'ready'; } }
      }
      return handled;
    }
    playerControl(process) {
      const app = this.apps[process.windowId]; if (!app || app.appId !== 'player') return null;
      let handled = 0;
      while (app.inputs.length) {
        const input = app.inputs.shift(); const data = input.payload; handled++;
        if (input.action === 'play') { app.playing = true; app.state = 'playing'; }
        else if (input.action === 'pause') { app.playing = false; app.state = 'paused'; }
        else if (input.action === 'stop') { app.playing = false; app.position = 0; app.state = 'stopped'; app.dirty = true; if (app.mode === 'rehearsal') app.flight = N.Flight.initial(app); }
        else if (input.action === 'seek') { app.position = N.clamp(Number(data.position) || 0, 0, app.duration); app.dirty = true; if (app.mode === 'rehearsal' && app.record?.length) { app.mode = 'record'; app.playing = false; app.state = 'paused'; app.flight = null; if (app.controllerPid) this.endProcess(app.controllerPid); app.controllerPid = null; } if (app.mode === 'rehearsal' || app.mode === 'record') N.Flight.seekRecord(app, app.position); }
        else if (input.action === 'step') { app.playing = false; app.state = 'paused'; app.position = N.clamp(app.position + 1 / app.fps, 0, app.duration); app.dirty = true; if (app.mode === 'record') N.Flight.seekRecord(app, app.position); }
        else if (input.action === 'rate') app.rate = N.clamp(Number(data.rate) || 1, .1, 4);
        else if (input.action === 'loop') app.loop = !app.loop;
        else if (input.action === 'camera') app.camera = data.camera;
        else if (input.action === 'orbit') { app.orbit.yaw += Number(data.dx) * .008; app.orbit.pitch = N.clamp(app.orbit.pitch + Number(data.dy) * .008, -.1, 1.35); app.camera = 'free'; app.dirty = true; }
        else if (input.action === 'zoom') { app.orbit.distance = N.clamp(app.orbit.distance * (Number(data.delta) > 0 ? 1.1 : .9), 5, 60); app.camera = 'free'; app.dirty = true; }
        else if (input.action === 'select') app.selection = data.selection;
        else if (input.action === 'rehearsal-start') N.Flight.startRehearsal(app);
        else if (input.action === 'wind') app.wind = Number(data.value);
        else if (input.action === 'heading') { app.heading = Number(data.value); if (app.flight) app.flight.heading = app.heading; }
        else if (input.action === 'fault') { app.faultAt = app.position + Number(data.delay || 0); if (app.flight && Number(data.delay || 0) === 0) app.flight.fault = true; }
        else if (input.action === 'target-pad') { app.targetPad = data.pad || 'B'; if (app.flight) N.Flight.setTarget(app.flight, data.pad || 'B'); }
        else if (input.action === 'open') this.os.openSceneInPlayer(this, process.windowId, data.path);
        else if (input.action === 'save-record') N.Flight.saveRecord(this, app, data.path);
      }
      return handled;
    }
    playerTick(process, clockScale = 1) {
      const app = this.apps[process.windowId]; if (!app || app.appId !== 'player') return null;
      if (app.lastTickFrame === this.frame) return { position: app.position, playing: app.playing };
      app.lastTickFrame = this.frame;
      const elapsed = app.lastSystemTime == null ? 1 / 30 : Math.max(0, this.time - app.lastSystemTime);
      app.lastSystemTime = this.time;
      if (app.mode === 'rehearsal' && (!app.controllerPid || !this.processes.some(item => item.id === app.controllerPid && !['ended', 'error'].includes(item.state)))) {
        const controller = this.spawnProgram('/System/flight-controller.os', { appId: 'player', windowId: app.windowId, name: 'flight-controller', quota: 1400 });
        app.controllerPid = controller.id;
      }
      if (app.playing && this.effectiveRunning()) {
        const dt = elapsed * app.rate * clockScale;
        if (app.mode === 'rehearsal') {
          N.Flight.step(app, dt, this);
          app.position = app.flight.time; app.dirty = true;
        } else {
          app.position += dt;
          if (app.position >= app.duration) {
            if (app.loop) app.position %= app.duration;
            else { app.position = app.duration; app.playing = false; app.state = 'ended'; }
          }
          app.dirty = true;
        }
      }
      if (app.mode === 'rehearsal' && app.flight && app.faultAt != null && app.flight.time >= app.faultAt) app.flight.fault = true;
      app.memory = 1400000 + ((app.sceneState?.particles?.length || 0) + (app.sceneState?.debris?.length || 0)) * 180;
      return { position: app.position, playing: app.playing, work: app.playing ? Math.max(4, Math.ceil(elapsed * app.rate * clockScale / .025) * (app.mode === 'rehearsal' ? 28 : 8)) : 0 };
    }
    playerEmit(process) {
      const app = this.apps[process.windowId]; if (!app || !app.dirty) return false;
      const flight = app.flight ? clone(app.flight) : null; if (flight) { flight.record = []; flight.controlHistory = []; flight.inputHistory = []; }
      const packet = { position: app.position, mode: app.mode, revision: ++app.revision, flight, wind: app.wind, heading: app.heading };
      Object.entries(app.processes || {}).filter(([role]) => role === 'scene' || role === 'effects').forEach(([, pid]) => this.mailbox.push({ id: uid('msg'), from: process.id, to: pid, value: clone(packet), sentAt: this.time, sequence: this.messageSequence++ }));
      app.dirty = false; return true;
    }
    playerSample(process, packet) {
      const app = this.apps[process.windowId]; if (!app || !packet) return null;
      if (packet.mode === 'rehearsal' && packet.flight) app.sceneState = N.Flight.sample(app, packet.flight);
      else if (app.mode === 'record' && app.record) app.sceneState = N.Flight.sampleRecord(app, packet.position);
      else app.sceneState = N.Scene.sample(app.resource, packet.position);
      app.frameTime = packet.position; app.lastRevision = packet.revision; app.renderDirty = true;
      return { frameTime: app.frameTime, work: 120 + (app.resource?.parts?.length || 0) * 12 };
    }
    playerEffects(process, packet) {
      const app = this.apps[process.windowId]; if (!app || !packet) return null;
      app.effectsRevision = packet.revision; app.effectsTime = packet.position; return true;
    }
    flightSense(process) {
      const app = Object.values(this.apps).find(item => item.appId === 'player' && item.controllerPid === process.id);
      if (!app || !app.flight) return null;
      const f = app.flight; const target = N.Flight.target(app, f);
      return clone({ time: f.time, x: f.x, y: f.y, z: f.z, vx: f.vx, vy: f.vy, vz: f.vz, pitch: f.pitch, roll: f.roll, yaw: f.yaw, vp: f.vp, vr: f.vr, rotor: f.rotor, targetX: target.x, targetY: target.y, targetZ: target.z, heading: f.heading, wind: app.wind, fault: f.fault });
    }
    flightControl(process, args) {
      const app = Object.values(this.apps).find(item => item.appId === 'player' && item.controllerPid === process.id);
      if (!app || !app.flight) return false;
      app.flight.control = { collective: N.clamp(Number(args[0]) || 0, 0, 1), pitch: N.clamp(Number(args[1]) || 0, -1, 1), roll: N.clamp(Number(args[2]) || 0, -1, 1), yaw: N.clamp(Number(args[3]) || 0, -1, 1), writtenAt: app.flight.time, pid: process.id };
      app.flight.controlHistory.push({ time: app.flight.time, control: clone(app.flight.control) });
      if (app.flight.controlHistory.length > 12000) app.flight.controlHistory.shift();
      return true;
    }
    chartReceive(process, packet) {
      const app = this.apps[process.windowId]; if (!app || !packet || packet.connectionId !== app.connectionId) return false;
      if (packet.version <= app.receivedVersion) return false;
      app.receivedVersion = packet.version; app.receivedData = clone(packet.data); app.receivedRange = packet.range;
      return true;
    }
    chartForward(process, packet) {
      const app = this.apps[process.windowId]; if (!app || !app.receivedData) return false;
      const pid = app.processes?.renderer;
      if (!pid) return false;
      const message = { connectionId: app.connectionId, version: app.receivedVersion, data: clone(app.receivedData), range: app.receivedRange };
      this.mailbox.push({ id: uid('msg'), from: process.id, to: pid, value: message, sentAt: this.time, sequence: this.messageSequence++ });
      return true;
    }
    chartCompute(process, packet, valueRule = 'numeric', sortRule = 'none') {
      const app = this.apps[process.windowId]; if (!app || !packet || packet.version <= app.processedVersion) return false;
      const rows = packet.data || [];
      const parsed = N.Chart.compute(rows, app.labelColumn || 'A', app.series || ['D']);
      if (valueRule === 'absolute') parsed.series.forEach(series => series.values = series.values.map(Math.abs));
      else if (valueRule === 'square') parsed.series.forEach(series => series.values = series.values.map(value => value * value));
      if (sortRule !== 'none' && parsed.labels.length) {
        const order = parsed.labels.map((_, index) => index).sort((a, b) => (parsed.series[0]?.values[a] || 0) - (parsed.series[0]?.values[b] || 0));
        if (sortRule === 'descending') order.reverse();
        parsed.labels = order.map(index => parsed.labels[index]); parsed.series.forEach(series => series.values = order.map(index => series.values[index]));
      }
      parsed.max = Math.max(1, ...parsed.series.flatMap(series => series.values.map(value => Math.abs(value))));
      app.previousModel = N.clone(app.model); app.model = parsed; app.processedVersion = packet.version; app.renderRevision = (app.renderRevision || 0) + 1;
      app.valueRule = valueRule; app.sortRule = sortRule; app.transitionStart = this.time; app.renderDirty = true; app.memory = 12000 + JSON.stringify(rows).length * 5;
      return { version: packet.version, points: parsed.points };
    }
    serialize() {
      return {
        id: this.id, parentId: this.parentId, name: this.name, kind: this.kind, time: this.time, rate: this.rate, state: this.state,
        budget: this.budget, memoryQuota: this.memoryQuota, storageQuota: this.storageQuota, childGrant: this.childGrant,
        fs: this.fs.serialize(), processes: this.processes.map(process => process.serialize()), mailbox: clone(this.mailbox), messageSequence: this.messageSequence,
        inputQueue: clone(this.inputQueue), launchQueue: clone(this.launchQueue), customSyscalls: clone(this.customSyscalls), filePolicy: this.filePolicy || 'normal', apps: clone(this.apps), children: this.children.filter(id => this.os.systems.has(id)).map(id => this.os.systems.get(id).serialize()),
        settings: clone(this.settings), randomState: this.randomState, stats: clone(this.stats), zCounter: this.zCounter, kernelError: this.kernelError,
        windows: this.os.windows ? this.os.windows.filter(window => window.systemId === this.id).map(window => this.os.serializableWindow(window)) : []
      };
    }
  }
  N.SystemNode = SystemNode;

  N.defaultPrograms = function () {
    return {
      '/System/compiler.os': `// NEXUS 自编译器：此后启动的程序采用这些规则\nLET language "nexus-vm-1"\nLET instructionCost 8\nLET source "LET value 1"\nCALL compiler.compile source => compiled\nPRINT compiled\nEND`,
      '/System/wm.os': `// 窗口管理程序：层叠、焦点、命中与边界规则\nLET order "raise"\nLET focusPolicy "click"\nLET hitTest "topmost"\nLET clipToDesktop 1\nLABEL loop\nRECV => event\nCALL wm.dispatch event => result\nGOTO loop`,
      '/System/kernel.template.os': `// 子系统内核：启动窗口管理、装载应用、调度、消息与时钟\nSPAWN "/System/wm.os" => wmProcess\nLET policy "round-robin"\nLET delivery "fifo"\nLET windowPolicy "focus"\nLET quantum 640\nLET ticks 0\nLABEL kernelLoop\nCALL sys.launch => launched\nCALL sys.schedule policy quantum => work\nCALL sys.deliver delivery => messages\nCALL sys.windows windowPolicy => inputs\nCALL sys.clock 0.05 => clock\nCALC ticks ticks + 1\nYIELD\nGOTO kernelLoop`,
      '/System/apps/files.os': `LET path "/"\nLET sort "name"\nLET readOnly 0\nLABEL loop\nCALL files.poll path => nextPath\nCALC path nextPath\nCALL fs.list path sort => items\nCALL device.files path items\nWAIT 0.05\nGOTO loop`,
      '/System/apps/editor.os': `LET requests 0\nLABEL loop\nCALL editor.poll => result\nCALC requests requests + 1\nWAIT 0.02\nGOTO loop`,
      '/System/apps/tasks.os': `LET requests 0\nLABEL loop\nCALL tasks.poll => result\nCALC requests requests + 1\nWAIT 0.05\nGOTO loop`,
      '/System/apps/player-timing.os': `LET frames 0\nLET clockScale 1\nLABEL loop\nCALL player.control => commands\nCALL player.tick clockScale => playback\nCALL player.emit => submitted\nCALC frames frames + 1\nWAIT 0.0166667\nGOTO loop`,
      '/System/apps/player-scene.os': `LABEL loop\nRECV => frame\nCALL player.sample frame => sampled\nGOTO loop`,
      '/System/apps/player-effects.os': `LABEL loop\nRECV => frame\nCALL player.effects frame\nGOTO loop`,
      '/System/apps/charts-receiver.os': `LABEL loop\nRECV => update\nCALL chart.receive update\nCALL chart.forward update\nGOTO loop`,
      '/System/apps/charts-renderer.os': `LET valueRule "numeric"\nLET sortRule "none"\nLABEL loop\nRECV => update\nCALL chart.compute update valueRule sortRule => result\nGOTO loop`,
      '/System/flight-controller.os': `// 24 号机 PID 飞控：可编辑的普通程序\nLET integral 0\nLABEL controlLoop\nCALL flight.sense => s\nIF s == null GOTO noSensor\nCALC verticalError s.targetY - s.y\nCALC integral integral + verticalError * 0.002\nCALC lift 0.43 + verticalError * 0.05 - s.vy * 0.085 + integral * 0.01\nCALC pitch (s.targetZ - s.z) * 0.018 - s.vz * 0.065 - s.pitch * 0.12 - s.vp * 0.035\nCALC roll (s.targetX - s.x) * 0.018 - s.vx * 0.065 - s.roll * 0.12 - s.vr * 0.035 - s.wind * 0.005\nCALC yaw (s.heading - s.yaw) * 0.04\nCALL flight.control lift pitch roll yaw\nLABEL noSensor\nWAIT 0.05\nGOTO controlLoop`,
      '/Programs/accumulate.os': `// 累加计算：修改 100 可改变工作量\nLET sum 0\nLET i 1\nLET limit 100\nLABEL next\nCALC sum sum + i\nCALC i i + 1\nIF i <= limit GOTO next\nPRINT sum\nWRITE_RESULT\nEND`.replace('WRITE_RESULT', 'CALL fs.write "/Documents/累加结果.txt" sum'),
      '/Programs/message-send.os': `LET index 1\nLABEL sendLoop\nIF index > 3 GOTO done\nCALL sys.spawn "/Programs/message-receive.os" => receiver\nSEND receiver "来自发送进程的第 1 条消息"\nCALC index 4\nGOTO sendLoop\nLABEL done\nPRINT "消息已发送"\nEND`,
      '/Programs/message-receive.os': `RECV => incoming\nPRINT incoming\nCALL fs.write "/Documents/收到消息.txt" incoming\nEND`,
      '/Programs/forever.os': `// 持续计算：不让出执行权，仍受内核抢占调度\nLET counter 0\nLET total 0\nLABEL compute\nCALC counter counter + 1\nCALC total total + counter % 17\nGOTO compute`
    };
  };
})(window.Nexus);

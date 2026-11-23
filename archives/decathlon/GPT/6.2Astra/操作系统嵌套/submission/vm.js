const systems = {},
  views = {},
  copy = (x) => (x === undefined ? null : structuredClone(x)),
  base = (p) => p.split("/").pop(),
  dir = (p) => p.slice(0, p.lastIndexOf("/")) || "/";
let serial = 0,
  wserial = 0,
  ps = 0,
  zTop = 10,
  root,
  logicalStep = 0.05;
const cache = new Map(),
  kernelDevices = new Set([
    "deliver",
    "fileGet",
    "filePut",
    "slot",
    "count",
    "run",
    "submit",
    "spawn",
    "terminate",
    "ready",
    "status",
    "deadline",
    "makeDir",
    "renamePath",
    "directory",
  ]);
function parseProgram(src) {
  if (cache.has(src)) return cache.get(src);
  let code = [],
    labels = {};
  const expr = (t) => {
    let n = acorn.parseExpressionAt(t, 0, { ecmaVersion: 2022,preserveParens:true });
    if (t.slice(n.end).trim()) throw Error("无效表达式 " + t);
    return n;
  };
  if (String(src).startsWith('{"strataBytecode":1,')) {
    const image = JSON.parse(src);
    labels = image.labels;
    code = image.code.map(([op, a, b]) => {
      if (op === "let") return [op, a, expr(b)];
      if (op === "if") return [op, expr(a), b];
      if (["wait","expr","return"].includes(op)) return [op, expr(a)];
      if (["goto","call","receive"].includes(op)) return [op, a];
      if (op === "halt"||op==="ret") return [op];
      throw Error("未知字节码 " + op);
    });
  } else for (let line of String(src).split(/\r?\n/)) {
    let t = line.trim();
    if (!t || t[0] === "#") continue;
    if (t[0] === "@") {
      labels[t.slice(1)] = code.length;
      continue;
    }
    let m;
    if ((m = t.match(/^if (.+) goto ([\w]+)$/)))
      code.push(["if", expr(m[1]), m[2]]);
    else if ((m = t.match(/^goto (\w+)$/))) code.push(["goto", m[1]]);
    else if ((m = t.match(/^(receive|wait|return) (.+)$/)))
      code.push([m[1], m[1] === "receive" ? m[2] : expr(m[2])]);
    else if ((m=t.match(/^call (\w+)$/)))code.push(["call",m[1]]);
    else if (t === "halt"||t==="ret") code.push([t]);
    else if ((m = t.match(/^(\w+)\s*=\s*(.+)$/)))
      code.push(["let", m[1], expr(m[2])]);
    else code.push(["expr", expr(t)]);
  }
  for (let c of code)
    if ((["goto","if","call"].includes(c[0])) && labels[c.at(-1)] === undefined)
      throw Error("找不到标签 " + c.at(-1));
  const res = { code, labels };
  cache.set(src, res);
  return res;
}
function evalNode(n, v, call) {
  let ev = (x) => evalNode(x, v, call);
  switch (n.type) {
    case "ParenthesizedExpression":return ev(n.expression);
    case "Literal":
      return n.value;
    case "Identifier":
      return Object.hasOwn(v, n.name) ? v[n.name] : 0;
    case "ArrayExpression":
      return n.elements.map(ev);
    case "ObjectExpression":
      return Object.fromEntries(
        n.properties.map((x) => [x.key.name ?? x.key.value, ev(x.value)]),
      );
    case "MemberExpression": {
      let a = ev(n.object),
        k = n.computed ? ev(n.property) : n.property.name;
      return a && Object.hasOwn(Object(a), k) ? a[k] : 0;
    }
    case "UnaryExpression": {
      let a = ev(n.argument);
      return n.operator === "-" ? -a : n.operator === "!" ? !a : +a;
    }
    case "BinaryExpression":
    case "LogicalExpression": {
      let a = ev(n.left),
        b = ev(n.right);
      switch (n.operator) {
        case "+":
          return a + b;
        case "-":
          return a - b;
        case "*":
          return a * b;
        case "/":
          return a / b;
        case "%":
          return a % b;
        case "<":
          return a < b;
        case "<=":
          return a <= b;
        case ">":
          return a > b;
        case ">=":
          return a >= b;
        case "==":
        case "===":
          return a === b;
        case "!=":
        case "!==":
          return a !== b;
        case "&&":
          return a && b;
        case "||":
          return a || b;
      }
    }
    case "CallExpression":
      if (n.callee.type === "Identifier")
        return call(n.callee.name, n.arguments.map(ev));
  }
  throw Error("不支持的表达式 " + n.type);
}
function thread(name, src, owner = null) {
  parseProgram(src);
  return {
    pid: ++ps,
    name,
    src,
    owner,
    pc: 0,
    v: {},
    queue: [],
    output: [],
    state: "ready",
    work: 0,
    last: 0,
    cap: 1024,
    wake: 0,
    debt: 0,
  };
}
function execute(p, env) {
  let { code, labels } = parseProgram(p.src),
    op = code[p.pc++];
  const val = (n) => evalNode(n, p.v, env);
  if (!op || op[0] === "halt") {
    p.state = "ended";
    return;
  }
  switch (op[0]) {
    case "if":
      if (val(op[1])) p.pc = labels[op[2]];
      break;
    case "call":
      (p.returns??=[]).push(p.pc);if(p.returns.length>128)throw Error("程序调用深度超限");
      p.pc=labels[op[1]];break;
    case "ret":
      if(!p.returns?.length)throw Error("没有调用位置");p.pc=p.returns.pop();break;
    case "goto":
      p.pc = labels[op[1]];
      break;
    case "let":
      p.v[op[1]] = val(op[2]);
      break;
    case "expr":
      val(op[1]);
      break;
    case "return":
      p.result = val(op[1]);
      p.state = "ended";
      break;
    case "wait":
      p.wake = env("clock", []) + Math.max(0, val(op[1]));
      p.state = "sleep";
      break;
    case "receive":
      if (!p.queue.length) {
        p.pc--;
        p.state = "waiting";
      } else p.v[op[1]] = p.queue.shift();
      break;
  }
}
function compilerJob(s, source) {
  const sourceText=s.files[PATH.compiler] || COMPILER;
  const installed=s.compilerBuild;
  const p=thread("compiler",installed?.source===sourceText?installed.image:sourceText);
  p.labels={};
  p.v.lines = String(source).split("\n");
  p.emitted = [];
  return p;
}
function compileStep(p) {
  execute(p, (k, a) => {
    switch (k) {
      case "length":
        return a[0].length;
      case "at":
        return a[0][a[1]];
      case "emit":
        return p.emitted.push(a[0]);
      case "trim": return a[0].trim();
      case "first": return a[0][0]||"";
      case "tail": return a[0].slice(1);
      case "word": return a[0].split(/\s+/,1)[0];
      case "afterWord": return a[0].replace(/^\S+\s*/,"");
      case "assignment": return /^(\w+)\s*=(?!=)/.exec(a[0])?.[1]||"";
      case "afterEquals": return a[0].slice(a[0].indexOf("=")+1).trim();
      case "lastIndex": return a[0].lastIndexOf(a[1]);
      case "slice": return a[0].slice(a[1],a[2]);
      case "label": p.labels[a[0]]=p.emitted.length;return 1;
      case "fail": throw Error(a[0]);
      case "image": return JSON.stringify({strataBytecode:1,labels:p.labels,code:p.emitted});
      case "compiled":
        return p.emitted.join("\n");
      default:
        throw Error("编译器接口 " + k);
    }
  });
}
function compile(s, source) {
  let p = compilerJob(s, source);
  for (let i = 0; i < 100000 && p.state === "ready"; i++) compileStep(p);
  if (typeof p.result !== "string") throw Error("编译器无输出");
  parseProgram(p.result);
  return p.result;
}
function createState(
  parent = null,
  id = parent ? "inner-" + ++serial : "outer",
) {
  let s = {
    id,
    parentId: parent?.id || null,
    name: parent ? id : "高地观测站",
    state: "running",
    clock: 0,
    speed: 1,
    budget: 24000,
    grant: 16000,
    memory: 16e6,
    storage: 24e6,
    last: 0,
    ktime: 0,
    cursor: 0,
    procs: [],
    wins: [],
    files: initialFiles(),
    settings: { accent: "#e5ef9c", wall: "highland", scale: 1 },
    notifications: [],
    clip: [],
    widget: { note: "", timer: 300, remain: 300 },
    tree: [],
    kernelPath: "/System/" + id + ".str",
  };
  systems[id] = s;
  if (parent) {
    parent.tree.push(id);
    parent.files[s.kernelPath] ??= KERNEL;
    s.kernelSource = parent.files[s.kernelPath];
    try {
      s.kernel = thread("kernel", compile(parent, s.kernelSource));
      if (parseProgram(s.kernel.src).labels.main === undefined)
        throw Error("缺少 @main");
    } catch (e) {
      s.error = e.message;
      s.state = "error";
    }
    let carrier = thread(id, "halt");
    carrier.child = id;
    carrier.cap = s.grant;
    parent.procs.push(carrier);
    if (s.state === "running") {
      try {
        s.wm = syscall(s, s.kernel, "boot", []);
      } catch (e) {
        s.state = "error";
        s.error = e.message;
      }
    }
  } else {
    s.kernelSource = KERNEL;
    s.kernel = thread("kernel", KERNEL);
  }
  return s;
}
function startProc(s, path, owner = null) {
  try {
    if (typeof s.files[path] !== "string") throw Error("文件不存在");
    let source = s.parentId
      ? syscall(s, s.kernel, "read", [path])
      : s.files[path];
    let p = thread(base(path), "halt", owner);
    p.compilation = compilerJob(s, source);
    if (!allowance(s, "memory", usedMemory, source.length * 2 + 512))
      throw Error("内存配额不足");
    s.procs.push(p);
    return p;
  } catch (e) {
    notify(s, e.message);
    return null;
  }
}
function launchProgram(s, path, owner = null) {
  if (!s.parentId) return startProc(s, path, owner);
  let pid = syscall(s, s.kernel, "launch", [path, owner]);
  return pidOf(s, pid);
}
function frozen(s) {
  return (
    !s || s.state !== "running" || (s.parentId && frozen(systems[s.parentId]))
  );
}
function pidOf(s, id) {
  return s.procs.find((p) => p.pid === id);
}
function enqueue(s, id, value) {
  let p = pidOf(s, id);
  if (!p || ["ended", "error"].includes(p.state)) return false;
  if (
    dataUnits(value) > 1024 &&
    !allowance(s, "memory", usedMemory, dataUnits(value) * 2)
  )
    return false;
  p.queue.push(copy(value));
  if (p.state === "waiting") p.state = "ready";
  return true;
}
function usedMemory(s) {
  return (
    JSON.stringify(s.procs).length * 2 +
    s.wins.reduce(
      (a, w) =>
        a +
        JSON.stringify(w.data || {}).length * 2 +
        (w.data.resource?.nodes?.length || 0) * 220,
      0,
    )
  );
}
function inclusive(s, measure) {
  return (
    measure(s) +
    s.tree.reduce(
      (n, id) => n + (systems[id] ? inclusive(systems[id], measure) : 0),
      0,
    )
  );
}
function allowance(s, key, measure, extra) {
  for (let n = s; n; n = systems[n.parentId])
    if (inclusive(n, measure) + extra > n[key]) return false;
  return true;
}
function dataUnits(v) {
  if (v == null) return 0;
  if (typeof v === "string") return v.length;
  if (typeof v === "object") return JSON.stringify(v).length;
  return 1;
}
function costOf(p, s) {
  let op = parseProgram(p.src).code[p.pc],
    ast = op?.[0] === "let" ? op[2] : op?.[1];
  if (!ast || typeof ast !== "object") return 0;
  let read = (n) =>
    n?.type === "Identifier"
      ? p.v[n.name]
      : n?.type === "Literal"
        ? n.value
        : undefined;
  if (
    ast.type === "BinaryExpression" &&
    ["+", "==", "===", "!="].includes(ast.operator)
  ) {
    let a = read(ast.left),
      b = read(ast.right);
    if (typeof a === "string" || typeof b === "string")
      return Math.ceil((dataUnits(a) + dataUnits(b)) / 128);
  }
  if (ast.type !== "CallExpression") return 0;
  let k = ast.callee.name,
    values = ast.arguments.map(read),
    size = 0;
  if (
    ["send", "read", "write", "display", "forward", "chart", "sort"].includes(k)
  )
    size =
      k === "read"
        ? dataUnits(s.files[values[0]])
        : values.reduce((n, v) => n + dataUnits(v), 0);
  if(k==="publishSurface"){
    let w=s.wins.find(q=>q.id===p.owner),target=w&&transmissionTarget(s,w);
    if(target){let old=target.data.surface;size=dataUnits(displayCopy(w,false));if(w.data.resource&&(!old.resource||old.resourceVersion!==w.data.resourceVersion))size+=w.data.resourceSize||dataUnits(w.data.resource)}
  }
  if (k === "physicsInput")
    size =
      (s.wins.find((w) => w.id === p.owner)?.data.resource?.nodes.length || 0) *
      4;
  if (k === "push" || k === "entry") size = dataUnits(values[0]);
  if (k === "commitBook") size = dataUnits(values[1]);
  if (k === "sampleScene")
    size =
      (s.wins.find((w) => w.id === p.owner)?.data.resource?.nodes.length || 0) *
      8;
  return Math.ceil(size / 128);
}
function storage(s) {
  return Object.entries(s.files).reduce(
    (n, [k, v]) => n + (k.length + (v?.length || 0)) * 2,
    0,
  );
}
function put(s, path, value) {
  value = String(value);
  if (
    !allowance(
      s,
      "storage",
      storage,
      2 * (value.length - (s.files[path]?.length || 0) + (Object.hasOwn(s.files,path)?0:path.length)),
    )
  )
    throw Error("存储配额不足");
  s.files[path] = value;
  return true;
}
function syscall(s, p, k, a) {
  const src = s.kernel?.src || KERNEL,
    pc = parseProgram(src).labels[k];
  if (pc === undefined) throw Error("未知接口 " + k);
  let q = {
    src,
    pc,
    v: Object.fromEntries(a.map((x, i) => ["arg" + i, x])),
    queue: [],
    state: "ready",
  };
  for (let i = 0; i < 256 && q.state === "ready"; i++) {
    execute(q, (n, args) => device(s, p, n, args, true));
    p.debt++;
    s.ktotal = (s.ktotal || 0) + 1;
  }
  if (q.state !== "ended") throw Error("系统调用未返回");
  return q.result;
}
function device(s, p, k, a, priv = false) {
  if (kernelDevices.has(k) && !priv) throw Error("内核专用设备");
  let w = s.wins.find((w) => w.id === p.owner);
  switch (k) {
    case "clock":
      return s.clock;
    case "self":
      return p.pid;
    case "print":
      p.output.push(String(a[0]));
      p.output = p.output.slice(-16);
      return 1;
    case "find":
      return (
        s.procs.find((x) => x.name === a[0] && x.state !== "ended")?.pid || -1
      );
    case "status":
      return pidOf(s, a[0])?.state || "absent";
    case "deadline":
      return pidOf(s, a[0])?.wake || 0;
    case "ready": {
      let q = pidOf(s, a[0]);
      if (q) q.state = "ready";
      return !!q;
    }
    case "deliver": {
      let q = pidOf(s, a[0]);
      if (!q) return false;
      if (
        dataUnits(a[1]) > 1024 &&
        !allowance(s, "memory", usedMemory, dataUnits(a[1]) * 2)
      )
        throw Error("消息超过内存配额");
      q.queue.push(copy(a[1]));
      return true;
    }
    case "fileGet":
      return s.files[a[0]] ?? "";
    case "filePut":
      if(p.staging){p.staging[a[0]]=String(a[1]);return true}return put(s, a[0], a[1]);
    case "bootApp":
      (s.bootApps ??= []).push(a[0]);
      return 1;
    case "spawn":
      return startProc(s, a[0], a[1] || null)?.pid || -1;
    case "terminate":
      endProcess(s, pidOf(s, a[0]));
      return 1;
    case "poll":
      return p.queue.shift() || null;
    case "invoke": {
      let body = views[w?.id]?.body;
      if (!body) return false;
      let buttons = [...body.querySelectorAll("button")],
        e = a[0],
        key = (b) => b?.dataset.testid || b?.textContent;
      let b =
        key(buttons[e.index]) === e.key
          ? buttons[e.index]
          : buttons.find((q) => key(q) === e.key);
      b?.applyCommand?.();
      return !!b;
    }
    case "lower": {
      let q = s.wins.find((w) => w.id === a[0]);
      if (q) {
        q.z = Math.min(...s.wins.map((w) => w.z)) - 1;
        winStyle(s, q);
      }
      return !!q;
    }
    case "notice":
      notify(s, a[0]);
      return 1;
    case "commitTransfer":return commitTransfer(s,p);
    case "makeDir":
      if(p.staging){p.staging[a[0]]=null;return true}
      if (a[0] in s.files) throw Error("同名目录已存在");
      s.files[a[0]] = null;
      return true;
    case "renamePath":
      movePath(s, a[0], a[1]);
      return true;
    case "openDocument":
      if (w) {
        if (a[1] === "editor") openApp(s, "editor", { path: a[0] });
        else
          openFile(s, a[0], (path) =>
            enqueue(s, p.pid, { action: "render", path }),
          );
      }
      return 1;
    case "contains":return String(a[0]).includes(a[1]);
    case "frameRect":{let q=s.wins.find(q=>q.id===a[0]),area=views[s.id]?.area;return q&&area?{x:q.x,y:q.y,width:q.width,height:q.height,state:q.state,areaWidth:area.clientWidth,areaHeight:area.clientHeight}:{}}
    case "place":{let q=s.wins.find(q=>q.id===a[0]);if(!q)return false;Object.assign(q,{x:a[1],y:a[2],width:a[3],height:a[4],state:"normal"});winStyle(s,q);return true}
    case "frameState":{let q=s.wins.find(q=>q.id===a[0]);if(q)performFrameAction(s,q,a[1]);return !!q}
    case "windows":
      return s.wins.length;
    case "bounds": {
      let q = s.wins[a[0]],
        v = views[q?.id]?.node;
      return v
        ? {
            id: q.id,
            x: v.offsetLeft,
            y: v.offsetTop,
            right: v.offsetLeft + v.offsetWidth,
            bottom: v.offsetTop + v.offsetHeight,
            z: q.z,
            visible: q.state !== "minimized",
          }
        : { visible: false };
    }
    case "directory":
      return Object.keys(s.files).filter((path) => dir(path) === a[0]);
    case "sort": {
      let list = [...a[0]].sort((x, y) => x.localeCompare(y));
      return a[1] === "descending" ? list.reverse() : list;
    }
    case "target":
      return a[0]?.id;
    case "focus": {
      let node = s.wins.find((q) => q.id === a[0]);
      if (node) raise(s, node, false);
      return 1;
    }
    case "route": {
      let node = s.wins.find((q) => q.id === a[0]);
      if (node?.pid) enqueue(s, node.pid, a[1].payload);
      return 1;
    }
    case "length":
      return a[0]?.length || 0;
    case "at":
      return a[0]?.[a[1]] ?? null;
    case "sin":
      return Math.sin(a[0]);
    case "exp":return Math.exp(a[0]);
    case "cos":
      return Math.cos(a[0]);
    case "abs":
      return Math.abs(a[0]);
    case "numeric":
      return Number(a[0]) || 0;
    case "keys":
      return Object.keys(a[0]).filter((k) => k !== "$format");
    case "entry":
      return { ...a[0], [a[1]]: a[2] };
    case "formula":
      try {
        return cellValue(a[0], a[1]);
      } catch (e) {
        return e.message;
      }
    case "commitBook":
      return finishCalculation(s, w, a[0], a[1]);
    case "push":
      return [...a[0], a[1]];
    case "min":
      return Math.min(...a);
    case "max":
      return Math.max(...a);
    case "app":
      return w ? copy(w.data[a[0]]) : null;
    case "setApp":
      if (w) w.data[a[0]] = copy(a[1]);
      return 1;
    case "poseAt":
      return { t: a[0], pose: sampleAt(w.data, a[0]) };
    case "input":
    case "physicsInput":
    case "commitFlight":
    case "integrate":
    case "sampleScene":
    case "effect":
    case "submit":
    case "frameKey":
    case "publishSurface":
    case "sensors":
    case "actuate":
    case "forward":
    case "chart":
      if (k === "submit" && w && a[0]?.surface) {
        w.data.layout = copy(a[0]);
        drawApp(s, w);
        return true;
      }
      if (
        k === "submit" &&
        w &&
        w.appId !== "custom" &&
        (a[0]?.items ||
          (Array.isArray(a[0]) && a[0].some((item) => item?.type)))
      ) {
        w.data.customSurface = true;
        w.data.drawing = copy(a[0]);
        drawApp(s, w);
        return true;
      }
      if (k === "submit" && (!w || w?.appId === "custom")) {
        let target = w;
        if (!target) {
          target = openApp(s, "custom", { program: p.pid });
          if (!target) return false;
          target.pid = p.pid;
          p.owner = target.id;
        }
        target.data.drawing = copy(a[0]);
        drawApp(s, target);
        return true;
      }
      return mediaService(s, p, w, k, a);
    case "files":
      if (a[0]?.action === "render" && w) {
        w.data.sort = a[1];
        drawApp(s, w);
      }
      return 1;
    default:
      return syscall(s, p, k, a);
  }
}
// One interpreter turn advances either the user instruction or its deepest
// system-call frame. Completed operands are retained across preemption.
const suspendedCall = Symbol("system call");
function stepProgram(s,p){
  const stack=p.frames??=[];
  const frame=stack.at(-1)||p;
  if(frame!==p)s.ktime++;
  if(frame.debt>0){frame.debt--;return}
  if(frame.paidPc!==frame.pc){
    const work=costOf(frame,s);
    if(work>0){frame.paidPc=frame.pc;frame.debt=work-1;return}
  }
  const start=frame.pc;
  const memo=frame.operands??=[];
  let index=0;
  try{
    execute(frame,(name,args)=>{
      if(index<memo.length)return memo[index++];
      let kernel=s.kernel.src;
      let at=parseProgram(kernel).labels[name];
      // Device names in privileged code address the device directly.
      if(at!==undefined && !(frame!==p&&kernelDevices.has(name))){
        if(stack.length>=48)throw Error("系统调用栈已满");
        stack.push({src:kernel,pc:at,v:Object.fromEntries(args.map((a,i)=>["arg"+i,copy(a)])),queue:[],state:"ready",debt:0});
        throw suspendedCall;
      }
      let result=device(s,p,name,args,frame!==p);
      memo.push(result??null);index++;
      return result;
    });
    delete frame.operands;
    delete frame.paidPc;
    if(frame!==p){
      if(frame.state==="ended"){stack.pop();(stack.at(-1)||p).operands.push(frame.result??null)}
      else if(frame.state!=="ready")throw Error("内核服务应通过返回值完成请求");
    }
  }catch(error){
    if(error!==suspendedCall)throw error;
    frame.pc=start;
  }
}
function runNode(s, grant) {
  if (s.state !== "running" || !s.kernel) return 0;
  if (s.idleStep === counter) return 0;
  let rem = Math.min(grant, s.budget),
    initial = rem,
    miss = 0,
    paid = false;
  let kp = s.kernel,
    env = (k, a) => {
      switch (k) {
        case "count":
          return Math.max(1, s.procs.length);
        case "slot":
          return s.procs[a[0]]?.pid || 0;
        case "run": {
          let p = pidOf(s, a[0]);
          if (
            !p ||
            p.state === "suspended" ||
            ["ended", "error"].includes(p.state)
          )
            return 0;
          let cap = Math.min(rem, p.cap - p.last, Math.max(1, a[1] || 1));
          if (cap <= 0) return 0;
          let used = 0;
          if (p.child) {
            let c = systems[p.child];
            if (c && c.last < c.budget)
              used = runNode(c, Math.min(cap, c.budget - c.last));
          } else {
            try {
              while (used < cap && p.state === "ready") {
                if (p.compilation) {
                  let c = p.compilation;
                  compileStep(c);
                  if (c.state === "ended") {
                    if (typeof c.result !== "string")
                      throw Error("编译器无输出");
                    parseProgram(c.result);
                    p.src = c.result;
                    delete p.compilation;
                  }
                } else {
                  stepProgram(s,p);
                  if ((p.work + used) % 128 === 0) {
                    let bytes = JSON.stringify(p.v).length * 2;
                    if (
                      bytes > s.memory ||
                      (bytes > 4096 && !allowance(s, "memory", usedMemory, 0))
                    ) {
                      p.v = {};
                      throw Error("变量占用超过内存配额");
                    }
                  }
                }
                used++;
              }
            } catch (e) {
              p.state = "error";
              p.error = e.message;
              if(p.staging||p.job){notify(s,p.name+" · "+e.message);delete p.staging;delete p.job;p.v={}}
            }
          }
          if (p.state === "ended") {
            p.v = {};
            p.queue = [];
            p.debt = 0;
            if (p.job) {
              notify(s, p.job);
              delete p.job;
              for (let fw of s.wins.filter((q) => q.appId === "files")) {
                enqueue(s, fw.pid, { action: "render", path: fw.data.path });
                if (!s.parentId) drawApp(s, fw);
              }
            }
          }
          p.last += used;
          p.work += used;
          rem -= used;
          if (used) paid = true;
          return used;
        }
        default:
          return device(s, kp, k, a, true);
      }
    };
  try {
    while (rem > 0 && kp.state === "ready") {
      rem--;
      s.ktime++;
      kp.work++;
      execute(kp, env);
      if (kp.pc === 0) {
        miss = paid ? 0 : miss + 1;
        paid = false;
        if (miss >= Math.max(1, s.procs.length)) {
          s.idleStep = counter;
          break;
        }
      }
    }
    if (kp.state !== "ready") throw Error("内核已退出");
  } catch (e) {
    s.state = "error";
    s.error = e.message;
    refreshStatus(s);
  }
  let n = initial - rem;
  s.last += n;
  return n;
}
function tick(s, dt) {
  if (s.state !== "running") return;
  s.clock += dt * s.speed;
  s.last = 0;
  s.ktime = 0;
  for (let p of s.procs) {
    p.last = 0;
    if (p.child && p.state !== "suspended" && systems[p.child])
      tick(systems[p.child], dt * s.speed);
  }
  if (s.widget.until) {
    s.widget.remain = Math.max(0, s.widget.until - s.clock);
    if (!s.widget.remain) {
      delete s.widget.until;
      notify(s, "倒计时结束");
    }
  }
}
function endProcess(s, p) {
  if (!p) return;
  if (p.child) return removeSystem(systems[p.child]);
  if (p.owner && s.wins.find((w) => w.id === p.owner && w.pid === p.pid))
    return closeWindow(
      s,
      s.wins.find((w) => w.id === p.owner),
      true,
    );
  p.state = "ended";
  delete p.compilation;delete p.frames;delete p.operands;p.debt=0;
  p.queue = [];
  p.v = {};
}

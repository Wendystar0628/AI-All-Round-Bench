function initMedia(s, w) {
  let d = w.data;
  if (w.appId === "player") {
    let path = d.path || PATH.scene,
      res = JSON.parse(fileRead(s, path)),
      record = res.samples ? res : null;
    if (record) res = record.resource;
    if (!Array.isArray(res.nodes)) throw Error("场景缺少 nodes");
    if (
      !allowance(
        s,
        "memory",
        usedMemory,
        JSON.stringify(res).length * 2 + res.nodes.length * 220,
      )
    )
      throw Error("场景资源超过内存配额");
    Object.assign(d, {
      scene: path,
      resource: res,
      title: res.title,
      resourceVersion:1,resourceSize:JSON.stringify(res).length,
      impact:record?.impact??null,smokeAt:record?.smokeAt??record?.samples?.find(f=>f.fault)?.t??null,
      position: 0,
      frameTime: 0,
      duration: record ? record.samples.at(-1).t : res.duration || 15,
      rate: 1,
      state: "paused",
      cam: "演出镜头",
      selection: "未选择部件",
      pose: keySample(res, 0),
      lastClock: s.clock,
      revision: 0,
      wind: 0,
      heading: 0,
      record: record?.samples,
      loop: false,
    });
    d.scenePid = launchProgram(s, "/System/scene.str", w.id)?.pid;
    d.fxPid = launchProgram(s, "/System/fx.str", w.id)?.pid;
    d.controller = launchProgram(s, PATH.control, w.id)?.pid;
    let c = pidOf(s, d.controller);
    if (c) c.state = "suspended";
    d.pose=sampleAt(d,0);
  } else {
    Object.assign(d, {
      range: "A1:D4",
      label: "A",
      series: "D",
      chartType: "分组柱状图",
      connectionState: "未连接",
      rows: [],
      ver: 0,
      revision: 0,
      sourceTitle: "",
    });
    d.receiver = launchProgram(s, "/System/receiver.str", w.id)?.pid;
  }
}
function logControl(d, at) {
  if (!d.controlLog) return;
  let v = {
    at,
    c: [...(d.control || [0, 0, 0])],
    wind: d.wind,
    fault: d.fault,
    landing: d.landing,
  };
  if (d.controlLog.at(-1)?.at === at) d.controlLog.pop();
  d.controlLog.push(v);
}
function sampleAt(d, t) {
  if (!d.record?.length) return keySample(d.resource, t);
  let frames = d.record;
  let lo = 0,
    hi = frames.length - 1;
  while (lo < hi) {
    let mid = (lo + hi + 1) >> 1;
    if (frames[mid].t <= t) lo = mid;
    else hi = mid - 1;
  }
  let a = frames[lo],
    b = frames[lo + 1];
  if (!b) return [...a.pose];
  let f = Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t || 1)));
  return a.pose.map((v, i) => v + (b.pose[i] - v) * f);
}
function processMedia(s, w, event) {
  if (!w || frozen(s)) return;
  if (s.wm) enqueue(s, s.wm, { id: w.id, payload: copy(event) });
  else enqueue(s, w.pid, event);
}
function mediaService(s, p, w, k, a) {
  if (!w) return 0;
  let d = w.data,
    e = a[0],
    send = (pid, value) => syscall(s, p, "send", [pid, value]);
  switch (k) {
    case "frameKey":return [d.revision||0,d.fxTime||0,d.resourceVersion||0].join("/");
    case "publishSurface":return transmit(s,w);
    case "sensors": {
      let f = d.flight || {};
      return {
        time:d.physicsAt??s.clock, x:f.x||0,z:f.z||0,yaw:f.yaw||0,
        y: f.y || 0,
        vy: f.vy || 0,
        roll: f.roll || 0,
        spin: f.spin || 0,
        target:
          d.landing && Math.hypot(18 - (f.x || 0), -3 - (f.z || 0)) < 1.5
            ? 0.18
            : 4.8,
        heading: (d.heading * Math.PI) / 180,
      };
    }
    case "actuate":
      if (d.rehearsal) {
        d.control = [...a];
        d.controlTime = s.clock;
        logControl(d, s.clock);
      }
      return 1;
    case "input": {
      if (e && e.action !== "focus") {
        switch (e.action) {
          case "play":
            if (d.rehearsal && d.state !== "playing") d.physicsAt = s.clock;
            if (d.position >= d.duration && !d.rehearsal) d.position = 0;
            d.state = "playing";
            break;
          case "pause":
            d.state = "paused";
            break;
          case "stop":
            d.state = "paused";
            d.position = 0;
            d.rehearsal = false;
            break;
          case "seek":
            d.position = Math.max(0, Math.min(d.duration, +e.value));
            d.rehearsal = false;
            break;
          case "step":
            d.state = "paused";
            d.position = Math.min(d.duration, d.position + 1 / 30);
            break;
          case "loop":
            d.loop = !d.loop;
            break;
          case "cam":
            d.cam = e.value;
            break;
          case "orbit":
            Object.assign(d, e.value, { cam: "自由环绕" });
            break;
          case "pick":
            d.selection =
              e.value +
              " · " +
              (d.position >= (d.impact ?? d.resource.motion?.impact ?? Infinity)
                ? "损坏"
                : "完好");
            break;
          case "load": {
            let res = JSON.parse(fileRead(s, e.value));
            if (res.samples) {
              d.record = res.samples;
              d.resource = res.resource;
              d.impact = res.impact??null;
              d.smokeAt=res.smokeAt??res.samples.find(f=>f.fault)?.t??null;
              d.duration = d.record.at(-1).t;
            } else {
              if (!Array.isArray(res.nodes)) throw Error("场景无效");
              d.resource = res;
              d.impact = null;
              d.record = null;d.smokeAt=null;
              d.duration = res.duration || 15;
            }
            d.state = "paused";
            d.rehearsal = false;
            d.position = 0;
            d.scene = e.value;d.resourceVersion=(d.resourceVersion||0)+1;d.resourceSize=JSON.stringify(d.resource).length;
            break;
          }
          case "rehearse": {
            let initialPose=sampleAt(d,d.position),[x, y, z, tilt, yaw, roll] = initialPose;
            let prior=d.record?.findLast(f=>f.t<=d.position);
            let last = sampleAt(d, Math.max(0, d.position - 0.025)),
              h = Math.min(0.025, d.position) || 1;
            d.flight = {
              x,
              y,
              z,
              vy: (y - last[1]) / h,
              vx: (x - last[0]) / h,
              vz: (z - last[2]) / h,
              roll,
              spin: (roll - last[5]) / h,
              yaw,
              tilt,
            };
            d.rehearsal = true;
            d.state = "playing";
            d.record = d.record
              ? d.record.filter((k) => k.t < d.position)
              : Array.from({ length: Math.ceil(d.position * 30) }, (_, i) => ({
                  t: i / 30,
                  pose: keySample(d.resource, i / 30),
                }));
            d.record.push({ t: d.position, pose: initialPose });
            if(prior?.flight){d.flight=copy(prior.flight);Object.assign(d.flight,{x,y,z,tilt,yaw,roll})}
            d.fault=prior?.fault??false;d.wind=prior?.wind??d.wind;d.heading=prior?.heading??d.heading;d.landing=prior?.landing??false;
            d.impact=d.impact!=null&&d.impact<=d.position?d.impact:null;
            d.smokeAt=d.smokeAt!=null&&d.smokeAt<=d.position?d.smokeAt:null;
            d.control=prior?.control?[...prior.control]:[9.81,0,yaw];
            d.controlTime = s.clock;
            let c = pidOf(s, d.controller);
            if (c&&!["error","ended"].includes(c.state)){c.state="ready";d.controllerOn=true}
            d.physicsAt = s.clock;
            d.controlLog = [];
            logControl(d, s.clock);
            break;
          }
          case "controller": {
            let c = pidOf(s, d.controller);
            if(c&&!["error","ended"].includes(c.state)){c.state=c.state==="suspended"?"ready":"suspended";d.controllerOn=c.state!=="suspended"}
            break;
          }
          case "fault":
            d.fault = true;
            d.smokeAt = d.position;
            break;
          case "landing":
            d.landing = !d.landing;
            break;
          case "saveflight": {
            if (!d.record?.length) {
              notify(s, "请先进行飞行排演");
              break;
            }
            let file =
              "/Documents/排演-" + Math.round(s.clock * 10) + ".flight";
            put(
              s,
              file,
              JSON.stringify({
                resource: d.resource,
                samples: d.record,
                impact: d.impact,
                smokeAt:d.smokeAt,
              }),
            );
            notify(s, "已保存 " + base(file));
            break;
          }
          case "rate":
          case "heading":
          case "wind":
            d[e.action] = +e.value;
            break;
        }
        if (d.rehearsal) logControl(d, s.clock);
        d.revision++;
      }
      return 1;
    }
    case "physicsInput":{
      const stamp=d.physicsAt+a[0]/d.rate,log=d.controlLog||[];
      while(log.length>1&&log[1].at<=stamp)log.shift();
      const signal=copy(log[0]||{at:stamp,c:d.control,wind:d.wind,fault:!!d.fault,landing:!!d.landing});
      signal.fault=!!signal.fault;signal.landing=!!signal.landing;
      const pad=d.resource.landingSite||[18,0,-3];
      return {t:d.position,flight:copy(d.flight),signal,speed:signal.c[3]??1.7,padX:pad[0],padZ:pad[2],ground:collisionHeight(d.resource.nodes,d.flight.x,d.flight.z)};
    }
    case "commitFlight":{
      const [h,f,signal]=a;
      if(d.record.length%64===0&&!allowance(s,"memory",usedMemory,512)){d.state="paused";notify(s,"排演记录已达内存上限");return false}
      if(f.contact&&!d.flight.contact){d.impact=f.contact.t;d.smokeAt??=d.impact}
      d.flight=copy(f);d.physicsAt+=h/d.rate;d.position+=h;d.duration=Math.max(d.position,d.duration);
      d.record.push({t:d.position,pose:[f.x,f.y,f.z,f.tilt,f.yaw,f.roll],control:copy(signal.c),wind:signal.wind,heading:d.heading,fault:signal.fault,landing:signal.landing,controlTime:signal.at,flight:copy(f)});
      if(d.impact!=null&&d.position>d.impact+3)d.state="paused";return true;
    }
    case "integrate": {
      let delta = Math.max(0, a[0]);
      if (d.state === "playing") {
        if (d.rehearsal) {
          let f = d.flight,
            dt = delta;
          d.physicsAt += dt / d.rate;
          let log = d.controlLog || [];
          while (log.length > 1 && log[1].at <= d.physicsAt) log.shift();
          let signal = log[0] || {
              c: d.control,
              wind: d.wind,
              fault: d.fault,
              landing: d.landing,
            },
            [lift, rudder, target] = signal.c || [0, 0, 0];
          let steps = Math.ceil(dt / 0.025);
          for (let j = 0; j < steps; j++) {
            let h = dt / steps,
              ground = collisionHeight(d.resource.nodes, f.x, f.z);
            if (advanceFlight(f, signal, h, d.position + j * h, ground)) {
              d.impact = d.position + j * h;
              d.smokeAt ??= d.impact;
            }
          }
          d.position += dt;
          d.duration = Math.max(d.position, d.duration);
          if (
            d.record.length % 100 === 99 &&
            !allowance(s, "memory", usedMemory, 256)
          ) {
            d.state = "paused";
            throw Error("排演记录内存不足");
          }
          d.record.push({
            t: d.position,
            pose: [f.x, f.y, f.z, f.tilt, f.yaw, f.roll],
            control: [...(signal.c || d.control)],
            wind: signal.wind,
            heading: d.heading,
            fault: signal.fault,
            controlTime: signal.at,
            flight:copy(f),landing:!!signal.landing,
          });
          if (d.impact && d.position > d.impact + 3) d.state = "paused";
        } else {
          d.position += delta;
          if (d.position >= d.duration) {
            if (d.loop) d.position %= d.duration;
            else {
              d.position = d.duration;
              d.state = "paused";
            }
          }
        }
      }
      return 1;
    }
    case "sampleScene":
      return e;
    case "submit":
      if (e?.kind === "chart" && w.appId === "charts") {
        d.previousPoints = d.points || [];
        d.transition = s.clock;
        Object.assign(d, {
          rows: e.rows,
          labels: e.labels,
          points: e.points,
          low: e.low,
          high: e.high,
          baseline: e.baseline,
          ver: e.version,
        });
        d.revision++;
        return 1;
      }
      if (w.appId === "files" && Array.isArray(e)) {
        w.data.entries = e;
        w.data.listPath = w.data.path;
        drawApp(s, w);
        return 1;
      }
      if (e?.pose) {
        d.frameTime = e.t;
        d.pose = copy(e.pose);
        d.revision++;
      } else if (e != null) {
        d.drawing = copy(e);
      }
      return 1;
    case "effect":
      d.fxTime = e;
      return 1;
    case "forward":
      p.debt += e.rows?.length || 1;
      return send(w.pid, e);
    case "chart": {
      if (e?.action === "packet" && e.token === d.token && e.version >= d.ver) {
        d.rows = e.rows.map((row) => [
          row[0],
          ...row.slice(1).map((v) => (Number(v) || 0) * a[1]),
        ]);
        d.labels = e.labels;
        d.ver = e.version;
        d.revision++;
      } else if (e?.action === "type") {
        d.chartType = e.value;
        d.revision++;
      } else if (e?.action === "point") {
        d.point = e.value;
        d.revision++;
      } else if (e?.action === "connect") connectChart(s, w, e);
      else if (e?.action === "disconnect") {
        d.connectionState = "已断开";
        delete d.source;
        d.token = (d.token || 0) + 1;
        d.revision++;
      }
      return 1;
    }
  }
  return 0;
}
function packet(book, d) {
  let rr = region(d.range),
    lbl = addr(d.label + "1")[0],
    cols = d.series
      .toUpperCase()
      .split(/[,，\s]+/)
      .filter(Boolean)
      .map((a) => addr(a + "1")[0]);
  if (!cols.length || [lbl, ...cols].some((x) => x < rr.x || x > rr.X))
    throw Error("所选列超出区域");
  let rows = [],
    labels = cols.map((c) => String(value(book.data, col(c) + (rr.y + 1))));
  for (let i = rr.y + 1; i <= rr.Y; i++)
    rows.push([
      String(value(book.data, col(lbl) + (i + 1))),
      ...cols.map((c) => value(book.data, col(c) + (i + 1))),
    ]);
  return {
    action: "packet",
    rows,
    labels,
    version: book.data.version,
    token: d.token,
  };
}
function connectChart(s, w, e) {
  let d = w.data,
    book = root.wins.find(
      (b) => b.id === e.source && b.appId === "spreadsheet",
    );
  if (!book) {
    notify(s, "请先在根系统打开工作簿");
    return;
  }
  try {
    let cfg = { ...d, ...e, token: (d.token || 0) + 1 },
      pkt = packet({ data: book.data.committed || book.data }, cfg);
    Object.assign(d, {
      range: e.range,
      label: e.label,
      series: e.series,
      source: book.id,
      token: cfg.token,
      sourceTitle: base(book.data.path),
      ver: 0,
      connectionState: "已连接",
    });
    enqueue(s, d.receiver, pkt);
    d.revision++;
  } catch (e) {
    notify(s, e.message);
  }
}
function publishBook(book) {
  for (let s of Object.values(systems))
    for (let w of s.wins)
      if (w.appId === "charts" && w.data.source === book.id) {
        try {
          let pkt = packet(book, w.data);
          if (frozen(s)||w.outbox?.length) {
            w.outbox ??= [];
            w.outbox.push(pkt);
          } else enqueue(s, w.data.receiver, pkt);
        } catch (e) {
          notify(s, e.message);
        }
      }
}
function disconnectBook(id) {
  for (let s of Object.values(systems))
    for (let w of s.wins)
      if (w.appId === "charts" && w.data.source === id) {
        delete w.data.source;
        w.data.connectionState = "数据源已关闭";
        w.data.revision++;
      }
}
function displayCopy(w, includeResource) {
  let d = w.data,
    out = {};
  for (let k of [
    "scene",
    "position",
    "duration",
    "frameTime",
    "fxTime",
    "state",
    "rate",
    "pose",
    "cam",
    "angle",
    "pitch",
    "zoom",
    "selection",
    "loop",
    "revision",
    "resourceVersion",
    "controllerOn",
    "landing",
    "rehearsal",
    "heading",
    "wind",
    "impact",
    "smokeAt",
    "fault",
    "chartType",
    "rows",
    "labels",
    "range",
    "series",
    "label",
    "sourceTitle",
    "ver",
    "source",
    "connectionState",
    "point",
    "points",
    "previousPoints",
    "transition",
    "low",
    "high",
    "baseline",
  ])
    if (d[k] !== undefined) out[k] = copy(d[k]);
  out.record = !!d.record;
  if (includeResource && d.resource) out.resource = copy(d.resource);
  return out;
}
function transmissionTarget(s,w){
  for(let id=s.parentId;id;id=systems[id]?.parentId){
    let q=systems[id].wins.find(q=>q.appId==="projection"&&q.data.sid===s.id&&q.data.wid===w.id);
    if(q)return q;
  }
}
function ensureTransport(s,w){let proc=pidOf(s,w.data.transportPid);if(!proc||proc.owner!==w.id||proc.state==="ended"){
  s.files["/System/projection.str"]??=APP_PROGS.projection;
  w.data.transportPid=launchProgram(s,"/System/projection.str",w.id)?.pid;
}}
function transmit(s,w){
  let target=transmissionTarget(s,w);if(!target)return 0;
  let old=target.data.surface,need=!!w.data.resource&&(!old.resource||old.resourceVersion!==w.data.resourceVersion);
  let next=displayCopy(w,need);if(!need&&old.resource)next.resource=old.resource;
  target.data.surface=next;return 1;
}
function project(src, w, target) {
  for (let s of Object.values(systems))
    for (let a of s.wins)
      if (a.appId === "projection" && a.data.wid === w.id) {
        restore(s, a);
        return;
      }
  let q = openApp(target, "projection", {
    wid: w.id,
    sid: src.id,
    kind: w.appId,
    surface: displayCopy(w, false),
  });
  ensureTransport(src,w);
  notify(target, "已接入 " + src.id + " 的" + names[w.appId]);
  return q;
}
function mediaView(s, w, body) {
  let proj = w.appId === "projection",
    src = proj ? systems[w.data.sid] : s,
    source = proj ? src?.wins.find((q) => q.id === w.data.wid) : w;
  if (!source) return;
  let d = proj ? w.data.surface : w.data,
    kind = source.appId,
    B = (l, fn, t, cl) => btn(l, fn, t, s, w, cl),
    act = (action, value) => processMedia(src, source, { action, value }),
    bar = (...kids) => {
      let r = el("div", "toolbar");
      r.append(...kids);
      body.append(r);
      return r;
    };
  let projBtn = B(
    icon("projection", 15) + " 投送",
    () => {
      body.querySelector(".targetmenu")?.remove();
      let row = el("div", "targetmenu", "投送到桌面 ");
      for (let id = src.parentId; id; id = systems[id]?.parentId) {
        let target = systems[id],
          b = B(
            target.name + " / " + target.id,
            () => {
              row.remove();
              project(src, source, target);
            },
            "project-target",
          );
        b.dataset.targetSystemId = id;
        row.append(b);
      }
      body.prepend(row);
    },
    "window-project",
  );
  let ui = views[w.id];
  if (kind === "player") {
    let files = Object.keys(src.files).filter((k) =>
      /\.(scene|flight)$/.test(k),
    );
    let path = select(files, d.scene, "player-open", s, w, (v) =>
        act("load", v),
      ),
      cam = select(
        ["演出镜头", "跟随镜头", "自由环绕"],
        d.cam,
        "player-camera",
        s,
        w,
        (v) => act("cam", v),
      ),
      mode = B("飞行排演", () => {flight.hidden=!flight.hidden;mode.setAttribute("aria-expanded",String(!flight.hidden))});
    path.style.maxWidth = "40%";
    let top = bar(
      path,
      B("载入", () => act("load", path.value)),
      cam,
      mode,
    );
    if (!proj) top.append(projBtn);
    let flight = el("div", "toolbar flightbar");
    flight.hidden = true;
    body.append(flight);
    flight.append(
      B("开始 / 续演", () => act("rehearse"), "rehearsal-start", "primary"),
      "风",
      field("number", d.wind, "rehearsal-wind", s, w, (v) => act("wind", v)),
      "航向",
      field("number", d.heading, "rehearsal-heading", s, w, (v) =>
        act("heading", v),
      ),
      B("故障", () => act("fault"), "rehearsal-fault"),
      B("飞控开关", () => act("controller"), "rehearsal-controller"),
      B("着陆", () => act("landing")),
      B("保存记录", () => act("saveflight")),
    );
    let box = el("div", "viewbox"),
      canvas = mark(el("canvas", "viewport"), "player-view", s, w),
      hud = el(
        "div",
        "hud tl",
        esc(d.resource?.callsign || "SCENE") +
          " &nbsp; / &nbsp; " +
          esc(d.resource?.title || "三维场景"),
      ),
      sub = el("div", "hud br");
    const telemetry=el("div","telemetry");
    const meters=["高度 / ALT","航向 / HDG","横滚 / ROLL"].map(label=>{let card=el("span","meter","<small>"+label+"</small><b></b>");telemetry.append(card);return card.lastElementChild});
    const phase=el("span","flight-phase");
    box.append(canvas,hud,sub,telemetry,phase);
    body.append(box);
    canvas.onpointerdown = (e) => {
      let ox = e.clientX,
        oy = e.clientY,
        angle = d.angle ?? 1.1,
        pitch = d.pitch ?? 0.32,
        moved = false;
      canvas.setPointerCapture(e.pointerId);
      canvas.onpointermove = (ev) => {
        let dx = ev.clientX - ox,
          dy = ev.clientY - oy;
        if (Math.abs(dx) + Math.abs(dy) > 4) {
          moved = true;
          act("orbit", {
            angle: angle - dx * 0.009,
            pitch: Math.max(-0.04, Math.min(1.45, pitch + dy * 0.007)),
          });
        }
      };
      canvas.onpointerup = (ev) => {
        canvas.onpointermove = null;
        if (!moved) {
          let hit=pickHit(canvas,ev),picked=hit?.object.name||"远景";
          act("pick", picked);
          if (d.rehearsal && hit && !hit.object.parent?.name)
            act(
              "heading",
              Math.round(Math.atan2(hit.point.z-d.pose[2],hit.point.x-d.pose[0])*180/Math.PI),
            );
        }
      };
    };
    canvas.onwheel = (e) => {
      e.preventDefault();
      act("orbit", {
        zoom: Math.max(6, Math.min(40, (d.zoom || 16) + Math.sign(e.deltaY))),
      });
    };
    let seek = field("range", d.position, "player-seek", s, w, (v) =>
      act("seek", v),
    );
    seek.min = 0;
    seek.max = d.duration;
    seek.step = 0.01;
    seek.oninput = () => act("seek", seek.value);
    let time = mark(el("span", "mono"), "player-time", s, w),
      rate = select(
        [
          ["0.25", "¼×"],
          ["0.5", "½×"],
          ["1", "1×"],
          ["2", "2×"],
          ["4", "4×"],
        ],
        d.rate,
        "player-rate",
        s,
        w,
        (v) => act("rate", v),
      ),
      play = B("▶", () => act("play"), "player-play", "primary"),
      pause = B("Ⅱ", () => act("pause"), "player-pause"),
      stop = B("■", () => act("stop"), "player-stop"),
      step = B("▷|", () => act("step"), "player-step"),
      loop = B("↻", () => act("loop"), "player-loop");
    const jump=field("number",d.frameTime,"player-position",s,w,v=>act("seek",v));
    jump.min=0;jump.step=1/30;jump.className="timeentry";jump.title="跳转到指定秒数";jump.ariaLabel=jump.title;
    for(let [b,name]of [[play,"播放"],[pause,"暂停"],[stop,"停止并回到开头"],[step,"前进一帧"],[loop,"循环播放"]]){b.title=name;b.ariaLabel=name}
    bar(play, pause, stop, step, seek, time,jump, rate, loop).classList.add(
      "playcontrols",
    );
    let st = mark(el("div", "status"), "player-selection", s, w);
    body.append(st);
    ui.update = (now) => {
      d = now;
      seek.max = jump.max = d.duration;
      if(document.activeElement!==jump)jump.value=Number(d.frameTime).toFixed(2);
      if(d.pose){meters[0].textContent=d.pose[1].toFixed(1)+" m";meters[1].textContent=String((Math.round(d.pose[4]*180/Math.PI)+360)%360).padStart(3,"0")+"°";meters[2].textContent=Math.round(d.pose[5]*180/Math.PI)+"°"}
      let impact=(d.record||d.rehearsal)?d.impact:d.resource?.motion?.impact, smoke=(d.record||d.rehearsal)?d.smokeAt:d.resource?.motion?.smoke;
      phase.textContent=impact!=null&&d.frameTime>=impact?"撞击记录":smoke!=null&&d.frameTime>=smoke?"故障告警":d.rehearsal?"实时排演":d.record?"排演回放":d.frameTime<2?"起飞准备":"飞行中";
      phase.classList.toggle("warning",phase.textContent.includes("告警")||phase.textContent.includes("撞击"));
      hud.textContent=(d.resource?.callsign||"SCENE")+"  /  "+(d.resource?.title||"接收资源中…");
      loop.setAttribute("aria-pressed",String(!!d.loop));
      if (document.activeElement !== seek) seek.value = d.position;
      time.textContent =
        Number(d.frameTime).toFixed(1) +
        " / " +
        Number(d.duration).toFixed(1) +
        " s";
      loop.style.background = d.loop ? "#b8cc91" : "";
      sub.textContent =
        (d.rehearsal ? "LIVE FLIGHT" : "SCENE SEQUENCE") +
        "   /   " +
        String(Math.floor((d.frameTime || 0) * 30)).padStart(4, "0");
      st.textContent =
        (frozen(src)
          ? "源系统暂停"
          : d.state === "playing"
            ? "● 播放中"
            : "Ⅱ 已暂停") +
        "   /   " +
        d.selection +
        "   ·   " +
        src.id;
      cam.value = d.cam;
      rate.value = d.rate;
      renderFrame(canvas, d.resource, d);
    };
  } else {
    let books = root.wins.filter((q) => q.appId === "spreadsheet"),
      srcSel = select(
        books.map((b) => [b.id, base(b.data.path)]),
        d.source || books[0]?.id,
        "chart-source",
        s,
        w,
        () => {},
      );
    let range = field("text", d.range, "chart-range", s, w),
      label = field("text", d.label, "chart-label-column", s, w),
      series = field("text", d.series, "chart-series", s, w);
    for (let [i, n] of [
      [range, 82],
      [label, 36],
      [series, 43],
    ])
      i.style.width = n + "px";
    let type = select(
      ["分组柱状图", "折线图"],
      d.chartType,
      "chart-type",
      s,
      w,
      (v) => act("type", v),
    );
    bar("工作簿", srcSel, "区域", range, "标签列", label, "数值列", series);
    let controls = bar(
      B(
        "连接",
        () =>
          processMedia(src, source, {
            action: "connect",
            source: srcSel.value,
            range: range.value,
            label: label.value.toUpperCase(),
            series: series.value.toUpperCase(),
          }),
        "chart-connect",
        "primary",
      ),
      B("断开", () => act("disconnect"), "chart-disconnect"),
      type,
    );
    if (!proj) controls.append(projBtn);
    let h = el("div", "apphead"),
      box = el("div", "chartbox"),
      st = el("div", "status");
    body.append(h, box, st);
    let last = -9;
    ui.update = (now) => {
      d = now;
      let progress = Math.min(
          1,
          Math.max(0, (src.clock - (d.transition || 0)) / 0.35),
        ),
        stamp = d.revision + ":" + progress;
      if (last !== stamp) {
        last = stamp;
        h.innerHTML =
          '<div class="kicker">DATA OBSERVATORY &nbsp; / &nbsp; ' +
          src.id.toUpperCase() +
          "</div><h2>" +
          esc(d.sourceTitle || "数据观测") +
          "</h2>";
        chartGraphic(box, d, (i) => act("point", i), progress);
        type.value = d.chartType;
      }
      let opts = root.wins.filter((b) => b.appId === "spreadsheet");
      if (srcSel.options.length !== opts.length) {
        srcSel.replaceChildren(
          ...opts.map((b) => new Option(base(b.data.path), b.id)),
        );
      }
      st.textContent =
        (frozen(src) ? "源系统暂停" : d.connectionState) +
        "   /   " +
        d.range +
        "   ·   数据版本 " +
        d.ver;
    };
  }
  ui.update(d);
}
function chartGraphic(box, d, point, progress = 1) {
  let rows = d.rows || [],
    labels = d.labels || [],
    max = Math.max(1, ...rows.flatMap((r) => r.slice(1).map(Math.abs))),
    colors = ["#729474", "#d1ae68", "#9487ae", "#689ba8"];
  if (!rows.length) {
    box.innerHTML =
      '<div style="text-align:center;color:#809176">' +
      icon("charts", 45) +
      "<p>连接工作簿以查看实时图表</p></div>";
    return;
  }
  let parts = ['<svg viewBox="0 0 630 260">'];
  for (let i = 0; i <= 4; i++) {
    let y = 210 - i * 44;
    parts.push(
      '<path d="M47 ' +
        y +
        'h555" stroke="#c7d1bf" stroke-dasharray="3 4"/><text x="40" y="' +
        (y + 4) +
        '" text-anchor="end">' +
        Number(
          ((d.low || 0) + (((d.high ?? max) - (d.low || 0)) * i) / 4).toFixed(
            2,
          ),
        ) +
        "</text>",
    );
  }
  let slot = 540 / rows.length;
  labels.forEach((l, j) => {
    let color = colors[j % 4],
      coords = [];
    parts.push(
      '<rect x="' +
        (52 + j * 106) +
        '" y="4" width="9" height="9" fill="' +
        color +
        '"/><text x="' +
        (65 + j * 106) +
        '" y="13">' +
        esc(l) +
        "</text>",
    );
    rows.forEach((r, i) => {
      let pt = d.points?.[i * labels.length + j],
        prev = d.previousPoints?.[i * labels.length + j],
        base = 34 + 176 * (d.baseline ?? 1),
        dy = pt?.y ?? 1 - Math.abs(r[j + 1]) / max;
      let x = 55 + 540 * (pt?.x ?? (i + 0.5) / rows.length),
        y =
          34 +
          176 * ((prev?.y ?? d.baseline ?? 1) * (1 - progress) + dy * progress);
      coords.push(x + "," + y);
      if (!j)
        parts.push(
          '<text x="' +
            x +
            '" y="235" text-anchor="middle">' +
            esc(r[0]) +
            "</text>",
        );
      if (d.chartType === "折线图")
        parts.push(
          '<circle data-i="' +
            i +
            '" cx="' +
            x +
            '" cy="' +
            y +
            '" r="5" fill="' +
            color +
            '"/>',
        );
      else {
        let bw = (slot * 0.55) / labels.length,
          bx = x - slot * 0.275 + j * bw;
        parts.push(
          '<rect data-i="' +
            i +
            '" x="' +
            bx +
            '" y="' +
            Math.min(base, y) +
            '" width="' +
            bw +
            '" height="' +
            Math.abs(base - y) +
            '" fill="' +
            color +
            '" rx="2"/>',
        );
        x = bx + bw / 2;
      }
      parts.push(
        '<text data-i="' +
          i +
          '" x="' +
          x +
          '" y="' +
          (y - 6) +
          '" text-anchor="middle">' +
          esc(r[j + 1]) +
          "</text>",
      );
    });
    if (d.chartType === "折线图")
      parts.push(
        '<polyline points="' +
          coords.join(" ") +
          '" fill="none" stroke="' +
          color +
          '" stroke-width="3"/>',
      );
  });
  box.innerHTML = parts.join("") + "</svg>";
  box.querySelectorAll("[data-i]").forEach((e) => {
    e.onclick = () => point(+e.dataset.i);
    e.style.cursor = "pointer";
    if (+e.dataset.i === d.point) e.style.filter = "brightness(.72)";
    let t = document.createElementNS("http://www.w3.org/2000/svg", "title");
    t.textContent = rows[e.dataset.i].join(" · ");
    e.append(t);
  });
}

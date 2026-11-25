"use strict";
const $ = (s) => document.querySelector(s);
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x)),
  mix = (a, b, t) => a + (b - a) * t;
const ease = (x) => {
  x = clamp(x);
  return x * x * (3 - 2 * x);
};
const titles = [
  ["封装", "NVIDIA B200", "硅的回声", "两片硅隔着一道细缝，交换同一束光。"],
  [
    "双城",
    "TWIN CITIES",
    "缝间双城",
    "硅面上的窗格逐一亮起，两岸的灯火越过接缝。",
  ],
  [
    "分光",
    "DIVISION OF LIGHT",
    "一束千重",
    "一束光沿晶粒的街巷分开，在细密的栅间同时落下。",
  ],
  [
    "潮汐",
    "TIDAL CURRENT",
    "潮汐回路",
    "光沿显存叠层下行，穿过中介层与缓存。阵列亮起，青色的回光循线返航。",
  ],
  [
    "余印",
    "AFTERIMAGE",
    "硅纹余印",
    "同一枚封装渐渐只剩几层墨色。每一小块各自调墨，硅上的细纹重新浮出。",
  ],
  [
    "织光",
    "LIGHT LOOM",
    "晶格织光",
    "一句话从计算单元的栅间展开，织成一个字，又折回那一格硅。",
  ],
  ["群岛", "ARCHIPELAGO", "硅上群岛", "一束光分往群岛，各自绕行，再一同抵岸。"],
  [
    "机林",
    "NOCTURNE",
    "机林夜航",
    "机柜成为街巷，电沿铜脉入城，热随水色退去。",
  ],
  ["归芯", "REPRISE", "归芯", ""],
];
const N = titles.length,
  stage = $("#stage"),
  nav = $("#chapters"),
  dir = $("#directory");
const fresh = () => ({
  turns: Array.from({ length: N }, () => ({ angle: 0, tilt: 0 })),
  touch: Array.from({ length: N }, () => ({ x: 0.6, y: 0.45, awake: false })),
  shuttle: [1, 0, 0],
  shuttleGoal: 0,
  manualOpen: null,
  opening: 0.1,
  zoom: 1,
  zoomGoal: 1,
  rackBase: null,
  rear: null,
  lift: 0.8,
  liftGoal: 0.8,
});
let state = fresh(),
  exporting = false,
  ep = 0,
  et = 0,
  nowTime = 0,
  lastTick = performance.now(),
  current = 0,
  navMove = null,
  drag = null,
  priorTitle = -1;
const surfaces = [];
function makeCanvas(parent, cls) {
  let c = document.createElement("canvas");
  c.className = cls;
  c.setAttribute("aria-hidden", "true");
  parent.appendChild(c);
  return c;
}
function modelSurface(parent, withStencil) {
  let area = document.createElement("div");
  area.className = "modelArea";
  parent.appendChild(area);
  let bg = withStencil ? makeCanvas(area, "backdrop") : null;
  return {
    area,
    bg,
    solid: makeCanvas(area, "solid"),
    fx: makeCanvas(area, "signals"),
  };
}
titles.forEach(([label, en, title], i) => {
  let wrap = document.createElement("div");
  wrap.className = "surface";
  wrap.dataset.id = i;
  $("#surfaces").appendChild(wrap);
  let scene = { wrap };
  if (i === 0 || i === 6 || i === 7) scene.model = modelSurface(wrap, i === 0);
  else if (i === 8) {
    scene.parts = [7, 6, 0].map((id) => {
      let panel = document.createElement("div");
      panel.className = "returnPlane";
      wrap.appendChild(panel);
      return { panel, model: modelSurface(panel, id === 0) };
    });
  } else scene.art = makeCanvas(wrap, "art");
  surfaces.push(scene);
  let b = document.createElement("button");
  b.textContent = label;
  b.setAttribute("aria-label", "进入" + title);
  b.onclick = () => go(i);
  nav.appendChild(b);
  let link = document.createElement("button");
  link.innerHTML = "<span>" + title + "</span><small>" + en + "</small>";
  link.onclick = () => {
    dir.close();
    go(i);
  };
  $("#links").appendChild(link);
});
const gestureLabels = [
  "轻触拆开 · 拖动旋转",
  "点亮街区",
  "掠过阵列",
  "照亮回路",
  "擦过墨面",
  "投下一梭",
  "靠近群岛",
  "转看背板",
  "",
];
function progress() {
  return exporting
    ? ep
    : clamp(
        scrollY /
          Math.max(1, document.documentElement.scrollHeight - innerHeight),
      );
}
function go(i) {
  if (exporting) return;
  const end = i === 0 ? 0 : i / N + 0.012;
  navMove = {
    a: progress(),
    b: end,
    begin: performance.now(),
    duration: Math.min(1550, 480 + Math.abs(progress() - end) * 1430),
  };
}
$("#home").onclick = () => go(0);
$("#enter").onclick = () => go(1);
$("#indexButton").onclick = () => dir.showModal();
$("#dismiss").onclick = () => dir.close();
dir.onclick = (e) => {
  if (e.target === dir) {
    let r = dir.getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      dir.close();
  }
};
$("#full").onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {}
};
document.addEventListener("fullscreenchange", () =>
  $("#full").setAttribute(
    "aria-label",
    document.fullscreenElement ? "退出全屏" : "进入全屏",
  ),
);
function act() {
  if (exporting || current === 8) return;
  if (current === 0) state.manualOpen = state.manualOpen === 1 ? 0 : 1;
  else if (current === 6) {
    if (modelView(progress() * N - 6) > 1.6)
      state.liftGoal = state.liftGoal > 0.5 ? 0 : 1;
    else state.zoomGoal = state.zoomGoal > 1.1 ? 1 : 1.32;
  } else if (current === 5) {
    state.shuttleGoal = (state.shuttleGoal + 1) % 3;
  } else if (current === 7) {
    const base = lockRack(),
      yaw = base + state.turns[7].angle;
    const target =
      Math.cos(base + (state.rear ?? state.turns[7].angle)) < 0
        ? 0.58
        : Math.PI + 0.34;
    state.rear =
      state.turns[7].angle +
      Math.atan2(Math.sin(target - yaw), Math.cos(target - yaw));
  } else {
    const v = state.touch[current];
    v.awake = true;
    v.x = v.x > 0.63 ? 0.39 : 0.77;
    v.y = v.y > 0.52 ? 0.35 : 0.6;
  }
  render();
}
$("#gesture").onclick = act;
function lockRack() {
  if (state.rackBase === null)
    state.rackBase = Model.rackYaw(clamp(progress() * N - 7), {
      rackBase: null,
    });
  return state.rackBase;
}
function point(e) {
  const r = stage.getBoundingClientRect(),
    k = Math.max(r.width / 1200, r.height / 680);
  return {
    x: clamp((e.clientX - r.x - (r.width - 1200 * k) / 2) / (1200 * k)),
    y: clamp((e.clientY - r.y - (r.height - 680 * k) / 2) / (680 * k)),
  };
}
stage.onpointerdown = (e) => {
  if (exporting || e.target.closest("button") || current === 8) return;
  drag = {
    sx: e.clientX,
    sy: e.clientY,
    angle: state.turns[current].angle,
    tilt: state.turns[current].tilt,
    id: current,
    moved: false,
  };
  stage.setPointerCapture(e.pointerId);
  stage.focus({ preventScroll: true });
  navMove = null;
  if (current > 0 && current < 6)
    state.touch[current] = { ...point(e), awake: true };
};
stage.onpointermove = (e) => {
  if (exporting || e.target.closest("button")) return;
  const pt = point(e);
  if ([1, 2, 3, 4, 5].includes(current))
    state.touch[current] = { ...pt, awake: true };
  if (drag && drag.id === current) {
    const dx = e.clientX - drag.sx,
      dy = e.clientY - drag.sy;
    drag.moved ||= Math.hypot(dx, dy) > 5;
    if ([0, 6, 7].includes(current) && drag.moved) {
      if (current === 7) {
        lockRack();
        state.rear = null;
      }
      state.turns[current].angle = drag.angle + dx * 0.007;
      state.turns[current].tilt = clamp(drag.tilt - dy * 0.004, -0.29, 0.67);
    }
  }
};
stage.onpointerup = () => {
  if (
    drag &&
    !drag.moved &&
    drag.id === current &&
    [0, 5, 6, 7].includes(current)
  )
    act();
  drag = null;
};
stage.onpointercancel = () => (drag = null);
stage.onkeydown = (e) => {
  if (exporting || current === 8 || e.target.closest("button")) return;
  if (e.key === " " || e.key === "Enter") {
    e.preventDefault();
    act();
    return;
  }
  if (!e.key.startsWith("Arrow")) return;
  e.preventDefault();
  const dx = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0,
    dy = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
  if ([0, 6, 7].includes(current)) {
    state.turns[current].angle += dx * 0.13;
    state.turns[current].tilt = clamp(
      state.turns[current].tilt - dy * 0.08,
      -0.29,
      0.67,
    );
    if (current === 7) {
      lockRack();
      state.rear = null;
    }
  } else {
    const pt = state.touch[current];
    pt.awake = true;
    pt.x = clamp(pt.x + 0.055 * dx);
    pt.y = clamp(pt.y + 0.055 * dy);
  }
  render();
};
addEventListener("wheel", () => (navMove = null), { passive: true });
addEventListener("pointerdown", () => (navMove = null), { passive: true });
addEventListener("keydown", (e) => {
  if (exporting || dir.open) return;
  if (
    ["Home", "End", "PageDown", "PageUp", "ArrowUp", "ArrowDown", " "].includes(
      e.key,
    )
  )
    navMove = null;
  if (e.key === "Escape") drag = null;
  if (e.target === document.body) {
    if (e.key === "ArrowRight") go(Math.min(N - 1, current + 1));
    if (e.key === "ArrowLeft") go(Math.max(0, current - 1));
  }
});
function modelView(p) {
  return ease((p - 0.22) / 0.21) + ease((p - 0.53) / 0.23);
}
function drawModel(m, id, p, t, overrides = {}) {
  const pose = state.turns[id],
    s = {
      angle: pose.angle,
      tilt: pose.tilt,
      explode: state.opening,
      platformView: modelView(p),
      plateLift: state.lift,
      forest: -1,
      drawer: -1,
      rackBase: state.rackBase,
      zoom: id === 6 ? state.zoom : 1,
      ...overrides,
    };
  const a = Model.draw(m.solid, m.fx, id, p, t, s);
  if (m.bg && a) Prints.backing(m.bg, a.stencil);
  return a;
}
function rel(el, x, y) {
  let q = el.getBoundingClientRect(),
    r = stage.getBoundingClientRect();
  return [x + q.left - r.left, y + q.top - r.top];
}
function mid(quad) {
  return quad.reduce(
    (a, v) => [a[0] + v[0] / quad.length, a[1] + v[1] / quad.length],
    [0, 0],
  );
}
function roundReveal(el, point, b, w, h) {
  if (b <= 0) {
    el.style.clipPath = "circle(0px at 50% 50%)";
    return;
  }
  if (b >= 1) {
    el.style.clipPath = "none";
    return;
  }
  const max = Math.max(
    Math.hypot(point[0], point[1]),
    Math.hypot(w - point[0], point[1]),
    Math.hypot(point[0], h - point[1]),
    Math.hypot(w - point[0], h - point[1]),
  );
  el.style.clipPath =
    "circle(" + (b * max + 1) + "px at " + point[0] + "px " + point[1] + "px)";
}
const relay = $("#relay"),
  ink = relay.getContext("2d", { willReadFrequently: true });
function clearRelay() {
  const w = stage.clientWidth,
    h = stage.clientHeight,
    d = Math.min(devicePixelRatio || 1, 2);
  if (relay.width !== Math.round(w * d) || relay.height !== Math.round(h * d)) {
    relay.width = Math.round(w * d);
    relay.height = Math.round(h * d);
  }
  ink.setTransform(d, 0, 0, d, 0, 0);
  ink.clearRect(0, 0, w, h);
}
function paperPoint(q) {
  const w = stage.clientWidth,
    h = stage.clientHeight,
    k = Math.max(w / 1200, h / 680);
  return [(w - 1200 * k) / 2 + q[0] * k, (h - 680 * k) / 2 + q[1] * k];
}
function quadOf(model, points) {
  return points.map((q) => rel(model.solid, ...q));
}
function stamp(source, src, dst, alpha) {
  if (alpha < 0.001) return;
  const a = src[0],
    b = dst[0],
    ux = src[1][0] - a[0],
    uy = src[1][1] - a[1],
    vx = src[3][0] - a[0],
    vy = src[3][1] - a[1],
    det = ux * vy - uy * vx;
  if (Math.abs(det) < 0.01) return;
  const dx = dst[1][0] - b[0],
    dy = dst[1][1] - b[1],
    ex = dst[3][0] - b[0],
    ey = dst[3][1] - b[1];
  const m = (dx * vy - ex * uy) / det,
    n = (dy * vy - ey * uy) / det,
    o = (ex * ux - dx * vx) / det,
    q = (ey * ux - dy * vx) / det;
  ink.save();
  ink.beginPath();
  dst.forEach(([x, y], j) => (j ? ink.lineTo(x, y) : ink.moveTo(x, y)));
  ink.closePath();
  ink.clip();
  ink.globalAlpha = alpha;
  ink.transform(
    m,
    n,
    o,
    q,
    b[0] - m * a[0] - o * a[1],
    b[1] - n * a[0] - q * a[1],
  );
  const r = source.getBoundingClientRect(),
    pos = rel(source, 0, 0);
  ink.drawImage(source, ...pos, r.width, r.height);
  ink.restore();
}
function carry(src, q1, dest, q2, b) {
  const arc = Math.sin(b * Math.PI) * stage.clientHeight * 0.06;
  const plane = q1.map((p, j) => [
    mix(p[0], q2[j][0], b),
    mix(p[1], q2[j][1], b) - arc,
  ]);
  const a = clamp(Math.min(b, 1 - b) * 15);
  stamp(src, q1, plane, a);
  stamp(dest, q2, plane, ease(b) * a);
  ink.globalAlpha = a * 0.7;
  ink.strokeStyle = "#ce8a61";
  ink.lineWidth = 1;
  ink.beginPath();
  plane.forEach(([x, y], j) => (j ? ink.lineTo(x, y) : ink.moveTo(x, y)));
  ink.closePath();
  ink.stroke();
  ink.globalAlpha = 1;
}
function joinPrints(id, b) {
  if (id >= 7) return;
  const from = surfaces[id],
    to = surfaces[id + 1];
  const source = from.model
    ? quadOf(from.model, from.geometry.out)
    : from.geometry.out.map(paperPoint);
  const next = to.model
    ? quadOf(to.model, to.geometry.in)
    : to.geometry.in.map(paperPoint);
  if (id >= 1 && id <= 4) {
    ink.strokeStyle = "#cb9767";
    ink.lineWidth = 1;
    ink.globalAlpha = 0.75 * Math.sin(Math.PI * b);
    ink.beginPath();
    source.forEach((p, i) => {
      const x = mix(p[0], next[i][0], b),
        y = mix(p[1], next[i][1], b);
      if (i) ink.lineTo(x, y);
      else ink.moveTo(x, y);
    });
    ink.closePath();
    ink.stroke();
    ink.globalAlpha = 1;
  } else
    carry(
      from.model?.solid ?? from.art,
      source,
      to.model?.solid ?? to.art,
      next,
      b,
    );
}
function coda(scene, p, t) {
  const [rack, tray, chip] = scene.parts,
    w = stage.clientWidth,
    h = stage.clientHeight;
  const a = ease((p - 0.22) / 0.15),
    b = ease((p - 0.6) / 0.17);
  rack.panel.style.display = a === 1 ? "none" : "block";
  tray.panel.style.display = a > 0 && b < 1 ? "block" : "none";
  chip.panel.style.display = b > 0 ? "block" : "none";
  let trayCenter = [w * 0.59, h * 0.62],
    chipCenter = [w * 0.55, h * 0.48];
  if (a < 1) {
    const d = drawModel(rack.model, 7, 1 - ease(p / 0.32), t, {
      zoom: 1 + 0.45 * ease(p / 0.34),
    });
    rack.geometry = d;
    if (d) trayCenter = rel(rack.model.solid, ...mid(d.in));
  }
  if (a > 0 && b < 1) {
    const v = 2 - ease((p - 0.3) / 0.3);
    const d = drawModel(tray.model, 6, 1 - ease((p - 0.3) / 0.35), t, {
      platformView: v,
      plateLift: 0,
      zoom: 1 + 0.6 * ease((p - 0.44) / 0.22),
    });
    roundReveal(tray.panel, trayCenter, a, w, h);
    tray.geometry = d;
    if (d) chipCenter = rel(tray.model.solid, ...mid(d.in));
    if (a < 1 && a > 0)
      carry(
        rack.model.solid,
        quadOf(rack.model, rack.geometry.in),
        tray.model.solid,
        quadOf(tray.model, d.out),
        a,
      );
  }
  if (b > 0) {
    const geo = drawModel(chip.model, 0, 0, 0, {
      angle: state.turns[0].angle,
      tilt: state.turns[0].tilt,
      explode: mix(0.77, 0.1, ease((p - 0.69) / 0.26)),
      zoom: mix(1.22, 0.92, ease((p - 0.71) / 0.25)),
    });
    roundReveal(chip.panel, chipCenter, b, w, h);
    if (b < 1 && b > 0)
      carry(
        tray.model.solid,
        quadOf(tray.model, tray.geometry.in),
        chip.model.solid,
        quadOf(chip.model, geo.out),
        b,
      );
  }
  return [w * 0.61, h * 0.48];
}
const landmarks = [
  [0.65, 0.45],
  [0.65, 0.43],
  [0.63, 0.47],
  [0.83, 0.43],
  [0.72, 0.3],
  [0.66, 0.42],
  [0.63, 0.53],
  [0.61, 0.49],
  [0.61, 0.49],
];
function drawChapter(id, p, t) {
  let scene = surfaces[id],
    w = stage.clientWidth,
    h = stage.clientHeight,
    anchor = [w * landmarks[id][0], h * landmarks[id][1]];
  scene.wrap.style.display = "block";
  if (scene.model) {
    let opts = {};
    if (id === 0)
      opts.explode =
        state.manualOpen === null
          ? 0.1 + 0.74 * ease((p - 0.04) / 0.72)
          : state.opening;
    const d = drawModel(scene.model, id, p, t, opts);
    scene.geometry = d;
    if (d)
      anchor = rel(
        scene.model.solid,
        ...mid(id === 0 ? d.seam : id === 6 ? d.out : d.in),
      );
  } else if (id === 8) anchor = coda(scene, p, t);
  else if (id === 4) {
    const brush = state.touch[id],
      key = [w, h, devicePixelRatio, p, brush.awake, brush.x, brush.y].join(
        "/",
      );
    if (scene.artKey !== key) {
      scene.geometry = Prints.draw(scene.art, id, p, t, brush);
      scene.artKey = key;
    }
  } else
    scene.geometry = Prints.draw(
      scene.art,
      id,
      p,
      t,
      id === 5
        ? { ...state.touch[id], shuttle: state.shuttle }
        : state.touch[id],
    );

  if (scene.art && scene.geometry)
    anchor = mid(scene.geometry.out.map(paperPoint));
  return anchor;
}
function title(id) {
  const [, en, cn, verse] = titles[id];
  stage.dataset.ch = id;
  $("#kicker").textContent = en;
  $("#name").innerHTML =
    id === 0
      ? '<span>Silicon</span><em>Echoes<b>.</b></em><span class="zh">硅的回声</span>'
      : cn;
  $("#verse").textContent = verse;
  $("#enter").hidden = id !== 0;
  $("#gesture").hidden = id === 8;
  stage.setAttribute(
    "aria-label",
    id === 8
      ? "归芯，芯片封装终景"
      : cn + "，方向键移动或旋转，空格执行当前手势",
  );
  Array.from(nav.children).forEach((v, i) => {
    v.classList.toggle("current", i === id);
    if (i === id) v.setAttribute("aria-current", "step");
    else v.removeAttribute("aria-current");
  });
}
function render() {
  const u = progress() * N,
    id = Math.min(N - 1, Math.floor(u)),
    p = u - id,
    t = exporting ? et : nowTime;
  const b = id < N - 1 ? ease((p - 0.83) / 0.17) : 0;
  current = b >= 0.5 ? id + 1 : id;
  for (let i = 0; i < N; i++) {
    const scene = surfaces[i];
    if (
      i === id ||
      (b > 0 && i === id + 1) ||
      scene.wrap.style.display === "none"
    )
      continue;
    scene.wrap.style.display = "none";
    // Release inactive full-resolution backing stores; gestures live in state.
    scene.wrap.querySelectorAll("canvas").forEach((c) => {
      c.width = c.height = 1;
    });
    scene.artKey = null;
  }
  relay.hidden = !(
    b > 0 ||
    (id === 8 && ((p > 0.22 && p < 0.37) || (p > 0.6 && p < 0.77)))
  );
  if (!relay.hidden) clearRelay();
  const old = surfaces[id];
  old.wrap.style.clipPath = "none";
  const start = drawChapter(id, p, t);
  const w = stage.clientWidth,
    h = stage.clientHeight;
  if (b > 0) {
    let finish = drawChapter(id + 1, 0, t),
      incoming = surfaces[id + 1].wrap;
    const center = [mix(start[0], finish[0], b), mix(start[1], finish[1], b)];
    if (id >= 1 && id <= 4) {
      const cut = 125 * b;
      incoming.style.clipPath = `polygon(0 0, ${cut}% 0, ${cut - 25}% 100%, 0 100%)`;
    } else roundReveal(incoming, center, b, w, h);
    joinPrints(id, b);
  }
  document.body.classList.toggle("finished", id === 8 && p > 0.87);
  stage.classList.toggle("night", current === 7 && (id === 7 ? p : 0) > 0.78);
  if (current !== priorTitle) {
    title(current);
    priorTitle = current;
  }
  const copy = $("#copy");
  copy.style.opacity = b ? Math.abs(2 * b - 1) : 1;
  let hint = gestureLabels[current];
  if (current === 0 && state.manualOpen === 1) hint = "轻触合拢 · 拖动旋转";
  if (current === 6)
    hint =
      modelView(u - 6) > 1.6
        ? state.liftGoal > 0.5
          ? "合上冷板"
          : "掀起冷板"
        : state.zoomGoal > 1.1
          ? "轻触退后 · 拖动旋转"
          : "轻触靠近 · 拖动旋转";
  if (current === 7) {
    const yaw =
      Model.rackYaw(clamp(u - 7), { rackBase: state.rackBase }) +
      (state.rear ?? state.turns[7].angle);
    hint = Math.cos(yaw) < 0 ? "转回正面" : "转看背板";
  }
  if ($("#gesture").textContent !== hint) $("#gesture").textContent = hint;
  Array.from(nav.children).forEach((v, i) =>
    v.style.setProperty("--fill", clamp(u - i) * 100 + "%"),
  );
}
function loop(ms) {
  if (!exporting && ms - lastTick < 15) {
    requestAnimationFrame(loop);
    return;
  }
  const dt = clamp((ms - lastTick) / 1000, 0, 0.08);
  lastTick = ms;
  if (!exporting) {
    nowTime += dt;
    if (navMove) {
      const q = clamp((ms - navMove.begin) / navMove.duration);
      scrollTo(
        0,
        mix(navMove.a, navMove.b, ease(q)) *
          (document.documentElement.scrollHeight - innerHeight),
      );
      if (q === 1) navMove = null;
    }
    if (state.manualOpen !== null)
      state.opening = mix(
        state.opening,
        state.manualOpen,
        1 - Math.exp(-dt * 9),
      );
    else state.opening = 0.1 + 0.74 * ease((progress() * N - 0.04) / 0.72);
    state.zoom = mix(state.zoom, state.zoomGoal, 1 - Math.exp(-dt * 8));
    state.lift = mix(state.lift, state.liftGoal, 1 - Math.exp(-dt * 8));
    if (state.rear !== null)
      state.turns[7].angle = mix(
        state.turns[7].angle,
        state.rear,
        1 - Math.exp(-dt * 6),
      );
    for (let i = 0; i < 3; i++)
      state.shuttle[i] = mix(
        state.shuttle[i],
        i === state.shuttleGoal ? 1 : 0,
        1 - Math.exp(-dt * 6),
      );
    render();
  }
  requestAnimationFrame(loop);
}
history.scrollRestoration = "manual";
scrollTo(0, 0);
render();
requestAnimationFrame(loop);
addEventListener("resize", render);
Prints.prepare();
// Keep normal scrolling hardware-accelerated. Export compositions use the
// same software rasterization on each seek, independent of GPU surface reuse.
function setPrintMode(mode) {
  if (mode === exporting) return;
  Prints.setExporting(mode);
  for (const scene of surfaces) {
    if (!scene.art) continue;
    const sheet = scene.art.cloneNode(false);
    sheet.width = sheet.height = 1;
    scene.art.replaceWith(sheet);
    scene.art.width = scene.art.height = 1;
    scene.art = sheet;
    scene.artKey = null;
  }
  exporting = mode;
}
// Seconds per chapter, from the package to the room and back to the package.
const exportChapterSeconds = [7, 6, 7, 10, 7, 9, 10, 9, 7];
const exportDuration = exportChapterSeconds.reduce((sum, seconds) => sum + seconds, 0);
const meanChapterSeconds = exportDuration / exportChapterSeconds.length;
let exportFps = 60, exportFrames = 0;

function exportProgressAt(time) {
  let remaining = time;
  for (const [chapter, seconds] of exportChapterSeconds.entries()) {
    if (remaining <= seconds) {
      const u = remaining / seconds;
      // Every cut shares one positive scroll speed. Longer chapters slow in the middle.
      const edgeSlope = seconds / meanChapterSeconds;
      const local = edgeSlope * u + (1 - edgeSlope) * ease(u);
      return (chapter + local) / exportChapterSeconds.length;
    }
    remaining -= seconds;
  }
  return 1;
}

async function renderExportFrame(i) {
  if (!exporting) throw new Error("Call videoExport.begin() before frame()");
  if (!Number.isInteger(i) || i < 0 || i >= exportFrames)
    throw new RangeError("Export frame index out of range");

  et = i / exportFps;
  // Include the exact foot of the page in the last exposure at either frame rate.
  ep = i === exportFrames - 1 ? 1 : exportProgressAt(et);
  scrollTo({
    top: ep * (document.documentElement.scrollHeight - innerHeight),
    behavior: "instant",
  });
  render();
  await new Promise(requestAnimationFrame);
}

window.videoExport = {
  runs: ["page"],
  async begin(run, { fps = 60 } = {}) {
    if (run !== "page") throw Error("Unknown run");
    const frames = Math.round(exportDuration * fps);
    if (!Number.isFinite(fps) || !Number.isSafeInteger(frames) || frames < 2)
      throw new RangeError("Invalid export frame rate");
    await Promise.all([document.fonts.ready, Prints.prepare()]);
    setPrintMode(true);
    exportFps = fps;
    exportFrames = frames;
    state = fresh();
    navMove = drag = null;
    if (dir.open) dir.close();
    document.activeElement?.blur();
    document.body.classList.add("export");
    $("#exhibit").inert = true;
    priorTitle = -1;
    await renderExportFrame(0);
    return { frames };
  },
  frame: renderExportFrame,
  end() {
    if (!exporting) return;
    document.body.classList.remove("export");
    $("#exhibit").inert = false;
    scrollTo(
      0,
      Math.round(ep * (document.documentElement.scrollHeight - innerHeight)),
    );
    setPrintMode(false);
    nowTime = et;
    lastTick = performance.now();
    render();
  },
};

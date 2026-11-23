let pendingRemoval = null, selectedMarker = null;
let volume = 0.33,
  muted = false,
  ac,
  master,
  musicTime = 0,
  beat = 0;
function audioInit() {
  if (!ac) {
    ac = new AudioContext();
    master = ac.createGain();
    master.gain.value = muted ? 0 : volume;
    const limiter=ac.createDynamicsCompressor();
    limiter.threshold.value=-16; limiter.ratio.value=4;
    master.connect(limiter);
    limiter.connect(ac.destination);
    createAmbience();
  }
  if (ac.state == "suspended") ac.resume();
}
function tone(f = 520, d = 0.11, v = 0.1, type = "sine") {
  if (!ac || muted || exporting) return;
  let o = ac.createOscillator(),
    g = ac.createGain(),
    n = ac.currentTime;
  o.type = type;
  o.frequency.setValueAtTime(f, n);
  o.frequency.exponentialRampToValueAtTime(f * 0.62, n + d);
  g.gain.setValueAtTime(0.0001, n);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v), n + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, n + d);
  o.connect(g);
  g.connect(master);
  o.start();
  o.stop(n + d + 0.01);
}
window.addEventListener("pointerdown", audioInit, { once: true });
window.addEventListener("keydown", audioInit, { once: true });
document.addEventListener("click", (e) => {
  if (e.target.closest("button")) tone(700, 0.045, 0.045);
});
function refresh() {
  if ($("netwatch")) netWatch();
  bossTelemetry();
  $("mapnum").textContent = pad(S.mapid + 1);
  document.querySelector(".serial").textContent="OPS / "+pad(S.mapid+1);
  document.querySelector(".live").textContent=S.paused?"Ⅱ HOLD":"● LIVE";
  $("maptitle").textContent = S.map.name;
  $("sector").textContent = "SECTOR " + pad(S.mapid + 1) + " / " + S.map.en;
  $("maptag").textContent = S.map.tag;
  $("maptag").title = S.map.desc;
  $("metrics").innerHTML = ["算力", "情报", "中枢完整度"]
    .map(
      (n, i) =>
        '<div class="metric">' +
        ic(["chip", "intel", "heart"][i]) +
        "<small>" +
        n +
        "</small><strong>" +
        [Math.floor(S.cpu), Math.floor(S.intel), S.core + "%"][i] +
        "</strong></div>",
    )
    .join("");
  $("wavezone").innerHTML =
    '<div class="wave"><div class="waveline"><span>' +
    (S.paused ? "进程暂停" : S.wave===S.map.waves ? "最终防御" : S.mapid&&S.wave===9 ? "三入口洪峰" : S.active ? "抵御入侵" : "待命布防") +
    "</span><span><strong>" +
    pad(S.wave) +
    "</strong> <small>/ " +
    S.map.waves +
    ' 波</small></span></div><div class="wavebars">' +
    Array.from(
      { length: S.map.waves },
      (_, i) => '<i class="' + (i < S.wave ? "on" : "") + '"></i>',
    ).join("") +
    "</div></div>";
  $("legC").style.display = S.ins.length == 3 ? "flex" : "none";
  let arr = S.active ? S.queue : wavePlan();
  $("forecast").innerHTML = S.ins
    .map((c, i) => {
      let ens = arr.filter((a) => a.ent == i);
      let a = ens[0],
        stats = new Map();
      ens.forEach((q) => stats.set(q.t, (stats.get(q.t) || 0) + 1));
      let info = [...stats].map(([k, n]) => threats[k][0] + " × " + n).join("、");
      return (
        '<div class="forecastrow" role="button" tabindex="0" onclick="forecastInfo(' +
        i +
        ')" title="' +
        info +
        '"><b>' +
        "ABC"[i] +
        "</b><span>" +
        S.map.names[i] +
        "</span><em>" +
        (a
          ? (stats.size == 1 ? threats[a.t][0] : stats.size + " 类威胁") + " × " + ens.length
          : "已接入") +
        "</em></div>"
      );
    })
    .join("");
  $("logs").innerHTML = S.logs
    .slice(0, 3)
    .map(
      ([t, s]) =>
        '<div class="logrow"><time>' +
        pad(Math.floor(t / 60)) +
        ":" +
        pad(t % 60) +
        "</time><span>" +
        s +
        "</span></div>",
    )
    .join("");
  $("start").innerHTML =
    ic("play") +
    (demo ? "退出实战演示" : S.active ? "波次进行中" : "启动第 " + pad(S.wave) + " 波");
  $("pause").innerHTML = ic(S.paused ? "play" : "pause") + " " + (S.paused ? "继续" : "暂停");
  $("speed").innerHTML = ic("fast") + " " + S.speed + "× 速度";
  if (tab == 1 && thumbs)
    document
      .querySelectorAll(".card small")
      .forEach(
        (e, j) =>
          (e.textContent =
            S.cd[j] > 0
              ? "冷却 " + Math.ceil(S.cd[j]) + "s"
              : items[j][2] + " · " + [10, 14, 8][j] + "s"),
      );
}
$("sound").innerHTML = ic("sound");
$("menu").innerHTML = ic("menu");
$("resetcam").innerHTML = ic("cam");
$("start").onclick = () => {
  if (demo) endDemo();
  else startWave();
};
$("pause").onclick = () => {
  S.paused = !S.paused;
  refresh();
};
$("speed").onclick = () => {
  S.speed = S.speed == 4 ? 1 : S.speed * 2;
  refresh();
};
$("menu").onclick = menu;
$("battleNav").onclick = closeModal;
function dock(n) {
  tab = n;
  $("tab0").className = n ? "" : "sel";
  $("tab1").className = n ? "sel" : "";
  $("dockhint").innerHTML = ic("drag") + " 拖放或点选" + (n ? "道具" : "设备") + "至战场";
  let arr = n ? items : devices;
  $("cards").innerHTML = arr
    .map((v, j) => {
      let i = n ? j + 6 : j;
      return (
        '<button draggable="true" data-i="' +
        i +
        '" class="card ' +
        (choice == i ? "chosen" : "") +
        '" title="' +
        v[6] +
        '"><img draggable="false" src="' +
        (thumbs?.[i] || "") +
        '"><span class="id">' +
        (n ? "UTL" : "DEV") +
        " / " +
        pad(j + 1) +
        "</span><strong>" +
        v[0] +
        "</strong><small>" +
        (n ? v[2] + " · " + [10, 14, 8][j] + "s" : v[1] + "型") +
        '</small><span class="cost">' +
        ic(n && j < 2 ? "intel" : "chip") +
        v[3] +
        (i == 2 ? ' <span style="color:#9b763b">+ ◇10</span>' : "") +
        "</span></button>"
      );
    })
    .join("");
  document.querySelectorAll(".card").forEach((el) => {
    el.onclick = () => selectChoice(+el.dataset.i);
    el.ondragstart = (e) => {
      selectChoice(+el.dataset.i, true);
      e.dataTransfer.setData("text/plain", el.dataset.i);
      e.dataTransfer.effectAllowed = "copy";
    };
  });
}
function selectChoice(i, drag = false) {
  pendingRemoval = null;
  choice = i;
  sel = null;
  hover = null;
  aim = 0;
  clearPreview();
  $("context").style.display = "none";
  document
    .querySelectorAll(".card")
    .forEach((el) => el.classList.toggle("chosen", +el.dataset.i == i));
  let v = [...devices, ...items][i];
  notice(v[0] + " · 请选择" + v[2] + "　 Esc 取消", 5);
  for (let c of picks) {
    if (
      (i == 2 || i == 6
        ? c.node
        : i >= 3 && i <= 5
          ? c.platform
          : i == 8
            ? c.tower
            : c.road && !c.entry && !c.exit) &&
      (!c.tower || i >= 7)
    ) {
      let o = tor(rangeObj, c.x, 0.22, c.z, 0.32, 0.022, i >= 6 ? gold : cyan);
      o.scale.y = 0.95;
    }
  }
}
function clearPreview() {
  $("tileTip").hidden=true;
  selectedMarker = null;
  clearGroup(preview);
  clearGroup(rangeObj);
  preview = group(world);
  rangeObj = group(world);
}
function cancel() {
  pendingRemoval = null;
  choice = null;
  sel = null;
  hover = null;
  $("context").style.display = "none";
  clearPreview();
  dock(tab);
}
function showCoverage(c, rad, col, directional, facing) {
      if (!directional) tor(rangeObj, c.x, 0.21, c.z, rad, 0.018, col);
      else {
        let arc = group(rangeObj, c.x, 0.22, c.z);
        arc.rotation.y = facing;
        for (let j = 0; j < 32; j++) {
          let a = (j * Math.PI) / 32,
            b = ((j + 1) * Math.PI) / 32;
          beam(
            arc,
            [Math.cos(a) * rad, 0, -Math.sin(a) * rad],
            [Math.cos(b) * rad, 0, -Math.sin(b) * rad],
            0.019,
            col,
          );
        }
        beam(arc, [-rad, 0, 0], [rad, 0, 0], 0.015, col);
      }
      let geom = new T.CircleGeometry(
        rad,
        64,
        directional ? facing : 0,
        directional ? Math.PI : Math.PI * 2,
      );
      let mm = new T.MeshBasicMaterial({
        color: col,
        transparent: true,
        opacity: 0.09,
        depthWrite: false,
        side: T.DoubleSide,
      });
      geom.userData.owned = mm.userData.owned = true;
      let disk = new T.Mesh(geom, mm);
      disk.rotation.x = -Math.PI / 2;
      disk.position.set(c.x, 0.2, c.z);
      rangeObj.add(disk);
    }

function mark(c, confirm = false) {
  if (choice==null) return;
  if (!c) {hover=null; if (!sel) clearPreview(); return;}
  hover = c;
  clearPreview();
  let why = valid(c),
    col = why ? red : choice >= 6 ? orange : blue;
  tor(rangeObj, c.x, 0.23, c.z, 0.47, 0.04, col);
  if (why && c.node && (choice === 0 || choice === 2 || choice === 6)) {
    const rejected = proposal({block:c.k}).at;
    if (rejected) {
      tor(rangeObj, rejected.x,.27,rejected.z,.48,.046,red);
      for (const angle of [-.78,.78]) box(rangeObj,rejected.x,.29,rejected.z,.67,.045,.07,red).rotation.y=angle;
    }
  }
  if (!why) {
    let rad = choice < 6 ? devices[choice][5] : choice == 7 ? 2 : 0;
    if (rad) showCoverage(c, rad, col, choice === 3, aim);
    if ((c.node && choice <= 6) || choice == 7) {
      let p = proposal(choice == 7 ? { slow: c } : { block: c.k });
      routeDraw(preview, p.ps, true);
    }
    if (choice < 7) {
      let ghost = deviceArt(choice);
      ghost.position.set(c.x, 0.23, c.z);
      ghost.rotation.y = aim;
      let mats = new Map();
      ghost.traverse((o) => {
        if (!o.isMesh) return;
        let m = mats.get(o.material);
        if (!m) {
          m = o.material.clone();
          m.transparent = true;
          m.opacity = 0.64;
          m.userData.owned = true;
          mats.set(o.material, m);
        }
        o.material = m;
        o.castShadow = false;
      });
      rangeObj.add(ghost);
    }
  }
  if (confirm) {
    sel = c;
    panel();
  }
}
function inspect(c) {
  pendingRemoval = null;
  clearPreview();
  choice = null;
  sel = c;
  hover = null;
  panel();
  if (!c) return;
  let a = c.tower || c;
  if (a.obj || c.road || c.platform) {
    selectedMarker = tor(rangeObj, a.x, 0.23, a.z, 0.5, 0.024, blue);
    if (c.tower && reach(a)) showCoverage(c,reach(a),blue,a.t === 3,a.dir);
  }
}
function btn(text, fn, primary = false) {
  return (
    '<button class="' + (primary ? "primary" : "") + '" onclick="' + fn + '">' + text + "</button>"
  );
}
function panel() {
  let el = $("context");
  if (!sel) {
    el.style.display = "none";
    return;
  }
  let c = sel,
    a = c.tower,
    title = "",
    body = "",
    actions = "";
  if (choice != null) {
    let i = choice,
      v = [...devices, ...items][i];
    title = v[0] + " · " + (i < 6 ? "部署" : "投放");
    let why = valid(c);
    body =
      why ||
      "目标 [" +
        c.k +
        "]　" +
        v[2] +
        (i == 3 ? "　朝向 " + "北西南东"[Math.round(aim / (Math.PI / 2)) % 4] : "") +
        ((c.node && i < 7) || i == 7 ? "。虚线为各入口的新路线。" : "");
    if (!why && ((c.node && i < 7) || i == 7)) {
      let p = proposal(i == 7 ? { slow: c } : { block: c.k });
      let changed = p.ps
        .map((v, j) =>
          v?.map((a) => a.k).join() != S.paths[j]?.map((a) => a.k).join()
            ? "ABC"[j] + " → " + "XY"[v.at(-1).exit - 1]
            : "",
        )
        .filter(Boolean);
      body += "<br>变更路由　" + (changed.join("　/　") || "维持当前路径");
    }
    if (i == 3) actions += btn("旋转 90°", "rotateAim()");
    actions += btn("取消", "cancel()");
    if (!why) actions += btn("确认" + (i < 6 ? "部署" : "投放"), "applyChoice(sel)", true);
  } else if (pendingRemoval && pendingRemoval === a) {
    title = "撤下设备 · 旁路预览";
    const nextRoutes = proposal({open:c.k}).ps;
    const changed = nextRoutes.flatMap((p,i) => p.map(q=>q.k).join() !== S.paths[i].map(q=>q.k).join() ? ["入口 "+"ABC"[i]+" → "+"XY"[p.at(-1).exit-1]] : []);
    body = S.map.switches[c.node-1] + '恢复直通。<br>变更路由　'+(changed.join('、') || '原路径保持')+
      '<br>回收 '+Math.floor(a.spend*.55)+' 算力，再隔离间隔 6 秒。';
    actions = btn('取消','inspect(sel)') + btn('确认撤下','withdrawSelected()',true);
  } else if (a) {
    title = (devices[a.t]?.[0] || "应急隔离器") + "　Lv." + a.level;
    body =
      "耐久 " +
      Math.ceil(a.hp) +
      " / " +
      a.max +
      (a.enc > 0
        ? " · 加密中"
        : a.shield > 0
          ? " · 护盾 " + Math.ceil(a.shield)
          : c.node
            ? " · 节点隔离"
            : " · 在线");
    body +=
      "<br>" +
      (a.level == 2
        ? a.t == 1
          ? ["长效陷阱", "镜像代理"][a.branch]
          : a.t == 3
            ? ["穿甲轨道", "脉冲压制"][a.branch]
            : devices[a.t][7]
        : (devices[a.t] || items[0])[6]);
    if (a.level < 2 && a.t < 6) {
      if ([1, 3].includes(a.t)) {
        body += "<br>分支升级 · 35 算力 / 10 情报";
        actions +=
          btn(a.t == 1 ? "长效陷阱" : "穿甲轨道", "upgrade(0)") +
          btn(a.t == 1 ? "镜像代理" : "脉冲压制", "upgrade(1)");
      } else actions += btn("升级 · 35 算力", "upgrade(0)");
    }
    if (a.t == 1 || a.t == 5)
      actions += btn(
        (a.t == 1 ? "诱捕" : "冗余切换") + (a.skill > 0 ? " " + Math.ceil(a.skill) + "s" : ""),
        "ability(sel.tower)",
        true,
      );
    if (a.t == 3) actions += btn("调整朝向", "rotateTower()");
    actions += btn(
      "撤下 +" + Math.floor(a.spend * 0.55),
      a.c.node ? "previewWithdrawal(sel.tower)" : "withdrawSelected()",
    );
  } else if (c.obj) {
    title = c.t===1 && !c.visible ? "业务包 · 签名待验" : threats[c.t][0];
    body =
      "生命 " +
      Math.ceil(c.hp) +
      " / " +
      Math.ceil(c.max) +
      "　" +
      (c.visible ? "已识别" : "伪装中") +
      "<br>" +
      threats[c.t][1];
  } else {
    title = c.entry
      ? "流量入口 " + "ABC"[c.entry - 1]
      : c.exit
        ? "中枢出口 " + "XY"[c.exit - 1]
        : c.node
          ? S.map.switches[c.node-1] + " · SW-" + pad(c.node)
          : c.old || c.slow > S.time
            ? "旧链路"
            : c.road
              ? "传输链路"
              : c.platform
                ? "设备平台"
                : "网络设施";
    body =
      "坐标 [" +
      c.k +
      "] · " +
      (c.node
        ? "旁路直通，可部署网闸或防火墙。"
        : c.platform
          ? "可部署拦截器、沙箱或修复进程。"
          : c.road
            ? "业务流量与威胁共享此链路。"
            : "设施占用，无法部署。");
  }
  if (choice == null && a && !pendingRemoval) {
    if (a.t === 0 || a.t === 1) {
      const load = S.enemies.filter(e => e.block === a).reduce((n,e)=>n+(e.t===2?2:1),0);
      body += '<br>阻挡占用　' + load + ' / ' + (a.level===2 && (a.t===0||a.branch) ? 4 : 2);
    }
    if (a.t === 6) body += '<br>隔离剩余　' + Math.max(0,12-a.age).toFixed(1) + ' 秒';
    if (a.t === 3) body += '<br>覆盖扇区　' + "北西南东"[Math.round(a.dir/(Math.PI/2))%4] + '向 180°';
  } else if (choice == null && c.obj) {
    const state = [c.block?'被'+devices[c.block.t][0]+'阻挡':'', c.shield>0?'护盾 '+Math.ceil(c.shield):'',c.stun>0?'诱捕 '+c.stun.toFixed(1)+' 秒':'', c.slow>0?'受压制减速':''].filter(Boolean);
    if (state.length) body += '<br>'+state.join('　·　');
  } else if (choice == null && !pendingRemoval) {
    if (c.lock>S.time) body = '路段锁死，剩余 '+Math.ceil(c.lock-S.time)+' 秒。';
    if (c.reopen>S.time) body += '<br>节点再隔离间隔　'+Math.ceil(c.reopen-S.time)+' 秒';
    if (c.slow>S.time) body += '<br>协议降级剩余　'+Math.ceil(c.slow-S.time)+' 秒';
    if (c.node) body += '<br>当前经由　'+(S.paths.map((p,i)=>p.includes(c)?'入口 '+ 'ABC'[i]:'').filter(Boolean).join('、') || '备用链路');
  }
  if (!el.querySelector(".ctx-actions")) {
    el.innerHTML='<button class="xbtn" onclick="cancel()">×</button><h3></h3><p></p><div class="ctx-actions"></div>';
  }
  const heading=el.querySelector("h3"),summary=el.querySelector("p"),buttons=el.querySelector(".ctx-actions");
  if (heading.textContent!==title) heading.textContent=title;
  if (summary.dataset.last!==body) { summary.innerHTML=body; summary.dataset.last=body; }
  if (buttons.dataset.last!==actions) { buttons.innerHTML=actions; buttons.dataset.last=actions; }
  el.style.display = "block";
}
function previewWithdrawal(tower) {
  if (!tower || !tower.c.node) return;
  pendingRemoval=tower;
  sel=tower.c;
  clearPreview();
  tor(rangeObj,tower.x,.22,tower.z,.5,.03,orange);
  routeDraw(preview,proposal({open:sel.k}).ps,true);
  panel();
}
function withdrawSelected() {
  const tower=sel?.tower;
  if (tower) removeTower(tower,true);
  cancel();
  refresh();
}
function rotateTower() {
  let t = sel.tower;
  t.dir = (t.dir + Math.PI / 2) % (Math.PI * 2);
  t.obj.rotation.y = t.dir;
  t.obj.userData.head.rotation.y = 0;
  inspect(t.c);
  notice("拦截扇区已旋转 90°");
}
function rotateAim() {
  aim = (aim + Math.PI / 2) % (Math.PI * 2);
  mark(sel, true);
}
let raycaster = new T.Raycaster(),
  plane = new T.Plane(new T.Vector3(0, 1, 0), -0.13),
  middle = null,
  canvas = renderer.domElement;
function cellAt(e, enemy = false) {
  let r = canvas.getBoundingClientRect(),
    x = e.clientX - r.left,
    y = e.clientY - r.top;
  raycaster.setFromCamera(new T.Vector2((x / cw) * 2 - 1, 1 - (y / ch) * 2), cam);
  if (enemy) {
    let close = S.enemies
      .map((a) => ({ a, p: project(a.x, a.t == 4 ? 1.2 : 0.41, a.z) }))
      .filter((v) => Math.hypot(v.p.x - x, v.p.y - y) < 13)
      .sort((a, b) => Math.hypot(a.p.x - x, a.p.y - y) - Math.hypot(b.p.x - x, b.p.y - y));
    if (close.length) return close[0].a;
    let tw = S.towers.find((a) => {
      let p = project(a.x, 0.65, a.z);
      return Math.hypot(p.x - x, p.y - y) < 14;
    });
    if (tw) return tw.c;
  }
  let p = new T.Vector3();
  raycaster.ray.intersectPlane(plane, p);
  return S.grid[key(Math.round(p.x), Math.round(p.z))];
}
canvas.onpointerdown = (e) => {
  if (e.button == 1) {
    e.preventDefault();
    middle = { x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
  }
};
canvas.onpointermove = (e) => {
  if (middle) {
    $("tileTip").hidden=true;
    let dx = e.clientX - middle.x,
      dy = e.clientY - middle.y;
    middle = { x: e.clientX, y: e.clientY };
    if (e.shiftKey) {
      let k = (cam.right - cam.left) / cw;
      focus.x -= k * (dx * Math.cos(yaw) + dy * Math.sin(yaw));
      focus.z -= k * (-dx * Math.sin(yaw) + dy * Math.cos(yaw));
    } else {
      yaw -= dx * 0.008;
      pitch = Math.max(0.23, Math.min(1.48, pitch + dy * 0.007));
    }
    placeCam();
  } else if (choice != null && !sel) {
    let c = cellAt(e);
    if (c != hover) mark(c);
  } else if (!demo && choice==null) {
    let c = cellAt(e,true);
    tileHint(e,c);
    canvas.style.cursor = c && (c.node || c.tower || c.entry || c.exit) ? "pointer" : "default";
  }
};
canvas.onpointerleave = () => $("tileTip").hidden=true;
canvas.onpointerup = (e) => {
  if (e.button == 1) middle = null;
};
canvas.onauxclick = (e) => e.preventDefault();
canvas.onwheel = (e) => {
  e.preventDefault();
  zoomCam(Math.exp(-e.deltaY * 0.001));
};
canvas.onclick = (e) => {
  if (demo) return;
  let c = cellAt(e, choice == null);
  if (choice != null) {
    if (c) mark(c, true);
  } else inspect(c);
};
canvas.ondragover = (e) => {
  if(choice==null)return;
  e.preventDefault();
  let c = cellAt(e);
  if (c != hover) mark(c);
};
canvas.ondrop = (e) => {
  e.preventDefault();
  if (choice != null) mark(cellAt(e), true);
};
window.addEventListener("keydown", (e) => {
  if (e.key == "Escape") {
    if (demo) endDemo();
    else if (modalOn) closeModal();
    else cancel();
  }
  if (e.key.toLowerCase() == "r" && choice == 3 && sel) rotateAim();
  if (e.code == "Space" && !modalOn && e.target.tagName != "BUTTON") {
    e.preventDefault();
    S.paused = !S.paused;
    refresh();
  }
});
function modal(title, en, html) {
  $("tileTip").hidden=true;
  modalOn = true;
  $("overlay").innerHTML =
    '<div class="modalback"><div class="modal"><div class="modalhead"><div><div class="eyebrow">' +
    en +
    "</div><h2>" +
    title +
    '</h2></div><button onclick="closeModal()" title="关闭">×</button></div>' +
    html +
    "</div></div>";
}
function closeModal() {
  modalOn = false;
  $("overlay").innerHTML = "";
  if (S.over) finish(S.core > 0);
}
function captureMapThumbnail() {
  const preview = document.createElement("canvas");
  preview.width = 480;
  preview.height = 270;
  const source = renderer.domElement;
  const width = Math.min(source.width, source.height * 1.78);
  preview.getContext("2d").drawImage(source, (source.width-width)/2, 0, width, source.height,
    0, 0, preview.width, preview.height);
  return preview.toDataURL("image/jpeg", .9);
}
function openMaps() {
  modal(
    "作战区域",
    "MISSION SELECT",
    '<div class="mapcards">' +
      maps
        .map(
          (m, i) =>
            '<button class="mapcard" onclick="init(' +
            i +
            ')">' +
            '<img class="mapPreview" src="' + mapShots[i] + '" alt="' + m.name + '战场俯视图">' +
            '<p class="eyebrow">SECTOR ' +
            pad(i + 1) +
            " / " +
            m.waves +
            " 波</p><h3>" +
            m.name +
            "</h3><p>" +
            m.desc +
            "</p><b>进入战区 →</b></button>",
        )
        .join("") +
      "</div>",
  );
}
const terrain = [
  ["业务链路", "业务与恶意流量共用。阻挡塔只拦住有限目标，超出容量的单位继续前进。"],
  [
    "交换节点",
    "橙色菱形节点。隔离会截断通行，黄色虚线预览新路线。封死入口或在途单位的操作会被拒绝。",
  ],
  ["旧链路", "旧协议使地面目标减速并揭露木马。路由权重随协议变化重新计算。"],
  ["设备平台", "浅色带定位角标的高台用于部署远程与支援设备。其余设施不可通行或部署。"],
  ["加密 / 护盾", "紫环表示加密，暂时停止主动输出、修复和技能。青环表示护盾，优先吸收伤害。"],
  ["检测 / 诱捕", "检测永久揭露伪装。诱捕的金环表示地面单位被定身。"],
  [
    "算力 / 情报",
    "战斗与击杀产生算力。守住隔离节点、清波及击杀重点威胁回收情报。撤下设备返还 55% 已投入算力。",
  ],
];
function manual(n = 0) {
  let names = ["设备手册", "威胁档案", "战术道具", "地形与状态"];
  let a =
    n == 0
      ? devices.map((v, i) => [
          v[0], '<span class="spec">' + v[2] + '　/　' + v[4] + ' 耐久</span>' +
          v[6] + '<br><b>二级改装</b>　' + v[7] +
          ([1, 5].includes(i) ? '<br>主动技能冷却 12 秒。' : '')
        ])
      : n == 1
        ? threats
        : n == 2
          ? items.map((v) => [v[0], v[6]])
          : terrain;
  modal(
    "攻防图鉴",
    "FIELD REFERENCE",
    '<div class="modtabs">' +
      names
        .map(
          (s, i) =>
            '<button class="' +
            (i == n ? "sel" : "") +
            '" onclick="manual(' +
            i +
            ')">' +
            s +
            "</button>",
        )
        .join("") +
      '</div><div class="articles">' +
      a
        .map(
          (v, i) =>
            '<div class="article">' +
            (n < 3 ? '<img src="' + thumbs[i + (n == 2 ? 6 : n == 1 ? 9 : 0)] + '">' : "") +
            '<small class="eyebrow">' +
            pad(i + 1) +
            "</small><h3>" +
            v[0] +
            "</h3><p>" +
            v[1] +
            "</p></div>",
        )
        .join("") +
      "</div>",
  );
}
function menu() {
  modal(
    "系统菜单",
    "SYSTEM / CONTROL",
    '<div class="menulist"><button onclick="closeModal()">返回战场</button><button onclick="init(S.mapid)">重新启动本图</button><button onclick="openMaps()">关卡选择</button></div><h4>实战演示</h4>' +
      ["分段取舍", "旁路直通", "蛰影现身"]
        .map(
          (s, i) =>
            '<div class="demorow"><div><b>' +
            pad(i + 1) +
            "　" +
            s +
            "</b><small>" +
            maps[i].name +
            " / " +
            durations[i] +
            " 秒</small></div>" +
            btn("▶ 观看演示", "beginDemo(" + i + ")") +
            "</div>",
        )
        .join("") +
      '<div class="menulist"><button onclick="manual()">攻防图鉴</button><button onclick="audioSettings()">音量设置</button></div>',
  );
}
function audioSettings() {
  modal(
    "音量设置",
    "AUDIO CONTROL",
    '<p>环境音乐与设备音效</p><input aria-label="总音量" type="range" min="0" max="1" step=".01" value="' +
      volume +
      '" oninput="volume=+this.value;if(master)master.gain.value=muted?0:volume"><button class="action" onclick="muted=!muted;if(master)master.gain.value=muted?0:volume;$(\'sound\').innerHTML=ic(muted?\'mute\':\'sound\');audioSettings()">' +
      (muted ? "取消静音" : "静音") +
      "</button>",
  );
}
$("sound").onclick = audioSettings;
function finish(win) {
  S.over = true;
  S.active = false;
  modal(
    "事件报告 · " + (win ? "防御成功" : "核心离线"),
    "INCIDENT REPORT",
    '<div class="reportHero ' +
      (win ? "good" : "bad") +
      '">' +
      ic("heart") +
      '<div><div class="eyebrow">SECTOR ' +
      pad(S.mapid + 1) +
      " / " +
      S.map.en +
      "</div><h2>" +
      S.map.name +
      "</h2><p>" +
      (win ? "全部入侵波次已结束，中枢数据已归档。" : "中枢完整度归零，本次守护进程已终止。") +
      '</p></div><div class="report">' +
      S.core +
      '%<small>中枢完整度</small></div></div><div class="reportStats">' +
      [
        ["完成波次", win ? S.wave : S.wave - 1],
        ["拦截威胁", S.killed],
        ["穿透流量", S.lost],
        ["路由切换", S.reroutes],
      ]
        .map(([n, v]) => "<div><small>" + n + "</small><b>" + pad(v) + "</b></div>")
        .join("") +
      "</div>" +
      btn("重开本图", "init(S.mapid)", true) +
      btn("关卡选择", "openMaps()"),
  );
}
const durations = [17, 18, 19];
function sub(msg) {
  $("sub").textContent = msg;
  $("sub").style.display = "block";
}
function demoPos(c, h = 0.3) {
  let p = project(c.x, h, c.z),
    r = canvas.getBoundingClientRect();
  return { x: r.left + p.x, y: r.top + p.y };
}
function elementCenter(el) {
  let r = el.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}
function beginDemo(id) {
  init(id);
  S.wave = [5, 9, 16][id];
  S.cpu = 240;
  S.intel = 80;
  S.active = true;
  S.queue = wavePlan();
  S.queue.forEach((q) => (q.at += 5));
  let c = S.grid[key(...S.map.nodes[id == 0 ? 0 : 1])];
  let repair, front;
  let plats = Object.values(S.grid)
    .filter((a) => a.platform && !a.tower)
    .sort((a, b) => dist(a, c) - dist(b, c));
  repair = build(5, plats[0], 0, true);
  build(3, plats[1], 0, true);
  front = build(
    0,
    S.grid[
      key(
        ...[
          [-3, 1],
          [3, -2],
          [3, -2],
        ][id],
      )
    ],
    0,
    true,
  );
  let d = (demo = {
    id,
    t: 0,
    stage: 0,
    c,
    repair,
    front,
    pointer: { x: innerWidth * 0.52, y: innerHeight * 0.68 },
    fixed: 0,
  });
  if (id == 1) {
    d.gate = build(2, c, 0, true);
    d.gate.hp = 160;
    let e = spawn(2, S.grid["3,-1"]);
    e.hp = e.max *= 2;
    d.slow = S.grid["-3,-2"];
  }
  if (id >= 1) {
    let near = Object.values(S.grid)
      .filter((a) => a.platform && !a.tower)
      .sort((a, b) => dist(a, c) - dist(b, c));
    for (let j = 0; j < 2; j++) {
      let tw = build(j ? 4 : 3, near[j], 0, true);
      tw.level = 2;
      tw.branch = 1;
      clearGroup(tw.obj);
      tw.obj = deviceArt(tw.t, 2, 1);
      tw.obj.position.set(tw.x, 0.21, tw.z);
      units.add(tw.obj);
    }
    S.queue = S.queue.filter((q) => q.t < 6).slice(0, id == 1 ? 24 : 18);
    S.queue.forEach((q, i) => (q.at = 5 + i * (id == 1 ? 0.5 : 0.62)));
  }
  if (id == 2) {
    d.boss = spawn(8, S.grid["3,-1"]);
    d.boss.hp *= 0.66;
    d.boss.phase = 1;
    d.boss.visible = true;
    repair.enc = 7;
    front.hp *= 0.55;
  }
  for (let i = 0; i < 8; i++) {
    let ent = i % S.ins.length,
      p = S.paths[ent],
      cell = p[Math.min(p.length - 2, 1 + Math.floor(i / 3))];
    if (id == 0 && ent == 0) cell = S.ins[0];
    let e = spawn([0, 1, 3, 2][i % 4], cell, true, ent);
    if (id == 0 && ent == 0) e.stun = 1.4 + i * .08;
  }
  sub(
    [
      "01　分段取舍　/　西边界发现蠕虫集群",
      "02　旁路直通　/　三入口洪峰接入",
      "03　蛰影现身　/　运维环遭到入侵",
    ][id],
  );
  $("cursorSim").style.display = "block";
  refresh();
  render();
}
function demoUpdate(dt) {
  if (!demo) return;
  let d = demo,
    t = (d.t += dt),
    id = d.id;
  let dragIndex = id == 0 && t > 1.5 && t < 3.2 ? 2 : id == 1 && t > 6.8 && t < 8.5 ? 7 : -1;
  $("dragSim").style.display = dragIndex < 0 ? "none" : "flex";
  if (dragIndex >= 0)
    $("dragSim").innerHTML =
      '<img src="' + thumbs[dragIndex] + '">' + [...devices, ...items][dragIndex][0];
  let c = d.c;
  function action(n, at, fn) {
    if (d.stage == n && t >= at) {
      d.stage++;
      fn();
    }
  }
  let focusCell =
    t < 2
      ? { x: 0, z: 0 }
      : id == 0
        ? t < 10
          ? c
          : d.front
        : id == 1
          ? t < 8
            ? c
            : d.slow
          : t < 10
            ? d.boss
            : d.repair;
  focus.x += (focusCell.x * 0.78 - focus.x) * Math.min(1, dt * 1.5);
  focus.z += (focusCell.z * 0.74 - focus.z) * Math.min(1, dt * 1.5);
  zoom += ((t < 2 ? 1 : t > durations[id] - 2 ? 1.08 : 1.44) - zoom) * dt * 1.5;
  placeCam();
  if (id == 0) {
    action(0, 1.5, () => {
      selectChoice(2);
      sub("拖放网闸至西边界节点，预检入口 A 的备用路由");
    });
    action(1, 3.2, () => {
      mark(c, true);
      sub("路由预览　/　入口 A 经 DMZ 互联向邮件流量汇聚");
    });
    action(2, 5.5, () => {
      if (!valid(c)) applyChoice(c);
      else notice(valid(c));
      sub("节点已隔离　/　办公网段流量重新选择通路");
    });
    action(3, 9, () => {
      cancel();
      sub("西边界压力下降，守方转向汇流区拦截");
    });
  }
  if (id == 1) {
    action(0, 1.2, () => sub("洪泛团正在冲击汇聚节点，网闸耐久下降"));
    action(1, 4.4, () => {
      if (c.tower) {
        ray({ x: c.x, z: c.z - 1 }, c, red);
        hurt(c.tower, 999);
      }
      sub("网闸离线　/　B、C 入口恢复至原数据中心的路由");
    });
    action(2, 6.8, () => {
      dock(1);
      selectChoice(7);
      sub("选择协议降级，控制入口 A 的新一轮通量");
    });
    action(3, 8.5, () => mark(d.slow, true));
    action(4, 10.5, () => {
      applyChoice(d.slow);
      sub("旧协议已上线　/　区域内地面流量减速并显形");
    });
    action(5, 13, () => cancel());
  }
  if (id == 2) {
    action(0, 2, () => {
      d.boss.phase = 2;
      phaseChange(d.boss);
      warn(d.boss, "运维环锁死");
      sub("破坏阶段　/　运维环出现锁死预警");
    });
    action(1, 4.6, () => sub("运维环已锁死，入口路由重新收敛"));
    action(2, 7.6, () => {
      inspect(d.repair.c);
      sub("选择修复进程，为交战设备执行冗余切换");
    });
    action(3, 10, () => {
      ability(d.repair);
      sub("冗余切换完成　/　解除加密，附近设备获得护盾");
    });
    action(4, 13, () => cancel());
  }
  let target;
  if (id == 0)
    target =
      t < 2.4
        ? elementCenter(document.querySelectorAll(".card")[2])
        : t < 4.7
          ? demoPos(c)
          : t < 5.5 && $("context").querySelector(".primary")
            ? elementCenter($("context").querySelector(".primary"))
            : demoPos(c);
  else if (id == 1)
    target =
      t < 5
        ? demoPos(c)
        : t < 7.6
          ? elementCenter(document.querySelector(".tabs button:last-child"))
          : t < 8.3
            ? elementCenter(document.querySelectorAll(".card")[1])
            : t < 10.5 && t > 9.2 && $("context").querySelector(".primary")
              ? elementCenter($("context").querySelector(".primary"))
              : demoPos(d.slow);
  else
    target =
      t < 5.5
        ? demoPos(d.boss)
        : t > 8.4 && t < 10.4 && $("context").querySelector(".primary")
          ? elementCenter($("context").querySelector(".primary"))
          : demoPos(d.repair);
  for (let k of ["x", "y"]) d.pointer[k] += (target[k] - d.pointer[k]) * Math.min(1, dt * 5);
  $("cursorSim").style.left = d.pointer.x + "px";
  $("cursorSim").style.top = d.pointer.y + "px";
  $("dragSim").style.left = d.pointer.x + 16 + "px";
  $("dragSim").style.top = d.pointer.y + 17 + "px";
  if (t > durations[id] - 1.6)
    sub("演示完成　/　" + [d.c.tower ? "西边界隔离生效" : "网闸损毁，西边界恢复直通", "降级区域已稳定", "核心防线已接管"][id]);
  if (t >= durations[id] && !exporting) {
    endDemo();
    menu();
  }
}
function endDemo() {
  let id = S.mapid;
  init(id);
}
window.videoExport = {
  runs: ["demo-1", "demo-2", "demo-3"],
  async begin(run, { fps = 30 } = {}) {
    let id = this.runs.indexOf(run);
    if (id < 0 || !Number.isFinite(fps) || fps <= 0) throw Error("参数无效");
    beginDemo(id);
    exporting = true;
    demo.fps = fps;
    demo.fixed = 0;
    demoUpdate(0);
    render();
    return { frames: Math.ceil(durations[id] * fps) };
  },
  async frame(i) {
    if (!demo || !exporting) throw Error("请先调用 begin");
    let target = i / demo.fps;
    while (demo.fixed + 1e-10 < target) {
      let n = Math.min(1 / 60, target - demo.fixed);
      step(n);
      demoUpdate(n);
      demo.fixed += n;
    }
    refresh();
    render();
    renderer.getContext().finish();
  },
  end() {
    endDemo();
  },
};
thumbs = thumbnails();
const mapShots = [];
for (const id of [1, 2, 0]) {
  init(id);
  mapShots[id] = captureMapThumbnail();
}
let last = performance.now();
function tick(n) {
  let dt = Math.min(0.09, Math.max(0, (n - last) / 1000));
  last = n;
  mixAmbience();
  if (!exporting) {
    if (!S.paused && !modalOn && !S.over) {
      let d = dt * S.speed;
      while (d > 1e-6) {
        let t = Math.min(d, 0.04);
        step(t);
        if (demo) demoUpdate(t);
        d -= t;
      }
      if (ac && n > musicTime) {
        playAmbient(n);
      }
    }
    render();
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
function netWatch() {
  if (!S.grid) return;
  $("netwatch").style.display =
    $("viewport").clientHeight > (innerWidth >= 1700 ? 600 : 550) ? "block" : "none";
  let color = ["#dd833d", "#3d6dce", "#448f81"],
    pt = (c) => [(c.x + 6) * 14 + 14, (c.z + 5) * 9 + 2].join(",");
  let svg = S.map.lines
    .map(
      (line) =>
        '<polyline points="' +
        line.map((p) => pt({ x: p[0], z: p[1] })).join(" ") +
        '" fill="none" stroke="#c4ced5" stroke-width="2"/>',
    )
    .join("");
  S.paths.forEach((p, i) => {
    if (p)
      svg +=
        '<polyline points="' +
        p.map(pt).join(" ") +
        '" fill="none" stroke="' +
        color[i] +
        '" stroke-width="2.2"/>';
  });
  for (let c of [...S.ins, ...S.outs]) {
    let [x, y] = pt(c).split(",").map(Number),
      a = c.entry ? "ABC"[c.entry - 1] : "XY"[c.exit - 1];
    svg +=
      '<rect x="' +
      (x - 6) +
      '" y="' +
      (y - 6) +
      '" width="12" height="12" fill="' +
      (c.entry ? color[c.entry - 1] : "#354b64") +
      '"/><text x="' +
      x +
      '" y="' +
      (y + 3) +
      '" text-anchor="middle" font-size="9" font-family="monospace" fill="white">' +
      a +
      "</text>";
  }
  $("netwatch").innerHTML =
    '<div class="grouphead"><b>路由监测</b><span>TOPOLOGY</span></div><div class="netplot"><svg viewBox="0 0 198 92">' +
    svg +
    "</svg><div><b>" +
    pad(S.paths.length) +
    "</b><small>在线路由</small></div></div>";
}

function updateLegend() {
  let es = document.querySelectorAll(".viewfoot span");
  S.paths.forEach(
    (p, i) =>
      (es[i].innerHTML =
        '<i class="line ' +
        ["orange", "blue", "green"][i] +
        '"></i>入口 ' +
        "ABC"[i] +
        " → " +
        "XY"[(p?.at(-1)?.exit || 1) - 1]),
  );
}
function forecastInfo(i) {
  let p = (S.active ? S.queue : wavePlan()).filter((a) => a.ent == i),
    counts = Array(9).fill(0);
  p.forEach((a) => counts[a.t]++);
  modal(
    "入口 " + "ABC"[i] + " · 流量预报",
    "INGRESS / TRAFFIC FORECAST",
    "<p>" +
      S.map.names[i] +
      "　→　" +
      S.map.names[S.ins.length + S.paths[i].at(-1).exit - 1] +
      "　|　第 " +
      S.wave +
      " 波，待接入 " +
      p.length +
      ' 个威胁</p><div class="articles">' +
      counts
        .map((n, j) =>
          n
            ? '<div class="article"><img src="' +
              thumbs[9 + j] +
              '"><h3>' +
              threats[j][0] +
              " × " +
              n +
              "</h3><p>" +
              threats[j][1] +
              "</p></div>"
            : "",
        )
        .join("") +
      "</div>",
  );
}
function playAmbient(n) {
  let id = S.mapid,
    root = [110, 82.41, 73.42][id],
    seq = [
      [1, 1.5, 1.25, 1.875, 1.5, 1.25, 2, 1.5],
      [1, 1.33, 1.5, 2, 1.78, 1.5, 1.33, 1.12],
      [1, 1.12, 1.5, 1.12, 0.89, 1.33, 1.5, 1],
    ][id];
  musicTime = n + [960, 780, 690][id];
  let i = beat++ % 8;
  tone(root * seq[i], 0.83, 0.021, "triangle");
  if (i % 2 == 0) tone(root / 2, 1.6, 0.024);
  if (id == 1 && i % 3 == 0) tone(root * 3, 0.46, 0.013);
  if (id == 2 && i % 2 == 1) tone(52, 0.16, 0.036, "triangle");
  if (i == 0) tone(root * 2.5, 2, 0.008);
}
function bossTelemetry() {
  const target = S.enemies.find(e => e.t >= 6);
  const hud = $("bossHud");
  hud.hidden = !target;
  if (!target) return;
  const phase = target.t === 8 ? ["潜伏","提权","破坏"][target.phase] :
    target.t === 7 ? (target.split ? "路由风暴" : "路由欺骗") :
    (target.split ? "集群复制" : "群体控制");
  const pct = Math.max(0,Math.ceil(target.hp / target.max * 100));
  hud.innerHTML = '<div class="bossline"><b>◆ '+threats[target.t][0]+'</b><span>'+phase+'</span><strong>'+pct+'%</strong></div>'+
    '<div class="bossmeter"><i style="width:'+pct+'%"></i></div>';
}
function tileHint(event, cell) {
  const tip=$("tileTip");
  if (!cell || cell===sel || (cell.obj&&cell===sel)) {tip.hidden=true;return;}
  const label=cell.tower ? (devices[cell.tower.t]?.[0]||items[0][0])+' · Lv.'+cell.tower.level :
    cell.obj ? (cell.t===1&&!cell.visible?'业务包 · 签名待验':threats[cell.t][0]) :
    cell.node ? S.map.switches[cell.node-1]+(cell.reopen>S.time?' · 旁路稳定中':' · 直通') :
    cell.entry ? S.map.names[cell.entry-1] :
    cell.exit ? S.map.names[S.ins.length+cell.exit-1] :
    cell.lock>S.time ? '锁死链路' : cell.road ? (old(cell)?'旧协议链路':'传输链路') :
    cell.platform ? '可部署平台' : '网络设施';
  tip.textContent=label;
  tip.hidden=false;
  const bounds=canvas.getBoundingClientRect();
  tip.style.left=Math.max(6,Math.min(cw-tip.offsetWidth-6,event.clientX-bounds.left+15))+'px';
  tip.style.top=Math.max(6,Math.min(ch-tip.offsetHeight-6,event.clientY-bounds.top+17))+'px';
}
function eventHistory() {
  modal("事件记录","EVENT HISTORY",'<div class="eventList">'+S.logs.map(([sec,msg])=>
    '<div><time>'+pad(Math.floor(sec/60))+':'+pad(sec%60)+'</time><span>'+msg+'</span></div>').join('')+'</div>');
}
let environmentBus;
function createAmbience() {
  const count=ac.sampleRate*2, buffer=ac.createBuffer(1,count,ac.sampleRate);
  const channel=buffer.getChannelData(0);
  let seed=58,previous=0;
  for(let i=0;i<count;i++){
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    previous=(previous+(.12*(seed/4294967296-.5)))*.978;
    channel[i]=previous;
  }
  const noise=ac.createBufferSource(),filter=ac.createBiquadFilter(),gain=ac.createGain();
  noise.buffer=buffer;noise.loop=true;filter.type="bandpass";
  noise.connect(filter);filter.connect(gain);gain.connect(master);gain.gain.value=0;
  const hum=ac.createOscillator(),humGain=ac.createGain();
  hum.type="sine";humGain.gain.value=.11;
  hum.connect(humGain);humGain.connect(gain);noise.start();hum.start();
  environmentBus={filter,gain,hum,mode:-1,enabled:null};
}
function mixAmbience(){
  const env=environmentBus;
  if(!env)return;
  if(env.mode!==S.mapid){
    env.mode=S.mapid;
    env.filter.frequency.setTargetAtTime([360,800,185][S.mapid],ac.currentTime,.16);
    env.filter.Q.value=[.7,.45,1.8][S.mapid];
    env.hum.frequency.setTargetAtTime([82.4,65.4,49][S.mapid],ac.currentTime,.12);
  }
  const enabled=!exporting&&!S.paused&&!modalOn&&!S.over&&!document.hidden;
  if(env.enabled!==enabled){
    env.enabled=enabled;env.gain.gain.setTargetAtTime(enabled?.12:0,ac.currentTime,.07);
  }
}

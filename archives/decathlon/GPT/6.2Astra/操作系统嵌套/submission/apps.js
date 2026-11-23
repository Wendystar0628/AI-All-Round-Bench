function field(type, value, test, s, w, onchange) {
  let e = mark(el("input"), test, s, w);
  e.type = type;
  e.value = value ?? "";
  if (onchange) e.onchange = () => onchange(e.value);
  e.ariaLabel = test || type;
  return e;
}
function select(opts, val, test, s, w, fn) {
  let e = mark(el("select"), test, s, w);
  e.ariaLabel = test;
  for (let item of opts) {
    let [v, l] = Array.isArray(item) ? item : [item, item],
      o = el("option", "", esc(l));
    o.value = v;
    o.dataset.value = v;
    e.append(o);
  }
  e.value = val;
  e.onchange = () => fn(e.value);
  return e;
}
function initApp(s, w) {
  let d = w.data;
  switch (w.appId) {
    case "files":
      d.path ??= "/Demo";
      d.sel = [];
      enqueue(s, w.pid, { action: "render", path: d.path });
      break;
    case "spreadsheet":
      d.path ??= PATH.book;
      d.cells = JSON.parse(s.files[d.path] || "{}");
      d.cell = "A1";
      d.undo = [];
      d.redo = [];
      d.version = 1;
      d.results = Object.fromEntries(
        Object.keys(d.cells)
          .filter((k) => k !== "$format")
          .map((k) => [k, value(d, k)]),
      );
      d.committed = {
        cells: copy(d.cells),
        results: copy(d.results),
        path: d.path,
        version: 1,
      };
      break;
    case "editor":
      d.path ??= "/Programs/累加.str";
      d.text = s.files[d.path] || "";
      break;
    case "player":
    case "charts":
      initMedia(s, w);
      break;
    case "system":
      w.title = d.child + " · 子系统";
      break;
    case "projection":
      w.title = names[d.kind] + " · 来自 " + d.sid;
      break;
  }
}
function drawApp(s, w) {
  let v = views[w.id];
  if (!v) return;
  if (
    s.parentId &&
    DEFAULT_LAYOUTS[w.appId] &&
    !w.data.layout &&
    !w.data.customSurface
  ) {
    v.body.innerHTML = '<div class="panel muted">等待程序提交界面…</div>';
    return;
  }
  drawContents(s, w);
  if (s.parentId && w.data.layout && !w.data.customSurface) {
    let children = [...v.body.children],
      order = w.data.layout.sections || [];
    for (let key of order) {
      let i = children.findIndex((e) => e.classList.contains(key));
      if (i >= 0) {
        v.body.append(children[i]);
        children.splice(i, 1);
      }
    }
    for (let e of children) e.remove();
  }
}
function drawContents(s, w) {
  let v = views[w.id];
  if (!v) return;
  let body = v.body;
  body.replaceChildren();
  let d = w.data,
    B = (l, f, t, cl) => btn(l, f, t, s, w, cl),
    bar = (...kids) => {
      let t = el("div", "toolbar");
      t.append(...kids);
      body.append(t);
      return t;
    },
    panel = () => {
      let p = el("div", "panel");
      body.append(p);
      return p;
    },
    status = (t) => body.append(el("div", "status", esc(t))),
    header = (en, cn) =>
      body.append(
        el(
          "div",
          "apphead",
          '<div class="kicker">' + en + "</div><h2>" + cn + "</h2>",
        ),
      );
  if (w.appId === "custom" || d.customSurface) {
    let box = el("div", "userdisplay");
    body.append(box);
    let surface = Array.isArray(d.drawing)
      ? { items: d.drawing }
      : d.drawing || {};
    let svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute(
      "viewBox",
      "0 0 " + (surface.width || 640) + " " + (surface.height || 360),
    );
    for (let item of surface.items || []) {
      if (!["rect", "circle", "text", "line"].includes(item.type)) continue;
      let shape = document.createElementNS(svg.namespaceURI, item.type);
      for (let k of [
        "x",
        "y",
        "width",
        "height",
        "cx",
        "cy",
        "r",
        "x1",
        "x2",
        "y1",
        "y2",
        "fill",
        "stroke",
        "font-size",
      ])
        if (item[k] !== undefined) shape.setAttribute(k, item[k]);
      if (item.type === "text") shape.textContent = item.text;
      svg.append(shape);
    }
    svg.onclick = (e) => {
      let pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(
        svg.getScreenCTM().inverse(),
      );
      processMedia(s, w, { action: "click", x: pt.x, y: pt.y });
    };
    box.append(svg);
    status("STRATA DISPLAY / PID " + w.pid);
    return;
  }
  if (w.appId === "system") {
    let c = systems[d.child];
    if (!c) return;
    let t = el(
      "div",
      "sysbar",
      "<span>◈ &nbsp; " + c.id.toUpperCase() + "</span>",
    );
    body.append(t);
    for (let [test, label, fn] of systemActions(s, c).slice(0, 6)) {
      let b = B(label, fn, test);
      b.dataset.targetSystemId = c.id;
      t.append(b);
    }
    let host = el("div", "syshost");
    body.append(host);
    desktop(c, host);
    return;
  }
  if (w.appId === "systems") {
    header("NODE MANAGEMENT", "子系统控制台");
    bar(B("＋ 新建子系统", () => newSystem(s), "system-new", "primary"));
    let p = panel();
    p.innerHTML =
      '<div class="kicker">' +
      s.id.toUpperCase() +
      " / DIRECT DESCENDANTS</div>";
    for (let id of s.tree) {
      let c = systems[id],
        box = el(
          "div",
          "block",
          "<h3>" + esc(c.name) + " <code>" + c.state + "</code></h3>",
        );
      let row = el("div", "row");
      for (let [t, l, f] of systemActions(s, c)) {
        let b = B(
          l,
          () => {
            f();
            if (views[w.id]) drawApp(s, w);
          },
          t,
        );
        b.dataset.targetSystemId = id;
        row.append(b);
      }
      box.append(row);
      p.append(box);
    }
    if (!s.tree.length) p.append(el("p", "muted", "当前没有直属子系统。"));
    return;
  }
  if (w.appId === "files") {
    let post = (payload) => processMedia(s, w, payload),
      nav = (path) => {
        d.sel = [];
        if (s.parentId) {
          post({ action: "render", path });
          return;
        }
        d.path = path;
        drawApp(s, w);
      },
      act = () => d.sel[0],
      create = (folder) =>
        ask(
          s,
          folder ? "新建目录" : "新建文件",
          folder ? "新建目录" : "文稿.txt",
          (name) => {
            if (!name || name.includes("/")) throw Error("名称无效");
            let k = join(d.path, name);
            if (k in s.files) throw Error("同名文件已存在");
            if (s.parentId) {
              post({ action: "create", file: k, folder });
              return;
            }
            if (folder) s.files[k] = null;
            else fileWrite(s, k, "");
            nav(d.path);
            notify(s, "已创建 " + name);
          },
        );
    let copyFiles = (cut) => {
        s.fileClip = { files: d.sel.map((k) => [k, s.files[k]]), cut };
        notify(s, cut ? "文件已剪切" : "文件已复制");
      },
      paste = () => {
        if (!s.fileClip) return;
        transfer(s,s,d.path,s.fileClip.files,null,s.fileClip.cut);
      };
    let path = field("text", d.path, "files-path", s, w, (k) => {
      if (k === "/" || s.files[k] === null) nav(k);
      else notify(s, "目录不存在");
    });
    path.className = "fileinput";
    bar(
      B("↑", () => nav(dir(d.path))),
      path,
      B("新建文件", () => create(false), "files-new-file"),
      B("新建目录", () => create(true), "files-new-folder"),
    );
    let del = () => {
        for (let k of d.sel) {
          let key=join("/Trash",base(k)),seq=1;
          while(Object.hasOwn(s.files,key))key=join("/Trash",base(k)+" ("+seq+++")");
          s.trash ??= {};
          s.trash[key] = k;
          if (s.parentId) post({ action: "move", file: k, to: key });
          else movePath(s, k, key);
        }
        notify(s, "文件已移入回收站");
        nav(d.path);
      },
      rename = () =>
        act() &&
        ask(s, "重命名", base(act()), (name) => {
          if(!name||name.includes("/")||name==="."||name==="..")throw Error("名称无效");
          if (s.parentId)
            post({ action: "move", file: act(), to: join(d.path, name) });
          else movePath(s, act(), join(d.path, name));
          nav(d.path);
        }),
      recover = () => {
        for (let k of d.sel)
          movePath(s, k, s.trash?.[k] || join("/Documents", base(k)));
        notify(s, "文件已恢复");
        nav(d.path);
      },
      open = () => {
        if (act()) {
          if (s.parentId) post({ action: "open", file: act() });
          else openFile(s, act(), nav);
        }
      };
    bar(
      B("打开", open, "files-open"),
      B("复制", () => copyFiles(false), "files-copy"),
      B("剪切", () => copyFiles(true)),
      B("粘贴", paste, "files-paste"),
      B("重命名", rename),
      B(
        d.path === "/Trash" ? "恢复" : "删除",
        d.path === "/Trash" ? recover : del,
      ),
      B("导出", () => {
        if (!act() || s.files[act()] === null) return;
        let a = el("a");
        a.href = URL.createObjectURL(new Blob([s.files[act()]]));
        a.download = base(act());
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      }),
      B("导入", () => {
        let input = el("input");
        input.type = "file";
        input.onchange = async () => {
          let f = input.files[0];
          if (f)
            transfer(s, s, d.path, [[f.name, await f.text()]], () =>
              nav(d.path),
            );
        };
        input.click();
      }),
    );
    let layout = el("div", "sidegrid"),
      side = el("div", "sidebar"),
      list = mark(el("div", "filelist"), "files-list", s, w);
    for (let [p, l] of [
      ["/", "此电脑"],
      ["/Demo", "示例资源"],
      ["/Documents", "文档"],
      ["/Downloads", "下载"],
      ["/Programs", "程序"],
      ["/System", "系统"],
      ["/Trash", "回收站"],
    ]) {
      let b = B(l, () => nav(p), "files-nav", d.path === p ? "active" : "");
      b.dataset.filePath = p;
      side.append(b);
    }
    layout.append(side, list);
    body.append(layout);
    let keys = Object.keys(s.files)
      .filter((k) => dir(k) === d.path)
      .sort((a, b) => a.localeCompare(b));
    if (s.parentId) keys = d.listPath === d.path ? d.entries || [] : [];
    for (let k of keys.filter(k=>Object.hasOwn(s.files,k))) {
      let folder = s.files[k] === null,
        row = mark(
          el(
            "div",
            "frow",
            icon(
              folder
                ? "files"
                : k.endsWith(".sheet")
                  ? "spreadsheet"
                  : k.endsWith(".scene")
                    ? "player"
                    : "editor",
              19,
            ) +
              "<span>" +
              esc(base(k)) +
              "</span><small>" +
              (!folder
                ? (s.files[k].length / 1024).toFixed(1) + " KB"
                : "目录") +
              "</small>",
          ),
          "files-item",
          s,
          w,
          { filePath: k },
        );
      row.draggable = true;
      const choose = (multi) => {
        d.sel = multi ? [...new Set([...d.sel, k])] : [k];
        for (let r of list.children)
          r.classList.toggle("sel", d.sel.includes(r.dataset.filePath));
      };
      row.onclick = (e) => choose(e.ctrlKey || e.shiftKey);
      row.ondblclick = () =>
        s.parentId ? post({ action: "open", file: k }) : openFile(s, k, nav);
      row.ondragstart = (e) => {
        if (!d.sel.includes(k)) choose(false);
        e.dataTransfer.setData(
          "application/strata",
          JSON.stringify({ s: s.id, paths: d.sel }),
        );
      };
      row.oncontextmenu = (e) => {
        e.preventDefault();
        e.stopPropagation();
        choose(false);
        const r = views[s.id].desk.getBoundingClientRect();
        popup(
          s,
          [
            ["打开", open],
            ["用编辑器打开", () => openApp(s, "editor", { path: k })],
            ["重命名", rename],
            ["复制", () => copyFiles(false)],
            [
              d.path === "/Trash" ? "恢复" : "移入回收站",
              d.path === "/Trash" ? recover : del,
            ],
          ],
          ((e.clientX - r.left) * views[s.id].desk.clientWidth) / r.width,
          ((e.clientY - r.top) * views[s.id].desk.clientHeight) / r.height,
        );
      };
      list.append(row);
    }
    list.ondragover = (e) => {
      e.preventDefault();
      list.classList.add("drop");
    };
    list.ondragleave = () => list.classList.remove("drop");
    list.ondrop = (e) => {
      e.preventDefault();
      e.stopPropagation();
      list.classList.remove("drop");
      let obj = JSON.parse(
        e.dataTransfer.getData("application/strata") || "null",
      );
      if (obj) {
        let src = systems[obj.s];
        transfer(
          src,
          s,
          d.path,
          obj.paths.map((k) => [
            k,
            src.files[k] === null ? null : fileRead(src, k),
          ]),
          () => nav(d.path),
        );
      }
    };
    status(
      s.id.toUpperCase() +
        "  /  " +
        d.path +
        "     ·     " +
        keys.length +
        " 项",
    );
    return;
  }
  if (w.appId === "editor") {
    let file = field(
      "text",
      d.path,
      "editor-filename",
      s,
      w,
      (x) => (d.path = x),
    );
    file.className = "fileinput";
    let save = () => {
      fileWrite(s, file.value, d.text);
      d.path = file.value;
      d.dirty = false;
      notify(s, "已保存 " + base(d.path));
      drawApp(s, w);
    };
    bar(
      file,
      B("新建", () => openApp(s, "editor", { path: "/Documents/新程序.str" })),
      ...(d.path === PATH.compiler
        ? [
            B("编译自身", () => {
              let result = compile(s, d.text);
              parseProgram(result);
              fileWrite(s, PATH.compiler, d.text);
              s.compilerBuild={source:d.text,image:result};
              d.dirty = false;
              notify(s, "已从源程序重新编译并载入编译器");
              drawApp(s, w);
            }),
          ]
        : []),
      B("保存", save, "editor-save", "primary"),
      B("运行 ▷", () => {
        save();
        let p = launchProgram(s, d.path);
        if (p) {
          d.runPid = p.pid;
          drawApp(s, w);
        }
      }),
    );
    let a = mark(el("textarea", "edittext"), "editor-text", s, w);
    a.value = d.text;
    a.spellcheck = false;
    a.oninput = () => {
      d.text = a.value;
      d.dirty = true;
      body.querySelector(".status").textContent = "● 未保存";
    };
    a.onkeydown = (e) => {
      if (e.ctrlKey && e.key === "s") {
        e.preventDefault();
        save();
      }
    };
    body.append(a);
    status(d.dirty ? "● 未保存" : "STRATA SOURCE  /  " + d.path);
    return;
  }
  if (w.appId === "spreadsheet") {
    renderSheet(s, w, body, B, bar, status);
    return;
  }
  if (w.appId === "tasks") {
    header("RESOURCE MONITOR", "进程管理器");
    let cfg = bar();
    for (let [k, l, t] of [
      ["budget", "步预算", "tasks-budget"],
      ["memory", "内存 B", "tasks-memory"],
      ["storage", "存储 B", "tasks-storage"],
    ]) {
      let f = field("number", s[k], t, s, w, (n) => (s[k] = Math.max(1, +n)));
      f.style.width = "79px";
      cfg.append(l, f);
    }
    let p = panel();
    p.append(el("div","resource-cards"));p.append(el("div", "taskread"));
    views[w.id].processList=s.procs.map(p=>p.pid).join(",");
    for (let id of s.tree) {
      let c = systems[id],
        carrier = s.procs.find((p) => p.child === id),
        f = field("number", carrier.cap, "tasks-grant", s, w, (n) => {
          carrier.cap = c.grant = Math.max(0, +n);
        });
      f.dataset.targetSystemId = id;
      let r = el("div", "row", id + " 拨付上限 ");
      r.append(f);
      p.append(r);
    }
    for (let pr of s.procs) {
      let row = el(
        "div",
        "block",
        '<div class="row"><code>PID ' +
          pr.pid +
          "</code><b>" +
          esc(pr.name) +
          '</b><span class="minitext" data-pid="' +
          pr.pid +
          '"></span></div>',
      );
      let r = el("div", "row");
      r.append(
        B(pr.state === "suspended" ? "继续" : "挂起", () => {
          if (pr.state === "suspended")
            pr.state =
              pr.prev === "waiting" && pr.queue.length
                ? "ready"
                : pr.prev || "ready";
          else {
            pr.prev = pr.state;
            pr.state = "suspended";
          }
          if (pr.child) {
            let c = systems[pr.child];
            if (pr.state === "suspended") {
              c.priorState = c.state;
              c.state = "paused";
            } else c.state = c.priorState || "running";
            refreshStatus(c);
          }
          drawApp(s, w);
        }),
        B("结束", () => {
          endProcess(s, pr);
          if (views[w.id]) drawApp(s, w);
        }),
        "额度",
        field("number", pr.cap, null, s, w, (n) => (pr.cap = Math.max(0, +n))),
      );
      r.lastChild.style.width = "80px";
      row.append(r);
      p.append(row);
    }
    for (let browser of s.wins.filter((q) => q.appId === "browser"))
      for (let tab of browser.data.tabs || [])
        p.append(
          el(
            "div",
            "block",
            "<b>Chromium 网页视图</b> · " +
              esc(tab.title) +
              " <code>" +
              esc(tab.id) +
              '</code><p class="muted">' +
              esc(tab.loadState) +
              " / 宿主设备</p>",
          ),
        );
    refreshTasks(s, w);
    return;
  }
  if (w.appId === "settings") {
    header("WORKSPACE PREFERENCES", "桌面外观");
    let p = panel();
    p.classList.add("stack");
    let block = (title, child) => {
      let c = el("div", "block", "<h3>" + title + "</h3>");
      if(["settings-wallpaper","settings-accent"].includes(child.dataset.testid)){
        let grid=el("div",child.dataset.testid==="settings-wallpaper"?"wall-options":"accent-options");
        for(let opt of child.options){
          let button=B(esc(opt.textContent),()=>{child.value=opt.value;child.dispatchEvent(new Event("change"));for(let b of grid.children)b.setAttribute("aria-pressed",String(b.dataset.value===opt.value))});
          button.dataset.value=opt.value;button.setAttribute("aria-pressed",String(opt.selected));
          if(child.dataset.testid==="settings-wallpaper")button.className="wall-preview "+opt.value;
          else button.style.setProperty("--swatch",opt.value);grid.append(button);
        }
        c.append(grid);child.oninput=()=>{for(let b of grid.children)b.setAttribute("aria-pressed",String(b.dataset.value===child.value))};
      }
      c.append(child);
      p.append(c);
    };
    block(
      "系统名称",
      field("text", s.name, null, s, w, (n) => {
        s.name = n;
        applySettings(s);
      }),
    );
    block(
      "桌面壁纸",
      select(
        [
          ["highland", "高地 · 晴空"],
          ["evening", "山脉 · 暮色"],
          ["blue", "林地 · 冷杉"],
        ],
        s.settings.wall,
        "settings-wallpaper",
        s,
        w,
        (v) => {
          s.settings.wall = v;
          applySettings(s);
        },
      ),
    );
    block(
      "强调色",
      select(
        [
          ["#e5ef9c", "苔原黄"],
          ["#a7d7c2", "冰川绿"],
          ["#e9b498", "峡谷橙"],
          ["#d0c3e7", "雾紫"],
        ],
        s.settings.accent,
        "settings-accent",
        s,
        w,
        (v) => {
          s.settings.accent = v;
          applySettings(s);
        },
      ),
    );
    block(
      "界面缩放",
      select(
        [
          ["0.9", "90%"],
          ["1", "100%"],
          ["1.1", "110%"],
          ["1.25", "125%"],
        ],
        s.settings.scale,
        "settings-scale",
        s,
        w,
        (v) => {
          s.settings.scale = +v;
          applySettings(s);
        },
      ),
    );
    block(
      "通知",
      select(
        [
          ["0", "允许通知"],
          ["1", "免打扰"],
        ],
        s.settings.dnd ? "1" : "0",
        null,
        s,
        w,
        (v) => (s.settings.dnd = v === "1"),
      ),
    );
    return;
  }
  if (w.appId === "widgets") {
    renderWidgets(s, w, body, B, header, panel);
    return;
  }
  if (w.appId === "notifications") {
    header("ACTIVITY LOG", "通知中心");
    let p = panel();
    p.append(
      B(s.settings.dnd ? "关闭免打扰" : "打开免打扰", () => {
        s.settings.dnd = !s.settings.dnd;
        drawApp(s, w);
      }),
    );
    for (let n of s.notifications)
      p.append(
        el(
          "div",
          "tablerow",
          icon("notifications", 16) +
            esc(n.msg) +
            "<code>" +
            fmt(n.time) +
            "</code>",
        ),
      );
    if (!s.notifications.length) p.append(el("p", "muted", "暂无通知"));
    return;
  }
  if (w.appId === "browser") {
    browserApp(s, w, body);
    return;
  }
  if (["player", "charts", "projection"].includes(w.appId)) {
    mediaView(s, w, body);
    return;
  }
  if (w.appId === "help") {
    header("FIELD MANUAL  /  REV. 01", "高地站操作手册");
    panel().append(el("div", "readme", esc(MANUAL)));
    return;
  }
}
function join(dir, name) {
  return (dir === "/" ? "" : dir) + "/" + name;
}
function fileWrite(s, k, v) {
  return s.parentId
    ? syscall(s, { pid: 0, debt: 0 }, "write", [k, v])
    : put(s, k, v);
}
function fileRead(s, k) {
  return s.parentId ? syscall(s, { pid: 0, debt: 0 }, "read", [k]) : s.files[k];
}
function movePath(s, a, b) {
  if(a===b)return;
  if(!Object.hasOwn(s.files,a))throw Error("源文件不存在");
  if(b.startsWith(a+"/"))throw Error("不能将目录移入自身");
  if(dir(b)!=="/"&&s.files[dir(b)]!==null)throw Error("目标目录不存在");
  if (b in s.files) throw Error("目标已存在");
  for (let k of Object.keys(s.files))
    if (k === a || k.startsWith(a + "/")) {
      s.files[b + k.slice(a.length)] = s.files[k];
      delete s.files[k];
    }
}
function transfer(src,dest,path,entries,done,cut=false){
  const start=()=>{
    if(path!=="/"&&dest.files[path]!==null)throw Error("目标目录不存在");
    const items=[],remove={};
    for(const [source,value] of entries){
      if(value===null&&src===dest&&(path===source||path.startsWith(source+"/")))throw Error("不能把目录复制到自身内部");
      const selected=[[source,value],...(value===null?Object.entries(src.files).filter(([k])=>k.startsWith(source+"/")):[])];
      for(const [key,val] of selected){
        const target=join(path,base(source)+key.slice(source.length));
        if(Object.hasOwn(dest.files,target)&&(dest.files[target]===null)!==(val===null))throw Error("同名项目类型不同");
        items.push({path:target,value:val,folder:val===null,existed:Object.hasOwn(dest.files,target)});
        if(cut&&src===dest&&key!==target)remove[key]=val;
      }
    }
    if(!allowance(dest,"memory",usedMemory,JSON.stringify(items).length*2))throw Error("接收文件的内存额度不足");
    dest.files["/System/copy.str"]??=APP_PROGS.copy;
    const p=launchProgram(dest,"/System/copy.str");if(!p)return;
    p.name="文件传递 · "+base(entries[0]?.[0]||path);p.v.items=items;p.staging={};p.removeOriginals=remove;p.cap=2048;
    p.job=(cut?"已移动 ":"已复制 ")+entries.length+" 项至 "+path;notify(dest,"正在传递 "+entries.length+" 项");
  };
  if(entries.some(([k])=>join(path,base(k)) in dest.files))
    confirmBox(dest,"目标已有同名文件，覆盖副本？",start,"覆盖");
  else start();
}
function commitTransfer(s,p){
  if(!p.staging)throw Error("没有待提交的文件");
  let updated={...s.files};for(let item of p.v.items){
    if(!item.existed&&Object.hasOwn(updated,item.path))throw Error("目标出现同名文件，请重新复制");
    if(dir(item.path)!=="/"&&updated[dir(item.path)]!==null&&!Object.hasOwn(p.staging,dir(item.path)))throw Error("目标目录已移动");
  }
  for(let [key,value]of Object.entries(p.removeOriginals||{})){
    if(updated[key]!==value)throw Error("剪切源已改变，请重新选择");
    delete updated[key];
  }
  Object.assign(updated,p.staging);
  if(!allowance(s,"storage",storage,storage({files:updated})-storage(s)))throw Error("目标存储额度不足");
  s.files=updated;delete p.staging;delete p.removeOriginals;return true;
}
function openFile(s, path, nav) {
  if (s.files[path] === null) return nav(path);
  if (path.endsWith(".snap"))
    return restoreSnap(s, JSON.parse(s.files[path]), true);
  if (path.endsWith(".sheet") && !s.parentId)
    return openApp(s, "spreadsheet", { path });
  if ((path.endsWith(".scene") || path.endsWith(".flight")) && s.parentId)
    return openApp(s, "player", { path });
  return openApp(s, "editor", { path });
}
function refreshTasks(s, w) {
  let v = views[w.id];
  if (!v) return;
  if(v.processList!==s.procs.map(p=>p.pid).join(",")&&!v.body.contains(document.activeElement)){drawApp(s,w);return}
  let cards=v.body.querySelector(".resource-cards");
  if(cards){let usage=[[s.last,s.budget,"指令预算","STEP"],[inclusive(s,usedMemory),s.memory,"内存占用","MEM"],[inclusive(s,storage),s.storage,"文件存储","DISK"]];
    cards.innerHTML=usage.map(([used,max,name,unit])=>{let pct=Math.round(100*used/Math.max(1,max));return '<div><small>'+unit+'</small><strong>'+pct+'<i>%</i></strong><span>'+name+'</span><progress max="100" value="'+Math.min(100,pct)+'"></progress></div>'}).join("");
  }
  let h = v.body.querySelector(".taskread");
  if (h)
    h.textContent =
      "本步 " +
      s.last +
      " / " +
      s.budget +
      "   ·   内核 " +
      s.ktime +
      "   ·   内存 " +
      (usedMemory(s) / 1024).toFixed(1) +
      " KiB   ·   存储 " +
      (storage(s) / 1024).toFixed(1) +
      " KiB";
  for (let e of v.body.querySelectorAll("[data-pid]")) {
    let p = pidOf(s, +e.dataset.pid);
    if (p)
      e.textContent =
        (p.compilation?"编译中":({ready:"就绪",sleep:"定时等待",waiting:"等待消息",suspended:"挂起",error:"异常",ended:"结束"}[p.state]||p.state)) +
        "  /  累计 " +
        p.work +
        "  /  本步 " +
        p.last +
        "  /  剩余 " +
        (p.debt+(p.frames||[]).reduce((n,f)=>n+(f.debt||0),0)) +
        "  /  消息 " +
        p.queue.length +
        "  /  内存 " +
        ((JSON.stringify(p).length * 2) / 1024).toFixed(1) +
        " KiB" +
        (p.child ? "  内核 " + systems[p.child]?.ktime+" / 内部 "+Math.max(0,(systems[p.child]?.last||0)-(systems[p.child]?.ktime||0)) : "") +
        "  " +
        (p.error || p.output.at(-1) || "");
  }
}
function capture(s) {
  let instance = copy(s);
  for (let w of instance.wins) delete w.outbox;
  return { instance, kids: s.tree.map((id) => capture(systems[id])) };
}
function snapshotFile(parent, c, path) {
  let payload = JSON.stringify(capture(c));
  if (
    !allowance(
      parent,
      "storage",
      storage,
      (payload.length - (parent.files[path]?.length || 0)) * 2,
    )
  ) {
    notify(parent, "快照存储额度不足");
    return;
  }
  let p = thread("写入快照 " + c.id, "write(path,payload)\nhalt");
  p.v = { path, payload };
  p.job = "快照已保存 " + path;
  p.cap = 4096;
  parent.procs.push(p);
  notify(parent, "正在写入快照…");
}
function restoreSnap(parent, snap, fork) {
  let map = {},
    wm = {},
    pm = {};
  function allocate(t) {
    map[t.instance.id] = fork ? "inner-" + ++serial : t.instance.id;
    for(let w of t.instance.wins){wm[w.id]=fork?"win-"+ ++wserial:w.id;zTop=Math.max(zTop,w.z)}
    for (let p of t.instance.procs) {
      pm[p.pid] = p.pid;
      ps = Math.max(ps, p.pid);
    }
    t.kids.forEach(allocate);
  }
  allocate(snap);
  let entry = map[snap.instance.id],
    old = systems[entry],
    frame = parent.wins.find((w) => w.data.child === entry);
  if (old) {
    for (let id of [old.id, ...descendants(old)]) {
      let q = systems[id];
      for (let w of q.wins) {
        views[w.id]?.node.remove();
        delete views[w.id];
      }
      delete views[id];
      delete systems[id];
    }
  }
  function build(t, par) {
    let s = copy(t.instance);
    s.id = map[s.id];
    s.name = fork && s.name === t.instance.id ? s.id : s.name;
    s.parentId = par.id;
    s.tree = s.tree.map((id) => map[id]);
    s.wm = pm[s.wm];
    if (fork) {
      s.kernelPath = "/System/" + s.id + ".str";
      par.files[s.kernelPath] = s.kernelSource;
    }
    systems[s.id] = s;
    for (let p of s.procs) {
      p.pid = pm[p.pid];
      p.owner = wm[p.owner] || p.owner;
      if (fork) {
        let fix = (x) => {
          if (Array.isArray(x)) return x.map(fix);
          if (x && typeof x === "object")
            return Object.fromEntries(
              Object.entries(x).map(([k, v]) => [
                k,
                ["pid", "sender", "recipient", "targetPid"].includes(k) && pm[v]
                  ? pm[v]
                  : fix(v),
              ]),
            );
          return typeof x === "string" ? wm[x] || map[x] || x : x;
        };
        p.v = fix(p.v);
        p.queue = fix(p.queue);
        if(p.frames)p.frames=fix(p.frames);if(p.operands)p.operands=fix(p.operands);
        if (pm[p.v.pid]) p.v.pid = pm[p.v.pid];
      }
      if(p.child){p.child=map[p.child];p.name=p.child}
    }
    for (let w of s.wins) {
      w.id = wm[w.id];
      w.systemId = s.id;
      w.pid = pm[w.pid];
      if (w.data.child) {
        w.data.child = map[w.data.child];
        w.title = w.data.child + " · 子系统";
      }
      for (let k of ["scenePid", "fxPid", "receiver", "controller"])
        if (w.data[k]) w.data[k] = pm[w.data[k]];
      if (w.data.sid) w.data.sid = map[w.data.sid] || w.data.sid;
      if (w.data.wid) w.data.wid = wm[w.data.wid] || w.data.wid;
      if (w.appId === "charts") {
        w.data.connectionState = "已恢复，待重新连接";
        delete w.data.source;
        delete w.outbox;
      }
    }
    t.kids.forEach((c) => build(c, s));
    return s;
  }
  let s = build(snap, parent);
  if (!frame) {
    parent.tree.push(s.id);
    let p = thread(s.id, "halt");
    p.child = s.id;
    p.cap = s.grant;
    parent.procs.push(p);
    openApp(parent, "system", { child: s.id });
  } else drawApp(parent, frame);
  for (let a of Object.values(systems))
    for (let w of [...a.wins])
      if (w.appId === "projection") {
        if (!systems[w.data.sid]?.wins.some((q) => q.id === w.data.wid))
          closeWindow(a, w, true);
        else {let source=systems[w.data.sid].wins.find(q=>q.id===w.data.wid);w.data.surface=displayCopy(source,true);ensureTransport(systems[w.data.sid],source);drawApp(a,w)}
      }
  return s;
}
function descendants(s) {
  return s.tree.flatMap((id) => [id, ...descendants(systems[id])]);
}
function restart(parent, c) {
  let snap = capture(c);
  function reset(t, par) {
    let n = t.instance;
    n.state = "running";
    delete n.error;
    n.clock = 0;
    n.last = 0;
    n.ktime = 0;
    delete n.idleStep;
    n.procs = [];
    n.bootApps = [];
    n.wins = n.wins.filter((w) => w.appId === "system");
    try {
      n.kernelSource = par.files[n.kernelPath];
      n.kernel = thread("kernel", compile(par, n.kernelSource));
      if (parseProgram(n.kernel.src).labels.main === undefined)
        throw Error("缺少 @main");
      n.wm = syscall(n, n.kernel, "boot", []);
    } catch (e) {
      n.state = "error";
      n.error = e.message;
    }
    for (let kid of t.kids) {
      let p = thread(kid.instance.id, "halt");
      p.child = kid.instance.id;
      p.cap = kid.instance.grant;
      n.procs.push(p);
      reset(kid, n);
    }
  }
  reset(snap, parent);
  restoreSnap(parent, snap, false);
  for (let id of [c.id, ...descendants(systems[c.id])])
    if (!frozen(systems[id]))
      for (let k of systems[id].bootApps || []) openApp(systems[id], k);
}
function systemActions(s, c) {
  let snap = "/Documents/" + c.id + ".snap";
  return [
    [
      "system-pause",
      "暂停",
      () => {
        c.state = "paused";
        refreshStatus(c);
      },
    ],
    [
      "system-resume",
      "继续",
      () => {
        if (!c.error) {
          c.state = "running";
          let carrier = s.procs.find((p) => p.child === c.id);
          if (carrier?.state === "suspended") carrier.state = "ready";
        }
        refreshStatus(c);
      },
    ],
    [
      "system-step",
      "单步",
      () => {
        if (c.state === "paused" && !frozen(s)) {
          c.stepOnce = true;
        }
      },
    ],
    ["system-restart", "重启", () => restart(s, c)],
    ["kernel-open", "内核", () => openApp(s, "editor", { path: c.kernelPath })],
    ["system-manage", "管理", () => openApp(s, "systems")],
    [
      "system-speed",
      "速率 ×" + c.speed,
      () =>
        ask(
          s,
          "虚拟时钟速率",
          c.speed,
          (v) => (c.speed = Math.max(0.05, Math.min(16, +v || 1))),
        ),
    ],
    [
      "system-snapshot",
      "快照",
      () => {
        snapshotFile(s, c, snap);
      },
    ],
    [
      "system-restore",
      "恢复",
      () =>
        s.files[snap]
          ? restoreSnap(s, JSON.parse(s.files[snap]), false)
          : notify(s, "请先保存快照"),
    ],
    [
      "system-fork",
      "分叉",
      () =>
        restoreSnap(
          s,
          s.files[snap] ? JSON.parse(s.files[snap]) : capture(c),
          true,
        ),
    ],
    [
      "system-stop",
      "停止",
      () => confirmBox(s, "停止整个子树？", () => removeSystem(c), "停止"),
    ],
  ];
}

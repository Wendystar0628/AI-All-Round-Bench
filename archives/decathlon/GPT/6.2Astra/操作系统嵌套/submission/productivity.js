function col(n) {
  let s = "";
  for (n++; n; n = Math.floor((n - 1) / 26))
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}
function addr(a) {
  let m = /^([A-Z]+)([1-9]\d*)$/i.exec(a);
  if (!m) throw Error("#REF!");
  let x = 0;
  for (let c of m[1].toUpperCase()) x = x * 26 + c.charCodeAt(0) - 64;
  if(x>702||+m[2]>10000)throw Error("#REF!");return [x - 1, +m[2] - 1];
}
function region(range) {
  let [a, b] = range.toUpperCase().split(":"),
    [x, y] = addr(a),
    [X, Y] = addr(b || a);
  if ((Math.abs(X - x)+1) * (Math.abs(Y - y)+1) > 100000 || X > 701 || Y > 9999)
    throw Error("#REF!");
  return {
    x: Math.min(x, X),
    y: Math.min(y, Y),
    X: Math.max(x, X),
    Y: Math.max(y, Y),
  };
}
function cellValue(cells, k, seen = new Set()) {
  if (seen.has(k)) throw Error("#CYCLE!");
  let v = cells[k] ?? "";
  if (!String(v).startsWith("="))
    return v === "" ? "" : isFinite(Number(v)) ? Number(v) : v;
  seen = new Set(seen);
  seen.add(k);
  let code = v
      .slice(1)
      .toUpperCase()
      .replace(/([A-Z]+\d+):([A-Z]+\d+)/g, 'RANGE("$1:$2")'),
    n;
  try {
    n = acorn.parseExpressionAt(code, 0, { ecmaVersion: 2022,preserveParens:true });
    if (n.end < code.trimEnd().length) throw Error();
  } catch {
    throw Error("#FORMULA!");
  }
  function ev(n) {
    if(n.type==="ParenthesizedExpression")return ev(n.expression);
    if (n.type === "Literal") return n.value;
    if (n.type === "Identifier") {
      addr(n.name);
      return Number(cellValue(cells, n.name, seen) || 0);
    }
    if (n.type === "UnaryExpression")
      return n.operator === "-" ? -ev(n.argument) : +ev(n.argument);
    if (n.type === "CallExpression") {
      if (n.callee.name === "RANGE") {
        let { x, y, X, Y } = region(n.arguments[0].value),
          vals = [];
        for (let i = y; i <= Y; i++)
          for (let j = x; j <= X; j++)
            vals.push(cellValue(cells, col(j) + (i + 1), seen));
        return vals;
      }
      if (n.callee.name === "SUM")
        return n.arguments
          .map(ev)
          .flat()
          .reduce((a, v) => a + (Number(v) || 0), 0);
      throw Error("#NAME?");
    }
    if (n.type === "BinaryExpression") {
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
          if (!b) throw Error("#DIV/0!");
          return a / b;
      }
    }
    throw Error("#FORMULA!");
  }
  let result = ev(n);
  if (!isFinite(result)) throw Error("#VALUE!");
  return result;
}
function value(d, a) {
  if (d.results && Object.hasOwn(d.results, a)) return d.results[a];
  try {
    return cellValue(d.cells, a);
  } catch (e) {
    return e.message;
  }
}
function finishCalculation(s, w, job, values) {
  if (!w) return false;
  let committed = {
    version: job.version,
    cells: copy(job.cells),
    results: copy(values),
    path: job.path,
  };
  w.data.committed = committed;
  if (w.data.version === job.version) {
    w.data.results = copy(values);
    let ui = views[w.id];
    if (ui) {
      for (let td of ui.body.querySelectorAll("[data-cell-address]"))
        if (!td.isContentEditable)
          td.textContent = values[td.dataset.cellAddress] ?? "";
      let status = ui.body.querySelector(".status");
      if (status)
        status.textContent =
          "工作表 01 / " +
          (w.data.dirty ? "● 未保存" : "已保存") +
          "  ·  v" +
          job.version;
    }
  }
  publishBook({ id: w.id, data: committed });
  return true;
}
function saveBook(s, w) {
  fileWrite(s, w.data.path, JSON.stringify(w.data.cells, null, 2));
  w.data.dirty = false;
  notify(s, "已保存 " + base(w.data.path));
}
function renderSheet(s, w, body, B, bar, status) {
  let d = w.data,
    formula = field("text", d.cells[d.cell] || "", "sheet-formula", s, w),
    path = field("text", d.path, "sheet-filename", s, w, (n) => (d.path = n));
  formula.className = "fileinput";
  let pointer = el("code", "", d.cell);
  let history = (undo) => {
      let a = undo ? d.undo : d.redo,
        b = undo ? d.redo : d.undo;
      if (!a.length) return;
      b.push(copy(d.cells));
      d.cells = a.pop();
      changed();
    },
    changed = () => {
      d.dirty = true;
      d.version++;
      enqueue(s, w.pid, {
        action: "calculate",
        version: d.version,
        cells: copy(d.cells),
        path: d.path,
      });
      drawApp(s, w);
      views[w.id]?.body
        .querySelector('[data-cell-address="' + d.cell + '"]')
        ?.focus();
    },
    write = (a, txt) => {
      let [x, y] = addr(a);
      d.undo.push(copy(d.cells));
      if (d.undo.length > 50) d.undo.shift();
      d.redo = [];
      txt
        .replace(/\r/g, "")
        .split("\n")
        .forEach((r, i) =>
          r
            .split("\t")
            .forEach((v, j) => (d.cells[col(x + j) + (y + i + 1)] = v)),
        );
      changed();
    };
  bar(
    path,
    B(
      "保存",
      () => {
        saveBook(s, w);
        drawApp(s, w);
      },
      "sheet-save",
      "primary",
    ),
    B("新建", () =>
      ask(s, "新工作簿名称", "新工作簿.sheet", (n) =>
        openApp(s, "spreadsheet", { path: join("/Documents", n) }),
      ),
    ),
    B("撤销", () => history(true)),
    B("重做", () => history(false)),
    B("粗体", () => formatRange("bold")),
    B("底色", () => formatRange("shade")),
  );
  function formatRange(k) {
    d.undo.push(copy(d.cells));
    d.redo = [];
    let rr = region(d.cell + ":" + (d.end || d.cell)),
      styles = (d.cells.$format ??= {});
    let on = !styles[d.cell]?.[k];
    for (let y = rr.y; y <= rr.Y; y++)
      for (let x = rr.x; x <= rr.X; x++) {
        let a = col(x) + (y + 1);
        styles[a] ??= {};
        styles[a][k] = on;
      }
    changed();
  }
  bar(pointer, el("i", "", "ƒx"), formula);
  formula.onkeydown = (e) => {
    if (e.key === "Enter") write(d.cell, formula.value);
  };
  let wrap = mark(el("div", "sheetwrap"), "sheet-grid", s, w),
    table = el("table", "sheet"),
    hdr = el("tr");
  wrap.tabIndex = 0;
  table.append(hdr);
  hdr.append(el("th"));
  for (let j = 0; j < 20; j++) hdr.append(el("th", "", col(j)));
  let selecting = false;
  function choose(a, extend) {
    if (!extend) d.cell = a;
    d.end = a;
    let rr = region(d.cell + ":" + a);
    for (let td of table.querySelectorAll("td")) {
      let [x, y] = addr(td.dataset.cellAddress);
      td.classList.toggle(
        "selected",
        x >= rr.x && x <= rr.X && y >= rr.y && y <= rr.Y,
      );
    }
    pointer.textContent = d.cell;
    formula.value = d.cells[d.cell] ?? "";
  }
  function edit(td, text) {
    let a = td.dataset.cellAddress;
    td.contentEditable = "true";
    td.textContent = text ?? d.cells[a] ?? "";
    td.focus();
    let selection = getSelection(),
      range = document.createRange();
    range.selectNodeContents(td);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
    td.onblur = () => {
      if (td.isContentEditable && td.textContent !== (d.cells[a] ?? "")) {
        td.contentEditable = "false";
        write(a, td.textContent);
      } else {
        td.contentEditable = "false";
        td.textContent = value(d, a);
      }
    };
  }
  for (let i = 1; i <= 45; i++) {
    let tr = el("tr");
    tr.append(el("th", "", i));
    for (let j = 0; j < 20; j++) {
      let a = col(j) + i,
        td = mark(el("td", "", esc(value(d, a))), "sheet-cell", s, w, {
          cellAddress: a,
        });
      td.tabIndex = -1;
      if (d.cells.$format?.[a]?.bold) td.style.fontWeight = "bold";
      if (d.cells.$format?.[a]?.shade) td.style.backgroundColor = "#e6ebc6";
      if (d.cell === a) td.classList.add("selected");
      td.onpointerdown = (e) => {
        if (td.isContentEditable) return;
        selecting = true;
        choose(a, e.shiftKey);
        td.focus();
      };
      td.onpointerenter = (e) => {
        if (selecting && e.buttons === 1) choose(a, true);
      };
      td.onpointerup = () => (selecting = false);
      td.ondblclick = () => edit(td);
      td.onkeydown = (e) => {
        if (td.isContentEditable) {
          if (e.key === "Enter") {
            e.preventDefault();
            td.blur();
          }
          if (e.key === "Escape") {
            td.contentEditable = "false";
            td.textContent = value(d, a);
          }
          return;
        }
        if (e.ctrlKey || e.metaKey) {
          if (e.key.toLowerCase() === "s") {
            e.preventDefault();
            saveBook(s, w);
            drawApp(s, w);
            return;
          }
          if (["z", "y"].includes(e.key.toLowerCase())) {
            e.preventDefault();
            history(e.key.toLowerCase() === "z" && !e.shiftKey);
          }
          return;
        }
        if (e.key === "Enter" || e.key === "F2") {
          e.preventDefault();
          edit(td);
        } else if (e.key.length === 1) {
          e.preventDefault();
          edit(td, e.key);
        } else if (e.key === "Delete") {
          write(a, "");
        } else if (e.key.startsWith("Arrow")) {
          let [x, y] = addr(a);
          x += Number(e.key === "ArrowRight") - Number(e.key === "ArrowLeft");
          y += Number(e.key === "ArrowDown") - Number(e.key === "ArrowUp");
          let b = col(Math.max(0, x)) + (Math.max(0, y) + 1);
          choose(b, e.shiftKey);
          table.querySelector('[data-cell-address="' + b + '"]')?.focus();
        }
      };
      tr.append(td);
    }
    table.append(tr);
  }
  wrap.oncopy = (e) => {
    if (document.activeElement.isContentEditable) return;
    let rr = region(d.cell + ":" + (d.end || d.cell)),
      lines = [];
    for (let y = rr.y; y <= rr.Y; y++) {
      let row = [];
      for (let x = rr.x; x <= rr.X; x++) row.push(value(d, col(x) + (y + 1)));
      lines.push(row.join("\t"));
    }
    let text = lines.join("\n");
    e.clipboardData.setData("text/plain", text);
    e.preventDefault();
    s.clip.unshift(text);
    notify(s, "已复制选区");
  };
  wrap.onpaste = (e) => {
    e.preventDefault();
    write(d.cell, e.clipboardData.getData("text/plain"));
  };
  wrap.append(table);
  body.append(wrap);
  status(
    "工作表 01    /    " +
      (d.dirty ? "● 未保存" : "已保存") +
      "     ·     " +
      (d.committed && d.committed.version < d.version
        ? "重算中"
        : "v" + d.version),
  );
}
function renderWidgets(s, w, body, B, header, panel) {
  header("STATION UTILITIES", "小组件");
  let p = panel();
  p.classList.add("widgetgrid");
  let g = s.widget,
    card = (title, html = "") => {
      let c = el(
        "div",
        "card",
        '<div class="kicker">' + title + "</div>" + html,
      );
      p.append(c);
      return c;
    };
  let date = new Date();
  date.setMonth(date.getMonth() + (g.month || 0), 1);
  let c = card("CALENDAR  /  日历"),
    r = el("div", "row");
  r.append(
    B("‹", () => {
      g.month = (g.month || 0) - 1;
      drawApp(s, w);
    }),
    el(
      "strong",
      "",
      date.getFullYear() + " 年 " + (date.getMonth() + 1) + " 月",
    ),
    B("›", () => {
      g.month = (g.month || 0) + 1;
      drawApp(s, w);
    }),
  );
  c.append(r);
  let cal = el("div", "cal");
  for (let char of "日一二三四五六") cal.append(el("span", "", char));
  for (let i = 0; i < date.getDay(); i++) cal.append(el("span"));
  let days = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  for (let i = 1; i <= days; i++)
    cal.append(
      el(i === new Date().getDate() && !g.month ? "b" : "span", "", i),
    );
  c.append(cal);
  let t = card("TIMER  /  倒计时"),
    val = el("div", "bigtime timerlabel", fmt(g.remain)),
    input = field("number", g.timer, "widget-timer-input", s, w, (v) => {
      g.timer = g.remain = Math.max(0, +v);
      delete g.until;
    });
  input.style.width = "60px";
  t.append(
    val,
    input,
    " 秒 ",
    B(
      "开始",
      () => {
        g.until = s.clock + (g.remain || g.timer);
      },
      "widget-timer-start",
    ),
    B("暂停", () => delete g.until, "widget-timer-pause"),
    B(
      "重置",
      () => {
        delete g.until;
        g.remain = g.timer;
      },
      "widget-timer-reset",
    ),
  );
  let note = card("FIELD NOTE  /  便笺"),
    ta = mark(el("textarea"), "widget-note-text", s, w);
  ta.value = g.note;
  ta.style.width = "100%";
  ta.oninput = () => (g.note = ta.value);
  note.append(
    ta,
    B("保存", () => notify(s, "便笺已保存"), "widget-note-save"),
  );
  let sw = card(
    "STOPWATCH  /  秒表",
    '<div class="bigtime watchlabel">00:00</div>',
  );
  sw.append(
    B(g.swStart != null ? "暂停" : "计时", () => {
      if (g.swStart != null) {
        g.sw = (g.sw || 0) + s.clock - g.swStart;
        delete g.swStart;
      } else g.swStart = s.clock;
      drawApp(s, w);
    }),
    B("归零", () => {
      g.sw = 0;
      delete g.swStart;
    }),
  );
  let clips = card("CLIPBOARD  /  剪贴板");
  clips.append(
    mark(
      el("p", "", esc(s.clip.slice(0, 4).join(" · ") || "暂无复制记录")),
      "widget-clipboard-list",
      s,
      w,
    ),
  );
  let n = card("ACTIVITY  /  通知");
  n.append(
    mark(
      el(
        "p",
        "",
        esc(
          s.notifications
            .slice(0, 3)
            .map((x) => x.msg)
            .join(" · ") || "暂无通知",
        ),
      ),
      "widget-notifications",
      s,
      w,
    ),
    B(s.settings.dnd ? "免打扰已开" : "免打扰已关", () => {
      s.settings.dnd = !s.settings.dnd;
      drawApp(s, w);
    }),
  );
}
function browserApp(s, w, body) {
  let d = w.data;
  d.tabs ??= [
    {
      id: "tab-1",
      url: "https://www.bilibili.com/",
      title: "哔哩哔哩",
      loadState: "loading",
    },
  ];
  d.seq ??= 1;
  let tabs = el("div", "browsertabs"),
    nav = el("div", "toolbar"),
    area = el("div", "guestarea"),
    st = el("div", "status");
  body.append(tabs, nav, area, st);
  let gs = {},
    current = () => d.tabs.find((t) => t.id === d.active) || d.tabs[0],
    B = (l, f, t) => btn(l, f, t, s, w),
    addr = field("text", "", "browser-address", s, w);
  addr.className = "fileinput";
  let go = () => {
    let u = addr.value.trim();
    if (!/^https?:\/\//i.test(u)) u = "https://" + u;
    gs[current().id].src = u;
  };
  addr.onkeydown = (e) => {
    if (e.key === "Enter") go();
  };
  nav.append(
    B("←", () => gs[current().id].goBack(), "browser-back"),
    B("→", () => gs[current().id].goForward(), "browser-forward"),
    B("↻", () => gs[current().id].reload(), "browser-reload"),
    B("停止", () => gs[current().id].stop()),
    addr,
    B("前往", go, "browser-go"),
  );
  function sync() {
    tabs.replaceChildren();
    for (let t of d.tabs) {
      let b = B(
        esc(t.title || "新标签"),
        () => {
          d.active = t.id;
          sync();
        },
        "browser-tab",
      );
      b.dataset.tabId = t.id;
      b.className = current() === t ? "tabactive" : "";
      tabs.append(b);
      gs[t.id].style.display = current() === t ? "flex" : "none";
    }
    tabs.append(
      B("＋", () => add("https://www.bilibili.com/"), "browser-new-tab"),
      B(
        "×",
        () => {
          let t = current();
          gs[t.id].remove();
          delete gs[t.id];
          d.tabs = d.tabs.filter((q) => q !== t);
          if (!d.tabs.length) closeWindow(s, w, true);
          else sync();
        },
        "browser-close-tab",
      ),
    );
    if (document.activeElement !== addr) addr.value = current().url;
    st.textContent =
      current().loadState === "error"
        ? "网页加载失败 · " + (current().error || "") + " · 可刷新重试"
        : current().loadState === "loading"
          ? "正在连接…"
          : "页面已就绪";
  }
  function mount(t) {
    let g = el("webview");
    gs[t.id] = g;
    g.setAttribute("partition", "persist:strata-browser");
    g.setAttribute("allowpopups", "");
    g.setAttribute(
      "webpreferences",
      "backgroundThrottling=no,contextIsolation=yes,sandbox=yes",
    );
    g.addEventListener("dom-ready", () => {
      t.guestId = g.getWebContentsId();
    });
    g.addEventListener("page-title-updated", (e) => {
      t.title = e.title;
      sync();
    });
    for (let k of ["did-navigate", "did-navigate-in-page"])
      g.addEventListener(k, (e) => {
        if (e.isMainFrame !== false) {
          t.url = e.url;
          sync();
        }
      });
    g.addEventListener("did-start-loading", () => {
      t.loadState = "loading";
      sync();
    });
    g.addEventListener("did-stop-loading", () => {
      if (t.loadState !== "error") t.loadState = "ready";
      sync();
    });
    g.addEventListener("did-fail-load", (e) => {
      if (e.isMainFrame && e.errorCode !== -3) {
        t.loadState = "error";
        t.error = e.errorDescription;
        sync();
      }
    });
    g.src = t.url;
    area.append(g);
  }
  function add(url) {
    let t = {
      id: "tab-" + ++d.seq,
      url,
      loadState: "loading",
      title: "新标签页",
    };
    d.tabs.push(t);
    d.active = t.id;
    mount(t);
    sync();
  }
  for (let t of d.tabs) mount(t);
  views[w.id].newTab = add;
  sync();
}
window.guestNavigation?.onOpen((id, url) => {
  for (let s of Object.values(systems))
    for (let w of s.wins)
      if (w.appId === "browser" && w.data.tabs.some((t) => t.guestId === id))
        views[w.id]?.newTab(url);
});

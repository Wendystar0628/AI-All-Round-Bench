import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import Icon from "./icons";
import Apps from "./apps";
import { Engine, clone, names } from "./runtime.cjs";
export let engine;
export const Btn = ({ icon, children, test, ...rest }) => (
  <button data-testid={test} {...rest}>
    {icon && <Icon name={icon} size={16} />}
    <span>{children}</span>
  </button>
);
function stampControls() {
  document
    .querySelectorAll("button,input,select,textarea,[data-testid]")
    .forEach((el) => {
      const win = el.closest('[data-testid="app-window"]'),
        desk = el.closest('[data-testid="os-desktop"]');
      const ownWin =
        win && win.closest('[data-testid="os-desktop"]') === desk ? win : null;
      if (desk)
        el.dataset.systemId = ownWin?.dataset.systemId || desk.dataset.systemId;
      if (ownWin) el.dataset.windowId = ownWin.dataset.windowId;
      else delete el.dataset.windowId;
      if (
        el.tagName === "BUTTON" &&
        !el.hasAttribute("aria-label") &&
        el.textContent.trim()
      )
        el.setAttribute("aria-label", el.textContent.trim());
    });
}
const stamping = new MutationObserver(() => stampControls());
stamping.observe(document.getElementById("root"), {
  childList: true,
  subtree: true,
});
const colors = {
  files: "#b99853",
  spreadsheet: "#538376",
  browser: "#657f9f",
  systems: "#8f7ea8",
  player: "#7f73a3",
  charts: "#b2806a",
  editor: "#708391",
  widgets: "#bd975b",
  tasks: "#678f91",
  settings: "#8e86a5",
  help: "#8d9a7f",
};
function App() {
  const [, refresh] = useState(0);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    (async () => {
      engine = new Engine(await window.host?.load());
      engine.on(() => refresh((x) => x + 1));
      window.engine = engine;
      window.bench = {
        version: 1,
        ready: async () => true,
        reset: async () => {
          engine = new Engine();
          engine.on(() => refresh((x) => x + 1));
          window.engine = engine;
          refresh((x) => x + 1);
          await window.host?.save(engine.state);
          return true;
        },
        inspect: async () => engine.inspect(),
      };
      setReady(true);
    })();
    let timer = setInterval(() => engine?.tick(), 100);
    let save = setInterval(() => {
      if (engine?.dirty) {
        window.host?.save(engine.state);
        engine.dirty = false;
      }
    }, 3000);
    return () => {
      clearInterval(timer);
      clearInterval(save);
    };
  }, []);
  if (!ready)
    return (
      <div className="loading">
        NEST<span>正在唤醒桌面</span>
      </div>
    );
  return <Desktop s={engine.get("outer")} />;
}
export function Desktop({ s }) {
  const [menu, setMenu] = useState(false),
    [search, setSearch] = useState(""),
    [context, setContext] = useState(null),
    [selected, setSelected] = useState(null),
    [notes, setNotes] = useState(false),
    [dismissed, setDismissed] = useState(null);
  const ref = useRef();
  let root = s.id === "outer";
  const apps = root
    ? [
        "files",
        "browser",
        "spreadsheet",
        "systems",
        "widgets",
        "editor",
        "tasks",
        "settings",
        "help",
      ]
    : ["player", "charts", "systems", "files", "editor", "tasks", "help"];
  useEffect(() => {
    let key = (e) => {
      if (e.key === "Escape") {
        setMenu(false);
        setContext(null);
        setNotes(false);
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, []);
  function launch(a) {
    engine.launchApp(s, a);
    setMenu(false);
  }
  const newSystem = () => engine.newSystem(s);
  return (
    <div
      ref={ref}
      className={
        "desktop " +
        (root ? "root-desktop" : "inner-desktop") +
        " wallpaper-" +
        s.settings.wallpaper
      }
      data-testid="os-desktop"
      data-system-id={s.id}
      style={{ "--accent": s.settings.accent, "--ui-scale": s.settings.scale }}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) {
          setMenu(false);
          setContext(null);
          setSelected(null);
        }
      }}
      onContextMenu={(e) => {
        if (e.target.closest('[data-testid="app-window"]')) return;
        e.preventDefault();
        e.stopPropagation();
        let b = ref.current.getBoundingClientRect();
        setContext({ x: e.clientX - b.left, y: e.clientY - b.top });
      }}
    >
      <header className="desktop-heading">
        <div className="brand">
          <Icon name="leaf" size={19} />
          <b>栖境</b>
          <span>NEST OS</span>
          <i>/</i>
          <span>{root ? "主桌面" : s.id}</span>
        </div>
        <div className="desktop-meta">
          <span
            className={"status-dot " + (!engine.active(s) ? "off" : "")}
          ></span>
          {s.state === "paused"
            ? "已暂停"
            : s.state === "error"
              ? "内核错误"
              : s.parentId &&
                  !s.processes.some(
                    (p) => p.kind === "wm" && p.state !== "compiling",
                  )
                ? "桌面程序启动中"
                : "系统就绪"}
          <span className="meta-separator">·</span>
          <span>
            {root ? "LOCAL WORKSPACE" : "L" + depth(s) + " / " + s.parentId}
          </span>
          <button
            className="new-system"
            data-testid="system-new"
            onClick={newSystem}
          >
            <Icon name="plus" size={14} />
            新建子系统
          </button>
        </div>
      </header>
      <div className="desktop-icons">
        {apps.slice(0, root ? 7 : 6).map((a) => (
          <button
            key={a}
            className={"desktop-icon " + (selected === a ? "selected" : "")}
            data-testid="desktop-icon"
            data-app-id={a}
            aria-label={names[a]}
            onClick={() => setSelected(a)}
            onDoubleClick={() => launch(a)}
            style={{ "--icon-color": colors[a] }}
          >
            <span className="app-icon">
              <Icon name={a} size={28} />
            </span>
            <span>{names[a]}</span>
          </button>
        ))}
        {root && (
          <button
            className={
              "desktop-icon " + (selected === "scene" ? "selected" : "")
            }
            data-testid="desktop-icon"
            data-file-path="/Demo/helicopter-24.scene"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(
                "application/nest-file",
                JSON.stringify({
                  systemId: s.id,
                  path: "/Demo/helicopter-24.scene",
                }),
              );
            }}
            onClick={() => setSelected("scene")}
            onDoubleClick={() =>
              engine.launchApp(s, "editor", {
                path: "/Demo/helicopter-24.scene",
              })
            }
          >
            <span className="app-icon scene-file">
              <Icon name="player" size={26} />
              <small>SCENE</small>
            </span>
            <span>山谷回声.scene</span>
          </button>
        )}
      </div>
      {root && (
        <aside className="desktop-welcome">
          <div className="eyebrow">A LITTLE SPACE TO EXPLORE</div>
          <h1>
            世界之中，
            <br />
            还有世界。
          </h1>
          <p>一张桌面，无限可能。</p>
          <div className="welcome-line"></div>
          <div className="welcome-date">
            <span>11</span>
            <div>
              月 / NOVEMBER
              <br />
              <b>在这里，让想法生长。</b>
            </div>
          </div>
          <button onClick={() => launch("systems")}>
            打开系统树 <span>↗</span>
          </button>
        </aside>
      )}
      {!root && (
        <div className="inner-watermark">
          <b>{s.id}</b>
          <span>独立时钟 · 独立进程 · 无限嵌套</span>
        </div>
      )}
      <main className="window-space">
        {[...s.windows]
          .sort((a, b) => +a.id.slice(1) - b.id.slice(1))
          .map((w) => (
            <Window
              key={w.id}
              s={s}
              w={w}
              z={10 + s.windows.indexOf(w)}
              desktop={ref}
            />
          ))}
      </main>
      {s.state === "error" && (
        <div className="kernel-error" data-testid="kernel-error">
          <h2>内核已停止</h2>
          <p>{s.error}</p>
          <p>在父系统中修复内核源文件，然后重启。其他系统仍可正常操作。</p>
        </div>
      )}
      {s.state === "paused" && (
        <div className="paused-banner">
          <Icon name="pause" size={14} />
          系统已暂停 · 由父系统继续或单步
        </div>
      )}
      {!s.settings.dnd &&
        s.notifications[0] &&
        s.notifications[0].id !== dismissed &&
        s.time - s.notifications[0].time < 3 && (
          <div className="notification-toast" role="status" aria-live="polite">
            <Icon name="bell" size={17} />
            <div>
              {s.notifications[0].text}
              <small>{s.id} · 通知中心已记录</small>
            </div>
            <button
              aria-label="收起通知"
              onClick={() => setDismissed(s.notifications[0].id)}
            >
              ×
            </button>
          </div>
        )}
      {menu && (
        <div className="start-menu" data-testid="start-menu">
          <div className="menu-profile">
            <span className="profile-monogram">栖</span>
            <div>
              <b>{s.name}</b>
              <small>{s.id} · 你的独立工作空间</small>
            </div>
          </div>
          <div className="searchbox">
            <Icon name="search" size={16} />
            <input
              placeholder="搜索应用与工具"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>
          <div className="menu-section">
            所有应用 <span>{apps.length}</span>
          </div>
          <div className="start-apps">
            {apps
              .filter((a) => names[a].includes(search))
              .map((a) => (
                <button
                  key={a}
                  data-testid={"launch-" + a}
                  onClick={() => launch(a)}
                >
                  <span style={{ color: colors[a] }}>
                    <Icon name={a} />
                  </span>
                  {names[a]}
                  <small>↗</small>
                </button>
              ))}
          </div>
          <div className="menu-footer">
            <span>
              <i className="status-dot" /> 运行中 ·{" "}
              {s.processes.filter((p) => p.state !== "ended").length} 个进程
            </span>
            <button
              onClick={() => {
                setMenu(false);
                engine.launchApp(s, "settings");
              }}
            >
              <Icon name="settings" size={17} />
            </button>
          </div>
        </div>
      )}
      {context && (
        <div
          className="context-menu"
          style={{
            left: context.x,
            top: Math.min(context.y, (ref.current?.clientHeight || 600) - 220),
          }}
        >
          <b>{s.name}</b>
          <button
            onClick={() => {
              newSystem();
              setContext(null);
            }}
          >
            <Icon name="systems" size={16} />
            新建子系统
          </button>
          <button
            onClick={() => {
              launch("files");
              setContext(null);
            }}
          >
            <Icon name="files" size={16} />
            打开文件管理器
          </button>
          <button
            onClick={() => {
              launch("settings");
              setContext(null);
            }}
          >
            <Icon name="settings" size={16} />
            个性化桌面
          </button>
          <button onClick={() => setContext(null)}>
            刷新桌面 <small>F5</small>
          </button>
        </div>
      )}
      {notes && (
        <div className="notification-panel">
          <div className="panel-heading">
            <h3>通知中心</h3>
            <button
              onClick={() => {
                s.notifications = [];
                engine.changed();
              }}
            >
              清空
            </button>
          </div>
          <label className="toggle-line">
            免打扰
            <input
              type="checkbox"
              checked={s.settings.dnd}
              onChange={(e) => {
                s.settings.dnd = e.target.checked;
                engine.changed();
              }}
            />
          </label>
          {s.notifications.length ? (
            s.notifications.slice(0, 12).map((n) => (
              <div className="notice" key={n.id}>
                <Icon name="bell" size={17} />
                <div>
                  {n.text}
                  <small>
                    {formatTime(n.time)} · {s.id}
                  </small>
                </div>
              </div>
            ))
          ) : (
            <div className="empty-state">
              一切井然有序
              <br />
              <small>新的通知将在这里出现</small>
            </div>
          )}
        </div>
      )}
      <footer className="taskbar">
        <button
          className={"start-button " + (menu ? "active" : "")}
          aria-label="开始"
          data-testid="start-toggle"
          onClick={() => {
            setMenu(!menu);
            setNotes(false);
          }}
        >
          <Icon name="grid" size={21} />
        </button>
        <div className="taskbar-divider" />
        {[
          "files",
          root ? "browser" : "player",
          root ? "spreadsheet" : "charts",
        ].map((a) => (
          <button
            key={a}
            className="pinned"
            aria-label={names[a]}
            style={{ color: colors[a] }}
            onClick={() => {
              const w = s.windows.find((x) => x.appId === a);
              if (w) {
                engine.focus(s, w);
              } else launch(a);
            }}
          >
            <Icon name={a} size={21} />
          </button>
        ))}
        <div className="taskbar-divider" />
        <div className="running-tasks">
          {s.windows.map((w) => (
            <button
              key={w.id}
              data-testid="taskbar-item"
              data-window-id={w.id}
              className={
                (s.focus === w.id && !w.minimized ? "active " : "") +
                (w.minimized ? "minimized" : "")
              }
              title={w.title}
              onClick={() => {
                if (s.focus === w.id && !w.minimized)
                  engine.patchWindow(s, w, { minimized: true });
                else engine.focus(s, w);
                engine.changed();
              }}
            >
              <Icon
                name={
                  w.appId === "system"
                    ? "systems"
                    : w.appId === "projection"
                      ? w.sourceAppId
                      : w.appId
                }
                size={17}
              />
              <span>{w.appId === "system" ? w.target : w.title}</span>
            </button>
          ))}
        </div>
        <button
          className="tray-widget"
          data-testid="widgets-toggle"
          aria-label="小组件"
          onClick={() => launch("widgets")}
        >
          <Icon name="widgets" size={17} />
        </button>
        <span className="tray-language">中</span>
        <div className="tray-clock">
          <b>{formatTime(s.time)}</b>
          <span>2026/11/09</span>
        </div>
        <button
          className="notification-toggle"
          data-testid="notifications-toggle"
          aria-label="通知中心"
          onClick={() => {
            setNotes(!notes);
            setMenu(false);
          }}
        >
          <Icon name="bell" size={18} />
          {s.notifications.length > 0 && <i />}
        </button>
      </footer>
    </div>
  );
}
function depth(s) {
  return s.parentId ? 1 + depth(engine.get(s.parentId)) : 1;
}
export function formatTime(t) {
  return new Date((9 * 3600 + t) * 1000).toISOString().slice(11, 19);
}
function Window({ s, w, z, desktop }) {
  const [box, setBox] = useState({ width: 1600, height: 950 }),
    [project, setProject] = useState(false),
    [confirm, setConfirm] = useState(false);
  const bodyRef = useRef();
  useEffect(() => {
    let d = desktop.current;
    if (!d) return;
    const ob = new ResizeObserver(() =>
      setBox({ width: d.clientWidth, height: d.clientHeight - 49 }),
    );
    ob.observe(d);
    return () => ob.disconnect();
  }, []);
  let width = Math.min(w.width, Math.max(300, box.width - 24)),
    height = Math.min(w.height, Math.max(230, box.height - 45)),
    x = Math.min(w.x, Math.max(0, box.width - width - 8)),
    y = Math.min(w.y, Math.max(0, box.height - height - 4));
  if (s.parentId && w.appId !== "system" && !w.adjusted) {
    width = Math.min(w.width, Math.max(300, box.width - 122));
    height = Math.min(w.height, Math.max(230, box.height - 56));
    x = 112;
    y = 48;
  }
  if (w.appId === "system" && s.parentId && !w.adjusted) {
    width = Math.max(360, box.width - 105);
    height = Math.max(260, box.height - 48);
    x = 97;
    y = 44;
  }
  if (w.maximized)
    ((x = 0), (y = 0), (width = box.width), (height = box.height));
  const move = (e, resize = false) => {
    if (e.button !== 0 || e.target.closest("button,input,select")) return;
    e.stopPropagation();
    engine.focus(s, w);
    let start = {
      x: e.clientX,
      y: e.clientY,
      wx: x,
      wy: y,
      ww: width,
      wh: height,
    };
    let scale =
      desktop.current.getBoundingClientRect().width /
      desktop.current.clientWidth;
    const update = (ev) => {
      let dx = (ev.clientX - start.x) / scale,
        dy = (ev.clientY - start.y) / scale;
      if (resize) {
        engine.patchWindow(s, w, {
          adjusted: true,
          width: Math.max(340, Math.min(box.width - start.wx, start.ww + dx)),
          height: Math.max(240, Math.min(box.height - start.wy, start.wh + dy)),
        });
      } else {
        engine.patchWindow(s, w, {
          adjusted: true,
          maximized: false,
          x: Math.max(0, Math.min(box.width - 150, start.wx + dx)),
          y: Math.max(0, Math.min(box.height - 40, start.wy + dy)),
        });
      }
      engine.changed();
    };
    const finish = (ev) => {
      document.removeEventListener("pointermove", update);
      document.removeEventListener("pointerup", finish);
      if (!resize) {
        let b = desktop.current.getBoundingClientRect();
        if (ev.clientX - b.left < 15) {
          engine.patchWindow(s, w, {
            adjusted: true,
            x: 0,
            y: 0,
            width: box.width / 2,
            height: box.height,
          });
        } else if (b.right - ev.clientX < 15) {
          engine.patchWindow(s, w, {
            adjusted: true,
            x: box.width / 2,
            y: 0,
            width: box.width / 2,
            height: box.height,
          });
        }
        engine.changed();
      }
    };
    document.addEventListener("pointermove", update);
    document.addEventListener("pointerup", finish, { once: true });
  };
  if (w.minimized) return null;
  let source =
    w.appId === "projection" ? engine.findWindow(w.sourceWindowId) : { s, w };
  if (!source) return null;
  const ancestors = [];
  let a = s;
  while (a.parentId) {
    a = engine.get(a.parentId);
    ancestors.push(a);
  }
  const doClose = () => {
    if (w.appId === "system" || w.dirty) {
      setConfirm(true);
      return;
    }
    engine.requestClose(s, w);
  };
  return (
    <section
      ref={bodyRef}
      className={
        "app-window " +
        (s.focus === w.id ? "focused " : "") +
        (w.appId === "system" ? "system-window " : "") +
        (w.maximized ? "maximized" : "")
      }
      data-testid="app-window"
      data-app-id={w.appId}
      data-window-id={w.id}
      data-system-id={s.id}
      data-source-system-id={w.sourceSystemId}
      data-source-window-id={w.sourceWindowId}
      data-source-app-id={w.sourceAppId}
      style={{ left: x, top: y, width, height, zIndex: z }}
      onPointerDown={(e) => {
        e.stopPropagation();
        if (s.focus !== w.id) engine.focus(s, w);
      }}
    >
      <div
        className="titlebar"
        data-testid="window-titlebar"
        onPointerDown={move}
        onDoubleClick={(e) => {
          if (!e.target.closest("button")) {
            engine.patchWindow(s, w, { maximized: !w.maximized });
            engine.changed();
          }
        }}
      >
        <Icon
          name={
            w.appId === "system"
              ? "systems"
              : w.appId === "projection"
                ? w.sourceAppId
                : w.appId
          }
          size={16}
        />
        <span className="window-title">
          {w.title}
          {w.dirty ? " *" : ""}
        </span>
        <span className="window-owner">
          {w.appId === "projection" ? w.sourceSystemId : s.id}
        </span>
        {["player", "charts"].includes(w.appId) && s.parentId && (
          <button
            className="project-button"
            data-testid="window-project"
            onClick={() => setProject(!project)}
          >
            <Icon name="project" size={14} />
            投送
          </button>
        )}
        <div className="window-actions">
          <button
            aria-label="最小化"
            data-testid="window-minimize"
            onClick={() => {
              engine.patchWindow(s, w, { minimized: true });
              engine.changed();
            }}
          >
            —
          </button>
          <button
            aria-label="最大化或还原"
            data-testid="window-maximize"
            onClick={() => {
              engine.patchWindow(s, w, { maximized: !w.maximized });
              engine.changed();
            }}
          >
            <span className="maximize-glyph" />
          </button>
          <button
            className="close-button"
            aria-label="关闭"
            data-testid="window-close"
            onClick={doClose}
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      </div>
      {w.appId === "projection" && (
        <div className="projection-bar">
          <Icon name="project" size={13} />
          实时投送 · {w.sourceSystemId} / {names[w.sourceAppId]}
          <span>{engine.active(source.s) ? "已连接" : "源系统已暂停"}</span>
        </div>
      )}
      <div
        className={"window-body " + (w.appId === "system" ? "nested-body" : "")}
        data-system-id={s.id}
        data-window-id={w.id}
      >
        {w.appId === "system" ? (
          <Desktop s={engine.get(w.target)} />
        ) : (
          <fieldset
            className="app-input-gate"
            disabled={!engine.active(source.s)}
          >
            <Apps
              s={source.s}
              w={w.appId === "projection" ? clone(source.w) : source.w}
              target={w}
            />
          </fieldset>
        )}
      </div>
      {!w.maximized && (
        <div
          className="resize-handle"
          data-testid="window-resize"
          onPointerDown={(e) => move(e, true)}
        />
      )}
      {project && (
        <div className="project-menu">
          <b>投送到祖先桌面</b>
          {ancestors.map((a) => (
            <button
              key={a.id}
              data-testid="project-target"
              data-target-system-id={a.id}
              onClick={() => {
                engine.project(s, w, a.id);
                setProject(false);
              }}
            >
              <Icon name="project" size={17} />
              {a.name}
              <small>{a.id}</small>
            </button>
          ))}
        </div>
      )}
      {confirm && (
        <div className="modal-backdrop">
          <div className="modal">
            <Icon name={w.appId === "system" ? "systems" : "save"} size={27} />
            <h3>
              {w.appId === "system" ? "停止整个子系统？" : "保存未完成的更改？"}
            </h3>
            <p>
              {w.appId === "system"
                ? "该系统及其后代的程序将停止，其他系统不受影响。"
                : "保存后可从文件管理器重新打开。"}
            </p>
            <div className="modal-buttons">
              <Btn onClick={() => setConfirm(false)}>取消</Btn>
              {w.dirty && (
                <Btn
                  onClick={() => {
                    if (w.appId === "spreadsheet") engine.saveSheet(s, w);
                    else {
                      engine.write(s, w.path, w.text);
                      w.dirty = false;
                    }
                    engine.requestClose(s, w);
                  }}
                >
                  保存并关闭
                </Btn>
              )}
              <Btn
                className="primary"
                onClick={() => engine.requestClose(s, w)}
              >
                {w.dirty ? "放弃并关闭" : "停止子树"}
              </Btn>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
createRoot(document.getElementById("root")).render(<App />);

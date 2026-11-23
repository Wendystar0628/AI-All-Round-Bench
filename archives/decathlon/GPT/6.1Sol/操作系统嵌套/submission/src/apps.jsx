import React, { useState, useEffect, useRef } from "react";
import Icon from "./icons";
import Stage from "./stage";
import ProgramDisplay from "./program-display";
import { engine, Btn, formatTime } from "./main";
import {
  clone,
  size,
  cellValue,
  column,
  parseAddress,
  names,
} from "./runtime.cjs";
export default function Apps({ s, w, target }) {
  if (w.display) return <ProgramDisplay s={s} w={w} />;
  let app = w.appId;
  switch (app) {
    case "files":
      return <Files s={s} w={w} />;
    case "spreadsheet":
      return <Sheet s={s} w={w} />;
    case "systems":
      return <Systems s={s} />;
    case "tasks":
      return <Tasks s={s} />;
    case "editor":
      return <Editor s={s} w={w} />;
    case "widgets":
      return <Widgets s={s} />;
    case "settings":
      return <Settings s={s} />;
    case "browser":
      return <Browser s={s} w={w} />;
    case "player":
      return <Player s={s} w={w} />;
    case "charts":
      return <Charts s={s} w={w} />;
    case "help":
      return <Help />;
    default:
      return <div>应用未安装</div>;
  }
}
function Toolbar({ children }) {
  return <div className="toolbar">{children}</div>;
}
function Status({ children }) {
  return <div className="statusbar">{children}</div>;
}
function fileType(path, f) {
  return f?.dir
    ? "文件夹"
    : path.endsWith(".sheet")
      ? "工作簿"
      : path.endsWith(".scene")
        ? "三维场景"
        : path.endsWith(".snapshot")
          ? "系统快照"
          : path.endsWith(".nest")
            ? "Nest 程序"
            : "文本文件";
}
function fileIcon(path, f) {
  return f?.dir
    ? "files"
    : path.endsWith(".sheet")
      ? "spreadsheet"
      : path.endsWith(".scene")
        ? "player"
        : path.endsWith(".snapshot")
          ? "systems"
          : "editor";
}
function Files({ s, w }) {
  const [name, setName] = useState(""),
    [mode, setMode] = useState(null),
    [drop, setDrop] = useState(false),
    [context, setContext] = useState(null);
  const path = w.path;
  const [pathDraft, setPathDraft] = useState(path);
  useEffect(() => setPathDraft(path), [path]);
  const entries = (w.entries || [])
    .filter((p) => s.files[p])
    .map((p) => [p, s.files[p]]);
  const nav = (p) => {
    engine.event(s, w, "navigate", { path: p });
  };
  const open = (p) => {
    engine.event(s, w, "open", { path: p });
  };
  function action() {
    let p = path.replace(/\/$/, "") + "/" + name.trim();
    if (!name.trim() || name.includes("/")) return;
    if (mode === "rename") {
      let old = w.selected[0];
      if (s.files[p]) {
        engine.notify(s, "该名称已存在");
        return;
      }
      engine.event(s, w, "rename", { from: old, to: p });
    } else {
      if (s.files[p]) {
        engine.notify(s, "该名称已存在");
        return;
      }
      engine.event(s, w, "create", {
        name: name.trim(),
        dir: mode === "folder",
      });
    }
    setMode(null);
    setName("");
  }
  const remove = () => {
    engine.event(s, w, "delete", { paths: w.selected });
    setContext(null);
  };
  return (
    <div className="files-app app-flex">
      <Toolbar>
        <Btn
          icon="plus"
          test="files-new-file"
          onClick={() => {
            setMode("file");
            setName("新建文档.txt");
          }}
        >
          新建文件
        </Btn>
        <Btn
          icon="files"
          test="files-new-folder"
          onClick={() => {
            setMode("folder");
            setName("新建文件夹");
          }}
        >
          文件夹
        </Btn>
        <i />
        <Btn
          icon="editor"
          disabled={!w.selected.length}
          onClick={() => {
            setMode("rename");
            setName(w.selected[0]?.split("/").pop() || "");
          }}
        >
          重命名
        </Btn>
        <Btn
          test="files-copy"
          disabled={!w.selected.length}
          onClick={() => {
            engine.fileClipboard = { systemId: s.id, paths: clone(w.selected) };
            engine.notify(s, "已复制 " + w.selected.length + " 项");
          }}
        >
          复制
        </Btn>
        <Btn
          disabled={!w.selected.length}
          onClick={() => {
            engine.fileClipboard = {
              systemId: s.id,
              paths: clone(w.selected),
              cut: true,
            };
            engine.notify(s, "已剪切所选文件");
          }}
        >
          剪切
        </Btn>
        <Btn
          test="files-paste"
          onClick={() => {
            let c = engine.fileClipboard;
            if (c) {
              c.paths.forEach((p) => {
                const from = engine.get(c.systemId);
                if (
                  c.systemId === s.id &&
                  p.slice(0, p.lastIndexOf("/")) === path
                )
                  return;
                if (engine.copyFile(from, p, s, path, true) && c.cut) {
                  Object.keys(from.files)
                    .filter((key) => key === p || key.startsWith(p + "/"))
                    .forEach((key) => delete from.files[key]);
                }
              });
              if (c.cut) engine.fileClipboard = null;
            }
          }}
        >
          粘贴
        </Btn>
        <Btn icon="trash" onClick={remove} disabled={!w.selected.length}>
          删除
        </Btn>
      </Toolbar>
      <div className="file-address">
        <button
          aria-label="上一级"
          onClick={() => nav(path.split("/").slice(0, -1).join("/") || "/")}
        >
          ↑
        </button>
        <Icon name="files" size={16} />
        <input
          data-testid="files-path"
          value={pathDraft}
          onChange={(e) => setPathDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") nav(pathDraft);
          }}
        />
        <span>{s.id}</span>
      </div>
      <div className="files-main">
        <nav className="files-sidebar">
          <small>工作空间</small>
          {[
            ["/Demo", "演示资源", "player"],
            ["/Documents", "文档", "editor"],
            ["/Downloads", "下载", "files"],
            ["/Programs", "程序", "tasks"],
            ["/System", "系统内核", "systems"],
            ["/Snapshots", "快照", "clock"],
            ["/Recycle", "回收站", "trash"],
          ].map(([p, t, i]) => (
            <button
              key={p}
              data-testid="files-nav"
              data-file-path={p}
              className={path === p ? "active" : ""}
              onClick={() => nav(p)}
            >
              <Icon name={i} size={17} />
              {t}
            </button>
          ))}
          <div className="storage-meter">
            <small>本地存储</small>
            <div>
              <span
                style={{
                  width: Math.min(100, (size(s.files) / s.storage) * 100) + "%",
                }}
              />
            </div>
            <small>
              {(size(s.files) / 1024).toFixed(0)} KB /{" "}
              {(s.storage / 1e6).toFixed(0)} MB
            </small>
          </div>
        </nav>
        <div
          className={"files-content " + (drop ? "drag-over" : "")}
          data-testid="files-list"
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes("application/nest-file")) {
              e.preventDefault();
              e.stopPropagation();
              setDrop(true);
            }
          }}
          onDragLeave={() => setDrop(false)}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDrop(false);
            try {
              let d = JSON.parse(
                e.dataTransfer.getData("application/nest-file"),
              );
              let r = engine.copyFile(engine.get(d.systemId), d.path, s, path);
              if (r?.exists) {
                setMode({ overwrite: d });
                setName(r.exists);
              }
            } catch {}
          }}
        >
          <div className="file-list-head">
            <span>名称</span>
            <span>类型</span>
            <span>大小</span>
          </div>
          {entries.map(([p, f]) => (
            <div
              key={p}
              className={
                "file-row " + (w.selected.includes(p) ? "selected" : "")
              }
              data-testid="files-item"
              data-file-path={p}
              draggable
              onDragStart={(e) => {
                e.stopPropagation();
                e.dataTransfer.setData(
                  "application/nest-file",
                  JSON.stringify({ systemId: s.id, path: p }),
                );
              }}
              onClick={(e) => {
                w.selected = e.ctrlKey
                  ? w.selected.includes(p)
                    ? w.selected.filter((x) => x !== p)
                    : [...w.selected, p]
                  : [p];
                engine.changed();
              }}
              onDoubleClick={() => open(p)}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                w.selected = [p];
                let b = e.currentTarget
                  .closest(".files-app")
                  .getBoundingClientRect();
                setContext({
                  x: e.clientX - b.left,
                  y: Math.min(e.clientY - b.top, b.height - 190),
                });
                engine.changed();
              }}
            >
              <span>
                <Icon name={fileIcon(p, f)} size={22} />
                {p.split("/").pop()}
              </span>
              <span>{fileType(p, f)}</span>
              <span>
                {f.dir
                  ? "—"
                  : Math.max(1, (f.text?.length || 0) / 1024).toFixed(1) +
                    " KB"}
              </span>
            </div>
          ))}
          {!entries.length && (
            <div className="empty-state">
              <Icon name="files" size={40} />
              <p>这里还是空的</p>
              <small>拖入来自其他系统的文件，或新建一个。</small>
            </div>
          )}
          {drop && (
            <div className="drop-indicator">
              复制到 {s.id} · {path}
            </div>
          )}
        </div>
      </div>
      {context && (
        <div
          className="context-menu file-context"
          style={{ left: context.x, top: context.y }}
        >
          <button
            onClick={() => {
              open(w.selected[0]);
              setContext(null);
            }}
          >
            打开
          </button>
          <button
            onClick={() => {
              engine.fileClipboard = {
                systemId: s.id,
                paths: clone(w.selected),
              };
              setContext(null);
            }}
          >
            复制
          </button>
          <button
            onClick={() => {
              setMode("rename");
              setName(w.selected[0].split("/").pop());
              setContext(null);
            }}
          >
            重命名
          </button>
          <button onClick={remove}>删除</button>
          <button onClick={() => setContext(null)}>取消</button>
        </div>
      )}
      {mode && (
        <div className="inline-file-dialog">
          {typeof mode === "object" ? (
            <>
              <span>同名文件已存在，覆盖？</span>
              <Btn
                onClick={() => {
                  let d = mode.overwrite;
                  engine.copyFile(
                    engine.get(d.systemId),
                    d.path,
                    s,
                    path,
                    true,
                  );
                  setMode(null);
                }}
              >
                确认覆盖
              </Btn>
            </>
          ) : (
            <>
              <span>{mode === "rename" ? "重命名" : "新建"}</span>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") action();
                }}
              />
              <Btn className="primary" onClick={action}>
                确定
              </Btn>
            </>
          )}
          <Btn onClick={() => setMode(null)}>取消</Btn>
        </div>
      )}
      <Status>
        <span>
          {entries.length} 个项目 · 已选择 {w.selected.length} 项
        </span>
        <div className="status-actions">
          {path === "/Recycle" && (
            <button
              onClick={() => {
                engine.event(s, w, "restore", { paths: w.selected });
              }}
            >
              恢复所选
            </button>
          )}
          <button
            data-testid="files-open"
            onClick={() => w.selected[0] && open(w.selected[0])}
          >
            打开
          </button>
          <button
            onClick={async () => {
              let f = await window.host?.import();
              if (f) engine.write(s, path + "/" + f.name, f.text);
            }}
          >
            从本机导入
          </button>
          <button
            onClick={() => {
              let p = w.selected[0];
              if (p) window.host?.export(p.split("/").pop(), s.files[p].text);
            }}
          >
            保存到本机
          </button>
        </div>
      </Status>
    </div>
  );
}
function Sheet({ s, w }) {
  const [formula, setFormula] = useState(w.sheet.cells[w.selection] || "");
  useEffect(
    () => setFormula(w.sheet.cells[w.selection] || ""),
    [w.selection, w.version],
  );
  const range = () => {
    const a = parseAddress(w.selection),
      b = parseAddress(w.selectionEnd || w.selection);
    let rows = [];
    for (let r = Math.min(a.r, b.r); r <= Math.max(a.r, b.r); r++) {
      let vals = [];
      for (let c = Math.min(a.c, b.c); c <= Math.max(a.c, b.c); c++)
        vals.push(String(cellValue(w.sheet.cells, column(c) + r)));
      rows.push(vals.join("\t"));
    }
    return rows.join("\n");
  };
  const copy = (e) => {
    const text = range();
    e?.clipboardData?.setData("text/plain", text);
    e?.preventDefault();
    navigator.clipboard?.writeText(text);
    s.clipboard.unshift({ text, time: s.time });
    s.clipboard = s.clipboard.slice(0, 20);
    engine.changed();
  };
  const paste = (e) => {
    let text = e.clipboardData.getData("text/plain");
    if (!text) return;
    e.preventDefault();
    let start = parseAddress(w.selection),
      updates = {};
    text
      .replace(/\r/g, "")
      .split("\n")
      .forEach((row, i) =>
        row
          .split("\t")
          .forEach(
            (v, j) => (updates[column(start.c + j) + (start.r + i)] = v),
          ),
      );
    engine.editSheet(s, w, updates);
  };
  return (
    <div
      className="sheet-app app-flex"
      onCopy={copy}
      onPaste={paste}
      onKeyDown={(e) => {
        if (e.ctrlKey && e.key === "z") {
          e.preventDefault();
          engine.undoSheet(w);
        }
        if (e.ctrlKey && e.key === "y") {
          e.preventDefault();
          engine.undoSheet(w, true);
        }
        if (e.ctrlKey && e.key === "s") {
          e.preventDefault();
          engine.saveSheet(s, w);
        }
      }}
    >
      <div className="sheet-ribbon">
        <div className="document-heading">
          <span className="document-icon">
            <Icon name="spreadsheet" size={25} />
          </span>
          <div>
            <input
              data-testid="sheet-filename"
              value={w.sheet.title}
              onChange={(e) => {
                w.sheet.title = e.target.value;
                w.dirty = true;
                engine.changed();
              }}
            />
            <small>
              {w.path} · {w.dirty ? "未保存的更改" : "所有更改已保存"}
            </small>
          </div>
          <Btn
            icon="save"
            test="sheet-save"
            className="primary"
            onClick={() => engine.saveSheet(s, w)}
          >
            保存
          </Btn>
        </div>
        <Toolbar>
          <Btn onClick={() => engine.undoSheet(w)}>↶ 撤销</Btn>
          <Btn onClick={() => engine.undoSheet(w, true)}>↷ 重做</Btn>
          <i />
          <Btn onClick={() => copy()}>复制选区</Btn>
          <Btn
            onClick={() => {
              w.sheet.formats[w.selection] =
                w.sheet.formats[w.selection] === "bold" ? "" : "bold";
              w.dirty = true;
              engine.changed();
            }}
          >
            <b>B</b>
          </Btn>
          <Btn
            onClick={() => {
              w.sheet.formats[w.selection] = "header";
              w.dirty = true;
              engine.changed();
            }}
          >
            突出显示
          </Btn>
          <i />
          <Btn
            icon="plus"
            onClick={() =>
              engine.launchApp(s, "spreadsheet", {
                path: "/Documents/新建-" + Date.now() + ".sheet",
              })
            }
          >
            新建工作簿
          </Btn>
          <span className="version-tag">版本 {w.version}</span>
        </Toolbar>
      </div>
      <div className="formula-bar">
        <span>
          {w.selection}
          {w.selectionEnd !== w.selection ? ":" + w.selectionEnd : ""}
        </span>
        <i>ƒx</i>
        <input
          data-testid="sheet-formula"
          aria-label="公式"
          value={formula}
          onChange={(e) => setFormula(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              engine.editSheet(s, w, { [w.selection]: formula });
              e.currentTarget.blur();
            }
          }}
          onBlur={() => {
            if (formula !== (w.sheet.cells[w.selection] || ""))
              engine.editSheet(s, w, { [w.selection]: formula });
          }}
        />
      </div>
      <div className="sheet-scroll">
        <table data-testid="sheet-grid" className="sheet-grid">
          <thead>
            <tr>
              <th></th>
              {Array.from({ length: 12 }, (_, i) => (
                <th key={i}>{column(i + 1)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 40 }, (_, r) => (
              <tr key={r}>
                <th>{r + 1}</th>
                {Array.from({ length: 12 }, (_, c) => {
                  const addr = column(c + 1) + (r + 1);
                  return <Cell key={addr} addr={addr} s={s} w={w} />;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="sheet-tabs">
        <span className="active">工作表 1</span>
        <button>＋</button>
        <small>SUM 支持 · 依赖重算 · 实时发布</small>
      </div>
      <Status>
        <span>{s.id} / 单工作表</span>
        <span>
          选区求和：
          {range()
            .split(/[\n\t]/)
            .reduce((a, b) => a + (+b || 0), 0)}
          　 · 100%
        </span>
      </Status>
    </div>
  );
}
function Cell({ addr, s, w }) {
  let v = w.sheet.cells[addr] || "",
    calc = cellValue(w.sheet.cells, addr);
  const [draft, setDraft] = useState(v),
    [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setDraft(v);
  }, [v, editing]);
  let selected = w.selection === addr;
  return (
    <td
      className={
        (selected ? "selected " : "") +
        (w.sheet.formats[addr] || "") +
        (typeof calc === "number" ? " numeric" : "") +
        (String(calc).startsWith("#") ? " error" : "")
      }
    >
      <input
        data-testid="sheet-cell"
        data-cell-address={addr}
        aria-label={addr}
        value={editing ? draft : calc}
        onFocus={(e) => {
          if (!e.shiftKey) {
            w.selection = addr;
            w.selectionEnd = addr;
          }
          setDraft(v);
          setEditing(true);
          engine.changed();
        }}
        onPointerDown={(e) => {
          if (e.shiftKey) {
            e.preventDefault();
            w.selectionEnd = addr;
            engine.changed();
          }
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== v) engine.editSheet(s, w, { [addr]: draft });
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
            const a = parseAddress(addr);
            document
              .querySelector(
                `[data-window-id="${w.id}"] [data-cell-address="${column(a.c) + (a.r + 1)}"]`,
              )
              ?.focus();
          }
          if (e.key === "Escape") {
            setDraft(v);
            setEditing(false);
            e.currentTarget.blur();
          }
        }}
      />
    </td>
  );
}
function Systems({ s }) {
  const children = engine.children(s);
  const [path, setPath] = useState("");
  const snaps = Object.keys(s.files).filter((p) => p.endsWith(".snapshot"));
  return (
    <div className="systems-app app-flex">
      <div className="app-page-heading">
        <span className="eyebrow">RECURSIVE WORKSPACES</span>
        <h2>每一层，都独立生长。</h2>
        <p>创建新的桌面，探索彼此连接的系统。</p>
        <Btn
          icon="plus"
          test="system-create-from-manager"
          className="primary"
          onClick={() => {
            engine.newSystem(s);
          }}
        >
          新建子系统
        </Btn>
      </div>
      <div className="systems-body">
        <div className="system-root-label">
          <Icon name="systems" size={17} />
          {s.name}
          <span>{s.id} / 当前父系统</span>
        </div>
        {children.map((c) => (
          <div className="system-card" key={c.id}>
            <div className="system-card-top">
              <span
                className={"status-dot " + (engine.active(c) ? "" : "off")}
              />
              <b>{c.name}</b>
              <small>
                {c.state === "running"
                  ? "运行中"
                  : c.state === "paused"
                    ? "已暂停"
                    : c.state === "error"
                      ? "内核错误"
                      : "已停止"}
              </small>
              <button
                onClick={() => {
                  let w = s.windows.find((w) => w.target === c.id);
                  if (w) engine.focus(s, w);
                  else
                    engine.launchApp(s, "system", {
                      target: c.id,
                      title: c.id + " · 子系统桌面",
                      width: 960,
                      height: 650,
                    });
                }}
              >
                打开桌面 ↗
              </button>
            </div>
            <div className="system-metrics">
              <span>
                虚拟时间 <b>{c.time.toFixed(1)} s</b>
              </span>
              <span>
                本步执行 <b>{c.used} units</b>
              </span>
              <span>
                后代 <b>{engine.descendants(c).length - 1}</b>
              </span>
              <span>
                时间速率{" "}
                <select
                  value={c.rate}
                  onChange={(e) => {
                    c.rate = +e.target.value;
                    engine.changed();
                  }}
                >
                  {[0.25, 0.5, 1, 2, 4].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>{" "}
                ×
              </span>
            </div>
            <div className="system-controls">
              <Btn
                icon={c.state === "paused" ? "play" : "pause"}
                test={c.state === "paused" ? "system-resume" : "system-pause"}
                data-target-system-id={c.id}
                onClick={() => {
                  c.state = c.state === "paused" ? "running" : "paused";
                  engine.changed();
                }}
              >
                {c.state === "paused" ? "继续" : "暂停"}
              </Btn>
              <Btn onClick={() => engine.step(c)}>单步 0.1s</Btn>
              <Btn
                test="system-restart"
                data-target-system-id={c.id}
                onClick={() => engine.restart(c)}
              >
                重启
              </Btn>
              <Btn
                test="kernel-open"
                data-target-system-id={c.id}
                onClick={() =>
                  engine.launchApp(s, "editor", { path: c.kernelPath })
                }
              >
                编辑内核
              </Btn>
              <Btn onClick={() => engine.snapshot(s, c)}>创建快照</Btn>
              <Btn onClick={() => engine.stop(c)}>停止</Btn>
            </div>
            {c.error && (
              <p className="error-text" data-testid="kernel-error">
                {c.error}
              </p>
            )}
          </div>
        ))}
        {!children.length && (
          <div className="system-empty">
            <Icon name="systems" size={42} />
            <b>从一个新世界开始</b>
            <span>子系统有自己的程序、文件与虚拟时间。</span>
          </div>
        )}
        <div className="snapshot-tools">
          <h4>快照档案</h4>
          <select value={path} onChange={(e) => setPath(e.target.value)}>
            <option value="">选择快照文件</option>
            {snaps.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
          <Btn disabled={!path} onClick={() => engine.restore(s, path)}>
            恢复原实例
          </Btn>
          <Btn disabled={!path} onClick={() => engine.restore(s, path, true)}>
            分叉新系统
          </Btn>
        </div>
      </div>
      <Status>
        <span>祖先预算逐级拨付 · 子树独立暂停</span>
        <span>{children.length} 个直属子系统</span>
      </Status>
    </div>
  );
}
function Tasks({ s }) {
  const [selected, setSelected] = useState(null),
    [tab, setTab] = useState("process");
  let p = s.processes.find((p) => p.pid === selected);
  const memory =
    s.processes
      .filter((p) => p.state !== "ended")
      .reduce((n, p) => n + size(p), 0) +
    s.windows
      .filter((w) => w.appId === "player")
      .reduce((n, w) => n + size(w.scene) * 8, 0);
  return (
    <div className="tasks-app app-flex">
      <div className="task-summary">
        <div>
          <span>执行预算</span>
          <b>
            {s.used.toLocaleString()} <small>/ {s.budget}</small>
          </b>
          <div className="usage-track">
            <i
              style={{ width: Math.min(100, (s.used / s.budget) * 100) + "%" }}
            />
          </div>
        </div>
        <div>
          <span>虚拟时钟</span>
          <b>
            {s.time.toFixed(1)} <small>s</small>
          </b>
          <small>
            {s.rate} × · 实际拨付 {s.actualGrant || s.budget}
          </small>
        </div>
        <div>
          <span>内存 / 文件存储</span>
          <b>
            {(memory / 1024).toFixed(0)} <small>KB</small>
          </b>
          <small>{(size(s.files) / 1024).toFixed(0)} KB 存储</small>
        </div>
      </div>
      <Toolbar>
        <Btn
          className={tab === "process" ? "tab-active" : ""}
          onClick={() => setTab("process")}
        >
          进程
        </Btn>
        <Btn
          onClick={() => setTab("resources")}
          className={tab === "resources" ? "tab-active" : ""}
        >
          资源与拨付
        </Btn>
        <Btn
          onClick={() => setTab("output")}
          className={tab === "output" ? "tab-active" : ""}
        >
          消息与输出
        </Btn>
        <span className="version-tag">{s.id} / 0.1s 逻辑步</span>
      </Toolbar>
      {tab === "process" ? (
        <>
          <div className="process-scroll">
            <table className="process-table">
              <thead>
                <tr>
                  <th>PID / 名称</th>
                  <th>状态</th>
                  <th>本步</th>
                  <th>累计工作量</th>
                  <th>剩余 / 队列</th>
                  <th>额度</th>
                </tr>
              </thead>
              <tbody>
                {s.processes.map((q) => (
                  <tr
                    key={q.pid}
                    className={selected === q.pid ? "selected" : ""}
                    onClick={() => setSelected(q.pid)}
                  >
                    <td>
                      <span>{q.pid}</span> {q.name}
                      {q.kind === "carrier" && (
                        <small>
                          内核 {q.kernelWork || 0} / 内部 {q.internal || 0}
                        </small>
                      )}
                    </td>
                    <td>
                      <span className={"process-state " + q.state}>
                        {{
                          ready: "就绪",
                          waiting: q.waitMessage ? "等待消息" : "计时等待",
                          ended: "已结束",
                          syswait: "等待内核",
                          compiling: "编译中",
                          suspended: "已挂起",
                          error: "异常",
                        }[q.state] || q.state}
                      </span>
                    </td>
                    <td>{q.used}</td>
                    <td>{q.total.toLocaleString()}</td>
                    <td>
                      {q.remaining || 0} / {q.inbox.length}
                    </td>
                    <td>
                      <input
                        type="number"
                        min="1"
                        value={q.quota}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          q.quota = Math.max(1, +e.target.value);
                          engine.changed();
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {s.windows
              .filter((w) => w.appId === "browser")
              .flatMap((w) =>
                w.tabs.map((t) => (
                  <div className="browser-process" key={t.id}>
                    Chromium 网页视图 · {t.url}
                    <span>宿主设备 / 不计指令预算</span>
                  </div>
                )),
              )}
          </div>
          <div className="process-actions">
            <span>
              {p
                ? p.error || "PID " + p.pid + " · 内存 " + size(p) + " B"
                : "选择一个进程查看操作"}
            </span>
            <Btn
              disabled={!p}
              onClick={() => {
                if (p) {
                  p.state = p.state === "suspended" ? "ready" : "suspended";
                  engine.changed();
                }
              }}
            >
              {p?.state === "suspended" ? "继续" : "挂起"}
            </Btn>
            <Btn disabled={!p} onClick={() => p && engine.terminate(s, p)}>
              结束进程
            </Btn>
          </div>
        </>
      ) : tab === "resources" ? (
        <div className="resource-settings">
          <label>
            系统总预算 / 逻辑步
            <input
              data-testid="tasks-budget"
              type="number"
              min="1"
              value={s.budget}
              onChange={(e) => {
                s.budget = Math.max(1, +e.target.value);
                engine.changed();
              }}
            />
          </label>
          <label>
            内存配额 / 字节
            <input
              data-testid="tasks-memory"
              type="number"
              value={s.memory}
              onChange={(e) => {
                s.memory = +e.target.value;
                engine.changed();
              }}
            />
          </label>
          <label>
            存储配额 / 字节
            <input
              data-testid="tasks-storage"
              type="number"
              value={s.storage}
              onChange={(e) => {
                s.storage = +e.target.value;
                engine.changed();
              }}
            />
          </label>
          {engine.children(s).map((c) => (
            <label key={c.id}>
              {c.id} · 拨付上限
              <input
                data-testid="tasks-grant"
                data-target-system-id={c.id}
                type="number"
                min="1"
                value={c.grant}
                onChange={(e) => {
                  c.grant = Math.max(1, +e.target.value);
                  engine.changed();
                }}
              />
            </label>
          ))}
          <p>
            额度是上限。内核、应用和承载进程竞争同一份总预算；加快时间不会增加预算。
          </p>
        </div>
      ) : (
        <div className="console-output">
          {s.output.length ? (
            s.output.map((x, i) => (
              <div key={i}>
                <small>
                  {x.time.toFixed(2)} / PID {x.pid}
                </small>
                {x.text}
              </div>
            ))
          ) : (
            <p>尚无程序输出。运行累加或消息示例后，结果会出现在这里。</p>
          )}
          {s.processes
            .filter((p) => p.error)
            .map((p) => (
              <div className="error-text" key={p.pid}>
                PID {p.pid}: {p.error}
              </div>
            ))}
        </div>
      )}
      <Status>
        <span>
          {s.processes.length} 个进程 · 内核自身 {s.kernelUsed} units
        </span>
        <span>内存、消息、未完成工作可快照</span>
      </Status>
    </div>
  );
}
function Editor({ s, w }) {
  let lines = w.text.split("\n").length;
  const files = Object.keys(s.files).filter((p) => !s.files[p].dir);
  const [feedback, setFeedback] = useState("");
  return (
    <div className="editor-app app-flex">
      <Toolbar>
        <Icon name="editor" size={18} />
        <input
          data-testid="editor-filename"
          value={w.path}
          onChange={(e) => {
            w.path = e.target.value;
            engine.changed();
          }}
        />
        <Btn
          icon="save"
          test="editor-save"
          onClick={() => {
            if (engine.write(s, w.path, w.text)) {
              w.dirty = false;
              setFeedback("保存成功");
            }
            engine.changed();
          }}
        >
          保存
        </Btn>
        <Btn
          icon="play"
          className="primary"
          onClick={() => {
            engine.write(s, w.path, w.text);
            w.dirty = false;
            let p = engine.runProgram(s, w.path, w.text);
            setFeedback(p ? "正在运行 · PID " + p.pid : "编译失败");
          }}
        >
          运行程序
        </Btn>
      </Toolbar>
      <div className="editor-file-select">
        <span>打开</span>
        <select
          value={Object.hasOwn(s.files, w.path) ? w.path : ""}
          onChange={(e) => {
            if (w.dirty) {
              setFeedback("请先保存当前文件");
              return;
            }
            w.path = e.target.value;
            w.text = s.files[w.path].text;
            engine.changed();
          }}
        >
          <option value="">选择文件…</option>
          {files.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <Btn
          onClick={() =>
            engine.launchApp(s, "editor", { path: "/Documents/新程序.nest" })
          }
        >
          新建
        </Btn>
        <span>JSON / NEST-1</span>
      </div>
      <div className="code-area">
        <div className="line-numbers">
          {Array.from({ length: lines }, (_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
        <textarea
          data-testid="editor-text"
          spellCheck={false}
          value={w.text}
          onChange={(e) => {
            w.text = e.target.value;
            w.dirty = true;
            engine.changed();
          }}
          onKeyDown={(e) => {
            if (e.key === "Tab") {
              e.preventDefault();
              let t = e.currentTarget,
                start = t.selectionStart;
              w.text =
                w.text.slice(0, start) + "  " + w.text.slice(t.selectionEnd);
              w.dirty = true;
              engine.changed();
              requestAnimationFrame(() => {
                t.selectionStart = t.selectionEnd = start + 2;
              });
            }
            if (e.ctrlKey && e.key === "s") {
              e.preventDefault();
              engine.write(s, w.path, w.text);
              w.dirty = false;
              engine.changed();
            }
          }}
        />
      </div>
      <Status>
        <span>{feedback || "可编辑的程序 · 保存后重新运行生效"}</span>
        <span>
          {lines} 行 · UTF-8 · {s.id}
        </span>
      </Status>
    </div>
  );
}
function Settings({ s }) {
  return (
    <div className="settings-app scroll-app">
      <div className="section-eyebrow">MAKE IT YOURS</div>
      <h2>让桌面，有你的气息。</h2>
      <p>这些设置即时生效，并保留在当前系统中。</p>
      <label className="setting-row">
        系统名称
        <input
          value={s.name}
          onChange={(e) => {
            s.name = e.target.value;
            engine.changed();
          }}
        />
      </label>
      <h4>桌面壁纸</h4>
      <div className="wallpaper-options">
        {[
          ["valley", "山谷微光"],
          ["dusk", "暮色山峦"],
          ["mist", "青雾远山"],
        ].map(([v, label]) => (
          <button
            key={v}
            data-testid="settings-wallpaper"
            data-value={v}
            className={s.settings.wallpaper === v ? "selected" : ""}
            onClick={() => {
              s.settings.wallpaper = v;
              engine.changed();
            }}
          >
            <span className={"wallpaper-preview wallpaper-" + v} />
            <span>
              {label}
              {s.settings.wallpaper === v && <Icon name="check" size={15} />}
            </span>
          </button>
        ))}
      </div>
      <h4>强调色</h4>
      <div className="accent-options">
        {["#7f6c9c", "#4e8275", "#6686a3", "#bb8b60", "#b1767e", "#536975"].map(
          (c) => (
            <button
              key={c}
              aria-label={c}
              data-testid="settings-accent"
              data-value={c}
              style={{ background: c }}
              onClick={() => {
                s.settings.accent = c;
                engine.changed();
              }}
            >
              {s.settings.accent === c && <Icon name="check" size={19} />}
            </button>
          ),
        )}
      </div>
      <label className="setting-row">
        界面缩放
        <select
          data-testid="settings-scale"
          value={s.settings.scale}
          onChange={(e) => {
            s.settings.scale = +e.target.value;
            engine.changed();
          }}
        >
          {[1, 1.1, 1.25].map((n) => (
            <option key={n} value={n}>
              {Math.round(n * 100)}%
            </option>
          ))}
        </select>
      </label>
      <label className="setting-row">
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
      <div className="settings-footnote">
        <Icon name="leaf" size={22} />
        <span>
          栖境 NEST OS 1.0
          <br />
          <small>一个可以装下另一个世界的桌面。</small>
        </span>
      </div>
    </div>
  );
}
function Widgets({ s }) {
  const [month, setMonth] = useState(10),
    [timer, setTimer] = useState(5),
    [note, setNote] = useState(s.note);
  const now = new Date(2026, month, 9);
  let start = new Date(2026, month, 1).getDay(),
    count = new Date(2026, month + 1, 0).getDate();
  return (
    <div className="widgets-app scroll-app">
      <div className="widget-clock">
        <span className="section-eyebrow">片刻之间</span>
        <strong>{formatTime(s.time).slice(0, 5)}</strong>
        <span>2026 年 {month + 1} 月 9 日 · 星期一</span>
      </div>
      <div className="widget-grid">
        <section className="widget-card calendar">
          <div className="widget-card-heading">
            <b>
              {now.getFullYear()} 年 {now.getMonth() + 1} 月
            </b>
            <div>
              <button aria-label="上个月" onClick={() => setMonth(month - 1)}>
                ‹
              </button>
              <button aria-label="下个月" onClick={() => setMonth(month + 1)}>
                ›
              </button>
            </div>
          </div>
          <div className="calendar-grid">
            {"日一二三四五六".split("").map((d) => (
              <small key={d}>{d}</small>
            ))}
            {Array.from({ length: start }, (_, i) => (
              <span key={"b" + i} />
            ))}
            {Array.from({ length: count }, (_, i) => (
              <span key={i} className={i === 8 ? "today" : ""}>
                {i + 1}
              </span>
            ))}
          </div>
        </section>
        <section className="widget-card">
          <div className="widget-card-heading">
            <b>倒计时</b>
            <Icon name="clock" size={17} />
          </div>
          <div className="timer-display">
            {Math.floor(s.timer?.remaining ?? timer)
              .toString()
              .padStart(2, "0")}
            <small>秒</small>
          </div>
          <div className="timer-controls">
            <input
              data-testid="widget-timer-input"
              aria-label="倒计时秒数"
              type="number"
              min="1"
              value={timer}
              onChange={(e) => setTimer(+e.target.value)}
            />
            <Btn
              test="widget-timer-start"
              className="primary"
              onClick={() => {
                s.timer = { remaining: timer, running: true };
                engine.changed();
              }}
            >
              开始
            </Btn>
            <Btn
              test="widget-timer-pause"
              onClick={() => {
                if (s.timer) s.timer.running = !s.timer.running;
                engine.changed();
              }}
            >
              暂停
            </Btn>
            <Btn
              test="widget-timer-reset"
              onClick={() => {
                s.timer = { remaining: timer, running: false };
                engine.changed();
              }}
            >
              重置
            </Btn>
          </div>
        </section>
        <section className="widget-card note-card">
          <div className="widget-card-heading">
            <b>随手记</b>
            <Icon name="editor" size={17} />
          </div>
          <textarea
            data-testid="widget-note-text"
            placeholder="留下一点灵感…"
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              s.note = e.target.value;
            }}
          />
          <Btn
            test="widget-note-save"
            onClick={() => {
              s.note = note;
              engine.notify(s, "便笺已保存");
            }}
          >
            保存便笺
          </Btn>
        </section>
        <section className="widget-card">
          <div className="widget-card-heading">
            <b>秒表</b>
            <span>{s.stopwatch?.running ? "计时中" : "已暂停"}</span>
          </div>
          <div className="stopwatch-display">
            {(s.stopwatch?.elapsed || 0).toFixed(1)}
            <small> s</small>
          </div>
          <Btn
            onClick={() => {
              s.stopwatch ??= { elapsed: 0, running: false };
              s.stopwatch.running = !s.stopwatch.running;
              engine.changed();
            }}
          >
            开始 / 暂停
          </Btn>
          <Btn
            onClick={() => {
              s.stopwatch = { elapsed: 0, running: false };
              engine.changed();
            }}
          >
            归零
          </Btn>
        </section>
      </div>
      <section className="widget-card clipboard-card">
        <div className="widget-card-heading">
          <b>剪贴板历史</b>
          <span>{s.clipboard.length} 条</span>
        </div>
        <div data-testid="widget-clipboard-list">
          {s.clipboard.length ? (
            s.clipboard.map((v, i) => (
              <button
                key={i}
                onClick={() => navigator.clipboard?.writeText(v.text)}
              >
                {v.text}
              </button>
            ))
          ) : (
            <p className="muted">复制表格选区或文本后，内容会留在这里。</p>
          )}
        </div>
      </section>
      <div data-testid="widget-notifications">
        <h4>最近通知</h4>
        {s.notifications.slice(0, 5).map((n) => (
          <p key={n.id} className="widget-notice">
            {n.text}
          </p>
        ))}
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
    </div>
  );
}
function Player({ s, w }) {
  const p = w.player,
    disabled = !engine.active(s),
    send = (a, d) => engine.event(s, w, a, d),
    [scene, setScene] = useState(w.path);
  return (
    <div className="player-app app-flex">
      <div className="player-top">
        <div>
          <b>{w.scene.title}</b>
          <span>
            {s.id} / {p.mode === "rehearsal" ? "实时飞行排演" : "场景记录"} ·{" "}
            {w.scene.fps || 30} FPS
          </span>
        </div>
        <select
          data-testid="player-camera"
          value={p.camera}
          onChange={(e) => send("camera", e.target.value)}
          disabled={disabled}
        >
          {["演出镜头", "跟随镜头", "自由环绕"].map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
      </div>
      <div className="stage-wrap">
        <Stage w={w} onAction={send} />
        <div className="stage-badge">
          <span className="status-dot" />
          {p.mode === "rehearsal" ? "LIVE FLIGHT" : "VALLEY ECHO"}
          <b>24</b>
        </div>
        <div className="stage-caption">
          <span>山谷基地 / 09:00 · 晴</span>
          <small>REALTIME 3D · NEST ENGINE</small>
        </div>
        {disabled && <div className="stage-paused">源系统已暂停</div>}
        <div className="stage-selection" data-testid="player-selection">
          {p.selection}
        </div>
      </div>
      <div className="player-timeline">
        <input
          data-testid="player-seek"
          aria-label="播放进度"
          type="range"
          min="0"
          max={p.duration}
          step={1 / (w.scene.fps || 30)}
          value={p.position}
          onChange={(e) => send("seek", +e.target.value)}
          disabled={disabled}
        />
        <div className="timeline-ticks">
          <span>00:00</span>
          <span>旋翼启动</span>
          <span>前飞</span>
          <span>故障</span>
          <span>撞击</span>
          <span>{p.duration.toFixed(0)}s</span>
        </div>
      </div>
      <div className="player-controls">
        <button
          className="player-play"
          data-testid="player-play"
          aria-label="播放"
          disabled={disabled}
          onClick={() => send("play")}
        >
          <Icon name="play" size={19} />
        </button>
        <button
          data-testid="player-pause"
          aria-label="暂停"
          disabled={disabled}
          onClick={() => send("pause")}
        >
          <Icon name="pause" size={18} />
        </button>
        <button
          data-testid="player-stop"
          aria-label="停止"
          disabled={disabled}
          onClick={() => send("stop")}
        >
          <Icon name="stop" size={17} />
        </button>
        <button
          data-testid="player-step"
          aria-label="逐帧"
          disabled={disabled}
          onClick={() => send("step")}
        >
          ▸│
        </button>
        <div className="player-time">
          <input
            data-testid="player-time"
            type="number"
            aria-label="当前秒数"
            min="0"
            max={p.duration}
            step="0.1"
            value={+p.position.toFixed(2)}
            onChange={(e) => send("seek", +e.target.value)}
          />
          <span>/ {p.duration.toFixed(2)} s</span>
        </div>
        <span className="player-state">
          {p.state === "playing"
            ? "播放中"
            : p.state === "paused"
              ? "已暂停"
              : "就绪"}
        </span>
        <select
          aria-label="播放速率"
          data-testid="player-rate"
          value={p.rate}
          onChange={(e) => send("rate", +e.target.value)}
        >
          {[0.25, 0.5, 1, 1.5, 2].map((x) => (
            <option key={x} value={x}>
              {x} ×
            </option>
          ))}
        </select>
        <label className="loop-label">
          <input
            data-testid="player-loop"
            type="checkbox"
            checked={p.loop}
            onChange={(e) => send("loop", e.target.checked)}
          />
          循环
        </label>
      </div>
      <details className="player-tools">
        <summary>
          场景资源与飞行排演 <span>展开控制台</span>
        </summary>
        <div className="player-resource">
          <select value={scene} onChange={(e) => setScene(e.target.value)}>
            {Object.keys(s.files)
              .filter((f) => f.endsWith(".scene") || f.endsWith(".replay"))
              .map((f) => (
                <option key={f}>{f}</option>
              ))}
          </select>
          <Btn
            test="player-open"
            onClick={() => {
              try {
                let data = JSON.parse(s.files[scene].text);
                if (data.format !== "nest-scene-1")
                  throw Error("不支持的场景格式");
                w.scene = data;
                w.path = scene;
                p.duration = data.duration || 15;
                p.position = 0;
                p.partTime = 0;
                p.effectTime = 0;
                p.mode = "record";
                p.state = "stopped";
                engine.changed();
              } catch (e) {
                engine.notify(s, e.message);
              }
            }}
          >
            打开资源
          </Btn>
          <Btn onClick={() => engine.launchApp(s, "editor", { path: w.path })}>
            编辑资源
          </Btn>
        </div>
        <div className="rehearsal-controls">
          <Btn
            test="rehearsal-start"
            className="primary"
            onClick={() => send("rehearsal")}
          >
            开始 / 续接排演
          </Btn>
          <label>
            风{" "}
            <input
              data-testid="rehearsal-wind"
              type="range"
              min="-10"
              max="10"
              value={p.wind}
              onChange={(e) => send("wind", +e.target.value)}
            />
            {p.wind}
          </label>
          <label>
            航向{" "}
            <input
              data-testid="rehearsal-heading"
              type="number"
              value={p.heading}
              onChange={(e) => send("heading", +e.target.value)}
            />
          </label>
          <Btn test="rehearsal-fault" onClick={() => send("fault")}>
            触发故障
          </Btn>
          <label>
            目标停机坪
            <select
              data-testid="rehearsal-target"
              value={p.goalX ?? 0}
              onChange={(e) => send("target", +e.target.value)}
            >
              <option value="0">A / 起飞点</option>
              <option value="16">B / 16 米</option>
            </select>
          </label>
          <Btn onClick={() => send("land")}>在目标降落</Btn>
          <Btn onClick={() => engine.runProgram(s, "/Programs/flight.nest")}>
            重新载入飞控
          </Btn>
          <Btn
            test="rehearsal-controller"
            onClick={() =>
              engine.launchApp(s, "editor", { path: "/Programs/flight.nest" })
            }
          >
            飞控程序
          </Btn>
          <Btn
            onClick={() => {
              let record = {
                ...clone(w.scene),
                duration: p.position,
                record: p.record,
                recordFrames: p.frames,
              };
              engine.write(
                s,
                "/Documents/flight-" + Math.floor(s.time) + ".replay",
                JSON.stringify(record),
              );
            }}
          >
            保存排演
          </Btn>
        </div>
        {p.mode === "rehearsal" && (
          <div className="flight-telemetry">
            高度 {p.flight.y.toFixed(2)}m　滚转{" "}
            {((p.flight.roll * 180) / Math.PI).toFixed(1)}°　控制间隔{" "}
            {(
              s.time - (p.controlHistory?.at(-1)?.time ?? p.flight.lastControl)
            ).toFixed(2)}
            s　
            {p.crashed ? "接地损坏" : "飞行中"}
          </div>
        )}
      </details>
      <Status>
        <span>{w.path}</span>
        <span>取样 {p.frameTime.toFixed(2)}s · 三进程协作</span>
      </Status>
    </div>
  );
}
function Charts({ s, w }) {
  const [hover, setHover] = useState(null);
  const sources = engine
    .get("outer")
    .windows.filter((x) => x.appId === "spreadsheet");
  const series = w.cache[0]?.values || [];
  let values = w.cache.flatMap((r) =>
    r.values.map((v) => +v.value * (w.multiplier ?? 1) || 0),
  );
  let max = Math.max(1, ...values);
  let palette = ["#8a76aa", "#78a394", "#c9a46f", "#748fa7"];
  const send = (a, d) => engine.event(s, w, a, d);
  return (
    <div className="charts-app app-flex">
      <div className="chart-config">
        <label>
          工作簿
          <select
            data-testid="chart-source"
            value={w.sourceId}
            onChange={(e) => {
              send("configure", { sourceId: e.target.value });
            }}
          >
            <option value="">选择根系统已打开的工作簿</option>
            {sources.map((x) => (
              <option key={x.id} value={x.id}>
                {x.sheet.title} · {x.id}
              </option>
            ))}
          </select>
        </label>
        <div>
          <label>
            区域
            <input
              data-testid="chart-range"
              value={w.range}
              onChange={(e) => {
                send("configure", { range: e.target.value });
              }}
            />
          </label>
          <label>
            标签列
            <input
              data-testid="chart-label-column"
              value={w.labelColumn}
              onChange={(e) => {
                send("configure", {
                  labelColumn: e.target.value.toUpperCase(),
                });
              }}
            />
          </label>
          <label>
            数值列
            <input
              data-testid="chart-series"
              value={w.series}
              onChange={(e) => {
                send("configure", { series: e.target.value.toUpperCase() });
              }}
            />
          </label>
          <Btn
            test="chart-connect"
            icon="project"
            className="primary"
            disabled={!w.sourceId || !engine.active(s)}
            onClick={() =>
              send("connect", {
                sourceId: w.sourceId,
                range: w.range,
                labelColumn: w.labelColumn,
                series: w.series,
              })
            }
          >
            连接数据
          </Btn>
          <Btn test="chart-disconnect" onClick={() => send("disconnect")}>
            断开
          </Btn>
        </div>
      </div>
      <div className="chart-content">
        <div className="chart-heading">
          <div>
            <span className="section-eyebrow">LIVE DATA / 实时数据</span>
            <h2>{w.sourceTitle || "让数据，彼此连接。"}</h2>
            <p>
              {w.cache.length
                ? `${w.range} · ${w.cache.length} 个项目 · 版本 ${w.version}`
                : "选择根系统工作簿和区域，建立实时连接。"}
            </p>
          </div>
          <select
            data-testid="chart-type"
            value={w.chartType}
            onChange={(e) => send("type", e.target.value)}
          >
            <option value="bar">分组柱状图</option>
            <option value="line">折线图</option>
          </select>
        </div>
        {w.cache.length ? (
          <>
            <div className="chart-legend">
              {series.map((v, i) => (
                <span key={i}>
                  <i style={{ background: palette[i % 4] }} />
                  {v.name}
                </span>
              ))}
            </div>
            <svg
              className="data-chart"
              viewBox="0 0 650 270"
              preserveAspectRatio="xMidYMid meet"
            >
              {[0, 0.25, 0.5, 0.75, 1].map((n) => (
                <g key={n}>
                  <line
                    x1="50"
                    y1={220 - n * 180}
                    x2="620"
                    y2={220 - n * 180}
                    stroke="#e5e8e8"
                    strokeDasharray={n ? "3 5" : ""}
                  />
                  <text
                    x="38"
                    y={224 - n * 180}
                    textAnchor="end"
                    fill="#879191"
                    fontSize="10"
                  >
                    {Math.round(n * max)}
                  </text>
                </g>
              ))}
              {series.map((v, j) =>
                w.chartType === "line" ? (
                  <polyline
                    key={j}
                    points={w.cache
                      .map(
                        (r, i) =>
                          `${95 + (i * 490) / Math.max(1, w.cache.length - 1)},${220 - (((+r.values[j]?.value || 0) * (w.multiplier ?? 1)) / max) * 180}`,
                      )
                      .join(" ")}
                    fill="none"
                    stroke={palette[j % 4]}
                    strokeWidth="3"
                  />
                ) : null,
              )}
              {w.cache.map((r, i) => (
                <g key={i}>
                  <text
                    x={
                      w.chartType === "line"
                        ? 95 + (i * 490) / Math.max(1, w.cache.length - 1)
                        : 70 + ((i + 0.5) * 530) / w.cache.length
                    }
                    y="245"
                    textAnchor="middle"
                    fill="#74817e"
                    fontSize="12"
                  >
                    {r.label}
                  </text>
                  {r.values.map((v, j) => {
                    let n = (+v.value || 0) * (w.multiplier ?? 1),
                      x =
                        w.chartType === "line"
                          ? 95 + (i * 490) / Math.max(1, w.cache.length - 1)
                          : 70 +
                            (i * 530) / w.cache.length +
                            20 +
                            (j * 80) / series.length,
                      y = 220 - (n / max) * 180;
                    return (
                      <g
                        key={j}
                        onMouseEnter={() =>
                          setHover({ label: r.label, value: n })
                        }
                        onMouseLeave={() => setHover(null)}
                        onClick={() =>
                          send("select", { label: r.label, value: n })
                        }
                      >
                        {w.chartType === "line" ? (
                          <circle
                            cx={x}
                            cy={y}
                            r="5"
                            fill={palette[j % 4]}
                            stroke="white"
                            strokeWidth="2"
                          />
                        ) : (
                          <rect
                            x={x}
                            y={y}
                            width={
                              Math.min(70, 530 / w.cache.length - 35) /
                              series.length
                            }
                            height={Math.max(0, 220 - y)}
                            rx="4"
                            fill={palette[j % 4]}
                            opacity=".9"
                          />
                        )}
                        <text
                          x={
                            x +
                            (w.chartType === "line"
                              ? 0
                              : Math.min(70, 530 / w.cache.length - 35) /
                                series.length /
                                2)
                          }
                          y={y - 10}
                          fill="#586465"
                          textAnchor="middle"
                          fontSize="12"
                        >
                          {n}
                        </text>
                      </g>
                    );
                  })}
                </g>
              ))}
            </svg>
            <div className="chart-point">
              {hover
                ? hover.label + " · " + hover.value
                : w.selectedPoint
                  ? w.selectedPoint.label + " · " + w.selectedPoint.value
                  : "悬停或点击数据点查看数值"}
            </div>
          </>
        ) : (
          <div className="chart-placeholder">
            <Icon name="charts" size={55} />
            <span>一份数据，多个世界的视角</span>
            <small>数据以独立副本经系统消息抵达这里。</small>
          </div>
        )}
      </div>
      <Status>
        <span>
          <i
            className={
              "status-dot " + (w.connectionState === "已连接" ? "" : "off")
            }
          />
          {w.connectionState}
        </span>
        <span>
          {s.id} · {w.pending?.length || 0} 条待处理更新
        </span>
      </Status>
    </div>
  );
}
function Browser({ s, w }) {
  const [addr, setAddr] = useState(
      w.tabs.find((t) => t.id === w.activeTab)?.url || "",
    ),
    [views] = useState({});
  const active = w.tabs.find((t) => t.id === w.activeTab);
  useEffect(() => setAddr(active?.url || ""), [w.activeTab, active?.url]);
  useEffect(() => {
    return window.host?.popup((url) => {
      let exists = engine.findWindow(w.id);
      if (exists) add(url);
    });
  }, []);
  function add(url = "https://www.bilibili.com") {
    let t = {
      id: "tab" + Date.now(),
      url,
      title: "新标签页",
      loadState: "loading",
    };
    w.tabs.push(t);
    w.activeTab = t.id;
    engine.changed();
  }
  const go = () => {
    let url = addr.trim();
    if (!/^https?:\/\//.test(url))
      url = url.includes(".")
        ? "https://" + url
        : "https://www.bing.com/search?q=" + encodeURIComponent(url);
    active.url = url;
    active.loadState = "loading";
    views[active.id]?.loadURL(url);
    engine.changed();
  };
  return (
    <div className="browser-app app-flex">
      <div className="browser-tabs">
        {w.tabs.map((t) => (
          <div
            key={t.id}
            data-testid="browser-tab"
            data-tab-id={t.id}
            className={w.activeTab === t.id ? "active" : ""}
            onClick={() => {
              w.activeTab = t.id;
              engine.changed();
            }}
          >
            <Icon name="browser" size={14} />
            <span>{t.title || "新标签页"}</span>
            <button
              aria-label="关闭标签"
              data-testid="browser-close-tab"
              onClick={(e) => {
                e.stopPropagation();
                w.tabs = w.tabs.filter((x) => x !== t);
                delete views[t.id];
                if (!w.tabs.length) engine.close(s, w);
                else if (w.activeTab === t.id) w.activeTab = w.tabs[0].id;
                engine.changed();
              }}
            >
              ×
            </button>
          </div>
        ))}
        <button
          data-testid="browser-new-tab"
          aria-label="新标签页"
          onClick={() => add()}
        >
          ＋
        </button>
      </div>
      <div className="browser-navigation">
        <button
          data-testid="browser-back"
          aria-label="后退"
          onClick={() =>
            views[active.id]?.canGoBack() && views[active.id].goBack()
          }
        >
          <Icon name="back" size={17} />
        </button>
        <button
          data-testid="browser-forward"
          aria-label="前进"
          onClick={() =>
            views[active.id]?.canGoForward() && views[active.id].goForward()
          }
        >
          <Icon name="next" size={17} />
        </button>
        <button
          data-testid="browser-reload"
          aria-label="刷新或停止"
          onClick={() =>
            active.loadState === "loading"
              ? views[active.id]?.stop()
              : views[active.id]?.reload()
          }
        >
          {active.loadState === "loading" ? "×" : "↻"}
        </button>
        <div className="browser-address">
          <span>◇</span>
          <input
            data-testid="browser-address"
            value={addr}
            onChange={(e) => setAddr(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") go();
            }}
          />
          <button data-testid="browser-go" onClick={go}>
            前往
          </button>
        </div>
      </div>
      <div className="browser-webviews">
        {w.tabs.map((t) => (
          <WebTab
            key={t.id}
            t={t}
            active={w.activeTab === t.id}
            views={views}
          />
        ))}
      </div>
      <Status>
        <span>
          {active?.loadState === "loading"
            ? "正在连接…"
            : active?.loadState === "error"
              ? "加载失败，可刷新重试"
              : "Chromium · 安全网页视图"}
        </span>
        <span>网络页面按真实时间运行</span>
      </Status>
    </div>
  );
}
function WebTab({ t, active, views }) {
  const ref = useRef(),
    url = useRef(t.url);
  useEffect(() => {
    let v = ref.current;
    views[t.id] = v;
    const events = {
      "did-start-loading": () => {
        t.loadState = "loading";
        engine.changed();
      },
      "did-stop-loading": () => {
        if (t.loadState !== "error") t.loadState = "ready";
        engine.changed();
      },
      "did-navigate": (e) => {
        t.url = e.url;
        engine.changed();
      },
      "did-navigate-in-page": (e) => {
        t.url = e.url;
        engine.changed();
      },
      "page-title-updated": (e) => {
        t.title = e.title;
        engine.changed();
      },
      "did-fail-load": (e) => {
        if (e.errorCode !== -3 && e.isMainFrame) {
          t.loadState = "error";
          t.error = e.errorDescription;
          engine.changed();
        }
      },
    };
    Object.entries(events).forEach(([k, fn]) => v.addEventListener(k, fn));
    return () => {
      Object.entries(events).forEach(([k, fn]) => v.removeEventListener(k, fn));
      delete views[t.id];
    };
  }, []);
  return (
    <div className="web-tab" style={{ display: active ? "flex" : "none" }}>
      <webview
        ref={ref}
        src={url.current}
        allowpopups="true"
        webpreferences="contextIsolation=yes, sandbox=yes, nodeIntegration=no, backgroundThrottling=no"
      />
      {t.loadState === "error" && (
        <div className="web-error">
          <Icon name="browser" size={38} />
          <h3>暂时无法连接到此网站</h3>
          <p>{t.url}</p>
          <small>{t.error}</small>
          <Btn onClick={() => ref.current.reload()}>重试</Btn>
        </div>
      )}
    </div>
  );
}
function Help() {
  return (
    <article className="help-app scroll-app">
      <span className="section-eyebrow">WELCOME TO NEST</span>
      <h1>
        一个世界，
        <br />
        装下另一个世界。
      </h1>
      <p>
        栖境是一套递归桌面实验室。双击图标启动应用，左下角打开开始菜单；拖动标题栏移动，拖到桌面左右边缘可半屏贴靠。右下角拖动改变大小，双击标题栏最大化。
      </p>
      <h3>01 / 系统与时间</h3>
      <p>
        点击桌面右上角「新建子系统」。每层均可继续创建。系统树中可以暂停、继续、单步
        0.1
        秒、调速、重启、保存快照或分叉。暂停覆盖全部后代，兄弟系统继续运行。重启会重新读取父系统
        /System/inner-N.kernel.nest，保留文件并重建进程。
      </p>
      <h3>02 / 程序是真实的文件</h3>
      <p>
        Nest-1 是 JSON 指令程序。code
        是指令数组；所有运行位置、变量、等待、收件箱都可保存。变量用 $
        前缀引用，表达式使用前缀数组。累加、持续计算、消息接收与发送程序位于
        /Programs。用编辑器修改、保存、运行。输出在进程管理器中查看。
      </p>
      <pre>
        {JSON.stringify(
          {
            format: "nest-1",
            name: "我的程序",
            code: [
              ["set", "i", 0],
              ["label", "loop"],
              ["add", "i", 1],
              ["if", ["<", "$i", 100], "loop"],
              ["print", "$i"],
              ["halt"],
            ],
          },
          null,
          2,
        )}
      </pre>
      <p>
        指令：set、add、if、jump、label、wait（秒）、time、self、recv、send、read（路径，变量）、write（路径，文本）、spawn（路径，变量）、kill（PID）、print、halt、call。表达式支持
        + - * / %、比较、len、at、concat、array、abs；$obj.field 读取字段。send
        的收件 PID 只属于当前系统，消息保存发送时的副本。
      </p>
      <h3>03 / 内核、合成器与编译器</h3>
      <p>
        父系统中的 inner-N.kernel.nest 是可编辑内核。预置内核启动 WM，用 clock.pending/advance 推进时钟，以 tasks.list/task.info 判断就绪及等待唤醒，循环调用 task.execute 拨付预算。修改轮转顺序或
        192 指令时间片并重启，会改变实际分配。request.next/reply 分发自定义 sys.*
        请求；可在内核插入指令实现额外规则。/System/wm.nest 中
        policy.stack=first 可改窗口叠放规则，/Programs/files.nest 的
        sort=descending 改文件排序；charts.nest 的 multiplier
        改绘图取值。保存后重启子系统或重新打开应用生效。编译器的 compiler.parse
        是设备解析原语，compiler.nest
        是受调度的编译服务程序。编辑其指令后，后续启动会执行新的编译规则；policy.aliases
        可为指令增加别名。编译器也能作为普通程序编译自身。
      </p>
      <h3>04 / 预算与设备边界</h3>
      <p>
        普通 VM 指令至少花费 1 unit，复制按每 64 字节分段付费，未完成时保存指令债务、工作进度与 PC。内核和子程序共享剩余预算，按逻辑步累计封顶。承载实际消费包括下层内核及内部任务；每进程额度是上限。应用通过服务指令调用文件、界面与绘图设备，完成后提交。宿主负责
        React 控件与 Three.js 光栅化，Chromium
        网页不计入指令预算。进程管理器提供总预算、内存、存储和直属子系统拨付设置。窗口路由、文件应用规则、图表变换、播放时序和飞行积分由系统中的程序执行；基础存取、几何查询与复杂显示模板仍是固定服务。
      </p>
      <h3>05 / 表格与实时图表</h3>
      <p>
        根系统 /Demo/sample.sheet
        保存示例工作簿。点击单元格输入，回车提交；Shift 点击扩展选区，Ctrl+C/V
        复制粘贴，Ctrl+Z/Y 撤销重做。支持算术、括号、引用和
        SUM(D2:D4)，循环、除零和引用错误有标记。子系统图表选择已打开工作簿、区域、标签列和数值列（逗号分隔），点击连接。完整数据版本通过副本消息送达，暂停时排队。断开后保留缓存。
      </p>
      <h3>06 / 投送与文件</h3>
      <p>
        子系统播放器和图表标题栏「投送」可选择任一祖先。输入经源系统收件箱处理，暂停源系统后控件停止，外框仍可移动。关闭投送不会关闭源应用。文件管理器支持跨系统拖放，目标取得独立副本；场景和快照可通过底部按钮导出或从本机导入。文件复制与实时连接相互独立。
      </p>
      <h3>07 / 三维资源与飞行</h3>
      <p>
        /Demo/helicopter-24.scene 是 15 秒三维演出，30
        FPS，资源内含几何、材质、部件、灯光、镜头、时序和特效。/Demo/minimal.scene
        给出一个物体、一盏灯和一台相机的最小示例。编辑 nodes
        的位置、颜色、大小、形状，或 tracks
        的时刻和位姿，再打开资源即可改变画面。绘制设备不包含直升机模型。播放时由时序、飞行场景和环境特效三个进程协作。
      </p>
      <p>
        展开播放器底部控制台开始排演。飞控是 /Programs/flight.nest
        的普通程序；flight.sensor 返回 y、vy、roll 等值，flight.control
        写入总距、滚转与俯仰控制。physics.nest 是独立的 0.025 秒积分程序，按控制历史推进位置、姿态及接地。程序每 0.1
        虚拟秒尝试闭环，预算不足或持续计算竞争会让写入间隔拉长。不补发控制周期。可设置风、航向和故障。保存排演形成
        .replay，记录状态和控制历史，再打开可跳转回放。完整子树快照则包括进程、文件、时间和桌面。
      </p>
      <h3>09 / 新写一个有界面的程序</h3>
      <p>打开 /Programs/counter.nest 并运行。界面由程序调用 display.submit 提交 text、rect、line、circle、button、input 数据，按钮事件经窗口管理器回到 recv 收件箱。把 add 指令的 1 改为 7，重新运行后每次点击实际增加 7。该程序也可以替换文件管理器等应用的程序文件。put 修改私有对象，literal 声明常量数据；get、min、max、sin、cos 可用于计算。</p>
      <h3>08 / 快照与独立分支</h3>
      <p>
        系统树「创建快照」保存到父系统
        /Snapshots。选中快照可恢复原实例或分叉新实例。恢复只替换该子树；分叉使用新系统、窗口身份。外部图表数据源保持当前值，恢复后需要重新连接。快照文件导出后可以重启导入续行。
      </p>
    </article>
  );
}

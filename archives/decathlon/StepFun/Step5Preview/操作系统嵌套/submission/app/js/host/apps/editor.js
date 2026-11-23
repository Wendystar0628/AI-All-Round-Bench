// 根系统：文本与程序编辑器（可打开子系统内核源文件与飞控程序）
export function mountEditor(win, api) {
  win.bar.querySelector('.wtitle').textContent = '程序编辑器';
  let path = '';
  let dirty = false;
  let runPid = 0;
  const el = document.createElement('div');
  el.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;background:#121826;color:#e8ecf4;font:13px "Microsoft YaHei",sans-serif';
  el.innerHTML = `
    <div style="display:flex;gap:4px;padding:5px 6px;background:#1c2433;border-bottom:1px solid #33405a;align-items:center">
      <button data-a="open" class="ebtn">打开</button>
      <button data-a="save" class="ebtn">保存</button>
      <button data-a="saveas" class="ebtn">另存为</button>
      <button data-a="run" class="ebtn">运行</button>
      <button data-a="stop" class="ebtn">停止</button>
      <span id="p" style="color:#ffd23f;margin-left:6px"></span><span id="d" style="color:#ff5d6c"></span>
    </div>
    <textarea id="ta" spellcheck="false" style="flex:1;background:#0a0f18;border:none;color:#e8ecf4;padding:8px;font:13px Consolas,"Microsoft YaHei",monospace;resize:none;outline:none"></textarea>
    <div id="out" style="flex:0 0 130px;background:#070b12;border-top:1px solid #33405a;color:#7fd0ff;font:12px Consolas,monospace;padding:6px;overflow:auto;white-space:pre-wrap"></div>
    <style>.ebtn{background:#232d3f;border:1px solid #33405a;color:#e8ecf4;border-radius:5px;padding:2px 9px;font-size:12px;cursor:pointer}</style>`;
  win.body.appendChild(el);
  const ta = el.querySelector('#ta');
  const out = el.querySelector('#out');

  function refresh() {
    el.querySelector('#p').textContent = path;
    el.querySelector('#d').textContent = dirty ? '● 未保存' : '';
  }
  function load(p) {
    const c = api.fs.read(p);
    if (c === null) { out.textContent = '文件不存在: ' + p; return; }
    path = p; ta.value = c; dirty = false; refresh();
    out.textContent = '已打开 ' + p;
  }
  function save(p) {
    path = p || path;
    if (!path) { out.textContent = '请先另存为'; return; }
    const r = api.fs.write(path, ta.value);
    out.textContent = r ? '保存失败: ' + r : '已保存 ' + path;
    dirty = false; refresh(); api.refreshIcons();
  }
  ta.oninput = () => { dirty = true; refresh(); };

  el.querySelectorAll('button').forEach(b => b.onclick = () => {
    const a = b.dataset.a;
    if (a === 'open') { const p = prompt('文件路径（如 /System/Kernels/inner-1.osprog）', path || '/Documents/示例程序.osprog'); if (p) load(p); }
    else if (a === 'save') save();
    else if (a === 'saveas') { const p = prompt('另存为', path || '/Documents/新程序.osprog'); if (p) save(p); }
    else if (a === 'run') {
      if (!path) { out.textContent = '请先保存程序文件'; return; }
      if (dirty) save();
      const r = api.host.spawnRootProgram(path);
      if (r.error) out.textContent = '启动失败: ' + r.error;
      else { runPid = r.pid; out.textContent = '已启动进程 ' + runPid + '（' + path + '）\n'; }
    }
    else if (a === 'stop') { if (runPid) { api.host.killRootProc(runPid); out.textContent += '\n已结束进程 ' + runPid; runPid = 0; } }
  });

  // 输出刷新
  setInterval(() => {
    if (!runPid) return;
    const s = api.host.root;
    const lines = [];
    for (const e of s.console) if (e.pid === runPid) lines.push(e.text);
    out.textContent = '进程 ' + runPid + ' 输出:\n' + lines.slice(-14).join('\n');
  }, 400);

  win.api = { openPath: load, dispose: () => { } };
  refresh();
}

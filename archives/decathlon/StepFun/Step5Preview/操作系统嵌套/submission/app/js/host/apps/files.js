// 根系统：文件管理器
export function mountFiles(win, api) {
  const fs = api.fs;
  let path = '/Documents';
  let sel = -1;
  let clip = null;
  let msg = '';
  win.bar.querySelector('.wtitle').textContent = '文件管理器';

  const el = document.createElement('div');
  el.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;background:#121826;color:#e8ecf4;font:13px "Microsoft YaHei",sans-serif';
  el.innerHTML = `
    <div style="display:flex;gap:4px;padding:6px;background:#1c2433;border-bottom:1px solid #33405a;align-items:center">
      <button data-a="up" class="fbtn">上级</button>
      <button data-a="refresh" class="fbtn">刷新</button>
      <button data-a="newdir" class="fbtn">新建文件夹</button>
      <button data-a="rename" class="fbtn">重命名</button>
      <button data-a="del" class="fbtn">删除</button>
      <button data-a="copy" class="fbtn">复制</button>
      <button data-a="cut" class="fbtn">剪切</button>
      <button data-a="paste" class="fbtn">粘贴</button>
      <button data-a="export" class="fbtn">保存到本机</button>
      <button data-a="import" class="fbtn">从本机导入</button>
      <span id="pth" style="margin-left:8px;color:#ffd23f"></span>
    </div>
    <div style="display:flex;flex:0 0 22px;background:#0e1420;color:#93a1bb;font-size:11px;padding:2px 8px;gap:40px;border-bottom:1px solid #223">
      <span style="width:280px">名称</span><span style="width:80px">类型</span><span style="width:90px">大小</span><span>修改时间</span>
    </div>
    <div id="list" style="flex:1;overflow:auto;background:#0e1420" data-rootpath="${path}"></div>
    <div id="st" style="flex:0 0 24px;background:#1c2433;color:#43d9a3;font-size:12px;padding:3px 8px"></div>
    <style>.fbtn{background:#232d3f;border:1px solid #33405a;color:#e8ecf4;border-radius:5px;padding:2px 8px;font-size:12px;cursor:pointer}.fbtn:hover{background:#2f3c5c}
    .frow{display:flex;gap:40px;padding:3px 8px;font-size:12px;cursor:default;align-items:center}.frow:hover{background:#1a2231}.frow.sel{background:#2b3550}
    .frow span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}</style>`;
  win.body.appendChild(el);
  const listEl = el.querySelector('#list');
  const stEl = el.querySelector('#st');
  const pthEl = el.querySelector('#pth');

  function refresh() {
    listEl.dataset.rootpath = path;
    pthEl.textContent = path;
    const items = fs.list(path) || [];
    listEl.innerHTML = '';
    items.forEach((e, i) => {
      const row = document.createElement('div');
      row.className = 'frow' + (i === sel ? ' sel' : '');
      row.innerHTML = `<span style="width:280px">${e.type === 'dir' ? '📁' : '📄'} ${e.name}</span><span style="width:80px;color:#93a1bb">${e.type === 'dir' ? '文件夹' : ext(e.name)}</span><span style="width:90px;color:#93a1bb">${e.type === 'dir' ? '' : e.size + ' B'}</span><span style="color:#93a1bb">${new Date(e.mtime || 0).toLocaleString('zh-CN', { hour12: false })}</span>`;
      row.onclick = () => { sel = i; refresh(); };
      row.ondblclick = () => open(i);
      row.onpointerdown = (ev) => startDrag(ev, e);
      listEl.appendChild(row);
    });
    if (!msg) msg = items.length + ' 项';
    stEl.textContent = msg;
    msg = '';
  }

  function ext(n) { const i = n.lastIndexOf('.'); return i < 0 ? '' : n.slice(i); }
  function cur() { const items = fs.list(path) || []; return items[sel]; }

  function open(i) {
    const items = fs.list(path) || [];
    const e = items[i];
    if (!e) return;
    if (e.type === 'dir') { path = join(path, e.name); sel = -1; refresh(); }
    else api.openPath(join(path, e.name));
  }
  function join(a, b) { return a === '/' ? '/' + b : a + '/' + b; }

  el.querySelectorAll('button').forEach(b => {
    b.onclick = () => {
      const a = b.dataset.a;
      if (a === 'up') { if (path !== '/') { path = path.slice(0, path.lastIndexOf('/')) || '/'; sel = -1; refresh(); } }
      else if (a === 'refresh') refresh();
      else if (a === 'newdir') { const n = prompt('文件夹名称', '新建文件夹'); if (n) { const r = fs.mkdir(join(path, n)); msg = r || '已创建 ' + n; refresh(); } }
      else if (a === 'rename') { const e = cur(); if (!e) { msg = '请先选择'; refresh(); return; } const n = prompt('新名称', e.name); if (n && n !== e.name) { const r = fs.move(join(path, e.name), join(path, n)); msg = r || '已重命名'; refresh(); } }
      else if (a === 'del') { const e = cur(); if (!e) { msg = '请先选择'; refresh(); return; } const r = fs.move(join(path, e.name), '/回收站/' + e.name); msg = r || ('已移入回收站: ' + e.name); refresh(); api.refreshIcons(); }
      else if (a === 'copy') { const e = cur(); if (e) { clip = { op: 'copy', src: join(path, e.name) }; msg = '已复制 ' + e.name; } refresh(); }
      else if (a === 'cut') { const e = cur(); if (e) { clip = { op: 'move', src: join(path, e.name) }; msg = '已剪切 ' + e.name; } refresh(); }
      else if (a === 'paste') {
        if (!clip) { msg = '剪贴板为空'; refresh(); return; }
        const name = clip.src.split('/').pop();
        let dst = join(path, name), i = 1;
        while (fs.exists(dst)) { dst = join(path, i + '_' + name); i++; }
        const r = clip.op === 'copy' ? fs.copy(clip.src, dst) : fs.move(clip.src, dst);
        msg = r || ('已粘贴 ' + name);
        if (clip.op === 'move') clip = null;
        refresh();
      }
      else if (a === 'export') {
        const e = cur(); if (!e || e.type !== 'file') { msg = '请选择文件'; refresh(); return; }
        const content = fs.read(join(path, e.name));
        api.host.saveToLocal(e.name, content).then(p => { msg = '已保存到 ' + p; refresh(); });
      }
      else if (a === 'import') {
        api.host.importFromLocal().then(r => { if (r) { const w = fs.write(join(path, r.name), r.content); msg = w || ('已导入 ' + r.name); refresh(); api.refreshIcons(); } });
      }
    };
  });

  // 跨层拖放传出
  function startDrag(ev, e) {
    if (e.type !== 'file') return;
    let moved = false;
    const move = (e2) => {
      if (!moved && (Math.abs(e2.clientX - ev.clientX) + Math.abs(e2.clientY - ev.clientY)) > 6) {
        moved = true;
        api.host.beginDrag('outer', join(path, e.name), e.name);
      }
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  win.api = {
    openPath(p) {
      const i = p.lastIndexOf('/');
      path = p.slice(0, i) || '/';
      sel = -1;
      refresh();
      const items = fs.list(path) || [];
      const idx = items.findIndex(x => x.name === p.slice(i + 1));
      if (idx >= 0) { sel = idx; refresh(); open(idx); }
    },
    refresh: () => { refresh(); api.refreshIcons(); },
    dispose: () => { }
  };
  refresh();
}

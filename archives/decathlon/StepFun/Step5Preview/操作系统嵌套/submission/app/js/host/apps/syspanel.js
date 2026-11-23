// 根系统：系统管理面板（系统树 / 快照 / 分叉 / 资源）
export function mountSysPanel(win, api) {
  const host = api.host;
  win.bar.querySelector('.wtitle').textContent = '系统管理';
  const el = document.createElement('div');
  el.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;background:#121826;color:#e8ecf4;font:13px "Microsoft YaHei",sans-serif;overflow:auto;padding:10px';
  el.innerHTML = `
    <div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap">
      <button id="create" class="pbtn">创建子系统</button>
      <button id="snapall" class="pbtn">为选定子树保存快照</button>
      <button id="restore" class="pbtn">恢复快照</button>
      <button id="fork" class="pbtn">分叉快照</button>
      <button id="refresh" class="pbtn">刷新</button>
    </div>
    <div id="tree" style="font-size:12px"></div>
    <div id="detail" style="margin-top:10px;font-size:12px;color:#93a1bb"></div>
    <style>.pbtn{background:#232d3f;border:1px solid #33405a;color:#e8ecf4;border-radius:5px;padding:3px 10px;font-size:12px;cursor:pointer}
    .srow{padding:4px 6px;border-radius:6px;cursor:default;display:flex;gap:8px;align-items:center}
    .srow:hover{background:#1a2231}.srow.sel{background:#2b3550}</style>`;
  win.body.appendChild(el);
  let selId = null;

  function render() {
    let html = '';
    const walk = (id, depth) => {
      const s = host.systems.get(id);
      if (!s) return;
      const kids = [...s.procs.values()].filter(p => p.kind === 'carrier' && p.childSystemId);
      html += `<div class="srow ${selId === s.id ? 'sel' : ''}" data-id="${s.id}" style="padding-left:${6 + depth * 16}px">
        <span style="color:${s.ownPaused ? '#ffb347' : '#43d9a3'}">●</span>
        <span>${s.id}</span><span style="color:#93a1bb">${s.name}</span>
        <span style="color:#93a1bb">第${s.depth}层</span>
        <span style="color:#93a1bb">${s.rate}x</span>
        <span style="color:#93a1bb">${Math.floor(s.vtime)}ms</span>
        <span style="color:#93a1bb">内存${Math.round(s.memUsed() / 1000)}K</span>
        <span style="color:#93a1bb">${kids.length} 个子系统</span></div>`;
      for (const k of kids) walk(k.childSystemId, depth + 1);
    };
    walk('outer', 0);
    el.querySelector('#tree').innerHTML = html;
    el.querySelectorAll('.srow[data-id]').forEach(r => r.onclick = () => { selId = r.dataset.id; render(); });
    const s = selId ? host.systems.get(selId) : null;
    el.querySelector('#detail').innerHTML = s ? `
      <div>标识 ${s.id} · 父系统 ${s.parentId || '无'} · 内核源文件 ${s.kernelSourcePath || '(根系统由宿主实现)'}</div>
      <div>每步预算 ${s.config.budget} · 拨付上限 ${s.config.childGrant} · 进程 ${s.procs.size} 个 · 文件 ${s.vfs.countFiles()} 个 · 存储 ${s.vfs.size()} / ${s.config.storageQuota} B</div>
      <div>消息队列：内核收件箱 ${s.inbox.length} 条；投送 ${[...host.projections.values()].filter(p => p.sourceSystemId === s.id || p.targetSystemId === s.id).length} 个</div>` : '点击系统树中的一个实例查看详情';
  }

  el.querySelector('#create').onclick = () => { api.openApp('files'); api.desktop.createSystem(); render(); };
  el.querySelector('#refresh').onclick = render;
  el.querySelector('#snapall').onclick = () => {
    if (!selId) { api.notify('快照', '请先选择系统'); return; }
    const path = '/System/Snapshots/' + selId + '.ossnap';
    const r = host.saveSnapshotTo(host.root, selId, path);
    api.notify('快照', r.error || ('已保存 ' + path + '（' + Math.round((r.size || 0) / 1024) + ' KB）'));
    render();
  };
  el.querySelector('#restore').onclick = () => {
    const path = prompt('快照文件路径', '/System/Snapshots/inner-1.ossnap');
    if (!path) return;
    const r = host.restoreSnapshot(host.root, path, false);
    api.notify('恢复', r.error || ('已恢复 ' + (r.ids || []).join(', ')));
    render();
  };
  el.querySelector('#fork').onclick = () => {
    const path = prompt('快照文件路径', '/System/Snapshots/inner-1.ossnap');
    if (!path) return;
    const r = host.restoreSnapshot(host.root, path, true);
    api.notify('分叉', r.error || ('已创建独立子树 ' + (r.ids || []).join(', ')));
    render();
  };
  win.api = { dispose: () => { } };
  render();
}

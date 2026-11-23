// 根系统：任务管理器（进程 / 系统树 / 资源配额 / 浏览器标签）
export function mountTaskMgr(win, api) {
  win.bar.querySelector('.wtitle').textContent = '任务管理器';
  const host = api.host;
  const el = document.createElement('div');
  el.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;background:#121826;color:#e8ecf4;font:13px "Microsoft YaHei",sans-serif';
  el.innerHTML = `
    <div style="display:flex;gap:6px;padding:6px;background:#1c2433;border-bottom:1px solid #33405a;align-items:center;flex-wrap:wrap">
      <span id="sum" style="color:#ffd23f"></span>
      <button id="refresh" class="tbtn">刷新</button>
      <button id="sus" class="tbtn">挂起</button>
      <button id="res" class="tbtn">继续</button>
      <button id="kill" class="tbtn">结束</button>
    </div>
    <div style="display:flex;flex:1;overflow:hidden">
      <div id="procs" style="flex:1.2;overflow:auto;background:#0e1420"></div>
      <div style="flex:1;overflow:auto;background:#101623;border-left:1px solid #223">
        <div style="padding:8px;color:#ffd23f;font-size:12px">系统树</div>
        <div id="tree"></div>
        <div style="padding:8px;color:#ffd23f;font-size:12px">资源配置</div>
        <div id="cfg" style="padding:0 8px 8px"></div>
        <div style="padding:8px;color:#ffd23f;font-size:12px">浏览器网页视图</div>
        <div id="webs" style="padding:0 8px 8px;font-size:12px;color:#93a1bb"></div>
      </div>
    </div>
    <style>.tbtn{background:#232d3f;border:1px solid #33405a;color:#e8ecf4;border-radius:5px;padding:2px 9px;font-size:12px;cursor:pointer}
    .prow{display:grid;grid-template-columns:44px 1.4fr 70px 80px 80px 1fr;gap:6px;padding:3px 8px;font-size:12px;cursor:default}
    .prow:hover{background:#1a2231}.prow.sel{background:#2b3550}.prow.head{color:#93a1bb;background:#1c2433}
    .cfgrow{display:flex;gap:6px;align-items:center;font-size:12px;padding:2px 0}
    .cfgrow input{width:70px;background:#0a0f18;border:1px solid #33405a;color:#e8ecf4;border-radius:4px;padding:1px 4px}</style>`;
  win.body.appendChild(el);
  const procsEl = el.querySelector('#procs');
  let selPid = null;

  function fmt(n) { return n >= 1000000 ? (n / 1000000).toFixed(2) + 'M' : n >= 1000 ? (n / 1000).toFixed(1) + 'K' : String(n); }

  function render() {
    const root = host.root;
    const carriers = [...root.procs.values()].filter(p => p.kind === 'carrier' || p.kind === 'demo' || p.kind === 'kernel');
    let html = '<div class="prow head"><span>PID</span><span>名称</span><span>类型</span><span>状态</span><span>已用指令</span><span>归属 / 错误</span></div>';
    for (const p of [...root.procs.values()]) {
      const child = p.childSystemId ? host.systems.get(p.childSystemId) : null;
      const childInfo = child ? `→ ${child.id}${child.ownPaused ? '(暂停)' : ''}` : '根系统';
      html += `<div class="prow ${selPid === p.pid ? 'sel' : ''}" data-pid="${p.pid}"><span>${p.pid}</span><span>${p.name}</span><span>${p.kind}</span><span>${p.status}</span><span>${fmt(p.used)}</span><span>${childInfo}${p.err ? ' · ' + p.err : ''}</span></div>`;
    }
    procsEl.innerHTML = html;
    procsEl.querySelectorAll('.prow[data-pid]').forEach(r => r.onclick = () => { selPid = +r.dataset.pid; render(); });

    // 系统树
    let tree = '';
    const walk = (id, depth) => {
      const s = host.systems.get(id);
      if (!s) return;
      tree += `<div style="padding:2px 0;font-size:12px;${'padding-left:' + (depth * 14) + 'px'}">${s.id} · ${s.name} · ${s.ownPaused ? '暂停' : '运行'} · ${s.rate}x · 虚拟时间 ${Math.floor(s.vtime)}ms</div>`;
      for (const p of s.procs.values()) if (p.kind === 'carrier' && p.childSystemId) walk(p.childSystemId, depth + 1);
    };
    walk('outer', 0);
    el.querySelector('#tree').innerHTML = tree;

    // 配置
    const c = root.config;
    const cfg = el.querySelector('#cfg');
    cfg.innerHTML = `
      <div class="cfgrow">每步总预算 <input id="c_budget" value="${c.budget}"></div>
      <div class="cfgrow">子系统拨付上限 <input id="c_childGrant" value="${c.childGrant}"></div>
      <div class="cfgrow">内存配额 <input id="c_memQuota" value="${c.memQuota}"></div>
      <div class="cfgrow">存储配额 <input id="c_storageQuota" value="${c.storageQuota}"></div>`;
    cfg.querySelectorAll('input').forEach(inp => inp.onchange = () => {
      const k = inp.id.slice(2);
      const v = parseInt(inp.value, 10);
      if (isFinite(v) && v > 0) { root.config[k] = v; api.notify('已调整', k + ' = ' + v); }
      render();
    });

    const sum = el.querySelector('#sum');
    sum.textContent = `总预算 ${c.budget}/步 · 已用 ${fmt(root.stepUsed || 0)} · 内存 ${fmt(root.memUsed())} / ${fmt(c.memQuota)} · 存储 ${fmt(root.vfs.size())} / ${fmt(c.storageQuota)}`;
    const webs = el.querySelector('#webs');
    const list = host.browserTabs ? host.browserTabs() : [];
    webs.innerHTML = list.length ? list.map(t => `<div>${t.url || '(空)'} · ${t.loadState}</div>`).join('') : '（无浏览器标签）';
  }

  el.querySelector('#refresh').onclick = render;
  el.querySelector('#sus').onclick = () => { const p = host.root.getProc(selPid); if (p) { p.status = 'suspended'; p.blocked = null; render(); } };
  el.querySelector('#res').onclick = () => { const p = host.root.getProc(selPid); if (p && p.status === 'suspended') { p.status = 'ready'; render(); } };
  el.querySelector('#kill').onclick = () => {
    const p = host.root.getProc(selPid);
    if (!p) return;
    if (p.kind === 'carrier' && p.childSystemId) {
      if (!confirm('结束该承载进程将停止整个子系统子树，确定吗？')) return;
      host.destroySubtree(p.childSystemId, false);
    } else { p.status = 'ended'; p.blocked = null; p._queue = []; }
    render();
  };
  win.api = { dispose: () => { } };
  render();
  const t = setInterval(render, 1200);
  win.api.dispose = () => clearInterval(t);
}

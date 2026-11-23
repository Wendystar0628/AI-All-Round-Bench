// 根系统窗口：承载子系统桌面
export function mountSystemView(win, api) {
  const system = win._opts && win._opts.system;
  win.bar.querySelector('.wtitle').textContent = system ? `${system.id} · ${system.name} · 子系统桌面` : '子系统桌面';
  const el = document.createElement('div');
  el.style.cssText = 'position:absolute;inset:0;background:#0f141d;overflow:hidden';
  win.body.appendChild(el);
  const bar = document.createElement('div');
  bar.style.cssText = 'height:26px;display:flex;gap:4px;align-items:center;padding:0 6px;background:#1c2433;border-bottom:1px solid #33405a;font-size:11px;color:#93a1bb';
  bar.innerHTML = `<span class="st" style="color:#43d9a3"></span>
    <button class="sb" data-a="pause">暂停</button><button class="sb" data-a="resume">继续</button>
    <button class="sb" data-a="step">单步</button><button class="sb" data-a="rate">调速</button>
    <button class="sb" data-a="restart">重启</button><button class="sb" data-a="close">关闭子树</button>
    <span style="margin-left:auto" class="tm"></span>`;
  el.appendChild(bar);
  const host2 = document.createElement('div');
  host2.style.cssText = 'position:absolute;left:0;right:0;top:26px;bottom:0;overflow:hidden';
  el.appendChild(host2);
  if (system) {
    api.host.view2d.ensure(system);
    host2.appendChild(api.host.view2d.views.get(system.id).el);
    const v = api.host.view2d.views.get(system.id);
    const place = () => {
      const r = host2.getBoundingClientRect();
      v.el.style.left = '0px'; v.el.style.top = '0px';
      v.el.style.width = r.width + 'px'; v.el.style.height = r.height + 'px';
      system.vw = r.width; system.vh = r.height;
      system.pushInbox({ t: 'viewport', w: Math.round(r.width), h: Math.round(r.height) });
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(host2);
    win.onResize = place;
  }
  const st = bar.querySelector('.st'), tm = bar.querySelector('.tm');
  function tick() {
    if (!system) return;
    st.textContent = system.effectivePaused() ? (system.ownPaused ? '已暂停' : '随祖先暂停') : '运行中';
    st.style.color = system.effectivePaused() ? '#ffb347' : '#43d9a3';
    tm.textContent = `虚拟时间 ${Math.floor(system.vtime)} ms · 速率 ${system.rate}x · 内存 ${Math.round(system.memUsed() / 1000)}K`;
  }
  tick();
  const t = setInterval(tick, 500);
  bar.querySelectorAll('.sb').forEach(b => b.onclick = () => {
    const a = b.dataset.a;
    if (a === 'pause') { system.ownPaused = true; api.notify('已暂停', system.id + ' 整棵子树停止推进'); }
    else if (a === 'resume') { system.ownPaused = false; api.notify('已继续', system.id); }
    else if (a === 'step') { const r = api.host.singleStep(system.id); api.notify('单步', r.error || ('推进 ' + Math.round(r.dt) + ' ms')); }
    else if (a === 'rate') { const v = prompt('时间速率（0.1 ~ 20）', String(system.rate)); if (v) { system.rate = Math.max(0.1, Math.min(20, parseFloat(v) || 1)); api.notify('调速', system.id + ' → ' + system.rate + 'x'); } }
    else if (a === 'restart') { const r = api.host.restartSubtree(system.id); api.notify('重启', r.error || '已按保留的文件重新启动'); }
    else if (a === 'close') { if (confirm('关闭将停止整个子树，确定吗？')) { api.host.destroySubtree(system.id, false); } }
    tick();
  });
  win.api = { dispose: () => clearInterval(t) };
}

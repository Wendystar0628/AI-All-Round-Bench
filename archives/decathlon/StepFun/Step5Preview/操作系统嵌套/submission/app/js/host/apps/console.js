// 根系统：程序控制台（启动演示程序并查看输出）
export function mountConsole(win, api) {
  win.bar.querySelector('.wtitle').textContent = '程序控制台';
  const el = document.createElement('div');
  el.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;background:#0b1018;color:#e8ecf4;font:13px "Microsoft YaHei",sans-serif';
  el.innerHTML = `
    <div style="display:flex;gap:4px;padding:6px;background:#1c2433;border-bottom:1px solid #33405a;flex-wrap:wrap">
      <button data-p="/Demo/Accumulate.osprog" class="cbtn">累加计算</button>
      <button data-p="/Demo/SendMsg.osprog" class="cbtn">消息发送</button>
      <button data-p="/Demo/RecvMsg.osprog" class="cbtn">消息接收</button>
      <button data-p="/Demo/Compute.osprog" class="cbtn">持续计算</button>
      <button id="stopall" class="cbtn">全部结束</button>
      <input id="pth" placeholder="程序路径" style="flex:1;min-width:160px;background:#0a0f18;border:1px solid #33405a;color:#e8ecf4;border-radius:5px;padding:2px 8px;font-size:12px">
      <button id="runp" class="cbtn">运行</button>
    </div>
    <div id="out" style="flex:1;overflow:auto;padding:8px;font:12px Consolas,monospace;color:#7fd0ff;white-space:pre-wrap"></div>
    <style>.cbtn{background:#232d3f;border:1px solid #33405a;color:#e8ecf4;border-radius:5px;padding:2px 10px;font-size:12px;cursor:pointer}</style>`;
  win.body.appendChild(el);
  const out = el.querySelector('#out');
  const running = [];
  function render() {
    const lines = [];
    for (const e of api.host.root.console) lines.push((e.name ? '[' + e.name + '] ' : '') + e.text);
    out.textContent = lines.slice(-30).join('\n');
    out.scrollTop = out.scrollHeight;
  }
  el.querySelectorAll('button[data-p]').forEach(b => b.onclick = () => {
    const r = api.host.spawnRootProgram(b.dataset.p);
    if (r.error) out.textContent += '\n启动失败: ' + r.error;
    else { running.push(r.pid); out.textContent += '\n已启动 ' + b.dataset.p + ' (pid ' + r.pid + ')'; }
    render();
  });
  el.querySelector('#runp').onclick = () => {
    const p = el.querySelector('#pth').value.trim();
    if (!p) return;
    const r = api.host.spawnRootProgram(p);
    out.textContent += r.error ? '\n启动失败: ' + r.error : '\n已启动 ' + p + ' (pid ' + r.pid + ')';
    if (!r.error) running.push(r.pid);
    render();
  };
  el.querySelector('#stopall').onclick = () => { running.forEach(p => api.host.killRootProc(p)); running.length = 0; render(); };
  win.api = { dispose: () => { } };
  render();
  const t = setInterval(render, 600);
  win.api.dispose = () => clearInterval(t);
}

// 根系统：操作说明（渲染项目内说明文档）
export function mountHelp(win, api) {
  win.bar.querySelector('.wtitle').textContent = '操作说明';
  const el = document.createElement('div');
  el.style.cssText = 'position:absolute;inset:0;overflow:auto;background:#121826;color:#dfe6f2;font:13px/1.7 "Microsoft YaHei",sans-serif;padding:18px 22px';
  win.body.appendChild(el);
  fetch('docs/manual.md').then(r => r.text()).then(t => { el.innerHTML = md(t); }).catch(() => {
    const c = api.fs.read('/Documents/操作说明.txt');
    el.innerHTML = c ? '<pre style="white-space:pre-wrap">' + escapeHtml(c) + '</pre>' : '未找到说明文档';
  });
  function escapeHtml(s) { return String(s).replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch])); }
  function md(t) {
    const lines = t.split('\n');
    let html = '', inCode = false, inList = false;
    for (const l of lines) {
      if (l.startsWith('```')) { html += inCode ? '</pre>' : '<pre style="background:#0a0f18;border:1px solid #33405a;border-radius:8px;padding:10px;overflow:auto;font-size:12px">'; inCode = !inCode; continue; }
      if (inCode) { html += escapeHtml(l) + '\n'; continue; }
      if (l.startsWith('### ')) { html += `<h3 style="color:#8b6cff;margin:14px 0 6px">${inline(l.slice(4))}</h3>`; continue; }
      if (l.startsWith('## ')) { html += `<h2 style="color:#ffd23f;margin:18px 0 8px;border-bottom:1px solid #33405a;padding-bottom:4px">${inline(l.slice(3))}</h2>`; continue; }
      if (l.startsWith('# ')) { html += `<h1 style="color:#ffd23f;margin:6px 0 12px">${inline(l.slice(2))}</h1>`; continue; }
      if (l.startsWith('- ')) { html += `<li style="margin-left:18px">${inline(l.slice(2))}</li>`; continue; }
      if (l.trim() === '') { html += '<div style="height:6px"></div>'; continue; }
      html += `<p style="margin:4px 0">${inline(l)}</p>`;
    }
    return html;
  }
  function inline(s) {
    return escapeHtml(s).replace(/`([^`]+)`/g, '<code style="background:#0a0f18;border:1px solid #33405a;border-radius:4px;padding:0 4px;color:#7fd0ff">$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  }
  win.api = { dispose: () => { } };
}

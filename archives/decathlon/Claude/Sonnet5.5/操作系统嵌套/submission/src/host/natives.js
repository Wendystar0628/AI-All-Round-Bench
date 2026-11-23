// 原生应用（电子表格、浏览器、操作说明）：由宿主承载内容，但窗口框、层叠、焦点与关闭由系统的窗口管理程序决定。
import { newMap } from './vm.js';
import { SheetApp } from './sheet.js';
import { BrowserApp } from './browser.js';

function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function inline(s) {
  return esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="#">$1</a>');
}
export function renderMarkdown(md) {
  const lines = md.replace(/\r/g, '').split('\n'); let html = ''; let i = 0; let list = null;
  const closeList = () => { if (list) { html += '</' + list + '>'; list = null; } };
  while (i < lines.length) {
    const l = lines[i];
    if (/^```/.test(l)) { closeList(); let code = ''; i++; while (i < lines.length && !/^```/.test(lines[i])) { code += lines[i] + '\n'; i++; } i++; html += '<pre>' + esc(code) + '</pre>'; continue; }
    const h = /^(#{1,4})\s+(.*)$/.exec(l);
    if (h) { closeList(); const n = h[1].length; html += `<h${n} id="h-${i}">${inline(h[2])}</h${n}>`; i++; continue; }
    if (/^\s*\|.*\|\s*$/.test(l) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      closeList(); const head = l.trim().slice(1, -1).split('|').map((x) => x.trim()); i += 2; let rows = '';
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { rows += '<tr>' + lines[i].trim().slice(1, -1).split('|').map((x) => '<td>' + inline(x.trim()) + '</td>').join('') + '</tr>'; i++; }
      html += '<table><thead><tr>' + head.map((x) => '<th>' + inline(x) + '</th>').join('') + '</tr></thead><tbody>' + rows + '</tbody></table>'; continue;
    }
    const li = /^\s*([-*]|\d+\.)\s+(.*)$/.exec(l);
    if (li) { const tag = /\d/.test(li[1]) ? 'ol' : 'ul'; if (list !== tag) { closeList(); html += '<' + tag + '>'; list = tag; } html += '<li>' + inline(li[2]) + '</li>'; i++; continue; }
    if (/^\s*$/.test(l)) { closeList(); i++; continue; }
    closeList(); html += '<p>' + inline(l) + '</p>'; i++;
  }
  closeList(); return html;
}

const HELP_CSS = `
.help{position:absolute;inset:0;display:flex;background:#14111f;color:#ece9ff;font:14px/1.75 "Microsoft YaHei UI","Segoe UI",sans-serif;user-select:text}
.help .toc{width:220px;flex:none;overflow:auto;background:#181430;border-right:1px solid #3a3366;padding:14px 8px}
.help .toc div{padding:5px 10px;border-radius:7px;cursor:pointer;color:#a49ecb;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.help .toc div:hover{background:#2d2752;color:#fff}
.help .toc .l1{font-weight:700;color:#ece9ff;margin-top:6px}.help .toc .l3{padding-left:24px;font-size:12px}
.help .body{flex:1;overflow:auto;padding:20px 34px 60px}
.help h1{font-size:26px;color:#ffc83d;margin:0 0 14px}.help h2{font-size:20px;color:#b9a6ff;margin:30px 0 10px;border-bottom:1px solid #3a3366;padding-bottom:6px}.help h3{font-size:16px;color:#ece9ff;margin:22px 0 8px}.help h4{font-size:14px;color:#a49ecb}
.help code{background:#2d2752;color:#ffd978;padding:1px 6px;border-radius:5px;font:12.5px "Cascadia Mono",Consolas,monospace}
.help pre{background:#0b0818;border:1px solid #3a3366;border-radius:10px;padding:12px 16px;overflow:auto;font:12.5px/1.6 "Cascadia Mono",Consolas,"Microsoft YaHei UI",monospace;color:#e6e0ff}
.help table{border-collapse:collapse;margin:10px 0;font-size:13px}.help th,.help td{border:1px solid #3a3366;padding:6px 12px;text-align:left}.help th{background:#221d40}
.help p{margin:8px 0}.help li{margin:3px 0}.help a{color:#8b6cff}
`;
let helpCss = false;
class HelpApp {
  constructor(machine, nid, extra, ctx) {
    this.nid = nid; this.kind = 'help'; this.app = 'help'; this.ctx = ctx; this.title = '操作说明'; this.machine = machine; this.closed = false;
    if (!helpCss) { const st = document.createElement('style'); st.textContent = HELP_CSS; document.head.appendChild(st); helpCss = true; }
    const root = this.root = document.createElement('div'); root.className = 'help'; root.dataset.testid = 'help-view';
    root.innerHTML = '<div class="toc"></div><div class="body"></div>';
    const e = machine.root.disk.get('/Documents/操作说明.md');
    const md = e && e.data ? e.data : '# 操作说明\n\n找不到 /Documents/操作说明.md。';
    root.querySelector('.body').innerHTML = renderMarkdown(md);
    const toc = root.querySelector('.toc');
    for (const h of root.querySelectorAll('.body h1,.body h2,.body h3')) {
      const d = document.createElement('div'); d.className = 'l' + h.tagName[1]; d.textContent = h.textContent; d.onclick = () => h.scrollIntoView({ behavior: 'smooth', block: 'start' }); toc.appendChild(d);
    }
    ctx.register(this);
  }
  info() { return { nid: this.nid, app: 'help', title: '操作说明', kind: 'doc', views: 0 }; }
  mountTo(el) { el.appendChild(this.root); } unmount() { } resize() { } requestClose() { return true; }
  destroy() { if (this.closed) return; this.closed = true; this.root.remove(); this.ctx.unregister(this); }
}

export function installNatives(machine, display, env) {
  const D = machine.devs; const svc = machine.services; let nidSeq = 1;
  const insts = display.natives;
  svc.browserInfo = () => { const out = []; for (const i of insts.values()) if (i.kind === 'web') out.push(...i.tabsInfo()); return out; };
  const ctx = {
    register(inst) { insts.set(inst.nid, inst); },
    unregister(inst) { insts.delete(inst.nid); if (inst.kind === 'sheet' && svc.data) svc.data.sourceClosed(inst.docId); },
    publish(wb, cost) { svc.data && svc.data.publish(wb, cost); },
    clipPush(text) { svc.clip.unshift({ text, kind: 'table', t: machine.clock, sys: 'outer' }); if (svc.clip.length > 40) svc.clip.length = 40; },
    notify(title, text, kind) { machine.postEvent('outer', { k: 'notify', title, text, kind: kind || 'info' }); },
    fsChanged() { machine.postEvent('outer', { k: 'fsrev' }); },
    closeSelf(inst) { inst.destroy(); },
    focusWindow(inst) {
      const el = inst.root; if (!el) return; const r = el.getBoundingClientRect(); const s = document.getElementById('screen'); const sr = s.getBoundingClientRect(); const sc = sr.width / (s.offsetWidth || sr.width) || 1;
      const x = (r.left + r.width / 2 - sr.left) / sc, y = (r.top + 8 - sr.top) / sc;
      machine.events.push({ k: 'input', path: [], ev: { type: 'down', x, y, b: 0, native: true } }, { k: 'input', path: [], ev: { type: 'up', x, y, b: 0 } });
    },
  };
  D.native = {
    open(osys, [c, app, extra]) {
      if (osys.id !== 'outer') return newMap({ err: '宿主承载的应用只在根系统桌面提供' });
      const nid = nidSeq++; const ex = extra || {};
      let inst;
      try {
        if (app === 'spreadsheet') inst = new SheetApp(machine, nid, ex, ctx);
        else if (app === 'browser') inst = new BrowserApp(machine, nid, ex, ctx);
        else if (app === 'help') inst = new HelpApp(machine, nid, ex, ctx);
        else return newMap({ err: '未知应用 ' + app });
      } catch (e) { console.error(e); return newMap({ err: '启动失败：' + e.message }); }
      return newMap({ nid });
    },
    close(osys, [c, nid, force]) {
      const inst = insts.get(nid); if (!inst) return true;
      if (!force && inst.requestClose && !inst.requestClose()) return newMap({ pending: true });
      inst.destroy(); return true;
    },
    list() { return [...insts.values()].map((i) => newMap(i.info())); },
  };
  env.api.on('browser:newwindow', ({ from, url }) => { for (const i of insts.values()) if (i.kind === 'web' && i.onNewWindow(from, url)) return; });
  env.api.on('browser:download', ({ name, path, state, size }) => {
    if (state === 'completed') {
      machine.devs.disk.put.call(machine, machine.root, ['/Downloads/' + name + '（下载记录）.txt', '已下载：' + name + '\n大小：' + size + ' 字节\n本机保存位置：' + path + '\n', false, machine.clock]);
      ctx.fsChanged(); ctx.notify('下载完成', name + '（' + size + ' 字节）', 'ok');
    } else ctx.notify('下载未完成', name, 'error');
  });
  svc.nativeCtx = ctx;
}

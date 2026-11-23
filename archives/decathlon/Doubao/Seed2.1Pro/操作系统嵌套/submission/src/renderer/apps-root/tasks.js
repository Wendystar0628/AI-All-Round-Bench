/* 根系统任务管理器：根应用、自定义进程（子系统承载，内核+内部工作读数）、网页视图 */
'use strict';
window.NOS = window.NOS || {};

class RootTasks {
  open() {
    this.win = NOS.desktop.openWindow('tasks', '任务管理器', { w: 880, h: 560, model: this });
    this.timer = setInterval(() => { if (this.win && !this.win.min) this.render(); }, 800);
    this.render();
  }
  unmount() { clearInterval(this.timer); }
  render() {
    const c = this.win.contentEl;
    c.innerHTML = '';
    c.classList.add('tasks-app');
    const head = NOS.h('h3', {}, '进程与资源');
    c.appendChild(head);

    const root = NOS.rootVM;
    const totalGrant = 60000;
    const summary = NOS.h('div', { class: 'res-summary', dataTestid: 'tasks-budget' },
      `根系统逻辑预算/步: ${totalGrant} 指令 · 直属承载: ${root.children.length} 个 · 时间: ${Math.round(root.time)}ms`);
    c.appendChild(summary);

    // 预算调整
    const ctrl = NOS.h('div', { class: 'tb' });
    const childSel = NOS.h('select', {});
    root.children.forEach(ch => childSel.appendChild(NOS.h('option', { value: ch.id }, `${ch.id} (${ch.state})`)));
    const grant = NOS.h('input', { type: 'number', value: 42000, dataTestid: 'tasks-grant-input' });
    const apply = NOS.h('button', { class: 'btn', dataTestid: 'tasks-grant' }, '调整拨付');
    apply.addEventListener('click', () => {
      const ch = root.findInstance(childSel.value);
      if (ch) ch._rootGrant = Number(grant.value);
    });
    ctrl.append(NOS.h('label', {}, '子系统 '), childSel, NOS.h('label', {}, '拨付 '), grant, apply);
    c.appendChild(ctrl);

    const tbl = NOS.h('table', { class: 'ptable' });
    tbl.innerHTML = '<tr><th>名称</th><th>类型</th><th>状态</th><th>工作量(指令)</th><th>内存</th><th>说明</th><th>操作</th></tr>';
    // 根应用
    for (const [app, name] of [['files', '文件管理器'], ['spreadsheet', '电子表格'], ['editor', '编辑器'], ['browser', '浏览器(Chromium)'], ['settings', '设置'], ['widgets', '小组件']]) {
      const w = [...NOS.desktop.windows.values()].find(x => x.app === app);
      const tr = NOS.h('tr', {});
      const isBrowser = app === 'browser';
      tr.innerHTML = `<td>${name}</td><td>${isBrowser ? '网页视图' : '根应用'}</td><td>${w ? (w.min ? '最小化' : '运行') : '未运行'}</td><td>${isBrowser ? '不计入' : '宿主直接实现'}</td><td>-</td><td>${isBrowser ? '单独列出，不占自定义指令' : ''}</td>`;
      const td = NOS.h('td', {});
      if (w) {
        const k = NOS.h('button', { class: 'btn small danger' }, '结束窗口');
        k.addEventListener('click', () => NOS.desktop.closeWindow(w.id));
        td.appendChild(k);
      }
      tr.appendChild(td);
      tbl.appendChild(tr);
    }
    // 浏览器 webview 单独列出
    const browser = NOS.rootApps.browser;
    if (browser && browser.tabs) {
      browser.tabs.forEach(t => {
        const tr = NOS.h('tr', {});
        tr.innerHTML = `<td>标签 ${t.id}</td><td>Chromium 网页</td><td>${t.loadState}</td><td>不计入</td><td>-</td><td>${(t.url || '').slice(0, 40)}</td><td></td>`;
        tbl.appendChild(tr);
      });
    }
    // 直属子系统承载
    const addChild = (ch, depth) => {
      const tr = NOS.h('tr', { class: 'child-row' });
      const kernelUsed = ch.kernelProc ? ch.kernelProc.usedTotal : 0;
      let userUsed = 0;
      ch.procs.filter(p => p.pid !== 1).forEach(p => userUsed += p.usedTotal);
      tr.innerHTML = `<td>${'　'.repeat(depth)}${ch.id}</td><td>承载进程${depth ? ' (嵌套)' : ''}</td><td><span class="st st-${ch.state}">${ch.state}</span>${ch.kernelError ? ' <span class="err">' + ch.kernelError + '</span>' : ''}</td>
        <td>内核 ${kernelUsed} / 内部 ${userUsed}</td><td>-</td><td>拨付 ${ch.grantToMe}</td>`;
      const td = NOS.h('td', {});
      const pause = NOS.h('button', { class: 'btn small' }, ch.state === 'paused' ? '继续' : '暂停');
      pause.addEventListener('click', () => ch.state === 'paused' ? ch.resumeTree() : ch.pauseTree());
      const kill = NOS.h('button', { class: 'btn small danger' }, '结束承载');
      kill.addEventListener('click', () => { ch.stopTree(); });
      td.append(pause, kill);
      tr.appendChild(td);
      tbl.appendChild(tr);
      ch.children.forEach(g => addChild(g, depth + 1));
    };
    root.children.forEach(ch => addChild(ch, 0));
    c.appendChild(tbl);
  }
}
NOS.RootTasks = RootTasks;

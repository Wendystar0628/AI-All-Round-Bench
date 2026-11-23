// Root Task Manager & Recursive System Tree Manager ('tasks')
// Shows:
//  - Root system total budget, memory & storage quotas
//  - Full recursive system tree (outer -> inner-1 -> inner-2 -> inner-3...) with controls
//  - Direct child carriers with separate Kernel Self vs Child Work readouts & grant cap controls
//  - Root custom .nos processes (suspend/resume/kill/quota)
//  - Dedicated Chromium Browser Web Views section (explicitly NOT counted in logical op budget!)

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtBytes(b) {
  const n = Number(b || 0);
  if (n >= 1048576) return (n / 1048576).toFixed(2) + ' MB';
  if (n >= 1024) return (n / 1024).toFixed(1) + ' KB';
  return n + ' B';
}

export function mountRootTasksApp(os, win, bodyEl) {
  let statusMsg = '根系统任务与系统树监控中（步长 33.33ms / 30fps）';

  const renderTreeNodes = (nodes, depth = 0) => {
    let html = '';
    for (const n of nodes) {
      const indent = depth * 16;
      const isDirect = n.parentId === 'outer';
      html += `
        <div class="tree-node" style="padding-left:${indent + 8}px">
          <span class="tn-id">${esc(n.id)}</span>
          <span class="tn-name">${esc(n.name)}</span>
          <span class="tm-st st-${esc(n.state)}">${n.state === 'error' ? '内核错误' : (n.state === 'paused' ? '暂停' : '运行中')}</span>
          <span class="tn-meta">L${depth + 2} · T=${Number(n.vtime || 0).toFixed(1)}s · ${Number(n.timeRate || 1).toFixed(1)}x</span>
          ${isDirect ? `<span class="tn-direct-tag">直属</span>` : `<span class="tn-sub-tag">父:${esc(n.parentId)}</span>`}
        </div>
      `;
      if (n.children && n.children.length > 0) {
        html += renderTreeNodes(n.children, depth + 1);
      }
    }
    return html;
  };

  const render = () => {
    const active = document.activeElement;
    if (active && bodyEl.contains(active) && (active.tagName === 'INPUT' || active.tagName === 'SELECT')) {
      const summ = bodyEl.querySelector('.tm-live-summary');
      if (summ) {
        summ.textContent = `总预算 ${os.budgetConfig}/步 | 本步消耗 ${os.lastTickUsed} | 内存 ${fmtBytes(os.getTotalMemUsed())}/${fmtBytes(os.memQuota)} | 存储 ${fmtBytes(os.getStorageUsed())}/${fmtBytes(os.storageQuota)}`;
      }
      return;
    }

    const tree = os.getSystemTreeHierarchy();
    const carriers = Array.from(os.children.values());
    const browserTabs = os.getAllBrowserTabs();

    bodyEl.innerHTML = `
      <div class="tasks-shell root-tasks-shell">
        <div class="tm-header-row">
          <div class="tm-live-summary">总预算 ${os.budgetConfig}/步 | 本步消耗 ${os.lastTickUsed} | 内存 ${fmtBytes(os.getTotalMemUsed())}/${fmtBytes(os.memQuota)} | 存储 ${fmtBytes(os.getStorageUsed())}/${fmtBytes(os.storageQuota)}</div>
          <div class="tm-cfg-row">
            <label>总预算 <input type="number" class="nos-input-xs" step="10000" value="${os.budgetConfig}" data-testid="tasks-budget" data-system-id="outer" data-window-id="${win.id}" data-cfg="budget"/></label>
            <label>内存(MB) <input type="number" class="nos-input-xxs" step="16" value="${Math.round(os.memQuota / 1048576)}" data-testid="tasks-memory" data-system-id="outer" data-window-id="${win.id}" data-cfg="memory"/></label>
            <label>存储(MB) <input type="number" class="nos-input-xxs" step="8" value="${Math.round(os.storageQuota / 1048576)}" data-testid="tasks-storage" data-system-id="outer" data-window-id="${win.id}" data-cfg="storage"/></label>
            <button class="btn-xs btn-accent" data-testid="system-new" data-system-id="outer" data-window-id="${win.id}" data-act="new_sub">+ 新建子系统</button>
            <button class="btn-xs" data-act="import_snap">从本机导入快照分叉</button>
            <button class="btn-xs" data-act="run_busy">运行 busy.nos</button>
          </div>
        </div>

        <!-- 递归系统树视图 -->
        <div class="tm-section">
          <div class="tm-sec-title">递归系统树 (outer · 根系统 + ${os.countAllSubsystems()} 个子系统实例)</div>
          <div class="tree-box">
            <div class="tree-node tree-root">
              <span class="tn-id">outer</span>
              <span class="tn-name">${esc(os.settings.systemName)} (根系统)</span>
              <span class="tm-st st-running">运行中</span>
              <span class="tn-meta">L1 · T=${os.vtime.toFixed(1)}s</span>
            </div>
            ${tree.length > 0 ? renderTreeNodes(tree, 0) : `<div class="tm-empty-sub">尚未启动子系统，点击“+ 新建子系统”创建 inner-1</div>`}
          </div>
        </div>

        <!-- 直属子系统承载进程控制与分离计量 -->
        <div class="tm-section">
          <div class="tm-sec-title">直属子系统承载进程 (${carriers.length}) — 区分内核自身与内部进程工作量</div>
          ${carriers.length === 0 ? `<div class="tm-empty-sub">无运行中的直属子系统</div>` : `
          <div class="tm-child-list">
            ${carriers.map((c) => {
              const m = c.lastMetrics || {};
              return `
              <div class="tm-child-card">
                <div class="tm-child-top">
                  <span class="tm-cid">${esc(c.id)}</span>
                  <span class="tm-st st-${c.state}">${c.state === 'error' ? '内核错误' : (c.paused ? '已暂停' : '运行中')}</span>
                  <span class="tm-metrics">内核自身: <b>${m.kernelSelfSteps || c.selfStepsTick}</b> | 内部工作: <b>${m.childSteps || c.childStepsTick}</b> | 剩余: ${m.pendingWork || 0} | 内存: ${fmtBytes(c.memBytes)}</span>
                </div>
                <div class="tm-child-ctrl">
                  <label class="tm-grant-lbl">拨付上限 <input type="number" class="nos-input-xs" step="10000" value="${c.grantCap}" data-testid="tasks-grant" data-system-id="outer" data-window-id="${win.id}" data-target-system-id="${esc(c.id)}" data-grant-cid="${esc(c.id)}"/></label>
                  <label class="tm-grant-lbl">速率
                    <select class="nos-select-xs" data-rate-cid="${esc(c.id)}">
                      ${[0.25, 0.5, 1, 2, 4].map((r) => `<option value="${r}" ${Math.abs((c.timeRate || 1) - r) < 0.05 ? 'selected' : ''}>${r}x</option>`).join('')}
                    </select>
                  </label>
                  ${c.paused
                    ? `<button class="btn-xs btn-green" data-testid="system-resume" data-system-id="outer" data-window-id="${win.id}" data-target-system-id="${esc(c.id)}" data-cact="resume" data-cid="${esc(c.id)}">继续</button>`
                    : `<button class="btn-xs" data-testid="system-pause" data-system-id="outer" data-window-id="${win.id}" data-target-system-id="${esc(c.id)}" data-cact="pause" data-cid="${esc(c.id)}">暂停</button>`}
                  <button class="btn-xs" data-cact="step" data-cid="${esc(c.id)}" ${c.paused ? '' : 'disabled'}>单步</button>
                  <button class="btn-xs" data-testid="system-restart" data-system-id="outer" data-window-id="${win.id}" data-target-system-id="${esc(c.id)}" data-cact="restart" data-cid="${esc(c.id)}">重启</button>
                  <button class="btn-xs" data-testid="kernel-open" data-system-id="outer" data-window-id="${win.id}" data-target-system-id="${esc(c.id)}" data-cact="open_kernel" data-cid="${esc(c.id)}">打开内核</button>
                  <button class="btn-xs" data-cact="snapshot" data-cid="${esc(c.id)}">快照</button>
                  <button class="btn-xs" data-cact="restore_last" data-cid="${esc(c.id)}">恢复</button>
                  <button class="btn-xs" data-cact="fork_last" data-cid="${esc(c.id)}">分叉</button>
                  <button class="btn-xs" data-cact="export_snap" data-cid="${esc(c.id)}" title="保存快照到本机磁盘，重启后可导入">导出快照</button>
                  <button class="btn-xs btn-danger-xs" data-cact="close" data-cid="${esc(c.id)}">关闭</button>
                </div>
                ${c.error ? `<div class="tm-err">${esc(c.error)}</div>` : ''}
              </div>`;
            }).join('')}
          </div>`}
        </div>

        <!-- 根系统自定义进程 -->
        <div class="tm-section">
          <div class="tm-sec-title">根系统自定义程序进程 (${os.rootProcs.length})</div>
          <table class="tm-table">
            <thead><tr><th>PID</th><th>程序</th><th>状态</th><th>本步</th><th>累计</th><th>剩余</th><th>内存</th><th>操作</th></tr></thead>
            <tbody>
              ${os.rootProcs.length === 0 ? `<tr><td colspan="8" class="tm-empty-td">暂无根系统自定义进程</td></tr>` : os.rootProcs.map((p) => `
                <tr>
                  <td>${p.pid}</td>
                  <td>${esc(p.name)}${p.error ? `<div class="tm-err">${esc(p.error)}</div>` : ''}</td>
                  <td><span class="tm-st st-${esc(p.state)}">${esc(p.state)}</span></td>
                  <td>${p.stepsTick}</td>
                  <td>${p.stepsTotal}</td>
                  <td>${p.pendingWork}</td>
                  <td>${fmtBytes(p.memBytes)}</td>
                  <td class="tm-ops">
                    ${p.state === 'suspended'
                      ? `<button class="btn-xxs" data-pact="resume" data-pid="${p.pid}">继续</button>`
                      : (p.state !== 'exited' ? `<button class="btn-xxs" data-pact="suspend" data-pid="${p.pid}">挂起</button>` : '')}
                    ${p.state !== 'exited' ? `<button class="btn-xxs btn-danger-xs" data-pact="kill" data-pid="${p.pid}">结束</button>` : ''}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <!-- 宿主 Chromium 网页视图（单独列出，不计入自定义逻辑指令预算） -->
        <div class="tm-section">
          <div class="tm-sec-title">宿主 Chromium 网页视图 (${browserTabs.length}) — 真实网页引擎，不计入逻辑指令预算</div>
          <table class="tm-table">
            <thead><tr><th>窗口</th><th>标签</th><th>状态</th><th>网址</th><th>操作</th></tr></thead>
            <tbody>
              ${browserTabs.length === 0 ? `<tr><td colspan="5" class="tm-empty-td">未打开浏览器网页视图</td></tr>` : browserTabs.map((bt) => `
                <tr>
                  <td>${esc(bt.windowId)}</td>
                  <td>${esc(bt.tabId)}</td>
                  <td><span class="tm-st st-${bt.loadState === 'error' ? 'error' : 'running'}">${esc(bt.loadState)}</span></td>
                  <td class="tm-url-td" title="${esc(bt.url)}">${esc(bt.url)}</td>
                  <td><button class="btn-xxs btn-danger-xs" data-bkill="${esc(bt.windowId)}">结束浏览器</button></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <div class="tm-status">${esc(statusMsg)}</div>
      </div>
    `;

    // Wire inputs & buttons
    bodyEl.querySelectorAll('[data-cfg]').forEach((inp) => {
      inp.addEventListener('change', () => {
        const k = inp.dataset.cfg;
        const v = Number(inp.value);
        if (k === 'budget') os.budgetConfig = Math.max(10000, Math.floor(v));
        else if (k === 'memory') os.memQuota = Math.max(16 * 1048576, Math.floor(v * 1048576));
        else if (k === 'storage') os.storageQuota = Math.max(4 * 1048576, Math.floor(v * 1048576));
        statusMsg = `已更新根系统资源配置`;
        render();
      });
    });

    bodyEl.querySelectorAll('[data-grant-cid]').forEach((inp) => {
      inp.addEventListener('change', () => {
        const cid = inp.dataset.grantCid;
        os.controlChildSystem(cid, { action: 'set_grant', grant: Number(inp.value) });
        statusMsg = `已更新 ${cid} 拨付上限`;
      });
    });

    bodyEl.querySelectorAll('[data-rate-cid]').forEach((sel) => {
      sel.addEventListener('change', () => {
        const cid = sel.dataset.rateCid;
        os.controlChildSystem(cid, { action: 'set_rate', rate: Number(sel.value) });
        statusMsg = `已设置 ${cid} 速率为 ${sel.value}x`;
      });
    });

    bodyEl.addEventListener('click', async (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      if (btn.dataset.act === 'new_sub') {
        const r = os.createChildSystem();
        statusMsg = r.ok ? `已创建直属子系统 ${r.childId}` : `创建失败：${r.error}`;
        render();
      } else if (btn.dataset.act === 'run_busy') {
        const r = os.spawnRootProgram('/Programs/busy.nos', {});
        statusMsg = r.ok ? `已启动 busy.nos (PID ${r.pid})` : r.error;
        render();
      } else if (btn.dataset.act === 'import_snap') {
        if (window.nestedHost?.importFile) {
          const ir = await window.nestedHost.importFile();
          if (ir?.ok) {
            const p = `/Systems/imported_${Date.now() % 10000}.snap`;
            os.vfsWrite(p, ir.content);
            const fr = os.forkChildSnapshot(p);
            statusMsg = fr.ok ? `已从本机快照分叉恢复 ${fr.childId}` : `导入分叉失败：${fr.error}`;
            render();
          }
        }
      } else if (btn.dataset.cact) {
        const cid = btn.dataset.cid;
        const act = btn.dataset.cact;
        if (act === 'snapshot') {
          const sr = os.snapshotChildSystem(cid);
          statusMsg = sr.ok ? `快照已保存: ${sr.path} (${fmtBytes(sr.size)})` : `快照失败：${sr.error}`;
        } else if (act === 'restore_last') {
          const rr = os.restoreLastSnapshotForChild(cid);
          statusMsg = rr.ok ? `已恢复 ${cid} 至快照 ${rr.path}` : rr.error;
        } else if (act === 'fork_last') {
          const fr = os.forkLastSnapshotForChild(cid);
          statusMsg = fr.ok ? `已分叉新子树 ${fr.childId}` : fr.error;
        } else if (act === 'export_snap') {
          let sp = os.lastSnapshots.get(cid);
          if (!sp) {
            const sr = os.snapshotChildSystem(cid);
            if (sr.ok) sp = sr.path;
          }
          if (sp && window.nestedHost?.exportFile) {
            const rd = os.vfsRead(sp);
            if (rd.ok) {
              const er = await window.nestedHost.exportFile(sp.split('/').pop(), rd.content);
              statusMsg = er?.ok ? `快照已导出本机: ${er.filePath}` : '已取消导出';
            }
          }
        } else {
          const r = os.controlChildSystem(cid, { action: act });
          statusMsg = r.ok ? `已对 ${cid} 执行 ${act}` : (r.error || '操作失败');
        }
        render();
      } else if (btn.dataset.pact) {
        const pid = Number(btn.dataset.pid);
        os.controlRootProc(pid, btn.dataset.pact);
        render();
      } else if (btn.dataset.bkill) {
        os.closeWindow(btn.dataset.bkill, true);
        statusMsg = `已结束浏览器窗口 ${btn.dataset.bkill} 并释放网页视图`;
        render();
      }
    }, { once: true });
  };

  render();
  const timer = setInterval(render, 450);

  return {
    destroy: () => clearInterval(timer),
  };
}

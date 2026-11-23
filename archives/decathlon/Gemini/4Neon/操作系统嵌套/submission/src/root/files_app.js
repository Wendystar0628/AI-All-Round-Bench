// Root File Manager App ('files')
// Features: nav sidebar, path bar, multi-select, right-click menu, Trash + Restore,
// new file/folder, rename, copy/paste, open by file type, host disk export/import,
// and bidirectional cross-layer drag-and-drop with nested subsystem File Managers!

import { iconHtml } from '../display/icons.js';

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtSize(b) {
  const n = Number(b || 0);
  if (n >= 1048576) return (n / 1048576).toFixed(2) + ' MB';
  if (n >= 1024) return (n / 1024).toFixed(1) + ' KB';
  return n + ' B';
}

export function mountRootFilesApp(os, win, bodyEl, launchArgs = {}) {
  let curDir = launchArgs.openDir || '/Documents';
  const selected = new Set();
  let clipboardPaths = [];
  let statusMsg = '就绪（支持双击打开、多选、右键菜单与跨层拖放）';

  const navItems = [
    { label: '桌面', path: '/Desktop' },
    { label: '文档', path: '/Documents' },
    { label: '演示素材', path: '/Demo' },
    { label: '下载', path: '/Downloads' },
    { label: '示例程序', path: '/Programs' },
    { label: '子系统内核', path: '/Systems' },
    { label: '系统核心', path: '/sys' },
    { label: '回收站', path: '/Trash' },
  ];

  const render = () => {
    const res = os.vfsList(curDir);
    const entries = res.ok ? res.entries : [];
    const inTrash = curDir === '/Trash';

    bodyEl.innerHTML = `
      <div class="files-shell root-files-shell" data-drop-system-id="outer" data-drop-dir="${esc(curDir)}">
        <div class="files-toolbar">
          <button class="btn-xs" data-act="up">上级</button>
          <input class="nos-input files-path-in" type="text" value="${esc(curDir)}" data-testid="files-path" data-system-id="outer" data-window-id="${win.id}" aria-label="当前路径"/>
          <input class="nos-input-sm files-name-in" type="text" placeholder="名称 / 重命名" aria-label="文件或目录名称"/>
          <button class="btn-xs" data-testid="files-new-file" data-system-id="outer" data-window-id="${win.id}" data-act="new_file">新建文件</button>
          <button class="btn-xs" data-testid="files-new-folder" data-system-id="outer" data-window-id="${win.id}" data-act="new_folder">新建目录</button>
          <button class="btn-xs" data-testid="files-open" data-system-id="outer" data-window-id="${win.id}" data-act="open">打开</button>
          <button class="btn-xs" data-testid="files-copy" data-system-id="outer" data-window-id="${win.id}" data-act="copy">复制</button>
          <button class="btn-xs" data-testid="files-paste" data-system-id="outer" data-window-id="${win.id}" data-act="paste">粘贴</button>
          <button class="btn-xs" data-act="rename">重命名</button>
          <button class="btn-xs" data-act="delete">删除</button>
          ${inTrash ? `<button class="btn-xs btn-accent" data-act="restore">恢复</button>` : ''}
          <button class="btn-xs" data-act="export_host" title="保存选中文件到本机磁盘">导出本机</button>
          <button class="btn-xs" data-act="import_host" title="从本机磁盘导入到当前目录">导入本机</button>
        </div>
        <div class="files-main">
          <div class="files-sidebar">
            ${navItems.map((nv) => `
              <button class="files-nav-btn${curDir === nv.path ? ' active' : ''}"
                data-testid="files-nav" data-system-id="outer" data-window-id="${win.id}" data-file-path="${esc(nv.path)}" data-nav-path="${esc(nv.path)}">
                ${iconHtml('folder', 'fn-ico')}<span>${esc(nv.label)}</span>
              </button>
            `).join('')}
          </div>
          <div class="files-list" data-testid="files-list" data-system-id="outer" data-window-id="${win.id}"
               data-drop-system-id="outer" data-drop-dir="${esc(curDir)}">
            ${entries.length === 0
              ? `<div class="files-empty">${inTrash ? '回收站为空' : '当前目录为空'}</div>`
              : entries.map((ent) => {
                const ico = ent.kind === 'dir' ? 'folder'
                  : (ent.name.endsWith('.sheet') ? 'spreadsheet'
                    : (ent.name.endsWith('.scene') ? 'scene' : 'file'));
                return `<div class="files-row${selected.has(ent.path) ? ' selected' : ''}"
                  draggable="${ent.kind === 'file' ? 'true' : 'false'}"
                  data-drag-system-id="outer"
                  data-drag-file-path="${esc(ent.path)}"
                  data-testid="files-item" data-system-id="outer" data-window-id="${win.id}" data-file-path="${esc(ent.path)}"
                  data-kind="${ent.kind}">
                  ${iconHtml(ico, 'fr-ico')}
                  <span class="fr-name">${esc(ent.name)}</span>
                  <span class="fr-size">${ent.kind === 'dir' ? '目录' : fmtSize(ent.size)}</span>
                </div>`;
              }).join('')}
          </div>
        </div>
        <div class="files-status">${esc(statusMsg)} · 共 ${entries.length} 项</div>
      </div>
    `;

    const nameInput = bodyEl.querySelector('.files-name-in');
    const pathInput = bodyEl.querySelector('[data-testid="files-path"]');

    pathInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const np = pathInput.value.trim() || '/';
        if (os.vfsList(np).ok) {
          curDir = np;
          selected.clear();
          render();
        }
      }
    });

    bodyEl.querySelectorAll('[data-nav-path]').forEach((btn) => {
      btn.addEventListener('click', () => {
        curDir = btn.dataset.navPath;
        selected.clear();
        render();
      });
    });

    const openPath = (p) => {
      const st = os.vfsStat(p);
      if (!st.ok) return;
      if (st.kind === 'dir') {
        curDir = p;
        selected.clear();
        render();
        return;
      }
      if (p.endsWith('.sheet')) {
        os.openApp('spreadsheet', { openPath: p });
      } else if (p.endsWith('.snap')) {
        os.openSnapshotDialog(p);
      } else {
        os.openApp('editor', { openPath: p });
      }
    };

    const syncSelectionVisuals = () => {
      bodyEl.querySelectorAll('[data-testid="files-item"]').forEach((r) => {
        r.classList.toggle('selected', selected.has(r.dataset.filePath));
      });
    };

    bodyEl.querySelectorAll('[data-testid="files-item"]').forEach((row) => {
      row.addEventListener('click', (e) => {
        const p = row.dataset.filePath;
        if (!e.ctrlKey && !e.shiftKey) selected.clear();
        selected.add(p);
        syncSelectionVisuals();
      });
      row.addEventListener('dblclick', () => openPath(row.dataset.filePath));
      row.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const p = row.dataset.filePath;
        selected.clear();
        selected.add(p);
        syncSelectionVisuals();
        os.showContextMenu(e.clientX, e.clientY, [
          { label: '打开', onClick: () => openPath(p) },
          { label: '复制', onClick: () => { clipboardPaths = [p]; statusMsg = `已复制 ${p}`; render(); } },
          inTrash
            ? { label: '从回收站恢复', onClick: () => { const r = os.vfsRestore(p); statusMsg = r.ok ? `已恢复至 ${r.path}` : r.error; selected.clear(); render(); } }
            : { label: '移至回收站', onClick: () => { const r = os.vfsDelete(p); statusMsg = r.ok ? `已删除 ${p}` : r.error; selected.clear(); render(); } },
        ]);
      });
    });

    bodyEl.querySelector('.files-toolbar').addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-act]');
      if (!btn) return;
      const act = btn.dataset.act;
      const firstSel = Array.from(selected)[0];
      const typed = nameInput.value.trim();

      if (act === 'up' && curDir !== '/') {
        const parts = curDir.split('/').filter(Boolean);
        parts.pop();
        curDir = '/' + parts.join('/');
        selected.clear();
        render();
      } else if (act === 'new_file') {
        const nm = typed || `新建文件_${Math.floor(Date.now() % 10000)}.txt`;
        const dest = curDir === '/' ? '/' + nm : curDir + '/' + nm;
        const wr = os.vfsWrite(dest, '');
        statusMsg = wr.ok ? `已新建 ${dest}` : wr.error;
        if (wr.ok) os.notify('文件已创建', dest);
        render();
      } else if (act === 'new_folder') {
        const nm = typed || `新建目录_${Math.floor(Date.now() % 10000)}`;
        const dest = curDir === '/' ? '/' + nm : curDir + '/' + nm;
        const mr = os.vfsMkdir(dest);
        statusMsg = mr.ok ? `已新建目录 ${dest}` : mr.error;
        render();
      } else if (act === 'open' && firstSel) {
        openPath(firstSel);
      } else if (act === 'copy' && selected.size > 0) {
        clipboardPaths = Array.from(selected);
        statusMsg = `已复制 ${clipboardPaths.length} 项`;
        render();
      } else if (act === 'paste' && clipboardPaths.length > 0) {
        for (const src of clipboardPaths) {
          const base = src.split('/').pop();
          let dest = curDir === '/' ? '/' + base : curDir + '/' + base;
          if (dest === src) dest = (curDir === '/' ? '' : curDir) + '/副本_' + base;
          const cr = os.vfsCopy(src, dest);
          statusMsg = cr.ok ? `已粘贴 ${dest}` : cr.error;
        }
        os.notify('文件粘贴完成', curDir);
        render();
      } else if (act === 'rename' && firstSel && typed) {
        const dest = curDir === '/' ? '/' + typed : curDir + '/' + typed;
        const mr = os.vfsMove(firstSel, dest);
        statusMsg = mr.ok ? `已重命名为 ${typed}` : mr.error;
        selected.clear();
        if (mr.ok) selected.add(dest);
        render();
      } else if (act === 'delete' && selected.size > 0) {
        for (const p of Array.from(selected)) {
          const dr = os.vfsDelete(p);
          if (dr.ok) os.notify(inTrash ? '文件已永久删除' : '文件已移入回收站', p);
          statusMsg = dr.ok ? `已删除 ${p}` : dr.error;
        }
        selected.clear();
        render();
      } else if (act === 'restore' && firstSel) {
        const rr = os.vfsRestore(firstSel);
        statusMsg = rr.ok ? `已恢复至 ${rr.path}` : rr.error;
        if (rr.ok) os.notify('文件已恢复', rr.path);
        selected.clear();
        render();
      } else if (act === 'export_host' && firstSel) {
        const rd = os.vfsRead(firstSel);
        if (rd.ok && window.nestedHost?.exportFile) {
          const er = await window.nestedHost.exportFile(firstSel.split('/').pop(), rd.content);
          statusMsg = er?.ok ? `已导出到本机：${er.filePath}` : (er?.canceled ? '已取消导出' : '导出失败');
          render();
        }
      } else if (act === 'import_host' && window.nestedHost?.importFile) {
        const ir = await window.nestedHost.importFile();
        if (ir?.ok) {
          const dest = curDir === '/' ? '/' + ir.name : curDir + '/' + ir.name;
          const wr = os.vfsWrite(dest, ir.content);
          statusMsg = wr.ok ? `已从本机导入：${dest}` : wr.error;
          if (wr.ok) os.notify('从本机导入文件', dest);
          render();
        }
      }
    });
  };

  const unsubVfs = os.onVfsChange(() => render());
  render();

  return {
    destroy: () => unsubVfs(),
  };
}

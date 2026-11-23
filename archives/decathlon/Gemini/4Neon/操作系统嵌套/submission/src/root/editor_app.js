// Root Text & Program Editor ('editor')
// Edits any file in Root VFS (including direct child subsystem kernel source /Systems/inner-X/kernel.nos),
// runs NOS programs in Root OS's custom VM scheduler, and can self-host /sys/compiler.nos!

export function mountRootEditorApp(os, win, bodyEl, launchArgs = {}) {
  let filePath = launchArgs.openPath || '/Programs/sum.nos';
  let content = '';
  let savedContent = '';
  let statusMsg = '就绪';
  let lastPid = null;

  bodyEl.innerHTML = `
    <div class="editor-shell root-editor-shell">
      <div class="editor-toolbar">
        <input class="nos-input editor-fn-in" type="text" data-testid="editor-filename" data-system-id="outer" data-window-id="${win.id}" aria-label="文件路径"/>
        <button class="btn-xs" data-act="open">打开</button>
        <button class="btn-xs" data-act="new">新建</button>
        <button class="btn-xs btn-accent" data-testid="editor-save" data-system-id="outer" data-window-id="${win.id}" data-act="save">保存</button>
        <button class="btn-xs btn-green" data-act="run">在根系统运行</button>
        <button class="btn-xs btn-amber" data-act="self_host" title="使用当前编译器自举编译 /sys/compiler.nos">自举编译</button>
      </div>
      <div class="editor-quickbar">
        <button class="qb-chip" data-qf="/Programs/sum.nos">sum.nos</button>
        <button class="qb-chip" data-qf="/Programs/sender.nos">sender.nos</button>
        <button class="qb-chip" data-qf="/Programs/receiver.nos">receiver.nos</button>
        <button class="qb-chip" data-qf="/Programs/busy.nos">busy.nos</button>
        <button class="qb-chip" data-qf="/sys/kernel.nos">kernel模板</button>
        <button class="qb-chip" data-qf="/sys/compiler.nos">compiler.nos</button>
        <button class="qb-chip" data-qf="/Demo/helicopter-24.scene">helicopter-24.scene</button>
      </div>
      <textarea class="editor-textarea" spellcheck="false" data-testid="editor-text" data-system-id="outer" data-window-id="${win.id}" aria-label="代码与文本编辑区"></textarea>
      <div class="editor-output">运行输出将显示在此处</div>
      <div class="editor-status">就绪</div>
    </div>
  `;

  const fnInput = bodyEl.querySelector('[data-testid="editor-filename"]');
  const ta = bodyEl.querySelector('[data-testid="editor-text"]');
  const outEl = bodyEl.querySelector('.editor-output');
  const stEl = bodyEl.querySelector('.editor-status');

  const updateStatus = () => {
    const dirty = content !== savedContent;
    stEl.textContent = `${dirty ? '● 未保存 · ' : ''}${statusMsg}`;
    os.setWindowTitle(win.id, `${dirty ? '● ' : ''}${filePath.split('/').pop()} — 编辑器`);
  };

  const openPath = (p) => {
    const rd = os.vfsRead(p);
    if (rd.ok) {
      filePath = rd.path;
      content = rd.content;
      savedContent = rd.content;
      fnInput.value = filePath;
      ta.value = content;
      statusMsg = `已打开 ${filePath} (${rd.size} 字节)`;
    } else {
      filePath = p;
      content = '';
      savedContent = '';
      fnInput.value = filePath;
      ta.value = '';
      statusMsg = `未找到 ${p}，保存后将创建`;
    }
    updateStatus();
  };

  const saveFile = () => {
    const target = fnInput.value.trim() || '/Documents/untitled.nos';
    const wr = os.vfsWrite(target, content);
    if (wr.ok) {
      filePath = wr.path;
      savedContent = content;
      fnInput.value = filePath;
      statusMsg = `已保存 ${filePath} (${wr.size} 字节)`;
      os.notify('文件已保存', filePath);
      updateStatus();
      return true;
    }
    statusMsg = `保存失败：${wr.error}`;
    updateStatus();
    return false;
  };

  ta.addEventListener('input', () => {
    content = ta.value;
    updateStatus();
  });
  ta.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key.toLowerCase() === 's') {
      e.preventDefault();
      saveFile();
    } else if (e.ctrlKey && e.key.toLowerCase() === 'c') {
      const sel = ta.value.substring(ta.selectionStart, ta.selectionEnd);
      if (sel) os.recordClipboard(sel, `编辑器 ${filePath.split('/').pop()}`);
    }
  });

  bodyEl.querySelector('.editor-toolbar').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'open') openPath(fnInput.value.trim());
    else if (act === 'new') {
      filePath = `/Documents/prog_${Math.floor(Date.now() % 10000)}.nos`;
      content = '// 新建 NOS 程序\nlet total = 0;\nfor (let i = 1; i <= 50; i += 1) { total += i; }\nsyscall("log", "结果 = " + str(total));\nreturn total;\n';
      savedContent = '';
      fnInput.value = filePath;
      ta.value = content;
      statusMsg = '新建程序（未保存）';
      updateStatus();
    } else if (act === 'save') {
      saveFile();
    } else if (act === 'run') {
      if (!saveFile()) return;
      const sp = os.spawnRootProgram(filePath, {});
      if (sp.ok) {
        lastPid = sp.pid;
        statusMsg = `已在根系统启动 PID ${sp.pid}`;
        outEl.textContent = `[启动] PID ${sp.pid} -> ${filePath}`;
      } else {
        statusMsg = `运行失败：${sp.error}`;
        outEl.textContent = `[错误] ${sp.error}`;
      }
      updateStatus();
    } else if (act === 'self_host') {
      saveFile();
      const res = os.selfHostRootCompiler();
      if (res.ok) {
        statusMsg = `自举编译成功 (${res.funcs} 函数, ${res.bytes} 字节)`;
        outEl.textContent = `[自举] ${statusMsg}，新编译器已热重载`;
        os.notify('编译器自举成功', statusMsg);
      } else {
        statusMsg = `自举编译失败：${res.error}`;
        outEl.textContent = `[错误] ${res.error}`;
      }
      updateStatus();
    }
  });

  bodyEl.querySelectorAll('.qb-chip').forEach((chip) => {
    chip.addEventListener('click', () => openPath(chip.dataset.qf));
  });

  const timer = setInterval(() => {
    if (!lastPid) return;
    const p = os.rootProcs.find((x) => x.pid === lastPid);
    if (!p) return;
    const lines = [`[PID ${p.pid}] 状态=${p.state} 步数=${p.stepsTotal}`];
    for (const lg of p.logs) lines.push(lg.text);
    if (p.result !== null && p.result !== undefined) lines.push(`[返回值] ${JSON.stringify(p.result)}`);
    if (p.error) lines.push(`[异常] ${p.error}`);
    outEl.textContent = lines.join('\n');
  }, 200);

  openPath(filePath);

  return {
    destroy: () => clearInterval(timer),
  };
}

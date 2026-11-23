/* 根系统 文本与程序编辑器 */
'use strict';
window.NOS = window.NOS || {};

class RootEditor {
  constructor() { this.path = ''; this.text = ''; this.dirty = false; this.msg = ''; }
  open() {
    this.win = NOS.desktop.openWindow('editor', '文本与程序编辑器', { w: 780, h: 560, model: this });
    this.render();
  }
  openFile(path) {
    try {
      this.text = NOS.rootVM.vfs.read(path);
      this.path = path; this.dirty = false;
    } catch (e) { alert(e.message); return; }
    if (!this.win) this.open();
    else { this.win.el.querySelector('.win-title').textContent = '编辑器 - ' + path; this.render(); }
  }
  unmount() {}
  beforeClose() { if (this.dirty) return confirm('有未保存修改，确定关闭并放弃吗？'); }
  save() {
    if (!this.path) { const p = prompt('保存路径', '/Documents/未命名.osl'); if (!p) return; this.path = p; }
    NOS.rootVM.vfs.write(this.path, this.text);
    this.dirty = false;
    this.msg = '已保存 ' + this.path;
    // 若是内核/程序文件，提示重启生效
    this.render();
  }
  run() {
    // 根系统编辑器运行 OSL：保存后在一个临时进程中执行（根直接提供 VM 宿主）
    this.save();
    try {
      const prog = { id: this.path, compiled: (() => { const ast = NOS.osl.parse(this.text); return NOS.osl.compileAST(ast); })() };
      const vm = new NOS.VM(prog, null, {});
      vm.start('main', []);
      const st = vm.runStep(2000000);
      if (st === 'error') this.msg = '运行错误: ' + vm.error;
      else if (st === 'waiting') this.msg = '程序在等待系统调用（根编辑器仅支持纯计算演示）';
      else this.msg = '运行完成，结果: ' + JSON.stringify(vm.resultValue);
    } catch (e) { this.msg = '错误: ' + e.message; }
    this.render();
  }
  render() {
    const c = this.win.contentEl;
    c.innerHTML = '';
    c.classList.add('editor-app');
    const bar = NOS.h('div', { class: 'tb' });
    bar.append(
      label('文件：'), NOS.h('span', { class: 'fn-name', dataTestid: 'editor-filename' }, this.path || '未命名'),
      btn('新建', () => { this.path = ''; this.text = ''; this.dirty = false; this.render(); }),
      btn('打开…', () => { const p = prompt('文件路径', '/System/kernel.osl'); if (p) this.openFile(p); }),
      btn('保存', () => this.save(), 'editor-save'),
      btn('运行', () => this.run()),
      btn('语法检查', () => { try { NOS.osl.parse(this.text); this.msg = '语法正确'; } catch (e) { this.msg = e.message; } this.render(); })
    );
    const ta = NOS.h('textarea', { class: 'code-area', dataTestid: 'editor-text', spellcheck: 'false' });
    ta.value = this.text;
    ta.addEventListener('input', () => { this.text = ta.value; this.dirty = true; });
    ta.addEventListener('keydown', e => { if (e.ctrlKey && e.key === 's') { e.preventDefault(); this.save(); } e.stopPropagation(); });
    c.append(bar, ta, NOS.h('div', { class: 'status' }, (this.dirty ? '● 未保存  ' : '') + this.msg));
    ta.focus();
  }
}
function btn(t, fn, testid) { const b = NOS.h('button', { class: 'btn', dataTestid: testid || '' }, t); b.addEventListener('click', fn); return b; }
function label(t) { return NOS.h('span', { class: 'lbl' }, t); }
NOS.RootEditor = RootEditor;

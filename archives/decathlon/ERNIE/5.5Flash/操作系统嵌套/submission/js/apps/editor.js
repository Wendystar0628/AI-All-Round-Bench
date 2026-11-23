// 文本与程序编辑器
import { h, clear, icon, iconSvg } from '../util.js';
import { basename as kbasename, dirname as kdirname, joinPath as kjoin, extOf } from '../kernel.js';

export class EditorApp {
  constructor(win, os, state = {}) {
    this.win = win; this.os = os; this.sys = win.sys;
    this.path = state.path || '/Documents/readme.txt';
    this.text = '';
    this.dirty = false;
    this.pids = [];
    this.consoleTimer = null;
    this.help = !!state.help;
  }
  mount(body) {
    const root = h('div', { class: 'editor-layout' });
    const side = h('div', { class: 'editor-side' });
    this.sideEl = side;
    side.append(h('div', { class: 'side-title' }, '资源管理器'));
    this.renderSide();
    const main = h('div', { class: 'editor-main' });
    const tabs = h('div', { class: 'editor-tabs' });
    this.tabEl = tabs;
    const code = h('div', { class: 'editor-code' });
    this.gutter = h('div', { class: 'editor-gutter' }, '1');
    this.textEl = h('textarea', { class: 'editor-text', 'data-testid': 'editor-text', spellcheck: 'false', wrap: 'off' });
    code.append(this.gutter, this.textEl);
    const console_ = h('div', { class: 'editor-console' });
    const chead = h('div', { class: 'ec-head' }, h('span', {}, '运行输出'), h('span', { style: { marginLeft: 'auto' } }, 'F5 运行 · Ctrl+S 保存'));
    this.consoleEl = h('pre', {});
    console_.append(chead, this.consoleEl);
    const hint = h('div', { class: 'editor-hint' }, h('span', {}, '变量 / 计算 / 条件 / 循环'), h('span', {}, '系统调用：time sleep spawn send recv file_*'), h('span', {}, 'UTF-8'));
    main.append(tabs, code, console_, hint);
    const tb = h('div', { class: 'toolbar' });
    const mk = (testid, label, fn, cls = 'btn') => {
      const b = h('button', { class: cls, 'data-testid': testid }, label);
      b.addEventListener('click', e => { e.stopPropagation(); fn(); });
      tb.append(b); return b;
    };
    mk('editor-new', '新建', () => this.newFile());
    mk('editor-open', '打开', () => this.openPicker());
    mk('editor-save', '保存', () => this.save(), 'btn primary');
    mk('editor-run', '运行', () => this.run(), 'btn primary');
    tb.append(hdivSpacer());
    this.filenameEl = h('span', { class: 'muted', style: { fontSize: '11px' }, 'data-testid': 'editor-filename' }, this.path);
    tb.append(this.filenameEl);
    main.insertBefore(tb, tabs);
    this.textEl.addEventListener('input', () => {
      this.dirty = true;
      this.updateTab();
      this.updateGutter();
      this.os.saveSoon();
    });
    this.textEl.addEventListener('keydown', e => this.onKey(e));
    this.textEl.addEventListener('scroll', () => { this.gutter.scrollTop = this.textEl.scrollTop; });
    this.win.bodyEl.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); this.save(); }
      if (e.key === 'F5') { e.preventDefault(); this.run(); }
    });
    root.append(side, main);
    body.append(root);
    this.load(this.path);
    this.consoleTimer = setInterval(() => this.refreshConsole(), 500);
  }
  renderSide() {
    if (!this.sideEl) return;
    clear(this.sideEl);
    this.sideEl.append(h('div', { class: 'side-title' }, '本系统与资源'));
    const groups = [
      ['程序与内核', ['/System', '/Demo']],
      ['文档', ['/Documents']]
    ];
    for (const [title, dirs] of groups) {
      this.sideEl.append(h('div', { class: 'side-title', style: { marginTop: '6px' } }, title));
      for (const dir of dirs) {
        for (const f of this.sys.fs.list(dir) || []) {
          if (f.dir) continue;
          const b = h('div', { class: 'ed-file' + (f.path === this.path ? ' active' : '') });
          const ic = h('span', { style: { display: 'flex' } });
          ic.innerHTML = iconSvg(extOf(f.path) === 'prog' ? 'code' : extOf(f.path) === 'kernel' ? 'kernel' : 'fileText');
          b.append(ic, h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis' } }, kbasename(f.path)));
          b.title = f.path;
          b.addEventListener('click', () => this.load(f.path));
          this.sideEl.append(b);
        }
      }
    }
    const help = h('div', { class: 'ed-file' }, iconSvg('help'), h('span', {}, '语言与接口说明'));
    help.addEventListener('click', () => this.load('/System/help.md'));
    this.sideEl.append(help);
  }
  load(path) {
    const f = this.sys.fs.get(path);
    if (!f || f.dir) {
      if (path === '/System/help.md') {
        this.text = HELP_TEXT;
        this.path = path;
        this.dirty = false;
        this.setEditor();
        return;
      }
      this.os.toast(this.sys, '打开失败', `${path} 不存在`, 'err');
      return;
    }
    this.path = path;
    this.text = f.content;
    this.dirty = false;
    this.setEditor();
    this.renderSide();
  }
  setEditor() {
    this.textEl.value = this.text;
    this.filenameEl.textContent = this.path;
    this.updateTab();
    this.updateGutter();
    this.refreshConsole();
  }
  updateTab() {
    clear(this.tabEl);
    const t = h('div', { class: 'ed-tab active' }, iconSvg('code'), h('span', {}, kbasename(this.path)), this.dirty ? h('span', { class: 'dirty' }) : null);
    this.tabEl.append(t);
    this.filenameEl.textContent = this.path + (this.dirty ? ' •' : '');
  }
  updateGutter() {
    const n = this.textEl.value.split('\n').length;
    let s = '';
    for (let i = 1; i <= n; i++) s += i + '\n';
    this.gutter.textContent = s;
  }
  onKey(e) {
    if (e.key === 'Tab') {
      e.preventDefault();
      const t = this.textEl;
      const start = t.selectionStart, end = t.selectionEnd;
      t.value = t.value.slice(0, start) + '  ' + t.value.slice(end);
      t.selectionStart = t.selectionEnd = start + 2;
      this.dirty = true; this.updateTab(); this.updateGutter();
    }
  }
  newFile() {
    this.os.prompt(this.sys, '新建程序', '文件名（例如 demo.prog）', 'demo.prog').then(name => {
      if (!name) return;
      const p = kjoin('/Documents', name.trim());
      if (this.sys.fs.exists(p)) { this.os.toast(this.sys, '创建失败', '同名文件已存在', 'err'); return; }
      const tpl = `// 新程序\nlet total = 0\nlet i = 0\nwhile i < 5 {\n  set total = total + i\n  set i = i + 1\n}\ncall log("total = " + total)\n`;
      this.sys.fs.write(p, tpl, Date.now());
      this.load(p);
      this.os.notify(this.sys, '已新建', p, 'ok', true);
    });
  }
  openPicker() {
    const files = [];
    for (const d of ['/System', '/Demo', '/Documents']) for (const f of this.sys.fs.list(d) || []) if (!f.dir) files.push(f);
    const list = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '3px', maxHeight: '320px', overflow: 'auto' } });
    for (const f of files) {
      const b = h('button', { class: 'btn ghost', style: { justifyContent: 'flex-start' } }, iconSvg('fileText'), f.path);
      b.addEventListener('click', () => { this.load(f.path); layer.remove(); });
      list.append(b);
    }
    const layer = h('div', { class: 'modal-layer', style: { pointerEvents: 'auto' } });
    const dlg = h('div', { class: 'dialog' }, h('h3', {}, '打开文件'), list, h('div', { class: 'dlg-actions' }, h('button', { class: 'btn' }, '取消')));
    dlg.lastChild.lastChild.addEventListener('click', () => layer.remove());
    layer.append(dlg);
    this.win.bodyEl.appendChild(layer);
    layer.addEventListener('pointerdown', e => { if (e.target === layer) layer.remove(); });
  }
  save() {
    if (!this.path) return;
    if (this.sys.fs.storageUsed() + this.text.length > this.sys.storageLimit) { this.os.toast(this.sys, '保存失败', '存储配额不足', 'err'); return; }
    const ok = this.sys.fs.write(this.path, this.text, Date.now());
    this.sys.syncStorage();
    if (ok) {
      this.dirty = false; this.updateTab();
      this.os.notify(this.sys, '已保存', this.path + (this.path.endsWith('.kernel') ? ' · 重启对应子系统后生效' : ''), 'ok', true);
      this.os.onFsChange(this.sys, this.path);
    } else this.os.toast(this.sys, '保存失败', '写入文件失败', 'err');
  }
  run() {
    if (this.dirty) { this.os.toast(this.sys, '请先保存', '运行的是已保存的文件', 'warn'); return; }
    const ext = extOf(this.path);
    if (ext !== 'prog') { this.os.toast(this.sys, '无法运行', '仅 .prog 程序可直接运行；内核请通过子系统重启载入', 'warn'); return; }
    const f = this.sys.fs.get(this.path);
    if (!f) return;
    const r = this.sys.spawn(kbasename(this.path).replace(/\.[^.]+$/, ''), f.content, { type: 'program', quota: 1200 });
    if (!r.ok) { this.console('启动失败：' + r.error); this.os.toast(this.sys, '运行失败', r.error, 'err'); return; }
    this.pids.push(r.proc.id);
    this.console(`▶ 启动进程 ${r.proc.id}：${kbasename(this.path)}`);
    this.os.notify(this.sys, '程序已启动', `进程 ${r.proc.id} · ${kbasename(this.path)}`, 'ok', false);
    this.refreshConsole();
  }
  console(line) {
    if (!this.consoleEl) return;
    this.consoleEl.textContent += line + '\n';
    this.consoleEl.scrollTop = this.consoleEl.scrollHeight;
  }
  refreshConsole() {
    if (!this.consoleEl) return;
    if (!this.pids.length) return;
    let out = '';
    for (const pid of this.pids) {
      const p = this.sys.processes.find(x => x.id === pid);
      if (!p) { out += `[进程 ${pid} 已结束]\n`; continue; }
      out += `[${p.name} · ${p.state}${p.error ? ' · ' + p.error : ''}]\n`;
      for (const line of p.output) out += '  ' + line + '\n';
    }
    if (out && out !== this.consoleEl.textContent) {
      this.consoleEl.textContent = out;
      this.consoleEl.scrollTop = this.consoleEl.scrollHeight;
    }
  }
  beforeClose() {
    if (!this.dirty) return true;
    return this.os.dialog(this.sys, {
      title: '未保存的修改', text: `${kbasename(this.path)} 有未保存的修改。`,
      actions: [{ id: 'save', text: '保存', primary: true }, { id: 'discard', text: '不保存' }, { id: 'cancel', text: '取消' }]
    }).then(r => { if (r === 'save') { this.save(); return true; } return r === 'discard'; });
  }
  serialize() { return { path: this.path, dirty: this.dirty, text: this.text }; }
  restore(st) {
    if (st.path && this.sys.fs.exists(st.path)) { this.path = st.path; this.text = st.text ?? this.sys.fs.read(st.path) ?? ''; this.dirty = !!st.dirty; this.setEditor(); }
  }
  tick() {}
  render() {}
  dispose() { clearInterval(this.consoleTimer); }
}

function hdivSpacer() { return h('div', { class: 'spacer' }); }

const HELP_TEXT = `Nested OS 程序语言与系统接口说明
====================================

一、程序文件
程序是保存在本系统文件系统中的文本文件（扩展名 .prog）。
可以在“文本与程序编辑器”中新建、修改、保存和运行。
内核源文件扩展名 .kernel，保存在父系统的 /System/kernels/<实例>.kernel。

二、语法
  let x = 1                 定义变量
  set x = x + 1             赋值
  if 条件 { ... } else { ... }
  while 条件 { ... }
  call 函数(参数)           调用系统服务
  break / continue
运算符：+ - * / % == != < > <= >= && || !
数组：[1, 2, 3]，下标 a[0]
注释：# 或 // 到行尾

三、系统服务（系统调用）
  time()                    读取本系统虚拟时间（秒）
  sleep(毫秒)               等待指定虚拟时长
  spawn(路径, 名称)         启动本系统中的程序，返回 pid
  kill(pid)                 结束进程
  self()                    取得自身 pid
  send(pid, 值)             发送消息（按发送顺序）
  recv(超时毫秒)            接收消息；-1 表示无消息
  file_read(路径) / file_write(路径, 内容)
  file_exists / file_list / file_delete / file_mkdir
  log(文本)                 写入运行输出
  rand() / rand(n)          本系统随机数
  wm_config(层叠, 焦点规则)  窗口管理程序使用
  files_config(排序)         文件管理器程序使用
  player_tick()              播放器时序
  flight_tick()              飞行动力学
  chart_handle(消息) / chart_tick()  图表数据
  sensor(编号) / control(总距, 滚转, 俯仰, 偏航)  飞控
  set_quantum / set_priority / set_msg_limit / set_fs_rule  内核策略
  service(名称, 值)          调用内核中定义的自定义系统调用
  service_reply(请求号, 值)  内核回复 service
  panel_clear / panel_rect / panel_text  二维显示提交

四、预置程序
  /Demo/add.prog          累加计算
  /Demo/loop.prog         持续计算（不主动让出执行权）
  /Demo/sender.prog       启动接收进程并发送消息
  /Demo/receiver.prog     接收消息
  /Demo/service.prog      自定义系统调用 double
  /Demo/draw.prog         二维图形提交
  /System/controller.prog 飞控程序

五、内核
每个子系统由父系统 /System/kernels/<实例>.kernel 中的内核程序运行。
内核决定调度量子、消息队列长度、文件路径规则和自定义系统调用。
修改内核并保存后，在父系统“系统管理器”中重启该子系统生效。
内核写坏时子系统显示内核错误并停止，父系统与兄弟系统不受影响。

六、飞控
排演中飞控进程每 20 毫秒（受调度影响）读取传感器并写入控制量。
传感器：0 滚转 1 俯仰 2 高度 3 垂直速度 4 航向 5 目标距离
        6 目标方位 7 前向速度 8 旋翼 9 接地 12/13/14 角速率
控制量保持到下一次写入；错过周期的控制不补发。

七、显示设备
程序通过 panel_* 向本系统的显示设备提交二维图形；
三维场景由播放器读取场景资源并逐帧提交，设备只负责绘制。
`;
export { HELP_TEXT };

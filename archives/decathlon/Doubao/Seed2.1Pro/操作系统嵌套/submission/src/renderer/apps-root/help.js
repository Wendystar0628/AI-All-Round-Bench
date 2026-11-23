/* 操作说明（简体中文，可从桌面随时打开） */
'use strict';
window.NOS = window.NOS || {};
class Help {
  open() {
    this.win = NOS.desktop.openWindow('help', '操作说明', { w: 760, h: 600, model: this });
    this.render();
  }
  unmount() {}
  render() {
    const c = this.win.contentEl;
    c.classList.add('help-app');
    let text = '';
    try { text = NOS.rootVM.vfs.read('/Help/操作说明.txt') || ''; } catch (e) {}
    const tabs = NOS.h('div', { class: 'help-tabs' });
    const body = NOS.h('pre', { class: 'help-body' });
    const t1 = NOS.h('button', { class: 'btn' }, '操作说明');
    const t2 = NOS.h('button', { class: 'btn' }, '程序与接口说明');
    const load = (p) => { try { body.textContent = NOS.rootVM.vfs.read(p) || '（文件缺失）'; } catch (e) { body.textContent = e.message; } };
    t1.addEventListener('click', () => load('/Help/操作说明.txt'));
    t2.addEventListener('click', () => load('/Help/程序与接口说明.txt'));
    tabs.append(t1, t2);
    body.textContent = text;
    c.append(tabs, body);
  }
}
NOS.Help = Help;

/* 根系统设置：名称、壁纸、强调色、界面缩放 */
'use strict';
window.NOS = window.NOS || {};

class Settings {
  open() {
    this.win = NOS.desktop.openWindow('settings', '设置', { w: 560, h: 520, model: this });
    this.render();
  }
  unmount() {}
  apply() { NOS.desktop.settings = Object.assign(NOS.desktop.settings, this.state); NOS.desktop.applySettings(); NOS.persist && NOS.persist(); }
  render() {
    const c = this.win.contentEl;
    c.innerHTML = '';
    c.classList.add('settings-app');
    this.state = Object.assign({}, NOS.desktop.settings);
    const s = this.state;
    c.appendChild(NOS.h('h3', {}, '个性化设置'));

    c.appendChild(NOS.h('div', { class: 'set-row' }, '系统名称'));
    const name = NOS.h('input', { class: 'input', value: s.sysName });
    name.addEventListener('change', () => { s.sysName = name.value; this.apply(); });
    c.appendChild(name);

    c.appendChild(NOS.h('div', { class: 'set-row', dataTestid: 'settings-wallpaper' }, '壁纸'));
    const wp = NOS.h('div', { class: 'wp-grid' });
    [['dusk', '黄昏山谷'], ['dawn', '黎明'], ['night', '星夜']].forEach(([k, l]) => {
      const b = NOS.h('button', { class: 'wp-btn' + (s.wallpaper === k ? ' sel' : ''), dataValue: k, dataTestid: 'settings-wallpaper' }, l);
      b.style.backgroundImage = `url("${NOS.fixtures.wallpapers[k]}")`;
      b.addEventListener('click', () => { s.wallpaper = k; this.apply(); this.render(); });
      wp.appendChild(b);
    });
    c.appendChild(wp);

    c.appendChild(NOS.h('div', { class: 'set-row', dataTestid: 'settings-accent' }, '强调色'));
    const ac = NOS.h('div', { class: 'accent-row' });
    ['#7c3aed', '#2563eb', '#059669', '#dc2626', '#d97706', '#db2777'].forEach(col => {
      const b = NOS.h('button', { class: 'swatch' + (s.accent === col ? ' sel' : ''), dataValue: col, dataTestid: 'settings-accent' });
      b.style.background = col;
      b.addEventListener('click', () => { s.accent = col; this.apply(); this.render(); });
      ac.appendChild(b);
    });
    c.appendChild(ac);

    c.appendChild(NOS.h('div', { class: 'set-row', dataTestid: 'settings-scale' }, '界面缩放'));
    const sc = NOS.h('input', { type: 'range', min: '0.8', max: '1.4', step: '0.05', value: s.scale, dataTestid: 'settings-scale' });
    const lab = NOS.h('span', {}, Math.round(s.scale * 100) + '%');
    sc.addEventListener('input', () => { s.scale = Number(sc.value); lab.textContent = Math.round(s.scale * 100) + '%'; this.apply(); });
    c.append(sc, lab);

    c.appendChild(NOS.h('div', { class: 'hint' }, '设置实时生效并保留；缩放后窗口操作与输入命中仍然正确。'));
  }
}
NOS.Settings = Settings;

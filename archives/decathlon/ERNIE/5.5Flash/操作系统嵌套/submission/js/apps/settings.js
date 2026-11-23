// 设置：名称、壁纸、强调色、缩放、声音与免打扰
import { h, clear, icon, iconSvg } from '../util.js';
import { WALLPAPERS, ACCENTS } from '../data.js';

export class SettingsApp {
  constructor(win, os, state = {}) { this.win = win; this.os = os; this.sys = win.sys; }
  mount(body) {
    const sys = this.sys;
    if (!sys.settings) sys.settings = { name: sys.id, wallpaper: 'dusk', accent: 'blue', scale: 1, dnd: false, volume: 68, brightness: 82, wifi: true };
    const wrap = h('div', { class: 'settings-wrap' });
    const hero = h('div', { class: 'settings-hero' });
    const avatar = h('div', { class: 'settings-avatar' }, (sys.settings.name || sys.id).slice(0, 1).toUpperCase());
    hero.append(avatar, h('div', {}, h('div', { class: 'sh-name', 'data-testid': 'settings-name' }, sys.settings.name || sys.id), h('div', { class: 'sh-sub' }, `${sys.id} · 第 ${sys.depth + 1} 层系统 · 预算 ${sys.budget} / 步`)));
    wrap.append(hero);
    const sec = (title, ...children) => {
      const s = h('div', { class: 'settings-section' }, h('h4', {}, title));
      s.append(...children); wrap.append(s); return s;
    };
    const row = (label, sub, control) => {
      const r = h('div', { class: 'settings-row' });
      r.append(h('div', {}, h('div', { class: 'sr-label' }, label), sub ? h('div', { class: 'sr-sub' }, sub) : null), control);
      return r;
    };
    // 名称
    const nameInput = h('input', { class: 'input', value: sys.settings.name || sys.id, style: { width: '220px' } });
    nameInput.addEventListener('change', () => {
      sys.settings.name = nameInput.value.trim() || sys.id;
      this.os.saveSoon();
      this.os.toast(sys, '名称已更新', sys.settings.name, 'ok');
      hero.querySelector('.sh-name').textContent = sys.settings.name;
      avatar.textContent = sys.settings.name.slice(0, 1).toUpperCase();
    });
    sec('系统', row('系统名称', '显示在开始菜单、任务栏与窗口标题中', nameInput));

    // 壁纸
    const wallGrid = h('div', { class: 'wall-grid' });
    for (const w of WALLPAPERS) {
      const t = h('div', { class: 'wall-thumb' + (sys.settings.wallpaper === w.id ? ' on' : ''), 'data-testid': 'settings-wallpaper', 'data-value': w.id, title: w.name, style: { backgroundImage: `url("${w.file}")` } });
      t.addEventListener('click', () => {
        sys.settings.wallpaper = w.id;
        for (const x of wallGrid.children) x.classList.toggle('on', x === t);
        this.os.applySettings(sys);
      });
      wallGrid.append(t);
    }
    sec('个性化', row('背景', '随项目交付的四张自制壁纸', wallGrid));

    // 强调色
    const sw = h('div', { class: 'swatch-row' });
    for (const a of ACCENTS) {
      const s = h('div', { class: 'swatch' + (sys.settings.accent === a.id ? ' on' : ''), 'data-testid': 'settings-accent', 'data-value': a.id, title: a.name, style: { background: `linear-gradient(135deg, ${a.a}, ${a.b})` } });
      s.addEventListener('click', () => {
        sys.settings.accent = a.id;
        for (const x of sw.children) x.classList.toggle('on', x === s);
        this.os.applySettings(sys);
      });
      sw.append(s);
    }
    sec('个性化', row('强调色', '影响窗口焦点、按钮、图表与任务栏', sw));

    // 缩放
    const seg = h('div', { class: 'seg' });
    for (const v of [0.85, 1, 1.15, 1.3]) {
      const b = h('button', { class: sys.settings.scale === v ? 'on' : '', 'data-testid': 'settings-scale', 'data-value': String(v) }, Math.round(v * 100) + '%');
      b.addEventListener('click', () => {
        sys.settings.scale = v;
        for (const x of seg.children) x.classList.toggle('on', x === b);
        this.os.applySettings(sys);
        this.os.toast(sys, '界面缩放', `${Math.round(v * 100)}% · 输入命中已同步`, 'ok');
      });
      seg.append(b);
    }
    sec('显示', row('界面缩放', '缩放后窗口拖动、命中与输入仍正确', seg));

    // 声音与亮度
    const vol = h('input', { type: 'range', min: '0', max: '100', value: String(sys.settings.volume ?? 68), style: { width: '200px', accentColor: 'var(--accent)' }, 'data-testid': 'settings-volume' });
    vol.addEventListener('input', () => { sys.settings.volume = Number(vol.value); this.os.saveSoon(); });
    const bri = h('input', { type: 'range', min: '20', max: '100', value: String(sys.settings.brightness ?? 82), style: { width: '200px', accentColor: 'var(--accent)' }, 'data-testid': 'settings-brightness' });
    bri.addEventListener('input', () => { sys.settings.brightness = Number(bri.value); this.os.saveSoon(); });
    sec('声音与显示', row('音量', '系统音量（%）；外部网页音频由 Chromium 控制', vol), row('亮度', '界面亮度（%）', bri));

    // 免打扰与快捷设置
    const dnd = h('button', { class: 'btn' + (sys.settings.dnd ? ' primary' : ''), 'data-testid': 'settings-dnd' }, sys.settings.dnd ? '免打扰：开' : '免打扰：关');
    dnd.addEventListener('click', () => {
      sys.settings.dnd = !sys.settings.dnd;
      dnd.textContent = sys.settings.dnd ? '免打扰：开' : '免打扰：关';
      dnd.classList.toggle('primary', sys.settings.dnd);
      this.os.saveSoon();
    });
    const wifi = h('button', { class: 'btn' + (sys.settings.wifi ? ' primary' : '') }, sys.settings.wifi ? '无线网络：开' : '无线网络：关');
    wifi.addEventListener('click', () => { sys.settings.wifi = !sys.settings.wifi; wifi.textContent = sys.settings.wifi ? '无线网络：开' : '无线网络：关'; wifi.classList.toggle('primary', sys.settings.wifi); this.os.saveSoon(); });
    sec('通知与网络', row('免打扰', '开启后通知仍记录，但不弹出提示条', dnd), row('无线网络', '快捷设置与设置使用同一份状态', wifi));

    const about = h('div', { class: 'settings-section' });
    about.append(h('h4', {}, '关于'));
    about.append(h('div', { class: 'kv' }, h('span', {}, '系统'), h('b', {}, 'Nested OS 1.0 · 嵌套图形操作系统')));
    about.append(h('div', { class: 'kv' }, h('span', {}, '承载环境'), h('b', {}, 'Electron 45 · Chromium')));
    about.append(h('div', { class: 'kv' }, h('span', {}, '时间步长'), h('b', {}, '20 ms / 逻辑步')));
    about.append(h('div', { class: 'kv' }, h('span', {}, '执行预算'), h('b', {}, `${sys.budget} 工作单位 / 步`)));
    about.append(h('div', { style: { marginTop: '10px', display: 'flex', gap: '8px' } },
      (() => { const b = h('button', { class: 'btn' }, '打开操作说明'); b.addEventListener('click', () => this.os.openApp(sys, 'editor', { state: { path: '/System/help.md', help: true } })); return b; })(),
      (() => { const b = h('button', { class: 'btn ghost' }, '恢复默认'); b.addEventListener('click', () => { sys.settings.scale = 1; sys.settings.accent = 'blue'; sys.settings.wallpaper = 'dusk'; this.os.applySettings(sys); this.os.toast(sys, '已恢复默认', '名称与其他设置保留', 'ok'); }); return b; })()
    ));
    wrap.append(about);
    body.append(wrap);
  }
  serialize() { return {}; }
  restore() {}
  beforeClose() { return true; }
  tick() {}
  render() {}
  dispose() {}
}
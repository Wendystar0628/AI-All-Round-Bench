/* 界面公共工具：DOM 构造、时间码格式、面板刷新注册。 */
(function () {
  'use strict';
  const AE = (window.AE = window.AE || {});
  const UI = (AE.UI = AE.UI || {});

  // el('div', {class, text, title, onclick, style, ...}, child | [children] | text)
  UI.el = (tag, attrs, kids) => {
    const n = document.createElement(tag);
    const a = attrs || {};
    Object.keys(a).forEach((k) => {
      const v = a[k];
      if (v === undefined || v === null || v === false) return;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k === 'html') n.innerHTML = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(n.style, v);
      else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else if (k === 'value') n.value = v;
      else if (k === 'checked') n.checked = !!v;
      else if (k === 'disabled') n.disabled = !!v;
      else if (k === 'data') Object.keys(v).forEach((dk) => (n.dataset[dk] = v[dk]));
      else n.setAttribute(k, v === true ? '' : v);
    });
    const add = (c) => {
      if (c === undefined || c === null || c === false) return;
      if (Array.isArray(c)) c.forEach(add);
      else if (c instanceof Node) n.appendChild(c);
      else n.appendChild(document.createTextNode(String(c)));
    };
    add(kids);
    return n;
  };
  UI.clear = (node) => {
    while (node && node.firstChild) node.removeChild(node.firstChild);
    return node;
  };

  // 时间码：秒 -> "0:03.20" 与帧号
  UI.tc = (t, fps) => {
    const m = Math.floor(t / 60);
    const s = t - m * 60;
    return m + ':' + (s < 10 ? '0' : '') + s.toFixed(2);
  };
  UI.frameOf = (t, fps) => Math.round(t * fps);

  // 面板注册：每个面板提供 full(结构刷新) / time(播放头变化) / values(数值刷新)
  UI.panels = [];
  UI.register = (p) => {
    UI.panels.push(p);
    AE.App.register(p);
    return p;
  };
  UI.syncAll = () => UI.panels.forEach((p) => p.full && p.full());

  UI.toast = (t) => AE.App.toast(t);

  // 常用图标（文字符号，避免依赖外部资源）
  UI.ICON = {
    eye: '◉',
    lock: '🔒',
    solo: '●',
    play: '▶',
    pause: '❚❚',
    prev: '⏮',
    next: '⏭',
    stepB: '◀',
    stepF: '▶',
    key: '◆',
    keyOff: '◇',
    watch: '⏱',
    fx: 'fx',
    up: '▲',
    down: '▼',
    x: '✕',
    plus: '+',
  };

  // 颜色：[r,g,b] 0..1 与 #rrggbb 互转
  UI.rgbToHex = (c) => '#' + c.map((v) => Math.round(U_clamp(v) * 255).toString(16).padStart(2, '0')).join('');
  UI.hexToRgb = (h) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(h || '');
    if (!m) return [1, 1, 1];
    const v = parseInt(m[1], 16);
    return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
  };
  function U_clamp(v) {
    return Math.max(0, Math.min(1, v));
  }

  // 图层类型的显示颜色（时间轴条）
  UI.typeColor = {
    shape: '#e0844a',
    text: '#e6c25a',
    null: '#7d8190',
    adjust: '#8aa6d6',
    precomp: '#7fc4a0',
    camera: '#b9a2e8',
    light: '#f2e28a',
    geo: '#d98ad0',
    particles: '#7fd7f0',
    sound: '#9bd46b',
  };
  UI.typeIcon = {
    shape: '◇',
    text: 'T',
    null: '○',
    adjust: '◐',
    precomp: '▣',
    camera: '🎥',
    light: '☀',
    geo: '⬢',
    particles: '✦',
    sound: '♪',
  };

  // 小工具：读取当前合成与图层
  UI.comp = () => AE.App.comp();
  UI.layerOf = (id) => AE.App.layer(id);
})();

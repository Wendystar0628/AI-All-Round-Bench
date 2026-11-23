// 统一的线性图标集（自制，不复制任何现有系统的图标）
(function () {
  const P = {
    files: '<path d="M3 7.5A2 2 0 0 1 5 5.5h3.2l1.6 1.8H19a2 2 0 0 1 2 2v7.2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7.5Z"/><path d="M3 9.5h18"/>',
    spreadsheet: '<rect x="3" y="4.5" width="18" height="15" rx="2"/><path d="M3 9.5h18M3 14.5h18M9 4.5v15M15 4.5v15"/>',
    widgets: '<rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="5" rx="2"/><rect x="13" y="10" width="8" height="11" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/>',
    editor: '<path d="M4 20h16"/><path d="M6 16.5 15.6 6.9a2 2 0 0 1 2.8 0l.7.7a2 2 0 0 1 0 2.8L9.5 20H6v-3.5Z"/><path d="M14 8.5l2.5 2.5"/>',
    tasks: '<path d="M3 6h5v5H3zM10 6h5v5h-5zM17 6h4v5h-4zM3 14h5v5H3zM10 14h5v5h-5z"/><path d="M17 14v5M19.5 16.5h-5" opacity=".6"/>',
    settings: '<circle cx="12" cy="12" r="3.1"/><path d="M12 2.8v2.4M12 18.8v2.4M21.2 12h-2.4M5.2 12H2.8M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7M18.5 18.5l-1.7-1.7M7.2 7.2 5.5 5.5"/>',
    browser: '<circle cx="12" cy="12" r="8.6"/><path d="M3.5 12h17M12 3.4c2.4 2.3 3.6 5.3 3.6 8.6s-1.2 6.3-3.6 8.6c-2.4-2.3-3.6-5.3-3.6-8.6S9.6 5.7 12 3.4Z"/>',
    player: '<rect x="2.8" y="4.5" width="18.4" height="15" rx="2.4"/><path d="M10.2 8.6v6.8l5.6-3.4-5.6-3.4Z"/>',
    charts: '<path d="M3.5 20.5h17"/><path d="M6 20.5V12M11 20.5V6.5M16 20.5v-9M21 20.5V9.5" opacity=".9"/>',
    projection: '<rect x="2.8" y="4" width="13" height="11" rx="2"/><path d="M15.8 8.2h4.4a1.4 1.4 0 0 1 1.4 1.4v7.4a1.4 1.4 0 0 1-1.4 1.4H9.4A1.4 1.4 0 0 1 8 17v-1.6"/>',
    systems: '<rect x="3" y="3" width="8" height="6.5" rx="1.6"/><rect x="13" y="3" width="8" height="6.5" rx="1.6"/><rect x="7" y="14.5" width="10" height="6.5" rx="1.6"/><path d="M7 9.5v2.3h10V9.5M12 11.8v2.7"/>',
    help: '<circle cx="12" cy="12" r="8.6"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.3 2.4c-.7.3-.9.8-.9 1.5v.4"/><circle cx="12" cy="16.6" r=".7" fill="currentColor" stroke="none"/>',
    power: '<path d="M12 3v8"/><path d="M7.2 5.6a8 8 0 1 0 9.6 0"/>',
    search: '<circle cx="10.8" cy="10.8" r="6.4"/><path d="m15.4 15.4 4.2 4.2"/>',
    folder: '<path d="M3 7.5A2 2 0 0 1 5 5.5h3.2l1.6 1.8H19a2 2 0 0 1 2 2v7.2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7.5Z"/>',
    file: '<path d="M6 3.5h7l5 5V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z"/><path d="M13 3.5v5h5"/>',
    trash: '<path d="M4.5 6.5h15M9.5 6.5V4.8a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1.7"/><path d="M6.5 6.5 7.4 20h9.2l.9-13.5"/><path d="M10 10.5v6M14 10.5v6"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.6"/><path d="m3.5 17 5-5 3.5 3.5 3-3 5.5 5.5"/>',
    note: '<path d="M5 3.5h14v12l-5 5H5v-17Z"/><path d="M14 20.5V16h5"/><path d="M8 8h8M8 11.5h5"/>',
    clock: '<circle cx="12" cy="12" r="8.6"/><path d="M12 7.2V12l3.2 2"/>',
    timer: '<circle cx="12" cy="13.4" r="7.4"/><path d="M12 9.4v4l2.6 1.6M9.6 2.8h4.8"/>',
    bell: '<path d="M6 16.5v-6a6 6 0 0 1 12 0v6l1.5 2.5H4.5L6 16.5Z"/><path d="M10 21.5a2 2 0 0 0 4 0"/>',
    pin: '<path d="m9 3.5 6 0-.6 6 3 3v1.6H6.6V12.5l3-3L9 3.5Z"/><path d="M12 14.2v6.3"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    minimize: '<path d="M5 12.5h14"/>',
    maximize: '<rect x="5" y="5" width="14" height="14" rx="2"/>',
    restore: '<rect x="4" y="8" width="12" height="12" rx="2"/><path d="M8.5 8V6a2 2 0 0 1 2-2H18a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-2"/>',
    chevronLeft: '<path d="m14.5 5.5-6.5 6.5 6.5 6.5"/>',
    chevronRight: '<path d="m9.5 5.5 6.5 6.5-6.5 6.5"/>',
    chevronDown: '<path d="m5.5 9.5 6.5 6.5 6.5-6.5"/>',
    chevronUp: '<path d="m5.5 14.5 6.5-6.5 6.5 6.5"/>',
    refresh: '<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 3.8v4.6h-4.6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    play: '<path d="M7.5 4.8v14.4L19.5 12 7.5 4.8Z"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    stop: '<rect x="5.5" y="5.5" width="13" height="13" rx="2"/>',
    step: '<path d="M5 5.5v13L15 12 5 5.5Z"/><path d="M18 5.5v13"/>',
    loop: '<path d="M4 12a8 8 0 0 1 13.6-5.7"/><path d="M20 12a8 8 0 0 1-13.6 5.7"/><path d="M17.5 2.6v3.9h-3.9M6.5 21.4v-3.9h3.9"/>',
    camera: '<path d="M3.5 8.5h4l1.5-2h6l1.5 2h4v10h-17v-10Z"/><circle cx="12" cy="13.2" r="3.4"/>',
    link: '<path d="M10.5 13.5a3.5 3.5 0 0 0 5 0l2.5-2.5a3.5 3.5 0 0 0-5-5l-1 1"/><path d="M13.5 10.5a3.5 3.5 0 0 0-5 0L6 13a3.5 3.5 0 0 0 5 5l1-1"/>',
    unlink: '<path d="M10.5 13.5a3.5 3.5 0 0 0 5 0l2.5-2.5a3.5 3.5 0 0 0-5-5l-1 1"/><path d="M13.5 10.5a3.5 3.5 0 0 0-5 0L6 13a3.5 3.5 0 0 0 5 5l1-1"/><path d="m3 3 18 18"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
    paste: '<rect x="5" y="4.5" width="14" height="16" rx="2"/><path d="M9 4.5V3.2h6v1.3"/><path d="M8.5 10h7M8.5 13.5h7M8.5 17h4"/>',
    scissors: '<circle cx="6.5" cy="7" r="2.5"/><circle cx="6.5" cy="17" r="2.5"/><path d="m8.6 8.4 10.9 8.1M8.6 15.6 19.5 7.5"/>',
    check: '<path d="m4.5 12.5 5 5L20 6.5"/>',
    warning: '<path d="M12 3.5 21.5 20h-19L12 3.5Z"/><path d="M12 9.5v5"/><circle cx="12" cy="17.2" r=".8" fill="currentColor" stroke="none"/>',
    info: '<circle cx="12" cy="12" r="8.6"/><path d="M12 11v5.5"/><circle cx="12" cy="8.2" r=".8" fill="currentColor" stroke="none"/>',
    upload: '<path d="M12 16V4.5M7.5 9 12 4.5 16.5 9"/><path d="M4 16v3.5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V16"/>',
    download: '<path d="M12 4.5V16M7.5 11.5 12 16l4.5-4.5"/><path d="M4 16v3.5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V16"/>',
    home: '<path d="m3.5 11 8.5-7 8.5 7"/><path d="M6 9.5V20h12V9.5"/>',
    dot: '<circle cx="12" cy="12" r="3.4" fill="currentColor" stroke="none"/>',
    fork: '<circle cx="6" cy="5.5" r="2.2"/><circle cx="18" cy="5.5" r="2.2"/><circle cx="12" cy="18.5" r="2.2"/><path d="M6 7.7v2.1a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7.7M12 11.8v4.5"/>',
    snapshot: '<path d="M4 8.5h4l1.5-2h5L16 8.5h4v10H4v-10Z"/><circle cx="12" cy="13" r="3.2"/><path d="M8 3.5h8"/>',
    wifi: '<path d="M3 9.5a14 14 0 0 1 18 0M6.5 13a9 9 0 0 1 11 0M9.8 16.4a4.4 4.4 0 0 1 4.4 0"/><circle cx="12" cy="19.4" r=".9" fill="currentColor" stroke="none"/>',
    volume: '<path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4v-5Z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
    moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M21.5 12h-2M4.5 12h-2M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4M18.7 18.7l-1.4-1.4M6.7 6.7 5.3 5.3"/>',
    grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.4"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.4"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.4"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.4"/>',
    list: '<path d="M8.5 6h12M8.5 12h12M8.5 18h12"/><circle cx="4.5" cy="6" r="1" fill="currentColor" stroke="none"/><circle cx="4.5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="4.5" cy="18" r="1" fill="currentColor" stroke="none"/>',
    terminal: '<path d="M3.5 5.5h17v13h-17v-13Z"/><path d="m7 9.5 3 2.5-3 2.5M12.5 14.5h4"/>',
    book: '<path d="M4 4.5h6a3 3 0 0 1 3 3v12a2.5 2.5 0 0 0-2.5-2.5H4v-12Z"/><path d="M20 4.5h-4a3 3 0 0 0-3 3v12a2.5 2.5 0 0 1 2.5-2.5H20v-12Z"/>',
    filter: '<path d="M3.5 5.5h17l-6.5 7.6v5.4l-4 2.5v-7.9L3.5 5.5Z"/>',
    spinner: '<path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5"/>'
  };
  const APP_ICON = {
    files: 'files', spreadsheet: 'spreadsheet', widgets: 'widgets', editor: 'editor',
    tasks: 'tasks', settings: 'settings', browser: 'browser', player: 'player',
    charts: 'charts', projection: 'projection', systems: 'systems', help: 'help'
  };
  function icon(name, size, cls) {
    const d = P[name] || P.dot;
    const s = size || 18;
    return '<svg class="ic ' + (cls || '') + '" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
  }
  function appIcon(appId, size, cls) {
    return icon(APP_ICON[appId] || 'dot', size, cls);
  }
  // ---- 把图标标记转成 Path2D（同步、可任意缩放着色） ----
  const P2 = {};
  function elAttrs(tag) {
    const o = {};
    const re = /([a-zA-Z-]+)="([^"]*)"/g;
    let m;
    while ((m = re.exec(tag))) o[m[1]] = m[2];
    return o;
  }
  function buildPath(name) {
    const d = P[name];
    if (!d) return null;
    const p = new Path2D();
    const re = /<(path|rect|circle|line)([^>]*)\/?>(?:<\/(?:path|rect|circle|line)>)?/g;
    let m;
    while ((m = re.exec(d))) {
      const tag = m[1], a = elAttrs(m[2]);
      if (tag === 'path' && a.d) p.addPath(new Path2D(a.d));
      else if (tag === 'circle') {
        const cx = +a.cx || 0, cy = +a.cy || 0, r = +a.r || 0;
        p.moveTo(cx + r, cy); p.arc(cx, cy, r, 0, Math.PI * 2);
      } else if (tag === 'rect') {
        const x = +a.x || 0, y = +a.y || 0, w = +a.width || 0, h = +a.height || 0, r = +a.rx || 0;
        const rr = Math.min(r, w / 2, h / 2);
        p.moveTo(x + rr, y);
        p.lineTo(x + w - rr, y); p.quadraticCurveTo(x + w, y, x + w, y + rr);
        p.lineTo(x + w, y + h - rr); p.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
        p.lineTo(x + rr, y + h); p.quadraticCurveTo(x, y + h, x, y + h - rr);
        p.lineTo(x, y + rr); p.quadraticCurveTo(x, y, x + rr, y);
        p.closePath();
      } else if (tag === 'line') {
        p.moveTo(+a.x1 || 0, +a.y1 || 0); p.lineTo(+a.x2 || 0, +a.y2 || 0);
      }
    }
    return p;
  }
  function path2d(name) {
    if (!(name in P2)) P2[name] = buildPath(name);
    return P2[name];
  }
  window.Icons = { icon, appIcon, paths: P, path2d };
})();

/* 网络安全攻防战 — 界面图标（自绘 SVG，统一 24×24 线性风格） */
(function (root) {
  'use strict';
  const TD = root.TD;
  const P = {
    // 塔
    firewall: '<path d="M12 2.5l8 3v6.2c0 4.6-3.3 8.2-8 9.8-4.7-1.6-8-5.2-8-9.8V5.5z"/><path d="M4.6 9.5h14.8M5.4 13.5h13.2M12 5.5v4M8.5 9.5v4M15.5 9.5v4M12 13.5v4.5"/>',
    honeypot: '<path d="M8 4h8M9 4v2.2c-2.6 1.2-4 3.6-4 6.6 0 4.2 2.6 7.2 7 7.2s7-3 7-7.2c0-3-1.4-5.4-4-6.6V4"/><path d="M12 9.2l2.6 1.5v3l-2.6 1.5-2.6-1.5v-3z"/><path d="M5.6 11h2.2M16.2 11h2.2"/>',
    gateway: '<path d="M4 21V5h3v16M17 21V5h3v16M7 7h10M2.5 21h19"/><path d="M9 21V11h6v10M9 14.5h6M9 18h6"/><path d="M8 3.2l8-1.4"/>',
    interceptor: '<circle cx="10" cy="14" r="5.2"/><path d="M13.8 10.2L21 3M17.5 3H21v3.5M10 11.2v5.6M7.2 14h5.6M3 21h14"/>',
    sandbox: '<path d="M12 2.5l8.2 4.6v9.8L12 21.5l-8.2-4.6V7.1z"/><path d="M3.8 7.1L12 11.8l8.2-4.7M12 11.8v9.7"/><circle cx="12" cy="6.9" r="1.3"/>',
    repair: '<circle cx="12" cy="12" r="8.6"/><path d="M12 7v10M7 12h10"/><path d="M12 1.5v2M12 20.5v2M1.5 12h2M20.5 12h2"/>',
    // 敌人
    worm: '<path d="M3 15c2-4 4-4 6 0s4 4 6 0 3.5-5 5-3"/><circle cx="20.3" cy="11.6" r="1.6"/><path d="M5.5 12.2l-.8-2M10.4 16.6l-.6 2M14.6 12l.9-1.9"/>',
    flood: '<rect x="9" y="9" width="6" height="6"/><rect x="3" y="4" width="3.6" height="3.6"/><rect x="17" y="3.5" width="3.6" height="3.6"/><rect x="2.6" y="16.5" width="3.6" height="3.6"/><rect x="17.6" y="16" width="3.6" height="3.6"/><rect x="10.4" y="2.4" width="3" height="3"/><rect x="10.6" y="18.6" width="3" height="3"/>',
    trojan: '<rect x="3" y="5" width="18" height="14" rx="1.6" stroke-dasharray="3 2.2"/><path d="M8.5 16V11l3-3 1.2 1.6 2.8.4v2.6l-2.2.8V16z"/><circle cx="12.6" cy="10.8" r=".6"/>',
    ransom: '<rect x="4.5" y="10" width="15" height="11" rx="1.6"/><path d="M7.5 10V7.2a4.5 4.5 0 019 0V10"/><circle cx="12" cy="14.4" r="1.7"/><path d="M12 16v2.6"/>',
    hotspot: '<path d="M2.5 9.5c5.6-5.3 13.4-5.3 19 0M5.6 12.8c3.8-3.5 9-3.5 12.8 0M8.8 16c2-1.8 4.4-1.8 6.4 0"/><circle cx="12" cy="19.2" r="1.5"/><path d="M3 4l3 1.6M21 4l-3 1.6"/>',
    packer: '<path d="M12 2.5l8.2 4.6v9.8L12 21.5l-8.2-4.6V7.1z"/><path d="M12 7l4.4 2.5v5L12 17l-4.4-2.5v-5z"/><circle cx="12" cy="12" r="1.4"/>',
    boss1: '<path d="M4 3l16 0M12 3v3M6 3v5M18 3v5"/><circle cx="12" cy="8.4" r="2.4"/><path d="M12 10.8V16M8 12.5h8M12 16l-3 5M12 16l3 5"/><circle cx="6" cy="10" r="1.6"/><circle cx="18" cy="10" r="1.6"/>',
    boss2: '<path d="M12 2l4.5 6h-9zM12 9.5l6 7h-12zM7 18h10l-5 4z"/><path d="M2.5 13l3-4M21.5 13l-3-4" stroke-dasharray="1.5 2"/>',
    boss3: '<ellipse cx="12" cy="12.5" rx="4.6" ry="6.4"/><path d="M12 6.1V19M9 4l1.6 2.4M15 4l-1.6 2.4M7.5 9.5L3.5 7.5M16.5 9.5l4-2M7.4 13H3M16.6 13H21M7.8 16.5l-3.6 3M16.2 16.5l3.6 3"/>',
    // 道具
    isolator: '<circle cx="12" cy="12" r="5"/><path d="M8.5 15.5l7-7"/><path d="M3 8V3h5M21 8V3h-5M3 16v5h5M21 16v5h-5"/>',
    downgrade: '<path d="M12 3v11M7.5 10l4.5 4.5 4.5-4.5"/><path d="M3 18h4M10 18h4M17 18h4M3 21.5h18" />',
    restore: '<path d="M4.2 12a7.8 7.8 0 107.8-7.8H8"/><path d="M11 1.5L8 4.2 11 7"/><path d="M12 8.5v7M8.5 12h7"/>',
    // 资源与控件
    compute: '<rect x="6.5" y="6.5" width="11" height="11" rx="1.4"/><rect x="9.6" y="9.6" width="4.8" height="4.8"/><path d="M9.5 6.5V3M14.5 6.5V3M9.5 21v-3.5M14.5 21v-3.5M6.5 9.5H3M6.5 14.5H3M21 9.5h-3.5M21 14.5h-3.5"/>',
    intel: '<path d="M2 12c3-5 6.2-7.2 10-7.2S19 7 22 12c-3 5-6.2 7.2-10 7.2S5 17 2 12z"/><circle cx="12" cy="12" r="3.2"/><path d="M12 2v1.6M12 20.4V22"/>',
    integrity: '<path d="M12 2.5l8 3v6.2c0 4.6-3.3 8.2-8 9.8-4.7-1.6-8-5.2-8-9.8V5.5z"/><path d="M6.5 12.4h3l1.4-3 2.2 5.6 1.4-2.6h3"/>',
    wave: '<path d="M2 14c2.4 0 2.4-4 5-4s2.6 4 5 4 2.4-4 5-4 2.6 4 5 4"/><path d="M2 19c2.4 0 2.4-2.4 5-2.4S9.6 19 12 19s2.4-2.4 5-2.4S19.600 19 22 19" opacity=".55"/><path d="M12 3v4M9.6 5l2.4 2.4L14.400 5"/>',
    pause: '<path d="M8 4.5v15M16 4.5v15" stroke-width="3"/>',
    play: '<path d="M7 4.5l12 7.5-12 7.500z" fill="currentColor"/>',
    menu: '<path d="M4 6.5h16M4 12h16M4 17.500h16"/>',
    sound: '<path d="M4 9.500v5h3.500l5 4v-13l-5 4z"/><path d="M16 9a4.200 4.200 0 010 6M18.600 6.400a8 8 0 010 11.200"/>',
    mute: '<path d="M4 9.500v5h3.500l5 4v-13l-5 4z"/><path d="M16.500 9.500l5 5M21.500 9.500l-5 5"/>',
    home: '<path d="M3 11.500l9-8 9 8M5.500 9.800V20.500h13V9.800"/><circle cx="12" cy="14" r="2.400"/>',
    book: '<path d="M4 4.500h6.500c.9 0 1.500.6 1.500 1.500v14c0-.9-.6-1.500-1.500-1.500H4zM20 4.500h-6.500c-.9 0-1.500.6-1.500 1.500v14c0-.9.6-1.500 1.500-1.500H20z"/>',
    close: '<path d="M5.500 5.500l13 13M18.500 5.500l-13 13"/>',
    check: '<path d="M4.500 12.500l5 5 10-11"/>',
    up: '<path d="M12 20V5M5.500 11.500L12 5l6.500 6.500"/><path d="M5 21.500h14" opacity=".5"/>',
    sell: '<path d="M5 7h14l-1.200 13.500H6.200zM9 7V4.500h6V7M3.500 7h17"/><path d="M10 11v6M14 11v6"/>',
    skill: '<path d="M13.500 2.500L5 13.500h6l-1.500 8L19 10h-6.200z"/>',
    node: '<circle cx="12" cy="12" r="4.500"/><path d="M12 2.500v5M12 16.500v5M2.500 12h5M16.500 12h5"/>',
    link: '<path d="M3 9h18M3 15h18"/><path d="M8 12h2M14 12h2" />',
    platform: '<path d="M12 4l9 4.500-9 4.500-9-4.500z"/><path d="M3 8.500v6l9 4.500 9-4.500v-6"/>',
    obstacle: '<rect x="5" y="3.500" width="14" height="17" rx="1"/><path d="M8 7.500h8M8 11.500h8M8 15.500h8"/>',
    legacy: '<path d="M3 9h18M3 15h18"/><path d="M5 9l3 6M10 9l3 6M15 9l3 6"/>',
    entry: '<path d="M5 21V6a7 7 0 0114 0v15"/><path d="M12 10v8M8.500 14.500L12 18l3.500-3.500"/>',
    demo: '<rect x="3" y="4.500" width="18" height="13" rx="1.500"/><path d="M10 8.500l5 2.500-5 2.500zM8 21h8M12 17.500V21"/>',
    gear: '<circle cx="12" cy="12" r="3.200"/><path d="M12 2.500v3M12 18.500v3M2.500 12h3M18.500 12h3M5.300 5.300l2.100 2.100M16.600 16.600l2.100 2.100M5.300 18.700l2.100-2.100M16.600 7.400l2.100-2.100"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.200v.6"/>',
    lock: '<rect x="5" y="10.500" width="14" height="10" rx="1.500"/><path d="M8 10.500V7.500a4 4 0 018 0v3"/>',
    shield: '<path d="M12 2.500l8 3v6.200c0 4.600-3.300 8.200-8 9.800-4.700-1.600-8-5.200-8-9.800V5.500z"/>',
    eye: '<path d="M2 12c3-5 6.200-7.200 10-7.200S19 7 22 12c-3 5-6.200 7.200-10 7.200S5 17 2 12z"/><circle cx="12" cy="12" r="3"/>',
    retry: '<path d="M19.800 12a7.800 7.800 0 11-2.600-5.800"/><path d="M19.500 3v4.500H15"/>',
    back: '<path d="M10 5.500L3.500 12 10 18.500M4 12h16.500"/>',
    arrow: '<path d="M4 12h15M13.500 6.500L19 12l-5.500 5.500"/>',
    mouse: '<rect x="6.500" y="2.500" width="11" height="19" rx="5.500"/><path d="M12 6.500v4"/>'
  };
  TD.icon = function (name, cls) {
    return '<svg class="ic ' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + (P[name] || P.info) + '</svg>';
  };
  TD.ROLE_COLORS = { block: '#49d6ff', lure: '#ffb53a', iso: '#ff8a3a', ranged: '#7fb4ff', detect: '#b79cff', heal: '#5dffa0' };
  TD.ENEMY_COLORS = { worm: '#ff5fa8', flood: '#c56bff', trojan: '#8fb8ff', ransom: '#ff4060', hotspot: '#d08aff', packer: '#b46bff', boss1: '#ff3050', boss2: '#c060ff', boss3: '#ff7a3a' };
})(window);

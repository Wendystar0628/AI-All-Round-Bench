/* =========================================================================
 *  动态路由塔防 · 界面
 *  ui.js — 主菜单 / 战斗面板 / 图鉴 / 事件报告 / 部署交互
 * ========================================================================= */
(function (global) {
  'use strict';
  const RT = (global.RT = global.RT || {});
  const U = RT.util;
  const D = RT.DATA;
  const el = U.el;

  /* ---------------- 图标 ---------------- */
  const ICON = {
    firewall: '<svg viewBox="0 0 48 48"><path d="M24 4 41 10v14c0 10-7 17-17 20C14 41 7 34 7 24V10z" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M15 24h18M24 15v18" stroke="currentColor" stroke-width="2.5" fill="none"/></svg>',
    honeypot: '<svg viewBox="0 0 48 48"><path d="M14 16h20l-3 22H17z" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M12 16h24M18 10c0-3 3-5 6-5s6 2 6 5" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="24" cy="27" r="4" fill="currentColor"/></svg>',
    gateway: '<svg viewBox="0 0 48 48"><rect x="6" y="8" width="36" height="32" rx="3" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M15 8v32M33 8v32M15 24h18" stroke="currentColor" stroke-width="2.5" fill="none"/></svg>',
    interceptor: '<svg viewBox="0 0 48 48"><path d="M8 38h32" stroke="currentColor" stroke-width="2.5"/><path d="M14 38v-8h12v8" fill="none" stroke="currentColor" stroke-width="2.5"/><rect x="20" y="14" width="14" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M34 20h10" stroke="currentColor" stroke-width="3"/></svg>',
    sandbox: '<svg viewBox="0 0 48 48"><path d="M24 6 40 15v18L24 42 8 33V15z" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="24" cy="24" r="6" fill="none" stroke="currentColor" stroke-width="2.5"/></svg>',
    repair: '<svg viewBox="0 0 48 48"><path d="M20 8h8v12h12v8H28v12h-8V28H8v-8h12z" fill="none" stroke="currentColor" stroke-width="2.5"/></svg>',
    isolator: '<svg viewBox="0 0 48 48"><rect x="10" y="18" width="28" height="20" rx="3" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M17 18v-5a7 7 0 0 1 14 0v5" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="24" cy="28" r="3" fill="currentColor"/></svg>',
    downgrade: '<svg viewBox="0 0 48 48"><path d="M24 6v22" stroke="currentColor" stroke-width="3"/><path d="m16 20 8 9 8-9" fill="none" stroke="currentColor" stroke-width="3"/><path d="M8 38h32" stroke="currentColor" stroke-width="3"/></svg>',
    restore: '<svg viewBox="0 0 48 48"><path d="M38 24a14 14 0 1 1-4-9.9" fill="none" stroke="currentColor" stroke-width="3"/><path d="M38 6v10H28" fill="none" stroke="currentColor" stroke-width="3"/></svg>',
    worm: '<svg viewBox="0 0 48 48"><path d="M6 30c6-12 12 6 18-6s12 6 18-6" fill="none" stroke="currentColor" stroke-width="3.5"/><circle cx="38" cy="18" r="4" fill="currentColor"/></svg>',
    flood: '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="12" fill="none" stroke="currentColor" stroke-width="3"/><path d="M24 12a12 12 0 0 1 0 24" fill="currentColor" opacity=".45"/></svg>',
    trojan: '<svg viewBox="0 0 48 48"><path d="M12 24h24l-4 12H16z" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M16 24v-6h16v6" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="19" cy="21" r="2" fill="currentColor"/><circle cx="29" cy="21" r="2" fill="currentColor"/></svg>',
    extorter: '<svg viewBox="0 0 48 48"><path d="M24 6v22" stroke="currentColor" stroke-width="3"/><path d="M14 28h20l-4 14H18z" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M12 28 8 14M36 28l4-14" stroke="currentColor" stroke-width="2.5"/></svg>',
    hotspot: '<svg viewBox="0 0 48 48"><path d="M24 18a6 6 0 1 1 0 12 6 6 0 0 1 0-12" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M12 10a16 16 0 0 0 0 28M36 10a16 16 0 0 1 0 28" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M24 30v12" stroke="currentColor" stroke-width="2.5"/></svg>',
    shell: '<svg viewBox="0 0 48 48"><path d="M24 6 40 15v18L24 42 8 33V15z" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="24" cy="24" r="7" fill="none" stroke="currentColor" stroke-width="2.5"/></svg>',
    wankui: '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="8" fill="currentColor"/><circle cx="24" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="8" cy="24" r="4" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="40" cy="24" r="4" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="24" cy="40" r="4" fill="none" stroke="currentColor" stroke-width="2.5"/></svg>',
    shanlou: '<svg viewBox="0 0 48 48"><path d="M24 4 36 44H12z" fill="none" stroke="currentColor" stroke-width="2.5"/><ellipse cx="24" cy="22" rx="13" ry="4" fill="none" stroke="currentColor" stroke-width="2.5"/></svg>',
    zheyin: '<svg viewBox="0 0 48 48"><path d="M24 4 38 14v22L24 46 10 36V14z" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M16 22h5M27 22h5" stroke="currentColor" stroke-width="3"/><path d="M18 32h12" stroke="currentColor" stroke-width="2.5"/></svg>'
  };

  const UI = {
    app: null, root: null, screen: 'menu',
    drag: null, aim: null, selected: null, hoverCell: null,
    logs: [], logHist: [], toastT: 0
  };

  /* ================= 初始化 ================= */
  UI.init = function (app) {
    UI.app = app;
    UI.root = document.getElementById('app');
    buildMenu();
    buildCodex();
    buildDemos();
    buildResult();
    buildHUD();
    bindGlobal();
    app.bus.on('notice', (n) => UI.notice(n.text, n.level));
    app.bus.on('integrity', () => refreshHUD());
    app.bus.on('wave', (w) => {
      UI.log('第 ' + w.wave + ' / ' + w.total + ' 波 · ' + (w.note || ''), w.flood ? 'danger' : 'warn');
      refreshHUD();
    });
    app.bus.on('gameover', (r) => showResult(r));
    showScreen('menu');
  };

  /* ================= 屏幕切换 ================= */
  function showScreen(name) {
    UI.screen = name;
    ['menu', 'hud', 'codex', 'demos', 'result'].forEach((s) => {
      const e = document.getElementById('screen-' + s);
      if (e) e.classList.toggle('active', s === name);
    });
    document.body.classList.toggle('in-battle', name === 'hud');
  }

  /* ================= 主菜单 ================= */
  function buildMenu() {
    const scr = el('div', { id: 'screen-menu', class: 'screen overlay' });
    const head = el('div', { class: 'menu-head' }, [
      el('div', { class: 'logo-mark' }, [el('span', { text: 'S' })]),
      el('div', {}, [
        el('h1', { text: '动态路由塔防' }),
        el('p', { class: 'sub', text: '网络安全攻防战 · 守护进程日志' })
      ])
    ]);
    const cards = el('div', { class: 'map-cards' });
    D.MAPS.forEach((m) => {
      const card = el('div', { class: 'map-card', 'data-id': m.id }, [
        el('div', { class: 'mc-band', style: { background: `linear-gradient(90deg, ${m.theme.accent}22, transparent)` } }),
        el('div', { class: 'mc-title' }, [
          el('h2', { text: m.name }),
          el('span', { class: 'mc-brief', text: m.brief })
        ]),
        el('p', { class: 'mc-desc', text: m.desc }),
        el('div', { class: 'mc-meta' }, [
          el('div', {}, [el('b', { text: m.sector })]),
          el('div', { class: 'mc-entries' }, m.vertices.filter((v) => v.kind === 'entry').map((v) =>
            el('span', { class: 'chip', text: v.name, style: { color: v.color, borderColor: v.color + '66' } })))
        ]),
        el('div', { class: 'mc-foot' }, [
          el('button', {
            class: 'btn primary', text: '进入防御',
            onclick: (e) => { e.stopPropagation(); UI.app.startMap(m.id); }
          }),
          el('button', {
            class: 'btn ghost', text: '查看情报',
            onclick: (e) => { e.stopPropagation(); openCodex(m.id); }
          })
        ])
      ]);
      cards.appendChild(card);
    });
    // 悬停卡片时，背景 3D 战场切换为该地图
    U.$$('.map-card').forEach((card) => {
      card.addEventListener('mouseenter', () => UI.app.showPreviewMap(card.getAttribute('data-id')));
    });
    const tools = el('div', { class: 'menu-tools' }, [
      el('button', { class: 'btn', text: '实战演示', onclick: () => showScreen('demos') }),
      el('button', { class: 'btn', text: '设备手册 / 威胁档案', onclick: () => openCodex(null) }),
      el('button', { class: 'btn', text: '操作说明', onclick: showHelp }),
      el('button', { class: 'btn', text: '声音：开', onclick: (e) => { const on = UI.app.audio.toggleMute(); e.target.textContent = '声音：' + (on ? '开' : '关'); } })
    ]);
    const tips = el('div', { class: 'menu-tips' }, [
      el('div', { class: 'tip' }, [el('b', { text: '改道' }), '把网闸或防火墙放到交换节点上可隔离该节点，各入口路线会同步重算。']),
      el('div', { class: 'tip' }, [el('b', { text: '连通' }), '任何隔离都不能让入口或场上敌人无路可走，封死的操作会被拒绝。']),
      el('div', { class: 'tip' }, [el('b', { text: '资源' }), '算力建造，情报用于隔离、升级分支与道具，两者不可互换。'])
    ]);
    scr.appendChild(head);
    scr.appendChild(cards);
    scr.appendChild(tools);
    scr.appendChild(tips);
    scr.appendChild(el('div', { class: 'menu-foot' }, [
      el('span', {}, [el('b', { text: '守护进程 ' }), '守护进程日志 · 汐域防御网 v1.0']),
      el('span', { text: '全部素材由代码程序化生成 · 本地文件模式运行' }),
      el('span', {}, [el('b', { text: '中键 ' }), '环绕视角 · ', el('b', { text: '1-6 ' }), '选设备 · ', el('b', { text: 'Q/W/E ' }), '道具'])
    ]));
    UI.root.appendChild(scr);
  }

  function showHelp() {
    UI.notice('中键拖动环绕视角，Shift+中键平移，滚轮缩放；数字键 1-6 选设备，Q/W/E 使用道具，空格暂停', 'info');
  }

  /* ================= 图鉴 ================= */
  let codexMapId = null;
  function buildCodex() {
    const scr = el('div', { id: 'screen-codex', class: 'screen overlay' });
    scr.appendChild(el('div', { class: 'panel-head' }, [
      el('h2', { text: '守护进程资料库' }),
      el('button', { class: 'btn ghost', text: '返回', onclick: () => { if (UI.app.battle && !UI.app.battle.over && UI.app.mapDef) showScreen('hud'); else showScreen('menu'); } })
    ]));
    const tabs = el('div', { class: 'codex-tabs' });
    const body = el('div', { class: 'codex-body', id: 'codex-body' });
    [['devices', '设备手册'], ['threats', '威胁档案'], ['systems', '系统与状态']].forEach((t, i) => {
      tabs.appendChild(el('button', {
        class: 'tab' + (i === 0 ? ' active' : ''), 'data-tab': t[0], text: t[1],
        onclick: (e) => {
          U.$$('.tab', tabs).forEach((x) => x.classList.remove('active'));
          e.target.classList.add('active');
          renderCodex(t[0]);
        }
      }));
    });
    scr.appendChild(tabs);
    scr.appendChild(body);
    UI.root.appendChild(scr);
  }
  function openCodex(mapId) {
    codexMapId = mapId;
    renderCodex('devices');
    showScreen('codex');
  }
  function renderCodex(tab) {
    const body = document.getElementById('codex-body');
    body.innerHTML = '';
    if (tab === 'devices') {
      D.CODEX.devices.forEach((d) => {
        body.appendChild(el('div', { class: 'cx-item' }, [
          el('div', { class: 'cx-icon', style: { color: D.TOWERS[d.id].color }, html: ICON[d.id] || '' }),
          el('div', { class: 'cx-main' }, [
            el('h3', {}, [d.name, el('span', { class: 'cx-tag', text: d.tag })]),
            el('p', { text: d.text }),
            el('p', { class: 'cx-extra', text: d.extra }),
            el('div', { class: 'cx-stats' }, [
              el('span', { text: '生命 ' + D.TOWERS[d.id].hp.join(' / ') }),
              el('span', { text: '造价 ' + D.TOWERS[d.id].cost + ' 算力' }),
              el('span', { text: '可部署于 ' + ({ link: '链路', node: '交换节点', platform: '设备平台' })[D.TOWERS[d.id].place] })
            ])
          ])
        ]));
      });
    } else if (tab === 'threats') {
      D.CODEX.threats.forEach((d) => {
        const def = D.ENEMIES[d.id];
        body.appendChild(el('div', { class: 'cx-item' }, [
          el('div', { class: 'cx-icon danger', style: { color: def.color }, html: ICON[d.id] || '' }),
          el('div', { class: 'cx-main' }, [
            el('h3', {}, [d.name, def.boss ? el('span', { class: 'cx-tag boss', text: 'BOSS' }) : null]),
            el('p', { text: d.text }),
            el('div', { class: 'cx-stats' }, [
              el('span', { text: '生命 ' + def.hp }),
              el('span', { text: '速度 ' + def.speed }),
              el('span', { text: def.flying ? '飞行单位' : '地面单位' }),
              el('span', { text: '回收 ' + def.reward + ' 算力' })
            ])
          ])
        ]));
      });
    } else {
      D.CODEX.systems.forEach((d) => {
        body.appendChild(el('div', { class: 'cx-item wide' }, [
          el('div', { class: 'cx-main' }, [el('h3', { text: d.name }), el('p', { text: d.text })])
        ]));
      });
    }
  }

  /* ================= 演示选择 ================= */
  function buildDemos() {
    const scr = el('div', { id: 'screen-demos', class: 'screen overlay' });
    scr.appendChild(el('div', { class: 'panel-head' }, [
      el('h2', { text: '实战演示' }),
      el('button', { class: 'btn ghost', text: '返回', onclick: () => showScreen('menu') })
    ]));
    const list = el('div', { class: 'demo-list' });
    const demos = RT.Demo ? RT.Demo.list : [];
    demos.forEach((dm) => {
      list.appendChild(el('div', { class: 'demo-card' }, [
        el('div', { class: 'dc-no', text: dm.no }),
        el('div', { class: 'dc-main' }, [
          el('h3', { text: dm.title }),
          el('p', { text: dm.desc }),
          el('div', { class: 'dc-meta' }, [
            el('span', { text: dm.mapName }),
            el('span', { text: '约 ' + dm.duration + ' 秒' })
          ])
        ]),
        el('button', { class: 'btn primary', text: '播放', onclick: () => UI.app.runDemo(dm.id) })
      ]));
    });
    scr.appendChild(list);
    scr.appendChild(el('p', { class: 'hint', text: '演示在游戏逻辑上实时演出，鼠标移动、拖拽与确认都会显示在画面上。' }));
    UI.root.appendChild(scr);
  }

  /* ================= 结算 ================= */
  function buildResult() {
    const scr = el('div', { id: 'screen-result', class: 'screen overlay' });
    const wrap = el('div', { class: 'report' });
    wrap.appendChild(el('div', { class: 'panel-head' }, [
      el('div', {}, [
        el('h2', { id: 'result-title', text: '事件报告' }),
        el('p', { class: 'report-sub', id: 'result-sub', text: '' })
      ]),
      el('div', { class: 'report-stamp', id: 'result-stamp', text: '' })
    ]));
    wrap.appendChild(el('div', { class: 'result-body', id: 'result-body' }));
    scr.appendChild(wrap);
    scr.appendChild(el('div', { class: 'result-actions' }, [
      el('button', { class: 'btn primary', id: 'btn-retry', text: '重开本图' }),
      el('button', { class: 'btn', id: 'btn-menu', text: '返回关卡选择' })
    ]));
    UI.root.appendChild(scr);
    document.getElementById('btn-retry').addEventListener('click', () => UI.app.restart());
    document.getElementById('btn-menu').addEventListener('click', () => UI.app.toMenu());
  }

  function ratingOf(r, integ) {
    if (r.win) {
      if (integ >= 92 && r.stats.leaks === 0) return { g: 'S', d: '完美防线 · 全程零突破' };
      if (integ >= 78) return { g: 'A', d: '防线稳固 · 少量突破' };
      if (integ >= 50) return { g: 'B', d: '勉强守住 · 中枢受损' };
      return { g: 'C', d: '惨胜 · 中枢几近失守' };
    }
    const w = r.wave;
    const total = UI.app.mapDef.waves.length;
    if (w >= total - 2) return { g: 'D', d: '几乎撑到最后一波' };
    if (w >= Math.ceil(total / 2)) return { g: 'E', d: '中局崩盘' };
    return { g: 'F', d: '早期失守' };
  }

  function showResult(r) {
    const t = document.getElementById('result-title');
    t.textContent = r.win ? '事件报告 · 防线守住' : '事件报告 · 中枢失守';
    t.className = r.win ? 'ok' : 'bad';
    const map = UI.app.mapDef;
    const integ = Math.round(UI.app.battle.integrity);
    const sub = document.getElementById('result-sub');
    if (sub) sub.textContent = map.name + ' · ' + map.sector + ' · 报告时长 ' + U.clock(r.time);
    const rt = ratingOf(r, integ);
    const stamp = document.getElementById('result-stamp');
    if (stamp) {
      stamp.innerHTML = '';
      stamp.appendChild(el('b', { class: 'rt-grade', text: rt.g }));
      stamp.appendChild(el('span', { class: 'rt-desc', text: rt.d }));
    }
    const b = document.getElementById('result-body');
    b.innerHTML = '';
    // 判定横幅
    b.appendChild(el('div', { class: 'report-banner ' + (r.win ? 'ok' : 'bad') }, [
      el('div', { class: 'rb-left' }, [
        el('b', { text: r.win ? '防线守住' : '中枢失守' }),
        el('span', { text: r.win ? '全部 ' + map.waves.length + ' 波已清除，中枢完整度剩余 ' + integ + '%。' : '中枢完整度归零，汐域本次防线被击穿于第 ' + r.wave + ' 波。' })
      ]),
      el('div', { class: 'rb-right' }, [
        el('b', { text: integ + '%' }),
        el('span', { text: '中枢完整度' })
      ])
    ]));
    const rows = [
      ['守护波次', r.stats.waves + ' / ' + map.waves.length],
      ['消灭威胁', r.stats.kills],
      ['突破次数', r.stats.leaks],
      ['造成伤害', Math.round(r.stats.damage)],
      ['部署设备', r.stats.deployed],
      ['改道次数', r.stats.reroutes],
      ['隔离节点', r.stats.isolated],
      ['使用道具', r.stats.items],
      ['释放技能', r.stats.skills],
      ['用时', U.clock(r.time)]
    ];
    const grid = el('div', { class: 'stat-grid' });
    rows.forEach((row) => {
      grid.appendChild(el('div', { class: 'stat' }, [
        el('span', { class: 'st-k', text: row[0] }),
        el('span', { class: 'st-v', text: row[1] })
      ]));
    });
    b.appendChild(grid);
    // 战况纪要
    const hist = (UI.logHist || []).slice(-14).reverse();
    if (hist.length) {
      const tl = el('div', { class: 'timeline' }, [el('div', { class: 'tl-title', text: '战况纪要' })]);
      hist.forEach((x) => {
        tl.appendChild(el('div', { class: 'tl-item ' + (x.level || 'info') }, [
          el('i', { class: 'tl-dot' }),
          el('span', { class: 'tl-t', text: U.clock(x.t || 0) }),
          el('span', { class: 'tl-x', text: x.text })
        ]));
      });
      b.appendChild(tl);
    }
    b.appendChild(el('p', { class: 'result-note', text: r.win ? '守护进程已归档本图全部战况，可重开本图继续挑战更高评级。' : '守护进程已归档本图战况，建议调整布防与改道节奏后重试。' }));
    showScreen('result');
  }

  /* ================= HUD ================= */
  function buildHUD() {
    const hud = el('div', { id: 'screen-hud', class: 'screen' });

    /* 顶栏 */
    const top = el('div', { class: 'hud-top' });
    top.appendChild(el('div', { class: 'ht-left' }, [
      el('div', { class: 'integ' }, [
        el('div', { class: 'integ-label' }, [
          el('span', { text: '中枢完整度' }),
          el('b', { id: 'integ-val', text: '100%' })
        ]),
        el('div', { class: 'integ-bar' }, [el('i', { id: 'integ-fill' })])
      ]),
      el('div', { class: 'wave-box' }, [
        el('span', { class: 'wb-k', text: '波次' }),
        el('b', { id: 'wave-val', text: '0 / 14' }),
        el('span', { id: 'wave-note', class: 'wb-note', text: '' })
      ])
    ]));
    top.appendChild(el('div', { class: 'ht-mid' }, [
      el('div', { class: 'legend', id: 'legend' })
    ]));
    top.appendChild(el('div', { class: 'ht-right' }, [
      el('div', { class: 'res' }, [
        el('div', { class: 'res-item compute' }, [el('i', { class: 'ri-ic' }), el('span', { text: '算力' }), el('b', { id: 'res-compute', text: '0' })]),
        el('div', { class: 'res-item intel' }, [el('i', { class: 'ri-ic' }), el('span', { text: '情报' }), el('b', { id: 'res-intel', text: '0' })])
      ]),
      el('div', { class: 'ctrl' }, [
        el('button', { class: 'btn sm', id: 'btn-pause', text: '暂停', onclick: () => UI.app.togglePause() }),
        el('button', { class: 'btn sm speed active', 'data-speed': '1', text: '1×', onclick: () => UI.app.setSpeed(1) }),
        el('button', { class: 'btn sm speed', 'data-speed': '2', text: '2×', onclick: () => UI.app.setSpeed(2) }),
        el('button', { class: 'btn sm speed', 'data-speed': '3', text: '3×', onclick: () => UI.app.setSpeed(3) }),
        el('button', { class: 'btn sm', id: 'btn-sound', text: '♪', onclick: (e) => { const on = UI.app.audio.toggleMute(); e.target.classList.toggle('off', !on); } }),
        el('button', { class: 'btn sm', id: 'btn-view', text: '复位视角', title: '回到默认视角（R）', onclick: () => UI.app.resetView() }),
        el('button', { class: 'btn sm', text: '图鉴', onclick: () => openCodex(UI.app.mapDef.id) }),
        el('button', { class: 'btn sm', text: '菜单', onclick: () => UI.app.toMenu() })
      ])
    ]));
    hud.appendChild(top);

    /* 系统日志 */
    hud.appendChild(el('div', { class: 'log-box' }, [
      el('div', { class: 'lb-title', text: '系统日志' }),
      el('div', { class: 'lb-list', id: 'log-list' })
    ]));

    /* 选中面板 */
    hud.appendChild(el('div', { class: 'sel-panel', id: 'sel-panel' }));

    /* 部署栏 */
    const bar = el('div', { class: 'deploy-bar' });
    bar.appendChild(el('div', { class: 'db-title', text: '待部署' }));
    const cards = el('div', { class: 'db-cards' });
    D.TOWER_ORDER.forEach((id) => {
      const def = D.TOWERS[id];
      const card = el('div', { class: 'tcard', 'data-type': id, title: def.desc }, [
        el('div', { class: 'tc-ic', style: { color: def.color }, html: ICON[id] }),
        el('div', { class: 'tc-txt' }, [
          el('b', { text: def.name }),
          el('span', { class: 'tc-cost', text: def.cost }),
          el('span', { class: 'tc-key', text: def.hotkey })
        ])
      ]);
      card.addEventListener('pointerdown', (e) => startDrag(e, id));
      card.addEventListener('click', () => selectCard(id));
      cards.appendChild(card);
    });
    bar.appendChild(cards);
    const items = el('div', { class: 'db-items' });
    Object.keys(D.ITEMS).forEach((id) => {
      const it = D.ITEMS[id];
      const card = el('div', { class: 'icard', 'data-item': id, title: it.detail }, [
        el('div', { class: 'ic-ic', html: ICON[id] }),
        el('div', { class: 'ic-txt' }, [
          el('b', { text: it.name }),
          el('span', { class: 'ic-cost ' + (it.res === 'intel' ? 'intel' : 'compute'), text: it.cost + (it.res === 'intel' ? ' 情报' : ' 算力') }),
          el('span', { class: 'tc-key', text: it.hotkey })
        ]),
        el('i', { class: 'ic-cd' })
      ]);
      card.addEventListener('click', () => selectItem(id));
      items.appendChild(card);
    });
    bar.appendChild(el('div', { class: 'db-divider' }));
    bar.appendChild(items);
    hud.appendChild(bar);

    /* 提示条 */
    hud.appendChild(el('div', { class: 'toast', id: 'toast' }));
    hud.appendChild(el('div', { class: 'hint-bar', id: 'hint-bar' }));
    hud.appendChild(el('div', { class: 'demo-overlay', id: 'demo-overlay' }));
    UI.root.appendChild(hud);
  }

  /* ---------------- HUD 刷新 ---------------- */
  function refreshHUD() {
    const b = UI.app.battle;
    if (!b) return;
    const iv = document.getElementById('integ-val');
    const ifill = document.getElementById('integ-fill');
    if (iv) iv.textContent = Math.round(b.integrity) + '%';
    if (ifill) {
      ifill.style.width = Math.max(0, b.integrity) + '%';
      ifill.classList.toggle('danger', b.integrity <= 30);
      ifill.classList.toggle('warn', b.integrity <= 60 && b.integrity > 30);
    }
    const wv = document.getElementById('wave-val');
    if (wv) wv.textContent = Math.min((b.waveState === 'ready' || b.waveState === 'intermission') ? b.wave + 1 : b.wave, UI.app.mapDef.waves.length) + ' / ' + UI.app.mapDef.waves.length;
    const rc = document.getElementById('res-compute');
    const ri = document.getElementById('res-intel');
    if (rc) rc.textContent = Math.floor(b.compute);
    if (ri) ri.textContent = Math.floor(b.intel);
    const wn = document.getElementById('wave-note');
    if (wn) {
      const st = b.waveState;
      wn.textContent = st === 'spawning' ? '来袭中' : st === 'fighting' ? '交战中' : st === 'over' ? '已结束' : (st === 'intermission' || st === 'ready') ? Math.ceil(b.waveTimer) + 's 后开波' : '准备';
    }
    // 道具冷却
    U.$$('.icard').forEach((c) => {
      const id = c.getAttribute('data-item');
      const cd = b.itemCd[id] || 0;
      const bar = c.querySelector('.ic-cd');
      if (bar) {
        bar.style.height = (cd / D.ITEMS[id].cd * 100) + '%';
        c.classList.toggle('cooling', cd > 0);
        c.classList.toggle('poor', (D.ITEMS[id].res === 'intel' ? b.intel : b.compute) < D.ITEMS[id].cost);
      }
    });
  }

  function refreshLegend() {
    const lg = document.getElementById('legend');
    if (!lg || !UI.app.battle) return;
    lg.innerHTML = '';
    UI.app.battle.net.entries.forEach((e) => {
      const r = UI.app.battle.routes[e.id];
      const dest = r && r.exit ? r.exit.name : '无出口';
      lg.appendChild(el('div', { class: 'lg-item' }, [
        el('i', { style: { background: e.color } }),
        el('span', { class: 'lg-n', text: e.name }),
        el('span', { class: 'lg-arrow', text: '→' }),
        el('span', { class: 'lg-d', text: dest })
      ]));
    });
  }

  /* ---------------- 提示与日志 ---------------- */
  UI.notice = function (text, level) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = text;
    t.className = 'toast show ' + (level || 'info');
    UI.toastT = 3.2;
    if (level === 'danger' || level === 'warn') UI.log(text, level);
  };
  UI.log = function (text, level) {
    const l = document.getElementById('log-list');
    if (!l) return;
    const bt = UI.app && UI.app.battle ? UI.app.battle.time : 0;
    UI.logs.unshift({ text: text, level: level || 'info', t: Date.now() });
    if (UI.logs.length > 7) UI.logs.length = 7;
    UI.logHist.push({ text: text, level: level || 'info', t: bt });
    if (UI.logHist.length > 80) UI.logHist.shift();
    l.innerHTML = '';
    UI.logs.forEach((x) => {
      l.appendChild(el('div', { class: 'log-item ' + x.level, text: x.text }));
    });
  };
  UI.resetLog = function () {
    UI.logs.length = 0;
    UI.logHist.length = 0;
    const l = document.getElementById('log-list');
    if (l) l.innerHTML = '';
  };

  /* ---------------- 选中面板 ---------------- */
  UI.showSelection = function (sel) {
    UI.selected = sel;
    const p = document.getElementById('sel-panel');
    if (!p) return;
    p.innerHTML = '';
    p.classList.toggle('show', !!sel);
    if (!sel) return;
    const b = UI.app.battle;
    if (sel.kind === 'tower') {
      const t = sel.tower, def = D.TOWERS[t.type];
      p.appendChild(el('div', { class: 'sp-head' }, [
        el('div', { class: 'sp-ic', style: { color: def.color }, html: ICON[t.type] }),
        el('div', {}, [
          el('h3', { text: def.name }),
          el('span', { class: 'sp-lv', text: 'Lv.' + t.level + (t.branch ? ' · ' + def.branches.find((x) => x.id === t.branch).name : '') })
        ])
      ]));
      p.appendChild(el('div', { class: 'sp-row' }, [
        el('span', { text: '生命' }),
        el('b', { text: Math.max(0, Math.round(t.hp)) + ' / ' + t.maxHp })
      ]));
      const states = [];
      if (t.encrypted > 0) states.push('加密 ' + Math.ceil(t.encrypted) + 's');
      if (t.shield > 0) states.push('护盾 ' + Math.round(t.shield));
      if (t.blockedBy && t.blockedBy.length) states.push('阻挡 ' + t.blockedBy.length + ' 个');
      if (t.kind === 'node') {
        const iso = b.isolated[t.vertex.id];
        states.push(iso ? '节点已隔离' : '节点直通');
        if (b.nodeCooldown[t.vertex.id] > 0) states.push('再隔离间隔 ' + Math.ceil(b.nodeCooldown[t.vertex.id]) + 's');
      }
      if (states.length) p.appendChild(el('div', { class: 'sp-tags' }, states.map((s) => el('span', { class: 'tagx', text: s }))));
      p.appendChild(el('p', { class: 'sp-desc', text: def.desc }));
      const acts = el('div', { class: 'sp-actions' });
      if (t.level < 2) {
        if (def.branches && def.branches.length) {
          acts.appendChild(el('div', { class: 'branch-title', text: '选择 2 级分支（消耗 30 情报）' }));
          const bg = el('div', { class: 'branch-grid' });
          def.branches.forEach((br) => {
            bg.appendChild(el('button', {
              class: 'branch' + (t.branch === br.id ? ' sel' : ''), text: br.name,
              onclick: () => { b.chooseBranch(t, br.id); UI.showSelection(UI.selected); }
            }));
          });
          acts.appendChild(bg);
          acts.appendChild(el('p', { class: 'branch-desc', text: (def.branches.find((x) => x.id === t.branch) || { desc: '选择分支后可升级' }).desc }));
        }
        acts.appendChild(el('button', {
          class: 'btn primary sm', text: '升级至 2 级',
          onclick: () => { const r = b.upgrade(t); if (!r.ok) UI.notice(r.reason, 'warn'); UI.showSelection(UI.selected); }
        }));
      } else {
        acts.appendChild(el('span', { class: 'sp-max', text: '已达最高等级' }));
      }
      if (def.skill) {
        acts.appendChild(el('button', {
          class: 'btn sm skill', text: def.skill.name + '（' + def.skill.cost + ' 情报）',
          disabled: t.skillCd > 0,
          onclick: () => { const r = b.useSkill(t); if (!r.ok) UI.notice(r.reason, 'warn'); UI.showSelection(UI.selected); }
        }));
      }
      acts.appendChild(el('button', {
        class: 'btn ghost sm', text: '撤下（返还 ' + Math.floor(def.cost * 0.6) + '）',
        onclick: () => { b.removeTower(t); UI.showSelection(null); }
      }));
      p.appendChild(acts);
    } else if (sel.kind === 'enemy') {
      const e = sel.enemy, def = D.ENEMIES[e.type];
      p.appendChild(el('div', { class: 'sp-head' }, [
        el('div', { class: 'sp-ic danger', style: { color: def.color }, html: ICON[e.type] || '' }),
        el('div', {}, [el('h3', { text: def.name }), el('span', { class: 'sp-lv', text: def.boss ? 'BOSS' : (e.hidden ? '伪装中' : '已显形') })])
      ]));
      p.appendChild(el('div', { class: 'sp-row' }, [el('span', { text: '生命' }), el('b', { text: Math.max(0, Math.round(e.hp)) + ' / ' + e.maxHp })]));
      p.appendChild(el('div', { class: 'sp-row' }, [el('span', { text: '距出口' }), el('b', { text: e.remaining.toFixed(1) + ' m' })]));
      p.appendChild(el('p', { class: 'sp-desc', text: def.desc }));
    } else if (sel.kind === 'node') {
      const v = sel.vertex, b = UI.app.battle;
      p.appendChild(el('div', { class: 'sp-head' }, [
        el('div', { class: 'sp-ic' }, [el('span', { text: '⌘' })]),
        el('div', {}, [el('h3', { text: v.name }), el('span', { class: 'sp-lv', text: v.kind === 'switch' ? '交换节点' : '汇聚器' })])
      ]));
      const st = b.isolated[v.id] ? '已隔离' : '直通';
      p.appendChild(el('div', { class: 'sp-row' }, [el('span', { text: '通行状态' }), el('b', { text: st })]));
      if (b.nodeCooldown[v.id] > 0) p.appendChild(el('div', { class: 'sp-row' }, [el('span', { text: '再隔离间隔' }), el('b', { text: Math.ceil(b.nodeCooldown[v.id]) + ' s' })]));
      p.appendChild(el('p', { class: 'sp-desc', text: '交换节点是链路交汇处的网络设备。在其上部署网闸或防火墙可以隔离该格，使这一格不能通行；解除隔离后恢复直通。' }));
      if (v.kind === 'switch') {
        p.appendChild(el('button', {
          class: 'btn sm', text: '投放松急隔离器（25 情报）',
          onclick: () => {
            const r = b.useItem('isolator', { vertex: v });
            if (!r.ok) UI.notice(r.reason, 'warn');
            UI.showSelection(UI.selected);
          }
        }));
      }
    } else if (sel.kind === 'platform') {
      p.appendChild(el('div', { class: 'sp-head' }, [
        el('div', { class: 'sp-ic' }, [el('span', { text: '▤' })]),
        el('div', {}, [el('h3', { text: sel.name || '设备平台' }), el('span', { class: 'sp-lv', text: '平台' })])
      ]));
      p.appendChild(el('p', { class: 'sp-desc', text: '设备平台用于部署远程与修复支援塔（拦截器 / 沙箱 / 修复进程），与链路有高低区别，敌人不能通行。' }));
    } else if (sel.kind === 'obstacle') {
      p.appendChild(el('div', { class: 'sp-head' }, [
        el('div', { class: 'sp-ic' }, [el('span', { text: '▣' })]),
        el('div', {}, [el('h3', { text: sel.name || '障碍' }), el('span', { class: 'sp-lv', text: '不可通行' })])
      ]));
      p.appendChild(el('p', { class: 'sp-desc', text: '数据设施、公网流与气隙等区域不能通行，也不能部署任何设备。' }));
    } else if (sel.kind === 'entry') {
      p.appendChild(el('div', { class: 'sp-head' }, [
        el('div', { class: 'sp-ic', style: { color: sel.vertex.color } }, [el('span', { text: '⇥' })]),
        el('div', {}, [el('h3', { text: sel.vertex.name }), el('span', { class: 'sp-lv', text: '入口' })])
      ]));
      const r = UI.app.battle.routes[sel.vertex.id];
      p.appendChild(el('div', { class: 'sp-row' }, [el('span', { text: '当前出口' }), el('b', { text: r && r.exit ? r.exit.name : '无' })]));
      p.appendChild(el('div', { class: 'sp-row' }, [el('span', { text: '路线' }), el('b', { text: r ? r.verts.map((v) => UI.app.net.v[v].name).join(' → ') : '-' })]));
    } else if (sel.kind === 'exit') {
      p.appendChild(el('div', { class: 'sp-head' }, [
        el('div', { class: 'sp-ic ok' }, [el('span', { text: '◈' })]),
        el('div', {}, [el('h3', { text: sel.vertex.name }), el('span', { class: 'sp-lv', text: '中枢 / 出口' })])
      ]));
      p.appendChild(el('div', { class: 'sp-row' }, [el('span', { text: '完整度' }), el('b', { text: Math.round(UI.app.battle.integrity) + '%' })]));
      p.appendChild(el('p', { class: 'sp-desc', text: '敌人抵达出口会使中枢完整度下降，归零即失败。' }));
    }
  };

  /* ---------------- 部署交互 ---------------- */
  function startDrag(e, type) {
    if (UI.app.battle.over) return;
    e.preventDefault();
    UI.drag = { type: type, x: e.clientX, y: e.clientY, active: true };
    UI.app.audio.sfx('click');
    document.body.classList.add('dragging');
  }

  function selectCard(type) {
    if (UI.drag && UI.drag.type === type) return;
    UI.drag = { type: type, active: false, x: 0, y: 0 };
    UI.app.audio.sfx('click');
    UI.notice('已选择 ' + D.TOWERS[type].name + '：' + D.TOWERS[type].desc, 'info');
  }

  function selectItem(id) {
    UI.drag = { item: id, active: false };
    UI.app.audio.sfx('click');
    UI.notice(D.ITEMS[id].name + '：' + D.ITEMS[id].detail, 'info');
  }

  function bindGlobal() {
    window.addEventListener('pointermove', (e) => {
      if (UI.drag && UI.drag.active) {
        UI.drag.x = e.clientX; UI.drag.y = e.clientY;
      }
    });
    window.addEventListener('pointerup', (e) => {
      if (UI.drag && UI.drag.active) {
        UI.drag.active = false;
        document.body.classList.remove('dragging');
        const cell = UI.app.pick(e.clientX, e.clientY);
        if (cell) UI.app.tryDeploy(UI.drag.type, cell);
        UI.drag = null;
      }
    });
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (k === 'escape') {
        if (UI.app.aimMode) { UI.app.cancelAim(); return; }
        UI.drag = null; UI.app.clearPreview();
        UI.showSelection(null);
        return;
      }
      if (UI.screen !== 'hud') return;
      const tIdx = ['1', '2', '3', '4', '5', '6'].indexOf(k);
      if (tIdx >= 0) { selectCard(D.TOWER_ORDER[tIdx]); return; }
      if (k === 'q') { selectItem('isolator'); return; }
      if (k === 'w') { selectItem('downgrade'); return; }
      if (k === 'e') { selectItem('restore'); return; }
      if (k === ' ') { e.preventDefault(); UI.app.togglePause(); return; }
      if (k === 'r') { UI.app.resetView(); return; }
      if (k === 'u' && UI.selected && UI.selected.kind === 'tower') {
        const r = UI.app.battle.upgrade(UI.selected.tower);
        if (!r.ok) UI.notice(r.reason, 'warn');
        UI.showSelection(UI.selected);
        return;
      }
      if (k === 'x' && UI.selected && UI.selected.kind === 'tower') {
        UI.app.battle.removeTower(UI.selected.tower); UI.showSelection(null);
      }
    });
  }

  /* ---------------- 每帧更新 ---------------- */
  UI.update = function (dt) {
    if (UI.toastT > 0) {
      UI.toastT -= dt;
      if (UI.toastT <= 0) {
        const t = document.getElementById('toast');
        if (t) t.className = 'toast';
      }
    }
    if (UI.screen !== 'hud') return;
    refreshHUD();
    const b = UI.app.battle;
    if (b && JSON.stringify(b.routes) !== UI._lastRouteKey) {
      UI._lastRouteKey = JSON.stringify(Object.keys(b.routes).map((k) => b.routes[k] ? b.routes[k].verts.join('>') : ''));
      refreshLegend();
      RT.RouteViz.build(b.routes);
    }
    if (UI.selected && UI.selected.kind === 'tower') {
      // 面板中的冷却状态实时刷新
      const t = UI.selected.tower;
      const btn = document.querySelector('#sel-panel .btn.skill');
      if (btn) btn.disabled = t.skillCd > 0;
    }
  };

  UI.setHint = function (text) {
    const h = document.getElementById('hint-bar');
    if (h) { h.textContent = text || ''; h.classList.toggle('show', !!text); }
  };

  UI.refreshLegend = refreshLegend;
  UI.showScreen = showScreen;
  UI.openCodex = openCodex;
  UI.ICON = ICON;
  RT.UI = UI;
})(typeof window !== 'undefined' ? window : globalThis);

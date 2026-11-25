/* =====================================================================
   tour.js — 内置演示录像（约 96 秒）与视频导出接口 window.videoExport
   录像按游戏流程：标题 → 剧情 → 任务柜台 → 编队与养成 → 战斗（含连锁奥义）→ 结算
   ===================================================================== */
(function () {
  'use strict';
  const $ = (s) => G.$(s, G.stage);
  const C = () => G.Cursor;
  const S = () => G.App.scene;

  // 每一步：[时刻(ms), 动作]。各段的起点由已知的转场时长推算
  const T_CONT = 6400;                       // 点击「继续游戏」
  const S0 = T_CONT + 120 + 260 + 640;       // 剧情开始（星形转场覆盖完成）
  const Q0 = S0 + 9127 + 3900 + 520 + 520;   // 任务柜台开始
  const P0 = Q0 + 7550 + 120 + 520;          // 编队开始
  const B0 = P0 + 14000 + 120 + 1250;        // 战斗开始（出击转场）
  const R0 = B0 + 39060;                     // 结算开始
  const TOUR_MS = R0 + 12000;
  function steps() {
    const mv = (sel, dur, o) => () => C().moveTo(typeof sel === 'function' ? sel() : typeof sel === 'string' ? $(sel) : sel, dur, o);
    const click = (sel) => () => { const el = typeof sel === 'function' ? sel() : sel ? $(sel) : null; C().click(el || undefined); };
    const term = () => G.$$('.term', G.stage)[1];
    return [
      /* ---------- 4.1 标题画面 ---------- */
      [0, () => { G.App.swap('title', {}); }],
      [3000, () => { C().x = 1300; C().y = 1000; C().show(); }],
      [3100, mv({ x: 960, y: 866 }, 650)],
      [3850, () => { C().click(null); const sc = S(); if (sc && sc.openMenu) sc.openMenu(); }],
      [4650, mv('.ti[data-act="settings"]', 480)],
      [5250, mv('.ti[data-act="newgame"]', 380)],
      [5800, mv('.ti[data-act="continue"]', 380)],
      [T_CONT, click('.ti[data-act="continue"]')],
      /* ---------- 4.7 剧情画面 ---------- */
      [S0 + 1900, mv('.dlg-text', 480, { ox: 160, oy: 14 })],
      [S0 + 2450, click('.dlg')],
      [S0 + 3500, mv(term, 560)],
      [S0 + 4300, click(term)],
      [S0 + 5100, mv('.dlg-btn.auto', 520)],
      [S0 + 5750, click('.dlg-btn.auto')],
      [S0 + 7600, mv('.dlg-btn.ff', 460)],
      [S0 + 8200, click('.dlg-btn.ff')],
      [S0 + 8900, () => C().hide()],
      [Q0 + 500, () => { C().x = 1500; C().y = 700; C().show(); }],
      /* ---------- 4.2 任务柜台 ---------- */
      [Q0 + 1000, mv('.q-tab[data-tier="hard"]', 600)],
      [Q0 + 1700, click('.q-tab[data-tier="hard"]')],
      [Q0 + 2400, mv('.q-tab[data-tier="extreme"]', 480)],
      [Q0 + 3000, click('.q-tab[data-tier="extreme"]')],
      [Q0 + 3700, mv('.qrow[data-id="x1"]', 600)],
      [Q0 + 4400, click('.qrow[data-id="x1"]')],
      [Q0 + 5100, mv('.qd-boss .weak', 650)],
      [Q0 + 6000, mv('.qd-rew .rw', 520)],
      [Q0 + 6800, mv('.qd-go', 600)],
      [Q0 + 7550, click('.qd-go')],
      /* ---------- 4.3 编队与养成 ---------- */
      [P0 + 900, mv('.pcard[data-i="3"] .pc-crest', 650)],
      [P0 + 1650, click('.pcard[data-i="3"]')],
      [P0 + 2400, mv('.ctile[data-id="baldo"]', 550)],
      [P0 + 3500, click('.ctile[data-id="baldo"]')],
      [P0 + 4300, mv('.pcard[data-i="0"] .pc-btn[data-act="detail"]', 650)],
      [P0 + 5050, click('.pcard[data-i="0"] .pc-btn[data-act="detail"]')],
      [P0 + 5800, mv('.skrow[data-k="3"]', 550)],
      [P0 + 6450, click('.skrow[data-k="3"]')],
      [P0 + 7100, mv('.pkrow[data-v="skyrend"]', 480)],
      [P0 + 8200, click('.pkrow[data-v="skyrend"]')],
      [P0 + 8900, mv('.sgl[data-k="3"]', 550)],
      [P0 + 9550, click('.sgl[data-k="3"]')],
      [P0 + 10200, mv('.pkrow[data-v="0"]', 480)],
      [P0 + 11250, click('.pkrow[data-v="0"]')],
      [P0 + 12000, mv('.detail .keybar .kh[data-act="back"]', 600)],
      [P0 + 12700, click('.detail .keybar .kh[data-act="back"]')],
      [P0 + 13300, mv('.p-sortie', 600)],
      [P0 + 14000, click('.p-sortie')],
      [P0 + 14130, () => C().hide()],
      /* ---------- 4.4 / 4.5 战斗与连锁奥义：自动编排，技能与奥义以模拟按键触发 ---------- */
      /* ---------- 4.6 结算 ---------- */
      [R0 + 10300, () => { C().x = 1560; C().y = 820; C().show(); }],
      [R0 + 10400, mv('.btn[data-act="retry"]', 600)],
      [R0 + 11200, mv('.btn[data-act="home"]', 500)],
    ];
  }

  const Tour = (G.Tour = {
    TOUR_MS,
    marks: { S0, Q0, P0, B0, R0 },
    owner: { name: 'tour' },
    resetWorld() {
      G.Trans.tok = null;
      G.clearTimers();
      G.clearCounters();
      G.busy = false;
      G.UI.setHover(null);
      G.$('#overlay').innerHTML = '';
      G.resetState();
      G.Cursor.reset();
    },
    schedule(t0) {
      for (const [t, fn] of steps()) {
        G.at(t0 + t, () => { try { fn(); } catch (e) { console.warn('tour step', t, e); } }, this.owner);
      }
    },
    playLive() {
      if (G.exporting) return;
      this.stopLive(true);
      this.resetWorld();
      G.touring = true;
      document.documentElement.classList.add('touring');
      const t0 = G.time;
      this.schedule(t0);
      G.at(t0 + TOUR_MS, () => this.stopLive(), this.owner);
      this.liveT0 = t0;
    },
    stopLive(silent) {
      if (!G.touring) return;
      G.cancelOwner(this.owner);
      G.touring = false;
      document.documentElement.classList.remove('touring');
      G.Cursor.hide();
    },
  });

  /* ---------------- 视频导出接口 ---------------- */
  let fps = 60;
  let lastI = -1;
  function nextPaint() {
    return new Promise((res) => {
      let done = false;
      const fin = () => { if (!done) { done = true; res(); } };
      requestAnimationFrame(() => requestAnimationFrame(fin));
      setTimeout(fin, 120);
    });
  }
  function beginInternal() {
    G.exporting = true;
    G.touring = false;
    document.documentElement.classList.add('exporting');
    document.documentElement.classList.remove('touring');
    G.resetAnimClock();
    Tour.resetWorld();
    G.time = 0;
    Tour.schedule(0);
    G.advance(0);
    lastI = 0;
  }
  window.videoExport = {
    runs: ['tour'],
    async begin(runId, opts) {
      if (runId !== 'tour') throw new Error('unknown run: ' + runId);
      fps = (opts && opts.fps) || 60;
      if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (e) {} }
      beginInternal();
      await nextPaint();
      return { frames: Math.round((TOUR_MS / 1000) * fps) };
    },
    async frame(i) {
      if (!G.exporting) beginInternal();
      const t = (i * 1000) / fps;
      if (t < G.time - 0.001) {
        // 倒退：重新开始并快进
        beginInternal();
        for (let x = 100; x < t; x += 100) G.advance(x);
      }
      G.advance(t);
      lastI = i;
      await nextPaint();
    },
    end() {
      G.cancelOwner(Tour.owner);
      G.exporting = false;
      document.documentElement.classList.remove('exporting');
      G.Cursor.hide();
      G.releaseAnims();
      G.resetRealClock();
      G.busy = false;
    },
  };
})();

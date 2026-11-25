/* 三枚 Logo 的背景：全部由代码画，时间 t（秒）决定画面——同一个 t 永远画出同一帧（导出用）。 */
(function () {
  function rng(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const cache = {};
  function pts(key, n, seed) {
    const k = key + ':' + n + ':' + seed;
    if (!cache[k]) {
      const r = rng(seed), a = [];
      for (let i = 0; i < n; i++) a.push([r(), r(), r(), r(), r()]);
      cache[k] = a;
    }
    return cache[k];
  }

  // ------------------------------------------------------------ 终末地：工业图纸、等高线、警示条
  function ef(ctx, W, H, t) {
    const u = H / 1080;
    let g = ctx.createRadialGradient(W * 0.5, H * 0.42, 0, W * 0.5, H * 0.45, Math.max(W, H) * 0.75);
    g.addColorStop(0, '#26231b'); g.addColorStop(0.55, '#151410'); g.addColorStop(1, '#0a0a08');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // 等轴测网格（30° / 150°）
    ctx.save();
    ctx.strokeStyle = 'rgba(255,240,200,0.045)'; ctx.lineWidth = Math.max(1, u);
    const sp = 54 * u, k = Math.tan(Math.PI / 6);
    const off = (t * 6 * u) % sp;
    ctx.beginPath();
    for (let x = -H / k - sp; x < W + sp; x += sp) {
      ctx.moveTo(x + off, H); ctx.lineTo(x + off + H / k, 0);
      ctx.moveTo(x - off, 0); ctx.lineTo(x - off + H / k, H);
    }
    ctx.stroke();
    ctx.restore();
    // 等高线（地形）：几圈缓慢漂移的闭合曲线
    ctx.save();
    const cx = W * 0.72, cy = H * 0.62;
    for (let i = 0; i < 14; i++) {
      const R = (90 + i * 46) * u;
      ctx.beginPath();
      for (let a = 0; a <= 120; a++) {
        const th = a / 120 * Math.PI * 2;
        const rr = R * (1 + 0.10 * Math.sin(3 * th + i * 0.7 + t * 0.12) + 0.06 * Math.sin(5 * th - i * 0.4 - t * 0.08));
        const x = cx + Math.cos(th) * rr * 1.5, y = cy + Math.sin(th) * rr * 0.62;
        a ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.strokeStyle = i % 5 === 0 ? 'rgba(255,194,14,0.10)' : 'rgba(255,240,210,0.045)';
      ctx.lineWidth = (i % 5 === 0 ? 1.6 : 1) * u;
      ctx.stroke();
    }
    ctx.restore();
    // 扫描线
    const sy = ((t * 0.09) % 1.2 - 0.1) * H;
    g = ctx.createLinearGradient(0, sy - 120 * u, 0, sy);
    g.addColorStop(0, 'rgba(255,194,14,0)'); g.addColorStop(1, 'rgba(255,194,14,0.07)');
    ctx.fillStyle = g; ctx.fillRect(0, sy - 120 * u, W, 120 * u);
    ctx.fillStyle = 'rgba(255,194,14,0.25)'; ctx.fillRect(0, sy, W, Math.max(1, 1.2 * u));
    // 尘
    const P = pts('ef', 120, 7);
    for (const p of P) {
      const x = ((p[0] + t * 0.004 * (0.5 + p[2])) % 1) * W;
      const y = ((p[1] - t * 0.006 * (0.3 + p[3]) + 10) % 1) * H;
      ctx.fillStyle = `rgba(255,236,190,${0.08 + 0.18 * p[4]})`;
      ctx.fillRect(x, y, (1 + 2 * p[2]) * u, (1 + 2 * p[2]) * u);
    }
    // 警示条（底边）
    const hb = 14 * u, y0 = H - hb;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, y0, W, hb); ctx.clip();
    ctx.fillStyle = '#16140f'; ctx.fillRect(0, y0, W, hb);
    ctx.fillStyle = 'rgba(255,194,14,0.85)';
    const st = 30 * u, mv = (t * 24 * u) % (st * 2);
    for (let x = -st * 2 + mv; x < W + st * 2; x += st * 2) {
      ctx.beginPath(); ctx.moveTo(x, y0 + hb); ctx.lineTo(x + st, y0 + hb); ctx.lineTo(x + st + hb * k * 1.7, y0); ctx.lineTo(x + hb * k * 1.7, y0); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    // 角上的标注
    ctx.fillStyle = 'rgba(255,236,190,0.34)';
    ctx.font = `${13 * u}px Bahnschrift, "Segoe UI", sans-serif`;
    ctx.textBaseline = 'top';
    ctx.fillText('TALOS-II  //  SECTOR 04  //  AIC GRID', 34 * u, 82 * u);
    ctx.textAlign = 'right';
    ctx.fillText(`N ${(32.4 + Math.sin(t * 0.2) * 0.01).toFixed(3)}  E ${(118.06 + t * 0.0004).toFixed(4)}`, W - 34 * u, 82 * u);
    ctx.textAlign = 'left';
    // 暗角
    g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }

  // ------------------------------------------------------------ 星穹铁道：星空、星云、透视铁轨
  function sr(ctx, W, H, t) {
    const u = H / 1080;
    let g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#070615'); g.addColorStop(0.55, '#120d33'); g.addColorStop(1, '#1d1448');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // 星云
    const N = [[0.22, 0.30, 0.42, '#3b2c86', 0.30], [0.78, 0.22, 0.36, '#1f3d86', 0.24], [0.62, 0.78, 0.5, '#5a2a7a', 0.20], [0.12, 0.85, 0.3, '#2a2470', 0.22]];
    for (const [x, y, r, c, a] of N) {
      const xx = (x + 0.02 * Math.sin(t * 0.05 + x * 9)) * W, yy = (y + 0.02 * Math.cos(t * 0.04 + y * 7)) * H;
      g = ctx.createRadialGradient(xx, yy, 0, xx, yy, r * Math.max(W, H));
      g.addColorStop(0, hexA(c, a)); g.addColorStop(1, hexA(c, 0));
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    // 星
    const P = pts('sr', 520, 11);
    for (const p of P) {
      const x = p[0] * W, y = p[1] * H;
      const tw = 0.55 + 0.45 * Math.sin(t * (0.6 + p[2] * 2.2) + p[3] * 40);
      const s = (0.5 + p[4] * p[4] * 2.4) * u;
      ctx.fillStyle = `rgba(236,232,255,${(0.25 + 0.75 * p[4]) * tw})`;
      ctx.beginPath(); ctx.arc(x, y, s, 0, Math.PI * 2); ctx.fill();
      if (p[4] > 0.93) {
        ctx.strokeStyle = `rgba(236,232,255,${0.5 * tw})`; ctx.lineWidth = 0.8 * u;
        ctx.beginPath(); ctx.moveTo(x - 7 * s, y); ctx.lineTo(x + 7 * s, y); ctx.moveTo(x, y - 7 * s); ctx.lineTo(x, y + 7 * s); ctx.stroke();
      }
    }
    // 透视铁轨：从左下驶向右侧的消失点，轨枕向观者移动
    const vx = W * 0.86, vy = H * 0.60;
    const L = [[-0.05 * W, H * 1.02], [0.34 * W, H * 1.02]];
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = 'rgba(233,195,110,0.55)'; ctx.lineWidth = 2.2 * u;
    for (const [x0, y0] of L) { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(vx, vy); ctx.stroke(); }
    for (let i = 0; i < 26; i++) {
      let f = ((i / 26) + (t * 0.06) % (1 / 26) * 26 / 26) % 1;
      f = ((i + (t * 1.4) % 1) / 26);
      const z = Math.pow(f, 2.2);
      const ax = L[0][0] + (vx - L[0][0]) * (1 - z), ay = L[0][1] + (vy - L[0][1]) * (1 - z);
      const bx = L[1][0] + (vx - L[1][0]) * (1 - z), by = L[1][1] + (vy - L[1][1]) * (1 - z);
      ctx.strokeStyle = `rgba(233,195,110,${0.12 + 0.35 * z})`; ctx.lineWidth = (0.6 + 5 * z) * u;
      ctx.beginPath(); ctx.moveTo(ax - (bx - ax) * 0.12, ay - (by - ay) * 0.12); ctx.lineTo(bx + (bx - ax) * 0.12, by + (by - ay) * 0.12); ctx.stroke();
    }
    ctx.restore();
    // 流星
    const cyc = 7.0, ph = (t % cyc) / cyc, k2 = Math.floor(t / cyc);
    const r2 = rng(100 + k2);
    if (ph < 0.18) {
      const sx = (0.2 + 0.6 * r2()) * W, sy = (0.05 + 0.25 * r2()) * H, q = ph / 0.18;
      const ex = sx + 380 * u * q, ey = sy + 160 * u * q;
      g = ctx.createLinearGradient(sx, sy, ex, ey);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, `rgba(255,248,230,${0.8 * (1 - q)})`);
      ctx.strokeStyle = g; ctx.lineWidth = 1.6 * u; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
    }
    g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.4, W / 2, H / 2, Math.max(W, H) * 0.8);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }

  // ------------------------------------------------------------ 鸣潮：深海、倒悬之海的浪线、同心声波
  function ww(ctx, W, H, t) {
    const u = H / 1080;
    let g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#041012'); g.addColorStop(0.5, '#071a1d'); g.addColorStop(1, '#03090a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // 倒悬之海：上方一层层倒着的浪线
    ctx.save();
    for (let i = 0; i < 9; i++) {
      const y0 = H * (0.03 + i * 0.028);
      ctx.beginPath();
      for (let x = 0; x <= W; x += 8 * u) {
        const y = y0 + Math.sin(x / (W * 0.09) + t * 0.35 + i * 0.9) * 9 * u * (1 + i * 0.12) + Math.sin(x / (W * 0.031) - t * 0.6 + i) * 3 * u;
        x ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.strokeStyle = `rgba(125,243,230,${0.16 - i * 0.014})`; ctx.lineWidth = (1.6 - i * 0.1) * u; ctx.stroke();
    }
    g = ctx.createLinearGradient(0, 0, 0, H * 0.32);
    g.addColorStop(0, 'rgba(18,58,61,0.55)'); g.addColorStop(1, 'rgba(18,58,61,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H * 0.32);
    ctx.restore();
    // 同心声波：从画面中心（音叉处）一圈圈扩散
    const cx = W * 0.5, cy = H * 0.5, Rm = Math.hypot(W, H) * 0.6;
    for (let i = 0; i < 9; i++) {
      const f = ((t * 0.07) + i / 9) % 1;
      const R = 60 * u + f * Rm;
      const a = 0.22 * Math.pow(1 - f, 1.6);
      ctx.strokeStyle = `rgba(125,243,230,${a})`; ctx.lineWidth = (2.2 - 1.4 * f) * u;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    }
    // 漂浮的声骸微粒（上升）
    const P = pts('ww', 160, 23);
    for (const p of P) {
      const x = (p[0] + 0.01 * Math.sin(t * 0.3 + p[3] * 20)) * W;
      const y = ((p[1] - t * 0.012 * (0.3 + p[2]) + 10) % 1) * H;
      const s = (0.6 + 2.2 * p[4]) * u;
      ctx.fillStyle = `rgba(190,255,248,${0.08 + 0.3 * p[4] * (0.6 + 0.4 * Math.sin(t + p[2] * 9))})`;
      ctx.beginPath(); ctx.arc(x, y, s, 0, Math.PI * 2); ctx.fill();
    }
    // 下方的水面反光
    g = ctx.createLinearGradient(0, H * 0.8, 0, H);
    g.addColorStop(0, 'rgba(125,243,230,0)'); g.addColorStop(1, 'rgba(125,243,230,0.06)');
    ctx.fillStyle = g; ctx.fillRect(0, H * 0.8, W, H * 0.2);
    g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.6)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }

  function hexA(hex, a) {
    const h = hex.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
  }

  // 首页用的中性背景
  function home(ctx, W, H, t) {
    const u = H / 1080;
    let g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#0d0e12'); g.addColorStop(1, '#08090b');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const cols = ['rgba(255,194,14,', 'rgba(108,92,255,', 'rgba(125,243,230,'];
    for (let i = 0; i < 3; i++) {
      const x = W * (0.2 + 0.3 * i), y = H * 0.62;
      g = ctx.createRadialGradient(x, y, 0, x, y, W * 0.32);
      g.addColorStop(0, cols[i] + '0.10)'); g.addColorStop(1, cols[i] + '0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.035)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < W; x += 48 * u) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = 0; y < H; y += 48 * u) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();
  }

  window.BG = {
    draw(key, ctx, W, H, t) {
      // 画布还没排版（宽或高为 0）时不画：各个循环的步长都按高度算，高度为 0 会死循环
      if (!(W >= 8 && H >= 8)) return;
      ({ ef, sr, ww, home })[key](ctx, W, H, t);
    }
  };
})();

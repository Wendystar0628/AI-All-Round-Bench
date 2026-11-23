/* 网络安全攻防战 — 对局模拟：波次、敌人、Boss */
(function (root) {
  'use strict';
  const TD = root.TD, DT = TD.TICK, R = TD.RULES;

  Object.assign(TD.Sim.prototype, {
    // ---------- 波次 ----------
    waveHpMul(w) { return (1 + [0.17, 0.085, 0.085][this.def.index - 1] * w) * [1, 1.0, 1.04][this.def.index - 1]; },
    forecast(w) {
      const wd = this.def.waves[w]; if (!wd) return null;
      const out = {}; for (const e of this.grid.entries) out[e.id] = [];
      for (const g of wd.g) { const a = out[g[0]]; const f = a.find(o => o.type === g[1]); if (f) f.n += g[2]; else a.push({ type: g[1], n: g[2] }); }
      return { by: out, boss: !!wd.boss, surge: !!wd.surge, intro: wd.intro || null };
    },
    startWave(early) {
      if (this.phase !== 'prep' || this.over) return false;
      const wd = this.def.waves[this.wave]; if (!wd) return false;
      if (early && this.prepT > 0.5) { const b = Math.floor(this.prepT * 2.5); this.compute += b; this.emit('earlyBonus', { n: b }); }
      this.phase = 'active'; this.waveT = 0; this.spawnQ = [];
      for (const g of wd.g) for (let k = 0; k < g[2]; k++) this.spawnQ.push({ t: g[4] + k * g[3], type: g[1], entry: g[0] });
      this.spawnQ.sort((a, b) => a.t - b.t);
      this.emit('wave', { n: this.wave + 1, def: wd });
      return true;
    },
    updateWave() {
      if (this.phase === 'prep') { if (!this.noAutoWave) { this.prepT -= DT; if (this.prepT <= 0) this.startWave(false); } }
      else if (this.phase === 'active') {
        this.waveT += DT;
        while (this.spawnQ.length && this.spawnQ[0].t <= this.waveT) { const s = this.spawnQ.shift(); this.spawnEnemy(s.type, s.entry, {}); }
      }
    },
    checkWaveEnd() {
      if (this.phase !== 'active' || this.spawnQ.length || this.enemies.length || this.over) return;
      const bonus = 30 + 8 * this.wave;
      this.compute += bonus; this.gainIntel(R.waveIntel, 'wave');
      this.emit('waveClear', { n: this.wave + 1, bonus });
      this.wave++;
      if (this.wave >= this.totalWaves) { this.over = 'win'; this.phase = 'done'; this.emit('over', { result: 'win' }); }
      else { this.phase = 'prep'; this.prepT = R.prep; }
    },

    // ---------- 敌人生成 ----------
    spawnEnemy(type, entryId, o) {
      const d = TD.ENEMIES[type], g = this.grid, en = g.entries.find(e => e.id === entryId) || g.entries[0];
      const mul = o.hpMul != null ? o.hpMul : this.waveHpMul(this.wave);
      const hp = Math.round(d.hp * (d.boss ? [1, 1.06, 1.12][this.def.index - 1] : mul) * (o.copy ? 0.6 : 1) * (o.hpScale || 1));
      const e = {
        id: this.nid++, type, d, entry: en.id, x: o.x != null ? o.x : en.x, y: o.y != null ? o.y : en.y, cell: o.cell != null ? o.cell : en.i, to: o.to != null ? o.to : -1,
        hp, maxHp: hp, hpMul: mul, dmgMul: 1 + 0.035 * this.wave, shield: 0, shieldMax: 0, speedMul: 1, slowT: 0, slowF: 1, rootT: 0, stunT: o.stun || 0, markT: 0,
        hidden: !!d.hidden, revealT: 0, blockedBy: 0, passed: 0, atkCd: this.rng.range(0.3, (d.atkRate || 1)), abCd: 0, abCd2: 0, atkT: -99, hitT: -99, turnT: -99,
        fly: !!d.fly, detour: null, replicated: false, isCopy: !!o.copy, dead: false, born: this.time, dirX: 0, dirY: 1,
        lat: this.rng.range(-0.2, 0.2), remain: 99, phase: 1, boss: !!d.boss, state: 'move', seed: this.rng()
      };
      if (o.dir) { e.dirX = o.dir[0]; e.dirY = o.dir[1]; }
      else { const nx = this.field.next[en.i]; if (nx >= 0) { e.dirX = g.cells[nx].x - en.x; e.dirY = g.cells[nx].y - en.y; } }
      if (e.fly) {
        let best = null, bd = Infinity;
        for (const ex of g.exits) { const dd = Math.hypot(ex.x - e.x, ex.y - e.y); if (dd < bd) { bd = dd; best = ex; } }
        e.tx = best.x; e.ty = best.y; e.exitId = best.id; e.dirX = (best.x - e.x) / bd; e.dirY = (best.y - e.y) / bd; e.remain = bd;
      }
      if (d.shield) e.abCd = 1.5;
      if (type === 'boss1') { e.abCd = 7; }
      if (type === 'boss2') { e.abCd = 6; }
      if (type === 'boss3') { e.speedMul = 1.15; e.abCd2 = 3; }
      this.enemies.push(e); this.eById.set(e.id, e);
      this.emit('spawn', { enemy: e, copy: !!o.copy, from: o.from || null });
      if (!this.seen[type]) { this.seen[type] = true; this.emit('newEnemy', { type, enemy: e }); }
      if (d.boss) this.emit('bossSpawn', { enemy: e });
      return e;
    },

    // ---------- 状态 / 伤害（敌人）----------
    reveal(e, why) {
      if (e.type === 'boss3') { if (e.phase === 1 && e.revealT <= 0) this.emit('reveal', { enemy: e, why }); e.revealT = 0.6; return; }
      if (e.hidden) { e.hidden = false; e.revealAt = this.time; this.emit('reveal', { enemy: e, why }); }
    },
    slowEnemy(e, f, dur) {
      const m = 1 - f * (e.boss ? 0.5 : 1);
      if (e.slowT <= 0 || m <= e.slowF) e.slowF = m;
      e.slowT = Math.max(e.slowT, dur);
    },
    damageEnemy(e, dmg, src, o) {
      if (e.dead) return;
      if (e.markT > 0) dmg *= 1.4;
      if (e.type === 'boss3' && e.phase >= 2) dmg *= 1 - e.d.armor;
      if (e.shield > 0) {
        const sm = o.shieldMul || 1, sd = dmg * sm;
        if (sd >= e.shield) { dmg -= e.shield / sm; e.shield = 0; this.emit('eShieldBreak', { enemy: e }); }
        else { e.shield -= sd; dmg = 0; e.shieldHitT = this.time; }
      }
      e.hp -= dmg; e.hitT = this.time;
      if (src && src.id) e.lastSrc = src.id;
      if (e.hp <= 0) this.killEnemy(e, src, o);
    },
    killEnemy(e, src, o) {
      if (e.dead) return;
      e.dead = true; this._dirtyDead = true; this.eById.delete(e.id);
      const d = e.d, rw = Math.round(d.reward * (e.isCopy ? 0.5 : 1));
      this.compute += rw; this.stats.kills[e.type] = (this.stats.kills[e.type] || 0) + 1; this.stats.killN++;
      this.emit('enemyDie', { enemy: e, reward: rw, src });
      if (d.intel) this.gainIntel(d.intel, 'kill', e.x, e.y);
      if (e.type === 'trojan' && e.hidden) {
        const ids = [];
        for (const t of this.towers.slice()) if (Math.hypot(t.x - e.x, t.y - e.y) <= d.payloadR) { ids.push(t.id); this.damageTower(t, d.payload * e.dmgMul, e, 'payload'); }
        this.emit('payload', { x: e.x, y: e.y, r: d.payloadR, ids });
      }
      if (d.boss) this.emit('bossDie', { enemy: e });
    },
    leak(e) {
      e.dead = true; e.leaked = true; this._dirtyDead = true; this.eById.delete(e.id);
      const c = this.grid.cells[e.cell];
      const dmg = Math.min(this.integrity, e.d.leak);
      this.integrity -= dmg; this.stats.leaks++;
      this.emit('leak', { enemy: e, exit: e.fly ? e.exitId : (c && c.id), dmg });
      if (this.integrity <= 0 && !this.over) { this.over = 'lose'; this.phase = 'done'; this.emit('over', { result: 'lose' }); }
    },

    // ---------- 敌人每帧 ----------
    updateEnemy(e) {
      const d = e.d, g = this.grid;
      if (e.slowT > 0) e.slowT -= DT;
      if (e.rootT > 0) e.rootT -= DT;
      if (e.stunT > 0) e.stunT -= DT;
      if (e.markT > 0) e.markT -= DT;
      if (e.revealT > 0) e.revealT -= DT;
      const frozen = e.rootT > 0 || e.stunT > 0;
      if (e.fly) { if (!frozen) this.moveFly(e); return; }
      const ci = Math.round(e.y) * this.W + Math.round(e.x);
      const legacyHere = this.isLegacy(ci);
      if (legacyHere && (e.hidden || e.type === 'boss3')) this.reveal(e, 'legacy');
      if (e.blockedBy) { const t = this.tById.get(e.blockedBy); if (!t) e.blockedBy = 0; else if (e.hidden || e.type === 'boss3') this.reveal(e, 'block'); }
      if (d.shield && !frozen) {
        e.abCd -= DT;
        if (e.abCd <= 0) {
          const ids = [], amt = Math.round(d.shield * e.hpMul);
          for (const o of this.enemies) { if (o === e || o.dead || o.boss || o.type === 'packer') continue; if (Math.hypot(o.x - e.x, o.y - e.y) <= d.shieldR && o.shield < amt * 0.5) { o.shield = amt; o.shieldMax = amt; ids.push(o.id); } }
          if (ids.length) { e.abCd = d.shieldRate; e.atkT = this.time; this.emit('packShield', { enemy: e, ids }); } else e.abCd = 0.4;
        }
      }
      if (d.ranged && !frozen) {
        e.atkCd -= DT;
        if (e.atkCd <= 0) {
          const t = this.pickRansomTarget(e);
          if (t) {
            e.atkCd = d.atkRate; e.atkT = this.time; e.aimX = t.x; e.aimY = t.y;
            this.shots.push({ id: this.nid++, kind: 'ransom', x: e.x, y: e.y, sx: e.x, sy: e.y, tx: t.x, ty: t.y, target: t.id, tk: 't', speed: 7, dmg: d.ranged * e.dmgMul, enc: d.encrypt, src: e.id, born: this.time, plat: !t.blocker && !t.onNode });
            this.emit('ransomShot', { enemy: e, tower: t });
          } else e.atkCd = 0.25;
        }
      }
      if (e.boss) { this.updateBoss(e, frozen); if (e.dead) return; }
      e.state = 'move';
      const engaged = e.blockedBy || (e.detour && e.detour.kind === 'smash' && e.to < 0 && !e.detour.path.length);
      e.engT = engaged ? (e.engT || 0) + DT : 0;
      const rage = 1 + Math.max(0, (e.engT || 0) - 8) * 0.15;      // 久攻不下逐渐狂暴，避免僵局
      if (e.blockedBy) {
        e.state = 'fight';
        const t = this.tById.get(e.blockedBy);
        if (t) { const dx = t.x - e.x, dy = t.y - e.y, dd = Math.hypot(dx, dy) || 1; e.dirX = dx / dd; e.dirY = dy / dd; }
        if (!frozen && t && (d.melee || d.smash)) {
          e.atkCd -= DT;
          if (e.atkCd <= 0) {
            const sm = !!(d.smash && t.onNode);
            e.atkCd = sm ? d.smashRate : d.atkRate; e.atkT = this.time;
            this.emit('melee', { enemy: e, tower: t, smash: sm });
            this.damageTower(t, (sm ? d.smash : d.melee) * e.dmgMul * rage, e, sm ? 'smash' : 'melee');
          }
        }
      } else if (e.detour && e.detour.kind === 'smash' && e.to < 0 && !e.detour.path.length) {
        const nd = e.detour.node, ns = this.nodes[nd];
        if (!this.nodeIsolated(nd)) e.detour = null;
        else {
          e.state = 'smash';
          const nc = g.cells[nd]; e.dirX = nc.x - e.x; e.dirY = nc.y - e.y;
          if (!frozen && !this.tryBlock(e)) {
            e.atkCd -= DT;
            if (e.atkCd <= 0) {
              e.atkCd = d.smashRate; e.atkT = this.time;
              this.emit('smash', { enemy: e, ci: nd });
              if (ns.tower) this.damageTower(this.tById.get(ns.tower), d.smash * e.dmgMul * rage, e, 'smash');
              else { ns.iso.hp -= d.smash * e.dmgMul * rage; this.emit('isoHit', { ci: nd, sx: e.x, sy: e.y }); if (ns.iso.hp <= 0) this.breakIsolator(nd, 'smash'); }
            }
          }
        }
      }
      if (frozen) e.state = 'frozen';
      else if (!e.blockedBy && e.state !== 'smash') this.moveEnemy(e, legacyHere);
      if (e.dead) return;
      const f = this.field;
      if (e.to >= 0 && isFinite(f.dist[e.to])) { const tc = g.cells[e.to]; e.remain = f.dist[e.to] + Math.hypot(tc.x - e.x, tc.y - e.y); }
      else e.remain = isFinite(f.dist[e.cell]) ? f.dist[e.cell] : 60;
    },
    pickRansomTarget(e) {
      let best = null, bs = Infinity; const rg = e.d.range;
      for (const t of this.towers) {
        const dd = Math.hypot(t.x - e.x, t.y - e.y); if (dd > rg) continue;
        const sc = dd - (t.type === 'honeypot' ? 100 : 0);
        if (sc < bs) { bs = sc; best = t; }
      }
      return best;
    },
    moveFly(e) {
      const sp = e.d.speed * (e.slowT > 0 ? e.slowF : 1) * DT;
      const dx = e.tx - e.x, dy = e.ty - e.y, dd = Math.hypot(dx, dy);
      if (dd <= sp) { e.x = e.tx; e.y = e.ty; this.leak(e); return; }
      e.x += dx / dd * sp; e.y += dy / dd * sp; e.remain = dd;
    },
    chooseNext(e) {
      if (e.detour) {
        const p = e.detour.path;
        if (p.length) { const n = p[0]; if (this._pass(n)) { p.shift(); return n; } e.detour = null; }
        else if (e.detour.kind === 'smash') return -2;
        else e.detour = null;
      }
      if (this._pass(e.cell)) return this.field.next[e.cell];
      return TD.bestNeighbor(this.grid, this.field, this._pass, this._cost, e.cell);
    },
    moveEnemy(e, legacyHere) {
      const g = this.grid;
      let sp = e.d.speed * e.speedMul; if (legacyHere) sp *= TD.LEGACY_SPEED; if (e.slowT > 0) sp *= e.slowF;
      let rem = sp * DT, guard = 0;
      while (rem > 1e-7 && guard++ < 4) {
        if (e.to < 0) {
          const nx = this.chooseNext(e);
          if (nx < 0) { if (nx === -1 && g.cells[e.cell].type === 'exit') this.leak(e); return; }
          e.to = nx;
        }
        const tc = g.cells[e.to], dx = tc.x - e.x, dy = tc.y - e.y, dd = Math.hypot(dx, dy);
        if (dd > 1e-6) { e.dirX = dx / dd; e.dirY = dy / dd; }
        if (this.tryBlock(e)) return;
        if (dd <= rem) { e.x = tc.x; e.y = tc.y; e.cell = e.to; e.to = -1; rem -= dd; this.onArrive(e); if (e.dead || e.blockedBy) return; }
        else { e.x += dx / dd * rem; e.y += dy / dd * rem; rem = 0; }
      }
    },
    tryBlock(e) {
      const sz = e.d.size; if (!sz) return false;
      const W = this.W, cx = Math.round(e.x), cy = Math.round(e.y), ci = cy * W + cx;
      for (let k = 0; k < 2; k++) {
        const cand = k === 0 ? e.to : ci; if (cand < 0 || (k === 1 && cand === e.to)) continue;
        const tid = this.towerAt[cand]; if (!tid || tid === e.passed) continue;
        const t = this.tById.get(tid); if (!t.blocker || t.onNode) continue;
        const dist = Math.hypot(t.x - e.x, t.y - e.y), thr = 0.5 + 0.17 * t.blocked.length;
        if (dist <= thr) {
          if (t.load + sz <= t.S.block) { this._block(e, t); return true; }
          if (dist <= 0.5) e.passed = tid;
        }
      }
      const c = this.grid.cells[ci];
      for (let dd = 0; dd < 4; dd++) {
        const v = c.nb[dd]; if (v < 0) continue;
        const tid = this.towerAt[v]; if (!tid || tid === e.passed) continue;
        const t = this.tById.get(tid); if (t.type !== 'firewall' || !t.onNode) continue;
        if (Math.hypot(t.x - e.x, t.y - e.y) <= 1.02) {
          if (t.load + sz <= t.S.block) { this._block(e, t); return true; }
          e.passed = tid;
        }
      }
      return false;
    },
    _block(e, t) {
      e.blockedBy = t.id; t.blocked.push(e.id); t.load += e.d.size; e.atkCd = Math.min(e.atkCd, 0.5);
      if (e.detour && e.detour.kind === 'lure') e.detour = null;
      if (e.hidden || e.type === 'boss3') this.reveal(e, 'block');
      this.emit('block', { enemy: e, tower: t });
    },
    onArrive(e) {
      const c = this.grid.cells[e.cell];
      if (c.type === 'exit') { this.leak(e); return; }
      if (c.type === 'node' && e.type === 'worm' && !e.isCopy && !e.replicated && !this.nodeIsolated(c.i)) {
        e.replicated = true;
        const cp = this.spawnEnemy('worm', e.entry, { x: e.x, y: e.y, cell: e.cell, copy: true, hpMul: e.hpMul, stun: 0.45, dir: [e.dirX, e.dirY], from: e.id });
        cp.replicated = true;
        this.emit('replicate', { enemy: e, copy: cp, ci: c.i });
      }
      if (e.type === 'flood' && !e.detour) this.floodSeek(e);
    },
    floodSeek(e) {
      let any = false; for (const k in this.nodes) { const ns = this.nodes[k]; if (ns.tower || ns.iso) { any = true; break; } }
      if (!any) return;
      const g = this.grid;
      const sideOf = i => { const c = g.cells[i]; for (let d = 0; d < 4; d++) { const v = c.nb[d]; if (v >= 0 && this.nodeIsolated(v)) return v; } return -1; };
      const path = TD.bfsPath(g, this._pass, e.cell, i => sideOf(i) >= 0, e.d.seek);
      if (!path) return;
      const side = path.length ? path[path.length - 1] : e.cell;
      e.detour = { kind: 'smash', node: sideOf(side), path };
      this.emit('floodSeek', { enemy: e, ci: e.detour.node });
    },

    // ---------- Boss ----------
    addWarning(w) { w.id = this.nid++; w.t = 0; this.warnings.push(w); this.emit('bossWarn', { warn: w, enemy: this.eById.get(w.boss) }); },
    updateBoss(e, frozen) {
      const d = e.d, hf = e.hp / e.maxHp;
      const busy = this.warnings.some(w => w.boss === e.id);
      if (e.type === 'boss1') {
        if (e.phase === 1 && hf <= 0.5) { e.phase = 2; e.speedMul = 1.15; e.abCd2 = 1.5; e.phaseT = this.time; this.emit('bossPhase', { enemy: e, phase: 2, name: '傀儡解离' }); }
        e.abCd -= DT;
        if (e.abCd <= 0 && !frozen && !busy) {
          const tg = this.pickSurgeTarget(e);
          if (tg) { e.abCd = d.surgeCd; e.castT = this.time; this.addWarning({ kind: 'surge', boss: e.id, cells: [tg.ci], dur: d.surgeWarn, node: tg.node, tower: tg.tower }); }
          else e.abCd = 1;
        }
        if (e.phase === 2) {
          e.abCd2 -= DT;
          if (e.abCd2 <= 0) {
            e.abCd2 = d.wormCd; const ids = [];
            for (let k = 0; k < d.wormN; k++) { const w = this.spawnEnemy('worm', e.entry, { x: e.x, y: e.y, cell: e.cell, to: e.to, copy: true, hpMul: e.hpMul || this.waveHpMul(this.wave), hpScale: 1.3, stun: 0.3 + k * 0.25, dir: [e.dirX, e.dirY], from: e.id }); w.replicated = true; ids.push(w.id); }
            this.emit('bossAct', { kind: 'worms', enemy: e, ids });
          }
        }
      } else if (e.type === 'boss2') {
        if (e.phase === 1 && hf <= 0.5) { e.phase = 2; e.abCd2 = 2.5; e.phaseT = this.time; this.emit('bossPhase', { enemy: e, phase: 2, name: '路由风暴' }); }
        e.abCd -= DT;
        if (e.abCd <= 0 && !busy && !this.zones.some(z => z.kind === 'blackhole')) {
          const ci = this.pickSpoofCell(e);
          if (ci >= 0) { e.abCd = d.spoofCd; e.castT = this.time; this.addWarning({ kind: 'spoof', boss: e.id, cells: [ci], dur: d.spoofWarn }); }
          else e.abCd = 2;
        }
        if (e.phase === 2) {
          e.abCd2 -= DT;
          if (e.abCd2 <= 0) {
            e.abCd2 = d.stormCd; const ids = [];
            for (const t of this.towers) if (Math.hypot(t.x - e.x, t.y - e.y) <= d.stormR) { if (t.shield > 0) { t.shield = 0; t.shieldT = 0; this.emit('shieldBreak', { tower: t }); } t.shieldLock = d.stormLock; ids.push(t.id); }
            e.castT = this.time;
            this.emit('bossAct', { kind: 'storm', enemy: e, ids, r: d.stormR });
          }
        }
      } else if (e.type === 'boss3') {
        if (e.phase === 1 && hf <= 0.66) { e.phase = 2; e.speedMul = 1; e.abCd2 = 2; e.phaseT = this.time; this.emit('bossPhase', { enemy: e, phase: 2, name: '提权' }); }
        if (e.phase === 2 && hf <= 0.33) { e.phase = 3; e.abCd = 1.5; e.phaseT = this.time; this.emit('bossPhase', { enemy: e, phase: 3, name: '破坏' }); }
        if (e.phase >= 2) {
          e.abCd2 -= DT;
          if (e.abCd2 <= 0) {
            e.abCd2 = d.trojanCd; const ids = [];
            for (let k = 0; k < d.trojanN; k++) { const w = this.spawnEnemy('trojan', e.entry, { x: e.x, y: e.y, cell: e.cell, to: e.to, hpMul: e.hpMul || this.waveHpMul(this.wave), stun: 0.3 + k * 0.4, dir: [e.dirX, e.dirY], from: e.id }); ids.push(w.id); }
            this.emit('bossAct', { kind: 'trojans', enemy: e, ids });
          }
        }
        if (e.phase === 3) {
          e.abCd -= DT;
          if (e.abCd <= 0 && !busy && !this.zones.some(z => z.kind === 'lock')) {
            const seg = this.pickLockSeg(e);
            if (seg) { e.abCd = d.lockCd; e.castT = this.time; this.addWarning({ kind: 'lock', boss: e.id, cells: seg, dur: d.lockWarn }); }
            else e.abCd = 2;
          }
        }
      }
    },
    pickSurgeTarget(e) {
      let best = null, bd = 10.5;
      for (const k in this.nodes) {
        const ns = this.nodes[k]; if (!ns.tower && !ns.iso) continue;
        const c = this.grid.cells[ns.i], dd = Math.hypot(c.x - e.x, c.y - e.y);
        if (dd < bd) { bd = dd; best = { ci: ns.i, node: true, tower: ns.tower }; }
      }
      if (best) return best;
      bd = 3.4;
      for (const t of this.towers) { const dd = Math.hypot(t.x - e.x, t.y - e.y) - (t.id === e.blockedBy ? 5 : 0); if (dd < bd) { bd = dd; best = { ci: t.ci, node: false, tower: t.id }; } }
      return best;
    },
    _nearPort(ci, r) { const c = this.grid.cells[ci]; for (const p of this.grid.entries.concat(this.grid.exits)) if (Math.abs(p.x - c.x) + Math.abs(p.y - c.y) <= r) return true; return false; },
    _aheadCells(e, n) {
      const out = []; let c = e.to >= 0 ? e.to : e.cell, k = 0;
      while (c >= 0 && k < n) { out.push(c); c = this._pass(c) ? this.field.next[c] : -1; k++; }
      return out;
    },
    pickSpoofCell(e) {
      const g = this.grid, cand = [], ahead = this._aheadCells(e, 12);
      for (let k = 3; k < ahead.length; k++) cand.push([ahead[k], k]);
      for (const id in this.routes) { const r = this.routes[id].cells; for (let q = 3; q < r.length - 3; q += 2) cand.push([r[q], 20 + q]); }
      let best = -1, bs = -1e9; const seen = new Set();
      for (const [ci, k] of cand) {
        if (seen.has(ci)) continue; seen.add(ci);
        const cc = g.cells[ci];
        if (cc.type !== 'link' || this.towerAt[ci] || this.blockCnt[ci] || this._nearPort(ci, 2)) continue;
        const ev = this.evaluate({ block: [ci] }); if (!ev.ok || !ev.changed.length) continue;
        const sc = ev.changed.length * 10 - (k < 20 ? Math.abs(k - 5) : 8 + (k - 20) * 0.1);
        if (sc > bs) { bs = sc; best = ci; }
      }
      return best;
    },
    pickLockSeg(e) {
      const g = this.grid, ahead = this._aheadCells(e, 12);
      const okCell = ci => { const cc = g.cells[ci]; return (cc.type === 'link' || cc.type === 'node') && !this.towerAt[ci] && !this.blockCnt[ci] && !this._nearPort(ci, 2) && !(this.nodes[ci] && this.nodes[ci].iso); };
      for (let len = e.d.lockLen; len >= 2; len--) {
        for (let k = 1; k + len <= ahead.length; k++) {
          const seg = ahead.slice(k, k + len);
          if (!seg.every(okCell)) continue;
          const ev = this.evaluate({ block: seg }); if (ev.ok) return seg;
        }
      }
      // 前方没有可锁的位置：改选其他入口路线上不会封死的一段
      for (const id of Object.keys(this.routes).sort()) {
        const r = this.routes[id].cells;
        for (let k = 3; k + 3 <= r.length - 2; k++) {
          const seg = r.slice(k, k + e.d.lockLen);
          if (!seg.every(okCell)) continue;
          const ev = this.evaluate({ block: seg }); if (ev.ok && ev.changed.length) return seg;
        }
      }
      return null;
    },
    execWarning(w, e) {
      const d = e.d;
      if (w.kind === 'surge') {
        const ci = w.cells[0], ns = this.nodes[ci]; let t = null;
        if (w.node && ns && ns.iso) { this.emit('bossAct', { kind: 'surge', enemy: e, ci, hit: 'iso' }); this.breakIsolator(ci, 'surge'); return; }
        if (w.node && ns && ns.tower) t = this.tById.get(ns.tower); else if (!w.node) t = this.tById.get(w.tower);
        this.emit('bossAct', { kind: 'surge', enemy: e, ci, hit: t ? 'tower' : 'none' });
        if (t) this.damageTower(t, Math.max(t.maxHp * d.surgeFrac, d.surgeMin), e, 'surge');
        const c = this.grid.cells[ci];
        for (const o of this.towers.slice()) if (o !== t && Math.hypot(o.x - c.x, o.y - c.y) <= 1.5) this.damageTower(o, 45, e, 'surge');
      } else if (w.kind === 'spoof') {
        const ci = w.cells[0];
        if (this.towerAt[ci] || this.blockCnt[ci] || !this.evaluate({ block: [ci] }).ok) { const alt = this.pickSpoofCell(e); if (alt >= 0) this.addWarning({ kind: 'spoof', boss: e.id, cells: [alt], dur: 1.6, retry: true }); return; }
        const dur = d.spoofDur + (e.phase === 2 ? 3 : 0);
        this.zones.push({ id: this.nid++, kind: 'blackhole', cells: [ci], t: dur, dur });
        this.blockCnt[ci]++;
        this.emit('bossAct', { kind: 'blackhole', enemy: e, ci, cells: [ci] });
        this.recompute('blackhole');
      } else if (w.kind === 'lock') {
        const seg = w.cells;
        if (seg.some(ci => this.towerAt[ci] || this.blockCnt[ci]) || !this.evaluate({ block: seg }).ok) { const alt = this.pickLockSeg(e); if (alt) this.addWarning({ kind: 'lock', boss: e.id, cells: alt, dur: 1.8, retry: true }); return; }
        this.zones.push({ id: this.nid++, kind: 'lock', cells: seg.slice(), t: d.lockDur, dur: d.lockDur });
        for (const ci of seg) this.blockCnt[ci]++;
        this.emit('bossAct', { kind: 'lock', enemy: e, cells: seg });
        this.recompute('lock');
      }
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);

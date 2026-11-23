const $ = (id) => document.getElementById(id),
  paths = {
    cube: 'M12 2 3 7v10l9 5 9-5V7z M3 7l9 5 9-5 M12 12v10',
    waves: 'M2 7q3-4 7 0t7 0 6 0 M2 12q3-4 7 0t7 0 6 0 M2 17q3-4 7 0t7 0 6 0',
    mute: 'M3 9h4l5-4v14l-5-4H3z M16 9l6 6m0-6-6 6',
    volume: 'M3 9h4l5-4v14l-5-4H3z M16 8q5 4 0 8m3-11q8 7 0 14',
    sliders: 'M3 6h5m5 0h8M3 12h11m5 0h2M3 18h3m5 0h10 M9 3v6m6 0v6M7 15v6',
    pause: 'M8 5v14m8-14v14',
    play: 'M7 4l13 8-13 8z',
    reset: 'M4 10a8 8 0 1 1 1 8 M4 4v6h6',
    full: 'M3 9V3h6m6 0h6v6m0 6v6h-6m-6 0H3v-6',
    film: 'M3 5h18v15H3z M3 10h18 M6 5l3 5m3-5 3 5m3-5 3 5',
    mouse: 'M12 2q6 0 6 6v8a6 6 0 0 1-12 0V8q0-6 6-6z M12 3v6',
    center: 'M12 2v13m-5-5 5 5 5-5 M4 20h16',
    offset: 'M6 3l10 12m-7 0h7V8 M4 20h16',
    multi: 'M7 3v11m-3-3 3 3 3-3 M16 6v11m-3-3 3 3 3-3 M3 21h18',
    drop: 'M12 3v12m-5-5 5 5 5-5 M4 16v5h16v-5',
    stop: 'M5 5h14v14H5z',
  };
function icon(k) {
  return (
    '<svg class="ico" viewBox="0 0 24 24" fill="' +
    (k == 'play' ? 'currentColor' : 'none') +
    '" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><path d="' +
    paths[k] +
    '"/></svg>'
  );
}
document.querySelectorAll('[data-icon]').forEach((e) => (e.outerHTML = icon(e.dataset.icon)));
let audioCtx,
  muted = true;
function sound(f, dur = 0.15, noise = 0, vol = 0.07, end = 0) {
  if (muted || exporting || !audioCtx) return;
  let c = audioCtx,
    n = c.currentTime,
    g = c.createGain();
  g.gain.setValueAtTime(vol, n);
  g.gain.exponentialRampToValueAtTime(0.0001, n + dur);
  g.connect(c.destination);
  let o;
  if (noise) {
    let buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate),
      a = buf.getChannelData(0);
    for (let i = 0; i < a.length; i++) a[i] = Math.random() * 2 - 1;
    o = c.createBufferSource();
    o.buffer = buf;
    let low = c.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = f;
    o.connect(low);
    low.connect(g);
  } else {
    o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f, n);
    o.frequency.exponentialRampToValueAtTime(end || f * 0.43, n + dur);
    o.connect(g);
  }
  o.start(n);
  o.stop(n + dur);
}
$('sound').onclick = () => {
  audioCtx = audioCtx || new AudioContext();
  audioCtx.resume();
  muted = !muted;
  $('sound').innerHTML =
    icon(muted ? 'mute' : 'volume') + '<span>声音' + (muted ? '关闭' : '开启') + '</span>';
  if (!muted) sound(420, 0.12);
};
const runs = ['jelly-center', 'jelly-multi', 'jelly-offset', 'tank-full'],
  titles = ['正中单击', '递进连击', '偏心冲击', '全程风浪'],
  lengths = [6, 8, 5, 18];
let paused = false,
  slow = 1,
  mode = 0,
  exporting = false,
  demo = -1,
  presTime = 0,
  tick = 0,
  events = [],
  simActive = false,
  busy = false,
  version = 0,
  normalDefaults = { ...config };
let seq = 0;
function random() {
  seq = (Math.imul(seq, 1664525) + 1013904223) >>> 0;
  return seq / 4294967296;
}
function slider(key, label, min, max, step, unit = '', digits = 2) {
  let v = config[key],
    id = 's_' + key;
  return (
    '<label class="slider" for="' +
    id +
    '"><span class="slrow"><span>' +
    label +
    '</span><span class="val" id="v_' +
    key +
    '">' +
    v.toFixed(digits) +
    ' <span class="unit">' +
    unit +
    '</span></span></span><input type="range" id="' +
    id +
    '" data-key="' +
    key +
    '" data-d="' +
    digits +
    '" data-u="' +
    unit +
    '" min="' +
    min +
    '" max="' +
    max +
    '" step="' +
    step +
    '" value="' +
    v +
    '" style="--v:' +
    (100 * (v - min)) / (max - min) +
    '%"></label>'
  );
}
function group(a, b) {
  return '<div class="sectitle">' + a + '<span class="groupcode">' + b + '</span></div>';
}
function panel() {
  $('samples').style.display = tankMode ? 'none' : 'flex';
  document
    .querySelectorAll('#samples button')
    .forEach((e, i) => e.classList.toggle('chosen', i == targetGel));
  let c = $('controls');
  if (!tankMode)
    c.innerHTML =
      group('冲击模式', 'IMPACT MODE') +
      '<div class="modes">' +
      ['正中', '偏心', '连续']
        .map(
          (s, i) =>
            '<button data-m="' +
            i +
            '" class="' +
            (i == mode ? 'active' : '') +
            '">' +
            icon(['center', 'offset', 'multi'][i]) +
            s +
            '</button>',
        )
        .join('') +
      '</div><div class="sub">' +
      group('果冻材质', 'MATERIAL') +
      slider('stiff', '软硬程度', 0.1, 1, 0.01) +
      slider('tough', '结实程度', 0.1, 1, 0.01) +
      '</div><div class="sub">' +
      group('重球设置', 'PROJECTILE') +
      slider('mass', '重球质量', 1, 9, 0.1, 'kg', 1) +
      slider('height', '下落高度', 0.6, 4, 0.1, 'm', 1) +
      '</div><button id="fire" class="action">' +
      icon('drop') +
      '释放重球</button>';
  else
    c.innerHTML =
      group('造浪装置', 'WAVE DRIVER') +
      slider('amp', '造浪幅度', 0.05, 1.45, 0.01, 'm') +
      slider('freq', '造浪频率', 0.35, 2.1, 0.05, 'Hz') +
      '<div class="sub">' +
      group('小球相对密度', 'DENSITY') +
      [
        '<b style="color:#ffab4c">●</b> 琥珀组',
        '<b style="color:#79debd">●</b> 薄荷组',
        '<b style="color:#b894ee">●</b> 紫晶组',
      ]
        .map((s, i) => slider('rho' + i, s, 0.3, 2.4, 0.05))
        .join('') +
      '</div><div class="modes sub"><button id="release">' +
      icon('drop') +
      '释放小球</button><button class="active" id="wave">' +
      icon('waves') +
      (wave ? '停止造浪' : '开始造浪') +
      '</button></div>';
  c.querySelectorAll('input').forEach(
    (e) =>
      (e.oninput = () => {
        let v = +e.value,
          k = e.dataset.key;
        if(demo>=0){demo=-1;setSelected(-1);}
        config[k] = v;
        e.style.setProperty('--v', ((v - e.min) / (e.max - e.min)) * 100 + '%');
        $('v_' + k).innerHTML =
          v.toFixed(+e.dataset.d) + ' <span class="unit">' + e.dataset.u + '</span>';
        if (!tankMode && ['height', 'mass'].includes(k)) {
          let b = balls.find((b) => b.held);
          if (b) {
            b.r = 0.41 + 0.036 * config.mass;
            b.y = gels[targetGel].h + b.r + config.height;
            b.o.scale.setScalar(b.r);
            render();
          }
        }
        if (tankMode && k.startsWith('rho')) simActive = true;
      }),
  );
  c.querySelectorAll('[data-m]').forEach(
    (e) =>
      (e.onclick = () => {
        mode = +e.dataset.m;
        let b = balls.find((b) => b.held);
        if (b) b.x = gels[targetGel].x + (mode == 1 ? gels[targetGel].r * 0.42 : 0);
        panel();
        render();
      }),
  );
  if (tankMode) {
    $('release').onclick = () => {
      if (!water) return;
      demo = -1;
      releaseTank();
      setSelected(-1);
      simActive = true;
      setPause(false);
    };
    $('wave').onclick = () => {
      if (!water) return;
      demo = -1;
      wave = !wave;
      if(wave)wavePhase=0;
      setSelected(-1);
      simActive = true;
      setPause(false);
      panel();
    };
  } else
    $('fire').onclick = () => {
      demo = -1;
      simActive = true;
      setPause(false);
      let b = balls.find((b) => b.held);
      if (b) {
        balls.splice(balls.indexOf(b), 1);
        world.remove(b.o);
      }
      dropGel(mode == 1, config.mass);
      if (mode == 2)
        {
          events.push([elapsed + .57,config.mass*1.17,targetGel,.24],[elapsed+1.12,config.mass*1.5,targetGel,-.18]);
          events.sort((a,b)=>a[0]-b[0]);
        }
      setSelected(-1);
    };
  $('jellyTab').classList.toggle('active', !tankMode);
  $('tankTab').classList.toggle('active', tankMode);
  $('expNo').textContent = tankMode ? '02' : '01';
  $('sceneTitle').textContent = tankMode ? '多密度球与造浪水槽' : '重球冲击果冻';
}
function setPause(v) {
  paused = v;
  $('pause').innerHTML = icon(v ? 'play' : 'pause');
  document.querySelector('.live').innerHTML =
    '<em style="background:' + (v ? '#c9ab77' : '') + '"></em>' + (v ? 'PAUSED' : 'LIVE VIEW');
}
function updateClock(t) {
  t = Math.max(0, t);
  $('clock').textContent =
    String(Math.floor(t / 60)).padStart(2, '0') + ':' + (t % 60).toFixed(2).padStart(5, '0');
  document.querySelector('.timeline b').style.width =
    (demo >= 0 ? Math.min(100, (100 * presTime) / lengths[demo]) : ((t % 15) / 15) * 100) + '%';
}
function setSelected(n) {
  document.querySelectorAll('.card').forEach((e, i) => e.classList.toggle('sel', n == i));
}
let targetGel = 0;
function dropGel(offset, m, sample=targetGel) {
  let target = gels[sample] || gels[0];
  let r = 0.41 + 0.036 * m,
    b = newBall(
      target.x + (offset ? target.r * 0.42 : 0),
      target.h + r + config.height,
      target.z + (offset ? 0.22 : 0),
      r,
      m,
      chrome,
    );
  b.vx = offset ? 0.72 : 0;
  b.vy = -0.7;
  b.vz = offset ? 0.16 : 0;
  return b;
}
function releaseTank(count = 9) {
  for (let i = 0; i < count; i++) {
    const slot=((water.released || 0)*5+3)%12;
    water.released=(water.released || 0)+1;
    let g = i % 3,
      x = Math.max(-FL/2+water.piston+.32,-3.33+slot*.595+(random()-.5)*.16),
      z = -0.98 + 1.96 * random(),
      b = newBall(x, 2.55 + random() * 1.03, z, 0.215, config['rho' + g], ballMats[g], g);
    b.vy = -0.45 - random() * 0.7;
    b.vx = (random() - 0.5) * 0.65;
  }
}
function ballCollisions() {
  for (let i = 0; i < balls.length; i++)
    for (let j = 0; j < i; j++) {
      let a = balls[i],
        b = balls[j],
        x = a.x - b.x,
        y = a.y - b.y,
        z = a.z - b.z,
        r = Math.hypot(x, y, z),
        min = a.r + b.r;
      if (r < min && r > 0.0001) {
        x /= r;
        y /= r;
        z /= r;
        let f = (min - r) * 0.5;
        a.x += x * f;
        a.y += y * f;
        a.z += z * f;
        b.x -= x * f;
        b.y -= y * f;
        b.z -= z * f;
        let vel = (a.vx - b.vx) * x + (a.vy - b.vy) * y + (a.vz - b.vz) * z;
        if (vel < 0) {
          let f = (-1.48 * vel) / (1 / a.m + 1 / b.m);
          for (let [k, n] of [
            ['vx', x],
            ['vy', y],
            ['vz', z],
          ]) {
            a[k] += (n * f) / a.m;
            b[k] -= (n * f) / b.m;
          }
          if (vel < -0.8) sound(950, 0.12, 0, 0.045);
        }
      }
    }
}
function integrateGel(dt) {
  for(const g of gels)g.supportedMass=0;
  for (let b of balls) {
    if (b.held) continue;
    b.cool -= dt;
    b.vy -= 10.8 * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.z += b.vz * dt;
    for (let g of gels) {
      if (g.broken) {
        fragmentContact(b, g, dt);
        continue;
      }
      let p = g.p,
        cx = p[0],
        cz = p[2],
        dx = b.x - cx,
        dz = b.z - cz,
        dist = Math.hypot(dx, dz);
      if (dist > g.r + b.r * 0.5) continue;
      let top = g.h + 0.08 - (g.kind == 2 ? 0.47 : 0.08) * Math.pow(dist / g.r, 2);
      top *= 1 + (g.compression || 0);
      let depth = top + b.r - b.y;
      if (depth <= 0 || depth > 2.7) continue;
      g.awake = elapsed + 3.7;
      b.contacts = b.contacts || new Map();
      let contact = b.contacts.get(g);
      if (!contact || elapsed - contact.time > dt * 1.5) {
        contact = {
          cap:
            Math.max(0.08, -b.vy) *
              (0.38 + 0.17 * config.stiff) *
              (g.kind == 1 ? 1.25 : g.kind == 2 ? 0.79 : 1) +
            Math.abs(g.impulse || 0) * 0.08,
        };
        b.contacts.set(g, contact);
      }
      contact.time = elapsed;
      if (b.vy < -2.6 && b.cool <= 0) {
        let energy = 0.5 * b.m * b.vy * b.vy;
        b.vx += (dx / g.r) * Math.abs(b.vy) * 0.21;
        b.vz += (dz / g.r) * Math.abs(b.vy) * 0.21;
        b.cool = 0.5;
        g.fracture += energy * 0.18;
        let threshold =
          (34 + 240 * config.tough * (0.6 + config.stiff * 0.6)) *
          (g.kind == 1 ? 1.24 : g.kind == 2 ? 0.79 : 1);
        if (!g.broken && energy + g.fracture > threshold) {
          g.split(b.x, (energy + g.fracture) / threshold, b.z);
          sound(4600, 0.24, 1, 0.19);
        } else {
          const pitch=(86+83*config.stiff)/Math.sqrt(.55+.12*b.m);
          sound(pitch,.19+.10*(1-config.stiff),0,clamp(Math.sqrt(energy)*.011,.025,.17));
        }
        if (!g.broken) {
          g.impulse = clamp((g.impulse || 0) + ((b.vy * b.m) / (b.m + 3.4)) * 1.05, -6, 3);
          g.shearV = (g.shearV || 0) + dx * b.vy * -0.63;
        }
        let amp = Math.min(5.7, -b.vy * 0.72) * (1.14 - config.stiff * 0.5);
        for (let i = 0; i < g.v.length; i += 3) {
          let x = g.p[i] - b.x,
            z = g.p[i + 2] - b.z,
            y = g.p[i + 1] / g.h,
            w = Math.exp(-(x * x + z * z) / (g.r * g.r * 0.75));
          g.v[i + 1] -= amp * w * Math.min(1, y);
          g.v[i] += ((amp * 0.55 * (g.p[i] - cx)) / g.r) * (1 - 0.3 * y) + b.vx * 0.22;
          g.v[i + 2] += ((amp * 0.55 * (g.p[i + 2] - cz)) / g.r) * (1 - 0.3 * y);
        }
      }
      let factor = clamp((g.r + b.r * 0.35 - dist) / (0.5 * g.r), 0, 1);
      g.supportedMass+=b.m*factor*clamp(depth/b.r,0,1);
      let spring = ((115 + 350 * config.stiff) * (g.kind == 1 ? 1.25 : 1)) / Math.sqrt(b.m * 0.52);
      b.vy += (depth * spring - Math.min(b.vy - (g.impulse || 0) * g.h, 0) * 5.4) * factor * dt;
      b.vy = Math.min(b.vy, contact.cap);
      if (Math.abs(b.vy) < 0.7 && Math.abs(g.impulse || 0) < 0.3) {
        b.vy *= Math.exp(-dt * 9 * factor);
      }
      let lateral = (1 - factor) * 9 + dist * (dist < 0.6 * g.r ? -4.8 : 0.28);
      if (dist < 0.6 * g.r) {
        b.vx *= Math.exp(-dt * 4.8);
        b.vz *= Math.exp(-dt * 4.8);
      }
      b.vx += (dx / (dist + 0.01)) * dt * lateral;
      b.vz += (dz / (dist + 0.01)) * dt * lateral;
      if (b.vy > 2.1 && !b.up) {
        sound(128+105*config.stiff,.18,0,clamp(b.vy*.013,.022,.08),235+140*config.stiff);
        b.up = true;
      }
      if (b.vy < -0.5) b.up = false;
    }
    if (b.y < b.r + 0.025) {
      b.y = b.r + 0.025;
      if(b.vy < -1.1){
        const note=960/Math.sqrt(b.m);
        sound(note,.16,0,clamp(-b.vy*.017,.025,.13),note*.91);
        sound(note*2.71,.08,0,.019,note*2.6);
      }
      b.vy *= b.vy < -0.45 ? -0.38 : 0;
      b.vx *= 0.982;
      b.vz *= 0.982;
    }
    if (Math.abs(b.x) > 4.55 - b.r) {
      b.x = Math.sign(b.x) * (4.55 - b.r);
      b.vx *= -0.59;
    }
    if (Math.abs(b.z) > 2.45 - b.r) {
      b.z = Math.sign(b.z) * (2.45 - b.r);
      b.vz *= -0.53;
    }
  }
  ballCollisions();
  for (let g of gels)
    if (g.awake > elapsed) {
      g.step(dt, balls);
      const modalMass=4.6*g.r*g.r*g.h;
      const shapeStiffness=g.kind===1?1.38:g.kind===2?.74:1;
      let k=(35+95*config.stiff)*shapeStiffness/(1+.6*g.supportedMass/modalMass);
      g.impulse = ((g.impulse || 0) - (g.compression || 0) * k * dt) * Math.exp(-dt * 2.95);
      g.compression = clamp((g.compression || 0) + g.impulse * dt, -0.5, 0.33);
      g.shearV = ((g.shearV || 0) - (g.shear || 0) * k * 0.53 * dt) * Math.exp(-dt * 3.2);
      g.shear = clamp((g.shear || 0) + g.shearV * dt, -0.5, 0.5);
    }
  gelCollisions(dt);
}
async function integrateWater(dt) {
  let w = water;
  if (!w) return;
  wavePhase += dt * config.freq * TAU;
  let amp = demo == 3 ? clamp((elapsed - 2.4) / 5.1, 0.04, 1) * 1.37 : config.amp;
  let force = wave ? 0.23 + amp * 0.5 * (1 - Math.cos(wavePhase)) : 0.23;
  let piston = w.piston + clamp(force - w.piston, -dt * 7, dt * 7);
  for (let b of balls) {
    b.m = config['rho' + b.group];
    let h = w.height(b.x, b.z);
    if (b.m < 1) {
      let shore = 0;
      for (let a = 0; a < 6; a++)
        shore +=
          w.height(b.x + 0.29 * Math.cos((a * TAU) / 6), b.z + 0.29 * Math.sin((a * TAU) / 6)) / 6;
      h = Math.max(h, shore);
    }
    let sub = clamp((h - b.y + b.r) / (2 * b.r), 0, 1),
      vol = sub * sub * (3 - 2 * sub);
    if (sub > 0.04 && !b.wet && b.vy < -1) {
      b.wet = true;
      sound(1400, 0.22, 1, 0.095);
      let momentum = Math.min(8, Math.abs(b.vy) * Math.sqrt(b.m));
      for (let j = 0; j < 12 + momentum * 2.4; j++) {
        let a = random() * TAU,
          sp = (0.22 + random() * 0.65) * momentum * 0.32;
        drops.push({
          x: b.x + 0.17 * Math.cos(a),
          y: h,
          z: b.z + 0.17 * Math.sin(a),
          vx: sp * Math.cos(a),
          vy: 0.7 + random() * momentum * 0.39,
          vz: sp * Math.sin(a),
          r: 0.018 + random() * 0.035,
          life: 1,
        });
      }
    }
    if (sub < 0.01) b.wet = false;
    if (vol > 0.15 && b.vy < -0.38 && random() < 0.56)
      bubbles.push({
        x: b.x + (random() - 0.5) * b.r,
        y: b.y + b.r * 0.82,
        z: b.z + (random() - 0.5) * b.r,
        r: 0.012 + random() * 0.03,
        vx: b.vx * 0.23,
        vz: b.vz * 0.23,
        life: 2,
      });
    let ux = 0,
      uy = 0,
      uz = 0,
      count = 0,
      s = w.state;
    for (let i = 0; i < s.length; i += 80) {
      let dx = s[i] - FL / 2 - b.x,
        dy = s[i + 1] - b.y,
        dz = s[i + 2] - FW / 2 - b.z,
        rr = dx * dx + dy * dy + dz * dz;
      if (rr < 0.54) {
        let k = 1 - rr / 0.54;
        ux += s[i + 4] * k;
        uy += s[i + 5] * k;
        uz += s[i + 6] * k;
        count += k;
      }
    }
    count = Math.max(1, count);
    b.vy +=
      (9.8 * ((vol * (1 + clamp((h * 0.63 - b.y) * 0.32, -0.2, 0.23))) / b.m - 1) +
        (uy / count - b.vy) * vol * (3.8 + Math.abs(b.vy) * 0.55)) *
      dt;
    b.vx += (ux / count - b.vx) * vol * dt * 3;
    b.vz += (uz / count - b.vz) * vol * dt * 3;
    // Added-mass response to resolved fluid acceleration and shear lift near the bed.
    const flowY=uy/count, flowX=ux/count, flowZ=uz/count;
    const acceleration=clamp((flowY-(b.lastFlowY??flowY))/dt,-13,13);
    b.lastFlowY=flowY;
    const gap=Math.max(0,b.y-b.r-bedHeight(b.x+FL/2));
    const shear= Math.hypot(flowX-b.vx,flowZ-b.vz);
    const lift=.375*shear*shear/(b.r*(b.m+.5))*Math.exp(-gap/(b.r*.75));
    b.vy+=vol*(clamp(acceleration,-7,8)*.8/(b.m+.5)+lift)*dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.z += b.vz * dt;
    let bottom = bedHeight(b.x+FL/2);
    if (b.y < b.r + bottom) {
      b.y = b.r + bottom;
      const slope=bedSlope(b.x+FL/2);
      const normalSpeed=(b.vy-slope*b.vx)/(1+slope*slope);
      if(normalSpeed<0){b.vy-=1.18*normalSpeed;b.vx+=1.18*slope*normalSpeed;}
      b.vx *= 0.986;
    }
    const rolling=clamp(1-gap/b.r,0,1);
    b.spinX+=(b.vz/b.r*rolling+(flowZ-b.vz)*.8-b.spinX)*Math.min(1,dt*(3+12*rolling));
    b.spinZ+=(-b.vx/b.r*rolling-(flowX-b.vx)*.8-b.spinZ)*Math.min(1,dt*(3+12*rolling));
    b.o.rotation.x+=b.spinX*dt;
    b.o.rotation.z+=b.spinZ*dt;
    let lo = -FL / 2 + piston + b.r,
      hi = FL / 2 - b.r;
    if (b.x < lo || b.x > hi) {
      b.x = clamp(b.x, lo, hi);
      b.vx = b.x == lo ? Math.max(0.1, (piston - w.piston) / dt) : -Math.abs(b.vx) * 0.65;
    }
    if (Math.abs(b.z) > FW / 2 - b.r) {
      b.z = Math.sign(b.z) * (FW / 2 - b.r);
      b.vz *= -0.6;
    }
  }
  ballCollisions();
  for (let d of bubbles) {
    d.y += dt * (0.32 + d.r * 6);
    d.x += dt * d.vx;
    d.z += dt * d.vz;
    d.life -= dt;
  }
  bubbles = bubbles.filter((b) => b.y < w.height(b.x, b.z) && b.life > 0);
  for (let f of foam) {
    f.x += f.u * dt;
    f.z += f.v * dt;
    f.u *= 0.975;
    f.v *= 0.975;
    f.x = clamp(f.x, piston - FL / 2 + 0.03, FL / 2 - 0.02);
    f.z = clamp(f.z, -FW / 2 + 0.02, FW / 2 - 0.02);
    f.y += (w.height(f.x, f.z) + 0.025 - f.y) * Math.min(1, dt * 29);
    f.life -= dt;
    f.r *= 0.997;
  }
  foam = foam.filter((f) => f.life > 0);
  if (foam.length < 550) {
    for (let k = 0; k < 94; k++) {
      let i = ((random() * w.count) | 0) * 8,
        s = w.state,
        x = s[i] - FL / 2,
        z = s[i + 2] - FW / 2,
        y = s[i + 1],
        h = w.height(x, z);
      if (
        y < h - 0.055 ||
        (y < h + 0.035 && Math.abs(s[i + 4]) + Math.abs(s[i + 5]) < 2.6) ||
        Math.hypot(s[i + 4], s[i + 5]) < 1.8
      )
        continue;
      for (let n = 0; n < 4; n++)
        foam.push({
          x: x + (random() - 0.5) * 0.1,
          z: z + (random() - 0.5) * 0.1,
          y: y + 0.025,
          u: s[i + 4] * 0.75,
          v: s[i + 6] * 0.75,
          r: 0.018 + random() * 0.036,
          aspect: 0.3 + random() * 0.35,
          life: 0.4 + random() * 1.35,
        });
    }
  }
  for (let d of drops) {
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    d.z += d.vz * dt;
    d.vy -= 9 * dt;
    d.life -= dt;
  }
  drops = drops.filter((d) => d.life > 0 && d.y > w.height(d.x, d.z) - 0.1);
  if (wave && Math.cos(wavePhase) > 0 && Math.cos(wavePhase - config.freq * TAU * dt) <= 0)
    sound(360, 0.48, 1, 0.05);
  let impacts = [];
  for (let d of drops) {
    if (!d.hit && d.vy < 0 && d.y < w.height(d.x, d.z) + 0.055) {
      d.hit = true;
      impacts.push([d.x + FL / 2, d.y, d.z + FW / 2, Math.min(0.65, -d.vy * d.r * 2.6)]);
    }
  }
  await w.step(dt, piston, balls, impacts);
  const wallLevel=w.height(FL/2-.24,0);
  const rise=(wallLevel-(w.lastWallLevel??wallLevel))/dt;
  if(rise>.9&&wallLevel>1.63&&elapsed>(w.nextSlap??0)){
    sound(680+rise*180,.27,1,clamp(rise*.025,.035,.13));
    w.nextSlap=elapsed+.48;
  }
  w.lastWallLevel=wallLevel;
}
async function resetTo(tankState, run = -1) {
  let token=++version;
  $('controls').inert=true;
  simActive=false;
  while (busy) await new Promise((r) => setTimeout(r, 0));
  if (token != version) return;
  busy = true;
  try {
    if (water) {
      water.destroy();
      water = null;
    }
    events = [];
    seq = 658;
    targetGel = 0;
    tick = 0;
    demo = run;
    presTime = 0;
    setPause(false);
    if (run >= 0) {
      Object.assign(config, normalDefaults);
      config.height = 2.8;
      config.tough = run == 1 ? 0.6 : 0.97;
      mode = run == 1 ? 2 : run == 2 ? 1 : 0;
    }
    if (tankState) {
      freshTank();
      water = await new Liquid().init();
      if (run == 3) {
        config.freq = 0.52;
        releaseTank(6);
        events = [[0.4, 6]];
      } else {
        for (let i = 0; i < 9; i++) {
          let g = i % 3;
          newBall(
            -2.7 + i * 0.63,
            [1.49, 0.94, 0.27][g],
            0.46 * Math.sin(i * 3.3),
            0.215,
            config['rho' + g],
            ballMats[g],
            g,
          );
        }
      }
      drawWater();
    } else {
      freshJelly(run < 0);
      if (run >= 0) {
        dropGel(run == 2, run == 1 ? 2.6 : 4.8);
        if (run == 1)
          events = [
            [0.68, 4.2],
            [1.32, 8.4],
          ];
        if (run == 2) {
          let b = newBall(3.77, 0.37, 1.57, 0.35, 2, chrome);
        }
      }
    }
    simActive = run >= 0;
    panel();
    setSelected(run);
    updateClock(0);
    resize();
    render();
  } finally {
    if(token===version)$('controls').inert=false;
    busy=false;
  }
}
async function advance() {
  let dt = tankMode ? 1 / 60 : 1 / 120;
  if (demo >= 0 && !tankMode) {
    let t = presTime;
    if (demo == 1 ? t > 0.57 && t < 3.8 : t > 0.53 && t < 1.95) dt *= 0.57;
  }
  presTime += tankMode ? 1 / 60 : 1 / 120;
  elapsed += dt;
  while (events.length && elapsed >= events[0][0]) {
    let ev = events.shift();
    if (tankMode) {
      releaseTank(ev[1]);
      continue;
    }
    let b = dropGel(false, ev[1],ev[2] ?? targetGel);
    b.x += ev[3] ?? (ev[1] > 6 ? -0.24 : 0.32);
    b.vx = ev[1] > 6 ? 0.2 : -0.22;
  }
  if (tankMode) {
    if (demo === 3) {
      const running=elapsed>2.25 && elapsed<12;
      if(running!==wave){
        wave=running;if(wave)wavePhase=0;
        if(!exporting)panel();
      }
    }
    await integrateWater(dt);
  } else integrateGel(dt);
  tick++;
}
function refresh() {
  if (tankMode) drawWater();
  else for (let g of gels) if (g.awake > elapsed - 0.12) g.update();
  render();
  updateClock(presTime);
}
let last = 0,
  acc = 0;
async function loop(now) {
  requestAnimationFrame(loop);
  if (exporting || busy) {
    last = now;
    return;
  }
  let delta = clamp((now - last) / 1000, 0, 0.045);
  last = now;
  if (paused || !simActive) {
    acc = 0;
    return;
  }
  busy = true;
  try {
    acc = Math.min(0.06, acc + delta * slow);
    let step = tankMode ? 1 / 60 : 1 / 120;
    while (acc >= step) {
      await advance();
      acc -= step;
      if (demo >= 0 && presTime >= lengths[demo] - 1e-6) {
        setPause(true);
        break;
      }
    }
    refresh();
  } finally {
    busy = false;
  }
}
$('pause').onclick = () => {
  if (paused && demo >= 0 && presTime >= lengths[demo] - 0.01) {
    resetTo(tankMode, demo);
    return;
  }
  setPause(!paused);
};
$('speed').onclick = () => {
  slow = slow == 1 ? 0.5 : slow == 0.5 ? 0.25 : 1;
  $('speed').textContent = (slow == 1 ? '1.0' : slow) + '×';
};
$('reset').onclick = () => resetTo(tankMode);
$('jellyTab').onclick = () => resetTo(false);
$('tankTab').onclick = () => resetTo(true);
$('full').onclick = () =>
  document.fullscreenElement
    ? document.exitFullscreen()
    : document.querySelector('.viewer').requestFullscreen();
let vp = $('viewport'),
  drag = null;
vp.onpointerdown = (e) => {
  drag = [e.clientX, e.clientY];
  vp.setPointerCapture(e.pointerId);
};
vp.onpointermove = (e) => {
  if (!drag || exporting) return;
  yaw -= (e.clientX - drag[0]) * 0.006;
  pitch = clamp(pitch + (e.clientY - drag[1]) * 0.004, 0.08, 1.05);
  drag = [e.clientX, e.clientY];
  render();
};
vp.onpointerup = () => (drag = null);
vp.onwheel = (e) => {
  e.preventDefault();
  if(exporting)return;
  zoom = clamp(zoom * Math.exp(e.deltaY * 0.001), 0.69, 1.7);
  render();
};
vp.addEventListener('wheel', () => {}, { passive: true });
window.addEventListener('resize', () => {
  resize();
  render();
});
new ResizeObserver(() => {
  resize();
  render();
}).observe(vp);
window.addEventListener('keydown', (e) => {
  if (!exporting && e.code == 'Space' && e.target.tagName != 'INPUT') {
    e.preventDefault();
    $('pause').click();
  }
});
async function previews() {
  const imgs = runs.map((_, i) => 'preview-' + (i + 1) + '.jpg');
  $('cards').innerHTML = titles
    .map(
      (s, i) =>
        '<button class="card" data-run="' +
        i +
        '"><div class="thumb" style="background-image:url(' +
        imgs[i] +
        ')"><span class="cardnum">0' +
        (i + 1) +
        '</span><span class="duration">00:' +
        String(lengths[i]).padStart(2, '0') +
        '</span></div><div class="cardbody"><div><strong>' +
        s +
        '</strong><small>' +
        runs[i] +
        '</small></div><span class="round">' +
        icon('play') +
        '</span></div></button>',
    )
    .join('');
  document.querySelectorAll('.card').forEach(
    (e) =>
      (e.onclick = () => {
        let i = +e.dataset.run;
        resetTo(i == 3, i);
      }),
  );
  await resetTo(false);
  setSelected(0);
}
let ready = previews();
ready.then(() => requestAnimationFrame(loop));
let fpsExport = 30;
let priorSample, manualSettings;

function sampleState(copy) {
  return {
    balls: balls.map((b) => [b, b.x, b.y, b.z,b.o.rotation.x,b.o.rotation.z]),
    gels: gels.map((g) => [g, copy ? g.p.slice() : g.p, g.compression || 0, g.shear || 0]),
    water: water && (copy ? water.state.slice() : water.state),
    piston: water?.piston,
    time: presTime,
  };
}

function displaySample(time, fraction) {
  if (fraction < 1e-8 || !priorSample) {
    refresh();
    return;
  }
  const current = sampleState(false);
  const blend = (a, b) => a + (b - a) * fraction;
  for (const [b, x, y, z,rx,rz] of priorSample.balls) {
    b.o.rotation.x=blend(rx,b.o.rotation.x);b.o.rotation.z=blend(rz,b.o.rotation.z);
    b.x = blend(x, b.x);
    b.y = blend(y, b.y);
    b.z = blend(z, b.z);
  }
  for (const [g, p, c, s] of priorSample.gels) {
    if (g.p.length !== p.length) continue;
    g.p = p.map((v, i) => blend(v, g.p[i]));
    g.compression = blend(c, g.compression || 0);
    g.shear = blend(s, g.shear || 0);
  }
  if (water) {
    water.state = priorSample.water.map((v, i) => blend(v, current.water[i]));
    water.piston = blend(priorSample.piston, current.piston);
    water.surface();
  }
  presTime = time;
  refresh();
  for (const [b, x, y, z,rx,rz] of current.balls){ Object.assign(b, { x, y, z });b.o.rotation.x=rx;b.o.rotation.z=rz;}
  for (const [g, p, compression, shear] of current.gels) Object.assign(g, { p, compression, shear });
  if (water) {
    water.state = current.water;
    water.piston = current.piston;
    water.surface();
  }
  presTime = current.time;
}
window.videoExport = {
  runs,
  async begin(id, { fps } = { fps: 30 }) {
    await ready;
    let idx = runs.indexOf(id);
    if (idx < 0 || !Number.isInteger(fps) || fps < 1) throw Error('无效的演示或帧率');
    if (!exporting) manualSettings = { config: { ...config }, mode, tankMode };
    exporting = true;
    priorSample = null;
    document.body.classList.add('exporting');
    fpsExport = fps;
    await resetTo(idx == 3, idx);
    resize();
    render();
    return { frames: Math.ceil(lengths[idx] * fps) };
  },
  async frame(i) {
    const rate = tankMode ? 60 : 120;
    const target = Math.ceil((i * rate) / fpsExport - 1e-9);
    while (tick < target) {
      if (tick + 1 === target) priorSample = sampleState(true);
      await advance();
    }
    displaySample(i / fpsExport, ((i * rate) % fpsExport) / fpsExport);
    renderer.getContext().finish();
  },
  end() {
    exporting = false;
    document.body.classList.remove('exporting');
    priorSample = null;
    if (manualSettings) {
      Object.assign(config, manualSettings.config);
      mode = manualSettings.mode;
    }
    return resetTo(manualSettings?.tankMode ?? tankMode);
  },
};
function gelCollisions(dt) {
  if (!gels.some((g) => g.awake > elapsed)) return;
  let parts = [];
  for (let g of gels) {
    let groups = g.broken && g.crackFront > 1.3 ? [-1, 1] : [0];
    for (let s of groups) {
      let lo = [Infinity, Infinity, Infinity],
        hi = [-Infinity, -Infinity, -Infinity],
        idx = [];
      for (let i = 0; i < g.p.length; i += 3) {
        if (s && g.groups[i / 3] != s) continue;
        idx.push(i);
        for (let j = 0; j < 3; j++) {
          lo[j] = Math.min(lo[j], g.p[i + j]);
          hi[j] = Math.max(hi[j], g.p[i + j]);
        }
      }
      parts.push({
        g,
        idx,
        lo,
        hi,
        x: (lo[0] + hi[0]) / 2,
        z: (lo[2] + hi[2]) / 2,
        rx: (hi[0] - lo[0]) * 0.49,
        rz: (hi[2] - lo[2]) * 0.49,
      });
    }
  }
  for (let i = 0; i < parts.length; i++)
    for (let j = 0; j < i; j++) {
      let a = parts[i],
        b = parts[j];
      if (a.lo[1] > b.hi[1] || b.lo[1] > a.hi[1]) continue;
      let dx = a.x - b.x,
        dz = a.z - b.z,
        d = Math.hypot(dx, dz) || 0.01;
      dx /= d;
      dz /= d;
      let overlap = Math.hypot(a.rx * dx, a.rz * dz) + Math.hypot(b.rx * dx, b.rz * dz) - d;
      if (overlap <= 0) continue;
      let f = Math.min(0.027, 0.26 * overlap);
      for (let [part, sign] of [
        [a, 1],
        [b, -1],
      ]) {
        part.g.awake = Math.max(part.g.awake || 0, elapsed + 0.5);
        for (let n of part.idx) {
          let k = f * sign * (0.7 + 0.3 * clamp(part.g.p[n + 1], 0, 1));
          part.g.p[n] += dx * k;
          part.g.p[n + 2] += dz * k;
          part.g.v[n] += (dx * k * 0.07) / dt;
          part.g.v[n + 2] += (dz * k * 0.07) / dt;
        }
      }
    }
}
document.querySelectorAll('#samples button').forEach(
  (e, i) =>
    (e.onclick = () => {
      targetGel = i;
      let b = balls.find((b) => b.held),
        g = gels[i];
      if (b) {
        b.x = g.x;
        b.z = g.z;
        b.y = g.h + b.r + config.height;
      }
      panel();
      render();
    }),
);

function fragmentContact(b, g, dt) {
  let x = 0,
    y = 0,
    z = 0,
    total = 0,
    speed = 0,
    max = 0;
  for (let n = 0; n < g.p.length; n += 3) {
    let dx = b.x - g.p[n],
      dy = b.y - g.p[n + 1],
      dz = b.z - g.p[n + 2],
      d2 = dx * dx + dy * dy + dz * dz;
    if (d2 > (b.r + 0.078) ** 2 || d2 < 1e-9) continue;
    let d = Math.sqrt(d2),
      depth = b.r + 0.078 - d;
    dx /= d;
    dy /= d;
    dz /= d;
    total += depth;
    x += dx * depth;
    y += dy * depth;
    z += dz * depth;
    speed += depth * (g.v[n] * dx + g.v[n + 1] * dy + g.v[n + 2] * dz);
    max = Math.max(max, depth);
    let impulse = Math.min(0.42, (depth / dt) * 0.06);
    g.v[n] -= dx * impulse;
    g.v[n + 1] -= dy * impulse;
    g.v[n + 2] -= dz * impulse;
  }
  if (!total) return;
  g.awake = elapsed + 1;
  if(g.crackLimit<1.75 && b.vy<-2 && b.cool<=0){
    const energy=.5*b.m*b.vy*b.vy;
    const resistance=34+240*config.tough*(.6+config.stiff*.6);
    const extension=Math.max(0,energy/resistance-.26);
    if(extension>.04){g.crackLimit=Math.min(1.75,g.crackLimit+extension);b.cool=.45;sound(3400,.14,1,.1);}
  }
  let len = Math.hypot(x, y, z) || 1;
  x /= len;
  y /= len;
  z /= len;
  let vn = b.vx * x + b.vy * y + b.vz * z,
    impulse = Math.max(0, (speed / total - vn) * 0.65 + max * 32 * dt);
  b.vx += impulse * x;
  b.vy += impulse * y;
  b.vz += impulse * z;
  b.x += max * 0.3 * x;
  b.y += max * 0.3 * y;
  b.z += max * 0.3 * z;
}

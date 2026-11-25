'use strict';
/* ==========================================================================
   Viewpoints (orbit centres, initial angles, limits) + switcher UI
   ========================================================================== */
(function () {
  const P = window.P, C = P.Cam;
  const V = (o) => C.addView(Object.assign({ dmin: 20, dmax: 300, emin: 0.06, emax: 1.35 }, o));
  // az: 0 = camera south of target looking north; + = camera toward east
  V({ name: '全景', icon: 'pano', num: '01', t: [0, 10, -34], az: 0.58, el: 0.25, d: 372, dmin: 140, dmax: 680, emin: 0.1, emax: 1.3, box: [-120, 0, -100, 120, 30, 100] });
  V({ name: '入口大门与广场', icon: 'info', num: '02', t: [0, 4, 98], az: 0.42, el: 0.3, d: 72, dmin: 22, dmax: 170, box: [-50, 1, 70, 50, 12, 130] });
  V({ name: '超级造浪池与沙滩', icon: 'wave', num: '03', t: [0, 1, 4], az: 0.3, el: 0.36, d: 100, dmin: 28, dmax: 220, box: [-60, 0, -35, 60, 10, 50] });
  V({ name: '漂流河：瀑布帘、喷水拱门和隧道', icon: 'river', num: '04', t: [-69, 2.0, -54], az: 0.52, el: 0.44, d: 40, dmin: 14, dmax: 150, box: [-160, 0, -64, -40, 10, 10] });
  V({ name: '晴空塔与滑道山', icon: 'loop', num: '05', t: [0, 20, -80], az: 0.22, el: 0.2, d: 118, dmin: 40, dmax: 260, box: [-60, 5, -110, 60, 40, -40] });
  V({ name: '垂直高速滑道与发射舱', icon: 'drop', num: '06', t: [-9.5, 30, -85], az: 0.62, el: 0.1, d: 36, dmin: 14, dmax: 100, box: [-30, 10, -100, 10, 42, -50] });
  V({ name: '回环滑道与双螺旋管道', icon: 'helix', num: '07', t: [0, 25, -92], az: 0.12, el: 0.14, d: 56, dmin: 18, dmax: 130, box: [-30, 12, -105, 30, 40, -70] });
  V({ name: '彩虹竞速滑道', icon: 'race', num: '08', t: [19, 13, -66], az: 1.05, el: 0.2, d: 62, dmin: 20, dmax: 150, box: [0, 0, -95, 40, 32, -35] });
  V({ name: '极限滑道区：巨型漏斗、巨碗、U 型滑板', icon: 'funnel', num: '09', t: [-124, 13, -77], az: 0.3, el: 0.25, d: 78, dmin: 22, dmax: 180, box: [-165, 2, -105, -85, 30, -40] });
  V({ name: '家庭滑道区与家庭筏滑道', icon: 'family', num: '10', t: [104, 9, -70], az: 0.32, el: 0.28, d: 72, dmin: 20, dmax: 170, box: [70, 0, -100, 150, 25, -35] });
  V({ name: '水上过山车', icon: 'coaster', num: '11', t: [146, 9, -58], az: 0.95, el: 0.27, d: 86, dmin: 22, dmax: 190, box: [115, 0, -100, 170, 25, -20] });
  V({ name: '冲浪模拟器', icon: 'surf', num: '12', t: [112, 1.0, 17], az: -0.5, el: 0.74, d: 33, dmin: 14, dmax: 110, box: [95, 0, 0, 130, 8, 40] });
  V({ name: '儿童戏水城堡与大水桶', icon: 'castle', num: '13', t: [-108, 6.5, 92], az: 0.62, el: 0.33, d: 50, dmin: 16, dmax: 130, box: [-140, 0, 70, -75, 16, 118] });
  V({ name: '活动池与浮板跳跳', icon: 'climb', num: '14', t: [-112, 1.5, 24], az: 0.18, el: 0.62, d: 50, dmin: 16, dmax: 140, box: [-140, 0, 5, -85, 10, 45] });
  V({ name: '温泉休闲池与私人凉亭', icon: 'spa', num: '15', t: [-114, 2, -18], az: 0.55, el: 0.45, d: 50, dmin: 14, dmax: 130, box: [-140, 0, -40, -85, 8, 5] });
  V({ name: '餐饮街', icon: 'food', num: '16', t: [106, 4, 92], az: 0.34, el: 0.34, d: 58, dmin: 16, dmax: 140, box: [75, 1, 65, 140, 12, 120] });
  V({ name: '塔顶俯瞰', icon: 'sun', num: '17', look: true, pos: [0.0, 39.9, -91.0], yaw: 0, pitch: -0.42, fov: 58 });

  /* ------------------------------------------------------------ switcher UI */
  function iconURL(kind, fg, bg) {
    const s = 32;
    const bits = P.iconBits(kind, 16);
    const cv = document.createElement('canvas');
    cv.width = s; cv.height = s;
    const c = cv.getContext('2d');
    c.fillStyle = bg; c.fillRect(0, 0, s, s);
    c.fillStyle = fg;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (bits.get(x, y)) c.fillRect(x * 2, y * 2, 2, 2);
    return cv.toDataURL();
  }
  C.buildUI = function () {
    const bar = document.createElement('div');
    bar.id = 'vbar';
    const label = document.createElement('div');
    label.id = 'vlabel';
    document.body.appendChild(label);
    C.views.forEach((v, i) => {
      const b = document.createElement('button');
      b.className = 'vbtn';
      b.title = v.num + ' ' + v.name;
      const img = document.createElement('img');
      img.src = iconURL(v.icon, '#1e9be8', '#ffffff');
      img.dataset.on = iconURL(v.icon, '#ffffff', '#1e9be8');
      img.dataset.off = img.src;
      b.appendChild(img);
      const n = document.createElement('span');
      n.className = 'vnum';
      n.textContent = String(i + 1);
      b.appendChild(n);
      b.addEventListener('click', (e) => { e.stopPropagation(); C.go(i); });
      b.addEventListener('mouseenter', () => showLabel(i, true));
      b.addEventListener('mouseleave', () => showLabel(C.current, false));
      bar.appendChild(b);
    });
    document.body.appendChild(bar);
    let hideT = null;
    function showLabel(i, hover) {
      const v = C.views[i];
      label.innerHTML = '<b>' + v.num + '</b>' + v.name;
      label.classList.add('show');
      clearTimeout(hideT);
      if (!hover) hideT = setTimeout(() => label.classList.remove('show'), 2600);
    }
    C.onView = (i) => {
      [...bar.children].forEach((b, k) => {
        b.classList.toggle('on', k === i);
        const img = b.firstChild;
        img.src = k === i ? img.dataset.on : img.dataset.off;
      });
      showLabel(i, false);
    };
    C.onView(C.current);
    addEventListener('keydown', (e) => {
      if (P.exportMode) return;
      const k = e.key;
      if (k >= '1' && k <= '9') C.go(+k - 1);
      else if (k === '0') C.go(9);
      else if (k === 'ArrowRight' || k === ']' || k === 'e' || k === 'E') C.go((C.current + 1) % C.views.length);
      else if (k === 'ArrowLeft' || k === '[' || k === 'q' || k === 'Q') C.go((C.current - 1 + C.views.length) % C.views.length);
    });
    C.setUIVisible = (on) => { bar.style.display = on ? '' : 'none'; label.style.display = on ? '' : 'none'; };
  };
})();

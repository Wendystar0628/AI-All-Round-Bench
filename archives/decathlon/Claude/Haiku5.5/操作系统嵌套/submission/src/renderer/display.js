'use strict';
/*
 * 显示组合：把各系统的显示面（显示节点列表）画成 DOM。
 *
 * - 每个显示面对应一个容器元素；面的版本号变化时才重建它的普通节点。
 * - 嵌套的面（子系统桌面、窗口内容、投送内容）是带键的子容器，保持元素身份，
 *   因此网页视图与三维画布不会因为父级重绘而重新加载。
 * - 节点列表的顺序就是叠放顺序：后出现的节点盖在先出现的节点之上（裁剪由容器的 overflow 完成）。
 */
(function (global) {
  const SVGNS = 'http://www.w3.org/2000/svg';
  const KEYED = { surf: true, web: true, '3d': true };
  let universe = null;
  let hooks = {};
  const webs = new Map();

  function setUniverse(u, h) {
    universe = u;
    hooks = h || {};
  }

  function assetUrl(p) {
    return 'nos://app/' + String(p).replace(/^\/+/, '');
  }

  function setAttr(el, name, value) {
    if (value === undefined || value === null || value === '') el.removeAttribute(name);
    else el.setAttribute(name, String(value));
  }

  function applyCommon(el, n, sys) {
    el.setAttribute('data-system-id', sys.id);
    setAttr(el, 'data-testid', n.tid);
    setAttr(el, 'aria-label', n.lbl);
    setAttr(el, 'data-window-id', n.wid);
    setAttr(el, 'data-app-id', n.ap);
    setAttr(el, 'data-target-system-id', n.tg);
    if (n.da) {
      for (const k of Object.keys(n.da)) setAttr(el, 'data-' + k, n.da[k]);
    }
    el.classList.toggle('hv', !!n.hv);
    el.style.cursor = n.cur || '';
    el.style.boxShadow = n.sh ? '0 8px 22px rgba(30,34,60,.16), 0 1px 3px rgba(30,34,60,.10)' : '';
  }

  function place(el, n) {
    el.style.left = (n.x || 0) + 'px';
    el.style.top = (n.y || 0) + 'px';
    el.style.width = Math.max(0, n.w || 0) + 'px';
    el.style.height = Math.max(0, n.h || 0) + 'px';
  }

  function makeSvgEl(spec) {
    const tag = spec.e || 'path';
    const el = document.createElementNS(SVGNS, tag);
    const map = { f: 'fill', s: 'stroke', sw: 'stroke-width', z: 'font-size', a: 'text-anchor', o: 'opacity', fo: 'font-weight', d: 'd' };
    for (const k of Object.keys(spec)) {
      if (k === 'e') continue;
      if (k === 't') { el.textContent = String(spec.t); continue; }
      el.setAttribute(map[k] || k, String(spec[k]));
    }
    return el;
  }

  function fillSvg(svg, n) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    svg.setAttribute('viewBox', '0 0 ' + Math.max(1, n.w || 1) + ' ' + Math.max(1, n.h || 1));
    for (const spec of n.els || []) svg.appendChild(makeSvgEl(spec));
  }

  function createNode(n, sys) {
    let el;
    switch (n.t) {
      case 'r': {
        el = document.createElement('div');
        el.className = 'nd';
        el.style.background = n.f || 'transparent';
        if (n.s) el.style.border = (n.sw || 1) + 'px solid ' + n.s;
        if (n.r !== undefined && n.r !== null) el.style.borderRadius = n.r + 'px';
        if (n.o !== undefined && n.o !== null) el.style.opacity = n.o;
        break;
      }
      case 't': {
        el = document.createElement('div');
        el.className = 'nd-t al-' + (n.a || 'l');
        const span = document.createElement('span');
        span.textContent = n.s === undefined || n.s === null ? '' : String(n.s);
        span.style.fontSize = (n.z || 13) + 'px';
        span.style.color = n.c || '#1d2233';
        span.style.fontWeight = n.b ? '600' : '400';
        span.style.lineHeight = '1.2';
        el.appendChild(span);
        if (n.o !== undefined && n.o !== null) el.style.opacity = n.o;
        break;
      }
      case 'img': {
        el = document.createElement('img');
        el.className = 'nd-img';
        el.setAttribute('src', assetUrl(n.src));
        el.setAttribute('draggable', 'false');
        break;
      }
      case 'svg': {
        el = document.createElementNS(SVGNS, 'svg');
        el.setAttribute('class', 'nd-svg');
        fillSvg(el, n);
        break;
      }
      default:
        el = document.createElement('div');
        el.className = 'nd';
    }
    applyCommon(el, n, sys);
    place(el, n);
    if (n.t === 't') {
      const span = el.firstChild;
      span.style.color = n.c || '#1d2233';
    }
    return el;
  }

  function createKeyed(n, sys) {
    let el;
    if (n.t === 'surf') {
      el = document.createElement('div');
      el.className = 'surf';
    } else if (n.t === 'web') {
      el = document.createElement('webview');
      el.className = 'nd';
      el.setAttribute('partition', 'persist:nos-web');
      el.setAttribute('allowpopups', 'false');
      attachWebEvents(el);
    } else {
      el = document.createElement('div');
      el.className = 'd3';
      if (hooks.onView3d) hooks.onView3d(el, 'create');
    }
    el._type = n.t;
    return el;
  }

  function attachWebEvents(el) {
    const emit = (ev, extra) => {
      if (!el._owner || el._pid === undefined) return;
      const msg = Object.assign({ to: el._pid, type: 'web', tab: el._tab, ev }, extra || {});
      el._owner.inbox.push(msg);
    };
    el.addEventListener('did-start-loading', () => emit('loading', { loading: true }));
    el.addEventListener('did-stop-loading', () => emit('loading', { loading: false }));
    el.addEventListener('did-navigate', (e) => emit('navigate', { url: e.url }));
    el.addEventListener('did-navigate-in-page', (e) => emit('navigate', { url: e.url }));
    el.addEventListener('page-title-updated', (e) => emit('title', { title: e.title }));
    el.addEventListener('did-fail-load', (e) => {
      if (e.errorCode === -3) return;
      emit('error', { url: e.validatedURL, code: e.errorCode, text: e.errorDescription });
    });
    el.addEventListener('new-window', (e) => emit('new-window', { url: e.url }));
  }

  function updateKeyed(el, n, sys) {
    place(el, n);
    el._sys = sys;
    el._node = n;
    applyCommon(el, n, sys);
    if (n.t === 'surf') {
      el.style.display = n.hid ? 'none' : '';
      const target = universe.get(n.sys);
      el._sys2 = target;
      el._sid = n.id;
      el._targetSysId = n.sys;
      el.setAttribute('data-system-id', n.sys);
      if (n.id === 'desktop') el.setAttribute('data-desk', n.sys);
    } else if (n.t === 'web') {
      el.style.display = '';
      el._hidden = false;
      el._owner = sys;
      el._pid = n.pid;
      el._tab = n.tab;
      el._wkey = sys.id + ':' + n.tab;
      webs.set(el._wkey, el);
      if (n.url && el._url !== n.url) {
        el._url = n.url;
        el.setAttribute('src', n.url);
      }
    } else if (n.t === '3d') {
      if (hooks.onView3d) hooks.onView3d(el, 'update', n, sys);
    }
  }

  // 同步一个容器中的节点列表
  function reconcile(container, nodes, sys) {
    const kids = container._kids || (container._kids = new Map());
    let child = container.firstChild;
    while (child) {
      const next = child.nextSibling;
      if (!child._key) container.removeChild(child);
      child = next;
    }
    const seen = new Set();
    let cursor = container.firstChild;
    for (const n of nodes || []) {
      if (!n || n.t === 'scale') continue;
      let el;
      if (KEYED[n.t]) {
        const key = n.k || n.t + ':' + (n.sys || '') + ':' + (n.id || n.tab || '');
        el = kids.get(key);
        if (el && el._type !== n.t) {
          el.remove();
          kids.delete(key);
          el = null;
        }
        if (!el) {
          el = createKeyed(n, sys);
          el._key = key;
          kids.set(key, el);
        }
        seen.add(key);
        updateKeyed(el, n, sys);
      } else {
        el = createNode(n, sys);
      }
      if (el === cursor) cursor = cursor.nextSibling;
      else container.insertBefore(el, cursor);
    }
    for (const [key, el] of kids) {
      if (seen.has(key)) continue;
      // 网页视图不销毁（切换标签、最小化后页面保持不变），只隐藏
      if (el._type === 'web') { el.style.display = 'none'; el._hidden = true; continue; }
      if (el._type === '3d' && hooks.onView3d) hooks.onView3d(el, 'remove');
      el.remove();
      kids.delete(key);
    }
  }

  // 同步一个面容器（以及其中嵌套的面）。版本未变则不重建。
  function syncSurface(el) {
    const sys = el._sys2;
    const s = sys ? sys.surf[el._sid] : null;
    if (!s) {
      if (el._v !== -1) {
        reconcile(el, [], el._sys);
        el._v = -1;
      }
    } else if (el._v !== s.v || el._sysRef !== sys) {
      reconcile(el, s.nodes, sys);
      el._v = s.v;
      el._sysRef = sys;
    }
    if (el._kids) {
      for (const c of el._kids.values()) {
        if (c._type === 'surf') syncSurface(c);
        else if (c._type === '3d' && hooks.onView3d) hooks.onView3d(c, 'frame');
      }
    }
  }

  // 根桌面：容器 desk 显示根系统的 desktop 面
  function syncRoot(desk, root) {
    if (!desk._sys2 || desk._sys2 !== root) {
      desk._sys2 = root;
      desk._sid = 'desktop';
      desk._v = undefined;
    }
    const s = root.surf.desktop;
    if (s) {
      const scaleNode = (s.nodes || []).find((n) => n.t === 'scale');
      if (hooks.onScale) hooks.onScale(scaleNode ? scaleNode.v : 1);
    }
    if (!desk._kids || desk._v !== (s && s.v) || desk._sysRef !== root) {
      if (s) {
        reconcile(desk, s.nodes, root);
        desk._v = s.v;
        desk._sysRef = root;
      }
    }
    if (desk._kids) {
      for (const c of desk._kids.values()) {
        if (c._type === 'surf') syncSurface(c);
        else if (c._type === '3d' && hooks.onView3d) hooks.onView3d(c, 'frame');
      }
    }
  }

  // 网页视图的导航操作（由自动化与浏览器程序通过内核转交）
  global.NOSWeb = {
    op(sys, op, tab) {
      const el = webs.get(sys.id + ':' + tab);
      if (!el) return false;
      try {
        if (op === 'back') el.goBack();
        else if (op === 'forward') el.goForward();
        else if (op === 'reload') el.reload();
        else if (op === 'stop') el.stop();
      } catch (e) { console.warn('web op failed', op, e); }
      return true;
    },
  };

  global.NOSDisplay = { setUniverse, syncRoot, reconcile, syncSurface };
})(window);

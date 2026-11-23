(function () {
  const U = {
    el(tag, props, children) {
      const e = document.createElement(tag);
      if (props) {
        for (const k in props) {
          const v = props[k];
          if (v === null || v === undefined) continue;
          if (k === 'class') e.className = v;
          else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
          else if (k === 'html') e.innerHTML = v;
          else if (k === 'text') e.textContent = v;
          else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
          else if (k === 'dataset') { for (const d in v) if (v[d] !== null && v[d] !== undefined) e.dataset[d] = v[d]; }
          else if (k in e && typeof v !== 'string') { try { e[k] = v; } catch (err) { e.setAttribute(k, v); } }
          else e.setAttribute(k, v);
        }
      }
      if (children) {
        (Array.isArray(children) ? children : [children]).forEach((c) => {
          if (c === null || c === undefined) return;
          e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
        });
      }
      return e;
    },
    esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    },
    clamp(v, a, b) { return v < a ? a : v > b ? b : v; },
    uid(p) { return (p || 'w') + '-' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4); },
    fmtBytes(n) {
      n = Number(n) || 0;
      if (n < 1024) return n + ' B';
      if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
      return (n / 1024 / 1024).toFixed(2) + ' MB';
    },
    fmtInt(n) { return Number(n || 0).toLocaleString('zh-CN'); },
    pad(n, w) { let s = String(n); while (s.length < (w || 2)) s = '0' + s; return s; },
    fmtTime(d) {
      d = d || new Date();
      return U.pad(d.getHours()) + ':' + U.pad(d.getMinutes());
    },
    fmtClock(d) {
      d = d || new Date();
      return U.pad(d.getHours()) + ':' + U.pad(d.getMinutes()) + ':' + U.pad(d.getSeconds());
    },
    fmtDate(d) {
      d = d || new Date();
      return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
    },
    fmtDur(sec) {
      sec = Math.max(0, Number(sec) || 0);
      const m = Math.floor(sec / 60), s = sec - m * 60;
      return (m > 0 ? m + ':' : '') + (s < 10 && m > 0 ? '0' : '') + s.toFixed(2);
    },
    debounce(fn, ms) {
      let t = null;
      return function () {
        const args = arguments, self = this;
        clearTimeout(t);
        t = setTimeout(() => fn.apply(self, args), ms);
      };
    },
    deepClone(o) { return o === undefined ? undefined : JSON.parse(JSON.stringify(o)); },
    copyText(text) {
      // 剪贴板：优先 Electron 剪贴板，其次浏览器 API
      try {
        if (window.require) {
          const { clipboard } = window.require('electron');
          clipboard.writeText(String(text));
          return true;
        }
      } catch (e) { /* ignore */ }
      try {
        const ta = document.createElement('textarea');
        ta.value = String(text); ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
      } catch (e) { return false; }
    },
    readText() {
      try {
        if (window.require) {
          const { clipboard } = window.require('electron');
          return clipboard.readText();
        }
      } catch (e) { /* ignore */ }
      return '';
    },
    colorMix(a, b, t) {
      const pa = a.match(/\w\w/g).map((x) => parseInt(x, 16));
      const pb = b.match(/\w\w/g).map((x) => parseInt(x, 16));
      const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
      return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
    }
  };
  U.projectRoot = function () {
    try {
      if (typeof window !== 'undefined' && window.location && window.location.protocol === 'file:') {
        const p = decodeURIComponent(window.location.pathname).replace(/^\/(?:[A-Za-z]:)/, (m) => m.slice(1));
        return window.require('path').join(window.require('path').dirname(p), '..');
      }
    } catch (e) { /* ignore */ }
    return (typeof process !== 'undefined' && process.cwd) ? process.cwd() : '.';
  };
  window.U = U;
})();

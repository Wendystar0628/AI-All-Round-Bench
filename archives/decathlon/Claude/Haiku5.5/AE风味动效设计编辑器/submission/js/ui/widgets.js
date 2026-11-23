/* 控件：数值（可拖拽微调、可输入算式）、颜色、下拉、复选、文本；以及属性行（秒表 / 关键帧 / 表达式）。 */
(function () {
  'use strict';
  const AE = (window.AE = window.AE || {});
  const UI = AE.UI;
  const U = AE.U;
  const Anim = AE.Anim;
  const Model = AE.Model;
  const App = AE.App;
  const E = UI.el;

  // ---------- 写入属性（经由撤销栈） ----------
  // 设置属性在当前时间的值：动画属性写关键帧，静态属性直接改值
  UI.writeProp = (layer, prop, value, label) => {
    const t = App.state.time;
    App.mutate(label || '修改属性', () => {
      const lay = App.layer(layer.id);
      const pr = findProp(lay, prop.id);
      if (!pr) return;
      Anim.write(lay, pr, t - (lay.startTime || 0), value);
    });
  };
  // 连续写入（拖动 / 滚动）：实时更新，松开时入栈
  UI.liveProp = (layer, prop, value) => {
    const t = App.state.time;
    const lay = App.layer(layer.id);
    const pr = findProp(lay, prop.id);
    if (!pr) return;
    Anim.write(lay, pr, t - (lay.startTime || 0), value);
    App.liveChange();
  };
  // 在项目内按 id 查找属性（包含形状内容、效果、蒙版等嵌套位置）
  function findProp(layer, id) {
    let found = null;
    const visit = (o) => {
      if (found || !o || typeof o !== 'object') return;
      if (Array.isArray(o)) return o.forEach(visit);
      if (o.kind && o.id === id && 'v' in o) {
        found = o;
        return;
      }
      Object.keys(o).forEach((k) => visit(o[k]));
    };
    visit(layer);
    return found;
  }
  UI.findProp = findProp;

  // ---------- 数值输入 ----------
  // opts: { value, min, max, step, decimals, suffix, onSet(v), onLive(v), onBegin(), onEnd(), width }
  UI.num = (opts) => {
    const dec = opts.decimals === undefined ? 2 : opts.decimals;
    const fmtV = (v) => (Number.isFinite(v) ? Number(v.toFixed(dec)).toString() : '0');
    const inp = E('input', { class: 'num', type: 'text', spellcheck: 'false', value: fmtV(opts.value), title: opts.title || '' });
    if (opts.width) inp.style.width = opts.width;
    inp.dataset.fmt = '1';
    const commit = () => {
      const txt = inp.value.trim();
      let v;
      try {
        v = Function('"use strict"; return (' + txt.replace(/[^0-9+\-*/().eE%\s]/g, '') + ');')();
      } catch (e) {
        v = parseFloat(txt);
      }
      if (!Number.isFinite(v)) {
        inp.value = fmtV(opts.value);
        return;
      }
      if (opts.min !== undefined) v = Math.max(opts.min, v);
      if (opts.max !== undefined) v = Math.min(opts.max, v);
      opts.onSet && opts.onSet(v);
    };
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        commit();
        inp.blur();
      } else if (e.key === 'Escape') {
        inp.value = fmtV(opts.value);
        inp.blur();
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const st = (opts.step || 1) * (e.shiftKey ? 10 : 1) * (e.key === 'ArrowUp' ? 1 : -1);
        let v = parseFloat(inp.value) + st;
        if (opts.min !== undefined) v = Math.max(opts.min, v);
        if (opts.max !== undefined) v = Math.min(opts.max, v);
        opts.onSet && opts.onSet(v);
      }
      e.stopPropagation();
    });
    inp.addEventListener('blur', commit);
    inp.addEventListener('focus', () => inp.select());
    // 拖拽调整：按住输入框向左右拖动
    let drag = null;
    inp.addEventListener('mousedown', (e) => {
      if (document.activeElement === inp) return;
      drag = { x: e.clientX, v: parseFloat(inp.value) || 0, moved: false };
      const move = (ev) => {
        if (!drag) return;
        const dx = ev.clientX - drag.x;
        if (!drag.moved && Math.abs(dx) < 3) return;
        if (!drag.moved) {
          drag.moved = true;
          opts.onBegin && opts.onBegin();
        }
        const base = opts.step || 1;
        let v = drag.v + dx * base * (ev.shiftKey ? 0.1 : 1);
        if (opts.min !== undefined) v = Math.max(opts.min, v);
        if (opts.max !== undefined) v = Math.min(opts.max, v);
        inp.value = fmtV(v);
        opts.onLive ? opts.onLive(v) : opts.onSet && opts.onSet(v);
      };
      const up = () => {
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
        if (drag && drag.moved) opts.onEnd && opts.onEnd();
        drag = null;
      };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    });
    inp.refresh = (v) => {
      if (document.activeElement !== inp) inp.value = fmtV(v);
      opts.value = v;
    };
    return inp;
  };

  UI.select = (options, value, onSet) => {
    const s = E('select', { class: 'sel' }, options.map(([v, label]) => E('option', { value: v, selected: v === value }, label)));
    s.value = value;
    s.addEventListener('change', () => onSet && onSet(s.value));
    return s;
  };
  UI.check = (checked, onSet, label) => {
    const c = E('input', { type: 'checkbox', checked: !!checked });
    c.addEventListener('change', () => onSet && onSet(c.checked));
    return E('label', { class: 'chk' }, [c, label ? E('span', { text: label }) : null]);
  };
  UI.color = (rgb, onLive, onSet) => {
    const c = E('input', { type: 'color', class: 'color', value: UI.rgbToHex(rgb) });
    c.addEventListener('input', () => onLive && onLive(UI.hexToRgb(c.value)));
    c.addEventListener('change', () => onSet && onSet(UI.hexToRgb(c.value)));
    return c;
  };
  UI.textInput = (value, onSet, opts) => {
    const i = E('input', { type: 'text', class: 'txt', value: value || '' });
    if (opts && opts.placeholder) i.placeholder = opts.placeholder;
    i.addEventListener('change', () => onSet && onSet(i.value));
    i.addEventListener('keydown', (e) => e.stopPropagation());
    return i;
  };

  // ---------- 属性行 ----------
  // 关键帧所在的图层本地时间
  const ltOf = (layer) => App.state.time - (layer.startTime || 0);
  const EPS = 1e-4;

  // 属性行：[秒表][名称][◀ ◆ ▶][数值][fx]
  // opts: { label, layer, prop, kind (num|vec|color|bool|enum|text|path), min, max, step, decimals, suffix, options, n (vec 维数), mutedLabel }
  UI.propRow = (opts) => {
    const layer = opts.layer, prop = opts.prop;
    const row = E('div', { class: 'prow' + (prop.expr ? ' has-expr' : '') });
    const watch = E('button', {
      class: 'watch' + (prop.animated ? ' on' : ''),
      title: prop.animated ? '关闭动画（保留当前值）' : '开启动画（记录关键帧）',
      onclick: () => {
        const lt = ltOf(layer);
        App.mutate(prop.animated ? '关闭动画' : '开启动画', () => {
          const lay = App.layer(layer.id);
          const pr = findProp(lay, prop.id);
          if (!pr) return;
          if (pr.animated) Anim.disable(pr, lt);
          else Anim.enable(pr, lt, Anim.keyValue(pr, lt));
        });
      },
    }, UI.ICON.watch);
    const label = E('span', { class: 'plabel', text: opts.label || '', title: opts.label || '' });
    // 关键帧导航
    const keyTimes = () => (prop.animated ? prop.keys.map((k) => k.t) : []);
    const onKey = () => prop.animated && prop.keys.some((k) => Math.abs(k.t - ltOf(layer)) < EPS);
    const prevBtn = E('button', { class: 'kbtn', title: '上一个关键帧', onclick: () => jump(-1) }, UI.ICON.stepB);
    const diamond = E('button', {
      class: 'kbtn diamond' + (prop.animated && onKey() ? ' on' : ''),
      title: '在当前时间添加或删除关键帧',
      onclick: () => {
        if (!prop.animated) return App.toast('先开启动画（秒表）');
        const lt = ltOf(layer);
        App.mutate('关键帧', () => {
          const lay = App.layer(layer.id);
          const pr = findProp(lay, prop.id);
          const idx = pr.keys.findIndex((k) => Math.abs(k.t - lt) < EPS);
          if (idx >= 0) pr.keys.splice(idx, 1);
          else Anim.setKey(pr, lt, Anim.keyValue(pr, lt));
          if (!pr.keys.length) pr.animated = false;
        });
      },
    }, UI.ICON.key);
    const nextBtn = E('button', { class: 'kbtn', title: '下一个关键帧', onclick: () => jump(1) }, UI.ICON.stepF);
    function jump(dir) {
      const lt = ltOf(layer);
      const ks = keyTimes();
      let target = null;
      if (dir < 0) target = ks.filter((t) => t < lt - EPS).sort((a, b) => b - a)[0];
      else target = ks.filter((t) => t > lt + EPS).sort((a, b) => a - b)[0];
      if (target !== undefined) App.setTime(target + (layer.startTime || 0));
    }
    const fxBtn = E('button', {
      class: 'fxbtn' + (prop.expr ? ' on' : ''),
      title: '表达式（点击展开编辑）',
      onclick: () => {
        App.state.selProp = { layer: layer.id, prop: prop.id, label: opts.label || '' };
        App.state.rightTab = 'expr';
        UI.focusExpr && UI.focusExpr();
        App.notify();
      },
    }, UI.ICON.fx);
    const val = E('div', { class: 'pval' });
    const widgets = valueWidgets(opts, layer, prop, val);
    widgets.forEach((w) => val.appendChild(w));
    row.append(watch, label, E('div', { class: 'kgroup' }, [prevBtn, diamond, nextBtn]), val, fxBtn);
    row.dataset.prop = prop.id;
    // 刷新：保持与时间同步
    row.refresh = () => {
      const cur = Anim.value(App.comp(), layer, prop, App.state.time);
      widgets.forEach((w) => w.refresh && w.refresh(cur));
      diamond.classList.toggle('on', !!(prop.animated && onKey()));
      watch.classList.toggle('on', !!prop.animated);
      fxBtn.classList.toggle('on', !!prop.expr);
      row.classList.toggle('has-expr', !!prop.expr);
      const err = AE.Expr && AE.Expr.errors.get(prop.id);
      row.classList.toggle('expr-err', !!err);
      row.title = err || '';
    };
    row.refresh();
    return row;
  };

  // 属性的值控件
  function valueWidgets(opts, layer, prop, host) {
    const kind = prop.kind;
    const cur = () => Anim.value(App.comp(), layer, prop, App.state.time);
    const writer = (v) => UI.writeProp(layer, prop, v, '修改 ' + (opts.label || ''));
    const liveW = (v) => UI.liveProp(layer, prop, v);
    if (kind === 'num') {
      const w = UI.num({
        value: cur(),
        min: opts.min,
        max: opts.max,
        step: opts.step || 1,
        decimals: opts.decimals === undefined ? 1 : opts.decimals,
        onSet: writer,
        onLive: liveW,
        onBegin: () => App.beginAction(),
        onEnd: () => App.endAction('拖动 ' + (opts.label || '')),
        width: opts.width || '74px',
      });
      if (opts.suffix) return [w, E('span', { class: 'unit', text: opts.suffix })];
      return [w];
    }
    if (kind === 'vec' || kind === 'color') {
      const v = cur();
      if (kind === 'color') {
        const c = UI.color(v, (rgb) => {
          App.beginAction();
          liveW(rgb);
        }, (rgb) => {
          liveW(rgb);
          App.endAction('颜色 ' + (opts.label || ''));
        });
        c.refresh = (val) => {
          if (document.activeElement !== c) c.value = UI.rgbToHex(val);
        };
        return [c];
      }
      const n = v.length;
      const names = n === 3 ? ['X', 'Y', 'Z'] : ['X', 'Y'];
      const fields = [];
      for (let i = 0; i < n; i++) {
        const idx = i;
        const w = UI.num({
          value: v[i],
          step: opts.step || 1,
          decimals: opts.decimals === undefined ? 1 : opts.decimals,
          title: names[i],
          width: '62px',
          onSet: (x) => {
            const nv = cur().slice();
            nv[idx] = x;
            writer(nv);
          },
          onLive: (x) => {
            const nv = cur().slice();
            nv[idx] = x;
            liveW(nv);
          },
          onBegin: () => App.beginAction(),
          onEnd: () => App.endAction('拖动 ' + (opts.label || '')),
        });
        fields.push(w);
      }
      const wrap = E('div', { class: 'vecw' }, fields.flatMap((f, i) => [E('span', { class: 'axis', text: names[i] }), f]));
      wrap.refresh = (val) => {
        fields.forEach((f, i) => f.refresh && f.refresh(val[i]));
      };
      return [wrap];
    }
    if (kind === 'bool') {
      const c = E('input', { type: 'checkbox', checked: !!cur() });
      c.addEventListener('change', () => writer(c.checked));
      c.refresh = (val) => (c.checked = !!val);
      return [c];
    }
    if (kind === 'enum') {
      const s = UI.select(opts.options.map((o) => [o[0], o[1]]), cur(), (v) => writer(v));
      s.refresh = (val) => {
        if (document.activeElement !== s) s.value = val;
      };
      return [s];
    }
    if (kind === 'text') {
      const t = UI.textInput(cur(), (v) => writer(v));
      t.refresh = (val) => {
        if (document.activeElement !== t) t.value = val;
      };
      return [t];
    }
    // 路径：只显示数量
    return [E('span', { class: 'muted', text: (prop.v || []).length + ' 个路径' })];
  }

  // 大段数值的小标签
  UI.section = (title, body, opts) => {
    const open = !(opts && opts.collapsed);
    const head = E('div', { class: 'sec-head', onclick: () => {
      sec.classList.toggle('closed');
    } }, [E('span', { class: 'caret', text: '▾' }), E('span', { text: title })]);
    const sec = E('div', { class: 'sec' + (open ? '' : ' closed') }, [head, E('div', { class: 'sec-body' }, body)]);
    return sec;
  };
  UI.Model = Model;
})();

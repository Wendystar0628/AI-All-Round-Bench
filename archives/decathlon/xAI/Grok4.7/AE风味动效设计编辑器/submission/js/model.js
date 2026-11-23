/* Project model: layers, keyframes, parenting, evaluation, undo. */
(function (G) {
  const AE = (G.AE = G.AE || {});
  const M = AE.math;

  let SEQ = 1;
  function uid(prefix) { return (prefix || "id") + (SEQ++).toString(36); }
  function clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }

  function makeProp(dim, value, extra) {
    return {
      id: uid("p"),
      dim,
      value: clone(value),
      animated: false,
      keys: [],
      expression: "",
      exprMode: "replace",
      spatial: !!(extra && extra.spatial),
      seed: (extra && extra.seed) || ((Math.random() * 1e9) | 0),
      lastError: "",
    };
  }
  function makeKey(t, v, interp) {
    return {
      t,
      v: clone(v),
      outInterp: interp || "bezier",
      easeOut: { x: 0.33, y: interp === "linear" ? 0.33 : 0.33 },
      easeIn: { x: 0.67, y: 0.67 },
      spatial: "bezier",
      spatialIn: null,
      spatialOut: null,
      corner: false,
    };
  }

  function sampleKeys(prop, time) {
    if (!prop) return 0;
    const keys = prop.keys;
    if (!prop.animated || !keys || keys.length === 0) return clone(prop.value);
    if (time <= keys[0].t) return clone(keys[0].v);
    const last = keys[keys.length - 1];
    if (time >= last.t) return clone(last.v);
    let lo = 0, hi = keys.length - 1;
    while (lo + 1 < hi) {
      const m = (lo + hi) >> 1;
      if (keys[m].t <= time) lo = m; else hi = m;
    }
    const a = keys[lo], b = keys[hi];
    if (a.outInterp === "hold") return clone(a.v);
    const dt = b.t - a.t || 1e-6;
    const u = M.clamp((time - a.t) / dt, 0, 1);
    let frac = u;
    if (a.outInterp === "bezier") {
      const x1 = (a.easeOut && a.easeOut.x != null) ? a.easeOut.x : 1 / 3;
      const x2 = (b.easeIn && b.easeIn.x != null) ? b.easeIn.x : 2 / 3;
      const y1 = (a.easeOut && a.easeOut.y != null) ? a.easeOut.y : 1 / 3;
      const y2 = (b.easeIn && b.easeIn.y != null) ? b.easeIn.y : 2 / 3;
      const s = M.solveBezierX(u, M.clamp(x1, 0.001, 0.999), M.clamp(x2, 0.001, 0.999));
      frac = M.bezierY(s, y1, y2);
    }
    if (prop.spatial) return spatialAt(a, b, frac);
    return M.lerpN(normDim(a.v, prop.dim), normDim(b.v, prop.dim), frac);
  }
  function normDim(v, dim) {
    if (dim <= 1) return typeof v === "number" ? v : (Array.isArray(v) ? v[0] : 0);
    const a = Array.isArray(v) ? v.slice() : [typeof v === "number" ? v : 0];
    while (a.length < dim) a.push(a[a.length - 1] || 0);
    a.length = dim;
    return a;
  }
  function distN(a, b) {
    let s = 0;
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) { const d = (a[i] || 0) - (b[i] || 0); s += d * d; }
    return Math.sqrt(s);
  }
  function spatialAt(a, b, frac) {
    const p0 = normDim(a.v, 3), p1 = normDim(b.v, 3);
    if (a.spatial === "linear") return M.lerpN(p0, p1, frac);
    const so = a.spatialOut || autoOut(a, b);
    const si = b.spatialIn || [0, 0, 0];
    const c1 = p0.map((v, i) => v + (so[i] || 0));
    const c2 = p1.map((v, i) => v + (si[i] || 0));
    const steps = 16;
    const pts = [];
    for (let i = 0; i <= steps; i++) pts.push(M.bezier3n(p0, c1, c2, p1, i / steps));
    const acc = [0];
    for (let i = 1; i <= steps; i++) acc.push(acc[i - 1] + distN(pts[i], pts[i - 1]));
    const total = acc[steps] || 1;
    const target = M.clamp(frac, 0, 1) * total;
    let k = 1;
    while (k < steps && acc[k] < target) k++;
    const span = (acc[k] - acc[k - 1]) || 1;
    const local = (target - acc[k - 1]) / span;
    const s = ((k - 1) + local) / steps;
    return M.bezier3n(p0, c1, c2, p1, s);
  }
  function autoOut(a, b) {
    const p0 = normDim(a.v, 3), p1 = normDim(b.v, 3);
    return p1.map((v, i) => (v - p0[i]) * 0.25);
  }

  function findComp(project, id) { return project.comps.find((c) => c.id === id) || null; }
  function findLayer(project, id) {
    for (const c of project.comps) {
      const l = c.layers.find((x) => x.id === id);
      if (l) return { comp: c, layer: l };
    }
    return null;
  }
  function compOfLayer(project, layer) {
    for (const c of project.comps) if (c.layers.indexOf(layer) >= 0) return c;
    return null;
  }

  function makeCtx(project, comp, time) {
    return { project, comp, time, memo: new Map(), vis: new Set(), wm: new Map(), wvis: new Set(), errors: [] };
  }

  function readPropAt(project, layer, prop, time, ctx) {
    const comp = compOfLayer(project, layer) || ctx.comp;
    if (!ctx || ctx.time !== time || ctx.comp !== comp) {
      const sub = makeCtx(project, comp, time);
      sub.memo = ctx ? ctx.memo : sub.memo;
      sub.vis = ctx ? ctx.vis : sub.vis;
      sub.wm = ctx ? ctx.wm : sub.wm;
      sub.wvis = ctx ? ctx.wvis : sub.wvis;
      return evalProp(project, comp, layer, prop, time, sub);
    }
    return evalProp(project, comp, layer, prop, time, ctx);
  }

  function evalProp(project, comp, layer, prop, time, ctx) {
    if (!prop) return 0;
    const key = prop.id + "@" + time.toFixed(5);
    if (ctx.memo.has(key)) return ctx.memo.get(key);
    if (ctx.vis.has(key)) {
      prop.lastError = "表达式循环引用";
      const fb = sampleKeys(prop, time);
      ctx.memo.set(key, fb);
      return fb;
    }
    ctx.vis.add(key);
    const base = sampleKeys(prop, time);
    let result = base;
    prop.lastError = "";
    if (prop.expression && String(prop.expression).trim()) {
      try {
        const ev = AE.expr.evaluate(prop.expression, {
          time,
          value: normDim(base, prop.dim),
          prop,
          layer,
          comp,
          project,
          readProp(ref, t) {
            return readPropAt(project, ref.layer, ref.prop, t, ctx);
          },
          compOf(l) { return compOfLayer(project, l) || comp; },
        });
        const coerced = normDim(ev, prop.dim);
        result = prop.exprMode === "add" ? M.addN(normDim(base, prop.dim), coerced) : coerced;
        if (prop.dim <= 1 && Array.isArray(result)) result = result[0];
      } catch (err) {
        prop.lastError = err.message || String(err);
        result = base;
        ctx.errors.push({ layer: layer.name, prop: prop.id, message: prop.lastError });
      }
    }
    ctx.vis.delete(key);
    ctx.memo.set(key, result);
    return result;
  }

  function num(project, comp, layer, key, time, ctx) {
    const p = layer.props[key];
    if (!p) return 0;
    const v = evalProp(project, comp, layer, p, time, ctx);
    return typeof v === "number" ? v : (Array.isArray(v) ? v[0] || 0 : 0);
  }
  function vec(project, comp, layer, key, time, ctx, dim) {
    const p = layer.props[key];
    if (!p) return new Array(dim).fill(0);
    return normDim(evalProp(project, comp, layer, p, time, ctx), dim);
  }

  function localMatrix(project, comp, layer, time, ctx) {
    const pos = vec(project, comp, layer, "transform.position", time, ctx, 3);
    const anc = vec(project, comp, layer, "transform.anchor", time, ctx, 3);
    const sc = vec(project, comp, layer, "transform.scale", time, ctx, 3);
    const rx = num(project, comp, layer, "transform.rotationX", time, ctx);
    const ry = num(project, comp, layer, "transform.rotationY", time, ctx);
    const rz = num(project, comp, layer, "transform.rotationZ", time, ctx) + num(project, comp, layer, "transform.rotation", time, ctx);
    return M.trs(pos, [rx, ry, rz], sc, anc);
  }
  function worldMatrix(project, comp, layer, time, ctx) {
    const k = layer.id + "@" + time.toFixed(5);
    if (ctx.wm.has(k)) return ctx.wm.get(k);
    if (ctx.wvis.has(layer.id)) return M.id4();
    ctx.wvis.add(layer.id);
    const local = localMatrix(project, comp, layer, time, ctx);
    let world = local;
    if (layer.parentId) {
      const parent = comp.layers.find((l) => l.id === layer.parentId);
      if (parent && parent !== layer) world = M.mul4(worldMatrix(project, comp, parent, time, ctx), local);
    }
    ctx.wvis.delete(layer.id);
    ctx.wm.set(k, world);
    return world;
  }

  function setParent(project, comp, layer, parentId, time) {
    const ctx = makeCtx(project, comp, time);
    const world = worldMatrix(project, comp, layer, time, ctx);
    const anchor = vec(project, comp, layer, "transform.anchor", time, ctx, 3);
    layer.parentId = parentId || null;
    const parent = parentId ? comp.layers.find((l) => l.id === parentId) : null;
    const parentWorld = parent ? worldMatrix(project, comp, parent, time, makeCtx(project, comp, time)) : M.id4();
    // Recompute parent world without this layer's cache from the old ctx.
    const pw = parent ? worldMatrix(project, comp, parent, time, makeCtx(project, comp, time)) : M.id4();
    void parentWorld;
    const local = M.mul4(M.invert4(pw), world);
    const noAnchor = M.mul4(local, M.trans4(anchor[0], anchor[1], anchor[2]));
    const dec = M.decomposeTRS(noAnchor);
    writeProp(comp, layer, "transform.position", dec.position, time);
    writeProp(comp, layer, "transform.rotationX", dec.rotation[0], time);
    writeProp(comp, layer, "transform.rotationY", dec.rotation[1], time);
    writeProp(comp, layer, "transform.rotationZ", dec.rotation[2], time);
    writeProp(comp, layer, "transform.rotation", 0, time);
    writeProp(comp, layer, "transform.scale", dec.scale, time);
  }

  function writeProp(comp, layer, key, value, time) {
    const prop = layer.props[key];
    if (!prop) return;
    const v = normDim(value, prop.dim);
    if (!prop.animated) { prop.value = prop.dim <= 1 ? (Array.isArray(v) ? v[0] : v) : v; return; }
    const fps = comp.fps || 30;
    const eps = 0.5 / fps;
    let k = null;
    for (const keyf of prop.keys) if (Math.abs(keyf.t - time) <= eps) { k = keyf; break; }
    if (!k) {
      k = makeKey(time, v, "linear");
      k.outInterp = "bezier";
      k.easeOut = { x: 0.33, y: 0.33 };
      k.easeIn = { x: 0.67, y: 0.67 };
      prop.keys.push(k);
      prop.keys.sort((a, b) => a.t - b.t);
      refreshSpatial(prop);
    } else {
      k.v = prop.dim <= 1 ? (Array.isArray(v) ? v[0] : v) : v;
    }
  }

  function refreshSpatial(prop) {
    if (!prop.spatial) return;
    const keys = prop.keys;
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (k.corner || k.spatial === "linear") {
        if (!k.spatialOut) k.spatialOut = [0, 0, 0];
        if (!k.spatialIn) k.spatialIn = [0, 0, 0];
        continue;
      }
      const prev = keys[i - 1], next = keys[i + 1];
      const p = normDim(k.v, 3);
      if (prev && next && !k.corner) {
        const a = normDim(prev.v, 3), b = normDim(next.v, 3);
        const tan = b.map((v, d) => (v - a[d]) * 0.2);
        if (!k._spatialTouched) {
          k.spatialOut = tan;
          k.spatialIn = tan.map((v) => -v);
        }
      } else if (!k._spatialTouched) {
        k.spatialOut = [0, 0, 0];
        k.spatialIn = [0, 0, 0];
      }
    }
  }

  function easyEase(prop, indices) {
    const set = new Set(indices);
    prop.keys.forEach((k, i) => {
      if (!set.has(i)) return;
      k.outInterp = "bezier";
      k.easeOut = { x: 0.33, y: 0.05 };
      k.easeIn = { x: 0.67, y: 0.95 };
      if (i + 1 < prop.keys.length) prop.keys[i].outInterp = "bezier";
    });
  }

  function baseLayer(comp, type, name) {
    const layer = {
      id: uid("L"),
      name: name || type,
      type,
      enabled: true,
      locked: false,
      threeD: type === "mesh" || type === "camera" || type === "light" || type === "particle",
      parentId: null,
      inPoint: 0,
      outPoint: comp.duration,
      startTime: 0,
      stretch: 1,
      timeRemap: false,
      blend: "normal",
      motionBlur: false,
      trackMatte: null,
      castShadow: type === "mesh",
      receiveShadow: type === "mesh",
      props: {},
      masks: [],
      effects: [],
      shape: null,
      text: null,
      mesh: null,
      particle: null,
      audio: null,
      light: null,
      camera: null,
      precompId: null,
    };
    const P = (k, dim, v, extra) => { layer.props[k] = makeProp(dim, v, extra); };
    P("transform.anchor", 3, [0, 0, 0]);
    P("transform.position", 3, [0, 0, 0], { spatial: true });
    P("transform.scale", 3, [1, 1, 1]);
    P("transform.rotation", 1, 0);
    P("transform.rotationX", 1, 0);
    P("transform.rotationY", 1, 0);
    P("transform.rotationZ", 1, 0);
    P("transform.opacity", 1, 1);
    P("timeRemap", 1, 0);
    return layer;
  }

  function addEffect(layer, type, name) {
    const ef = { id: uid("E"), type, name: name || type, enabled: true, props: {} };
    const P = (k, dim, v) => { ef.props[k] = makeProp(dim, v); };
    if (type === "slider") P("value", 1, 0);
    if (type === "blur") { P("radius", 1, 8); }
    if (type === "glow") { P("threshold", 1, 0.6); P("radius", 1, 16); P("intensity", 1, 0.8); }
    if (type === "shadow") { P("distance", 1, 12); P("angle", 1, -45); P("radius", 1, 10); P("opacity", 1, 0.6); P("color", 3, [0, 0, 0]); }
    if (type === "hsl") { P("hue", 1, 0); P("saturation", 1, 0); P("brightness", 1, 0); }
    layer.effects.push(ef);
    return ef;
  }

  function createComp(project, opts) {
    const c = {
      id: uid("C"),
      name: (opts && opts.name) || "合成 " + (project.comps.length + 1),
      width: (opts && opts.width) || 1920,
      height: (opts && opts.height) || 1080,
      fps: (opts && opts.fps) || 30,
      duration: (opts && opts.duration) || 10,
      workStart: 0,
      workEnd: (opts && opts.duration) || 10,
      bg: (opts && opts.bg) || [0.05, 0.035, 0.03, 1],
      motionBlur: { enabled: false, shutter: 180, phase: 0, samples: 5 },
      layers: [],
      fields: [],
    };
    project.comps.push(c);
    if (!project.activeCompId) project.activeCompId = c.id;
    return c;
  }

  function createLayer(project, comp, type, name) {
    const layer = baseLayer(comp, type, name);
    if (type === "shape") {
      layer.shape = { items: [], opOrder: ["merge", "trim", "repeater"] };
    } else if (type === "text") {
      layer.text = { source: "文字", font: "Noto Sans SC Bold", align: "center", animators: [] };
      layer.props["text.size"] = makeProp(1, 180);
      layer.props["text.tracking"] = makeProp(1, 0);
      layer.props["text.leading"] = makeProp(1, 1.25);
      layer.props["text.fill"] = makeProp(3, [1, 0.85, 0.7]);
      layer.props["text.strokeWidth"] = makeProp(1, 0);
      layer.props["text.stroke"] = makeProp(3, [1, 0.4, 0.1]);
    } else if (type === "camera") {
      layer.camera = { active: true };
      layer.props["transform.position"].value = [0, 0, 1600];
      layer.props["camera.target"] = makeProp(3, [0, 0, 0], { spatial: true });
      layer.props["camera.fov"] = makeProp(1, 32);
      layer.props["camera.focus"] = makeProp(1, 1600);
      layer.props["camera.aperture"] = makeProp(1, 0);
    } else if (type === "light") {
      layer.light = { lightType: "directional", shadow: true };
      layer.props["light.color"] = makeProp(3, [1, 0.9, 0.8]);
      layer.props["light.intensity"] = makeProp(1, 2);
      layer.props["transform.rotationX"].value = -50;
      layer.props["transform.rotationY"].value = 30;
    } else if (type === "mesh") {
      layer.mesh = { source: { kind: "box", size: [200, 200, 200] }, material: {} };
      layer.props["material.color"] = makeProp(3, [0.8, 0.75, 0.7]);
      layer.props["material.metallic"] = makeProp(1, 0.9);
      layer.props["material.roughness"] = makeProp(1, 0.35);
      layer.props["material.emissive"] = makeProp(3, [0, 0, 0]);
      layer.props["material.emissiveIntensity"] = makeProp(1, 0);
      layer.props["material.opacity"] = makeProp(1, 1);
      layer.props["mesh.depth"] = makeProp(1, 80);
      layer.props["mesh.bevel"] = makeProp(1, 6);
      layer.props["mesh.bevelSize"] = makeProp(1, 4);
      layer.props["mesh.bend"] = makeProp(1, 0);
      layer.props["mesh.twist"] = makeProp(1, 0);
    } else if (type === "particle") {
      layer.particle = {
        emitter: "point",
        source: null,
        color0: [1, 0.55, 0.15],
        color1: [0.4, 0.05, 0.02],
        collide: [],
        trail: { length: 6, width: 2, fade: 1 },
        seed: 7,
      };
      layer.props["particle.rate"] = makeProp(1, 40);
      layer.props["particle.speed"] = makeProp(1, 180);
      layer.props["particle.speedVar"] = makeProp(1, 40);
      layer.props["particle.life"] = makeProp(1, 1.2);
      layer.props["particle.lifeVar"] = makeProp(1, 0.3);
      layer.props["particle.drag"] = makeProp(1, 0.4);
      layer.props["particle.size0"] = makeProp(1, 6);
      layer.props["particle.size1"] = makeProp(1, 1);
      layer.props["particle.opacity0"] = makeProp(1, 1);
      layer.props["particle.opacity1"] = makeProp(1, 0);
      layer.props["particle.gravity"] = makeProp(1, -400);
      layer.props["particle.spread"] = makeProp(1, 0.6);
    } else if (type === "audio") {
      layer.audio = { wave: "sine", voice: "tone" };
      layer.props["audio.frequency"] = makeProp(1, 220);
      layer.props["audio.gain"] = makeProp(1, 0.2);
      layer.props["audio.attack"] = makeProp(1, 0.01);
      layer.props["audio.decay"] = makeProp(1, 0.2);
      layer.props["audio.release"] = makeProp(1, 0.3);
    } else if (type === "adjustment") {
      layer.blend = "normal";
    } else if (type === "precomp") {
      layer.precompId = null;
    }
    comp.layers.push(layer);
    return layer;
  }

  function createField(comp, type) {
    const f = {
      id: uid("F"),
      name: type === "noise" ? "噪声场" : type === "vortex" ? "旋涡场" : "衰减场",
      type: type || "falloff",
      props: {
        position: makeProp(3, [0, 0, 0], { spatial: true }),
        radius: makeProp(1, 400),
        strength: makeProp(1, 40),
        frequency: makeProp(1, 1),
      },
    };
    comp.fields.push(f);
    return f;
  }

  function createProject(name) {
    SEQ = Math.max(SEQ, 1);
    const project = {
      version: 1,
      name: name || "未命名工程",
      comps: [],
      graphs: [],
      activeCompId: null,
      rev: 1,
      simRev: 1,
    };
    return project;
  }

  function serialize(project) {
    return {
      version: 1,
      name: project.name,
      comps: project.comps,
      graphs: project.graphs,
      activeCompId: project.activeCompId,
      seq: SEQ,
    };
  }
  function deserialize(data) {
    const project = {
      version: 1,
      name: data.name || "工程",
      comps: data.comps || [],
      graphs: data.graphs || [],
      activeCompId: data.activeCompId,
      rev: 1,
      simRev: 1,
    };
    SEQ = Math.max(SEQ, (data.seq || 1) + 1);
    // Ensure every prop has a lastError field.
    for (const c of project.comps) {
      for (const l of c.layers) {
        for (const k of Object.keys(l.props || {})) if (!l.props[k].lastError) l.props[k].lastError = "";
        for (const e of l.effects || []) for (const k of Object.keys(e.props || {})) if (!e.props[k].lastError) e.props[k].lastError = "";
      }
      for (const f of c.fields || []) for (const k of Object.keys(f.props || {})) if (!f.props[k].lastError) f.props[k].lastError = "";
    }
    return project;
  }

  const history = {
    stack: [],
    index: -1,
    reset(project) {
      this.stack = [JSON.stringify(serialize(project))];
      this.index = 0;
    },
    capture(project) {
      const s = JSON.stringify(serialize(project));
      if (this.stack[this.index] === s) return;
      this.stack.splice(this.index + 1);
      this.stack.push(s);
      if (this.stack.length > 50) this.stack.shift();
      this.index = this.stack.length - 1;
    },
    undo() {
      if (this.index <= 0) return null;
      this.index--;
      return deserialize(JSON.parse(this.stack[this.index]));
    },
    redo() {
      if (this.index >= this.stack.length - 1) return null;
      this.index++;
      return deserialize(JSON.parse(this.stack[this.index]));
    },
    get canUndo() { return this.index > 0; },
    get canRedo() { return this.index >= 0 && this.index < this.stack.length - 1; },
  };

  function precompose(project, comp, layerIds, name) {
    const selected = layerIds.map((id) => comp.layers.find((l) => l.id === id)).filter(Boolean);
    if (!selected.length) return null;
    const index = Math.min(...selected.map((l) => comp.layers.indexOf(l)));
    const nc = createComp(project, { name: name || (selected[0].name + " 合成"), width: comp.width, height: comp.height, fps: comp.fps, duration: comp.duration });
    nc.bg = [0, 0, 0, 0];
    const idset = new Set(selected.map((l) => l.id));
    for (const l of selected) {
      if (l.parentId && !idset.has(l.parentId)) {
        const parent = comp.layers.find((p) => p.id === l.parentId);
        const nul = createLayer(project, nc, "null", (parent ? parent.name : "父级") + " 烘焙");
        const keys = Math.ceil(comp.duration * comp.fps);
        nul.props["transform.position"].animated = true;
        nul.props["transform.rotationX"].animated = true;
        nul.props["transform.rotationY"].animated = true;
        nul.props["transform.rotationZ"].animated = true;
        nul.props["transform.scale"].animated = true;
        for (let i = 0; i <= keys; i++) {
          const t = i / comp.fps;
          const ctx = makeCtx(project, comp, t);
          const w = worldMatrix(project, comp, parent, t, ctx);
          const dec = M.decomposeTRS(w);
          nul.props["transform.position"].keys.push(makeKey(t, dec.position, "linear"));
          nul.props["transform.rotationX"].keys.push(makeKey(t, dec.rotation[0], "linear"));
          nul.props["transform.rotationY"].keys.push(makeKey(t, dec.rotation[1], "linear"));
          nul.props["transform.rotationZ"].keys.push(makeKey(t, dec.rotation[2], "linear"));
          nul.props["transform.scale"].keys.push(makeKey(t, dec.scale, "linear"));
        }
        l.parentId = nul.id;
      }
    }
    nc.layers = nc.layers.concat(selected);
    comp.layers = comp.layers.filter((l) => !idset.has(l.id));
    const pl = createLayer(project, comp, "precomp", nc.name);
    pl.precompId = nc.id;
    pl.threeD = selected.some((l) => l.threeD);
    // move precomp layer to the original index
    comp.layers.splice(comp.layers.indexOf(pl), 1);
    comp.layers.splice(Math.min(index, comp.layers.length), 0, pl);
    return { comp: nc, layer: pl };
  }

  function sourceTime(project, comp, layer, time, ctx) {
    if (layer.timeRemap) return num(project, comp, layer, "timeRemap", time, ctx);
    const stretch = layer.stretch || 1;
    return (time - (layer.startTime || 0)) / stretch;
  }

  AE.model = {
    uid, clone, makeProp, makeKey, sampleKeys, normDim,
    findComp, findLayer, compOfLayer,
    makeCtx, evalProp, readPropAt, num, vec, localMatrix, worldMatrix,
    setParent, writeProp, refreshSpatial, easyEase,
    createProject, createComp, createLayer, createField, addEffect,
    serialize, deserialize, history, precompose, sourceTime, baseLayer,
  };
})(typeof window !== "undefined" ? window : globalThis);

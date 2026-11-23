import {
  AnimProp, Composition, ExpressionDiagnostic, Layer, PropValue, Vec2, Vec3, ColorRGBA,
} from './types';
import { clamp, lerp, smoothstep, hashString, noise1D, deepClone } from './math';
import { evaluateKeyframes } from './animation';

// ============================================================================
// Expression Compilation Cache
// ============================================================================
const _fnCache = new Map<string, Function | { compileError: string }>();

function compileExpression(code: string): Function | { compileError: string } {
  const trimmed = code.trim();
  let cached = _fnCache.get(trimmed);
  if (cached) return cached;

  // Support both single-expression ("wiggle(3, 20)") and multi-statement blocks ("const a = ...; a * 2;")
  const argNames = [
    'time', 'value', 'wiggle', 'loopOut', 'loopIn',
    'linear', 'ease', 'easeIn', 'easeOut', 'clamp',
    'add', 'sub', 'mul', 'div', 'length', 'normalize', 'degreesToRadians', 'radiansToDegrees',
    'thisComp', 'thisLayer', 'thisProperty', 'Math', 'PI',
  ];

  // Try as direct return expression first; if syntax error, try as multi-statement script returning last expression
  let fn: Function | null = null;
  let lastErr = '';
  try {
    fn = new Function(...argNames, `"use strict"; return (\n${trimmed}\n);`);
  } catch (e1: any) {
    lastErr = e1?.message || String(e1);
    try {
      // Check if user wrote explicit `return`
      if (/\breturn\b/.test(trimmed)) {
        fn = new Function(...argNames, `"use strict";\n${trimmed}`);
      } else {
        // Split statements by newline/semicolon and return last non-empty line
        const lines = trimmed.split(/\r?\n/).filter((l) => l.trim().length > 0 && !l.trim().startsWith('//'));
        if (lines.length > 0) {
          const lastLine = lines.pop()!.replace(/;\s*$/, '');
          const body = `${lines.join('\n')}\nreturn (${lastLine});`;
          fn = new Function(...argNames, `"use strict";\n${body}`);
        }
      }
    } catch (e2: any) {
      lastErr = e2?.message || lastErr;
    }
  }

  const entry = fn ?? { compileError: `语法错误: ${lastErr}` };
  if (_fnCache.size > 500) _fnCache.clear();
  _fnCache.set(trimmed, entry);
  return entry;
}

// ============================================================================
// Property Lookup Registry inside a Layer
// ============================================================================
export function findLayerProperty(layer: Layer, propPath: string): { prop: AnimProp<any>; isSpatial: boolean; componentIndex?: number } | null {
  const p = propPath.replace(/^transform\./, '');
  const t = layer.transform;
  if (p === 'position') return { prop: t.position, isSpatial: true };
  if (p === 'anchor' || p === 'anchorPoint') return { prop: t.anchor, isSpatial: false };
  if (p === 'scale') return { prop: t.scale, isSpatial: false };
  if (p === 'rotation' || p === 'rotationZ') {
    return { prop: t.rotation, isSpatial: false, componentIndex: !layer.is3D && p === 'rotation' ? 2 : (p === 'rotationZ' ? 2 : undefined) };
  }
  if (p === 'rotationX') return { prop: t.rotation, isSpatial: false, componentIndex: 0 };
  if (p === 'rotationY') return { prop: t.rotation, isSpatial: false, componentIndex: 1 };
  if (p === 'opacity') return { prop: t.opacity, isSpatial: false };

  // Mesh3D material & geometry props
  if (layer.mesh3d) {
    if (p === 'extrudeDepth' || p === 'mesh3d.extrudeDepth') return { prop: layer.mesh3d.extrudeDepth, isSpatial: false };
    if (p === 'bevelSize' || p === 'mesh3d.bevelSize') return { prop: layer.mesh3d.bevelSize, isSpatial: false };
    if (p === 'revealProgress' && layer.mesh3d.revealProgress) return { prop: layer.mesh3d.revealProgress, isSpatial: false };
    const m = layer.mesh3d.material;
    if (p === 'material.baseColor') return { prop: m.baseColor, isSpatial: false };
    if (p === 'material.metallic') return { prop: m.metallic, isSpatial: false };
    if (p === 'material.roughness') return { prop: m.roughness, isSpatial: false };
    if (p === 'material.emissiveColor') return { prop: m.emissiveColor, isSpatial: false };
    if (p === 'material.emissiveIntensity') return { prop: m.emissiveIntensity, isSpatial: false };
    if (p === 'material.opacity') return { prop: m.opacity, isSpatial: false };
    if (p === 'material.heatIntensity' && m.heatIntensity) return { prop: m.heatIntensity, isSpatial: false };
  }
  // Camera
  if (layer.camera) {
    if (p === 'camera.target' || p === 'target') return { prop: layer.camera.target, isSpatial: true };
    if (p === 'camera.fov' || p === 'fov') return { prop: layer.camera.fov, isSpatial: false };
    if (p === 'camera.focalDistance' || p === 'focalDistance') return { prop: layer.camera.focalDistance, isSpatial: false };
    if (p === 'camera.aperture' || p === 'aperture') return { prop: layer.camera.aperture, isSpatial: false };
  }
  // Light
  if (layer.light) {
    if (p === 'light.intensity' || p === 'intensity') return { prop: layer.light.intensity, isSpatial: false };
    if (p === 'light.color' || p === 'color') return { prop: layer.light.color, isSpatial: false };
    if (p === 'light.target' || p === 'target') return { prop: layer.light.target, isSpatial: true };
    if (p === 'light.range' || p === 'range') return { prop: layer.light.range, isSpatial: false };
  }
  // Field
  if (layer.field) {
    if (p === 'field.strength' || p === 'strength') return { prop: layer.field.strength, isSpatial: false };
    if (p === 'field.radius' || p === 'radius') return { prop: layer.field.radius, isSpatial: false };
    if (p === 'field.falloff' || p === 'falloff') return { prop: layer.field.falloff, isSpatial: false };
    if (p === 'field.direction' || p === 'direction') return { prop: layer.field.direction, isSpatial: false };
  }
  // Text
  if (layer.text) {
    if (p === 'text.fontSize') return { prop: layer.text.fontSize, isSpatial: false };
    if (p === 'text.writeOnProgress') return { prop: layer.text.writeOnProgress, isSpatial: false };
  }
  return null;
}

// ============================================================================
// Wrapped Property Value (behaves as primitive/array AND exposes .valueAtTime)
// ============================================================================
function wrapPropProxy(val: any, evalAt: (t: number) => any): any {
  if (typeof val === 'number') {
    const numObj: any = new Number(val);
    numObj.value = val;
    numObj.valueAtTime = (t: number) => evalAt(Number(t));
    return numObj;
  }
  if (Array.isArray(val)) {
    const arr: any = [...val];
    Object.defineProperty(arr, 'x', { get: () => arr[0], enumerable: false });
    Object.defineProperty(arr, 'y', { get: () => arr[1], enumerable: false });
    Object.defineProperty(arr, 'z', { get: () => arr[2] ?? 0, enumerable: false });
    Object.defineProperty(arr, 'r', { get: () => arr[0], enumerable: false });
    Object.defineProperty(arr, 'g', { get: () => arr[1], enumerable: false });
    Object.defineProperty(arr, 'b', { get: () => arr[2] ?? 0, enumerable: false });
    Object.defineProperty(arr, 'a', { get: () => arr[3] ?? 1, enumerable: false });
    Object.defineProperty(arr, 'value', { value: [...val], enumerable: false });
    Object.defineProperty(arr, 'valueAtTime', {
      value: (t: number) => {
        const v = evalAt(Number(t));
        return wrapPropProxy(v, evalAt);
      },
      enumerable: false,
    });
    return arr;
  }
  return val;
}

function unwrapValue(v: any): any {
  if (v instanceof Number) return v.valueOf();
  if (Array.isArray(v)) return v.map((item) => (item instanceof Number ? item.valueOf() : Number(item)));
  return v;
}

// ============================================================================
// Vector & Interpolation Builtins for Expressions
// ============================================================================
function toNum(x: any): number {
  return x instanceof Number ? x.valueOf() : Number(x);
}

function exprAdd(a: any, b: any): any {
  const ua = unwrapValue(a), ub = unwrapValue(b);
  if (Array.isArray(ua) && Array.isArray(ub)) {
    return ua.map((v, i) => v + (ub[i] ?? 0));
  }
  if (Array.isArray(ua) && typeof ub === 'number') return ua.map((v) => v + ub);
  if (typeof ua === 'number' && Array.isArray(ub)) return ub.map((v) => ua + v);
  return toNum(ua) + toNum(ub);
}

function exprSub(a: any, b: any): any {
  const ua = unwrapValue(a), ub = unwrapValue(b);
  if (Array.isArray(ua) && Array.isArray(ub)) {
    return ua.map((v, i) => v - (ub[i] ?? 0));
  }
  if (Array.isArray(ua) && typeof ub === 'number') return ua.map((v) => v - ub);
  return toNum(ua) - toNum(ub);
}

function exprMul(a: any, b: any): any {
  const ua = unwrapValue(a), ub = unwrapValue(b);
  if (Array.isArray(ua) && typeof ub === 'number') return ua.map((v) => v * ub);
  if (typeof ua === 'number' && Array.isArray(ub)) return ub.map((v) => ua * v);
  if (Array.isArray(ua) && Array.isArray(ub)) return ua.map((v, i) => v * (ub[i] ?? 1));
  return toNum(ua) * toNum(ub);
}

function exprDiv(a: any, b: any): any {
  const ua = unwrapValue(a), ub = unwrapValue(b);
  if (Array.isArray(ua) && typeof ub === 'number') return ua.map((v) => v / (ub || 1e-9));
  return toNum(ua) / (toNum(ub) || 1e-9);
}

function exprLength(a: any, b?: any): number {
  const ua = unwrapValue(a);
  if (b !== undefined) {
    const diff = exprSub(ua, unwrapValue(b));
    return exprLength(diff);
  }
  if (Array.isArray(ua)) {
    return Math.sqrt(ua.reduce((acc, v) => acc + v * v, 0));
  }
  return Math.abs(toNum(ua));
}

function exprNormalize(a: any): any {
  const ua = unwrapValue(a);
  const len = exprLength(ua);
  if (Array.isArray(ua)) return len > 1e-9 ? ua.map((v) => v / len) : ua.map(() => 0);
  return len > 1e-9 ? toNum(ua) / len : 0;
}

function interpMapped(
  tIn: any, tMinIn: any, tMaxIn: any, v1In: any, v2In: any,
  shaper: (u: number) => number
): any {
  let t = toNum(tIn), tMin = toNum(tMinIn), tMax = toNum(tMaxIn);
  let v1 = unwrapValue(v1In), v2 = unwrapValue(v2In);
  if (v2In === undefined) {
    // 3-arg form: linear(t, v1, v2) with t in [0,1]
    v2 = tMax;
    v1 = tMin;
    tMin = 0;
    tMax = 1;
  }
  const rawU = Math.abs(tMax - tMin) < 1e-9 ? (t >= tMax ? 1 : 0) : clamp((t - tMin) / (tMax - tMin), 0, 1);
  const u = shaper(rawU);
  if (Array.isArray(v1) && Array.isArray(v2)) {
    return v1.map((val, i) => lerp(val, v2[i] ?? val, u));
  }
  return lerp(toNum(v1), toNum(v2), u);
}

class ExpressionCycleError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'ExpressionCycleError';
  }
}

// ============================================================================
// Expression Evaluation Context & Dependency Graph
// ============================================================================
export class EvalContext {
  public comp: Composition;
  public diagnostics: ExpressionDiagnostic[] = [];
  private activeStack = new Set<string>();
  private memo = new Map<string, any>();

  constructor(comp: Composition) {
    this.comp = comp;
  }

  public evaluateProp<T extends PropValue>(
    layer: Layer,
    prop: AnimProp<T>,
    propPath: string,
    time: number,
    isSpatial = false
  ): T {
    const key = `${this.comp.id}|${layer.id}|${propPath}|${time.toFixed(5)}`;
    if (this.memo.has(key)) {
      return deepClone(this.memo.get(key));
    }

    const baseVal = evaluateKeyframes(prop, time, isSpatial);
    if (!prop.expressionEnabled || !prop.expression || !prop.expression.trim()) {
      this.memo.set(key, baseVal);
      return baseVal;
    }

    const cycleKey = `${this.comp.id}|${layer.id}|${propPath}`;
    if (this.activeStack.has(cycleKey)) {
      const msg = `检测到表达式循环引用 (${layer.name}.${propPath})，已退回关键帧值`;
      this.recordError(layer.id, propPath, msg);
      throw new ExpressionCycleError(msg);
    }

    this.activeStack.add(cycleKey);
    try {
      const compiled = compileExpression(prop.expression);
      if (typeof compiled !== 'function') {
        this.recordError(layer.id, propPath, compiled.compileError);
        return baseVal;
      }

      const seedBase = hashString(`${this.comp.id}:${layer.id}:${propPath}`);
      const wiggleFn = (freqIn: any, ampIn: any, octaves = 1, ampMult = 0.5, tOverride?: number) => {
        const freq = Math.max(0, toNum(freqIn));
        const amp = toNum(ampIn);
        const tt = tOverride !== undefined ? toNum(tOverride) : time;
        const oct = clamp(Math.round(toNum(octaves) || 1), 1, 5);
        const mult = toNum(ampMult) || 0.5;

        const evalAxis = (axisIdx: number) => {
          let sum = 0, curAmp = amp, curFreq = freq;
          for (let o = 0; o < oct; o++) {
            sum += noise1D(tt * curFreq + o * 17.31, seedBase + axisIdx * 7919 + o * 1013) * curAmp;
            curFreq *= 2;
            curAmp *= mult;
          }
          return sum;
        };

        if (typeof baseVal === 'number') {
          return baseVal + evalAxis(0);
        }
        if (Array.isArray(baseVal)) {
          return (baseVal as number[]).map((v, i) => (i === 3 && prop.type === 'color' ? v : v + evalAxis(i)));
        }
        return baseVal;
      };

      const loopOutFn = (type = 'cycle', numKeyframes = 0) => {
        const kfs = prop.keyframes;
        if (!prop.animated || kfs.length < 2) return baseVal;
        const lastIdx = kfs.length - 1;
        const startIdx = numKeyframes > 0 ? Math.max(0, lastIdx - numKeyframes) : 0;
        const tStart = kfs[startIdx].time;
        const tEnd = kfs[lastIdx].time;
        const span = tEnd - tStart;
        if (time <= tEnd || span <= 1e-6) return baseVal;
        const elapsed = time - tEnd;
        const cycleIdx = Math.floor(elapsed / span);
        const localRem = elapsed - cycleIdx * span;
        if (String(type).toLowerCase() === 'pingpong') {
          const isRev = cycleIdx % 2 === 0;
          const mappedT = isRev ? tEnd - localRem : tStart + localRem;
          return evaluateKeyframes(prop, mappedT, isSpatial);
        }
        // cycle (default)
        return evaluateKeyframes(prop, tStart + localRem, isSpatial);
      };

      const loopInFn = (type = 'cycle', numKeyframes = 0) => {
        const kfs = prop.keyframes;
        if (!prop.animated || kfs.length < 2) return baseVal;
        const endIdx = numKeyframes > 0 ? Math.min(kfs.length - 1, numKeyframes) : kfs.length - 1;
        const tStart = kfs[0].time;
        const tEnd = kfs[endIdx].time;
        const span = tEnd - tStart;
        if (time >= tStart || span <= 1e-6) return baseVal;
        const before = tStart - time;
        const cycleIdx = Math.floor(before / span);
        const localRem = before - cycleIdx * span;
        if (String(type).toLowerCase() === 'pingpong') {
          const isFwd = cycleIdx % 2 === 0;
          const mappedT = isFwd ? tStart + localRem : tEnd - localRem;
          return evaluateKeyframes(prop, mappedT, isSpatial);
        }
        return evaluateKeyframes(prop, tEnd - localRem, isSpatial);
      };

      const linearFn = (t: any, a: any, b: any, c?: any, d?: any) =>
        interpMapped(t, a, b, c, d, (u) => u);
      const easeFn = (t: any, a: any, b: any, c?: any, d?: any) =>
        interpMapped(t, a, b, c, d, (u) => smoothstep(0, 1, u));
      const easeInFn = (t: any, a: any, b: any, c?: any, d?: any) =>
        interpMapped(t, a, b, c, d, (u) => u * u * (3 - 2 * u) * 0.5 + u * u * 0.5);
      const easeOutFn = (t: any, a: any, b: any, c?: any, d?: any) =>
        interpMapped(t, a, b, c, d, (u) => 1 - (1 - u) * (1 - u));
      const clampFn = (v: any, lo: any, hi: any) => {
        const uv = unwrapValue(v);
        if (Array.isArray(uv)) return uv.map((x) => clamp(x, toNum(lo), toNum(hi)));
        return clamp(toNum(uv), toNum(lo), toNum(hi));
      };

      const buildLayerProxy = (targetLayer: Layer) => {
        const readProp = (pPath: string, atTime = time): any => {
          const found = findLayerProperty(targetLayer, pPath);
          if (!found) return 0;
          const val = this.evaluateProp(targetLayer, found.prop, pPath, atTime, found.isSpatial);
          if (found.componentIndex !== undefined && Array.isArray(val)) {
            return val[found.componentIndex];
          }
          return val;
        };

        const makeAttr = (pPath: string) => {
          const curVal = readProp(pPath, time);
          return wrapPropProxy(curVal, (t: number) => readProp(pPath, t));
        };

        const transformProxy = {
          get position() { return makeAttr('position'); },
          get anchorPoint() { return makeAttr('anchor'); },
          get anchor() { return makeAttr('anchor'); },
          get scale() { return makeAttr('scale'); },
          get rotation() { return makeAttr('rotation'); },
          get rotationX() { return makeAttr('rotationX'); },
          get rotationY() { return makeAttr('rotationY'); },
          get rotationZ() { return makeAttr('rotationZ'); },
          get opacity() { return makeAttr('opacity'); },
        };

        const materialProxy = {
          get baseColor() { return makeAttr('material.baseColor'); },
          get metallic() { return makeAttr('material.metallic'); },
          get roughness() { return makeAttr('material.roughness'); },
          get emissiveColor() { return makeAttr('material.emissiveColor'); },
          get emissiveIntensity() { return makeAttr('material.emissiveIntensity'); },
          get opacity() { return makeAttr('material.opacity'); },
        };

        const cameraProxy = {
          get target() { return makeAttr('camera.target'); },
          get fov() { return makeAttr('camera.fov'); },
          get focalDistance() { return makeAttr('camera.focalDistance'); },
          get aperture() { return makeAttr('camera.aperture'); },
        };

        const lightProxy = {
          get intensity() { return makeAttr('light.intensity'); },
          get color() { return makeAttr('light.color'); },
          get target() { return makeAttr('light.target'); },
          get range() { return makeAttr('light.range'); },
        };

        const fieldProxy = {
          get strength() { return makeAttr('field.strength'); },
          get radius() { return makeAttr('field.radius'); },
          get falloff() { return makeAttr('field.falloff'); },
          get direction() { return makeAttr('field.direction'); },
        };

        return {
          name: targetLayer.name,
          index: this.comp.layers.indexOf(targetLayer) + 1,
          inPoint: targetLayer.inPoint,
          outPoint: targetLayer.outPoint,
          transform: transformProxy,
          material: materialProxy,
          camera: cameraProxy,
          light: lightProxy,
          field: fieldProxy,
          get position() { return makeAttr('position'); },
          get scale() { return makeAttr('scale'); },
          get rotation() { return makeAttr('rotation'); },
          get opacity() { return makeAttr('opacity'); },
          effect: (effNameOrIdx: string | number) => (paramName: string) => {
            const eff = typeof effNameOrIdx === 'number'
              ? targetLayer.effects[effNameOrIdx - 1]
              : targetLayer.effects.find((e) => e.name === effNameOrIdx || e.type === effNameOrIdx);
            const effProp = eff ? (eff as any)[paramName] as AnimProp<any> | undefined : undefined;
            if (!effProp) return wrapPropProxy(0, () => 0);
            const epPath = `effect.${eff!.id}.${paramName}`;
            const v = this.evaluateProp(targetLayer, effProp, epPath, time, false);
            return wrapPropProxy(v, (t: number) => this.evaluateProp(targetLayer, effProp, epPath, t, false));
          },
        };
      };

      const thisCompProxy = {
        name: this.comp.name,
        width: this.comp.width,
        height: this.comp.height,
        duration: this.comp.duration,
        fps: this.comp.fps,
        frameDuration: 1 / this.comp.fps,
        numLayers: this.comp.layers.length,
        layer: (nameOrIndex: string | number) => {
          let found: Layer | undefined;
          if (typeof nameOrIndex === 'number') {
            // AE 1-based layer index
            found = this.comp.layers[Math.round(nameOrIndex) - 1];
          } else {
            found = this.comp.layers.find((l) => l.name === nameOrIndex || l.id === nameOrIndex);
          }
          if (!found) {
            throw new Error(`找不到图层 "${nameOrIndex}"`);
          }
          return buildLayerProxy(found);
        },
      };

      const thisLayerProxy = buildLayerProxy(layer);
      const thisPropProxy = wrapPropProxy(baseVal, (t: number) => evaluateKeyframes(prop, t, isSpatial));

      const rawResult = compiled(
        time,
        wrapPropProxy(baseVal, (t: number) => evaluateKeyframes(prop, t, isSpatial)),
        wiggleFn,
        loopOutFn,
        loopInFn,
        linearFn,
        easeFn,
        easeInFn,
        easeOutFn,
        clampFn,
        exprAdd,
        exprSub,
        exprMul,
        exprDiv,
        exprLength,
        exprNormalize,
        (d: number) => (toNum(d) * Math.PI) / 180,
        (r: number) => (toNum(r) * 180) / Math.PI,
        thisCompProxy,
        thisLayerProxy,
        thisPropProxy,
        Math,
        Math.PI
      );

      const result = coerceExpressionResult(rawResult, prop.type, baseVal, !layer.is3D && propPath === 'rotation');
      this.memo.set(key, result);
      return result as T;
    } catch (err: any) {
      if (err instanceof ExpressionCycleError) {
        this.recordError(layer.id, propPath, err.message);
        if (this.activeStack.size > 1) {
          throw err; // Propagate up to outer caller in the same cycle so ALL cycle members fall back cleanly!
        }
        return baseVal;
      }
      this.recordError(layer.id, propPath, err?.message || String(err));
      return baseVal;
    } finally {
      this.activeStack.delete(cycleKey);
    }
  }

  private recordError(layerId: string, propPath: string, error: string): void {
    if (!this.diagnostics.some((d) => d.layerId === layerId && d.propPath === propPath)) {
      this.diagnostics.push({ layerId, propPath, error });
    }
  }
}

function coerceExpressionResult(raw: any, expectedType: AnimProp['type'], fallback: any, is2DRotation = false): any {
  const u = unwrapValue(raw);
  if (expectedType === 'scalar') {
    const n = typeof u === 'number' ? u : Array.isArray(u) ? Number(u[0]) : Number(u);
    return Number.isFinite(n) ? n : fallback;
  }
  if (expectedType === 'vec2') {
    if (Array.isArray(u) && u.length >= 2) {
      const a = Number(u[0]), b = Number(u[1]);
      if (Number.isFinite(a) && Number.isFinite(b)) return [a, b] as Vec2;
    }
    if (typeof u === 'number' && Number.isFinite(u)) return [u, u] as Vec2;
    return fallback;
  }
  if (expectedType === 'vec3') {
    if (Array.isArray(u) && u.length >= 2) {
      const a = Number(u[0]), b = Number(u[1]), c = u.length >= 3 ? Number(u[2]) : (fallback[2] ?? 0);
      if (Number.isFinite(a) && Number.isFinite(b) && Number.isFinite(c)) return [a, b, c] as Vec3;
    }
    if (typeof u === 'number' && Number.isFinite(u)) {
      return (is2DRotation ? [fallback[0] ?? 0, fallback[1] ?? 0, u] : [u, u, u]) as Vec3;
    }
    return fallback;
  }
  if (expectedType === 'color') {
    if (Array.isArray(u) && u.length >= 3) {
      const r = clamp(Number(u[0]), 0, 1);
      const g = clamp(Number(u[1]), 0, 1);
      const b = clamp(Number(u[2]), 0, 1);
      const a = u.length >= 4 ? clamp(Number(u[3]), 0, 1) : (fallback[3] ?? 1);
      if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) return [r, g, b, a] as ColorRGBA;
    }
    return fallback;
  }
  return u ?? fallback;
}

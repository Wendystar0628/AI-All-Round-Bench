import opentype from 'opentype.js';
import {
  BezierVertex, Composition, Layer, PathContour, PathData, TextAnimator, TextContent, Vec2, Vec3,
} from '../core/types';
import { clamp, DEG2RAD, genId, lerp, smoothstep } from '../core/math';
import { EvalContext } from '../core/expressions';

// Global bundles injected by assets/fonts-data.js & assets/strokes-data.js
declare global {
  interface Window {
    __FORGE_FONTS__?: Record<string, {
      id: string;
      label: string;
      glyphCount: number;
      cjkCount: number;
      sampleChars: string;
      ttfBase64: string;
    }>;
    __FORGE_STROKES__?: Record<string, {
      s: string[];    // SVG path commands per stroke (in 1024x1024 MakeMeAHanzi space, Y up: -124..900)
      m: number[][];  // Flat [x0,y0,x1,y1,...] median polylines per stroke
    }>;
  }
}

export interface FontMeta {
  id: string;
  label: string;
  glyphCount: number;
  cjkCount: number;
  sampleChars: string;
  font: opentype.Font;
}

export interface EvaluatedGlyph {
  char: string;
  charIndex: number;
  wordIndex: number;
  lineIndex: number;
  /** Glyph center in layer-local 2D coords (+Y down for 2D, converted for 3D) */
  center: Vec2;
  /** Transformed contours (already transformed around glyph center by Text Animators!) */
  contours: PathContour[];
  opacity: number;
  /** Bounds before animator */
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
  /** Active stroke brush tip(s) during write-on in layer-local 2D coords */
  brushTips: Vec2[];
}

export interface EvaluatedTextLayout {
  glyphs: EvaluatedGlyph[];
  /** Combined PathData of all visible glyphs (for 3D extrusion / nodes / shape conversion!) */
  combinedPath: PathData;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  brushTips: Vec2[];
}

class FontManager {
  private fonts = new Map<string, FontMeta>();
  private initialized = false;
  private glyphContourCache = new Map<string, { contours: PathContour[]; advance: number; bbox: { minX: number; minY: number; maxX: number; maxY: number } }>();
  private strokeSvgCache = new Map<string, PathContour[][]>();

  public init(): void {
    if (this.initialized) return;
    this.initialized = true;
    const raw = typeof window !== 'undefined' ? window.__FORGE_FONTS__ : undefined;
    if (!raw) return;

    for (const [id, entry] of Object.entries(raw)) {
      try {
        const bin = atob(entry.ttfBase64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const font = opentype.parse(bytes.buffer);
        this.fonts.set(id, {
          id,
          label: entry.label,
          glyphCount: entry.glyphCount,
          cjkCount: entry.cjkCount,
          sampleChars: entry.sampleChars,
          font,
        });
      } catch (e) {
        console.warn(`Failed to parse bundled font ${id}:`, e);
      }
    }
  }

  public listFonts(): FontMeta[] {
    this.init();
    return Array.from(this.fonts.values());
  }

  public getFont(id: string): FontMeta | undefined {
    this.init();
    return this.fonts.get(id) ?? this.fonts.values().next().value;
  }

  public hasBundledGlyph(fontId: string, ch: string): boolean {
    const meta = this.getFont(fontId);
    if (!meta) return false;
    const g = meta.font.charToGlyph(ch);
    return !!g && g.index > 0;
  }

  public hasStrokeData(ch: string): boolean {
    return !!(typeof window !== 'undefined' && window.__FORGE_STROKES__ && window.__FORGE_STROKES__[ch]);
  }

  public getStrokeCount(): number {
    return typeof window !== 'undefined' && window.__FORGE_STROKES__
      ? Object.keys(window.__FORGE_STROKES__).length
      : 0;
  }

  /** Extract normalized contours at fontSize=1000 (Y-down screen space) */
  public getGlyphContoursNormalized(fontId: string, ch: string): {
    contours: PathContour[];
    advance: number;
    bbox: { minX: number; minY: number; maxX: number; maxY: number };
  } {
    this.init();
    const cacheKey = `${fontId}|${ch}`;
    const hit = this.glyphContourCache.get(cacheKey);
    if (hit) return hit;

    const meta = this.getFont(fontId);
    if (!meta) {
      return { contours: [], advance: 600, bbox: { minX: 0, minY: -800, maxX: 600, maxY: 0 } };
    }

    const glyph = meta.font.charToGlyph(ch);
    const upm = meta.font.unitsPerEm || 1000;
    const scale = 1000 / upm;

    let contours: PathContour[] = [];
    let advance = (glyph.advanceWidth || upm) * scale;

    if (glyph && glyph.index > 0) {
      const path = glyph.getPath(0, 0, 1000);
      contours = opentypePathToContours(path.commands);
    } else if (ch.trim().length > 0) {
      // Graceful fallback for rare characters outside the 1,625 bundled glyph set
      contours = fallbackRasterizeCharContours(ch, fontId);
      advance = 1000;
    }

    classifyHolesByContainment(contours);

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const c of contours) {
      for (const v of c.vertices) {
        if (v.x < minX) minX = v.x;
        if (v.y < minY) minY = v.y;
        if (v.x > maxX) maxX = v.x;
        if (v.y > maxY) maxY = v.y;
      }
    }
    if (!Number.isFinite(minX)) {
      minX = 0; minY = -800; maxX = advance; maxY = 100;
    }

    const entry = { contours, advance, bbox: { minX, minY, maxX, maxY } };
    this.glyphContourCache.set(cacheKey, entry);
    return entry;
  }

  /** Get authentic parsed Chinese stroke contours + medians for stroke-by-stroke write-on */
  public getChineseStrokes(ch: string): { contoursPerStroke: PathContour[][]; medians: Vec2[][] } | null {
    const map = typeof window !== 'undefined' ? window.__FORGE_STROKES__ : undefined;
    const entry = map?.[ch];
    if (!entry) return null;

    let contoursPerStroke = this.strokeSvgCache.get(ch);
    if (!contoursPerStroke) {
      contoursPerStroke = entry.s.map((svgStr) => parseSvgPathToContours(svgStr));
      this.strokeSvgCache.set(ch, contoursPerStroke);
    }
    const medians: Vec2[][] = entry.m.map((flat) => {
      const pts: Vec2[] = [];
      for (let i = 0; i + 1 < flat.length; i += 2) {
        pts.push([flat[i], flat[i + 1]]);
      }
      return pts;
    });
    return { contoursPerStroke, medians };
  }
}

export const fontManager = new FontManager();

// ============================================================================
// Convert opentype.js Commands -> PathContour[] (Cubic Bezier Vertices)
// ============================================================================
function opentypePathToContours(commands: opentype.PathCommand[]): PathContour[] {
  const contours: PathContour[] = [];
  let cur: BezierVertex[] = [];
  let cx = 0, cy = 0;

  const flush = (closed: boolean) => {
    if (cur.length >= 2) {
      // Merge closing duplicate vertex if exact match
      if (closed && cur.length > 2) {
        const first = cur[0], last = cur[cur.length - 1];
        if (Math.hypot(first.x - last.x, first.y - last.y) < 1e-2) {
          first.inX = last.inX;
          first.inY = last.inY;
          cur.pop();
        }
      }
      if (cur.length >= 2) {
        contours.push({ id: genId('gcnt'), closed, vertices: cur });
      }
    }
    cur = [];
  };

  for (const cmd of commands) {
    if (cmd.type === 'M') {
      flush(true); // Font glyph contours are always closed loops!
      cx = cmd.x; cy = cmd.y;
      cur.push({ x: cx, y: cy, inX: 0, inY: 0, outX: 0, outY: 0 });
    } else if (cmd.type === 'L') {
      if (Math.hypot(cmd.x - cx, cmd.y - cy) > 1e-2) {
        cx = cmd.x; cy = cmd.y;
        cur.push({ x: cx, y: cy, inX: 0, inY: 0, outX: 0, outY: 0 });
      }
    } else if (cmd.type === 'Q') {
      // Elevate quadratic (p0, q1, p2) -> cubic (p0, c1, c2, p2)
      const prev = cur[cur.length - 1];
      if (prev) {
        const c1x = cx + (2 / 3) * (cmd.x1 - cx);
        const c1y = cy + (2 / 3) * (cmd.y1 - cy);
        const c2x = cmd.x + (2 / 3) * (cmd.x1 - cmd.x);
        const c2y = cmd.y + (2 / 3) * (cmd.y1 - cmd.y);
        prev.outX = c1x - prev.x;
        prev.outY = c1y - prev.y;
        cx = cmd.x; cy = cmd.y;
        cur.push({ x: cx, y: cy, inX: c2x - cx, inY: c2y - cy, outX: 0, outY: 0 });
      }
    } else if (cmd.type === 'C') {
      const prev = cur[cur.length - 1];
      if (prev) {
        prev.outX = cmd.x1 - prev.x;
        prev.outY = cmd.y1 - prev.y;
        cx = cmd.x; cy = cmd.y;
        cur.push({ x: cx, y: cy, inX: cmd.x2 - cx, inY: cmd.y2 - cy, outX: 0, outY: 0 });
      }
    } else if (cmd.type === 'Z') {
      flush(true);
    }
  }
  flush(true);
  return contours;
}

// ============================================================================
// Parse MakeMeAHanzi / hanzi-writer-data SVG path strings (M, L, Q, C, Z)
// ============================================================================
function parseSvgPathToContours(d: string): PathContour[] {
  const tokens = d.match(/[MLQCZmlqcz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g);
  if (!tokens) return [];
  const cmds: opentype.PathCommand[] = [];
  let i = 0;
  let op = '';
  let cx = 0, cy = 0;

  while (i < tokens.length) {
    const tk = tokens[i];
    if (/^[MLQCZmlqcz]$/.test(tk)) {
      op = tk;
      i++;
      if (op === 'Z' || op === 'z') {
        cmds.push({ type: 'Z' } as any);
        continue;
      }
    }
    const num = () => Number(tokens[i++]);
    if (op === 'M') {
      cx = num(); cy = num();
      cmds.push({ type: 'M', x: cx, y: cy } as any);
      op = 'L';
    } else if (op === 'L') {
      cx = num(); cy = num();
      cmds.push({ type: 'L', x: cx, y: cy } as any);
    } else if (op === 'Q') {
      const x1 = num(), y1 = num(), x = num(), y = num();
      cx = x; cy = y;
      cmds.push({ type: 'Q', x1, y1, x, y } as any);
    } else if (op === 'C') {
      const x1 = num(), y1 = num(), x2 = num(), y2 = num(), x = num(), y = num();
      cx = x; cy = y;
      cmds.push({ type: 'C', x1, y1, x2, y2, x, y } as any);
    } else {
      i++;
    }
  }
  return opentypePathToContours(cmds);
}

// ============================================================================
// Hole Detection via Even-Odd Point-in-Polygon Nesting Depth
// ============================================================================
function flattenContourSimple(c: PathContour, steps = 4): Vec2[] {
  const pts: Vec2[] = [];
  const n = c.vertices.length;
  for (let i = 0; i < n; i++) {
    const a = c.vertices[i];
    const b = c.vertices[(i + 1) % n];
    const curved = Math.abs(a.outX) + Math.abs(a.outY) + Math.abs(b.inX) + Math.abs(b.inY) > 1e-3;
    const sCount = curved ? steps : 1;
    for (let s = 0; s < sCount; s++) {
      const u = s / sCount;
      const inv = 1 - u;
      const x = inv * inv * inv * a.x + 3 * inv * inv * u * (a.x + a.outX) + 3 * inv * u * u * (b.x + b.inX) + u * u * u * b.x;
      const y = inv * inv * inv * a.y + 3 * inv * inv * u * (a.y + a.outY) + 3 * inv * u * u * (b.y + b.inY) + u * u * u * b.y;
      pts.push([x, y]);
    }
  }
  return pts;
}

function pointInPoly(px: number, py: number, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    if (((yi > py) !== (yj > py)) && (px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-12) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

export function classifyHolesByContainment(contours: PathContour[]): void {
  if (contours.length <= 1) {
    if (contours[0]) contours[0].isHole = false;
    return;
  }
  const polys = contours.map((c) => flattenContourSimple(c, 4));
  for (let i = 0; i < contours.length; i++) {
    const testPt = polys[i][0];
    if (!testPt) continue;
    let depth = 0;
    for (let j = 0; j < contours.length; j++) {
      if (i === j || polys[j].length < 3) continue;
      if (pointInPoly(testPt[0], testPt[1], polys[j])) depth++;
    }
    contours[i].isHole = (depth % 2) === 1;
  }
}

// ============================================================================
// Rare Character Fallback: Canvas2D Marching-Squares Contour Extractor
// ============================================================================
function fallbackRasterizeCharContours(ch: string, fontId: string): PathContour[] {
  if (typeof document === 'undefined') return [];
  const size = 96;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];
  const family = fontId === 'noto-serif-sc' ? 'SimSun, Songti SC, serif' : fontId === 'ma-shan-zheng' ? 'KaiTi, STKaiti, serif' : 'Microsoft YaHei, PingFang SC, sans-serif';
  ctx.fillStyle = '#fff';
  ctx.font = `900 ${Math.round(size * 0.78)}px ${family}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(ch, size * 0.5, size * 0.52);

  const img = ctx.getImageData(0, 0, size, size).data;
  const grid = new Uint8Array(size * size);
  for (let i = 0; i < size * size; i++) grid[i] = img[i * 4 + 3] > 110 ? 1 : 0;

  // Extract boundary edges between 1 and 0 cells and chain into closed loops
  const edges = new Map<string, [number, number][]>();
  const addEdge = (x0: number, y0: number, x1: number, y1: number) => {
    const k = `${x0},${y0}`;
    let arr = edges.get(k);
    if (!arr) { arr = []; edges.set(k, arr); }
    arr.push([x1, y1]);
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!grid[y * size + x]) continue;
      if (y === 0 || !grid[(y - 1) * size + x]) addEdge(x, y, x + 1, y);
      if (x === size - 1 || !grid[y * size + x + 1]) addEdge(x + 1, y, x + 1, y + 1);
      if (y === size - 1 || !grid[(y + 1) * size + x]) addEdge(x + 1, y + 1, x, y + 1);
      if (x === 0 || !grid[y * size + x - 1]) addEdge(x, y + 1, x, y);
    }
  }

  const loops: [number, number][][] = [];
  while (edges.size > 0) {
    const firstKey = edges.keys().next().value!;
    const [sx, sy] = firstKey.split(',').map(Number);
    const loop: [number, number][] = [[sx, sy]];
    let cx = sx, cy = sy;
    for (let guard = 0; guard < 5000; guard++) {
      const k = `${cx},${cy}`;
      const nexts = edges.get(k);
      if (!nexts || nexts.length === 0) break;
      const [nx, ny] = nexts.pop()!;
      if (nexts.length === 0) edges.delete(k);
      if (nx === sx && ny === sy) break;
      loop.push([nx, ny]);
      cx = nx; cy = ny;
    }
    if (loop.length >= 6) loops.push(loop);
  }

  const scale = 1000 / size;
  const contours: PathContour[] = [];
  for (const loop of loops) {
    // Subsample / Chaikin smooth once to remove pixel stair-stepping
    let pts = loop.map(([x, y]): Vec2 => [x * scale, (y - size * 0.82) * scale]);
    for (let iter = 0; iter < 2; iter++) {
      const next: Vec2[] = [];
      for (let i = 0; i < pts.length; i++) {
        const p0 = pts[i], p1 = pts[(i + 1) % pts.length];
        next.push([lerp(p0[0], p1[0], 0.25), lerp(p0[1], p1[1], 0.25)]);
        next.push([lerp(p0[0], p1[0], 0.75), lerp(p0[1], p1[1], 0.75)]);
      }
      pts = next.filter((_, idx) => idx % 2 === 0);
    }
    const verts: BezierVertex[] = pts.map(([x, y]) => ({ x, y, inX: 0, inY: 0, outX: 0, outY: 0 }));
    contours.push({ id: genId('fbc'), closed: true, vertices: verts });
  }
  return contours;
}

// ============================================================================
// Stroke Write-On Clipping along Authentic Calligraphic Stroke Order
// ============================================================================
function buildWriteOnStrokesForChar(
  ch: string,
  targetBBox: { minX: number; minY: number; maxX: number; maxY: number },
  fontScale: number,
  originX: number,
  baselineY: number,
  progress01: number,
  feather: number
): { contours: PathContour[]; tips: Vec2[] } | null {
  const strokeData = fontManager.getChineseStrokes(ch);
  if (!strokeData || strokeData.contoursPerStroke.length === 0) return null;

  // Map MakeMeAHanzi space (x: 0..1024, y: -124..900 Y-UP) into target glyph bbox (Y-DOWN)
  const strokes = strokeData.contoursPerStroke;
  const medians = strokeData.medians;
  const count = strokes.length;

  // Compute raw stroke bbox in Hanzi space (flip Y -> y' = 900 - y)
  let sMinX = Infinity, sMinY = Infinity, sMaxX = -Infinity, sMaxY = -Infinity;
  for (const sList of strokes) {
    for (const c of sList) {
      for (const v of c.vertices) {
        const hx = v.x, hy = 900 - v.y;
        if (hx < sMinX) sMinX = hx;
        if (hy < sMinY) sMinY = hy;
        if (hx > sMaxX) sMaxX = hx;
        if (hy > sMaxY) sMaxY = hy;
      }
    }
  }
  const sw = Math.max(1, sMaxX - sMinX);
  const sh = Math.max(1, sMaxY - sMinY);
  const tw = Math.max(1, (targetBBox.maxX - targetBBox.minX) * fontScale);
  const th = Math.max(1, (targetBBox.maxY - targetBBox.minY) * fontScale);
  const tMinX = originX + targetBBox.minX * fontScale;
  const tMinY = baselineY + targetBBox.minY * fontScale;

  const mapPt = (hx: number, hyRaw: number): Vec2 => {
    const hy = 900 - hyRaw;
    return [
      tMinX + ((hx - sMinX) / sw) * tw,
      tMinY + ((hy - sMinY) / sh) * th,
    ];
  };

  const outContours: PathContour[] = [];
  const tips: Vec2[] = [];
  const overlap = clamp(feather, 0, 0.75);
  const strokeDur = 1 / Math.max(1, count - (count - 1) * overlap);

  for (let si = 0; si < count; si++) {
    const startP = si * strokeDur * (1 - overlap);
    const localP = clamp((progress01 - startP) / strokeDur, 0, 1);
    if (localP <= 0.002) continue;

    // Median path for directional progressive write-on + active glowing brush tip
    const medRaw = medians[si];
    const medPts = medRaw && medRaw.length >= 2
      ? medRaw.map(([x, y]) => mapPt(x, y))
      : null;

    let clipOrigin: Vec2 = [tMinX, tMinY];
    let clipDir: Vec2 = [1, 0];
    let medTotal = 1;

    if (medPts) {
      // Compute cumulative length along median
      const lens = [0];
      for (let i = 1; i < medPts.length; i++) {
        lens.push(lens[i - 1] + Math.hypot(medPts[i][0] - medPts[i - 1][0], medPts[i][1] - medPts[i - 1][1]));
      }
      medTotal = Math.max(1e-3, lens[lens.length - 1]);
      const targetL = localP * medTotal;
      let tipPt = medPts[medPts.length - 1];
      let dirPt: Vec2 = [medPts[medPts.length - 1][0] - medPts[0][0], medPts[medPts.length - 1][1] - medPts[0][1]];
      for (let i = 1; i < medPts.length; i++) {
        if (lens[i] >= targetL || i === medPts.length - 1) {
          const segL = Math.max(1e-4, lens[i] - lens[i - 1]);
          const f = clamp((targetL - lens[i - 1]) / segL, 0, 1);
          tipPt = [lerp(medPts[i - 1][0], medPts[i][0], f), lerp(medPts[i - 1][1], medPts[i][1], f)];
          break;
        }
      }
      if (localP < 0.995) tips.push(tipPt);
      const dLen = Math.hypot(dirPt[0], dirPt[1]) || 1;
      clipOrigin = medPts[0];
      clipDir = [dirPt[0] / dLen, dirPt[1] / dLen];
    }

    // Transform stroke contours into target glyph coordinates, projecting smoothly along stroke direction if partially drawn
    for (const rawC of strokes[si]) {
      const mappedVerts: BezierVertex[] = rawC.vertices.map((v) => {
        const p = mapPt(v.x, v.y);
        const pIn = mapPt(v.x + v.inX, v.y + v.inY);
        const pOut = mapPt(v.x + v.outX, v.y + v.outY);
        return {
          x: p[0], y: p[1],
          inX: pIn[0] - p[0], inY: pIn[1] - p[1],
          outX: pOut[0] - p[0], outY: pOut[1] - p[1],
        };
      });

      if (localP >= 0.995) {
        outContours.push({ id: genId('strk'), closed: true, isHole: false, vertices: mappedVerts });
      } else {
        // Clamp vertices smoothly behind the advancing brush front along stroke axis
        let minProj = Infinity, maxProj = -Infinity;
        for (const v of mappedVerts) {
          const pr = (v.x - clipOrigin[0]) * clipDir[0] + (v.y - clipOrigin[1]) * clipDir[1];
          if (pr < minProj) minProj = pr;
          if (pr > maxProj) maxProj = pr;
        }
        const span = Math.max(1, maxProj - minProj);
        const front = minProj + span * smoothstep(0, 1, localP);

        const clipped = mappedVerts.map((v) => {
          const pr = (v.x - clipOrigin[0]) * clipDir[0] + (v.y - clipOrigin[1]) * clipDir[1];
          if (pr <= front) return v;
          const excess = pr - front;
          return {
            x: v.x - clipDir[0] * excess,
            y: v.y - clipDir[1] * excess,
            inX: v.inX * 0.25,
            inY: v.inY * 0.25,
            outX: v.outX * 0.25,
            outY: v.outY * 0.25,
          };
        });
        outContours.push({ id: genId('strk'), closed: true, isHole: false, vertices: clipped });
      }
    }
  }
  return { contours: outContours, tips };
}

// ============================================================================
// Evaluate Full Multi-Line Text Layer + Text Animators (2.6)
// ============================================================================
function computeRangeFactor(index: number, total: number, startPct: number, endPct: number, offsetPct: number, softPct: number): number {
  if (total <= 0) return 0;
  const lo = Math.min(startPct, endPct) + offsetPct;
  const hi = Math.max(startPct, endPct) + offsetPct;
  const centerPct = ((index + 0.5) / total) * 100;
  const soft = Math.max(0.5, softPct * 0.5);
  if (hi <= lo) return 0;
  const inRamp = smoothstep(lo - soft, lo + soft, centerPct);
  const outRamp = 1 - smoothstep(hi - soft, hi + soft, centerPct);
  return clamp(inRamp * outRamp, 0, 1);
}

function transformContourAroundCenter(
  c: PathContour,
  center: Vec2,
  dx: number,
  dy: number,
  sx: number,
  sy: number,
  rotDeg: number
): PathContour {
  const rad = rotDeg * DEG2RAD;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const txPt = (x: number, y: number): Vec2 => {
    const lx = (x - center[0]) * sx;
    const ly = (y - center[1]) * sy;
    return [
      center[0] + lx * cos - ly * sin + dx,
      center[1] + lx * sin + ly * cos + dy,
    ];
  };
  const txVec = (vx: number, vy: number): Vec2 => {
    const lx = vx * sx, ly = vy * sy;
    return [lx * cos - ly * sin, lx * sin + ly * cos];
  };

  return {
    id: c.id,
    closed: c.closed,
    isHole: c.isHole,
    vertices: c.vertices.map((v) => {
      const p = txPt(v.x, v.y);
      const hi = txVec(v.inX, v.inY);
      const ho = txVec(v.outX, v.outY);
      return { x: p[0], y: p[1], inX: hi[0], inY: hi[1], outX: ho[0], outY: ho[1], broken: v.broken };
    }),
  };
}

export function evaluateTextLayout(
  comp: Composition,
  layer: Layer,
  textCfg: TextContent,
  time: number,
  ctx?: EvalContext
): EvaluatedTextLayout {
  fontManager.init();
  const ec = ctx ?? new EvalContext(comp);
  const fontSize = Math.max(8, ec.evaluateProp(layer, textCfg.fontSize, 'text.fontSize', time) as number);
  const lineHeight = Math.max(0.5, ec.evaluateProp(layer, textCfg.lineHeight, 'text.lineHeight', time) as number);
  const letterSpacing = ec.evaluateProp(layer, textCfg.letterSpacing, 'text.letterSpacing', time) as number;
  const writeOnProgress = textCfg.writeOnEnabled
    ? clamp(ec.evaluateProp(layer, textCfg.writeOnProgress, 'text.writeOnProgress', time) as number, 0, 100)
    : 100;
  const writeOnFeather = textCfg.writeOnEnabled
    ? clamp(ec.evaluateProp(layer, textCfg.writeOnFeather, 'text.writeOnFeather', time) as number, 0, 1)
    : 0.25;

  const fontScale = fontSize / 1000;
  const lines = (textCfg.text || '').split(/\r?\n/);

  // Measure lines for alignment and vertical centering around layer local origin (0,0)
  interface RawCharSlot {
    char: string;
    lineIndex: number;
    wordIndex: number;
    charIndex: number;
    x: number;
    advance: number;
    data: ReturnType<typeof fontManager.getGlyphContoursNormalized>;
  }

  const lineSlots: RawCharSlot[][] = [];
  const lineWidths: number[] = [];
  let globalCharIdx = 0;
  let globalWordIdx = 0;

  for (let li = 0; li < lines.length; li++) {
    const str = lines[li];
    const slots: RawCharSlot[] = [];
    let cursorX = 0;
    let inWord = false;
    const chars = Array.from(str);
    for (let ci = 0; ci < chars.length; ci++) {
      const ch = chars[ci];
      const isSpace = /\s/.test(ch);
      const isBreakPunct = /[，。！？、；：,.;:!?]/.test(ch);
      if (!isSpace && !isBreakPunct) {
        if (!inWord) {
          if (globalCharIdx > 0) globalWordIdx++;
          inWord = true;
        }
      } else {
        inWord = false;
      }
      const data = fontManager.getGlyphContoursNormalized(textCfg.fontId, ch);
      const adv = data.advance * fontScale;
      if (!isSpace) {
        slots.push({
          char: ch,
          lineIndex: li,
          wordIndex: globalWordIdx,
          charIndex: globalCharIdx,
          x: cursorX,
          advance: adv,
          data,
        });
        globalCharIdx++;
      }
      cursorX += adv + (ci < chars.length - 1 ? letterSpacing : 0);
    }
    lineSlots.push(slots);
    lineWidths.push(cursorX);
    if (li < lines.length - 1) globalWordIdx++;
  }

  const totalChars = Math.max(1, globalCharIdx);
  const totalWords = Math.max(1, globalWordIdx + 1);
  const totalLines = Math.max(1, lines.length);

  // Pre-evaluate enabled Text Animators at time `t`
  const evalAnimators = textCfg.animators
    .filter((a) => a.enabled)
    .map((a) => ({
      unit: a.unit,
      start: ec.evaluateProp(layer, a.start, `text.anim.${a.id}.start`, time) as number,
      end: ec.evaluateProp(layer, a.end, `text.anim.${a.id}.end`, time) as number,
      offset: ec.evaluateProp(layer, a.offset, `text.anim.${a.id}.offset`, time) as number,
      softness: ec.evaluateProp(layer, a.softness, `text.anim.${a.id}.softness`, time) as number,
      pos: ec.evaluateProp(layer, a.position, `text.anim.${a.id}.position`, time) as Vec3,
      scale: ec.evaluateProp(layer, a.scale, `text.anim.${a.id}.scale`, time) as Vec2,
      rot: ec.evaluateProp(layer, a.rotation, `text.anim.${a.id}.rotation`, time) as number,
      opacity: ec.evaluateProp(layer, a.opacity, `text.anim.${a.id}.opacity`, time) as number,
    }));

  const lineStep = fontSize * lineHeight;
  const totalBlockH = (lines.length - 1) * lineStep + fontSize;
  const topBaselineY = -totalBlockH * 0.5 + fontSize * 0.82;

  const glyphs: EvaluatedGlyph[] = [];
  const allContours: PathContour[] = [];
  const allTips: Vec2[] = [];
  let bMinX = Infinity, bMinY = Infinity, bMaxX = -Infinity, bMaxY = -Infinity;

  for (let li = 0; li < lines.length; li++) {
    const slots = lineSlots[li];
    const lw = lineWidths[li];
    const alignOffsetX = textCfg.align === 'center' ? -lw * 0.5 : textCfg.align === 'right' ? -lw : 0;
    const baselineY = topBaselineY + li * lineStep;

    for (const slot of slots) {
      const originX = alignOffsetX + slot.x;
      const gbb = slot.data.bbox;
      const bbox = {
        minX: originX + gbb.minX * fontScale,
        minY: baselineY + gbb.minY * fontScale,
        maxX: originX + gbb.maxX * fontScale,
        maxY: baselineY + gbb.maxY * fontScale,
      };
      const center: Vec2 = [(bbox.minX + bbox.maxX) * 0.5, (bbox.minY + bbox.maxY) * 0.5];

      let rawContours: PathContour[];
      let charTips: Vec2[] = [];

      // Per-character write-on fraction across whole string
      const charWriteFrac = textCfg.writeOnEnabled
        ? clamp((writeOnProgress / 100) * totalChars - slot.charIndex, 0, 1)
        : 1;

      if (textCfg.writeOnEnabled && charWriteFrac <= 0.001) {
        rawContours = [];
      } else if (textCfg.writeOnEnabled && charWriteFrac < 0.995) {
        const strokeRes = buildWriteOnStrokesForChar(
          slot.char, gbb, fontScale, originX, baselineY, charWriteFrac, writeOnFeather
        );
        if (strokeRes) {
          rawContours = strokeRes.contours;
          charTips = strokeRes.tips;
        } else {
          // Non-CJK fallback: progressive contour reveal
          const scaled = scaleGlyphContours(slot.data.contours, fontScale, originX, baselineY);
          const keepN = Math.max(1, Math.ceil(scaled.length * charWriteFrac));
          rawContours = scaled.slice(0, keepN);
        }
      } else {
        // Full precision OpenType glyph contours (exact curves + holes!)
        rawContours = scaleGlyphContours(slot.data.contours, fontScale, originX, baselineY);
      }

      // Apply Text Animators around EACH character's own center! (2.6)
      let dx = 0, dy = 0, sx = 1, sy = 1, rot = 0, opacity = 1;
      for (const anim of evalAnimators) {
        const idx = anim.unit === 'line' ? slot.lineIndex : anim.unit === 'word' ? slot.wordIndex : slot.charIndex;
        const tot = anim.unit === 'line' ? totalLines : anim.unit === 'word' ? totalWords : totalChars;
        const f = computeRangeFactor(idx, tot, anim.start, anim.end, anim.offset, anim.softness);
        if (f > 1e-4) {
          dx += anim.pos[0] * f;
          dy += anim.pos[1] * f;
          sx *= lerp(1, anim.scale[0] / 100, f);
          sy *= lerp(1, anim.scale[1] / 100, f);
          rot += anim.rot * f;
          opacity *= lerp(1, clamp(anim.opacity / 100, 0, 1), f);
        }
      }

      const finalContours = rawContours.map((c) =>
        transformContourAroundCenter(c, center, dx, dy, sx, sy, rot)
      );

      for (const c of finalContours) {
        allContours.push(c);
        for (const v of c.vertices) {
          if (v.x < bMinX) bMinX = v.x;
          if (v.y < bMinY) bMinY = v.y;
          if (v.x > bMaxX) bMaxX = v.x;
          if (v.y > bMaxY) bMaxY = v.y;
        }
      }
      for (const tip of charTips) {
        allTips.push([tip[0] + dx, tip[1] + dy]);
      }

      glyphs.push({
        char: slot.char,
        charIndex: slot.charIndex,
        wordIndex: slot.wordIndex,
        lineIndex: slot.lineIndex,
        center: [center[0] + dx, center[1] + dy],
        contours: finalContours,
        opacity,
        bbox,
        brushTips: charTips.map((t) => [t[0] + dx, t[1] + dy]),
      });
    }
  }

  if (!Number.isFinite(bMinX)) {
    bMinX = -50; bMinY = -50; bMaxX = 50; bMaxY = 50;
  }

  return {
    glyphs,
    combinedPath: { contours: allContours },
    bounds: { minX: bMinX, minY: bMinY, maxX: bMaxX, maxY: bMaxY },
    brushTips: allTips,
  };
}

function scaleGlyphContours(contours: PathContour[], scale: number, ox: number, oy: number): PathContour[] {
  return contours.map((c) => ({
    id: c.id,
    closed: c.closed,
    isHole: c.isHole,
    vertices: c.vertices.map((v) => ({
      x: ox + v.x * scale,
      y: oy + v.y * scale,
      inX: v.inX * scale,
      inY: v.inY * scale,
      outX: v.outX * scale,
      outY: v.outY * scale,
      broken: v.broken,
    })),
  }));
}

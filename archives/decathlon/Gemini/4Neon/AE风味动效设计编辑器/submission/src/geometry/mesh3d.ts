import earcut from 'earcut';
import {
  EvaluatedField, MeshDeformer, Poly2D, PrimitiveMeshKind, PuppetPin, TriMesh3D, Vec2, Vec3,
} from '../core/types';
import {
  clamp, DEG2RAD, lerp, m4Invert, m4TransformDir, m4TransformPoint,
  v3Add, v3Cross, v3Len, v3Norm, v3Scale, v3Sub, Mat4, m4Identity,
} from '../core/math';

// ============================================================================
// Helper: Poly2D Winding, Point-in-Poly, Deduplication
// ============================================================================
function signedArea2D(pts: Vec2[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a * 0.5;
}

function pointInPoly2D(pt: Vec2, ring: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    if (((yi > pt[1]) !== (yj > pt[1])) && (pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi + 1e-12) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

function cleanRing(pts: Vec2[], minDist = 0.25): Vec2[] {
  const out: Vec2[] = [];
  for (const p of pts) {
    if (out.length === 0 || Math.hypot(p[0] - out[out.length - 1][0], p[1] - out[out.length - 1][1]) >= minDist) {
      out.push([p[0], p[1]]);
    }
  }
  while (out.length > 2 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) < minDist) {
    out.pop();
  }
  return out;
}

interface GroupedPolygon {
  outer: Vec2[]; // CCW (positive area in XY where +Y is up)
  holes: Vec2[][]; // CW (negative area)
}

/**
 * Group closed Poly2D contours into outer loops + contained holes.
 * If flipY=true, converts Y-down 2D canvas/font space into +Y-up 3D space.
 */
export function groupPolysWithHoles(polys: Poly2D[], flipY = false): GroupedPolygon[] {
  const rings: { pts: Vec2[]; area: number }[] = [];
  for (const p of polys) {
    if (!p.closed || p.points.length < 3) continue;
    const mapped: Vec2[] = flipY ? p.points.map(([x, y]) => [x, -y]) : p.points.map(([x, y]) => [x, y]);
    const cleaned = cleanRing(mapped, 0.2);
    if (cleaned.length < 3) continue;
    const area = Math.abs(signedArea2D(cleaned));
    if (area < 0.5) continue;
    rings.push({ pts: cleaned, area });
  }
  if (rings.length === 0) return [];

  // Compute nesting depth of each ring via strict containment
  const parents: number[] = new Array(rings.length).fill(-1);
  const depths: number[] = new Array(rings.length).fill(0);

  for (let i = 0; i < rings.length; i++) {
    const testPt = rings[i].pts[0];
    let bestParent = -1;
    let bestArea = Infinity;
    let depth = 0;
    for (let j = 0; j < rings.length; j++) {
      if (i === j || rings[j].area <= rings[i].area) continue;
      if (pointInPoly2D(testPt, rings[j].pts)) {
        depth++;
        if (rings[j].area < bestArea) {
          bestArea = rings[j].area;
          bestParent = j;
        }
      }
    }
    parents[i] = bestParent;
    depths[i] = depth;
  }

  const outerMap = new Map<number, GroupedPolygon>();
  for (let i = 0; i < rings.length; i++) {
    if (depths[i] % 2 === 0) {
      // Ensure CCW (positive signed area)
      const pts = signedArea2D(rings[i].pts) < 0 ? [...rings[i].pts].reverse() : rings[i].pts;
      outerMap.set(i, { outer: pts, holes: [] });
    }
  }
  for (let i = 0; i < rings.length; i++) {
    if (depths[i] % 2 === 1 && parents[i] !== -1) {
      const grp = outerMap.get(parents[i]);
      if (grp) {
        // Ensure CW (negative signed area)
        const pts = signedArea2D(rings[i].pts) > 0 ? [...rings[i].pts].reverse() : rings[i].pts;
        grp.holes.push(pts);
      }
    }
  }
  return Array.from(outerMap.values());
}

// ============================================================================
// Crack-Free 2D Triangulation with Interior Subdivision (for Puppet & Denting!)
// ============================================================================
export interface Triangulated2D {
  points: Vec2[];
  indices: number[];
}

export function triangulatePolys2D(polys: Poly2D[], maxEdgeLen = 0, flipY = false): Triangulated2D {
  const groups = groupPolysWithHoles(polys, flipY);
  const allPts: Vec2[] = [];
  const allIndices: number[] = [];

  for (const grp of groups) {
    const flat: number[] = [];
    const holeIndices: number[] = [];
    const baseOffset = allPts.length;

    for (const pt of grp.outer) {
      flat.push(pt[0], pt[1]);
      allPts.push([pt[0], pt[1]]);
    }
    for (const h of grp.holes) {
      holeIndices.push(flat.length / 2);
      for (const pt of h) {
        flat.push(pt[0], pt[1]);
        allPts.push([pt[0], pt[1]]);
      }
    }
    const tris = earcut(flat, holeIndices.length > 0 ? holeIndices : undefined, 2);
    for (let i = 0; i < tris.length; i++) {
      allIndices.push(baseOffset + tris[i]);
    }
  }

  if (maxEdgeLen > 2 && allIndices.length >= 3) {
    return subdivideTriangulation2D(allPts, allIndices, maxEdgeLen, 3);
  }
  return { points: allPts, indices: allIndices };
}

/**
 * Watertight 1-to-4 edge-midpoint subdivision for triangles with edges > maxEdgeLen.
 * Uses a shared edge-midpoint map so adjacent triangles stay 100% crack-free!
 */
function subdivideTriangulation2D(
  ptsIn: Vec2[],
  idxIn: number[],
  maxEdgeLen: number,
  maxPasses = 3
): Triangulated2D {
  let pts = ptsIn.map((p): Vec2 => [p[0], p[1]]);
  let tris = idxIn.slice();
  const maxEdgeSq = maxEdgeLen * maxEdgeLen;

  for (let pass = 0; pass < maxPasses; pass++) {
    const edgeMid = new Map<string, number>();
    const edgeKey = (a: number, b: number) => (a < b ? `${a}_${b}` : `${b}_${a}`);

    // Mark edges that need splitting
    for (let i = 0; i < tris.length; i += 3) {
      const a = tris[i], b = tris[i + 1], c = tris[i + 2];
      const edges: [number, number][] = [[a, b], [b, c], [c, a]];
      for (const [u, v] of edges) {
        const dx = pts[u][0] - pts[v][0], dy = pts[u][1] - pts[v][1];
        if (dx * dx + dy * dy > maxEdgeSq) {
          const k = edgeKey(u, v);
          if (!edgeMid.has(k)) {
            const midIdx = pts.length;
            pts.push([(pts[u][0] + pts[v][0]) * 0.5, (pts[u][1] + pts[v][1]) * 0.5]);
            edgeMid.set(k, midIdx);
          }
        }
      }
    }
    if (edgeMid.size === 0) break;

    const nextTris: number[] = [];
    for (let i = 0; i < tris.length; i += 3) {
      const a = tris[i], b = tris[i + 1], c = tris[i + 2];
      const mab = edgeMid.get(edgeKey(a, b));
      const mbc = edgeMid.get(edgeKey(b, c));
      const mca = edgeMid.get(edgeKey(c, a));
      const count = (mab !== undefined ? 1 : 0) + (mbc !== undefined ? 1 : 0) + (mca !== undefined ? 1 : 0);

      if (count === 0) {
        nextTris.push(a, b, c);
      } else if (count === 3) {
        nextTris.push(a, mab!, mca!, mab!, b, mbc!, mca!, mbc!, c, mab!, mbc!, mca!);
      } else if (count === 1) {
        if (mab !== undefined) nextTris.push(a, mab, c, mab, b, c);
        else if (mbc !== undefined) nextTris.push(a, b, mbc, a, mbc, c);
        else nextTris.push(a, b, mca!, mca!, b, c);
      } else {
        // 2 split edges -> 3 triangles cleanly preserving CCW winding
        if (mab !== undefined && mbc !== undefined) {
          nextTris.push(mab, b, mbc, a, mab, mbc, a, mbc, c);
        } else if (mbc !== undefined && mca !== undefined) {
          nextTris.push(mca, mbc, c, a, b, mbc, a, mbc, mca);
        } else {
          nextTris.push(a, mab!, mca!, mab!, b, c, mab!, c, mca!);
        }
      }
    }
    tris = nextTris;
    if (pts.length > 18000) break; // safety guard
  }
  return { points: pts, indices: tris };
}

// ============================================================================
// Apply 2D Puppet Pins to Triangulated 2D Mesh (for 2D Shapes & Text!)
// ============================================================================
export function applyPuppetPins2D(
  pts: Vec2[],
  pins: Array<{ rest: Vec2; target: Vec2; rotDeg: number; scalePct: number; radius: number }>
): Vec2[] {
  if (pins.length === 0) return pts;
  return pts.map((p) => {
    let sumW = 0;
    let outX = 0, outY = 0;
    for (const pin of pins) {
      const rx = p[0] - pin.rest[0];
      const ry = p[1] - pin.rest[1];
      const distSq = rx * rx + ry * ry;
      const rad = Math.max(20, pin.radius);
      // Smooth inverse-distance + Gaussian kernel prevents tearing across multiple pins!
      const w = 1 / (distSq / (rad * rad) + 0.015) + Math.exp(-distSq / (2 * rad * rad)) * 2.0;
      const radAng = pin.rotDeg * DEG2RAD;
      const cos = Math.cos(radAng), sin = Math.sin(radAng);
      const sc = pin.scalePct / 100;
      const tx = pin.target[0] + (rx * cos - ry * sin) * sc;
      const ty = pin.target[1] + (rx * sin + ry * cos) * sc;
      outX += tx * w;
      outY += ty * w;
      sumW += w;
    }
    if (sumW < 1e-8) return p;
    return [outX / sumW, outY / sumW] as Vec2;
  });
}

// ============================================================================
// True 3D Extruded Solid Builder (Front/Back Caps, Side Walls, Multi-Bevels, Holes!)
// ============================================================================
export function buildExtrudedMesh3D(
  polys: Poly2D[],
  depth: number,
  bevelSizeIn: number,
  bevelSegmentsIn = 3,
  interiorSubdiv = 26
): TriMesh3D {
  const groups = groupPolysWithHoles(polys, true); // Flip Y -> +Y up 3D World Space!
  if (groups.length === 0) {
    return emptyMesh();
  }

  const d = Math.max(0.5, depth);
  const halfD = d * 0.5;
  const bevelSegs = bevelSizeIn > 0.2 ? clamp(Math.round(bevelSegmentsIn), 1, 5) : 0;
  const bevZ = bevelSegs > 0 ? Math.min(bevelSizeIn, halfD * 0.48) : 0;
  const bevR = bevZ * 0.55; // safe subtle outward flare on outer rim, conservative on holes

  // Compute global bounds for normalized UVs & adaptive subdivision size
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const g of groups) {
    for (const [x, y] of g.outer) {
      if (x < minX) minX = x; if (y < minY) minY = y;
      if (x > maxX) maxX = x; if (y > maxY) maxY = y;
    }
  }
  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  const maxDim = Math.max(spanX, spanY);
  const maxEdgeLen = interiorSubdiv > 0 ? Math.max(10, maxDim / clamp(interiorSubdiv, 6, 40)) : 0;

  const posArr: number[] = [];
  const normArr: number[] = [];
  const uvArr: number[] = [];
  const idxArr: number[] = [];

  const pushVert = (x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number): number => {
    const id = posArr.length / 3;
    posArr.push(x, y, z);
    normArr.push(nx, ny, nz);
    uvArr.push(u, v);
    return id;
  };

  // 1) Front & Back Caps (earcut + optional watertight interior subdivision!)
  for (const grp of groups) {
    const flat: number[] = [];
    const holeIndices: number[] = [];
    const pts2D: Vec2[] = [];
    for (const pt of grp.outer) { flat.push(pt[0], pt[1]); pts2D.push([pt[0], pt[1]]); }
    for (const h of grp.holes) {
      holeIndices.push(flat.length / 2);
      for (const pt of h) { flat.push(pt[0], pt[1]); pts2D.push([pt[0], pt[1]]); }
    }
    const baseTris = earcut(flat, holeIndices.length > 0 ? holeIndices : undefined, 2);
    const triData = maxEdgeLen > 2
      ? subdivideTriangulation2D(pts2D, baseTris, maxEdgeLen, 2)
      : { points: pts2D, indices: baseTris };

    // Front cap (+halfD, normal +Z)
    const frontBase = posArr.length / 3;
    for (const [x, y] of triData.points) {
      pushVert(x, y, halfD, 0, 0, 1, (x - minX) / spanX, (y - minY) / spanY);
    }
    for (let i = 0; i < triData.indices.length; i += 3) {
      idxArr.push(frontBase + triData.indices[i], frontBase + triData.indices[i + 1], frontBase + triData.indices[i + 2]);
    }

    // Back cap (-halfD, normal -Z, reversed winding)
    const backBase = posArr.length / 3;
    for (const [x, y] of triData.points) {
      pushVert(x, y, -halfD, 0, 0, -1, (x - minX) / spanX, (y - minY) / spanY);
    }
    for (let i = 0; i < triData.indices.length; i += 3) {
      idxArr.push(backBase + triData.indices[i], backBase + triData.indices[i + 2], backBase + triData.indices[i + 1]);
    }

    // 2) Bevel Rings + Subdivided Side Walls for Outer Loop AND Every Hole Loop!
    const allLoops: { ring: Vec2[]; isHole: boolean }[] = [
      { ring: grp.outer, isHole: false },
      ...grp.holes.map((h) => ({ ring: h, isHole: true })),
    ];

    for (const { ring, isHole } of allLoops) {
      // Subdivide long perimeter edges so side walls also deform smoothly!
      const denseRing: Vec2[] = [];
      const sideMaxEdge = maxEdgeLen > 2 ? maxEdgeLen * 1.4 : 40;
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length];
        const segL = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const sub = clamp(Math.ceil(segL / sideMaxEdge), 1, 6);
        for (let s = 0; s < sub; s++) {
          denseRing.push([lerp(a[0], b[0], s / sub), lerp(a[1], b[1], s / sub)]);
        }
      }
      const n = denseRing.length;
      if (n < 3) continue;

      // Compute outward miter normal for each vertex in the loop
      // For CCW outer loop, right-hand normal of edge (dx, dy) is (dy, -dx) which points OUTWARD!
      // For CW hole loop, right-hand normal of edge (dx, dy) is (dy, -dx) which points INWARD INTO HOLE!
      // Wait: for holes, outward bevel expansion would narrow the hole slightly; we clamp hole bevel extra gently so holes stay crisp!
      const vertOutDir: Vec2[] = [];
      const vertBevScale: number[] = [];

      // Estimate hole max safe offset from hole bounding box
      let hSpan = maxDim;
      if (isHole) {
        let hx0 = Infinity, hy0 = Infinity, hx1 = -Infinity, hy1 = -Infinity;
        for (const [x, y] of denseRing) {
          if (x < hx0) hx0 = x; if (y < hy0) hy0 = y;
          if (x > hx1) hx1 = x; if (y > hy1) hy1 = y;
        }
        hSpan = Math.min(hx1 - hx0, hy1 - hy0);
      }

      for (let i = 0; i < n; i++) {
        const prev = denseRing[(i - 1 + n) % n];
        const curr = denseRing[i];
        const next = denseRing[(i + 1) % n];
        const e0x = curr[0] - prev[0], e0y = curr[1] - prev[1];
        const e1x = next[0] - curr[0], e1y = next[1] - curr[1];
        const l0 = Math.hypot(e0x, e0y) || 1;
        const l1 = Math.hypot(e1x, e1y) || 1;
        const n0x = e0y / l0, n0y = -e0x / l0;
        const n1x = e1y / l1, n1y = -e1x / l1;
        let mx = n0x + n1x, my = n0y + n1y;
        const ml = Math.hypot(mx, my);
        if (ml < 1e-4) { mx = n0x; my = n0y; } else { mx /= ml; my /= ml; }
        const dot = clamp(mx * n0x + my * n0y, 0.35, 1.0);
        const miterLim = Math.min(1.45, 1 / dot);
        const localMaxR = isHole ? Math.min(bevR * 0.28, hSpan * 0.14) : bevR;
        vertOutDir.push([mx, my]);
        vertBevScale.push(localMaxR * miterLim);
      }

      // Build profile cross-section stations from front (+halfD) to back (-halfD)
      // Each station: { rFactor: 0..1, z: number, nz: number, nr: number }
      const stations: Array<{ rFactor: number; z: number; nz: number; nr: number }> = [];
      if (bevelSegs > 0 && bevZ > 0.05) {
        // Front bevel curve
        for (let s = 0; s <= bevelSegs; s++) {
          const ang = (s / bevelSegs) * (Math.PI * 0.5);
          stations.push({
            rFactor: Math.sin(ang),
            z: halfD - bevZ * (1 - Math.cos(ang)),
            nz: Math.cos(ang),
            nr: Math.sin(ang),
          });
        }
        // Middle Z slices along side wall for smooth Bend/Twist/Field deformation
        const midZ0 = halfD - bevZ;
        const midZ1 = -halfD + bevZ;
        const zSlices = Math.max(1, Math.min(4, Math.ceil((midZ0 - midZ1) / 28)));
        for (let z = 1; z < zSlices; z++) {
          stations.push({
            rFactor: 1,
            z: lerp(midZ0, midZ1, z / zSlices),
            nz: 0,
            nr: 1,
          });
        }
        // Back bevel curve
        for (let s = 0; s <= bevelSegs; s++) {
          const ang = (s / bevelSegs) * (Math.PI * 0.5);
          stations.push({
            rFactor: Math.cos(ang),
            z: -halfD + bevZ * (1 - Math.sin(ang)),
            nz: -Math.sin(ang),
            nr: Math.cos(ang),
          });
        }
      } else {
        const zSlices = Math.max(1, Math.min(4, Math.ceil(d / 28)));
        for (let z = 0; z <= zSlices; z++) {
          stations.push({ rFactor: 0, z: lerp(halfD, -halfD, z / zSlices), nz: 0, nr: 1 });
        }
      }

      // Emit quad strips between consecutive stations with crisp edge-aware shading
      const ringStarts: number[] = [];
      let perimAccum = 0;
      const uPerim: number[] = [0];
      for (let i = 1; i <= n; i++) {
        const a = denseRing[i - 1], b = denseRing[i % n];
        perimAccum += Math.hypot(b[0] - a[0], b[1] - a[1]);
        uPerim.push(perimAccum / maxDim);
      }

      for (let stIdx = 0; stIdx < stations.length; stIdx++) {
        const st = stations[stIdx];
        const vCoord = (halfD - st.z) / d;
        ringStarts.push(posArr.length / 3);
        for (let i = 0; i <= n; i++) {
          const vi = i % n;
          const p = denseRing[vi];
          const dir = vertOutDir[vi];
          const off = vertBevScale[vi] * st.rFactor;
          const px = p[0] + dir[0] * off;
          const py = p[1] + dir[1] * off;
          const nx = dir[0] * st.nr;
          const ny = dir[1] * st.nr;
          const nl = Math.hypot(nx, ny, st.nz) || 1;
          pushVert(px, py, st.z, nx / nl, ny / nl, st.nz / nl, uPerim[i], vCoord);
        }
      }

      const stride = n + 1;
      for (let stIdx = 0; stIdx < stations.length - 1; stIdx++) {
        const r0 = ringStarts[stIdx];
        const r1 = ringStarts[stIdx + 1];
        for (let i = 0; i < n; i++) {
          const a = r0 + i, b = r0 + i + 1;
          const c = r1 + i, e = r1 + i + 1;
          // Outward-facing CCW winding on side wall & bevel
          idxArr.push(a, c, b, b, c, e);
        }
      }
    }
  }

  const positions = new Float32Array(posArr);
  const normals = new Float32Array(normArr);
  const uvs = new Float32Array(uvArr);
  const heat = new Float32Array(positions.length / 3);
  const indices = new Uint32Array(idxArr);
  const bounds = computeBounds(positions);
  return { positions, normals, uvs, heat, indices, boundsMin: bounds.min, boundsMax: bounds.max };
}

// ============================================================================
// Parametric 3D Primitives (Box, Cylinder, Sphere, Plane, Sculpted Anvil & Hammer!)
// ============================================================================
export function buildPrimitiveMesh3D(kind: PrimitiveMeshKind, size: Vec3): TriMesh3D {
  const sx = Math.max(1, size[0]);
  const sy = Math.max(1, size[1]);
  const sz = Math.max(1, size[2]);

  if (kind === 'plane') {
    return buildSubdividedPlane(sx, sz, 16, 16);
  }
  if (kind === 'sphere') {
    return buildSphereMesh(sx * 0.5, sy * 0.5, sz * 0.5, 24, 16);
  }
  if (kind === 'cylinder') {
    return buildCylinderMesh(sx * 0.5, sy, sz * 0.5, 28);
  }
  if (kind === 'anvil') {
    return buildSculptedAnvilMesh(sx, sy, sz);
  }
  if (kind === 'hammer') {
    return buildSculptedHammerMesh(sx, sy, sz);
  }
  return buildBeveledBoxMesh(sx, sy, sz, Math.min(sx, sy, sz) * 0.06);
}

function buildSubdividedPlane(w: number, d: number, segX: number, segZ: number): TriMesh3D {
  const pos: number[] = [], norm: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let iz = 0; iz <= segZ; iz++) {
    const vz = iz / segZ;
    for (let ix = 0; ix <= segX; ix++) {
      const ux = ix / segX;
      pos.push((ux - 0.5) * w, 0, (vz - 0.5) * d);
      norm.push(0, 1, 0);
      uv.push(ux, vz);
    }
  }
  const stride = segX + 1;
  for (let iz = 0; iz < segZ; iz++) {
    for (let ix = 0; ix < segX; ix++) {
      const a = iz * stride + ix, b = a + 1, c = a + stride, e = c + 1;
      idx.push(a, c, b, b, c, e);
    }
  }
  const positions = new Float32Array(pos);
  const bounds = computeBounds(positions);
  return {
    positions,
    normals: new Float32Array(norm),
    uvs: new Float32Array(uv),
    heat: new Float32Array(positions.length / 3),
    indices: new Uint32Array(idx),
    boundsMin: bounds.min,
    boundsMax: bounds.max,
  };
}

function buildBeveledBoxMesh(w: number, h: number, d: number, bevel = 4): TriMesh3D {
  // Build clean beveled box via subdivided faces + smooth normals
  const hw = w * 0.5, hh = h * 0.5, hd = d * 0.5;
  const pos: number[] = [], norm: number[] = [], uv: number[] = [], idx: number[] = [];

  const addFace = (origin: Vec3, uAxis: Vec3, vAxis: Vec3, nrm: Vec3, su = 4, sv = 4) => {
    const base = pos.length / 3;
    for (let iv = 0; iv <= sv; iv++) {
      const vf = iv / sv;
      for (let iu = 0; iu <= su; iu++) {
        const uf = iu / su;
        pos.push(
          origin[0] + uAxis[0] * uf + vAxis[0] * vf,
          origin[1] + uAxis[1] * uf + vAxis[1] * vf,
          origin[2] + uAxis[2] * uf + vAxis[2] * vf
        );
        norm.push(nrm[0], nrm[1], nrm[2]);
        uv.push(uf, vf);
      }
    }
    const st = su + 1;
    for (let iv = 0; iv < sv; iv++) {
      for (let iu = 0; iu < su; iu++) {
        const a = base + iv * st + iu, b = a + 1, c = a + st, e = c + 1;
        idx.push(a, b, c, b, e, c);
      }
    }
  };
  void bevel;
  // +Z Front
  addFace([-hw, -hh, hd], [w, 0, 0], [0, h, 0], [0, 0, 1]);
  // -Z Back
  addFace([hw, -hh, -hd], [-w, 0, 0], [0, h, 0], [0, 0, -1]);
  // +Y Top
  addFace([-hw, hh, hd], [w, 0, 0], [0, 0, -d], [0, 1, 0]);
  // -Y Bottom
  addFace([-hw, -hh, -hd], [w, 0, 0], [0, 0, d], [0, -1, 0]);
  // +X Right
  addFace([hw, -hh, hd], [0, 0, -d], [0, h, 0], [1, 0, 0]);
  // -X Left
  addFace([-hw, -hh, -hd], [0, 0, d], [0, h, 0], [-1, 0, 0]);

  const positions = new Float32Array(pos);
  const bounds = computeBounds(positions);
  return {
    positions,
    normals: new Float32Array(norm),
    uvs: new Float32Array(uv),
    heat: new Float32Array(positions.length / 3),
    indices: new Uint32Array(idx),
    boundsMin: bounds.min,
    boundsMax: bounds.max,
  };
}

function buildCylinderMesh(rx: number, h: number, rz: number, segs = 28): TriMesh3D {
  const pos: number[] = [], norm: number[] = [], uv: number[] = [], idx: number[] = [];
  const hh = h * 0.5;
  // Side
  for (let iy = 0; iy <= 2; iy++) {
    const y = lerp(-hh, hh, iy / 2);
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const cx = Math.cos(a), sz = Math.sin(a);
      pos.push(cx * rx, y, sz * rz);
      const nl = Math.hypot(cx / rx, sz / rz) || 1;
      norm.push((cx / rx) / nl, 0, (sz / rz) / nl);
      uv.push(i / segs, iy / 2);
    }
  }
  const st = segs + 1;
  for (let iy = 0; iy < 2; iy++) {
    for (let i = 0; i < segs; i++) {
      const a = iy * st + i, b = a + 1, c = a + st, e = c + 1;
      idx.push(a, c, b, b, c, e);
    }
  }
  // Top & Bottom caps
  const addCap = (y: number, ny: number) => {
    const center = pos.length / 3;
    pos.push(0, y, 0); norm.push(0, ny, 0); uv.push(0.5, 0.5);
    const start = pos.length / 3;
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      pos.push(Math.cos(a) * rx, y, Math.sin(a) * rz);
      norm.push(0, ny, 0);
      uv.push(0.5 + 0.5 * Math.cos(a), 0.5 + 0.5 * Math.sin(a));
    }
    for (let i = 0; i < segs; i++) {
      if (ny > 0) idx.push(center, start + i + 1, start + i);
      else idx.push(center, start + i, start + i + 1);
    }
  };
  addCap(hh, 1);
  addCap(-hh, -1);
  const positions = new Float32Array(pos);
  const bounds = computeBounds(positions);
  return {
    positions, normals: new Float32Array(norm), uvs: new Float32Array(uv),
    heat: new Float32Array(positions.length / 3), indices: new Uint32Array(idx),
    boundsMin: bounds.min, boundsMax: bounds.max,
  };
}

function buildSphereMesh(rx: number, ry: number, rz: number, segU = 24, segV = 16): TriMesh3D {
  const pos: number[] = [], norm: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let iv = 0; iv <= segV; iv++) {
    const v = iv / segV;
    const phi = v * Math.PI;
    for (let iu = 0; iu <= segU; iu++) {
      const u = iu / segU;
      const theta = u * Math.PI * 2;
      const nx = Math.sin(phi) * Math.cos(theta);
      const ny = Math.cos(phi);
      const nz = Math.sin(phi) * Math.sin(theta);
      pos.push(nx * rx, ny * ry, nz * rz);
      norm.push(nx, ny, nz);
      uv.push(u, v);
    }
  }
  const st = segU + 1;
  for (let iv = 0; iv < segV; iv++) {
    for (let iu = 0; iu < segU; iu++) {
      const a = iv * st + iu, b = a + 1, c = a + st, e = c + 1;
      idx.push(a, b, c, b, e, c);
    }
  }
  const positions = new Float32Array(pos);
  const bounds = computeBounds(positions);
  return {
    positions, normals: new Float32Array(norm), uvs: new Float32Array(uv),
    heat: new Float32Array(positions.length / 3), indices: new Uint32Array(idx),
    boundsMin: bounds.min, boundsMax: bounds.max,
  };
}

/**
 * Sculpted Heavy Forge Anvil Slab (top surface at y = 0 so character sits cleanly on y = 0!).
 */
function buildSculptedAnvilMesh(w: number, h: number, d: number): TriMesh3D {
  // Multi-tiered forged iron anvil pedestal with beveled upper work surface at y = 0
  const topSlab = buildExtrudedMesh3D(
    [{
      closed: true,
      points: [
        [-w * 0.48, -d * 0.46], [w * 0.48, -d * 0.46],
        [w * 0.50, -d * 0.36], [w * 0.50, d * 0.36],
        [w * 0.48, d * 0.46], [-w * 0.48, d * 0.46],
        [-w * 0.50, d * 0.36], [-w * 0.50, -d * 0.36],
      ],
    }],
    h * 0.36, Math.min(8, h * 0.08), 2, 10
  );
  // Rotate topSlab so extrusion Z becomes vertical Y (top face sits precisely at y = 0!)
  const rotTop = rotateMeshX(topSlab, -90);
  translateMesh(rotTop, 0, -h * 0.18, 0);

  // Narrowed waist + wider stepped base
  const waist = buildBeveledBoxMesh(w * 0.72, h * 0.34, d * 0.68, 4);
  translateMesh(waist, 0, -h * 0.52, 0);

  const foot = buildBeveledBoxMesh(w * 0.92, h * 0.32, d * 0.86, 4);
  translateMesh(foot, 0, -h * 0.84, 0);

  return mergeMeshes([rotTop, waist, foot]);
}

/**
 * Sculpted Blacksmith Forging Hammer:
 * Origin (0, 0, 0) is placed at the BOTTOM STRIKING FACE CENTER (so animating hammer position
 * to the character's surface makes the striking face kiss the exact dent target!).
 */
function buildSculptedHammerMesh(w: number, h: number, d: number): TriMesh3D {
  // Heavy octagonal-chamfered hammer head extending along Y from 0 (striking face) to +h
  const hw = w * 0.5, hd = d * 0.5;
  const ch = Math.min(hw, hd) * 0.24;
  const headProfile: Poly2D[] = [{
    closed: true,
    points: [
      [-hw + ch, -hd], [hw - ch, -hd], [hw, -hd + ch], [hw, hd - ch],
      [hw - ch, hd], [-hw + ch, hd], [-hw, hd - ch], [-hw, -hd + ch],
    ],
  }];
  const headRaw = buildExtrudedMesh3D(headProfile, h, Math.min(7, h * 0.08), 2, 6);
  const head = rotateMeshX(headRaw, -90);
  translateMesh(head, 0, h * 0.5, 0);

  // Reinforcing collar around the eye
  const collar = buildBeveledBoxMesh(w * 0.54, h * 0.36, d * 1.12, 3);
  translateMesh(collar, 0, h * 0.52, 0);

  // Long handle extending horizontally to +X so swinging hammer reads instantly like a real forging sledge!
  const handle = buildCylinderMesh(w * 0.15, w * 2.8, d * 0.19, 14);
  const handleRot = rotateMeshZ(handle, 90);
  translateMesh(handleRot, w * 1.55, h * 0.54, 0);

  return mergeMeshes([head, collar, handleRot]);
}

// ============================================================================
// Mesh Utility Transforms & Merge
// ============================================================================
export function emptyMesh(): TriMesh3D {
  return {
    positions: new Float32Array(0),
    normals: new Float32Array(0),
    uvs: new Float32Array(0),
    heat: new Float32Array(0),
    indices: new Uint32Array(0),
    boundsMin: [0, 0, 0],
    boundsMax: [0, 0, 0],
  };
}

export function cloneMesh(m: TriMesh3D): TriMesh3D {
  return {
    positions: new Float32Array(m.positions),
    normals: new Float32Array(m.normals),
    uvs: new Float32Array(m.uvs),
    heat: new Float32Array(m.heat),
    indices: new Uint32Array(m.indices),
    boundsMin: [...m.boundsMin],
    boundsMax: [...m.boundsMax],
  };
}

export function computeBounds(positions: Float32Array): { min: Vec3; max: Vec3 } {
  if (positions.length === 0) return { min: [0, 0, 0], max: [0, 0, 0] };
  let x0 = Infinity, y0 = Infinity, z0 = Infinity;
  let x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i], y = positions[i + 1], z = positions[i + 2];
    if (x < x0) x0 = x; if (y < y0) y0 = y; if (z < z0) z0 = z;
    if (x > x1) x1 = x; if (y > y1) y1 = y; if (z > z1) z1 = z;
  }
  return { min: [x0, y0, z0], max: [x1, y1, z1] };
}

export function translateMesh(m: TriMesh3D, dx: number, dy: number, dz: number): void {
  const p = m.positions;
  for (let i = 0; i < p.length; i += 3) {
    p[i] += dx; p[i + 1] += dy; p[i + 2] += dz;
  }
  const b = computeBounds(p);
  m.boundsMin = b.min; m.boundsMax = b.max;
}

export function rotateMeshX(m: TriMesh3D, deg: number): TriMesh3D {
  const out = cloneMesh(m);
  const rad = deg * DEG2RAD, c = Math.cos(rad), s = Math.sin(rad);
  for (let i = 0; i < out.positions.length; i += 3) {
    const y = out.positions[i + 1], z = out.positions[i + 2];
    out.positions[i + 1] = y * c - z * s;
    out.positions[i + 2] = y * s + z * c;
    const ny = out.normals[i + 1], nz = out.normals[i + 2];
    out.normals[i + 1] = ny * c - nz * s;
    out.normals[i + 2] = ny * s + nz * c;
  }
  const b = computeBounds(out.positions);
  out.boundsMin = b.min; out.boundsMax = b.max;
  return out;
}

export function rotateMeshZ(m: TriMesh3D, deg: number): TriMesh3D {
  const out = cloneMesh(m);
  const rad = deg * DEG2RAD, c = Math.cos(rad), s = Math.sin(rad);
  for (let i = 0; i < out.positions.length; i += 3) {
    const x = out.positions[i], y = out.positions[i + 1];
    out.positions[i] = x * c - y * s;
    out.positions[i + 1] = x * s + y * c;
    const nx = out.normals[i], ny = out.normals[i + 1];
    out.normals[i] = nx * c - ny * s;
    out.normals[i + 1] = nx * s + ny * c;
  }
  const b = computeBounds(out.positions);
  out.boundsMin = b.min; out.boundsMax = b.max;
  return out;
}

export function transformMeshByMatrix(m: TriMesh3D, mat: Mat4): TriMesh3D {
  const out = cloneMesh(m);
  const p = out.positions, n = out.normals;
  for (let i = 0; i < p.length; i += 3) {
    const tp = m4TransformPoint(mat, [p[i], p[i + 1], p[i + 2]]);
    p[i] = tp[0]; p[i + 1] = tp[1]; p[i + 2] = tp[2];
    const tn = v3Norm(m4TransformDir(mat, [n[i], n[i + 1], n[i + 2]]));
    n[i] = tn[0]; n[i + 1] = tn[1]; n[i + 2] = tn[2];
  }
  const b = computeBounds(p);
  out.boundsMin = b.min; out.boundsMax = b.max;
  return out;
}

export function mergeMeshes(meshes: TriMesh3D[]): TriMesh3D {
  const valid = meshes.filter((m) => m.positions.length > 0 && m.indices.length > 0);
  if (valid.length === 0) return emptyMesh();
  if (valid.length === 1) return cloneMesh(valid[0]);

  let totalV = 0, totalI = 0;
  for (const m of valid) {
    totalV += m.positions.length / 3;
    totalI += m.indices.length;
  }
  const positions = new Float32Array(totalV * 3);
  const normals = new Float32Array(totalV * 3);
  const uvs = new Float32Array(totalV * 2);
  const heat = new Float32Array(totalV);
  const indices = new Uint32Array(totalI);

  let vOff = 0, iOff = 0;
  for (const m of valid) {
    const vc = m.positions.length / 3;
    positions.set(m.positions, vOff * 3);
    normals.set(m.normals, vOff * 3);
    uvs.set(m.uvs, vOff * 2);
    heat.set(m.heat, vOff);
    for (let i = 0; i < m.indices.length; i++) {
      indices[iOff + i] = m.indices[i] + vOff;
    }
    vOff += vc;
    iOff += m.indices.length;
  }
  const b = computeBounds(positions);
  return { positions, normals, uvs, heat, indices, boundsMin: b.min, boundsMax: b.max };
}

// ============================================================================
// Recompute Normals After Real Geometric Deformation (2.8, 2.11)
// ============================================================================
export function recomputeMeshNormals(mesh: TriMesh3D): void {
  const pos = mesh.positions;
  const nrm = mesh.normals;
  const idx = mesh.indices;
  nrm.fill(0);

  for (let i = 0; i < idx.length; i += 3) {
    const i0 = idx[i] * 3, i1 = idx[i + 1] * 3, i2 = idx[i + 2] * 3;
    const e1x = pos[i1] - pos[i0], e1y = pos[i1 + 1] - pos[i0 + 1], e1z = pos[i1 + 2] - pos[i0 + 2];
    const e2x = pos[i2] - pos[i0], e2y = pos[i2 + 1] - pos[i0 + 1], e2z = pos[i2 + 2] - pos[i0 + 2];
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    nrm[i0] += nx; nrm[i0 + 1] += ny; nrm[i0 + 2] += nz;
    nrm[i1] += nx; nrm[i1 + 1] += ny; nrm[i1 + 2] += nz;
    nrm[i2] += nx; nrm[i2 + 1] += ny; nrm[i2 + 2] += nz;
  }
  for (let i = 0; i < nrm.length; i += 3) {
    const l = Math.hypot(nrm[i], nrm[i + 1], nrm[i + 2]);
    if (l > 1e-8) {
      nrm[i] /= l; nrm[i + 1] /= l; nrm[i + 2] /= l;
    } else {
      nrm[i] = 0; nrm[i + 1] = 0; nrm[i + 2] = 1;
    }
  }
  const b = computeBounds(pos);
  mesh.boundsMin = b.min;
  mesh.boundsMax = b.max;
}

// ============================================================================
// 3D Geometry Deformers: Bend, Twist, Space Field Vertex Deform, Puppet Pins (2.8)
// ============================================================================
export interface EvaluatedDeformerOp {
  type: MeshDeformer['type'];
  amount?: number;
  axis?: 'x' | 'y' | 'z';
  centerOffset?: number;
  field?: EvaluatedField | null;
  fieldStrength?: number;
  displaceMode?: 'vector' | 'normal' | 'radial' | 'dent';
  pins?: Array<{ rest: Vec2; target: Vec2; rotDeg: number; scalePct: number; radius: number }>;
}

export function applyDeformersToMesh(
  meshIn: TriMesh3D,
  deformers: EvaluatedDeformerOp[],
  worldMat: Mat4,
  time: number
): TriMesh3D {
  if (deformers.length === 0 || meshIn.positions.length === 0) return meshIn;
  const mesh = cloneMesh(meshIn);
  const pos = mesh.positions;
  const nrm = mesh.normals;
  const heat = mesh.heat;
  const invWorld = m4Invert(worldMat) ?? m4Identity();

  let deformed = false;

  for (const op of deformers) {
    if (op.type === 'bend') {
      const deg = op.amount ?? 0;
      if (Math.abs(deg) < 1e-3) continue;
      deformed = true;
      const radTotal = deg * DEG2RAD;
      const ax = op.axis ?? 'y';
      const offset = op.centerOffset ?? 0;
      const bMin = mesh.boundsMin, bMax = mesh.boundsMax;
      const span = Math.max(1, ax === 'x' ? bMax[0] - bMin[0] : ax === 'z' ? bMax[2] - bMin[2] : bMax[1] - bMin[1]);
      const R = span / radTotal;

      for (let i = 0; i < pos.length; i += 3) {
        let x = pos[i], y = pos[i + 1], z = pos[i + 2];
        if (ax === 'y') {
          const t = y - offset;
          const th = t / R;
          const rCur = R - z;
          pos[i] = x;
          pos[i + 1] = offset + Math.sin(th) * rCur;
          pos[i + 2] = R - Math.cos(th) * rCur;
        } else if (ax === 'x') {
          const t = x - offset;
          const th = t / R;
          const rCur = R - z;
          pos[i] = offset + Math.sin(th) * rCur;
          pos[i + 1] = y;
          pos[i + 2] = R - Math.cos(th) * rCur;
        } else {
          const t = z - offset;
          const th = t / R;
          const rCur = R - y;
          pos[i] = x;
          pos[i + 1] = R - Math.cos(th) * rCur;
          pos[i + 2] = offset + Math.sin(th) * rCur;
        }
      }
    } else if (op.type === 'twist') {
      const deg = op.amount ?? 0;
      if (Math.abs(deg) < 1e-3) continue;
      deformed = true;
      const radTotal = deg * DEG2RAD;
      const ax = op.axis ?? 'y';
      const offset = op.centerOffset ?? 0;
      const bMin = mesh.boundsMin, bMax = mesh.boundsMax;
      const span = Math.max(1, ax === 'x' ? bMax[0] - bMin[0] : ax === 'z' ? bMax[2] - bMin[2] : bMax[1] - bMin[1]);

      for (let i = 0; i < pos.length; i += 3) {
        const x = pos[i], y = pos[i + 1], z = pos[i + 2];
        if (ax === 'y') {
          const ang = ((y - offset) / span) * radTotal;
          const c = Math.cos(ang), s = Math.sin(ang);
          pos[i] = x * c - z * s;
          pos[i + 2] = x * s + z * c;
        } else if (ax === 'x') {
          const ang = ((x - offset) / span) * radTotal;
          const c = Math.cos(ang), s = Math.sin(ang);
          pos[i + 1] = y * c - z * s;
          pos[i + 2] = y * s + z * c;
        } else {
          const ang = ((z - offset) / span) * radTotal;
          const c = Math.cos(ang), s = Math.sin(ang);
          pos[i] = x * c - y * s;
          pos[i + 1] = x * s + y * c;
        }
      }
    } else if (op.type === 'field' && op.field) {
      const str = op.fieldStrength ?? 1;
      if (Math.abs(str) < 1e-5) continue;
      deformed = true;
      const mode = op.displaceMode ?? 'dent';
      const field = op.field;
      const gizCenter = field.debugGizmos[0]?.center ?? [0, 0, 0];

      for (let i = 0; i < pos.length; i += 3) {
        const vi = i / 3;
        const localP: Vec3 = [pos[i], pos[i + 1], pos[i + 2]];
        const worldP = m4TransformPoint(worldMat, localP);
        const sample = field.sample(worldP, time);
        if (sample.weight <= 1e-4) continue;

        heat[vi] = Math.max(heat[vi], clamp(sample.weight * Math.abs(str), 0, 2.5));

        let worldDelta: Vec3;
        if (mode === 'normal') {
          const wn = v3Norm(m4TransformDir(worldMat, [nrm[i], nrm[i + 1], nrm[i + 2]]));
          const mag = v3Len(sample.force) * str;
          worldDelta = v3Scale(wn, mag);
        } else if (mode === 'radial') {
          const radDir = v3Norm(v3Sub(worldP, gizCenter));
          worldDelta = v3Scale(radDir, v3Len(sample.force) * str);
        } else if (mode === 'dent') {
          // Forging hammer crater: depress along force direction + subtle outward rim bulge around crater edge!
          const w = clamp(sample.weight, 0, 1);
          const radVec = v3Sub(worldP, gizCenter);
          const radHoriz: Vec3 = [radVec[0], radVec[1], 0];
          const radLen = v3Len(radHoriz);
          const radDir: Vec3 = radLen > 1e-3 ? v3Scale(radHoriz, 1 / radLen) : [0, 0, 0];
          const rimFlare = Math.sin(w * Math.PI) * 0.42; // displaced metal bulges laterally!
          const fMag = v3Len(sample.force);
          worldDelta = v3Add(
            v3Scale(sample.force, str),
            v3Scale(radDir, fMag * rimFlare * Math.abs(str))
          );
        } else {
          worldDelta = v3Scale(sample.force, str);
        }

        const localDelta = m4TransformDir(invWorld, worldDelta);
        pos[i] += localDelta[0];
        pos[i + 1] += localDelta[1];
        pos[i + 2] += localDelta[2];
      }
    } else if (op.type === 'puppet' && op.pins && op.pins.length > 0) {
      deformed = true;
      // Note: Puppet pins rest/target are in 2D comp-Y-down local space; in 3D mesh Y is flipped (+Y up)
      const pins3D = op.pins.map((p) => ({
        rest: [p.rest[0], -p.rest[1]] as Vec2,
        target: [p.target[0], -p.target[1]] as Vec2,
        rotDeg: -p.rotDeg,
        scalePct: p.scalePct,
        radius: p.radius,
      }));
      const pts2: Vec2[] = [];
      for (let i = 0; i < pos.length; i += 3) pts2.push([pos[i], pos[i + 1]]);
      const moved = applyPuppetPins2D(pts2, pins3D);
      for (let i = 0; i < moved.length; i++) {
        pos[i * 3] = moved[i][0];
        pos[i * 3 + 1] = moved[i][1];
      }
    }
  }

  if (deformed) {
    recomputeMeshNormals(mesh);
  }
  return mesh;
}

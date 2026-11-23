import { ROUTE_COST } from '../data/specs.js';

const DIRS = [
  { dx: 0, dy: -1 },
  { dx: 1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 0 },
];

export function tileKey(x, y) {
  return `${x},${y}`;
}

export function isBasePassable(tile) {
  if (!tile) return false;
  return (
    tile.type === 'link' ||
    tile.type === 'legacy' ||
    tile.type === 'node' ||
    tile.type === 'entry' ||
    tile.type === 'exit'
  );
}

/**
 * Computes passability and movement cost for a tile given dynamic overrides:
 * overrides = {
 *   extraBlocked: Set<"x,y">,
 *   extraUnblocked: Set<"x,y">,
 *   extraDowngraded: Set<"x,y">,
 * }
 */
export function getTileTraversal(grid, x, y, dynamicState, overrides = null) {
  if (y < 0 || y >= grid.length || x < 0 || x >= grid[0].length) {
    return { passable: false, cost: Infinity };
  }
  const tile = grid[y][x];
  if (!isBasePassable(tile)) {
    return { passable: false, cost: Infinity };
  }
  const key = tileKey(x, y);

  let blocked = false;
  if (dynamicState) {
    if (dynamicState.isolatedNodes && dynamicState.isolatedNodes.has(key)) blocked = true;
    if (dynamicState.blockedTiles && dynamicState.blockedTiles.has(key)) blocked = true;
  }
  if (overrides) {
    if (overrides.extraBlocked && overrides.extraBlocked.has(key)) blocked = true;
    if (overrides.extraUnblocked && overrides.extraUnblocked.has(key)) blocked = false;
  }
  if (blocked) {
    return { passable: false, cost: Infinity };
  }

  let isSlow = tile.type === 'legacy';
  if (!isSlow && dynamicState && dynamicState.downgradedTiles && dynamicState.downgradedTiles.has(key)) {
    isSlow = true;
  }
  if (!isSlow && overrides && overrides.extraDowngraded && overrides.extraDowngraded.has(key)) {
    isSlow = true;
  }

  return {
    passable: true,
    cost: isSlow ? ROUTE_COST.LEGACY : ROUTE_COST.NORMAL,
  };
}

/**
 * Multi-exit reverse Dijkstra from ALL exits simultaneously.
 * Returns:
 * - dist[y][x]: shortest weighted distance to nearest exit (Infinity if unreachable)
 * - nextStep[y][x]: { x, y } next tile along shortest path toward nearest exit
 * - targetExit[y][x]: exitId ('X' | 'Y') reached by shortest path
 */
export function computeFlowField(grid, exits, dynamicState, overrides = null) {
  const h = grid.length;
  const w = grid[0].length;
  const dist = Array.from({ length: h }, () => new Float64Array(w).fill(Infinity));
  const nextStep = Array.from({ length: h }, () => new Array(w).fill(null));
  const targetExit = Array.from({ length: h }, () => new Array(w).fill(null));

  // Min-heap priority queue: [cost, x, y]
  const heap = [];
  const push = (item) => {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      const tmp = heap[p];
      heap[p] = heap[i];
      heap[i] = tmp;
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length > 0) {
      heap[0] = last;
      let i = 0;
      while (true) {
        const l = i * 2 + 1;
        const r = l + 1;
        let s = i;
        if (l < heap.length && heap[l][0] < heap[s][0]) s = l;
        if (r < heap.length && heap[r][0] < heap[s][0]) s = r;
        if (s === i) break;
        const tmp = heap[s];
        heap[s] = heap[i];
        heap[i] = tmp;
        i = s;
      }
    }
    return top;
  };

  for (const ex of exits) {
    dist[ex.y][ex.x] = 0;
    targetExit[ex.y][ex.x] = ex.id;
    push([0, ex.x, ex.y]);
  }

  while (heap.length > 0) {
    const [d, cx, cy] = pop();
    if (d > dist[cy][cx] + 1e-9) continue;

    // Entering (cx, cy) from neighbor (nx, ny) incurs the traversal cost of (cx, cy)
    // Wait: cost to move from neighbor (nx, ny) -> (cx, cy) should reflect entering (cx, cy) or average
    // Using half(cost(nx,ny)) + half(cost(cx,cy)) keeps symmetry and accurately penalizes stepping onto legacy tiles!
    const cTrav = getTileTraversal(grid, cx, cy, dynamicState, overrides);
    if (!cTrav.passable) continue;

    for (let k = 0; k < 4; k++) {
      const nx = cx + DIRS[k].dx;
      const ny = cy + DIRS[k].dy;
      const nTrav = getTileTraversal(grid, nx, ny, dynamicState, overrides);
      if (!nTrav.passable) continue;

      // Tiny deterministic tie-breaker prevents ambiguous zig-zags while staying symmetric
      const stepCost = (nTrav.cost + cTrav.cost) * 0.5;
      const nd = d + stepCost;
      if (nd + 1e-9 < dist[ny][nx]) {
        dist[ny][nx] = nd;
        nextStep[ny][nx] = { x: cx, y: cy };
        targetExit[ny][nx] = targetExit[cy][cx];
        push([nd, nx, ny]);
      }
    }
  }

  return { dist, nextStep, targetExit };
}

/**
 * Reconstructs full tile path from (sx, sy) to its nearest reachable exit using a computed flowField.
 */
export function tracePathFromFlow(flow, sx, sy, maxSteps = 200) {
  if (sy < 0 || sy >= flow.dist.length || sx < 0 || sx >= flow.dist[0].length) return null;
  if (!Number.isFinite(flow.dist[sy][sx])) return null;

  const path = [{ x: sx, y: sy }];
  let cx = sx;
  let cy = sy;
  let steps = 0;
  while (steps < maxSteps) {
    const nxt = flow.nextStep[cy][cx];
    if (!nxt) break;
    path.push({ x: nxt.x, y: nxt.y });
    cx = nxt.x;
    cy = nxt.y;
    steps++;
  }
  return {
    path,
    cost: flow.dist[sy][sx],
    exitId: flow.targetExit[sy][sx],
  };
}

/**
 * Computes routes for all entries in the map.
 */
export function computeAllEntryRoutes(mapDef, dynamicState, overrides = null) {
  const flow = computeFlowField(mapDef.grid, mapDef.exits, dynamicState, overrides);
  const routes = {};
  for (const entry of mapDef.entries) {
    routes[entry.id] = tracePathFromFlow(flow, entry.x, entry.y);
  }
  return { flow, routes };
}

/**
 * Checks if applying `overrides` keeps ALL entries AND ALL live ground enemies connected to an exit.
 * Also prevents blocking a tile currently occupied by a live ground enemy (so enemies are never trapped inside a newly sealed tile).
 */
export function validateConnectivity(mapDef, dynamicState, overrides, liveGroundEnemies = []) {
  const { flow, routes } = computeAllEntryRoutes(mapDef, dynamicState, overrides);

  const sealedEntries = [];
  for (const entry of mapDef.entries) {
    if (!routes[entry.id]) {
      sealedEntries.push(entry);
    }
  }

  const sealedEnemies = [];
  for (const en of liveGroundEnemies) {
    if (en.dead || en.flying) continue;
    const gx = Math.round(en.gx);
    const gy = Math.round(en.gy);
    const key = tileKey(gx, gy);
    // Check if enemy is standing directly on a newly blocked tile or cannot reach any exit
    if (overrides && overrides.extraBlocked && overrides.extraBlocked.has(key)) {
      // Allow isolating a node ONLY if enemy can step cleanly to an adjacent reachable tile;
      // actually, if enemy is right on the node, check if any adjacent tile has a finite path (we gently nudge enemy off the node if needed, EXCEPT if surrounded!)
      let hasEscape = false;
      for (const d of DIRS) {
        const ax = gx + d.dx;
        const ay = gy + d.dy;
        if (ay >= 0 && ay < flow.dist.length && ax >= 0 && ax < flow.dist[0].length) {
          if (Number.isFinite(flow.dist[ay][ax])) {
            hasEscape = true;
            break;
          }
        }
      }
      if (!hasEscape) {
        sealedEnemies.push({ enemy: en, x: gx, y: gy });
      }
    } else {
      if (gy < 0 || gy >= flow.dist.length || gx < 0 || gx >= flow.dist[0].length || !Number.isFinite(flow.dist[gy][gx])) {
        sealedEnemies.push({ enemy: en, x: gx, y: gy });
      }
    }
  }

  const ok = sealedEntries.length === 0 && sealedEnemies.length === 0;
  return { ok, flow, routes, sealedEntries, sealedEnemies };
}

/**
 * Compares two sets of entry routes and returns which entry IDs changed path or destination exit.
 */
export function diffEntryRoutes(oldRoutes, newRoutes) {
  const changed = [];
  for (const entryId of Object.keys(oldRoutes)) {
    const a = oldRoutes[entryId];
    const b = newRoutes[entryId];
    if (!a || !b) {
      changed.push(entryId);
      continue;
    }
    if (a.exitId !== b.exitId || a.path.length !== b.path.length) {
      changed.push(entryId);
      continue;
    }
    for (let i = 0; i < a.path.length; i++) {
      if (a.path[i].x !== b.path[i].x || a.path[i].y !== b.path[i].y) {
        changed.push(entryId);
        break;
      }
    }
  }
  return changed;
}

/**
 * Finds shortest path between two arbitrary passable tiles (used by Flood Packs seeking an adjacent tile to an isolated node).
 */
export function findTilePath(grid, sx, sy, tx, ty, dynamicState) {
  const h = grid.length;
  const w = grid[0].length;
  if (sx === tx && sy === ty) return [{ x: sx, y: sy }];

  const dist = Array.from({ length: h }, () => new Float64Array(w).fill(Infinity));
  const prev = Array.from({ length: h }, () => new Array(w).fill(null));
  const queue = [[0, sx, sy]];
  dist[sy][sx] = 0;

  while (queue.length > 0) {
    queue.sort((a, b) => a[0] - b[0]);
    const [d, cx, cy] = queue.shift();
    if (d > dist[cy][cx] + 1e-9) continue;
    if (cx === tx && cy === ty) break;

    for (const dir of DIRS) {
      const nx = cx + dir.dx;
      const ny = cy + dir.dy;
      const trav = getTileTraversal(grid, nx, ny, dynamicState, null);
      if (!trav.passable) continue;
      const nd = d + trav.cost;
      if (nd + 1e-9 < dist[ny][nx]) {
        dist[ny][nx] = nd;
        prev[ny][nx] = { x: cx, y: cy };
        queue.push([nd, nx, ny]);
      }
    }
  }

  if (!Number.isFinite(dist[ty][tx])) return null;
  const path = [];
  let cur = { x: tx, y: ty };
  while (cur) {
    path.push(cur);
    cur = prev[cur.y][cur.x];
  }
  path.reverse();
  return path;
}

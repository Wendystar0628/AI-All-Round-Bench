// Deterministic schedule of occasional events. At most one noticeable event at a time.
// Every query is a pure function of time, so exported frames are reproducible.
export const EVENT_DUR = { bell: 11, craneUp: 10, craneDown: 10, gust: 11, shadow: 16 };
const NORMAL_CYCLE = 96;
const NORMAL = [['bell', 4], ['craneUp', 20], ['gust', 34], ['craneDown', 50], ['shadow', 66]];

export const EV = { tourEvents: null }; // when set: array of [name, startTime]

function schedule() { return EV.tourEvents || NORMAL; }

// seconds since the event started (0..dur) or -1 if inactive
export function eventPhase(name, t) {
  const dur = EVENT_DUR[name];
  if (EV.tourEvents) {
    let best = -1;
    for (const [n, st] of EV.tourEvents) if (n === name && t >= st && t < st + dur) best = t - st;
    return best;
  }
  const local = ((t % NORMAL_CYCLE) + NORMAL_CYCLE) % NORMAL_CYCLE;
  for (const [n, st] of NORMAL) if (n === name && local >= st && local < st + dur) return local - st;
  return -1;
}

// seconds since the most recent start of the event (1e9 if never)
export function sinceLast(name, t) {
  if (EV.tourEvents) {
    let best = 1e9;
    for (const [n, st] of EV.tourEvents) if (n === name && t >= st) best = Math.min(best, t - st);
    return best;
  }
  const e = NORMAL.find((x) => x[0] === name); if (!e) return 1e9;
  const st = e[1];
  if (t < st) return 1e9;
  return (t - st) % NORMAL_CYCLE;
}

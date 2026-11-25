# Note segmentation from pitch salience + greedy mora->note mapping (dev only)
import numpy as np, os, sys, json
from scipy.ndimage import median_filter, maximum_filter1d
D = os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(D, 'align.py'), encoding='utf-8').read().split('# ---- features')[0])
z = np.load(os.path.join(D, 'out', 'sal.npz'))
sal, midi, times = z['sal'], z['midi'], z['times']
lo = np.searchsorted(midi, 58); hi = np.searchsorted(midi, 77)
S = sal[:, lo:hi]
pk = S.argmax(1)
f0 = midi[lo:hi][pk]
st = S.max(1)
med = np.median(S, 1) + 1e-9
peaky = st / med
loc = maximum_filter1d(st, size=300)  # 3 s local max
voiced = (st > 0.22 * loc) & (peaky > 4) & (st > np.percentile(st, 30))
# clean voicing: remove isolated frames
v = voiced.astype(float)
v = median_filter(v, size=5) > 0.5
f0s = median_filter(f0, size=5)
notes = []  # [start_idx, end_idx, pitch, kind]
i = 0; n = len(times)
while i < n:
    if not v[i]:
        i += 1; continue
    s = i; ref = [f0s[i]]; kind = 'v'
    j = i + 1; peak = st[i]; dipped = False
    while j < n and v[j]:
        r = np.median(ref[-6:])
        if abs(f0s[j] - r) > 0.7 and j + 2 < n and all(abs(f0s[j + q] - r) > 0.7 for q in range(3)):
            break
        peak = max(peak, st[j])
        if st[j] < 0.45 * peak: dipped = True
        if dipped and st[j] > 0.8 * peak and j - s > 6:
            kind_next = 'r'
            break
        ref.append(f0s[j]); j += 1
    if j - s >= 4:
        notes.append([s, j, float(np.median(f0s[s:j])), kind])
    i = j
note_t = [(times[a], times[b - 1], p, k) for a, b, p, k in notes]
json.dump(note_t, open(os.path.join(D, 'out', 'notes.json'), 'w'))

res = []
for li, (s0, text) in enumerate(LINES):
    toks = T(text)
    e = END_OVERRIDE.get(li, NEXT[li] - 0.12)
    allm = [(ti, mi, not m.startswith('*')) for ti, (ch, ms) in enumerate(toks) for mi, m in enumerate(ms)]
    K = sum(1 for a in allm if a[2])
    ns = [list(x) for x in note_t if x[0] >= s0 - 0.2 and x[0] < e]
    # greedy merge/split
    while len(ns) > K:
        # merge pair with smallest cost: small pitch diff + short durations + small gap
        best = None
        for q in range(len(ns) - 1):
            a, b = ns[q], ns[q + 1]
            cost = abs(a[2] - b[2]) * 1.0 + min(a[1] - a[0], b[1] - b[0]) * 6 + max(0, b[0] - a[1]) * 4
            if best is None or cost < best[0]: best = (cost, q)
        q = best[1]
        a, b = ns[q], ns[q + 1]
        ns[q] = [a[0], b[1], a[2], a[3]]
        del ns[q + 1]
    while len(ns) < K:
        # split longest note at the grid (8th) point nearest its middle
        q = max(range(len(ns)), key=lambda k: ns[k][1] - ns[k][0]) if ns else None
        if q is None:
            break
        a = ns[q]
        mid = (a[0] + a[1]) / 2
        g = 0.045 + round((mid - 0.045) / (BEAT / 2)) * BEAT / 2
        if not (a[0] + 0.05 < g < a[1] - 0.03): g = mid
        ns[q] = [a[0], g, a[2], a[3]]
        ns.insert(q + 1, [g, a[1], a[2], 's'])
    ot = [x[0] for x in ns]
    if len(ot) < K:
        ot += [ot[-1] + 0.15 * (k + 1) for k in range(K - len(ot))]
    # if first onset is much later than LRC start, trust LRC for first mora
    mt = []; oi = 0
    for (ti, mi, has) in allm:
        if has: mt.append(ot[oi]); oi += 1
        else: mt.append(None)
    for idx in range(len(mt)):
        if mt[idx] is None:
            prev = mt[idx - 1]
            nxt = next((mt[j] for j in range(idx + 1, len(mt)) if mt[j] is not None), e)
            mt[idx] = prev + (nxt - prev) * 0.5
    chars = []; k = 0
    for ti, (ch, ms) in enumerate(toks):
        if ms: chars.append([ch, round(float(mt[k]), 3)]); k += len(ms)
        else: chars.append([ch, None])
    last_end = ns[-1][1] if ns else e
    res.append({'s': s0, 'e': round(float(max(last_end, mt[-1] + 0.1)), 3), 'chars': chars,
                'mora': [round(float(x), 3) for x in mt], 'rom': [m for ch, ms in toks for m in ms],
                'nnotes': len([x for x in note_t if x[0] >= s0 - 0.2 and x[0] < e]), 'K': K})
    print('L%d K=%d notes=%d' % (li + 1, K, res[-1]['nnotes']), ' '.join('%s%.2f' % (c[0], c[1]) if c[1] is not None else c[0] for c in chars), '| end %.2f' % res[-1]['e'])
json.dump(res, open(os.path.join(D, 'out', 'align.json'), 'w', encoding='utf-8'), ensure_ascii=False)

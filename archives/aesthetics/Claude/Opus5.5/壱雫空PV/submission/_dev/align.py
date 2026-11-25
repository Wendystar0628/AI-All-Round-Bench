# Estimate per-mora onset times for each lyric line from the pitch-salience matrix (dev only)
import numpy as np, os, sys, json
from scipy.ndimage import median_filter, uniform_filter1d
D = os.path.dirname(os.path.abspath(__file__))
z = np.load(os.path.join(D, 'out', 'sal.npz'))
sal, midi, times = z['sal'], z['midi'], z['times']
BEAT = 60 / 204
FR = 0.01
# ---- lyric definitions: list of (char, [morae]); mora prefixed with '*' = no onset
def T(s):
    out = []
    for tok in s.split(' '):
        if not tok: continue
        ch, ms = tok.split(':')
        out.append((ch, ms.split(',') if ms else []))
    return out

LINES = [
 (0.923, 'も:mo し:shi こ:ko の:no 雨:a,me が:ga 上:a が:ga っ:*Q て:te も:mo'),
 (3.361, '忘:wa,su れ:re ず:zu に:ni 歩:a,ru い:i て:te く:ku よ:yo'),
 (5.665, '最:sa,i 初:sho の:no ひ:hi と:to し:shi ず:zu く:ku に:ni _:  顔:ka,o 上:a げ:ge た:ta 今:kyo 日:*u の:no 僕:bo,ku を:wo'),
 (18.860, '透:to,*o 明:me,*i な:na 傘:ka,sa で:de 作:tsu,ku る:ru _:  ひ:hi と:to り:ri 分:bu,n だ:da け:ke の:no 世:se 界:ka,i'),
 (22.893, '遮:sa,e,gi っ:*Q て:te 隠:ka,ku れ:re た:ta'),
 (24.535, 'そ:so っ:*Q と:to 逃:ni げ:ge 込:ko ん:n で:de い:i た:ta'),
 (27.617, 'ビ:bi ニ:ni ー:*- ル:ru 越:ko し:shi の:no 空:so,ra か:ka ら:ra'),
 (29.878, 'こ:ko ぼ:bo れ:re 落:o ち:chi る:ru 音:o,to 響:hi,bi い:i て:te'),
 (32.387, '弾:ha,ji け:ke た:ta 合:a,i 図:zu'),
 (34.558, '滲:ni,ji む:mu 心:ko,ko,ro へ:he と:to 溶:to け:ke た:ta'),
 (37.045, '泣:na き:ki じ:ja ゃ: く:ku っ:*Q て:te い:i る:ru _:  こ:ko の:no 空:so,ra と:to い:i こ:ko う:*u'),
 (41.872, 'ア:a ス:su フ:fa ァ: ル:ru ト:to 染:so め:me て:te い:i く:ku _:  溢:a,fu れ:re 出:da し:shi た:ta ス:su コ:ko ー:*- ル:ru'),
 (46.542, '通:to,*o り:ri 過:su ぎ:gi る:ru 時:to,ki を:wo _:  待:ma つ:tsu だ:da け:ke じ:ja ゃ: な:na く:ku て:te'),
 (51.053, '僕:bo,ku は:wa 見:mi つ:tsu め:me て:te い:i た:ta い:i ん:n だ:da よ:yo'),
 (55.450, '無:mu 色:sho,ku で:de も:mo そ:so こ:ko に:ni あ:a る:ru も:mo の:no'),
 (58.544, 'こ:ko の:no 雨:a,me が:ga 上:a が:ga っ:*Q て:te く:ku 時:to,ki'),
 (62.157, 'な:na に:ni も:mo な:na か:ka っ:*Q た:ta よ:yo う:*u に:ni'),
 (64.542, '消:ki え:e て:te く:ku 傘:ka,sa 花:ba,na み:mi た:ta い:i に:ni 心:ko,ko,ro は:wa'),
 (69.054, '上:jo,*u 手:zu に:ni 折:o り:ri 畳:ta,ta め:me な:na い:i か:ka ら:ra'),
 (71.527, '過:su ぎ:gi 去:sa っ:*Q て:te し:shi ま:ma う:u 瞬:shu,n 間:ka,n を:wo'),
 (74.948, '僕:bo,ku は:wa あ:a つ:tsu め:me た:ta い:i よ:yo _:  あ:a あ:a _:  ひ:hi と:to し:shi ず:zu く:ku を:wo'),
]
NEXT = [l[0] for l in LINES[1:]] + [81.43]
# explicit phrase ends where a long gap follows (from inspection of vocal energy)
END_OVERRIDE = {2: 11.62, 9: 36.45, 14: 58.25, 20: 79.45}

# ---- features
lo = np.searchsorted(midi, 59); hi = np.searchsorted(midi, 80)
S = sal[:, lo:hi]
pk = S.argmax(1)
pitch = midi[lo:hi][pk]
smax = S.max(1)
gs = np.percentile(smax, 95)
lv = np.log(smax / gs + 1e-3)
pitch_m = median_filter(pitch, size=5)
voiced = lv > np.log(0.08)

def onset_strength():
    n = len(times)
    o = np.zeros(n)
    for i in range(6, n - 7):
        if not voiced[i + 2] and not voiced[i + 4]:
            continue
        before = np.median(pitch_m[i - 6:i - 1]); after = np.median(pitch_m[i + 1:i + 6])
        vb = voiced[i - 6:i - 1].mean(); va = voiced[i + 1:i + 6].mean()
        pc = abs(after - before) if vb > 0.5 and va > 0.5 else 0
        pc_term = min(1.0, max(0, pc - 0.5) / 1.5)
        er = (lv[i + 1:i + 5].mean() - lv[i - 5:i - 1].mean())
        er_term = min(1.0, max(0, er) / 1.2)
        vo_term = 1.0 if (vb < 0.3 and va > 0.7) else 0
        o[i] = max(pc_term, er_term, vo_term) * min(1, va + 0.2)
    return o

o = onset_strength()

def grid_points(a, b):
    k0 = int(np.floor((a - 0.045) / (BEAT / 4))); k1 = int(np.ceil((b - 0.045) / (BEAT / 4)))
    pts = []
    for k in range(k0, k1 + 1):
        t = 0.045 + k * BEAT / 4
        if a <= t <= b: pts.append((t, k))
    return pts

def score_at(t):
    i0 = np.searchsorted(times, t - 0.045); i1 = np.searchsorted(times, t + 0.045)
    return o[i0:i1].max() if i1 > i0 else 0

results = []
for li, (s, text) in enumerate(LINES):
    toks = T(text)
    e = END_OVERRIDE.get(li, NEXT[li] - 0.12)
    # onset morae
    on = []  # (tok index, mora index)
    allm = []
    for ti, (ch, ms) in enumerate(toks):
        for mi, m in enumerate(ms):
            allm.append((ti, mi, not m.startswith('*')))
    K = sum(1 for a in allm if a[2])
    cands = grid_points(s - 0.11, e - 0.06)
    # first onset: nearest grid point to s
    sc = np.array([score_at(t) for t, k in cands])
    prior = np.array([(0.35 if k % 2 == 0 else 0.0) + (0.1 if k % 4 == 0 else 0) for t, k in cands])
    val = sc + prior
    C = len(cands)
    first = int(np.argmin([abs(t - s) for t, k in cands]))
    NEG = -1e9
    dp = np.full((K, C), NEG); bp = np.zeros((K, C), int)
    dp[0, first] = val[first] + 5
    for j in range(1, K):
        best = NEG; barg = -1
        for c in range(C):
            # max over previous c' < c
            if c - 1 >= 0 and dp[j - 1, c - 1] > best:
                best = dp[j - 1, c - 1]; barg = c - 1
            if best > NEG / 2:
                dp[j, c] = best + val[c]; bp[j, c] = barg
    # end: last onset should leave room; choose best final
    cend = int(np.argmax(dp[K - 1]))
    seq = [cend]
    for j in range(K - 1, 0, -1):
        seq.append(bp[j, seq[-1]])
    seq = seq[::-1]
    ot = [cands[c][0] for c in seq]
    ot[0] = s if abs(cands[first][0] - s) < 0.12 else cands[first][0]
    # assign mora times incl. non-onset morae (interpolate)
    mt = []
    oi = 0
    for idx, (ti, mi, has) in enumerate(allm):
        if has:
            mt.append(ot[oi]); oi += 1
        else:
            mt.append(None)
    # fill None: midpoint between previous onset and next onset
    for idx in range(len(mt)):
        if mt[idx] is None:
            prev = mt[idx - 1]
            nxt = next((mt[j] for j in range(idx + 1, len(mt)) if mt[j] is not None), e)
            mt[idx] = prev + (nxt - prev) * 0.5
    # char times
    chars = []
    k = 0
    for ti, (ch, ms) in enumerate(toks):
        if ms:
            chars.append([ch, round(mt[k], 3)]); k += len(ms)
        else:
            chars.append([ch, None])
    # chars without morae (small kana / space) inherit prev time
    for c in chars:
        pass
    results.append({'s': s, 'e': round(e, 3), 'chars': chars, 'mora': [round(x, 3) for x in mt],
                    'rom': [m for ch, ms in toks for m in ms]})
    print('L%d' % (li + 1), ' '.join('%s%.2f' % (c[0], c[1]) if c[1] is not None else c[0] for c in chars), '| end', round(e, 2))

json.dump(results, open(os.path.join(D, 'out', 'align.json'), 'w', encoding='utf-8'), ensure_ascii=False)

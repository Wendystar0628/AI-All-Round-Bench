// Siege bot v3: timeline planner + self-play rollouts for candidate selection.
#include "engine.hpp"
#include <vector>
#include <algorithm>
#include <cstdio>
#include <cstring>
#include <cstdlib>
#include <chrono>
using namespace std;

namespace {

const int MAXN = 24;
const int INF = 1000000000;
const int HT = 40;

// ---------------- static map data ----------------
int N, MAXT;
int GRW[MAXN], DD[MAXN][MAXN];

// ---------------- compact state ----------------
struct Flt { int owner, troops, to, left; };
struct PState {
    int turn = 1;
    int own[MAXN], trp[MAXN];
    vector<Flt> fl;
};

inline int sgn(int owner) { return owner == 1 ? 1 : (owner == 2 ? -1 : 0); }

void flipState(const PState& s, PState& o) {
    o.turn = s.turn;
    for (int i = 0; i < N; i++) { o.own[i] = s.own[i] ? 3 - s.own[i] : 0; o.trp[i] = s.trp[i]; }
    o.fl.resize(s.fl.size());
    for (size_t i = 0; i < s.fl.size(); i++) { o.fl[i] = s.fl[i]; o.fl[i].owner = 3 - s.fl[i].owner; }
}

// exact replica of engine settlement
void stepState(PState& s, const vector<Order>& a, const vector<Order>& b) {
    for (int side = 0; side < 2; side++) {
        const vector<Order>& os = side == 0 ? a : b;
        int owner = side + 1;
        for (size_t i = 0; i < os.size() && i < 1000; i++) {
            const Order& o = os[i];
            if (o.from < 0 || o.from >= N || o.to < 0 || o.to >= N) continue;
            if (s.own[o.from] != owner || o.from == o.to || o.troops <= 0 || o.troops > s.trp[o.from]) continue;
            s.trp[o.from] -= o.troops;
            s.fl.push_back({owner, o.troops, o.to, DD[o.from][o.to]});
        }
    }
    for (int i = 0; i < N; i++) if (s.own[i]) s.trp[i] += GRW[i];
    int sums[MAXN][3];
    bool any[MAXN];
    for (int i = 0; i < N; i++) any[i] = false;
    size_t w = 0;
    for (size_t i = 0; i < s.fl.size(); i++) {
        Flt f = s.fl[i];
        f.left--;
        if (f.left == 0) {
            if (!any[f.to]) {
                any[f.to] = true;
                sums[f.to][0] = sums[f.to][1] = sums[f.to][2] = 0;
                sums[f.to][s.own[f.to]] = s.trp[f.to];
            }
            sums[f.to][f.owner] += f.troops;
        } else {
            s.fl[w++] = f;
        }
    }
    s.fl.resize(w);
    for (int i = 0; i < N; i++) if (any[i]) {
        int o1 = -1, o2 = -1;
        for (int o = 0; o < 3; o++) {
            bool p = (o == s.own[i]) || sums[i][o] > 0;
            if (!p) continue;
            if (o1 < 0 || sums[i][o] > sums[i][o1]) { o2 = o1; o1 = o; }
            else if (o2 < 0 || sums[i][o] > sums[i][o2]) { o2 = o; }
        }
        int top = sums[i][o1], second = o2 >= 0 ? sums[i][o2] : 0;
        bool tie = (o2 >= 0 && top == second);
        if (!tie) s.own[i] = o1;
        s.trp[i] = tie ? 0 : top - second;
    }
    s.turn++;
}

// 0 ongoing, 1 me, 2 opp, 3 draw (turn already incremented)
int resultState(const PState& s) {
    bool alive[3] = {false, false, false};
    long long total[3] = {0, 0, 0};
    for (int i = 0; i < N; i++) { alive[s.own[i]] = true; total[s.own[i]] += s.trp[i]; }
    for (auto& f : s.fl) { alive[f.owner] = true; total[f.owner] += f.troops; }
    if (!alive[1] && !alive[2]) return 3;
    if (!alive[1]) return 2;
    if (!alive[2]) return 1;
    if (s.turn <= MAXT) return 0;
    return total[1] == total[2] ? 3 : (total[1] > total[2] ? 1 : 2);
}

// ---------------- planner ----------------
#ifndef STACKLOCK
#define STACKLOCK 60
#endif
#ifndef D_RHO
#define D_RHO 0.7
#endif
#ifndef D_HOP
#define D_HOP 0
#endif
#ifndef D_RESP
#define D_RESP 1
#endif
#ifndef D_RHON
#define D_RHON 1.0
#endif
#ifndef D_MARGIN
#define D_MARGIN 0
#endif
#ifndef D_HUBMODE
#define D_HUBMODE 1
#endif
#ifndef D_RESERVE
#define D_RESERVE 0
#endif
struct PP {
    double rho = D_RHO;
    double rhoN = D_RHON;
    int margin = D_MARGIN;
    int hubmode = D_HUBMODE;
    int reserve = D_RESERVE;
    bool funnel = true;
    int hop = D_HOP;
    int useResp = D_RESP;
    int wmax = 8;
};

struct Arr { int idx, owner, troops; };

// planner working data
int TURN, R;
int OWN[MAXN], TRP[MAXN];
vector<Arr> ARR[MAXN];
int TLown[MAXN][HT + 1], TLtr[MAXN][HT + 1];
int AV[MAXN];
const PP* CP;
int DBGP = 0;
#ifndef INFL_ON
#define INFL_ON 0
#endif
int INFL = 0;
#ifndef INFL_BETA
#define INFL_BETA 0.05
#endif
#ifndef INFL_C
#define INFL_C 3
#endif
double RM = 1.0;
struct Intent { int target; double rm; };

struct SimOut {
    int owner, troops;
    int firstLoss;
    long long value;
};

SimOut simNode(int j, int startOwner, int startTroops, const Arr* extra, int nExtra) {
    static Arr ev[1024];
    int E = 0;
    const vector<Arr>& base = ARR[j];
    int bi = 0, bn = (int)base.size();
    Arr ex[64];
    int ne = min(nExtra, 64);
    for (int i = 0; i < ne; i++) ex[i] = extra[i];
    for (int i = 1; i < ne; i++) {
        Arr t = ex[i]; int k = i - 1;
        while (k >= 0 && ex[k].idx > t.idx) { ex[k + 1] = ex[k]; k--; }
        ex[k + 1] = t;
    }
    int ei = 0;
    while ((bi < bn || ei < ne) && E < 1000) {
        if (ei >= ne || (bi < bn && base[bi].idx <= ex[ei].idx)) ev[E++] = base[bi++];
        else ev[E++] = ex[ei++];
    }
    int owner = startOwner, troops = startTroops;
    int cur = 0;
    int firstLoss = INF;
    int g = GRW[j];
    int k = 0;
    while (k < E) {
        int idx = ev[k].idx;
        if (idx > R) break;
        if (owner != 0) troops += g * (idx - cur);
        cur = idx;
        int sums[3] = {0, 0, 0};
        bool part[3] = {false, false, false};
        sums[owner] = troops; part[owner] = true;
        while (k < E && ev[k].idx == idx) {
            int tr = ev[k].troops;
            if (INFL && ev[k].owner == 2) tr = (int)(tr * (1.0 + INFL_BETA)) + INFL_C;
            sums[ev[k].owner] += tr; part[ev[k].owner] = true; k++;
        }
        int o1 = -1, o2 = -1;
        for (int o = 0; o < 3; o++) if (part[o]) {
            if (o1 < 0 || sums[o] > sums[o1]) { o2 = o1; o1 = o; }
            else if (o2 < 0 || sums[o] > sums[o2]) { o2 = o; }
        }
        int top = sums[o1], second = o2 >= 0 ? sums[o2] : 0;
        bool tie = (o2 >= 0 && top == second);
        if (!tie) owner = o1;
        troops = tie ? 0 : top - second;
        if (startOwner == 1 && owner != 1 && firstLoss == INF) firstLoss = idx;
    }
    if (owner != 0) troops += g * (R - cur);
    SimOut o;
    o.owner = owner; o.troops = troops; o.firstLoss = firstLoss;
    o.value = (long long)sgn(owner) * troops;
    return o;
}

void buildTL(int i) {
    int owner = OWN[i], troops = TRP[i];
    const vector<Arr>& base = ARR[i];
    size_t bi = 0;
    TLown[i][0] = owner; TLtr[i][0] = troops;
    for (int m = 1; m <= HT; m++) {
        if (owner != 0) troops += GRW[i];
        int sums[3] = {0, 0, 0};
        bool part[3] = {false, false, false};
        bool any = false;
        while (bi < base.size() && base[bi].idx < m) bi++;
        size_t bj = bi;
        while (bj < base.size() && base[bj].idx == m) {
            if (!any) { sums[owner] = troops; part[owner] = true; any = true; }
            sums[base[bj].owner] += base[bj].troops; part[base[bj].owner] = true; bj++;
        }
        if (any) {
            int o1 = -1, o2 = -1;
            for (int o = 0; o < 3; o++) if (part[o]) {
                if (o1 < 0 || sums[o] > sums[o1]) { o2 = o1; o1 = o; }
                else if (o2 < 0 || sums[o] > sums[o2]) { o2 = o; }
            }
            int top = sums[o1], second = o2 >= 0 ? sums[o2] : 0;
            bool tie = (o2 >= 0 && top == second);
            if (!tie) owner = o1;
            troops = tie ? 0 : top - second;
        }
        TLown[i][m] = owner; TLtr[i][m] = troops;
    }
}

int potentialEnemy(int j, int a) {
    int sum = 0;
    for (int i = 0; i < N; i++) {
        if (i == j) continue;
        int d = DD[i][j];
        if (d > a - 1) continue;
        int m = a - d;
        if (m > HT) m = HT;
        if (TLown[i][m] == 2) sum += TLtr[i][m];
    }
    return sum;
}

struct Send { int from, to, troops; };
struct Plan {
    bool ok = false;
    vector<Send> sends;
    int X = 0;
    long long dv = 0;
    double ratio = 0;
    int w = 0;
};

#ifndef RESP_IDX
#define RESP_IDX 2
#endif
#ifndef OWNHALF_ON
#define OWNHALF_ON 0
#endif
#ifndef OWNHALF_RHON
#define OWNHALF_RHON 0.0
#endif
#ifndef OWNHALF_M
#define OWNHALF_M 1
#endif
bool ownHalf(int j) {
    int dm = 1000, de = 1000;
    for (int i = 0; i < N; i++) {
        if (OWN[i] == 1) dm = min(dm, DD[i][j]);
        else if (OWN[i] == 2) de = min(de, DD[i][j]);
    }
    return dm + OWNHALF_M <= de;
}
#ifndef RHON_RESP
#define RHON_RESP 9.0
#endif
#ifndef STRIKE_MAXA
#define STRIKE_MAXA 99
#endif
#ifndef INFLOW_K
#define INFLOW_K 0.0
#endif
// expected future production forwarded into enemy node j before time a
double inflowEnemy(int j, int a) {
    int mx = 0;
    for (int i = 0; i < N; i++) if (OWN[i] == 2) mx = max(mx, TRP[i]);
    double w = (mx > 0 && TRP[j] * 2 >= mx) ? 1.0 : 0.25;
    double f = 0;
    for (int i = 0; i < N; i++) {
        if (OWN[i] != 2 || i == j) continue;
        int t = a - 1 - DD[i][j];
        if (t > 0) f += (double)GRW[i] * t;
    }
    return w * f;
}
int EXSRC[70];
int USEDW = 0;  // set by buildPlan: delay w

// my response troops that can reach j in time to counter a snipe launched by the nearest enemy node
int myResponse(int j, const Arr* ex, int ne) {
    int dwin = 1000;
    for (int i = 0; i < N; i++) if (OWN[i] == 2 && i != j) dwin = min(dwin, DD[i][j]);
    if (dwin >= 1000) return 0;
    int used[MAXN];
    for (int k = 0; k < N; k++) used[k] = 0;
    for (int q = 0; q < ne; q++) if (EXSRC[q] >= 0) used[EXSRC[q]] += ex[q].troops;
    int sum = 0;
    for (int k = 0; k < N; k++) {
        if (OWN[k] != 1 || k == j) continue;
        if (DD[k][j] > dwin - 1) continue;
        int av = max(AV[k], min(TLtr[k][RESP_IDX], TRP[k] + RESP_IDX * GRW[k] + 1000000)) - used[k];
        if (TLown[k][RESP_IDX] != 1) av = AV[k] - used[k];
        if (av > 0) sum += av;
    }
    return sum;
}

bool success(int j, const Arr* ex, int ne, bool defense) {
    if (defense) {
        SimOut o = simNode(j, OWN[j], TRP[j], ex, ne);
        return o.firstLoss == INF && o.owner == 1;
    }
    Arr tmp[70];
    for (int q = 0; q < ne; q++) tmp[q] = ex[q];
    int alast = 0;
    for (int q = 0; q < ne; q++) alast = max(alast, ex[q].idx);
    int n2 = ne;
    if (ne > 0) {
        if (OWN[j] == 0) {
            double rn = CP->rhoN;
            if (OWNHALF_ON && ownHalf(j)) rn = OWNHALF_RHON;
            int r = CP->useResp ? myResponse(j, ex, ne) : 0;
            if (r > 0 && RHON_RESP < rn && !(OWNHALF_ON && ownHalf(j))) rn = RHON_RESP;
            int pd = (int)(rn * RM * potentialEnemy(j, alast + 1));
            if (pd > 0) {
                tmp[n2++] = {alast + 1, 2, pd};
                if (r > 0) tmp[n2++] = {alast + 1, 1, r};
            }
        } else {
            if (alast > STRIKE_MAXA) return false;
            int pd = (int)(CP->rho * RM * potentialEnemy(j, alast));
            pd += (int)(INFLOW_K * inflowEnemy(j, alast));
            if (pd > 0) tmp[n2++] = {alast, 2, pd};
        }
    }
    SimOut o = simNode(j, OWN[j], TRP[j], tmp, n2);
    return o.owner == 1;
}

#ifndef ELIG_M
#define ELIG_M -100
#endif
bool eligible(int j) {
    if (ELIG_M <= -100) return true;
    int dm = 1000, de = 1000;
    for (int i = 0; i < N; i++) {
        if (OWN[i] == 1) dm = min(dm, DD[i][j]);
        else if (OWN[i] == 2) de = min(de, DD[i][j]);
    }
    return dm + ELIG_M <= de;
}

Plan buildPlan(int j, int w, bool defense) {
    Plan pl;
    if (!defense && OWN[j] == 0 && !eligible(j)) return pl;
    int src[MAXN], ns = 0;
    for (int i = 0; i < N; i++) if (i != j && OWN[i] == 1 && AV[i] > 0 && DD[i][j] + w <= R) src[ns++] = i;
    if (!ns) return pl;
    sort(src, src + ns, [&](int a, int b) { return DD[a][j] < DD[b][j]; });
    Arr ex[64]; int ne = 0;
    for (int q = 0; q < ns; q++) { EXSRC[ne] = src[q]; ex[ne++] = {DD[src[q]][j] + w, 1, AV[src[q]]}; }
    if (!success(j, ex, ne, defense)) {
#ifdef DBG
        if (DBGP && w == 0) {
            int alast = 0, tot = 0;
            for (int q = 0; q < ne; q++) { alast = max(alast, ex[q].idx); tot += ex[q].troops; }
            fprintf(stderr, "    infeasible tgt %d(own%d tr%d g%d): alast=%d totalAV=%d PD(a)=%d PD(a+1)=%d arrs=%d%c", j, OWN[j], TRP[j], GRW[j], alast, tot, potentialEnemy(j, alast), potentialEnemy(j, alast + 1), (int)ARR[j].size(), 10);
        }
#endif
        return pl;
    }
    ne = 0;
    vector<Send> sends;
    int X = 0;
    for (int q = 0; q < ns; q++) {
        int i = src[q];
        int idx = DD[i][j] + w;
        EXSRC[ne] = i;
        ex[ne] = {idx, 1, AV[i]};
        if (success(j, ex, ne + 1, defense)) {
            int lo = 0, hi = AV[i];
            while (lo < hi) {
                int mid = (lo + hi) / 2;
                ex[ne] = {idx, 1, mid};
                if (success(j, ex, ne + 1, defense)) hi = mid; else lo = mid + 1;
            }
            int x = min(AV[i], lo + CP->margin);
            if (x > 0) { ex[ne] = {idx, 1, x}; ne++; sends.push_back({i, j, x}); X += x; }
            break;
        } else {
            ex[ne] = {idx, 1, AV[i]}; ne++;
            sends.push_back({i, j, AV[i]}); X += AV[i];
        }
    }
    if (sends.empty()) return pl;
    SimOut with = simNode(j, OWN[j], TRP[j], ex, ne);
    SimOut without = simNode(j, OWN[j], TRP[j], nullptr, 0);
    long long arrivedX = 0;
    for (int q = 0; q < ne; q++) if (ex[q].idx <= R) arrivedX += ex[q].troops;
    pl.ok = true; pl.sends = sends; pl.X = X; pl.w = w;
    pl.dv = with.value - without.value - arrivedX;
    pl.ratio = (double)pl.dv / (X + 3);
    return pl;
}

void commit(const Plan& pl, vector<Order>& out) {
    for (auto& s : pl.sends) {
        AV[s.from] -= s.troops;
        ARR[s.to].push_back({DD[s.from][s.to], 1, s.troops});
        sort(ARR[s.to].begin(), ARR[s.to].end(), [](const Arr& a, const Arr& b) { return a.idx < b.idx; });
        buildTL(s.to);
        out.push_back({s.from, s.to, s.troops});
    }
}

int HUBFORCE = -1;
int chooseHub(int& hub) {
    if (HUBFORCE >= 0 && OWN[HUBFORCE] == 1) { hub = HUBFORCE; return hub; }
    double bestScore = 1e18; int best = -1;
    double curScore = 1e18;
    for (int i = 0; i < N; i++) {
        if (OWN[i] != 1) continue;
        SimOut b = simNode(i, 1, TRP[i], nullptr, 0);
        if (b.firstLoss != INF) continue;
        double sc = 0;
        if (CP->hubmode == 0) {
            for (int k = 0; k < N; k++) if (OWN[k] == 1) sc += (GRW[k] + 1) * DD[i][k];
        } else {
            double md = 1e9;
            for (int e = 0; e < N; e++) if (OWN[e] == 2) md = min(md, (double)DD[i][e]);
            for (int k = 0; k < N; k++) if (OWN[k] == 1) sc += (GRW[k] + 1) * DD[i][k] * 0.25;
            sc += md * 10;
        }
        if (i == hub) curScore = sc;
        if (sc < bestScore) { bestScore = sc; best = i; }
    }
    if (best < 0) return -1;
    if (hub >= 0 && OWN[hub] == 1 && curScore < 1e17 && (bestScore > curScore * 0.85 || TRP[hub] > STACKLOCK)) return hub;
    hub = best;
    return hub;
}

// Plan orders for side "1" of state s (owner 1 = self). hub is in/out persistent hub.
void planSide(const PState& s, const PP& pp, int& hub, vector<Order>& out, const vector<Intent>* forced = nullptr, vector<Intent>* picked = nullptr) {
    CP = &pp;
    TURN = s.turn; R = MAXT - TURN + 1;
    if (R < 1) return;
    for (int i = 0; i < N; i++) {
        OWN[i] = s.own[i]; TRP[i] = s.trp[i];
        ARR[i].clear();
    }
    for (auto& f : s.fl) ARR[f.to].push_back({f.left, f.owner, f.troops});
    for (int i = 0; i < N; i++)
        sort(ARR[i].begin(), ARR[i].end(), [](const Arr& a, const Arr& b) { return a.idx < b.idx; });
    for (int i = 0; i < N; i++) buildTL(i);
    for (int i = 0; i < N; i++) {
        AV[i] = 0;
        if (OWN[i] != 1) continue;
        SimOut base = simNode(i, 1, TRP[i], nullptr, 0);
        if (base.firstLoss != INF) { AV[i] = 0; continue; }
        int lo = 0, hi = TRP[i];
        INFL = INFL_ON;
        while (lo < hi) {
            int mid = (lo + hi + 1) / 2;
            SimOut o = simNode(i, 1, TRP[i] - mid, nullptr, 0);
            if (o.firstLoss == INF) lo = mid; else hi = mid - 1;
        }
        INFL = 0;
        AV[i] = lo;
    }
    // defense
    for (int pass = 0; pass < 2; pass++) {
        for (int j = 0; j < N; j++) {
            if (OWN[j] != 1) continue;
            SimOut base = simNode(j, 1, TRP[j], nullptr, 0);
            if (base.firstLoss == INF) continue;
            int saveAv = AV[j]; AV[j] = 0;
            Plan pl = buildPlan(j, 0, true);
            AV[j] = saveAv;
            if (pl.ok && pl.dv > 0) commit(pl, out);
        }
    }
    // offense / expansion
    if (forced) {
        for (const Intent& it : *forced) {
            int j = it.target;
            if (OWN[j] == 1) continue;
            RM = it.rm;
            Plan cand = buildPlan(j, 0, false);
            bool hasEnemyArr = false;
            for (auto& a : ARR[j]) if (a.owner != 1) { hasEnemyArr = true; break; }
            if (hasEnemyArr) {
                for (int w = 1; w <= pp.wmax; w++) {
                    Plan pw = buildPlan(j, w, false);
                    if (pw.ok && (!cand.ok || pw.ratio > cand.ratio)) cand = pw;
                }
            }
            RM = 1.0;
            if (!cand.ok || cand.dv <= 0 || cand.w != 0) continue;
            commit(cand, out);
        }
    } else {
    for (int round = 0; round < 40; round++) {
        Plan best; best.ratio = -1e18; bool have = false;
        for (int j = 0; j < N; j++) {
            if (OWN[j] == 1) continue;
            Plan cand = buildPlan(j, 0, false);
            bool hasEnemyArr = false;
            for (auto& a : ARR[j]) if (a.owner != 1) { hasEnemyArr = true; break; }
            if (hasEnemyArr) {
                for (int w = 1; w <= pp.wmax; w++) {
                    Plan pw = buildPlan(j, w, false);
                    if (pw.ok && (!cand.ok || pw.ratio > cand.ratio)) cand = pw;
                }
            }
#ifdef DBG
            if (DBGP) fprintf(stderr, "  round %d tgt %d own%d tr%d g%d: ok=%d w=%d X=%d dv=%lld ratio=%.2f%c", round, j, OWN[j], TRP[j], GRW[j], (int)cand.ok, cand.w, cand.X, cand.dv, cand.ratio, 10);
#endif
            if (!cand.ok || cand.dv <= 0) continue;
            if (cand.w != 0) continue;
            if (!have || cand.ratio > best.ratio) { best = cand; have = true; }
        }
        if (!have) break;
        commit(best, out);
        if (picked) picked->push_back({best.sends[0].to, 1.0});
    }
    }
    if (pp.funnel) {
        int h = chooseHub(hub);
        if (h >= 0) {
            for (int i = 0; i < N; i++) {
                if (OWN[i] != 1 || i == h) continue;
                int amt = AV[i] - pp.reserve;
                if (amt <= 0) continue;
                int dest = h;
                if (pp.hop) {
                    int bestk = -1;
                    for (int k = 0; k < N; k++) {
                        if (k == i || OWN[k] != 1 || DD[k][h] >= DD[i][h] || k == h) continue;
                        if (bestk < 0 || DD[i][k] < DD[i][bestk] || (DD[i][k] == DD[i][bestk] && DD[k][h] < DD[bestk][h])) bestk = k;
                    }
                    if (bestk >= 0) dest = bestk;
                }
                out.push_back({i, dest, amt});
                AV[i] -= amt;
            }
        }
    }
}

// ---------------- evaluation ----------------
double evalState(const PState& s) {
    int r = resultState(s);
    if (r == 1) return 1e7;
    if (r == 2) return -1e7;
    if (r == 3) return 0;
    double tm = 0, to = 0, gm = 0, go = 0;
    for (int i = 0; i < N; i++) {
        if (s.own[i] == 1) { tm += s.trp[i]; gm += GRW[i]; }
        else if (s.own[i] == 2) { to += s.trp[i]; go += GRW[i]; }
    }
    for (auto& f : s.fl) { if (f.owner == 1) tm += f.troops; else to += f.troops; }
    int remaining = MAXT - s.turn + 1;
    if (remaining < 0) remaining = 0;
    return (tm - to) + 0.9 * remaining * (gm - go);
}

int HUB_ME = -1, HUB_OP = -1;

#ifndef HORIZON
#define HORIZON 30
#endif
#ifndef BUDGET_MS
#define BUDGET_MS 18.0
#endif

double rollout(const PState& S, const vector<Order>& c, const vector<Order>& E0, const PP& ppMe, const PP& ppOp, int hubM, int hubE, int H) {
    PState X = S;
    stepState(X, c, E0);
    PState F;
    vector<Order> om, oo;
    for (int t = 1; t < H; t++) {
        if (resultState(X) != 0) break;
        om.clear(); oo.clear();
        planSide(X, ppMe, hubM, om);
        flipState(X, F);
        planSide(F, ppOp, hubE, oo);
        stepState(X, om, oo);
    }
    return evalState(X);
}

bool sameOrders(const vector<Order>& a, const vector<Order>& b) {
    if (a.size() != b.size()) return false;
    for (size_t k = 0; k < a.size(); k++) if (a[k].from != b[k].from || a[k].to != b[k].to || a[k].troops != b[k].troops) return false;
    return true;
}

}  // namespace

vector<Order> decide(const State& s) {
    auto t0 = chrono::steady_clock::now();
    auto elapsed = [&]() { return chrono::duration<double, milli>(chrono::steady_clock::now() - t0).count(); };
    static bool init = false;
    if (!init) {
        init = true;
        N = (int)s.nodes.size(); MAXT = s.max_turns;
        for (int i = 0; i < N; i++) {
            GRW[i] = s.nodes[i].growth;
            for (int j = 0; j < N; j++) DD[i][j] = s.dist[i][j];
        }
    }
    PState S;
    S.turn = s.turn;
    for (int i = 0; i < N; i++) { S.own[i] = s.nodes[i].owner; S.trp[i] = s.nodes[i].troops; }
    for (auto& f : s.fleets) S.fl.push_back({f.owner, f.troops, f.to, f.turns_left});

    PP ppMain;
    PP ppOp;
#ifdef OP_RHO
    ppOp.rho = OP_RHO;
#endif
#ifdef OP_RHON
    ppOp.rhoN = OP_RHON;
#endif
#ifdef OP_HOP
    ppOp.hop = OP_HOP;
#endif
    PState F; flipState(S, F);
    vector<Order> E0;
    int hubE = HUB_OP;
    planSide(F, ppOp, hubE, E0);
    HUB_OP = hubE;
    PState S2 = S;
    for (auto& o : E0) {
        S2.trp[o.from] -= o.troops;
        S2.fl.push_back({2, o.troops, o.to, DD[o.from][o.to]});
    }
    // baseline plan (greedy) and its picked intents
    vector<Intent> baseIntents;
    vector<Order> baseOrders;
    int hubStart = HUB_ME;
    int hubBase = HUB_ME;
    DBGP = 1;
    planSide(S2, ppMain, hubBase, baseOrders, nullptr, &baseIntents);
    DBGP = 0;
    HUB_ME = hubBase;
#ifdef NOROLL
    return baseOrders;
#endif
#ifndef LS_MAXT
#define LS_MAXT 30
#endif
    int H = min((int)HORIZON, MAXT - S.turn + 1);
    if (H < 2) return baseOrders;
    const double EPS_OPEN = 2.0;
#ifndef OPEN_K
#define OPEN_K 10
#endif

#ifndef OPEN_T
#define OPEN_T 1
#endif
#ifndef OPEN_BUDGET
#define OPEN_BUDGET 700.0
#endif
    if (S.turn <= OPEN_T) {
        // enumerate subsets of neutral targets for the opening
        vector<pair<double,int>> cl;
        int myHome = -1;
        for (int i = 0; i < N; i++) if (S2.own[i] == 1) myHome = i;
        for (int j = 0; j < N; j++) {
            if (S2.own[j] != 0) continue;
            double dist = myHome >= 0 ? DD[myHome][j] : 5;
            double ratio = (double)GRW[j] / (S2.trp[j] + 1) / (1.0 + 0.04 * dist);
            cl.push_back({ratio, j});
        }
        sort(cl.begin(), cl.end(), [](const pair<double,int>& a, const pair<double,int>& b) { return a.first > b.first; });
        int K = min((int)cl.size(), OPEN_K);
        int totAV = 0;
        for (int i = 0; i < N; i++) if (S2.own[i] == 1) totAV += S2.trp[i];
        vector<Order> bestO = baseOrders;
        double bV = rollout(S, baseOrders, E0, ppMain, ppOp, hubBase, hubE, H);
        int bestMask = -1;
        for (int mask = 1; mask < (1 << K); mask++) {
            if (elapsed() > OPEN_BUDGET) break;
            int pc = __builtin_popcount(mask);
            if (pc > 5) continue;
            int cost = 0;
            vector<Intent> in;
            for (int b = 0; b < K; b++) if (mask >> b & 1) { cost += S2.trp[cl[b].second] + 1; in.push_back({cl[b].second, 0.0}); }
            if (cost > totAV) continue;
            int hub = hubStart;
            vector<Order> o;
            PP pf = ppMain;
            planSide(S2, pf, hub, o, &in, nullptr);
            if (sameOrders(o, baseOrders)) continue;
            double v = rollout(S, o, E0, ppMain, ppOp, hub, hubE, H);
            if (v > bV + EPS_OPEN) { bV = v; bestO = o; bestMask = mask; HUB_ME = hub; }
        }
#ifdef DBG
        fprintf(stderr, "OPEN search: bestMask=%d V=%.1f (K=%d)%c", bestMask, bV, K, 10);
#endif
        return bestO;
    }
    if (S.turn > LS_MAXT) return baseOrders;
    struct Cand { vector<Intent> in; PP pp; int hubForce; vector<Order> orders; int hub; };
    Cand best;
    best.in = baseIntents; best.pp = ppMain; best.hubForce = -1;
    best.orders = baseOrders; best.hub = hubBase;
    double bestV = rollout(S, baseOrders, E0, ppMain, ppOp, hubBase, hubE, H);
#ifdef DBG
    fprintf(stderr, "T%d base V=%.1f orders=%zu%c", S.turn, bestV, baseOrders.size(), 10);
#endif
    vector<vector<Order>> seen;
    seen.push_back(baseOrders);
    const double EPS = 2.0;
    auto tryCand = [&](Cand c) {
        if (elapsed() > BUDGET_MS) return;
        int hub = hubStart;
        HUBFORCE = c.hubForce;
        c.orders.clear();
        planSide(S2, c.pp, hub, c.orders, &c.in, nullptr);
        HUBFORCE = -1;
        c.hub = hub;
        for (auto& sn : seen) if (sameOrders(sn, c.orders)) return;
        seen.push_back(c.orders);
        double v = rollout(S, c.orders, E0, ppMain, ppOp, c.hub, hubE, H);
        if (v > bestV + EPS) {
#ifdef DBG
            fprintf(stderr, "  LS accept: V %.1f -> %.1f (in=%zu funnel=%d hubForce=%d) orders=%zu%c", bestV, v, c.in.size(), (int)c.pp.funnel, c.hubForce, c.orders.size(), 10);
#endif
            bestV = v; best = c; }
    };
#ifndef LS_REMOVE
#define LS_REMOVE 1
#endif
#ifndef LS_FUNNEL
#define LS_FUNNEL 1
#endif
#ifndef LS_ADD
#define LS_ADD 1
#endif
#ifndef LS_HUB
#define LS_HUB 1
#endif
#ifndef LS_PASS
#define LS_PASS 1
#endif
    // 1. removals
    if (LS_REMOVE) for (size_t k = 0; k < baseIntents.size(); k++) {
        Cand c = best; c.in.erase(c.in.begin() + k);
        tryCand(c);
    }
    // 2. funnel toggle
    if (LS_FUNNEL) { Cand c = best; c.pp.funnel = !c.pp.funnel; tryCand(c); }
    // 3. additions with relaxed safety
    if (LS_ADD) for (int j = 0; j < N; j++) {
        if (S2.own[j] == 1) continue;
        bool present = false;
        for (auto& it : best.in) if (it.target == j) present = true;
        if (present) continue;
        for (double rm : {0.0, 0.5}) {
            Cand c = best; c.in.push_back({j, rm});
            tryCand(c);
        }
    }
    // 4. hub alternatives
    if (LS_HUB) for (int h = 0; h < N; h++) {
        if (S2.own[h] != 1 || h == best.hub) continue;
        Cand c = best; c.hubForce = h;
        tryCand(c);
    }
    // 5. pass
    if (LS_PASS) { Cand c = best; c.in.clear(); c.pp.funnel = false; tryCand(c); }
    HUB_ME = best.hub;
    return best.orders;
}

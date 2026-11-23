#include "engine.hpp"
#include <algorithm>
#include <chrono>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <vector>

// ---------------------------------------------------------------------------
// Compile-time knobs for local experiments (official build uses the defaults).
// ---------------------------------------------------------------------------
#ifndef SEARCH
#define SEARCH 0
#endif
#ifndef P_RDOWN
#define P_RDOWN 0
#endif
#ifndef P_HOLDEXP
#define P_HOLDEXP 0
#endif
#ifndef P_T1FULL
#define P_T1FULL 0
#endif
#ifndef P_LATEF
#define P_LATEF 0.0
#endif
#ifndef P_EXPC
#define P_EXPC 0.0
#endif
#ifndef P_EVCAP
#define P_EVCAP 60
#endif
#ifndef P_EVK
#define P_EVK 0.8
#endif
#ifndef P_ANYHOP
#define P_ANYHOP 1
#endif
#ifndef P_STACK
#define P_STACK 0
#endif
#ifndef P_STACKT
#define P_STACKT 6
#endif
#ifndef P_STACKD
#define P_STACKD 0.05
#endif
#ifndef P_STACKDIRECT
#define P_STACKDIRECT 0
#endif
#ifndef P_MODELS
#define P_MODELS 3
#endif
#ifndef P_AGG
#define P_AGG 0
#endif
#ifndef P_EPOS
#define P_EPOS 0
#endif
#ifndef P_OFFW
#define P_OFFW 0.0
#endif
#ifndef P_W0
#define P_W0 2.0
#endif
#ifndef P_POSJ
#define P_POSJ 20
#endif
#ifndef P_LADDER
#define P_LADDER 1
#endif
#ifndef P_FT0
#define P_FT0 99
#endif
#ifndef P_FSLOPE
#define P_FSLOPE 0.1
#endif
#ifndef P_FMIN
#define P_FMIN 0.3
#endif
#ifndef BUDGET_MS
#define BUDGET_MS 34.0
#endif
#ifndef P_ADEF
#define P_ADEF 1.0
#endif
#ifndef P_AEXP
#define P_AEXP 1.0
#endif
#ifndef P_AATT
#define P_AATT 1.0
#endif
#ifndef P_HV
#define P_HV 50
#endif
#ifndef P_REDIST
#define P_REDIST 1
#endif
#ifndef P_DEPTH
#define P_DEPTH 24
#endif
#ifndef P_DETOUR
#define P_DETOUR 1
#endif

namespace {

constexpr int MAXN = 24;
constexpr int H = 20;      // forecast horizon (max route length)
constexpr int RING = 32;

int N = 0;
int D[MAXN][MAXN];
int G[MAXN];
int ord[MAXN][MAXN];  // ord[p][i]: other nodes sorted by distance to p
int maxD = 20;
int MAXT = 200;
float fT[H + 2];   // discount of far-away (slow) threats

inline void battle(int& o, int& c, int a1, int a2) {
    int sm[3] = {0, a1, a2};
    sm[o] += c;
    int top, second, who;
    if (sm[0] >= sm[1] && sm[0] >= sm[2]) { who = 0; top = sm[0]; second = std::max(sm[1], sm[2]); }
    else if (sm[1] >= sm[2]) { who = 1; top = sm[1]; second = std::max(sm[0], sm[2]); }
    else { who = 2; top = sm[2]; second = std::max(sm[0], sm[1]); }
    if (top == second) c = 0;
    else { o = who; c = top - second; }
}

struct Sim {
    int turn;
    int base;
    int owner[MAXN];
    int troops[MAXN];
    int arr[RING][MAXN][2];
    uint32_t mask[RING];
    int fly[2];

    inline void launch(int pl, int from, int to, int x) {
        troops[from] -= x;
        int slot = (base + D[from][to]) & (RING - 1);
        arr[slot][to][pl - 1] += x;
        mask[slot] |= 1u << to;
        fly[pl - 1] += x;
    }
    inline void advance() {
        for (int i = 0; i < N; ++i)
            if (owner[i]) troops[i] += G[i];
        int slot = (base + 1) & (RING - 1);
        uint32_t m = mask[slot];
        while (m) {
            int i = __builtin_ctz(m);
            m &= m - 1;
            int a1 = arr[slot][i][0], a2 = arr[slot][i][1];
            arr[slot][i][0] = arr[slot][i][1] = 0;
            fly[0] -= a1;
            fly[1] -= a2;
            battle(owner[i], troops[i], a1, a2);
        }
        mask[slot] = 0;
        base = slot;
        ++turn;
    }
};

struct Ord { int from, to, x; };
#ifdef DEBUG
bool dbg = false;
#endif

struct Params {
    float aDef = (float)P_ADEF;    // fraction of enemy potential my nodes must withstand
    float aExp = (float)P_AEXP;    // fraction of enemy potential contesting my expansions
    float aAtt = (float)P_AATT;    // fraction of enemy reinforcement potential when I attack
    int HV = P_HV;
    bool redist = P_REDIST;
    bool expand = true;
    bool attack = true;
    bool exact = true;
};

// ---------------------------------------------------------------------------
// Planner: greedy mission-based policy for player `me` on a Sim.
// ---------------------------------------------------------------------------
struct Planner {
    Sim s;
    int me, opp, R;
    int8_t fo[MAXN][H + 1];
    int fc[MAXN][H + 1];
    int Q[MAXN][H + 1];
    int sufMin[MAXN][H + 2];
    int Wsuf[MAXN][H + 2];
    // potentials: troops a side can land on p by step t (launch >= now), R* = launch >= next turn
    int potM[MAXN][H + 1], potO[MAXN][H + 1], potRM[MAXN][H + 1], potRO[MAXN][H + 1];
    bool stable[MAXN];
    float lvl[MAXN];
    int sufSlack[MAXN][H + 2];
    int slackR[MAXN];
    int av[MAXN], avR[MAXN];
    Ord out[256];
    int nout;
    int missionEnd[64];
    int nmis;

    void forecast(int p) {
        int o = s.owner[p], c = s.troops[p];
        int8_t* po = fo[p];
        int* pc = fc[p];
        po[0] = (int8_t)o; pc[0] = c;
        const int g = G[p];
        const int mi = me - 1, oi = opp - 1;
        int q = 0;
        int* pq = Q[p];
        pq[0] = 0;
        bool st = (o == me);
        for (int k = 1; k <= H; ++k) {
            if (o) c += g;
            int slot = (s.base + k) & (RING - 1);
            int a1 = s.arr[slot][p][0], a2 = s.arr[slot][p][1];
            if (a1 | a2) battle(o, c, a1, a2);
            po[k] = (int8_t)o; pc[k] = c;
            if (o != me) st = false;
            q += g + s.arr[slot][p][mi] - s.arr[slot][p][oi];
            pq[k] = q;
        }
        stable[p] = st;
        int* sm = sufMin[p];
        sm[H + 1] = INT32_MAX;
        for (int k = H; k >= 0; --k) sm[k] = std::min(sm[k + 1], pq[k]);
        int* w = Wsuf[p];
        w[H + 1] = 0;
        for (int k = H; k >= 0; --k) w[k] = w[k + 1] + (po[k] == me ? 0 : (po[k] == 0 ? 1 : 2));
    }

    // add (sign=+1) or remove (sign=-1) node m's contribution to everybody's potentials
    void contrib(int m, int sign) {
        const int8_t* mo = fo[m];
        const int* mc = fc[m];
        for (int p = 0; p < N; ++p) {
            if (p == m) continue;
            int d = D[m][p];
            int* pm = potM[p]; int* po = potO[p]; int* prm = potRM[p]; int* pro = potRO[p];
            if (d <= H) {
                int o = mo[0], v = sign * mc[0];
                if (o == me) pm[d] += v; else if (o == opp) po[d] += v;
            }
            for (int t = d + 1; t <= H; ++t) {
                int tau = t - d;
                int o = mo[tau], v = sign * mc[tau];
                if (o == me) { pm[t] += v; prm[t] += v; }
                else if (o == opp) { po[t] += v; pro[t] += v; }
            }
        }
    }

    // Safety invariant: a node of mine is safe when at every arrival time t my garrison plus
    // everything I can bring in reaction covers everything the enemy can land there.
    // Commitments (expansion / attack) may not make any node less safe than it is now.
    void safetyLadder(const Params& prm) {
        static const float ladder[4] = {1.0f, 0.75f, 0.5f, 0.25f};
        for (int p = 0; p < N; ++p) {
            if (s.owner[p] != me || !stable[p]) continue;
            float lv = 0;
            if (prm.aDef > 0) {
                for (int li = 0; li < 4; ++li) {
                    float a = ladder[li] * prm.aDef;
                    bool ok = true;
                    for (int t = 1; t <= H; ++t)
                        if ((float)(fc[p][t] + potRM[p][t]) < a * (float)potO[p][t]) { ok = false; break; }
                    if (ok) { lv = a; break; }
                }
            }
            lvl[p] = lv;
            int* ss = sufSlack[p];
            ss[H + 1] = INT32_MAX;
            for (int t = H; t >= 1; --t)
                ss[t] = std::min(ss[t + 1], fc[p][t] + potRM[p][t] - (int)(lv * (float)potO[p][t] + 0.999f));
        }
        for (int q = 0; q < N; ++q) {
            av[q] = 0; avR[q] = 0;
            if (s.owner[q] != me || !stable[q]) continue;
            int m = fc[q][0];
            for (int k = 1; k <= H; ++k) m = std::min(m, fc[q][k]);
            m = std::min(m, sufSlack[q][1]);
            for (int p = 0; p < N; ++p) {
                if (p == q || s.owner[p] != me || !stable[p]) continue;
                int t0 = D[q][p] + 1;
                if (t0 <= H) m = std::min(m, sufSlack[p][t0]);
            }
            av[q] = std::max(0, m);
            avR[q] = av[q];
        }
    }

    void safety(const Params& prm) {
        if (P_LADDER) { safetyLadder(prm); return; }
        for (int p = 0; p < N; ++p) {
            if (s.owner[p] != me || !stable[p]) continue;
            int* ss = sufSlack[p];
            ss[H + 1] = INT32_MAX;
            int mr = INT32_MAX;
            for (int t = H; t >= 1; --t) {
                int base = fc[p][t] + potRM[p][t];
                ss[t] = std::min(ss[t + 1], base - (int)(prm.aDef * (float)potO[p][t] + 0.999f));
                mr = std::min(mr, base - (int)(prm.aDef * fT[t] * (float)potO[p][t] + 0.999f));
            }
            slackR[p] = mr;
            lvl[p] = (float)ss[1];
        }
        for (int q = 0; q < N; ++q) {
            av[q] = 0; avR[q] = 0;
            if (s.owner[q] != me || !stable[q]) continue;
            int m = fc[q][0];
            for (int k = 1; k <= H; ++k) m = std::min(m, fc[q][k]);
            avR[q] = std::max(0, std::min(m, slackR[q]));
            m = std::min(m, sufSlack[q][1] - std::min(0, sufSlack[q][1]));
            for (int p = 0; p < N; ++p) {
                if (p == q || s.owner[p] != me || !stable[p]) continue;
                int t0 = D[q][p] + 1;
                if (t0 <= H) m = std::min(m, sufSlack[p][t0] - std::min(0, sufSlack[p][1]));
            }
            av[q] = std::max(0, m);
        }
    }

    // troops needed arriving at step k to own p from k through the horizon
    inline int needHold(int p, int k, int& netLoss) const {
        int o = fo[p][k - 1];
        int c = fc[p][k - 1] + (o ? G[p] : 0);
        int slot = (s.base + k) & (RING - 1);
        int ame = s.arr[slot][p][me - 1], aop = s.arr[slot][p][opp - 1];
        int Sme = ame, Sop = aop, S0 = 0;
        if (o == me) Sme += c; else if (o == opp) Sop += c; else S0 = c;
        int M = std::max(Sop, S0);
        int a = M - Sme;
        int cap = (o == me) ? std::max(0, a) : std::max(0, a + 1);
        int hold = a - (sufMin[p][k] - Q[p][k]);
        netLoss = M - Sop;
        return std::max(cap, hold);
    }

    // ownership-time weight from step k to window end E
    inline int ownTime(int p, int k, int E) const {
        if (k > E) return 0;
        if (E <= H) return Wsuf[p][k] - Wsuf[p][E + 1];
        int wH = Wsuf[p][H] - Wsuf[p][H + 1];
        return Wsuf[p][k] + (E - H) * wH;
    }

    void send(int q, int p, int x) {
        contrib(q, -1);
        s.launch(me, q, p, x);
        for (int t = 0; t <= H; ++t) fc[q][t] -= x;
        contrib(q, +1);
        if (nout < 250) out[nout++] = {q, p, x};
    }

    // prepare forecasts and potentials for an arbitrary state (used by the positional score)
    void prepare(const Sim& src, int player) {
        s = src;
        me = player; opp = 3 - me;
        R = MAXT - s.turn + 1;
        for (int p = 0; p < N; ++p) forecast(p);
        std::memset(potM, 0, sizeof(potM));
        std::memset(potO, 0, sizeof(potO));
        std::memset(potRM, 0, sizeof(potRM));
        std::memset(potRO, 0, sizeof(potRO));
        for (int m = 0; m < N; ++m) contrib(m, +1);
    }

    // exposure score of the prepared state: nodes that the other side can take by going all-in
    double exposureScore(bool offense) const {
        double e = 0;
        for (int p = 0; p < N; ++p) {
            int fin = fo[p][H];
            if (fin == me) {
                int worst = INT32_MAX, ref = 1;
                for (int t = 1; t <= H; ++t) {
                    if (fo[p][t] != me) continue;
                    int sl = fc[p][t] + potRM[p][t] - potO[p][t];
                    if (sl < worst) { worst = sl; ref = potO[p][t]; }
                }
                if (worst < 0) e -= G[p] * (0.5 + 0.5 * std::min(1.0, (double)(-worst) / std::max(1, ref)));
            } else if (fin == opp) {
                if (fo[p][0] == me) { e -= G[p]; continue; }  // a node I am going to lose
                if (!offense) continue;
                int worst = INT32_MAX, ref = 1;
                for (int t = 1; t <= H; ++t) {
                    if (fo[p][t] != opp) continue;
                    int sl = fc[p][t] + potRO[p][t] - potM[p][t];
                    if (sl < worst) { worst = sl; ref = potM[p][t]; }
                }
                if (worst < 0) e += P_OFFW * G[p] * (0.5 + 0.5 * std::min(1.0, (double)(-worst) / std::max(1, ref)));
            }
        }
        return e;
    }

    double posValue(const Sim& st) const;
    void posRedistribute();

    void run(const Sim& src, int player, const Params& prm0) {
        Params prm = prm0;
        if (src.turn <= P_T1FULL) { prm.aExp = 0; prm.aDef = 0; }
        s = src;
        me = player; opp = 3 - me;
        R = MAXT - s.turn + 1;
        nout = 0; nmis = 0;
        bool anyMine = false;
        for (int p = 0; p < N; ++p) { forecast(p); if (s.owner[p] == me) anyMine = true; }
        if (!anyMine) return;
        std::memset(potM, 0, sizeof(potM));
        std::memset(potO, 0, sizeof(potO));
        std::memset(potRM, 0, sizeof(potRM));
        std::memset(potRO, 0, sizeof(potRO));
        for (int m = 0; m < N; ++m) contrib(m, +1);
        safety(prm);
#ifdef DEBUG
        if (dbg) {
            fprintf(stderr, "--- run me=%d turn=%d\n", me, s.turn);
            for (int p = 0; p < N; ++p) if (s.owner[p] == me)
                fprintf(stderr, "  node %d troops=%d stable=%d slack=%.0f av=%d avR=%d\n", p, s.troops[p], (int)stable[p], lvl[p], av[p], avR[p]);
        }
#endif
        // --- missions
        const int E = std::min(R, prm.HV);
        bool holdExp[MAXN];
        for (int iter = 0; iter < 48; ++iter) {
            double best = 0; int bp = -1, bk = 0, bneed = 0;
            for (int p = 0; p < N; ++p) holdExp[p] = false;
            for (int p = 0; p < N; ++p) {
                if (stable[p]) continue;
                // neutral that the enemy is about to take: only arrive after them
                int tEnemy = 0;
                if (s.owner[p] == 0) {
                    for (int k = 1; k <= H; ++k) if (fo[p][k] == opp) { tEnemy = k; break; }
                }
                int supply = 0;
                for (int i = 0; i < N - 1; ++i) {
                    int q = ord[p][i];
                    if (s.owner[q] != me || av[q] <= 0) continue;
                    int k = D[p][q];
                    if (k > R || k > H) break;
                    supply += av[q];
                    if (k <= tEnemy) continue;
                    int nl;
                    int need = needHold(p, k, nl);
                    if (need <= 0) break;
                    int o = fo[p][k - 1];
                    if (o == 0) {
                        if (!prm.expand) continue;
                        if ((double)G[p] * (R - k) - nl <= 0) continue;
                        if (prm.aExp > 0) {
                            // can I keep it against a fraction of everything the enemy can bring?
                            bool ok = true;
                            int c0 = fc[p][k - 1];
                            for (int t = k; t <= H; ++t) {
                                if ((float)(potM[p][t] + G[p] * (t - k) - c0) < prm.aExp * fT[t] * (float)potO[p][t]) { ok = false; break; }
                            }
                            if (!ok) continue;
                        }
                    } else if (o == opp) {
                        if (!prm.attack) continue;
                        need += (int)(prm.aAtt * (float)potRO[p][k] + 0.999f);
                    }
                    if (supply < need) {
                        // worthwhile neutral I cannot afford yet: nearest source saves up for it
                        if (P_HOLDEXP && o == 0 && fo[p][H] == 0) {
                            for (int j = 0; j < N - 1; ++j) {
                                int q2 = ord[p][j];
                                if (s.owner[q2] == me) { if (D[p][q2] <= P_HOLDEXP) holdExp[q2] = true; break; }
                            }
                        }
                        continue;
                    }
                    int wt = ownTime(p, k, E);
                    double val = (double)G[p] * wt - nl;
                    double sc;
                    if (val > 0) sc = val / (need + 1.0);
                    else {
                        // slow payback: still worth it if it pays back well before the game ends
                        if (o != 0 || fo[p][H] != 0) continue;
                        double valR = (double)G[p] * (R - k) * P_LATEF - nl;
                        if (valR <= 0) continue;
                        sc = 1e-4 * valR / (need + 1.0);
                    }
                    if (sc > best) { best = sc; bp = p; bk = k; bneed = need; }
                    break;
                }
            }
            if (bp < 0) break;
#ifdef DEBUG
            if (dbg) fprintf(stderr, "  mission target=%d k=%d need=%d score=%.3f owner@k-1=%d\n", bp, bk, bneed, best, (int)fo[bp][bk - 1]);
#endif
            int rem = bneed;
            contrib(bp, -1);
            for (int i = 0; i < N - 1 && rem > 0; ++i) {
                int q = ord[bp][i];
                if (s.owner[q] != me || av[q] <= 0) continue;
                if (D[bp][q] > bk) break;
                int x = std::min(av[q], rem);
                rem -= x;
                send(q, bp, x);
            }
            if (nmis < 64) missionEnd[nmis++] = nout;
            forecast(bp);
            contrib(bp, +1);
            safety(prm);
        }
        // --- positional redistribution: reduce the exposure of my nodes (now and after landing)
        if (prm.redist && prm.exact && P_EPOS) {
            posRedistribute();
        }
        // --- stack position: the node of mine from which a stack covers most of my growth
        // against the enemy's troops (it can reach a threatened node before they do)
        int stackNode = -1;
        if (prm.redist && P_STACK) {
            double wsum = 0;
            double we[MAXN];
            for (int e = 0; e < N; ++e) {
                we[e] = 0;
                int t = std::min(H, P_STACKT);
                if (fo[e][t] == opp) we[e] = fc[e][t];
                wsum += we[e];
            }
            if (wsum > 0) {
                double bestCost = 1e18;
                for (int f = 0; f < N; ++f) {
                    if (s.owner[f] != me || !stable[f]) continue;
                    double cost = 0;
                    for (int q = 0; q < N; ++q) {
                        if (fo[q][H] != me) continue;
                        double unc = 0;
                        for (int e = 0; e < N; ++e) {
                            if (we[e] <= 0) continue;
                            if (q != f && D[f][q] > D[e][q] - 1) unc += we[e];
                        }
                        cost += G[q] * unc / wsum;
                    }
                    double dsum = 0;
                    for (int e = 0; e < N; ++e) if (we[e] > 0) dsum += we[e] * D[f][e];
                    cost += P_STACKD * dsum / wsum;
                    if (cost < bestCost - 1e-9) { bestCost = cost; stackNode = f; }
                }
            }
        }
        // --- redistribution toward the front
        if (prm.redist) {
            for (int p = 0; p < N; ++p) {
                if (s.owner[p] != me || avR[p] <= 0) continue;
                if (holdExp[p]) continue;
                // nearest enemy node (now or in the forecast)
                int e = -1;
                if (stackNode >= 0) {
                    if (p == stackNode) continue;
                    e = stackNode;
                } else
                for (int i = 0; i < N - 1; ++i) {
                    int q = ord[p][i];
                    if (s.owner[q] == opp || fo[q][H] == opp) { e = q; break; }
                }
                if (e < 0) break;
                int de = D[p][e];
                // stepping stone: friendly node closer to e, shortest total path; first with (almost) no detour
                int bestq = -1, bestLen = 1000;
                for (int i = 0; i < N - 1; ++i) {
                    int q = ord[p][i];
                    int d = D[p][q];
                    if (d > R) break;
                    if (D[q][e] >= de) continue;
                    bool mine = (fo[q][std::min(d, H)] == me && fo[q][H] == me);
                    if (P_RDOWN && s.owner[q] != me) mine = false;
                    if (!mine) continue;
                    int len = d + D[q][e];
                    if (len <= de + P_DETOUR) { bestq = q; break; }
                    if (P_ANYHOP && len < bestLen) { bestLen = len; bestq = q; }
                }
                if (stackNode >= 0 && (bestq < 0 || P_STACKDIRECT) && D[p][stackNode] <= R) bestq = stackNode;
                if (bestq >= 0 && prm.exact && P_EPOS) {
                    // only if it does not hurt the positional score
                    Sim c = s;
                    c.launch(me, p, bestq, avR[p]);
                    if (posValue(c) < posValue(s) - 1e-9) bestq = -1;
                }
                if (bestq >= 0) {
                    int x = avR[p];
                    contrib(bestq, -1);
                    send(p, bestq, x);
                    forecast(bestq);
                    contrib(bestq, +1);
                    if (prm.exact) safety(prm); else avR[p] = 0;
                }
            }
        }
    }
};

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------
Planner PL[3];
Planner AUX;
Params basePrm;

double evalSim(Sim& s, int me) {
    int steps = std::min(MAXT - s.turn + 1, maxD);
    for (int i = 0; i < steps; ++i) s.advance();
    int opp = 3 - me;
    int tr[3] = {0, 0, 0}, cnt[3] = {0, 0, 0};
    for (int i = 0; i < N; ++i) { tr[s.owner[i]] += s.troops[i]; cnt[s.owner[i]]++; }
    tr[1] += s.fly[0]; tr[2] += s.fly[1];
    int rem = MAXT - s.turn + 1;
    if (rem < 0) rem = 0;
    bool aliveMe = cnt[me] > 0 || s.fly[me - 1] > 0;
    bool aliveOp = cnt[opp] > 0 || s.fly[opp - 1] > 0;
    if (!aliveMe && aliveOp) return -1e7;
    if (aliveMe && !aliveOp) return 1e7;
    double g = 0;
    if (P_EXPC < 1.0) {
        AUX.prepare(s, me);
        for (int p = 0; p < N; ++p) {
            int o = s.owner[p];
            if (o == me) {
                bool safe = true;
                for (int t = 1; t <= H; ++t)
                    if (AUX.fc[p][t] + AUX.potRM[p][t] < AUX.potO[p][t]) { safe = false; break; }
                g += safe ? G[p] : G[p] * P_EXPC;
            } else if (o == opp) {
                bool safe = true;
                for (int t = 1; t <= H; ++t)
                    if (AUX.fc[p][t] + AUX.potRO[p][t] < AUX.potM[p][t]) { safe = false; break; }
                g -= safe ? G[p] : G[p] * P_EXPC;
            }
        }
    } else {
        for (int p = 0; p < N; ++p) { if (s.owner[p] == me) g += G[p]; else if (s.owner[p] == opp) g -= G[p]; }
    }
    double v = (tr[me] - tr[opp]) + g * std::min(rem, P_EVCAP) * P_EVK;
    return v;
}

double Planner::posValue(const Sim& st) const {
    AUX.prepare(st, me);
    double v = P_W0 * AUX.exposureScore(P_OFFW > 0);
    Sim c = st;
    int steps = std::min(P_POSJ, MAXT - c.turn + 1);
    for (int i = 0; i < steps; ++i) c.advance();
    AUX.prepare(c, me);
    v += AUX.exposureScore(P_OFFW > 0);
    return v;
}

void Planner::posRedistribute() {
    double base = posValue(s);
    for (int rep = 0; rep < 8; ++rep) {
        double bestGain = 0.05; int bq = -1, bf = -1, bx = 0;
        for (int q = 0; q < N; ++q) {
            if (s.owner[q] != me || !stable[q]) continue;
            int mv = fc[q][0];
            for (int k = 1; k <= H; ++k) mv = std::min(mv, fc[q][k]);
            if (mv <= 0) continue;
            for (int f = 0; f < N; ++f) {
                if (f == q || s.owner[f] != me) continue;
                if (D[q][f] > R) continue;
                Sim c = s;
                c.launch(me, q, f, mv);
                double v = posValue(c);
                // prefer short hops on ties
                double gain = v - base - 0.001 * D[q][f];
                if (gain > bestGain) { bestGain = gain; bq = q; bf = f; bx = mv; }
            }
        }
        if (bq < 0) break;
#ifdef DEBUG
        if (dbg) fprintf(stderr, "  posmove %d>%d:%d gain=%.3f\n", bq, bf, bx, bestGain);
#endif
        contrib(bf, -1);
        send(bq, bf, bx);
        forecast(bf);
        contrib(bf, +1);
        base = posValue(s);
    }
    Params tmp; 
    safety(tmp);
}
#ifdef DEBUG
bool trace = false;
#endif

double rollout(const Sim& start, int me, const Ord* myOrd, int nMy, const Ord* opOrd, int nOp, int depth, const Params& enemyPrm) {
    Sim s = start;
    int opp = 3 - me;
    for (int i = 0; i < nMy; ++i) s.launch(me, myOrd[i].from, myOrd[i].to, myOrd[i].x);
    for (int i = 0; i < nOp; ++i) s.launch(opp, opOrd[i].from, opOrd[i].to, opOrd[i].x);
    s.advance();
    Planner& P = PL[2];
    Params rp = basePrm;
    rp.exact = false;
    Params ep = enemyPrm;
    ep.exact = false;
    for (int d = 1; d < depth && s.turn <= MAXT; ++d) {
        P.run(s, 1, rp);
        Ord tmp[256]; int nt = P.nout;
        std::memcpy(tmp, P.out, sizeof(Ord) * nt);
        P.run(s, 2, ep);
#ifdef DEBUG
        if (trace) {
            fprintf(stderr, "  [T%d]", s.turn);
            for (int i = 0; i < N; ++i) fprintf(stderr, " %c%d:%d", ".AB"[s.owner[i]], i, s.troops[i]);
            fprintf(stderr, "\n     A:");
            for (int i = 0; i < nt; ++i) fprintf(stderr, " %d>%d:%d", tmp[i].from, tmp[i].to, tmp[i].x);
            fprintf(stderr, "\n     B:");
            for (int i = 0; i < P.nout; ++i) fprintf(stderr, " %d>%d:%d", P.out[i].from, P.out[i].to, P.out[i].x);
            fprintf(stderr, "\n");
        }
#endif
        for (int i = 0; i < nt; ++i) s.launch(1, tmp[i].from, tmp[i].to, tmp[i].x);
        for (int i = 0; i < P.nout; ++i) s.launch(2, P.out[i].from, P.out[i].to, P.out[i].x);
        s.advance();
    }
    return evalSim(s, me);
}

void initMap(const State& st) {
    N = (int)st.nodes.size();
    MAXT = st.max_turns;
    maxD = 0;
    for (int i = 0; i < N; ++i) {
        G[i] = st.nodes[i].growth;
        for (int j = 0; j < N; ++j) {
            D[i][j] = distance(st.nodes[i].x, st.nodes[i].y, st.nodes[j].x, st.nodes[j].y);
            maxD = std::max(maxD, D[i][j]);
        }
    }
    if (maxD > H) maxD = H;
    for (int t = 0; t <= H + 1; ++t) {
        float f = 1.0f;
        if (t > P_FT0) f = std::max((float)P_FMIN, 1.0f - (float)P_FSLOPE * (t - P_FT0));
        fT[t] = f;
    }
    for (int i = 0; i < N; ++i) {
        int c = 0;
        for (int j = 0; j < N; ++j) if (j != i) ord[i][c++] = j;
        std::stable_sort(ord[i], ord[i] + c, [&](int a, int b) { return D[i][a] < D[i][b]; });
    }
}

void toSim(const State& st, Sim& s) {
    std::memset(&s, 0, sizeof(s));
    s.turn = st.turn;
    s.base = 0;
    for (int i = 0; i < N; ++i) { s.owner[i] = st.nodes[i].owner; s.troops[i] = st.nodes[i].troops; }
    for (const auto& f : st.fleets) {
        if (f.turns_left < 1 || f.turns_left >= RING || f.owner < 1 || f.owner > 2) continue;
        int slot = f.turns_left & (RING - 1);
        s.arr[slot][f.to][f.owner - 1] += f.troops;
        s.mask[slot] |= 1u << f.to;
        s.fly[f.owner - 1] += f.troops;
    }
}

struct Cand { Ord o[256]; int n; double v; };

}  // namespace

std::vector<Order> decide(const State& st) {
    auto t0 = std::chrono::steady_clock::now();
    std::vector<Order> res;
    if (st.nodes.empty() || (int)st.nodes.size() > MAXN) return res;
    if (N != (int)st.nodes.size() || st.turn <= 1) initMap(st);
    static Sim cur;
    toSim(st, cur);

    Planner& P = PL[0];
#ifdef DEBUG
    dbg = true;
#endif
    P.run(cur, 1, basePrm);
#ifdef DEBUG
    dbg = false;
#endif
    static Cand best;
    best.n = P.nout;
    std::memcpy(best.o, P.out, sizeof(Ord) * P.nout);

#if SEARCH
    {
        auto elapsed = [&]() {
            return std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t0).count();
        };
        const double budget = BUDGET_MS;
        // enemy models and their assumed first moves
        Planner& PE = PL[1];
        static Params mprm[4];
        static Ord eo[4][256]; int ne[4];
        int nm = 0;
        if (P_MODELS & 1) { mprm[nm] = basePrm; ++nm; }
        if (P_MODELS & 2) { mprm[nm] = basePrm; mprm[nm].aDef = 0; ++nm; }
        if (P_MODELS & 4) { mprm[nm] = basePrm; mprm[nm].aDef = 0; mprm[nm].aAtt = 0.5f; ++nm; }
        for (int m = 0; m < nm; ++m) {
            Params ep = mprm[m]; ep.exact = false;
            PE.run(cur, 2, ep);
            ne[m] = PE.nout;
            std::memcpy(eo[m], PE.out, sizeof(Ord) * PE.nout);
        }
        const int depth = P_DEPTH;
        static Cand cands[64];
        int nc = 0;
        int nroll = 0;
        auto consider = [&](const Ord* o, int n) {
            // dedupe
            for (int c = 0; c < nc; ++c) {
                if (cands[c].n != n) continue;
                bool same = true;
                for (int i = 0; i < n && same; ++i)
                    if (cands[c].o[i].from != o[i].from || cands[c].o[i].to != o[i].to || cands[c].o[i].x != o[i].x) same = false;
                if (same) return;
            }
            if (nc >= 64) return;
            Cand& c = cands[nc++];
            c.n = n;
            if (n) std::memcpy(c.o, o, sizeof(Ord) * n);
            c.v = 1e18;
            double sum = 0;
            for (int m = 0; m < nm; ++m) {
                double v = rollout(cur, 1, c.o, c.n, eo[m], ne[m], depth, mprm[m]);
                ++nroll;
                sum += v;
                if (v < c.v) c.v = v;
            }
            if (P_AGG) c.v = sum / nm;
            if (c.v > best.v + 1e-9) { best.v = c.v; best.n = c.n; if (n) std::memcpy(best.o, c.o, sizeof(Ord) * n); }
        };
        best.v = -1e18;
        consider(P.out, P.nout);
        struct Var { float aDef, aExp, aAtt; bool expand, attack, redist; };
        static const Var vars[] = {
            {1.0f, 0.5f, 1.0f, true, true, true},
            {1.0f, 0.0f, 1.0f, true, true, true},
            {0.5f, 0.5f, 1.0f, true, true, true},
            {0.5f, 0.0f, 1.0f, true, true, true},
            {0.0f, 0.0f, 1.0f, true, true, true},
            {1.0f, 1.0f, 0.5f, true, true, true},
            {1.0f, 1.0f, 1.0f, false, true, true},
            {1.0f, 1.0f, 1.0f, true, false, true},
            {1.0f, 1.0f, 1.0f, true, true, false},
            {0.5f, 0.5f, 0.5f, true, true, true},
            {0.0f, 0.0f, 0.5f, true, true, true},
        };
        consider(nullptr, 0);
        for (const Var& vr : vars) {
            if (elapsed() > budget) break;
            Params prm = basePrm;
            prm.aDef = vr.aDef; prm.aExp = vr.aExp; prm.aAtt = vr.aAtt;
            prm.expand = vr.expand; prm.attack = vr.attack; prm.redist = vr.redist;
            P.run(cur, 1, prm);
            consider(P.out, P.nout);
        }
#ifdef DEBUG
        trace = true;
        rollout(cur, 1, best.o, best.n, eo[0], ne[0], depth, mprm[0]);
        trace = false;
        fprintf(stderr, "turn %d: %d cands, %d rollouts, %.2f ms, best=%.1f\n", st.turn, nc, nroll, elapsed(), best.v);
        for (int c = 0; c < nc; ++c) {
            fprintf(stderr, "   cand %d v=%.1f:", c, cands[c].v);
            for (int i = 0; i < cands[c].n; ++i) fprintf(stderr, " %d>%d:%d", cands[c].o[i].from, cands[c].o[i].to, cands[c].o[i].x);
            fprintf(stderr, "\n");
        }
#endif
    }
#endif
    res.reserve(best.n);
    for (int i = 0; i < best.n; ++i) res.push_back({best.o[i].from, best.o[i].to, best.o[i].x});
    return res;
}

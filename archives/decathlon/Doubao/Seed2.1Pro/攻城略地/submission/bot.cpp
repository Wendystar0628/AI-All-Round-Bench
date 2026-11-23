#include "engine.hpp"

#include <algorithm>
#include <array>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <vector>

namespace {

constexpr int MAXN = 24;
constexpr int MAXF = 320;
constexpr int HOR = 22;

int N = 0;
int gD[MAXN][MAXN];

uint64_t rngState = 0x123456789abcdefULL;
static inline uint64_t xrng() {
    uint64_t x = rngState;
    x ^= x << 13; x ^= x >> 7; x ^= x << 17;
    rngState = x;
    return x;
}
static inline int rbelow(int n) { return n > 0 ? (int)(xrng() % (uint64_t)n) : 0; }

struct GState {
    int turn, maxTurns, n;
    int8_t own[MAXN];
    int tr[MAXN], gr[MAXN];
    struct F { int8_t owner; int troops, to, tl; };
    F fl[MAXF];
    int nf;
};

struct Params {
    int reserveMul;
    int earlyBias;
    int attackMul;
    int holdExtra;
    int reinforcePct;
    int noisePct;
    bool defend;
};

static const Params paramSet[] = {
    {0, 70, 100, 1, 0, 0, true},
    {30, 70, 120, 2, 0, 0, true},
    {60, 50, 100, 1, 10, 15, true},
    {15, 90, 80, 3, 20, 25, true},
    {45, 60, 140, 2, 0, 10, true},
};
constexpr int NPARAM = 5;

static void copyState(const State& s, GState& g) {
    g.n = (int)s.nodes.size();
    g.turn = s.turn;
    g.maxTurns = s.max_turns;
    g.nf = 0;
    for (int i = 0; i < g.n; ++i) {
        g.own[i] = (int8_t)s.nodes[i].owner;
        g.tr[i] = s.nodes[i].troops;
        g.gr[i] = s.nodes[i].growth;
    }
    for (const auto& f : s.fleets) {
        if (g.nf >= MAXF) break;
        g.fl[g.nf++] = {(int8_t)f.owner, f.troops, f.to, f.turns_left};
    }
}

struct Ord { int8_t from, to; int troops; };
struct MoveList {
    Ord o[48];
    int cnt;
};

static inline void applyOrders(const GState& g, const MoveList& mv, int owner,
                               int src[], int dst[], int sz[], int& k) {
    (void)g; (void)owner;
    for (int m = 0; m < mv.cnt; ++m) {
        src[k] = mv.o[m].from; dst[k] = mv.o[m].to; sz[k] = mv.o[m].troops; ++k;
    }
}

static inline void settle(GState& g,
                          const int sa[], const int da[], const int za[], int na,
                          const int sb[], const int db[], const int zb[], int nb) {
    int nf0 = g.nf;
    int spent[MAXN] = {};
    auto emit = [&](int owner, const int ss[], const int dd[], const int zz[], int cnt) {
        for (int k = 0; k < cnt; ++k) {
            int f = ss[k], t = dd[k], z = zz[k];
            if (f < 0 || t < 0 || f >= g.n || t >= g.n) continue;
            if (g.own[f] != owner || f == t || z <= 0) continue;
            if (z > g.tr[f] - spent[f]) continue;
            spent[f] += z;
            g.fl[g.nf++] = {(int8_t)owner, z, t, gD[f][t]};
        }
    };
    emit(1, sa, da, za, na);
    emit(2, sb, db, zb, nb);
    for (int f = 0; f < g.n; ++f) g.tr[f] -= spent[f];
    for (int i = 0; i < g.n; ++i) if (g.own[i]) g.tr[i] += g.gr[i];
    for (int i = nf0; i < g.nf; ++i) --g.fl[i].tl;
    bool hasArr = false;
    for (int i = 0; i < nf0; ++i) {
        if (--g.fl[i].tl == 0) hasArr = true;
    }
    for (int i = nf0; i < g.nf; ++i) if (g.fl[i].tl == 0) hasArr = true;
    if (hasArr) {
        int sum[3], mask;
        for (int t = 0; t < g.n; ++t) {
            bool hit = false;
            for (int i = 0; i < g.nf; ++i) if (g.fl[i].tl == 0 && g.fl[i].to == t) { hit = true; break; }
            if (!hit) continue;
            sum[0] = sum[1] = sum[2] = 0; mask = 1 << g.own[t];
            sum[g.own[t]] += g.tr[t];
            for (int i = 0; i < g.nf; ++i)
                if (g.fl[i].tl == 0 && g.fl[i].to == t) {
                    sum[g.fl[i].owner] += g.fl[i].troops;
                    mask |= 1 << g.fl[i].owner;
                }
            int best = 0, second = 0, bw = -1, part = 0;
            for (int w = 0; w < 3; ++w) if (mask & (1 << w)) {
                ++part;
                if (bw < 0 || sum[w] > best) { second = best; best = sum[w]; bw = w; }
                else if (sum[w] > second) second = sum[w];
            }
            if (part >= 2 && best == second) g.tr[t] = 0;
            else { g.own[t] = (int8_t)bw; g.tr[t] = best - second; }
        }
    }
    int w = 0;
    for (int i = 0; i < g.nf; ++i) if (g.fl[i].tl > 0) {
        if (w != i) g.fl[w] = g.fl[i];
        ++w;
    }
    g.nf = w;
    ++g.turn;
}

struct Inb {
    int sum[MAXN][HOR + 1][2];
};

static void buildInb(const GState& g, Inb& inb) {
    std::memset(&inb, 0, sizeof(inb));
    for (int i = 0; i < g.nf; ++i) {
        const auto& f = g.fl[i];
        if (f.tl >= 1 && f.tl <= HOR)
            inb.sum[f.to][f.tl][f.owner - 1] += f.troops;
    }
}

struct Proj { int8_t owner[HOR + 1]; int troops[HOR + 1]; };

static Proj projectNode(const GState& g, const Inb& inb, int node,
                        int waveTurn, int waveSize, int owner, int horizon) {
    Proj pr{};
    int o = g.own[node], tr = g.tr[node], grw = g.gr[node];
    pr.owner[0] = (int8_t)o; pr.troops[0] = tr;
    for (int k = 1; k <= horizon; ++k) {
        if (o) tr += grw;
        int a[3] = {0, 0, 0};
        int mask = 1 << o;
        a[o] += tr;
        int e1 = inb.sum[node][k][0];
        int e2 = inb.sum[node][k][1];
        if (e1) { a[1] += e1; mask |= 2; }
        if (e2) { a[2] += e2; mask |= 4; }
        if (waveSize > 0 && k == waveTurn) { a[owner] += waveSize; mask |= 1 << owner; }
        bool event = e1 || e2 || (waveSize > 0 && k == waveTurn);
        if (event) {
            int best = 0, second = 0, bw = -1, part = 0;
            for (int w = 0; w < 3; ++w) if (mask & (1 << w)) {
                ++part;
                if (bw < 0 || a[w] > best) { second = best; best = a[w]; bw = w; }
                else if (a[w] > second) second = a[w];
            }
            if (part >= 2 && best == second) tr = 0;
            else { o = bw; tr = best - second; }
        }
        pr.owner[k] = (int8_t)o; pr.troops[k] = tr;
    }
    return pr;
}

static int minWave(const GState& g, const Inb& inb, int node, int waveTurn,
                   int horizon, int lo, int hi, int owner, bool holdAfter, int extra) {
    if (hi < lo) return -1;
    auto ok = [&](int c) {
        Proj pr = projectNode(g, inb, node, waveTurn, c, owner, horizon);
        int from = holdAfter ? waveTurn : horizon;
        if (holdAfter) {
            for (int k = waveTurn; k <= horizon; ++k)
                if (pr.owner[k] != owner) return false;
            int tail = pr.troops[horizon];
            return tail >= extra;
        }
        return pr.owner[from] == owner;
    };
    if (!ok(hi)) return -1;
    if (ok(lo)) return lo;
    int a = lo, b = hi;
    while (a < b) { int m = (a + b) / 2; if (ok(m)) b = m; else a = m + 1; }
    return a;
}

struct Mission { int from, to, troops; double score; int kind; };

static MoveList policyMove(const GState& g, const Params& st, int owner) {
    const int n = g.n;
    const int turn = g.turn;
    const int T = g.maxTurns;
    const int other = 3 - owner;
    MoveList res{};

    int ownList[MAXN], enemyList[MAXN];
    int no = 0, ne = 0;
    for (int i = 0; i < n; ++i) {
        if (g.own[i] == owner) ownList[no++] = i;
        else if (g.own[i] == other) enemyList[ne++] = i;
    }
    if (no == 0) return res;

    Inb inb;
    buildInb(g, inb);

    int avail[MAXN], remain[MAXN];
    bool doomed[MAXN] = {};
    int phase = std::max(0, turn - 20);
    int unseenMul = std::min(75, 5 + phase * 3) * st.reserveMul / 100;
    for (int ii = 0; ii < no; ++ii) {
        int i = ownList[ii];
        int reserve = 0;
        int nearEnemy = 0, nearD = HOR + 1;
        for (int jj = 0; jj < ne; ++jj) {
            int j = enemyList[jj];
            int d = gD[j][i];
            if (d <= HOR && g.tr[j] > nearEnemy) { nearEnemy = g.tr[j]; nearD = d; }
        }
        if (nearEnemy > 0) {
            int gar = g.tr[i] + g.gr[i] * nearD;
            for (int k = 1; k <= nearD; ++k) gar += inb.sum[i][k][owner - 1];
            int need = (nearEnemy - gar) * unseenMul / 100;
            if (need > reserve) reserve = need;
        }
        avail[i] = std::max(0, g.tr[i] - reserve);
        remain[i] = g.tr[i];
    }

    Mission missions[64];
    int nm = 0;

    if (st.defend) {
        for (int ii = 0; ii < no; ++ii) {
            int i = ownList[ii];
            Proj pr0 = projectNode(g, inb, i, 0, 0, owner, HOR);
            bool safe = true;
            for (int k = 1; k <= HOR; ++k)
                if (pr0.owner[k] != owner) { safe = false; break; }
            if (safe) continue;
            int bestFrom = -1, bestC = -1, bestD = 0;
            double bestKey = 1e300;
            for (int jj = 0; jj < no; ++jj) {
                int j = ownList[jj];
                if (j == i) continue;
                int d = gD[j][i];
                int hi = avail[j];
                if (hi <= 0) continue;
                int c = minWave(g, inb, i, d, HOR, 0, hi, owner, true, 0);
                if (c < 1) continue;
                double key = (double)c * d / (1.0 + g.gr[i]);
                if (key < bestKey) { bestKey = key; bestFrom = j; bestC = c; bestD = d; }
            }
            if (bestFrom >= 0 && nm < 64)
                missions[nm++] = {bestFrom, i, bestC, 1e15 + 100.0 / bestD + g.gr[i], 0};
            else {
                doomed[i] = true;
            }
        }
    }

    int totalProd = 0, enemyProd = 0;
    for (int i = 0; i < n; ++i) {
        if (g.own[i] == owner) totalProd += g.gr[i];
        if (g.own[i] == other) enemyProd += g.gr[i];
    }

    for (int j = 0; j < n; ++j) {
        if (g.own[j] == owner) continue;
        bool isEnemy = g.own[j] == other;
        if (!isEnemy) {
            Proj prOwn = projectNode(g, inb, j, 0, 0, owner, HOR);
            if (prOwn.owner[HOR] == owner) continue;
        }
        int enemyIncoming = 0;
        for (int k = 1; k <= HOR; ++k)
            enemyIncoming += inb.sum[j][k][other - 1];
        int bestFrom = -1, bestC = 0;
        double bestScore = -1e300;
        for (int ii = 0; ii < no; ++ii) {
            int i = ownList[ii];
            int d = gD[i][j];
            int hi = avail[i];
            if (hi <= 0) continue;
            int c = minWave(g, inb, j, d, HOR, 1, hi, owner, false, 0);
            if (c < 3) continue;
            if (!isEnemy && enemyIncoming > 0) {
                int hostile = 0;
                for (int k = d; k <= std::min(HOR, d + 4); ++k)
                    hostile += inb.sum[j][k][other - 1];
                if (c < g.tr[j] + hostile + 2) continue;
            }
            if (isEnemy && st.reinforcePct > 0) {
                int more = c * st.reinforcePct / 100;
                c = std::min(hi, c + more);
            }
            int prodTurns = std::max(0, T - (turn + d) + 1);
            double gg = g.gr[j];
            double pos = 0;
            for (int k = 0; k < n; ++k)
                if (k != j) pos += (double)g.gr[k] / (1 + gD[j][k]);
            double val;
            if (isEnemy) {
                double kill = g.tr[j] + g.gr[j] * d;
                val = gg * prodTurns * 2.0 + kill * 0.35 + pos * 0.12;
                val *= st.attackMul / 100.0;
                if (enemyProd >= totalProd) val *= 1.15;
            } else {
                val = gg * prodTurns + pos * 0.12;
                if (turn < 60) val *= 1.0 + (double)st.earlyBias / 100.0 * (60 - turn) / 60.0;
            }
            double opCost = c + 0.35 * c * d + d * (totalProd + 1) * 0.30;
            double score = val / opCost;
            if (!isEnemy && turn < 80) {
                int mySide = 0, enSide = 0;
                for (int k = 0; k < n; ++k) {
                    if (g.own[k] == owner) mySide += gD[j][k];
                    if (g.own[k] == other) enSide += gD[j][k];
                }
                if (mySide == 0) mySide = 1;
                double front = (double)enSide / mySide;
                if (front < 0.75) score *= front / 0.75;
            }
            if (st.noisePct > 0) {
                int nz = (int)(xrng() % (2 * st.noisePct + 1));
                score *= 1.0 + (double)(nz - st.noisePct) / 100.0;
            }
            if (score > bestScore) { bestScore = score; bestFrom = i; bestC = c; }
        }
        if (bestFrom >= 0 && nm < 64)
            missions[nm++] = {bestFrom, j, bestC, bestScore * 1000.0, isEnemy ? 2 : 1};
    }

    for (int ii = 0; ii < no; ++ii) {
        int i = ownList[ii];
        if (!doomed[i] || g.tr[i] <= 0) continue;
        int to = -1, bd = 100;
        for (int jj = 0; jj < no; ++jj) {
            int j = ownList[jj];
            if (j == i || doomed[j]) continue;
            if (gD[i][j] < bd) { bd = gD[i][j]; to = j; }
        }
        if (to >= 0 && nm < 64) missions[nm++] = {i, to, g.tr[i], -1e9, 3};
    }

    std::sort(missions, missions + nm,
              [](const Mission& a, const Mission& b) { return a.score > b.score; });

    for (int mi = 0; mi < nm; ++mi) {
        const Mission& m = missions[mi];
        if (m.troops <= 0) continue;
        if (remain[m.from] < m.troops) continue;
        if (res.cnt >= 48) break;
        remain[m.from] -= m.troops;
        res.o[res.cnt++] = {(int8_t)m.from, (int8_t)m.to, m.troops};
    }
    return res;
}

static MoveList fastPolicy(GState& g, int owner, int style) {
    const int n = g.n;
    const int other = 3 - owner;
    MoveList res{};
    int ownList[MAXN], no = 0;
    for (int i = 0; i < n; ++i)
        if (g.own[i] == owner) ownList[no++] = i;
    if (no == 0) return res;

    static int inSelf[MAXN][HOR + 1];
    static int inEn[MAXN][HOR + 1];
    std::memset(inSelf, 0, sizeof(inSelf));
    std::memset(inEn, 0, sizeof(inEn));
    for (int i = 0; i < g.nf; ++i) {
        const auto& f = g.fl[i];
        if (f.tl <= HOR) {
            if (f.owner == owner) inSelf[f.to][f.tl] += f.troops;
            else inEn[f.to][f.tl] += f.troops;
        }
    }

    struct Job { int from, to, cost; double score; };
    Job jobs[128]; int nj = 0;

    double reserveFrac = style == 0 ? 0.0 : (style == 1 ? 0.25 : 0.45);
    double earlyFrac = style == 2 ? 1.2 : 0.8;

    double totOwnDist[MAXN], totEnDist[MAXN];
    for (int j = 0; j < n; ++j) {
        double a = 0, b = 0;
        for (int k = 0; k < n; ++k) {
            if (g.own[k] == owner) a += gD[j][k];
            else if (g.own[k] == other) b += gD[j][k];
        }
        totOwnDist[j] = a <= 0 ? 1 : a;
        totEnDist[j] = b;
    }

    int defendNeed[MAXN] = {};
    int defendFrom[MAXN] = {};
    for (int ii = 0; ii < no; ++ii) {
        int i = ownList[ii];
        int threat = 0, threatTurn = 0;
        for (int k = 1; k <= HOR; ++k)
            if (inEn[i][k] > threat) { threat = inEn[i][k]; threatTurn = k; }
        if (threat <= 0) continue;
        int gar = g.tr[i] + g.gr[i] * threatTurn;
        for (int k = 1; k <= threatTurn; ++k) gar += inSelf[i][k];
        if (threat <= gar) continue;
        int need = threat - gar;
        int bf = -1; double bkey = 1e300;
        for (int jj = 0; jj < no; ++jj) {
            int j = ownList[jj];
            if (j == i || gD[j][i] > threatTurn) continue;
            double key = (double)need * gD[j][i];
            if (key < bkey) { bkey = key; bf = j; }
        }
        if (bf >= 0) {
            defendNeed[i] = need;
            defendFrom[i] = bf;
            if (nj < 128)
                jobs[nj++] = {bf, i, need, 1e15 + 1000.0 / gD[bf][i] + g.gr[i]};
        }
    }

    int remain[MAXN] = {};
    for (int ii = 0; ii < no; ++ii) {
        int i = ownList[ii];
        int reserve = 0;
        if (style != 0) {
            int near = 0;
            for (int k = 0; k < n; ++k)
                if (g.own[k] == other && gD[k][i] <= HOR && g.tr[k] > near) near = g.tr[k];
            reserve = (int)(near * reserveFrac);
        }
        remain[i] = std::max(0, g.tr[i] - reserve);
    }


    struct Cand { int to, cost, d; double score; };
    for (int ii = 0; ii < no; ++ii) {
        int i = ownList[ii];
        int budget = remain[i];
        if (budget < 3) continue;

        int claimed[MAXN] = {};
        for (int fi = 0; fi < g.nf; ++fi)
            if (g.fl[fi].owner == owner) claimed[g.fl[fi].to] += g.fl[fi].troops;

        Cand cands[MAXN]; int nc = 0;
        for (int j = 0; j < n; ++j) {
            if (j == i || g.own[j] == owner) continue;
            int d = gD[i][j];
            bool isEn = g.own[j] == other;
            int future = g.tr[j] + (isEn ? g.gr[j] * d : 0);
            int hostile = 0;
            for (int k = d; k <= std::min(HOR, d + 3); ++k) hostile += inEn[j][k];
            int allied = 0;
            for (int k = 1; k <= HOR; ++k) allied += inSelf[j][k];
            int need = future + hostile - allied + 1;
            if (!isEn && hostile > 0 && need < future + hostile + 2)
                need = future + hostile + 2;
            if (!isEn && need < claimed[j] + 3) continue;
            if (need < 3) need = 3;
            if (need > budget) continue;
            int prodTurns = std::max(0, g.maxTurns - (g.turn + d) + 1);
            double val = (double)g.gr[j] * prodTurns;
            if (isEn) val = val * 1.8 + (g.tr[j] + g.gr[j] * d) * 0.4;
            else if (g.turn < 60) val *= 1.0 + earlyFrac * (60 - g.turn) / 60.0;
            double cost = need + 0.35 * need * d + d * 3.0;
            double score = val / cost;
            if (!isEn && g.turn < 80) {
                double front = totEnDist[j] / totOwnDist[j];
                if (front < 0.8) score *= 0.4 + 0.75 * front;
            }
            if (style == 1) score *= 0.85 + (xrng() % 30) / 100.0;
            cands[nc++] = {j, need, d, score};
        }
        std::sort(cands, cands + nc, [](const Cand& a, const Cand& b) {
            return a.score > b.score;
        });
        int spent = 0;
        bool taken[MAXN] = {};
        for (int k = 0; k < nc && nj < 128 && res.cnt < 40; ++k) {
            if (taken[cands[k].to]) continue;
            if (spent + cands[k].cost > budget) continue;
            taken[cands[k].to] = true;
            spent += cands[k].cost;
            jobs[nj++] = {i, cands[k].to, cands[k].cost, cands[k].score * 100.0};
        }
    }

    std::sort(jobs, jobs + nj, [](const Job& a, const Job& b) { return a.score > b.score; });
    int left[MAXN];
    for (int i = 0; i < n; ++i) left[i] = g.tr[i];
    for (int k = 0; k < nj && res.cnt < 40; ++k) {
        if (left[jobs[k].from] < jobs[k].cost) continue;
        left[jobs[k].from] -= jobs[k].cost;
        res.o[res.cnt++] = {(int8_t)jobs[k].from, (int8_t)jobs[k].to, jobs[k].cost};
    }
    return res;
}

static int gameResult(const GState& g) {
    bool a1 = false, a2 = false;
    for (int i = 0; i < g.n; ++i) {
        if (g.own[i] == 1) a1 = true;
        if (g.own[i] == 2) a2 = true;
    }
    for (int i = 0; i < g.nf; ++i) {
        if (g.fl[i].owner == 1) a1 = true;
        else a2 = true;
    }
    if (!a1 && !a2) return 3;
    if (!a1) return 2;
    if (!a2) return 1;
    if (g.turn > g.maxTurns) {
        long long t1 = 0, t2 = 0;
        for (int i = 0; i < g.n; ++i) {
            if (g.own[i] == 1) t1 += g.tr[i];
            else if (g.own[i] == 2) t2 += g.tr[i];
        }
        for (int i = 0; i < g.nf; ++i) {
            if (g.fl[i].owner == 1) t1 += g.fl[i].troops;
            else t2 += g.fl[i].troops;
        }
        return t1 == t2 ? 3 : (t1 > t2 ? 1 : 2);
    }
    return 0;
}

static double evalState(const GState& g) {
    long long p1 = 0, p2 = 0;
    double prod1 = 0, prod2 = 0;
    for (int i = 0; i < g.n; ++i) {
        if (g.own[i] == 1) { p1 += g.tr[i]; prod1 += g.gr[i]; }
        else if (g.own[i] == 2) { p2 += g.tr[i]; prod2 += g.gr[i]; }
    }
    for (int i = 0; i < g.nf; ++i) {
        if (g.fl[i].owner == 1) p1 += g.fl[i].troops;
        else p2 += g.fl[i].troops;
    }
    return (double)(p1 - p2) + 60.0 * (prod1 - prod2);
}



struct RolloutResult { double score; int result; };

static inline void flipInPlace(GState& g) {
    for (int i = 0; i < g.n; ++i) if (g.own[i]) g.own[i] ^= 3;
    for (int i = 0; i < g.nf; ++i) g.fl[i].owner ^= 3;
}

static RolloutResult rollout(GState g, const MoveList& myFirst,
                             int stMe, int stOpp, int horizon) {
    MoveList mb{};
    int sa[64], da[64], za[64], na;
    int sb[64], db[64], zb[64], nb;
    bool first = true;
    int r = 0;
    while (g.turn <= horizon) {
        if (first) { mb = myFirst; first = false; }
        else mb = fastPolicy(g, 1, stMe);
        flipInPlace(g);
        MoveList mo = fastPolicy(g, 1, stOpp);
        flipInPlace(g);
        na = 0; nb = 0;
        applyOrders(g, mb, 1, sa, da, za, na);
        applyOrders(g, mo, 2, sb, db, zb, nb);
        settle(g, sa, da, za, na, sb, db, zb, nb);
        r = gameResult(g);
        if (r) break;
    }
    RolloutResult rr{};
    if (r == 1) { rr.result = 1; rr.score = 100000 + (g.maxTurns - g.turn) * 100; }
    else if (r == 2) { rr.result = 2; rr.score = -100000 - (g.maxTurns - g.turn) * 100; }
    else if (r == 3) { rr.result = 3; rr.score = 0; }
    else { rr.result = 0; rr.score = evalState(g); }
    return rr;
}

static long long millis() {
    using namespace std::chrono;
    return duration_cast<milliseconds>(steady_clock::now().time_since_epoch()).count();
}

} // namespace

int g_dbgDecide = 0;
#define DBGST(x) do{ if(g_dbgDecide){std::fprintf(stderr,x);std::fflush(stderr);} }while(0)

std::vector<Order> decide(const State& s) {
    DBGST("A");
    if (N == 0) {
        N = (int)s.nodes.size();
        for (int i = 0; i < N; ++i)
            for (int j = 0; j < N; ++j)
                gD[i][j] = s.dist[i][j];
        rngState ^= (uint64_t)(s.turn * 0x9e3779b97f4a7c15ULL);
    }

    long long tStart = millis();
    long long budget = s.turn == 1 ? 800 : 40;

    DBGST("A1");
    GState root;
    DBGST("A2");
    copyState(s, root);
    DBGST("B");
    std::vector<MoveList> cands;
    DBGST("B1");
    cands.push_back(policyMove(root, paramSet[0], 1)); DBGST("C");
    cands.push_back(fastPolicy(root, 1, 0)); DBGST("D");
    cands.push_back(fastPolicy(root, 1, 1)); DBGST("E");
    cands.push_back(fastPolicy(root, 1, 2)); DBGST("F");
    cands.push_back(MoveList{}); DBGST("G");

    int horizon = std::min(s.max_turns, s.turn + 60);
    if (s.max_turns - s.turn <= 70) horizon = s.max_turns;

    int nc = (int)cands.size();
    std::vector<double> sums(nc, 0);
    std::vector<int> games(nc, 0);
    static const int oppStyles[3] = {0, 1, 2};
    int round = 0;
    while (millis() - tStart < budget) {
        int oppP = oppStyles[round % 3];
        for (int c = 0; c < nc; ++c) {
            if (millis() - tStart >= budget) break;
            RolloutResult rr = rollout(root, cands[c], 0, oppP, horizon);
            sums[c] += rr.score;
            games[c]++;
        }
        ++round;
    }

    DBGST("H");
    int best = 0;
    double bestVal = -1e300;
    for (int c = 0; c < nc; ++c) {
        if (games[c] == 0) { if (c == 0) best = 0; continue; }
        double v = sums[c] / games[c];
        if (v > bestVal) { bestVal = v; best = c; }
    }

    std::vector<Order> out;
    MoveList chosen = cands[best];
    for (int i = 0; i < chosen.cnt; ++i)
        out.push_back({chosen.o[i].from, chosen.o[i].to, chosen.o[i].troops});
    DBGST("Z\n");
    return out;
}

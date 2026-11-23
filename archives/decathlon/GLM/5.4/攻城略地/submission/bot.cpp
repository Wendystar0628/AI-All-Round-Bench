// 攻城略地 bot — v10: hub-aware staging, garrison-preserving flow, decisive strikes
#include "engine.hpp"
#include <vector>
#include <algorithm>
#include <cstring>
#include <cmath>
#include <cstdint>
#include <chrono>
#include <cstdio>

#ifndef PSET
#define PSET 0
#endif

namespace {

constexpr int MAXN = 24;
constexpr int MAXF = 400;
constexpr int MAXT = 22;

int N = 0;
int DIST[MAXN][MAXN];
int GROWTH[MAXN];

struct Fl { int owner, troops, to, tl; };

struct Sim {
    int8_t owner[MAXN];
    int troops[MAXN];
    Fl fleets[MAXF];
    int nf;
    int turn;
};

inline void sim_step(Sim& s, const Order* a, int na, const Order* b, int nb) {
    auto dispatch = [&](const Order* ord, int cnt, int owner) {
        for (int i = 0; i < cnt; ++i) {
            const Order& o = ord[i];
            if (o.from < 0 || o.from >= N || o.to < 0 || o.to >= N) continue;
            if (s.owner[o.from] != owner || o.from == o.to || o.troops <= 0) continue;
            if (o.troops > s.troops[o.from]) continue;
            s.troops[o.from] -= o.troops;
            if (s.nf < MAXF) s.fleets[s.nf++] = {owner, o.troops, o.to, DIST[o.from][o.to]};
        }
    };
    dispatch(a, na, 1);
    dispatch(b, nb, 2);
    for (int i = 0; i < N; ++i) if (s.owner[i]) s.troops[i] += GROWTH[i];
    int sums[3][MAXN]; uint8_t part[3][MAXN];
    memset(sums, 0, sizeof(sums)); memset(part, 0, sizeof(part));
    int w = 0;
    for (int i = 0; i < s.nf; ++i) {
        Fl f = s.fleets[i];
        if (--f.tl == 0) { sums[f.owner][f.to] += f.troops; part[f.owner][f.to] = 1; }
        else s.fleets[w++] = f;
    }
    s.nf = w;
    for (int j = 0; j < N; ++j) {
        if (!(part[0][j] || part[1][j] || part[2][j])) continue;
        sums[s.owner[j]][j] += s.troops[j]; part[s.owner[j]][j] = 1;
        int ord[3], cnt = 0;
        for (int o = 0; o < 3; ++o) if (part[o][j]) ord[cnt++] = o;
        for (int x = 1; x < cnt; ++x) { int y = x; while (y > 0 && sums[ord[y-1]][j] < sums[ord[y]][j]) { std::swap(ord[y-1], ord[y]); --y; } }
        int top = sums[ord[0]][j], second = cnt > 1 ? sums[ord[1]][j] : 0;
        if (cnt > 1 && top == second) s.troops[j] = 0;
        else { s.owner[j] = ord[0]; s.troops[j] = top - second; }
    }
    ++s.turn;
}

struct Ctx {
    int arr[3][MAXN][MAXT];
    int maxtl;
    int eden[MAXN];
    int LF[MAXN][MAXT];
    int hub[MAXN];
};

inline void build_ctx(const Sim& s, Ctx& c, int me) {
    memset(c.arr, 0, sizeof(c.arr));
    c.maxtl = 0;
    int opp = 3 - me;
    for (int i = 0; i < s.nf; ++i) {
        const Fl& f = s.fleets[i];
        int o = f.owner == me ? 1 : 2;
        if (f.tl >= 1 && f.tl < MAXT) c.arr[o][f.to][f.tl] += f.troops;
        c.maxtl = std::max(c.maxtl, f.tl);
    }
    for (int j = 0; j < N; ++j) {
        c.eden[j] = 999;
        for (int e = 0; e < N; ++e) if (s.owner[e] == opp) c.eden[j] = std::min(c.eden[j], DIST[e][j]);
    }
    memset(c.LF, 0, sizeof(c.LF));
    for (int j = 0; j < N; ++j) {
        int acc[MAXT + 1]; memset(acc, 0, sizeof(acc));
        for (int e = 0; e < N; ++e) if (s.owner[e] == opp) {
            int d = DIST[e][j];
            if (d <= MAXT) acc[d] += s.troops[e];
        }
        int run = 0;
        for (int r = 0; r < MAXT; ++r) { run += acc[r]; c.LF[j][r] = run; }
    }
    for (int j = 0; j < N; ++j) {
        c.hub[j] = 0;
        for (int k = 0; k < N; ++k) if (DIST[j][k] <= 4) c.hub[j] += GROWTH[k];
    }
}

struct Proj { int owner, troops, simul_enemy, simul_mine, fell_turn, deficit; };

inline Proj project(const Sim& s, const Ctx& c, int j, int me, int d) {
    Proj p{s.owner[j], s.troops[j], 0, 0, 0, 0};
    int opp = 3 - me;
    for (int k = 1; k <= d; ++k) {
        if (p.owner) p.troops += GROWTH[j];
        int mine = c.arr[1][j][k], theirs = c.arr[2][j][k];
        if (k == d) { p.simul_mine = mine; p.simul_enemy = theirs; break; }
        if (!mine && !theirs) continue;
        int sum[3] = {0,0,0}; bool part[3] = {false,false,false};
        sum[p.owner] = p.troops; part[p.owner] = true;
        sum[me] += mine; part[me] = part[me] || mine > 0;
        sum[opp] += theirs; part[opp] = part[opp] || theirs > 0;
        int ord[3], cnt = 0;
        for (int o = 0; o < 3; ++o) if (part[o]) ord[cnt++] = o;
        for (int x = 1; x < cnt; ++x) { int y = x; while (y > 0 && sum[ord[y-1]] < sum[ord[y]]) { std::swap(ord[y-1], ord[y]); --y; } }
        int top = sum[ord[0]], second = cnt > 1 ? sum[ord[1]] : 0;
        if (cnt > 1 && top == second) p.troops = 0;
        else {
            if (p.owner == me && ord[0] != me) { p.fell_turn = k; p.deficit = sum[ord[0]] - sum[me]; }
            p.owner = ord[0]; p.troops = top - second;
        }
        if (p.fell_turn) break;
    }
    return p;
}

struct Fall { int turn, deficit; };
inline Fall sim_with_virtual(const Sim& s, const Ctx& c, int j, int me, int d, int X, int H) {
    int opp = 3 - me;
    int owner = s.owner[j], troops = s.troops[j];
    Fall f{0, 0};
    for (int k = 1; k <= H; ++k) {
        if (owner) troops += GROWTH[j];
        int mine = c.arr[1][j][k], theirs = c.arr[2][j][k];
        if (k == d) mine += X;
        if (!mine && !theirs) continue;
        int sum[3] = {0,0,0}; bool part[3] = {false,false,false};
        sum[owner] = troops; part[owner] = true;
        sum[me] += mine; part[me] = part[me] || mine > 0;
        sum[opp] += theirs; part[opp] = part[opp] || theirs > 0;
        int ord[3], cnt = 0;
        for (int o = 0; o < 3; ++o) if (part[o]) ord[cnt++] = o;
        for (int x = 1; x < cnt; ++x) { int y = x; while (y > 0 && sum[ord[y-1]] < sum[ord[y]]) { std::swap(ord[y-1], ord[y]); --y; } }
        int top = sum[ord[0]], second = cnt > 1 ? sum[ord[1]] : 0;
        if (cnt > 1 && top == second) troops = 0;
        else {
            if (owner == me && ord[0] != me) { f.turn = k; f.deficit = sum[ord[0]] - sum[me]; return f; }
            owner = ord[0]; troops = top - second;
        }
    }
    return f;
}

struct Params {
    double w_enemy = 2.0;
    double w_dist = 0.5;
    double contest_penalty = 0.4;
    double beta_att = 0.6;
    double beta_def = 0.35;
    int def_horizon = 12;
    double hold_H = 10;
    int max_ring = 4;
    double strike_margin = 0.25;
    int strike_margin_min = 3;
    int garrison_cap = 60;
    double staging_reach_w = 0.08;
    double staging_troops_w = 1.0;
    int flow_mode = 1;
};

Params get_params() {
    Params P;
#if PSET == 1
    P.strike_margin = 0.02; P.strike_margin_min = 1;
#elif PSET == 2
    P.beta_def = 0.5; P.garrison_cap = 80; P.strike_margin = 0.05; P.strike_margin_min = 2;
#elif PSET == 3
    P.beta_def = 0.25; P.garrison_cap = 40; P.strike_margin = 0.05; P.strike_margin_min = 2;
#elif PSET == 4
    P.strike_margin = 0.05; P.strike_margin_min = 2; P.w_dist = 0.2;
#elif PSET == 5
    P.strike_margin = 0.05; P.strike_margin_min = 2; P.contest_penalty = 0.6;
#endif
    return P;
}

struct Target { int j, cost, cost_eff, hold, d; double prio; };
struct Analysis {
    int need[MAXN], fall[MAXN], surplus[MAXN];
    std::vector<Target> targets;
    int staging = -1;
};

int g_staging = -1;

int take_cost(const Sim& s, const Ctx& c, int j, int me, int d, const Params& P) {
    int opp = 3 - me;
    int X = 0, cost = 0;
    for (int iter = 0; iter < 8; ++iter) {
        Proj p = project(s, c, j, me, d);
        int base;
        if (p.owner == me) base = std::max(0, p.simul_enemy - p.troops - p.simul_mine + 1);
        else if (p.owner == opp) base = p.troops + p.simul_enemy - p.simul_mine + 1;
        else base = std::max(p.troops, p.simul_enemy) - p.simul_mine + 1;
        base = std::max(base, 0);
        Fall f = sim_with_virtual(s, c, j, me, d, X + base, (int)std::max((double)d + 1, P.hold_H));
        if (!f.turn || f.turn <= d) { cost = X + base; break; }
        int grow = GROWTH[j] * (f.turn - d);
        X += (int)std::ceil((f.deficit + 1) / (1.0 + grow));
        cost = X + base;
        if (X > 10000) break;
    }
    return cost;
}

void analyze(const Sim& s, const Ctx& c, int me, const Params& P, Analysis& A) {
    int opp = 3 - me;
    int R = std::max(0, 200 - s.turn);
    for (int j = 0; j < N; ++j) { A.need[j] = 0; A.fall[j] = 0; A.surplus[j] = 0; }
    int H = std::min(P.def_horizon, c.maxtl + 1);
    for (int j = 0; j < N; ++j) if (s.owner[j] == me) {
        Fall f = sim_with_virtual(s, c, j, me, 0, 0, H);
        int need = 0;
        if (f.turn) {
            double disc = f.turn <= 6 ? 1.0 : std::max(0.3, 1.0 - (f.turn - 6) * 0.1);
            need = std::max(need, (int)std::ceil((f.deficit + 1) * disc));
            A.fall[j] = f.turn;
        }
        // garrison against plausible enemy strike: enemy force within reach, minus the
        // growth my node accumulates before that strike can arrive (eden turns away).
        if (c.eden[j] < MAXT) {
            int reach = std::min(MAXT - 1, c.eden[j] + 2);
            int lf = c.LF[j][reach];
            int gar = (int)(lf * P.beta_def) - GROWTH[j] * c.eden[j];
            gar = std::max(0, std::min(gar, P.garrison_cap));
            gar = std::min(gar, (int)(s.troops[j] + GROWTH[j] * 3 + 5));
            if (gar > need) { need = gar; A.fall[j] = std::max(A.fall[j], 1); }
        }
        A.need[j] = std::min(need, s.troops[j] + 1);
        A.surplus[j] = s.troops[j] - A.need[j];
    }
    // staging: my node closest to the enemy's troop mass (forward hub), with hysteresis
    {
        int best = -1; double bestv = 1e18;
        for (int i = 0; i < N; ++i) if (s.owner[i] == me) {
            double d = 0;
            for (int e = 0; e < N; ++e) if (s.owner[e] == opp) d += (double)DIST[i][e] * (s.troops[e] + GROWTH[e] * 4.0 + 5.0);
            d -= s.troops[i] * P.staging_troops_w;
            d -= c.hub[i] * 2.0;
            if (i == g_staging) d *= 0.8;
            if (d < bestv) { bestv = d; best = i; }
        }
        A.staging = best;
    }
    A.targets.clear();
    for (int j = 0; j < N; ++j) {
        if (s.owner[j] == me) continue;
        int dmin = 999;
        for (int i = 0; i < N; ++i) if (s.owner[i] == me && A.surplus[i] > 0) dmin = std::min(dmin, DIST[i][j]);
        if (dmin == 999) continue;
        int cost = take_cost(s, c, j, me, dmin, P);
        if (cost <= 0) continue;
        // enemy troops that can reach j before my strike (arriving by dmin-1)
        int pre = (int)(c.LF[j][std::min(MAXT - 1, dmin - 1)] * P.beta_att);
        int cost_eff = cost + pre;
        // garrison to leave on j after capture: enemy force within their reach, minus growth
        int ed = std::min(c.eden[j], MAXT - 1);
        int hold = (int)(c.LF[j][std::min(MAXT - 1, ed + 2)] * P.beta_def) - GROWTH[j] * ed;
        hold = std::max(0, std::min(hold, P.garrison_cap));
        double cf = (dmin <= c.eden[j]) ? 1.0 : P.contest_penalty;
        bool enemy = s.owner[j] == opp;
        double val = GROWTH[j] * (enemy ? P.w_enemy : 1.0) * cf;
        // hub bonus: capturing a hub node enables further expansion
        val *= (1.0 + c.hub[j] * 0.02);
        double pr = val * (double)(R - dmin) / (double)(cost_eff + P.w_dist * dmin + 1);
        A.targets.push_back({j, cost, cost_eff, hold, dmin, pr});
    }
    std::sort(A.targets.begin(), A.targets.end(), [](const Target& a, const Target& b) { return a.prio > b.prio; });
}

std::vector<Order> plan_from(const Sim& s, const Ctx& c, int me, const Params& P, const Analysis& A, int limit, int reinforce, int flow) {
    int opp = 3 - me;
    std::vector<Order> orders;
    int surplus[MAXN];
    for (int j = 0; j < N; ++j) surplus[j] = A.surplus[j];

    if (reinforce) {
        for (int j = 0; j < N; ++j) if (s.owner[j] == me && A.fall[j]) {
            int deficit = A.need[j] - s.troops[j];
            if (deficit <= 0) continue;
            int avail = 0;
            for (int i = 0; i < N; ++i) if (i != j && s.owner[i] == me && surplus[i] > 0 && DIST[i][j] <= A.fall[j]) avail += surplus[i];
            if (avail < deficit) continue;
            int rem = deficit;
            while (rem > 0) {
                int best = -1, bd = 999;
                for (int i = 0; i < N; ++i)
                    if (i != j && s.owner[i] == me && surplus[i] > 0 && DIST[i][j] <= A.fall[j] && DIST[i][j] < bd) { bd = DIST[i][j]; best = i; }
                if (best < 0) break;
                int take = std::min(surplus[best], rem);
                orders.push_back({best, j, take});
                surplus[best] -= take; rem -= take;
            }
        }
    }

    int done = 0;
    for (const Target& t : A.targets) {
        if (done >= limit) break;
        int total = 0; for (int i = 0; i < N; ++i) total += std::max(0, surplus[i]);
        if (total < t.cost_eff) continue;
        bool struck = false;
        for (int d = t.d; d <= t.d + P.max_ring && !struck; ++d) {
            int cost = take_cost(s, c, t.j, me, d, P);
            int amt = cost + t.hold + std::max(P.strike_margin_min, (int)(cost * P.strike_margin));
            int ring = 0;
            for (int i = 0; i < N; ++i) if (s.owner[i] == me && surplus[i] > 0 && DIST[i][t.j] == d) ring += surplus[i];
            if (ring < amt) continue;
            int rem = amt;
            for (int i = 0; i < N && rem > 0; ++i) if (s.owner[i] == me && surplus[i] > 0 && DIST[i][t.j] == d) {
                int take = std::min(surplus[i], rem);
                if (take > 0) { orders.push_back({i, t.j, take}); surplus[i] -= take; rem -= take; }
            }
            struck = true;
        }
        if (struck) ++done;
    }

    if (flow && A.staging >= 0) {
        int S = A.staging;
        for (int i = 0; i < N; ++i) {
            if (s.owner[i] != me || i == S || surplus[i] <= 0) continue;
            // hop toward S: nearby my-node that is strictly closer to S
            int bestk = S; int bestd = DIST[i][S];
            for (int k = 0; k < N; ++k) {
                if (s.owner[k] != me || k == i) continue;
                if (DIST[k][S] >= DIST[i][S]) continue;
                if (DIST[i][k] > 5) continue;
                if (DIST[k][S] < bestd || (DIST[k][S] == bestd && DIST[i][k] < DIST[i][bestk])) { bestd = DIST[k][S]; bestk = k; }
            }
            orders.push_back({i, bestk, surplus[i]});
            surplus[i] = 0;
        }
    }
    return orders;
}

std::vector<Order> policy(const Sim& s, int me, const Params& P) {
    Ctx c; build_ctx(s, c, me);
    Analysis A; analyze(s, c, me, P, A);
    return plan_from(s, c, me, P, A, 100, 1, 1);
}

} // namespace

std::vector<Order> decide(const State& s) {
    N = (int)s.nodes.size();
    for (int i = 0; i < N; ++i) {
        GROWTH[i] = s.nodes[i].growth;
        for (int j = 0; j < N; ++j) DIST[i][j] = s.dist[i][j];
    }
    Sim sim; sim.nf = 0; sim.turn = s.turn;
    for (int i = 0; i < N; ++i) { sim.owner[i] = s.nodes[i].owner; sim.troops[i] = s.nodes[i].troops; }
    for (const auto& f : s.fleets) if (sim.nf < MAXF) sim.fleets[sim.nf++] = {f.owner, f.troops, f.to, f.turns_left};
    Params P = get_params();
    Ctx c; build_ctx(sim, c, 1);
    Analysis A; analyze(sim, c, 1, P, A);
    if (A.staging >= 0) g_staging = A.staging;
#ifdef DEBUG
    fprintf(stderr, "staging=%d\n", A.staging);
    for (int j = 0; j < N; ++j) if (sim.owner[j] == 1)
        fprintf(stderr, "node %d troops=%d need=%d fall=%d surplus=%d hub=%d\n", j, sim.troops[j], A.need[j], A.fall[j], A.surplus[j], c.hub[j]);
    for (auto& t : A.targets)
        fprintf(stderr, "target %d owner=%d troops=%d g=%d cost=%d eff=%d hold=%d d=%d prio=%.2f\n", t.j, sim.owner[t.j], sim.troops[t.j], GROWTH[t.j], t.cost, t.cost_eff, t.hold, t.d, t.prio);
#endif
    return plan_from(sim, c, 1, P, A, 100, 1, 1);
}

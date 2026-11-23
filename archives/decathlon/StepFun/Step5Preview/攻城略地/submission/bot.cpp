#include "engine.hpp"
#include <vector>
#include <algorithm>
#include <cmath>
#include <climits>

// Tunable parameters (overridable at compile time for development experiments).
#ifndef DEF_W
#define DEF_W 0.35
#endif
#ifndef DEF_DECAY
#define DEF_DECAY 0.85
#endif
#ifndef DEF_HGROW
#define DEF_HGROW 6.0
#endif
#ifndef DEF_R
#define DEF_R 20
#endif
#ifndef RESP_DECAY
#define RESP_DECAY 0.90
#endif
#ifndef RESP_W
#define RESP_W 0.5
#endif
#ifndef BASE_W
#define BASE_W 2.0
#endif
#ifndef MARGIN_W
#define MARGIN_W 0.0
#endif
#ifndef MARGIN_ADD
#define MARGIN_ADD 1.0
#endif
#ifndef DIST_PEN
#define DIST_PEN 0.02
#endif
#ifndef STAGE
#define STAGE 1
#endif
#ifndef CONTEST_W
#define CONTEST_W 0.15
#endif
#ifndef RACE_SKIP
#define RACE_SKIP 1
#endif
#ifndef RISK_W
#define RISK_W 0.15
#endif
#ifndef RISK_DECAY
#define RISK_DECAY 0.75
#endif

namespace {

struct Params {
    double def_w, def_decay, def_hgrow;
    int def_r;
    double resp_decay, resp_w, base_w;
    double margin_w, margin_add, dist_pen;
    int stage;
    double contest_w;
    int race_skip;
    double risk_w, risk_decay;
};

Params makeParams() {
    Params p;
    p.def_w = DEF_W; p.def_decay = DEF_DECAY; p.def_hgrow = DEF_HGROW; p.def_r = DEF_R;
    p.resp_decay = RESP_DECAY; p.resp_w = RESP_W; p.base_w = BASE_W;
    p.margin_w = MARGIN_W; p.margin_add = MARGIN_ADD; p.dist_pen = DIST_PEN;
    p.stage = STAGE; p.contest_w = CONTEST_W; p.race_skip = RACE_SKIP;
    p.risk_w = RISK_W; p.risk_decay = RISK_DECAY;
    return p;
}

struct Wave { int a, w; };

// Cross-turn memory: estimated troops each enemy node ships away per turn.
struct EnemyModel {
    std::vector<double> send;   // smoothed send rate per node
    std::vector<int> troops;    // last seen troops per node
    int turn = -1;
    bool valid = false;
};
EnemyModel g_em;

void updateEnemyModel(const State& s) {
    const int n = (int)s.nodes.size();
    if (!g_em.valid || g_em.turn != s.turn - 1 ||
        (int)g_em.send.size() != n) {
        g_em.send.assign(n, 0.0);
        g_em.troops.assign(n, 0);
        g_em.valid = true;
        g_em.turn = s.turn;
        for (int k = 0; k < n; ++k) g_em.troops[k] = s.nodes[k].troops;
        return;
    }
    // fleets the enemy dispatched on the previous turn
    std::vector<int> sent(n, 0);
    for (const auto& f : s.fleets) {
        if (f.owner != 2) continue;
        int d = s.dist[f.from][f.to];
        int st = s.turn - d + f.turns_left;
        if (st == s.turn - 1) sent[f.from] += f.troops;
    }
    for (int k = 0; k < n; ++k) {
        if (s.nodes[k].owner != 2) { g_em.send[k] = 0; continue; }
        double cur = std::min<double>(sent[k], 3.0 * s.nodes[k].growth + 2.0);
        g_em.send[k] = 0.65 * g_em.send[k] + 0.35 * cur;
    }
    for (int k = 0; k < n; ++k) g_em.troops[k] = s.nodes[k].troops;
    g_em.turn = s.turn;
}

// Troops an enemy node is expected to hold `dt` turns from now.
double enFuture(const State& s, int k, int dt) {
    const Node& nd = s.nodes[k];
    double keep_rate = nd.growth - g_em.send[k];
    if (keep_rate < 0) keep_rate = 0;
    return nd.troops + keep_rate * dt;
}

// Simulate the battle at node j with my waves (sorted by arrival turn) plus
// committed enemy arrivals. Returns 1 if I end up owning j, 2 if the enemy does.
int simNode(const State& s, int j, const std::vector<Wave>& myWaves,
            const std::vector<int>& enAt, int& capTurn, int& leftover) {
    const int maxT = s.max_turns, turn = s.turn;
    int owner = s.nodes[j].owner;
    int G = s.nodes[j].troops;
    const int g = s.nodes[j].growth;
    size_t mi = 0;
    for (int a = turn; a <= maxT; ++a) {
        if (owner) G += g;
        int sumMine = 0;
        while (mi < myWaves.size() && myWaves[mi].a < a) ++mi;
        while (mi < myWaves.size() && myWaves[mi].a == a) { sumMine += myWaves[mi].w; ++mi; }
        int sumEn = enAt[a];
        if (sumMine == 0 && sumEn == 0) continue;
        int side[3] = {0, 0, 0};
        side[owner] += G;
        if (sumMine) side[1] += sumMine;
        if (sumEn) side[2] += sumEn;
        int best = -1, second = 0;
        for (int k = 0; k < 3; ++k) {
            bool part = (k == owner) || (k == 1 && sumMine) || (k == 2 && sumEn);
            if (!part) continue;
            if (side[k] > best) { second = best; best = side[k]; }
            else if (side[k] > second) second = side[k];
        }
        int cnt = 0;
        for (int k = 0; k < 3; ++k) {
            bool part = (k == owner) || (k == 1 && sumMine) || (k == 2 && sumEn);
            if (part && side[k] == best) ++cnt;
        }
        if (cnt > 1) { G = 0; }
        else {
            int win = -1;
            for (int k = 0; k < 3; ++k) {
                bool part = (k == owner) || (k == 1 && sumMine) || (k == 2 && sumEn);
                if (part && side[k] == best) win = k;
            }
            owner = win; G = best - second;
        }
        if (owner == 1) { capTurn = a; leftover = G; return 1; }
        if (owner == 2) { capTurn = a; leftover = G; return 2; }
    }
    return 0;
}

std::vector<Order> plan(const State& s, const Params& P) {
    const int n = (int)s.nodes.size();
    const int turn = s.turn, maxT = s.max_turns;
    std::vector<Order> orders;
    if (n <= 0) return orders;

    updateEnemyModel(s);

    std::vector<std::vector<int>> enIn(n, std::vector<int>(maxT + 2, 0));
    std::vector<std::vector<int>> myIn(n, std::vector<int>(maxT + 2, 0));
    for (const auto& f : s.fleets) {
        int a = turn + f.turns_left - 1;
        if (a < turn || a > maxT) continue;
        if (f.owner == 2) enIn[f.to][a] += f.troops;
        else if (f.owner == 1) myIn[f.to][a] += f.troops;
    }

    // --- defense requirements ---
    std::vector<int> keep(n, 0), committedNeed(n, 0), critTurn(n, maxT + 1);
    for (int j = 0; j < n; ++j) {
        if (s.nodes[j].owner != 1) continue;
        const Node& nd = s.nodes[j];
        int need = 0, cumMy = 0;
        for (int a = turn; a <= maxT; ++a) {
            cumMy += myIn[j][a];
            int proj = nd.troops + nd.growth * (a - turn) + cumMy;
            int d2 = enIn[j][a] - proj;
            if (d2 > 0) {
                if (critTurn[j] > maxT) critTurn[j] = a;
                if (d2 > need) need = d2;
            }
        }
        committedNeed[j] = need;
        double th = 0;
        for (int k = 0; k < n; ++k) {
            if (s.nodes[k].owner != 2) continue;
            int d = s.dist[k][j];
            if (d < 2) d = 2;
            if (d > P.def_r) continue;
            double stock = enFuture(s, k, P.def_hgrow);
            th += stock * std::pow(P.def_decay, d - 1);
        }
        double resp = 0;
        for (int i = 0; i < n; ++i) {
            if (i == j || s.nodes[i].owner != 1) continue;
            int d = s.dist[i][j];
            if (d < 2) d = 2;
            resp += s.nodes[i].troops * std::pow(P.resp_decay, d - 1);
        }
        double net = th - P.resp_w * resp;
        if (net < 0) net = 0;
        int reserve = (int)std::llround(P.def_w * net)
                    + (int)std::llround(P.base_w * nd.growth);
        keep[j] = std::min(nd.troops, need + reserve);
    }

    std::vector<int> surplus(n, 0);
    for (int i = 0; i < n; ++i)
        if (s.nodes[i].owner == 1) surplus[i] = s.nodes[i].troops - keep[i];

    // --- reinforce nodes that will fall to committed enemy fleets ---
    for (int j = 0; j < n; ++j) {
        if (s.nodes[j].owner != 1) continue;
        int shortfall = committedNeed[j];
        if (shortfall <= 0) continue;
        int deadline = critTurn[j];
        std::vector<int> src;
        for (int i = 0; i < n; ++i)
            if (s.nodes[i].owner == 1 && surplus[i] > 0 && i != j) src.push_back(i);
        std::sort(src.begin(), src.end(), [&](int a, int b) {
            return s.dist[a][j] < s.dist[b][j];
        });
        for (int i : src) {
            if (shortfall <= 0) break;
            int d = s.dist[i][j];
            if (turn + d - 1 > deadline) continue;
            int send = std::min(surplus[i], shortfall + 1);
            if (send <= 0) continue;
            orders.push_back({i, j, send});
            surplus[i] -= send;
            shortfall -= send;
        }
    }

    // --- expansion / attack ---
    struct Tgt {
        double score; int j; int price; int a0; int d0; int value;
        std::vector<int> srcs;
        bool race_lost;
    };
    std::vector<Tgt> tgts;
    for (int j = 0; j < n; ++j) {
        if (s.nodes[j].owner == 1) continue;
        const Node& t = s.nodes[j];
        std::vector<int> srcs;
        for (int i = 0; i < n; ++i) {
            if (s.nodes[i].owner != 1 || surplus[i] <= 0) continue;
            int d = s.dist[i][j];
            if (turn + d - 1 > maxT) continue;
            srcs.push_back(i);
        }
        if (srcs.empty()) continue;
        std::sort(srcs.begin(), srcs.end(), [&](int a, int b) {
            if (s.dist[a][j] != s.dist[b][j]) return s.dist[a][j] < s.dist[b][j];
            return surplus[a] > surplus[b];
        });
        int d0 = s.dist[srcs[0]][j];
        int a0 = turn + d0 - 1;
        // enemy race info
        int a_e = INT_MAX, f_e = 0;
        for (int k = 0; k < n; ++k) {
            if (s.nodes[k].owner != 2) continue;
            int d = s.dist[k][j];
            int a = turn + d - 1;
            if (a > maxT) continue;
            int f = s.nodes[k].troops;
            if (a < a_e || (a == a_e && f > f_e)) { a_e = a; f_e = f; }
        }
        int price_e = (int)std::llround(enFuture(s, j, std::max(0, a_e - turn))) + 1;
        bool race_lost = P.race_skip && a_e < a0 && f_e >= price_e;
        int price = (int)std::llround(enFuture(s, j, a0 - turn)) + 1;
        if (!race_lost && a_e <= a0 && f_e >= price) price = f_e + 1;
        for (int tt = turn; tt < a0; ++tt) price += enIn[j][tt];
        for (int tt = turn; tt <= a0; ++tt) price -= myIn[j][tt];
        if (price < 2) price = 2;
        int R = maxT - a0;
        int swing, capital;
        if (t.owner == 2) {
            swing = 2 * t.growth * R;
            capital = price;
        } else {
            swing = t.growth * R - t.troops;
            capital = t.troops + 1;
        }
        if (swing <= 0) continue;
        double recap = 0;
        for (int k = 0; k < n; ++k) {
            if (s.nodes[k].owner != 2) continue;
            int d = s.dist[k][j];
            if (d < 2) d = 2;
            recap += (s.nodes[k].troops + 2.0 * s.nodes[k].growth)
                     * std::pow(P.risk_decay, d - 1);
        }
        int cap2 = capital + (int)std::llround(P.risk_w * recap);
        double score = swing / (double)(cap2 + 1) - P.dist_pen * d0;
        if (a_e < a0) score -= P.contest_w * std::min(6, a0 - a_e);
        if (race_lost) score = -1e18;
        tgts.push_back({score, j, price, a0, d0, swing, srcs, race_lost});
    }
    std::sort(tgts.begin(), tgts.end(), [](const Tgt& x, const Tgt& y) {
        return x.score > y.score;
    });

    // Pass 1: targets we can capture now.
    std::vector<char> done(n, 0);
    for (auto& tg : tgts) {
        if (done[tg.j] || tg.race_lost) continue;
        int need = tg.price;
        std::vector<Wave> waves;
        for (int tt = turn; tt <= maxT; ++tt)
            if (myIn[tg.j][tt] > 0) waves.push_back({tt, myIn[tg.j][tt]});
        std::vector<std::pair<int,int>> takes;
        int sent = 0;
        for (int i : tg.srcs) {
            if (sent >= need) break;
            if (surplus[i] <= 0) continue;
            int take = std::min(surplus[i], need - sent);
            if (take <= 0) continue;
            takes.push_back({i, take});
            waves.push_back({turn + s.dist[i][tg.j] - 1, take});
            sent += take;
        }
        if (sent < need) continue;
        int capTurn = 0, left = 0;
        std::sort(waves.begin(), waves.end(), [](const Wave& x, const Wave& y) {
            return x.a < y.a;
        });
        if (simNode(s, tg.j, waves, enIn[tg.j], capTurn, left) != 1) continue;
        int margin = (int)std::llround(P.margin_w * need) + (int)P.margin_add;
        for (auto& pr : takes) {
            int i = pr.first;
            int extra = std::min(surplus[i] - pr.second, margin);
            if (extra > 0) { pr.second += extra; margin -= extra; }
        }
        for (auto& pr : takes) {
            if (pr.second <= 0) continue;
            orders.push_back({pr.first, tg.j, pr.second});
            surplus[pr.first] -= pr.second;
        }
        done[tg.j] = 1;
    }

    // Pass 2: chip the best neutral we cannot finish yet.
    for (auto& tg : tgts) {
        if (done[tg.j]) continue;
        if (s.nodes[tg.j].owner != 0) continue;
        if (tg.race_lost) continue;
        int want = tg.price;
        for (int i : tg.srcs) {
            if (want <= 0) break;
            if (surplus[i] <= 0) continue;
            int take = std::min(surplus[i], want);
            orders.push_back({i, tg.j, take});
            surplus[i] -= take;
            want -= take;
        }
        break;
    }

    // --- stage leftover force toward the primary target ---
    if (P.stage) {
        int prim = -1;
        for (auto& tg : tgts) {
            if (done[tg.j] || tg.race_lost) continue;
            prim = tg.j;
            break;
        }
        if (prim < 0) {
            for (auto& tg : tgts) { prim = tg.j; break; }
        }
        if (prim >= 0) {
            for (int i = 0; i < n; ++i) {
                if (s.nodes[i].owner != 1 || surplus[i] <= 0) continue;
                int best = -1, bestKey = INT_MAX;
                for (int m = 0; m < n; ++m) {
                    if (s.nodes[m].owner != 1 || m == i) continue;
                    int dm = s.dist[m][prim];
                    if (dm >= s.dist[i][prim]) continue;
                    int key = dm * 100 + s.dist[i][m];
                    if (key < bestKey) { bestKey = key; best = m; }
                }
                if (best >= 0 && surplus[i] > 0) orders.push_back({i, best, surplus[i]});
            }
        }
    }
    return orders;
}

} // namespace

std::vector<Order> decide(const State& s) {
    static const Params P = makeParams();
    return plan(s, P);
}

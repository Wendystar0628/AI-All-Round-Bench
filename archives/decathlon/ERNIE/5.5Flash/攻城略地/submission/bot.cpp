#include "engine.hpp"
#include <vector>
#include <algorithm>
#include <cmath>

using namespace std;

static inline long long clampv(long long x, long long lo, long long hi) {
    return x < lo ? lo : (x > hi ? hi : x);
}

// ------------- cross-turn per-node troop trend (net growth minus outflow) -------------
static vector<double> gTrend;
static vector<int> gPrevTroops, gPrevOwner;
static int gPrevTurn = -1;

struct Params {
    double garW1;
    double garW2;
    int maxTargets;
};

static const Params P_BASE = {0.85, 0.45, 4};

static std::vector<Order> computePlan(const State& s, const vector<double>& trend) {
    const Params& P = P_BASE;
    const int n = (int)s.nodes.size();
    const int turn = s.turn;
    const int maxT = s.max_turns;
    const long long remTurns = maxT - turn + 1;

    vector<int> rem(n, 0);
    vector<char> mine(n, 0), enemy(n, 0);
    vector<vector<pair<int, int>>> eArr(n), mArr(n);
    for (int i = 0; i < n; ++i) {
        int o = s.nodes[i].owner;
        if (o == 1) { mine[i] = 1; rem[i] = s.nodes[i].troops; }
        else if (o == 2) enemy[i] = 1;
    }
    for (const auto& f : s.fleets) {
        int at = turn + f.turns_left - 1;
        if (f.owner == 2) eArr[f.to].push_back({at, f.troops});
        else if (f.owner == 1) mArr[f.to].push_back({at, f.troops});
    }

    // required garrison from known enemy fleets (linear simulation)
    vector<int> req(n, 0);
    for (int i = 0; i < n; ++i) {
        if (!mine[i]) continue;
        int maxAt = turn;
        for (auto& e : eArr[i]) if (e.first > maxAt) maxAt = e.first;
        for (auto& m : mArr[i]) if (m.first > maxAt) maxAt = m.first;
        long long t = 0, mn = 0;
        for (int tt = turn; tt <= maxAt; ++tt) {
            t += s.nodes[i].growth;
            for (auto& e : eArr[i]) if (e.first == tt) t -= e.second;
            for (auto& m : mArr[i]) if (m.first == tt) t += m.second;
            if (t < mn) mn = t;
        }
        req[i] = (int)clampv(-mn, 0, (long long)rem[i]);
    }

    auto estEnemy = [&](int j, int d) -> long long {
        double tr = (j < (int)trend.size()) ? trend[j] : (double)s.nodes[j].growth;
        long long e = (long long)s.nodes[j].troops + (long long)llround(tr * d);
        if (e < 0) e = 0;
        return e;
    };

    // garrison including potential nearby enemy attacks
    vector<int> gar(n, 0);
    for (int i = 0; i < n; ++i) {
        if (!mine[i]) continue;
        int need = req[i];
        long long near = 0;
        for (int j = 0; j < n; ++j) {
            if (!enemy[j]) continue;
            int d = s.dist[i][j];
            if (d <= 3) {
                long long p = estEnemy(j, d);
                double w = (d <= 2) ? P.garW1 : P.garW2;
                long long contrib = (long long)(p * w);
                if (contrib > near) near = contrib;
            }
        }
        long long cand = 1 + near;
        if (cand > need) need = (int)cand;
        if (need > rem[i]) need = rem[i];
        gar[i] = need;
    }

    vector<int> avail(n, 0);
    for (int i = 0; i < n; ++i) if (mine[i]) avail[i] = rem[i] - gar[i];

    auto myInc = [&](int j, int arr) -> long long {
        long long inc = 0;
        for (auto& m : mArr[j]) if (m.first <= arr) inc += m.second;
        return inc;
    };
    auto enIncBefore = [&](int j, int arr) -> long long {
        long long inc = 0;
        for (auto& e : eArr[j]) if (e.first < arr) inc += e.second;
        return inc;
    };

    vector<int> depth(n, 1 << 28);
    for (int i = 0; i < n; ++i) if (mine[i])
        for (int j = 0; j < n; ++j) if (enemy[j])
            depth[i] = min(depth[i], s.dist[i][j]);

    struct T { int node; bool en; double prio; long long cost; int d; };
    vector<T> targets;
    for (int j = 0; j < n; ++j) {
        if (mine[j]) continue;
        bool en = enemy[j];
        long long bestCost = (1LL << 60);
        int bestD = 1 << 30;
        for (int i = 0; i < n; ++i) {
            if (!mine[i] || avail[i] <= 0) continue;
            int d = s.dist[i][j];
            int arr = turn + d - 1;
            long long cost;
            if (!en) {
                if (enIncBefore(j, arr) >= (long long)s.nodes[j].troops) continue;
                cost = (long long)s.nodes[j].troops + 1 - myInc(j, arr);
            } else {
                long long def = estEnemy(j, d);
                for (auto& e : eArr[j]) if (e.first <= arr) def += e.second;
                cost = def + 1 - myInc(j, arr);
            }
            if (cost < 1) continue;
            if (cost < bestCost || (cost == bestCost && d < bestD)) { bestCost = cost; bestD = d; }
        }
        if (bestCost >= (1LL << 60)) continue;
        long long value = (en ? 2LL : 1LL) * (long long)s.nodes[j].growth * max(0LL, remTurns - bestD);
        if (value <= 0) continue;
        int enD = 1 << 28;
        for (int i = 0; i < n; ++i) if (enemy[i]) enD = min(enD, s.dist[i][j]);
        double cf;
        if (en) cf = 1.0;
        else if (enD >= (1 << 28)) cf = 1.0;
        else {
            cf = 0.5 + 0.25 * (double)(enD - bestD);
            if (cf < 0.05) cf = 0.05;
            if (cf > 1.0) cf = 1.0;
        }
        double prio = (double)value * cf / (double)(bestCost + 1);
        targets.push_back({j, en, prio, bestCost, bestD});
    }
    sort(targets.begin(), targets.end(), [](const T& a, const T& b) {
        if (a.prio != b.prio) return a.prio > b.prio;
        return a.node < b.node;
    });

    vector<Order> orders;
    int done = 0;
    for (auto& t : targets) {
        if (done >= P.maxTargets) break;
        int best = -1;
        long long bestCost = 0;
        int bestAvail = -1;
        for (int i = 0; i < n; ++i) {
            if (!mine[i] || avail[i] <= 0) continue;
            int d = s.dist[i][t.node];
            int arr = turn + d - 1;
            long long cost;
            if (!t.en) {
                if (enIncBefore(t.node, arr) >= (long long)s.nodes[t.node].troops) continue;
                cost = (long long)s.nodes[t.node].troops + 1 - myInc(t.node, arr);
            } else {
                long long def = estEnemy(t.node, d);
                for (auto& e : eArr[t.node]) if (e.first <= arr) def += e.second;
                cost = def + 1 - myInc(t.node, arr);
            }
            if (cost < 1 || cost > avail[i]) continue;
            if (avail[i] > bestAvail || (avail[i] == bestAvail && cost < bestCost)) {
                best = i;
                bestCost = cost;
                bestAvail = avail[i];
            }
        }
        if (best >= 0) {
            orders.push_back({best, t.node, (int)bestCost});
            avail[best] -= (int)bestCost;
            done++;
        }
    }

    // mass leftover surplus at the deepest front node
    {
        int frontNode = -1, frontDepth = 1 << 30;
        for (int i = 0; i < n; ++i) if (mine[i]) {
            if (depth[i] < frontDepth) { frontDepth = depth[i]; frontNode = i; }
        }
        if (frontNode >= 0) {
            for (int i = 0; i < n; ++i) {
                if (!mine[i] || i == frontNode) continue;
                if (avail[i] > 0) {
                    orders.push_back({i, frontNode, avail[i]});
                    avail[i] = 0;
                }
            }
        }
    }
    return orders;
}

std::vector<Order> decide(const State& s) {
    const int n = (int)s.nodes.size();
    const int turn = s.turn;

    if ((int)gPrevTroops.size() != n) {
        gPrevTroops.assign(n, 0);
        gPrevOwner.assign(n, -1);
        gTrend.assign(n, 0.0);
        for (int i = 0; i < n; ++i)
            gTrend[i] = (s.nodes[i].owner != 0) ? (double)s.nodes[i].growth : 0.0;
    }
    for (int i = 0; i < n; ++i) {
        if (gPrevOwner[i] == s.nodes[i].owner && s.nodes[i].owner != 0) {
            double d = (double)((long long)s.nodes[i].troops - gPrevTroops[i]);
            if (d > 30) d = 30;
            if (d < -30) d = -30;
            gTrend[i] = 0.5 * gTrend[i] + 0.5 * d;
        } else {
            gTrend[i] = (s.nodes[i].owner != 0) ? (double)s.nodes[i].growth : 0.0;
        }
        gPrevTroops[i] = s.nodes[i].troops;
        gPrevOwner[i] = s.nodes[i].owner;
    }
    gPrevTurn = turn;

    return computePlan(s, gTrend);
}
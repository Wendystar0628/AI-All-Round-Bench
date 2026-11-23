#include "engine.hpp"
#include <vector>
#include <algorithm>
#include <cmath>

namespace {
struct Plan {
    int dst, eta, need;
    double score;
};

static int clamp_nonnegative(long long x) {
    if (x < 0) return 0;
    if (x > 1000000000LL) return 1000000000;
    return (int)x;
}
}

std::vector<Order> decide(const State& s) {
    const int n = (int)s.nodes.size();
    std::vector<Order> answer;
    if (n == 0) return answer;

    // Known forces arriving at each node on each future settlement.
    const int horizon = 24;
    std::vector<std::vector<std::vector<long long>>> incoming(
        3, std::vector<std::vector<long long>>(n, std::vector<long long>(horizon + 1)));
    for (const auto& f : s.fleets) {
        if (f.to >= 0 && f.to < n && f.owner >= 1 && f.owner <= 2 &&
            f.turns_left >= 1 && f.turns_left <= horizon)
            incoming[f.owner][f.to][f.turns_left] += f.troops;
    }

    struct Forecast { int owner; long long troops, sums[3]; };
    auto forecast = [&](int dst, int eta) {
        int owner = s.nodes[dst].owner;
        long long troops = s.nodes[dst].troops;
        Forecast at{owner, troops, {0, 0, 0}};
        for (int t = 1; t <= eta; ++t) {
            if (owner != 0) troops += s.nodes[dst].growth;
            long long sums[3] = {0, 0, 0};
            bool present[3] = {false, false, false};
            sums[owner] += troops;
            present[owner] = true;
            for (int side = 1; side <= 2; ++side) {
                sums[side] += incoming[side][dst][t];
                if (incoming[side][dst][t] > 0) present[side] = true;
            }
            if (t == eta) {
                at.owner = owner;
                at.troops = troops;
                for (int side = 0; side < 3; ++side) at.sums[side] = sums[side];
                return at;
            }
            int topOwner = owner;
            long long top = -1, second = -1;
            for (int side = 0; side < 3; ++side) if (present[side]) {
                if (sums[side] > top) { second = top; top = sums[side]; topOwner = side; }
                else if (sums[side] > second) second = sums[side];
            }
            if (second == top) { troops = 0; }
            else { owner = topOwner; troops = top - std::max(0LL, second); }
        }
        return at;
    };

    // Minimum garrison that survives the complete known arrival sequence.
    // Considering each hostile fleet separately misses attacks that chip a
    // node down over several consecutive rounds.
    auto requiredGarrison = [&](int dst) {
        const int growth = s.nodes[dst].growth;
        auto survives = [&](long long initial) {
            long long troops = initial;
            for (int t = 1; t <= horizon; ++t) {
                troops += growth;
                const long long own = troops + incoming[1][dst][t];
                const long long enemy = incoming[2][dst][t];
                if (enemy > own) return false;
                if (enemy == own && enemy > 0) troops = 0;
                else troops = own - enemy;
            }
            return true;
        };
        long long hi = 1;
        while (hi < 1000000000LL && !survives(hi)) hi *= 2;
        long long lo = 0;
        while (lo < hi) {
            const long long mid = lo + (hi - lo) / 2;
            if (survives(mid)) hi = mid;
            else lo = mid + 1;
        }
        return lo;
    };

    std::vector<int> available(n, 0);
    for (int i = 0; i < n; ++i) {
        const Node& p = s.nodes[i];
        if (p.owner != 1 || p.troops <= 0) continue;
        int reserve = 1;
        int nearest = 1000;
        for (int j = 0; j < n; ++j) if (s.nodes[j].owner == 2)
            nearest = std::min(nearest, s.dist[i][j]);
        // Keep a mobile but meaningful home guard. Raise it when the enemy
        // owns a nearby staging node, before its next attack is already in
        // flight.
        if (i == 0) {
            reserve = s.turn <= 8 ? std::max(3, p.growth - 1) : 20;
            if (nearest <= 10) reserve = std::max(reserve, 38);
            if (nearest <= 7) reserve = std::max(reserve, 55);
        } else {
            if (nearest <= 7) reserve = std::max(4, p.growth * 2);
            else if (nearest <= 11) reserve = std::max(2, p.growth);
        }
        reserve = std::max(reserve, clamp_nonnegative(requiredGarrison(i)));
        available[i] = std::max(0, p.troops - reserve);
    }

    // Several sources can coordinate an attack if their fleets arrive on the
    // same turn. This prevents small garrisons from becoming useless, while
    // still allowing each source to split its force among multiple missions.
    for (int round = 0; round < n * 12 && answer.size() < 900; ++round) {
        Plan best{-1, 0, 0, -1.0};
        for (int dst = 0; dst < n; ++dst) {
            if (s.nodes[dst].owner == 1) continue;
            bool tried[horizon + 1]{};
            for (int src0 = 0; src0 < n; ++src0) {
                if (available[src0] <= 0 || s.nodes[src0].owner != 1) continue;
                const int eta = s.dist[src0][dst];
                if (eta <= 0 || eta > horizon || tried[eta]) continue;
                tried[eta] = true;
                const Node& target = s.nodes[dst];
                const Forecast f = forecast(dst, eta);
                if (f.owner == 1) continue;
                int enemyEta = 1000;
                int supportDistance = 1000;
                if (target.owner == 0 && s.turn < 65) {
                    for (int ally = 0; ally < n; ++ally)
                        if (s.nodes[ally].owner == 1)
                            supportDistance = std::min(supportDistance, s.dist[ally][dst]);
                    for (int e = 0; e < n; ++e) {
                        if (s.nodes[e].owner != 2 || s.nodes[e].troops <= target.troops) continue;
                        enemyEta = std::min(enemyEta, s.dist[e][dst]);
                    }
                    // An enemy fleet can establish a nearby launch point
                    // before our slower expedition reaches this node.
                    for (const auto& fleet : s.fleets) {
                        if (fleet.owner != 2 || fleet.to < 0 || fleet.to >= n ||
                            fleet.turns_left < 1 || fleet.turns_left > horizon) continue;
                        const Node& landing = s.nodes[fleet.to];
                        bool enemyCanUseLanding = landing.owner == 2;
                        if (landing.owner == 0) {
                            const int arrival = fleet.turns_left;
                            enemyCanUseLanding = incoming[2][fleet.to][arrival] >
                                std::max((long long)landing.troops, incoming[1][fleet.to][arrival]);
                        }
                        if (enemyCanUseLanding) {
                            enemyEta = std::min(enemyEta,
                                fleet.turns_left + s.dist[fleet.to][dst]);
                        }
                    }
                    // Do not abandon the best economic sites just because
                    // the opponent can touch them first. Leave low-yield
                    // isolated sites alone, but contest high-growth nodes.
                    if (target.growth < 4 && enemyEta + 6 < eta) continue;
                    if (target.growth < 5 && enemyEta + 2 < eta && supportDistance > 6) continue;
                }
                long long required_other = std::max(f.sums[0], f.sums[2]);
                if (target.owner == 0 && enemyEta < eta && f.owner == 0) {
                    const long long likely_enemy_garrison =
                        1LL + (long long)target.growth * (eta - enemyEta);
                    required_other = std::max(required_other, likely_enemy_garrison);
                }
                if (f.sums[1] > required_other) continue;
                long long need = required_other + 1 - f.sums[1];
                if (need < 1) need = 1;
                // Use the exact force needed against arrivals already known
                // for this ETA; do not reserve an arbitrary extra attack margin.
                long long pool = 0;
                for (int src = 0; src < n; ++src)
                    if (s.nodes[src].owner == 1 && s.dist[src][dst] == eta)
                        pool += available[src];
                if (pool < need) continue;

                // Treat productive nodes as compounding assets. Capturing a
                // high-growth enemy node also removes its income from them.
                double value = 1.0 + 2.0 * target.growth;
                if (f.owner == 2) value += 5.0 + 1.0 * target.growth;
                // Short routes yield income sooner and are less vulnerable to
                // the opponent reaching the same neutral site first.
                double score = value / (1.0 + 0.55 * eta + 0.050 * (double)need);
                if (f.owner == 2) score *= 0.88;
                if (target.owner == 0 && s.turn < 65) {
                    if (enemyEta <= eta) {
                        const int lead = eta - enemyEta;
                        score *= 0.65 * std::exp(-0.12 * lead);
                    }
                    const int isolation = std::max(0, supportDistance - 6);
                    score /= 1.0 + 0.15 * isolation;
                }
                // Strongly prefer timely neutral expansion early; later, turn
                // the accumulated economy toward the opponent.
                if (f.owner == 0 && s.turn < 70) score *= 1.18;
                if (f.owner == 2 && s.turn > 45) score *= 1.12;
                if (score > best.score)
                    best = {dst, eta, (int)need, score};
            }
        }
        if (best.dst < 0) break;
        int remain = best.need;
        while (remain > 0) {
            int src = -1;
            for (int i = 0; i < n; ++i) {
                if (s.nodes[i].owner != 1 || available[i] <= 0 || s.dist[i][best.dst] != best.eta)
                    continue;
                if (src < 0 || available[i] > available[src]) src = i;
            }
            if (src < 0) break;
            const int amount = std::min(remain, available[src]);
            answer.push_back({src, best.dst, amount});
            available[src] -= amount;
            incoming[1][best.dst][best.eta] += amount;
            remain -= amount;
        }
    }

    // Reinforce threatened nodes early enough for distant support to arrive.
    for (int dst = 0; dst < n; ++dst) {
        if (s.nodes[dst].owner != 1) continue;
        int firstHostile = horizon + 1;
        for (int t = 1; t <= horizon; ++t)
            if (incoming[2][dst][t] > 0) { firstHostile = t; break; }
        if (firstHostile > horizon) continue;

        long long deficit = requiredGarrison(dst) - s.nodes[dst].troops;
        if (deficit <= 0) continue;
        while (deficit > 0) {
            int srcBest = -1, distBest = 1000, forceBest = -1;
            for (int src = 0; src < n; ++src) {
                if (src == dst || s.nodes[src].owner != 1 || available[src] <= 0) continue;
                const int d = s.dist[src][dst];
                if (d > firstHostile) continue;
                if (d < distBest || (d == distBest && available[src] > forceBest)) {
                    srcBest = src;
                    distBest = d;
                    forceBest = available[src];
                }
            }
            if (srcBest < 0) break;
            const int amount = (int)std::min<long long>(available[srcBest], deficit);
            answer.push_back({srcBest, dst, amount});
            available[srcBest] -= amount;
            incoming[1][dst][distBest] += amount;
            deficit -= amount;
        }
    }

    // Concentrate idle surplus from every owned node at a safer forward
    // staging point. This prevents the army from remaining split across the
    // whole map once the nearby neutral sites have been taken.
    if (s.turn > 1 && n > 1) {
        std::vector<int> enemyDistance(n, 1000);
        for (int i = 0; i < n; ++i)
            for (int e = 0; e < n; ++e) if (s.nodes[e].owner == 2)
                enemyDistance[i] = std::min(enemyDistance[i], s.dist[i][e]);

        int rally = -1;
        double rallyScore = -1.0;
        for (int dst = 0; dst < n; ++dst) {
            if (s.nodes[dst].owner != 1 || enemyDistance[dst] < 3) continue;
            const double score = (1.0 + 0.65 * s.nodes[dst].growth) /
                                 (1.0 + 0.10 * enemyDistance[dst]) +
                                 0.001 * s.nodes[dst].troops;
            if (score > rallyScore) { rallyScore = score; rally = dst; }
        }
        if (rally >= 0) {
            for (int src = 0; src < n; ++src) {
                if (src == rally || s.nodes[src].owner != 1 || available[src] < 3 ||
                    enemyDistance[rally] > enemyDistance[src]) continue;
                const int eta = s.dist[src][rally];
                if (eta <= 0 || eta > horizon || forecast(rally, eta).owner != 1) continue;
                const int amount = available[src];
                answer.push_back({src, rally, amount});
                available[src] = 0;
                incoming[1][rally][eta] += amount;
            }
        }
    }

    return answer;
}

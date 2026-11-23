#include "engine.hpp"
#include <algorithm>
#include <array>
#include <cmath>
#include <limits>
#include <vector>

namespace {

std::vector<State> project(const State& s, const std::vector<Order>& orders) {
    std::vector<State> p;
    p.reserve(21);
    p.push_back(s);
    p.push_back(step(s, orders, {}));
    for (int k = 1; k < 20; ++k) p.push_back(step(p.back(), {}, {}));
    return p;
}

int capture_need(const std::vector<State>& p, int target, int arrival) {
    const State& b = p[arrival - 1];
    std::array<int, 3> sum{};
    std::array<bool, 3> used{};
    const Node& n = b.nodes[target];
    sum[n.owner] = n.troops + (n.owner ? n.growth : 0);
    used[n.owner] = true;
    for (const Fleet& f : b.fleets) {
        if (f.to == target && f.turns_left == 1) {
            sum[f.owner] += f.troops;
            used[f.owner] = true;
        }
    }
    int other = 0;
    if (used[0]) other = std::max(other, sum[0]);
    if (used[2]) other = std::max(other, sum[2]);
    return std::max(0, other + 1 - sum[1]);
}

std::vector<int> safe_send(const State& s, const std::vector<State>& p,
                           const std::vector<int>& sent) {
    int n = (int)s.nodes.size();
    std::vector<int> safe(n);
    for (int i = 0; i < n; ++i) {
        if (s.nodes[i].owner != 1) continue;
        safe[i] = s.nodes[i].troops - sent[i];
        for (int k = 1; k <= 20; ++k) {
            const State& b = p[k - 1];
            if (b.nodes[i].owner != 1) {
                bool threatened = false;
                for (const Fleet& f : b.fleets)
                    if (f.owner == 2 && f.to == i && f.turns_left == 1) threatened = true;
                if (threatened) safe[i] = 0;
                continue;
            }
            std::array<int, 3> sum{};
            std::array<bool, 3> used{};
            const Node& node = b.nodes[i];
            sum[1] = node.troops + node.growth;
            used[1] = true;
            for (const Fleet& f : b.fleets) {
                if (f.to == i && f.turns_left == 1) {
                    sum[f.owner] += f.troops;
                    used[f.owner] = true;
                }
            }
            if (!used[2]) continue;
            int other = used[0] ? std::max(sum[0], sum[2]) : sum[2];
            int slack = sum[1] - other;
            if (slack <= 0) safe[i] = 0;
            else safe[i] = std::min(safe[i], std::max(0, slack - 1));
        }
        bool incoming = false;
        for (const Fleet& f : s.fleets)
            if (f.owner == 2 && f.to == i) incoming = true;
        if (!incoming) {
            int reserve = 0;
            for (int e = 0; e < n; ++e) {
                if (s.nodes[e].owner != 2 || s.dist[e][i] > 4) continue;
                reserve = std::max(reserve, s.nodes[e].troops - s.nodes[i].growth * s.dist[e][i] + 1);
            }
            safe[i] = std::min(safe[i], std::max(0, s.nodes[i].troops - sent[i] - reserve));
        }
        safe[i] = std::max(0, safe[i]);
    }
    return safe;
}

} 

std::vector<Order> decide(const State& s) {
    const int n = (int)s.nodes.size();
    std::vector<Order> orders;
    std::vector<int> sent(n, 0);
    std::vector<int> enemy_distance(n, 99);
    for (int j = 0; j < n; ++j)
        for (int i = 0; i < n; ++i)
            if (s.nodes[i].owner == 2) enemy_distance[j] = std::min(enemy_distance[j], s.dist[i][j]);
    std::array<int, 3> total{};
    for (const Node& node : s.nodes) total[node.owner] += node.troops;
    for (const Fleet& f : s.fleets) total[f.owner] += f.troops;
    bool aggressive = total[1] * 5 > total[2] * 6;

    for (int iteration = 0; iteration < 2 * n; ++iteration) {
        std::vector<State> p = project(s, orders);
        std::vector<int> safe = safe_send(s, p, sent);
        double best = 0.0;
        int best_from = -1, best_to = -1, best_need = 0;
        for (int i = 0; i < n; ++i) {
            if (s.nodes[i].owner != 1) continue;
            int available = std::min(s.nodes[i].troops - sent[i], safe[i]);
            if (available <= 0) continue;
            for (int j = 0; j < n; ++j) {
                if (i == j) continue;
                int d = s.dist[i][j];
                int horizon = 201 - s.turn - d;
                if (horizon <= 0 || p[d].nodes[j].owner == 1) continue;
                int need = capture_need(p, j, d);
                bool enemy = p[d].nodes[j].owner == 2;
                bool defense = s.nodes[j].owner == 1;
                if (!defense && !aggressive && s.nodes[j].owner == 0 && enemy_distance[j] <= d)
                    continue;
                if (enemy && !defense) {
                    if (d > 8) continue;
                    int regional = 0;
                    for (int e = 0; e < n; ++e)
                        if (e != j && s.nodes[e].owner == 2 && s.dist[e][j] <= d + 2)
                            regional += s.nodes[e].troops;
                    need += std::max(8, 2 * regional / 3 + 2 * d);
                }
                if (need <= 0) continue;
                int amount = std::min(need, available);
                if (amount < need && (s.nodes[j].owner != 0 || enemy || defense)) continue;
                int h = std::min(horizon, 40);
                double factor = defense ? 2.4 : (enemy ? 2.1 : 1.0);
                double cost = enemy || defense ? 0.12 * need : 0.85 * need;
                double score = factor * s.nodes[j].growth * h - cost;
                if (!enemy && !defense)
                    score -= 4.0 * s.nodes[j].growth * std::max(0, d - enemy_distance[j]);
                score *= (double)amount / need;
                score /= std::pow((double)need + 4.0, 0.75);
                if (score > best) {
                    best = score;
                    best_from = i;
                    best_to = j;
                    best_need = amount;
                }
            }
        }
        if (best_from < 0) break;
        orders.push_back({best_from, best_to, best_need});
        sent[best_from] += best_need;
    }

    if (s.turn < 170) {
        std::vector<State> p = project(s, orders);
        std::vector<int> safe = safe_send(s, p, sent);
        std::vector<int> potential(n, 1000000), objective(n, -1);
        for (int i = 0; i < n; ++i) {
            for (int j = 0; j < n; ++j) {
                if (s.nodes[j].owner == 1 || 201 - s.turn - s.dist[i][j] <= 0) continue;
                int value = 10 * s.dist[i][j] - 3 * s.nodes[j].growth
                          - (s.nodes[j].owner == 2 ? 3 : 0);
                if (value < potential[i]) {
                    potential[i] = value;
                    objective[i] = j;
                }
            }
        }
        for (int i = 0; i < n; ++i) {
            if (s.nodes[i].owner != 1 || objective[i] < 0) continue;
            int available = std::min(s.nodes[i].troops - sent[i], safe[i]);
            if (available <= 0) continue;
            int j = objective[i], best_to = -1, best_value = 1000000;
            for (int k = 0; k < n; ++k) {
                if (k == i || s.nodes[k].owner != 1 || potential[k] >= potential[i]) continue;
                if (s.dist[k][j] >= s.dist[i][j]) continue;
                if (p[s.dist[i][k]].nodes[k].owner != 1) continue;
                int value = 10 * s.dist[k][j] - s.nodes[k].growth;
                if (value < best_value) {
                    best_value = value;
                    best_to = k;
                }
            }
            if (best_to >= 0) {
                orders.push_back({i, best_to, available});
                sent[i] += available;
            }
        }
    }
    return orders;
}

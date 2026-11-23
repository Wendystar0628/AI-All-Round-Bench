#include "engine.hpp"
#include <vector>
#include <algorithm>
#include <cmath>

namespace {

int min_dist_to(const State& s, int v, int owner) {
    int best = 1 << 30;
    for (int i = 0; i < (int)s.nodes.size(); ++i)
        if (s.nodes[i].owner == owner) best = std::min(best, s.dist[i][v]);
    return best;
}

struct Cap { int v; double score; int need; };

// Compute capture list (neutral and enemy) with needs and scores.
void build_caps(const State& s, std::vector<Cap>& neut, std::vector<Cap>& enem) {
    const int n = (int)s.nodes.size();
    std::vector<int> opp;
    for (int i = 0; i < n; ++i) if (s.nodes[i].owner == 2) opp.push_back(i);

    std::vector<long long> in_transit(n, 0), enemy_in(n, 0);
    for (const auto& f : s.fleets) {
        if (f.owner == 1) in_transit[f.to] += f.troops;
        else enemy_in[f.to] += f.troops;
    }
    for (int v = 0; v < n; ++v) {
        if (s.nodes[v].owner == 1) continue;
        int dme = min_dist_to(s, v, 1);
        int dop = opp.empty() ? (1 << 30) : min_dist_to(s, v, 2);
        int my_arr = s.turn + dme - 1;
        int op_arr = s.turn + dop - 1;
        int rem = s.max_turns - my_arr;
        if (rem < 0) rem = 0;
        if (s.nodes[v].owner == 0) {
            if (my_arr >= op_arr) continue;
            long long need = std::max((long long)s.nodes[v].troops, enemy_in[v]) + 1;
            long long rem_need = need - in_transit[v];
            if (rem_need <= 0) continue;
            double score = s.nodes[v].growth * (double)rem / rem_need;
            neut.push_back({v, score, (int)std::min<long long>(rem_need, 1 << 30)});
        } else {
            long long need = (long long)s.nodes[v].troops + (long long)dme * s.nodes[v].growth
                             + enemy_in[v] + 1;
            long long rem_need = need - in_transit[v];
            if (rem_need <= 0) continue;
            double score = s.nodes[v].growth * (double)rem / rem_need;
            enem.push_back({v, score, (int)std::min<long long>(rem_need, 1 << 30)});
        }
    }
    auto cmp = [](const Cap& a, const Cap& b) { return a.score > b.score; };
    std::sort(neut.begin(), neut.end(), cmp);
    std::sort(enem.begin(), enem.end(), cmp);
}

std::vector<Order> plan(const State& s) {
    const int n = (int)s.nodes.size();
    std::vector<int> my, opp;
    for (int i = 0; i < n; ++i) {
        if (s.nodes[i].owner == 1) my.push_back(i);
        else if (s.nodes[i].owner == 2) opp.push_back(i);
    }
    if (my.empty()) return {};

    std::vector<int> de(n, 1 << 30);
    for (int v = 0; v < n; ++v)
        for (int u : opp) de[v] = std::min(de[v], s.dist[u][v]);

    std::vector<int> ft(n, -1);
    for (int u : my) {
        int best = 1 << 30, bestv = -1;
        for (int v : my) {
            if (v == u) continue;
            if (de[v] >= de[u]) continue;
            int c = de[v] + s.dist[u][v];
            if (c < best) { best = c; bestv = v; }
        }
        ft[u] = bestv;
    }

    std::vector<Order> orders;

    // Is this the opening (no node has somewhere forward to send)?
    bool any_forward = false;
    for (int u : my) if (ft[u] >= 0) any_forward = true;

    std::vector<Cap> neut, enem;
    build_caps(s, neut, enem);

    if (!any_forward) {
        // opening: home funds captures directly
        std::vector<int> avail(n, 0);
        for (int u : my) avail[u] = s.nodes[u].troops;
        auto fund = [&](const Cap& c) -> bool {
            int v = c.v;
            std::vector<std::pair<int,int>> pl;
            int left = c.need;
            std::vector<int> tmp = avail;
            while (left > 0) {
                int bestu = -1, bestd = 1 << 30;
                for (int u : my) {
                    if (tmp[u] <= 0) continue;
                    if (s.dist[u][v] < bestd) { bestd = s.dist[u][v]; bestu = u; }
                }
                if (bestu < 0) break;
                int send = std::min(tmp[bestu], left);
                pl.push_back({bestu, send});
                tmp[bestu] -= send;
                left -= send;
            }
            if (left > 0) return false;
            for (auto& p : pl) {
                orders.push_back({p.first, v, p.second});
                avail[p.first] -= p.second;
            }
            return true;
        };
        std::vector<char> done(n, 0);
        for (const auto& c : neut) if (!done[c.v] && fund(c)) done[c.v] = 1;
        for (const auto& c : enem) if (!done[c.v] && fund(c)) { done[c.v] = 1; break; }
        return orders;
    }

    // rear nodes flow to the front
    for (int u : my) {
        if (ft[u] >= 0 && s.nodes[u].troops > 0)
            orders.push_back({u, ft[u], s.nodes[u].troops});
    }

    // front nodes accumulate, then strike when strong enough
    const double MARGIN = 1.0;
    for (int u : my) {
        if (ft[u] >= 0) continue;
        int T = s.nodes[u].troops;
        if (T <= 0) continue;
        // best target by score
        const Cap* best = nullptr;
        for (const auto& c : neut) if (!best || c.score > best->score) best = &c;
        for (const auto& c : enem) if (!best || c.score > best->score) best = &c;
        if (!best) continue;
        if ((long long)T >= (long long)best->need * MARGIN) {
            int send = std::min(T, best->need);
            orders.push_back({u, best->v, send});
        }
    }
    if ((int)orders.size() > 1000) orders.resize(1000);
    return orders;
}

}

std::vector<Order> decide(const State& s) {
    return plan(s);
}


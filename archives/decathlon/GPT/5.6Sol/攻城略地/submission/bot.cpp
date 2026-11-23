#include "engine.hpp"

#include <algorithm>
#include <array>
#include <cmath>
#include <limits>
#include <numeric>
#include <tuple>
#include <vector>

namespace {

int original_home = -1;
int original_foe = -1;
std::vector<int> previous_owner;

struct ExtraFleet {
    int owner;
    int troops;
    int eta;
};

struct Future {
    std::vector<int> owner;
    std::vector<int> troops;
};

// Project one node independently.  Fleets never interact before arrival, so
// node-wise projection is exact as long as no future, unseen orders are made.
Future project_node(const State& s, int v, int horizon,
                    const std::vector<ExtraFleet>& extra = {}, int removed = 0) {
    std::vector<std::array<int, 3>> arrivals(horizon + 1);
    for (auto& a : arrivals) a = {0, 0, 0};
    for (const Fleet& f : s.fleets)
        if (f.to == v && f.turns_left <= horizon)
            arrivals[f.turns_left][f.owner] += f.troops;
    for (const ExtraFleet& f : extra)
        if (f.eta >= 1 && f.eta <= horizon)
            arrivals[f.eta][f.owner] += f.troops;

    Future z;
    z.owner.resize(horizon + 1);
    z.troops.resize(horizon + 1);
    int own = s.nodes[v].owner;
    int army = std::max(0, s.nodes[v].troops - removed);
    z.owner[0] = own;
    z.troops[0] = army;
    for (int t = 1; t <= horizon; ++t) {
        if (own != 0) army += s.nodes[v].growth;
        std::array<int, 3> sum = arrivals[t];
        std::array<bool, 3> part{false, false, false};
        part[own] = true;
        sum[own] += army;
        for (int p = 0; p < 3; ++p)
            if (arrivals[t][p] > 0) part[p] = true;

        std::vector<int> who;
        for (int p = 0; p < 3; ++p)
            if (part[p]) who.push_back(p);
        std::sort(who.begin(), who.end(), [&](int a, int b) {
            if (sum[a] != sum[b]) return sum[a] > sum[b];
            return a < b;
        });
        if (who.size() > 1 && sum[who[0]] == sum[who[1]]) {
            army = 0;
        } else {
            own = who[0];
            army = sum[who[0]] - (who.size() > 1 ? sum[who[1]] : 0);
        }
        z.owner[t] = own;
        z.troops[t] = army;
    }
    return z;
}

bool stays_ours(const Future& f) {
    for (int p : f.owner)
        if (p != 1) return false;
    return true;
}

int safe_dispatch(const State& s, int v, int horizon,
                  const std::vector<ExtraFleet>& extra) {
    if (s.nodes[v].owner != 1) return 0;
    int lo = 0, hi = s.nodes[v].troops;
    while (lo < hi) {
        int mid = (lo + hi + 1) / 2;
        if (stays_ours(project_node(s, v, horizon, extra, mid))) lo = mid;
        else hi = mid - 1;
    }
    return lo;
}

int surprise_reserve(const State& s, int v) {
    if (s.nodes[v].owner != 1) return 0;
    std::vector<int> threats;
    for (int k = 0; k < (int)s.nodes.size(); ++k) if (s.nodes[k].owner == 2) {
        int d = s.dist[k][v];
        Future enemy = project_node(s, k, 6);
        int worst = 0;
        for (int wait = 0; wait <= 6; ++wait) if (enemy.owner[wait] == 2) {
            int need = enemy.troops[wait] - s.nodes[v].growth * (wait + d) + 1;
            worst = std::max(worst, need);
        }
        if (worst > 0) threats.push_back(worst);
    }
    std::sort(threats.begin(), threats.end(), std::greater<int>());
    if (threats.empty()) return 0;
    int reserve = threats[0];
    if (threats.size() >= 2) reserve += threats[1] / 2;
    return std::min(s.nodes[v].troops, reserve);
}

int first_loss(const Future& f) {
    for (int t = 1; t < (int)f.owner.size(); ++t)
        if (f.owner[t] != 1) return t;
    return -1;
}

// Smallest additional army arriving at eta that makes the node ours then.
// Returns a large sentinel when ownership at eta cannot be obtained.
int need_to_own(const State& s, int v, int eta,
                const std::vector<ExtraFleet>& base) {
    if (eta < 1) return 1000000000;
    auto good = [&](int x) {
        std::vector<ExtraFleet> e = base;
        if (x) e.push_back({1, x, eta});
        Future f = project_node(s, v, eta, e);
        return f.owner[eta] == 1;
    };
    if (good(0)) return 0;
    int hi = 1;
    while (hi < 1000000 && !good(hi)) hi *= 2;
    if (hi >= 1000000) return 1000000000;
    int lo = 1;
    while (lo < hi) {
        int mid = (lo + hi) / 2;
        if (good(mid)) hi = mid;
        else lo = mid + 1;
    }
    return lo;
}

std::vector<Order> opening(const State& s) {
    const int n = (int)s.nodes.size();
    int home = -1, foe = -1;
    for (int i = 0; i < n; ++i) {
        if (s.nodes[i].owner == 1) home = i;
        if (s.nodes[i].owner == 2) foe = i;
    }
    if (home < 0 || foe < 0) return {};
    original_home = home;
    original_foe = foe;

    // Leave four soldiers at home, matching the useful balance between early
    // growth and immunity to a very small surprise fleet.
    int budget = std::max(0, s.nodes[home].troops - 4);
    struct Item { int node, cost; double score; };
    std::vector<Item> items;
    for (int i = 0; i < n; ++i) if (s.nodes[i].owner == 0) {
        int dm = s.dist[home][i], de = s.dist[foe][i];
        // A two-turn lead is often not enough: the enemy can see our fleet,
        // wait for combat to reduce the neutral, and steal the result.
        if (de - dm < 4) continue;
        int cost = s.nodes[i].troops + 1;
        double gain = 30.0 * s.nodes[i].growth - cost;
        double score = gain / ((cost + 5.0) * (dm + 5.0));
        if (cost <= budget && gain > 0) items.push_back({i, cost, score});
    }
    std::sort(items.begin(), items.end(), [&](const Item& a, const Item& b) {
        if (std::abs(a.score - b.score) > 1e-12) return a.score > b.score;
        if (s.dist[home][a.node] != s.dist[home][b.node])
            return s.dist[home][a.node] < s.dist[home][b.node];
        return a.node < b.node;
    });
    std::vector<Order> out;
    for (const Item& item : items) if (item.cost <= budget) {
        out.push_back({home, item.node, item.cost});
        budget -= item.cost;
    }
    return out;
}

double target_value(const State& s, int from, int to, int eta, int need,
                    const Future& projected) {
    const Node& q = s.nodes[to];
    int remain = std::max(0, s.max_turns - s.turn - eta + 1);
    int window = std::min(remain, 55);
    int foe_dist = 99;
    for (int i = 0; i < (int)s.nodes.size(); ++i)
        if (s.nodes[i].owner == 2) foe_dist = std::min(foe_dist, s.dist[i][to]);
    double lead = std::clamp((double)foe_dist - eta, -8.0, 10.0);
    double economic;
    if (q.owner == 0) {
        economic = q.growth * (double)window - q.troops * 0.72;
        economic += lead * (2.0 + 0.35 * q.growth);
        if (original_home >= 0 && original_foe >= 0) {
            int territorial_lead = s.dist[original_foe][to] - s.dist[original_home][to];
            // Finish the naturally closer half of the symmetric map before
            // spending armies in the opponent's established production area.
            if (territorial_lead >= 2) economic += 115.0 + 10.0 * territorial_lead;
            else if (territorial_lead <= -2) economic -= 45.0;
        }
    } else {
        economic = q.growth * (double)window * 1.75 + q.troops * 0.22;
        economic += 12.0 + lead * 1.3;
    }
    // If known traffic will take it for us soon, do not duplicate the attack.
    if (projected.owner[eta] == 1) economic -= 10000.0;
    economic -= std::max(0, need - 1) * (q.owner == 0 ? 0.16 : 0.09);
    return economic / (eta + 2.5);
}

} // namespace

std::vector<Order> decide(const State& s) {
    const int n = (int)s.nodes.size();
    if (s.turn == 1) {
        previous_owner.resize(n);
        for (int i = 0; i < n; ++i) previous_owner[i] = s.nodes[i].owner;
        return opening(s);
    }

    std::vector<int> newly_ours;
    if ((int)previous_owner.size() == n) {
        for (int i = 0; i < n; ++i)
            if (previous_owner[i] != 1 && s.nodes[i].owner == 1)
                newly_ours.push_back(i);
    }
    previous_owner.resize(n);
    for (int i = 0; i < n; ++i) previous_owner[i] = s.nodes[i].owner;

    constexpr bool mirror_experiment = true;
    if (mirror_experiment) {
        std::vector<Order> mirrored;
        if (s.turn <= 4) return mirrored;
        struct Wish { int from, to, troops; };
        std::vector<Wish> wishes;
        std::vector<int> wanted(n, 0);
        for (const Fleet& f : s.fleets) if (f.owner == 2 &&
                f.turns_left == s.dist[f.from][f.to] - 1) {
            int from = f.from ^ 1, to = f.to ^ 1;
            if (from < 0 || from >= n || to < 0 || to >= n ||
                s.nodes[from].owner != 1 || from == to) continue;
            wishes.push_back({from, to, f.troops});
            wanted[from] += f.troops;
        }
        std::vector<int> assigned(n, 0), seen(n, 0);
        for (const Wish& w : wishes) {
            ++seen[w.from];
            int send;
            if (seen[w.from] == std::count_if(wishes.begin(), wishes.end(),
                    [&](const Wish& z) { return z.from == w.from; })) {
                send = s.nodes[w.from].troops - assigned[w.from];
            } else {
                send = (int)((long long)s.nodes[w.from].troops * w.troops /
                             std::max(1, wanted[w.from]));
            }
            if (send > 0) {
                mirrored.push_back({w.from, w.to, send});
                assigned[w.from] += send;
            }
        }

        // A newly captured major producer is the one event for which waiting
        // to observe the symmetric order costs a full growth turn.  The
        // strategic opponent immediately makes such a planet its local hub;
        // doing the symmetric operation now keeps both timelines aligned.
        std::vector<int> new_hubs;
        int best_growth = 0;
        for (int i = 0; i < n; ++i) if (s.nodes[i].owner == 1)
            best_growth = std::max(best_growth, s.nodes[i].growth);
        for (int v : newly_ours)
            if (s.nodes[v].growth == best_growth && best_growth >= 4)
                new_hubs.push_back(v);
        if (!new_hubs.empty()) {
            mirrored.clear();
            for (int u = 0; u < n; ++u) if (s.nodes[u].owner == 1 &&
                    std::find(new_hubs.begin(), new_hubs.end(), u) == new_hubs.end() &&
                    s.nodes[u].troops > 0) {
                int to = *std::min_element(new_hubs.begin(), new_hubs.end(),
                    [&](int a, int b) {
                        if (s.dist[u][a] != s.dist[u][b])
                            return s.dist[u][a] < s.dist[u][b];
                        return a < b;
                    });
                mirrored.push_back({u, to, s.nodes[u].troops});
            }
            return mirrored;
        }

        // A freshly captured outpost also acts as a short supply relay when an
        // established planet of at least equal value is only a few turns away.
        for (int v : newly_ours) if (s.nodes[v].troops > 0) {
            int to = -1;
            for (int u = 0; u < n; ++u) if (u != v && s.nodes[u].owner == 1 &&
                    std::find(newly_ours.begin(), newly_ours.end(), u) == newly_ours.end() &&
                    s.nodes[u].growth >= s.nodes[v].growth &&
                    s.dist[v][u] <= 4 &&
                    (to < 0 || s.dist[v][u] < s.dist[v][to] ||
                     (s.dist[v][u] == s.dist[v][to] && u < to))) to = u;
            if (to >= 0) mirrored.push_back({v, to, s.nodes[v].troops});
        }

        return mirrored;
    }

    constexpr int H = 32;
    std::vector<std::vector<ExtraFleet>> extra(n);
    std::vector<Order> out;
    std::vector<char> abandoned(n, 0);

    // Rescue known doomed positions first.  Re-project after every assigned
    // reinforcement because arrivals at different times can change growth.
    for (int rounds = 0; rounds < n * 2; ++rounds) {
        int target = -1, loss = 1000000;
        for (int v = 0; v < n; ++v) if (s.nodes[v].owner == 1 && !abandoned[v]) {
            int t = first_loss(project_node(s, v, H, extra[v]));
            if (t >= 1 && t < loss) { loss = t; target = v; }
        }
        if (target < 0) break;

        int source = -1, amount = 0, best_d = 1000000;
        for (int u = 0; u < n; ++u) if (u != target && s.nodes[u].owner == 1) {
            int d = s.dist[u][target];
            if (d > loss) continue;
            int already = 0;
            for (const Order& o : out) if (o.from == u) already += o.troops;
            int avail = safe_dispatch(s, u, H, extra[u]) - already;
            if (avail <= 0) continue;
            int need = need_to_own(s, target, loss, extra[target]);
            if (need <= 0) break;
            int give = std::min(avail, need + 1);
            if (d < best_d || (d == best_d && give > amount)) {
                source = u; amount = give; best_d = d;
            }
        }
        if (source < 0) {
            abandoned[target] = 1;
            continue;
        }
        out.push_back({source, target, amount});
        extra[target].push_back({1, amount, s.dist[source][target]});
    }

    // An unsalvageable garrison should not die in place.  Move it to the
    // nearest position that is not itself known to be doomed.
    for (int v = 0; v < n; ++v) if (abandoned[v] && s.nodes[v].troops > 0) {
        int to = -1, bd = 1000000;
        for (int u = 0; u < n; ++u) if (u != v && s.nodes[u].owner == 1 && !abandoned[u]) {
            if (s.dist[v][u] < bd) { bd = s.dist[v][u]; to = u; }
        }
        if (to >= 0) {
            out.push_back({v, to, s.nodes[v].troops});
            extra[to].push_back({1, s.nodes[v].troops, s.dist[v][to]});
        }
    }

    std::vector<int> avail(n, 0);
    for (int u = 0; u < n; ++u) if (s.nodes[u].owner == 1) {
        int used = 0;
        for (const Order& o : out) if (o.from == u) used += o.troops;
        int known_safe = safe_dispatch(s, u, H, extra[u]) - used;
        int surprise_safe = s.nodes[u].troops - used - surprise_reserve(s, u);
        avail[u] = std::max(0, std::min(known_safe, surprise_safe));
    }

    struct Planned { int from, troops, eta; };
    struct Mission {
        int target = -1;
        double score = -1e100;
        std::vector<Planned> sends;
    };

    // Repeatedly select the best return-on-investment plan.  The denominator
    // deliberately charges both travel time and every committed soldier; this
    // is what keeps expansion broad and prevents impressive-looking overkill.
    for (int round = 0; round < 16; ++round) {
        Mission best;
        for (int v = 0; v < n; ++v) if (s.nodes[v].owner != 1) {
            std::vector<int> deadlines;
            for (int u = 0; u < n; ++u) if (u != v && avail[u] > 0) {
                int d = s.dist[u][v];
                if (d <= H && s.turn + d <= s.max_turns) deadlines.push_back(d);
            }
            std::sort(deadlines.begin(), deadlines.end());
            deadlines.erase(std::unique(deadlines.begin(), deadlines.end()), deadlines.end());

            for (int deadline : deadlines) {
                std::vector<int> sources;
                for (int u = 0; u < n; ++u)
                    if (u != v && avail[u] > 0 && s.dist[u][v] <= deadline)
                        sources.push_back(u);
                std::sort(sources.begin(), sources.end(), [&](int a, int b) {
                    if (s.dist[a][v] != s.dist[b][v]) return s.dist[a][v] < s.dist[b][v];
                    return avail[a] > avail[b];
                });

                std::vector<ExtraFleet> tmp = extra[v];
                std::vector<Planned> plan;
                int total = 0, max_eta = 0;
                for (int u : sources) {
                    auto good = [&](int x) {
                        std::vector<ExtraFleet> q = tmp;
                        if (x) q.push_back({1, x, s.dist[u][v]});
                        Future f = project_node(s, v, deadline, q);
                        return f.owner[deadline] == 1;
                    };
                    if (good(0)) break;
                    int give = avail[u];
                    if (good(give)) {
                        int lo = 1, hi = give;
                        while (lo < hi) {
                            int mid = (lo + hi) / 2;
                            if (good(mid)) hi = mid; else lo = mid + 1;
                        }
                        give = lo;
                    }
                    tmp.push_back({1, give, s.dist[u][v]});
                    plan.push_back({u, give, s.dist[u][v]});
                    total += give;
                    max_eta = std::max(max_eta, s.dist[u][v]);
                }
                Future after = project_node(s, v, std::min(H, deadline + 4), tmp);
                if (after.owner[deadline] != 1 || plan.empty()) continue;
                bool holds = true;
                for (int t = deadline; t < (int)after.owner.size(); ++t)
                    if (after.owner[t] != 1) { holds = false; break; }
                if (!holds) continue;

                Future before = project_node(s, v, deadline, extra[v]);
                int old_owner = before.owner[deadline];
                int life = std::max(0, std::min(30, s.max_turns - s.turn - deadline + 1));
                double swing = s.nodes[v].growth * life * (old_owner == 2 ? 2.0 : 1.0);
                if (old_owner == 2) swing += 0.35 * before.troops[deadline];
                double benefit = swing - total;
                if (benefit <= 0) continue;
                double score = benefit / ((total + 5.0) * (max_eta + 5.0));
                // A slight home-side tie break makes symmetric races less easy
                // to steal without excluding genuinely profitable contests.
                if (s.nodes[v].owner == 0 && original_home >= 0 && original_foe >= 0)
                    score *= std::clamp(1.0 + 0.025 *
                        (s.dist[original_foe][v] - s.dist[original_home][v]), 0.75, 1.25);
                if (score > best.score) {
                    best.target = v;
                    best.score = score;
                    best.sends = std::move(plan);
                }
            }
        }
        if (best.target < 0) break;
        for (Planned p : best.sends) {
            if (p.troops <= 0 || p.troops > avail[p.from]) continue;
            out.push_back({p.from, best.target, p.troops});
            extra[best.target].push_back({1, p.troops, p.eta});
            avail[p.from] -= p.troops;
        }
    }

    return out;
}

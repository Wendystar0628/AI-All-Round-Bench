#include "engine.hpp"
#include <vector>
#include <algorithm>
#include <cstdio>
#include <ctime>

// Tunable constants (overridable with -D for experiments).
#ifndef P_BETA
#define P_BETA 1.0    // fraction of the strongest nearby enemy garrison kept as defence
#endif
#ifndef P_REACH
#define P_REACH 6     // enemy nodes within this distance count as threats
#endif
#ifndef P_SUM
#define P_SUM 0       // 1: threat = sum of nearby enemy garrisons instead of the largest
#endif
#ifndef P_DEFEND
#define P_DEFEND 1.0    // value multiplier for reinforcing one of our own nodes
#endif
#ifndef P_ENEMYMULT
#define P_ENEMYMULT 1.0 // value multiplier for taking an enemy node
#endif
#ifndef P_TBETA
#define P_TBETA 1.0  // fraction of the threat that a captured target must hold after the attack
#endif
#ifndef P_MAXSRC
#define P_MAXSRC 9    // maximum number of source nodes combined for one target
#endif
#ifndef P_KAPPA
#define P_KAPPA 0.5   // while saving, only targets scoring >= KAPPA * best ideal score are funded
#endif
#ifndef P_WAIT
#define P_WAIT 8      // save only for targets affordable within this many turns of income
#endif
#ifndef P_ANTICIPATE
#define P_ANTICIPATE 0  // 1: predict the opponent's orders (planner run from their side)
#endif
#ifndef P_CONSOLIDATE
#define P_CONSOLIDATE 1  // 1: move spare troops to a hub node after attacks
#endif
#ifndef P_MAXTRANS
#define P_MAXTRANS 15    // consolidation only over this distance
#endif
#ifndef P_LOOKAHEAD
#define P_LOOKAHEAD 1   // 1: choose among candidate turns by short self-play rollouts
#endif
#ifndef P_MAXCAND
#define P_MAXCAND 3     // candidate turns use 0..this many committed attacks
#endif
#ifndef P_HORIZON
#define P_HORIZON 8   // rollout length in turns
#endif
#ifndef P_VINC
#define P_VINC 30      // weight of income lead in the rollout evaluation
#endif
#ifndef P_SAVE
#define P_SAVE 0       // 1: keep stock for a much better target that is not yet affordable
#endif
#ifndef P_SINGLES
#define P_SINGLES 0    // also try playing only the i-th best attack (i < this)
#endif
#ifndef P_PORTFOLIO
#define P_PORTFOLIO 1  // 1: candidates also come from the other defence fractions
#endif
#ifndef P_BETA_LO
#define P_BETA_LO 0.5
#endif
#ifndef P_BETA_HI
#define P_BETA_HI 1.5
#endif
#ifndef P_BUDGET_MS
#define P_BUDGET_MS 20  // stop evaluating candidate turns after this much CPU time in one decision
#endif
#ifndef P_CONTEST
#define P_CONTEST 2.0  // cost per turn that the enemy would reach a neutral target before us
#endif
#ifndef P_VINC_CAP
#define P_VINC_CAP 1  // 1: income weight in the evaluation is capped by the turns left
#endif
#ifndef P_TIME
#define P_TIME 1.0    // weight of travel time in the attack score
#endif

namespace {

struct Arrival { int k, owner, troops; };  // k: settle index relative to now (1 = this turn)

struct Final { int owner; int troops; };

// Simulate a node with growth g from (own, tr) under the given arrivals (sorted by k).
// Mirrors siege_detail::settle for a single node.
Final simulate(int own, int tr, int g, const std::vector<Arrival>& arr) {
    std::size_t idx = 0;
    const int maxk = arr.empty() ? 0 : arr.back().k;
    for (int k = 1; k <= maxk; ++k) {
        if (own != 0) tr += g;
        if (idx >= arr.size() || arr[idx].k != k) continue;
        long long sums[3] = {0, 0, 0};
        bool part[3] = {false, false, false};
        sums[own] += tr; part[own] = true;
        while (idx < arr.size() && arr[idx].k == k) {
            sums[arr[idx].owner] += arr[idx].troops;
            part[arr[idx].owner] = true;
            ++idx;
        }
        int best = -1;
        for (int o = 0; o < 3; ++o)
            if (part[o] && (best < 0 || sums[o] > sums[best])) best = o;
        int sec = -1;
        for (int o = 0; o < 3; ++o)
            if (part[o] && o != best && (sec < 0 || sums[o] > sums[sec])) sec = o;
        const long long top = sums[best];
        const long long second = sec >= 0 ? sums[sec] : 0;
        const bool tie = sec >= 0 && top == second;
        if (!tie) own = best;
        tr = tie ? 0 : (int)(top - second);
    }
    return {own, tr};
}

void insertSorted(std::vector<Arrival>& v, Arrival a) {
    auto it = std::upper_bound(v.begin(), v.end(), a,
                               [](const Arrival& x, const Arrival& y) { return x.k < y.k; });
    v.insert(it, a);
}

}  // namespace

namespace {

// One turn of planning from state s. If `anticipate` is set, first predict the
// opponent's orders by running the same planner from their point of view, and treat
// those orders as fleets that leave now.
std::vector<Order> planTurn(const State& s, bool anticipate, int limitAttacks, double beta,
                            std::vector<std::vector<Order>>* units = nullptr);

}  // namespace

std::vector<Order> decide(const State& s);

namespace {

std::vector<Order> planTurn(const State& s, bool anticipate, int limitAttacks, double beta,
                            std::vector<std::vector<Order>>* units) {
    const int n = (int)s.nodes.size();
    std::vector<std::vector<Arrival>> arr(n);
    for (const auto& f : s.fleets) arr[f.to].push_back({f.turns_left, f.owner, f.troops});
    if (anticipate) {
        const State fs = flip(s);  // opponent's point of view
        for (const Order& o : planTurn(fs, false, -1, P_BETA)) {
            if (o.from < 0 || o.from >= n || o.to < 0 || o.to >= n || o.to == o.from || o.troops <= 0) continue;
            if (s.nodes[o.from].owner != 2) continue;
            arr[o.to].push_back({s.dist[o.from][o.to], 2, o.troops});
        }
    }
    for (auto& v : arr) std::sort(v.begin(), v.end(), [](const Arrival& x, const Arrival& y) { return x.k < y.k; });

    std::vector<int> troops(n), owner(n), growth(n);
    for (int i = 0; i < n; ++i) {
        troops[i] = s.nodes[i].troops;
        owner[i] = s.nodes[i].owner;
        growth[i] = s.nodes[i].growth;
    }

    std::vector<Order> orders;

    // Garrison we want to keep at each node against enemy garrisons nearby.
    std::vector<int> req(n, 0), reqRaw(n, 0);
    for (int x = 0; x < n; ++x) {
        long long m = 0;
        for (int y = 0; y < n; ++y)
            if (y != x && owner[y] == 2 && s.dist[x][y] <= P_REACH) {
#if P_SUM
                m += troops[y];
#else
                m = std::max<long long>(m, troops[y]);
#endif
            }
        req[x] = (int)(beta * m);
        reqRaw[x] = (int)m;
    }

    // Does our node src keep its owner if we take `take` troops out of it now?
    auto holdsAfter = [&](int src, int take) {
        return simulate(1, troops[src] - take, growth[src], arr[src]).owner == 1;
    };
    // Largest amount we may send from src without losing it or going below its requirement.
    auto availOf = [&](int src) {
        if (owner[src] != 1 || troops[src] <= 0) return 0;
        const int cap = std::max(0, troops[src] - req[src]);
        if (cap <= 0) return 0;
        if (holdsAfter(src, cap)) return cap;
        int lo = 0, hi = cap;  // lo holds, hi does not
        while (hi - lo > 1) {
            int mid = (lo + hi) / 2;
            if (holdsAfter(src, mid)) lo = mid; else hi = mid;
        }
        return lo;
    };

    // Best plan for taking/holding node x using the troops in av[] as sources.
    // Returns the score (0 if impossible) and the plan in planOut.
    auto evalTarget = [&](int x, const std::vector<int>& av, std::vector<std::pair<int, int>>& planOut) {
        planOut.clear();
        std::vector<int> srcs;
        for (int i = 0; i < n; ++i)
            if (i != x && owner[i] == 1 && av[i] > 0) srcs.push_back(i);
        std::sort(srcs.begin(), srcs.end(), [&](int a, int b) { return s.dist[a][x] < s.dist[b][x]; });

        auto feasible = [&](const std::vector<std::pair<int, int>>& plan) {
            std::vector<Arrival> a = arr[x];
            for (auto& [src, amt] : plan)
                if (amt > 0) insertSorted(a, {s.dist[src][x], 1, amt});
            Final f = simulate(owner[x], troops[x], growth[x], a);
            return f.owner == 1 && f.troops >= (int)(P_TBETA * reqRaw[x]);
        };

        std::vector<std::pair<int, int>> chosen;
        bool ok = false;
        for (int src : srcs) {
            chosen.push_back({src, av[src]});
            if (feasible(chosen)) { ok = true; break; }
            if ((int)chosen.size() >= P_MAXSRC) break;
        }
        if (!ok) return 0.0;

        // Minimise amounts: each source sends the least that still works.
        for (int j = (int)chosen.size() - 1; j >= 0; --j) {
            auto zero = chosen;
            zero[j].second = 0;
            if (feasible(zero)) { chosen[j].second = 0; continue; }
            int lo = 0, hi = chosen[j].second;
            while (hi - lo > 1) {
                int mid = (lo + hi) / 2;
                auto p = chosen;
                p[j].second = mid;
                if (feasible(p)) hi = mid; else lo = mid;
            }
            chosen[j].second = hi;
        }

        int sumF = 0, dmax = 0;
        for (auto& [src, amt] : chosen) {
            if (amt <= 0) continue;
            planOut.push_back({src, amt});
            sumF += amt;
            dmax = std::max(dmax, s.dist[src][x]);
        }
        if (planOut.empty()) return 0.0;

        const bool enemy = owner[x] == 2;
        const double gain = growth[x] * (enemy ? P_ENEMYMULT : (owner[x] == 1 ? P_DEFEND : 1.0));
        // A neutral node the enemy can reach sooner than we can is a race we tend to lose:
        // charge the difference in arrival time.
        double contest = 0.0;
        if (owner[x] == 0) {
            int dEnemy = 1 << 30;
            for (int y = 0; y < n; ++y)
                if (y != x && owner[y] == 2) dEnemy = std::min(dEnemy, s.dist[y][x]);
            if (dEnemy < (1 << 30)) contest = P_CONTEST * std::max(0, dmax - dEnemy);
        }
        const double cost = sumF + P_TIME * dmax + contest + 2.0;
        return gain / cost;
    };

    // Saving: value of the best target if we had all our troops available.
    double topIdeal = 0.0;
#if P_SAVE
    int topIdealF = 0;
    {
        std::vector<int> full(n, 0);
        int stock = 0, income = 0;
        for (int i = 0; i < n; ++i)
            if (owner[i] == 1) { full[i] = troops[i]; stock += troops[i]; income += growth[i]; }
        std::vector<std::pair<int, int>> p;
        for (int x = 0; x < n; ++x) {
            if (owner[x] == 1) continue;
            const double sc = evalTarget(x, full, p);
            if (sc > topIdeal) {
                topIdeal = sc;
                topIdealF = 0;
                for (auto& [src, amt] : p) topIdealF += amt;
            }
        }
        // Save only if the top target can be paid for within P_WAIT turns of income.
        int stockNow = stock;
        (void)income;
#ifdef BOT_DEBUG
        if (s.turn == BOT_DEBUG) {
            std::fprintf(stderr, "ideal: stock=%d income=%d topIdeal=%.4f topF=%d\n", stock, income, topIdeal, topIdealF);
            for (int x = 0; x < n; ++x) {
                if (owner[x] == 1) continue;
                std::vector<std::pair<int, int>> p;
                const double sc = evalTarget(x, full, p);
                int F = 0;
                for (auto& [src, amt] : p) F += amt;
                std::fprintf(stderr, "  ideal target %d owner=%d troops=%d growth=%d req=%d score=%.4f F=%d\n",
                             x, owner[x], troops[x], growth[x], req[x], sc, F);
            }
        }
#endif
        if (topIdeal > 0 && topIdealF > stockNow + P_WAIT * std::max(1, income)) topIdeal = 0.0;
    }
#endif

    // Phase 1: greedy captures and holds.
    int commits = 0;
    for (int iter = 0; iter < 60; ++iter) {
        if (limitAttacks >= 0 && commits >= limitAttacks) break;
        std::vector<int> avail(n, 0);
        for (int i = 0; i < n; ++i) avail[i] = availOf(i);

        double bestScore = 0.0;
        std::vector<std::pair<int, int>> bestPlan;
        int bestTarget = -1;

        for (int x = 0; x < n; ++x) {
            Final cur = simulate(owner[x], troops[x], growth[x], arr[x]);
            if (cur.owner == 1 && cur.troops >= req[x]) continue;
            std::vector<std::pair<int, int>> plan;
            const double score = evalTarget(x, avail, plan);
            if (score <= 0.0) continue;
            // While saving for a much better target, do not spend on weaker non-defensive ones.
            if (owner[x] != 1 && topIdeal > 0.0 && score < P_KAPPA * topIdeal) continue;
            if (score > bestScore) {
                bestScore = score;
                bestPlan = plan;
                bestTarget = x;
            }
        }

#ifdef BOT_DEBUG
        if (s.turn == BOT_DEBUG) {
            std::fprintf(stderr, "iter %d: best target=%d score=%.4f\n", iter, bestTarget, bestScore);
            for (int i = 0; i < n; ++i)
                if (owner[i] == 1) std::fprintf(stderr, "  own node %d troops=%d avail=%d req=%d\n", i, troops[i], avail[i], req[i]);
            for (int x = 0; x < n; ++x)
                if (owner[x] == 2) std::fprintf(stderr, "  enemy node %d troops=%d growth=%d req=%d\n", x, troops[x], growth[x], req[x]);
        }
#endif
        if (bestTarget < 0) break;
        ++commits;
        if (units) units->emplace_back();
        for (auto& [src, amt] : bestPlan) {
            orders.push_back({src, bestTarget, amt});
            if (units) units->back().push_back({src, bestTarget, amt});
            troops[src] -= amt;
            insertSorted(arr[bestTarget], {s.dist[src][bestTarget], 1, amt});
        }
    }

#if P_CONSOLIDATE
    // Phase 2: move spare troops to a hub that is central to the enemy.
    int hub = -1;
    {
        double bestAvg = 1e18;
        for (int h = 0; h < n; ++h) {
            if (owner[h] != 1) continue;
            double num = 0, den = 0;
            for (int y = 0; y < n; ++y)
                if (owner[y] == 2) { num += (double)s.dist[h][y] * (growth[y] + 1); den += growth[y] + 1; }
            const double avg = den > 0 ? num / den : 0.0;
            if (hub < 0 || avg < bestAvg - 1e-9 || (avg < bestAvg + 1e-9 && troops[h] > troops[hub])) {
                hub = h;
                bestAvg = avg;
            }
        }
    }
    if (hub >= 0) {
        for (int i = 0; i < n; ++i) {
            if (i == hub || owner[i] != 1 || s.dist[i][hub] > P_MAXTRANS) continue;
            const int amt = availOf(i);
            if (amt <= 0) continue;
            orders.push_back({i, hub, amt});
            troops[i] -= amt;
        }
    }
#endif
    return orders;
}

}  // namespace

namespace {

// Evaluation of a state from our point of view: income lead plus total troops lead.
double evaluateState(const State& s) {
    const int r = result(s);
    if (r == 1) return 1e9;
    if (r == 2) return -1e9;
    if (r == 3) return 0.0;
    long long inc1 = 0, inc2 = 0, tot1 = 0, tot2 = 0;
    for (const auto& p : s.nodes) {
        if (p.owner == 1) { inc1 += p.growth; tot1 += p.troops; }
        else if (p.owner == 2) { inc2 += p.growth; tot2 += p.troops; }
    }
    for (const auto& f : s.fleets) {
        if (f.owner == 1) tot1 += f.troops; else tot2 += f.troops;
    }
    // Income only counts while the game is still running: at most the turns left to play.
    const int leftTurns = std::max(0, s.max_turns - s.turn + 1);
#if P_VINC_CAP
    const int w = std::min((int)P_VINC, leftTurns);
#else
    const int w = (int)P_VINC;
#endif
    return (double)w * (double)(inc1 - inc2) + (double)(tot1 - tot2);
}

// Apply our orders now, then play both sides with the base planner for a short horizon.
// Returns false (and no value) if the CPU deadline passes first.
bool rollout(const State& s, const std::vector<Order>& mine, std::clock_t deadline, double& valueOut) {
    if (std::clock() > deadline) return false;
    State t = step(s, mine, planTurn(flip(s), false, -1, P_BETA));
    for (int j = 1; j < P_HORIZON && result(t) == 0; ++j) {
        if (std::clock() > deadline) return false;
        auto a = planTurn(t, false, -1, P_BETA);
        auto b = planTurn(flip(t), false, -1, P_BETA);
        t = step(t, a, b);
    }
    valueOut = evaluateState(t);
    return true;
}

bool sameOrders(const std::vector<Order>& a, const std::vector<Order>& b) {
    if (a.size() != b.size()) return false;
    for (std::size_t i = 0; i < a.size(); ++i)
        if (a[i].from != b[i].from || a[i].to != b[i].to || a[i].troops != b[i].troops) return false;
    return true;
}

}  // namespace

std::vector<Order> decide(const State& s) {
#if P_LOOKAHEAD
    // Candidate turns: the planner with several defence fractions, each stopped after
    // k committed attacks (k = 0..P_MAXCAND), plus the unlimited plan. Each candidate is
    // scored by a short self-play rollout; the best completed one is played. The CPU
    // deadline is checked inside every rollout step, so one decision stays bounded.
    const std::clock_t deadline = std::clock() + (std::clock_t)(P_BUDGET_MS * CLOCKS_PER_SEC / 1000);
    std::vector<std::vector<Order>> seen;
    std::vector<Order> best;
    double bestV = 0.0;
    bool haveBest = false, timeUp = false;
    auto consider = [&](const std::vector<Order>& c) {
        if (timeUp) return;
        for (const auto& e : seen) if (sameOrders(e, c)) return;
        seen.push_back(c);
        double v = 0.0;
        if (!rollout(s, c, deadline, v)) { timeUp = true; return; }
        if (!haveBest || v > bestV) { haveBest = true; bestV = v; best = c; }
    };
    const double betas[] = {P_BETA, P_BETA_LO, P_BETA_HI};
    const int nb = P_PORTFOLIO ? 3 : 1;
    for (int b = 0; b < nb && !timeUp; ++b) {
        for (int k = 0; k <= P_MAXCAND && !timeUp; ++k) consider(planTurn(s, P_ANTICIPATE, k, betas[b]));
        if (timeUp) break;
        std::vector<std::vector<Order>> units;
        const std::vector<Order> full = planTurn(s, P_ANTICIPATE, -1, betas[b], &units);
        consider(full);
        if (P_SINGLES > 0) {
            // Consolidation orders are the tail of the full plan after the attack units.
            std::size_t nu = 0;
            for (const auto& u : units) nu += u.size();
            const std::vector<Order> tail(full.begin() + (std::ptrdiff_t)nu, full.end());
            for (int i = 0; i < (int)units.size() && i < P_SINGLES && !timeUp; ++i) {
                std::vector<Order> c = units[i];
                c.insert(c.end(), tail.begin(), tail.end());
                consider(c);
            }
        }
    }
    if (!haveBest) return planTurn(s, P_ANTICIPATE, 0, P_BETA);  // out of time: cheap fallback
    return best;
#else
    return planTurn(s, P_ANTICIPATE, -1, P_BETA);
#endif
}

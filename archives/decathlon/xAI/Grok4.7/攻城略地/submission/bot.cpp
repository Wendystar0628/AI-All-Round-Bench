#include "engine.hpp"

#include <algorithm>
#include <chrono>
#include <cstring>
#include <vector>

namespace {

constexpr int MAXN = 24;
constexpr int MAXF = 1024;
constexpr int HMAX = 205;
constexpr int MAXO = 160;

struct O {
    int from, to, troops;
};
struct F {
    int owner, troops, to, left;
};
struct Sim {
    int turn, max_turns, n;
    int owner[MAXN];
    int troops[MAXN];
    int nf;
    F fl[MAXF];
};
struct Params {
    int guard;
    double min_eff_enemy;
    double min_eff_neutral;
    bool repos;
};

int G[MAXN];
int D[MAXN][MAXN];

int ARR[MAXN][HMAX][3];
int LAST[MAXN];
int Hcur;
bool ANY[MAXN];

struct CRes {
    int owner, troops, opposing;
};

CRes combat(int o, int tr, int f0, int f1, int f2) {
    int sum[3] = {f0, f1, f2};
    bool part[3] = {f0 > 0, f1 > 0, f2 > 0};
    sum[o] += tr;
    part[o] = true;
    int mx = -1, cnt = 0, win = o;
    for (int k = 0; k < 3; ++k) if (part[k]) {
        if (sum[k] > mx) {
            mx = sum[k];
            cnt = 1;
            win = k;
        } else if (sum[k] == mx) {
            ++cnt;
        }
    }
    CRes r{};
    if (cnt >= 2) {
        r.owner = o;
        r.troops = 0;
        r.opposing = mx;
        return r;
    }
    int second = 0;
    for (int k = 0; k < 3; ++k) if (part[k] && k != win) second = std::max(second, sum[k]);
    r.owner = win;
    r.troops = mx - second;
    r.opposing = second;
    return r;
}

void build_arr(const Sim& s) {
    Hcur = s.max_turns - s.turn + 1;
    if (Hcur < 1) Hcur = 1;
    if (Hcur >= HMAX) Hcur = HMAX - 1;
    std::memset(ARR, 0, sizeof(ARR));
    std::memset(LAST, 0, sizeof(LAST));
    std::memset(ANY, 0, sizeof(ANY));
    for (int i = 0; i < s.nf; ++i) {
        const F& f = s.fl[i];
        if (f.left < 1 || f.left > Hcur) continue;
        if (f.to < 0 || f.to >= s.n) continue;
        if (s.turn + f.left - 1 > s.max_turns) continue;
        ARR[f.to][f.left][f.owner] += f.troops;
        ANY[f.to] = true;
        LAST[f.to] = std::max(LAST[f.to], f.left);
    }
}

struct Run {
    bool ok;
    int opposing;
    int post_troops;
    int pre_owner;
};

// own_from == 0: must remain owner 1 after every settlement.
// own_from > 0: must be owner 1 from that settlement through the last relevant one.
Run run_node(const Sim& s, int node, int init_tr, int extra_t, int extra_x, int own_from) {
    int o = s.owner[node];
    int tr = init_tr;
    Run r{true, 0, tr, o};
    int limit = LAST[node];
    if (extra_t > limit) limit = extra_t;
    if (own_from > limit) limit = own_from;
    if (limit < 1) limit = 1;
    if (limit > Hcur) limit = Hcur;
    bool checked = false;
    for (int t = 1; t <= limit; ++t) {
        if (s.turn + t - 1 > s.max_turns) break;
        if (o) tr += G[node];
        int ex = (t == extra_t ? extra_x : 0);
        int a0 = ARR[node][t][0], a1 = ARR[node][t][1], a2 = ARR[node][t][2];
        if (a0 || a1 || a2 || ex) {
            if (t == extra_t) r.pre_owner = o;
            CRes c = combat(o, tr, a0, a1 + ex, a2);
            if (t == extra_t) {
                r.opposing = c.opposing;
                r.post_troops = c.troops;
            }
            o = c.owner;
            tr = c.troops;
        } else if (t == extra_t) {
            r.pre_owner = o;
            r.opposing = 0;
            r.post_troops = tr;
        }
        bool care = (own_from == 0) || (t >= own_from);
        if (care) {
            checked = true;
            if (o != 1) r.ok = false;
        }
    }
    if (own_from > 0 && !checked) r.ok = false;
    if (own_from == 0 && s.owner[node] != 1) r.ok = false;
    return r;
}

int min_x_capture(const Sim& s, int node, int d, Run* detail) {
    auto ok = [&](int x) {
        Run r = run_node(s, node, s.troops[node], d, x, d);
        if (detail && x >= 0 && r.ok) *detail = r;
        return r.ok;
    };
    if (ok(0)) {
        if (detail) *detail = run_node(s, node, s.troops[node], d, 0, d);
        return 0;
    }
    int hi = s.troops[node] + G[node] * (d + 2) + 3;
    for (int t = 1; t <= LAST[node] && t <= Hcur; ++t)
        hi += ARR[node][t][0] + ARR[node][t][1] + ARR[node][t][2];
    if (hi < 1) hi = 1;
    if (hi > 200000) hi = 200000;
    if (!ok(hi)) return -1;
    int lo = 0;
    while (lo < hi) {
        int mid = (lo + hi) >> 1;
        if (ok(mid)) hi = mid;
        else lo = mid + 1;
    }
    if (detail) *detail = run_node(s, node, s.troops[node], d, lo, d);
    return lo;
}

int min_keep_troops(const Sim& s, int node) {
    auto holds = [&](int init) {
        return run_node(s, node, init, -1, 0, 0).ok;
    };
    if (!holds(s.troops[node])) return -1;
    int lo = 0, hi = s.troops[node];
    while (lo < hi) {
        int mid = (lo + hi) >> 1;
        if (holds(mid)) hi = mid;
        else lo = mid + 1;
    }
    return lo;
}

int enemy_earliest(const Sim& s, int node) {
    if (s.owner[node] != 0) return 999;
    int cost = s.troops[node] + 1;
    int bucket[HMAX];
    int maxd = 0;
    std::memset(bucket, 0, sizeof(int) * (Hcur + 1));
    for (int e = 0; e < s.n; ++e) if (s.owner[e] == 2 && s.troops[e] > 0) {
        int de = D[e][node];
        if (de >= 1 && de <= Hcur) {
            bucket[de] += s.troops[e];
            maxd = std::max(maxd, de);
        }
    }
    for (int t = 1; t <= maxd; ++t) if (bucket[t] >= cost) return t;
    return 999;
}

int nearest_enemy(const Sim& s, int node) {
    int best = 999;
    for (int e = 0; e < s.n; ++e) if (s.owner[e] == 2) best = std::min(best, D[e][node]);
    return best;
}

struct Item {
    int tgt, d, ships, swing;
    double eff;
};

void emit(O* out, int& n, int from, int to, int troops) {
    if (troops <= 0 || from == to || n >= MAXO) return;
    for (int i = 0; i < n; ++i) if (out[i].from == from && out[i].to == to) {
        out[i].troops += troops;
        return;
    }
    out[n++] = {from, to, troops};
}

void heuristic(const Sim& s, const Params& p, O* out, int& nout) {
    nout = 0;
    if (s.n <= 0 || s.turn > s.max_turns) return;
    build_arr(s);

    int budget[MAXN];
    int keep[MAXN];
    bool threatened[MAXN];
    int loss_t[MAXN];
    std::memset(budget, 0, sizeof(int) * s.n);
    std::memset(keep, 0, sizeof(int) * s.n);
    std::memset(threatened, 0, sizeof(bool) * s.n);
    std::memset(loss_t, 0, sizeof(int) * s.n);

    int anchor = -1, anchor_g = -1, anchor_d = 999;
    for (int i = 0; i < s.n; ++i) if (s.owner[i] == 2) {
        int md = 999;
        for (int j = 0; j < s.n; ++j) if (s.owner[j] == 1) md = std::min(md, D[j][i]);
        if (G[i] > anchor_g || (G[i] == anchor_g && md < anchor_d)) {
            anchor = i;
            anchor_g = G[i];
            anchor_d = md;
        }
    }

    for (int i = 0; i < s.n; ++i) if (s.owner[i] == 1) {
        bool enemy_hit = false;
        for (int t = 1; t <= LAST[i] && t <= Hcur; ++t) if (ARR[i][t][2] > 0) enemy_hit = true;
        if (!enemy_hit) {
            int mk = 0;
            int ed = nearest_enemy(s, i);
            if (ed < 999 && p.guard > 0) {
                int gneed = p.guard - ed * G[i];
                if (gneed > 0) mk = gneed;
            }
            if (mk > s.troops[i]) mk = s.troops[i];
            keep[i] = mk;
            budget[i] = s.troops[i] - mk;
            continue;
        }
        int mk = min_keep_troops(s, i);
        if (mk >= 0) {
            int ed = nearest_enemy(s, i);
            if (ed < 999 && p.guard > 0) {
                int gneed = p.guard - ed * G[i];
                if (gneed > mk) mk = gneed;
            }
            if (mk > s.troops[i]) mk = s.troops[i];
            keep[i] = mk;
            budget[i] = s.troops[i] - mk;
        } else {
            threatened[i] = true;
            loss_t[i] = 1;
            int o = s.owner[i], tr = s.troops[i];
            int limit = std::max(1, std::min(Hcur, LAST[i]));
            for (int t = 1; t <= limit; ++t) {
                if (s.turn + t - 1 > s.max_turns) break;
                if (o) tr += G[i];
                int a0 = ARR[i][t][0], a1 = ARR[i][t][1], a2 = ARR[i][t][2];
                if (a0 || a1 || a2) {
                    CRes c = combat(o, tr, a0, a1, a2);
                    o = c.owner;
                    tr = c.troops;
                    if (o != 1) {
                        loss_t[i] = t;
                        break;
                    }
                }
            }
            budget[i] = s.troops[i];
            keep[i] = 0;
        }
    }

    int order_idx[MAXN], nt = 0;
    for (int i = 0; i < s.n; ++i) if (threatened[i]) order_idx[nt++] = i;
    std::sort(order_idx, order_idx + nt, [&](int a, int b) {
        return G[a] > G[b];
    });

    bool saved[MAXN];
    std::memset(saved, 0, sizeof(bool) * s.n);
    for (int k = 0; k < nt; ++k) {
        int node = order_idx[k];
        int T = loss_t[node];
        if (T < 1) continue;
        Run det{};
        int X = min_x_capture(s, node, T, &det);
        // min_x_capture requires owning from T onward, but the node may already
        // be ours and the helper allows a later recapture. Require a full hold.
        auto full_hold = [&](int x) {
            return run_node(s, node, s.troops[node], T, x, 0).ok;
        };
        if (X < 0 || !full_hold(std::max(X, 0))) {
            int hi = s.troops[node] + G[node] * (T + 2) + 3;
            for (int t = 1; t <= LAST[node] && t <= Hcur; ++t)
                hi += ARR[node][t][0] + ARR[node][t][1] + ARR[node][t][2];
            if (hi < 1) hi = 1;
            if (hi > 200000) hi = 200000;
            if (!full_hold(hi)) continue;
            int lo = 0;
            while (lo < hi) {
                int mid = (lo + hi) >> 1;
                if (full_hold(mid)) hi = mid;
                else lo = mid + 1;
            }
            X = lo;
        } else if (!full_hold(X)) {
            continue;
        }
        if (X <= 0) {
            saved[node] = true;
            budget[node] = 0;
            keep[node] = s.troops[node];
            continue;
        }
        int growths = std::max(0, (s.max_turns + 1) - (s.turn + T));
        double swing = 2.0 * G[node] * growths + 8.0 * G[node];
        if (swing / X < 0.15 && X > p.guard) continue;

        int best_d = -1;
        int best_pool = -1;
        int srcs[MAXN];
        int ns = 0;
        for (int dtry = T; dtry >= 1; --dtry) {
            int pool = 0, cnt = 0;
            int tmp[MAXN];
            for (int i = 0; i < s.n; ++i) {
                if (s.owner[i] != 1 || i == node) continue;
                if (D[i][node] != dtry || budget[i] <= 0) continue;
                pool += budget[i];
                tmp[cnt++] = i;
            }
            if (pool >= X) {
                best_d = dtry;
                best_pool = pool;
                ns = cnt;
                for (int i = 0; i < cnt; ++i) srcs[i] = tmp[i];
                break;
            }
        }
        if (best_d < 0) continue;
        (void)best_pool;
        std::sort(srcs, srcs + ns, [&](int a, int b) {
            int da = anchor < 0 ? 0 : D[a][anchor];
            int db = anchor < 0 ? 0 : D[b][anchor];
            if (da != db) return da > db;
            return budget[a] > budget[b];
        });
        if (budget[node] != s.troops[node]) continue;
        int need = X;
        bool send_now = (best_d == T);
        for (int i = 0; i < ns && need > 0; ++i) {
            int give = std::min(budget[srcs[i]], need);
            budget[srcs[i]] -= give;
            need -= give;
            if (send_now && give > 0) emit(out, nout, srcs[i], node, give);
        }
        if (need > 0) continue;
        budget[node] = 0;
        keep[node] = s.troops[node];
        saved[node] = true;
    }

    Item items[MAXN * 24];
    int nitems = 0;
    int max_t = s.max_turns - s.turn + 1;
    for (int tgt = 0; tgt < s.n; ++tgt) {
        if (threatened[tgt] || s.owner[tgt] == 1) continue;
        int ds[MAXN];
        int nd = 0;
        bool seen[32] = {};
        for (int i = 0; i < s.n; ++i) if (s.owner[i] == 1 && budget[i] > 0) {
            int d = D[i][tgt];
            if (d < 1 || d > max_t || d >= 32 || seen[d]) continue;
            seen[d] = true;
            ds[nd++] = d;
        }
        int ed = 999;
        if (s.owner[tgt] == 0 && !ANY[tgt]) ed = enemy_earliest(s, tgt);
        for (int di = 0; di < nd; ++di) {
            int d = ds[di];
            if (s.owner[tgt] == 0 && !ANY[tgt]) {
                if (ed < d && s.turn == 1) continue;
                if (ed == d && s.turn <= 2) continue;
            }
            int ships, swing, pre_owner, opposing;
            if (!ANY[tgt]) {
                pre_owner = s.owner[tgt];
                if (pre_owner == 1) continue;
                if (pre_owner == 0) {
                    opposing = s.troops[tgt];
                    ships = opposing + 1;
                } else {
                    opposing = s.troops[tgt] + d * G[tgt];
                    ships = opposing + 1;
                }
            } else {
                Run det{};
                ships = min_x_capture(s, tgt, d, &det);
                if (ships < 0) continue;
                pre_owner = det.pre_owner;
                opposing = det.opposing;
                if (ships == 0) continue;
            }
            if (ships <= 0) continue;
            // A competent defender, after seeing this fleet, can throw every stack
            // that still reaches the target in time. Those troops are not yet in the air.
            if (s.owner[tgt] == 2 || pre_owner == 2) {
                int mobile = 0;
                for (int e = 0; e < s.n; ++e) if (s.owner[e] == 2 && e != tgt) {
                    int de = D[e][tgt];
                    if (de >= 1 && de <= d - 1) {
                        int slack = d - 1 - de;
                        mobile += s.troops[e] + slack * G[e];
                    }
                }
                ships += mobile;
            }
            int growths = std::max(0, (s.max_turns + 1) - (s.turn + d));
            if (pre_owner == 0) swing = G[tgt] * growths - std::min(opposing, ships);
            else swing = 2 * G[tgt] * growths;
            if (swing <= 0) continue;
            double eff = (double)swing / (double)ships;
            if (pre_owner == 0) {
                if (eff < p.min_eff_neutral) continue;
            } else {
                if (eff < p.min_eff_enemy) continue;
            }
            if (nitems < MAXN * 24) items[nitems++] = {tgt, d, ships, swing, eff};
        }
    }

    std::sort(items, items + nitems, [](const Item& a, const Item& b) {
        if (a.eff != b.eff) return a.eff > b.eff;
        if (a.swing != b.swing) return a.swing > b.swing;
        return a.ships < b.ships;
    });

    bool taken[MAXN];
    std::memset(taken, 0, sizeof(bool) * s.n);

    auto fund = [&](const Item& it) -> bool {
        if (taken[it.tgt]) return false;
        int srcs[MAXN], ns = 0, pool = 0;
        for (int i = 0; i < s.n; ++i) if (s.owner[i] == 1 && D[i][it.tgt] == it.d && budget[i] > 0) {
            srcs[ns++] = i;
            pool += budget[i];
        }
        if (pool < it.ships) return false;
        std::sort(srcs, srcs + ns, [&](int a, int b) { return budget[a] > budget[b]; });
        int need = it.ships;
        for (int i = 0; i < ns && need > 0; ++i) {
            int give = std::min(budget[srcs[i]], need);
            if (give <= 0) continue;
            budget[srcs[i]] -= give;
            need -= give;
            emit(out, nout, srcs[i], it.tgt, give);
        }
        taken[it.tgt] = true;
        return need == 0;
    };

    int total_b = 0, main_src = -1, main_b = 0;
    for (int i = 0; i < s.n; ++i) {
        total_b += budget[i];
        if (budget[i] > main_b) {
            main_b = budget[i];
            main_src = i;
        }
    }
    bool did_dp = false;
    if (main_src >= 0 && main_b == total_b && main_b > 0 && main_b <= 500 && nitems > 0 && nitems <= 22) {
        Item own[24];
        int m = 0;
        for (int i = 0; i < nitems && m < 22; ++i) {
            if (D[main_src][items[i].tgt] != items[i].d) continue;
            if (items[i].ships > main_b) continue;
            bool dup = false;
            for (int j = 0; j < m; ++j) if (own[j].tgt == items[i].tgt) {
                dup = true;
                if (items[i].swing > own[j].swing) own[j] = items[i];
            }
            if (!dup) own[m++] = items[i];
        }
        if (m > 0) {
            static int dp[23][501];
            static unsigned char take[23][501];
            int cap = main_b;
            for (int c = 0; c <= cap; ++c) {
                dp[0][c] = 0;
                take[0][c] = 0;
            }
            for (int i = 0; i < m; ++i) {
                for (int c = 0; c <= cap; ++c) {
                    dp[i + 1][c] = dp[i][c];
                    take[i + 1][c] = 0;
                    int cost = own[i].ships;
                    if (c >= cost && dp[i][c - cost] + own[i].swing > dp[i + 1][c]) {
                        dp[i + 1][c] = dp[i][c - cost] + own[i].swing;
                        take[i + 1][c] = 1;
                    }
                }
            }
            int bestc = 0;
            for (int c = 1; c <= cap; ++c) if (dp[m][c] > dp[m][bestc]) bestc = c;
            int chosen[24], nc = 0;
            for (int i = m; i >= 1; --i) {
                if (take[i][bestc]) {
                    chosen[nc++] = i - 1;
                    bestc -= own[i - 1].ships;
                }
            }
            for (int i = nc - 1; i >= 0; --i) fund(own[chosen[i]]);
            did_dp = true;
        }
    }
    if (!did_dp) {
        for (int i = 0; i < nitems; ++i) fund(items[i]);
    } else {
        for (int i = 0; i < nitems; ++i) if (!taken[items[i].tgt]) fund(items[i]);
    }

    if (p.repos) {
        auto send_toward = [&](int tgt, int need) {
            int srcs[MAXN], ns = 0;
            for (int i = 0; i < s.n; ++i) if (budget[i] > 0 && i != tgt) srcs[ns++] = i;
            std::sort(srcs, srcs + ns, [&](int a, int b) {
                if (D[a][tgt] != D[b][tgt]) return D[a][tgt] < D[b][tgt];
                return budget[a] > budget[b];
            });
            for (int k = 0; k < ns && need > 0; ++k) {
                int give = std::min(budget[srcs[k]], need);
                if (give <= 0) continue;
                emit(out, nout, srcs[k], tgt, give);
                budget[srcs[k]] -= give;
                need -= give;
            }
        };
        for (int iter = 0; iter < 3; ++iter) {
            int total = 0;
            for (int i = 0; i < s.n; ++i) total += budget[i];
            if (total <= 0) break;
            int bt = -1, bships = 0, beta = 0;
            double bscore = 0;
            for (int tgt = 0; tgt < s.n; ++tgt) {
                if (taken[tgt] || threatened[tgt] || s.owner[tgt] != 0 || ANY[tgt]) continue;
                int ed = enemy_earliest(s, tgt);
                int ships = s.troops[tgt] + 1;
                if (ships > total) continue;
                int srcs[MAXN], ns = 0;
                for (int i = 0; i < s.n; ++i) if (budget[i] > 0) srcs[ns++] = i;
                std::sort(srcs, srcs + ns, [&](int a, int b) { return D[a][tgt] < D[b][tgt]; });
                int acc = 0, eta = 999;
                for (int k = 0; k < ns; ++k) {
                    acc += budget[srcs[k]];
                    eta = D[srcs[k]][tgt];
                    if (acc >= ships) break;
                }
                if (acc < ships || ed <= eta) continue;
                int growths = std::max(0, (s.max_turns + 1) - (s.turn + eta));
                int swing = G[tgt] * growths - s.troops[tgt];
                if (swing <= 0) continue;
                double score = (double)swing / (double)ships;
                if (bt < 0 || score > bscore) {
                    bt = tgt;
                    bships = ships;
                    beta = eta;
                    bscore = score;
                }
            }
            (void)beta;
            if (bt < 0) break;
            send_toward(bt, bships);
            taken[bt] = true;
        }
        int goal = -1;
        double gscore = 0;
        int total = 0;
        for (int i = 0; i < s.n; ++i) total += budget[i];
        for (int tgt = 0; tgt < s.n; ++tgt) {
            if (s.owner[tgt] == 1 || threatened[tgt] || taken[tgt]) continue;
            int mind = 999;
            for (int i = 0; i < s.n; ++i) if (s.owner[i] == 1 && !threatened[i]) mind = std::min(mind, D[i][tgt]);
            if (mind >= 999) continue;
            int ships, swing;
            if (s.owner[tgt] == 0 && !ANY[tgt]) {
                if (enemy_earliest(s, tgt) <= mind) continue;
                ships = s.troops[tgt] + 1;
                int growths = std::max(0, (s.max_turns + 1) - (s.turn + mind));
                swing = G[tgt] * growths - s.troops[tgt];
            } else if (s.owner[tgt] == 2) {
                ships = s.troops[tgt] + mind * G[tgt] + 1;
                for (int e = 0; e < s.n; ++e) if (s.owner[e] == 2 && e != tgt) {
                    int de = D[e][tgt];
                    if (de >= 1 && de <= mind - 1) ships += s.troops[e] + (mind - 1 - de) * G[e];
                }
                int growths = std::max(0, (s.max_turns + 1) - (s.turn + mind));
                swing = 2 * G[tgt] * growths;
            } else continue;
            if (ships <= 0 || swing <= 0) continue;
            double score = (double)swing / (double)ships;
            if (goal < 0 || score > gscore) {
                goal = tgt;
                gscore = score;
            }
        }
        if (goal < 0) goal = anchor;
        if (goal >= 0) {
            int stage = -1, sd = 999;
            for (int i = 0; i < s.n; ++i) if (s.owner[i] == 1 && !threatened[i]) {
                if (D[i][goal] < sd) {
                    sd = D[i][goal];
                    stage = i;
                }
            }
            if (stage >= 0) {
                for (int i = 0; i < s.n; ++i) {
                    if (i == stage || budget[i] <= 0 || s.owner[i] != 1 || threatened[i]) continue;
                    if (D[i][goal] <= D[stage][goal]) continue;
                    emit(out, nout, i, stage, budget[i]);
                    budget[i] = 0;
                }
            }
        }
        for (int i = 0; i < s.n; ++i) if (threatened[i] && !saved[i] && loss_t[i] == 1 && budget[i] > 0) {
            int dest = -1, dd = 999;
            for (int j = 0; j < s.n; ++j) if (j != i && s.owner[j] == 1 && !(threatened[j] && !saved[j])) {
                if (D[i][j] < dd) {
                    dd = D[i][j];
                    dest = j;
                }
            }
            if (dest >= 0) emit(out, nout, i, dest, budget[i]);
        }
        (void)total;
    }

    int used[MAXN];
    std::memset(used, 0, sizeof(int) * s.n);
    int w = 0;
    for (int i = 0; i < nout; ++i) {
        O o = out[i];
        if (o.from < 0 || o.from >= s.n || o.to < 0 || o.to >= s.n) continue;
        if (o.from == o.to || o.troops <= 0) continue;
        if (s.owner[o.from] != 1) continue;
        if (used[o.from] + o.troops > s.troops[o.from]) {
            o.troops = s.troops[o.from] - used[o.from];
            if (o.troops <= 0) continue;
        }
        used[o.from] += o.troops;
        out[w++] = o;
    }
    nout = w;
}

void apply_step(Sim& s, const O* a, int na, const O* b, int nb) {
    auto dispatch = [&](const O* o, int n, int who) {
        for (int i = 0; i < n; ++i) {
            const O& ord = o[i];
            if (ord.from < 0 || ord.from >= s.n || ord.to < 0 || ord.to >= s.n) continue;
            if (s.owner[ord.from] != who) continue;
            if (ord.from == ord.to || ord.troops <= 0) continue;
            if (ord.troops > s.troops[ord.from]) continue;
            s.troops[ord.from] -= ord.troops;
            if (s.nf >= MAXF) continue;
            s.fl[s.nf++] = {who, ord.troops, ord.to, D[ord.from][ord.to]};
        }
    };
    dispatch(a, na, 1);
    dispatch(b, nb, 2);
    for (int i = 0; i < s.n; ++i) if (s.owner[i]) s.troops[i] += G[i];
    static int sum[MAXN][3];
    for (int i = 0; i < s.n; ++i) sum[i][0] = sum[i][1] = sum[i][2] = 0;
    int nk = 0;
    for (int i = 0; i < s.nf; ++i) {
        F f = s.fl[i];
        --f.left;
        if (f.left <= 0) {
            if (f.to >= 0 && f.to < s.n && f.owner >= 1 && f.owner <= 2) sum[f.to][f.owner] += f.troops;
        } else if (nk < MAXF) {
            s.fl[nk++] = f;
        }
    }
    s.nf = nk;
    for (int i = 0; i < s.n; ++i) {
        if (!sum[i][0] && !sum[i][1] && !sum[i][2]) continue;
        CRes c = combat(s.owner[i], s.troops[i], sum[i][0], sum[i][1], sum[i][2]);
        s.owner[i] = c.owner;
        s.troops[i] = c.troops;
    }
    ++s.turn;
}

void flip_sim(Sim& s) {
    for (int i = 0; i < s.n; ++i) if (s.owner[i]) s.owner[i] = 3 - s.owner[i];
    for (int i = 0; i < s.nf; ++i) s.fl[i].owner = 3 - s.fl[i].owner;
}

int winner_of(const Sim& s) {
    bool alive[3] = {};
    long long total[3] = {};
    for (int i = 0; i < s.n; ++i) {
        alive[s.owner[i]] = true;
        total[s.owner[i]] += s.troops[i];
    }
    for (int i = 0; i < s.nf; ++i) {
        alive[s.fl[i].owner] = true;
        total[s.fl[i].owner] += s.fl[i].troops;
    }
    if (!alive[1] && !alive[2]) return 3;
    if (!alive[1]) return 2;
    if (!alive[2]) return 1;
    if (s.turn <= s.max_turns) return 0;
    if (total[1] == total[2]) return 3;
    return total[1] > total[2] ? 1 : 2;
}

double evaluate(const Sim& s) {
    int w = winner_of(s);
    if (w == 1) return 1e12;
    if (w == 2) return -1e12;
    if (w == 3) return 0;
    long long my_t = 0, en_t = 0;
    int my_g = 0, en_g = 0;
    for (int i = 0; i < s.n; ++i) {
        if (s.owner[i] == 1) {
            my_t += s.troops[i];
            my_g += G[i];
        } else if (s.owner[i] == 2) {
            en_t += s.troops[i];
            en_g += G[i];
        }
    }
    for (int i = 0; i < s.nf; ++i) {
        if (s.fl[i].owner == 1) my_t += s.fl[i].troops;
        else en_t += s.fl[i].troops;
    }
    int rem = s.max_turns - s.turn + 1;
    if (rem < 0) rem = 0;
    return (double)(my_t - en_t) + (double)(my_g - en_g) * rem;
}

using Clock = std::chrono::steady_clock;

double rollout(const Sim& base, const Params& me, const Params& opp, int depth, Clock::time_point deadline) {
    Sim s = base;
    for (int step_i = 0; step_i < depth; ++step_i) {
        if (s.turn > s.max_turns) break;
        int w = winner_of(s);
        if (w) return w == 1 ? 1e12 : (w == 2 ? -1e12 : 0);
        if (Clock::now() > deadline) return evaluate(s) - 1e6;
        O my[MAXO], en[MAXO];
        int nm = 0, ne = 0;
        heuristic(s, me, my, nm);
        flip_sim(s);
        heuristic(s, opp, en, ne);
        flip_sim(s);
        apply_step(s, my, nm, en, ne);
    }
    return evaluate(s);
}

Params presets[6];
bool presets_ready = false;
void init_presets() {
    if (presets_ready) return;
    presets_ready = true;
    presets[0] = {8, 0.15, 0.0, true};
    presets[1] = {4, 0.0, 0.0, true};
    presets[2] = {8, 2.0, 0.0, true};
    presets[3] = {16, 0.4, 0.0, true};
    presets[4] = {8, 0.15, 0.0, false};
    presets[5] = {0, 0.0, 0.0, true};
}

}  // namespace

std::vector<Order> decide(const State& st) {
    init_presets();
    Sim base{};
    base.turn = st.turn;
    base.max_turns = st.max_turns;
    base.n = (int)st.nodes.size();
    if (base.n > MAXN) base.n = MAXN;
    for (int i = 0; i < base.n; ++i) {
        base.owner[i] = st.nodes[i].owner;
        base.troops[i] = st.nodes[i].troops;
        G[i] = st.nodes[i].growth;
        for (int j = 0; j < base.n; ++j) D[i][j] = st.dist[i][j];
    }
    base.nf = 0;
    for (const auto& f : st.fleets) {
        if (base.nf >= MAXF) break;
        base.fl[base.nf++] = {f.owner, f.troops, f.to, f.turns_left};
    }

    int depth = (st.turn <= 2) ? 36 : (st.turn < 80 ? 18 : 12);
    int ntry = (st.turn <= 2) ? 6 : 4;
    auto budget = (st.turn == 1) ? std::chrono::milliseconds(650) : std::chrono::milliseconds(28);
    auto deadline = Clock::now() + budget;

    int best = 0;
    double best_sc = -1e300;
    bool any = false;
    for (int i = 0; i < ntry; ++i) {
        if (Clock::now() > deadline && any) break;
        double sc = rollout(base, presets[i], presets[0], depth, deadline);
        if (!any || sc > best_sc) {
            best_sc = sc;
            best = i;
            any = true;
        }
    }

    O tmp[MAXO];
    int n = 0;
    heuristic(base, presets[best], tmp, n);
    std::vector<Order> orders;
    orders.reserve(n);
    for (int i = 0; i < n; ++i) orders.push_back({tmp[i].from, tmp[i].to, tmp[i].troops});
    return orders;
}

#ifdef LOCAL_TEST
#include <array>
#include <iostream>
#include <random>

static Sim from_state(const State& st) {
    Sim s{};
    s.turn = st.turn;
    s.max_turns = st.max_turns;
    s.n = (int)st.nodes.size();
    for (int i = 0; i < s.n; ++i) {
        s.owner[i] = st.nodes[i].owner;
        s.troops[i] = st.nodes[i].troops;
        G[i] = st.nodes[i].growth;
        for (int j = 0; j < s.n; ++j) D[i][j] = st.dist[i][j];
    }
    for (const auto& f : st.fleets) s.fl[s.nf++] = {f.owner, f.troops, f.to, f.turns_left};
    return s;
}

static bool same_state(const Sim& a, const State& b) {
    if (a.turn != b.turn || a.n != (int)b.nodes.size() || a.nf != (int)b.fleets.size()) return false;
    for (int i = 0; i < a.n; ++i) {
        if (a.owner[i] != b.nodes[i].owner || a.troops[i] != b.nodes[i].troops) return false;
    }
    std::vector<std::array<int, 4>> A, B;
    for (int i = 0; i < a.nf; ++i) A.push_back({a.fl[i].owner, a.fl[i].troops, a.fl[i].to, a.fl[i].left});
    for (const auto& f : b.fleets) B.push_back({f.owner, f.troops, f.to, f.turns_left});
    std::sort(A.begin(), A.end());
    std::sort(B.begin(), B.end());
    return A == B;
}

int main() {
    init_presets();
    int fails = 0;
    auto check = [&](bool cond, const char* msg) {
        if (!cond) {
            std::cerr << "FAIL " << msg << "\n";
            ++fails;
        }
    };
    {
        CRes c = combat(0, 10, 0, 30, 20);
        check(c.owner == 1 && c.troops == 10, "combat 30 vs 20 vs 10");
        c = combat(0, 10, 0, 20, 20);
        check(c.owner == 0 && c.troops == 0, "tie keeps neutral");
        c = combat(1, 0, 0, 0, 5);
        check(c.owner == 2 && c.troops == 5, "zero garrison falls");
        c = combat(1, 0, 0, 5, 5);
        check(c.owner == 1 && c.troops == 0, "tie keeps owner");
    }
    State st;
    st.turn = 1;
    st.max_turns = 200;
    st.nodes = {
        {0, 0, 1, 100, 5},
        {6, 0, 2, 100, 5},
        {3, 0, 0, 10, 3},
        {-3, 0, 0, 10, 3},
        {0, 4, 0, 20, 1},
        {0, -4, 0, 20, 1},
    };
    st.dist.assign(6, std::vector<int>(6));
    for (int i = 0; i < 6; ++i)
        for (int j = 0; j < 6; ++j)
            st.dist[i][j] = distance(st.nodes[i].x, st.nodes[i].y, st.nodes[j].x, st.nodes[j].y);
    std::mt19937 rng(1);
    for (int trial = 0; trial < 40; ++trial) {
        State cur = st;
        cur.turn = 1;
        cur.fleets.clear();
        for (int t = 0; t < 60; ++t) {
            Sim sim = from_state(cur);
            std::vector<Order> mine, theirs;
            auto add_rand = [&](std::vector<Order>& v, int who) {
                int n = cur.nodes.size();
                for (int k = 0; k < 3; ++k) {
                    int from = rng() % n;
                    if (cur.nodes[from].owner != who || cur.nodes[from].troops <= 0) continue;
                    int to = rng() % n;
                    if (to == from) continue;
                    int tr = 1 + (int)(rng() % cur.nodes[from].troops);
                    int used = 0;
                    for (auto& o : v) if (o.from == from) used += o.troops;
                    if (used + tr > cur.nodes[from].troops) continue;
                    v.push_back({from, to, tr});
                }
            };
            add_rand(mine, 1);
            add_rand(theirs, 2);
            O a[8], b[8];
            int na = (int)mine.size(), nb = (int)theirs.size();
            for (int i = 0; i < na; ++i) a[i] = {mine[i].from, mine[i].to, mine[i].troops};
            for (int i = 0; i < nb; ++i) b[i] = {theirs[i].from, theirs[i].to, theirs[i].troops};
            apply_step(sim, a, na, b, nb);
            State nxt = step(cur, mine, theirs);
            if (!same_state(sim, nxt)) {
                std::cerr << "FAIL step mismatch trial " << trial << " t " << t << "\n";
                ++fails;
                break;
            }
            cur = nxt;
            int r = result(cur);
            if (r) break;
        }
    }
    {
        Sim sim = from_state(st);
        auto t0 = Clock::now();
        O tmp[MAXO];
        int n = 0;
        for (int i = 0; i < 200; ++i) heuristic(sim, presets[0], tmp, n);
        auto us = std::chrono::duration_cast<std::chrono::microseconds>(Clock::now() - t0).count();
        std::cout << "heuristic x200 = " << us << " us, orders " << n << "\n";
    }
    {
        auto t0 = Clock::now();
        auto orders = decide(st);
        auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(Clock::now() - t0).count();
        std::cout << "decide turn1 " << ms << " ms, orders " << orders.size() << "\n";
        for (auto& o : orders) std::cout << o.from << " " << o.to << " " << o.troops << "\n";
    }
    if (fails) {
        std::cerr << fails << " failures\n";
        return 1;
    }
    std::cout << "ok\n";
    return 0;
}
#endif

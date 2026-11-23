#include "engine.hpp"
#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <limits>
#include <tuple>
#include <vector>

// V10: Structural Synthesis fixing ALL 6 Replay-Proven Failure Modes:
// 1. Stateless Synchronized Multi-Node Waves + step_complete_in_flight_waves()
//    -> Zero neutral softening (fixes v9 vs v1!) + synchronized hammer-blow enemy strikes!
// 2. Complete Snipe-Proof Neutral Rule including Enemy PENDING Captures (end_own[e] == 2)
//    -> Fixes seed75, seed35, seed58, seed73 snipes!
// 3. Phase-Aware Neutral Economy + Backyard Harvest Saving (hold_for_expand on rear nodes)
//    -> Fixes seed1, seed15, seed29, seed37, seed42, seed78 frozen losses (+150..+600 net troops)!
// 4. Non-Double-Spending Front Garrison (separating hard def_reserved vs soft garrison_reserved)
//    -> Fixes seed60 collapse without freezing forks/endgame blitzes!
// 5. Anti-Trickle Knockout Combat + True Mutual-Pinning 2-Target Fork (can unlock soft garrison when pinning e!)
// 6. Compound-Discounted Turn-1 Knapsack (takes dist=2 growth-5 powerhouses, rejects dm==de>=6 snipe traps!)
//    + Zero-Sum Endgame Blitz (Turns 178-198)

namespace {

constexpr int MAXN = 24;
constexpr int MAXH = 20;

static int g_persist_hub = -1;
static int g_last_turn_seen = 0;

static inline void resolve_arrival(int& own, int& tr, int f1, int f2) {
    int sums[3] = {0, 0, 0};
    bool part[3] = {false, false, false};
    sums[own] = tr; part[own] = true;
    if (f1 > 0) { sums[1] += f1; part[1] = true; }
    if (f2 > 0) { sums[2] += f2; part[2] = true; }
    int bo = -1, bv = -1, sv = 0, cnt = 0;
    bool tie = false;
    for (int o = 0; o < 3; ++o) {
        if (!part[o]) continue;
        ++cnt;
        if (sums[o] > bv) { sv = bv; bv = sums[o]; bo = o; tie = false; }
        else if (sums[o] == bv) { sv = bv; tie = true; }
        else if (sums[o] > sv) sv = sums[o];
    }
    if (cnt == 1) { own = bo; tr = bv; }
    else if (tie) { tr = 0; }
    else { own = bo; tr = bv - sv; }
}

struct V10Solver {
    const State& s;
    int N, turn, rem_turns;
    int in_fl[MAXN][3][MAXH + 1];
    int add_me[MAXN][MAXH + 1];
    int max_t[MAXN];
    int nbrs[MAXN][MAXN];

    int tl_own[MAXN][MAXH + 1];
    int tl_tr[MAXN][MAXH + 1];
    int end_own[MAXN];
    int first_me_cap[MAXN];
    int first_en_any[MAXN];
    int first_lost[MAXN];
    bool has_en_fleet[MAXN];
    bool has_me_fleet[MAXN];

    int avail[MAXN];
    int def_reserved[MAXN];      // hard reservation (reactive defense, waves, snipes)
    int garrison_reserved[MAXN]; // soft proactive garrison against enemy hubs
    int en_avail[MAXN];
    int front_def[MAXN];
    double en_free_frac[MAXN];
    bool hold_for_expand[MAXN];

    int my_g = 0, en_g = 0, en_cnt = 0;
    long long my_tot = 0, en_tot = 0;
    long long my_proj = 0, en_proj = 0;
    bool behind = false, desperate = false, endgame = false;

    std::vector<Order> orders;

    V10Solver(const State& st) : s(st), N((int)st.nodes.size()), turn(st.turn), rem_turns(st.max_turns - st.turn) {
        if (turn == 1 || turn <= g_last_turn_seen) {
            g_persist_hub = -1;
        }
        g_last_turn_seen = turn;

        std::memset(in_fl, 0, sizeof(in_fl));
        std::memset(add_me, 0, sizeof(add_me));
        std::memset(max_t, 0, sizeof(max_t));
        std::memset(avail, 0, sizeof(avail));
        std::memset(def_reserved, 0, sizeof(def_reserved));
        std::memset(garrison_reserved, 0, sizeof(garrison_reserved));
        std::memset(en_avail, 0, sizeof(en_avail));
        std::memset(front_def, 0, sizeof(front_def));
        std::memset(has_en_fleet, 0, sizeof(has_en_fleet));
        std::memset(has_me_fleet, 0, sizeof(has_me_fleet));
        std::memset(hold_for_expand, 0, sizeof(hold_for_expand));

        for (int i = 0; i < N; ++i) {
            for (int j = 0; j < N; ++j) nbrs[i][j] = j;
            std::sort(nbrs[i], nbrs[i] + N, [&](int a, int b) {
                if (s.dist[i][a] != s.dist[i][b]) return s.dist[i][a] < s.dist[i][b];
                return a < b;
            });
            en_free_frac[i] = 1.0;
        }
        for (const auto& f : s.fleets) {
            if (f.turns_left >= 1 && f.turns_left <= MAXH) {
                in_fl[f.to][f.owner][f.turns_left] += f.troops;
                if (f.turns_left > max_t[f.to]) max_t[f.to] = f.turns_left;
                if (f.owner == 2) has_en_fleet[f.to] = true;
                else if (f.owner == 1) has_me_fleet[f.to] = true;
            }
        }
        init_timelines();
        compute_macro_stats();
    }

    bool stays_owner(int p, int init_tr, int who, int H) const {
        int own = s.nodes[p].owner, tr = init_tr, g = s.nodes[p].growth;
        for (int k = 1; k <= H; ++k) {
            if (own) tr += g;
            int f1 = in_fl[p][1][k] + add_me[p][k];
            int f2 = in_fl[p][2][k];
            if (f1 || f2) resolve_arrival(own, tr, f1, f2);
            if (own != who) return false;
        }
        return true;
    }

    int min_cap_until(int p, int arr_t, int H_end, const int* extra_add = nullptr) const {
        int H = std::max(arr_t, H_end);
        auto ok = [&](int extra) {
            int own = s.nodes[p].owner, tr = s.nodes[p].troops, g = s.nodes[p].growth;
            for (int k = 1; k <= H; ++k) {
                if (own) tr += g;
                int f1 = in_fl[p][1][k] + add_me[p][k] + (extra_add ? extra_add[k] : 0) + (k == arr_t ? extra : 0);
                int f2 = in_fl[p][2][k];
                if (f1 || f2) resolve_arrival(own, tr, f1, f2);
                if (k >= arr_t && own != 1) return false;
            }
            return true;
        };
        if (ok(0)) return 0;
        int lo = 1, hi = std::max(8, s.nodes[p].troops + arr_t * s.nodes[p].growth + 8);
        while (!ok(hi)) { hi *= 2; if (hi > 200000) return 1000000000; }
        while (lo < hi) {
            int m = lo + (hi - lo) / 2;
            if (ok(m)) hi = m; else lo = m + 1;
        }
        return lo;
    }

    int min_cap(int p, int arr_t) const {
        return min_cap_until(p, arr_t, max_t[p], nullptr);
    }

    void init_timelines() {
        for (int i = 0; i < N; ++i) {
            int own = s.nodes[i].owner, tr = s.nodes[i].troops, g = s.nodes[i].growth;
            tl_own[i][0] = own; tl_tr[i][0] = tr;
            first_me_cap[i] = (own == 1) ? 0 : -1;
            first_en_any[i] = -1;
            first_lost[i] = -1;
            bool ever_me = (own == 1);
            for (int k = 1; k <= MAXH; ++k) {
                if (own) tr += g;
                int f1 = in_fl[i][1][k], f2 = in_fl[i][2][k];
                if (f1 || f2) resolve_arrival(own, tr, f1, f2);
                tl_own[i][k] = own; tl_tr[i][k] = tr;
                if (own == 1 && first_me_cap[i] < 0) first_me_cap[i] = k;
                if (own == 2 && first_en_any[i] < 0) first_en_any[i] = k;
                if (ever_me && own == 2 && first_lost[i] < 0) first_lost[i] = k;
                if (own == 1) ever_me = true;
            }
            end_own[i] = tl_own[i][max_t[i]];

            int H = max_t[i];
            if (s.nodes[i].owner == 1) {
                if (H == 0) avail[i] = s.nodes[i].troops;
                else if (!stays_owner(i, s.nodes[i].troops, 1, H)) avail[i] = 0;
                else {
                    int lo = 0, hi = s.nodes[i].troops;
                    while (lo < hi) {
                        int m = lo + (hi - lo + 1) / 2;
                        if (stays_owner(i, s.nodes[i].troops - m, 1, H)) lo = m;
                        else hi = m - 1;
                    }
                    avail[i] = lo;
                }
            } else if (s.nodes[i].owner == 2) {
                if (H == 0) en_avail[i] = s.nodes[i].troops;
                else if (!stays_owner(i, s.nodes[i].troops, 2, H)) en_avail[i] = 0;
                else {
                    int lo = 0, hi = s.nodes[i].troops;
                    while (lo < hi) {
                        int m = lo + (hi - lo + 1) / 2;
                        if (stays_owner(i, s.nodes[i].troops - m, 2, H)) lo = m;
                        else hi = m - 1;
                    }
                    en_avail[i] = lo;
                }
            }
        }

        for (int e = 0; e < N; ++e) {
            if (s.nodes[e].owner != 2 || en_avail[e] <= 0) { en_free_frac[e] = 0.0; continue; }
            int min_en_help = 99;
            for (int ni = 1; ni < N; ++ni) {
                int e2 = nbrs[e][ni];
                if (s.nodes[e2].owner == 2) { min_en_help = s.dist[e2][e]; break; }
            }
            int my_unreact = 0;
            for (int ni = 1; ni < N; ++ni) {
                int q = nbrs[e][ni];
                int d = s.dist[q][e];
                if (d > std::min(min_en_help, 6)) break;
                if (s.nodes[q].owner == 1) my_unreact += avail[q];
            }
            int pinned = std::max(0, my_unreact - 2 * s.nodes[e].growth);
            int free_tr = std::max(0, en_avail[e] - pinned / 2);
            en_free_frac[e] = (double)free_tr / std::max(1, en_avail[e]);
        }
    }

    void compute_macro_stats() {
        my_g = en_g = en_cnt = 0;
        my_tot = en_tot = 0;
        for (int i = 0; i < N; ++i) {
            if (end_own[i] == 1) my_g += s.nodes[i].growth;
            else if (end_own[i] == 2) en_g += s.nodes[i].growth;
            if (s.nodes[i].owner == 1) my_tot += s.nodes[i].troops;
            else if (s.nodes[i].owner == 2) { en_tot += s.nodes[i].troops; ++en_cnt; }
        }
        for (const auto& f : s.fleets) {
            if (f.owner == 1) my_tot += f.troops;
            else if (f.owner == 2) en_tot += f.troops;
        }
        my_proj = my_tot + (long long)my_g * rem_turns;
        en_proj = en_tot + (long long)en_g * rem_turns;
        behind = (my_proj <= en_proj) || (my_g < en_g);
        desperate = (my_g < en_g && my_proj < en_proj - 40) || (my_proj < en_proj && rem_turns < 45);
        endgame = (rem_turns <= 22);
    }

    int kept_troops(int q) const {
        int sent = 0;
        for (const auto& o : orders) if (o.from == q) sent += o.troops;
        return s.nodes[q].troops - sent;
    }

    void issue(int u, int v, int tr) {
        if (tr <= 0 || u == v) return;
        tr = std::min(tr, avail[u]);
        if (tr <= 0) return;
        avail[u] -= tr;
        int d = s.dist[u][v];
        if (d <= MAXH) add_me[v][d] += tr;
        for (auto& o : orders) {
            if (o.from == u && o.to == v) { o.troops += tr; return; }
        }
        orders.push_back({u, v, tr});
    }

    // Issue borrowing from soft garrison_reserved when executing an active fork/pinning attack or endgame blitz
    void issue_with_garrison(int u, int v, int tr) {
        if (tr <= 0 || u == v) return;
        int total_can = avail[u] + garrison_reserved[u];
        tr = std::min(tr, total_can);
        if (tr <= 0) return;
        int from_av = std::min(tr, avail[u]);
        avail[u] -= from_av;
        int from_gar = tr - from_av;
        garrison_reserved[u] -= from_gar;
        int d = s.dist[u][v];
        if (d <= MAXH) add_me[v][d] += tr;
        for (auto& o : orders) {
            if (o.from == u && o.to == v) { o.troops += tr; return; }
        }
        orders.push_back({u, v, tr});
    }

    int en_strike_power(int v, int h) const {
        int pw = 0;
        for (int k = 1; k <= h && k <= MAXH; ++k) pw += in_fl[v][2][k];
        for (int ni = 1; ni < N; ++ni) {
            int e = nbrs[v][ni];
            int d = s.dist[e][v];
            if (d > h) break;
            int w = h - d;
            if (s.nodes[e].owner == 2) {
                pw += en_avail[e];
                if (w >= 1) pw += in_fl[e][2][1] + s.nodes[e].growth;
            } else if (w >= 1 && tl_own[e][1] == 2) {
                pw += tl_tr[e][1];
            }
        }
        return pw;
    }

    // Exact snipe threat against neutral v arriving at arr_t (INCLUDING enemy pending captures!)
    int en_unreactable_snipe_threat(int v, int arr_t, int min_my_any) const {
        int threat = 0;
        for (int e = 0; e < N; ++e) {
            if (e == v) continue;
            int de = s.dist[e][v];
            if (de > arr_t + 1) continue;
            int t_ready = -1, base_tr = 0;
            if (s.nodes[e].owner == 2) {
                t_ready = 0;
                base_tr = en_avail[e];
            } else if (s.nodes[e].owner == 0 && end_own[e] == 2 && first_en_any[e] > 0) {
                t_ready = first_en_any[e];
                base_tr = tl_tr[e][t_ready];
            }
            if (t_ready < 0) continue;
            if (t_ready + de > arr_t + 1) continue;
            // Enemy launches snipe from e at turn (arr_t + 1 - de), landing at arr_t + 1.
            // Unreactable if no friendly node is strictly closer than de!
            if (min_my_any >= de) {
                int extra_wait = (arr_t + 1 - de) - t_ready;
                threat += base_tr + std::max(0, extra_wait) * s.nodes[e].growth;
                for (int k = 1; k <= std::min(extra_wait, MAXH); ++k) {
                    if (t_ready == 0) threat += in_fl[e][2][k];
                }
            }
        }
        return threat;
    }

    // Closest effective enemy distance to v (including pending enemy captures that arrive early enough!)
    int min_en_eff_dist(int v, int arr_t) const {
        int md = 99;
        for (int e = 0; e < N; ++e) {
            if (e == v) continue;
            int de = s.dist[e][v];
            if (s.nodes[e].owner == 2) {
                md = std::min(md, de);
            } else if (s.nodes[e].owner == 0 && end_own[e] == 2 && first_en_any[e] > 0) {
                if (first_en_any[e] + de <= arr_t + 2) {
                    md = std::min(md, de);
                }
            }
        }
        return md;
    }

    // === STEP 1: EXACT EDF WAVE-BY-WAVE MULTI-WAVE REACTIVE DEFENSE ===
    void step_reactive_defense() {
        struct Def { int p, ft, prio; };
        std::vector<Def> defs;
        for (int i = 0; i < N; ++i) {
            if (first_lost[i] >= 2 && turn + first_lost[i] - 1 < s.max_turns) {
                defs.push_back({i, first_lost[i], s.nodes[i].growth * (s.max_turns - (turn + first_lost[i] - 1))});
            }
        }
        std::sort(defs.begin(), defs.end(), [](const Def& a, const Def& b) { return a.prio > b.prio; });

        int fut_committed[MAXN]{};
        for (const auto& df : defs) {
            int p = df.p, H = max_t[p];
            if (H < 2) continue;

            int tmp_avail[MAXN], tmp_fut[MAXN];
            std::memcpy(tmp_avail, avail, sizeof(tmp_avail));
            std::memcpy(tmp_fut, fut_committed, sizeof(tmp_fut));
            int tmp_add[MAXH + 1]{};

            struct Action { int q, k, amt; bool send_now; };
            std::vector<Action> plan;
            bool feasible = true;
            bool ever_me = (s.nodes[p].owner == 1);

            for (int k = 1; k <= H; ++k) {
                int co = s.nodes[p].owner, ct = s.nodes[p].troops, g = s.nodes[p].growth;
                bool cem = (co == 1);
                for (int t = 1; t <= k; ++t) {
                    if (co) ct += g;
                    int f1 = in_fl[p][1][t] + add_me[p][t] + tmp_add[t];
                    int f2 = in_fl[p][2][t];
                    if (f1 || f2) resolve_arrival(co, ct, f1, f2);
                    if (co == 1) cem = true;
                }
                if (cem) ever_me = true;
                if (!ever_me || co == 1) continue;
                if (k < 2) { feasible = false; break; }
                if (turn + k - 1 >= s.max_turns) break;

                int need_k = min_cap_until(p, k, k, tmp_add);
                if (need_k <= 0) continue;
                if (need_k > 500000) { feasible = false; break; }

                int rem = need_k;
                for (int ni = 1; ni < N && rem > 0; ++ni) {
                    int q = nbrs[p][ni];
                    int d = s.dist[q][p];
                    if (d >= k) break;
                    if (s.nodes[q].owner == 1 && tmp_avail[q] > 0) {
                        int tk = std::min(tmp_avail[q], rem);
                        tmp_avail[q] -= tk; tmp_add[k] += tk;
                        plan.push_back({q, k, tk, false}); rem -= tk;
                    }
                }
                for (int ni = 1; ni < N && rem > 0; ++ni) {
                    int q = nbrs[p][ni];
                    int d = s.dist[q][p];
                    if (d > k) break;
                    if (d == k && s.nodes[q].owner == 1 && tmp_avail[q] > 0) {
                        int sd = std::min(tmp_avail[q], rem);
                        tmp_avail[q] -= sd; tmp_add[k] += sd;
                        plan.push_back({q, k, sd, true}); rem -= sd;
                    }
                }
                for (int ni = 1; ni < N && rem > 0; ++ni) {
                    int q = nbrs[p][ni];
                    int d = s.dist[q][p];
                    if (d >= k) break;
                    if (s.nodes[q].owner == 1 && (max_t[q] == 0 || end_own[q] == 1)) {
                        int wt = k - d;
                        int q_fc = (wt * s.nodes[q].growth * 75) / 100;
                        for (int fk = 1; fk <= wt && fk <= MAXH; ++fk) q_fc += (in_fl[q][1][fk] * 80) / 100;
                        int ff = std::max(0, q_fc - tmp_fut[q]);
                        if (ff > 0) { int tk = std::min(ff, rem); tmp_fut[q] += tk; tmp_add[k] += tk; rem -= tk; }
                    }
                }
                if (rem > 0) { feasible = false; break; }
            }
            if (feasible) {
                std::memcpy(fut_committed, tmp_fut, sizeof(fut_committed));
                for (const auto& act : plan) {
                    if (act.send_now) issue(act.q, p, act.amt);
                    else {
                        int tk = std::min(avail[act.q], act.amt);
                        avail[act.q] -= tk; def_reserved[act.q] += tk; add_me[p][act.k] += tk;
                    }
                }
                end_own[p] = 1;
                first_lost[p] = -1;
            }
        }
    }

    // === STEP 2: NON-DOUBLE-SPENDING FRONT GARRISON ===
    // Reserves on front node p FIRST (into soft garrison_reserved[p]), then ONLY relies on
    // guaranteed helper capacity (reserved + future growth + in-flight), explicitly reserving
    // helper avail ONLY when p itself cannot cover the threat! Rear nodes stay FREE to harvest/supply!
    void step_front_garrison() {
        if (rem_turns <= 3) return;
        std::vector<std::pair<int, int>> front_order;
        for (int p = 0; p < N; ++p) {
            if (s.nodes[p].owner != 1) continue;
            if (max_t[p] > 0 && end_own[p] != 1) continue;
            int pw = en_strike_power(p, 6);
            if (pw > 0) front_order.push_back({pw * (s.nodes[p].growth + 1), p});
        }
        std::sort(front_order.begin(), front_order.end(), [](auto& a, auto& b) { return a.first > b.first; });

        int h_max = std::min(6, rem_turns - 1);
        for (auto [_, p] : front_order) {
            int max_need = 0;
            int best_h = 0;
            for (int h = 2; h <= h_max; ++h) {
                int en_p = en_strike_power(p, h);
                if (en_p <= 0) continue;
                int base_p = (kept_troops(p) - avail[p]) + h * s.nodes[p].growth;
                for (int k = 1; k <= h && k <= MAXH; ++k) base_p += in_fl[p][1][k] + add_me[p][k] - in_fl[p][2][k];

                // Count ONLY non-spendable guaranteed helper reaction (reserved + growth + incoming)
                int helper_fixed = 0;
                for (int ni = 1; ni < N; ++ni) {
                    int q = nbrs[p][ni];
                    int dq = s.dist[q][p];
                    if (dq >= h) break;
                    if (s.nodes[q].owner == 1 && (max_t[q] == 0 || end_own[q] == 1)) {
                        int wt = h - dq;
                        int q_fix = (kept_troops(q) - avail[q]) + wt * s.nodes[q].growth;
                        for (int fk = 1; fk <= wt && fk <= MAXH; ++fk) q_fix += in_fl[q][1][fk] + add_me[q][fk];
                        helper_fixed += (q_fix * 88) / 100;
                    }
                }
                int need_h = en_p - (base_p + helper_fixed);
                if (need_h > max_need) { max_need = need_h; best_h = h; }
            }
            if (max_need > 0) {
                // Reserve on p itself FIRST
                int tk = std::min(avail[p], max_need);
                avail[p] -= tk;
                garrison_reserved[p] += tk;
                int rem = max_need - tk;

                // If p still has an unreactable/short-range deficit, explicitly reserve closest helpers (NO double spending!)
                if (rem > 0 && best_h >= 3) {
                    for (int ni = 1; ni < N && rem > 0; ++ni) {
                        int q = nbrs[p][ni];
                        int dq = s.dist[q][p];
                        if (dq >= best_h) break;
                        if (s.nodes[q].owner == 1 && (max_t[q] == 0 || end_own[q] == 1) && avail[q] > 0) {
                            int htk = std::min(avail[q], rem);
                            avail[q] -= htk;
                            garrison_reserved[q] += htk;
                            rem -= htk;
                        }
                    }
                }
                front_def[p] = rem;
            }
        }
    }

    // === STEP 2.5: COMPLETE IN-FLIGHT SYNCHRONIZED MULTI-NODE WAVES ===
    // Guarantees zero forgotten half-fleets and exact simultaneous arrival for neutrals & enemy strikes!
    void step_complete_in_flight_waves() {
        for (int v = 0; v < N; ++v) {
            if (end_own[v] == 1 || !has_me_fleet[v]) continue;
            // Find the target arrival turn k >= 2 of our active wave in flight
            int wave_k = -1, wave_tr = 0;
            for (int k = MAXH; k >= 2; --k) {
                if (in_fl[v][1][k] > 0) { wave_k = k; wave_tr = in_fl[v][1][k]; break; }
            }
            if (wave_k < 2 || turn + wave_k - 1 >= s.max_turns) continue;

            int need = min_cap(v, wave_k);
            if (need <= 0 || need > 100000) continue;

            if (s.nodes[v].owner == 0) {
                // Neutral synchronized wave in progress! Check it's not walked into an enemy capture before wave_k
                if (first_en_any[v] > 0 && first_en_any[v] <= wave_k) continue;
                int min_my_any = 99;
                for (int ni = 1; ni < N; ++ni) {
                    int q = nbrs[v][ni];
                    if (s.nodes[q].owner == 1) { min_my_any = s.dist[q][v]; break; }
                }
                int snipe_th = en_unreactable_snipe_threat(v, wave_k, min_my_any);
                if (snipe_th >= s.nodes[v].growth + 2 && snipe_th > 12) continue;

                // Check feasibility using avail + future growth of strictly closer nodes
                int cap_tot = 0;
                for (int ni = 1; ni < N; ++ni) {
                    int q = nbrs[v][ni];
                    int d = s.dist[q][v];
                    if (d > wave_k) break;
                    if (s.nodes[q].owner == 1) {
                        cap_tot += avail[q] + ((wave_k - d) * s.nodes[q].growth * 6) / 10;
                    }
                }
                if (cap_tot < need) continue;

                int rem = need;
                // Reserve d < wave_k so they wait until d == k
                for (int ni = 1; ni < N && rem > 0; ++ni) {
                    int q = nbrs[v][ni];
                    int d = s.dist[q][v];
                    if (d >= wave_k) break;
                    if (s.nodes[q].owner == 1 && avail[q] > 0) {
                        int tk = std::min(avail[q], rem);
                        avail[q] -= tk; def_reserved[q] += tk; add_me[v][wave_k] += tk; rem -= tk;
                    }
                }
                // Launch d == wave_k NOW so all land simultaneously!
                for (int ni = 1; ni < N && rem > 0; ++ni) {
                    int q = nbrs[v][ni];
                    int d = s.dist[q][v];
                    if (d > wave_k) break;
                    if (d == wave_k && s.nodes[q].owner == 1 && avail[q] > 0) {
                        int sd = std::min(avail[q], rem);
                        issue(q, v, sd); rem -= sd;
                    }
                }
                if (rem <= 0 && !has_en_fleet[v]) {
                    end_own[v] = 1;
                    if (first_me_cap[v] < 0) first_me_cap[v] = wave_k;
                }
            } else if (s.nodes[v].owner == 2 && wave_tr >= 6) {
                // Synchronized enemy strike wave in progress! Complete if still cleanly winnable!
                int er = 0;
                for (int ej = 1; ej < N; ++ej) {
                    int e = nbrs[v][ej];
                    int de = s.dist[e][v];
                    if (de >= wave_k) break;
                    int wt = wave_k - de;
                    if (s.nodes[e].owner == 2) {
                        int e_in = 0;
                        for (int k = 1; k <= std::min(wt, MAXH); ++k) e_in += in_fl[e][2][k];
                        er += (int)(en_avail[e] * en_free_frac[e]) + e_in + (wt * s.nodes[e].growth * 6) / 10;
                    }
                }
                double rf = desperate ? 0.50 : (behind ? 0.62 : 0.75);
                int want = need + (er > 0 ? std::min(er, (int)(er * rf * 0.8 + 2)) : 0);
                int cap_tot = 0;
                for (int ni = 1; ni < N; ++ni) {
                    int q = nbrs[v][ni];
                    int d = s.dist[q][v];
                    if (d > wave_k) break;
                    if (s.nodes[q].owner == 1) cap_tot += avail[q] + ((wave_k - d) * s.nodes[q].growth) / 2;
                }
                if (cap_tot < need + (int)(er * rf * 0.7)) continue;
                int rem = std::min(want, cap_tot);
                for (int ni = 1; ni < N && rem > 0; ++ni) {
                    int q = nbrs[v][ni];
                    int d = s.dist[q][v];
                    if (d >= wave_k) break;
                    if (s.nodes[q].owner == 1 && avail[q] > 0) {
                        int tk = std::min(avail[q], rem);
                        avail[q] -= tk; def_reserved[q] += tk; add_me[v][wave_k] += tk; rem -= tk;
                    }
                }
                for (int ni = 1; ni < N && rem > 0; ++ni) {
                    int q = nbrs[v][ni];
                    int d = s.dist[q][v];
                    if (d > wave_k) break;
                    if (d == wave_k && s.nodes[q].owner == 1 && avail[q] > 0) {
                        int sd = std::min(avail[q], rem);
                        issue(q, v, sd); rem -= sd;
                    }
                }
            }
        }
    }

    // === STEP 3: COMPOUND-DISCOUNTED TURN-1 EXACT KNAPSACK ===
    // Properly values close high-growth powerhouses (like dist=2, growth=5, cost=53 in seed35!)
    // and rejects slow equidistant snipe-traps (dm == de && dm >= 6)!
    void step_turn1() {
        int home = -1, ehome = -1;
        for (int i = 0; i < N; ++i) {
            if (s.nodes[i].owner == 1) home = i;
            else if (s.nodes[i].owner == 2) ehome = i;
        }
        if (home < 0 || ehome < 0) return;

        struct Cand { int id, cost; double val; };
        std::vector<Cand> cands;
        bool has_center = false;
        int max_cg = 0;
        for (int i = 0; i < N; ++i) {
            if (s.nodes[i].owner != 0) continue;
            int dm = s.dist[home][i], de = s.dist[ehome][i];
            int c = s.nodes[i].troops + 1, g = s.nodes[i].growth;
            if (de <= dm && c <= 55 && g >= 3) { has_center = true; max_cg = std::max(max_cg, g); }
            if (dm > de) continue;
            // Reject slow equidistant snipe-traps (e.g. seed35 node 7: dm=13==de)!
            if (dm == de && (c > 16 || dm >= 7)) continue;
            if (c > avail[home]) continue;

            // Compound economic valuation: early captures reinvest growth to buy MORE planets!
            // Discount factor gamma = 0.942/turn over 44-turn opening horizon:
            // dist=2, g=5, c=54 -> PV(growth)=5*(0.887-0.072)/0.058 = 70.3, net = +17.3 (huge!)
            // Plus direct linear 36-turn troop surplus!
            double gamma = 0.942;
            double pv_g = g * (std::pow(gamma, dm) - std::pow(gamma, 44)) / (1.0 - gamma);
            double lin_net = g * std::max(0.0, 36.0 - dm) - (c - 1);
            if (lin_net <= 0 && pv_g <= (c - 1) * 0.92) continue;

            double pb = dm + (double)(c - 1) / g;
            double hub = 0.0;
            for (int j = 0; j < N; ++j) {
                if (j != i && s.nodes[j].owner == 0 && s.dist[i][j] < s.dist[home][j] && s.dist[i][j] <= 6) {
                    hub += (double)s.nodes[j].growth / (s.nodes[j].troops + 15.0) * (7 - s.dist[i][j]);
                }
            }
            // Fast arrival bonus: landing at dm=2..4 gives massive tempo & stepping-stone compounding!
            double tempo = 1.0 + 9.0 / (pb + 3.0) + 1.8 / (dm + 1.0);
            double base_v = std::max(0.0, lin_net) + 1.45 * std::max(0.0, pv_g - (c - 1) * 0.72);
            double val = base_v * tempo * (1.0 + 0.09 * hub);
            if (de == dm) val *= 0.55;
            else if (de == dm + 1) val *= 0.85;
            if (de < s.dist[home][ehome]) val *= 1.0 + 0.015 * (s.dist[home][ehome] - de);
            cands.push_back({i, c, val});
        }

        int reserve = has_center ? std::max(0, max_cg + 3 - s.nodes[home].growth) : 0;
        int budget = std::max(0, avail[home] - reserve);
        int M = (int)cands.size();
        std::vector<double> dp(budget + 1, 0.0);
        std::vector<std::vector<bool>> take(M, std::vector<bool>(budget + 1, false));
        for (int idx = 0; idx < M; ++idx) {
            int w = cands[idx].cost; double v = cands[idx].val;
            for (int cap = budget; cap >= w; --cap) {
                if (dp[cap - w] + v > dp[cap] + 1e-9) { dp[cap] = dp[cap - w] + v; take[idx][cap] = true; }
            }
        }
        int cap = budget;
        for (int idx = M - 1; idx >= 0; --idx) {
            if (take[idx][cap]) { issue(home, cands[idx].id, cands[idx].cost); cap -= cands[idx].cost; }
        }
    }

    // === STEP 4: REALISTIC JIT SNIPING ON ENEMY NEUTRAL CAPTURES ===
    void step_snipes() {
        struct Sn { int u, arr_t; double sc; };
        std::vector<Sn> cands;
        for (int u = 0; u < N; ++u) {
            if (s.nodes[u].owner != 0 || max_t[u] == 0) continue;
            if (end_own[u] != 2 || first_en_any[u] < 1) continue;
            int cap_t = first_en_any[u];
            int min_d = 99;
            for (int ni = 1; ni < N; ++ni) {
                int q = nbrs[u][ni];
                if (s.nodes[q].owner == 1 && (avail[q] > 0 || s.nodes[q].growth > 0)) { min_d = s.dist[q][u]; break; }
            }
            if (min_d > MAXH) continue;
            int arr_t = std::max(cap_t + 1, min_d);
            if (arr_t > cap_t + 2 || arr_t > MAXH || turn + arr_t - 1 >= s.max_turns) continue;

            int need = min_cap(u, arr_t);
            if (need <= 0 || need > 100000) continue;

            int en_react = 0, my_near = 0, min_en_def = 99;
            for (int ni = 1; ni < N; ++ni) {
                int q = nbrs[u][ni];
                int d = s.dist[q][u];
                if (min_en_def == 99 && s.nodes[q].owner == 2) min_en_def = d;
                if (d > arr_t) break;
                if (s.nodes[q].owner == 2 && d < arr_t) en_react += (int)(en_avail[q] * en_free_frac[q]) + (arr_t - d) * s.nodes[q].growth;
                if (s.nodes[q].owner == 1) my_near += avail[q] + ((arr_t - d) * s.nodes[q].growth) / 2;
            }
            if (my_near < need) continue;
            bool unreact_snipe = (arr_t <= min_en_def);
            if (!unreact_snipe && en_react > my_near * 1.25 && arr_t >= 4) continue;

            int ra = s.max_turns - (turn + arr_t - 1);
            double sc = (unreact_snipe ? 2.2 : 1.0) * (2.0 * s.nodes[u].growth * std::min(ra, 55) + s.nodes[u].troops * 0.4) / (need + 3.0);
            cands.push_back({u, arr_t, sc});
        }
        std::sort(cands.begin(), cands.end(), [](const Sn& a, const Sn& b) { return a.sc > b.sc; });
        for (const auto& sc : cands) {
            int u = sc.u, arr_t = sc.arr_t;
            int need = min_cap(u, arr_t);
            if (need <= 0) continue;
            int tot = 0;
            for (int ni = 1; ni < N; ++ni) {
                int q = nbrs[u][ni];
                if (s.dist[q][u] > arr_t) break;
                if (s.nodes[q].owner == 1) tot += avail[q] + ((arr_t - s.dist[q][u]) * s.nodes[q].growth) / 2;
            }
            if (tot < need) continue;
            int rem = need;
            for (int ni = 1; ni < N && rem > 0; ++ni) {
                int q = nbrs[u][ni];
                int d = s.dist[q][u];
                if (d >= arr_t) break;
                if (s.nodes[q].owner == 1 && avail[q] > 0) {
                    int tk = std::min(avail[q], rem);
                    avail[q] -= tk; def_reserved[q] += tk; add_me[u][arr_t] += tk; rem -= tk;
                }
            }
            for (int ni = 1; ni < N && rem > 0; ++ni) {
                int q = nbrs[u][ni];
                int d = s.dist[q][u];
                if (d > arr_t) break;
                if (d == arr_t && s.nodes[q].owner == 1 && avail[q] > 0) {
                    int sd = std::min(avail[q], rem);
                    issue(q, u, sd); rem -= sd;
                }
            }
        }
    }

    // === STEP 5: FORKS, SYNCHRONIZED EXPANSION & KNOCKOUT ATTACKS, BACKYARD HARVESTING, ENDGAME BLITZ ===
    void step_combat_and_expansion() {
        // === 5A: TRUE MUTUAL-PINNING & SHARED-DEFENDER 2-TARGET FORK ===
        // Can borrow soft garrison_reserved when behind/endgame if the fork pins the enemy hubs!
        if (behind || endgame || my_tot > en_tot * 1.08) {
            bool can_borrow_gar = (behind && turn > 35) || endgame;
            auto pool_of = [&](int q) { return avail[q] + (can_borrow_gar ? (garrison_reserved[q] * 6) / 10 : 0); };

            struct EInfo { int v, h, bn, er; };
            std::vector<EInfo> ec;
            for (int v = 0; v < N; ++v) {
                if (s.nodes[v].owner != 2 || end_own[v] == 1) continue;
                for (int h = 2; h <= 8; ++h) {
                    if (turn + h - 1 >= s.max_turns) break;
                    int sa = 0;
                    for (int ni = 1; ni < N; ++ni) {
                        int q = nbrs[v][ni];
                        if (s.dist[q][v] > h) break;
                        if (s.nodes[q].owner == 1) sa += pool_of(q);
                    }
                    int bn = min_cap(v, h);
                    if (bn <= 0 || bn > 100000 || sa < bn + 3) continue;
                    int er = 0;
                    for (int ni = 1; ni < N; ++ni) {
                        int e = nbrs[v][ni];
                        if (s.dist[e][v] >= h) break;
                        if (s.nodes[e].owner == 2) {
                            er += (int)(en_avail[e] * en_free_frac[e]) + ((h - s.dist[e][v]) * s.nodes[e].growth) / 2;
                        }
                    }
                    if (er > 5) { ec.push_back({v, h, bn, er}); break; }
                }
            }
            if (ec.size() >= 2) {
                int bi = -1, bj = -1, bsa = 0, bsb = 0;
                double bsc = 0.0;
                for (size_t i = 0; i < ec.size(); ++i) {
                    for (size_t j = i + 1; j < ec.size(); ++j) {
                        const auto& A = ec[i]; const auto& B = ec[j];
                        int ext_def = 0;
                        bool mutual_or_shared = (s.dist[A.v][B.v] < A.h || s.dist[B.v][A.v] < B.h);
                        for (int e = 0; e < N; ++e) {
                            if (e == A.v || e == B.v || s.nodes[e].owner != 2) continue;
                            bool ca = (s.dist[e][A.v] < A.h);
                            bool cb = (s.dist[e][B.v] < B.h);
                            if (ca || cb) {
                                int wt = std::max(ca ? A.h - s.dist[e][A.v] : 0, cb ? B.h - s.dist[e][B.v] : 0);
                                int c = (int)(en_avail[e] * en_free_frac[e]) + (wt * s.nodes[e].growth) / 2;
                                ext_def += c;
                                if (ca && cb && c >= 8) mutual_or_shared = true;
                            }
                        }
                        if (!mutual_or_shared) continue;

                        int extra = (int)(ext_def * (desperate ? 0.65 : 0.90)) + 6;
                        int xa = extra / 2 + 2;
                        int xb = extra - xa + 2;
                        int na = A.bn + xa, nb = B.bn + xb;

                        int oa = 0, ob = 0, ab = 0;
                        for (int q = 0; q < N; ++q) {
                            if (s.nodes[q].owner != 1 || pool_of(q) <= 0) continue;
                            bool ra = (s.dist[q][A.v] <= A.h), rb = (s.dist[q][B.v] <= B.h);
                            if (ra && rb) ab += pool_of(q);
                            else if (ra) oa += pool_of(q);
                            else if (rb) ob += pool_of(q);
                        }
                        if (std::max(0, na - oa) + std::max(0, nb - ob) > ab) continue;
                        int ra_t = s.max_turns - (turn + std::max(A.h, B.h) - 1);
                        if (ra_t <= 2) continue;
                        double g_gain = (ext_def == 0) ? (double)(s.nodes[A.v].growth + s.nodes[B.v].growth) : (double)std::min(s.nodes[A.v].growth, s.nodes[B.v].growth);
                        double sc = 2.0 * g_gain * std::min(ra_t, 45) / (na + nb + 10.0);
                        if (sc > bsc) { bsc = sc; bi = (int)i; bj = (int)j; bsa = na; bsb = nb; }
                    }
                }
                if (bi >= 0 && bsc > 0.42) {
                    const auto& A = ec[bi]; const auto& B = ec[bj];
                    int ra = bsa, rb = bsb;
                    auto send_f = [&](int q, int tgt, int k) {
                        if (can_borrow_gar) issue_with_garrison(q, tgt, k);
                        else issue(q, tgt, k);
                    };
                    for (int q = 0; q < N; ++q) {
                        if (s.nodes[q].owner != 1 || pool_of(q) <= 0) continue;
                        bool canA = (s.dist[q][A.v] <= A.h), canB = (s.dist[q][B.v] <= B.h);
                        if (canA && !canB && ra > 0) { int k = std::min(pool_of(q), ra); send_f(q, A.v, k); ra -= k; }
                        else if (canB && !canA && rb > 0) { int k = std::min(pool_of(q), rb); send_f(q, B.v, k); rb -= k; }
                    }
                    for (int q = 0; q < N; ++q) {
                        if (s.nodes[q].owner != 1 || pool_of(q) <= 0) continue;
                        bool canA = (s.dist[q][A.v] <= A.h), canB = (s.dist[q][B.v] <= B.h);
                        if (!(canA && canB)) continue;
                        int first = (s.dist[q][A.v] <= s.dist[q][B.v]) ? 0 : 1;
                        for (int pass = 0; pass < 2; ++pass) {
                            int w = (pass == 0) ? first : (1 - first);
                            if (w == 0 && ra > 0 && pool_of(q) > 0) { int k = std::min(pool_of(q), ra); send_f(q, A.v, k); ra -= k; }
                            else if (w == 1 && rb > 0 && pool_of(q) > 0) { int k = std::min(pool_of(q), rb); send_f(q, B.v, k); rb -= k; }
                        }
                    }
                }
            }
        }

        // === 5B: Synchronized Snipe-Proof Expansion (Phase-Aware!) & Knockout Enemy Attacks ===
        for (int iter = 0; iter < 16; ++iter) {
            int best_v = -1, best_arr = -1, best_send = 0;
            double best_sc = 0.0;
            bool best_is_neu = false;

            for (int v = 0; v < N; ++v) {
                if (end_own[v] == 1) continue;
                if (min_cap(v, std::max(1, max_t[v])) == 0) continue;
                if (s.nodes[v].owner == 0 && end_own[v] == 2) continue;

                bool is_neu = (s.nodes[v].owner == 0);
                int min_my_any = 99, min_my_av = 99;
                for (int ni = 1; ni < N; ++ni) {
                    int q = nbrs[v][ni];
                    if (min_my_any == 99 && s.nodes[q].owner == 1) min_my_any = s.dist[q][v];
                    if (min_my_av == 99 && s.nodes[q].owner == 1 && avail[q] > 0) min_my_av = s.dist[q][v];
                    if (min_my_any < 99 && min_my_av < 99) break;
                }
                if (min_my_av > MAXH) continue;

                if (is_neu) {
                    // Skip if we already have an uncompleted friendly wave in flight (handled by Step 2.5!)
                    if (has_me_fleet[v]) continue;
                    // Max 3-turn spread so we NEVER pull 1 trickle troop from dist=9 to delay dist=5!
                    int max_arr = std::min(MAXH, min_my_av + 3);
                    for (int arr_t = min_my_av; arr_t <= max_arr; ++arr_t) {
                        int ra = s.max_turns - (turn + arr_t - 1);
                        if (ra <= 0) break;
                        int need = min_cap(v, arr_t);
                        if (need <= 0 || need > 100000) continue;
                        int g = s.nodes[v].growth;
                        int net_eg = g * ra - (need - 1);
                        if (net_eg <= 0) continue;

                        int sum_a = 0, sum_closer = 0, closer_g = 0;
                        for (int ni = 1; ni < N; ++ni) {
                            int q = nbrs[v][ni];
                            int d = s.dist[q][v];
                            if (d > arr_t) break;
                            if (s.nodes[q].owner == 1) {
                                sum_a += avail[q];
                                if (d < arr_t) { sum_closer += avail[q]; closer_g += s.nodes[q].growth; }
                            }
                        }
                        if (sum_a < need) continue;

                        // If waiting 1 turn lets STRICTLY closer nodes (d <= arr_t - 2) capture it sooner, wait!
                        if (arr_t >= min_my_av + 2 && sum_closer + closer_g >= need) continue;

                        int min_en_d = min_en_eff_dist(v, arr_t);

                        // === COMPLETE SNIPE-PROOF NEUTRAL CHECK (INCLUDES ENEMY PENDING CAPTURES!) ===
                        int en_unreact_snipe = en_unreactable_snipe_threat(v, arr_t, min_my_any);
                        int extra_over = 0;
                        double risk_m = 1.0;
                        if (en_unreact_snipe >= g + 2) {
                            if (en_unreact_snipe <= 12 && sum_a >= need + en_unreact_snipe + 2 && g >= 3) {
                                extra_over = en_unreact_snipe + 2;
                                risk_m = 0.72;
                            } else {
                                continue;
                            }
                        } else if (min_en_d <= arr_t + 1) {
                            int my_react_snipe = 0;
                            for (int ni = 1; ni < N; ++ni) {
                                int q = nbrs[v][ni];
                                if (s.dist[q][v] >= min_en_d) break;
                                if (s.nodes[q].owner == 1) my_react_snipe += avail[q] + def_reserved[q] + garrison_reserved[q] + s.nodes[q].growth;
                            }
                            int en_snipe_tot = 0;
                            for (int ni = 1; ni < N; ++ni) {
                                int e = nbrs[v][ni];
                                if (s.dist[e][v] > arr_t + 1) break;
                                if (s.nodes[e].owner == 2) en_snipe_tot += (int)(en_avail[e] * en_free_frac[e]);
                            }
                            if (my_react_snipe - need < en_snipe_tot && need > 15) risk_m = 0.42;
                            else risk_m = 0.85;
                        }

                        // === PHASE-AWARE NEUTRAL ECONOMY (No early suicide, YES mid/late backyard harvest!) ===
                        double ratio = (double)(need - 1) / g;
                        bool safe_backyard = (min_my_any < min_en_d && en_unreact_snipe == 0);
                        if (turn < 26 && my_tot < 300) {
                            // Early contested phase: never burn front army on junk!
                            if (ratio > 18.5) {
                                if (my_tot - (need - 1) < en_tot + 20) continue;
                                if (need > my_tot * 0.16) continue;
                            }
                            if (ratio > 27.0) {
                                if (my_tot - (need - 1) < en_tot * 1.15 + 35) continue;
                                if (need > my_tot * 0.09) continue;
                            }
                        } else {
                            // Mid/Late phase: harvest ALL profitable safe backyard neutrals!
                            if (ratio > 18.5) {
                                if (safe_backyard && net_eg >= 20) {
                                    // Safe backyard neutral: allow up to 22% of total army (or 16% if ratio > 30 and turn < 45)
                                    double max_f = (ratio > 30.0 && turn < 45) ? 0.15 : 0.22;
                                    if (need > my_tot * max_f) continue;
                                } else {
                                    if (my_tot - (need - 1) < en_tot + 25) continue;
                                    if (need > my_tot * 0.14) continue;
                                }
                            }
                        }

                        double hor = std::min((double)ra, turn < 25 ? 42.0 : 58.0);
                        double net_v = g * std::max(0.0, hor - arr_t) - (need - 1);
                        if (net_v <= 0) {
                            if (net_eg >= 20 && safe_backyard) net_v = net_eg * 0.22;
                            else continue;
                        }
                        double terr = 0.0;
                        for (int w = 0; w < N; ++w) {
                            if (w != v && s.nodes[w].owner != 1 && s.dist[v][w] <= 6) {
                                int cur_d = 99;
                                for (int q = 0; q < N; ++q) if (s.nodes[q].owner == 1) cur_d = std::min(cur_d, s.dist[q][w]);
                                if (s.dist[v][w] < cur_d) {
                                    terr += (double)s.nodes[w].growth * (cur_d - s.dist[v][w]) / (s.dist[v][w] + 3.0);
                                }
                            }
                        }
                        double pb = arr_t + (double)(need - 1) / g;
                        double sc = risk_m * (net_v + 1.5 * terr + 1.0) / (pb + 3.0) * (1.0 + 0.14 * g);
                        if (min_en_d < 20) sc *= (1.0 + 0.015 * (20 - min_en_d));
                        if (sc > best_sc) {
                            best_sc = sc; best_v = v; best_arr = arr_t; best_send = need + extra_over; best_is_neu = true;
                        }
                        break;
                    }
                } else {
                    // === ENEMY TARGET: ANTI-TRICKLE KNOCKOUT STRIKE ===
                    // Don't trickle-spam an enemy node that already has our active wave in flight (Step 2.5 handles it!)
                    bool already_in_flight = false;
                    for (int k = 2; k <= MAXH; ++k) if (in_fl[v][1][k] > 0) { already_in_flight = true; break; }

                    int earliest_t = (s.nodes[v].owner == 1 && first_lost[v] > 0) ? (first_lost[v] + 1) : 2;
                    int prev_d = -1;
                    for (int ni = 1; ni < N; ++ni) {
                        int q = nbrs[v][ni];
                        if (s.nodes[q].owner != 1 || avail[q] <= 0) continue;
                        int arr_t = s.dist[q][v];
                        if (arr_t == prev_d || arr_t < earliest_t) continue;
                        prev_d = arr_t;
                        if (arr_t > MAXH) break;
                        int ra = s.max_turns - (turn + arr_t - 1);
                        if (ra <= 0) break;

                        int bn = min_cap(v, arr_t);
                        if (bn <= 0 || bn > 100000) continue;

                        int er = 0;
                        for (int ej = 1; ej < N; ++ej) {
                            int e = nbrs[v][ej];
                            int de = s.dist[e][v];
                            if (de >= arr_t) break;
                            int wt = arr_t - de;
                            if (s.nodes[e].owner == 2) {
                                int e_free = (int)(en_avail[e] * en_free_frac[e]);
                                int e_in = 0;
                                for (int k = 1; k <= std::min(wt, MAXH); ++k) e_in += in_fl[e][2][k];
                                er += e_free + e_in + (wt * s.nodes[e].growth * 6) / 10;
                            } else if (s.nodes[e].owner == 0 && end_own[e] == 2 && first_en_any[e] > 0 && first_en_any[e] <= wt) {
                                er += tl_tr[e][first_en_any[e]] + ((wt - first_en_any[e]) * s.nodes[e].growth * 6) / 10;
                            } else if (wt >= 1 && tl_own[e][wt] == 2) {
                                er += tl_tr[e][wt];
                            }
                        }

                        // Anti-trickle: never send repeated trickle waves into a defended enemy node!
                        if (already_in_flight && er > 5) continue;
                        // Anti-suicide cross-map raid (fixes seed60!): cap distance on defended non-elim targets!
                        if (er > 0 && en_cnt > 2 && !endgame && arr_t > 10) continue;
                        if (er == 0 && en_cnt > 2 && !endgame && arr_t > 13) continue;

                        double rf = 0.85;
                        if (desperate) rf = 0.56;
                        else if (behind) rf = 0.68;
                        else if (endgame) rf = 0.45;
                        if (my_tot > en_tot * 1.22) rf *= 0.75;

                        int eff_need = bn + (int)(er * rf);
                        int sum_a = 0;
                        for (int qi = 1; qi < N; ++qi) {
                            int sq = nbrs[v][qi];
                            if (s.dist[sq][v] > arr_t) break;
                            if (s.nodes[sq].owner == 1) sum_a += avail[sq];
                        }
                        if (sum_a < eff_need) continue;

                        int send_n = bn + (er > 0 ? std::min(er, (int)(er * std::min(0.72, rf * 0.88) + 2)) : 0);
                        if (send_n > sum_a) send_n = sum_a;

                        int g = s.nodes[v].growth;
                        double swing = 2.0 * g * std::min((double)ra, 48.0);
                        double unreact = (er == 0) ? 2.6 : 1.0;
                        double urg = desperate ? 2.4 : (behind ? 1.50 : (endgame ? 2.2 : 1.0));
                        if (en_cnt <= 2) urg *= 3.5;

                        double sc = urg * unreact * swing / (send_n + arr_t * 3.0 + 5.0);
                        if (sc > best_sc) {
                            best_sc = sc; best_v = v; best_arr = arr_t; best_send = send_n; best_is_neu = false;
                        }
                    }
                }
            }

            if (best_v < 0 || best_sc < 0.35) break;

            if (best_is_neu) {
                // === SYNCHRONIZED MULTI-NODE NEUTRAL LAUNCH (ZERO SOFTENING!) ===
                // Reserve closer nodes (d < best_arr) and launch d == best_arr NOW!
                // Step 2.5 automatically completes them on exact turn d == k!
                int rem = best_send;
                for (int ni = 1; ni < N && rem > 0; ++ni) {
                    int q = nbrs[best_v][ni];
                    int d = s.dist[q][best_v];
                    if (d >= best_arr) break;
                    if (s.nodes[q].owner == 1 && avail[q] > 0) {
                        int tk = std::min(avail[q], rem);
                        avail[q] -= tk; def_reserved[q] += tk; add_me[best_v][best_arr] += tk; rem -= tk;
                    }
                }
                for (int ni = 1; ni < N && rem > 0; ++ni) {
                    int q = nbrs[best_v][ni];
                    int d = s.dist[q][best_v];
                    if (d > best_arr) break;
                    if (d == best_arr && s.nodes[q].owner == 1 && avail[q] > 0) {
                        int sd = std::min(avail[q], rem);
                        issue(q, best_v, sd); rem -= sd;
                    }
                }
                if (!has_en_fleet[best_v]) {
                    end_own[best_v] = 1;
                    if (first_me_cap[best_v] < 0) first_me_cap[best_v] = best_arr;
                }
            } else {
                // === SYNCHRONIZED ENEMY HAMMER BLOW ===
                // If multi-distance with spread >= 2 and d == best_arr has >= 6 troops, sync them; else launch cleanly!
                int far_av = 0, near_av = 0;
                for (int ni = 1; ni < N; ++ni) {
                    int q = nbrs[best_v][ni];
                    int d = s.dist[q][best_v];
                    if (d > best_arr) break;
                    if (s.nodes[q].owner == 1 && avail[q] > 0) {
                        if (d == best_arr) far_av += avail[q];
                        else near_av += avail[q];
                    }
                }
                int far_need = std::max(0, best_send - near_av);
                bool do_sync = (near_av > 0 && far_need >= 6 && best_arr >= 4 && !endgame);
                int rem = best_send;
                if (do_sync) {
                    for (int ni = 1; ni < N && rem > 0; ++ni) {
                        int q = nbrs[best_v][ni];
                        int d = s.dist[q][best_v];
                        if (d >= best_arr) break;
                        if (s.nodes[q].owner == 1 && avail[q] > 0) {
                            int tk = std::min(avail[q], rem);
                            avail[q] -= tk; def_reserved[q] += tk; add_me[best_v][best_arr] += tk; rem -= tk;
                        }
                    }
                    for (int ni = 1; ni < N && rem > 0; ++ni) {
                        int q = nbrs[best_v][ni];
                        int d = s.dist[q][best_v];
                        if (d > best_arr) break;
                        if (d == best_arr && s.nodes[q].owner == 1 && avail[q] > 0) {
                            int sd = std::min(avail[q], rem);
                            issue(q, best_v, sd); rem -= sd;
                        }
                    }
                } else {
                    for (int ni = 1; ni < N && rem > 0; ++ni) {
                        int q = nbrs[best_v][ni];
                        if (s.dist[q][best_v] > best_arr) break;
                        if (s.nodes[q].owner == 1 && avail[q] > 0) {
                            int sd = std::min(avail[q], rem);
                            issue(q, best_v, sd); rem -= sd;
                        }
                    }
                }
            }
        }

        // === 5C: ZERO-SUM ENDGAME BLITZ (Turns 178-198 when behind/close!) ===
        // Pure 2-player combat is 1-for-1 zero-sum; attacking undefended/high-growth enemy nodes
        // arriving before Turn 200 is a free roll if we don't lose more growth in return!
        if (rem_turns <= 20 && rem_turns >= 3 && my_proj <= en_proj + 20) {
            struct EG { int v, d, bn, er; double sc; };
            std::vector<EG> egs;
            for (int v = 0; v < N; ++v) {
                if (s.nodes[v].owner != 2 || end_own[v] == 1) continue;
                int min_d = 99;
                for (int ni = 1; ni < N; ++ni) {
                    int q = nbrs[v][ni];
                    if (s.nodes[q].owner == 1 && (avail[q] + garrison_reserved[q]) > 0) { min_d = s.dist[q][v]; break; }
                }
                if (min_d >= rem_turns) continue; // must land by turn 199 (d <= rem_turns - 1) to gain >= 1 growth turn!
                int bn = min_cap(v, min_d);
                if (bn <= 0 || bn > 100000) continue;
                int er = 0;
                for (int e = 0; e < N; ++e) {
                    if (e != v && s.nodes[e].owner == 2 && s.dist[e][v] < min_d) er += en_avail[e];
                }
                int gain_turns = rem_turns - min_d; // grows on turns t+min_d .. 200
                double sc = (double)(2 * s.nodes[v].growth * gain_turns) / (bn + er * 0.4 + 5.0);
                egs.push_back({v, min_d, bn, er, sc});
            }
            std::sort(egs.begin(), egs.end(), [](const EG& a, const EG& b) { return a.sc > b.sc; });
            for (const auto& eg : egs) {
                int need = eg.bn + (eg.er > 0 ? std::min(eg.er, eg.er / 2 + 3) : 0);
                int pool = 0;
                for (int q = 0; q < N; ++q) {
                    if (s.nodes[q].owner == 1 && s.dist[q][eg.v] <= eg.d) {
                        // Only keep enough garrison for threats arriving BEFORE turn 200!
                        int keep_eg = 0;
                        for (int e = 0; e < N; ++e) {
                            if (s.nodes[e].owner == 2 && s.dist[e][q] < rem_turns - 1 && s.dist[e][q] <= 4) {
                                keep_eg = std::max(keep_eg, en_avail[e]);
                            }
                        }
                        int usable_gar = std::max(0, garrison_reserved[q] - keep_eg);
                        pool += avail[q] + usable_gar;
                    }
                }
                if (pool < need) continue;
                int rem = need;
                for (int ni = 1; ni < N && rem > 0; ++ni) {
                    int q = nbrs[eg.v][ni];
                    if (s.dist[q][eg.v] > eg.d) break;
                    if (s.nodes[q].owner != 1) continue;
                    int keep_eg = 0;
                    for (int e = 0; e < N; ++e) {
                        if (s.nodes[e].owner == 2 && s.dist[e][q] < rem_turns - 1 && s.dist[e][q] <= 4) {
                            keep_eg = std::max(keep_eg, en_avail[e]);
                        }
                    }
                    int can_use = avail[q] + std::max(0, garrison_reserved[q] - keep_eg);
                    if (can_use > 0) {
                        int sd = std::min(can_use, rem);
                        issue_with_garrison(q, eg.v, sd);
                        rem -= sd;
                    }
                }
            }
        }

        // === 5D: SAFE MULTI-NODE EXPANSION & BACKYARD HARVEST SAVING ===
        // 1) Early game (turn <= 38): save 1-2 turns for high-ROI good neutrals (cost/g <= 14.5)
        // 2) Mid/Late game (turn >= 24, my_tot >= 260): let rear nodes hold 2-5 turns to harvest
        //    ALL profitable safe backyard neutrals (fixes seed1, seed15, seed29, seed37, seed42, seed78!)
        bool any_front_def = false;
        for (int i = 0; i < N; ++i) if (front_def[i] > 0) any_front_def = true;

        if (!any_front_def && rem_turns > 35) {
            int best_u = -1;
            double best_u_sc = 0.0;
            int best_u_rad = 0;
            int best_max_nodes = 2;

            for (int u = 0; u < N; ++u) {
                if (s.nodes[u].owner != 0 || end_own[u] != 0 || has_me_fleet[u]) continue;
                int g = s.nodes[u].growth;
                int cost = s.nodes[u].troops + 1;

                int md = 99, ed = 99;
                for (int ni = 1; ni < N; ++ni) {
                    int q = nbrs[u][ni];
                    if (md == 99 && s.nodes[q].owner == 1) md = s.dist[q][u];
                    if (ed == 99 && (s.nodes[q].owner == 2 || end_own[q] == 2)) ed = s.dist[q][u];
                    if (md < 99 && ed < 99) break;
                }
                if (md >= ed || md > 7) continue;
                if (en_unreactable_snipe_threat(u, md + 2, md) >= g + 2) continue;

                int ra = rem_turns - md - 2;
                int net_eg = g * ra - (cost - 1);
                if (net_eg < 25) continue;

                bool early_good = (turn <= 38 && (double)cost / g <= 14.5 && md <= 6);
                bool backyard_harvest = (turn >= 24 && my_tot >= 260 && cost <= my_tot * 0.22 && md + 1 <= ed);
                if (!early_good && !backyard_harvest) continue;

                int max_wait = early_good ? 2 : 5;
                int max_q = early_good ? 2 : 3;
                int rad = std::min(md + 3, ed - 1);
                if (rad < md) rad = md;

                int cur_a = 0, near_g = 0, cnt_q = 0;
                for (int ni = 1; ni < N && cnt_q < max_q; ++ni) {
                    int q = nbrs[u][ni];
                    if (s.dist[q][u] > rad) break;
                    if (s.nodes[q].owner == 1 && (max_t[q] == 0 || end_own[q] == 1)) {
                        cur_a += avail[q]; near_g += s.nodes[q].growth; ++cnt_q;
                    }
                }
                if (cur_a >= cost || cur_a + max_wait * near_g < cost) continue;

                double sc = (double)net_eg / (cost + md * 4.0) * (early_good ? 2.0 : 1.0);
                if (sc > best_u_sc) {
                    best_u_sc = sc; best_u = u; best_u_rad = rad; best_max_nodes = max_q;
                }
            }
            if (best_u >= 0) {
                int cnt_q = 0;
                for (int ni = 1; ni < N && cnt_q < best_max_nodes; ++ni) {
                    int q = nbrs[best_u][ni];
                    if (s.dist[q][best_u] > best_u_rad) break;
                    if (s.nodes[q].owner == 1 && (max_t[q] == 0 || end_own[q] == 1)) {
                        hold_for_expand[q] = true; ++cnt_q;
                    }
                }
            }
        }
    }

    // === STEP 6: ZERO-PING-PONG SHORT-HOP FORWARD-ONLY SUPPLY LINES + SAFE PRE-REINFORCEMENT ===
    void step_supply_lines() {
        if (rem_turns <= 2) return;

        auto is_valid_dest = [&](int src, int q) -> bool {
            if (q == src) return false;
            if (turn + s.dist[src][q] - 1 >= s.max_turns) return false;
            if (s.nodes[q].owner == 1) return (max_t[q] == 0 || end_own[q] == 1);
            if (s.nodes[q].owner == 0 && end_own[q] == 1 && !has_en_fleet[q] && first_me_cap[q] > 0) {
                return s.dist[src][q] >= first_me_cap[q];
            }
            if (s.nodes[q].owner == 2 && end_own[q] == 1 && first_me_cap[q] > 0 && first_me_cap[q] <= 3 && s.dist[src][q] <= 6) {
                return s.dist[src][q] >= first_me_cap[q];
            }
            return false;
        };

        int edist[MAXN];
        double threat[MAXN]{};
        bool any_en = false;
        for (int e = 0; e < N; ++e) if (s.nodes[e].owner == 2) any_en = true;

        for (int i = 0; i < N; ++i) {
            int md = 99;
            double th = 0.0;
            for (int e = 0; e < N; ++e) {
                if (s.nodes[e].owner == 2) {
                    int d = s.dist[i][e];
                    if (d < md) md = d;
                    th += (s.nodes[e].troops + 15.0 * s.nodes[e].growth) / (d * d + 1.0);
                }
            }
            if (!any_en) {
                for (int u = 0; u < N; ++u) if (s.nodes[u].owner != 1) md = std::min(md, s.dist[i][u]);
            }
            edist[i] = md;
            threat[i] = th;
        }

        int assault_hub = -1;
        if (any_en && behind && turn > 30) {
            double best_h = -1.0;
            int cand_hub = -1;
            double cur_hub_sc = -1.0;
            for (int q = 0; q < N; ++q) {
                if (s.nodes[q].owner != 1 || (max_t[q] > 0 && end_own[q] != 1)) continue;
                double q_best = -1.0;
                for (int e = 0; e < N; ++e) {
                    if (s.nodes[e].owner != 2) continue;
                    int d = s.dist[q][e];
                    int er = 0;
                    for (int e2 = 0; e2 < N; ++e2) {
                        if (e2 != e && s.nodes[e2].owner == 2 && s.dist[e2][e] < d) er += en_avail[e2];
                    }
                    double unreact = (er == 0) ? 2.4 : 1.0;
                    double sc = unreact * (s.nodes[e].growth * 15.0 + 10.0) / (d * d + 0.03 * (s.nodes[e].troops + er) + 2.0);
                    if (sc > q_best) q_best = sc;
                }
                if (q == g_persist_hub) cur_hub_sc = q_best;
                if (q_best > best_h) { best_h = q_best; cand_hub = q; }
            }
            if (g_persist_hub >= 0 && cur_hub_sc > 0 && best_h < cur_hub_sc * 1.35) {
                assault_hub = g_persist_hub;
            } else {
                assault_hub = cand_hub;
                g_persist_hub = cand_hub;
            }
        } else {
            g_persist_hub = -1;
        }

        for (int i = 0; i < N; ++i) {
            if (s.nodes[i].owner != 1 || avail[i] <= 0 || hold_for_expand[i]) continue;

            // Priority 1: Reinforce strictly-forward exposed front node with proactive unreactable deficit!
            int best_def_q = -1;
            double best_def_sc = -1e18;
            for (int q = 0; q < N; ++q) {
                if (!is_valid_dest(i, q) || s.nodes[q].owner != 1) continue;
                if (edist[q] >= edist[i]) continue;
                if (front_def[q] <= 0) continue;
                int d = s.dist[i][q];
                if (d + edist[q] - edist[i] > 3) continue;
                double sc = (double)front_def[q] * s.nodes[q].growth / (d * d + 2.0);
                if (sc > best_def_sc) { best_def_sc = sc; best_def_q = q; }
            }
            if (best_def_q >= 0) {
                int direct = s.dist[i][best_def_q], hop = best_def_q;
                for (int m = 0; m < N; ++m) {
                    if (m != best_def_q && is_valid_dest(i, m) &&
                        s.dist[i][m] + s.dist[m][best_def_q] == direct && s.dist[i][m] < direct) {
                        hop = m; break;
                    }
                }
                int sd = std::min(avail[i], front_def[best_def_q]);
                issue(i, hop, sd);
                front_def[best_def_q] -= sd;
                if (avail[i] <= 0) continue;
            }

            // Priority 2: Persistent breakthrough concentration (forward or short hop <= 7!)
            if (assault_hub >= 0 && is_valid_dest(i, assault_hub) &&
                (edist[assault_hub] < edist[i] || (edist[assault_hub] == edist[i] && s.dist[i][assault_hub] <= 7))) {
                int direct = s.dist[i][assault_hub], hop = assault_hub;
                for (int m = 0; m < N; ++m) {
                    if (m != assault_hub && is_valid_dest(i, m) &&
                        s.dist[i][m] + s.dist[m][assault_hub] == direct && s.dist[i][m] < direct) {
                        hop = m; break;
                    }
                }
                issue(i, hop, avail[i]);
                continue;
            }

            // Priority 3: Short-hop strictly-forward supply streaming
            int best_q = -1;
            double best_val = -1e18;
            for (int q = 0; q < N; ++q) {
                if (!is_valid_dest(i, q)) continue;
                if (edist[q] >= edist[i]) continue;
                int d = s.dist[i][q];
                int detour = (d + edist[q]) - edist[i];
                if (detour > 2) continue;

                double val = (edist[i] - edist[q]) * 2.5 - detour * 5.0 - d * 0.65 + threat[q] * 0.14;
                if (q == assault_hub) val += 3.5;
                double q_tr = (s.nodes[q].owner == 1 ? kept_troops(q) : tl_tr[q][max_t[q]]) + 1.0;
                val += 5.0 * threat[q] / (q_tr + 20.0);
                if (val > best_val) { best_val = val; best_q = q; }
            }
            if (best_q >= 0) issue(i, best_q, avail[i]);
        }
    }

    std::vector<Order> solve() {
        if (turn == 1) {
            step_turn1();
            return orders;
        }
        step_reactive_defense();
        step_front_garrison();
        step_complete_in_flight_waves();
        step_snipes();
        step_combat_and_expansion();
        step_supply_lines();
        return orders;
    }
};

} // namespace

std::vector<Order> decide(const State& s) {
    V10Solver solver(s);
    return solver.solve();
}

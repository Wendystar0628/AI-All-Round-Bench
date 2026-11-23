// 攻城略地 — 启发式对战程序
//
// 局面评估(以“兵力差”= 我方总兵力 - 对方总兵力 为单位):
//   * 拿下中立点:  Δ = 增长率*剩余回合 - 该点原有兵力(结算时两败俱伤)
//   * 抢下敌方点:  Δ = 2*增长率*剩余回合(对方驻军被消灭,双方抵消)
//   * 守住自己的点:Δ = 0(但避免了一次 -2*增长率*剩余回合 的损失)
//   * 打输一场仗:  Δ = -我方出动的全部兵力(最惨重的失误)
// 节点归属是第一位的:要“早、多”地占点,而不是把兵平摊在各处。
//
// 四个子过程:
//   1) 防守:敌方在途部队完全可见,可以算出它第几回合落地,提前把援军
//      送到同一节点即可让这次进攻全军覆没;
//   2) 可达性:估计对方最早什么时候能到达某个节点,避免往对方先到的
//      节点上白送兵;
//   3) 抢点:把“拿下某个点”看成有代价(该点驻军)、有收益(增长率*剩余回合)
//      的物品,用 0/1 背包在兵力预算内取最大收益,一次能抢好几个点;
//      打敌方节点还要估计对方能及时赶到支援的兵力,否则就是送人头;
//   4) 蓄力:兵力集中才有意义——每个节点的产量流向少数几个“主攻点”,
//      在那里累积成足以拿下下一个点的兵力;兵太散就永远抢不了新点。

#include "engine.hpp"

#include <algorithm>
#include <cmath>
#include <vector>

#ifdef BOT_DEBUG
#include <cstdio>
#endif

#ifndef BOT_FN
#define BOT_FN decide
#endif

namespace {

constexpr int MAXETA = 40;  // 关注的在途部队最长时间

// ---------- 可调参数 ----------
#ifndef P_MIN_GARRISON
#define P_MIN_GARRISON 2
#endif
#ifndef P_CAMPAIGNS
#define P_CAMPAIGNS 3
#endif
#ifndef P_ATT_RISK
#define P_ATT_RISK 0.0
#endif
#ifndef P_ATT_MARGIN
#define P_ATT_MARGIN 2.0
#endif
#ifndef P_ATT_SCALE
#define P_ATT_SCALE 0.7
#endif
#ifndef P_REIN_FRAC
#define P_REIN_FRAC 0.60
#endif
#ifndef P_NEUTRAL_MIN
#define P_NEUTRAL_MIN 1.0
#endif
#ifndef P_FLOW_MAX_ETA
#define P_FLOW_MAX_ETA 14
#endif
#ifndef P_HUB_MODE
#define P_HUB_MODE 0
#endif
#ifndef P_FLOW_FULL
#define P_FLOW_FULL 0
#endif
#ifndef P_BATTLE_MARGIN
#define P_BATTLE_MARGIN 0.30
#endif
constexpr long long MIN_GARRISON = P_MIN_GARRISON;  // 每个己方节点至少保留的兵
constexpr int CAMPAIGNS = P_CAMPAIGNS;           // 同时主攻的目标个数(=兵力集中点数量)
constexpr double ATT_RISK = P_ATT_RISK;           // 进攻余量 = ATT_RISK * 对方可动兵力
constexpr double ATT_MARGIN = P_ATT_MARGIN;       // 进攻余量下限
constexpr double ATT_SCALE = P_ATT_SCALE;         // 进攻收益折扣(对方可能马上抢回去)
constexpr double REIN_FRAC = P_REIN_FRAC;         // 对方可及时支援的兵力上限(占其总兵力)
constexpr double NEUTRAL_MIN = P_NEUTRAL_MIN;     // 拿下中立点的最低净收益
constexpr int FLOW_MAX_ETA = P_FLOW_MAX_ETA;     // 产量流动的最远距离

int ceilDist(int x1, int y1, int x2, int y2) {
    const long long dx = (long long)x1 - x2, dy = (long long)y1 - y2;
    const long long q = dx * dx + dy * dy;
    long long d = (long long)std::sqrt((double)q);
    while (d * d < q) ++d;
    while (d > 0 && (d - 1) * (d - 1) >= q) --d;
    return (int)d;
}

struct Item {
    int tgt;
    int hub;    // 主攻点(离目标最近的己方节点):产量往这里流
    int src;    // 实际出兵节点
    int eta;
    long long cost;
    double value;
    bool taken;
};

}  // namespace

std::vector<Order> BOT_FN(const State& s) {
    const int n = (int)s.nodes.size();
    const int T = s.max_turns;
    const int cur = s.turn;
    const int left = T - cur + 1;  // 剩余回合数(含本回合)

    std::vector<int> own(n), tr(n), gr(n), xs(n), ys(n);
    for (int i = 0; i < n; ++i) {
        own[i] = s.nodes[i].owner;
        tr[i] = s.nodes[i].troops;
        gr[i] = s.nodes[i].growth;
        xs[i] = s.nodes[i].x;
        ys[i] = s.nodes[i].y;
    }
    std::vector<std::vector<int>> D(n, std::vector<int>(n));
    for (int i = 0; i < n; ++i)
        for (int j = 0; j < n; ++j) D[i][j] = ceilDist(xs[i], ys[i], xs[j], ys[j]);

    const int EA = MAXETA + 1;
    std::vector<long long> myArr((size_t)n * EA, 0), enArr((size_t)n * EA, 0);
    std::vector<int> enFirst(n, 1 << 20);
    int maxEta = 0;
    for (const auto& f : s.fleets) {
        int eta = f.turns_left - 1;
        if (eta < 0) eta = 0;
        if (eta > MAXETA) eta = MAXETA;
        const size_t idx = (size_t)f.to * EA + eta;
        if (f.owner == 1) {
            myArr[idx] += f.troops;
        } else {
            enArr[idx] += f.troops;
            if (eta < enFirst[f.to]) enFirst[f.to] = eta;
        }
        if (eta > maxEta) maxEta = eta;
    }

    long long enArmy = 0, myArmy = 0;
    for (int i = 0; i < n; ++i) {
        if (own[i] == 2) enArmy += tr[i];
        if (own[i] == 1) myArmy += tr[i];
    }
    long long enCommitted = 0;
    for (const auto& f : s.fleets) {
        if (f.owner == 2) {
            enArmy += f.troops;
            enCommitted += f.troops;
        } else {
            myArmy += f.troops;
        }
    }
    const double enPow = (double)std::max<long long>(enArmy, 1);
    const double enSpare = std::max(0.0, enPow - 0.5 * (double)enCommitted);

    // ---------------- 1. 防守需求 ----------------
    // need[i]:第 i 个节点还差多少兵才守得住;needBy[i]:最迟第几回合前要到
    std::vector<long long> need(n, 0);
    std::vector<int> needBy(n, -1);
    for (int i = 0; i < n; ++i) {
        if (own[i] != 1) continue;
        long long pw = tr[i];
        for (int tau = 0; tau <= maxEta; ++tau) {
            pw += gr[i];
            pw += myArr[(size_t)i * EA + tau];
            const long long e = enArr[(size_t)i * EA + tau];
            if (e <= 0) continue;
            if (pw + need[i] >= e) {
                pw = pw - e;
                continue;
            }
            const long long gap = e - pw;
            if (gap > need[i]) need[i] = gap;
            if (needBy[i] < 0) needBy[i] = tau;
            break;
        }
    }
    // 争夺战:对方正在往某个节点压兵,那里的战斗是决定性的,
    // 除了补齐缺口还要留出余量,否则会被一波一波地磨掉。
    for (int i = 0; i < n; ++i) {
        if (own[i] != 1) continue;
        long long enemy = 0;
        for (int tau = 0; tau <= maxEta; ++tau) enemy += enArr[(size_t)i * EA + tau];
        if (enemy <= 0) continue;
        const long long want = need[i] + (long long)(P_BATTLE_MARGIN * (double)enemy);
        if (want > need[i]) need[i] = want;
    }

    // ---------------- 2. 对方可达性 ----------------
    std::vector<int> enReach(n, 1 << 20);
    for (int i = 0; i < n; ++i) {
        if (enFirst[i] < (1 << 20)) enReach[i] = enFirst[i];
        for (int j = 0; j < n; ++j) {
            if (own[j] != 2 || tr[j] <= 0) continue;
            const int eta = D[j][i] - 1;
            if (eta < enReach[i]) enReach[i] = eta;
        }
    }

    // ---------------- 3. 兵力分配 ----------------
    std::vector<long long> avail(n, 0);
    for (int i = 0; i < n; ++i)
        if (own[i] == 1) avail[i] = std::max<long long>(0, (long long)tr[i] - MIN_GARRISON);

    std::vector<Order> out;

    // 3a. 防守(必须先做)
    {
        std::vector<int> ord;
        for (int i = 0; i < n; ++i)
            if (need[i] > 0 && needBy[i] >= 1) ord.push_back(i);
        std::sort(ord.begin(), ord.end(), [&](int a, int b) {
            const double va = (double)gr[a] * (left - std::max(0, needBy[a]));
            const double vb = (double)gr[b] * (left - std::max(0, needBy[b]));
            if (va != vb) return va > vb;
            return need[a] > need[b];
        });
        for (int i : ord) {
            int best = -1, bestEta = 1 << 20;
            for (int j = 0; j < n; ++j) {
                if (own[j] != 1 || j == i || avail[j] < need[i]) continue;
                const int eta = D[j][i] - 1;
                if (eta > needBy[i]) continue;
                if (eta < bestEta) { bestEta = eta; best = j; }
            }
            if (best < 0) continue;
            avail[best] -= need[i];
            out.push_back(Order{best, i, (int)need[i]});
        }
    }

    // 3b. 候选目标
    std::vector<Item> items;
    for (int i = 0; i < n; ++i) {
        if (own[i] == 1) continue;
        const bool neutral = (own[i] == 0);
        const long long G = tr[i];
        // 已经在路上的部队(够用就不重复派兵)
        long long inbound = 0;
        for (int tau = 0; tau <= MAXETA; ++tau) inbound += myArr[(size_t)i * EA + tau];
        // 主攻点:离目标最近的己方节点
        int hub = -1, hubEta = 1 << 20;
        for (int j = 0; j < n; ++j) {
            if (own[j] != 1 || tr[j] <= 0) continue;
            const int eta = D[j][i] - 1;
            if (eta < hubEta) { hubEta = eta; hub = j; }
        }
        if (hub < 0) continue;
        int bestSrc = -1, bestEta = 1 << 20;
        long long bestCost = 0;
        double bestVal = 0.0;
        for (int j = 0; j < n; ++j) {
            if (own[j] != 1 || avail[j] <= 0) continue;
            const int eta = D[j][i] - 1;
            if (eta >= left) continue;
            const int grow = left - eta;
            long long by = 0;
            for (int t = 0; t <= eta && t <= MAXETA; ++t) by += enArr[(size_t)i * EA + t];
            long long cost;
            double val;
            if (neutral) {
                if (enReach[i] < eta) continue;  // 对方先到,不去送死
                cost = G + 1 + by;
                val = (double)gr[i] * grow - (double)G;
                if (by > 0) val += (double)gr[i] * grow;  // 顺手阻止对手扩张
                if (val < NEUTRAL_MIN) continue;
            } else {
                // 对方的驻军每回合还在长;而且看到我的部队后还能及时来支援
                // (支援需要 D(j,i)-1 <= eta-1,即我到达前一轮他们就能出发)
                const long long grew = (long long)gr[i] * eta;
                long long rein = 0;
                int resp = 0;
                for (int j = 0; j < n; ++j) {
                    if (own[j] != 2 || tr[j] <= 0) continue;
                    if (D[j][i] - 1 > eta - 1) continue;
                    rein += tr[j];
                    ++resp;
                }
                rein = (long long)std::min<double>((double)rein, REIN_FRAC * enPow);
                const double marg = (resp == 0) ? ATT_MARGIN : std::max(ATT_MARGIN, ATT_RISK * enSpare);
                cost = G + grew + 1 + by + rein + (long long)marg;
                val = ATT_SCALE * 2.0 * (double)gr[i] * grow;
            }
            if (cost > avail[j]) continue;
            if (neutral && inbound >= cost) continue;  // 已经有一支够用的部队在路上
            if (val > bestVal || (val == bestVal && eta < bestEta)) {
                bestVal = val;
                bestSrc = j;
                bestEta = eta;
                bestCost = cost;
            }
        }
        double val0 = 0.0;
        if (bestSrc >= 0) {
            val0 = bestVal;
        } else {
            // 预算不够也留着,用于蓄力导向
            const int eta = hubEta;
            if (eta < left) {
                if (neutral) {
                    val0 = (double)gr[i] * (left - eta) - (double)G;
                    if (enReach[i] < eta) val0 = 0.0;
                } else {
                    val0 = ATT_SCALE * 2.0 * (double)gr[i] * (left - eta);
                }
            }
        }
        items.push_back(Item{i, hub, bestSrc, bestEta, bestCost, val0, false});
    }

    // 3c. 0/1 背包:在兵力预算内挑收益最大的组合
    long long budget = 0;
    for (int i = 0; i < n; ++i) budget += avail[i];
    std::vector<int> sel;
    {
        std::vector<int> idxs;
        for (int idx = 0; idx < (int)items.size(); ++idx)
            if (items[idx].cost > 0 && items[idx].value > 0) idxs.push_back(idx);
        if (!idxs.empty() && budget > 0) {
            long long totalCost = 0;
            for (int idx : idxs) totalCost += items[idx].cost;
            const int B = (int)std::min<long long>(budget, totalCost);
            const int m = (int)idxs.size();
            std::vector<double> dp(B + 1, 0.0);
            std::vector<unsigned char> take((size_t)m * (B + 1), 0);
            for (int k = 0; k < m; ++k) {
                const int idx = idxs[k];
                const int c = (int)items[idx].cost;
                if (c > B) continue;
                const double v = items[idx].value;
                for (int b = B; b >= c; --b) {
                    const double cand = dp[b - c] + v;
                    if (cand > dp[b]) {
                        dp[b] = cand;
                        take[(size_t)k * (B + 1) + b] = 1;
                    }
                }
            }
            int b = B;
            for (int k = m - 1; k >= 0; --k) {
                if (take[(size_t)k * (B + 1) + b]) {
                    sel.push_back(idxs[k]);
                    b -= (int)items[idxs[k]].cost;
                }
            }
        }
    }

    // 3d. 执行抢点
    std::sort(sel.begin(), sel.end(), [&](int a, int b) {
        if (items[a].value != items[b].value) return items[a].value > items[b].value;
        return items[a].eta < items[b].eta;
    });
    for (int idx : sel) {
        Item& it = items[idx];
        if (it.cost <= 0) continue;
        int src = -1, bestEta = 1 << 20;
        for (int j = 0; j < n; ++j) {
            if (own[j] != 1 || avail[j] < it.cost) continue;
            const int eta = D[j][it.tgt] - 1;
            if (eta >= left) continue;
            if (eta < bestEta) { bestEta = eta; src = j; }
        }
        if (src < 0) continue;
        avail[src] -= it.cost;
        out.push_back(Order{src, it.tgt, (int)it.cost});
        it.taken = true;
    }

    // ---------------- 4. 蓄力:产量集中到少数主攻点 ----------------
    {
        // 主攻目标:价值最高的几个
        std::vector<int> pend;
        for (int idx = 0; idx < (int)items.size(); ++idx)
            if (!items[idx].taken && items[idx].value > 0) pend.push_back(idx);
        std::sort(pend.begin(), pend.end(), [&](int a, int b) { return items[a].value > items[b].value; });
        if ((int)pend.size() > CAMPAIGNS) pend.resize(CAMPAIGNS);

#if P_HUB_MODE == 1
        // 单一主攻点:最靠前的己方节点(离对方最近的)
        int hub = -1, bestScore = 1 << 20;
        for (int j = 0; j < n; ++j) {
            if (own[j] != 1) continue;
            int near = 1 << 20;
            for (int k = 0; k < n; ++k) {
                if (own[k] != 2) continue;
                const int d = D[j][k] - 1;
                if (d < near) near = d;
            }
            if (near < bestScore) { bestScore = near; hub = j; }
        }
        std::vector<int> hubs;
        if (hub >= 0) hubs.push_back(hub);
#elif P_HUB_MODE == 3
        // 稳定的主攻点:一旦选定就保持(兵力集中需要一个固定目标)
        static int g_hub = -1;
        if (g_hub < 0 || g_hub >= n || own[g_hub] != 1) {
            g_hub = -1;
            int bestScore = 1 << 20;
            for (int j = 0; j < n; ++j) {
                if (own[j] != 1) continue;
                int near = 1 << 20;
                for (int k = 0; k < n; ++k) {
                    if (own[k] != 2) continue;
                    const int d = D[j][k] - 1;
                    if (d < near) near = d;
                }
                if (near < bestScore) { bestScore = near; g_hub = j; }
            }
        }
        std::vector<int> hubs;
        if (g_hub >= 0) hubs.push_back(g_hub);
#elif P_HUB_MODE == 2
        // 单一主攻点:兵力最多的己方节点
        int hub = -1;
        for (int j = 0; j < n; ++j)
            if (own[j] == 1 && (hub < 0 || tr[j] > tr[hub])) hub = j;
        std::vector<int> hubs;
        if (hub >= 0) hubs.push_back(hub);
#else
        std::vector<int> hubs;
        for (int idx : pend) hubs.push_back(items[idx].hub);
#endif
        // 已经主攻的节点不再往外送产量
        std::vector<char> isHub(n, 0);
        for (int h : hubs) isHub[h] = 1;
        for (int j = 0; j < n; ++j) {
            if (own[j] != 1 || isHub[j]) continue;
            int dst = -1, bestPath = 1 << 20;
            for (int idx : pend) {
                const int s = items[idx].hub;
                if (s < 0 || s == j) continue;
                const int path = D[j][s] + D[s][items[idx].tgt];
                if (path < bestPath) { bestPath = path; dst = s; }
            }
#if P_HUB_MODE != 0
            if (!hubs.empty() && hubs[0] != j) {
                const int s = hubs[0];
                const int path = D[j][s] + (int)gr[s];
                if (path < bestPath) { bestPath = path; dst = s; }
            }
#endif
            if (dst < 0 || dst == j) continue;
            const int eta = D[j][dst] - 1;
            if (eta > FLOW_MAX_ETA) continue;
#if P_FLOW_FULL
            const long long send = avail[j];
#else
            const long long send = std::min<long long>(gr[j], avail[j]);
#endif
            if (send <= 0) continue;
            avail[j] -= send;
            out.push_back(Order{j, dst, (int)send});
        }
    }

#ifdef BOT_DEBUG
    {
        fprintf(stderr, "== t%d myArmy=%lld enArmy=%lld\n", cur, myArmy, enArmy);
        for (int i = 0; i < n; ++i)
            if (own[i] == 1 && need[i] > 0)
                fprintf(stderr, "   DEF need[%d]=%lld by=%d tr=%d gr=%d\n", i, need[i], needBy[i], tr[i], gr[i]);
        for (const Item& it : items)
            fprintf(stderr, "   ITEM t%d own=%d G=%d gr=%d eta=%d hub=%d cost=%lld val=%.0f %s\n",
                    it.tgt, own[it.tgt], tr[it.tgt], gr[it.tgt], it.eta, it.hub, it.cost, it.value,
                    it.taken ? "TAKEN" : "");
        for (const Order& o : out) fprintf(stderr, "   OUT %d->%d %d\n", o.from, o.to, o.troops);
    }
#endif
    return out;
}

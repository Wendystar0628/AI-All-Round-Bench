#include "engine.hpp"

#include <algorithm>
#include <vector>

namespace {

constexpr int N = 24;
constexpr int D = 20;

struct Site {
    int owner = 0;
    int troops = 0;
};

Site arrive(Site p, int a, int b) {
    if (!a && !b) return p;
    if (p.owner == 1) a += p.troops;
    if (p.owner == 2) b += p.troops;
    int neutral = p.owner == 0 ? p.troops : 0;
    if (a > b && a > neutral) return {1, a - std::max(b, neutral)};
    if (b > a && b > neutral) return {2, b - std::max(a, neutral)};
    if (neutral > std::max(a, b)) return {0, neutral - std::max(a, b)};
    return {p.owner, 0};
}

struct Map {
    int n;
    int end;
    int growth[N]{};
    int dist[N][N]{};
    int sorted[N][N]{};
    float frontier[N]{};
    int home[3]{};

    explicit Map(const State& s) : n((int)s.nodes.size()), end(s.max_turns) {
        home[1] = s.nodes[0].owner == 1 ? 0 : 1;
        home[2] = home[1] ^ 1;
        for (int i = 0; i < n; ++i) {
            growth[i] = s.nodes[i].growth;
            frontier[i] = 0;
            for (int j = 0; j < n; ++j) {
                dist[i][j] = s.dist[i][j];
                sorted[i][j] = j;
                if (i != j && j >= 2)
                    frontier[i] += s.nodes[j].growth * std::max(0, 10 - dist[i][j]) / 100.0f;
            }
            std::sort(sorted[i], sorted[i] + n, [&](int a, int b) {
                return dist[i][a] != dist[i][b] ? dist[i][a] < dist[i][b] : (a ^ home[1]) < (b ^ home[1]);
            });
        }
    }
};

struct Position {
    const Map* map;
    int turn;
    Site site[N]{};
    int incoming[D + 1][3][N]{};

    Position(const Map& m, const State& s) : map(&m), turn(s.turn) {
        for (int i = 0; i < m.n; ++i) site[i] = {s.nodes[i].owner, s.nodes[i].troops};
        for (const auto& f : s.fleets)
            incoming[f.turns_left][f.owner][f.to] += f.troops;
    }

    int flight(int side, int i, int t) const {
        return incoming[t][side][i];
    }

};

struct Intel {
    float rate[N][N]{};

    void observe(const State& s) {
        if (s.turn == 1) *this = {};
        for (auto& row : rate)
            for (auto& v : row) v *= 0.69f;
        // Every fleet first becomes visible with one unit of travel completed.
        for (const auto& f : s.fleets) {
            if (f.owner != 2 || f.turns_left != s.dist[f.from][f.to] - 1) continue;
            rate[f.from][f.to] += 0.31f * std::min(f.troops, 2 * s.nodes[f.from].growth + 5);
        }
    }
};

struct Forecast {
    int friendly[D + 1]{}, hostile[D + 1]{};
    int deficit[D+1]{};
    Site state[D+1]{};
    int firstLoss = D+1;
    int lastEnemy = 0;
};

struct Plan {
    int to = -1;
    int eta = 0;
    int n = 0;
    int from[N]{};
    int amount[N]{};
    float value = 0;
};

class Scheduler {
    const Position& pos;
    const Map& m;
    const int side, foe, end;
    const Intel& intel;
    const int quiet;
    Forecast future[N];
    int departures[N][D+1]{};
    int movable[N][D+1]{};
    int enemyDist[N]{};
    int friendDist[N]{};
    int myGrowth = 0, theirGrowth = 0;
    float threat[N]{};
    float stream[N][D+1]{};
    float pressure[N][D+1]{};
    float urgency[N]{};
    float bridge[N]{};
    float coverage[N]{};
    float contest[N]{};
    int readyGrowth = 0;
    int hostileGrowth = 0;
    bool assigned[N]{};

    void forecast(int i) {
        auto& f = future[i];
        f.state[0] = pos.site[i];
        f.state[0].troops -= departures[i][0];
        f.firstLoss = D+1;
        f.lastEnemy = 0;
        for (int t = 1; t <= end; ++t) {
            Site q = f.state[t-1];
            if (q.owner) q.troops += m.growth[i];
            q = arrive(q, side == 1 ? f.friendly[t] : f.hostile[t], side == 1 ? f.hostile[t] : f.friendly[t]);
            if (q.owner != side) f.firstLoss = std::min(f.firstLoss, t);
            if (f.hostile[t]) f.lastEnemy = t;
            if (q.owner == side) q.troops = std::max(0, q.troops - departures[i][t]);
            f.state[t] = q;
        }
        // Work backward to find the garrison that can absorb later arrivals.
        int need = 0;
        for (int t = end; t >= 0; --t) {
            f.deficit[t] = need;
            need = std::max(0, need + f.hostile[t] - f.friendly[t] + departures[i][t] - m.growth[i]);
        }
    }

    void capacity(int i) {
        const auto& f = future[i];
        for (int t = 0; t < end; ++t) {
            int available = f.state[t].troops;
            if (f.state[t].owner != side) {
                movable[i][t] = 0;
                continue;
            }
            int reserve = f.deficit[t];
            if (reserve > available) {
                int loss = t + 1;
                while (loss <= end && f.state[loss].owner == side) ++loss;
                // A garrison without a timely rescue is available for evacuation.
                reserve = loss <= 3 ? 0 : available;
            } else {
                reserve = std::min(available, reserve + int(threat[i]));
            }
            movable[i][t] = available - reserve;
        }
    }

    int needAt(int i, int eta) const {
        auto& f = future[i];
        Site p = f.state[eta-1];
        if (p.owner) p.troops += m.growth[i];
        if (p.owner == side)
            return std::max(0, f.hostile[eta] + f.deficit[eta] - p.troops - f.friendly[eta]);
        int opponent = f.hostile[eta] + (p.owner == foe ? p.troops : 0);
        int rival = std::max(opponent, p.owner == 0 ? p.troops : 0);
        return std::max(0, rival + std::max(1, f.deficit[eta]) - f.friendly[eta]);
    }

    int minSource(int i, int eta) const {
        const auto& f = future[i];
        int g = m.growth[i];
        if (f.firstLoss > eta && f.state[0].owner == side)
            return std::max(0, needAt(i, eta) - g);
        return needAt(i, eta);
    }

    float response(int i, int eta) const {
        float cost = 0;
        for (int k = 1; k < m.n; ++k) {
            int j = m.sorted[i][k], d = m.dist[i][j];
            if (d >= eta) break;
            Site q = future[j].state[eta-d-1];
            if (q.owner == foe) {
                float reachable = (std::min(q.troops, 40) + m.growth[j]) * (9 - std::min(d, 8)) / 8.0f;
                cost += reachable * (d <= 4 ? 0.65f : 0.35f);
            }
        }
        return cost;
    }

    // Compare ownership with and without the plan under two hypothetical waves.
    float durability(int i, int eta, int troops, int answering, int reserve) const {
        const auto& f = future[i];
        const int finish = std::min(end,eta+7);
        Site a = f.state[eta-1], b = a;
        float advantage = 0.0f, norm = 0.0f;
        int counter = std::min(finish,eta+3);
        for (int t = eta; t <= finish; ++t) {
            if (a.owner) a.troops += m.growth[i];
            if (b.owner) b.troops += m.growth[i];
            int extra = t == eta ? answering : t == counter ? reserve : 0;
            int friendA = f.friendly[t] + (t == eta ? troops : 0);
            int enemyA = f.hostile[t] + extra;
            a = arrive(a,side == 1 ? friendA : enemyA,side == 1 ? enemyA : friendA);
            b = arrive(b,side == 1 ? f.friendly[t] : enemyA,side == 1 ? enemyA : f.friendly[t]);
            float weight = 1.0f - 0.068f*(t-eta);
            int shift = (a.owner == side) - (a.owner == foe)
                      - (b.owner == side) + (b.owner == foe);
            advantage += weight*shift;
            norm += weight * (b.owner == foe ? 2.0f : 1.0f);
        }
        return std::clamp(advantage/std::max(1.0f,norm),0.0f,1.0f);
    }

    Plan target(int i) const {
        Plan best;
        const auto& f = future[i];
        const bool ours = f.state[0].owner == side;
        if (f.state[end].owner == side) return best;
        const bool isNeutral = f.state[0].owner == 0;
        if (ours && f.firstLoss > end) return best;
        const int reach = std::min(end, isNeutral && f.lastEnemy == 0 ? 18
                                : std::max(8, friendDist[i] + 2) + std::clamp((myGrowth - theirGrowth) / 5, 0, 5));
        const float nodeValue = 12.0f + 7.0f*m.growth[i] + 1.8f*m.frontier[i];
        for (int eta = 2; eta <= reach; ++eta) {
            if (ours && eta > f.firstLoss + 3) break;
            int need = minSource(i, eta);
            if (need == 0) continue;
            const Site before = f.state[eta-1];
            bool defense = ours && f.firstLoss >= eta;
            bool hostile = before.owner == foe || (before.owner == 0 && f.hostile[eta] > 0);
            if (!defense && !hostile && before.owner == side) continue;
            float reaction = hostile ? response(i, eta) : 0;
            float holding = defense ? 0 : threat[i] * 0.80f;
            if (hostile && !defense)
                holding = std::max(holding, 0.30f * pressure[i][std::min(end, eta + 2)]);
            reaction += stream[i][eta];
            if (!hostile) holding *= isNeutral && enemyDist[i] + 1 < friendDist[i] ? 1.0f : 0.4f;
            int borderExtra = 0;
            if (isNeutral && pos.turn <= 12 && future[i].state[eta].owner == 0) {
                int allies = 0, enemies = 0;
                for (int q = 1; q < m.n; ++q) {
                    int j = m.sorted[i][q];
                    int d = m.dist[i][j];
                    if (d > 6) break;
                    int time = std::min(end,eta+2);
                    allies += future[j].state[time].owner == side ? (7-d)*m.growth[j] : 0;
                    enemies += future[j].state[time].owner == foe ? (7-d)*m.growth[j] : 0;
                }
                int distanceBalance = m.dist[m.home[foe]][i] - m.dist[m.home[side]][i];
                if (distanceBalance <= 2 && distanceBalance >= -3)
                    borderExtra = std::clamp(3 + m.growth[i] + (allies-enemies)/8, 0, 12);
            }
            int buffer = std::clamp(int(0.66f * reaction + holding) + borderExtra, 0, 175);
            if (!defense && !hostile) buffer = std::min(buffer, 13);
            int required = need + buffer;
            // A source at distance d can join this wave by departing at eta - d.
            int idx[N]{}, maxUse[N]{};
            float priority[N]{};
            int n = 0, total = 0;
            for (int k = 1; k < m.n; ++k) {
                int j = m.sorted[i][k], d = m.dist[i][j];
                if (d > eta) break;
                int t = eta-d;
                if (t > 7 || movable[j][t] == 0) continue;
                idx[n] = j;
                maxUse[n] = movable[j][t];
                priority[n] = 1.20f*d + 0.32f*t + threat[j]*0.11f
                            - 0.012f*std::min(80, movable[j][t]);
                ++n;
                total += movable[j][t];
            }
            if (total < need) continue;
            if (hostile && !defense && total < need + buffer * 0.60f && eta >= 5) continue;
            Plan plan;
            plan.to = i;
            plan.eta = eta;
            int use = std::min(total, required);
            int left = use;
            float vulnerability = 0;
            int waiting = eta;
            while (left > 0) {
                int key = 0;
                for (int k = 1; k < n; ++k)
                    if (priority[k] < priority[key]) key = k;
                int j = idx[key];
                int depart = eta - m.dist[j][i];
                int take = std::min(left, maxUse[key]);
                left -= take;
                priority[key] = 1.e9f;
                plan.from[plan.n] = j;
                plan.amount[plan.n++] = take;
                vulnerability += threat[j] * take / (22.0f + future[j].state[depart].troops);
                waiting = std::min(waiting, depart);
            }
            float value = nodeValue + bridge[i];
            if (defense) value *= 2.52f + 0.012f*coverage[i];
            else if (hostile) {
                float factor = 1.0f;
                if (readyGrowth >= hostileGrowth+3 && eta > 4) factor *= 0.86f;
                if (myGrowth + 1 < theirGrowth && eta < 5) factor *= 1.16f;
                factor *= std::clamp(1.0f + 0.004f*coverage[i], 0.90f, 1.10f);
                value = (value * 1.53f + 0.28f * need) * factor;
            }
            if (!ours && f.state[end].owner == 0 && pos.turn < 13) {
                int delta = m.dist[m.home[foe]][i] - m.dist[m.home[side]][i];
                value *= 1.0f + 0.018f * std::clamp(delta, -9, 6);
            }
            if (m.end - pos.turn < 30 && !hostile && !defense)
                value *= 0.5f + (m.end - pos.turn) / 60.0f;
            float cost = 10.0f + use + (5.8f*eta + 2.6f*waiting)
                       + vulnerability + 0.77f*reaction + 2.5f*(plan.n-1);
            if (hostile && !defense) cost += 1.3f * std::max(0, eta-4) * std::max(0, eta-4);
            if (isNeutral && !defense && !hostile) cost += contest[i] * (eta < 5 ? 0.25f : 0.65f);
            if (f.firstLoss < eta && ours) cost += 8.0f;
            if (pos.turn <= 11 && !hostile) cost += 1.0f*waiting;
            if (!defense && (hostile || holding > 10.0f) && pos.turn > 5) {
                int answering = int(0.48f*reaction);
                int rescue = !ours ? int(0.82f*holding) : int(0.41f*holding);
                float secure = durability(i,eta,use,answering,rescue);
                value *= 0.59f + 0.41f*secure;
                if (secure < 0.40f && eta > 4 && myGrowth >= theirGrowth-3) continue;
                if (hostile && secure > 0.87f && eta <= 4 && before.owner == foe) {
                    int exchange = std::max(0, before.troops+f.hostile[eta]-f.friendly[eta]);
                    cost -= std::min(0.42f,0.55f-0.06f*eta) * exchange
                          / (1.0f + reaction / (40.0f + exchange*0.10f));
                }
            }
            plan.value = value / cost;
            if (plan.value > best.value) best = plan;
        }
        return best;
    }

    void apply(const Plan& plan, std::vector<Order>& orders) {
        int i = plan.to;
        for (int k = 0; k < plan.n; ++k) {
            int j = plan.from[k], amount = plan.amount[k];
            int delay = plan.eta - m.dist[j][i];
            future[i].friendly[plan.eta] += amount;
            departures[j][delay] += amount;
            forecast(j);
            capacity(j);
            // Future departures guide this turn's allocation and are replanned next turn.
            if (delay == 0) orders.push_back({j, i, amount});
        }
        forecast(i);
        capacity(i);
    }


    // Resolve committed arrivals and extrapolate production from the resulting map.
    int passiveMargin() const {
        int total=0;
        int tail=m.end-pos.turn+1-end;
        for (int i=0;i<m.n;++i) {
            Site q=future[i].state[end];
            int sign=(q.owner==side)-(q.owner==foe);
            total+=sign*(q.troops + tail*m.growth[i]);
            for (int t=end+1;t<=D;++t) total+=pos.flight(side,i,t)-pos.flight(foe,i,t);
        }
        return total;
    }

    // Troops committed to this site are debited at their sources. The only
    // material gain from an even exchange is the production that changes hands.
    float terminalValue(int i, int eta, int forces, int reply, int reinforcements) const {
        const auto& line=future[i];
        Site q=line.state[eta-1];
        int follow=std::min(eta+3,end);
        for (int t=eta;t<=end;++t) {
            if (q.owner) q.troops+=m.growth[i];
            int a=line.friendly[t]+(t==eta?forces:0);
            int b=line.hostile[t]+(t==eta?reply:t==follow?reinforcements:0);
            q=arrive(q,side==1?a:b,side==1?b:a);
            if (q.owner==side) q.troops=std::max(0,q.troops-departures[i][t]);
        }
        const int sign=(q.owner==side)-(q.owner==foe);
        return sign*(q.troops+0.53f*(m.end-pos.turn+1-end)*m.growth[i])-forces;
    }

    Plan closingPlan(int i) const {
        const auto& line=future[i];
        Plan best;
        bool planningEarly=m.end-pos.turn>32;
        int limit=std::min(end,planningEarly?4:7);
        for (int eta=2;eta<=limit;++eta) {
            const Site before=line.state[eta-1];
            int opponents=line.hostile[eta]+(before.owner==foe?before.troops+m.growth[i]:0);
            int ours=line.friendly[eta]+(before.owner==side?before.troops+m.growth[i]:0);
            int neutral=before.owner==0?before.troops:0;
            int threshold=std::max(0,std::max(neutral,opponents)+(before.owner==side?0:1)-ours);
            if (!threshold) continue;
            int stock=0;
            for (int k=1;k<m.n;++k) {
                int j=m.sorted[i][k],d=m.dist[i][j];
                if (d>eta) break;
                if (d==eta && future[j].firstLoss>end) stock+=movable[j][0];
            }
            if (stock<threshold) continue;
            float shock=0, following=0;
            for (int k=1;k<m.n;++k) {
                int j=m.sorted[i][k],d=m.dist[i][j];
                if (d>6) break;
                Site defender=future[j].state[std::max(0,eta-1-d)];
                if (defender.owner!=foe) continue;
                if (d<eta) shock+=defender.troops*(d==2?0.55f:0.31f);
                following=std::max(following,defender.troops*(d==2?0.43f:0.18f));
            }
            float plain=terminalValue(i,eta,0,0,0);
            int interference=int(shock+stream[i][eta]*0.60f);
            int counter=int(following*(planningEarly?1.35f:1.0f));
            float challenged=terminalValue(i,eta,0,interference,counter);
            for (int extra : {0,interference,interference+counter}) {
                int size=threshold+extra;
                if (size>stock) continue;
                float safe=terminalValue(i,eta,size,0,0)-plain;
                float tested=terminalValue(i,eta,size,interference,counter)-challenged;
                if (safe<4 || tested<(planningEarly?8.0f:-1.0f)) continue;
                float worth=0.56f*safe+0.44f*tested;
                if (worth<11) continue;
                Plan plan;
                plan.to=i;
                plan.eta=eta;
                int left=size;
                for (int k=1;k<m.n && left>0;++k) {
                    int j=m.sorted[i][k],d=m.dist[i][j];
                    if (d>eta) break;
                    if (d!=eta || future[j].firstLoss<=end) continue;
                    int take=std::min(left,movable[j][0]);
                    if (!take) continue;
                    plan.from[plan.n]=j;
                    plan.amount[plan.n++]=take;
                    left-=take;
                    worth-=threat[j]*take/(12.0f+future[j].state[0].troops)*0.48f;
                }
                plan.value=worth/(1.0f+0.065f*eta+(planningEarly?0.006f:0.0013f)*size);
                if (plan.value>best.value) best=plan;
            }
        }
        return best;
    }

    // Try to change a losing forecast once the front has settled, or while
    // there are only a few turns left to earn extra production.
    void closeGame(std::vector<Order>& out) {
        const bool planningEarly=m.end-pos.turn>32;
        if (end<2 || (planningEarly && (quiet<13 || pos.turn<54))) return;
        int margin=passiveMargin();
        if (margin > (planningEarly ? -35 : 30) || margin < (planningEarly ? -1250 : -640)) return;
        for (int k=0;k<(planningEarly?1:3);++k) {
            Plan best;
            for (int i=0;i<m.n;++i) {
                if (assigned[i]) continue;
                auto p=closingPlan(i);
                if (p.value>best.value) best=p;
            }
            if (best.value<(planningEarly?20.0f:10.0f)) break;
            assigned[best.to]=true;
            apply(best,out);
            if (passiveMargin()>70) break;
        }
    }

    void reinforceFront(std::vector<Order>& orders) {
        if (pos.turn < 4 || end < 3) return;
        float opportunity[N]{};
        for (int i = 0; i < m.n; ++i) {
            if (future[i].state[end].owner != side) continue;
            for (int k = 1; k < m.n; ++k) {
                int j = m.sorted[i][k], d = m.dist[i][j];
                if (d > 8) break;
                if (future[j].state[end].owner == side) continue;
                float value = (10-d)*(3.0f + 0.8f*m.growth[j]) / (d+2.0f);
                value *= 0.60f + 28.0f / (28.0f + future[j].state[std::min(end,d)].troops);
                if (future[j].state[end].owner == 0) value *= 0.68f;
                opportunity[i] = std::max(opportunity[i], value);
            }
        }
        for (int i = 0; i < m.n; ++i) {
            if (future[i].state[0].owner != side || movable[i][0] <= 0) continue;
            int surplus = movable[i][0];
            if (future[i].state[end].owner == side) {
                for (int t = 1; t < std::min(8,end); ++t)
                    if (departures[i][t]) surplus = std::min(surplus, movable[i][t]);
            }
            int best = -1;
            float top = 0.0f;
            for (int k = 1; k < m.n; ++k) {
                int j = m.sorted[i][k], d = m.dist[i][j];
                if (d > end || d > 14) break;
                if (future[j].state[std::min(end,d+1)].owner != side
                    || future[j].state[end].owner != side) continue;
                int progress = enemyDist[i] - enemyDist[j];
                float value = 2.45f * progress - 0.92f * d + (opportunity[j]-opportunity[i])*0.35f;
                value += std::min(5.0f, threat[j]*0.24f) - std::min(7.5f, threat[i]*0.35f);
                value += std::min(12.0f, urgency[j]*0.35f) / (1.0f + d*0.15f);
                if (future[i].state[end].owner != side) value += 12.0f;
                if (future[j].state[0].owner != side) value -= 1.5f;
                if (enemyDist[i] <= 5 && progress <= 1 && future[i].state[end].owner == side
                    && (urgency[j] < 16 || urgency[i] > 5 || surplus < 12)) continue;
                if (enemyDist[j] > 10) value -= 2.5f;
                if (value > top) {
                    best = j;
                    top = value;
                }
            }
            if (best < 0 || top < 1.0f) continue;
            if (pos.turn < 13 && enemyDist[i] > 5 && future[i].state[end].owner == side) {
                int wanted = 0;
                for (int k = 1; k < m.n; ++k) {
                    int j = m.sorted[i][k];
                    if (m.dist[i][j] > 8) break;
                    if (future[j].state[end].owner == 0)
                        wanted = std::max(wanted, std::min(16, future[j].state[end].troops+1));
                }
                surplus -= wanted;
            }
            if (surplus <= 0) continue;
            Plan p;
            p.to = best;
            p.eta = m.dist[i][best];
            p.n = 1;
            p.from[0] = i;
            p.amount[0] = surplus;
            apply(p, orders);
        }
    }

public:
    Scheduler(const Position& p, int who, const Intel& observations, int quietTurns)
        : pos(p), m(*p.map), side(who), foe(3-who),
          end(std::min(D, m.end - p.turn + 1)), intel(observations), quiet(quietTurns) {
        for (int i = 0; i < m.n; ++i) {
            if (pos.site[i].owner == side) myGrowth += m.growth[i];
            else if (pos.site[i].owner == foe) theirGrowth += m.growth[i];
            for (int t = 1; t <= end; ++t) {
                future[i].friendly[t] = pos.flight(side,i,t);
                future[i].hostile[t] = pos.flight(foe,i,t);
            }
            forecast(i);
        }
        for (int i = 0; i < m.n; ++i) {
            auto q = future[i].state[std::min(end,6)];
            if (q.owner == side) readyGrowth += m.growth[i];
            if (q.owner == foe) hostileGrowth += m.growth[i];
        }
        for (int i = 0; i < m.n; ++i) {
            enemyDist[i] = friendDist[i] = D+1;
            float sum = 0, peak = 0;
            for (int k = 1; k < m.n; ++k) {
                int j = m.sorted[i][k], d = m.dist[i][j];
                if (pos.site[j].owner == side) friendDist[i] = std::min(friendDist[i], d);
                Site q = future[j].state[std::min(end,2)];
                if (pos.site[j].owner != foe && q.owner != foe) continue;
                enemyDist[i] = std::min(enemyDist[i], d);
                if (d > 6 || d > end) continue;
                float amount = std::max(0, pos.site[j].owner == foe ? pos.site[j].troops - d*m.growth[i] : 0)
                             * (7-d) / 9.0f;
                sum += amount;
                peak = std::max(peak, amount);
            }
            if (pos.turn <= 24) {
                for (int k = 1; k < m.n; ++k) {
                    int j = m.sorted[i][k], d = m.dist[i][j];
                    if (d > 7) break;
                    Site q = future[j].state[std::min(end,7)];
                    if (q.owner == side) coverage[i] += (8-d) * 0.22f*m.growth[j];
                    if (q.owner == foe) coverage[i] -= (8-d) * 0.23f*m.growth[j];
                    if (q.owner != 0 || d > 6) continue;
                    int next = D+1;
                    for (int l = 1; l < m.n; ++l) {
                        int k2 = m.sorted[j][l];
                        if (future[k2].state[std::min(end,6)].owner == side) {
                            next = m.dist[j][k2];
                            break;
                        }
                    }
                    bridge[i] += std::clamp(next-d,0,6) * m.growth[j] * (7-d)
                                 / (4.0f + 0.12f*future[j].state[0].troops);
                }
                bridge[i] = std::min(16.0f, bridge[i] * (25-pos.turn) / 24.0f);
                int disadvantage = m.dist[m.home[side]][i] - m.dist[m.home[foe]][i];
                if (pos.turn <= 10) contest[i] = std::max(0, disadvantage - 1) * 2.0f;
            }
            float projected = 0.0f;
            int guardWindow = std::min(end, 8);
            for (int t = 2; t <= guardWindow; ++t) {
                float peakLater = 0, mass = 0, relief = 0;
                for (int k = 1; k < m.n; ++k) {
                    int j = m.sorted[i][k], d = m.dist[i][j];
                    if (d > t) break;
                    const Site q = future[j].state[t-d];
                    float w = (9-d) / 8.0f;
                    if (q.owner == foe) {
                        float direct = w * q.troops;
                        peakLater = std::max(peakLater, direct);
                        mass += direct;
                    } else if (q.owner == side && d < t) {
                        relief += w * std::min(20, q.troops) * 0.35f;
                    }
                }
                float known = std::max(0, future[i].state[t].troops - future[i].state[0].troops);
                float exposure = std::max(0.0f, 0.65f * peakLater + 0.24f * mass - known - relief);
                pressure[i][t] = exposure;
                projected = std::max(projected, exposure / (0.38f * t + 0.25f));
            }
            threat[i] = std::min(115.0f, (0.55f*peak + 0.28f*sum + 0.61f*projected));
            if (pos.site[i].owner == side) {
                const int t = std::min(5,end);
                urgency[i] = std::max(0.0f, threat[i] - future[i].state[t].troops * 0.78f);
            }
            if (pos.site[i].owner == foe) {
                for (int j = 0; j < m.n; ++j) {
                    if (j == i || pos.site[j].owner != foe) continue;
                    int d = m.dist[j][i];
                    const float rate = intel.rate[j][i];
                    if (rate < 0.45f) continue;
                    for (int t = d; t <= end; ++t)
                        stream[i][t] += rate * std::min(5, t-d+1);
                }
            }
            capacity(i);
        }
    }

    std::vector<Order> orders() {
        std::vector<Order> out;
        out.reserve(m.n);
        closeGame(out);
        for (int k = 0; k < m.n; ++k) {
            Plan best;
            for (int i = 0; i < m.n; ++i) {
                if (assigned[i]) continue;
                auto p = target(i);
                if (p.value > best.value) best = p;
            }
            float minimum = pos.turn <= 12 ? 0.20f : myGrowth < theirGrowth ? 0.34f : 0.44f;
            if (best.value < minimum) break;
            assigned[best.to] = true;
            apply(best, out);
        }
        reinforceFront(out);
        return out;
    }
};


// Compare affordable opening groups by early production and mutual reinforcement.
std::vector<Order> openingGroup(const Position& p) {
    const Map& m = *p.map;
    const int home = m.home[1];
    const int opponentHome = m.home[2];
    struct Choice {
        int node;
        int cost;
        float value;
    };
    std::vector<Choice> choices;
    for (int i = 2; i < m.n; ++i) {
        const int travel = m.dist[home][i];
        const int theirTravel = m.dist[opponentHome][i];
        if (travel > 15 || travel > theirTravel + 5) continue;

        const int defenders = p.site[i].troops;
        float onwardAccess = 0;
        for (int k = 1; k < m.n; ++k) {
            const int j = m.sorted[i][k];
            const int nearby = m.dist[i][j];
            if (nearby > 6) break;
            if (j < 2 || m.dist[home][j] + 2 < travel ||
                m.dist[opponentHome][j] + 4 < m.dist[home][j]) continue;
            const float difficulty = 12 + p.site[j].troops + 3 * nearby;
            onwardAccess += (7 - nearby) * m.growth[j] / difficulty;
        }
        const float distancePremium = std::clamp((theirTravel - travel) * 0.033f,
                                                 -0.20f, 0.24f);
        const int reserve = std::abs(travel - theirTravel) <= 1 && travel >= 6 ? 3 : 0;
        const float production = (17.0f - travel) * m.growth[i] * (1.0f + distancePremium);
        const float value = production + 11.0f * onwardAccess - (0.51f * defenders + 0.20f * reserve);
        if (value > 0) choices.push_back({i, defenders + 1 + reserve, value});
    }

    const int count = static_cast<int>(choices.size());
    float support[N][N]{};
    for (int a = 0; a < count; ++a) {
        for (int b = 0; b < a; ++b) {
            const int i = choices[a].node;
            const int j = choices[b].node;
            const int travel = m.dist[i][j];
            if (travel <= 7)
                support[a][b] = 0.30f * std::max(0, 7 - travel) * std::min(m.growth[i], m.growth[j]);
            // Both mirrored sites put the same initial army into two opposing fronts.
            if ((i ^ 1) == j)
                support[a][b] -= 0.38f * std::min(choices[a].value, choices[b].value);
        }
    }

    int chosen[N]{};
    int best[N]{};
    int bestCount = 0;
    float bestScore = 0;
    auto enumerate = [&](auto&& self, int first, int depth, int remaining, float score) -> void {
        if (score > bestScore) {
            bestScore = score;
            bestCount = depth;
            std::copy_n(chosen, depth, best);
        }
        for (int i = first; i < count; ++i) {
            const auto& candidate = choices[i];
            if (candidate.cost > remaining) continue;
            float added = candidate.value - 0.62f * candidate.cost;
            for (int k = 0; k < depth; ++k) added += support[i][chosen[k]];
            chosen[depth] = i;
            self(self, i + 1, depth + 1, remaining - candidate.cost, score + added);
        }
    };
    enumerate(enumerate, 0, 0, p.site[home].troops, 0.0f);

    std::vector<Order> orders;
    orders.reserve(bestCount);
    for (int i = 0; i < bestCount; ++i) {
        const auto& site = choices[best[i]];
        orders.push_back({home, site.node, site.cost});
    }
    return orders;
}

}  // namespace

std::vector<Order> decide(const State& s) {
    static Map map(s);
    if (s.turn == 1) map = Map(s);
    Position p(map, s);
    static Intel intel;
    intel.observe(s);
    if (s.turn == 1) {
        auto chosen = openingGroup(p);
        if (!chosen.empty()) return chosen;
    }
    static int previousOwner[N]{};
    static int lastOwnershipChange = 1;
    if (s.turn == 1) lastOwnershipChange = 1;
    for (int i = 0; i < map.n; ++i) {
        if (previousOwner[i] != p.site[i].owner) lastOwnershipChange = s.turn;
        previousOwner[i] = p.site[i].owner;
    }
    return Scheduler(p, 1, intel, s.turn - lastOwnershipChange).orders();
}

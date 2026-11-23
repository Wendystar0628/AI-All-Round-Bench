#include "engine.hpp"
#include <algorithm>
#include <array>
#include <cmath>
#include <vector>
#include <chrono>

namespace {
constexpr int N=24, T=28;
struct Cell { int p,v; };
struct Path {
    int g, in[T+1][3]{}, send[T+1]{}, safe[T+1]{};
    Cell st[T+1]{};
    void simulate(int h) {
        for(int t=1;t<=h;++t) {
            auto [p,v]=st[t-1];
            v+=p ? g-send[t-1] : 0;
            int a=in[t][1], b=in[t][2];
            if(a+b){
                if(p==1)a+=v;
                if(p==2)b+=v;
                int c=p?0:v;
                if(a>b && a>c){p=1;v=a-std::max(b,c);}
                else if(b>a && b>c){p=2;v=b-std::max(a,c);}
                else if(c>a && c>b){p=0;v=c-std::max(a,b);}
                else v=0;
            }
            st[t]={p,v};
        }
        int spare=100000;
        for(int t=h;t>=0;--t) {
            if(st[t].p!=1)spare=0;
            else spare=std::min(spare,st[t].v-send[t]);
            safe[t]=std::max(0,spare);
        }
    }
};
struct Part{int src,wait,num;};
struct Plan{
    int dst=-1, at=0, count=0;
    double score=0;
    Part parts[N];
};
struct Brain{
    const State &s;
    int n,h,left,style=0;
    Path tr[N]{};
    int d[N][N], sorted[N][N], guard[N]{};
    double strategic[N]{},outlook=0; int lead=0;
    bool used[N]{};
    std::vector<Order> orders;
    Brain(const State& state):s(state),n(s.nodes.size()),h(std::min(T,s.max_turns-s.turn+1)),left(s.max_turns-s.turn+1){
        for(auto f:s.fleets)if(f.turns_left<=h)tr[f.to].in[f.turns_left][f.owner]+=f.troops;
        for(int i=0;i<n;++i){
            auto node=s.nodes[i];
            tr[i].st[0]={node.owner,node.troops};
            tr[i].g=node.growth;
            tr[i].simulate(h);
            for(int j=0;j<n;++j){d[i][j]=s.dist[i][j];sorted[i][j]=j;}
            std::sort(sorted[i],sorted[i]+n,[&](int a,int b){return d[i][a]<d[i][b];});
        }
        for(auto f:s.fleets)outlook+=(f.owner==1?1:-1)*f.troops;
        for(int i=0;i<n;++i){
            auto node=s.nodes[i];
            int sign=(node.owner==1)-(node.owner==2);
            outlook+=node.troops*sign;
            auto &target=tr[i];
            for(int t=1;t<=h;++t){
                auto z=target.st[t];
                int own=(z.p==1)-(z.p==2);
                outlook+=own*node.growth;
                if(!target.st[t-1].p && z.p)outlook-=own*target.st[t-1].v;
            }
            lead+=((target.st[h].p==1)-(target.st[h].p==2))*node.growth;
        }
        outlook+=lead*std::min(45,left-h);
        for(int i=0;i<n;++i){
            double danger=0, cover=0,links=0;
            int closest=30;
            for(int k=1;k<n;++k){
                int j=sorted[i][k],dist=d[i][j];auto nd=s.nodes[j];
                if(nd.owner==2){
                    closest=std::min(closest,dist);
                    danger=std::max(danger, double(nd.troops-dist*tr[i].g)*std::max(0.,1.-0.065*(dist-2)));
                }else if(nd.owner==1 && dist<=closest)cover+=.55*tr[j].safe[0];
                if(nd.owner!=1)links+=nd.growth/(2.+dist*dist*.13);
            }
            guard[i]=(int)std::max(0.,std::min(danger*.68-cover,.7*s.nodes[i].troops));
            strategic[i]=1.+.022*std::min(12.,links);
        }
    }
    double power[N][T+1]{};
    int enemyNear[N]{};
    void influence(){
        for(int j=0;j<n;++j){
            enemyNear[j]=25;
            for(int m=0;m<n;++m)if(m!=j && s.nodes[m].owner==2)
                enemyNear[j]=std::min(enemyNear[j],d[m][j]);
            for(int t=1;t<=h;++t)for(int k=1;k<n;++k){
                int m=sorted[j][k],dt=t-d[j][m];
                if(dt<0)break;
                Cell cell=tr[m].st[dt];
                if(cell.p!=2)continue;
                power[j][t]+=cell.v*(dt==0?.58:1.);
            }
        }
    }
    Plan best(){
        Plan best;
        for(int j=0;j<n;++j){
            if(used[j])continue;
            auto &target=tr[j];
            if(target.st[h].p==1)continue;
            bool defend=target.st[0].p==1;
            int maxT=std::min(h,21);
            for(int t=2;t<=maxT;++t){
                auto [p,v]=target.st[t];
                if(p==1 && !defend)continue;
                int hold=0,balance=0;
                for(int u=t+1;u<=h;++u){
                    balance+=target.g+target.in[u][1]-target.in[u][2];
                    hold=std::max(hold,-balance);
                }
                auto prev=target.st[t-1];
                int a=target.in[t][1],b=target.in[t][2],c=0;
                if(prev.p==1)a+=prev.v+target.g;
                else if(prev.p==2)b+=prev.v+target.g;
                else c=prev.v;
                int need=std::max(1,std::max(b,c)-a+(prev.p!=1)+hold);
                // Estimate the opposing response both on arrival and over the next exchanges.
                double threat=power[j][t]*(s.turn==1?.75:.82);
                double follow=power[j][std::min(h,t+4)]*.70-4*target.g;
                threat=std::max(threat,follow);
                if(style==2)threat*=.56;
                if(style==3)threat*=1.18;
                int want=need+std::max(0,(int)(threat-hold));
                Plan plan;plan.at=t;plan.dst=j;
                double cost=0;
                int cnt=0, available=0,now=0;
                for(int k=1;k<n;++k){
                    int i=sorted[j][k],dt=d[i][j],w=t-dt;
                    if(w<0)break;
                    if(w>5 || tr[i].st[w].p!=1 || (w && tr[i].st[0].p!=1))continue;
                    int free=std::max(0,tr[i].safe[w]-guard[i]);
                    available+=free;
                    int num=std::min(free,want-cnt);
                    if(num<=0)continue;
                    plan.parts[plan.count++]={i,w,num};
                    if(!w)now+=num;
                    cost+=num*(.45+.09*dt+.28*w);
                    cnt+=num;
                }
                if(cnt<need)continue;
                double shortfall=std::max(0,want-available);
                double value=target.g*(std::min(34,left-t))*(p==2?1.50:1.);
                if(defend)value*=1.8;
                if(p==0)value-=target.st[0].v*.92;
                if(defend && p==1 && target.st[t].p!=target.st[h].p)value*=1.05;
                double score=strategic[j]*value/(13.+cost+3.8*t+shortfall*2.);
                double prob=1./(1.+shortfall/(6.+.26*available));
                score*=prob;
                if(p==0 && enemyNear[j]<=t+2 && target.st[h].p==0){
                    double squeeze=std::max(0.,(t+3.-enemyNear[j])/5.);
                    score/=1.+1.5*squeeze;
                }
                if(s.turn<45 && p==2 && !defend && target.st[0].p!=0)
                    score*=.76;
                if(style==2 && p==2)score*=1.22;
                if(style==3 && p==0)score*=1.25;
                if(now==0)score*=.91;
                if(score>best.score && score>.22){plan.score=score;best=plan;}
            }
        }
        return best;
    }
    void apply(const Plan& p){
        used[p.dst]=true;
        for(int k=0;k<p.count;++k){
            auto [i,w,num]=p.parts[k];
            if(!w)orders.push_back({i,p.dst,num});
            tr[i].send[w]+=num;
            tr[i].simulate(h);
            tr[p.dst].in[p.at][1]+=num;
        }
        tr[p.dst].simulate(h);
    }
    void develop(){
        // Price a small neutral expedition relative to the reserve left at home.
        // A distant enemy reserve need not be matched ship for ship when a nearby
        // friendly army can counterattack several turns sooner.
        Plan best;
        for(int j=0;j<n;++j){
            if(used[j] || tr[j].st[h].p!=0 || s.nodes[j].owner!=0)continue;
            int g=tr[j].g,v=tr[j].st[0].v;
            int pool=0;double near=0;
            for(int k=1;k<n;++k){
                int i=sorted[j][k],t=d[i][j];
                if(t>=h || left<t+6+v/g)break;
                if(s.nodes[i].owner!=1)continue;
                int free=std::max(0,tr[i].safe[0]-guard[i]/2);
                near+=free/(1.+.12*t*t);
                int budget=std::max(0,int((free-6)*.42));
                if(budget<=0)continue;
                pool+=budget;
                if(pool<v+1)continue;
                int extra=std::min(pool-v-1, int(std::min(v+12.,power[j][std::min(h,t+3)]*.25)));
                int count=v+1+extra;
                if(count<=pool-budget)continue;
                double en=0;
                for(int m=0;m<n;++m)if(s.nodes[m].owner==2)
                    en+=s.nodes[m].troops/(1.+.12*d[j][m]*d[j][m]);
                double control=(near+3.)/(en+near+6.);
                double score=(.55+control)*g/(v+count*.20+2.*t+3.)*
                            (1.+.07*std::clamp(enemyNear[j]-t,-7,7));
                if(control<.34 && enemyNear[j]<t+2)continue;
                if(score<=best.score)continue;
                Plan z;z.dst=j;z.score=score;
                for(int l=1;l<=k && count;++l){
                    int m=sorted[j][l];
                    int q=std::min(count,std::max(0,int((tr[m].safe[0]-guard[m]/2-6)*.42)));
                    if(!q)continue;
                    z.parts[z.count++]={m,0,q};count-=q;
                }
                best=z;
            }
        }
        if(best.dst<0)return;
        used[best.dst]=true;
        for(int k=0;k<best.count;++k){
            auto [i,w,num]=best.parts[k];orders.push_back({i,best.dst,num});
            tr[i].send[0]+=num;tr[i].simulate(h);
            tr[best.dst].in[d[i][best.dst]][1]+=num;
        }
        tr[best.dst].simulate(h);
    }
    void raids(){
        // Put a fraction of a large reserve into independent threats. A central enemy
        // stack can answer any one of them, but cannot answer them all at once.
        int budget[N]{};
        int pool=0;
        for(int i=0;i<n;++i){
            int free=tr[i].safe[0]-guard[i]/2;
            budget[i]=std::max(0,int((free-15)*.54));
            pool+=budget[i];
        }
        if(pool<25)return;
        for(int pass=0;pass<n;++pass){
            Plan best;
            for(int j=0;j<n;++j){
                if(used[j] || tr[j].st[h].p==1)continue;
                int supply=0;
                for(int k=1;k<n;++k){
                    int i=sorted[j][k],t=d[j][i];
                    if(t>=h)break;
                    if(!budget[i])continue;
                    supply+=budget[i];
                    auto [p,v]=tr[j].st[t];
                    if(p==1)continue;
                    int hold=0,bal=0;
                    for(int u=t+1;u<=h;++u){
                        bal+=tr[j].g+tr[j].in[u][1]-tr[j].in[u][2];
                        hold=std::max(hold,-bal);
                    }
                    int need=v+1+hold;
                    int num=std::min(supply,need+int(std::min(need*.55+6,power[j][t]*.55)));
                    if(supply<need)continue;
                    double reach=1./(1.+.16*std::max(0,t-enemyNear[j]));
                    double gain=tr[j].g*std::min(left-t,35)*(p==2?1.75:1.);
                    if(p==0)gain-=v*(1.2+.5*(1-reach));
                    double score=gain*reach/(14+num*.56+t*3);
                    if(score<=best.score)continue;
                    Plan z;z.dst=j;z.at=t;z.score=score;
                    for(int l=1;l<=k && num;++l){
                        int m=sorted[j][l],q=std::min(budget[m],num);
                        if(q){z.parts[z.count++]={m,0,q};num-=q;}
                    }
                    best=z;
                }
            }
            if(best.dst<0)break;
            used[best.dst]=true;
            for(int k=0;k<best.count;++k){
                auto [i,w,q]=best.parts[k];
                budget[i]-=q;
                orders.push_back({i,best.dst,q});
                tr[i].send[0]+=q;
                tr[i].simulate(h);
                tr[best.dst].in[d[i][best.dst]][1]+=q;
            }
            tr[best.dst].simulate(h);
        }
    }
    void stage(){
        double front[N];
        for(int i=0;i<n;++i){
            front[i]=100;
            for(int j=0;j<n;++j){
                if(tr[j].st[h].p==2)front[i]=std::min(front[i],double(d[i][j]));
                if(tr[j].st[h].p==0 && left>18)front[i]=std::min(front[i],d[i][j]+3.5+tr[j].st[h].v/(2.+tr[j].g)*.22);
            }
        }
        for(int i=0;i<n;++i){
            if(s.nodes[i].owner!=1)continue;
            int free=tr[i].safe[0]-guard[i];
            if(free<=0)continue;
            double best=0;int dest=-1;
            for(int j=0;j<n;++j){
                int dist=d[i][j];
                if(dist>h || tr[j].st[dist].p!=1 || tr[j].st[h].p!=1)continue;
                double diff=front[i]-front[j];
                double sc=(diff-.34*dist)/(.9+dist);
                if(sc>best){best=sc;dest=j;}
            }
            if(dest>=0){
                int via=dest, best=d[i][dest];
                for(int j=0;j<n;++j){
                    if(j==i || s.nodes[j].owner!=1 || tr[j].st[h].p!=1)continue;
                    if(d[i][j]+d[j][dest]<=d[i][dest] && d[i][j]<best){
                        via=j;best=d[i][j];
                    }
                }
                orders.push_back({i,via,free});
            }
        }
    }
    std::vector<Order> run(int mode=0,bool explore=false){
        style=mode;
        influence();for(int k=0;k<n;++k){auto p=best();if(p.dst<0)break;apply(p);}
        if(explore && s.turn>=14)develop();
        if(s.turn>12 && (style==1 || style==2 || (style==0 && (outlook<-(s.turn<40?55:0) || (s.turn>40 && lead<0)))))raids();stage();return orders;
    }
};
using Orders=std::vector<Order>;
using Clock=std::chrono::steady_clock;

double position(const State& s){
    int tot=0,growth=0;
    double spatial=0;
    Path tr[N]{};
    int h=std::min(17,std::max(0,s.max_turns-s.turn+1));
    for(auto f:s.fleets){
        tot+=(f.owner==1?1:-1)*f.troops;
        if(f.turns_left<=h)tr[f.to].in[f.turns_left][f.owner]+=f.troops;
    }
    int delta=0;
    for(int j=0;j<(int)s.nodes.size();++j){
        auto node=s.nodes[j];
        tr[j].st[0]={node.owner,node.troops};
        tr[j].g=node.growth;tr[j].simulate(h);
        int sign=(node.owner==1)-(node.owner==2);
        tot+=sign*node.troops;
        growth+=sign*node.growth;
        auto &q=tr[j];
        for(int t=1;t<=h;++t){
            delta+=((q.st[t].p==1)-(q.st[t].p==2))*node.growth;
            if(q.st[t-1].p==0 && q.st[t].p)delta-=((q.st[t].p==1)?1:-1)*q.st[t-1].v;
        }
        auto last=q.st[h];
        spatial+=((last.p==1)-(last.p==2))*node.growth;
    }
    return tot+.74*delta+std::min(std::max(0,s.max_turns-s.turn+1-h),16)*(.68*spatial+.32*growth);
}

struct Option {Orders moves;double prior;};
bool same(const Orders& a,const Orders& b){
    if(a.size()!=b.size())return false;
    for(int i=0;i<(int)a.size();++i)if(a[i].from!=b[i].from || a[i].to!=b[i].to || a[i].troops!=b[i].troops)return false;
    return true;
}
void add(std::vector<Option>& options,Orders a,double prior){
    std::sort(a.begin(),a.end(),[](auto x,auto y){
        return x.from!=y.from?x.from<y.from:(x.to!=y.to?x.to<y.to:x.troops<y.troops);
    });
    for(auto &c:options)if(same(c.moves,a))return;
    options.push_back({a,prior});
}
State issued(State s,const Orders& moves,int player,double fraction){
    for(auto o:moves){
        int k=std::min(s.nodes[o.from].troops,int(o.troops*fraction+.5));
        if(k==0)continue;
        s.nodes[o.from].troops-=k;
        s.fleets.push_back({player,k,o.from,o.to,s.dist[o.from][o.to]});
    }
    return s;
}
double forecast(State s,int mode,int ticks){
    double shortTerm=position(s);
    int count=std::min(ticks,s.max_turns-s.turn+1);
    for(int t=0;t<count;++t){
        if(t%2==0){
            auto a=Brain(s).run(0);
            auto b=Brain(flip(s)).run(mode);
            s=step(s,a,b);
        }else s=step(s,{},{});
    }
    return .68*position(s)+.32*shortTerm;
}
struct BuildOrder{
    // bal[i][w] is the spending power of a colony at the start of turn w.
    static constexpr int H=19;
    int bal[N][H+1]{}, birth[N]{}, now[N]{};
    unsigned mask=0;
    double value=0;
};
Orders buildOpening(const State& s){
    const int n=s.nodes.size(), home=s.nodes[0].owner==1?0:1, enemy=home^1;
    constexpr int H=BuildOrder::H;
    BuildOrder init;
    for(int i=0;i<n;++i)init.birth[i]=H+1;
    init.birth[home]=0;
    for(int t=0;t<=H;++t)init.bal[home][t]=100+t*5;
    std::vector<BuildOrder> beam{init};
    BuildOrder best=init;
    int order[N][N];
    for(int j=2;j<n;++j){
        for(int i=0;i<n;++i)order[j][i]=i;
        std::stable_sort(order[j],order[j]+n,[&](int a,int b){return s.dist[a][j]<s.dist[b][j];});
    }
    for(int dep=0;dep<10;++dep){
        std::vector<BuildOrder> next;
        for(auto &plan:beam)for(int j=2;j<n;++j){
            if(plan.birth[j]<=H)continue;
            int own=s.dist[home][j],op=s.dist[enemy][j];
            if(op<own-1)continue;
            auto node=s.nodes[j];
            for(int t=2;t<=H;++t){
                int left=node.troops+1,src[N],amount[N],cnt=0;
                for(int k=1;k<n && left;++k){
                    int m=order[j][k],w=t-s.dist[m][j];
                    if(w<0)break;
                    if(plan.birth[m]>w)continue;
                    int avail=*std::min_element(plan.bal[m]+w,plan.bal[m]+H+1);
                    if(avail<=0)continue;
                    int num=std::min(avail,left);
                    src[cnt]=m;amount[cnt++]=num;left-=num;
                }
                if(left)continue;
                double safety=std::clamp(.64+.075*(op-own),.3,1.);
                if(op<=t+1 && own>7)safety*=.90;
                double value=(30.-t)*node.growth*safety-node.troops*(.82+.55*(1.-safety));
                if(value<=0)break;
                auto p=plan;p.value+=value;p.mask|=1u<<j;p.birth[j]=t;
                for(int k=0;k<cnt;++k){
                    int m=src[k],w=t-s.dist[m][j];
                    for(int u=w;u<=H;++u)p.bal[m][u]-=amount[k];
                    if(!w)p.now[j]+=amount[k];
                }
                for(int u=t;u<=H;++u)p.bal[j][u]=1+(u-t)*node.growth;
                next.push_back(p);
                if(p.value>best.value)best=p;
                break;
            }
        }
        if(next.empty())break;
        std::stable_sort(next.begin(),next.end(),[](const auto&a,const auto&b){return a.value>b.value;});
        beam.clear();
        for(auto& p:next){
            bool unique=true;
            for(auto& q:beam)if(q.mask==p.mask){unique=false;break;}
            if(unique)beam.push_back(p);
            if(beam.size()==35)break;
        }
    }
    Orders a;
    for(int i=2;i<n;++i)if(best.now[i])a.push_back({home,i,best.now[i]});
    return a;
}
Orders searchMoves(const State& s){
    auto start=Clock::now();
    Orders base=Brain(s).run(0);
    std::vector<Option> options;
    add(options,base,0);
    State opp=flip(s);
    Orders enemy=Brain(opp).run(0);
    Orders alt=Brain(opp).run(2);
    add(options,Brain(issued(s,enemy,2,.77)).run(0),5);
    add(options,Brain(s).run(2),6);
    add(options,Brain(s).run(3),5);
    add(options,Brain(issued(s,alt,2,.8)).run(1),8);
    Orders hold;
    for(auto o:base){
        bool friendly=s.nodes[o.to].owner==1;
        for(auto f:s.fleets)if(f.owner==1 && f.to==o.to && f.troops>s.nodes[o.to].troops)friendly=true;
        if(friendly)hold.push_back(o);
    }
    add(options,hold,14);
    if(options.size()==1)return base;
    double high=-1e30;Orders answer=base;
    for(auto &opt:options){
        auto one=step(s,opt.moves,enemy);
        double val=forecast(one,0,16);
        Orders response=Brain(issued(opp,opt.moves,2,.8)).run(2);
        auto two=step(s,opt.moves,response);
        double other=forecast(two,2,12);
        val=.42*val+.34*other+.24*std::min(val,other)-opt.prior;
        if(val>high){high=val;answer=opt.moves;}
        if(Clock::now()-start>std::chrono::milliseconds(22))break;
    }
    return answer;
}
Orders selectOpening(const State &s){
    Orders beam=buildOpening(s);
    std::vector<Option> ours;
    add(ours,beam,0);add(ours,Brain(s).run(0),0);
    int home=s.nodes[0].owner==1?0:1,opp=home^1;
    Orders patient;
    for(auto o:beam){
        int d=s.dist[o.from][o.to],e=s.dist[opp][o.to];
        if((d<=7 && e>=d+4) || (e>=d+6 && o.troops<=35))
            patient.push_back(o);
    }
    add(ours,patient,2);
    if(ours.size()==1)return beam;
    std::vector<Option> enemyPlans;
    for(auto& a:ours){
        Orders enemy;
        for(auto o:a.moves)enemy.push_back({opp,o.to^1,o.troops});
        add(enemyPlans,enemy,0);
    }
    std::vector<std::pair<double,int>> rank;
    for(int j=2;j<(int)s.nodes.size();++j){
        int d=s.dist[j][opp],e=s.dist[j][home];
        auto q=s.nodes[j];
        if(d>e+1)continue;
        rank.push_back({q.growth/(q.troops+5.+2.4*d)/(1.+.08*d),j});
    }
    std::sort(rank.rbegin(),rank.rend());int budget=100;
    Orders greedy;
    for(auto [value,j]:rank)if(s.nodes[j].troops<budget){
        budget-=s.nodes[j].troops+1;greedy.push_back({opp,j,s.nodes[j].troops+1});
    }
    add(enemyPlans,greedy,0);
    auto start=Clock::now();
    double high=-1e30;Orders best=beam;
    for(auto &a:ours){
        double sum=0,low=1e30;
        for(auto &b:enemyPlans){
            double v=0;
            for(int mode:{0,2}){
                State u=step(s,a.moves,b.moves);
                for(int t=0;t<33;++t){
                    auto m=Brain(u).run();
                    auto e=Brain(flip(u)).run(mode);
                    u=step(u,m,e);
                    if(t==10 || t==19 || t==32){
                        double sc=position(u);
                        v+=(t==10?.14:t==19?.22:.14)*std::tanh(sc/(60.+t*1.4));
                    }
                }
            }
            sum+=v;low=std::min(low,v);
        }
        double score=.64*sum/enemyPlans.size()+.36*low-.005*a.prior;
        if(score>high){high=score;best=a.moves;}
        if(Clock::now()-start>std::chrono::milliseconds(480))break;
    }
    return best;
}
Orders strategicMove(const State &s){
    Brain normal(s);
    bool struggling=s.turn>=7 && (normal.outlook<-30 || (s.turn>65 && normal.outlook<8));
    if(struggling)return searchMoves(s);
    auto a=normal.run();
    if(s.turn<14 || normal.outlook>240 || s.turn>165)return a;
    auto b=Brain(s).run(0,true);
    if(same(a,b))return a;
    // Challenge a discretionary expedition with a defender who can anticipate it.
    // Compare both branches against the same policies to measure opportunity cost.
    auto enemy=flip(s);
    Orders guard=Brain(enemy).run();
    State base=step(s,a,guard),invest=step(s,b,guard);
    double quick=forecast(invest,0,16)-forecast(base,0,16);
    if(quick<-16)return a;
    auto replyA=Brain(issued(enemy,a,2,1.)).run(2);
    auto replyB=Brain(issued(enemy,b,2,1.)).run(2);
    double challenge=forecast(step(s,b,replyB),2,15)-forecast(step(s,a,replyA),2,15);
    double threshold=normal.outlook>50?12.:3.;
    return (.35*quick+.30*challenge+.35*std::min(quick,challenge)>threshold)?b:a;
}
}
std::vector<Order> decide(const State &s){
    if(s.turn==1)return selectOpening(s);
    return strategicMove(s);
}

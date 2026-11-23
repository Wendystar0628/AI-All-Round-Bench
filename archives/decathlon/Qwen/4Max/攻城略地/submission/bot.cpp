#include "engine.hpp"
#include <algorithm>
#include <vector>
#include <array>
#include <cmath>
#include <ctime>
using namespace std;

// ===========================================================================
// Siege bot: fast simulator + heuristic policy + rollout search.
// Combat preserves troop differential; the prize is node growth. Evaluation
// predicts the final troop differential from growth advantage.
// ===========================================================================

static const int MAXN = 24;
static const int MAXF = 2048;
static const int MAXO = 128;
#ifdef BOTDEBUG
static long long g_nroll=0; static double g_searchMs=0; static int g_iters=0;
#endif

// ---- constant map data (per game) ----
static int MN = 0;
static int MX[MAXN], MY[MAXN], MG[MAXN];
static int MD[MAXN][MAXN];

struct GS {
    int turn;
    int owner[MAXN], troops[MAXN];
    int fo[MAXF], ft[MAXF], fto[MAXF], fl[MAXF];
    int nf;
};
struct Ord { int cnt; int f[MAXO], t[MAXO], tr[MAXO]; };

static void loadMap(const State& s) {
    MN = (int)s.nodes.size();
    for (int i = 0; i < MN; i++) {
        MX[i]=s.nodes[i].x; MY[i]=s.nodes[i].y; MG[i]=s.nodes[i].growth;
        for (int j = 0; j < MN; j++) MD[i][j]=s.dist[i][j];
    }
}
static GS toGS(const State& s) {
    GS g; g.turn=s.turn; g.nf=0;
    for (int i=0;i<MN;i++){ g.owner[i]=s.nodes[i].owner; g.troops[i]=s.nodes[i].troops; }
    for (auto& f:s.fleets){ if(g.nf<MAXF){ g.fo[g.nf]=f.owner; g.ft[g.nf]=f.troops; g.fto[g.nf]=f.to; g.fl[g.nf]=f.turns_left; g.nf++; } }
    return g;
}
static GS flipGS(const GS& g){
    GS f=g;
    for(int i=0;i<MN;i++) if(f.owner[i]) f.owner[i]=3-f.owner[i];
    for(int j=0;j<f.nf;j++) f.fo[j]=3-f.fo[j];
    return f;
}

static void settleGS(GS& g, const Ord& a, const Ord& b){
    auto disp=[&](const Ord& o,int who){
        for(int k=0;k<o.cnt && k<1000;k++){
            int f=o.f[k],t=o.t[k],tr=o.tr[k];
            if(f<0||f>=MN||t<0||t>=MN||f==t||tr<=0) continue;
            if(g.owner[f]!=who) continue;
            if(tr>g.troops[f]) continue;
            g.troops[f]-=tr;
            if(g.nf<MAXF){ g.fo[g.nf]=who; g.ft[g.nf]=tr; g.fto[g.nf]=t; g.fl[g.nf]=MD[f][t]; g.nf++; }
        }
    };
    disp(a,1); disp(b,2);
    for(int i=0;i<MN;i++) if(g.owner[i]) g.troops[i]+=MG[i];
    int sums[MAXN][3];
    for(int i=0;i<MN;i++){sums[i][0]=sums[i][1]=sums[i][2]=0;}
    int nnf=0;
    for(int j=0;j<g.nf;j++){
        g.fl[j]--;
        if(g.fl[j]==0){ sums[g.fto[j]][g.fo[j]]+=g.ft[j]; }
        else { g.fo[nnf]=g.fo[j]; g.ft[nnf]=g.ft[j]; g.fto[nnf]=g.fto[j]; g.fl[nnf]=g.fl[j]; nnf++; }
    }
    g.nf=nnf;
    for(int i=0;i<MN;i++){
        if(sums[i][1]==0&&sums[i][2]==0) continue;
        int sum[3]={0,0,0}; bool part[3]={false,false,false};
        sum[g.owner[i]]=g.troops[i]; part[g.owner[i]]=true;
        for(int o=1;o<=2;o++) if(sums[i][o]>0){sum[o]+=sums[i][o];part[o]=true;}
        int os[3],no=0; for(int o=0;o<3;o++) if(part[o]) os[no++]=o;
        for(int x=0;x<no;x++) for(int y=x+1;y<no;y++)
            if(sum[os[y]]>sum[os[x]]||(sum[os[y]]==sum[os[x]]&&os[y]<os[x])) swap(os[x],os[y]);
        int top=sum[os[0]], second=no>1?sum[os[1]]:0;
        bool tie=no>1&&top==second;
        if(!tie) g.owner[i]=os[0];
        g.troops[i]=tie?0:top-second;
    }
    g.turn++;
}

static int resultGS(const GS& g){
    bool alive[3]={false,false,false};
    long long tot[3]={0,0,0};
    for(int i=0;i<MN;i++){ alive[g.owner[i]]=true; tot[g.owner[i]]+=g.troops[i]; }
    for(int j=0;j<g.nf;j++){ alive[g.fo[j]]=true; tot[g.fo[j]]+=g.ft[j]; }
    if(!alive[1]&&!alive[2]) return 3;
    if(!alive[1]) return 2;
    if(!alive[2]) return 1;
    if(g.turn<=200) return 0;
    return tot[1]==tot[2]?3:(tot[1]>tot[2]?1:2);
}

static double evalGS(const GS& g){
    long long myT=0,enT=0; int myG=0,enG=0,myN=0,enN=0;
    bool myF=false,enF=false;
    for(int i=0;i<MN;i++){
        if(g.owner[i]==1){myT+=g.troops[i];myG+=MG[i];myN++;}
        else if(g.owner[i]==2){enT+=g.troops[i];enG+=MG[i];enN++;}
    }
    for(int j=0;j<g.nf;j++){ if(g.fo[j]==1){myT+=g.ft[j];myF=true;} else {enT+=g.ft[j];enF=true;} }
    bool myAlive=myN>0||myF, enAlive=enN>0||enF;
    if(!myAlive&&enAlive) return -1e9;
    if(!enAlive&&myAlive) return 1e9;
    if(!myAlive&&!enAlive) return 0;
    int rem=200-g.turn; if(rem<0)rem=0;
    return (double)(myT-enT) + (double)(myG-enG)*rem*0.9 + (double)(myN-enN)*8.0;
}

// ---- projection for the strong policy ----
struct TL { int own[20][MAXN]; int tr[20][MAXN]; int arrMe[20][MAXN]; int arrEn[20][MAXN]; int H; };
static void projectGS(const GS& g, int H, const Ord& extra, TL& tl){
    tl.H=H;
    GS w=g;
    // add extra (my orders) as fleets
    for(int k=0;k<extra.cnt;k++){
        int f=extra.f[k],t=extra.t[k],tr=extra.tr[k];
        if(f<0||f>=MN||t<0||t>=MN||f==t||tr<=0) continue;
        if(w.owner[f]!=1||tr>w.troops[f]) continue;
        w.troops[f]-=tr;
        if(w.nf<MAXF){ w.fo[w.nf]=1; w.ft[w.nf]=tr; w.fto[w.nf]=t; w.fl[w.nf]=MD[f][t]; w.nf++; }
    }
    for(int k=0;k<=H;k++){
        for(int i=0;i<MN;i++){ tl.own[k][i]=w.owner[i]; tl.tr[k][i]=w.troops[i]; tl.arrMe[k][i]=0; tl.arrEn[k][i]=0; }
        if(k==H) break;
        for(int i=0;i<MN;i++) if(w.owner[i]) w.troops[i]+=MG[i];
        int sums[MAXN][3]; for(int i=0;i<MN;i++){sums[i][0]=sums[i][1]=sums[i][2]=0;}
        int nnf=0;
        for(int j=0;j<w.nf;j++){
            w.fl[j]--;
            if(w.fl[j]==0){ sums[w.fto[j]][w.fo[j]]+=w.ft[j];
                if(w.fo[j]==1) tl.arrMe[k+1][w.fto[j]]+=w.ft[j]; else tl.arrEn[k+1][w.fto[j]]+=w.ft[j];
            } else { w.fo[nnf]=w.fo[j]; w.ft[nnf]=w.ft[j]; w.fto[nnf]=w.fto[j]; w.fl[nnf]=w.fl[j]; nnf++; }
        }
        w.nf=nnf;
        for(int i=0;i<MN;i++){
            if(sums[i][1]==0&&sums[i][2]==0) continue;
            int sum[3]={0,0,0}; bool part[3]={false,false,false};
            sum[w.owner[i]]=w.troops[i]; part[w.owner[i]]=true;
            for(int o=1;o<=2;o++) if(sums[i][o]>0){sum[o]+=sums[i][o];part[o]=true;}
            int os[3],no=0; for(int o=0;o<3;o++) if(part[o]) os[no++]=o;
            for(int x=0;x<no;x++) for(int y=x+1;y<no;y++)
                if(sum[os[y]]>sum[os[x]]||(sum[os[y]]==sum[os[x]]&&os[y]<os[x])) swap(os[x],os[y]);
            int top=sum[os[0]],second=no>1?sum[os[1]]:0;
            bool tie=no>1&&top==second;
            if(!tie) w.owner[i]=os[0];
            w.troops[i]=tie?0:top-second;
        }
    }
}

// ---- heuristic policy ----
// attackW scales willingness to attack enemy nodes. proj enables future projection.
static void policy(const GS& g, Ord& out, double attackW, bool proj, int focusTarget=-1, double reserveScale=1.0){
    out.cnt=0;
    int incMe[MAXN]={}, incEn[MAXN]={};
    for(int j=0;j<g.nf;j++){ if(g.fo[j]==1) incMe[g.fto[j]]+=g.ft[j]; else incEn[g.fto[j]]+=g.ft[j]; }
    int myNodes[MAXN],enNodes[MAXN],nMy=0,nEn=0;
    for(int i=0;i<MN;i++){ if(g.owner[i]==1) myNodes[nMy++]=i; else if(g.owner[i]==2) enNodes[nEn++]=i; }

    TL tl; bool haveTL=false;
    if(proj){ projectGS(g, 14, out, tl); haveTL=true; }

    int reserve[MAXN], avail[MAXN];
    for(int i=0;i<MN;i++){
        reserve[i]=0; avail[i]=0;
        if(g.owner[i]==1){
            int threat=0;
            for(int e=0;e<nEn;e++){ int j=enNodes[e]; int d=MD[i][j]; if(d<=6) threat=max(threat, g.troops[j]/(1+d/2)); }
            int r=(int)((max(threat/4, incEn[i]) + 1 + MG[i]/2)*reserveScale);
            if(r<incEn[i]) r=incEn[i];
            reserve[i]=min(r, g.troops[i]);
            avail[i]=g.troops[i]-reserve[i];
        }
    }
    auto addOrder=[&](int f,int t,int tr){
        if(out.cnt<MAXO && tr>0 && avail[f]>=tr){ out.f[out.cnt]=f; out.t[out.cnt]=t; out.tr[out.cnt]=tr; out.cnt++; avail[f]-=tr; }
    };

    // defense: reinforce my nodes that will fall
    for(int ii=0;ii<nMy;ii++){
        int i=myNodes[ii];
        int need=0;
        if(haveTL){
            bool falls=false; int fallK=15;
            for(int k=1;k<=tl.H;k++) if(tl.own[k][i]==2){falls=true;fallK=k;break;}
            if(falls){
                int bal=g.troops[i];
                for(int k=1;k<=tl.H;k++){ bal+=MG[i]; bal+=tl.arrMe[k][i]; bal-=tl.arrEn[k][i];
                    if(bal<0){need=max(need,-bal);bal=0;} }
                need+=2+MG[i];
                int best=-1,bestd=1e9;
                for(int jj=0;jj<nMy;jj++){ int j=myNodes[jj]; if(j==i||avail[j]<need)continue;
                    int d=MD[j][i]; if(d<=fallK&&d<bestd){bestd=d;best=j;} }
                if(best>=0) addOrder(best,i,need);
            }
        } else {
            need = incEn[i] - g.troops[i] - incMe[i];
            if(need>0){
                need+=2;
                int best=-1,bestd=1e9;
                for(int jj=0;jj<nMy;jj++){ int j=myNodes[jj]; if(j==i||avail[j]<need)continue;
                    int d=MD[j][i]; if(d<bestd){bestd=d;best=j;} }
                if(best>=0) addOrder(best,i,need);
            }
        }
    }

    // --- neutral expansion: greedy capture of safe neutrals ---
    struct C{int target; double score; int cost;};
    C cands[MAXN]; int nc=0;
    for(int i=0;i<MN;i++){
        if(g.owner[i]!=0) continue;
        int myD=1e9; for(int jj=0;jj<nMy;jj++) myD=min(myD,MD[myNodes[jj]][i]);
        if(myD>1e8) continue;
        int enD=1e9; for(int ee=0;ee<nEn;ee++) enD=min(enD,MD[enNodes[ee]][i]);
        if(enD+3<=myD) continue; // enemy much closer: skip
        int gth=MG[i];
        int rem=200-(g.turn+myD); if(rem<0)rem=0;
        int D=g.troops[i];
        bool handled = haveTL ? (tl.own[tl.H][i]==1) : (incMe[i]>D);
        if(handled) continue;
        int cost=D+1; double value=(double)gth*rem - D;
        if(value<=0) continue;
        double density=value/(cost+1.0);
        density*=1.0/(1.0+0.02*myD);
        if(enD<myD) density*=0.6;
        cands[nc++]={i,density,cost};
    }
    sort(cands,cands+nc,[](const C&a,const C&b){return a.score>b.score;});
    bool claimed[MAXN]={false};
    for(int c=0;c<nc;c++){
        int i=cands[c].target;
        if(claimed[i]) continue;
        int best=-1,bestd=1e9;
        for(int jj=0;jj<nMy;jj++){ int j=myNodes[jj]; if(avail[j]<cands[c].cost)continue;
            int d=MD[j][i]; if(d<bestd){bestd=d;best=j;} }
        if(best<0) continue;
        if(avail[best]<cands[c].cost) continue;
        addOrder(best,i,cands[c].cost);
        claimed[i]=true;
    }

    // --- enemy nodes: build up a staging force, then strike decisively ---
    if(nEn>0){
        // staging = front-line node (nearest to any enemy)
        int front=-1,frontD=1e9;
        for(int jj=0;jj<nMy;jj++){ int j=myNodes[jj];
            for(int ee=0;ee<nEn;ee++){ int d=MD[j][enNodes[ee]]; if(d<frontD){frontD=d;front=j;} } }
        if(front>=0){
            // pick best enemy target reachable from the staging node
            int bestT=-1,bestCost=0; double bestScore=0;
            for(int ee=0;ee<nEn;ee++){ int i=enNodes[ee];
                int myD=MD[front][i];
                int rem=200-(g.turn+myD); if(rem<0)rem=0;
                bool handled = haveTL ? (tl.own[tl.H][i]==1) : (incMe[i]>g.troops[i]+MG[i]*myD);
                if(handled && focusTarget!=i) continue;
                int D = haveTL ? tl.tr[min(myD,tl.H)][i] : g.troops[i]+MG[i]*myD;
                int cost=D+1+MG[i]*2;
                double value=2.0*MG[i]*rem*attackW;
                double density=value/(cost+1.0);
                if(focusTarget==i) density*=3.0;
                if(density>bestScore){bestScore=density;bestT=i;bestCost=cost;}
            }
            // strike only with a decisive force (accumulate otherwise)
            if(bestT>=0){
                int force=bestCost*2;
                if(avail[front]>=force) addOrder(front,bestT,force);
            }
            // concentrate surplus from other nodes at the staging node
            for(int jj=0;jj<nMy;jj++){ int j=myNodes[jj];
                if(j==front||avail[j]<=0) continue;
                addOrder(j,front,avail[j]); }
        }
    }
}

// ---- rollout ----
// Opponent model parameters, adapted per turn to observed opponent aggression.
static double OPPW=1.0, OPPRS=0.8;
static double MYW=1.0, MYRS=0.8;
static double rollout(const GS& start, const Ord& myTurn, int H){
#ifdef BOTDEBUG
    g_nroll++;
#endif
    GS g=start;
    Ord opp; { GS f=flipGS(g); policy(f,opp,OPPW,false,-1,OPPRS); }
    settleGS(g,myTurn,opp);
    for(int k=1;k<H;k++){
        if(resultGS(g)) break;
        Ord me,op;
        policy(g,me,MYW,false,-1,MYRS);
        { GS f=flipGS(g); policy(f,op,OPPW,false,-1,OPPRS); }
        settleGS(g,me,op);
    }
    return evalGS(g);
}

static double cpuMs(){ return (double)std::clock()*1000.0/CLOCKS_PER_SEC; }

static bool planValid(const GS& g, const Ord& o){
    int used[MAXN]={0};
    for(int k=0;k<o.cnt;k++){
        int f=o.f[k];
        if(f<0||f>=MN||g.owner[f]!=1) return false;
        if(o.t[k]==f||o.tr[k]<=0) return false;
        used[f]+=o.tr[k];
        if(used[f]>g.troops[f]) return false;
    }
    return true;
}

static double g_aggr=0.2; // running estimate of opponent aggression

std::vector<Order> decide(const State& s) {
    if(s.turn==1 || MN!=(int)s.nodes.size()) loadMap(s);
    GS g=toGS(s);
    double t0=cpuMs();
    double budget = (s.turn==1)? 700.0 : 38.0;
    double deadline=t0+budget;
    int H = (s.turn==1)? 26 : 18;

    // ---- observe opponent aggression from its in-transit fleets ----
    {
        int toMy=0,toOther=0;
        for(auto&f:s.fleets) if(f.owner==2){
            if(s.nodes[f.to].owner==1) toMy+=f.troops; else toOther+=f.troops;
        }
        double cur=(toMy+toOther>0)? (double)toMy/(toMy+toOther) : 0.0;
        if(s.turn==1) g_aggr=0.15; else g_aggr=0.65*g_aggr+0.35*cur;
        double a=g_aggr;
        OPPW=0.4+2.2*a; OPPRS=1.0-0.6*a;
        MYW=0.8+0.7*a;  MYRS=0.55+0.65*a;
    }

    // ---- initial candidate plans ----
    vector<Ord> cands;
    double modes[][2]={{MYW*0.6,MYRS*1.3},{MYW,MYRS},{MYW*1.5,MYRS*0.6},{MYW*2.0,MYRS*0.4},{MYW,MYRS*0.35}};
    for(auto&m:modes){ Ord o; policy(g,o,m[0],true,-1,m[1]); cands.push_back(o); }
    for(int i=0;i<MN;i++) if(g.owner[i]==2){ Ord o; policy(g,o,MYW*1.8,true,i,MYRS*0.5); cands.push_back(o); }
    { Ord o; o.cnt=0; cands.push_back(o); }

    double bestVal=-1e18; Ord best; best.cnt=0;
    for(auto&c:cands){
        if(!planValid(g,c)) continue;
        double v=rollout(g,c,H);
        if(v>bestVal){bestVal=v;best=c;}
        if(cpuMs()-t0>budget*0.45) break;
    }

    // ---- pool of candidate sends for local search ----
    Ord pool; pool.cnt=0;
    auto poolAdd=[&](int f,int t,int tr){
        if(pool.cnt<MAXO){ pool.f[pool.cnt]=f; pool.t[pool.cnt]=t; pool.tr[pool.cnt]=tr; pool.cnt++; }
    };
    { Ord o; policy(g,o,1.8,true,-1,0.4); for(int k=0;k<o.cnt;k++) poolAdd(o.f[k],o.t[k],o.tr[k]); }
    for(int i=0;i<MN;i++) if(g.owner[i]==2){ Ord o; policy(g,o,1.8,true,i,0.4); for(int k=0;k<o.cnt;k++) poolAdd(o.f[k],o.t[k],o.tr[k]); }
    { Ord o; policy(g,o,1.0,true,-1,0.7); for(int k=0;k<o.cnt;k++) poolAdd(o.f[k],o.t[k],o.tr[k]); }

    // ---- steepest-ascent local search ----
    while(cpuMs()<deadline){
        bool improved=false;
        double nbVal=bestVal; Ord nb=best;
        // remove one order
        for(int k=0;k<best.cnt && cpuMs()<deadline;k++){
            Ord trial=best;
            for(int q=k;q<trial.cnt-1;q++){trial.f[q]=trial.f[q+1];trial.t[q]=trial.t[q+1];trial.tr[q]=trial.tr[q+1];}
            trial.cnt--;
            double v=rollout(g,trial,H);
            if(v>nbVal+1e-6){nbVal=v;nb=trial;improved=true;}
        }
        // add a send from pool
        for(int k=0;k<pool.cnt && cpuMs()<deadline;k++){
            bool dup=false;
            for(int q=0;q<best.cnt;q++) if(best.f[q]==pool.f[k]&&best.t[q]==pool.t[k]) dup=true;
            if(dup) continue;
            if(best.cnt>=MAXO) break;
            Ord trial=best;
            trial.f[trial.cnt]=pool.f[k]; trial.t[trial.cnt]=pool.t[k]; trial.tr[trial.cnt]=pool.tr[k]; trial.cnt++;
            if(!planValid(g,trial)) continue;
            double v=rollout(g,trial,H);
            if(v>nbVal+1e-6){nbVal=v;nb=trial;improved=true;}
        }
        // scale amounts of existing orders
        for(int k=0;k<best.cnt && cpuMs()<deadline;k++){
            for(double mul:{0.5,1.6}){
                Ord trial=best;
                trial.tr[k]=max(1,(int)(trial.tr[k]*mul));
                if(!planValid(g,trial)) continue;
                double v=rollout(g,trial,H);
                if(v>nbVal+1e-6){nbVal=v;nb=trial;improved=true;}
            }
        }
        if(!improved) break;
        best=nb; bestVal=nbVal;
#ifdef BOTDEBUG
        g_iters++;
#endif
    }

    vector<Order> res;
    for(int k=0;k<best.cnt;k++) res.push_back({best.f[k],best.t[k],best.tr[k]});
#ifdef BOTDEBUG
    g_searchMs=cpuMs()-t0;
#endif
    return res;
}

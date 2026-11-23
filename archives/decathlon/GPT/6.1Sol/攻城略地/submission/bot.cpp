#include "engine.hpp"
#include <algorithm>
#include <array>
#include <cmath>

// Event forecasts drive expansion, coordinated attacks and defensive reserves.
// Opening policies are compared once; stable losing positions switch initiative.
namespace {
constexpr int M=24, H=40;
struct Config {double soft=0.45,support=0.45,power=0.35,enemy=1.65,risk=1.0;int range=2,buffer=1;bool peace=false;};
struct Forecast { int owner[H+1], troops[H+1]; };
struct Planner {
 const State& s; Config cfg; bool active; int hard[M]{},softReserve[M]{}; int n, remain; int held[M]{}, used[M]{}, avail[M]{}, loss[M]{}, nearE[M]{};
 int arrivals[M][H+1][3]{};
 Forecast f[M]; std::vector<Order> orders;
 Planner(const State& st,Config c={},bool live=true):s(st),cfg(c),active(live),n((int)st.nodes.size()),remain(st.max_turns-st.turn+1) {
  for(auto &v:s.fleets) if(v.turns_left<=H && v.turns_left>0) arrivals[v.to][v.turns_left][v.owner]+=v.troops;
  for(int i=0;i<n;i++){nearE[i]=30; for(int j=0;j<n;j++) if(s.nodes[j].owner==2) nearE[i]=std::min(nearE[i],s.dist[i][j]);}
  refresh();
 }
 // Forecast indices count arrival settlements from the current state.
 Forecast simulate(int i,int remove=0,int at=0,int add=0) const {
  Forecast out; int o=s.nodes[i].owner,b=s.nodes[i].troops-used[i]-remove;
  out.owner[0]=o; out.troops[0]=b;
  for(int t=1;t<=H;t++){
   if(o) b+=s.nodes[i].growth;
   int a=arrivals[i][t][1]+(t==at?add:0),e=arrivals[i][t][2];
   if(a||e){int v[3]={0,a,e};v[o]+=b;int top=std::max({v[0],v[1],v[2]}), who=-1, sec=0;
    for(int k=0;k<3;k++) if(v[k]==top){if(who!=-1){who=-2;break;}who=k;}
    if(who<0)b=0;else{for(int k=0;k<3;k++)if(k!=who)sec=std::max(sec,v[k]);o=who;b=top-sec;}
   }
   out.owner[t]=o;out.troops[t]=b;
  }return out;
 }
 bool survives(const Forecast& p,int from=1,int until=H) const { for(int t=from;t<=until;t++)if(p.owner[t]!=1)return false; return true; }
 void refresh(){
  for(int i=0;i<n;i++){
   f[i]=simulate(i);loss[i]=0;avail[i]=0;hard[i]=0;
   if(s.nodes[i].owner!=1)continue;
   for(int t=1;t<=std::min(H,remain);t++)if(f[i].owner[t]!=1){loss[i]=t;break;}
   int b=s.nodes[i].troops-used[i];
   if(loss[i]){avail[i]=0;continue;}
   // Preserve enough garrison for all announced attacks before using surplus.
   int lo=0,hi=b;
   while(lo<hi){int mid=(lo+hi+1)/2; if(survives(simulate(i,mid),1,std::min(H,remain)))lo=mid;else hi=mid-1;}
   hard[i]=lo;
   int soft=0;
   for(int j=0;j<n;j++)if(s.nodes[j].owner==2&&s.dist[i][j]<=10){
    int d=s.dist[i][j];
    int threat=int(s.nodes[j].troops*cfg.soft)-s.nodes[i].growth*d;
    int aid=0;for(int k=1;k<=d;k++)aid+=arrivals[i][k][1]-arrivals[i][k][2];
    soft=std::max(soft,threat-aid);
   }
   softReserve[i]=soft;
   avail[i]=std::max(0,std::min(lo,std::max(0,b-soft))-held[i]);
  }
 }
 void send(int a,int b,int v){if(v<=0)return;used[a]+=v;arrivals[b][s.dist[a][b]][1]+=v;orders.push_back({a,b,v});}
 int need(int target,int at,int start=0) const {
  int from=start?start:at;int end=std::min(H,remain);
  auto good=[&](int x){return survives(simulate(target,0,at,x),from,end);};
  if(good(0))return 0;int hi=1;while(hi<100000&&!good(hi))hi*=2;
  int lo=1;while(lo<hi){int mid=(lo+hi)/2;if(good(mid))hi=mid;else lo=mid+1;}return lo;
 }
 void defend(){
  for(int pass=0;pass<n;pass++){
   int target=-1;double priority=-1;
   for(int i=0;i<n;i++)if(s.nodes[i].owner==1&&loss[i]&&loss[i]<=remain){
    double p=s.nodes[i].growth*5.0+20.0/(loss[i]+1);if(p>priority){priority=p;target=i;}
   }
   if(target<0)break;
   int deadline=loss[target];std::vector<int> donors;
   for(int i=0;i<n;i++)if(i!=target&&s.nodes[i].owner==1&&!loss[i]&&(active?hard[i]:avail[i])>0&&s.dist[i][target]<=deadline)donors.push_back(i);
   std::sort(donors.begin(),donors.end(),[&](int a,int b){return s.dist[a][target]<s.dist[b][target];});
   int extra[M]{}, got=0;
   for(int i:donors){int d=s.dist[i][target];int req=need(target,d,1);int x=std::min(req,active?hard[i]:avail[i]);arrivals[target][d][1]+=x;extra[i]=x;got+=x;if(survives(simulate(target),1,std::min(H,remain)))break;}
   bool good=survives(simulate(target),1,std::min(H,remain));
   for(int i:donors)arrivals[target][s.dist[i][target]][1]-=extra[i];
   if(good){for(int i:donors)send(i,target,extra[i]);refresh();}
   else {loss[target]=0;avail[target]=0; /* Reconsider after processing the other threatened nodes. */}
  }
  refresh();
 }
 struct Plan { double score=-1; int target=-1, count=0, cost=0, time=0, wait=0; int source[M]{}, amount[M]{}; };
 double merit(int target,int d,int cost,int md)const{
  double g=s.nodes[target].growth;
  bool enemy=f[target].owner[d]==2;
  double tax=s.nodes[target].owner==0?s.nodes[target].troops:0;
  double gain=g*std::min(50-d,remain-d)*(enemy?cfg.enemy:1.0)-tax;
  if(gain<=0)return -1;
  int ed=30;for(int j=0;j<n;j++)if(j!=target&&s.nodes[j].owner==2)ed=std::min(ed,s.dist[j][target]);
  double risk=std::clamp((ed+3.0)/(md+3.0),0.3,1.15);
  double locality=1.0+0.12*(10.0-nearE[target])/10.0;
  double value=gain*std::pow(risk,cfg.risk)*std::pow(g,cfg.power)*locality/(cost+g*(d+3)+12);
  if(active&&enemy){
   double control[3]={0,0.025*g,0.025*g};
   for(int q=0;q<n;q++)if(q!=target){int owner=f[q].owner[std::min(d,15)];double dd=s.dist[q][target]+2.0;if(owner)control[owner]+=s.nodes[q].growth/(dd*dd);}
   value*=std::pow(std::clamp(control[1]/control[2],0.16,1.6),0.7*cfg.risk);
  }
  return value;
 }
 Plan waitForExpansion(int target){
  Plan best;if(s.nodes[target].owner!=0)return best;
  for(int i=0;i<n;i++)if(s.nodes[i].owner==1&&!loss[i]){
   int d=s.dist[i][target];
   for(int w=1;w<=6&&d+w<remain;w++){
    int T=d+w;if(f[target].owner[T]!=0)continue;
    int req=need(target,T),want=req+cfg.buffer;
    if(req==0)continue;
    for(int e=0;e<n;e++)if(e!=target&&s.nodes[e].owner==2&&s.dist[e][target]<=T+3)
     want+=int((s.nodes[e].troops+s.nodes[e].growth*std::max(0,T-s.dist[e][target]))*cfg.support);
    int futureHard=1000000;
    for(int t=w;t<=std::min(H,remain);t++)futureHard=std::min(futureHard,f[i].troops[t]);
    int futureAvail=std::max(0,std::min(futureHard,std::max(0,f[i].troops[w]-softReserve[i]))-held[i]);
    if(want>futureAvail)continue;
    int gain=futureAvail-avail[i];
    int keep=std::max(0,want-gain);
    double score=merit(target,T,want,d);
    if(score>best.score){best.target=target;best.time=T;best.wait=w;best.cost=want;best.count=1;best.source[0]=i;best.amount[0]=keep;best.score=score;}
    break;
   }
  }
  return best;
 }
 Plan attack(int target) {
  Plan best;std::vector<int> donors;
  for(int i=0;i<n;i++)if(i!=target&&s.nodes[i].owner==1&&avail[i]>0)donors.push_back(i);
  std::sort(donors.begin(),donors.end(),[&](int a,int b){return s.dist[a][target]<s.dist[b][target];});
  int extra[M]{},total=0;int closest=donors.empty()?30:s.dist[donors[0]][target];
  for(int k=0;k<(int)donors.size();k++){
   int i=donors[k],d=s.dist[i][target]; if(d>remain||d>closest+cfg.range)break;
   if(f[target].owner[d]==1&&survives(f[target],d,std::min(H,remain)))continue;
   int req=need(target,d);int buffer=cfg.buffer;
   if(cfg.buffer&&nearE[target]<=d+4)buffer+=s.nodes[target].growth*2;
   int extraThreat=0;
   for(int e=0;e<n;e++)if(e!=target&&s.nodes[e].owner==2&&s.dist[e][target]<=d+3){
    extraThreat+=int((s.nodes[e].troops+s.nodes[e].growth*std::max(0,d-s.dist[e][target]))*cfg.support);
   }
   int want=req+buffer+extraThreat;
   int x=std::min(want,avail[i]);
   if(want<=avail[i]&&(total+want)>0){
    Plan p;p.target=target;p.time=d;p.cost=total+x;
    for(int j=0;j<k;j++)if(extra[donors[j]]){p.source[p.count]=donors[j];p.amount[p.count++]=extra[donors[j]];}
    p.source[p.count]=i;p.amount[p.count++]=x;
    int md=30;for(int q=0;q<=k;q++)md=std::min(md,s.dist[donors[q]][target]);
    p.score=merit(target,d,p.cost,md);
    if(p.score>best.score)best=p;
   }
   extra[i]=avail[i];arrivals[target][d][1]+=extra[i];total+=extra[i];
  }
  for(int i:donors)arrivals[target][s.dist[i][target]][1]-=extra[i];
  return best;
 }
 void attackAll(){
  bool targeted[M]{};
  for(int round=0;round<n;round++){
   Plan best;
   for(int j=0;j<n;j++){
    if(targeted[j]|| (s.nodes[j].owner==1&&!loss[j]))continue;
    if(cfg.peace){int home=s.nodes[0].owner==1?0:1;int enemy=home^1;if(s.nodes[j].owner==2||s.dist[home][j]>s.dist[enemy][j])continue;}
    if(s.nodes[j].owner!=1&&survives(f[j],std::min(20,remain),std::min(H,remain)))continue;
    Plan p=attack(j);if(p.score>best.score)best=p;
    if(active&&cfg.support>0.1){Plan w=waitForExpansion(j);if(w.score>best.score)best=w;}
   }
   if(best.target<0||best.score<0.001)break;
   targeted[best.target]=true;
   if(best.wait){for(int k=0;k<best.count;k++)held[best.source[k]]+=best.amount[k];}
   else for(int k=0;k<best.count;k++)send(best.source[k],best.target,best.amount[k]);
   refresh();
  }
 }
 void transfer(){
  // Move reserves toward the active boundary, without creating cycles.
  double front[M];
  for(int i=0;i<n;i++){
   front[i]=30;
   for(int j=0;j<n;j++)if(f[j].owner[std::min(15,remain)]!=1){
    if(s.nodes[j].owner==0&&s.nodes[j].troops>6*s.nodes[j].growth+15)continue;
    double v=s.dist[i][j]+(s.nodes[j].owner==0?4.0:0.0);
    front[i]=std::min(front[i],v);
   }
  }
  for(int i=0;i<n;i++)if(s.nodes[i].owner==1&&avail[i]>0){
   int best=-1;double val=1e9;
   for(int j=0;j<n;j++)if(j!=i&&s.dist[i][j]<remain&&front[j]+1.0<front[i]){
    int d=s.dist[i][j];bool pending=s.nodes[j].owner==0;for(auto&v:s.fleets)if(v.to==j&&v.owner==2)pending=false;
    if((s.nodes[j].owner!=1&&!pending)||f[j].owner[d]!=1||!survives(f[j],d,std::min(H,remain)))continue;
    double v=d+1.65*front[j];if(v<val){val=v;best=j;}
   }
   if(best>=0 && val<1.65*front[i]){int x=avail[i];if(!loss[i]){int keep=std::max(0,6-nearE[i])*s.nodes[i].growth;x=std::max(0,x-keep);}send(i,best,x);}
  }
 }
 std::vector<Order> run(){defend();attackAll();transfer();return orders;}
};
}


namespace {
Config defaultConfig(){return Config{0.45,0.45,0.35,1.65,1,2,0};}
double openingValue(State a){
 for(int i=0;i<10;i++)a=step(a,{},{});
 int r=result(a);if(r)return r==1?100000:r==2?-100000:0;
 double v=0;for(auto&p:a.nodes)if(p.owner)v+=(p.owner==1?1:-1)*(p.troops+40*p.growth);
 for(auto&f:a.fleets)v+=(f.owner==1?1:-1)*f.troops;return v;
}
// Compare complete opening policies against several deterministic responses.
Config chooseOpening(const State&s){
 std::array<Config,8> options={defaultConfig(),Config{0.45,0.45,-0.3,1.65,1,2,0},Config{0.45,0.45,0.9,1.65,1,2,0},Config{0.6,0.65,0.35,1.5,1,3,0},Config{0.45,0.45,0.35,1.65,1,6,0},Config{0.45,0.45,0.5,0,0,3,0,true},Config{0.3,0.3,0.5,1.4,1,3,0},Config{0.45,0.45,0.35,1.65,1,2,1}};
 std::array<Config,3> models={defaultConfig(),Config{0.3,0.3,0,1.6,0.8,3,0},Config{0.5,0.5,0.5,0,0,3,0,true}};
 Config best=options[0];double high=-1e100;
 for(auto c:options){double values[3];
  for(int m=0;m<3;m++){
   State a=s;
   for(int t=0;t<45;t++){
    Config mine=t<30?c:defaultConfig();Config enemy=t<30?models[m]:defaultConfig();
    auto x=Planner(a,mine,false).run(),y=Planner(flip(a),enemy,false).run();a=step(a,x,y);if(result(a))break;
   }
   values[m]=openingValue(a);
  }
  double score=0.65*std::min({values[0],values[1],values[2]})+0.35*(values[0]+values[1]+values[2])/3;
  if(score>high+1e-6){high=score;best=c;}
 }
 return best;
}
}
std::vector<Order> decide(const State&s){
 static unsigned long long old=0;static int stable=0;static bool panic=false;static int since=0;static Config opening;
 if(s.turn==1){panic=false;stable=0;old=0;since=0;opening=chooseOpening(s);}
 unsigned long long hash=0;for(auto&p:s.nodes)hash=hash*3+p.owner;
 if(hash==old)stable++;else stable=0;old=hash;
 Config c=s.turn<=30?opening:defaultConfig();Planner p(s,c);
 int v[3]{},g[3]{};int horizon=std::min(H,p.remain);
 for(int i=0;i<p.n;i++){int o=p.f[i].owner[horizon];v[o]+=p.f[i].troops[horizon];g[o]+=s.nodes[i].growth;}
 int ending=v[1]-v[2]+std::max(0,p.remain-horizon)*(g[1]-g[2]);
 // A stable deficit calls for action; do not disturb a developing advantage.
 if(s.turn>=70&&stable>=12&&ending< -1){if(!panic)since=s.turn;panic=true;}
 if(panic&&s.turn-since>=12&&ending>300&&g[1]>=g[2])panic=false;
 if(panic)return Planner(s,Config{0,0,0.2,2.0,0.3,20,0}).run();
 return p.run();
}

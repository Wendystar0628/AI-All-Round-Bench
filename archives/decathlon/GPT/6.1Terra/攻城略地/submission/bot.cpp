#include "engine.hpp"
#include <algorithm>
#include <cmath>
#include <vector>
#include <functional>
using namespace std;
namespace {
const int H=45;
struct Sim { int own, num; bool safe; };
int ev[24][46][3];
Sim sim(const State& s,int j,int end,int remove=0,int extraT=0,int extra=0,int check=0){
 int o=s.nodes[j].owner, b=s.nodes[j].troops-remove; bool safe=true;
 for(int t=1;t<=end;t++){
  if(o) b+=s.nodes[j].growth;
  int a[3]={ev[j][t][0],ev[j][t][1],ev[j][t][2]}; a[o]+=b;
  if(t==extraT) a[1]+=extra;
  int best=0; for(int k=1;k<3;k++) if(a[k]>a[best]) best=k;
  int second=0; for(int k=0;k<3;k++) if(k!=best) second=max(second,a[k]);
  if(a[best]==second){b=0;}else {o=best;b=a[best]-second;}
  if(check && o!=1) safe=false;
 }
 return {o,b,safe};
}
}
vector<Order> decide(const State& s){
 int n=s.nodes.size(), left=s.max_turns-s.turn+1; vector<Order> orders;
 if(s.turn==1){
  int home=0, enemy=0; for(int i=0;i<n;i++){if(s.nodes[i].owner==1)home=i;if(s.nodes[i].owner==2)enemy=i;}
  vector<int> chosen,best; double bestScore=0;
  function<void(int,int,double)> dfs=[&](int start,int money,double score){
   if(score>bestScore){bestScore=score;best=chosen;}
   if(chosen.size()==4)return;
   for(int j=start;j<n;j++) if(s.nodes[j].owner==0 && s.nodes[j].troops+1<=money){
    int d=s.dist[home][j], ed=s.dist[enemy][j], cost=s.nodes[j].troops+1;
    double factor=(d>=ed ? 0.25 : 1.0);
    double val=factor*s.nodes[j].growth*(25-d)-cost*1.3;
    if(val<=0)continue;
    chosen.push_back(j);dfs(j+1,money-cost,score+val);chosen.pop_back();
   }
  };dfs(0,s.nodes[home].troops,0);
  for(int j:best)orders.push_back({home,j,s.nodes[j].troops+1});
  return orders;
 }
 fill(&ev[0][0][0],&ev[0][0][0]+24*46*3,0);
 for(auto &f:s.fleets) if(f.turns_left<=H && f.turns_left>0) ev[f.to][f.turns_left][f.owner]+=f.troops;
 int incomingEnemy[24][46]={},incomingMine[24][46]={};
 for(const auto &f:s.fleets) if(f.owner==2 && f.turns_left>0 && f.turns_left<=H) incomingEnemy[f.to][f.turns_left]+=f.troops;
 for(const auto &f:s.fleets) if(f.owner==1 && f.turns_left>0 && f.turns_left<=H) incomingMine[f.to][f.turns_left]+=f.troops;
 for(int i=0;i<n;i++) for(int t=1;t<=H;t++) {incomingEnemy[i][t]+=incomingEnemy[i][t-1]; incomingMine[i][t]+=incomingMine[i][t-1];}
 int avail[24]={}, defAvail[24]={};
 for(int i=0;i<n;i++) if(s.nodes[i].owner==1){
  int lo=0,hi=s.nodes[i].troops;
  while(lo<hi){int m=(lo+hi+1)/2;if(sim(s,i,min(H,left),m,0,0,1).safe)lo=m;else hi=m-1;}
  defAvail[i]=lo;
  int threat=0;
  for(int e=0;e<n;e++) if(s.nodes[e].owner==2){int d=s.dist[e][i]; if(d<=8) for(int t=0;t<=6;t+=2){int incoming=incomingEnemy[e][t]; int arrival=d+t; threat=max(threat,max(0,s.nodes[e].troops+incoming+s.nodes[e].growth*t-incomingMine[i][arrival]-s.nodes[i].growth*(arrival+1)));}}
  avail[i]=max(0,lo-threat/3);
 }
 // Rescue threatened planets using available nearby reserves.
 vector<pair<int,int>> defenseQueue;
 for(int j=0;j<n;j++)if(s.nodes[j].owner==1 && !sim(s,j,min(H,left),0,0,0,1).safe){int t=1;while(t<=min(H,left) && sim(s,j,t,0,0,0,1).safe)t++; defenseQueue.push_back({t,j});}
 sort(defenseQueue.begin(),defenseQueue.end(),[&](auto a,auto b){return a.first!=b.first ? a.first<b.first : s.nodes[a.second].growth>s.nodes[b.second].growth;});
 for(auto [deadline,j]:defenseQueue) if(!sim(s,j,min(H,left),0,0,0,1).safe){
  int fail=1; while(fail<=min(H,left) && sim(s,j,fail,0,0,0,1).safe) fail++;
  for(int i=0;i<n;i++) if(i!=j && defAvail[i]>0 && s.dist[i][j]<=fail) ev[j][s.dist[i][j]][1]+=defAvail[i];
  bool canSave=sim(s,j,fail,0,0,0,1).safe;
  for(int i=0;i<n;i++) if(i!=j && defAvail[i]>0 && s.dist[i][j]<=fail) ev[j][s.dist[i][j]][1]-=defAvail[i];
  if(!canSave){
   int dest=-1; for(int i=0;i<n;i++) if(i!=j && s.nodes[i].owner==1 && (dest<0 || s.dist[i][j]<s.dist[dest][j])) dest=i;
   if(dest<0 && s.nodes[j].troops>0){
    for(int i=0;i<n;i++) if(i!=j && s.dist[i][j]<left && sim(s,i,s.dist[i][j],0,s.dist[i][j],s.nodes[j].troops).own==1 && (dest<0 || s.dist[i][j]<s.dist[dest][j])) dest=i;
    if(dest<0 && fail==1) for(int i=0;i<n;i++) if(i!=j && (dest<0 || s.dist[i][j]>s.dist[dest][j])) dest=i;
   }
   if(dest>=0 && s.nodes[j].troops>0){orders.push_back({j,dest,s.nodes[j].troops});ev[dest][s.dist[j][dest]][1]+=s.nodes[j].troops;}
   continue;
  }
  for(int k=0;k<n;k++) {int best=-1; for(int i=0;i<n;i++) if(i!=j && defAvail[i]>0 && s.dist[i][j]<=fail && (best<0 || s.dist[i][j]<s.dist[best][j])) best=i;
   if(best<0)break; int d=s.dist[best][j],lo=1,hi=defAvail[best];
   if(sim(s,j,fail,0,d,hi,1).safe){while(lo<hi){int m=(lo+hi)/2;if(sim(s,j,fail,0,d,m,1).safe)hi=m;else lo=m+1;}}else lo=hi;
   orders.push_back({best,j,lo});defAvail[best]-=lo; avail[best]=max(0,avail[best]-lo);ev[j][d][1]+=lo;
   if(sim(s,j,fail,0,0,0,1).safe)break;
  }
 }
 // Reinforce a pending neutral capture before a known counterattack.
 for(int j=0;j<n;j++) if(s.nodes[j].owner==0){
  int cap=0,fail=0; for(int t=1;t<=min(H,left);t++){auto p=sim(s,j,t); if(!cap && p.own==1)cap=t; else if(cap && p.own!=1){fail=t;break;}}
  if(!fail)continue;
  for(int i=0;i<n;i++) if(avail[i]>0 && s.dist[i][j]>=cap && s.dist[i][j]<=fail)ev[j][s.dist[i][j]][1]+=avail[i];
  bool possible=sim(s,j,fail).own==1;
  for(int i=0;i<n;i++) if(avail[i]>0 && s.dist[i][j]>=cap && s.dist[i][j]<=fail)ev[j][s.dist[i][j]][1]-=avail[i];
  if(!possible)continue;
  for(int k=0;k<n;k++){
   int b=-1; for(int i=0;i<n;i++) if(avail[i]>0 && s.dist[i][j]>=cap && s.dist[i][j]<=fail && (b<0 || s.dist[i][j]<s.dist[b][j])) b=i;
   if(b<0)break; int d=s.dist[b][j],lo=1,hi=avail[b];
   if(sim(s,j,fail,0,d,hi).own==1){while(lo<hi){int m=(lo+hi)/2;if(sim(s,j,fail,0,d,m).own==1) hi=m;else lo=m+1;}}else lo=hi;
   orders.push_back({b,j,lo}); avail[b]-=lo; ev[j][d][1]+=lo;
   if(sim(s,j,fail).own==1)break;
  }
 }
 // Strengthen valuable captures that can be counterattacked immediately.
 for(int j=0;j<n;j++) if(s.nodes[j].owner==0 && s.nodes[j].growth>=3){
  int cap=0; for(int t=1;t<=min(8,left);t++)if(sim(s,j,t).own==1){cap=t;break;} if(!cap)continue;
  int danger=0; for(int e=0;e<n;e++)if(s.nodes[e].owner==2 && s.dist[e][j]<=4){int ed=s.dist[e][j]; danger=max(danger,(s.nodes[e].troops+incomingEnemy[e][min(H,cap)]-s.nodes[j].growth*ed)/2);}
  if(danger<=0)continue; int when=min(H,cap+2); auto projected=sim(s,j,when); if(projected.own!=1)continue; int need=danger-projected.num;
  for(int k=0;k<n && need>0;k++){
   int b=-1; for(int i=0;i<n;i++)if(avail[i]>0 && s.dist[i][j]>=cap && s.dist[i][j]<=when && (b<0 || s.dist[i][j]<s.dist[b][j])) b=i;
   if(b<0)break; int amount=min(avail[b],need); orders.push_back({b,j,amount}); avail[b]-=amount; ev[j][s.dist[b][j]][1]+=amount; need-=amount;
  }
 }
 int gt[3]={},sum[3]={}; for(auto &p:s.nodes)if(p.owner){gt[p.owner]+=p.growth;sum[p.owner]+=p.troops;} for(auto &f:s.fleets)sum[f.owner]+=f.troops;
 bool defendingLead = s.turn>35 && (sum[1]-sum[2]+(gt[1]-gt[2])*max(0,left-25)>max(100, (sum[1]+sum[2])/15));
 // Greedy capture using exact projected arrivals. Repeat as plans update.
 for(int iter=0;iter<n*2;iter++){
  double bestScore=0; int bt=-1; vector<pair<int,int>> plan;
  for(int j=0;j<n;j++) if(s.nodes[j].owner!=1){
   if(defendingLead && s.nodes[j].owner==2) continue;
   int nearestEnemy=99,nearestMine=99;
   for(int i=0;i<n;i++){if(s.nodes[i].owner==2)nearestEnemy=min(nearestEnemy,s.dist[i][j]); if(s.nodes[i].owner==1)nearestMine=min(nearestMine,s.dist[i][j]);}
   vector<int> src; for(int i=0;i<n;i++) if(avail[i]>0 && i!=j && s.dist[i][j]<left) src.push_back(i);
   sort(src.begin(),src.end(),[&](int a,int b){return s.dist[a][j]<s.dist[b][j];});
   vector<pair<int,int>> cand; int total=0, totalAvailable=0; for(int z:src) totalAvailable+=avail[z];
   for(int i:src){
    int d=s.dist[i][j]; if(d>30)continue;
    // Avoid redundant expeditions to nodes already scheduled to be captured.
    if(sim(s,j,d).own==1) break;
    int use=avail[i]; ev[j][d][1]+=use;
    int margin=0;
    for(int e=0;e<n;e++) if(s.nodes[e].owner==2 && e!=j){int ed=s.dist[e][j]; if(ed<=d+2){int inc=incomingEnemy[e][max(1,d-ed+2)]; margin=max(margin,max(0,s.nodes[e].troops+inc+s.nodes[e].growth*(d-ed)-s.nodes[j].growth*2)/2);}}
    if(s.nodes[j].owner==2) margin+=5+s.nodes[j].growth*d/2;
    auto p=sim(s,j,d); bool captured=p.own==1 && p.num>=margin+1;
    for(int t=d+1;captured && t<=min(H,min(left,d+8));t++) if(sim(s,j,t).own!=1) captured=false;
    if(captured){int lo=1,hi=use; ev[j][d][1]-=use;
     while(lo<hi){int m=(lo+hi)/2;ev[j][d][1]+=m;auto test=sim(s,j,d);bool ok=test.own==1 && test.num>=margin+1; for(int t=d+1;ok && t<=min(H,min(left,d+8));t++) if(sim(s,j,t).own!=1) ok=false;ev[j][d][1]-=m;if(ok)hi=m;else lo=m+1;}
     use=lo;ev[j][d][1]+=use;
    }
    cand.push_back({i,use});total+=use;
    if(captured && (s.nodes[j].owner!=2 || (totalAvailable>total*1.15+10))){
     int horizon=min(left,100); double value=(double)s.nodes[j].growth * max(0,horizon-d);
     if(s.nodes[j].owner==2) value*=2.0;
     // Discount the gains against enemy proximity and the cost of tying troops up.
     double risk=1.0; if(nearestEnemy+1<d && s.nodes[j].owner==0) risk=0.4;
     double score=risk*value/(total+5.0+4.0*d);
     if(s.nodes[j].owner==0 && value<(s.nodes[j].troops+1)*1.1) score=0;
     if(score>bestScore){bestScore=score;bt=j;plan=cand;}
     break;
    }
   }
   for(auto q:cand)ev[j][s.dist[q.first][j]][1]-=q.second;
  }
  if(bt<0 || bestScore<0.5)break;
  for(auto [i,k]:plan){orders.push_back({i,bt,k});avail[i]-=k;ev[bt][s.dist[i][bt]][1]+=k;}
 }
 // Move surplus toward the frontier, keeping enough to deter immediate attacks.
 for(int i=0;i<n;i++) if(avail[i]>0){
  int near=99; for(int j=0;j<n;j++)if(s.nodes[j].owner==2)near=min(near,s.dist[i][j]);
  int reserve=0;
  for(int j=0;j<n;j++) if(s.nodes[j].owner==2 && s.dist[i][j]<=near+2){
   double factor=max(0.0,1.0-(s.dist[i][j]-2)*0.07);
   reserve=max(reserve,(int)(s.nodes[j].troops*factor*0.3));
  }
  int send=max(0,avail[i]-reserve);
  int dest=-1, best=near;
  for(int j=0;j<n;j++) if(i!=j && s.nodes[j].owner==1){
   int front=99;for(int k=0;k<n;k++)if(s.nodes[k].owner==2)front=min(front,s.dist[j][k]);
   if(front+s.dist[i][j]*0.35<best){best=front+s.dist[i][j]*0.35;dest=j;}
  }
  if(dest>=0 && send>2 && s.dist[i][dest]<left) orders.push_back({i,dest,send});
 }
 return orders;
}

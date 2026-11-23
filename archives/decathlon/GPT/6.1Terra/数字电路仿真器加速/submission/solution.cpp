#include <cstdint>
#include <vector>
#include <algorithm>
#include <unordered_map>
#include <omp.h>
#include <windows.h>
#include <cstring>
#include <climits>
using namespace std;
struct Circuit { int I,F,G,O,M,T; uint64_t seed; vector<int> d; vector<uint8_t> type; vector<int> in0,in1,in2; vector<int> out; };
static inline uint64_t mix(uint64_t x) { x+=0x9e3779b97f4a7c15ULL; x=(x^(x>>30))*0xbf58476d1ce4e5b9ULL; x=(x^(x>>27))*0x94d049bb133111ebULL; return x^(x>>31); }
static inline void transpose(uint64_t* a) {
 uint64_t mask=0xffffffffULL;
 for(int j=32;j;j>>=1) { for(int k=0;k<64;k=(k+j+1)&~j) {uint64_t x=(a[k]^(a[k+j]>>j))&mask; a[k]^=x; a[k+j]^=x<<j;} if(j>1) mask^=mask<<(j>>1); }
}
struct Gate { int a,b,c; unsigned char op; };
struct Key { int a,b,c,op; bool operator==(const Key& x) const {return a==x.a&&b==x.b&&c==x.c&&op==x.op;} };
struct Hash { size_t operator()(const Key& k) const { uint64_t x=(uint32_t)k.a*0x9e3779b1u; x=(x^(uint32_t)k.b)*0xbf58476d1ce4e5b9ULL; x=(x^(uint32_t)k.c)*0x94d049bb133111ebULL; return x^k.op; } };
vector<uint64_t> simulate(const Circuit& c) {
 const int base=2+c.I+c.F, n=base+c.G;
 vector<int> order; order.reserve(c.G); vector<unsigned char> vis(c.G); vector<pair<int,bool>> st;
 auto visit=[&](int root) { if(root<base) return; st.emplace_back(root-base,false); while(!st.empty()) {auto [g,done]=st.back(); st.pop_back(); if(done){order.push_back(g); continue;} if(vis[g]) continue; vis[g]=1; st.emplace_back(g,true); int op=c.type[g]; int v=c.in0[g]; if(v>=base&&!vis[v-base]) st.emplace_back(v-base,false); if(op!=6){v=c.in1[g]; if(v>=base&&!vis[v-base]) st.emplace_back(v-base,false);} if(op==7){v=c.in2[g]; if(v>=base&&!vis[v-base]) st.emplace_back(v-base,false);} } };

 vector<unsigned char> neededFF(c.F), reachable(c.G); vector<int> work=c.out;
 while(!work.empty()) {int x=work.back(); work.pop_back(); if(x>=2+c.I && x<base) {int f=x-2-c.I; if(!neededFF[f]) {neededFF[f]=1; work.push_back(c.d[f]);}} else if(x>=base) {int g=x-base; if(!reachable[g]) {reachable[g]=1; work.push_back(c.in0[g]); if(c.type[g]!=6) work.push_back(c.in1[g]); if(c.type[g]==7) work.push_back(c.in2[g]);}}}
 for(int i=0;i<c.F;i++) if(neededFF[i]) visit(c.d[i]); for(int x:c.out) visit(x);
 vector<int> map(n); for(int i=0;i<base;i++) map[i]=i;
 vector<Gate> gates; gates.reserve(order.size()); size_t cap=16; while(cap<order.size()*4+16) cap*=2; vector<int> tab(cap,-1); Hash hash;
 auto emit=[&](int op,int a,int b,int d)->int { Key k{a,b,d,op}; size_t pos=hash(k)&(cap-1); for(;;) {int i=tab[pos]; if(i<0) {int id=base+(int)gates.size(); tab[pos]=(int)gates.size(); gates.push_back({a,b,d,(unsigned char)op}); return id;} const auto &g=gates[i]; if(g.op==op && g.a==a && g.b==b && g.c==d) return base+i; pos=(pos+1)&(cap-1); } };
 auto neg=[&](int a)->int {if(a<2) return 1-a; if(a>=base && gates[a-base].op==6) return gates[a-base].a; return emit(6,a,0,0);};
 int originalMux=0; for(auto op:c.type) originalMux+=op==7; bool foldNeg=true;
 auto unnot=[&](int x)->int {return foldNeg && x>=base && gates[x-base].op==6 ? gates[x-base].a : -1;};
 for(int g:order) {int op=c.type[g], a=map[c.in0[g]],b=op==6?0:map[c.in1[g]],d=op==7?map[c.in2[g]]:0,r=-1;
  if(op==6) r=neg(a);
  else if(op==7) {int na=unnot(a); if(na>=0) {a=na; swap(b,d);} if(a==0) r=b; else if(a==1) r=d; else if(b==d) r=b; else if(b==0&&d==1) r=a; else if(b==1&&d==0) r=neg(a);
  else if(b==0 || b==a) {if(a==d) r=a; else {int x=a,y=d;if(x>y)swap(x,y);r=emit(0,x,y,0);}}
  else if(d==1 || d==a) {if(a==b) r=a; else {int x=a,y=b;if(x>y)swap(x,y);r=emit(1,x,y,0);}}
  else if(d==0 || unnot(d)==a) r=emit(8,a,b,0);
  else if(b==1 || unnot(b)==a) r=emit(9,d,a,0);
  else r=emit(op,a,b,d);}
  else {int na=unnot(a),nb=unnot(b); int kind0=op%3, invert=op>=3;
   if(na>=0 && nb>=0) {a=na;b=nb;if(kind0!=2) {kind0=1-kind0;invert=!invert;} op=kind0+(invert?3:0);}
   else if(na>=0 || nb>=0) {int negarg=na>=0?na:nb, other=na>=0?b:a;
    if(negarg==other) {r=(kind0==0)?0:1; if(invert) r=neg(r);}
    else if(kind0==2) {a=negarg;b=other;op=invert?2:5;}
    else {if(kind0==0) {a=negarg;b=other;op=invert?9:8;} else {a=other;b=negarg;op=invert?8:9;} }
   }
   if(r>=0) {} else if(op>=8) r=emit(op,a,b,0); else {if(a>b) swap(a,b); int inv=(op>=3); int kind=inv?op-3:op; int z=-1;
   auto absorb=[&](int x,int y)->int {if(y<base) return -1; auto g=gates[y-base]; if(kind==0 && g.op==1 && (g.a==x||g.b==x)) return x; if(kind==1 && g.op==0 && (g.a==x||g.b==x)) return x; if(kind==2 && (g.op==2||g.op==5) && (g.a==x||g.b==x)) {int q=g.a==x?g.b:g.a;return g.op==5?neg(q):q;} return -1;};
   if(originalMux*3<=c.G) {z=absorb(a,b); if(z<0) z=absorb(b,a);}
   if(z>=0) {} else if(kind==0){if(a==0) z=0; else if(a==1) z=b; else if(a==b) z=a;}
   else if(kind==1){if(a==0) z=b; else if(a==1) z=1; else if(a==b) z=a;}
   else {if(a==0) z=b; else if(a==1) z=neg(b); else if(a==b) z=0;}
   if(z>=0) r=inv?neg(z):z; else r=emit(op,a,b,0);
  }} map[base+g]=r;
 }
 vector<int> ds(c.F),os(c.O); for(int i=0;i<c.F;i++) ds[i]=neededFF[i]?map[c.d[i]]:0; for(int i=0;i<c.O;i++) os[i]=map[c.out[i]];

 // Drop computations that became dead after simplification.
 vector<unsigned char> live(gates.size()); vector<int> todo;
 for(int x:ds) if(x>=base) todo.push_back(x-base);
 for(int x:os) if(x>=base) todo.push_back(x-base);
 while(!todo.empty()) {int k=todo.back();todo.pop_back(); if(live[k]) continue; live[k]=1; auto g=gates[k]; if(g.a>=base) todo.push_back(g.a-base); if(g.op!=6 && g.b>=base) todo.push_back(g.b-base); if(g.op==7 && g.c>=base) todo.push_back(g.c-base);}
 vector<int> remap(gates.size()); vector<Gate> compact; compact.reserve(gates.size());
 auto rem=[&](int x) {return x<base?x:remap[x-base];};
 for(size_t i=0;i<gates.size();i++) if(live[i]) {auto g=gates[i]; g.a=rem(g.a); if(g.op!=6) g.b=rem(g.b); if(g.op==7) g.c=rem(g.c); remap[i]=base+(int)compact.size(); compact.push_back(g);}
 for(int &x:ds) x=rem(x); for(int &x:os) x=rem(x); gates.swap(compact);
 int muxCount=0; for(auto &g:gates) muxCount+=g.op==7; bool useCache=muxCount*10>(int)gates.size()*5;


 // Schedule updates once both the next value and the final read of the old state are available.
 vector<int> head(gates.size(),-1), link(c.F,-1), eventSlot(c.F,-1), eventNext(c.F); vector<unsigned char> eventDead(c.F), scheduled(c.F);
 bool early=useCache && !gates.empty(); for(int x:ds) if(x>=2+c.I && x<base) early=false;
 if(early) {vector<int> last(c.F,-1); auto ffread=[&](int x,int at){if(x>=2+c.I && x<base) last[x-(2+c.I)]=at;};
  for(int i=0;i<(int)gates.size();i++){auto g=gates[i];ffread(g.a,i);if(g.op!=6)ffread(g.b,i);if(g.op==7)ffread(g.c,i);} for(int x:os) ffread(x,(int)gates.size());
  for(int f=0;f<c.F;f++) if(neededFF[f]){int at=max(0,max(last[f],ds[f]>=base?ds[f]-base:-1));if(at<(int)gates.size()){scheduled[f]=1;link[f]=head[at];head[at]=f;}}
 }
 // Reuse slots as soon as their final consumer has executed.
 vector<int> uses(gates.size()), slots(gates.size()), freeSlots; int slotCount=base;
 auto ref=[&](int x){if(x>=base) ++uses[x-base];};
 for(auto &g:gates) {ref(g.a); if(g.op!=6) ref(g.b); if(g.op==7) ref(g.c);}
 for(int x:ds) ref(x); for(int x:os) ref(x);
 vector<unsigned char> storeGate(gates.size(),1);
 for(size_t i=0;i+1<gates.size();i++) if(uses[i]==1) {int v=base+(int)i; auto n=gates[i+1]; if((n.op==7 && n.a==v) || (n.op!=7 && (n.a==v || (n.op!=6 && n.op<8 && n.b==v)))) storeGate[i]=0;}
 auto getslot=[&](int x){return x<base?x:slots[x-base];};
 auto release=[&](int x)->bool {if(x>=base && --uses[x-base]==0) {freeSlots.push_back(slots[x-base]); return true;} return false;};
 vector<int> dst(gates.size()); vector<unsigned char> dead(gates.size());
 for(size_t i=0;i<gates.size();i++) {auto &g=gates[i]; int a=g.a,b=g.b,c0=g.c; g.a=getslot(a); if(g.op!=6) g.b=getslot(b); if(g.op==7) g.c=getslot(c0); if(release(a)) dead[i]|=1; if(g.op!=6 && release(b)) dead[i]|=2; if(g.op==7 && release(c0)) dead[i]|=4; int slot; if(freeSlots.empty()) slot=slotCount++; else {slot=freeSlots.back();freeSlots.pop_back();} slots[i]=dst[i]=slot; for(int f=head[i];f>=0;f=link[f]) {eventSlot[f]=getslot(ds[f]);eventDead[f]=release(ds[f]);} }
 for(int &x:ds) x=getslot(x); for(int &x:os) x=getslot(x);
 vector<int> na,nb,nc,nd;
 if(useCache) { na.resize(gates.size());nb.resize(gates.size());nc.resize(gates.size());nd.resize(gates.size()); vector<int> nx(slotCount,INT_MAX);
 for(int f=0;f<c.F;f++) if(!scheduled[f]) nx[ds[f]]=(int)gates.size(); for(int x:os) nx[x]=(int)gates.size();
 for(int i=(int)gates.size()-1;i>=0;i--) {auto g=gates[i]; for(int f=head[i];f>=0;f=link[f]) eventNext[f]=nx[eventSlot[f]]; for(int f=head[i];f>=0;f=link[f]) nx[eventSlot[f]]=i; nd[i]=nx[dst[i]];nx[dst[i]]=INT_MAX; na[i]=nx[g.a];if(g.op!=6)nb[i]=nx[g.b];if(g.op==7)nc[i]=nx[g.c];nx[g.a]=i;if(g.op!=6)nx[g.b]=i;if(g.op==7)nx[g.c]=i;}
 }

 bool directFF=true; vector<int> dsJit=ds, snapshot; vector<int> snapshotMap(c.F,-1); for(int i=0;i<c.F;i++) if(ds[i]>=2+c.I && ds[i]<base) {directFF=false;int f=ds[i]-(2+c.I); if(snapshotMap[f]<0) {snapshotMap[f]=slotCount+(int)snapshot.size();snapshot.push_back(ds[i]);} dsJit[i]=snapshotMap[f];} slotCount+=(int)snapshot.size();
 vector<uint64_t> weights((size_t)c.T*c.O); for(size_t i=0;i<weights.size();i++) weights[i]=mix(i); 
 int groups=(c.O+3)/4; vector<uint64_t> hashTable((size_t)c.T*groups*16);
 for(int t=0;t<c.T;t++) for(int g=0;g<groups;g++) {uint64_t* table=&hashTable[((size_t)t*groups+g)*16]; for(int x=1;x<16;x++){int b=__builtin_ctz((unsigned)x); int j=g*4+b;table[x]=table[x&(x-1)]^(j<c.O?weights[(size_t)t*c.O+j]:0);}}


 // Compile the sorted Boolean network to straight-line x86-64 instructions.
 vector<unsigned char> code; code.reserve(gates.size()*32+1);
 if(useCache) {
 auto mem=[&](int reg,int id,bool load) { code.push_back(0xc5); code.push_back(reg<8?0xfe:0x7e); code.push_back(load?0x6f:0x7f); code.push_back(0x81|((reg&7)<<3)); uint32_t d=(uint32_t)id*32; for(int i=0;i<4;i++) code.push_back((d>>(8*i))&255); };
 auto regop=[&](int op,int dst,int a,int b) {if(dst<8 && b<8) {code.push_back(0xc5);code.push_back((unsigned char)(0x85|((~a&15)<<3)));} else {code.push_back(0xc4);code.push_back(0xe1^(dst>=8?0x80:0)^(b>=8?0x20:0));code.push_back((unsigned char)(0x05|((~a&15)<<3)));}code.push_back(op);code.push_back(0xc0|((dst&7)<<3)|(b&7));};
 auto regmem=[&](int op,int dest,int a,int id) {code.push_back(0xc5);code.push_back((unsigned char)((0x85|((~a&15)<<3))^(dest>=8?0x80:0)));code.push_back(op);code.push_back(0x81|((dest&7)<<3));uint32_t d=(uint32_t)id*32;for(int i=0;i<4;i++)code.push_back((d>>(8*i))&255);};
 auto xmmstack=[&](int r, bool load){ code.push_back(0xf3);if(r>=8)code.push_back(0x44);code.push_back(0x0f);code.push_back(load?0x6f:0x7f);code.push_back(0x84|((r&7)<<3));code.push_back(0x24);int d=(r-6)*16;for(int i=0;i<4;i++) code.push_back((d>>(8*i))&255);};
 code.insert(code.end(),{0x48,0x81,0xec,0xa8,0,0,0});
 for(int r=6;r<16;r++) xmmstack(r,false);
 code.insert(code.end(),{0xc5,0xf5,0x76,0xc9});
 int horizon=(muxCount*20>(int)gates.size()*14)?2:(muxCount*20>(int)gates.size()*13)?16:8; int penalty=(muxCount*10>(int)gates.size()*7)?256:64; int ids[16]; bool dirty[16]={}; int age[16]={}; for(int &x:ids) x=-1; int clk=0;
 auto alloc=[&](int protect)->int {int best=-1; for(int r=0;r<16;r++) if(r!=1 && !(protect&(1<<r)) && (best<0 || ids[r]<0 || (ids[best]>=0 && (long long)age[r]-(dirty[r]?penalty:0)>(long long)age[best]-(dirty[best]?penalty:0)))) {best=r; if(ids[r]<0) break;} if(ids[best]>=0 && dirty[best]) mem(best,ids[best],false); ids[best]=-1;dirty[best]=false;age[best]=++clk; return best;};
 auto get=[&](int id,int protect)->int {for(int r=0;r<16;r++) if(r!=1 && ids[r]==id){return r;} int r=alloc(protect); mem(r,id,true); ids[r]=id; return r;};
 for(size_t i=0;i<gates.size();i++) {auto g=gates[i]; int a=get(g.a,0), mask=1<<a,b=-1,c0=-1;
  auto cached=[&](int id){for(int r=0;r<16;r++) if(r!=1 && ids[r]==id) return true;return false;};
  if(g.op!=6 && (cached(g.b) || nb[i]<(int)i+horizon)) {b=get(g.b,mask);mask|=1<<b;} if(g.op==7 && (cached(g.c) || nc[i]<(int)i+horizon)) {c0=get(g.c,mask);mask|=1<<c0;}
  age[a]=na[i];if(b>=0)age[b]=nb[i];if(c0>=0)age[c0]=nc[i]; int out=(dead[i]&1)?a:((dead[i]&2)&&b>=0)?b:((dead[i]&4)&&c0>=0)?c0:alloc(mask); mask|=1<<out;
  auto opb=[&](int op,int dst,int x,int r,int slot){if(r<0)regmem(op,dst,x,slot);else regop(op,dst,x,r);};
  if(g.op==7) {int tmp=alloc(mask); opb(0xdf,tmp,a,b,g.b); opb(0xdb,out,a,c0,g.c); regop(0xeb,out,out,tmp);}
  else if(g.op==6) regop(0xef,out,a,1);
  else {int op=(g.op>=8)?0xdf:(g.op%3==0)?0xdb:(g.op%3==1)?0xeb:0xef; opb(op,out,a,b,g.b); if((g.op>=3 && g.op<=6) || g.op==9) regop(0xef,out,out,1);}
  if(dead[i]&1){ids[a]=-1;dirty[a]=false;} if((dead[i]&2)&&b>=0){ids[b]=-1;dirty[b]=false;} if((dead[i]&4)&&c0>=0){ids[c0]=-1;dirty[c0]=false;}
  ids[out]=dst[i];dirty[out]=true;age[out]=nd[i];
  for(int f=head[i];f>=0;f=link[f]) {int target=2+c.I+f;for(int r=0;r<16;r++) if(r!=1 && ids[r]==target){ids[r]=-1;dirty[r]=false;} int r=get(eventSlot[f],0);mem(r,target,false);if(eventDead[f]){ids[r]=-1;dirty[r]=false;} else age[r]=eventNext[f];}
 }
 for(int r=0;r<16;r++) if(r!=1 && ids[r]>=0 && dirty[r]) mem(r,ids[r],false);
 for(int r=6;r<16;r++) xmmstack(r,true); code.insert(code.end(),{0x48,0x81,0xc4,0xa8,0,0,0});
 } else {
 auto mem=[&](unsigned char x, unsigned char y,int id) {code.push_back(0xc5); code.push_back(x); code.push_back(y); code.push_back(0x81); uint32_t d=(uint32_t)id*32; for(int i=0;i<4;i++) code.push_back((d>>(8*i))&255);};
 code.insert(code.end(),{0xc5,0xf5,0x76,0xc9}); // all ones in ymm1
 for(size_t i=0;i<gates.size();i++) {auto g=gates[i]; int prev=i?dst[i-1]:-1; if(g.op!=6 && g.op!=7 && g.op<8 && g.b==prev) swap(g.a,g.b);
  if(g.op==7) {if(g.a!=prev) mem(0xfe,0x6f,g.a); code.insert(code.end(),{0xc5,0xfd,0xdf,0x91}); uint32_t d=(uint32_t)g.b*32; for(int k=0;k<4;k++) code.push_back((d>>(8*k))&255); mem(0xfd,0xdb,g.c); code.insert(code.end(),{0xc5,0xfd,0xeb,0xc2});}
  else {if(g.a!=prev) mem(0xfe,0x6f,g.a); if(g.op!=6) {int op=(g.op>=8)?0xdf:(g.op%3==0)?0xdb:(g.op%3==1)?0xeb:0xef; mem(0xfd,op,g.b);} if((g.op>=3 && g.op<=6) || g.op==9) code.insert(code.end(),{0xc5,0xfd,0xef,0xc1}); }
  if(storeGate[i]) mem(0xfe,0x7f,dst[i]);
 }
 }
 code.insert(code.end(),{0xc5,0xf8,0x77,0xc3});
 size_t ffOffset=code.size(); {int prev=-1; auto mov=[&](int op,int id) {code.push_back(0xc5);code.push_back(0xfe);code.push_back(op);code.push_back(0x81);uint32_t d=(uint32_t)id*32;for(int i=0;i<4;i++)code.push_back((d>>(8*i))&255);};for(size_t i=0;i<snapshot.size();i++){mov(0x6f,snapshot[i]);mov(0x7f,slotCount-(int)snapshot.size()+(int)i);} for(int i=0;i<c.F;i++){if(scheduled[i]) continue;if(dsJit[i]!=prev)mov(0x6f,dsJit[i]);mov(0x7f,2+c.I+i);prev=dsJit[i];}code.insert(code.end(),{0xc5,0xf8,0x77,0xc3});}
 void* executable=VirtualAlloc(nullptr,code.size(),MEM_COMMIT|MEM_RESERVE,PAGE_EXECUTE_READWRITE);
 if(executable) {memcpy(executable,code.data(),code.size()); FlushInstructionCache(GetCurrentProcess(),executable,code.size());}
 using Fn=void(*)(uint64_t*); Fn fn=(Fn)executable; Fn ffFn=executable?(Fn)((unsigned char*)executable+ffOffset):nullptr;
 vector<uint64_t> ans(c.M); int batches=(c.M+255)/256; int threads=(muxCount*20>(int)gates.size()*10 && muxCount*20<(int)gates.size()*13)?10:8;
 #pragma omp parallel for schedule(dynamic,1) num_threads(threads) if(batches>1)
 for(int batch=0;batch<batches;batch++) {
  int count=min(256,c.M-batch*256); vector<uint64_t> v((size_t)slotCount*4), next(c.F*4); uint64_t state[256], h[256]={};
  for(int l=0;l<4;l++) v[4+l]=~uint64_t(0); for(int i=0;i<count;i++) state[i]=mix(c.seed^(uint64_t)(batch*256+i));
  for(int t=0;t<c.T;t++) {
   for(int l=0;l<4;l++) {uint64_t rows[64]={}; int cnt=max(0,min(64,count-l*64));
    for(int m=0;m<cnt;m++) {uint64_t z=state[l*64+m]+=0x9e3779b97f4a7c15ULL; z=(z^(z>>30))*0xbf58476d1ce4e5b9ULL; z=(z^(z>>27))*0x94d049bb133111ebULL; rows[63-m]=z^(z>>31); }
    transpose(rows); for(int i=0;i<c.I;i++) v[(2+i)*4+l]=i<64 ? rows[63-i]:0;
   }
   if(fn) fn(v.data()); else { int gi=0; for(const Gate &g:gates) {int idx=dst[gi++]; for(int l=0;l<4;l++){uint64_t a=v[g.a*4+l],b=v[g.b*4+l],x; switch(g.op){case 0:x=a&b;break;case 1:x=a|b;break;case 2:x=a^b;break;case 3:x=~(a&b);break;case 4:x=~(a|b);break;case 5:x=~(a^b);break;case 6:x=~a;break;case 8:x=~a&b;break;case 9:x=~(~a&b);break;default:x=b^(a&(b^v[g.c*4+l]));} v[idx*4+l]=x;} for(int f=head[gi-1];f>=0;f=link[f]) memcpy(&v[(2+c.I+f)*4],&v[eventSlot[f]*4],32); } }
   for(int l=0;l<4;l++) {int cnt=max(0,min(64,count-l*64)); if(!cnt) continue; uint64_t rows[64]={}; for(int j=0;j<c.O;j++) rows[63-j]=v[os[j]*4+l]; transpose(rows); const uint64_t* tb=&hashTable[(size_t)t*groups*16]; for(int m=0;m<cnt;m++){uint64_t bits=rows[63-m], h0=h[l*64+m]; for(int g=0;g<groups;g++) {h0^=tb[g*16+(bits&15)];bits>>=4;} h[l*64+m]=h0;}}
   if(ffFn) ffFn(v.data()); else if(directFF) {for(int i=0;i<c.F;i++) if(!scheduled[i]) memcpy(&v[(2+c.I+i)*4], &v[ds[i]*4], 32);} else {for(int i=0;i<c.F;i++) for(int l=0;l<4;l++) next[i*4+l]=v[ds[i]*4+l]; for(int i=0;i<c.F;i++) for(int l=0;l<4;l++) v[(2+c.I+i)*4+l]=next[i*4+l];}
  }
  for(int i=0;i<count;i++) ans[batch*256+i]=h[i];
 }
 if(executable) VirtualFree(executable,0,MEM_RELEASE);
 return ans;
}








#include <cstdint>
#include <vector>
#include <algorithm>
#include <array>
#include <cstring>
#include <map>
#include <unordered_map>
#include <immintrin.h>
#include <omp.h>
#include <windows.h>
struct Circuit {
 int I,F,G,O,M,T; uint64_t seed;
 std::vector<int> d; std::vector<uint8_t> type; std::vector<int> in0,in1,in2; std::vector<int> out;
};
namespace {
uint64_t mix(uint64_t x) { x+=0x9E3779B97F4A7C15ULL; x=(x^(x>>30))*0xBF58476D1CE4E5B9ULL; x=(x^(x>>27))*0x94D049BB133111EBULL; return x^(x>>31); }


template<int J> inline void transpose_step(uint64_t* a) {
 constexpr uint64_t mask=J==32?0xffffffffULL:J==16?0x0000ffff0000ffffULL:J==8?0x00ff00ff00ff00ffULL:J==4?0x0f0f0f0f0f0f0f0fULL:J==2?0x3333333333333333ULL:0x5555555555555555ULL;
 const __m256i m=_mm256_set1_epi64x(mask);
 if constexpr(J>=4) {
  for(int base=0;base<64;base+=2*J)for(int k=0;k<J;k+=4){
   auto x=_mm256_loadu_si256((const __m256i*)(a+base+k)),y=_mm256_loadu_si256((const __m256i*)(a+base+k+J));
   auto t=_mm256_and_si256(_mm256_xor_si256(_mm256_srli_epi64(x,J),y),m);
   x=_mm256_xor_si256(x,_mm256_slli_epi64(t,J));y=_mm256_xor_si256(y,t);
   _mm256_storeu_si256((__m256i*)(a+base+k),x);_mm256_storeu_si256((__m256i*)(a+base+k+J),y);
  }
 } else {
  for(int k=0;k<64;k+=4){
   auto x=_mm256_loadu_si256((const __m256i*)(a+k));auto y=_mm256_permute4x64_epi64(x,J==2?0x4e:0xb1);
   auto t=_mm256_and_si256(_mm256_xor_si256(_mm256_srli_epi64(x,J),y),m);
   auto lo=_mm256_xor_si256(x,_mm256_slli_epi64(t,J)),hi=_mm256_xor_si256(x,_mm256_permute4x64_epi64(t,J==2?0x4e:0xb1));
   _mm256_storeu_si256((__m256i*)(a+k),_mm256_blend_epi32(lo,hi,J==2?0xf0:0xcc));
  }
 }
}
void transpose(uint64_t* a){transpose_step<32>(a);transpose_step<16>(a);transpose_step<8>(a);transpose_step<4>(a);transpose_step<2>(a);transpose_step<1>(a);}

void transpose8x64(const uint64_t* a,uint8_t* out) {
 auto r0=_mm_loadl_epi64((const __m128i*)(a+0)),r1=_mm_loadl_epi64((const __m128i*)(a+1));
 auto r2=_mm_loadl_epi64((const __m128i*)(a+2)),r3=_mm_loadl_epi64((const __m128i*)(a+3));
 auto r4=_mm_loadl_epi64((const __m128i*)(a+4)),r5=_mm_loadl_epi64((const __m128i*)(a+5));
 auto r6=_mm_loadl_epi64((const __m128i*)(a+6)),r7=_mm_loadl_epi64((const __m128i*)(a+7));
 auto t0=_mm_unpacklo_epi8(r0,r1),t1=_mm_unpacklo_epi8(r2,r3),t2=_mm_unpacklo_epi8(r4,r5),t3=_mm_unpacklo_epi8(r6,r7);
 auto u0=_mm_unpacklo_epi16(t0,t1),u1=_mm_unpackhi_epi16(t0,t1),u2=_mm_unpacklo_epi16(t2,t3),u3=_mm_unpackhi_epi16(t2,t3);
 auto y0=_mm_unpacklo_epi32(u0,u2),y1=_mm_unpackhi_epi32(u0,u2),y2=_mm_unpacklo_epi32(u1,u3),y3=_mm_unpackhi_epi32(u1,u3);
 __m256i q[2]={_mm256_inserti128_si256(_mm256_castsi128_si256(y0),y1,1),_mm256_inserti128_si256(_mm256_castsi128_si256(y2),y3,1)};
 for(int i=0;i<2;i++){
  auto x=q[i];
  auto t=_mm256_and_si256(_mm256_xor_si256(x,_mm256_srli_epi64(x,7)),_mm256_set1_epi64x(0x00aa00aa00aa00aaULL));x=_mm256_xor_si256(x,_mm256_xor_si256(t,_mm256_slli_epi64(t,7)));
  t=_mm256_and_si256(_mm256_xor_si256(x,_mm256_srli_epi64(x,14)),_mm256_set1_epi64x(0x0000cccc0000ccccULL));x=_mm256_xor_si256(x,_mm256_xor_si256(t,_mm256_slli_epi64(t,14)));
  t=_mm256_and_si256(_mm256_xor_si256(x,_mm256_srli_epi64(x,28)),_mm256_set1_epi64x(0x00000000f0f0f0f0ULL));x=_mm256_xor_si256(x,_mm256_xor_si256(t,_mm256_slli_epi64(t,28)));
  _mm256_storeu_si256((__m256i*)(out+i*32),x);
 }
}
struct Node { int op,a,b,c; };
struct Key { int op,a,b,c; bool operator==(const Key& k) const {return op==k.op&&a==k.a&&b==k.b&&c==k.c;} };
struct KH { size_t operator()(const Key& k) const {uint64_t x=(uint64_t)(uint32_t)k.a*0x9e3779b185ebca87ULL+(uint64_t)(uint32_t)k.b*0xc2b2ae3d27d4eb4fULL+(uint64_t)(uint32_t)k.c*0x165667b19e3779f9ULL+k.op; x^=x>>29; return x;} };

struct Cut {uint64_t tt=0;std::array<int,6> leaf{};int k=0;};
struct Net {
 int base; bool logic; std::vector<Node> n;std::vector<Cut> cuts;
 std::vector<int> table,ftable;
 Net(int b,bool l=false):base(b),logic(l),n(b),table(1<<20,-1){
  n.reserve(510000);
  if(logic){cuts.resize(b);cuts.reserve(510000);ftable.assign(1<<20,-1);for(int i=1;i<b;i++){cuts[i].tt=0xaaaaaaaaaaaaaaaaULL;cuts[i].k=1;cuts[i].leaf[0]=i;}}
 }
 Cut mergecut(int a,int b,int c,int op) {
  int edges[3]={a,b,c},count=op==2?3:2;
  Cut q[3];for(int i=0;i<count;i++)q[i]=cuts[edges[i]/2];
  Cut result;
  for(;;) {
   result.k=0; bool fail=false;
   for(int t=0;t<count;t++)for(int j=0;j<q[t].k;j++){
    int v=q[t].leaf[j],pos=0;while(pos<result.k&&result.leaf[pos]<v)pos++;
    if(pos<result.k&&result.leaf[pos]==v)continue;
    if(result.k==6){fail=true;break;}
    for(int z=result.k;z>pos;z--)result.leaf[z]=result.leaf[z-1];result.leaf[pos]=v;result.k++;
   }
   if(!fail)break;
   int best=-1;for(int t=0;t<count;t++)if(q[t].k>1&&(best<0||q[t].k>q[best].k))best=t;
   if(best<0)break;
   q[best].k=1;q[best].leaf[0]=edges[best]/2;q[best].tt=0xaaaaaaaaaaaaaaaaULL;
  }
  uint64_t tables[3]={};
  static const uint64_t mask[6]={0x5555555555555555ULL,0x3333333333333333ULL,0x0f0f0f0f0f0f0f0fULL,0x00ff00ff00ff00ffULL,0x0000ffff0000ffffULL,0x00000000ffffffffULL};
  for(int t=0;t<count;t++){
   uint64_t x=q[t].tt;int j=0;
   for(int k=0;k<result.k;k++)if(j<q[t].k&&q[t].leaf[j]==result.leaf[k])j++;else {x=_pdep_u64(x,mask[k]);x|=x<<(1<<k);}
   tables[t]=x^-(uint64_t)(edges[t]&1);
  }
  uint64_t x=op==0?(tables[0]&tables[1]):op==1?(tables[0]^tables[1]):((tables[0]&tables[2])|(~tables[0]&tables[1]));
  for(int k=0;k<result.k;){int step=1<<k;if(((x^(x>>step))&mask[k])==0){x=_pext_u64(x,mask[k]);x|=x<<32;for(int j=k;j<result.k-1;j++)result.leaf[j]=result.leaf[j+1];result.k--;}else k++;}
  result.tt=x;return result;
 }
 int put(int op,int a,int b,int c=0) {
  Key key{op,a,b,c};size_t h=KH{}(key)&(table.size()-1);
  while(table[h]>=0){int i=table[h];Node z=n[i];if(z.op==op&&z.a==a&&z.b==b&&z.c==c)return i*2;h=(h+1)&(table.size()-1);}
  Cut cut;int inv=0;size_t fh=0;
  if(logic){cut=mergecut(a,b,c,op);if(cut.k==0)return cut.tt&1;
   if(cut.k==1)return cut.leaf[0]*2+(int)(cut.tt&1);
   inv=cut.tt&1;uint64_t tt=cut.tt^-(uint64_t)inv;
   uint64_t hash=tt*0x9e3779b185ebca87ULL;for(int i=0;i<cut.k;i++)hash=(hash^(cut.leaf[i]*0xc2b2ae3d27d4eb4fULL))*0x165667b19e3779f9ULL;hash^=hash>>32;
   fh=hash&(ftable.size()-1);
   while(ftable[fh]>=0){int i=ftable[fh];const auto &z=cuts[i];if(z.k==cut.k&&(z.tt^-(uint64_t)(z.tt&1))==tt&&std::equal(z.leaf.begin(),z.leaf.begin()+z.k,cut.leaf.begin()))return i*2+((z.tt&1)^inv);fh=(fh+1)&(ftable.size()-1);}
  }
  int i=n.size();table[h]=i;n.push_back({op,a,b,c});if(logic){cuts.push_back(cut);ftable[fh]=i;}return i*2;
 }
 int And(int a,int b) {
  if(a>b)std::swap(a,b);
  if(a==0||a==(b^1))return 0; if(a==1)return b; if(a==b)return a;
  return put(0,a,b);
 }
 int Xor(int a,int b) {
  int inv=(a^b)&1; a&=~1;b&=~1; if(a>b)std::swap(a,b);
  if(a==0)return b^inv; if(a==b)return inv;
  return put(1,a,b)^inv;
 }
 int Mux(int s,int a,int b) {
  if(s&1){s^=1;std::swap(a,b);} if(s==0)return a;
  if(a==b)return a; if(a==(b^1))return Xor(s,a);
  if(a==0)return And(s,b); if(a==1)return And(s,b^1)^1;
  if(b==0)return And(s^1,a); if(b==1)return And(s^1,a^1)^1;
  if(s==a)return And(s,b); if(s==(a^1))return And(s,b^1)^1;
  if(s==b)return And(s^1,a^1)^1; if(s==(b^1))return And(s^1,a);
  int inv=a&1; a^=inv;b^=inv;
  return put(2,s,a,b)^inv;
 }
};

struct Gather {int width,first,h;std::array<int,8> sel{};std::vector<std::pair<int,int>> dest;};
struct Multiply {int bits=0;std::array<int,32> a{},b{};std::vector<std::pair<int,int>> dest;};
struct Plan {int base;std::vector<Node> n;std::vector<int> d,out;std::vector<Gather> gathers;std::vector<Multiply> mults;};
Plan build(const Circuit& c) {
 int base=1+c.I+c.F, origbase=2+c.I+c.F;
 std::vector<int> order; order.reserve(c.G);
 std::vector<unsigned char> seen(c.G,0); std::vector<int> st;
 for(int k=0;k<c.G;++k)if(!seen[k]) {
  st.push_back(k);
  while(!st.empty()) {int g=st.back(); if(seen[g]==2){st.pop_back();continue;} if(seen[g]==1){seen[g]=2;order.push_back(g);st.pop_back();continue;}
   seen[g]=1;
   int ins[]={c.in0[g],c.in1[g],c.in2[g]};for(int a:ins)if(a>=origbase&&!seen[a-origbase])st.push_back(a-origbase);
  }
 }
 int same=0;for(int g=0;g<c.G;g++)if(c.in0[g]==c.in1[g])same++;
 Net net(base,same>c.G/30&&c.G>10000); std::vector<int> mp(origbase+c.G);mp[0]=0;mp[1]=1;for(int i=2;i<origbase;i++)mp[i]=2*(i-1);
 for(int g:order) {int a=mp[c.in0[g]],b=c.in1[g]<0?0:mp[c.in1[g]],d=c.in2[g]<0?0:mp[c.in2[g]],r=0;
  switch(c.type[g]) {case 0:r=net.And(a,b);break;case 1:r=net.And(a^1,b^1)^1;break;case 2:r=net.Xor(a,b);break;case 3:r=net.And(a,b)^1;break;case 4:r=net.And(a^1,b^1);break;case 5:r=net.Xor(a,b)^1;break;case 6:r=a^1;break;case 7:r=net.Mux(a,b,d);}
  mp[origbase+g]=r;
 }
 std::vector<uint8_t> live(net.n.size(),0);for(int d:c.d)live[mp[d]/2]=1;for(int o:c.out)live[mp[o]/2]=1;
 for(int i=(int)net.n.size()-1;i>=base;--i)if(live[i]) {Node z=net.n[i];live[z.a/2]=1;live[z.b/2]=1;if(z.op==2)live[z.c/2]=1;}
 std::vector<int> ren(net.n.size());Plan p; p.base=base;p.n.resize(base);
 for(int i=0;i<base;i++)ren[i]=i*2;
 auto edge=[&](int a){return ren[a/2]^(a&1);};
 for(int i=base;i<(int)net.n.size();i++)if(live[i]) {Node z=net.n[i];ren[i]=2*(int)p.n.size();p.n.push_back({z.op,edge(z.a),edge(z.b),edge(z.c)});}
 for(int d:c.d)p.d.push_back(edge(mp[d]));for(int o:c.out)p.out.push_back(edge(mp[o]));
 return p;
}

void integer_multiplies(Plan& p) {
 int N=p.n.size(),ands=0,muxes=0;
 for(int i=p.base;i<N;i++){ands+=p.n[i].op==0;muxes+=p.n[i].op==2;}
 if(N<10000||ands<N/2||muxes>N/30)return;
 std::vector<int> hash(1<<20,-1);
 for(int i=p.base;i<N;i++) {auto z=p.n[i];Key k{z.op,z.a,z.b,z.c};size_t h=KH{}(k)&(hash.size()-1);while(hash[h]>=0)h=(h+1)&(hash.size()-1);hash[h]=i;}
 auto xor_node=[&](int a,int b){
  int phase=(a^b)&1;a&=~1;b&=~1;if(a>b)std::swap(a,b);if(a==0)return b^phase;if(a==b)return phase;
  size_t h=KH{}(Key{1,a,b,0})&(hash.size()-1);
  while(hash[h]>=0){int i=hash[h];auto z=p.n[i];if(z.op==1&&z.a==a&&z.b==b)return i*2^phase;h=(h+1)&(hash.size()-1);}return -1;
 };
 struct Adder {int a,b,c,sum,carry;};std::vector<Adder> units;
 std::vector<uint8_t> covered(N);
 for(int i=p.base;i<N;i++){
  auto z=p.n[i];if(z.op!=0||!(z.a&1)||!(z.b&1))continue;
  int pair[2]={z.a/2,z.b/2};
  for(int side=0;side<2;side++){
   auto ab=p.n[pair[side]],xc=p.n[pair[1-side]];if(ab.op!=0||xc.op!=0)continue;
   int x=xor_node(ab.a,ab.b);if(x<0)continue;
   int c=xc.a==x?xc.b:xc.b==x?xc.a:-1;
   if(c<0||ab.a/2<p.base||ab.b/2<p.base||c/2<p.base)continue;
   int sum=xor_node(x,c);if(sum<0)continue;
   covered[pair[0]]=covered[pair[1]]=1;units.push_back({ab.a,ab.b,c,sum,i*2+1});break;
  }
 }
 for(int i=p.base;i<N;i++)if(!covered[i]){
  auto z=p.n[i];if(z.op!=0||z.a/2<p.base||z.b/2<p.base)continue;
  int sum=xor_node(z.a,z.b);if(sum>=0)units.push_back({z.a,z.b,-1,sum,i*2});
 }
 struct DSU {
  std::vector<int> parent,size,diff;std::vector<uint8_t> bad;
  DSU(int n):parent(n),size(n,1),diff(n),bad(n){for(int i=0;i<n;i++)parent[i]=i;}
  std::pair<int,int> find(int x){int r=x,d=0;while(parent[r]!=r){d+=diff[r];r=parent[r];}int v=x,rest=d;while(parent[v]!=v){int next=parent[v],old=diff[v];parent[v]=r;diff[v]=rest;rest-=old;v=next;}return {r,d};}
  void join(int x,int y,int offset){auto [a,da]=find(x);auto[b,db]=find(y);if(a==b){if(db-da!=offset)bad[a]=1;return;}if(size[a]<size[b]){std::swap(a,b);std::swap(da,db);offset=-offset;}parent[b]=a;diff[b]=offset+da-db;size[a]+=size[b];bad[a]|=bad[b];}
 } dsu(N);
 auto partial=[&](int e){auto z=p.n[e/2];return z.op==0&&z.a/2<p.base&&z.b/2<p.base;};
 for(auto u:units){if(!partial(u.a))dsu.join(u.sum/2,u.a/2,0);if(!partial(u.b))dsu.join(u.sum/2,u.b/2,0);if(u.c>=0&&!partial(u.c))dsu.join(u.sum/2,u.c/2,0);dsu.join(u.sum/2,u.carry/2,1);}
 std::vector<std::vector<int>> comps(N);
 for(int i=0;i<(int)units.size();i++)comps[dsu.find(units[i].sum/2).first].push_back(i);
 std::vector<int> vertexIndex(p.base*2,-1),replacement(N,-1),phase(N);std::vector<Multiply> mults;
 int newbase=p.base;
 for(int root=p.base;root<N;root++)if(comps[root].size()>=100&&!dsu.bad[dsu.find(root).first]){
  std::unordered_map<int,int> balance,sourceWeights;balance.reserve(comps[root].size()*3);bool consistent=true;
  for(int id:comps[root]){auto u=units[id];balance[u.a]++;balance[u.b]++;if(u.c>=0)balance[u.c]++;balance[u.sum]--;balance[u.carry]--;
   int inputs[3]={u.a,u.b,u.c};int weight=dsu.find(u.sum/2).second;
   for(int e:inputs)if(e>=0&&partial(e)){auto [it,inserted]=sourceWeights.emplace(e,weight);if(!inserted&&it->second!=weight)consistent=false;}
  }
  if(!consistent)continue;
  struct PP {int a,b,w;};std::vector<PP> sources;std::vector<std::pair<int,int>> outputs;bool ok=true;
  for(auto [e,v]:balance)if(v){
   if(v==1){auto z=p.n[e/2];if((e&1)||z.op!=0||z.a/2>=p.base||z.b/2>=p.base||z.a<2||z.b<2){ok=false;break;}sources.push_back({z.a,z.b,sourceWeights[e]});}
   else if(v==-1)outputs.emplace_back(e,dsu.find(e/2).second);else{ok=false;break;}
  }
  if(!ok)continue;
  int K=0;for(int k=16;k<=32;k++)if((int)sources.size()==k*k-1){K=k;break;}
  if(!K||(int)outputs.size()!=2*K-1)continue;
  std::vector<int> vertices;std::vector<std::vector<int>> adjacency;
  auto vertex=[&](int e){int &id=vertexIndex[e];if(id<0){id=vertices.size();vertices.push_back(e);adjacency.emplace_back();}return id;};
  for(auto e:sources){int a=vertex(e.a),b=vertex(e.b);adjacency[a].push_back(b);adjacency[b].push_back(a);}
  std::vector<int> color(vertices.size(),-1),queue;
  if((int)vertices.size()!=2*K)ok=false;
  if(ok){queue.push_back(0);color[0]=0;for(size_t q=0;q<queue.size();q++){int a=queue[q];for(int b:adjacency[a])if(color[b]<0){color[b]=color[a]^1;queue.push_back(b);}else if(color[b]==color[a])ok=false;}}
  std::vector<int> aa,bb;
  if(ok)for(int v=0;v<(int)vertices.size();v++)(color[v]==0?aa:bb).push_back(v);
  if(aa.size()!=K||bb.size()!=K)ok=false;
  const int Missing=1000000000;
  std::vector<int> matrix(K*K,Missing),posA(K),posB(K),aIndex(vertices.size(),-1),bIndex(vertices.size(),-1);
  if(ok){for(int j=0;j<K;j++){aIndex[aa[j]]=j;bIndex[bb[j]]=j;}
   for(auto e:sources){int a=vertexIndex[e.a],b=vertexIndex[e.b];if(color[a])std::swap(a,b);matrix[aIndex[a]*K+bIndex[b]]=e.w;}
   int ar=-1,br=-1;for(int i=0;i<K;i++){bool fullrow=true,fullcol=true;for(int j=0;j<K;j++){fullrow&=matrix[i*K+j]!=Missing;fullcol&=matrix[j*K+i]!=Missing;}if(fullrow)ar=i;if(fullcol)br=i;}
   if(ar<0||br<0)ok=false;
   else {int ma=Missing,mb=Missing;for(int i=0;i<K;i++){ma=std::min(ma,matrix[i*K+br]);mb=std::min(mb,matrix[ar*K+i]);}
    for(int i=0;i<K;i++){posA[i]=matrix[i*K+br]-ma;posB[i]=matrix[ar*K+i]-mb;}
   }
  }
  Multiply m;m.bits=K;
  if(ok){std::vector<int> usedA(K),usedB(K);for(int i=0;i<K;i++){if(posA[i]<0||posA[i]>=K||posB[i]<0||posB[i]>=K){ok=false;break;}usedA[posA[i]]++;usedB[posB[i]]++;m.a[posA[i]]=vertices[aa[i]];m.b[posB[i]]=vertices[bb[i]];}
   for(int i=0;i<K;i++)if(usedA[i]!=1||usedB[i]!=1)ok=false;
  }
  int offset=0;
  if(ok){bool have=false;for(int i=0;i<K;i++)for(int j=0;j<K;j++){
    int w=matrix[i*K+j];if(w==Missing){if(posA[i]||posB[j])ok=false;}else {int d=w-posA[i]-posB[j];if(!have){offset=d;have=true;}else if(d!=offset)ok=false;}
   }
  }
  std::vector<int> bitToEdge(K*2,-1);
  if(ok)for(auto [e,w]:outputs){int bit=w-offset;if(bit<=0||bit>=K*2||bitToEdge[bit]>=0||replacement[e/2]>=0){ok=false;break;}bitToEdge[bit]=e;}
  if(ok){for(int bit=1;bit<2*K;bit++)if(bitToEdge[bit]<0)ok=false;}
  if(ok){for(int bit=1;bit<2*K;bit++){int e=bitToEdge[bit];replacement[e/2]=newbase;phase[e/2]=e&1;m.dest.emplace_back(newbase++,bit);}mults.push_back(std::move(m));}
  for(int e:vertices)vertexIndex[e]=-1;
 }
 if(mults.empty())return;
 std::vector<uint8_t> live(N);for(int e:p.d)live[e/2]=1;for(int e:p.out)live[e/2]=1;
 for(int i=N-1;i>=p.base;i--)if(live[i]&&replacement[i]<0){auto z=p.n[i];live[z.a/2]=live[z.b/2]=1;if(z.op==2)live[z.c/2]=1;}
 Plan q;q.base=newbase;q.n.resize(newbase);q.mults=std::move(mults);std::vector<int> ren(N);for(int i=0;i<p.base;i++)ren[i]=i*2;
 auto edge=[&](int e){return ren[e/2]^(e&1);};
 for(int i=p.base;i<N;i++)if(replacement[i]>=0)ren[i]=replacement[i]*2^phase[i];else if(live[i]){auto z=p.n[i];ren[i]=q.n.size()*2;q.n.push_back({z.op,edge(z.a),edge(z.b),edge(z.c)});}
 for(int e:p.d)q.d.push_back(edge(e));for(int e:p.out)q.out.push_back(edge(e));p=std::move(q);
}

void gather_reads(Plan& p,const Circuit& c) {
 int muxes=0;for(int i=p.base;i<(int)p.n.size();i++)muxes+=p.n[i].op==2;
 if(muxes<(int)p.n.size()/2||c.F<256)return;
 struct Desc {int h=-1,first=0,width=0;std::array<int,8> sel{};};
 int N=p.n.size();std::vector<Desc> ds(N);
 for(int i=1+c.I;i<p.base;i++){ds[i].h=0;ds[i].first=i-1-c.I;}
 for(int i=p.base;i<N;i++) {
  auto z=p.n[i];if(z.op!=2||(z.b&1)||(z.c&1)||z.a/2>=p.base)continue;
  auto a=ds[z.b/2],b=ds[z.c/2];
  if(a.h<0||a.h!=b.h||a.h>=8)continue;
  if(a.h==0){a.width=b.first-a.first;if(a.width!=16&&a.width!=32&&a.width!=64)continue;}
  else if(a.width!=b.width||b.first-a.first!=(a.width<<a.h)||a.sel!=b.sel)continue;
  a.sel[a.h]=z.a;a.h++;ds[i]=a;
 }
 std::vector<uint8_t> ext(N);
 for(int i=p.base;i<N;i++){auto z=p.n[i];ext[z.a/2]=1;if(ds[i].h<=0){ext[z.b/2]=1;if(z.op==2)ext[z.c/2]=1;}}
 for(int d:p.d)ext[d/2]=1;for(int o:p.out)ext[o/2]=1;
 std::map<std::vector<int>,std::vector<int>> groups;
 for(int i=p.base;i<N;i++)if(ext[i]&&ds[i].h>=5) {
  auto a=ds[i];if(a.first%a.width>=a.width||a.first-a.first%a.width+(a.width<<a.h)>c.F)continue;
  std::vector<int> key{a.h,a.first/a.width,a.width};for(int j=0;j<a.h;j++)key.push_back(a.sel[j]);groups[key].push_back(i);
 }
 int newbase=p.base;std::vector<int> replaced(N,-1);std::vector<Gather> gathers;
 for(auto&[key,ids]:groups)if((int)ids.size()>=key[2]/2) {
  Gather g;g.h=key[0];g.first=key[1]*key[2];g.width=key[2];for(int j=0;j<g.h;j++)g.sel[j]=key[3+j];
  for(int i:ids){replaced[i]=newbase;g.dest.emplace_back(newbase++,ds[i].first%g.width);}
  gathers.push_back(std::move(g));
 }
 if(gathers.empty())return;
 std::vector<uint8_t> live(N);for(int d:p.d)live[d/2]=1;for(int o:p.out)live[o/2]=1;
 for(int i=N-1;i>=p.base;i--)if(live[i]&&replaced[i]<0){auto z=p.n[i];live[z.a/2]=live[z.b/2]=1;if(z.op==2)live[z.c/2]=1;}
 Plan q;q.base=newbase;q.n.resize(newbase);q.gathers=std::move(gathers);
 std::vector<int> ren(N);for(int i=0;i<p.base;i++)ren[i]=i*2;
 auto edge=[&](int e){return ren[e/2]^(e&1);};
 for(int i=p.base;i<N;i++)if(replaced[i]>=0)ren[i]=replaced[i]*2;else if(live[i]){auto z=p.n[i];ren[i]=q.n.size()*2;q.n.push_back({z.op,edge(z.a),edge(z.b),edge(z.c)});}
 for(int d:p.d)q.d.push_back(edge(d));for(int o:p.out)q.out.push_back(edge(o));
 p=std::move(q);
}
// One instruction stream is shared by all independent batches.

void reorder(Plan& p) {
 int N=p.n.size();std::vector<int> users(N),roots,ord,st,idx(N);std::vector<uint8_t> seen(N);
 for(int i=p.base;i<N;i++){auto z=p.n[i];users[z.a/2]++;users[z.b/2]++;if(z.op==2)users[z.c/2]++;}
 for(int x:p.d)roots.push_back(x/2);for(int x:p.out)roots.push_back(x/2);
 std::sort(roots.begin(),roots.end(),std::greater<int>());
 for(int r:roots)if(r>=p.base&&!seen[r]) {
  st.push_back(r);
  while(!st.empty()) {int v=st.back();if(seen[v]==2){st.pop_back();continue;}if(seen[v]==1){seen[v]=2;ord.push_back(v);st.pop_back();continue;}
   seen[v]=1;auto z=p.n[v];int src[3]={z.a/2,z.b/2,z.c/2};int count=z.op==2?3:2;
   std::sort(src,src+count,[&](int a,int b){return users[a]<users[b];});
   for(int j=0;j<count;j++)if(src[j]>=p.base&&!seen[src[j]])st.push_back(src[j]);
  }
 }
 Plan q;q.base=p.base;q.n.resize(p.base);for(int i=0;i<p.base;i++)idx[i]=i*2;
 auto edge=[&](int e){return idx[e/2]^(e&1);};
 for(int v:ord){auto z=p.n[v];idx[v]=q.n.size()*2;q.n.push_back({z.op,edge(z.a),edge(z.b),edge(z.c)});}
 for(int x:p.d)q.d.push_back(edge(x));for(int x:p.out)q.out.push_back(edge(x));
 q.gathers=std::move(p.gathers);q.mults=std::move(p.mults);p=std::move(q);
}

void depth_order(Plan& p) {
 int N=p.n.size(),max=0;std::vector<int> dep(N),count,ord(N-p.base),ren(N);
 for(int i=p.base;i<N;i++){auto z=p.n[i];dep[i]=1+std::max(dep[z.a/2],dep[z.b/2]);if(z.op==2)dep[i]=std::max(dep[i],dep[z.c/2]+1);max=std::max(max,dep[i]);}
 count.resize(max+2);for(int i=p.base;i<N;i++)count[dep[i]+1]++;for(int j=1;j<(int)count.size();j++)count[j]+=count[j-1];
 for(int i=p.base;i<N;i++)ord[count[dep[i]]++]=i;
 Plan q;q.base=p.base;q.n.resize(p.base);q.gathers=std::move(p.gathers);q.mults=std::move(p.mults);for(int i=0;i<p.base;i++)ren[i]=i*2;
 auto edge=[&](int e){return ren[e/2]^(e&1);};
 for(int i:ord){auto z=p.n[i];ren[i]=q.n.size()*2;q.n.push_back({z.op,edge(z.a),edge(z.b),edge(z.c)});}
 for(int d:p.d)q.d.push_back(edge(d));for(int o:p.out)q.out.push_back(edge(o));p=std::move(q);
}
struct Code {
 std::vector<uint8_t> bytes;
 void byte(int x){bytes.push_back((uint8_t)x);}
 void word(int x){for(int i=0;i<4;i++)byte((unsigned)x>>(i*8));}
 // Three-byte VEX, 256-bit packed integer instructions.
 void ins(int opcode,int dst,int a,int b) {
  if(b<8){byte(0xc5);byte(((dst<8)?0x80:0)|((~a&15)<<3)|5);}
  else {byte(0xc4);byte(0x41|((dst<8)?0x80:0));byte(((~a&15)<<3)|5);}
  byte(opcode);byte(0xc0|((dst&7)<<3)|(b&7));
 }
 void insmem(int opcode,int dst,int a,int offset) {
  byte(0xc5);byte(((dst<8)?0x80:0)|((~a&15)<<3)|5);byte(opcode);byte(0x81|((dst&7)<<3));word(offset);
 }
 void load(int r,int offset){byte(0xc5);byte(r<8?0xfe:0x7e);byte(0x6f);byte(0x81|((r&7)<<3));word(offset);}
 void save(int r,int offset){byte(0xc5);byte(r<8?0xfe:0x7e);byte(0x7f);byte(0x81|((r&7)<<3));word(offset);}
 void xmmstack(int r,int offset,bool load) {
  byte(0xc5);byte(r<8?0xfa:0x7a);byte(load?0x6f:0x7f);byte(0x84|((r&7)<<3));byte(0x24);word(offset);
 }
};
struct Compiled {
 const Plan* plan;void* mem=nullptr;size_t size=0;int slots=0;std::vector<int> slot;
 Compiled(Plan& p):plan(&p) {
  std::vector<int> polarity(p.n.size());
  for(int i=p.base;i<(int)p.n.size();i++) {
   auto&z=p.n[i];z.a^=polarity[z.a/2];z.b^=polarity[z.b/2];z.c^=polarity[z.c/2];
   if(z.op==0&&((z.a&z.b)&1)){z.op=3;z.a^=1;z.b^=1;polarity[i]=1;}
   else if(z.op==1){polarity[i]=(z.a^z.b)&1;z.a&=~1;z.b&=~1;}
   else if(z.op==2){if(z.a&1){z.a^=1;std::swap(z.b,z.c);}polarity[i]=z.b&1;z.b^=polarity[i];z.c^=polarity[i];}
  }
  for(int&x:p.d)x^=polarity[x/2];for(int&x:p.out)x^=polarity[x/2];
  int N=p.n.size(); std::vector<int> last(N,-1);
  for(int i=p.base;i<N;i++){auto z=p.n[i];last[z.a/2]=i;last[z.b/2]=i;if(z.op==2)last[z.c/2]=i;}
  for(int a:p.d)last[a/2]=N;for(int a:p.out)last[a/2]=N;
  slot.resize(N);for(int i=0;i<p.base;i++)slot[i]=i;slots=p.base;
  std::vector<int> free;
  for(int i=p.base;i<N;i++) {
   auto z=p.n[i];
   if(free.empty())slot[i]=slots++;else{slot[i]=free.back();free.pop_back();}
   int src[3]={z.a/2,z.b/2,z.c/2};for(int j=0;j<(z.op==2?3:2);j++)if(src[j]>=p.base&&last[src[j]]==i){bool dup=false;for(int k=0;k<j;k++)if(src[j]==src[k])dup=true;if(!dup)free.push_back(slot[src[j]]);}
   if(last[i]<0)free.push_back(slot[i]);
  }
  Code co;
  // Preserve the nonvolatile low halves of ymm6..ymm15.
  co.byte(0x48);co.byte(0x81);co.byte(0xec);co.word(168);
  for(int r=6;r<16;r++)co.xmmstack(r,(r-6)*16,false);
  co.ins(0x76,15,15,15);

  std::vector<int> next(N,N+1);
  std::vector<std::array<int,3>> advance(N);
  for(int x:p.d)next[x/2]=N;for(int x:p.out)next[x/2]=N;
  for(int i=N-1;i>=p.base;i--){auto z=p.n[i];int in[3]={z.a/2,z.b/2,z.c/2};
   for(int j=0;j<(z.op==2?3:2);j++)advance[i][j]=next[in[j]];
   for(int j=0;j<(z.op==2?3:2);j++)next[in[j]]=i;
  }
  const int span=8192;
  int count=(N-p.base+span-1)/span;
  std::vector<Code> parts(count);
  const auto first=next;
  #pragma omp parallel num_threads(16) if(N-p.base>32768)
  {
   std::vector<int> next(N,N+1),reg(N,-1),dirty(15),who(15,-1);
   #pragma omp for schedule(static)
   for(int part=0;part<count;part++) {
    int begin=p.base+part*span,end=std::min(N,begin+span);
    Code &co=parts[part];co.bytes.reserve(span*24);
    std::fill(who.begin(),who.end(),-1);std::fill(dirty.begin(),dirty.end(),0);
    for(int i=begin;i<end;i++)next[i]=first[i];
    for(int i=end-1;i>=begin;i--){auto z=p.n[i];next[z.a/2]=i;next[z.b/2]=i;if(z.op==2)next[z.c/2]=i;}
  int now=0;
  auto alloc=[&](int protect) {
   int r=-1;
   for(int k=0;k<15;k++)if(!(protect>>k&1)) {if(who[k]<0){r=k;break;} if(r<0||next[who[k]]>next[who[r]])r=k;}
   if(who[r]>=0){int old=who[r];if(dirty[r]&&next[old]>=now&&next[old]<=N)co.save(r,slot[old]*32);reg[old]=-1;}
   who[r]=-1;dirty[r]=0;return r;
  };

  for(int i=begin;i<end;i++) {
   now=i;auto z=p.n[i];int in[3]={z.a/2,z.b/2,z.c/2},rs[3]={-1,-1,-1},protect=0;
   int arity=z.op==2?3:2,memop=-1;
   if(z.op==2) {if(reg[in[2]]<0)memop=2;}
   else {
    int required=z.op==0?((z.a&1)?0:(z.b&1)?1:-1):-1;
    if(required>=0) {if(reg[in[1-required]]<0)memop=1-required;}
    else {if(reg[in[1]]<0)memop=1;else if(reg[in[0]]<0)memop=0;}
   }
   for(int j=0;j<arity;j++)if(j!=memop){int v=in[j],r=reg[v];if(r<0){r=alloc(protect);co.load(r,slot[v]*32);reg[v]=r;who[r]=v;}
    rs[j]=r;protect|=1<<r;
   }
   for(int j=0;j<arity;j++)next[in[j]]=advance[i][j];
   int dst=-1;
   if(z.op==2){if(rs[2]>=0&&next[in[2]]>N&&rs[2]!=rs[0]&&rs[2]!=rs[1])dst=rs[2];}
   else for(int j=0;j<arity;j++)if(rs[j]>=0&&next[in[j]]>N){dst=rs[j];break;}
   if(dst<0)dst=alloc(protect);else {reg[who[dst]]=-1;who[dst]=-1;}
   auto binary=[&](int opcode,int left,int right){
    if(right==memop)co.insmem(opcode,dst,rs[left],slot[in[right]]*32);
    else co.ins(opcode,dst,rs[left],rs[right]);
   };
   if(z.op==0) {
    if(z.a&1)binary(0xdf,0,1);
    else if(z.b&1)binary(0xdf,1,0);
    else binary(0xdb,memop==0?1:0,memop==0?0:1);
   }else if(z.op==1||z.op==3)binary(z.op==1?0xef:0xeb,memop==0?1:0,memop==0?0:1);
   else {
    binary(0xef,1,2);
    if(z.c&1)co.ins(0xef,dst,dst,15);
    co.ins(0xdb,dst,dst,rs[0]);co.ins(0xef,dst,dst,rs[1]);
   }
   reg[i]=dst;who[dst]=i;dirty[dst]=1;
  }
  now=N;
  for(int r=0;r<15;r++)if(who[r]>=0&&next[who[r]]<=N&&dirty[r])co.save(r,slot[who[r]]*32);

    for(int r=0;r<15;r++)if(who[r]>=0)reg[who[r]]=-1;
   }
  }
  size_t capacity=co.bytes.size()+200;for(auto&part:parts)capacity+=part.bytes.size();co.bytes.reserve(capacity);
  for(auto &part:parts)co.bytes.insert(co.bytes.end(),part.bytes.begin(),part.bytes.end());
  for(int r=6;r<16;r++)co.xmmstack(r,(r-6)*16,true);
  co.byte(0xc5);co.byte(0xf8);co.byte(0x77);
  co.byte(0x48);co.byte(0x81);co.byte(0xc4);co.word(168);co.byte(0xc3);
  size=co.bytes.size();mem=VirtualAlloc(nullptr,size,MEM_COMMIT|MEM_RESERVE,PAGE_READWRITE);
  if(mem){memcpy(mem,co.bytes.data(),size);DWORD old;if(!VirtualProtect(mem,size,PAGE_EXECUTE_READ,&old)){VirtualFree(mem,0,MEM_RELEASE);mem=nullptr;}else FlushInstructionCache(GetCurrentProcess(),mem,size);}
 }
 ~Compiled(){if(mem)VirtualFree(mem,0,MEM_RELEASE);}

 void run(void* data)const {
  if(mem){((void(*)(void*))mem)(data);return;}
  auto* v=(uint64_t*)data;auto one=_mm256_set1_epi32(-1);
  auto get=[&](int e){auto x=_mm256_loadu_si256((const __m256i*)(v+slot[e/2]*4));return (e&1)?_mm256_xor_si256(x,one):x;};
  for(int i=plan->base;i<(int)plan->n.size();i++){
   auto z=plan->n[i];auto a=get(z.a),b=get(z.b);__m256i r;
   if(z.op==0)r=_mm256_and_si256(a,b);
   else if(z.op==1)r=_mm256_xor_si256(a,b);
   else if(z.op==3)r=_mm256_or_si256(a,b);
   else r=_mm256_xor_si256(b,_mm256_and_si256(a,_mm256_xor_si256(b,get(z.c))));
   _mm256_storeu_si256((__m256i*)(v+slot[i]*4),r);
  }
 }

};

}

std::vector<uint64_t> simulate(const Circuit& c) {

 Plan p=build(c);
 integer_multiplies(p);
 gather_reads(p,c);
 if(c.G>10000){int muxes=0;for(int i=p.base;i<(int)p.n.size();i++)muxes+=p.n[i].op==2;
  if(muxes>(int)p.n.size()/30&&muxes<(int)p.n.size()/3&&(int)p.n.size()>c.G*4/5)depth_order(p);else reorder(p);
 }
 std::vector<uint64_t> ans(c.M),weights((size_t)c.T*c.O);
 for(size_t i=0;i<weights.size();++i)weights[i]=mix(i);
 int groups=(c.O+7)/8;
 std::vector<uint64_t> lut((size_t)c.T*groups*256);
 for(int t=0;t<c.T;t++)for(int g=0;g<groups;g++)for(int x=1;x<256;x++){int b=__builtin_ctz(x),j=g*8+b;lut[((size_t)t*groups+g)*256+x]=lut[((size_t)t*groups+g)*256+(x&(x-1))]^(j<c.O?weights[(size_t)t*c.O+j]:0);}
 Compiled code(p);
 struct Update {int dst,src;uint64_t neg;};
 std::vector<Update> direct,copy;
 for(int f=0;f<c.F;f++) {int a=p.d[f],src=code.slot[a/2];Update u{(1+c.I+f)*4,src*4,0-(uint64_t)(a&1)};if(src>=1+c.I&&src<1+c.I+c.F)copy.push_back(u);else direct.push_back(u);}
 int packedWords=0;for(auto&g:p.gathers)packedWords=std::max(packedWords,(g.first+(g.width<<g.h)+63)/64);
 int blocks=(c.M+255)/256;
 #pragma omp parallel for schedule(static) num_threads(16) if(c.M>=256)
 for(int blk=0;blk<blocks;blk++) {
  std::vector<uint64_t> v((size_t)code.slots*4),ff(copy.size()*4),seeds(256),packed((size_t)packedWords*256);
  int lanes=std::min(256,c.M-blk*256);
  for(int j=0;j<lanes;j++)seeds[j]=mix(c.seed^(blk*256+j));
  auto val=[&](int a,int w){return v[(size_t)code.slot[a/2]*4+w]^-(uint64_t)(a&1);};
  for(int t=0;t<c.T;t++) {
   for(int w=0;w<4;w++) {
    uint64_t a[64]={};int end=std::min(64,lanes-w*64);
    for(int k=0;k<end;k++){int j=w*64+k;a[k]=mix(seeds[j]);seeds[j]+=0x9E3779B97F4A7C15ULL;}
    transpose(a);for(int i=0;i<c.I;i++)v[(1+i)*4+w]=a[i];
   }

   if(!p.gathers.empty()){
    for(int f=0;f<packedWords;f++)for(int w=0;w<4;w++) {
     uint64_t* a=packed.data()+(size_t)f*256+w*64;for(int b=0;b<64;b++)a[b]=f*64+b<c.F?v[(1+c.I+f*64+b)*4+w]:0;transpose(a);
    }
    for(auto&g:p.gathers)for(int w=0;w<4;w++){
     uint64_t rows[8]={},data[64];uint8_t addr[64];for(int j=0;j<g.h;j++)rows[j]=val(g.sel[j],w);transpose8x64(rows,addr);
     const auto first=_mm256_set1_epi64x(g.first),mask63=_mm256_set1_epi64x(63),lane=_mm256_set_epi64x(3,2,1,0);
     for(int k=0;k<64;k+=4){
      uint32_t small;memcpy(&small,addr+k,4);auto index=_mm256_cvtepu8_epi64(_mm_cvtsi32_si128(small));
      if(g.width==64)index=_mm256_slli_epi64(index,6);else if(g.width==32)index=_mm256_slli_epi64(index,5);else index=_mm256_slli_epi64(index,4);
      index=_mm256_add_epi64(index,first);
      auto offset=_mm256_add_epi64(_mm256_slli_epi64(_mm256_srli_epi64(index,6),8),lane);
      auto value=_mm256_i64gather_epi64((const long long*)(packed.data()+w*64+k),offset,8);
      value=_mm256_srlv_epi64(value,_mm256_and_si256(index,mask63));_mm256_storeu_si256((__m256i*)(data+k),value);
     }
     transpose(data);for(auto [node,bit]:g.dest)v[code.slot[node]*4+w]=data[bit];
    }
   }

   for(auto&m:p.mults)for(int w=0;w<4;w++){
    uint64_t data[64]={};for(int j=0;j<m.bits;j++){data[j]=val(m.a[j],w);data[32+j]=val(m.b[j],w);}transpose(data);
    for(int k=0;k<64;k+=4){auto x=_mm256_loadu_si256((const __m256i*)(data+k));auto prod=_mm256_mul_epu32(x,_mm256_srli_epi64(x,32));_mm256_storeu_si256((__m256i*)(data+k),prod);}
    transpose(data);for(auto [node,bit]:m.dest)v[code.slot[node]*4+w]=data[bit];
   }
   code.run(v.data());
   for(int w=0;w<4;w++) {
    uint64_t a[64]={};for(int j=0;j<c.O;j++)a[j]=val(p.out[j],w);
    transpose(a);const uint64_t* table=lut.data()+(size_t)t*groups*256;
    int end=std::min(64,lanes-w*64);
    for(int k=0;k<end;k++){uint64_t h=0,x=a[k];for(int g=0;g<groups;g++){h^=table[g*256+(x&255)];x>>=8;}ans[blk*256+w*64+k]^=h;}
   }
   for(size_t i=0;i<copy.size();i++){auto u=copy[i];__m256i x=_mm256_loadu_si256((const __m256i*)&v[u.src]);x=_mm256_xor_si256(x,_mm256_set1_epi64x(u.neg));_mm256_storeu_si256((__m256i*)&ff[i*4],x);}
   for(auto u:direct){__m256i x=_mm256_loadu_si256((const __m256i*)&v[u.src]);x=_mm256_xor_si256(x,_mm256_set1_epi64x(u.neg));_mm256_storeu_si256((__m256i*)&v[u.dst],x);}
   for(size_t i=0;i<copy.size();i++){__m256i x=_mm256_loadu_si256((const __m256i*)&ff[i*4]);_mm256_storeu_si256((__m256i*)&v[copy[i].dst],x);}
  }
 }

 return ans;
}


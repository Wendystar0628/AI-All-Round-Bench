#include <cstdint>
#include <vector>
#include <algorithm>
#include <cstring>
#include <numeric>
#include <immintrin.h>
#include <omp.h>
#include <unordered_map>

#include <windows.h>

struct Circuit {
    int I, F, G, O, M, T;
    uint64_t seed;
    std::vector<int> d;
    std::vector<uint8_t> type;
    std::vector<int> in0, in1, in2;
    std::vector<int> out;
};

namespace {
using std::vector;
using U = uint64_t;
constexpr U step=0x9e3779b97f4a7c15ULL;
inline U scramble(U z) {
    z=(z^(z>>30))*0xbf58476d1ce4e5b9ULL;
    z=(z^(z>>27))*0x94d049bb133111ebULL;
    return z^(z>>31);
}
// Signed edges are encoded with the low bit as the complement flag.
struct Node { int a,b,s; }; // s=-1: AND, s=-2: XOR, otherwise MUX
struct Graph {
    int base;
    int phase=-1,tapStart=0,coreEnd=-1;
    vector<Node> gates;
    vector<int> d,out;
};
struct Builder {
    Graph g;
    struct Entry{int a,b,s,id;};
    vector<Entry> cache;
    unsigned mask;
    Builder(int base,int n) {
        g.base=base;
        unsigned cap=16;while(cap<unsigned(n+n/2))cap*=2;
        cap=std::min(cap,32768u);cache.resize(cap);mask=cap-1;g.gates.reserve(n);
    }
    int intern(int a,int b,int s) {
        unsigned h=a*0x9e3779b1u+b*0x85ebca77u+s*0x27d4eb2du;
        h=(h^(h>>16))*0x7feb352du;h=(h^(h>>15))&mask;
        auto &entry=cache[h];
        if(entry.id && entry.a==a && entry.b==b && entry.s==s)return entry.id;
        int id=(g.base+g.gates.size())*2;
        g.gates.push_back({a,b,s});
        entry={a,b,s,id};
        return id;
    }
    int land(int a,int b) {
        if(b<a)std::swap(a,b);
        if(a<2)return a?b:0;
        if((a>>1)==(b>>1))return a==b?a:0;
        return intern(a,b,-1);
    }
    int xorr(int a,int b) {
        int inv=(a^b)&1;a&=~1;b&=~1;
        if(b<a)std::swap(a,b);
        if(!a)return b^inv;
        if(a==b)return inv;
        return intern(a,b,-2)^inv;
    }
    int mux(int s,int a,int b) {
        if(s&1){s^=1;std::swap(a,b);}
        if(!s||a==b)return a;
        if((a^b)==1)return xorr(a,s);
        if(a<2 || (s>>1)==(a>>1)) {
            if(a==0||a==s)return land(s,b);
            return land(s,b^1)^1;
        }
        if(b<2 || (s>>1)==(b>>1)) {
            if(b==0||b==(s^1))return land(s^1,a);
            return land(s^1,a^1)^1;
        }
        int inv=a&1;return intern(a^inv,b^inv,s)^inv;
    }
    int make(int t,int a,int b,int s) {
        switch(t) {
        case 0:return land(a,b);
        case 1:return land(a^1,b^1)^1;
        case 2:return xorr(a,b);
        case 3:return land(a,b)^1;
        case 4:return land(a^1,b^1);
        case 5:return xorr(a,b)^1;
        case 6:return a^1;
        default:return mux(a,b,s);
        }
    }
};

// A recognized read port is a complete bus of balanced MUX trees with
// identical address bits and consecutive register rows at every leaf.
struct Port {int base=0; vector<int> select, nodes;};
struct Reads {
    int width=0, depth=0, bank=0;
    vector<Port> ports;
    vector<int> ext;
    explicit Reads(const Circuit& c){
        if(c.M<256||std::count(c.type.begin(),c.type.end(),7)<c.G/2||c.G<4096)return;
        int ff=c.I+2,first=ff+c.F;
        int freq[7]={};
        for(int i=0;i<c.G;i++)if(c.type[i]==7&&c.in1[i]>=ff&&c.in2[i]<first){
            int w=c.in2[i]-c.in1[i];if(w>0&&w<=64&&(w&(w-1))==0)freq[__builtin_ctz(w)]++;
        }
        width=1<<(std::max_element(freq,freq+7)-freq);
        if(width<16 || *std::max_element(freq,freq+7)<c.G/16)return;
        struct Tree {int base=-1,sig=-1,h=0;};
        vector<Tree> meta(first+c.G);
        for(int i=ff;i<first;i++)meta[i]={i-ff,0,0};
        vector<int> stack;
        vector<std::pair<int,int>> sig(1);
        std::unordered_map<U,int> signatures;
        for(int k=0;k<c.G;k++){
            stack.push_back(k+first);
            while(!stack.empty()){
                int id=stack.back(),i=id-first;
                if(meta[id].sig>=0){stack.pop_back();continue;}
                int a=c.in1[i],b=c.in2[i],s=c.in0[i];
                if(c.type[i]==7&&s<first&&a>=ff&&b>=ff){
                    if(meta[a].sig<0){stack.push_back(a);continue;}
                    if(meta[b].sig<0){stack.push_back(b);continue;}
                    auto A=meta[a],B=meta[b];
                    if(A.base>=0&&B.base>=0&&A.sig==B.sig && A.h<12&&B.base==A.base+(width<<A.h)){
                        U key=(U(A.sig)<<32)|s;
                        auto [it,added]=signatures.try_emplace(key,sig.size());if(added)sig.emplace_back(A.sig,s);
                        meta[id]={A.base,it->second,A.h+1};depth=std::max(depth,A.h+1);
                    }
                }
                if(meta[id].sig<0)meta[id].sig=0;
                stack.pop_back();
            }
        }
        if(depth<4||depth>8)return;
        vector<Port> identified(sig.size());
        for(int i=first;i<first+c.G;i++)if(meta[i].h==depth){
            auto info=meta[i];auto &p=identified[info.sig];
            if(p.nodes.empty()){p.nodes.assign(width,-1);p.base=info.base/width*width;}
            if(info.base/width*width==p.base)p.nodes[info.base%width]=i;
        }
        for(int i=1;i<(int)sig.size();i++){
            auto &p=identified[i];if(p.nodes.empty()||std::find(p.nodes.begin(),p.nodes.end(),-1)!=p.nodes.end())continue;
            if(ports.empty())bank=p.base;
            if(p.base!=bank)continue;
            for(int k=i;k;k=sig[k].first)p.select.push_back(sig[k].second);
            std::reverse(p.select.begin(),p.select.end());
            ports.push_back(std::move(p));
        }
        if(!ports.empty()){
            ext.resize(c.G,-1);
            for(int j=0;j<(int)ports.size();j++)for(int col=0;col<width;col++)
                ext[ports[j].nodes[col]-first]=j*width+col;
        }
    }
};

// Capture all externally visible intermediate write stages as well as the
// final register values. Controls and write data must precede the write phase.
struct Writes {
    int count=0,rows=0;
    vector<int> extra,external,tapList,tapBegin,decoder;
    Writes(const Circuit& c,const Reads& rd){
        if(rd.ports.empty())return;
        int base=2+c.I+c.F;
        rows=1<<rd.depth;
        vector<int> sel,data;
        for(int r=0;r<rows;r++)for(int b=0;b<rd.width;b++){
            int f=rd.bank+r*rd.width+b,id=c.d[f],p=0;
            while(id>=base&&c.type[id-base]==7){
                int i=id-base;
                if(r==0&&b==0){
                    if(p==128)return;
                    sel.resize((p+1)*rows);data.resize((p+1)*rd.width);
                }else if(p>=int(sel.size())/rows)return;
                if(b==0)sel[p*rows+r]=c.in0[i];
                else if(sel[p*rows+r]!=c.in0[i])return;
                if(r==0)data[p*rd.width+b]=c.in2[i];
                else if(data[p*rd.width+b]!=c.in2[i])return;
                id=c.in1[i];p++;
            }
            if(id!=2+c.I+f||p!=int(sel.size())/rows||p==0)return;
        }
        count=sel.size()/rows;
        extra=std::move(data);extra.insert(extra.end(),sel.begin(),sel.end());
        vector<int> which(c.G,-1);vector<char> needed(c.G);
        for(int r=0;r<rows;r++)for(int b=0;b<rd.width;b++){
            int id=c.d[rd.bank+r*rd.width+b];
            for(int p=0;p<count;p++){
                int &v=which[id-base];
                if(v>=0){count=0;extra.clear();return;}
                v=(r*count+p)*rd.width+b;id=c.in1[id-base];
            }
        }
        vector<int> stack=extra;vector<char> seen(c.G);
        while(!stack.empty()){
            int i=stack.back()-base;stack.pop_back();if(i<0||seen[i])continue;seen[i]=1;
            if(which[i]>=0){count=0;extra.clear();return;}
            if(rd.ext[i]>=0)continue;
            for(int a:{c.in0[i],c.in1[i],c.in2[i]})if(a>=base)stack.push_back(a);
        }
        auto mark=[&](int s){if(s>=base&&which[s-base]>=0)needed[s-base]=1;};
        for(int k=0;k<c.G;k++)if(which[k]<0){mark(c.in0[k]);mark(c.in1[k]);mark(c.in2[k]);}
        for(int j=0;j<c.F;j++)if(j<rd.bank||j>=rd.bank+rows*rd.width)mark(c.d[j]);
        for(int a:c.out)mark(a);
        external.assign(c.G,-1);
        vector<int> tap(rows*count*rd.width,-1);
        for(int i=0;i<c.G;i++)if(needed[i])tap[which[i]]=i;
        for(int group=0;group<rows*count;group++){
            tapBegin.push_back(tapList.size());
            for(int b=0;b<rd.width;b++)if(int i=tap[group*rd.width+b];i>=0){
                external[i]=tapList.size();tapList.push_back(b);
            }
        }
        tapBegin.push_back(tapList.size());
        // Verify the enable and address literals for every word of every write port.
        if(count>32)return;
        vector<int> verified(count*(rd.depth+1));
        auto literal=[&](int id){
            bool inverse=id>=base && c.type[id-base]==6;
            int raw=inverse?c.in0[id-base]:id;
            return raw<base?2*raw+int(inverse):-1;
        };
        for(int p=0;p<count;p++)for(int r=0;r<rows;r++){
            int root=sel[p*rows+r];if(root<base||c.type[root-base]!=0)return;
            int idx=p*(rd.depth+1);
            int en=literal(c.in1[root-base]);if(en<0)return;
            if(!r)verified[idx+rd.depth]=en;else if(verified[idx+rd.depth]!=en)return;
            int tail=c.in0[root-base];
            for(int k=rd.depth-1;k>=0;k--){
                int a=tail;
                if(k){if(tail<base||c.type[tail-base]!=0)return;a=c.in1[tail-base];tail=c.in0[tail-base];}
                int v=literal(a);if(v<0)return;
                v^=1^((r>>k)&1);
                if(!r)verified[idx+k]=v;else if(verified[idx+k]!=v)return;
            }
        }
        decoder=std::move(verified);extra.resize(count*rd.width);
    }
};
struct Rows {
    struct Cell{int x,y,z,p,g,h,sum,co;};
    vector<Cell> cell;
    vector<int> rowOf, next,first;
    explicit Rows(const Circuit& c) {
        if(c.G<2048 || std::count(c.type.begin(),c.type.end(),0)<c.G/3)return;
        int base=c.I+2+c.F;
        vector<int> xorFan(base+c.G,-1),link(c.G),byCarry(base+c.G,-1);
        for(int i=0;i<c.G;i++)if(c.type[i]==2){
            int a=c.in0[i];link[i]=xorFan[a];xorFan[a]=i;
        }
        vector<int> xorFan2(base+c.G,-1),link2(c.G);
        for(int i=0;i<c.G;i++)if(c.type[i]==2){int a=c.in1[i];link2[i]=xorFan2[a];xorFan2[a]=i;}
        for(int i=0;i<c.G;i++)if(c.type[i]==1){
            int l=c.in0[i],r=c.in1[i];
            if(l<base||r<base||c.type[l-base]!=0||c.type[r-base]!=0)continue;
            bool found=false;
            for(int j=0;j<4&&!found;j++){
                int g=j&2?r:l,h=j&2?l:r;
                int p=j&1?c.in1[h-base]:c.in0[h-base],z=j&1?c.in0[h-base]:c.in1[h-base];
                if(p<base||c.type[p-base]!=2)continue;
                int x=c.in0[p-base],y=c.in1[p-base],a=c.in0[g-base],b=c.in1[g-base];
                if(!((x==a&&y==b)||(x==b&&y==a)))continue;
                int su=xorFan[p],scans=128;while(su>=0&&c.in1[su]!=z && scans-->0)su=link[su];if(scans<0)su=-1;
                if(su<0){su=xorFan2[p];int scans=128;while(su>=0&&c.in0[su]!=z && scans-->0)su=link2[su];if(scans<0)su=-1;}
                if(su<0)continue;
                byCarry[base+i]=cell.size();cell.push_back({x,y,z,p,g,h,su+base,base+i});found=true;
            }
        }
        if(cell.size()*10<c.G){cell.clear();return;}
        int n=cell.size();next.assign(n,-1);vector<int> prev(n,-1);
        for(int i=0;i<n;i++){int a=byCarry[cell[i].z];if(a>=0&&next[a]<0){next[a]=i;prev[i]=a;}}
        rowOf.assign(c.G,-1);
        for(int i=0;i<n;i++)if(prev[i]<0){
            int r=first.size();first.push_back(i);
            for(int k=i;k>=0;k=next[k]){
                auto v=cell[k];
                for(int x:{v.p,v.g,v.h,v.sum,v.co}){
                    if(rowOf[x-base]>=0){rowOf.clear();return;}
                    rowOf[x-base]=r;
                }
            }
        }
    }
};

// A cut carries the exact truth table over up to four already computed wires.
// When expanding a cone would exceed that bound, keep an operand as a leaf.
struct Cut{
    int leaf[4]={}; unsigned tt=0;int n=0;
};
struct Cuts {
    Builder b;
    vector<Cut> cut;
    vector<int> rep;
    Graph& g=b.g;
    explicit Cuts(int base,int n):b(base,2*n),cut(base),rep(base){
        rep.reserve(base+n);for(int i=0;i<base;i++)rep[i]=2*i;
        cut.reserve(base+n);for(int i=1;i<base;i++)cut[i]={{i},0xaaaa,1};
    }
    int make(int t,int a,int b,int s){
        switch(t){
        case 0:return gate(a,b,-1);
        case 1:return gate(a^1,b^1,-1)^1;
        case 2:return gate(a,b,-2);
        case 3:return gate(a,b,-1)^1;
        case 4:return gate(a^1,b^1,-1);
        case 5:return gate(a,b,-2)^1;
        case 6:return a^1;
        default:return gate(b,s,a);
        }
    }
    static Cut literal(int a){return a?Cut{{a},0xaaaa,1}:Cut{};}
    static bool add(Cut& r,const Cut& v) {
        for(int k=0;k<v.n;k++){
            int x=v.leaf[k],j=0;while(j<r.n && r.leaf[j]!=x)j++;
            if(j==r.n){if(j==4)return false;r.leaf[r.n++]=x;}
        }
        return true;
    }
    static unsigned expand(const Cut& t,const Cut& dest){
        unsigned pos=0;for(int j=0;j<t.n;j++){
            int k=0;while(dest.leaf[k]!=t.leaf[j])++k;pos|=k<<(2*j);
        }
        if(t.n==1){constexpr unsigned masks[]={0xaaaa,0xcccc,0xf0f0,0xff00};unsigned m=masks[pos];return ((t.tt&1)?(65535^m):0)|((t.tt&2)?m:0);}
        static const auto tbl=[](){
            struct Table{uint16_t masks[256][4][16];};Table t{};
            for(unsigned p=0;p<256;p++)for(int k=0;k<16;k++){
                int index=0;
                for(int j=0;j<4;j++)index|=(k>>(p>>(2*j)&3)&1)<<j;
                t.masks[p][index/4][1<<(index%4)]|=1<<k;
            }
            for(int p=0;p<256;p++)for(int j=0;j<4;j++)for(int v=1;v<16;v++)
                t.masks[p][j][v]=t.masks[p][j][v&-v]|t.masks[p][j][v&(v-1)];
            return t;
        }();
        auto& t4=tbl.masks[pos];unsigned x=t.tt;
        return t4[0][x&15]|t4[1][x>>4&15]|t4[2][x>>8&15]|t4[3][x>>12&15];
    }
    static int simplifyTruth(Builder& b,const Cut& v){
        unsigned x=v.tt;
        if(x==0 || x==65535)return x!=0;
        int used[4],n=0;
        static constexpr int mask[4]={0x5555,0x3333,0x0f0f,0x00ff};
        for(int j=0;j<v.n;j++)if(((x^(x>>(1<<j)))&mask[j])!=0)used[n++]=j;
        if(n==1)return 2*v.leaf[used[0]]+(x&1);
        if(n!=2)return -1;
        int j=used[0],k=used[1],a=v.leaf[j]*2,d=v.leaf[k]*2;
        int bits=(x&1)|((x>>(1<<j)&1)<<1)|((x>>(1<<k)&1)<<2)|((x>>((1<<j)+(1<<k))&1)<<3);
        if(bits==6||bits==9)return b.xorr(a,d)^(bits==9);
        int inv=__builtin_popcount((unsigned)bits)==3;
        int idx=__builtin_ctz((unsigned)(bits^(inv?15:0)));
        return b.land(a^(!(idx&1)),d^(!(idx&2)))^inv;
    }
    int gate(int a,int d,int s){
        int prev=b.g.base+b.g.gates.size();
        int id=s==-1?b.land(a,d):s==-2?b.xorr(a,d):b.mux(s,a,d);
        if(id/2<prev)return rep[id/2]^(id&1);
        Cut A=cut[a/2],B=cut[d/2],S=s<0?Cut{}:cut[s/2];
        Cut v=A;
        if(!add(v,B)||!add(v,S)){
            if(A.n>=B.n)A=literal(a/2);else B=literal(d/2);
            v=A;if(!add(v,B)||!add(v,S)){
                S=s<0?Cut{}:literal(s/2);v=A;
                if(!add(v,B)||!add(v,S)){A=literal(a/2);B=literal(d/2);v=A;add(v,B);add(v,S);}
            }
        }
        unsigned x=A.tt^(a&1?65535:0),y=expand(B,v)^(d&1?65535:0);
        v.tt=s==-1?(x&y):s==-2?(x^y):(x^((expand(S,v)^(s&1?65535:0))&(x^y)));
        int simple=simplifyTruth(b,v);
        if(simple>=0 && simple/2<prev)simple=rep[simple/2]^(simple&1);
        v.tt^=(id&1?65535:0);cut.push_back(v);
        rep.push_back(simple<0?id&~1:simple^(id&1));
        if(cut.size()<b.g.base+b.g.gates.size()){
            v.tt^=((id^simple)&1?65535:0);cut.push_back(v);rep.push_back(simple&~1);
        }
        return simple<0?id:simple;
    }
};

template<class Build>
Graph parse(const Circuit& c,const Reads& reads,const Writes& writes,bool banded=false) {
    const int first=2+c.I+c.F;
    int tapStart=first-1+reads.width*reads.ports.size();
    Build build(tapStart+writes.tapList.size(),c.G);build.g.tapStart=tapStart;
    struct Wire{int a,b,s,value;};
    vector<Wire> raw(first+c.G);vector<int> stack;
    for(int i=0;i<first;i++)raw[i].value=i<2?i:(i-1)*2;
    for(int k=0;k<c.G;k++)raw[first+k]={c.in0[k]|(int(c.type[k])<<24),c.in1[k],c.in2[k],-1};
    for(int k=0;k<(int)reads.ext.size();k++)if(reads.ext[k]>=0)raw[first+k].value=2*(first-1+reads.ext[k]);
    auto visit=[&](int root) {
        stack.push_back(root);
        while(!stack.empty()){
            int i=stack.back();auto &n=raw[i];
            if(n.value>=0){stack.pop_back();continue;}
            int a=raw[n.a&0xffffff].value;if(a<0){stack.push_back(n.a&0xffffff);continue;}
            int b=n.b<0?0:raw[n.b].value;if(b<0){stack.push_back(n.b);continue;}
            int s=n.s<0?0:raw[n.s].value;if(s<0){stack.push_back(n.s);continue;}
            n.value=build.make(n.a>>24,a,b,s);stack.pop_back();
        }
        return raw[root].value;
    };
    if(banded){
        vector<int> depth(first+c.G,-1),topo;topo.reserve(c.G);
        std::fill(depth.begin(),depth.begin()+first,0);
        int maximum=0;
        for(int root=first;root<first+c.G;root++){
            stack.push_back(root);
            while(!stack.empty()){
                int i=stack.back();auto &n=raw[i];
                if(depth[i]>=0){stack.pop_back();continue;}
                int a=n.a&0xffffff,b=n.b,s=n.s;
                if(depth[a]<0){stack.push_back(a);continue;}
                if(b>=0&&depth[b]<0){stack.push_back(b);continue;}
                if(s>=0&&depth[s]<0){stack.push_back(s);continue;}
                depth[i]=1+std::max({depth[a],b<0?0:depth[b],s<0?0:depth[s]});
                maximum=std::max(maximum,depth[i]);topo.push_back(i);stack.pop_back();
            }
        }
        vector<int> total(maximum/128+1),distant(total.size());
        for(int i:topo){
            auto n=raw[i];int bucket=depth[i]/128;total[bucket]++;
            for(int x:{n.a&0xffffff,n.b,n.s})if(x>=first&&depth[i]-depth[x]>512)distant[bucket]++;
        }
        int split=total.size();
        while(split>0 && distant[split-1]>total[split-1]/4)split--;
        int limit=128*split;
        if(split && split<(int)total.size()){
            vector<int> latest(depth.size(),maximum+1),counts(maximum+2),order;
            for(int k=c.G-1;k>=0;k--){
                int i=topo[k];if(depth[i]>=limit)continue;
                if(latest[i]<=maximum)depth[i]=latest[i];
                counts[depth[i]+1]++;
                auto n=raw[i];for(int x:{n.a&0xffffff,n.b,n.s})if(x>=first)latest[x]=std::min(latest[x],depth[i]-1);
            }
            std::partial_sum(counts.begin(),counts.end(),counts.begin());order.resize(counts.back());
            for(int i:topo)if(depth[i]<limit)order[counts[depth[i]]++]=i;
            for(int i:order){
                auto n=raw[i];raw[i].value=build.make(n.a>>24,raw[n.a&0xffffff].value,n.b<0?0:raw[n.b].value,n.s<0?0:raw[n.s].value);
            }
            build.g.coreEnd=build.g.gates.size();
        }
    }
    if(writes.count){
        for(int a:writes.extra)visit(a);
        build.g.phase=build.g.gates.size();
        for(int k=0;k<c.G;k++)if(writes.external[k]>=0)raw[k+first].value=2*(tapStart+writes.external[k]);
    }
    Rows rows(c);
    if(!rows.rowOf.empty()){
        // Treat each carry chain as an operation with several results. Traverse
        // its external dependencies first, verifying the contracted graph is acyclic.
        int N=first+c.G;
        vector<int> roots= c.d;roots.insert(roots.end(),c.out.begin(),c.out.end());
        int nr=rows.first.size();
        vector<int> prev(nr,-1),next(nr,-1),owner(nr,-1);
        for(int r=0;r<nr;r++){
            auto v=rows.cell[rows.first[r]];
            if(v.x<first)continue;
            int pr=rows.rowOf[v.x-first];if(pr<0||pr==r)continue;
            int k=rows.next[rows.first[pr]];
            if(k>=0&&v.x==rows.cell[k].sum&&next[pr]<0){prev[r]=pr;next[pr]=r;}
        }
        vector<vector<int>> members;
        for(int r=0;r<nr;r++)if(prev[r]<0){
            int id=members.size();members.emplace_back();
            for(int cur=r;cur>=0;cur=next[cur])owner[cur]=id;
        }
        for(int& r:rows.rowOf)if(r>=0)r=owner[r];
        for(int r=0;r<nr;r++)if(prev[r]<0){
            auto &mem=members[owner[r]];
            for(int cur=r;cur>=0;cur=next[cur]){
                auto putAnd=[&](int a){
                    if(a>=first&&c.type[a-first]==0&&rows.rowOf[a-first]<0){
                        rows.rowOf[a-first]=owner[r];mem.push_back(a);
                    }
                };
                auto start=rows.cell[rows.first[cur]];putAnd(start.z);
                if(start.z>=first && c.type[start.z-first]==0){putAnd(c.in0[start.z-first]);putAnd(c.in1[start.z-first]);}
                for(int k=rows.first[cur];k>=0;k=rows.next[k]){
                    auto v=rows.cell[k];putAnd(v.y);
                    if(cur==r)putAnd(v.x);
                    for(int x:{v.p,v.g,v.h,v.sum,v.co})mem.push_back(x);
                }
            }
        }
        vector<int> order;
        vector<uint8_t> seen(N+rows.first.size());
        auto group=[&](int x){int r=x<first?-1:rows.rowOf[x-first];return r<0?x:N+r;};
        vector<int> todo;
        bool valid=true;
        for(int root:roots){
            todo.push_back(group(root));
            while(!todo.empty()&&valid){
                int x=todo.back();todo.pop_back();
                if(x<0){seen[~x]=2;order.push_back(~x);continue;}
                if(x<first||seen[x]==2)continue;
                if(seen[x]==1){valid=false;break;}
                seen[x]=1;todo.push_back(~x);
                if(x<N){
                    auto n=raw[x];
                    for(int y:{n.a&0xffffff,n.b,n.s})if(y>=first)todo.push_back(group(y));
                }else{
                    for(int i:members[x-N]){
                        auto n=raw[i];for(int y:{n.a&0xffffff,n.b,n.s})if(y>=first&&group(y)!=x)todo.push_back(group(y));
                    }
                }
            }
            if(!valid)break;
        }
        if(valid)for(int x:order){
            if(x<N)visit(x);
            else for(int i:members[x-N])visit(i);
        }
    }
    for(int j=0;j<c.F;j++)build.g.d.push_back(writes.count&&j>=reads.bank&&j<reads.bank+writes.rows*reads.width?0:visit(c.d[j]));
    for(int i:c.out)build.g.out.push_back(visit(i));
    for(int i:writes.extra)build.g.out.push_back(visit(i));
    return std::move(build.g);
}
struct Code {
    int stateSlots=0;
    vector<uint8_t> buf;
    void byte(int x){buf.push_back(uint8_t(x));}
    void word(int x){for(int i=0;i<4;i++)byte((unsigned)x>>(i*8));}
    // Two-byte VEX, 256-bit integer instructions (0F map, 66 prefix).
    void op(int opcode,int dst,int left,int right,int base=-1,int offset=0) {
        if(base==1 && offset<32*stateSlots)base=8;
        else if(base==1)offset-=32*stateSlots;
        else if(base==2 && offset>=32*stateSlots){base=1;offset-=32*stateSlots;}
        bool extended=(base<0 ? right>=8 : base>=8);
        byte(0xc5-extended); // high r/m register needs three-byte VEX
        int vex=((~dst&8)<<4)|((~left&15)<<3)|5;
        if(extended){byte((vex&128)|0x41);byte(vex&127);}
        else byte(vex);
        byte(opcode);
        int mod=(dst&7)*8;
        if(base<0){byte(0xc0+mod+(right&7));return;}
        int mode=offset==0?0:offset<128?1:2;
        byte(mode*64+mod+(base&7));
        if(base==4)byte(0x24);
        if(mode==1)byte(offset);else if(mode==2)word(offset);
    }
    void load(int r,int bank,int slot){op(0x6f,r,0,0,bank,32*slot);}
    void save(int r,int bank,int slot){op(0x7f,r,0,0,bank,32*slot);}
    void frame(bool enter) {
        if(enter){byte(0x48);byte(0x81);byte(0xec);word(328);}
        // vmovdqu uses F3 (pp=2) on the unaligned stack.
        for(int r=6;r<16;r++){
            size_t at=buf.size();op(enter?0x7f:0x6f,r,0,0,4,32*(r-6));buf[at+1]++;
        }
        if(!enter){byte(0x48);byte(0x81);byte(0xc4);word(328);byte(0xc5);byte(0xf8);byte(0x77);byte(0xc3);}
    }
};
// Each tile is emitted independently. Values that cross tile boundaries
// have common spill locations, and other temporaries share tile-local slots.
struct Program {
    using Fn=void(*)(void*,void*,void*);
    Fn fn=nullptr,rest=nullptr;
    int slots;
    Program(const Graph& g,int I,const Reads& reads,const Writes& writes) {
        int F=g.d.size(),N=g.base+g.gates.size();
        vector<uint8_t> live(N);vector<int> q;
        for(int a:g.out)q.push_back(a/2);
        if(!reads.ports.empty()){
            for(int f=0;f<(reads.width<<reads.depth);f++)q.push_back(I+1+reads.bank+f);
            for(auto &p:reads.ports)for(int a:p.select)q.push_back(a<2?0:a-1);
        }
        for(int wire:writes.decoder){int a=wire/2;q.push_back(a<2?0:a-1);}
        while(!q.empty()){
            int i=q.back();q.pop_back();if(live[i])continue;live[i]=1;
            if(i>=g.base){auto [a,b,s]=g.gates[i-g.base];q.push_back(a/2);q.push_back(b/2);if(s>=0)q.push_back(s/2);}
            else if(i>I&&i<=I+F)q.push_back(g.d[i-I-1]/2);
        }
        // Compact node numbering makes local definitions implicit within a tile.
        vector<int> remap(N);std::iota(remap.begin(),remap.begin()+g.base,0);
        vector<Node> net;net.reserve(g.gates.size());
        auto edge=[&](int a){return remap[a/2]*2+(a&1);};
        int split=0,coreSize=0;
        for(int i=g.base;i<N;i++)if(live[i]){
            if(i<g.base+g.phase)split++;if(i<g.base+g.coreEnd)coreSize++;
            auto [a,b,s]=g.gates[i-g.base];remap[i]=g.base+net.size();
            net.push_back({edge(a),edge(b),s<0?s:edge(s)});
        }
        N=g.base+net.size();
        vector<int> head(N,-1),link(F+g.out.size()),outVal(F+g.out.size());
        auto dest=[&](int a,int j){int x=edge(a);outVal[j]=x;link[j]=head[x/2];head[x/2]=j;};
        for(int j=0;j<F;j++)if(live[I+1+j] && !(writes.count && j>=reads.bank && j<reads.bank+reads.width*writes.rows))dest(g.d[j],j);
        for(int j=0;j<(int)g.out.size();j++)dest(g.out[j],F+j);

        constexpr int K=512;
        int n1=(split+K-1)/K;
        auto tile=[&](int i){int k=i-g.base;return k<split?k/K:n1+(k-split)/K;};
        vector<int> last(N),location(N,-1);
        vector<uint8_t> inv(N);
        for(int i=g.base;i<N;i++){
            auto [a,b,s]=net[i-g.base];last[a/2]=last[b/2]=i;if(s>=0)last[s/2]=i;
            int A=(a&1)^inv[a/2],B=(b&1)^inv[b/2];
            inv[i]=s==-2?A^B:s==-1?A&B:((s&1)^inv[s/2])?B:A;
        }
        slots=g.base+g.out.size();
        for(int i=0;i<g.base;i++)location[i]=i;
        int coreLimit=g.base+coreSize;
        for(int i=g.base;i<coreLimit;i++)if(last[i]>=coreLimit)location[i]=slots++;
        vector<int> freeSlots,release(N,-1),linkSlot(N,-1);
        for(int i=g.base;i<N;i++){
            int lastTile=last[i]<g.base?-1:tile(last[i]);
            if(lastTile>tile(i) && location[i]<0){
                if(freeSlots.empty())location[i]=slots++;
                else{location[i]=freeSlots.back();freeSlots.pop_back();}
                // Link all slots whose final read occurs at this instruction.
                int end=last[i];
                linkSlot[i]=release[end];release[end]=i;
            }
            for(int j=release[i];j>=0;j=linkSlot[j])freeSlots.push_back(location[j]);
        }
        int scratch=slots;slots+=K;
        int nt=n1+(net.size()-split+K-1)/K;
        if(g.phase>=0&&nt==n1)nt++;
        vector<Code> pieces(nt+1);
        auto cmp=[&](Code& c,int op,int rd,int ra,int rb,int slot){
            if(rb>=0)c.op(op,rd,ra,rb);
            else c.op(op,rd,ra,0,1,slot*32);
        };
        auto body=[&](int part){
            auto &c=pieces[part+1];c.stateSlots=I+1+F;c.buf.reserve(K*25);

            auto output=[&](int i,int r){
                bool flipped=false;
                for(int j=head[i];j>=0;j=link[j]){
                    bool flip=(outVal[j]&1)^inv[i];
                    if(flip&&!flipped){c.op(0xef,14,15,r);flipped=true;}
                    c.save(flip?14:r,2,j<F?I+1+j:g.base+j-F);
                }
            };
            if(part<0){
                for(int i=0;i<(g.phase<0?g.base:g.tapStart);i++)if(head[i]>=0){c.load(0,1,i);output(i,0);}
            }else{
                const int lo=g.base+(part<n1?part*K:split+(part-n1)*K),hi=std::min(lo+K,part<n1?g.base+split:N);
                if(g.phase>=0&&part==n1){
                    for(int i=g.tapStart;i<g.base;i++)if(head[i]>=0){c.load(0,1,i);output(i,0);}
                }
                // Local IDs 0..K-1 are gates, the remainder are external inputs.
                // The small open-addressed map only indexes imports for this tile.
                constexpr int H=8*K,Z=4*K;
                int keys[H],index[H],items=K;
                std::fill_n(keys,H,-1);
                int mem[Z],rnum[Z],use[Z];
                std::fill_n(rnum,Z,-1);std::fill_n(use,Z,1000000000);
                auto local=[&](int i){
                    if(i>=lo)return i-lo;
                    unsigned h=(unsigned(i)*2654435761u)>>(32-__builtin_ctz(H));
                    while(keys[h]>=0&&keys[h]!=i)h=(h+1)&(H-1);
                    if(keys[h]<0){keys[h]=i;index[h]=items;mem[items++]=location[i];}
                    return index[h];
                };
                Node inputs[K],after[K];
                for(int i=hi-1;i>=lo;i--){
                    auto [a,b,s]=net[i-g.base];int l=i-lo;
                    int A=local(a/2),B=local(b/2),S=s<0?s:local(s/2);
                    mem[l]=location[i];inputs[l]={A,B,S};
                    after[l]={use[A],use[B],S<0?0:use[S]};
                    use[A]=use[B]=l;if(S>=0)use[S]=l;
                }
                int owner[14];std::fill_n(owner,14,-1);
                auto take=[&](int skip){
                    int best=-1;
                    for(int r=0;r<14;r++)if(!(skip>>r&1)){
                        if(owner[r]<0){best=r;break;}
                        if(best<0||use[owner[r]]>use[owner[best]])best=r;
                    }
                    int old=owner[best];
                    if(old>=0){
                        if(use[old]<1000000000&&mem[old]<0){
                            mem[old]=scratch+old;c.save(best,1,mem[old]);
                        }
                        rnum[old]=-1;owner[best]=-1;
                    }
                    return best;
                };
                auto load=[&](int a,int skip){
                    if(rnum[a]<0){int r=take(skip);c.load(r,1,mem[a]);rnum[a]=r;owner[r]=a;}
                    return rnum[a];
                };
                for(int i=lo;i<hi;i++){
                    int l=i-lo;auto [a,b,s]=net[i-g.base];
                    int ia=(a&1)^inv[a/2],ib=(b&1)^inv[b/2];
                    auto [A,B,S]=inputs[l];int op=0;
                    if(s==-1){
                        op=ia==ib?(ia?0xeb:0xdb):0xdf;if(!ia&&ib)std::swap(A,B);
                    }else if(s==-2)op=0xef;
                    else if((s&1)^inv[s/2])std::swap(A,B);
                    if(s<0&&op!=0xdf&&rnum[A]<0&&rnum[B]>=0)std::swap(A,B);
                    int ra=load(A,0),rb=rnum[B];
                    if(s>=0){int rs=load(S,(1<<ra)|(rb>=0?1<<rb:0));cmp(c,0xef,14,ra,rb,mem[B]);c.op(ia==ib?0xdb:0xdf,14,14,rs);}
                    auto args=inputs[l],next=after[l];use[args.a]=next.a;use[args.b]=next.b;if(S>=0)use[S]=next.s;
                    for(int j:{A,B,S})if(j>=0&&use[j]==1000000000&&rnum[j]>=0){owner[rnum[j]]=-1;rnum[j]=-1;}
                    int r=take(0);
                    if(s<0)cmp(c,op,r,ra,rb,mem[B]);else c.op(0xef,r,ra,14);
                    owner[r]=l;rnum[l]=r;
                    if(mem[l]>=0)c.save(r,1,mem[l]);
                    if(head[i]>=0)output(i,r);
                    if(use[l]==1000000000){rnum[l]=-1;owner[r]=-1;}
                }
            }

        };
        #pragma omp parallel for num_threads(std::min({8,nt+1,omp_get_max_threads()})) schedule(static)
        for(int j=-1;j<nt;j++)body(j);
        Code prefix;prefix.frame(true);prefix.op(0x76,15,15,15);
        Code suffix;suffix.frame(false);
        size_t bytes=(g.phase>=0?2:1)*(prefix.buf.size()+suffix.buf.size());for(auto &v:pieces)bytes+=v.buf.size();
        void *m=VirtualAlloc(nullptr,bytes,MEM_COMMIT|MEM_RESERVE,PAGE_READWRITE);
        if(m){
            char *p=(char*)m;
            auto copy=[&](const Code& c){if(!c.buf.empty())memcpy(p,c.buf.data(),c.buf.size());p+=c.buf.size();};
            copy(prefix);void *entry2=nullptr;
            for(int i=0;i<(int)pieces.size();i++){
                if(g.phase>=0&&i==n1+1){copy(suffix);entry2=p;copy(prefix);}
                copy(pieces[i]);
            }copy(suffix);DWORD old;
            if(VirtualProtect(m,bytes,PAGE_EXECUTE_READ,&old)){FlushInstructionCache(GetCurrentProcess(),m,bytes);fn=(Fn)m;rest=(Fn)entry2;}
            else VirtualFree(m,0,MEM_RELEASE);
        }
    }
    ~Program(){if(fn)VirtualFree((void*)fn,0,MEM_RELEASE);}
};
using V=__m256i;
struct alignas(32) Block{V v;};
template<int j,int size=32> inline void stage32(V *x) {
    constexpr unsigned masks[]={0x55555555,0x33333333,0x0f0f0f0f,0x00ff00ff,0x0000ffff};
    V mask=_mm256_set1_epi32(masks[__builtin_ctz(j)]);
    for(int l=0;l<size;l+=2*j)for(int k=l;k<l+j;k++){
        V d=(_mm256_srli_epi32(x[k],j)^x[k+j])&mask;
        x[k]^=_mm256_slli_epi32(d,j);x[k+j]^=d;
    }
}
inline void transpose32(V *x){
    stage32<16>(x);stage32<8>(x);stage32<4>(x);stage32<2>(x);stage32<1>(x);
}
template<int W> void evalReads(const Reads& rd,const Circuit& c,Block *signals,Block *words,Block *aux){
    int rows=1<<rd.depth,stride=rows+1;
    constexpr int parts=(W+31)/32;
    for(int part=0;part<parts;part++)for(int r=0;r<rows;r++){
        int first=c.I+1+rd.bank+r*W+32*part;
        alignas(32) V x[32];memcpy(x,signals+first,std::min(32,W)*32);
        if constexpr(W==16){
            stage32<8,16>(x);stage32<4,16>(x);stage32<2,16>(x);stage32<1,16>(x);
            for(int k=0;k<16;k++){x[k+16]=_mm256_srli_epi32(x[k],16);x[k]&=_mm256_set1_epi32(65535);}
        }else transpose32(x);
        for(int k=0;k<32;k++)words[(part*32+k)*stride+r].v=x[k];
    }
    int dest=c.I+c.F+1;
    V lanes=_mm256_setr_epi32(0,1,2,3,4,5,6,7);
    for(auto &p:rd.ports){
        alignas(32) V bytes[8]={},index[32];
        for(int j=0;j<rd.depth;j++){
            int a=p.select[j];bytes[j]=a==1?_mm256_set1_epi32(-1):signals[a<2?0:a-1].v;
        }
        stage32<4,8>(bytes);stage32<2,8>(bytes);stage32<1,8>(bytes);
        for(int h=0;h<4;h++)for(int k=0;k<8;k++)
            index[h*8+k]=_mm256_slli_epi32(_mm256_srli_epi32(bytes[k],h*8)&_mm256_set1_epi32(255),3)|lanes;
        for(int part=0;part<parts;part++){
            alignas(32) V x[32];
            for(int k=0;k<32;k++)
                x[k]=_mm256_i32gather_epi32((const int*)(words+(part*32+k)*stride),index[k],4);
            if constexpr(W==16){
                for(int k=0;k<16;k++)x[k]|=_mm256_slli_epi32(x[k+16],16);
                stage32<8,16>(x);stage32<4,16>(x);stage32<2,16>(x);stage32<1,16>(x);
            }else transpose32(x);
            memcpy(aux+dest-(c.I+c.F+1),x,std::min(32,W)*32);dest+=std::min(32,W);
        }
    }
}
template<int W> void evalWrites(const Reads& rd,const Writes& wr,const Circuit& c,Block *state,Block *next,const Graph& g,Block* aux){
    auto source=aux+(g.base-c.I-c.F-1)+c.O;
    int lower=rd.depth/2,lowN=1<<lower,highN=wr.rows/lowN;
    alignas(32) V low[16*32],high[16*32];
    bool decoded=!wr.decoder.empty() && wr.count<=32;
    auto value=[&](int literal){
        int a=literal/2;V v=a==1?_mm256_set1_epi32(-1):state[a<2?0:a-1].v;
        return literal&1?~v:v;
    };
    if(decoded){
        for(int p=0;p<wr.count;p++){
            const int *d=wr.decoder.data()+p*(rd.depth+1);
            auto decode=[&](V *dst,int begin,int end,V init){
                dst[p]=init;
                for(int j=begin,step=1;j<end;j++,step*=2){
                    V addr=value(d[j]);
                    for(int k=0;k<step;k++){
                        V prev=dst[k*wr.count+p];
                        dst[(k+step)*wr.count+p]=prev&addr;
                        dst[k*wr.count+p]=_mm256_andnot_si256(addr,prev);
                    }
                }
            };
            decode(low,0,lower,_mm256_set1_epi32(-1));
            decode(high,lower,rd.depth,value(d[rd.depth]));
        }
    }
    for(int r=0;r<wr.rows;r++){
        int start=1+c.I+rd.bank+r*W;
        alignas(32) V x[W];memcpy(x,state+start,sizeof x);
        for(int p=wr.count-1;p>=0;p--){
            V en=decoded?(low[(r&(lowN-1))*wr.count+p]&high[(r>>lower)*wr.count+p]):source[wr.count*W+p*wr.rows+r].v;
            if(!_mm256_testz_si256(en,en)){
                auto data=source+p*W;
                for(int b=0;b<W;b++)x[b]^=(data[b].v^x[b])&en;
            }
            int q=r*wr.count+p;
            for(int i=wr.tapBegin[q];i<wr.tapBegin[q+1];i++)aux[g.tapStart+i-(1+c.I+c.F)].v=x[wr.tapList[i]];
        }
        memcpy(next+start,x,sizeof x);
    }
}
void transpose(U *x){
    U mask=0x00000000ffffffffULL;
    for(int j=32;j;j/=2){
        for(int k=0;k<64;k=(k+j+1)&~j){
            U d=((x[k]>>j)^x[k+j])&mask;
            x[k]^=d<<j;x[k+j]^=d;
        }
        mask^=mask<<(j/2);
    }
}
struct ByteTable{U t[256];};
}
std::vector<uint64_t> simulate(const Circuit& c){
    Reads reads(c);Writes writes(c,reads);
    int same=0;for(int k=0;k<c.G;k++)same+=c.in0[k]==c.in1[k];
    bool deep=!writes.count&&c.G>10000 && std::count(c.type.begin(),c.type.end(),5)>c.G/10;
    auto g=deep&&same>c.G/32?parse<Cuts>(c,reads,writes):parse<Builder>(c,reads,writes,deep&&same<c.G/32);

    Program prog(g,c.I,reads,writes);
    if(!prog.fn){
        reads.ports.clear();reads.ext.clear();writes=Writes(c,reads);
        g=parse<Builder>(c,reads,writes);
        prog.slots=g.base+g.out.size();
    }
    int groups=(c.O+7)/8;
    vector<ByteTable> tbl(c.T*groups);
    for(int t=0;t<c.T;t++)for(int j=0;j<c.O;j++){
        U bit=scramble(step+U(t)*c.O+j);auto &tab=tbl[t*groups+j/8].t;
        int n=1<<(j%8);for(int k=0;k<n;k++)tab[n+k]=tab[k]^bit;
    }
    vector<U> h(c.M);
    auto reader=reads.width==16?evalReads<16>:reads.width==32?evalReads<32>:evalReads<64>;
    auto writer=reads.width==16?evalWrites<16>:reads.width==32?evalWrites<32>:evalWrites<64>;
    int batches=(c.M+255)/256;
    #pragma omp parallel for num_threads(std::min({reads.ports.empty()?8:16,batches,omp_get_max_threads()})) schedule(static)
    for(int k=0;k<batches;k++){
        int prefix=c.I+c.F+1;
        vector<Block> va(prefix+2),wa(prefix+2),sa(prog.slots-prefix+2),fallback;
        auto aligned=[](Block *p){return reinterpret_cast<Block*>((reinterpret_cast<uintptr_t>(p)+63)&~uintptr_t(63));};
        auto v=aligned(va.data()),w=aligned(wa.data()),scratch=aligned(sa.data());
        int wordCount=reads.ports.empty()?0:32*((reads.width+31)/32)*((1<<reads.depth)+1);
        vector<Block> words(wordCount);
        if(!prog.fn)fallback.resize(g.base+g.gates.size());
        alignas(32) U x[64],state[256],digest[256]={};
        for(int m=0;m<256;m++)state[m]=scramble(step+(c.seed^U(k*256+m)));
        for(int t=0;t<c.T;t++){
            for(int p=0;p<4;p++){
                for(int j=0;j<64;j++)x[j]=scramble(state[p*64+j]+=step);
                transpose(x);
                for(int j=0;j<c.I;j++)std::memcpy((char*)&v[j+1]+8*p,x+j,8);
            }
            if(!reads.ports.empty())reader(reads,c,v,words.data(),scratch);
            if(prog.fn){
                prog.fn(scratch,w,v);
                if(prog.rest){
                    writer(reads,writes,c,v,w,g,scratch);
                    prog.rest(scratch,w,v);
                }
            }
            else{
                std::copy_n(v,g.base,fallback.begin());
                auto val=[&](int a){V r=fallback[a>>1].v;return a&1?~r:r;};
                int i=g.base;
                for(auto [a,b,s]:g.gates){V A=val(a),B=val(b);fallback[i++].v=s==-1?(A&B):s==-2?(A^B):A^(val(s)&(A^B));}
                for(int j=0;j<c.F;j++)w[1+c.I+j].v=val(g.d[j]);
                for(int j=0;j<(int)g.out.size();j++)scratch[(g.base-prefix)+j].v=val(g.out[j]);
            }
            for(int p=0;p<4;p++){
                for(int j=0;j<c.O;j++)std::memcpy(x+j,(char*)&scratch[g.base-prefix+j]+8*p,8);
                std::fill(x+c.O,x+64,0);transpose(x);
                for(int j=0;j<groups;j++){
                    auto &tab=tbl[t*groups+j].t;
                    for(int m=0;m<64;m++)digest[p*64+m]^=tab[(x[m]>>(j*8))&255];
                }
            }

            std::swap(v,w);
        }
        std::copy_n(digest,std::min(c.M-k*256,256),h.begin()+k*256);
    }
    return h;
}




#include <cstdint>
#include <vector>
#include <queue>
#include <algorithm>
using U4 = uint64_t __attribute__((vector_size(32)));
struct GateOp { uint32_t a,b,c,dstType; };
struct GateOp16 { uint16_t a,b,c; uint32_t dstType; };
template<bool Branchless, class Op>
static inline void runGateOps(U4* val, const Op* ops, int n, U4 valid) {
    #pragma GCC unroll 4
    for(int p=0;p<n;p++) {
        const Op& op=ops[p];
        U4 a=val[op.a], b=val[op.b], cc=val[op.c], z={0,0,0,0};
        int ty=op.dstType>>28;
        if constexpr(Branchless) {
            if(ty<6) {
                int opx=ty%3;
                uint64_t ma=0ULL-(uint64_t)(opx!=2), mx=0ULL-(uint64_t)(opx!=0), mn=0ULL-(uint64_t)(ty>=3);
                U4 am{ma,ma,ma,ma}, xm{mx,mx,mx,mx}, nm{mn,mn,mn,mn};
                z=(((a&b)&am)|((a^b)&xm))^nm;
            } else if(ty==6) z=~a;
            else z=b^((b^cc)&a);
        } else {
            switch(ty) {
                case 0:z=a&b;break; case 1:z=a|b;break; case 2:z=a^b;break;
                case 3:z=(~(a&b))&valid;break; case 4:z=(~(a|b))&valid;break;
                case 5:z=(~(a^b))&valid;break; case 6:z=(~a)&valid;break;
                default:z=(b&~a)|(cc&a);break;
            }
        }
        val[op.dstType&0x0fffffffU]=z&valid;
    }
}

struct Circuit {
    int I, F, G, O, M, T;
    uint64_t seed;
    std::vector<int> d;
    std::vector<uint8_t> type;
    std::vector<int> in0, in1, in2;
    std::vector<int> out;
};

static inline uint64_t smnext(uint64_t &s) {
    uint64_t z = (s += 0x9E3779B97F4A7C15ULL);
    z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9ULL;
    z = (z ^ (z >> 27)) * 0x94D049BB133111EBULL;
    return z ^ (z >> 31);
}
static inline uint64_t mix(uint64_t x) { return smnext(x); }

std::vector<uint64_t> simulate(const Circuit& c) {
    const int I=c.I,F=c.F,G=c.G,O=c.O,M=c.M,T=c.T;
    const int base=I+F+2, ns=base+G;
    int muxCount=0;
    for(uint8_t t:c.type) muxCount+=(t==7);
    std::vector<uint64_t> ans(M,0);
    if (!M || !T) return ans;

    // Topological order of the combinational network.
    // Ignore gates outside every observable output / register-input cone.
    std::vector<uint8_t> live(G,0);
    std::vector<int> todo;
    auto markSignal=[&](int s) { int k=s-base; if(k>=0 && k<G && !live[k]) { live[k]=1; todo.push_back(k); } };
    for(int s:c.out) markSignal(s);
    for(int s:c.d) markSignal(s);
    while(!todo.empty()) {
        int k=todo.back(); todo.pop_back();
        markSignal(c.in0[k]);
        if(c.type[k]!=6) markSignal(c.in1[k]);
        if(c.type[k]==7) markSignal(c.in2[k]);
    }
    std::vector<int> indeg(G,0);
    std::vector<std::vector<int>> users(G);
    auto gateOf=[&](int s)->int { int k=s-base; return (k>=0 && k<G)?k:-1; };
    for(int k=0;k<G;k++) {
        if(!live[k]) continue;
        int a[3]={c.in0[k],c.in1[k],c.in2[k]};
        int n=c.type[k]==6?1:(c.type[k]==7?3:2);
        for(int q=0;q<n;q++){ int p=gateOf(a[q]); if(p>=0){indeg[k]++; users[p].push_back(k);} }
    }
    std::vector<int> finish; finish.reserve(G);
    std::vector<uint8_t> seen(G,0);
    std::vector<std::pair<int,size_t>> stack;
    for(int root=0;root<G;root++) if(live[root] && indeg[root]==0 && !seen[root]) {
        seen[root]=1; stack.push_back({root,users[root].size()});
        while(!stack.empty()) {
            int k=stack.back().first;
            size_t &ix=stack.back().second;
            if(ix>0) {
                int v=users[k][--ix];
                if(!seen[v]) { seen[v]=1; stack.push_back({v,users[v].size()}); }
            } else { finish.push_back(k); stack.pop_back(); }
        }
    }
    std::vector<int> order(finish.rbegin(),finish.rend());
    const int NG=(int)order.size();
    // Inputs are guaranteed acyclic.

    // Reuse storage as soon as a gate's final consumer has executed.
    std::vector<int> pos(G,-1), last(G,-1), slot(G,-1);
    for(int p=0;p<NG;p++) pos[order[p]]=p;
    auto noteUse=[&](int s,int p) { int g=s-base; if(g>=0 && g<G && live[g]) last[g]=std::max(last[g],p); };
    for(int p=0;p<NG;p++) {
        int k=order[p];
        noteUse(c.in0[k],p);
        if(c.type[k]!=6) noteUse(c.in1[k],p);
        if(c.type[k]==7) noteUse(c.in2[k],p);
    }
    for(int s:c.out) noteUse(s,NG);
    for(int s:c.d) noteUse(s,NG);
    std::vector<std::vector<int>> release(NG+1);
    for(int k:order) if(last[k]>=0) release[last[k]].push_back(k);
    std::vector<int> freeSlots;
    int nslots=0;
    for(int p=0;p<NG;p++) {
        for(int k:release[p]) freeSlots.push_back(slot[k]);
        int k=order[p];
        if(freeSlots.empty()) slot[k]=nslots++;
        else { slot[k]=freeSlots.back(); freeSlots.pop_back(); }
    }
    auto encode=[&](int s)->int {
        if(s==0) return 0;
        if(s==1) return 1;
        if(s<I+2) return 2+F+(s-2);
        if(s<base) return 2+(s-(I+2));
        return 2+F+I+slot[s-base];
    };
    const bool useBranchless=(long long)muxCount*10 < G;
    const bool narrow=useBranchless && (2LL+F+I+nslots)<=65536;
    std::vector<GateOp> ops;
    std::vector<GateOp16> ops16;
    if(narrow) ops16.reserve(NG); else ops.reserve(NG);
    for(int k:order) {
        uint32_t a=(uint32_t)encode(c.in0[k]);
        uint32_t b=(uint32_t)(c.in1[k]>=0?encode(c.in1[k]):0);
        uint32_t cc=(uint32_t)(c.in2[k]>=0?encode(c.in2[k]):0);
        uint32_t dt=(uint32_t)(2+F+I+slot[k])|((uint32_t)c.type[k]<<28);
        if(narrow) ops16.push_back({(uint16_t)a,(uint16_t)b,(uint16_t)cc,dt});
        else ops.push_back({a,b,cc,dt});
    }
    std::vector<int> dref(F),oref(O);
    for(int f=0;f<F;f++) dref[f]=encode(c.d[f]);
    for(int j=0;j<O;j++) oref[j]=encode(c.out[j]);

    const int B=256, chunks=(M+B-1)/B;
    // Random inputs transposed into one 64-bit word per PI and time slice.
    std::vector<U4> pi((size_t)T*chunks*I);
    for(int m=0;m<M;m++) {
        uint64_t st=mix(c.seed ^ (uint64_t)m);
        int ch=m/B, bit=m%B, lane=bit/64, b=bit%64;
        for(int t=0;t<T;t++) {
            uint64_t r=smnext(st); size_t off=((size_t)t*chunks+ch)*I;
            while(r){ unsigned x=(unsigned)__builtin_ctzll(r); if(x<(unsigned)I) pi[off+x][lane]|=uint64_t(1)<<b; r&=r-1; }
        }
    }
    std::vector<uint64_t> digest(M,0);
    std::vector<uint64_t> weight((size_t)T*O);
    for(int t=0;t<T;t++) for(int j=0;j<O;j++) weight[(size_t)t*O+j]=mix((uint64_t)t*(uint64_t)O+(uint64_t)j);
    // Process independent blocks. Each signal stores one bit per excitation.
    #pragma omp parallel
    {
        std::vector<U4> val(2+F+I+nslots);
        std::vector<U4> next(F);
        #pragma omp for schedule(static)
        for(int ch=0;ch<chunks;ch++) {
            U4 valid={~uint64_t(0),~uint64_t(0),~uint64_t(0),~uint64_t(0)};
            if(ch==chunks-1 && M%B) for(int l=0;l<4;l++){ int rem=M%B-l*64; valid[l]=rem>=64?~uint64_t(0):(rem<=0?0:((uint64_t(1)<<rem)-1)); }
            for(int f=0;f<F;f++) val[2+f]=U4{0,0,0,0};
            for(int t=0;t<T;t++) {
                val[0]=U4{0,0,0,0}; val[1]=valid;
                size_t po=((size_t)t*chunks+ch)*I;
                for(int i=0;i<I;i++) val[2+F+i]=pi[po+i];
                if(useBranchless) {
                    if(narrow) runGateOps<true>(val.data(),ops16.data(),NG,valid);
                    else runGateOps<true>(val.data(),ops.data(),NG,valid);
                } else {
                    if(narrow) runGateOps<false>(val.data(),ops16.data(),NG,valid);
                    else runGateOps<false>(val.data(),ops.data(),NG,valid);
                }
                for(int j=0;j<O;j++) {
                    U4 x=val[oref[j]]; uint64_t h=weight[(size_t)t*O+j];
                    for(int l=0;l<4;l++){ uint64_t w=x[l]; int first=ch*B+l*64; while(w){unsigned b=(unsigned)__builtin_ctzll(w); int m=first+(int)b; if(m<M) digest[m]^=h; w&=w-1;} }
                }
                for(int f=0;f<F;f++) next[f]=val[dref[f]];
                for(int f=0;f<F;f++) val[2+f]=next[f];
            }
        }
    }
    return digest;
}

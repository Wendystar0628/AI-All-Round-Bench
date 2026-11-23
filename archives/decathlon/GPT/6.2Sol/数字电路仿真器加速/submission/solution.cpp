#include <algorithm>
#include <array>
#include <bit>
#include <cstdint>
#include <cstring>
#include <memory>
#include <vector>
#include <immintrin.h>
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
using Word = uint64_t;
using Vec = __m256i;

constexpr Word step = 0x9E3779B97F4A7C15ULL;
Word mix(Word x) {
    x = (x ^ (x >> 30)) * 0xBF58476D1CE4E5B9ULL;
    x = (x ^ (x >> 27)) * 0x94D049BB133111EBULL;
    return x ^ (x >> 31);
}

std::vector<int> topo(const Circuit& c) {
    const int base = c.I + c.F + 2;
    std::vector<uint8_t> visited(c.G);
    std::vector<int> order, stack;
    order.reserve(c.G);
    stack.reserve(c.G);
    auto visit = [&](int root) {
        if (root < base || visited[root - base]) return;
        stack.push_back(root - base);
        while (!stack.empty()) {
            const int k = stack.back();
            if (k < 0) {
                order.push_back(~k);
                stack.pop_back();
                continue;
            }
            stack.pop_back();
            if (visited[k]) continue;
            visited[k] = 1;
            stack.push_back(~k);
            auto push = [&](int x) {
                if (x >= base && !visited[x - base]) stack.push_back(x - base);
            };
            push(c.in2[k]);
            push(c.in1[k]);
            push(c.in0[k]);
        }
    };
    for (int x : c.out) visit(x);
    for (int x : c.d) visit(x);
    return order;
}

// A literal stores the node number and one inversion bit. Node 0 is false.
struct Node {
    int a, b, s; // s = -1 for AND, -2 for XOR, otherwise the select literal
};

class Graph {
    std::vector<uint32_t> table;
    uint32_t indexMask=0;

    int intern(int a, int b, int s) {
        if (table.empty()) {
            const int index=int(nodes.size());
            nodes.push_back({a,b,s});
            return 2*index;
        }
        auto hash = uint32_t(a) * 0x9E3779B1u;
        hash = (hash ^ uint32_t(b)) * 0x85EBCA77u;
        hash = (hash ^ uint32_t(s)) * 0xC2B2AE3Du;
        size_t slot = (hash ^ (hash >> 16)) & (table.size()-1);
        const uint32_t tag=hash & ~indexMask;
        while (const uint32_t entry=table[slot]) {
            if ((entry & ~indexMask)==tag) {
                const auto index=entry & indexMask;
                const Node& n = nodes[index];
                if (n.a==a && n.b==b && n.s==s) return 2*int(index);
            }
            slot = (slot + 1) & (table.size()-1);
        }
        const int index = int(nodes.size());
        table[slot] = tag | uint32_t(index);
        nodes.push_back({a,b,s});
        return 2 * index;
    }

    int under(int x, int lit, int v) const {
        if (x == lit) return v;
        if (x == (lit ^ 1)) return v ^ 1;
        if (x/2 < first) return x;
        const Node& n = nodes[x/2];
        const int phase = x & 1;
        int hit = n.a == lit ? 0 : n.b == lit ? 1 : n.a == (lit^1) ? 2 : n.b == (lit^1) ? 3 : -1;
        if (hit >= 0 && n.s < 0) {
            const int value = v ^ (hit>>1);
            const int other = hit&1 ? n.a : n.b;
            return n.s == -1 ? (value ? other ^ phase : phase) : other ^ value ^ phase;
        }
        if (n.s >= 0 && n.s == (lit&~1)) return ((v ^ (lit & 1)) ? n.b : n.a) ^ phase;
        return x;
    }

    int absorb(int a, int b) const {
        if (b/2 < first) return b;
        const int r=under(b,a,1);
        if (r!=b) return r;
        if ((a&1) || a/2<first) return b;
        const Node& n=nodes[a/2];
        const Node& m=nodes[b/2];
        if (n.s!= -1 || m.s!= -1) return b;
        if ((n.a^1)==m.a || (n.a^1)==m.b || (n.b^1)==m.a || (n.b^1)==m.b)
            return b&1;
        if (b&1) {
            if (n.a==m.a || n.b==m.a) return m.b^1;
            if (n.a==m.b || n.b==m.b) return m.a^1;
        }
        return b;
    }

public:
    const int first;
    const bool arithmetic;
    bool isArithmetic() const { return arithmetic; }
    std::vector<Node> nodes;
    std::vector<int> outputs, next;

    Graph(int inputs, size_t gates, bool share, bool isArithmetic) : first(1 + inputs), arithmetic(isArithmetic), nodes(first) {
        if (share) {
            size_t size = 16;
            while (size < 2 * gates) size *= 2;
            table.resize(size);
            indexMask=std::bit_ceil(uint32_t(first+gates))-1;
        }
        nodes.reserve(first + gates);
    }

    int conjunction(int a, int b) {
        for (;;) {
            if (!a || !b || a == (b ^ 1)) return 0;
            if (a == 1 || a == b) return b;
            if (b == 1) return a;
            if (int r=absorb(a,b); r!=b) { b=r; continue; }
            if (int r=absorb(b,a); r!=a) { a=r; continue; }
            if (a>1 && b>1 && (a&1) && (b&1) && a/2>=first && b/2>=first) {
                const Node& n=nodes[a/2];const Node& m=nodes[b/2];
                if (n.s==-1 && m.s==-1 && (n.a^n.b^m.a^m.b)==1) {
                    if (n.a==m.a || n.a==m.b) return n.a^1;
                    if (n.b==m.a || n.b==m.b) return n.b^1;
                }
            }
            if (a > b) std::swap(a,b);
            return intern(a,b,-1);
        }
    }

    int parity(int a, int b) {
        const int phase = (a ^ b) & 1;
        a &= ~1;
        b &= ~1;
        for (;;) {
            if (!a || !b || a == b) return a ^ b ^ phase;
            if (a > b) std::swap(a,b);
            if (b/2 >= first) {
                const Node& y = nodes[b/2];
                if (y.s == -2 && (y.a == a || y.b == a))
                    return y.a ^ y.b ^ a ^ phase;
                if (a/2 >= first && y.s == -2) {
                    const Node& x=nodes[a/2];
                    if (x.s == -2) {
                        int common=-1;
                        if (x.a==y.a || x.a==y.b) common=x.a;
                        else if (x.b==y.a || x.b==y.b) common=x.b;
                        if (common>=0) {
                            a=x.a ^ x.b ^ common;
                            b=y.a ^ y.b ^ common;
                            continue;
                        }
                    }
                }
            }
            return intern(a,b,-2) ^ phase;
        }
    }

    int select(int s, int a, int b) {
        if (s & 1) std::swap(a,b);
        s &= ~1;
        if (!s || a == b) return a;
        for (;;) {
            const int r=under(a,s,0);
            if(r==a) break;
            a=r;
        }
        for (;;) {
            const int r=under(b,s,1);
            if(r==b) break;
            b=r;
        }
        if (a == b) return a;
        if ((a ^ b) == 1) return parity(s,a);
        if (a < 2) return conjunction(s,b ^ a) ^ a;
        if (b < 2) return conjunction(s ^ 1,a ^ b) ^ b;
        const int phase = a & 1;
        return intern(a ^ phase,b ^ phase,s) ^ phase;
    }
};

Graph build(const Circuit& c, const std::vector<int>& order) {
    const size_t arithmetic = std::count_if(c.type.begin(),c.type.end(),
                                           [](uint8_t type){return type < 3;});
    const bool isArithmetic=c.G>=1024 && arithmetic*10>size_t(c.G)*9;
    const bool isChain=c.G>=100000 && arithmetic*10<size_t(c.G)*6 &&
                       std::count(c.type.begin(),c.type.end(),7)<c.G/6;
    int same=0;
    if(isChain) for(int i=0;i<c.G;++i) same+=c.in0[i]==c.in1[i];
    Graph graph(c.I+c.F,order.size(),!isArithmetic && (!isChain || same>c.G/40),isArithmetic);
    const int base = c.I + c.F + 2;
    std::vector<int> lits(base + c.G);
    lits[1] = 1;
    for (int x = 2; x < base; ++x) lits[x] = 2*(x-1);
    for (int k : order) {
        const int a = lits[c.in0[k]];
        const int b = c.in1[k] < 0 ? 0 : lits[c.in1[k]];
        int r;
        switch (c.type[k]) {
        case 0: r = graph.conjunction(a,b); break;
        case 1: r = graph.conjunction(a^1,b^1)^1; break;
        case 2: r = graph.parity(a,b); break;
        case 3: r = graph.conjunction(a,b)^1; break;
        case 4: r = graph.conjunction(a^1,b^1); break;
        case 5: r = graph.parity(a,b)^1; break;
        case 6: r = a^1; break;
        default: r = graph.select(a,b,lits[c.in2[k]]); break;
        }
        lits[base+k] = r;
    }
    for (int x : c.out) graph.outputs.push_back(lits[x]);
    for (int x : c.d) graph.next.push_back(lits[x]);
    return graph;
}

struct Schedule {
    std::vector<int> order, last;
    std::vector<uint8_t> phase;
    std::vector<uint8_t> live;
};

Schedule schedule(const Graph& graph, const Circuit& c) {
    Schedule sc;
    sc.live.resize(graph.nodes.size());
    std::vector<int> stack;
    // State dependencies influence reachability independently of the
    // combinational order, since they cross cycle boundaries.
    for (int x:graph.outputs) stack.push_back(x/2);
    while (!stack.empty()) {
        const int y=stack.back();
        stack.pop_back();
        if(sc.live[y])continue;
        sc.live[y]=1;
        if(y<graph.first) {
            if(y>c.I)stack.push_back(graph.next[y-c.I-1]/2);
            continue;
        }
        const auto& n=graph.nodes[y];
        if(n.s>=0)stack.push_back(n.s/2);
        stack.push_back(n.b/2);
        stack.push_back(n.a/2);
    }
    for (int y=graph.first; y<int(graph.nodes.size()); ++y)
        if(sc.live[y])sc.order.push_back(y);
    return sc;
}

void prepare(Schedule& sc, const Graph& graph, bool allowReorder,
             const std::vector<int>* packedNodes=nullptr, const std::vector<uint8_t>* writers=nullptr,
             const std::vector<uint8_t>* prefix=nullptr) {
    if(packedNodes) {
        size_t end=0;
        for(int y:sc.order)
            if((*packedNodes)[y]<0 && (!writers || !(*writers)[y])) sc.order[end++]=y;
        sc.order.resize(end);
        if(prefix) std::stable_partition(sc.order.begin(),sc.order.end(),[&](int y){return (*prefix)[y];});
    }
    const size_t size=graph.nodes.size();
    if (allowReorder && graph.isArithmetic() && sc.order.size()>300000 && !packedNodes) {
        std::vector<int> depth(size);
        for(int y:sc.order) {
            const auto& n=graph.nodes[y];
            depth[y]=1+std::max({depth[n.a/2],depth[n.b/2],n.s<0?0:depth[n.s/2]});
        }
        std::vector<int> roots, pending;
        for(int x:graph.outputs) roots.push_back(x/2);
        for(size_t f=0;f<graph.next.size();++f) {
            const int ff=graph.first-int(graph.next.size())+int(f);
            if(sc.live[ff])roots.push_back(graph.next[f]/2);
        }
        std::stable_sort(roots.begin(),roots.end(),[&](int a,int b){return depth[a]<depth[b];});
        std::vector<uint8_t> done(size);
        sc.order.clear();
        for(int x:roots) {
            pending.push_back(x);
            while(!pending.empty()) {
                const int y=pending.back();
                pending.pop_back();
                if(y<0) {sc.order.push_back(~y);continue;}
                if(y<graph.first||done[y])continue;
                done[y]=1;
                pending.push_back(~y);
                const auto& n=graph.nodes[y];
                int a=n.a/2,b=n.b/2,c=n.s<0?0:n.s/2;
                if(depth[a]<depth[b])std::swap(a,b);
                if(depth[a]<depth[c])std::swap(a,c);
                if(depth[b]<depth[c])std::swap(b,c);
                if(c>=graph.first&&!done[c])pending.push_back(c);
                if(b>=graph.first&&!done[b])pending.push_back(b);
                if(a>=graph.first&&!done[a])pending.push_back(a);
            }
        }
    }
    else if (allowReorder && sc.order.size()>300000 && !packedNodes) {
        std::vector<int> depth(size);
        int maxLevel=0;
        constexpr int stepDepth=16;
        for (int y:sc.order) {
            const auto& n=graph.nodes[y];
            depth[y]=1+std::max({depth[n.a/2],depth[n.b/2],n.s<0?0:depth[n.s/2]});
            maxLevel=std::max(maxLevel,depth[y]/stepDepth);
        }
        // Keep neighboring gates together while bringing stages that are
        // independent of one another closer in the instruction stream.
        if(maxLevel<2000) {
            std::vector<int> bucket(maxLevel+1);
            for (int y:sc.order) ++bucket[depth[y]/stepDepth];
            int next=0;
            for (int& n:bucket) { int tmp=n;n=next;next+=tmp; }
            std::vector<int> ordered(sc.order.size());
            for (int y:sc.order) ordered[bucket[depth[y]/stepDepth]++]=y;
            sc.order.swap(ordered);
        }
    }
    sc.phase.resize(size);
    sc.last.assign(size,-1);
    int point = 0;
    for (int y : sc.order) {
        const Node& n = graph.nodes[y];
        sc.last[n.a/2] = point;
        sc.last[n.b/2] = point;
        if (n.s >= 0) sc.last[n.s/2] = point;
        bool a = (n.a&1) ^ sc.phase[n.a/2];
        bool b = (n.b&1) ^ sc.phase[n.b/2];
        sc.phase[y] = n.s == -1 ? a && b : n.s == -2 ? a ^ b :
            ((n.s&1) ^ sc.phase[n.s/2]) ? b : a;
        ++point;
    }
}

// AVX2 encoder for the small set of instructions used by the gate evaluator.
// All memory operands refer to a vector slot in the array passed in RCX.
class Code {
    std::vector<uint8_t> bytes;
    void byte(int b) { bytes.push_back(uint8_t(b)); }
    void imm(int n) {
        for (int sh=0; sh<32; sh+=8) byte(uint32_t(n)>>sh);
    }

public:
    size_t offset() const { return bytes.size(); }
    explicit Code(size_t capacity) { bytes.reserve(capacity); }
    void raw(std::initializer_list<int> data) { for (int b : data) byte(b); }

    void op(int opcode, int dest, int lhs, int rhs, int base=1, int bias=0) {
        const bool high = rhs >= 8 && rhs < 16;
        if (base < 8 && !high) {
            byte(0xc5);
            byte((dest<8 ? 0x80 : 0) | ((15-lhs)<<3) | 5);
        } else {
            byte(0xc4);
            byte((dest<8 ? 0x80 : 0) | 0x40 | (high || base>=8 ? 0 : 0x20) | 1);
            byte(((15-lhs)<<3) | 5);
        }
        byte(opcode);
        if (rhs < 16) {
            byte(0xc0 | ((dest&7)<<3) | (rhs&7));
        } else {
            const int offset = (rhs-16)*32-bias;
            const int mode = offset == 0 ? 0 : offset >= -128 && offset <= 127 ? 0x40 : 0x80;
            byte(mode | ((dest&7)<<3) | (base&7));
            if (mode == 0x40) byte(offset);
            if (mode == 0x80) imm(offset);
        }
    }

    void blend(int dest, int lhs, int rhs, int mask, int base=1) {
        const bool high = rhs>=8 && rhs<16;
        byte(0xc4); byte((dest<8 ? 0x80 : 0) | 0x40 | (high ? 0 : 0x20) | 3);
        byte(((15-lhs)<<3)|5); byte(0x4c);
        if (rhs<16) byte(0xc0 | ((dest&7)<<3) | (rhs&7));
        else {
            byte(0x80 | base | ((dest&7)<<3));
            imm((rhs-16)*32);
        }
        byte(mask<<4);
    }

    void packBit(int reg, int bit, int offset) {
        if (bit != 7) {
            // vpsllw ymm15, ymm<reg>, 7-bit
            byte(0xc4); byte(reg<8 ? 0xe1 : 0xc1); byte(5);
            byte(0x71); byte(0xf0 | (reg&7)); byte(7-bit);
            reg=15;
        }
        // vpmovmskb r9d, ymm<reg>; mov [rdx+offset*32], r9d
        byte(0xc4); byte(reg<8?0x61:0x41); byte(0x7d);
        byte(0xd7); byte(0xc8 | (reg&7));
        byte(0x44); byte(0x89); byte(0x8a); imm(offset*32);
    }

    void save(int reg, bool store) {
        // 128-bit nonvolatile portions of YMM6 through YMM15.
        byte(0xc5); byte(reg<8 ? 0xfa : 0x7a);
        byte(store ? 0x7f : 0x6f);
        byte(0x84 | ((reg&7)<<3)); byte(0x24);
        imm(16*(reg-6));
    }

    void start(bool hot=false) {
        if(hot) raw({0x53,0x56,0x57});
        raw({0x48,0x81,0xec,0xa0,0,0,0});
        for (int r=6; r<16; ++r) save(r,true);
        op(0x76,15,15,15); // all ones
    }

    void finish(bool hot=false) {
        for (int r=6; r<16; ++r) save(r,false);
        raw({0xc5,0xf8,0x77,0x48,0x81,0xc4,0xa0,0,0,0});
        if(hot) raw({0x5f,0x5e,0x5b});
        byte(0xc3);
    }

    void bank(int reg, int offset) {
        raw({0x48,0x8d,0x81|(reg<<3)});
        imm(offset);
    }

    void* executable() const {
        void* p = VirtualAlloc(nullptr,bytes.size(),MEM_RESERVE|MEM_COMMIT,PAGE_READWRITE);
        if (!p) return nullptr;
        std::memcpy(p,bytes.data(),bytes.size());
        DWORD previous;
        if (!VirtualProtect(p,bytes.size(),PAGE_EXECUTE_READ,&previous)) {
            VirtualFree(p,0,MEM_RELEASE);
            return nullptr;
        }
        FlushInstructionCache(GetCurrentProcess(),p,bytes.size());
        return p;
    }
};

struct ReadBundle {
    int a=-1, b=-1, select=-1;
    std::array<int,8> member{};
    unsigned needed=0;
};

struct ReadPlan {
    int inputBundles=0;
    std::vector<ReadBundle> bundles;
    std::vector<int> packed, memory, selectors, order;
    std::vector<int> inputGroup, selectorSlot;
    int roots=0;

    ReadPlan(const Graph& g, const Circuit& c, const Schedule& sc) {
        const int muxes=std::count_if(sc.order.begin(),sc.order.end(),
            [&](int x){return g.nodes[x].s>=0;});
        if (muxes < 100000) return;

        packed.assign(g.nodes.size(),-1);
        memory.assign(g.nodes.size(),-1);
        inputBundles=c.F/8;
        bundles.resize(inputBundles);
        inputGroup.assign(inputBundles,-1);
        selectorSlot.assign(g.first,-1);
        for (int i=0; i<inputBundles*8; ++i) packed[c.I+1+i]=i;
        std::vector<int> table(1u<<std::bit_width(unsigned(2*muxes)));
        for (int y : sc.order) {
            const Node& n=g.nodes[y];
            if (n.s<0 || n.s/2>=g.first || ((n.a|n.b|n.s)&1)) continue;
            const int a=packed[n.a/2],b=packed[n.b/2],s=n.s/2;
            if (a<0 || b<0 || ((a^b)&7) || a/8==b/8) continue;
            uint32_t hash = (uint32_t(a/8)*0x9e3779b1u ^ uint32_t(b/8)*0x85ebca77u ^ uint32_t(s))*0xc2b2ae3du;
            size_t h=(hash^(hash>>16))&(table.size()-1);
            int id;
            for (;;) {
                id=table[h];
                if (!id) {
                    id=int(bundles.size());
                    table[h]=id+1;
                    bundles.push_back({a/8,b/8,s,{},0});
                    break;
                }
                --id;
                const auto& t=bundles[id];
                if (t.a==a/8 && t.b==b/8 && t.select==s) break;
                h=(h+1)&(table.size()-1);
            }
            packed[y]=8*id+(a&7);
            bundles[id].member[a&7]=y;
        }
        if (bundles.size() < size_t(inputBundles+4096)) {
            bundles.clear();
            return;
        }

        // Keep sparse groups in the general circuit unless they are
        // predecessors of dense groups. Every switched lane is exact.
        std::vector<uint8_t> useBundle(bundles.size());
        for (int i=int(bundles.size())-1;i>=inputBundles;--i) {
            const auto& node=bundles[i];
            int present=std::count_if(node.member.begin(),node.member.end(),[](int y){return y!=0;});
            if (present>=7 || useBundle[i]) {
                useBundle[i]=1;
                useBundle[node.a]=1;
                useBundle[node.b]=1;
            }
        }
        for (int y : sc.order)
            if (packed[y]>=0 && !useBundle[packed[y]/8]) packed[y]=-1;

        const auto exportNode = [&](int lit) {
            const int y=lit/2;
            if (y<g.first || packed[y]<0 || memory[y]>=0) return;
            memory[y]=roots++;
            bundles[packed[y]/8].needed|=1u<<(packed[y]&7);
        };
        for (int y : sc.order) {
            if (packed[y]>=0) continue;
            const Node& n=g.nodes[y];
            exportNode(n.a);
            exportNode(n.b);
            if (n.s>=0) exportNode(n.s);
        }
        for (int y:g.outputs) exportNode(y);
        for (int f=0;f<c.F;++f)
            if(sc.live[c.I+1+f]) exportNode(g.next[f]);

        std::vector<uint8_t> needed(bundles.size());
        for (int i=int(bundles.size())-1;i>=inputBundles;--i) {
            const auto& node=bundles[i];
            if (node.needed || needed[i]) {
                needed[i]=1;
                needed[node.a]=1;
                needed[node.b]=1;
                order.push_back(i);
                if (selectorSlot[node.select]<0) {
                    selectorSlot[node.select]=int(selectors.size());
                    selectors.push_back(node.select);
                }
            }
        }
        // Walk full read trees before their externally used descendants.
        std::vector<int> depth(bundles.size()), rootsByDepth=order;
        for (auto it=order.rbegin();it!=order.rend();++it) {
            const auto& n=bundles[*it];
            depth[*it]=1+std::max(depth[n.a],depth[n.b]);
        }
        std::stable_sort(rootsByDepth.begin(),rootsByDepth.end(),[&](int a,int b) { return depth[a]>depth[b]; });
        order.clear();
        std::vector<int> stack;
        for (int x:rootsByDepth) {
            stack.push_back(x);
            while (!stack.empty()) {
                const int y=stack.back();
                stack.pop_back();
                if (y<0) { order.push_back(~y); continue; }
                if (y<inputBundles || !needed[y]) continue;
                needed[y]=0;
                const auto& n=bundles[y];
                stack.push_back(~y);
                stack.push_back(n.b);
                stack.push_back(n.a);
            }
        }
        // Assign export slots in the order the read kernel writes them.
        // Each of the eight stimulus slices streams through the same slots.
        roots=0;
        for(int y:order) {
            const auto& bundle=bundles[y];
            for(unsigned mask=bundle.needed;mask;mask&=mask-1) {
                const int bit=__builtin_ctz(mask);
                memory[bundle.member[bit]]=roots++;
            }
        }
        int offset=0;
        for (int i=0;i<inputBundles;++i)
            if(needed[i]) inputGroup[i]=offset++;
    }

    bool has(int y) const { return !order.empty() && packed[y]>=8*inputBundles; }
};

class PackedCompiler {
    const ReadPlan& read;
    Code code;
    std::vector<int> last, location, slots, freeSlots;
    static constexpr int dataRegs=9;
    std::array<int,dataRegs> owner;
    int capacity_;
    int point=0;

    int slot(int x) {
        if (slots[x] < 0) {
            if (freeSlots.empty()) slots[x]=capacity_++;
            else {
                slots[x]=freeSlots.back();
                freeSlots.pop_back();
            }
        }
        return slots[x]+16;
    }
    int arg(int x) {
        return location[x]>=0 ? location[x] : slot(x);
    }
    void release(int x, bool mem) {
        if (x<read.inputBundles || last[x]!=point) return;
        if (!mem && location[x]>=0) {
            owner[location[x]]=-1;
            location[x]=-1;
        }
        if (mem && slots[x]>=0) {
            freeSlots.push_back(slots[x]);
            slots[x]=-1;
        }
    }
    int reg(int x) {
        int r=0;
        for (;r<dataRegs;++r) if (owner[r]<0) break;
        if (r==dataRegs) {
            r=0;
            for(int j=1;j<dataRegs;++j)
                if (last[owner[j]]>last[owner[r]]) r=j;
            const int old=owner[r];
            if (slots[old]<0) code.op(0x7f,r,0,slot(old));
            location[old]=-1;
        }
        owner[r]=x;
        location[x]=r;
        return r;
    }
public:
    PackedCompiler(const ReadPlan& plan) : read(plan), code(16*plan.order.size()),
        last(plan.bundles.size(),-1), location(plan.bundles.size(),-1),
        slots(plan.bundles.size(),-1), capacity_(0) {
        owner.fill(-1);
        for(int x=0;x<read.inputBundles;++x)
            if(read.inputGroup[x]>=0) slots[x]=capacity_++;
        capacity_+=int(read.selectors.size());
        int p=0;
        for (int i:read.order) {
            const auto& n=read.bundles[i];
            last[n.a]=last[n.b]=p++;
        }
    }
    void* compile() {
        code.start();
        code.raw({0x4c,0x89,0xc0});
        int inputCount=capacity_-int(read.selectors.size());
        std::array<int,5> maskOwner, maskAge{};
        maskOwner.fill(-1);
        for(int x:read.order) {
            const auto& n=read.bundles[x];
            int a=arg(n.a), b=arg(n.b);
            release(n.a,false);
            release(n.b,false);
            int dst=reg(x);
            if(a>=16) {
                code.op(0x6f,14,0,a,a<16+inputCount?0:1);
                a=14;
            }
            int maskReg=0, oldest=0;
            for (;maskReg<5;++maskReg) {
                if(maskOwner[maskReg]==n.select) break;
                if(maskOwner[maskReg]<0 || maskAge[maskReg]<maskAge[oldest]) oldest=maskReg;
            }
            if(maskReg==5) {
                maskReg=oldest;
                code.op(0x6f,dataRegs+maskReg,0,16+inputCount+read.selectorSlot[n.select]);
                maskOwner[maskReg]=n.select;
            }
            maskAge[maskReg]=point;
            code.blend(dst,a,b,dataRegs+maskReg,b>=16 && b<16+inputCount ? 0 : 1);
            for (unsigned mask=n.needed;mask;mask&=mask-1) {
                const int bit=__builtin_ctz(mask);
                const int index=read.memory[n.member[bit]];
                code.packBit(dst,7-bit,index);
            }
            if(last[x]<0) { location[x]=-1; owner[dst]=-1; }
            release(n.a,true);
            release(n.b,true);
            ++point;
        }
        code.finish();
        return code.executable();
    }
    int capacity() const { return capacity_; }
};

using ReadKernel = void (*)(Vec*, void*, const Vec*);
struct ReadRunner {
    const ReadPlan& plan;
    ReadKernel kernel;
    int kernelSlots;
    int groups;

    int capacity() const { return kernelSlots+8*groups; }

    // Convert eight signal planes to eight blocks of 32 register bytes.
    void pack(const Vec* ff, Vec* first) const {
        Vec pairs[8], quads[8];
        for (int p=0;p<4;++p) {
            pairs[2*p]=_mm256_unpacklo_epi8(ff[2*p],ff[2*p+1]);
            pairs[2*p+1]=_mm256_unpackhi_epi8(ff[2*p],ff[2*p+1]);
        }
        for (int part=0;part<2;++part) {
            const int x=4*part;
            for (int i=0;i<2;++i) {
                quads[x+2*i]=_mm256_unpacklo_epi16(pairs[x+i],pairs[x+i+2]);
                quads[x+2*i+1]=_mm256_unpackhi_epi16(pairs[x+i],pairs[x+i+2]);
            }
        }
        const Vec id=_mm256_set1_epi64x(0x8040201008040201ULL);
        for (int i=0;i<4;++i) {
            const Vec a=_mm256_unpacklo_epi32(quads[i],quads[i+4]);
            const Vec b=_mm256_unpackhi_epi32(quads[i],quads[i+4]);
            first[i*groups]=_mm256_gf2p8affine_epi64_epi8(id,_mm256_permute2x128_si256(a,b,0x20),0);
            first[(i+4)*groups]=_mm256_gf2p8affine_epi64_epi8(id,_mm256_permute2x128_si256(a,b,0x31),0);
        }
    }

    void run(Vec* tmp, const Vec* pi, const Vec* ff, Vec* outputs, int inputCount) const {
        const Vec bits = _mm256_set1_epi64x(0x8040201008040201ULL);
        const Vec replicate = _mm256_set_epi64x(0x0303030303030303ULL,0x0202020202020202ULL,
                                                 0x0101010101010101ULL,0);
        Vec* input=tmp+kernelSlots;
        for(int i=0;i<plan.inputBundles;++i) {
            const int group=plan.inputGroup[i];
            if(group>=0) pack(ff+8*i,input+group);
        }
        for (int word=0; word<8; ++word) {
            for (unsigned k=0;k<plan.selectors.size();++k) {
                const int sel=plan.selectors[k];
                const Vec data=sel<inputCount ? pi[sel] : ff[sel-inputCount];
                const Vec duplicated=_mm256_permutevar8x32_epi32(data,_mm256_set1_epi32(word));
                tmp[groups+k]=_mm256_cmpeq_epi8(_mm256_and_si256(_mm256_shuffle_epi8(duplicated,replicate),bits),bits);
            }
            kernel(tmp,reinterpret_cast<uint32_t*>(outputs)+word,input+word*groups);
        }
    }
};

struct WriteBit {
    int control, data, result;
};
struct WriteStage {
    int control, dataSet;
    std::vector<std::pair<int,int>> exports;
};
struct WriteGroup {
    int first, width;
    std::vector<WriteStage> stages;
};
struct WritePlan {
    std::vector<uint8_t> owned, prefix, writes;
    std::vector<int> memory;
    std::vector<WriteGroup> groups;
    std::vector<std::vector<int>> data;
    int roots=0;

    WritePlan(const Graph& g, const Circuit& c, const Schedule& sc, const ReadPlan& read)
        : owned(g.nodes.size()), prefix(g.nodes.size()), writes(c.F), memory(read.memory),
          roots(read.roots) {
        auto chain = [&](int f) {
            std::vector<WriteBit> path;
            const int terminal=2*(c.I+1+f);
            int work=0;
            auto find = [&](auto&& self, int x, int depth) -> bool {
                if (x==terminal) return true;
                if (x/2<g.first || depth==32 || ++work>96) return false;
                const auto& n=g.nodes[x/2];
                if (n.s<0 || n.s/2<g.first) return false;
                const int a=n.a^(x&1), b=n.b^(x&1);
                if (self(self,a,depth+1)) {
                    path.push_back({n.s,b,x});
                    return true;
                }
                if (self(self,b,depth+1)) {
                    path.push_back({n.s^1,a,x});
                    return true;
                }
                return false;
            };
            find(find,g.next[f],0);
            return path;
        };
        std::vector<std::vector<WriteBit>> paths(c.F);
        for (int f=0;f<c.F;++f) if(sc.live[c.I+1+f]) paths[f]=chain(f);

        int count=0;
        for (int first=0;first<c.F;) {
            const auto& head=paths[first];
            const int stages=int(head.size());
            if (stages<4) { ++first; continue; }
            auto matches = [&](int k) {
                return paths[k].size()==head.size() &&
                    std::equal(head.begin(),head.end(),paths[k].begin(),
                        [](auto a,auto b){return a.control==b.control;});
            };
            int end=first+1;
            while (end<c.F && end<first+128 && matches(end)) ++end;
            const int width=end-first;
            if (width>=8) {
                WriteGroup group{first,width,{}};
                for (int j=0;j<stages;++j) {
                    std::vector<int> input(width);
                    for (int i=0;i<width;++i) {
                        const auto& item=paths[first+i][j];
                        const int y=item.result/2;
                        if (owned[y] || read.has(y)) { groups.clear(); return; }
                        owned[y]=1;
                        input[i]=item.data;
                    }
                    auto it=std::find(data.begin(),data.end(),input);
                    int set=int(it-data.begin());
                    if (it==data.end()) data.push_back(std::move(input));
                    group.stages.push_back({head[j].control,set,{}});
                }
                for (int f=first;f<end;++f) writes[f]=1;
                count+=width*stages;
                groups.push_back(std::move(group));
            }
            first=end;
        }
        if (count<8192) { groups.clear(); return; }

        auto request = [&](int lit) {
            const int y=lit/2;
            if (y>=g.first && memory[y]<0) memory[y]=roots++;
        };
        std::vector<int> todo;
        for (const auto& group:groups)
            for(const auto& s:group.stages) {
                request(s.control);
                todo.push_back(s.control/2);
            }
        for (const auto& item:data)
            for (int x:item) {
                request(x);
                todo.push_back(x/2);
            }
        while (!todo.empty()) {
            const int y=todo.back();
            todo.pop_back();
            if (y<g.first || read.has(y) || prefix[y]) continue;
            if (owned[y]) { groups.clear(); return; }
            prefix[y]=1;
            const auto n=g.nodes[y];
            todo.push_back(n.a/2);
            todo.push_back(n.b/2);
            if (n.s>=0) todo.push_back(n.s/2);
        }
        auto exportNode = [&](int lit) {
            if (owned[lit/2]) memory[lit/2]=-2;
        };
        for (int y:sc.order) if(!owned[y] && !read.has(y)) {
            const auto n=g.nodes[y];
            exportNode(n.a); exportNode(n.b);
            if (n.s>=0) exportNode(n.s);
        }
        for (int x:g.outputs) exportNode(x);
        for (int f=0;f<c.F;++f)
            if (!writes[f] && sc.live[c.I+1+f]) exportNode(g.next[f]);
        for (auto& group:groups) {
            for (unsigned j=0;j<group.stages.size();++j) {
                for(int i=0;i<group.width;++i) {
                    const int x=paths[group.first+i][j].result;
                    if (memory[x/2]==-2) {
                        memory[x/2]=roots++;
                        group.stages[j].exports.emplace_back(i,2*memory[x/2]+(x&1));
                    }
                }
            }
        }
    }
};

class WriteRunner {
    std::vector<WriteGroup> groups;
    std::vector<int> data;
    int inputCount, first, outputStart;
    const int length;

    Vec read(int address, const Vec* value, const Vec* ff) const {
        auto x=address/2;
        Vec v=x<inputCount || x>=first ? value[x] : ff[x-inputCount];
        if(address&1) v=_mm256_xor_si256(v,_mm256_set1_epi64x(-1));
        return v;
    }

public:
    WriteRunner(const WritePlan& write, const Graph& g, const Circuit& c, const Schedule& sc)
        : groups(write.groups), inputCount(c.I+1), first(g.first), outputStart(g.first+c.O),
          length([&] {int n=0;for (const auto& a:write.data) n+=int(a.size());return n;}()) {
        auto address = [&](int lit) {
            const int y=lit/2;
            if (y<first) return lit;
            return 2*(outputStart+write.memory[y])+((lit&1)^sc.phase[y]);
        };
        std::vector<int> dataOffsets;
        data.reserve(length);
        for (const auto& items:write.data) {
            dataOffsets.push_back(int(data.size()));
            for (int x:items) data.push_back(address(x));
        }
        for (auto& group:groups)
            for (auto& stage:group.stages) {
                stage.control=address(stage.control);
                stage.dataSet=dataOffsets[stage.dataSet];
            }
    }
    int capacity() const { return length; }

    void run(Vec* cache, Vec* value, const Vec* oldFf, Vec* newFf) const {
        for (int i=0;i<length;++i) cache[i]=read(data[i],value,oldFf);
        for (const auto& group:groups) {
            Vec* const dest=newFf+group.first;
            const Vec* current=oldFf+group.first;
            for (const auto& stage:group.stages) {
                const Vec mask=read(stage.control,value,oldFf);
                if (!_mm256_testz_si256(mask,mask)) {
                    const Vec* src=cache+stage.dataSet;
                    #pragma GCC unroll 8
                    for (int i=0;i<group.width;++i) {
                        const Vec x=current[i];
                        dest[i]=_mm256_xor_si256(x,_mm256_and_si256(mask,_mm256_xor_si256(x,src[i])));
                    }
                    current=dest;
                }
                for (auto [i,lit]:stage.exports) {
                    Vec v=current[i];
                    if (lit&1) v=_mm256_xor_si256(v,_mm256_set1_epi64x(-1));
                    value[outputStart+lit/2]=v;
                }
            }
            if(current!=dest) std::copy_n(current,group.width,dest);
        }
    }
};

class Compiler {
    enum { Load=0x6f, Store=0x7f, XOR=0xef, AND=0xdb, OR=0xeb, ANDNOT=0xdf };
    static constexpr int cached = 13;
    static constexpr int tmp0 = 13, tmp1 = 14, ones = 15;

    const Graph& graph;
    const Schedule& sc;
    Code code;
    std::vector<int> location, slots, freeSlots, freeShort, publish;
    std::vector<uint8_t> shortValue;
    static constexpr int shortLife=256;
    struct Target { int slot, base, phase, link; };
    std::vector<Target> targets;
    bool inPlace=false;
    std::vector<int> delayedFf;
    int inputCount, firstGate, readStart, readCount;
    static constexpr int bases[]={3,6,7};
    bool hot;

    void op(int opcode, int dest, int lhs, int rhs) {
        if (rhs >= 16+inputCount && rhs < 16+firstGate)
            code.op(opcode,dest,lhs,rhs-inputCount,0);
        else {
            const int offset=rhs-16-readStart-readCount;
            if(hot && offset>=0 && offset<24) {
                const int bank=offset/8;
                code.op(opcode,dest,lhs,rhs,bases[bank],32*(readStart+readCount+bank*8+4));
            } else code.op(opcode,dest,lhs,rhs);
        }
    }
    std::array<int,cached> owner;
    std::vector<int> upcoming;
    std::vector<std::array<int,3>> useLists;
    static constexpr int never = 0x7fffffff;
    int point = 0;
    int nextSlot, nextShort, startLong;
    const WritePlan* writers;
    const ReadPlan* reads;
    size_t secondKernel=0;

    void start() {
        code.start(hot);
        code.raw({0x4c,0x89,0xc0}); // Current FF bank.
        if(hot) for(int k=0;k<3;++k) code.bank(bases[k],32*(readStart+readCount+k*8+4));
    }

    void split() {
        for(int r=0;r<cached;++r) {
            const int y=owner[r];
            if(y<0)continue;
            if(slots[y]<0) op(Store,r,0,slot(y));
            owner[r]=-1;
            location[y]=-1;
        }
        code.finish(hot);
        secondKernel=code.offset();
        start();
        for (int y=graph.first; y<int(graph.nodes.size()); ++y)
            if (writers->owned[y] && slots[y]>=0) write(y,16+slots[y]);
    }

    int slot(int y) {
        if (slots[y] >= 0) return slots[y]+16;
        auto& available=shortValue[y] ? freeShort : freeSlots;
        auto& next=shortValue[y] ? nextShort : nextSlot;
        if (available.empty()) slots[y] = next++;
        else {
            slots[y] = available.back();
            available.pop_back();
        }
        return slots[y]+16;
    }

    int getSlot(int y) {
        int r = location[y];
        return r < 0 ? slot(y) : r;
    }

    void release(int lit, bool regs = true, bool memory = true) {
        int y = lit/2;
        if (sc.last[y] != point) return;
        if (regs && location[y] >= 0) {
            owner[location[y]] = -1;
            location[y] = -1;
        }
        if (memory && y >= graph.first && slots[y] >= readStart+readCount) {
            auto& available=slots[y]<startLong ? freeShort : freeSlots;
            available.push_back(slots[y]);
            slots[y] = -1;
        }
    }

    int allocate(int y, int a, int b, int s, bool preload = false) {
        int best = -1;
        for (int r=0; r<cached; ++r) {
            if (r == a || r == b || r == s) continue;
            if (owner[r] < 0) { best = r; break; }
            if (best < 0 || upcoming[owner[r]] > upcoming[owner[best]]) best=r;
        }
        const int old = owner[best];
        if (old >= 0 && (preload && upcoming[y] >= upcoming[old])) return -1;
        if (old >= 0) {
            if (slots[old] < 0) op(Store,best,0,slot(old));
            location[old] = -1;
        }
        location[y] = best;
        owner[best] = y;
        return best;
    }

    void load(int reg, int arg) {
        if (arg == reg) return;
        op(Load,reg,0,arg);
    }

    void binary(int opcode, int dest, int a, int b) {
        if (a >= 16 && opcode != ANDNOT && b < 16) std::swap(a,b);
        if (a >= 16) {
            load(tmp0,a);
            a = tmp0;
        }
        op(opcode,dest,a,b);
    }

    void write(int y, int arg) {
        for (int p=publish[y]; p>=0; p=targets[p].link) {
            const auto& target = targets[p];
            int r = arg;
            if (target.phase != sc.phase[y]) {
                op(XOR,tmp0,ones,r);
                r = tmp0;
            }
            if (r >= 16) {
                load(tmp0,r);
                r = tmp0;
            }
            code.op(Store,r,0,16+target.slot,target.base);
        }
    }

public:
    Compiler(const Graph& g, const Schedule& s, const Circuit& c, const ReadPlan* read=nullptr, const WritePlan* writePlan=nullptr)
        : graph(g), sc(s), code(16*s.order.size()+4096), location(g.nodes.size(),-1),
          slots(g.nodes.size(),-1), publish(g.nodes.size(),-1),
          shortValue(g.nodes.size()), inputCount(c.I+1),
          firstGate(g.first), readStart(g.first+c.O), readCount(writePlan ? writePlan->roots : read ? read->roots : 0),
          hot(s.order.size()>300000 && !read && !g.isArithmetic()), upcoming(g.nodes.size(),never), useLists(s.order.size()),
          nextSlot(readStart+readCount+(hot ? shortLife+1 : 0)), nextShort(readStart+readCount),
          startLong(nextSlot), writers(writePlan), reads(read) {
        owner.fill(-1);
        for (int p = int(s.order.size())-1; p >= 0; --p) {
            const int y=s.order[p];
            shortValue[y]=hot && s.last[y]-p<=shortLife;
            const Node& n = g.nodes[y];
            const int operands[] = {n.a/2,n.b/2,n.s>=0?n.s/2:0};
            for (int j=2; j>=0; --j) {
                const int y=operands[j];
                useLists[p][j]=upcoming[y];
                if (y) upcoming[y]=p;
            }
        }
        for (int y=0; y<g.first; ++y) slots[y] = y;
        if (read) {
            const auto& external=writers?writers->memory:read->memory;
            for (int y=g.first; y<int(g.nodes.size()); ++y)
                if (external[y]>=0) slots[y]=readStart+external[y];
        }
        auto target = [&](int x, int slot, int base) {
            targets.push_back({slot,base,x&1,publish[x/2]});
            publish[x/2] = int(targets.size())-1;
        };
        for (int j=0; j<c.O; ++j) target(g.outputs[j],g.first+j,1);
        inPlace=!reads && sc.order.size()>300000;
        std::vector<int> definition;
        if(inPlace) {
            definition.assign(g.nodes.size(),-1);
            for (int i=0;i<int(s.order.size());++i) definition[s.order[i]]=i;
        }
        for (int f=0; f<c.F; ++f) {
            const int y=c.I+1+f;
            if (!s.live[y] || (writers && writers->writes[f])) continue;
            const int source=g.next[f];
            if (!inPlace) {
                target(source,f,2);
            } else if (source!=2*y) {
                if (source/2>=g.first && definition[source/2]>=s.last[y]) {
                    target(source,f,0);
                } else {
                    target(source,int(delayedFf.size()),2);
                    delayedFf.push_back(f);
                }
            }
        }
    }

    void* compile() {
        start();
        for (int y=0; y<graph.first; ++y) write(y,16+y);
        if (reads) for (int y=graph.first; y<int(graph.nodes.size()); ++y)
            if (reads->memory[y]>=0) write(y,16+slots[y]);
        for (int y : sc.order) {
            if (writers && !secondKernel && !writers->prefix[y]) split();
            const Node& n = graph.nodes[y];
            int a = getSlot(n.a/2);
            int b = getSlot(n.b/2);
            int s = n.s >= 0 ? getSlot(n.s/2) : -1;
            const bool invA = (n.a&1) ^ sc.phase[n.a/2];
            const bool invB = (n.b&1) ^ sc.phase[n.b/2];
            upcoming[n.a/2]=useLists[point][0];
            upcoming[n.b/2]=useLists[point][1];
            if (n.s >= 0) upcoming[n.s/2]=useLists[point][2];
            auto reload = [&](int y, int old, int r1, int r2) {
                if (old < 16 || upcoming[y] > point+8) return old;
                const int r = allocate(y,r1,r2,-1,true);
                if (r < 0) return old;
                load(r,old);
                return r;
            };
            a=reload(n.a/2,a,b,s);
            b=reload(n.b/2,b,a,s);
            if (n.s>=0) s=reload(n.s/2,s,a,b);
            release(n.a,true,false);
            release(n.b,true,false);
            if (n.s >= 0) release(n.s,true,false);
            const int dst = allocate(y, -1,-1,-1);
            // Allocation may reuse a dead operand register, but never
            // overwrites the register contents before the operation.
            if (n.s == -1) {
                if (invA && invB) binary(OR,dst,a,b);
                else if (invA) binary(ANDNOT,dst,a,b);
                else if (invB) binary(ANDNOT,dst,b,a);
                else binary(AND,dst,a,b);
            } else if (n.s == -2) {
                binary(XOR,dst,a,b);
            } else {
                const bool invS = (n.s&1) ^ sc.phase[n.s/2];
                if (invS) std::swap(a,b);
                if (invA != invB) {
                    binary(AND,tmp1,b,s);
                    binary(OR,dst,a,s);
                    op(ANDNOT,dst,tmp1,dst);
                } else {
                    binary(XOR,tmp1,a,b);
                    op(AND,tmp1,tmp1,s);
                    op(XOR,dst,tmp1,a);
                }
            }
            write(y,dst);
            if (slots[y]>=readStart && slots[y]<readStart+readCount)
                op(Store,dst,0,slots[y]+16);
            if (sc.last[y] < 0) {
                location[y] = -1;
                owner[dst] = -1;
            }
            release(n.a,false,true);
            release(n.b,false,true);
            if (n.s >= 0) release(n.s,false,true);
            ++point;
        }
        if (writers && !secondKernel) split();
        for(int i=0;i<int(delayedFf.size());++i) {
            code.op(Load,tmp0,0,16+i,2);
            code.op(Store,tmp0,0,16+delayedFf[i],0);
        }
        code.finish(hot);
        return code.executable();
    }
    int delayedCount() const { return inPlace ? int(delayedFf.size()) : -1; }
    int capacity() const { return nextSlot; }
    size_t continuation() const { return secondKernel; }
};

template<int Shift>
void butterfly(Vec* data, Word mask) {
    const Vec m = _mm256_set1_epi64x(mask);
    for (int group = 0; group<64; group+=2*Shift) {
        for (int i=group; i<group+Shift; ++i) {
            const Vec a = data[i], b = data[i+Shift];
            const Vec t = _mm256_and_si256(_mm256_xor_si256(_mm256_srli_epi64(a,Shift),b),m);
            data[i] = _mm256_xor_si256(a,_mm256_slli_epi64(t,Shift));
            data[i+Shift] = _mm256_xor_si256(b,t);
        }
    }
}
void transpose(Vec* data) {
    butterfly<32>(data,0x00000000ffffffffULL);
    butterfly<16>(data,0x0000ffff0000ffffULL);
    butterfly<8>(data,0x00ff00ff00ff00ffULL);
    butterfly<4>(data,0x0f0f0f0f0f0f0f0fULL);
    butterfly<2>(data,0x3333333333333333ULL);
    butterfly<1>(data,0x5555555555555555ULL);
}

struct VectorBuffer {
    Vec* const data;
    explicit VectorBuffer(size_t count) : data(count ? new Vec[count]{} : nullptr) {}
    VectorBuffer(const VectorBuffer&) = delete;
    VectorBuffer& operator=(const VectorBuffer&) = delete;
    ~VectorBuffer() { delete[] data; }
};

struct ReleaseCode {
    void operator()(void* p) const { VirtualFree(p,0,MEM_RELEASE); }
};
using Executable = std::unique_ptr<void,ReleaseCode>;

std::vector<uint64_t> slow(const Circuit& c, const Graph& g, const Schedule& sc) {
    std::vector<uint64_t> result(c.M);
    #pragma omp parallel for num_threads(16) if(c.M >= 128 && c.G > 1000)
    for (int start=0; start<c.M; start+=64) {
        std::vector<Word> value(g.nodes.size()), next(c.F);
        Word states[64], pi[64], h[64]{};
        const int count = std::min(64,c.M-start);
        for (int i=0;i<count;++i) states[i]=mix((c.seed^(start+i))+step);
        auto read = [&](int x) { return value[x/2] ^ (Word(0)-(x&1)); };
        for (int t=0;t<c.T;++t) {
            for (int i=0;i<count;++i) pi[i]=mix(states[i]+=step);
            for (int j=0;j<std::min(c.I,64);++j) {
                Word x=0;
                for (int i=0;i<count;++i) x|=((pi[i]>>j)&1)<<i;
                value[1+j]=x;
            }
            for (int y : sc.order) {
                const Node& n=g.nodes[y];
                Word a=read(n.a), b=read(n.b);
                value[y]=n.s==-1 ? a&b : n.s==-2 ? a^b : a^((a^b)&read(n.s));
            }
            for (int j=0;j<c.O;++j) {
                Word x=read(g.outputs[j]);
                Word weight=mix(Word(t)*c.O+j+step);
                while (x) {
                    int i=__builtin_ctzll(x);
                    h[i]^=weight;
                    x&=x-1;
                }
            }
            for (int f=0; f<c.F; ++f)
                if (sc.live[c.I+1+f]) next[f]=read(g.next[f]);
            std::copy(next.begin(),next.end(),value.begin()+c.I+1);
        }
        std::copy_n(h,count,result.begin()+start);
    }
    return result;
}

using Kernel = void (*)(Vec*, Vec*, const Vec*);

std::vector<uint64_t> run(const Circuit& c, const Graph& g, Kernel kernel, int capacity, const ReadRunner* reads = nullptr,
                          const WriteRunner* writes = nullptr, Kernel suffix = nullptr, int delayed = -1) {
    std::vector<uint64_t> result(c.M);
    using Table = std::array<std::array<Word,256>,8>;
    std::vector<Table> table(c.T);
    for (int t=0;t<c.T;++t) {
        for (int byte=0;byte<8;++byte) {
            for (int bit=0;bit<8;++bit) {
                const int j=byte*8+bit;
                const Word weight=j<c.O ? mix(Word(t)*c.O+j+step) : 0;
                const int bound = 1<<bit;
                for (int x=0;x<bound;++x) table[t][byte][x+bound]=table[t][byte][x]^weight;
            }
        }
    }
    const int batches=(c.M+255)/256;
    #pragma omp parallel for num_threads(std::min(8,batches)) schedule(static)
    for (int batch=0;batch<batches;++batch) {
        VectorBuffer storage(capacity), ff0(c.F), ff1(delayed<0 ? c.F : delayed);
        VectorBuffer packedStorage(reads ? reads->capacity() : 0);
        VectorBuffer writeCache(writes ? writes->capacity() : 0);
        Vec* const value = storage.data;
        Vec* oldFf=ff0.data;
        Vec* newFf=ff1.data;
        alignas(32) Vec block[64];
        Word seed[256], digest[256]{};
        const int start=batch*256;
        for (int i=0;i<256;++i) seed[i]=mix((c.seed^(start+i))+step);
        for (int t=0;t<c.T;++t) {
            for (int i=0;i<64;++i)
                block[i]=_mm256_set_epi64x(mix(seed[192+i]+=step),mix(seed[128+i]+=step),
                                           mix(seed[64+i]+=step),mix(seed[i]+=step));
            transpose(block);
            for (int j=0;j<c.I;++j) value[1+j]=block[j];
            if (reads) reads->run(packedStorage.data,value,oldFf,value+g.first+c.O,c.I+1);
            kernel(value,newFf,oldFf);
            if (writes) {
                writes->run(writeCache.data,value,oldFf,newFf);
                suffix(value,newFf,oldFf);
            }
            if(delayed<0) std::swap(oldFf,newFf);
            for (int j=0;j<64;++j) block[j]=j<c.O ? value[g.first+j] : _mm256_setzero_si256();
            transpose(block);
            const auto& weights=table[t];
            for (int i=0;i<64;++i) {
                Word word[4];
                _mm256_storeu_si256(reinterpret_cast<Vec*>(word),block[i]);
                for (int lane=0;lane<4;++lane) {
                    const Word x=word[lane];
                    digest[64*lane+i]^=weights[0][x&255]^weights[1][(x>>8)&255]^
                        weights[2][(x>>16)&255]^weights[3][(x>>24)&255]^
                        weights[4][(x>>32)&255]^weights[5][(x>>40)&255]^
                        weights[6][(x>>48)&255]^weights[7][x>>56];
                }
            }
        }
        std::copy_n(digest,std::min(256,c.M-start),result.begin()+start);
    }
    return result;
}
} // namespace

std::vector<uint64_t> simulate(const Circuit& c) {
    if (!c.M || !c.T || !c.O) return std::vector<uint64_t>(c.M);
    const auto order = topo(c);
    const auto graph = build(c,order);
    auto sc = schedule(graph,c);
    if (c.G < 1024 || c.I > 64 || c.O > 64) return slow(c,graph,sc);
    const ReadPlan read(graph,c,sc);
    if (!read.order.empty()) {
        PackedCompiler packer(read);
        const Executable packedCode(packer.compile());
        if (packedCode) {
            const WritePlan write(graph,c,sc,read);
            const bool specialized=!write.groups.empty();
            auto reduced=sc;
            prepare(reduced,graph,false,&read.packed,specialized?&write.owned:nullptr,
                    specialized?&write.prefix:nullptr);
            Compiler compiler(graph,reduced,c,&read,specialized?&write:nullptr);
            const Executable p(compiler.compile());
            if (p) {
                const int groups=std::count_if(read.inputGroup.begin(),read.inputGroup.end(),
                                               [](int i){return i>=0;});
                const ReadRunner runner{read,reinterpret_cast<ReadKernel>(packedCode.get()),packer.capacity(),groups};
                const auto kernel=reinterpret_cast<Kernel>(p.get());
                if (specialized) {
                    const WriteRunner writes(write,graph,c,reduced);
                    const auto suffix=reinterpret_cast<Kernel>(static_cast<const uint8_t*>(p.get())+
                                                               compiler.continuation());
                    return run(c,graph,kernel,compiler.capacity(),&runner,&writes,suffix);
                }
                return run(c,graph,kernel,compiler.capacity(),&runner);
            }
        }
    }
    prepare(sc,graph,true);
    Compiler compiler(graph,sc,c);
    const Executable p(compiler.compile());
    if (!p) return slow(c,graph,sc);
    return run(c,graph,reinterpret_cast<Kernel>(p.get()),compiler.capacity(),nullptr,nullptr,nullptr,
               compiler.delayedCount());
}







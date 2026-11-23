// Digital circuit simulator accelerator.
// Bitslice M stimuli into 256-bit AVX2 vectors; locality-aware topological order with
// lifetime-based slot allocation; JIT-compiled per-cycle evaluation program; OpenMP.
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <vector>
#include <algorithm>
#include <immintrin.h>
#include <omp.h>
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

inline uint64_t mix64(uint64_t x) {
    x += 0x9E3779B97F4A7C15ULL;
    uint64_t z = x;
    z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9ULL;
    z = (z ^ (z >> 27)) * 0x94D049BB133111EBULL;
    return z ^ (z >> 31);
}
inline uint64_t sm_next(uint64_t& s) {
    s += 0x9E3779B97F4A7C15ULL;
    uint64_t z = s;
    z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9ULL;
    z = (z ^ (z >> 27)) * 0x94D049BB133111EBULL;
    return z ^ (z >> 31);
}
inline uint64_t transpose8bytes(uint64_t x) {
    uint64_t t;
    t = (x ^ (x >> 7)) & 0x00AA00AA00AA00AAULL; x = x ^ t ^ (t << 7);
    t = (x ^ (x >> 14)) & 0x0000CCCC0000CCCCULL; x = x ^ t ^ (t << 14);
    t = (x ^ (x >> 28)) & 0x00000000F0F0F0F0ULL; x = x ^ t ^ (t << 28);
    return x;
}

struct Plan {
    int I = 0, F = 0, G = 0, O = 0, M = 0, T = 0;
    uint64_t seed = 0;
    int nslot = 0;
    int piBase = 0, ffBase = 0, const0Slot = 0, const1Slot = 0;
    int ngate = 0;
    std::vector<uint8_t> ty;
    std::vector<uint32_t> is0, is1, is2, os;
    std::vector<uint32_t> outSlot;
    std::vector<uint32_t> dSlot;
    std::vector<uint16_t> piIdx;
    bool dFromFF = false;
};

struct Scratch {
    char* sig = nullptr;
    size_t cap = 0;
    uint64_t* H = nullptr;
    uint64_t* st = nullptr;
    char* tmp = nullptr;
};
static Scratch g_scratch[256];
static size_t g_cap = 0;

void ensureScratch(int nthreads, size_t needMain) {
    if (g_cap >= needMain && g_scratch[0].sig) return;
    for (int i = 0; i < 256; i++) {
        if (g_scratch[i].sig) _aligned_free(g_scratch[i].sig);
        if (g_scratch[i].H) free(g_scratch[i].H);
        if (g_scratch[i].st) free(g_scratch[i].st);
        if (g_scratch[i].tmp) _aligned_free(g_scratch[i].tmp);
        memset(&g_scratch[i], 0, sizeof(Scratch));
    }
    size_t cap = needMain < ((size_t)24 << 20) ? ((size_t)24 << 20) : needMain;
    for (int i = 0; i < nthreads; i++) {
        g_scratch[i].sig = (char*)_aligned_malloc(cap, 32);
        memset(g_scratch[i].sig, 0, cap);
        g_scratch[i].tmp = (char*)_aligned_malloc((size_t)1 << 20, 32);
        g_scratch[i].H = (uint64_t*)malloc(sizeof(uint64_t) * 256);
        g_scratch[i].st = (uint64_t*)malloc(sizeof(uint64_t) * 256);
        g_scratch[i].cap = cap;
    }
    g_cap = cap;
}

void buildPlan(const Circuit& c, Plan& pl) {
    const int I = c.I, F = c.F, G = c.G, O = c.O;
    const int GBASE = I + F + 2;
    pl.I = I; pl.F = F; pl.G = G; pl.O = O; pl.M = c.M; pl.T = c.T; pl.seed = c.seed;

    auto isGate = [&](int s) { return s >= GBASE; };
    auto gid = [&](int s) { return s - GBASE; };

    // ---- CSR successor lists over gates ----
    std::vector<int> succStart(G + 1, 0);
    for (int k = 0; k < G; k++) {
        if (isGate(c.in0[k])) succStart[gid(c.in0[k]) + 1]++;
        if (c.in1[k] >= 0 && isGate(c.in1[k])) succStart[gid(c.in1[k]) + 1]++;
        if (c.in2[k] >= 0 && isGate(c.in2[k])) succStart[gid(c.in2[k]) + 1]++;
    }
    for (int k = 0; k < G; k++) succStart[k + 1] += succStart[k];
    std::vector<int> succ(succStart[G]);
    {
        std::vector<int> fill(succStart.begin(), succStart.begin() + G);
        for (int k = 0; k < G; k++) {
            if (isGate(c.in0[k])) succ[fill[gid(c.in0[k])]++] = k;
            if (c.in1[k] >= 0 && isGate(c.in1[k])) succ[fill[gid(c.in1[k])]++] = k;
            if (c.in2[k] >= 0 && isGate(c.in2[k])) succ[fill[gid(c.in2[k])]++] = k;
        }
    }
    // ---- Kahn: levels ----
    std::vector<int> indeg(G, 0);
    for (int k = 0; k < G; k++) {
        int n = 0;
        if (isGate(c.in0[k])) n++;
        if (c.in1[k] >= 0 && isGate(c.in1[k])) n++;
        if (c.in2[k] >= 0 && isGate(c.in2[k])) n++;
        indeg[k] = n;
    }
    std::vector<int> level(G, 0);
    std::vector<int> q; q.reserve(G);
    for (int k = 0; k < G; k++) if (indeg[k] == 0) q.push_back(k);
    size_t qi = 0;
    int maxlevel = 0;
    while (qi < q.size()) {
        int k = q[qi++];
        int lv = level[k];
        if (lv > maxlevel) maxlevel = lv;
        for (int e = succStart[k]; e < succStart[k + 1]; e++) {
            int s = succ[e];
            if (level[s] < lv + 1) level[s] = lv + 1;
            if (--indeg[s] == 0) q.push_back(s);
        }
    }
    // ---- live cone ----
    std::vector<char> live(G, 0);
    {
        std::vector<int> stk;
        stk.reserve(G);
        for (int f = 0; f < F; f++) if (isGate(c.d[f])) { int k = gid(c.d[f]); if (!live[k]) { live[k] = 1; stk.push_back(k); } }
        for (int j = 0; j < O; j++) if (isGate(c.out[j])) { int k = gid(c.out[j]); if (!live[k]) { live[k] = 1; stk.push_back(k); } }
        while (!stk.empty()) {
            int k = stk.back(); stk.pop_back();
            int ins[3] = {c.in0[k], c.in1[k], c.in2[k]};
            for (int t = 0; t < 3; t++) if (ins[t] >= 0 && isGate(ins[t])) {
                int p = gid(ins[t]);
                if (!live[p]) { live[p] = 1; stk.push_back(p); }
            }
        }
    }
    // ---- fanout over live consumers ----
    std::vector<int> fanout(G, 0);
    std::vector<int> soleConsumer(G, -1);
    for (int k = 0; k < G; k++) if (live[k]) {
        for (int e = succStart[k]; e < succStart[k + 1]; e++) {
            int s = succ[e];
            if (!live[s]) continue;
            fanout[k]++;
            soleConsumer[k] = s;
        }
    }
    // ---- gates by level ----
    std::vector<int> byLevel(maxlevel + 2, 0);
    int nlive = 0;
    for (int k = 0; k < G; k++) if (live[k]) { byLevel[level[k] + 1]++; nlive++; }
    for (int i = 0; i <= maxlevel; i++) byLevel[i + 1] += byLevel[i];
    std::vector<int> lvlOrder(nlive);
    {
        std::vector<int> pos(byLevel.begin(), byLevel.begin() + maxlevel + 1);
        for (int k = 0; k < G; k++) if (live[k]) lvlOrder[pos[level[k]]++] = k;
    }
    // ---- block ids: single-consumer gates sink into their consumer's block ----
    std::vector<int> blk(G, -1);
    for (int idx = (int)lvlOrder.size() - 1; idx >= 0; idx--) {
        int k = lvlOrder[idx];
        if (fanout[k] == 1) blk[k] = blk[soleConsumer[k]];
        else blk[k] = level[k];
    }
    int nblk = 1;
    for (int k = 0; k < G; k++) if (live[k] && blk[k] + 1 > nblk) nblk = blk[k] + 1;
    std::vector<int> blkCnt(nblk + 1, 0);
    for (int k = 0; k < G; k++) if (live[k]) blkCnt[blk[k] + 1]++;
    for (int i = 0; i < nblk; i++) blkCnt[i + 1] += blkCnt[i];
    std::vector<int> blkGates(blkCnt[nblk]);
    {
        std::vector<int> pos(blkCnt.begin(), blkCnt.begin() + nblk);
        for (int k = 0; k < G; k++) if (live[k]) blkGates[pos[blk[k]]++] = k;
    }
    // ---- intra-block predecessor CSR ----
    std::vector<int> predCnt(G + 1, 0);
    for (int k = 0; k < G; k++) if (live[k])
        for (int e = succStart[k]; e < succStart[k + 1]; e++) {
            int s = succ[e];
            if (live[s] && blk[s] == blk[k]) predCnt[s + 1]++;
        }
    for (int k = 0; k < G; k++) predCnt[k + 1] += predCnt[k];
    std::vector<int> pred(predCnt[G]);
    {
        std::vector<int> fill(predCnt.begin(), predCnt.begin() + G);
        for (int k = 0; k < G; k++) if (live[k])
            for (int e = succStart[k]; e < succStart[k + 1]; e++) {
                int s = succ[e];
                if (live[s] && blk[s] == blk[k]) pred[fill[s]++] = k;
            }
    }
    // ---- DFS post-order within each block ----
    std::vector<int> order;
    order.reserve(G);
    std::vector<char> emitted(G, 0);
    std::vector<int> stk, stkIdx;
    for (int b = 0; b < nblk; b++) {
        int lo = blkCnt[b], hi = blkCnt[b + 1];
        if (lo == hi) continue;
        for (int idx = lo; idx < hi; idx++) {
            int k = blkGates[idx];
            if (emitted[k]) continue;
            bool hasInner = false;
            for (int e = succStart[k]; e < succStart[k + 1]; e++)
                if (live[succ[e]] && blk[succ[e]] == b) { hasInner = true; break; }
            if (hasInner) continue;
            stk.clear(); stkIdx.clear();
            stk.push_back(k); stkIdx.push_back(predCnt[k]);
            emitted[k] = 1;
            while (!stk.empty()) {
                int g = stk.back();
                int pi = stkIdx.back();
                bool descended = false;
                while (pi < predCnt[g + 1]) {
                    int p = pred[pi++];
                    if (!emitted[p]) {
                        stkIdx.back() = pi;
                        emitted[p] = 1;
                        stk.push_back(p); stkIdx.push_back(predCnt[p]);
                        descended = true;
                        break;
                    }
                }
                if (!descended) { order.push_back(g); stk.pop_back(); stkIdx.pop_back(); }
            }
        }
    }
    int ng = (int)order.size();
    pl.ngate = ng;
    // ---- lifetime-based slot allocation ----
    std::vector<int> posOf(G, -1);
    for (int i = 0; i < ng; i++) posOf[order[i]] = i;
    std::vector<char> epi(G, 0);
    for (int f = 0; f < F; f++) if (isGate(c.d[f])) epi[gid(c.d[f])] = 1;
    for (int j = 0; j < O; j++) if (isGate(c.out[j])) epi[gid(c.out[j])] = 1;
    std::vector<int> bucketHead(ng + 2, -1);
    std::vector<int> bucketNext(G, -1);
    for (int i = 0; i < ng; i++) {
        int k = order[i];
        int lu = -1;
        for (int e = succStart[k]; e < succStart[k + 1]; e++) {
            int s = succ[e];
            if (!live[s]) continue;
            int ps = posOf[s];
            if (ps > lu) lu = ps;
        }
        if (lu < 0) lu = i;
        if (epi[k]) lu = ng;
        bucketNext[k] = bucketHead[lu];
        bucketHead[lu] = k;
    }
    int nslots = 0;
    std::vector<int> slotOf(G, -1);
    std::vector<int> freeList;
    freeList.reserve(4096);
    for (int i = 0; i < ng; i++) {
        int k = order[i];
        int s;
        if (!freeList.empty()) { s = freeList.back(); freeList.pop_back(); }
        else s = nslots++;
        slotOf[k] = s;
        for (int g2 = bucketHead[i]; g2 != -1; g2 = bucketNext[g2]) freeList.push_back(slotOf[g2]);
    }
    pl.piBase = nslots;
    pl.ffBase = nslots + I;
    pl.const0Slot = nslots + I + F;
    pl.const1Slot = nslots + I + F + 1;
    pl.nslot = nslots + I + F + 2;

    // ---- plan arrays ----
    pl.ty.resize(ng);
    pl.is0.resize(ng); pl.is1.resize(ng); pl.is2.resize(ng); pl.os.resize(ng);
    auto slotOfSig = [&](int s) -> uint32_t {
        if (s < 2) return (uint32_t)(s == 0 ? pl.const0Slot : pl.const1Slot);
        if (s < 2 + I) return (uint32_t)(pl.piBase + s - 2);
        if (s < 2 + I + F) return (uint32_t)(pl.ffBase + s - 2 - I);
        return (uint32_t)slotOf[s - GBASE];
    };
    for (int i = 0; i < ng; i++) {
        int k = order[i];
        pl.ty[i] = c.type[k];
        pl.is0[i] = slotOfSig(c.in0[k]);
        pl.is1[i] = c.in1[k] >= 0 ? slotOfSig(c.in1[k]) : 0;
        pl.is2[i] = c.in2[k] >= 0 ? slotOfSig(c.in2[k]) : 0;
        pl.os[i] = (uint32_t)slotOf[k];
    }
    pl.outSlot.resize(O);
    for (int j = 0; j < O; j++) pl.outSlot[j] = slotOfSig(c.out[j]);
    pl.dSlot.resize(F);
    pl.dFromFF = false;
    for (int f = 0; f < F; f++) {
        pl.dSlot[f] = slotOfSig(c.d[f]);
        if (c.d[f] >= 2 + I && c.d[f] < 2 + I + F) pl.dFromFF = true;
    }
    {
        std::vector<char> used(I + 1, 0);
        for (int i = 0; i < ng; i++) {
            int k = order[i];
            if (c.in0[k] >= 2 && c.in0[k] < 2 + I) used[c.in0[k] - 2] = 1;
            if (c.in1[k] >= 2 && c.in1[k] < 2 + I) used[c.in1[k] - 2] = 1;
            if (c.in2[k] >= 2 && c.in2[k] < 2 + I) used[c.in2[k] - 2] = 1;
        }
        for (int j = 0; j < O; j++) if (c.out[j] >= 2 && c.out[j] < 2 + I) used[c.out[j] - 2] = 1;
        for (int f = 0; f < F; f++) if (c.d[f] >= 2 && c.d[f] < 2 + I) used[c.d[f] - 2] = 1;
        pl.piIdx.clear();
        for (int i = 0; i < I; i++) if (used[i]) pl.piIdx.push_back((uint16_t)i);
    }
}

// ---------------- JIT ----------------
// Generated program: void fn(void* base) with base in RCX. Uses RCX as the signal-array
// base, YMM0..YMM14 as value registers, YMM15 as the all-ones constant.

struct Emitter {
    std::vector<uint8_t> b;
    size_t limit;
    bool overflow = false;
    void u8(uint8_t x) { if (b.size() >= limit) { overflow = true; return; } b.push_back(x); }
    void u32(uint32_t x) { u8((uint8_t)x); u8((uint8_t)(x >> 8)); u8((uint8_t)(x >> 16)); u8((uint8_t)(x >> 24)); }
    // op with a register source (vvvv) and either a register destination (rm<0) or memory
    void vexOp(uint8_t op, int dst, int vvvv, int rm, int reg2, int64_t disp) {
        int R = ((dst >> 3) & 1) ^ 1;
        int vv = vvvv < 0 ? 15 : (vvvv & 15);
        vv = (~vv) & 15;
        if (rm < 0) {
            int B = (((reg2 >> 3) & 1) ^ 1);
            if (B == 1) {
                u8(0xC5);
                u8((uint8_t)((R << 7) | (vv << 3) | 0x04 | 0x01));
            } else {
                u8(0xC4);
                u8((uint8_t)((R << 7) | (1 << 6) | 0x00 | 0x01));
                u8((uint8_t)((vv << 3) | 0x04 | 0x01));
            }
            u8(op);
            u8((uint8_t)(0xC0 | ((dst & 7) << 3) | (reg2 & 7)));
        } else {
            int B = (((rm >> 3) & 1) ^ 1);
            u8(0xC4);
            u8((uint8_t)((R << 7) | (1 << 6) | (B << 5) | 0x01));
            u8((uint8_t)((vv << 3) | 0x04 | 0x01));
            u8(op);
            int mod;
            if (disp == 0 && (rm & 7) != 5) mod = 0;
            else if (disp >= -128 && disp <= 127) mod = 1;
            else mod = 2;
            u8((uint8_t)((mod << 6) | ((dst & 7) << 3) | (rm & 7)));
            if (mod == 1) u8((uint8_t)(int8_t)disp);
            else if (mod == 2) u32((uint32_t)disp);
        }
    }
    void vmovLoad(int dst, int64_t disp) { vexOp(0x6F, dst, -1, 1, 0, disp); }       // [RCX+disp]
    void vmovStore(int src, int64_t disp) { vexOp(0x7F, src, -1, 1, 0, disp); }
    void vop3(uint8_t op, int d, int a, int b, int64_t dispB) {
        if (dispB < 0) vexOp(op, d, a, -1, b, 0);
        else vexOp(op, d, a, 1, 0, dispB);
    }
};

const uint8_t OP_AND = 0xDB, OP_OR = 0xEB, OP_XOR = 0xEF;

struct Jit {
    void* mem = nullptr;
    void (*fn)(void*) = nullptr;
    ~Jit() { if (mem) VirtualFree(mem, 0, MEM_RELEASE); }
};

bool generate(const Plan& pl, size_t codeLimit, std::vector<uint8_t>& code) {
    const int ng = pl.ngate;
    const int nslot = pl.nslot;
    const uint8_t* ty = pl.ty.data();
    const uint32_t* is0 = pl.is0.data();
    const uint32_t* is1 = pl.is1.data();
    const uint32_t* is2 = pl.is2.data();
    const uint32_t* os = pl.os.data();

    // reader lists per slot (to know the next use)
    std::vector<int> rStart(nslot + 1, 0);
    for (int i = 0; i < ng; i++) {
        rStart[is0[i] + 1]++;
        if (ty[i] != 6) rStart[is1[i] + 1]++;
        if (ty[i] == 7) rStart[is2[i] + 1]++;
    }
    for (int f = 0; f < pl.F; f++) rStart[pl.dSlot[f] + 1]++;
    for (int j = 0; j < pl.O; j++) rStart[pl.outSlot[j] + 1]++;
    for (int s = 0; s < nslot; s++) rStart[s + 1] += rStart[s];
    int totalReaders = rStart[nslot];
    std::vector<int> rPos(totalReaders);
    std::vector<int> rCur(nslot, 0);
    {
        std::vector<int> fill(rStart.begin(), rStart.begin() + nslot);
        for (int i = 0; i < ng; i++) {
            rPos[fill[is0[i]]++] = i;
            if (ty[i] != 6) rPos[fill[is1[i]]++] = i;
            if (ty[i] == 7) rPos[fill[is2[i]]++] = i;
        }
        for (int f = 0; f < pl.F; f++) rPos[fill[pl.dSlot[f]]++] = ng;
        for (int j = 0; j < pl.O; j++) rPos[fill[pl.outSlot[j]]++] = ng;
    }
    auto nextReadOf = [&](int s) -> int {
        int c = rCur[s];
        int st = rStart[s];
        return c < rStart[s + 1] - st ? rPos[st + c] : 0x7fffffff;
    };
    std::vector<int> useCnt(nslot);
    for (int s = 0; s < nslot; s++) useCnt[s] = rStart[s + 1] - rStart[s];

    Emitter em;
    em.limit = codeLimit;
    // register state
    int regSlot[16];
    int nfree = 16;
    int freeRegs[16];
    for (int r = 0; r < 16; r++) { regSlot[r] = -1; freeRegs[r] = 15 - r; }
    std::vector<int> regOf(nslot, -1);
    std::vector<char> dirty(nslot, 0);
    std::vector<int> nextRead(nslot);
    for (int s = 0; s < nslot; s++) nextRead[s] = nextReadOf(s);
    char prot[16];
    const int FUSE_WINDOW = 6;

    auto storeReg = [&](int r) {
        int s = regSlot[r];
        if (dirty[s]) {
            em.vmovStore(r, (int64_t)s * 32);
            dirty[s] = 0;
        }
        regOf[s] = -1;
        regSlot[r] = -1;
    };
    auto allocReg = [&]() -> int {
        if (nfree > 0) return freeRegs[--nfree];
        int best = -1, bestVal = -1;
        for (int r = 0; r < 16; r++) {
            if (prot[r]) continue;
            int s = regSlot[r];
            if (s < 0) return r;
            if (nextRead[s] > bestVal) { bestVal = nextRead[s]; best = r; }
        }
        storeReg(best);
        return best;
    };
    auto useSlot = [&](int s) -> int {
        rCur[s]++;
        nextRead[s] = nextReadOf(s);
        int r = regOf[s];
        if (r >= 0) return r;
        r = allocReg();
        em.vmovLoad(r, (int64_t)s * 32);
        regOf[s] = r;
        regSlot[r] = s;
        dirty[s] = 0;
        return r;
    };
    auto releaseSlot = [&](int s) {
        useCnt[s]--;
        if (useCnt[s] <= 0 && regOf[s] >= 0) {
            int r = regOf[s];
            regOf[s] = -1;
            regSlot[r] = -1;
            freeRegs[nfree++] = r;
        }
    };

    for (int i = 0; i < ng && !em.overflow; i++) {
        int t = ty[i];
        memset(prot, 0, sizeof prot);
        int r0 = useSlot(is0[i]);
        prot[r0] = 1;
        int r1 = -1, r2 = -1;
        if (t != 6) { r1 = useSlot(is1[i]); prot[r1] = 1; }
        if (t == 7) { r2 = useSlot(is2[i]); prot[r2] = 1; }
        int dst = allocReg();
        prot[dst] = 1;
        int od = os[i];
        switch (t) {
            case 0: em.vop3(OP_AND, dst, r0, r1, -1); break;
            case 1: em.vop3(OP_OR, dst, r0, r1, -1); break;
            case 2: em.vop3(OP_XOR, dst, r0, r1, -1); break;
            case 3: em.vop3(OP_AND, dst, r0, r1, -1); em.vop3(OP_XOR, dst, dst, 15, -1); break;
            case 4: em.vop3(OP_OR, dst, r0, r1, -1); em.vop3(OP_XOR, dst, dst, 15, -1); break;
            case 5: em.vop3(OP_XOR, dst, r0, r1, -1); em.vop3(OP_XOR, dst, dst, 15, -1); break;
            case 6: em.vop3(OP_XOR, dst, r0, 15, -1); break;
            default: {
                int tmp = allocReg();
                em.vop3(OP_XOR, tmp, r1, r2, -1);
                em.vop3(OP_AND, tmp, r0, tmp, -1);
                em.vop3(OP_XOR, dst, r1, tmp, -1);
                regSlot[tmp] = -1;
                freeRegs[nfree++] = tmp;
                break;
            }
        }
        if (em.overflow) break;
        releaseSlot(is0[i]);
        if (t != 6) releaseSlot(is1[i]);
        if (t == 7) releaseSlot(is2[i]);
        int nr = nextReadOf(od);
        bool fuse = (useCnt[od] == 1) && (nr != 0x7fffffff) && (nr - i <= FUSE_WINDOW);
        if (!fuse) {
            em.vmovStore(dst, (int64_t)od * 32);
            dirty[od] = 0;
        } else {
            dirty[od] = 1;
        }
        regOf[od] = dst;
        regSlot[dst] = od;
        nextRead[od] = nr;
    }
    if (em.overflow) return false;
    // flush dirty registers
    for (int r = 0; r < 16; r++) {
        int s = regSlot[r];
        if (s >= 0 && dirty[s]) {
            em.vmovStore(r, (int64_t)s * 32);
            dirty[s] = 0;
        }
    }
    em.u8(0xC3);  // ret
    if (em.overflow) return false;
    code = std::move(em.b);
    return true;
}

void interpret(const Plan& pl, char* base) {
    const int ng = pl.ngate;
    const uint8_t* ty = pl.ty.data();
    const uint32_t* is0 = pl.is0.data();
    const uint32_t* is1 = pl.is1.data();
    const uint32_t* is2 = pl.is2.data();
    const uint32_t* os = pl.os.data();
    const __m256i ones = _mm256_set1_epi64x(-1LL);
    for (int i = 0; i < ng; i++) {
        __m256i a = _mm256_load_si256((const __m256i*)(base + (size_t)is0[i] * 32));
        __m256i r;
        switch (ty[i]) {
            case 0: r = _mm256_and_si256(a, _mm256_load_si256((const __m256i*)(base + (size_t)is1[i] * 32))); break;
            case 1: r = _mm256_or_si256(a, _mm256_load_si256((const __m256i*)(base + (size_t)is1[i] * 32))); break;
            case 2: r = _mm256_xor_si256(a, _mm256_load_si256((const __m256i*)(base + (size_t)is1[i] * 32))); break;
            case 3: r = _mm256_xor_si256(_mm256_and_si256(a, _mm256_load_si256((const __m256i*)(base + (size_t)is1[i] * 32))), ones); break;
            case 4: r = _mm256_xor_si256(_mm256_or_si256(a, _mm256_load_si256((const __m256i*)(base + (size_t)is1[i] * 32))), ones); break;
            case 5: r = _mm256_xor_si256(_mm256_xor_si256(a, _mm256_load_si256((const __m256i*)(base + (size_t)is1[i] * 32))), ones); break;
            case 6: r = _mm256_xor_si256(a, ones); break;
            default: {
                __m256i s = a;
                __m256i aa = _mm256_load_si256((const __m256i*)(base + (size_t)is1[i] * 32));
                __m256i bb = _mm256_load_si256((const __m256i*)(base + (size_t)is2[i] * 32));
                r = _mm256_xor_si256(aa, _mm256_and_si256(s, _mm256_xor_si256(aa, bb)));
                break;
            }
        }
        _mm256_store_si256((__m256i*)(base + (size_t)os[i] * 32), r);
    }
}

void runGroup(const Plan& pl, const std::vector<uint64_t>& K, void (*fn)(void*), int g, char* sig, char* tmp, uint64_t* Hout) {
    const int I = pl.I, F = pl.F, O = pl.O, T = pl.T;
    const int m0 = g * 256;
    const int mcount = std::min(256, pl.M - m0);
    char* base = sig;
    memset(base + (size_t)pl.ffBase * 32, 0, (size_t)F * 32);
    _mm256_store_si256((__m256i*)(base + (size_t)pl.const1Slot * 32), _mm256_set1_epi64x(-1LL));
    uint64_t st[256];
    for (int j = 0; j < mcount; j++) st[j] = mix64(pl.seed ^ (uint64_t)(m0 + j));
    uint64_t H[256];
    for (int j = 0; j < 256; j++) H[j] = 0;
    alignas(32) uint64_t w[4];

    for (int t = 0; t < T; t++) {
        // ---- build PI words ----
        alignas(32) uint64_t piw[64][4];
        for (int i = 0; i < I; i++) { piw[i][0] = piw[i][1] = piw[i][2] = piw[i][3] = 0; }
        for (int grp = 0; grp < mcount; grp += 8) {
            int cnt = std::min(8, mcount - grp);
            uint64_t r[8];
            for (int j = 0; j < cnt; j++) r[j] = sm_next(st[grp + j]);
            for (int j = cnt; j < 8; j++) r[j] = 0;
            for (int B = 0; B < 8; B++) {
                uint64_t x = 0;
                for (int j = 0; j < 8; j++) x |= (r[j] >> (8 * B) & 0xFFULL) << (8 * j);
                uint64_t tr = transpose8bytes(x);
                for (int i = 0; i < 8; i++) {
                    int pi = 8 * B + i;
                    if (pi >= I) continue;
                    uint64_t byte = (tr >> (8 * i)) & 0xFFULL;
                    int sh = grp & 63;
                    int ck = grp >> 6;
                    piw[pi][ck] |= byte << sh;
                    if (sh > 56) piw[pi][ck + 1] |= byte >> (64 - sh);
                }
            }
        }
        for (size_t i = 0; i < pl.piIdx.size(); i++) {
            int pi = pl.piIdx[i];
            _mm256_store_si256((__m256i*)(base + (size_t)(pl.piBase + pi) * 32),
                               _mm256_set_epi64x((long long)piw[pi][3], (long long)piw[pi][2],
                                                 (long long)piw[pi][1], (long long)piw[pi][0]));
        }
        // ---- evaluate gates (JIT) ----
        if (fn) fn(base); else interpret(pl, base);
        // ---- digest ----
        const uint64_t* Kt = &K[(size_t)t * O];
        for (int j = 0; j < O; j++) {
            __m256i v = _mm256_load_si256((const __m256i*)(base + (size_t)pl.outSlot[j] * 32));
            uint64_t k = Kt[j];
            _mm256_store_si256((__m256i*)w, v);
            for (int c = 0; c < 4; c++) {
                uint64_t x = w[c];
                while (x) {
                    int b = __builtin_ctzll(x);
                    x &= x - 1;
                    H[c * 64 + b] ^= k;
                }
            }
        }
        // ---- FF update ----
        if (F) {
            if (pl.dFromFF) {
                for (int f = 0; f < F; f++)
                    _mm256_store_si256((__m256i*)(tmp + (size_t)f * 32),
                                       _mm256_load_si256((const __m256i*)(base + (size_t)pl.dSlot[f] * 32)));
                for (int f = 0; f < F; f++)
                    _mm256_store_si256((__m256i*)(base + (size_t)(pl.ffBase + f) * 32),
                                       _mm256_load_si256((const __m256i*)(tmp + (size_t)f * 32)));
            } else {
                for (int f = 0; f < F; f++)
                    _mm256_store_si256((__m256i*)(base + (size_t)(pl.ffBase + f) * 32),
                                       _mm256_load_si256((const __m256i*)(base + (size_t)pl.dSlot[f] * 32)));
            }
        }
    }
    for (int j = 0; j < 256; j++) Hout[j] = H[j];
}

}  // namespace

std::vector<uint64_t> simulate(const Circuit& c) {
    const int M = c.M;
    std::vector<uint64_t> result(M, 0);
    if (M <= 0) return result;
    Plan pl;
    buildPlan(c, pl);
    const int T = c.T, O = c.O;
    std::vector<uint64_t> K;
    if (T > 0 && O > 0) {
        K.resize((size_t)T * O);
        for (int t = 0; t < T; t++)
            for (int j = 0; j < O; j++) K[(size_t)t * O + j] = mix64((uint64_t)t * O + j);
    }
    const int ngrp = (M + 255) / 256;
    int nthreads = omp_get_max_threads();
    if (nthreads > 256) nthreads = 256;
    size_t need = (size_t)pl.nslot * 32 + 64;
    ensureScratch(nthreads, need);

    Jit jit;
    void (*fn)(void*) = nullptr;
    {
        std::vector<uint8_t> code;
        size_t limit = (size_t)pl.ngate * 40 + (size_t)1 << 20;
        for (int attempt = 0; attempt < 4; attempt++) {
            if (generate(pl, limit, code)) {
                jit.mem = VirtualAlloc(nullptr, code.size() + 4096, MEM_COMMIT | MEM_RESERVE, PAGE_EXECUTE_READWRITE);
                if (jit.mem) {
                    memcpy(jit.mem, code.data(), code.size());
                    fn = (void (*)(void*))jit.mem;
                }
                break;
            }
            limit *= 4;
        }
    }
    if (ngrp == 1) {
        uint64_t* H = g_scratch[0].H;
        runGroup(pl, K, fn, 0, g_scratch[0].sig, g_scratch[0].tmp, H);
        int cnt = std::min(256, M);
        for (int j = 0; j < cnt; j++) result[j] = H[j];
    } else {
        #pragma omp parallel num_threads(std::min(nthreads, ngrp))
        {
            int tid = omp_get_thread_num();
            int nt = omp_get_num_threads();
            uint64_t* H = g_scratch[tid].H;
            for (int g = tid; g < ngrp; g += nt) {
                runGroup(pl, K, fn, g, g_scratch[tid].sig, g_scratch[tid].tmp, H);
                int m0 = g * 256;
                int cnt = std::min(256, M - m0);
                for (int j = 0; j < cnt; j++) result[m0 + j] = H[j];
            }
        }
    }
    return result;
}

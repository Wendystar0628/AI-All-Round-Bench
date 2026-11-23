#include <cstdint>
#include <vector>
#include <cstring>
#include <algorithm>
#include <cstddef>

#ifdef _OPENMP
#include <omp.h>
#endif
#include <immintrin.h>
#ifdef DBGPLAN
#include <cstdio>
#endif

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
    uint64_t z = x + 0x9E3779B97F4A7C15ULL;
    z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9ULL;
    z = (z ^ (z >> 27)) * 0x94D049BB133111EBULL;
    return z ^ (z >> 31);
}
inline uint64_t sm_step(uint64_t s) {
    uint64_t z = s;
    z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9ULL;
    z = (z ^ (z >> 27)) * 0x94D049BB133111EBULL;
    return z ^ (z >> 31);
}

#pragma pack(push, 1)
// 24-byte descriptor. Offsets in W-word units.
// >=0       : absolute offset into v (slots/PI/const/out)
// -1        : constant 0
// -2        : constant 1
// <= -100   : current FF index (-(off+100))
struct GDesc {
    int32_t o0, o1, o2, dst;
    uint8_t type;
    uint8_t pad[3];
};
struct CopyD {
    int32_t gatePos;
    int32_t target; // FF index or output index
};
#pragma pack(pop)

struct Plan {
    std::vector<GDesc> gates;
    std::vector<CopyD> ffCopy;
    std::vector<CopyD> outCopy;
    std::vector<uint8_t> okind;
    std::vector<int32_t> oidx;
    std::vector<uint8_t> dkind;
    std::vector<int32_t> didx;
    int nslot = 0;
    int basePI = 0, baseConst0 = 0, baseConst1 = 0, baseOut = 0, baseCur = 0, baseNxt = 0, total = 0;
    int I = 0, F = 0, G = 0, O = 0;
};

void buildPlan(const Circuit& c, Plan& P) {
    const int G = c.G, F = c.F, I = c.I;
    P.I = I; P.F = F; P.G = G; P.O = c.O;
    const int gatebase = 2 + I + F;
    P.gates.resize(G);
    P.okind.assign(c.O, 3); P.oidx.assign(c.O, 0);
    P.dkind.assign(F, 3); P.didx.assign(F, 0);

    std::vector<int> slot(G, -1);
    std::vector<int> pos(G, -1);

    if (G > 0) {
        std::vector<int> indeg(G, 0);
        std::vector<std::vector<int>> fwd(G);
        for (int k = 0; k < G; ++k) {
            int xs[3] = {c.in0[k], c.in1[k], c.in2[k]};
            for (int x : xs)
                if (x >= gatebase) { indeg[k]++; fwd[x - gatebase].push_back(k); }
        }
        std::vector<int> order; order.reserve(G);
        std::vector<int> st;
        for (int k = 0; k < G; ++k) if (indeg[k] == 0) st.push_back(k);
        while (!st.empty()) {
            int k = st.back(); st.pop_back();
            order.push_back(k);
            for (int u : fwd[k]) if (--indeg[u] == 0) st.push_back(u);
        }
        for (int i = 0; i < G; ++i) pos[order[i]] = i;

        std::vector<int> last(G, -1);
        for (int k = 0; k < G; ++k) {
            int pk = pos[k];
            int xs[3] = {c.in0[k], c.in1[k], c.in2[k]};
            for (int x : xs)
                if (x >= gatebase) {
                    int g = x - gatebase;
                    if (pk > last[g]) last[g] = pk;
                }
        }
        std::vector<std::pair<int,int>> heap;
        std::vector<int> freeSlots;
        int nslot = 0;
        for (int i = 0; i < G; ++i) {
            while (!heap.empty() && heap.front().first < i) {
                std::pop_heap(heap.begin(), heap.end(),
                    [](const std::pair<int,int>&a, const std::pair<int,int>&b){ return a.first > b.first; });
                freeSlots.push_back(heap.back().second);
                heap.pop_back();
            }
            int s;
            if (!freeSlots.empty()) { s = freeSlots.back(); freeSlots.pop_back(); }
            else s = nslot++;
            slot[order[i]] = s;
            heap.push_back({last[order[i]], s});
            std::push_heap(heap.begin(), heap.end(),
                [](const std::pair<int,int>&a, const std::pair<int,int>&b){ return a.first > b.first; });
        }
        P.nslot = nslot;

        for (int f = 0; f < F; ++f)
            if (c.d[f] >= gatebase) P.ffCopy.push_back({pos[c.d[f] - gatebase], f});
        for (int j = 0; j < c.O; ++j)
            if (c.out[j] >= gatebase) P.outCopy.push_back({pos[c.out[j] - gatebase], j});
        std::sort(P.ffCopy.begin(), P.ffCopy.end(), [](const CopyD&a, const CopyD&b){return a.gatePos<b.gatePos;});
        std::sort(P.outCopy.begin(), P.outCopy.end(), [](const CopyD&a, const CopyD&b){return a.gatePos<b.gatePos;});

        for (int i = 0; i < G; ++i) {
            int k = order[i];
            GDesc& gd = P.gates[i];
            gd.type = c.type[k];
            gd.dst = slot[k];
            int xs[3] = {c.in0[k], c.in1[k], c.in2[k]};
            int32_t* oo[3] = {&gd.o0, &gd.o1, &gd.o2};
            for (int q = 0; q < 3; ++q) {
                int x = xs[q];
                if (x < 0) { *oo[q] = -1; continue; }
                if (x == 0) *oo[q] = -1;
                else if (x == 1) *oo[q] = -2;
                else if (x < 2 + I) *oo[q] = -200 - (x - 2);   // PI bit
                else if (x < gatebase) *oo[q] = -100 - (x - (2+I)); // curFF
                else *oo[q] = slot[x - gatebase];
            }
        }
    }

    // bases
    P.basePI = P.nslot;
    P.baseConst0 = P.basePI + 64;
    P.baseConst1 = P.baseConst0 + 1;
    P.baseOut = P.baseConst1 + 1;
    P.baseCur = P.baseOut + c.O;
    P.baseNxt = P.baseCur + F;
    P.total = P.baseNxt + F;

    for (GDesc& gd : P.gates) {
        int32_t* oo[3] = {&gd.o0, &gd.o1, &gd.o2};
        for (int q = 0; q < 3; ++q) {
            int32_t v = *oo[q];
            if (v <= -200) *oo[q] = P.basePI + (-(v + 200));
            // curFF (-100-...) handled dynamically in the kernel
        }
    }

    for (int j = 0; j < c.O; ++j) {
        int x = c.out[j];
        if (x >= gatebase) { P.okind[j] = 0; P.oidx[j] = j; }
        else if (x == 0) { P.okind[j] = 3; P.oidx[j] = 0; }
        else if (x == 1) { P.okind[j] = 3; P.oidx[j] = 1; }
        else if (x < 2+I) { P.okind[j] = 2; P.oidx[j] = x-2; }
        else { P.okind[j] = 1; P.oidx[j] = x-(2+I); }
    }
    for (int f = 0; f < F; ++f) {
        int x = c.d[f];
        if (x >= gatebase) { P.dkind[f] = 0; P.didx[f] = f; }
        else if (x == 0) { P.dkind[f] = 3; P.didx[f] = 0; }
        else if (x == 1) { P.dkind[f] = 3; P.didx[f] = 1; }
        else if (x < 2+I) { P.dkind[f] = 2; P.didx[f] = x-2; }
        else { P.dkind[f] = 1; P.didx[f] = x-(2+I); }
    }

#ifdef DBGPLAN
    {
        FILE* df = stderr;
        fprintf(df,"nslot=%d total=%d basePI=%d baseCur=%d baseNxt=%d G=%d F=%d\n",P.nslot,P.total,P.basePI,P.baseCur,P.baseNxt,G,F);
        // check: for each consumer gate at position i referencing slot s, producer of s must be alive
        // reconstruct birth/last per slot from gates list (o>=0 => slot o)
        std::vector<int> birth(P.nslot, -1), lastu(P.nslot, -1);
        for (int i=0;i<G;i++){
            int dst=P.gates[i].dst;
            birth[dst]=i;
        }
        for (int i=0;i<G;i++){
            for(int q=0;q<3;q++){
                int32_t off = q==0?P.gates[i].o0:q==1?P.gates[i].o1:P.gates[i].o2;
                if(off>=0 && off<P.nslot){
                    if(i>lastu[off]) lastu[off]=i;
                }
            }
        }
        // verify no two births in same slot while alive
        std::vector<std::pair<int,int>> iv;
        for(int s=0;s<P.nslot;s++) iv.push_back({birth[s], lastu[s]});
        // check overlap by sweep
        int bad=0;
        for(int s=0;s<P.nslot;s++)for(int t=s+1;t<P.nslot;t++){
            if(birth[s]<=lastu[t] && birth[t]<=lastu[s]) bad++;
        }
        fprintf(df,"slot interval overlaps=%d\n",bad);
    }
#endif
}

static inline __m256i vload(const uint64_t* p) { return _mm256_loadu_si256((const __m256i*)p); }
static inline void vstore(uint64_t* p, __m256i x) { _mm256_storeu_si256((__m256i*)p, x); }

} // namespace

std::vector<uint64_t> simulate(const Circuit& c) {
    Plan P;
    buildPlan(c, P);
    const int M = c.M, T = c.T, O = c.O, F = c.F, G = c.G, I = c.I;
    std::vector<uint64_t> H(M, 0);

    std::vector<uint64_t> K((size_t)T * O);
    for (int t = 0; t < T; ++t)
        for (int j = 0; j < O; ++j)
            K[(size_t)t*O + j] = mix64((uint64_t)t * O + j);

    const int W = 4;
    const int LANES = 64 * W;
    int nBatches = (M + LANES - 1) / LANES;

    std::vector<uint64_t> initState((size_t)nBatches * LANES, 0);
    for (int b = 0; b < nBatches; ++b)
        for (int q = 0; q < LANES; ++q) {
            int m = b*LANES + q;
            if (m < M) initState[(size_t)b*LANES+q] = mix64(c.seed ^ (uint64_t)m);
        }

    const int basePI = P.basePI, baseConst0 = P.baseConst0, baseConst1 = P.baseConst1;
    const int baseOut = P.baseOut, baseCur0 = P.baseCur;

    #pragma omp parallel for schedule(static)
    for (int b = 0; b < nBatches; ++b) {
        int lanes = std::min(LANES, M - b*LANES);
        std::vector<uint64_t> v((size_t)P.total * W, 0);
        for (int w = 0; w < W; ++w) v[(size_t)baseConst1*W + w] = ~0ULL;
        std::vector<uint64_t> hl(LANES, 0);
        std::vector<uint64_t> stt(LANES, 0);
        std::vector<uint64_t> rows(LANES, 0);
        for (int q = 0; q < LANES; ++q) stt[q] = initState[(size_t)b*LANES+q];

        int curOff = baseCur0, nxtOff = P.baseNxt;

        size_t fcp = 0, ocp = 0;
        __m256i vzero = _mm256_setzero_si256();
        __m256i vones = _mm256_set1_epi64x(~0ULL);
        auto L = [&](int32_t off) -> __m256i {
            if (off >= 0) return vload(&v[(size_t)off*W]);
            if (off == -1) return vzero;
            if (off == -2) return vones;
            return vload(&v[(size_t)(curOff - (off + 100))*W]);
        };
        const GDesc* gd = P.gates.data();
        const CopyD* fct = P.ffCopy.data();
        const CopyD* oct = P.outCopy.data();
        size_t nfc = P.ffCopy.size(), noc = P.outCopy.size();

        for (int t = 0; t < T; ++t) {
            for (int q = 0; q < lanes; ++q) {
                stt[q] += 0x9E3779B97F4A7C15ULL;
                rows[q] = sm_step(stt[q]);
            }
            for (int q = lanes; q < LANES; ++q) rows[q] = 0;
            for (int blk = 0; blk < W; ++blk)
                for (int i = 0; i < I; ++i) {
                    uint64_t col = 0;
                    for (int q = 0; q < 64; ++q)
                        col |= ((rows[blk*64+q] >> i) & 1ULL) << q;
                    v[(size_t)(basePI + i)*W + blk] = col;
                }
            for (int f = 0; f < F; ++f) vstore(&v[(size_t)(nxtOff + f)*W], vzero);
            for (int j = 0; j < O; ++j) vstore(&v[(size_t)(baseOut + j)*W], vzero);

            fcp = ocp = 0;
            for (int gi = 0; gi < G; ++gi) {
                __m256i a = L(gd[gi].o0);
                __m256i y;
                switch (gd[gi].type) {
                    case 0: y = _mm256_and_si256(a, L(gd[gi].o1)); break;
                    case 1: y = _mm256_or_si256(a, L(gd[gi].o1)); break;
                    case 2: y = _mm256_xor_si256(a, L(gd[gi].o1)); break;
                    case 3: y = _mm256_andnot_si256(_mm256_and_si256(a, L(gd[gi].o1)), vones); break;
                    case 4: y = _mm256_andnot_si256(_mm256_or_si256(a, L(gd[gi].o1)), vones); break;
                    case 5: y = _mm256_xor_si256(vones, _mm256_xor_si256(a, L(gd[gi].o1))); break;
                    case 6: y = _mm256_xor_si256(vones, a); break;
                    default: y = _mm256_or_si256(_mm256_and_si256(a, L(gd[gi].o2)),
                                               _mm256_andnot_si256(a, L(gd[gi].o1))); break;
                }
                vstore(&v[(size_t)gd[gi].dst*W], y);
                while (fcp < nfc && fct[fcp].gatePos == gi) {
                    vstore(&v[(size_t)(nxtOff + fct[fcp].target)*W], y); ++fcp;
                }
                while (ocp < noc && oct[ocp].gatePos == gi) {
                    vstore(&v[(size_t)(baseOut + oct[ocp].target)*W], y); ++ocp;
                }
            }
            for (int j = 0; j < O; ++j) {
                if (P.okind[j] != 0) {
                    __m256i y;
                    uint8_t kk2 = P.okind[j]; int32_t idx = P.oidx[j];
                    if (kk2 == 1) y = vload(&v[(size_t)(curOff + idx)*W]);
                    else if (kk2 == 2) y = vload(&v[(size_t)(basePI + idx)*W]);
                    else y = idx ? vones : vzero;
                    vstore(&v[(size_t)(baseOut + j)*W], y);
                }
            }
            for (int f = 0; f < F; ++f) {
                if (P.dkind[f] != 0) {
                    __m256i y;
                    uint8_t kk2 = P.dkind[f]; int32_t idx = P.didx[f];
                    if (kk2 == 1) y = vload(&v[(size_t)(curOff + idx)*W]);
                    else if (kk2 == 2) y = vload(&v[(size_t)(basePI + idx)*W]);
                    else y = idx ? vones : vzero;
                    vstore(&v[(size_t)(nxtOff + f)*W], y);
                }
            }
            for (int j = 0; j < O; ++j) {
                const uint64_t* wp = &v[(size_t)(baseOut + j)*W];
                uint64_t kk = K[(size_t)t*O+j];
                for (int w = 0; w < W; ++w) {
                    uint64_t y = wp[w];
                    while (y) { int q = __builtin_ctzll(y); hl[w*64+q] ^= kk; y &= y-1; }
                }
            }
            std::swap(curOff, nxtOff);
        }
        for (int q = 0; q < lanes; ++q) H[b*LANES+q] = hl[q];
    }

    return H;
}

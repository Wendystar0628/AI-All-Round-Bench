#include <cstdint>
#include <vector>
#include <cstring>
#include <cstdlib>
#include <algorithm>
#include <immintrin.h>

struct Circuit {
    int I, F, G, O, M, T;
    uint64_t seed;
    std::vector<int> d;
    std::vector<uint8_t> type;
    std::vector<int> in0, in1, in2;
    std::vector<int> out;
};

namespace {

inline uint64_t sm64(uint64_t &s) {
    uint64_t z = (s += 0x9E3779B97F4A7C15ULL);
    z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9ULL;
    z = (z ^ (z >> 27)) * 0x94D049BB133111EBULL;
    return z ^ (z >> 31);
}
inline uint64_t mix64(uint64_t x) { return sm64(x); }

// in-place transpose of a 64x64 bit matrix (x[i] bit j -> x[j] bit i)
inline void transpose64(uint64_t *x) {
    for (int w = 32; w; w >>= 1) {
        uint64_t m = 0;
        for (int cc = 0; cc < 64; cc += 2 * w) m |= (((w == 32) ? (~0ULL >> 32) : ((1ULL << w) - 1)) << cc);
        for (int i = 0; i < 64; i++) {
            if ((i & w) == 0) {
                int j = i + w;
                uint64_t t = ((x[i] >> w) ^ x[j]) & m;
                x[i] ^= t << w;
                x[j] ^= t;
            }
        }
    }
}

} // namespace

#ifndef SOL_CH
#define SOL_CH 4
#endif

template <int CH>
static void runGroups(const Circuit &c, int nChunks, int nGroups, int nslots, int nthr,
                      const std::vector<uint32_t> &off0, const std::vector<uint32_t> &off1,
                      const std::vector<uint32_t> &off2, const std::vector<uint32_t> &offd,
                      const std::vector<uint8_t> &code,
                      const std::vector<int32_t> &runEnd, const std::vector<uint8_t> &runKey,
                      const std::vector<uint32_t> &doff, const std::vector<uint32_t> &ffoff,
                      const std::vector<uint32_t> &outoff, const std::vector<uint64_t> &mixtab,
                      std::vector<uint64_t> &H) {
    const int I = c.I, F = c.F, O = c.O, T = c.T;
    const int nruns = (int)runEnd.size();
    // constant table: code = sel*2 + inv ; sel: 0=AND,1=XOR,2=OR ; inv: invert output
    static const __m256i ctabInit[8 * 3] = {
        _mm256_set1_epi64x(0), _mm256_set1_epi64x(0), _mm256_set1_epi64x(0),
        _mm256_set1_epi64x(0), _mm256_set1_epi64x(0), _mm256_set1_epi64x(-1),
        _mm256_set1_epi64x(-1), _mm256_set1_epi64x(0), _mm256_set1_epi64x(0),
        _mm256_set1_epi64x(-1), _mm256_set1_epi64x(0), _mm256_set1_epi64x(-1),
        _mm256_set1_epi64x(0), _mm256_set1_epi64x(-1), _mm256_set1_epi64x(0),
        _mm256_set1_epi64x(0), _mm256_set1_epi64x(-1), _mm256_set1_epi64x(-1),
        _mm256_set1_epi64x(0), _mm256_set1_epi64x(0), _mm256_set1_epi64x(0),
        _mm256_set1_epi64x(0), _mm256_set1_epi64x(0), _mm256_set1_epi64x(0)};
    __m256i ctab[8 * 3];
    for (int i = 0; i < 24; i++) ctab[i] = ctabInit[i];
    (void)ffoff;
#pragma omp parallel num_threads(nthr)
    {
        std::vector<uint64_t> val((size_t)nslots * CH + 8, 0);
        std::vector<uint64_t> states((size_t)64 * CH, 0);
        std::vector<uint64_t> tmp((size_t)(F > 0 ? F : 1) * CH, 0);
        char *vb = (char *)val.data();
        for (int ch = 0; ch < CH; ch++) {
            val[0 * CH + ch] = 0;
            val[1 * CH + ch] = ~(uint64_t)0;
        }
#pragma omp for schedule(static)
        for (int g = 0; g < nGroups; g++) {
            int cb = g * CH;
            int nc = std::min(CH, nChunks - cb);
            for (int ch = 0; ch < CH; ch++)
                for (int m = 0; m < 64; m++)
                    states[(size_t)ch * 64 + m] = mix64(c.seed ^ (uint64_t)((cb + ch) * 64 + m));
            for (int f = 0; f < F; f++)
                for (int ch = 0; ch < CH; ch++) val[(size_t)(2 + I + f) * CH + ch] = 0;
            for (int t = 0; t < T; t++) {
                for (int ch = 0; ch < nc; ch++) {
                    uint64_t r[64];
                    uint64_t *st = &states[(size_t)ch * 64];
                    for (int m = 0; m < 64; m++) r[m] = sm64(st[m]);
                    transpose64(r);
                    for (int i = 0; i < I; i++) val[(size_t)(2 + i) * CH + ch] = r[i];
                }
                int k = 0;
                for (int r = 0; r < nruns; r++) {
                    int e = runEnd[r];
                    int n = e - k;
                    const uint32_t *p0 = off0.data() + k;
                    const uint32_t *p1 = off1.data() + k;
                    const uint32_t *p2 = off2.data() + k;
                    const uint32_t *pd = offd.data() + k;
                    const uint8_t *pc = code.data() + k;
                    if (runKey[r] != 7) {
                        for (int i = 0; i < n; i++) {
                            __m256i a = _mm256_loadu_si256((const __m256i *)(vb + p0[i]));
                            __m256i b = _mm256_loadu_si256((const __m256i *)(vb + p1[i]));
                            __m256i u = _mm256_and_si256(a, b);
                            __m256i x = _mm256_xor_si256(a, b);
                            const __m256i *ct = &ctab[(size_t)pc[i] * 3];
                            __m256i res = _mm256_blendv_epi8(u, x, ct[0]);
                            res = _mm256_blendv_epi8(res, _mm256_or_si256(u, x), ct[1]);
                            res = _mm256_xor_si256(res, ct[2]);
                            _mm256_storeu_si256((__m256i *)(vb + pd[i]), res);
                        }
                    } else {
                        for (int i = 0; i < n; i++) {
                            __m256i s = _mm256_loadu_si256((const __m256i *)(vb + p0[i]));
                            __m256i a = _mm256_loadu_si256((const __m256i *)(vb + p1[i]));
                            __m256i b = _mm256_loadu_si256((const __m256i *)(vb + p2[i]));
                            __m256i res = _mm256_xor_si256(a, _mm256_and_si256(_mm256_xor_si256(a, b), s));
                            _mm256_storeu_si256((__m256i *)(vb + pd[i]), res);
                        }
                    }
                    k = e;
                }
// digest
                for (int j = 0; j < O; j++) {
                    uint64_t tabv = mixtab[(size_t)t * O + j];
                    const uint64_t *vp = &val[(size_t)outoff[j] / 8];
                    for (int ch = 0; ch < nc; ch++) {
                        int base = (cb + ch) * 64;
                        int nv = std::min(64, c.M - base);
                        uint64_t w = vp[ch] & ((nv >= 64) ? ~(uint64_t)0 : ((1ULL << nv) - 1));
                        uint64_t *hb = &H[(size_t)base];
                        while (w) {
                            int b = __builtin_ctzll(w);
                            w &= w - 1;
                            hb[b] ^= tabv;
                        }
                    }
                }
                // flip-flop update (simultaneous)
                for (int f = 0; f < F; f++)
                    for (int ch = 0; ch < CH; ch++) tmp[(size_t)f * CH + ch] = val[(size_t)doff[f] / 8 + ch];
                for (int f = 0; f < F; f++)
                    for (int ch = 0; ch < CH; ch++) val[(size_t)(2 + I + f) * CH + ch] = tmp[(size_t)f * CH + ch];
            }
        }
    }
}

std::vector<uint64_t> simulate(const Circuit &c) {
    const int I = c.I, F = c.F, G = c.G, O = c.O, M = c.M, T = c.T;
    const int GB = I + F + 2;

    // ---------------- topological order (opcode-batched) ----------------
    std::vector<int> gsrc((size_t)G * 3, -1);
    std::vector<int> indeg(G, 0);
    for (int k = 0; k < G; k++) {
        int t = c.type[k];
        int n = (t == 6) ? 1 : (t == 7 ? 3 : 2);
        const int *in[3] = {&c.in0[k], &c.in1[k], &c.in2[k]};
        for (int q = 0; q < n; q++) {
            int s = *in[q];
            if (s >= GB) { gsrc[(size_t)k * 3 + q] = s - GB; indeg[k]++; }
        }
    }
    std::vector<int> fstart(G + 1, 0);
    for (int k = 0; k < G; k++)
        for (int q = 0; q < 3; q++) { int s = gsrc[(size_t)k * 3 + q]; if (s >= 0) fstart[s + 1]++; }
    for (int i = 0; i < G; i++) fstart[i + 1] += fstart[i];
    std::vector<int> ftgt((size_t)fstart[G]);
    {
        std::vector<int> cur(fstart.begin(), fstart.end() - 1);
        for (int k = 0; k < G; k++)
            for (int q = 0; q < 3; q++) {
                int s = gsrc[(size_t)k * 3 + q];
                if (s >= 0) ftgt[cur[s]++] = k;
            }
    }
    std::vector<int> indeg0 = indeg;
    std::vector<uint8_t> onlyFF(G, 0);
    {
        std::vector<uint8_t> isFFd(G, 0), isOut(G, 0);
        for (int f = 0; f < F; f++) { int s = c.d[f]; if (s >= GB && s - GB < G) isFFd[s - GB] = 1; }
        for (int j = 0; j < O; j++) { int s = c.out[j]; if (s >= GB && s - GB < G) isOut[s - GB] = 1; }
        for (int g = 0; g < G; g++)
            onlyFF[g] = (fstart[g + 1] == fstart[g] && isFFd[g] && !isOut[g]) ? 1 : 0;
    }
    std::vector<int> order;
    order.reserve(G);
    std::vector<int> gslot;
    int nslots = 0;
    for (int attempt = 0; attempt < 2; attempt++) {
        bool lifo = (attempt == 1);
        indeg = indeg0;
        order.clear();
        if (!lifo) {
        std::vector<int> ready[8];
    for (int k = 0; k < G; k++) if (indeg[k] == 0) ready[c.type[k]].push_back(k);
    std::vector<int> cur;
    while ((int)order.size() < G) {
        int best = -1, bn = 0;
        for (int t = 0; t < 8; t++)
            if ((int)ready[t].size() > bn) { bn = (int)ready[t].size(); best = t; }
        if (bn == 0) break;
        cur.swap(ready[best]);
        for (int k : cur) order.push_back(k);
        for (int k : cur) {
            for (int e = fstart[k]; e < fstart[k + 1]; e++) {
                int f = ftgt[e];
                if (--indeg[f] == 0) ready[c.type[f]].push_back(f);
            }
        }
        cur.clear();
        }
        } else {
            std::vector<int> stkA, stkB;
            for (int k = 0; k < G; k++)
                if (indeg[k] == 0) (onlyFF[k] ? stkB : stkA).push_back(k);
            while (!stkA.empty() || !stkB.empty()) {
                int k;
                if (!stkA.empty()) { k = stkA.back(); stkA.pop_back(); }
                else { k = stkB.back(); stkB.pop_back(); }
                order.push_back(k);
                for (int e = fstart[k]; e < fstart[k + 1]; e++) {
                    int f = ftgt[e];
                    if (--indeg[f] == 0) (onlyFF[f] ? stkB : stkA).push_back(f);
                }
            }
        }
    const int NG = (int)order.size();

    // ---------------- slot assignment ----------------
    const int COPY_POS = NG;
    const int END_POS = NG + F;
    std::vector<int> lastUse(G, -1);
    std::vector<int> pos(G, -1);
    for (int p = 0; p < NG; p++) pos[order[p]] = p;
    for (int k = 0; k < G; k++)
        for (int q = 0; q < 3; q++) {
            int s = gsrc[(size_t)k * 3 + q];
            if (s >= 0 && pos[k] > lastUse[s]) lastUse[s] = pos[k];
        }
    for (int f = 0; f < F; f++) {
        int s = c.d[f];
        if (s >= GB) { int g = s - GB; if (COPY_POS + f > lastUse[g]) lastUse[g] = COPY_POS + f; }
    }
    for (int j = 0; j < O; j++) {
        int s = c.out[j];
        if (s >= GB) { int g = s - GB; if (END_POS > lastUse[g]) lastUse[g] = END_POS; }
    }
    std::vector<int> bhead(END_POS + 1, -1), bnext(G, -1);
    for (int g = 0; g < NG; g++) {
        int s = order[g];
        int L = lastUse[s];
        if (L < 0) L = END_POS;
        bnext[s] = bhead[L];
        bhead[L] = s;
    }
    gslot.assign(G, -1);
    std::vector<int> freeSlots;
    int nextSlot = 2 + I + F;
    int maxSlots = nextSlot;
    for (int p = 0; p < NG; p++) {
        int k = order[p];
        int sl;
        if (!freeSlots.empty()) { sl = freeSlots.back(); freeSlots.pop_back(); }
        else sl = nextSlot++;
        gslot[k] = sl;
        if (sl + 1 > maxSlots) maxSlots = sl + 1;
        for (int s = bhead[p]; s >= 0; s = bnext[s]) freeSlots.push_back(gslot[s]);
    }
    nslots = maxSlots;
    if (nslots <= 60000) break;
    }
    const int NG = (int)order.size();
    (void)NG;

    auto slotOf = [&](int s) -> int {
        if (s < 2) return s;
        if (s < I + 2) return 2 + (s - 2);
        if (s < GB) return 2 + I + (s - (I + 2));
        return gslot[s - GB];
    };

    // ---------------- instruction stream ----------------
    const uint32_t STRIDE = (uint32_t)(SOL_CH * 8);
    std::vector<uint32_t> off0(NG), off1(NG), off2(NG), offd(NG);
    std::vector<uint8_t> code(NG, 0);
    std::vector<int32_t> runEnd;
    std::vector<uint8_t> runKey;
    runEnd.reserve(4096); runKey.reserve(4096);
    // sel: 0=AND 1=XOR 2=OR ; inv: invert ; code = sel*2+inv
    static const int selOf[8] = {0, 2, 1, 0, 2, 1, 1, 0};
    static const int invOf[8] = {0, 0, 0, 1, 1, 1, 1, 0};
    for (int p = 0; p < NG; p++) {
        int k = order[p];
        int t = c.type[k];
        off0[p] = (uint32_t)slotOf(c.in0[k]) * STRIDE;
        off1[p] = (t == 6) ? 0 : (uint32_t)slotOf(c.in1[k]) * STRIDE;
        off2[p] = (t == 7) ? (uint32_t)slotOf(c.in2[k]) * STRIDE : 0;
        offd[p] = (uint32_t)gslot[k] * STRIDE;
        code[p] = (uint8_t)(selOf[t] * 2 + invOf[t]);
        int rk = (t == 7) ? 7 : 0;
        if (!runKey.empty() && runKey.back() == (uint8_t)rk) runEnd.back() = p + 1;
        else { runKey.push_back((uint8_t)rk); runEnd.push_back(p + 1); }
    }
    std::vector<uint32_t> doff(F > 0 ? F : 1), ffoff(F > 0 ? F : 1);
    for (int f = 0; f < F; f++) {
        doff[f] = (uint32_t)slotOf(c.d[f]) * STRIDE;
        ffoff[f] = (uint32_t)(2 + I + f) * STRIDE;
    }
    std::vector<uint32_t> outoff(O > 0 ? O : 1);
    for (int j = 0; j < O; j++) outoff[j] = (uint32_t)slotOf(c.out[j]) * STRIDE;

    std::vector<uint64_t> mixtab((size_t)T * O + 1);
    for (int t = 0; t < T; t++)
        for (int j = 0; j < O; j++) mixtab[(size_t)t * O + j] = mix64((uint64_t)t * O + j);

    std::vector<uint64_t> H((size_t)M, 0);
    if (M == 0) return H;
    int nChunks = (M + 63) / 64;
    int nGroups = (nChunks + SOL_CH - 1) / SOL_CH;
    int nthr = (nslots > 60000) ? 8 : 16;
    if (nthr > nGroups) nthr = nGroups;
    if (nthr < 1) nthr = 1;
    runGroups<SOL_CH>(c, nChunks, nGroups, nslots, nthr, off0, off1, off2, offd, code, runEnd, runKey,
                      doff, ffoff, outoff, mixtab, H);
    return H;
}

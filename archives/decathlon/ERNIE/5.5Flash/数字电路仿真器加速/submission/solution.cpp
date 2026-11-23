#include <cstdint>
#include <vector>
#include <cstring>
#include <algorithm>
#ifdef _OPENMP
#include <omp.h>
#endif
#include <immintrin.h>

struct Circuit {
    int I, F, G, O, M, T;
    uint64_t seed;
    std::vector<int> d;
    std::vector<uint8_t> type;
    std::vector<int> in0, in1, in2;
    std::vector<int> out;
};

static inline uint64_t splitmix64_next(uint64_t *s) {
    uint64_t z = (*s += 0x9E3779B97F4A7C15ULL);
    z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9ULL;
    z = (z ^ (z >> 27)) * 0x94D049BB133111EBULL;
    return z ^ (z >> 31);
}
static inline uint64_t mix64(uint64_t x) { return splitmix64_next(&x); }

struct QI { int32_t a, b, c, o; };

std::vector<uint64_t> simulate(const Circuit& c) {
    const int I = c.I, F = c.F, G = c.G, O = c.O, M = c.M, T = c.T;
    const int base = I + F + 2;
    const int nsig = I + F + G + 2;

    // ---- topo order ----
    std::vector<int> head(nsig, -1), eto, nxt, indeg(G, 0);
    eto.reserve((size_t)G * 3); nxt.reserve((size_t)G * 3);
    auto edge = [&](int sigid, int g) { eto.push_back(g); nxt.push_back(head[sigid]); head[sigid] = (int)eto.size() - 1; };
    for (int k = 0; k < G; k++) {
        int a = c.in0[k]; if (a >= base) { indeg[k]++; edge(a, k); }
        int b = c.in1[k]; if (b >= base) { indeg[k]++; edge(b, k); }
        int d = c.in2[k]; if (d >= base) { indeg[k]++; edge(d, k); }
    }
    std::vector<int> ord; ord.reserve(G);
    {
        std::vector<int> stk; stk.reserve(G);
        for (int k = 0; k < G; k++) if (indeg[k] == 0) stk.push_back(k);
        while (!stk.empty()) {
            int g = stk.back(); stk.pop_back(); ord.push_back(g);
            for (int e = head[base + g]; e != -1; e = nxt[e]) { int h = eto[e]; if (--indeg[h] == 0) stk.push_back(h); }
        }
    }

    // ---- last use ----
    std::vector<int> lastUse(G, 0);
    for (int p = 0; p < G; p++) lastUse[ord[p]] = p;
    for (int p = 0; p < G; p++) {
        int g = ord[p];
        int a = c.in0[g]; if (a >= base) { int q = a - base; lastUse[q] = std::max(lastUse[q], p); }
        int b = c.in1[g]; if (b >= base) { int q = b - base; lastUse[q] = std::max(lastUse[q], p); }
        int d = c.in2[g]; if (d >= base) { int q = d - base; lastUse[q] = std::max(lastUse[q], p); }
    }
    for (int f = 0; f < F; f++) { int s = c.d[f]; if (s >= base) lastUse[s - base] = G; }
    for (int j = 0; j < O; j++) { int s = c.out[j]; if (s >= base) lastUse[s - base] = G; }

    std::vector<int> bhead(G + 1, -1), bnxt(G, -1);
    for (int g = 0; g < G; g++) { int lu = lastUse[g]; bnxt[g] = bhead[lu]; bhead[lu] = g; }

    // classify short-span (hot) vs long-span (cold) gates, and size two pools
    const int TH = 2048;
    std::vector<int> posOf(nsig, -1);
    for (int p = 0; p < G; p++) posOf[base + ord[p]] = p;
    std::vector<uint8_t> isShort(G);
    int g_poolS = 0, g_poolL = 0;
    {
        std::vector<int> diffS(G + 2, 0), diffL(G + 2, 0);
        for (int g = 0; g < G; g++) {
            int p = posOf[base + g];
            int lu = lastUse[g];
            if (lu - p < TH) { isShort[g] = 1; diffS[p]++; diffS[lu + 1]--; }
            else { isShort[g] = 0; diffL[p]++; diffL[lu + 1]--; }
        }
        int cur = 0;
        for (int p = 0; p <= G; p++) { cur += diffS[p]; g_poolS = std::max(g_poolS, cur); }
        cur = 0;
        for (int p = 0; p <= G; p++) { cur += diffL[p]; g_poolL = std::max(g_poolL, cur); }
    }

    const int W = 4;                 // 4 words = 256 stimuli
    const int B = W * 64;
    std::vector<int> slotOf(nsig, -1);
    std::vector<QI> qi(G);
    std::vector<uint8_t> qf(G);
    {
        const int poolS = g_poolS, poolL = g_poolL;
        std::vector<int> freeS, freeL;
        freeS.reserve(poolS + 8); freeL.reserve(poolL + 8);
        int nextS = 0, nextL = poolS;
        for (int p = 0; p < G; p++) {
            int g = ord[p];
            int sl;
            if (isShort[g]) { if (!freeS.empty()) { sl = freeS.back(); freeS.pop_back(); } else sl = nextS++; }
            else { if (!freeL.empty()) { sl = freeL.back(); freeL.pop_back(); } else sl = nextL++; }
            slotOf[base + g] = sl;
            int A = c.in0[g], Bb = c.in1[g], Cc = c.in2[g];
            int ty = c.type[g];
            int bbase = 2 + I + F;
            if (ty == 6) {
                qi[p].a = (A >= base) ? (bbase + slotOf[A]) : A;
                qi[p].b = 1; qi[p].c = 0;
                qf[p] = 2;
            } else if (ty == 7) {
                qi[p].a = (A >= base) ? (bbase + slotOf[A]) : A;
                qi[p].b = (Bb >= base) ? (bbase + slotOf[Bb]) : Bb;
                qi[p].c = (Cc >= base) ? (bbase + slotOf[Cc]) : Cc;
                qf[p] = 8;
            } else {
                qi[p].a = (A >= base) ? (bbase + slotOf[A]) : A;
                qi[p].b = (Bb >= base) ? (bbase + slotOf[Bb]) : Bb;
                qi[p].c = 0;
                qf[p] = (uint8_t)((ty % 3) | ((ty / 3) << 2));
            }
            qi[p].o = bbase + sl;
            for (int q = bhead[p]; q != -1; q = bnxt[q]) {
                if (isShort[q]) freeS.push_back(slotOf[base + q]);
                else freeL.push_back(slotOf[base + q]);
            }
        }
    }
    const int bufBase = 2 + I + F;
    const int nslot = bufBase + g_poolS + g_poolL;
    std::vector<int> didx(F), oidx(O);
    for (int f = 0; f < F; f++) { int s = c.d[f]; didx[f] = (s >= base) ? (bufBase + slotOf[s]) : s; }
    for (int j = 0; j < O; j++) { int s = c.out[j]; oidx[j] = (s >= base) ? (bufBase + slotOf[s]) : s; }

    std::vector<uint64_t> H(M, 0);
    const int TO = T * O;
    std::vector<uint64_t> C(TO);
    for (int i = 0; i < TO; i++) C[i] = mix64((uint64_t)i);

    const int ntiles = (M + B - 1) / B;
    const QI* pq = qi.data();
    const uint8_t* pf = qf.data();
    const int* pd = didx.data(); const int* pj = oidx.data();
    const __m256i ones = _mm256_set1_epi64x(-1);
    __m256i m1tab[3], m2tab[3];
    for (int s = 0; s < 3; s++) {
        m1tab[s] = _mm256_set1_epi8((char)(-(int)(s >= 1)));
        m2tab[s] = _mm256_set1_epi8((char)(-(int)(s >= 2)));
    }
    __m256i invtab[2] = { _mm256_setzero_si256(), _mm256_set1_epi64x(-1) };

    #pragma omp parallel
    {
        std::vector<uint64_t> buf((size_t)nslot * W, 0);
        // constant 1
        for (int w = 0; w < W; w++) buf[(size_t)1 * W + w] = ~0ULL;
        std::vector<uint64_t> dtmp((size_t)F * W);
        std::vector<uint64_t> rs(B);
        std::vector<uint64_t> rv(B);

        #pragma omp for schedule(dynamic)
        for (int tile = 0; tile < ntiles; tile++) {
            const int m0 = tile * B;
            const int nb = std::min(B, M - m0);
            uint64_t* s = buf.data();
            for (int f = 0; f < F; f++)
                for (int w = 0; w < W; w++) s[(size_t)(2 + I + f) * W + w] = 0;
            for (int l = 0; l < nb; l++) rs[l] = mix64(c.seed ^ (uint64_t)(m0 + l));
            std::vector<uint64_t> Hloc(B, 0);
            uint64_t pi[64];

            for (int t = 0; t < T; t++) {
                for (int l = 0; l < nb; l++) rv[l] = splitmix64_next(&rs[l]);
                for (int w = 0; w < W; w++) {
                    for (int i = 0; i < I; i++) pi[i] = 0;
                    for (int l = 0; l < 64; l++) {
                        uint64_t v = rv[w * 64 + l];
                        while (v) { int i = __builtin_ctzll(v); pi[i] |= (1ULL << l); v &= v - 1; }
                    }
                    for (int i = 0; i < I; i++) s[(size_t)(2 + i) * W + w] = pi[i];
                }

                for (int p = 0; p < G; p++) {
                    QI q = pq[p];
                    uint8_t f = pf[p];
                    const uint64_t* pa = s + (size_t)q.a * W;
                    const uint64_t* pb = s + (size_t)q.b * W;
                    uint64_t* po = s + (size_t)q.o * W;
                    if (f & 8) {
                        const uint64_t* pc = s + (size_t)q.c * W;
                        for (int ww = 0; ww < W; ww += 4) {
                            __m256i A = _mm256_loadu_si256((const __m256i*)(pa + ww));
                            __m256i Bb = _mm256_loadu_si256((const __m256i*)(pb + ww));
                            __m256i Cc = _mm256_loadu_si256((const __m256i*)(pc + ww));
                            __m256i r = _mm256_or_si256(_mm256_and_si256(A, Cc),
                                                       _mm256_andnot_si256(A, Bb));
                            _mm256_storeu_si256((__m256i*)(po + ww), r);
                        }
                    } else {
                        int sel = f & 3;
                        __m256i m1 = m1tab[sel], m2 = m2tab[sel];
                        __m256i invm = invtab[(f >> 2) & 1];
                        for (int ww = 0; ww < W; ww += 4) {
                            __m256i A = _mm256_loadu_si256((const __m256i*)(pa + ww));
                            __m256i Bb = _mm256_loadu_si256((const __m256i*)(pb + ww));
                            __m256i lo = _mm256_and_si256(A, Bb);
                            __m256i hi = _mm256_or_si256(A, Bb);
                            __m256i xx = _mm256_xor_si256(A, Bb);
                            __m256i r = _mm256_blendv_epi8(lo, hi, m1);
                            r = _mm256_blendv_epi8(r, xx, m2);
                            r = _mm256_xor_si256(r, invm);
                            _mm256_storeu_si256((__m256i*)(po + ww), r);
                        }
                    }
                }
                for (int j = 0; j < O; j++) {
                    const uint64_t* wv = s + (size_t)pj[j] * W;
                    uint64_t cst = C[(size_t)t * O + j];
                    for (int w = 0; w < W; w++) {
                        uint64_t x = wv[w];
                        while (x) { int l = __builtin_ctzll(x); Hloc[w * 64 + l] ^= cst; x &= x - 1; }
                    }
                }
                for (int f = 0; f < F; f++) {
                    const uint64_t* src = s + (size_t)pd[f] * W;
                    uint64_t* dst = &dtmp[(size_t)f * W];
                    for (int w = 0; w < W; w++) dst[w] = src[w];
                }
                for (int f = 0; f < F; f++) {
                    uint64_t* dst = s + (size_t)(2 + I + f) * W;
                    const uint64_t* src = &dtmp[(size_t)f * W];
                    for (int w = 0; w < W; w++) dst[w] = src[w];
                }
            }
            for (int l = 0; l < nb; l++) H[m0 + l] = Hloc[l];
        }
    }
    return H;
}
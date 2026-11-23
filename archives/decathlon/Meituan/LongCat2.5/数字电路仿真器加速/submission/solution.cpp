#include <cstdint>
#include <vector>
#include <cstring>
#include <immintrin.h>
#include <omp.h>
#include <algorithm>

struct Circuit {
    int I, F, G, O, M, T;
    uint64_t seed;
    std::vector<int> d;
    std::vector<uint8_t> type;
    std::vector<int> in0, in1, in2;
    std::vector<int> out;
};

static inline uint64_t splitmix64_next(uint64_t* s) {
    uint64_t z = (*s += 0x9E3779B97F4A7C15ULL);
    z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9ULL;
    z = (z ^ (z >> 27)) * 0x94D049BB133111EBULL;
    return z ^ (z >> 31);
}
static inline uint64_t mix64(uint64_t x) { return splitmix64_next(&x); }

static void transpose64(uint64_t* a) {
    for (int d = 32; d >= 1; d >>= 1) {
        uint64_t mask = (1ull << d) - 1;
        for (int r0 = 0; r0 < 64; r0 += 2 * d) {
            for (int c0 = 0; c0 < 64; c0 += 2 * d) {
                for (int i = 0; i < d; i++) {
                    uint64_t top = a[r0 + i];
                    uint64_t bot = a[r0 + d + i];
                    uint64_t t = (top >> (c0 + d)) & mask;
                    uint64_t u = (bot >> c0) & mask;
                    a[r0 + i] = (top & ~(mask << (c0 + d))) | (u << (c0 + d));
                    a[r0 + d + i] = (bot & ~(mask << c0)) | (t << c0);
                }
            }
        }
    }
}

namespace {

struct Solver {
    int I, F, G, O, M, T;
    uint64_t seed;
    int N, base_ff, base_g;

    std::vector<int> order, pos, newSig;
    std::vector<int> pin0, pin1, pin2;
    std::vector<uint8_t> ptype;
    std::vector<int> ffsrc, outsrc;
    std::vector<uint64_t> mixv;
    std::vector<uint64_t> state;
    std::vector<uint64_t> ffnext;
    std::vector<uint64_t> result;

    void build(const Circuit& c) {
        I = c.I; F = c.F; G = c.G; O = c.O; M = c.M; T = c.T; seed = c.seed;
        base_ff = I + 2;
        base_g = I + F + 2;
        N = base_g + G;

        // indegree (number of gate inputs) and consumers CSR (outdegree)
        std::vector<int> indeg(G, 0);
        std::vector<int> cnt(G + 1, 0);
        for (int k = 0; k < G; k++) {
            int d = 0;
            if (c.in0[k] >= base_g) d++;
            if (c.in1[k] >= base_g) d++;
            if (c.in2[k] >= base_g) d++;
            indeg[k] = d;
        }
        for (int k = 0; k < G; k++) {
            if (c.in0[k] >= base_g) cnt[c.in0[k] - base_g + 1]++;
            if (c.in1[k] >= base_g) cnt[c.in1[k] - base_g + 1]++;
            if (c.in2[k] >= base_g) cnt[c.in2[k] - base_g + 1]++;
        }
        for (int k = 0; k < G; k++) cnt[k + 1] += cnt[k];
        std::vector<int> cons(cnt[G]);
        {
            std::vector<int> fill(cnt.begin(), cnt.end() - 1);
            for (int k = 0; k < G; k++) {
                int a = c.in0[k], b = c.in1[k], cc = c.in2[k];
                if (a >= base_g) cons[fill[a - base_g]++] = k;
                if (b >= base_g) cons[fill[b - base_g]++] = k;
                if (cc >= base_g) cons[fill[cc - base_g]++] = k;
            }
        }
        // Kahn
        order.resize(G);
        pos.assign(G, 0);
        {
            std::vector<int> q(G);
            int qh = 0, qt = 0;
            for (int k = 0; k < G; k++) if (indeg[k] == 0) q[qt++] = k;
            int p = 0;
            while (qh < qt) {
                int k = q[qh++];
                order[p] = k; pos[k] = p; p++;
                for (int e = cnt[k]; e < cnt[k + 1]; e++) {
                    int u = cons[e];
                    if (--indeg[u] == 0) q[qt++] = u;
                }
            }
        }
        // new signal indices
        newSig.assign(N, 0);
        for (int s = 0; s < base_g; s++) newSig[s] = s;
        for (int k = 0; k < G; k++) newSig[base_g + k] = base_g + pos[k];
        // program
        pin0.resize(G); pin1.resize(G); pin2.resize(G); ptype.resize(G);
        for (int p = 0; p < G; p++) {
            int k = order[p];
            int a = c.in0[k], b = c.in1[k], cc = c.in2[k];
            pin0[p] = (a >= 0 ? newSig[a] : 0);
            pin1[p] = (b >= 0 ? newSig[b] : 0);
            pin2[p] = (cc >= 0 ? newSig[cc] : 0);
            ptype[p] = c.type[k];
        }
        ffsrc.resize(F);
        for (int f = 0; f < F; f++) ffsrc[f] = newSig[c.d[f]];
        outsrc.resize(O);
        for (int j = 0; j < O; j++) outsrc[j] = newSig[c.out[j]];
        mixv.resize((size_t)T * O);
        for (int i = 0; i < T * O; i++) mixv[i] = mix64((uint64_t)i);
    }

    void run_task(int task, int groups, int nth) {
        const int VECLANES = 4;
        uint64_t* st = state.data() + (size_t)task * N * VECLANES;
        uint64_t* ffn = ffnext.data() + (size_t)task * F * VECLANES;
        uint64_t* H = result.data() + (size_t)task * 256;

        const __m256i ones = _mm256_set1_epi32(-1);
        const __m256i zero = _mm256_setzero_si256();

        for (int j = 0; j < VECLANES; j++) {
            st[0 * VECLANES + j] = 0;
            st[1 * VECLANES + j] = ~0ull;
        }
        std::memset(st + (size_t)base_ff * VECLANES, 0, (size_t)F * VECLANES * sizeof(uint64_t));
        std::memset(st + (size_t)2 * VECLANES, 0, (size_t)I * VECLANES * sizeof(uint64_t));

        uint64_t s[256];
        uint64_t base = (uint64_t)task * 256;
        for (int i = 0; i < 256; i++) s[i] = mix64(seed ^ (base + (uint64_t)i));
        for (int i = 0; i < 256; i++) H[i] = 0;

        uint64_t rw[256];
        uint64_t tmp[64];
        const int* __restrict p0 = pin0.data();
        const int* __restrict p1 = pin1.data();
        const int* __restrict p2 = pin2.data();
        const uint8_t* __restrict pt = ptype.data();

        for (int t = 0; t < T; t++) {
            for (int i = 0; i < 256; i++) rw[i] = splitmix64_next(&s[i]);
            for (int j = 0; j < VECLANES; j++) {
                for (int m = 0; m < 64; m++) tmp[m] = rw[j * 64 + m];
                transpose64(tmp);
                uint64_t* dst = st + (size_t)2 * VECLANES + (size_t)j;
                for (int i = 0; i < I; i++) dst[(size_t)i * VECLANES] = tmp[i];
            }
            // gates
            for (int p = 0; p < G; p++) {
                __m256i a = _mm256_loadu_si256((const __m256i*)(st + (size_t)p0[p] * VECLANES));
                __m256i b = _mm256_loadu_si256((const __m256i*)(st + (size_t)p1[p] * VECLANES));
                __m256i o;
                switch (pt[p]) {
                    case 0: o = _mm256_and_si256(a, b); break;
                    case 1: o = _mm256_or_si256(a, b); break;
                    case 2: o = _mm256_xor_si256(a, b); break;
                    case 3: o = _mm256_xor_si256(_mm256_and_si256(a, b), ones); break;
                    case 4: o = _mm256_xor_si256(_mm256_or_si256(a, b), ones); break;
                    case 5: o = _mm256_xor_si256(_mm256_xor_si256(a, b), ones); break;
                    case 6: o = _mm256_xor_si256(a, ones); break;
                    default: {
                        __m256i cc = _mm256_loadu_si256((const __m256i*)(st + (size_t)p2[p] * VECLANES));
                        o = _mm256_xor_si256(b, _mm256_and_si256(a, _mm256_xor_si256(b, cc)));
                        break;
                    }
                }
                _mm256_storeu_si256((__m256i*)(st + (size_t)(base_g + p) * VECLANES), o);
            }
            // FF update
            for (int f = 0; f < F; f++) {
                __m256i v = _mm256_loadu_si256((const __m256i*)(st + (size_t)ffsrc[f] * VECLANES));
                _mm256_storeu_si256((__m256i*)(ffn + (size_t)f * VECLANES), v);
            }
            std::memcpy(st + (size_t)base_ff * VECLANES, ffn, (size_t)F * VECLANES * sizeof(uint64_t));
            // digest
            const uint64_t* mv = mixv.data() + (size_t)t * O;
            for (int j = 0; j < O; j++) {
                uint64_t mj = mv[j];
                int src = outsrc[j];
                __m256i mjv = _mm256_set1_epi64x((long long)mj);
                for (int jg = 0; jg < VECLANES; jg++) {
                    uint64_t w = st[(size_t)src * VECLANES + jg];
                    uint64_t* hbase = H + jg * 64;
                    for (int v = 0; v < 16; v++) {
                        unsigned nib = (unsigned)((w >> (4 * v)) & 15);
                        __m256i mask = nibmask[nib];
                        __m256i h = _mm256_loadu_si256((__m256i*)(hbase + 4 * v));
                        h = _mm256_xor_si256(h, _mm256_and_si256(mask, mjv));
                        _mm256_storeu_si256((__m256i*)(hbase + 4 * v), h);
                    }
                }
            }
        }
        (void)groups; (void)nth;
    }

    static const __m256i nibmask[16];
};

const __m256i Solver::nibmask[16] = {
    _mm256_set_epi64x(0, 0, 0, 0),
    _mm256_set_epi64x(0, 0, 0, -1),
    _mm256_set_epi64x(0, 0, -1, 0),
    _mm256_set_epi64x(0, 0, -1, -1),
    _mm256_set_epi64x(0, -1, 0, 0),
    _mm256_set_epi64x(0, -1, 0, -1),
    _mm256_set_epi64x(0, -1, -1, 0),
    _mm256_set_epi64x(0, -1, -1, -1),
    _mm256_set_epi64x(-1, 0, 0, 0),
    _mm256_set_epi64x(-1, 0, 0, -1),
    _mm256_set_epi64x(-1, 0, -1, 0),
    _mm256_set_epi64x(-1, 0, -1, -1),
    _mm256_set_epi64x(-1, -1, 0, 0),
    _mm256_set_epi64x(-1, -1, 0, -1),
    _mm256_set_epi64x(-1, -1, -1, 0),
    _mm256_set_epi64x(-1, -1, -1, -1),
};

} // namespace

std::vector<uint64_t> simulate(const Circuit& c) {
    static Solver solver;
    solver.build(c);
    int groups = (c.M + 63) / 64;
    int tasks = (groups + 3) / 4;
    if (tasks < 1) tasks = 1;
    size_t words = (size_t)tasks * solver.N * 4;
    if (solver.state.size() < words) solver.state.resize(words);
    if (solver.ffnext.size() < (size_t)tasks * c.F * 4) solver.ffnext.resize((size_t)tasks * c.F * 4);
    solver.result.assign((size_t)tasks * 256, 0);
    int nth = omp_get_max_threads();
    if (nth > tasks) nth = tasks;
    if (nth < 1) nth = 1;
#pragma omp parallel for num_threads(nth) schedule(static)
    for (int task = 0; task < tasks; task++) solver.run_task(task, groups, nth);
    solver.result.resize(c.M);
    return std::move(solver.result);
}

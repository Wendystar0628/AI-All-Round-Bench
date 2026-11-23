#include <cstdint>
#include <vector>
#include <algorithm>
#include <immintrin.h>
#ifdef _WIN32
#include <intrin.h>
#endif
#include <omp.h>

struct Circuit {
    int I, F, G, O, M, T;
    uint64_t seed;
    std::vector<int> d;
    std::vector<uint8_t> type;
    std::vector<int> in0, in1, in2;
    std::vector<int> out;
};

static inline int ctz64(uint64_t x) {
#ifdef _WIN32
    unsigned long idx;
    _BitScanForward64(&idx, x);
    return (int)idx;
#else
    return __builtin_ctzll(x);
#endif
}

static inline uint64_t splitmix64_next(uint64_t *s) {
    uint64_t z = (*s += 0x9E3779B97F4A7C15ULL);
    z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9ULL;
    z = (z ^ (z >> 27)) * 0x94D049BB133111EBULL;
    return z ^ (z >> 31);
}

static inline uint64_t mix64(uint64_t x) {
    return splitmix64_next(&x);
}

#define LOAD4(p) _mm256_loadu_si256((const __m256i*)(p))
#define STORE4(p, v) _mm256_storeu_si256((__m256i*)(p), v)

std::vector<uint64_t> simulate(const Circuit& c) {
    int I = c.I, F = c.F, G = c.G, O = c.O, M = c.M, T = c.T;
    uint64_t seed = c.seed;
    int base = I + F + 2;
    int nsignals = base + G;
    int stride = 4;

    // Topological sort
    std::vector<int> indeg(G, 0);
    std::vector<int> outdeg(G, 0);
    for (int k = 0; k < G; k++) {
        int inputs[3] = {c.in0[k], c.in1[k], c.in2[k]};
        for (int inp : inputs) {
            if (inp >= base) { int g = inp - base; outdeg[g]++; indeg[k]++; }
        }
    }
    std::vector<int> offset(G + 1, 0);
    for (int k = 0; k < G; k++) offset[k+1] = offset[k] + outdeg[k];
    std::vector<int> edges(offset[G]);
    {
        std::vector<int> cur = offset;
        for (int k = 0; k < G; k++) {
            int inputs[3] = {c.in0[k], c.in1[k], c.in2[k]};
            for (int inp : inputs) {
                if (inp >= base) { int g = inp - base; edges[cur[g]++] = k; }
            }
        }
    }
    std::vector<int> order(G);
    {
        std::vector<int> queue(G);
        int qhead = 0, qtail = 0;
        for (int k = 0; k < G; k++) if (indeg[k] == 0) queue[qtail++] = k;
        int ord_idx = 0;
        while (qhead < qtail) {
            int k = queue[qhead++];
            order[ord_idx++] = k;
            for (int ei = offset[k]; ei < offset[k+1]; ei++) {
                int nxt = edges[ei];
                if (--indeg[nxt] == 0) queue[qtail++] = nxt;
            }
        }
    }

    int maxthreads = omp_get_max_threads();
    int nthreads = maxthreads;
    int min_threads = (M + 255) / 256;
    if (nthreads > min_threads) nthreads = min_threads;
    if (nthreads < 1) nthreads = 1;
    int chunk = (M + nthreads - 1) / nthreads;

    std::vector<uint64_t> H(M, 0);

    if (nthreads > 1) {
#pragma omp parallel num_threads(nthreads)
        {
            int tid = omp_get_thread_num();
            int start = tid * chunk;
            int end = std::min(start + chunk, M);
            int nvec = end - start;

            std::vector<uint64_t> val(nsignals * stride, 0);
            const __m256i zero = _mm256_setzero_si256();
            const __m256i ones = _mm256_set1_epi64x(-1);

            uint64_t nvec_words[4];
            for (int w = 0; w < 4; w++) {
                int lo = w * 64, hi = std::min(lo + 64, nvec);
                int cnt = hi - lo;
                nvec_words[w] = (cnt >= 64) ? ~0ULL : ((1ULL << cnt) - 1);
            }
            for (int w = 0; w < 4; w++) val[1 * stride + w] = nvec_words[w];

            std::vector<uint64_t> rng(nvec);
            for (int m = 0; m < nvec; m++) {
                uint64_t sm = seed ^ (uint64_t)(start + m);
                rng[m] = mix64(sm);
            }

            std::vector<uint64_t> new_ff(F * stride);

            for (int t = 0; t < T; t++) {
                uint64_t r[256];
                for (int m = 0; m < nvec; m++) r[m] = splitmix64_next(&rng[m]);

                for (int i = 0; i < I; i++) {
                    uint64_t words[4] = {0,0,0,0};
                    for (int m = 0; m < nvec; m++) {
                        words[m/64] |= ((r[m] >> i) & 1) << (m % 64);
                    }
                    uint64_t* p = &val[(2+i)*stride];
                    p[0]=words[0]; p[1]=words[1]; p[2]=words[2]; p[3]=words[3];
                }

                for (int k : order) {
                    int ty = c.type[k];
                    __m256i a = LOAD4(&val[c.in0[k]*stride]);
                    __m256i b = (c.in1[k] >= 0) ? LOAD4(&val[c.in1[k]*stride]) : zero;
                    __m256i result;
                    switch (ty) {
                        case 0: result = _mm256_and_si256(a, b); break;
                        case 1: result = _mm256_or_si256(a, b); break;
                        case 2: result = _mm256_xor_si256(a, b); break;
                        case 3: result = _mm256_xor_si256(_mm256_and_si256(a, b), ones); break;
                        case 4: result = _mm256_xor_si256(_mm256_or_si256(a, b), ones); break;
                        case 5: result = _mm256_xor_si256(_mm256_xor_si256(a, b), ones); break;
                        case 6: result = _mm256_xor_si256(a, ones); break;
                        case 7: {
                            __m256i b_data = LOAD4(&val[c.in2[k]*stride]);
                            result = _mm256_or_si256(_mm256_and_si256(a, b_data), _mm256_andnot_si256(a, b));
                            break;
                        }
                    }
                    STORE4(&val[(base+k)*stride], result);
                }

                __m256i nmask = _mm256_set_epi64x(nvec_words[3], nvec_words[2], nvec_words[1], nvec_words[0]);
                for (int j = 0; j < O; j++) {
                    __m256i outval = _mm256_and_si256(LOAD4(&val[c.out[j]*stride]), nmask);
                    uint64_t V = mix64((uint64_t)t * O + j);
                    uint64_t words[4];
                    _mm256_storeu_si256((__m256i*)words, outval);
                    for (int w = 0; w < 4; w++) {
                        uint64_t x = words[w];
                        while (x) {
                            int b = ctz64(x);
                            H[start + w*64 + b] ^= V;
                            x &= x - 1;
                        }
                    }
                }

                for (int f = 0; f < F; f++) {
                    __m256i v = LOAD4(&val[c.d[f]*stride]);
                    STORE4(&new_ff[f*stride], v);
                }
                for (int f = 0; f < F; f++) {
                    for (int w = 0; w < 4; w++) {
                        val[(I+2+f)*stride + w] = new_ff[f*stride + w];
                    }
                }
            }
        }
    } else {
        int start = 0, end = M, nvec = M;

        std::vector<uint64_t> val(nsignals * stride, 0);
        const __m256i zero = _mm256_setzero_si256();
        const __m256i ones = _mm256_set1_epi64x(-1);

        uint64_t nvec_words[4];
        for (int w = 0; w < 4; w++) {
            int lo = w * 64, hi = std::min(lo + 64, nvec);
            int cnt = hi - lo;
            nvec_words[w] = (cnt >= 64) ? ~0ULL : ((1ULL << cnt) - 1);
        }
        for (int w = 0; w < 4; w++) val[1 * stride + w] = nvec_words[w];

        std::vector<uint64_t> rng(nvec);
        for (int m = 0; m < nvec; m++) {
            uint64_t sm = seed ^ (uint64_t)m;
            rng[m] = mix64(sm);
        }

        std::vector<uint64_t> new_ff(F * stride);

        for (int t = 0; t < T; t++) {
            uint64_t r[256];
            for (int m = 0; m < nvec; m++) r[m] = splitmix64_next(&rng[m]);

            for (int i = 0; i < I; i++) {
                uint64_t words[4] = {0,0,0,0};
                for (int m = 0; m < nvec; m++) {
                    words[m/64] |= ((r[m] >> i) & 1) << (m % 64);
                }
                uint64_t* p = &val[(2+i)*stride];
                p[0]=words[0]; p[1]=words[1]; p[2]=words[2]; p[3]=words[3];
            }

            for (int k : order) {
                int ty = c.type[k];
                __m256i a = LOAD4(&val[c.in0[k]*stride]);
                __m256i b = (c.in1[k] >= 0) ? LOAD4(&val[c.in1[k]*stride]) : zero;
                __m256i result;
                switch (ty) {
                    case 0: result = _mm256_and_si256(a, b); break;
                    case 1: result = _mm256_or_si256(a, b); break;
                    case 2: result = _mm256_xor_si256(a, b); break;
                    case 3: result = _mm256_xor_si256(_mm256_and_si256(a, b), ones); break;
                    case 4: result = _mm256_xor_si256(_mm256_or_si256(a, b), ones); break;
                    case 5: result = _mm256_xor_si256(_mm256_xor_si256(a, b), ones); break;
                    case 6: result = _mm256_xor_si256(a, ones); break;
                    case 7: {
                        __m256i b_data = LOAD4(&val[c.in2[k]*stride]);
                        result = _mm256_or_si256(_mm256_and_si256(a, b_data), _mm256_andnot_si256(a, b));
                        break;
                    }
                }
                STORE4(&val[(base+k)*stride], result);
            }

            __m256i nmask = _mm256_set_epi64x(nvec_words[3], nvec_words[2], nvec_words[1], nvec_words[0]);
            for (int j = 0; j < O; j++) {
                __m256i outval = _mm256_and_si256(LOAD4(&val[c.out[j]*stride]), nmask);
                uint64_t V = mix64((uint64_t)t * O + j);
                uint64_t words[4];
                _mm256_storeu_si256((__m256i*)words, outval);
                for (int w = 0; w < 4; w++) {
                    uint64_t x = words[w];
                    while (x) {
                        int b = ctz64(x);
                        H[w*64 + b] ^= V;
                        x &= x - 1;
                    }
                }
            }

            for (int f = 0; f < F; f++) {
                __m256i v = LOAD4(&val[c.d[f]*stride]);
                STORE4(&new_ff[f*stride], v);
            }
            for (int f = 0; f < F; f++) {
                for (int w = 0; w < 4; w++) {
                    val[(I+2+f)*stride + w] = new_ff[f*stride + w];
                }
            }
        }
    }

    return H;
}
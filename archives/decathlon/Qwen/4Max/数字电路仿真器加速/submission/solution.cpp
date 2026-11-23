#include <cstdint>
#include <vector>
#include <array>
#include <cstring>
#include <cstdio>
#include <cstdlib>
#include <algorithm>
#include <immintrin.h>
#include <omp.h>
#include <malloc.h>

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

static constexpr int16_t SENT = -32768;

std::vector<uint64_t> simulate(const Circuit& c) {
    const int I = c.I, F = c.F, G = c.G, O = c.O, M = c.M, T = c.T;
    const int gbase = I + F + 2;
    const int NS = gbase + G;

    // ---- topological sort (Kahn) ----
    std::vector<int> indeg(G, 0);
    std::vector<std::array<int, 3>> gin(G);
    std::vector<std::vector<int>> fout(G);
    for (int k = 0; k < G; k++) {
        int s[3] = {c.in0[k], c.in1[k], c.in2[k]};
        int n = c.type[k] == 6 ? 1 : (c.type[k] == 7 ? 3 : 2);
        int cnt = 0;
        for (int i = 0; i < n; i++) {
            if (s[i] >= gbase) {
                int j = s[i] - gbase;
                bool dup = false;
                for (int q = 0; q < cnt; q++) if (gin[k][q] == j) dup = true;
                if (!dup) { gin[k][cnt++] = j; fout[j].push_back(k); indeg[k]++; }
            }
        }
        for (int i = cnt; i < 3; i++) gin[k][i] = -1;
    }
    std::vector<int> order; order.reserve(G);
    {
        std::vector<int> q; q.reserve(G);
        for (int k = 0; k < G; k++) if (!indeg[k]) q.push_back(k);
        for (size_t h = 0; h < q.size(); h++) {
            int k = q[h]; order.push_back(k);
            for (int nk : fout[k]) if (--indeg[nk] == 0) q.push_back(nk);
        }
    }
    std::vector<int> newpos(G);
    for (int p = 0; p < G; p++) newpos[order[p]] = p;

    // ---- compact program with ring-buffer locality ----
    constexpr int RING = 1024, RMASK = RING - 1;
    std::vector<uint8_t> spill(G, 0);
    for (int p = 0; p < G; p++) {
        int k = order[p];
        int s[3] = {c.in0[k], c.in1[k], c.in2[k]};
        int n = c.type[k] == 6 ? 1 : (c.type[k] == 7 ? 3 : 2);
        for (int i = 0; i < n; i++)
            if (s[i] >= gbase) { int q = newpos[s[i] - gbase]; if (p - q >= RING) spill[q] = 1; }
    }
    for (int f = 0; f < F; f++) if (c.d[f] >= gbase) spill[newpos[c.d[f] - gbase]] = 1;
    for (int j = 0; j < O; j++) if (c.out[j] >= gbase) spill[newpos[c.out[j] - gbase]] = 1;

    // a,b stored as int16: >=0 -> absolute signal (const/PI/FF); <0 -> gate back-ref.
    std::vector<int16_t> pa(G), pb(G);
    std::vector<uint8_t> ptype(G);
    std::vector<int16_t> muxC; muxC.reserve(G / 4);
    std::vector<int32_t> farOff; farOff.reserve(G / 32);
    auto encode = [&](int sig, int p) -> int16_t {
        if (sig < gbase) return (int16_t)sig;
        int q = newpos[sig - gbase];
        int d = p - q;
        if (d <= 32766) return (int16_t)(-1 - d);
        farOff.push_back((gbase + q) * 32);
        return SENT;
    };
    for (int p = 0; p < G; p++) {
        int k = order[p];
        ptype[p] = c.type[k] | (spill[p] ? 8 : 0);
        pa[p] = encode(c.in0[k], p);
        pb[p] = encode(c.in1[k], p);
        if (c.type[k] == 7) muxC.push_back(encode(c.in2[k], p));
    }
    std::vector<int32_t> doff(F), ooff(O);
    auto remap = [&](int s) -> int { return s < gbase ? s : gbase + newpos[s - gbase]; };
    for (int f = 0; f < F; f++) doff[f] = remap(c.d[f]) * 32;
    for (int j = 0; j < O; j++) ooff[j] = remap(c.out[j]) * 32;

    // ---- mix64 constants ----
    std::vector<uint64_t> mixv((size_t)T * O);
    for (int t = 0; t < T; t++)
        for (int j = 0; j < O; j++)
            mixv[(size_t)t * O + j] = mix64((uint64_t)t * O + j);

    // ---- transposed primary inputs ----
    const int MW = ((M + 255) / 256) * 4;
    std::vector<uint64_t> PI_all((size_t)T * I * MW, 0);
    const int NSUP = (M + 255) / 256;
    #pragma omp parallel for schedule(static)
    for (int g = 0; g < NSUP; g++) {
        int m0 = g * 256;
        int cnt = std::min(256, M - m0);
        uint64_t st[256];
        for (int m = 0; m < cnt; m++) st[m] = mix64(c.seed ^ (uint64_t)(m0 + m));
        for (int t = 0; t < T; t++) {
            uint64_t* dst = &PI_all[(size_t)t * I * MW + (m0 / 64)];
            for (int m = 0; m < cnt; m++) {
                uint64_t r = splitmix64_next(&st[m]);
                int w = m / 64, b = m % 64;
                for (int i = 0; i < I; i++)
                    if ((r >> i) & 1) dst[(size_t)i * MW + w] |= (1ULL << b);
            }
        }
    }

    std::vector<uint64_t> H(M, 0);
    const size_t VALBYTES = (size_t)NS * 32;
    const int16_t* PA = pa.data(); const int16_t* PB = pb.data();
    const uint8_t* PT = ptype.data(); const int16_t* MC = muxC.data();
    const int32_t* FO = farOff.data();

    #pragma omp parallel
    {
        thread_local char* valptr = nullptr;
        thread_local size_t valcap = 0;
        if (valcap < VALBYTES) {
            if (valptr) _aligned_free(valptr);
            valptr = (char*)_aligned_malloc(VALBYTES, 64);
            valcap = VALBYTES;
        }
        char* val = valptr;
        __m256i* V = (__m256i*)val;
        thread_local char* ringptr = nullptr;
        if (!ringptr) ringptr = (char*)_aligned_malloc((size_t)RING * 32, 64);
        char* ring = ringptr;
        std::vector<char> ffnext((size_t)F * 32);

        #pragma omp for schedule(static)
        for (int g = 0; g < NSUP; g++) {
            int m0 = g * 256;
            int cnt = std::min(256, M - m0);
            _mm256_store_si256(V + 0, _mm256_setzero_si256());
            _mm256_store_si256(V + 1, _mm256_set1_epi64x(-1));
            std::memset(val + (size_t)(I + 2) * 32, 0, (size_t)F * 32);
            uint64_t Hloc[256];
            for (int m = 0; m < 256; m++) Hloc[m] = 0;

            const uint64_t* pibase = &PI_all[(size_t)(m0 / 64)];
            for (int t = 0; t < T; t++) {
                const uint64_t* pt = pibase + (size_t)t * I * MW;
                for (int i = 0; i < I; i++)
                    _mm256_store_si256(V + (2 + i), _mm256_loadu_si256((const __m256i*)(pt + (size_t)i * MW)));

                const __m256i ONES = _mm256_set1_epi64x(-1);
                int fc = 0, mc = 0;
                const int gb = gbase;
                auto dec = [&](int16_t e, int p) -> const char* {
                    if (e >= 0) return val + (int)e * 32;
                    if (e != SENT) { int q = p + (int)e + 1; return (p - q) < RING ? ring + (q & RMASK) * 32 : val + (gb + q) * 32; }
                    return val + FO[fc++];
                };
                for (int p = 0; p < G; p++) {
                    uint8_t ty = PT[p];
                    __m256i a = _mm256_load_si256((const __m256i*)dec(PA[p], p));
                    __m256i r;
                    switch (ty & 7) {
                        case 0: r = _mm256_and_si256(a, _mm256_load_si256((const __m256i*)dec(PB[p], p))); break;
                        case 1: r = _mm256_or_si256(a, _mm256_load_si256((const __m256i*)dec(PB[p], p))); break;
                        case 2: r = _mm256_xor_si256(a, _mm256_load_si256((const __m256i*)dec(PB[p], p))); break;
                        case 3: r = _mm256_andnot_si256(_mm256_and_si256(a, _mm256_load_si256((const __m256i*)dec(PB[p], p))), ONES); break;
                        case 4: r = _mm256_andnot_si256(_mm256_or_si256(a, _mm256_load_si256((const __m256i*)dec(PB[p], p))), ONES); break;
                        case 5: r = _mm256_xor_si256(_mm256_xor_si256(a, _mm256_load_si256((const __m256i*)dec(PB[p], p))), ONES); break;
                        case 6: r = _mm256_xor_si256(a, ONES); break;
                        default: {
                            __m256i aa = _mm256_load_si256((const __m256i*)dec(PB[p], p));
                            __m256i b = _mm256_load_si256((const __m256i*)dec(MC[mc++], p));
                            r = _mm256_xor_si256(aa, _mm256_and_si256(_mm256_xor_si256(aa, b), a));
                            break;
                        }
                    }
                    _mm256_store_si256((__m256i*)(ring + (p & RMASK) * 32), r);
                    if (ty & 8) _mm256_store_si256((__m256i*)(val + (gb + p) * 32), r);
                }
                // digest
                const uint64_t* mv = &mixv[(size_t)t * O];
                for (int j = 0; j < O; j++) {
                    const uint64_t* w = (const uint64_t*)(val + ooff[j]);
                    uint64_t cc = mv[j];
                    for (int q = 0; q < 4; q++) {
                        uint64_t x = w[q];
                        while (x) { int b = __builtin_ctzll(x); Hloc[q * 64 + b] ^= cc; x &= x - 1; }
                    }
                }
                // FF update
                char* fn = ffnext.data();
                for (int f = 0; f < F; f++)
                    _mm256_storeu_si256((__m256i*)(fn + (size_t)f * 32), _mm256_load_si256((const __m256i*)(val + doff[f])));
                std::memcpy(val + (size_t)(I + 2) * 32, fn, (size_t)F * 32);
            }
            for (int m = 0; m < cnt; m++) H[m0 + m] = Hloc[m];
        }
    }
    return H;
}

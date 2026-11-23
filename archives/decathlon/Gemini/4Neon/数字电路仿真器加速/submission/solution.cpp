#include <immintrin.h>
#include <omp.h>
#ifdef _WIN32
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#endif

#include <algorithm>
#include <array>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <limits>
#include <memory>
#include <vector>

struct Circuit {
    int I, F, G, O, M, T;
    uint64_t seed;
    std::vector<int> d;
    std::vector<uint8_t> type;
    std::vector<int> in0, in1, in2;
    std::vector<int> out;
};

namespace {

static inline uint64_t splitmix64_next(uint64_t* s) {
    uint64_t z = (*s += 0x9E3779B97F4A7C15ULL);
    z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9ULL;
    z = (z ^ (z >> 27)) * 0x94D049BB133111EBULL;
    return z ^ (z >> 31);
}

static inline uint64_t mix64(uint64_t x) {
    return splitmix64_next(&x);
}

static inline void transpose64x64(uint64_t* a) {
    uint64_t t;
    for (int i = 0; i < 64; i += 2) {
        t = (a[i] ^ (a[i + 1] << 1)) & 0xAAAAAAAAAAAAAAAAULL;
        a[i] ^= t;
        a[i + 1] ^= (t >> 1);
    }
    for (int i = 0; i < 64; i += 4) {
        for (int j = 0; j < 2; j++) {
            t = (a[i + j] ^ (a[i + j + 2] << 2)) & 0xCCCCCCCCCCCCCCCCULL;
            a[i + j] ^= t;
            a[i + j + 2] ^= (t >> 2);
        }
    }
    for (int i = 0; i < 64; i += 8) {
        for (int j = 0; j < 4; j++) {
            t = (a[i + j] ^ (a[i + j + 4] << 4)) & 0xF0F0F0F0F0F0F0F0ULL;
            a[i + j] ^= t;
            a[i + j + 4] ^= (t >> 4);
        }
    }
    for (int i = 0; i < 64; i += 16) {
        for (int j = 0; j < 8; j++) {
            t = (a[i + j] ^ (a[i + j + 8] << 8)) & 0xFF00FF00FF00FF00ULL;
            a[i + j] ^= t;
            a[i + j + 8] ^= (t >> 8);
        }
    }
    for (int i = 0; i < 64; i += 32) {
        for (int j = 0; j < 16; j++) {
            t = (a[i + j] ^ (a[i + j + 16] << 16)) & 0xFFFF0000FFFF0000ULL;
            a[i + j] ^= t;
            a[i + j + 16] ^= (t >> 16);
        }
    }
    for (int j = 0; j < 32; j++) {
        t = (a[j] ^ (a[j + 32] << 32)) & 0xFFFFFFFF00000000ULL;
        a[j] ^= t;
        a[j + 32] ^= (t >> 32);
    }
}

// 4-way parallel 8x8 bit matrix transpose in one __m256i
static inline __m256i transpose8x8_x4(__m256i x) {
    const __m256i m1 = _mm256_set1_epi64x(0x00AA00AA00AA00AAULL);
    __m256i t = _mm256_and_si256(_mm256_xor_si256(x, _mm256_srli_epi64(x, 7)), m1);
    x = _mm256_xor_si256(x, _mm256_xor_si256(t, _mm256_slli_epi64(t, 7)));

    const __m256i m2 = _mm256_set1_epi64x(0x0000CCCC0000CCCCULL);
    t = _mm256_and_si256(_mm256_xor_si256(x, _mm256_srli_epi64(x, 14)), m2);
    x = _mm256_xor_si256(x, _mm256_xor_si256(t, _mm256_slli_epi64(t, 14)));

    const __m256i m3 = _mm256_set1_epi64x(0x00000000F0F0F0F0ULL);
    t = _mm256_and_si256(_mm256_xor_si256(x, _mm256_srli_epi64(x, 28)), m3);
    x = _mm256_xor_si256(x, _mm256_xor_si256(t, _mm256_slli_epi64(t, 28)));
    return x;
}

// Pack 8 bit-sliced 256-bit vectors (v0..v7) into 256 natural-order bytes out[0..255]
// where bit k of out[m] equals bit m of v[k].
static inline void pack8_vecs_to_u8(const __m256i v[8], uint8_t* out) {
    __m256i a0 = _mm256_unpacklo_epi8(v[0], v[1]);
    __m256i a1 = _mm256_unpackhi_epi8(v[0], v[1]);
    __m256i a2 = _mm256_unpacklo_epi8(v[2], v[3]);
    __m256i a3 = _mm256_unpackhi_epi8(v[2], v[3]);
    __m256i a4 = _mm256_unpacklo_epi8(v[4], v[5]);
    __m256i a5 = _mm256_unpackhi_epi8(v[4], v[5]);
    __m256i a6 = _mm256_unpacklo_epi8(v[6], v[7]);
    __m256i a7 = _mm256_unpackhi_epi8(v[6], v[7]);

    __m256i b0 = _mm256_unpacklo_epi16(a0, a2);
    __m256i b1 = _mm256_unpackhi_epi16(a0, a2);
    __m256i b2 = _mm256_unpacklo_epi16(a1, a3);
    __m256i b3 = _mm256_unpackhi_epi16(a1, a3);
    __m256i b4 = _mm256_unpacklo_epi16(a4, a6);
    __m256i b5 = _mm256_unpackhi_epi16(a4, a6);
    __m256i b6 = _mm256_unpacklo_epi16(a5, a7);
    __m256i b7 = _mm256_unpackhi_epi16(a5, a7);

    __m256i c[8];
    c[0] = transpose8x8_x4(_mm256_unpacklo_epi32(b0, b4));
    c[1] = transpose8x8_x4(_mm256_unpackhi_epi32(b0, b4));
    c[2] = transpose8x8_x4(_mm256_unpacklo_epi32(b1, b5));
    c[3] = transpose8x8_x4(_mm256_unpackhi_epi32(b1, b5));
    c[4] = transpose8x8_x4(_mm256_unpacklo_epi32(b2, b6));
    c[5] = transpose8x8_x4(_mm256_unpackhi_epi32(b2, b6));
    c[6] = transpose8x8_x4(_mm256_unpacklo_epi32(b3, b7));
    c[7] = transpose8x8_x4(_mm256_unpackhi_epi32(b3, b7));

    for (int i = 0; i < 8; i++) {
        _mm_storeu_si128(reinterpret_cast<__m128i*>(out + i * 16), _mm256_castsi256_si128(c[i]));
        _mm_storeu_si128(reinterpret_cast<__m128i*>(out + 128 + i * 16), _mm256_extracti128_si256(c[i], 1));
    }
}

static std::vector<uint64_t> simulate_small(const Circuit& c) {
    const int I = c.I, F = c.F, G = c.G, O = c.O, M = c.M, T = c.T;
    std::vector<uint64_t> ans(M, 0);
    if (M <= 0 || T <= 0 || O <= 0) return ans;

    const int ff_base = 2 + I;
    const int g_base = 2 + I + F;
    const int N = g_base + G;

    std::vector<int> indeg(G, 0), head(G, -1), to, nxt;
    to.reserve((size_t)G * 2);
    nxt.reserve((size_t)G * 2);
    auto add_edge = [&](int u, int v) {
        to.push_back(v);
        nxt.push_back(head[u]);
        head[u] = (int)to.size() - 1;
    };
    for (int g = 0; g < G; g++) {
        int a = c.in0[g], b = c.in1[g], k = c.in2[g];
        if (a >= g_base) { indeg[g]++; add_edge(a - g_base, g); }
        if (b >= g_base) { indeg[g]++; add_edge(b - g_base, g); }
        if (k >= g_base) { indeg[g]++; add_edge(k - g_base, g); }
    }
    std::vector<int> order;
    order.reserve(G);
    for (int g = 0; g < G; g++) if (indeg[g] == 0) order.push_back(g);
    for (size_t qi = 0; qi < order.size(); qi++) {
        int u = order[qi];
        for (int e = head[u]; e != -1; e = nxt[e]) {
            int v = to[e];
            if (--indeg[v] == 0) order.push_back(v);
        }
    }

    std::vector<uint64_t> hash_tbl((size_t)T * O);
    for (int t = 0; t < T; t++)
        for (int j = 0; j < O; j++)
            hash_tbl[(size_t)t * O + j] = mix64((uint64_t)t * (uint64_t)O + (uint64_t)j);

    std::vector<uint64_t> val(N, 0), next_ff(F, 0);
    for (int m0 = 0; m0 < M; m0 += 64) {
        int cnt = std::min(64, M - m0);
        uint64_t rng[64];
        for (int b = 0; b < cnt; b++) rng[b] = mix64(c.seed ^ (uint64_t)(m0 + b));
        for (int b = cnt; b < 64; b++) rng[b] = 0;

        val[0] = 0ULL;
        val[1] = ~0ULL;
        for (int f = 0; f < F; f++) val[ff_base + f] = 0ULL;

        uint64_t acc[64] = {};
        for (int t = 0; t < T; t++) {
            uint64_t pis[64] = {};
            for (int b = 0; b < cnt; b++) pis[b] = splitmix64_next(&rng[b]);
            transpose64x64(pis);
            for (int i = 0; i < I; i++) val[2 + i] = pis[i];

            for (int g : order) {
                uint8_t tp = c.type[g];
                uint64_t a = val[c.in0[g]];
                uint64_t b = (tp != 6) ? val[c.in1[g]] : 0ULL;
                uint64_t r = 0;
                switch (tp) {
                    case 0: r = a & b; break;
                    case 1: r = a | b; break;
                    case 2: r = a ^ b; break;
                    case 3: r = ~(a & b); break;
                    case 4: r = ~(a | b); break;
                    case 5: r = ~(a ^ b); break;
                    case 6: r = ~a; break;
                    case 7: r = (val[c.in1[g]] & ~a) | (val[c.in2[g]] & a); break;
                }
                val[g_base + g] = r;
            }
            const uint64_t* ht = &hash_tbl[(size_t)t * O];
            for (int j = 0; j < O; j++) {
                uint64_t bits = val[c.out[j]];
                if (cnt < 64) bits &= ((1ULL << cnt) - 1ULL);
                uint64_t hv = ht[j];
                while (bits) {
                    int b = __builtin_ctzll(bits);
                    acc[b] ^= hv;
                    bits &= bits - 1;
                }
            }
            for (int f = 0; f < F; f++) next_ff[f] = val[c.d[f]];
            for (int f = 0; f < F; f++) val[ff_base + f] = next_ff[f];
        }
        for (int b = 0; b < cnt; b++) ans[m0 + b] = acc[b];
    }
    return ans;
}

// ============================================================================
// Arithmetic Macro Extraction (Array Multipliers + Ripple-Carry Adders)
// ============================================================================
struct PairHash {
    struct Entry {
        uint64_t key; // ((uint64_t)a << 32) | b, 0xFFFFFFFFFFFFFFFF = empty
        int32_t gate;
    };
    std::vector<Entry> tab;
    uint32_t mask = 0;

    void init(size_t expected) {
        size_t sz = 1024;
        while (sz < expected * 2) sz <<= 1;
        tab.assign(sz, { ~0ULL, -1 });
        mask = (uint32_t)(sz - 1);
    }

    static inline uint32_t hfn(uint64_t k) {
        k ^= k >> 33;
        k *= 0xFF51AFD7ED558CCDULL;
        k ^= k >> 33;
        return (uint32_t)k;
    }

    inline void insert(int a, int b, int32_t g) {
        if (a > b) std::swap(a, b);
        uint64_t k = ((uint64_t)(uint32_t)a << 32) | (uint32_t)b;
        uint32_t idx = hfn(k) & mask;
        while (tab[idx].key != ~0ULL) {
            if (tab[idx].key == k) return; // keep first
            idx = (idx + 1) & mask;
        }
        tab[idx] = { k, g };
    }

    inline int32_t find(int a, int b) const {
        if (a > b) std::swap(a, b);
        uint64_t k = ((uint64_t)(uint32_t)a << 32) | (uint32_t)b;
        uint32_t idx = hfn(k) & mask;
        while (tab[idx].key != ~0ULL) {
            if (tab[idx].key == k) return tab[idx].gate;
            idx = (idx + 1) & mask;
        }
        return -1;
    }
};

// Tap kinds: 0=PP, 1=SUM, 2=COUT, 3=X1, 4=C1, 5=C2
struct ArithTap {
    uint8_t row;   // 0..W-1 for ArrayMult, 0 for WordAdd
    uint8_t bit;   // 0..W-1
    uint8_t kind;  // 0..5
    int32_t mout_idx; // index into macro_out[] slots
    int32_t orig_sig; // original signal id in Circuit
};

struct ArithMacro {
    uint8_t kind; // 0 = ArrayMult (WxW), 1 = WordAdd (W-bit)
    uint8_t W;
    std::vector<int32_t> inA_sig; // size W (original circuit sigs)
    std::vector<int32_t> inB_sig; // size W (original circuit sigs)
    std::vector<ArithTap> taps;   // sorted by (row, kind, bit)
    struct InRef {
        int32_t disp;
        uint8_t is_ff;
        uint8_t inv;
    };
    struct FastTap {
        int32_t out_disp;
        uint16_t buf_idx;
        uint8_t is_ff_nxt; // 0 = state_base + out_disp, 1 = ff_nxt + out_disp
    };
    std::vector<InRef> inA_ref;
    std::vector<InRef> inB_ref;
    std::vector<FastTap> fast_taps;
    std::vector<uint8_t> row_tap_mask;
    std::vector<int32_t> row_tap_start;
};

struct ArithExtractResult {
    bool active = false;
    std::vector<ArithMacro> macros;
    std::vector<int32_t> gate_owner;     // size G: macro_id or -1
    std::vector<int32_t> sig_to_mout;    // size N: mout_idx or -1
    int num_mouts = 0;
};

static ArithExtractResult extract_arith_macros(const Circuit& c) {
    ArithExtractResult res;
    const int I = c.I, F = c.F, G = c.G;
    if (G < 1000) return res;

    int cnt_aox = 0, cnt_xor = 0, cnt_and = 0;
    for (int g = 0; g < G; g++) {
        uint8_t t = c.type[g];
        if (t == 0) { cnt_and++; cnt_aox++; }
        else if (t == 1) cnt_aox++;
        else if (t == 2) { cnt_xor++; cnt_aox++; }
    }
    if (cnt_aox < (G * 7) / 10 || cnt_xor < 500 || cnt_and < 500) return res;

    const int g_base = 2 + I + F;
    const int N = g_base + G;

    PairHash xor_map, and_map;
    xor_map.init(cnt_xor + 64);
    and_map.init(cnt_and + 64);
    for (int g = 0; g < G; g++) {
        uint8_t t = c.type[g];
        if (t == 2) xor_map.insert(c.in0[g], c.in1[g], g);
        else if (t == 0) and_map.insert(c.in0[g], c.in1[g], g);
    }

    struct Cell {
        uint8_t is_fa;
        int32_t a, b, cin;
        int32_t sum_g, cout_g, x1_g, c1_g, c2_g;
    };
    std::vector<Cell> cells;
    cells.reserve(cnt_xor / 2 + 1024);
    std::vector<uint8_t> used_cell(G, 0);

    // 1. Identify exact FAs
    for (int g = 0; g < G; g++) {
        if (c.type[g] != 1) continue; // OR
        int u = c.in0[g], v = c.in1[g];
        if (u < g_base || v < g_base) continue;
        int gu = u - g_base, gv = v - g_base;
        if (c.type[gu] != 0 || c.type[gv] != 0) continue;
        if (used_cell[gu] || used_cell[gv] || gu == gv) continue;

        bool found = false;
        Cell cell{};
        for (int sw = 0; sw < 2 && !found; sw++) {
            int c1_g = sw ? gv : gu;
            int c2_g = sw ? gu : gv;
            int a = c.in0[c1_g], b = c.in1[c1_g];
            int p2[2] = { c.in0[c2_g], c.in1[c2_g] };
            for (int k = 0; k < 2 && !found; k++) {
                int x1_sig = p2[k], cin_sig = p2[1 - k];
                if (x1_sig < g_base) continue;
                int x1_g = x1_sig - g_base;
                if (c.type[x1_g] != 2 || used_cell[x1_g]) continue;
                int xa = c.in0[x1_g], xb = c.in1[x1_g];
                if ((xa == a && xb == b) || (xa == b && xb == a)) {
                    int sum_g = xor_map.find(x1_sig, cin_sig);
                    if (sum_g >= 0 && !used_cell[sum_g] && sum_g != x1_g) {
                        cell = { 1, a, b, cin_sig, sum_g, g, x1_g, c1_g, c2_g };
                        found = true;
                    }
                }
            }
        }
        if (found) {
            used_cell[cell.sum_g] = 1;
            used_cell[cell.cout_g] = 1;
            used_cell[cell.x1_g] = 1;
            used_cell[cell.c1_g] = 1;
            used_cell[cell.c2_g] = 1;
            cells.push_back(cell);
        }
    }

    // 2. Identify exact standalone HAs
    for (int g = 0; g < G; g++) {
        if (c.type[g] != 2 || used_cell[g]) continue;
        int a = c.in0[g], b = c.in1[g];
        int ag = and_map.find(a, b);
        if (ag >= 0 && !used_cell[ag]) {
            used_cell[g] = 1;
            used_cell[ag] = 1;
            cells.push_back({ 0, a, b, -1, g, ag, -1, -1, -1 });
        }
    }

    const int n_cells = (int)cells.size();
    if (n_cells < 100) return res;

    // 3. Link ripple-carry adder chains (HA followed by FAs)
    std::vector<int32_t> cout_to_cell(N, -1);
    for (int ci = 0; ci < n_cells; ci++) cout_to_cell[g_base + cells[ci].cout_g] = ci;

    std::vector<int32_t> next_cell(n_cells, -1), next_cnt(n_cells, 0), prev_cell(n_cells, -1);
    for (int ci = 0; ci < n_cells; ci++) {
        if (cells[ci].is_fa) {
            int p = cout_to_cell[cells[ci].cin];
            if (p >= 0 && p != ci) {
                prev_cell[ci] = p;
                next_cell[p] = ci;
                next_cnt[p]++;
            }
        }
    }

    std::vector<std::vector<int32_t>> chains;
    for (int ci = 0; ci < n_cells; ci++) {
        if (prev_cell[ci] < 0 && cells[ci].is_fa == 0) {
            std::vector<int32_t> ch;
            int cur = ci;
            ch.push_back(cur);
            while (next_cnt[cur] == 1 && next_cell[cur] >= 0) {
                cur = next_cell[cur];
                ch.push_back(cur);
            }
            if (ch.size() >= 4) chains.push_back(std::move(ch));
        }
    }
    if (chains.empty()) return res;

    // 4. Map chain sum/final-cout signals to (chain_id, bit_pos)
    const int n_chains = (int)chains.size();
    std::vector<int32_t> sig_chain(N, -1);
    std::vector<int16_t> sig_cbit(N, -1);
    for (int cid = 0; cid < n_chains; cid++) {
        const auto& ch = chains[cid];
        for (size_t k = 0; k < ch.size(); k++) {
            int s = g_base + cells[ch[k]].sum_g;
            sig_chain[s] = cid;
            sig_cbit[s] = (int16_t)k;
        }
        int cs = g_base + cells[ch.back()].cout_g;
        sig_chain[cs] = cid;
        sig_cbit[cs] = (int16_t)ch.size();
    }

    // 5. Link multiplier row chains (chain_prev_row)
    std::vector<int32_t> prev_row(n_chains, -1), next_row(n_chains, -1), next_row_cnt(n_chains, 0);
    for (int cid = 0; cid < n_chains; cid++) {
        const auto& ch = chains[cid];
        int W = (int)ch.size();
        if (W < 4 || W > 32) continue;
        // Candidate pcid from bit 0: one of (a, b) of cell 0 must have sig_cbit == 1 and same W
        const Cell& c0 = cells[ch[0]];
        int cands[2] = { c0.a, c0.b };
        for (int t = 0; t < 2; t++) {
            int pcid = sig_chain[cands[t]];
            if (pcid < 0 || pcid == cid || (int)chains[pcid].size() != W || sig_cbit[cands[t]] != 1) continue;
            bool ok = true;
            for (int k = 1; k < W; k++) {
                const Cell& ck = cells[ch[k]];
                bool mA = (sig_chain[ck.a] == pcid && sig_cbit[ck.a] == k + 1);
                bool mB = (sig_chain[ck.b] == pcid && sig_cbit[ck.b] == k + 1);
                if (!mA && !mB) { ok = false; break; }
            }
            if (ok) {
                prev_row[cid] = pcid;
                next_row[pcid] = cid;
                next_row_cnt[pcid]++;
                break;
            }
        }
    }

    // 6. Verify and construct ArrayMultMacros & standalone WordAddMacros
    std::vector<uint8_t> chain_used(n_chains, 0);
    res.gate_owner.assign(G, -1);

    // Helper: temporarily record internal gates + tap candidates for a verified ArrayMult
    struct PendingTap {
        int32_t sig;
        uint8_t row, bit, kind;
    };
    std::vector<std::vector<PendingTap>> macro_all_internals;

    for (int cid = 0; cid < n_chains; cid++) {
        if (prev_row[cid] >= 0) continue;
        int W = (int)chains[cid].size();
        if (W != 8 && W != 16 && W != 32) continue;
        std::vector<int32_t> stack;
        int cur = cid;
        stack.push_back(cur);
        while (next_row_cnt[cur] == 1 && next_row[cur] >= 0) {
            cur = next_row[cur];
            stack.push_back(cur);
        }
        if ((int)stack.size() != W - 1) continue;

        // Verify Row 0 & Rows 1..W-1 partial-product ANDs, deduce A[0..W-1] and B[0..W-1]!
        std::vector<int32_t> A_sig(W, -1), B_sig(W, -1);
        std::vector<std::vector<int32_t>> pp_gates(W, std::vector<int32_t>(W, -1));
        bool ok = true;

        // Row 1 is stack[0]. For cell k=0..W-2, one input is pp[0][k+1] (AND), other is pp[1][k] (AND).
        // For cell W-1, one input is const 0 (sig 0), other is pp[1][W-1] (AND)!
        {
            const auto& ch1 = chains[stack[0]];
            const Cell& clast = cells[ch1[W - 1]];
            int pp1_last_sig = -1;
            if (clast.a == 0) pp1_last_sig = clast.b;
            else if (clast.b == 0) pp1_last_sig = clast.a;
            else { ok = false; }

            if (ok && (pp1_last_sig < g_base || c.type[pp1_last_sig - g_base] != 0)) ok = false;
            // Now deduce B[1] and A[0..W-1] from row 2 (stack[1]) first!
            // In row r >= 2 (stack[r-1]), every cell k has ONE input = (stack[r-2], k+1), so the OTHER input IS uniquely pp[r][k]!
            if (ok) {
                for (int r = 2; r < W && ok; r++) {
                    const auto& chr = chains[stack[r - 1]];
                    int pcid = stack[r - 2];
                    for (int k = 0; k < W; k++) {
                        const Cell& ck = cells[chr[k]];
                        int pp_sig = (sig_chain[ck.a] == pcid && sig_cbit[ck.a] == k + 1) ? ck.b : ck.a;
                        if (pp_sig < g_base || c.type[pp_sig - g_base] != 0) { ok = false; break; }
                        pp_gates[r][k] = pp_sig - g_base;
                    }
                }
            }
            // Deduce B[2] (common input across pp_gates[2][0..W-1]) and A[0..W-1]!
            if (ok) {
                int g0 = pp_gates[2][0], g1 = pp_gates[2][1];
                int u0 = c.in0[g0], v0 = c.in1[g0];
                int u1 = c.in0[g1], v1 = c.in1[g1];
                int candB = -1;
                if (u0 == u1 || u0 == v1) candB = u0;
                else if (v0 == u1 || v0 == v1) candB = v0;
                if (candB < 0) ok = false;
                else {
                    // Check if candB appears in ALL pp_gates[2][0..W-1]
                    B_sig[2] = candB;
                    for (int k = 0; k < W; k++) {
                        int gk = pp_gates[2][k];
                        if (c.in0[gk] == candB) A_sig[k] = c.in1[gk];
                        else if (c.in1[gk] == candB) A_sig[k] = c.in0[gk];
                        else { ok = false; break; }
                    }
                    // Verify all rows r = 3..W-1 have consistent A[k] and common B[r]!
                    for (int r = 3; r < W && ok; r++) {
                        int br = -1;
                        for (int k = 0; k < W; k++) {
                            int gk = pp_gates[r][k];
                            int other = -1;
                            if (c.in0[gk] == A_sig[k]) other = c.in1[gk];
                            else if (c.in1[gk] == A_sig[k]) other = c.in0[gk];
                            else { ok = false; break; }
                            if (br < 0) br = other;
                            else if (br != other) { ok = false; break; }
                        }
                        B_sig[r] = br;
                    }
                }
            }
            // Now deduce B[1] from pp1_last_sig = AND(A[W-1], B[1]) and verify Row 0 & Row 1!
            if (ok) {
                int glast = pp1_last_sig - g_base;
                pp_gates[1][W - 1] = glast;
                if (c.in0[glast] == A_sig[W - 1]) B_sig[1] = c.in1[glast];
                else if (c.in1[glast] == A_sig[W - 1]) B_sig[1] = c.in0[glast];
                else ok = false;
            }
            if (ok) {
                int b0 = -1;
                for (int k = 0; k < W - 1 && ok; k++) {
                    const Cell& ck = cells[ch1[k]];
                    int sA = ck.a, sB = ck.b;
                    if (sA < g_base || sB < g_base || c.type[sA - g_base] != 0 || c.type[sB - g_base] != 0) {
                        ok = false; break;
                    }
                    int gA = sA - g_base, gB = sB - g_base;
                    auto is_and_pair = [&](int gg, int x, int y) {
                        return (c.in0[gg] == x && c.in1[gg] == y) || (c.in0[gg] == y && c.in1[gg] == x);
                    };
                    int g_r1 = -1, g_r0 = -1;
                    if (is_and_pair(gA, A_sig[k], B_sig[1])) { g_r1 = gA; g_r0 = gB; }
                    else if (is_and_pair(gB, A_sig[k], B_sig[1])) { g_r1 = gB; g_r0 = gA; }
                    else { ok = false; break; }
                    // g_r0 must be AND(A_sig[k+1], B[0])
                    int cand_b0 = -1;
                    if (c.in0[g_r0] == A_sig[k + 1]) cand_b0 = c.in1[g_r0];
                    else if (c.in1[g_r0] == A_sig[k + 1]) cand_b0 = c.in0[g_r0];
                    else { ok = false; break; }
                    if (b0 < 0) b0 = cand_b0;
                    else if (b0 != cand_b0) { ok = false; break; }
                    pp_gates[1][k] = g_r1;
                    pp_gates[0][k + 1] = g_r0;
                }
                B_sig[0] = b0;
            }
            // Optional pp[0][0] = AND(A[0], B[0])
            if (ok) {
                int g00 = and_map.find(A_sig[0], B_sig[0]);
                if (g00 >= 0 && res.gate_owner[g00] < 0 && !used_cell[g00]) {
                    pp_gates[0][0] = g00;
                }
            }
        }
        if (!ok) continue;

        // Check that all adder gates of this stack are unowned
        for (int cid_r : stack) {
            for (int ci : chains[cid_r]) {
                const Cell& cl = cells[ci];
                if (res.gate_owner[cl.sum_g] >= 0 || res.gate_owner[cl.cout_g] >= 0) { ok = false; break; }
                if (cl.is_fa && (res.gate_owner[cl.x1_g] >= 0 || res.gate_owner[cl.c1_g] >= 0 || res.gate_owner[cl.c2_g] >= 0)) {
                    ok = false; break;
                }
            }
            if (!ok) break;
        }
        if (!ok) continue;

        int mid = (int)res.macros.size();
        ArithMacro m;
        m.kind = 0;
        m.W = (uint8_t)W;
        m.inA_sig = std::move(A_sig);
        m.inB_sig = std::move(B_sig);
        std::vector<PendingTap> internals;
        internals.reserve(W * W * 6);

        // Claim PP gates (only claim unowned ones; if shared with another mult, don't double-claim!)
        for (int r = 0; r < W; r++) {
            for (int k = 0; k < W; k++) {
                int gg = pp_gates[r][k];
                if (gg >= 0 && res.gate_owner[gg] < 0) {
                    res.gate_owner[gg] = mid;
                    internals.push_back({ g_base + gg, (uint8_t)r, (uint8_t)k, 0 });
                }
            }
        }
        // Claim adder gates of rows 1..W-1
        for (int r = 1; r < W; r++) {
            int cid_r = stack[r - 1];
            chain_used[cid_r] = 1;
            const auto& chr = chains[cid_r];
            for (int k = 0; k < W; k++) {
                const Cell& cl = cells[chr[k]];
                res.gate_owner[cl.sum_g] = mid;
                res.gate_owner[cl.cout_g] = mid;
                internals.push_back({ g_base + cl.sum_g, (uint8_t)r, (uint8_t)k, 1 });
                internals.push_back({ g_base + cl.cout_g, (uint8_t)r, (uint8_t)k, 2 });
                if (cl.is_fa) {
                    res.gate_owner[cl.x1_g] = mid;
                    res.gate_owner[cl.c1_g] = mid;
                    res.gate_owner[cl.c2_g] = mid;
                    internals.push_back({ g_base + cl.x1_g, (uint8_t)r, (uint8_t)k, 3 });
                    internals.push_back({ g_base + cl.c1_g, (uint8_t)r, (uint8_t)k, 4 });
                    internals.push_back({ g_base + cl.c2_g, (uint8_t)r, (uint8_t)k, 5 });
                }
            }
        }

        res.macros.push_back(std::move(m));
        macro_all_internals.push_back(std::move(internals));
    }

    // Also extract remaining standalone ripple-carry adder chains (8 <= W <= 63) as WordAddMacro!
    for (int cid = 0; cid < n_chains; cid++) {
        if (chain_used[cid]) continue;
        const auto& ch = chains[cid];
        int W = (int)ch.size();
        if (W < 8 || W > 63) continue;
        bool ok = true;
        for (int ci : ch) {
            const Cell& cl = cells[ci];
            if (res.gate_owner[cl.sum_g] >= 0 || res.gate_owner[cl.cout_g] >= 0) { ok = false; break; }
            if (cl.is_fa && (res.gate_owner[cl.x1_g] >= 0 || res.gate_owner[cl.c1_g] >= 0 || res.gate_owner[cl.c2_g] >= 0)) {
                ok = false; break;
            }
        }
        if (!ok) continue;

        int mid = (int)res.macros.size();
        ArithMacro m;
        m.kind = 1;
        m.W = (uint8_t)W;
        m.inA_sig.resize(W);
        m.inB_sig.resize(W);
        std::vector<PendingTap> internals;
        internals.reserve(W * 5);

        for (int k = 0; k < W; k++) {
            const Cell& cl = cells[ch[k]];
            m.inA_sig[k] = cl.a;
            m.inB_sig[k] = cl.b;
            res.gate_owner[cl.sum_g] = mid;
            res.gate_owner[cl.cout_g] = mid;
            internals.push_back({ g_base + cl.sum_g, 0, (uint8_t)k, 1 });
            internals.push_back({ g_base + cl.cout_g, 0, (uint8_t)k, 2 });
            if (cl.is_fa) {
                res.gate_owner[cl.x1_g] = mid;
                res.gate_owner[cl.c1_g] = mid;
                res.gate_owner[cl.c2_g] = mid;
                internals.push_back({ g_base + cl.x1_g, 0, (uint8_t)k, 3 });
                internals.push_back({ g_base + cl.c1_g, 0, (uint8_t)k, 4 });
                internals.push_back({ g_base + cl.c2_g, 0, (uint8_t)k, 5 });
            }
        }
        chain_used[cid] = 1;
        res.macros.push_back(std::move(m));
        macro_all_internals.push_back(std::move(internals));
    }

    if (res.macros.empty()) return res;

    // 7. Determine which internal signals of each macro are EXTERNALLY USED!
    std::vector<uint8_t> sig_ext_used(N, 0);
    for (int x : c.d) sig_ext_used[x] = 1;
    for (int x : c.out) sig_ext_used[x] = 1;
    for (int g = 0; g < G; g++) {
        int og = res.gate_owner[g];
        if (og >= 0) continue; // internal macro edges handled via macro inputs!
        int a = c.in0[g], b = c.in1[g], k = c.in2[g];
        if (a >= 0) sig_ext_used[a] = 1;
        if (b >= 0) sig_ext_used[b] = 1;
        if (k >= 0) sig_ext_used[k] = 1;
    }
    for (size_t mid = 0; mid < res.macros.size(); mid++) {
        for (int s : res.macros[mid].inA_sig) sig_ext_used[s] = 1;
        for (int s : res.macros[mid].inB_sig) sig_ext_used[s] = 1;
    }

    res.sig_to_mout.assign(N, -1);
    int next_mout = 0;
    for (size_t mid = 0; mid < res.macros.size(); mid++) {
        ArithMacro& m = res.macros[mid];
        for (const auto& pt : macro_all_internals[mid]) {
            if (sig_ext_used[pt.sig]) {
                int mout_id = next_mout++;
                res.sig_to_mout[pt.sig] = mout_id;
                m.taps.push_back({ pt.row, pt.bit, pt.kind, mout_id, pt.sig });
            }
        }
        std::sort(m.taps.begin(), m.taps.end(), [](const ArithTap& x, const ArithTap& y) {
            if (x.row != y.row) return x.row < y.row;
            if (x.kind != y.kind) return x.kind < y.kind;
            return x.bit < y.bit;
        });
        int nrows = (m.kind == 0) ? (int)m.W : 1;
        m.row_tap_mask.assign(nrows, 0);
        m.row_tap_start.assign(nrows + 1, 0);
        for (const auto& tp : m.taps) {
            m.row_tap_mask[tp.row] |= (uint8_t)(1u << tp.kind);
            m.row_tap_start[tp.row + 1]++;
        }
        for (int r = 0; r < nrows; r++) m.row_tap_start[r + 1] += m.row_tap_start[r];
    }
    res.num_mouts = next_mout;
    res.active = true;
    return res;
}

// ============================================================================
// Runtime AVX2 Kernels for ArrayMult (W=8, 16, 32) and WordAdd (W<=63)
// ============================================================================
static inline __m256i load_in_vec(const uint8_t* const bases[2], const ArithMacro::InRef& ref) {
    alignas(32) static const uint64_t inv_masks[2][4] = { {0,0,0,0}, {~0ULL,~0ULL,~0ULL,~0ULL} };
    __m256i v = _mm256_load_si256(reinterpret_cast<const __m256i*>(bases[ref.is_ff] + ref.disp));
    return _mm256_xor_si256(v, _mm256_load_si256(reinterpret_cast<const __m256i*>(inv_masks[ref.inv])));
}

template <int W>
static void exec_mult_bitsliced(const ArithMacro& m, uint8_t* state, const uint8_t* ff_cur, uint8_t* ff_nxt) {
    const uint8_t* in_bases[2] = { state, ff_cur };
    uint8_t* out_bases[2] = { state, ff_nxt };
    const ArithMacro::FastTap* ft = m.fast_taps.data();

    __m256i A[W];
    for (int k = 0; k < W; k++) A[k] = load_in_vec(in_bases, m.inA_ref[k]);

    __m256i prev[W];
    {
        __m256i b0 = load_in_vec(in_bases, m.inB_ref[0]);
        __m256i pp0[W];
        for (int k = 0; k < W; k++) pp0[k] = _mm256_and_si256(A[k], b0);
        const int te = m.row_tap_start[1];
        for (int ti = m.row_tap_start[0]; ti < te; ti++) {
            _mm256_store_si256(reinterpret_cast<__m256i*>(out_bases[ft[ti].is_ff_nxt] + ft[ti].out_disp), pp0[ft[ti].buf_idx]);
        }
        for (int k = 0; k < W - 1; k++) prev[k] = pp0[k + 1];
        prev[W - 1] = _mm256_setzero_si256();
    }

    // Flat buffer: [0..W-1]=PP, [W..2W-1]=SUM, [2W..3W-1]=COUT, [3W..4W-1]=X1, [4W..5W-1]=C1, [5W..6W-1]=C2
    __m256i buf[6 * W];
    __m256i* pp_buf   = buf;
    __m256i* sum_buf  = buf + W;
    __m256i* cout_buf = buf + 2 * W;
    __m256i* x1_buf   = buf + 3 * W;
    __m256i* c1_buf   = buf + 4 * W;
    __m256i* c2_buf   = buf + 5 * W;

    for (int r = 1; r < W; r++) {
        __m256i br = load_in_vec(in_bases, m.inB_ref[r]);

        for (int k = 0; k < W; k++) {
            __m256i ppk = _mm256_and_si256(A[k], br);
            __m256i prk = prev[k];
            pp_buf[k] = ppk;
            x1_buf[k] = _mm256_xor_si256(prk, ppk);
            c1_buf[k] = _mm256_and_si256(prk, ppk);
        }

        sum_buf[0] = x1_buf[0];
        __m256i car = c1_buf[0];
        cout_buf[0] = car;

        for (int k = 1; k < W; k++) {
            __m256i x1k = x1_buf[k];
            sum_buf[k] = _mm256_xor_si256(x1k, car);
            __m256i c2k = _mm256_and_si256(x1k, car);
            car = _mm256_or_si256(c1_buf[k], c2k);
            cout_buf[k] = car;
            c2_buf[k] = c2k;
        }

        const int ts = m.row_tap_start[r];
        const int te = m.row_tap_start[r + 1];
        for (int ti = ts; ti < te; ti++) {
            _mm256_store_si256(reinterpret_cast<__m256i*>(out_bases[ft[ti].is_ff_nxt] + ft[ti].out_disp), buf[ft[ti].buf_idx]);
        }

        for (int k = 0; k < W - 1; k++) prev[k] = sum_buf[k + 1];
        prev[W - 1] = car;
    }
}

static void exec_add_bitsliced(const ArithMacro& m, uint8_t* state, const uint8_t* ff_cur, uint8_t* ff_nxt) {
    const int W = m.W;
    const uint8_t* in_bases[2] = { state, ff_cur };
    uint8_t* out_bases[2] = { state, ff_nxt };
    const ArithMacro::FastTap* ft = m.fast_taps.data();

    __m256i buf[6 * 64];
    __m256i* sum_buf  = buf + 64;
    __m256i* cout_buf = buf + 2 * 64;
    __m256i* x1_buf   = buf + 3 * 64;
    __m256i* c1_buf   = buf + 4 * 64;
    __m256i* c2_buf   = buf + 5 * 64;

    for (int k = 0; k < W; k++) {
        __m256i ak = load_in_vec(in_bases, m.inA_ref[k]);
        __m256i bk = load_in_vec(in_bases, m.inB_ref[k]);
        x1_buf[k] = _mm256_xor_si256(ak, bk);
        c1_buf[k] = _mm256_and_si256(ak, bk);
    }

    sum_buf[0] = x1_buf[0];
    __m256i car = c1_buf[0];
    cout_buf[0] = car;
    for (int k = 1; k < W; k++) {
        __m256i x1k = x1_buf[k];
        sum_buf[k] = _mm256_xor_si256(x1k, car);
        __m256i c2k = _mm256_and_si256(x1k, car);
        car = _mm256_or_si256(c1_buf[k], c2k);
        cout_buf[k] = car;
        c2_buf[k] = c2k;
    }

    const int nt = (int)m.fast_taps.size();
    for (int ti = 0; ti < nt; ti++) {
        _mm256_store_si256(reinterpret_cast<__m256i*>(out_bases[ft[ti].is_ff_nxt] + ft[ti].out_disp), buf[ft[ti].buf_idx]);
    }
}

static inline void exec_arith_macro(const ArithMacro& m, uint8_t* state, const uint8_t* ff_cur, uint8_t* ff_nxt) {
    if (m.kind == 0) {
        if (m.W == 8) exec_mult_bitsliced<8>(m, state, ff_cur, ff_nxt);
        else if (m.W == 16) exec_mult_bitsliced<16>(m, state, ff_cur, ff_nxt);
        else exec_mult_bitsliced<32>(m, state, ff_cur, ff_nxt);
    } else {
        exec_add_bitsliced(m, state, ff_cur, ff_nxt);
    }
}

// ============================================================================
// Simplified Staged DAG representation (supports both pure scalar & hybrid macros!)
// Node IDs:
//   0                       : const 0
//   1 .. I                  : PI 0 .. I-1
//   I+1 .. I+F              : FF 0 .. F-1
//   I+F+1 .. I+F+num_mouts  : Macro outputs 0 .. num_mouts-1
//   first_gate_node ..      : Scalar gates (op: 0=AND, 1=XOR, 2=MUX, 3=OR)
// ============================================================================
struct SimpGate {
    uint8_t op;
    uint32_t l0, l1, l2;
};

struct FastGateCache {
    static constexpr uint32_t SETS = 1u << 16;
    static constexpr uint32_t MASK = SETS - 1u;
    uint32_t tab[SETS * 2];

    void init() { std::memset(tab, 0, sizeof(tab)); }

    static inline uint64_t mix_key(uint8_t op, uint32_t a, uint32_t b, uint32_t c) {
        uint64_t h = ((uint64_t)a << 32) | b;
        h ^= ((uint64_t)c * 0xBF58476D1CE4E5B9ULL) ^ ((uint64_t)op * 0x94D049BB133111EBULL);
        h *= 0x9E3779B97F4A7C15ULL;
        h ^= h >> 32;
        return h;
    }

    inline uint32_t find_or_insert(const std::vector<SimpGate>& raw_gates,
                                   uint8_t op, uint32_t a, uint32_t b, uint32_t c,
                                   uint32_t new_raw_idx) {
        uint64_t h = mix_key(op, a, b, c);
        uint32_t base = ((uint32_t)h & MASK) << 1;
        uint32_t tag = (uint32_t)((h >> 32) & 0x7FFu) << 21;
        uint32_t e0 = tab[base];
        if (e0 && (e0 & 0xFFE00000u) == tag) {
            uint32_t gi = (e0 & 0x1FFFFFu) - 1u;
            const SimpGate& g = raw_gates[gi];
            if (g.op == op && g.l0 == a && g.l1 == b && g.l2 == c) return gi;
        }
        uint32_t e1 = tab[base + 1];
        if (e1 && (e1 & 0xFFE00000u) == tag) {
            uint32_t gi = (e1 & 0x1FFFFFu) - 1u;
            const SimpGate& g = raw_gates[gi];
            if (g.op == op && g.l0 == a && g.l1 == b && g.l2 == c) return gi;
        }
        tab[base + 1] = e0;
        tab[base] = tag | (new_raw_idx + 1u);
        return 0xFFFFFFFFu;
    }
};

struct SimplifiedDAG {
    int I, F, O;
    int num_mouts = 0;
    int first_gate_node = 0;
    std::vector<SimpGate> gates;
    std::vector<uint32_t> d_lit;
    std::vector<uint32_t> o_lit;
    // Stage boundaries: stage s executes scalar gates [stage_g_start[s], stage_g_start[s+1]),
    // then executes macros stage_macros[s]!
    std::vector<int> stage_g_start;
    std::vector<std::vector<int>> stage_macros;
    std::vector<ArithMacro> macros;
    // Macro input literals (size = sum of 2*m.W), mapped to macro_in slots if needed
    std::vector<uint32_t> min_lits;
    std::vector<int> macro_inA_base;
    std::vector<int> macro_inB_base;
};

static SimplifiedDAG build_simplified_dag(const Circuit& c, ArithExtractResult&& arith) {
    const int I = c.I, F = c.F, G = c.G, O = c.O;
    const int ff_base = 2 + I;
    const int g_base = 2 + I + F;
    const int N = g_base + G;

    const bool has_macros = arith.active && !arith.macros.empty();
    const int num_macros = has_macros ? (int)arith.macros.size() : 0;

    // 1. Sequential COI (if no macros; with macros, keep all macro-reachable or run full COI on original circuit)
    std::vector<uint8_t> seq_vis(N, 0);
    std::vector<int> bfs;
    bfs.reserve(N);
    for (int x : c.out) {
        if (!seq_vis[x]) { seq_vis[x] = 1; bfs.push_back(x); }
    }
    for (size_t qi = 0; qi < bfs.size(); qi++) {
        int u = bfs[qi];
        if (u >= g_base) {
            int g = u - g_base;
            int a = c.in0[g], b = c.in1[g], k = c.in2[g];
            if (a >= 0 && !seq_vis[a]) { seq_vis[a] = 1; bfs.push_back(a); }
            if (b >= 0 && !seq_vis[b]) { seq_vis[b] = 1; bfs.push_back(b); }
            if (k >= 0 && !seq_vis[k]) { seq_vis[k] = 1; bfs.push_back(k); }
        } else if (u >= ff_base) {
            int x = c.d[u - ff_base];
            if (!seq_vis[x]) { seq_vis[x] = 1; bfs.push_back(x); }
        }
    }

    // 2. Contracted topological sort (nodes = scalar gates [0..G-1] + macros [G..G+num_macros-1])
    //    Also verify 100% acyclicity when has_macros! If cycle detected, disable macros cleanly!
    bool use_macros = has_macros;
    std::vector<std::vector<int>> stage_scalar_orig;
    std::vector<std::vector<int>> stage_macros;

    auto run_contracted_topo = [&](bool with_m) -> bool {
        stage_scalar_orig.clear();
        stage_macros.clear();
        const int M_cnt = with_m ? num_macros : 0;
        const int V = G + M_cnt;
        std::vector<uint8_t> active_v(V, 0);
        int total_active = 0;
        for (int g = 0; g < G; g++) {
            if (seq_vis[g_base + g] && (!with_m || arith.gate_owner[g] < 0)) {
                active_v[g] = 1;
                total_active++;
            }
        }
        for (int mid = 0; mid < M_cnt; mid++) {
            // Macro is active if at least one of its taps is seq_vis
            bool any = false;
            for (const auto& tp : arith.macros[mid].taps) {
                if (seq_vis[tp.orig_sig]) { any = true; break; }
            }
            if (any) { active_v[G + mid] = 1; total_active++; }
        }

        auto sig_to_v = [&](int s) -> int {
            if (s < g_base) return -1;
            int g = s - g_base;
            if (with_m && arith.gate_owner[g] >= 0) return G + arith.gate_owner[g];
            return g;
        };

        std::vector<int> indeg(V, 0), head(V, -1);
        std::vector<int> to, nxt;
        to.reserve((size_t)total_active * 3 + 64);
        nxt.reserve((size_t)total_active * 3 + 64);
        auto add_e = [&](int u, int v) {
            if (u < 0 || !active_v[u]) return;
            indeg[v]++;
            to.push_back(v);
            nxt.push_back(head[u]);
            head[u] = (int)to.size() - 1;
        };

        for (int g = 0; g < G; g++) {
            if (!active_v[g]) continue;
            int a = c.in0[g], b = c.in1[g], k = c.in2[g];
            if (a >= g_base) add_e(sig_to_v(a), g);
            if (b >= g_base) add_e(sig_to_v(b), g);
            if (k >= g_base) add_e(sig_to_v(k), g);
        }
        for (int mid = 0; mid < M_cnt; mid++) {
            if (!active_v[G + mid]) continue;
            const auto& m = arith.macros[mid];
            for (int s : m.inA_sig) if (s >= g_base) add_e(sig_to_v(s), G + mid);
            for (int s : m.inB_sig) if (s >= g_base) add_e(sig_to_v(s), G + mid);
        }

        std::vector<int> ready_g, ready_m;
        ready_g.reserve(G);
        ready_m.reserve(M_cnt + 1);
        for (int g = G - 1; g >= 0; g--) if (active_v[g] && indeg[g] == 0) ready_g.push_back(g);
        for (int mid = 0; mid < M_cnt; mid++) if (active_v[G + mid] && indeg[G + mid] == 0) ready_m.push_back(mid);

        int visited = 0;
        if (!with_m) {
            std::vector<int> ord;
            ord.reserve(total_active);
            while (!ready_g.empty()) {
                int u = ready_g.back(); ready_g.pop_back();
                ord.push_back(u);
                visited++;
                for (int e = head[u]; e != -1; e = nxt[e]) {
                    int v = to[e];
                    if (--indeg[v] == 0) ready_g.push_back(v);
                }
            }
            stage_scalar_orig.push_back(std::move(ord));
            stage_macros.push_back({});
            return visited == total_active;
        }

        // Greedy wave scheduler: drain all ready macros first, then drain all ready scalar gates!
        //Wait: starting with ready scalar gates (stage 0 scalar -> stage 0 macros -> stage 1 scalar -> ...)
        while (!ready_g.empty() || !ready_m.empty()) {
            std::vector<int> sg, sm;
            while (!ready_g.empty()) {
                int u = ready_g.back(); ready_g.pop_back();
                sg.push_back(u);
                visited++;
                for (int e = head[u]; e != -1; e = nxt[e]) {
                    int v = to[e];
                    if (--indeg[v] == 0) {
                        if (v < G) ready_g.push_back(v);
                        else ready_m.push_back(v - G);
                    }
                }
            }
            while (!ready_m.empty()) {
                int mid = ready_m.back(); ready_m.pop_back();
                sm.push_back(mid);
                visited++;
                int u = G + mid;
                for (int e = head[u]; e != -1; e = nxt[e]) {
                    int v = to[e];
                    if (--indeg[v] == 0) {
                        if (v < G) ready_g.push_back(v);
                        else ready_m.push_back(v - G);
                    }
                }
            }
            stage_scalar_orig.push_back(std::move(sg));
            stage_macros.push_back(std::move(sm));
        }
        return visited == total_active;
    };

    if (use_macros) {
        if (!run_contracted_topo(true)) {
            use_macros = false;
            run_contracted_topo(false);
        }
    } else {
        run_contracted_topo(false);
    }

    const int num_mouts = use_macros ? arith.num_mouts : 0;
    const int mout_base = 1 + I + F;
    const int first_gate = mout_base + num_mouts;

    std::vector<uint32_t> sig_to_lit(N, 0);
    sig_to_lit[0] = 0;
    sig_to_lit[1] = 1;
    for (int s = 2; s < g_base; s++) sig_to_lit[s] = (uint32_t)(s - 1) << 1;
    if (use_macros) {
        for (int s = g_base; s < N; s++) {
            int mo = arith.sig_to_mout[s];
            if (mo >= 0) sig_to_lit[s] = (uint32_t)(mout_base + mo) << 1;
        }
    }

    // 3. Simplify scalar gates stage-by-stage!
    // Note: tracking which raw_gate belongs to which stage (every gate created in stage s belongs to stage s;
    // if CSE finds an existing gate from an earlier stage s' <= s, that's ALSO valid in stage s!).
    size_t est_scalar = 0;
    for (const auto& sg : stage_scalar_orig) est_scalar += sg.size();

    std::vector<SimpGate> raw_gates;
    raw_gates.reserve(est_scalar + 16);
    std::vector<int> raw_stage;
    raw_stage.reserve(est_scalar + 16);
    auto htab = std::make_unique<FastGateCache>();
    htab->init();
    int cur_stage_id = 0;

    auto make_and_impl = [&](auto& self_and, auto& self_xor, auto& from_tt2, uint32_t a, uint32_t b) -> uint32_t {
        if (a == 0 || b == 0) return 0;
        if (a == 1) return b;
        if (b == 1) return a;
        if (a == b) return a;
        if ((a ^ 1u) == b) return 0;
        if (a > b) std::swap(a, b);

        for (int pass = 0; pass < 2; pass++) {
            uint32_t x = (pass == 0) ? a : b;
            uint32_t y = (pass == 0) ? b : a;
            uint32_t ny = y >> 1;
            if ((int)ny >= first_gate) {
                const SimpGate& gy = raw_gates[ny - first_gate];
                uint32_t inv_y = y & 1u;
                if (gy.op == 0) {
                    if ((gy.l0 >> 1) == (x >> 1) || (gy.l1 >> 1) == (x >> 1)) {
                        uint32_t u = ((gy.l0 >> 1) == (x >> 1)) ? gy.l0 : gy.l1;
                        uint32_t c_lit = ((gy.l0 >> 1) == (x >> 1)) ? gy.l1 : gy.l0;
                        bool u_same = (u == x);
                        if (inv_y == 0) return u_same ? self_and(self_and, self_xor, from_tt2, x, c_lit) : 0u;
                        else return u_same ? self_and(self_and, self_xor, from_tt2, x, c_lit ^ 1u) : x;
                    }
                } else if (gy.op == 1) {
                    if ((gy.l0 >> 1) == (x >> 1) || (gy.l1 >> 1) == (x >> 1)) {
                        uint32_t u = ((gy.l0 >> 1) == (x >> 1)) ? gy.l0 : gy.l1;
                        uint32_t c_lit = ((gy.l0 >> 1) == (x >> 1)) ? gy.l1 : gy.l0;
                        uint32_t flip = (u != x ? 1u : 0u) ^ inv_y;
                        return self_and(self_and, self_xor, from_tt2, x, c_lit ^ flip ^ 1u);
                    }
                }
            }
        }
        uint32_t na = a >> 1, nb = b >> 1;
        if ((int)na >= first_gate && (int)nb >= first_gate) {
            const SimpGate& ga = raw_gates[na - first_gate];
            const SimpGate& gb = raw_gates[nb - first_gate];
            if (ga.op < 2 && gb.op < 2) {
                uint32_t a0 = ga.l0 >> 1, a1 = ga.l1 >> 1;
                uint32_t b0 = gb.l0 >> 1, b1 = gb.l1 >> 1;
                if (a0 > a1) std::swap(a0, a1);
                if (b0 > b1) std::swap(b0, b1);
                if (a0 == b0 && a1 == b1 && a0 != a1) {
                    uint32_t tt = 0;
                    for (uint32_t idx = 0; idx < 4; idx++) {
                        uint32_t v0 = idx & 1u, v1 = (idx >> 1) & 1u;
                        uint32_t ua = (((ga.l0 >> 1) == a0 ? v0 : v1) ^ (ga.l0 & 1u));
                        uint32_t va = (((ga.l1 >> 1) == a0 ? v0 : v1) ^ (ga.l1 & 1u));
                        uint32_t ra = ((ga.op == 0) ? (ua & va) : (ua ^ va)) ^ (a & 1u);
                        uint32_t ub = (((gb.l0 >> 1) == a0 ? v0 : v1) ^ (gb.l0 & 1u));
                        uint32_t vb = (((gb.l1 >> 1) == a0 ? v0 : v1) ^ (gb.l1 & 1u));
                        uint32_t rb = ((gb.op == 0) ? (ub & vb) : (ub ^ vb)) ^ (b & 1u);
                        tt |= ((ra & rb) << idx);
                    }
                    return from_tt2(self_and, self_xor, from_tt2, tt, a0 << 1, a1 << 1);
                }
            }
        }

        uint32_t new_gi = (uint32_t)raw_gates.size();
        uint32_t found_gi = htab->find_or_insert(raw_gates, 0, a, b, 0, new_gi);
        if (found_gi != 0xFFFFFFFFu) return (uint32_t)(first_gate + found_gi) << 1;
        raw_gates.push_back({0, a, b, 0});
        raw_stage.push_back(cur_stage_id);
        return (uint32_t)(first_gate + new_gi) << 1;
    };

    auto make_xor_impl = [&](auto& self_and, auto& self_xor, auto& from_tt2, uint32_t a, uint32_t b) -> uint32_t {
        if (a == 0) return b;
        if (a == 1) return b ^ 1u;
        if (b == 0) return a;
        if (b == 1) return a ^ 1u;
        if (a == b) return 0;
        if ((a ^ 1u) == b) return 1;
        uint32_t inv = (a & 1u) ^ (b & 1u);
        a &= ~1u;
        b &= ~1u;
        if (a > b) std::swap(a, b);

        for (int pass = 0; pass < 2; pass++) {
            uint32_t x = (pass == 0) ? a : b;
            uint32_t y = (pass == 0) ? b : a;
            uint32_t ny = y >> 1;
            if ((int)ny >= first_gate) {
                const SimpGate& gy = raw_gates[ny - first_gate];
                if (gy.op == 1) {
                    if (gy.l0 == x) return gy.l1 ^ inv;
                    if (gy.l1 == x) return gy.l0 ^ inv;
                    if ((gy.l0 ^ 1u) == x) return gy.l1 ^ inv ^ 1u;
                    if ((gy.l1 ^ 1u) == x) return gy.l0 ^ inv ^ 1u;
                } else if (gy.op == 0) {
                    if ((gy.l0 >> 1) == (x >> 1) || (gy.l1 >> 1) == (x >> 1)) {
                        uint32_t u = ((gy.l0 >> 1) == (x >> 1)) ? gy.l0 : gy.l1;
                        uint32_t c_lit = ((gy.l0 >> 1) == (x >> 1)) ? gy.l1 : gy.l0;
                        if (u == x) return self_and(self_and, self_xor, from_tt2, x, c_lit ^ 1u) ^ inv;
                        else return self_and(self_and, self_xor, from_tt2, x ^ 1u, c_lit ^ 1u) ^ 1u ^ inv;
                    }
                }
            }
        }
        uint32_t na = a >> 1, nb = b >> 1;
        if ((int)na >= first_gate && (int)nb >= first_gate) {
            const SimpGate& ga = raw_gates[na - first_gate];
            const SimpGate& gb = raw_gates[nb - first_gate];
            if (ga.op < 2 && gb.op < 2) {
                uint32_t a0 = ga.l0 >> 1, a1 = ga.l1 >> 1;
                uint32_t b0 = gb.l0 >> 1, b1 = gb.l1 >> 1;
                if (a0 > a1) std::swap(a0, a1);
                if (b0 > b1) std::swap(b0, b1);
                if (a0 == b0 && a1 == b1 && a0 != a1) {
                    uint32_t tt = 0;
                    for (uint32_t idx = 0; idx < 4; idx++) {
                        uint32_t v0 = idx & 1u, v1 = (idx >> 1) & 1u;
                        uint32_t ua = (((ga.l0 >> 1) == a0 ? v0 : v1) ^ (ga.l0 & 1u));
                        uint32_t va = (((ga.l1 >> 1) == a0 ? v0 : v1) ^ (ga.l1 & 1u));
                        uint32_t ra = ((ga.op == 0) ? (ua & va) : (ua ^ va));
                        uint32_t ub = (((gb.l0 >> 1) == a0 ? v0 : v1) ^ (gb.l0 & 1u));
                        uint32_t vb = (((gb.l1 >> 1) == a0 ? v0 : v1) ^ (gb.l1 & 1u));
                        uint32_t rb = ((gb.op == 0) ? (ub & vb) : (ub ^ vb));
                        tt |= ((ra ^ rb ^ inv) << idx);
                    }
                    return from_tt2(self_and, self_xor, from_tt2, tt, a0 << 1, a1 << 1);
                }
            }
        }

        uint32_t new_gi = (uint32_t)raw_gates.size();
        uint32_t found_gi = htab->find_or_insert(raw_gates, 1, a, b, 0, new_gi);
        if (found_gi != 0xFFFFFFFFu) return ((uint32_t)(first_gate + found_gi) << 1) ^ inv;
        raw_gates.push_back({1, a, b, 0});
        raw_stage.push_back(cur_stage_id);
        return ((uint32_t)(first_gate + new_gi) << 1) ^ inv;
    };

    auto from_tt2_impl = [&](auto& self_and, auto& self_xor, auto& self_tt, uint32_t tt, uint32_t x0, uint32_t x1) -> uint32_t {
        switch (tt) {
            case 0x0: return 0;
            case 0xF: return 1;
            case 0xA: return x0;
            case 0x5: return x0 ^ 1u;
            case 0xC: return x1;
            case 0x3: return x1 ^ 1u;
            case 0x6: return self_xor(self_and, self_xor, self_tt, x0, x1);
            case 0x9: return self_xor(self_and, self_xor, self_tt, x0, x1) ^ 1u;
            case 0x8: return self_and(self_and, self_xor, self_tt, x0, x1);
            case 0x7: return self_and(self_and, self_xor, self_tt, x0, x1) ^ 1u;
            case 0x4: return self_and(self_and, self_xor, self_tt, x0 ^ 1u, x1);
            case 0xB: return self_and(self_and, self_xor, self_tt, x0 ^ 1u, x1) ^ 1u;
            case 0x2: return self_and(self_and, self_xor, self_tt, x0, x1 ^ 1u);
            case 0xD: return self_and(self_and, self_xor, self_tt, x0, x1 ^ 1u) ^ 1u;
            case 0x1: return self_and(self_and, self_xor, self_tt, x0 ^ 1u, x1 ^ 1u);
            case 0xE: return self_and(self_and, self_xor, self_tt, x0 ^ 1u, x1 ^ 1u) ^ 1u;
            default: return 0;
        }
    };

    auto make_and = [&](uint32_t a, uint32_t b) { return make_and_impl(make_and_impl, make_xor_impl, from_tt2_impl, a, b); };
    auto make_xor = [&](uint32_t a, uint32_t b) { return make_xor_impl(make_and_impl, make_xor_impl, from_tt2_impl, a, b); };
    auto make_mux = [&](uint32_t s, uint32_t a, uint32_t b) -> uint32_t {
        if (s == 0) return a;
        if (s == 1) return b;
        if (s & 1u) { s ^= 1u; std::swap(a, b); }
        if (a == b) return a;
        if ((a ^ 1u) == b) return make_xor(s, a);
        if (a == 0) return make_and(s, b);
        if (a == 1) return make_and(s, b ^ 1u) ^ 1u;
        if (b == 0) return make_and(s ^ 1u, a);
        if (b == 1) return make_and(s ^ 1u, a ^ 1u) ^ 1u;
        if (a == s) return make_and(s, b);
        if (a == (s ^ 1u)) return make_and(s, b ^ 1u) ^ 1u;
        if (b == s) return make_and(s ^ 1u, a ^ 1u) ^ 1u;
        if (b == (s ^ 1u)) return make_and(s ^ 1u, a);
        uint32_t inv = a & 1u;
        a ^= inv;
        b ^= inv;
        uint32_t new_gi = (uint32_t)raw_gates.size();
        uint32_t found_gi = htab->find_or_insert(raw_gates, 2, s, a, b, new_gi);
        if (found_gi != 0xFFFFFFFFu) return ((uint32_t)(first_gate + found_gi) << 1) ^ inv;
        raw_gates.push_back({2, s, a, b});
        raw_stage.push_back(cur_stage_id);
        return ((uint32_t)(first_gate + new_gi) << 1) ^ inv;
    };

    const int num_stages = (int)stage_scalar_orig.size();
    for (int s = 0; s < num_stages; s++) {
        cur_stage_id = s;
        for (int g : stage_scalar_orig[s]) {
            uint8_t tp = c.type[g];
            uint32_t a = sig_to_lit[c.in0[g]];
            uint32_t b = (tp != 6) ? sig_to_lit[c.in1[g]] : 0u;
            uint32_t k = (tp == 7) ? sig_to_lit[c.in2[g]] : 0u;
            uint32_t res = 0;
            switch (tp) {
                case 0: res = make_and(a, b); break;
                case 1: res = make_and(a ^ 1u, b ^ 1u) ^ 1u; break;
                case 2: res = make_xor(a, b); break;
                case 3: res = make_and(a, b) ^ 1u; break;
                case 4: res = make_and(a ^ 1u, b ^ 1u); break;
                case 5: res = make_xor(a, b) ^ 1u; break;
                case 6: res = a ^ 1u; break;
                case 7: res = make_mux(a, b, k); break;
            }
            sig_to_lit[g_base + g] = res;
        }
    }

    // 4. Backward DCE from d, out, and all macro inputs!
    const int num_raw = (int)raw_gates.size();
    std::vector<uint8_t> live(num_raw, 0);
    auto mark_lit = [&](uint32_t l) {
        int nid = (int)(l >> 1);
        if (nid >= first_gate) live[nid - first_gate] = 1;
    };
    for (int f = 0; f < F; f++) if (seq_vis[ff_base + f]) mark_lit(sig_to_lit[c.d[f]]);
    for (int j = 0; j < O; j++) mark_lit(sig_to_lit[c.out[j]]);
    if (use_macros) {
        for (const auto& sm : stage_macros) {
            for (int mid : sm) {
                for (int s : arith.macros[mid].inA_sig) mark_lit(sig_to_lit[s]);
                for (int s : arith.macros[mid].inB_sig) mark_lit(sig_to_lit[s]);
            }
        }
    }
    int num_live = 0;
    for (int gi = num_raw - 1; gi >= 0; gi--) {
        if (!live[gi]) continue;
        num_live++;
        const SimpGate& g = raw_gates[gi];
        mark_lit(g.l0);
        mark_lit(g.l1);
        if (g.op == 2) mark_lit(g.l2);
    }

    // 5. Compact live gates preserving stage order + eliminate ALL NORs!
    std::vector<uint32_t> old_to_new_lit(num_raw, 0);
    auto remap_lit = [&](uint32_t l) -> uint32_t {
        int nid = (int)(l >> 1);
        if (nid >= first_gate) return old_to_new_lit[nid - first_gate] ^ (l & 1u);
        return l;
    };

    SimplifiedDAG dag;
    dag.I = I;
    dag.F = F;
    dag.O = O;
    dag.num_mouts = num_mouts;
    dag.first_gate_node = first_gate;
    dag.gates.resize(num_live);
    dag.stage_g_start.assign(num_stages + 1, 0);
    dag.stage_macros = std::move(stage_macros);
    if (use_macros) dag.macros = std::move(arith.macros);

    int out_idx = 0;
    int cur_s = 0;
    for (int gi = 0; gi < num_raw; gi++) {
        if (!live[gi]) continue;
        while (cur_s < raw_stage[gi]) {
            cur_s++;
            dag.stage_g_start[cur_s] = out_idx;
        }
        const SimpGate& og = raw_gates[gi];
        uint32_t new_nid = (uint32_t)(first_gate + out_idx);
        uint32_t nl0 = remap_lit(og.l0);
        uint32_t nl1 = remap_lit(og.l1);
        uint32_t nl2 = (og.op == 2) ? remap_lit(og.l2) : 0u;

        if (og.op == 0) {
            if ((nl0 & 1u) && (nl1 & 1u)) {
                dag.gates[out_idx] = { 3, nl0 ^ 1u, nl1 ^ 1u, 0u };
                old_to_new_lit[gi] = (new_nid << 1) | 1u;
            } else {
                dag.gates[out_idx] = { 0, nl0, nl1, 0u };
                old_to_new_lit[gi] = (new_nid << 1);
            }
        } else if (og.op == 1) {
            uint32_t flip = (nl0 & 1u) ^ (nl1 & 1u);
            dag.gates[out_idx] = { 1, nl0 & ~1u, nl1 & ~1u, 0u };
            old_to_new_lit[gi] = (new_nid << 1) | flip;
        } else {
            if (nl0 & 1u) { nl0 ^= 1u; std::swap(nl1, nl2); }
            uint32_t flip = nl1 & 1u;
            nl1 ^= flip;
            nl2 ^= flip;
            dag.gates[out_idx] = { 2, nl0, nl1, nl2 };
            old_to_new_lit[gi] = (new_nid << 1) | flip;
        }
        out_idx++;
    }
    while (cur_s < num_stages) {
        cur_s++;
        dag.stage_g_start[cur_s] = out_idx;
    }

    dag.d_lit.resize(F);
    for (int f = 0; f < F; f++) {
        dag.d_lit[f] = seq_vis[ff_base + f] ? remap_lit(sig_to_lit[c.d[f]]) : 0u;
    }
    dag.o_lit.resize(O);
    for (int j = 0; j < O; j++) dag.o_lit[j] = remap_lit(sig_to_lit[c.out[j]]);

    if (use_macros) {
        dag.macro_inA_base.resize(dag.macros.size(), 0);
        dag.macro_inB_base.resize(dag.macros.size(), 0);
        for (size_t mid = 0; mid < dag.macros.size(); mid++) {
            const auto& m = dag.macros[mid];
            dag.macro_inA_base[mid] = (int)dag.min_lits.size();
            for (int s : m.inA_sig) dag.min_lits.push_back(remap_lit(sig_to_lit[s]));
            dag.macro_inB_base[mid] = (int)dag.min_lits.size();
            for (int s : m.inB_sig) dag.min_lits.push_back(remap_lit(sig_to_lit[s]));
        }
    }
    return dag;
}

// ============================================================================
// Direct-to-VirtualAlloc x86-64 AVX2 Emitter
// ============================================================================
struct JitBuffer {
    uint8_t* ptr = nullptr;
    size_t size = 0;
    size_t capacity = 0;
    JitBuffer() = default;
    ~JitBuffer() { release(); }
    JitBuffer(const JitBuffer&) = delete;
    JitBuffer& operator=(const JitBuffer&) = delete;
    JitBuffer(JitBuffer&& o) noexcept : ptr(o.ptr), size(o.size), capacity(o.capacity) {
        o.ptr = nullptr; o.size = 0; o.capacity = 0;
    }
    JitBuffer& operator=(JitBuffer&& o) noexcept {
        if (this != &o) {
            release();
            ptr = o.ptr; size = o.size; capacity = o.capacity;
            o.ptr = nullptr; o.size = 0; o.capacity = 0;
        }
        return *this;
    }
    bool allocate(size_t cap) {
#ifdef _WIN32
        capacity = (cap + 4095) & ~size_t(4095);
        ptr = (uint8_t*)VirtualAlloc(nullptr, capacity, MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE);
        size = 0;
        return ptr != nullptr;
#else
        return false;
#endif
    }
    void make_executable(size_t used_size) {
#ifdef _WIN32
        size = used_size;
        if (ptr && size > 0) {
            DWORD old_prot = 0;
            VirtualProtect(ptr, size, PAGE_EXECUTE_READ, &old_prot);
            FlushInstructionCache(GetCurrentProcess(), ptr, size);
        }
#endif
    }
    void release() {
#ifdef _WIN32
        if (ptr) { VirtualFree(ptr, 0, MEM_RELEASE); ptr = nullptr; size = 0; capacity = 0; }
#endif
    }
};

struct RawEmitter {
    uint8_t* base = nullptr;
    uint8_t* p = nullptr;

    inline size_t pos() const { return (size_t)(p - base); }
    inline void u8(uint8_t x) { *p++ = x; }
    inline void i32(int32_t x) { std::memcpy(p, &x, 4); p += 4; }

    inline void vex_rrr(uint8_t op, int dst, int src1, int src2) {
        uint8_t R = (dst < 8) ? 0x80u : 0x00u;
        uint8_t vvvv = (uint8_t)(((~src1) & 15) << 3);
        if (src2 < 8) {
            p[0] = 0xC5;
            p[1] = R | vvvv | 0x05;
            p[2] = op;
            p[3] = (uint8_t)(0xC0 | ((dst & 7) << 3) | (src2 & 7));
            p += 4;
        } else {
            p[0] = 0xC4;
            p[1] = R | 0x41;
            p[2] = vvvv | 0x05;
            p[3] = op;
            p[4] = (uint8_t)(0xC0 | ((dst & 7) << 3) | (src2 & 7));
            p += 5;
        }
    }

    inline void vex_rrm(uint8_t op, int dst, int src1, int base_reg, int32_t disp) {
        uint8_t R = (dst < 8) ? 0x80u : 0x00u;
        uint8_t vvvv = (uint8_t)(((~src1) & 15) << 3);
        if (base_reg < 8) {
            p[0] = 0xC5;
            p[1] = R | vvvv | 0x05;
            p[2] = op;
            p += 3;
        } else {
            p[0] = 0xC4;
            p[1] = R | 0x41;
            p[2] = vvvv | 0x05;
            p[3] = op;
            p += 4;
        }
        uint8_t rm = (uint8_t)(base_reg & 7);
        uint8_t reg_f = (uint8_t)((dst & 7) << 3);
        if (disp == 0 && rm != 5) {
            *p++ = reg_f | rm;
        } else if (disp >= -128 && disp <= 127) {
            p[0] = 0x40 | reg_f | rm;
            p[1] = (uint8_t)(int8_t)disp;
            p += 2;
        } else {
            *p++ = 0x80 | reg_f | rm;
            std::memcpy(p, &disp, 4);
            p += 4;
        }
    }

    inline void vpand_r(int d, int a, int b) { vex_rrr(0xDB, d, a, b); }
    inline void vpor_r(int d, int a, int b)  { vex_rrr(0xEB, d, a, b); }
    inline void vpxor_r(int d, int a, int b) { vex_rrr(0xEF, d, a, b); }
    inline void vpandn_r(int d, int a, int b){ vex_rrr(0xDF, d, a, b); }

    inline void vpand_m(int d, int a, int breg, int32_t disp) { vex_rrm(0xDB, d, a, breg, disp); }
    inline void vpor_m(int d, int a, int breg, int32_t disp)  { vex_rrm(0xEB, d, a, breg, disp); }
    inline void vpxor_m(int d, int a, int breg, int32_t disp) { vex_rrm(0xEF, d, a, breg, disp); }
    inline void vpandn_m(int d, int a, int breg, int32_t disp){ vex_rrm(0xDF, d, a, breg, disp); }

    inline void vmovdqa_load(int d, int breg, int32_t disp)  { vex_rrm(0x6F, d, 0, breg, disp); }
    inline void vmovdqa_store(int breg, int32_t disp, int s) { vex_rrm(0x7F, s, 0, breg, disp); }

    inline void vmovdqa_xmm_rsp(int r, int32_t disp, bool store) {
        uint8_t R = (r < 8) ? 0x80u : 0x00u;
        u8(0xC5);
        u8(R | 0x79);
        u8(store ? 0x7F : 0x6F);
        uint8_t reg_f = (uint8_t)((r & 7) << 3);
        if (disp == 0) {
            u8(0x04 | reg_f); u8(0x24);
        } else if (disp >= -128 && disp <= 127) {
            u8(0x44 | reg_f); u8(0x24); u8((uint8_t)(int8_t)disp);
        } else {
            u8(0x84 | reg_f); u8(0x24); i32(disp);
        }
    }

    inline void lea_rax_disp32(int reg, int32_t disp) {
        u8(reg < 8 ? 0x48 : 0x4C);
        u8(0x8D);
        u8((uint8_t)(0x80 | ((reg & 7) << 3) | 0));
        i32(disp);
    }

    void emit_prologue(int32_t hot_off) {
        u8(0x53); u8(0x55); u8(0x56); u8(0x57);
        u8(0x41); u8(0x54); u8(0x41); u8(0x55); u8(0x41); u8(0x56); u8(0x41); u8(0x57);
        u8(0x48); u8(0x81); u8(0xEC); i32(168);
        for (int r = 6; r < 16; r++) vmovdqa_xmm_rsp(r, (r - 6) * 16, true);
        u8(0x48); u8(0x89); u8(0xC8); // mov rax, rcx
        u8(0x48); u8(0x89); u8(0xD6); // mov rsi, rdx
        u8(0x4C); u8(0x89); u8(0xC7); // mov rdi, r8
        static const int hot_bases[11] = { 1, 2, 3, 5, 8, 9, 10, 11, 13, 14, 15 };
        for (int k = 0; k < 11; k++) lea_rax_disp32(hot_bases[k], hot_off + 128 + k * 256);
    }

    void emit_epilogue() {
        for (int r = 6; r < 16; r++) vmovdqa_xmm_rsp(r, (r - 6) * 16, false);
        u8(0xC5); u8(0xF8); u8(0x77);
        u8(0x48); u8(0x81); u8(0xC4); i32(168);
        u8(0x41); u8(0x5F); u8(0x41); u8(0x5E); u8(0x41); u8(0x5D); u8(0x41); u8(0x5C);
        u8(0x5F); u8(0x5E); u8(0x5D); u8(0x5B);
        u8(0xC3);
    }
};

struct CompiledCircuit {
    JitBuffer code;
    using JitFn = void (*)(uint8_t* state_base, uint8_t* ff_cur, uint8_t* ff_nxt);
    std::vector<JitFn> stage_fns;
    std::vector<std::vector<int>> stage_macros;
    std::vector<ArithMacro> macros;
    int32_t off_const0 = 0;
    int32_t off_const1 = 0;
    int32_t off_pi = 0;
    int32_t off_out = 0;
    int32_t off_mout = 0;
    int32_t off_min = 0;
    int32_t off_hot = 0;
    int32_t off_cold = 0;
    size_t state_bytes = 0;
};

static CompiledCircuit compile_dag_jit(SimplifiedDAG& dag) {
    const int I = dag.I, F = dag.F, O = dag.O;
    const int num_mouts = dag.num_mouts;
    const int mout_base = 1 + I + F;
    const int first_gate = dag.first_gate_node;
    const int G = (int)dag.gates.size();
    const int total_nodes = first_gate + G;
    const int num_stages = (int)dag.stage_macros.size();
    const int INF = std::numeric_limits<int>::max();

    // Assign dedicated macro_in slots ONLY for macro inputs that come from scalar gates!
    // (const/PI/FF/macro_out inputs are read directly from their fixed state_base / ff_cur locations!)
    std::vector<int> min_slot_for_idx(dag.min_lits.size(), -1);
    std::vector<int> min_head(G, -1), min_nxt_link;
    int num_mins = 0;
    if (!dag.min_lits.empty()) {
        // Deduplicate by scalar node id (since multiple macros can read the same scalar gate!)
        std::vector<int> gate_to_min_slot(G, -1);
        for (size_t k = 0; k < dag.min_lits.size(); k++) {
            int nid = (int)(dag.min_lits[k] >> 1);
            if (nid >= first_gate) {
                int gi = nid - first_gate;
                if (gate_to_min_slot[gi] < 0) {
                    gate_to_min_slot[gi] = num_mins++;
                    min_nxt_link.push_back(min_head[gi]);
                    min_head[gi] = gate_to_min_slot[gi];
                }
                min_slot_for_idx[k] = gate_to_min_slot[gi];
            }
        }
    }

    std::vector<int> last_use(total_nodes, -1);
    std::vector<int> next_use_in((size_t)G * 3, INF);

    std::vector<int> ff_head(G, -1), ff_nxt_link(F, -1);
    std::vector<int> out_head(G, -1), out_nxt_link(O, -1);
    std::vector<int> non_gate_ff, non_gate_out;
    for (int f = 0; f < F; f++) {
        int nid = (int)(dag.d_lit[f] >> 1);
        if (nid >= first_gate) {
            int gi = nid - first_gate;
            ff_nxt_link[f] = ff_head[gi];
            ff_head[gi] = f;
        } else {
            non_gate_ff.push_back(f);
        }
    }
    for (int j = 0; j < O; j++) {
        int nid = (int)(dag.o_lit[j] >> 1);
        if (nid >= first_gate) {
            int gi = nid - first_gate;
            out_nxt_link[j] = out_head[gi];
            out_head[gi] = j;
        } else {
            non_gate_out.push_back(j);
        }
    }

    std::vector<int> next_seen(total_nodes, INF);
    for (int i = G - 1; i >= 0; i--) {
        const SimpGate& g = dag.gates[i];
        int n_in = (g.op == 2) ? 3 : 2;
        uint32_t ls[3] = { g.l0, g.l1, g.l2 };
        for (int p = n_in - 1; p >= 0; p--) {
            int nid = (int)(ls[p] >> 1);
            next_use_in[(size_t)i * 3 + p] = next_seen[nid];
            if (last_use[nid] < i) last_use[nid] = i;
            next_seen[nid] = i;
        }
    }

    std::vector<uint8_t> is_cold(G, 0);
    std::vector<int> hot_die_cnt(G + 1, 0);
    std::vector<int> cold_die_cnt(G + 1, 0);
    int cur_hot = 0, max_hot = 0;
    int cur_cold = 0, max_cold = 0;
    for (int i = 0; i < G; i++) {
        int lu = last_use[first_gate + i];
        if (lu > i) {
            if (lu - i > 2048) {
                is_cold[i] = 1;
                cur_cold++;
                if (cur_cold > max_cold) max_cold = cur_cold;
                cold_die_cnt[lu]++;
            } else {
                cur_hot++;
                if (cur_hot > max_hot) max_hot = cur_hot;
                hot_die_cnt[lu]++;
            }
        }
        cur_hot -= hot_die_cnt[i];
        cur_cold -= cold_die_cnt[i];
    }
    int max_hot_slots = std::max(96, max_hot + 32);
    int max_cold_slots = std::max(1, max_cold + 32);

    // Recycle mout slots across macro + scalar execution steps, and detect pure-FF taps!
    std::vector<int32_t> mout_phys_slot(num_mouts, -1);
    std::vector<int32_t> mout_direct_ff(num_mouts, -1); // if >=0, tap writes directly to ff_nxt[f] and needs NO mout slot!
    int peak_mout_slots = 0;

    if (num_mouts > 0) {
        // Assign sequential step IDs: for stage s, scalar_step = s_id++, then each macro in stage_macros[s] gets m_id++
        std::vector<int> scalar_stage_step(num_stages, 0);
        std::vector<int> macro_step(dag.macros.size(), -1);
        int cur_step = 0;
        for (int s = 0; s < num_stages; s++) {
            scalar_stage_step[s] = cur_step++;
            for (int mid : dag.stage_macros[s]) macro_step[mid] = cur_step++;
        }
        const int final_step = cur_step++;

        std::vector<int> mout_last_step(num_mouts, -1);
        std::vector<int> mout_ff_cnt(num_mouts, 0);
        std::vector<int> mout_first_ff(num_mouts, -1);
        std::vector<uint8_t> mout_has_non_direct(num_mouts, 0);

        // Scan scalar gates by stage
        for (int s = 0; s < num_stages; s++) {
            int st = scalar_stage_step[s];
            for (int i = dag.stage_g_start[s]; i < dag.stage_g_start[s + 1]; i++) {
                const SimpGate& g = dag.gates[i];
                int n_in = (g.op == 2) ? 3 : 2;
                uint32_t ls[3] = { g.l0, g.l1, g.l2 };
                for (int p = 0; p < n_in; p++) {
                    int nid = (int)(ls[p] >> 1);
                    if (nid >= mout_base && nid < first_gate) {
                        int mo = nid - mout_base;
                        if (st > mout_last_step[mo]) mout_last_step[mo] = st;
                        mout_has_non_direct[mo] = 1;
                    }
                }
            }
        }
        // Scan macro inputs
        for (int s = 0; s < num_stages; s++) {
            for (int mid : dag.stage_macros[s]) {
                int st = macro_step[mid];
                int W = dag.macros[mid].W;
                int bases[2] = { dag.macro_inA_base[mid], dag.macro_inB_base[mid] };
                for (int ab = 0; ab < 2; ab++) {
                    for (int k = 0; k < W; k++) {
                        int nid = (int)(dag.min_lits[bases[ab] + k] >> 1);
                        if (nid >= mout_base && nid < first_gate) {
                            int mo = nid - mout_base;
                            if (st > mout_last_step[mo]) mout_last_step[mo] = st;
                            mout_has_non_direct[mo] = 1;
                        }
                    }
                }
            }
        }
        // Scan non_gate_out and non_gate_ff
        for (int j : non_gate_out) {
            int nid = (int)(dag.o_lit[j] >> 1);
            if (nid >= mout_base && nid < first_gate) {
                int mo = nid - mout_base;
                mout_last_step[mo] = final_step;
                mout_has_non_direct[mo] = 1;
            }
        }
        for (int f : non_gate_ff) {
            uint32_t l = dag.d_lit[f];
            int nid = (int)(l >> 1);
            if (nid >= mout_base && nid < first_gate) {
                int mo = nid - mout_base;
                if (l & 1u) {
                    mout_last_step[mo] = final_step;
                    mout_has_non_direct[mo] = 1;
                } else {
                    mout_ff_cnt[mo]++;
                    mout_first_ff[mo] = f;
                }
            }
        }
        for (int mo = 0; mo < num_mouts; mo++) {
            if (!mout_has_non_direct[mo] && mout_ff_cnt[mo] == 1) {
                mout_direct_ff[mo] = mout_first_ff[mo];
            } else if (mout_ff_cnt[mo] > 0) {
                mout_last_step[mo] = final_step;
            }
        }

        // Remove direct-FF entries from non_gate_ff so epilogue doesn't copy them!
        std::vector<int> filtered_ngff;
        filtered_ngff.reserve(non_gate_ff.size());
        for (int f : non_gate_ff) {
            int nid = (int)(dag.d_lit[f] >> 1);
            if (nid >= mout_base && nid < first_gate && mout_direct_ff[nid - mout_base] == f) continue;
            filtered_ngff.push_back(f);
        }
        non_gate_ff.swap(filtered_ngff);

        // Build die lists per step and allocate recycled physical slots
        std::vector<int> die_head(final_step + 1, -1), die_nxt(num_mouts, -1);
        for (int mo = 0; mo < num_mouts; mo++) {
            int ls = mout_last_step[mo];
            if (ls >= 0 && mout_direct_ff[mo] < 0) {
                die_nxt[mo] = die_head[ls];
                die_head[ls] = mo;
            }
        }
        std::vector<int32_t> free_stk;
        free_stk.reserve(num_mouts);
        int next_bump = 0;
        for (int s = 0; s < num_stages; s++) {
            int sst = scalar_stage_step[s];
            for (int mo = die_head[sst]; mo != -1; mo = die_nxt[mo]) {
                if (mout_phys_slot[mo] >= 0) free_stk.push_back(mout_phys_slot[mo]);
            }
            for (int mid : dag.stage_macros[s]) {
                int mst = macro_step[mid];
                // First allocate output slots for this macro's non-direct taps
                for (const auto& tp : dag.macros[mid].taps) {
                    int mo = tp.mout_idx;
                    if (mout_direct_ff[mo] >= 0 || mout_last_step[mo] < 0) continue;
                    int32_t sl;
                    if (!free_stk.empty()) { sl = free_stk.back(); free_stk.pop_back(); }
                    else sl = next_bump++;
                    mout_phys_slot[mo] = sl;
                }
                // Then free inputs whose last use was this macro!
                for (int mo = die_head[mst]; mo != -1; mo = die_nxt[mo]) {
                    if (mout_phys_slot[mo] >= 0) free_stk.push_back(mout_phys_slot[mo]);
                }
            }
        }
        peak_mout_slots = next_bump;
    }

    CompiledCircuit cc;
    int32_t cur_off = 0;
    cc.off_const0 = cur_off; cur_off += 32;
    cc.off_const1 = cur_off; cur_off += 32;
    cc.off_pi     = cur_off; cur_off += std::max(1, I) * 32;
    cc.off_out    = cur_off; cur_off += std::max(1, O) * 32;
    cc.off_mout   = cur_off; cur_off += peak_mout_slots * 32;
    cc.off_min    = cur_off; cur_off += num_mins * 32;
    cc.off_hot    = cur_off; cur_off += max_hot_slots * 32;
    cc.off_cold   = cur_off; cur_off += max_cold_slots * 32;
    cc.state_bytes = (size_t)cur_off + 64;

    // Resolve macro input/output runtime byte offsets & build branchless FastTap arrays!
    cc.stage_macros = std::move(dag.stage_macros);
    cc.macros = std::move(dag.macros);
    auto resolve_in_ref = [&](int min_idx) -> ArithMacro::InRef {
        uint32_t lit = dag.min_lits[min_idx];
        int nid = (int)(lit >> 1);
        uint8_t inv = (uint8_t)(lit & 1u);
        if (nid == 0) return { inv ? cc.off_const1 : cc.off_const0, 0, 0 };
        if (nid <= I) return { cc.off_pi + (nid - 1) * 32, 0, inv };
        if (nid < mout_base) return { (nid - 1 - I) * 32, 1, inv }; // ff_cur
        if (nid < first_gate) return { cc.off_mout + mout_phys_slot[nid - mout_base] * 32, 0, inv };
        return { cc.off_min + min_slot_for_idx[min_idx] * 32, 0, inv };
    };
    for (size_t mid = 0; mid < cc.macros.size(); mid++) {
        auto& m = cc.macros[mid];
        int W = m.W;
        m.inA_ref.resize(W);
        m.inB_ref.resize(W);
        int bA = dag.macro_inA_base[mid], bB = dag.macro_inB_base[mid];
        for (int k = 0; k < W; k++) {
            m.inA_ref[k] = resolve_in_ref(bA + k);
            m.inB_ref[k] = resolve_in_ref(bB + k);
        }
        // Rebuild row_tap_start skipping dead taps (if any) and filling FastTap!
        int nrows = (m.kind == 0) ? W : 1;
        int stride = (m.kind == 0) ? W : 64;
        std::vector<int32_t> new_starts(nrows + 1, 0);
        m.fast_taps.clear();
        m.fast_taps.reserve(m.taps.size());
        for (int r = 0; r < nrows; r++) {
            new_starts[r] = (int32_t)m.fast_taps.size();
            for (int ti = m.row_tap_start[r]; ti < m.row_tap_start[r + 1]; ti++) {
                const auto& tp = m.taps[ti];
                int mo = tp.mout_idx;
                uint16_t bidx = (uint16_t)((m.kind == 0 && r == 0) ? tp.bit : (tp.kind * stride + tp.bit));
                if (mout_direct_ff[mo] >= 0) {
                    m.fast_taps.push_back({ mout_direct_ff[mo] * 32, bidx, 1 });
                } else if (mout_phys_slot[mo] >= 0) {
                    m.fast_taps.push_back({ cc.off_mout + mout_phys_slot[mo] * 32, bidx, 0 });
                }
            }
        }
        new_starts[nrows] = (int32_t)m.fast_taps.size();
        m.row_tap_start.swap(new_starts);
    }

    // Allocate JIT buffer for all stages (plus extra final stage for non-gate FF/out copies if macros ran!)
    const int total_jit_fns = num_stages + (cc.macros.empty() ? 0 : 1);
    size_t max_code_cap = (size_t)G * 28 + (size_t)(F + O + num_mins) * 24 + (size_t)total_jit_fns * 512 + 65536;
    if (!cc.code.allocate(max_code_cap)) return cc;

    RawEmitter em;
    em.base = cc.code.ptr;
    em.p = cc.code.ptr;

    struct MemLoc { int base; int32_t disp; };
    std::vector<int32_t> node_slot(total_nodes, -1);

    int hot_words = (max_hot_slots + 63) >> 6;
    std::vector<uint64_t> hot_free(hot_words, ~0ULL);
    auto alloc_hot = [&]() -> int32_t {
        for (int w = 0; w < hot_words; w++) {
            uint64_t m = hot_free[w];
            if (m) {
                int b = __builtin_ctzll(m);
                hot_free[w] = m & (m - 1);
                return (w << 6) | b;
            }
        }
        int32_t s = hot_words << 6;
        hot_free.push_back(~1ULL);
        hot_words++;
        return s;
    };
    auto free_hot = [&](int32_t s) { hot_free[s >> 6] |= (1ULL << (s & 63)); };

    std::vector<int32_t> cold_free_stk;
    cold_free_stk.reserve(max_cold_slots);
    int32_t next_cold_bump = 0;
    auto alloc_cold = [&]() -> int32_t {
        if (!cold_free_stk.empty()) {
            int32_t s = cold_free_stk.back();
            cold_free_stk.pop_back();
            return s;
        }
        return next_cold_bump++;
    };
    auto free_cold = [&](int32_t s) { cold_free_stk.push_back(s); };

    static const int hot_bases[11] = { 1, 2, 3, 5, 8, 9, 10, 11, 13, 14, 15 };
    auto get_hot_mem = [&](int32_t slot) -> MemLoc {
        if (slot < 88) return { hot_bases[slot >> 3], ((slot & 7) - 4) * 32 };
        return { 0, cc.off_hot + slot * 32 };
    };

    auto get_node_mem = [&](int nid) -> MemLoc {
        if (nid == 0) return { 0, cc.off_const0 };
        if (nid <= I) return { 0, cc.off_pi + (nid - 1) * 32 };
        if (nid < mout_base) return { 6, (nid - 1 - I) * 32 }; // ff_cur via rsi
        if (nid < first_gate) return { 0, cc.off_mout + mout_phys_slot[nid - mout_base] * 32 };
        int gi = nid - first_gate;
        int32_t s = node_slot[nid];
        if (is_cold[gi]) return { 0, cc.off_cold + s * 32 };
        return get_hot_mem(s);
    };

    int reg_node[16];
    int reg_next[16];
    bool reg_dirty[16];
    uint16_t free_reg_mask = 0xFFFFu;
    for (int r = 0; r < 16; r++) { reg_node[r] = -1; reg_next[r] = INF; reg_dirty[r] = false; }
    std::vector<int8_t> node_reg(total_nodes, -1);
    std::vector<uint8_t> node_in_mem(total_nodes, 0);
    for (int nid = 0; nid < first_gate; nid++) node_in_mem[nid] = 1;

    auto ensure_node_slot = [&](int nid) {
        if (node_slot[nid] < 0) {
            int gi = nid - first_gate;
            node_slot[nid] = is_cold[gi] ? alloc_cold() : alloc_hot();
        }
    };

    auto spill_reg = [&](int r) {
        int nid = reg_node[r];
        if (nid < 0) return;
        if (reg_dirty[r] && reg_next[r] < INF) {
            if (!node_in_mem[nid]) {
                ensure_node_slot(nid);
                MemLoc ml = get_node_mem(nid);
                em.vmovdqa_store(ml.base, ml.disp, r);
                node_in_mem[nid] = 1;
            }
        }
        node_reg[nid] = -1;
        reg_node[r] = -1;
        reg_next[r] = INF;
        reg_dirty[r] = false;
        free_reg_mask |= (uint16_t)(1u << r);
    };

    auto flush_all_regs = [&]() {
        for (int r = 0; r < 16; r++) {
            if (reg_node[r] >= 0) spill_reg(r);
        }
    };

    auto alloc_reg = [&](uint32_t pinned_mask) -> int {
        uint32_t avail = free_reg_mask & ~pinned_mask;
        if (avail) {
            int r = __builtin_ctz(avail);
            free_reg_mask &= (uint16_t)~(1u << r);
            return r;
        }
        int best = -1;
        int best_nu = -1;
        bool best_dirty = true;
        for (int r = 0; r < 16; r++) {
            if (pinned_mask & (1u << r)) continue;
            int nu = reg_next[r];
            bool d = reg_dirty[r];
            if (best < 0 || nu > best_nu || (nu == best_nu && !d && best_dirty)) {
                best = r;
                best_nu = nu;
                best_dirty = d;
            }
        }
        spill_reg(best);
        free_reg_mask &= (uint16_t)~(1u << best);
        return best;
    };

    auto load_into_reg = [&](int nid, int nu, uint32_t pinned_mask) -> int {
        int r = node_reg[nid];
        if (r >= 0) return r;
        r = alloc_reg(pinned_mask);
        MemLoc ml = get_node_mem(nid);
        em.vmovdqa_load(r, ml.base, ml.disp);
        reg_node[r] = nid;
        reg_next[r] = nu;
        reg_dirty[r] = false;
        node_reg[nid] = (int8_t)r;
        return r;
    };

    auto finish_input_use = [&](int nid, int nu) {
        int r = node_reg[nid];
        if (r >= 0) {
            reg_next[r] = nu;
            if (nu == INF) {
                node_reg[nid] = -1;
                reg_node[r] = -1;
                reg_dirty[r] = false;
                free_reg_mask |= (uint16_t)(1u << r);
            }
        }
        if (nu == INF && nid >= first_gate && node_slot[nid] >= 0) {
            int gi = nid - first_gate;
            if (is_cold[gi]) free_cold(node_slot[nid]);
            else free_hot(node_slot[nid]);
            node_slot[nid] = -1;
        }
    };

    auto emit_binop = [&](int cur_step, int binop, int na, int nu_a, int nb, int nu_b, int dst_nid, int dst_nu) -> int {
        int ra = node_reg[na];
        int rb = node_reg[nb];
        if (binop != 3 && ra < 0 && rb >= 0) {
            std::swap(na, nb);
            std::swap(nu_a, nu_b);
            std::swap(ra, rb);
        }
        uint32_t pin = 0;
        if (rb >= 0) pin |= (1u << rb);
        if (ra < 0) ra = load_into_reg(na, nu_a, pin);
        pin |= (1u << ra);

        bool use_mem_b = (rb < 0);
        if (use_mem_b && nu_b < INF) {
            if (free_reg_mask & ~pin) {
                if (nu_b - cur_step <= 64) {
                    rb = load_into_reg(nb, nu_b, pin);
                    use_mem_b = false;
                    pin |= (1u << rb);
                }
            } else if (nu_b - cur_step <= 16) {
                int max_nu = -1;
                for (int r = 0; r < 16; r++) {
                    if (pin & (1u << r)) continue;
                    if (reg_next[r] > max_nu) max_nu = reg_next[r];
                }
                if (nu_b < max_nu) {
                    rb = load_into_reg(nb, nu_b, pin);
                    use_mem_b = false;
                    pin |= (1u << rb);
                }
            }
        }

        int rd = -1;
        if (nu_a == INF && (na != nb || nu_b == INF)) {
            rd = ra;
        } else if (!use_mem_b && nu_b == INF) {
            rd = rb;
        } else {
            rd = alloc_reg(pin);
        }

        static const uint8_t opcodes[4] = { 0xDB, 0xEB, 0xEF, 0xDF };
        uint8_t opc = opcodes[binop];
        if (!use_mem_b) {
            em.vex_rrr(opc, rd, ra, rb);
        } else {
            MemLoc ml = get_node_mem(nb);
            em.vex_rrm(opc, rd, ra, ml.base, ml.disp);
        }

        if (na == nb) {
            finish_input_use(na, std::min(nu_a, nu_b));
        } else {
            finish_input_use(na, nu_a);
            finish_input_use(nb, nu_b);
        }

        if (reg_node[rd] >= 0) node_reg[reg_node[rd]] = -1;
        free_reg_mask &= (uint16_t)~(1u << rd);
        reg_node[rd] = dst_nid;
        reg_next[rd] = dst_nu;
        reg_dirty[rd] = (dst_nu < INF);
        node_reg[dst_nid] = (int8_t)rd;
        return rd;
    };

    cc.stage_fns.resize(total_jit_fns, nullptr);
    std::vector<size_t> fn_offsets(total_jit_fns, (size_t)-1);

    for (int s = 0; s < num_stages; s++) {
        int g0 = dag.stage_g_start[s];
        int g1 = dag.stage_g_start[s + 1];
        bool is_last_and_no_macros = (s == num_stages - 1 && cc.macros.empty());
        if (g0 == g1 && !is_last_and_no_macros) continue;

        while ((em.pos() & 15) != 0) em.u8(0x90);
        fn_offsets[s] = em.pos();
        em.emit_prologue(cc.off_hot);

        for (int i = g0; i < g1; i++) {
            const SimpGate& g = dag.gates[i];
            int dst_nid = first_gate + i;
            int dst_nu = (last_use[dst_nid] > i) ? next_seen[dst_nid] : INF;

            int rd = -1;
            if (g.op == 0) {
                int n0 = (int)(g.l0 >> 1), n1 = (int)(g.l1 >> 1);
                int p0 = (int)(g.l0 & 1u), p1 = (int)(g.l1 & 1u);
                int nu0 = next_use_in[(size_t)i * 3 + 0];
                int nu1 = next_use_in[(size_t)i * 3 + 1];
                if (p0 == 0 && p1 == 0) rd = emit_binop(i, 0, n0, nu0, n1, nu1, dst_nid, dst_nu);
                else if (p0 == 1 && p1 == 0) rd = emit_binop(i, 3, n0, nu0, n1, nu1, dst_nid, dst_nu);
                else rd = emit_binop(i, 3, n1, nu1, n0, nu0, dst_nid, dst_nu);
            } else if (g.op == 3) {
                int n0 = (int)(g.l0 >> 1), n1 = (int)(g.l1 >> 1);
                rd = emit_binop(i, 1, n0, next_use_in[(size_t)i * 3 + 0], n1, next_use_in[(size_t)i * 3 + 1], dst_nid, dst_nu);
            } else if (g.op == 1) {
                int n0 = (int)(g.l0 >> 1), n1 = (int)(g.l1 >> 1);
                rd = emit_binop(i, 2, n0, next_use_in[(size_t)i * 3 + 0], n1, next_use_in[(size_t)i * 3 + 1], dst_nid, dst_nu);
            } else {
                int ns = (int)(g.l0 >> 1), na = (int)(g.l1 >> 1), nb = (int)(g.l2 >> 1);
                int pb = (int)(g.l2 & 1u);
                int nus = next_use_in[(size_t)i * 3 + 0];
                int nua = next_use_in[(size_t)i * 3 + 1];
                int nub = next_use_in[(size_t)i * 3 + 2];

                int rs = node_reg[ns];
                int ra = node_reg[na];
                int rb = node_reg[nb];
                uint32_t pin = 0;
                if (ra >= 0) pin |= (1u << ra);
                if (rb >= 0) pin |= (1u << rb);
                if (rs < 0) rs = load_into_reg(ns, nus, pin);
                pin |= (1u << rs);
                if (pb == 1 && rb < 0) {
                    rb = load_into_reg(nb, nub, pin);
                    pin |= (1u << rb);
                }

                int t1 = (ra >= 0 && nua == INF) ? ra : alloc_reg(pin);
                pin |= (1u << t1);
                int t2 = (rb >= 0 && nub == INF) ? rb : ((nus == INF) ? rs : alloc_reg(pin));

                if (ra >= 0) em.vpandn_r(t1, rs, ra);
                else { MemLoc ml = get_node_mem(na); em.vpandn_m(t1, rs, ml.base, ml.disp); }

                if (pb == 0) {
                    if (rb >= 0) em.vpand_r(t2, rs, rb);
                    else { MemLoc ml = get_node_mem(nb); em.vpand_m(t2, rs, ml.base, ml.disp); }
                } else {
                    em.vpandn_r(t2, rb, rs);
                }

                em.vpor_r(t1, t1, t2);
                rd = t1;
                if (t2 != rs && t2 != rb) free_reg_mask |= (uint16_t)(1u << t2);

                finish_input_use(ns, nus);
                finish_input_use(na, nua);
                finish_input_use(nb, nub);

                if (reg_node[rd] >= 0) node_reg[reg_node[rd]] = -1;
                free_reg_mask &= (uint16_t)~(1u << rd);
                reg_node[rd] = dst_nid;
                reg_next[rd] = dst_nu;
                reg_dirty[rd] = (dst_nu < INF);
                node_reg[dst_nid] = (int8_t)rd;
            }

            // Store to macro_in slot if consumed by a macro!
            if (min_head[i] != -1) {
                em.vmovdqa_store(0, cc.off_min + min_head[i] * 32, rd);
            }

            // Eagerly store to ff_nxt and out
            if (ff_head[i] != -1 || out_head[i] != -1) {
                int inv_reg = -1;
                auto get_inv_reg = [&]() -> int {
                    if (inv_reg < 0) {
                        inv_reg = alloc_reg(1u << rd);
                        em.vpxor_m(inv_reg, rd, 0, cc.off_const1);
                    }
                    return inv_reg;
                };
                for (int f = ff_head[i]; f != -1; f = ff_nxt_link[f]) {
                    int rstore = (dag.d_lit[f] & 1u) ? get_inv_reg() : rd;
                    em.vmovdqa_store(7, f * 32, rstore);
                }
                for (int j = out_head[i]; j != -1; j = out_nxt_link[j]) {
                    int rstore = (dag.o_lit[j] & 1u) ? get_inv_reg() : rd;
                    em.vmovdqa_store(0, cc.off_out + j * 32, rstore);
                }
                if (inv_reg >= 0) free_reg_mask |= (uint16_t)(1u << inv_reg);
            }

            if (dst_nu == INF) {
                node_reg[dst_nid] = -1;
                reg_node[rd] = -1;
                reg_next[rd] = INF;
                reg_dirty[rd] = false;
                free_reg_mask |= (uint16_t)(1u << rd);
            } else if (is_cold[i]) {
                ensure_node_slot(dst_nid);
                MemLoc ml = get_node_mem(dst_nid);
                em.vmovdqa_store(ml.base, ml.disp, rd);
                node_in_mem[dst_nid] = 1;
                reg_dirty[rd] = false;
                if (dst_nu - i > 32) {
                    node_reg[dst_nid] = -1;
                    reg_node[rd] = -1;
                    reg_next[rd] = INF;
                    free_reg_mask |= (uint16_t)(1u << rd);
                }
            }
        }

        flush_all_regs();

        if (is_last_and_no_macros) {
            for (int f : non_gate_ff) {
                uint32_t l = dag.d_lit[f];
                int nid = (int)(l >> 1);
                int inv = (int)(l & 1u);
                if (nid == 0) em.vmovdqa_load(0, 0, inv ? cc.off_const1 : cc.off_const0);
                else {
                    MemLoc ml = get_node_mem(nid);
                    em.vmovdqa_load(0, ml.base, ml.disp);
                    if (inv) em.vpxor_m(0, 0, 0, cc.off_const1);
                }
                em.vmovdqa_store(7, f * 32, 0);
            }
            for (int j : non_gate_out) {
                uint32_t l = dag.o_lit[j];
                int nid = (int)(l >> 1);
                int inv = (int)(l & 1u);
                if (nid == 0) em.vmovdqa_load(0, 0, inv ? cc.off_const1 : cc.off_const0);
                else {
                    MemLoc ml = get_node_mem(nid);
                    em.vmovdqa_load(0, ml.base, ml.disp);
                    if (inv) em.vpxor_m(0, 0, 0, cc.off_const1);
                }
                em.vmovdqa_store(0, cc.off_out + j * 32, 0);
            }
        }
        em.emit_epilogue();
    }

    // If macros are present, emit final epilogue stage copying non_gate_ff / non_gate_out (after ALL macros ran!)
    if (!cc.macros.empty() && (!non_gate_ff.empty() || !non_gate_out.empty())) {
        while ((em.pos() & 15) != 0) em.u8(0x90);
        fn_offsets[num_stages] = em.pos();
        em.emit_prologue(cc.off_hot);
        for (int f : non_gate_ff) {
            uint32_t l = dag.d_lit[f];
            int nid = (int)(l >> 1);
            int inv = (int)(l & 1u);
            if (nid == 0) em.vmovdqa_load(0, 0, inv ? cc.off_const1 : cc.off_const0);
            else {
                MemLoc ml = get_node_mem(nid);
                em.vmovdqa_load(0, ml.base, ml.disp);
                if (inv) em.vpxor_m(0, 0, 0, cc.off_const1);
            }
            em.vmovdqa_store(7, f * 32, 0);
        }
        for (int j : non_gate_out) {
            uint32_t l = dag.o_lit[j];
            int nid = (int)(l >> 1);
            int inv = (int)(l & 1u);
            if (nid == 0) em.vmovdqa_load(0, 0, inv ? cc.off_const1 : cc.off_const0);
            else {
                MemLoc ml = get_node_mem(nid);
                em.vmovdqa_load(0, ml.base, ml.disp);
                if (inv) em.vpxor_m(0, 0, 0, cc.off_const1);
            }
            em.vmovdqa_store(0, cc.off_out + j * 32, 0);
        }
        em.emit_epilogue();
    }

    cc.code.make_executable(em.pos());
    for (int s = 0; s < total_jit_fns; s++) {
        if (fn_offsets[s] != (size_t)-1) {
            cc.stage_fns[s] = reinterpret_cast<CompiledCircuit::JitFn>(cc.code.ptr + fn_offsets[s]);
        }
    }
    return cc;
}

struct AlignedBuf {
    uint8_t* ptr = nullptr;
    AlignedBuf() = default;
    explicit AlignedBuf(size_t bytes) {
        size_t sz = (bytes + 63) & ~size_t(63);
#ifdef _WIN32
        ptr = (uint8_t*)_aligned_malloc(sz, 64);
#else
        ptr = (uint8_t*)std::aligned_alloc(64, sz);
#endif
        if (ptr) std::memset(ptr, 0, sz);
    }
    ~AlignedBuf() {
#ifdef _WIN32
        if (ptr) _aligned_free(ptr);
#else
        if (ptr) std::free(ptr);
#endif
    }
    AlignedBuf(const AlignedBuf&) = delete;
    AlignedBuf& operator=(const AlignedBuf&) = delete;
};

} // namespace

std::vector<uint64_t> simulate(const Circuit& c) {
    static bool omp_warmed = false;
    if (!omp_warmed) {
        omp_warmed = true;
        #pragma omp parallel
        {
            volatile int tid = omp_get_thread_num();
            (void)tid;
        }
    }

    const int I = c.I, F = c.F, G = c.G, O = c.O, M = c.M, T = c.T;
    if (M <= 0 || T <= 0 || O <= 0) return std::vector<uint64_t>(std::max(0, M), 0ULL);

    if ((uint64_t)G * (uint64_t)M * (uint64_t)T < 50000000ULL || G < 128) {
        return simulate_small(c);
    }

    ArithExtractResult arith = extract_arith_macros(c);
    SimplifiedDAG dag = build_simplified_dag(c, std::move(arith));
    CompiledCircuit cc = compile_dag_jit(dag);
    if (!cc.code.ptr) return simulate_small(c);

    std::vector<uint64_t> hash_tbl((size_t)T * O);
    for (int t = 0; t < T; t++)
        for (int j = 0; j < O; j++)
            hash_tbl[(size_t)t * O + j] = mix64((uint64_t)t * (uint64_t)O + (uint64_t)j);

    alignas(32) static const uint64_t nibble_masks[16][4] = {
        {0,0,0,0}, {~0ULL,0,0,0}, {0,~0ULL,0,0}, {~0ULL,~0ULL,0,0},
        {0,0,~0ULL,0}, {~0ULL,0,~0ULL,0}, {0,~0ULL,~0ULL,0}, {~0ULL,~0ULL,~0ULL,0},
        {0,0,0,~0ULL}, {~0ULL,0,0,~0ULL}, {0,~0ULL,0,~0ULL}, {~0ULL,~0ULL,0,~0ULL},
        {0,0,~0ULL,~0ULL}, {~0ULL,0,~0ULL,~0ULL}, {0,~0ULL,~0ULL,~0ULL}, {~0ULL,~0ULL,~0ULL,~0ULL}
    };

    std::vector<uint64_t> ans(M, 0ULL);
    const int num_batches = (M + 255) >> 8;
    const size_t ff_bytes = std::max<size_t>(64, (size_t)F * 32);
    const int nthreads = (cc.state_bytes > 1200000 && cc.macros.empty() && num_batches >= 8) ? 8 : std::min(16, num_batches);
    const int num_stages = (int)cc.stage_macros.size();
    const bool has_macros = !cc.macros.empty();

    #pragma omp parallel for schedule(static) num_threads(nthreads)
    for (int batch = 0; batch < num_batches; batch++) {
        const int m0 = batch << 8;
        const int cnt = std::min(256, M - m0);

        AlignedBuf state_buf(cc.state_bytes);
        AlignedBuf ff0_buf(ff_bytes);
        AlignedBuf ff1_buf(ff_bytes);

        uint8_t* state = state_buf.ptr;
        uint8_t* ff_cur = ff0_buf.ptr;
        uint8_t* ff_nxt = ff1_buf.ptr;

        std::memset(state + cc.off_const0, 0, 32);
        std::memset(state + cc.off_const1, 0xFF, 32);

        uint64_t rng[256];
        for (int b = 0; b < cnt; b++) rng[b] = mix64(c.seed ^ (uint64_t)(m0 + b));
        for (int b = cnt; b < 256; b++) rng[b] = 0;

        alignas(32) uint64_t acc[256] = {};
        uint64_t* pi_ptr = reinterpret_cast<uint64_t*>(state + cc.off_pi);
        const uint8_t* out_bytes = state + cc.off_out;

        for (int t = 0; t < T; t++) {
            for (int lane = 0; lane < 4; lane++) {
                uint64_t tmp[64];
                const int base = lane << 6;
                for (int b = 0; b < 64; b++) tmp[b] = splitmix64_next(&rng[base + b]);
                transpose64x64(tmp);
                for (int i = 0; i < I; i++) pi_ptr[(size_t)i * 4 + lane] = tmp[i];
            }

            if (!has_macros) {
                if (cc.stage_fns[0]) cc.stage_fns[0](state, ff_cur, ff_nxt);
            } else {
                for (int s = 0; s < num_stages; s++) {
                    if (cc.stage_fns[s]) cc.stage_fns[s](state, ff_cur, ff_nxt);
                    for (int mid : cc.stage_macros[s]) {
                        exec_arith_macro(cc.macros[mid], state, ff_cur, ff_nxt);
                    }
                }
                if (cc.stage_fns[num_stages]) cc.stage_fns[num_stages](state, ff_cur, ff_nxt);
            }

            const uint64_t* ht = &hash_tbl[(size_t)t * O];
            for (int j = 0; j < O; j++) {
                __m256i hv = _mm256_set1_epi64x((long long)ht[j]);
                const uint8_t* ob = out_bytes + (size_t)j * 32;
                for (int byte_idx = 0; byte_idx < 32; byte_idx++) {
                    uint8_t v = ob[byte_idx];
                    if (v) {
                        uint8_t lo = v & 15;
                        uint8_t hi = v >> 4;
                        __m256i* dst_lo = reinterpret_cast<__m256i*>(&acc[byte_idx * 8]);
                        if (lo) {
                            __m256i m = _mm256_load_si256(reinterpret_cast<const __m256i*>(nibble_masks[lo]));
                            *dst_lo = _mm256_xor_si256(*dst_lo, _mm256_and_si256(m, hv));
                        }
                        if (hi) {
                            __m256i m = _mm256_load_si256(reinterpret_cast<const __m256i*>(nibble_masks[hi]));
                            dst_lo[1] = _mm256_xor_si256(dst_lo[1], _mm256_and_si256(m, hv));
                        }
                    }
                }
            }

            std::swap(ff_cur, ff_nxt);
        }

        for (int b = 0; b < cnt; b++) ans[m0 + b] = acc[b];
    }
    return ans;
}

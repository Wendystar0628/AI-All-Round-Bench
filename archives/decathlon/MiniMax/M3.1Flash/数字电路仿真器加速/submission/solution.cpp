// solution.cpp - CPU 仿真加速
//   * 位并行(bit-slice)：每个 256 位向量同时处理 256 个激励
//   * AVX2 指令 + 运行时 JIT（每个门编译成 1~3 条机器码，无分支、无调度开销）
//   * 寄存器窗口融合：最近产生的值留在 ymm 寄存器里，省掉访存
//   * 线性扫描存储复用：活跃值只有 ~4 万个，整个值数组放进 L2
//   * OpenMP 多线程（每个线程一片激励组）
#include <cstdint>
#include <cstring>
#include <vector>
#include <algorithm>
#include <immintrin.h>
#ifdef _OPENMP
#include <omp.h>
#endif
#ifdef _WIN32
#include <windows.h>
#else
#include <sys/mman.h>
#endif

struct Circuit {
    int I, F, G, O, M, T;
    uint64_t seed;
    std::vector<int> d;              // size F: data input of each flip-flop
    std::vector<uint8_t> type;       // size G: 0 AND, 1 OR, 2 XOR, 3 NAND, 4 NOR, 5 XNOR, 6 NOT, 7 MUX
    std::vector<int> in0, in1, in2;  // size G: input signals; unused inputs are -1; MUX: in0=s, in1=a, in2=b
    std::vector<int> out;            // size O: primary outputs
};

namespace {

inline uint64_t sm64(uint64_t* s) {
    uint64_t z = (*s += 0x9E3779B97F4A7C15ULL);
    z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9ULL;
    z = (z ^ (z >> 27)) * 0x94D049BB133111EBULL;
    return z ^ (z >> 31);
}
inline uint64_t mix64(uint64_t x) { uint64_t s = x; return sm64(&s); }

// in-place transpose of a 64x64 bit matrix: row i = a[i]  ->  column b ends up in a[b]
inline void transpose64(uint64_t* a) {
    uint64_t m = 0x00000000FFFFFFFFULL;
    for (int j = 32; j; j >>= 1, m ^= m << j) {
        for (int k = 0; k < 64; k = (k + j + 1) & ~j) {
            uint64_t t = ((a[k] >> j) ^ a[k | j]) & m;
            a[k] ^= (t << j);
            a[k | j] ^= t;
        }
    }
}

// ---------------- x86-64 code emitter ----------------
#ifdef _WIN32
static const int BASEREG = 1;   // rcx: first argument in the Windows x64 ABI
#else
static const int BASEREG = 7;   // rdi: first argument in the SysV ABI
#endif

// VEX opcodes
enum { OP_PXOR = 0xEF, OP_PAND = 0xDB, OP_POR = 0xEB, OP_PANDN = 0xDF,
       OP_MOVDQU_L = 0x6F, OP_MOVDQU_S = 0x7F, OP_PCMPEQD = 0x76 };
enum { PP_66 = 1, PP_F3 = 2 };

struct Emit {
    std::vector<uint8_t> b;
    void u8(uint8_t x) { b.push_back(x); }
    void u32(int32_t x) { u8((uint8_t)x); u8((uint8_t)(x >> 8)); u8((uint8_t)(x >> 16)); u8((uint8_t)(x >> 24)); }
};

// dst = op(src1, src2); src2 may be [BASEREG + disp32]
// 2-byte VEX (C5): encodes R (dst), vvvv (src1), L, pp.  r/m operand must be a
// low register (rcx/rax/rdx/rbx) -> usable whenever src2 < 8 or src2 is memory.
// 3-byte VEX (C4): needed when src2 is ymm8..ymm15.
static inline void vex(Emit& e, uint8_t opcode, int dst, int src1, int src2, uint8_t pp, bool mem, int32_t disp) {
    const bool extR = (dst >= 8);
    if (!mem && src2 >= 8) {
        e.u8(0xC4);
        e.u8((uint8_t)((extR ? 0 : 0x80) | 0x40 | 0x00 | 0x01));
        e.u8((uint8_t)((((~src1) & 0xF) << 3) | 0x04 | pp));
        e.u8(opcode);
        e.u8((uint8_t)(0xC0 | ((dst & 7) << 3) | (src2 & 7)));
    } else {
        e.u8(0xC5);
        e.u8((uint8_t)((extR ? 0x00 : 0x80) | (((~src1) & 0xF) << 3) | 0x04 | pp));
        e.u8(opcode);
        if (mem) { e.u8((uint8_t)(0x81 | ((dst & 7) << 3))); e.u32(disp); }
        else      e.u8((uint8_t)(0xC0 | ((dst & 7) << 3) | (src2 & 7)));
    }
}

// ---------------- plan ----------------
static const int WREG = 13;   // window registers: ymm0..ymm12

struct Plan {
    int I = 0, F = 0, G = 0, O = 0;
    int N = 0;                 // number of evaluated gates
    int nslots = 0;            // value slots (32 bytes each)
    std::vector<uint8_t> ptype;   // by position
    std::vector<int> psrc;        // 3*N: producer position (-1 => not a gate / out of window)
    std::vector<int32_t> pofs;    // 3*N: byte offset of the value
    std::vector<int32_t> oofs;    // N: byte offset of the output slot
    std::vector<uint8_t> needStore;// N: whether the result must be written to memory
    std::vector<int> outslot;     // O
    std::vector<int> ffsrc;       // F
    bool ff2ff = false;
    int peak = 0;
};

void build(const Circuit& c, Plan& P) {
    const int I = c.I, F = c.F, G = c.G, O = c.O;
    P.I = I; P.F = F; P.G = G; P.O = O;
    const int NS = I + F + 2;              // signal id of gate 0
    const int FIXED = I + F + 2;           // slots: 0,1 = const; 2..I+1 = PI; I+2..I+F+1 = FF

    const std::vector<int>* inarr[3] = { &c.in0, &c.in1, &c.in2 };
    std::vector<int> pr0(G, -1), pr1(G, -1), pr2(G, -1);
    for (int k = 0; k < G; k++) {
        int* dst[3] = { &pr0[k], &pr1[k], &pr2[k] };
        for (int z = 0; z < 3; z++) {
            const int v = (*inarr[z])[k];
            if (v >= NS) {
                const int j = v - NS;
                if (j != k) *dst[z] = j;
            }
        }
    }

    // ---- reachability + DFS post-order (reverse topological order) ----
    std::vector<char> seen(G, 0);
    std::vector<int> roots;
    auto add_root = [&](int v) {
        if (v >= NS) { const int j = v - NS; if (!seen[j]) { seen[j] = 1; roots.push_back(j); } }
    };
    for (int v : c.d) add_root(v);
    for (int v : c.out) add_root(v);

    std::vector<char> state(G, 0);
    std::vector<std::pair<int,int>> stack;
    std::vector<int> order;
    order.reserve(roots.size() + 64);
    for (int r : roots) {
        if (state[r]) continue;
        state[r] = 1;
        stack.push_back({r, 0});
        while (!stack.empty()) {
            const int node = stack.back().first;
            int z = stack.back().second;
            int p = -1;
            while (z < 3) {
                const int cand = (z == 0 ? pr0[node] : (z == 1 ? pr1[node] : pr2[node]));
                z++;
                if (cand >= 0 && state[cand] == 0) { p = cand; break; }
            }
            stack.back().second = z;
            if (p >= 0) { state[p] = 1; stack.push_back({p, 0}); }
            else { stack.pop_back(); order.push_back(node); }
        }
    }
    // A node is emitted only after all of its dependencies were emitted, so
    // `order` already is a topological order (dependencies first).
    const int N = (int)order.size();
    P.N = N;

    std::vector<int> pos(G, -1);
    for (int i = 0; i < N; i++) pos[order[i]] = i;

    // consumer lists (CSR) over the reachable gates
    std::vector<int> cstart(G + 1, 0);
    for (int k = 0; k < G; k++) {
        const int p3[3] = { pr0[k], pr1[k], pr2[k] };
        for (int z = 0; z < 3; z++) if (p3[z] >= 0 && pos[p3[z]] >= 0) cstart[p3[z] + 1]++;
    }
    for (int k = 0; k < G; k++) cstart[k + 1] += cstart[k];
    std::vector<int> clist(cstart[G]);
    {
        std::vector<int> fill(cstart.begin(), cstart.end() - 1);
        for (int k = 0; k < G; k++) {
            const int p3[3] = { pr0[k], pr1[k], pr2[k] };
            for (int z = 0; z < 3; z++) {
                const int p = p3[z];
                if (p >= 0 && pos[p] >= 0) clist[fill[p]++] = k;
            }
        }
    }

    // effective last use (position), N means "needed until the end of the cycle"
    std::vector<int> elu(G, -1);
    for (int k = 0; k < G; k++) {
        if (pos[k] < 0) continue;
        for (int idx = cstart[k]; idx < cstart[k + 1]; idx++) {
            const int u = clist[idx];
            if (pos[u] > elu[k]) elu[k] = pos[u];
        }
    }
    auto pin = [&](int v) { if (v >= NS) { const int j = v - NS; if (pos[j] >= 0 && elu[j] < N) elu[j] = N; } };
    for (int v : c.d) pin(v);
    for (int v : c.out) pin(v);

    // ---- storage allocation (linear scan with slot reuse) ----
    std::vector<int> slotOf(G, -1);
    std::vector<std::vector<int>> rel(N + 2);
    for (int i = 0; i < N; i++) {
        const int k = order[i];
        if (elu[k] < 0) continue;
        rel[elu[k] + 1].push_back(k);
    }
    std::vector<int> freeSlots;
    int next = FIXED, peak = 0, live = 0;
    for (int i = 0; i < N; i++) {
        for (int k : rel[i]) { freeSlots.push_back(slotOf[k]); live--; }
        const int k = order[i];
        if (elu[k] < 0) continue;
        int s;
        if (!freeSlots.empty()) { s = freeSlots.back(); freeSlots.pop_back(); }
        else s = next++;
        slotOf[k] = s; live++;
        if (live > peak) peak = live;
    }
    P.nslots = next;
    P.peak = peak;

    // ---- per-position data ----
    P.ptype.resize(N);
    P.psrc.assign((size_t)N * 3, -1);
    P.pofs.assign((size_t)N * 3, 0);
    P.oofs.resize(N);
    P.needStore.assign(N, 0);
    for (int i = 0; i < N; i++) {
        const int k = order[i];
        P.ptype[i] = c.type[k];
        P.oofs[i] = (slotOf[k] >= 0 ? (int32_t)slotOf[k] : 0) * 32;
        for (int z = 0; z < 3; z++) {
            const int v = (*inarr[z])[k];
            int32_t off = 0;
            if (v >= 0) {
                if (v >= NS) {
                    const int j = v - NS;
                    off = (slotOf[j] >= 0 ? slotOf[j] : 0) * 32;
                    P.psrc[(size_t)i * 3 + z] = pos[j];
                } else off = v * 32;
            }
            P.pofs[(size_t)i * 3 + z] = off;
        }
        // A value must reach memory only if some consumer is >= WREG positions
        // away (it then cannot live in the register window any more), or if it
        // is pinned to the end of the cycle (primary output / FF data input).
        // Gates without any consumer are computed but never stored.
        P.needStore[i] = (elu[k] >= 0 && (elu[k] - i >= WREG || elu[k] >= N)) ? 1 : 0;
    }

    // outputs
    P.outslot.assign(O, 0);
    for (int j = 0; j < O; j++) {
        const int v = c.out[j];
        if (v >= NS) { const int jj = v - NS; P.outslot[j] = slotOf[jj]; }
        else P.outslot[j] = v;
    }
    // FF data inputs
    P.ffsrc.assign(F, 0);
    for (int f = 0; f < F; f++) {
        const int v = c.d[f];
        if (v >= NS) { const int jj = v - NS; P.ffsrc[f] = slotOf[jj]; }
        else {
            P.ffsrc[f] = v;
            if (v >= I + 2 && v < I + 2 + F) P.ff2ff = true;
        }
    }
}

// ---------------- JIT ----------------
static const int RTMP = 13;   // temp
static const int RTMP2 = 14;  // temp 2
static const int RONES = 15;  // all ones

static void build_code(const Plan& P, std::vector<uint8_t>& code) {
    Emit e;
    // prologue: RONES = all ones
    vex(e, OP_PCMPEQD, RONES, RONES, RONES, PP_66, false, 0);

    for (int i = 0; i < P.N; i++) {
        const int dst = i % WREG;
        const uint8_t ty = P.ptype[i];
        int reg[3]; int32_t off[3];
        for (int z = 0; z < 3; z++) {
            const int p = P.psrc[(size_t)i * 3 + z];
            if (p >= 0 && i - p < WREG) { reg[z] = p % WREG; off[z] = 0; }
            else { reg[z] = -1; off[z] = P.pofs[(size_t)i * 3 + z]; }
        }
        switch (ty) {
            case 0:   // AND
            case 1:   // OR
            case 2: { // XOR
                const uint8_t opc = (ty == 0 ? OP_PAND : (ty == 1 ? OP_POR : OP_PXOR));
                if (reg[0] >= 0) {
                    if (reg[1] >= 0) vex(e, opc, dst, reg[0], reg[1], PP_66, false, 0);
                    else vex(e, opc, dst, reg[0], 0, PP_66, true, off[1]);
                } else if (reg[1] >= 0) {
                    vex(e, opc, dst, reg[1], 0, PP_66, true, off[0]);
                } else {
                    vex(e, OP_MOVDQU_L, RTMP, 0, 0, PP_F3, true, off[0]);
                    vex(e, opc, dst, RTMP, 0, PP_66, true, off[1]);
                }
                break;
            }
            case 3:   // NAND = ~(a&b)
            case 4:   // NOR  = ~(a|b)
            case 5: { // XNOR = ~(a^b)
                const uint8_t opc = (ty == 3 ? OP_PAND : (ty == 4 ? OP_POR : OP_PXOR));
                if (reg[0] >= 0) {
                    if (reg[1] >= 0) vex(e, opc, dst, reg[0], reg[1], PP_66, false, 0);
                    else vex(e, opc, dst, reg[0], 0, PP_66, true, off[1]);
                } else if (reg[1] >= 0) {
                    vex(e, opc, dst, reg[1], 0, PP_66, true, off[0]);
                } else {
                    vex(e, OP_MOVDQU_L, RTMP, 0, 0, PP_F3, true, off[0]);
                    vex(e, opc, dst, RTMP, 0, PP_66, true, off[1]);
                }
                vex(e, OP_PXOR, dst, dst, RONES, PP_66, false, 0);
                break;
            }
            case 6: { // NOT
                if (reg[0] >= 0) vex(e, OP_PANDN, dst, reg[0], RONES, PP_66, false, 0);
                else {
                    vex(e, OP_MOVDQU_L, dst, 0, 0, PP_F3, true, off[0]);
                    vex(e, OP_PXOR, dst, dst, RONES, PP_66, false, 0);
                }
                break;
            }
            default: { // MUX(s,a,b) = a ^ ((a^b)&s)   in0=s, in1=a, in2=b
                const int rs = reg[0], ra = reg[1], rb = reg[2];
                const int32_t os = off[0], oa = off[1], ob = off[2];
                int srcA = ra;
                if (ra < 0) { vex(e, OP_MOVDQU_L, RTMP2, 0, 0, PP_F3, true, oa); srcA = RTMP2; }
                // t = a ^ b
                if (rb >= 0) vex(e, OP_PXOR, RTMP, srcA, rb, PP_66, false, 0);
                else vex(e, OP_PXOR, RTMP, srcA, 0, PP_66, true, ob);
                // t &= s
                if (rs >= 0) vex(e, OP_PAND, RTMP, RTMP, rs, PP_66, false, 0);
                else vex(e, OP_PAND, RTMP, RTMP, 0, PP_66, true, os);
                // dst = a ^ t
                vex(e, OP_PXOR, dst, srcA, RTMP, PP_66, false, 0);
                break;
            }
        }
        if (P.needStore[i]) vex(e, OP_MOVDQU_S, dst, 0, 0, PP_F3, true, P.oofs[i]);
    }
    e.u8(0xC3);   // ret
    code.swap(e.b);
}

typedef void (*CycleFn)(void*);

static CycleFn make_executable(const std::vector<uint8_t>& code) {
#ifdef _WIN32
    void* mem = VirtualAlloc(nullptr, code.size() + 64, MEM_COMMIT | MEM_RESERVE, PAGE_EXECUTE_READWRITE);
    if (!mem) return nullptr;
    memcpy(mem, code.data(), code.size());
    return (CycleFn)mem;
#else
    void* mem = mmap(nullptr, code.size() + 64, PROT_READ | PROT_WRITE | PROT_EXEC,
                      MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
    if (mem == MAP_FAILED) return nullptr;
    memcpy(mem, code.data(), code.size());
    return (CycleFn)mem;
#endif
}

} // namespace

std::vector<uint64_t> simulate(const Circuit& c) {
    Plan P; build(c, P);
    const int I = P.I, F = P.F, O = P.O, M = c.M, T = c.T;

    std::vector<uint64_t> w((size_t)T * O);
    for (int t = 0; t < T; t++)
        for (int j = 0; j < O; j++)
            w[(size_t)t * O + j] = mix64((uint64_t)t * (uint64_t)O + (uint64_t)j);

    std::vector<uint64_t> digest(M, 0);

    std::vector<uint8_t> code;
    build_code(P, code);
    CycleFn evalCycle = make_executable(code);

    const int GROUPS = (M + 255) / 256;

#pragma omp parallel
    {
        std::vector<uint64_t> prng(256, 0);
        std::vector<uint8_t> valbuf((size_t)P.nslots * 32 + 64);
        uint8_t* base = valbuf.data();
        const __m256i ones = _mm256_set1_epi64x(-1);
        uint64_t acc[4][64];
        uint64_t tbl[8][256];
        uint64_t col[4][64];

#pragma omp for schedule(static)
        for (int g = 0; g < GROUPS; g++) {
            const int baseStim = g * 256;
            for (int j = 0; j < 256; j++) {
                const int m = baseStim + j;
                prng[j] = (m < M) ? mix64(c.seed ^ (uint64_t)m) : 0;
            }
            for (int s = 0; s < 4; s++)
                for (int m = 0; m < 64; m++) acc[s][m] = 0;
            memset(base, 0, (size_t)(I + 2 + F) * 32);
            {   // slot 1 = constant one
                uint64_t* z = (uint64_t*)(base + 32);
                z[0] = z[1] = z[2] = z[3] = 0xFFFFFFFFFFFFFFFFULL;
            }

            for (int t = 0; t < T; t++) {
                // ---- primary inputs ----
                uint64_t raw[4][64];
                for (int s = 0; s < 4; s++)
                    for (int j = 0; j < 64; j++) raw[s][j] = sm64(&prng[s * 64 + j]);
                for (int s = 0; s < 4; s++) transpose64(raw[s]);
                for (int i = 0; i < I; i++) {
                    const __m256i v = _mm256_set_epi64x((long long)raw[3][i], (long long)raw[2][i],
                                                        (long long)raw[1][i], (long long)raw[0][i]);
                    _mm256_storeu_si256((__m256i*)(base + (size_t)(2 + i) * 32), v);
                }

                // ---- combinational evaluation (JIT compiled) ----
                if (evalCycle) evalCycle(base);
                else {
                    for (int i = 0; i < P.N; i++) {
                        const uint8_t ty = P.ptype[i];
                        const __m256i a = _mm256_loadu_si256((const __m256i*)(base + P.pofs[(size_t)i * 3 + 0]));
                        const __m256i b = _mm256_loadu_si256((const __m256i*)(base + P.pofs[(size_t)i * 3 + 1]));
                        __m256i r;
                        switch (ty) {
                            case 0: r = _mm256_and_si256(a, b); break;
                            case 1: r = _mm256_or_si256(a, b); break;
                            case 2: r = _mm256_xor_si256(a, b); break;
                            case 3: r = _mm256_xor_si256(_mm256_and_si256(a, b), ones); break;
                            case 4: r = _mm256_xor_si256(_mm256_or_si256(a, b), ones); break;
                            case 5: r = _mm256_xor_si256(_mm256_xor_si256(a, b), ones); break;
                            case 6: r = _mm256_xor_si256(a, ones); break;
                            default: {
                                const __m256i s = _mm256_loadu_si256((const __m256i*)(base + P.pofs[(size_t)i * 3 + 2]));
                                r = _mm256_xor_si256(b, _mm256_and_si256(_mm256_xor_si256(b, s), a));
                                break;
                            }
                        }
                        _mm256_storeu_si256((__m256i*)(base + P.oofs[i]), r);
                    }
                }

                // ---- primary outputs -> digest ----
                for (int j = 0; j < O; j++) {
                    const __m256i v = _mm256_loadu_si256((const __m256i*)(base + (size_t)P.outslot[j] * 32));
                    uint64_t tmp[4];
                    _mm256_storeu_si256((__m256i*)tmp, v);
                    for (int s = 0; s < 4; s++) col[s][j] = tmp[s];
                }
                for (int j = O; j < 64; j++)
                    for (int s = 0; s < 4; s++) col[s][j] = 0;
                for (int gg = 0; gg < 8; gg++) {
                    tbl[gg][0] = 0;
                    for (int v = 1; v < 256; v++) {
                        const int b = __builtin_ctz((unsigned)v);
                        const uint64_t ww = (8 * gg + b < O) ? w[(size_t)t * O + 8 * gg + b] : 0;
                        tbl[gg][v] = tbl[gg][v & (v - 1)] ^ ww;
                    }
                }
                for (int s = 0; s < 4; s++) {
                    transpose64(col[s]);
                    for (int m = 0; m < 64; m++) {
                        const uint64_t r = col[s][m];
                        acc[s][m] ^= tbl[0][r & 255] ^ tbl[1][(r >> 8) & 255] ^ tbl[2][(r >> 16) & 255]
                                  ^ tbl[3][(r >> 24) & 255] ^ tbl[4][(r >> 32) & 255] ^ tbl[5][(r >> 40) & 255]
                                  ^ tbl[6][(r >> 48) & 255] ^ tbl[7][(r >> 56) & 255];
                    }
                }

                // ---- flip-flop update ----
                if (P.ff2ff) {
                    std::vector<uint8_t> snap((size_t)F * 32);
                    for (int f = 0; f < F; f++)
                        _mm256_storeu_si256((__m256i*)&snap[(size_t)f * 32],
                                            _mm256_loadu_si256((const __m256i*)(base + (size_t)(I + 2 + f) * 32)));
                    for (int f = 0; f < F; f++) {
                        const int src = P.ffsrc[f];
                        const __m256i v = (src >= I + 2 && src < I + 2 + F)
                                    ? _mm256_loadu_si256((const __m256i*)&snap[(size_t)(src - I - 2) * 32])
                                    : _mm256_loadu_si256((const __m256i*)(base + (size_t)src * 32));
                        _mm256_storeu_si256((__m256i*)(base + (size_t)(I + 2 + f) * 32), v);
                    }
                } else {
                    for (int f = 0; f < F; f++) {
                        const __m256i v = _mm256_loadu_si256((const __m256i*)(base + (size_t)P.ffsrc[f] * 32));
                        _mm256_storeu_si256((__m256i*)(base + (size_t)(I + 2 + f) * 32), v);
                    }
                }
            }
            for (int s = 0; s < 4; s++)
                for (int m = 0; m < 64; m++) {
                    const int idx = baseStim + s * 64 + m;
                    if (idx < M) digest[idx] = acc[s][m];
                }
        }
    }
    return digest;
}

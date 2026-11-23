// Bit-parallel circuit simulator: netlist -> normalized op list (DFS order) -> AVX2 machine code (JIT).
#include <cstdint>
#include <cstring>
#include <cstdlib>
#include <vector>
#include <atomic>
#include <algorithm>
#include <immintrin.h>
#include <omp.h>
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#ifdef SIMSTATS
#include <cstdio>
#include <chrono>
#endif

struct Circuit {
    int I, F, G, O, M, T;
    uint64_t seed;
    std::vector<int> d;
    std::vector<uint8_t> type;
    std::vector<int> in0, in1, in2;
    std::vector<int> out;
};

std::vector<uint64_t> simulate(const Circuit& c);

// Trampoline: Win64 ABI function that sets up the fixed registers used by generated code.
//   rcx = T base (-> rdi), rdx = cur FF base (-> rsi), r8 = next FF base (-> rdx), r9 = code entry
extern "C" void sim_jit_tramp(void* tbase, void* cur, void* nxt, void* code);
__asm__(
    ".text\n"
    ".p2align 4\n"
    ".globl sim_jit_tramp\n"
    "sim_jit_tramp:\n"
    "  pushq %rbx\n  pushq %rbp\n  pushq %rsi\n  pushq %rdi\n"
    "  pushq %r12\n  pushq %r13\n  pushq %r14\n  pushq %r15\n"
    "  subq $168, %rsp\n"
    "  vmovdqu %xmm6, 0(%rsp)\n  vmovdqu %xmm7, 16(%rsp)\n  vmovdqu %xmm8, 32(%rsp)\n  vmovdqu %xmm9, 48(%rsp)\n"
    "  vmovdqu %xmm10, 64(%rsp)\n  vmovdqu %xmm11, 80(%rsp)\n  vmovdqu %xmm12, 96(%rsp)\n  vmovdqu %xmm13, 112(%rsp)\n"
    "  vmovdqu %xmm14, 128(%rsp)\n  vmovdqu %xmm15, 144(%rsp)\n"
    "  movq %rcx, %rdi\n  movq %rdx, %rsi\n  movq %r8, %rdx\n  movq %r9, %r12\n"
    "  leaq 256(%rdi), %rbx\n  leaq 512(%rdi), %rcx\n  leaq 768(%rdi), %rax\n  leaq 1024(%rdi), %rbp\n"
    "  leaq 1280(%rdi), %r8\n  leaq 1536(%rdi), %r9\n  leaq 1792(%rdi), %r10\n  leaq 2048(%rdi), %r11\n"
    "  leaq 2304(%rdi), %r13\n  leaq 2560(%rdi), %r14\n  leaq 2816(%rdi), %r15\n"
    "  callq *%r12\n"
    "  vzeroupper\n"
    "  vmovdqu 0(%rsp), %xmm6\n  vmovdqu 16(%rsp), %xmm7\n  vmovdqu 32(%rsp), %xmm8\n  vmovdqu 48(%rsp), %xmm9\n"
    "  vmovdqu 64(%rsp), %xmm10\n  vmovdqu 80(%rsp), %xmm11\n  vmovdqu 96(%rsp), %xmm12\n  vmovdqu 112(%rsp), %xmm13\n"
    "  vmovdqu 128(%rsp), %xmm14\n  vmovdqu 144(%rsp), %xmm15\n"
    "  addq $168, %rsp\n"
    "  popq %r15\n  popq %r14\n  popq %r13\n  popq %r12\n"
    "  popq %rdi\n  popq %rsi\n  popq %rbp\n  popq %rbx\n"
    "  retq\n"
);

namespace {

typedef uint32_t u32;
typedef uint64_t u64;
typedef int32_t i32;

#ifdef SIMSTATS
static double nowMs() {
    return std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now().time_since_epoch()).count();
}
#endif

// ---------------------------------------------------------------- memory helpers
static void* osAlloc(size_t bytes, bool exec) {
    return VirtualAlloc(nullptr, bytes, MEM_RESERVE | MEM_COMMIT, exec ? PAGE_EXECUTE_READWRITE : PAGE_READWRITE);
}
static void osFree(void* p) {
    if (p) VirtualFree(p, 0, MEM_RELEASE);
}
static void touchPages(void* p, size_t bytes) {
    volatile uint8_t* q = (volatile uint8_t*)p;
    for (size_t i = 0; i < bytes; i += 4096) q[i] = 0;
    if (bytes) q[bytes - 1] = 0;
}
struct Buf {
    uint8_t* p = nullptr;
    size_t cap = 0;
    // grow-only; contents are NOT preserved
    uint8_t* need(size_t bytes, bool exec = false) {
        if (bytes > cap) {
            osFree(p);
            cap = (bytes + (bytes >> 2) + 0xFFFFF) & ~(size_t)0xFFFFF;
            p = (uint8_t*)osAlloc(cap, exec);
            touchPages(p, cap);
        }
        return p;
    }
};

// ---------------------------------------------------------------- constants
enum : u32 { K_AND = 0, K_ANDN = 1, K_OR = 2, K_XOR = 3, K_MUX = 4, K_MUXN = 5, K_NOT = 6 };
struct Op {
    u32 a, b, c, k;
};
struct Rec {
    i32 a, b, c;
    uint8_t type, st;
    uint16_t fo;
};
static const i32 HOME_NONE = 0x7FFFFFFF;
static const int CH = 2048;            // ops per chunk
static const int CHMAX = CH + 8;
static const u32 INF = 0x3FFFFFFF;     // no further use
static const u32 INF2 = 0x40000000;    // empty register

// T-region layout (byte displacements relative to rdi):
//   locals:  slot u >= 0 at 32u - 128
//   ones:    -160
//   PI i:    -2208 + 32 i
//   global g: -2208 - 32 (g + 1)
static const i32 DISP_ONES = -160;
static const i32 DISP_PI0 = -2208;
static inline i32 acT(i32 disp) { return (i32)((u32)disp << 2); }
static inline i32 acCur(i32 f) { return (i32)(((u32)(32 * f - 128)) << 2) | 1; }
static inline i32 acNxt(i32 f) { return (i32)(((u32)(32 * f - 128)) << 2) | 2; }
static inline i32 acGlobal(i32 g) { return acT(DISP_PI0 - 32 * (g + 1)); }
static inline i32 acLocal(i32 u) { return acT(32 * u - 128); }
static inline i32 acPI(i32 i) { return acT(DISP_PI0 + 32 * i); }

struct OutLoc {
    i32 region;  // 0 T, 1 CUR, 2 NXT, 3 const
    i32 disp;
    u32 pol;
};
struct PostCopy {
    i32 dstF;
    i32 region;  // 0 T, 1 CUR, 2 NXT, 3 const
    i32 disp;
    u32 inv;
};

#ifdef SIMSTATS
static int g_fold = 0;
#endif
// ---------------------------------------------------------------- machine code emitter
static const int nearBase[12] = {7, 3, 1, 0, 5, 8, 9, 10, 11, 13, 14, 15};
struct Emit {
    uint8_t* p;
#ifdef SIMSTATS
    u64 nRR = 0, nRM = 0, nLoad = 0, nStore = 0;
#endif
    inline void rr(uint8_t opc, int d, int s1, int s2, bool comm) {
        if (comm && s2 >= 8 && s1 < 8) std::swap(s1, s2);
        if (s2 < 8) {
            p[0] = 0xC5;
            p[1] = (uint8_t)((d < 8 ? 0x80 : 0) | ((~s1 & 15) << 3) | 5);
            p[2] = opc;
            p[3] = (uint8_t)(0xC0 | ((d & 7) << 3) | s2);
            p += 4;
        } else {
            p[0] = 0xC4;
            p[1] = (uint8_t)((d < 8 ? 0x80 : 0) | 0x40 | 0x01);
            p[2] = (uint8_t)(((~s1 & 15) << 3) | 5);
            p[3] = opc;
            p[4] = (uint8_t)(0xC0 | ((d & 7) << 3) | (s2 & 7));
            p += 5;
        }
#ifdef SIMSTATS
        nRR++;
#endif
    }
    inline void memop(uint8_t opc, int d, int s1, i32 ac) {
        int sel = ac & 3;
        i32 disp = ac >> 2;
        int base;
#ifdef SIMSTATS
        if (g_fold) {
            // diagnostic: fold all non-local addresses into a tiny window (results are wrong; timing only)
            if (sel == 0) { if (disp < DISP_PI0) disp = DISP_PI0 - 32 * (1 + ((DISP_PI0 - disp) / 32 - 1) % g_fold); }
            else if (g_fold < 1000000) disp = 32 * (((disp + 128) / 32) % g_fold) - 128;
        }
#endif
        if (sel == 0) {
            u32 u = (u32)(disp + 128);
            if (u < 96u * 32u) {
                base = nearBase[u >> 8];
                disp = (i32)(u & 255) - 128;
            } else
                base = 7;
        } else
            base = sel == 1 ? 6 : 2;
        if (base < 8) {
            p[0] = 0xC5;
            p[1] = (uint8_t)((d < 8 ? 0x80 : 0) | ((~s1 & 15) << 3) | 5);
            p += 2;
        } else {
            p[0] = 0xC4;
            p[1] = (uint8_t)((d < 8 ? 0x80 : 0) | 0x40 | 0x01);
            p[2] = (uint8_t)(((~s1 & 15) << 3) | 5);
            p += 3;
        }
        p[0] = opc;
        if (disp >= -128 && disp < 128) {
            p[1] = (uint8_t)(0x40 | ((d & 7) << 3) | (base & 7));
            p[2] = (uint8_t)disp;
            p += 3;
        } else {
            p[1] = (uint8_t)(0x80 | ((d & 7) << 3) | (base & 7));
            memcpy(p + 2, &disp, 4);
            p += 6;
        }
    }
    inline void rm(uint8_t opc, int d, int s1, i32 ac) {
        memop(opc, d, s1, ac);
#ifdef SIMSTATS
        nRM++;
#endif
    }
    inline void load(int d, i32 ac) {
        memop(0x6F, d, 0, ac);
#ifdef SIMSTATS
        nLoad++;
#endif
    }
    inline void store(int s, i32 ac) {
        memop(0x7F, s, 0, ac);
#ifdef SIMSTATS
        nStore++;
#endif
    }
};
static const uint8_t OPC_AND = 0xDB, OPC_ANDN = 0xDF, OPC_OR = 0xEB, OPC_XOR = 0xEF;

// ---------------------------------------------------------------- per-thread state
struct ThreadCtx {
    // chunk compiler scratch
    std::vector<i32> la, lb, lc;        // localized operands per op
    std::vector<u32> na, nb, nc, nd;    // next-use positions
    std::vector<u32> last;              // per local id
    std::vector<int8_t> inReg;          // per local id
    std::vector<i32> mem;               // per local id: address code or HOME_NONE
    std::vector<i32> lowMap;            // PI/FF vid -> local id (or -1)
    std::vector<u32> hkey;              // hash keys (vid+1)
    std::vector<i32> hval;
    std::vector<u32> touchedLow, touchedHash;
    std::vector<u64> freeBits;          // local slot free bitmap (below high-water)
    int hw = 0, maxLocal = 0;
    // code block
    uint8_t* cb = nullptr;
    uint8_t* cbEnd = nullptr;
    Emit e;
    // runtime buffers
    Buf tbuf, ffbuf, misc;
    char pad[64];
};

struct Global {
    bool inited = false;
    int nThreads = 0;
    std::vector<ThreadCtx*> tc;
    // compile data
    Buf dchB, tszB, tkeyB, ffSlotB, stgOfFB, stgOfSlotB, recsB, opsB, ops1B, lvlB, ffhB, flgB, usesB, critB, chOffB, chListB, newIdxB, QB, stack2B, remB, homeB, dIdxB, stackB, ffNextB, codeB, idxB;
    std::vector<std::pair<int, u32>> postAlias;
    std::vector<u32> outLit;
    std::atomic<size_t> codeUsed{0};
    std::vector<i32> chunkEnd;
    std::vector<uint8_t*> chunkStart, chunkPatch;
    std::vector<i32> gfree, pendingFree;
    std::vector<PostCopy> post;
    std::vector<std::pair<int, int>> postDup;
    std::vector<u64> hoist, roots;
    std::vector<i32> farList, farTmp;
    std::vector<OutLoc> outs;
    int ng = 0;
    int nl = 0;
};
static Global g;

static const size_t CODE_BLOCK = 1 << 20;
static const size_t CHUNK_WORST = (size_t)CHMAX * 120 + 64;

// ---------------------------------------------------------------- chunk compiler
struct ChunkJob {
    const Op* ops;      // all ops
    const i32* home;    // per op index
    int start, end;     // op index range
    int I, F;
    const i32* ffSlot;
    u32 gvBase;
};

static inline int lowestFreeLocal(ThreadCtx& t) {
    int nw = (t.hw + 63) >> 6;
    for (int w = 0; w < nw; w++) {
        u64 x = t.freeBits[w];
        if (x) {
            int b = (int)_tzcnt_u64(x);
            t.freeBits[w] = x & (x - 1);
            return w * 64 + b;
        }
    }
    int s = t.hw++;
    if ((size_t)((t.hw + 63) >> 6) > t.freeBits.size()) t.freeBits.resize(t.freeBits.size() * 2 + 16, 0);
    return s;
}
static inline void freeLocal(ThreadCtx& t, int s) { t.freeBits[s >> 6] |= 1ull << (s & 63); }

static int g_H = 12;
static int g_X = 128;
static int g_THR = 32;
static int g_LH = 10;
static int g_LS = 4;
static int g_rootMode = 0;
static int g_ffid = 0;

static void compileChunk(ThreadCtx& t, const ChunkJob& job, uint8_t*& codeStart, uint8_t*& patchPos) {
    const int n = job.end - job.start;
    const u32 vLocalBase = job.gvBase + (u32)job.start;
    const u32 nLow = 1 + (u32)job.I + (u32)job.F;
    // ---- localize operands
    int ni = 0;
    t.touchedLow.clear();
    t.touchedHash.clear();
    const u32 HM = (u32)t.hkey.size() - 1;
    auto mapVid = [&](u32 vid) -> i32 {
        if (vid >= vLocalBase) return (i32)(vid - vLocalBase);
        if (vid < nLow) {
            i32 x = t.lowMap[vid];
            if (x < 0) {
                x = n + ni++;
                t.lowMap[vid] = x;
                t.touchedLow.push_back(vid);
                t.mem[x] = vid <= (u32)job.I ? acPI((i32)vid - 1) : acCur(job.ffSlot[vid - 1 - job.I]);
            }
            return x;
        }
        u32 h = (vid * 2654435761u) >> 18;
        h &= HM;
        for (;;) {
            u32 k = t.hkey[h];
            if (k == vid + 1) return t.hval[h];
            if (k == 0) {
                i32 x = n + ni++;
                t.hkey[h] = vid + 1;
                t.hval[h] = x;
                t.touchedHash.push_back(h);
                t.mem[x] = job.home[vid - job.gvBase];
                return x;
            }
            h = (h + 1) & HM;
        }
    };
    const Op* ops = job.ops + job.start;
    for (int p = 0; p < n; p++) {
        const Op& o = ops[p];
        t.la[p] = mapVid(o.a);
        if (o.k != K_NOT) t.lb[p] = mapVid(o.b);
        if (o.k == K_MUX || o.k == K_MUXN) t.lc[p] = mapVid(o.c);
    }
    for (u32 v : t.touchedLow) t.lowMap[v] = -1;
    for (u32 h : t.touchedHash) t.hkey[h] = 0;
    const int nid = n + ni;
    // ---- backward pass: next uses
    for (int i = 0; i < nid; i++) t.last[i] = INF;
    for (int p = n - 1; p >= 0; p--) {
        u32 k = ops[p].k;
        if (k == K_MUX || k == K_MUXN) {
            i32 c = t.lc[p];
            t.nc[p] = t.last[c];
            t.last[c] = (u32)p;
        }
        if (k != K_NOT) {
            i32 b = t.lb[p];
            t.nb[p] = t.last[b];
            t.last[b] = (u32)p;
        }
        i32 a = t.la[p];
        t.na[p] = t.last[a];
        t.last[a] = (u32)p;
        t.nd[p] = t.last[p];
    }
    // ---- forward pass
    for (int i = 0; i < n; i++) t.mem[i] = HOME_NONE;
    for (int i = 0; i < nid; i++) t.inReg[i] = -1;
    {
        int nw = (t.hw + 63) >> 6;
        for (int w = 0; w < nw; w++) t.freeBits[w] = 0;
        t.hw = 0;
    }
    if ((size_t)(t.cbEnd - t.cb) < CHUNK_WORST) {
        size_t off = g.codeUsed.fetch_add(CODE_BLOCK);
        t.cb = g.codeB.p + off;
        t.cbEnd = t.cb + CODE_BLOCK;
    }
    Emit& e = t.e;
    e.p = t.cb;
    codeStart = e.p;

    i32 rid[16];
    u32 rnu[16];
    for (int r = 0; r < 16; r++) {
        rid[r] = -1;
        rnu[r] = INF2;
    }
    int p = 0;
    auto getVictim = [&](u32 excl) -> int {
        int best = -1;
        u32 bn = 0;
        for (int r = 0; r < 16; r++) {
            if ((excl >> r) & 1) continue;
            if (best < 0 || rnu[r] > bn) {
                best = r;
                bn = rnu[r];
            }
        }
        return best;
    };
    auto evict = [&](int r) {
        i32 id = rid[r];
        if (id >= 0) {
            if (rnu[r] != INF && t.mem[id] == HOME_NONE) {
                int s = lowestFreeLocal(t);
                t.mem[id] = acLocal(s);
                e.store(r, t.mem[id]);
            }
            t.inReg[id] = -1;
            rid[r] = -1;
            rnu[r] = INF2;
        }
    };
    auto allocReg = [&](u32 excl) -> int {
        int r = getVictim(excl);
        evict(r);
        return r;
    };
    // try to bring a memory operand into a register (kept afterwards); returns reg or -1
    auto tryLoad = [&](i32 id, u32 nu, u32 excl) -> int {
        if (nu == INF || nu - (u32)p > (u32)g_H) return -1;
        int r = getVictim(excl);
        if (rnu[r] <= nu) return -1;
        evict(r);
        e.load(r, t.mem[id]);
        rid[r] = id;
        rnu[r] = (u32)p;
        t.inReg[id] = (int8_t)r;
        return r;
    };
    auto M = [](int r) -> u32 { return r >= 0 ? (1u << r) : 0u; };
    i32 defer[3];
    int ndefer;
    auto release = [&](i32 id, int r, u32 nu) {
        // operand id (in register r or memory) has next use nu after this op
        if (r >= 0 && rid[r] == id) rnu[r] = nu;
        if (nu == INF && id < n && t.mem[id] != HOME_NONE && job.home[job.start + id] == HOME_NONE) defer[ndefer++] = id;
    };
    auto takeDst = [&](int r) {
        // reuse register r (holding a value with no further use) as destination
        i32 id = rid[r];
        if (id >= 0) t.inReg[id] = -1;
        rid[r] = -1;
        rnu[r] = INF2;
    };
    for (p = 0; p < n; p++) {
        const u32 k = ops[p].k;
        const i32 hm = job.home[job.start + p];
        const u32 ndp = t.nd[p];
        ndefer = 0;
        int dst = -1;
        const bool dead = (ndp == INF && hm == HOME_NONE);
        if (k <= K_XOR && k != K_ANDN) {
            i32 a = t.la[p], b = t.lb[p];
            u32 na = t.na[p], nb = t.nb[p];
            if (!dead) {
                int ra = t.inReg[a], rb = t.inReg[b];
                const uint8_t opc = k == K_AND ? OPC_AND : k == K_OR ? OPC_OR : OPC_XOR;
                if (ra < 0 && rb >= 0) {
                    std::swap(a, b);
                    std::swap(na, nb);
                    std::swap(ra, rb);
                }
                if (ra < 0) {
                    // both in memory: prefer loading the one with the nearer next use
                    if (nb < na) {
                        std::swap(a, b);
                        std::swap(na, nb);
                    }
                    ra = tryLoad(a, na, 0);
                }
                if (ra >= 0 && rb < 0) rb = tryLoad(b, nb, M(ra));
                if (ra >= 0 && rb >= 0) {
                    if (na == INF) { dst = ra; takeDst(ra); }
                    else if (nb == INF) { dst = rb; takeDst(rb); }
                    else dst = allocReg(M(ra) | M(rb));
                    e.rr(opc, dst, ra, rb, true);
                } else if (ra >= 0) {
                    if (na == INF) { dst = ra; takeDst(ra); }
                    else dst = allocReg(M(ra));
                    e.rm(opc, dst, ra, t.mem[b]);
                } else {
                    dst = allocReg(0);
                    e.load(dst, t.mem[a]);
                    e.rm(opc, dst, dst, t.mem[b]);
                }
                release(a, ra, na);
                release(b, rb, nb);
            } else {
                release(a, t.inReg[a], na);
                release(b, t.inReg[b], nb);
            }
        } else if (k == K_ANDN) {
            i32 a = t.la[p], b = t.lb[p];
            u32 na = t.na[p], nb = t.nb[p];
            if (!dead) {
                int ra = t.inReg[a], rb = t.inReg[b];
                if (ra < 0) ra = tryLoad(a, na, M(rb));
                if (rb < 0) rb = tryLoad(b, nb, M(ra));
                if (ra >= 0) {
                    if (na == INF) { dst = ra; takeDst(ra); }
                    else if (rb >= 0 && nb == INF) { dst = rb; takeDst(rb); }
                    else dst = allocReg(M(ra) | M(rb));
                    if (rb >= 0) e.rr(OPC_ANDN, dst, ra, rb, false);
                    else e.rm(OPC_ANDN, dst, ra, t.mem[b]);
                } else {
                    dst = allocReg(M(rb));
                    e.load(dst, t.mem[a]);
                    if (rb >= 0) e.rr(OPC_ANDN, dst, dst, rb, false);
                    else e.rm(OPC_ANDN, dst, dst, t.mem[b]);
                }
                release(a, ra, na);
                release(b, rb, nb);
            } else {
                release(a, t.inReg[a], na);
                release(b, t.inReg[b], nb);
            }
        } else if (k == K_NOT) {
            i32 a = t.la[p];
            u32 na = t.na[p];
            if (!dead) {
                int ra = t.inReg[a];
                if (ra >= 0) {
                    if (na == INF) { dst = ra; takeDst(ra); }
                    else dst = allocReg(M(ra));
                    e.rm(OPC_XOR, dst, ra, acT(DISP_ONES));
                } else {
                    dst = allocReg(0);
                    e.load(dst, t.mem[a]);
                    e.rm(OPC_XOR, dst, dst, acT(DISP_ONES));
                }
                release(a, ra, na);
            } else
                release(a, t.inReg[a], na);
        } else {
            // MUX (r = s ? b : a) or MUXN (r = a ^ (s & ~(a ^ b)))
            i32 s = t.la[p], a = t.lb[p], b = t.lc[p];
            u32 ns = t.na[p], na = t.nb[p], nb = t.nc[p];
            if (!dead) {
                int rs = t.inReg[s], ra = t.inReg[a], rb = t.inReg[b];
                if (rs < 0) rs = tryLoad(s, ns, M(ra) | M(rb));
                if (ra < 0) ra = tryLoad(a, na, M(rs) | M(rb));
                if (rb < 0) rb = tryLoad(b, nb, M(rs) | M(ra));
                if (k == K_MUX && rs >= 0) {
                    // t1 = ~s & a ; t2 = s & b ; r = t1 | t2
                    int d1 = -1, d2 = -1;
                    u32 excl = M(rs) | M(ra) | M(rb);
                    bool aDies = (ra >= 0 && na == INF), bDies = (rb >= 0 && nb == INF);
                    if (aDies) d1 = ra;
                    if (bDies) d2 = rb;
                    if (d1 < 0) { d1 = allocReg(excl); excl |= M(d1); }
                    else takeDst(d1);
                    if (d2 < 0) {
                        if (ns == INF) {
                            // s dies: t2 can overwrite s after t1 is computed
                            d2 = rs;
                        } else
                            d2 = allocReg(excl | M(d1));
                    } else
                        takeDst(d2);
                    if (ra >= 0) e.rr(OPC_ANDN, d1, rs, ra, false);
                    else e.rm(OPC_ANDN, d1, rs, t.mem[a]);
                    if (rb >= 0) e.rr(OPC_AND, d2, rs, rb, true);
                    else e.rm(OPC_AND, d2, rs, t.mem[b]);
                    e.rr(OPC_OR, d1, d1, d2, true);
                    if (d2 == rs) takeDst(rs);
                    dst = d1;
                } else {
                    // t = a ^ b ; t = t & s (MUX) or ~t & s (MUXN) ; r = t ^ a
                    if (ra >= 0) {
                        if (rb >= 0 && nb == INF) { dst = rb; takeDst(rb); }
                        else dst = allocReg(M(ra) | M(rb) | M(rs));
                        if (rb >= 0) e.rr(OPC_XOR, dst, ra, rb, true);
                        else e.rm(OPC_XOR, dst, ra, t.mem[b]);
                        if (k == K_MUX) {
                            if (rs >= 0) e.rr(OPC_AND, dst, dst, rs, true);
                            else e.rm(OPC_AND, dst, dst, t.mem[s]);
                        } else {
                            if (rs >= 0) e.rr(OPC_ANDN, dst, dst, rs, false);
                            else e.rm(OPC_ANDN, dst, dst, t.mem[s]);
                        }
                        e.rr(OPC_XOR, dst, dst, ra, true);
                    } else {
                        if (rb >= 0) {
                            if (nb == INF) { dst = rb; takeDst(rb); }
                            else dst = allocReg(M(rb) | M(rs));
                            e.rm(OPC_XOR, dst, rb, t.mem[a]);
                        } else {
                            dst = allocReg(M(rs));
                            e.load(dst, t.mem[b]);
                            e.rm(OPC_XOR, dst, dst, t.mem[a]);
                        }
                        if (k == K_MUX) {
                            if (rs >= 0) e.rr(OPC_AND, dst, dst, rs, true);
                            else e.rm(OPC_AND, dst, dst, t.mem[s]);
                        } else {
                            if (rs >= 0) e.rr(OPC_ANDN, dst, dst, rs, false);
                            else e.rm(OPC_ANDN, dst, dst, t.mem[s]);
                        }
                        e.rm(OPC_XOR, dst, dst, t.mem[a]);
                    }
                }
                release(s, rs, ns);
                release(a, ra, na);
                release(b, rb, nb);
            } else {
                release(s, t.inReg[s], ns);
                release(a, t.inReg[a], na);
                release(b, t.inReg[b], nb);
            }
        }
        if (dst >= 0) {
            rid[dst] = p;
            rnu[dst] = ndp;
            t.inReg[p] = (int8_t)dst;
            if (hm != HOME_NONE) {
                e.store(dst, hm);
                t.mem[p] = hm;
            }
        }
        for (int i = 0; i < ndefer; i++) {
            i32 id = defer[i];
            i32 ac = t.mem[id];
            freeLocal(t, (ac >> 2) / 32 + 4);
            t.mem[id] = HOME_NONE;
        }
    }
    if (t.hw > t.maxLocal) t.maxLocal = t.hw;
    // chunk tail: jmp rel32 (patched later) or ret
    patchPos = e.p;
    e.p[0] = 0xE9;
    e.p += 5;
    t.cb = e.p;
}

// ---------------------------------------------------------------- bit-matrix transpose (64 x 64, 4 lanes)
static inline void transpose64x4(__m256i* A) {
    u64 m = 0x00000000FFFFFFFFull;
    for (int j = 32; j != 0; j >>= 1, m ^= (m << j)) {
        const __m256i mm = _mm256_set1_epi64x((long long)m);
        const __m128i cnt = _mm_cvtsi32_si128(j);
        for (int k = 0; k < 64; k = (k + j + 1) & ~j) {
            __m256i x = A[k], y = A[k + j];
            __m256i tt = _mm256_and_si256(_mm256_xor_si256(_mm256_srl_epi64(x, cnt), y), mm);
            A[k + j] = _mm256_xor_si256(y, tt);
            A[k] = _mm256_xor_si256(x, _mm256_sll_epi64(tt, cnt));
        }
    }
}
static inline u64 mix64(u64 x) {
    u64 z = x + 0x9E3779B97F4A7C15ull;
    z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9ull;
    z = (z ^ (z >> 27)) * 0x94D049BB133111EBull;
    return z ^ (z >> 31);
}
static inline __m256i mul64c(__m256i a, __m256i b) {
    __m256i ahi = _mm256_srli_epi64(a, 32), bhi = _mm256_srli_epi64(b, 32);
    __m256i lo = _mm256_mul_epu32(a, b);
    __m256i m1 = _mm256_mul_epu32(ahi, b), m2 = _mm256_mul_epu32(a, bhi);
    return _mm256_add_epi64(lo, _mm256_slli_epi64(_mm256_add_epi64(m1, m2), 32));
}

// ---------------------------------------------------------------- main
static void ensureThreads(int nt) {
    while ((int)g.tc.size() < nt) g.tc.push_back(nullptr);
    for (int i = 0; i < nt; i++)
        if (!g.tc[i]) {
            ThreadCtx* t = new ThreadCtx();
            t->la.resize(CHMAX); t->lb.resize(CHMAX); t->lc.resize(CHMAX);
            t->na.resize(CHMAX); t->nb.resize(CHMAX); t->nc.resize(CHMAX); t->nd.resize(CHMAX);
            t->last.resize(CHMAX * 4); t->inReg.resize(CHMAX * 4); t->mem.resize(CHMAX * 4);
            t->hkey.assign(16384, 0); t->hval.assign(16384, 0);
            t->freeBits.assign(64, 0);
            g.tc[i] = t;
        }
}

static std::vector<u64> simulateImpl(const Circuit& c) {
#ifdef SIMSTATS
    double t0 = nowMs();
    if (const char* hs = getenv("SIM_H")) g_H = atoi(hs);
    if (const char* hs = getenv("SIM_X")) g_X = atoi(hs);
    if (const char* hs = getenv("SIM_THR")) g_THR = atoi(hs);
    if (const char* hs = getenv("SIM_LH")) g_LH = atoi(hs);
    if (const char* hs = getenv("SIM_LS")) g_LS = atoi(hs);
    if (const char* hs = getenv("SIM_ROOT")) g_rootMode = atoi(hs);
    if (const char* hs = getenv("SIM_FFID")) g_ffid = atoi(hs);
    if (const char* hs = getenv("SIM_FOLD")) g_fold = atoi(hs);
#endif
    const int I = c.I, F = c.F, G = c.G, O = c.O, Mst = c.M, T = c.T;
    const int gbase = 2 + I + F;
    const u32 gvBase = 1 + (u32)I + (u32)F;
    int nt = omp_get_max_threads();
    if (nt < 1) nt = 1;
    ensureThreads(nt);
    // default capacities: sized for the full-scale problem so that the first (warm-up) call pre-faults them
    const size_t capG = std::max<size_t>((size_t)G, 500000), capF = std::max<size_t>((size_t)F, 8192);
    const size_t capN = capG + capF + 16;
    Rec* recs = (Rec*)g.recsB.need((capG + 16) * sizeof(Rec));
    Op* ops1 = (Op*)g.ops1B.need(capN * sizeof(Op));
    Op* ops = (Op*)g.opsB.need(capN * sizeof(Op));
    i32* lvl = (i32*)g.lvlB.need(capN * sizeof(i32));
    i32* ffh = (i32*)g.ffhB.need(capN * sizeof(i32));
    uint8_t* flg = (uint8_t*)g.flgB.need(capN);
    i32* uses = (i32*)g.usesB.need(capN * sizeof(i32));
    i32* crit = (i32*)g.critB.need(capN * sizeof(i32));
    i32* chOff = (i32*)g.chOffB.need((capN + 1) * sizeof(i32));
    i32* chList = (i32*)g.chListB.need(capN * sizeof(i32));
    i32* newIdx = (i32*)g.newIdxB.need(capN * sizeof(i32));
    i32* Q = (i32*)g.QB.need(capN * 2 * sizeof(i32));
    i32* stack2 = (i32*)g.stack2B.need(capN * sizeof(i32));
    i32* rem = (i32*)g.remB.need(capN * sizeof(i32));
    i32* dch = (i32*)g.dchB.need(capN * sizeof(i32));
    i32* home = (i32*)g.homeB.need(capN * sizeof(i32));
    i32* dIdx = (i32*)g.dIdxB.need((capG + 16) * sizeof(i32));
    i32* stack = (i32*)g.stackB.need((capG * 3 + 64) * sizeof(i32));
    i32* ffNext = (i32*)g.ffNextB.need((capF + 16) * sizeof(i32));
    i32* ffSlot = (i32*)g.ffSlotB.need((capF + 16) * sizeof(i32));
    i32* stgOfF = (i32*)g.stgOfFB.need((capF + 16) * sizeof(i32));
    i32* stgOfSlot = (i32*)g.stgOfSlotB.need((capF + 16) * sizeof(i32));
    i32* tsz = (i32*)g.tszB.need(capN * sizeof(i32));
    u32* tkey = (u32*)g.tkeyB.need(capN * sizeof(u32));
    {
        size_t worst = capN * 130 + ((size_t)nt + 4) * CODE_BLOCK;
        if (worst > g.codeB.cap) {
            osFree(g.codeB.p);
            g.codeB.cap = (worst + 0xFFFFF) & ~(size_t)0xFFFFF;
            g.codeB.p = (uint8_t*)osAlloc(g.codeB.cap, true);
            touchPages(g.codeB.p, std::min<size_t>(g.codeB.cap, (size_t)40 << 20));
        }
    }
    g.codeUsed.store(0);
    for (int i = 0; i < nt; i++) {
        ThreadCtx& t = *g.tc[i];
        t.cb = t.cbEnd = nullptr;
        t.maxLocal = 0;
        t.hw = 0;
        if (t.lowMap.size() < (size_t)gvBase) t.lowMap.assign(gvBase, -1);
#ifdef SIMSTATS
        t.e.nRR = t.e.nRM = t.e.nLoad = t.e.nStore = 0;
#endif
    }

    // ---- pack records
    #pragma omp parallel for schedule(static) num_threads(nt)
    for (int k = 0; k < G; k++) {
        Rec r;
        r.a = c.in0[k]; r.b = c.in1[k]; r.c = c.in2[k];
        r.type = c.type[k]; r.st = 0; r.fo = 0;
        recs[k] = r;
    }
    for (int f = 0; f < F; f++) {
        int s = c.d[f];
        ffNext[f] = -1;
        if (s >= gbase) {
            Rec& r = recs[s - gbase];
            if (!(r.st & 0x10)) {
                r.st |= 0x10;
                dIdx[s - gbase] = f;
            } else {
                int f0 = dIdx[s - gbase];
                ffNext[f] = ffNext[f0];
                ffNext[f0] = f;
            }
        }
    }
#ifdef SIMSTATS
    double t1 = nowMs();
#endif

    // ---- pass 1 (DFS): normalize literals, levels
    g.post.clear();
    g.postDup.clear();
    g.postAlias.clear();
    int n1 = 0;
    auto litOf = [&](int s) -> u32 { return s < gbase ? (s < 2 ? (u32)s : (u32)(s - 1) << 1) : (u32)recs[s - gbase].a; };
    auto lv = [&](u32 vid) -> i32 { return vid >= gvBase ? lvl[vid - gvBase] : 0; };
    auto newOp = [&](u32 k, u32 a, u32 b, u32 cc) -> u32 {
        Op& o = ops1[n1];
        o.a = a; o.b = b; o.c = cc; o.k = k;
        lvl[n1] = 1 + std::max(lv(a), std::max(lv(b), lv(cc)));
        ffh[n1] = -1;
        flg[n1] = 0;
        uses[n1] = 0;
        return gvBase + (u32)n1++;
    };
    auto andLit = [&](u32 x, u32 y) -> u32 {
        if ((x >> 1) == (y >> 1)) return x == y ? x : 0u;
        if ((x >> 1) == 0) return x ? y : 0u;
        if ((y >> 1) == 0) return y ? x : 0u;
        u32 px = x & 1, py = y & 1;
        if (!px && !py) return newOp(K_AND, x >> 1, y >> 1, 0) << 1;
        if (px && !py) return newOp(K_ANDN, x >> 1, y >> 1, 0) << 1;
        if (!px && py) return newOp(K_ANDN, y >> 1, x >> 1, 0) << 1;
        return (newOp(K_OR, x >> 1, y >> 1, 0) << 1) | 1;
    };
    auto xorLit = [&](u32 x, u32 y) -> u32 {
        if ((x >> 1) == (y >> 1)) return (x ^ y) & 1;
        if ((x >> 1) == 0) return y ^ (x & 1);
        if ((y >> 1) == 0) return x ^ (y & 1);
        return (newOp(K_XOR, x >> 1, y >> 1, 0) << 1) | ((x ^ y) & 1);
    };
    auto finalize = [&](int gi) {
        Rec& R = recs[gi];
        const int before = n1;
        u32 la = litOf(R.a), lb = 0, lc = 0, r;
        const uint8_t ty = R.type;
        if (ty != 6) lb = litOf(R.b);
        switch (ty) {
            case 0: r = andLit(la, lb); break;
            case 1: r = andLit(la ^ 1, lb ^ 1) ^ 1; break;
            case 2: r = xorLit(la, lb); break;
            case 3: r = andLit(la, lb) ^ 1; break;
            case 4: r = andLit(la ^ 1, lb ^ 1); break;
            case 5: r = xorLit(la, lb) ^ 1; break;
            case 6: r = la ^ 1; break;
            default: {
                lc = litOf(R.c);
                u32 s = la, a = lb, b = lc;
                if ((s >> 1) == 0) r = s ? b : a;
                else if (a == b) r = a;
                else {
                    if (s & 1) { std::swap(a, b); s ^= 1; }
                    if ((a ^ b) == 1) r = xorLit(s, a);
                    else if ((s >> 1) == (a >> 1)) r = (a == s) ? andLit(s, b) : (andLit(s, b ^ 1) ^ 1);
                    else if ((s >> 1) == (b >> 1)) r = (b == s) ? (andLit(s ^ 1, a ^ 1) ^ 1) : andLit(s ^ 1, a);
                    else if ((a >> 1) == 0) r = a ? (andLit(s, b ^ 1) ^ 1) : andLit(s, b);
                    else if ((b >> 1) == 0) r = b ? (andLit(s ^ 1, a ^ 1) ^ 1) : andLit(s ^ 1, a);
                    else if ((a & 1) == (b & 1)) r = (newOp(K_MUX, s >> 1, a >> 1, b >> 1) << 1) | (a & 1);
                    else r = (newOp(K_MUXN, s >> 1, a >> 1, b >> 1) << 1) | (a & 1);
                }
            }
        }
        const bool created = n1 != before;
        if (R.st & 0x10) {
            int f = dIdx[gi];
            if (created && !(r & 1)) {
                ffh[before] = f;
                flg[before] |= 1;
            } else if (created) {
                // stored complemented: add an explicit inverter feeding the flip-flop
                u32 q = newOp(K_NOT, r >> 1, 0, 0);
                ffh[q - gvBase] = f;
                flg[q - gvBase] |= 1;
            } else {
                g.postAlias.push_back(std::make_pair(f, r));
                if ((r >> 1) >= gvBase) flg[(r >> 1) - gvBase] |= 1;
            }
            for (int ff = ffNext[f]; ff >= 0; ff = ffNext[ff]) {
                g.postDup.push_back(std::make_pair(ff, f));
            }
        }
        R.a = (i32)r;
        R.st = (uint8_t)((R.st & 0xF0) | 2);
    };
    auto visit = [&](int s) {
        if (s < gbase) return;
        int root = s - gbase;
        if ((recs[root].st & 3) == 2) return;
        int sp = 0;
        stack[sp++] = root;
        while (sp > 0) {
            int gi = stack[sp - 1];
            Rec& R = recs[gi];
            int st = R.st & 3;
            if (st == 2) { sp--; continue; }
            if (st == 0) {
                R.st |= 1;
                int sp0 = sp;
                if (R.type == 7 && R.c >= gbase && (recs[R.c - gbase].st & 3) != 2) stack[sp++] = R.c - gbase;
                if (R.type != 6 && R.b >= gbase && (recs[R.b - gbase].st & 3) != 2) stack[sp++] = R.b - gbase;
                if (R.a >= gbase && (recs[R.a - gbase].st & 3) != 2) stack[sp++] = R.a - gbase;
                if (sp != sp0) continue;
            }
            finalize(gi);
            sp--;
        }
    };
    for (int j = 0; j < O; j++) visit(c.out[j]);
    for (int f = 0; f < F; f++) visit(c.d[f]);
    for (int f = 0; f < F; f++) {
        int s = c.d[f];
        if (s < gbase) g.postAlias.push_back(std::make_pair(f, litOf(s)));
    }
    g.outLit.resize(O);
    for (int j = 0; j < O; j++) {
        u32 r = litOf(c.out[j]);
        g.outLit[j] = r;
        if ((r >> 1) >= gvBase) flg[(r >> 1) - gvBase] |= 1;
    }
#ifdef SIMSTATS
    double t1b = nowMs();
#endif

    // ---- needed ops, use counts, critical parents
    memset(chOff, 0, ((size_t)n1 + 1) * sizeof(i32));
    for (int i = n1 - 1; i >= 0; i--) {
        uint8_t f = flg[i];
        if (f & 1) {
            uses[i] += 1 << 30;
            f |= 2;
        }
        if (!(f & 2)) continue;
        flg[i] = f;
        const Op& s = ops1[i];
        int cr = -1, cl = -1;
        u32 vs[3] = {s.a, s.b, s.c};
        for (int q = 0; q < 3; q++) {
            u32 v = vs[q];
            if (v >= gvBase) {
                int x = (int)(v - gvBase);
                flg[x] |= 2;
                uses[x]++;
                if (lvl[x] > cl) { cl = lvl[x]; cr = x; }
            }
        }
        crit[i] = cr;
        if (cr >= 0) chOff[cr]++;
    }
    {
        i32 s = 0;
        for (int j = 0; j < n1; j++) { s += chOff[j]; chOff[j] = s; }
        chOff[n1] = s;
        for (int i = n1 - 1; i >= 0; i--)
            if ((flg[i] & 2) && crit[i] >= 0) chList[--chOff[crit[i]]] = i;
    }

    // ---- shallow cones (level <= LH over free inputs): size and locality key (min data-leaf flip-flop)
    g.hoist.clear();
    for (int i = 0; i < n1; i++) {
        if (!(flg[i] & 2)) { tsz[i] = 0; tkey[i] = 0xFFFFFFFFu; continue; }
        const Op& s = ops1[i];
        const bool mux = (s.k == K_MUX || s.k == K_MUXN);
        u32 vs[3] = {s.a, s.b, s.c};
        i32 sz = 1;
        u32 key = 0xFFFFFFFFu;
        const bool deep = lvl[i] > g_LH;
        for (int q = 0; q < 3; q++) {
            u32 v = vs[q];
            if (v >= gvBase) {
                int x = (int)(v - gvBase);
                if (deep) {
                    if (lvl[x] <= g_LH && tsz[x] >= g_THR && !(flg[x] & 8)) {
                        flg[x] |= 8;
                        g.hoist.push_back(((u64)tkey[x] << 32) | (u32)x);
                    }
                } else if (!(mux && q == 0)) {
                    sz += tsz[x];
                    key = std::min(key, tkey[x]);
                }
            } else if (v > (u32)I && !(mux && q == 0))
                key = std::min(key, v);
        }
        tsz[i] = sz;
        tkey[i] = key;
        if (!deep && sz >= g_THR && (flg[i] & 1) && !(flg[i] & 8)) {
            flg[i] |= 8;
            g.hoist.push_back(((u64)key << 32) | (u32)i);
        }
    }
    std::sort(g.hoist.begin(), g.hoist.end());
    g.roots.clear();
    for (int i = 0; i < n1; i++)
        if (flg[i] & 1) g.roots.push_back(((u64)(u32)lvl[i] << 32) | (u32)i);
    if (g_rootMode == 0) std::sort(g.roots.begin(), g.roots.end());

    // ---- pass 2: schedule (DFS post-order), final numbering, FF slots, homes, chunks
    g.chunkEnd.clear();
    g.gfree.clear();
    g.pendingFree.clear();
    g.farList.clear();
    g.ng = 0;
    int nOps = 0, chunkStartIdx = 0, nFFs = 0, nFar = 0, nStage = 0;
    for (int f = 0; f < F; f++) ffSlot[f] = g_ffid ? f : -1;
    if (g_ffid) nFFs = F;
    auto slotOfFF = [&](int f) -> i32 {
        i32 s = ffSlot[f];
        if (s < 0) { s = nFFs++; ffSlot[f] = s; }
        return s;
    };
    int curChunk = 0;
    auto closeChunk = [&]() {
        chunkStartIdx = nOps;
        curChunk++;
        g.chunkEnd.push_back(nOps);
    };
    auto mapv = [&](u32 v) -> u32 {
        if (v < gvBase) {
            if (v > (u32)I) slotOfFF((int)(v - 1 - I));
            return v;
        }
        i32 q = newIdx[v - gvBase];
        if (--rem[q] == 0) {
            dch[q] = curChunk;
            g.farList.push_back(q);
        }
        return gvBase + (u32)q;
    };
    auto emitOp = [&](int j) {
        const Op& s = ops1[j];
        Op& o = ops[nOps];
        o.k = s.k;
        o.a = mapv(s.a);
        o.b = mapv(s.b);
        o.c = mapv(s.c);
        newIdx[j] = nOps;
        rem[nOps] = uses[j];
        dch[nOps] = 0x7FFFFFFF;
        if (ffh[j] >= 0) {
            stgOfF[ffh[j]] = nStage;
            home[nOps] = acNxt(nStage++);
        } else
            home[nOps] = HOME_NONE;
        flg[j] |= 4;
        nOps++;
        if (nOps - chunkStartIdx >= CH) closeChunk();
    };
    auto demand = [&](int i0) {
        int sp = 0;
        stack2[sp++] = i0;
        while (sp) {
            int j = stack2[sp - 1];
            if (flg[j] & 4) { sp--; continue; }
            const Op& s = ops1[j];
            const int cr = crit[j];
            int nx = -1;
            u32 vs[3] = {s.a, s.b, s.c};
            for (int q = 0; q < 3; q++) {
                u32 v = vs[q];
                if (v >= gvBase) {
                    int x = (int)(v - gvBase);
                    if (!(flg[x] & 4) && x != cr) { nx = x; break; }
                }
            }
            if (nx < 0 && cr >= 0 && !(flg[cr] & 4)) nx = cr;
            if (nx >= 0) { stack2[sp++] = nx; continue; }
            emitOp(j);
            sp--;
        }
    };
    for (u64 e : g.hoist) demand((int)(u32)e);
    for (u64 e : g.roots) demand((int)(u32)e);
    if (nOps > chunkStartIdx) closeChunk();
    for (int f = 0; f < F; f++) slotOfFF(f);
    // ---- homes for values that cross chunk boundaries:
    //   short-lived -> recycled pool (hot slots); long-lived -> far store in creation order (sequential stores)
    {
        const int nCh = (int)g.chunkEnd.size();
        const int nDeath = (int)g.farList.size();
        const i32* deathList = g.farList.data();
        int ev = 0;
        g.farTmp.clear();
        for (int cI = 0; cI < nCh; cI++) {
            const int s0 = cI ? g.chunkEnd[cI - 1] : 0, e0 = g.chunkEnd[cI];
            for (int i = s0; i < e0; i++) {
                if (home[i] != HOME_NONE) continue;
                const int dc = dch[i];
                if (dc <= cI) continue;
                if (dc - cI > g_LS) {
                    home[i] = (i32)(((u32)nFar++ << 2) | 3);
                    g.farTmp.push_back(i);
                } else {
                    int sl;
                    if (!g.gfree.empty()) {
                        sl = g.gfree.back();
                        g.gfree.pop_back();
                    } else
                        sl = g.ng++;
                    home[i] = acGlobal(sl);
                }
            }
            while (ev < nDeath && dch[deathList[ev]] == cI) {
                i32 h = home[deathList[ev++]];
                if (h != HOME_NONE && (h & 3) == 0) g.gfree.push_back((DISP_PI0 - (h >> 2)) / 32 - 1);
            }
        }
    }
    const int ng = g.ng;
    for (i32 q : g.farTmp) {
        i32 k = (i32)((u32)home[q] >> 2);
        home[q] = acT(DISP_PI0 - 32 * ng - 32 * (nFar - k));
    }
    auto locOf = [&](u32 r, i32& region, i32& disp) {
        u32 vid = r >> 1;
        if (vid == 0) { region = 3; disp = 0; }
        else if (vid <= (u32)I) { region = 0; disp = DISP_PI0 + 32 * ((i32)vid - 1); }
        else if (vid < gvBase) { region = 1; disp = 32 * ffSlot[vid - 1 - I] - 128; }
        else {
            i32 h = home[newIdx[vid - gvBase]];
            region = h & 3;
            disp = h >> 2;
        }
    };
    for (auto& pa : g.postAlias) {
        PostCopy pc;
        stgOfF[pa.first] = nStage;
        pc.dstF = nStage++;
        pc.inv = pa.second & 1;
        locOf(pa.second, pc.region, pc.disp);
        g.post.push_back(pc);
    }
    for (auto& pd : g.postDup) stgOfF[pd.first] = stgOfF[pd.second];
    for (int f = 0; f < F; f++) stgOfSlot[ffSlot[f]] = stgOfF[f];
    g.outs.resize(O);
    for (int j = 0; j < O; j++) {
        OutLoc ol;
        ol.pol = g.outLit[j] & 1;
        locOf(g.outLit[j], ol.region, ol.disp);
        g.outs[j] = ol;
    }
#ifdef SIMSTATS
    double t2 = nowMs();
#endif

    // ---- compile chunks
    const int nChunks = (int)g.chunkEnd.size();
    g.chunkStart.assign(nChunks + 1, nullptr);
    g.chunkPatch.assign(nChunks + 1, nullptr);
    #pragma omp parallel num_threads(nt)
    {
        ThreadCtx& t = *g.tc[omp_get_thread_num()];
        #pragma omp for schedule(dynamic, 1)
        for (int ci = 0; ci < nChunks; ci++) {
            ChunkJob job;
            job.ops = ops; job.home = home;
            job.start = ci ? g.chunkEnd[ci - 1] : 0;
            job.end = g.chunkEnd[ci];
            job.I = I; job.F = F; job.gvBase = gvBase; job.ffSlot = ffSlot;
            compileChunk(t, job, g.chunkStart[ci], g.chunkPatch[ci]);
        }
    }
    uint8_t* entry;
    if (nChunks == 0) {
        entry = g.codeB.p;
        entry[0] = 0xC3;
    } else {
        entry = g.chunkStart[0];
        for (int ci = 0; ci + 1 < nChunks; ci++) {
            i32 rel = (i32)(g.chunkStart[ci + 1] - (g.chunkPatch[ci] + 5));
            memcpy(g.chunkPatch[ci] + 1, &rel, 4);
        }
        g.chunkPatch[nChunks - 1][0] = 0xC3;
    }
    int nl = 0;
    for (int i = 0; i < nt; i++) nl = std::max(nl, g.tc[i]->maxLocal);
    g.nl = nl;
#ifdef SIMSTATS
    double t3 = nowMs();
#endif

    // ---- digest index tables: idx[t][b][gq] = nibble of key bits
    const int nq = (O + 3) / 4;
    uint8_t* idx = g.idxB.need(std::max<size_t>((size_t)T * 64 * 16, (size_t)512 * 64 * 16));
    int nBlocks = (Mst + 255) / 256;
#ifdef SIMSTATS
    int dbgPin = 0;
    if (const char* hs = getenv("SIM_NB")) nBlocks = std::min(nBlocks, atoi(hs));
    if (const char* hs = getenv("SIM_PIN")) dbgPin = atoi(hs);
    double tr0 = nowMs();
#endif
    std::vector<u64> result((size_t)Mst);
    const size_t tBytes = (size_t)32 * ((size_t)nFar + (size_t)ng + 65 + (size_t)nl + 8) + 256;
    const size_t tOff = (size_t)32 * ((size_t)nFar + (size_t)ng + 65) + 128;
    const size_t ffBytes = (size_t)32 * ((size_t)F + 8);
    const PostCopy* post = g.post.data();
    const int nPost = (int)g.post.size();
    const OutLoc* outs = g.outs.data();
    #pragma omp parallel num_threads(nt)
    {
        #pragma omp for schedule(static)
        for (int tt = 0; tt < T; tt++) {
            u64 K[64];
            for (int j = 0; j < 64; j++) K[j] = j < O ? mix64((u64)tt * (u64)O + (u64)j) : 0;
            uint8_t* row = idx + (size_t)tt * 1024;
            for (int b = 0; b < 64; b++)
                for (int q = 0; q < 16; q++)
                    row[b * 16 + q] = (uint8_t)(((K[4 * q] >> b) & 1) | (((K[4 * q + 1] >> b) & 1) << 1) | (((K[4 * q + 2] >> b) & 1) << 2) |
                                                (((K[4 * q + 3] >> b) & 1) << 3));
        }
        ThreadCtx& t = *g.tc[omp_get_thread_num()];
#ifdef SIMSTATS
        if (dbgPin == 1) SetThreadAffinityMask(GetCurrentThread(), (DWORD_PTR)1 << (2 * omp_get_thread_num()));       // one thread per core
        if (dbgPin == 2) SetThreadAffinityMask(GetCurrentThread(), (DWORD_PTR)1 << omp_get_thread_num());             // packed on siblings
        #pragma omp master
        tr0 = nowMs();
#endif
        // default sizes chosen so the warm-up call pre-faults enough for typical full-scale runs
        uint8_t* tb = t.tbuf.need(std::max<size_t>(tBytes, (size_t)1 << 20));
        uint8_t* fb = t.ffbuf.need(std::max<size_t>(2 * ffBytes, (size_t)2 * 32 * (8192 + 8)));
        __m256i* misc = (__m256i*)t.misc.need((size_t)32 * (64 + 64 + 256 + 8));
        __m256i* S = misc;            // 64 splitmix state vectors
        __m256i* H = misc + 64;       // 64 digest bit-planes
        __m256i* tab = misc + 128;    // 16 x 16 xor tables
        uint8_t* tbase = tb + tOff;   // rdi
        __m256i* PI = (__m256i*)(tbase + DISP_PI0);
        #pragma omp for schedule(static, 1)
        for (int blk = 0; blk < nBlocks; blk++) {
            uint8_t* cur = fb + 128;
            uint8_t* nxt = fb + ffBytes + 128;
            memset(fb, 0, 2 * ffBytes);
            _mm256_store_si256((__m256i*)(tbase + DISP_ONES), _mm256_set1_epi32(-1));
            for (int j = 0; j < 64; j++) {
                u64 m0 = (u64)blk * 256 + (u64)j;
                S[j] = _mm256_set_epi64x((long long)mix64(c.seed ^ (m0 + 192)), (long long)mix64(c.seed ^ (m0 + 128)),
                                         (long long)mix64(c.seed ^ (m0 + 64)), (long long)mix64(c.seed ^ m0));
                H[j] = _mm256_setzero_si256();
            }
            const __m256i gold = _mm256_set1_epi64x((long long)0x9E3779B97F4A7C15ull);
            const __m256i c1 = _mm256_set1_epi64x((long long)0xBF58476D1CE4E5B9ull);
            const __m256i c2 = _mm256_set1_epi64x((long long)0x94D049BB133111EBull);
            const __m256i ones = _mm256_set1_epi32(-1);
            for (int tt = 0; tt < T; tt++) {
                // primary inputs
                for (int j = 0; j < 64; j++) {
                    __m256i s = _mm256_add_epi64(S[j], gold);
                    S[j] = s;
                    __m256i z = mul64c(_mm256_xor_si256(s, _mm256_srli_epi64(s, 30)), c1);
                    z = mul64c(_mm256_xor_si256(z, _mm256_srli_epi64(z, 27)), c2);
                    PI[j] = _mm256_xor_si256(z, _mm256_srli_epi64(z, 31));
                }
                transpose64x4(PI);
                sim_jit_tramp(tbase, cur, nxt, entry);
                // flip-flops not written by generated code
                for (int i = 0; i < nPost; i++) {
                    const PostCopy& pc = post[i];
                    __m256i v;
                    if (pc.region == 3) v = _mm256_setzero_si256();
                    else {
                        const uint8_t* base = pc.region == 0 ? tbase : pc.region == 1 ? cur : nxt;
                        v = _mm256_load_si256((const __m256i*)(base + pc.disp));
                    }
                    if (pc.inv) v = _mm256_xor_si256(v, ones);
                    _mm256_store_si256((__m256i*)(nxt - 128 + (size_t)32 * pc.dstF), v);
                }
                // digest
                for (int q = 0; q < nq; q++) {
                    __m256i v[4];
                    for (int i = 0; i < 4; i++) {
                        int j = 4 * q + i;
                        if (j < O) {
                            const OutLoc& ol = outs[j];
                            __m256i x;
                            if (ol.region == 3) x = _mm256_setzero_si256();
                            else {
                                const uint8_t* base = ol.region == 0 ? tbase : ol.region == 1 ? cur : nxt;
                                x = _mm256_load_si256((const __m256i*)(base + ol.disp));
                            }
                            if (ol.pol) x = _mm256_xor_si256(x, ones);
                            v[i] = x;
                        } else
                            v[i] = _mm256_setzero_si256();
                    }
                    __m256i* tq = tab + q * 16;
                    tq[0] = _mm256_setzero_si256();
                    tq[1] = v[0];
                    tq[2] = v[1];
                    tq[3] = _mm256_xor_si256(v[0], v[1]);
                    tq[4] = v[2];
                    tq[5] = _mm256_xor_si256(v[2], tq[1]);
                    tq[6] = _mm256_xor_si256(v[2], tq[2]);
                    tq[7] = _mm256_xor_si256(v[2], tq[3]);
                    for (int i = 0; i < 8; i++) tq[8 + i] = _mm256_xor_si256(v[3], tq[i]);
                }
                const uint8_t* row = idx + (size_t)tt * 1024;
                for (int b = 0; b < 64; b++) {
                    __m256i acc = H[b];
                    const uint8_t* rb = row + b * 16;
                    for (int q = 0; q < nq; q++) acc = _mm256_xor_si256(acc, tab[q * 16 + rb[q]]);
                    H[b] = acc;
                }
                // flip-flop update: gather staged next-state values into the read layout
                {
                    __m256i* cu = (__m256i*)(cur - 128);
                    const __m256i* st = (const __m256i*)(nxt - 128);
                    for (int f = 0; f < F; f++) cu[f] = st[stgOfSlot[f]];
                }
            }
            transpose64x4(H);
            alignas(32) u64 tmp[4];
            for (int j = 0; j < 64; j++) {
                _mm256_store_si256((__m256i*)tmp, H[j]);
                for (int w = 0; w < 4; w++) {
                    size_t m = (size_t)blk * 256 + (size_t)w * 64 + (size_t)j;
                    if (m < (size_t)Mst) result[m] = tmp[w];
                }
            }
        }
    }
#ifdef SIMSTATS
    double t4 = nowMs();
    fprintf(stderr, "[sim] blocks=%d  sim-only=%.2f ms\n", nBlocks, t4 - tr0);
    u64 nRR = 0, nRM = 0, nLoad = 0, nStore = 0;
    for (int i = 0; i < nt; i++) {
        nRR += g.tc[i]->e.nRR; nRM += g.tc[i]->e.nRM; nLoad += g.tc[i]->e.nLoad; nStore += g.tc[i]->e.nStore;
    }
    size_t codeBytes = 0;
    for (int ci = 0; ci < nChunks; ci++) codeBytes += (size_t)(g.chunkPatch[ci] + 5 - g.chunkStart[ci]);
    fprintf(stderr, "[sim] G=%d ops=%d chunks=%d ng=%d nFar=%d hoist=%d nl=%d post=%d | prep=%.2f dfs1=%.2f sched=%.2f compile=%.2f run=%.2f total=%.2f ms\n", G, nOps, nChunks, ng, nFar, (int)g.hoist.size(), nl,
            nPost, t1 - t0, t1b - t1, t2 - t1b, t3 - t2, t4 - t3, t4 - t0);
    fprintf(stderr, "[sim] code=%.2f MB  RR=%llu RM=%llu load=%llu store=%llu  (alu=%llu loads=%llu)\n", codeBytes / 1048576.0, (unsigned long long)nRR,
            (unsigned long long)nRM, (unsigned long long)nLoad, (unsigned long long)nStore, (unsigned long long)(nRR + nRM), (unsigned long long)(nRM + nLoad));
#endif
    return result;
}

}  // namespace

std::vector<uint64_t> simulate(const Circuit& c) {
    return simulateImpl(c);
}

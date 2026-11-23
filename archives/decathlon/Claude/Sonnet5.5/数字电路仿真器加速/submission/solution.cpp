// Digital circuit simulator accelerator: bit-sliced (256 stimuli per AVX2 vector) simulation,
// circuit compiled at run time into straight-line AVX2 machine code (JIT) with register allocation.
#include <cstdint>
#include <vector>
#include <cstring>
#include <cstdlib>
#include <algorithm>
#include <immintrin.h>
#include <omp.h>
#ifdef _WIN32
#include <windows.h>
#endif

#ifndef PFHINT
#define PFHINT 2
#endif
#ifndef PROMO_MIN2
#define PROMO_MIN2 1
#endif
#ifndef PFFF
#define PFFF 0
#endif
#ifndef PFCOLD
#define PFCOLD 256
#endif

struct Circuit {
    int I, F, G, O, M, T;
    uint64_t seed;
    std::vector<int> d;
    std::vector<uint8_t> type;
    std::vector<int> in0, in1, in2;
    std::vector<int> out;
};

#ifdef SIMDEBUG
#include <chrono>
#include <cstdio>
static double dbgNow() { return std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now().time_since_epoch()).count(); }
#define DBGT(name) do { double t_ = dbgNow(); fprintf(stderr, "[%s] %.2f ms (+%.2f)\n", name, t_ - g_t0, t_ - g_tl); g_tl = t_; } while (0)
static double g_t0, g_tl;
#else
#define DBGT(name) do {} while (0)
#endif

namespace {

typedef uint64_t u64;
typedef int32_t i32;

const u64 GAMMA = 0x9E3779B97F4A7C15ULL;
const u64 MC1 = 0xBF58476D1CE4E5B9ULL;
const u64 MC2 = 0x94D049BB133111EBULL;

inline u64 mix64(u64 x) {
    u64 z = x + GAMMA;
    z = (z ^ (z >> 30)) * MC1;
    z = (z ^ (z >> 27)) * MC2;
    return z ^ (z >> 31);
}

const int INF = 0x7fffffff;

enum { K_AND = 0, K_OR = 1, K_XOR = 2, K_ANDN = 3, K_MUX = 4, K_MUXN = 5 };

// ---------------------------------------------------------------------------------------------
// Network (after simplification / polarity normalisation)
// ids: [0,I) PI, [I,I+F) FF, [I+F, I+F+n) ops.  literal = id*2 + pol, constants: -2 (0), -1 (1)
// ---------------------------------------------------------------------------------------------
struct Net {
    int I = 0, F = 0, O = 0, n = 0;
    std::vector<uint8_t> kind;
    std::vector<i32> a, b, c;  // operand ids (MUX: a=S, b=A (sel 0), c=B (sel 1))
    std::vector<i32> dLit;     // per FF
    std::vector<i32> oLit;     // per output
};

struct GRec {
    i32 in[3];
    i32 type;
};

struct Builder {
    const Circuit& c;
    Net& net;
    int I, F, G, base;
    std::vector<i32> litG;
    std::vector<GRec> rec;
    Builder(const Circuit& cc, Net& nn) : c(cc), net(nn) {}

    inline i32 sigLit(int s) const {
        if (s < 2) return s ? -1 : -2;
        if (s < base) return (s - 2) << 1;
        return litG[s - base];
    }
    inline i32 mk(int kind, i32 a, i32 b, i32 cc, int pol) {
        int i = net.n++;
        net.kind[i] = (uint8_t)kind;
        net.a[i] = a;
        net.b[i] = b;
        net.c[i] = cc;
        return (((I + F + i) << 1) | pol);
    }
    // AND-type: out = ((lx) & (ly)) ^ co with lx,ly already literal (including input flips)
    inline i32 andLit(i32 lx, i32 ly, int co) {
        if (lx < 0) {
            if ((lx & 1) == 0) return -2 ^ co;
            return ly ^ co;
        }
        if (ly < 0) {
            if ((ly & 1) == 0) return -2 ^ co;
            return lx ^ co;
        }
        if (lx == ly) return lx ^ co;
        if ((lx ^ 1) == ly) return -2 ^ co;
        int q1 = lx & 1, q2 = ly & 1;
        i32 X = lx >> 1, Y = ly >> 1;
        if (!q1 && !q2) return mk(K_AND, X, Y, -1, co);
        if (q1 && !q2) return mk(K_ANDN, X, Y, -1, co);
        if (!q1 && q2) return mk(K_ANDN, Y, X, -1, co);
        return mk(K_OR, X, Y, -1, co ^ 1);
    }
    inline i32 xorLit(i32 lx, i32 ly) {
        if (lx < 0) return ly ^ (lx & 1);
        if (ly < 0) return lx ^ (ly & 1);
        if ((lx >> 1) == (ly >> 1)) return -2 ^ ((lx ^ ly) & 1);
        return mk(K_XOR, lx >> 1, ly >> 1, -1, (lx ^ ly) & 1);
    }
    i32 muxLit(i32 s, i32 a, i32 b) {
        // s ? b : a
        if (s < 0) return (s & 1) ? b : a;
        if (a == b) return a;
        if ((a ^ 1) == b) return xorLit(a, s);
        if (a < 0) {
            if ((a & 1) == 0) return andLit(s, b, 0);       // s & b
            return andLit(s, b ^ 1, 1);                       // ~s | b = ~(s & ~b)
        }
        if (b < 0) {
            if ((b & 1) == 0) return andLit(s ^ 1, a, 0);    // ~s & a
            return andLit(s ^ 1, a ^ 1, 1) ^ 0;              // s | a = ~(~s & ~a)
        }
        int sid = s >> 1;
        if (sid == (a >> 1)) {
            if (((s ^ a) & 1) == 0) return andLit(s, b, 0);   // s ? b : s  -> s & b
            return andLit(s, b ^ 1, 1);                        // s ? b : ~s -> ~s | b
        }
        if (sid == (b >> 1)) {
            if (((s ^ b) & 1) == 0) return andLit(s ^ 1, a ^ 1, 1);  // s ? s : a -> s | a
            return andLit(s ^ 1, a, 0);                        // s ? ~s : a -> ~s & a
        }
        if (s & 1) {  // use positive select: swap
            std::swap(a, b);
            s ^= 1;
        }
        int pa = a & 1, pb = b & 1;
        return mk(pa == pb ? K_MUX : K_MUXN, s >> 1, a >> 1, b >> 1, pa);
    }

    i32 buildGate(int g) {
        const GRec& r = rec[g];
        int t = r.type;
        switch (t) {
            case 0: return andLit(sigLit(r.in[0]), sigLit(r.in[1]), 0);
            case 1: return andLit(sigLit(r.in[0]) ^ 1, sigLit(r.in[1]) ^ 1, 1);
            case 2: return xorLit(sigLit(r.in[0]), sigLit(r.in[1]));
            case 3: return andLit(sigLit(r.in[0]), sigLit(r.in[1]), 1);
            case 4: return andLit(sigLit(r.in[0]) ^ 1, sigLit(r.in[1]) ^ 1, 0);
            case 5: return xorLit(sigLit(r.in[0]), sigLit(r.in[1])) ^ 1;
            case 6: return sigLit(r.in[0]) ^ 1;
            default: return muxLit(sigLit(r.in[0]), sigLit(r.in[1]), sigLit(r.in[2]));
        }
    }

    void build() {
        I = c.I; F = c.F; G = c.G;
        base = I + F + 2;
        net.I = I; net.F = F; net.O = c.O;
        net.n = 0;
        net.kind.assign(G, 0);
        net.a.assign(G, 0);
        net.b.assign(G, 0);
        net.c.assign(G, 0);
        litG.assign(G, 0);
        rec.resize(G);
#pragma omp parallel for schedule(static) if (G > 50000)
        for (int g = 0; g < G; g++) {
            GRec& r = rec[g];
            r.in[0] = c.in0[g];
            r.in[1] = c.in1[g];
            r.in[2] = c.in2[g];
            r.type = c.type[g];
        }
        std::vector<uint8_t> state(G, 0);
        struct Frame { i32 g; i32 k; };
        std::vector<Frame> stk;
        stk.reserve(1024);
        auto pushRoot = [&](int s) {
            if (s < base) return;
            int g = s - base;
            if (state[g]) return;
            state[g] = 1;
            stk.push_back({g, 0});
            while (!stk.empty()) {
                Frame& f = stk.back();
                const GRec& r = rec[f.g];
                int nin = (r.type == 6) ? 1 : (r.type == 7 ? 3 : 2);
                if (f.k < nin) {
#ifdef CHILDORD
                    static const int perm3[6][3] = {{0,1,2},{1,0,2},{2,1,0},{2,0,1},{0,2,1},{1,2,0}};
                    int kk = f.k++;
                    int s2 = (nin == 3) ? r.in[perm3[CHILDORD][kk]] : (nin == 2 && (CHILDORD & 1) ? r.in[1 - kk] : r.in[kk]);
#else
                    int s2 = r.in[f.k++];
#endif
                    if (s2 >= base) {
                        int ch = s2 - base;
                        if (!state[ch]) {
                            state[ch] = 1;
                            stk.push_back({ch, 0});
                        }
                    }
                } else {
                    int g2 = f.g;
                    stk.pop_back();
                    litG[g2] = buildGate(g2);
                }
            }
        };
        for (int j = 0; j < c.O; j++) pushRoot(c.out[j]);
#ifdef ROOTORD
        {
            std::vector<int> ord(F);
            for (int f = 0; f < F; f++) ord[f] = f;
            const char* mode = getenv("ROOTORD");
            int md = mode ? atoi(mode) : 0;
            if (md == 1) std::sort(ord.begin(), ord.end(), [](int x, int y) { return (x % 32) != (y % 32) ? (x % 32) < (y % 32) : x < y; });
            if (md == 2) std::sort(ord.begin(), ord.end(), [](int x, int y) { int ax = x / 256, ay = y / 256; if (ax != ay) return ax < ay; if (x % 32 != y % 32) return x % 32 < y % 32; return x < y; });
            if (md == 3) std::sort(ord.begin(), ord.end(), [](int x, int y) { int ax = x / 1024, ay = y / 1024; if (ax != ay) return ax < ay; if (x % 32 != y % 32) return x % 32 < y % 32; return x < y; });
            if (md == 4) std::sort(ord.begin(), ord.end(), [](int x, int y) { return x > y; });
            for (int f = 0; f < F; f++) pushRoot(c.d[ord[f]]);
        }
#else
        for (int f = 0; f < F; f++) pushRoot(c.d[f]);
#endif
        net.dLit.resize(F);
        for (int f = 0; f < F; f++) net.dLit[f] = sigLit(c.d[f]);
        net.oLit.resize(c.O);
        for (int j = 0; j < c.O; j++) net.oLit[j] = sigLit(c.out[j]);
        net.kind.resize(net.n);
        net.a.resize(net.n);
        net.b.resize(net.n);
        net.c.resize(net.n);
    }
};

// ---------------------------------------------------------------------------------------------
// Use analysis
// ---------------------------------------------------------------------------------------------
struct Sink {
    i32 next;
    i32 type;  // 0 = ff next store (idx = ff), 1 = output store (idx = j)
    i32 idx;
    i32 flip;
};

struct Use {
    std::vector<i32> nu;     // 3 per op: next use position of the operand after this op
    std::vector<i32> nu2;    // 3 per op: second next use position
    std::vector<i32> first;  // first use of the op value
    std::vector<i32> cross;  // cross-chunk slot or -1
    int nCross = 0;
    std::vector<i32> sinkHead;
    std::vector<Sink> sinks;
};

// ---------------------------------------------------------------------------------------------
// x86-64 emitter
// ---------------------------------------------------------------------------------------------
const int RAX = 0, RCX = 1, RBX = 3, RBP = 5, RSI = 6, RDI = 7, RDX = 2;
const int SPILL_BASES[5] = {RBX, RAX, RCX, RBP, RSI};
const int NREG = 15;
const int TMP = 15, DSC = 15;

struct Opnd {
    int reg;   // >=0: register
    int base;  // memory base
    int disp;
};

#ifdef SIMDEBUG
struct DbgCnt { long n[6]; long bytes[6]; };
static DbgCnt g_cnt;
static int g_expMode = 0;
static long g_dbgSpillOff = 0, g_dbgOffCross = 0;
#endif
struct Emitter {
    uint8_t* p;
#ifdef SIMDEBUG
    DbgCnt cnt = {};
#endif
    inline void b(int x) { *p++ = (uint8_t)x; }
    inline void d32(int32_t x) { memcpy(p, &x, 4); p += 4; }
    // VEX.256 instruction: reg field = r, vvvv = v, rm = operand
    inline void vex(int opc, int pp, int r, int v, const Opnd& rm0) {
#ifdef SIMDEBUG
        uint8_t* p0 = p;
        Opnd rm = rm0;
        if (rm.reg < 0) {
            bool isff = (rm.base == RDI || rm.base == RDX);
            bool iscross = (rm.base == RBX && rm.disp < -128);
            long slotIdx = iscross ? ((long)rm.disp + g_dbgSpillOff + 128) / 32 - g_dbgOffCross : 0;
            if (iscross && (g_expMode & (512|2048)) && slotIdx >= 256) iscross = true; else if (iscross && (g_expMode & (512|2048))) iscross = false;
            if (iscross && (g_expMode & 1024) && slotIdx < 256) iscross = true; else if (iscross && (g_expMode & 1024)) iscross = false;
            if ((g_expMode & 16) || ((g_expMode & 32) && isff) || ((g_expMode & (64|512|1024|2048)) && iscross) || ((g_expMode & 128) && iscross && opc == 0x7F) || ((g_expMode & 256) && iscross && opc != 0x7F))
                if ((g_expMode & 2048) && iscross) rm.disp = (int)(32L * g_dbgOffCross + 32L * ((slotIdx % 256) * 128) - g_dbgSpillOff - 128); else
                rm.disp = (rm.base == RBX) ? ((rm.disp & 1023) - 512) : (rm.disp & 1023);
        }
#else
        const Opnd& rm = rm0;
#endif
        int B = (rm.reg >= 0) ? (rm.reg >> 3) : 0;
        if (!B) {
            b(0xC5);
            b(((r & 8) ? 0 : 0x80) | ((~v & 15) << 3) | 4 | pp);
        } else {
            b(0xC4);
            b(((r & 8) ? 0 : 0x80) | 0x40 | 0 | 1);
            b(((~v & 15) << 3) | 4 | pp);
        }
        b(opc);
        if (rm.reg >= 0) {
            b(0xC0 | ((r & 7) << 3) | (rm.reg & 7));
        } else if (rm.disp >= -128 && rm.disp <= 127) {
            b(0x40 | ((r & 7) << 3) | rm.base);
            b(rm.disp & 255);
        } else {
            b(0x80 | ((r & 7) << 3) | rm.base);
            d32(rm.disp);
        }
#ifdef SIMDEBUG
        int cls = (opc == 0x6F) ? 2 : (opc == 0x7F ? 3 : (rm.reg >= 0 ? 0 : 1));
        cnt.n[cls]++; cnt.bytes[cls] += (long)(p - p0);
        if (((g_expMode & 1) && opc == 0x7F) || ((g_expMode & 2) && opc == 0x6F) || (g_expMode & 8)) {
            int len = (int)(p - p0);
            static const uint8_t nops[10][10] = {
                {0}, {0x90}, {0x66, 0x90}, {0x0F, 0x1F, 0x00}, {0x0F, 0x1F, 0x40, 0x00}, {0x0F, 0x1F, 0x44, 0x00, 0x00},
                {0x66, 0x0F, 0x1F, 0x44, 0x00, 0x00}, {0x0F, 0x1F, 0x80, 0, 0, 0, 0}, {0x0F, 0x1F, 0x84, 0, 0, 0, 0, 0},
                {0x66, 0x0F, 0x1F, 0x84, 0, 0, 0, 0, 0}};
            if (len >= 1 && len <= 9) memcpy(p0, nops[len], len);
            else for (int q = 0; q < len; q++) p0[q] = 0x90;
        }
#endif
    }
    inline void prefetch(int hint, int base, int disp) {
        b(0x0F); b(0x18);
        if (disp >= -128 && disp <= 127) { b(0x40 | (hint << 3) | base); b(disp & 255); }
        else { b(0x80 | (hint << 3) | base); d32(disp); }
    }
    inline void bin(int opc, int d, int s1, const Opnd& s2) { vex(opc, 1, d, s1, s2); }
    inline void load(int d, int base, int disp) { Opnd m{-1, base, disp}; vex(0x6F, 2, d, 0, m); }
    inline void store(int base, int disp, int s) { Opnd m{-1, base, disp}; vex(0x7F, 2, s, 0, m); }
    inline void load(int d, const Opnd& m) { vex(0x6F, 2, d, 0, m); }
    inline void store(const Opnd& m, int s) { vex(0x7F, 2, s, 0, m); }
};

const int OP_AND = 0xDB, OP_ANDN = 0xDF, OP_OR = 0xEB, OP_XOR = 0xEF;

inline Opnd R(int r) { return Opnd{r, 0, 0}; }

// ---------------------------------------------------------------------------------------------
// Layout of per-thread memory
// ---------------------------------------------------------------------------------------------
struct Layout {
    int I, F, O;
    int offOut, offOnes, offZeros, offCross;
    int fixedSlots;
    long fixedBytes = 0, spillOff = 0, spillCap = 0, ffOff = 0, frameBytes = 0;
};

struct ChunkGen {
    const Net& net;
    const Use& use;
    const Layout& L;
    const std::vector<i32>& ffslot;
    int cb, ce;
    Emitter e;
    int regId[16];
    int regNu[16];
    std::vector<i32> spill;
    std::vector<int> freeSlots;
    int nextSlot = 0;
    int maxSlot = 0;
    int I, F;
    struct PfItem { int base; int disp; int pos; long long key; };
    std::vector<PfItem> pf;
    size_t pfIdx = 0;
    int pfHint = PFHINT;

    // build the list of cache lines that chunk [cbN, ceN) will read from memory (FF array / earlier cross values)
    void buildPrefetch(int cbN, int ceN, int nearD) {
        std::vector<PfItem> items;
        for (int i = cbN; i < ceN; i++) {
            int kind = net.kind[i];
            int m = (kind >= K_MUX) ? 3 : 2;
            int ids[3] = {net.a[i], net.b[i], net.c[i]};
            for (int k = 0; k < m; k++) {
                int v = ids[k];
                if (v < I) continue;
                if (v < I + F) {
#if PFFF
                    int d = 32 * ffslot[v - I];
                    items.push_back({RDI, d, i, (long long)(d >> 6)});
#endif
                } else {
                    int p = v - I - F;
                    if (p >= cbN || cbN - p <= nearD) continue;
                    if (use.cross[p] < PFCOLD) continue;
                    int d = fixedDisp(L.offCross + use.cross[p]);
                    items.push_back({RBX, d, i, (1LL << 40) + (long long)((32LL * (L.offCross + use.cross[p])) >> 6)});
                }
            }
        }
        std::sort(items.begin(), items.end(), [](const PfItem& x, const PfItem& y) { return x.key != y.key ? x.key < y.key : x.pos < y.pos; });
        pf.clear();
        for (size_t q = 0; q < items.size(); q++)
            if (q == 0 || items[q].key != items[q - 1].key) pf.push_back(items[q]);
        std::sort(pf.begin(), pf.end(), [](const PfItem& x, const PfItem& y) { return x.pos < y.pos; });
        pfIdx = 0;
    }

    ChunkGen(const Net& n_, const Use& u_, const Layout& L_, const std::vector<i32>& ff_, int cb_, int ce_)
        : net(n_), use(u_), L(L_), ffslot(ff_), cb(cb_), ce(ce_) {
        I = net.I; F = net.F;
        for (int i = 0; i < 16; i++) { regId[i] = -1; regNu[i] = INF; }
        spill.assign(ce - cb, -1);
    }

    inline Opnd memOf(int id) const {
        if (id < I) return Opnd{-1, RBX, fixedDisp(id)};
        if (id < I + F) return Opnd{-1, RDI, 32 * ffslot[id - I]};
        int p = id - I - F;
        if (use.cross[p] >= 0) return Opnd{-1, RBX, fixedDisp(L.offCross + use.cross[p])};
        return spillOp(spill[p - cb]);
    }
    inline int fixedDisp(int slot) const { return (int)(32L * slot - L.spillOff - 128); }
    static inline Opnd spillOp(int s) {
        int g = s >> 3;
        if (g < 5) return Opnd{-1, SPILL_BASES[g], 32 * (s & 7) - 128};
        return Opnd{-1, RBX, 32 * s - 128};
    }
    inline int findReg(int id) const {
        for (int r = 0; r < NREG; r++)
            if (regId[r] == id) return r;
        return -1;
    }
    int allocSlot() {
        int s;
        if (!freeSlots.empty()) { s = freeSlots.back(); freeSlots.pop_back(); }
        else { s = nextSlot++; if (nextSlot > maxSlot) maxSlot = nextSlot; }
        return s;
    }
    // Evict the value in register r (store to spill slot when needed). Marks register free.
    void evict(int r) {
        int id = regId[r];
        if (id >= I + F && regNu[r] < ce) {
            int p = id - I - F;
            if (p >= cb && use.cross[p] < 0 && spill[p - cb] < 0) {
                int s = allocSlot();
                spill[p - cb] = s;
                e.store(spillOp(s), r);
            }
        }
        regId[r] = -1;
        regNu[r] = INF;
    }
    // grab a register for a value with next use nuv. protect = mask of registers that must not be taken.
    int grabReg(int nuv, unsigned protect) {
        for (int r = 0; r < NREG; r++)
            if (regId[r] < 0 && !((protect >> r) & 1)) return r;
        int v = -1, best = -1;
        for (int r = 0; r < NREG; r++) {
            if ((protect >> r) & 1) continue;
            if (regNu[r] > best) { best = regNu[r]; v = r; }
        }
        if (v >= 0 && best > nuv) { evict(v); return v; }
        return -1;
    }

    void emitSinks(int i, int reg) {
        for (int k = use.sinkHead[i]; k >= 0; k = use.sinks[k].next) {
            const Sink& s = use.sinks[k];
            if (s.type == 0) {
                if (!s.flip) e.store(RDX, 32 * ffslot[s.idx], reg);
            } else {
                e.store(RBX, fixedDisp(L.offOut + s.idx), reg);
            }
        }
    }
    // sinks that need the complemented value; may clobber TMP (and reg when reg == TMP)
    void emitFlipSinks(int i, int reg) {
        bool done = false;
        for (int k = use.sinkHead[i]; k >= 0; k = use.sinks[k].next) {
            const Sink& s = use.sinks[k];
            if (s.type == 0 && s.flip) {
                if (!done) {
                    e.bin(OP_XOR, TMP, reg, Opnd{-1, RBX, fixedDisp(L.offOnes)});
                    done = true;
                }
                e.store(RDX, 32 * ffslot[s.idx], TMP);
            }
        }
    }

    void genOp(int i) {
        int kind = net.kind[i];
        int m = (kind >= K_MUX) ? 3 : 2;
        int id[3], nu[3], r[3];
        id[0] = net.a[i]; id[1] = net.b[i]; id[2] = (m == 3) ? net.c[i] : -1;
        for (int k = 0; k < m; k++) { nu[k] = use.nu[3 * i + k]; r[k] = findReg(id[k]); }
        int fu = use.first[i];
        int cr = use.cross[i];
        bool hasSink = use.sinkHead[i] >= 0;
        if (fu >= ce && cr < 0 && !hasSink) return;  // dead value

        unsigned protect = 0;
        for (int k = 0; k < m; k++) if (r[k] >= 0) protect |= 1u << r[k];
        // promotions
        for (int k = 0; k < m; k++) {
            if (r[k] < 0 && nu[k] < ce && (PROMO_MIN2 ? use.nu2[3 * i + k] < ce : true)) {
                int g = grabReg(nu[k], protect);
                if (g >= 0) {
                    e.load(g, memOf(id[k]));
                    regId[g] = id[k];
                    regNu[g] = nu[k];
                    r[k] = g;
                    protect |= 1u << g;
                }
            }
        }
        // destination
        unsigned protectD = 0;
        for (int k = 0; k < m; k++) if (r[k] >= 0 && nu[k] < ce) protectD |= 1u << r[k];
        int D = -1;
        bool alloc = false;
        if (fu < ce) {
            // prefer reusing a dying operand register
            for (int k = 0; k < m; k++) {
                if (r[k] >= 0 && nu[k] >= ce) { D = r[k]; break; }
            }
            if (D < 0) D = grabReg(fu, protectD);
            if (D >= 0) alloc = true;
        }
        int Dreg = (D >= 0) ? D : DSC;
#ifdef SIMDEBUG2
        if (i >= cb + 3000 && i < cb + 3030) { fprintf(stderr, "op %d kind %d ids %d %d %d nu %d %d %d r %d %d %d fu %d D %d\n", i, kind, id[0], id[1], id[2], nu[0], nu[1], nu[2], r[0], r[1], r[2], fu, D); }
#endif
        // memory operands descriptors
        Opnd o[3];
        for (int k = 0; k < m; k++) o[k] = (r[k] >= 0) ? R(r[k]) : memOf(id[k]);
        // emit
        if (kind == K_AND || kind == K_OR || kind == K_XOR) {
            int opc = (kind == K_AND) ? OP_AND : (kind == K_OR ? OP_OR : OP_XOR);
            if (r[0] >= 0 && r[1] >= 0) {
                int lo = r[0], hi = r[1];
                if (lo > hi) std::swap(lo, hi);
                e.bin(opc, Dreg, hi, R(lo));
            } else if (r[0] >= 0) {
                e.bin(opc, Dreg, r[0], o[1]);
            } else if (r[1] >= 0) {
                e.bin(opc, Dreg, r[1], o[0]);
            } else {
                e.load(TMP, o[0]);
                e.bin(opc, Dreg, TMP, o[1]);
            }
        } else if (kind == K_ANDN) {
            int x;
            if (r[0] >= 0) x = r[0];
            else { e.load(TMP, o[0]); x = TMP; }
            e.bin(OP_ANDN, Dreg, x, o[1]);
        } else {
            // MUX: S=o[0], A=o[1], B=o[2]
            // T = A ^ B
            if (r[1] >= 0 && r[2] >= 0) {
                int lo = r[1], hi = r[2];
                if (lo > hi) std::swap(lo, hi);
                e.bin(OP_XOR, TMP, hi, R(lo));
            } else if (r[1] >= 0) {
                e.bin(OP_XOR, TMP, r[1], o[2]);
            } else if (r[2] >= 0) {
                e.bin(OP_XOR, TMP, r[2], o[1]);
            } else {
                e.load(TMP, o[1]);
                e.bin(OP_XOR, TMP, TMP, o[2]);
            }
            e.bin(kind == K_MUX ? OP_AND : OP_ANDN, TMP, TMP, o[0]);
            e.bin(OP_XOR, Dreg, TMP, o[1]);
        }
        // sinks and write-through
        emitSinks(i, Dreg);
        if (cr >= 0) e.store(RBX, fixedDisp(L.offCross + cr), Dreg);
        // update operand states
        for (int k = 0; k < m; k++) {
            if (r[k] >= 0) {
                if (nu[k] >= ce) {
                    if (regId[r[k]] == id[k]) { regId[r[k]] = -1; regNu[r[k]] = INF; }
                } else {
                    regNu[r[k]] = nu[k];
                }
            }
        }
        if (alloc) {
            regId[D] = I + F + i;
            regNu[D] = fu;
        } else if (fu < ce) {
            // bypass: store to spill slot
            if (cr < 0) {
                int s = allocSlot();
                spill[i - cb] = s;
                e.store(spillOp(s), Dreg);
            }
        }
        // free spill slots of dead operands
        for (int k = 0; k < m; k++) {
            if (nu[k] >= ce && id[k] >= I + F) {
                int p = id[k] - I - F;
                if (p >= cb && p < ce && use.cross[p] < 0 && spill[p - cb] >= 0) {
                    freeSlots.push_back(spill[p - cb]);
                    spill[p - cb] = -1;
                }
            }
        }
        emitFlipSinks(i, Dreg);
    }

    void run() {
        int len = ce - cb;
        size_t N = pf.size();
        for (int i = cb; i < ce; i++) {
            while (pfIdx < N && (long)(i - cb) * (long)N >= (long)pfIdx * len) {
                e.prefetch(pfHint, pf[pfIdx].base, pf[pfIdx].disp);
                pfIdx++;
            }
            genOp(i);
        }
        while (pfIdx < N) { e.prefetch(pfHint, pf[pfIdx].base, pf[pfIdx].disp); pfIdx++; }
    }
};

// ---------------------------------------------------------------------------------------------
// Compiled program
// ---------------------------------------------------------------------------------------------
typedef void (*JitFn)(void* rbxBase, long count, void* ffCur, void* ffNext);

struct Program {
    Net net;
    Use use;
    Layout L;
    std::vector<i32> ffslot;
    uint8_t* code = nullptr;
    size_t codeCap = 0;
    JitFn fn = nullptr;
    int maxSpill = 0;
    // output info
    struct OutInfo { int space; int idx; int flip; };  // space: 0 fixed slot idx, 1 ff cur slot idx
    std::vector<OutInfo> outs;
    struct CopyInfo { int f; int space; int idx; int flip; };
    std::vector<CopyInfo> copies;
    ~Program() {
#ifdef _WIN32
        if (code) VirtualFree(code, 0, MEM_RELEASE);
#endif
    }
};

static void emitPrologue(Emitter& e, long spillBytesUnused) {
    (void)spillBytesUnused;
    e.b(0x53); e.b(0x55); e.b(0x56); e.b(0x57);      // push rbx, rbp, rsi, rdi
    e.b(0x48); e.b(0x81); e.b(0xEC); e.d32(0xA0);    // sub rsp, 0xA0
    for (int i = 0; i < 10; i++) {
        int r = 6 + i;
        e.b(0xC5); e.b(((r & 8) ? 0 : 0x80) | 0x78); e.b(0x11); e.b(0x84 | ((r & 7) << 3)); e.b(0x24); e.d32(i * 16);
    }
    e.b(0x48); e.b(0x89); e.b(0xCB);  // mov rbx, rcx
    e.b(0x4C); e.b(0x89); e.b(0xC7);  // mov rdi, r8
    e.b(0x4C); e.b(0x89); e.b(0xCA);  // mov rdx, r9
    e.b(0x48); e.b(0x8D); e.b(0x83); e.d32(256);   // lea rax, [rbx+256]
    e.b(0x48); e.b(0x8D); e.b(0x8B); e.d32(512);   // lea rcx, [rbx+512]
    e.b(0x48); e.b(0x8D); e.b(0xAB); e.d32(768);   // lea rbp, [rbx+768]
    e.b(0x48); e.b(0x8D); e.b(0xB3); e.d32(1024);  // lea rsi, [rbx+1024]
}
static void emitEpilogue(Emitter& e) {
    e.b(0xC5); e.b(0xF8); e.b(0x77);  // vzeroupper
    for (int i = 0; i < 10; i++) {
        int r = 6 + i;
        e.b(0xC5); e.b(((r & 8) ? 0 : 0x80) | 0x78); e.b(0x10); e.b(0x84 | ((r & 7) << 3)); e.b(0x24); e.d32(i * 16);
    }
    e.b(0x48); e.b(0x81); e.b(0xC4); e.d32(0xA0);  // add rsp, 0xA0
    e.b(0x5F); e.b(0x5E); e.b(0x5D); e.b(0x5B); e.b(0xC3);    // pop rdi, rsi, rbp, rbx; ret
}

// Second DFS over the compact op graph: children visited in order of decreasing height (deep first).
static void reorderByHeight(Net& net, int mode) {
    const int I = net.I, F = net.F, O = net.O, n = net.n, IF = I + F;
    if (n == 0) return;
    std::vector<i32> h(n);
    for (int i = 0; i < n; i++) {
        int m = (net.kind[i] >= K_MUX) ? 3 : 2;
        i32 ids[3] = {net.a[i], net.b[i], net.c[i]};
        i32 mh = 0;
        for (int k = 0; k < m; k++) if (ids[k] >= IF) mh = std::max(mh, h[ids[k] - IF]);
        h[i] = mh + 1;
    }
    std::vector<i32> newIdx(n, -1);
    std::vector<i32> order;
    order.reserve(n);
    struct Fr { i32 g; i32 k; i32 ch[3]; };
    std::vector<Fr> stk;
    stk.reserve(4096);
    auto pushNode = [&](int g) {
        Fr f;
        f.g = g; f.k = 0;
        int m = (net.kind[g] >= K_MUX) ? 3 : 2;
        i32 ids[3] = {net.a[g], net.b[g], net.c[g]};
        i32 ord[3] = {0, 1, 2};
        auto hh = [&](int q) { return ids[q] >= IF ? h[ids[q] - IF] : 0; };
        if (mode == 1) {  // deep first
            std::stable_sort(ord, ord + m, [&](int x, int y) { return hh(x) > hh(y); });
        } else if (mode == 2) {  // shallow first
            std::stable_sort(ord, ord + m, [&](int x, int y) { return hh(x) < hh(y); });
        }
        for (int q = 0; q < 3; q++) f.ch[q] = (q < m) ? ids[ord[q]] : -1;
        stk.push_back(f);
    };
    std::vector<uint8_t> vis(n, 0);
    auto root = [&](i32 l) {
        if (l < 0) return;
        int id = l >> 1;
        if (id < IF) return;
        int g = id - IF;
        if (vis[g]) return;
        vis[g] = 1;
        pushNode(g);
        while (!stk.empty()) {
            Fr& f = stk.back();
            if (f.k < 3 && f.ch[f.k] >= 0) {
                int id2 = f.ch[f.k++];
                if (id2 >= IF && !vis[id2 - IF]) { vis[id2 - IF] = 1; pushNode(id2 - IF); }
            } else {
                newIdx[f.g] = (i32)order.size();
                order.push_back(f.g);
                stk.pop_back();
            }
        }
    };
    for (int j = 0; j < O; j++) root(net.oLit[j]);
    for (int f = 0; f < F; f++) root(net.dLit[f]);
    int nn = (int)order.size();
    auto remap = [&](i32 id) { return id < IF ? id : IF + newIdx[id - IF]; };
    std::vector<uint8_t> k2(nn);
    std::vector<i32> a2(nn), b2(nn), c2(nn);
    for (int q = 0; q < nn; q++) {
        int g = order[q];
        int m = (net.kind[g] >= K_MUX) ? 3 : 2;
        k2[q] = net.kind[g];
        a2[q] = remap(net.a[g]);
        b2[q] = remap(net.b[g]);
        c2[q] = (m == 3) ? remap(net.c[g]) : net.c[g];
    }
    net.kind.swap(k2); net.a.swap(a2); net.b.swap(b2); net.c.swap(c2);
    net.n = nn;
    auto remapLit = [&](i32& l) { if (l >= 0 && (l >> 1) >= IF) l = (remap(l >> 1) << 1) | (l & 1); };
    for (int f = 0; f < F; f++) remapLit(net.dLit[f]);
    for (int j = 0; j < O; j++) remapLit(net.oLit[j]);
}

static bool compileProgram(const Circuit& c, Program& P) {
#ifdef SIMDEBUG
    g_t0 = g_tl = dbgNow();
#endif
    Net& net = P.net;
    {
        Builder bld(c, net);
        bld.build();
    }
    DBGT("build");
    const int I = net.I, F = net.F, O = net.O;
    // dead-op elimination (ops can become dead through constant folding)
    {
        const int n0 = net.n;
        std::vector<uint8_t> live(n0, 0);
        auto markLit = [&](i32 l) {
            if (l >= 0 && (l >> 1) >= I + F) live[(l >> 1) - I - F] = 1;
        };
        for (int f = 0; f < F; f++) markLit(net.dLit[f]);
        for (int j = 0; j < O; j++) markLit(net.oLit[j]);
        for (int i = n0 - 1; i >= 0; i--) {
            if (!live[i]) continue;
            int m = (net.kind[i] >= K_MUX) ? 3 : 2;
            i32 ids[3] = {net.a[i], net.b[i], net.c[i]};
            for (int k = 0; k < m; k++)
                if (ids[k] >= I + F) live[ids[k] - I - F] = 1;
        }
        int cnt = 0;
        for (int i = 0; i < n0; i++) cnt += live[i];
        if (cnt != n0) {
            std::vector<i32> nidx(n0);
            int j = 0;
            for (int i = 0; i < n0; i++) nidx[i] = live[i] ? j++ : -1;
            auto remap = [&](i32 id) { return id < I + F ? id : I + F + nidx[id - I - F]; };
            for (int i = 0; i < n0; i++) {
                if (!live[i]) continue;
                int o = nidx[i];
                int m = (net.kind[i] >= K_MUX) ? 3 : 2;
                i32 na = remap(net.a[i]), nb = remap(net.b[i]), nc = (m == 3) ? remap(net.c[i]) : net.c[i];
                net.kind[o] = net.kind[i];
                net.a[o] = na;
                net.b[o] = nb;
                net.c[o] = nc;
            }
            net.n = cnt;
            net.kind.resize(cnt);
            net.a.resize(cnt);
            net.b.resize(cnt);
            net.c.resize(cnt);
            auto remapLit = [&](i32& l) {
                if (l >= 0 && (l >> 1) >= I + F) l = (remap(l >> 1) << 1) | (l & 1);
            };
            for (int f = 0; f < F; f++) remapLit(net.dLit[f]);
            for (int jj = 0; jj < O; jj++) remapLit(net.oLit[jj]);
        }
    }
#ifdef REORDER
    reorderByHeight(net, REORDER);
    DBGT("reorder");
#endif
    const int n = net.n;
    const int NV = I + F + n;
#ifndef CHUNK_OPS
#define CHUNK_OPS 1024
#endif
    const int CH = CHUNK_OPS;
    P.ffslot.resize(F);
    for (int f = 0; f < F; f++) P.ffslot[f] = f;

    Use& U = P.use;
    U.sinkHead.assign(n, -1);
    // sinks
    P.outs.assign(O, {0, 0, 0});
    P.copies.clear();
    Layout& L = P.L;
    L.I = I; L.F = F; L.O = O;
    L.offOut = I;
    L.offOnes = I + O;
    L.offZeros = I + O + 1;
    L.offCross = I + O + 2;
    auto addSink = [&](int op, int type, int idx, int flip) {
        Sink s;
        s.type = type; s.idx = idx; s.flip = flip;
        s.next = U.sinkHead[op];
        U.sinkHead[op] = (int)U.sinks.size();
        U.sinks.push_back(s);
    };
    for (int f = 0; f < F; f++) {
        i32 l = net.dLit[f];
        if (l < 0) {
            P.copies.push_back({f, 0, (l & 1) ? L.offOnes : L.offZeros, 0});
        } else {
            int id = l >> 1;
            if (id < I) P.copies.push_back({f, 0, id, l & 1});
            else if (id < I + F) P.copies.push_back({f, 1, id - I, l & 1});
            else addSink(id - I - F, 0, f, l & 1);
        }
    }
    for (int j = 0; j < O; j++) {
        i32 l = net.oLit[j];
        if (l < 0) {
            P.outs[j] = {0, (l & 1) ? L.offOnes : L.offZeros, 0};
        } else {
            int id = l >> 1;
            if (id < I) P.outs[j] = {0, id, l & 1};
            else if (id < I + F) P.outs[j] = {1, id - I, l & 1};
            else {
                P.outs[j] = {0, L.offOut + j, l & 1};
                addSink(id - I - F, 1, j, 0);
            }
        }
    }
    DBGT("sinks");
    // backward use scan
    U.nu.assign((size_t)3 * n, INF);
    U.nu2.assign((size_t)3 * n, INF);
    U.first.assign(n, INF);
    U.cross.assign(n, -1);
    std::vector<i32> ffFirst(F, INF);
    std::vector<i32> finPos(n, -1);
    {
        std::vector<i32> lastUse(NV, INF), lastUse2(NV, INF);
        for (int i = n - 1; i >= 0; i--) {
            int did = I + F + i;
            U.first[i] = lastUse[did];
            int kind = net.kind[i];
            int m = (kind >= K_MUX) ? 3 : 2;
            int ids[3] = {net.a[i], net.b[i], net.c[i]};
            for (int k = 0; k < m; k++) {
                int v = ids[k];
                int lu = lastUse[v];
                U.nu[3 * i + k] = lu;
                U.nu2[3 * i + k] = lastUse2[v];
                lastUse2[v] = lu;
                lastUse[v] = i;
                if (lu == INF && v >= I + F) {
                    int p = v - I - F;
                    if (p / CH != i / CH) { U.cross[p] = 0; finPos[p] = i; }  // marks a cross-chunk value
                }
                if (v >= I && v < I + F) ffFirst[v - I] = i;
            }
        }
    }
    {
        // forward cross slot assignment: short-lived values reuse the most recently freed slot (cache friendly),
        // long-lived ("cold") values get a private slot in order of first use (page / cache locality of loads)
#ifndef COLD_H
#define COLD_H 0x7fffffff
#endif
        std::vector<i32> freeC;
        std::vector<uint8_t> isCold(n, 0);
        int nh = 0, ncold = 0;
        for (int i = 0; i < n; i++)
            if (U.cross[i] >= 0 && finPos[i] - i > COLD_H) isCold[i] = 1;
        std::vector<i32> coldIdx(n, -1);
        for (int i = 0; i < n; i++) {
            int kind = net.kind[i];
            int m = (kind >= K_MUX) ? 3 : 2;
            int ids[3] = {net.a[i], net.b[i], net.c[i]};
            for (int k = 0; k < m; k++) {
                int v = ids[k];
                if (v < I + F) continue;
                int p = v - I - F;
                if (U.cross[p] < 0) continue;
                if (isCold[p]) {
                    if (coldIdx[p] < 0) coldIdx[p] = ncold++;
                } else if (U.nu[3 * i + k] == INF) {
                    freeC.push_back(U.cross[p]);
                }
            }
            if (U.cross[i] >= 0 && !isCold[i]) {
                if (!freeC.empty()) { U.cross[i] = freeC.back(); freeC.pop_back(); }
                else U.cross[i] = nh++;
            }
        }
        // cold values that are never read (cannot happen) keep -1; fix up final slot numbers
        for (int i = 0; i < n; i++) {
            if (U.cross[i] >= 0 && isCold[i]) U.cross[i] = nh + coldIdx[i];
        }
        U.nCross = nh + ncold;
    }
    {
        std::vector<std::pair<i32, i32>> order(F);
        for (int f = 0; f < F; f++) order[f] = {ffFirst[f], f};
        std::sort(order.begin(), order.end());
        if (!getenv("NOFFORD")) for (int r = 0; r < F; r++) P.ffslot[order[r].second] = r;
    }
    L.fixedSlots = L.offCross + U.nCross;
#ifdef SIMDEBUG
    g_dbgOffCross = L.offCross;
#endif
    {
        auto up64 = [](long x) { return (x + 63) & ~63L; };
        L.fixedBytes = up64(32L * L.fixedSlots + 64);
        L.spillOff = L.fixedBytes;
#ifdef SIMDEBUG
        g_dbgSpillOff = L.spillOff;
#endif
        L.spillCap = CH + 8;
        long spillBytes = up64(32L * L.spillCap + 256);
        L.ffOff = L.spillOff + spillBytes;
        long ffBytes = up64(32L * std::max(F, 1) + 64);
        L.frameBytes = L.ffOff + 2 * ffBytes;
    }
    DBGT("usescan");

    // code generation per chunk
    int nchunks = (n + CH - 1) / CH;
    struct Buf { uint8_t* p = nullptr; size_t size = 0; };
    std::vector<Buf> bufs(nchunks);
    std::vector<int> maxSlots(nchunks, 0);
#pragma omp parallel for schedule(dynamic, 1) if (nchunks > 1)
    for (int ch = 0; ch < nchunks; ch++) {
        int cb = ch * CH, ce = std::min(n, cb + CH);
        ChunkGen g(net, U, L, P.ffslot, cb, ce);
        size_t nsk = 0;
        for (int i = cb; i < ce; i++)
            for (int k = U.sinkHead[i]; k >= 0; k = U.sinks[k].next) nsk++;
        size_t bound = (size_t)(ce - cb) * 80 + nsk * 24 + 256 + (size_t)(ce - cb) * 3 * 8;
        uint8_t* bp = (uint8_t*)malloc(bound);
        bufs[ch].p = bp;
        g.e.p = bp;
#ifdef USE_PF
        if (ch + 1 < nchunks) g.buildPrefetch(ce, std::min(n, ce + CH), 1024);
#endif
        g.run();
#ifdef SIMDEBUG
#pragma omp critical
        { for (int q = 0; q < 6; q++) { g_cnt.n[q] += g.e.cnt.n[q]; g_cnt.bytes[q] += g.e.cnt.bytes[q]; } }
#endif
        maxSlots[ch] = g.maxSlot;
        bufs[ch].size = (size_t)(g.e.p - bp);
        maxSlots[ch] = g.maxSlot;
    }
    DBGT("codegen");
    size_t total = 512;
    for (auto& b : bufs) total += b.size;
    size_t cap = total + 512;
#ifdef _WIN32
    uint8_t* mem = (uint8_t*)VirtualAlloc(nullptr, cap, MEM_COMMIT | MEM_RESERVE, PAGE_EXECUTE_READWRITE);
#else
    uint8_t* mem = nullptr;
#endif
    if (!mem) return false;
    P.code = mem;
    P.codeCap = cap;
    Emitter e;
    e.p = mem;
    emitPrologue(e, 0);
    size_t plen = e.p - mem;
    std::vector<size_t> offs(nchunks + 1);
    offs[0] = plen;
    for (int ch = 0; ch < nchunks; ch++) offs[ch + 1] = offs[ch] + bufs[ch].size;
#pragma omp parallel for schedule(static) if (nchunks > 1)
    for (int ch = 0; ch < nchunks; ch++) {
        memcpy(mem + offs[ch], bufs[ch].p, bufs[ch].size);
        free(bufs[ch].p);
    }
    e.p = mem + offs[nchunks];
    emitEpilogue(e);
    int ms = 0;
    for (int ch = 0; ch < nchunks; ch++) ms = std::max(ms, maxSlots[ch]);
    P.maxSpill = ms;
    if (ms > L.spillCap - 4) return false;
    P.fn = (JitFn)mem;
    DBGT("link");
#ifdef _WIN32
    FlushInstructionCache(GetCurrentProcess(), mem, cap);
#endif
    return true;
}

// ---------------------------------------------------------------------------------------------
// bit matrix transpose of 4 independent 64x64 blocks (rows in a[k], qword q = block q)
// ---------------------------------------------------------------------------------------------
template <int J>
static inline void tstage(__m256i* a, u64 mask) {
    const __m256i m = _mm256_set1_epi64x((long long)mask);
    for (int k = 0; k < 64; k++) {
        if (k & J) continue;
        __m256i x = a[k], y = a[k + J];
        __m256i t = _mm256_and_si256(_mm256_xor_si256(_mm256_srli_epi64(x, J), y), m);
        a[k + J] = _mm256_xor_si256(y, t);
        a[k] = _mm256_xor_si256(x, _mm256_slli_epi64(t, J));
    }
}
static inline void transpose64x4(__m256i* a) {
    tstage<32>(a, 0x00000000FFFFFFFFULL);
    tstage<16>(a, 0x0000FFFF0000FFFFULL);
    tstage<8>(a, 0x00FF00FF00FF00FFULL);
    tstage<4>(a, 0x0F0F0F0F0F0F0F0FULL);
    tstage<2>(a, 0x3333333333333333ULL);
    tstage<1>(a, 0x5555555555555555ULL);
}

static inline __m256i mul64c(__m256i a, __m256i clo, __m256i chi) {
    __m256i p0 = _mm256_mul_epu32(a, clo);
    __m256i ah = _mm256_srli_epi64(a, 32);
    __m256i p1 = _mm256_mul_epu32(ah, clo);
    __m256i p2 = _mm256_mul_epu32(a, chi);
    return _mm256_add_epi64(p0, _mm256_slli_epi64(_mm256_add_epi64(p1, p2), 32));
}

struct HashTab {
    int nb;
    std::vector<u64> tab;  // [t][kb][256]
};

struct GroupState {
    uint8_t* frame;
    __m256i S[64];
    u64 H[256];
};

static void runUnit(const Circuit& c, const Program& P, const HashTab& HT, int g0, int K, u64* result) {
    const int I = P.net.I, F = P.net.F, O = P.net.O;
    const int T = c.T;
    const Layout& L = P.L;
    const long FB = L.frameBytes;
    long ffBytes = (L.frameBytes - L.ffOff) / 2;
    uint8_t* mem = (uint8_t*)_aligned_malloc((size_t)(FB * K + 4096), 64);
    memset(mem, 0, (size_t)(FB * K));
    std::vector<GroupState*> gs(K);
    __m256i* X = (__m256i*)_aligned_malloc(64 * 32 + 64, 64);
    for (int k = 0; k < K; k++) {
        GroupState* st = (GroupState*)_aligned_malloc(sizeof(GroupState), 64);
        gs[k] = st;
        st->frame = mem + FB * k;
        memset(st->frame + 32L * L.offOnes, 0xFF, 32);
        memset(st->H, 0, sizeof(st->H));
        long grp = g0 + k;
        for (int kk = 0; kk < 64; kk++) {
            u64 v[4];
            for (int q = 0; q < 4; q++) {
                u64 lane = (u64)grp * 256 + (u64)q * 64 + (u64)kk;
                v[q] = mix64(c.seed ^ lane);
            }
            st->S[kk] = _mm256_set_epi64x((long long)v[3], (long long)v[2], (long long)v[1], (long long)v[0]);
        }
    }
    const __m256i g = _mm256_set1_epi64x((long long)GAMMA);
    const __m256i c1lo = _mm256_set1_epi64x((long long)(MC1 & 0xFFFFFFFFULL)), c1hi = _mm256_set1_epi64x((long long)(MC1 >> 32));
    const __m256i c2lo = _mm256_set1_epi64x((long long)(MC2 & 0xFFFFFFFFULL)), c2hi = _mm256_set1_epi64x((long long)(MC2 >> 32));
    const int nb = HT.nb;
    const int PIn = std::min(I, 64);
    JitFn fn = P.fn;
    uint8_t* rbxBase = mem + L.spillOff + 128;
    uint8_t* ffA = mem + L.ffOff;
    uint8_t* ffB = ffA + ffBytes;
    const __m256i ones = _mm256_set1_epi32(-1);
    for (int t = 0; t < T; t++) {
        uint8_t* cur = (t & 1) ? ffB : ffA;
        uint8_t* nxt = (t & 1) ? ffA : ffB;
        // primary inputs
        for (int k = 0; k < K; k++) {
            GroupState* st = gs[k];
            for (int kk = 0; kk < 64; kk++) {
                __m256i s = _mm256_add_epi64(st->S[kk], g);
                st->S[kk] = s;
                __m256i z = _mm256_xor_si256(s, _mm256_srli_epi64(s, 30));
                z = mul64c(z, c1lo, c1hi);
                z = _mm256_xor_si256(z, _mm256_srli_epi64(z, 27));
                z = mul64c(z, c2lo, c2hi);
                z = _mm256_xor_si256(z, _mm256_srli_epi64(z, 31));
                X[kk] = z;
            }
            transpose64x4(X);
            for (int i = 0; i < PIn; i++) _mm256_storeu_si256((__m256i*)(st->frame + 32 * i), X[i]);
        }
#ifdef SIMDEBUG
        if (!(g_expMode & 4096))
#endif
        fn(rbxBase, K, cur, nxt);
        for (int k = 0; k < K; k++) {
            GroupState* st = gs[k];
            uint8_t* fixed = st->frame;
            uint8_t* curk = cur + FB * k;
            uint8_t* nxtk = nxt + FB * k;
            for (const auto& cp : P.copies) {
                const uint8_t* src = (cp.space == 0) ? (fixed + 32 * cp.idx) : (curk + 32 * P.ffslot[cp.idx]);
                __m256i v = _mm256_loadu_si256((const __m256i*)src);
                if (cp.flip) v = _mm256_xor_si256(v, ones);
                _mm256_storeu_si256((__m256i*)(nxtk + 32 * P.ffslot[cp.f]), v);
            }
            for (int j = 0; j < 64; j++) {
                if (j < O) {
                    const auto& oi = P.outs[j];
                    const uint8_t* src = (oi.space == 0) ? (fixed + 32 * oi.idx) : (curk + 32 * P.ffslot[oi.idx]);
                    __m256i v = _mm256_loadu_si256((const __m256i*)src);
                    if (oi.flip) v = _mm256_xor_si256(v, ones);
                    X[j] = v;
                } else {
                    X[j] = _mm256_setzero_si256();
                }
            }
            transpose64x4(X);
            const u64* tb = &HT.tab[(size_t)t * nb * 256];
            const u64* Xw = (const u64*)X;
            u64* H = st->H;
            for (int kk = 0; kk < 64; kk++) {
                for (int q = 0; q < 4; q++) {
                    u64 w = Xw[4 * kk + q];
                    u64 h = 0;
                    for (int kb = 0; kb < nb; kb++) h ^= tb[kb * 256 + ((w >> (8 * kb)) & 255)];
                    H[q * 64 + kk] ^= h;
                }
            }
        }
    }
    for (int k = 0; k < K; k++) {
        for (int l = 0; l < 256; l++) {
            long m = (long)(g0 + k) * 256 + l;
            if (m < c.M) result[m] = gs[k]->H[l];
        }
        _aligned_free(gs[k]);
    }
    _aligned_free(X);
    _aligned_free(mem);
}

static void buildHashTables(const Circuit& c, HashTab& HT) {
    const int O = c.O, T = c.T;
    HT.nb = std::max(1, (std::min(O, 64) + 7) / 8);
    HT.tab.assign((size_t)T * HT.nb * 256, 0);
#pragma omp parallel for schedule(static) if (T > 8)
    for (int t = 0; t < T; t++) {
        u64 K[64];
        for (int j = 0; j < 64; j++) K[j] = (j < O) ? mix64((u64)t * (u64)O + (u64)j) : 0;
        u64* tb = &HT.tab[(size_t)t * HT.nb * 256];
        for (int kb = 0; kb < HT.nb; kb++) {
            u64* e = tb + kb * 256;
            e[0] = 0;
            for (int v = 1; v < 256; v++) {
                int low = __builtin_ctz(v);
                e[v] = e[v & (v - 1)] ^ K[8 * kb + low];
            }
        }
    }
}

}  // namespace

std::vector<uint64_t> simulate(const Circuit& c) {
    std::vector<uint64_t> res(c.M, 0);
    if (c.M <= 0) return res;
    Program P;
#ifdef SIMDEBUG
    if (c.G > 1000 && getenv("SIMEXP")) g_expMode = atoi(getenv("SIMEXP"));
#endif
    bool ok = compileProgram(c, P);
    if (!ok) return res;
    HashTab HT;
    buildHashTables(c, HT);
    DBGT("hashtab");
    int groups = (c.M + 255) / 256;
#ifndef KUNIT
#define KUNIT 1
#endif
    const int KU = KUNIT;
    int units = (groups + KU - 1) / KU;
#ifndef MAXTH
#define MAXTH 8
#endif
    int nth = std::min(units, std::min(MAXTH, std::max(1, omp_get_max_threads())));
#pragma omp parallel for schedule(dynamic, 1) num_threads(nth)
    for (int u = 0; u < units; u++) runUnit(c, P, HT, u * KU, std::min(KU, groups - u * KU), res.data());
    DBGT("run");
#ifdef SIMDEBUG
    {
        const char* nm[4] = {"op-rr", "op-mem", "load", "store"};
        for (int q = 0; q < 4; q++) fprintf(stderr, "%s: n=%ld bytes=%ld\n", nm[q], g_cnt.n[q], g_cnt.bytes[q]);
    }
    fprintf(stderr, "ops=%d cross=%d maxspill=%d codebytes=%zu\n", P.net.n, P.use.nCross, P.maxSpill, P.codeCap);
#endif
    return res;
}

// Bit-sliced cycle simulator v2.
// - 256 stimulus groups per AVX2 vector (GCC vector extension), OpenMP over group blocks.
// - NOT gates are free (polarity absorbed); MUX fused; 2-input gates become one of
//   AND / ANDNL / ANDNR / OR / XOR with statically known output polarity.
// - Ops are scheduled in kind-batches (independent ops of one kind run as a tight loop);
//   narrow regions run as one flat stream of generic ANF records (branch-free).
// - Value slots are reused by liveness; records are 8 bytes (uint16) unless slots overflow.
#include <cstdint>
#include <cstring>
#include <vector>
#include <algorithm>
#include <queue>

struct Circuit {
    int I, F, G, O, M, T;
    uint64_t seed;
    std::vector<int> d;              // size F: data input of each flip-flop
    std::vector<uint8_t> type;       // size G: 0 AND, 1 OR, 2 XOR, 3 NAND, 4 NOR, 5 XNOR, 6 NOT, 7 MUX
    std::vector<int> in0, in1, in2;  // size G: input signals; unused inputs are -1; MUX: in0=s, in1=a, in2=b
    std::vector<int> out;            // size O: primary outputs
};

#ifndef FORCE32
#define FORCE32 0  // testing hook: force 32-bit record indices
#endif
#ifndef MINB
#define MINB 8
#endif
#ifndef WINDOW
#define WINDOW 256
#endif
#ifndef VW
#define VW 4  // 64-bit words per vector (stimulus groups = 64 * VW per block)
#endif
typedef unsigned long long vecT __attribute__((vector_size(8 * VW)));

static inline vecT vbcast(uint64_t b) {
    vecT r;
    for (int i = 0; i < VW; i++) r[i] = b;
    return r;
}

static const uint64_t GAMMA = 0x9E3779B97F4A7C15ULL;

static inline uint64_t fin(uint64_t z) {
    z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9ULL;
    z = (z ^ (z >> 27)) * 0x94D049BB133111EBULL;
    return z ^ (z >> 31);
}

static inline uint64_t mix64(uint64_t x) { return fin(x + GAMMA); }

// In-place transpose of a 64x64 bit matrix (row i = a[i], bit j).
static void transpose64(uint64_t a[64]) {
    int j = 32;
    uint64_t m = 0x00000000FFFFFFFFULL;
    while (j) {
        for (int k = 0; k < 64; k = ((k | j) + 1) & ~j) {
            uint64_t t = ((a[k] >> j) ^ a[k | j]) & m;
            a[k] ^= t << j;
            a[k | j] ^= t;
        }
        j >>= 1;
        m ^= m << j;
    }
}

// Kinds. Two-input kinds act on stored (polarity-coded) operands x, y:
//   AND x&y, ANDNL ~x&y, ANDNR x&~y, OR x|y, XOR x^y.
// MUX kinds (fused, operands S, A, B): t = A^B, e = op(S, t), out = A^e, op in {AND, ANDNL, ANDNR, OR}.
// KD_MIX: one generic record evaluating any two-input function of (x, y) from its coefficient bits.
enum : uint8_t {
    KD_AND = 0, KD_ANDNL, KD_ANDNR, KD_OR, KD_XOR,
    KD_MAND, KD_MANDNL, KD_MANDNR, KD_MOR,
    KD_MIX,
    KD_NUM
};

static inline bool isMuxKind(uint8_t k) { return k >= KD_MAND && k <= KD_MOR; }

// Generic coefficients for f(x,y) = c0 ^ (x & (c1 ^ (y & c3))) ^ (y & c2); bit0=c0 .. bit3=c3.
static const int CB_XOR = 6, CB_AND = 8, CB_ANDNL = 12, CB_ANDNR = 10, CB_OR = 14;

struct Op {
    int a, b, c;      // operand refs: >=0 op value id, <0 fixed slot (-1-slot)
    int id;           // op value id (== index in ops)
    uint8_t kind;
    uint8_t outPol;   // polarity of the stored output
};

struct Rec5 { int s0, s1, s2, d, cb; };  // logical record (value ids / fixed refs)
struct Grp { uint8_t kind; uint32_t start, count; };  // records [start, start+count)
struct Run { uint8_t kind; uint32_t start, count; };  // executable run (merged mixed groups)

struct Plan {
    std::vector<Op> ops;
    std::vector<Rec5> recs;
    std::vector<Grp> grps;
    int nTemps = 0;
};

static inline int cbOfKind(uint8_t k) {
    switch (k) {
        case KD_AND: return CB_AND;
        case KD_ANDNL: return CB_ANDNL;
        case KD_ANDNR: return CB_ANDNR;
        case KD_OR: return CB_OR;
        default: return CB_XOR;
    }
}

static inline int cbOfMuxE(uint8_t k) {
    switch (k) {
        case KD_MAND: return CB_AND;
        case KD_MANDNL: return CB_ANDNL;
        case KD_MANDNR: return CB_ANDNR;
        default: return CB_OR;
    }
}

// Consumer lists in CSR form: consumers of op value v are idx[off[v] .. off[v+1]) (one entry per operand use).
struct Csr {
    std::vector<int> off, idx;
};

static Csr buildConsumers(const std::vector<Op>& ops) {
    const int n = (int)ops.size();
    Csr cs;
    cs.off.assign(n + 1, 0);
    for (int j = 0; j < n; j++) {
        const Op& o = ops[j];
        const int k = isMuxKind(o.kind) ? 3 : 2;
        const int refs[3] = {o.a, o.b, o.c};
        for (int q = 0; q < k; q++) if (refs[q] >= 0) cs.off[refs[q] + 1]++;
    }
    for (int v = 0; v < n; v++) cs.off[v + 1] += cs.off[v];
    cs.idx.resize(cs.off[n]);
    std::vector<int> pos(cs.off.begin(), cs.off.end() - 1);
    for (int j = 0; j < n; j++) {
        const Op& o = ops[j];
        const int k = isMuxKind(o.kind) ? 3 : 2;
        const int refs[3] = {o.a, o.b, o.c};
        for (int q = 0; q < k; q++) if (refs[q] >= 0) cs.idx[pos[refs[q]]++] = j;
    }
    return cs;
}

// Liveness-aware order: greedy that prefers ready ops which are the last user of their operands.
static std::vector<int> greedyOrder(const std::vector<Op>& ops, const std::vector<char>& isRoot, const Csr& cs) {
    const int nOps = (int)ops.size();
    std::vector<int> remain(nOps), deg(nOps, 0), level(nOps, 0), score(nOps, 0);
    for (int v = 0; v < nOps; v++) remain[v] = cs.off[v + 1] - cs.off[v];
    for (int j = 0; j < nOps; j++) {
        const Op& o = ops[j];
        const int k = isMuxKind(o.kind) ? 3 : 2;
        const int refs[3] = {o.a, o.b, o.c};
        int lv = 0;
        for (int q = 0; q < k; q++) if (refs[q] >= 0) { deg[j]++; lv = std::max(lv, level[refs[q]] + 1); }
        level[j] = lv;
    }
    auto operandsOf = [&](int j, int* out) {
        const Op& o = ops[j];
        const int k = isMuxKind(o.kind) ? 3 : 2;
        const int refs[3] = {o.a, o.b, o.c};
        int m = 0;
        for (int q = 0; q < k; q++) if (refs[q] >= 0) out[m++] = refs[q];
        return m;
    };
    auto scoreOf = [&](int j) {
        int ins[3];
        const int k = operandsOf(j, ins);
        int sc = 0;
        for (int i = 0; i < k; i++) {
            const int v = ins[i];
            if (isRoot[v]) continue;
            int uses = 0;
            for (int q = 0; q < k; q++) if (ins[q] == v) uses++;
            if (remain[v] <= uses) sc++;
        }
        return sc;
    };
    // Heap key: score (high bits), then smaller level first, then op id.
    const uint64_t LMAX = (1ULL << 21) - 1;
    auto keyOf = [&](int j) -> uint64_t {
        uint64_t lv = (uint64_t)std::min(level[j], (int)LMAX);
        return ((uint64_t)score[j] << 41) | ((LMAX - lv) << 20) | (uint64_t)j;
    };
    std::priority_queue<uint64_t> pq;
    std::vector<char> done(nOps, 0);
    for (int j = 0; j < nOps; j++) if (deg[j] == 0) { score[j] = scoreOf(j); pq.push(keyOf(j)); }
    std::vector<int> order;
    order.reserve(nOps);
    while (!pq.empty()) {
        const uint64_t top = pq.top();
        pq.pop();
        const int j = (int)(top & ((1ULL << 20) - 1));
        if (done[j] || deg[j] != 0 || (int)(top >> 41) != score[j]) continue;
        done[j] = 1;
        order.push_back(j);
        int ins[3];
        const int k = operandsOf(j, ins);
        for (int i = 0; i < k; i++) remain[ins[i]]--;
        for (int i = 0; i < k; i++) {
            const int v = ins[i];
            if (!isRoot[v] && remain[v] == 1) {
                for (int e = cs.off[v]; e < cs.off[v + 1]; e++) {
                    const int cc = cs.idx[e];
                    if (!done[cc]) { score[cc] = scoreOf(cc); if (deg[cc] == 0) pq.push(keyOf(cc)); break; }
                }
            }
        }
        for (int e = cs.off[j]; e < cs.off[j + 1]; e++) {
            const int nx = cs.idx[e];
            if (--deg[nx] == 0) { score[nx] = scoreOf(nx); pq.push(keyOf(nx)); }
        }
    }
    return order;
}

// Window-limited kind-batched list scheduling over the liveness order; emits records and groups.
// Ready ops inside the window are kept in per-kind min-heaps keyed by their position in the order.
static void buildPlan(Plan& pl, const std::vector<char>& isRoot, int minb, int window) {
    const std::vector<Op>& ops = pl.ops;
    const int nOps = (int)ops.size();
    Csr cs = buildConsumers(ops);
    std::vector<int> order = greedyOrder(ops, isRoot, cs);
    std::vector<int> deg(nOps, 0);
    for (int v = 0; v < nOps; v++) for (int e = cs.off[v]; e < cs.off[v + 1]; e++) deg[cs.idx[e]]++;
    std::vector<int> posOf(nOps);
    for (int i = 0; i < nOps; i++) posOf[order[i]] = i;
    std::vector<char> emitted(nOps, 0);
    std::priority_queue<int, std::vector<int>, std::greater<int>> rh[KD_MIX];
    int cnt[KD_MIX] = {0};
    pl.recs.clear();
    pl.grps.clear();
    pl.recs.reserve((size_t)nOps + (size_t)nOps / 8);
    int nextTemp = nOps;
    size_t h = 0, end = 0;
    auto grow = [&](size_t newEnd) {
        for (size_t p = end; p < newEnd; p++) {
            const int j = order[p];
            if (!emitted[j] && deg[j] == 0) { rh[ops[j].kind].push((int)p); cnt[ops[j].kind]++; }
        }
        end = newEnd;
    };
    grow(std::min((size_t)nOps, (size_t)window));
    std::vector<int> batch;
    while (h < (size_t)nOps) {
        int bestK = -1, best = 0;
        for (int k = 0; k < KD_MIX; k++) if (cnt[k] > best) { best = cnt[k]; bestK = k; }
        batch.clear();
        if (bestK >= 0 && best >= minb) {
            while (!rh[bestK].empty()) { batch.push_back(order[rh[bestK].top()]); rh[bestK].pop(); }
            cnt[bestK] = 0;
            const uint32_t start = (uint32_t)pl.recs.size();
            const bool mux = isMuxKind((uint8_t)bestK);
            for (int j : batch) {
                const Op& o = ops[j];
                if (mux) pl.recs.push_back(Rec5{o.a, o.b, o.c, j, 0});
                else pl.recs.push_back(Rec5{o.a, o.b, -1, j, 0});
            }
            pl.grps.push_back(Grp{(uint8_t)bestK, start, (uint32_t)batch.size()});
        } else {
            for (int k = 0; k < KD_MIX; k++) {
                while (!rh[k].empty()) { batch.push_back(order[rh[k].top()]); rh[k].pop(); }
                cnt[k] = 0;
            }
            for (int j : batch) {
                const Op& o = ops[j];
                uint32_t s = (uint32_t)pl.recs.size();
                if (isMuxKind(o.kind)) {
                    // t1 = A^B ; t2 = op(S, t1) ; out = A^t2
                    const int t1 = nextTemp++, t2 = nextTemp++;
                    pl.recs.push_back(Rec5{o.b, o.c, -1, t1, CB_XOR});
                    pl.grps.push_back(Grp{KD_MIX, s, 1});
                    s = (uint32_t)pl.recs.size();
                    pl.recs.push_back(Rec5{o.a, t1, -1, t2, cbOfMuxE(o.kind)});
                    pl.grps.push_back(Grp{KD_MIX, s, 1});
                    s = (uint32_t)pl.recs.size();
                    pl.recs.push_back(Rec5{o.b, t2, -1, j, CB_XOR});
                    pl.grps.push_back(Grp{KD_MIX, s, 1});
                } else {
                    pl.recs.push_back(Rec5{o.a, o.b, -1, j, cbOfKind(o.kind)});
                    pl.grps.push_back(Grp{KD_MIX, s, 1});
                }
            }
        }
        for (int j : batch) emitted[j] = 1;
        for (int j : batch) {
            for (int e = cs.off[j]; e < cs.off[j + 1]; e++) {
                const int c = cs.idx[e];
                if (--deg[c] == 0 && (size_t)posOf[c] < end) {
                    rh[ops[c].kind].push(posOf[c]);
                    cnt[ops[c].kind]++;
                }
            }
        }
        while (h < (size_t)nOps && emitted[order[h]]) h++;
        const size_t newEnd = std::min((size_t)nOps, h + (size_t)window);
        if (newEnd > end) grow(newEnd);
    }
    pl.nTemps = nextTemp - nOps;
}

// Liveness-based slot allocation over the scheduled groups.
// A group's destinations take slots that were free before the group; slots released by a group become
// reusable from the next group on. Roots (outputs and flip-flop data) live until the end of the cycle.
static void allocSlots(const Plan& pl, int base, const std::vector<int>& roots, std::vector<int>& slotOf,
                       int& numSlots) {
    const int ngrp = (int)pl.grps.size();
    const int END = ngrp;
    const int nVal = (int)pl.ops.size() + pl.nTemps;
    std::vector<int> lastUse(nVal, -1);
    auto nSrc = [&](uint8_t kind) { return isMuxKind(kind) ? 3 : 2; };
    for (int gi = 0; gi < ngrp; gi++) {
        const Grp& g = pl.grps[gi];
        const int ns = nSrc(g.kind);
        for (uint32_t r = g.start; r < g.start + g.count; r++) {
            const Rec5& Rr = pl.recs[r];
            const int src[3] = {Rr.s0, Rr.s1, ns == 3 ? Rr.s2 : -1};
            for (int q = 0; q < ns; q++) if (src[q] >= 0) lastUse[src[q]] = gi;
        }
    }
    for (int v : roots) if (v >= 0) lastUse[v] = END;

    slotOf.assign(nVal, -1);
    std::vector<char> pushed(nVal, 0);
    std::vector<int> freeList, toFree;
    int nextSlot = base;
    for (int gi = 0; gi < ngrp; gi++) {
        const Grp& g = pl.grps[gi];
        const int ns = nSrc(g.kind);
        toFree.clear();
        for (uint32_t r = g.start; r < g.start + g.count; r++) {
            const Rec5& Rr = pl.recs[r];
            const int src[3] = {Rr.s0, Rr.s1, ns == 3 ? Rr.s2 : -1};
            for (int q = 0; q < ns; q++) {
                const int v = src[q];
                if (v >= 0 && lastUse[v] == gi && !pushed[v]) { pushed[v] = 1; toFree.push_back(slotOf[v]); }
            }
        }
        for (uint32_t r = g.start; r < g.start + g.count; r++) {
            const int d = pl.recs[r].d;
            int slot;
            if (!freeList.empty()) { slot = freeList.back(); freeList.pop_back(); }
            else slot = nextSlot++;
            slotOf[d] = slot;
            if (lastUse[d] == -1) toFree.push_back(slot);  // never read (cannot happen for reachable ops)
        }
        for (int s : toFree) freeList.push_back(s);
    }
    numSlots = nextSlot;
}

// Packs the records (4 fields each) with slot numbers multiplied by `scale`, and builds the runs.
template <typename IT>
static void packRecs(const Plan& pl, const std::vector<int>& slotOf, IT scale, std::vector<IT>& R,
                     std::vector<Run>& runs) {
    const int ngrp = (int)pl.grps.size();
    auto enc = [&](int v) -> IT { return v < 0 ? (IT)((-1 - v) * (int)scale) : (IT)(slotOf[v] * (int)scale); };
    R.assign(pl.recs.size() * 4, 0);
    for (int gi = 0; gi < ngrp; gi++) {
        const Grp& g = pl.grps[gi];
        for (uint32_t r = g.start; r < g.start + g.count; r++) {
            const Rec5& Rr = pl.recs[r];
            IT* p = &R[(size_t)r * 4];
            if (g.kind == KD_MIX) {
                p[0] = enc(Rr.s0); p[1] = enc(Rr.s1); p[2] = enc(Rr.d); p[3] = (IT)Rr.cb;
            } else if (isMuxKind(g.kind)) {
                p[0] = enc(Rr.s0); p[1] = enc(Rr.s1); p[2] = enc(Rr.s2); p[3] = enc(Rr.d);
            } else {
                p[0] = enc(Rr.s0); p[1] = enc(Rr.s1); p[2] = enc(Rr.d); p[3] = 0;
            }
        }
    }
    runs.clear();
    for (int gi = 0; gi < ngrp; gi++) {
        const Grp& g = pl.grps[gi];
        if (g.kind == KD_MIX && !runs.empty() && runs.back().kind == KD_MIX &&
            runs.back().start + runs.back().count == g.start) {
            runs.back().count += g.count;
        } else {
            runs.push_back(Run{g.kind, g.start, g.count});
        }
    }
}

template <typename IT, bool BYTE>
static std::vector<uint64_t> runSim(const Circuit& c, int base, const std::vector<IT>& R, const std::vector<Run>& runs,
                                    int numSlots, const std::vector<int>& outSlot, const std::vector<uint8_t>& outPol,
                                    const std::vector<int>& dSlot, const std::vector<uint8_t>& dPol,
                                    const std::vector<uint64_t>& K) {
    const int I = c.I, F = c.F, O = c.O, M = c.M, T = c.T;
    std::vector<uint64_t> res((size_t)M, 0);
    const int NB = (M + 64 * VW - 1) / (64 * VW);
    const vecT ones = vbcast(~0ULL);
    vecT MT[16][4];
    for (int cb = 0; cb < 16; cb++)
        for (int k = 0; k < 4; k++) {
            uint64_t b = ((cb >> k) & 1) ? ~0ULL : 0ULL;
            MT[cb][k] = vbcast(b);
        }
    const int ffBase = I + 2;
    std::vector<int> fixedFF;  // flip-flops whose data source is a fixed slot (PI / FF / constant)
    for (int f = 0; f < F; f++) if (dSlot[f] < base) fixedFF.push_back(f);

#pragma omp parallel for schedule(dynamic, 1)
    for (int blk = 0; blk < NB; blk++) {
        const int g0 = blk * 64 * VW;
        uint64_t seedB[64 * VW];
        for (int g = 0; g < 64 * VW; g++) {
            int m = g0 + g;
            seedB[g] = m < M ? mix64(c.seed ^ (uint64_t)m) : 0;
        }
        std::vector<char> rawv(sizeof(vecT) * (size_t)numSlots + 64);
        vecT* val = reinterpret_cast<vecT*>((reinterpret_cast<uintptr_t>(rawv.data()) + 63) & ~(uintptr_t)63);
        char* vb = reinterpret_cast<char*>(val);
        // Record operand: byte offset (BYTE mode) or slot index.
        auto SL = [&](IT x) -> vecT& {
            if (BYTE) return *reinterpret_cast<vecT*>(vb + (size_t)x);
            else return val[(size_t)x];
        };
        for (int s = 0; s < numSlots; s++) val[s] = vbcast(0);
        val[1] = ones;
        std::vector<vecT> tmp((size_t)std::max(F, 1));
        vecT Hbit[64];
        for (int k = 0; k < 64; k++) Hbit[k] = vbcast(0);

        for (int t = 0; t < T; t++) {
            // Primary inputs: PI_i = bit i of r_{m,t}.
            for (int w = 0; w < VW; w++) {
                uint64_t rows[64];
                for (int bb = 0; bb < 64; bb++) {
                    int g = w * 64 + bb;
                    rows[bb] = fin(seedB[g] + (uint64_t)(t + 1) * GAMMA);
                    if (g0 + g >= M) rows[bb] = 0;
                }
                transpose64(rows);
                for (int i = 0; i < I; i++) val[2 + i][w] = rows[i];
            }
            // Gates.
            for (const Run& run : runs) {
                const IT* p = R.data() + (size_t)run.start * 4;
                const uint32_t n = run.count;
                switch (run.kind) {
                    case KD_AND:
                        for (uint32_t k = 0; k < n; k++, p += 4) SL(p[2]) = SL(p[0]) & SL(p[1]);
                        break;
                    case KD_ANDNL:
                        for (uint32_t k = 0; k < n; k++, p += 4) SL(p[2]) = ~SL(p[0]) & SL(p[1]);
                        break;
                    case KD_ANDNR:
                        for (uint32_t k = 0; k < n; k++, p += 4) SL(p[2]) = SL(p[0]) & ~SL(p[1]);
                        break;
                    case KD_OR:
                        for (uint32_t k = 0; k < n; k++, p += 4) SL(p[2]) = SL(p[0]) | SL(p[1]);
                        break;
                    case KD_XOR:
                        for (uint32_t k = 0; k < n; k++, p += 4) SL(p[2]) = SL(p[0]) ^ SL(p[1]);
                        break;
                    case KD_MAND:
                        for (uint32_t k = 0; k < n; k++, p += 4) {
                            vecT A = SL(p[1]), B = SL(p[2]);
                            vecT tt = A ^ B;
                            SL(p[3]) = A ^ (SL(p[0]) & tt);
                        }
                        break;
                    case KD_MANDNL:
                        for (uint32_t k = 0; k < n; k++, p += 4) {
                            vecT A = SL(p[1]), B = SL(p[2]);
                            vecT tt = A ^ B;
                            SL(p[3]) = A ^ (~SL(p[0]) & tt);
                        }
                        break;
                    case KD_MANDNR:
                        for (uint32_t k = 0; k < n; k++, p += 4) {
                            vecT A = SL(p[1]), B = SL(p[2]);
                            vecT tt = A ^ B;
                            SL(p[3]) = A ^ (SL(p[0]) & ~tt);
                        }
                        break;
                    case KD_MOR:
                        for (uint32_t k = 0; k < n; k++, p += 4) {
                            vecT A = SL(p[1]), B = SL(p[2]);
                            vecT tt = A ^ B;
                            SL(p[3]) = A ^ (SL(p[0]) | tt);
                        }
                        break;
                    default:  // KD_MIX: generic flat stream
                        for (uint32_t k = 0; k < n; k++, p += 4) {
                            vecT x = SL(p[0]), y = SL(p[1]);
                            const vecT* m = MT[(int)p[3]];
                            SL(p[2]) = (x & (m[1] ^ (y & m[3]))) ^ (y & m[2]);  // c0 is 0 for all kinds
                        }
                        break;
                }
            }
            // Digest of outputs (values are stored with polarity; flip where needed).
            for (int j = 0; j < O; j++) {
                vecT x = val[outSlot[j]];
                if (outPol[j]) x ^= ones;
                uint64_t kv = K[(size_t)t * O + j];
                for (int k = 0; k < 64; k++) {
                    uint64_t bit = 0 - ((kv >> k) & 1);
                    vecT mk = vbcast(bit);
                    Hbit[k] ^= x & mk;
                }
            }
            // Flip-flop update (simultaneous). Sources that are fixed slots (PI/FF/const) may be
            // overwritten by earlier writes, so they are read first; computed sources are written directly.
            for (int k = 0; k < (int)fixedFF.size(); k++) {
                const int f = fixedFF[k];
                vecT x = val[dSlot[f]];
                if (dPol[f]) x ^= ones;
                tmp[k] = x;
            }
            for (int f = 0; f < F; f++) {
                if (dSlot[f] >= base) {
                    vecT x = val[dSlot[f]];
                    if (dPol[f]) x ^= ones;
                    val[ffBase + f] = x;
                }
            }
            for (int k = 0; k < (int)fixedFF.size(); k++) val[ffBase + fixedFF[k]] = tmp[k];
        }
        // Transpose bit-sliced digest into per-group values.
        for (int g = 0; g < 64 * VW && g0 + g < M; g++) {
            int w = g >> 6, b = g & 63;
            uint64_t h = 0;
            for (int k = 0; k < 64; k++) h |= ((Hbit[k][w] >> b) & 1ULL) << k;
            res[(size_t)(g0 + g)] = h;
        }
    }
    return res;
}

std::vector<uint64_t> simulate(const Circuit& c) {
    const int I = c.I, F = c.F, G = c.G, O = c.O, M = c.M, T = c.T;
    if (M <= 0) return std::vector<uint64_t>();

    const int base = I + F + 2;          // first gate signal
    const int S = base + G;              // number of signals
    auto arity = [&](int g) { return c.type[g] == 6 ? 1 : (c.type[g] == 7 ? 3 : 2); };
    auto input = [&](int g, int q) { return q == 0 ? c.in0[g] : (q == 1 ? c.in1[g] : c.in2[g]); };

    // ---- Reachable gates in topological order (iterative DFS from roots).
    std::vector<char> state(G, 0);
    std::vector<int> order;
    order.reserve(G);
    {
        std::vector<std::pair<int, int>> st;
        auto visit = [&](int sig) {
            if (sig < base) return;
            int g0 = sig - base;
            if (state[g0]) return;
            state[g0] = 1;
            st.push_back({g0, 0});
            while (!st.empty()) {
                int g = st.back().first;
                int q = st.back().second;
                if (q < arity(g)) {
                    st.back().second = q + 1;
                    int s = input(g, q);
                    if (s >= base && !state[s - base]) {
                        state[s - base] = 1;
                        st.push_back({s - base, 0});
                    }
                } else {
                    state[g] = 2;
                    order.push_back(g);
                    st.pop_back();
                }
            }
        };
        for (int j = 0; j < O; j++) visit(c.out[j]);
        for (int f = 0; f < F; f++) visit(c.d[f]);
    }

    // ---- Polarity-coded operand references for every signal.
    std::vector<int> sid(S, 0);      // >=0: op value id, <0: fixed slot -1-slot
    std::vector<uint8_t> spol(S, 0);
    for (int s = 0; s < base; s++) { sid[s] = -1 - s; spol[s] = 0; }
    Plan pl;
    pl.ops.reserve(order.size());
    for (int g : order) {
        int sg = base + g;
        int t = c.type[g];
        if (t == 6) {  // NOT: free polarity flip
            int s0 = c.in0[g];
            sid[sg] = sid[s0];
            spol[sg] = (uint8_t)(spol[s0] ^ 1);
            continue;
        }
        int id = (int)pl.ops.size();
        Op op;
        op.id = id;
        op.c = -1;
        if (t == 7) {  // MUX(s, a, b)
            int sS = c.in0[g], sA = c.in1[g], sB = c.in2[g];
            int ua = spol[sS], ub = spol[sA] ^ spol[sB];
            op.kind = (ua == 0 && ub == 0) ? KD_MAND : (ua == 1 && ub == 0) ? KD_MANDNL
                    : (ua == 0 && ub == 1) ? KD_MANDNR : KD_MOR;
            op.outPol = (uint8_t)(spol[sA] ^ (ua & ub));
            op.a = sid[sS]; op.b = sid[sA]; op.c = sid[sB];
        } else if (t == 2 || t == 5) {  // XOR / XNOR
            int a = c.in0[g], b = c.in1[g];
            op.kind = KD_XOR;
            op.outPol = (uint8_t)((t == 5 ? 1 : 0) ^ spol[a] ^ spol[b]);
            op.a = sid[a]; op.b = sid[b];
        } else {  // AND / OR / NAND / NOR
            int ca, cb, co;
            switch (t) {
                case 0: ca = 0; cb = 0; co = 0; break;  // AND
                case 1: ca = 1; cb = 1; co = 1; break;  // OR
                case 3: ca = 0; cb = 0; co = 1; break;  // NAND
                default: ca = 1; cb = 1; co = 0; break; // NOR
            }
            int a = c.in0[g], b = c.in1[g];
            int ua = ca ^ spol[a], ub = cb ^ spol[b];
            op.kind = (ua == 0 && ub == 0) ? KD_AND : (ua == 1 && ub == 0) ? KD_ANDNL
                    : (ua == 0 && ub == 1) ? KD_ANDNR : KD_OR;
            op.outPol = (uint8_t)(co ^ (ua & ub));
            op.a = sid[a]; op.b = sid[b];
        }
        pl.ops.push_back(op);
        sid[sg] = id;
        spol[sg] = op.outPol;
    }

    std::vector<int> roots;
    std::vector<int> outRef(O), dRef(F);
    std::vector<uint8_t> outPol(O), dPol(F);
    for (int j = 0; j < O; j++) { outRef[j] = sid[c.out[j]]; outPol[j] = spol[c.out[j]]; roots.push_back(outRef[j]); }
    for (int f = 0; f < F; f++) { dRef[f] = sid[c.d[f]]; dPol[f] = spol[c.d[f]]; roots.push_back(dRef[f]); }

    std::vector<char> isRoot(pl.ops.size(), 0);
    for (int v : roots) if (v >= 0) isRoot[v] = 1;
    buildPlan(pl, isRoot, MINB, WINDOW);

    std::vector<int> slotOf;
    int numSlots = 0;
    allocSlots(pl, base, roots, slotOf, numSlots);
    auto encRef = [&](int v) { return v < 0 ? -1 - v : slotOf[v]; };
    std::vector<int> outSlot(O), dSlot(F);
    for (int j = 0; j < O; j++) outSlot[j] = encRef(outRef[j]);
    for (int f = 0; f < F; f++) dSlot[f] = encRef(dRef[f]);

    std::vector<uint64_t> K((size_t)T * O);
    for (size_t x = 0; x < K.size(); x++) K[x] = mix64((uint64_t)x);

    // 16-bit slot indices when every slot fits; otherwise 32-bit indices.
    std::vector<Run> runs;
    if (numSlots <= 65535 && !FORCE32) {
        std::vector<uint16_t> R16;
        packRecs<uint16_t>(pl, slotOf, (uint16_t)1, R16, runs);
        return runSim<uint16_t, false>(c, base, R16, runs, numSlots, outSlot, outPol, dSlot, dPol, K);
    }
    std::vector<uint32_t> R32;
    packRecs<uint32_t>(pl, slotOf, (uint32_t)1, R32, runs);
    return runSim<uint32_t, false>(c, base, R32, runs, numSlots, outSlot, outPol, dSlot, dPol, K);
}

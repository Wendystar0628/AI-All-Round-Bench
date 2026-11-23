#include <algorithm>
#include <bit>
#include <chrono>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <vector>
#include <immintrin.h>
#include <omp.h>

#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <malloc.h>

struct Circuit {
    int I, F, G, O, M, T;
    uint64_t seed;
    std::vector<int> d;
    std::vector<uint8_t> type;
    std::vector<int> in0, in1, in2;
    std::vector<int> out;
};

static uint64_t splitmix64_next(uint64_t* s) {
    uint64_t z = (*s += 0x9E3779B97F4A7C15ULL);
    z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9ULL;
    z = (z ^ (z >> 27)) * 0x94D049BB133111EBULL;
    return z ^ (z >> 31);
}

static uint64_t mix64(uint64_t x) { return splitmix64_next(&x); }

namespace {

constexpr int kR = 12;      // register window (ymm0..ymm11)
constexpr int kW = 512;     // L1 circular buffer, in gates
constexpr int kSimd = 256;  // bits packed in one __m256i

enum { B_RCX = 0, B_RDX = 1, B_R8 = 2 };

struct Asm {
    uint8_t* p;
    uint8_t* end;

    void byte(uint8_t b) { *p++ = b; }
    void bytes(std::initializer_list<uint8_t> bs) { for (uint8_t b : bs) *p++ = b; }

    void disp32(int32_t d) {
        uint32_t u = (uint32_t)d;
        *p++ = (uint8_t)u; *p++ = (uint8_t)(u >> 8);
        *p++ = (uint8_t)(u >> 16); *p++ = (uint8_t)(u >> 24);
    }

    // pp: 1 = 66 (integer AVX), 2 = F3 (movdqu)
    void vex(int r_ext, int b_ext, int vvvv_reg, int pp) {
        int vfield = (~vvvv_reg) & 15;
        if (b_ext == 0) {
            *p++ = 0xC5;
            *p++ = (uint8_t)(((1 - r_ext) << 7) | (vfield << 3) | (1 << 2) | (pp & 3));
        } else {
            *p++ = 0xC4;
            *p++ = (uint8_t)(((1 - r_ext) << 7) | (1 << 6) | ((1 - b_ext) << 5) | 0x01);
            *p++ = (uint8_t)((vfield << 3) | (1 << 2) | (pp & 3));
        }
    }

    void emit_rr(uint8_t opc, int pp, int dest, int src1, int src2) {
        vex((dest >> 3) & 1, (src2 >> 3) & 1, src1, pp);
        *p++ = opc;
        *p++ = (uint8_t)(0xC0 | ((dest & 7) << 3) | (src2 & 7));
    }

    // dest/src1 are ymm. base is a GPR number (1=rcx, 2=rdx, 8=r8). vvvv_reg=0 encodes unused.
    void emit_rm(uint8_t opc, int pp, int dest, int src1, int base, int32_t disp) {
        int rm = base & 7;
        int b_ext = (base >> 3) & 1;
        bool sib = (rm == 4);
        int mod;
        if (sib) {
            mod = (disp == 0) ? 0 : (disp >= -128 && disp <= 127 ? 1 : 2);
        } else if (disp == 0 && rm != 5) {
            mod = 0;
        } else if (disp >= -128 && disp <= 127) {
            mod = 1;
        } else {
            mod = 2;
        }
        vex((dest >> 3) & 1, b_ext, src1, pp);
        *p++ = opc;
        *p++ = (uint8_t)((mod << 6) | ((dest & 7) << 3) | rm);
        if (sib) *p++ = 0x24;
        if (mod == 1) *p++ = (uint8_t)(int8_t)disp;
        else if (mod == 2) disp32(disp);
    }

    void vpxor_rr(int d, int a, int b) { emit_rr(0xEF, 1, d, a, b); }
    void vpand_rr(int d, int a, int b) { emit_rr(0xDB, 1, d, a, b); }
    void vpor_rr(int d, int a, int b) { emit_rr(0xEB, 1, d, a, b); }
    void vpandn_rr(int d, int a, int b) { emit_rr(0xDF, 1, d, a, b); }

    void vpxor_rm(int d, int a, int base, int32_t disp) { emit_rm(0xEF, 1, d, a, base, disp); }
    void vpand_rm(int d, int a, int base, int32_t disp) { emit_rm(0xDB, 1, d, a, base, disp); }
    void vpor_rm(int d, int a, int base, int32_t disp) { emit_rm(0xEB, 1, d, a, base, disp); }
    void vpandn_rm(int d, int a, int base, int32_t disp) { emit_rm(0xDF, 1, d, a, base, disp); }

    void vmovdqa_load(int d, int base, int32_t disp) { emit_rm(0x6F, 1, d, 0, base, disp); }
    void vmovdqa_store(int s, int base, int32_t disp) { emit_rm(0x7F, 1, s, 0, base, disp); }
    void vmovdqu_store(int s, int base, int32_t disp) { emit_rm(0x7F, 2, s, 0, base, disp); }
    void vmovdqu_load(int d, int base, int32_t disp) { emit_rm(0x6F, 2, d, 0, base, disp); }
    void vmovdqa_rr(int d, int s) { if (d != s) emit_rr(0x6F, 1, d, 0, s); }

    void allones(int d) { emit_rr(0x76, 1, d, d, d); } // vpcmpeqd
    void zero(int d) { vpxor_rr(d, d, d); }
    void ret() { bytes({0xC5, 0xF8, 0x77, 0xC3}); } // vzeroupper; ret
};

enum Opk { OP_REG, OP_MEM, OP_ONE, OP_ZERO };

struct Opnd {
    Opk k;
    int reg;
    int base; // GPR
    int32_t disp;
};

struct Plan {
    void* code = nullptr;
    size_t code_bytes = 0;
    using Fn = void (*)(void* mem, void* ff, void* ffbuf);
    Fn fn = nullptr;
    std::vector<Fn> fns;

    int I = 0, F = 0, O = 0, T = 0, M = 0;
    uint64_t seed = 0;
    int off_pi = 0, off_circ = 0, off_out = 0, off_window = 0, off_callee = 0;
    int mem_bytes = 0;
    int n_sched = 0;

    std::vector<int> out_sig;     // original signal of each PO
    std::vector<int> ff_ng_idx;   // FF indices whose d is not a gate
    std::vector<int> ff_ng_sig;
    std::vector<uint64_t> mix;    // T*O
};

int gpr_of(int base_tag) {
    if (base_tag == B_RDX) return 2;
    if (base_tag == B_R8) return 8;
    return 1; // rcx
}

Plan compile_plan(const Circuit& c) {
    Plan plan;
    plan.I = c.I; plan.F = c.F; plan.O = c.O; plan.T = c.T; plan.M = c.M; plan.seed = c.seed;
    auto tc0 = std::chrono::steady_clock::now();
    const int I = c.I, F = c.F, G = c.G, O = c.O;
    const int FF0 = 2 + I, G0 = 2 + I + F;
    const int R = kR, W = kW;

    std::vector<int> live_list;
    std::vector<int> pos(G, -1);
    if (G > 0) {
        std::vector<int> pred_count(G, 0);
        auto isg = [&](int s) { return s >= G0; };
        for (int k = 0; k < G; k++) {
            auto add = [&](int s) { if (isg(s)) pred_count[k]++; };
            add(c.in0[k]);
            if (c.type[k] != 6) add(c.in1[k]);
            if (c.type[k] == 7) add(c.in2[k]);
        }
        std::vector<int> poff(G + 1, 0);
        for (int k = 0; k < G; k++) poff[k + 1] = poff[k] + pred_count[k];
        std::vector<int> pred(poff[G]);
        {
            std::vector<int> cur = poff;
            for (int k = 0; k < G; k++) {
                auto add = [&](int s) { if (isg(s)) pred[cur[k]++] = s - G0; };
                add(c.in0[k]);
                if (c.type[k] != 6) add(c.in1[k]);
                if (c.type[k] == 7) add(c.in2[k]);
            }
        }
        // successor counts
        std::vector<int> scount(G, 0);
        for (int k = 0; k < G; k++)
            for (int e = poff[k]; e < poff[k + 1]; e++) scount[pred[e]]++;
        std::vector<int> soff(G + 1, 0);
        for (int k = 0; k < G; k++) soff[k + 1] = soff[k] + scount[k];
        std::vector<int> succ(soff[G]);
        {
            std::vector<int> cur = soff;
            for (int k = 0; k < G; k++)
                for (int e = poff[k]; e < poff[k + 1]; e++) succ[cur[pred[e]]++] = k;
        }

        std::vector<char> live(G, 0);
        std::vector<int> stack;
        stack.reserve(G / 8 + 8);
        auto mark = [&](int s) {
            if (s >= G0) {
                int g = s - G0;
                if (!live[g]) { live[g] = 1; stack.push_back(g); }
            }
        };
        for (int s : c.out) mark(s);
        for (int s : c.d) mark(s);
        while (!stack.empty()) {
            int u = stack.back(); stack.pop_back();
            for (int e = poff[u]; e < poff[u + 1]; e++) {
                int src = pred[e];
                if (!live[src]) { live[src] = 1; stack.push_back(src); }
            }
        }
        int nlive = 0;
        for (char x : live) nlive += x;

        std::vector<int> indeg(G, 0);
        for (int k = 0; k < G; k++) if (live[k]) {
            for (int e = poff[k]; e < poff[k + 1]; e++)
                if (live[pred[e]]) indeg[k]++;
        }
        std::vector<int> q;
        q.reserve(nlive);
        for (int k = 0; k < G; k++) if (live[k] && indeg[k] == 0) q.push_back(k);
        live_list.reserve(nlive);
        for (size_t qi = 0; qi < q.size(); qi++) {
            int u = q[qi];
            pos[u] = (int)live_list.size();
            live_list.push_back(u);
            for (int e = soff[u]; e < soff[u + 1]; e++) {
                int v = succ[e];
                if (live[v] && --indeg[v] == 0) q.push_back(v);
            }
        }
    }
    const int n = (int)live_list.size();
    plan.n_sched = n;
    auto tc1 = std::chrono::steady_clock::now();

    // consumer distance flags and far ids, indexed by schedule position
    std::vector<uint8_t> need_circ(n, 0), need_far(n, 0);
    std::vector<int> far_id(n, -1);
    int nfar = 0;
    for (int i = 0; i < n; i++) {
        int g = live_list[i];
        auto touch = [&](int s) {
            if (s < G0) return;
            int j = pos[s - G0];
            if (j < 0) return;
            int d = i - j;
            if (d >= W) need_far[j] = 1;
            else if (d >= R) need_circ[j] = 1;
        };
        touch(c.in0[g]);
        if (c.type[g] != 6) touch(c.in1[g]);
        if (c.type[g] == 7) touch(c.in2[g]);
    }
    for (int i = 0; i < n; i++) if (need_far[i]) far_id[i] = nfar++;

    // ff / out stores
    std::vector<int> ff_count(n, 0), out_count(n, 0);
    for (int f = 0; f < F; f++) {
        int s = c.d[f];
        if (s >= G0) {
            int j = pos[s - G0];
            if (j >= 0) ff_count[j]++;
            else {
                plan.ff_ng_idx.push_back(f);
                plan.ff_ng_sig.push_back(s);
            }
        } else {
            plan.ff_ng_idx.push_back(f);
            plan.ff_ng_sig.push_back(s);
        }
    }
    plan.out_sig.assign(c.out.begin(), c.out.end());
    for (int j = 0; j < O; j++) {
        int s = c.out[j];
        if (s >= G0) {
            int jpos = pos[s - G0];
            if (jpos >= 0) out_count[jpos]++;
        }
    }
    std::vector<int> ff_off(n + 1, 0), out_off(n + 1, 0);
    for (int i = 0; i < n; i++) {
        ff_off[i + 1] = ff_off[i] + ff_count[i];
        out_off[i + 1] = out_off[i] + out_count[i];
    }
    std::vector<int> ff_ids(ff_off[n]), out_ids(out_off[n]);
    {
        std::vector<int> cf = ff_off, co = out_off;
        for (int f = 0; f < F; f++) {
            int s = c.d[f];
            if (s >= G0) {
                int j = pos[s - G0];
                if (j >= 0) ff_ids[cf[j]++] = f;
            }
        }
        for (int j = 0; j < O; j++) {
            int s = c.out[j];
            if (s >= G0) {
                int jp = pos[s - G0];
                if (jp >= 0) out_ids[co[jp]++] = j;
            }
        }
    }

    // memory layout of the per-batch Mem block
    auto align32 = [](int x) { return (x + 31) & ~31; };
    int off = 0;
    // c0 at 0
    off = 32;
    plan.off_pi = off;
    off = align32(off + std::max(I, 1) * 32);
    plan.off_circ = off;
    off = align32(off + W * 32);
    int off_far = off;
    off = align32(off + std::max(nfar, 1) * 32);
    plan.off_out = off;
    off = align32(off + std::max(O, 1) * 32);
    plan.off_window = off;             // ymm0..ymm11 carried across blocks
    off = align32(off + 12 * 32);
    plan.off_callee = off;             // saved ymm6..ymm15
    off = align32(off + 10 * 32);
    plan.mem_bytes = off;

    // emit
    auto tc_em0 = std::chrono::steady_clock::now();
    size_t cap = (size_t)n * 80 + (size_t)F * 16 + (size_t)O * 16 + 65536;
    void* code = VirtualAlloc(nullptr, cap, MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE);
    if (!code) return plan;
    Asm as;
    as.p = (uint8_t*)code;
    as.end = as.p + cap;

    constexpr int kBlockBytes = 1 << 30; // one block; splits were slower
    uint8_t* block_start = as.p;
    auto open_block = [&]() {
        while (((uintptr_t)as.p & 15) != 0) *as.p++ = 0x90;
        block_start = as.p;
        for (int r = 6; r <= 15; r++)
            as.vmovdqu_store(r, 1, plan.off_callee + (r - 6) * 32);
        for (int r = 0; r < 12; r++)
            as.vmovdqu_load(r, 1, plan.off_window + r * 32);
        as.allones(15);
    };
    auto close_block = [&]() {
        for (int r = 0; r < 12; r++)
            as.vmovdqu_store(r, 1, plan.off_window + r * 32);
        for (int r = 6; r <= 15; r++)
            as.vmovdqu_load(r, 1, plan.off_callee + (r - 6) * 32);
        as.ret();
        plan.fns.push_back((Plan::Fn)block_start);
    };
    if (n > 0) open_block();

    auto resolve = [&](int sig, int i) -> Opnd {
        if (sig <= 0) return {OP_ZERO, 0, 0, 0};
        if (sig == 1) return {OP_ONE, 15, 0, 0};
        if (sig < FF0) return {OP_MEM, 0, B_RCX, plan.off_pi + (sig - 2) * 32};
        if (sig < G0) return {OP_MEM, 0, B_RDX, (sig - FF0) * 32};
        int j = pos[sig - G0];
        int d = i - j;
        if (d < R) return {OP_REG, j % R, 0, 0};
        if (d < W) return {OP_MEM, 0, B_RCX, plan.off_circ + (j % W) * 32};
        return {OP_MEM, 0, B_RCX, off_far + far_id[j] * 32};
    };

    auto load_to = [&](int dest, const Opnd& op) {
        if (op.k == OP_REG) as.vmovdqa_rr(dest, op.reg);
        else if (op.k == OP_ONE) as.vmovdqa_rr(dest, 15);
        else if (op.k == OP_ZERO) as.zero(dest);
        else as.vmovdqa_load(dest, gpr_of(op.base), op.disp);
    };

    // Commutative bitwise into dest, then optional invert.
    auto emit_bin = [&](int opc_rr_tag, const Opnd& A, const Opnd& B, int dest, bool invert) {
        // opc: 0 and, 1 or, 2 xor
        auto rr = [&](int d, int a, int b) {
            if (opc_rr_tag == 0) as.vpand_rr(d, a, b);
            else if (opc_rr_tag == 1) as.vpor_rr(d, a, b);
            else as.vpxor_rr(d, a, b);
        };
        auto rm = [&](int d, int a, int base, int32_t disp) {
            if (opc_rr_tag == 0) as.vpand_rm(d, a, base, disp);
            else if (opc_rr_tag == 1) as.vpor_rm(d, a, base, disp);
            else as.vpxor_rm(d, a, base, disp);
        };
        auto finish = [&]() { if (invert) as.vpxor_rr(dest, dest, 15); };

        // Fold constants.
        if (A.k == OP_ZERO || B.k == OP_ZERO || A.k == OP_ONE || B.k == OP_ONE) {
            const Opnd& z = (A.k == OP_ZERO || A.k == OP_ONE) ? A : B;
            const Opnd& o = (&z == &A) ? B : A;
            if (z.k == OP_ZERO) {
                if (opc_rr_tag == 0) { // and 0
                    as.zero(dest); if (invert) as.vmovdqa_rr(dest, 15); return;
                }
                if (opc_rr_tag == 1 || opc_rr_tag == 2) { // or/xor 0 = identity
                    load_to(dest, o); finish(); return;
                }
            } else { // ONE
                if (opc_rr_tag == 0) { load_to(dest, o); finish(); return; }          // and 1
                if (opc_rr_tag == 1) { as.vmovdqa_rr(dest, 15); if (invert) as.zero(dest); return; } // or 1
                if (opc_rr_tag == 2) { // xor 1 = not
                    if (o.k == OP_REG) as.vpxor_rr(dest, o.reg, 15);
                    else if (o.k == OP_MEM) as.vpxor_rm(dest, 15, gpr_of(o.base), o.disp);
                    else if (o.k == OP_ZERO) as.vmovdqa_rr(dest, 15);
                    else as.zero(dest);
                    if (invert) as.vpxor_rr(dest, dest, 15);
                    return;
                }
            }
        }

        if (A.k == OP_REG && B.k == OP_REG) {
            rr(dest, A.reg, B.reg); finish(); return;
        }
        if (A.k == OP_REG && B.k == OP_MEM) {
            rm(dest, A.reg, gpr_of(B.base), B.disp); finish(); return;
        }
        if (B.k == OP_REG && A.k == OP_MEM) {
            rm(dest, B.reg, gpr_of(A.base), A.disp); finish(); return;
        }
        // both mem (or anything else): load A into ymm12
        load_to(12, A);
        if (B.k == OP_MEM) rm(dest, 12, gpr_of(B.base), B.disp);
        else if (B.k == OP_REG) rr(dest, 12, B.reg);
        else if (B.k == OP_ONE) rr(dest, 12, 15);
        else { as.zero(13); rr(dest, 12, 13); }
        finish();
    };

    auto emit_not = [&](const Opnd& A, int dest) {
        if (A.k == OP_REG) as.vpxor_rr(dest, A.reg, 15);
        else if (A.k == OP_MEM) as.vpxor_rm(dest, 15, gpr_of(A.base), A.disp);
        else if (A.k == OP_ONE) as.zero(dest);
        else as.vmovdqa_rr(dest, 15);
    };

    auto emit_mux = [&](const Opnd& S, const Opnd& A, const Opnd& B, int dest) {
        if (S.k == OP_ZERO) { load_to(dest, A); return; }
        if (S.k == OP_ONE) { load_to(dest, B); return; }
        int sreg;
        if (S.k == OP_REG) sreg = S.reg;
        else { load_to(12, S); sreg = 12; }
        // (~s & a) -> ymm13
        if (A.k == OP_ZERO) as.zero(13);
        else if (A.k == OP_ONE) as.vpandn_rr(13, sreg, 15);
        else if (A.k == OP_REG) as.vpandn_rr(13, sreg, A.reg);
        else as.vpandn_rm(13, sreg, gpr_of(A.base), A.disp);
        // (s & b) -> ymm14
        if (B.k == OP_ZERO) as.zero(14);
        else if (B.k == OP_ONE) as.vpand_rr(14, sreg, 15);
        else if (B.k == OP_REG) as.vpand_rr(14, sreg, B.reg);
        else as.vpand_rm(14, sreg, gpr_of(B.base), B.disp);
        as.vpor_rr(dest, 13, 14);
    };

    for (int i = 0; i < n; i++) {
        int g = live_list[i];
        int t = c.type[g];
        int dest = i % R;
        Opnd a = resolve(c.in0[g], i);
        Opnd b = (t == 6) ? Opnd{OP_ZERO, 0, 0, 0} : resolve(c.in1[g], i);
        Opnd d3 = (t == 7) ? resolve(c.in2[g], i) : Opnd{OP_ZERO, 0, 0, 0};
        if (t == 6) emit_not(a, dest);
        else if (t == 7) emit_mux(a, b, d3, dest);
        else if (t == 0) emit_bin(0, a, b, dest, false);
        else if (t == 1) emit_bin(1, a, b, dest, false);
        else if (t == 2) emit_bin(2, a, b, dest, false);
        else if (t == 3) emit_bin(0, a, b, dest, true);
        else if (t == 4) emit_bin(1, a, b, dest, true);
        else if (t == 5) emit_bin(2, a, b, dest, true);
        else emit_bin(0, a, b, dest, false);

        if (need_circ[i]) as.vmovdqa_store(dest, 1, plan.off_circ + (i % W) * 32);
        if (need_far[i]) as.vmovdqa_store(dest, 1, off_far + far_id[i] * 32);
        for (int e = ff_off[i]; e < ff_off[i + 1]; e++)
            as.vmovdqa_store(dest, 8, ff_ids[e] * 32); // r8 = ffbuf
        for (int e = out_off[i]; e < out_off[i + 1]; e++)
            as.vmovdqa_store(dest, 1, plan.off_out + out_ids[e] * 32);
        if (i + 1 < n && (as.p - block_start) > kBlockBytes) {
            close_block();
            open_block();
        }
    }
    if (n > 0) close_block();
    size_t nbytes = (size_t)(as.p - (uint8_t*)code);
    DWORD old = 0;
    VirtualProtect(code, cap, PAGE_EXECUTE_READ, &old);
    FlushInstructionCache(GetCurrentProcess(), code, nbytes);
    plan.code = code;
    plan.code_bytes = nbytes;
    plan.fn = plan.fns.empty() ? nullptr : plan.fns[0];
    auto tc2 = std::chrono::steady_clock::now();
    std::fprintf(stderr, "graph_ms=%.2f prep_ms=%.2f emit_ms=%.2f\n",
                 std::chrono::duration<double, std::milli>(tc1 - tc0).count(),
                 std::chrono::duration<double, std::milli>(tc_em0 - tc1).count(),
                 std::chrono::duration<double, std::milli>(tc2 - tc_em0).count());

    plan.mix.resize((size_t)c.T * (size_t)c.O);
    for (int t = 0; t < c.T; t++)
        for (int j = 0; j < c.O; j++)
            plan.mix[(size_t)t * c.O + j] = mix64((uint64_t)t * (uint64_t)c.O + (uint64_t)j);
    return plan;
}

void destroy_plan(Plan& p) {
    if (p.code) {
        VirtualFree(p.code, 0, MEM_RELEASE);
        p.code = nullptr;
        p.fn = nullptr;
    }
}

void* amalloc(size_t n) {
    void* p = _aligned_malloc(n ? n : 32, 32);
    return p;
}
void afree(void* p) { if (p) _aligned_free(p); }

void fill_pi(uint8_t* mem, int off, int I, const uint64_t* rs, int nsim) {
    std::memset(mem + off, 0, (size_t)I * 32);
    uint64_t* lanes = (uint64_t*)(mem + off);
    for (int s = 0; s < nsim; s++) {
        uint64_t r = rs[s];
        int lane = s >> 6;
        int bit = s & 63;
        uint64_t m = 1ULL << bit;
        int i = 0;
        for (; i + 3 < I; i += 4) {
            lanes[(i + 0) * 4 + lane] |= ((r >> 0) & 1ULL) << bit;
            lanes[(i + 1) * 4 + lane] |= ((r >> 1) & 1ULL) << bit;
            lanes[(i + 2) * 4 + lane] |= ((r >> 2) & 1ULL) << bit;
            lanes[(i + 3) * 4 + lane] |= ((r >> 3) & 1ULL) << bit;
            r >>= 4;
        }
        for (; i < I; i++) {
            lanes[i * 4 + lane] |= (r & 1ULL) << bit;
            r >>= 1;
        }
        (void)m;
    }
}

__m256i load_signal_scalarish(const Plan& plan, uint8_t* mem, uint8_t* ff, int sig) {
    const int FF0 = 2 + plan.I, G0 = FF0 + plan.F;
    if (sig <= 0) return _mm256_setzero_si256();
    if (sig == 1) return _mm256_cmpeq_epi32(_mm256_setzero_si256(), _mm256_setzero_si256()); // unused path; caller handles
    if (sig < FF0) return *(__m256i*)(mem + plan.off_pi + (sig - 2) * 32);
    if (sig < G0) return *(__m256i*)(ff + (sig - FF0) * 32);
    return _mm256_setzero_si256();
}

void accum_bits(const __m256i& v, uint64_t h, uint64_t* hash, int nvalid) {
    alignas(32) uint64_t w[4];
    _mm256_store_si256((__m256i*)w, v);
    int ns = nvalid;
    for (int lane = 0; lane < 4 && ns > 0; lane++) {
        int take = ns > 64 ? 64 : ns;
        uint64_t x = w[lane];
        if (take < 64) x &= (take == 0) ? 0ULL : ((1ULL << take) - 1);
        while (x) {
            int b = std::countr_zero(x);
            hash[lane * 64 + b] ^= h;
            x &= x - 1;
        }
        ns -= take;
    }
}

static double g_pi_ms = 0, g_jit_ms = 0, g_hash_ms = 0;
static int g_batches = 0;

struct BatchBuf {
    uint8_t* mem = nullptr;
    uint8_t* ff = nullptr;
    uint8_t* fb = nullptr;
    int base_m = 0;
    int nvalid = 0;
    uint64_t state[kSimd];
    uint64_t rs[kSimd];
    uint64_t hash[kSimd];
};

void run_range(const Plan& plan, int b0, int b1, uint64_t* out_hash) {
    const int nb = b1 - b0;
    if (nb <= 0) return;
    std::vector<BatchBuf> B(nb);
    const int FF0 = 2 + plan.I;
    const int G0 = FF0 + plan.F;
    __m256i ones = _mm256_cmpeq_epi8(_mm256_setzero_si256(), _mm256_setzero_si256());
    __m256i zero = _mm256_setzero_si256();
    for (int i = 0; i < nb; i++) {
        int batch = b0 + i;
        B[i].base_m = batch * kSimd;
        int nvalid = plan.M - B[i].base_m;
        if (nvalid > kSimd) nvalid = kSimd;
        B[i].nvalid = nvalid;
        B[i].mem = (uint8_t*)amalloc(plan.mem_bytes);
        B[i].ff = (uint8_t*)amalloc((size_t)plan.F * 32 + 32);
        B[i].fb = (uint8_t*)amalloc((size_t)plan.F * 32 + 32);
        std::memset(B[i].mem, 0, plan.mem_bytes);
        std::memset(B[i].ff, 0, (size_t)plan.F * 32);
        std::memset(B[i].fb, 0, (size_t)plan.F * 32);
        std::memset(B[i].hash, 0, sizeof B[i].hash);
        for (int s = 0; s < nvalid; s++)
            B[i].state[s] = mix64(plan.seed ^ (uint64_t)(B[i].base_m + s));
    }

    double pi_ms = 0, jit_ms = 0, hash_ms = 0;
    for (int t = 0; t < plan.T; t++) {
        auto tp0 = std::chrono::steady_clock::now();
        for (int i = 0; i < nb; i++) {
            int nvalid = B[i].nvalid;
            for (int s = 0; s < nvalid; s++) B[i].rs[s] = splitmix64_next(&B[i].state[s]);
            fill_pi(B[i].mem, plan.off_pi, plan.I, B[i].rs, nvalid);
        }
        auto tp1 = std::chrono::steady_clock::now();
        for (Plan::Fn fn : plan.fns) {
            for (int i = 0; i < nb; i++) fn(B[i].mem, B[i].ff, B[i].fb);
        }
        auto tp2 = std::chrono::steady_clock::now();
        const uint64_t* mix = plan.mix.data() + (size_t)t * plan.O;
        for (int i = 0; i < nb; i++) {
            uint8_t* mem = B[i].mem;
            uint8_t* ff = B[i].ff;
            uint8_t* fb = B[i].fb;
            int nvalid = B[i].nvalid;
            for (size_t u = 0; u < plan.ff_ng_idx.size(); u++) {
                int f = plan.ff_ng_idx[u];
                int sig = plan.ff_ng_sig[u];
                __m256i v = zero;
                if (sig == 1) v = ones;
                else if (sig >= 2 && sig < FF0) v = *(__m256i*)(mem + plan.off_pi + (sig - 2) * 32);
                else if (sig >= FF0 && sig < G0) v = *(__m256i*)(ff + (sig - FF0) * 32);
                *(__m256i*)(fb + f * 32) = v;
            }
            for (int j = 0; j < plan.O; j++) {
                int sig = plan.out_sig[j];
                __m256i v = zero;
                if (sig == 1) v = ones;
                else if (sig >= G0) v = *(__m256i*)(mem + plan.off_out + j * 32);
                else if (sig >= FF0) v = *(__m256i*)(ff + (sig - FF0) * 32);
                else if (sig >= 2) v = *(__m256i*)(mem + plan.off_pi + (sig - 2) * 32);
                if (sig != 0) accum_bits(v, mix[j], B[i].hash, nvalid);
            }
            std::swap(B[i].ff, B[i].fb);
        }
        auto tp3 = std::chrono::steady_clock::now();
        pi_ms += std::chrono::duration<double, std::milli>(tp1 - tp0).count();
        jit_ms += std::chrono::duration<double, std::milli>(tp2 - tp1).count();
        hash_ms += std::chrono::duration<double, std::milli>(tp3 - tp2).count();
    }
    #pragma omp critical
    {
        g_pi_ms += pi_ms; g_jit_ms += jit_ms; g_hash_ms += hash_ms; g_batches += nb;
    }
    for (int i = 0; i < nb; i++) {
        for (int s = 0; s < B[i].nvalid; s++) out_hash[B[i].base_m + s] = B[i].hash[s];
        afree(B[i].mem); afree(B[i].ff); afree(B[i].fb);
    }
}

} // namespace

std::vector<uint64_t> simulate(const Circuit& c) {
    std::vector<uint64_t> result(c.M, 0);
    if (c.M <= 0) return result;
    auto tA = std::chrono::steady_clock::now();
    Plan plan = compile_plan(c);
    auto tB = std::chrono::steady_clock::now();
    if (plan.n_sched > 0 && plan.fns.empty()) return result;
    double ms = std::chrono::duration<double, std::milli>(tB - tA).count();
    std::fprintf(stderr, "compile_ms=%.3f code_bytes=%zu sched=%d blocks=%zu mem=%d\n",
                 ms, plan.code_bytes, plan.n_sched, plan.fns.size(), plan.mem_bytes);

    int nbatch = (c.M + kSimd - 1) / kSimd;
    int nthreads = nbatch < 16 ? nbatch : 16;
    if (nthreads < 1) nthreads = 1;
    omp_set_dynamic(0);

    #pragma omp parallel num_threads(nthreads)
    {
        int tid = omp_get_thread_num();
        int nt = omp_get_num_threads();
        int b0 = (int)((long long)tid * nbatch / nt);
        int b1 = (int)((long long)(tid + 1) * nbatch / nt);
        run_range(plan, b0, b1, result.data());
    }
    destroy_plan(plan);
    std::fprintf(stderr, "sum_pi=%.1f sum_jit=%.1f sum_hash=%.1f batches=%d\n", g_pi_ms, g_jit_ms, g_hash_ms, g_batches);
    g_pi_ms = g_jit_ms = g_hash_ms = 0; g_batches = 0;
    return result;
}

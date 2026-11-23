#include <cstdint>
#include <vector>
#include <array>
#include <algorithm>
#include <queue>
#include <cstring>
#include <immintrin.h>
#include <mm_malloc.h>
#include <omp.h>
#ifndef THREADS
#define THREADS 16
#endif
#ifndef DUAL
#define DUAL 0
#endif
#ifdef _WIN32
#include <windows.h>
#endif
#ifdef DEBUG_STATS
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

static inline uint64_t sm64(uint64_t& s) {
    uint64_t z = (s += 0x9E3779B97F4A7C15ULL);
    z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9ULL;
    z = (z ^ (z >> 27)) * 0x94D049BB133111EBULL;
    return z ^ (z >> 31);
}

static inline uint64_t mix64(uint64_t x) {
    return sm64(x);
}

static void transpose64(uint64_t* a) {
    uint64_t m = 0x00000000FFFFFFFFULL;
    for (int j = 32; j; j >>= 1, m ^= m << j) {
        for (int k = 0; k < 64; k = (k + j + 1) & ~j) {
            uint64_t t = (a[k] ^ (a[k + j] >> j)) & m;
            a[k] ^= t;
            a[k + j] ^= t << j;
        }
    }
}

static std::vector<int> topo_order(const Circuit& c) {
    int G = c.G, base = c.I + c.F + 2;
    std::vector<int> indeg(G, 0), off(G + 1, 0);
    auto arity = [&](int k) { return c.type[k] == 6 ? 1 : (c.type[k] == 7 ? 3 : 2); };
    auto input = [&](int k, int j) { return j == 0 ? c.in0[k] : (j == 1 ? c.in1[k] : c.in2[k]); };
    for (int k = 0; k < G; ++k) {
        for (int j = 0; j < arity(k); ++j) {
            int x = input(k, j);
            if (x >= base) {
                ++indeg[k];
                ++off[x - base + 1];
            }
        }
    }
    for (int k = 0; k < G; ++k) off[k + 1] += off[k];
    std::vector<int> edge(off[G]), cur = off;
    for (int k = 0; k < G; ++k) {
        for (int j = 0; j < arity(k); ++j) {
            int x = input(k, j);
            if (x >= base) edge[cur[x - base]++] = k;
        }
    }
    std::vector<int> ready, order;
    ready.reserve(G);
    order.reserve(G);
    for (int k = 0; k < G; ++k) if (!indeg[k]) ready.push_back(k);
    while (!ready.empty()) {
        int k = ready.back();
        ready.pop_back();
        order.push_back(k);
        for (int p = off[k]; p < off[k + 1]; ++p) {
            int z = edge[p];
            if (--indeg[z] == 0) ready.push_back(z);
        }
    }
    return order;
}

static std::vector<uint64_t> simulate_small(const Circuit& c, const std::vector<int>& order) {
    int base = c.I + c.F + 2, N = base + c.G;
    std::vector<uint64_t> ans(c.M, 0);
    std::vector<uint8_t> v(N), next(c.F);
    for (int m = 0; m < c.M; ++m) {
        std::fill(v.begin(), v.end(), 0);
        v[1] = 1;
        uint64_t rng = mix64(c.seed ^ (uint64_t)m), h = 0;
        for (int t = 0; t < c.T; ++t) {
            uint64_t r = sm64(rng);
            for (int i = 0; i < c.I; ++i) v[2 + i] = (r >> i) & 1;
            for (int oi : order) {
                uint8_t ty = c.type[oi];
                int a = v[c.in0[oi]], b = ty == 6 ? 0 : v[c.in1[oi]];
                int z;
                switch (ty) {
                    case 0: z = a & b; break;
                    case 1: z = a | b; break;
                    case 2: z = a ^ b; break;
                    case 3: z = !(a & b); break;
                    case 4: z = !(a | b); break;
                    case 5: z = !(a ^ b); break;
                    case 6: z = !a; break;
                    default: z = a ? v[c.in2[oi]] : b; break;
                }
                v[base + oi] = (uint8_t)z;
            }
            for (int j = 0; j < c.O; ++j) if (v[c.out[j]]) h ^= mix64((uint64_t)t * c.O + j);
            for (int f = 0; f < c.F; ++f) next[f] = v[c.d[f]];
            for (int f = 0; f < c.F; ++f) v[c.I + 2 + f] = next[f];
        }
        ans[m] = h;
    }
    return ans;
}

struct TempInstr {
    int a, b, c, out;
    uint8_t op, phase;
};

struct Instr {
    uint32_t a, b, c, out;
};

struct Block {
    uint32_t begin, end;
    uint8_t op;
};

struct Signal {
    uint32_t off;
    uint32_t phase;
};

struct Program {
    std::vector<Instr> ins;
    std::vector<Block> blocks;
    std::vector<Signal> d, out;
    int slots = 0;
};

static Program compile_program(const Circuit& c, const std::vector<int>& first) {
    int G = c.G, base = c.I + c.F + 2;
    std::vector<int> id(G), phase(G, 0);
    std::vector<TempInstr> tmp;
    tmp.reserve(G);
    std::vector<int> which(G, -1);
    for (int k : first) {
        int ty = c.type[k];
        auto resolve = [&](int x, int& rx, int& rp) {
            if (x >= base) {
                int g = x - base;
                rx = id[g];
                rp = phase[g];
            } else {
                rx = x;
                rp = 0;
            }
        };
        int a, b = 0, d = 0, ap, bp = 0, dp = 0;
        resolve(c.in0[k], a, ap);
        if (ty != 6) resolve(c.in1[k], b, bp);
        if (ty == 7) resolve(c.in2[k], d, dp);
        if (ty == 6) {
            id[k] = a;
            phase[k] = ap ^ 1;
            continue;
        }
        auto constant = [](int x, int p) {
            if (x == 0) return p;
            if (x == 1) return p ^ 1;
            return -1;
        };
        int ca = constant(a, ap), cb = constant(b, bp), cd = constant(d, dp);
        int q = ty == 3 || ty == 4 || ty == 5;
        if (ty == 2 || ty == 5) {
            if (ca >= 0) {
                id[k] = b;
                phase[k] = bp ^ ca ^ q;
                continue;
            }
            if (cb >= 0) {
                id[k] = a;
                phase[k] = ap ^ cb ^ q;
                continue;
            }
            if (a == b) {
                id[k] = 0;
                phase[k] = ap ^ bp ^ q;
                continue;
            }
        } else if (ty == 0 || ty == 3) {
            if (ca >= 0 || cb >= 0) {
                if (ca == 0 || cb == 0) {
                    id[k] = 0;
                    phase[k] = q;
                } else if (ca == 1) {
                    id[k] = b;
                    phase[k] = bp ^ q;
                } else {
                    id[k] = a;
                    phase[k] = ap ^ q;
                }
                continue;
            }
            if (a == b) {
                if (ap == bp) {
                    id[k] = a;
                    phase[k] = ap ^ q;
                } else {
                    id[k] = 0;
                    phase[k] = q;
                }
                continue;
            }
        } else if (ty == 1 || ty == 4) {
            if (ca >= 0 || cb >= 0) {
                if (ca == 1 || cb == 1) {
                    id[k] = 0;
                    phase[k] = q ^ 1;
                } else if (ca == 0) {
                    id[k] = b;
                    phase[k] = bp ^ q;
                } else {
                    id[k] = a;
                    phase[k] = ap ^ q;
                }
                continue;
            }
            if (a == b) {
                if (ap == bp) {
                    id[k] = a;
                    phase[k] = ap ^ q;
                } else {
                    id[k] = 0;
                    phase[k] = q ^ 1;
                }
                continue;
            }
        } else {
            if (ca >= 0) {
                id[k] = ca ? d : b;
                phase[k] = ca ? dp : bp;
                continue;
            }
            if (cb >= 0 && cd >= 0) {
                if (cb == cd) {
                    id[k] = 0;
                    phase[k] = cb;
                } else {
                    id[k] = a;
                    phase[k] = ap ^ cb;
                }
                continue;
            }
            if (b == d && bp == dp) {
                id[k] = b;
                phase[k] = bp;
                continue;
            }
        }
        TempInstr z;
        z.a = a;
        z.b = b;
        z.c = d;
        z.out = base + k;
        if (ty == 2 || ty == 5) {
            z.op = 2;
            z.phase = ap ^ bp ^ (ty == 5);
        } else if (ty == 0 || ty == 3) {
            int q = ty == 3;
            if (ap && bp) {
                z.op = 1;
                z.phase = q ^ 1;
            } else {
                z.op = 0;
                if (bp) std::swap(z.a, z.b);
                if (ap || bp) z.op = 3;
                z.phase = q;
            }
        } else if (ty == 1 || ty == 4) {
            int q = ty == 4;
            if (!ap && !bp) {
                z.op = 1;
                z.phase = q;
            } else {
                if (ap && !bp) std::swap(z.a, z.b);
                z.op = (ap && bp) ? 0 : 3;
                z.phase = q ^ 1;
            }
        } else {
            if (ap) {
                std::swap(z.b, z.c);
                std::swap(bp, dp);
            }
            z.op = bp == dp ? 4 : 5;
            z.phase = bp == dp ? bp : bp;
        }
        id[k] = z.out;
        phase[k] = z.phase;
        which[k] = (int)tmp.size();
        tmp.push_back(z);
    }

    int P = (int)tmp.size();
    std::vector<int> pos(G, -1);
    for (int k = 0; k < G; ++k) if (which[k] >= 0) pos[k] = which[k];
    auto pred = [&](int x) { return x >= base ? pos[x - base] : -1; };
    std::vector<int> order;
    std::vector<Block> blocks;
    order.reserve(P);
    std::vector<uint8_t> state(P, 0);
    std::vector<std::pair<int, int>> stack;
    stack.reserve(1024);
    auto visit = [&](int root) {
        if (root < 0 || state[root]) return;
        state[root] = 1;
        stack.push_back({root, 0});
        while (!stack.empty()) {
            int p = stack.back().first;
            int& j = stack.back().second;
            int n = tmp[p].op >= 4 ? 3 : 2;
            bool descended = false;
            while (j < n) {
                int x = j++ == 0 ? tmp[p].a : (j == 2 ? tmp[p].b : tmp[p].c);
                int g = pred(x);
                if (g >= 0 && !state[g]) {
                    state[g] = 1;
                    stack.push_back({g, 0});
                    descended = true;
                    break;
                }
            }
            if (descended) continue;
            state[p] = 2;
            order.push_back(p);
            stack.pop_back();
        }
    };
    auto visit_signal = [&](int x) {
        if (x >= base) {
            int g = x - base;
            if (id[g] >= base) visit(pos[id[g] - base]);
        }
    };
    for (int x : c.d) visit_signal(x);
    for (int x : c.out) visit_signal(x);
    for (int p = 0; p < P; ++p) visit(p);
    for (int p = 0; p < P; ++p) {
        int op = tmp[order[p]].op;
        if (p == 0 || op != tmp[order[p - 1]].op) blocks.push_back({(uint32_t)p, (uint32_t)p + 1, (uint8_t)op});
        else blocks.back().end = p + 1;
    }

    std::vector<int> position(P);
    for (int p = 0; p < P; ++p) position[order[p]] = p;
    std::vector<int> last(P, -1);
    for (int p = 0; p < P; ++p) {
        int n = tmp[p].op >= 4 ? 3 : 2;
        int xs[3] = {tmp[p].a, tmp[p].b, tmp[p].c};
        for (int j = 0; j < n; ++j) {
            int g = pred(xs[j]);
            if (g >= 0) last[g] = std::max(last[g], position[p]);
        }
    }
    auto terminal = [&](int x, Signal& s, auto&& mark) {
        if (x >= base) {
            int g = x - base;
            s.off = (uint32_t)id[g];
            s.phase = (uint32_t)phase[g];
            if (s.off >= (uint32_t)base) mark(pos[s.off - base]);
        } else {
            s.off = (uint32_t)x;
            s.phase = 0;
        }
    };
    Program prog;
    prog.d.resize(c.F);
    prog.out.resize(c.O);
    for (int f = 0; f < c.F; ++f) terminal(c.d[f], prog.d[f], [&](int p) { last[p] = P; });
    for (int j = 0; j < c.O; ++j) terminal(c.out[j], prog.out[j], [&](int p) { last[p] = P; });

    std::vector<int> slot(P, -1), free_slots;
    free_slots.reserve(P);
    prog.ins.resize(P);
    prog.blocks = std::move(blocks);
    int slots = base;
    for (int p = 0; p < P; ++p) {
        int k = order[p];
        TempInstr& z = tmp[k];
        int out_slot;
        if (free_slots.empty()) out_slot = slots++;
        else {
            out_slot = free_slots.back();
            free_slots.pop_back();
        }
        slot[k] = out_slot;
        prog.ins[p].out = (uint32_t)out_slot * 32;
        int n = z.op >= 4 ? 3 : 2;
        int xs[3] = {z.a, z.b, z.c};
        uint32_t mapped[3];
        for (int j = 0; j < n; ++j) {
            int g = pred(xs[j]);
            mapped[j] = (uint32_t)(g >= 0 ? slot[g] : xs[j]) * 32;
        }
        prog.ins[p].a = mapped[0];
        prog.ins[p].b = mapped[1];
        prog.ins[p].c = n == 3 ? mapped[2] : 0;
        for (int j = 0; j < n; ++j) {
            int g = pred(xs[j]);
            if (g >= 0 && last[g] == p && (j == 0 || xs[j] != xs[0]) && (j < 2 || xs[j] != xs[1])) {
                free_slots.push_back(slot[g]);
            }
        }
    }
    prog.slots = slots;
    for (int f = 0; f < c.F; ++f) {
        if (prog.d[f].off >= (uint32_t)base) {
            int p = pos[prog.d[f].off - base];
            prog.d[f].off = (uint32_t)slot[p] * 32;
        } else prog.d[f].off *= 32;
    }
    for (int j = 0; j < c.O; ++j) {
        if (prog.out[j].off >= (uint32_t)base) {
            int p = pos[prog.out[j].off - base];
            prog.out[j].off = (uint32_t)slot[p] * 32;
        } else prog.out[j].off *= 32;
    }
    return prog;
}

template<int OP>
static inline void run_block(const Instr* p, const Instr* end, char* v) {
    for (; p != end; ++p) {
        __m256i z;
        if constexpr (OP < 4) {
            __m256i a = _mm256_load_si256((const __m256i*)(v + p->a));
            __m256i b = _mm256_load_si256((const __m256i*)(v + p->b));
            if constexpr (OP == 0) z = _mm256_and_si256(a, b);
            else if constexpr (OP == 1) z = _mm256_or_si256(a, b);
            else if constexpr (OP == 2) z = _mm256_xor_si256(a, b);
            else z = _mm256_andnot_si256(a, b);
        } else {
            __m256i s = _mm256_load_si256((const __m256i*)(v + p->a));
            __m256i a = _mm256_load_si256((const __m256i*)(v + p->b));
            __m256i b = _mm256_load_si256((const __m256i*)(v + p->c));
            if constexpr (OP == 4) z = _mm256_xor_si256(a, _mm256_and_si256(_mm256_xor_si256(a, b), s));
            else {
                __m256i x = _mm256_andnot_si256(s, a);
                __m256i y = _mm256_andnot_si256(b, s);
                z = _mm256_or_si256(x, y);
            }
        }
        _mm256_store_si256((__m256i*)(v + p->out), z);
    }
}

struct JitEmitter {
    uint8_t* p;
    bool dual = false;
    size_t loads = 0, stores = 0, ops = 0;
    void byte(uint8_t x) { *p++ = x; }
    void disp(uint32_t x) {
        byte((uint8_t)x);
        byte((uint8_t)(x >> 8));
        byte((uint8_t)(x >> 16));
        byte((uint8_t)(x >> 24));
    }
    void prefix(int reg) {
        if (reg < 8) {
            byte(0xc5); byte(0xfe);
        } else {
            byte(0xc4); byte(0x61); byte(0x7e);
        }
    }
    void load_one(int reg, uint32_t off, int base) {
        ++loads;
        prefix(reg);
        byte(0x6f); byte(0x80 + (reg & 7) * 8 + base); disp(off);
    }
    void store_one(int reg, uint32_t off, int base) {
        ++stores;
        prefix(reg);
        byte(0x7f); byte(0x80 + (reg & 7) * 8 + base); disp(off);
    }
    void regop_one(uint8_t op, int dst, int src1, int src2) {
        ++ops;
        if (dst < 8 && src2 < 8) {
            byte(0xc5); byte(0x85 | ((15 - src1) << 3));
        } else {
            byte(0xc4); byte(0x41 | (dst < 8 ? 0x80 : 0) | (src2 < 8 ? 0x20 : 0));
            byte((15 - src1) << 3 | 5);
        }
        byte(op); byte(0xc0 + (dst & 7) * 8 + (src2 & 7));
    }
    void memop_one(uint8_t op, int dst, int src1, uint32_t off, int base) {
        ++ops;
        if (dst < 8) {
            byte(0xc5); byte(0x85 | ((15 - src1) << 3));
        } else {
            byte(0xc4); byte(0x61); byte((15 - src1) << 3 | 5);
        }
        byte(op); byte(0x80 + (dst & 7) * 8 + base); disp(off);
    }
    void load(int reg, uint32_t off) {
        load_one(reg, off, 1);
        if (dual) load_one(reg + 8, off, 2);
    }
    void store(int reg, uint32_t off) {
        store_one(reg, off, 1);
        if (dual) store_one(reg + 8, off, 2);
    }
    void regop(uint8_t op, int dst, int src1, int src2) {
        regop_one(op, dst, src1, src2);
        if (dual) regop_one(op, dst + 8, src1 + 8, src2 + 8);
    }
    void memop(uint8_t op, int dst, int src1, uint32_t off) {
        memop_one(op, dst, src1, off, 1);
        if (dual) memop_one(op, dst + 8, src1 + 8, off, 2);
    }
};

static char* build_jit(const Program& prog, bool dual) {
#ifdef _WIN32
    size_t cap = (size_t)prog.ins.size() * (dual ? 144 : 80) + 256;
    char* code = (char*)VirtualAlloc(nullptr, cap, MEM_COMMIT | MEM_RESERVE, PAGE_EXECUTE_READWRITE);
    if (!code) return nullptr;
    JitEmitter e{(uint8_t*)code};
    e.dual = dual;
    int P = (int)prog.ins.size(), S = prog.slots;
    std::vector<int> use_off(S + 1, 0);
    for (const Block& b : prog.blocks) {
        for (uint32_t i = b.begin; i < b.end; ++i) {
            const Instr& z = prog.ins[i];
            ++use_off[(z.a >> 5) + 1];
            ++use_off[(z.b >> 5) + 1];
            if (b.op >= 4) ++use_off[(z.c >> 5) + 1];
        }
    }
    for (const Signal& s : prog.d) ++use_off[(s.off >> 5) + 1];
    for (const Signal& s : prog.out) ++use_off[(s.off >> 5) + 1];
    for (int s = 0; s < S; ++s) use_off[s + 1] += use_off[s];
    std::vector<int> use_pos(use_off[S]), cursor(S, 0), fill = use_off;
    for (const Block& b : prog.blocks) {
        for (uint32_t i = b.begin; i < b.end; ++i) {
            const Instr& z = prog.ins[i];
            use_pos[fill[z.a >> 5]++] = i;
            use_pos[fill[z.b >> 5]++] = i;
            if (b.op >= 4) use_pos[fill[z.c >> 5]++] = i;
        }
    }
    for (const Signal& s : prog.d) use_pos[fill[s.off >> 5]++] = P;
    for (const Signal& s : prog.out) use_pos[fill[s.off >> 5]++] = P;
    auto next_use = [&](int s) {
        int p = use_off[s] + cursor[s];
        return p < use_off[s + 1] ? use_pos[p] : INT32_MAX;
    };
    const int CR = dual ? 7 : 15;
    std::vector<int8_t> slot_reg(S, -1);
    int reg_slot[15];
    bool dirty[15];
    for (int r = 0; r < CR; ++r) {
        reg_slot[r] = -1;
        dirty[r] = false;
    }
    auto acquire = [&](int p0, int p1, int p2, int p3) {
        int r = -1;
        for (int i = 0; i < CR; ++i) if (reg_slot[i] < 0) {
            r = i;
            break;
        }
        if (r < 0) {
            int farthest = -1;
            for (int i = 0; i < CR; ++i) {
                if (i == p0 || i == p1 || i == p2 || i == p3) continue;
                int n = next_use(reg_slot[i]);
                if (n > farthest) {
                    farthest = n;
                    r = i;
                }
            }
        }
        int old = reg_slot[r];
        if (old >= 0) {
            if (dirty[r] && next_use(old) != INT32_MAX) e.store(r, (uint32_t)old * 32);
            slot_reg[old] = -1;
            reg_slot[r] = -1;
            dirty[r] = false;
        }
        return r;
    };
    struct Operand {
        int reg;
        uint32_t off;
    };
    auto operand = [&](uint32_t off, int, int, int) {
        int s = (int)(off >> 5);
        ++cursor[s];
        return Operand{slot_reg[s], off};
    };
    auto apply = [&](uint8_t op, int dst, Operand x) {
        if (x.reg >= 0) e.regop(op, dst, dst, x.reg);
        else e.memop(op, dst, dst, x.off);
    };
    auto binary = [&](uint8_t op, int dst, Operand a, Operand b) {
        if (a.reg >= 0) {
            if (b.reg >= 0) e.regop(op, dst, a.reg, b.reg);
            else e.memop(op, dst, a.reg, b.off);
        } else if (b.reg >= 0 && op != 0xdf) {
            e.memop(op, dst, b.reg, a.off);
        } else {
            e.load(dst, a.off);
            if (b.reg >= 0) e.regop(op, dst, dst, b.reg);
            else e.memop(op, dst, dst, b.off);
        }
    };
    static const uint8_t opcode[4] = {0xdb, 0xeb, 0xef, 0xdf};
    for (const Block& b : prog.blocks) {
        for (uint32_t i = b.begin; i < b.end; ++i) {
            const Instr& z = prog.ins[i];
            Operand a = operand(z.a, -1, -1, -1);
            Operand bb = operand(z.b, a.reg, -1, -1);
            Operand d = b.op >= 4 ? operand(z.c, a.reg, bb.reg, -1) : Operand{-1, 0};
            int out = (int)(z.out >> 5);
            int dst = slot_reg[out];
            if (dst >= 0 && (dst == a.reg || dst == bb.reg || dst == d.reg)) {
                slot_reg[out] = -1;
                reg_slot[dst] = -1;
                dirty[dst] = false;
                dst = -1;
            }
            if (dst < 0) dst = acquire(a.reg, bb.reg, d.reg, -1);
            if (b.op < 4) {
                binary(opcode[b.op], dst, a, bb);
            } else if (b.op == 4) {
                binary(0xef, dst, bb, d);
                apply(0xdb, dst, a);
                apply(0xef, dst, bb);
            } else {
                if (a.reg >= 0) {
                    if (bb.reg >= 0) e.regop(0xdf, dst, a.reg, bb.reg);
                    else e.memop(0xdf, dst, a.reg, bb.off);
                } else {
                    e.load(dst, a.off);
                    apply(0xdf, dst, bb);
                }
                if (d.reg >= 0) {
                    if (a.reg >= 0) e.regop(0xdf, CR, d.reg, a.reg);
                    else e.memop(0xdf, CR, d.reg, a.off);
                } else {
                    e.load(CR, d.off);
                    apply(0xdf, CR, a);
                }
                e.regop(0xeb, dst, dst, CR);
            }
            int previous = reg_slot[dst];
            if (previous >= 0 && previous != out) slot_reg[previous] = -1;
            reg_slot[dst] = out;
            slot_reg[out] = (int8_t)dst;
            dirty[dst] = true;
        }
    }
    for (int r = 0; r < CR; ++r)
        if (reg_slot[r] >= 0 && dirty[r] && next_use(reg_slot[r]) != INT32_MAX)
            e.store(r, (uint32_t)reg_slot[r] * 32);
    e.byte(0xc5); e.byte(0xf8); e.byte(0x77); e.byte(0xc3);
#ifdef DEBUG_STATS
    fprintf(stderr, " jit_bytes=%zu loads=%zu stores=%zu ops=%zu\n", (size_t)(e.p - (uint8_t*)code), e.loads, e.stores, e.ops);
#endif
    return code;
#else
    return nullptr;
#endif
}

static std::vector<uint64_t> simulate_fast(const Circuit& c, const Program& prog, const void* jit, bool dual) {
    int streams = dual ? 2 : 1;
    int groups = c.M / (256 * streams);
    std::vector<uint64_t> ans(c.M);
    std::vector<uint64_t> mixes((size_t)c.T * c.O);
    for (int t = 0; t < c.T; ++t)
        for (int j = 0; j < c.O; ++j) mixes[(size_t)t * c.O + j] = mix64((uint64_t)t * c.O + j);
    const Instr* ins = prog.ins.data();
    const Block* blocks = prog.blocks.data();
    int nb = (int)prog.blocks.size();
    const Signal* ds = prog.d.data();
    const Signal* outs = prog.out.data();
    #pragma omp parallel for num_threads(THREADS) schedule(static)
    for (int g = 0; g < groups; ++g) {
        char* mem[2] = {}, *next[2] = {};
        for (int s = 0; s < streams; ++s) {
            mem[s] = (char*)_mm_malloc((size_t)prog.slots * 32, 32);
            next[s] = (char*)_mm_malloc((size_t)c.F * 32, 32);
        }
        alignas(32) __m256i digest[2][64];
        alignas(32) uint64_t pi[64][8];
        alignas(32) uint64_t r[64];
        uint64_t rng[512];
        for (int s = 0; s < streams; ++s) {
            for (int i = 0; i < 256; ++i)
                rng[s * 256 + i] = mix64(c.seed ^ (uint64_t)((g * streams + s) * 256 + i));
            for (int k = 0; k < 64; ++k) digest[s][k] = _mm256_setzero_si256();
            _mm256_store_si256((__m256i*)mem[s], _mm256_setzero_si256());
            _mm256_store_si256((__m256i*)(mem[s] + 32), _mm256_set1_epi64x(-1));
            std::memset(mem[s] + (c.I + 2) * 32, 0, (size_t)c.F * 32);
        }
        const __m256i one = _mm256_set1_epi64x(-1);
        for (int t = 0; t < c.T; ++t) {
            for (int q = 0; q < 4 * streams; ++q) {
                for (int i = 0; i < 64; ++i) r[i] = sm64(rng[q * 64 + i]);
                transpose64(r);
                for (int i = 0; i < 64; ++i) pi[i][q] = r[63 - i];
            }
            for (int s = 0; s < streams; ++s)
                for (int i = 0; i < 64; ++i)
                    _mm256_store_si256((__m256i*)(mem[s] + (2 + i) * 32),
                                       _mm256_load_si256((const __m256i*)pi[i] + s));
            if (jit) {
                ((void (*)(char*, char*))jit)(mem[0], mem[1]);
            } else {
                for (int s = 0; s < streams; ++s) {
                    for (int bi = 0; bi < nb; ++bi) {
                        Block b = blocks[bi];
                        const Instr* p = ins + b.begin;
                        const Instr* e = ins + b.end;
                        switch (b.op) {
                            case 0: run_block<0>(p, e, mem[s]); break;
                            case 1: run_block<1>(p, e, mem[s]); break;
                            case 2: run_block<2>(p, e, mem[s]); break;
                            case 3: run_block<3>(p, e, mem[s]); break;
                            case 4: run_block<4>(p, e, mem[s]); break;
                            default: run_block<5>(p, e, mem[s]); break;
                        }
                    }
                }
            }
            const uint64_t* mt = mixes.data() + (size_t)t * c.O;
            for (int s = 0; s < streams; ++s) {
                for (int j = 0; j < c.O; ++j) {
                    __m256i x = _mm256_load_si256((const __m256i*)(mem[s] + outs[j].off));
                    x = _mm256_xor_si256(x, _mm256_and_si256(one, _mm256_set1_epi64x(-(int64_t)outs[j].phase)));
                    uint64_t m = mt[j];
                    while (m) {
                        int k = __builtin_ctzll(m);
                        digest[s][k] = _mm256_xor_si256(digest[s][k], x);
                        m &= m - 1;
                    }
                }
                for (int f = 0; f < c.F; ++f) {
                    __m256i x = _mm256_load_si256((const __m256i*)(mem[s] + ds[f].off));
                    x = _mm256_xor_si256(x, _mm256_and_si256(one, _mm256_set1_epi64x(-(int64_t)ds[f].phase)));
                    _mm256_store_si256((__m256i*)(next[s] + (size_t)f * 32), x);
                }
                std::memcpy(mem[s] + (c.I + 2) * 32, next[s], (size_t)c.F * 32);
            }
        }
        alignas(32) uint64_t bits[64][4];
        for (int s = 0; s < streams; ++s) {
            for (int k = 0; k < 64; ++k) _mm256_store_si256((__m256i*)bits[k], digest[s][k]);
            for (int q = 0; q < 4; ++q) {
                for (int k = 0; k < 64; ++k) r[k] = bits[63 - k][q];
                transpose64(r);
                for (int i = 0; i < 64; ++i) ans[(g * streams + s) * 256 + q * 64 + i] = r[i];
            }
            _mm_free(next[s]);
            _mm_free(mem[s]);
        }
    }
    return ans;
}

std::vector<uint64_t> simulate(const Circuit& c) {
#ifdef DEBUG_STATS
    auto dbg0 = std::chrono::steady_clock::now();
#endif
    std::vector<int> order = topo_order(c);
    if (c.I == 64 && c.M >= 256 && c.M % 256 == 0 && c.G >= 1024) {
#ifdef DEBUG_STATS
        auto dbg1 = std::chrono::steady_clock::now();
#endif
        Program prog = compile_program(c, order);
#ifdef DEBUG_STATS
        auto dbg2 = std::chrono::steady_clock::now();
        size_t lens[6] = {}, counts[6] = {};
        for (const Block& b : prog.blocks) {
            lens[b.op] += b.end - b.begin;
            ++counts[b.op];
        }
        fprintf(stderr, "slots=%d blocks=%zu", prog.slots, prog.blocks.size());
        for (int op = 0; op < 6; ++op) fprintf(stderr, " op%d=%zu/%zu", op, lens[op], counts[op]);
        fprintf(stderr, "\n");
        char* jit = build_jit(prog, DUAL);
        auto dbg3 = std::chrono::steady_clock::now();
        fprintf(stderr, " topo=%.3f compile=%.3f jit=%.3f\n",
                std::chrono::duration<double, std::milli>(dbg1 - dbg0).count(),
                std::chrono::duration<double, std::milli>(dbg2 - dbg1).count(),
                std::chrono::duration<double, std::milli>(dbg3 - dbg2).count());
        if (jit) VirtualFree(jit, 0, MEM_RELEASE);
        return std::vector<uint64_t>(c.M);
#else
        char* jit = build_jit(prog, DUAL);
        std::vector<uint64_t> ans = simulate_fast(c, prog, jit, DUAL);
#ifdef _WIN32
        if (jit) VirtualFree(jit, 0, MEM_RELEASE);
#endif
        return ans;
#endif
    }
    return simulate_small(c, order);
}

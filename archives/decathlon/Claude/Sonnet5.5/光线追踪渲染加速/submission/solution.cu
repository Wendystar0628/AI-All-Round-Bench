// GPU ray tracer: multithreaded CPU binned-SAH BVH2 (both child boxes per node), CUDA traversal kernel.
#include "rt.h"
#include "render_math.cuh"
#include <cuda_runtime.h>
#include <vector>
#include <thread>
#include <mutex>
#include <condition_variable>
#include <deque>
#include <functional>
#include <atomic>
#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <cfloat>

#define CK(x) do{cudaError_t e_=(x); if(e_!=cudaSuccess){fprintf(stderr,"CUDA error %s at line %d\n",cudaGetErrorString(e_),__LINE__);exit(2);}}while(0)

#ifndef NTHREADS
#define NTHREADS 12
#endif
#ifndef AX3
#define AX3 64
#endif
#ifndef FL
#define FL 1
#endif
#ifndef SAMPLES
#define SAMPLES 2048
#endif
#ifndef LEAF_MAX
#define LEAF_MAX 8
#endif
#ifndef CTRAV
#define CTRAV 1.0f
#endif
#ifndef PARPART
#define PARPART 1000000000
#endif
#ifndef PARMIN
#define PARMIN 6000
#endif
#define STK 64
#ifndef BLK
#define BLK 128
#endif
#ifndef LB_BLOCKS
#define LB_BLOCKS 10
#endif
#if defined(TIMING)||defined(PROF)
#include <chrono>
static double nowms() { return std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now().time_since_epoch()).count(); }
static double g_t0;
#ifndef TIMING
#define TIMING_DUMMY
#endif
#define TM(name) do{fprintf(stderr,"  [%s] %.3f ms\n",name,nowms()-g_t0);}while(0)
#else
#define TM(name)
#endif

struct __align__(16) GNode { float4 a, b, c; int4 ch; };
struct __align__(16) GRec { float4 v0, e1, e2, cm; };
struct BP { float lo[3]; int id; float hi[3]; float pad; };

static GNode* h_nodes = nullptr; static GRec* h_recs = nullptr;
static GNode* d_nodes = nullptr; static GRec* d_recs = nullptr;
static BP* h_P = nullptr;
static int g_cap = 0;

// ---------------------------------------------------------------- host build
// Per-render worker pool (threads are created inside render() and joined before it returns).
struct Pool {
    struct Task { std::function<void()> fn; std::atomic<int>* done; };
    std::mutex m; std::condition_variable cv; std::deque<Task> q; bool stop = false; std::vector<std::thread> th;
    void start(int n) { for (int i = 0; i < n; i++) th.emplace_back([this] { worker(); }); }
    void worker() {
        for (;;) {
            Task t;
            { std::unique_lock<std::mutex> lk(m); cv.wait(lk, [&] { return stop || !q.empty(); }); if (q.empty()) return; t = std::move(q.front()); q.pop_front(); }
            t.fn(); if (t.done) t.done->store(1, std::memory_order_release);
        }
    }
    void push(std::function<void()> f, std::atomic<int>* done) {
        { std::lock_guard<std::mutex> lk(m); q.push_back(Task{ std::move(f), done }); }
        cv.notify_one();
    }
    bool run_one() {
        Task t;
        { std::lock_guard<std::mutex> lk(m); if (q.empty()) return false; t = std::move(q.back()); q.pop_back(); }
        t.fn(); if (t.done) t.done->store(1, std::memory_order_release);
        return true;
    }
    void wait(std::atomic<int>& d) { while (!d.load(std::memory_order_acquire)) { if (!run_one()) std::this_thread::yield(); } }
    void finish() { { std::lock_guard<std::mutex> lk(m); stop = true; } cv.notify_all(); for (auto& x : th) x.join(); th.clear(); }
};
static Pool* g_pool = nullptr;

template<class F> static void pfor(int n, int chunk, F f) {
    std::atomic<int> next{0};
    auto work = [&] { for (;;) { int s = next.fetch_add(chunk); if (s >= n) break; f(s, std::min(n, s + chunk)); } };
    int T = (int)g_pool->th.size() + 1; if (n < chunk * 2) T = 1;
    std::vector<std::atomic<int>> dn(T > 1 ? T - 1 : 0);
    for (int t = 1; t < T; t++) { dn[t - 1].store(0); g_pool->push(work, &dn[t - 1]); }
    work();
    for (int t = 1; t < T; t++) g_pool->wait(dn[t - 1]);
}

static inline void pack_node(GNode& n, const float* llo, const float* lhi, const float* rlo, const float* rhi, float pad) {
    float lc[3], lh[3], rc[3], rh[3];
    for (int k = 0; k < 3; k++) {
        float a = llo[k] - pad, b = lhi[k] + pad; lc[k] = (a + b) * .5f; lh[k] = (b - a) * .5f;
        a = rlo[k] - pad; b = rhi[k] + pad; rc[k] = (a + b) * .5f; rh[k] = (b - a) * .5f;
    }
    n.a = make_float4(lc[0], lc[1], lc[2], lh[0]);
    n.b = make_float4(lh[1], lh[2], rc[0], rc[1]);
    n.c = make_float4(rc[2], rh[0], rh[1], rh[2]);
}
struct Acc {
    float lo[3], hi[3], clo[3], chi[3];
    void init() { for (int k = 0; k < 3; k++) { lo[k] = clo[k] = FLT_MAX; hi[k] = chi[k] = -FLT_MAX; } }
    inline void add(const BP& p) {
        for (int k = 0; k < 3; k++) {
            lo[k] = std::min(lo[k], p.lo[k]); hi[k] = std::max(hi[k], p.hi[k]);
            float c = (p.lo[k] + p.hi[k]) * .5f; clo[k] = std::min(clo[k], c); chi[k] = std::max(chi[k], c);
        }
    }
    void merge(const Acc& o) { for (int k = 0; k < 3; k++) { lo[k] = std::min(lo[k], o.lo[k]); hi[k] = std::max(hi[k], o.hi[k]); clo[k] = std::min(clo[k], o.clo[k]); chi[k] = std::max(chi[k], o.chi[k]); } }
};

#ifdef PROF
static double g_leaf=0,g_bin=0,g_part=0,g_scan=0;
#endif
struct Builder {
    BP* P; GNode* nodes; const Triangle* T; GRec* recs;
    static constexpr int B = 16;  // max bins
    static float area(const float* lo, const float* hi) { float x = hi[0] - lo[0], y = hi[1] - lo[1], z = hi[2] - lo[2]; return x * y + y * z + z * x; }
    void leaf_recs(int b, int e) {
        for (int k = b; k < e; k++) {
            const Triangle& t = T[P[k].id]; GRec& r = recs[k];
            r.v0 = make_float4(t.v0[0], t.v0[1], t.v0[2], 0.f);
            r.e1 = make_float4(t.v1[0] - t.v0[0], t.v1[1] - t.v0[1], t.v1[2] - t.v0[2], 0.f);
            r.e2 = make_float4(t.v2[0] - t.v0[0], t.v2[1] - t.v0[1], t.v2[2] - t.v0[2], 0.f);
            r.cm = make_float4(t.color[0], t.color[1], t.color[2], t.mirror);
        }
    }
    // record, for the child `code` of node `par` (side 0/1), who its parent is (inner node: in ch.z/ch.w; leaf: in recs[].v0.w)
    void set_parent(int code, int par, int side) {
        if (code >= 0) { nodes[code].ch.z = par; nodes[code].ch.w = side; }
        else {
            int v = -code - 1, s = v >> 4, c = v & 15; int pi = (par << 1) | side; float f; memcpy(&f, &pi, 4);
            for (int k = s; k < s + c; k++) recs[k].v0.w = f;
        }
    }
    int make_leaf(int b, int e) {
#ifdef PROF
        double q0=nowms();
#endif
        leaf_recs(b, e);
#ifdef PROF
        g_leaf+=nowms()-q0;
#endif
        return -(1 + ((b << 4) | (e - b))); }
    void scan(int b, int e, Acc& a) { a.init(); for (int i = b; i < e; i++) a.add(P[i]); }
    // in-place partition of P[b,e) by bin index along axis k; accumulates both sides; returns first right index
    int part_range(int b, int e, int k, float c0, float sc, int bb, int nb, Acc& AL, Acc& AR) {
        AL.init(); AR.init();
        int i = b, j = e - 1;
        auto isLeft = [&](const BP& p) { return std::min(nb - 1, int(((p.lo[k] + p.hi[k]) * .5f - c0) * sc)) < bb; };
        while (i <= j) {
            if (isLeft(P[i])) { AL.add(P[i]); i++; }
            else if (!isLeft(P[j])) { AR.add(P[j]); j--; }
            else { std::swap(P[i], P[j]); AL.add(P[i]); AR.add(P[j]); i++; j--; }
        }
        return i;
    }
    int par_partition(int b, int e, int k, float c0, float sc, int bb, int nb, Acc& AL, Acc& AR) {
        int cnt = e - b; int T = std::min(NTHREADS, std::max(2, cnt / 12000));
        std::vector<int> ms(T), ss(T), es(T); std::vector<Acc> al(T), ar(T);
        auto work = [&](int t) {
            int s = b + int((long long)cnt * t / T), en = b + int((long long)cnt * (t + 1) / T);
            ss[t] = s; es[t] = en; ms[t] = part_range(s, en, k, c0, sc, bb, nb, al[t], ar[t]);
        };
        std::vector<std::atomic<int>> dn(T - 1);
        for (int t = 1; t < T; t++) { dn[t - 1].store(0); g_pool->push([&work, t] { work(t); }, &dn[t - 1]); }
        work(0); for (int t = 1; t < T; t++) g_pool->wait(dn[t - 1]);
        AL.init(); AR.init(); for (int t = 0; t < T; t++) { AL.merge(al[t]); AR.merge(ar[t]); }
        int L = 0; for (int t = 0; t < T; t++) L += ms[t] - ss[t];
        int mid = b + L;
        struct Seg { int s, len; };
        std::vector<Seg> A, Bv;
        for (int t = 0; t < T; t++) {
            int rs = ms[t], re = std::min(es[t], mid); if (rs < re) A.push_back({ rs, re - rs });
            int ls = std::max(ss[t], mid), le = ms[t]; if (ls < le) Bv.push_back({ ls, le - ls });
        }
        size_t ia = 0, ib = 0; int oa = 0, ob = 0;
        while (ia < A.size() && ib < Bv.size()) {
            int n = std::min(A[ia].len - oa, Bv[ib].len - ob);
            for (int q = 0; q < n; q++) std::swap(P[A[ia].s + oa + q], P[Bv[ib].s + ob + q]);
            oa += n; ob += n;
            if (oa == A[ia].len) { ia++; oa = 0; }
            if (ob == Bv[ib].len) { ib++; ob = 0; }
        }
        return mid;
    }
    int build(int b, int e, int base, int depth, const Acc& box) {
        int cnt = e - b;
        if (cnt <= FL && depth > 0) return make_leaf(b, e);
#ifdef TIMING
        double tb0 = nowms();
#endif
        int mid = -1; Acc AL, AR; bool haveAcc = false;
        float best = FLT_MAX; int bestAxis = -1, bestBin = 0;
        const float* clo = box.clo; const float* chi = box.chi;
        bool force = depth >= 40;
        if (!force) {
#ifdef PROF
            double q1=nowms();
#endif
            int stride = cnt > SAMPLES ? cnt / SAMPLES : 1;
            const int nb = cnt > 96 ? 16 : (cnt > 24 ? 8 : 4);
            int bc[3][B]; float bl[3][B][3], bh[3][B][3]; float scale[3];
            int k0 = 0, k1 = 3;
            if (cnt > AX3) { int ax = 0; for (int k = 1; k < 3; k++) if (chi[k] - clo[k] > chi[ax] - clo[ax]) ax = k; k0 = ax; k1 = ax + 1; }
            for (int k = k0; k < k1; k++) {
                float ext = chi[k] - clo[k]; scale[k] = ext > 1e-9f ? nb / ext * (1 - 1e-6f) : 0.f;
                for (int j = 0; j < nb; j++) { bc[k][j] = 0; for (int q = 0; q < 3; q++) { bl[k][j][q] = FLT_MAX; bh[k][j][q] = -FLT_MAX; } }
            }
            for (int i = b; i < e; i += stride) {
                const BP& p = P[i];
                for (int k = k0; k < k1; k++) {
                    int j = std::min(nb - 1, int(((p.lo[k] + p.hi[k]) * .5f - clo[k]) * scale[k]));
                    bc[k][j]++;
                    for (int q = 0; q < 3; q++) { bl[k][j][q] = std::min(bl[k][j][q], p.lo[q]); bh[k][j][q] = std::max(bh[k][j][q], p.hi[q]); }
                }
            }
            for (int k = k0; k < k1; k++) {
                if (!(chi[k] - clo[k] > 1e-9f)) continue;
                float rar[B]; int rc[B]; float alo[3] = { FLT_MAX, FLT_MAX, FLT_MAX }, ahi[3] = { -FLT_MAX, -FLT_MAX, -FLT_MAX }; int ac = 0;
                for (int j = nb - 1; j > 0; j--) {
                    ac += bc[k][j]; for (int q = 0; q < 3; q++) { alo[q] = std::min(alo[q], bl[k][j][q]); ahi[q] = std::max(ahi[q], bh[k][j][q]); }
                    rc[j] = ac; rar[j] = ac ? area(alo, ahi) : 0.f;
                }
                for (int q = 0; q < 3; q++) { alo[q] = FLT_MAX; ahi[q] = -FLT_MAX; } ac = 0;
                for (int j = 1; j < nb; j++) {
                    ac += bc[k][j - 1]; for (int q = 0; q < 3; q++) { alo[q] = std::min(alo[q], bl[k][j - 1][q]); ahi[q] = std::max(ahi[q], bh[k][j - 1][q]); }
                    if (!ac || !rc[j]) continue;
                    float c = (area(alo, ahi) * ac + rar[j] * rc[j]) * stride;
                    if (c < best) { best = c; bestAxis = k; bestBin = j; }
                }
            }
#ifdef PROF
            g_bin+=nowms()-q1;
#endif
            if (cnt <= LEAF_MAX && depth > 0) {
                float pa = area(box.lo, box.hi);
                float splitCost = CTRAV + (pa > 0 ? best / pa : float(cnt));
                if (float(cnt) <= splitCost) return make_leaf(b, e);
            }
            if (bestAxis >= 0) {
                int k = bestAxis; float c0 = clo[k], sc = scale[k]; int bb = bestBin;
#ifdef PROF
                double q2=nowms();
#endif
                if (cnt > PARPART) mid = par_partition(b, e, k, c0, sc, bb, nb, AL, AR);
                else mid = part_range(b, e, k, c0, sc, bb, nb, AL, AR);
#ifdef PROF
                g_part+=nowms()-q2;
#endif
                haveAcc = true;
            }
        } else if (cnt <= LEAF_MAX) return make_leaf(b, e);
        if (mid <= b || mid >= e) {
            int axis = 0; for (int k = 1; k < 3; k++) if (chi[k] - clo[k] > chi[axis] - clo[axis]) axis = k;
            mid = (b + e) / 2;
            std::nth_element(P + b, P + mid, P + e, [&](const BP& x, const BP& y) { return x.lo[axis] + x.hi[axis] < y.lo[axis] + y.hi[axis]; });
            haveAcc = false;
        }
#ifdef TIMING
        double tb2 = nowms();
#endif
        if (!haveAcc) { scan(b, mid, AL); scan(mid, e, AR); }
        int cl = mid - b; int lc, rc2;
        if (cnt > PARMIN) {
            std::atomic<int> dn{0};
            g_pool->push([&] { lc = build(b, mid, base + 1, depth + 1, AL); }, &dn);
            rc2 = build(mid, e, base + cl, depth + 1, AR);
            g_pool->wait(dn);
        } else {
            lc = build(b, mid, base + 1, depth + 1, AL);
            rc2 = build(mid, e, base + cl, depth + 1, AR);
        }
#ifdef TIMING
        if (depth <= 3) fprintf(stderr, "   depth %d cnt %d: start %.2f split-done %.2f total %.2f\n", depth, cnt, tb0 - g_t0, tb2 - g_t0, nowms() - tb0);
#endif
        const float pad = 2e-5f;
        GNode n;
        pack_node(n, AL.lo, AL.hi, AR.lo, AR.hi, pad);
        n.ch = make_int4(lc, rc2, 0, 0);
        nodes[base] = n;
#if defined(UP_AO) || defined(UP_SH)
        set_parent(lc, base, 0); set_parent(rc2, base, 1);
#endif
        return base;
    }
};

// ---------------------------------------------------------------- device
struct Params {
    Scene s; const float4* nodes; const float4* recs; float* out; long long total; float inv_spp;
    int* cand; int use_cand;
};
#ifndef CAND_MIN_SPP
#define CAND_MIN_SPP 6
#endif
#ifdef CSTATS
__device__ unsigned long long g_cs[8];
#endif
#define LSTRIDE 64
#define KMAX 22
#define SOFF 24
#define SKMAX 35
#ifndef RHO_MULT
#define RHO_MULT 4.f
#endif
#define SKYT 150.f
#define SKYCOV 200.f

template<bool ANY>
__device__ __forceinline__ bool trace_ray(const float4* __restrict__ nodes, const float4* __restrict__ recs,
    float ox, float oy, float oz, float dx, float dy, float dz, float tmax, float& tout, int& idout) {
    float ix = 1.f / (fabsf(dx) < 1e-20f ? copysignf(1e-20f, dx) : dx);
    float iy = 1.f / (fabsf(dy) < 1e-20f ? copysignf(1e-20f, dy) : dy);
    float iz = 1.f / (fabsf(dz) < 1e-20f ? copysignf(1e-20f, dz) : dz);
    float oix = ox * ix, oiy = oy * iy, oiz = oz * iz;
    float aix = fabsf(ix), aiy = fabsf(iy), aiz = fabsf(iz);
    int stN[STK]; float stT[ANY ? 1 : STK];
    int sp = 0, cur = 0;
    float best = tmax; int bid = -1;
    for (;;) {
        if (cur >= 0) {
            const float4* np = nodes + 4 * cur;
            float4 a = np[0], b = np[1], c = np[2]; int4 ch = ((const int4*)np)[3];
            float mx = fmaf(a.x, ix, -oix), ex = a.w * aix;
            float my = fmaf(a.y, iy, -oiy), ey = b.x * aiy;
            float mz = fmaf(a.z, iz, -oiz), ez = b.y * aiz;
            float t0L = fmaxf(fmaxf(mx - ex, my - ey), fmaxf(mz - ez, 0.f));
            float t1L = fminf(fminf(mx + ex, my + ey), fminf(mz + ez, best));
            mx = fmaf(b.z, ix, -oix); ex = c.y * aix;
            my = fmaf(b.w, iy, -oiy); ey = c.z * aiy;
            mz = fmaf(c.x, iz, -oiz); ez = c.w * aiz;
            float t0R = fmaxf(fmaxf(mx - ex, my - ey), fmaxf(mz - ez, 0.f));
            float t1R = fminf(fminf(mx + ex, my + ey), fminf(mz + ez, best));
            bool hL = t0L <= t1L, hR = t0R <= t1R;
            if (hL && hR) {
                if (ANY) {
                    if (t0L <= t0R) { stN[sp++] = ch.y; cur = ch.x; }
                    else { stN[sp++] = ch.x; cur = ch.y; }
                }
                else if (t0L <= t0R) { stN[sp] = ch.y; stT[sp++] = t0R; cur = ch.x; }
                else { stN[sp] = ch.x; stT[sp++] = t0L; cur = ch.y; }
            } else if (hL) cur = ch.x;
            else if (hR) cur = ch.y;
            else {
                for (;;) {
                    if (sp == 0) { cur = 0x7fffffff; break; }
                    --sp; cur = stN[sp];
                    if (ANY || stT[sp] <= best) break;
                }
                if (cur == 0x7fffffff) break;
            }
        } else {
            int v = -cur - 1; int start = v >> 4, cnt = v & 15;
#ifdef UNR1
#pragma unroll 1
#endif
            for (int j = 0; j < cnt; j++) {
                const float4* rp = recs + 4 * (start + j);
                float4 v0 = rp[0], e1 = rp[1], e2 = rp[2];
                float px = dy * e2.z - dz * e2.y, py = dz * e2.x - dx * e2.z, pz = dx * e2.y - dy * e2.x;
                float det = e1.x * px + e1.y * py + e1.z * pz;
                if (fabsf(det) < 1e-10f) continue;
                float inv = __fdividef(1.f, det);
                float sx = ox - v0.x, sy = oy - v0.y, sz = oz - v0.z;
                float u = (sx * px + sy * py + sz * pz) * inv;
                if (u < 0.f || u > 1.f) continue;
                float qx = sy * e1.z - sz * e1.y, qy = sz * e1.x - sx * e1.z, qz = sx * e1.y - sy * e1.x;
                float vv = (dx * qx + dy * qy + dz * qz) * inv;
                if (vv < 0.f || u + vv > 1.f) continue;
                float d = (e2.x * qx + e2.y * qy + e2.z * qz) * inv;
                if (d <= 0.0002f || d >= best) continue;
                best = d; bid = start + j;
                if (ANY) { tout = d; idout = bid; return true; }
            }
            for (;;) {
                if (sp == 0) { cur = 0x7fffffff; break; }
                --sp; cur = stN[sp];
                if (ANY || stT[sp] <= best) break;
            }
            if (cur == 0x7fffffff) break;
        }
    }
    tout = best; idout = bid;
    return bid >= 0;
}

// ---- per-pixel candidate list for primary rays
// Collect every triangle whose AABB (inflated by delta) is crossed by the pixel's centre ray within [0,tmaxR].
// Any sample ray of the pixel that hits a triangle at t<=Tcov passes through that inflated AABB, so the list
// contains every triangle that could be its (or an earlier) hit.
__device__ __forceinline__ int collect_candidates(const float4* __restrict__ nodes, const float4* __restrict__ recs,
    float ox, float oy, float oz, float dx, float dy, float dz, float tmaxR, float delta, int* L, int kmax) {
    float ix = 1.f / (fabsf(dx) < 1e-20f ? copysignf(1e-20f, dx) : dx);
    float iy = 1.f / (fabsf(dy) < 1e-20f ? copysignf(1e-20f, dy) : dy);
    float iz = 1.f / (fabsf(dz) < 1e-20f ? copysignf(1e-20f, dz) : dz);
    float oix = ox * ix, oiy = oy * iy, oiz = oz * iz;
    float aix = fabsf(ix), aiy = fabsf(iy), aiz = fabsf(iz);
    float dax = delta * aix, day = delta * aiy, daz = delta * aiz;
    const float delta2 = delta * 1.02f + 2e-5f;
    // orthonormal basis perpendicular to d
    float ax_ = fabsf(dx) > 0.9f ? 0.f : 1.f, ay_ = fabsf(dx) > 0.9f ? 1.f : 0.f;
    float b1x = dy * 0.f - dz * ay_, b1y = dz * ax_ - dx * 0.f, b1z = dx * ay_ - dy * ax_;
    float b1n = rsqrtf(b1x * b1x + b1y * b1y + b1z * b1z); b1x *= b1n; b1y *= b1n; b1z *= b1n;
    float b2x = dy * b1z - dz * b1y, b2y = dz * b1x - dx * b1z, b2z = dx * b1y - dy * b1x;
    int stN[STK]; int sp = 0, cur = 0, cnt = 0;
    for (;;) {
        if (cur >= 0) {
            const float4* np = nodes + 4 * cur;
            float4 a = np[0], b = np[1], c = np[2]; int4 ch = ((const int4*)np)[3];
            float mx = fmaf(a.x, ix, -oix), ex = fmaf(a.w, aix, dax);
            float my = fmaf(a.y, iy, -oiy), ey = fmaf(b.x, aiy, day);
            float mz = fmaf(a.z, iz, -oiz), ez = fmaf(b.y, aiz, daz);
            bool hL = fmaxf(fmaxf(mx - ex, my - ey), fmaxf(mz - ez, 0.f)) <= fminf(fminf(mx + ex, my + ey), fminf(mz + ez, tmaxR));
            mx = fmaf(b.z, ix, -oix); ex = fmaf(c.y, aix, dax);
            my = fmaf(b.w, iy, -oiy); ey = fmaf(c.z, aiy, day);
            mz = fmaf(c.x, iz, -oiz); ez = fmaf(c.w, aiz, daz);
            bool hR = fmaxf(fmaxf(mx - ex, my - ey), fmaxf(mz - ez, 0.f)) <= fminf(fminf(mx + ex, my + ey), fminf(mz + ez, tmaxR));
            if (hL && hR) { stN[sp++] = ch.y; cur = ch.x; }
            else if (hL) cur = ch.x;
            else if (hR) cur = ch.y;
            else { if (sp == 0) break; cur = stN[--sp]; }
        } else {
            int v = -cur - 1; int start = v >> 4, n = v & 15;
            for (int j = 0; j < n; j++) {
                const float4* rp = recs + 4 * (start + j);
                float4 v0 = rp[0], e1 = rp[1], e2 = rp[2];
                float x1 = v0.x + e1.x, x2 = v0.x + e2.x, y1 = v0.y + e1.y, y2 = v0.y + e2.y, z1 = v0.z + e1.z, z2 = v0.z + e2.z;
                float lx = fminf(v0.x, fminf(x1, x2)), hx = fmaxf(v0.x, fmaxf(x1, x2));
                float ly = fminf(v0.y, fminf(y1, y2)), hy = fmaxf(v0.y, fmaxf(y1, y2));
                float lz = fminf(v0.z, fminf(z1, z2)), hz = fmaxf(v0.z, fmaxf(z1, z2));
                float mx = fmaf(0.5f * (lx + hx), ix, -oix), ex = fmaf(0.5f * (hx - lx), aix, dax);
                float my = fmaf(0.5f * (ly + hy), iy, -oiy), ey = fmaf(0.5f * (hy - ly), aiy, day);
                float mz = fmaf(0.5f * (lz + hz), iz, -oiz), ez = fmaf(0.5f * (hz - lz), aiz, daz);
                if (fmaxf(fmaxf(mx - ex, my - ey), fmaxf(mz - ez, 0.f)) <= fminf(fminf(mx + ex, my + ey), fminf(mz + ez, tmaxR))) {
                    // precise test: does the tube of radius delta around the ray reach this triangle?
                    float rx0 = v0.x - ox, ry0 = v0.y - oy, rz0 = v0.z - oz;
                    float rx1 = rx0 + e1.x, ry1 = ry0 + e1.y, rz1 = rz0 + e1.z;
                    float rx2 = rx0 + e2.x, ry2 = ry0 + e2.y, rz2 = rz0 + e2.z;
                    float t0 = rx0 * dx + ry0 * dy + rz0 * dz, t1 = rx1 * dx + ry1 * dy + rz1 * dz, t2 = rx2 * dx + ry2 * dy + rz2 * dz;
                    float tlo = fminf(t0, fminf(t1, t2)), thi = fmaxf(t0, fmaxf(t1, t2));
                    if (thi < -delta2 || tlo > tmaxR + delta2) continue;
                    float x0 = rx0 * b1x + ry0 * b1y + rz0 * b1z, y0 = rx0 * b2x + ry0 * b2y + rz0 * b2z;
                    float x1_ = rx1 * b1x + ry1 * b1y + rz1 * b1z, y1_ = rx1 * b2x + ry1 * b2y + rz1 * b2z;
                    float x2_ = rx2 * b1x + ry2 * b1y + rz2 * b1z, y2_ = rx2 * b2x + ry2 * b2y + rz2 * b2z;
                    float area = (x1_ - x0) * (y2_ - y0) - (x2_ - x0) * (y1_ - y0);
                    if (fabsf(area) > 1e-12f) {
                        float sg = area > 0.f ? 1.f : -1.f;
                        float ax = x1_ - x0, ay = y1_ - y0, bx = x2_ - x1_, by = y2_ - y1_, cx2 = x0 - x2_, cy2 = y0 - y2_;
                        if (sg * (ay * x0 - ax * y0) < -delta2 * sqrtf(ax * ax + ay * ay)) continue;
                        if (sg * (by * x1_ - bx * y1_) < -delta2 * sqrtf(bx * bx + by * by)) continue;
                        if (sg * (cy2 * x2_ - cx2 * y2_) < -delta2 * sqrtf(cx2 * cx2 + cy2 * cy2)) continue;
                    }
                    if (cnt >= kmax) return -1;
                    L[cnt++] = start + j;
                }
            }
            if (sp == 0) break;
            cur = stN[--sp];
        }
    }
    return cnt;
}

__global__ void __launch_bounds__(128) prepass_kernel(Params P) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    const Scene& s = P.s;
    if (idx >= s.width * s.height) return;
    int px = idx % s.width, py = idx / s.width;
    float xa = float(px) / float(s.width) * 2.f - 1.f, xb = float(px + 1) / float(s.width) * 2.f - 1.f, xc = (float(px) + .5f) / float(s.width) * 2.f - 1.f;
    float yb = 1.f - float(py) / float(s.height) * 2.f, ya = 1.f - float(py + 1) / float(s.height) * 2.f, yc = 1.f - (float(py) + .5f) / float(s.height) * 2.f;
    V<float> w(s.w), u(s.u), v(s.v);
    V<float> dc = (w + u * xc + v * yc).unit();
    float dev = 0.f;
    V<float> c0 = (w + u * xa + v * ya).unit() - dc, c1 = (w + u * xb + v * ya).unit() - dc, c2 = (w + u * xa + v * yb).unit() - dc, c3 = (w + u * xb + v * yb).unit() - dc;
    dev = fmaxf(fmaxf(sqrtf(c0.dot(c0)), sqrtf(c1.dot(c1))), fmaxf(sqrtf(c2.dot(c2)), sqrtf(c3.dot(c3))));
    float kappa = dev * 1.15f + 2e-6f;
    float tc; int idc;
    bool h = trace_ray<false>(P.nodes, P.recs, s.eye[0], s.eye[1], s.eye[2], dc.x, dc.y, dc.z, 1e20f, tc, idc);
    float Tcov = h ? tc * 1.05f + 1e-3f : SKYCOV;
    float delta = kappa * Tcov + 3e-4f;
    int* L = P.cand + (size_t)idx * LSTRIDE;
    L[KMAX] = collect_candidates(P.nodes, P.recs, s.eye[0], s.eye[1], s.eye[2], dc.x, dc.y, dc.z, Tcov + 2.f * delta, delta, L, KMAX);
    L[KMAX + 1] = __float_as_int(Tcov);
    int* S = L + SOFF;
    S[SKMAX] = -1;
    if (h) {
        float4 e1 = P.recs[4 * idc + 1], e2 = P.recs[4 * idc + 2];
        V<float> n = V<float>(e1.x, e1.y, e1.z).cross(V<float>(e2.x, e2.y, e2.z)).unit();
        if (n.dot(dc) > 0) n = n * -1.f;
        V<float> pc = V<float>(s.eye) + dc * tc + n * .001f;
        V<float> lt = V<float>(s.light).unit();
        float rho = RHO_MULT * kappa * tc + 2e-3f;
        int c2 = collect_candidates(P.nodes, P.recs, pc.x, pc.y, pc.z, lt.x, lt.y, lt.z, 1e10f, rho, S, SKMAX);
        S[SKMAX + 1] = __float_as_int(pc.x); S[SKMAX + 2] = __float_as_int(pc.y); S[SKMAX + 3] = __float_as_int(pc.z); S[SKMAX + 4] = __float_as_int(rho * rho);
        S[SKMAX] = c2;
    }
}

// ---- any-hit queries, bottom-up from the leaf that contains the ray's origin triangle
struct RayD { float ox, oy, oz, dx, dy, dz, ix, iy, iz, oix, oiy, oiz, aix, aiy, aiz; };
__device__ __forceinline__ RayD make_rayd(float ox, float oy, float oz, float dx, float dy, float dz) {
    RayD r; r.ox = ox; r.oy = oy; r.oz = oz; r.dx = dx; r.dy = dy; r.dz = dz;
    r.ix = 1.f / (fabsf(dx) < 1e-20f ? copysignf(1e-20f, dx) : dx);
    r.iy = 1.f / (fabsf(dy) < 1e-20f ? copysignf(1e-20f, dy) : dy);
    r.iz = 1.f / (fabsf(dz) < 1e-20f ? copysignf(1e-20f, dz) : dz);
    r.oix = ox * r.ix; r.oiy = oy * r.iy; r.oiz = oz * r.iz;
    r.aix = fabsf(r.ix); r.aiy = fabsf(r.iy); r.aiz = fabsf(r.iz);
    return r;
}
__device__ __forceinline__ bool leaf_any(const float4* __restrict__ recs, int code, const RayD& r, float tmax) {
    int v = -code - 1; int start = v >> 4, cnt = v & 15;
    for (int j = 0; j < cnt; j++) {
        const float4* rp = recs + 4 * (start + j);
        float4 v0 = rp[0], e1 = rp[1], e2 = rp[2];
        float px = r.dy * e2.z - r.dz * e2.y, py = r.dz * e2.x - r.dx * e2.z, pz = r.dx * e2.y - r.dy * e2.x;
        float det = e1.x * px + e1.y * py + e1.z * pz;
        if (fabsf(det) < 1e-10f) continue;
        float inv = __fdividef(1.f, det);
        float sx = r.ox - v0.x, sy = r.oy - v0.y, sz = r.oz - v0.z;
        float u = (sx * px + sy * py + sz * pz) * inv;
        if (u < 0.f || u > 1.f) continue;
        float qx = sy * e1.z - sz * e1.y, qy = sz * e1.x - sx * e1.z, qz = sx * e1.y - sy * e1.x;
        float vv = (r.dx * qx + r.dy * qy + r.dz * qz) * inv;
        if (vv < 0.f || u + vv > 1.f) continue;
        float d = (e2.x * qx + e2.y * qy + e2.z * qz) * inv;
        if (d <= 0.0002f || d >= tmax) continue;
        return true;
    }
    return false;
}
// top-down any-hit inside the subtree `code` (inner node index or leaf code); its own box was already tested
__device__ __forceinline__ bool sub_any(const float4* __restrict__ nodes, const float4* __restrict__ recs, int code, const RayD& r, float tmax) {
    if (code < 0) return leaf_any(recs, code, r, tmax);
    int stN[STK]; int sp = 0, cur = code;
    for (;;) {
        if (cur >= 0) {
            const float4* np = nodes + 4 * cur;
            float4 a = np[0], b = np[1], c = np[2]; int4 ch = ((const int4*)np)[3];
            float mx = fmaf(a.x, r.ix, -r.oix), ex = a.w * r.aix;
            float my = fmaf(a.y, r.iy, -r.oiy), ey = b.x * r.aiy;
            float mz = fmaf(a.z, r.iz, -r.oiz), ez = b.y * r.aiz;
            float t0L = fmaxf(fmaxf(mx - ex, my - ey), fmaxf(mz - ez, 0.f));
            float t1L = fminf(fminf(mx + ex, my + ey), fminf(mz + ez, tmax));
            mx = fmaf(b.z, r.ix, -r.oix); ex = c.y * r.aix;
            my = fmaf(b.w, r.iy, -r.oiy); ey = c.z * r.aiy;
            mz = fmaf(c.x, r.iz, -r.oiz); ez = c.w * r.aiz;
            float t0R = fmaxf(fmaxf(mx - ex, my - ey), fmaxf(mz - ez, 0.f));
            float t1R = fminf(fminf(mx + ex, my + ey), fminf(mz + ez, tmax));
            bool hL = t0L <= t1L, hR = t0R <= t1R;
            if (hL && hR) {
                if (t0L <= t0R) { stN[sp++] = ch.y; cur = ch.x; }
                else { stN[sp++] = ch.x; cur = ch.y; }
            } else if (hL) cur = ch.x;
            else if (hR) cur = ch.y;
            else {
                if (sp == 0) return false;
                cur = stN[--sp];
            }
        } else {
            if (leaf_any(recs, cur, r, tmax)) return true;
            if (sp == 0) return false;
            cur = stN[--sp];
        }
    }
}
__device__ __forceinline__ bool occluded_up(const float4* __restrict__ nodes, const float4* __restrict__ recs, int orec,
    float ox, float oy, float oz, float dx, float dy, float dz, float tmax) {
    RayD r = make_rayd(ox, oy, oz, dx, dy, dz);
    int pi = __float_as_int(recs[4 * orec].w);
    int node = pi >> 1, side = pi & 1;
    const float4* np = nodes + 4 * node;
    int4 ch = ((const int4*)np)[3];
    if (leaf_any(recs, side ? ch.y : ch.x, r, tmax)) return true;   // leaf holding the origin triangle
    for (;;) {
        float4 a = np[0], b = np[1], c = np[2];
        bool sr = (side == 0);   // sibling is the right child if we came from the left
        float cx = sr ? b.z : a.x, cy = sr ? b.w : a.y, cz = sr ? c.x : a.z;
        float hx = sr ? c.y : a.w, hy = sr ? c.z : b.x, hz = sr ? c.w : b.y;
        float mx = fmaf(cx, r.ix, -r.oix), ex = hx * r.aix;
        float my = fmaf(cy, r.iy, -r.oiy), ey = hy * r.aiy;
        float mz = fmaf(cz, r.iz, -r.oiz), ez = hz * r.aiz;
        float t0 = fmaxf(fmaxf(mx - ex, my - ey), fmaxf(mz - ez, 0.f));
        float t1 = fminf(fminf(mx + ex, my + ey), fminf(mz + ez, tmax));
        if (t0 <= t1) { if (sub_any(nodes, recs, sr ? ch.y : ch.x, r, tmax)) return true; }
        int par = ch.z; if (par < 0) return false;
        side = ch.w; node = par; np = nodes + 4 * node; ch = ((const int4*)np)[3];
    }
}

__device__ __forceinline__ V<float> radiance_sample(const Params& P, int pixel, int sid) {
    const Scene& s = P.s;
    Ray<float> r = camera<float>(s, pixel, sid);
    V<float> result, through(1.f, 1.f, 1.f);
    V<float> l = V<float>(s.light).unit();
    for (int depth = 0; depth < s.max_depth; depth++) {
        float t; int id; bool h; bool done = false;
        if (depth == 0 && P.use_cand) {
            const int* L = P.cand + (size_t)pixel * LSTRIDE;
            int cc = L[KMAX];
#ifdef CSTATS
            atomicAdd(&g_cs[0], 1ull); if (cc >= 0) { atomicAdd(&g_cs[1], 1ull); atomicAdd(&g_cs[2], (unsigned long long)cc); }
#endif
            if (cc >= 0) {
                float Tcov = __int_as_float(L[KMAX + 1]);
                float best = 1e20f; int bid = -1;
                for (int i = 0; i < cc; i++) {
                    int k = L[i];
                    float4 v0 = P.recs[4 * k], e1 = P.recs[4 * k + 1], e2 = P.recs[4 * k + 2];
                    float dx = r.d.x, dy = r.d.y, dz = r.d.z;
                    float px = dy * e2.z - dz * e2.y, py = dz * e2.x - dx * e2.z, pz = dx * e2.y - dy * e2.x;
                    float det = e1.x * px + e1.y * py + e1.z * pz;
                    if (fabsf(det) < 1e-10f) continue;
                    float inv = __fdividef(1.f, det);
                    float sx = r.o.x - v0.x, sy = r.o.y - v0.y, sz = r.o.z - v0.z;
                    float u = (sx * px + sy * py + sz * pz) * inv;
                    if (u < 0.f || u > 1.f) continue;
                    float qx = sy * e1.z - sz * e1.y, qy = sz * e1.x - sx * e1.z, qz = sx * e1.y - sy * e1.x;
                    float vv = (dx * qx + dy * qy + dz * qz) * inv;
                    if (vv < 0.f || u + vv > 1.f) continue;
                    float d = (e2.x * qx + e2.y * qy + e2.z * qz) * inv;
                    if (d <= 0.0002f || d >= best) continue;
                    best = d; bid = k;
                }
                if (bid >= 0 ? (best <= Tcov) : (Tcov >= SKYT)) { done = true; h = bid >= 0; t = best; id = bid;
#ifdef CSTATS
                    atomicAdd(&g_cs[3], 1ull);
#endif
                }
            }
        }
#ifdef SKIPFB
        if (!done && depth == 0 && P.use_cand) break;
#endif
        if (!done) h = trace_ray<false>(P.nodes, P.recs, r.o.x, r.o.y, r.o.z, r.d.x, r.d.y, r.d.z, 1e20f, t, id);
        if (!h) { result = result + through * sky(r.d); break; }
        float4 e1 = P.recs[4 * id + 1], e2 = P.recs[4 * id + 2], cm = P.recs[4 * id + 3];
        V<float> n = V<float>(e1.x, e1.y, e1.z).cross(V<float>(e2.x, e2.y, e2.z)).unit();
        if (n.dot(r.d) > 0) n = n * -1.f;
        V<float> p = r.o + r.d * t + n * .001f;
        float cosine = n.dot(l); if (cosine < 0) cosine = 0;
        float visible = 0.f;
        if (cosine > 0) {
            float tt; int ii; bool sdone = false, blocked = false;
            if (depth == 0 && P.use_cand) {
                const int* S = P.cand + (size_t)pixel * LSTRIDE + SOFF;
                int sc = S[SKMAX];
#ifdef CSTATS
                atomicAdd(&g_cs[4], 1ull); if (sc >= 0) atomicAdd(&g_cs[5], 1ull);
#endif
                if (sc >= 0) {
                    float pcx = __int_as_float(S[SKMAX + 1]) - p.x, pcy = __int_as_float(S[SKMAX + 2]) - p.y, pcz = __int_as_float(S[SKMAX + 3]) - p.z;
                    if (pcx * pcx + pcy * pcy + pcz * pcz <= __int_as_float(S[SKMAX + 4])) {
                        sdone = true;
#ifdef CSTATS
                        atomicAdd(&g_cs[6], 1ull); atomicAdd(&g_cs[7], (unsigned long long)sc);
#endif
                        float dx = l.x, dy = l.y, dz = l.z;
                        for (int i = 0; i < sc && !blocked; i++) {
                            int k = S[i];
                            float4 v0 = P.recs[4 * k], e1 = P.recs[4 * k + 1], e2 = P.recs[4 * k + 2];
                            float px = dy * e2.z - dz * e2.y, py = dz * e2.x - dx * e2.z, pz = dx * e2.y - dy * e2.x;
                            float det = e1.x * px + e1.y * py + e1.z * pz;
                            if (fabsf(det) < 1e-10f) continue;
                            float inv = __fdividef(1.f, det);
                            float sx = p.x - v0.x, sy = p.y - v0.y, sz = p.z - v0.z;
                            float u = (sx * px + sy * py + sz * pz) * inv;
                            if (u < 0.f || u > 1.f) continue;
                            float qx = sy * e1.z - sz * e1.y, qy = sz * e1.x - sx * e1.z, qz = sx * e1.y - sy * e1.x;
                            float vv = (dx * qx + dy * qy + dz * qz) * inv;
                            if (vv < 0.f || u + vv > 1.f) continue;
                            float d = (e2.x * qx + e2.y * qy + e2.z * qz) * inv;
                            if (d <= 0.0002f || d >= 1e20f) continue;
                            blocked = true;
                        }
                    }
                }
            }
#ifdef SKIPFB
            if (!sdone && depth == 0) { result = V<float>(0.f, 0.f, 0.f); break; }
#endif
            if (!sdone) blocked = trace_ray<true>(P.nodes, P.recs, p.x, p.y, p.z, l.x, l.y, l.z, 1e20f, tt, ii);
            visible = blocked ? 0.f : 1.f;
        }
        int open = 0;
        V<float> axis = fabsf(n.z) < .8f ? V<float>(0, 0, 1) : V<float>(0, 1, 0);
        V<float> tx = axis.cross(n).unit(), ty = n.cross(tx);
        for (int a = 0; a < s.ao; a++) {
            uint32_t key = s.seed + uint32_t(pixel) * 0x9e3779b9u + uint32_t(sid) * 0x85ebca6bu + uint32_t(depth) * 0xc2b2ae35u + uint32_t(a) * 0x27d4eb2du;
            float x = 2.f * sample<float>(key ^ 0x68bc21ebu) - 1.f, y = 2.f * sample<float>(key ^ 0x02e5be93u) - 1.f;
            float z = .25f + .75f * sample<float>(key ^ 0x967a889bu);
            V<float> dir = (tx * x + ty * y + n * z).unit();
            float tt; int ii;
#ifdef NO_AO
            open += 1;
#elif defined(UP_AO)
            open += !occluded_up(P.nodes, P.recs, id, p.x, p.y, p.z, dir.x, dir.y, dir.z, s.ao_radius);
#else
            open += !trace_ray<true>(P.nodes, P.recs, p.x, p.y, p.z, dir.x, dir.y, dir.z, s.ao_radius, tt, ii);
#endif
        }
        float ambient = s.ao ? float(open) / float(s.ao) : 1.f;
        float value = .08f + .20f * ambient + .72f * cosine * visible;
        float mirror = cm.w;
        result = result + through * V<float>(cm.x, cm.y, cm.z) * (value * (1.f - mirror));
        through = through * mirror;
        if (mirror == 0) break;
        r = { p, (r.d - n * (2.f * r.d.dot(n))).unit() };
    }
    return result;
}

__global__ void __launch_bounds__(BLK, LB_BLOCKS) trace_kernel(Params P, long long start) {
    long long i = start + (long long)blockIdx.x * blockDim.x + threadIdx.x;
    bool valid = i < P.total;
    int pixel = -1; V<float> c(0.f, 0.f, 0.f);
    if (valid) {
        pixel = int(i / P.s.spp); int sid = int(i - (long long)pixel * P.s.spp);
        c = radiance_sample(P, pixel, sid) * P.inv_spp;
    }
    // segmented warp reduction over lanes of equal pixel
    int lane = threadIdx.x & 31;
    float r = c.x, g = c.y, b = c.z; int pp = pixel;
#pragma unroll
    for (int off = 1; off < 32; off <<= 1) {
        float nr = __shfl_up_sync(0xffffffffu, r, off), ng = __shfl_up_sync(0xffffffffu, g, off), nb = __shfl_up_sync(0xffffffffu, b, off);
        int np = __shfl_up_sync(0xffffffffu, pp, off);
        if (lane >= off && np == pp) { r += nr; g += ng; b += nb; }
    }
    int nextp = __shfl_down_sync(0xffffffffu, pixel, 1);
    bool last = (lane == 31) || (nextp != pixel);
    if (valid && last) {
        atomicAdd(&P.out[3 * (size_t)pixel + 0], r);
        atomicAdd(&P.out[3 * (size_t)pixel + 1], g);
        atomicAdd(&P.out[3 * (size_t)pixel + 2], b);
    }
}

// ---------------------------------------------------------------- host API
static void alloc_cap(int mt) {
    if (mt <= g_cap) return;
    if (h_nodes) { cudaFreeHost(h_nodes); cudaFreeHost(h_recs); cudaFree(d_nodes); cudaFree(d_recs); free(h_P); }
    size_t n = size_t(mt);
    CK(cudaMallocHost(&h_nodes, n * sizeof(GNode))); CK(cudaMallocHost(&h_recs, n * sizeof(GRec)));
    CK(cudaMalloc(&d_nodes, n * sizeof(GNode))); CK(cudaMalloc(&d_recs, n * sizeof(GRec)));
    h_P = (BP*)malloc(n * sizeof(BP));
    memset(h_nodes, 0, n * sizeof(GNode)); memset(h_recs, 0, n * sizeof(GRec)); memset(h_P, 0, n * sizeof(BP));
    g_cap = mt;
}

static int* d_cand = nullptr; static size_t g_cand_px = 0;
static void alloc_cand(size_t npix) {
    if (npix <= g_cand_px) return;
    if (d_cand) cudaFree(d_cand);
    CK(cudaMalloc(&d_cand, npix * LSTRIDE * sizeof(int)));
    g_cand_px = npix;
}

void init(int max_triangles, int max_pixels, int max_samples) {
    (void)max_samples;
    alloc_cap(std::max(max_triangles, 1));
    alloc_cand(size_t(std::max(max_pixels, 1)));
    CK(cudaFree(0));
}

void render(const Scene& s, float* out) {
#ifdef TIMING
    g_t0 = nowms();
#endif
    int N = s.triangle_count;
    alloc_cap(N);
    size_t npix = size_t(s.width) * s.height;
    CK(cudaMemsetAsync(out, 0, npix * 3 * sizeof(float)));
    Pool pool; g_pool = &pool; pool.start(N >= 20000 ? NTHREADS - 1 : 0);
    // build
    const Triangle* T = s.triangles;
    const int CH = 8192; int nch = (N + CH - 1) / CH;
    std::vector<Acc> accs(nch);
    pfor(N, CH, [&](int b, int e) {
        Acc a; a.init();
        for (int i = b; i < e; i++) {
            const Triangle& t = T[i]; BP& p = h_P[i];
            for (int k = 0; k < 3; k++) { p.lo[k] = std::min(t.v0[k], std::min(t.v1[k], t.v2[k])); p.hi[k] = std::max(t.v0[k], std::max(t.v1[k], t.v2[k])); }
            p.id = i; a.add(p);
        }
        accs[b / CH] = a;
    });
    Acc root; root.init(); for (auto& a : accs) root.merge(a);
    TM("bounds");
    int nslots;
    Builder bld; bld.P = h_P; bld.nodes = h_nodes; bld.T = T; bld.recs = h_recs;
    if (N == 1) {
        GNode n; const BP& p = h_P[0]; const float pad = 2e-5f;
        pack_node(n, p.lo, p.hi, p.lo, p.hi, pad);
        int code = bld.make_leaf(0, 1);
        n.ch = make_int4(code, code, -1, 0);
        h_nodes[0] = n; nslots = 1;
        bld.set_parent(code, 0, 0);
    } else {
        bld.build(0, N, 0, 0, root);
#if defined(UP_AO) || defined(UP_SH)
        h_nodes[0].ch.z = -1; h_nodes[0].ch.w = 0;
#endif
        nslots = N - 1;
    }
    TM("tree");
#ifdef PROF
    fprintf(stderr,"  prof leaf %.2f bin %.2f part %.2f\n",g_leaf,g_bin,g_part); g_leaf=g_bin=g_part=0;
#endif
    CK(cudaMemcpyAsync(d_nodes, h_nodes, size_t(nslots) * sizeof(GNode), cudaMemcpyHostToDevice));
    CK(cudaMemcpyAsync(d_recs, h_recs, size_t(N) * sizeof(GRec), cudaMemcpyHostToDevice));
    Params P; P.s = s; P.s.triangles = nullptr; P.nodes = (const float4*)d_nodes; P.recs = (const float4*)d_recs; P.out = out;
    P.total = (long long)npix * s.spp; P.inv_spp = 1.0f / float(s.spp);
    P.use_cand = (s.spp >= CAND_MIN_SPP) ? 1 : 0;
    if (P.use_cand) {
        alloc_cand(npix); P.cand = d_cand;
        prepass_kernel<<<(unsigned)((npix + 127) / 128), 128>>>(P);
    } else P.cand = nullptr;
    double perSample = double(2 + s.ao) * double(s.max_depth);
    long long chunk = (long long)std::max(262144.0, std::min(1.0e9, 3.0e8 / perSample));
    chunk = (chunk + BLK - 1) / BLK * BLK;
    for (long long st = 0; st < P.total; st += chunk) {
        long long cnt = std::min(chunk, P.total - st);
        trace_kernel<<<(unsigned)((cnt + BLK - 1) / BLK), BLK>>>(P, st);
    }
    CK(cudaGetLastError());
    TM("launched");
    pool.finish(); g_pool = nullptr;   // thread teardown overlaps with GPU execution
    TM("joined");
#ifdef TIMING
    CK(cudaDeviceSynchronize()); TM("gpu done");
#ifdef CSTATS
    { unsigned long long h[8]; CK(cudaMemcpyFromSymbol(h, g_cs, sizeof(h)));
      fprintf(stderr, "  cand: samples %llu list_ok %llu (avg len %.2f) certified %llu\n", h[0], h[1], double(h[2]) / double(h[1] + 1), h[3]);
      fprintf(stderr, "  shadow: samples %llu list_ok %llu used %llu (avg len %.2f)\n", h[4], h[5], h[6], double(h[7]) / double(h[6] + 1));
      unsigned long long z[8] = {}; CK(cudaMemcpyToSymbol(g_cs, z, sizeof(z))); }
#endif
#endif
}

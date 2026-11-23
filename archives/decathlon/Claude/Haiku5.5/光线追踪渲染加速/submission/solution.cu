// GPU path renderer for the garden scene contract (rt.h / render_math.cuh).
// Host: binned-SAH BVH (multi-threaded build), flattened into 16-byte aligned two-child nodes,
//       triangles stored in leaf order (precomputed edges + material, 16-byte aligned).
// Device: wavefront-style stages per sample pass. Each pass runs
//       gen -> { closest -> shade } x max_depth -> commit, one thread per pixel with
//       an active flag, so each kernel has uniform control flow apart from traversal.
//       Accumulation order matches the baseline (sum over samples in increasing order,
//       then divide by spp); per-pixel depth order is preserved, so output is deterministic.
// Default: monolithic per-pixel path kernel (fastest measured here).
// Define SOL_PERSIST to use the persistent-thread query pipeline instead (for comparison).
#ifndef SOL_PERSIST
#define SOL_MONO 1
#endif
#include "render_math.cuh"
#include <cuda_runtime.h>
#include <algorithm>
#include <atomic>
#include <cstdio>
#include <cstdlib>
#include <thread>
#include <vector>

// Child slots: c.y/c.w (n) > 0 leaf (ref=first triangle, n=count); n == 0 inner (ref=node index); n == -1 unused.
// c = (r0, n0, r1, n1). Boxes are xyz; w unused.
// Quantized two-child node (48 bytes). Child boxes are 16-bit values on a grid anchored at the
// root box (conservative: lo rounded down, hi rounded up, plus a 2-step margin).
//   a = (c0.lo.x|c0.lo.y<<16, c0.lo.z|c0.hi.x<<16, c0.hi.y|c0.hi.z<<16, c1 word 0)
//   b = (c1 word 1, c1 word 2, ref0, cnt0)     c = (ref1, cnt1, 0, 0)
// cnt > 0: leaf (ref = first triangle); cnt == 0: inner (ref = node index); cnt == -1: unused.
struct alignas(16) GNode { uint4 a, b, c; };
struct alignas(16) TriPre { float4 v0, e1, e2; };   // xyz used
struct alignas(16) Mat { float4 cm; };              // xyz = color, w = mirror
struct Dev { const GNode* nodes; const TriPre* pre; const Mat* mat; float4 rootLo, step, invStep; };
// Per-pixel path state for the current pass (indexed by pixel).
struct State { float *O, *D, *T, *R, *HT, *CS; int* HI; unsigned char* A; };

static void ck(cudaError_t e, const char* what) {
    if (e != cudaSuccess) { fprintf(stderr, "solution: %s: %s\n", what, cudaGetErrorString(e)); exit(2); }
}

// ---------------------------------------------------------------- host: builder
namespace {
#ifndef SOL_BINS
#define SOL_BINS 16
#endif
constexpr int BINS = SOL_BINS;
#ifndef SOL_CT
#define SOL_CT 1.0f      // SAH traversal cost relative to one triangle test
#endif
// Cost-breakdown switches (timing experiments only; they change the image):
#ifdef SOL_ABL_AO
#define ABL_AO_MUL 0
#else
#define ABL_AO_MUL 1
#endif
#ifdef SOL_ABL_SH
#define ABL_SH_ON 0
#else
#define ABL_SH_ON 1
#endif
// Work counters (measurement builds only): 0 tri tests, 1 box tests, 2 closest queries,
// 3 any-hit queries, 4 closest pops, 5 any-hit pops.
#ifdef SOL_COUNT
__device__ unsigned long long g_stat[8];
#define STAT(k) atomicAdd(&g_stat[(k)], 1ull)
#else
#define STAT(k) ((void)0)
#endif
#ifndef SOL_LEAF
#define SOL_LEAF 8       // leaf size threshold
#endif
struct BNode { float lo[3], hi[3]; int left, right, start, count; };

struct Builder {
    const Triangle* T; int N;
    std::vector<float> lo, hi, cen;
    std::vector<int> order;
    std::vector<BNode> nodes;
    std::atomic<int> next;

    static float area(const float* a, const float* b) {
        float x = b[0] - a[0], y = b[1] - a[1], z = b[2] - a[2];
        return x * y + y * z + z * x;
    }

    explicit Builder(const Scene& s) : T(s.triangles), N(s.triangle_count) {
        lo.resize(3 * size_t(N)); hi.resize(3 * size_t(N)); cen.resize(3 * size_t(N)); order.resize(N);
        for (int i = 0; i < N; i++) {
            const Triangle& t = T[i];
            for (int k = 0; k < 3; k++) {
                float a = t.v0[k], b = t.v1[k], c = t.v2[k];
                lo[3 * i + k] = std::min(a, std::min(b, c));
                hi[3 * i + k] = std::max(a, std::max(b, c));
                cen[3 * i + k] = (lo[3 * i + k] + hi[3 * i + k]) * .5f;
            }
            order[i] = i;
        }
        nodes.resize(2 * size_t(N) + 1);
        next = 0;
        build(0, N, 0);
        nodes.resize(next.load());
    }

    int build(int b, int e, int depth) {
        BNode n{};
        float clo[3], chi[3];
        for (int k = 0; k < 3; k++) { n.lo[k] = clo[k] = 1e30f; n.hi[k] = chi[k] = -1e30f; }
        for (int i = b; i < e; i++) {
            int t = order[i];
            for (int k = 0; k < 3; k++) {
                n.lo[k] = std::min(n.lo[k], lo[3 * t + k]);
                n.hi[k] = std::max(n.hi[k], hi[3 * t + k]);
                clo[k] = std::min(clo[k], cen[3 * t + k]);
                chi[k] = std::max(chi[k], cen[3 * t + k]);
            }
        }
        n.start = b; n.count = e - b; n.left = n.right = -1;
        int id = next++;
        nodes[id] = n;
        int cnt = e - b;
        if (cnt <= 2 || depth >= 60) return id;
        float best = 1e30f;
        int bestAxis = -1, bestBin = 0;
        for (int k = 0; k < 3; k++) {
            float ext = chi[k] - clo[k];
            if (ext < 1e-9f) continue;
            int bc[BINS] = {};
            float blo[BINS][3], bhi[BINS][3];
            for (int j = 0; j < BINS; j++) for (int q = 0; q < 3; q++) { blo[j][q] = 1e30f; bhi[j][q] = -1e30f; }
            float scale = BINS / ext * (1 - 1e-6f);
            for (int i = b; i < e; i++) {
                int t = order[i];
                int j = std::min(BINS - 1, int((cen[3 * t + k] - clo[k]) * scale));
                bc[j]++;
                for (int q = 0; q < 3; q++) {
                    blo[j][q] = std::min(blo[j][q], lo[3 * t + q]);
                    bhi[j][q] = std::max(bhi[j][q], hi[3 * t + q]);
                }
            }
            float rarea[BINS]; int rcnt[BINS];
            float alo[3] = {1e30f, 1e30f, 1e30f}, ahi[3] = {-1e30f, -1e30f, -1e30f};
            int ac = 0;
            for (int j = BINS - 1; j > 0; j--) {
                ac += bc[j];
                for (int q = 0; q < 3; q++) { alo[q] = std::min(alo[q], blo[j][q]); ahi[q] = std::max(ahi[q], bhi[j][q]); }
                rcnt[j] = ac;
                rarea[j] = ac ? area(alo, ahi) : 0;
            }
            for (int q = 0; q < 3; q++) { alo[q] = 1e30f; ahi[q] = -1e30f; }
            ac = 0;
            for (int j = 1; j < BINS; j++) {
                ac += bc[j - 1];
                for (int q = 0; q < 3; q++) { alo[q] = std::min(alo[q], blo[j - 1][q]); ahi[q] = std::max(ahi[q], bhi[j - 1][q]); }
                if (!ac || !rcnt[j]) continue;
                float c = area(alo, ahi) * ac + rarea[j] * rcnt[j];
                if (c < best) { best = c; bestAxis = k; bestBin = j; }
            }
        }
        float parentArea = area(n.lo, n.hi);
        float splitCost = float(SOL_CT) + (parentArea > 0 ? best / parentArea : float(cnt));
        if (cnt <= SOL_LEAF && float(cnt) <= splitCost) return id;
        int mid = -1;
        if (bestAxis >= 0) {
            int k = bestAxis;
            float ext = chi[k] - clo[k], scale = BINS / ext * (1 - 1e-6f), c0 = clo[k];
            mid = int(std::partition(order.begin() + b, order.begin() + e, [&](int t) {
                return std::min(BINS - 1, int((cen[3 * t + k] - c0) * scale)) < bestBin;
            }) - order.begin());
        }
        if (mid <= b || mid >= e) {
            if (cnt <= 15) return id;
            int axis = 0;
            for (int k = 1; k < 3; k++) if (chi[k] - clo[k] > chi[axis] - clo[axis]) axis = k;
            mid = (b + e) / 2;
            std::nth_element(order.begin() + b, order.begin() + mid, order.begin() + e,
                             [&](int x, int y) { return cen[3 * x + axis] < cen[3 * y + axis]; });
        }
        int l, r;
        if (cnt > 8192) {
            std::thread th([&] { l = build(b, mid, depth + 1); });
            r = build(mid, e, depth + 1);
            th.join();
        } else {
            l = build(b, mid, depth + 1);
            r = build(mid, e, depth + 1);
        }
        nodes[id].left = l; nodes[id].right = r; nodes[id].count = 0;
        return id;
    }
};

struct ChildInfo { float lo[3], hi[3]; int ref, cnt; };
int g_cnt = 0;
GNode* h_nodes = nullptr;
float g_rootLo[3] = {0.f, 0.f, 0.f};
float g_step[3] = {1.f, 1.f, 1.f};

// Quantization grid: anchored at the root box lower corner; 65535 steps span the root extent.
void setQuantGrid(const float* lo, const float* hi) {
    for (int k = 0; k < 3; k++) {
        g_rootLo[k] = lo[k];
        float ext = std::max(hi[k] - lo[k], 1e-3f);
        g_step[k] = ext / 65535.f;
    }
}

static unsigned clampQ(double v) {
    if (v < 0) v = 0;
    if (v > 65535) v = 65535;
    return unsigned(v);
}

// Packs one child box into three words (lo.xy, lo.z|hi.x, hi.yz); see GNode layout.
static void packBox(const float* lo, const float* hi, unsigned* w) {
    unsigned q[6];
    for (int k = 0; k < 3; k++) {
        double a = (double(lo[k]) - g_rootLo[k]) / g_step[k];
        double b = (double(hi[k]) - g_rootLo[k]) / g_step[k];
        q[k] = clampQ(std::floor(a) - 2.0);
        q[3 + k] = clampQ(std::ceil(b) + 2.0);
    }
    w[0] = q[0] | (q[1] << 16);
    w[1] = q[2] | (q[3] << 16);
    w[2] = q[4] | (q[5] << 16);
}

ChildInfo childOf(const Builder& B, int oc);

int emitInner(const Builder& B, int old) {
    int id = g_cnt++;
    ChildInfo c0 = childOf(B, B.nodes[old].left);
    ChildInfo c1 = childOf(B, B.nodes[old].right);
    unsigned w0[3], w1[3];
    packBox(c0.lo, c0.hi, w0);
    packBox(c1.lo, c1.hi, w1);
    GNode& g = h_nodes[id];
    g.a = make_uint4(w0[0], w0[1], w0[2], w1[0]);
    g.b = make_uint4(w1[1], w1[2], (unsigned)c0.ref, (unsigned)c0.cnt);
    g.c = make_uint4((unsigned)c1.ref, (unsigned)c1.cnt, 0u, 0u);
    return id;
}

ChildInfo childOf(const Builder& B, int oc) {
    const BNode& n = B.nodes[oc];
    ChildInfo c;
    for (int k = 0; k < 3; k++) { c.lo[k] = n.lo[k]; c.hi[k] = n.hi[k]; }
    if (n.left < 0) { c.ref = n.start; c.cnt = n.count; }
    else { c.ref = emitInner(B, oc); c.cnt = 0; }
    return c;
}

// Artificial root at index 0: child 0 = real root, child 1 unused.
void layoutTree(const Builder& B) {
    g_cnt = 1;
    ChildInfo c0 = childOf(B, 0);
    ChildInfo c1{};
    c1.cnt = -1;
    unsigned w0[3], w1[3];
    packBox(c0.lo, c0.hi, w0);
    packBox(c1.lo, c1.hi, w1);
    GNode& g0 = h_nodes[0];
    g0.a = make_uint4(w0[0], w0[1], w0[2], w1[0]);
    g0.b = make_uint4(w1[1], w1[2], (unsigned)c0.ref, (unsigned)c0.cnt);
    g0.c = make_uint4((unsigned)c1.ref, (unsigned)c1.cnt, 0u, 0u);
}
} // namespace

// ---------------------------------------------------------------- device: traversal
__device__ __forceinline__ void unpackBox(unsigned w0, unsigned w1, unsigned w2, float* lo, float* hi) {
    lo[0] = float(w0 & 0xFFFFu); lo[1] = float(w0 >> 16); lo[2] = float(w1 & 0xFFFFu);
    hi[0] = float(w1 >> 16);     hi[1] = float(w2 & 0xFFFFu); hi[2] = float(w2 >> 16);
}

// Slab test in quantized ray space (the ray parameter t is unchanged by the transform).
__device__ __forceinline__ bool slabQ(const float* lo, const float* hi, const float* o, const float* inv, float tmax, float& tn) {
    STAT(1);
    float t0 = 0.f, t1 = tmax;
#pragma unroll
    for (int k = 0; k < 3; k++) {
        float a = (lo[k] - o[k]) * inv[k];
        float b = (hi[k] - o[k]) * inv[k];
        t0 = fmaxf(t0, fminf(a, b));
        t1 = fminf(t1, fmaxf(a, b));
    }
    tn = t0;
    return t0 <= t1;
}

// Ray origin and inverse direction in grid units: o' = (o - rootLo)/step, d' = d/step.
__device__ __forceinline__ void rayQuant(const Dev& D, const V<float>& ro, const V<float>& rd, float* o, float* inv) {
    const float rl[3] = {D.rootLo.x, D.rootLo.y, D.rootLo.z};
    const float is[3] = {D.invStep.x, D.invStep.y, D.invStep.z};
    const float ro3[3] = {ro.x, ro.y, ro.z}, rd3[3] = {rd.x, rd.y, rd.z};
#pragma unroll
    for (int k = 0; k < 3; k++) {
        o[k] = (ro3[k] - rl[k]) * is[k];
        float v = rd3[k] * is[k];
        if (fabsf(v) < 1e-30f) v = copysignf(1e-30f, v);
        inv[k] = 1.f / v;
    }
}

// Same arithmetic as render_math.cuh intersect<float>; e1/e2 precomputed identically.
__device__ __forceinline__ bool triHit(const TriPre& t, const V<float>& o, const V<float>& d, float limit, float& dist) {
    STAT(0);
#ifdef SOL_ABL_TRI
    if (limit > 0.f) return false;   // timing experiment only
#endif
    V<float> a(t.v0.x, t.v0.y, t.v0.z), e1(t.e1.x, t.e1.y, t.e1.z), e2(t.e2.x, t.e2.y, t.e2.z);
    V<float> p = d.cross(e2);
    float det = e1.dot(p);
    if (fabsf(det) < 1e-10f) return false;
    float inv = 1.f / det;
    V<float> s = o - a;
    float u = s.dot(p) * inv;
    if (u < 0.f || u > 1.f) return false;
    V<float> q = s.cross(e1);
    float v = d.dot(q) * inv;
    if (v < 0.f || u + v > 1.f) return false;
    float dd = e2.dot(q) * inv;
    if (dd <= 0.0002f || dd >= limit) return false;
    dist = dd;
    return true;
}

__device__ __forceinline__ void makeInv(const V<float>& d, float* inv) {
    float c[3] = {d.x, d.y, d.z};
#pragma unroll
    for (int k = 0; k < 3; k++) {
        float v = fabsf(c[k]) < 1e-30f ? copysignf(1e-30f, c[k]) : c[k];
        inv[k] = 1.f / v;
    }
}

// Single-array stack. An entry is code = parent*2 + slot, naming a child slot of node "parent".
// Popping re-tests that child's box against the current best, so no distance array is needed.
// Code 0 names the artificial root's slot 0, i.e. the real root.
__device__ Hit<float> closestHit(const Dev& D, const V<float>& ro, const V<float>& rd, float limit) {
    float o[3], inv[3];
    rayQuant(D, ro, rd, o, inv);
    STAT(2);
    int st[72];
    int sp = 0;
    st[sp++] = 0;   // code 0 = slot 0 of node 0 (the real root)
    float best = limit;
    int bestId = -1;
    while (sp > 0) {
        STAT(4);
        const int code = st[--sp];
        const GNode& P = D.nodes[code >> 1];
        const uint4 A = P.a, B = P.b, C = P.c;
        float lo[3], hi[3];
        int ref, cnt;
        if (code & 1) { unpackBox(A.w, B.x, B.y, lo, hi); ref = int(C.x); cnt = int(C.y); }
        else          { unpackBox(A.x, A.y, A.z, lo, hi); ref = int(B.z); cnt = int(B.w); }
        if (cnt == -1) continue;
        float tn;
#ifdef SOL_POPTEST
        if (!slabQ(lo, hi, o, inv, best, tn)) continue;
#else
        // Inner entries skip the pop-time re-test: their children are tested on expansion anyway.
        if (cnt > 0 && !slabQ(lo, hi, o, inv, best, tn)) continue;
#endif
        if (cnt > 0) {
            const int e = ref + cnt;
            for (int i = ref; i < e; i++) {
                float dd;
                if (triHit(D.pre[i], ro, rd, best, dd)) { best = dd; bestId = i; }
            }
            continue;
        }
        // Expand inner node 'ref': push its valid child slots, nearest entry last-in.
        const GNode& N = D.nodes[ref];
        float l0[3], h0[3], l1[3], h1[3];
        unpackBox(N.a.x, N.a.y, N.a.z, l0, h0);
        unpackBox(N.a.w, N.b.x, N.b.y, l1, h1);
        const int c0 = int(N.b.w), c1 = int(N.c.y);
        float t0 = 0.f, t1 = 0.f;
        const bool v0 = c0 != -1 && slabQ(l0, h0, o, inv, best, t0);
        const bool v1 = c1 != -1 && slabQ(l1, h1, o, inv, best, t1);
        if (v0 && v1) {
            if (t0 <= t1) { st[sp++] = ref * 2 + 1; st[sp++] = ref * 2; }
            else          { st[sp++] = ref * 2;     st[sp++] = ref * 2 + 1; }
        } else if (v0) {
            st[sp++] = ref * 2;
        } else if (v1) {
            st[sp++] = ref * 2 + 1;
        }
    }
    if (bestId < 0) return Hit<float>{limit, -1};
    return Hit<float>{best, bestId};
}

__device__ bool blockedQ(const Dev& D, const V<float>& ro, const V<float>& rd, float limit) {
    float o[3], inv[3];
    rayQuant(D, ro, rd, o, inv);
    STAT(3);
    int stk[64];
    int sp = 0;
    int node = 0;
    while (true) {
        STAT(5);
        const GNode& n = D.nodes[node];
        float l0[3], h0b[3], l1[3], h1b[3];
        unpackBox(n.a.x, n.a.y, n.a.z, l0, h0b);
        unpackBox(n.a.w, n.b.x, n.b.y, l1, h1b);
        const int r0 = int(n.b.z), c0 = int(n.b.w), r1 = int(n.c.x), c1 = int(n.c.y);
        float t0 = 0.f, t1 = 0.f;
        bool h0 = c0 != -1 && slabQ(l0, h0b, o, inv, limit, t0);
        bool h1 = c1 != -1 && slabQ(l1, h1b, o, inv, limit, t1);
        if (h0 && c0 > 0) {
            for (int i = r0; i < r0 + c0; i++) {
                float dd;
                if (triHit(D.pre[i], ro, rd, limit, dd)) return true;
            }
            h0 = false;
        }
        if (h1 && c1 > 0) {
            for (int i = r1; i < r1 + c1; i++) {
                float dd;
                if (triHit(D.pre[i], ro, rd, limit, dd)) return true;
            }
            h1 = false;
        }
        const bool i0 = h0 && c0 == 0;
        const bool i1 = h1 && c1 == 0;
        // Nearest child first: occluded rays find an occluder sooner (result is unchanged).
        if (i0 && i1) {
            if (t0 <= t1) { stk[sp++] = r1; node = r0; }
            else          { stk[sp++] = r0; node = r1; }
            continue;
        }
        if (i0) { node = r0; continue; }
        if (i1) { node = r1; continue; }
        if (sp == 0) return false;
        node = stk[--sp];
    }
}

// ---------------------------------------------------------------- device: wavefront stages
__device__ __forceinline__ V<float> ldv(const float* a, int p) { return V<float>(a + 3 * size_t(p)); }
__device__ __forceinline__ void stv(float* a, int p, const V<float>& v) {
    a[3 * size_t(p)] = v.x; a[3 * size_t(p) + 1] = v.y; a[3 * size_t(p) + 2] = v.z;
}

// Primary rays for this sample index (same camera and sample keys as render_math.cuh).
__global__ void __launch_bounds__(256) genKernel(Scene s, State S, int sid, int npix) {
    int p = blockIdx.x * blockDim.x + threadIdx.x;
    if (p >= npix) return;
    Ray<float> r = camera<float>(s, p, sid);
    stv(S.O, p, r.o);
    stv(S.D, p, r.d);
    stv(S.T, p, V<float>(1.f, 1.f, 1.f));
    stv(S.R, p, V<float>(0.f, 0.f, 0.f));
    S.A[p] = 1;
}

// Closest-hit stage: misses add sky and end the path; hits store t and triangle id.
__global__ void __launch_bounds__(256, 6) closestKernel(Dev D, State S, int npix) {
    int p = blockIdx.x * blockDim.x + threadIdx.x;
    if (p >= npix || !S.A[p]) return;
    V<float> ro = ldv(S.O, p), rd = ldv(S.D, p);
    Hit<float> h = closestHit(D, ro, rd, 1e20f);
    if (h.id < 0) {
        V<float> add = ldv(S.T, p) * sky<float>(rd);
        stv(S.R, p, ldv(S.R, p) + add);
        S.A[p] = 0;
        return;
    }
    S.HT[p] = h.t;
    S.HI[p] = h.id;
}

// Shading stage: mirrors render_math.cuh radiance<float> for one bounce.
__global__ void __launch_bounds__(256, 5) shadeKernel(Scene s, Dev D, State S, int sid, int depth, int npix) {
    int p = blockIdx.x * blockDim.x + threadIdx.x;
    if (p >= npix || !S.A[p]) return;
    const int id = S.HI[p];
    const float t = S.HT[p];
    V<float> ro = ldv(S.O, p), rd = ldv(S.D, p);
    V<float> through = ldv(S.T, p), result = ldv(S.R, p);
    const TriPre& tp = D.pre[id];
    const Mat& m = D.mat[id];
    V<float> n = V<float>(tp.e1.x, tp.e1.y, tp.e1.z).cross(V<float>(tp.e2.x, tp.e2.y, tp.e2.z)).unit();
    if (n.dot(rd) > 0) n = n * (-1.f);
    V<float> pos = ro + rd * t + n * 0.001f;
    V<float> l = V<float>(s.light).unit();
    float cosine = n.dot(l);
    if (cosine < 0) cosine = 0;
    float visible = (cosine > 0 && !blockedQ(D, pos, l, 1e20f)) ? 1.f : 0.f;
    int open = 0;
    V<float> axis = fabsf(n.z) < 0.8f ? V<float>(0, 0, 1) : V<float>(0, 1, 0);
    V<float> tx = axis.cross(n).unit(), ty = n.cross(tx);
    for (int a = 0; a < s.ao; a++) {
        uint32_t key = s.seed + uint32_t(p) * 0x9e3779b9u + uint32_t(sid) * 0x85ebca6bu
                     + uint32_t(depth) * 0xc2b2ae35u + uint32_t(a) * 0x27d4eb2du;
        float x = 2.f * sample<float>(key ^ 0x68bc21ebu) - 1.f;
        float y = 2.f * sample<float>(key ^ 0x02e5be93u) - 1.f;
        float z = .25f + .75f * sample<float>(key ^ 0x967a889bu);
        V<float> dir = (tx * x + ty * y + n * z).unit();
        open += !blockedQ(D, pos, dir, s.ao_radius);
    }
    float ambient = s.ao ? float(open) / float(s.ao) : 1.f;
    float value = .08f + .20f * ambient + .72f * cosine * visible;
    V<float> col(m.cm.x, m.cm.y, m.cm.z);
    const float mirror = m.cm.w;
    result = result + through * col * (value * (1.f - mirror));
    through = through * mirror;
    stv(S.R, p, result);
    stv(S.T, p, through);
    if (mirror == 0 || depth == s.max_depth - 1) {
        S.A[p] = 0;
    } else {
        stv(S.O, p, pos);
        stv(S.D, p, (rd - n * (2.f * rd.dot(n))).unit());
    }
}

// Adds this pass's per-pixel value to the running sum; divides by spp on the last pass.
__global__ void __launch_bounds__(256) commitKernel(float* out, State S, int sid, int spp, int npix) {
    int p = blockIdx.x * blockDim.x + threadIdx.x;
    if (p >= npix) return;
    V<float> c = ldv(S.R, p);
    float* o = out + 3 * size_t(p);
    float r = c.x, g = c.y, b = c.z;
    if (sid > 0) { r = o[0] + r; g = o[1] + g; b = o[2] + b; }
    if (sid == spp - 1) { float n = float(spp); r = r / n; g = g / n; b = b / n; }
    o[0] = r; o[1] = g; o[2] = b;
}

// Monolithic alternative: one thread per pixel runs the whole path for one sample index.
// Mirrors render_math.cuh radiance<float> operation by operation.
__device__ V<float> tracePath(const Scene& s, int pixel, int sid, const Dev& D) {
    Ray<float> r = camera<float>(s, pixel, sid);
    V<float> result, through(1.f, 1.f, 1.f);
    for (int depth = 0; depth < s.max_depth; depth++) {
        Hit<float> hit = closestHit(D, r.o, r.d, 1e20f);
        if (hit.id < 0) { result = result + through * sky<float>(r.d); break; }
        const TriPre& tp = D.pre[hit.id];
        const Mat& m = D.mat[hit.id];
        V<float> n = V<float>(tp.e1.x, tp.e1.y, tp.e1.z).cross(V<float>(tp.e2.x, tp.e2.y, tp.e2.z)).unit();
        if (n.dot(r.d) > 0) n = n * (-1.f);
        V<float> p = r.o + r.d * hit.t + n * 0.001f;
        V<float> l = V<float>(s.light).unit();
        float cosine = n.dot(l);
        if (cosine < 0) cosine = 0;
        float visible = (ABL_SH_ON && cosine > 0 && !blockedQ(D, p, l, 1e20f)) ? 1.f : 0.f;
        int open = 0;
        V<float> axis = fabsf(n.z) < 0.8f ? V<float>(0, 0, 1) : V<float>(0, 1, 0);
        V<float> tx = axis.cross(n).unit(), ty = n.cross(tx);
        for (int a = 0; a < s.ao * ABL_AO_MUL; a++) {
            uint32_t key = s.seed + uint32_t(pixel) * 0x9e3779b9u + uint32_t(sid) * 0x85ebca6bu
                         + uint32_t(depth) * 0xc2b2ae35u + uint32_t(a) * 0x27d4eb2du;
            float x = 2.f * sample<float>(key ^ 0x68bc21ebu) - 1.f;
            float y = 2.f * sample<float>(key ^ 0x02e5be93u) - 1.f;
            float z = .25f + .75f * sample<float>(key ^ 0x967a889bu);
            V<float> dir = (tx * x + ty * y + n * z).unit();
            open += !blockedQ(D, p, dir, s.ao_radius);
        }
        float ambient = s.ao ? float(open) / float(s.ao) : 1.f;
        float value = .08f + .20f * ambient + .72f * cosine * visible;
        V<float> col(m.cm.x, m.cm.y, m.cm.z);
        const float mirror = m.cm.w;
        result = result + through * col * (value * (1.f - mirror));
        through = through * mirror;
        if (mirror == 0) break;
        r = Ray<float>{p, (r.d - n * (2.f * r.d.dot(n))).unit()};
    }
    return result;
}

__global__ void __launch_bounds__(256, 5) passKernel(Scene s, Dev D, float* out, int sid, int npix) {
    int p = blockIdx.x * blockDim.x + threadIdx.x;
    if (p >= npix) return;
    V<float> c = tracePath(s, p, sid, D);
    float* o = out + 3 * size_t(p);
    float r = c.x, g = c.y, b = c.z;
    if (sid > 0) { r = o[0] + r; g = o[1] + g; b = o[2] + b; }
    if (sid == s.spp - 1) { float n = float(s.spp); r = r / n; g = g / n; b = b / n; }
    o[0] = r; o[1] = g; o[2] = b;
}

// ================================================================ persistent query pipeline
// Per-lane state for one ray query: closest-hit (ANY=false) or any-hit (ANY=true).
// Scalars only: the traversal stack lives in a separate kernel-scope array so the
// compiler keeps these fields in registers instead of local memory.
struct TState {
    float o[3], inv[3];
    V<float> ro, rd;
    float lim, best;
    int bestId, sp;
    bool found;
};

__device__ __forceinline__ void initQ(const Dev& D, TState& s, int* st, const V<float>& ro, const V<float>& rd, float lim) {
    s.ro = ro; s.rd = rd; s.lim = lim; s.best = lim; s.bestId = -1; s.found = false;
    rayQuant(D, ro, rd, s.o, s.inv);
    st[0] = 0;   // code 0 = real root
    s.sp = 1;
}

// One traversal step: pop one entry and either test its leaf or expand an inner node.
template <bool ANY>
__device__ __forceinline__ void stepQ(const Dev& D, TState& s, int* st) {
    const int code = st[--s.sp];
    const GNode& P = D.nodes[code >> 1];
    const uint4 A = P.a, B = P.b, C = P.c;
    float lo[3], hi[3];
    int ref, cnt;
    if (code & 1) { unpackBox(A.w, B.x, B.y, lo, hi); ref = int(C.x); cnt = int(C.y); }
    else          { unpackBox(A.x, A.y, A.z, lo, hi); ref = int(B.z); cnt = int(B.w); }
    if (cnt == -1) return;
    float tn;
    if (!slabQ(lo, hi, s.o, s.inv, ANY ? s.lim : s.best, tn)) return;
    if (cnt > 0) {
        const int e = ref + cnt;
        for (int i = ref; i < e; i++) {
            float dd;
            if (triHit(D.pre[i], s.ro, s.rd, ANY ? s.lim : s.best, dd)) {
                if (ANY) { s.found = true; return; }
                s.best = dd;
                s.bestId = i;
            }
        }
        return;
    }
    const GNode& N = D.nodes[ref];
    float l0[3], h0[3], l1[3], h1[3];
    unpackBox(N.a.x, N.a.y, N.a.z, l0, h0);
    unpackBox(N.a.w, N.b.x, N.b.y, l1, h1);
    const int c0 = int(N.b.w), c1 = int(N.c.y);
    const float tm = ANY ? s.lim : s.best;
    float t0 = 0.f, t1 = 0.f;
    const bool v0 = c0 != -1 && slabQ(l0, h0, s.o, s.inv, tm, t0);
    const bool v1 = c1 != -1 && slabQ(l1, h1, s.o, s.inv, tm, t1);
    if (v0 && v1) {
        if (ANY || t0 <= t1) { st[s.sp++] = ref * 2 + 1; st[s.sp++] = ref * 2; }
        else                 { st[s.sp++] = ref * 2;     st[s.sp++] = ref * 2 + 1; }
    } else if (v0) {
        st[s.sp++] = ref * 2;
    } else if (v1) {
        st[s.sp++] = ref * 2 + 1;
    }
}

// Persistent warp loop: lanes that finish a query refill from a shared atomic counter.
// Closest-hit: query i = pixel i (rays from state O/D; skipped unless qact[i]); writes outT/outI.
// Any-hit:     query i has origin/dir in qo/qd and limit qlim[i] (<0 = skipped); writes outI (1 = blocked).
template <bool ANY>
__global__ void __launch_bounds__(256) traverseQ(Dev D, const float* qo, const float* qd, const float* qlim,
                                                  const unsigned char* qact, int nq, unsigned* ctr,
                                                  float* outT, int* outI) {
    const unsigned lane = threadIdx.x & 31u;
    const unsigned FULL = 0xffffffffu;
    bool alive = false, fin = false;
    int cur = -1;
    TState s;
    int st[72];
    while (!__all_sync(FULL, fin)) {
        const unsigned need = __ballot_sync(FULL, !alive && !fin);
        if (need) {
            const int leader = __ffs(need) - 1;
            unsigned base = 0;
            if (int(lane) == leader) base = atomicAdd(ctr, unsigned(__popc(need)));
            base = __shfl_sync(FULL, base, leader);
            if (!alive && !fin) {
                const unsigned qi = base + unsigned(__popc(need & ((1u << lane) - 1u)));
                if (qi >= unsigned(nq)) {
                    fin = true;
                } else {
                    const bool skip = (qact != nullptr && !qact[qi]) || (ANY && qlim[qi] < 0.f);
                    if (skip) {
                        if (ANY) outI[qi] = 0;
                    } else {
                        const size_t k = 3 * size_t(qi);
                        V<float> ro(qo[k], qo[k + 1], qo[k + 2]);
                        V<float> rd(qd[k], qd[k + 1], qd[k + 2]);
                        const float lim = ANY ? qlim[qi] : 1e20f;
                        initQ(D, s, st, ro, rd, lim);
                        cur = int(qi);
                        alive = true;
                    }
                }
            }
        }
        if (alive) {
            stepQ<ANY>(D, s, st);
            if (s.sp == 0 || (ANY && s.found)) {
                if (ANY) {
                    outI[cur] = s.found ? 1 : 0;
                } else {
                    outT[cur] = s.best;
                    outI[cur] = s.bestId;
                }
                alive = false;
            }
        }
    }
}

// Primary rays for one tile of pixels (global pixel = base + p).
__global__ void __launch_bounds__(256) genRaysTile(Scene s, State S, int sid, int base, int np) {
    int p = blockIdx.x * blockDim.x + threadIdx.x;
    if (p >= np) return;
    Ray<float> r = camera<float>(s, base + p, sid);
    stv(S.O, p, r.o);
    stv(S.D, p, r.d);
    stv(S.T, p, V<float>(1.f, 1.f, 1.f));
    stv(S.R, p, V<float>(0.f, 0.f, 0.f));
    S.A[p] = 1;
}

// Builds this depth's any-hit queries: slot 0 = shadow ray (skipped if cos <= 0),
// slots 1..ao = ambient-occlusion rays. Misses add sky and end the path here.
__global__ void __launch_bounds__(256) genQueries(Scene s, Dev D, State S, float* AO, float* AD, float* AL,
                                                  int sid, int depth, int base, int np) {
    int p = blockIdx.x * blockDim.x + threadIdx.x;
    if (p >= np) return;
    const int slots = 1 + s.ao;
    if (!S.A[p]) {
        for (int j = 0; j < slots; j++) AL[p * slots + j] = -1.f;
        return;
    }
    const V<float> ro = ldv(S.O, p), rd = ldv(S.D, p);
    const int id = S.HI[p];
    if (id < 0) {
        V<float> add = ldv(S.T, p) * sky<float>(rd);
        stv(S.R, p, ldv(S.R, p) + add);
        S.A[p] = 0;
        for (int j = 0; j < slots; j++) AL[p * slots + j] = -1.f;
        return;
    }
    const float t = S.HT[p];
    const TriPre& tp = D.pre[id];
    V<float> n = V<float>(tp.e1.x, tp.e1.y, tp.e1.z).cross(V<float>(tp.e2.x, tp.e2.y, tp.e2.z)).unit();
    if (n.dot(rd) > 0) n = n * (-1.f);
    const V<float> pos = ro + rd * t + n * 0.001f;
    const V<float> l = V<float>(s.light).unit();
    float cosine = n.dot(l);
    if (cosine < 0) cosine = 0;
    S.CS[p] = cosine;
    stv(AO, p * slots, pos);
    stv(AD, p * slots, l);
    AL[p * slots] = cosine > 0 ? 1e20f : -1.f;
    const V<float> axis = fabsf(n.z) < 0.8f ? V<float>(0, 0, 1) : V<float>(0, 1, 0);
    const V<float> tx = axis.cross(n).unit(), ty = n.cross(tx);
    const uint32_t g = uint32_t(base + p);
    for (int a = 0; a < s.ao; a++) {
        uint32_t key = s.seed + g * 0x9e3779b9u + uint32_t(sid) * 0x85ebca6bu
                     + uint32_t(depth) * 0xc2b2ae35u + uint32_t(a) * 0x27d4eb2du;
        float x = 2.f * sample<float>(key ^ 0x68bc21ebu) - 1.f;
        float y = 2.f * sample<float>(key ^ 0x02e5be93u) - 1.f;
        float z = .25f + .75f * sample<float>(key ^ 0x967a889bu);
        V<float> dir = (tx * x + ty * y + n * z).unit();
        const int q = p * slots + 1 + a;
        stv(AO, q, pos);
        stv(AD, q, dir);
        AL[q] = s.ao_radius;
    }
}

// Shades one bounce from the any-hit results and advances or ends each path.
__global__ void __launch_bounds__(256) combineKernel(Scene s, Dev D, State S, const int* AR, int depth, int np) {
    int p = blockIdx.x * blockDim.x + threadIdx.x;
    if (p >= np || !S.A[p]) return;
    const int slots = 1 + s.ao;
    const int id = S.HI[p];
    const float t = S.HT[p];
    V<float> ro = ldv(S.O, p), rd = ldv(S.D, p);
    V<float> through = ldv(S.T, p), result = ldv(S.R, p);
    const TriPre& tp = D.pre[id];
    const Mat& m = D.mat[id];
    V<float> n = V<float>(tp.e1.x, tp.e1.y, tp.e1.z).cross(V<float>(tp.e2.x, tp.e2.y, tp.e2.z)).unit();
    if (n.dot(rd) > 0) n = n * (-1.f);
    const V<float> pos = ro + rd * t + n * 0.001f;
    const float cosine = S.CS[p];
    const float visible = (cosine > 0 && AR[p * slots] == 0) ? 1.f : 0.f;
    int open = 0;
    for (int a = 0; a < s.ao; a++) open += (AR[p * slots + 1 + a] == 0);
    const float ambient = s.ao ? float(open) / float(s.ao) : 1.f;
    const float value = .08f + .20f * ambient + .72f * cosine * visible;
    V<float> col(m.cm.x, m.cm.y, m.cm.z);
    const float mirror = m.cm.w;
    result = result + through * col * (value * (1.f - mirror));
    through = through * mirror;
    stv(S.R, p, result);
    stv(S.T, p, through);
    if (mirror == 0 || depth == s.max_depth - 1) {
        S.A[p] = 0;
    } else {
        stv(S.O, p, pos);
        stv(S.D, p, (rd - n * (2.f * rd.dot(n))).unit());
    }
}

// ---------------------------------------------------------------- host: query buffers
static float* g_AO = nullptr; static float* g_AD = nullptr; static float* g_AL = nullptr;
static int* g_AR = nullptr; static unsigned* g_ctr = nullptr;
static size_t g_qCap = 0;

static void allocateQueries(size_t nq) {
    if (nq <= g_qCap && g_AO) return;
    if (g_AO) cudaFree(g_AO);
    if (g_AD) cudaFree(g_AD);
    if (g_AL) cudaFree(g_AL);
    if (g_AR) cudaFree(g_AR);
    if (!g_ctr) ck(cudaMalloc(&g_ctr, 2 * sizeof(unsigned)), "query counters");
    ck(cudaMalloc(&g_AO, 3 * nq * sizeof(float)), "query origins");
    ck(cudaMalloc(&g_AD, 3 * nq * sizeof(float)), "query dirs");
    ck(cudaMalloc(&g_AL, nq * sizeof(float)), "query limits");
    ck(cudaMalloc(&g_AR, nq * sizeof(int)), "query results");
    g_qCap = nq;
}

// ---------------------------------------------------------------- host: entry points
static int g_cap = 0;
static int g_capPix = 0;
static TriPre* h_pre = nullptr; static Mat* h_mat = nullptr;
static GNode* d_nodes = nullptr; static TriPre* d_pre = nullptr; static Mat* d_mat = nullptr;
static State d_state{nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr};

static void releaseTris() {
    if (h_pre) cudaFreeHost(h_pre);
    if (h_mat) cudaFreeHost(h_mat);
    if (h_nodes) cudaFreeHost(h_nodes);
    if (d_nodes) cudaFree(d_nodes);
    if (d_pre) cudaFree(d_pre);
    if (d_mat) cudaFree(d_mat);
    h_pre = nullptr; h_mat = nullptr; h_nodes = nullptr; d_nodes = nullptr; d_pre = nullptr; d_mat = nullptr;
}

static void allocateTris(int tris) {
    releaseTris();
    size_t nn = 2 * size_t(tris) + 2;
    ck(cudaMallocHost(&h_nodes, nn * sizeof(GNode)), "pinned nodes");
    ck(cudaMallocHost(&h_pre, size_t(tris) * sizeof(TriPre)), "pinned tris");
    ck(cudaMallocHost(&h_mat, size_t(tris) * sizeof(Mat)), "pinned mats");
    ck(cudaMalloc(&d_nodes, nn * sizeof(GNode)), "dev nodes");
    ck(cudaMalloc(&d_pre, size_t(tris) * sizeof(TriPre)), "dev tris");
    ck(cudaMalloc(&d_mat, size_t(tris) * sizeof(Mat)), "dev mats");
    g_cap = tris;
}

static void releasePixels() {
    if (d_state.O) cudaFree(d_state.O);
    if (d_state.D) cudaFree(d_state.D);
    if (d_state.T) cudaFree(d_state.T);
    if (d_state.R) cudaFree(d_state.R);
    if (d_state.HT) cudaFree(d_state.HT);
    if (d_state.HI) cudaFree(d_state.HI);
    if (d_state.A) cudaFree(d_state.A);
    if (d_state.CS) cudaFree(d_state.CS);
    d_state = State{nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr};
}

static void allocatePixels(int npix) {
    releasePixels();
    size_t n = size_t(npix);
    ck(cudaMalloc(&d_state.O, 3 * n * sizeof(float)), "state O");
    ck(cudaMalloc(&d_state.D, 3 * n * sizeof(float)), "state D");
    ck(cudaMalloc(&d_state.T, 3 * n * sizeof(float)), "state T");
    ck(cudaMalloc(&d_state.R, 3 * n * sizeof(float)), "state R");
    ck(cudaMalloc(&d_state.HT, n * sizeof(float)), "state HT");
    ck(cudaMalloc(&d_state.HI, n * sizeof(int)), "state HI");
    ck(cudaMalloc(&d_state.A, n), "state A");
    ck(cudaMalloc(&d_state.CS, n * sizeof(float)), "state CS");
    g_capPix = npix;
}

void init(int max_triangles, int max_pixels, int max_samples) {
    (void)max_samples;
    allocateTris(max_triangles > 0 ? max_triangles : 1);
    allocatePixels(max_pixels > 0 ? max_pixels : 1);
}

void render(const Scene& scene, float* device_rgb) {
    const int N = scene.triangle_count;
    const int npix = scene.width * scene.height;
    if (N > g_cap) allocateTris(N);
    if (npix > g_capPix) allocatePixels(npix);

    Builder B(scene);
    setQuantGrid(B.nodes[0].lo, B.nodes[0].hi);
    layoutTree(B);
    const int nodeCount = g_cnt;
    const Triangle* T = scene.triangles;
    for (int j = 0; j < N; j++) {
        const Triangle& t = T[B.order[j]];
        TriPre& p = h_pre[j];
        Mat& m = h_mat[j];
        p.v0 = make_float4(t.v0[0], t.v0[1], t.v0[2], 0.f);
        p.e1 = make_float4(t.v1[0] - t.v0[0], t.v1[1] - t.v0[1], t.v1[2] - t.v0[2], 0.f);
        p.e2 = make_float4(t.v2[0] - t.v0[0], t.v2[1] - t.v0[1], t.v2[2] - t.v0[2], 0.f);
        m.cm = make_float4(t.color[0], t.color[1], t.color[2], t.mirror);
    }
    ck(cudaMemcpy(d_nodes, h_nodes, size_t(nodeCount) * sizeof(GNode), cudaMemcpyHostToDevice), "upload nodes");
    ck(cudaMemcpy(d_pre, h_pre, size_t(N) * sizeof(TriPre), cudaMemcpyHostToDevice), "upload tris");
    ck(cudaMemcpy(d_mat, h_mat, size_t(N) * sizeof(Mat), cudaMemcpyHostToDevice), "upload mats");

    Dev dev{d_nodes, d_pre, d_mat,
            make_float4(g_rootLo[0], g_rootLo[1], g_rootLo[2], 0.f),
            make_float4(g_step[0], g_step[1], g_step[2], 0.f),
            make_float4(1.f / g_step[0], 1.f / g_step[1], 1.f / g_step[2], 0.f)};
    Scene d = scene;
    d.triangles = nullptr;
    const int blocks = (npix + 255) / 256;
#ifdef SOL_MONO
    for (int sid = 0; sid < scene.spp; sid++) {
        passKernel<<<blocks, 256>>>(d, dev, device_rgb, sid, npix);
    }
#else
    // Tiles of pixels keep the any-hit query buffer bounded (<= 4M queries).
    const int slots = scene.ao + 1;
    const int tileMax = std::min(npix, std::max(1, int(4194304 / slots)));
    allocateQueries(size_t(tileMax) * slots);
    int smCount = 0;
    ck(cudaDeviceGetAttribute(&smCount, cudaDevAttrMultiProcessorCount, 0), "sm count");
    const int G = std::max(1, smCount * 6);
    for (int base = 0; base < npix; base += tileMax) {
        const int np = std::min(tileMax, npix - base);
        const int blocksP = (np + 255) / 256;
        const int nqAny = np * slots;
        for (int sid = 0; sid < scene.spp; sid++) {
            genRaysTile<<<blocksP, 256>>>(d, d_state, sid, base, np);
            for (int depth = 0; depth < scene.max_depth; depth++) {
                ck(cudaMemsetAsync(g_ctr, 0, 2 * sizeof(unsigned)), "reset counters");
                traverseQ<false><<<G, 256>>>(dev, d_state.O, d_state.D, nullptr, d_state.A, np, g_ctr,
                                             d_state.HT, d_state.HI);
                genQueries<<<blocksP, 256>>>(d, dev, d_state, g_AO, g_AD, g_AL, sid, depth, base, np);
                traverseQ<true><<<G, 256>>>(dev, g_AO, g_AD, g_AL, nullptr, nqAny, g_ctr + 1,
                                            nullptr, g_AR);
                combineKernel<<<blocksP, 256>>>(d, dev, d_state, g_AR, depth, np);
            }
            commitKernel<<<blocksP, 256>>>(device_rgb + 3 * size_t(base), d_state, sid, scene.spp, np);
        }
    }
#endif
    ck(cudaGetLastError(), "launch");
#ifdef SOL_COUNT
    ck(cudaDeviceSynchronize(), "sync");
    unsigned long long h[8];
    ck(cudaMemcpyFromSymbol(h, g_stat, sizeof(h)), "stat");
    fprintf(stderr, "STAT tri=%llu box=%llu closest=%llu closestPops=%llu any=%llu anyPops=%llu\n",
            h[0], h[1], h[2], h[4], h[3], h[5]);
#endif
}

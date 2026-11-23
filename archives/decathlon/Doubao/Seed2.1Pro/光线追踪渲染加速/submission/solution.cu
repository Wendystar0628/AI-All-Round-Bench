// CUDA ray tracing solution: parallel SAH build + warp-coherent BVH traversal.
#include "render_math.cuh"
#include <cstdio>
#include <cstdlib>
#include <vector>
#include <algorithm>
#include <thread>
#include <atomic>
#include <future>

#define MY_BINS 16
#define MY_LEAF 8
#define WARP 32
#define WSTACK 80

namespace {

struct GNode {
    float lo_x, lo_y, lo_z, hi_x, hi_y, hi_z;
    int a, b; // inner: children; leaf: a=start, b=count|LEAF_BIT
};
static constexpr int LEAF_BIT = 0x40000000;

static void ck(cudaError_t e) {
    if (e != cudaSuccess) { fprintf(stderr, "solution cuda: %s\n", cudaGetErrorString(e)); exit(2); }
}

struct Tree {
    const Triangle* T; int N;
    std::vector<float> lo, hi, cen;
    std::vector<int> order;
    std::vector<GNode> nodes;
    std::atomic<int> next{0};

    explicit Tree(const Scene& s) : T(s.triangles), N(s.triangle_count) {
        lo.resize(3 * size_t(N)); hi.resize(3 * size_t(N)); cen.resize(3 * size_t(N));
        order.resize(N);
        int nth = std::min(12, std::max(1, (int)std::thread::hardware_concurrency()));
        parallel_for(0, N, nth, [&](int i) {
            const Triangle& t = T[i];
            for (int k = 0; k < 3; k++) {
                float a = t.v0[k], b = t.v1[k], c = t.v2[k];
                float l = std::min(a, std::min(b, c)), h = std::max(a, std::max(b, c));
                lo[3 * i + k] = l; hi[3 * i + k] = h; cen[3 * i + k] = (l + h) * .5f;
            }
        });
        for (int i = 0; i < N; i++) order[i] = i;
        nodes.resize(2 * size_t(N) + 1);
        build(0, N, 0);
        nodes.resize(next.load());
    }

    template<class F>
    static void parallel_for(int b, int e, int nth, F f) {
        if (e - b <= 2048 || nth <= 1) { for (int i = b; i < e; i++) f(i); return; }
        int n = std::min(nth, (e - b + 1023) / 1024);
        std::vector<std::thread> th;
        int chunk = (e - b + n - 1) / n;
        for (int w = 0; w < n; w++) {
            int s = b + w * chunk, en = std::min(e, s + chunk);
            if (s >= en) break;
            th.emplace_back([&, s, en] { for (int i = s; i < en; i++) f(i); });
        }
        for (auto& t : th) t.join();
    }

    static float area(const float* a, const float* b) {
        float x = b[0] - a[0], y = b[1] - a[1], z = b[2] - a[2];
        return x * y + y * z + z * x;
    }

    int build(int b, int e, int depth) {
        float nlo[3], nhi[3], clo[3], chi[3];
        for (int k = 0; k < 3; k++) { nlo[k] = 1e30f; nhi[k] = -1e30f; clo[k] = 1e30f; chi[k] = -1e30f; }
        for (int i = b; i < e; i++) {
            int t = order[i];
            for (int k = 0; k < 3; k++) {
                nlo[k] = std::min(nlo[k], lo[3 * t + k]);
                nhi[k] = std::max(nhi[k], hi[3 * t + k]);
                clo[k] = std::min(clo[k], cen[3 * t + k]);
                chi[k] = std::max(chi[k], cen[3 * t + k]);
            }
        }
        int cnt = e - b;
        GNode n; n.lo_x = nlo[0]; n.lo_y = nlo[1]; n.lo_z = nlo[2];
        n.hi_x = nhi[0]; n.hi_y = nhi[1]; n.hi_z = nhi[2]; n.a = b; n.b = cnt | LEAF_BIT;
        int id = next++; nodes[id] = n;
        if (cnt <= 2 || depth >= 60) return id;
        float best = 1e30f; int bestAxis = -1, bestBin = 0;
        for (int k = 0; k < 3; k++) {
            float ext = chi[k] - clo[k]; if (ext < 1e-9f) continue;
            int bc[MY_BINS] = {};
            float blo[MY_BINS][3], bhi[MY_BINS][3];
            for (int j = 0; j < MY_BINS; j++) for (int q = 0; q < 3; q++) { blo[j][q] = 1e30f; bhi[j][q] = -1e30f; }
            float scale = MY_BINS / ext * (1 - 1e-6f);
            for (int i = b; i < e; i++) {
                int t = order[i];
                int j = std::min(MY_BINS - 1, int((cen[3 * t + k] - clo[k]) * scale));
                bc[j]++;
                for (int q = 0; q < 3; q++) { blo[j][q] = std::min(blo[j][q], lo[3 * t + q]); bhi[j][q] = std::max(bhi[j][q], hi[3 * t + q]); }
            }
            float rarea[MY_BINS]; int rcnt[MY_BINS];
            float alo[3] = { 1e30f,1e30f,1e30f }, ahi[3] = { -1e30f,-1e30f,-1e30f };
            int ac = 0;
            for (int j = MY_BINS - 1; j > 0; j--) {
                ac += bc[j];
                for (int q = 0; q < 3; q++) { alo[q] = std::min(alo[q], blo[j][q]); ahi[q] = std::max(ahi[q], bhi[j][q]); }
                rcnt[j] = ac; rarea[j] = ac ? area(alo, ahi) : 0;
            }
            for (int q = 0; q < 3; q++) { alo[q] = 1e30f; ahi[q] = -1e30f; }
            ac = 0;
            for (int j = 1; j < MY_BINS; j++) {
                ac += bc[j - 1];
                for (int q = 0; q < 3; q++) { alo[q] = std::min(alo[q], blo[j - 1][q]); ahi[q] = std::max(ahi[q], bhi[j - 1][q]); }
                if (!ac || !rcnt[j]) continue;
                float c = area(alo, ahi) * ac + rarea[j] * rcnt[j];
                if (c < best) { best = c; bestAxis = k; bestBin = j; }
            }
        }
        float parentArea = area(nlo, nhi);
        float splitCost = 1.0f + (parentArea > 0 ? best / parentArea : float(cnt));
        if (cnt <= MY_LEAF && float(cnt) <= splitCost) return id;
        int mid = -1;
        if (bestAxis >= 0) {
            int k = bestAxis;
            float ext = chi[k] - clo[k], scale = MY_BINS / ext * (1 - 1e-6f), c0 = clo[k];
            mid = int(std::partition(order.begin() + b, order.begin() + e, [&](int t) {
                return std::min(MY_BINS - 1, int((cen[3 * t + k] - c0) * scale)) < bestBin;
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
        bool fork = depth < 3 && (e - b) > 8192;
        if (fork) {
            auto fl = std::async(std::launch::async, [&] { return build(b, mid, depth + 1); });
            r = build(mid, e, depth + 1);
            l = fl.get();
        } else {
            l = build(b, mid, depth + 1);
            r = build(mid, e, depth + 1);
        }
        nodes[id].a = l; nodes[id].b = r;
        return id;
    }
};

struct TriEx {
    float v0x, v0y, v0z;
    float e1x, e1y, e1z;
    float e2x, e2y, e2z;
    float nx, ny, nz;
    float r, g, b, mirror;
};

static TriEx* d_ex = nullptr;
static GNode* d_nodes = nullptr;
static int* d_ids = nullptr;
static int cap_tris = 0, cap_pix = 0, cap_spp = 0;

struct CameraP {
    float ux, uy, uz, vx, vy, vz, wx, wy, wz, ox, oy, oz;
    float width, height, aor, lx, ly, lz;
    int seed, spp, ao, maxd, pixels;
};

__device__ __forceinline__ uint32_t mix32d(uint32_t x) {
    x ^= x >> 16; x *= 0x7feb352du; x ^= x >> 15; x *= 0x846ca68bu; return x ^ (x >> 16);
}
__device__ __forceinline__ float samplef(uint32_t x) { return float(mix32d(x) >> 8) * (1.0f / 16777216.0f); }

struct DRay { float3 o, d; };

__device__ __forceinline__ bool triHit(const TriEx& tr, DRay r, float limit, float& dist) {
    float px = r.d.y * tr.e2z - r.d.z * tr.e2y;
    float py = r.d.z * tr.e2x - r.d.x * tr.e2z;
    float pz = r.d.x * tr.e2y - r.d.y * tr.e2x;
    float det = tr.e1x * px + tr.e1y * py + tr.e1z * pz;
    if (fabsf(det) < 1e-10f) return false;
    float inv = 1.0f / det;
    float sx = r.o.x - tr.v0x, sy = r.o.y - tr.v0y, sz = r.o.z - tr.v0z;
    float u = (sx * px + sy * py + sz * pz) * inv;
    if (u < 0.f || u > 1.f) return false;
    float qx = sy * tr.e1z - sz * tr.e1y, qy = sz * tr.e1x - sx * tr.e1z, qz = sx * tr.e1y - sy * tr.e1x;
    float v = (r.d.x * qx + r.d.y * qy + r.d.z * qz) * inv;
    if (v < 0.f || u + v > 1.f) return false;
    float dd = (tr.e2x * qx + tr.e2y * qy + tr.e2z * qz) * inv;
    if (dd <= 0.0002f || dd >= limit) return false;
    dist = dd; return true;
}

// ---------------- warp-coherent traversal ----------------

__device__ __forceinline__ bool boxHitNode(const GNode& n, float3 o, float3 rdi, float tmax) {
    float tx1 = (n.lo_x - 1e-5f - o.x) * rdi.x, tx2 = (n.hi_x + 1e-5f - o.x) * rdi.x;
    float tmin = fminf(tx1, tx2), tmaxx = fmaxf(tx1, tx2);
    float ty1 = (n.lo_y - 1e-5f - o.y) * rdi.y, ty2 = (n.hi_y + 1e-5f - o.y) * rdi.y;
    tmin = fmaxf(tmin, fminf(ty1, ty2)); tmaxx = fminf(tmaxx, fmaxf(ty1, ty2));
    float tz1 = (n.lo_z - 1e-5f - o.z) * rdi.z, tz2 = (n.hi_z + 1e-5f - o.z) * rdi.z;
    tmin = fmaxf(tmin, fminf(tz1, tz2)); tmaxx = fminf(tmaxx, fmaxf(tz1, tz2));
    return tmaxx >= fmaxf(tmin, 0.0002f) && tmin < tmax;
}
__device__ __forceinline__ float boxNearNode(const GNode& n, float3 o, float3 rdi, float tmax) {
    float tx1 = (n.lo_x - 1e-5f - o.x) * rdi.x, tx2 = (n.hi_x + 1e-5f - o.x) * rdi.x;
    float tmin = fminf(tx1, tx2), tmaxx = fmaxf(tx1, tx2);
    float ty1 = (n.lo_y - 1e-5f - o.y) * rdi.y, ty2 = (n.hi_y + 1e-5f - o.y) * rdi.y;
    tmin = fmaxf(tmin, fminf(ty1, ty2)); tmaxx = fminf(tmaxx, fmaxf(ty1, ty2));
    float tz1 = (n.lo_z - 1e-5f - o.z) * rdi.z, tz2 = (n.hi_z + 1e-5f - o.z) * rdi.z;
    tmin = fmaxf(tmin, fminf(tz1, tz2)); tmaxx = fminf(tmaxx, fmaxf(tz1, tz2));
    float lo = fmaxf(tmin, 0.0002f);
    return (tmaxx >= lo && lo < tmax) ? lo : 1e30f;
}

// Per-lane BVH traversal; all lanes run a fixed iteration schedule (lanes that
// finish idle). All physical lanes always converge at each ballot.
__device__ __forceinline__ void warpClosest(
    DRay ray, const TriEx* __restrict__ ex, const GNode* __restrict__ nodes, const int* __restrict__ ids,
    float& outT, int& outId)
{
    float3 rdi = make_float3(1.f / ray.d.x, 1.f / ray.d.y, 1.f / ray.d.z);
    float tbest = 1e20f; int idbest = -1;
    int stk[WSTACK]; int sp = 1; stk[0] = 0;
    for (;;) {
        int ni = (sp > 0) ? stk[--sp] : -1;
        bool busy = ni >= 0;
        if (busy) {
            const GNode n = nodes[ni];
            if (boxHitNode(n, ray.o, rdi, tbest)) {
                if (n.b & LEAF_BIT) {
                    int cnt = n.b & ~LEAF_BIT, s0 = n.a;
                    for (int i = 0; i < cnt; i++) {
                        float d;
                        if (triHit(ex[ids[s0 + i]], ray, tbest, d)) { tbest = d; idbest = ids[s0 + i]; }
                    }
                } else {
                    float tl = boxNearNode(nodes[n.a], ray.o, rdi, tbest);
                    float tr_ = boxNearNode(nodes[n.b], ray.o, rdi, tbest);
                    bool hl = tl < 1e29f, hr = tr_ < 1e29f;
                    if (hl && hr) {
                        if (tl <= tr_) { stk[sp++] = n.b; stk[sp++] = n.a; }
                        else { stk[sp++] = n.a; stk[sp++] = n.b; }
                    } else if (hl) stk[sp++] = n.a;
                    else if (hr) stk[sp++] = n.b;
                }
            }
        }
        if (!__any_sync(0xffffffffu, sp > 0)) break;
    }
    outT = tbest; outId = idbest;
}

// any-hit occlusion
__device__ __forceinline__ void warpBlocked(
    DRay ray, float limit, const TriEx* __restrict__ ex, const GNode* __restrict__ nodes, const int* __restrict__ ids,
    bool& outBlocked)
{
    float3 rdi = make_float3(1.f / ray.d.x, 1.f / ray.d.y, 1.f / ray.d.z);
    int stk[WSTACK]; int sp = 1; stk[0] = 0;
    bool blocked = false;
    for (;;) {
        int ni = (sp > 0 && !blocked) ? stk[--sp] : -1;
        if (ni >= 0) {
            const GNode n = nodes[ni];
            if (boxHitNode(n, ray.o, rdi, limit)) {
                if (n.b & LEAF_BIT) {
                    int cnt = n.b & ~LEAF_BIT, s0 = n.a;
                    for (int i = 0; i < cnt; i++) {
                        float d;
                        if (triHit(ex[ids[s0 + i]], ray, limit, d)) { blocked = true; break; }
                    }
                } else {
                    stk[sp++] = n.a; stk[sp++] = n.b;
                }
            }
        }
        if (!__any_sync(0xffffffffu, sp > 0 && !blocked)) {
            // drain remaining stack without processing so all lanes converge
            sp = 0;
            break;
        }
    }
    outBlocked = blocked;
}

__device__ __forceinline__ float3 vadd(float3 a, float3 b) { return make_float3(a.x + b.x, a.y + b.y, a.z + b.z); }
__device__ __forceinline__ float3 vsub(float3 a, float3 b) { return make_float3(a.x - b.x, a.y - b.y, a.z - b.z); }
__device__ __forceinline__ float3 vmul(float3 a, float s) { return make_float3(a.x * s, a.y * s, a.z * s); }
__device__ __forceinline__ float3 vmul3(float3 a, float3 b) { return make_float3(a.x * b.x, a.y * b.y, a.z * b.z); }
__device__ __forceinline__ float vdot(float3 a, float3 b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
__device__ __forceinline__ float3 vcross(float3 a, float3 b) {
    return make_float3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
}
__device__ __forceinline__ float3 vnorm(float3 a) { return vmul(a, rsqrtf(a.x * a.x + a.y * a.y + a.z * a.z)); }

__device__ float3 skyf(float3 d) {
    float a = .5f * (d.y + 1.f);
    return vadd(vmul(make_float3(.95f, .93f, .95f), 1.f - a), vmul(make_float3(.40f, .55f, .85f), a));
}

// One warp per pixel; lanes handle different spp; ghost lanes traverse to keep
// full-warp collectives valid. spp may exceed 32: iterate batches.
__global__ void renderKernel(CameraP cam, const TriEx* __restrict__ ex,
    const GNode* __restrict__ nodes, const int* __restrict__ ids, float* out, int warpOffset)
{
    int warpId = warpOffset + (blockIdx.x * blockDim.x + threadIdx.x) / WARP;
    int lane = threadIdx.x & 31;
    int pixels = cam.pixels;
    if (warpId >= pixels) return;
    int pixel = warpId;
    int px = pixel % int(cam.width), py = pixel / int(cam.width);
    float3 acc = make_float3(0, 0, 0);

    for (int base = 0; base < cam.spp; base += WARP) {
        int sid = base + lane;
        bool valid = sid < cam.spp;
        unsigned vmask = __ballot_sync(0xffffffffu, valid);

        uint32_t key = uint32_t(cam.seed) + uint32_t(pixel) * 0x9e3779b9u + uint32_t(sid) * 0x85ebca6bu;
        float sx = (float(px) + samplef(key)) / cam.width * 2.f - 1.f;
        float sy = 1.f - (float(py) + samplef(key ^ 0xa511e9b3u)) / cam.height * 2.f;
        float3 u = make_float3(cam.ux, cam.uy, cam.uz), v = make_float3(cam.vx, cam.vy, cam.vz), w = make_float3(cam.wx, cam.wy, cam.wz);
        float3 d = vnorm(vadd(vadd(w, vmul(u, sx)), vmul(v, sy)));
        DRay r{ make_float3(cam.ox, cam.oy, cam.oz), d };
        // ghost lanes mirror lane 0's ray so they never take divergent geometry
        if (!valid) {
            float3 o0 = make_float3(__shfl_sync(0xffffffffu, r.o.x, 0), __shfl_sync(0xffffffffu, r.o.y, 0), __shfl_sync(0xffffffffu, r.o.z, 0));
            float3 d0 = make_float3(__shfl_sync(0xffffffffu, r.d.x, 0), __shfl_sync(0xffffffffu, r.d.y, 0), __shfl_sync(0xffffffffu, r.d.z, 0));
            r.o = o0; r.d = d0;
            key = __shfl_sync(0xffffffffu, key, 0);
        }
        float3 result = make_float3(0, 0, 0), through = make_float3(1, 1, 1);
        bool alive = valid;

        for (int depth = 0; depth < cam.maxd; depth++) {
            float ht; int hid;
            warpClosest(r, ex, nodes, ids, ht, hid);
            bool miss = hid < 0;
            bool hitHere = alive && !miss;
            if (alive && miss) result = vadd(result, vmul3(through, skyf(r.d)));
            if (!__ballot_sync(0xffffffffu, hitHere)) { alive = false; break; }
            const TriEx& t = ex[hid];
            float3 n = make_float3(t.nx, t.ny, t.nz);
            if (vdot(n, r.d) > 0.f) n = vmul(n, -1.f);
            float3 p = vadd(vadd(r.o, vmul(r.d, ht)), vmul(n, .001f));
            float3 l = vnorm(make_float3(cam.lx, cam.ly, cam.lz));
            float cosine = vdot(n, l); if (cosine < 0.f) cosine = 0.f;
            bool shadow = false;
            // every lane traverses shadow; only hit lanes' results count
            bool needLight = hitHere && cosine > 0.f;
            warpBlocked(DRay{ p,l }, 1e20f, ex, nodes, ids, shadow);
            float visible = (needLight && !shadow) ? 1.f : 0.f;
            int open = 0;
            float3 axis = (fabsf(n.z) < .8f) ? make_float3(0, 0, 1) : make_float3(0, 1, 0);
            float3 tx = vnorm(vcross(axis, n)), ty = vcross(n, tx);
            for (int a = 0; a < cam.ao; a++) {
                uint32_t akey = key + uint32_t(depth) * 0xc2b2ae35u + uint32_t(a) * 0x27d4eb2du;
                float ax = 2.f * samplef(akey ^ 0x68bc21ebu) - 1.f;
                float ay = 2.f * samplef(akey ^ 0x02e5be93u) - 1.f;
                float az = .25f + .75f * samplef(akey ^ 0x967a889bu);
                float3 dir = vnorm(vadd(vadd(vmul(tx, ax), vmul(ty, ay)), vmul(n, az)));
                bool blk = false;
                warpBlocked(DRay{ p,dir }, cam.aor, ex, nodes, ids, blk);
                if (hitHere) open += int(!blk);
            }
            float ambient = cam.ao ? float(open) / float(cam.ao) : 1.f;
            float value = .08f + .20f * ambient + .72f * cosine * visible;
            float3 col = make_float3(t.r, t.g, t.b);
            if (hitHere) result = vadd(result, vmul3(vmul(through, value * (1.f - t.mirror)), col));
            through = vmul(through, t.mirror);
            float3 rd = vnorm(vsub(r.d, vmul(n, 2.f * vdot(r.d, n))));
            bool cont = hitHere && (t.mirror != 0.f);
            r = DRay{ p, rd };
            if (!__ballot_sync(0xffffffffu, cont)) { alive = false; break; }
            alive = cont;
        }
        if (valid) acc = vadd(acc, result);
    }
    if (lane == 0) {
        float inv = 1.f / float(cam.spp);
        out[3 * pixel] = acc.x * inv; out[3 * pixel + 1] = acc.y * inv; out[3 * pixel + 2] = acc.z * inv;
    }
}

} // namespace

void init(int max_triangles, int max_pixels, int max_samples) {
    cap_tris = max_triangles; cap_pix = max_pixels; cap_spp = max_samples;
    ck(cudaMalloc(&d_ex, size_t(max_triangles) * sizeof(TriEx)));
    ck(cudaMalloc(&d_nodes, (2 * size_t(max_triangles) + 1) * sizeof(GNode)));
    ck(cudaMalloc(&d_ids, size_t(max_triangles) * sizeof(int)));
    // d_out not needed beyond grader's output buffer; allocate scratch anyway not required
}

void render(const Scene& s, float* out) {
    Tree tree(s);
    if (s.triangle_count > cap_tris || s.width * s.height > cap_pix || s.spp > cap_spp) {
        fprintf(stderr, "solution: scene exceeds init capacity\n"); exit(2);
    }
    int ntri = s.triangle_count;
    std::vector<TriEx> hex(ntri);
    int nth = std::min(12, std::max(1, (int)std::thread::hardware_concurrency()));
    Tree::parallel_for(0, ntri, nth, [&](int i) {
        const Triangle& t = s.triangles[i];
        TriEx& e = hex[i];
        e.v0x = t.v0[0]; e.v0y = t.v0[1]; e.v0z = t.v0[2];
        e.e1x = t.v1[0] - t.v0[0]; e.e1y = t.v1[1] - t.v0[1]; e.e1z = t.v1[2] - t.v0[2];
        e.e2x = t.v2[0] - t.v0[0]; e.e2y = t.v2[1] - t.v0[1]; e.e2z = t.v2[2] - t.v0[2];
        float nx = e.e1y * e.e2z - e.e1z * e.e2y;
        float ny = e.e1z * e.e2x - e.e1x * e.e2z;
        float nz = e.e1x * e.e2y - e.e1y * e.e2x;
        float inv = 1.f / sqrtf(nx * nx + ny * ny + nz * nz);
        e.nx = nx * inv; e.ny = ny * inv; e.nz = nz * inv;
        e.r = t.color[0]; e.g = t.color[1]; e.b = t.color[2]; e.mirror = t.mirror;
    });
    ck(cudaMemcpy(d_ex, hex.data(), size_t(ntri) * sizeof(TriEx), cudaMemcpyHostToDevice));
    ck(cudaMemcpy(d_nodes, tree.nodes.data(), tree.nodes.size() * sizeof(GNode), cudaMemcpyHostToDevice));
    ck(cudaMemcpy(d_ids, tree.order.data(), tree.order.size() * sizeof(int), cudaMemcpyHostToDevice));
    CameraP cam;
    cam.ux = s.u[0]; cam.uy = s.u[1]; cam.uz = s.u[2];
    cam.vx = s.v[0]; cam.vy = s.v[1]; cam.vz = s.v[2];
    cam.wx = s.w[0]; cam.wy = s.w[1]; cam.wz = s.w[2];
    cam.ox = s.eye[0]; cam.oy = s.eye[1]; cam.oz = s.eye[2];
    cam.width = float(s.width); cam.height = float(s.height);
    cam.seed = s.seed; cam.spp = s.spp; cam.ao = s.ao; cam.maxd = s.max_depth;
    cam.aor = s.ao_radius; cam.pixels = s.width * s.height;
    cam.lx = s.light[0]; cam.ly = s.light[1]; cam.lz = s.light[2];
    int pixels = s.width * s.height;
    const int WPB = 8; // warps per block
    int fullBlocks = pixels / WPB;
    int tail = pixels - fullBlocks * WPB;
    if (fullBlocks)
        renderKernel<<<dim3(fullBlocks, 1, 1), dim3(WPB * WARP, 1, 1)>>>(cam, d_ex, d_nodes, d_ids, out, 0);
    if (tail)
        renderKernel<<<dim3(1, 1, 1), dim3(tail * WARP, 1, 1)>>>(cam, d_ex, d_nodes, d_ids, out, fullBlocks * WPB);
    ck(cudaGetLastError());
}

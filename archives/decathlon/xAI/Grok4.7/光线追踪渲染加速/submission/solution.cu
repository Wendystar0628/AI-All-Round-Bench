#define PAR_DEPTH 4
#include "bvh.hpp"
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <vector>
#include <algorithm>
#include <chrono>

// Wide BVH over the reference binary SAH tree. Traversal is front-to-back;
// shading goes through radiance() so the sampling contract stays exact.

static constexpr int INVALID = 0x7fffffff;
static constexpr int STACK = 48;
static constexpr float BEXP = 1e-3f;
static constexpr int LEAF_MAX = 4;

struct alignas(16) BVH4Node {
    float4 minx, miny, minz;
    float4 maxx, maxy, maxz;
    int4 child;
    int4 meta;
};
static_assert(sizeof(BVH4Node) == 128, "BVH4Node size");

static Triangle* d_tris = nullptr;
static BVH4Node* d_nodes = nullptr;
static int cap_tri = 0;
static int cap_nodes = 0;

struct GPUNode { float lo[3], hi[3]; int left, right, start, count; };
static_assert(sizeof(GPUNode) == sizeof(Node), "node layout");
static GPUNode* d_bvh = nullptr;
static int* d_idx = nullptr;
static int cap_bvh = 0;
static std::vector<Triangle> htri;
static std::vector<BVH4Node> wnodes;

static void ck(cudaError_t e) {
    if (e != cudaSuccess) {
        fprintf(stderr, "solution: %s\n", cudaGetErrorString(e));
        exit(2);
    }
}

__device__ __forceinline__ float safe_inv(float d) {
    return (fabsf(d) > 1e-18f) ? (1.0f / d) : copysignf(1.0e30f, d);
}
__device__ __forceinline__ float4 sub4(float4 a, float4 b) {
    return make_float4(a.x - b.x, a.y - b.y, a.z - b.z, a.w - b.w);
}
__device__ __forceinline__ float4 mul4(float4 a, float4 b) {
    return make_float4(a.x * b.x, a.y * b.y, a.z * b.z, a.w * b.w);
}
__device__ __forceinline__ float4 fmin4(float4 a, float4 b) {
    return make_float4(fminf(a.x, b.x), fminf(a.y, b.y), fminf(a.z, b.z), fminf(a.w, b.w));
}
__device__ __forceinline__ float4 fmax4(float4 a, float4 b) {
    return make_float4(fmaxf(a.x, b.x), fmaxf(a.y, b.y), fmaxf(a.z, b.z), fmaxf(a.w, b.w));
}

struct Stk { int idx; float tn; };

template <bool Any>
__device__ __noinline__ Hit<float> traverse(const BVH4Node* __restrict__ nodes,
                                            const Triangle* __restrict__ tris,
                                            Ray<float> r, Hit<float> hit) {
    float ox = r.o.x, oy = r.o.y, oz = r.o.z;
    float invx = safe_inv(r.d.x), invy = safe_inv(r.d.y), invz = safe_inv(r.d.z);
    float4 ox4 = make_float4(ox, ox, ox, ox);
    float4 oy4 = make_float4(oy, oy, oy, oy);
    float4 oz4 = make_float4(oz, oz, oz, oz);
    float4 ix4 = make_float4(invx, invx, invx, invx);
    float4 iy4 = make_float4(invy, invy, invy, invy);
    float4 iz4 = make_float4(invz, invz, invz, invz);

    Stk stack[STACK];
    int sp = 0;
    int cur = 0;
    float curT = 0.f;
    bool have = true;
    int steps = 0;
    while (have || sp > 0) {
        if (++steps > 8192) break;
        if (!have) {
            Stk s = stack[--sp];
            if (!Any && s.tn >= hit.t) continue;
            cur = s.idx;
            curT = s.tn;
            have = true;
        }
        if (cur < 0) {
            unsigned packed = ~unsigned(cur);
            int start = int(packed & 0x00FFFFFFu);
            int count = int(packed >> 24);
            for (int i = 0; i < count; ++i) {
                float dist;
                if (intersect(tris[start + i], r, hit.t, dist) && dist == dist && dist < hit.t) {
                    hit.t = dist;
                    hit.id = start + i;
                    if (Any) return hit;
                }
            }
            have = false;
            continue;
        }
        if (!Any && curT >= hit.t) { have = false; continue; }
        BVH4Node n = nodes[cur];
        float4 t0x = mul4(sub4(n.minx, ox4), ix4);
        float4 t1x = mul4(sub4(n.maxx, ox4), ix4);
        float4 t0y = mul4(sub4(n.miny, oy4), iy4);
        float4 t1y = mul4(sub4(n.maxy, oy4), iy4);
        float4 t0z = mul4(sub4(n.minz, oz4), iz4);
        float4 t1z = mul4(sub4(n.maxz, oz4), iz4);
        float4 tmin4 = fmax4(fmax4(fmin4(t0x, t1x), fmin4(t0y, t1y)), fmin4(t0z, t1z));
        float4 tmax4 = fmin4(fmin4(fmax4(t0x, t1x), fmax4(t0y, t1y)), fmax4(t0z, t1z));
        int ch[4] = {n.child.x, n.child.y, n.child.z, n.child.w};
        float tn[4] = {tmin4.x, tmin4.y, tmin4.z, tmin4.w};
        float tf[4] = {tmax4.x, tmax4.y, tmax4.z, tmax4.w};
        int hs[4];
        float hk[4];
        int hc = 0;
        #pragma unroll
        for (int k = 0; k < 4; ++k) {
            if (ch[k] == INVALID) continue;
            float a = fmaxf(tn[k], 0.0002f);
            float b = tf[k];
            if (a <= b && b > 0.0002f && a < hit.t) {
                hs[hc] = ch[k];
                hk[hc] = a;
                ++hc;
            }
        }
        if (hc == 0) { have = false; continue; }
        for (int i = 1; i < hc; ++i) {
            int ci = hs[i];
            float ki = hk[i];
            int j = i;
            while (j > 0 && hk[j - 1] > ki) {
                hk[j] = hk[j - 1];
                hs[j] = hs[j - 1];
                --j;
            }
            hk[j] = ki;
            hs[j] = ci;
        }
        if (sp + hc - 1 > STACK) {
            int start = n.meta.x, count = n.meta.y;
            for (int i = 0; i < count; ++i) {
                float dist;
                if (intersect(tris[start + i], r, hit.t, dist) && dist == dist && dist < hit.t) {
                    hit.t = dist;
                    hit.id = start + i;
                    if (Any) return hit;
                }
            }
            have = false;
            continue;
        }
        for (int i = hc - 1; i >= 1; --i) stack[sp++] = Stk{hs[i], hk[i]};
        cur = hs[0];
        curT = hk[0];
        have = true;
    }
    return hit;
}

struct Query {
    const Triangle* tris;
    const BVH4Node* nodes;
    int hint;
    int closest_calls;
    __device__ const Triangle& triangle(int id) const { return tris[id]; }
    __device__ Hit<float> closest(Ray<float> r, float limit) {
        int call = closest_calls++;
        Hit<float> init{limit, -1};
        if (call == 0 && hint >= 0) {
            float dist;
            if (intersect(tris[hint], r, limit, dist) && dist == dist && dist < limit) init = Hit<float>{dist, hint};
        }
        Hit<float> h = traverse<false>(nodes, tris, r, init);
        if (call == 0) hint = h.id;
        return h;
    }
    __device__ bool blocked(Ray<float> r, float limit) const {
        return traverse<true>(nodes, tris, r, Hit<float>{limit, -1}).id >= 0;
    }
};

__device__ __noinline__ V<float> shade_sample(Scene s, int pixel, int sid, Query& q) {
    q.closest_calls = 0;
    return radiance<float>(s, pixel, sid, q);
}

__global__ void render_pixels(Scene s, const Triangle* __restrict__ tris,
                              const BVH4Node* __restrict__ nodes,
                              int p0, int p1, float* __restrict__ out) {
    int pixel = p0 + int(blockIdx.x * blockDim.x + threadIdx.x);
    if (pixel >= p1) return;
    Query q{tris, nodes, -1, 0};
    V<float> sum(0, 0, 0);
    for (int sid = 0; sid < s.spp; ++sid) {
        V<float> c = shade_sample(s, pixel, sid, q);
        sum = sum + c;
    }
    float denom = static_cast<float>(s.spp);
    out[3 * size_t(pixel)] = sum.x / denom;
    out[3 * size_t(pixel) + 1] = sum.y / denom;
    out[3 * size_t(pixel) + 2] = sum.z / denom;
}

// ---- host collapse of the binary SAH tree into BVH4 ----

struct Child {
    int kind; // 0 = binary node, 1 = order-range
    int bin, start, count;
    float lo[3], hi[3];
};

static float area3(const float* lo, const float* hi) {
    float x = hi[0] - lo[0], y = hi[1] - lo[1], z = hi[2] - lo[2];
    if (x < 0) x = 0;
    if (y < 0) y = 0;
    if (z < 0) z = 0;
    return x * y + y * z + z * x;
}

static void copy3(float* d, const float* s) { d[0] = s[0]; d[1] = s[1]; d[2] = s[2]; }

static void tri_bounds(const Triangle& t, float lo[3], float hi[3]) {
    for (int k = 0; k < 3; ++k) {
        lo[k] = std::min(t.v0[k], std::min(t.v1[k], t.v2[k]));
        hi[k] = std::max(t.v0[k], std::max(t.v1[k], t.v2[k]));
    }
}

struct Emitter {
    const Triangle* T;
    const std::vector<int>& order;
    const std::vector<Node>& bnodes;
    int wcount = 0;
    int tcursor = 0;

    Child from_bin(int bin) const {
        const Node& n = bnodes[bin];
        Child c{};
        c.kind = 0;
        c.bin = bin;
        c.start = n.start;
        c.count = n.count;
        copy3(c.lo, n.lo);
        copy3(c.hi, n.hi);
        return c;
    }
    Child from_range(int start, int count) const {
        Child c{};
        c.kind = 1;
        c.bin = -1;
        c.start = start;
        c.count = count;
        for (int k = 0; k < 3; ++k) { c.lo[k] = 1e30f; c.hi[k] = -1e30f; }
        for (int i = 0; i < count; ++i) {
            float a[3], b[3];
            tri_bounds(T[order[start + i]], a, b);
            for (int k = 0; k < 3; ++k) {
                c.lo[k] = std::min(c.lo[k], a[k]);
                c.hi[k] = std::max(c.hi[k], b[k]);
            }
        }
        return c;
    }
    bool splittable(const Child& c) const {
        if (c.kind == 1) return c.count > LEAF_MAX;
        const Node& n = bnodes[c.bin];
        if (n.count == 0) return true;
        return n.count > LEAF_MAX;
    }
    void split_child(const Child& c, Child& a, Child& b) const {
        if (c.kind == 0 && bnodes[c.bin].count == 0) {
            const Node& n = bnodes[c.bin];
            a = from_bin(n.left);
            b = from_bin(n.right);
            return;
        }
        int start = c.kind == 1 ? c.start : bnodes[c.bin].start;
        int count = c.kind == 1 ? c.count : bnodes[c.bin].count;
        int mid = count >> 1;
        if (mid < 1) mid = 1;
        if (mid >= count) mid = count - 1;
        a = from_range(start, mid);
        b = from_range(start + mid, count - mid);
    }
    int encode_leaf(int start, int count) {
        int ns = tcursor;
        for (int i = 0; i < count; ++i) htri[tcursor++] = T[order[start + i]];
        unsigned packed = (unsigned(count) << 24) | unsigned(ns);
        return int(~packed);
    }
    int make(Child root) {
        Child items[4];
        int nitems = 1;
        items[0] = root;
        while (nitems < 4) {
            int best = -1;
            float bestA = -1.f;
            for (int i = 0; i < nitems; ++i) if (splittable(items[i])) {
                float a = area3(items[i].lo, items[i].hi);
                if (a > bestA) { bestA = a; best = i; }
            }
            if (best < 0) break;
            Child a, b;
            split_child(items[best], a, b);
            items[best] = a;
            items[nitems++] = b;
        }
        if (wcount >= cap_nodes) {
            fprintf(stderr, "solution: bvh node overflow\n");
            exit(2);
        }
        int id = wcount++;
        int myStart = tcursor;
        float minx[4], miny[4], minz[4], maxx[4], maxy[4], maxz[4];
        int ch[4];
        for (int k = 0; k < 4; ++k) {
            if (k >= nitems) {
                minx[k] = miny[k] = minz[k] = 1e30f;
                maxx[k] = maxy[k] = maxz[k] = -1e30f;
                ch[k] = INVALID;
                continue;
            }
            Child c = items[k];
            bool as_leaf = false;
            int ls = 0, lc = 0;
            if (c.kind == 1 && c.count <= LEAF_MAX) {
                as_leaf = true; ls = c.start; lc = c.count;
            } else if (c.kind == 0 && bnodes[c.bin].count > 0 && bnodes[c.bin].count <= LEAF_MAX) {
                as_leaf = true;
                ls = bnodes[c.bin].start;
                lc = bnodes[c.bin].count;
            }
            if (as_leaf) ch[k] = encode_leaf(ls, lc);
            else ch[k] = make(c);
            minx[k] = c.lo[0] - BEXP; maxx[k] = c.hi[0] + BEXP;
            miny[k] = c.lo[1] - BEXP; maxy[k] = c.hi[1] + BEXP;
            minz[k] = c.lo[2] - BEXP; maxz[k] = c.hi[2] + BEXP;
        }
        BVH4Node node;
        node.minx = make_float4(minx[0], minx[1], minx[2], minx[3]);
        node.miny = make_float4(miny[0], miny[1], miny[2], miny[3]);
        node.minz = make_float4(minz[0], minz[1], minz[2], minz[3]);
        node.maxx = make_float4(maxx[0], maxx[1], maxx[2], maxx[3]);
        node.maxy = make_float4(maxy[0], maxy[1], maxy[2], maxy[3]);
        node.maxz = make_float4(maxz[0], maxz[1], maxz[2], maxz[3]);
        node.child = make_int4(ch[0], ch[1], ch[2], ch[3]);
        node.meta = make_int4(myStart, tcursor - myStart, 0, 0);
        wnodes[id] = node;
        return id;
    }
};

__device__ __forceinline__ float safe_inv2(float d) {
    return (fabsf(d) > 1e-18f) ? (1.0f / d) : copysignf(1.0e30f, d);
}
__device__ __forceinline__ bool slab_n(const GPUNode& n, float ox, float oy, float oz,
                                       float ix, float iy, float iz, float tmax, float& near) {
    float ax = (n.lo[0] - 1e-3f - ox) * ix, bx = (n.hi[0] + 1e-3f - ox) * ix;
    float ay = (n.lo[1] - 1e-3f - oy) * iy, by = (n.hi[1] + 1e-3f - oy) * iy;
    float az = (n.lo[2] - 1e-3f - oz) * iz, bz = (n.hi[2] + 1e-3f - oz) * iz;
    float t0 = fmaxf(0.0002f, fmaxf(fminf(ax, bx), fmaxf(fminf(ay, by), fminf(az, bz))));
    float t1 = fminf(tmax, fminf(fmaxf(ax, bx), fminf(fmaxf(ay, by), fmaxf(az, bz))));
    near = t0;
    return t0 <= t1;
}
template <bool Any>
__device__ __forceinline__ Hit<float> walk2(const GPUNode* __restrict__ nodes, const int* __restrict__ idx,
                                            const Triangle* __restrict__ tris, Ray<float> r, Hit<float> hit) {
    float ox = r.o.x, oy = r.o.y, oz = r.o.z;
    float ix = safe_inv2(r.d.x), iy = safe_inv2(r.d.y), iz = safe_inv2(r.d.z);
    float near;
    if (!slab_n(nodes[0], ox, oy, oz, ix, iy, iz, hit.t, near)) return hit;
    int stack[80];
    int sp = 0, cur = 0, steps = 0;
    while (true) {
        if (++steps > 4096) break;
        GPUNode n = nodes[cur];
        if (n.count) {
            for (int i = 0; i < n.count; ++i) {
                int id = idx[n.start + i];
                float dist;
                if (intersect(tris[id], r, hit.t, dist) && dist == dist && dist < hit.t) {
                    hit.t = dist;
                    hit.id = id;
                    if (Any) return hit;
                }
            }
            if (!sp) break;
            cur = stack[--sp];
            continue;
        }
        float n0, n1;
        bool h0 = n.left >= 0 && slab_n(nodes[n.left], ox, oy, oz, ix, iy, iz, hit.t, n0);
        bool h1 = n.right >= 0 && slab_n(nodes[n.right], ox, oy, oz, ix, iy, iz, hit.t, n1);
        int first, second;
        bool hf = false, hs = false;
        if (h0 && h1) {
            if (n0 <= n1) { first = n.left; second = n.right; }
            else { first = n.right; second = n.left; }
            hf = hs = true;
        } else if (h0) { first = n.left; hf = true; }
        else if (h1) { first = n.right; hf = true; }
        if (hs) {
            if (sp < 80) stack[sp++] = second;
        }
        if (hf) { cur = first; continue; }
        if (!sp) break;
        cur = stack[--sp];
    }
    return hit;
}
struct Q2 {
    const Triangle* tris;
    const GPUNode* nodes;
    const int* idx;
    int hint, calls;
    __device__ const Triangle& triangle(int id) const { return tris[id]; }
    __device__ Hit<float> closest(Ray<float> r, float limit) {
        int call = calls++;
        Hit<float> init{limit, -1};
        if (call == 0 && hint >= 0) {
            float dist;
            if (intersect(tris[hint], r, limit, dist) && dist == dist && dist < limit) init = Hit<float>{dist, hint};
        }
        Hit<float> h = walk2<false>(nodes, idx, tris, r, init);
        if (call == 0) hint = h.id;
        return h;
    }
    __device__ bool blocked(Ray<float> r, float limit) const {
        return walk2<true>(nodes, idx, tris, r, Hit<float>{limit, -1}).id >= 0;
    }
};
__global__ void render_bvh2(Scene s, const Triangle* __restrict__ tris, const GPUNode* __restrict__ nodes,
                            const int* __restrict__ idx, int p0, int p1, float* __restrict__ out) {
    int pixel = p0 + int(blockIdx.x * blockDim.x + threadIdx.x);
    if (pixel >= p1) return;
    Q2 q{tris, nodes, idx, -1, 0};
    V<float> sum(0, 0, 0);
    for (int sid = 0; sid < s.spp; ++sid) {
        q.calls = 0;
        sum = sum + radiance<float>(s, pixel, sid, q);
    }
    float denom = static_cast<float>(s.spp);
    out[3 * size_t(pixel)] = sum.x / denom;
    out[3 * size_t(pixel) + 1] = sum.y / denom;
    out[3 * size_t(pixel) + 2] = sum.z / denom;
}

static int choose_chunk(const Scene& s) {
    long long work = (long long)s.spp * (1LL + s.ao) * s.max_depth;
    if (work < 1) work = 1;
    int chunk = (int)(2500000LL / work);
    if (chunk < 128) chunk = 128;
    if (chunk > 16384) chunk = 16384;
    return chunk;
}

void init(int max_triangles, int max_pixels, int max_samples) {
    (void)max_pixels;
    (void)max_samples;
    if (max_triangles < 1) max_triangles = 1;
    if (d_tris) { cudaFree(d_tris); d_tris = nullptr; }
    if (d_nodes) { cudaFree(d_nodes); d_nodes = nullptr; }
    if (d_bvh) { cudaFree(d_bvh); d_bvh = nullptr; }
    if (d_idx) { cudaFree(d_idx); d_idx = nullptr; }
    cap_tri = max_triangles;
    cap_nodes = max_triangles * 2 + 32;
    cap_bvh = max_triangles * 2 + 32;
    ck(cudaMalloc(&d_tris, size_t(cap_tri) * sizeof(Triangle)));
    ck(cudaMalloc(&d_nodes, size_t(cap_nodes) * sizeof(BVH4Node)));
    ck(cudaMalloc(&d_bvh, size_t(cap_bvh) * sizeof(GPUNode)));
    ck(cudaMalloc(&d_idx, size_t(cap_tri) * sizeof(int)));
    htri.resize(cap_tri);
    wnodes.resize(cap_nodes);
}

void render(const Scene& scene, float* out) {
    const int N = scene.triangle_count;
    if (N < 1 || N > cap_tri) {
        fprintf(stderr, "solution: triangle count %d outside capacity %d\n", N, cap_tri);
        exit(2);
    }
    auto tick = []() { return std::chrono::steady_clock::now(); };
    auto ms = [](auto a, auto b) { return std::chrono::duration<double, std::milli>(b - a).count(); };
    auto tA = tick();
    SahBuilder tree(scene);
    auto tB = tick();
    if (int(tree.nodes.size()) > cap_bvh || N > cap_tri) {
        fprintf(stderr, "solution: bvh capacity\n");
        exit(2);
    }
    ck(cudaMemcpy(d_tris, scene.triangles, size_t(N) * sizeof(Triangle), cudaMemcpyHostToDevice));
    ck(cudaMemcpy(d_bvh, tree.nodes.data(), tree.nodes.size() * sizeof(GPUNode), cudaMemcpyHostToDevice));
    ck(cudaMemcpy(d_idx, tree.order.data(), size_t(N) * sizeof(int), cudaMemcpyHostToDevice));
    auto tD = tick();
    fprintf(stderr, "t_sah=%.3f t_copy=%.3f bvh_nodes=%d\n", ms(tA, tB), ms(tB, tD), int(tree.nodes.size()));

    Scene s = scene;
    s.triangles = nullptr;
    int pixels = s.width * s.height;
    int chunk = 32768;
    if (s.spp * (1 + s.ao) * s.max_depth > 400) chunk = 8192;
    int threads = 128;
    for (int p0 = 0; p0 < pixels; p0 += chunk) {
        int p1 = std::min(pixels, p0 + chunk);
        int n = p1 - p0;
        render_bvh2<<<(n + threads - 1) / threads, threads>>>(s, d_tris, d_bvh, d_idx, p0, p1, out);
    }
    ck(cudaGetLastError());
}

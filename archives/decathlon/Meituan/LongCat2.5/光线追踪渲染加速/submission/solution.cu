#include "render_math.cuh"
#include <cub/cub.cuh>
#include <vector>
#include <algorithm>
#include <cstdint>
#include <chrono>
#include <cstdio>
#include <cstring>

#define LEAF 4

namespace {

struct TNode { float lo[3], hi[3]; int left, right, start, count, exit; };

__device__ __forceinline__ float3 cross3(float3 a, float3 b) {
    return make_float3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
}
__device__ __forceinline__ float dot3(float3 a, float3 b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
}

struct Query {
    const float4* tg;
    const float4* ts;
    const TNode* nodes;
    int root;

    __device__ Triangle triangle(int id) const {
        float4 a = tg[3 * id], b = tg[3 * id + 1], c = tg[3 * id + 2], s = ts[id];
        Triangle t;
        t.v0[0] = a.x; t.v0[1] = a.y; t.v0[2] = a.z;
        t.v1[0] = a.x + b.x; t.v1[1] = a.y + b.y; t.v1[2] = a.z + b.z;
        t.v2[0] = a.x + c.x; t.v2[1] = a.y + c.y; t.v2[2] = a.z + c.z;
        t.color[0] = s.x; t.color[1] = s.y; t.color[2] = s.z; t.mirror = s.w;
        return t;
    }

    __device__ __forceinline__ bool boxhit(const TNode& n, float3 o, float3 inv, int tiny,
                                          float limit, float& tnear) const {
        float a = 0.0002f, b = limit;
        if (tiny & 1) {
            if (o.x < n.lo[0] - 1e-5f || o.x > n.hi[0] + 1e-5f) return false;
        } else {
            float x = (n.lo[0] - 1e-5f - o.x) * inv.x, y = (n.hi[0] + 1e-5f - o.x) * inv.x;
            if (x > y) { float t = x; x = y; y = t; }
            a = fmaxf(a, x); b = fminf(b, y); if (a > b) return false;
        }
        if (tiny & 2) {
            if (o.y < n.lo[1] - 1e-5f || o.y > n.hi[1] + 1e-5f) return false;
        } else {
            float x = (n.lo[1] - 1e-5f - o.y) * inv.y, y = (n.hi[1] + 1e-5f - o.y) * inv.y;
            if (x > y) { float t = x; x = y; y = t; }
            a = fmaxf(a, x); b = fminf(b, y); if (a > b) return false;
        }
        if (tiny & 4) {
            if (o.z < n.lo[2] - 1e-5f || o.z > n.hi[2] + 1e-5f) return false;
        } else {
            float x = (n.lo[2] - 1e-5f - o.z) * inv.z, y = (n.hi[2] + 1e-5f - o.z) * inv.z;
            if (x > y) { float t = x; x = y; y = t; }
            a = fmaxf(a, x); b = fminf(b, y); if (a > b) return false;
        }
        tnear = a;
        return true;
    }

    __device__ Hit<float> closest(Ray<float> r, float limit) const {
        Hit<float> hit; hit.t = limit; hit.id = -1;
        int stack[48]; int sp = 0; stack[sp++] = root;
        float3 o = make_float3(r.o.x, r.o.y, r.o.z);
        float3 d = make_float3(r.d.x, r.d.y, r.d.z);
        float3 inv; int tiny = 0;
        if (fabsf(d.x) < 1e-30f) { tiny |= 1; inv.x = 0.f; } else inv.x = 1.f / d.x;
        if (fabsf(d.y) < 1e-30f) { tiny |= 2; inv.y = 0.f; } else inv.y = 1.f / d.y;
        if (fabsf(d.z) < 1e-30f) { tiny |= 4; inv.z = 0.f; } else inv.z = 1.f / d.z;
        while (sp) {
            int ni = stack[--sp];
            const TNode& n = nodes[ni];
            if (n.count) {
                float tnear;
                if (!boxhit(n, o, inv, tiny, hit.t, tnear)) continue;
                const float4* g = tg + 3 * n.start;
                for (int i = 0; i < n.count; i++, g += 3) {
                    float4 A = g[0], B = g[1], C = g[2];
                    float3 e1 = make_float3(B.x, B.y, B.z);
                    float3 e2 = make_float3(C.x, C.y, C.z);
                    float3 p = cross3(d, e2);
                    float det = dot3(e1, p);
                    if (fabsf(det) < 1e-10f) continue;
                    float invd = 1.f / det;
                    float3 s = make_float3(o.x - A.x, o.y - A.y, o.z - A.z);
                    float u = dot3(s, p) * invd;
                    if (u < 0.f || u > 1.f) continue;
                    float3 q = cross3(s, e1);
                    float v = dot3(d, q) * invd;
                    if (v < 0.f || u + v > 1.f) continue;
                    float t = dot3(e2, q) * invd;
                    if (t <= 0.0002f || t >= hit.t) continue;
                    hit.t = t; hit.id = n.start + i;
                }
            } else {
                float tL, tR;
                bool hL = boxhit(nodes[n.left], o, inv, tiny, hit.t, tL);
                bool hR = boxhit(nodes[n.right], o, inv, tiny, hit.t, tR);
                if (hL && hR) {
                    if (tL < tR) { stack[sp++] = n.right; stack[sp++] = n.left; }
                    else { stack[sp++] = n.left; stack[sp++] = n.right; }
                } else if (hL) stack[sp++] = n.left;
                else if (hR) stack[sp++] = n.right;
            }
        }
        return hit;
    }

    __device__ bool blocked(Ray<float> r, float limit) const {
        int stack[48]; int sp = 0; stack[sp++] = root;
        float3 o = make_float3(r.o.x, r.o.y, r.o.z);
        float3 d = make_float3(r.d.x, r.d.y, r.d.z);
        float3 inv; int tiny = 0;
        if (fabsf(d.x) < 1e-30f) { tiny |= 1; inv.x = 0.f; } else inv.x = 1.f / d.x;
        if (fabsf(d.y) < 1e-30f) { tiny |= 2; inv.y = 0.f; } else inv.y = 1.f / d.y;
        if (fabsf(d.z) < 1e-30f) { tiny |= 4; inv.z = 0.f; } else inv.z = 1.f / d.z;
        while (sp) {
            int ni = stack[--sp];
            const TNode& n = nodes[ni];
            if (n.count) {
                float tnear;
                if (!boxhit(n, o, inv, tiny, limit, tnear)) continue;
                const float4* g = tg + 3 * n.start;
                for (int i = 0; i < n.count; i++, g += 3) {
                    float4 A = g[0], B = g[1], C = g[2];
                    float3 e1 = make_float3(B.x, B.y, B.z);
                    float3 e2 = make_float3(C.x, C.y, C.z);
                    float3 p = cross3(d, e2);
                    float det = dot3(e1, p);
                    if (fabsf(det) < 1e-10f) continue;
                    float invd = 1.f / det;
                    float3 s = make_float3(o.x - A.x, o.y - A.y, o.z - A.z);
                    float u = dot3(s, p) * invd;
                    if (u < 0.f || u > 1.f) continue;
                    float3 q = cross3(s, e1);
                    float v = dot3(d, q) * invd;
                    if (v < 0.f || u + v > 1.f) continue;
                    float t = dot3(e2, q) * invd;
                    if (t <= 0.0002f || t >= limit) continue;
                    return true;
                }
            } else {
                float tL, tR;
                bool hL = boxhit(nodes[n.left], o, inv, tiny, limit, tL);
                bool hR = boxhit(nodes[n.right], o, inv, tiny, limit, tR);
                if (hL && hR) { stack[sp++] = n.right; stack[sp++] = n.left; }
                else if (hL) stack[sp++] = n.left;
                else if (hR) stack[sp++] = n.right;
            }
        }
        return false;
    }
};

__device__ __forceinline__ unsigned int part1by2(unsigned int x) {
    x &= 0x3ffu;
    x = (x | (x << 16)) & 0x30000ffu;
    x = (x | (x << 8)) & 0x300f00fu;
    x = (x | (x << 4)) & 0x30c30c3u;
    x = (x | (x << 2)) & 0x9249249u;
    return x;
}

__global__ void sequence_kernel(int* v, int n) {
    int i = blockIdx.x * blockDim.x + threadIdx.x;
    if (i < n) v[i] = i;
}

__global__ void morton_kernel(const Triangle* raw, int n, float3 lo, float3 sc, unsigned int* codes) {
    int i = blockIdx.x * blockDim.x + threadIdx.x;
    if (i >= n) return;
    const Triangle& t = raw[i];
    float cx = (t.v0[0] + t.v1[0] + t.v2[0]) / 3.f;
    float cy = (t.v0[1] + t.v1[1] + t.v2[1]) / 3.f;
    float cz = (t.v0[2] + t.v1[2] + t.v2[2]) / 3.f;
    int x = (int)fminf(fmaxf((cx - lo.x) * sc.x * 1023.f, 0.f), 1023.f);
    int y = (int)fminf(fmaxf((cy - lo.y) * sc.y * 1023.f, 0.f), 1023.f);
    int z = (int)fminf(fmaxf((cz - lo.z) * sc.z * 1023.f, 0.f), 1023.f);
    codes[i] = part1by2(x) | (part1by2(y) << 1) | (part1by2(z) << 2);
}

__global__ void reorder_kernel(const Triangle* raw, const int* order, int n, float4* tg, float4* ts) {
    int i = blockIdx.x * blockDim.x + threadIdx.x;
    if (i >= n) return;
    const Triangle& t = raw[order[i]];
    tg[3 * i] = make_float4(t.v0[0], t.v0[1], t.v0[2], 0.f);
    tg[3 * i + 1] = make_float4(t.v1[0] - t.v0[0], t.v1[1] - t.v0[1], t.v1[2] - t.v0[2], 0.f);
    tg[3 * i + 2] = make_float4(t.v2[0] - t.v0[0], t.v2[1] - t.v0[1], t.v2[2] - t.v0[2], 0.f);
    ts[i] = make_float4(t.color[0], t.color[1], t.color[2], t.mirror);
}

__device__ V<float> radiance_fast(const Scene& s, int pixel, int sid, const Query& q) {
    Ray<float> r = camera<float>(s, pixel, sid);
    V<float> result, through(1.f, 1.f, 1.f);
    for (int depth = 0; depth < s.max_depth; depth++) {
        Hit<float> hit = q.closest(r, 1e20f);
        if (hit.id < 0) { result = result + through * sky(r.d); break; }
        int id = hit.id;
        float4 A = q.tg[3 * id], B = q.tg[3 * id + 1], C = q.tg[3 * id + 2], S = q.ts[id];
        V<float> e1(B.x, B.y, B.z), e2(C.x, C.y, C.z);
        V<float> n = e1.cross(e2).unit();
        if (n.dot(r.d) > 0) n = n * (-1.f);
        V<float> p = r.o + r.d * hit.t + n * 0.001f;
        V<float> l(s.light[0], s.light[1], s.light[2]);
        l = l.unit();
        float cosine = n.dot(l);
        if (cosine < 0) cosine = 0;
        float visible = (cosine > 0 && !q.blocked(Ray<float>{p, l}, 1e20f)) ? 1.f : 0.f;
        int open = 0;
        V<float> axis = (fabs(n.z) < 0.8f) ? V<float>(0.f, 0.f, 1.f) : V<float>(0.f, 1.f, 0.f);
        V<float> tx = axis.cross(n).unit(), ty = n.cross(tx);
        for (int a = 0; a < s.ao; a++) {
            uint32_t key = s.seed + uint32_t(pixel) * 0x9e3779b9u + uint32_t(sid) * 0x85ebca6bu +
                           uint32_t(depth) * 0xc2b2ae35u + uint32_t(a) * 0x27d4eb2du;
            float x = 2.f * sample<float>(key ^ 0x68bc21ebu) - 1.f;
            float y = 2.f * sample<float>(key ^ 0x02e5be93u) - 1.f;
            float z = 0.25f + 0.75f * sample<float>(key ^ 0x967a889bu);
            V<float> dir = (tx * x + ty * y + n * z).unit();
            open += !q.blocked(Ray<float>{p, dir}, s.ao_radius) ? 1 : 0;
        }
        float ambient = s.ao ? float(open) / float(s.ao) : 1.f;
        float value = 0.08f + 0.20f * ambient + 0.72f * cosine * visible;
        V<float> col(S.x, S.y, S.z);
        result = result + through * col * (value * (1.f - S.w));
        through = through * S.w;
        if (S.w == 0.f) break;
        r = Ray<float>{p, (r.d - n * (2.f * r.d.dot(n))).unit()};
    }
    return result;
}

__global__ void __launch_bounds__(256, 6) render_kernel(Scene s, Query q, float* out) {
    int p = blockIdx.x * blockDim.x + threadIdx.x;
    if (p >= s.width * s.height) return;
    float ax = 0.f, ay = 0.f, az = 0.f;
    int sid = 0;
    for (; sid + 1 < s.spp; sid += 2) {
        V<float> c0 = radiance_fast(s, p, sid, q);
        V<float> c1 = radiance_fast(s, p, sid + 1, q);
        ax += c0.x + c1.x; ay += c0.y + c1.y; az += c0.z + c1.z;
    }
    if (sid < s.spp) {
        V<float> c = radiance_fast(s, p, sid, q);
        ax += c.x; ay += c.y; az += c.z;
    }
    float inv = 1.f / float(s.spp);
    out[3 * p] = ax * inv;
    out[3 * p + 1] = ay * inv;
    out[3 * p + 2] = az * inv;
}

static Triangle* d_raw = nullptr;
static unsigned int* d_codes = nullptr;
static unsigned int* d_scodes = nullptr;
static int* d_vals = nullptr;
static int* d_svals = nullptr;
static float4* d_tg = nullptr;
static float4* d_ts = nullptr;
static TNode* d_nodes = nullptr;
static void* d_temp = nullptr;
static size_t temp_bytes = 0;
static int n_max = 0;

static void* h_pinned_raw = nullptr;
static void* h_pinned_codes = nullptr;
static void* h_pinned_vals = nullptr;

static std::vector<unsigned int> h_codes;
static std::vector<int> h_vals;
static std::vector<TNode> h_nodes;
static std::vector<float> h_tlo, h_thi;

static int msb32(unsigned int x) {
    if (!x) return -1;
    int r = 0;
    if (x >> 16) { r += 16; x >>= 16; }
    if (x >> 8) { r += 8; x >>= 8; }
    if (x >> 4) { r += 4; x >>= 4; }
    if (x >> 2) { r += 2; x >>= 2; }
    if (x >> 1) { r += 1; }
    return r;
}

struct TreeBuilder {
    const std::vector<unsigned int>& codes;
    const std::vector<float>& tlo;
    const std::vector<float>& thi;
    std::vector<TNode>& nodes;
    TreeBuilder(const std::vector<unsigned int>& c, const std::vector<float>& lo,
                const std::vector<float>& hi, std::vector<TNode>& nd)
        : codes(c), tlo(lo), thi(hi), nodes(nd) {}
    int build(int l, int r, int pexit) {
        if (r - l <= LEAF) {
            int id = (int)nodes.size();
            TNode n;
            for (int k = 0; k < 3; k++) {
                n.lo[k] = tlo[3 * l + k]; n.hi[k] = thi[3 * l + k];
            }
            for (int j = l; j < r; j++) {
                for (int k = 0; k < 3; k++) {
                    n.lo[k] = fminf(n.lo[k], tlo[3 * j + k]);
                    n.hi[k] = fmaxf(n.hi[k], thi[3 * j + k]);
                }
            }
            n.left = -1; n.right = -1; n.start = l; n.count = r - l; n.exit = pexit;
            nodes.push_back(n);
            return id;
        }
        unsigned int cl = codes[l], cr = codes[r - 1];
        unsigned int x = cl ^ cr;
        int m;
        if (!x) {
            m = (l + r) >> 1;
        } else {
            int d = msb32(x);
            int lo = l + 1, hi = r;
            while (lo < hi) {
                int mid = (lo + hi) >> 1;
                if ((codes[mid] >> d) == (cl >> d)) lo = mid + 1; else hi = mid;
            }
            m = lo;
        }
        int right = build(m, r, pexit);
        int left = build(l, m, right);
        nodes[left].exit = right;
        int id = (int)nodes.size();
        TNode n;
        n.left = left; n.right = right; n.start = 0; n.count = 0; n.exit = pexit;
        const TNode& L = nodes[left];
        const TNode& R = nodes[right];
        for (int k = 0; k < 3; k++) {
            n.lo[k] = fminf(L.lo[k], R.lo[k]);
            n.hi[k] = fmaxf(L.hi[k], R.hi[k]);
        }
        nodes.push_back(n);
        return id;
    }
};

}  // namespace

void init(int max_triangles, int max_pixels, int max_samples) {
    n_max = max_triangles > 1 ? max_triangles : 1;
    cudaMalloc(&d_raw, size_t(n_max) * sizeof(Triangle));
    cudaMalloc(&d_codes, size_t(n_max) * 4);
    cudaMalloc(&d_scodes, size_t(n_max) * 4);
    cudaMalloc(&d_vals, size_t(n_max) * 4);
    cudaMalloc(&d_svals, size_t(n_max) * 4);
    cudaMalloc(&d_tg, size_t(n_max) * 3 * sizeof(float4));
    cudaMalloc(&d_ts, size_t(n_max) * sizeof(float4));
    cudaMalloc(&d_nodes, size_t(2) * n_max * sizeof(TNode));
    temp_bytes = 0;
    cub::DeviceRadixSort::SortPairs(nullptr, temp_bytes,
                                    (const unsigned int*)nullptr, (unsigned int*)nullptr,
                                    (const int*)nullptr, (int*)nullptr,
                                    n_max, 0, 30, 0);
    cudaMalloc(&d_temp, temp_bytes);
    cudaHostAlloc(&h_pinned_raw, size_t(n_max) * sizeof(Triangle), cudaHostAllocDefault);
    cudaHostAlloc(&h_pinned_codes, size_t(n_max) * 4, cudaHostAllocDefault);
    cudaHostAlloc(&h_pinned_vals, size_t(n_max) * 4, cudaHostAllocDefault);
    h_codes.resize(n_max);
    h_vals.resize(n_max);
    h_nodes.resize(2 * size_t(n_max) + 1);
    h_tlo.resize(3 * size_t(n_max));
    h_thi.resize(3 * size_t(n_max));
}

void render(const Scene& scene, float* device_rgb) {
    auto TM = std::chrono::steady_clock::now();
    auto tick = [&]() { return std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - TM).count(); };
    int n = scene.triangle_count;
    if (n <= 0) return;
    float3 lo, hi;
    {
        const Triangle& t0 = scene.triangles[0];
        lo.x = fminf(t0.v0[0], fminf(t0.v1[0], t0.v2[0]));
        lo.y = fminf(t0.v0[1], fminf(t0.v1[1], t0.v2[1]));
        lo.z = fminf(t0.v0[2], fminf(t0.v1[2], t0.v2[2]));
        hi.x = fmaxf(t0.v0[0], fmaxf(t0.v1[0], t0.v2[0]));
        hi.y = fmaxf(t0.v0[1], fmaxf(t0.v1[1], t0.v2[1]));
        hi.z = fmaxf(t0.v0[2], fmaxf(t0.v1[2], t0.v2[2]));
        for (int i = 1; i < n; i++) {
            const Triangle& t = scene.triangles[i];
            for (int k = 0; k < 3; k++) {
                float a = t.v0[k], b = t.v1[k], c = t.v2[k];
                float mn = fminf(a, fminf(b, c)), mx = fmaxf(a, fmaxf(b, c));
                if (k == 0) { if (mn < lo.x) lo.x = mn; if (mx > hi.x) hi.x = mx; }
                else if (k == 1) { if (mn < lo.y) lo.y = mn; if (mx > hi.y) hi.y = mx; }
                else { if (mn < lo.z) lo.z = mn; if (mx > hi.z) hi.z = mx; }
            }
        }
    }
    float3 sc;
    sc.x = (hi.x - lo.x) > 0.f ? 1.f / (hi.x - lo.x) : 0.f;
    sc.y = (hi.y - lo.y) > 0.f ? 1.f / (hi.y - lo.y) : 0.f;
    sc.z = (hi.z - lo.z) > 0.f ? 1.f / (hi.z - lo.z) : 0.f;
    fprintf(stderr, "T aabb=%.2f\n", tick());

    memcpy(h_pinned_raw, scene.triangles, size_t(n) * sizeof(Triangle));
    cudaMemcpyAsync(d_raw, h_pinned_raw, size_t(n) * sizeof(Triangle), cudaMemcpyHostToDevice, 0);
    int blocks = (n + 255) / 256;
    sequence_kernel<<<blocks, 256>>>(d_vals, n);
    morton_kernel<<<blocks, 256>>>(d_raw, n, lo, sc, d_codes);
    cub::DeviceRadixSort::SortPairs(d_temp, temp_bytes, d_codes, d_scodes, d_vals, d_svals,
                                    n, 0, 30, 0);
    reorder_kernel<<<blocks, 256>>>(d_raw, d_svals, n, d_tg, d_ts);
    cudaMemcpyAsync(h_pinned_codes, d_scodes, size_t(n) * 4, cudaMemcpyDeviceToHost, 0);
    cudaMemcpyAsync(h_pinned_vals, d_svals, size_t(n) * 4, cudaMemcpyDeviceToHost, 0);
    cudaStreamSynchronize(0);
    memcpy(h_codes.data(), h_pinned_codes, size_t(n) * 4);
    memcpy(h_vals.data(), h_pinned_vals, size_t(n) * 4);
    fprintf(stderr, "T prep=%.2f\n", tick());

    for (int j = 0; j < n; j++) {
        const Triangle& t = scene.triangles[h_vals[j]];
        for (int k = 0; k < 3; k++) {
            float a = t.v0[k], b = t.v1[k], c = t.v2[k];
            h_tlo[3 * j + k] = fminf(a, fminf(b, c));
            h_thi[3 * j + k] = fmaxf(a, fmaxf(b, c));
        }
    }
    fprintf(stderr, "T jloop=%.2f\n", tick());
    h_nodes.clear();
    TreeBuilder tb(h_codes, h_tlo, h_thi, h_nodes);
    int root = tb.build(0, n, -1);
    fprintf(stderr, "T tree=%.2f nodes=%zu\n", tick(), h_nodes.size());
    cudaMemcpy(d_nodes, h_nodes.data(), h_nodes.size() * sizeof(TNode), cudaMemcpyHostToDevice);

    Query q{d_tg, d_ts, d_nodes, root};
    int npix = scene.width * scene.height;
    int rb = (npix + 255) / 256;
    render_kernel<<<rb, 256>>>(scene, q, device_rgb);
    cudaDeviceSynchronize();
    fprintf(stderr, "T render=%.2f\n", tick());
}

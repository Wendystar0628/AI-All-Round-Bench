// GPU ray tracer: parallel SAH BVH, ordered traversal, precomputed triangle data.
#include "rt.h"
#include "render_math.cuh"
#include <vector>
#include <algorithm>
#include <atomic>
#include <thread>
#include <cstdio>
#include <cstdlib>

// ---------------------------------------------------------------- geometry
struct GTri { float4 v0, e1, e2, col, nrm; };

struct Node { float lo[3], hi[3]; int left, right, start, count; };

// ---------------------------------------------------------------- BVH build
static const int BINS = 16;
static const int LEAF = 4;
static const float CT = 0.1f;
static const int PAR_DEPTH = 7;
static const int MEDIAN_SPLIT = 65536;

struct Builder {
    const Triangle* T;
    int N;
    std::vector<float> lo, hi, cen;
    std::vector<int> order;
    std::vector<Node> nodes;
    std::atomic<int> next{0};

    explicit Builder(const Scene& s) : T(s.triangles), N(s.triangle_count) {
        lo.resize(3 * size_t(N));
        hi.resize(3 * size_t(N));
        cen.resize(3 * size_t(N));
        order.resize(size_t(N));
        for (int i = 0; i < N; i++) {
            const Triangle& t = T[i];
            for (int k = 0; k < 3; k++) {
                float a = t.v0[k], b = t.v1[k], c = t.v2[k];
                lo[3 * i + k] = std::min(a, std::min(b, c));
                hi[3 * i + k] = std::max(a, std::max(b, c));
                cen[3 * i + k] = (lo[3 * i + k] + hi[3 * i + k]) * .5f;
            }
            order[size_t(i)] = i;
        }
        nodes.resize(2 * size_t(N) + 1);
        next.store(0);
        build(0, N, 0);
        nodes.resize(size_t(next.load()));
    }

    static float area(const float* a, const float* b) {
        float x = b[0] - a[0], y = b[1] - a[1], z = b[2] - a[2];
        return x * y + y * z + z * x;
    }

    int build(int b, int e, int depth) {
        Node n{};
        float clo[3], chi[3];
        for (int k = 0; k < 3; k++) { n.lo[k] = clo[k] = 1e30f; n.hi[k] = chi[k] = -1e30f; }
        for (int i = b; i < e; i++) {
            int t = order[size_t(i)];
            for (int k = 0; k < 3; k++) {
                n.lo[k] = std::min(n.lo[k], lo[3 * t + k]);
                n.hi[k] = std::max(n.hi[k], hi[3 * t + k]);
                clo[k] = std::min(clo[k], cen[3 * t + k]);
                chi[k] = std::max(chi[k], cen[3 * t + k]);
            }
        }
        n.start = b; n.count = e - b; n.left = n.right = -1;
        int id = next.fetch_add(1);
        nodes[size_t(id)] = n;
        int cnt = e - b;
        if (cnt <= LEAF || depth >= 60) return id;

        int mid = -1;
        if (cnt > MEDIAN_SPLIT) {
            int axis = 0;
            for (int k = 1; k < 3; k++) if (chi[k] - clo[k] > chi[axis] - clo[axis]) axis = k;
            mid = (b + e) / 2;
            std::nth_element(order.begin() + b, order.begin() + mid, order.begin() + e,
                [&](int x, int y) { return cen[3 * x + axis] < cen[3 * y + axis]; });
        } else {
        float best = 1e30f; int bestAxis = -1, bestBin = 0;
        for (int k = 0; k < 3; k++) {
            float ext = chi[k] - clo[k];
            if (ext < 1e-9f) continue;
            int bc[BINS] = {};
            float blo[BINS][3], bhi[BINS][3];
            for (int j = 0; j < BINS; j++) for (int q = 0; q < 3; q++) { blo[j][q] = 1e30f; bhi[j][q] = -1e30f; }
            float scale = BINS / ext * (1 - 1e-6f);
            for (int i = b; i < e; i++) {
                int t = order[size_t(i)];
                int j = std::min(BINS - 1, int((cen[3 * t + k] - clo[k]) * scale));
                bc[j]++;
                for (int q = 0; q < 3; q++) {
                    blo[j][q] = std::min(blo[j][q], lo[3 * t + q]);
                    bhi[j][q] = std::max(bhi[j][q], hi[3 * t + q]);
                }
            }
            float rarea[BINS]; int rcnt[BINS];
            float alo[3] = {1e30f, 1e30f, 1e30f}, ahi[3] = {-1e30f, -1e30f, -1e30f}; int ac = 0;
            for (int j = BINS - 1; j > 0; j--) {
                ac += bc[j];
                for (int q = 0; q < 3; q++) { alo[q] = std::min(alo[q], blo[j][q]); ahi[q] = std::max(ahi[q], bhi[j][q]); }
                rcnt[j] = ac; rarea[j] = ac ? area(alo, ahi) : 0;
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
        float splitCost = CT + (parentArea > 0 ? best / parentArea : float(cnt));
        if (float(cnt) <= splitCost) return id;
        if (bestAxis >= 0) {
            int k = bestAxis;
            float ext = chi[k] - clo[k], scale = BINS / ext * (1 - 1e-6f), c0 = clo[k];
            mid = int(std::partition(order.begin() + b, order.begin() + e,
                [&](int t) { return std::min(BINS - 1, int((cen[3 * t + k] - c0) * scale)) < bestBin; }) - order.begin());
        }
        if (mid <= b || mid >= e) {
            if (cnt <= 15) return id;
            int axis = 0;
            for (int k = 1; k < 3; k++) if (chi[k] - clo[k] > chi[axis] - clo[axis]) axis = k;
            mid = (b + e) / 2;
            std::nth_element(order.begin() + b, order.begin() + mid, order.begin() + e,
                [&](int x, int y) { return cen[3 * x + axis] < cen[3 * y + axis]; });
        }
        }
        int l, r;
        if (depth < PAR_DEPTH && cnt > 4096) {
            std::thread th([&] { l = build(b, mid, depth + 1); });
            r = build(mid, e, depth + 1);
            th.join();
        } else {
            l = build(b, mid, depth + 1);
            r = build(mid, e, depth + 1);
        }
        nodes[size_t(id)].left = l;
        nodes[size_t(id)].right = r;
        nodes[size_t(id)].count = 0;
        return id;
    }
};

// ---------------------------------------------------------------- device
__device__ inline uint32_t mixd(uint32_t x) { return mix32(x); }
__device__ inline float samplef(uint32_t x) { return (float)(mix32(x) >> 8) * (1.0f / 16777216.0f); }

__device__ __host__ inline float3 operator+(float3 a, float3 b) { return make_float3(a.x + b.x, a.y + b.y, a.z + b.z); }
__device__ __host__ inline float3 operator-(float3 a, float3 b) { return make_float3(a.x - b.x, a.y - b.y, a.z - b.z); }
__device__ __host__ inline float3 operator*(float3 a, float3 b) { return make_float3(a.x * b.x, a.y * b.y, a.z * b.z); }
__device__ __host__ inline float3 operator*(float3 a, float s) { return make_float3(a.x * s, a.y * s, a.z * s); }
__device__ __host__ inline float3 operator*(float s, float3 a) { return make_float3(a.x * s, a.y * s, a.z * s); }
__device__ __host__ inline float3& operator+=(float3& a, float3 b) { a.x += b.x; a.y += b.y; a.z += b.z; return a; }
__device__ __host__ inline float fdot(float3 a, float3 b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
__device__ __host__ inline float3 fcross(float3 a, float3 b) { return make_float3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x); }
__device__ __host__ inline float3 fnorm(float3 a) { return a * (1.0f / sqrtf(fdot(a, a))); }
__device__ __host__ inline float3 f3(float4 v) { return make_float3(v.x, v.y, v.z); }

__device__ inline bool boxT(const Node& n, float3 ro, float3 inv, float tmax, float& tnear) {
    float3 t0 = (make_float3(n.lo[0], n.lo[1], n.lo[2]) - ro) * inv;
    float3 t1 = (make_float3(n.hi[0], n.hi[1], n.hi[2]) - ro) * inv;
    float3 a = make_float3(fminf(t0.x, t1.x), fminf(t0.y, t1.y), fminf(t0.z, t1.z));
    float3 b = make_float3(fmaxf(t0.x, t1.x), fmaxf(t0.y, t1.y), fmaxf(t0.z, t1.z));
    float tn = fmaxf(fmaxf(a.x, a.y), fmaxf(a.z, 0.0002f));
    float tf = fminf(fminf(b.x, b.y), fminf(b.z, tmax));
    tnear = tn;
    return tn <= tf;
}

__device__ inline bool hitTri(const GTri& t, float3 ro, float3 rd, float limit, float& dist) {
    float3 p = fcross(rd, f3(t.e2));
    float det = fdot(f3(t.e1), p);
    if (fabsf(det) < 1e-10f) return false;
    float inv = __fdividef(1.0f, det);
    float3 s = ro - f3(t.v0);
    float u = fdot(s, p) * inv;
    if (u < 0.0f || u > 1.0f) return false;
    float3 q = fcross(s, f3(t.e1));
    float v = fdot(rd, q) * inv;
    if (v < 0.0f || u + v > 1.0f) return false;
    float d = fdot(f3(t.e2), q) * inv;
    if (d <= 0.0002f || d >= limit) return false;
    dist = d;
    return true;
}

struct Query {
    const GTri* __restrict__ tris;
    const Node* __restrict__ nodes;
    const int* __restrict__ ids;

    __device__ const GTri& triangle(int id) const { return tris[id]; }

    __device__ Hit<float> find(float3 ro, float3 rd, float limit, bool any) const {
        float3 inv = make_float3(__fdividef(1.0f, rd.x), __fdividef(1.0f, rd.y), __fdividef(1.0f, rd.z));
        Hit<float> hit{limit, -1};
        int sn[16]; float st[16]; int sp = 0;
        float tn;
        if (!boxT(nodes[0], ro, inv, hit.t, tn)) return hit;
        sn[sp] = 0; st[sp] = tn; sp++;
        while (sp) {
            int ni = sn[--sp];
            float nt = st[sp];
            if (nt > hit.t) continue;
            const Node& n = nodes[ni];
            if (n.count > 0) {
                int base = n.start;
                for (int i = 0; i < n.count; i++) {
                    int id = ids[base + i];
                    float d;
                    if (hitTri(tris[id], ro, rd, hit.t, d)) {
                        hit.t = d; hit.id = id;
                        if (any) return hit;
                    }
                }
            } else {
                float tl, tr;
                bool ol = boxT(nodes[n.left], ro, inv, hit.t, tl);
                bool orr = boxT(nodes[n.right], ro, inv, hit.t, tr);
                if (ol && orr) {
                    if (tl > tr) {
                        sn[sp] = n.left; st[sp] = tl; sp++;
                        sn[sp] = n.right; st[sp] = tr; sp++;
                    } else {
                        sn[sp] = n.right; st[sp] = tr; sp++;
                        sn[sp] = n.left; st[sp] = tl; sp++;
                    }
                } else if (ol) { sn[sp] = n.left; st[sp] = tl; sp++; }
                else if (orr) { sn[sp] = n.right; st[sp] = tr; sp++; }
            }
        }
        return hit;
    }
};

__device__ inline float3 skyf(float3 d) {
    float a = 0.5f * (d.y + 1.0f);
    return make_float3(0.95f, 0.93f, 0.95f) * (1.0f - a) + make_float3(0.40f, 0.55f, 0.85f) * a;
}

__device__ float3 radianceF(const Scene& s, int pixel, int sid, const Query& q, float3 light) {
    uint32_t key = s.seed + (uint32_t)pixel * 0x9e3779b9u + (uint32_t)sid * 0x85ebca6bu;
    float x = ((float)(pixel % s.width) + samplef(key)) / (float)s.width * 2.0f - 1.0f;
    float y = 1.0f - ((float)(pixel / s.width) + samplef(key ^ 0xa511e9b3u)) / (float)s.height * 2.0f;
    float3 ro = make_float3(s.eye[0], s.eye[1], s.eye[2]);
    float3 rd = fnorm(make_float3(s.w[0], s.w[1], s.w[2]) + make_float3(s.u[0], s.u[1], s.u[2]) * x + make_float3(s.v[0], s.v[1], s.v[2]) * y);
    float3 result = make_float3(0, 0, 0), through = make_float3(1, 1, 1);
    for (int depth = 0; depth < s.max_depth; depth++) {
        Hit<float> hit = q.find(ro, rd, 1e20f, false);
        if (hit.id < 0) { result = result + through * skyf(rd); break; }
        const GTri& t = q.triangle(hit.id);
        float3 n = f3(t.nrm);
        if (fdot(n, rd) > 0.0f) n = n * -1.0f;
        float3 p = ro + rd * hit.t + n * 0.001f;
        float cosine = fdot(n, light);
        if (cosine < 0.0f) cosine = 0.0f;
        float visible = (cosine > 0.0f && q.find(p, light, 1e20f, true).id < 0) ? 1.0f : 0.0f;
        int open = 0;
        float3 axis = fabsf(n.z) < 0.8f ? make_float3(0, 0, 1) : make_float3(0, 1, 0);
        float3 tx = fnorm(fcross(axis, n)), ty = fcross(n, tx);
        for (int a = 0; a < s.ao; a++) {
            uint32_t kk = s.seed + (uint32_t)pixel * 0x9e3779b9u + (uint32_t)sid * 0x85ebca6bu
                        + (uint32_t)depth * 0xc2b2ae35u + (uint32_t)a * 0x27d4eb2du;
            float xx = 2.0f * samplef(kk ^ 0x68bc21ebu) - 1.0f;
            float yy = 2.0f * samplef(kk ^ 0x02e5be93u) - 1.0f;
            float z = 0.25f + 0.75f * samplef(kk ^ 0x967a889bu);
            float3 dir = fnorm(tx * xx + ty * yy + n * z);
            if (q.find(p, dir, s.ao_radius, true).id < 0) open++;
        }
        float ambient = s.ao ? (float)open / (float)s.ao : 1.0f;
        float value = 0.08f + 0.20f * ambient + 0.72f * cosine * visible;
        result = result + through * (f3(t.col) * (value * (1.0f - t.v0.w)));
        through = through * t.v0.w;
        if (t.v0.w == 0.0f) break;
        float3 nd = fnorm(rd - n * (2.0f * fdot(rd, n)));
        ro = p; rd = nd;
    }
    return result;
}

__global__ void traceK(Scene s, Query q, float* buf, int offset, int end, float3 light) {
    int i = offset + blockIdx.x * blockDim.x + threadIdx.x;
    if (i >= end) return;
    float3 c = radianceF(s, i / s.spp, i % s.spp, q, light);
    buf[3 * size_t(i - offset)] = c.x;
    buf[3 * size_t(i - offset) + 1] = c.y;
    buf[3 * size_t(i - offset) + 2] = c.z;
}

__global__ void reduceK(Scene s, const float* buf, float* acc, int offset, int end) {
    int p = blockIdx.x * blockDim.x + threadIdx.x;
    if (p >= s.width * s.height) return;
    int pstart = offset / s.spp;
    int pend = (end - 1) / s.spp;
    if (p < pstart || p > pend) return;
    int a = max(offset, p * s.spp);
    int b = min(end, (p + 1) * s.spp);
    float sx = 0, sy = 0, sz = 0;
    for (int j = a; j < b; j++) {
        int idx = j - offset;
        sx += buf[3 * idx]; sy += buf[3 * idx + 1]; sz += buf[3 * idx + 2];
    }
    acc[3 * size_t(p)] += sx;
    acc[3 * size_t(p) + 1] += sy;
    acc[3 * size_t(p) + 2] += sz;
}

__global__ void finishK(Scene s, const float* acc, float* out) {
    int p = blockIdx.x * blockDim.x + threadIdx.x;
    if (p >= s.width * s.height) return;
    float inv = 1.0f / (float)s.spp;
    out[3 * size_t(p)] = acc[3 * size_t(p)] * inv;
    out[3 * size_t(p) + 1] = acc[3 * size_t(p) + 1] * inv;
    out[3 * size_t(p) + 2] = acc[3 * size_t(p) + 2] * inv;
}

// ---------------------------------------------------------------- host
static GTri* dt = nullptr;
static Node* dn = nullptr;
static int* di = nullptr;
static float* samples = nullptr;
static float* accum = nullptr;
static int g_max_pixels = 0;
static const int CAP_SAMPLES = 48 * 1024 * 1024;

static void ck(cudaError_t e) {
    if (e != cudaSuccess) { fprintf(stderr, "solution: %s\n", cudaGetErrorString(e)); exit(2); }
}

void init(int max_triangles, int max_pixels, int max_samples) {
    ck(cudaMalloc(&dt, size_t(max_triangles) * sizeof(GTri)));
    ck(cudaMalloc(&dn, (2 * size_t(max_triangles) + 1) * sizeof(Node)));
    ck(cudaMalloc(&di, size_t(max_triangles) * sizeof(int)));
    long long nsamp = (long long)max_pixels * max_samples;
    int cap = (int)std::min<long long>(nsamp, CAP_SAMPLES);
    ck(cudaMalloc(&samples, size_t(cap) * 3 * sizeof(float)));
    g_max_pixels = max_pixels;
    ck(cudaMalloc(&accum, size_t(max_pixels) * 3 * sizeof(float)));
}

void render(const Scene& s, float* out) {
    Builder tree(s);
    int ntri = s.triangle_count;
    std::vector<GTri> g((size_t(ntri)));
    int nthreads = (int)std::thread::hardware_concurrency();
    if (nthreads < 1) nthreads = 1;
    if (nthreads > 16) nthreads = 16;
    auto fill = [&](int a, int b) {
        for (int i = a; i < b; i++) {
            const Triangle& t = s.triangles[i];
            float3 v0 = make_float3(t.v0[0], t.v0[1], t.v0[2]);
            float3 e1 = make_float3(t.v1[0], t.v1[1], t.v1[2]) - v0;
            float3 e2 = make_float3(t.v2[0], t.v2[1], t.v2[2]) - v0;
            float3 nn = fnorm(fcross(e1, e2));
            g[size_t(i)].v0 = make_float4(v0.x, v0.y, v0.z, t.mirror);
            g[size_t(i)].e1 = make_float4(e1.x, e1.y, e1.z, 0);
            g[size_t(i)].e2 = make_float4(e2.x, e2.y, e2.z, 0);
            g[size_t(i)].col = make_float4(t.color[0], t.color[1], t.color[2], 0);
            g[size_t(i)].nrm = make_float4(nn.x, nn.y, nn.z, 0);
        }
    };
    if (nthreads <= 1 || ntri < 4096) {
        fill(0, ntri);
    } else {
        std::vector<std::thread> ts;
        int chunk = (ntri + nthreads - 1) / nthreads;
        for (int a = 0; a < ntri; a += chunk) {
            int b = std::min(ntri, a + chunk);
            ts.emplace_back([&, a, b] { fill(a, b); });
        }
        for (auto& th : ts) th.join();
    }

    std::vector<Node> nd(tree.nodes.size());
    for (size_t i = 0; i < tree.nodes.size(); i++) {
        nd[i] = tree.nodes[i];
        for (int k = 0; k < 3; k++) { nd[i].lo[k] -= 1e-5f; nd[i].hi[k] += 1e-5f; }
    }

    ck(cudaMemcpy(dt, g.data(), size_t(ntri) * sizeof(GTri), cudaMemcpyHostToDevice));
    ck(cudaMemcpy(dn, nd.data(), nd.size() * sizeof(Node), cudaMemcpyHostToDevice));
    ck(cudaMemcpy(di, tree.order.data(), tree.order.size() * sizeof(int), cudaMemcpyHostToDevice));

    Scene d = s;
    d.triangles = nullptr;
    Query q{dt, dn, di};
    float3 light = fnorm(make_float3(s.light[0], s.light[1], s.light[2]));
    long long total = (long long)s.width * s.height * s.spp;
    ck(cudaMemset(accum, 0, size_t(g_max_pixels) * 3 * sizeof(float)));
    for (long long off = 0; off < total; off += CAP_SAMPLES) {
        int end = (int)std::min<long long>(total, off + CAP_SAMPLES);
        int n = end - (int)off;
        traceK<<<(n + 255) / 256, 256>>>(d, q, samples, (int)off, end, light);
        reduceK<<<(s.width * s.height + 255) / 256, 256>>>(d, samples, accum, (int)off, end);
    }
    finishK<<<(s.width * s.height + 127) / 128, 128>>>(d, accum, out);
    ck(cudaGetLastError());
}









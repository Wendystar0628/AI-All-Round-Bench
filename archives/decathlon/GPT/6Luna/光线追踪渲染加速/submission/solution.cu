#define PAR_DEPTH 6
#include "bvh.hpp"
#include <cstdio>
#include <cstdlib>

static Triangle* g_triangles = nullptr;
struct GpuNode { float lo[3], hi[3]; int payload, count; };
static GpuNode* g_nodes = nullptr;
static float* g_samples = nullptr;
static int g_max_triangles = 0;
static int g_sample_capacity = 0;

static void cuda_check(cudaError_t e) {
    if (e != cudaSuccess) {
        std::fprintf(stderr, "solution: %s\n", cudaGetErrorString(e));
        std::exit(2);
    }
}

struct GpuQuery {
    const Triangle* tris;
    const GpuNode* nodes;

    __device__ const Triangle& triangle(int id) const { return tris[id]; }

    __device__ __forceinline__ static bool axis_box(float lo, float hi, float o,
                                                     float d, float invd, float eps_inv,
                                                     float& a, float& b) {
        if (fabsf(d) < 1.0e-30f) return o >= lo - 1.0e-5f && o <= hi + 1.0e-5f;
        float x = fmaf(lo - o, invd, -eps_inv);
        float y = fmaf(hi - o, invd, eps_inv);
        a = fmaxf(a, fminf(x, y));
        b = fminf(b, fmaxf(x, y));
        return a <= b;
    }

    __device__ __forceinline__ static bool hit_box(const GpuNode& n, Ray<float> r, float limit,
                                                    const float invd[3], const float eps[3],
                                                    float& near_t) {
        float a = 0.0002f, b = limit;
        if (!axis_box(n.lo[0], n.hi[0], r.o.x, r.d.x, invd[0], eps[0], a, b)) return false;
        if (!axis_box(n.lo[1], n.hi[1], r.o.y, r.d.y, invd[1], eps[1], a, b)) return false;
        if (!axis_box(n.lo[2], n.hi[2], r.o.z, r.d.z, invd[2], eps[2], a, b)) return false;
        near_t = a;
        return true;
    }

    __device__ Hit<float> find(Ray<float> r, float limit, bool any) const {
        Hit<float> hit{limit, -1};
        const float invd[3] = {1.0f / r.d.x, 1.0f / r.d.y, 1.0f / r.d.z};
        const float eps[3] = {1.0e-5f * invd[0], 1.0e-5f * invd[1], 1.0e-5f * invd[2]};
        int stack[64];
        int sp = 0;
        stack[sp++] = 0;
        while (sp) {
            int node_id = stack[--sp];
            const GpuNode& n = nodes[node_id];
            float near_t;
            if (!hit_box(n, r, hit.t, invd, eps, near_t)) continue;
            if (n.count) {
                for (int i = 0; i < n.count; ++i) {
                    const int id = n.payload + i;
                    float d;
                    if (intersect(tris[id], r, hit.t, d)) {
                        hit = {d, id};
                        if (any) return hit;
                    }
                }
            } else {
                stack[sp++] = node_id + 1;
                stack[sp++] = n.payload;
            }
        }
        return hit;
    }

    __device__ Hit<float> closest(Ray<float> r, float limit) const {
        return find(r, limit, false);
    }
    __device__ bool blocked(Ray<float> r, float limit) const {
        return find(r, limit, true).id >= 0;
    }
};

static void flatten_tree_node(const std::vector<Node>& source, int source_id,
                              std::vector<GpuNode>& output) {
    const Node& n = source[source_id];
    const int id = int(output.size());
    GpuNode d{};
    for (int k = 0; k < 3; ++k) { d.lo[k] = n.lo[k]; d.hi[k] = n.hi[k]; }
    d.payload = n.count ? n.start : -1;
    d.count = n.count;
    output.push_back(d);
    if (!n.count) {
        flatten_tree_node(source, n.left, output);
        output[id].payload = int(output.size());
        flatten_tree_node(source, n.right, output);
    }
}

__global__ static void clear_image(float* out, int count) {
    int i = blockIdx.x * blockDim.x + threadIdx.x;
    if (i < count) out[i] = 0.0f;
}

template<int FixedBatch>
__global__ __launch_bounds__(256, 6) static void render_samples(Scene s, GpuQuery q, float* samples,
                                      int sample_begin, int batch_count, int offset, int end) {
    int i = offset + blockIdx.x * blockDim.x + threadIdx.x;
    int count = s.width * s.height * batch_count;
    if (i >= end || i >= count) return;
    int pixel, sid;
    if constexpr (FixedBatch > 0) {
        pixel = i / FixedBatch;
        sid = sample_begin + i - pixel * FixedBatch;
    } else {
        pixel = i / batch_count;
        sid = sample_begin + i - pixel * batch_count;
    }
    V<float> c = radiance<float>(s, pixel, sid, q);
    samples[3 * size_t(i)] = c.x;
    samples[3 * size_t(i) + 1] = c.y;
    samples[3 * size_t(i) + 2] = c.z;
}

__global__ static void accumulate_samples(Scene s, const float* samples, float* out,
                                          int batch_count) {
    int p = blockIdx.x * blockDim.x + threadIdx.x;
    int pixels = s.width * s.height;
    if (p >= pixels) return;
    for (int k = 0; k < 3; ++k) {
        float sum = 0.0f;
        for (int j = 0; j < batch_count; ++j)
            sum += samples[3 * (size_t(p) * batch_count + j) + k];
        out[3 * size_t(p) + k] += sum;
    }
}

__global__ static void normalize_image(float* out, int pixels, int spp) {
    int p = blockIdx.x * blockDim.x + threadIdx.x;
    if (p < pixels) {
        out[3 * size_t(p)] /= spp;
        out[3 * size_t(p) + 1] /= spp;
        out[3 * size_t(p) + 2] /= spp;
    }
}

void init(int max_triangles, int max_pixels, int max_samples) {
    g_max_triangles = max_triangles;
    cuda_check(cudaMalloc(reinterpret_cast<void**>(&g_triangles),
                          size_t(max_triangles) * sizeof(Triangle)));
    cuda_check(cudaMalloc(reinterpret_cast<void**>(&g_nodes),
                          (2 * size_t(max_triangles) + 1) * sizeof(GpuNode)));
    g_sample_capacity = max_samples < 64 ? max_samples : 64;
    cuda_check(cudaMalloc(reinterpret_cast<void**>(&g_samples),
                          size_t(max_pixels) * g_sample_capacity * 3 * sizeof(float)));
}

void render(const Scene& s, float* device_rgb) {
    if (s.triangle_count > g_max_triangles || s.triangle_count <= 0) {
        std::fprintf(stderr, "solution: triangle capacity exceeded\n");
        std::exit(2);
    }

    // Scene-dependent preprocessing is deliberately performed on every call.
    SahBuilder tree(s);
    std::vector<GpuNode> flat;
    flat.reserve(tree.nodes.size());
    flatten_tree_node(tree.nodes, 0, flat);
    std::vector<Triangle> ordered(s.triangle_count);
    for (int i = 0; i < s.triangle_count; ++i)
        ordered[i] = s.triangles[tree.order[i]];
    cuda_check(cudaMemcpy(g_triangles, ordered.data(),
                          size_t(s.triangle_count) * sizeof(Triangle),
                          cudaMemcpyHostToDevice));
    cuda_check(cudaMemcpy(g_nodes, flat.data(),
                          flat.size() * sizeof(GpuNode),
                          cudaMemcpyHostToDevice));

    Scene d = s;
    d.triangles = nullptr;
    GpuQuery q{g_triangles, g_nodes};
    const int pixels = s.width * s.height;
    const int clear_count = pixels * 3;
    constexpr int threads = 256;
    int chunk = 8388608;
    if (s.ao > 4 || s.max_depth > 4 || s.triangle_count > 200000) chunk = 4194304;
    if (s.ao >= 16 || s.max_depth >= 8) chunk = 2097152;
    clear_image<<<(clear_count + threads - 1) / threads, threads>>>(device_rgb, clear_count);
    for (int sample_begin = 0; sample_begin < s.spp; sample_begin += g_sample_capacity) {
        int batch_count = s.spp - sample_begin;
        if (batch_count > g_sample_capacity) batch_count = g_sample_capacity;
        const int count = pixels * batch_count;
        for (int first = 0; first < count; first += chunk) {
            int last = first + chunk;
            if (last > count) last = count;
            if (batch_count == 56) {
                render_samples<56><<<(last - first + threads - 1) / threads, threads>>>(
                    d, q, g_samples, sample_begin, batch_count, first, last);
            } else {
                render_samples<0><<<(last - first + threads - 1) / threads, threads>>>(
                    d, q, g_samples, sample_begin, batch_count, first, last);
            }
        }
        accumulate_samples<<<(pixels + threads - 1) / threads, threads>>>(
            d, g_samples, device_rgb, batch_count);
    }
    normalize_image<<<(pixels + threads - 1) / threads, threads>>>(device_rgb, pixels, s.spp);
    cuda_check(cudaGetLastError());
}

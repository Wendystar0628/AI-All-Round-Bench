#include "render_math.cuh"
#include <cuda_runtime.h>
#include <algorithm>
#include <atomic>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <thread>
#include <vector>
#include <chrono>

struct GpuTri {
    float v0[3], e1[3], e2[3], normal[3], color[3], mirror;
};
static_assert(sizeof(GpuTri) == 64, "unexpected triangle layout");

struct BvhNode {
    float lo[3], hi[3];
    int a, b;
};
static_assert(sizeof(BvhNode) == 32, "unexpected node layout");

static unsigned char* device_arena;
static unsigned char* host_arena;
static std::vector<float> bounds_lo, bounds_hi, centers;
static std::vector<BvhNode> build_nodes;
static std::vector<int> subtree_sizes;
struct PixelHit { float distance; int id; };
static PixelHit* pixel_hits;
static float* direct_light;

static void check_cuda(cudaError_t error) {
    if (error != cudaSuccess) {
        std::fprintf(stderr, "solution: %s\n", cudaGetErrorString(error));
        std::exit(2);
    }
}

class Builder {
    const Triangle* triangles;
    GpuTri* gpu_triangles;
    BvhNode* nodes;
    int* order;
    int count;
    std::atomic<int> next;
    float* lo;
    float* hi;
    float* cen;

    static float area(const float* a, const float* b) {
        float x = b[0] - a[0], y = b[1] - a[1], z = b[2] - a[2];
        return x * y + y * z + z * x;
    }

    int build(int begin, int end, int depth) {
        constexpr int bins = 4;
        constexpr int leaf_size = 6;
        BvhNode node{};
        float centroid_lo[3], centroid_hi[3];
        for (int k = 0; k < 3; ++k) {
            node.lo[k] = centroid_lo[k] = 1e30f;
            node.hi[k] = centroid_hi[k] = -1e30f;
        }
        for (int i = begin; i < end; ++i) {
            int id = order[i];
            for (int k = 0; k < 3; ++k) {
                node.lo[k] = std::min(node.lo[k], lo[3 * id + k]);
                node.hi[k] = std::max(node.hi[k], hi[3 * id + k]);
                centroid_lo[k] = std::min(centroid_lo[k], cen[3 * id + k]);
                centroid_hi[k] = std::max(centroid_hi[k], cen[3 * id + k]);
            }
        }
        int id = next.fetch_add(1, std::memory_order_relaxed);
        int count = end - begin;
        node.a = begin;
        node.b = -count;
        nodes[id] = node;
        if (count <= 3 || depth >= 48) return id;

        float best = 1e30f;
        int best_axis = -1, best_bin = 0;
        for (int k = 0; k < 3; ++k) {
            float extent = centroid_hi[k] - centroid_lo[k];
            if (extent < 1e-9f) continue;
            int bin_count[bins] = {};
            float bin_lo[bins][3], bin_hi[bins][3];
            for (int j = 0; j < bins; ++j) {
                for (int q = 0; q < 3; ++q) {
                    bin_lo[j][q] = 1e30f;
                    bin_hi[j][q] = -1e30f;
                }
            }
            float scale = bins / extent * (1.0f - 1e-6f);
            for (int i = begin; i < end; ++i) {
                int triangle = order[i];
                int j = std::min(bins - 1, int((cen[3 * triangle + k] - centroid_lo[k]) * scale));
                ++bin_count[j];
                for (int q = 0; q < 3; ++q) {
                    bin_lo[j][q] = std::min(bin_lo[j][q], lo[3 * triangle + q]);
                    bin_hi[j][q] = std::max(bin_hi[j][q], hi[3 * triangle + q]);
                }
            }
            float right_area[bins];
            int right_count[bins];
            float alo[3] = {1e30f, 1e30f, 1e30f};
            float ahi[3] = {-1e30f, -1e30f, -1e30f};
            int accumulated = 0;
            for (int j = bins - 1; j > 0; --j) {
                accumulated += bin_count[j];
                for (int q = 0; q < 3; ++q) {
                    alo[q] = std::min(alo[q], bin_lo[j][q]);
                    ahi[q] = std::max(ahi[q], bin_hi[j][q]);
                }
                right_count[j] = accumulated;
                right_area[j] = accumulated ? area(alo, ahi) : 0.0f;
            }
            for (int q = 0; q < 3; ++q) {
                alo[q] = 1e30f;
                ahi[q] = -1e30f;
            }
            accumulated = 0;
            for (int j = 1; j < bins; ++j) {
                accumulated += bin_count[j - 1];
                for (int q = 0; q < 3; ++q) {
                    alo[q] = std::min(alo[q], bin_lo[j - 1][q]);
                    ahi[q] = std::max(ahi[q], bin_hi[j - 1][q]);
                }
                if (!accumulated || !right_count[j]) continue;
                float cost = area(alo, ahi) * accumulated + right_area[j] * right_count[j];
                if (cost < best) {
                    best = cost;
                    best_axis = k;
                    best_bin = j;
                }
            }
        }
        float parent_area = area(node.lo, node.hi);
        float split_cost = 1.0f + (parent_area > 0.0f ? best / parent_area : float(count));
        if (count <= leaf_size && float(count) <= split_cost) return id;

        int middle = -1;
        if (best_axis >= 0) {
            float extent = centroid_hi[best_axis] - centroid_lo[best_axis];
            float scale = bins / extent * (1.0f - 1e-6f);
            float origin = centroid_lo[best_axis];
            middle = int(std::partition(order + begin, order + end, [&](int triangle) {
                return std::min(bins - 1, int((cen[3 * triangle + best_axis] - origin) * scale)) < best_bin;
            }) - order);
        }
        if (middle <= begin || middle >= end) {
            if (count <= 15) return id;
            int axis = 0;
            for (int k = 1; k < 3; ++k) {
                if (centroid_hi[k] - centroid_lo[k] > centroid_hi[axis] - centroid_lo[axis]) axis = k;
            }
            middle = (begin + end) / 2;
            std::nth_element(order + begin, order + middle, order + end, [&](int x, int y) {
                return cen[3 * x + axis] < cen[3 * y + axis];
            });
        }
        int left, right;
        if (depth < 7 && count > 1024) {
            std::thread thread([&] { left = build(begin, middle, depth + 1); });
            right = build(middle, end, depth + 1);
            thread.join();
        } else {
            left = build(begin, middle, depth + 1);
            right = build(middle, end, depth + 1);
        }
        nodes[id].a = left;
        nodes[id].b = right;
        return id;
    }

public:
    Builder(const Scene& scene, GpuTri* gt, BvhNode* n, int* o, float* l, float* h, float* c)
        : triangles(scene.triangles), gpu_triangles(gt), nodes(n), order(o), count(scene.triangle_count), next(0), lo(l), hi(h), cen(c) {
        for (int i = 0; i < count; ++i) {
            const Triangle& source = triangles[i];
            GpuTri& target = gpu_triangles[i];
            for (int k = 0; k < 3; ++k) {
                target.v0[k] = source.v0[k];
                target.e1[k] = source.v1[k] - source.v0[k];
                target.e2[k] = source.v2[k] - source.v0[k];
                target.color[k] = source.color[k];
                float a = source.v0[k], b = source.v1[k], c2 = source.v2[k];
                lo[3 * i + k] = std::min(a, std::min(b, c2));
                hi[3 * i + k] = std::max(a, std::max(b, c2));
                cen[3 * i + k] = (lo[3 * i + k] + hi[3 * i + k]) * 0.5f;
            }
            target.normal[0] = target.e1[1] * target.e2[2] - target.e1[2] * target.e2[1];
            target.normal[1] = target.e1[2] * target.e2[0] - target.e1[0] * target.e2[2];
            target.normal[2] = target.e1[0] * target.e2[1] - target.e1[1] * target.e2[0];
            float length = std::sqrt(target.normal[0] * target.normal[0] + target.normal[1] * target.normal[1] + target.normal[2] * target.normal[2]);
            float inverse = 1.0f / length;
            for (int k = 0; k < 3; ++k) target.normal[k] *= inverse;
            target.mirror = source.mirror;
            order[i] = i;
        }
    }

    int build() { return build(0, count, 0), next.load(std::memory_order_relaxed); }
};

static int measure_tree(int old, const BvhNode* source, int* sizes) {
    int size = 1;
    if (source[old].b >= 0) {
        size += measure_tree(source[old].a, source, sizes);
        size += measure_tree(source[old].b, source, sizes);
    }
    sizes[old] = size;
    return size;
}

static int compact_tree(int old, const BvhNode* source, BvhNode* destination,
                        const int* sizes, int& next) {
    int id = next++;
    destination[id] = source[old];
    for (int k = 0; k < 3; ++k) {
        destination[id].lo[k] = source[old].lo[k] - 1e-5f;
        destination[id].hi[k] = source[old].hi[k] + 1e-5f;
    }
    if (source[old].b >= 0) {
        int left = id + 1;
        int right = left + sizes[source[old].a];
        compact_tree(source[old].a, source, destination, sizes, next);
        compact_tree(source[old].b, source, destination, sizes, next);
        destination[id].a = left;
        destination[id].b = right;
    }
    return id;
}

struct Query {
    const GpuTri* triangles;
    const BvhNode* nodes;
    const int* ids;
    V<float> light, light_inverse;

    __device__ static bool box(const BvhNode& node, const V<float>& scaled_origin, const V<float>& inverse,
                               float limit, float& near_distance) {
        float near_t = 0.0002f, far_t = limit;
        float4 packed0 = *reinterpret_cast<const float4*>(node.lo);
        float2 packed1 = *reinterpret_cast<const float2*>(node.lo + 4);
        float x0 = fmaf(packed0.x, inverse.x, -scaled_origin.x);
        float x1 = fmaf(packed0.w, inverse.x, -scaled_origin.x);
        near_t = fmaxf(near_t, fminf(x0, x1));
        far_t = fminf(far_t, fmaxf(x0, x1));
        float y0 = fmaf(packed0.y, inverse.y, -scaled_origin.y);
        float y1 = fmaf(packed1.x, inverse.y, -scaled_origin.y);
        near_t = fmaxf(near_t, fminf(y0, y1));
        far_t = fminf(far_t, fmaxf(y0, y1));
        float z0 = fmaf(packed0.z, inverse.z, -scaled_origin.z);
        float z1 = fmaf(packed1.y, inverse.z, -scaled_origin.z);
        near_t = fmaxf(near_t, fminf(z0, z1));
        far_t = fminf(far_t, fmaxf(z0, z1));
        near_distance = near_t;
        return near_t <= far_t;
    }

    __device__ static bool triangle_hit(const GpuTri& triangle, const Ray<float>& ray,
                                        float limit, float& distance) {
        float4 packed0 = *reinterpret_cast<const float4*>(triangle.v0);
        float4 packed1 = *reinterpret_cast<const float4*>(triangle.v0 + 4);
        float packed2 = triangle.e2[2];
        V<float> v0(packed0.x, packed0.y, packed0.z);
        V<float> e1(packed0.w, packed1.x, packed1.y);
        V<float> e2(packed1.z, packed1.w, packed2);
        V<float> p = ray.d.cross(e2);
        float determinant = e1.dot(p);
        if (fabsf(determinant) < 1e-10f) return false;
        float inverse = 1.0f / determinant;
        V<float> s = ray.o - v0;
        float u = s.dot(p) * inverse;
        if (u < 0.0f || u > 1.0f) return false;
        V<float> q = s.cross(e1);
        float v = ray.d.dot(q) * inverse;
        if (v < 0.0f || u + v > 1.0f) return false;
        float d = e2.dot(q) * inverse;
        if (d <= 0.0002f || d >= limit) return false;
        distance = d;
        return true;
    }

    template<bool Any>
    __device__ Hit<float> find(const Ray<float>& ray, float limit, V<float> inverse) const {
        Hit<float> hit{limit, -1};
        V<float> scaled_origin(ray.o.x * inverse.x, ray.o.y * inverse.y, ray.o.z * inverse.z);
        float quiet_nan = __int_as_float(0x7fc00000);
        if (ray.d.x == 0.0f) scaled_origin.x = quiet_nan;
        if (ray.d.y == 0.0f) scaled_origin.y = quiet_nan;
        if (ray.d.z == 0.0f) scaled_origin.z = quiet_nan;
        int stack[64];
        int stack_size = 0;
        int current = 0;
        while (true) {
            const BvhNode& node = nodes[current];
            if (node.b < 0) {
                int count = -node.b;
                for (int i = 0; i < count; ++i) {
                    int id = ids[node.a + i];
                    float distance;
                    if (triangle_hit(triangles[id], ray, hit.t, distance)) {
                        hit.t = distance;
                        hit.id = id;
                        if (Any) return hit;
                    }
                }
                if (!stack_size) break;
                current = stack[--stack_size];
            } else {
                int left = node.a, right = node.b;
                float left_near, right_near;
                bool hit_left = box(nodes[left], scaled_origin, inverse, hit.t, left_near);
                bool hit_right = box(nodes[right], scaled_origin, inverse, hit.t, right_near);
                if (hit_left && hit_right) {
                    if constexpr (!Any) {
                        if (right_near < left_near) { int temporary = left; left = right; right = temporary; }
                    }
                    stack[stack_size++] = right;
                    current = left;
                } else if (hit_left) {
                    current = left;
                } else if (hit_right) {
                    current = right;
                } else {
                    if (!stack_size) break;
                    current = stack[--stack_size];
                }
            }
        }
        return hit;
    }

    template<bool Any>
    __device__ Hit<float> find(const Ray<float>& ray, float limit) const {
        return find<Any>(ray, limit, V<float>(1.0f / ray.d.x, 1.0f / ray.d.y, 1.0f / ray.d.z));
    }
    __device__ Hit<float> closest(const Ray<float>& ray, float limit) { return find<false>(ray, limit); }
    __device__ bool blocked(const Ray<float>& ray, float limit) { return find<true>(ray, limit).id >= 0; }
    __device__ bool blocked_light(const Ray<float>& ray, float limit) { return find<true>(ray, limit, light_inverse).id >= 0; }
};

static __device__ V<float> triangle_normal(const GpuTri& triangle) {
    float4 packed = *reinterpret_cast<const float4*>(triangle.v0 + 8);
    return V<float>(packed.y, packed.z, packed.w);
}

static __device__ float4 triangle_material(const GpuTri& triangle) {
    return *reinterpret_cast<const float4*>(triangle.v0 + 12);
}

template<int Ao>
static __device__ float direct_value(const Scene& scene, int pixel, int sample_id, int depth, Query& query,
                                     const V<float>& point, const V<float>& normal, const V<float>& light) {
    float cosine = normal.dot(light);
    if (cosine < 0.0f) cosine = 0.0f;
    float visible = cosine > 0.0f && !query.blocked_light({point, light}, 1e20f) ? 1.0f : 0.0f;
    int open = 0;
    V<float> axis = fabsf(normal.z) < 0.8f ? V<float>(0, 0, 1) : V<float>(0, 1, 0);
    V<float> tx = axis.cross(normal).unit(), ty = normal.cross(tx);
    int ao = Ao < 0 ? scene.ao : Ao;
    for (int a = 0; a < ao; ++a) {
        uint32_t key = scene.seed + uint32_t(pixel) * 0x9e3779b9u + uint32_t(sample_id) * 0x85ebca6bu
                     + uint32_t(depth) * 0xc2b2ae35u + uint32_t(a) * 0x27d4eb2du;
        float x = 2.0f * sample<float>(key ^ 0x68bc21ebu) - 1.0f;
        float y = 2.0f * sample<float>(key ^ 0x02e5be93u) - 1.0f;
        float z = 0.25f + 0.75f * sample<float>(key ^ 0x967a889bu);
        V<float> direction = (tx * x + ty * y + normal * z).unit();
        open += !query.blocked({point, direction}, scene.ao_radius);
    }
    float ambient;
    if constexpr (Ao == 0) ambient = 1.0f;
    else ambient = float(open) / float(ao);
    return 0.08f + 0.20f * ambient + 0.72f * cosine * visible;
}

template<int Ao>
static __device__ V<float> reflection_radiance(const Scene& scene, int pixel, int sample_id, Query& query,
                                               Ray<float> ray, Hit<float> hit) {
    V<float> result;
    const GpuTri& first = query.triangles[hit.id];
    float4 first_material = triangle_material(first);
    V<float> normal = triangle_normal(first);
    if (normal.dot(ray.d) > 0.0f) normal = normal * -1.0f;
    V<float> point = ray.o + ray.d * hit.t + normal * 0.001f;
    float through = first_material.w;
    ray = {point, (ray.d - normal * (2.0f * ray.d.dot(normal))).unit()};
    const V<float>& light = query.light;
#pragma unroll 1
    for (int depth = 1; depth < scene.max_depth; ++depth) {
        hit = query.closest(ray, 1e20f);
        if (hit.id < 0) {
            result = result + sky(ray.d) * through;
            break;
        }
        const GpuTri& triangle = query.triangles[hit.id];
        float4 material = triangle_material(triangle);
        normal = triangle_normal(triangle);
        if (normal.dot(ray.d) > 0.0f) normal = normal * -1.0f;
        point = ray.o + ray.d * hit.t + normal * 0.001f;
        float value = direct_value<Ao>(scene, pixel, sample_id, depth, query, point, normal, light);
        V<float> weighted_color(material.x * through, material.y * through, material.z * through);
        result = result + weighted_color * (value * (1.0f - material.w));
        through = through * material.w;
        if (material.w == 0.0f) break;
        ray = {point, (ray.d - normal * (2.0f * ray.d.dot(normal))).unit()};
    }
    return result;
}

static __global__ __launch_bounds__(128, 12) void trace_primary(Scene scene, Query query, PixelHit* hits,
                                                               float* output, int sample_id, int begin, int end) {
    int pixel = begin + blockIdx.x * blockDim.x + threadIdx.x;
    if (pixel >= end) return;
    Ray<float> ray = camera<float>(scene, pixel, sample_id);
    Hit<float> hit = query.closest(ray, 1e20f);
    hits[pixel] = {hit.t, hit.id};
    if (hit.id < 0) {
        V<float> color = sky(ray.d);
        size_t offset = 3 * size_t(pixel);
        if (sample_id) {
            output[offset] += color.x;
            output[offset + 1] += color.y;
            output[offset + 2] += color.z;
        } else {
            output[offset] = color.x;
            output[offset + 1] = color.y;
            output[offset + 2] = color.z;
        }
    }
}

static __global__ __launch_bounds__(128, 12) void trace_shadow(Scene scene, Query query, const PixelHit* hits,
                                                               float* light_term, int sample_id, int begin, int end) {
    int pixel = begin + blockIdx.x * blockDim.x + threadIdx.x;
    if (pixel >= end) return;
    PixelHit saved = hits[pixel];
    if (saved.id < 0) return;
    Ray<float> ray = camera<float>(scene, pixel, sample_id);
    const GpuTri& triangle = query.triangles[saved.id];
    V<float> normal = triangle_normal(triangle);
    if (normal.dot(ray.d) > 0.0f) normal = normal * -1.0f;
    V<float> point = ray.o + ray.d * saved.distance + normal * 0.001f;
    float cosine = normal.dot(query.light);
    if (cosine < 0.0f) cosine = 0.0f;
    float visible = cosine > 0.0f && !query.blocked_light({point, query.light}, 1e20f) ? 1.0f : 0.0f;
    light_term[pixel] = 0.72f * cosine * visible;
}

template<int Ao>
static __global__ __launch_bounds__(128, 12) void trace_ao(Scene scene, Query query, const PixelHit* hits,
                                                           const float* light_term, float* output,
                                                           int sample_id, int begin, int end) {
    int pixel = begin + blockIdx.x * blockDim.x + threadIdx.x;
    if (pixel >= end) return;
    PixelHit saved = hits[pixel];
    if (saved.id < 0) return;
    Ray<float> ray = camera<float>(scene, pixel, sample_id);
    const GpuTri& triangle = query.triangles[saved.id];
    float4 material = triangle_material(triangle);
    V<float> normal = triangle_normal(triangle);
    if (normal.dot(ray.d) > 0.0f) normal = normal * -1.0f;
    V<float> point = ray.o + ray.d * saved.distance + normal * 0.001f;
    int open = 0;
    V<float> axis = fabsf(normal.z) < 0.8f ? V<float>(0, 0, 1) : V<float>(0, 1, 0);
    V<float> tx = axis.cross(normal).unit(), ty = normal.cross(tx);
    int ao = Ao < 0 ? scene.ao : Ao;
    for (int a = 0; a < ao; ++a) {
        uint32_t key = scene.seed + uint32_t(pixel) * 0x9e3779b9u + uint32_t(sample_id) * 0x85ebca6bu
                     + uint32_t(a) * 0x27d4eb2du;
        float x = 2.0f * sample<float>(key ^ 0x68bc21ebu) - 1.0f;
        float y = 2.0f * sample<float>(key ^ 0x02e5be93u) - 1.0f;
        float z = 0.25f + 0.75f * sample<float>(key ^ 0x967a889bu);
        V<float> direction = (tx * x + ty * y + normal * z).unit();
        open += !query.blocked({point, direction}, scene.ao_radius);
    }
    float ambient;
    if constexpr (Ao == 0) ambient = 1.0f;
    else ambient = float(open) / float(ao);
    float value = 0.08f + 0.20f * ambient + light_term[pixel];
    V<float> color = V<float>(material.x, material.y, material.z) * (value * (1.0f - material.w));
    size_t offset = 3 * size_t(pixel);
    if (sample_id) {
        output[offset] += color.x;
        output[offset + 1] += color.y;
        output[offset + 2] += color.z;
    } else {
        output[offset] = color.x;
        output[offset + 1] = color.y;
        output[offset + 2] = color.z;
    }
}

template<int Ao>
static __global__ __launch_bounds__(128, 12) void trace_reflection(Scene scene, Query query, const PixelHit* hits,
                                                                  float* output, int sample_id, int begin, int end) {
    int pixel = begin + blockIdx.x * blockDim.x + threadIdx.x;
    if (pixel >= end) return;
    PixelHit saved = hits[pixel];
    if (saved.id < 0 || scene.max_depth <= 1 || query.triangles[saved.id].mirror == 0.0f) return;
    Ray<float> ray = camera<float>(scene, pixel, sample_id);
    V<float> color = reflection_radiance<Ao>(scene, pixel, sample_id, query, ray, {saved.distance, saved.id});
    size_t offset = 3 * size_t(pixel);
    output[offset] += color.x;
    output[offset + 1] += color.y;
    output[offset + 2] += color.z;
}

template<int Ao>
static void launch_shading(Scene scene, Query query, float* output, int sample_id, int begin, int count) {
    trace_shadow<<<(count + 127) / 128, 128>>>(scene, query, pixel_hits, direct_light, sample_id, begin, begin + count);
    trace_ao<Ao><<<(count + 127) / 128, 128>>>(scene, query, pixel_hits, direct_light, output, sample_id, begin, begin + count);
    trace_reflection<Ao><<<(count + 127) / 128, 128>>>(scene, query, pixel_hits, output, sample_id, begin, begin + count);
}

static __global__ void scale_output(int pixels, int samples, float* output) {
    int pixel = blockIdx.x * blockDim.x + threadIdx.x;
    if (pixel >= pixels) return;
    output[3 * size_t(pixel)] /= float(samples);
    output[3 * size_t(pixel) + 1] /= float(samples);
    output[3 * size_t(pixel) + 2] /= float(samples);
}

void init(int max_triangles, int max_pixels, int max_samples) {
    size_t arena_size = size_t(max_triangles) * (sizeof(GpuTri) + 2 * sizeof(BvhNode) + sizeof(int)) + sizeof(BvhNode);
    check_cuda(cudaMalloc(&device_arena, arena_size));
    check_cuda(cudaHostAlloc(&host_arena, arena_size, cudaHostAllocPortable));
    check_cuda(cudaMalloc(&pixel_hits, size_t(max_pixels) * sizeof(PixelHit)));
    check_cuda(cudaMalloc(&direct_light, size_t(max_pixels) * sizeof(float)));
    bounds_lo.resize(3 * size_t(max_triangles));
    bounds_hi.resize(3 * size_t(max_triangles));
    centers.resize(3 * size_t(max_triangles));
    build_nodes.resize(2 * size_t(max_triangles) + 1);
    subtree_sizes.resize(2 * size_t(max_triangles) + 1);
}

void render(const Scene& scene, float* device_rgb) {
#ifdef PROFILE
    auto profile0 = std::chrono::steady_clock::now();
#endif
    size_t triangle_bytes = size_t(scene.triangle_count) * sizeof(GpuTri);
    size_t max_nodes = 2 * size_t(scene.triangle_count) + 1;
    GpuTri* host_triangles = reinterpret_cast<GpuTri*>(host_arena);
    BvhNode* host_nodes = reinterpret_cast<BvhNode*>(host_arena + triangle_bytes);
    int* host_order = reinterpret_cast<int*>(host_arena + triangle_bytes + max_nodes * sizeof(BvhNode));
    Builder builder(scene, host_triangles, build_nodes.data(), host_order,
                    bounds_lo.data(), bounds_hi.data(), centers.data());
#ifdef PROFILE
    auto profile_a = std::chrono::steady_clock::now();
#endif
    int node_count = builder.build();
#ifdef PROFILE
    auto profile_b = std::chrono::steady_clock::now();
#endif
    size_t node_bytes = size_t(node_count) * sizeof(BvhNode);
    measure_tree(0, build_nodes.data(), subtree_sizes.data());
    int compacted = 0;
    compact_tree(0, build_nodes.data(), host_nodes, subtree_sizes.data(), compacted);
    int* packed_order = reinterpret_cast<int*>(host_arena + triangle_bytes + node_bytes);
    std::memmove(packed_order, host_order, size_t(scene.triangle_count) * sizeof(int));
#ifdef PROFILE
    auto profile_c = std::chrono::steady_clock::now();
#endif

    GpuTri* device_triangles = reinterpret_cast<GpuTri*>(device_arena);
    BvhNode* device_nodes = reinterpret_cast<BvhNode*>(device_arena + triangle_bytes);
    int* device_ids = reinterpret_cast<int*>(device_arena + triangle_bytes + node_bytes);
    check_cuda(cudaMemcpy(device_arena, host_arena, triangle_bytes + node_bytes + size_t(scene.triangle_count) * sizeof(int), cudaMemcpyHostToDevice));

    Scene device_scene = scene;
    device_scene.triangles = nullptr;
    V<float> light = V<float>(scene.light).unit();
    V<float> light_inverse(1.0f / light.x, 1.0f / light.y, 1.0f / light.z);
    Query query{device_triangles, device_nodes, device_ids, light, light_inverse};
    int pixels = scene.width * scene.height;
    int tile = (scene.ao > 4 || scene.max_depth > 4) ? 262144 : pixels;
#ifdef PROFILE
    check_cuda(cudaDeviceSynchronize());
    auto profile1 = std::chrono::steady_clock::now();
#endif
    for (int sample_id = 0; sample_id < scene.spp; ++sample_id) {
        for (int begin = 0; begin < pixels; begin += tile) {
            int end = std::min(pixels, begin + tile);
            int count = end - begin;
            trace_primary<<<(count + 127) / 128, 128>>>(device_scene, query, pixel_hits, device_rgb, sample_id, begin, end);
            if (scene.ao == 0) launch_shading<0>(device_scene, query, device_rgb, sample_id, begin, count);
            else if (scene.ao == 1) launch_shading<1>(device_scene, query, device_rgb, sample_id, begin, count);
            else launch_shading<-1>(device_scene, query, device_rgb, sample_id, begin, count);
        }
    }
    scale_output<<<(pixels + 255) / 256, 256>>>(pixels, scene.spp, device_rgb);
    check_cuda(cudaGetLastError());
#ifdef PROFILE
    check_cuda(cudaDeviceSynchronize());
    auto profile2 = std::chrono::steady_clock::now();
    std::fprintf(stderr, "profile nodes=%d convert=%.3f sah=%.3f compact=%.3f upload=%.3f trace=%.3f\n", node_count,
                 std::chrono::duration<double, std::milli>(profile_a - profile0).count(),
                 std::chrono::duration<double, std::milli>(profile_b - profile_a).count(),
                 std::chrono::duration<double, std::milli>(profile_c - profile_b).count(),
                 std::chrono::duration<double, std::milli>(profile1 - profile_c).count(),
                 std::chrono::duration<double, std::milli>(profile2 - profile1).count());
#endif
}

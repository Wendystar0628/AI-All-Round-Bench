#include "rt.h"
#include "render_math.cuh"
#include <cub/cub.cuh>
#include <cuda_runtime.h>
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>

namespace {

static void ck(cudaError_t e) {
    if (e != cudaSuccess) {
        fprintf(stderr, "solution CUDA error: %s\n", cudaGetErrorString(e));
        exit(2);
    }
}

// ---------- Compact GPU Geometry & Uncompressed FP32 BVH8 ----------

// 48 bytes = 3 float4s: centered plane-first + dual barycentric vectors
struct TriGeom {
    float4 f0, f1, f2;
};

// 208 bytes = 13 float4s: 8-wide shallow tree + EXACT FP32 AABBs + ZERO I2F + ZERO byte unpacking!
// For 180k tris (~32k nodes) = 6.6 MB (10% of RTX 4080's 64 MB L2 cache!)
struct alignas(16) BVH8Node {
    float4 lox0, lox1; // children 0..3, 4..7 min x
    float4 hix0, hix1; // children 0..3, 4..7 max x
    float4 loy0, loy1;
    float4 hiy0, hiy1;
    float4 loz0, loz1;
    float4 hiz0, hiz1;
    uint4  meta; // x: child_base | (imask << 24), y: tri_base, z: meta0..3, w: meta4..7
};

struct PixelInfo {
    uint32_t prim_data;
    uint32_t shadow_off;
    uint32_t ao_data;     // ao_mode==AO_LIST: pool_offset | ao_mode==AO_FALLBACK: ao_root BVH8 node idx!
    uint32_t flags;
    float4   ref1_rgb;
};

enum PrimMode   : uint32_t { PRIM_DONE = 0, PRIM_SINGLE = 1, PRIM_LIST = 2, PRIM_FALLBACK = 3 };
enum ShadowMode : uint32_t { SH_LIT = 0, SH_DARK = 1, SH_LIST = 2, SH_FALLBACK = 3 };
enum AoMode     : uint32_t { AO_OPEN = 0, AO_LIST = 1, AO_FALLBACK = 2 };
enum Ref1Mode   : uint32_t { REF1_TRACE = 0, REF1_SKY = 1, REF1_CONST = 2 };

static constexpr int MAX_PRIM_CAND = 8;
static constexpr int MAX_SH_CAND   = 8;
static constexpr int MAX_AO_CAND   = 12;

__host__ __device__ __forceinline__ float half_area(float3 lo, float3 hi) {
    float dx = fmaxf(0.0f, hi.x - lo.x);
    float dy = fmaxf(0.0f, hi.y - lo.y);
    float dz = fmaxf(0.0f, hi.z - lo.z);
    return dx * dy + dy * dz + dz * dx;
}

__device__ __forceinline__ uint64_t expand_bits_21(uint32_t v) {
    uint64_t x = v & 0x1fffffu;
    x = (x | (x << 32)) & 0x001f00000000ffffull;
    x = (x | (x << 16)) & 0x001f0000ff0000ffull;
    x = (x | (x << 8))  & 0x100f00f00f00f00full;
    x = (x | (x << 4))  & 0x10c30c30c30c30c3ull;
    x = (x | (x << 2))  & 0x1249249249249249ull;
    return x;
}

__device__ __forceinline__ uint64_t morton64(float3 c, float3 lo, float3 inv_ext) {
    float fx = fminf(fmaxf((c.x - lo.x) * inv_ext.x, 0.0f), 1.0f);
    float fy = fminf(fmaxf((c.y - lo.y) * inv_ext.y, 0.0f), 1.0f);
    float fz = fminf(fmaxf((c.z - lo.z) * inv_ext.z, 0.0f), 1.0f);
    uint32_t ix = min(2097151u, (uint32_t)(fx * 2097151.0f));
    uint32_t iy = min(2097151u, (uint32_t)(fy * 2097151.0f));
    uint32_t iz = min(2097151u, (uint32_t)(fz * 2097151.0f));
    return (expand_bits_21(ix) << 2) | (expand_bits_21(iy) << 1) | expand_bits_21(iz);
}

__device__ __forceinline__ void atomicMinFloat(float* addr, float val) {
    int* iaddr = (int*)addr;
    int old = *iaddr, assumed;
    do {
        assumed = old;
        if (__int_as_float(assumed) <= val) break;
        old = atomicCAS(iaddr, assumed, __float_as_int(val));
    } while (assumed != old);
}

__device__ __forceinline__ void atomicMaxFloat(float* addr, float val) {
    int* iaddr = (int*)addr;
    int old = *iaddr, assumed;
    do {
        assumed = old;
        if (__int_as_float(assumed) >= val) break;
        old = atomicCAS(iaddr, assumed, __float_as_int(val));
    } while (assumed != old);
}

__device__ __forceinline__ int atomicReserveExact(int* counter, int count, int limit) {
    int old = *counter;
    while (old + count <= limit) {
        int assumed = old;
        old = atomicCAS(counter, assumed, assumed + count);
        if (old == assumed) return assumed;
    }
    return -1;
}

__device__ __forceinline__ int atomicReserveFast(int* counter, int count, int limit) {
    if (*((volatile int*)counter) + count > limit) return -1;
    int off = atomicAdd(counter, count);
    if (off + count <= limit) return off;
    return -1;
}

__device__ __forceinline__ int warpAtomicAdd(int* counter, int val) {
    unsigned mask = __activemask();
    int lane = threadIdx.x & 31;
    int total = 0;
    int my_off = 0;
    unsigned m = mask;
    int leader = __ffs(m) - 1;
    while (m) {
        int src = __ffs(m) - 1;
        m &= m - 1u;
        int v = __shfl_sync(mask, val, src);
        if (src < lane) my_off += v;
        total += v;
    }
    int base = 0;
    if (lane == leader && total > 0) base = atomicAdd(counter, total);
    base = __shfl_sync(mask, base, leader);
    return base + my_off;
}

// ---------- Pre-allocated Workspace ----------

struct Workspace {
    int cap_tris = 0;
    int cap_refs = 0;
    int cap_pixels = 0;
    int cap_pool = 0;
    int cap_blocks = 0;
    cudaStream_t stream = nullptr;

    Triangle* h_tris_pinned = nullptr;
    int* h_ctrl_pinned = nullptr;

    Triangle* d_tris = nullptr;
    TriGeom*  d_tri_geom_raw = nullptr;
    float4*   d_tri_shade = nullptr;
    float*    d_scene_bbox = nullptr;

    float4*   d_ref_lo = nullptr;
    float4*   d_ref_hi = nullptr;
    int*      d_ref_cnt = nullptr;

    uint64_t* d_morton_in = nullptr;
    uint64_t* d_morton_out = nullptr;
    int*      d_idx_in = nullptr;
    int*      d_idx_out = nullptr;
    void*     d_cub_temp = nullptr;
    size_t    cub_temp_bytes = 0;

    float4*   d_bvh2_lo = nullptr;
    float4*   d_bvh2_hi = nullptr;
    int*      d_bvh2_parent = nullptr;
    int*      d_bvh2_tri_cnt = nullptr;
    int*      d_bvh2_visited = nullptr;

    int*      d_clusters_a = nullptr;
    int*      d_clusters_b = nullptr;
    int*      d_nearest = nullptr;
    int*      d_flags = nullptr;
    int*      d_block_sums = nullptr;
    int*      d_ploc_state = nullptr;

    float*    d_dp_cost = nullptr;
    uint8_t*  d_dp_dec = nullptr;
    int2*     d_bfs_q_a = nullptr;
    int2*     d_bfs_q_b = nullptr;
    int*      d_b8_counters = nullptr;

    BVH8Node* d_b8_nodes = nullptr;
    TriGeom*  d_b8_tris = nullptr;
    int*      d_b8_tri_ids = nullptr;

    PixelInfo* d_pix_info = nullptr;
    int*       d_cand_pool = nullptr;
    int*       d_q_sfast = nullptr;   // single-tri, ZERO BVH
    int*       d_q_sao = nullptr;     // single-tri, AO-only BVH (direction-sorted!)
    int*       d_q_strace = nullptr;  // single-tri, reflection or shadow fallback
    int*       d_q_plist = nullptr;
    int*       d_q_fallback = nullptr;
    int*       d_pix_counters = nullptr; // [0]=pool, [1]=sfast, [2]=sao, [3]=strace, [4]=plist, [5]=fb
};

static Workspace W;

// ---------- Step 1: Precompute Triangle Geometry + Scene BBox ----------

__global__ void k_precompute_tris(
    const Triangle* __restrict__ tris,
    int N,
    TriGeom* __restrict__ geom_out,
    float4* __restrict__ shade_out,
    float* __restrict__ scene_bbox)
{
    __shared__ float s_lo_x[256], s_lo_y[256], s_lo_z[256];
    __shared__ float s_hi_x[256], s_hi_y[256], s_hi_z[256];

    float lox = 1e30f, loy = 1e30f, loz = 1e30f;
    float hix = -1e30f, hiy = -1e30f, hiz = -1e30f;

    int i = blockIdx.x * blockDim.x + threadIdx.x;
    if (i < N) {
        const Triangle t = tris[i];
        double v0x = t.v0[0], v0y = t.v0[1], v0z = t.v0[2];
        double e1x = (double)t.v1[0] - v0x, e1y = (double)t.v1[1] - v0y, e1z = (double)t.v1[2] - v0z;
        double e2x = (double)t.v2[0] - v0x, e2y = (double)t.v2[1] - v0y, e2z = (double)t.v2[2] - v0z;

        double nx = e1y * e2z - e1z * e2y;
        double ny = e1z * e2x - e1x * e2z;
        double nz = e1x * e2y - e1y * e2x;
        double n2 = nx * nx + ny * ny + nz * nz;
        double inv_nlen = (n2 > 0.0) ? (1.0 / sqrt(n2)) : 0.0;
        double inv_n2 = (n2 > 0.0) ? (1.0 / n2) : 0.0;

        double unx = nx * inv_nlen, uny = ny * inv_nlen, unz = nz * inv_nlen;
        double ux = (e2y * nz - e2z * ny) * inv_n2;
        double uy = (e2z * nx - e2x * nz) * inv_n2;
        double uz = (e2x * ny - e2y * nx) * inv_n2;
        double vx = (ny * e1z - nz * e1y) * inv_n2;
        double vy = (nz * e1x - nx * e1z) * inv_n2;
        double vz = (nx * e1y - ny * e1x) * inv_n2;

        TriGeom g;
        g.f0 = make_float4((float)v0x, (float)v0y, (float)v0z, (float)unx);
        g.f1 = make_float4((float)uny, (float)unz, (float)ux,  (float)uy);
        g.f2 = make_float4((float)uz,  (float)vx,  (float)vy,  (float)vz);
        geom_out[i] = g;
        shade_out[i] = make_float4(t.color[0], t.color[1], t.color[2], t.mirror);

        lox = fminf(t.v0[0], fminf(t.v1[0], t.v2[0]));
        loy = fminf(t.v0[1], fminf(t.v1[1], t.v2[1]));
        loz = fminf(t.v0[2], fminf(t.v1[2], t.v2[2]));
        hix = fmaxf(t.v0[0], fmaxf(t.v1[0], t.v2[0]));
        hiy = fmaxf(t.v0[1], fmaxf(t.v1[1], t.v2[1]));
        hiz = fmaxf(t.v0[2], fmaxf(t.v1[2], t.v2[2]));
    }

    int tid = threadIdx.x;
    s_lo_x[tid] = lox; s_lo_y[tid] = loy; s_lo_z[tid] = loz;
    s_hi_x[tid] = hix; s_hi_y[tid] = hiy; s_hi_z[tid] = hiz;
    __syncthreads();

    for (int stride = 128; stride > 0; stride >>= 1) {
        if (tid < stride) {
            s_lo_x[tid] = fminf(s_lo_x[tid], s_lo_x[tid + stride]);
            s_lo_y[tid] = fminf(s_lo_y[tid], s_lo_y[tid + stride]);
            s_lo_z[tid] = fminf(s_lo_z[tid], s_lo_z[tid + stride]);
            s_hi_x[tid] = fmaxf(s_hi_x[tid], s_hi_x[tid + stride]);
            s_hi_y[tid] = fmaxf(s_hi_y[tid], s_hi_y[tid + stride]);
            s_hi_z[tid] = fmaxf(s_hi_z[tid], s_hi_z[tid + stride]);
        }
        __syncthreads();
    }
    if (tid == 0) {
        atomicMinFloat(&scene_bbox[0], s_lo_x[0]);
        atomicMinFloat(&scene_bbox[1], s_lo_y[0]);
        atomicMinFloat(&scene_bbox[2], s_lo_z[0]);
        atomicMaxFloat(&scene_bbox[3], s_hi_x[0]);
        atomicMaxFloat(&scene_bbox[4], s_hi_y[0]);
        atomicMaxFloat(&scene_bbox[5], s_hi_z[0]);
    }
}

// ---------- Step 2: Early Split Clipping + Morton Codes ----------

__device__ __forceinline__ float get_axis(float3 v, int axis) {
    return axis == 0 ? v.x : (axis == 1 ? v.y : v.z);
}

__device__ void clip_tri_to_box(float3 v0, float3 v1, float3 v2, float3 blo, float3 bhi, float3& out_lo, float3& out_hi, bool& non_empty) {
    float3 poly_a[10], poly_b[10];
    poly_a[0] = v0; poly_a[1] = v1; poly_a[2] = v2;
    int n = 3;
    float3* src = poly_a; float3* dst = poly_b;

    for (int p = 0; p < 6 && n > 0; ++p) {
        int axis = p >> 1;
        bool is_hi = (p & 1) != 0;
        float plane = is_hi ? get_axis(bhi, axis) : get_axis(blo, axis);
        int out_n = 0;
        float3 prev = src[n - 1];
        float prev_v = get_axis(prev, axis);
        bool prev_in = is_hi ? (prev_v <= plane) : (prev_v >= plane);
        for (int i = 0; i < n; ++i) {
            float3 cur = src[i];
            float cur_v = get_axis(cur, axis);
            bool cur_in = is_hi ? (cur_v <= plane) : (cur_v >= plane);
            if (cur_in != prev_in) {
                float denom = cur_v - prev_v;
                float t = (fabsf(denom) > 1e-20f) ? fminf(fmaxf((plane - prev_v) / denom, 0.0f), 1.0f) : 0.5f;
                float3 inter = make_float3(prev.x + t * (cur.x - prev.x),
                                           prev.y + t * (cur.y - prev.y),
                                           prev.z + t * (cur.z - prev.z));
                if (out_n < 10) dst[out_n++] = inter;
            }
            if (cur_in && out_n < 10) dst[out_n++] = cur;
            prev = cur; prev_v = cur_v; prev_in = cur_in;
        }
        n = out_n;
        float3* tmp = src; src = dst; dst = tmp;
    }

    if (n == 0) { non_empty = false; return; }
    non_empty = true;
    out_lo = src[0]; out_hi = src[0];
    for (int i = 1; i < n; ++i) {
        out_lo.x = fminf(out_lo.x, src[i].x); out_lo.y = fminf(out_lo.y, src[i].y); out_lo.z = fminf(out_lo.z, src[i].z);
        out_hi.x = fmaxf(out_hi.x, src[i].x); out_hi.y = fmaxf(out_hi.y, src[i].y); out_hi.z = fmaxf(out_hi.z, src[i].z);
    }
    out_lo.x -= 1e-5f; out_lo.y -= 1e-5f; out_lo.z -= 1e-5f;
    out_hi.x += 1e-5f; out_hi.y += 1e-5f; out_hi.z += 1e-5f;
}

__global__ void k_early_split_and_morton(
    const Triangle* __restrict__ tris,
    int N, int max_refs,
    const float* __restrict__ scene_bbox,
    float4* __restrict__ ref_lo,
    float4* __restrict__ ref_hi,
    uint64_t* __restrict__ morton_out,
    int* __restrict__ idx_out,
    int* __restrict__ ref_cnt)
{
    int i = blockIdx.x * blockDim.x + threadIdx.x;
    if (i >= N) return;

    float3 s_lo = make_float3(scene_bbox[0], scene_bbox[1], scene_bbox[2]);
    float3 s_hi = make_float3(scene_bbox[3], scene_bbox[4], scene_bbox[5]);
    float3 s_ext = make_float3(s_hi.x - s_lo.x, s_hi.y - s_lo.y, s_hi.z - s_lo.z);
    float3 inv_ext = make_float3(
        s_ext.x > 1e-9f ? 1.0f / s_ext.x : 0.0f,
        s_ext.y > 1e-9f ? 1.0f / s_ext.y : 0.0f,
        s_ext.z > 1e-9f ? 1.0f / s_ext.z : 0.0f);
    float max_scene_ext = fmaxf(s_ext.x, fmaxf(s_ext.y, s_ext.z));
    float split_thresh = fmaxf(max_scene_ext * 0.03f, 1e-4f);

    const Triangle t = tris[i];
    float3 v0 = make_float3(t.v0[0], t.v0[1], t.v0[2]);
    float3 v1 = make_float3(t.v1[0], t.v1[1], t.v1[2]);
    float3 v2 = make_float3(t.v2[0], t.v2[1], t.v2[2]);

    float3 lo = make_float3(fminf(v0.x, fminf(v1.x, v2.x)), fminf(v0.y, fminf(v1.y, v2.y)), fminf(v0.z, fminf(v1.z, v2.z)));
    float3 hi = make_float3(fmaxf(v0.x, fmaxf(v1.x, v2.x)), fmaxf(v0.y, fmaxf(v1.y, v2.y)), fmaxf(v0.z, fmaxf(v1.z, v2.z)));
    float max_e = fmaxf(hi.x - lo.x, fmaxf(hi.y - lo.y, hi.z - lo.z));

    if (N < 64 || max_e <= split_thresh) {
        int r = i;
        ref_lo[r] = make_float4(lo.x, lo.y, lo.z, __int_as_float(i));
        ref_hi[r] = make_float4(hi.x, hi.y, hi.z, 0.0f);
        float3 c = make_float3(0.5f * (lo.x + hi.x), 0.5f * (lo.y + hi.y), 0.5f * (lo.z + hi.z));
        morton_out[r] = morton64(c, s_lo, inv_ext);
        idx_out[r] = r;
        return;
    }

    float3 stk_lo[16], stk_hi[16]; int stk_depth[16]; int sp = 0;
    stk_lo[0] = lo; stk_hi[0] = hi; stk_depth[0] = 0; sp = 1;
    float3 out_lo[16], out_hi[16]; int out_n = 0;

    while (sp > 0) {
        --sp;
        float3 blo = stk_lo[sp], bhi = stk_hi[sp]; int d = stk_depth[sp];
        float ex = bhi.x - blo.x, ey = bhi.y - blo.y, ez = bhi.z - blo.z;
        float me = fmaxf(ex, fmaxf(ey, ez));
        if (d >= 4 || me <= split_thresh || out_n + sp + 1 >= 16) {
            out_lo[out_n] = blo; out_hi[out_n] = bhi; ++out_n;
            continue;
        }
        int axis = (ex >= ey && ex >= ez) ? 0 : (ey >= ez ? 1 : 2);
        float mid = 0.5f * (get_axis(blo, axis) + get_axis(bhi, axis));
        float3 l_lo = blo, l_hi = bhi, r_lo = blo, r_hi = bhi;
        if (axis == 0) { l_hi.x = mid; r_lo.x = mid; }
        else if (axis == 1) { l_hi.y = mid; r_lo.y = mid; }
        else { l_hi.z = mid; r_lo.z = mid; }

        float3 clo, chi; bool ok;
        clip_tri_to_box(v0, v1, v2, r_lo, r_hi, clo, chi, ok);
        if (ok) { stk_lo[sp] = clo; stk_hi[sp] = chi; stk_depth[sp] = d + 1; ++sp; }
        clip_tri_to_box(v0, v1, v2, l_lo, l_hi, clo, chi, ok);
        if (ok) { stk_lo[sp] = clo; stk_hi[sp] = chi; stk_depth[sp] = d + 1; ++sp; }
    }

    if (out_n <= 0) { out_lo[0] = lo; out_hi[0] = hi; out_n = 1; }
    int extra = out_n - 1; int base = -1;
    if (extra > 0) {
        base = atomicReserveExact(ref_cnt, extra, max_refs);
        if (base < 0) { out_lo[0] = lo; out_hi[0] = hi; out_n = 1; }
    }
    for (int k = 0; k < out_n; ++k) {
        int r = (k == 0) ? i : (base + k - 1);
        float3 alo = out_lo[k], ahi = out_hi[k];
        ref_lo[r] = make_float4(alo.x, alo.y, alo.z, __int_as_float(i));
        ref_hi[r] = make_float4(ahi.x, ahi.y, ahi.z, 0.0f);
        float3 c = make_float3(0.5f * (alo.x + ahi.x), 0.5f * (alo.y + ahi.y), 0.5f * (alo.z + ahi.z));
        morton_out[r] = morton64(c, s_lo, inv_ext);
        idx_out[r] = r;
    }
}

// ---------- Step 3: GPU PLOC BVH2 Builder ----------

__global__ void k_init_bvh2_leaves(
    const int* __restrict__ sorted_idx, const float4* __restrict__ ref_lo, const float4* __restrict__ ref_hi, int M,
    float4* __restrict__ bvh2_lo, float4* __restrict__ bvh2_hi, int* __restrict__ bvh2_parent, int* __restrict__ bvh2_tri_cnt, int* __restrict__ clusters)
{
    int i = blockIdx.x * blockDim.x + threadIdx.x;
    if (i >= M) return;
    int r = sorted_idx[i];
    float4 rl = ref_lo[r], rh = ref_hi[r];
    bvh2_lo[i] = make_float4(rl.x, rl.y, rl.z, __int_as_float(-1));
    bvh2_hi[i] = make_float4(rh.x, rh.y, rh.z, rl.w); // tri_id in rl.w
    bvh2_parent[i] = -1;
    bvh2_tri_cnt[i] = 1;
    clusters[i] = i;
}

static constexpr int PLOC_R = 12;
static constexpr int PLOC_BLOCK = 256;

__global__ void k_ploc_nearest(
    const int* __restrict__ clusters_a, const int* __restrict__ clusters_b,
    const float4* __restrict__ bvh2_lo, const float4* __restrict__ bvh2_hi,
    const int* __restrict__ ploc_state, int* __restrict__ nearest)
{
    int M = ploc_state[0];
    if (M <= 1024) return;
    const int* clusters = (ploc_state[4] & 1) ? clusters_b : clusters_a;

    __shared__ float3 s_lo[PLOC_BLOCK + 2 * PLOC_R];
    __shared__ float3 s_hi[PLOC_BLOCK + 2 * PLOC_R];

    int base = blockIdx.x * PLOC_BLOCK;
    if (base >= M) return;

    int tid = threadIdx.x;
    for (int idx = tid; idx < PLOC_BLOCK + 2 * PLOC_R; idx += PLOC_BLOCK) {
        int gi = base + idx - PLOC_R;
        if (gi >= 0 && gi < M) {
            int c = clusters[gi];
            float4 l = bvh2_lo[c], h = bvh2_hi[c];
            s_lo[idx] = make_float3(l.x, l.y, l.z);
            s_hi[idx] = make_float3(h.x, h.y, h.z);
        }
    }
    __syncthreads();

    int i = base + tid;
    if (i >= M) return;
    float3 my_lo = s_lo[tid + PLOC_R], my_hi = s_hi[tid + PLOC_R];
    uint64_t best_key = 0xFFFFFFFFFFFFFFFFull;
    int lo_off = max(-PLOC_R, -i), hi_off = min(PLOC_R, M - 1 - i);
    for (int off = lo_off; off <= hi_off; ++off) {
        if (off == 0) continue;
        float3 olo = s_lo[tid + PLOC_R + off], ohi = s_hi[tid + PLOC_R + off];
        float3 ulo = make_float3(fminf(my_lo.x, olo.x), fminf(my_lo.y, olo.y), fminf(my_lo.z, olo.z));
        float3 uhi = make_float3(fmaxf(my_hi.x, ohi.x), fmaxf(my_hi.y, ohi.y), fmaxf(my_hi.z, ohi.z));
        float a = half_area(ulo, uhi) + 0.0f;
        uint64_t key = ((uint64_t)__float_as_uint(a) << 32) | (uint32_t)(i + off);
        if (key < best_key) best_key = key;
    }
    nearest[i] = (int)(best_key & 0xFFFFFFFFu);
}

__global__ void k_ploc_merge_and_count(
    const int* __restrict__ clusters_a, const int* __restrict__ clusters_b,
    const int* __restrict__ nearest,
    float4* __restrict__ bvh2_lo, float4* __restrict__ bvh2_hi,
    int* __restrict__ bvh2_parent, int* __restrict__ bvh2_tri_cnt,
    int* __restrict__ ploc_state, int* __restrict__ merged_out, int* __restrict__ block_sums)
{
    int M = ploc_state[0];
    if (M <= 1024) return;
    const int* clusters_in = (ploc_state[4] & 1) ? clusters_b : clusters_a;

    int i = blockIdx.x * blockDim.x + threadIdx.x;
    int valid = 0, out_node = -1;
    if (i < M) {
        int j = nearest[i];
        if (nearest[j] == i) {
            if (i < j) {
                int L = clusters_in[i], R = clusters_in[j];
                int u = atomicAdd(&ploc_state[1], 1);
                float4 ll = bvh2_lo[L], lh = bvh2_hi[L], rl = bvh2_lo[R], rh = bvh2_hi[R];
                bvh2_lo[u] = make_float4(fminf(ll.x, rl.x), fminf(ll.y, rl.y), fminf(ll.z, rl.z), __int_as_float(L));
                bvh2_hi[u] = make_float4(fmaxf(lh.x, rh.x), fmaxf(lh.y, rh.y), fmaxf(lh.z, rh.z), __int_as_float(R));
                bvh2_parent[L] = u; bvh2_parent[R] = u; bvh2_parent[u] = -1;
                bvh2_tri_cnt[u] = bvh2_tri_cnt[L] + bvh2_tri_cnt[R];
                out_node = u; valid = 1;
            }
        } else {
            out_node = clusters_in[i]; valid = 1;
        }
        merged_out[i] = out_node;
    }

    typedef cub::BlockReduce<int, PLOC_BLOCK> BlockReduce;
    __shared__ typename BlockReduce::TempStorage temp_storage;
    int bsum = BlockReduce(temp_storage).Sum(valid);
    if (threadIdx.x == 0) {
        int num_blocks = (M + PLOC_BLOCK - 1) / PLOC_BLOCK;
        if (blockIdx.x < num_blocks) block_sums[blockIdx.x] = bsum;
    }
}

__global__ void k_scan_block_sums(int* __restrict__ block_sums, int* __restrict__ ploc_state) {
    int M = ploc_state[0];
    if (threadIdx.x == 0) ploc_state[3] = M;
    if (M <= 1024) return;
    int num_blocks = (M + PLOC_BLOCK - 1) / PLOC_BLOCK;

    typedef cub::BlockScan<int, 1024> BlockScan;
    __shared__ typename BlockScan::TempStorage temp;
    __shared__ int running;
    if (threadIdx.x == 0) running = 0;
    __syncthreads();

    for (int base = 0; base < num_blocks; base += 1024) {
        int idx = base + threadIdx.x;
        int val = (idx < num_blocks) ? block_sums[idx] : 0;
        int prefix, aggregate;
        BlockScan(temp).ExclusiveSum(val, prefix, aggregate);
        if (idx < num_blocks) block_sums[idx] = running + prefix;
        __syncthreads();
        if (threadIdx.x == 0) running += aggregate;
        __syncthreads();
    }
    if (threadIdx.x == 0) { ploc_state[0] = running; ploc_state[4] ^= 1; }
}

__global__ void k_ploc_scatter(
    const int* __restrict__ merged_in, const int* __restrict__ block_sums, const int* __restrict__ ploc_state,
    int* __restrict__ clusters_a, int* __restrict__ clusters_b)
{
    int old_M = ploc_state[3];
    if (old_M <= 1024) return;
    int* clusters_out = (ploc_state[4] & 1) ? clusters_b : clusters_a;
    int i = blockIdx.x * blockDim.x + threadIdx.x;
    int node = (i < old_M) ? merged_in[i] : -1;
    int valid = (node >= 0) ? 1 : 0;

    typedef cub::BlockScan<int, PLOC_BLOCK> BlockScan;
    __shared__ typename BlockScan::TempStorage temp;
    int local_off;
    BlockScan(temp).ExclusiveSum(valid, local_off);
    if (valid) clusters_out[block_sums[blockIdx.x] + local_off] = node;
}

__global__ void k_ploc_finish_small(
    const int* __restrict__ clusters_a, const int* __restrict__ clusters_b,
    float4* __restrict__ bvh2_lo, float4* __restrict__ bvh2_hi,
    int* __restrict__ bvh2_parent, int* __restrict__ bvh2_tri_cnt, int* __restrict__ ploc_state)
{
    int M = ploc_state[0];
    if (M > 1024) return;
    const int* clusters = (ploc_state[4] & 1) ? clusters_b : clusters_a;

    __shared__ int s_cid[1024], s_near[1024], s_M, s_next_u;
    __shared__ float3 s_lo[1024], s_hi[1024];
    typedef cub::BlockScan<int, 1024> BlockScan;
    __shared__ typename BlockScan::TempStorage scan_temp;

    int tid = threadIdx.x;
    if (tid == 0) { s_M = M; s_next_u = ploc_state[1]; }
    if (tid < M) {
        int c = clusters[tid]; s_cid[tid] = c;
        float4 l = bvh2_lo[c], h = bvh2_hi[c];
        s_lo[tid] = make_float3(l.x, l.y, l.z); s_hi[tid] = make_float3(h.x, h.y, h.z);
    }
    __syncthreads();

    while (s_M > 1) {
        int curM = s_M;
        int R = (curM <= 64) ? curM : 16;
        if (tid < curM) {
            float3 my_lo = s_lo[tid], my_hi = s_hi[tid];
            uint64_t best_key = 0xFFFFFFFFFFFFFFFFull;
            int lo_j = max(0, tid - R), hi_j = min(curM - 1, tid + R);
            for (int j = lo_j; j <= hi_j; ++j) {
                if (j == tid) continue;
                float3 olo = s_lo[j], ohi = s_hi[j];
                float3 ulo = make_float3(fminf(my_lo.x, olo.x), fminf(my_lo.y, olo.y), fminf(my_lo.z, olo.z));
                float3 uhi = make_float3(fmaxf(my_hi.x, ohi.x), fmaxf(my_hi.y, ohi.y), fmaxf(my_hi.z, ohi.z));
                float a = half_area(ulo, uhi) + 0.0f;
                uint64_t key = ((uint64_t)__float_as_uint(a) << 32) | (uint32_t)j;
                if (key < best_key) best_key = key;
            }
            s_near[tid] = (int)(best_key & 0xFFFFFFFFu);
        }
        __syncthreads();

        int valid = 0, my_new_c = -1;
        float3 my_new_lo, my_new_hi;
        if (tid < curM) {
            int j = s_near[tid];
            if (s_near[j] == tid) {
                if (tid < j) {
                    int L = s_cid[tid], Rc = s_cid[j];
                    int u = atomicAdd(&s_next_u, 1);
                    float3 ll = s_lo[tid], lh = s_hi[tid], rl = s_lo[j], rh = s_hi[j];
                    my_new_lo = make_float3(fminf(ll.x, rl.x), fminf(ll.y, rl.y), fminf(ll.z, rl.z));
                    my_new_hi = make_float3(fmaxf(lh.x, rh.x), fmaxf(lh.y, rh.y), fmaxf(lh.z, rh.z));
                    bvh2_lo[u] = make_float4(my_new_lo.x, my_new_lo.y, my_new_lo.z, __int_as_float(L));
                    bvh2_hi[u] = make_float4(my_new_hi.x, my_new_hi.y, my_new_hi.z, __int_as_float(Rc));
                    bvh2_parent[L] = u; bvh2_parent[Rc] = u; bvh2_parent[u] = -1;
                    bvh2_tri_cnt[u] = bvh2_tri_cnt[L] + bvh2_tri_cnt[Rc];
                    my_new_c = u; valid = 1;
                }
            } else {
                my_new_c = s_cid[tid]; my_new_lo = s_lo[tid]; my_new_hi = s_hi[tid]; valid = 1;
            }
        }
        int dst, newM;
        BlockScan(scan_temp).ExclusiveSum(valid, dst, newM);
        __syncthreads();
        if (valid) { s_cid[dst] = my_new_c; s_lo[dst] = my_new_lo; s_hi[dst] = my_new_hi; }
        if (tid == 0) s_M = newM;
        __syncthreads();
    }

    if (tid == 0) { ploc_state[0] = 1; ploc_state[1] = s_next_u; ploc_state[2] = s_cid[0]; }
}

// ---------- Step 4: Optimal Bottom-Up DP (BVH2 -> Uncompressed FP32 BVH8) ----------

static constexpr float B8_C_NODE = 1.0f;
static constexpr float B8_C_TRI  = 0.35f;

__global__ void k_bvh8_dp(
    int M,
    const float4* __restrict__ bvh2_lo, const float4* __restrict__ bvh2_hi,
    const int* __restrict__ bvh2_parent, const int* __restrict__ bvh2_tri_cnt,
    int* __restrict__ bvh2_visited, float* __restrict__ dp_cost, uint8_t* __restrict__ dp_dec)
{
    int i = blockIdx.x * blockDim.x + threadIdx.x;
    if (i >= M) return;

    float4 l0 = bvh2_lo[i], h0 = bvh2_hi[i];
    float leaf_c = half_area(make_float3(l0.x, l0.y, l0.z), make_float3(h0.x, h0.y, h0.z)) * B8_C_TRI;
    for (int s = 0; s < 7; ++s) dp_cost[size_t(i) * 7 + s] = leaf_c;
    for (int s = 0; s < 8; ++s) dp_dec[size_t(i) * 8 + s] = 0;
    __threadfence();

    int cur = bvh2_parent[i];
    while (cur >= 0) {
        if (atomicAdd(&bvh2_visited[cur], 1) == 0) return;

        float4 lo4 = bvh2_lo[cur], hi4 = bvh2_hi[cur];
        int L = __float_as_int(lo4.w), R = __float_as_int(hi4.w);
        float area_u = half_area(make_float3(lo4.x, lo4.y, lo4.z), make_float3(hi4.x, hi4.y, hi4.z));
        int tcnt = bvh2_tri_cnt[cur];

        float cL[7], cR[7];
        for (int s = 0; s < 7; ++s) { cL[s] = dp_cost[size_t(L) * 7 + s]; cR[s] = dp_cost[size_t(R) * 7 + s]; }

        float best8 = 1e30f; uint8_t best8_k = 1;
        for (int k = 1; k <= 7; ++k) {
            float c = cL[k - 1] + cR[7 - k];
            if (c < best8) { best8 = c; best8_k = (uint8_t)k; }
        }
        float c_int = area_u * B8_C_NODE + best8;
        float c_leaf = (tcnt <= 3) ? (area_u * B8_C_TRI * (float)tcnt) : 1e30f;

        float c_one = (c_leaf <= c_int) ? c_leaf : c_int;
        uint8_t dec0 = (c_leaf <= c_int) ? 0 : best8_k;

        float my_c[7]; uint8_t my_dec[8];
        my_c[0] = c_one; my_dec[0] = dec0;
        for (int slots = 2; slots <= 7; ++slots) {
            float best = c_one; uint8_t bk = 0;
            for (int k = 1; k < slots; ++k) {
                float c = cL[k - 1] + cR[slots - k - 1];
                if (c < best) { best = c; bk = (uint8_t)k; }
            }
            my_c[slots - 1] = best; my_dec[slots - 1] = bk;
        }
        my_dec[7] = best8_k;

        for (int s = 0; s < 7; ++s) dp_cost[size_t(cur) * 7 + s] = my_c[s];
        for (int s = 0; s < 8; ++s) dp_dec[size_t(cur) * 8 + s] = my_dec[s];
        __threadfence();

        cur = bvh2_parent[cur];
    }
}

__global__ void k_init_bfs_root(const int* __restrict__ ploc_state, int2* __restrict__ q_a, int* __restrict__ counters) {
    q_a[0] = make_int2(0, ploc_state[2]);
    counters[0] = 1; counters[1] = 0; counters[2] = 1; counters[3] = 0;
}

__global__ void k_swap_bfs_counters(int* __restrict__ counters) {
    counters[2] = counters[3]; counters[3] = 0;
}

__global__ void k_bvh8_emit_level(
    const int2* __restrict__ cur_q, int2* __restrict__ next_q, int* __restrict__ counters,
    const float4* __restrict__ bvh2_lo, const float4* __restrict__ bvh2_hi,
    const uint8_t* __restrict__ dp_dec, const TriGeom* __restrict__ tri_geom_raw,
    BVH8Node* __restrict__ b8_nodes, TriGeom* __restrict__ b8_tris, int* __restrict__ b8_tri_ids)
{
    int q_cnt = counters[2];
    int tid = blockIdx.x * blockDim.x + threadIdx.x;
    if (tid >= q_cnt) return;

    int2 item = cur_q[tid];
    int b8_idx = item.x, root_u = item.y;

    int ch_node[8]; bool ch_internal[8]; int nc = 0;
    float4 rlo4 = bvh2_lo[root_u], rhi4 = bvh2_hi[root_u];
    int root_L = __float_as_int(rlo4.w);
    if (root_L < 0 || dp_dec[size_t(root_u) * 8 + 0] == 0) {
        ch_node[0] = root_u; ch_internal[0] = false; nc = 1;
    } else {
        int stk_u[16], stk_s[16], sp = 0;
        int root_R = __float_as_int(rhi4.w);
        int k = dp_dec[size_t(root_u) * 8 + 0];
        stk_u[sp] = root_R; stk_s[sp] = 8 - k; ++sp;
        stk_u[sp] = root_L; stk_s[sp] = k; ++sp;
        while (sp > 0) {
            --sp;
            int v = stk_u[sp], s = stk_s[sp];
            int vL = __float_as_int(bvh2_lo[v].w);
            uint8_t d_s = (s >= 2) ? dp_dec[size_t(v) * 8 + (s - 1)] : 0;
            if (vL < 0 || s == 1 || d_s == 0) {
                uint8_t d0 = dp_dec[size_t(v) * 8 + 0];
                ch_node[nc] = v; ch_internal[nc] = (vL >= 0 && d0 != 0); ++nc;
            } else {
                int vR = __float_as_int(bvh2_hi[v].w);
                stk_u[sp] = vR; stk_s[sp] = s - d_s; ++sp;
                stk_u[sp] = vL; stk_s[sp] = d_s; ++sp;
            }
        }
    }

    float3 p_cen = make_float3(0.5f * (rlo4.x + rhi4.x), 0.5f * (rlo4.y + rhi4.y), 0.5f * (rlo4.z + rhi4.z));
    int slot_to_ch[8];
    for (int s = 0; s < 8; ++s) slot_to_ch[s] = -1;
    bool ch_used[8] = {};
    float3 ch_off[8];
    for (int i = 0; i < nc; ++i) {
        float4 l = bvh2_lo[ch_node[i]], h = bvh2_hi[ch_node[i]];
        ch_off[i] = make_float3(0.5f * (l.x + h.x) - p_cen.x, 0.5f * (l.y + h.y) - p_cen.y, 0.5f * (l.z + h.z) - p_cen.z);
    }
    for (int iter = 0; iter < nc; ++iter) {
        float best_score = -1e30f; int best_c = -1, best_s = -1;
        for (int c = 0; c < nc; ++c) {
            if (ch_used[c]) continue;
            for (int s = 0; s < 8; ++s) {
                if (slot_to_ch[s] >= 0) continue;
                float sc = ch_off[c].x * ((s & 1) ? 1.0f : -1.0f)
                         + ch_off[c].y * ((s & 2) ? 1.0f : -1.0f)
                         + ch_off[c].z * ((s & 4) ? 1.0f : -1.0f);
                if (sc > best_score) { best_score = sc; best_c = c; best_s = s; }
            }
        }
        ch_used[best_c] = true; slot_to_ch[best_s] = best_c;
    }

    int num_int = 0, num_tris = 0;
    int leaf_tris[8][3], leaf_cnt[8] = {};
    uint8_t imask = 0;

    for (int s = 0; s < 8; ++s) {
        int c = slot_to_ch[s];
        if (c < 0) continue;
        if (ch_internal[c]) {
            imask |= (uint8_t)(1u << s);
            ++num_int;
        } else {
            int lstk[8], lsp = 0, cnt = 0;
            lstk[lsp++] = ch_node[c];
            while (lsp > 0) {
                int v = lstk[--lsp];
                int vL = __float_as_int(bvh2_lo[v].w), vR = __float_as_int(bvh2_hi[v].w);
                if (vL < 0) leaf_tris[s][cnt++] = vR;
                else { lstk[lsp++] = vR; lstk[lsp++] = vL; }
            }
            leaf_cnt[s] = cnt; num_tris += cnt;
        }
    }

    uint32_t child_base = num_int ? (uint32_t)atomicAdd(&counters[0], num_int) : 0u;
    uint32_t tri_base   = num_tris ? (uint32_t)atomicAdd(&counters[1], num_tris) : 0u;

    uint8_t meta[8] = {};
    float lx[8], hx[8], ly[8], hy[8], lz[8], hz[8];
    int int_off = 0, tri_off = 0;

    for (int s = 0; s < 8; ++s) {
        int c = slot_to_ch[s];
        if (c < 0) {
            meta[s] = 0;
            lx[s] = ly[s] = lz[s] = 1e30f;
            hx[s] = hy[s] = hz[s] = -1e30f;
            continue;
        }
        int v = ch_node[c];
        float4 l = bvh2_lo[v], h = bvh2_hi[v];
        lx[s] = l.x - 1e-5f; ly[s] = l.y - 1e-5f; lz[s] = l.z - 1e-5f;
        hx[s] = h.x + 1e-5f; hy[s] = h.y + 1e-5f; hz[s] = h.z + 1e-5f;

        if (ch_internal[c]) {
            meta[s] = 0;
            int q_dst = atomicAdd(&counters[3], 1);
            next_q[q_dst] = make_int2((int)(child_base + int_off), v);
            ++int_off;
        } else {
            int cnt = leaf_cnt[s];
            uint32_t unary = (1u << cnt) - 1u;
            meta[s] = (uint8_t)((unary << 5) | (uint32_t)tri_off);
            for (int k = 0; k < cnt; ++k) {
                int orig = leaf_tris[s][k];
                b8_tris[tri_base + tri_off + k] = tri_geom_raw[orig];
                b8_tri_ids[tri_base + tri_off + k] = orig;
            }
            tri_off += cnt;
        }
    }

    auto pack4 = [](uint8_t a, uint8_t b, uint8_t c, uint8_t d) -> uint32_t {
        return (uint32_t)a | ((uint32_t)b << 8) | ((uint32_t)c << 16) | ((uint32_t)d << 24);
    };

    BVH8Node node;
    node.lox0 = make_float4(lx[0], lx[1], lx[2], lx[3]); node.lox1 = make_float4(lx[4], lx[5], lx[6], lx[7]);
    node.hix0 = make_float4(hx[0], hx[1], hx[2], hx[3]); node.hix1 = make_float4(hx[4], hx[5], hx[6], hx[7]);
    node.loy0 = make_float4(ly[0], ly[1], ly[2], ly[3]); node.loy1 = make_float4(ly[4], ly[5], ly[6], ly[7]);
    node.hiy0 = make_float4(hy[0], hy[1], hy[2], hy[3]); node.hiy1 = make_float4(hy[4], hy[5], hy[6], hy[7]);
    node.loz0 = make_float4(lz[0], lz[1], lz[2], lz[3]); node.loz1 = make_float4(lz[4], lz[5], lz[6], lz[7]);
    node.hiz0 = make_float4(hz[0], hz[1], hz[2], hz[3]); node.hiz1 = make_float4(hz[4], hz[5], hz[6], hz[7]);
    node.meta = make_uint4((child_base & 0x00FFFFFFu) | ((uint32_t)imask << 24),
                           tri_base,
                           pack4(meta[0], meta[1], meta[2], meta[3]),
                           pack4(meta[4], meta[5], meta[6], meta[7]));
    b8_nodes[b8_idx] = node;
}

// ---------- Step 5: Rendering Helpers & Blazing-Fast Zero-I2F FP32 BVH8 Traversal ----------

struct RenderParams {
    int width, height, spp, ao, max_depth;
    unsigned seed;
    float3 eye, u, v, w, light;
    float ao_radius;
    const BVH8Node* b8_nodes;
    const TriGeom*  b8_tris;
    const int*      b8_tri_ids;
    const float4*   tri_shade;
    const Triangle* raw_tris;
};

__device__ __forceinline__ float sample_f(uint32_t x) {
    return float(mix32(x) >> 8) * (1.0f / 16777216.0f);
}

__device__ __forceinline__ float3 normalize3(float3 v) {
    float inv = rsqrtf(v.x * v.x + v.y * v.y + v.z * v.z);
    return make_float3(v.x * inv, v.y * inv, v.z * inv);
}

__device__ __forceinline__ float3 cross3(float3 a, float3 b) {
    return make_float3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
}

__device__ __forceinline__ float dot3(float3 a, float3 b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
}

__device__ __forceinline__ float3 reflect3(float3 d, float3 n) {
    float k = 2.0f * dot3(d, n);
    return normalize3(make_float3(d.x - n.x * k, d.y - n.y * k, d.z - n.z * k));
}

__device__ __forceinline__ float3 sky_color(float3 d) {
    float a = 0.5f * (d.y + 1.0f);
    return make_float3(
        0.95f * (1.0f - a) + 0.40f * a,
        0.93f * (1.0f - a) + 0.55f * a,
        0.95f * (1.0f - a) + 0.85f * a);
}

__device__ __forceinline__ bool intersect_tri_geom(
    const TriGeom& __restrict__ g,
    float3 o, float3 d, float hit_t,
    float& out_t)
{
    float4 f0 = __ldg(&g.f0);
    float4 f1 = __ldg(&g.f1);
    float nx = f0.w, ny = f1.x, nz = f1.y;
    float denom = fmaf(d.x, nx, fmaf(d.y, ny, d.z * nz));
    if (fabsf(denom) < 1e-9f) return false;
    float sx = o.x - f0.x;
    float sy = o.y - f0.y;
    float sz = o.z - f0.z;
    float t = __fdividef(-fmaf(sx, nx, fmaf(sy, ny, sz * nz)), denom);
    if (!(t > 0.0002f && t < hit_t)) return false;

    float4 f2 = __ldg(&g.f2);
    float hx = fmaf(t, d.x, sx);
    float hy = fmaf(t, d.y, sy);
    float hz = fmaf(t, d.z, sz);
    float u = fmaf(hx, f1.z, fmaf(hy, f1.w, hz * f2.x));
    if (!(u >= 0.0f && u <= 1.0f)) return false;
    float v = fmaf(hx, f2.y, fmaf(hy, f2.z, hz * f2.w));
    if (!(v >= 0.0f && u + v <= 1.0f)) return false;
    out_t = t;
    return true;
}

__device__ __forceinline__ bool eval_tri_plane(
    const TriGeom& __restrict__ g,
    float3 o, float3 d,
    float& out_t, float& out_u, float& out_v, float& out_denom)
{
    float4 f0 = __ldg(&g.f0);
    float4 f1 = __ldg(&g.f1);
    float nx = f0.w, ny = f1.x, nz = f1.y;
    float denom = fmaf(d.x, nx, fmaf(d.y, ny, d.z * nz));
    out_denom = denom;
    if (fabsf(denom) < 1e-6f) return false;
    float sx = o.x - f0.x;
    float sy = o.y - f0.y;
    float sz = o.z - f0.z;
    float t = __fdividef(-fmaf(sx, nx, fmaf(sy, ny, sz * nz)), denom);
    float4 f2 = __ldg(&g.f2);
    float hx = fmaf(t, d.x, sx);
    float hy = fmaf(t, d.y, sy);
    float hz = fmaf(t, d.z, sz);
    out_t = t;
    out_u = fmaf(hx, f1.z, fmaf(hy, f1.w, hz * f2.x));
    out_v = fmaf(hx, f2.y, fmaf(hy, f2.z, hz * f2.w));
    return true;
}

__device__ __forceinline__ bool tri_may_hit_frustum(
    const TriGeom& __restrict__ g,
    float3 eye, const float3 D[4],
    const float t_min[4], const float t_cov[4], bool has_cover)
{
    float4 f0 = __ldg(&g.f0);
    float4 f1 = __ldg(&g.f1);
    float3 n = make_float3(f0.w, f1.x, f1.y);

    float den[4];
    #pragma unroll
    for (int k = 0; k < 4; ++k) den[k] = dot3(D[k], n);

    bool all_pos = (den[0] > 1e-6f && den[1] > 1e-6f && den[2] > 1e-6f && den[3] > 1e-6f);
    bool all_neg = (den[0] < -1e-6f && den[1] < -1e-6f && den[2] < -1e-6f && den[3] < -1e-6f);
    if (!all_pos && !all_neg) return true;

    float sx = eye.x - f0.x, sy = eye.y - f0.y, sz = eye.z - f0.z;
    float num = -(sx * n.x + sy * n.y + sz * n.z);

    float t[4];
    #pragma unroll
    for (int k = 0; k < 4; ++k) t[k] = __fdividef(num, den[k]);

    if (t[0] <= t_min[0] - 1e-4f && t[1] <= t_min[1] - 1e-4f &&
        t[2] <= t_min[2] - 1e-4f && t[3] <= t_min[3] - 1e-4f) return false;

    if (has_cover && t[0] > 0.0f) {
        if (t[0] > t_cov[0] + 2e-4f && t[1] > t_cov[1] + 2e-4f &&
            t[2] > t_cov[2] + 2e-4f && t[3] > t_cov[3] + 2e-4f) return false;
    }

    float4 f2 = __ldg(&g.f2);
    float u[4], v[4];
    #pragma unroll
    for (int k = 0; k < 4; ++k) {
        float hx = fmaf(t[k], D[k].x, sx);
        float hy = fmaf(t[k], D[k].y, sy);
        float hz = fmaf(t[k], D[k].z, sz);
        u[k] = fmaf(hx, f1.z, fmaf(hy, f1.w, hz * f2.x));
        v[k] = fmaf(hx, f2.y, fmaf(hy, f2.z, hz * f2.w));
    }

    float u_min = fminf(fminf(u[0], u[1]), fminf(u[2], u[3]));
    float u_max = fmaxf(fmaxf(u[0], u[1]), fmaxf(u[2], u[3]));
    if (u_max < -1e-4f || u_min > 1.0f + 1e-4f) return false;

    float v_min = fminf(fminf(v[0], v[1]), fminf(v[2], v[3]));
    float v_max = fmaxf(fmaxf(v[0], v[1]), fmaxf(v[2], v[3]));
    if (v_max < -1e-4f || v_min > 1.0f + 1e-4f) return false;

    float uv_min = fminf(fminf(u[0] + v[0], u[1] + v[1]), fminf(u[2] + v[2], u[3] + v[3]));
    if (uv_min > 1.0f + 1e-4f) return false;
    return true;
}

// ZERO-I2F, ZERO-byte-unpacking, FAST-RCP 8-wide FP32 BVH8 traversal!
static constexpr int SMEM_STACK = 8; // 8 * 128 * 8 = 8 KB -> 8 blocks/SM (67% occupancy!)

__device__ __forceinline__ uint32_t test_bvh8_half(
    float4 lx, float4 hx, float4 ly, float4 hy, float4 lz, float4 hz,
    float inv_dx, float inv_dy, float inv_dz,
    float nox, float noy, float noz,
    float dx, float dy, float dz,
    float tmin_r, float max_t)
{
    float4 ax = (dx >= 0.0f) ? lx : hx, bx = (dx >= 0.0f) ? hx : lx;
    float4 ay = (dy >= 0.0f) ? ly : hy, by = (dy >= 0.0f) ? hy : ly;
    float4 az = (dz >= 0.0f) ? lz : hz, bz = (dz >= 0.0f) ? hz : lz;

    uint32_t mask = 0u;
    {
        float t0 = fmaxf(fmaxf(fmaf(ax.x, inv_dx, nox), fmaf(ay.x, inv_dy, noy)), fmaxf(fmaf(az.x, inv_dz, noz), tmin_r));
        float t1 = fminf(fminf(fmaf(bx.x, inv_dx, nox), fmaf(by.x, inv_dy, noy)), fminf(fmaf(bz.x, inv_dz, noz), max_t));
        if (t0 <= t1) mask |= 1u;
    }
    {
        float t0 = fmaxf(fmaxf(fmaf(ax.y, inv_dx, nox), fmaf(ay.y, inv_dy, noy)), fmaxf(fmaf(az.y, inv_dz, noz), tmin_r));
        float t1 = fminf(fminf(fmaf(bx.y, inv_dx, nox), fmaf(by.y, inv_dy, noy)), fminf(fmaf(bz.y, inv_dz, noz), max_t));
        if (t0 <= t1) mask |= 2u;
    }
    {
        float t0 = fmaxf(fmaxf(fmaf(ax.z, inv_dx, nox), fmaf(ay.z, inv_dy, noy)), fmaxf(fmaf(az.z, inv_dz, noz), tmin_r));
        float t1 = fminf(fminf(fmaf(bx.z, inv_dx, nox), fmaf(by.z, inv_dy, noy)), fminf(fmaf(bz.z, inv_dz, noz), max_t));
        if (t0 <= t1) mask |= 4u;
    }
    {
        float t0 = fmaxf(fmaxf(fmaf(ax.w, inv_dx, nox), fmaf(ay.w, inv_dy, noy)), fmaxf(fmaf(az.w, inv_dz, noz), tmin_r));
        float t1 = fminf(fminf(fmaf(bx.w, inv_dx, nox), fmaf(by.w, inv_dy, noy)), fminf(fmaf(bz.w, inv_dz, noz), max_t));
        if (t0 <= t1) mask |= 8u;
    }
    return mask;
}

// Specialized Ultra-Lean Any-Hit BVH8 (starts at custom `start_node`, tests leaves BEFORE pushing internal!)
template<int BLOCK_SZ>
__device__ bool traverse_bvh8_any(
    const BVH8Node* __restrict__ nodes,
    const TriGeom* __restrict__ tris,
    uint2* __restrict__ s_stack,
    float3 o, float3 d, float max_t,
    uint32_t start_node = 0u)
{
    constexpr float TMIN = 0.0002f;
    max_t = fminf(max_t, 1e6f);

    float inv_dx = (fabsf(d.x) > 1e-15f) ? __fdividef(1.0f, d.x) : copysignf(1e15f, d.x);
    float inv_dy = (fabsf(d.y) > 1e-15f) ? __fdividef(1.0f, d.y) : copysignf(1e15f, d.y);
    float inv_dz = (fabsf(d.z) > 1e-15f) ? __fdividef(1.0f, d.z) : copysignf(1e15f, d.z);
    float nox = -o.x * inv_dx, noy = -o.y * inv_dy, noz = -o.z * inv_dz;

    uint32_t oct = (d.x < 0.0f ? 1u : 0u) | (d.y < 0.0f ? 2u : 0u) | (d.z < 0.0f ? 4u : 0u);
    uint32_t octinv = 7u ^ oct;

    uint2 spill[28];
    int sp = 0;
    const int tid = threadIdx.x;
    uint2 node_group = make_uint2(0u, 0u);
    uint32_t cur_node = start_node;

    while (true) {
        const BVH8Node* np = nodes + cur_node;
        uint4 m = __ldg(&np->meta);
        uint32_t imask = m.x >> 24;

        uint32_t hit_slots = test_bvh8_half(
            __ldg(&np->lox0), __ldg(&np->hix0), __ldg(&np->loy0), __ldg(&np->hiy0),
            __ldg(&np->loz0), __ldg(&np->hiz0),
            inv_dx, inv_dy, inv_dz, nox, noy, noz, d.x, d.y, d.z, TMIN, max_t);
        hit_slots |= test_bvh8_half(
            __ldg(&np->lox1), __ldg(&np->hix1), __ldg(&np->loy1), __ldg(&np->hiy1),
            __ldg(&np->loz1), __ldg(&np->hiz1),
            inv_dx, inv_dy, inv_dz, nox, noy, noz, d.x, d.y, d.z, TMIN, max_t) << 4;

        // Test leaf triangles FIRST for instant early-out!
        uint32_t lh = hit_slots & ~imask;
        if (lh) {
            uint32_t tmask = 0u;
            while (lh) {
                int s = __ffs(lh) - 1;
                lh &= lh - 1u;
                uint32_t mb = ((s < 4 ? m.z : m.w) >> ((s & 3) * 8)) & 0xFFu;
                tmask |= (mb >> 5) << (mb & 31u);
            }
            while (tmask) {
                int bit = __ffs(tmask) - 1;
                tmask &= tmask - 1u;
                float t;
                if (intersect_tri_geom(tris[m.y + (uint32_t)bit], o, d, max_t, t)) return true;
            }
        }

        uint32_t p = hit_slots & imask;
        if (p) {
            if (octinv & 1u) p = ((p & 0x55u) << 1) | ((p & 0xAAu) >> 1);
            if (octinv & 2u) p = ((p & 0x33u) << 2) | ((p & 0xCCu) >> 2);
            if (octinv & 4u) p = ((p & 0x0Fu) << 4) | ((p & 0xF0u) >> 4);
            if (node_group.y > 0x00FFFFFFu) {
                if (sp < SMEM_STACK) s_stack[sp * BLOCK_SZ + tid] = node_group;
                else spill[sp - SMEM_STACK] = node_group;
                ++sp;
            }
            node_group = make_uint2(m.x & 0x00FFFFFFu, (p << 24) | imask);
        }

        if (node_group.y <= 0x00FFFFFFu) {
            if (sp == 0) return false;
            --sp;
            node_group = (sp < SMEM_STACK) ? s_stack[sp * BLOCK_SZ + tid] : spill[sp - SMEM_STACK];
        }
        int prio = 31 - __clz(node_group.y);
        node_group.y ^= (1u << prio);
        int s = (prio - 24) ^ (int)octinv;
        cur_node = node_group.x + __popc(node_group.y & ((1u << s) - 1u));
    }
}

// Specialized Closest-Hit BVH8 (no dead tri_group stack logic, fast __fdividef rcp!)
template<int BLOCK_SZ>
__device__ int traverse_bvh8_closest(
    const BVH8Node* __restrict__ nodes,
    const TriGeom* __restrict__ tris,
    uint2* __restrict__ s_stack,
    float3 o, float3 d, float& hit_t)
{
    constexpr float TMIN = 0.0002f;
    float max_t = fminf(hit_t, 1e6f);

    float inv_dx = (fabsf(d.x) > 1e-15f) ? __fdividef(1.0f, d.x) : copysignf(1e15f, d.x);
    float inv_dy = (fabsf(d.y) > 1e-15f) ? __fdividef(1.0f, d.y) : copysignf(1e15f, d.y);
    float inv_dz = (fabsf(d.z) > 1e-15f) ? __fdividef(1.0f, d.z) : copysignf(1e15f, d.z);
    float nox = -o.x * inv_dx, noy = -o.y * inv_dy, noz = -o.z * inv_dz;

    uint32_t oct = (d.x < 0.0f ? 1u : 0u) | (d.y < 0.0f ? 2u : 0u) | (d.z < 0.0f ? 4u : 0u);
    uint32_t octinv = 7u ^ oct;

    uint2 spill[28];
    int sp = 0;
    const int tid = threadIdx.x;
    int hit_slot = -1;
    uint2 node_group = make_uint2(0u, 0u);
    uint32_t cur_node = 0u;

    while (true) {
        const BVH8Node* np = nodes + cur_node;
        uint4 m = __ldg(&np->meta);
        uint32_t imask = m.x >> 24;

        uint32_t hit_slots = test_bvh8_half(
            __ldg(&np->lox0), __ldg(&np->hix0), __ldg(&np->loy0), __ldg(&np->hiy0),
            __ldg(&np->loz0), __ldg(&np->hiz0),
            inv_dx, inv_dy, inv_dz, nox, noy, noz, d.x, d.y, d.z, TMIN, max_t);
        hit_slots |= test_bvh8_half(
            __ldg(&np->lox1), __ldg(&np->hix1), __ldg(&np->loy1), __ldg(&np->hiy1),
            __ldg(&np->loz1), __ldg(&np->hiz1),
            inv_dx, inv_dy, inv_dz, nox, noy, noz, d.x, d.y, d.z, TMIN, max_t) << 4;

        // Intersect hit leaf triangles first (tightens max_t immediately!)
        uint32_t lh = hit_slots & ~imask;
        if (lh) {
            uint32_t tmask = 0u;
            while (lh) {
                int s = __ffs(lh) - 1;
                lh &= lh - 1u;
                uint32_t mb = ((s < 4 ? m.z : m.w) >> ((s & 3) * 8)) & 0xFFu;
                tmask |= (mb >> 5) << (mb & 31u);
            }
            while (tmask) {
                int bit = __ffs(tmask) - 1;
                tmask &= tmask - 1u;
                uint32_t tidx = m.y + (uint32_t)bit;
                float t;
                if (intersect_tri_geom(tris[tidx], o, d, max_t, t)) {
                    max_t = t;
                    hit_slot = (int)tidx;
                }
            }
        }

        uint32_t p = hit_slots & imask;
        if (p) {
            if (octinv & 1u) p = ((p & 0x55u) << 1) | ((p & 0xAAu) >> 1);
            if (octinv & 2u) p = ((p & 0x33u) << 2) | ((p & 0xCCu) >> 2);
            if (octinv & 4u) p = ((p & 0x0Fu) << 4) | ((p & 0xF0u) >> 4);
            if (node_group.y > 0x00FFFFFFu) {
                if (sp < SMEM_STACK) s_stack[sp * BLOCK_SZ + tid] = node_group;
                else spill[sp - SMEM_STACK] = node_group;
                ++sp;
            }
            node_group = make_uint2(m.x & 0x00FFFFFFu, (p << 24) | imask);
        }

        if (node_group.y <= 0x00FFFFFFu) {
            if (sp == 0) break;
            --sp;
            node_group = (sp < SMEM_STACK) ? s_stack[sp * BLOCK_SZ + tid] : spill[sp - SMEM_STACK];
        }
        int prio = 31 - __clz(node_group.y);
        node_group.y ^= (1u << prio);
        int s = (prio - 24) ^ (int)octinv;
        cur_node = node_group.x + __popc(node_group.y & ((1u << s) - 1u));
    }

    if (hit_slot >= 0) hit_t = max_t;
    return hit_slot;
}

// ---------- Phase B: Exact FP32 BVH8 Frustum, Shadow Beam & 4-Plane AO Pyramid ----------

__device__ __forceinline__ bool box_in_frustum(
    float3 blo, float3 bhi, float3 eye,
    const float3 N[4], const float slack[4],
    float3 d_cen, float near_min, float far_max)
{
    if (blo.x > bhi.x) return false;
    float3 rlo = make_float3(blo.x - eye.x, blo.y - eye.y, blo.z - eye.z);
    float3 rhi = make_float3(bhi.x - eye.x, bhi.y - eye.y, bhi.z - eye.z);

    float max_d = (d_cen.x >= 0.0f ? rhi.x : rlo.x) * d_cen.x
                + (d_cen.y >= 0.0f ? rhi.y : rlo.y) * d_cen.y
                + (d_cen.z >= 0.0f ? rhi.z : rlo.z) * d_cen.z;
    if (max_d < near_min) return false;
    float min_d = (d_cen.x >= 0.0f ? rlo.x : rhi.x) * d_cen.x
                + (d_cen.y >= 0.0f ? rlo.y : rhi.y) * d_cen.y
                + (d_cen.z >= 0.0f ? rlo.z : rhi.z) * d_cen.z;
    if (min_d > far_max) return false;

    #pragma unroll
    for (int k = 0; k < 4; ++k) {
        float md = (N[k].x >= 0.0f ? rhi.x : rlo.x) * N[k].x
                 + (N[k].y >= 0.0f ? rhi.y : rlo.y) * N[k].y
                 + (N[k].z >= 0.0f ? rhi.z : rlo.z) * N[k].z;
        if (md < slack[k]) return false;
    }
    return true;
}

__device__ __forceinline__ bool build_frustum_planes(
    const float3 D[4], float3 d_cen, float3 N[4], float min_dot[4], float& min_cos)
{
    min_cos = fminf(fminf(dot3(D[0], d_cen), dot3(D[1], d_cen)),
                    fminf(dot3(D[2], d_cen), dot3(D[3], d_cen)));
    if (min_cos <= 0.5f) return false;

    float3 e0 = cross3(D[2], D[0]), e1 = cross3(D[1], D[3]);
    float3 e2 = cross3(D[0], D[1]), e3 = cross3(D[3], D[2]);
    if (dot3(e0, e0) < 1e-20f || dot3(e1, e1) < 1e-20f || dot3(e2, e2) < 1e-20f || dot3(e3, e3) < 1e-20f) return false;

    N[0] = normalize3(e0); N[1] = normalize3(e1);
    N[2] = normalize3(e2); N[3] = normalize3(e3);
    #pragma unroll
    for (int k = 0; k < 4; ++k) {
        if (dot3(N[k], d_cen) < 0.0f) N[k] = make_float3(-N[k].x, -N[k].y, -N[k].z);
        min_dot[k] = fminf(fminf(dot3(N[k], D[0]), dot3(N[k], D[1])),
                           fminf(dot3(N[k], D[2]), dot3(N[k], D[3])));
    }
    return true;
}

__device__ __forceinline__ float get4(float4 v, int i) {
    return i == 0 ? v.x : (i == 1 ? v.y : (i == 2 ? v.z : v.w));
}

__device__ int query_frustum_candidates(
    const RenderParams& rp,
    float3 eye, const float3 D[4], const float3 N[4], const float slack[4],
    float3 d_cen, float near_min, float far_max,
    const float t_min[4], const float t_cov[4], bool has_cover,
    int skip_orig_id, int max_cand,
    int* out_slots, int* out_origs)
{
    uint32_t stack[48];
    int sp = 0;
    stack[sp++] = 0u;
    int nc = 0;

    while (sp > 0) {
        const BVH8Node* np = rp.b8_nodes + stack[--sp];
        uint4 m = __ldg(&np->meta);
        uint32_t child_base = m.x & 0x00FFFFFFu;
        uint32_t imask = m.x >> 24;

        int int_off = 0;
        for (int half = 0; half < 2; ++half) {
            float4 lx = __ldg(half ? &np->lox1 : &np->lox0);
            float4 hx = __ldg(half ? &np->hix1 : &np->hix0);
            float4 ly = __ldg(half ? &np->loy1 : &np->loy0);
            float4 hy = __ldg(half ? &np->hiy1 : &np->hiy0);
            float4 lz = __ldg(half ? &np->loz1 : &np->loz0);
            float4 hz = __ldg(half ? &np->hiz1 : &np->hiz0);
            uint32_t mword = half ? m.w : m.z;

            for (int i = 0; i < 4; ++i) {
                int s = (half << 2) + i;
                bool is_int = ((imask >> s) & 1u) != 0;
                int my_int_off = int_off;
                if (is_int) ++int_off;
                uint32_t mb = (mword >> (i * 8)) & 0xFFu;
                if (!is_int && mb == 0u) continue;

                float3 clo = make_float3(get4(lx, i), get4(ly, i), get4(lz, i));
                float3 chi = make_float3(get4(hx, i), get4(hy, i), get4(hz, i));
                if (!box_in_frustum(clo, chi, eye, N, slack, d_cen, near_min, far_max)) continue;

                if (is_int) {
                    if (sp >= 48) return -1;
                    stack[sp++] = child_base + (uint32_t)my_int_off;
                } else {
                    uint32_t tmask = (mb >> 5) << (mb & 31u);
                    while (tmask) {
                        int bit = __ffs(tmask) - 1;
                        tmask &= tmask - 1u;
                        int slot = (int)(m.y + (uint32_t)bit);
                        int orig = __ldg(&rp.b8_tri_ids[slot]);
                        if (orig == skip_orig_id) continue;
                        if (!tri_may_hit_frustum(rp.b8_tris[slot], eye, D, t_min, t_cov, has_cover)) continue;
                        bool dup = false;
                        for (int k = 0; k < nc; ++k) if (out_origs[k] == orig) { dup = true; break; }
                        if (!dup) {
                            if (nc >= max_cand) return -1;
                            out_slots[nc] = slot; out_origs[nc] = orig; ++nc;
                        }
                    }
                }
            }
        }
    }
    return nc;
}

__device__ ShadowMode query_shadow_beam(
    const RenderParams& rp,
    const float3 P[4], float3 p_lo, float3 p_hi,
    int skip_orig_id,
    int* out_slots, int& out_cnt)
{
    constexpr float TMIN = 0.0002f;
    constexpr float TMAX = 1e6f;
    float3 d = rp.light;
    float inv_dx = (fabsf(d.x) > 1e-15f) ? (1.0f / d.x) : copysignf(1e15f, d.x);
    float inv_dy = (fabsf(d.y) > 1e-15f) ? (1.0f / d.y) : copysignf(1e15f, d.y);
    float inv_dz = (fabsf(d.z) > 1e-15f) ? (1.0f / d.z) : copysignf(1e15f, d.z);

    float nox_lo = -(d.x >= 0.0f ? p_hi.x : p_lo.x) * inv_dx;
    float nox_hi = -(d.x >= 0.0f ? p_lo.x : p_hi.x) * inv_dx;
    float noy_lo = -(d.y >= 0.0f ? p_hi.y : p_lo.y) * inv_dy;
    float noy_hi = -(d.y >= 0.0f ? p_lo.y : p_hi.y) * inv_dy;
    float noz_lo = -(d.z >= 0.0f ? p_hi.z : p_lo.z) * inv_dz;
    float noz_hi = -(d.z >= 0.0f ? p_lo.z : p_hi.z) * inv_dz;

    uint32_t oct = (d.x < 0.0f ? 1u : 0u) | (d.y < 0.0f ? 2u : 0u) | (d.z < 0.0f ? 4u : 0u);
    uint32_t octinv = 7u ^ oct;

    uint32_t stack[48];
    int sp = 0;
    stack[sp++] = 0u;

    int out_origs[MAX_SH_CAND];
    int nc = 0;

    while (sp > 0) {
        const BVH8Node* np = rp.b8_nodes + stack[--sp];
        uint4 m = __ldg(&np->meta);
        uint32_t child_base = m.x & 0x00FFFFFFu;
        uint32_t imask = m.x >> 24;

        uint32_t hit_slots = 0u;
        for (int half = 0; half < 2; ++half) {
            float4 lx = __ldg(half ? &np->lox1 : &np->lox0);
            float4 hx = __ldg(half ? &np->hix1 : &np->hix0);
            float4 ly = __ldg(half ? &np->loy1 : &np->loy0);
            float4 hy = __ldg(half ? &np->hiy1 : &np->hiy0);
            float4 lz = __ldg(half ? &np->loz1 : &np->loz0);
            float4 hz = __ldg(half ? &np->hiz1 : &np->hiz0);
            float4 ax = (d.x >= 0.0f) ? lx : hx, bx = (d.x >= 0.0f) ? hx : lx;
            float4 ay = (d.y >= 0.0f) ? ly : hy, by = (d.y >= 0.0f) ? hy : ly;
            float4 az = (d.z >= 0.0f) ? lz : hz, bz = (d.z >= 0.0f) ? hz : lz;
            #pragma unroll
            for (int i = 0; i < 4; ++i) {
                float t0 = fmaxf(fmaxf(fmaf(get4(ax, i), inv_dx, nox_lo), fmaf(get4(ay, i), inv_dy, noy_lo)),
                                 fmaxf(fmaf(get4(az, i), inv_dz, noz_lo), TMIN));
                float t1 = fminf(fminf(fmaf(get4(bx, i), inv_dx, nox_hi), fmaf(get4(by, i), inv_dy, noy_hi)),
                                 fminf(fmaf(get4(bz, i), inv_dz, noz_hi), TMAX));
                if (t0 <= t1) hit_slots |= (1u << (i + (half << 2)));
            }
        }

        uint32_t lh = hit_slots & ~imask;
        while (lh) {
            int s = __ffs(lh) - 1;
            lh &= lh - 1u;
            uint32_t mb = ((s < 4 ? m.z : m.w) >> ((s & 3) * 8)) & 0xFFu;
            uint32_t tmask = (mb >> 5) << (mb & 31u);
            while (tmask) {
                int bit = __ffs(tmask) - 1;
                tmask &= tmask - 1u;
                int slot = (int)(m.y + (uint32_t)bit);
                int orig = __ldg(&rp.b8_tri_ids[slot]);
                if (orig == skip_orig_id) continue;

                const TriGeom& g = rp.b8_tris[slot];
                float t0, u0, v0, den;
                if (eval_tri_plane(g, P[0], d, t0, u0, v0, den)) {
                    float t1, u1, v1, t2, u2, v2, t3, u3, v3, dt;
                    eval_tri_plane(g, P[1], d, t1, u1, v1, dt);
                    eval_tri_plane(g, P[2], d, t2, u2, v2, dt);
                    eval_tri_plane(g, P[3], d, t3, u3, v3, dt);

                    if (fmaxf(fmaxf(t0, t1), fmaxf(t2, t3)) <= 0.0001f) continue;
                    float u_min = fminf(fminf(u0, u1), fminf(u2, u3)), u_max = fmaxf(fmaxf(u0, u1), fmaxf(u2, u3));
                    if (u_max < -1e-5f || u_min > 1.0f + 1e-5f) continue;
                    float v_min = fminf(fminf(v0, v1), fminf(v2, v3)), v_max = fmaxf(fmaxf(v0, v1), fmaxf(v2, v3));
                    if (v_max < -1e-5f || v_min > 1.0f + 1e-5f) continue;
                    float uv_min = fminf(fminf(u0 + v0, u1 + v1), fminf(u2 + v2, u3 + v3));
                    float uv_max = fmaxf(fmaxf(u0 + v0, u1 + v1), fmaxf(u2 + v2, u3 + v3));
                    if (uv_min > 1.0f + 1e-5f) continue;

                    float t_min = fminf(fminf(t0, t1), fminf(t2, t3));
                    if (t_min > 0.0003f && u_min >= 1e-5f && v_min >= 1e-5f && uv_max <= 1.0f - 1e-5f) {
                        out_cnt = 0; return SH_DARK;
                    }
                }
                bool dup = false;
                for (int k = 0; k < nc; ++k) if (out_origs[k] == orig) { dup = true; break; }
                if (!dup) {
                    if (nc >= MAX_SH_CAND) { out_cnt = 0; return SH_FALLBACK; }
                    out_slots[nc] = slot; out_origs[nc] = orig; ++nc;
                }
            }
        }

        uint32_t ih = hit_slots & imask;
        if (ih) {
            uint32_t p = ih;
            if (octinv & 1u) p = ((p & 0x55u) << 1) | ((p & 0xAAu) >> 1);
            if (octinv & 2u) p = ((p & 0x33u) << 2) | ((p & 0xCCu) >> 2);
            if (octinv & 4u) p = ((p & 0x0Fu) << 4) | ((p & 0xF0u) >> 4);
            while (p) {
                int prio = __ffs(p) - 1;
                p &= p - 1u;
                int s = prio ^ (int)octinv;
                uint32_t cidx = child_base + __popc(imask & ((1u << s) - 1u));
                if (sp >= 48) { out_cnt = 0; return SH_FALLBACK; }
                stack[sp++] = cidx;
            }
        }
    }

    out_cnt = nc;
    return (nc == 0) ? SH_LIT : SH_LIST;
}

// Ultra-fast zero-stack LCA + AO_OPEN/AO_LIST finder (2-5 node visits, ZERO raw_tris reads!)
__device__ AoMode query_ao_root(
    const RenderParams& rp,
    const float3 P[4], float3 p_lo, float3 p_hi, float3 n,
    int skip_orig_id,
    uint32_t& out_root_node,
    int* out_slots, int& out_cnt)
{
    float R_pad = rp.ao_radius + 2e-4f;
    float R2 = R_pad * R_pad;
    float d_plane = fminf(fminf(dot3(P[0], n), dot3(P[1], n)), fminf(dot3(P[2], n), dot3(P[3], n))) - 2e-4f;

    float3 tx;
    if (fabsf(n.z) < 0.8f) {
        float inv = rsqrtf(n.x * n.x + n.y * n.y);
        tx = make_float3(-n.y * inv, n.x * inv, 0.0f);
    } else {
        float inv = rsqrtf(n.x * n.x + n.z * n.z);
        tx = make_float3(n.z * inv, 0.0f, -n.x * inv);
    }
    float3 ty = cross3(n, tx);

    float3 PN[4];
    PN[0] = make_float3(4.0f * n.x - tx.x, 4.0f * n.y - tx.y, 4.0f * n.z - tx.z);
    PN[1] = make_float3(4.0f * n.x + tx.x, 4.0f * n.y + tx.y, 4.0f * n.z + tx.z);
    PN[2] = make_float3(4.0f * n.x - ty.x, 4.0f * n.y - ty.y, 4.0f * n.z - ty.z);
    PN[3] = make_float3(4.0f * n.x + ty.x, 4.0f * n.y + ty.y, 4.0f * n.z + ty.z);
    float min_pn[4];
    #pragma unroll
    for (int k = 0; k < 4; ++k) {
        min_pn[k] = fminf(fminf(dot3(P[0], PN[k]), dot3(P[1], PN[k])),
                          fminf(dot3(P[2], PN[k]), dot3(P[3], PN[k]))) - 1e-3f;
    }

    uint32_t cur = 0u;
    out_cnt = 0;

    for (int step = 0; step < 16; ++step) {
        const BVH8Node* np = rp.b8_nodes + cur;
        uint4 m = __ldg(&np->meta);
        uint32_t child_base = m.x & 0x00FFFFFFu;
        uint32_t imask = m.x >> 24;

        int int_off = 0;
        int hit_int_cnt = 0;
        uint32_t single_int = 0u;
        uint32_t hit_leaf_tmask = 0u;

        for (int half = 0; half < 2; ++half) {
            float4 lx = __ldg(half ? &np->lox1 : &np->lox0);
            float4 hx = __ldg(half ? &np->hix1 : &np->hix0);
            float4 ly = __ldg(half ? &np->loy1 : &np->loy0);
            float4 hy = __ldg(half ? &np->hiy1 : &np->hiy0);
            float4 lz = __ldg(half ? &np->loz1 : &np->loz0);
            float4 hz = __ldg(half ? &np->hiz1 : &np->hiz0);
            uint32_t mword = half ? m.w : m.z;

            for (int i = 0; i < 4; ++i) {
                int s = (half << 2) + i;
                bool is_int = ((imask >> s) & 1u) != 0;
                int my_int_off = int_off;
                if (is_int) ++int_off;
                uint32_t mb = (mword >> (i * 8)) & 0xFFu;
                if (!is_int && mb == 0u) continue;

                float3 blo = make_float3(get4(lx, i), get4(ly, i), get4(lz, i));
                float3 bhi = make_float3(get4(hx, i), get4(hy, i), get4(hz, i));

                float dx = fmaxf(0.0f, fmaxf(blo.x - p_hi.x, p_lo.x - bhi.x));
                float dy = fmaxf(0.0f, fmaxf(blo.y - p_hi.y, p_lo.y - bhi.y));
                float dz = fmaxf(0.0f, fmaxf(blo.z - p_hi.z, p_lo.z - bhi.z));
                if (dx * dx + dy * dy + dz * dz > R2) continue;

                float max_dn = (n.x >= 0.0f ? bhi.x : blo.x) * n.x
                             + (n.y >= 0.0f ? bhi.y : blo.y) * n.y
                             + (n.z >= 0.0f ? bhi.z : blo.z) * n.z;
                if (max_dn < d_plane) continue;

                bool outside = false;
                #pragma unroll
                for (int k = 0; k < 4; ++k) {
                    float mp = (PN[k].x >= 0.0f ? bhi.x : blo.x) * PN[k].x
                             + (PN[k].y >= 0.0f ? bhi.y : blo.y) * PN[k].y
                             + (PN[k].z >= 0.0f ? bhi.z : blo.z) * PN[k].z;
                    if (mp < min_pn[k]) { outside = true; break; }
                }
                if (outside) continue;

                if (is_int) {
                    single_int = child_base + (uint32_t)my_int_off;
                    ++hit_int_cnt;
                } else {
                    hit_leaf_tmask |= (mb >> 5) << (mb & 31u);
                }
            }
        }

        if (hit_int_cnt == 0 && hit_leaf_tmask == 0u) {
            return AO_OPEN;
        }
        if (hit_int_cnt == 1 && hit_leaf_tmask == 0u) {
            cur = single_int;
            continue;
        }
        if (hit_int_cnt == 0 && hit_leaf_tmask != 0u) {
            int out_origs[MAX_AO_CAND];
            int nc = 0;
            uint32_t tm = hit_leaf_tmask;
            while (tm) {
                int bit = __ffs(tm) - 1;
                tm &= tm - 1u;
                int slot = (int)(m.y + (uint32_t)bit);
                int orig = __ldg(&rp.b8_tri_ids[slot]);
                if (orig == skip_orig_id) continue;
                bool dup = false;
                for (int k = 0; k < nc; ++k) if (out_origs[k] == orig) { dup = true; break; }
                if (!dup) {
                    if (nc >= MAX_AO_CAND) { out_root_node = cur; return AO_FALLBACK; }
                    out_slots[nc] = slot; out_origs[nc] = orig; ++nc;
                }
            }
            out_cnt = nc;
            return (nc == 0) ? AO_OPEN : AO_LIST;
        }
        // Multiple children overlap -> `cur` is the exact tightest LCA!
        out_root_node = cur;
        return AO_FALLBACK;
    }

    out_root_node = cur;
    return AO_FALLBACK;
}

// ---------- Pixel Classifier Kernel ----------

static constexpr int CLASSIFY_BLOCK = 128;

__global__ __launch_bounds__(CLASSIFY_BLOCK, 4)
void k_pixel_classify(
    RenderParams rp, int tile_w, int total_tiled_pixels, int pool_cap,
    PixelInfo* __restrict__ pix_info,
    int* __restrict__ cand_pool,
    int* __restrict__ q_sfast,
    int* __restrict__ q_sao,
    int* __restrict__ q_strace,
    int* __restrict__ q_plist,
    int* __restrict__ q_fallback,
    int* __restrict__ pix_counters,
    float* __restrict__ out_rgb)
{
    __shared__ uint2 s_stack[SMEM_STACK * CLASSIFY_BLOCK];

    int tiled_pix = blockIdx.x * blockDim.x + threadIdx.x;
    if (tiled_pix >= total_tiled_pixels) return;

    int tile_idx = tiled_pix >> 5;
    int in_tile = tiled_pix & 31;
    int ty_tile = tile_idx / tile_w;
    int tx_tile = tile_idx - ty_tile * tile_w;
    int px = (tx_tile << 3) + (in_tile & 7);
    int py = (ty_tile << 2) + (in_tile >> 3);
    if (px >= rp.width || py >= rp.height) return;

    int pixel = py * rp.width + px;

    float inv_w = 1.0f / float(rp.width);
    float inv_h = 1.0f / float(rp.height);
    float x0 = float(px) * inv_w * 2.0f - 1.0f;
    float x1 = float(px + 1) * inv_w * 2.0f - 1.0f;
    float y0 = 1.0f - float(py) * inv_h * 2.0f;
    float y1 = 1.0f - float(py + 1) * inv_h * 2.0f;
    float xc = 0.5f * (x0 + x1);
    float yc = 0.5f * (y0 + y1);

    auto make_dir = [&](float x, float y) -> float3 {
        return make_float3(rp.w.x + rp.u.x * x + rp.v.x * y,
                           rp.w.y + rp.u.y * x + rp.v.y * y,
                           rp.w.z + rp.u.z * x + rp.v.z * y);
    };
    float3 D[4];
    D[0] = normalize3(make_dir(x0, y0));
    D[1] = normalize3(make_dir(x1, y0));
    D[2] = normalize3(make_dir(x0, y1));
    D[3] = normalize3(make_dir(x1, y1));
    float3 d_cen = normalize3(make_dir(xc, yc));

    float3 N[4]; float min_dot[4]; float min_cos;
    if (!build_frustum_planes(D, d_cen, N, min_dot, min_cos)) {
        int dst = warpAtomicAdd(&pix_counters[5], 1);
        q_fallback[dst] = pixel;
        return;
    }

    const float t_min0[4] = {0.0002f, 0.0002f, 0.0002f, 0.0002f};
    const float t_inf[4]  = {1e6f, 1e6f, 1e6f, 1e6f};

    float hit_t = 1e20f;
    int hit_slot = traverse_bvh8_closest<CLASSIFY_BLOCK>(rp.b8_nodes, rp.b8_tris, s_stack, rp.eye, d_cen, hit_t);

    if (hit_slot < 0) {
        float far_max = 128.0f;
        float slack[4];
        #pragma unroll
        for (int k = 0; k < 4; ++k) slack[k] = far_max * (fminf(0.0f, min_dot[k]) - 1e-5f) - 1e-4f;
        int c_slots[MAX_PRIM_CAND], c_origs[MAX_PRIM_CAND];
        int nc = query_frustum_candidates(rp, rp.eye, D, N, slack, d_cen, 0.0001f, far_max, t_min0, t_inf, false, -1, MAX_PRIM_CAND, c_slots, c_origs);
        if (nc == 0) {
            float3 sum = make_float3(0.0f, 0.0f, 0.0f);
            uint32_t base_key = rp.seed + uint32_t(pixel) * 0x9e3779b9u;
            for (int sid = 0; sid < rp.spp; ++sid) {
                uint32_t key = base_key + uint32_t(sid) * 0x85ebca6bu;
                float cx = (float(px) + sample_f(key)) * inv_w * 2.0f - 1.0f;
                float cy = 1.0f - (float(py) + sample_f(key ^ 0xa511e9b3u)) * inv_h * 2.0f;
                float3 sk = sky_color(normalize3(make_dir(cx, cy)));
                sum.x += sk.x; sum.y += sk.y; sum.z += sk.z;
            }
            float inv_spp = 1.0f / float(rp.spp);
            out_rgb[3 * pixel + 0] = sum.x * inv_spp;
            out_rgb[3 * pixel + 1] = sum.y * inv_spp;
            out_rgb[3 * pixel + 2] = sum.z * inv_spp;
            return;
        }
        if (nc > 0) {
            int off = atomicReserveFast(&pix_counters[0], nc, pool_cap);
            if (off >= 0) {
                for (int k = 0; k < nc; ++k) cand_pool[off + k] = c_slots[k];
                PixelInfo info{};
                info.prim_data = (uint32_t)off;
                info.flags = PRIM_LIST | ((uint32_t)nc << 2);
                pix_info[pixel] = info;
                int dst = warpAtomicAdd(&pix_counters[4], 1);
                q_plist[dst] = pixel;
                return;
            }
        }
        int dst = warpAtomicAdd(&pix_counters[5], 1);
        q_fallback[dst] = pixel;
        return;
    }

    const TriGeom& g = rp.b8_tris[hit_slot];
    float t[4], u[4], v[4], den[4];
    bool all_cover = true;
    #pragma unroll
    for (int k = 0; k < 4; ++k) {
        if (!eval_tri_plane(g, rp.eye, D[k], t[k], u[k], v[k], den[k])) all_cover = false;
    }
    if (all_cover) {
        bool same_sign = (den[0] > 0.0f && den[1] > 0.0f && den[2] > 0.0f && den[3] > 0.0f) ||
                         (den[0] < 0.0f && den[1] < 0.0f && den[2] < 0.0f && den[3] < 0.0f);
        all_cover = same_sign;
        #pragma unroll
        for (int k = 0; k < 4; ++k) {
            if (!(t[k] > 0.0003f && t[k] < 1e5f && u[k] >= 1e-5f && v[k] >= 1e-5f && (u[k] + v[k]) <= (1.0f - 1e-5f))) all_cover = false;
        }
    }

    int orig_id = __ldg(&rp.b8_tri_ids[hit_slot]);

    if (all_cover) {
        float t_cover = fmaxf(fmaxf(t[0], t[1]), fmaxf(t[2], t[3])) + 1e-3f;
        float far_max = fminf(t_cover, 128.0f);
        float slack[4];
        #pragma unroll
        for (int k = 0; k < 4; ++k) slack[k] = far_max * (fminf(0.0f, min_dot[k]) - 1e-5f) - 1e-4f;

        int c_slots[MAX_PRIM_CAND], c_origs[MAX_PRIM_CAND];
        int nc = query_frustum_candidates(rp, rp.eye, D, N, slack, d_cen, 0.0001f, far_max, t_min0, t, true, orig_id, MAX_PRIM_CAND - 1, c_slots, c_origs);

        if (nc == 0) {
            float4 gf0 = __ldg(&g.f0);
            float4 gf1 = __ldg(&g.f1);
            float3 n = make_float3(gf0.w, gf1.x, gf1.y);
            if (den[0] > 0.0f) n = make_float3(-n.x, -n.y, -n.z);

            float4 sh = __ldg(&rp.tri_shade[orig_id]);
            float mirror = sh.w;

            float3 P[4];
            #pragma unroll
            for (int k = 0; k < 4; ++k) {
                P[k] = make_float3(fmaf(D[k].x, t[k], rp.eye.x) + n.x * 0.001f,
                                   fmaf(D[k].y, t[k], rp.eye.y) + n.y * 0.001f,
                                   fmaf(D[k].z, t[k], rp.eye.z) + n.z * 0.001f);
            }
            float3 p_lo = make_float3(
                fminf(fminf(P[0].x, P[1].x), fminf(P[2].x, P[3].x)) - 2e-4f,
                fminf(fminf(P[0].y, P[1].y), fminf(P[2].y, P[3].y)) - 2e-4f,
                fminf(fminf(P[0].z, P[1].z), fminf(P[2].z, P[3].z)) - 2e-4f);
            float3 p_hi = make_float3(
                fmaxf(fmaxf(P[0].x, P[1].x), fmaxf(P[2].x, P[3].x)) + 2e-4f,
                fmaxf(fmaxf(P[0].y, P[1].y), fmaxf(P[2].y, P[3].y)) + 2e-4f,
                fmaxf(fmaxf(P[0].z, P[1].z), fmaxf(P[2].z, P[3].z)) + 2e-4f);

            float cosine = dot3(n, rp.light);
            ShadowMode sh_mode = SH_DARK;
            int sh_slots[MAX_SH_CAND]; int sh_cnt = 0;
            if (mirror < 1.0f && cosine > 0.0f) {
                sh_mode = query_shadow_beam(rp, P, p_lo, p_hi, orig_id, sh_slots, sh_cnt);
            } else {
                if (cosine < 0.0f) cosine = 0.0f;
            }

            AoMode ao_mode = AO_OPEN;
            int ao_slots[MAX_AO_CAND]; int ao_cnt = 0;
            uint32_t ao_root = 0u;
            if (mirror < 1.0f && rp.ao > 0) {
                ao_mode = query_ao_root(rp, P, p_lo, p_hi, n, orig_id, ao_root, ao_slots, ao_cnt);
            }

            bool d0_const = (mirror == 1.0f) || ((sh_mode == SH_LIT || sh_mode == SH_DARK) && ao_mode == AO_OPEN);
            float3 d0_rgb = make_float3(0.0f, 0.0f, 0.0f);
            if (d0_const && mirror < 1.0f) {
                float vis = (sh_mode == SH_LIT) ? 1.0f : 0.0f;
                float val = (0.08f + 0.20f + 0.72f * cosine * vis) * (1.0f - mirror);
                d0_rgb = make_float3(val * sh.x, val * sh.y, val * sh.z);
            }

            if (mirror == 0.0f || rp.max_depth <= 1) {
                if (d0_const) {
                    out_rgb[3 * pixel + 0] = d0_rgb.x;
                    out_rgb[3 * pixel + 1] = d0_rgb.y;
                    out_rgb[3 * pixel + 2] = d0_rgb.z;
                    return;
                }
            }

            Ref1Mode ref1_mode = REF1_TRACE;
            float3 ref1_const_rgb = make_float3(0.0f, 0.0f, 0.0f);

            if (mirror > 0.0f && rp.max_depth > 1) {
                float plane_dist = (gf0.x - rp.eye.x) * n.x + (gf0.y - rp.eye.y) * n.y + (gf0.z - rp.eye.z) * n.z;
                float shift = 2.0f * plane_dist + 0.001f;
                float3 eye1 = make_float3(rp.eye.x + n.x * shift, rp.eye.y + n.y * shift, rp.eye.z + n.z * shift);

                float3 R[4];
                #pragma unroll
                for (int k = 0; k < 4; ++k) R[k] = reflect3(D[k], n);
                float3 r_cen = reflect3(d_cen, n);

                float3 RN[4]; float r_min_dot[4]; float r_min_cos;
                if (build_frustum_planes(R, r_cen, RN, r_min_dot, r_min_cos)) {
                    float t_cen = -((rp.eye.x - gf0.x) * n.x + (rp.eye.y - gf0.y) * n.y + (rp.eye.z - gf0.z) * n.z) / dot3(d_cen, n);
                    float3 p_cen = make_float3(fmaf(d_cen.x, t_cen, rp.eye.x) + n.x * 0.001f,
                                               fmaf(d_cen.y, t_cen, rp.eye.y) + n.y * 0.001f,
                                               fmaf(d_cen.z, t_cen, rp.eye.z) + n.z * 0.001f);
                    float hit1_s = 1e20f;
                    int hit1_slot = traverse_bvh8_closest<CLASSIFY_BLOCK>(rp.b8_nodes, rp.b8_tris, s_stack, p_cen, r_cen, hit1_s);

                    float t1_min[4];
                    #pragma unroll
                    for (int k = 0; k < 4; ++k) t1_min[k] = t[k] + 0.0002f;
                    float near1 = fminf(fminf(t[0], t[1]), fminf(t[2], t[3])) * r_min_cos - 1e-3f;

                    if (hit1_slot < 0) {
                        float far1 = 160.0f;
                        float rslack[4];
                        #pragma unroll
                        for (int k = 0; k < 4; ++k) rslack[k] = far1 * (fminf(0.0f, r_min_dot[k]) - 1e-5f) - 1e-4f;
                        int tmp_s[1], tmp_o[1];
                        int nc1 = query_frustum_candidates(rp, eye1, R, RN, rslack, r_cen, near1, far1, t1_min, t_inf, false, orig_id, 0, tmp_s, tmp_o);
                        if (nc1 == 0) {
                            ref1_mode = REF1_SKY;
                            if (d0_const) {
                                float3 sum = make_float3(0.0f, 0.0f, 0.0f);
                                uint32_t base_key = rp.seed + uint32_t(pixel) * 0x9e3779b9u;
                                for (int sid = 0; sid < rp.spp; ++sid) {
                                    uint32_t key = base_key + uint32_t(sid) * 0x85ebca6bu;
                                    float cx = (float(px) + sample_f(key)) * inv_w * 2.0f - 1.0f;
                                    float cy = 1.0f - (float(py) + sample_f(key ^ 0xa511e9b3u)) * inv_h * 2.0f;
                                    float3 sk = sky_color(reflect3(normalize3(make_dir(cx, cy)), n));
                                    sum.x += sk.x; sum.y += sk.y; sum.z += sk.z;
                                }
                                float inv_spp = mirror / float(rp.spp);
                                out_rgb[3 * pixel + 0] = d0_rgb.x + sum.x * inv_spp;
                                out_rgb[3 * pixel + 1] = d0_rgb.y + sum.y * inv_spp;
                                out_rgb[3 * pixel + 2] = d0_rgb.z + sum.z * inv_spp;
                                return;
                            }
                        }
                    } else {
                        int orig1 = __ldg(&rp.b8_tri_ids[hit1_slot]);
                        float4 sh1 = __ldg(&rp.tri_shade[orig1]);
                        if (sh1.w == 0.0f) {
                            const TriGeom& g1 = rp.b8_tris[hit1_slot];
                            float t1[4], u1[4], v1[4], den1[4];
                            bool cov1 = true;
                            #pragma unroll
                            for (int k = 0; k < 4; ++k) {
                                if (!eval_tri_plane(g1, eye1, R[k], t1[k], u1[k], v1[k], den1[k])) cov1 = false;
                            }
                            if (cov1) {
                                bool sgn1 = (den1[0] > 0.0f && den1[1] > 0.0f && den1[2] > 0.0f && den1[3] > 0.0f) ||
                                            (den1[0] < 0.0f && den1[1] < 0.0f && den1[2] < 0.0f && den1[3] < 0.0f);
                                cov1 = sgn1;
                                #pragma unroll
                                for (int k = 0; k < 4; ++k) {
                                    if (!(t1[k] > t[k] + 0.0004f && t1[k] < 1e5f && u1[k] >= 1e-5f && v1[k] >= 1e-5f && (u1[k] + v1[k]) <= (1.0f - 1e-5f))) cov1 = false;
                                }
                            }
                            if (cov1) {
                                float far1 = fminf(fmaxf(fmaxf(t1[0], t1[1]), fmaxf(t1[2], t1[3])) + 1e-3f, 160.0f);
                                float rslack[4];
                                #pragma unroll
                                for (int k = 0; k < 4; ++k) rslack[k] = far1 * (fminf(0.0f, r_min_dot[k]) - 1e-5f) - 1e-4f;
                                int tmp_s[1], tmp_o[1];
                                int nc1 = query_frustum_candidates(rp, eye1, R, RN, rslack, r_cen, near1, far1, t1_min, t1, true, orig1, 0, tmp_s, tmp_o);
                                if (nc1 == 0) {
                                    float4 g1f0 = __ldg(&g1.f0);
                                    float4 g1f1 = __ldg(&g1.f1);
                                    float3 n1 = make_float3(g1f0.w, g1f1.x, g1f1.y);
                                    if (den1[0] > 0.0f) n1 = make_float3(-n1.x, -n1.y, -n1.z);

                                    float3 P1[4];
                                    #pragma unroll
                                    for (int k = 0; k < 4; ++k) {
                                        P1[k] = make_float3(fmaf(R[k].x, t1[k], eye1.x) + n1.x * 0.001f,
                                                            fmaf(R[k].y, t1[k], eye1.y) + n1.y * 0.001f,
                                                            fmaf(R[k].z, t1[k], eye1.z) + n1.z * 0.001f);
                                    }
                                    float3 p1_lo = make_float3(
                                        fminf(fminf(P1[0].x, P1[1].x), fminf(P1[2].x, P1[3].x)) - 2e-4f,
                                        fminf(fminf(P1[0].y, P1[1].y), fminf(P1[2].y, P1[3].y)) - 2e-4f,
                                        fminf(fminf(P1[0].z, P1[1].z), fminf(P1[2].z, P1[3].z)) - 2e-4f);
                                    float3 p1_hi = make_float3(
                                        fmaxf(fmaxf(P1[0].x, P1[1].x), fmaxf(P1[2].x, P1[3].x)) + 2e-4f,
                                        fmaxf(fmaxf(P1[0].y, P1[1].y), fmaxf(P1[2].y, P1[3].y)) + 2e-4f,
                                        fmaxf(fmaxf(P1[0].z, P1[1].z), fmaxf(P1[2].z, P1[3].z)) + 2e-4f);

                                    float cos1 = dot3(n1, rp.light);
                                    ShadowMode sh1_mode = SH_DARK;
                                    int d_sh[MAX_SH_CAND]; int d_shc = 0;
                                    if (cos1 > 0.0f) sh1_mode = query_shadow_beam(rp, P1, p1_lo, p1_hi, orig1, d_sh, d_shc);
                                    else cos1 = 0.0f;

                                    AoMode ao1_mode = AO_OPEN;
                                    int d_ao[MAX_AO_CAND]; int d_aoc = 0; uint32_t d_ao_root = 0u;
                                    if (rp.ao > 0 && (sh1_mode == SH_LIT || sh1_mode == SH_DARK)) {
                                        ao1_mode = query_ao_root(rp, P1, p1_lo, p1_hi, n1, orig1, d_ao_root, d_ao, d_aoc);
                                    }

                                    if ((sh1_mode == SH_LIT || sh1_mode == SH_DARK) && ao1_mode == AO_OPEN) {
                                        float vis1 = (sh1_mode == SH_LIT) ? 1.0f : 0.0f;
                                        float val1 = (0.08f + 0.20f + 0.72f * cos1 * vis1) * mirror;
                                        ref1_const_rgb = make_float3(val1 * sh1.x, val1 * sh1.y, val1 * sh1.z);
                                        ref1_mode = REF1_CONST;
                                        if (d0_const) {
                                            out_rgb[3 * pixel + 0] = d0_rgb.x + ref1_const_rgb.x;
                                            out_rgb[3 * pixel + 1] = d0_rgb.y + ref1_const_rgb.y;
                                            out_rgb[3 * pixel + 2] = d0_rgb.z + ref1_const_rgb.z;
                                            return;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            uint32_t sh_off = 0u, ao_data = ao_root;
            if (sh_mode == SH_LIST) {
                int off = atomicReserveFast(&pix_counters[0], sh_cnt, pool_cap);
                if (off >= 0) {
                    for (int k = 0; k < sh_cnt; ++k) cand_pool[off + k] = sh_slots[k];
                    sh_off = (uint32_t)off;
                } else { sh_mode = SH_FALLBACK; sh_cnt = 0; }
            }
            if (ao_mode == AO_LIST) {
                int off = atomicReserveFast(&pix_counters[0], ao_cnt, pool_cap);
                if (off >= 0) {
                    for (int k = 0; k < ao_cnt; ++k) cand_pool[off + k] = ao_slots[k];
                    ao_data = (uint32_t)off;
                } else { ao_mode = AO_FALLBACK; ao_cnt = 0; ao_data = ao_root; }
            }

            PixelInfo info;
            info.prim_data = (uint32_t)hit_slot;
            info.shadow_off = sh_off;
            info.ao_data = ao_data;
            info.flags = PRIM_SINGLE
                       | ((uint32_t)sh_mode << 6) | ((uint32_t)sh_cnt << 8)
                       | ((uint32_t)ao_mode << 12) | ((uint32_t)ao_cnt << 14)
                       | ((uint32_t)ref1_mode << 19);
            info.ref1_rgb = make_float4(ref1_const_rgb.x, ref1_const_rgb.y, ref1_const_rgb.z, 0.0f);
            pix_info[pixel] = info;

            bool needs_ref = (mirror > 0.0f && rp.max_depth > 1 && ref1_mode == REF1_TRACE);
            bool needs_sh  = (sh_mode == SH_FALLBACK);
            bool needs_ao  = (ao_mode == AO_FALLBACK);
            if (!needs_ref && !needs_sh && !needs_ao) {
                int dst = warpAtomicAdd(&pix_counters[1], 1);
                q_sfast[dst] = pixel;
            } else if (!needs_ref && !needs_sh && needs_ao) {
                // Dedicated AO-only fast queue (ZERO closest-hit, ZERO reflection, direction-sorted!)
                int dst = warpAtomicAdd(&pix_counters[2], 1);
                q_sao[dst] = pixel;
            } else {
                int dst = warpAtomicAdd(&pix_counters[3], 1);
                q_strace[dst] = pixel;
            }
            return;
        }

        if (nc > 0) {
            int total_c = nc + 1;
            int off = atomicReserveFast(&pix_counters[0], total_c, pool_cap);
            if (off >= 0) {
                cand_pool[off] = hit_slot;
                for (int k = 0; k < nc; ++k) cand_pool[off + 1 + k] = c_slots[k];
                PixelInfo info{};
                info.prim_data = (uint32_t)off;
                info.flags = PRIM_LIST | ((uint32_t)total_c << 2);
                pix_info[pixel] = info;
                int dst = warpAtomicAdd(&pix_counters[4], 1);
                q_plist[dst] = pixel;
                return;
            }
        }
    } else {
        float far_max = 128.0f;
        float slack[4];
        #pragma unroll
        for (int k = 0; k < 4; ++k) slack[k] = far_max * (fminf(0.0f, min_dot[k]) - 1e-5f) - 1e-4f;
        int c_slots[MAX_PRIM_CAND], c_origs[MAX_PRIM_CAND];
        int nc = query_frustum_candidates(rp, rp.eye, D, N, slack, d_cen, 0.0001f, far_max, t_min0, t_inf, false, -1, MAX_PRIM_CAND, c_slots, c_origs);
        if (nc > 0) {
            int off = atomicReserveFast(&pix_counters[0], nc, pool_cap);
            if (off >= 0) {
                for (int k = 0; k < nc; ++k) cand_pool[off + k] = c_slots[k];
                PixelInfo info{};
                info.prim_data = (uint32_t)off;
                info.flags = PRIM_LIST | ((uint32_t)nc << 2);
                pix_info[pixel] = info;
                int dst = warpAtomicAdd(&pix_counters[4], 1);
                q_plist[dst] = pixel;
                return;
            }
        }
    }

    int dst = warpAtomicAdd(&pix_counters[5], 1);
    q_fallback[dst] = pixel;
}

// ---------- Warp Segmented Accumulation ----------

__device__ __forceinline__ void warp_accumulate_rgb(int pixel, float3 res, float inv_spp, float* __restrict__ out_rgb) {
    int lane = threadIdx.x & 31;
    #pragma unroll
    for (int off = 1; off < 32; off <<= 1) {
        int other_pix = __shfl_down_sync(0xFFFFFFFFu, pixel, off);
        float rx = __shfl_down_sync(0xFFFFFFFFu, res.x, off);
        float ry = __shfl_down_sync(0xFFFFFFFFu, res.y, off);
        float rz = __shfl_down_sync(0xFFFFFFFFu, res.z, off);
        if (lane + off < 32 && pixel >= 0 && other_pix == pixel) {
            res.x += rx; res.y += ry; res.z += rz;
        }
    }
    int prev_pix = __shfl_up_sync(0xFFFFFFFFu, pixel, 1);
    if (pixel >= 0 && (lane == 0 || prev_pix != pixel)) {
        atomicAdd(&out_rgb[3 * pixel + 0], res.x * inv_spp);
        atomicAdd(&out_rgb[3 * pixel + 1], res.y * inv_spp);
        atomicAdd(&out_rgb[3 * pixel + 2], res.z * inv_spp);
    }
}

// ---------- Shared Reflection Bounce Loop ----------

template<int BLOCK_SZ>
__device__ __forceinline__ void trace_bounces(
    const RenderParams& rp,
    uint2* __restrict__ s_stack,
    uint32_t cam_key,
    float3 ro, float3 rd, float through, int start_depth,
    float3& res)
{
    for (int depth = start_depth; depth < rp.max_depth; ++depth) {
        float hit_t = 1e20f;
        int hit_slot = traverse_bvh8_closest<BLOCK_SZ>(rp.b8_nodes, rp.b8_tris, s_stack, ro, rd, hit_t);
        if (hit_slot < 0) {
            float3 sk = sky_color(rd);
            res.x += through * sk.x; res.y += through * sk.y; res.z += through * sk.z;
            break;
        }

        float4 gf0 = __ldg(&rp.b8_tris[hit_slot].f0);
        float4 gf1 = __ldg(&rp.b8_tris[hit_slot].f1);
        float3 n = make_float3(gf0.w, gf1.x, gf1.y);
        float ndotd = dot3(n, rd);
        if (ndotd > 0.0f) { n = make_float3(-n.x, -n.y, -n.z); ndotd = -ndotd; }

        int orig_id = __ldg(&rp.b8_tri_ids[hit_slot]);
        float4 sh = __ldg(&rp.tri_shade[orig_id]);
        float mirror = sh.w;

        float3 p = make_float3(
            fmaf(rd.x, hit_t, ro.x) + n.x * 0.001f,
            fmaf(rd.y, hit_t, ro.y) + n.y * 0.001f,
            fmaf(rd.z, hit_t, ro.z) + n.z * 0.001f);

        if (mirror < 1.0f) {
            float cosine = dot3(n, rp.light);
            float visible = 0.0f;
            if (cosine > 0.0f) {
                visible = traverse_bvh8_any<BLOCK_SZ>(rp.b8_nodes, rp.b8_tris, s_stack, p, rp.light, 1e6f) ? 0.0f : 1.0f;
            } else {
                cosine = 0.0f;
            }

            float ambient = 1.0f;
            if (rp.ao > 0) {
                float3 tx;
                if (fabsf(n.z) < 0.8f) {
                    float inv = rsqrtf(n.x * n.x + n.y * n.y);
                    tx = make_float3(-n.y * inv, n.x * inv, 0.0f);
                } else {
                    float inv = rsqrtf(n.x * n.x + n.z * n.z);
                    tx = make_float3(n.z * inv, 0.0f, -n.x * inv);
                }
                float3 ty = cross3(n, tx);

                int open = 0;
                uint32_t ao_base = cam_key + uint32_t(depth) * 0xc2b2ae35u;
                for (int a = 0; a < rp.ao; ++a) {
                    uint32_t key = ao_base + uint32_t(a) * 0x27d4eb2du;
                    float ax = 2.0f * sample_f(key ^ 0x68bc21ebu) - 1.0f;
                    float ay = 2.0f * sample_f(key ^ 0x02e5be93u) - 1.0f;
                    float az = 0.25f + 0.75f * sample_f(key ^ 0x967a889bu);
                    float3 adir = normalize3(make_float3(
                        tx.x * ax + ty.x * ay + n.x * az,
                        tx.y * ax + ty.y * ay + n.y * az,
                        tx.z * ax + ty.z * ay + n.z * az));
                    open += !traverse_bvh8_any<BLOCK_SZ>(rp.b8_nodes, rp.b8_tris, s_stack, p, adir, rp.ao_radius);
                }
                ambient = float(open) / float(rp.ao);
            }

            float val = (0.08f + 0.20f * ambient + 0.72f * cosine * visible) * (1.0f - mirror) * through;
            res.x += val * sh.x; res.y += val * sh.y; res.z += val * sh.z;
        }

        if (mirror == 0.0f || depth + 1 >= rp.max_depth) break;
        through *= mirror;
        ro = p;
        float k2 = 2.0f * ndotd;
        rd = normalize3(make_float3(rd.x - n.x * k2, rd.y - n.y * k2, rd.z - n.z * k2));
    }
}

// ---------- Bucket 1A: ZERO-BVH Fast Single-Triangle Kernel ----------

__global__ __launch_bounds__(256, 6)
void k_shade_sfast(
    RenderParams rp,
    const int* __restrict__ q_sfast,
    const PixelInfo* __restrict__ pix_info,
    const int* __restrict__ cand_pool,
    int offset, int end,
    float* __restrict__ out_rgb)
{
    int idx = offset + blockIdx.x * blockDim.x + threadIdx.x;
    int pixel = -1;
    float3 res = make_float3(0.0f, 0.0f, 0.0f);

    if (idx < end) {
        int q_i = idx / rp.spp;
        int sid = idx - q_i * rp.spp;
        pixel = __ldg(&q_sfast[q_i]);
        int py = pixel / rp.width;
        int px = pixel - py * rp.width;

        PixelInfo info = pix_info[pixel];
        int hit_slot = (int)info.prim_data;
        uint32_t sh_mode   = (info.flags >> 6) & 3u;
        uint32_t sh_cnt    = (info.flags >> 8) & 15u;
        uint32_t ao_mode   = (info.flags >> 12) & 3u;
        uint32_t ao_cnt    = (info.flags >> 14) & 31u;
        uint32_t ref1_mode = (info.flags >> 19) & 3u;

        uint32_t cam_key = rp.seed + uint32_t(pixel) * 0x9e3779b9u + uint32_t(sid) * 0x85ebca6bu;
        float cx = __fdividef(float(px) + sample_f(cam_key), float(rp.width)) * 2.0f - 1.0f;
        float cy = 1.0f - __fdividef(float(py) + sample_f(cam_key ^ 0xa511e9b3u), float(rp.height)) * 2.0f;
        float3 rd = normalize3(make_float3(
            rp.w.x + rp.u.x * cx + rp.v.x * cy,
            rp.w.y + rp.u.y * cx + rp.v.y * cy,
            rp.w.z + rp.u.z * cx + rp.v.z * cy));

        float4 gf0 = __ldg(&rp.b8_tris[hit_slot].f0);
        float4 gf1 = __ldg(&rp.b8_tris[hit_slot].f1);
        float3 n = make_float3(gf0.w, gf1.x, gf1.y);
        float denom = dot3(n, rd);
        float hit_t = __fdividef(-((rp.eye.x - gf0.x) * n.x + (rp.eye.y - gf0.y) * n.y + (rp.eye.z - gf0.z) * n.z), denom);
        float ndotd = denom;
        if (ndotd > 0.0f) { n = make_float3(-n.x, -n.y, -n.z); ndotd = -ndotd; }

        int orig_id = __ldg(&rp.b8_tri_ids[hit_slot]);
        float4 sh = __ldg(&rp.tri_shade[orig_id]);
        float mirror = sh.w;

        float3 p = make_float3(
            fmaf(rd.x, hit_t, rp.eye.x) + n.x * 0.001f,
            fmaf(rd.y, hit_t, rp.eye.y) + n.y * 0.001f,
            fmaf(rd.z, hit_t, rp.eye.z) + n.z * 0.001f);

        if (mirror < 1.0f) {
            float cosine = fmaxf(0.0f, dot3(n, rp.light));
            float visible = (sh_mode == SH_LIT) ? 1.0f : 0.0f;
            if (sh_mode == SH_LIST) {
                bool blocked = false;
                for (uint32_t k = 0; k < sh_cnt; ++k) {
                    int bslot = __ldg(&cand_pool[info.shadow_off + k]);
                    float bt;
                    if (intersect_tri_geom(rp.b8_tris[bslot], p, rp.light, 1e6f, bt)) { blocked = true; break; }
                }
                visible = blocked ? 0.0f : 1.0f;
            }

            float ambient = 1.0f;
            if (rp.ao > 0 && ao_mode == AO_LIST) {
                float3 tx;
                if (fabsf(n.z) < 0.8f) {
                    float inv = rsqrtf(n.x * n.x + n.y * n.y);
                    tx = make_float3(-n.y * inv, n.x * inv, 0.0f);
                } else {
                    float inv = rsqrtf(n.x * n.x + n.z * n.z);
                    tx = make_float3(n.z * inv, 0.0f, -n.x * inv);
                }
                float3 ty = cross3(n, tx);

                int open = 0;
                for (int a = 0; a < rp.ao; ++a) {
                    uint32_t key = cam_key + uint32_t(a) * 0x27d4eb2du;
                    float ax = 2.0f * sample_f(key ^ 0x68bc21ebu) - 1.0f;
                    float ay = 2.0f * sample_f(key ^ 0x02e5be93u) - 1.0f;
                    float az = 0.25f + 0.75f * sample_f(key ^ 0x967a889bu);
                    float3 adir = normalize3(make_float3(
                        tx.x * ax + ty.x * ay + n.x * az,
                        tx.y * ax + ty.y * ay + n.y * az,
                        tx.z * ax + ty.z * ay + n.z * az));
                    bool blocked = false;
                    for (uint32_t k = 0; k < ao_cnt; ++k) {
                        int bslot = __ldg(&cand_pool[info.ao_data + k]);
                        float bt;
                        if (intersect_tri_geom(rp.b8_tris[bslot], p, adir, rp.ao_radius, bt)) { blocked = true; break; }
                    }
                    open += !blocked;
                }
                ambient = float(open) / float(rp.ao);
            }

            float val = (0.08f + 0.20f * ambient + 0.72f * cosine * visible) * (1.0f - mirror);
            res.x = val * sh.x; res.y = val * sh.y; res.z = val * sh.z;
        }

        if (mirror > 0.0f && rp.max_depth > 1) {
            if (ref1_mode == REF1_SKY) {
                float k2 = 2.0f * ndotd;
                float3 rdir = normalize3(make_float3(rd.x - n.x * k2, rd.y - n.y * k2, rd.z - n.z * k2));
                float3 sk = sky_color(rdir);
                res.x += mirror * sk.x; res.y += mirror * sk.y; res.z += mirror * sk.z;
            } else if (ref1_mode == REF1_CONST) {
                res.x += info.ref1_rgb.x; res.y += info.ref1_rgb.y; res.z += info.ref1_rgb.z;
            }
        }
    }

    warp_accumulate_rgb(pixel, res, 1.0f / float(rp.spp), out_rgb);
}

// ---------- Bucket 1B: Ultra-Fast Direction-Sorted AO-Only Single-Triangle Kernel! ----------
// Every block of 128 threads processes 128 AO rays from consecutive (q_sao, sid, a),
// sorts all 128 AO rays into 16 directional cones in shared memory, traces ONLY any-hit BVH8
// in coherent lockstep warps (ZERO closest-hit/reflection bloat!), and accumulates directly!

static constexpr int AO_BLOCK = 128;

__global__ __launch_bounds__(AO_BLOCK, 8)
void k_shade_sao_sorted(
    RenderParams rp,
    const int* __restrict__ q_sao,
    const PixelInfo* __restrict__ pix_info,
    const int* __restrict__ cand_pool,
    long long offset, long long end,
    float* __restrict__ out_rgb)
{
    __shared__ uint2    s_stack[SMEM_STACK * AO_BLOCK];
    __shared__ float3   s_p[AO_BLOCK];
    __shared__ float3   s_dir[AO_BLOCK];
    __shared__ uint32_t s_root[AO_BLOCK];
    __shared__ int      s_src_tid[AO_BLOCK];
    __shared__ int      s_bin_cnt[16];
    __shared__ int      s_bin_off[16];
    __shared__ int      s_open_res[AO_BLOCK];

    const int tid = threadIdx.x;
    if (tid < 16) s_bin_cnt[tid] = 0;
    s_open_res[tid] = 0;
    __syncthreads();

    long long idx = offset + (long long)blockIdx.x * AO_BLOCK + tid;
    long long rays_per_pix = (long long)rp.spp * rp.ao;
    int pixel = -1;
    int a_idx = 0;
    float3 base_rgb = make_float3(0.0f, 0.0f, 0.0f);
    float3 ao_weight = make_float3(0.0f, 0.0f, 0.0f);

    float3 my_p = make_float3(0.0f, 0.0f, 0.0f);
    float3 my_dir = make_float3(0.0f, 1.0f, 0.0f);
    uint32_t my_root = 0u;
    int my_bin = 15;
    int my_slot = -1;

    if (idx < end) {
        int q_i = (int)(idx / rays_per_pix);
        int rem = (int)(idx - (long long)q_i * rays_per_pix);
        int sid = rem / rp.ao;
        a_idx   = rem - sid * rp.ao;

        pixel = __ldg(&q_sao[q_i]);
        int py = pixel / rp.width;
        int px = pixel - py * rp.width;

        PixelInfo info = pix_info[pixel];
        int hit_slot = (int)info.prim_data;
        my_root = info.ao_data;
        uint32_t sh_mode   = (info.flags >> 6) & 3u;
        uint32_t sh_cnt    = (info.flags >> 8) & 15u;
        uint32_t ref1_mode = (info.flags >> 19) & 3u;

        uint32_t cam_key = rp.seed + uint32_t(pixel) * 0x9e3779b9u + uint32_t(sid) * 0x85ebca6bu;
        float cx = __fdividef(float(px) + sample_f(cam_key), float(rp.width)) * 2.0f - 1.0f;
        float cy = 1.0f - __fdividef(float(py) + sample_f(cam_key ^ 0xa511e9b3u), float(rp.height)) * 2.0f;
        float3 rd = normalize3(make_float3(
            rp.w.x + rp.u.x * cx + rp.v.x * cy,
            rp.w.y + rp.u.y * cx + rp.v.y * cy,
            rp.w.z + rp.u.z * cx + rp.v.z * cy));

        float4 gf0 = __ldg(&rp.b8_tris[hit_slot].f0);
        float4 gf1 = __ldg(&rp.b8_tris[hit_slot].f1);
        float3 n = make_float3(gf0.w, gf1.x, gf1.y);
        float denom = dot3(n, rd);
        float hit_t = __fdividef(-((rp.eye.x - gf0.x) * n.x + (rp.eye.y - gf0.y) * n.y + (rp.eye.z - gf0.z) * n.z), denom);
        float ndotd = denom;
        if (ndotd > 0.0f) { n = make_float3(-n.x, -n.y, -n.z); ndotd = -ndotd; }

        int orig_id = __ldg(&rp.b8_tri_ids[hit_slot]);
        float4 sh = __ldg(&rp.tri_shade[orig_id]);
        float mirror = sh.w;

        my_p = make_float3(
            fmaf(rd.x, hit_t, rp.eye.x) + n.x * 0.001f,
            fmaf(rd.y, hit_t, rp.eye.y) + n.y * 0.001f,
            fmaf(rd.z, hit_t, rp.eye.z) + n.z * 0.001f);

        // Compute AO direction
        float3 tx;
        if (fabsf(n.z) < 0.8f) {
            float inv = rsqrtf(n.x * n.x + n.y * n.y);
            tx = make_float3(-n.y * inv, n.x * inv, 0.0f);
        } else {
            float inv = rsqrtf(n.x * n.x + n.z * n.z);
            tx = make_float3(n.z * inv, 0.0f, -n.x * inv);
        }
        float3 ty = cross3(n, tx);
        uint32_t key = cam_key + uint32_t(a_idx) * 0x27d4eb2du;
        float ax = 2.0f * sample_f(key ^ 0x68bc21ebu) - 1.0f;
        float ay = 2.0f * sample_f(key ^ 0x02e5be93u) - 1.0f;
        float az = 0.25f + 0.75f * sample_f(key ^ 0x967a889bu);
        my_dir = normalize3(make_float3(
            tx.x * ax + ty.x * ay + n.x * az,
            tx.y * ax + ty.y * ay + n.y * az,
            tx.z * ax + ty.z * ay + n.z * az));

        // 16 directional cones in world space (octant + dominant axis!)
        my_bin = (my_dir.x < 0.0f ? 1 : 0) | (my_dir.y < 0.0f ? 2 : 0) | (my_dir.z < 0.0f ? 4 : 0)
               | ((fabsf(my_dir.x) > fabsf(my_dir.z)) ? 8 : 0);
        my_slot = atomicAdd(&s_bin_cnt[my_bin], 1);

        // Non-AO part only added once per sample (when a_idx == 0)
        float inv_ao = 1.0f / float(rp.ao);
        float w_ao = 0.20f * (1.0f - mirror) * inv_ao;
        ao_weight = make_float3(w_ao * sh.x, w_ao * sh.y, w_ao * sh.z);

        if (a_idx == 0) {
            float cosine = fmaxf(0.0f, dot3(n, rp.light));
            float visible = (sh_mode == SH_LIT) ? 1.0f : 0.0f;
            if (sh_mode == SH_LIST) {
                bool blocked = false;
                for (uint32_t k = 0; k < sh_cnt; ++k) {
                    int bslot = __ldg(&cand_pool[info.shadow_off + k]);
                    float bt;
                    if (intersect_tri_geom(rp.b8_tris[bslot], my_p, rp.light, 1e6f, bt)) { blocked = true; break; }
                }
                visible = blocked ? 0.0f : 1.0f;
            }
            float val_base = (0.08f + 0.72f * cosine * visible) * (1.0f - mirror);
            base_rgb = make_float3(val_base * sh.x, val_base * sh.y, val_base * sh.z);
            if (mirror > 0.0f && rp.max_depth > 1) {
                if (ref1_mode == REF1_SKY) {
                    float k2 = 2.0f * ndotd;
                    float3 rdir = normalize3(make_float3(rd.x - n.x * k2, rd.y - n.y * k2, rd.z - n.z * k2));
                    float3 sk = sky_color(rdir);
                    base_rgb.x += mirror * sk.x; base_rgb.y += mirror * sk.y; base_rgb.z += mirror * sk.z;
                } else if (ref1_mode == REF1_CONST) {
                    base_rgb.x += info.ref1_rgb.x; base_rgb.y += info.ref1_rgb.y; base_rgb.z += info.ref1_rgb.z;
                }
            }
        }
    }
    __syncthreads();

    // Prefix sum 16 bins
    if (tid == 0) {
        int sum = 0;
        for (int b = 0; b < 16; ++b) {
            s_bin_off[b] = sum;
            sum += s_bin_cnt[b];
        }
    }
    __syncthreads();

    int total_active = s_bin_off[15] + s_bin_cnt[15];
    if (my_slot >= 0) {
        int dst = s_bin_off[my_bin] + my_slot;
        s_p[dst] = my_p;
        s_dir[dst] = my_dir;
        s_root[dst] = my_root;
        s_src_tid[dst] = tid;
    }
    __syncthreads();

    // Now EVERY warp traces 32 AO rays sorted by world direction cone, starting right at their LCA `s_root`!
    if (tid < total_active) {
        int open = traverse_bvh8_any<AO_BLOCK>(rp.b8_nodes, rp.b8_tris, s_stack, s_p[tid], s_dir[tid], rp.ao_radius, s_root[tid]) ? 0 : 1;
        s_open_res[s_src_tid[tid]] = open;
    }
    __syncthreads();

    float3 res = make_float3(0.0f, 0.0f, 0.0f);
    if (pixel >= 0) {
        float op = (float)s_open_res[tid];
        res.x = base_rgb.x + op * ao_weight.x;
        res.y = base_rgb.y + op * ao_weight.y;
        res.z = base_rgb.z + op * ao_weight.z;
    }

    warp_accumulate_rgb(pixel, res, 1.0f / float(rp.spp), out_rgb);
}

// ---------- Bucket 1C: Single-Triangle + Reflection/Shadow BVH8 Kernel ----------

static constexpr int TRACE_BLOCK = 128;

__global__ __launch_bounds__(TRACE_BLOCK, 6)
void k_shade_strace(
    RenderParams rp,
    const int* __restrict__ q_strace,
    const PixelInfo* __restrict__ pix_info,
    const int* __restrict__ cand_pool,
    int offset, int end,
    float* __restrict__ out_rgb)
{
    __shared__ uint2 s_stack[SMEM_STACK * TRACE_BLOCK];

    int idx = offset + blockIdx.x * blockDim.x + threadIdx.x;
    int pixel = -1;
    float3 res = make_float3(0.0f, 0.0f, 0.0f);

    if (idx < end) {
        int q_i = idx / rp.spp;
        int sid = idx - q_i * rp.spp;
        pixel = __ldg(&q_strace[q_i]);
        int py = pixel / rp.width;
        int px = pixel - py * rp.width;

        PixelInfo info = pix_info[pixel];
        int hit_slot = (int)info.prim_data;
        uint32_t sh_mode   = (info.flags >> 6) & 3u;
        uint32_t sh_cnt    = (info.flags >> 8) & 15u;
        uint32_t ao_mode   = (info.flags >> 12) & 3u;
        uint32_t ao_cnt    = (info.flags >> 14) & 31u;
        uint32_t ref1_mode = (info.flags >> 19) & 3u;

        uint32_t cam_key = rp.seed + uint32_t(pixel) * 0x9e3779b9u + uint32_t(sid) * 0x85ebca6bu;
        float cx = __fdividef(float(px) + sample_f(cam_key), float(rp.width)) * 2.0f - 1.0f;
        float cy = 1.0f - __fdividef(float(py) + sample_f(cam_key ^ 0xa511e9b3u), float(rp.height)) * 2.0f;
        float3 rd = normalize3(make_float3(
            rp.w.x + rp.u.x * cx + rp.v.x * cy,
            rp.w.y + rp.u.y * cx + rp.v.y * cy,
            rp.w.z + rp.u.z * cx + rp.v.z * cy));

        float4 gf0 = __ldg(&rp.b8_tris[hit_slot].f0);
        float4 gf1 = __ldg(&rp.b8_tris[hit_slot].f1);
        float3 n = make_float3(gf0.w, gf1.x, gf1.y);
        float denom = dot3(n, rd);
        float hit_t = __fdividef(-((rp.eye.x - gf0.x) * n.x + (rp.eye.y - gf0.y) * n.y + (rp.eye.z - gf0.z) * n.z), denom);
        float ndotd = denom;
        if (ndotd > 0.0f) { n = make_float3(-n.x, -n.y, -n.z); ndotd = -ndotd; }

        int orig_id = __ldg(&rp.b8_tri_ids[hit_slot]);
        float4 sh = __ldg(&rp.tri_shade[orig_id]);
        float mirror = sh.w;

        float3 p = make_float3(
            fmaf(rd.x, hit_t, rp.eye.x) + n.x * 0.001f,
            fmaf(rd.y, hit_t, rp.eye.y) + n.y * 0.001f,
            fmaf(rd.z, hit_t, rp.eye.z) + n.z * 0.001f);

        if (mirror < 1.0f) {
            float cosine = fmaxf(0.0f, dot3(n, rp.light));
            float visible = 0.0f;
            if (sh_mode == SH_LIT) {
                visible = 1.0f;
            } else if (sh_mode == SH_LIST) {
                bool blocked = false;
                for (uint32_t k = 0; k < sh_cnt; ++k) {
                    int bslot = __ldg(&cand_pool[info.shadow_off + k]);
                    float bt;
                    if (intersect_tri_geom(rp.b8_tris[bslot], p, rp.light, 1e6f, bt)) { blocked = true; break; }
                }
                visible = blocked ? 0.0f : 1.0f;
            } else if (sh_mode == SH_FALLBACK) {
                visible = traverse_bvh8_any<TRACE_BLOCK>(rp.b8_nodes, rp.b8_tris, s_stack, p, rp.light, 1e6f) ? 0.0f : 1.0f;
            }

            float ambient = 1.0f;
            if (rp.ao > 0 && ao_mode != AO_OPEN) {
                float3 tx;
                if (fabsf(n.z) < 0.8f) {
                    float inv = rsqrtf(n.x * n.x + n.y * n.y);
                    tx = make_float3(-n.y * inv, n.x * inv, 0.0f);
                } else {
                    float inv = rsqrtf(n.x * n.x + n.z * n.z);
                    tx = make_float3(n.z * inv, 0.0f, -n.x * inv);
                }
                float3 ty = cross3(n, tx);

                int open = 0;
                if (ao_mode == AO_LIST) {
                    for (int a = 0; a < rp.ao; ++a) {
                        uint32_t key = cam_key + uint32_t(a) * 0x27d4eb2du;
                        float ax = 2.0f * sample_f(key ^ 0x68bc21ebu) - 1.0f;
                        float ay = 2.0f * sample_f(key ^ 0x02e5be93u) - 1.0f;
                        float az = 0.25f + 0.75f * sample_f(key ^ 0x967a889bu);
                        float3 adir = normalize3(make_float3(
                            tx.x * ax + ty.x * ay + n.x * az,
                            tx.y * ax + ty.y * ay + n.y * az,
                            tx.z * ax + ty.z * ay + n.z * az));
                        bool blocked = false;
                        for (uint32_t k = 0; k < ao_cnt; ++k) {
                            int bslot = __ldg(&cand_pool[info.ao_data + k]);
                            float bt;
                            if (intersect_tri_geom(rp.b8_tris[bslot], p, adir, rp.ao_radius, bt)) { blocked = true; break; }
                        }
                        open += !blocked;
                    }
                } else {
                    for (int a = 0; a < rp.ao; ++a) {
                        uint32_t key = cam_key + uint32_t(a) * 0x27d4eb2du;
                        float ax = 2.0f * sample_f(key ^ 0x68bc21ebu) - 1.0f;
                        float ay = 2.0f * sample_f(key ^ 0x02e5be93u) - 1.0f;
                        float az = 0.25f + 0.75f * sample_f(key ^ 0x967a889bu);
                        float3 adir = normalize3(make_float3(
                            tx.x * ax + ty.x * ay + n.x * az,
                            tx.y * ax + ty.y * ay + n.y * az,
                            tx.z * ax + ty.z * ay + n.z * az));
                        open += !traverse_bvh8_any<TRACE_BLOCK>(rp.b8_nodes, rp.b8_tris, s_stack, p, adir, rp.ao_radius, info.ao_data);
                    }
                }
                ambient = __fdividef(float(open), float(rp.ao));
            }

            float val = (0.08f + 0.20f * ambient + 0.72f * cosine * visible) * (1.0f - mirror);
            res.x = val * sh.x; res.y = val * sh.y; res.z = val * sh.z;
        }

        if (mirror > 0.0f && rp.max_depth > 1) {
            if (ref1_mode == REF1_SKY) {
                float k2 = 2.0f * ndotd;
                float3 rdir = normalize3(make_float3(rd.x - n.x * k2, rd.y - n.y * k2, rd.z - n.z * k2));
                float3 sk = sky_color(rdir);
                res.x += mirror * sk.x; res.y += mirror * sk.y; res.z += mirror * sk.z;
            } else if (ref1_mode == REF1_CONST) {
                res.x += info.ref1_rgb.x; res.y += info.ref1_rgb.y; res.z += info.ref1_rgb.z;
            } else {
                float k2 = 2.0f * ndotd;
                float3 rdir = normalize3(make_float3(rd.x - n.x * k2, rd.y - n.y * k2, rd.z - n.z * k2));
                trace_bounces<TRACE_BLOCK>(rp, s_stack, cam_key, p, rdir, mirror, 1, res);
            }
        }
    }

    warp_accumulate_rgb(pixel, res, 1.0f / float(rp.spp), out_rgb);
}

// ---------- Bucket 2: Primary Candidate-List Kernel ----------

__global__ __launch_bounds__(TRACE_BLOCK, 6)
void k_shade_plist(
    RenderParams rp,
    const int* __restrict__ q_plist,
    const PixelInfo* __restrict__ pix_info,
    const int* __restrict__ cand_pool,
    int offset, int end,
    float* __restrict__ out_rgb)
{
    __shared__ uint2 s_stack[SMEM_STACK * TRACE_BLOCK];

    int idx = offset + blockIdx.x * blockDim.x + threadIdx.x;
    int pixel = -1;
    float3 res = make_float3(0.0f, 0.0f, 0.0f);

    if (idx < end) {
        int q_i = idx / rp.spp;
        int sid = idx - q_i * rp.spp;
        pixel = __ldg(&q_plist[q_i]);
        int py = pixel / rp.width;
        int px = pixel - py * rp.width;

        PixelInfo info = pix_info[pixel];
        uint32_t p_off = info.prim_data;
        uint32_t p_cnt = (info.flags >> 2) & 15u;

        uint32_t cam_key = rp.seed + uint32_t(pixel) * 0x9e3779b9u + uint32_t(sid) * 0x85ebca6bu;
        float cx = __fdividef(float(px) + sample_f(cam_key), float(rp.width)) * 2.0f - 1.0f;
        float cy = 1.0f - __fdividef(float(py) + sample_f(cam_key ^ 0xa511e9b3u), float(rp.height)) * 2.0f;
        float3 rd = normalize3(make_float3(
            rp.w.x + rp.u.x * cx + rp.v.x * cy,
            rp.w.y + rp.u.y * cx + rp.v.y * cy,
            rp.w.z + rp.u.z * cx + rp.v.z * cy));

        float hit_t = 1e20f;
        int hit_slot = -1;
        for (uint32_t k = 0; k < p_cnt; ++k) {
            int cslot = __ldg(&cand_pool[p_off + k]);
            float ct;
            if (intersect_tri_geom(rp.b8_tris[cslot], rp.eye, rd, hit_t, ct)) {
                hit_t = ct; hit_slot = cslot;
            }
        }

        if (hit_slot < 0) {
            res = sky_color(rd);
        } else {
            float4 gf0 = __ldg(&rp.b8_tris[hit_slot].f0);
            float4 gf1 = __ldg(&rp.b8_tris[hit_slot].f1);
            float3 n = make_float3(gf0.w, gf1.x, gf1.y);
            float ndotd = dot3(n, rd);
            if (ndotd > 0.0f) { n = make_float3(-n.x, -n.y, -n.z); ndotd = -ndotd; }

            int orig_id = __ldg(&rp.b8_tri_ids[hit_slot]);
            float4 sh = __ldg(&rp.tri_shade[orig_id]);
            float mirror = sh.w;

            float3 p = make_float3(
                fmaf(rd.x, hit_t, rp.eye.x) + n.x * 0.001f,
                fmaf(rd.y, hit_t, rp.eye.y) + n.y * 0.001f,
                fmaf(rd.z, hit_t, rp.eye.z) + n.z * 0.001f);

            if (mirror < 1.0f) {
                float cosine = dot3(n, rp.light);
                float visible = 0.0f;
                if (cosine > 0.0f) {
                    visible = traverse_bvh8_any<TRACE_BLOCK>(rp.b8_nodes, rp.b8_tris, s_stack, p, rp.light, 1e6f) ? 0.0f : 1.0f;
                } else {
                    cosine = 0.0f;
                }

                float ambient = 1.0f;
                if (rp.ao > 0) {
                    float3 tx;
                    if (fabsf(n.z) < 0.8f) {
                        float inv = rsqrtf(n.x * n.x + n.y * n.y);
                        tx = make_float3(-n.y * inv, n.x * inv, 0.0f);
                    } else {
                        float inv = rsqrtf(n.x * n.x + n.z * n.z);
                        tx = make_float3(n.z * inv, 0.0f, -n.x * inv);
                    }
                    float3 ty = cross3(n, tx);

                    int open = 0;
                    for (int a = 0; a < rp.ao; ++a) {
                        uint32_t key = cam_key + uint32_t(a) * 0x27d4eb2du;
                        float ax = 2.0f * sample_f(key ^ 0x68bc21ebu) - 1.0f;
                        float ay = 2.0f * sample_f(key ^ 0x02e5be93u) - 1.0f;
                        float az = 0.25f + 0.75f * sample_f(key ^ 0x967a889bu);
                        float3 adir = normalize3(make_float3(
                            tx.x * ax + ty.x * ay + n.x * az,
                            tx.y * ax + ty.y * ay + n.y * az,
                            tx.z * ax + ty.z * ay + n.z * az));
                        open += !traverse_bvh8_any<TRACE_BLOCK>(rp.b8_nodes, rp.b8_tris, s_stack, p, adir, rp.ao_radius);
                    }
                    ambient = float(open) / float(rp.ao);
                }

                float val = (0.08f + 0.20f * ambient + 0.72f * cosine * visible) * (1.0f - mirror);
                res.x = val * sh.x; res.y = val * sh.y; res.z = val * sh.z;
            }

            if (mirror > 0.0f && rp.max_depth > 1) {
                float k2 = 2.0f * ndotd;
                float3 rdir = normalize3(make_float3(rd.x - n.x * k2, rd.y - n.y * k2, rd.z - n.z * k2));
                trace_bounces<TRACE_BLOCK>(rp, s_stack, cam_key, p, rdir, mirror, 1, res);
            }
        }
    }

    warp_accumulate_rgb(pixel, res, 1.0f / float(rp.spp), out_rgb);
}

// ---------- Bucket 3 & Low-SPP Direct Fallback Kernel ----------

__global__ __launch_bounds__(TRACE_BLOCK, 6)
void k_trace_fallback(
    RenderParams rp,
    const int* __restrict__ q_fallback,
    int tile_w, int offset, int end,
    float* __restrict__ out_rgb)
{
    __shared__ uint2 s_stack[SMEM_STACK * TRACE_BLOCK];

    int idx = offset + blockIdx.x * blockDim.x + threadIdx.x;
    int pixel = -1;
    float3 res = make_float3(0.0f, 0.0f, 0.0f);

    if (idx < end) {
        int pix_seq = idx / rp.spp;
        int sid = idx - pix_seq * rp.spp;
        int px, py;
        if (q_fallback) {
            pixel = __ldg(&q_fallback[pix_seq]);
            py = pixel / rp.width;
            px = pixel - py * rp.width;
        } else {
            int tile_idx = pix_seq >> 5;
            int in_tile = pix_seq & 31;
            int ty_tile = tile_idx / tile_w;
            int tx_tile = tile_idx - ty_tile * tile_w;
            px = (tx_tile << 3) + (in_tile & 7);
            py = (ty_tile << 2) + (in_tile >> 3);
            if (px < rp.width && py < rp.height) pixel = py * rp.width + px;
        }

        if (pixel >= 0) {
            uint32_t cam_key = rp.seed + uint32_t(pixel) * 0x9e3779b9u + uint32_t(sid) * 0x85ebca6bu;
            float cx = (float(px) + sample_f(cam_key)) / float(rp.width) * 2.0f - 1.0f;
            float cy = 1.0f - (float(py) + sample_f(cam_key ^ 0xa511e9b3u)) / float(rp.height) * 2.0f;
            float3 rd = normalize3(make_float3(
                rp.w.x + rp.u.x * cx + rp.v.x * cy,
                rp.w.y + rp.u.y * cx + rp.v.y * cy,
                rp.w.z + rp.u.z * cx + rp.v.z * cy));

            trace_bounces<TRACE_BLOCK>(rp, s_stack, cam_key, rp.eye, rd, 1.0f, 0, res);
        }
    }

    warp_accumulate_rgb(pixel, res, 1.0f / float(rp.spp), out_rgb);
}

} // anonymous namespace

void init(int max_triangles, int max_pixels, int max_samples) {
    (void)max_samples;
    W.cap_tris = std::max(max_triangles, 16);
    W.cap_refs = W.cap_tris + std::min(W.cap_tris / 2 + 4096, 200000);
    W.cap_pixels = std::max(max_pixels, 16);
    W.cap_pool = std::max(W.cap_pixels * 12, 65536);
    W.cap_blocks = (W.cap_refs + PLOC_BLOCK - 1) / PLOC_BLOCK + 16;

    ck(cudaStreamCreate(&W.stream));
    ck(cudaHostAlloc(&W.h_tris_pinned, size_t(W.cap_tris) * sizeof(Triangle), cudaHostAllocDefault));
    ck(cudaHostAlloc(&W.h_ctrl_pinned, 16 * sizeof(int), cudaHostAllocDefault));

    ck(cudaMalloc(&W.d_tris, size_t(W.cap_tris) * sizeof(Triangle)));
    ck(cudaMalloc(&W.d_tri_geom_raw, size_t(W.cap_tris) * sizeof(TriGeom)));
    ck(cudaMalloc(&W.d_tri_shade, size_t(W.cap_tris) * sizeof(float4)));
    ck(cudaMalloc(&W.d_scene_bbox, 6 * sizeof(float)));

    ck(cudaMalloc(&W.d_ref_lo, size_t(W.cap_refs) * sizeof(float4)));
    ck(cudaMalloc(&W.d_ref_hi, size_t(W.cap_refs) * sizeof(float4)));
    ck(cudaMalloc(&W.d_ref_cnt, sizeof(int)));

    ck(cudaMalloc(&W.d_morton_in, size_t(W.cap_refs) * sizeof(uint64_t)));
    ck(cudaMalloc(&W.d_morton_out, size_t(W.cap_refs) * sizeof(uint64_t)));
    ck(cudaMalloc(&W.d_idx_in, size_t(W.cap_refs) * sizeof(int)));
    ck(cudaMalloc(&W.d_idx_out, size_t(W.cap_refs) * sizeof(int)));

    W.cub_temp_bytes = 0;
    ck(cub::DeviceRadixSort::SortPairs(
        nullptr, W.cub_temp_bytes,
        W.d_morton_in, W.d_morton_out, W.d_idx_in, W.d_idx_out, W.cap_refs, 0, 63, W.stream));
    ck(cudaMalloc(&W.d_cub_temp, std::max(W.cub_temp_bytes, size_t(1024))));

    size_t max_bvh2 = 2 * size_t(W.cap_refs) + 4;
    ck(cudaMalloc(&W.d_bvh2_lo, max_bvh2 * sizeof(float4)));
    ck(cudaMalloc(&W.d_bvh2_hi, max_bvh2 * sizeof(float4)));
    ck(cudaMalloc(&W.d_bvh2_parent, max_bvh2 * sizeof(int)));
    ck(cudaMalloc(&W.d_bvh2_tri_cnt, max_bvh2 * sizeof(int)));
    ck(cudaMalloc(&W.d_bvh2_visited, max_bvh2 * sizeof(int)));

    ck(cudaMalloc(&W.d_clusters_a, size_t(W.cap_refs) * sizeof(int)));
    ck(cudaMalloc(&W.d_clusters_b, size_t(W.cap_refs) * sizeof(int)));
    ck(cudaMalloc(&W.d_nearest, size_t(W.cap_refs) * sizeof(int)));
    ck(cudaMalloc(&W.d_flags, size_t(W.cap_refs) * sizeof(int)));
    ck(cudaMalloc(&W.d_block_sums, size_t(W.cap_blocks) * sizeof(int)));
    ck(cudaMalloc(&W.d_ploc_state, 8 * sizeof(int)));

    ck(cudaMalloc(&W.d_dp_cost, max_bvh2 * 7 * sizeof(float)));
    ck(cudaMalloc(&W.d_dp_dec, max_bvh2 * 8 * sizeof(uint8_t)));
    ck(cudaMalloc(&W.d_bfs_q_a, size_t(W.cap_refs) * sizeof(int2)));
    ck(cudaMalloc(&W.d_bfs_q_b, size_t(W.cap_refs) * sizeof(int2)));
    ck(cudaMalloc(&W.d_b8_counters, 8 * sizeof(int)));

    ck(cudaMalloc(&W.d_b8_nodes, size_t(W.cap_refs) * sizeof(BVH8Node)));
    ck(cudaMalloc(&W.d_b8_tris, size_t(W.cap_refs) * sizeof(TriGeom)));
    ck(cudaMalloc(&W.d_b8_tri_ids, size_t(W.cap_refs) * sizeof(int)));

    ck(cudaMalloc(&W.d_pix_info, size_t(W.cap_pixels) * sizeof(PixelInfo)));
    ck(cudaMalloc(&W.d_cand_pool, size_t(W.cap_pool) * sizeof(int)));
    ck(cudaMalloc(&W.d_q_sfast, size_t(W.cap_pixels) * sizeof(int)));
    ck(cudaMalloc(&W.d_q_sao, size_t(W.cap_pixels) * sizeof(int)));
    ck(cudaMalloc(&W.d_q_strace, size_t(W.cap_pixels) * sizeof(int)));
    ck(cudaMalloc(&W.d_q_plist, size_t(W.cap_pixels) * sizeof(int)));
    ck(cudaMalloc(&W.d_q_fallback, size_t(W.cap_pixels) * sizeof(int)));
    ck(cudaMalloc(&W.d_pix_counters, 8 * sizeof(int)));
}

void render(const Scene& s, float* device_rgb) {
    cudaStream_t st = W.stream;
    int N = s.triangle_count;

    const int chunks = (N >= 16384) ? 4 : 1;
    int chunk_tris = (N + chunks - 1) / chunks;
    for (int c = 0; c < chunks; ++c) {
        int b = c * chunk_tris;
        int e = std::min(N, b + chunk_tris);
        if (b >= e) break;
        size_t bytes = size_t(e - b) * sizeof(Triangle);
        memcpy(W.h_tris_pinned + b, s.triangles + b, bytes);
        ck(cudaMemcpyAsync(W.d_tris + b, W.h_tris_pinned + b, bytes, cudaMemcpyHostToDevice, st));
    }

    ck(cudaMemsetAsync(device_rgb, 0, size_t(s.width) * s.height * 3 * sizeof(float), st));
    float init_bbox[6] = {1e30f, 1e30f, 1e30f, -1e30f, -1e30f, -1e30f};
    ck(cudaMemcpyAsync(W.d_scene_bbox, init_bbox, 6 * sizeof(float), cudaMemcpyHostToDevice, st));
    W.h_ctrl_pinned[0] = N;
    ck(cudaMemcpyAsync(W.d_ref_cnt, &W.h_ctrl_pinned[0], sizeof(int), cudaMemcpyHostToDevice, st));

    k_precompute_tris<<<(N + 255) / 256, 256, 0, st>>>(W.d_tris, N, W.d_tri_geom_raw, W.d_tri_shade, W.d_scene_bbox);

    k_early_split_and_morton<<<(N + 255) / 256, 256, 0, st>>>(
        W.d_tris, N, W.cap_refs, W.d_scene_bbox, W.d_ref_lo, W.d_ref_hi, W.d_morton_in, W.d_idx_in, W.d_ref_cnt);

    ck(cudaMemcpyAsync(&W.h_ctrl_pinned[0], W.d_ref_cnt, sizeof(int), cudaMemcpyDeviceToHost, st));
    ck(cudaStreamSynchronize(st));
    int M = std::min(W.h_ctrl_pinned[0], W.cap_refs);

    if (M > 1) {
        size_t tmp_bytes = W.cub_temp_bytes;
        ck(cub::DeviceRadixSort::SortPairs(
            W.d_cub_temp, tmp_bytes,
            W.d_morton_in, W.d_morton_out, W.d_idx_in, W.d_idx_out, M, 0, 63, st));
    } else {
        ck(cudaMemcpyAsync(W.d_idx_out, W.d_idx_in, sizeof(int), cudaMemcpyDeviceToDevice, st));
    }

    k_init_bvh2_leaves<<<(M + 255) / 256, 256, 0, st>>>(
        W.d_idx_out, W.d_ref_lo, W.d_ref_hi, M,
        W.d_bvh2_lo, W.d_bvh2_hi, W.d_bvh2_parent, W.d_bvh2_tri_cnt, W.d_clusters_a);

    int ploc_init[5] = {M, M, 0, M, 0};
    ck(cudaMemcpyAsync(W.d_ploc_state, ploc_init, 5 * sizeof(int), cudaMemcpyHostToDevice, st));
    ck(cudaMemsetAsync(W.d_bvh2_visited, 0, size_t(2 * M) * sizeof(int), st));

    int cur_M_est = M;
    while (cur_M_est > 1024) {
        int batch = 1, est = cur_M_est;
        while (est > 1024 && batch < 28) { est = (int)(est * 0.72f); ++batch; }
        int grid = (cur_M_est + PLOC_BLOCK - 1) / PLOC_BLOCK;
        for (int it = 0; it < batch; ++it) {
            k_ploc_nearest<<<grid, PLOC_BLOCK, 0, st>>>(W.d_clusters_a, W.d_clusters_b, W.d_bvh2_lo, W.d_bvh2_hi, W.d_ploc_state, W.d_nearest);
            k_ploc_merge_and_count<<<grid, PLOC_BLOCK, 0, st>>>(
                W.d_clusters_a, W.d_clusters_b, W.d_nearest, W.d_bvh2_lo, W.d_bvh2_hi, W.d_bvh2_parent, W.d_bvh2_tri_cnt,
                W.d_ploc_state, W.d_flags, W.d_block_sums);
            k_scan_block_sums<<<1, 1024, 0, st>>>(W.d_block_sums, W.d_ploc_state);
            k_ploc_scatter<<<grid, PLOC_BLOCK, 0, st>>>(W.d_flags, W.d_block_sums, W.d_ploc_state, W.d_clusters_a, W.d_clusters_b);
        }
        ck(cudaMemcpyAsync(&W.h_ctrl_pinned[1], W.d_ploc_state, sizeof(int), cudaMemcpyDeviceToHost, st));
        ck(cudaStreamSynchronize(st));
        cur_M_est = W.h_ctrl_pinned[1];
    }

    k_ploc_finish_small<<<1, 1024, 0, st>>>(
        W.d_clusters_a, W.d_clusters_b, W.d_bvh2_lo, W.d_bvh2_hi, W.d_bvh2_parent, W.d_bvh2_tri_cnt, W.d_ploc_state);

    k_bvh8_dp<<<(M + 255) / 256, 256, 0, st>>>(
        M, W.d_bvh2_lo, W.d_bvh2_hi, W.d_bvh2_parent, W.d_bvh2_tri_cnt,
        W.d_bvh2_visited, W.d_dp_cost, W.d_dp_dec);

    k_init_bfs_root<<<1, 1, 0, st>>>(W.d_ploc_state, W.d_bfs_q_a, W.d_b8_counters);
    int2* qa = W.d_bfs_q_a;
    int2* qb = W.d_bfs_q_b;
    int q_cap = 1;
    while (true) {
        int levels = (M <= 1024) ? 6 : 10;
        for (int lv = 0; lv < levels; ++lv) {
            int max_q = std::min(M, q_cap);
            int grid = (max_q + 127) / 128;
            k_bvh8_emit_level<<<grid, 128, 0, st>>>(
                qa, qb, W.d_b8_counters,
                W.d_bvh2_lo, W.d_bvh2_hi, W.d_dp_dec, W.d_tri_geom_raw,
                W.d_b8_nodes, W.d_b8_tris, W.d_b8_tri_ids);
            k_swap_bfs_counters<<<1, 1, 0, st>>>(W.d_b8_counters);
            std::swap(qa, qb);
            q_cap = (q_cap < M / 8 + 1) ? (q_cap * 8) : M;
        }
        ck(cudaMemcpyAsync(&W.h_ctrl_pinned[2], &W.d_b8_counters[2], sizeof(int), cudaMemcpyDeviceToHost, st));
        ck(cudaStreamSynchronize(st));
        if (W.h_ctrl_pinned[2] == 0) break;
    }

    double lx = s.light[0], ly = s.light[1], lz = s.light[2];
    double inv_l = 1.0 / sqrt(lx * lx + ly * ly + lz * lz);

    RenderParams rp;
    rp.width = s.width; rp.height = s.height; rp.spp = s.spp; rp.ao = s.ao; rp.max_depth = s.max_depth; rp.seed = s.seed;
    rp.eye = make_float3(s.eye[0], s.eye[1], s.eye[2]);
    rp.u = make_float3(s.u[0], s.u[1], s.u[2]);
    rp.v = make_float3(s.v[0], s.v[1], s.v[2]);
    rp.w = make_float3(s.w[0], s.w[1], s.w[2]);
    rp.light = make_float3((float)(lx * inv_l), (float)(ly * inv_l), (float)(lz * inv_l));
    rp.ao_radius = s.ao_radius;
    rp.b8_nodes = W.d_b8_nodes;
    rp.b8_tris = W.d_b8_tris;
    rp.b8_tri_ids = W.d_b8_tri_ids;
    rp.tri_shade = W.d_tri_shade;
    rp.raw_tris = W.d_tris;

    int tile_w = (s.width + 7) / 8;
    int tile_h = (s.height + 3) / 4;
    int total_tiled_pixels = tile_w * tile_h * 32;

    int work_per_sample = std::max(1, (1 + s.ao) * s.max_depth);
    long long chunk_samples = std::max(65536LL, 33554432LL / work_per_sample);
    chunk_samples = (chunk_samples + 255) & ~255LL;

    if (s.spp >= 4 && s.width >= 4 && s.height >= 4) {
#ifdef PROFILE_PHASES
        cudaEvent_t e0, e1, e2, e3, e4, e5, e6;
        cudaEventCreate(&e0); cudaEventCreate(&e1); cudaEventCreate(&e2);
        cudaEventCreate(&e3); cudaEventCreate(&e4); cudaEventCreate(&e5); cudaEventCreate(&e6);
        cudaEventRecord(e0, st);
#endif
        ck(cudaMemsetAsync(W.d_pix_counters, 0, 6 * sizeof(int), st));
        k_pixel_classify<<<(total_tiled_pixels + CLASSIFY_BLOCK - 1) / CLASSIFY_BLOCK, CLASSIFY_BLOCK, 0, st>>>(
            rp, tile_w, total_tiled_pixels, W.cap_pool,
            W.d_pix_info, W.d_cand_pool, W.d_q_sfast, W.d_q_sao, W.d_q_strace, W.d_q_plist, W.d_q_fallback,
            W.d_pix_counters, device_rgb);
#ifdef PROFILE_PHASES
        cudaEventRecord(e1, st);
#endif
        ck(cudaMemcpyAsync(&W.h_ctrl_pinned[4], W.d_pix_counters, 6 * sizeof(int), cudaMemcpyDeviceToHost, st));
        ck(cudaStreamSynchronize(st));

        int n_sfast    = W.h_ctrl_pinned[5];
        int n_sao      = W.h_ctrl_pinned[6];
        int n_strace   = W.h_ctrl_pinned[7];
        int n_plist    = W.h_ctrl_pinned[8];
        int n_fallback = W.h_ctrl_pinned[9];

        if (n_sfast > 0) {
            long long total = (long long)n_sfast * s.spp;
            for (long long off = 0; off < total; off += chunk_samples * 2) {
                int end = (int)std::min(total, off + chunk_samples * 2);
                int cnt = end - (int)off;
                k_shade_sfast<<<(cnt + 255) / 256, 256, 0, st>>>(
                    rp, W.d_q_sfast, W.d_pix_info, W.d_cand_pool, (int)off, end, device_rgb);
            }
        }
#ifdef PROFILE_PHASES
        cudaEventRecord(e2, st);
#endif
        if (n_sao > 0) {
            long long total_ao = (long long)n_sao * s.spp * s.ao;
            long long ao_chunk = 33554432LL;
            for (long long off = 0; off < total_ao; off += ao_chunk) {
                long long end = std::min(total_ao, off + ao_chunk);
                int cnt = (int)(end - off);
                k_shade_sao_sorted<<<(cnt + AO_BLOCK - 1) / AO_BLOCK, AO_BLOCK, 0, st>>>(
                    rp, W.d_q_sao, W.d_pix_info, W.d_cand_pool, off, end, device_rgb);
            }
        }
#ifdef PROFILE_PHASES
        cudaEventRecord(e3, st);
#endif
        if (n_strace > 0) {
            long long total = (long long)n_strace * s.spp;
            for (long long off = 0; off < total; off += chunk_samples) {
                int end = (int)std::min(total, off + chunk_samples);
                int cnt = end - (int)off;
                k_shade_strace<<<(cnt + TRACE_BLOCK - 1) / TRACE_BLOCK, TRACE_BLOCK, 0, st>>>(
                    rp, W.d_q_strace, W.d_pix_info, W.d_cand_pool, (int)off, end, device_rgb);
            }
        }
#ifdef PROFILE_PHASES
        cudaEventRecord(e4, st);
#endif
        if (n_plist > 0) {
            long long total = (long long)n_plist * s.spp;
            for (long long off = 0; off < total; off += chunk_samples) {
                int end = (int)std::min(total, off + chunk_samples);
                int cnt = end - (int)off;
                k_shade_plist<<<(cnt + TRACE_BLOCK - 1) / TRACE_BLOCK, TRACE_BLOCK, 0, st>>>(
                    rp, W.d_q_plist, W.d_pix_info, W.d_cand_pool, (int)off, end, device_rgb);
            }
        }
#ifdef PROFILE_PHASES
        cudaEventRecord(e5, st);
#endif
        if (n_fallback > 0) {
            long long total = (long long)n_fallback * s.spp;
            for (long long off = 0; off < total; off += chunk_samples) {
                int end = (int)std::min(total, off + chunk_samples);
                int cnt = end - (int)off;
                k_trace_fallback<<<(cnt + TRACE_BLOCK - 1) / TRACE_BLOCK, TRACE_BLOCK, 0, st>>>(
                    rp, W.d_q_fallback, tile_w, (int)off, end, device_rgb);
            }
        }
#ifdef PROFILE_PHASES
        cudaEventRecord(e6, st);
        cudaEventSynchronize(e6);
        float t_cls, t_sf, t_sao, t_st, t_pl, t_fb;
        cudaEventElapsedTime(&t_cls, e0, e1);
        cudaEventElapsedTime(&t_sf,  e1, e2);
        cudaEventElapsedTime(&t_sao, e2, e3);
        cudaEventElapsedTime(&t_st,  e3, e4);
        cudaEventElapsedTime(&t_pl,  e4, e5);
        cudaEventElapsedTime(&t_fb,  e5, e6);
        int tot_pix = s.width * s.height;
        int n_done = tot_pix - n_sfast - n_sao - n_strace - n_plist - n_fallback;
        fprintf(stderr, "PROF M=%d tot=%d done=%d(%.1f%%) sf=%d(%.1f%%) sao=%d(%.1f%%) st=%d(%.1f%%) pl=%d(%.1f%%) fb=%d(%.1f%%) | cls=%.2f sf=%.2f sao=%.2f st=%.2f pl=%.2f fb=%.2f\n",
                M, tot_pix, n_done, 100.0*n_done/tot_pix, n_sfast, 100.0*n_sfast/tot_pix,
                n_sao, 100.0*n_sao/tot_pix, n_strace, 100.0*n_strace/tot_pix,
                n_plist, 100.0*n_plist/tot_pix, n_fallback, 100.0*n_fallback/tot_pix,
                t_cls, t_sf, t_sao, t_st, t_pl, t_fb);
        cudaEventDestroy(e0); cudaEventDestroy(e1); cudaEventDestroy(e2);
        cudaEventDestroy(e3); cudaEventDestroy(e4); cudaEventDestroy(e5); cudaEventDestroy(e6);
#endif
    } else {
        long long total_samples = (long long)total_tiled_pixels * s.spp;
        for (long long off = 0; off < total_samples; off += chunk_samples) {
            int end = (int)std::min(total_samples, off + chunk_samples);
            int cnt = end - (int)off;
            k_trace_fallback<<<(cnt + TRACE_BLOCK - 1) / TRACE_BLOCK, TRACE_BLOCK, 0, st>>>(
                rp, nullptr, tile_w, (int)off, end, device_rgb);
        }
    }

    ck(cudaGetLastError());
}

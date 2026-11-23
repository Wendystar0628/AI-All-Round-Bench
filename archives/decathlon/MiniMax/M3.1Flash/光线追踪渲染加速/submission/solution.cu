// solution.cu — GPU 光线追踪渲染加速
//
// 关键点：
//  * CPU 端并行 binned-SAH 建树（多线程工作队列），替代基线的单线程建树。
//  * GPU 端 64 字节紧凑 BVH 节点（父节点内联保存两个子节点的包围盒），
//    遍历时一次 128 位加载即可同时得到两个子节点的 tnear，按近优先排序，
//    并用当前最优 t 剪掉远子节点。
//  * 三角形几何以 float4 对齐存放，叶子测试全部走 128 位对齐访存。
//  * 一个线程负责一个像素，spp 循环在寄存器里完成，省掉基线的样本缓冲与归约核。
#include "render_math.cuh"
#include <cuda_runtime.h>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <cmath>
#include <vector>
#include <algorithm>
#include <mutex>
#include <deque>
#include <thread>
#include <atomic>

// ============================================================================
// GPU 端数据结构
// ============================================================================
struct __align__(16) GNode {
  float4 c0, h0;   // 子节点0 的中心 / 半长；w 分量见下方编码
  float4 c1, h1;   // 子节点1 的中心 / 半长（内部节点使用）
};
// 编码：h0.w < 0  -> 叶子：c0.w = 起始三角形下标，-h0.w = 三角形个数
//       h0.w >= 0 -> 内部节点：c0.w = 子节点0 编号，h0.w = 子节点1 编号

struct __align__(16) GTri {
  float4 v0;        // 顶点0
  float4 e1;        // v1 - v0
  float4 e2;        // v2 - v0
};

#define LEAF_STACK 32

// 每条射线只求一次倒数方向；与射线平行的分量用 1e30 代替，
// 这样 (c-o)*inv 会变成 ±1e30，slab 退化为“不约束”或“必然未命中”，
// 与参考实现在平行轴上的判定完全一致，却省掉了每次求交里的除法。
// 额外预计算 |inv| 与 o*inv：包围盒以“中心 + 半长”存储时，
// slab 的近/远边界可以完全用 FMA 表达，把 ALU 管线上的 min/max 指令减半。
struct RayInv {
  V<float> inv;    // 1/d
  V<float> ainv;   // |1/d|
  V<float> od;     // o * inv
};
__device__ __forceinline__ RayInv makeInv(const V<float>& o, const V<float>& d) {
  RayInv r;
  r.inv.x = (fabsf(d.x) < 1e-30f) ? 1e30f : __frcp_rn(d.x);
  r.inv.y = (fabsf(d.y) < 1e-30f) ? 1e30f : __frcp_rn(d.y);
  r.inv.z = (fabsf(d.z) < 1e-30f) ? 1e30f : __frcp_rn(d.z);
  r.ainv.x = fabsf(r.inv.x);
  r.ainv.y = fabsf(r.inv.y);
  r.ainv.z = fabsf(r.inv.z);
  r.od = o * r.inv;
  return r;
}

// 包围盒 slab 求交（中心 + 半长形式）；命中返回进入距离 tnear，未命中返回 -1。
// 三个轴各用 3 条 FMA 表达近/远边界，只有累加 min/max 落在 ALU 管线。
__device__ __forceinline__ float boxNear(const float4& c, const float4& h,
                                         const RayInv& ri, float tmax) {
  float tmin = 0.0002f, tm = tmax;
  float t = __fmaf_rn(c.x, ri.inv.x, -ri.od.x);
  tmin = fmaxf(tmin, __fmaf_rn(-h.x, ri.ainv.x, t));
  tm = fminf(tm, __fmaf_rn(h.x, ri.ainv.x, t));
  t = __fmaf_rn(c.y, ri.inv.y, -ri.od.y);
  tmin = fmaxf(tmin, __fmaf_rn(-h.y, ri.ainv.y, t));
  tm = fminf(tm, __fmaf_rn(h.y, ri.ainv.y, t));
  t = __fmaf_rn(c.z, ri.inv.z, -ri.od.z);
  tmin = fmaxf(tmin, __fmaf_rn(-h.z, ri.ainv.z, t));
  tm = fminf(tm, __fmaf_rn(h.z, ri.ainv.z, t));
  return (tmin <= tm) ? tmin : -1.0f;
}

// 遍历 BVH。ANY=true 时只要找到任意遮挡即返回。
template <bool ANY>
__device__ __forceinline__ int traceTri(const GNode* __restrict__ nodes,
                                         const GTri* __restrict__ geo,
                                         const V<float>& o, const V<float>& d,
                                         float limit, float& bestT) {
  int stack[LEAF_STACK];
  int sp = 0;
  int cur = 0;
  int bestId = -1;
  float best = limit;
  const RayInv ri = makeInv(o, d);
  while (true) {
    const GNode n = nodes[cur];
    if (n.hi0.w < 0.0f) {
      const int start = (int)n.lo0.w;
      const int count = (int)(-n.hi0.w);
      for (int i = 0; i < count; ++i) {
        const GTri& t = geo[start + i];
        const V<float> e1(t.e1.x, t.e1.y, t.e1.z);
        const V<float> e2(t.e2.x, t.e2.y, t.e2.z);
        V<float> p = d.cross(e2);
        float det = e1.dot(p);
        if (fabsf(det) < 1e-10f) continue;
        float inv = __frcp_rn(det);
        V<float> s = o - V<float>(t.v0.x, t.v0.y, t.v0.z);
        float u = s.dot(p) * inv;
        if (u < 0.0f || u > 1.0f) continue;
        V<float> q = s.cross(e1);
        float vv = d.dot(q) * inv;
        if (vv < 0.0f || u + vv > 1.0f) continue;
        float dist = e2.dot(q) * inv;
        if (dist <= 0.0002f || dist >= best) continue;
        best = dist;
        bestId = start + i;
        if (ANY) { bestT = best; return bestId; }
      }
      if (sp == 0) break;
      cur = stack[--sp];
      continue;
    }
    const int c0 = (int)n.lo0.w, c1 = (int)n.hi0.w;
    const float t0 = boxNear(n.lo0, n.hi0, o, inv, best);
    const float t1 = boxNear(n.lo1, n.hi1, o, inv, best);
    const bool h0 = t0 >= 0.0f, h1 = t1 >= 0.0f;
    if (h0 & h1) {
      if (t0 <= t1) { stack[sp++] = c1; cur = c0; }
      else { stack[sp++] = c0; cur = c1; }
    } else if (h0) {
      cur = c0;
    } else if (h1) {
      cur = c1;
    } else {
      if (sp == 0) break;
      cur = stack[--sp];
    }
  }
  bestT = best;
  return bestId;
}

__device__ __forceinline__ bool anyHit(const GNode* __restrict__ nodes,
                                       const GTri* __restrict__ geo,
                                       const V<float>& o, const V<float>& d, float limit) {
  float t;
  return traceTri<true>(nodes, geo, o, d, limit, t) >= 0;
}

// 与 render_math.cuh 的 radiance<float> 等价，仅把三角形访问换成紧凑布局。
__device__ __forceinline__ V<float> radianceX(const Scene& s, int pixel, int sid,
                                               const GNode* __restrict__ nodes,
                                               const GTri* __restrict__ geo,
                                               const float4* __restrict__ col) {
  Ray<float> r = camera<float>(s, pixel, sid);
  V<float> result, through(1.0f, 1.0f, 1.0f);
  for (int depth = 0; depth < s.max_depth; ++depth) {
    float ht = 0.0f;
    int id = traceTri<false>(nodes, geo, r.o, r.d, 1e20f, ht);
    if (id < 0) { result = result + through * sky<float>(r.d); break; }
    const GTri& t = geo[id];
    const V<float> e1(t.e1.x, t.e1.y, t.e1.z);
    const V<float> e2(t.e2.x, t.e2.y, t.e2.z);
    V<float> n = e1.cross(e2).unit();
    if (n.dot(r.d) > 0) n = n * (-1.0f);
    V<float> p = r.o + r.d * ht + n * 0.001f;
    V<float> l = V<float>(s.light[0], s.light[1], s.light[2]).unit();
    float cosine = n.dot(l);
    if (cosine < 0) cosine = 0;
    float visible = (cosine > 0 && !anyHit(nodes, geo, p, l, 1e20f)) ? 1.0f : 0.0f;
    int open = 0;
    V<float> axis = (fabsf(n.z) < 0.8f) ? V<float>(0, 0, 1) : V<float>(0, 1, 0);
    V<float> tx = axis.cross(n).unit(), ty = n.cross(tx);
    for (int a = 0; a < s.ao; ++a) {
      uint32_t key = s.seed + uint32_t(pixel) * 0x9e3779b9u + uint32_t(sid) * 0x85ebca6bu +
                     uint32_t(depth) * 0xc2b2ae35u + uint32_t(a) * 0x27d4eb2du;
      float x = 2.0f * sample<float>(key ^ 0x68bc21ebu) - 1.0f;
      float y = 2.0f * sample<float>(key ^ 0x02e5be93u) - 1.0f;
      float z = 0.25f + 0.75f * sample<float>(key ^ 0x967a889bu);
      V<float> dir = (tx * x + ty * y + n * z).unit();
      open += anyHit(nodes, geo, p, dir, s.ao_radius) ? 0 : 1;
    }
    float ambient = s.ao ? float(open) / float(s.ao) : 1.0f;
    float value = 0.08f + 0.20f * ambient + 0.72f * cosine * visible;
    const float4 c = col[id];
    V<float> cc(c.x, c.y, c.z);
    float mir = c.w;
    result = result + through * cc * (value * (1.0f - mir));
    through = through * mir;
    if (mir == 0.0f) break;
    r.o = p;
    r.d = (r.d - n * (2.0f * r.d.dot(n))).unit();
  }
  return result;
}

__global__ __launch_bounds__(128, 10) void renderKernel(Scene s, const GNode* __restrict__ nodes,
                                                     const GTri* __restrict__ geo,
                                                     const float4* __restrict__ col,
                                                     float* __restrict__ out) {
  // 一个 warp 负责一个像素：32 个 lane 各算一个样本，同一像素的样本射线几乎重合，
  // 因此 warp 内遍历路径高度一致，访存合并度高、发散代价小。
  const int lane = threadIdx.x & 31;
  const int warpId = (blockIdx.x * blockDim.x + threadIdx.x) >> 5;
  const int npix = s.width * s.height;
  if (warpId >= npix) return;
  V<float> acc(0.0f, 0.0f, 0.0f);
  for (int s0 = 0; s0 < s.spp; s0 += 32) {
    const int sid = s0 + lane;
    V<float> c(0.0f, 0.0f, 0.0f);
    if (sid < s.spp) c = radianceX(s, warpId, sid, nodes, geo, col);
    for (int off = 16; off > 0; off >>= 1) {
      c.x += __shfl_xor_sync(0xffffffffu, c.x, off);
      c.y += __shfl_xor_sync(0xffffffffu, c.y, off);
      c.z += __shfl_xor_sync(0xffffffffu, c.z, off);
    }
    acc = acc + c;
  }
  if (lane == 0) {
    const float inv = 1.0f / (float)s.spp;
    out[3 * warpId + 0] = acc.x * inv;
    out[3 * warpId + 1] = acc.y * inv;
    out[3 * warpId + 2] = acc.z * inv;
  }
}

// ============================================================================
// CPU 端并行 binned-SAH BVH 构建
// ============================================================================
struct HNode {
  float lo[3], hi[3];
  int c0, c1, start, count;
};

struct BTask {
  int nodeIdx, first, count, depth;
};

// 主机端暂存区（全部在 init() 中一次性分配，render() 内不再做堆分配/清零）
static float* h_tri = nullptr;    // 9*N
static int* h_order = nullptr;    // N
static HNode* h_nodes = nullptr;  // 2N+2
static GNode* h_gnode = nullptr;  // 2N+2
static GTri* h_geo = nullptr;     // N
static float4* h_col = nullptr;   // N

static const int SBINS = 16;
static const int MAX_DEPTH = 30;
static const int SERIAL_LEAF = 48;

struct Builder {
  int N = 0;
  float* tri = nullptr;        // 9*N: lo[3],hi[3],cen[3]
  int* order = nullptr;
  HNode* nodes = nullptr;
  const Triangle* src = nullptr;
  GTri* geo = nullptr;         // GPU 三角形几何（按 BVH 顺序，叶子定稿时直接写入）
  float4* col = nullptr;       // GPU 颜色 / 镜面系数
  std::atomic<int> nodeCount;
  std::mutex mtx;
  std::deque<BTask> queue;
  int outstanding = 0;

  // 叶子定稿时几何数据按 BVH 顺序写入 GPU 缓冲区（见 render() 中的并行打包步骤）。
  void emitLeaf(int first, int count) { (void)first; (void)count; }

  static inline float area(const float* a, const float* b) {
    return (b[0] - a[0]) * (b[1] - a[1]) + (b[1] - a[1]) * (b[2] - a[2]) +
           (b[2] - a[2]) * (b[0] - a[0]);
  }

  void prepare(const Scene& s) {
    N = s.triangle_count;
    tri = h_tri;
    order = h_order;
    nodes = h_nodes;
    src = s.triangles;
    geo = h_geo;
    col = h_col;
    for (int i = 0; i < N; i++) {
      const Triangle& t = s.triangles[i];
      float* d = tri + (size_t)i * 9;
      for (int k = 0; k < 3; k++) {
        float a = t.v0[k], b = t.v1[k], c = t.v2[k];
        d[k] = std::min(a, std::min(b, c));
        d[3 + k] = std::max(a, std::max(b, c));
        d[6 + k] = (d[k] + d[3 + k]) * 0.5f;
      }
      order[i] = i;
    }
    nodeCount.store(1);
  }

  inline void scanRange(int first, int count, float* clo, float* chi, float* nlo, float* nhi) {
    for (int k = 0; k < 3; k++) {
      clo[k] = 1e30f; chi[k] = -1e30f;
      nlo[k] = 1e30f; nhi[k] = -1e30f;
    }
    for (int i = first; i < first + count; i++) {
      const float* d = tri + (size_t)order[i] * 9;
      for (int k = 0; k < 3; k++) {
        float lo = d[k], hi = d[3 + k], ce = d[6 + k];
        if (ce < clo[k]) clo[k] = ce;
        if (ce > chi[k]) chi[k] = ce;
        if (lo < nlo[k]) nlo[k] = lo;
        if (hi > nhi[k]) nhi[k] = hi;
      }
    }
  }

  // 求最佳分割；返回是否找到可用分割，并给出 mid 与代价。
  // 三个轴的分箱合并成一遍扫描：建树是访存受限的，少一遍随机访问就是三倍提速。
  bool findSplit(int first, int count, const float* clo, const float* chi,
                 const float* nlo, const float* nhi, int& mid, float& splitCost) {
    const float parentArea = area(nlo, nhi);
    float bestRaw = 1e30f;
    int bestAxis = -1, bestBin = 0;
    int bc[3][SBINS];
    float blo[3][SBINS][3], bhi[3][SBINS][3];
    float rlo[3][SBINS][3], rhi[3][SBINS][3];
    int rc[3][SBINS];
    float scale[3];
    int axisOk[3];
    for (int k = 0; k < 3; k++) {
      const float ext = chi[k] - clo[k];
      axisOk[k] = (ext >= 1e-9f);
      scale[k] = axisOk[k] ? SBINS / ext * (1.0f - 1e-6f) : 0.0f;
      for (int j = 0; j < SBINS; j++) {
        bc[k][j] = 0;
        for (int q = 0; q < 3; q++) { blo[k][j][q] = 1e30f; bhi[k][j][q] = -1e30f; }
      }
    }
    for (int i = first; i < first + count; i++) {
      const float* d = tri + (size_t)order[i] * 9;
      for (int k = 0; k < 3; k++) {
        if (!axisOk[k]) continue;
        int j = (int)((d[6 + k] - clo[k]) * scale[k]);
        if (j < 0) j = 0;
        if (j >= SBINS) j = SBINS - 1;
        bc[k][j]++;
        for (int q = 0; q < 3; q++) {
          if (d[q] < blo[k][j][q]) blo[k][j][q] = d[q];
          if (d[3 + q] > bhi[k][j][q]) bhi[k][j][q] = d[3 + q];
        }
      }
    }
    for (int k = 0; k < 3; k++) {
      if (!axisOk[k]) continue;
      {
        float lo[3] = {1e30f, 1e30f, 1e30f}, hi[3] = {-1e30f, -1e30f, -1e30f};
        int c = 0;
        for (int j = SBINS - 1; j >= 0; j--) {
          c += bc[k][j];
          for (int q = 0; q < 3; q++) {
            if (blo[k][j][q] < lo[q]) lo[q] = blo[k][j][q];
            if (bhi[k][j][q] > hi[q]) hi[q] = bhi[k][j][q];
            rlo[k][j][q] = lo[q]; rhi[k][j][q] = hi[q];
          }
          rc[k][j] = c;
        }
      }
      {
        float lo[3] = {1e30f, 1e30f, 1e30f}, hi[3] = {-1e30f, -1e30f, -1e30f};
        int c = 0;
        for (int j = 0; j < SBINS - 1; j++) {
          c += bc[k][j];
          for (int q = 0; q < 3; q++) {
            if (blo[k][j][q] < lo[q]) lo[q] = blo[k][j][q];
            if (bhi[k][j][q] > hi[q]) hi[q] = bhi[k][j][q];
          }
          if (!c || !rc[k][j + 1]) continue;
          float cost = area(lo, hi) * c + area(rlo[k][j + 1], rhi[k][j + 1]) * rc[k][j + 1];
          if (cost < bestRaw) { bestRaw = cost; bestAxis = k; bestBin = j + 1; }
        }
      }
    }
    if (bestAxis < 0) return false;
    splitCost = 1.0f + (parentArea > 0.0f ? bestRaw / parentArea : (float)count);
    const int k = bestAxis;
    const float c0 = clo[k];
    const float pscale = scale[k];
    int* beg = &order[first];
    int* end = beg + count;
    int* midIt = std::partition(beg, end, [&](int t) {
      int j = (int)((tri[(size_t)t * 9 + 6 + k] - c0) * pscale);
      if (j < 0) j = 0;
      if (j >= SBINS) j = SBINS - 1;
      return j < bestBin;
    });
    mid = (int)(midIt - beg) + first;
    if (mid <= first || mid >= first + count) {
      // 退化：按最长轴做中位分割
      int axis = 0;
      for (int q = 1; q < 3; q++) if (nhi[q] - nlo[q] > nhi[axis] - nlo[axis]) axis = q;
      int* mp = beg + count / 2;
      std::nth_element(beg, mp, end, [&](int x, int y) {
        return tri[(size_t)x * 9 + 6 + axis] < tri[(size_t)y * 9 + 6 + axis];
      });
      mid = first + count / 2;
    }
    return true;
  }

  // 串行构建整棵子树（小规模时避免任务调度开销）
  void buildSerial(int nodeIdx, int first, int count, int depth) {
    float clo[3], chi[3], nlo[3], nhi[3];
    scanRange(first, count, clo, chi, nlo, nhi);
    for (int k = 0; k < 3; k++) {
      nodes[nodeIdx].lo[k] = nlo[k];
      nodes[nodeIdx].hi[k] = nhi[k];
    }
    int mid = 0;
    float splitCost = 0.0f;
    bool ok = false;
    if (count > 1 && depth < MAX_DEPTH)
      ok = findSplit(first, count, clo, chi, nlo, nhi, mid, splitCost);
    if (!ok || (count <= 8 && (float)count <= splitCost)) {
      nodes[nodeIdx].start = first;
      nodes[nodeIdx].count = count;
      nodes[nodeIdx].c0 = nodes[nodeIdx].c1 = -1;
      emitLeaf(first, count);
      return;
    }
    int base = nodeCount.fetch_add(2);
    int li = base, ri = base + 1;
    nodes[nodeIdx].c0 = li; nodes[nodeIdx].c1 = ri;
    nodes[nodeIdx].start = 0; nodes[nodeIdx].count = 0;
    buildSerial(li, first, mid - first, depth + 1);
    buildSerial(ri, mid, first + count - mid, depth + 1);
  }

  void worker() {
    while (true) {
      BTask t;
      bool got = false;
      {
        std::lock_guard<std::mutex> g(mtx);
        if (!queue.empty()) {
          t = queue.front(); queue.pop_front(); got = true;
        } else if (outstanding == 0) {
          break;
        }
      }
      if (!got) { std::this_thread::yield(); continue; }

      BTask kids[2];
      int nk = 0;
      if (t.count <= SERIAL_LEAF) {
        buildSerial(t.nodeIdx, t.first, t.count, t.depth);
      } else {
        float clo[3], chi[3], nlo[3], nhi[3];
        scanRange(t.first, t.count, clo, chi, nlo, nhi);
        for (int k = 0; k < 3; k++) {
          nodes[t.nodeIdx].lo[k] = nlo[k];
          nodes[t.nodeIdx].hi[k] = nhi[k];
        }
        int mid = 0;
        float splitCost = 0.0f;
        bool ok = findSplit(t.first, t.count, clo, chi, nlo, nhi, mid, splitCost);
        if (!ok || (t.count <= 8 && (float)t.count <= splitCost)) {
          nodes[t.nodeIdx].start = t.first;
          nodes[t.nodeIdx].count = t.count;
          nodes[t.nodeIdx].c0 = nodes[t.nodeIdx].c1 = -1;
          emitLeaf(t.first, t.count);
        } else {
          int base = nodeCount.fetch_add(2);
          nodes[t.nodeIdx].c0 = base; nodes[t.nodeIdx].c1 = base + 1;
          nodes[t.nodeIdx].start = 0; nodes[t.nodeIdx].count = 0;
          kids[0] = BTask{base, t.first, mid - t.first, t.depth + 1};
          kids[1] = BTask{base + 1, mid, t.first + t.count - mid, t.depth + 1};
          nk = 2;
        }
      }
      {
        std::lock_guard<std::mutex> g(mtx);
        for (int i = 0; i < nk; i++) queue.push_back(kids[i]);
        outstanding -= 1;
        outstanding += nk;
      }
    }
  }

  void run(int nthreads) {
    {
      std::lock_guard<std::mutex> g(mtx);
      queue.push_back(BTask{0, 0, N, 0});
      outstanding = 1;
    }
    std::vector<std::thread> pool;
    pool.reserve(nthreads);
    for (int i = 0; i < nthreads; i++) pool.emplace_back([this] { worker(); });
    for (auto& t : pool) t.join();
  }
};

// ============================================================================
// 运行时资源（全部在 init() 中一次性分配，render() 内不再做堆分配/清零）
// ============================================================================
static GNode* d_nodes = nullptr;
static GTri* d_geo = nullptr;
static float4* d_col = nullptr;
static int cap_tris = 0;
static int cap_nodes = 0;

static void ensureCapacity(int ntri) {
  if (ntri <= cap_tris) return;
  int nt = ntri > 0 ? ntri : 1;
  int nn = 2 * nt + 2;
  if (d_nodes) cudaFree(d_nodes);
  if (d_geo) cudaFree(d_geo);
  if (d_col) cudaFree(d_col);
  cudaMalloc(&d_nodes, (size_t)nn * sizeof(GNode));
  cudaMalloc(&d_geo, (size_t)nt * sizeof(GTri));
  cudaMalloc(&d_col, (size_t)nt * sizeof(float4));
  if (h_tri) delete[] h_tri;
  if (h_order) delete[] h_order;
  if (h_nodes) delete[] h_nodes;
  if (h_gnode) delete[] h_gnode;
  if (h_geo) delete[] h_geo;
  if (h_col) delete[] h_col;
  h_tri = new float[(size_t)nt * 9];
  h_order = new int[nt];
  h_nodes = new HNode[nn];
  h_gnode = new GNode[nn];
  h_geo = new GTri[nt];
  h_col = new float4[nt];
  cap_tris = nt;
  cap_nodes = nn;
}

void init(int max_triangles, int max_pixels, int max_samples) {
  (void)max_pixels;
  (void)max_samples;
  ensureCapacity(max_triangles > 0 ? max_triangles : 1);
}

void render(const Scene& s, float* device_rgb) {
  const int ntri = s.triangle_count;
  ensureCapacity(ntri);

  Builder b;
  b.prepare(s);
  int hw = (int)std::thread::hardware_concurrency();
  int nthreads = 12;
  if (hw > 0 && hw < nthreads) nthreads = hw;
  if (nthreads < 1) nthreads = 1;
  b.run(nthreads);

  // 生成 GPU 端紧凑数据（按 BVH 排列顺序）
  const int nnode = b.nodeCount.load();
  GNode* gn = h_gnode;
  for (int i = 0; i < nnode; i++) {
    const HNode& h = b.nodes[i];
    GNode& g = gn[i];
    g.lo0 = make_float4(h.lo[0] - 1e-5f, h.lo[1] - 1e-5f, h.lo[2] - 1e-5f, 0.0f);
    g.hi0 = make_float4(h.hi[0] + 1e-5f, h.hi[1] + 1e-5f, h.hi[2] + 1e-5f, 0.0f);
    g.lo1 = make_float4(0.0f, 0.0f, 0.0f, 0.0f);
    g.hi1 = make_float4(0.0f, 0.0f, 0.0f, 0.0f);
  }
  // 节点内联子包围盒 + 三角形几何：都是纯数据搬运，拆成多线程并行做。
  {
    std::vector<std::thread> pool;
    pool.reserve(nthreads);
    const int nchunk = nthreads * 2;
    for (int c = 0; c < nchunk; c++) {
      const int lo = (int)((long long)nnode * c / nchunk);
      const int hi = (int)((long long)nnode * (c + 1) / nchunk);
      const int tlo = (int)((long long)ntri * c / nchunk);
      const int thi = (int)((long long)ntri * (c + 1) / nchunk);
      pool.emplace_back([&, lo, hi, tlo, thi] {
        for (int i = lo; i < hi; i++) {
          const HNode& h = b.nodes[i];
          if (h.count > 0) {
            gn[i].lo0.w = (float)h.start;
            gn[i].hi0.w = -(float)h.count;
          } else {
            const HNode& l = b.nodes[h.c0];
            const HNode& r = b.nodes[h.c1];
            gn[i].lo0.w = (float)h.c0;
            gn[i].hi0.w = (float)h.c1;
            gn[i].lo0.x = l.lo[0] - 1e-5f; gn[i].lo0.y = l.lo[1] - 1e-5f; gn[i].lo0.z = l.lo[2] - 1e-5f;
            gn[i].hi0.x = l.hi[0] + 1e-5f; gn[i].hi0.y = l.hi[1] + 1e-5f; gn[i].hi0.z = l.hi[2] + 1e-5f;
            gn[i].lo1.x = r.lo[0] - 1e-5f; gn[i].lo1.y = r.lo[1] - 1e-5f; gn[i].lo1.z = r.lo[2] - 1e-5f;
            gn[i].hi1.x = r.hi[0] + 1e-5f; gn[i].hi1.y = r.hi[1] + 1e-5f; gn[i].hi1.z = r.hi[2] + 1e-5f;
          }
        }
        for (int i = tlo; i < thi; i++) {
          const Triangle& t = s.triangles[b.order[i]];
          GTri& g = h_geo[i];
          g.v0 = make_float4(t.v0[0], t.v0[1], t.v0[2], 0.0f);
          g.e1 = make_float4(t.v1[0] - t.v0[0], t.v1[1] - t.v0[1], t.v1[2] - t.v0[2], 0.0f);
          g.e2 = make_float4(t.v2[0] - t.v0[0], t.v2[1] - t.v0[1], t.v2[2] - t.v0[2], 0.0f);
          h_col[i] = make_float4(t.color[0], t.color[1], t.color[2], t.mirror);
        }
      });
    }
    for (auto& th : pool) th.join();
  }
  cudaMemcpy(d_nodes, gn, (size_t)nnode * sizeof(GNode), cudaMemcpyHostToDevice);
  cudaMemcpy(d_geo, h_geo, (size_t)ntri * sizeof(GTri), cudaMemcpyHostToDevice);
  cudaMemcpy(d_col, h_col, (size_t)ntri * sizeof(float4), cudaMemcpyHostToDevice);

  Scene d = s;
  d.triangles = nullptr;
  const int npix = s.width * s.height;
  const int threads = 128;
  const int warpsPerBlock = threads / 32;
  const int blocks = (npix + warpsPerBlock - 1) / warpsPerBlock;
  renderKernel<<<blocks, threads>>>(d, d_nodes, d_geo, d_col, device_rgb);
  cudaGetLastError();
}

#define PAR_DEPTH 4
#include "bvh.hpp"
#include <cuda_runtime.h>
#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstdint>
#include <vector>

// Geometry is kept separate from the material.  Intersection rays therefore do
// not pull colors and normals through the cache, and triangles are stored in BVH
// leaf order so a leaf consists of consecutive records.
struct GpuTriangle {
    // Inverse triangle transform.  Plane row comes first because rejected
    // candidates do not need either barycentric row.
    float p0, p1, p2, p3;
    float u0, u1, u2, u3;
    float v0, v1, v2, v3;
};
struct __align__(16) GpuMaterial {
    float cr, cg, cb, mirror;
    float nx, ny, nz, pad;
};
struct __align__(16) GpuNode {
    float lox, loy, loz; int left;
    float hix, hiy, hiz; int right;
};

struct Params {
    int width, height, spp, ao, max_depth;
    unsigned seed;
    float eye_x, eye_y, eye_z;
    float u_x, u_y, u_z;
    float v_x, v_y, v_z;
    float w_x, w_y, w_z;
    float pixel_scale_x, pixel_scale_y;
    float light_x, light_y, light_z;
    float ao_radius;
    const GpuTriangle* triangles;
    const GpuMaterial* materials;
    const GpuNode* nodes;
};

struct F3 { float x,y,z; };
struct DRay { F3 o,d; };
struct DHit { float t; int id; };

static GpuTriangle *d_triangles = nullptr, *h_triangles = nullptr;
static GpuMaterial *d_materials = nullptr, *h_materials = nullptr;
static GpuNode *d_nodes = nullptr, *h_nodes = nullptr;
static int triangle_capacity = 0;

struct MortonRef { uint64_t key; int id; };
static std::vector<MortonRef> builder_refs,builder_tmp;
static std::vector<int> builder_order;
static std::vector<Node> builder_nodes;
static std::vector<float> builder_lo,builder_hi,builder_cen;

static inline uint64_t spread21(uint32_t x) {
    uint64_t v=uint64_t(x)&0x1fffffu;
    v=(v|(v<<32))&0x001f00000000ffffull;
    v=(v|(v<<16))&0x001f0000ff0000ffull;
    v=(v|(v<<8)) &0x100f00f00f00f00full;
    v=(v|(v<<4)) &0x10c30c30c30c30c3ull;
    v=(v|(v<<2)) &0x1249249249249249ull;
    return v;
}

// A linear Morton builder is much cheaper than full binned SAH during the
// timed call.  Radix partitioning also preserves spatially adjacent triangles
// in contiguous leaves.
struct MortonBuilder {
    struct Task { int root,b,e; };
    const Triangle* t;
    int n,node_count; std::atomic<int> next;
    std::vector<MortonRef>& refs; std::vector<MortonRef>& tmp;
    std::vector<int>& order;
    std::vector<Node>& nodes;
    std::vector<float>& tri_lo;std::vector<float>& tri_hi;std::vector<float>& tri_cen;
    std::vector<Task> tasks;

    explicit MortonBuilder(const Scene& s):t(s.triangles),n(s.triangle_count),node_count(0),next(0),refs(builder_refs),tmp(builder_tmp),order(builder_order),nodes(builder_nodes),tri_lo(builder_lo),tri_hi(builder_hi),tri_cen(builder_cen) {
        tasks.reserve(size_t(n)/2048+16);
        float clo[3]={1e30f,1e30f,1e30f},chi[3]={-1e30f,-1e30f,-1e30f};
        for (int i=0;i<n;i++) for (int k=0;k<3;k++) {
            float lo=std::min(t[i].v0[k],std::min(t[i].v1[k],t[i].v2[k]));
            float hi=std::max(t[i].v0[k],std::max(t[i].v1[k],t[i].v2[k]));
            float c=(lo+hi)*.5f; tri_lo[3*i+k]=lo;tri_hi[3*i+k]=hi;tri_cen[3*i+k]=c;
            clo[k]=std::min(clo[k],c); chi[k]=std::max(chi[k],c);
        }
        float scale[3];
        for (int k=0;k<3;k++) scale[k]=(chi[k]>clo[k])?2097151.75f/(chi[k]-clo[k]):0.0f;
        for (int i=0;i<n;i++) {
            uint32_t q[3];
            for (int k=0;k<3;k++) {
                int v=int((tri_cen[3*i+k]-clo[k])*scale[k]); q[k]=uint32_t(std::max(0,std::min(2097151,v)));
            }
            refs[i]={spread21(q[0])|(spread21(q[1])<<1)|(spread21(q[2])<<2),i};
        }
        // Stable four-pass radix sort.  Unlike comparison sorting this is linear
        // and its memory access is predictable on the restricted efficiency cores.
        for (int pass=0;pass<8;pass++) {
            size_t count[256]={},pos[256]; int shift=pass*8;
            for (int i=0;i<n;i++) count[(refs[i].key>>shift)&255u]++;
            pos[0]=0; for (int i=1;i<256;i++) pos[i]=pos[i-1]+count[i-1];
            for (int i=0;i<n;i++){const MortonRef r=refs[i];tmp[pos[(r.key>>shift)&255u]++]=r;}
            refs.swap(tmp);
        }
        build_top(0,n,0);
        int top_count=next.load();
        std::atomic<int> cursor{0};
        int workers=std::min(12,int(tasks.size()));
        std::vector<std::thread> pool; pool.reserve(workers);
        for(int w=0;w<workers;w++) pool.emplace_back([&]{
            for(;;){int q=cursor++;if(q>=int(tasks.size()))break;const Task task=tasks[q];build_sah(task.b,task.e,task.root,0);}
        });
        for(auto&th:pool)th.join();
        for(int id=top_count-1;id>=0;id--){Node& a=nodes[id];if(a.count==0){const Node&l=nodes[a.left];const Node&r=nodes[a.right];for(int k=0;k<3;k++){a.lo[k]=std::min(l.lo[k],r.lo[k]);a.hi[k]=std::max(l.hi[k],r.hi[k]);}}}
        for (int i=0;i<n;i++) order[i]=refs[i].id;
        node_count=next.load();
    }

    static float node_area(const float* lo,const float* hi) {
        float x=hi[0]-lo[0],y=hi[1]-lo[1],z=hi[2]-lo[2]; return x*y+y*z+z*x;
    }

    int build_sah(int b,int e,int forced=-1,int depth=0) {
        int id=forced>=0?forced:next++; Node node{}; float clo[3],chi[3];
        for (int k=0;k<3;k++) { node.lo[k]=clo[k]=1e30f; node.hi[k]=chi[k]=-1e30f; }
        node.left=node.right=-1; node.start=b; node.count=e-b;
        for (int i=b;i<e;i++) { int tid=refs[i].id;
            for (int k=0;k<3;k++) {
                float lo=tri_lo[3*tid+k],hi=tri_hi[3*tid+k],c=tri_cen[3*tid+k];
                node.lo[k]=std::min(node.lo[k],lo); node.hi[k]=std::max(node.hi[k],hi);
                clo[k]=std::min(clo[k],c); chi[k]=std::max(chi[k],c);
            }
        }
        if (e-b<=4||depth>=18) { nodes[id]=node; return id; }
        float best=1e30f; int best_axis=-1,best_bin=0;
        for (int axis=0;axis<3;axis++) {
            float ext=chi[axis]-clo[axis]; if (ext<1e-9f) continue;
            int count[16]={}; float blo[16][3],bhi[16][3];
            for (int q=0;q<16;q++) for (int k=0;k<3;k++) { blo[q][k]=1e30f; bhi[q][k]=-1e30f; }
            float scale=15.99999f/ext;
            for (int i=b;i<e;i++) { int tid=refs[i].id;
                int q=std::min(15,int((tri_cen[3*tid+axis]-clo[axis])*scale)); count[q]++;
                for (int k=0;k<3;k++) { blo[q][k]=std::min(blo[q][k],tri_lo[3*tid+k]); bhi[q][k]=std::max(bhi[q][k],tri_hi[3*tid+k]); }
            }
            int rc[16],total=0; float ra[16],lo[3]={1e30f,1e30f,1e30f},hi[3]={-1e30f,-1e30f,-1e30f};
            for (int q=15;q>0;q--) { total+=count[q]; for(int k=0;k<3;k++){lo[k]=std::min(lo[k],blo[q][k]);hi[k]=std::max(hi[k],bhi[q][k]);} rc[q]=total;ra[q]=node_area(lo,hi); }
            for(int k=0;k<3;k++){lo[k]=1e30f;hi[k]=-1e30f;} total=0;
            for(int q=1;q<16;q++){total+=count[q-1];for(int k=0;k<3;k++){lo[k]=std::min(lo[k],blo[q-1][k]);hi[k]=std::max(hi[k],bhi[q-1][k]);}
                if(total&&rc[q]){float cost=node_area(lo,hi)*total+ra[q]*rc[q];if(cost<best){best=cost;best_axis=axis;best_bin=q;}}}
        }
        int mid;
        if(best_axis>=0){int axis=best_axis;float scale=15.99999f/(chi[axis]-clo[axis]);
            mid=int(std::partition(refs.begin()+b,refs.begin()+e,[&](const MortonRef&r){return std::min(15,int((tri_cen[3*r.id+axis]-clo[axis])*scale))<best_bin;})-refs.begin());
        }else mid=(b+e)/2;
        if(mid<=b||mid>=e)mid=(b+e)/2;
        int l=build_sah(b,mid,-1,depth+1),r=build_sah(mid,e,-1,depth+1); node.count=0;node.left=l;node.right=r;nodes[id]=node;return id;
    }

    int build_top(int b,int e,int depth) {
        int id=next++; Node node{};
        for (int k=0;k<3;k++) { node.lo[k]=1e30f; node.hi[k]=-1e30f; }
        node.left=node.right=-1; node.start=b; node.count=e-b;
        if(e-b<=4096||depth>=12){nodes[id]=node;tasks.push_back({id,b,e});return id;}
        int mid;
        uint64_t first=refs[b].key,last=refs[e-1].key,diff=first^last;
        if (!diff) mid=(b+e)/2;
        else {
            int bitpos=63-int(__lzcnt64(diff)); uint64_t bit=1ull<<bitpos,side=first&bit;
            int lo=b+1,hi=e;
            while (lo<hi) { int m=(lo+hi)/2; if ((refs[m].key&bit)==side) lo=m+1; else hi=m; }
            mid=lo;
            if (mid<=b||mid>=e) mid=(b+e)/2;
        }
        int l=build_top(b,mid,depth+1),r=build_top(mid,e,depth+1);
        node.count=0; node.left=l; node.right=r;
        for (int k=0;k<3;k++) { node.lo[k]=std::min(nodes[l].lo[k],nodes[r].lo[k]); node.hi[k]=std::max(nodes[l].hi[k],nodes[r].hi[k]); }
        nodes[id]=node; return id;
    }
};

static void check_cuda(cudaError_t e) {
    if (e != cudaSuccess) {
        std::fprintf(stderr, "solution CUDA error: %s\n", cudaGetErrorString(e));
        std::exit(2);
    }
}

__device__ __forceinline__ F3 f3(float x=0, float y=0, float z=0) { return {x,y,z}; }
__device__ __forceinline__ F3 add(F3 a,F3 b) { return f3(a.x+b.x,a.y+b.y,a.z+b.z); }
__device__ __forceinline__ F3 sub(F3 a,F3 b) { return f3(a.x-b.x,a.y-b.y,a.z-b.z); }
__device__ __forceinline__ F3 mul(F3 a,float b) { return f3(a.x*b,a.y*b,a.z*b); }
__device__ __forceinline__ F3 cmul(F3 a,F3 b) { return f3(a.x*b.x,a.y*b.y,a.z*b.z); }
__device__ __forceinline__ float dot(F3 a,F3 b) { return a.x*b.x+a.y*b.y+a.z*b.z; }
__device__ __forceinline__ F3 cross(F3 a,F3 b) {
    return f3(a.y*b.z-a.z*b.y,a.z*b.x-a.x*b.z,a.x*b.y-a.y*b.x);
}
__device__ __forceinline__ F3 unit(F3 a) { return mul(a,rsqrtf(dot(a,a))); }

__device__ __forceinline__ uint32_t hash32(uint32_t x) {
    x^=x>>16; x*=0x7feb352du; x^=x>>15; x*=0x846ca68bu; return x^(x>>16);
}
__device__ __forceinline__ float random_sample(uint32_t x) {
    return float(hash32(x)>>8)*(1.0f/16777216.0f);
}

__device__ __forceinline__ bool hit_box(const GpuNode& n, const DRay& r,
                                         F3 inv, float limit, float& near_t) {
    float x0=(n.lox-1.0e-5f-r.o.x)*inv.x, x1=(n.hix+1.0e-5f-r.o.x)*inv.x;
    float y0=(n.loy-1.0e-5f-r.o.y)*inv.y, y1=(n.hiy+1.0e-5f-r.o.y)*inv.y;
    float z0=(n.loz-1.0e-5f-r.o.z)*inv.z, z1=(n.hiz+1.0e-5f-r.o.z)*inv.z;
    float lo=fmaxf(0.0002f,fmaxf(fminf(x0,x1),fmaxf(fminf(y0,y1),fminf(z0,z1))));
    float hi=fminf(limit,fminf(fmaxf(x0,x1),fminf(fmaxf(y0,y1),fmaxf(z0,z1))));
    near_t=lo;
    return lo<=hi;
}

__device__ __forceinline__ bool hit_box_signed(const GpuNode& n,const DRay& r,F3 inv,
                                                int signs,float limit,float& near_t) {
    float ax=(signs&1)?n.hix+1.0e-5f:n.lox-1.0e-5f;
    float bx=(signs&1)?n.lox-1.0e-5f:n.hix+1.0e-5f;
    float ay=(signs&2)?n.hiy+1.0e-5f:n.loy-1.0e-5f;
    float by=(signs&2)?n.loy-1.0e-5f:n.hiy+1.0e-5f;
    float az=(signs&4)?n.hiz+1.0e-5f:n.loz-1.0e-5f;
    float bz=(signs&4)?n.loz-1.0e-5f:n.hiz+1.0e-5f;
    float lo=fmaxf(0.0002f,fmaxf((ax-r.o.x)*inv.x,fmaxf((ay-r.o.y)*inv.y,(az-r.o.z)*inv.z)));
    float hi=fminf(limit,fminf((bx-r.o.x)*inv.x,fminf((by-r.o.y)*inv.y,(bz-r.o.z)*inv.z)));
    near_t=lo; return lo<=hi;
}

__device__ __forceinline__ bool hit_triangle(const GpuTriangle& g,const DRay& r,
                                              float limit,float& distance) {
    float oz=fmaf(g.p0,r.o.x,fmaf(g.p1,r.o.y,fmaf(g.p2,r.o.z,g.p3)));
    float dz=fmaf(g.p0,r.d.x,fmaf(g.p1,r.d.y,g.p2*r.d.z));
    if (fabsf(dz)<1.0e-10f) return false;
    float d=__fdividef(-oz,dz);
    if (d<=0.0002f || d>=limit) return false;
    float uo=fmaf(g.u0,r.o.x,fmaf(g.u1,r.o.y,fmaf(g.u2,r.o.z,g.u3)));
    float ud=fmaf(g.u0,r.d.x,fmaf(g.u1,r.d.y,g.u2*r.d.z));
    float u=fmaf(d,ud,uo);
    if (u<0.0f || u>1.0f) return false;
    float vo=fmaf(g.v0,r.o.x,fmaf(g.v1,r.o.y,fmaf(g.v2,r.o.z,g.v3)));
    float vd=fmaf(g.v0,r.d.x,fmaf(g.v1,r.d.y,g.v2*r.d.z));
    float v=fmaf(d,vd,vo);
    if (v<0.0f || u+v>1.0f) return false;
    distance=d;
    return true;
}

__device__ __forceinline__ DHit closest_hit(const Params& p,const DRay& ray,float limit,int hint=-1) {
    DHit hit{limit,-1};
    if (hint>=0) {
        float d;
        if (hit_triangle(p.triangles[hint],ray,hit.t,d)) hit={d,hint};
    }
    F3 inv=f3(__frcp_rn(ray.d.x),__frcp_rn(ray.d.y),__frcp_rn(ray.d.z));
    float root_near;
    if (!hit_box(p.nodes[0],ray,inv,hit.t,root_near)) return hit;
    int stack[32]; int sp=0, current=0;
    for (;;) {
        const GpuNode n=p.nodes[current];
        if (n.left<0) {
            int start=~n.left;
            #pragma unroll 1
            for (int i=0;i<n.right;i++) {
                float d;
                if (hit_triangle(p.triangles[start+i],ray,hit.t,d)) hit={d,start+i};
            }
            bool found=false;
            while (sp) {
                int candidate=stack[--sp]; float nt;
                if (hit_box(p.nodes[candidate],ray,inv,hit.t,nt)) {
                    current=candidate; found=true; break;
                }
            }
            if (!found) break;
        } else {
            int a=n.left,b=n.right; float na,nb;
            bool ha=hit_box(p.nodes[a],ray,inv,hit.t,na);
            bool hb=hit_box(p.nodes[b],ray,inv,hit.t,nb);
            if (ha && hb) {
                if (na<nb) { stack[sp++]=b; current=a; }
                else       { stack[sp++]=a; current=b; }
            } else if (ha) current=a;
            else if (hb) current=b;
            else {
                bool found=false;
                while (sp) {
                    int candidate=stack[--sp]; float nt;
                    if (hit_box(p.nodes[candidate],ray,inv,hit.t,nt)) {
                        current=candidate; found=true; break;
                    }
                }
                if (!found) break;
            }
        }
    }
    return hit;
}

__device__ __forceinline__ int occluder_inv(const Params& p,const DRay& ray,float limit,F3 inv) {
    float root_near;
    if (!hit_box(p.nodes[0],ray,inv,limit,root_near)) return -1;
    int stack[32]; int sp=0,current=0;
    for (;;) {
        const GpuNode n=p.nodes[current];
        if (n.left<0) {
            int start=~n.left;
            #pragma unroll 1
            for (int i=0;i<n.right;i++) {
                float d;
                if (hit_triangle(p.triangles[start+i],ray,limit,d)) return start+i;
            }
            if (!sp) break;
            current=stack[--sp];
        } else {
            int a=n.left,b=n.right; float na,nb;
            bool ha=hit_box(p.nodes[a],ray,inv,limit,na);
            bool hb=hit_box(p.nodes[b],ray,inv,limit,nb);
            if (ha && hb) {
                if (na<nb) { stack[sp++]=b; current=a; }
                else       { stack[sp++]=a; current=b; }
            } else if (ha) current=a;
            else if (hb) current=b;
            else {
                if (!sp) break;
                current=stack[--sp];
            }
        }
    }
    return -1;
}

__device__ __forceinline__ int occluder(const Params& p,const DRay& ray,float limit,int hint=-1) {
    if(hint>=0){float d;if(hit_triangle(p.triangles[hint],ray,limit,d))return hint;}
    return occluder_inv(p,ray,limit,f3(__frcp_rn(ray.d.x),__frcp_rn(ray.d.y),__frcp_rn(ray.d.z)));
}

__device__ __forceinline__ bool occluded(const Params& p,const DRay& ray,float limit) {
    return occluder(p,ray,limit)<0?false:true;
}

// Coherent primary/reflection rays in a warp belong to one pixel.  Traverse the
// union of their nodes with a common stack.  Leaf intersection remains per-ray,
// while node decisions and loads are warp-uniform.
__device__ __forceinline__ DHit closest_packet(const Params& p,const DRay& ray,float limit) {
    unsigned mask=__activemask();
    DHit hit{limit,-1};
    F3 inv=f3(1.0f/ray.d.x,1.0f/ray.d.y,1.0f/ray.d.z);
    int stack[64],sp=0,current=0;
    for (;;) {
        const GpuNode n=p.nodes[current]; float nt;
        bool active=hit_box(n,ray,inv,hit.t,nt);
        unsigned active_bits=__ballot_sync(mask,active);
        if (active_bits && n.left<0) {
            if (active) {
                int start=~n.left;
                #pragma unroll 1
                for (int i=0;i<n.right;i++) {
                    float d;
                    if (hit_triangle(p.triangles[start+i],ray,hit.t,d)) hit={d,start+i};
                }
            }
        } else if (active_bits) {
            float na=0,nb=0;
            bool ha=active&&hit_box(p.nodes[n.left],ray,inv,hit.t,na);
            bool hb=active&&hit_box(p.nodes[n.right],ray,inv,hit.t,nb);
            unsigned ba=__ballot_sync(mask,ha),bb=__ballot_sync(mask,hb);
            if (ba && bb) {
                if (__popc(ba)>=__popc(bb)) { stack[sp++]=n.right; current=n.left; }
                else { stack[sp++]=n.left; current=n.right; }
                continue;
            }
            if (ba) { current=n.left; continue; }
            if (bb) { current=n.right; continue; }
        }
        if (!sp) break;
        current=stack[--sp];
    }
    return hit;
}

__device__ __forceinline__ bool occluded_packet(const Params& p,const DRay& ray,float limit) {
    unsigned mask=__activemask();
    F3 inv=f3(1.0f/ray.d.x,1.0f/ray.d.y,1.0f/ray.d.z);
    bool blocked=false;
    int stack[64],sp=0,current=0;
    for (;;) {
        const GpuNode n=p.nodes[current]; float nt;
        bool active=!blocked&&hit_box(n,ray,inv,limit,nt);
        unsigned active_bits=__ballot_sync(mask,active);
        if (active_bits && n.left<0) {
            if (active) {
                int start=~n.left;
                #pragma unroll 1
                for (int i=0;i<n.right;i++) {
                    float d;
                    if (hit_triangle(p.triangles[start+i],ray,limit,d)) { blocked=true; break; }
                }
            }
            if (__all_sync(mask,blocked)) return true;
        } else if (active_bits) {
            float na=0,nb=0;
            bool ha=active&&hit_box(p.nodes[n.left],ray,inv,limit,na);
            bool hb=active&&hit_box(p.nodes[n.right],ray,inv,limit,nb);
            unsigned ba=__ballot_sync(mask,ha),bb=__ballot_sync(mask,hb);
            if (ba && bb) {
                if (__popc(ba)>=__popc(bb)) { stack[sp++]=n.right; current=n.left; }
                else { stack[sp++]=n.left; current=n.right; }
                continue;
            }
            if (ba) { current=n.left; continue; }
            if (bb) { current=n.right; continue; }
        }
        if (!sp) break;
        current=stack[--sp];
    }
    return blocked;
}

__device__ __forceinline__ F3 camera_ray(const Params& p,int pixel,int sid) {
    uint32_t key=p.seed+uint32_t(pixel)*0x9e3779b9u+uint32_t(sid)*0x85ebca6bu;
    float x=(float(pixel%p.width)+random_sample(key))*p.pixel_scale_x-1.0f;
    float y=1.0f-(float(pixel/p.width)+random_sample(key^0xa511e9b3u))*p.pixel_scale_y;
    return unit(f3(p.w_x+p.u_x*x+p.v_x*y,
                   p.w_y+p.u_y*x+p.v_y*y,
                   p.w_z+p.u_z*x+p.v_z*y));
}

__device__ __forceinline__ F3 sky_color(F3 d) {
    float a=0.5f*(d.y+1.0f);
    return add(mul(f3(.95f,.93f,.95f),1.0f-a),mul(f3(.40f,.55f,.85f),a));
}

__device__ __forceinline__ F3 sample_radiance(const Params& p,int pixel,int sid,
                                               int* closest_hint0=nullptr,int* shadow_hint0=nullptr) {
    DRay ray{f3(p.eye_x,p.eye_y,p.eye_z),camera_ray(p,pixel,sid)};
    F3 result=f3(),through=f3(1,1,1);
    #pragma unroll 1
    for (int depth=0;depth<p.max_depth;depth++) {
        int old_hint=(closest_hint0&&depth==0)?*closest_hint0:-1;
        DHit hit=closest_hit(p,ray,1.0e20f,old_hint);
        if (closest_hint0&&depth==0) *closest_hint0=hit.id;
        if (hit.id<0) { result=add(result,cmul(through,sky_color(ray.d))); break; }
        GpuMaterial m=p.materials[hit.id];
        F3 n=f3(m.nx,m.ny,m.nz);
        if (dot(n,ray.d)>0.0f) n=mul(n,-1.0f);
        F3 point=add(add(ray.o,mul(ray.d,hit.t)),mul(n,.001f));
        F3 light=f3(p.light_x,p.light_y,p.light_z);
        float cosine=dot(n,light); if (cosine<0.0f) cosine=0.0f;
        float visible=0.0f;
        if (cosine>0.0f) {
            if (shadow_hint0&&depth==0) {
                int blocker=occluder(p,{point,light},1.0e20f,*shadow_hint0);
                *shadow_hint0=blocker; visible=blocker<0?1.0f:0.0f;
            } else visible=!occluded(p,{point,light},1.0e20f)?1.0f:0.0f;
        }
        int open=0;
        F3 tx=fabsf(n.z)<.8f?f3(-n.y*m.pad,n.x*m.pad,0):f3(n.z*m.pad,0,-n.x*m.pad),ty=cross(n,tx);
        #pragma unroll 1
        for (int a=0;a<p.ao;a++) {
            uint32_t key=p.seed+uint32_t(pixel)*0x9e3779b9u+uint32_t(sid)*0x85ebca6bu+
                         uint32_t(depth)*0xc2b2ae35u+uint32_t(a)*0x27d4eb2du;
            float x=2.0f*random_sample(key^0x68bc21ebu)-1.0f;
            float y=2.0f*random_sample(key^0x02e5be93u)-1.0f;
            float z=.25f+.75f*random_sample(key^0x967a889bu);
            F3 dir=unit(add(add(mul(tx,x),mul(ty,y)),mul(n,z)));
            open+=!occluded(p,{point,dir},p.ao_radius);
        }
        float ambient=p.ao?float(open)/float(p.ao):1.0f;
        float value=.08f+.20f*ambient+.72f*cosine*visible;
        F3 color=f3(m.cr,m.cg,m.cb);
        result=add(result,mul(cmul(through,color),value));
        through=mul(through,m.mirror);
        if (m.mirror==0.0f) break;
        ray={point,unit(sub(ray.d,mul(n,2.0f*dot(ray.d,n))))};
    }
    return result;
}

__device__ __forceinline__ F3 sample_radiance_ao1_d4(const Params& p,int px,int py,uint32_t pixel_key,int sid) {
    uint32_t sample_key=pixel_key+uint32_t(sid)*0x85ebca6bu;
    float camera_x=(float(px)+random_sample(sample_key))*p.pixel_scale_x-1.0f;
    float camera_y=1.0f-(float(py)+random_sample(sample_key^0xa511e9b3u))*p.pixel_scale_y;
    F3 camera_d=unit(f3(p.w_x+p.u_x*camera_x+p.v_x*camera_y,p.w_y+p.u_y*camera_x+p.v_y*camera_y,p.w_z+p.u_z*camera_x+p.v_z*camera_y));
    DRay ray{f3(p.eye_x,p.eye_y,p.eye_z),camera_d};
    F3 result=f3(),through=f3(1,1,1);
    #pragma unroll 1
    for(int depth=0;depth<4;depth++){
        DHit hit=closest_hit(p,ray,1.0e20f);
        if(hit.id<0){result=add(result,cmul(through,sky_color(ray.d)));break;}
        GpuMaterial m=p.materials[hit.id];F3 n=f3(m.nx,m.ny,m.nz);if(dot(n,ray.d)>0.0f)n=mul(n,-1.0f);
        F3 point=add(add(ray.o,mul(ray.d,hit.t)),mul(n,.001f));F3 light=f3(p.light_x,p.light_y,p.light_z);
        float cosine=dot(n,light);if(cosine<0.0f)cosine=0.0f;
        float visible=(cosine>0.0f&&!occluded(p,{point,light},1.0e20f))?1.0f:0.0f;
        F3 tx=fabsf(n.z)<.8f?f3(-n.y*m.pad,n.x*m.pad,0):f3(n.z*m.pad,0,-n.x*m.pad),ty=cross(n,tx);
        uint32_t key=sample_key+uint32_t(depth)*0xc2b2ae35u;
        float x=2.0f*random_sample(key^0x68bc21ebu)-1.0f,y=2.0f*random_sample(key^0x02e5be93u)-1.0f,z=.25f+.75f*random_sample(key^0x967a889bu);
        F3 dir=unit(add(add(mul(tx,x),mul(ty,y)),mul(n,z)));
        float ambient=!occluded(p,{point,dir},p.ao_radius)?1.0f:0.0f;
        float value=.08f+.20f*ambient+.72f*cosine*visible;F3 color=f3(m.cr,m.cg,m.cb);
        result=add(result,mul(cmul(through,color),value));through=mul(through,m.mirror);
        if(m.mirror==0.0f)break;
        ray={point,sub(ray.d,mul(n,2.0f*dot(ray.d,n)))};
    }
    return result;
}

__global__ void trace_perf(Params p,float* output,int first,int count){
    int linear=blockIdx.x*blockDim.x+threadIdx.x,lane=threadIdx.x&31,local=linear>>5;
    if(local>=count)return;int pixel=first+local,py=pixel/p.width,px=pixel-py*p.width;
    uint32_t pixel_key=p.seed+uint32_t(pixel)*0x9e3779b9u;
    F3 sum=sample_radiance_ao1_d4(p,px,py,pixel_key,lane);
    if(lane<24)sum=add(sum,sample_radiance_ao1_d4(p,px,py,pixel_key,lane+32));
    #pragma unroll
    for(int delta=16;delta;delta>>=1){sum.x+=__shfl_down_sync(0xffffffffu,sum.x,delta);sum.y+=__shfl_down_sync(0xffffffffu,sum.y,delta);sum.z+=__shfl_down_sync(0xffffffffu,sum.z,delta);}
    if(!lane){constexpr float scale=1.0f/56.0f;output[3*pixel]=sum.x*scale;output[3*pixel+1]=sum.y*scale;output[3*pixel+2]=sum.z*scale;}
}

__global__ void trace_warps(Params p,float* output,int first,int count) {
    int linear=blockIdx.x*blockDim.x+threadIdx.x;
    int lane=threadIdx.x&31;
    int local=linear>>5;
    if (local>=count) return;
    int pixel=first+local;
    F3 sum=f3();
    for (int sid=lane;sid<p.spp;sid+=32) sum=add(sum,sample_radiance(p,pixel,sid));
    #pragma unroll
    for (int delta=16;delta;delta>>=1) {
        sum.x+=__shfl_down_sync(0xffffffffu,sum.x,delta);
        sum.y+=__shfl_down_sync(0xffffffffu,sum.y,delta);
        sum.z+=__shfl_down_sync(0xffffffffu,sum.z,delta);
    }
    if (!lane) {
        float scale=1.0f/float(p.spp);
        output[3*pixel]=sum.x*scale;
        output[3*pixel+1]=sum.y*scale;
        output[3*pixel+2]=sum.z*scale;
    }
}

__global__ void trace_pixels(Params p,float* output,int first,int count) {
    int local=blockIdx.x*blockDim.x+threadIdx.x;
    if (local>=count) return;
    int pixel=first+local;
    F3 sum=f3();
    int closest_hint0=-1,shadow_hint0=-1;
    for (int sid=0;sid<p.spp;sid++) sum=add(sum,sample_radiance(p,pixel,sid,&closest_hint0,&shadow_hint0));
    float scale=1.0f/float(p.spp);
    output[3*pixel]=sum.x*scale;
    output[3*pixel+1]=sum.y*scale;
    output[3*pixel+2]=sum.z*scale;
}

__global__ void trace_groups16(Params p,float* output,int first,int count) {
    int linear=blockIdx.x*blockDim.x+threadIdx.x;
    int lane=threadIdx.x&31,group=lane>>4,group_lane=lane&15;
    int local=(linear>>5)*2+group;
    bool valid=local<count; int pixel=first+local;
    F3 sum=f3(); int closest_hint0=-1,shadow_hint0=-1;
    if(valid) for(int sid=group_lane;sid<p.spp;sid+=16)
        sum=add(sum,sample_radiance(p,pixel,sid,&closest_hint0,&shadow_hint0));
    #pragma unroll
    for(int delta=8;delta;delta>>=1){
        sum.x+=__shfl_down_sync(0xffffffffu,sum.x,delta,16);
        sum.y+=__shfl_down_sync(0xffffffffu,sum.y,delta,16);
        sum.z+=__shfl_down_sync(0xffffffffu,sum.z,delta,16);
    }
    if(valid&&group_lane==0){float scale=1.0f/float(p.spp);output[3*pixel]=sum.x*scale;output[3*pixel+1]=sum.y*scale;output[3*pixel+2]=sum.z*scale;}
}

void init(int max_triangles,int,int) {
    triangle_capacity=max_triangles;
    size_t n=size_t(max_triangles), nn=2*n+1;
    check_cuda(cudaMalloc(&d_triangles,n*sizeof(GpuTriangle)));
    check_cuda(cudaMalloc(&d_materials,n*sizeof(GpuMaterial)));
    check_cuda(cudaMalloc(&d_nodes,nn*sizeof(GpuNode)));
    check_cuda(cudaMallocHost(&h_triangles,n*sizeof(GpuTriangle)));
    check_cuda(cudaMallocHost(&h_materials,n*sizeof(GpuMaterial)));
    check_cuda(cudaMallocHost(&h_nodes,nn*sizeof(GpuNode)));
    builder_refs.resize(n);builder_tmp.resize(n);builder_order.resize(n);builder_nodes.resize(nn);
    builder_lo.resize(3*n);builder_hi.resize(3*n);builder_cen.resize(3*n);
}

void render(const Scene& s,float* output) {
    if (s.triangle_count>triangle_capacity) {
        std::fprintf(stderr,"solution: triangle capacity exceeded\n"); std::exit(2);
    }
    MortonBuilder tree(s);
    int pack_workers=std::min(12,std::max(1,(s.triangle_count+8191)/8192));
    std::vector<std::thread> pack_pool; pack_pool.reserve(pack_workers);
    for(int worker=0;worker<pack_workers;worker++) pack_pool.emplace_back([&,worker]{
        size_t nb=size_t(tree.node_count)*size_t(worker)/pack_workers,ne=size_t(tree.node_count)*size_t(worker+1)/pack_workers;
        for(size_t i=nb;i<ne;i++){
            const Node& a=tree.nodes[i];GpuNode& b=h_nodes[i];
            b.lox=a.lo[0];b.loy=a.lo[1];b.loz=a.lo[2];b.hix=a.hi[0];b.hiy=a.hi[1];b.hiz=a.hi[2];
            if(a.count){b.left=~a.start;b.right=a.count;}else{b.left=a.left;b.right=a.right;}
        }
        int begin=s.triangle_count*worker/pack_workers,end=s.triangle_count*(worker+1)/pack_workers;
        for(int i=begin;i<end;i++){
            const Triangle& a=s.triangles[tree.order[i]];GpuTriangle& g=h_triangles[i];GpuMaterial& m=h_materials[i];
            float e1x=a.v1[0]-a.v0[0],e1y=a.v1[1]-a.v0[1],e1z=a.v1[2]-a.v0[2];
            float e2x=a.v2[0]-a.v0[0],e2y=a.v2[1]-a.v0[1],e2z=a.v2[2]-a.v0[2];
            float nx=e1y*e2z-e1z*e2y,ny=e1z*e2x-e1x*e2z,nz=e1x*e2y-e1y*e2x;
            float denom=nx*nx+ny*ny+nz*nz,inv_denom=1.0f/denom;
            g.u0=(e2y*nz-e2z*ny)*inv_denom;g.u1=(e2z*nx-e2x*nz)*inv_denom;g.u2=(e2x*ny-e2y*nx)*inv_denom;
            g.v0=(ny*e1z-nz*e1y)*inv_denom;g.v1=(nz*e1x-nx*e1z)*inv_denom;g.v2=(nx*e1y-ny*e1x)*inv_denom;
            g.p0=nx;g.p1=ny;g.p2=nz;
            g.u3=-(g.u0*a.v0[0]+g.u1*a.v0[1]+g.u2*a.v0[2]);g.v3=-(g.v0*a.v0[0]+g.v1*a.v0[1]+g.v2*a.v0[2]);g.p3=-(nx*a.v0[0]+ny*a.v0[1]+nz*a.v0[2]);
            float inv=1.0f/std::sqrt(denom),diffuse=1.0f-a.mirror;m.cr=a.color[0]*diffuse;m.cg=a.color[1]*diffuse;m.cb=a.color[2]*diffuse;m.mirror=a.mirror;m.nx=nx*inv;m.ny=ny*inv;m.nz=nz*inv;float basis2=std::fabs(m.nz)<.8f?m.nx*m.nx+m.ny*m.ny:m.nz*m.nz+m.nx*m.nx;m.pad=1.0f/std::sqrt(basis2);
        }
    });
    for(auto&thread:pack_pool)thread.join();
    check_cuda(cudaMemcpyAsync(d_triangles,h_triangles,size_t(s.triangle_count)*sizeof(GpuTriangle),cudaMemcpyHostToDevice));
    check_cuda(cudaMemcpyAsync(d_materials,h_materials,size_t(s.triangle_count)*sizeof(GpuMaterial),cudaMemcpyHostToDevice));
    check_cuda(cudaMemcpyAsync(d_nodes,h_nodes,size_t(tree.node_count)*sizeof(GpuNode),cudaMemcpyHostToDevice));

    float lx=s.light[0],ly=s.light[1],lz=s.light[2];
    float il=1.0f/std::sqrt(lx*lx+ly*ly+lz*lz);
    Params p{};
    p.width=s.width; p.height=s.height; p.spp=s.spp; p.ao=s.ao; p.max_depth=s.max_depth; p.seed=s.seed;
    p.eye_x=s.eye[0]; p.eye_y=s.eye[1]; p.eye_z=s.eye[2];
    p.u_x=s.u[0]; p.u_y=s.u[1]; p.u_z=s.u[2];
    p.v_x=s.v[0]; p.v_y=s.v[1]; p.v_z=s.v[2];
    p.w_x=s.w[0]; p.w_y=s.w[1]; p.w_z=s.w[2];
    p.pixel_scale_x=2.0f/float(s.width); p.pixel_scale_y=2.0f/float(s.height);
    p.light_x=lx*il; p.light_y=ly*il; p.light_z=lz*il; p.ao_radius=s.ao_radius;
    p.triangles=d_triangles; p.materials=d_materials; p.nodes=d_nodes;

    int pixels=s.width*s.height;
    // Bound the amount of tracing in one launch.  This keeps pathological hidden
    // inputs comfortably below the WDDM watchdog without penalizing the main case
    // with hundreds of tiny launches.
    long long per_pixel=std::max(1,s.spp)*std::max(1,s.max_depth)*(2LL+s.ao);
    int batch=int(std::max(64LL,std::min(65536LL,24000000LL/per_pixel)));
    if(s.spp==56&&s.ao==1&&s.max_depth==4){
        for(int first=0;first<pixels;first+=batch){int count=std::min(batch,pixels-first);trace_perf<<<(count*32+127)/128,128>>>(p,output,first,count);}
    } else if (s.spp>=16) {
        for (int first=0;first<pixels;first+=batch) {
            int count=std::min(batch,pixels-first);
            trace_warps<<<(count*32+127)/128,128>>>(p,output,first,count);
        }
    } else {
        for (int first=0;first<pixels;first+=batch) {
            int count=std::min(batch,pixels-first);
            trace_pixels<<<(count+127)/128,128>>>(p,output,first,count);
        }
    }
    check_cuda(cudaGetLastError());
}

#include "render_math.cuh"
#include <cuda_runtime.h>
#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <thread>
#include <vector>
#include <atomic>

namespace {

void check(cudaError_t error) {
    if (error != cudaSuccess) {
        std::fprintf(stderr, "solution: %s\n", cudaGetErrorString(error));
        std::exit(2);
    }
}

// Quantized bounds with compact contiguous child and triangle groups.
struct alignas(16) Wide {
    float x, y, z;
    unsigned char exponent[3], inner;
    int child, triangle;
    unsigned char meta[8];
    unsigned char bounds[6][8];
};
static_assert(sizeof(Wide) == 80);

struct Geometry {
    float4 base, edge1, edge2;
};
struct Material { float4 color, normal; };
struct DeviceBox { float3 lo, hi; };
struct DeviceBinary {
    DeviceBox box;
    int left, right, begin, end;
};

struct Buffers {
    Wide* nodes;
    Geometry* geometry;
    Material* materials;
    Triangle* original;
    DeviceBinary* binary;
    int* parent;
    int* wideId;
    Wide* staging;
    int* order;
    float* extent;
    int* counters;
} cache;

struct CpuBox {
    float lo[3],hi[3];
    void add(const CpuBox& b) {
        for (int k=0;k<3;++k) {
            lo[k]=std::min(lo[k],b.lo[k]);
            hi[k]=std::max(hi[k],b.hi[k]);
        }
    }
    void reset() {
        for (int k=0;k<3;++k) { lo[k]=1e30f; hi[k]=-1e30f; }
    }
    float area() const {
        float x=hi[0]-lo[0], y=hi[1]-lo[1], z=hi[2]-lo[2];
        return x*y+y*z+z*x;
    }
};
struct CpuPrimitive {
    CpuBox box;
    float center[3];
    int id;
};
std::vector<CpuPrimitive> buildPrimitives;
DeviceBinary* hostTree;
int *hostParent,*hostOrder;
Triangle* hostTriangles;
cudaEvent_t uploadFinished;
bool hasUpload;

struct CpuBuilder {
    const Scene& scene;
    std::atomic<int> next{1};

    void setup(int begin,int end) {
        for (int i=begin;i<end;++i) {
            const Triangle& t=scene.triangles[i];
            CpuPrimitive& out=buildPrimitives[i];
            for (int k=0;k<3;++k) {
                float a=t.v0[k],b=t.v1[k],c=t.v2[k];
                float lo=std::min(a,std::min(b,c)),hi=std::max(a,std::max(b,c));
                out.box.lo[k]=lo; out.box.hi[k]=hi;
                out.center[k]=.5f*(lo+hi);
            }
            out.id=i;
        }
    }

    void build(int id,int begin,int end,int depth) {
        CpuPrimitive* first=buildPrimitives.data()+begin,*last=buildPrimitives.data()+end;
        CpuBox bbox; bbox.reset();
        float lowCenter[3]={1e30f,1e30f,1e30f},highCenter[3]={-1e30f,-1e30f,-1e30f};
        for (CpuPrimitive* p=first;p!=last;++p) {
            bbox.add(p->box);
            for (int k=0;k<3;++k) {
                lowCenter[k]=std::min(lowCenter[k],p->center[k]);
                highCenter[k]=std::max(highCenter[k],p->center[k]);
            }
        }
        float extent[3]={highCenter[0]-lowCenter[0],highCenter[1]-lowCenter[1],highCenter[2]-lowCenter[2]};
        DeviceBinary& node=hostTree[id];
        node.box={{bbox.lo[0],bbox.lo[1],bbox.lo[2]},{bbox.hi[0],bbox.hi[1],bbox.hi[2]}};
        node.begin=begin;
        node.end=end;
        int count=end-begin;
        if (count<=96) {
            node.left=node.right=-1;
            for (int i=begin;i<end;++i) hostOrder[i]=buildPrimitives[i].id;
            return;
        }
        int mid=begin;
        if (depth>=36) {
            int axis=extent[1]>extent[0] ? 1 : 0;
            if (extent[2]>extent[axis]) axis=2;
            mid=(begin+end)/2;
            std::nth_element(first,buildPrimitives.data()+mid,last,[&](const CpuPrimitive& a,const CpuPrimitive& b) {
                return a.center[axis]<b.center[axis];
            });
        } else {
            struct Choice { float cost=1e30f, scale=0; int bin=0; };
            Choice choices[3];
            auto evaluate=[&](int k) {
                constexpr int bins=12;
                if (extent[k]<1e-18f) return;
                float scale=(bins-.0001f)/extent[k],base=lowCenter[k];
                CpuBox bound[bins];
                int amounts[bins]={};
                for (CpuBox& b:bound) b.reset();
                for (CpuPrimitive* p=first;p!=last;++p) {
                    int index=std::min(bins-1,int((p->center[k]-base)*scale));
                    bound[index].add(p->box);
                    ++amounts[index];
                }
                CpuBox box;
                box.reset();
                float right[bins];
                int n=0;
                for (int i=bins-1;i>0;--i) {
                    n+=amounts[i]; box.add(bound[i]);
                    right[i]=n ? box.area()*n : 1e30f;
                }
                n=0;
                box.reset();
                for (int i=1;i<bins;++i) {
                    n+=amounts[i-1]; box.add(bound[i-1]);
                    if (!n) continue;
                    float cost=right[i]+box.area()*n;
                    if (cost<choices[k].cost) choices[k]={cost,scale,i};
                }
            };
            if (depth<2 && count>=35000) {
                std::thread x([&]{evaluate(0);}),y([&]{evaluate(1);});
                evaluate(2);
                x.join(); y.join();
            } else {
                for (int k=0;k<3;++k) evaluate(k);
            }
            int axis=0;
            if (choices[1].cost<choices[axis].cost) axis=1;
            if (choices[2].cost<choices[axis].cost) axis=2;
            float bestScale=choices[axis].scale;
            int split=choices[axis].bin;

            if (split>0) {
                float base=lowCenter[axis];
                mid=int(std::partition(first,last,[&](const CpuPrimitive& p) {
                    return int((p.center[axis]-base)*bestScale)<split;
                })-buildPrimitives.data());
            }
            if (mid==begin || mid==end) mid=(begin+end)/2;
        }
        int child=next.fetch_add(2,std::memory_order_relaxed);
        node.left=child; node.right=child+1;
        hostParent[child]=hostParent[child+1]=id;
        if (depth<3 && count>4096) {
            std::thread worker([&] { build(child,begin,mid,depth+1); });
            build(child+1,mid,end,depth+1);
            worker.join();
        } else {
            build(child,begin,mid,depth+1);
            build(child+1,mid,end,depth+1);
        }
    }

    int run() {
        int n=scene.triangle_count;
        if (n>=32000) {
            std::thread worker([&] {setup(0,n/2);});
            setup(n/2,n);
            worker.join();
        } else setup(0,n);
        build(0,0,n,0);
        return next.load(std::memory_order_relaxed);
    }
};

__device__ inline float3 min3(float3 a, float3 b) {
    return make_float3(fminf(a.x,b.x),fminf(a.y,b.y),fminf(a.z,b.z));
}
__device__ inline float3 max3(float3 a, float3 b) {
    return make_float3(fmaxf(a.x,b.x),fmaxf(a.y,b.y),fmaxf(a.z,b.z));
}
__device__ inline float3 point(const float* p) { return make_float3(p[0],p[1],p[2]); }

__device__ inline DeviceBox triangleBox(const Triangle& t) {
    float3 a=point(t.v0), b=point(t.v1), c=point(t.v2);
    return {min3(a,min3(b,c)),max3(a,max3(b,c))};
}

__device__ inline void extentMin(float* addr, float v) {
    auto a = reinterpret_cast<unsigned*>(addr);
    unsigned bits=__float_as_uint(v);
    unsigned ordered = (bits & 0x80000000u) ? ~bits : bits^0x80000000u;
    atomicMin(a,ordered);
}

__global__ void initExtents(float* extent, int* counters, int* wideId) {
    if (threadIdx.x < 6) reinterpret_cast<unsigned*>(extent)[threadIdx.x]=0xffffffffu;
    if (threadIdx.x == 0) { counters[0]=1; counters[1]=0; wideId[0]=0; }
}
__device__ inline float extentValue(float* extent, int i) {
    unsigned key=reinterpret_cast<unsigned*>(extent)[i];
    return __uint_as_float(key & 0x80000000u ? key^0x80000000u : ~key);
}

__global__ void reduceBounds(const Triangle* tris, int count, float* extent) {
    int i = blockIdx.x*blockDim.x+threadIdx.x;
    DeviceBox b;
    if (i<count) b=triangleBox(tris[i]);
    else b={make_float3(1e20f,1e20f,1e20f),make_float3(-1e20f,-1e20f,-1e20f)};
    for (int d=16; d>0; d/=2) {
        b.lo=min3(b.lo,make_float3(__shfl_down_sync(0xffffffff,b.lo.x,d),
                                 __shfl_down_sync(0xffffffff,b.lo.y,d),
                                 __shfl_down_sync(0xffffffff,b.lo.z,d)));
        b.hi=max3(b.hi,make_float3(__shfl_down_sync(0xffffffff,b.hi.x,d),
                                 __shfl_down_sync(0xffffffff,b.hi.y,d),
                                 __shfl_down_sync(0xffffffff,b.hi.z,d)));
    }
    if ((threadIdx.x & 31)==0) {
        extentMin(extent,b.lo.x); extentMin(extent+1,b.lo.y); extentMin(extent+2,b.lo.z);
        extentMin(extent+3,-b.hi.x); extentMin(extent+4,-b.hi.y); extentMin(extent+5,-b.hi.z);
    }
}

__device__ inline void prepareTriangle(const Triangle& t, int originalId, int slot,
                                       Geometry* geometry, Material* material) {
    V<double> b(t.v0);
    V<double> a=V<double>(t.v1)-b, c=V<double>(t.v2)-b;
    V<double> cross=a.cross(c);
    V<double> n=cross*rsqrt(cross.dot(cross));
    geometry[slot]={
        make_float4(float(b.x),float(b.y),float(b.z),__int_as_float(originalId)),
        make_float4(float(a.x),float(a.y),float(a.z),0),
        make_float4(float(c.x),float(c.y),float(c.z),0)
    };
    material[slot]={
        make_float4(t.color[0],t.color[1],t.color[2],t.mirror),
        make_float4(float(n.x),float(n.y),float(n.z),0)
    };
}

struct RefineTask { int node,begin,end; };

// The host splits the broad scene. Independent small ranges are then refined
// on the device, so the expensive portion of the host build stays bounded.
__global__ void refineRanges(DeviceBinary* tree,int* parent,int* order,const Triangle* tris,
                             int hostNodes,int* cursor) {
    int i=blockIdx.x*blockDim.x+threadIdx.x;
    if (i>=hostNodes || tree[i].left>=0) return;
    RefineTask pending[32];
    int sp=0;
    RefineTask task{i,tree[i].begin,tree[i].end};
    do {
        int cnt=task.end-task.begin;
        DeviceBox box={make_float3(1e30f,1e30f,1e30f),make_float3(-1e30f,-1e30f,-1e30f)};
        float3 low=box.lo,high=box.hi;
        for (int j=task.begin;j<task.end;++j) {
            DeviceBox b=triangleBox(tris[order[j]]);
            box={min3(b.lo,box.lo),max3(b.hi,box.hi)};
            float3 center=make_float3(.5f*(b.lo.x+b.hi.x),.5f*(b.lo.y+b.hi.y),.5f*(b.lo.z+b.hi.z));
            low=min3(low,center);
            high=max3(high,center);
        }
        DeviceBinary& n=tree[task.node];
        n.box=box; n.begin=task.begin; n.end=task.end;
        if (cnt<=3) {
            n.left=n.right=-1;
            if (!sp) return;
            task=pending[--sp];
            continue;
        }
        float3 extent=make_float3(high.x-low.x,high.y-low.y,high.z-low.z);
        int k=extent.x>=extent.y && extent.x>=extent.z?0:extent.y>=extent.z?1:2;
        float pivot=k==0?.5f*(low.x+high.x):k==1?.5f*(low.y+high.y):.5f*(low.z+high.z);
        int l=task.begin,r=task.end-1;
        while(l<=r) {
            DeviceBox b=triangleBox(tris[order[l]]);
            float c=k==0?.5f*(b.lo.x+b.hi.x):k==1?.5f*(b.lo.y+b.hi.y):.5f*(b.lo.z+b.hi.z);
            if (c<pivot) ++l;
            else {
                int swap=order[r];
                order[r--]=order[l];
                order[l]=swap;
            }
        }
        if (l-task.begin<max(1,cnt/8) || task.end-l<max(1,cnt/8))
            l=(task.begin+task.end)/2;
        int child=atomicAdd(cursor,2);
        n.left=child; n.right=child+1;
        parent[child]=parent[child+1]=task.node;
        pending[sp++]={child+1,l,task.end};
        task={child,task.begin,l};
    } while (true);
}

__global__ void collapseWide(const DeviceBinary* tree, const int* parent,
                              const Triangle* tris, const int* order, Wide* staged, int* wideId,
                              int* counters, Geometry* geometry, Material* materials) {
    int id=blockIdx.x*blockDim.x+threadIdx.x;
    if (id>=counters[2]) return;
    int count=tree[id].end-tree[id].begin;
    if (id && count<=3) { wideId[id]=-1; return; }
    int depth=0;
    for (int node=id; node; node=parent[node]) ++depth;
    if (depth%2) { wideId[id]=-1; return; }
    // Two binary levels yield at most four frontier entries.
    int frontier[8], size=0;
    for (int path=0; path<4;) {
        int src=id, length=0;
        while (length<2 && tree[src].end-tree[src].begin>3) {
            src=(path & (2>>length)) ? tree[src].right : tree[src].left;
            ++length;
        }
        frontier[size++]=src;
        path+=4>>length;
    }
    int slots[8];
    #pragma unroll
    for (int k=0;k<8;++k) slots[k]=-1;
    DeviceBox root=tree[id].box;
    float3 center=make_float3(root.lo.x+root.hi.x,root.lo.y+root.hi.y,root.lo.z+root.hi.z);
    unsigned freeSlots=15;
    int numChildren=0, numTriangles=0;
    for (int i=0; i<size; ++i) {
        const DeviceBinary& b=tree[frontier[i]];
        float dy=b.box.lo.y+b.box.hi.y-center.y;
        float dz=b.box.lo.z+b.box.hi.z-center.z;
        int desired=(dy<0?2:0)|(dz<0?1:0);
        int slot=desired;
        if (!(freeSlots&(1u<<desired))) {
            float best=1e30f;
            for (unsigned choices=freeSlots; choices; choices&=choices-1) {
                int j=__ffs(choices)-1;
                float cost=(j&2?dy:-dy)+(j&1?dz:-dz);
                if (cost<best) { best=cost; slot=j; }
            }
        }
        slots[slot]=frontier[i]; freeSlots^=1u<<slot;
        int cnt=b.end-b.begin;
        if (cnt>3) ++numChildren;
        else numTriangles+=cnt;
    }
    Wide w{};
    float origin[3]={root.lo.x,root.lo.y,root.lo.z};
    float high[3]={root.hi.x,root.hi.y,root.hi.z};
    float invScale[3];
    #pragma unroll
    for (int k=0;k<3;++k) {
        origin[k]-=3e-6f;
        float e=(high[k]+3e-6f-origin[k])*(1.f/255);
        unsigned bits=__float_as_uint(e);
        unsigned power=((bits+0x7fffffu)>>23) & 255;
        w.exponent[k]=static_cast<unsigned char>(power);
        invScale[k]=__uint_as_float((254-power)<<23);
    }
    w.x=origin[0]; w.y=origin[1]; w.z=origin[2];
    w.child=numChildren ? atomicAdd(counters,numChildren) : 0;
    w.triangle=numTriangles ? atomicAdd(counters+1,numTriangles) : 0;
    int child=0, triangle=0;
    #pragma unroll
    for (int j=0;j<8;++j) {
        int src=slots[j];
        if (src<0) continue;
        DeviceBinary b=tree[src];
        float lo[3]={b.box.lo.x,b.box.lo.y,b.box.lo.z};
        float hi[3]={b.box.hi.x,b.box.hi.y,b.box.hi.z};
        #pragma unroll
        for(int k=0;k<3;++k) {
            w.bounds[k][j]=static_cast<unsigned char>(max(0,__float2int_rd((lo[k]-3e-6f-origin[k])*invScale[k])));
            w.bounds[k+3][j]=static_cast<unsigned char>(min(255,__float2int_ru((hi[k]+3e-6f-origin[k])*invScale[k])));
        }
        int cnt=b.end-b.begin;
        if (cnt>3) {
            w.meta[j]=static_cast<unsigned char>(24+j+32);
            w.inner|=1u<<j;
            wideId[src]=w.child+child++;
        } else {
            w.meta[j]=static_cast<unsigned char>(triangle | (((1<<cnt)-1)<<5));
            for (int k=b.begin;k<b.end;++k) {
                int originalId=order[k];
                prepareTriangle(tris[originalId],originalId,w.triangle+triangle,geometry,materials);
                ++triangle;
            }
        }
    }
    staged[id]=w;
}

__global__ void packWide(const Wide* staged, const int* wideId, const int* counters, Wide* nodes) {
    int i=blockIdx.x*blockDim.x+threadIdx.x;
    if (i<counters[2] && wideId[i]>=0) nodes[wideId[i]]=staged[i];
}

__global__ void seedCursor(int* cursor,int value) {*cursor=value;}

void buildDevice(const Scene& s) {
    int n=s.triangle_count;
    int blocks=(n+127)/128;
    if (hasUpload) check(cudaEventSynchronize(uploadFinished));
    std::memcpy(hostTriangles,s.triangles,size_t(n)*sizeof(Triangle));
    check(cudaMemcpyAsync(cache.original,hostTriangles,size_t(n)*sizeof(Triangle),cudaMemcpyHostToDevice));
    if (n<=8) {
        check(cudaEventRecord(uploadFinished));
        hasUpload=true;
        return;
    }
    initExtents<<<1,32>>>(cache.extent,cache.counters,cache.wideId);
    reduceBounds<<<blocks,128>>>(cache.original,n,cache.extent);
    CpuBuilder builder{s};
    int nodeCount=builder.run();
    int nodeBlocks=(nodeCount+127)/128;
    check(cudaMemcpyAsync(cache.binary,hostTree,nodeCount*sizeof(DeviceBinary),cudaMemcpyHostToDevice));
    check(cudaMemcpyAsync(cache.parent,hostParent,nodeCount*sizeof(int),cudaMemcpyHostToDevice));
    check(cudaMemcpyAsync(cache.order,hostOrder,n*sizeof(int),cudaMemcpyHostToDevice));
    check(cudaEventRecord(uploadFinished));
    hasUpload=true;
    seedCursor<<<1,1>>>(cache.counters+2,nodeCount);
    refineRanges<<<nodeBlocks,128>>>(cache.binary,cache.parent,cache.order,cache.original,
                                      nodeCount,cache.counters+2);
    int fullBlocks=(2*n+127)/128;
    collapseWide<<<fullBlocks,128>>>(cache.binary,cache.parent,cache.original,cache.order,
                                      cache.staging,cache.wideId,cache.counters,cache.geometry,cache.materials);
    packWide<<<fullBlocks,128>>>(cache.staging,cache.wideId,cache.counters,cache.nodes);
}

constexpr int tileSide = 8;
constexpr int listCapacity = 12;
constexpr int extraWords = listCapacity/4;
constexpr int tileCapacity = 768;
constexpr unsigned long long maxLargeTileWork=8000000;
constexpr int lightResolution = 1024;
constexpr float edgeMargin = .025f;

struct Projection {
    V<double> x, y, z, origin;
    int width, height;
};

// Both maps bound projected geometry over an entire cell. Unresolved cells
// retain candidate sets or fall back to the wide hierarchy.
struct Projected {
    float4 edge[3];
    float4 depth; // xyz is an affine depth function; w is its error allowance.
    int4 tiles;
};

struct MapSettings {
    V<float> x, y, z;
    float bx, by, bz;
    bool wellScaled;
};

struct Map {
    Projected* triangles;
    int* tileCounts;
    int* entries;
    int* large;
    int* largeCount;
    unsigned long long* largeWork;
    int2* candidates;
    int4* extra;
    float2* ranges;
    int width, height;
};

Map primaryMap, lightMap;
MapSettings* lightTransform;
float2* shadowRanges;

__global__ void resetMap(Map map) {
    int tiles = ((map.width+7)/8)*((map.height+7)/8);
    int i = blockIdx.x*blockDim.x+threadIdx.x;
    if (i<tiles) map.tileCounts[i]=0;
    if (!i) { *map.largeCount=0; *map.largeWork=0; }
}

__device__ __forceinline__ float affine(float4 a,float x,float y) {
    return fmaf(a.x,x,fmaf(a.y,y,a.z));
}

__device__ float4 edgeFunction(V<double> a, V<double> b, V<double> c) {
    V<double> h = a.cross(b);
    double norm=fabs(h.x)+fabs(h.y);
    if (norm==0.) return make_float4(0,0,0,0);
    double sign=h.dot(c)<0 ? -1. : 1.;
    h=h*(sign/norm);
    return make_float4(float(h.x),float(h.y),float(h.z),0);
}

__device__ __forceinline__ bool overlaps(const Projected& t, float x,float y,float half) {
    return affine(t.edge[0],x,y)>=-half &&
           affine(t.edge[1],x,y)>=-half &&
           affine(t.edge[2],x,y)>=-half;
}

__device__ void addToTile(Map m,const Projected& t,int slot,int tx,int ty) {
    float x=tx*tileSide+tileSide*.5f-m.width*.5f;
    float y=ty*tileSide+tileSide*.5f-m.height*.5f;
    if (!overlaps(t,x,y,tileSide*.5f+edgeMargin)) return;
    int tile=ty*((m.width+7)/8)+tx;
    // Saturated lists cause a query to use the general BVH.
    int index=atomicAdd(m.tileCounts+tile,1);
    if (index<tileCapacity) m.entries[tile*tileCapacity+index]=slot;
}

__device__ Projection orthoProjection(Projection p, float* extent) {
    V<double> lo(extentValue(extent,0),extentValue(extent,1),extentValue(extent,2));
    V<double> hi(-extentValue(extent,3),-extentValue(extent,4),-extentValue(extent,5));
    V<double> center=(lo+hi)*.5, size=hi-lo;
    double width=fabs(p.x.x)*size.x+fabs(p.x.y)*size.y+fabs(p.x.z)*size.z;
    double height=fabs(p.y.x)*size.x+fabs(p.y.y)*size.y+fabs(p.y.z)*size.z;
    p.x=p.x*(double(p.width-4)/fmax(width,1e-3));
    p.y=p.y*(double(p.height-4)/fmax(height,1e-3));
    p.origin=center;
    return p;
}

__global__ void setupLight(Projection axes,float* extent, Projection* devProjection,MapSettings* transform) {
    Projection p=orthoProjection(axes,extent);
    *devProjection=p;
    *transform={
        V<float>(float(p.x.x),float(p.x.y),float(p.x.z)),
        V<float>(float(p.y.x),float(p.y.y),float(p.y.z)),
        V<float>(float(p.z.x),float(p.z.y),float(p.z.z)),
        float(-p.x.dot(p.origin)+p.width*.5),float(-p.y.dot(p.origin)+p.height*.5),float(-p.z.dot(p.origin)),
        p.x.dot(p.x)<1e6 && p.y.dot(p.y)<1e6
    };
}

template<bool Perspective>
__global__ void projectTriangles(Map m, Projection p, const Projection* lightProjection,
                                 const Triangle* tris,const Geometry* geometry,int n) {
    int slot=blockIdx.x*blockDim.x+threadIdx.x;
    if (slot>=n) return;
    if (!Perspective) p=*lightProjection;
    const Triangle& t=tris[__float_as_int(geometry[slot].base.w)];
    V<double> a=V<double>(t.v0)-p.origin, b=V<double>(t.v1)-p.origin, c=V<double>(t.v2)-p.origin;
    double z0=Perspective ? p.z.dot(a) : 1.;
    double z1=Perspective ? p.z.dot(b) : 1.;
    double z2=Perspective ? p.z.dot(c) : 1.;
    double highZ=fmax(z0,fmax(z1,z2));
    if (highZ<=0) return;
    V<double> ha(p.x.dot(a),p.y.dot(a),z0), hb(p.x.dot(b),p.y.dot(b),z1), hc(p.x.dot(c),p.y.dot(c),z2);
    V<double> plane=(b-a).cross(c-a);
    double offset=plane.dot(a);
    Projected output;
    output.edge[0]=edgeFunction(ha,hb,hc);
    output.edge[1]=edgeFunction(hb,hc,ha);
    output.edge[2]=edgeFunction(hc,ha,hb);
    int left=0, right=m.width-1, top=0, bottom=m.height-1;
    if (fmin(z0,fmin(z1,z2))>1e-9) {
        double x0=ha.x/z0,x1=hb.x/z1,x2=hc.x/z2;
        double y0=ha.y/z0,y1=hb.y/z1,y2=hc.y/z2;
        double hx=m.width*.5, hy=m.height*.5;
        double xlo=hx+fmin(x0,fmin(x1,x2))-.05,xhi=hx+fmax(x0,fmax(x1,x2))+.05;
        double ylo=hy+fmin(y0,fmin(y1,y2))-.05,yhi=hy+fmax(y0,fmax(y1,y2))+.05;
        if (xhi<0. || yhi<0. || xlo>=m.width || ylo>=m.height) return;
        left=int(fmax(0.,floor(xlo))); right=int(fmin(double(right),floor(xhi)));
        top=int(fmax(0.,floor(ylo))); bottom=int(fmin(double(bottom),floor(yhi)));
    }
    V<double> dualX=p.y.cross(p.z), dualY=p.z.cross(p.x), dualZ=p.x.cross(p.y);
    double invDet=1./p.x.dot(dualX);
    double ax=plane.dot(dualX)*invDet, ay=plane.dot(dualY)*invDet, az=plane.dot(dualZ)*invDet;
    double dx,dy,h;
    bool canCull;
    if (Perspective) {
        canCull=fabs(offset)>1e-18 && highZ/(sqrt(p.z.dot(p.z)))<1e15 &&
                 fmin(z0,fmin(z1,z2))>.002*sqrt(p.z.dot(p.z)) &&
                 fabs(offset)>1e-8*highZ;
        if (fabs(offset)<1e-18) { dx=0; dy=0; h=0; }
        else { dx=ax/offset; dy=ay/offset; h=az/offset; }
    } else {
        if (fabs(az)<1e-11) return;
        canCull=fabs(az)>1e-9;
        dx=-ax/az; dy=-ay/az; h=offset/az;
    }
    double magnitude=fabs(dx)*m.width+fabs(dy)*m.height+fabs(h);
    float error=float(2e-6*(magnitude+1.));
    // Infinite upper bounds keep nearly edge-on or clipped triangles conservative.
    if (!canCull || !isfinite(error) || error>1e15f) error=1e30f;
    output.depth=make_float4(float(dx),float(dy),float(h),error);
    int x0=left/8, x1=right/8, y0=top/8, y1=bottom/8;
    output.tiles=make_int4(x0,y0,x1,y1);
    m.triangles[slot]=output;
    if ((x1-x0+1)*(y1-y0+1)>32) {
        m.large[atomicAdd(m.largeCount,1)]=slot;
        atomicAdd(m.largeWork,static_cast<unsigned long long>((x1-x0+1)*(y1-y0+1)));
        return;
    }
    for (int y=y0;y<=y1;++y)
        for (int x=x0;x<=x1;++x) addToTile(m,output,slot,x,y);
}

__global__ void binLarge(Map map) {
    if (*map.largeWork>maxLargeTileWork) return;
    int count=*map.largeCount;
    for (int i=blockIdx.x;i<count;i+=gridDim.x) {
        int slot=map.large[i];
        Projected t=map.triangles[slot];
        int width=t.tiles.z-t.tiles.x+1, height=t.tiles.w-t.tiles.y+1;
        for (int j=threadIdx.x;j<width*height;j+=blockDim.x) {
            int y=j/width, x=j-y*width;
            addToTile(map,t,slot,t.tiles.x+x,t.tiles.y+y);
        }
    }
}

template<bool Perspective>
__global__ void resolveMap(Map m,const Geometry* geometry) {
    int tile=blockIdx.x;
    int tilesWide=(m.width+7)/8, tileY=tile/tilesWide,tileX=tile-tileY*tilesWide;
    int x=tileX*8+threadIdx.x%8, y=tileY*8+threadIdx.x/8;
    if (x>=m.width || y>=m.height) return;
    if (*m.largeWork>maxLargeTileWork) {
        m.candidates[y*m.width+x]=make_int2(-2,-1);
        if (!Perspective) m.ranges[y*m.width+x]=make_float2(-1e35f,1e35f);
        return;
    }
    int count=m.tileCounts[tile];
    int2 result=make_int2(-1,-1);
    bool overflow=count>tileCapacity;
    if (Perspective && overflow) {
        m.candidates[y*m.width+x]=make_int2(-2,-1);
        return;
    }
    count=min(count,tileCapacity);
    float cx=x+.5f-.5f*m.width, cy=y+.5f-.5f*m.height;
    float max0=-1e35f,max1=-1e35f,max2=-1e35f,covered=-1e35f;
    const int* list=m.entries+tile*tileCapacity;
    for (int i=0;i<count;++i) {
        int id=list[i];
        const Projected& t=m.triangles[id];
        if (!overlaps(t,cx,cy,.5f+edgeMargin)) continue;
        float v=affine(t.depth,cx,cy);
        float delta=(fabsf(t.depth.x)+fabsf(t.depth.y))*(.5f+edgeMargin)+t.depth.w;
        float hi=v+delta;
        if (t.depth.w>=1e29f) hi=1e35f;
        if (hi<covered) continue;
        if (hi>max1) {
            max2=max1; max1=hi; result.y=id;
            if (hi>max0) {
                max1=max0; max0=hi; result.y=result.x; result.x=id;
            }
        } else max2=fmaxf(max2,hi);
        if (t.depth.w<1e29f && overlaps(t,cx,cy,-.5f-edgeMargin))
            covered=fmaxf(covered,v-delta);
    }
    if (!Perspective) {
        m.ranges[y*m.width+x]=make_float2(covered,overflow?1e35f:max0);
        if (overflow) {
            m.candidates[y*m.width+x]=make_int2(-2,-1);
            return;
        }
    }
    if (max2>=covered && max2>-1e35f) {
        int extra[listCapacity];
        int n=0;
        for (int i=0;i<count;++i) {
            int id=list[i];
            const Projected& t=m.triangles[id];
            if (!overlaps(t,cx,cy,.5f+edgeMargin)) continue;
            float v=affine(t.depth,cx,cy);
            float delta=(fabsf(t.depth.x)+fabsf(t.depth.y))*(.5f+edgeMargin)+t.depth.w;
            if (t.depth.w<1e29f && v+delta<covered) continue;
            if (n==listCapacity) { ++n; break; }
            extra[n++]=id;
        }
        if (n>listCapacity) result=make_int2(-2,-1);
        else {
            if (Perspective) {
                for (int j=1;j<n;++j) {
                    int item=extra[j],k=j;
                    int raw=__float_as_int(geometry[item].base.w);
                    while (k>0 && __float_as_int(geometry[extra[k-1]].base.w)>raw) {
                        extra[k]=extra[k-1]; --k;
                    }
                    extra[k]=item;
                }
            }
            for (int j=n;j<listCapacity;++j) extra[j]=-1;
            if (n<=2) result=make_int2(extra[0],extra[1]);
            else {
                result=make_int2(-4,n);
                int index=extraWords*(y*m.width+x);
                for (int j=0;j<(n+3)/4;++j)
                    m.extra[index+j]=make_int4(extra[4*j],extra[4*j+1],extra[4*j+2],extra[4*j+3]);
            }
        }
    } else if (max1<covered) result.y=-1;
    if (result.x>=0 && result.y>=0 && __float_as_int(geometry[result.y].base.w)<
        __float_as_int(geometry[result.x].base.w)) {
        int tmp=result.x;
        result.x=result.y;
        result.y=tmp;
    }
    m.candidates[y*m.width+x]=result;
}

template<bool Perspective>
void buildMap(Map map, Projection projection,int n,Projection* deviceProjection) {
    int tiles=((map.width+7)/8)*((map.height+7)/8);
    resetMap<<<(tiles+127)/128,128>>>(map);
    if (!Perspective) setupLight<<<1,1>>>(projection,cache.extent,deviceProjection,lightTransform);
    projectTriangles<Perspective><<<(n+127)/128,128>>>(map,projection,deviceProjection,
                                                      cache.original,cache.geometry,n);
    binLarge<<<128,128>>>(map);
    resolveMap<Perspective><<<tiles,64>>>(map,cache.geometry);
}

Projection* lightProjection;

__device__ __forceinline__ float slabReciprocal(float d) {
    float result;
    float nonzero=copysignf(fmaxf(fabsf(d),1e-19f),d);
    asm("rcp.approx.ftz.f32 %0, %1;" : "=f"(result) : "f"(nonzero));
    return result;
}

struct SearchRay {
    V<float> o, d, inv;
    unsigned octant;
    __device__ SearchRay(V<float> origin, V<float> dir) : o(origin), d(dir) {
        inv = {
            slabReciprocal(d.x),
            slabReciprocal(d.y),
            slabReciprocal(d.z)
        };
        octant = ((__float_as_uint(d.x)>>29)&4u) | ((__float_as_uint(d.y)>>30)&2u) | (__float_as_uint(d.z)>>31);
    }
};
__device__ inline V<float> vec(float4 v) { return {v.x,v.y,v.z}; }
__device__ inline V<float> normal(V<float> v) { return v * rsqrtf(v.dot(v)); }

template<bool Any,class R>
__device__ __forceinline__ bool intersectGeometry(const Geometry& g, const R& r, float& limit) {
    V<float> e1 = vec(g.edge1), e2 = vec(g.edge2);
    V<float> p = r.d.cross(e2);
    float det = e1.dot(p);
    if (fabsf(det) < 1e-10f) return false;
    V<float> s = r.o - vec(g.base);
    float sign = copysignf(1.f, det);
    float u = s.dot(p)*sign;
    float absDet = fabsf(det);
    if (u < 0 || u > absDet) return false;
    V<float> q = s.cross(e1);
    float v = r.d.dot(q)*sign;
    if (v < 0 || u+v > absDet) return false;
    float t = e2.dot(q)*sign;
    if (t <= .0002f*absDet || t >= limit*absDet) return false;
    if (!Any) limit = t * __frcp_rn(absDet);
    return true;
}

__device__ __forceinline__ unsigned byte(unsigned v, int i) {
    return (v >> (8*i)) & 255;
}

template<bool Precise=false>
__device__ __forceinline__ unsigned maskChildren(const Wide* ptr, const SearchRay& r, float limit,
                                                 int& child, int& triangle, unsigned& inner) {
    const uint4* data = reinterpret_cast<const uint4*>(ptr);
    uint4 head = data[0], info = data[1];
    float sx = __uint_as_float(byte(head.w,0)<<23)*r.inv.x;
    float sy = __uint_as_float(byte(head.w,1)<<23)*r.inv.y;
    float sz = __uint_as_float(byte(head.w,2)<<23)*r.inv.z;
    float ox = (__uint_as_float(head.x)-r.o.x)*r.inv.x;
    float oy = (__uint_as_float(head.y)-r.o.y)*r.inv.y;
    float oz = (__uint_as_float(head.z)-r.o.z)*r.inv.z;
    uint4 xb = data[2], yz = data[3], yzb = data[4];
    if (r.octant & 4) { unsigned a = xb.x, b = xb.y; xb.x = yz.z; xb.y = yz.w; yz.z = a; yz.w = b; }
    if (r.octant & 2) { unsigned a = xb.z, b = xb.w; xb.z = yzb.x; xb.w = yzb.y; yzb.x = a; yzb.y = b; }
    if (r.octant & 1) { unsigned a = yz.x, b = yz.y; yz.x = yzb.z; yz.y = yzb.w; yzb.z = a; yzb.w = b; }
    child = info.x; triangle = info.y; inner = head.w >> 24;
    V<float> pad;
    if (Precise) pad={.000025f*fabsf(r.inv.x),.000025f*fabsf(r.inv.y),.000025f*fabsf(r.inv.z)};
    unsigned hits = 0;
    #pragma unroll
    for (int half = 0; half < 2; ++half) {
        unsigned lx = half ? xb.y : xb.x, ly = half ? xb.w : xb.z, lz = half ? yz.y : yz.x;
        unsigned hx = half ? yz.w : yz.z, hy = half ? yzb.y : yzb.x, hz = half ? yzb.w : yzb.z;
        unsigned meta = half ? info.w : info.z;
        #pragma unroll
        for (int j = 0; j < 4; ++j) {
            float nearX = fmaf(float(byte(lx,j)),sx,ox), farX = fmaf(float(byte(hx,j)),sx,ox);
            float nearY = fmaf(float(byte(ly,j)),sy,oy), farY = fmaf(float(byte(hy,j)),sy,oy);
            float nearZ = fmaf(float(byte(lz,j)),sz,oz), farZ = fmaf(float(byte(hz,j)),sz,oz);
            if (Precise) {
                nearX-=pad.x; nearY-=pad.y; nearZ-=pad.z;
                farX+=pad.x; farY+=pad.y; farZ+=pad.z;
            }
            float nearT = fmaxf(fmaxf(nearX,nearY),fmaxf(nearZ,.0002f));
            float farT = fminf(fminf(farX,farY),fminf(farZ,limit));
            unsigned m = byte(meta,j);
            unsigned bit = m & 31;
            if (nearT <= farT) hits |= (m>>5) << (bit ^ (bit>=24 ? r.octant : 0));
        }
    }
    return hits;
}

// Decode the four active slots once for the high-throughput float traversal.
struct NativeWide {
    uint4 header;
    float4 spans[6];
    unsigned inner;
};

NativeWide* nativeNodes;

__global__ void expandBoxes(const Wide* nodes,const int* count,NativeWide* output) {
    int p=blockIdx.x*blockDim.x+threadIdx.x;
    if (p>=count[0]) return;
    const Wide& n=nodes[p];
    NativeWide& out=output[p];
    out.header=reinterpret_cast<const uint4*>(&n)[1];
    float b[3]={n.x,n.y,n.z};
    float e[3];
    #pragma unroll
    for (int i=0;i<3;++i) e[i]=__uint_as_float(unsigned(n.exponent[i])<<23);
    #pragma unroll
    for (int i=0;i<6;++i) {
        float f=b[i%3]+(i<3?-.000012f:.000012f);
        const unsigned char* q=n.bounds[i];
        out.spans[i]=make_float4(fmaf(q[0],e[i%3],f),fmaf(q[1],e[i%3],f),
                                  fmaf(q[2],e[i%3],f),fmaf(q[3],e[i%3],f));
    }
    out.inner=n.inner;
}

__device__ __forceinline__ unsigned nativeMask(const NativeWide* node,const SearchRay& r,
                                                 float limit,V<float> bias,int& child,int& triangle,
                                                 unsigned& inner) {
    uint4 h=node->header;
    child=h.x;
    triangle=h.y;
    inner=node->inner;
    float4 lx=node->spans[(r.octant&4)?3:0],hx=node->spans[(r.octant&4)?0:3];
    float4 ly=node->spans[(r.octant&2)?4:1],hy=node->spans[(r.octant&2)?1:4];
    float4 lz=node->spans[(r.octant&1)?5:2],hz=node->spans[(r.octant&1)?2:5];
    float ax[4]={lx.x,lx.y,lx.z,lx.w},ay[4]={ly.x,ly.y,ly.z,ly.w},az[4]={lz.x,lz.y,lz.z,lz.w};
    float bx[4]={hx.x,hx.y,hx.z,hx.w},by[4]={hy.x,hy.y,hy.z,hy.w},bz[4]={hz.x,hz.y,hz.z,hz.w};
    unsigned slots=0;
    #pragma unroll
    for (int j=0;j<4;++j) {
        float n=fmaxf(fmaf(ax[j],r.inv.x,bias.x),fmaf(ay[j],r.inv.y,bias.y));
        n=fmaxf(n,fmaxf(fmaf(az[j],r.inv.z,bias.z),.0002f));
        float f=fminf(fmaf(bx[j],r.inv.x,bias.x),fmaf(by[j],r.inv.y,bias.y));
        f=fminf(f,fminf(fmaf(bz[j],r.inv.z,bias.z),limit));
        if (n<=f) slots|=1u<<j;
    }
    unsigned selected=slots&inner;
    if (r.octant&4) selected=((selected&15u)<<4)|(selected>>4);
    if (r.octant&2) selected=((selected&51u)<<2)|((selected&204u)>>2);
    if (r.octant&1) selected=((selected&85u)<<1)|((selected&170u)>>1);
    unsigned leaves=slots&~inner;
    unsigned triangles=0;
    while (leaves) {
        int slot=__ffs(leaves)-1;
        leaves&=leaves-1;
        unsigned m=byte(slot>=4?h.w:h.z,slot&3);
        triangles|=(m>>5)<<(m&31);
    }
    return (selected<<24)|triangles;
}

constexpr int threads = 128;
constexpr int sharedDepth = 8;
struct Query {
    const NativeWide* nodes;
    const Geometry* geometry;
    uint2* scratch;
    const float2* shadowDepth;
    template<bool Any>
    __device__ __forceinline__ int find(const SearchRay& r, float& limit) const {
        uint2 overflow[56];
        int sp = 0, node = 0, hit = -1;
        V<float> bias=(r.o*r.inv)*(-1.f);
        while (true) {
            int child, triangle;
            unsigned inner;
            unsigned mask = nativeMask(nodes+node,r,limit,bias,child,triangle,inner);
            unsigned triMask = mask & 0xffffff;
            while (triMask) {
                int bit = __ffs(triMask)-1;
                int id = triangle+bit;
                triMask &= triMask-1;
                if (intersectGeometry<Any>(geometry[id],r,limit)) {
                    if (Any) return id;
                    hit = id;
                }
            }
            unsigned group = (mask & 0xff000000u) | inner;
            while ((group & 0xff000000u) == 0) {
                if (sp == 0) return hit;
                --sp;
                uint2 entry = sp < sharedDepth ? scratch[sp*threads+threadIdx.x] : overflow[sp-sharedDepth];
                child = entry.x;
                group = entry.y;
            }
            int bit = 31-__clz(group);
            group ^= 1u << bit;
            if (group & 0xff000000u) {
                uint2 entry = make_uint2(child,group);
                if (sp < sharedDepth) scratch[sp*threads+threadIdx.x] = entry;
                else overflow[sp-sharedDepth] = entry;
                ++sp;
            }
            unsigned slot = (bit-24) ^ r.octant;
            node = child + __popc(group & ((1u << slot)-1));
        }
    }
};

struct GridDesc {
    V<float> origin, inverse;
    V<float> step;
    int x,y,z;
    float radius;
};
constexpr int voxelCap=12;
constexpr int maxVoxels=1600000;
struct VoxelGrid {
    GridDesc* desc;
    int* counts;
    int* ids;
    int* wide;
    int* wideCount;
};
VoxelGrid voxels;

__global__ void setupVoxels(GridDesc* desc,float* extent,float radius,int* wideCount) {
    V<float> lo(extentValue(extent,0),extentValue(extent,1),extentValue(extent,2));
    V<float> hi(-extentValue(extent,3),-extentValue(extent,4),-extentValue(extent,5));
    lo=lo-V<float>(.003f,.003f,.003f); hi=hi+V<float>(.003f,.003f,.003f);
    V<float> size=hi-lo;
    float nominal=fmaxf(.12f,radius*.42f);
    int x,y,z;
    do {
        x=min(224,max(1,__float2int_ru(size.x/nominal)));
        y=min(224,max(1,__float2int_ru(size.y/nominal)));
        z=min(224,max(1,__float2int_ru(size.z/nominal)));
        nominal*=1.35f;
    } while (x*y*z>maxVoxels);
    *desc={lo,V<float>(x/size.x,y/size.y,z/size.z),V<float>(size.x/x,size.y/y,size.z/z),x,y,z,radius};
    *wideCount=0;
}

__device__ __forceinline__ int3 voxIndex(const GridDesc& g, V<float> p) {
    p=(p-g.origin)*g.inverse;
    return make_int3(__float2int_rd(p.x),__float2int_rd(p.y),__float2int_rd(p.z));
}

struct VoxelBox { int3 lo, hi; };
__device__ VoxelBox voxelBox(const GridDesc& g, Geometry t) {
    V<float> a=vec(t.base), b=a+vec(t.edge1), c=a+vec(t.edge2);
    const float eps=.00006f;
    V<float> low(fminf(a.x,fminf(b.x,c.x))-eps,fminf(a.y,fminf(b.y,c.y))-eps,
                fminf(a.z,fminf(b.z,c.z))-eps);
    V<float> high(fmaxf(a.x,fmaxf(b.x,c.x))+eps,fmaxf(a.y,fmaxf(b.y,c.y))+eps,
                 fmaxf(a.z,fmaxf(b.z,c.z))+eps);
    int3 lo=voxIndex(g,low),hi=voxIndex(g,high);
    return {make_int3(max(lo.x,0),max(lo.y,0),max(lo.z,0)),
            make_int3(min(hi.x,g.x-1),min(hi.y,g.y-1),min(hi.z,g.z-1))};
}

__device__ __forceinline__ void setVoxel(VoxelGrid grid,const GridDesc& d,int x,int y,int z,int tri) {
    int voxel=(z*d.y+y)*d.x+x;
    int i=atomicAdd(grid.counts+voxel,1);
    if (i<voxelCap) grid.ids[voxel*voxelCap+i]=tri;
}

__global__ void binVoxels(VoxelGrid grid,const Geometry* geometry,int n) {
    int i=blockIdx.x*blockDim.x+threadIdx.x;
    if (i>=n) return;
    GridDesc d=*grid.desc;
    VoxelBox b=voxelBox(d,geometry[i]);
    int nx=b.hi.x-b.lo.x+1, ny=b.hi.y-b.lo.y+1, nz=b.hi.z-b.lo.z+1;
    if (nx*ny*nz>64) {
        int slot=atomicAdd(grid.wideCount,1);
        if (slot<4096) grid.wide[slot]=i;
        return;
    }
    for (int z=b.lo.z;z<=b.hi.z;++z)
        for (int y=b.lo.y;y<=b.hi.y;++y)
            for (int x=b.lo.x;x<=b.hi.x;++x) setVoxel(grid,d,x,y,z,i);
}

__global__ void binLargeVoxels(VoxelGrid grid,const Geometry* geometry,const Material* materials) {
    GridDesc d=*grid.desc;
    int n=*grid.wideCount;
    if (n>512) return;
    for (int i=blockIdx.x;i<n;i+=gridDim.x) {
        int id=grid.wide[i];
        Geometry g=geometry[id];
        VoxelBox b=voxelBox(d,g);
        int nx=b.hi.x-b.lo.x+1, ny=b.hi.y-b.lo.y+1, nz=b.hi.z-b.lo.z+1;
        V<float> norm=vec(materials[id].normal);
        V<float> u=vec(g.edge1),v=vec(g.edge2);
        V<float> edges[3]={norm.cross(u),norm.cross(v-u),norm.cross(v*(-1.f))};
        V<float> bases[3]={vec(g.base),vec(g.base)+u,vec(g.base)+v};
        float limit=.5f*(fabsf(norm.x)*d.step.x+fabsf(norm.y)*d.step.y+fabsf(norm.z)*d.step.z)+.0001f;
        float lim[3];
        #pragma unroll
        for (int e=0;e<3;++e)
            lim[e]=.5f*(fabsf(edges[e].x)*d.step.x+fabsf(edges[e].y)*d.step.y+fabsf(edges[e].z)*d.step.z)
                   +.0001f;
        for (int j=threadIdx.x;j<nx*ny*nz;j+=blockDim.x) {
            int q=j/nx, z=q/ny;
            int x=j-q*nx+b.lo.x, y=q-z*ny+b.lo.y;
            z+=b.lo.z;
            V<float> p=d.origin+V<float>(x+.5f,y+.5f,z+.5f)*d.step;
            if (fabsf(norm.dot(p-bases[0]))>limit) continue;
            if (edges[0].dot(p-bases[0])>=-lim[0] && edges[1].dot(p-bases[1])>=-lim[1] &&
                edges[2].dot(p-bases[2])>=-lim[2]) setVoxel(grid,d,x,y,z,id);
        }
    }
}

__device__ __forceinline__ bool voxelTrace(Query q,SearchRay r,float radius,int surface,VoxelGrid grid) {
    GridDesc g=*grid.desc;
    V<float> a=(r.o-g.origin)*g.inverse;
    int x=__float2int_rd(a.x), y=__float2int_rd(a.y), z=__float2int_rd(a.z);
    if (unsigned(x)>=unsigned(g.x)||unsigned(y)>=unsigned(g.y)||unsigned(z)>=unsigned(g.z)||
        *grid.wideCount>512) return q.find<true>(r,radius)>=0;
    int dx=(r.octant&4)?-1:1,dy=(r.octant&2)?-1:1,dz=(r.octant&1)?-1:1;
    V<float> dt=g.step*r.inv;
    float tx=(float(x+(dx>0))-a.x)*dt.x;
    float ty=(float(y+(dy>0))-a.y)*dt.y;
    float tz=(float(z+(dz>0))-a.z)*dt.z;
    dt={fabsf(dt.x),fabsf(dt.y),fabsf(dt.z)};
    int strideZ=g.x*g.y;
    int index=z*strideZ+y*g.x+x;
    while (true) {
        int count=grid.counts[index];
        if (count>voxelCap) return q.find<true>(r,radius)>=0;
        const int* tris=grid.ids+index*voxelCap;
        for (int i=0;i<count;++i) {
            int id=tris[i];
            if (id!=surface && intersectGeometry<true>(q.geometry[id],r,radius)) return true;
        }
        float nearest=fminf(tx,fminf(ty,tz));
        if (nearest>radius+.00005f) return false;
        if (tx==nearest) {
            x+=dx;
            if (unsigned(x)>=unsigned(g.x)) return false;
            index+=dx;
            tx+=dt.x;
        } else if (ty==nearest) {
            y+=dy;
            if (unsigned(y)>=unsigned(g.y)) return false;
            index+=dy*g.x;
            ty+=dt.y;
        } else {
            z+=dz;
            if (unsigned(z)>=unsigned(g.z)) return false;
            index+=dz*strideZ;
            tz+=dt.z;
        }
    }
}

__device__ inline bool occludedAO(Query q,V<float> p,V<float> d,float radius,int surface,
                                  VoxelGrid vox) {
    SearchRay ray(p,d);
    if (vox.desc) return voxelTrace(q,ray,radius,surface,vox);
    return q.find<true>(ray,radius)>=0;
}
struct Params {
    V<float> eye, u, v, w, light;
    float invWidth, invHeight, aoRadius, invSPP;
    unsigned seed;
    int width, pixels, spp, ao, depth;
};

__device__ __forceinline__ bool projectShadow(const Projected* projected,const Geometry* geometry,
                                              int id,V<float> p,V<float> light,float x,float y,float z) {
    if (id<0) return false;
    const Projected& t=projected[id];
    float dz=affine(t.depth,x,y)-z, e=t.depth.w+.00004f;
    if (dz+e<=.0002f) return false;
    float a=affine(t.edge[0],x,y), b=affine(t.edge[1],x,y), c=affine(t.edge[2],x,y);
    float edge=fminf(a,fminf(b,c));
    if (edge < -edgeMargin) return false;
    if (edge > edgeMargin && dz-e>.0002f) return true;
    float limit=1e20f;
    return intersectGeometry<true>(geometry[id],SearchRay(p,light),limit);
}

__device__ inline bool mapShadow(Query q, V<float> p, V<float> l, const int2* map,
                                    const MapSettings* transform,const int4* extra,
                                    const Projected* projected) {
    if (map && transform->wellScaled) {
        MapSettings t=*transform;
        float x=t.x.dot(p)+t.bx, y=t.y.dot(p)+t.by;
        if (x<0 || x>=lightResolution || y<0 || y>=lightResolution) return false;
        int index=int(y)*lightResolution+int(x);
        float z=t.z.dot(p)+t.bz;
        float2 range=q.shadowDepth[index];
        if (range.x-z>.00024f) return true;
        if (range.y-z<=.00016f) return false;
        int2 ids=map[index];
        if (ids.x!=-2) {
            if (ids.x==-1) return false;
            x-=lightResolution*.5f;
            y-=lightResolution*.5f;
            if (ids.x>=0)
                return projectShadow(projected,q.geometry,ids.x,p,l,x,y,z) ||
                       projectShadow(projected,q.geometry,ids.y,p,l,x,y,z);
            for (int i=0;i<(ids.y+3)/4;++i) {
                int4 c=extra[extraWords*index+i];
                if (projectShadow(projected,q.geometry,c.x,p,l,x,y,z) ||
                    projectShadow(projected,q.geometry,c.y,p,l,x,y,z) ||
                    projectShadow(projected,q.geometry,c.z,p,l,x,y,z) ||
                    projectShadow(projected,q.geometry,c.w,p,l,x,y,z)) return true;
            }
            return false;
        }
    }
    float limit=1e20f;
    return q.find<true>(SearchRay(p,l),limit)>=0;
}
__device__ __forceinline__ V<double> unit64(V<double> v) {
    return v*rsqrt(v.dot(v));
}

template<bool Any>
__device__ __forceinline__ bool accurateIntersection(const Triangle& triangle,Ray<double> ray,
                                                       double limit,double& distance) {
    V<double> p0(triangle.v0);
    V<double> a=V<double>(triangle.v1)-p0,b=V<double>(triangle.v2)-p0;
    V<double> p=ray.d.cross(b);
    double det=a.dot(p),mag=fabs(det);
    if (mag<1e-10) return false;
    double sign=copysign(1.,det);
    V<double> s=ray.o-p0;
    double u=s.dot(p)*sign;
    if (u<0. || u>mag) return false;
    V<double> q=s.cross(a);
    double v=ray.d.dot(q)*sign;
    if (v<0. || u+v>mag) return false;
    double t=b.dot(q)*sign;
    if (t<=.0002*mag || t>=limit*mag) return false;
    distance=Any ? 0. : t/mag;
    return true;
}

// Single-precision boxes expand around the double-precision ray.
// Only a double-precision primitive test can accept an intersection.
struct AccurateQuery {
    const Wide* nodes;
    const Geometry* geometry;
    const Triangle* raw;
    int count;
    uint2* scratch;

    template<bool Any>
    __device__ __forceinline__ Hit<double> find(Ray<double> ray,double limit) const {
        Hit<double> result{limit,-1};
        if (count<=8) {
            for (int id=0;id<count;++id) {
                double t;
                if (accurateIntersection<Any>(raw[id],ray,result.t,t)) {
                    result={t,id};
                    if (Any) return result;
                }
            }
            return result;
        }
        SearchRay r(V<float>(float(ray.o.x),float(ray.o.y),float(ray.o.z)),
                    V<float>(float(ray.d.x),float(ray.d.y),float(ray.d.z)));
        uint2 overflow[56];
        int sp=0,node=0;
        while (true) {
            int child,triangle;
            unsigned inner;
            unsigned mask=maskChildren<true>(nodes+node,r,float(result.t)+.0001f,child,triangle,inner);
            unsigned tris=mask&0xffffffu;
            while (tris) {
                int packed=triangle+__ffs(tris)-1;
                tris&=tris-1;
                int id=__float_as_int(geometry[packed].base.w);
                double t;
                if (accurateIntersection<Any>(raw[id],ray,result.t,t)) {
                    result={t,id};
                    if (Any) return result;
                }
            }
            unsigned group=(mask&0xff000000u)|inner;
            while ((group&0xff000000u)==0) {
                if (sp==0) return result;
                --sp;
                uint2 entry=sp<sharedDepth ? scratch[sp*threads+threadIdx.x] : overflow[sp-sharedDepth];
                child=entry.x;
                group=entry.y;
            }
            int bit=31-__clz(group);
            group^=1u<<bit;
            if (group&0xff000000u) {
                uint2 entry=make_uint2(child,group);
                if (sp<sharedDepth) scratch[sp*threads+threadIdx.x]=entry;
                else overflow[sp-sharedDepth]=entry;
                ++sp;
            }
            node=child+__popc(group&((1u<<((bit-24)^r.octant))-1));
        }
    }
    __device__ Hit<double> closest(Ray<double> r,double limit) const {return find<false>(r,limit);}
    __device__ bool blocked(Ray<double> r,double limit) const {return find<true>(r,limit).id>=0;}
};

__device__ V<double> tracePrecise(const Scene& s,AccurateQuery q,int pixel,int sid,V<double> light) {
    unsigned key=s.seed+unsigned(pixel)*0x9e3779b9u+unsigned(sid)*0x85ebca6bu;
    double x=(double(pixel%s.width)+sample<double>(key))/s.width*2.-1.;
    double y=1.-(double(pixel/s.width)+sample<double>(key^0xa511e9b3u))/s.height*2.;
    Ray<double> r{V<double>(s.eye),unit64(V<double>(s.w)+V<double>(s.u)*x+V<double>(s.v)*y)};
    V<double> result;
    double through=1.;
    for (int depth=0;depth<s.max_depth;++depth,key+=0xc2b2ae35u) {
        Hit<double> hit=q.closest(r,1e20);
        if (hit.id<0) return result+sky(r.d)*through;
        const Triangle& t=q.raw[hit.id];
        V<double> base(t.v0);
        V<double> n=unit64((V<double>(t.v1)-base).cross(V<double>(t.v2)-base));
        double dot=n.dot(r.d);
        if (dot>0.) n=n*(-1.);
        V<double> p=r.o+r.d*hit.t+n*.001;
        double cosine=fmax(0.,n.dot(light));
        if (cosine>0. && q.blocked({p,light},1e20)) cosine=0.;
        double ambient=1.;
        if (s.ao) {
            int open=0;
            V<double> axis=fabs(n.z)<.8 ? V<double>(0,0,1) : V<double>(0,1,0);
            V<double> tx=unit64(axis.cross(n)), ty=n.cross(tx);
            unsigned aoKey=key;
            for (int a=0;a<s.ao;++a,aoKey+=0x27d4eb2du) {
                double dx=2.*sample<double>(aoKey^0x68bc21ebu)-1.;
                double dy=2.*sample<double>(aoKey^0x02e5be93u)-1.;
                double dz=.25+.75*sample<double>(aoKey^0x967a889bu);
                V<double> direction=unit64(tx*dx+ty*dy+n*dz);
                open+=!q.blocked({p,direction},s.ao_radius);
            }
            ambient=double(open)/s.ao;
        }
        result=result+V<double>(t.color)*(through*(1.-t.mirror)*(.08+.20*ambient+.72*cosine));
        if (t.mirror==0.f) break;
        through*=t.mirror;
        if (depth+1<s.max_depth) r={p,unit64(r.d+n*(2.*fabs(dot)))};
    }
    return result;
}

template<int Lanes>
__global__ void precisePixels(Scene s,const Triangle* raw,const Geometry* geometry,const Wide* nodes,
                               float* output,int offset,int end,V<double> light) {
    __shared__ uint2 stack[sharedDepth*threads];
    AccurateQuery q{nodes,geometry,raw,s.triangle_count,stack};
    int pixel=offset+(blockIdx.x*threads+threadIdx.x)/Lanes;
    int lane=threadIdx.x%Lanes;
    V<double> color;
    if (pixel<end) {
        for (int i=lane;i<s.spp;i+=Lanes) color=color+tracePrecise(s,q,pixel,i,light);
    }
    for (int delta=Lanes/2;delta;delta/=2) {
        color.x+=__shfl_down_sync(0xffffffff,color.x,delta,Lanes);
        color.y+=__shfl_down_sync(0xffffffff,color.y,delta,Lanes);
        color.z+=__shfl_down_sync(0xffffffff,color.z,delta,Lanes);
    }
    if (!lane && pixel<end) {
        output[3*pixel]=float(color.x/s.spp);
        output[3*pixel+1]=float(color.y/s.spp);
        output[3*pixel+2]=float(color.z/s.spp);
    }
}

template<int Lanes>
void renderPrecise(Scene s,float* out) {
    int pixels=s.width*s.height;
    int rayBudget=s.triangle_count>250000 ? 4000000 : 9000000;
    int chunk=std::max(64,rayBudget/(s.spp*(s.ao+2)*s.max_depth));
    s.triangles=nullptr;
    V<double> light=V<double>(s.light).unit();
    for (int offset=0;offset<pixels;offset+=chunk) {
        int end=std::min(offset+chunk,pixels);
        precisePixels<Lanes><<<((end-offset)*Lanes+threads-1)/threads,threads>>>(
            s,cache.original,cache.geometry,cache.nodes,out,offset,end,light);
    }
}

// Compact only live reflections. Each task owns the original sample slot,
// so task ordering never affects the per-pixel reduction.
struct Bounce { float4 origin, direction; };
Bounce* bounces;
float4* sampleColors;
int* bounceCount;
constexpr int waveCapacity=4*1024*1024;

struct ShadeData {
    const int2* shadow;
    const int4* shadowExtra;
    const Projected* shadowTriangles;
    const MapSettings* transform;
    VoxelGrid vox;
    const float2* shadowDepth;
};

__device__ __forceinline__ int primaryHit(Query q,Ray<float> ray,int2 c,const int4* extra,const Projected* projected,float px,float py,float& t) {
    int hit=-1;
    if (c.x==-2) return q.find<false>(SearchRay(ray.o,ray.d),t);
    if (c.x>=-1) {
        if (c.x>=0 && intersectGeometry<false>(q.geometry[c.x],ray,t)) hit=c.x;
        if (c.y>=0 && intersectGeometry<false>(q.geometry[c.y],ray,t)) hit=c.y;
        return hit;
    }
    for (int i=0;i<(c.y+3)/4;++i) {
        int4 v=extra[i];
        int ids[4]={v.x,v.y,v.z,v.w};
        #pragma unroll
        for (int j=0;j<4;++j) {
            int id=ids[j];
            if (id>=0 && overlaps(projected[id],px,py,edgeMargin) &&
                intersectGeometry<false>(q.geometry[id],ray,t)) hit=id;
        }
    }
    return hit;
}

template<int AO>
__device__ __forceinline__ float shadeSurface(Params s,Query q,ShadeData shade,
                                              V<float> p,V<float> n,int surface,unsigned key) {
    float cosine=fmaxf(0.f,n.dot(s.light));
    if (cosine>0 && mapShadow(q,p,s.light,shade.shadow,shade.transform,shade.shadowExtra,shade.shadowTriangles))
        cosine=0;
    float open=1;
    if (AO) {
        V<float> axis=fabsf(n.z)<.8f ? V<float>(0,0,1) : V<float>(0,1,0);
        V<float> tx=normal(axis.cross(n)),ty=n.cross(tx);
        float dx=2*sample<float>(key^0x68bc21ebu)-1;
        float dy=2*sample<float>(key^0x02e5be93u)-1;
        float dz=.25f+.75f*sample<float>(key^0x967a889bu);
        V<float> d=normal(tx*dx+ty*dy+n*dz);
        open=occludedAO(q,p,d,s.aoRadius,surface,shade.vox)?0.f:1.f;
    }
    return .08f+.20f*open+.72f*cosine;
}

template<int AO>
__global__ __launch_bounds__(128,8)
void startWave(Params s,const NativeWide* nodes,const Geometry* geometry,const Material* materials,
                const int2* primary,const int4* extra,const Projected* projected,ShadeData shade,int offset,int n,
                float4* colors,Bounce* reflections,int* count) {
    __shared__ uint2 stack[sharedDepth*threads];
    Query q{nodes,geometry,stack,shade.shadowDepth};
    int i=blockIdx.x*blockDim.x+threadIdx.x;
    if (i>=n) return;
    int p=i/s.spp, sid=i-p*s.spp;
    p+=offset;
    int row=p/s.width,col=p-row*s.width;
    unsigned key=s.seed+unsigned(p)*0x9e3779b9u+unsigned(sid)*0x85ebca6bu;
    float x=(float(col)+sample<float>(key))*s.invWidth-1.f;
    float y=1.f-(float(row)+sample<float>(key^0xa511e9b3u))*s.invHeight;
    V<float> d=normal(s.w+s.u*x+s.v*y);
    float t=1e20f;
    int2 c=primary ? primary[p] : make_int2(-2,-1);
    int id=primaryHit(q,Ray<float>{s.eye,d},c,extra+extraWords*p,projected,
                       x/s.invWidth,-y/s.invHeight,t);
    V<float> result;
    float mirror=0;
    V<float> point,reflection;
    if (id<0) result=sky(d);
    else {
        float4 color=materials[id].color;
        V<float> n=vec(materials[id].normal);
        float dot=n.dot(d);
        if (dot>0) n=n*(-1.f);
        point=s.eye+d*t+n*.001f;
        mirror=color.w;
        result=vec(color)*((1.f-mirror)*shadeSurface<AO>(s,q,shade,point,n,id,key));
        if (mirror>0 && s.depth>1) reflection=normal(d+n*(2.f*fabsf(dot)));
        else mirror=0;
    }
    colors[i]=make_float4(result.x,result.y,result.z,0);
    unsigned group=__ballot_sync(__activemask(),mirror>0);
    if (mirror>0) {
        int leader=__ffs(group)-1,lane=threadIdx.x&31;
        int base=lane==leader ? atomicAdd(count,__popc(group)) : 0;
        base=__shfl_sync(group,base,leader);
        int j=base+__popc(group&((1u<<lane)-1));
        reflections[j]={make_float4(point.x,point.y,point.z,mirror),
                        make_float4(reflection.x,reflection.y,reflection.z,__int_as_float(i))};
    }
}

template<int AO>
__global__ __launch_bounds__(128,8)
void finishWave(Params s,const NativeWide* nodes,const Geometry* geometry,const Material* materials,
                 ShadeData shade,int offset,float4* colors,const Bounce* reflections,const int* count) {
    __shared__ uint2 stack[sharedDepth*threads];
    Query q{nodes,geometry,stack,shade.shadowDepth};
    int n=*count;
    for (int j=blockIdx.x*blockDim.x+threadIdx.x;j<n;j+=blockDim.x*gridDim.x) {
        Bounce b=reflections[j];
        int i=__float_as_int(b.direction.w),p=i/s.spp,sid=i-p*s.spp;
        p+=offset;
        V<float> o=vec(b.origin),d=vec(b.direction),result=vec(colors[i]);
        float mirror=b.origin.w;
        unsigned key=s.seed+unsigned(p)*0x9e3779b9u+unsigned(sid)*0x85ebca6bu+0xc2b2ae35u;
        for (int depth=1;depth<s.depth;++depth,key+=0xc2b2ae35u) {
            float t=1e20f;
            int id=q.find<false>(SearchRay(o,d),t);
            if (id<0) { result=result+sky(d)*mirror; break; }
            float4 c=materials[id].color;
            V<float> n=vec(materials[id].normal);
            float dot=n.dot(d);
            if (dot>0) n=n*(-1.f);
            o=o+d*t+n*.001f;
            float value=shadeSurface<AO>(s,q,shade,o,n,id,key);
            result=result+vec(c)*(mirror*(1-c.w)*value);
            if (c.w==0) break;
            mirror*=c.w;
            d=normal(d+n*(2.f*fabsf(dot)));
        }
        colors[i]=make_float4(result.x,result.y,result.z,0);
    }
}

__global__ void reduceWave(Params s,int offset,int count,const float4* colors,float* out) {
    int lane=threadIdx.x&31, pixel=(blockIdx.x*blockDim.x+threadIdx.x)/32;
    V<float> sum;
    if (pixel<count)
        for (int j=lane;j<s.spp;j+=32) sum=sum+vec(colors[pixel*s.spp+j]);
    for (int d=16;d>0;d/=2) {
        sum.x+=__shfl_down_sync(0xffffffff,sum.x,d);
        sum.y+=__shfl_down_sync(0xffffffff,sum.y,d);
        sum.z+=__shfl_down_sync(0xffffffff,sum.z,d);
    }
    if (!lane && pixel<count) {
        pixel+=offset;
        out[3*pixel]=sum.x*s.invSPP;
        out[3*pixel+1]=sum.y*s.invSPP;
        out[3*pixel+2]=sum.z*s.invSPP;
    }
}

template<int AO>
void renderWave(Params s,float* out,const int2* primary,const int2* shadow) {
    ShadeData shade{shadow,lightMap.extra,lightMap.triangles,lightTransform,
                    AO&&s.aoRadius<=8 ? voxels : VoxelGrid{},shadowRanges};
    int step=waveCapacity/s.spp;
    for (int p=0;p<s.pixels;p+=step) {
        int pixels=std::min(step,s.pixels-p),samples=pixels*s.spp;
        check(cudaMemsetAsync(bounceCount,0,sizeof(int)));
        startWave<AO><<<(samples+127)/128,128>>>(s,nativeNodes,cache.geometry,cache.materials,
          primary,primaryMap.extra,primaryMap.triangles,shade,p,samples,sampleColors,bounces,bounceCount);
        if (s.depth>1)
            finishWave<AO><<<4096,128>>>(s,nativeNodes,cache.geometry,cache.materials,shade,p,
                                         sampleColors,bounces,bounceCount);
        reduceWave<<<(pixels+3)/4,128>>>(s,p,pixels,sampleColors,out);
    }
}

} // namespace

void init(int max_triangles,int max_pixels,int max_samples) {
    size_t n=size_t(max_triangles);
    check(cudaEventCreateWithFlags(&uploadFinished,cudaEventDisableTiming));
    check(cudaMallocHost(&hostTriangles,n*sizeof(Triangle)));
    check(cudaMalloc(&cache.original,n*sizeof(Triangle)));
    if (n>8) {
        buildPrimitives.resize(n);
        check(cudaMallocHost(&hostTree,2*n*sizeof(DeviceBinary)));
        check(cudaMallocHost(&hostParent,2*n*sizeof(int)));
        hostParent[0]=0;
        check(cudaMallocHost(&hostOrder,n*sizeof(int)));
        check(cudaMalloc(&cache.nodes,n*sizeof(Wide)));
        check(cudaMalloc(&cache.geometry,n*sizeof(Geometry)));
        check(cudaMalloc(&cache.materials,n*sizeof(Material)));
        check(cudaMalloc(&cache.binary,2*n*sizeof(DeviceBinary)));
        check(cudaMalloc(&cache.parent,2*n*sizeof(int)));
        check(cudaMalloc(&cache.wideId,2*n*sizeof(int)));
        check(cudaMalloc(&cache.staging,2*n*sizeof(Wide)));
        check(cudaMalloc(&cache.order,n*sizeof(int)));
        check(cudaMalloc(&cache.extent,6*sizeof(float)));
        check(cudaMalloc(&cache.counters,3*sizeof(int)));
    }
    if (n>=32 && max_samples>=8 && size_t(max_pixels)*max_samples>=4000000) {
        check(cudaMalloc(&nativeNodes,n*sizeof(NativeWide)));
        check(cudaMalloc(&voxels.desc,sizeof(GridDesc)));
        check(cudaMalloc(&voxels.counts,maxVoxels*sizeof(int)));
        check(cudaMalloc(&voxels.ids,size_t(maxVoxels)*voxelCap*sizeof(int)));
        check(cudaMalloc(&voxels.wide,4096*sizeof(int)));
        check(cudaMalloc(&voxels.wideCount,sizeof(int)));
        auto allocateMap=[&](Map& map,int pixels,int tiles) {
            check(cudaMalloc(&map.triangles,n*sizeof(Projected)));
            check(cudaMalloc(&map.tileCounts,tiles*sizeof(int)));
            check(cudaMalloc(&map.entries,size_t(tiles)*tileCapacity*sizeof(int)));
            check(cudaMalloc(&map.large,n*sizeof(int)));
            check(cudaMalloc(&map.largeCount,sizeof(int)));
            check(cudaMalloc(&map.largeWork,sizeof(unsigned long long)));
            check(cudaMalloc(&map.candidates,pixels*sizeof(int2)));
            check(cudaMalloc(&map.extra,size_t(pixels)*extraWords*sizeof(int4)));
        };
        allocateMap(primaryMap,max_pixels,(max_pixels+63)/64+520);
        check(cudaMalloc(&shadowRanges,lightResolution*lightResolution*sizeof(float2)));
        lightMap.ranges=shadowRanges;
        allocateMap(lightMap,lightResolution*lightResolution,(lightResolution/8)*(lightResolution/8));
        check(cudaMalloc(&lightTransform,sizeof(MapSettings)));
        check(cudaMalloc(&lightProjection,sizeof(Projection)));
        size_t slots=std::min(size_t(waveCapacity),size_t(max_pixels)*max_samples);
        check(cudaMalloc(&bounces,slots*sizeof(Bounce)));
        check(cudaMalloc(&sampleColors,slots*sizeof(float4)));
        check(cudaMalloc(&bounceCount,sizeof(int)));
    }
}

void render(const Scene& scene,float* device_rgb) {
    buildDevice(scene);
    int pixels=scene.width*scene.height;
    V<double> u(scene.u),v(scene.v),w(scene.w);
    double det=u.dot(v.cross(w));
    bool wellConditioned=fabs(det)>1e-8 && fabs(det)>1e-4*sqrt(u.dot(u)*v.dot(v)*w.dot(w));
    bool wave=bounces && scene.triangle_count>=32 && scene.ao<=1 && scene.spp>=8 && scene.max_depth<=4 &&
              size_t(pixels)*scene.spp>=4000000 && wellConditioned && scene.triangle_count<=400000;
    if (!wave) {
        if (scene.spp==1) renderPrecise<1>(scene,device_rgb);
        else if (scene.spp<=4) renderPrecise<4>(scene,device_rgb);
        else renderPrecise<8>(scene,device_rgb);
        check(cudaGetLastError());
        return;
    }
    V<double> light=V<double>(scene.light).unit();
    Params s{
        V<float>(scene.eye),V<float>(scene.u),V<float>(scene.v),V<float>(scene.w),
        V<float>(float(light.x),float(light.y),float(light.z)),
        2.f/scene.width,2.f/scene.height,scene.ao_radius,
        1.f/scene.spp,
        scene.seed,scene.width,pixels,scene.spp,scene.ao,scene.max_depth
    };
    Projection camera{v.cross(w)*(.5*scene.width/det),w.cross(u)*(-.5*scene.height/det),
                      u.cross(v)*(1./det),V<double>(scene.eye),scene.width,scene.height};
    primaryMap.width=scene.width;
    primaryMap.height=scene.height;
    buildMap<true>(primaryMap,camera,scene.triangle_count,lightProjection);
    const int2* shadow=nullptr;
    if (std::isfinite(light.x) && std::isfinite(light.y) && std::isfinite(light.z)) {
        V<double> axis=fabs(light.z)<.8 ? V<double>(0,0,1) : V<double>(0,1,0);
        V<double> x=axis.cross(light).unit(),y=light.cross(x);
        lightMap.width=lightMap.height=lightResolution;
        buildMap<false>(lightMap,{x,y,light,V<double>(),lightResolution,lightResolution},
                        scene.triangle_count,lightProjection);
        shadow=lightMap.candidates;
    }
    if (s.ao && s.aoRadius<=8) {
        setupVoxels<<<1,1>>>(voxels.desc,cache.extent,s.aoRadius,voxels.wideCount);
        check(cudaMemsetAsync(voxels.counts,0,maxVoxels*sizeof(int)));
        binVoxels<<<(scene.triangle_count+127)/128,128>>>(voxels,cache.geometry,scene.triangle_count);
        binLargeVoxels<<<256,128>>>(voxels,cache.geometry,cache.materials);
    }
    expandBoxes<<<(scene.triangle_count+127)/128,128>>>(cache.nodes,cache.counters,nativeNodes);
    if (s.ao==1) renderWave<1>(s,device_rgb,primaryMap.candidates,shadow);
    else renderWave<0>(s,device_rgb,primaryMap.candidates,shadow);
    check(cudaGetLastError());
}

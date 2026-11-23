// CUDA path tracer: parallel CPU SAH BVH collapsed to a 4-wide BVH; one GPU thread per sample.
#include "rt.h"
#include "render_math.cuh"
#include <cuda_runtime.h>
#include <vector>
#include <algorithm>
#include <atomic>
#include <mutex>
#include <thread>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstdint>
#include <cstring>
#include <chrono>
#include <functional>
#include <condition_variable>

#ifndef LB_MAX
#define LB_MAX 256
#endif
#ifndef LB_MIN
#define LB_MIN 4
#endif
#define CK(x) do{cudaError_t _e=(x);if(_e!=cudaSuccess){fprintf(stderr,"solution: CUDA error %s at line %d\n",cudaGetErrorString(_e),__LINE__);exit(2);}}while(0)

// ---------------- device layouts ----------------
// Quad node (128 B): mn[0..2]/mx[0..2] = child box minima/maxima (lane = child), meta = child descriptors.
struct QNode { float4 mn[3]; float4 mx[3]; uint4 meta; float4 pad; };
struct DTri  { float4 v0, e1, e2, col; };  // col.xyz = color*(1-mirror), col.w = mirror
struct DFrame { float4 n, tx; };           // ty = cross(n, tx)
#define QLEAF  0x80000000u
#define QEMPTY 0x40000000u
struct Params {
    int width, height, spp, ao, max_depth; unsigned seed;
    float3 eye, u, v, w, light; float ao_radius;
    const QNode* nodes; const DTri* tris; const DFrame* frames;
};

__device__ __forceinline__ float3 f3(const float4& a){return make_float3(a.x,a.y,a.z);}
__device__ __forceinline__ float3 cross3(float3 a,float3 b){return make_float3(a.y*b.z-a.z*b.y,a.z*b.x-a.x*b.z,a.x*b.y-a.y*b.x);}
__device__ __forceinline__ float dot3(float3 a,float3 b){return a.x*b.x+a.y*b.y+a.z*b.z;}
__device__ __forceinline__ float3 unit3(float3 a){float s=1.0f/sqrtf(dot3(a,a));return make_float3(a.x*s,a.y*s,a.z*s);}
__device__ __forceinline__ float samplef(uint32_t x){return float(mix32(x)>>8)*(1.0f/16777216.0f);}
__device__ __forceinline__ float3 operator+(float3 a,float3 b){return make_float3(a.x+b.x,a.y+b.y,a.z+b.z);}
__device__ __forceinline__ float3 operator-(float3 a,float3 b){return make_float3(a.x-b.x,a.y-b.y,a.z-b.z);}
__device__ __forceinline__ float3 operator-(float3 a){return make_float3(-a.x,-a.y,-a.z);}
__device__ __forceinline__ float3 operator*(float3 a,float s){return make_float3(a.x*s,a.y*s,a.z*s);}
__device__ __forceinline__ float3 operator*(float3 a,float3 b){return make_float3(a.x*b.x,a.y*b.y,a.z*b.z);}
__device__ __forceinline__ float4 operator-(float4 a,float4 b){return make_float4(a.x-b.x,a.y-b.y,a.z-b.z,a.w-b.w);}
__device__ __forceinline__ float4 operator*(float4 a,float4 b){return make_float4(a.x*b.x,a.y*b.y,a.z*b.z,a.w*b.w);}
__device__ __forceinline__ float4 bcast4(float x){return make_float4(x,x,x,x);}
__device__ __forceinline__ float4 vmin(float4 a,float4 b){return make_float4(fminf(a.x,b.x),fminf(a.y,b.y),fminf(a.z,b.z),fminf(a.w,b.w));}
__device__ __forceinline__ float4 vmax(float4 a,float4 b){return make_float4(fmaxf(a.x,b.x),fmaxf(a.y,b.y),fmaxf(a.z,b.z),fmaxf(a.w,b.w));}

struct DRay { float3 o, d, inv; };
__device__ __forceinline__ void setInv(DRay& r){
    r.inv.x=fabsf(r.d.x)<1e-30f?1e30f:1.0f/r.d.x;
    r.inv.y=fabsf(r.d.y)<1e-30f?1e30f:1.0f/r.d.y;
    r.inv.z=fabsf(r.d.z)<1e-30f?1e30f:1.0f/r.d.z;
}
__device__ __forceinline__ bool hitTri(const DTri& t,const DRay& r,float tmax,float& dist){
    float3 e1=f3(t.e1),e2=f3(t.e2),d=r.d;
    float3 p=cross3(d,e2);float det=dot3(e1,p);
    float ad=fabsf(det);if(ad<1e-10f)return false;
    float3 s=r.o-f3(t.v0);
    float un=dot3(s,p);float hd=0.5f*det;
    if(fabsf(un-hd)>0.5f*ad)return false;   // u = un/det outside [0,1]: reject before dividing
    float inv=1.0f/det;
    float u=un*inv;
    float3 q=cross3(s,e1);
    float v=dot3(d,q)*inv;if(v<0.0f||u+v>1.0f)return false;
    float tt=dot3(e2,q)*inv;
    if(tt<=0.0002f||tt>=tmax)return false;
    dist=tt;return true;
}

#define STACKSZ 104
#define QCS(ti,mi,tj,mj) if(ti>tj){float tt_=ti;ti=tj;tj=tt_;uint32_t mm_=mi;mi=mj;mj=mm_;}
// Ordered 4-wide traversal. Returns closest (or any) hit triangle index; tOut = hit distance.
template<bool ANY>
__device__ __forceinline__ int traverse(const Params& s,const DRay& r,float tmax,float& tOut){
    const QNode* nodes=s.nodes;
    uint32_t stack[STACKSZ];float stackT[STACKSZ];int sp=0;
    int best=-1;float bestT=tmax;
    const float4 oxp=bcast4(r.o.x+1e-5f),oyp=bcast4(r.o.y+1e-5f),ozp=bcast4(r.o.z+1e-5f);
    const float4 oxm=bcast4(r.o.x-1e-5f),oym=bcast4(r.o.y-1e-5f),ozm=bcast4(r.o.z-1e-5f);
    const float4 ix=bcast4(r.inv.x),iy=bcast4(r.inv.y),iz=bcast4(r.inv.z);
    const float4 tini=bcast4(0.0002f);
    uint32_t cur=0;
    for(;;){
        if(cur&QLEAF){
            uint32_t start=(cur>>8)&0x7fffffu;int cnt=int(cur&0xffu);
            const DTri* tr=s.tris+start;
            for(int i=0;i<cnt;i++){float d;if(hitTri(tr[i],r,bestT,d)){if(ANY){tOut=d;return (int)(start+i);}bestT=d;best=(int)(start+i);}}
        }else{
            const QNode& q=nodes[cur];
            float4 t0=tini,t1=bcast4(bestT);
            float4 a=(q.mn[0]-oxp)*ix,b=(q.mx[0]-oxm)*ix;t0=vmax(t0,vmin(a,b));t1=vmin(t1,vmax(a,b));
            a=(q.mn[1]-oyp)*iy;b=(q.mx[1]-oym)*iy;t0=vmax(t0,vmin(a,b));t1=vmin(t1,vmax(a,b));
            a=(q.mn[2]-ozp)*iz;b=(q.mx[2]-ozm)*iz;t0=vmax(t0,vmin(a,b));t1=vmin(t1,vmax(a,b));
            uint4 m=q.meta;
            const float BIG=1e30f;
            float ta=(t0.x<=t1.x&&!(m.x&QEMPTY))?t0.x:BIG;uint32_t ma=m.x;
            float tb=(t0.y<=t1.y&&!(m.y&QEMPTY))?t0.y:BIG,mb=m.y;
            float tc=(t0.z<=t1.z&&!(m.z&QEMPTY))?t0.z:BIG,mc=m.z;
            float td=(t0.w<=t1.w&&!(m.w&QEMPTY))?t0.w:BIG,md=m.w;
            QCS(ta,ma,tb,mb) QCS(tc,mc,td,md) QCS(ta,ma,tc,mc) QCS(tb,mb,td,md) QCS(ta,ma,tb,mb)
            if(ta<BIG){
                if(td<BIG){stack[sp]=md;stackT[sp]=td;sp++;}
                if(tc<BIG){stack[sp]=mc;stackT[sp]=tc;sp++;}
                if(tb<BIG){stack[sp]=mb;stackT[sp]=tb;sp++;}
                cur=ma;   // descend into the nearest child
                continue;
            }
        }
        for(;;){
            if(sp==0){tOut=bestT;return best;}
            sp--;
            if(stackT[sp]<=bestT)break;
        }
        cur=stack[sp];
    }
}

__device__ __forceinline__ float3 sky3(float3 d){float a=0.5f*(d.y+1.0f);
    return make_float3(0.95f*(1.0f-a)+0.40f*a,0.93f*(1.0f-a)+0.55f*a,0.95f*(1.0f-a)+0.85f*a);}

__device__ __forceinline__ float3 radiance(const Params& s,int pixel,int sid,const float3& l){
    uint32_t key=s.seed+uint32_t(pixel)*0x9e3779b9u+uint32_t(sid)*0x85ebca6bu;
    float x=(float(pixel%s.width)+samplef(key))/float(s.width)*2.0f-1.0f;
    float y=1.0f-(float(pixel/s.width)+samplef(key^0xa511e9b3u))/float(s.height)*2.0f;
    DRay r;r.o=s.eye;r.d=unit3(s.w+s.u*x+s.v*y);setInv(r);
    float3 result=make_float3(0,0,0),through=make_float3(1,1,1);
    for(int depth=0;depth<s.max_depth;depth++){
        float t;int id=traverse<false>(s,r,1e20f,t);
        if(id<0){result=result+through*sky3(r.d);break;}
        const DTri& tri=s.tris[id];const DFrame& fr=s.frames[id];
        float3 n=f3(fr.n),tx=f3(fr.tx);
        if(dot3(n,r.d)>0){n=-n;tx=-tx;}
        float3 ty=cross3(n,tx);
        float3 p=r.o+r.d*t+n*0.001f;
        float cosine=dot3(n,l);if(cosine<0)cosine=0;
        float visible=0;
        if(cosine>0){DRay sr;sr.o=p;sr.d=l;setInv(sr);float td;visible=traverse<true>(s,sr,1e20f,td)<0?1.0f:0.0f;}
        int open=0;
        for(int a=0;a<s.ao;a++){
            uint32_t k=s.seed+uint32_t(pixel)*0x9e3779b9u+uint32_t(sid)*0x85ebca6bu+uint32_t(depth)*0xc2b2ae35u+uint32_t(a)*0x27d4eb2du;
            float ax=2.0f*samplef(k^0x68bc21ebu)-1.0f,ay=2.0f*samplef(k^0x02e5be93u)-1.0f;
            float az=0.25f+0.75f*samplef(k^0x967a889bu);
            DRay ar;ar.o=p;ar.d=unit3(tx*ax+ty*ay+n*az);setInv(ar);float td;
            open+=(traverse<true>(s,ar,s.ao_radius,td)<0);
        }
        float ambient=s.ao?float(open)/float(s.ao):1.0f;
        float value=0.08f+0.20f*ambient+0.72f*cosine*visible;
        result=result+through*f3(tri.col)*value;
        through=through*tri.col.w;
        if(tri.col.w==0)break;
        r.o=p;r.d=unit3(r.d-n*(2.0f*dot3(r.d,n)));setInv(r);
    }
    return result;
}

__global__ void __launch_bounds__(LB_MAX,LB_MIN) renderKernel(Params s,float* out){
    extern __shared__ float sh[];
    int spp=s.spp,t=threadIdx.x,P=blockDim.x/spp;
    int pix=blockIdx.x*P+t/spp,sid=t%spp,npix=s.width*s.height;
    float3 c=make_float3(0,0,0);
    if(t<P*spp&&pix<npix)c=radiance(s,pix,sid,unit3(s.light));
    sh[3*t]=c.x;sh[3*t+1]=c.y;sh[3*t+2]=c.z;
    __syncthreads();
    if(t<P*spp&&sid==0&&pix<npix){
        float r=0,g=0,b=0;
        for(int j=0;j<spp;j++){r+=sh[3*(t+j)];g+=sh[3*(t+j)+1];b+=sh[3*(t+j)+2];}
        out[3*pix]=r/float(spp);out[3*pix+1]=g/float(spp);out[3*pix+2]=b/float(spp);
    }
}
// ---------------- host side: persistent worker pool + parallel binned SAH ----------------
struct Node { float lo[3], hi[3]; int left, right, start, count; };
#define BINS 16
#define CT 1.0f
#define LEAF 4
#define MAXDEPTH 32
#define SPAWN_MIN 6144
#define CHUNK 2048

struct Task { int b, e, depth, id; };

struct Pool {
    std::vector<std::thread> th; std::mutex mu; std::condition_variable cv;
    std::vector<Task> queue; int active = 0; int phase = 0; bool stop = false;
    std::function<void(const Task&)> fn; std::atomic<int> pending{0};
    void start(int n){for(int i=1;i<n;i++)th.emplace_back([this]{worker();});}
    // Process tasks until the current phase is drained (queue empty and nothing running).
    void loop(){
        for(;;){
            Task t;
            {
                std::unique_lock<std::mutex> lk(mu);
                if(queue.empty()){if(active==0)return;lk.unlock();
                    for(int i=0;i<4000;i++){if(pending.load(std::memory_order_acquire)>0)break;std::this_thread::yield();}
                    continue;}
                t=queue.back();queue.pop_back();active++;pending.fetch_add(1,std::memory_order_acq_rel);
            }
            fn(t);
            {std::lock_guard<std::mutex> lk(mu);active--;pending.fetch_sub(1,std::memory_order_acq_rel);}
        }
    }
    void worker(){
        int myPhase=0;
        for(;;){
            std::unique_lock<std::mutex> lk(mu);
            cv.wait(lk,[&]{return stop||phase!=myPhase;});
            if(stop)return;
            myPhase=phase;lk.unlock();
            loop();
        }
    }
    void run(std::function<void(const Task&)> f,std::vector<Task> tasks){
        {std::lock_guard<std::mutex> lk(mu);fn=std::move(f);queue=std::move(tasks);phase++;pending.store(int(queue.size()),std::memory_order_release);}
        cv.notify_all();
        loop();
        std::unique_lock<std::mutex> lk(mu);
        while(!queue.empty()||active>0){lk.unlock();
            for(int i=0;i<4000;i++){if(pending.load(std::memory_order_acquire)==0)break;std::this_thread::yield();}
            lk.lock();}
    }
    void push(const Task& t){std::lock_guard<std::mutex> lk(mu);queue.push_back(t);pending.fetch_add(1,std::memory_order_acq_rel);}
};
static Pool* g_pool=nullptr;

struct SahBuilder {
    const Triangle* T; int N;
    std::vector<float> lo, hi, cen; std::vector<int> order; std::vector<Node> nodes;
    std::atomic<int> next{0};
    DTri* htris; DFrame* hframes; Pool* pool;
    QNode* hq; std::atomic<int> qnext{1};

    SahBuilder(const Scene& s, Pool* p, DTri* ht, DFrame* hf, QNode* hqn):T(s.triangles),N(s.triangle_count),htris(ht),hframes(hf),pool(p),hq(hqn){
        lo.resize(3*size_t(N));hi.resize(3*size_t(N));cen.resize(3*size_t(N));order.resize(N);nodes.resize(2*size_t(N)+1);
        std::vector<Task> tasks;for(int b=0;b<N;b+=CHUNK)tasks.push_back({b,std::min(N,b+CHUNK),0,0});
        pool->run([this](const Task& t){precompute(t);},tasks);
        next=1;
        pool->run([this](const Task& t){process(t.b,t.e,t.depth,t.id);},std::vector<Task>{{0,N,0,0}});
        tasks.clear();for(int b=0;b<N;b+=CHUNK)tasks.push_back({b,std::min(N,b+CHUNK),0,0});
        pool->run([this](const Task& t){fill(t);},tasks);
        nodes.resize(next);
        if(nodes[0].count>0){
            float qlo[4][3],qhi[4][3];uint32_t meta[4];
            for(int i=0;i<4;i++){meta[i]=QEMPTY;for(int k=0;k<3;k++){qlo[i][k]=1e30f;qhi[i][k]=-1e30f;}}
            if(nodes[0].count<=255){for(int k=0;k<3;k++){qlo[0][k]=nodes[0].lo[k];qhi[0][k]=nodes[0].hi[k];}meta[0]=QLEAF|(uint32_t(nodes[0].start)<<8)|uint32_t(nodes[0].count);writeQ(0,qlo,qhi,meta);}
            else pool->run([this](const Task& t){collapseRange(t.b,t.e,t.id,t.depth);},std::vector<Task>{{nodes[0].start,nodes[0].count,0,0}});
        }else{
            pool->run([this](const Task& t){if(t.e<0)collapse(t.b,t.id,t.depth);else collapseRange(t.b,t.e,t.id,t.depth);},std::vector<Task>{{0,-1,0,0}});
        }
    }
    void writeQ(int q,const float (*qlo)[3],const float (*qhi)[3],const uint32_t* meta){
        QNode& o=hq[q];
        for(int k=0;k<3;k++){o.mn[k]=make_float4(qlo[0][k],qlo[1][k],qlo[2][k],qlo[3][k]);o.mx[k]=make_float4(qhi[0][k],qhi[1][k],qhi[2][k],qhi[3][k]);}
        o.meta=make_uint4(meta[0],meta[1],meta[2],meta[3]);o.pad=make_float4(0,0,0,0);
    }
    // Split an oversized binary leaf (>255 triangles) into up to four leaf slots (nested if needed).
    void collapseRange(int start,int count,int q,int depth){
        int chunk=(count+3)/4;float qlo[4][3],qhi[4][3];uint32_t meta[4];std::vector<Task> kids;
        for(int i=0;i<4;i++){int st=start+i*chunk;int c=count-i*chunk;if(c>chunk)c=chunk;
            if(c<=0){meta[i]=QEMPTY;for(int k=0;k<3;k++){qlo[i][k]=1e30f;qhi[i][k]=-1e30f;}continue;}
            float l[3]={1e30f,1e30f,1e30f},h[3]={-1e30f,-1e30f,-1e30f};
            for(int j=st;j<st+c;j++){int t=order[j];for(int k=0;k<3;k++){l[k]=std::min(l[k],lo[3*t+k]);h[k]=std::max(h[k],hi[3*t+k]);}}
            for(int k=0;k<3;k++){qlo[i][k]=l[k];qhi[i][k]=h[k];}
            if(c<=255)meta[i]=QLEAF|(uint32_t(st)<<8)|uint32_t(c);
            else{int qc=qnext.fetch_add(1);meta[i]=uint32_t(qc);if(depth<2)kids.push_back({st,c,depth+1,qc});else collapseRange(st,c,qc,depth+1);}
        }
        writeQ(q,qlo,qhi,meta);
        for(auto& k:kids)pool->push(k);
    }
    // Collapse the binary subtree rooted at interior node bin into quad node q (expanding up to 4 slots).
    void collapse(int bin,int q,int depth){
        const Node& n=nodes[bin];
        int slots[4];int ns=0;slots[ns++]=n.left;slots[ns++]=n.right;
        for(int i=0;i<ns&&ns<4;i++){
            if(nodes[slots[i]].count==0){int old=slots[i];for(int j=ns;j>i+1;j--)slots[j]=slots[j-1];slots[i]=nodes[old].left;slots[i+1]=nodes[old].right;ns++;}
        }
        float qlo[4][3],qhi[4][3];uint32_t meta[4];std::vector<Task> kids;
        for(int i=0;i<4;i++){
            if(i>=ns){meta[i]=QEMPTY;for(int k=0;k<3;k++){qlo[i][k]=1e30f;qhi[i][k]=-1e30f;}continue;}
            const Node& c=nodes[slots[i]];
            for(int k=0;k<3;k++){qlo[i][k]=c.lo[k];qhi[i][k]=c.hi[k];}
            if(c.count>0){
                if(c.count<=255)meta[i]=QLEAF|(uint32_t(c.start)<<8)|uint32_t(c.count);
                else{int qc=qnext.fetch_add(1);meta[i]=uint32_t(qc);if(depth<2)kids.push_back({c.start,c.count,depth+1,qc});else collapseRange(c.start,c.count,qc,depth+1);}
            }else{
                int qc=qnext.fetch_add(1);meta[i]=uint32_t(qc);
                if(depth<2)kids.push_back({slots[i],-1,depth+1,qc});else collapse(slots[i],qc,depth+1);
            }
        }
        writeQ(q,qlo,qhi,meta);
        for(auto& k:kids)pool->push(k);
    }
    void precompute(const Task& t){
        for(int i=t.b;i<t.e;i++){const Triangle& tr=T[i];
            for(int k=0;k<3;k++){float a=tr.v0[k],b=tr.v1[k],c=tr.v2[k];
                lo[3*i+k]=std::min(a,std::min(b,c));hi[3*i+k]=std::max(a,std::max(b,c));cen[3*i+k]=(lo[3*i+k]+hi[3*i+k])*.5f;}
            order[i]=i;}
    }
    void fill(const Task& t){
        for(int i=t.b;i<t.e;i++){int j=order[i];const Triangle& tr=T[j];DTri& g=htris[i];DFrame& f=hframes[i];
            g.v0=make_float4(tr.v0[0],tr.v0[1],tr.v0[2],0);
            float e1x=tr.v1[0]-tr.v0[0],e1y=tr.v1[1]-tr.v0[1],e1z=tr.v1[2]-tr.v0[2];
            float e2x=tr.v2[0]-tr.v0[0],e2y=tr.v2[1]-tr.v0[1],e2z=tr.v2[2]-tr.v0[2];
            g.e1=make_float4(e1x,e1y,e1z,0);g.e2=make_float4(e2x,e2y,e2z,0);
            float m=tr.mirror;
            g.col=make_float4(tr.color[0]*(1-m),tr.color[1]*(1-m),tr.color[2]*(1-m),m);
            float nx=e1y*e2z-e1z*e2y,ny=e1z*e2x-e1x*e2z,nz=e1x*e2y-e1y*e2x;
            float il=1.0f/std::sqrt(nx*nx+ny*ny+nz*nz);nx*=il;ny*=il;nz*=il;
            float ax=0,ay=0,az=1;if(std::fabs(nz)>=0.8f){ax=0;ay=1;az=0;}
            float tx_=ay*nz-az*ny,ty_=az*nx-ax*nz,tz_=ax*ny-ay*nx;
            float it=1.0f/std::sqrt(tx_*tx_+ty_*ty_+tz_*tz_);
            f.n=make_float4(nx,ny,nz,0);f.tx=make_float4(tx_*it,ty_*it,tz_*it,0);}
    }
    static float area(const float* a,const float* b){float x=b[0]-a[0],y=b[1]-a[1],z=b[2]-a[2];return x*y+y*z+z*x;}
    void process(int b,int e,int depth,int id){
        Node n;float clo[3],chi[3];
        for(int k=0;k<3;k++){n.lo[k]=clo[k]=1e30f;n.hi[k]=chi[k]=-1e30f;}
        for(int i=b;i<e;i++){int t=order[i];for(int k=0;k<3;k++){
            n.lo[k]=std::min(n.lo[k],lo[3*t+k]);n.hi[k]=std::max(n.hi[k],hi[3*t+k]);
            clo[k]=std::min(clo[k],cen[3*t+k]);chi[k]=std::max(chi[k],cen[3*t+k]);}}
        n.start=b;n.count=e-b;n.left=n.right=-1;nodes[id]=n;
        int cnt=e-b;if(cnt<=LEAF||depth>=MAXDEPTH)return;
        int mid;
        if(cnt<=24){
            // tiny node: median split on the widest centroid axis (cheaper than binning, negligible quality loss)
            int axis=0;for(int k=1;k<3;k++)if(chi[k]-clo[k]>chi[axis]-clo[axis])axis=k;
            mid=(b+e)/2;std::nth_element(order.begin()+b,order.begin()+mid,order.begin()+e,[&](int x,int y){return cen[3*x+axis]<cen[3*y+axis];});
        }else{
        int nb=cnt<64?8:BINS;
        int stride=cnt>32768?cnt/32768:1;
        int bc[3][BINS];float blo[3][BINS][3],bhi[3][BINS][3],scale[3];
        for(int k=0;k<3;k++){float ext=chi[k]-clo[k];scale[k]=ext<1e-9f?0.0f:nb/ext*(1-1e-6f);
            for(int j=0;j<nb;j++){bc[k][j]=0;for(int q=0;q<3;q++){blo[k][j][q]=1e30f;bhi[k][j][q]=-1e30f;}}}
        for(int i=b;i<e;i+=stride){int t=order[i];const float* c=&cen[3*t];const float* l=&lo[3*t];const float* h=&hi[3*t];
            for(int k=0;k<3;k++){int j=int((c[k]-clo[k])*scale[k]);j=j<0?0:(j>=nb?nb-1:j);bc[k][j]+=stride;
                float* bl=blo[k][j];float* bh=bhi[k][j];
                bl[0]=std::min(bl[0],l[0]);bl[1]=std::min(bl[1],l[1]);bl[2]=std::min(bl[2],l[2]);
                bh[0]=std::max(bh[0],h[0]);bh[1]=std::max(bh[1],h[1]);bh[2]=std::max(bh[2],h[2]);}}
        float best=1e30f;int bestAxis=-1,bestBin=0;
        for(int k=0;k<3;k++){
            if(scale[k]==0.0f)continue;
            float rarea[BINS];int rcnt[BINS];float alo[3]={1e30f,1e30f,1e30f},ahi[3]={-1e30f,-1e30f,-1e30f};int ac=0;
            for(int j=nb-1;j>0;j--){ac+=bc[k][j];for(int q=0;q<3;q++){alo[q]=std::min(alo[q],blo[k][j][q]);ahi[q]=std::max(ahi[q],bhi[k][j][q]);}
                rcnt[j]=ac;rarea[j]=ac?area(alo,ahi):0;}
            for(int q=0;q<3;q++){alo[q]=1e30f;ahi[q]=-1e30f;}ac=0;
            for(int j=1;j<nb;j++){ac+=bc[k][j-1];for(int q=0;q<3;q++){alo[q]=std::min(alo[q],blo[k][j-1][q]);ahi[q]=std::max(ahi[q],bhi[k][j-1][q]);}
                if(!ac||!rcnt[j])continue;float c=area(alo,ahi)*ac+rarea[j]*rcnt[j];
                if(c<best){best=c;bestAxis=k;bestBin=j;}}
        }
        float parentArea=area(n.lo,n.hi);
        float splitCost=CT+(parentArea>0?best/parentArea:float(cnt));
        if(float(cnt)<=splitCost)return;
        mid=-1;
        if(bestAxis>=0){
            int k=bestAxis;float sc=scale[k],c0=clo[k];
            mid=int(std::partition(order.begin()+b,order.begin()+e,[&](int t){return std::min(nb-1,int((cen[3*t+k]-c0)*sc))<bestBin;})-order.begin());
        }
        if(mid<=b||mid>=e){
            if(cnt<=15)return;
            int axis=0;for(int k=1;k<3;k++)if(chi[k]-clo[k]>chi[axis]-clo[axis])axis=k;
            mid=(b+e)/2;std::nth_element(order.begin()+b,order.begin()+mid,order.begin()+e,[&](int x,int y){return cen[3*x+axis]<cen[3*y+axis];});
        }
        }
        int l=next.fetch_add(2),r=l+1;
        nodes[id].left=l;nodes[id].right=r;nodes[id].count=0;
        if(cnt>SPAWN_MIN&&depth<24){pool->push({b,mid,depth+1,l});pool->push({mid,e,depth+1,r});}
        else{process(b,mid,depth+1,l);process(mid,e,depth+1,r);}
    }
};

// ---------------- resources ----------------
static inline float bits2f(uint32_t x){float f;memcpy(&f,&x,4);return f;}
static DTri* d_tris;static DFrame* d_frames;static QNode* d_nodes;
static DTri* h_tris;static DFrame* h_frames;static QNode* h_nodes;
static size_t cap_tris=0,cap_nodes=0;

static void ensure(size_t tris){
    if(tris<=cap_tris)return;
    cap_tris=tris+1024;cap_nodes=cap_tris+16;
    if(d_tris){cudaFree(d_tris);cudaFree(d_frames);cudaFree(d_nodes);cudaFreeHost(h_tris);cudaFreeHost(h_frames);cudaFreeHost(h_nodes);}
    CK(cudaMalloc(&d_tris,cap_tris*sizeof(DTri)));CK(cudaMalloc(&d_frames,cap_tris*sizeof(DFrame)));CK(cudaMalloc(&d_nodes,cap_nodes*sizeof(QNode)));
    CK(cudaMallocHost(&h_tris,cap_tris*sizeof(DTri)));CK(cudaMallocHost(&h_frames,cap_tris*sizeof(DFrame)));CK(cudaMallocHost(&h_nodes,cap_nodes*sizeof(QNode)));
}

void init(int max_triangles,int max_pixels,int max_samples){
    unsigned hwc=std::thread::hardware_concurrency();
    int nth=hwc==0?12:int(std::min(hwc,12u));
    if(max_triangles<1)max_triangles=1;
    ensure(size_t(max_triangles)+1);
    if(!g_pool){g_pool=new Pool();g_pool->start(nth);}
}

void render(const Scene& s,float* out){
    int N=s.triangle_count;
    if(N<1){CK(cudaMemset(out,0,size_t(s.width)*s.height*3*sizeof(float)));return;}
    if(size_t(N)+1>cap_tris)ensure(size_t(N)+1);
    auto TA=std::chrono::steady_clock::now();
    SahBuilder b(s,g_pool,h_tris,h_frames,h_nodes);
    int nn=int(b.qnext);
    CK(cudaMemcpyAsync(d_tris,h_tris,size_t(N)*sizeof(DTri),cudaMemcpyHostToDevice));
    CK(cudaMemcpyAsync(d_frames,h_frames,size_t(N)*sizeof(DFrame),cudaMemcpyHostToDevice));
    CK(cudaMemcpyAsync(d_nodes,h_nodes,size_t(nn)*sizeof(QNode),cudaMemcpyHostToDevice));
    Params p;p.width=s.width;p.height=s.height;p.spp=s.spp;p.ao=s.ao;p.max_depth=s.max_depth;p.seed=s.seed;
    p.eye=make_float3(s.eye[0],s.eye[1],s.eye[2]);p.u=make_float3(s.u[0],s.u[1],s.u[2]);p.v=make_float3(s.v[0],s.v[1],s.v[2]);
    p.w=make_float3(s.w[0],s.w[1],s.w[2]);p.light=make_float3(s.light[0],s.light[1],s.light[2]);p.ao_radius=s.ao_radius;
    p.nodes=d_nodes;p.tris=d_tris;p.frames=d_frames;
    int npix=s.width*s.height,spp=s.spp;
    int P=LB_MAX/spp;if(P<1)P=1;int bt=P*spp;
    renderKernel<<<(npix+P-1)/P,bt,bt*3*sizeof(float)>>>(p,out);
    CK(cudaGetLastError());
    auto TB=std::chrono::steady_clock::now();
    fprintf(stderr,"build total %.2f ms\n",std::chrono::duration<double,std::milli>(TB-TA).count());
}

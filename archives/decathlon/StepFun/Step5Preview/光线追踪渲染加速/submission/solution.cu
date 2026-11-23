// GPU ray tracing acceleration: parallel SAH BVH build + per-pixel sample accumulation kernel.
#include "rt.h"
#include <cuda_runtime.h>
#include <cstdio>
#include <cstdlib>
#include <cmath>
#include <vector>
#include <algorithm>
#include <thread>
#include <atomic>
#include <array>
#include <cstdint>
#include <cstring>

static inline float i2f(int v){float f;memcpy(&f,&v,sizeof(float));return f;}
static inline int f2i(float v){int i;memcpy(&i,&v,sizeof(int));return i;}

#define CK(e) do{cudaError_t _e=(e); if(_e!=cudaSuccess){fprintf(stderr,"sol: %s\n",cudaGetErrorString(_e)); std::exit(2);} }while(0)

namespace {

// ---------------- device layouts ----------------
struct GNode { float4 a; float4 b; };   // a.xyz = lo, a.w = left child (interior) / first prim (leaf)
                                        // b.xyz = hi, b.w = prim count (0 => interior, right = left+1)
struct Tri { float4 v0; float4 e1; float4 e2; };
struct Col { float4 c; };               // rgb = color, w = mirror

Tri*   d_tri   = nullptr;
Col*   d_col   = nullptr;
GNode* d_nodes = nullptr;
Tri*   h_tri   = nullptr;
Col*   h_col   = nullptr;
GNode* h_nodes = nullptr;
long long g_capTri = 0;
int g_threads = 8;

#define LEAF 4
#define BINS 16
#define MAXDEPTH 48
#define TARGET_SUBS 48

// ---------------- device helpers ----------------
__device__ __forceinline__ uint32_t mix32d(uint32_t x){x^=x>>16;x*=0x7feb352du;x^=x>>15;x*=0x846ca68bu;return x^(x>>16);}
__device__ __forceinline__ float sampled(uint32_t x){return float(mix32d(x)>>8)*(1.0f/16777216.0f);}

__device__ __forceinline__ float3 cross3(float3 a,float3 b){
    return make_float3(a.y*b.z-a.z*b.y, a.z*b.x-a.x*b.z, a.x*b.y-a.y*b.x);
}
__device__ __forceinline__ float dot3(float3 a,float3 b){return a.x*b.x+a.y*b.y+a.z*b.z;}
__device__ __forceinline__ float3 norm3(float3 v){
    float s=rsqrtf(dot3(v,v)); return make_float3(v.x*s,v.y*s,v.z*s);
}
__device__ __forceinline__ float3 invdir3(float3 d){
    return make_float3(fabsf(d.x)<1e-30f?1e30f:1.0f/d.x,
                       fabsf(d.y)<1e-30f?1e30f:1.0f/d.y,
                       fabsf(d.z)<1e-30f?1e30f:1.0f/d.z);
}

__device__ __forceinline__ bool slab(const GNode* __restrict__ nd,const float3& o,const float3& invd,float tmax,float& tenter){
    float ax=(nd->a.x-o.x)*invd.x, bx=(nd->b.x-o.x)*invd.x;
    float ay=(nd->a.y-o.y)*invd.y, by=(nd->b.y-o.y)*invd.y;
    float az=(nd->a.z-o.z)*invd.z, bz=(nd->b.z-o.z)*invd.z;
    float t0=fmaxf(fminf(ax,bx),fmaxf(fminf(ay,by),fminf(az,bz)));
    float t1=fminf(fmaxf(ax,bx),fminf(fmaxf(ay,by),fmaxf(az,bz)));
    if(t0>t1||t1<0.0f||t0>tmax) return false;
    tenter=t0; return true;
}

__device__ __forceinline__ bool triHit(const Tri& tr,const float3& o,const float3& d,float tmax,float& tt){
    float3 e2=make_float3(tr.e2.x,tr.e2.y,tr.e2.z);
    float3 e1=make_float3(tr.e1.x,tr.e1.y,tr.e1.z);
    float3 p=cross3(d,e2);
    float det=dot3(e1,p);
    if(fabsf(det)<1e-10f) return false;
    float inv=1.0f/det;
    float3 s=make_float3(o.x-tr.v0.x,o.y-tr.v0.y,o.z-tr.v0.z);
    float u=dot3(s,p)*inv;
    if(u<0.0f||u>1.0f) return false;
    float3 q=cross3(s,e1);
    float v=dot3(d,q)*inv;
    if(v<0.0f||u+v>1.0f) return false;
    float t2=dot3(e2,q)*inv;
    if(t2<=0.0002f||t2>=tmax) return false;
    tt=t2; return true;
}

__device__ __forceinline__ float traverseClosest(const GNode* __restrict__ nodes,const Tri* __restrict__ tris,
                                                 const float3& o,const float3& d,const float3& invd,float tmax,int& hitId){
    int stack[64]; int sp=0; stack[sp++]=0;
    float t=tmax; hitId=-1;
    while(sp){
        int ni=stack[--sp];
        float te;
        if(!slab(&nodes[ni],o,invd,t,te)) continue;
        int cnt=__float_as_int(nodes[ni].b.w);
        if(cnt){
            int st=__float_as_int(nodes[ni].a.w);
            for(int i=0;i<cnt;i++){
                float tt;
                if(triHit(tris[st+i],o,d,t,tt)){t=tt;hitId=st+i;}
            }
        }else{
            int l=__float_as_int(nodes[ni].a.w);
            float tl,tr2;
            bool bl=slab(&nodes[l],o,invd,t,tl);
            bool br=slab(&nodes[l+1],o,invd,t,tr2);
            if(bl&&br){ if(tl<=tr2){stack[sp++]=l+1;stack[sp++]=l;} else {stack[sp++]=l;stack[sp++]=l+1;} }
            else if(bl) stack[sp++]=l;
            else if(br) stack[sp++]=l+1;
        }
    }
    return t;
}

__device__ __forceinline__ bool traverseBlocked(const GNode* __restrict__ nodes,const Tri* __restrict__ tris,
                                                const float3& o,const float3& d,const float3& invd,float tmax){
    int stack[64]; int sp=0; stack[sp++]=0;
    while(sp){
        int ni=stack[--sp];
        float te;
        if(!slab(&nodes[ni],o,invd,tmax,te)) continue;
        int cnt=__float_as_int(nodes[ni].b.w);
        if(cnt){
            int st=__float_as_int(nodes[ni].a.w);
            for(int i=0;i<cnt;i++){
                float tt;
                if(triHit(tris[st+i],o,d,tmax,tt)) return true;
            }
        }else{
            int l=__float_as_int(nodes[ni].a.w);
            float tl,tr2;
            bool bl=slab(&nodes[l],o,invd,tmax,tl);
            bool br=slab(&nodes[l+1],o,invd,tmax,tr2);
            if(bl) stack[sp++]=l;
            if(br) stack[sp++]=l+1;
        }
    }
    return false;
}

__global__ __launch_bounds__(256) void renderKernel(Scene s,const GNode* __restrict__ nodes,
        const Tri* __restrict__ tris,const Col* __restrict__ cols,float* __restrict__ out,int px0,int px1){
    int p=px0+(int)(blockIdx.x*blockDim.x+threadIdx.x);
    if(p>=px1) return;
    const int W=s.width,H=s.height;
    const unsigned seed=s.seed;
    const int spp=s.spp,ao=s.ao,maxd=s.max_depth;
    const float aorad=s.ao_radius;
    float3 eye=make_float3(s.eye[0],s.eye[1],s.eye[2]);
    float3 U=make_float3(s.u[0],s.u[1],s.u[2]);
    float3 Vv=make_float3(s.v[0],s.v[1],s.v[2]);
    float3 Wv=make_float3(s.w[0],s.w[1],s.w[2]);
    float3 light=norm3(make_float3(s.light[0],s.light[1],s.light[2]));
    float3 invdl=invdir3(light);
    const int px=p%W, py=p/W;
    float3 acc=make_float3(0.f,0.f,0.f);
    for(int sid=0;sid<spp;sid++){
        uint32_t key=seed+(uint32_t)p*0x9e3779b9u+(uint32_t)sid*0x85ebca6bu;
        float sx=sampled(key);
        float sy=sampled(key^0xa511e9b3u);
        float x=((float)px+sx)/(float)W*2.0f-1.0f;
        float y=1.0f-((float)py+sy)/(float)H*2.0f;
        float3 rd=norm3(make_float3(Wv.x+U.x*x+Vv.x*y, Wv.y+U.y*x+Vv.y*y, Wv.z+U.z*x+Vv.z*y));
        float3 ro=eye;
        float3 result=make_float3(0.f,0.f,0.f);
        float3 through=make_float3(1.f,1.f,1.f);
        for(int depth=0;depth<maxd;depth++){
            int id;
            float t=traverseClosest(nodes,tris,ro,rd,invdir3(rd),1e20f,id);
            if(id<0){
                float a=0.5f*(rd.y+1.0f);
                result.x+=through.x*(0.95f*(1.0f-a)+0.40f*a);
                result.y+=through.y*(0.93f*(1.0f-a)+0.55f*a);
                result.z+=through.z*(0.95f*(1.0f-a)+0.85f*a);
                break;
            }
            const Tri& tr=tris[id];
            float3 n=norm3(cross3(make_float3(tr.e1.x,tr.e1.y,tr.e1.z),make_float3(tr.e2.x,tr.e2.y,tr.e2.z)));
            float ndd=dot3(n,rd);
            if(ndd>0.0f){n.x=-n.x;n.y=-n.y;n.z=-n.z;ndd=-ndd;}
            float3 pp=make_float3(ro.x+rd.x*t+n.x*0.001f, ro.y+rd.y*t+n.y*0.001f, ro.z+rd.z*t+n.z*0.001f);
            float cosine=dot3(n,light); if(cosine<0.0f) cosine=0.0f;
            float visible=0.0f;
            if(cosine>0.0f){
                if(!traverseBlocked(nodes,tris,pp,light,invdl,1e20f)) visible=1.0f;
            }
            int open=0;
            if(ao){
                float3 axis=fabsf(n.z)<0.8f?make_float3(0.f,0.f,1.f):make_float3(0.f,1.f,0.f);
                float3 tx=norm3(cross3(axis,n));
                float3 ty=cross3(n,tx);
                for(int a=0;a<ao;a++){
                    uint32_t k2=seed+(uint32_t)p*0x9e3779b9u+(uint32_t)sid*0x85ebca6bu+(uint32_t)depth*0xc2b2ae35u+(uint32_t)a*0x27d4eb2du;
                    float x2=2.0f*sampled(k2^0x68bc21ebu)-1.0f;
                    float y2=2.0f*sampled(k2^0x02e5be93u)-1.0f;
                    float z2=0.25f+0.75f*sampled(k2^0x967a889bu);
                    float3 dir=norm3(make_float3(tx.x*x2+ty.x*y2+n.x*z2, tx.y*x2+ty.y*y2+n.y*z2, tx.z*x2+ty.z*y2+n.z*z2));
                    if(!traverseBlocked(nodes,tris,pp,dir,invdir3(dir),aorad)) open++;
                }
            }
            float ambient=ao?((float)open/(float)ao):1.0f;
            float value=0.08f+0.20f*ambient+0.72f*cosine*visible;
            const Col& cl=cols[id];
            float mir=cl.c.w;
            float sc=value*(1.0f-mir);
            result.x+=through.x*cl.c.x*sc;
            result.y+=through.y*cl.c.y*sc;
            result.z+=through.z*cl.c.z*sc;
            through.x*=mir; through.y*=mir; through.z*=mir;
            if(mir==0.0f) break;
            float3 nd=make_float3(rd.x-n.x*(2.0f*ndd), rd.y-n.y*(2.0f*ndd), rd.z-n.z*(2.0f*ndd));
            rd=norm3(nd); ro=pp;
        }
        acc.x+=result.x; acc.y+=result.y; acc.z+=result.z;
    }
    float inv=1.0f/(float)spp;
    out[3*(size_t)p]=acc.x*inv;
    out[3*(size_t)p+1]=acc.y*inv;
    out[3*(size_t)p+2]=acc.z*inv;
}

// ---------------- CPU BVH builder (parallel) ----------------
struct Builder {
    const Triangle* T; int N;
    std::vector<float> blo,bhi,cen;
    std::vector<int> prim;
    std::vector<GNode> nodes;
    int c1=0;

    struct Sub { int b,e,node,base; };

    static inline float area3(const float* a,const float* b){
        float x=b[0]-a[0],y=b[1]-a[1],z=b[2]-a[2];return x*y+y*z+z*x;
    }
    inline void setNode(int id,int b,int e){
        float lo[3]={1e30f,1e30f,1e30f},hi[3]={-1e30f,-1e30f,-1e30f};
        for(int i=b;i<e;i++){int t=prim[i];
            for(int k=0;k<3;k++){lo[k]=std::min(lo[k],blo[3*t+k]);hi[k]=std::max(hi[k],bhi[3*t+k]);}}
        const float pad=1e-4f;
        GNode n;
        n.a=make_float4(lo[0]-pad,lo[1]-pad,lo[2]-pad,i2f(b));
        n.b=make_float4(hi[0]+pad,hi[1]+pad,hi[2]+pad,i2f(e-b));
        nodes[id]=n;
    }
    inline void setInterior(int id,int l){
        nodes[id].a.w=i2f(l); nodes[id].b.w=0.0f;
    }
    bool findSplit(int b,int e,int& midOut){
        float clo[3]={1e30f,1e30f,1e30f},chi[3]={-1e30f,-1e30f,-1e30f};
        for(int i=b;i<e;i++){int t=prim[i];for(int k=0;k<3;k++){
            clo[k]=std::min(clo[k],cen[3*t+k]);chi[k]=std::max(chi[k],cen[3*t+k]);}}
        float best=1e30f;int bestAxis=-1,bestBin=0;
        for(int k=0;k<3;k++){
            float ext=chi[k]-clo[k]; if(ext<1e-9f) continue;
            int bc[BINS]={0}; float blo2[BINS][3],bhi2[BINS][3];
            for(int j=0;j<BINS;j++)for(int q=0;q<3;q++){blo2[j][q]=1e30f;bhi2[j][q]=-1e30f;}
            float scale=(float)BINS/ext*(1.0f-1e-6f);
            for(int i=b;i<e;i++){int t=prim[i];
                int j=std::min(BINS-1,int((cen[3*t+k]-clo[k])*scale));
                bc[j]++;
                for(int q=0;q<3;q++){blo2[j][q]=std::min(blo2[j][q],blo[3*t+q]);bhi2[j][q]=std::max(bhi2[j][q],bhi[3*t+q]);}}
            float rarea[BINS];int rcnt[BINS];
            float alo[3]={1e30f,1e30f,1e30f},ahi[3]={-1e30f,-1e30f,-1e30f};int ac=0;
            for(int j=BINS-1;j>0;j--){ac+=bc[j];
                for(int q=0;q<3;q++){alo[q]=std::min(alo[q],blo2[j][q]);ahi[q]=std::max(ahi[q],bhi2[j][q]);}
                rcnt[j]=ac;rarea[j]=ac?area3(alo,ahi):0.0f;}
            for(int q=0;q<3;q++){alo[q]=1e30f;ahi[q]=-1e30f;}ac=0;
            for(int j=1;j<BINS;j++){ac+=bc[j-1];
                for(int q=0;q<3;q++){alo[q]=std::min(alo[q],blo2[j-1][q]);ahi[q]=std::max(ahi[q],bhi2[j-1][q]);}
                if(!ac||!rcnt[j])continue;
                float c=area3(alo,ahi)*(float)ac+rarea[j]*(float)rcnt[j];
                if(c<best){best=c;bestAxis=k;bestBin=j;}}
        }
        if(bestAxis<0) return false;
        int k=bestAxis;float ext=chi[k]-clo[k];
        float scale=(float)BINS/ext*(1.0f-1e-6f),c0=clo[k];
        int mid=int(std::partition(prim.begin()+b,prim.begin()+e,[&](int t){
            return std::min(BINS-1,int((cen[3*t+k]-c0)*scale))<bestBin;})-prim.begin());
        if(mid<=b||mid>=e) return false;
        midOut=mid; return true;
    }
    void buildRec(int b,int e,int id,int& cnt,int depth){
        int n=e-b;
        setNode(id,b,e);
        if(n<=LEAF||depth>=MAXDEPTH) return;
        int mid;
        if(!findSplit(b,e,mid)) return;
        int l=cnt++,r=cnt++;
        setInterior(id,l);
        buildRec(b,mid,l,cnt,depth+1);
        buildRec(mid,e,r,cnt,depth+1);
    }
    void topRec(int b,int e,int id,int depth,std::vector<Sub>& subs,int limit){
        int n=e-b;
        setNode(id,b,e);
        if(n<=LEAF||depth>=MAXDEPTH) { subs.push_back({b,e,id,0}); return; }
        if((int)subs.size()>=TARGET_SUBS||n<=limit){ subs.push_back({b,e,id,0}); return; }
        int mid;
        if(!findSplit(b,e,mid)){ subs.push_back({b,e,id,0}); return; }
        int l=c1++,r=c1++;
        setInterior(id,l);
        topRec(b,mid,l,depth+1,subs,limit);
        topRec(mid,e,r,depth+1,subs,limit);
    }
    void build(){
        blo.resize(3*(size_t)N);bhi.resize(3*(size_t)N);cen.resize(3*(size_t)N);prim.resize(N);
        for(int i=0;i<N;i++){const Triangle& t=T[i];
            for(int k=0;k<3;k++){float a=t.v0[k],b=t.v1[k],c=t.v2[k];
                float lo=std::min(a,std::min(b,c)),hi=std::max(a,std::max(b,c));
                blo[3*i+k]=lo;bhi[3*i+k]=hi;cen[3*i+k]=(lo+hi)*0.5f;}
            prim[i]=i;}
        size_t cap=(size_t)2*N+2*(size_t)TARGET_SUBS+64;
        nodes.resize(cap);
        if(N<20000||g_threads<=1){
            int cnt=1; buildRec(0,N,0,cnt,0); nodes.resize(cnt); return;
        }
        std::vector<Sub> subs;
        int limit=std::max(LEAF+1,N/TARGET_SUBS);
        topRec(0,N,0,0,subs,limit);
        int base=c1;
        for(size_t i=0;i<subs.size();i++){subs[i].base=base;base+=2*(subs[i].e-subs[i].b);}
        nodes.resize(std::min(cap,(size_t)base+8));
        std::atomic<int> next(0);
        int nt=g_threads;
        std::vector<std::thread> th;
        for(int w=0;w<nt;w++){
            th.emplace_back([&](){
                for(;;){
                    int i=next.fetch_add(1);
                    if(i>=(int)subs.size()) break;
                    Sub& s=subs[i];
                    int cnt=s.base;
                    buildRec(s.b,s.e,s.node,cnt,0);
                }
            });
        }
        for(auto& x:th) x.join();
    }
};

Tri*   g_dtri=nullptr;

} // namespace

void init(int max_triangles,int max_pixels,int max_samples){
    (void)max_pixels;(void)max_samples;
    g_capTri=max_triangles;
    CK(cudaMalloc(&d_tri,sizeof(Tri)*(size_t)max_triangles));
    CK(cudaMalloc(&d_col,sizeof(Col)*(size_t)max_triangles));
    CK(cudaMalloc(&d_nodes,sizeof(GNode)*((size_t)2*max_triangles+2*TARGET_SUBS+256)));
    CK(cudaMallocHost(&h_tri,sizeof(Tri)*(size_t)max_triangles));
    CK(cudaMallocHost(&h_col,sizeof(Col)*(size_t)max_triangles));
    CK(cudaMallocHost(&h_nodes,sizeof(GNode)*((size_t)2*max_triangles+2*TARGET_SUBS+256)));
    unsigned n=std::thread::hardware_concurrency();
    if(n<1)n=1; if(n>12)n=12;
    g_threads=(int)n;
}

void render(const Scene& s,float* out){
    int N=s.triangle_count;
    Builder B; B.T=s.triangles; B.N=N; B.build();
    // permute triangle data into BVH leaf order
    for(int i=0;i<N;i++){
        int t=B.prim[i]; const Triangle& q=s.triangles[t];
        h_tri[i].v0=make_float4(q.v0[0],q.v0[1],q.v0[2],0.f);
        h_tri[i].e1=make_float4(q.v1[0]-q.v0[0],q.v1[1]-q.v0[1],q.v1[2]-q.v0[2],0.f);
        h_tri[i].e2=make_float4(q.v2[0]-q.v0[0],q.v2[1]-q.v0[1],q.v2[2]-q.v0[2],0.f);
        h_col[i].c=make_float4(q.color[0],q.color[1],q.color[2],q.mirror);
    }
    int ncount=(int)B.nodes.size();
    memcpy(h_nodes,B.nodes.data(),sizeof(GNode)*(size_t)ncount);
    CK(cudaMemcpyAsync(d_tri,h_tri,sizeof(Tri)*(size_t)N,cudaMemcpyHostToDevice));
    CK(cudaMemcpyAsync(d_col,h_col,sizeof(Col)*(size_t)N,cudaMemcpyHostToDevice));
    CK(cudaMemcpyAsync(d_nodes,h_nodes,sizeof(GNode)*(size_t)ncount,cudaMemcpyHostToDevice));
    Scene d=s; d.triangles=nullptr;
    int pixels=s.width*s.height;
    const int CHUNK=1<<20;
    for(int px0=0;px0<pixels;px0+=CHUNK){
        int px1=std::min(pixels,px0+CHUNK);
        int blocks=(px1-px0+255)/256;
        renderKernel<<<blocks,256>>>(d,d_nodes,d_tri,d_col,out,px0,px1);
    }
    CK(cudaGetLastError());
}
